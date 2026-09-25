// THE TRANSCRIBER — a child process, forked by server/voiceEngine.ts.
//
// WHY A CHILD AND NOT A CALL. whisper.cpp is a native addon, and a native
// addon that faults takes its whole process with it: in the server's own
// process that is the vault, the editor's saves and every open session, gone
// because one recording decoded badly or a GPU driver hiccupped. In a child it
// is one failed job. The child is also how the memory comes BACK — a loaded
// model holds half a gigabyte of VRAM or RAM, and the parent ends the child
// after a few idle minutes, which frees all of it at once, on a card the owner
// may be sharing with a chat model.
//
// TWO ENGINES, ONE MODEL (shared/voice.ts VOICE_MODELS):
//
//   gpu    whisper.cpp through @fugood/whisper.node's Vulkan, CUDA or Metal
//          build, reading the GGML file.
//   cpu    sherpa-onnx (onnxruntime) reading the model's int8 ONNX export,
//          on `threads` threads — the processor's path, and the first-class
//          one: two cores hear a minute of speech in seconds.
//   floor  whisper.cpp's own CPU build, reading the GGML file. Only when
//          sherpa-onnx cannot load on this machine: the prebuilt uses one
//          thread and no SIMD, and is minutes per minute.
//
// A GPU that is not there is not an error the owner sees. A GPU build that
// will not load, will not initialise, or loads and finds no device (the
// Vulkan build on a machine with the loader and no driver says "no GPU found"
// and would quietly run the floor) answers `gpu-unavailable`, and the parent
// sends the same job to the processor.
//
// Protocol (advanced serialization, so bytes travel as bytes):
//   parent → { id, kind: "probe" }
//   child  → { id, backend }                       the GPU build that loads, or "cpu"
//   parent → { id, kind: "job", engine, model, audio, ext, language, threads }
//   child  → { id, text, language, backend } | { id, error, code }

import { createRequire } from "node:module";
import { decodeRecording, speechWindows, toPcm16, WHISPER_RATE } from "./voiceAudio.ts";

export type WorkerEngine = "gpu" | "cpu" | "floor";

interface Probe {
  id: string;
  kind: "probe";
}

interface Job {
  id: string;
  kind: "job";
  engine: WorkerEngine;
  /** gpu/floor: the GGML file. cpu: the ONNX directory and size name. */
  model: string;
  onnx?: { dir: string; size: string };
  audio: Uint8Array;
  ext: string;
  language: "auto" | "ar" | "en";
  threads: number;
}

type Whisper = {
  transcribeData(
    data: ArrayBuffer,
    options: { language: string; temperature: number; maxThreads: number },
  ): { stop(): Promise<void>; promise: Promise<{ result: string; language?: string }> };
  release(): Promise<void>;
};

type WhisperModule = {
  initWhisper(options: { filePath: string; useGpu: boolean; useFlashAttn: boolean }, variant: string): Promise<Whisper>;
  toggleNativeLog(enable: boolean): Promise<void>;
  addNativeLogListener(listener: (level: string, text: string) => void): { remove(): void };
};

const require = createRequire(import.meta.url);

class WorkerError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

/** The GPU builds to ask, fastest first. CUDA before Vulkan because it is the
 *  faster of the two where it loads at all; the prebuilt wants the CUDA 12
 *  runtime, and without it the addon refuses to load and Vulkan is next. On
 *  a Mac the default build IS the Metal one. `ASTROLABE_WHISPER_GPU=off`
 *  (the old switch, still honoured) asks none. */
function gpuVariants(): string[] {
  if (process.env.ASTROLABE_WHISPER_GPU === "off") return [];
  if (process.platform === "darwin") return ["default"];
  return ["cuda", "vulkan"];
}

/** Can this machine load that build? Asked by LOADING it: a missing shared
 *  library is a dlopen failure, and the package's own loader answers one by
 *  quietly falling back to the CPU build — which would then be cached as THE
 *  module, and the GPU never tried. `ASTROLABE_WHISPER_FAIL_GPU=1` makes every
 *  GPU build refuse, which is how tests/voiceEngine.test.ts forces the
 *  fallback on a machine that has a GPU. */
function loadable(variant: string): boolean {
  if (process.env.ASTROLABE_WHISPER_FAIL_GPU === "1") return false;
  const suffix = variant === "default" ? "" : `-${variant}`;
  try {
    require(`@fugood/node-whisper-${process.platform}-${process.arch}${suffix}`);
    return true;
  } catch {
    return false;
  }
}

function backendName(variant: string): string {
  return variant === "default" ? "metal" : variant;
}

let gpuVariant: string | null | undefined;

/** The GPU build this machine loads, or null. Asked once per child. */
function probeGpu(): string | null {
  if (gpuVariant === undefined) gpuVariant = gpuVariants().find(loadable) ?? null;
  return gpuVariant;
}

// ── whisper.cpp (the GPU, and the floor) ───────────────────────────────────

let whisperMod: WhisperModule | null = null;
let loaded: { key: string; ctx: Whisper; backend: string } | null = null;

async function releaseLoaded(): Promise<void> {
  if (loaded) {
    await loaded.ctx.release();
    loaded = null;
  }
}

async function whisperContext(model: string, engine: "gpu" | "floor"): Promise<{ ctx: Whisper; backend: string }> {
  const key = `${engine}:${model}`;
  if (loaded && loaded.key === key) return loaded;
  await releaseLoaded();
  await releaseSherpa();
  whisperMod ??= (await import("@fugood/whisper.node")) as unknown as WhisperModule;
  if (engine === "floor") {
    // The CPU build, and on a Mac the Metal build told not to use the GPU.
    const ctx = await whisperMod.initWhisper({ filePath: model, useGpu: false, useFlashAttn: false }, "default");
    loaded = { key, ctx, backend: "cpu" };
    return loaded;
  }
  const variant = probeGpu();
  if (variant === null) throw new WorkerError("No GPU build loads on this machine", "gpu-unavailable");
  // whisper.cpp says which device it took in its log, and a build that
  // loaded with no device to use says "no GPU found" and carries on on the
  // floor — which is not a GPU and not the processor's real path.
  // The log arrives on the event loop AFTER the init has resolved (it is
  // posted from the native thread), so the verdict line is waited for — "using
  // <device> backend" or "no GPU found" — for up to two seconds; a build whose
  // log never says is taken at its word.
  let verdict: "gpu" | "none" | null = null;
  let heard: () => void = () => {};
  const said = new Promise<void>((resolve) => (heard = resolve));
  const listener = whisperMod.addNativeLogListener((_level, text) => {
    if (verdict !== null || !/whisper_backend_init_gpu/.test(text)) return;
    if (/no GPU found/i.test(text)) verdict = "none";
    else if (/using .* backend/i.test(text)) verdict = "gpu";
    if (verdict !== null) heard();
  });
  await whisperMod.toggleNativeLog(true);
  let ctx: Whisper;
  try {
    ctx = await whisperMod.initWhisper({ filePath: model, useGpu: true, useFlashAttn: true }, variant);
    await Promise.race([said, new Promise((r) => setTimeout(r, 2000))]);
  } catch (err) {
    throw new WorkerError(`The ${backendName(variant)} build did not start: ${String((err as Error)?.message ?? err)}`, "gpu-unavailable");
  } finally {
    listener.remove();
    await whisperMod.toggleNativeLog(false);
  }
  if (verdict === "none") {
    await ctx.release();
    throw new WorkerError(`The ${backendName(variant)} build found no GPU`, "gpu-unavailable");
  }
  loaded = { key, ctx, backend: backendName(variant) };
  return loaded;
}

/** A transcript from windows: the words in order, and the language most of
 *  the recording's time was heard in. */
function joinWindows(heard: Array<{ text: string; lang: string | null | undefined; samples: number }>, pinned: Job["language"]) {
  const languages = new Map<string, number>();
  for (const h of heard) if (h.lang) languages.set(h.lang, (languages.get(h.lang) ?? 0) + h.samples);
  const language = [...languages].sort((a, b) => b[1] - a[1])[0]?.[0] ?? (pinned === "auto" ? null : pinned);
  return { text: heard.map((h) => h.text.trim()).filter(Boolean).join(" "), language };
}

/** whisper.cpp, a window at a time. It could walk a long recording itself,
 *  but it detects the language ONCE, from the first thirty seconds, and then
 *  hears everything as that language: a note that starts in English and goes
 *  on in Arabic came back as English words looping over the Arabic (the large
 *  turbo on a GPU: 87% of the words wrong on a two-minute mixed note; heard
 *  window by window, 7%). */
async function transcribeWhisper(job: Job, samples: Float32Array, engine: "gpu" | "floor") {
  const { ctx, backend } = await whisperContext(job.model, engine);
  const heard: Array<{ text: string; lang: string | null | undefined; samples: number }> = [];
  for (const [from, to] of speechWindows(samples)) {
    const { promise } = ctx.transcribeData(toPcm16(samples.subarray(from, to)).buffer as ArrayBuffer, {
      language: job.language,
      temperature: 0,
      maxThreads: job.threads,
    });
    const result = await promise;
    heard.push({ text: result.result, lang: result.language, samples: to - from });
  }
  return { ...joinWindows(heard, job.language), backend };
}

// ── sherpa-onnx (the processor) ────────────────────────────────────────────

type SherpaStream = { acceptWaveform(w: { sampleRate: number; samples: Float32Array }): void };
type SherpaRecognizer = {
  createStream(): SherpaStream;
  decode(stream: SherpaStream): void;
  getResult(stream: SherpaStream): { text: string; lang?: string };
};

let sherpa: { key: string; rec: SherpaRecognizer } | null = null;

async function releaseSherpa(): Promise<void> {
  // onnxruntime frees a session when it is collected; dropping the last
  // reference is the release. The child's idle exit frees the rest.
  sherpa = null;
}

function sherpaRecognizer(job: Job): SherpaRecognizer {
  const onnx = job.onnx;
  if (!onnx) throw new WorkerError("No ONNX model was sent", "engine");
  // One recognizer per model, thread count and pinned language: whisper's
  // language is fixed when the recognizer is made, and "" asks it to detect.
  const language = job.language === "auto" ? "" : job.language;
  const key = `${onnx.dir}|${onnx.size}|${job.threads}|${language}`;
  if (sherpa && sherpa.key === key) return sherpa.rec;
  let mod: { OfflineRecognizer: new (config: unknown) => SherpaRecognizer };
  try {
    mod = require("sherpa-onnx-node");
  } catch (err) {
    throw new WorkerError(`sherpa-onnx does not load here: ${String((err as Error)?.message ?? err)}`, "cpu-unavailable");
  }
  const file = (name: string): string => `${onnx.dir}/${onnx.size}-${name}`;
  const rec = new mod.OfflineRecognizer({
    featConfig: { sampleRate: WHISPER_RATE, featureDim: 80 },
    modelConfig: {
      whisper: { encoder: file("encoder.int8.onnx"), decoder: file("decoder.int8.onnx"), language, task: "transcribe" },
      tokens: file("tokens.txt"),
      numThreads: job.threads,
      provider: "cpu",
      debug: 0,
    },
  });
  sherpa = { key, rec };
  return rec;
}

async function transcribeSherpa(job: Job, samples: Float32Array) {
  await releaseLoaded();
  const rec = sherpaRecognizer(job);
  const heard: Array<{ text: string; lang: string | null | undefined; samples: number }> = [];
  for (const [from, to] of speechWindows(samples)) {
    const stream = rec.createStream();
    stream.acceptWaveform({ sampleRate: WHISPER_RATE, samples: samples.subarray(from, to) });
    rec.decode(stream);
    const r = rec.getResult(stream);
    heard.push({ text: r.text, lang: r.lang, samples: to - from });
  }
  return { ...joinWindows(heard, job.language), backend: "cpu" };
}

// ── The loop ───────────────────────────────────────────────────────────────

async function transcribe(job: Job): Promise<{ text: string; language: string | null; backend: string }> {
  const samples = await decodeRecording(job.audio, job.ext);
  const backend = job.engine === "gpu" ? (backendName(probeGpu() ?? "cpu")) : "cpu";
  if (samples.length < WHISPER_RATE / 4) return { text: "", language: null, backend };
  if (job.engine === "cpu") return transcribeSherpa(job, samples);
  return transcribeWhisper(job, samples, job.engine);
}

process.on("message", (message: Probe | Job) => {
  if (message.kind === "probe") {
    const variant = probeGpu();
    process.send?.({ id: message.id, backend: variant === null ? "cpu" : backendName(variant) });
    return;
  }
  void transcribe(message).then(
    (out) => process.send?.({ id: message.id, ...out }),
    (err: unknown) => {
      const code = (err as { code?: unknown })?.code;
      process.send?.({ id: message.id, error: String((err as Error)?.message ?? err), code: typeof code === "string" ? code : "engine" });
    },
  );
});

// The parent going away takes the child with it: an orphaned transcriber
// holding a GPU is exactly the thing this process boundary exists to prevent.
process.on("disconnect", () => process.exit(0));
