// FILMS OFF THE DISK: /api/file serves a film in ranges without reading it
// into memory, with its own type for every container; the upload takes a
// film past a picture's cap and streams it to disk; a published film's poster
// is a visitor's to fetch; the pocket answers ranges from one read; the
// shell's frame policy opens only on the switch.
//
// The large file is SPARSE — `truncate` to 600 MB costs no disk — and the
// memory check reads a range from its far end: a server that loaded the file
// to slice it would grow by 600 MB, one that streams grows by a chunk.

import assert from "node:assert/strict";
import { openSync, closeSync, ftruncateSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { initAuth } from "../server/auth.ts";
import { initIndexer, isAllowedAttachment } from "../server/indexer.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { api } from "../server/api.ts";
import { Hono } from "hono";
import { patchSettings } from "../server/settings.ts";
import { makeDir, makeVault, removeVault } from "./helpers/vault.ts";
import { makeMemoryFs } from "./helpers/memoryFs.ts";
import { PocketIndex } from "../mobile/src/pocket/index.ts";
import { createPocketServer } from "../mobile/src/pocket/server.ts";
import { createVaultIo } from "../mobile/src/pocket/vaultIo.ts";

const BIG = 600 * 1024 * 1024;

// Mounted where the shell mounts it, so the body cap (keyed on `/api/upload`)
// is the one a real upload meets.
const app = new Hono().route("/api", api);

describe("a film on the server", () => {
  const data = makeDir();
  const root = makeVault({
    "Media/tiny.webm": "\x1a\x45\xdf\xa3 not really a film",
    "Media/a.mp4": "x",
    "Media/a.m4v": "x",
    "Media/a.mov": "x",
    "Media/a.mkv": "x",
    "Media/a.ogv": "x",
    "Media/frame.jpg": "x",
    "Media/secret.jpg": "x",
    "Films.md": "---\npublish: true\n---\n# Films\n\n![[tiny.webm|480|poster=frame.jpg]]\n",
    "Draft.md": "# Draft\n\n![[a.mp4|poster=secret.jpg]]\n",
  });
  const bigPath = path.join(root, "Media/big.mp4");
  before(async () => {
    const fd = openSync(bigPath, "w");
    ftruncateSync(fd, BIG);
    closeSync(fd);
    initAuth({}); // local mode: no password, the owner's session
    initSite({ ASTROLABE_DATA: data });
    initVault(root);
    await initIndexer();
  });
  after(() => {
    removeVault(root);
    removeVault(data);
  });

  it("answers a range at the far end of a 600 MB film without reading it into memory", async () => {
    global.gc?.();
    const before = process.memoryUsage();
    const res = await api.request("/file?path=Media/big.mp4", { headers: { range: `bytes=${BIG - 1024}-` } });
    assert.equal(res.status, 206);
    assert.equal(res.headers.get("content-range"), `bytes ${BIG - 1024}-${BIG - 1}/${BIG}`);
    assert.equal(res.headers.get("content-type"), "video/mp4");
    assert.equal(res.headers.get("accept-ranges"), "bytes");
    assert.equal((await res.arrayBuffer()).byteLength, 1024);
    const grown = process.memoryUsage().rss - before.rss;
    assert.ok(grown < 100 * 1024 * 1024, `rss grew ${Math.round(grown / 1048576)} MB`);
  });

  it("a whole-file answer is a stream: the headers come before the bytes", async () => {
    global.gc?.();
    const before = process.memoryUsage().rss;
    const res = await api.request("/file?path=Media/big.mp4");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-length"), String(BIG));
    const reader = res.body?.getReader();
    assert.ok(reader);
    const first = await reader.read();
    assert.ok(first.value && first.value.byteLength > 0 && first.value.byteLength < BIG);
    await reader.cancel();
    const grown = process.memoryUsage().rss - before;
    assert.ok(grown < 100 * 1024 * 1024, `rss grew ${Math.round(grown / 1048576)} MB`);
  });

  it("names every container's type", async () => {
    const want: Record<string, string> = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", mkv: "video/x-matroska", ogv: "video/ogg" };
    for (const [ext, type] of Object.entries(want)) {
      const res = await api.request(`/file?path=Media/a.${ext}`, { headers: { range: "bytes=0-0" } });
      assert.equal(res.status, 206, ext);
      assert.equal(res.headers.get("content-type"), type, ext);
      await res.arrayBuffer();
    }
  });

  it("a published film's poster is a visitor's; a draft's is not", () => {
    assert.equal(isAllowedAttachment("Media/tiny.webm"), true);
    assert.equal(isAllowedAttachment("Media/frame.jpg"), true);
    assert.equal(isAllowedAttachment("Media/secret.jpg"), false);
  });

  it("takes a film past a picture's cap, streamed to disk under its own name", async () => {
    const bytes = new Uint8Array(12 * 1024 * 1024);
    bytes.set([0x1a, 0x45, 0xdf, 0xa3], 0);
    bytes[bytes.length - 1] = 7;
    const form = new FormData();
    form.append("file", new File([bytes], "holiday.mkv", { type: "video/x-matroska" }));
    const res = await app.request("/api/upload", { method: "POST", body: form });
    assert.equal(res.status, 200, await res.clone().text());
    const { path: rel } = (await res.json()) as { path: string };
    assert.match(rel, /holiday\.mkv$/, "the uploader's .mkv is kept");
    const abs = path.join(root, rel);
    assert.ok(existsSync(abs));
    assert.equal(statSync(abs).size, bytes.length);
    assert.equal(readFileSync(abs)[bytes.length - 1], 7, "every byte written");
  });

  it("still holds a picture to a picture's cap", async () => {
    const bytes = new Uint8Array(11 * 1024 * 1024);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const form = new FormData();
    form.append("file", new File([bytes], "huge.png", { type: "image/png" }));
    const res = await app.request("/api/upload", { method: "POST", body: form });
    assert.equal(res.status, 413);
  });
});

describe("a film on the pocket", () => {
  it("is served in ranges, with its type, again and again from one read", async () => {
    // A megabyte and a bit: large enough to be the file the pocket keeps.
    const film = "0123456789".repeat(110_000);
    const fs = makeMemoryFs({ "/vault/Media/clip.webm": film, "/vault/Welcome.md": "# Welcome\n" });
    const io = createVaultIo(fs, "/vault");
    let reads = 0;
    const counted = {
      ...io,
      readBytes: async (p: string) => {
        reads++;
        return io.readBytes(p);
      },
    };
    const held = new Map<string, unknown>();
    const server = createPocketServer({
      io: counted,
      git: { commit: async () => "sha", history: async () => [], blobAt: async () => "" },
      store: { get: async (k) => held.get(k) ?? null, set: async (k, v) => void held.set(k, v) },
      index: new PocketIndex(),
      repo: { name: "owner/vault", branch: "main" },
      now: () => 1_700_000_000_000,
    });
    for (const [range, body] of [["bytes=0-3", "0123"], ["bytes=10-12", "012"], ["bytes=-2", "89"]] as const) {
      const res = await server.handle({ method: "GET", url: "/api/file?path=Media/clip.webm", headers: { range } });
      assert.equal(res.status, 206, range);
      assert.equal(res.headers["Content-Type"], "video/webm");
      assert.equal(new TextDecoder().decode(res.body as Uint8Array), body, range);
    }
    assert.equal(reads, 1, "one read of the film, three answers");
  });
});

describe("the shell's frame policy", () => {
  it("is 'none' until Embed external video is on, and https frames while it is", async () => {
    const data = makeDir();
    const root = makeVault({ "Welcome.md": "# Hi\n" });
    try {
      initSite({ ASTROLABE_DATA: data });
      initVault(root);
      patchSettings({ externalVideo: null });
      const src = readFileSync(new URL("../server/index.ts", import.meta.url), "utf8");
      // The switch's door is the only change to the policy: read it as written.
      assert.match(src, /"frame-src 'none'"/);
      assert.match(src, /getSettings\(\)\.externalVideo === true \? SHELL_CSP\.replace\("frame-src 'none'", "frame-src https:"\) : SHELL_CSP/);
      patchSettings({ externalVideo: true });
      const { getSettings } = await import("../server/settings.ts");
      assert.equal(getSettings().externalVideo, true);
      patchSettings({ externalVideo: null });
      assert.equal(getSettings().externalVideo, undefined);
      assert.throws(() => patchSettings({ externalVideo: "yes" as unknown as boolean }), /must be a boolean/);
    } finally {
      removeVault(root);
      removeVault(data);
    }
  });
});
