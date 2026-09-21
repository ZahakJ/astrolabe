// The pocket server: `/api/*` answered inside a phone's WebView.
//
// What is under test is the whole of what a pocket vault CAN do and the
// honesty of what it cannot. Three claims, and each of them is a promise the
// product makes out loud in docs/mobile.md:
//
//   1. The routes the web client depends on to read, write, navigate and
//      search a vault answer with the SAME wire shapes the server answers
//      with — because it is the same client, unmodified, and a shape that
//      drifts is a screen that renders nothing with no error anywhere.
//   2. A save carries the same `baseMtimeMs` precondition and answers the
//      same `409 code:"stale"`. That precondition is the entire reason two
//      writers on one vault is survivable, and a pocket vault has two by
//      definition.
//   3. What it cannot do, it REFUSES with a reason. A 501 naming the missing
//      thing is a sentence a reader can act on; an empty list is a vault that
//      looks broken.
//
// The filesystem is a Map (tests/helpers/memoryFs.ts) and git is a stub: what
// is interesting here is the server, and a server is only interesting in what
// it does with a filesystem, not in which one it was given.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PocketIndex, isNote } from "../mobile/src/pocket/index.ts";
import { createPocketServer, type PocketGit, type PocketRequest, type PocketResponse } from "../mobile/src/pocket/server.ts";
import { createVaultIo, isHiddenPath, safeVaultPath } from "../mobile/src/pocket/vaultIo.ts";
import { makeMemoryFs, type MemoryFs } from "./helpers/memoryFs.ts";
import type { Backlink, NoteData, SearchHit, TagCount, TreeNode } from "../shared/types.ts";

const ROOT = "/vault";

const VAULT: Record<string, string> = {
  "/vault/Welcome.md": [
    "---",
    "title: Welcome",
    "tags: [start-here, guide]",
    "date: 2026-01-02",
    "---",
    "",
    "# Welcome",
    "",
    "This is the room. It links to [[Ideas/Astrolabe]] and to [[Missing Note]].",
    "",
    "![a diagram](Media/diagram.png)",
    "",
    "- [ ] read the guide",
  ].join("\n"),
  "/vault/Ideas/Astrolabe.md": [
    "---",
    "aliases:",
    "  - The Instrument",
    "tags:",
    "  - guide",
    "status: drafting",
    "---",
    "",
    "## On the instrument",
    "",
    "An astrolabe measures the sky. #astronomy",
    "",
    "Back to [[Welcome]].",
  ].join("\n"),
  "/vault/Ideas/قراءة.md": ["# قراءة", "", "الكتابة بالعربيّة مع التشكيل: الكِتَابَة.", ""].join("\n"),
  "/vault/Media/diagram.png": "\u0089PNG\r\n\u001a\nnot really a png, but bytes",
};

function makeServer(seed: Record<string, string> = VAULT): {
  call(method: string, url: string, body?: unknown, headers?: Record<string, string>): Promise<PocketResponse>;
  json(method: string, url: string, body?: unknown): Promise<unknown>;
  fs: MemoryFs;
  index: PocketIndex;
  commits: string[];
} {
  const fs = makeMemoryFs(seed);
  const io = createVaultIo(fs, ROOT);
  const index = new PocketIndex();
  const commits: string[] = [];
  const git: PocketGit = {
    async commit(message) {
      commits.push(message);
      return `sha${commits.length}`;
    },
    async history(path) {
      return [
        {
          sha: "abc1234def",
          short: "abc1234",
          iso: "2026-02-01T10:00:00.000Z",
          subject: "Astrolabe pocket: a note",
          path,
          added: null,
          removed: null,
        },
      ];
    },
    async blobAt() {
      return "the older text\n";
    },
  };
  const held = new Map<string, unknown>();
  const server = createPocketServer({
    io,
    git,
    store: {
      async get(key) {
        return held.get(key) ?? null;
      },
      async set(key, value) {
        held.set(key, value);
      },
    },
    index,
    repo: { name: "owner/vault", branch: "main" },
    now: () => 1_700_000_000_000,
  });

  const call = async (
    method: string,
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<PocketResponse> => {
    const request: PocketRequest = { method, url, headers: headers ?? {} };
    if (body !== undefined) request.body = JSON.stringify(body);
    return server.handle(request);
  };

  return {
    call,
    async json(method, url, body) {
      const answer = await call(method, url, body);
      return JSON.parse(String(answer.body));
    },
    fs,
    index,
    commits,
  };
}

/** Build the index the way `PocketSession.build()` does, so what the routes
 *  read is what a real open would have read. */
async function loaded(seed: Record<string, string> = VAULT): Promise<ReturnType<typeof makeServer>> {
  const made = makeServer(seed);
  const io = createVaultIo(made.fs, ROOT);
  for (const file of await io.list()) {
    if (isHiddenPath(file.path)) continue;
    if (isNote(file.path)) {
      const content = await io.readText(file.path);
      if (content !== null) made.index.put(file.path, content, file.mtimeMs);
    } else made.index.putAsset(file.path, file.size, file.mtimeMs);
  }
  return made;
}

describe("the pocket server — the session", () => {
  it("is the owner, alone, with no public half", async () => {
    const server = await loaded();
    const me = (await server.json("GET", "/api/me")) as { admin: boolean; public: boolean; protected: boolean; siteName: string };
    // Every one of these is load-bearing in the client: `admin` decides
    // whether the editor exists at all, `protected` whether a sign-in screen
    // is meaningful, `public` whether visitor scoping is on.
    assert.equal(me.admin, true);
    assert.equal(me.protected, false);
    assert.equal(me.public, false);
    assert.equal(me.siteName, "owner/vault");
  });

  it("refuses to pretend there is somebody to sign in as", async () => {
    const server = await loaded();
    const answer = await server.call("POST", "/api/login", { password: "x" });
    assert.equal(answer.status, 501);
  });
});

describe("the pocket server — the tree", () => {
  it("is folders, then notes, then attachments, alpha within each", async () => {
    const server = await loaded();
    const tree = (await server.json("GET", "/api/tree")) as TreeNode;
    assert.equal(tree.type, "folder");
    const top = (tree.children ?? []).map((n) => `${n.type}:${n.name}`);
    assert.deepEqual(top, ["folder:Ideas", "folder:Media", "file:Welcome.md"]);
    const media = (tree.children ?? []).find((n) => n.name === "Media");
    const image = media?.children?.[0];
    // An attachment carries its kind and size: a folder of images that
    // expands to nothing reads as "my files are gone".
    assert.equal(image?.attachment?.kind, "image");
    assert.equal(image?.attachment?.ext, "png");
    assert.ok((image?.attachment?.size ?? 0) > 0);
  });

  it("never shows the repository", async () => {
    const server = await loaded({ ...VAULT, "/vault/.git/config": "[core]\n", "/vault/.trash/Old.md": "gone" });
    const tree = (await server.json("GET", "/api/tree")) as TreeNode;
    const names = (tree.children ?? []).map((n) => n.name);
    assert.ok(!names.includes(".git"));
    assert.ok(!names.includes(".trash"));
  });

  it("refuses a path that leaves the vault, before it reaches the filesystem", () => {
    assert.throws(() => safeVaultPath("../../etc/passwd"));
    assert.throws(() => safeVaultPath("Notes/../../secret"));
    assert.throws(() => safeVaultPath(".git/config"));
    assert.throws(() => safeVaultPath("a\u0000b"));
    assert.equal(safeVaultPath("/Ideas/Astrolabe.md"), "Ideas/Astrolabe.md");
  });
});

describe("the pocket server — reading and writing a note", () => {
  it("answers a note with its bytes and its mtime, and a miss with 404", async () => {
    const server = await loaded();
    const note = (await server.json("GET", "/api/note?path=Welcome.md")) as NoteData;
    assert.equal(note.path, "Welcome.md");
    assert.match(note.content, /# Welcome/);
    assert.ok(note.mtimeMs > 0);
    assert.equal((await server.call("GET", "/api/note?path=Nowhere.md")).status, 404);
  });

  it("saves, reindexes and commits — one commit per save", async () => {
    const server = await loaded();
    const before = (await server.json("GET", "/api/note?path=Welcome.md")) as NoteData;
    server.fs.tick();
    const written = (await server.json("PUT", "/api/note?path=Welcome.md", {
      content: "# Welcome\n\nA changed line about kestrels.\n",
      baseMtimeMs: before.mtimeMs,
    })) as NoteData;
    assert.match(written.content, /kestrels/);
    assert.equal(server.commits.length, 1);
    assert.equal(server.commits[0], "Astrolabe pocket: Welcome");
    // The index moved with the file: a save that does not reindex is a search
    // box that answers about yesterday.
    const hits = (await server.json("GET", "/api/search?q=kestrels")) as SearchHit[];
    assert.equal(hits[0]?.path, "Welcome.md");
  });

  it("REFUSES a save that would overwrite a version the writer never saw", async () => {
    const server = await loaded();
    const first = (await server.json("GET", "/api/note?path=Welcome.md")) as NoteData;
    server.fs.tick();
    await server.call("PUT", "/api/note?path=Welcome.md", { content: "from the laptop\n" });
    server.fs.tick();
    const answer = await server.call("PUT", "/api/note?path=Welcome.md", {
      content: "from the phone\n",
      baseMtimeMs: first.mtimeMs,
    });
    assert.equal(answer.status, 409);
    assert.equal(JSON.parse(String(answer.body)).code, "stale");
    // …and nothing was written.
    const now = (await server.json("GET", "/api/note?path=Welcome.md")) as NoteData;
    assert.equal(now.content, "from the laptop\n");
  });

  it("creates, renames and deletes, and a delete leaves an undo behind", async () => {
    const server = await loaded();
    assert.equal((await server.call("POST", "/api/note", { path: "Scratch.md" })).status, 200);
    assert.equal((await server.call("POST", "/api/note", { path: "Scratch.md" })).status, 409);

    assert.equal((await server.call("POST", "/api/rename", { path: "Scratch.md", toPath: "Ideas/Scratch.md" })).status, 200);
    assert.equal((await server.call("GET", "/api/note?path=Scratch.md")).status, 404);
    assert.equal((await server.call("GET", "/api/note?path=Ideas/Scratch.md")).status, 200);

    const deleted = (await server.json("DELETE", "/api/note?path=Ideas/Scratch.md")) as { ok: boolean; trashPath?: string };
    assert.equal(deleted.ok, true);
    assert.ok(deleted.trashPath?.startsWith(".trash/"));
    const trash = (await server.json("GET", "/api/trash")) as { name: string }[];
    assert.equal(trash.length, 1);
    const restored = (await server.json("POST", "/api/trash/restore", { name: trash[0]?.name })) as { path: string };
    assert.equal(restored.path, "Ideas/Scratch.md");
  });

  it("answers `note/state` for the open tabs and nulls what is gone", async () => {
    const server = await loaded();
    const states = (await server.json(
      "GET",
      "/api/note/state?path=Welcome.md&path=Nowhere.md",
    )) as { states: { path: string; mtimeMs: number | null }[] };
    assert.equal(states.states.length, 2);
    assert.ok((states.states[0]?.mtimeMs ?? 0) > 0);
    assert.equal(states.states[1]?.mtimeMs, null);
  });
});

describe("the pocket server — finding things", () => {
  it("searches titles and bodies, and folds Arabic the way the vault is typed", async () => {
    const server = await loaded();
    const byTitle = (await server.json("GET", "/api/search?q=Astrolabe")) as SearchHit[];
    assert.equal(byTitle[0]?.path, "Ideas/Astrolabe.md");
    const byBody = (await server.json("GET", "/api/search?q=sky")) as SearchHit[];
    assert.ok(byBody.some((hit) => hit.path === "Ideas/Astrolabe.md"));
    // The note carries `الكِتَابَة` with harakat; the query has none. One key.
    const arabic = (await server.json("GET", `/api/search?q=${encodeURIComponent("الكتابة")}`)) as SearchHit[];
    assert.ok(arabic.some((hit) => hit.path === "Ideas/قراءة.md"), "pointed Arabic and plain Arabic are one key");
  });

  it("honours the search operators, and narrows to nothing rather than ignoring one", async () => {
    const server = await loaded();
    const tagged = (await server.json("GET", "/api/search?q=tag%3Aguide")) as SearchHit[];
    assert.deepEqual(tagged.map((h) => h.path).sort(), ["Ideas/Astrolabe.md", "Welcome.md"]);
    const books = (await server.json("GET", "/api/search?q=in%3Abooks+sky")) as SearchHit[];
    assert.deepEqual(books, [], "an operator the pocket cannot answer means no results, not all results");
  });

  it("gives a snippet with no raw markdown in it", async () => {
    const server = await loaded();
    const hits = (await server.json("GET", "/api/search?q=instrument")) as SearchHit[];
    const snippet = hits[0]?.snippet ?? "";
    assert.ok(snippet.length > 0);
    assert.ok(!snippet.includes("##"), "a heading's hashes never reach the reader");
    assert.ok(!/\[\[/.test(snippet), "wikilink brackets never reach the reader");
  });

  it("resolves a wikilink by the server's rule, and answers a miss with null", async () => {
    const server = await loaded();
    assert.deepEqual(await server.json("GET", "/api/resolve?name=Astrolabe"), { path: "Ideas/Astrolabe.md" });
    assert.deepEqual(await server.json("GET", "/api/resolve?name=Ideas/Astrolabe"), { path: "Ideas/Astrolabe.md" });
    assert.deepEqual(await server.json("GET", "/api/resolve?name=The%20Instrument"), { path: "Ideas/Astrolabe.md" });
    // A miss is 200 with a null, never a 404: unresolved names are ordinary.
    assert.deepEqual(await server.json("GET", "/api/resolve?name=Missing%20Note"), { path: null });
  });

  it("carries backlinks with the line they sit on and the sentence around them", async () => {
    const server = await loaded();
    const back = (await server.json("GET", "/api/backlinks?path=Ideas/Astrolabe.md")) as Backlink[];
    assert.equal(back.length, 1);
    assert.equal(back[0]?.path, "Welcome.md");
    assert.ok(back[0]?.line && back[0].line > 1, "the line counts in the FULL source, frontmatter included");
    assert.match(back[0]?.context ?? "", /the room/);
  });

  it("draws a graph whose edges are resolved links, counted once", async () => {
    const server = await loaded();
    const graph = (await server.json("GET", "/api/graph")) as { nodes: { id: string; links: number }[]; edges: { source: string; target: string }[] };
    assert.equal(graph.nodes.length, 3);
    assert.deepEqual(
      graph.edges.map((e) => `${e.source}→${e.target}`).sort(),
      ["Ideas/Astrolabe.md→Welcome.md", "Welcome.md→Ideas/Astrolabe.md"],
    );
    // `[[Missing Note]]` resolves to nothing and draws no edge to nowhere.
    assert.ok(!graph.edges.some((e) => e.target.includes("Missing")));
  });

  it("counts tags and properties", async () => {
    const server = await loaded();
    const tags = (await server.json("GET", "/api/tags")) as TagCount[];
    assert.equal(tags.find((t) => t.tag === "guide")?.count, 2);
    assert.equal(tags.find((t) => t.tag === "astronomy")?.count, 1);
    const props = (await server.json("GET", "/api/props")) as { key: string; values: { value: string }[] }[];
    assert.equal(props.find((p) => p.key === "status")?.values[0]?.value, "drafting");
    assert.ok(!props.some((p) => p.key === "tags"), "tags have a shelf of their own");
  });
});

describe("the pocket server — attachments", () => {
  it("serves an attachment's bytes with a type, and refuses to serve a note as one", async () => {
    const server = await loaded();
    const answer = await server.call("GET", "/api/file?path=Media/diagram.png");
    assert.equal(answer.status, 200);
    assert.equal(answer.headers["Content-Type"], "image/png");
    assert.equal(answer.headers["X-Content-Type-Options"], "nosniff");
    assert.ok(answer.body instanceof Uint8Array);
    assert.equal((await server.call("GET", "/api/file?path=Welcome.md")).status, 400);
  });

  it("answers a byte range, because a book is read a page at a time", async () => {
    const server = await loaded();
    const whole = await server.call("GET", "/api/file?path=Media/diagram.png");
    const size = (whole.body as Uint8Array).byteLength;
    const part = await server.call("GET", "/api/file?path=Media/diagram.png", undefined, { range: "bytes=0-3" });
    assert.equal(part.status, 206);
    assert.equal(part.headers["Content-Range"], `bytes 0-3/${size}`);
    assert.equal((part.body as Uint8Array).byteLength, 4);
    const silly = await server.call("GET", "/api/file?path=Media/diagram.png", undefined, { range: "bytes=99999-" });
    assert.equal(silly.status, 416);
  });
});

describe("the pocket server — git is the version history", () => {
  it("lists a note's past and can read one version back", async () => {
    const server = await loaded();
    const history = (await server.json("GET", "/api/history?path=Welcome.md")) as { repo: boolean; revisions: { sha: string }[] };
    assert.equal(history.repo, true);
    assert.equal(history.revisions[0]?.sha, "abc1234def");
    const at = Date.parse("2026-02-01T10:00:00.000Z");
    const one = (await server.json("GET", `/api/versions/one?path=Welcome.md&at=${at}`)) as { content: string };
    assert.equal(one.content, "the older text\n");
    const restored = (await server.json("POST", "/api/versions/restore", { path: "Welcome.md", at })) as NoteData;
    assert.equal(restored.content, "the older text\n");
  });
});

describe("the pocket server — what it cannot do, it says", () => {
  const cases: [string, string][] = [
    ["POST", "/api/publish"],
    ["GET", "/api/posts"],
    ["GET", "/api/comments?path=Welcome.md"],
    ["GET", "/api/clip/token"],
    ["POST", "/api/fonts/upload"],
    ["GET", "/api/sync/status"],
    ["GET", "/api/design/active"],
    ["GET", "/api/export"],
    ["POST", "/api/replace"],
  ];
  for (const [method, route] of cases) {
    it(`${method} ${route} is a 501 with a reason in it`, async () => {
      const server = await loaded();
      const answer = await server.call(method, route, method === "GET" ? undefined : {});
      assert.equal(answer.status, 501);
      const body = JSON.parse(String(answer.body)) as { error: string; code: string };
      assert.equal(body.code, "pocket");
      // Not a stub sentence: it has to name the thing that is missing.
      assert.ok(body.error.length > 30, `"${body.error}" does not explain anything`);
      assert.ok(/server|visitor|public|network|disk|data directory|whole vault|phone|repository|corpus|installation/i.test(body.error));
    });
  }

  it("an unknown route is a plain 404, as it is on the server", async () => {
    const server = await loaded();
    assert.equal((await server.call("GET", "/api/nonsense")).status, 404);
  });
});

describe("the pocket server — device state stays on the device", () => {
  it("merges preferences by their timestamps and hands the whole map back", async () => {
    const server = await loaded();
    await server.json("PUT", "/api/prefs", { keys: { "astrolabe.theme": { v: "sumi", t: 10 } } });
    const older = (await server.json("PUT", "/api/prefs", {
      keys: { "astrolabe.theme": { v: "linen", t: 5 } },
    })) as { keys: Record<string, { v: string }> };
    assert.equal(older.keys["astrolabe.theme"]?.v, "sumi", "the newest write wins, whichever order it arrived in");
    const newer = (await server.json("PUT", "/api/prefs", {
      keys: { "astrolabe.theme": { v: "linen", t: 20 } },
    })) as { keys: Record<string, { v: string }> };
    assert.equal(newer.keys["astrolabe.theme"]?.v, "linen");
  });

  it("keeps the workspace, and refuses what is not one", async () => {
    const server = await loaded();
    assert.deepEqual(await server.json("PUT", "/api/state/workspace", { workspace: { panes: [] } }), { ok: true });
    assert.deepEqual(await server.json("GET", "/api/state/workspace"), { workspace: { panes: [] } });
    assert.deepEqual(await server.json("PUT", "/api/state/workspace", { workspace: "nope" }), { ok: false });
  });
});

describe("the pocket server — the shelves that are note-based", () => {
  it("finds the tasks in the vault", async () => {
    const server = await loaded();
    const tasks = (await server.json("GET", "/api/tasks")) as { path: string; task: { done: boolean } }[];
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0]?.path, "Welcome.md");
    assert.equal(tasks[0]?.task.done, false);
  });

  it("ticks a task by rewriting exactly its line", async () => {
    const server = await loaded();
    const tasks = (await server.json("GET", "/api/tasks")) as { path: string; task: { line: number } }[];
    const line = tasks[0]?.task.line ?? 0;
    await server.json("POST", "/api/task", { path: "Welcome.md", line, done: true, today: "2026-02-02" });
    const note = (await server.json("GET", "/api/note?path=Welcome.md")) as NoteData;
    assert.match(note.content, /- \[x\] read the guide/);
    assert.match(note.content, /# Welcome/, "the rest of the note is the bytes it was");
  });

  it("always has an Orbits shelf to point at, even with no deck fence", async () => {
    const server = await loaded();
    const decks = (await server.json("GET", "/api/orbits?today=2026-02-02")) as { path: string; implicit: boolean }[];
    assert.equal(decks.at(-1)?.path, "*");
    assert.equal(decks.at(-1)?.implicit, true);
  });
});
