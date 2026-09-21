// Carrying a reader's PLACE from one note to another.
//
// Turning a note over to its other face (shared/twins.ts) is not opening a
// different note — it is the same piece in the other language, and a reader
// three quarters of the way down the English one wants to land three quarters
// of the way down the Arabic one. The two files have different lengths, so
// the thing that travels is a FRACTION, never a pixel offset and never a line
// number.
//
// Deliberately crude, and honestly so: a fraction is not a paragraph, and two
// translations do not run in step. It lands the reader in the right REGION,
// which is what a scroll position is for; nothing here pretends to align
// sentences, and the moment it tried it would need the two texts and a
// guess.
//
// Two surfaces answer for a note's scroll — the editor (a CodeMirror scroller)
// and the reading view (a plain element) — and each registers its own reader
// while it is mounted. Each keeps its own per-path memory of the last
// position; this module is only the HAND-OVER between two different paths,
// spent the moment it is taken.

/** Where each open surface is, asked at the moment of the swap. Keyed by
 *  note path: two panes showing two notes both answer, and the swap asks
 *  about the one it is turning over. */
const sources = new Map<string, () => number | null>();

/** The one fraction in flight, and the note it is addressed to. One, because
 *  a swap is a single gesture: a second one before the first has landed means
 *  the reader changed their mind, and the newer place is the true one. */
let pending: { path: string; fraction: number } | null = null;

/** A surface says where it is, while it is mounted. Returns its own removal,
 *  to be called from the same effect's cleanup. */
export function registerScrollSource(path: string, read: () => number | null): () => void {
  sources.set(path, read);
  return () => {
    if (sources.get(path) === read) sources.delete(path);
  };
}

/** The fraction of `path`'s scroll range currently scrolled past, or null
 *  when nothing is showing it (or it does not scroll at all). */
export function scrollFractionOf(path: string): number | null {
  return sources.get(path)?.() ?? null;
}

/** 0 at the top, 1 at the bottom — from an element that scrolls. Null when
 *  there is nothing to scroll, which is not the same as "at the top": a short
 *  note has no place to carry, and forcing the other face to its own top
 *  would move a reader who never asked to be moved. */
export function fractionOfElement(el: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
} | null): number | null {
  if (el === null) return null;
  const range = el.scrollHeight - el.clientHeight;
  if (range <= 1) return null;
  return Math.min(1, Math.max(0, el.scrollTop / range));
}

/** Hand this place to `path`, for whichever surface opens it next. */
export function carryScrollTo(path: string, fraction: number | null): void {
  pending = fraction === null ? null : { path, fraction };
}

/** Take the place handed to `path`, once. Null when none was. */
export function takeCarriedScroll(path: string): number | null {
  if (pending === null || pending.path !== path) return null;
  const { fraction } = pending;
  pending = null;
  return fraction;
}

/** The pixel offset a carried fraction means for this scroller. */
export function carriedScrollTop(
  fraction: number,
  el: { scrollHeight: number; clientHeight: number },
): number {
  return Math.round(fraction * Math.max(0, el.scrollHeight - el.clientHeight));
}
