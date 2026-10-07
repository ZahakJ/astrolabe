// SERIES (shared/series.ts): which notes are parts of which series.
//
// Derived ONCE per index change — invalidateDerived() drops the memo at the
// index's own mutations, so an edit to a series note or to a part (through
// the watcher or the app) is seen by the next request, derived date included
// — and read per request only to apply the reader's audience (published,
// languageFilter), which is a filter over a few short arrays.

import { notes, publishedSet, type NoteRecord } from "../indexer.ts";
import { languageHidden, type FilterLang } from "./language.ts";
import { resolveLink } from "./resolve.ts";
import type { SeriesEntryStatus } from "../../shared/series.ts";

interface SeriesEntry {
  ref: string;
  path: string | null;
  status: SeriesEntryStatus; // "published" | "unpublished" here; the rest are final
}

interface SeriesTable {
  /** series note -> every entry of its `series:` key, in order. */
  entries: Map<string, SeriesEntry[]>;
  /** part -> the series note that claims it (first by series path order). */
  partOf: Map<string, string>;
}

let cache: SeriesTable | null = null;
const warned = new Set<string>();

/** Drop the table (invalidateDerived owns the call). */
export function dropSeriesMemo(): void {
  cache = null;
}

/** A series counts only when the note declaring it is published: an
 *  unpublished draft of a series must not hide published notes from the
 *  blog. Its parts are then ordinary posts. */
function isSeriesNote(record: NoteRecord): boolean {
  return record.seriesRefs !== null && publishedSet.has(record.path);
}

function table(): SeriesTable {
  if (cache !== null) return cache;
  const entries = new Map<string, SeriesEntry[]>();
  const partOf = new Map<string, string>();
  // Path order is the tie-break for a note listed in two series: the first
  // series to claim it keeps it, the second shows it to the owner as claimed.
  const declaring = [...notes.values()].filter(isSeriesNote).sort((a, b) => a.path.localeCompare(b.path));
  for (const record of declaring) {
    const list: SeriesEntry[] = [];
    for (const ref of record.seriesRefs ?? []) {
      // Resolved with the visitor filter OFF, like `twin:` — publication and
      // language are the reader's questions, asked later.
      const path = resolveLink(ref, false, null);
      let status: SeriesEntryStatus;
      if (path === null) status = "missing";
      else if (path === record.path) status = "self";
      else if (notes.get(path)?.seriesRefs != null) {
        status = "nested";
        const key = `${record.path}\u0000${path}`;
        if (!warned.has(key)) {
          warned.add(key);
          console.warn(`series: "${record.path}" lists "${path}", which is itself a series — a series inside a series is not supported; entry ignored`);
        }
      } else if (partOf.has(path) && partOf.get(path) !== record.path) status = "claimed";
      else if (list.some((e) => e.path === path)) status = "claimed"; // listed twice in one series
      else {
        status = publishedSet.has(path) ? "published" : "unpublished";
        partOf.set(path, record.path);
      }
      list.push({ ref, path, status });
    }
    entries.set(record.path, list);
  }
  cache = { entries, partOf };
  return cache;
}

/** May this reader see this note? `visitor` applies the languageFilter, as
 *  posts() does; admin lists are never filtered. */
function visible(path: string, visitor: boolean, lang: FilterLang): boolean {
  const record = notes.get(path);
  if (record === undefined || !publishedSet.has(path)) return false;
  return !(visitor && languageHidden(record, lang));
}

/** The series this note is a part of, when that series is itself visible to
 *  this reader (a part whose series the reader cannot see is an ordinary post
 *  to them). Null otherwise. */
export function seriesOf(path: string, visitor: boolean, lang: FilterLang): string | null {
  const series = table().partOf.get(path);
  if (series === undefined || !visible(series, visitor, lang)) return null;
  return visible(path, visitor, lang) ? series : null;
}

/** The parts of `series` this reader may see, in series order. Empty for a
 *  note that is not a series. */
export function visibleParts(series: string, visitor: boolean, lang: FilterLang): string[] {
  const list = table().entries.get(series);
  if (list === undefined) return [];
  return list
    .filter((e) => e.status === "published" && e.path !== null && visible(e.path, visitor, lang))
    .map((e) => e.path as string);
}

/** Every entry of a series, in order — the owner's view of the plan. */
export function seriesEntries(series: string): SeriesEntry[] {
  return table().entries.get(series) ?? [];
}

/** The series notes whose `series:` key names `path` — the rename flow's
 *  extra linkers (frontmatter is not in a note's body links). */
export function seriesDeclarersOf(path: string): string[] {
  const out: string[] = [];
  for (const record of notes.values()) {
    if (record.seriesRefs === null) continue;
    if (record.seriesRefs.some((ref) => resolveLink(ref, false, null) === path)) out.push(record.path);
  }
  return out;
}
