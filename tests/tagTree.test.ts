import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { flattenTagTree, tagTree } from "../shared/tagTree.ts";

describe("the tag tree", () => {
  const rows = [
    { tag: "book/fiction", count: 3 },
    { tag: "book/history", count: 5 },
    { tag: "book", count: 2 },
    { tag: "zettel", count: 7 },
  ];
  it("nests by slash and sums counts up the branch", () => {
    const tree = tagTree(rows);
    assert.deepEqual(tree.map((n) => [n.tag, n.own, n.count]), [["book", 2, 10], ["zettel", 7, 7]]);
    assert.deepEqual(tree[0].children.map((n) => [n.tag, n.count]), [["book/history", 5], ["book/fiction", 3]]);
  });
  it("sorts by name when asked", () => {
    const tree = tagTree(rows, "name");
    assert.deepEqual(tree[0].children.map((n) => n.name), ["fiction", "history"]);
  });
  it("makes a parent that no note carries itself", () => {
    const tree = tagTree([{ tag: "a/b/c", count: 1 }]);
    assert.equal(tree[0].own, 0);
    assert.equal(tree[0].count, 1);
    assert.equal(tree[0].children[0].children[0].tag, "a/b/c");
  });
  it("flattens open branches only", () => {
    const tree = tagTree(rows);
    assert.deepEqual(flattenTagTree(tree, new Set()).map((r) => r.node.tag), ["book", "zettel"]);
    assert.deepEqual(flattenTagTree(tree, new Set(["book"])).map((r) => [r.node.tag, r.depth]), [["book", 0], ["book/history", 1], ["book/fiction", 1], ["zettel", 0]]);
  });
});
