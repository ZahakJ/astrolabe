// BYTE RANGES — one parser (shared/byteRange.ts), two servers, one answer.
//
// The server's /api/file and the pocket's both serve PDFs and media to readers
// that seek. They parsed `Range:` separately and disagreed about a range past
// the end (the server served the whole file with 200, the pocket 416). Held
// here: the parser itself, then the same five requests against both routes.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { parseByteRange } from "../shared/byteRange.ts";
import { initAuth } from "../server/auth.ts";
import { initIndexer } from "../server/indexer.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { api } from "../server/api.ts";
import { PocketIndex } from "../mobile/src/pocket/index.ts";
import { createPocketServer, type PocketGit } from "../mobile/src/pocket/server.ts";
import { createVaultIo } from "../mobile/src/pocket/vaultIo.ts";
import { makeMemoryFs } from "./helpers/memoryFs.ts";
import { makeDir, makeVault, removeVault } from "./helpers/vault.ts";

describe("parseByteRange", () => {
  it("no header, or another unit, asks for the whole file", () => {
    assert.equal(parseByteRange(undefined, 10), null);
    assert.equal(parseByteRange("", 10), null);
    assert.equal(parseByteRange("items=0-1", 10), null);
  });
  it("an open, a closed and a suffix range", () => {
    assert.deepEqual(parseByteRange("bytes=2-", 10), { start: 2, end: 9 });
    assert.deepEqual(parseByteRange("bytes=0-3", 10), { start: 0, end: 3 });
    assert.deepEqual(parseByteRange("bytes=-4", 10), { start: 6, end: 9 });
    assert.deepEqual(parseByteRange("bytes=-40", 10), { start: 0, end: 9 }, "a suffix longer than the file is the file");
    assert.deepEqual(parseByteRange("bytes=5-999", 10), { start: 5, end: 9 }, "an end past the file is clamped");
  });
  it("what cannot be served is unsatisfiable, not ignored", () => {
    for (const header of ["bytes=10-", "bytes=99999-", "bytes=5-2", "bytes=-0", "bytes=-", "bytes=a-b", "bytes=0-1,4-5"]) {
      assert.equal(parseByteRange(header, 10), "unsatisfiable", header);
    }
    assert.equal(parseByteRange("bytes=0-", 0), "unsatisfiable", "an empty file has no byte 0");
  });
});

const BYTES = "0123456789";
const CASES: { range: string | null; status: number; body?: string; contentRange?: string }[] = [
  { range: null, status: 200, body: BYTES },
  { range: "bytes=2-5", status: 206, body: "2345", contentRange: "bytes 2-5/10" },
  { range: "bytes=-3", status: 206, body: "789", contentRange: "bytes 7-9/10" },
  { range: "bytes=10-", status: 416, contentRange: "bytes */10" },
  { range: "bytes=0-1,4-5", status: 416, contentRange: "bytes */10" },
];

describe("Range on the server's /api/file", () => {
  const data = makeDir();
  const root = makeVault({ "Media/digits.txt": BYTES, "Welcome.md": "# Welcome\n" });
  before(async () => {
    initAuth({}); // local mode: no password, every read open
    initSite({ ASTROLABE_DATA: data });
    initVault(root);
    await initIndexer();
  });
  after(() => {
    removeVault(root);
    removeVault(data);
  });
  for (const c of CASES) {
    it(`${c.range ?? "no Range"} → ${c.status}`, async () => {
      const res = await api.request("/file?path=Media/digits.txt", { headers: c.range ? { range: c.range } : {} });
      assert.equal(res.status, c.status);
      if (c.contentRange) assert.equal(res.headers.get("content-range"), c.contentRange);
      if (c.body !== undefined) assert.equal(await res.text(), c.body);
    });
  }
});

describe("Range on the pocket's /api/file", () => {
  const fs = makeMemoryFs({ "/vault/Media/digits.txt": BYTES, "/vault/Welcome.md": "# Welcome\n" });
  const git: PocketGit = {
    async commit() {
      return "sha";
    },
    async history() {
      return [];
    },
    async blobAt() {
      return "";
    },
  };
  const held = new Map<string, unknown>();
  const server = createPocketServer({
    io: createVaultIo(fs, "/vault"),
    git,
    store: {
      async get(key) {
        return held.get(key) ?? null;
      },
      async set(key, value) {
        held.set(key, value);
      },
    },
    index: new PocketIndex(),
    repo: { name: "owner/vault", branch: "main" },
    now: () => 1_700_000_000_000,
  });
  for (const c of CASES) {
    it(`${c.range ?? "no Range"} → ${c.status}`, async () => {
      const res = await server.handle({ method: "GET", url: "/api/file?path=Media/digits.txt", headers: c.range ? { range: c.range } : {} });
      assert.equal(res.status, c.status);
      if (c.contentRange) assert.equal(res.headers["Content-Range"], c.contentRange);
      if (c.body !== undefined) assert.equal(new TextDecoder().decode(res.body as Uint8Array), c.body);
    });
  }
});
