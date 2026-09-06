// The Media page's decisions, held under node: which shelf a tracker lands
// on, the order the shelves come in, and how a card's fields round-trip into
// the form and back out as a fence. The drawing is React and is not here.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { draftOf, emptyDraft, numberOf, shelve, treeHasPath } from "../client/media/mediaModel.ts";
import type { TrackerMeta, TreeNode } from "../shared/types.ts";

function meta(over: Partial<TrackerMeta>): TrackerMeta {
  return {
    path: "Media/Games/X.md",
    index: 0,
    started: null,
    finished: null,
    season: null,
    notes: null,
    folder: null,
    step: 1,
    folderNotes: 0,
    folderNote: null,
    folderRecent: [],
    title: "X",
    noteTitle: "X",
    kind: "game",
    icon: "gamepad",
    percent: 50,
    done: 5,
    total: 10,
    unit: null,
    status: "active",
    rating: null,
    cover: null,
    updatedMs: 0,
    ...over,
  };
}

describe("the Media page's shelves", () => {
  it("shelves by folded kind, in the owner's order, and skips empty shelves", () => {
    const shelves = shelve(
      [
        meta({ kind: "book", title: "Dune" }),
        meta({ kind: "tv", title: "Severance" }),
        meta({ kind: "boardgame", title: "Catan" }),
        meta({ kind: "movie", title: "Heat" }),
        meta({ kind: "game", title: "Hades" }),
      ],
      null,
    );
    assert.deepEqual(
      shelves.map((s) => [s.shelf, s.items.map((m) => m.title)]),
      [
        ["show", ["Severance"]],
        ["game", ["Hades"]],
        ["book", ["Dune"]],
        ["film", ["Heat"]],
        ["other", ["Catan"]],
      ],
    );
  });
  it("filters by status without reordering", () => {
    const shelves = shelve(
      [meta({ kind: "book", status: "done" }), meta({ kind: "book", status: "active", title: "B" })],
      "active",
    );
    assert.deepEqual(shelves.map((s) => [s.shelf, s.items.map((m) => m.title)]), [["book", ["B"]]]);
    assert.deepEqual(shelve([meta({ status: "done" })], "planned"), []);
  });
});

describe("the Media form's draft", () => {
  it("starts on the shows shelf, planned, with nothing filled", () => {
    const d = emptyDraft();
    assert.equal(d.kind, "show");
    assert.equal(d.status, "planned");
    assert.equal(d.openEnded, false);
    assert.equal(d.title, "");
  });
  it("reads a card back into the form, with an open count as the switch", () => {
    const d = draftOf(meta({ done: 12, total: null, percent: null, unit: "hours", rating: { value: 4, max: 5 }, season: "2", notes: "Margit." }));
    assert.equal(d.done, "12");
    assert.equal(d.total, "");
    assert.equal(d.openEnded, true);
    assert.equal(d.unit, "hours");
    assert.equal(d.rating, "8"); // 4 of 5, on the form's ten-point scale
    assert.equal(d.season, "2");
    assert.equal(d.notes, "Margit.");
    const closed = draftOf(meta({ done: 62, total: 130 }));
    assert.equal(closed.openEnded, false);
    assert.equal(closed.total, "130");
  });
  it("asks the tree, not the server, whether a title is taken", () => {
    const tree: TreeNode = {
      name: "",
      path: "",
      type: "folder",
      children: [
        { name: "Media", path: "Media", type: "folder", children: [{ name: "Books", path: "Media/Books", type: "folder", children: [{ name: "Dune.md", path: "Media/Books/Dune.md", type: "file" }] }] },
        { name: "note.md", path: "note.md", type: "file" },
      ],
    };
    assert.equal(treeHasPath(tree, "Media/Books/Dune.md"), true);
    assert.equal(treeHasPath(tree, "media/books/dune.md"), true);
    assert.equal(treeHasPath(tree, "Media/Books/Emma.md"), false);
    assert.equal(treeHasPath(null, "note.md"), false);
  });
  it("reads numbers the way people type them", () => {
    assert.equal(numberOf(" 12 "), 12);
    assert.equal(numberOf("62,5"), 62.5);
    assert.equal(numberOf(""), null);
    assert.equal(numberOf("-3"), null);
    assert.equal(numberOf("lots"), null);
  });
});
