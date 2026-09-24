// The admin's editor theme, mirrored to the server (the public site's default
// follows it). Debounced, beaconed on pagehide, and skipped when the server
// already has it. Moved out of client/state.ts unchanged, bar one setter
// (noteMirrored) for the value loadMe learns, since a module cannot assign
// another module's `let`.

import type { ThemeChoice } from "../themes.ts";
import * as api from "../api.ts";
import { useStore } from "../state.ts";

// ── Mirroring the admin's theme to the server ──────────────────────────────
// The public site's default follows the admin's editor theme, and that theme
// lives in this browser's localStorage — nowhere the server can read. So the
// browser posts it. DEBOUNCED, because the theme picker applies every
// highlighted row live and a decisive owner can commit three or four of them
// in a couple of seconds: only a SETTLED choice is worth a file write.
//
// The timer is deliberately generous (one second is longer than a keyboard
// walk through the picker and shorter than any pause a reader would call a
// decision) and it always sends the CURRENT theme, not the one that armed it —
// so a burst of picks costs exactly one request, naming the last room.
const MIRROR_DELAY = 1000;
let mirrorTimer: ReturnType<typeof setTimeout> | null = null;
let mirrorPending: ThemeChoice | null = null;
/** The value the server already has, so an unchanged pick sends nothing. */
let mirrorSent: string | null = null;

function flushMirror(): void {
  if (mirrorTimer !== null) {
    clearTimeout(mirrorTimer);
    mirrorTimer = null;
  }
  const theme = mirrorPending;
  mirrorPending = null;
  if (theme === null) return;
  // A page being unloaded gets a beacon; anything else gets the normal call,
  // whose answer refreshes the "Visitors see …" line the owner is looking at.
  if (document.visibilityState === "hidden") {
    if (api.beaconEditorTheme(theme)) mirrorSent = theme;
    return;
  }
  void api
    .putEditorTheme(theme)
    .then((info) => {
      mirrorSent = theme;
      useStore.setState({ publicTheme: info });
    })
    .catch((err) => {
      // Never a toast: the owner did not ask for this write, they asked for a
      // theme — and they got it. A failed mirror only means visitors keep the
      // previous default until the next pick.
      console.warn("astrolabe: mirroring the editor theme failed", err);
    });
}

/** Queue the admin's committed theme for the server (no-op for visitors). */
export function mirrorTheme(theme: ThemeChoice): void {
  const state = useStore.getState();
  // Only a real admin session mirrors: `admin` is false while previewing as a
  // visitor, and publicTheme is null for anyone the server did not tell.
  if (!state.admin || state.publicTheme === null) return;
  if (theme === mirrorSent) {
    mirrorPending = null;
    if (mirrorTimer !== null) {
      clearTimeout(mirrorTimer);
      mirrorTimer = null;
    }
    return;
  }
  mirrorPending = theme;
  if (mirrorTimer !== null) clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(flushMirror, MIRROR_DELAY);
  // A tab closed inside the debounce window must not swallow the pick.
  window.addEventListener("pagehide", flushMirror, { once: true });
}

/** Record what the server already serves for this browser's theme (loadMe
 *  owns the call), so an unchanged pick later sends nothing. */
export function noteMirrored(theme: string | null): void {
  mirrorSent = theme;
}
