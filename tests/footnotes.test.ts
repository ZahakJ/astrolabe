// A note's footnotes as data (shared/footnotes.ts): the pane's list, the
// two hops' addresses, and the sidenote stacking.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { footnotesOf, stackSidenotes } from "../shared/footnotes.ts";

describe("footnotesOf", () => {
  it("lists references in reading order with their definitions and addresses", () => {
    const md = [
      "---",
      "title: x [^0]",
      "---",
      "First claim.[^b] Second.[^a]",
      "",
      "[^a]: The a note.",
      "  continued here.",
      "[^b]: The b note.",
    ].join("\n");
    const notes = footnotesOf(md);
    assert.deepEqual(notes.map((n) => n.label), ["b", "a"]);
    assert.equal(notes[0].text, "The b note.");
    assert.equal(notes[0].defLine, 8);
    assert.deepEqual(notes[0].refs, [{ line: 4, col: 12 }]);
    assert.equal(notes[1].text, "The a note. continued here.");
    assert.equal(notes[1].defLine, 6);
    assert.deepEqual(notes[1].refs, [{ line: 4, col: 24 }]);
  });
  it("keeps a definition nothing references, after the referenced ones", () => {
    const notes = footnotesOf("Text[^1]\n\n[^stray]: lonely\n[^1]: one");
    assert.deepEqual(notes.map((n) => n.label), ["1", "stray"]);
    assert.deepEqual(notes[1].refs, []);
    assert.equal(notes[1].text, "lonely");
  });
  it("reports a reference with no definition as empty text", () => {
    const [n] = footnotesOf("Text[^gone]");
    assert.equal(n.text, "");
    assert.equal(n.defLine, null);
    assert.equal(n.refs.length, 1);
  });
  it("ignores brackets inside code fences and code spans", () => {
    const md = "```\n[^1]: in code\nx[^2]\n```\nsee `[^3]` and real[^4]\n\n[^4]: yes";
    const notes = footnotesOf(md);
    assert.deepEqual(notes.map((n) => n.label), ["4"]);
  });
  it("counts every reference to one label", () => {
    const [n] = footnotesOf("a[^n] b[^n]\nc[^n]\n\n[^n]: thrice");
    assert.equal(n.refs.length, 3);
    assert.deepEqual(n.refs.map((r) => r.line), [1, 1, 2]);
  });
  it("answers nothing for a note with no footnotes", () => {
    assert.deepEqual(footnotesOf("Just prose.\n\n- a list [x]"), []);
  });
});

describe("stackSidenotes", () => {
  it("leaves notes where they want to be when they do not collide", () => {
    assert.deepEqual(stackSidenotes([{ want: 0, height: 20 }, { want: 100, height: 20 }], 8), [0, 100]);
  });
  it("pushes a colliding note under the one above, plus the gap", () => {
    assert.deepEqual(
      stackSidenotes([{ want: 0, height: 50 }, { want: 30, height: 20 }, { want: 60, height: 10 }], 8),
      [0, 58, 86],
    );
  });
  it("never moves a note up", () => {
    assert.deepEqual(stackSidenotes([{ want: 200, height: 10 }, { want: 50, height: 10 }], 4), [200, 214]);
  });
});
