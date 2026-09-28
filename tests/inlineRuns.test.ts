// A line of the reader's words outside a note (client/inlineRuns.ts): which
// words are a link, to what, under what label. The owner saw a sigil's slot
// on the phone as `[[orbits/japanese/kana]]`, brackets and all; these runs
// are what the sigil card, Today, the Timeline, search and the backlinks
// sheet now draw from.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TreeNode } from "../shared/types.ts";
import { inlinePlain, inlineRuns } from "../client/inlineRuns.ts";

const file = (path: string): TreeNode => ({ name: path.split("/").pop() ?? path, path, type: "file" });
const tree: TreeNode = {
  name: "",
  path: "",
  type: "folder",
  children: [
    {
      name: "Orbits",
      path: "Orbits",
      type: "folder",
      children: [{ name: "Japanese", path: "Orbits/Japanese", type: "folder", children: [file("Orbits/Japanese/Kana.md")] }],
    },
    file("Welcome.md"),
  ],
};

describe("inlineRuns", () => {
  it("splits a slot into words and a link resolved against the tree, whatever its case", () => {
    const runs = inlineRuns("review [[orbits/japanese/kana]] daily", tree);
    assert.deepEqual(runs, [
      { kind: "text", text: "review " },
      { kind: "link", target: "orbits/japanese/kana", heading: null, label: "kana", path: "Orbits/Japanese/Kana.md" },
      { kind: "text", text: " daily" },
    ]);
  });

  it("shows an alias as the label, and a heading after the name", () => {
    const [alias] = inlineRuns("[[Welcome|the welcome]]", tree);
    assert.equal(alias.kind === "link" && alias.label, "the welcome");
    const [head] = inlineRuns("[[Welcome#Start]]", tree);
    assert.ok(head.kind === "link");
    assert.equal(head.label, "Welcome › Start");
    assert.equal(head.heading, "Start");
    assert.equal(head.path, "Welcome.md");
  });

  it("keeps a link to a missing note as a link with no path (drawn dashed)", () => {
    const [missing] = inlineRuns("[[No Such Note]]", tree);
    assert.deepEqual(missing, { kind: "link", target: "No Such Note", heading: null, label: "No Such Note", path: null });
  });

  it("reads a same-note heading link as its words: out of its note it has nowhere to go", () => {
    assert.deepEqual(inlineRuns("see [[#Notes]]", tree), [
      { kind: "text", text: "see " },
      { kind: "text", text: "Notes" },
    ]);
  });

  it("leaves a line with no link as one run", () => {
    assert.deepEqual(inlineRuns("60 min walk", tree), [{ kind: "text", text: "60 min walk" }]);
  });
});

describe("inlinePlain", () => {
  it("gives the words a reader sees: labels, no brackets, no emphasis marks", () => {
    assert.equal(inlinePlain("review [[Orbits/Japanese/Kana]] and **[[Welcome|the welcome]]**"), "review Kana and the welcome");
    assert.equal(inlinePlain("![[cover.jpg]] a picture"), "cover.jpg a picture");
  });

  it("keeps a search hit's marks (swapped for control characters, as the phone's search does) inside a link's label", () => {
    assert.equal(inlinePlain("[[Orbits/\u0001Kana\u0002]] drill"), "\u0001Kana\u0002 drill");
  });
});
