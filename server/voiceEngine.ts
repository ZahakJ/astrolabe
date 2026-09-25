// THE ENGINE — the model files and the transcriber's process (docs/capture.md
// "Voice"; the measurements behind every choice are in contracts/features.md,
// "Voice notes").
//
// Two engines read one model (shared/voice.ts VOICE_MODELS; server/voiceWorker.ts
// runs them): whisper.cpp on a GPU through @fugood/whisper.node, and
// sherpa-onnx on the processor. Both install as npm dependencies with no
// compiler, no Python and nothing global. The model is NOT in the repository
// and NOT in a package: it is fetched on first use into
// ASTROLABE_DATA/models/ — the data directory, never the vault, which is
// synced, published and committed — in the form the engine that runs it
// reads, and checked by size before it is trusted.
//
// WHICH ENGINE. `voice.backend` "cpu" → the processor, always. "auto" → the
// child is asked which GPU build this machine loads (once per server run);
// none → the processor. A GPU build that loads and then fails — will not
// initialise, finds no device, or takes the child down mid-job — marks the GPU
// as failed for the rest of this server's life, and the same job runs again on
// the processor. Nothing of that reaches the owner but the status line, which
// then says "on the processor".

import { fork, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, promises as fsp, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import {
  voiceModelBytes,
  voiceModelInfo,
  voiceThreads,
  type VoiceBackend,
  type VoiceEngineKind,
  type VoiceLanguage,
  type VoiceModelFile,
  type VoiceModelId,
} from "../shared/voice.ts";
import { dataDir } from "./site.ts";

const GGML_HOST = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";
const ONNX_HOST = "https://huggingface.co/csukuangfj";

/** A job that has not come back in this long is a stuck child. Generous: the
 *  floor (whisper.cpp's own CPU build, when sherpa-onnx cannot load) is
 *  minutes per minute of speech. */
const JOB_TIMEOUT_MS = 20 * 60 * 1000;

/** The child is ended after this long with nothing to do, and the model's
 *  memory with it. Long enough that a burst of notes loads it once. */
const IDLE_MS = 5 * 60 * 1000;

// ── The processor's thread count ─────────────────────────────────────────

/** Physical cores, from /proc/cpuinfo's (physical id, core id) pairs; null
 *  where there is no such file (macOS, Windows), and then voiceThreads halves
 *  the logical count. */
export function physicalCores(cpuinfo?: string): number | null {
  let text = cpuinfo;
  if (text === undefined) {
    try {
      text = readFileSync("/proc/cpuinfo", "utf8");
    } catch {
      return null;
    }
  }
  const cores = new Set<string>();
  let physical = "0";
  for (const line of text.split("\n")) {
    const m = /^(physical id|core id)\s*:\s*(\d+)/.exec(line);
    if (!m) continue;
    if (m[1] === "physical id") physical = m[2];
    else cores.add(`${physical}:${m[2]}`);
  }
  return cores.size > 0 ? cores.size : null;
}

/** What this process may use: `availableParallelism` honours the affinity a
 *  container or `taskset` sets, so a server pinned to two cores gets two. */
export function engineThreads(): number {
  const logical = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
  return voiceThreads(logical, physicalCores());
}

// ── The model files ────────────────────────────────────────────────────────

export function modelsDir(): string {
  return path.join(dataDir(), "models", "whisper");
}

export function onnxDir(id: VoiceModelId): string {
  return path.join(dataDir(), "models", "whisper-onnx", voiceModelInfo(id).onnx.size);
}

/** The GGML file (the GPU's, and the floor's). */
export function modelPath(id: VoiceModelId): string {
  return path.join(modelsDir(), voiceModelInfo(id).file);
}

interface Fetchable {
  url: string;
  target: string;
  bytes: number;
}

function filesFor(id: VoiceModelId, engine: VoiceEngineKind): Fetchable[] {
  const info = voiceModelInfo(id);
  if (engine === "gpu") return [{ url: `${GGML_HOST}/${info.file}`, target: modelPath(id), bytes: info.bytes }];
  const repo = `${ONNX_HOST}/sherpa-onnx-whisper-${info.onnx.size}/resolve/main`;
  return info.onnx.files.map((f: VoiceModelFile) => ({ url: `${repo}/${f.file}`, target: path.join(onnxDir(id), f.file), bytes: f.bytes }));
}

function sizeOf(file: string): number {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
}

/** Bytes of the model on disk for that engine (finished files and partial
 *  downloads together). */
export function modelOnDisk(id: VoiceModelId, engine: VoiceEngineKind = "gpu"): number {
  let sum = 0;
  for (const f of filesFor(id, engine)) {
    const done = sizeOf(f.target);
    sum += done > 0 ? done : sizeOf(`${f.target}.part`);
  }
  return sum;
}

export function modelReady(id: VoiceModelId, engine: VoiceEngineKind = "gpu"): boolean {
  return filesFor(id, engine).every((f) => sizeOf(f.target) === f.bytes);
}

class EngineError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

async function fetchOne(f: Fetchable): Promise<void> {
  if (sizeOf(f.target) === f.bytes) return;
  await fsp.mkdir(path.dirname(f.target), { recursive: true });
  const part = `${f.target}.part`;
  let res: Response;
  try {
    res = await fetch(f.url, { redirect: "follow" });
  } catch (err) {
    throw new EngineError(`Could not reach the model host: ${String((err as Error).message ?? err)}`, "download");
  }
  if (!res.ok || !res.body) throw new EngineError(`The model host answered ${res.status}`, "download");
  await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(part));
  const size = (await fsp.stat(part)).size;
  if (size !== f.bytes) {
    await fsp.rm(part, { force: true });
    throw new EngineError(`The model arrived at ${size} bytes, not ${f.bytes}`, "download");
  }
  await fsp.rename(part, f.target);
}

const downloads = new Map<string, Promise<void>>();

/** The model's files for that engine, fetching them first when they are not
 *  there. One download per model and engine however many recordings are
 *  waiting for it; each file is written to `.part` and renamed only once
 *  every byte has arrived, so a download interrupted by a restart is never
 *  mistaken for a model. */
export function ensureModel(id: VoiceModelId, engine: VoiceEngineKind = "gpu"): Promise<void> {
  if (modelReady(id, engine)) return Promise.resolve();
  const key = `${engine}:${id}`;
  const running = downloads.get(key);
  if (running) return running;
  const job = (async () => {
    for (const f of filesFor(id, engine)) await fetchOne(f);
  })().finally(() => downloads.delete(key));
  downloads.set(key, job);
  return job;
}

export function downloading(id: VoiceModelId): boolean {
  return downloads.has(`gpu:${id}`) || downloads.has(`cpu:${id}`);
}

// ── The child ──────────────────────────────────────────────────────────────

/** The transcriber. A test points ASTROLABE_VOICE_WORKER at a stand-in that
 *  answers the protocol without a model (tests/voiceEngine.test.ts). */
function workerPath(): string {
  return process.env.ASTROLABE_VOICE_WORKER || fileURLToPath(new URL("./voiceWorker.ts", import.meta.url));
}

interface Reply {
  id: string;
  text?: string;
  language?: string | null;
  backend?: string;
  error?: string;
  code?: string;
}

let child: ChildProcess | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let lastBackend: string | null = null;
/** What the child said about the GPU builds: a backend name, or "cpu". */
let probed: string | null = null;
let probing: Promise<string> | null = null;
/** A GPU build loaded and then failed on this machine; the processor from
 *  now until the server restarts. */
let gpuFailed = false;
let seq = 0;
const waiting = new Map<string, { owner: ChildProcess; resolve: (r: Reply) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

function stopChild(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const c = child;
  child = null;
  if (c && c.exitCode === null) c.kill();
}

function spawnChild(): ChildProcess {
  if (child && child.exitCode === null && child.connected) return child;
  // The same Node that runs the server — in the desktop app that is
  // Electron's, with ELECTRON_RUN_AS_NODE inherited — type-stripping the same
  // way (`process.execArgv` carries the server's own flags).
  // whisper.cpp narrates every model load in forty lines on stderr. The
  // server's log is the owner's, so the narration is KEPT (the last forty
  // lines) and printed only if the child dies badly — which is the one time
  // anybody needs to read it.
  const c = fork(workerPath(), [], { serialization: "advanced", stdio: ["ignore", "ignore", "pipe", "ipc"] });
  const tail: string[] = [];
  c.stderr?.setEncoding("utf8");
  c.stderr?.on("data", (chunk: string) => {
    for (const line of chunk.split("\n")) if (line.trim()) tail.push(line);
    if (tail.length > 40) tail.splice(0, tail.length - 40);
  });
  c.on("message", (reply: Reply) => {
    const w = waiting.get(reply.id);
    if (!w) return;
    waiting.delete(reply.id);
    clearTimeout(w.timer);
    w.resolve(reply);
  });
  c.on("exit", (code, signal) => {
    if (child === c) child = null;
    if (code !== 0 && signal !== "SIGTERM") console.error(`voice: the transcriber stopped (${signal ?? code}):\n${tail.join("\n")}`);
    // Only this child's jobs: a child ended on purpose (a timeout, a reset)
    // exits after its successor may already hold the next job.
    for (const [id, w] of waiting) {
      if (w.owner !== c) continue;
      waiting.delete(id);
      clearTimeout(w.timer);
      w.reject(new EngineError(`The transcriber stopped (${signal ?? code})`, "engine"));
    }
  });
  child = c;
  return c;
}

function ask(message: Record<string, unknown>, timeoutMs: number): Promise<Reply> {
  if (idleTimer) clearTimeout(idleTimer);
  const c = spawnChild();
  const id = String(++seq);
  return new Promise<Reply>((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new EngineError("The transcription took too long", "timeout"));
      stopChild();
    }, timeoutMs);
    waiting.set(id, { owner: c, resolve, reject, timer });
    c.send({ ...message, id });
  }).finally(() => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(stopChild, IDLE_MS);
    idleTimer.unref();
  });
}

/** Which GPU build this machine loads ("cuda", "vulkan", "metal"), or "cpu".
 *  Asked of the child once per server run. */
export function probeGpu(): Promise<string> {
  if (probed !== null) return Promise.resolve(probed);
  probing ??= ask({ kind: "probe" }, 60_000)
    .then((r) => (probed = r.backend ?? "cpu"))
    .catch(() => (probed = "cpu"))
    .finally(() => (probing = null));
  return probing;
}

/** The engine a job will run on, as far as is known WITHOUT asking the
 *  child: null means "auto, and not asked yet". */
export function knownEngine(choice: VoiceBackend): VoiceEngineKind | null {
  if (choice === "cpu" || gpuFailed) return "cpu";
  if (probed === null) return null;
  return probed === "cpu" ? "cpu" : "gpu";
}

async function chooseEngine(choice: VoiceBackend): Promise<VoiceEngineKind> {
  const known = knownEngine(choice);
  if (known !== null) return known;
  return (await probeGpu()) === "cpu" ? "cpu" : "gpu";
}

/** Where the last job ran — the status line's "on the processor". */
export function engineBackend(): string | null {
  return lastBackend;
}

/** For the tests: forget what this server run has learned. */
export function resetEngine(): void {
  stopChild();
  lastBackend = null;
  probed = null;
  probing = null;
  gpuFailed = false;
}

/** Transcribe one recording in the child, on the backend the setting and the
 *  machine allow, falling back from a GPU that fails to the processor, and
 *  from a processor engine that will not load to the floor. */
export async function transcribeInChild(
  audio: Uint8Array,
  ext: string,
  model: VoiceModelId,
  language: VoiceLanguage,
  choice: VoiceBackend = "auto",
): Promise<{ text: string; language: string | null }> {
  let engine: VoiceEngineKind | "floor" = await chooseEngine(choice);
  const threads = engineThreads();
  for (let attempt = 0; attempt < 3; attempt++) {
    const files: VoiceEngineKind = engine === "cpu" ? "cpu" : "gpu";
    await ensureModel(model, files);
    const ggml = modelPath(model);
    if (files === "gpu" && !existsSync(ggml)) throw new EngineError("The model is missing", "download");
    let reply: Reply;
    try {
      reply = await ask(
        { kind: "job", engine, model: ggml, onnx: { dir: onnxDir(model), size: voiceModelInfo(model).onnx.size }, audio, ext, language, threads },
        JOB_TIMEOUT_MS,
      );
    } catch (err) {
      // A GPU job that took the child down is the GPU failing; the same
      // recording is heard again on the processor.
      if (engine === "gpu" && (err as EngineError).code === "engine") {
        gpuFailed = true;
        engine = "cpu";
        continue;
      }
      throw err;
    }
    if (reply.code === "gpu-unavailable") {
      gpuFailed = true;
      engine = "cpu";
      continue;
    }
    if (reply.code === "cpu-unavailable") {
      console.error(`voice: ${reply.error}; transcribing with whisper.cpp's own CPU build, which is slow`);
      engine = "floor";
      continue;
    }
    if (reply.backend) lastBackend = reply.backend;
    if (reply.error !== undefined) throw new EngineError(reply.error, reply.code ?? "engine");
    return { text: reply.text ?? "", language: reply.language ?? null };
  }
  throw new EngineError("No engine on this machine could transcribe", "engine");
}

/** For the engine route: what the next job will need on disk. */
export function engineFiles(model: VoiceModelId, choice: VoiceBackend): { engine: VoiceEngineKind | null; downloaded: number; bytes: number } {
  const engine = knownEngine(choice);
  const files: VoiceEngineKind = engine ?? "gpu";
  return { engine, downloaded: modelOnDisk(model, files), bytes: voiceModelBytes(model, files) };
}
