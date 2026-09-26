// Read aloud's routes (server/speak.ts) through the Hono app, over a
// throwaway vault, with a FAKE engine standing in for the Python child: the
// language is detected and reported, the engine is chosen per language, a
// second ask is a cache hit, nothing installed is a 409 that names what to
// install, and a visitor is heard only with "Readers may listen" on, only on
// a published note, and only for words that are on that page.

import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { Hono } from "hono";
import { initAuth } from "../server/auth.ts";
import { initIndexer } from "../server/indexer.ts";
import { initSite } from "../server/site.ts";
import { initVault, type VaultError } from "../server/vault.ts";
import { api } from "../server/api.ts";
import { getSettings, patchSettings } from "../server/settings.ts";
import { setFakeEngine, toneWav, type SpeakJob } from "../server/speakEngine.ts";
import { foldForMatch } from "../server/speak.ts";
import { makeDir, makeVault, note, removeVault } from "./helpers/vault.ts";
import type { SpeakStatus } from "../shared/speech.ts";

const VAULT: Record<string, string> = {
  "Carnet.md": note({ lang: "fr" }, "# Carnet\n\nLa grenouille saute dans le jardin.\n"),
  "Public.md": note({ publish: "true" }, "# Public\n\nThe **quick** brown fox reads the [[Paper|evening paper]].\n"),
  "Private.md": note({ publish: "false" }, "# Private\n\nA secret sentence.\n"),
};

const data = makeDir();
const root = makeVault(VAULT);
const app = new Hono();
app.route("/api", api);
const asked: SpeakJob[] = [];
const speak = (body: unknown) =>
  app.request("/api/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

before(async () => {
  initAuth({}); // local mode: the owner at their own machine
  initSite({ ASTROLABE_DATA: data });
  initVault(root);
  await initIndexer();
  setFakeEngine(async (job) => {
    asked.push(job);
    return { audio: toneWav(job.text), mime: "audio/wav", ms: 1 };
  }, ["light", "natural"]);
});

after(() => {
  setFakeEngine(null);
  initAuth({});
  removeVault(root);
  removeVault(data);
});

describe("POST /api/speak (the owner)", () => {
  it("speaks, reports the language and the engine, and closes a bare word", async () => {
    asked.length = 0;
    const res = await speak({ text: "図書館" });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "audio/wav");
    assert.equal(res.headers.get("x-speak-lang"), "ja");
    assert.equal(res.headers.get("x-speak-engine"), "natural");
    assert.equal(res.headers.get("x-speak-cache"), "miss");
    const bytes = new Uint8Array(await res.arrayBuffer());
    assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), "RIFF");
    assert.equal(asked[0].text, "図書館。");
    assert.equal(asked[0].voice, "jf_alpha");
  });

  it("the same words again are a cache hit, and the engine is not asked", async () => {
    asked.length = 0;
    const res = await speak({ text: "図書館" });
    assert.equal(res.headers.get("x-speak-cache"), "hit");
    assert.equal(asked.length, 0);
  });

  it("Arabic goes to Piper whatever the choice; French to the choice", async () => {
    patchSettings({ speak: { engine: "natural" } });
    try {
      const ar = await speak({ text: "المكتبة العامة" });
      assert.equal(ar.headers.get("x-speak-engine"), "light");
      const fr = await speak({ text: "Les enfants ont appris leurs leçons en une heure." });
      assert.equal(fr.headers.get("x-speak-lang"), "fr");
      assert.equal(fr.headers.get("x-speak-engine"), "natural");
    } finally {
      patchSettings({ speak: null });
    }
  });

  it("a lone word takes the note's own lang, then the sentence around it", async () => {
    const byNote = await speak({ text: "jardin", path: "Carnet.md" });
    assert.equal(byNote.headers.get("x-speak-lang"), "fr");
    const byContext = await speak({ text: "grenouille", context: "La grenouille saute dans le jardin de la maison." });
    assert.equal(byContext.headers.get("x-speak-lang"), "fr");
    const bare = await speak({ text: "window" });
    assert.equal(bare.headers.get("x-speak-lang"), "en");
  });

  it("an explicit lang wins, and the owner's voice and rate reach the engine", async () => {
    patchSettings({ speak: { engine: "natural", rate: 0.8, voices: { en: "am_michael" } } });
    try {
      asked.length = 0;
      const res = await speak({ text: "Bonjour", lang: "en" });
      assert.equal(res.headers.get("x-speak-lang"), "en");
      assert.equal(asked[0].voice, "am_michael");
      assert.equal(asked[0].speed, 0.8);
    } finally {
      patchSettings({ speak: null });
    }
  });

  it("refuses empty and oversized text", async () => {
    assert.equal((await speak({ text: "  " })).status, 400);
    assert.equal((await speak({ text: "a".repeat(1001) })).status, 413);
  });

  it("nothing installed that speaks the language is a 409 naming what to install", async () => {
    setFakeEngine(async (job) => ({ audio: toneWav(job.text), mime: "audio/wav", ms: 1 }), ["light"]);
    try {
      const res = await speak({ text: "ありがとう" });
      assert.equal(res.status, 409);
      const body = (await res.json()) as { code: string; lang: string; needs: string };
      assert.deepEqual([body.code, body.lang, body.needs], ["speakNotInstalled", "ja", "natural"]);
    } finally {
      setFakeEngine(async (job) => {
        asked.push(job);
        return { audio: toneWav(job.text), mime: "audio/wav", ms: 1 };
      }, ["light", "natural"]);
    }
  });

  it("an engine failure is a 502 with its code, and the next request is served", async () => {
    setFakeEngine(async () => {
      throw Object.assign(new Error("boom"), { code: "engine" });
    }, ["light", "natural"]);
    const res = await speak({ text: "A fresh failing sentence." });
    assert.equal(res.status, 502);
    assert.equal(((await res.json()) as { code: string }).code, "engine");
    setFakeEngine(async (job) => ({ audio: toneWav(job.text), mime: "audio/wav", ms: 1 }), ["light", "natural"]);
    assert.equal((await speak({ text: "A fresh failing sentence." })).status, 200);
  });
});

describe("GET /api/speak/status", () => {
  it("tells the owner what is installed and where the venv lives", async () => {
    const res = await app.request("/api/speak/status");
    const body = (await res.json()) as { engines: { light: { installed: boolean } }; venv: string; settings: { engine: string } };
    assert.equal(body.engines.light.installed, true);
    assert.match(body.venv, /tts[\\/]venv$/);
    assert.equal(body.settings.engine, "light");
  });
});

// ── Your own voices and the external speaker ───────────────────────────────

const voicesDir = makeDir();
const piperJson = (code: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ audio: { sample_rate: 22050 }, phoneme_id_map: { _: [0] }, language: { code }, num_speakers: 1, speaker_id_map: {}, ...extra });
const upmc = path.join(voicesDir, "fr", "fr_FR", "upmc", "medium", "fr_FR-upmc-medium.onnx");
const davefx = path.join(voicesDir, "es_ES-davefx-medium.onnx");
const fakeSpeaker = path.join(voicesDir, "..", `speaker-${path.basename(voicesDir)}.sh`);

describe("your own voices (the voices folder)", () => {
  before(() => {
    mkdirSync(path.dirname(upmc), { recursive: true });
    writeFileSync(upmc, "onnx");
    writeFileSync(`${upmc}.json`, piperJson("fr_FR", { num_speakers: 2, speaker_id_map: { jessica: 0, pierre: 1 } }));
    writeFileSync(davefx, "onnx");
    writeFileSync(`${davefx}.json`, piperJson("es_ES"));
    writeFileSync(path.join(voicesDir, "en_US-ryan-high.onnx"), "onnx"); // no config: skipped
    setFakeEngine(async (job) => {
      asked.push(job);
      return { audio: toneWav(job.text), mime: "audio/wav", ms: 1 };
    }, ["light", "natural"]);
  });
  after(() => {
    patchSettings({ speak: null });
    removeVault(voicesDir);
    rmSync(fakeSpeaker, { force: true });
  });

  it("refuses a folder that is relative, inside the vault, or not there — with a code the panel can say", () => {
    const refused = (dir: string): string => {
      try {
        patchSettings({ speak: { voicesDir: dir } });
      } catch (err) {
        return (err as VaultError).code ?? "";
      }
      return "accepted";
    };
    assert.equal(refused("piper-voices"), "speakDirRelative");
    assert.equal(refused(root), "speakDirInVault");
    assert.equal(refused(path.join(root, "voices")), "speakDirInVault");
    assert.equal(refused(path.join(voicesDir, "nowhere")), "speakDirMissing");
    assert.equal(refused(davefx), "speakDirNotDir");
    assert.equal(getSettings().speak, undefined, "a refused patch wrote nothing");
  });

  it("keeps the folder on this machine: in speak-local.json, never in settings.json", () => {
    const saved = patchSettings({ speak: { voicesDir } });
    assert.equal(saved.effective.speak.voicesDir, voicesDir);
    assert.doesNotMatch(readFileSync(path.join(data, "settings.json"), "utf8").toString(), /voicesDir/);
    assert.equal(JSON.parse(readFileSync(path.join(data, "speak-local.json"), "utf8")).voicesDir, voicesDir);
  });

  it("lists what the scan found per language, and what it skipped", async () => {
    const res = await app.request("/api/speak/voices/rescan", { method: "POST" });
    assert.equal(res.status, 200);
    const status = (await res.json()) as SpeakStatus;
    assert.equal(status.own.dir, voicesDir);
    assert.deepEqual(
      status.own.voices.map((v) => [v.lang, v.name]),
      [
        ["es", "Davefx"],
        ["fr", "Upmc · Jessica"],
        ["fr", "Upmc · Pierre"],
      ],
    );
    assert.deepEqual(status.own.skipped, [{ file: "en_US-ryan-high.onnx", reason: "noJson" }]);
    assert.equal(JSON.stringify(status).includes(upmc), false, "the status names voices, not the paths the worker loads");
  });

  it("a found voice picked for a language speaks it, loaded by path, with its speaker", async () => {
    patchSettings({ speak: { voices: { fr: "own:fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx#pierre" } } });
    asked.length = 0;
    const res = await speak({ text: "Le petit prince regarde les étoiles.", lang: "fr" });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-speak-engine"), "light");
    assert.equal(decodeURIComponent(res.headers.get("x-speak-voice") ?? ""), "own:fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx#pierre");
    assert.equal(asked[0].model, upmc);
    assert.equal(asked[0].config, `${upmc}.json`);
    assert.equal(asked[0].speaker, 1);
    // The same sentence again is a hit; the file replaced is spoken afresh.
    assert.equal((await speak({ text: "Le petit prince regarde les étoiles.", lang: "fr" })).headers.get("x-speak-cache"), "hit");
    const later = new Date(Date.now() + 60_000);
    utimesSync(upmc, later, later);
    assert.equal((await speak({ text: "Le petit prince regarde les étoiles.", lang: "fr" })).headers.get("x-speak-cache"), "miss");
  });

  it("a language only a found voice speaks is spoken on a Light-only machine", async () => {
    setFakeEngine(async (job) => {
      asked.push(job);
      return { audio: toneWav(job.text), mime: "audio/wav", ms: 1 };
    }, ["light"]);
    try {
      asked.length = 0;
      const res = await speak({ text: "¿Dónde está la biblioteca?", lang: "es" });
      assert.equal(res.status, 200);
      assert.equal(asked[0].model, davefx);
      assert.equal(asked[0].engine, "light");
    } finally {
      setFakeEngine(async (job) => {
        asked.push(job);
        return { audio: toneWav(job.text), mime: "audio/wav", ms: 1 };
      }, ["light", "natural"]);
    }
  });

  it("with no engine installed, the 409 names Light — the runtime the found voices need", async () => {
    setFakeEngine(async (job) => ({ audio: toneWav(job.text), mime: "audio/wav", ms: 1 }), []);
    try {
      const res = await speak({ text: "¿Qué hora es?", lang: "es" });
      assert.equal(res.status, 409);
      assert.equal(((await res.json()) as { needs: string }).needs, "light");
    } finally {
      setFakeEngine(async (job) => {
        asked.push(job);
        return { audio: toneWav(job.text), mime: "audio/wav", ms: 1 };
      }, ["light", "natural"]);
    }
  });

  it("the external speaker speaks the languages it was given, and says when it failed", async () => {
    writeFileSync(fakeSpeaker, `#!/bin/sh\ncat > /dev/null\n[ "$1" = "fr" ] || exit 7\nprintf 'OggS-fake' > "$2"\n`);
    chmodSync(fakeSpeaker, 0o755);
    patchSettings({ speak: { external: { command: `"${fakeSpeaker}" {lang} {out}`, langs: ["fr", "ar"] } } });
    assert.doesNotMatch(readFileSync(path.join(data, "settings.json"), "utf8"), /external/);
    asked.length = 0;
    const fr = await speak({ text: "Une phrase pour le programme.", lang: "fr" });
    assert.equal(fr.status, 200);
    assert.equal(fr.headers.get("x-speak-engine"), "external");
    assert.equal(fr.headers.get("content-type"), "audio/ogg");
    assert.equal(asked.length, 0, "the app's engine was not asked");
    // English was not given to it.
    assert.equal((await speak({ text: "A sentence for the app.", lang: "en" })).headers.get("x-speak-engine"), "light");
    // Arabic was, and the program refuses it: a 502 the player names.
    const ar = await speak({ text: "جملة للبرنامج", lang: "ar" });
    assert.equal(ar.status, 502);
    assert.equal(((await ar.json()) as { code: string }).code, "speakExternal");
  });

  it("refuses a command with no {out}, or with quotes that do not close", () => {
    assert.throws(() => patchSettings({ speak: { external: { command: "piper --model x.onnx", langs: ["fr"] } } }), /\{out\}/);
    assert.throws(() => patchSettings({ speak: { external: { command: 'piper "{out}', langs: ["fr"] } } }), /quotes/);
  });
});

describe("POST /api/speak (a visitor)", () => {
  before(() => {
    initAuth({
      ADMIN_PASSWORD_HASH: "$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA",
      SESSION_SECRET: "relsecret0123456789abcdef0123456789",
    });
  });
  after(() => initAuth({}));

  it("is a 404 until the owner turns on Readers may listen", async () => {
    assert.equal((await speak({ text: "quick brown fox", path: "Public.md" })).status, 404);
    const status = (await (await app.request("/api/speak/status")).json()) as Record<string, unknown>;
    assert.deepEqual(status, { public: false });
  });

  it("with it on: the words of a published page, and nothing else", async () => {
    initAuth({});
    patchSettings({ speak: { public: true } });
    initAuth({
      ADMIN_PASSWORD_HASH: "$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA",
      SESSION_SECRET: "relsecret0123456789abcdef0123456789",
    });
    try {
      const status = (await (await app.request("/api/speak/status")).json()) as Record<string, unknown>;
      assert.deepEqual(status, { public: true });
      // The rendered page's words: the link's label, no markup.
      assert.equal((await speak({ text: "The quick brown fox reads the evening paper.", path: "Public.md" })).status, 200);
      assert.equal((await speak({ text: "Say something the page never said.", path: "Public.md" })).status, 403);
      assert.equal((await speak({ text: "A secret sentence.", path: "Private.md" })).status, 404);
      assert.equal((await speak({ text: "quick brown fox" })).status, 404);
    } finally {
      initAuth({});
      patchSettings({ speak: null });
    }
  });

  it("never runs the owner's external speaker: a visitor hears the app's voices", async () => {
    initAuth({});
    const program = path.join(data, "never-run.sh");
    const ran = path.join(data, "never-run.txt");
    writeFileSync(program, `#!/bin/sh\ntouch "${ran}"\nprintf 'OggS' > "$1"\n`);
    chmodSync(program, 0o755);
    patchSettings({ speak: { public: true, external: { command: `"${program}" {out}`, langs: ["en"] } } });
    initAuth({
      ADMIN_PASSWORD_HASH: "$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA",
      SESSION_SECRET: "relsecret0123456789abcdef0123456789",
    });
    try {
      const res = await speak({ text: "The quick brown fox reads the evening paper.", path: "Public.md" });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("x-speak-engine"), "light");
      assert.equal(existsSync(ran), false, "the program never ran");
    } finally {
      initAuth({});
      patchSettings({ speak: null });
    }
  });

  it("folds text the way the page check does", () => {
    assert.equal(foldForMatch("The “quick”, brown — FOX!"), "thequickbrownfox");
    assert.equal(foldForMatch("الْمَكْتَبَةُ"), foldForMatch("الْمَكْتَبَةُ"));
  });
});
