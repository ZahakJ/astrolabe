// THE TIMELINE'S ORDER — the pure half of `as: timeline` (shared/queryFence.ts).
//
// The server answers a query with rows carrying a note's own date, its
// mtime and its scalar frontmatter as strings. A timeline lays them on a
// line by ONE of those, and when that one is a frontmatter key (`by: read`)
// the value is whatever the author typed: `2026-03-04`, `2026/03/04`,
// `2026-03`, `2026`, `4 March 2026`, with Eastern Arabic digits or without.
// Reading those, and turning every kind of date into ONE kind — a calendar
// day at UTC midnight (`localDayUtc`) — is this module's whole job; the
// client only groups what comes back into years, in the site's calendar,
// which is Intl's job.

import type { QuerySpec } from "./queryFence.ts";

export interface Datable {
  dateMs: number;
  mtimeMs: number;
  props: Record<string, string>;
}

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** A frontmatter date as UTC-midnight milliseconds, or null when the text
 *  is not a date anyone would recognise. Day precision at most: a timeline
 *  is read by the year and the day, never by the hour. A bare year is the
 *  first of January; a bare month, its first day. */
export function parseTimelineDate(value: string | undefined | null): number | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
  if (text === "") return null;
  // ISO-ish first: 2026-03-04, 2026/03/04, 2026.03.04, 2026-03, 2026, with an
  // optional time and zone after a T or a space, which are dropped.
  const iso = /^(\d{4})(?:[-/.](\d{1,2})(?:[-/.](\d{1,2}))?)?(?:[T\s].*)?$/.exec(text);
  if (iso) {
    const y = Number(iso[1]);
    const m = iso[2] === undefined ? 1 : Number(iso[2]);
    const d = iso[3] === undefined ? 1 : Number(iso[3]);
    return utcDay(y, m, d);
  }
  // Day-first with a spelled month ("4 March 2026", "4 mars 2026") or a
  // month-first one ("March 4, 2026"): Date.parse knows the English names,
  // and it is the only other shape a note written by hand is likely to use.
  if (/\d{4}/.test(text) && /\p{L}/u.test(text)) {
    const ms = Date.parse(text);
    if (Number.isFinite(ms)) {
      const at = new Date(ms);
      return utcDay(at.getFullYear(), at.getMonth() + 1, at.getDate());
    }
  }
  return null;
}

function utcDay(y: number, m: number, d: number): number | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const ms = Date.UTC(y, m - 1, d);
  const back = new Date(ms);
  // Date.UTC rolls 31 February into March; a date that moved is not a date.
  return back.getUTCMonth() === m - 1 && back.getUTCDate() === d ? ms : null;
}

/** An INSTANT (a file's mtime, a birthtime) as the UTC midnight of its LOCAL
 *  calendar day. Every value the timeline hands back is a day at UTC
 *  midnight, so the renderer can print all of them with `timeZone: "UTC"`
 *  and a frontmatter `2026-03-04` never slips a day west of Greenwich —
 *  but a note saved at 22:00 in California is a note of THAT evening, not
 *  of the next UTC morning, so a moment is read in local time first, the
 *  way the on-this-day panel reads a birthtime (server/indexer.ts). */
export function localDayUtc(instantMs: number): number {
  const at = new Date(instantMs);
  return Date.UTC(at.getFullYear(), at.getMonth(), at.getDate());
}

/** The frontmatter keys the indexer reads a note's own date from, in its
 *  order (server/indexer.ts dateMs). */
const OWN_DATE_KEYS = ["date", "created", "published"] as const;

/** The day a row sits at on the timeline, per the fence's `by:`, as UTC
 *  midnight. Null when the row has no such date — it then goes to the
 *  undated tail. `created` is the note's own date: the frontmatter day when
 *  the note names one (a calendar day, read as such), else the birthtime
 *  the server fell back to, which is a moment and is read in local time. */
export function timelineMs<T extends Datable>(row: T, by: QuerySpec["by"]): number | null {
  if (by === "created") {
    for (const key of OWN_DATE_KEYS) {
      const own = parseTimelineDate(row.props[key]);
      if (own !== null) return own;
    }
    return row.dateMs > 0 ? localDayUtc(row.dateMs) : null;
  }
  if (by === "modified") return row.mtimeMs > 0 ? localDayUtc(row.mtimeMs) : null;
  return parseTimelineDate(row.props[by.prop]);
}

export interface TimelineRow<T> {
  row: T;
  /** UTC milliseconds, or null for a row the timeline cannot place. */
  ms: number | null;
}

/** Rows in timeline order: dated ones newest first (or oldest first when
 *  `dir` is "asc"), then the undated ones in the order the server gave. The
 *  sort is stable, so two rows on one day keep the server's order. */
export function timelineOrder<T extends Datable>(
  rows: readonly T[],
  by: QuerySpec["by"],
  dir: "asc" | "desc",
): TimelineRow<T>[] {
  const dated: TimelineRow<T>[] = [];
  const undated: TimelineRow<T>[] = [];
  for (const row of rows) {
    const ms = timelineMs(row, by);
    (ms === null ? undated : dated).push({ row, ms });
  }
  dated.sort((a, b) => (dir === "asc" ? (a.ms ?? 0) - (b.ms ?? 0) : (b.ms ?? 0) - (a.ms ?? 0)));
  return [...dated, ...undated];
}

/** Consecutive rows under one heading — the year headings, once the client
 *  has named each row's year in the site's calendar. `keyOf` returning null
 *  means "no heading": those rows gather under one unnamed group. */
export function groupRuns<T>(rows: readonly T[], keyOf: (row: T) => string | null): { key: string | null; rows: T[] }[] {
  const groups: { key: string | null; rows: T[] }[] = [];
  for (const row of rows) {
    const key = keyOf(row);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else groups.push({ key, rows: [row] });
  }
  return groups;
}
