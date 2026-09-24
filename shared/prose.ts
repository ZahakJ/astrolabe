// MARKDOWN → PROSE — the strip that stands between a note's source and a
// sentence a reader is shown.
//
// Search snippets, backlink context, `/api/search/matches` rows and a blog
// excerpt all have to answer the same question about the same bytes: what does
// this line SAY, once the syntax carrying it is taken off? DESIGN.md's hard
// rule is that raw markdown never reaches a reader, and every one of those
// four surfaces is a place it used to: a table row arriving with its pipes
// standing, a tag de-hashed into a noun in the middle of a sentence, a fenced
// block's contents read as the first paragraph of a post.
//
// These functions lived in server/indexer.ts, where they were pure already.
// They moved here for the pocket server (mobile/src/pocket/), which searches a
// GitHub-backed vault inside a phone with no Node under it and must cut a
// snippet by exactly this rule — the client renders its rows through the same
// component as the server's, and a second stripper would be two answers to one
// question, differing only where somebody would notice.

import { closesFence, fenceOpener, type Fence } from "./fences.ts";
import { findAnyMatches } from "./fold.ts";
import { wikilinkRegex } from "./noteParse.ts";
import { HEADING_PREFIX_RE, isHeadingLine } from "./headings.ts";

/** True for metadata-ish furniture lines common in note templates: a bare
 *  timestamp, or a short "Label:" line whose content is only #tags ("Status:
 *  #draft", "Tags: #a #b"). Once #tags and one short leading label are
 *  removed, no letters remain — real prose always keeps some. */
export function isFurnitureLine(raw: string): boolean {
  const noTags = raw.trim().replace(/(?:^|[\s(])#[\p{L}\p{N}_][\p{L}\p{N}_/-]*/gu, " ");
  const rest = noTags.replace(/^[\p{L} ]{1,24}:\s*/u, "");
  return (rest.match(/\p{L}/gu) ?? []).length === 0;
}



/** Remove block-level markers from the start of a line (headings, quotes,
 *  list bullets, checkboxes) so it reads as prose. */
export function stripLinePrefix(line: string): string {
  return line
    .replace(/^\s*>\s?/, "")
    .replace(HEADING_PREFIX_RE, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s*/, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "");
}

/** A table's alignment row — `|---|:--:|` — which carries no words at all. */
export const TABLE_RULE_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** One source line → prose context: block prefixes and inline marks stripped,
 *  ONE table cell kept, [[wikilinks]] kept for the client to gild.
 *
 *  A TABLE ROW IS NOT A SENTENCE. This used to join every cell of a row with
 *  " · ", so a backlink into a five-column table came back as "Dune · Herbert ·
 *  1965 · ★★★★ · [[Read]]" — an unreadable cell-join in a card whose whole job
 *  is to show the reader the sentence their link sits in. (And the joiner was
 *  a `·` between two runs of text, which is banned everywhere else in this
 *  product for the reason the status bar gives.)
 *
 *  So: pick ONE cell. `needles` — the wikilink being reported, or the search
 *  terms being highlighted — decides which, because the cell the caller is
 *  about is the only cell worth showing; with no needle, or no cell matching
 *  one, the first cell that carries anything wins. The alignment row carries
 *  nothing and comes back empty, which every caller already treats as "no
 *  context here". */
export function cleanContextLine(line: string, needles?: readonly string[]): string {
  const stripped = stripInlineMd(stripLinePrefix(line));
  const tidy = (text: string): string => text.replace(/\s{2,}/g, " ").trim();
  if (!/^\s*\|/.test(stripped)) return tidy(stripped);
  if (TABLE_RULE_RE.test(stripped)) return "";
  const cells = stripped
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map(tidy)
    .filter((cell) => cell !== "");
  if (cells.length === 0) return "";
  if (needles && needles.length > 0) {
    // Folded, like every other match in this file: an Arabic table whose cells
    // are pointed must still give up the cell the reader's plain query meant,
    // rather than falling through to cells[0].
    const wanted = cells.find((cell) => findAnyMatches(cell, needles, 1).length > 0);
    if (wanted !== undefined) return wanted;
  }
  return cells[0];
}

/** Letters/digits left once wikilinks and punctuation are removed — how much
 *  actual prose a context line carries beyond the link itself. */
export function contextProse(context: string): string {
  return context
    .replace(/\[\[[^[\]]*\]\]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Widen a bare-link line to its surroundings: pull in neighboring non-empty
 *  lines (following first, then preceding) until the context reads like a
 *  sentence or the paragraph runs out. Fence/frontmatter markers bound it. */
export function expandedContext(lines: string[], idx: number, needles?: readonly string[]): string {
  const isBoundary = (l: string | undefined): boolean =>
    l === undefined || /^\s*(```|~~~)/.test(l) || /^\s*---\s*$/.test(l);
  const parts: string[] = [cleanContextLine(lines[idx] ?? "", needles)];
  let len = parts[0].length;
  let before = idx - 1;
  let after = idx + 1;
  for (let hops = 0; len < 170 && hops < 6; hops++) {
    let grew = false;
    if (after < lines.length && !isBoundary(lines[after])) {
      const t = cleanContextLine(lines[after]);
      after++;
      if (t) {
        parts.push(t);
        len += t.length + 1;
        grew = true;
      }
    }
    if (len < 170 && before >= 0 && !isBoundary(lines[before])) {
      const t = cleanContextLine(lines[before]);
      before--;
      if (t) {
        parts.unshift(t);
        len += t.length + 1;
        grew = true;
      }
    }
    const beforeDone = before < 0 || isBoundary(lines[before]);
    const afterDone = after >= lines.length || isBoundary(lines[after]);
    if (!grew && beforeDone && afterDone) break;
  }
  return parts.join(" ").trim();
}

/** Remove inline markdown marks (emphasis, code ticks, tag hashes, md links)
 *  while leaving `[[wikilink]]` syntax alone. Image references disappear
 *  entirely — their alt text is caption furniture, and keeping it glued
 *  arbitrary words into snippets ("… Thumbnail Network bridge: …"). */
export function stripInlineMd(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/(^|[^[])\[([^[\]]+)\]\(([^)]+)\)/g, "$1$2")
    .replace(/\*\*|__|~~/g, "")
    .replace(/`+/g, "")
    // A TAG GOES OUT WHOLE. This used to remove the `#` and leave the word
    // standing in the sentence, so a post ending "…it buys the reader a
    // breath. #design #typography" shipped on the front page as "…it buys the
    // reader a breath. design typography" — a nonsense noun phrase glued to
    // real prose. DESIGN.md's hard rule is that a snippet STRIPS or RENDERS
    // `#`; de-hashing a tag into a noun is neither, and plain text has no way
    // to render one, so it strips. Same token shape isFurnitureLine() uses.
    .replace(/(^|[\s([{])#[\p{L}\p{N}_][\p{L}\p{N}_/-]*/gu, "$1");
}

/** Line-skipping state for fenced code and $$ display math blocks — shared by
 *  the full-body stripper and the excerpt builder. skip() returns true when
 *  the line is fence/math/hr furniture that must not reach the prose. */
export class FenceSkipper {
  // WHICH marker opened the block, and how long its run was — `shared/fences.ts`
  // for why a toggle is not enough: a ```markdown block showing a `~~~` block
  // "closed" on the inner marker, and the rest of the code came out as prose in
  // the excerpt on the front page.
  private fence: Fence | null = null;
  private inMath = false;
  skip(raw: string): boolean {
    if (this.fence) {
      if (closesFence(raw, this.fence)) this.fence = null;
      return true;
    }
    const opened = fenceOpener(raw);
    if (opened) {
      this.fence = opened;
      return true;
    }
    // $$ display math is raw LaTeX — leave it out entirely.
    const t = raw.trim();
    if (!this.inMath && t.startsWith("$$")) {
      if (!(t.length > 4 && t.endsWith("$$"))) this.inMath = true;
      return true;
    }
    if (this.inMath) {
      if (t.endsWith("$$")) this.inMath = false;
      return true;
    }
    return /^\s*---\s*$/.test(raw);
  }
}

/** One raw markdown line → trimmed prose: block prefix and inline marks
 *  stripped, callout markers and %%comments%% dropped, ![[embeds]] dropped
 *  outright (a filename glued mid-sentence reads as garbage), [[wikilinks]]
 *  reduced to their alias/target label. Fence/math state is the caller's. */
export function proseLine(raw: string): string {
  return stripInlineMd(stripLinePrefix(raw))
    // callout title markers ("[!note] Title" after quote stripping)
    .replace(/^\[!\w+\][+-]?\s*/, "")
    // inline math: drop the $ delimiters, keep the expression text
    .replace(/\$([^$\n]+?)\$/g, "$1")
    // ==highlight== and %%comment%% marks
    .replace(/==([^=\n]+?)==/g, "$1")
    .replace(/%%[^%\n]*%%/g, "")
    // ![[embeds]] first (before the wikilink pass eats their inner
    // brackets and strands the "!").
    .replace(/!\[\[[^[\]]*\]\]/g, " ")
    .replace(
      wikilinkRegex(),
      (_m, target: string, _heading?: string, alias?: string) =>
        (alias ? alias.slice(1) : target).trim(),
    )
    .trim();
}

/** Full markdown → prose strip for search snippets: no fence lines, no
 *  frontmatter-ish separators, wikilinks reduced to their label. Heading
 *  text gets an em-dash tail so it doesn't run into the next sentence.
 *  Furniture lines (bare timestamps, "Status:"/"Tags:" label lines) are
 *  skipped the same way the excerpt builder skips them, so a snippet that
 *  windows the head of a note starts at real prose, not template preamble. */
export function stripMarkdown(body: string): string {
  const out: string[] = [];
  const fences = new FenceSkipper();
  for (const raw of body.split("\n")) {
    if (fences.skip(raw)) continue;
    if (isFurnitureLine(raw)) continue;
    // A TABLE ROW IS FIELDS, NOT A SENTENCE — and it used to reach the reader
    // with its `|` pipes standing, which is raw markdown syntax in a snippet
    // (DESIGN.md's hard rule) as well as unreadable. Its alignment row says
    // nothing at all and goes; the rest reads as the record it is. The
    // backlink and per-line search surfaces answer the same finding one cell
    // at a time — see cleanContextLine.
    if (/^\s*\|/.test(raw)) {
      if (TABLE_RULE_RE.test(raw)) continue;
      const cells = raw
        .replace(/^\s*\|/, "")
        .replace(/\|\s*$/, "")
        .split("|")
        .map((cell) => proseLine(cell))
        .filter((cell) => cell !== "");
      if (cells.length > 0) out.push(cells.join(", "));
      continue;
    }
    const isHeading = isHeadingLine(raw);
    const line = proseLine(raw);
    if (!line) continue;
    out.push(isHeading ? `${line} —` : line);
  }
  return out.join(" ");
}

