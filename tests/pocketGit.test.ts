// THE REPOSITORY ON THE PHONE (mobile/src/pocket/git.ts), end to end, offline.
//
// isomorphic-git over the in-memory filesystem the pocket server's tests use,
// talking smart HTTP to a bare repository in a temporary directory through
// `git http-backend` run as a child process (tests/helpers/gitBackend.ts): no
// socket, no network, no repository but the one each test makes. The
// "laptop" is a working clone of the same bare repository, driven with the
// git CLI, so the remote moves the way a second machine moves it.
//
// What is pinned: a clone is ONE shallow branch with `.trash/` excluded and
// the base recorded; a commit stages writes and deletes and refuses nothing
// to commit; a push lands on the remote and moves the base; a pull tells the
// three cases apart — unchanged, fast-forward, diverged — and a divergence
// sets the phone's version down beside the remote's rather than merging
// prose; a note's past and an old blob are read from the phone's commits.

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { PocketRepo } from "../mobile/src/pocket/git.ts";
import { makeMemoryFs, type MemoryFs } from "./helpers/memoryFs.ts";
import { makeRemote, readLaptop, type Remote } from "./helpers/gitBackend.ts";

const DIR = "/pocket/vault";
const SEED = {
  "Welcome.md": "# Welcome\n\nThe first note.\n",
  "Ideas/Astrolabe.md": "# Astrolabe\n\nAn instrument.\n",
  "Ideas/Old.md": "# Old\n\nSoon gone.\n",
};

let remote: Remote | null = null;
afterEach(() => {
  remote?.cleanup();
  remote = null;
});

async function setup(): Promise<{ remote: Remote; fs: MemoryFs; repo: PocketRepo; base: { value: string | null } }> {
  remote = makeRemote(SEED);
  const fs = makeMemoryFs();
  const base = { value: null as string | null };
  const repo = new PocketRepo({
    fs,
    http: remote.http,
    dir: DIR,
    url: remote.url,
    branch: "main",
    headers: { Authorization: "Basic dGVzdA==" },
    author: { name: "Phone", email: "phone@example.invalid" },
    base: {
      async read() {
        return base.value;
      },
      async write(sha) {
        base.value = sha;
      },
    },
  });
  return { remote, fs, repo, base };
}

const read = async (fs: MemoryFs, file: string): Promise<string | null> => {
  try {
    return String(await fs.promises.readFile(`${DIR}/${file}`, { encoding: "utf8" }));
  } catch {
    return null;
  }
};
const write = (fs: MemoryFs, file: string, content: string): Promise<void> => fs.promises.writeFile(`${DIR}/${file}`, content, { encoding: "utf8" });

describe("clone", () => {
  it("is one shallow branch, with the base recorded and .trash/ excluded", async () => {
    const { remote, fs, repo, base } = await setup();
    const head = await repo.clone();
    assert.equal(head, remote.remoteHead());
    assert.equal(base.value, head);
    assert.equal(await read(fs, "Welcome.md"), SEED["Welcome.md"]);
    assert.equal(await read(fs, "Ideas/Astrolabe.md"), SEED["Ideas/Astrolabe.md"]);
    // depth 1: the first commit is on the remote and not on the phone
    const past = await repo.history("Welcome.md", 10);
    assert.deepEqual(past.map((r) => r.subject), ["The notes"]);
    assert.equal(String(await fs.promises.readFile(`${DIR}/.git/shallow`, { encoding: "utf8" })).trim(), head);
    assert.match(String(await fs.promises.readFile(`${DIR}/.git/info/exclude`, { encoding: "utf8" })), /^\.trash\/$/m);
    // the token rode in a header, and the URL carries no credentials
    assert.ok(remote.requests.length > 0);
    assert.ok(remote.requests.every((r) => r.auth === "Basic dGVzdA==" && !r.url.includes("@")));
    const config = String(await fs.promises.readFile(`${DIR}/.git/config`, { encoding: "utf8" }));
    assert.ok(!config.includes("dGVzdA=="), "the token is never written into .git/config");
    assert.equal(await repo.ahead(), 0);
  });
});

describe("commit", () => {
  it("stages a write and a delete, counts itself ahead, and commits nothing when there is nothing", async () => {
    const { fs, repo } = await setup();
    await repo.clone();
    await write(fs, "Welcome.md", "# Welcome\n\nWritten on the phone.\n");
    await fs.promises.unlink(`${DIR}/Ideas/Old.md`);
    const sha = await repo.commit("Astrolabe pocket: Welcome", ["Welcome.md", "Ideas/Old.md", "Ideas/Old.md"]);
    assert.match(sha ?? "", /^[0-9a-f]{40}$/);
    assert.equal(await repo.ahead(), 1);
    const [entry] = await repo.history("Welcome.md", 1);
    assert.equal(entry.sha, sha);
    assert.equal(entry.subject, "Astrolabe pocket: Welcome");
    assert.equal(await repo.commit("nothing", ["Never-existed.md"]), null, "an untracked, absent path is nothing to commit");
    await fs.promises.mkdir(`${DIR}/.trash`);
    await write(fs, ".trash/Welcome.md", "undo copy");
    assert.equal(await repo.commit("the drawer", [".trash/Welcome.md"]), null, ".trash/ is never committed");
  });
});

describe("push", () => {
  it("lands the phone's commit on the remote and moves the base", async () => {
    const { remote, fs, repo, base } = await setup();
    await repo.clone();
    await write(fs, "Phone note.md", "# From the phone\n");
    const sha = await repo.commit("Astrolabe pocket: Phone note", ["Phone note.md"]);
    assert.equal(await repo.push(), true);
    assert.equal(remote.remoteHead(), sha);
    assert.equal(remote.remoteFile("Phone note.md"), "# From the phone\n");
    assert.equal(base.value, sha);
    assert.equal(await repo.ahead(), 0);
  });
});

describe("pull", () => {
  it("is unchanged when the remote has not moved", async () => {
    const { repo } = await setup();
    const head = await repo.clone();
    const result = await repo.pull();
    assert.equal(result.kind, "unchanged");
    assert.equal(result.remoteSha, head);
    assert.deepEqual([result.changed, result.removed, result.conflicts], [[], [], []]);
  });

  it("fast-forwards what the laptop wrote, and names what changed and what went", async () => {
    const { remote, fs, repo, base } = await setup();
    await repo.clone();
    const sha = remote.laptopCommit({ "Ideas/Astrolabe.md": "# Astrolabe\n\nEdited on the laptop.\n", "New.md": "# New\n", "Ideas/Old.md": null }, "From the laptop");
    const result = await repo.pull();
    assert.equal(result.kind, "fast-forward");
    assert.equal(result.remoteSha, sha);
    assert.deepEqual(result.changed.sort(), ["Ideas/Astrolabe.md", "New.md"]);
    assert.deepEqual(result.removed, ["Ideas/Old.md"]);
    assert.equal(await read(fs, "Ideas/Astrolabe.md"), "# Astrolabe\n\nEdited on the laptop.\n");
    assert.equal(await read(fs, "Ideas/Old.md"), null);
    assert.equal(base.value, sha);
    assert.equal(await repo.head(), sha);
  });

  it("sets the phone's version down beside the laptop's when both changed one note, and keeps a note only the phone touched", async () => {
    const { remote, fs, repo } = await setup();
    await repo.clone();
    await write(fs, "Welcome.md", "# Welcome\n\nThe phone's sentence.\n");
    await write(fs, "Ideas/Astrolabe.md", "# Astrolabe\n\nOnly the phone touched this.\n");
    await repo.commit("Astrolabe pocket: two notes", ["Welcome.md", "Ideas/Astrolabe.md"]);
    const laptopSha = remote.laptopCommit({ "Welcome.md": "# Welcome\n\nThe laptop's sentence.\n" }, "From the laptop");

    const result = await repo.pull();
    assert.equal(result.kind, "diverged");
    assert.equal(result.remoteSha, laptopSha);
    assert.equal(result.conflicts.length, 1);
    const [pair] = result.conflicts;
    assert.equal(pair.path, "Welcome.md");
    assert.match(pair.phonePath, /^Welcome \(phone\)\.md$/);
    assert.equal(await read(fs, "Welcome.md"), "# Welcome\n\nThe laptop's sentence.\n", "the remote's version keeps the name");
    assert.equal(await read(fs, pair.phonePath), "# Welcome\n\nThe phone's sentence.\n", "the phone's is beside it, whole");
    assert.equal(await read(fs, "Ideas/Astrolabe.md"), "# Astrolabe\n\nOnly the phone touched this.\n");
    // both sentences reach the laptop on the next push
    assert.equal(await repo.push(), true);
    remote.laptopPull();
    assert.equal(readLaptop(remote, "Welcome.md"), "# Welcome\n\nThe laptop's sentence.\n");
    assert.equal(readLaptop(remote, pair.phonePath), "# Welcome\n\nThe phone's sentence.\n");
    assert.equal(readLaptop(remote, "Ideas/Astrolabe.md"), "# Astrolabe\n\nOnly the phone touched this.\n");
  });

  it("a push refused because the remote moved says so, and the pull after it carries both", async () => {
    const { remote, fs, repo } = await setup();
    await repo.clone();
    await write(fs, "Phone.md", "# Phone\n");
    await repo.commit("Astrolabe pocket: Phone", ["Phone.md"]);
    remote.laptopCommit({ "Laptop.md": "# Laptop\n" }, "From the laptop");
    await assert.rejects(() => repo.push(), /fast.?forward|rejected|non-fast/i, "the words session.ts reads as \"the remote moved\"");
    const result = await repo.pull();
    assert.equal(result.kind, "diverged");
    assert.equal(result.conflicts.length, 0, "different notes are not a conflict");
    assert.equal(await repo.push(), true);
    assert.equal(remote.remoteFile("Phone.md"), "# Phone\n");
    assert.equal(remote.remoteFile("Laptop.md"), "# Laptop\n");
  });
});

describe("a note's past", () => {
  it("lists the phone's commits for one file, newest first, and reads an old version back", async () => {
    const { fs, repo } = await setup();
    const cloned = await repo.clone();
    await write(fs, "Welcome.md", "# Welcome\n\nSecond.\n");
    const second = await repo.commit("Astrolabe pocket: Welcome", ["Welcome.md"]);
    const past = await repo.history("Welcome.md", 10);
    assert.deepEqual(past.map((r) => r.sha), [second, cloned]);
    assert.equal(past[0].short, second!.slice(0, 7));
    assert.equal(past[0].subject, "Astrolabe pocket: Welcome");
    assert.equal(await repo.blobAt("Welcome.md", cloned), SEED["Welcome.md"]);
    assert.equal(await repo.blobAt("Nope.md", cloned), null);
    assert.deepEqual(await repo.history("Nope.md", 10), []);
  });
});
