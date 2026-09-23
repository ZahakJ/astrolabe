// THE HARDWARE BACK BUTTON, which on a phone is the gesture for "undo the
// last thing that appeared".
//
// The Android shell's back (mobile/…/MainActivity.java) is WebView history:
// back one page, and at the first page out to the connection screen. The
// client pushes one history entry per note and NONE for the layers it draws
// over a note — so a reader with the notes drawer out, the outline drawer
// out, the palette up or Settings open swiped back and the page UNDERNEATH
// changed while the layer stayed exactly where it was. The layer a phone
// reader most wants to dismiss was the one thing back could not touch. In
// Chrome Android the same gesture left the instance outright.
//
// The fix is the standard one and it is small: while a layer is up, ONE extra
// history entry stands behind the page. Back pops that entry, the layer
// closes, and nothing navigates. Close the layer any other way — Esc, the
// scrim, its own ✕ — and the entry is taken back out, so the stack is exactly
// as deep as it was before the layer opened and a reader never has to press
// back twice for one page.
//
// WHAT CLOSES IS DECIDED BY ESCAPE, not by a second list kept in step with
// the first. Every layer in this product closes on Escape (it is a contract,
// and App.tsx's Escape ladder already encodes which one goes first when
// several are up), so back synthesises an Escape and lets that ladder answer.
// Two behaviours that must agree can either be written twice or written once;
// this is the once.
//
// Only on a coarse pointer, and loaded as its own chunk from main.tsx: a
// desktop browser's Back means "the previous page" and nothing here should
// reach it.
//
// The guard itself — the entry, its retraction, and why that retraction
// waits a microtask (3.23.1: a note tapped in the drawer did not open) — is
// client/backGuard.ts, apart from the store so tests/backGesture.test.ts can
// drive it against a browser-shaped history.

import { installBackGuard } from "./backGuard.ts";
import { useStore } from "./state.ts";

/** Is any layer this module is responsible for on screen?
 *
 *  The store's own flags, plus the two panes that are drawers on a phone.
 *  Deliberately not the short-lived DOM-only layers (a confirm, a context
 *  menu, the theme picker): those are raised FROM one of these, they close on
 *  Escape and on an outside tap already, and a history entry per menu would
 *  make back feel like it was counting. */
function layerUp(): boolean {
  const s = useStore.getState();
  return (
    s.sidebarOpen ||
    s.paletteOpen ||
    s.shortcutsOpen ||
    s.settingsOpen ||
    s.captureOpen ||
    s.loginOpen ||
    s.trashOpen ||
    s.unusedOpen ||
    s.moderationOpen ||
    s.bannerModalOpen ||
    // The outline pane is a drawer below 700px and a grid column above it;
    // only the drawer is a layer over the page.
    (!s.panelCollapsed && window.matchMedia("(max-width: 700px)").matches)
  );
}

/** Installed at boot, before App mounts the router, so the guard's popstate
 *  listener runs first and can swallow a pop the router must not apply. */
export function installBackGesture(): void {
  if (typeof window === "undefined") return;
  installBackGuard({
    history: window.history,
    layerUp,
    subscribe: (fn) => void useStore.subscribe(fn),
    onPopState: (fn) => window.addEventListener("popstate", fn),
    // Dispatched on the active element so a trapped dialog's own handler sees
    // it exactly as a keypress.
    escape: () => {
      const target = document.activeElement ?? document.body;
      target.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    },
    defer: (fn) => queueMicrotask(fn),
    later: (fn) => void setTimeout(fn, 0),
  });
}
