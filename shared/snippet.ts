// THE SNIPPET UNDER A SEARCH HIT — one implementation, two indexes.
//
// These three functions lived inside server/indexer.ts for as long as the
// sidebar search had one kind of answer. The page store (server/pdfText.ts)
// is a second index answering the same box, and a book page's snippet has to
// be cut, escaped and `<mark>`ed by exactly the rule a note's is: the client
// renders both through one renderer (client/components/snippet.tsx) and a
// snippet that disagreed about where a word boundary is, or whether `&amp;`
// was escaped before or after the match, would show up as a row that looks
// subtly wrong beside its neighbours. Moved here rather than exported from the
// indexer so the page store depends on nothing that holds the note index.
//
// It moved again, from server/ to shared/, when a THIRD index appeared: the
// pocket server (mobile/src/pocket/), which searches a GitHub-backed vault
// inside a phone's WebView. Same argument, one row further out — the rows it
// returns land in the same renderer as the other two.

import { findAnyMatches } from "./fold.ts";

/** Characters kept either side of the first match. */
export const SNIPPET_RADIUS = 80;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Cut a word-boundary window out of `flat` around [at, at+len), returning
 *  the trimmed text with "…" marking every real elision — never a half word,
 *  never an orphaned punctuation fragment at either edge. */
export function windowAround(flat: string, at: number, len: number, radius: number): string {
  let start = Math.max(0, at - radius);
  let end = Math.min(flat.length, at + len + radius);
  if (start > 0) {
    // Snap forward to the next word boundary.
    const space = flat.indexOf(" ", start - 1);
    if (space !== -1 && space < at) start = space + 1;
  }
  if (end < flat.length) {
    // Snap back to the previous word boundary.
    const space = flat.lastIndexOf(" ", end);
    if (space > at + len) end = space;
  }
  let text = flat.slice(start, end).trim();
  // Drop orphaned punctuation left behind by the cut (edges only).
  if (start > 0) text = text.replace(/^[\s,;:.!?…·—–-]+/, "");
  if (end < flat.length) text = text.replace(/[\s,;:·—–-]+$/, "");
  return `${start > 0 ? "…" : ""}${text}${end < flat.length ? "…" : ""}`;
}

/** ESCAPE AND MARK IN ONE PASS, over the fold.
 *
 *  Two things forced this out of the regex it used to be. The fold is the
 *  loud one: the terms the index matched on are folded, so «المقدمة» has to
 *  light up the «الْمُقَدِّمَة» a line actually prints — and a regex built from
 *  the typed term cannot see it. The quiet one is that marking AFTER escaping
 *  searched the escaped text: a note containing `&amp;` had its own entity
 *  hunted for the letters of a query, and `<` had become four characters that
 *  the offsets no longer agreed with.
 *
 *  So the match runs on the RAW text (findAnyMatches reports offsets into it),
 *  and each slice is escaped as it is emitted. `<mark>` is the only markup that
 *  reaches the client, exactly as before. */
export function markHtml(text: string, terms: readonly string[]): string {
  if (terms.length === 0) return escapeHtml(text);
  const hits = findAnyMatches(text, terms, 200);
  if (hits.length === 0) return escapeHtml(text);
  let out = "";
  let at = 0;
  for (const hit of hits) {
    out += escapeHtml(text.slice(at, hit.start));
    out += `<mark>${escapeHtml(text.slice(hit.start, hit.end))}</mark>`;
    at = hit.end;
  }
  return out + escapeHtml(text.slice(at));
}

/** The ~160-character window around the first match in already-flat prose,
 *  marked. With no match (a hit earned by a title, an alias, fuzzy spelling)
 *  it is the opening of the text, unmarked — quoting a line back and marking
 *  nothing in it would suggest the words are in there somewhere. */
export function snippetOf(flat: string, terms: readonly string[]): string {
  const first = findAnyMatches(flat, terms, 1)[0];
  const windowed = windowAround(
    flat,
    first?.start ?? 0,
    first === undefined ? 0 : first.end - first.start,
    SNIPPET_RADIUS,
  );
  // The window is re-matched rather than offset-shifted: windowAround snaps to
  // word boundaries and prefixes an ellipsis, so the offsets it returns from
  // are not the offsets it returns into.
  return markHtml(windowed, terms);
}
