// The title a READER sees.
//
// A note's title is its filename, and filenames are typed in whatever case the
// moment suggested: "Death of the Polymath" beside "Sloppy evolution" beside
// "Hall-effect thrusters". Inside the vault that is fine — it is the file's
// name, and [[wikilinks]] are written against it. On the published site the
// same three read as three different house styles in one list.
//
// So every public surface (the post's heading, the lists, the feed, <title>,
// og:title, a visitor's search and backlinks) shows the filename in Title
// Case, Chicago style. The file, its URL and its slug never change: this is
// display only, applied where a title is shown, never where one is resolved.
//
// Rules, each one a case in tests/titleCase.test.ts:
//   • Major words are capitalised; articles, coordinating conjunctions and
//     short prepositions (MINOR) are lowercased — except as the first or last
//     word of the title or of a phrase (after a dash or a colon).
//   • Each part of a hyphenated compound is a word: "Hall-Effect", and a minor
//     part after the first stays lowercase: "Up-to-Date".
//   • A word that already carries a capital after its first letter, a digit,
//     an underscore or a dot is a name or a code and is left alone: IEEE, C1,
//     v2, e.g.
//   • A title whose first character is lowercase is code or a tool name
//     ("perf record", "struct folio") and is left untouched entirely.
//   • A title holding any non-Latin letter (Arabic, Greek, …) is left
//     untouched: case is a Latin-script idea.
//   • A frontmatter `title:` is the author's own spelling and is used as
//     written (publicTitleOf).

const MINOR = new Set([
  "a", "an", "the",
  "and", "but", "or", "nor", "for", "so", "yet",
  "as", "at", "by", "in", "of", "off", "on", "per", "to", "up", "via", "vs",
  "from", "with", "into", "over",
]);

/** A letter from any script but Latin. */
const NON_LATIN = /(?!\p{Script=Latin})\p{L}/u;
/** A whole token that is only a dash: a phrase boundary ("IV - Normal", "Time — The"). */
const DASH_TOKEN = /^[-‐‑‒–—―]+$/u;
/** A word ending in one of these closes a phrase; the next word opens one. */
const ENDS_PHRASE = /[:?!]["'”’)\]]*$/u;
/** …and so does a sentence's full stop ("Chapter 2. Political …"), but not an
 *  abbreviation's: "vs." and "e.g." end in a dot and the phrase goes on. */
function opensPhrase(prev: string): boolean {
  if (ENDS_PHRASE.test(prev)) return true;
  const m = /^[^\p{L}\p{N}]*(.*?)\.["'”’)\]]*$/u.exec(prev);
  return m !== null && !m[1].includes(".") && !MINOR.has(m[1].toLowerCase());
}
/** A word that is a name or a code: a capital after its first letter, a digit,
 *  an underscore or a dot anywhere in it. */
const LEAVE_ALONE = /^.+\p{Lu}|[\p{N}_.]/u;

/** One hyphen-free piece with its surrounding punctuation split off. */
function casePart(part: string, capitalise: boolean): string {
  const m = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u.exec(part);
  if (m === null) return part;
  const [, lead, core, tail] = m;
  if (core === "" || LEAVE_ALONE.test(core)) return part;
  // An abbreviation's dot sits in the tail once punctuation is split off, so
  // "(2nd ed.)" came out "Ed." though the rule leaves a dotted word alone
  // (2026-11 purge, P14): a short lowercase word written with its dot is an
  // abbreviation — ed., vol., pp., cf., etc. — and keeps its spelling.
  if (tail.startsWith(".") && core.length <= 4 && core === core.toLowerCase()) return part;
  if (!capitalise && MINOR.has(core.toLowerCase())) return lead + core.toLowerCase() + tail;
  return lead + core.charAt(0).toUpperCase() + core.slice(1) + tail;
}

function caseWord(word: string, edge: boolean): string {
  const parts = word.split(/(-)/);
  if (parts.length === 1) return casePart(word, edge);
  return parts
    .map((part, i) => (part === "-" ? part : casePart(part, i === 0 || !MINOR.has(part.toLowerCase()))))
    .join("");
}

/** `title` in Chicago-style Title Case, or `title` itself when it is code, a
 *  tool name or not in Latin script. Pure; idempotent. */
export function titleCase(title: string): string {
  if (title === "" || /^\p{Ll}/u.test(title) || NON_LATIN.test(title)) return title;
  const tokens = title.split(/(\s+)/);
  // Indexes of the word tokens, dashes included — a dash is a boundary.
  const words: number[] = [];
  tokens.forEach((tok, i) => {
    if (tok !== "" && !/^\s+$/.test(tok)) words.push(i);
  });
  return tokens
    .map((tok, i) => {
      const k = words.indexOf(i);
      if (k === -1 || DASH_TOKEN.test(tok)) return tok;
      const prev = k > 0 ? tokens[words[k - 1]] : null;
      const next = k < words.length - 1 ? tokens[words[k + 1]] : null;
      const first = prev === null || DASH_TOKEN.test(prev) || opensPhrase(prev);
      const last = next === null || DASH_TOKEN.test(next) || ENDS_PHRASE.test(tok);
      return caseWord(tok, first || last);
    })
    .join("");
}

/** The title a reader is shown for a note: its frontmatter `title:` exactly as
 *  written when it has one, else its filename title in Title Case. */
export function publicTitleOf(fileTitle: string, fmTitle: unknown): string {
  if (typeof fmTitle === "string" && fmTitle.trim() !== "") return fmTitle.trim();
  if (typeof fmTitle === "number" && Number.isFinite(fmTitle)) return String(fmTitle);
  return titleCase(fileTitle);
}
