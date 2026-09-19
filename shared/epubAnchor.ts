// WHERE IN AN EPUB — the one spelling of it, for both halves of the product.
//
// A PDF has pages, so "where" is a number and shared/bookAnchor.ts can say
// `#page=212`. An EPUB has none: the whole point of the format is that the
// text REFLOWS, and the same book is 300 screens on a phone and 90 on a
// laptop. A page number in an EPUB is therefore not a fact about the book at
// all, it is a fact about the window it happened to be read in, and storing
// one would give the reader a position that moves when they rotate the phone.
//
// So a place is a CHAPTER and a FRACTION of it: `{ href, fraction }`. The href
// is a spine item's path inside the archive, which is the book's own name for
// its own chapter and survives every rendering decision either side makes; the
// fraction is how far down that chapter the reader had got. Both are stable
// across window sizes, across font sizes, and across the reader being opened
// on another machine.
//
// THE URL CARRIES IT, the way `#page=` does for a PDF (client/books/door.ts):
// `#ch=OEBPS/ch07.xhtml&at=0.42`. And a CITATION carries `&q=` instead of
// `&at=` — the first words of the passage, percent-encoded — because a
// fraction is a scroll offset and a quotation is a sentence: the sentence is
// what still finds the passage after the publisher reissues the file and every
// offset in it moves. Rect-anchored highlights, which the PDF reader has, are
// deliberately not here; CONTRACTS.md records what a later round would need.

/** How long an href may be. A spine item's path inside a zip; anything past
 *  this is not a chapter name, it is somebody probing. */
export const EPUB_HREF_MAX = 512;

/** How many characters of a passage a citation carries. Long enough to be
 *  unique in a chapter, short enough to survive being read in a note's
 *  source — and short enough that a reissue that re-wraps a paragraph has not
 *  necessarily changed it. */
export const EPUB_QUERY_MAX = 120;

/** Where a reader was: a spine item and how far down it. */
export interface EpubPlace {
  href: string;
  /** 0..1 down that chapter. */
  fraction: number;
}

/** What a URL hash or a citation names. `fraction` and `query` are each
 *  absent on their own terms: an ordinary bookmark has a fraction, a citation
 *  has a quotation, and a bare `#ch=` (a table-of-contents link) has neither
 *  and means "the top of that chapter". */
export interface EpubAnchor {
  href: string;
  fraction: number | null;
  query: string | null;
}

/**
 * An href as this product spells it: no leading slash, no `..`, no backslash,
 * no fragment, and never longer than EPUB_HREF_MAX.
 *
 * The fragment is stripped because it is a different question — "which
 * chapter" and "which paragraph within it" are answered by the href and by
 * `id` respectively, and a place that carried `ch01.xhtml#sec3` would compare
 * unequal to the same chapter reached by scrolling. `splitHref` below is what
 * a table-of-contents entry uses when it wants both halves.
 */
export function cleanEpubHref(value: unknown): string {
  if (typeof value !== "string") return "";
  const raw = value.replace(/\\/g, "/").split("#")[0].trim();
  if (raw === "" || raw.length > EPUB_HREF_MAX || raw.includes("\0")) return "";
  // Resolve the archive-relative path the way a zip name is spelled: no
  // leading slash, no "." or ".." segments left in it. A name that climbs out
  // of the archive resolves to nothing rather than to something outside it.
  const parts: string[] = [];
  for (const segment of raw.replace(/^\/+/, "").split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (parts.length === 0) return "";
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join("/");
}

/** An href and the fragment it named, each cleaned. A table-of-contents entry
 *  is `chapter.xhtml#sec3` far more often than not. */
export function splitHref(value: string): { href: string; fragment: string } {
  const at = value.indexOf("#");
  const fragment = at === -1 ? "" : value.slice(at + 1).trim();
  return {
    href: cleanEpubHref(at === -1 ? value : value.slice(0, at)),
    // An id is an XML NAME; anything else is not one, and is dropped rather
    // than put into a selector.
    fragment: /^[A-Za-z_][\w.:-]*$/.test(fragment) ? fragment : "",
  };
}

/** `dir/file.xhtml` + `../img/plate.png` → `img/plate.png`. What a chapter's
 *  own `src` and `href` mean, resolved against the chapter. */
export function resolveEpubHref(base: string, relative: string): string {
  const raw = relative.replace(/\\/g, "/").trim();
  if (raw === "") return "";
  if (raw.startsWith("/")) return cleanEpubHref(raw);
  const at = base.lastIndexOf("/");
  const dir = at === -1 ? "" : base.slice(0, at + 1);
  return cleanEpubHref(dir + raw);
}

/** 0..1, rounded to three places — which is a paragraph's worth of precision
 *  in a chapter and keeps the stored number short. */
export function cleanFraction(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
}

/** The first words of a passage, as a citation carries them. Collapsed to
 *  single spaces, because the reader's own scanner (shared/fold.ts) matches on
 *  text and not on the publisher's line breaks. */
export function citationQuery(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= EPUB_QUERY_MAX ? flat : flat.slice(0, EPUB_QUERY_MAX).replace(/\s\S*$/, "");
}

/** Percent-encoding that leaves a path readable. `encodeURIComponent` turns
 *  `OEBPS/ch07.xhtml` into `OEBPS%2Fch07.xhtml`, which is correct and
 *  unreadable; a citation is a line somebody reads in their own note. */
function encodePart(value: string): string {
  return encodeURIComponent(value).replace(/%2F/g, "/");
}

/**
 * Format an anchor as the `#…` half of a URL or a wikilink. Ordered `ch`,
 * `at`, `q` and never otherwise — a citation is a thing people diff and read
 * in a git log.
 */
export function formatEpubAnchor(anchor: EpubAnchor): string {
  const href = cleanEpubHref(anchor.href);
  if (href === "") return "";
  const parts = [`ch=${encodePart(href)}`];
  if (anchor.fraction !== null) parts.push(`at=${cleanFraction(anchor.fraction)}`);
  if (anchor.query !== null && anchor.query.trim() !== "") {
    parts.push(`q=${encodePart(citationQuery(anchor.query))}`);
  }
  return parts.join("&");
}

/**
 * Parse the `#…` half of a URL or a wikilink as an EPUB anchor, or null when
 * it is an ordinary heading.
 *
 * STRICT ABOUT `ch=`, for the reason `parseBookAnchor` is strict about
 * `page=`: `[[Note#chapter one]]` is a link to a heading somebody wrote and
 * has to stay one. Only a real `ch=` with a spellable href makes this a place.
 */
export function parseEpubAnchor(value: string): EpubAnchor | null {
  const text = value.trim().replace(/^#/, "");
  if (text === "") return null;
  let href = "";
  let fraction: number | null = null;
  let query: string | null = null;
  for (const part of text.split("&")) {
    const at = part.indexOf("=");
    if (at < 0) continue;
    const name = part.slice(0, at).trim().toLowerCase();
    const arg = part.slice(at + 1).trim();
    let decoded: string;
    try {
      decoded = decodeURIComponent(arg);
    } catch {
      decoded = arg; // a stray % is not a reason to lose the whole anchor
    }
    if (name === "ch") href = cleanEpubHref(decoded);
    else if (name === "at" && /^[0-9]*\.?[0-9]+$/.test(arg)) fraction = cleanFraction(Number(arg));
    else if (name === "q" && decoded.trim() !== "") query = citationQuery(decoded);
  }
  return href === "" ? null : { href, fraction, query };
}

/** The citation wikilink for a passage in an EPUB: the file the way a
 *  wikilink names it, the chapter, and the words. `linkSafe` is
 *  shared/bookAnchor.ts's — the two citation forms spell "unspellable in a
 *  wikilink" once between them. */
export function epubCitationLink(target: string, anchor: EpubAnchor, label: string, safe: (v: string) => string): string {
  const name = safe(target);
  const shown = safe(label);
  const hash = formatEpubAnchor(anchor);
  return `[[${name}${hash === "" ? "" : `#${hash}`}${shown === "" ? "" : `|${shown}`}]]`;
}
