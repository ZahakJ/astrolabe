// THE FOOTNOTE HOP, AS AN EVENT — from the outline pane's Footnotes section
// (client/components/FootnotesPanel.tsx) to whichever surface holds the
// note: the editor (components/Editor.tsx) puts the caret on the reference
// or the definition; the reading view (reading/ReadingView.tsx) scrolls to
// the superscript, the sidenote or the foot. The same wire the outline uses
// for headings (`astrolabe:goto-heading`), with its own name because its
// address is a LABEL, not a line: the pane reads the note's source and the
// surfaces read their own, and a line number computed from one can be stale
// against the other while a save is in flight — a label is not.

export const GOTO_FOOTNOTE_EVENT = "astrolabe:goto-footnote";

export interface GotoFootnote {
  path: string;
  label: string;
  /** Which end: the `[^label]` in the prose, or the `[^label]:` at the foot. */
  end: "ref" | "def";
}

export function gotoFootnote(detail: GotoFootnote): void {
  window.dispatchEvent(new CustomEvent<GotoFootnote>(GOTO_FOOTNOTE_EVENT, { detail }));
}
