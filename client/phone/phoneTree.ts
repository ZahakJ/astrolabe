// The Notes tab's tree on THIS device: which folders (and which folders'
// "Files" rows) are open, kept in localStorage (./treeRows.ts
// `createExpansion`), and a version number the tree reads through
// `useSyncExternalStore`, so a toggle re-draws the list and nothing else.

import { createExpansion } from "./treeRows.ts";

const KEY = "astrolabe.phone-tree";

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

const memory = createExpansion(storage(), KEY);
let version = 0;
const listeners = new Set<() => void>();
const bump = (): void => {
  version += 1;
  for (const l of listeners) l();
};

export const phoneTree = {
  memory,
  epoch: (): number => version,
  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  toggle(key: string): void {
    memory.toggle(key);
    bump();
  },
  /** A move the store recorded (`lastRemap`): followed once, however many
   *  screens see it. */
  follow(move: { from: string; to: string } | null): void {
    if (move === null || seen.has(move)) return;
    seen.add(move);
    memory.remap(move.from, move.to);
    bump();
  },
};
const seen = new WeakSet<object>();
