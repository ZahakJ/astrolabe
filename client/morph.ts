// MORPH — patch a live DOM subtree into the shape of a freshly built one.
//
// Several surfaces build their DOM outside React (the reading renderer, the
// sigil card, the tasks block) and then `replaceChildren` on every change.
// For a card that is re-read after each tick that meant the whole thing was
// torn down and rebuilt: the banner image fetched again, the folded
// "week's plan" snapped shut, the focused checkbox lost, and the eye saw a
// flash (the owner: "checking a task makes the cards flash"). Morphing
// keeps every node whose tag and class still match and touches only what
// changed — attributes, text, added or removed children — so a tick moves
// one checkbox and one number.
//
// Deliberately small: no keyed reconciliation beyond position, no event
// listener transfer (the NEW tree's listeners win where a node is replaced;
// where a node is kept, its old listeners stay — callers that attach
// listeners in the builder pass `onKeep` to re-arm them). A `<details>`
// keeps its open state, and a focused element keeps focus, because those
// belong to the reader, not the data.

export interface MorphOptions {
  /** Called for every kept element with its fresh twin, so a builder that
   *  wired handlers on the twin can move what it needs onto the kept node. */
  onKeep?(kept: Element, fresh: Element): void;
}

/** Elements whose behaviour lives in listeners the builder attached: they
 *  are always replaced by their fresh twin, so the handlers close over the
 *  data the card was just built from and never over a stale entry. */
const INTERACTIVE = new Set(["INPUT", "BUTTON", "SELECT", "TEXTAREA", "A"]);

function sameKind(a: Node, b: Node): boolean {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== Node.ELEMENT_NODE) return true;
  const ea = a as Element;
  const eb = b as Element;
  if (INTERACTIVE.has(ea.tagName)) return false;
  return ea.tagName === eb.tagName && ea.className === eb.className;
}

function syncAttributes(kept: Element, fresh: Element): void {
  for (const { name } of [...kept.attributes]) {
    if (!fresh.hasAttribute(name) && name !== "open") kept.removeAttribute(name);
  }
  for (const { name, value } of [...fresh.attributes]) {
    // A reader's fold is theirs: `open` on <details> is never overwritten.
    if (name === "open" && kept.tagName === "DETAILS") continue;
    if (kept.getAttribute(name) !== value) kept.setAttribute(name, value);
  }
  // Form state lives on properties, not attributes.
  if (kept instanceof HTMLInputElement && fresh instanceof HTMLInputElement) {
    if (kept.type === "checkbox" || kept.type === "radio") {
      if (kept.checked !== fresh.checked) kept.checked = fresh.checked;
    } else if (document.activeElement !== kept && kept.value !== fresh.value) {
      kept.value = fresh.value;
    }
    if (kept.disabled !== fresh.disabled) kept.disabled = fresh.disabled;
  }
  if (kept instanceof HTMLTextAreaElement && fresh instanceof HTMLTextAreaElement && document.activeElement !== kept && kept.value !== fresh.value) {
    kept.value = fresh.value;
  }
}

export function morph(kept: Element, fresh: Element, opts: MorphOptions = {}): void {
  syncAttributes(kept, fresh);
  opts.onKeep?.(kept, fresh);
  const a = [...kept.childNodes];
  const b = [...fresh.childNodes];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const oldNode = a[i];
    const newNode = b[i];
    if (oldNode === undefined) {
      kept.appendChild(newNode);
      continue;
    }
    if (newNode === undefined) {
      oldNode.remove();
      continue;
    }
    if (!sameKind(oldNode, newNode)) {
      kept.replaceChild(newNode, oldNode);
      continue;
    }
    if (oldNode.nodeType === Node.TEXT_NODE) {
      if (oldNode.textContent !== newNode.textContent) oldNode.textContent = newNode.textContent;
      continue;
    }
    if (oldNode.nodeType === Node.ELEMENT_NODE) {
      const oe = oldNode as Element;
      const ne = newNode as Element;
      // An image whose source did not change is never touched, so it never
      // reloads; a canvas is replaced wholesale (its bitmap is not in the DOM).
      if (oe.tagName === "CANVAS" || oe.tagName === "SVG" && oe.innerHTML !== ne.innerHTML) {
        kept.replaceChild(newNode, oldNode);
        continue;
      }
      morph(oe, ne, opts);
    }
  }
}
