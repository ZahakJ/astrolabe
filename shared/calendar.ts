// A MONTH AS A GRID, in whichever calendar the site prints.
//
// The sidebar's Calendar section and the Calendar page draw the same thing:
// the month you are in, seven columns wide, one cell a day. What
// varies is the CALENDAR — a site set to Hijri (shared/dates.ts) must get a
// Hijri month, Muharram to Dhu al-Hijjah, with its own first days and its own
// 29- or 30-day lengths — and the FIRST COLUMN, which is Monday for an
// English reader and Saturday for an Arabic one (shared/routine.ts
// `weekOrder`, the Sigils page's own rule).
//
// Nothing here hand-rolls a month table. Gregorian months come from `Date`;
// Hijri months come from Intl's Umm al-Qura data, one `formatToParts` per
// day, which is how the rest of this product already prints a Hijri date
// (`HIJRI_CALENDAR`). The walk to a month's first day and to the next one is
// arithmetic on real dates, never on an assumed month length, so the grid
// agrees with every date the chrome prints beside it.
//
// PURE, like shared/periodic.ts: `node --test` loads it (tests/calendar.test.ts)
// and so does the client. Every date is local noon, the convention the daily
// note's path is built on — a day is where the reader is.

import { HIJRI_CALENDAR } from "./dates.ts";
import { isoDate } from "./routine.ts";
import type { Weekday } from "./routine.ts";

/** The two calendars a grid can be drawn in. A site on `both` picks one to
 *  lead and prints the other's day number in the cell's corner. */
export type GridCalendar = "gregorian" | "hijri";

/** A date's parts in one calendar; `month` is 1-based in both. */
export interface CalendarYmd {
  year: number;
  month: number;
  day: number;
}

export interface GridCell {
  /** Local noon. */
  date: Date;
  /** `YYYY-MM-DD` of `date` — the key every other surface uses for a day. */
  iso: string;
  /** The day number in the grid's calendar. */
  day: number;
  /** False for the padding days that complete the first and last rows. */
  inMonth: boolean;
}

const DAY_MS = 86_400_000;

/** `date` at local noon — the one instant every helper here agrees on. */
export function noon(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

/** `days` days from `date`, at local noon. Through the constructor rather
 *  than millisecond arithmetic, so a DST change in between is a change of
 *  clock and not a change of date. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12);
}

/** Whole days from `a` to `b` (both taken at local noon). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((noon(b).getTime() - noon(a).getTime()) / DAY_MS);
}

/** One formatter per process: `Intl.DateTimeFormat` construction is the
 *  expensive half of a Hijri lookup, and a month grid asks forty times. */
let hijriParts: Intl.DateTimeFormat | null = null;
function hijriFormatter(): Intl.DateTimeFormat {
  if (hijriParts === null) {
    hijriParts = new Intl.DateTimeFormat("en-u-nu-latn", {
      calendar: HIJRI_CALENDAR,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
  }
  return hijriParts;
}

/** `date`'s year, month and day in `calendar`. */
export function ymdOf(date: Date, calendar: GridCalendar): CalendarYmd {
  if (calendar === "gregorian") {
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  }
  const out: CalendarYmd = { year: 0, month: 0, day: 0 };
  for (const part of hijriFormatter().formatToParts(date)) {
    if (part.type === "year") out.year = Number(part.value);
    else if (part.type === "month") out.month = Number(part.value);
    else if (part.type === "day") out.day = Number(part.value);
  }
  return out;
}

/** The first day of the month `date` falls in, at local noon. */
export function firstOfMonth(date: Date, calendar: GridCalendar): Date {
  if (calendar === "gregorian") return new Date(date.getFullYear(), date.getMonth(), 1, 12);
  return addDays(date, 1 - ymdOf(date, "hijri").day);
}

/** The first day of the month `offset` months from the one `date` is in.
 *  A Hijri month is 29 or 30 days, so thirty days on from a first day is
 *  always inside the NEXT month and never past it; one day back from a first
 *  day is always inside the previous one. */
export function addMonths(date: Date, offset: number, calendar: GridCalendar): Date {
  let first = firstOfMonth(date, calendar);
  if (calendar === "gregorian") return new Date(first.getFullYear(), first.getMonth() + offset, 1, 12);
  for (let i = 0; i < offset; i++) first = firstOfMonth(addDays(first, 30), "hijri");
  for (let i = 0; i > offset; i--) first = firstOfMonth(addDays(first, -1), "hijri");
  return first;
}

/** How many days the month `date` falls in has. */
export function monthLength(date: Date, calendar: GridCalendar): number {
  return daysBetween(firstOfMonth(date, calendar), addMonths(date, 1, calendar));
}

const WEEKDAY_OF_GETDAY: readonly Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** The weekday of a local date. */
export function weekdayOfLocal(date: Date): Weekday {
  return WEEKDAY_OF_GETDAY[date.getDay()];
}

/** The month `date` falls in, as rows of seven cells whose first column is
 *  `order[0]`. Padding cells complete the first and last rows with the
 *  neighbouring months' days, marked `inMonth: false`; there are never fewer
 *  than four rows nor more than six. */
export function monthCells(date: Date, calendar: GridCalendar, order: readonly Weekday[]): GridCell[][] {
  const first = firstOfMonth(date, calendar);
  const length = monthLength(date, calendar);
  const lead = order.indexOf(weekdayOfLocal(first));
  const total = Math.ceil((lead + length) / 7) * 7;
  const rows: GridCell[][] = [];
  for (let i = 0; i < total; i++) {
    const d = addDays(first, i - lead);
    const inMonth = i >= lead && i < lead + length;
    const cell: GridCell = {
      date: d,
      iso: isoDate(d),
      day: inMonth ? i - lead + 1 : ymdOf(d, calendar).day,
      inMonth,
    };
    if (i % 7 === 0) rows.push([]);
    rows[rows.length - 1].push(cell);
  }
  return rows;
}

/** The days the vault kept something on: every sigil's log lines and every
 *  tracker's reading sessions (`sessions:`, shared/tracker.ts) — the month
 *  grid's second mark (client/components/CalendarGrid.tsx). Here rather than
 *  beside the grid because the grid is a lazy chunk and the sidebar, which
 *  fetches the sets, must not pull it into its first paint. The sidebar is
 *  the one caller since 3.18 (the Sigils page fed a second grid until then):
 *  two GETs of lists the indexer keeps in memory, on one debounce. */
export function loggedDaysOf(
  routines: readonly { entries: readonly { date: string }[] }[],
  trackers: readonly { sessions?: readonly { date: string }[] }[],
): Set<string> {
  const out = new Set<string>();
  for (const m of routines) for (const e of m.entries) out.add(e.date);
  for (const m of trackers) for (const s of m.sessions ?? []) out.add(s.date);
  return out;
}
