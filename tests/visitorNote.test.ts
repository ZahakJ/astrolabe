// What a visitor is sent of a published note's source (server/visitorNote.ts;
// 2026-11 purge, P3: a published series hub's raw JSON named its unpublished
// drafts, and a published essay piece carried its desk notes).
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { initIndexer } from "../server/indexer.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { visitorNoteContent } from "../server/visitorNote.ts";
import { stripPrivateComments } from "../shared/privateText.ts";
import { makeDir, makeVault, removeVault } from "./helpers/vault.ts";

const HUB = `---
publish: true
banner: Attachments/b.jpg
series:
  - "[[Part one]]"
  - "[[Secret draft]]"
  - "[[Part two]]"
---
# Hub

Words. %% a note to myself %%
`;
const PIECE = `---
publish: true
kind: essay
status: editing
angle: the private thesis
next: check the sources
priority: high
series: "[[Draft series]]"
goal: 1500
---
# Piece
`;
const data = makeDir();
const root = makeVault({
  "Hub.md": HUB,
  "Part one.md": "---\npublish: true\n---\none\n",
  "Part two.md": "---\npublish: true\n---\ntwo\n",
  "Secret draft.md": "# not published\n",
  "Piece.md": PIECE,
  "Draft series.md": "---\nkind: series\n---\n",
  "Plain.md": "---\npublish: true\ntags: [a]\n---\nBody %% hidden %%\n",
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

describe("visitorNoteContent", () => {
  it("keeps a series' published parts and drops the unpublished ones", () => {
    const out = visitorNoteContent("Hub.md", HUB);
    assert.doesNotMatch(out, /Secret draft/);
    assert.match(out, /\[\[Part one\]\]/);
    assert.match(out, /\[\[Part two\]\]/);
    assert.ok(out.indexOf("Part one") < out.indexOf("Part two"), "order kept");
    assert.match(out, /^banner: Attachments\/b\.jpg$/m, "the renderer's keys are untouched");
    assert.doesNotMatch(out, /note to myself/);
  });
  it("drops the desk's working notes and an unpublished series from a piece", () => {
    const out = visitorNoteContent("Piece.md", PIECE);
    for (const word of ["the private thesis", "check the sources", "priority", "status:", "Draft series"]) {
      assert.ok(!out.includes(word), word);
    }
    assert.match(out, /^goal: 1500$/m);
    assert.match(out, /^publish: true$/m);
  });
  it("leaves an ordinary note's frontmatter byte for byte", () => {
    const src = "---\npublish: true\ntags: [a]\n---\nBody %% hidden %%\n";
    assert.equal(visitorNoteContent("Plain.md", src), stripPrivateComments(src));
    assert.match(visitorNoteContent("Plain.md", src), /^---\npublish: true\ntags: \[a\]\n---\nBody /);
  });
});
