// Voice notes without a GPU: the backend choice, the processor's thread
// count, the fallback from a GPU that fails to the processor, and the status
// line that fallback leaves behind (server/voiceEngine.ts,
// server/voiceWorker.ts, client/components/settings/voiceStatus.ts). The
// default's migration is pinned in tests/settings.test.ts beside the other
// settings.voice rules; speechWindows in tests/voice.test.ts.

import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { closeSync, ftruncateSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VOICE_MAX_THREADS, voiceModelBytes, voiceModelInfo, voiceThreads, type VoiceEngineState } from "../shared/voice.ts";
import {
  engineBackend,
  engineThreads,
  knownEngine,
  modelPath,
  modelReady,
  onnxDir,
  physicalCores,
  probeGpu,
  resetEngine,
  transcribeInChild,
} from "../server/voiceEngine.ts";
import { voiceRoutes } from "../server/voice.ts";
import { initSite } from "../server/site.ts";
import { makeDir, removeVault } from "./helpers/vault.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(here, "helpers", "fakeVoiceWorker.ts");

describe("the processor's thread count", () => {
  it("is the physical cores, capped at eight", () => {
    assert.equal(voiceThreads(16, 8), 8, "a 16-thread, 8-core machine: its cores, not its threads");
    assert.equal(voiceThreads(32, 16), VOICE_MAX_THREADS, "past eight the encoder stops getting faster");
    assert.equal(voiceThreads(8, 4), 4);
  });

  it("never exceeds what the process may run on (taskset, a container's quota)", () => {
    assert.equal(voiceThreads(2, 8), 2, "`taskset -c 0-1` on an 8-core machine: two");
    assert.equal(voiceThreads(1, 8), 1);
  });

  it("halves the logical count where the platform does not say, and is never zero", () => {
    assert.equal(voiceThreads(12, null), 6);
    assert.equal(voiceThreads(1, null), 1);
    assert.equal(voiceThreads(0, null), 1);
    assert.equal(voiceThreads(4, 0), 2);
  });

  it("reads physical cores from /proc/cpuinfo's (physical id, core id) pairs", () => {
    const cpu = (phys: number, core: number): string => `processor\t: x\nphysical id\t: ${phys}\ncore id\t\t: ${core}\n\n`;
    // Four cores, each listed twice (SMT).
    const smt = [0, 1, 2, 3, 0, 1, 2, 3].map((c) => cpu(0, c)).join("");
    assert.equal(physicalCores(smt), 4);
    // Two sockets whose core ids repeat.
    assert.equal(physicalCores([0, 1, 0, 1].map((c, i) => cpu(i < 2 ? 0 : 1, c)).join("")), 4);
    assert.equal(physicalCores("processor\t: 0\nmodel name\t: ARMv8\n"), null, "no core ids: unknown, not one");
    assert.ok(engineThreads() >= 1 && engineThreads() <= VOICE_MAX_THREADS);
  });
});

describe("the model catalogue", () => {
  it("names both forms of every model, and each engine's download is its own", () => {
    for (const id of ["base-q5_1", "small-q5_1", "large-v3-turbo-q5_0", "large-v3-turbo"] as const) {
      const info = voiceModelInfo(id);
      assert.equal(info.id, id);
      assert.equal(voiceModelBytes(id, "gpu"), info.bytes);
      assert.equal(info.onnx.files.length, 3);
      assert.equal(voiceModelBytes(id, "cpu"), info.onnx.files.reduce((s, f) => s + f.bytes, 0));
      assert.ok(info.cpuSecondsPerMinute > 0);
    }
    assert.equal(voiceModelInfo("large-v3-turbo").onnx.size, voiceModelInfo("large-v3-turbo-q5_0").onnx.size, "both turbo files are one export on the processor");
  });
});

/** A model "on disk" without a download: files of the catalogue's exact
 *  sizes, sparse, so the test writes nothing but inodes. */
function fakeModel(id: "small-q5_1"): void {
  const touch = (file: string, bytes: number): void => {
    mkdirSync(path.dirname(file), { recursive: true });
    const fd = openSync(file, "w");
    ftruncateSync(fd, bytes);
    closeSync(fd);
  };
  const info = voiceModelInfo(id);
  touch(modelPath(id), info.bytes);
  for (const f of info.onnx.files) touch(path.join(onnxDir(id), f.file), f.bytes);
}

async function engineState(): Promise<VoiceEngineState> {
  const res = await voiceRoutes.request("/voice/engine");
  assert.equal(res.status, 200);
  return (await res.json()) as VoiceEngineState;
}

describe("the backend, and the fallback from a GPU that fails", () => {
  const data = makeDir();
  const env = { ...process.env };

  before(() => {
    initSite({ ASTROLABE_DATA: data });
    fakeModel("small-q5_1");
    assert.ok(modelReady("small-q5_1", "gpu") && modelReady("small-q5_1", "cpu"));
  });

  beforeEach(() => {
    resetEngine();
    process.env.ASTROLABE_VOICE_WORKER = FAKE;
    delete process.env.FAKE_VOICE_GPU;
    delete process.env.FAKE_VOICE_PROBE;
    delete process.env.ASTROLABE_WHISPER_FAIL_GPU;
  });

  after(() => {
    resetEngine();
    for (const k of ["ASTROLABE_VOICE_WORKER", "FAKE_VOICE_GPU", "FAKE_VOICE_PROBE", "ASTROLABE_WHISPER_FAIL_GPU"]) {
      if (env[k] === undefined) delete process.env[k];
      else process.env[k] = env[k];
    }
    removeVault(data);
  });

  const audio = new Uint8Array([1, 2, 3]);

  it("cpu never asks about a GPU: the job goes to the processor with the thread rule's count", async () => {
    const out = await transcribeInChild(audio, "wav", "small-q5_1", "auto", "cpu");
    assert.equal(out.text, `cpu small ${engineThreads()}`);
    assert.equal(engineBackend(), "cpu");
    assert.equal(knownEngine("auto"), null, "the GPU builds were never probed");
  });

  it("auto on a machine whose GPU build loads but finds no GPU: silently the processor", async () => {
    const out = await transcribeInChild(audio, "wav", "small-q5_1", "en", "auto");
    assert.equal(out.text, `cpu small ${engineThreads()}`, "the same recording, heard again on the processor");
    assert.equal(engineBackend(), "cpu");
    assert.equal(knownEngine("auto"), "cpu", "and the GPU is not tried again this run");
  });

  it("auto when the GPU build takes the transcriber down mid-job: the processor, in a new child", async () => {
    process.env.FAKE_VOICE_GPU = "crash";
    const out = await transcribeInChild(audio, "wav", "small-q5_1", "auto", "auto");
    assert.equal(out.text, `cpu small ${engineThreads()}`);
    assert.equal(engineBackend(), "cpu");
  });

  it("auto when no GPU build loads at all: the processor from the first job", async () => {
    process.env.FAKE_VOICE_PROBE = "cpu";
    assert.equal(await probeGpu(), "cpu");
    assert.equal(knownEngine("auto"), "cpu");
    const out = await transcribeInChild(audio, "wav", "small-q5_1", "auto", "auto");
    assert.equal(out.text, `cpu small ${engineThreads()}`);
  });

  it("a processor engine that will not load falls to whisper.cpp's own CPU build, and still lands words", async () => {
    process.env.FAKE_VOICE_CPU = "missing";
    try {
      const out = await transcribeInChild(audio, "wav", "small-q5_1", "auto", "cpu");
      assert.equal(out.text, `floor small ${engineThreads()}`);
      assert.equal(engineBackend(), "cpu");
    } finally {
      delete process.env.FAKE_VOICE_CPU;
    }
  });

  it("the real transcriber, with every GPU build forced to refuse, answers the probe with the processor", async () => {
    delete process.env.ASTROLABE_VOICE_WORKER;
    process.env.ASTROLABE_WHISPER_FAIL_GPU = "1";
    assert.equal(await probeGpu(), "cpu");
    assert.equal(knownEngine("auto"), "cpu");
  });

  it("the status line then says the model ran on the processor", async () => {
    await transcribeInChild(audio, "wav", "small-q5_1", "auto", "auto");
    const state = await engineState();
    assert.equal(state.model, "small-q5_1");
    assert.equal(state.choice, "auto");
    assert.equal(state.engine, "cpu");
    assert.equal(state.backend, "cpu");
    assert.equal(state.bytes, voiceModelBytes("small-q5_1", "cpu"), "the size is the processor's files");
    assert.equal(state.downloaded, state.bytes);
    const { installDictionary, setLang } = await import("../client/i18n.ts");
    const en = (await import("../client/i18n/en.ts")).default;
    const ar = (await import("../client/i18n/ar.ts")).default;
    const { voiceStatusLine } = await import("../client/components/settings/voiceStatus.ts");
    installDictionary("en", en);
    installDictionary("ar", ar);
    setLang("en");
    // tf() isolates each filled-in word (FSI … PDI); the reader sees the words.
    const plain = (s: string | null): string => (s ?? "").replace(/[\u2066-\u2069]/g, "");
    const line = plain(voiceStatusLine("small-q5_1", "auto", "small-q5_1|auto", state));
    assert.match(line, /on the processor/);
    assert.match(line, new RegExp(en.voiceModelSmall.replace(/[()]/g, "\\$&")), "and names the model in use");
    setLang("ar");
    assert.match(plain(voiceStatusLine("small-q5_1", "auto", "small-q5_1|auto", state)), /على المعالج/);
    setLang("en");
  });

  it("before any job, a cpu choice already says where it will run", async () => {
    const state: VoiceEngineState = { ...(await engineState()), choice: "cpu", engine: "cpu", backend: null };
    const { voiceStatusLine } = await import("../client/components/settings/voiceStatus.ts");
    const line = (voiceStatusLine("small-q5_1", "cpu", "small-q5_1|cpu", state) ?? "").replace(/[\u2066-\u2069]/g, "");
    assert.match(line, /runs on the processor/);
  });
});
