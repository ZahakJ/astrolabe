// The indexer's language half: which notes read as Arabic, and what a visitor
// filtered to one language may see (the published census and topics).
// Moved out of server/indexer.ts, which keeps the store these read.

import { notes, publishedSet, type NoteRecord } from "../indexer.ts";

// -------------------------------------------------------- language detection

/** Arabic-script blocks: Arabic, Supplement, Extended-A, Presentation Forms. */
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;
const LETTER_RE = /\p{L}/u;

/** Language-detection budget: sampling the first chunk of a note is plenty
 *  to call its script, and keeps giant notes cheap to reindex. */
const DETECT_MAX_CHARS = 64 * 1024;

/** Everything a reader never reads as prose. Counting it is what made real
 *  Arabic notes score English: a Readwise export of an Arabic book is one
 *  `readwise.io/to_kindle?action=open&asin=…` per highlight, an embedded
 *  YouTube player is ~40 Latin letters of markup around one Arabic caption,
 *  and a "المصادر" list is three English URLs under one Arabic word. None of
 *  those letters are the note's language. Frontmatter is already excluded by
 *  the caller (it splits the body first). Order matters: code fences before
 *  inline code, HTML before markdown links (an <a href> is markup, not a
 *  link destination), destinations before bare URLs. */
const NON_PROSE: { re: RegExp; keepGroup: boolean }[] = [
  // Fenced code (``` or ~~~), then inline code.
  { re: /^[ \t]*(?:```|~~~)[^\n]*\n[\s\S]*?^[ \t]*(?:```|~~~)[^\n]*$/gm, keepGroup: false },
  { re: /`[^`\n]*`/g, keepGroup: false },
  // HTML comments, then tags and autolinks (<https://…>) — attribute values,
  // alt text and element names are all markup, none of it prose.
  { re: /<!--[\s\S]*?-->/g, keepGroup: false },
  { re: /<[^>\n]{1,300}>/g, keepGroup: false },
  // Markdown links and images: keep the visible text, drop the destination.
  { re: /!?\[([^\]]*)\]\([^)]*\)/g, keepGroup: true },
  // Reference-link definitions ("[label]: https://…") are destinations too.
  { re: /^[ \t]*\[[^\]]+\]:[^\n]*$/gm, keepGroup: false },
  // Bare URLs pasted straight into the text.
  { re: /\b(?:https?|mailto|obsidian|zotero):\/*\S+/gi, keepGroup: false },
  { re: /\bwww\.[^\s)\]]+/gi, keepGroup: false },
];

/** The note's prose: what a reader actually reads, with markup, code and link
 *  destinations removed. `[text](url)` keeps `text` (visible), drops the url. */
function proseOnly(markdown: string): string {
  let out = markdown;
  for (const { re, keepGroup } of NON_PROSE) {
    out = keepGroup ? out.replace(re, (_match, text: string) => ` ${text} `) : out.replace(re, " ");
  }
  return out;
}

/** True when Arabic-block codepoints make up ≥ 40% of the letter codepoints in
 *  the note's PROSE — "written predominantly in Arabic" for the languageFilter.
 *  null when the prose has no letters at all (nothing to judge). */
export function detectArabic(body: string): boolean | null {
  const sample = body.length > DETECT_MAX_CHARS ? body.slice(0, DETECT_MAX_CHARS) : body;
  let letters = 0;
  let arabic = 0;
  for (const ch of proseOnly(sample)) {
    if (!LETTER_RE.test(ch)) continue;
    letters++;
    if (ARABIC_RE.test(ch)) arabic++;
  }
  if (letters === 0) return null;
  return arabic / letters >= 0.4;
}

/** THE filter language for one request, or null for "nothing is filtered".
 *
 *  It is a PARAMETER, not a global read, and that is the whole shape of this
 *  round: the mode can now be "follow", where the answer depends on the
 *  language the READER is reading in — so a function that consulted a global
 *  would hand every reader the same site-wide answer and make the EN/ع switch
 *  a lie. `server/language.ts` resolves the mode + reader into this value once
 *  per request; everything below simply obeys it. `null` is passed by every
 *  ADMIN surface, unconditionally: admin surfaces are never filtered. */
export type FilterLang = "ar" | "en" | null;

/** True when the language filter hides this record from PUBLIC blog surfaces:
 *  `lang === "ar"` hides non-Arabic notes, `"en"` hides Arabic-majority ones,
 *  `null` hides nothing. Curation, not access control — direct URL access to
 *  any published note stays allowed (/api/note is never filtered), only the
 *  discovery surfaces (posts, topics, graph, search, backlinks, RSS) skip
 *  filtered notes, and they must never leak their existence. */
export function languageHidden(record: NoteRecord, lang: FilterLang): boolean {
  if (lang === null) return false;
  // A note with no prose letters (arabic === null) belongs to no language:
  // hiding it from one site and showing it on the other would be a coin toss.
  // It stays visible in both.
  if (record.arabic === null) return false;
  return lang === "ar" ? !record.arabic : record.arabic;
}

/** Published AND not curated away by the language filter — the visibility rule
 *  every visitor DISCOVERY surface applies, including the push channel: an SSE
 *  stream that announced a filtered-out note would leak its existence, path
 *  and edit timing to exactly the visitors the filter hides it from. (Direct
 *  access stays allowed: /api/note deliberately checks publication only.)
 *
 *  `lang` is REQUIRED on purpose — it has no default. A default would be a
 *  filter language chosen by whichever module forgot to pass one, and the
 *  failure mode of getting it wrong is a visitor seeing a note the site meant
 *  to withhold, or a reader's own language quietly ignored. Every call site is
 *  made to say which scope it is asking about. */
export function isNoteVisibleToVisitor(relPath: string, lang: FilterLang): boolean {
  const record = notes.get(relPath);
  return publishedSet.has(relPath) && record !== undefined && !languageHidden(record, lang);
}

/** The published set split by the script its PROSE is written in — the numbers
 *  the settings row prints BEFORE a filter is saved ("2 of your 20 published
 *  notes qualify"), and the same numbers the empty-set fallback and the admin's
 *  ongoing indicator are computed from. Cheap: `arabic` is cached per record at
 *  index time, so this is one pass over the published set. */
export interface PublishedCensus {
  /** Prose is predominantly Arabic script. */
  arabic: number;
  /** Prose is predominantly something else. */
  latin: number;
  /** No prose letters at all — an image-only or numeric note belongs to no
   *  language and is shown under every mode rather than guessed at. */
  neutral: number;
}

export function publishedCensus(): PublishedCensus {
  let arabic = 0;
  let latin = 0;
  let neutral = 0;
  for (const notePath of publishedSet) {
    const record = notes.get(notePath);
    if (!record) continue;
    if (record.arabic === null) neutral++;
    else if (record.arabic) arabic++;
    else latin++;
  }
  return { arabic, latin, neutral };
}

/** How many of a census's notes survive `lang` — what a visitor reading in
 *  that language would find. Pure, and separate from `publishedCensus()`
 *  because the callers that matter (the per-request scope resolver, the
 *  settings preview) need BOTH the split and this count, and walking the
 *  published set twice for one answer is a pass nobody asked for. */
export function visibleUnder(census: PublishedCensus, lang: FilterLang): number {
  const { arabic, latin, neutral } = census;
  if (lang === null) return arabic + latin + neutral;
  return (lang === "ar" ? arabic : latin) + neutral;
}


/** Topics a visitor would see under `lang`, and which of `hidden` (the
 *  EXCLUDE_TAGS set, real or hypothetical) actually removes a topic that would
 *  otherwise be on the page. An excluded tag that matches nothing is worth
 *  knowing about too — it is a rule the operator believes is working. */
export function publishedTopics(
  lang: FilterLang,
  hidden: Set<string>,
): { visible: number; total: number; suppressed: string[] } {
  const all = new Set<string>();
  const cut = new Set<string>();
  for (const notePath of publishedSet) {
    const record = notes.get(notePath);
    if (!record || languageHidden(record, lang)) continue;
    for (const tag of record.tags) {
      all.add(tag);
      if (hidden.has(tag.toLowerCase())) cut.add(tag);
    }
  }
  return {
    visible: all.size - cut.size,
    total: all.size,
    suppressed: [...cut].sort((a, b) => a.localeCompare(b)),
  };
}
