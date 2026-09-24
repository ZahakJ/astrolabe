// THE TREE'S ORDER — one comparison, for the server's vault walk and the
// pocket's index.
//
// Folders first, then notes, then attachments; within a band, by name the way
// a reader alphabetises — case and accents do not split "apple" from "Apple"
// or "étude" from "Etude" (`sensitivity: "base"`). The pocket sorted with a
// bare `localeCompare`, so a phone put "Zeta" and "alpha" in a different order
// from the desktop over the same repository. A tie at base sensitivity is
// broken by code point, so two names that fold together still sort the same
// way on every machine.

import type { TreeNode } from "./types.ts";

/** 0 folder, 1 note, 2 attachment — the bands, in order. */
export function treeRank(node: TreeNode): number {
  if (node.type === "folder") return 0;
  return node.attachment ? 2 : 1;
}

export function compareTreeNodes(a: TreeNode, b: TreeNode): number {
  return (
    treeRank(a) - treeRank(b) ||
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
    (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  );
}

/** Sort a tree in place, every level. */
export function sortTree(node: TreeNode): void {
  if (!node.children) return;
  node.children.sort(compareTreeNodes);
  for (const child of node.children) sortTree(child);
}
