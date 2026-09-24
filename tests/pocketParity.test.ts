// POCKET PARITY — the phone and the server give the same answers about one vault.
//
// mobile/src/pocket/index.ts is a second index: it answers /api/* inside the
// phone's WebView for a vault cloned from GitHub. Every question it answers,
// the server answers too, and the reader sees the same vault on both — so
// where the two disagree, one of them is lying about the vault. The audit
// behind this file found five such disagreements (the banner read `cover:`
// and `image:` on the phone, aliases were neither deduplicated nor refused a
// date, a `...`-closed frontmatter was a block on one side only, the tree
// sorted by a different collation, a `.tex` note's aliases and tags were
// invisible to the phone). They were fixed by moving each rule into shared/;
// this file holds the two indexes to one fixture vault, question by question.
//
// The fixture is built to hit the seams: every alias spelling (flow, block,
// scalar-with-commas, the singular key, a duplicate, a date), a banner beside
// a tracker's `cover:`, a `...` closer, an Arabic note written pointed and
// linked plain, a `.tex` note with a comment-block frontmatter, two notes
// sharing a basename, and links that arrive by path, by name, by alias and
// with an anchor.

import assert from "node:assert/strict";
import { statSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import {
  aliasEntries,
  backlinks as serverBacklinks,
  initIndexer,
  publishedBanner,
  resolveLink as serverResolve,
  search as serverSearch,
  tags as serverTags,
} from "../server/indexer.ts";
import { initSite } from "../server/site.ts";
import { buildTree, initVault } from "../server/vault.ts";
import { PocketIndex } from "../mobile/src/pocket/index.ts";
import type { TreeNode } from "../shared/types.ts";
import { makeDir, makeVault, removeVault } from "./helpers/vault.ts";

const FILES: Record<string, string> = {
  "Welcome.md": [
    "---",
    "tags: [start, guide]",
    "publish: true",
    "banner: https://example.com/welcome.png",
    "---",
    "# Welcome",
    "",
    "Start at [[Ideas/Astrolabe]], then [[ML]], then [[Deep Learning#Layers]].",
    "A path link: [[Notes/Machine Learning]] and a plain one [[القراءة]].",
    "#inline-tag in the body.",
  ].join("\n"),
  "Ideas/Astrolabe.md": [
    "---",
    "aliases:",
    "  - The Instrument",
    "  - the instrument",
    "tags:",
    "  - guide",
    "---",
    "## On the instrument",
    "",
    "An astrolabe measures the sky. Back to [[Welcome]].",
  ].join("\n"),
  "Notes/Machine Learning.md": "---\naliases: [ML, machine-learning]\npublish: true\ncover: covers/ml.png\n---\n# Machine Learning\n\nSee [[The Instrument]].\n",
  "Notes/Deep Learning.md": "---\naliases: DL, deep learning\nimage: https://example.com/not-a-banner.png\npublish: true\n---\n# Deep Learning\n\n## Layers\n\nStacked. Links [[ML]].\n",
  "Notes/Singular.md": "---\nalias: Older\n---\n# Singular\n\n[[Welcome]] again.\n",
  "Notes/Dated.md": "---\naliases: 2024-01-01\n---\n# Dated\n",
  // Closed with YAML's own end-of-document marker.
  "Notes/Dots.md": "---\ntags: [dots]\naliases: [Ellipsis]\n...\n# Dots\n\nThe block above closes with three dots. [[Welcome]]\n",
  // Pointed on disk, typed plain in the link above.
  "القراءة.md": "# القراءة\n\nالكِتَابَةُ بالعربيّة. رابط إلى [[Welcome]].\n",
  // Two notes with one basename: the shorter path wins, on both.
  "Index.md": "# Index\n\n[[Welcome]]\n",
  "deep/down/Index.md": "# Index, deeper\n",
  // A LaTeX note: its frontmatter is a comment block, and a `#` is not a tag.
  "papers/Fourier.tex": [
    "%---",
    "% aliases: [Heat, heat equation]",
    "% tags: [maths]",
    "%---%",
    "\\documentclass{article}",
    "\\begin{document}",
    "On heat, \\#1 in the series. % [[Welcome]]",
    "\\end{document}",
  ].join("\n"),
  "covers/ml.png": "\u0089PNG not really",
  "Media/diagram.PNG": "\u0089PNG not really",
  "Media/alpha.pdf": "%PDF-1.4",
  "Media/Zeta.pdf": "%PDF-1.4",
};

const data = makeDir();
const root = makeVault(FILES);
const pocket = new PocketIndex();

before(async () => {
  initSite({ ASTROLABE_DATA: data });
  initVault(root);
  await initIndexer();
  for (const [rel, content] of Object.entries(FILES)) {
    const { mtimeMs, size } = statSync(path.join(root, rel));
    if (/\.(md|tex)$/.test(rel)) pocket.put(rel, content, mtimeMs);
    else pocket.putAsset(rel, size, mtimeMs);
  }
});

after(() => {
  removeVault(root);
  removeVault(data);
});

const NOTES = Object.keys(FILES).filter((p) => /\.(md|tex)$/.test(p));

describe("pocket parity: resolve", () => {
  const NAMES = [
    "Welcome", "welcome", "Welcome.md", "Ideas/Astrolabe", "./Ideas/Astrolabe", "Astrolabe",
    "The Instrument", "ML", "machine-learning", "DL", "deep learning", "Older", "Ellipsis",
    "2024-01-01", "القراءة", "Index", "deep/down/Index", "Fourier", "Heat", "heat equation",
    "Deep Learning#Layers", "ML|shown", "Missing note",
  ];
  for (const name of NAMES) {
    it(`[[${name}]]`, () => {
      assert.equal(pocket.resolve(name), serverResolve(name, false, null));
    });
  }
});

describe("pocket parity: aliases", () => {
  it("the alias table is the same, entry for entry", () => {
    const key = (e: { alias: string; path: string }) => `${e.path} ${e.alias}`;
    const server = aliasEntries(false, null).map(key).sort();
    const phone = pocket.aliasEntries().map(key).sort();
    assert.deepEqual(phone, server);
    // …and the rules it encodes: a duplicate collapses, a date is not a name.
    assert.ok(!server.some((k) => k.endsWith(" the instrument")));
    assert.ok(!server.some((k) => k.startsWith("Notes/Dated.md")));
    assert.ok(server.includes("papers/Fourier.tex Heat"));
  });
});

describe("pocket parity: tags", () => {
  it("the tag counts are the same", () => {
    assert.deepEqual(pocket.tags(), serverTags(false, null));
    assert.ok(!pocket.tags().some((t) => t.tag === "1"), "a LaTeX `\\#1` is not a tag");
    assert.ok(pocket.tags().some((t) => t.tag === "dots"), "a `...`-closed block is read");
  });
});

describe("pocket parity: banner", () => {
  for (const rel of ["Welcome.md", "Notes/Machine Learning.md", "Notes/Deep Learning.md"]) {
    it(rel, () => {
      assert.equal(pocket.notes.get(rel)?.banner ?? null, publishedBanner(rel));
    });
  }
});

describe("pocket parity: backlinks", () => {
  for (const target of NOTES) {
    it(target, () => {
      const shape = (b: { path: string; line: number }) => `${b.path}:${b.line}`;
      assert.deepEqual(
        pocket.backlinks(target).map(shape).sort(),
        serverBacklinks(target, false, null).map(shape).sort(),
      );
    });
  }
  it("the fixture exercises them (Welcome has five)", () => {
    assert.equal(serverBacklinks("Welcome.md", false, null).length, 5);
  });
});

describe("pocket parity: search", () => {
  const QUERIES = ["astrolabe", "welcome", "machine learning", "ML", "Heat", "index", "Layers", "الكتابة", "الكِتَابَةُ", "tag:guide", "path:notes deep", "-tag:guide sky", "sky"];
  for (const q of QUERIES) {
    it(JSON.stringify(q), () => {
      const server = serverSearch(q, false, null).map((h) => h.path);
      const phone = pocket.search(q).map((h) => h.path);
      assert.deepEqual(new Set(phone), new Set(server), "the same notes");
      assert.equal(phone[0], server[0], "the same first hit");
    });
  }
});

describe("pocket parity: the tree's order", () => {
  it("folders, notes, attachments; alphabetised the same way", async () => {
    const flat = (node: TreeNode): string[] => [node.path, ...(node.children ?? []).flatMap(flat)];
    const server = flat(await buildTree()).slice(1);
    const phone = flat(pocket.tree()).slice(1);
    assert.deepEqual(phone, server);
  });
});
