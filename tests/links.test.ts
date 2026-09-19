// Wikilink parsing and resolution — server (server/indexer.ts) and client
// (client/editor/links.ts), which must agree: the editor decides where a click
// goes, the indexer decides where the backlink/graph edge goes, and a reader
// who sees them disagree has found a bug.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { collectNotes, resolveLink as clientResolve, parseWikilink, WIKILINK_RE, type NoteRef } from "../client/editor/links.ts";
import {
  initIndexer,
  resolveEmbed as resolveEmbedRaw,
  resolveLink as resolveLinkRaw,
  wikilinkRegex,
} from "../server/indexer.ts";
import { initSite } from "../server/site.ts";
import { buildTree, initVault } from "../server/vault.ts";
import type { TreeNode } from "../shared/types.ts";
import { makeDir, makeVault, note, removeVault } from "./helpers/vault.ts";

const NFD_NAME = "cafe\u0301.md"; // e + combining acute, as a macOS vault stores it

// Both resolvers take a language scope as their third argument (the published
// collection is language-filtered for visitors under `languageFilter`). None
// of the cases below is about that filter, so they pin it to `null` — "no
// language scoping" — and keep testing the two axes they are actually about:
// the name, and whether the caller is a visitor.
const resolveLink = (name: string, publishedOnly = false): string | null =>
  resolveLinkRaw(name, publishedOnly, null);
const resolveEmbed = (name: string, publishedOnly = false): string | null =>
  resolveEmbedRaw(name, publishedOnly, null);

const data = makeDir();
const root = makeVault({
  "Note.md": "# Note\n",
  "folder/Note.md": "# Note (deeper)\n",
  // Same basename, two depths: "x/y/Deep.md" is the SHORTER string but the
  // DEEPER path. The two resolvers disagree here — see the parity block.
  "x/y/Deep.md": "# Deep\n",
  "zzzz/Deep.md": "# Deep\n",
  // A file named after a folder that also exists.
  "Guides.md": "# Guides\n",
  "Guides/Intro.md": "# Intro\n",
  "Guides/Guides.md": "# Guides (inner)\n",
  "OnlyFolder/Inside.md": "# Inside\n",
  "مذكرة.md": "# مذكرة\n",
  "Notes/What's next? (draft).md": "# What's next?\n",
  [NFD_NAME]: "# Cafe\n",
  "attachments/img.png": "png",
  "attachments/deep/img.png": "png",
  "Pub.md": note({ publish: "true" }, "# Pub\n"),
  "Priv.md": "# Priv\n",
});

let tree: TreeNode;

before(async () => {
  initSite({ ASTROLABE_DATA: data });
  initVault(root);
  await initIndexer();
  tree = await buildTree();
});

after(() => {
  removeVault(root);
  removeVault(data);
});

// ------------------------------------------------------------------ parsing

describe("wikilink syntax", () => {
  const parse = (text: string): string[] => {
    const re = wikilinkRegex();
    const out: string[] = [];
    for (let m = re.exec(text); m !== null; m = re.exec(text)) out.push(m[1]);
    return out;
  };

  it("finds plain, aliased, anchored and anchored+aliased links", () => {
    assert.deepEqual(parse("see [[A]] and [[B|bee]] and [[C#Head]] and [[D#Head|dee]]"), [
      "A",
      "B",
      "C",
      "D",
    ]);
  });

  it("finds the target inside an ![[embed]]", () => {
    assert.deepEqual(parse("![[diagram.png]]"), ["diagram.png"]);
  });

  it("ignores empty and unbalanced brackets", () => {
    assert.deepEqual(parse("[[]] [[ ]] [not a link] [[unclosed"), [" "]);
  });

  it("does not treat a bare #anchor link as a target (Obsidian's [[#Head]])", () => {
    // The server regex requires at least one non-# character, so a same-note
    // anchor link contributes no graph edge — correct, since it points here.
    assert.deepEqual(parse("[[#Head]]"), []);
  });

  it("client parseWikilink splits target / #heading / |alias", () => {
    assert.deepEqual(parseWikilink("A"), { target: "A", heading: null, alias: null });
    assert.deepEqual(parseWikilink("A|alias"), { target: "A", heading: null, alias: "alias" });
    assert.deepEqual(parseWikilink("A#Head"), { target: "A", heading: "Head", alias: null });
    assert.deepEqual(parseWikilink("A#Head|alias"), { target: "A", heading: "Head", alias: "alias" });
    assert.deepEqual(parseWikilink("  A  #  Head  "), { target: "A", heading: "Head", alias: null });
    assert.deepEqual(parseWikilink("#Head"), { target: "", heading: "Head", alias: null });
    // A "#" inside the alias belongs to the alias, not to the anchor.
    assert.deepEqual(parseWikilink("A|see #tag"), { target: "A", heading: null, alias: "see #tag" });
  });

  it("the client's inner-text regex agrees with the server's on ordinary links", () => {
    const text = "[[A]] [[B|bee]] [[C#Head]] [[D#Head|dee]]";
    const inner = [...text.matchAll(WIKILINK_RE)].map((m) => parseWikilink(m[1]).target);
    assert.deepEqual(inner, ["A", "B", "C", "D"]);
  });
});

// --------------------------------------------------------------- resolution

describe("server resolveLink", () => {
  const cases: [string, string | null][] = [
    ["Note", "Note.md"],
    ["note", "Note.md"],
    ["NOTE", "Note.md"],
    ["Note.md", "Note.md"],
    ["folder/Note", "folder/Note.md"],
    ["folder/Note.md", "folder/Note.md"],
    ["FOLDER/note", "folder/Note.md"],
    ["./folder/Note", "folder/Note.md"],
    ["folder\\Note", "folder/Note.md"],
    // Duplicate basenames: fewest segments first, then shortest string.
    ["Deep", "zzzz/Deep.md"],
    ["x/y/Deep", "x/y/Deep.md"],
    // A file named after a sibling folder resolves to the FILE.
    ["Guides", "Guides.md"],
    ["Guides/Guides", "Guides/Guides.md"],
    ["Guides/Intro", "Guides/Intro.md"],
    // A folder is not a note.
    ["OnlyFolder", null],
    // Unicode + punctuation titles.
    ["مذكرة", "مذكرة.md"],
    ["What's next? (draft)", "Notes/What's next? (draft).md"],
    ["what's NEXT? (draft)", "Notes/What's next? (draft).md"],
    // Anchors and aliases are stripped before resolution.
    ["Note#Some heading", "Note.md"],
    ["Note|an alias", "Note.md"],
    ["Note#Some heading|an alias", "Note.md"],
    ["Missing note", null],
    ["", null],
  ];

  for (const [name, expected] of cases) {
    it(`[[${name}]] → ${expected ?? "null"}`, () => {
      assert.equal(resolveLink(name), expected);
    });
  }

  it("does NOT fold a unicode-decomposed filename with a composed link (known gap)", () => {
    assert.equal(resolveLink("cafe\u0301"), NFD_NAME, "the exact spelling resolves");
    assert.equal(resolveLink("caf\u00e9"), null, "the composed spelling does not");
  });
});

describe("visitor-scoped resolution", () => {
  it("resolves only published notes when publishedOnly is set", () => {
    assert.equal(resolveLink("Pub"), "Pub.md");
    assert.equal(resolveLink("Pub", true), "Pub.md");
    assert.equal(resolveLink("Priv"), "Priv.md");
    assert.equal(resolveLink("Priv", true), null, "an unpublished note must not be nameable");
  });

  it("refuses a path-form target the same way", () => {
    assert.equal(resolveLink("Priv.md", true), null);
  });
});

describe("resolveEmbed", () => {
  it("resolves attachments by basename, shortest path first", () => {
    assert.equal(resolveEmbed("img.png"), "attachments/img.png");
    assert.equal(resolveEmbed("IMG.PNG"), "attachments/img.png");
    assert.equal(resolveEmbed("missing.png"), null);
  });

  it("KNOWN BUG: a path-form embed target does not resolve", () => {
    // Notes accept "[[folder/Note]]" (resolveLink checks byPathLower first),
    // attachments do not — attachmentsByName is keyed by basename only. So
    // "![[attachments/deep/img.png]]", which Obsidian resolves and which is
    // the ONLY way to disambiguate two images with the same filename, renders
    // as a broken embed here.
    assert.equal(resolveEmbed("attachments/deep/img.png"), null);
    assert.equal(resolveEmbed("img.png"), "attachments/img.png", "…and the basename wins instead");
  });

  it("prefers a note over an attachment", () => {
    assert.equal(resolveEmbed("Note"), "Note.md");
  });
});

// -------------------------------------------------------------- both agree

describe("client/server parity", () => {
  const AGREE = [
    "Note",
    "note",
    "folder/Note",
    "folder/Note.md",
    "Guides",
    "Guides/Guides",
    "Guides/Intro",
    "OnlyFolder",
    "مذكرة",
    "What's next? (draft)",
    "Missing note",
    "x/y/Deep",
  ];

  for (const name of AGREE) {
    it(`[[${name}]] resolves the same on both sides`, () => {
      assert.equal(clientResolve(name, tree), resolveLink(name), `divergent resolution for ${name}`);
    });
  }

  it("KNOWN BUG: duplicate basenames can resolve to DIFFERENT notes", () => {
    // Server (indexer.pickShortest): fewest path segments wins, then length.
    // Client (links.resolveLink): shortest STRING wins, depth ignored.
    // "x/y/Deep.md" is 11 chars deep in 3 folders; "zzzz/Deep.md" is 12 chars
    // in 2 — so a click in the editor and the backlink/graph edge for the same
    // wikilink land on different files.
    assert.equal(resolveLink("Deep"), "zzzz/Deep.md");
    assert.equal(clientResolve("Deep", tree), "x/y/Deep.md");
  });

  it("client resolution ignores the anchor and alias too", () => {
    assert.equal(clientResolve("Note#Heading", tree), "Note.md");
    assert.equal(clientResolve("Note|alias", tree), "Note.md");
    assert.equal(clientResolve("Note#Heading|alias", tree), "Note.md");
  });
});

// ------------------------------------------- the client's index is memoized

// `collectNotes` and `resolveLink` share one table, rebuilt when the TREE
// OBJECT changes identity (client/editor/links.ts). That is the whole
// invalidation rule, so it is the whole risk: a memo that outlives its tree
// would answer a deleted note's path forever, and nothing else in the product
// would notice until a click 404'd.
describe("client note index (memoized on the tree)", () => {
  const treeOf = (paths: string[]): TreeNode => ({
    name: "",
    path: "",
    type: "folder",
    children: paths.map((p) => ({ name: p.split("/").pop()!, path: p, type: "file" as const })),
  });

  it("answers the same thing twice for one tree", () => {
    const t = treeOf(["Alpha.md", "deep/Beta.md"]);
    assert.equal(clientResolve("Alpha", t), "Alpha.md");
    assert.equal(clientResolve("Alpha", t), "Alpha.md");
    assert.equal(clientResolve("deep/Beta", t), "deep/Beta.md");
    assert.equal(collectNotes(t).length, 2);
  });

  it("forgets a note the NEXT tree does not have", () => {
    const before = treeOf(["Gone.md", "Kept.md"]);
    assert.equal(clientResolve("Gone", before), "Gone.md");
    const after = treeOf(["Kept.md"]);
    assert.equal(clientResolve("Gone", after), null, "the old tree's answer survived its tree");
    assert.equal(clientResolve("Kept", after), "Kept.md");
  });

  it("sees a note the NEXT tree adds", () => {
    const before = treeOf(["Kept.md"]);
    assert.equal(clientResolve("Fresh", before), null);
    const after = treeOf(["Kept.md", "Fresh.md"]);
    assert.equal(clientResolve("Fresh", after), "Fresh.md");
  });

  it("goes back to nothing for a null tree", () => {
    assert.equal(clientResolve("Kept", treeOf(["Kept.md"])), "Kept.md");
    assert.equal(clientResolve("Kept", null), null);
    assert.equal(collectNotes(null).length, 0);
  });

  it("keeps the shortest-path tie-break the un-memoized loop had", () => {
    // Two notes named "Dup": the shorter PATH wins, ties broken alphabetically.
    const t = treeOf(["zzzz/Dup.md", "a/Dup.md", "Dup.md"]);
    assert.equal(clientResolve("Dup", t), "Dup.md");
    const deeper = treeOf(["zzzz/Dup.md", "aaaa/Dup.md"]);
    assert.equal(clientResolve("Dup", deeper), "aaaa/Dup.md");
  });

  it("hands back a list nobody can sort out from under the next caller", () => {
    const t = treeOf(["Beta.md", "Alpha.md"]);
    const first = collectNotes(t);
    assert.deepEqual(
      first.map((n) => n.title),
      ["Alpha", "Beta"],
    );
    assert.throws(() => (first as NoteRef[]).sort(() => -1), "the shared list is mutable");
    assert.deepEqual(
      collectNotes(t).map((n) => n.title),
      ["Alpha", "Beta"],
    );
  });
});
