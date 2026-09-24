// THE FOLDER MOVE AND THE RENAME, AS ROUTES, WITH THEIR LINK REWRITES.
//
// POST /api/folder/move and POST /api/rename (server/api.ts,
// server/renameRoutes.ts) over a throwaway vault on disk, through the Hono
// app itself — the audit's "route tests for rename with link rewrite and
// folder move". What is pinned is what the reader would otherwise meet as
// broken links: every path-form wikilink, heading and alias kept, every
// markdown link and embed into the folder, and the moved notes' own relative
// links, all point at the new place; a bare `[[Name]]` is left bare (it
// resolves by name, and rewriting it would turn portable links brittle); the
// index answers backlinks at the new path the moment the 200 arrives; a
// folder's glyph moves with it; and a refused move moves nothing.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { initAuth } from "../server/auth.ts";
import { initIndexer } from "../server/indexer.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { api } from "../server/api.ts";
import { makeDir, makeVault, removeVault } from "./helpers/vault.ts";

const VAULT: Record<string, string> = {
  "Welcome.md": [
    "# Welcome",
    "",
    "Path form: [[Notes/Books/Muqaddimah]], a heading [[Notes/Books/Muqaddimah#Asabiyya|the idea]].",
    "Bare: [[Muqaddimah]] and [[Invisible Cities]].",
    "Markdown: [the book](Notes/Books/Muqaddimah.md) and an embed ![cover](Notes/Books/cover.png).",
    "Elsewhere: [[Notes/Elsewhere]].",
    "",
  ].join("\n"),
  "Notes/Books/Muqaddimah.md": [
    "# Muqaddimah",
    "",
    "## Asabiyya",
    "",
    "Beside it: [[Notes/Books/Invisible Cities]] and [[Invisible Cities]].",
    "Home: [back](../../Welcome.md). Its picture: ![c](cover.png).",
    "",
  ].join("\n"),
  "Notes/Books/Invisible Cities.md": "# Invisible Cities\n\nSee [[Notes/Elsewhere]].\n",
  "Notes/Books/cover.png": "not really a png",
  "Notes/Elsewhere.md": "# Elsewhere\n\nPoints in: [[Notes/Books/Invisible Cities]].\n",
};

const data = makeDir();
const root = makeVault(VAULT);
const read = (rel: string): string => readFileSync(path.join(root, rel), "utf8");
const post = (route: string, body: unknown) => api.request(route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

before(async () => {
  initAuth({}); // local mode: the owner at their own machine
  initSite({ ASTROLABE_DATA: data });
  initVault(root);
  await initIndexer();
});

after(() => {
  removeVault(root);
  removeVault(data);
});

describe("POST /api/folder/move", () => {
  it("refuses a move into the folder's own descendant, and nothing moves", async () => {
    const res = await post("/folder/move", { path: "Notes/Books", toPath: "Notes/Books/Inner/Books" });
    assert.ok(res.status >= 400 && res.status < 500, `status ${res.status}`);
    assert.ok(existsSync(path.join(root, "Notes/Books/Muqaddimah.md")));
    assert.equal(read("Welcome.md"), VAULT["Welcome.md"]);
  });

  it("refuses a move onto a name that is taken, and nothing moves", async () => {
    const res = await post("/folder/move", { path: "Notes/Books", toPath: "Notes/Elsewhere.md" });
    assert.ok(res.status >= 400 && res.status < 500, `status ${res.status}`);
    assert.ok(existsSync(path.join(root, "Notes/Books/Muqaddimah.md")));
  });

  it("moves the folder and rewrites every link the move would have broken", async () => {
    const icon = await api.request("/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderIcons: { "Notes/Books": "book" } }) });
    assert.equal(icon.status, 200);

    const res = await post("/folder/move", { path: "Notes/Books", toPath: "Library/Books" });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; notes: number; rewritten: number };
    assert.equal(body.ok, true);
    assert.equal(body.notes, 2, "the two notes that travelled");
    assert.ok(body.rewritten >= 3, `rewritten ${body.rewritten}`);

    assert.ok(!existsSync(path.join(root, "Notes/Books")));
    assert.ok(existsSync(path.join(root, "Library/Books/cover.png")));

    const welcome = read("Welcome.md");
    assert.match(welcome, /\[\[Library\/Books\/Muqaddimah\]\]/);
    assert.match(welcome, /\[\[Library\/Books\/Muqaddimah#Asabiyya\|the idea\]\]/, "the heading and the alias survive");
    assert.match(welcome, /\[the book\]\(Library\/Books\/Muqaddimah\.md\)/);
    assert.match(welcome, /!\[cover\]\(Library\/Books\/cover\.png\)/);
    assert.match(welcome, /Bare: \[\[Muqaddimah\]\] and \[\[Invisible Cities\]\]\./, "bare links resolve by name and stay bare");
    assert.match(welcome, /\[\[Notes\/Elsewhere\]\]/, "a link that did not point into the folder is untouched");
    assert.doesNotMatch(welcome, /Notes\/Books/);

    const moved = read("Library/Books/Muqaddimah.md");
    assert.match(moved, /\[\[Library\/Books\/Invisible Cities\]\]/, "a moved note's path-form link to its neighbour");
    assert.match(moved, /and \[\[Invisible Cities\]\]\./);
    assert.match(moved, /\[back\]\(\.\.\/\.\.\/Welcome\.md\)/, "the relative link still reaches the same note from the same depth");
    assert.match(moved, /!\[c\]\(cover\.png\)/, "the picture travelled with it");

    assert.match(read("Notes/Elsewhere.md"), /\[\[Library\/Books\/Invisible Cities\]\]/, "a note outside that pointed in");

    // The index is the new vault by the time the 200 arrives.
    const back = await api.request(`/backlinks?path=${encodeURIComponent("Library/Books/Muqaddimah.md")}`);
    assert.equal(back.status, 200);
    const linkers = JSON.stringify(await back.json());
    assert.match(linkers, /Welcome\.md/);
    const old = await api.request(`/note?path=${encodeURIComponent("Notes/Books/Muqaddimah.md")}`);
    assert.equal(old.status, 404);

    const settings = (await (await api.request("/settings")).json()) as { folderIcons?: Record<string, string> };
    assert.deepEqual(settings.folderIcons, { "Library/Books": "book" }, "the folder's glyph moved with it");
  });
});

describe("POST /api/rename", () => {
  it("moves a note up a folder, rewrites the links to it and its own relative links", async () => {
    const res = await post("/rename", { path: "Library/Books/Muqaddimah.md", toPath: "Muqaddimah.md" });
    assert.equal(res.status, 200);
    const welcome = read("Welcome.md");
    assert.match(welcome, /Path form: \[\[Muqaddimah\]\], a heading \[\[Muqaddimah#Asabiyya\|the idea\]\]\./);
    assert.doesNotMatch(welcome, /Library\/Books\/Muqaddimah/);
    assert.match(welcome, /\[the book\]\(Muqaddimah\.md\)/);
    const moved = read("Muqaddimah.md");
    assert.match(moved, /\[back\]\(Welcome\.md\)/, "re-expressed from the folder it arrived in");
    assert.match(moved, /!\[c\]\(Library\/Books\/cover\.png\)/, "its picture did not move, so the link follows it");
  });

  it("a new title rewrites bare links by name, keeping their headings and aliases", async () => {
    const res = await post("/rename", { path: "Muqaddimah.md", toPath: "The Introduction.md" });
    assert.equal(res.status, 200);
    const welcome = read("Welcome.md");
    assert.match(welcome, /Bare: \[\[The Introduction\]\]/);
    assert.match(welcome, /#Asabiyya\|the idea\]\]/);
    assert.doesNotMatch(welcome, /\[\[Muqaddimah/);
  });
});
