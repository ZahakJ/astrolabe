// THE ENGINE — the model file and the transcriber's process (docs/capture.md
// "Voice"; the measurements behind the choice are in CONTRACTS.md 3.24.0).
//
// whisper.cpp, through @fugood/whisper.node: an N-API addon with prebuilt
// binaries for CPU, Vulkan and CUDA, installed by npm with no compiler, no
// Python and nothing global. The model is NOT in the repository and NOT in the
// package: it is fetched on first use into ASTROLABE_DATA/models/whisper/ —
// the data directory, never the vault, which is synced, published and
// committed — and checked by size before it is trusted.

import { fork, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, promises as fsp, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { voiceModelInfo, type VoiceLanguage, type VoiceModelId } from "../shared/voice.ts";
import { dataDir } from "./site.ts";

const MODEL_HOST = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

/** A job that has not come back in this long is a stuck child. Generous: a
 *  CPU-only machine transcribing a quarter of an hour with the large model
 *  is minutes, not seconds. */
const JOB_TIMEOUT_MS = 20 * 60 * 1000;

/** The child is ended after this long with nothing to do, and the model's
 *  memory with it. Long enough that a burst of notes loads it once. */
const IDLE_MS = 5 * 60 * 1000;

export function modelsDir(): string {
  return path.join(dataDir(), "models", "whisper");
}

export function modelPath(id: VoiceModelId): string {
  return path.join(modelsDir(), voiceModelInfo(id).file);
}

/** Bytes of the model on disk (a finished file or the partial download). */
export function modelOnDisk(id: VoiceModelId): number {
  const done = modelPath(id);
  for (const candidate of [done, `${done}.part`]) {
    try {
      return statSync(candidate).size;
    } catch {
      // not this one
    }
  }
  return 0;
}

export function modelReady(id: VoiceModelId): boolean {
  try {
    return statSync(modelPath(id)).size === voiceModelInfo(id).bytes;
  } catch {
    return false;
  }
}

class EngineError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

const downloads = new Map<VoiceModelId, Promise<string>>();

/** The model's path, fetching it first when it is not there. One download
 *  per model however many recordings are waiting for it; written to `.part`
 *  and renamed only once every byte has arrived, so a download interrupted by
 *  a restart is never mistaken for a model. */
export function ensureModel(id: VoiceModelId): Promise<string> {
  if (modelReady(id)) return Promise.resolve(modelPath(id));
  const running = downloads.get(id);
  if (running) return running;
  const info = voiceModelInfo(id);
  const target = modelPath(id);
  const part = `${target}.part`;
  const job = (async () => {
    await fsp.mkdir(modelsDir(), { recursive: true });
    let res: Response;
    try {
      res = await fetch(`${MODEL_HOST}/${info.file}`, { redirect: "follow" });
    } catch (err) {
      throw new EngineError(`Could not reach the model host: ${String((err as Error).message ?? err)}`, "download");
    }
    if (!res.ok || !res.body) throw new EngineError(`The model host answered ${res.status}`, "download");
    await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(part));
    const size = (await fsp.stat(part)).size;
    if (size !== info.bytes) {
      await fsp.rm(part, { force: true });
      throw new EngineError(`The model arrived at ${size} bytes, not ${info.bytes}`, "download");
    }
    await fsp.rename(part, target);
    return target;
  })().finally(() => downloads.delete(id));
  downloads.set(id, job);
  return job;
}

export function downloading(id: VoiceModelId): boolean {
  return downloads.has(id);
}

// ── The child ──────────────────────────────────────────────────────────────

const WORKER = fileURLToPath(new URL("./voiceWorker.ts", import.meta.url));

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
let seq = 0;
const waiting = new Map<string, { resolve: (r: Reply) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

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
  const c = fork(WORKER, [], { serialization: "advanced", stdio: ["ignore", "ignore", "pipe", "ipc"] });
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
    if (reply.backend) lastBackend = reply.backend;
    w.resolve(reply);
  });
  c.on("exit", (code, signal) => {
    if (child === c) child = null;
    if (code !== 0 && signal !== "SIGTERM") console.error(`voice: the transcriber stopped (${signal ?? code}):\n${tail.join("\n")}`);
    for (const [id, w] of waiting) {
      waiting.delete(id);
      clearTimeout(w.timer);
      w.reject(new EngineError(`The transcriber stopped (${signal ?? code})`, "engine"));
    }
  });
  child = c;
  return c;
}

export function engineBackend(): string | null {
  return lastBackend;
}

/** Transcribe one recording in the child. */
export async function transcribeInChild(
  audio: Uint8Array,
  ext: string,
  model: VoiceModelId,
  language: VoiceLanguage,
): Promise<{ text: string; language: string | null }> {
  const file = await ensureModel(model);
  if (!existsSync(file)) throw new EngineError("The model is missing", "download");
  if (idleTimer) clearTimeout(idleTimer);
  const c = spawnChild();
  const id = String(++seq);
  const reply = await new Promise<Reply>((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new EngineError("The transcription took too long", "timeout"));
      stopChild();
    }, JOB_TIMEOUT_MS);
    waiting.set(id, { resolve, reject, timer });
    c.send({ id, model: file, audio, ext, language });
  }).finally(() => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(stopChild, IDLE_MS);
    idleTimer.unref();
  });
  if (reply.error !== undefined) throw new EngineError(reply.error, reply.code ?? "engine");
  return { text: reply.text ?? "", language: reply.language ?? null };
}

