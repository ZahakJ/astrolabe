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
// Protocol (advanced serialization, so bytes travel as bytes):
//   parent → { id, model, audio: Uint8Array, ext, language }
//   child  → { id, text, language, backend } | { id, error, code }

import { createRequire } from "node:module";
import { decodeRecording, toPcm16 } from "./voiceAudio.ts";

interface Job {
  id: string;
  /** Absolute path of the GGML model file. */
  model: string;
  audio: Uint8Array;
  ext: string;
  language: "auto" | "ar" | "en";
}

type Whisper = {
  transcribeData(
    data: ArrayBuffer,
    options: { language: string; temperature: number; maxThreads: number },
  ): { stop(): Promise<void>; promise: Promise<{ result: string; language?: string }> };
  release(): Promise<void>;
};

const require = createRequire(import.meta.url);

/** GPU first, the CPU last. `ASTROLABE_WHISPER_GPU=off` pins the CPU — for a
 *  machine whose GPU is spoken for. CUDA is tried before Vulkan because it is
 *  the faster of the two where it loads at all; the prebuilt wants the CUDA 12
 *  runtime, and without it the addon refuses to load and Vulkan is next. */
function variants(): string[] {
  if (process.env.ASTROLABE_WHISPER_GPU === "off") return ["default"];
  if (process.platform === "darwin") return ["default"]; // Metal is in the default build
  return ["cuda", "vulkan", "default"];
}

/** Can this machine load that build? Asked by LOADING it: a missing shared
 *  library is a dlopen failure, and the package's own loader answers one by
 *  quietly falling back to the CPU build — which would then be cached as THE
 *  module, and the GPU never tried. */
function loadable(variant: string): boolean {
  const suffix = variant === "default" ? "" : `-${variant}`;
  const name = `@fugood/node-whisper-${process.platform}-${process.arch}${suffix}`;
  try {
    require(name);
    return true;
  } catch {
    return false;
  }
}

let loaded: { model: string; ctx: Whisper; backend: string } | null = null;

async function context(model: string): Promise<{ ctx: Whisper; backend: string }> {
  if (loaded && loaded.model === model) return loaded;
  if (loaded) {
    await loaded.ctx.release();
    loaded = null;
  }
  const whisper = (await import("@fugood/whisper.node")) as unknown as {
    initWhisper(options: { filePath: string; useGpu: boolean; useFlashAttn: boolean }, variant: string): Promise<Whisper>;
  };
  const variant = variants().find(loadable) ?? "default";
  const gpu = variant !== "default" || process.platform === "darwin";
  const ctx = await whisper.initWhisper({ filePath: model, useGpu: gpu, useFlashAttn: gpu }, variant);
  loaded = { model, ctx, backend: variant === "default" ? (gpu ? "metal" : "cpu") : variant };
  return loaded;
}

async function transcribe(job: Job): Promise<{ text: string; language: string | null; backend: string }> {
  const samples = await decodeRecording(job.audio, job.ext);
  if (samples.length < 16000 / 4) return { text: "", language: null, backend: loaded?.backend ?? "cpu" };
  const { ctx, backend } = await context(job.model);
  const pcm = toPcm16(samples);
  const { promise } = ctx.transcribeData(pcm.buffer as ArrayBuffer, {
    language: job.language,
    temperature: 0,
    // whisper.cpp's own ceiling is sensible; a GPU run barely uses them.
    maxThreads: 8,
  });
  const result = await promise;
  return { text: result.result, language: result.language ?? null, backend };
}

process.on("message", (message: Job) => {
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
