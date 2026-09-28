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
// cannot hover": a phone, a tablet with no mouse in either orientation (in
// landscape it gets the shell's two columns, SPLIT_QUERY below), or a window
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

/** Inside the phone shell, the one question the layout asks: TWO COLUMNS
 *  (the navigation rail, a list column and the note beside it) or ONE (the
 *  phone's stack: a list pushes the note across the whole glass, Back comes
 *  home to the list). Every screen that can stand beside a list — Notes,
 *  Search, Sigils, Orbits, Media, the Library, Today — reads this through
 *  PhoneShell's `split`, and nothing else in the client asks.
 *
 *  THE NOTE'S MEASURE DECIDES (3.39.1). Two columns only where both are
 *  useful: a note read at its measure (the reading view's ~640–680px of text)
 *  beside a list at a list's (320px) needs about 1000px. 3.34 gave two
 *  columns by SHAPE — 768 wide, or 640 wide and nearly square — so that a
 *  Galaxy Z Fold opened (690×829 CSS px at DPR 2.625; the Fold 6's 707×823)
 *  would not get a phone's column stretched edge to edge. What it got
 *  instead was a rail, a list and a note of 358px: a phone's measure in a
 *  third of a book-sized page. The owner, from that Fold: "when opening a
 *  note on tablet/galaxy fold formfactor the note only shows on half a
 *  page." So below 1000 the shell is the phone's, whatever the shape: the
 *  open Fold either way up, an iPad in portrait (768/810/820), a small
 *  tablet, a phone held sideways, the Fold's cover (344×882). From 1000 up —
 *  a tablet in landscape (1024/1080/1180), a desktop-class width with a
 *  finger — two columns, the list a fixed 320 and able to step aside
 *  (PhoneShell's hide control) so a note can take the page there too. */
export const SPLIT_MIN_PX = 1000;
export const SPLIT_QUERY = `(min-width: ${SPLIT_MIN_PX}px)`;

/** THE NOTE'S TABS (3.39.1): where the glass is a page and not a palm — the
 *  open Fold, every tablet either way up — the note screen carries a strip of
 *  the notes opened on this device, so opening a second note does not close
 *  the first (client/phone/noteTabs.ts). 600 wide lets the open Fold in and
 *  keeps every phone out (the Fold's cover is 344, a Pixel 412); 480 tall
 *  keeps a phone held sideways (915×412) on the one-note shell, where a
 *  second row of chrome would cost a tenth of the height. */
export const NOTE_TABS_QUERY = "(min-width: 600px) and (min-height: 480px)";

export type Shell = "phone" | "desktop";

/** The whole decision. It took a second argument for one release (3.26.x):
 *  the reader's `Phone layout: Classic`, which kept the drawer shell on a
 *  phone. Classic was deleted in 3.27.0 with the drawer, its pan and its
 *  back-gesture guard; the question is the device's alone again. */
export function shellFor(phoneQueryMatches: boolean): Shell {
  return phoneQueryMatches ? "phone" : "desktop";
}
