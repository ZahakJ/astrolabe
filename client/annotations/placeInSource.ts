// Where a note's annotations sit in its SOURCE — the editor's half of the
// anchor. The reading view finds a quote in rendered prose; here the source
// is reduced to prose with a map back (fromSource.ts), the quote is found in
// that prose the same way (`findQuote` over the folded text), and the hit is
// mapped back onto source offsets. Pure, so tests/textQuote.test.ts can run it
// under bare node; the CodeMirror plugin that paints the result is
// client/editor/annotationMarks.ts.

import { findQuote, foldMap } from "../../shared/textQuote.ts";
import type { NoteAnnotation } from "../../shared/types.ts";
import { proseMapOfSource } from "./fromSource.ts";

/** Where each annotation sits in `source`, or nowhere. */
export function placeInSource(source: string, list: readonly NoteAnnotation[]): { from: number; to: number; annotation: NoteAnnotation }[] {
  const { text, map } = proseMapOfSource(source);
  const { raw } = foldMap(text);
  const out: { from: number; to: number; annotation: NoteAnnotation }[] = [];
  for (const annotation of list) {
    const hit = findQuote(text, annotation);
    if (!hit || hit.end <= hit.start) continue;
    const from = map[raw[hit.start]];
    const to = map[raw[hit.end - 1]] + 1;
    if (from === undefined || to === undefined || to <= from) continue;
    out.push({ from, to, annotation });
  }
  return out;
}

