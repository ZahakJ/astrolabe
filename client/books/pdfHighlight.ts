// The search hit on a PDF page, drawn with the CSS Custom Highlight API over
// pdf.js's text layer: the registry, the range builder, the clear. Moved out
// of client/books/BookReader.tsx unchanged.

import { findMatches } from "./search.ts";

const HIGHLIGHT_NAME = "astrolabe-book-search";

interface HighlightRegistry {
  set(name: string, highlight: object): void;
  delete(name: string): void;
}

function highlightRegistry(): HighlightRegistry | null {
  const css = CSS as unknown as { highlights?: HighlightRegistry };
  return css.highlights ?? null;
}

export function clearHighlight(): void {
  highlightRegistry()?.delete(HIGHLIGHT_NAME);
}

/**
 * Paint the k-th match on a page, scroll it into view, and hand back the Range.
 *
 * Uses the CSS Custom Highlight API where the browser has it: a Range can then
 * be painted without inserting a single node into the text layer, which is the
 * only way to highlight text that must ALSO stay selectable and stay in the
 * exact positions pdf.js computed. Inserting `<mark>` elements — the obvious
 * alternative — reflows the layer and breaks the selection annotating needs.
 * Where the API is missing the match still scrolls into view; it is simply not
 * tinted.
 *
 * The Range comes back because it is also the KEYBOARD'S way to select a
 * passage: `/phrase` then `h` marks exactly what was found (see `hitRange`).
 */
export function highlightHit(
  scroller: HTMLElement | null,
  page: number,
  nth: number,
  query: string,
): Range | null {
  clearHighlight();
  if (!scroller || query.trim() === "") return null;
  const host = scroller.querySelector<HTMLElement>(`[data-page="${page}"] .s-book__text`);
  if (!host) return null;

  // Flatten the layer into one string plus a node map, then run the SAME
  // matcher the extracted text was searched with. THE SAME STRING, and that is
  // the load-bearing part: the scan haystack (`textOf`) writes "\n" wherever
  // pdf.js reported `hasEOL`, and the text layer renders that same fact as a
  // <br> — which a SHOW_TEXT walk skips entirely. The two haystacks then
  // disagreed about both offsets and match COUNT, so the `nth` computed
  // against one indexed into the other and `n` lit the wrong occurrence. The
  // walk now speaks for the <br> the way the extractor spoke for `hasEOL`.
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const nodes: { node: Text; start: number }[] = [];
  let text = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if ((node as Element).tagName === "BR") text += "\n";
      continue;
    }
    const textNode = node as Text;
    nodes.push({ node: textNode, start: text.length });
    text += textNode.data;
  }
  const matches = findMatches(text, query);
  const match = matches[nth];
  if (!match) return null;

  const locate = (offset: number): { node: Text; offset: number } | null => {
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      if (nodes[i].start <= offset) return { node: nodes[i].node, offset: offset - nodes[i].start };
    }
    return null;
  };
  const from = locate(match.start);
  const to = locate(Math.max(match.start, match.end - 1));
  if (!from || !to) return null;
  const range = document.createRange();
  try {
    range.setStart(from.node, Math.min(from.offset, from.node.data.length));
    range.setEnd(to.node, Math.min(to.offset + 1, to.node.data.length));
  } catch {
    return null;
  }

  const registry = highlightRegistry();
  const Ctor = (window as unknown as { Highlight?: new (...ranges: Range[]) => object }).Highlight;
  if (registry && Ctor) registry.set(HIGHLIGHT_NAME, new Ctor(range));

  const rect = range.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  if (rect.height > 0 && (rect.top < box.top + 40 || rect.bottom > box.bottom - 40)) {
    scroller.scrollBy({ top: rect.top - box.top - box.height / 3, behavior: "auto" });
  }
  return range;
}
