// WHICH SHELL THIS DEVICE GETS — the one question client/main.tsx asks before
// anything renders.
//
// Two shells share one store, one API layer and one dictionary: the desktop's
// (client/App.tsx — tabs, panes, grips, a status bar) and the phone's
// (client/phone/PhoneShell.tsx — a bottom tab bar, a navigation stack, sheets).
// Exactly one is mounted. This module is the whole decision, kept free of the
// store and of the DOM so a node test can hold it.
//
// ONE QUESTION, ONE CONSTANT. "≤700px, or a coarse primary pointer that
// cannot hover": a phone, a tablet with no mouse in either orientation (the
// two-column tablet layout exists for exactly that device), or a window
// dragged narrow. It began as the desktop's drawer breakpoint with its 999px
// ceiling lifted for a finger; since 3.27.0 the drawer is gone and this is the
// only copy of the question in the client (tests/drawerQuery.test.ts holds
// every file to it). A tablet with a trackpad reports `hover: hover` and keeps
// the desktop shell — its pointer can aim at a 12px grip, and its owner chose
// a keyboard.

/** The phone shell is mounted wherever this matches. Re-evaluated on
 *  `change`, so a rotation, a foldable opening or a window dragged narrow
 *  switches shells cleanly. */
export const PHONE_SHELL_QUERY = "(max-width: 700px), ((pointer: coarse) and (hover: none))";

/** Inside the phone shell: two columns — the navigation rail, a list column
 *  and the note beside it.
 *
 *  THE SHAPE, NOT ONE WIDTH (3.34). It was `(min-width: 768px)` alone, and a
 *  reader opened a Galaxy Z Fold: its inner screen is 690×829 CSS px at DPR
 *  2.625 (1812×2176 device px), under 768, so it got the phone's one column
 *  stretched across a page the size of a paperback — a folder of files as one
 *  row per line from edge to edge. What makes a screen a tablet is that it is
 *  WIDE FOR ITS HEIGHT: a phone held upright is about 0.45 as wide as it is
 *  tall, a Fold opened 0.83, a tablet in portrait 0.7–0.75. So two columns
 *  wherever the screen is 768 wide (every tablet, either way up), or at least
 *  640 wide and no taller than 4:3 — the open Fold (690×829; the Fold 6's
 *  707×823), a small tablet, a phone held sideways (915×412 is past 768
 *  anyway). The rail (72) and a list column that shrinks to 240 leave the
 *  note 378px at 690: a phone's measure, beside its list. A phone upright
 *  never qualifies (412×915 is 0.45), nor a Fold's cover screen (344×882).
 *  A 720×820 window with a pen (check-phone's stylus posture) does now: it is
 *  the same shape as the open Fold, and gets the same two columns. */
export const TABLET_QUERY = "(min-width: 768px), ((min-width: 640px) and (min-aspect-ratio: 3/4))";

export type Shell = "phone" | "desktop";

/** The whole decision. It took a second argument for one release (3.26.x):
 *  the reader's `Phone layout: Classic`, which kept the drawer shell on a
 *  phone. Classic was deleted in 3.27.0 with the drawer, its pan and its
 *  back-gesture guard; the question is the device's alone again. */
export function shellFor(phoneQueryMatches: boolean): Shell {
  return phoneQueryMatches ? "phone" : "desktop";
}
