// Note versions without git (server/versions.ts, hooked into vault.writeNote).
//
// The promise under test is narrow and load-bearing: a write through the
// vault's one write path leaves the PREVIOUS content somewhere the product
// can reach, on an instance that has never heard of git. Everything else here
// is the shape of that promise — the collapse that keeps a burst of autosaves
// from being forty copies of one mistake, the caps that keep the store from
// being the disk's problem, the rename that carries a note's past with its
// name, and the restore that is itself a version.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  VERSIONS_PER_NOTE,
  initVersions,
  listVersions,
  moveVersions,
  readVersion,
  resetVersionsForTests,
} from "../server/versions.ts";
import {
  createNote,
  deleteNote,
  initVault,
  moveFolder,
  purgeFromTrash,
  readNote,
  renameNote,
  restoreFromTrash,
  writeNote,
} from "../server/vault.ts";
import { makeDir, makeVault, removeVault } from "./helpers/vault.ts";

const vault = makeVault({
  "Essay.md": "first draft\n",
  "Burst.md": "b0\n",
  "Capped.md": "c0\n",
  "Old Name.md": "named\n",
  "Restore.md": "r0\n",
  "Gone.md": "gone\n",
  "ForGood.md": "for good\n",
  "Folder/Inner.md": "inner\n",
  "Big.md": "big\n",
  "Off.md": "off\n",
});
const data = makeDir();
const storeDir = path.join(data, "versions");

/** Where the store keeps one note's versions — the contract's own spelling. */
const dirFor = (rel: string) => path.join(storeDir, createHash("sha1").update(rel).digest("hex"));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A collapse window short enough to test both sides of in one sitting. */
const WINDOW_MS = 120;

let enabled = true;

before(() => {
  initVault(vault);
});
beforeEach(() => {
  initVersions({ dir: storeDir, enabled: () => enabled, windowMs: WINDOW_MS });
});
after(() => {
  resetVersionsForTests();
  removeVault(vault);
  removeVault(data);
});

describe("a write keeps what it replaced", () => {
  it("stores the previous content under sha1(path)/<at>.md with an index", async () => {
    const before = statSync(path.join(vault, "Essay.md")).mtimeMs;
    await writeNote("Essay.md", "second draft\n");
    const versions = await listVersions("Essay.md");
    assert.equal(versions.length, 1);
    const [v] = versions;
    assert.equal(v.reason, "autosave");
    assert.equal(v.mtimeMs, before, "the version carries the mtime of the text it holds");
    assert.equal(v.size, Buffer.byteLength("first draft\n"));
    const dir = dirFor("Essay.md");
    assert.equal(readFileSync(path.join(dir, `${v.at}.md`), "utf8"), "first draft\n");
    const index = JSON.parse(readFileSync(path.join(dir, "index.json"), "utf8"));
    assert.equal(index.path, "Essay.md");
    assert.equal(index.versions.length, 1);
    // 0600 on both, like everything else in the data directory.
    assert.equal(statSync(path.join(dir, `${v.at}.md`)).mode & 0o777, 0o600);
    assert.equal(statSync(path.join(dir, "index.json")).mode & 0o777, 0o600);
    assert.equal(await readVersion("Essay.md", v.at), "first draft\n");
  });

  it("keeps nothing for a new note, and nothing for a write that changes nothing", async () => {
    await createNote("Fresh.md");
    assert.deepEqual(await listVersions("Fresh.md"), []);
    await sleep(WINDOW_MS + 20);
    const current = (await readNote("Essay.md")).content;
    await writeNote("Essay.md", current);
    assert.equal((await listVersions("Essay.md")).length, 1, "same bytes are not a version");
  });

  it("leaves no temp file behind", async () => {
    const names = readdirSync(dirFor("Essay.md"));
    assert.ok(names.every((n) => !n.endsWith(".tmp")), names.join(", "));
  });

  it("answers null for a version that is not there", async () => {
    assert.equal(await readVersion("Essay.md", 1), null);
    assert.equal(await readVersion("Never.md", 1), null);
    assert.deepEqual(await listVersions("Never.md"), []);
  });
});

describe("a burst collapses into the text from before it", () => {
  it("keeps the OLDER version and drops the ones inside the window", async () => {
    await writeNote("Burst.md", "b1\n"); // keeps b0
    await writeNote("Burst.md", "b2\n"); // inside the window: collapses
    await writeNote("Burst.md", "b3\n"); // still inside
    let versions = await listVersions("Burst.md");
    assert.equal(versions.length, 1);
    assert.equal(await readVersion("Burst.md", versions[0].at), "b0\n", "the copy from before the burst");
    await sleep(WINDOW_MS + 20);
    await writeNote("Burst.md", "b4\n"); // a new window: keeps b3
    versions = await listVersions("Burst.md");
    assert.equal(versions.length, 2);
    assert.equal(await readVersion("Burst.md", versions[0].at), "b3\n");
    assert.ok(versions[0].at > versions[1].at, "newest first");
  });
});

describe("the per-note cap evicts the oldest", () => {
  it(`holds ${VERSIONS_PER_NOTE} and forgets the first`, async () => {
    // A zero window so every write is a version; the cap is the thing under test.
    initVersions({ dir: storeDir, enabled: () => true, windowMs: 0 });
    for (let i = 1; i <= VERSIONS_PER_NOTE + 3; i++) await writeNote("Capped.md", `c${i}\n`);
    const versions = await listVersions("Capped.md");
    assert.equal(versions.length, VERSIONS_PER_NOTE);
    const oldest = versions.at(-1)!;
    assert.equal(await readVersion("Capped.md", oldest.at), "c3\n", "c0..c2 were evicted");
    const blobs = readdirSync(dirFor("Capped.md")).filter((n) => n.endsWith(".md"));
    assert.equal(blobs.length, VERSIONS_PER_NOTE, "evicted blobs are removed from disk too");
  });
});

describe("the store cap evicts the oldest across notes", () => {
  it("brings the whole store under its ceiling", async () => {
    const own = makeDir();
    initVersions({ dir: path.join(own, "versions"), enabled: () => true, windowMs: 0, storeBytes: 70 });
    await writeNote("Essay.md", "A".repeat(30) + "\n"); // keeps "second draft\n" (13 bytes)
    await writeNote("Essay.md", "B".repeat(30) + "\n"); // keeps 31 bytes → 44
    await writeNote("Essay.md", "C".repeat(30) + "\n"); // keeps 31 bytes → 75 → the 13 go
    const versions = await listVersions("Essay.md");
    const total = versions.reduce((n, v) => n + v.size, 0);
    assert.ok(total <= 70, `store holds ${total} bytes`);
    assert.equal(versions.length, 2);
    assert.equal(await readVersion("Essay.md", versions.at(-1)!.at), "A".repeat(30) + "\n");
    removeVault(own);
  });
});

describe("a note past the size ceiling is not versioned", () => {
  it("skips a 2 MB note", async () => {
    await writeNote("Big.md", "x".repeat(2 * 1024 * 1024 + 1)); // keeps the small "big\n"
    assert.equal((await listVersions("Big.md")).length, 1);
    await sleep(WINDOW_MS + 20);
    await writeNote("Big.md", "small again\n");
    assert.equal((await listVersions("Big.md")).length, 1, "the 2 MB content was over the ceiling");
  });
});

describe("the switch", () => {
  it("keeps nothing while off, and resumes when on — read at every write", async () => {
    enabled = false;
    await writeNote("Off.md", "off1\n");
    assert.deepEqual(await listVersions("Off.md"), []);
    enabled = true;
    await writeNote("Off.md", "off2\n");
    assert.equal((await listVersions("Off.md")).length, 1);
  });

  it("is a no-op with no store initialised (the durability suite's world)", async () => {
    resetVersionsForTests();
    await writeNote("Off.md", "off3\n");
    assert.deepEqual(await listVersions("Off.md"), []);
    assert.equal((await readNote("Off.md")).content, "off3\n", "the write itself is untouched");
  });
});

describe("deleted for good means the versions too", () => {
  it("drops a note's versions on a permanent delete", async () => {
    await writeNote("ForGood.md", "for good 2\n");
    assert.equal((await listVersions("ForGood.md")).length, 1);
    await deleteNote("ForGood.md", { permanent: true });
    assert.equal((await listVersions("ForGood.md")).length, 0);
    assert.equal(existsSync(dirFor("ForGood.md")), false);
  });
});

describe("a vault-wide replace keeps the text before it", () => {
  it("is not an autosave: the window does not swallow it", async () => {
    await writeNote("Burst.md", "b1\n");
    const before = (await listVersions("Burst.md")).length;
    await writeNote("Burst.md", "b2\n", undefined, "bulk");
    assert.equal((await listVersions("Burst.md")).length, before + 1);
  });
});

describe("a rename moves the folder", () => {
  it("carries the versions to the new path and rewrites the index", async () => {
    await writeNote("Old Name.md", "renamed soon\n");
    const oldDir = dirFor("Old Name.md");
    assert.ok(existsSync(oldDir));
    await renameNote("Old Name.md", "New Name.md");
    assert.ok(!existsSync(oldDir), "nothing left under the old hash");
    const versions = await listVersions("New Name.md");
    assert.equal(versions.length, 1);
    assert.equal(await readVersion("New Name.md", versions[0].at), "named\n");
    const index = JSON.parse(readFileSync(path.join(dirFor("New Name.md"), "index.json"), "utf8"));
    assert.equal(index.path, "New Name.md");
  });

  it("merges into a destination that already holds versions", async () => {
    await sleep(WINDOW_MS + 20);
    await writeNote("Essay.md", "merge me\n");
    const mine = (await listVersions("Essay.md")).length;
    assert.ok(mine >= 1);
    await moveVersions("New Name.md", "Essay.md");
    const merged = await listVersions("Essay.md");
    assert.equal(merged.length, mine + 1);
    assert.ok(!existsSync(dirFor("New Name.md")));
  });

  it("follows every note in a moved folder", async () => {
    await writeNote("Folder/Inner.md", "inner 2\n");
    await moveFolder("Folder", "Moved");
    assert.deepEqual(await listVersions("Folder/Inner.md"), []);
    const versions = await listVersions("Moved/Inner.md");
    assert.equal(versions.length, 1);
    assert.equal(await readVersion("Moved/Inner.md", versions[0].at), "inner\n");
  });
});

describe("a restore writes through the same path", () => {
  it("puts the version back and keeps the replaced text as a 'restore' version, outside the window", async () => {
    await writeNote("Restore.md", "r1\n"); // keeps r0
    const [v0] = await listVersions("Restore.md");
    const content = await readVersion("Restore.md", v0.at);
    assert.equal(content, "r0\n");
    // Immediately — inside the collapse window — as the route does it.
    await writeNote("Restore.md", content!, undefined, "restore");
    assert.equal((await readNote("Restore.md")).content, "r0\n");
    const versions = await listVersions("Restore.md");
    assert.equal(versions.length, 2, "a restore is exempt from the collapse");
    assert.equal(versions[0].reason, "restore");
    assert.equal(await readVersion("Restore.md", versions[0].at), "r1\n", "the text the restore replaced");
  });
});

describe("the trash", () => {
  it("keeps a deleted note's versions until the entry is purged", async () => {
    await writeNote("Gone.md", "gone 2\n");
    const { trashPath } = await deleteNote("Gone.md");
    assert.ok(trashPath);
    assert.equal((await listVersions("Gone.md")).length, 1, "a delete keeps them");
    await purgeFromTrash(path.posix.basename(trashPath!));
    assert.deepEqual(await listVersions("Gone.md"), []);
    assert.ok(!existsSync(dirFor("Gone.md")));
  });

  it("spares the versions of a live note that took the path again", async () => {
    await writeNote("Gone.md", "reborn\n");
    await writeNote("Gone.md", "reborn 2\n"); // keeps "reborn"
    const { trashPath } = await deleteNote("Gone.md");
    // A NEW note at the same path, with a history of its own ("third life").
    await writeNote("Gone.md", "third life\n");
    await writeNote("Gone.md", "third life 2\n");
    const beforePurge = await listVersions("Gone.md");
    await purgeFromTrash(path.posix.basename(trashPath!));
    assert.deepEqual(await listVersions("Gone.md"), beforePurge, "the live note's history is its own");
  });

  it("moves the versions when a restore has to land beside a taken origin", async () => {
    // "Gone.md" is live again; trash another copy of it and restore that.
    await writeNote("Gone.md", "to be trashed\n");
    const { trashPath } = await deleteNote("Gone.md");
    await writeNote("Gone.md", "taken\n"); // origin taken by a fresh note
    const result = await restoreFromTrash(path.posix.basename(trashPath!));
    assert.equal(result.renamed, true);
    assert.equal(result.path, "Gone-2.md");
    assert.ok(existsSync(dirFor("Gone-2.md")), "the origin's versions followed the restore");
  });
});
