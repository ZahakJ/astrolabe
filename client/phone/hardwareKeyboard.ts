// IS THERE A REAL KEYBOARD? — the phone shell's one question about input.
//
// A tablet with a bluetooth keyboard is still a tablet: the phone shell stays
// mounted (the pointer is still a finger), but the reader now has Ctrl, Esc
// and a row of letters, and the global chords, Ctrl/Cmd+K and vim all start to
// mean something. Nothing in the platform says a keyboard is attached —
// `navigator.keyboard` is Chromium-only and answers layout questions, not
// presence — so it is inferred from the one thing an on-screen keyboard cannot
// do: deliver a printable keystroke WITHOUT the visual viewport having shrunk
// to make room for it. The soft keyboard takes a third of the screen before
// the first key; a hardware one takes nothing. A chord (Ctrl/Cmd/Alt + a key)
// or a navigation key (Escape, Tab, an arrow) settles it on its own, since no
// on-screen keyboard sends those to a web page.
//
// Once seen it stays seen for the page's life and for the device
// (`astrolabe.hardwareKeyboard`, never travelling): the answer describes the
// hardware in the hand, and a reader who typed on their keyboard yesterday
// should find vim's row in More today before they press a key.

export const HARDWARE_KEYBOARD_KEY = "astrolabe.hardwareKeyboard";
export const HARDWARE_KEYBOARD_EVENT = "astrolabe:hardware-keyboard";

export interface KeySample {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isComposing: boolean;
}

/** The visual viewport's height when the page was last at rest, and now. */
export interface ViewportSample {
  restingHeight: number;
  height: number;
}

/** Keys an on-screen keyboard does not send to a page. */
const HARDWARE_ONLY = new Set(["Escape", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"]);

/** A soft keyboard shrinks the visual viewport by far more than this; a
 *  browser's own chrome settling (the URL bar sliding away) by less. */
const SHRUNK_PX = 120;

/** Pure: does this keystroke prove a hardware keyboard? */
export function isHardwareKeystroke(e: KeySample, vv: ViewportSample | null): boolean {
  if (e.isComposing || e.key === "Process" || e.key === "Unidentified") return false;
  if ((e.ctrlKey || e.metaKey) && e.key.length === 1) return true;
  if (HARDWARE_ONLY.has(e.key)) return true;
  // A printable character with the viewport at its resting height: nothing
  // made room for an on-screen keyboard, so the key came from elsewhere.
  if (e.key.length === 1 && !e.altKey) {
    if (vv === null) return false;
    return vv.restingHeight - vv.height < SHRUNK_PX;
  }
  return false;
}

let seen = readSeen();

function readSeen(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(HARDWARE_KEYBOARD_KEY) === "1";
  } catch {
    return false;
  }
}

export function hardwareKeyboardSeen(): boolean {
  return seen;
}

export function subscribeHardwareKeyboard(cb: () => void): () => void {
  window.addEventListener(HARDWARE_KEYBOARD_EVENT, cb);
  return () => window.removeEventListener(HARDWARE_KEYBOARD_EVENT, cb);
}

/** Watch for the first proof. Returns the uninstall. */
export function installHardwareKeyboardWatch(): () => void {
  const vv = window.visualViewport;
  // The resting height is the tallest the visual viewport has been with no
  // field focused: a rotation resets it, a keyboard never raises it.
  let resting = vv?.height ?? window.innerHeight;
  const onResize = (): void => {
    const h = vv?.height ?? window.innerHeight;
    const typing = document.activeElement instanceof HTMLElement && document.activeElement.matches("input, textarea, [contenteditable]");
    if (!typing || h > resting) resting = h;
  };
  const onRotate = (): void => {
    resting = vv?.height ?? window.innerHeight;
  };
  const onKey = (e: KeyboardEvent): void => {
    if (seen) return;
    const sample: ViewportSample | null = vv ? { restingHeight: resting, height: vv.height } : null;
    if (!isHardwareKeystroke(e, sample)) return;
    seen = true;
    try {
      localStorage.setItem(HARDWARE_KEYBOARD_KEY, "1");
    } catch {
      // private window: this page still knows
    }
    window.dispatchEvent(new Event(HARDWARE_KEYBOARD_EVENT));
  };
  vv?.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onRotate);
  window.addEventListener("keydown", onKey, true);
  return () => {
    vv?.removeEventListener("resize", onResize);
    window.removeEventListener("orientationchange", onRotate);
    window.removeEventListener("keydown", onKey, true);
  };
}
