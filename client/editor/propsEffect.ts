// The properties card was hidden or brought back (client/propsCard.ts).
//
// Same shape as langEffect.ts and for the same reason: the card is drawn by
// CodeMirror widgets, which repaint only when a transaction rebuilds their
// decorations. Editor.tsx watches the store's `propsCard` and dispatches this
// into its live view; the block builders read propsCardHidden() again, and
// the widgets carry the answer in their eq() so the DOM is really replaced.
// Its own module so the LaTeX preview can listen without importing the
// markdown live preview.

import { StateEffect } from "@codemirror/state";

/** Dispatched into a live view when the properties card is hidden or shown. */
export const propsCardChanged = StateEffect.define<null>();
