// WHAT A HEADING IS — one answer for every surface that asks.
//
// About twenty regexes used to answer it, in two flavours: the reading view,
// the outline and the anchor table took `# ` at column 0 only; the editor's
// folding, sectioning, `[[Note#` completion and the flashcard scanner took up
// to three spaces of indent (CommonMark's rule, and CodeMirror's). The seams
// showed where the two met: the editor offered `[[Note#Heading]]` for an
// indented heading the reading view drew as a paragraph with no id, so the
// link landed nowhere; the completion list read YAML `# comments` in the
// frontmatter as headings; and the anchor table slugged `# Title {.center}` as
// "title-center" while the reading view gave the element the id "title".
//
// The rule now, everywhere:
//   · A heading is CommonMark's ATX heading: up to three spaces, one to six
//     `#`, then a space or a tab. (Four spaces is code; `#tag` is a tag.)
//   · Nothing inside the frontmatter is a heading (shared/noteParse.ts's one
//     fence rule), and nothing inside a code fence (shared/fences.ts).
//   · Its TITLE is its text with the alignment marker (shared/blockAlign.ts),
//     furigana readings, inline markdown and any closing `#`s taken off.
//   · Its ID is that title slugged, with `-1`, `-2` for repeats in document
//     order — the id the reading view assigns and `[[Note#…]]` resolves to.
//
// No DOM, no node:* — the server's indexer, the pocket and the client all
// import this.

import { stripAlignMarker } from "./blockAlign.ts";
import { closesFence, fenceOpener, sourceLines, type Fence } from "./fences.ts";
import { stripFurigana } from "./furigana.ts";
import { splitFrontmatter } from "./noteParse.ts";

/** An ATX heading line: `$1` the hashes, `$2` the text (closing `#`s and an
 *  alignment marker still on it). */
export const HEADING_RE = /^ {0,3}(#{1,6})[ \t]+(.*)$/;

/** A heading line's marker — indent, hashes and the space after them — for a
 *  caller that strips it to get at the words. */
export const HEADING_PREFIX_RE = /^ {0,3}#{1,6}[ \t]+/;

/** True when `line` is a heading line. */
export function isHeadingLine(line: string): boolean {
  return HEADING_RE.test(line);
}

/** The heading on `line`, or null: its level and its raw text. */
export function headingOf(line: string): { level: number; raw: string } | null {
  const m = HEADING_RE.exec(line);
  return m ? { level: m[1].length, raw: m[2] } : null;
}

/** Inline markdown removed from heading text — for display and for slugging.
 *  `{漢字|かんじ}` is the word 漢字 with a reading over it; the outline, the
 *  slug and a search hit want the word. */
export function stripHeadingInline(text: string): string {
  return stripFurigana(text)
    .replace(/!\[\[([^[\]]+?)\]\]/g, "$1")
    .replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_m, t: string, a?: string) => (a ?? t).trim())
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*|__|~~|==/g, "")
    .replace(/(^|\s)[*_]|[*_](\s|$)/g, "$1$2")
    .replace(/\s+#+\s*$/, "")
    .trim();
}

/** A heading's title: its raw text without the alignment marker, the
 *  readings, the inline markdown or the closing hashes. */
export function headingTitle(raw: string): string {
  return stripHeadingInline(stripAlignMarker(raw));
}

/** A title as an anchor id, before de-duplication: lowercased, letters,
 *  digits, spaces and hyphens kept (any script), spaces to hyphens. */
export function headingSlug(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
  return base || "section";
}

/** Deterministic, collision-free ids in document order: `intro`, `intro-1`… */
export class HeadingSlugger {
  private seen = new Map<string, number>();

  slug(text: string): string {
    const base = headingSlug(text);
    const n = this.seen.get(base) ?? 0;
    this.seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  }
}

/** One heading of a note. `line` is 1-based in the WHOLE file. */
export interface HeadingEntry {
  level: number;
  raw: string;
  title: string;
  id: string;
  line: number;
}

/** The index of the first line after the frontmatter (0 when there is none),
 *  over `sourceLines(md)`. */
export function bodyStartLine(md: string): number {
  return splitFrontmatter(md).bodyStartLine;
}

/** Every heading in a markdown note, in order: outside the frontmatter and
 *  outside code fences, with the ids the reading view assigns. */
export function scanHeadings(md: string): HeadingEntry[] {
  const out: HeadingEntry[] = [];
  const slugger = new HeadingSlugger();
  const lines = sourceLines(md);
  let fence: Fence | null = null;
  for (let i = bodyStartLine(md); i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    const opened = fenceOpener(line);
    if (opened) {
      fence = opened;
      continue;
    }
    const h = headingOf(line);
    if (!h) continue;
    const title = headingTitle(h.raw);
    out.push({ level: h.level, raw: h.raw, title, id: slugger.slug(title), line: i + 1 });
  }
  return out;
}
