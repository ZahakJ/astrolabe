// The creation ledger (server/created.ts): a post's fallback date is the
// first birthtime this instance saw for a path, not the one the last save
// left, because a save is a rename over the note and mints a new inode.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { createdMs, flushCreated, forgetCreated, resetCreatedForTests } from "../server/created.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";

let data = "";
let vault = "";

describe("the creation ledger", () => {
  before(() => {
    data = mkdtempSync(path.join(tmpdir(), "vellum-created-data-"));
    vault = mkdtempSync(path.join(tmpdir(), "vellum-created-vault-"));
    initSite({ VELLUM_DATA: data });
    initVault(vault);
    resetCreatedForTests();
  });
  after(() => {
    rmSync(data, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  });

  it("seeds from the first birthtime and keeps it when a save mints a newer one", () => {
    const first = createdMs("Essay.md", 1_700_000_000_000, 1_700_000_100_000);
    assert.equal(first, 1_700_000_000_000);
    // The next index sees the inode the save made: a birthtime an hour later.
    const again = createdMs("Essay.md", 1_700_003_600_000, 1_700_003_600_000);
    assert.equal(again, 1_700_000_000_000);
  });

  it("falls back to mtime where the filesystem has no birthtime", () => {
    assert.equal(createdMs("NoBirth.md", 0, 1_600_000_000_000), 1_600_000_000_000);
  });

  it("forgets a path the indexer forgot, so a note that comes back is met fresh", () => {
    createdMs("Gone.md", 1_500_000_000_000, 1_500_000_000_000);
    forgetCreated("Gone.md");
    assert.equal(createdMs("Gone.md", 1_550_000_000_000, 1_550_000_000_000), 1_550_000_000_000);
  });

  it("persists as JSON in the data directory and reads back after a restart", () => {
    flushCreated();
    const file = path.join(data, "created.json");
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { version: number; created: Record<string, number> };
    assert.equal(parsed.version, 1);
    assert.equal(parsed.created["Essay.md"], 1_700_000_000_000);
    resetCreatedForTests(); // the next call must come from the file, not memory
    assert.equal(createdMs("Essay.md", 1_800_000_000_000, 1_800_000_000_000), 1_700_000_000_000);
  });
});
