// THE FIELD THE KEYBOARD IS FOR STAYS ON SCREEN.
//
// When the on-screen keyboard opens, the layout viewport shrinks — that is
// what the Android shell's inset listener arranges (mobile/…/SystemBarInsets)
// and what `interactive-widget=resizes-content` asks Chrome Android for
// (client/index.html). Shrinking is the RIGHT behaviour and it is only half a
// fix: the browser scrolls the focused element into the new, shorter viewport
// for a plain field in normal flow, and does nothing at all for a field
// inside a fixed sheet or its own scroller — which on a phone is most of
// them. The capture sheet's textarea, the sidebar's search, a Settings row,
// the sigil form: each sat under the keyboard with the caret in it.
//
// CodeMirror has its own answer (Editor.tsx scrolls the caret, with the
// status bar's height as the margin) because a text editor knows where its
// caret is and a DOM node does not. This covers everything that is not that:
// one listener, one `scrollIntoView` on the element that holds focus.
//
// Coarse pointers only, and its own chunk: `visualViewport` resizes on a
// desktop when the window resizes, and scrolling the focused field on a
// window resize would be a new and unasked-for behaviour there.

/** How long to keep answering resizes after one arrives: Android reports the
 *  IME's height in two or three steps as it animates in, and only the last
 *  one is the height that matters. */
const SETTLE_MS = 280;

function fieldNeedingRoom(): HTMLElement | null {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return null;
  const tag = el.tagName;
  const typing =
    tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
  if (!typing) return null;
  // CodeMirror's own scroller answers for the caret, which is not the same
  // place as the element's box once a note is longer than a screen.
  if (el.closest(".cm-editor")) return null;
  return el;
}

export function installSoftKeyboard(): void {
  const vv = window.visualViewport;
  if (!vv) return;

  let timer = 0;
  const settle = (): void => {
    const el = fieldNeedingRoom();
    if (!el) return;
    // `nearest`, not `center`: a field already in view must not jump, and a
    // field under the keyboard needs the smallest move that clears it.
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  vv.addEventListener("resize", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(settle, SETTLE_MS);
  });

  // Focusing a field while the keyboard is ALREADY up fires no resize at all
  // — the viewport does not change, only which field is in it — so the same
  // answer is given on focus.
  document.addEventListener(
    "focusin",
    () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, SETTLE_MS);
    },
    true,
  );
}
