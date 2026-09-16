// PERIODIC NOTES: today's note, this week's, this month's, this year's, and
// the periods around them.
//
// The daily note was `daily/YYYY-MM-DD.md` and nothing else. Now the folder,
// the formats and the templates are settings (Settings → Vault → Periodic
// notes), the week, the month and the year exist on the same terms, and the
// palette walks to yesterday's and tomorrow's. The FILENAME stays what the
// format says — ISO by default, Gregorian and Western digits always
// (shared/periodic.ts) — because a filename is an address; the period is
// printed beside it in the site's calendar (`periodLabel`, the status bar's
// crumb, and the month grid in the sidebar).
//
// Settings arrive asynchronously (one /api/settings fetch, cached by
// client/templates.ts). The synchronous readers below (the palette's hint,
// the status bar's crumb, the calendar's dots) use the defaults until the
// first fetch lands and the cache is primed, which every door through here
// does first. The surfaces that DRAW from the cache (the grid, the crumb)
// subscribe to it through `usePeriodic`, because the owner can move the
// daily folder in Settings and the month that was dotted a second ago must
// be dotted by the new address, not the old one, without a reload.

import { createNote } from "./api.ts";
import { getDateCalendar, siteDate, siteDateRange } from "./dates.ts";
import { collectNotes } from "./editor/links.ts";
import { localeNum, t, tf, type I18nKey } from "./i18n.ts";
import {
  DAILY_FOLDER_DEFAULT,
  DAILY_FORMAT_DEFAULT,
  MONTHLY_FORMAT_DEFAULT,
  PERIOD_KINDS,
  WEEKLY_FORMAT_DEFAULT,
  YEARLY_FORMAT_DEFAULT,
  isoWeek,
  periodEnd,
  periodStart,
  periodicDateOf,
  periodicPath,
  shiftPeriod,
  type PeriodKind,
} from "../shared/periodic.ts";
import { useSyncExternalStore } from "react";
import { useStore } from "./state.ts";
import { applyDefaultTemplate } from "./templateActions.ts";
import { templateSettings } from "./templates.ts";
import { toast } from "./toast.ts";

export type { PeriodKind } from "../shared/periodic.ts";

export interface Periodic {
  folder: string;
  /** The format per kind; null when that kind is off. The day is never off. */
  formats: Record<PeriodKind, string | null>;
  templates: Record<PeriodKind, string | null>;
}

let cached: Periodic = {
  folder: DAILY_FOLDER_DEFAULT,
  formats: { day: DAILY_FORMAT_DEFAULT, week: WEEKLY_FORMAT_DEFAULT, month: MONTHLY_FORMAT_DEFAULT, year: YEARLY_FORMAT_DEFAULT },
  templates: { day: null, week: null, month: null, year: null },
};

/** A version counter for `useSyncExternalStore`, on client/tagLabels.ts's
 *  argument: the snapshot is compared by identity, and a number that moves
 *  when the cache is replaced is the cheap, stable thing to hand it. */
let version = 0;
const listeners = new Set<() => void>();
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function periodicVersion(): number {
  return version;
}

/** Prime the cache from the instance's settings; safe to call often. Every
 *  subscriber re-renders when the answer CHANGED — a save that touched
 *  nothing periodic wakes nobody. */
export async function loadPeriodic(): Promise<Periodic> {
  // The settings route is the admin's; a visitor (whose grid opens only
  // published days) keeps the defaults rather than asking for a 404 a click.
  if (!useStore.getState().admin) return cached;
  try {
    const s = await templateSettings();
    const next: Periodic = {
      folder: s.dailyFolder ?? DAILY_FOLDER_DEFAULT,
      formats: { day: s.dailyFormat ?? DAILY_FORMAT_DEFAULT, week: s.weeklyFormat, month: s.monthlyFormat, year: s.yearlyFormat },
      templates: { day: s.dailyTemplate, week: s.weeklyTemplate, month: s.monthlyTemplate, year: s.yearlyTemplate },
    };
    if (JSON.stringify(next) !== JSON.stringify(cached)) {
      cached = next;
      version += 1;
      for (const cb of listeners) cb();
    }
  } catch {
    // settings unreachable: the defaults stand, as they always did
  }
  return cached;
}

/** React's door onto the cache: the version, as a dependency for whatever
 *  a component derives from `periodicSettings()` — the grid's dots, the
 *  status bar's crumb. */
export function usePeriodic(): number {
  return useSyncExternalStore(subscribe, periodicVersion, periodicVersion);
}

/** The settings in force (the defaults until `loadPeriodic` lands). */
export function periodicSettings(): Periodic {
  return cached;
}

/** The note's path for the period of `kind` that `date` falls in, or null
 *  when that kind is off. */
export function periodicNotePath(kind: PeriodKind, date = new Date()): string | null {
  const format = cached.formats[kind];
  if (!format) return null;
  return periodicPath(cached.folder, format, periodStart(kind, date));
}

/** The daily note's path for `date`, in local time. */
export function dailyNotePath(date = new Date()): string {
  return periodicNotePath("day", date) ?? periodicPath(cached.folder, DAILY_FORMAT_DEFAULT, date);
}

export interface PeriodRef {
  kind: PeriodKind;
  /** The period's first day at local noon. Local, not UTC midnight: the
   *  filename was built from LOCAL date parts, so reading it back as UTC
   *  would shift the day for every reader off Greenwich — which for a Hijri
   *  rendering is a different month name, not a rounding error. */
  start: Date;
}

/** The period a note path names, or null for anything that is not a
 *  periodic note. The four formats are anchored patterns that cannot match
 *  one another's names, so the first hit is the only hit. */
export function periodOf(path: string): PeriodRef | null {
  for (const kind of PERIOD_KINDS) {
    const format = cached.formats[kind];
    if (!format) continue;
    const start = periodicDateOf(cached.folder, format, path);
    if (start) return { kind, start };
  }
  return null;
}

/** Every day that has a daily note, from the tree: ISO → path. Cheap —
 *  `periodicDateOf` checks the folder prefix before it runs the pattern,
 *  so a vault of ten thousand notes costs ten thousand string compares. */
export function dailyNotesByDay(tree: Parameters<typeof collectNotes>[0]): Map<string, string> {
  const out = new Map<string, string>();
  const format = cached.formats.day ?? DAILY_FORMAT_DEFAULT;
  for (const n of collectNotes(tree)) {
    const d = periodicDateOf(cached.folder, format, n.path);
    if (d) out.set(isoOf(d), n.path);
  }
  return out;
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** What a periodic note's PERIOD is called on screen, in the site's
 *  calendar: «Tuesday, 15 September 2026», «Week 38 · 14–20 September
 *  2026», «September 2026», «2026». On a Hijri (or both) instance a
 *  Gregorian month or year is not a Hijri one, so it is named as the span
 *  of days it covers — the honest name, in the calendar the reader lives
 *  in. Null for anything that is not a periodic note. */
export function periodLabel(path: string): string | null {
  const ref = periodOf(path);
  if (!ref) return null;
  const locale = useStore.getState().blogLocale;
  const end = periodEnd(ref.kind, ref.start);
  const span: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };
  switch (ref.kind) {
    case "day":
      return siteDate(ref.start, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    case "week":
      return tf("periodWeekLabel", { n: localeNum(isoWeek(ref.start).week), range: siteDateRange(ref.start, end, locale, span) });
    case "month":
      return getDateCalendar() === "gregorian" ? siteDate(ref.start, locale, { month: "long", year: "numeric" }) : siteDateRange(ref.start, end, locale, span);
    case "year":
      return getDateCalendar() === "gregorian" ? siteDate(ref.start, locale, { year: "numeric" }) : siteDateRange(ref.start, end, locale, span);
  }
}

const OFF_TOAST: Record<PeriodKind, I18nKey> = {
  day: "noDailyNote",
  week: "weeklyNotesOff",
  month: "monthlyNotesOff",
  year: "yearlyNotesOff",
};

/** Open (or create) the note for the period of `kind` that `date` falls
 *  in. THE ONE DOOR: the palette, the calendar's cells and the launch
 *  setting all come through here, so a note created from a click on the
 *  grid is templated exactly as one created by Ctrl/Cmd Alt D. */
export async function openPeriodicNoteAt(kind: PeriodKind, date: Date): Promise<void> {
  await loadPeriodic();
  const store = useStore.getState();
  const path = periodicNotePath(kind, date);
  if (path === null) {
    toast(t(OFF_TOAST[kind]));
    return;
  }
  const template = cached.templates[kind];
  const exists = collectNotes(store.tree).some((n) => n.path === path);
  // The toasts name TODAY only when today is what was asked for: a visitor
  // clicking last Tuesday on the grid, or the palette's month, must not be
  // told about "today's daily note".
  const isToday = kind === "day" && isoOf(periodStart("day", date)) === isoOf(new Date());
  if (!exists && !store.admin) {
    toast(t(isToday ? "noDailyNote" : "noPeriodicNote"));
    return;
  }
  if (!exists) {
    try {
      await createNote(path);
      // THE TEMPLATE, before the note opens (the store's rule: the editor
      // must load the templated content, not an empty buffer it is told
      // about afterwards). The period's own template when one is set, else
      // the default template for new notes — the one hole this door used to
      // have. Called here rather than through `store.createNote`, which is
      // guarded and would swallow the 409 this function falls through on.
      await applyDefaultTemplate(path, template);
      await store.loadTree();
      if (store.readingMode) store.setReadingMode(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (!/exists/i.test(message)) {
        console.error(`astrolabe: creating periodic note ${path} failed`, err);
        toast(t(isToday ? "dailyNoteFailed" : "periodicNoteFailed"));
        return;
      }
    }
  }
  store.openNote(path);
}

/** Finer periods first: a note of one kind anchors a walk to any kind at
 *  least as coarse as itself, and never the other way. */
const GRAIN: Record<PeriodKind, number> = { day: 0, week: 1, month: 2, year: 3 };

/** Open (or create) the periodic note for `kind`, `offset` periods from
 *  the reference date — today, unless the open note is itself a periodic
 *  note of a kind at least as fine as `kind`, in which case the walk starts
 *  FROM it: yesterday and tomorrow from an open daily note (a journal read
 *  backwards one day at a time), this month from the day it holds. Not the
 *  reverse — "this week" from an open yearly note is not the year's first
 *  week, it is this week. */
export async function openPeriodicNote(kind: PeriodKind = "day", offset = 0): Promise<void> {
  await loadPeriodic();
  const store = useStore.getState();
  const open = store.openPath ? periodOf(store.openPath) : null;
  const from = open !== null && GRAIN[open.kind] <= GRAIN[kind] ? open.start : new Date();
  await openPeriodicNoteAt(kind, shiftPeriod(kind, periodStart(kind, from), offset));
}

/** Open today's daily note, creating it first if it doesn't exist yet.
 *  TODAY'S, whatever is open: "today" is not a relative word, and a reader
 *  in last week's note pressing Ctrl/Cmd Alt D means the day they are in. */
export function openDailyNote(): Promise<void> {
  return openPeriodicNoteAt("day", new Date());
}
