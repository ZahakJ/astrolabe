// Block references (shared/blockId.ts + shared/anchors.ts): the marker, the
// block a line belongs to, and the anchor table that `[[Note#^id]]` looks up.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blockRange, isBareBlockId, markdownBlock, mintBlockId, parseBlockId, stripBlockId, withBlockId } from "../shared/blockId.ts";
import { markdownAnchors, resolveAnchorIn } from "../shared/anchors.ts";

const NOTE = `---
title: x
---
# Title

First paragraph line one
line two ^para1

- item one ^it1
- item two
  wrapped ^it2
- item three

Second paragraph.
^lone

\`\`\`
code ^notanid
\`\`\`
`;

describe("a block id", () => {
  it("parses, strips and appends at the line's end", () => {
    assert.deepEqual(parseBlockId("some text ^abc-12"), { id: "abc-12", start: 9 });
    assert.equal(parseBlockId("a caret ^ in the middle"), null);
    assert.equal(stripBlockId("some text ^abc"), "some text");
    assert.equal(withBlockId("some text ^old", "new1"), "some text ^new1");
    assert.equal(withBlockId("", "x"), "^x");
    assert.equal(isBareBlockId("  ^abc  "), true);
  });
  it("mints six lowercase alphanumerics", () => {
    assert.match(mintBlockId(), /^[a-z0-9]{6}$/);
    assert.equal(mintBlockId(() => 0), "aaaaaa");
  });
});

describe("the block a line belongs to", () => {
  const lines = NOTE.split("\n");
  it("is the paragraph around it, walked up and down", () => {
    assert.deepEqual(blockRange(lines, 6), { start: 5, end: 7 });
    assert.deepEqual(blockRange(lines, 7), { start: 5, end: 7 });
  });
  it("is the list item with its wrapped continuation", () => {
    assert.deepEqual(blockRange(lines, 9), { start: 8, end: 9 });
    assert.deepEqual(blockRange(lines, 10), { start: 9, end: 11 });
  });
  it("is the block ABOVE a bare id line", () => {
    assert.deepEqual(blockRange(lines, 15), { start: 13, end: 15 });
    assert.equal(blockRange(lines, 5), null);
  });
  it("slices the block's markdown with the marker off", () => {
    assert.equal(markdownBlock(NOTE, 7), "First paragraph line one\nline two");
    assert.equal(markdownBlock(NOTE, 10), "- item two\n  wrapped");
    assert.equal(markdownBlock(NOTE, 15), "Second paragraph.");
  });
});

describe("block anchors", () => {
  it("join the anchor table with the caret kept, titled by the block's text", () => {
    const anchors = markdownAnchors(NOTE);
    const blocks = anchors.filter((a) => a.kind === "block");
    assert.deepEqual(blocks.map((a) => [a.id, a.line]), [["^para1", 7], ["^it1", 9], ["^it2", 11], ["^lone", 15]]);
    assert.equal(blocks[0].title, "line two");
    assert.equal(blocks[1].title, "item one");
    assert.equal(blocks[3].title, "Second paragraph.");
    // inside a fence is code, not an address
    assert.equal(anchors.some((a) => a.id === "^notanid"), false);
    // the heading is still there
    assert.equal(anchors[0].id, "title");
  });
  it("resolves [[Note#^id]] the way findAnchor already resolves headings", () => {
    assert.equal(resolveAnchorIn("n.md", NOTE, "^it2")?.line, 11);
    assert.equal(resolveAnchorIn("n.md", NOTE, "^nope"), null);
  });
});
