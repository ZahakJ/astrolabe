import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TreeNode } from "../shared/types.ts";
import { PINNED_PARENT, defaultTreeOrder, inFocus, orderChildren, parseTreeOrder, reorder, togglePinned, topLevelOf } from "../client/treeOrder.ts";

const f = (name: string): TreeNode => ({ name, path: name, type: "folder", children: [] });
const n = (name: string): TreeNode => ({ name, path: `${name}.md`, type: "file" });
const nodes = [f("a"), f("b"), n("x"), n("y")];

describe("the tree's order", () => {
  it("keeps the server's order by name, reverses each group by name-desc", () => {
    assert.deepEqual(orderChildren(nodes, "", defaultTreeOrder()).map((c) => c.name), ["a", "b", "x", "y"]);
    assert.deepEqual(orderChildren(nodes, "", { ...defaultTreeOrder(), sort: "name-desc" }).map((c) => c.name), ["b", "a", "y", "x"]);
  });
  it("puts the reader's manual order first and newcomers after", () => {
    const prefs = { sort: "manual" as const, order: { "": ["y", "b", "gone"] }, pinned: [] };
    assert.deepEqual(orderChildren(nodes, "", prefs).map((c) => c.name), ["y", "b", "a", "x"]);
  });
  it("reorders by dropping before or after a sibling, and that means manual", () => {
    const next = reorder(defaultTreeOrder(), "", ["a", "b", "x", "y"], ["y"], "a", true);
    assert.equal(next.sort, "manual");
    assert.deepEqual(next.order[""], ["y", "a", "b", "x"]);
    const two = reorder(next, "", ["y", "a", "b", "x"], ["a", "b"], "x", false);
    assert.deepEqual(two.order[""], ["y", "x", "a", "b"]);
    assert.deepEqual(reorder(defaultTreeOrder(), PINNED_PARENT, ["p", "q"], ["q"], "p", true).pinned, ["q", "p"]);
  });
  it("pins and unpins, keeping the pinned order", () => {
    let prefs = togglePinned(defaultTreeOrder(), ["b", "x.md"], true);
    assert.deepEqual(prefs.pinned, ["b", "x.md"]);
    prefs = togglePinned(prefs, ["b"], false);
    assert.deepEqual(prefs.pinned, ["x.md"]);
  });
  it("focuses on one branch: the item, the way to it, and what is inside", () => {
    assert.equal(inFocus("a/b/c.md", "a/b/c.md"), true);
    assert.equal(inFocus("a", "a/b/c.md"), true);
    assert.equal(inFocus("a/b/d.md", "a/b/c.md"), false);
    assert.equal(inFocus("a/b/d.md", "a/b"), true);
    assert.equal(inFocus("z", "a/b"), false);
    assert.equal(inFocus("anything", null), true);
  });
  it("survives junk in storage and drops a selected child of a selected folder", () => {
    assert.deepEqual(parseTreeOrder("nope"), defaultTreeOrder());
    assert.deepEqual(parseTreeOrder('{"sort":"manual","order":{"a":["x",1]},"pinned":["p",""]}'), { sort: "manual", order: { a: ["x"] }, pinned: ["p"] });
    assert.deepEqual(topLevelOf(["a", "a/b.md", "c.md"]), ["a", "c.md"]);
  });
});
