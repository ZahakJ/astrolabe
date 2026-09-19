// A memoized tag shelf and property shelf — `/api/tags` and `/api/props`.
//
// Both walk EVERY note in the index on every call. `tags()` counts each note's
// tags; `props()` goes further and splits, trims and case-folds every value of
// every frontmatter key it finds. On the 2,376-note performance fixture that
// measured 1.1 ms and 29 ms per request, against a tree read's 1.5 ms — and
// the sidebar asks for both whenever the tree moves, which on a vault under a
// `git pull` is every couple of hundred milliseconds.
//
// Nothing memoized either one, so this is the same bargain server/graphCache.ts
// already strikes, and it is struck the same way: the answer is kept and
// VALIDATED against a revision the index moves, rather than dropped whenever
// something might have happened. An entry built from a pre-event index also
// stamps the pre-event revision, so it stops matching the moment the index
// catches up — nothing has to be invalidated at exactly the right instant,
// because nothing is trusted for being recent.
//
// The graph's revision could not be reused: it deliberately ignores `props`,
// since a note whose `status:` changed draws the same graph and must not cost
// a rebuild of a 5 MB answer. `shelfRevision()` is that same idea with the
// shelves' own definition of a change.
//
// Visitor and admin answers are memoized SEPARATELY and never share an entry,
// for the reason graphCache gives at length: they are different answers to the
// same question, and serving one for the other would leak the tags and the
// frontmatter keys of unpublished (or language-filtered) notes.

import type { PropCount, TagCount } from "../shared/types.ts";
import { props, shelfRevision, tags, type FilterLang } from "./indexer.ts";
import { excludedTags } from "./site.ts";

interface Shelf {
  tags: TagCount[] | null;
  props: PropCount[] | null;
}

const memo = new Map<string, Shelf>();
/** The stamp every entry in `memo` was built under. */
let stamp = "";

/** Everything outside the index that changes what the shelves answer.
 *
 *  Exactly one thing does: `excludedTags()`, which curates workflow tags off a
 *  visitor's pills. The audience and the filter language are already part of
 *  the memo KEY. Settings are cheap to read (server/settings.ts keeps an
 *  mtime-checked cache), so this is a handful of string compares per request
 *  against a walk of the whole vault. */
function currentStamp(): string {
  return `${shelfRevision()}|${[...excludedTags()].sort().join(",")}`;
}

/** Drop every memo the index (or the settings) no longer supports. Cheap,
 *  idempotent, and a no-op whenever nothing shelf-shaped has moved. */
export function invalidateShelves(): void {
  const now = currentStamp();
  if (now === stamp) return;
  memo.clear();
  stamp = now;
}

function current(publishedOnly: boolean, lang: FilterLang): Shelf {
  invalidateShelves();
  // The LANGUAGE is part of the key, not only the audience: under
  // `languageFilter: "follow"` two visitors of one URL are scoped differently,
  // so a memo keyed on audience alone would hand the first reader's shelf to
  // the second. An admin is never language-filtered, so every admin request
  // shares the one entry.
  const key = publishedOnly ? `visitor:${lang}` : "admin";
  let shelf = memo.get(key);
  if (!shelf) memo.set(key, (shelf = { tags: null, props: null }));
  return shelf;
}

/** Every tag that occurs, with its count — scoped to this session. */
export function tagShelf(publishedOnly: boolean, lang: FilterLang): TagCount[] {
  const shelf = current(publishedOnly, lang);
  return (shelf.tags ??= tags(publishedOnly, lang));
}

/** Every frontmatter key that occurs, with its count and top values. */
export function propShelf(publishedOnly: boolean, lang: FilterLang): PropCount[] {
  const shelf = current(publishedOnly, lang);
  return (shelf.props ??= props(publishedOnly, lang));
}
