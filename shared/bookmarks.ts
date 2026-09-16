// BOOKMARKS — a list of notes you keep coming back to, kept IN THE VAULT.
//
// "Pin to top" was a per-browser scratch area, gone on the phone. So the
// bookmarks are a note, `Bookmarks.md` at the vault root: a Markdown list of
// wikilinks, readable in Obsidian, synced by git with everything else, and
// the sidebar draws it as a section above the tree. Every edit here is a
// byte-surgical change to that note — the list lines move, nothing else on
// the page does (a reader may keep prose or headings around the list).
//
// THREE KINDS OF LINE, and the grammar is the reader's own Markdown:
//
//   - [[Ledger]]                       a note
//   - [[Ledger#April|April's ledger]]  a HEADING inside a note — the row
//                                      opens the note and lands on it
//   - `tag:physics before:2026` Physics   a SEARCH: an inline code span holding
//                                      a query the search box would take,
//                                      with an optional label after it
//
// The code span is the search's own spelling because it is what a reader
// already writes when they paste a query into prose, and because Obsidian
// renders it as exactly what it is: a query, not a link to a note that does
// not exist. Headings in the note (the reader's own groups) are prose to this
// parser and are left where they are.

import { noteTitleOf } from "./noteFormat.ts";

export const BOOKMARKS_PATH = "Bookmarks.md";

const NOTE_RE = /^(\s*)[-*+]\s+\[\[([^\]|#]+)(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]\s*$/;
const SEARCH_RE = /^(\s*)[-*+]\s+`([^`]+)`(?:\s+(.+?))?\s*$/;

export interface BookmarkItem {
  /** A note (with or without a heading), or a saved search. */
  kind: "note" | "search";
  /** The wikilink target as written ("Ledger", "Books/Ledger") — or, for a
   *  search, the query text inside the code span. */
  target: string;
  /** The heading after the `#`, when one was written (notes only). */
  heading: string | null;
  /** The alias when one was written; a search's trailing text. */
  label: string | null;
  /** 0-based line in the note. */
  line: number;
}

/** Every bookmark line of the note, in order. */
export function parseBookmarks(md: string): BookmarkItem[] {
  const out: BookmarkItem[] = [];
  md.split(/\r?\n/).forEach((line, i) => {
    const n = NOTE_RE.exec(line);
    if (n) {
      out.push({ kind: "note", target: n[2].trim(), heading: n[3]?.trim() || null, label: n[4]?.trim() || null, line: i });
      return;
    }
    const s = SEARCH_RE.exec(line);
    if (s && s[2].trim() !== "") out.push({ kind: "search", target: s[2].trim(), heading: null, label: s[3]?.trim() || null, line: i });
  });
  return out;
}

function eolOf(md: string): string {
  return /\r\n/.test(md) ? "\r\n" : "\n";
}

/** The whole-note bookmark for `path`, if the note lists one. A heading
 *  bookmark into the same note is a different bookmark — a reader who kept
 *  one section of a long note has not kept the note — so it never counts. */
function wholeNote(items: readonly BookmarkItem[], path: string): BookmarkItem | undefined {
  return items.find((b) => b.kind === "note" && b.heading === null && sameTarget(b.target, path));
}

/** `md` with `- [[title]]` appended after the last bookmark line (or at the
 *  end, on a fresh note). A note that already lists the title is unchanged. */
export function addBookmark(md: string, path: string): string {
  const title = noteTitleOf(path);
  const items = parseBookmarks(md);
  if (wholeNote(items, path)) return md;
  const eol = eolOf(md);
  const lines = md === "" ? [] : md.replace(/\r?\n$/, "").split(/\r?\n/);
  const at = items.length > 0 ? items[items.length - 1].line + 1 : lines.length;
  lines.splice(at, 0, `- [[${title}]]`);
  return lines.join(eol) + eol;
}

export function removeBookmark(md: string, path: string): string {
  const hit = wholeNote(parseBookmarks(md), path);
  if (!hit) return md;
  const eol = eolOf(md);
  const lines = md.replace(/\r?\n$/, "").split(/\r?\n/);
  lines.splice(hit.line, 1);
  return lines.length === 0 ? "" : lines.join(eol) + eol;
}

/** What a row is dragged by: one string per line that tells a heading
 *  bookmark from the whole note and a search from a note of the same name. */
export function bookmarkKey(b: BookmarkItem): string {
  return b.kind === "search" ? `\`${b.target}\`` : b.heading === null ? b.target : `${b.target}#${b.heading}`;
}

/** The list lines in a new order: `order` is the keys (bookmarkKey) as they
 *  should read, top to bottom. Lines between them (prose) keep their places. */
export function reorderBookmarks(md: string, order: readonly string[]): string {
  const items = parseBookmarks(md);
  if (items.length < 2) return md;
  const eol = eolOf(md);
  const lines = md.replace(/\r?\n$/, "").split(/\r?\n/);
  const texts = new Map(items.map((b) => [bookmarkKey(b), lines[b.line]]));
  const keys = items.map(bookmarkKey);
  const sorted = [...order.filter((k) => texts.has(k)), ...keys.filter((k) => !order.includes(k))];
  items.forEach((b, i) => {
    lines[b.line] = texts.get(sorted[i]) ?? lines[b.line];
  });
  return lines.join(eol) + eol;
}

/** Whether a bookmark's target names `path` — by full path or by title. */
export function sameTarget(target: string, path: string): boolean {
  const t = target.trim().toLowerCase().replace(/\.(md|tex|latex)$/i, "");
  const p = path.toLowerCase().replace(/\.(md|tex|latex)$/i, "");
  return t === p || t === noteTitleOf(path).toLowerCase();
}

export function isBookmarked(md: string, path: string): boolean {
  return wholeNote(parseBookmarks(md), path) !== undefined;
}
