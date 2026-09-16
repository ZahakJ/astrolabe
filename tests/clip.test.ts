// The clipper's writes (server/clip.ts) against a throwaway vault: a page
// becomes a note under Clips/ that never overwrites, a thought goes under
// `## Captured` today, the token lives in the data directory at 0600 and a
// rotation retires the old one. The HTTP door is exercised by the browser
// harness; this is the write half, which is what the vault keeps.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { captureLine, clipToken, dailyNotePathToday, ensureClipToken, performClip, rotateClipToken } from "../server/clip.ts";
import { initIndexer } from "../server/indexer.ts";
import { initSite } from "../server/site.ts";
import { initVault, VaultError } from "../server/vault.ts";
import { makeDir, makeVault, removeVault } from "./helpers/vault.ts";

const data = makeDir();
const root = makeVault({
  "Inbox.md": "# Inbox\n\nThings.\n",
  "Clips/Taken.md": "---\nclipped: 2026-01-01\n---\n\n# Taken\n",
});

before(async () => {
  initSite({ ASTROLABE_DATA: data });
  initVault(root);
  await initIndexer();
});

after(() => {
  removeVault(root);
  removeVault(data);
});

describe("performClip", () => {
  it("files a page under Clips/ with its source, converted", async () => {
    const out = await performClip({
      url: "https://ex.org/a/b?c=1",
      title: "  A / Title  ",
      html: "<article><h1>A / Title</h1><p>Hello <a href='../x'>there</a>.</p></article>",
      selection: null,
      text: null,
    });
    assert.equal(out.kind, "clipped");
    assert.equal(out.path, "Clips/A Title.md");
    const text = readFileSync(path.join(root, out.path), "utf8");
    assert.match(text, /^---\nsource: "https:\/\/ex\.org\/a\/b\?c=1"\nclipped: \d{4}-\d{2}-\d{2}\n---\n\n# A \/ Title\n\nHello \[there\]\(https:\/\/ex\.org\/x\)\.\n$/);
  });

  it("never overwrites: the same title lands as (2), (3)…", async () => {
    const a = await performClip({ url: "https://ex.org/t", title: "Taken", html: null, selection: null, text: null });
    assert.equal(a.path, "Clips/Taken (2).md");
    const b = await performClip({ url: "https://ex.org/t2", title: "Taken", html: null, selection: null, text: "Some words https://ex.org/t2 after" });
    assert.equal(b.path, "Clips/Taken (3).md");
    assert.match(readFileSync(path.join(root, b.path), "utf8"), /# Taken\n\nSome words after\n$/);
    assert.equal(readFileSync(path.join(root, "Clips/Taken.md"), "utf8"), "---\nclipped: 2026-01-01\n---\n\n# Taken\n");
  });

  it("takes the title from the page, then the host; refuses what is not a web address", async () => {
    const titled = await performClip({ url: "https://ex.org/p", title: null, html: "<html><head><title>From &lt;the&gt; page</title></head><body><p>x</p></body></html>", selection: null, text: null });
    assert.equal(titled.path, "Clips/From the page.md");
    const host = await performClip({ url: "https://host.example/deep", title: "", html: null, selection: "picked words", text: null });
    assert.equal(host.path, "Clips/host.example.md");
    assert.match(readFileSync(path.join(root, host.path), "utf8"), /picked words/);
    await assert.rejects(
      performClip({ url: "javascript:alert(1)", title: "x", html: null, selection: null, text: null }),
      (err: unknown) => err instanceof VaultError && err.code === "clipBadUrl",
    );
  });

  it("a thought with no address is captured into today's note", async () => {
    const out = await performClip({ url: null, title: null, html: null, selection: null, text: "just a thought" });
    assert.equal(out.kind, "captured");
    assert.equal(out.path, dailyNotePathToday());
    const text = readFileSync(path.join(root, out.path), "utf8");
    assert.match(text, /^## Captured\n\n- \d\d:\d\d just a thought\n$/);
    // A second one joins the section.
    await performClip({ url: null, title: null, html: null, selection: null, text: "and another" });
    assert.match(readFileSync(path.join(root, out.path), "utf8"), /- \d\d:\d\d just a thought\n- \d\d:\d\d and another\n$/);
    await assert.rejects(
      performClip({ url: null, title: null, html: null, selection: null, text: "   " }),
      (err: unknown) => err instanceof VaultError && err.code === "captureEmpty",
    );
  });
});

describe("captureLine", () => {
  it("appends into a named note with the caller's clock, and creates a missing one", async () => {
    await captureLine("Inbox.md", "into the inbox", "08:30");
    assert.equal(readFileSync(path.join(root, "Inbox.md"), "utf8"), "# Inbox\n\nThings.\n\n## Captured\n\n- 08:30 into the inbox\n");
    const made = await captureLine("New/Place.md", "first", "09:00");
    assert.equal(made, "New/Place.md");
    assert.equal(readFileSync(path.join(root, "New/Place.md"), "utf8"), "## Captured\n\n- 09:00 first\n");
  });
});

describe("the token", () => {
  it("is made on first ask, kept at 0600 in the data directory, and retired by a rotation", () => {
    assert.equal(clipToken(), null);
    const first = ensureClipToken();
    assert.match(first, /^[a-f0-9]{48}$/);
    assert.equal(ensureClipToken(), first);
    const file = path.join(data, "clip-token");
    assert.ok(existsSync(file));
    if (process.platform !== "win32") assert.equal(statSync(file).mode & 0o777, 0o600);
    const next = rotateClipToken();
    assert.notEqual(next, first);
    assert.equal(clipToken(), next);
  });
});
