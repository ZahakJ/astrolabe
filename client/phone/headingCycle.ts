// The phone accessory bar's H key, as a pure edit (tests/headingCycle.test.ts).
//
// None → ## → ### → none: the three a phone writer actually uses, in the order
// they are wanted. A `#` title is typed, not cycled into.
//
// The caret is part of the answer (2026-11 purge, E3): the edit used to be
// dispatched with no selection, so a caret at the start of an empty line was
// mapped to BEFORE the inserted `## ` and the title went in front of it —
// "Title## " on disk. A caret inside the marker lands after it; one in the
// words keeps its place in them.

export const HEADING = /^(\s{0,3})(#{1,6})\s/;

export interface HeadingEdit {
  /** Line-relative offsets of the replaced marker, and what replaces it. */
  from: number;
  to: number;
  insert: string;
  /** Line-relative caret after the edit. */
  caret: number;
}

export function cycleHeadingEdit(line: string, caret: number): HeadingEdit {
  const m = HEADING.exec(line);
  const from = m ? m[1].length : 0;
  const to = m ? m[0].length : from;
  const level = m ? m[2].length : 0;
  const insert = level === 0 ? "## " : level === 2 ? "### " : "";
  const after = caret <= to ? from + insert.length : caret + insert.length - (to - from);
  return { from, to, insert, caret: Math.max(after, 0) };
}
