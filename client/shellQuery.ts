// WHICH SHELL THIS DEVICE GETS — the one question client/main.tsx asks before
// anything renders.
//
// Two shells share one store, one API layer and one dictionary: the desktop's
// (client/App.tsx — tabs, panes, grips, a status bar) and the phone's
// (client/phone/PhoneShell.tsx — a bottom tab bar, a navigation stack, sheets).
// Exactly one is mounted. This module is the whole decision, kept free of the
// store and of the DOM so a node test can hold it.
//
// THE QUERY IS THE DRAWER'S, WITH ITS CEILING LIFTED FOR A FINGER. The drawer
// breakpoint (client/state.ts DRAWER_QUERY) asks "≤700px, or ≤999px on a
// coarse primary pointer that cannot hover". The phone shell asks the same two
// questions and drops the 999 on the second: a tablet in landscape is 1180px
// wide and is still a slab of glass with no mouse, and the two-column tablet
// layout exists for exactly that device. Everything DRAWER_QUERY matches, this
// matches (tests/shellQuery.test.ts holds the containment), so no device that
// had the phone's drawer gets the desktop's panes back. A tablet with a
// trackpad reports `hover: hover` and keeps the desktop shell — its pointer can
// aim at a 12px grip, and its owner chose a keyboard.

/** The phone shell is mounted wherever this matches (and the reader has not
 *  picked Classic — see `shellFor`). Re-evaluated on `change`, so a rotation,
 *  a foldable opening or a window dragged narrow switches shells cleanly. */
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

/** This device's own choice, for one release: the new phone shell, or the
 *  classic drawer shell it replaces. A property of the SCREEN IN THE HAND, so
 *  it never travels to the vault (client/prefsSync.ts NEVER_TRAVELS). */
export const PHONE_LAYOUT_KEY = "astrolabe.phoneLayout";
export type PhoneLayout = "new" | "classic";
/** Raised on `window` when the choice changes, so the mount can follow it
 *  without a reload. */
export const PHONE_LAYOUT_EVENT = "astrolabe:phone-layout";

export type Shell = "phone" | "desktop";

/** The whole decision: the device asks for a phone and the reader has not
 *  asked for the classic shell. */
export function shellFor(phoneQueryMatches: boolean, layout: PhoneLayout): Shell {
  return phoneQueryMatches && layout !== "classic" ? "phone" : "desktop";
}

export function readPhoneLayout(): PhoneLayout {
  try {
    return localStorage.getItem(PHONE_LAYOUT_KEY) === "classic" ? "classic" : "new";
  } catch {
    return "new";
  }
}

export function setPhoneLayout(layout: PhoneLayout): void {
  try {
    if (layout === "classic") localStorage.setItem(PHONE_LAYOUT_KEY, "classic");
    else localStorage.removeItem(PHONE_LAYOUT_KEY);
  } catch {
    // storage unavailable: the choice lasts this page
  }
  window.dispatchEvent(new Event(PHONE_LAYOUT_EVENT));
}

/** Would this device get the phone shell if the reader asked for it? The
 *  settings row that offers the choice is drawn only where it means something. */
export function phoneShellDevice(): boolean {
  return typeof window !== "undefined" && window.matchMedia(PHONE_SHELL_QUERY).matches;
}
