// THE NOTES TAB'S TREE — which rows are showing, and what the device remembers
// of which folders are open.
//
// A reader on a Galaxy Z Fold, after the phone shell replaced the drawer: "I
// can no longer browse folders and notes as easily as before." One folder per
// screen is a phone's way (it stays, as the Folders view); a tree is a
// reader's way through a vault they know, and the Notes tab offers both. The
// tree is ONE flat list of rows — a folder, its disclosure, its children
// indented under it when it is open — computed here from the vault's tree and
// the set of open folders, so the component draws a list and nothing else:
// expanding a folder is one pass over the rows that SHOW (never the whole
// vault), and a row is one fixed-height button the list can window.
//
// A folder's attachments are never a wall of pictures between its notes: they
// are one row, "Files · 13", after the notes, that opens like a folder.
//
// The desktop tree's LOGIC is shared — the sort and the pinned order
// (client/treeOrder.ts), notes-only counts — and none of its chrome
// (check-shell-seam). Pure, with the storage injected: tests/phoneTree.test.ts
// holds the rows and the memory without a page.

import type { TreeNode } from "../../shared/types.ts";

export type TreeItem =
  /** A folder or something that opens as a screen (a note, a book, a drawing). */
  | { kind: "node"; node: TreeNode; depth: number; open: boolean }
  /** A folder's attachments, folded into one row. */
  | { kind: "files"; folder: string; depth: number; count: number; open: boolean }
  /** One attachment under an open "Files" row; `index` in its folder's files. */
  | { kind: "file"; node: TreeNode; depth: number; folder: string; index: number }
  /** An open folder with nothing in it that opens here. */
  | { kind: "empty"; folder: string; depth: number };

export interface TreeRules {
  /** The children in the reader's order (treeOrder.ts `orderChildren`). */
  order: (children: readonly TreeNode[], parent: string) => TreeNode[];
  /** A child the list shows as a row of its own: folders, notes, books. */
  listed: (node: TreeNode) => boolean;
  /** An attachment the "Files" row gathers (a picture, a film, a recording). */
  file: (node: TreeNode) => boolean;
}

/** The key the "Files" row of `folder` is remembered under. A NUL cannot be in
 *  a vault path, so it never meets a folder's own key. */
export function filesKey(folder: string): string {
  return `${folder}\u0000files`;
}

/** The rows showing under `root` with `isOpen` deciding which folders (and
 *  which "Files" rows) are open. Notes and folders first, in the reader's
 *  order; a folder's files after them. */
export function visibleRows(root: TreeNode, isOpen: (key: string) => boolean, rules: TreeRules): TreeItem[] {
  const out: TreeItem[] = [];
  const walk = (folder: TreeNode, depth: number): void => {
    const kids = folder.children ?? [];
    const rows = rules.order(kids, folder.path).filter(rules.listed);
    const files = kids.filter(rules.file);
    for (const node of rows) {
      const open = node.type === "folder" && isOpen(node.path);
      out.push({ kind: "node", node, depth, open });
      if (open) walk(node, depth + 1);
    }
    if (files.length > 0) {
      const open = isOpen(filesKey(folder.path));
      out.push({ kind: "files", folder: folder.path, depth, count: files.length, open });
      if (open) files.forEach((node, index) => out.push({ kind: "file", node, depth: depth + 1, folder: folder.path, index }));
    }
    if (rows.length === 0 && files.length === 0 && depth > 0) out.push({ kind: "empty", folder: folder.path, depth });
  };
  walk(root, 0);
  return out;
}

/** The attachments of `folder` that its "Files" row lists, in order. */
export function filesOf(folder: TreeNode | null, rules: Pick<TreeRules, "file">): TreeNode[] {
  return (folder?.children ?? []).filter(rules.file);
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Which folders are open, remembered per device. A set of keys (folder paths
 *  and `filesKey`s) written as a JSON array; unreadable storage is an empty
 *  set, and a storage that refuses a write keeps the set for the session. */
export interface Expansion {
  isOpen(key: string): boolean;
  toggle(key: string): boolean;
  set(key: string, open: boolean): void;
  /** A folder moved: its key and every key under it follow. */
  remap(from: string, to: string): void;
  keys(): string[];
}

export function createExpansion(storage: StorageLike | null, key: string): Expansion {
  const open = new Set<string>();
  try {
    const raw = storage?.getItem(key);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list)) for (const k of list) if (typeof k === "string") open.add(k);
  } catch {
    /* unreadable: start with everything folded */
  }
  const save = (): void => {
    try {
      storage?.setItem(key, JSON.stringify([...open]));
    } catch {
      /* refused: the set lasts the session */
    }
  };
  const api: Expansion = {
    isOpen: (k) => open.has(k),
    toggle: (k) => {
      const now = !open.has(k);
      api.set(k, now);
      return now;
    },
    set: (k, on) => {
      if (on === open.has(k)) return;
      if (on) open.add(k);
      else open.delete(k);
      save();
    },
    remap: (from, to) => {
      let moved = false;
      for (const k of [...open]) {
        const folder = k.endsWith("\u0000files") ? k.slice(0, -6) : k;
        if (folder !== from && !folder.startsWith(`${from}/`)) continue;
        open.delete(k);
        open.add(to + k.slice(from.length));
        moved = true;
      }
      if (moved) save();
    },
    keys: () => [...open],
  };
  return api;
}

/** Notes-only counts, memoised per tree node (a tree is replaced whole on
 *  every refresh, so the WeakMap forgets the old one on its own). */
const counts = new WeakMap<TreeNode, number>();
export function countOpenable(node: TreeNode, opens: (n: TreeNode) => boolean): number {
  const hit = counts.get(node);
  if (hit !== undefined) return hit;
  let n = 0;
  for (const c of node.children ?? []) {
    if (c.type === "folder") n += countOpenable(c, opens);
    else if (opens(c)) n += 1;
  }
  counts.set(node, n);
  return n;
}
