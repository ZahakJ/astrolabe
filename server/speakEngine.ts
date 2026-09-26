// THE SPEAKER'S ENGINE — the venv, the models, and the persistent child
// (docs/read-aloud.md; the choice of engines is the trial written up there).
//
// ON THE CPU, BY DESIGN. The owner ruled the GPU out, and the people this is
// for may have none: the target is an ordinary laptop or a small home server.
// Both engines run on onnxruntime's CPU provider — no torch, no CUDA wheels,
// nothing compiled at install time.
//
// WHERE THINGS LIVE, all under ASTROLABE_DATA — the data directory, never the
// vault (which is synced, published and committed) and never the repository:
//
//   tts/venv/            a Python venv the Install button makes: `uv` when it
//                        is on PATH (it fetches its own Python), else a system
//                        python3 of 3.10–3.13, else the standalone below
//   tts/python/          a standalone CPython 3.12, fetched only when the
//                        machine has neither uv nor a usable Python — the
//                        packaged desktop app's usual case on Windows and
//                        Linux (server/standalonePython.ts)
//   models/tts/piper/    one ~63 MB model per Piper voice (+ its .json)
//   models/tts/kokoro/   kokoro-v1.0.onnx (325 MB) + voices-v1.0.bin (28 MB)
//   tts/cache/           the spoken audio, by sha256 (server/speakCache.ts)
//
// The desktop app's bundled server reads the same paths through its own
// ASTROLABE_DATA, so the Install button works there unchanged: the venv lands
// in the app's data folder, and the Python child is spawned like the whisper
// child is (a plain child process; Electron's permissions are untouched —
// the page only PLAYS audio).

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, promises as fsp, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { SPEAK_VOICES, type SpeakEngineId, type SpeakInstallPhase, type SpeakLang } from "../shared/speech.ts";
import { dataDir } from "./site.ts";
import { fetchStandalonePython, findOnPath, PythonFetchError, standalonePythonExe, venvPythonIn } from "./standalonePython.ts";

// ── Paths ──────────────────────────────────────────────────────────────────

export function ttsDir(): string {
  return path.join(dataDir(), "tts");
}
export function venvDir(): string {
  return path.join(ttsDir(), "venv");
}
export function ttsModelsDir(): string {
  return path.join(dataDir(), "models", "tts");
}
export function venvPython(): string {
  return venvPythonIn(venvDir());
}
/** Where a fetched standalone Python lives (only when one was needed). */
export function standaloneDir(): string {
  return path.join(ttsDir(), "python");
}

/** The environment every Python this module starts runs in: the server's,
 *  minus the two variables that would point a relocatable Python at some
 *  OTHER Python's standard library (a machine with a stale PYTHONHOME set
 *  for another program is exactly where the standalone would be needed). */
function pyEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  delete env.PYTHONHOME;
  delete env.PYTHONPATH;
  return env;
}

const WORKER = fileURLToPath(new URL("./speakWorker.py", import.meta.url));

// ── What an engine is made of ──────────────────────────────────────────────

interface ModelFile {
  /** Path under models/tts/. */
  rel: string;
  url: string;
  /** Exact size, checked before a file is trusted; null for a small JSON
   *  sidecar, which is checked by parsing instead. */
  bytes: number | null;
}

const PIPER_HOST = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0";
const KOKORO_HOST = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0";
const PIPER_VOICE_BYTES = 63_201_294;

function piperFiles(voice: string): ModelFile[] {
  // en_US-lessac-medium → en/en_US/lessac/medium/
  const [region, name, quality] = voice.split("-");
  const dir = `${PIPER_HOST}/${region.split("_")[0]}/${region}/${name}/${quality}`;
  return [
    { rel: `piper/${voice}.onnx`, url: `${dir}/${voice}.onnx`, bytes: PIPER_VOICE_BYTES },
    { rel: `piper/${voice}.onnx.json`, url: `${dir}/${voice}.onnx.json`, bytes: null },
  ];
}

export const ENGINE_FILES: Record<SpeakEngineId, ModelFile[]> = {
  light: Object.values(SPEAK_VOICES.light).flatMap((voices) => voices!.flatMap((v) => piperFiles(v.id))),
  natural: [
    { rel: "kokoro/kokoro-v1.0.onnx", url: `${KOKORO_HOST}/kokoro-v1.0.onnx`, bytes: 325_532_387 },
    { rel: "kokoro/voices-v1.0.bin", url: `${KOKORO_HOST}/voices-v1.0.bin`, bytes: 28_214_398 },
  ],
};

/** The Python packages each engine needs, PINNED to what the trial ran.
 *  Wheels only: nothing here may need a compiler on the owner's machine.
 *  `onnxruntime` is the CPU build — the GPU one is a different package
 *  (`onnxruntime-gpu`) and is never named. */
const PACKAGES: Record<SpeakEngineId, { wheels: string[]; pure: string[] }> = {
  light: { wheels: ["piper-tts==1.8.0", "soundfile==0.14.0", "numpy"], pure: [] },
  natural: {
    wheels: ["kokoro-onnx==0.6.1", "soundfile==0.14.0", "numpy", "fugashi==1.5.2", "jaconv==0.5.0", "mojimoji==0.0.13", "addict==2.4.0", "regex"],
    // misaki without its dependencies: its [ja] extra pulls pyopenjtalk,
    // which publishes no wheels (see speakWorker.py). UniDic-lite is a pure
    // Python sdist — built without a compiler, but not a wheel.
    pure: ["misaki==0.9.4", "unidic-lite==1.0.8"],
  },
};

export function engineBytes(engine: SpeakEngineId): number {
  return ENGINE_FILES[engine].reduce((n, f) => n + (f.bytes ?? 0), 0);
}

function onDisk(rel: string): number {
  const done = path.join(ttsModelsDir(), rel);
  for (const candidate of [done, `${done}.part`]) {
    try {
      return statSync(candidate).size;
    } catch {
      // not this one
    }
  }
  return 0;
}

export function engineDownloaded(engine: SpeakEngineId): number {
  return ENGINE_FILES[engine].reduce((n, f) => n + (f.bytes === null ? 0 : Math.min(onDisk(f.rel), f.bytes)), 0);
}

/** The marker the installer writes once an engine's packages are in: a
 *  venv whose `pip install` died halfway is not an engine. */
function packagesMarker(engine: SpeakEngineId): string {
  return path.join(venvDir(), `.astrolabe-${engine}`);
}

export function runtimeReady(): boolean {
  return existsSync(venvPython());
}

function modelsReady(engine: SpeakEngineId): boolean {
  return ENGINE_FILES[engine].every((f) => {
    const abs = path.join(ttsModelsDir(), f.rel);
    try {
      const size = statSync(abs).size;
      return f.bytes === null ? size > 0 : size === f.bytes;
    } catch {
      return false;
    }
  });
}

/** A test (tests/speakRoutes.test.ts) stands a fake engine in; nothing else
 *  sets this. */
let fakeInstalled: Set<SpeakEngineId> | null = null;

export function engineInstalled(engine: SpeakEngineId): boolean {
  if (fakeInstalled) return fakeInstalled.has(engine);
  return runtimeReady() && existsSync(packagesMarker(engine)) && modelsReady(engine);
}

export function installedEngines(): Set<SpeakEngineId> {
  return new Set((["light", "natural"] as const).filter(engineInstalled));
}

// ── Installing ─────────────────────────────────────────────────────────────

export class SpeakError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

interface InstallState {
  phase: SpeakInstallPhase;
  engine: SpeakEngineId | null;
  error?: string;
  code?: string;
  progress?: number;
}

let install: InstallState = { phase: "idle", engine: null };
let installing: Promise<void> | null = null;

export function installState(): InstallState {
  return { ...install };
}

/** Run a command to the end, keeping the last lines of its output for the
 *  error an owner will read. */
function run(cmd: string, args: string[], env: NodeJS.ProcessEnv = pyEnv()): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const tail: string[] = [];
    const keep = (chunk: Buffer): void => {
      for (const line of chunk.toString("utf8").split("\n")) if (line.trim()) tail.push(line.trim());
      if (tail.length > 20) tail.splice(0, tail.length - 20);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    child.on("error", (err) => reject(new SpeakError(`${cmd}: ${err.message}`, "speakInstall")));
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new SpeakError(`${path.basename(cmd)} ${args[0] ?? ""} failed (${code}): ${tail.slice(-4).join(" · ")}`, "speakInstall"));
    });
  });
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** A program on the PATH, found in-process — never by spawning `which` or
 *  `where` (server/standalonePython.ts's findOnPath says why). */
function which(name: string): string | null {
  return findOnPath(name, process.env, process.platform, isFile);
}

/** Whether `exe` is a Python 3.10–3.13 (onnxruntime and the engines publish
 *  wheels for those). Windows' `python.exe` in WindowsApps is the Store's
 *  installer stub, which prints nothing and exits 9009: not a Python. */
function usablePython(exe: string): boolean {
  const v = spawnSync(exe, ["-c", "import sys; print(sys.version_info[0], sys.version_info[1])"], {
    encoding: "utf8",
    env: pyEnv(),
    windowsHide: true,
    timeout: 15_000,
  });
  const [major, minor] = (v.stdout ?? "").trim().split(" ").map(Number);
  return major === 3 && minor >= 10 && minor <= 13;
}

/** A system Python the venv can be made from. */
function systemPython(): string | null {
  for (const name of process.platform === "win32" ? ["python", "py"] : ["python3.12", "python3.13", "python3.11", "python3.10", "python3"]) {
    const exe = which(name);
    if (exe && usablePython(exe)) return exe;
  }
  return null;
}

/** Make the venv, from the first of: uv (it fetches its own Python), a
 *  standalone Python fetched on an earlier install, a system Python of
 *  3.10–3.13, and — when none of those is here — a standalone Python fetched
 *  now into tts/python/. Answers which tool installs the packages. */
async function ensureVenv(engine: SpeakEngineId): Promise<"uv" | "pip"> {
  const uv = which("uv");
  if (runtimeReady()) return uv ? "uv" : "pip";
  await fsp.mkdir(ttsDir(), { recursive: true });
  if (uv) {
    await run(uv, ["venv", "--python", "3.12", venvDir()]);
    return "uv";
  }
  const fetched = standalonePythonExe(standaloneDir());
  let py = existsSync(fetched) ? fetched : systemPython();
  if (!py) {
    install = { phase: "fetch-python", engine, progress: 0 };
    try {
      py = await fetchStandalonePython(standaloneDir(), (pct) => {
        install = { phase: "fetch-python", engine, progress: pct };
      });
    } catch (err) {
      const why = err instanceof PythonFetchError ? err.message : String((err as Error).message ?? err);
      throw new SpeakError(`No uv or Python 3.10–3.13 here, and none could be fetched: ${why}`, "speakNoPython", 409);
    }
    install = { phase: "python", engine };
  }
  await run(py, ["-m", "venv", venvDir()]);
  return "pip";
}

async function installPackages(engine: SpeakEngineId, tool: "uv" | "pip"): Promise<void> {
  const { wheels, pure } = PACKAGES[engine];
  const uv = which("uv");
  const py = venvPython();
  // Never a CUDA wheel: `onnxruntime` (not -gpu) is the CPU build, and no
  // package here depends on torch. Wheels only for the compiled ones.
  const pipArgs = tool === "uv" && uv ? [uv, "pip", "install", "--python", py] : [py, "-m", "pip", "install", "--disable-pip-version-check"];
  const [cmd, ...base] = pipArgs;
  await run(cmd, [...base, "--only-binary", ":all:", ...wheels]);
  if (pure.length > 0) await run(cmd, [...base, "--no-deps", ...pure]);
  await fsp.writeFile(packagesMarker(engine), new Date().toISOString());
}

async function download(file: ModelFile): Promise<void> {
  const target = path.join(ttsModelsDir(), file.rel);
  if (existsSync(target) && (file.bytes === null || statSync(target).size === file.bytes)) return;
  const part = `${target}.part`;
  await fsp.mkdir(path.dirname(target), { recursive: true });
  let res: Response;
  try {
    res = await fetch(file.url, { redirect: "follow" });
  } catch (err) {
    throw new SpeakError(`Could not reach ${new URL(file.url).host}: ${String((err as Error).message ?? err)}`, "speakDownload");
  }
  if (!res.ok || !res.body) throw new SpeakError(`${new URL(file.url).host} answered ${res.status}`, "speakDownload");
  await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(part));
  const size = (await fsp.stat(part)).size;
  if (file.bytes !== null && size !== file.bytes) {
    await fsp.rm(part, { force: true });
    throw new SpeakError(`${path.basename(file.rel)} arrived at ${size} bytes, not ${file.bytes}`, "speakDownload");
  }
  if (file.bytes === null) JSON.parse(await fsp.readFile(part, "utf8")); // a sidecar that is not JSON is an error page
  await fsp.rename(part, target);
}

/** Install one engine: the venv (once), its packages, its models. One
 *  install at a time; a second press while one runs joins it. */
export function installEngine(engine: SpeakEngineId): Promise<void> {
  if (installing) return installing;
  install = { phase: "python", engine };
  installing = (async () => {
    try {
      const tool = await ensureVenv(engine);
      install = { phase: "packages", engine };
      if (!existsSync(packagesMarker(engine))) await installPackages(engine, tool);
      install = { phase: "models", engine };
      for (const f of ENGINE_FILES[engine]) await download(f);
      install = { phase: "done", engine };
      stopChild(); // a running child has not imported the new engine's packages
    } catch (err) {
      const e = err as SpeakError;
      install = { phase: "failed", engine, error: e.message, code: e.code ?? "speakInstall" };
      console.error("speak: install failed:", e.message);
    }
  })().finally(() => {
    installing = null;
  });
  return installing;
}

// ── The child ──────────────────────────────────────────────────────────────

/** A synthesis that has not come back in this long is a stuck child. A
 *  sentence is seconds even on one slow core. */
const JOB_TIMEOUT_MS = 60_000;
/** The child is ended after this long with nothing to do — Kokoro holds
 *  ~600 MB of RAM, and a reader who stopped listening wants it back. */
const IDLE_MS = 10 * 60 * 1000;

export interface Synthesis {
  audio: Uint8Array;
  mime: string;
  ms: number;
}

export interface SpeakJob {
  engine: SpeakEngineId;
  lang: SpeakLang;
  voice: string;
  speed: number;
  text: string;
  format: "opus" | "wav";
  /** A found voice (server/speakVoices.ts), loaded BY PATH: the Piper model
   *  or Kokoro's model. */
  model?: string;
  /** Piper's config (`<model>.json` by convention). */
  config?: string | null;
  /** One speaker of a multi-speaker Piper model. */
  speaker?: number | null;
  /** Kokoro's voices pack. */
  pack?: string | null;
}

interface Reply {
  id?: string;
  ok?: boolean;
  ready?: boolean;
  opus?: boolean;
  audio?: string;
  mime?: string;
  ms?: number;
  error?: string;
  code?: string;
}

let child: ChildProcess | null = null;
let ready: Promise<void> | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let seq = 0;
const waiting = new Map<string, { resolve: (r: Reply) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

export function childWarm(): boolean {
  return child !== null && child.exitCode === null;
}

export function stopChild(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const c = child;
  child = null;
  ready = null;
  if (c && c.exitCode === null) c.kill();
}

function spawnChild(): Promise<void> {
  if (child && child.exitCode === null && ready) return ready;
  const c = spawn(venvPython(), ["-u", WORKER], {
    env: pyEnv({
      ASTROLABE_TTS_MODELS: ttsModelsDir(),
      // No stray network: every model is on disk before the child starts.
      HF_HUB_OFFLINE: "1",
      PYTHONIOENCODING: "utf-8",
    }),
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const tail: string[] = [];
  c.stderr?.setEncoding("utf8");
  c.stderr?.on("data", (chunk: string) => {
    for (const line of chunk.split("\n")) if (line.trim()) tail.push(line);
    if (tail.length > 40) tail.splice(0, tail.length - 40);
  });
  let buffered = "";
  let onReady: (() => void) | null = null;
  let onFail: ((e: Error) => void) | null = null;
  const up = new Promise<void>((resolve, reject) => {
    onReady = resolve;
    onFail = reject;
  });
  c.stdout?.setEncoding("utf8");
  c.stdout?.on("data", (chunk: string) => {
    buffered += chunk;
    let nl: number;
    while ((nl = buffered.indexOf("\n")) >= 0) {
      const line = buffered.slice(0, nl);
      buffered = buffered.slice(nl + 1);
      let reply: Reply;
      try {
        reply = JSON.parse(line) as Reply;
      } catch {
        continue;
      }
      if (reply.ready) {
        onReady?.();
        continue;
      }
      const w = reply.id ? waiting.get(reply.id) : undefined;
      if (!w || !reply.id) continue;
      waiting.delete(reply.id);
      clearTimeout(w.timer);
      w.resolve(reply);
    }
  });
  c.on("error", (err) => onFail?.(new SpeakError(`The speaker could not start: ${err.message}`, "engine")));
  c.on("exit", (code, signal) => {
    if (child === c) {
      child = null;
      ready = null;
    }
    const why = new SpeakError(`The speaker stopped (${signal ?? code})`, "engine");
    onFail?.(why);
    if (code !== 0 && signal !== "SIGTERM") console.error(`speak: the speaker stopped (${signal ?? code}):\n${tail.join("\n")}`);
    for (const [id, w] of waiting) {
      waiting.delete(id);
      clearTimeout(w.timer);
      w.reject(why);
    }
  });
  child = c;
  ready = up;
  return up;
}

function send(message: Record<string, unknown>): Promise<Reply> {
  if (idleTimer) clearTimeout(idleTimer);
  return spawnChild()
    .then(() => {
      const c = child;
      if (!c) throw new SpeakError("The speaker stopped", "engine");
      const id = String(++seq);
      return new Promise<Reply>((resolve, reject) => {
        const timer = setTimeout(() => {
          waiting.delete(id);
          reject(new SpeakError("The speaker took too long", "timeout"));
          stopChild();
        }, JOB_TIMEOUT_MS);
        waiting.set(id, { resolve, reject, timer });
        c.stdin?.write(JSON.stringify({ id, ...message }) + "\n");
      });
    })
    .finally(() => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(stopChild, IDLE_MS);
      idleTimer.unref();
    });
}

/** Start the child and load an engine ahead of the first word, so the first
 *  selection answers warm. Errors are the next real job's to report. */
export function warmEngine(engine: SpeakEngineId): void {
  if (!engineInstalled(engine) || fakeInstalled) return;
  void send({ warm: engine }).catch(() => {});
}

/** The engine the route runs. Replaced wholesale by a test. */
export type Synthesizer = (job: SpeakJob) => Promise<Synthesis>;

const inChild: Synthesizer = async (job) => {
  const reply = await send({ ...job });
  if (!reply.ok || typeof reply.audio !== "string") {
    throw new SpeakError(reply.error ?? "The speaker failed", reply.code ?? "engine");
  }
  return { audio: new Uint8Array(Buffer.from(reply.audio, "base64")), mime: reply.mime ?? "audio/ogg", ms: reply.ms ?? 0 };
};

let synthesizer: Synthesizer = inChild;

export function synthesize(job: SpeakJob): Promise<Synthesis> {
  return synthesizer(job);
}

/** Tests only: a fake engine, and which engines it claims are installed.
 *  `null` puts the real child back. */
export function setFakeEngine(fake: Synthesizer | null, installed: SpeakEngineId[] = []): void {
  synthesizer = fake ?? inChild;
  fakeInstalled = fake ? new Set(installed) : null;
}

/** A tone as a WAV: what the fake engine answers. A short beep whose pitch
 *  follows the text's length, so two sentences are audibly two. */
export function toneWav(text: string, seconds = 0.35): Uint8Array {
  const rate = 16000;
  const n = Math.round(rate * seconds);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0, "latin1");
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8, "latin1");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "latin1");
  buf.writeUInt32LE(n * 2, 40);
  const hz = 330 + (text.length % 12) * 40;
  for (let i = 0; i < n; i++) {
    const fade = Math.min(1, i / 400, (n - i) / 400);
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 8000 * fade), 44 + i * 2);
  }
  return new Uint8Array(buf);
}

// THE GATES' ENGINE. `ASTROLABE_SPEAK_FAKE=1` on a scratch server stands the
// tone in for both engines, so check-fidelity and check-phone can select a
// word, press Read aloud and see an audio answer arrive and the player show —
// on a machine with no venv, in seconds. Nothing else sets it; the Settings
// row says "Test engine" while it is on, so it cannot pass for the real one.
export const SPEAK_FAKE = process.env.ASTROLABE_SPEAK_FAKE === "1";
if (SPEAK_FAKE) {
  setFakeEngine(async (job) => ({ audio: toneWav(job.text), mime: "audio/wav", ms: 1 }), ["light", "natural"]);
}
