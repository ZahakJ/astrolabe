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

import { useStore } from "./state.ts";

/** Marks the entry this module pushed. */
const MARK = "astrolabeOverlay";

/** True while our guard entry is the current history entry. */
let guardUp = false;

/** Set for the one `popstate` our own `history.back()` provokes, so an
 *  Escape-closed layer does not ALSO get an Escape from the pop. */
let retracting = false;

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

function pushGuard(): void {
  if (guardUp) return;
  guardUp = true;
  history.pushState({ [MARK]: true }, "");
}

function retractGuard(): void {
  if (!guardUp) return;
  guardUp = false;
  // Only if the entry is still OURS. A reader who opened the drawer and then
  // opened a note from it has pushed a note entry on top; going back there
  // would undo the navigation they just asked for, so the guard is simply
  // abandoned — a stale entry costs one harmless extra back press at worst,
  // and undoing a reader's navigation costs them the note.
  if (!(history.state as Record<string, unknown> | null)?.[MARK]) return;
  retracting = true;
  history.back();
}

export function installBackGesture(): void {
  if (typeof window === "undefined") return;

  let was = layerUp();
  if (was) pushGuard();

  useStore.subscribe(() => {
    const now = layerUp();
    if (now === was) return;
    was = now;
    if (now) pushGuard();
    else retractGuard();
  });

  window.addEventListener("popstate", () => {
    if (retracting) {
      retracting = false;
      return;
    }
    if (!guardUp) return;
    guardUp = false;
    if (!layerUp()) return;
    // Escape decides WHICH layer, and re-arms the guard if the ladder left
    // another one standing. The event is dispatched on the active element so
    // a trapped dialog's own handler sees it exactly as a keypress.
    const target = document.activeElement ?? document.body;
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    // After React has committed whatever that closed.
    setTimeout(() => {
      was = layerUp();
      if (was) pushGuard();
    }, 0);
  });
}
