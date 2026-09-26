// A #tag TAPPED IN A NOTE, on the phone. The editor's tag pills (inline and
// in the properties card, client/editor/livePreview.ts) and the reading
// view's (client/reading/render.ts) answer a tap by dispatching
// `astrolabe:search` with "#tag" — the desktop's Sidebar listens and searches
// for it. The phone shell has no sidebar, and nothing listened: a finger on a
// tag was swallowed (the pill prevents the editor's own mousedown, so the
// caret did not land either) and the note simply sat there. Found by the
// 3.35 gate on a long note, where the Arabic chrome's taller lines put the
// tap on `#hosting`: no search, no caret, no keyboard bar.
//
// On the phone that event means the tag's own screen — every note carrying
// it (screens/TagScreen.tsx), the same list the Tags segment and the chip
// rows open. Anything that is not one bare tag is not ours to answer here.

const ONE_TAG = /^#([\p{L}\p{N}_/-]+)$/u;

/** The tag an `astrolabe:search` detail names, without its "#", or null when
 *  the detail is not exactly one tag. */
export function tagOfSearch(detail: unknown): string | null {
  if (typeof detail !== "string") return null;
  const m = ONE_TAG.exec(detail.trim());
  return m ? m[1] : null;
}
