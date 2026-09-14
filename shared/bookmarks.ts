// BOOKMARKS — a list of notes you keep coming back to, kept IN THE VAULT.
//
// "Pin to top" was a per-browser scratch area, gone on the phone. So the
// bookmarks are a note, `Bookmarks.md` at the vault root: a Markdown list of
// wikilinks, readable in Obsidian, synced by git with everything else, and
// the sidebar draws it as a section above the tree. Every edit here is a
// byte-surgical change to that note — the list lines move, nothing else on
// the page does (a reader may keep prose or headings around the list).

import { noteTitleOf } from "./noteFormat.ts";

export const BOOKMARKS_PATH = "Bookmarks.md";

const ITEM_RE = /^(\s*)[-*+]\s+\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]\s*$/;

export interface BookmarkItem {
  /** The wikilink target as written ("Ledger", "Books/Ledger"). */
  target: string;
  /** The alias when one was written. */
  label: string | null;
  /** 0-based line in the note. */
  line: number;
}

/** Every `- [[link]]` line of the note, in order. */
export function parseBookmarks(md: string): BookmarkItem[] {
  const out: BookmarkItem[] = [];
  md.split(/\r?\n/).forEach((line, i) => {
    const m = ITEM_RE.exec(line);
    if (m) out.push({ target: m[2].trim(), label: m[3]?.trim() || null, line: i });
  });
  return out;
}

function eolOf(md: string): string {
  return /\r\n/.test(md) ? "\r\n" : "\n";
}

/** `md` with `- [[title]]` appended after the last bookmark line (or at the
 *  end, on a fresh note). A note that already lists the title is unchanged. */
export function addBookmark(md: string, path: string): string {
  const title = noteTitleOf(path);
  const items = parseBookmarks(md);
  if (items.some((b) => sameTarget(b.target, path))) return md;
  const eol = eolOf(md);
  const lines = md === "" ? [] : md.replace(/\r?\n$/, "").split(/\r?\n/);
  const at = items.length > 0 ? items[items.length - 1].line + 1 : lines.length;
  lines.splice(at, 0, `- [[${title}]]`);
  return lines.join(eol) + eol;
}

export function removeBookmark(md: string, path: string): string {
  const items = parseBookmarks(md);
  const hit = items.find((b) => sameTarget(b.target, path));
  if (!hit) return md;
  const eol = eolOf(md);
  const lines = md.replace(/\r?\n$/, "").split(/\r?\n/);
  lines.splice(hit.line, 1);
  return lines.length === 0 ? "" : lines.join(eol) + eol;
}

/** The list lines in a new order: `order` is the targets as they should
 *  read, top to bottom. Lines between them (prose) keep their places. */
export function reorderBookmarks(md: string, order: readonly string[]): string {
  const items = parseBookmarks(md);
  if (items.length < 2) return md;
  const eol = eolOf(md);
  const lines = md.replace(/\r?\n$/, "").split(/\r?\n/);
  const texts = new Map(items.map((b) => [b.target, lines[b.line]]));
  const sorted = [...order.filter((t) => texts.has(t)), ...items.map((b) => b.target).filter((t) => !order.includes(t))];
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
  return parseBookmarks(md).some((b) => sameTarget(b.target, path));
}
