// Which folders in the notes tree are open, and the topic sections' folds:
// both remembered per browser, both read at module load. The counts beside
// them. Moved out of client/components/Sidebar.tsx unchanged.

import type { NoteRef } from "../../editor/links.ts";
import type { TreeNode } from "../../../shared/types.ts";
import { findNode as findTreeNode } from "../../treeOrder.ts";
import { t } from "../../i18n.ts";
import { label as tagLabel } from "../../tagLabels.ts";

export function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

export function findNode(root: TreeNode | null, path: string): TreeNode | null {
  if (!root) return null;
  if (root.path === path) return root;
  for (const child of root.children ?? []) {
    const hit = findNode(child, path);
    if (hit) return hit;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Folder expansion state. Kept OUTSIDE React (module map + localStorage) so
// each TreeRow owns only its own open flag: toggling a folder re-renders that
// subtree, not the whole tree — O(subtree) on a 1.4k-note vault — and the
// state survives tree reloads, search round-trips, and full page reloads.
// Default: every folder folded. The tree used to open the top level on a
// first visit, and the owner asked for the opposite: a vault of twelve
// folders is a wall of files until each one is opened on purpose, and a
// folder the reader opened stays open (the map remembers) so the cost is
// one click per folder, once.
// ---------------------------------------------------------------------------
const EXPANDED_KEY = "astrolabe.tree-expanded";

function loadExpanded(): Map<string, boolean> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    if (raw) return new Map(Object.entries(JSON.parse(raw) as Record<string, boolean>));
  } catch {
    // corrupted or unavailable storage — start fresh
  }
  return new Map();
}

export const expandedMap = loadExpanded();

export function persistExpanded(): void {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify(Object.fromEntries(expandedMap)));
  } catch {
    // storage full/unavailable — expansion still works for this session
  }
}

export function defaultOpen(_depth: number): boolean {
  return false;
}

/** Fold or unfold EVERY folder. A 1,400-note vault's tree is a place a reader
 *  navigates, and after twenty minutes of browsing it is a place they have to
 *  dig themselves out of one chevron at a time — the single most-asked-for
 *  small thing Obsidian has and this tree did not. Writes the whole map, then
 *  asks the tree to re-seed (the rows keep their open state locally for cheap
 *  toggles, so a bulk write has to be followed by a remount — `treeEpoch` in
 *  the component below is that ask). */
export function setAllFolders(tree: TreeNode | null, open: boolean): void {
  const walk = (node: TreeNode): void => {
    for (const child of node.children ?? []) {
      if (child.type === "folder") {
        expandedMap.set(child.path, open);
        walk(child);
      }
    }
  };
  if (tree) walk(tree);
  persistExpanded();
}

/** Open or close every folder UNDER `path` (and `path` itself when closing):
 *  the header's fold-all, scoped to one branch. Followed by a remount, like
 *  every bulk write of the map. */
export function setFoldersUnder(tree: TreeNode | null, path: string, open: boolean): void {
  const walk = (node: TreeNode): void => {
    for (const child of node.children ?? []) {
      if (child.type === "folder") {
        expandedMap.set(child.path, open);
        walk(child);
      }
    }
  };
  const start = findTreeNode(tree, path);
  if (start) {
    walk(start);
    if (!open) expandedMap.set(path, false);
    else expandedMap.set(path, true);
  }
  persistExpanded();
}

/** Open every ancestor of `path`, so a reveal can scroll to a row that is
 *  actually on screen. */
export function expandAncestors(path: string): void {
  const parts = path.split("/");
  let at = "";
  for (let i = 0; i < parts.length - 1; i += 1) {
    at = at === "" ? parts[i] : `${at}/${parts[i]}`;
    expandedMap.set(at, true);
  }
  persistExpanded();
}

/** The two window events other surfaces drive the tree with. Events rather
 *  than store actions because the tree's expansion has never lived in the
 *  store — it is this module's own map — and the palette and the tab menu
 *  should not need a second copy of that fact. */
export const TREE_ALL_EVENT = "astrolabe:tree-all";
export const TREE_REVEAL_EVENT = "astrolabe:tree-reveal";

// ---------------------------------------------------------------------------
// Visitor topic sections: per-section collapse persists like the tree's
// folder expansion (module map + localStorage; true = collapsed, default open).
// ---------------------------------------------------------------------------
const TOPICS_KEY = "astrolabe.topics-collapsed";

function loadTopicsCollapsed(): Map<string, boolean> {
  try {
    const raw = localStorage.getItem(TOPICS_KEY);
    if (raw) return new Map(Object.entries(JSON.parse(raw) as Record<string, boolean>));
  } catch {
    // corrupted or unavailable storage — start fresh
  }
  return new Map();
}

export const topicsCollapsedMap = loadTopicsCollapsed();

export function persistTopicsCollapsed(): void {
  try {
    localStorage.setItem(TOPICS_KEY, JSON.stringify(Object.fromEntries(topicsCollapsedMap)));
  } catch {
    // storage full/unavailable — collapse still works for this session
  }
}

export interface TopicSectionData {
  key: string; // persistence key: "#<tag>" or "untagged"
  label: string; // "philosophy" / "Notes"
  notes: NoteRef[];
}

/** Group published notes into blog-style topic sections by tag. Notes carrying
 *  several tags appear under each; untagged ones land in a final "Notes"
 *  section. Sections are ordered by size (ties alphabetical), "Notes" last. */
export function buildTopics(
  notes: readonly NoteRef[],
  homePath: string | null,
  tagsByPath: Map<string, string[]>,
): TopicSectionData[] {
  const byTag = new Map<string, NoteRef[]>();
  const untagged: NoteRef[] = [];
  for (const note of notes) {
    if (note.path === homePath) continue; // pinned above the sections
    const tags = tagsByPath.get(note.path) ?? [];
    if (tags.length === 0) {
      untagged.push(note);
      continue;
    }
    for (const tag of tags) {
      const bucket = byTag.get(tag);
      if (bucket) bucket.push(note);
      else byTag.set(tag, [note]);
    }
  }
  const sections: TopicSectionData[] = [...byTag.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    // The KEY stays canonical (it is a localStorage persistence key and must
    // survive a label being renamed); only the LABEL is localised.
    .map(([tag, list]) => ({ key: `#${tag}`, label: tagLabel(tag), notes: list }));
  if (untagged.length > 0) {
    sections.push({ key: "untagged", label: t("notes"), notes: untagged });
  }
  return sections;
}

/** Notes only — `.md` files, exactly what the server counts when it moves a
 *  folder to .trash. The tree now also carries attachments, so a plain
 *  "count every file node" would have made the delete dialog promise to move
 *  1,214 notes when it meant 800 notes and 414 images. */
export function countNotes(node: TreeNode | null): number {
  if (!node) return 0;
  if (node.type === "file") return node.attachment ? 0 : 1;
  return (node.children ?? []).reduce((sum, child) => sum + countNotes(child), 0);
}

/** Attachments only — the other half of the sidebar footer's count. */
export function countAttachments(node: TreeNode | null): number {
  if (!node) return 0;
  if (node.type === "file") return node.attachment ? 1 : 0;
  return (node.children ?? []).reduce((sum, child) => sum + countAttachments(child), 0);
}
