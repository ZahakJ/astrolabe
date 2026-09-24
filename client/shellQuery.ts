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

/** Inside the phone shell: wide enough for the navigation rail, a list column
 *  and the note side by side. Being in the phone shell is the other half of
 *  the condition, so this needs no pointer clause of its own.
 *
 *  768, not 701: the rail (72) and the list (320) leave the note 376px at
 *  768 — a phone's measure — and 328px at 720, which is a Galaxy with an S
 *  Pen held upright (check-phone's stylus posture). That device is a phone
 *  and gets the phone's one column; every tablet in portrait (768–834) and
 *  in landscape gets two. */
export const TABLET_QUERY = "(min-width: 768px)";

export type Shell = "phone" | "desktop";

/** The whole decision. It took a second argument for one release (3.26.x):
 *  the reader's `Phone layout: Classic`, which kept the drawer shell on a
 *  phone. Classic was deleted in 3.27.0 with the drawer, its pan and its
 *  back-gesture guard; the question is the device's alone again. */
export function shellFor(phoneQueryMatches: boolean): Shell {
  return phoneQueryMatches ? "phone" : "desktop";
}
