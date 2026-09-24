// How many words is this note?
//
// One implementation, because the answer is printed in two places that must
// not disagree: the author's status bar while they are writing, and the
// "N min read" a VISITOR sees on the published article. Two counters would
// drift, and the first anyone would notice is a blog post claiming a reading
// time its author never saw.
//
// The old status-bar count was `text.trim().split(/\s+/)` over the RAW note, so
// it counted YAML frontmatter, `#` markers, `$$math$$` and whole code fences —
// and it counted them as words. On a note with a 40-line config block it was
// not approximately right, it was confidently wrong.
//
// TWO RULES, and both matter for a bilingual vault:
//
//   · Words come from `Intl.Segmenter`, not from whitespace. Whitespace
//     splitting counts a Chinese paragraph as one word and an Arabic phrase
//     with tatweel as fewer than it has; the segmenter knows better in both
//     directions, and it is in every browser and in Node.
//   · The text is reduced to PROSE first. Frontmatter, fences, math blocks and
//     markdown furniture are not writing, and a reading time computed over them
//     is a reading time for a document nobody reads.

import { FRONTMATTER_RE } from "./noteParse.ts";
import { stripIgnorables } from "./fold.ts";

/** Words per minute for the reading-time estimate. The number the blog has
 *  always used; kept here so the two callers cannot pick different ones. */
export const WORDS_PER_MINUTE = 200;

/** A note reduced to the prose a reader would actually read.
 *
 *  Deliberately NOT the indexer's `stripMarkdown()`, which exists for search
 *  snippets and does things a counter must not — it appends "—" after every
 *  heading so a snippet reads as a sentence, which would add one token per
 *  heading to the count. Same intent, different jobs, and the difference is
 *  the reason they are separate functions rather than one with a flag. */
export function noteProse(source: string): string {
  let text = source;
  // Frontmatter: markdown's `---` block, and the `%--- … %---%` comment block a
  // `.tex` note carries so that it still compiles under pdflatex.
  text = text.replace(FRONTMATTER_RE, "");
  text = text.replace(/^%---\r?\n[\s\S]*?\r?\n%---%(?:\r?\n|$)/, "");
  // Fenced code, tracked LINE BY LINE rather than by regex. A `[\s\S]*?` between
  // two fence markers looks right and is not: under the `m` flag `$` matches an
  // end of LINE, so the lazy body matches nothing and the pattern eats the
  // opening marker alone, leaving the code itself to be counted as prose. This
  // is the same shape `FenceSkipper` uses in the indexer, for the same reason.
  const lines: string[] = [];
  let fence: string | null = null;
  for (const line of text.split("\n")) {
    const marker = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence === null) {
      if (marker) {
        fence = marker[1][0];
        continue;
      }
      lines.push(line);
    } else if (marker && marker[1][0] === fence) {
      fence = null;
    }
    // …and a line inside a fence is dropped by falling through.
  }
  text = lines.join("\n");
  // Inline code.
  text = text.replace(/`[^`\n]*`/g, " ");
  // Display and inline math. A formula is read, but it is not words.
  text = text.replace(/\$\$[\s\S]*?\$\$/g, " ");
  text = text.replace(/\$[^$\n]+\$/g, " ");
  // Images and their alt text; links keep their LABEL and lose their target.
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  text = text.replace(/!\[\[[^\]]*\]\]/g, " ");
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // `[[Target|alias]]` reads as its alias, `[[Target]]` as its target.
  text = text.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1");
  text = text.replace(/\[\[([^\]]*)\]\]/g, "$1");
  // Line furniture: heading markers, quote markers, list bullets, table pipes,
  // and the rules. The WORDS on those lines stay; only the marks go.
  text = text.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "");
  text = text.replace(/^[ \t]*>[ \t]?/gm, "");
  text = text.replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, "");
  text = text.replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, " ");
  text = text.replace(/\|/g, " ");
  // Emphasis, highlights and the comment syntax this product actually hides.
  text = text.replace(/%%[\s\S]*?%%/g, " ");
  text = text.replace(/[*_~=]{1,3}/g, "");
  // HTML tags a note may carry inline.
  text = text.replace(/<[^>\n]{0,200}>/g, " ");
  return text;
}

let segmenter: Intl.Segmenter | null = null;
let segmenterLocale = "";

function wordSegmenter(locale: string): Intl.Segmenter | null {
  if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") return null;
  if (segmenter === null || segmenterLocale !== locale) {
    try {
      segmenter = new Intl.Segmenter(locale, { granularity: "word" });
      segmenterLocale = locale;
    } catch {
      return null;
    }
  }
  return segmenter;
}

/** The Arabic marks that ride on a letter rather than standing beside it:
 *  the harakat and tanwin (U+064B–U+065F), the superscript alef (U+0670),
 *  the small marks used in pointed texts (U+06D6–U+06ED), and the tatweel
 *  (U+0640) — a stretch, not a mark, but it splits nothing either.
 *
 *  A LETTER WITH ITS HARAKAT IS ONE GRAPHEME, and the count has to say so
 *  whichever engine is doing the segmenting. ICU's word breaker treats these
 *  as extenders and gets it right; the whitespace fallback below does not
 *  care; but a stray mark left standing on its own (a shadda after a space,
 *  a tatweel a copy-paste left behind) can read as a "word" to either, and
 *  a pointed word and its bare spelling must never count differently — the
 *  same word is the same word whether or not the writer vowelled it. So the
 *  marks are folded out before anything is counted — by the search fold's own
 *  ignorable set (shared/fold.ts `stripIgnorables`), so the count and the
 *  search agree about what a mark is. */

/** Words in ALREADY-PLAIN text. `locale` only tunes the segmentation; the
 *  result is not language-specific enough to be worth threading further. */
export function countWords(plain: string, locale = "en"): number {
  const text = stripIgnorables(plain).trim();
  if (text === "") return 0;
  const seg = wordSegmenter(locale);
  if (seg === null) {
    // Node or a browser without Segmenter. The old rule, kept as the floor
    // rather than as the answer.
    return text.split(/\s+/).length;
  }
  let n = 0;
  for (const part of seg.segment(text)) if (part.isWordLike === true) n += 1;
  return n;
}

/** Words in a raw note: prose first, then counted. */
export function countNoteWords(source: string, locale = "en"): number {
  return countWords(noteProse(source), locale);
}

/** Minutes for a note that HAS prose, and zero for one that does not.
 *
 *  The floor of 1 is there because "0 min read" under an article reads as a
 *  broken number rather than a short one — the shortest thing anyone publishes
 *  still takes a moment. But a note with no prose at all is a different fact
 *  and the blog already relies on it: an empty note reports 0, and
 *  `tests/excerpt.test.ts` has pinned that alongside its empty excerpt since
 *  before this function existed. Rounding it up to 1 would have put "1 min
 *  read" on a page with nothing to read. */
export function readingMinutes(words: number): number {
  if (words <= 0) return 0;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
