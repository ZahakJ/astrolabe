// HIGHLIGHTS → NOTE. Every passage marked in a book, written as one note
// beside the PDF — a chapter heading per outline entry when the book has
// an outline, one list when it does not, and each passage as the same
// `> [!quote]` block a citation writes, so the link under it opens the
// book at the page and pulses the passage.
//
// THE MARKERS ARE THE CONTRACT. Highlights are the store's (ASTROLABE_DATA,
// keyed by the book's bytes) and the note is the reader's; the two meet in
// a block fenced by two HTML comments. Re-running the action rewrites what
// sits between the markers and nothing else, so the reader can write above
// them, below them, and even between the quotes — as long as it is outside
// the fence, it survives. A note with no markers (one the reader made by
// hand, or one from before the markers existed) gets the block appended,
// never overwritten. Pure and node-tested; the client only fetches the
// pieces and writes the result.

import { bookCitationLink, boundingRect, citationBlock, type BookHighlight } from "./bookAnchor.ts";

export const HIGHLIGHTS_START = "<!-- astrolabe:highlights -->";
export const HIGHLIGHTS_END = "<!-- /astrolabe:highlights -->";

/** One entry of a PDF's own outline, as the reader reads it (page 0 when
 *  the entry points nowhere we could resolve). */
export interface OutlineEntry {
  title: string;
  page: number;
  depth: number;
}

export interface HighlightsNoteInput {
  highlights: readonly BookHighlight[];
  outline: readonly OutlineEntry[];
  /** The book's file name — the wikilink's target, as a citation spells it. */
  target: string;
  /** "Muqaddimah, p. 42" — chrome, so the caller localises it. */
  labelFor(page: number): string;
}

/** The outline depth that reads as "the chapters": the shallowest level
 *  with at least two entries that name a page. A book whose top level is
 *  one entry ("Contents") with the chapters under it gets the chapters. An
 *  empty answer means the note is one list. */
export function chapterEntries(outline: readonly OutlineEntry[]): OutlineEntry[] {
  const depths = [...new Set(outline.map((e) => e.depth))].sort((a, b) => a - b);
  for (const depth of depths) {
    const rows = outline.filter((e) => e.depth === depth && e.page > 0 && e.title.trim() !== "");
    if (rows.length >= 2) return [...rows].sort((a, b) => a.page - b.page);
  }
  return [];
}

/** Highlights in reading order: by page, then down the page. */
function inReadingOrder(list: readonly BookHighlight[]): BookHighlight[] {
  return [...list].sort((a, b) => a.page - b.page || (a.rects[0]?.y ?? 0) - (b.rects[0]?.y ?? 0) || a.createdAt - b.createdAt);
}

function quoteOf(h: BookHighlight, input: HighlightsNoteInput): string {
  const link = bookCitationLink(input.target, { page: h.page, rect: boundingRect(h.rects), id: h.id }, input.labelFor(h.page));
  const block = citationBlock(h.text, link);
  // The margin note follows its passage as ordinary prose, outside the
  // callout: it is the reader's own words, and a quote box around them
  // would make them read as the author's.
  return h.note.trim() === "" ? block : `${block}\n${h.note.trim()}\n`;
}

/** The block between the markers, markers included. Empty highlights give
 *  an empty block — the caller decides whether to write that at all. */
export function highlightsBlock(input: HighlightsNoteInput): string {
  const ordered = inReadingOrder(input.highlights);
  const chapters = chapterEntries(input.outline);
  const parts: string[] = [HIGHLIGHTS_START, ""];
  if (chapters.length === 0) {
    for (const h of ordered) parts.push(quoteOf(h, input));
  } else {
    // Each passage belongs to the last chapter that begins at or before its
    // page; passages before the first chapter (a preface nobody outlined)
    // come first, under no heading. Chapters with no passage are not
    // written — the note is about what was marked, not the whole book.
    let at = 0;
    const groups: { title: string | null; items: BookHighlight[] }[] = [{ title: null, items: [] }];
    for (const h of ordered) {
      while (at < chapters.length && chapters[at].page <= h.page) {
        groups.push({ title: chapters[at].title.trim(), items: [] });
        at++;
      }
      groups[groups.length - 1].items.push(h);
    }
    for (const g of groups) {
      if (g.items.length === 0) continue;
      if (g.title !== null) parts.push(`## ${g.title}`, "");
      for (const h of g.items) parts.push(quoteOf(h, input));
    }
  }
  parts.push(HIGHLIGHTS_END);
  return parts.join("\n");
}

/** The whole note: `existing` with its marked block replaced, or the block
 *  appended when there is none; `lead` opens a note that did not exist —
 *  one line naming the book, so the file explains itself in Obsidian. */
export function mergeHighlightsNote(existing: string | null, block: string, lead: string): string {
  if (existing === null || existing.trim() === "") return `${lead}\n\n${block}\n`;
  const start = existing.indexOf(HIGHLIGHTS_START);
  const end = start === -1 ? -1 : existing.indexOf(HIGHLIGHTS_END, start + HIGHLIGHTS_START.length);
  if (start === -1 || end === -1) {
    const sep = existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
    return `${existing}${sep}${block}\n`;
  }
  return existing.slice(0, start) + block + existing.slice(end + HIGHLIGHTS_END.length);
}
