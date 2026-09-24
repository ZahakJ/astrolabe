// ONE POCKET VAULT, ASSEMBLED (mobile/src/pocket/session.ts), offline.
//
// The session is the filesystem, the index, the repository and the server with
// one lifetime, and the sync loop over them: pull on open and on foreground,
// commit on save, push debounced and on background, one repository turn at a
// time. Under test here against the in-memory filesystem and a bare repository
// answered by `git http-backend` as a child process (tests/helpers/
// gitBackend.ts) — no socket, no network, no repository but the test's own.

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { PocketSession } from "../mobile/src/pocket/session.ts";
import type { SyncState } from "../mobile/src/pocket/sync.ts";
import type { VaultEvent } from "../shared/types.ts";
import { makeMemoryFs, type MemoryFs } from "./helpers/memoryFs.ts";
import { makeRemote, type Remote } from "./helpers/gitBackend.ts";

const DIR = "/pocket/vault";
const SEED = {
  "Welcome.md": "# Welcome\n\nLinks to [[Ideas/Astrolabe]].\n",
  "Ideas/Astrolabe.md": "# Astrolabe\n",
  "Media/diagram.png": "not really a png",
};

let remote: Remote | null = null;
const sessions: PocketSession[] = [];
afterEach(async () => {
  // A save schedules a push 30s out; the test's own push clears it, and so
  // does this, so no timer outlives its test.
  for (const s of sessions.splice(0)) await s.push().catch(() => {});
  remote?.cleanup();
  remote = null;
});

interface Harness {
  remote: Remote;
  fs: MemoryFs;
  session: PocketSession;
  states: SyncState[];
  events: VaultEvent[];
  left: { value: number };
  call(method: string, url: string, body?: unknown): Promise<{ status: number; json: any }>;
}

async function open(options: { leave?: boolean; clone?: boolean } = {}): Promise<Harness> {
  remote = makeRemote(SEED);
  const fs = makeMemoryFs();
  const states: SyncState[] = [];
  const events: VaultEvent[] = [];
  const left = { value: 0 };
  let base: string | null = null;
  const held = new Map<string, unknown>();
  let clock = 1_700_000_000_000;
  const session = new PocketSession({
    fs,
    http: remote.http,
    dir: DIR,
    repo: { fullName: "owner/vault", branch: "main", cloneUrl: remote.url },
    headers: {},
    author: { name: "Phone", email: "phone@example.invalid" },
    base: {
      async read() {
        return base;
      },
      async write(sha) {
        base = sha;
      },
    },
    store: {
      async get(k) {
        return held.get(k) ?? null;
      },
      async set(k, v) {
        held.set(k, v);
      },
    },
    onSync: (s) => states.push(s),
    onEvent: (e) => events.push(e),
    ...(options.leave ? { onLeave: async () => void left.value++ } : {}),
    now: () => (clock += 1000),
  });
  sessions.push(session);
  if (options.clone !== false) await session.repo.clone();
  const call = async (method: string, url: string, body?: unknown) => {
    const answer = await session.handle({ method, url, headers: {}, body: body === undefined ? null : JSON.stringify(body) });
    const text = typeof answer.body === "string" ? answer.body : new TextDecoder().decode(answer.body ?? new Uint8Array());
    let json: unknown = text;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: answer.status, json };
  };
  return { remote, fs, session, states, events, left, call };
}

const last = (h: Harness): SyncState => h.states[h.states.length - 1];

async function until(check: () => boolean, ms = 10_000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("build", () => {
  it("reads the working tree into the index, notes and assets apart, and says where the sync stands", async () => {
    const h = await open();
    const built = await h.session.build();
    assert.equal(built.notes, 3, "the two notes and the README");
    assert.equal(built.assets, 1, "the picture");
    assert.ok(h.session.index.notes.has("Welcome.md"));
    assert.ok(h.session.index.assets.has("Media/diagram.png"));
    assert.equal(last(h).ahead, 0);
    assert.deepEqual(last(h).conflicts, []);
  });

  it("names a standing (phone) pair from the tree, so a reopened app still says so", async () => {
    const h = await open();
    await h.fs.promises.writeFile(`${DIR}/Welcome (phone).md`, "# mine\n", { encoding: "utf8" });
    await h.session.build();
    assert.deepEqual(last(h).conflicts.map((p) => p.phonePath), ["Welcome (phone).md"]);
  });
});

describe("the server it carries", () => {
  it("answers /api/* from the index, and a save is a commit the sync line counts", async () => {
    const h = await open();
    await h.session.build();
    const tree = await h.call("GET", "/api/tree");
    assert.equal(tree.status, 200);
    const note = await h.call("GET", "/api/note?path=Welcome.md");
    assert.equal(note.json.content, SEED["Welcome.md"]);
    const saved = await h.call("PUT", "/api/note?path=Welcome.md", { content: "# Welcome\n\nOn the phone.\n", baseMtimeMs: note.json.mtimeMs });
    assert.equal(saved.status, 200);
    assert.equal(last(h).ahead, 1, "committed");
    assert.equal(await h.session.repo.ahead(), 1);
    const sync = await h.call("GET", "/api/pocket/sync");
    assert.equal(sync.json.repo, "owner/vault");
    assert.equal(sync.json.branch, "main");
    assert.equal(sync.json.ahead, 1);
  });

  it("leaves only through the caller's door, and refuses without one", async () => {
    const without = await open();
    await assert.rejects(() => without.call("POST", "/api/pocket/leave"));
    remote?.cleanup();
    const withDoor = await open({ leave: true });
    const answer = await withDoor.call("POST", "/api/pocket/leave");
    assert.equal(answer.status, 200);
    assert.equal(withDoor.left.value, 1);
  });
});

describe("the sync loop", () => {
  it("push with nothing ahead asks the network nothing and says synced", async () => {
    const h = await open();
    await h.session.build();
    const before = h.remote.requests.length;
    await h.session.push();
    assert.equal(h.remote.requests.length, before);
    assert.equal(last(h).phase, "idle");
    assert.ok(last(h).syncedAtMs !== null);
  });

  it("a save, then a push, reaches the remote; the line goes pushing → idle with nothing ahead", async () => {
    const h = await open();
    await h.session.build();
    const note = await h.call("GET", "/api/note?path=Ideas/Astrolabe.md");
    await h.call("PUT", "/api/note?path=Ideas/Astrolabe.md", { content: "# Astrolabe\n\nFrom the phone.\n", baseMtimeMs: note.json.mtimeMs });
    await h.session.push();
    assert.equal(h.remote.remoteFile("Ideas/Astrolabe.md"), "# Astrolabe\n\nFrom the phone.\n");
    const phases = h.states.map((s) => s.phase);
    assert.ok(phases.includes("pushing"));
    assert.equal(last(h).phase, "idle");
    assert.equal(last(h).ahead, 0);
    assert.equal(h.session.syncStatus().error, null);
  });

  it("a pull brings the laptop's note into the index and tells the client once", async () => {
    const h = await open();
    await h.session.build();
    h.remote.laptopCommit({ "From the laptop.md": "# From the laptop\n", "Ideas/Astrolabe.md": null }, "Laptop");
    await h.session.pull();
    assert.ok(h.session.index.notes.has("From the laptop.md"));
    assert.ok(!h.session.index.notes.has("Ideas/Astrolabe.md"));
    assert.deepEqual(h.events, [{ kind: "bulk", path: "" }]);
    assert.equal(last(h).phase, "idle");
  });

  it("a push the remote refused as moved pulls, then pushes both", async () => {
    const h = await open();
    await h.session.build();
    await h.call("PUT", "/api/note?path=Phone.md", { content: "# Phone\n" });
    h.remote.laptopCommit({ "Laptop.md": "# Laptop\n" }, "Laptop");
    await h.session.push();
    assert.ok(h.states.some((s) => s.error === "remote-moved"), "the refusal is named, not reported as a failure of the network");
    await until(() => h.remote!.remoteFile("Phone.md") !== null);
    assert.equal(h.remote.remoteFile("Laptop.md"), "# Laptop\n");
    await until(() => last(h).phase === "idle" && last(h).ahead === 0);
  });

  it("no network is 'offline', not a git error", async () => {
    const h = await open();
    await h.session.build();
    h.remote.offline(true);
    await h.session.pull();
    assert.equal(last(h).online, false);
    assert.equal(last(h).error, null);
    h.remote.offline(false);
    await h.session.pull();
    assert.equal(last(h).online, true);
  });

  it("a refusal that is not the network is kept as the line's sentence", async () => {
    const h = await open();
    await h.session.build();
    // A revoked token: the remote answers, and what it answers is a refusal.
    h.remote.refuse(401);
    await h.session.pull();
    assert.equal(last(h).online, true);
    assert.ok(last(h).error, "a sentence is kept");
  });

  it("one repository turn at a time: a pull and a push asked together run in order", async () => {
    const h = await open();
    await h.session.build();
    await h.call("PUT", "/api/note?path=Order.md", { content: "# Order\n" });
    h.remote.laptopCommit({ "Other.md": "# Other\n" }, "Laptop");
    await Promise.all([h.session.pull(), h.session.push()]);
    const phases = h.states.map((s) => s.phase).filter((p) => p !== "idle");
    assert.deepEqual(phases.slice(0, 2), ["pulling", "pushing"]);
    assert.equal(h.remote.remoteFile("Order.md"), "# Order\n");
  });
});

describe("the lifecycle", () => {
  it("a hidden page flushes the tree and pushes; a visible one pulls; the teardown lets go", async () => {
    const h = await open();
    await h.session.build();
    const g = globalThis as Record<string, unknown>;
    const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
    const win = new EventTarget();
    g.document = doc;
    g.window = win;
    let flushed = 0;
    h.fs.promises.flush = async () => void flushed++;
    const calls: string[] = [];
    const pull = h.session.pull.bind(h.session);
    const push = h.session.push.bind(h.session);
    h.session.pull = async () => {
      calls.push("pull");
      await pull();
    };
    h.session.push = async () => {
      calls.push("push");
      await push();
    };
    try {
      const stop = h.session.installLifecycle();
      doc.visibilityState = "hidden";
      doc.dispatchEvent(new Event("visibilitychange"));
      doc.visibilityState = "visible";
      doc.dispatchEvent(new Event("visibilitychange"));
      win.dispatchEvent(new Event("pagehide"));
      assert.deepEqual(calls, ["push", "pull", "push"]);
      assert.equal(flushed, 2);
      stop();
      doc.dispatchEvent(new Event("visibilitychange"));
      win.dispatchEvent(new Event("pagehide"));
      assert.equal(calls.length, 3, "nothing after the teardown");
    } finally {
      delete g.document;
      delete g.window;
      h.session.pull = pull;
      h.session.push = push;
    }
  });
});
