// A NOTE'S FOOTNOTES, READ OFF ITS SOURCE — for the outline pane's Footnotes
// section, and for the two hops the editor and the reading view answer
// (reference → definition, definition → reference).
//
// The reading renderer (client/reading/render.ts) already collects
// definitions as it walks blocks, but it collects them INTO a rendered tree,
// and the pane needs the same list as data: which label, what it says, and
// where each end of it sits in the source so a click can put the caret
// there. Read here once, pure, with the same fence rule every other line
// walker uses (shared/fences.ts): a `[^1]` inside a code block is code.
//
// Order is the READER's order — the order the references are met in the
// prose, not the order the definitions were typed at the foot — because the
// pane is the numbering a reader sees on the page, and the reading view
// prints the definitions in that same order.

import { closesFence, fenceOpener, sourceLines } from "./fences.ts";

export interface FootnoteRef {
  /** 1-based line in the note's FULL source. */
  line: number;
  /** 0-based column of the `[` — where the caret lands. */
  col: number;
}

export interface Footnote {
  label: string;
  /** The definition's text, continuation lines joined with a space; empty
   *  when the reference has no definition at all. */
  text: string;
  /** 1-based line of the `[^label]:` definition, null when there is none. */
  defLine: number | null;
  /** Every `[^label]` in the prose, in source order. May be empty: a
   *  definition nothing points at still counts, and the pane says so. */
  refs: FootnoteRef[];
}

const DEF_RE = /^\[\^([^\]\s]+)\]:\s?(.*)$/;
const REF_RE = /\[\^([^\]\s]+)\](?!:)/g;
const CONTINUATION_RE = /^(\t| {2,})\S/;

/** Every footnote the note carries, references first in reading order, then
 *  any definition nothing references. */
export function footnotesOf(content: string): Footnote[] {
  const lines = sourceLines(content);
  const byLabel = new Map<string, Footnote>();
  const order: string[] = [];
  const get = (label: string): Footnote => {
    let note = byLabel.get(label);
    if (!note) {
      note = { label, text: "", defLine: null, refs: [] };
      byLabel.set(label, note);
      order.push(label);
    }
    return note;
  };
  let fence: ReturnType<typeof fenceOpener> = null;
  let inFrontmatter = lines[0]?.trim() === "---";
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (inFrontmatter) {
      if (i > 0 && (raw.trim() === "---" || raw.trim() === "...")) inFrontmatter = false;
      continue;
    }
    if (fence) {
      if (closesFence(raw, fence)) fence = null;
      continue;
    }
    const opened = fenceOpener(raw);
    if (opened) {
      fence = opened;
      continue;
    }
    const def = DEF_RE.exec(raw);
    if (def) {
      const note = get(def[1]);
      // The FIRST definition wins, as it does in the renderer; a second one
      // with the same label is text the reader will see at the foot twice
      // and is not this module's problem to hide.
      if (note.defLine === null) {
        note.defLine = i + 1;
        let text = def[2].trim();
        for (let j = i + 1; j < lines.length && CONTINUATION_RE.test(lines[j]); j++) {
          text += ` ${lines[j].trim()}`;
          i = j;
        }
        note.text = text;
      }
      continue;
    }
    // `code spans` keep their brackets: a `[^1]` in backticks is not a note.
    const prose = raw.replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length));
    REF_RE.lastIndex = 0;
    for (let m = REF_RE.exec(prose); m; m = REF_RE.exec(prose)) {
      get(m[1]).refs.push({ line: i + 1, col: m.index });
    }
  }
  // Definitions nobody references sink to the end: the numbering on the
  // page is the references', and a stray definition has no number there.
  const referenced = order.filter((l) => byLabel.get(l)!.refs.length > 0);
  const stray = order.filter((l) => byLabel.get(l)!.refs.length === 0);
  return [...referenced, ...stray].map((l) => byLabel.get(l)!);
}

/** SIDENOTES THAT NEVER OVERLAP. Each note wants to sit beside the line that
 *  references it (`want`, a top offset), and is `height` tall; when the one
 *  above it has not finished, it waits under that one plus `gap`. Returns the
 *  top each note gets, in the order given (which is the references' order
 *  down the page). Pure, so the stacking is tested without a layout. */
export function stackSidenotes(
  notes: readonly { want: number; height: number }[],
  gap: number,
): number[] {
  const tops: number[] = [];
  let floor = -Infinity;
  for (const note of notes) {
    const top = Math.max(note.want, floor);
    tops.push(top);
    floor = top + note.height + gap;
  }
  return tops;
}
