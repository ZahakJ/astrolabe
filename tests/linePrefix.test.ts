// A format wraps a line's words, never its block marker (2026-11 purge, E2:
// Ctrl+B over whole list lines gave `**- alpha**`, over a heading `*## h*`).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blockPrefixLength } from "../client/editor/linePrefix.ts";

const words = (line: string) => line.slice(blockPrefixLength(line));

describe("blockPrefixLength", () => {
  it("steps over every block marker a line can start with", () => {
    assert.equal(words("- alpha"), "alpha");
    assert.equal(words("* alpha"), "alpha");
    assert.equal(words("  + nested"), "nested");
    assert.equal(words("1. first"), "first");
    assert.equal(words("12) twelfth"), "twelfth");
    assert.equal(words("- [ ] task"), "task");
    assert.equal(words("- [x] done"), "done");
    assert.equal(words("## Heading"), "Heading");
    assert.equal(words("> quoted"), "quoted");
    assert.equal(words("> > - deep"), "deep");
    assert.equal(words("- عنصر عربي"), "عنصر عربي");
  });
  it("leaves words that only look like markers alone", () => {
    for (const line of ["#tag here", "-5 degrees", "plain words", "2026 was", "**bold**", ""]) {
      assert.equal(blockPrefixLength(line), 0, line);
    }
  });
});
