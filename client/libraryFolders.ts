// What the tree knows about a folder that the library wants: its subfolders'
// names, which `guessLibraryKind()` reads (`L1..L14` is a course) before the
// reader has typed anything.

import type { TreeNode } from "../shared/types.ts";
import { useStore } from "./state.ts";

export function findFolderNode(tree: TreeNode | null, path: string): TreeNode | null {
  if (!tree) return null;
  if (path === "") return tree;
  let node: TreeNode | undefined = tree;
  for (const part of path.split("/")) {
    node = node?.children?.find((c) => c.type === "folder" && c.name === part);
    if (!node) return null;
  }
  return node;
}

/** The names of the folders directly inside `path`, from the loaded tree. */
export function unitNamesOf(path: string): string[] {
  const node = findFolderNode(useStore.getState().tree, path);
  return (node?.children ?? []).filter((c) => c.type === "folder").map((c) => c.name);
}
