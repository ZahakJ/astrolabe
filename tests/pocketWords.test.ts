// THE POCKET SPEAKS THE READER'S LANGUAGE.
//
// What a pocket vault cannot do it refuses with a sentence (a 501
// code:"pocket"), and a path it will not touch is a 400. Both used to be
// English whatever the reader had chosen. The sentences now live in the
// shell's dictionary (mobile/src/i18n.ts, held en/ar by check-i18n) and are
// spoken at the moment of the answer in the CLIENT's language — its
// `<html lang>` — which the client shows as it came (client/api.ts puts the
// body's `error` on the ApiError). No network, no repository: an in-memory
// filesystem and a stub git.

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { PocketIndex } from "../mobile/src/pocket/index.ts";
import { createPocketServer, readerLang, type PocketGit, type PocketResponse } from "../mobile/src/pocket/server.ts";
import { createVaultIo, PocketVaultError, safeVaultPath } from "../mobile/src/pocket/vaultIo.ts";
import { lang as phoneLang, wordsIn, type Lang } from "../mobile/src/i18n.ts";
import { makeMemoryFs } from "./helpers/memoryFs.ts";

const ARABIC = /[؀-ۿ]/;

function server(language: Lang) {
  const fs = makeMemoryFs({ "/vault/Welcome.md": "# Welcome\n" });
  const git: PocketGit = {
    async commit() {
      return "sha";
    },
    async history() {
      return [];
    },
    async blobAt() {
      return null;
    },
  };
  const held = new Map<string, unknown>();
  const index = new PocketIndex();
  const s = createPocketServer({
    io: createVaultIo(fs, "/vault"),
    git,
    store: {
      async get(k) {
        return held.get(k) ?? null;
      },
      async set(k, v) {
        held.set(k, v);
      },
    },
    index,
    repo: { name: "owner/vault", branch: "main" },
    now: () => 1_700_000_000_000,
    lang: () => language,
  });
  return async (method: string, url: string, body?: unknown): Promise<{ status: number; error: string; code?: string }> => {
    const answer: PocketResponse = await s.handle({ method, url, headers: {}, body: body === undefined ? null : JSON.stringify(body) });
    const parsed = JSON.parse(String(answer.body)) as { error: string; code?: string };
    return { status: answer.status, error: parsed.error, code: parsed.code };
  };
}

// One route per way a refusal is reached: the server-only table, each prefix
// rule, the named cases, the shell-less sync, and the settings PATCH.
const REFUSALS: [string, string, unknown?][] = [
  ["POST", "/api/publish"],
  ["GET", "/api/design/anything"],
  ["GET", "/api/books/some-book"],
  ["GET", "/api/comments/abc"],
  ["GET", "/api/voice/engine"],
  ["GET", "/api/feeds"],
  ["GET", "/api/webmentions/queue"],
  ["POST", "/api/import/preview"],
  ["GET", "/api/sync/status"],
  ["POST", "/api/login"],
  ["GET", "/api/mentions?path=Welcome.md"],
  ["POST", "/api/upload"],
  ["GET", "/api/pocket/sync"],
  ["POST", "/api/pocket/leave"],
  ["PATCH", "/api/settings", { commentsEnabled: true }],
  ["PATCH", "/api/settings", { gitSync: { enabled: true } }],
];

describe("the pocket's refusals, in both languages", () => {
  for (const [method, route, body] of REFUSALS) {
    it(`${method} ${route} is a 501 in English and in Arabic`, async () => {
      const en = await server("en")(method, route, body);
      const ar = await server("ar")(method, route, body);
      assert.equal(en.status, 501);
      assert.equal(ar.status, 501);
      assert.equal(en.code, "pocket");
      assert.equal(ar.code, "pocket");
      assert.ok(en.error.length > 20 && !ARABIC.test(en.error), `en: ${en.error}`);
      assert.ok(ARABIC.test(ar.error), `ar has no Arabic: ${ar.error}`);
      assert.notEqual(en.error, ar.error);
    });
  }

  it("says the same sentence the dictionary holds, not a copy of it", async () => {
    assert.equal((await server("en")("POST", "/api/upload")).error, wordsIn("en").refuseUpload);
    assert.equal((await server("ar")("POST", "/api/upload")).error, wordsIn("ar").refuseUpload);
    assert.equal((await server("ar")("PATCH", "/api/settings", { fonts: {} })).error, wordsIn("ar").keepFonts);
  });
});

describe("a path the pocket will not touch", () => {
  it("is a 400 in the reader's language, not a thrown English error", async () => {
    const en = await server("en")("GET", `/api/note?path=${encodeURIComponent("../outside.md")}`);
    const ar = await server("ar")("GET", `/api/note?path=${encodeURIComponent("../outside.md")}`);
    assert.equal(en.status, 400);
    assert.equal(ar.status, 400);
    assert.equal(en.error, "That path leaves the vault: ../outside.md");
    assert.equal(ar.error, wordsIn("ar").vaultPathLeaves("../outside.md"));
    assert.ok(ARABIC.test(ar.error));
  });

  it("carries a key and its English for the log", () => {
    const cases: [string, string][] = [
      ["", "vaultPathRequired"],
      ["a\u0000b", "vaultPathNotPath"],
      ["a/../b", "vaultPathLeaves"],
      [".git/config", "vaultPathRepository"],
    ];
    for (const [raw, key] of cases) {
      assert.throws(
        () => safeVaultPath(raw),
        (err: unknown) => err instanceof PocketVaultError && err.key === key && err.message === err.say(wordsIn("en")) && ARABIC.test(err.say(wordsIn("ar"))),
        key,
      );
    }
  });
});

describe("readerLang: the client's <html lang>, else the phone's", () => {
  const g = globalThis as { document?: unknown };
  afterEach(() => {
    delete g.document;
  });

  it("follows the client's chrome language", () => {
    g.document = { documentElement: { lang: "ar" } };
    assert.equal(readerLang(), "ar");
    g.document = { documentElement: { lang: "en-GB" } };
    assert.equal(readerLang(), "en");
  });

  it("falls back to the shell's pick before the client has said", () => {
    g.document = { documentElement: { lang: "" } };
    assert.equal(readerLang(), phoneLang);
    delete g.document;
    assert.equal(readerLang(), phoneLang);
  });
});
