// THE DOM HALF OF AN ANCHOR: turning a rendered note into one string the
// shared matcher can search, turning its answer back into a Range, and
// painting ranges with the CSS Custom Highlight API — so a mark never adds a
// node to the rendered note and never breaks a paragraph's own markup.
//
// The text is gathered by walking every text node under the host in document
// order, EXCLUDING the furniture the renderer adds around a note (the
// properties card, transclusion cards, the empty-note hint): a passage lives in
// the prose, and a quote that spanned into a chip's label would never reattach.

import { findQuote, foldMap, quoteAt, type TextQuote } from "../../shared/textQuote.ts";

/** Elements whose text is chrome, not prose. */
const SKIP = ".s-rv-props, .s-rv-embed-card, .s-reading__empty, .s-rv-footnotes-title";

interface Piece {
  node: Text;
  start: number; // raw offset of this node's first character
}

interface Gathered {
  raw: string;
  pieces: Piece[];
}

function gather(host: HTMLElement): Gathered {
  const pieces: Piece[] = [];
  let raw = "";
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const el = node.parentElement;
      if (!el) return NodeFilter.FILTER_REJECT;
      if (el.closest(SKIP)) return NodeFilter.FILTER_REJECT;
      const tag = el.tagName;
      if (tag === "SCRIPT" || tag === "STYLE") return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    pieces.push({ node: text, start: raw.length });
    raw += text.data;
  }
  return { raw, pieces };
}

/** The text node and offset a raw offset falls in. */
function locate(pieces: Piece[], rawOffset: number, end: boolean): { node: Text; offset: number } | null {
  let lo = 0;
  let hi = pieces.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const piece = pieces[mid];
    const len = piece.node.data.length;
    const within = end ? rawOffset > piece.start && rawOffset <= piece.start + len : rawOffset >= piece.start && rawOffset < piece.start + len;
    if (within) return { node: piece.node, offset: rawOffset - piece.start };
    if (rawOffset < piece.start) hi = mid - 1;
    else lo = mid + 1;
  }
  const last = pieces[pieces.length - 1];
  if (last && rawOffset >= last.start + last.node.data.length) return { node: last.node, offset: last.node.data.length };
  return null;
}

/** A Range for the anchor inside `host`, or null when its words are gone. */
export function rangeFor(host: HTMLElement, anchor: TextQuote): Range | null {
  const { raw, pieces } = gather(host);
  if (pieces.length === 0) return null;
  const hit = findQuote(raw, anchor);
  if (!hit) return null;
  const map = foldMap(raw);
  const startRaw = map.raw[hit.start];
  const endRaw = map.raw[hit.end - 1] + 1;
  if (startRaw === undefined || endRaw === undefined) return null;
  const a = locate(pieces, startRaw, false);
  const b = locate(pieces, endRaw, true);
  if (!a || !b) return null;
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

/** An anchor for the reader's current selection inside `host`, or null when
 *  the selection is empty, outside the prose, or made of chrome. */
export function anchorFromSelection(host: HTMLElement): TextQuote | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!host.contains(range.commonAncestorContainer)) return null;
  const { raw, pieces } = gather(host);
  const offsetOf = (node: Node, offset: number, end: boolean): number | null => {
    // A boundary on an element points at a child; move it to the nearest
    // text node in the right direction.
    let text: Text | null = null;
    let inner = offset;
    if (node.nodeType === Node.TEXT_NODE) text = node as Text;
    else {
      const el = node as Element;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const kids = [...el.childNodes];
      const from = end ? kids[Math.min(offset, kids.length) - 1] : kids[offset];
      if (from) {
        walker.currentNode = from;
        text = from.nodeType === Node.TEXT_NODE ? (from as Text) : end ? (lastText(from) ?? null) : (firstText(from) ?? null);
        inner = text && end ? text.data.length : 0;
      }
    }
    if (!text) return null;
    const piece = pieces.find((p) => p.node === text);
    return piece ? piece.start + inner : null;
  };
  const start = offsetOf(range.startContainer, range.startOffset, false);
  const end = offsetOf(range.endContainer, range.endOffset, true);
  if (start === null || end === null || end <= start) return null;
  const anchor = quoteAt(raw, start, end);
  return anchor.quote.length >= 2 ? anchor : null;
}

function firstText(node: Node): Text | undefined {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  return (walker.nextNode() as Text | null) ?? undefined;
}
function lastText(node: Node): Text | undefined {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let last: Text | undefined;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) last = n as Text;
  return last;
}

// ── Painting ────────────────────────────────────────────────────────────────

interface HighlightRegistry {
  set(name: string, highlight: object): void;
  delete(name: string): void;
}
type HighlightCtor = new (...ranges: Range[]) => object;

function registry(): HighlightRegistry | null {
  const css = CSS as unknown as { highlights?: HighlightRegistry };
  return css.highlights ?? null;
}
function ctor(): HighlightCtor | null {
  return (globalThis as { Highlight?: HighlightCtor }).Highlight ?? null;
}

export const MARK_PREFIX = "vellum-note-";

/** Paint `ranges` grouped by ink (and one extra name per public mark). The
 *  registry is global to the page, so each host paints under its own
 *  `scope` and clears only what it painted. */
export function paintMarks(scope: string, marks: { range: Range; ink: number; isPublic: boolean }[]): void {
  const reg = registry();
  const Ctor = ctor();
  if (!reg || !Ctor) return;
  clearMarks(scope);
  const byName = new Map<string, Range[]>();
  for (const m of marks) {
    const key = `${MARK_PREFIX}${scope}-${m.ink}`;
    (byName.get(key) ?? byName.set(key, []).get(key)!).push(m.range);
    if (m.isPublic) {
      const pub = `${MARK_PREFIX}${scope}-public`;
      (byName.get(pub) ?? byName.set(pub, []).get(pub)!).push(m.range);
    }
  }
  for (const [name, ranges] of byName) reg.set(name, new Ctor(...ranges));
  painted.set(scope, [...byName.keys()]);
}

const painted = new Map<string, string[]>();

export function clearMarks(scope: string): void {
  const reg = registry();
  if (!reg) return;
  for (const name of painted.get(scope) ?? []) reg.delete(name);
  painted.delete(scope);
}

export function marksSupported(): boolean {
  return registry() !== null && ctor() !== null;
}

/** Which of `ranges` contains the point, if any. Custom highlights take no
 *  events, so a click on a mark is found by asking where the caret would land. */
export function rangeAtPoint(ranges: { id: string; range: Range }[], x: number, y: number): string | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let node: Node | null = null;
  let offset = 0;
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) {
      node = pos.offsetNode;
      offset = pos.offset;
    }
  } else if (doc.caretRangeFromPoint) {
    const r = doc.caretRangeFromPoint(x, y);
    if (r) {
      node = r.startContainer;
      offset = r.startOffset;
    }
  }
  if (!node) return null;
  for (const { id, range } of ranges) {
    try {
      if (range.comparePoint(node, offset) === 0) return id;
    } catch {
      // a node outside the range's root — not this one
    }
  }
  return null;
}
