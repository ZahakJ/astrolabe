// The self-test (server/speakSelfTest.ts): after an Install, each engine
// speaks one word per language in its own process, and the server judges the
// phonemes — the English rules' phonemes coming back are the English
// fallback, a run that died stopped every language it had not reached. A
// language an engine failed is handed to the other engine by the route, never
// read with the English rules. The worker is a FAKE here: its lines are what
// the real one printed in the diagnosis (docs/read-aloud.md), so the judge is
// tested on real phoneme strings.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { Hono } from "hono";
import { initAuth } from "../server/auth.ts";
import { initIndexer } from "../server/indexer.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { api } from "../server/api.ts";
import { patchSettings } from "../server/settings.ts";
import { setFakeEngine, toneWav, type SpeakJob } from "../server/speakEngine.ts";
import {
  checkEngine,
  engineCheck,
  judgeSelfTest,
  refusalsNow,
  selfTestSpec,
  setSelfTestRunner,
  type SelfTestLine,
  type SelfTestSpec,
} from "../server/speakSelfTest.ts";
import { makeDir, makeVault, removeVault } from "./helpers/vault.ts";
import type { SpeakStatus } from "../shared/speech.ts";

// What the real worker printed (Kokoro 0.6.1 + espeakng-loader 0.2.4).
const KOKORO_OK: SelfTestLine[] = [
  { lang: "ja", phonemes: "toɕokaɴ", english: "", seconds: 0.704 },
  { lang: "en", phonemes: "mˈɔːɹnɪŋ", english: "mˈɔːɹnɪŋ", seconds: 0.811 },
  { lang: "fr", phonemes: "kotidjˈɛ̃", english: "kwɑːtˈɪdiən", seconds: 0.832 },
  { lang: "es", phonemes: "maɲˈana", english: "mænjˈɑːnə", seconds: 0.725 },
  { lang: "it", phonemes: "dʒˈorno", english: "dʒɪˈɔːɹnoʊ", seconds: 0.747 },
  { lang: "pt", phonemes: "kˌoɾasˈɐ̃ʊ̃", english: "kɔːɹˈæsaʊ", seconds: 0.896 },
];
const LANGS = ["ja", "en", "fr", "es", "it", "pt"] as const;

describe("judgeSelfTest: the phoneme check", () => {
  it("passes every language whose phonemes are its own", () => {
    const check = judgeSelfTest(LANGS, KOKORO_OK, 5);
    assert.equal(check.at, 5);
    for (const l of LANGS) assert.equal(check.langs[l]?.ok, true, l);
    assert.equal(check.langs.fr?.phonemes, "kotidjˈɛ̃");
  });

  it("the English rules' phonemes for a French word are the English fallback — a fail", () => {
    const english = KOKORO_OK.map((l) => (l.lang === "fr" ? { ...l, phonemes: "kwɑːtˈɪdiən" } : l));
    const check = judgeSelfTest(LANGS, english, 1);
    assert.deepEqual(check.langs.fr, { ok: false, why: "english", phonemes: "kwɑːtˈɪdiən" });
    assert.equal(check.langs.es?.ok, true);
    // Stress marks aside, the same sounds are the same sounds.
    const stressOnly = KOKORO_OK.map((l) => (l.lang === "it" ? { ...l, phonemes: "dʒɪɔːɹnoʊ" } : l));
    assert.equal(judgeSelfTest(LANGS, stressOnly, 1).langs.it?.why, "english");
  });

  it("a run that died on the first espeak language stopped every language after it", () => {
    // espeak's exit(1) when its data path does not fit: Japanese (misaki) had
    // already answered, nothing else did.
    const check = judgeSelfTest(LANGS, KOKORO_OK.slice(0, 1), 1);
    assert.equal(check.langs.ja?.ok, true);
    for (const l of ["en", "fr", "es", "it", "pt"] as const) assert.deepEqual(check.langs[l], { ok: false, why: "stopped" }, l);
  });

  it("an error, no sound and no phonemes each fail with their reason", () => {
    const lines: SelfTestLine[] = [
      { lang: "fr", error: "RuntimeError: failed to load espeak", code: "engine" },
      { lang: "es", phonemes: "maɲˈana", english: "mænjˈɑːnə", seconds: 0 },
      { lang: "it", phonemes: "", english: "x", seconds: 0.5 },
    ];
    const check = judgeSelfTest(["fr", "es", "it"], lines, 1);
    assert.equal(check.langs.fr?.why, "error");
    assert.match(check.langs.fr?.error ?? "", /espeak/);
    assert.equal(check.langs.es?.why, "silent");
    assert.equal(check.langs.it?.why, "english");
  });

  it("English and Arabic are not compared with the English rules — they cannot pass for them", () => {
    const check = judgeSelfTest(["en", "ar"], [
      { lang: "en", phonemes: "mˈɔːɹnɪŋ", english: "mˈɔːɹnɪŋ", seconds: 0.6 },
      { lang: "ar", phonemes: "maktˈabat", english: "ˈæɹəbɪk…", seconds: 0.45 },
    ], 1);
    assert.equal(check.langs.en?.ok, true);
    assert.equal(check.langs.ar?.ok, true);
  });

  it("the spec asks each engine for one word per language it speaks, Japanese first", () => {
    const n = selfTestSpec("natural");
    assert.deepEqual(Object.keys(n.words), ["ja", "en", "fr", "es", "it", "pt"]);
    assert.equal(n.words.fr, "quotidien");
    assert.equal(n.voices.fr, "ff_siwis");
    const l = selfTestSpec("light");
    assert.deepEqual(Object.keys(l.words).sort(), ["ar", "en", "fr"]);
    assert.equal(l.voices.fr, "fr_FR-siwis-medium", "the voice Install downloads, not an on-choice one");
  });
});

describe("the verdict, kept and obeyed", () => {
  const data = makeDir();
  const root = makeVault({ "Leçon.md": "# Leçon\n\nDécrire son quotidien.\n" });
  const app = new Hono();
  app.route("/api", api);
  const asked: SpeakJob[] = [];
  const speak = (body: unknown) =>
    app.request("/api/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  /** The fake worker: Natural's French comes back in English (the bug). */
  let natural: SelfTestLine[] = KOKORO_OK.map((l) => (l.lang === "fr" ? { ...l, phonemes: l.english } : l));
  const ran: SelfTestSpec[] = [];

  before(async () => {
    initAuth({});
    initSite({ ASTROLABE_DATA: data });
    initVault(root);
    await initIndexer();
    setFakeEngine(async (job) => {
      asked.push(job);
      return { audio: toneWav(job.text), mime: "audio/wav", ms: 1 };
    }, ["light", "natural"]);
    setSelfTestRunner(async (spec) => {
      ran.push(spec);
      if (spec.engine === "natural") return natural;
      return Object.entries(spec.words).map(([lang, w]) => ({ lang, phonemes: `ph-${w}-x`, english: w, seconds: 0.4 }));
    });
  });

  after(() => {
    setSelfTestRunner(null);
    setFakeEngine(null);
    removeVault(root);
    removeVault(data);
  });

  it("keeps the verdict in the data folder, and reads refusals from it", async () => {
    await checkEngine("natural");
    await checkEngine("light");
    assert.equal(engineCheck("natural")?.langs.fr?.why, "english");
    assert.deepEqual(refusalsNow(), { natural: ["fr"] });
    const file = path.join(data, "tts", "selftest.json");
    assert.ok(existsSync(file));
    assert.equal(JSON.parse(readFileSync(file, "utf8")).natural.check.langs.fr.ok, false);
  });

  it("French is handed to Light under Natural — Japanese, which passed, stays Natural's", async () => {
    patchSettings({ speak: { engine: "natural" } });
    try {
      asked.length = 0;
      const fr = await speak({ text: "Je finis mon travail à 18 heures." });
      assert.equal(fr.status, 200);
      assert.equal(fr.headers.get("x-speak-lang"), "fr");
      assert.equal(fr.headers.get("x-speak-engine"), "light");
      assert.equal(asked[0].voice, "fr_FR-siwis-medium");
      const ja = await speak({ text: "図書館" });
      assert.equal(ja.headers.get("x-speak-engine"), "natural");
    } finally {
      patchSettings({ speak: null });
    }
  });

  it("with Light not installed, French is a 409 naming Light — never Kokoro's English rules", async () => {
    setFakeEngine(async (job) => ({ audio: toneWav(job.text), mime: "audio/wav", ms: 1 }), ["natural"]);
    patchSettings({ speak: { engine: "natural" } });
    try {
      const res = await speak({ text: "C'est ma vie, et je la raconte." });
      assert.equal(res.status, 409);
      const body = (await res.json()) as { code: string; lang: string; needs: string };
      assert.deepEqual([body.code, body.lang, body.needs], ["speakNotInstalled", "fr", "light"]);
    } finally {
      patchSettings({ speak: null });
      setFakeEngine(async (job) => {
        asked.push(job);
        return { audio: toneWav(job.text), mime: "audio/wav", ms: 1 };
      }, ["light", "natural"]);
    }
  });

  it("the status carries each engine's verdict; Check again runs it anew and a pass gives French back", async () => {
    const status = (await (await app.request("/api/speak/status")).json()) as SpeakStatus;
    assert.equal(status.engines.natural.check?.langs.fr?.ok, false);
    assert.equal(status.engines.light.check?.langs.fr?.ok, true);
    natural = KOKORO_OK; // the phonemiser fixed
    const before = ran.length;
    const res = await app.request("/api/speak/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ engine: "natural" }) });
    assert.equal(res.status, 202);
    await checkEngine("natural"); // joins the run the route started
    assert.ok(ran.length > before);
    assert.deepEqual(refusalsNow(), {});
    patchSettings({ speak: { engine: "natural" } });
    try {
      const fr = await speak({ text: "Je me lève tôt et je prends le bus." });
      assert.equal(fr.headers.get("x-speak-engine"), "natural");
    } finally {
      patchSettings({ speak: null });
    }
  });

  it("refuses a check of an engine that is not installed, or not an engine", async () => {
    const post = (body: unknown) =>
      app.request("/api/speak/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await post({ engine: "loud" })).status, 400);
    setFakeEngine(async (job) => ({ audio: toneWav(job.text), mime: "audio/wav", ms: 1 }), ["light"]);
    try {
      assert.equal((await post({ engine: "natural" })).status, 409);
    } finally {
      setFakeEngine(async (job) => ({ audio: toneWav(job.text), mime: "audio/wav", ms: 1 }), ["light", "natural"]);
    }
  });
});
