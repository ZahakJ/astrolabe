// Wikilink parsing + resolution against the vault tree held in the zustand store.

import type { AliasEntry, TreeNode } from "../../shared/types.ts";
import { isNotePath, noteCandidates, stripNoteExt } from "../../shared/noteFormat.ts";

export interface NoteRef {
  title: string; // basename without .md
  path: string;  // vault-relative path
}

/** Matches [[Target]], [[Target|Alias]], [[Target#Heading]], [[Target#Heading|Alias]]. */
export const WIKILINK_RE = /\[\[([^[\]]+?)\]\]/g;

export interface WikilinkParts {
  target: string;
  heading: string | null;
  alias: string | null;
}

/** Split the inner text of a wikilink into target / #heading / |alias. */
export function parseWikilink(inner: string): WikilinkParts {
  let rest = inner;
  let alias: string | null = null;
  let heading: string | null = null;
  const pipe = rest.indexOf("|");
  if (pipe >= 0) {
    alias = rest.slice(pipe + 1).trim();
    rest = rest.slice(0, pipe);
  }
  const hash = rest.indexOf("#");
  if (hash >= 0) {
    heading = rest.slice(hash + 1).trim();
    rest = rest.slice(0, hash);
  }
  return { target: rest.trim(), heading, alias };
}

/** THE FLATTENED TREE, MEMOIZED ON THE TREE ITSELF.
 *
 *  `collectNotes` walks every node and then sorts the result with
 *  `localeCompare` — an Intl collation, the most expensive comparison in the
 *  language. That was fine when the answer was wanted once; it is not what
 *  this function is actually used for. `resolveLink` calls it, and
 *  `resolveLink` is called ONCE PER WIKILINK by the reading renderer, by the
 *  editor's live preview, by the hover card and by the router — so rendering
 *  the 3,000-line fixture note re-walked 2,376 notes and re-sorted 2,000 of
 *  them a hundred and seventy-six times. Measured at 4× CPU: 6.8% of the
 *  whole reading-view render and 2.8% of every keystroke, for an answer that
 *  is identical every time.
 *
 *  The store replaces `tree` with a NEW object on every refresh and never
 *  mutates the old one, so object identity is an exact stamp — the same
 *  bargain server/graphCache.ts strikes with `graphRevision()`. One entry is
 *  enough: there is one tree, and the moment it is replaced the old answer is
 *  dead rather than merely cold.
 *
 *  The returned array is FROZEN. Callers treat it as a read-only list today
 *  and a shared array that someone sorts in place would be a bug that only
 *  appears on the second call. */
interface NoteIndex {
  notes: readonly NoteRef[];
  /** Lowercased basename → the note a `[[Name]]` resolves to (shortest path
   *  wins, then alphabetical — the server's own rule, precomputed). */
  byTitle: Map<string, string>;
  /** Lowercased vault path → the note at it, for path-style targets. */
  byPathLower: Map<string, string>;
}

let indexTree: TreeNode | null | undefined;
let indexed: NoteIndex | null = null;

function noteIndex(tree: TreeNode | null): NoteIndex {
  if (indexed !== null && indexTree === tree) return indexed;
  const out: NoteRef[] = [];
  const walk = (node: TreeNode): void => {
    if (node.type === "file") {
      // Match on PATH, not name: the visitor-facing published tree names
      // nodes by bare title (no ".md") while paths stay real vault paths.
      // Any note format: a `.tex` file is a note, so it is a wikilink target,
      // an autocomplete candidate and a graph node like any other.
      if (isNotePath(node.path)) {
        out.push({ title: stripNoteExt(node.name), path: node.path });
      }
      return;
    }
    for (const child of node.children ?? []) walk(child);
  };
  if (tree) walk(tree);
  out.sort((a, b) => a.title.localeCompare(b.title));
  const byTitle = new Map<string, string>();
  const byPathLower = new Map<string, string>();
  for (const note of out) {
    // Duplicate names: the shortest path wins, ties broken alphabetically.
    // Precomputed here rather than by filtering + sorting the whole list on
    // every link, which is what the loop below used to do.
    const key = note.title.toLowerCase();
    const held = byTitle.get(key);
    if (held === undefined || note.path.length < held.length || (note.path.length === held.length && note.path.localeCompare(held) < 0)) {
      byTitle.set(key, note.path);
    }
    // FIRST wins, and the list is in title order — the same note `find()`
    // returned when two paths differed only in case.
    const lower = note.path.toLowerCase();
    if (!byPathLower.has(lower)) byPathLower.set(lower, note.path);
  }
  indexTree = tree;
  indexed = { notes: Object.freeze(out), byTitle, byPathLower };
  return indexed;
}

/** Flatten the tree into all markdown notes, sorted by title. */
export function collectNotes(tree: TreeNode | null): readonly NoteRef[] {
  return noteIndex(tree).notes;
}

// Frontmatter `aliases:` — the one name table the client cannot derive.
//
// The tree carries FILENAMES; an alias lives in a note's frontmatter, which the
// client has never read. Without this table the two resolvers disagreed on
// every aliased link in an Obsidian vault: the server drew the backlink and the
// graph edge, while the editor drew a DASHED link that offered to create a
// duplicate note — the disagreement links.test.ts exists to catch, on the very
// vault the README recruits. Filled from GET /api/aliases by the same refresh
// that loads the tree (state.loadTree), so the two are stale and fresh
// together, and scoped by the session exactly as the tree is.
const aliasEntries: AliasEntry[] = [];
const aliasPaths = new Map<string, string>(); // lowercased alias -> note path

/** Duplicate-name winner, the SERVER's rule (indexer.pickShortest): fewest
 *  segments, then shortest string, then alpha. Two notes claiming one alias is
 *  the normal state of a big vault, and the client has to name the same winner
 *  the backlink panel does. */
function shortestFirst(a: string, b: string): number {
  const depth = a.split("/").length - b.split("/").length;
  if (depth !== 0) return depth;
  if (a.length !== b.length) return a.length - b.length;
  return a.localeCompare(b);
}

/** Replace the alias table (state.ts owns the call, beside `loadTree`). */
export function setAliasTable(entries: readonly AliasEntry[]): void {
  aliasEntries.length = 0;
  aliasEntries.push(...entries);
  aliasPaths.clear();
  for (const entry of entries) {
    const key = entry.alias.toLowerCase();
    const held = aliasPaths.get(key);
    if (held === undefined || shortestFirst(entry.path, held) < 0) aliasPaths.set(key, entry.path);
  }
}

/** The alias table as the completion list wants it: every entry, with the note
 *  each one names. Sorted by the server; order is preserved here. */
export function aliasCompletions(): readonly AliasEntry[] {
  return aliasEntries;
}

/**
 * Resolve a wikilink target to a vault path, mirroring the server's rules:
 * basename match without .md, case-insensitive, shortest path wins on
 * duplicates, then frontmatter aliases. Also accepts an explicit
 * vault-relative path as target.
 */
export function resolveLink(target: string, tree: TreeNode | null): string | null {
  // `[[Paper.tex]]` and `[[Paper]]` name the same note — the extension comes
  // off whichever one it is, exactly as `.md` always did.
  const name = stripNoteExt(parseWikilink(target).target.toLowerCase());
  if (!name) return null;
  // Two map lookups where this used to filter and sort the whole vault twice
  // per link. The tables are built once per tree (see noteIndex) and encode
  // the same two tie-breaks the loops did.
  const { byTitle, byPathLower } = noteIndex(tree);

  const byName = byTitle.get(name);
  if (byName !== undefined) return byName;

  // Fall back to a path-style target like "folder/Note" or "folder/Note.tex".
  // Candidate ORDER mirrors the server's (`.md` first), so client and server
  // never disagree about which of two same-named notes a link means.
  for (const candidate of noteCandidates(name)) {
    const byPath = byPathLower.get(candidate);
    if (byPath !== undefined) return byPath;
  }
  // …and last, the note's OTHER names. Last is the rule, not an accident: a
  // file actually named `ML.md` must never lose its own name to an
  // `aliases: [ML]` some other note declares.
  return aliasPaths.get(name) ?? null;
}

// The heading offers and the heading jump (`headingTitles`, `findHeadingLine`)
// live in shared/headings.ts beside the rule they apply. Not here: this module
// is in the entry chunk (every surface resolves links), and a function here is
// emitted there with everything it imports — the heading rule, the furigana
// strip and the alignment marker — for the editor's sake alone.
