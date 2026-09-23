// A long press, for a finger: held still for 450ms, it is the row's menu
// rather than its tap. The desktop's right-click lives here on a phone.
//
// Pointer events rather than touch events, so a stylus and a mouse on a
// narrow window get it too; the `contextmenu` Android fires on a long press
// is answered as the same gesture (and suppressed, so the platform's own
// "copy link" bubble does not open over the sheet). The click that follows
// the release is swallowed by the caller through `fired()`.

import { useRef } from "react";

const HOLD_MS = 450;
/** A finger that travels this far is scrolling, not holding. */
const SLOP_PX = 10;

export function useLongPress(onLong: () => void) {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);
  const cb = useRef(onLong);
  cb.current = onLong;

  const clear = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  const fire = (): void => {
    clear();
    firedRef.current = true;
    try {
      navigator.vibrate?.(8);
    } catch {
      // not every platform lets a page vibrate; the sheet is the feedback
    }
    cb.current();
  };

  return {
    fired(): boolean {
      const f = firedRef.current;
      firedRef.current = false;
      return f;
    },
    handlers: {
      onPointerDown(e: React.PointerEvent) {
        if (e.button !== 0) return;
        firedRef.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        timer.current = window.setTimeout(fire, HOLD_MS);
      },
      onPointerMove(e: React.PointerEvent) {
        const s = start.current;
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > SLOP_PX) clear();
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
      onContextMenu(e: React.MouseEvent) {
        e.preventDefault();
        if (!firedRef.current) fire();
      },
    },
  };
}
