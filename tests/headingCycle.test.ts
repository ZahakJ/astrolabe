// The phone's H key (2026-11 purge, E3: a caret at column 0 typed "Title## ").
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cycleHeadingEdit } from "../client/phone/headingCycle.ts";

function apply(line: string, caret: number): [string, number] {
  const e = cycleHeadingEdit(line, caret);
  return [line.slice(0, e.from) + e.insert + line.slice(e.to), e.caret];
}

describe("the accessory bar's heading cycle", () => {
  it("puts the caret after the marker it adds to an empty line", () => {
    assert.deepEqual(apply("", 0), ["## ", 3]);
  });
  it("keeps a caret in the words in its place in them", () => {
    assert.deepEqual(apply("Title", 5), ["## Title", 8]);
    assert.deepEqual(apply("Title", 0), ["## Title", 3]);
    assert.deepEqual(apply("## Title", 8), ["### Title", 9]);
    assert.deepEqual(apply("### Title", 9), ["Title", 5]);
  });
  it("moves a caret that sat inside the marker to the start of the words", () => {
    assert.deepEqual(apply("## Title", 1), ["### Title", 4]);
    assert.deepEqual(apply("### Title", 2), ["Title", 0]);
  });
  it("cycles a single # title to ## like any other non-cycled level", () => {
    assert.deepEqual(apply("# T", 3), ["T", 1]);
  });
});
