// THE PROPERTIES CARD, HIDDEN AND BROUGHT BACK.
//
// The owner: "make it possible to disable the properties block on notes …
// but ya shouldn't add extra clutter for people who don't want it." So there
// is no new button anywhere. The switch is `settings.propsCard` (Settings →
// Writing → Properties card), a fact about the VAULT like its sibling
// `emptyPropsCard`, so hiding the card on the laptop hides it on the phone
// without a second gesture. The quick way in is a right-click on the card
// itself (a hold on the phone), which is where a reader already is when the
// card is in their way; the ways back are the toast's Undo, the palette's
// "Show properties", the phone sheet's Properties segment and the setting.
//
// ONLY THE OWNER'S VIEWS. A visitor's copy of a note always carries its card:
// a display preference of the person who writes the notes is not an editorial
// decision about what readers get, and `admin` is false while previewing as a
// visitor, so the preview shows the site as it is.
//
// THIS FILE IS FIRST PAINT, so it holds only the predicate and the listener:
// the reading renderer reads `propsCardHidden()` for every visitor. What a
// right-click DOES — the menu, the settings write, the toast — is
// ./propsActions.ts, its own chunk, fetched when one of them is used.

import { useStore } from "./state.ts";

/** The card in either surface, full or empty (noteMeta.ts, livePreview.ts). */
const CARD = ".cm-s-props, .s-rv-props";

/** True when this session draws no properties card. Every surface that
 *  builds one asks this one question (livePreview, the LaTeX preview, both
 *  reading renderers), so the answer cannot differ between them. */
export function propsCardHidden(): boolean {
  const s = useStore.getState();
  return s.admin && !s.propsCard;
}

/** Whether a right-click or hold on `target` is the card's to answer. A text
 *  field inside it (a value being edited, the add-property form) keeps the
 *  platform's menu — paste, spelling — and so does a selection that reaches
 *  into the card, which the browser copies better than any menu of ours. */
export function propsMenuTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const card = target.closest<HTMLElement>(CARD);
  if (!card || !useStore.getState().admin) return null;
  // Inside the card only: the editor's card sits in `.cm-content`, which is
  // itself contenteditable, and every click in it would match from there.
  const field = target.closest("input, textarea, select, [contenteditable='true']");
  if (field && card.contains(field)) return null;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && sel.toString().trim() !== "" && sel.containsNode(card, true)) return null;
  return card;
}

let installed = false;

/** One listener on the document for every card on every surface, the shape
 *  embedPickup.ts already has: the card is built by four renderers, two of
 *  them inside CodeMirror widgets whose events the editor never sees, and a
 *  menu wired into each would be four menus. The phone's note screen answers
 *  its own holds first (an action sheet) and stops the event there. */
export function installPropsMenu(): void {
  if (installed) return;
  installed = true;
  document.addEventListener("contextmenu", (ev) => {
    const card = propsMenuTarget(ev.target);
    if (!card) return;
    ev.preventDefault();
    // Shift+F10 and the Menu key raise `contextmenu` with `button: 0`, at
    // the focused element: the menu opens under the card's head and takes
    // focus, the rule every menu here follows.
    const fromKeyboard = ev.button !== 2;
    const box = (card.querySelector(".cm-s-props__head, .s-rv-props__head") ?? card).getBoundingClientRect();
    const x = fromKeyboard ? box.left + Math.min(24, box.width / 2) : ev.clientX;
    const y = fromKeyboard ? box.bottom : ev.clientY;
    void import("./propsActions.ts").then((m) => m.openPropsMenu({ x, y, fromKeyboard }));
  });
}
