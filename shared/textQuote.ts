// ANCHORING A PASSAGE BY ITS WORDS.
//
// An annotation on a note has to survive the note being edited above it,
// re-rendered by three shells and reflowed in another reading face. An offset
// survives none of that; the words do. So an anchor is the W3C Web Annotation
// idea in its plainest form — the quote, plus a little of what came before
// and after it — and reattaching means finding the quote in the rendered text
// and, when it appears more than once, the occurrence whose surroundings
// match best. Nothing here touches the DOM: it works on one string and hands
// back offsets, so it can be tested under `node --test` and so the DOM half
// (client/annotations/anchor.ts) stays a mapping and nothing more.

export const QUOTE_MAX = 2000;
export const CONTEXT_MAX = 48;
export const NOTE_MAX = 4000;

export interface TextQuote {
  quote: string;
  prefix: string;
  suffix: string;
}

/** The bidi controls a renderer may add around a run: LRM, RLM, the embeddings
 *  and overrides, the isolates. Written as escapes so the source itself
 *  carries none of them. */
const BIDI = new RegExp("[\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]", "g");
const BIDI_ONE = new RegExp("^[\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]$");

/** Whitespace runs collapse to one space and the ends are trimmed, on BOTH
 *  sides of a comparison, so a quote made from a paragraph that later wraps
 *  differently still matches. Bidi controls are dropped for the same reason:
 *  the renderer may isolate a run the source did not. */
export function foldSpace(text: string): string {
  return text.replace(BIDI, "").replace(/\s+/g, " ").trim();
}

/** Build an anchor from a passage found at `start`..`end` of `text`. */
export function quoteAt(text: string, start: number, end: number): TextQuote {
  return {
    quote: foldSpace(text.slice(start, end)).slice(0, QUOTE_MAX),
    prefix: foldSpace(text.slice(Math.max(0, start - CONTEXT_MAX * 2), start)).slice(-CONTEXT_MAX),
    suffix: foldSpace(text.slice(end, end + CONTEXT_MAX * 2)).slice(0, CONTEXT_MAX),
  };
}

function commonTail(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}
function commonHead(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/** Where the anchor's quote sits in the FOLDED form of `text` (see
 *  `foldSpace`; callers map folded offsets back through `foldMap`), or null
 *  when the words are gone. Every occurrence is scored by how much of its
 *  surroundings agree with the stored prefix and suffix; a lone occurrence
 *  needs no score at all. */
export function findQuote(text: string, anchor: TextQuote): { start: number; end: number } | null {
  const hay = foldSpace(text);
  const needle = foldSpace(anchor.quote);
  if (needle === "") return null;
  const hits: number[] = [];
  let at = hay.indexOf(needle);
  while (at !== -1 && hits.length < 200) {
    hits.push(at);
    at = hay.indexOf(needle, at + 1);
  }
  if (hits.length === 0) return null;
  if (hits.length === 1) return { start: hits[0], end: hits[0] + needle.length };
  const prefix = foldSpace(anchor.prefix);
  const suffix = foldSpace(anchor.suffix);
  let best = hits[0];
  let bestScore = -1;
  for (const hit of hits) {
    // Folded on both sides: the stored context was trimmed when it was
    // taken, and the slice here carries the space that separated it.
    const before = foldSpace(hay.slice(Math.max(0, hit - CONTEXT_MAX), hit));
    const after = foldSpace(hay.slice(hit + needle.length, hit + needle.length + CONTEXT_MAX));
    const score = commonTail(before, prefix) + commonHead(after, suffix);
    if (score > bestScore) {
      bestScore = score;
      best = hit;
    }
  }
  return { start: best, end: best + needle.length };
}

/** The folded text of `text` and, for every folded character, the raw index
 *  it came from — what lets a hit in the folded text be turned back into a
 *  position in the original. Identical folding to `foldSpace`. */
export function foldMap(text: string): { folded: string; raw: number[] } {
  const raw: number[] = [];
  let out = "";
  let pendingSpace = false;
  let started = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (BIDI_ONE.test(ch)) continue;
    if (/\s/.test(ch)) {
      if (started) pendingSpace = true;
      continue;
    }
    if (pendingSpace) {
      out += " ";
      raw.push(i);
      pendingSpace = false;
    }
    out += ch;
    raw.push(i);
    started = true;
  }
  return { folded: out, raw };
}
