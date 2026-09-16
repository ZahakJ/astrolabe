// Highlights → note (shared/highlightsNote.ts): the chapters come from the
// outline, every passage is the citation block, and a re-run touches only
// what sits between the markers.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BookHighlight } from "../shared/bookAnchor.ts";
import { HIGHLIGHTS_END, HIGHLIGHTS_START, chapterEntries, highlightsBlock, mergeHighlightsNote } from "../shared/highlightsNote.ts";

function mark(id: string, page: number, text: string, note = "", y = 0.1): BookHighlight {
  return { id, page, rects: [{ x: 0.1, y, w: 0.5, h: 0.02 }], ink: 1, text, note, createdAt: 1, updatedAt: 1 };
}
const labelFor = (page: number): string => `Muqaddimah, p. ${page}`;

describe("the chapters", () => {
  it("takes the shallowest level with two entries that name a page", () => {
    const outline = [
      { title: "Contents", page: 0, depth: 0 },
      { title: "Preface", page: 3, depth: 1 },
      { title: "One", page: 10, depth: 1 },
      { title: "One, i", page: 12, depth: 2 },
      { title: "Two", page: 40, depth: 1 },
    ];
    assert.deepEqual(chapterEntries(outline).map((e) => e.title), ["Preface", "One", "Two"]);
    assert.deepEqual(chapterEntries([{ title: "Only", page: 1, depth: 0 }]), []);
    assert.deepEqual(chapterEntries([]), []);
  });
});

describe("the block", () => {
  it("is one list when the book has no outline, in reading order", () => {
    const block = highlightsBlock({ highlights: [mark("bbbb", 5, "second"), mark("aaaa", 2, "first", "my note"), mark("cccc", 5, "before second", "", 0.05)], outline: [], target: "Muqaddimah.pdf", labelFor });
    assert.ok(block.startsWith(`${HIGHLIGHTS_START}\n`));
    assert.ok(block.endsWith(HIGHLIGHTS_END));
    assert.ok(!block.includes("## "));
    const order = ["first", "before second", "second"].map((t) => block.indexOf(`> ${t}`));
    assert.deepEqual([...order].sort((x, y) => x - y), order);
    // The margin note follows its passage as prose, and the link opens the page.
    assert.ok(block.includes("> — [[Muqaddimah.pdf#page=2&rect=0.1,0.1,0.5,0.02&id=aaaa|Muqaddimah, p. 2]]\n\nmy note\n"));
  });
  it("puts a heading per chapter, skips chapters with nothing marked, and keeps a preface's marks first", () => {
    const outline = [
      { title: "One", page: 10, depth: 0 },
      { title: "Two", page: 40, depth: 0 },
      { title: "Three", page: 80, depth: 0 },
    ];
    const block = highlightsBlock({ highlights: [mark("p", 3, "preface"), mark("a", 12, "in one"), mark("b", 90, "in three")], outline, target: "M.pdf", labelFor });
    const lines = block.split("\n");
    assert.equal(lines.indexOf("## One") > lines.findIndex((l) => l === "> preface"), true);
    assert.ok(block.includes("## One\n\n> [!quote]\n> in one"));
    assert.ok(!block.includes("## Two"));
    assert.ok(block.includes("## Three\n\n> [!quote]\n> in three"));
  });
});

describe("the merge", () => {
  it("opens a new note with the lead, replaces between the markers, and appends when there are none", () => {
    const block = `${HIGHLIGHTS_START}\nnew\n${HIGHLIGHTS_END}`;
    assert.equal(mergeHighlightsNote(null, block, "Lead."), `Lead.\n\n${block}\n`);
    const existing = `# My reading\n\nabove\n\n${HIGHLIGHTS_START}\nold\n${HIGHLIGHTS_END}\n\nbelow\n`;
    assert.equal(mergeHighlightsNote(existing, block, "Lead."), `# My reading\n\nabove\n\n${block}\n\nbelow\n`);
    assert.equal(mergeHighlightsNote("prose\n", block, "Lead."), `prose\n\n${block}\n`);
    assert.equal(mergeHighlightsNote("prose", block, "Lead."), `prose\n\n${block}\n`);
  });
});
