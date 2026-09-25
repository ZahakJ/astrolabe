// Read aloud's routes (server/speak.ts) through the Hono app, over a
// throwaway vault, with a FAKE engine standing in for the Python child: the
// language is detected and reported, the engine is chosen per language, a
// second ask is a cache hit, nothing installed is a 409 that names what to
// install, and a visitor is heard only with "Readers may listen" on, only on
// a published note, and only for words that are on that page.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Hono } from "hono";
import { initAuth } from "../server/auth.ts";
import { initIndexer } from "../server/indexer.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { api } from "../server/api.ts";
import { patchSettings } from "../server/settings.ts";
import { setFakeEngine, toneWav, type SpeakJob } from "../server/speakEngine.ts";
import { foldForMatch } from "../server/speak.ts";
import { makeDir, makeVault, note, removeVault } from "./helpers/vault.ts";

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

  it("folds text the way the page check does", () => {
    assert.equal(foldForMatch("The “quick”, brown — FOX!"), "thequickbrownfox");
    assert.equal(foldForMatch("الْمَكْتَبَةُ"), foldForMatch("الْمَكْتَبَةُ"));
  });
});
