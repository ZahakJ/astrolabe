// THE SELF-TEST — which languages each installed engine TRULY speaks on this
// machine (docs/read-aloud.md, "Which engine speaks which language").
//
// WHY. An engine that is installed is not an engine that speaks every
// language on its list. Natural (Kokoro) reads every language but Japanese
// through espeak-ng, and an espeak that cannot find its data does not raise:
// it calls exit(1), and the speaker goes with it (server/speakWorker.py's
// header has the whole story — a data path longer than its 160-byte buffer
// was enough). And a phonemiser that falls back to its English rules reads
// "quotidien" as /kwɑːtˈɪdiən/: a French note read as if it were English,
// which is exactly how a reader described it.
//
// WHAT. After an Install — and once, in the background, for an engine
// installed before this test existed or changed since — the worker is run
// in its own short-lived process (`speakWorker.py --selftest`) to speak ONE
// WORD per language through the very code the speaker uses, printing per
// language the phonemes the engine made, the phonemes the English rules make
// of the same word, and the length of the spoken word. `judgeSelfTest` reads
// them: phonemes equal to the English ones are the English fallback; no
// sound is no voice; a language the run never reached (it died on the one
// before) failed. The verdict is kept in ASTROLABE_DATA/tts/selftest.json.
//
// WHAT IT CHANGES. A language an engine failed is REFUSED to it
// (shared/speech.ts `SpeakRefusals`): the route hands it to the other engine
// when that one is installed and passed, and otherwise answers 409 naming the
// engine to install — never the English rules, never a dead speaker. The
// Read aloud row prints the verdict per engine.

import { spawn } from "node:child_process";
import { promises as fsp, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  refusalsOf,
  SPEAK_ENGINES,
  SPEAK_VOICES,
  type SpeakCheck,
  type SpeakCheckLang,
  type SpeakEngineId,
  type SpeakLang,
  type SpeakRefusals,
} from "../shared/speech.ts";
import { engineInstalled, packagesMarker, pyEnv, runtimeReady, SPEAK_FAKE, ttsDir, ttsModelsDir, venvPython, WORKER } from "./speakEngine.ts";

/** Raise when the worker's self-test changes, so every machine tests again. */
const SELFTEST_VERSION = 1;

/** One word per language — ordinary words whose sounds a language's own
 *  rules and the English ones cannot agree on. */
export const SELFTEST_WORDS: Readonly<Record<SpeakLang, string>> = {
  en: "morning",
  fr: "quotidien",
  es: "mañana",
  it: "giorno",
  pt: "coração",
  ja: "図書館",
  ar: "مكتبة",
};

/** The languages whose phonemes are compared with the English rules' — the
 *  Latin-script ones English rules would also read, and so would silently
 *  stand in for. (Japanese goes through misaki, Arabic through Piper's
 *  diacritiser: English rules cannot pass for either.) */
const COMPARED: ReadonlySet<SpeakLang> = new Set(["fr", "es", "it", "pt"]);

/** A spoken word shorter than this is no word. */
const MIN_SECONDS = 0.1;

/** What the worker prints per language. */
export interface SelfTestLine {
  lang: string;
  phonemes?: string;
  english?: string;
  seconds?: number;
  error?: string;
  code?: string;
}

function norm(p: string): string {
  // Stress marks and punctuation aside: the same sounds are the same sounds.
  return p.normalize("NFC").replace(/[ˈˌ.,!?;:'"\s-]/g, "");
}

/** The verdict on one engine's run, per language it was asked. */
export function judgeSelfTest(langs: readonly SpeakLang[], lines: readonly SelfTestLine[], at: number): SpeakCheck {
  const out: Partial<Record<SpeakLang, SpeakCheckLang>> = {};
  for (const lang of langs) {
    const line = lines.find((l) => l.lang === lang);
    let verdict: SpeakCheckLang;
    if (!line) verdict = { ok: false, why: "stopped" };
    else if (typeof line.error === "string") verdict = { ok: false, why: "error", error: line.error.slice(0, 300) };
    else if (typeof line.seconds !== "number" || line.seconds < MIN_SECONDS) verdict = { ok: false, why: "silent", phonemes: line.phonemes };
    else if (!line.phonemes || (COMPARED.has(lang) && norm(line.phonemes) === norm(line.english ?? ""))) {
      verdict = { ok: false, why: "english", phonemes: line.phonemes };
    } else verdict = { ok: true, phonemes: line.phonemes };
    out[lang] = verdict;
  }
  return { at, langs: out };
}

// ── Running it ─────────────────────────────────────────────────────────────

export interface SelfTestSpec {
  engine: SpeakEngineId;
  words: Partial<Record<SpeakLang, string>>;
  voices: Partial<Record<SpeakLang, string>>;
}

export function selfTestSpec(engine: SpeakEngineId): SelfTestSpec {
  const words: Partial<Record<SpeakLang, string>> = {};
  const voices: Partial<Record<SpeakLang, string>> = {};
  // Japanese first: it needs no espeak, so a run that dies on the first
  // espeak language has still said whether the engine itself loads.
  const langs = (Object.keys(SPEAK_VOICES[engine]) as SpeakLang[]).sort((a, b) => Number(b === "ja") - Number(a === "ja"));
  for (const lang of langs) {
    words[lang] = SELFTEST_WORDS[lang];
    voices[lang] = SPEAK_VOICES[engine][lang]![0].id;
  }
  return { engine, words, voices };
}

/** Runs the worker's self-test; replaced by a test's fake. */
export type SelfTestRunner = (spec: SelfTestSpec) => Promise<SelfTestLine[]>;

const RUN_TIMEOUT_MS = 180_000;

const inWorker: SelfTestRunner = (spec) =>
  new Promise((resolve) => {
    const lines: SelfTestLine[] = [];
    const child = spawn(venvPython(), ["-u", WORKER, "--selftest", JSON.stringify(spec)], {
      env: pyEnv({ ASTROLABE_TTS_MODELS: ttsModelsDir(), HF_HUB_OFFLINE: "1", PYTHONIOENCODING: "utf-8" }),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let buf = "";
    const tail: string[] = [];
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        try {
          const parsed = JSON.parse(line) as SelfTestLine & { done?: boolean };
          if (typeof parsed.lang === "string") lines.push(parsed);
        } catch {
          // not ours
        }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      for (const l of chunk.split("\n")) if (l.trim()) tail.push(l);
      if (tail.length > 20) tail.splice(0, tail.length - 20);
    });
    const timer = setTimeout(() => child.kill(), RUN_TIMEOUT_MS);
    const done = (code: number | null): void => {
      clearTimeout(timer);
      if (code !== 0) console.error(`speak: the ${spec.engine} self-test stopped (${code}):\n${tail.join("\n")}`);
      resolve(lines);
    };
    child.on("error", () => done(-1));
    child.on("exit", (code) => done(code));
  });

let runner: SelfTestRunner = inWorker;

/** Tests and the gates: a fake self-test. `null` puts the worker back. */
export function setSelfTestRunner(fake: SelfTestRunner | null): void {
  runner = fake ?? inWorker;
  results = null;
  running.clear();
}

// ── The verdicts, kept ─────────────────────────────────────────────────────

interface Kept {
  /** What the verdict was made against: the self-test's version and the
   *  engine's install stamp. Either changed, and the engine is tested again. */
  stamp: string;
  check: SpeakCheck;
}

let results: Partial<Record<SpeakEngineId, Kept>> | null = null;
let resultsFile = "";
const running = new Map<SpeakEngineId, Promise<SpeakCheck>>();

function file(): string {
  return path.join(ttsDir(), "selftest.json");
}

function stampOf(engine: SpeakEngineId): string {
  let installed = "fake";
  if (runner === inWorker) {
    try {
      installed = String(statSync(packagesMarker(engine)).mtimeMs);
    } catch {
      installed = "none";
    }
  }
  return `${SELFTEST_VERSION}:${installed}`;
}

function kept(): Partial<Record<SpeakEngineId, Kept>> {
  // Re-read when the data directory moved (the tests point several data
  // folders at one process).
  if (results === null || resultsFile !== file()) {
    resultsFile = file();
    try {
      results = JSON.parse(readFileSync(resultsFile, "utf8")) as Partial<Record<SpeakEngineId, Kept>>;
    } catch {
      results = {};
    }
  }
  return results;
}

/** The last verdict on `engine`, while it still describes the engine on
 *  disk; else null. */
export function engineCheck(engine: SpeakEngineId): SpeakCheck | null {
  const k = kept()[engine];
  return k && k.stamp === stampOf(engine) ? k.check : null;
}

export function engineChecking(engine: SpeakEngineId): boolean {
  return running.has(engine);
}

/** The languages each installed engine refused in its last self-test. */
export function refusalsNow(): SpeakRefusals {
  return refusalsOf({
    light: { check: engineInstalled("light") ? engineCheck("light") : null },
    natural: { check: engineInstalled("natural") ? engineCheck("natural") : null },
  });
}

/** Run the self-test of `engine` now (joining a run in progress), keep the
 *  verdict, and answer it. */
export function checkEngine(engine: SpeakEngineId): Promise<SpeakCheck> {
  const already = running.get(engine);
  if (already) return already;
  const spec = selfTestSpec(engine);
  const run = (async () => {
    const lines = await runner(spec);
    const check = judgeSelfTest(Object.keys(spec.words) as SpeakLang[], lines, Date.now());
    const all = { ...kept(), [engine]: { stamp: stampOf(engine), check } };
    results = all;
    try {
      await fsp.mkdir(ttsDir(), { recursive: true });
      await fsp.writeFile(file(), JSON.stringify(all, null, 2));
    } catch (err) {
      console.error("speak: could not keep the self-test:", (err as Error).message);
    }
    const no = Object.entries(check.langs).filter(([, v]) => !v.ok).map(([l, v]) => `${l} (${v.why})`);
    if (no.length > 0) console.error(`speak: ${engine} does not speak ${no.join(", ")} on this machine; those go to the other engine`);
    return check;
  })().finally(() => running.delete(engine));
  running.set(engine, run);
  return run;
}

/** The fake engine's self-test: every language passes, its "phonemes" the
 *  word itself — what the gates' tone engine (ASTROLABE_SPEAK_FAKE=1) is
 *  judged by, so the row's verdict line is drawn without a venv. */
export const fakeSelfTest: SelfTestRunner = async (spec) =>
  Object.entries(spec.words).map(([lang, word]) => ({ lang, phonemes: word, english: "-", seconds: 0.35 }));

if (SPEAK_FAKE) setSelfTestRunner(fakeSelfTest);

/** An installed engine with no verdict yet (installed before the self-test
 *  existed, or changed since) is tested once, in the background. */
export function ensureChecked(): void {
  // No venv, no worker to run (a fake engine in a test says "installed"
  // over an empty data folder): nothing to learn, and nothing refused.
  if (runner === inWorker && !runtimeReady()) return;
  for (const engine of SPEAK_ENGINES) {
    if (engineInstalled(engine) && !running.has(engine) && engineCheck(engine) === null) void checkEngine(engine).catch(() => {});
  }
}
