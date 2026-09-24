// WHAT A DAY HELD. The Calendar page's cells and its day pane, computed from
// what the vault and the device already keep and stored nowhere:
//
//   - the daily note for the day, from the tree (client/daily.ts hands the
//     map in — a string compare per note, nothing stored);
//   - every sigil that logged that day, with the status its own card would
//     give it (shared/routine.ts `dayStatus`, so the month and the card can
//     never disagree);
//   - the cards graded that day and how many were kept, from the Orbits log
//     the device keeps in localStorage (client/orbits/log.ts hands it in);
//   - the reading sittings logged into the trackers' `sessions:` lines;
//   - (3.28, for the Timeline and the year in review) the notes WRITTEN that
//     day by the day they belong to (shared/noteDays.ts — the frontmatter's
//     day, else the created ledger's), the ones PUBLISHED that day, and the
//     lines captured or spoken into the day's own note or inbox. The
//     Calendar does not pass these and pays nothing for them.
//
// The same argument shared/weekReview.ts makes for the week: a calendar that
// kept its own ledger would be a second truth about the sigils and the
// trackers, and "the note is the state" allows no second truth. PURE — no
// DOM, no store, no fetch — so `node --test` loads it (tests/dayAgenda.test.ts)
// and so does the page.
//
// ONE PASS PER MONTH, not one pass per cell. A month is forty-two days and a
// vault can hold hundreds of sigil entries, thousands of grades and hundreds
// of sittings; `agendaByDay` buckets each source once by day and then reads
// the buckets, so turning the page costs the length of the sources and not
// their length times forty-two.

import { courseBands, projectCourse } from "./course.ts";
import {
  dayRatio,
  dayStatus,
  tasksFor,
  type DayStatus,
  type RoutineEntry,
  type RoutinePlan,
} from "./routine.ts";
import { inboxDayOf, isVoiceNotePath } from "./noteDays.ts";
import type { TrackerSession } from "./tracker.ts";
import { localDay, type ReviewGrade } from "./weekReview.ts";

/** The slice of a `RoutineMeta` the page needs. */
export interface AgendaSigilSource {
  path: string;
  index: number;
  plan: RoutinePlan;
  entries: readonly RoutineEntry[];
}

/** The slice of a `TrackerMeta` the page needs. */
export interface AgendaTrackerSource {
  path: string;
  index: number;
  title: string;
  sessions: readonly TrackerSession[];
}

/** The slice of a `TimelineNote` (GET /api/timeline) the agenda reads. */
export interface AgendaNoteSource {
  path: string;
  title: string;
  day: string | null;
  publishedDay: string | null;
  published: boolean;
  excerpt: string;
  tags: readonly string[];
  captured: number;
  voice: number;
}

export interface AgendaSources {
  /** ISO day → the daily note's path (client/daily.ts `dailyNotesByDay`). */
  notes: ReadonlyMap<string, string>;
  sigils: readonly AgendaSigilSource[];
  trackers: readonly AgendaTrackerSource[];
  /** The device's Orbits log, unfiltered; bucketed here by local day. */
  grades: readonly ReviewGrade[];
  /** Every note with its day (the Timeline's sources). Absent on the
   *  Calendar, which reads a month and not the vault's writing. */
  written?: readonly AgendaNoteSource[];
}

/** A note on the day it was written — or, for `published`, went out. */
export interface DayNote {
  path: string;
  title: string;
  excerpt: string;
  tags: readonly string[];
  /** A long transcript's own note (`Inbox/Voice — …`) is a voice note. */
  kind: "note" | "voice";
  published: boolean;
}

/** What was caught into the day's own note or inbox on that day: stamped
 *  lines under `## Captured`, and recordings linked. */
export interface DayCatch {
  path: string;
  title: string;
  lines: number;
  voice: number;
}

export interface DaySigil {
  path: string;
  index: number;
  title: string;
  status: DayStatus;
  /** Tasks ticked, out of what the day asked. Both 0 on a plan that asks
   *  nothing of that weekday and was logged anyway (a field, a note). */
  done: number;
  of: number;
  /** The day's own line of prose in the log, when it carries one. */
  note: string | null;
  /** For a COURSE, the steps this day actually answered, in the course's own
   *  order — what the cell draws solid, because it happened. */
  steps: string[];
}

/** A step a COURSE is projected to land on a day ahead. Nothing about it is
 *  stored: it is `projectCourse` walking forward from today over the allowed
 *  days, recomputed every time the month is drawn, so a day gone by without
 *  an answer moves all of these one day on by itself. */
export interface DayProjection {
  path: string;
  index: number;
  /** The sigil's title. */
  title: string;
  /** The unit heading the step sits under; "" when the course has none. */
  unit: string;
  text: string;
}

/** A unit's stretch of projected days, for the strip of months ahead:
 *  "Genki I — lesson 3: 27 Oct – 9 Nov". */
export interface AgendaBand {
  path: string;
  index: number;
  title: string;
  unit: string;
  start: string;
  end: string;
  steps: number;
}

export interface DayDeck {
  /** The deck note's path, or `EVERYTHING_ELSE` for the implicit deck. */
  path: string;
  graded: number;
  /** Graded `good` or `easy` — what "kept" means everywhere else. */
  kept: number;
}

export interface DayTracker {
  path: string;
  index: number;
  title: string;
  pages: number;
  minutes: number;
  sessions: number;
}

export interface DayAgenda {
  iso: string;
  /** The daily note's path, or null when the day has none. */
  note: string | null;
  sigils: DaySigil[];
  decks: DayDeck[];
  trackers: DayTracker[];
  /** What a course is on course to ask of this day — today and after, never
   *  behind. Drawn faint: it has not happened. */
  projected: DayProjection[];
  /** Notes written that day (never the day's own daily note or inbox note,
   *  which are the day rather than something in it). */
  written: DayNote[];
  /** Notes whose `published:` names this day, when it is not the day they
   *  were written (that one is a `written` row with `published: true`). */
  published: DayNote[];
  /** Lines and recordings caught into the day's note or inbox. */
  caught: DayCatch[];
  /** The day's own note's opening, when the Timeline's sources carry it. */
  noteExcerpt: string | null;
  /** Everything the day holds, the note counted as one — what a cell shows
   *  when it has no room for the rows themselves. */
  count: number;
}

/** An empty day, so a caller never has to test for null. */
export function emptyAgenda(iso: string): DayAgenda {
  return { iso, note: null, sigils: [], decks: [], trackers: [], projected: [], written: [], published: [], caught: [], noteExcerpt: null, count: 0 };
}

export interface AgendaOptions {
  /** Walk a course's steps onto the days ahead (the Calendar). The Timeline
   *  reads what happened and passes false. Default true. */
  project?: boolean;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Every day in `days` (ISO, in any order), with what it held. `today`
 *  decides only what a sigil's status is called — a day with no ticks is
 *  `missed` behind and `none` ahead — exactly as the card reckons it. */
export function agendaByDay(days: readonly string[], sources: AgendaSources, today: string, opts: AgendaOptions = {}): Map<string, DayAgenda> {
  const wanted = new Set(days);
  const out = new Map<string, DayAgenda>();
  for (const iso of wanted) out.set(iso, emptyAgenda(iso));

  for (const [iso, path] of sources.notes) {
    const day = out.get(iso);
    if (day !== undefined) day.note = path;
  }

  // The last day the month draws: how far a projection has to walk.
  let horizon = today;
  for (const iso of wanted) if (iso > horizon) horizon = iso;

  for (const sigil of sources.sigils) {
    const steps = sigil.plan.course === null ? null : new Map(sigil.plan.course.steps.map((s) => [s.key.toLowerCase(), s]));
    for (const entry of sigil.entries) {
      const day = out.get(entry.date);
      if (day === undefined) continue;
      const of = tasksFor(sigil.plan, entry.date).length;
      day.sigils.push({
        path: sigil.path,
        index: sigil.index,
        title: sigil.plan.title,
        status: dayStatus(sigil.plan, entry, entry.date, today),
        done: Math.round(dayRatio(sigil.plan, entry, entry.date) * of),
        of,
        note: entry.note,
        // A course's ticked steps, in the course's order rather than the
        // log's: the day is read as part of the course, not as a line.
        steps:
          steps === null
            ? []
            : sigil.plan.course!.steps.filter((s) => entry.done.some((k) => k.trim().toLowerCase() === s.key.toLowerCase())).map((s) => s.text),
      });
    }
    // …and what it is on course to ask of the days ahead.
    if (opts.project === false) continue;
    if (sigil.plan.mode !== "course" || sigil.plan.course === null || horizon < today) continue;
    for (const projected of projectCourse(sigil.plan, sigil.entries, today, horizon)) {
      const day = out.get(projected.iso);
      if (day === undefined) continue;
      for (const step of projected.steps) {
        day.projected.push({ path: sigil.path, index: sigil.index, title: sigil.plan.title, unit: step.unit, text: step.text });
      }
    }
  }

  const decks = new Map<string, Map<string, DayDeck>>();
  for (const grade of sources.grades) {
    const iso = localDay(grade.ts);
    if (!wanted.has(iso)) continue;
    let byDeck = decks.get(iso);
    if (byDeck === undefined) {
      byDeck = new Map();
      decks.set(iso, byDeck);
    }
    const row = byDeck.get(grade.path) ?? { path: grade.path, graded: 0, kept: 0 };
    row.graded += 1;
    if (grade.grade === "good" || grade.grade === "easy") row.kept += 1;
    byDeck.set(grade.path, row);
  }
  for (const [iso, byDeck] of decks) {
    const day = out.get(iso);
    if (day !== undefined) day.decks = [...byDeck.values()].sort((a, b) => b.graded - a.graded || compare(a.path, b.path));
  }

  for (const tracker of sources.trackers) {
    const byDay = new Map<string, DayTracker>();
    for (const session of tracker.sessions) {
      if (!wanted.has(session.date)) continue;
      const row = byDay.get(session.date) ?? { path: tracker.path, index: tracker.index, title: tracker.title, pages: 0, minutes: 0, sessions: 0 };
      row.pages += session.pages;
      row.minutes += session.minutes;
      row.sessions += 1;
      byDay.set(session.date, row);
    }
    for (const [iso, row] of byDay) out.get(iso)?.trackers.push(row);
  }

  if (sources.written !== undefined) placeWritten(out, sources.written, sources.notes);

  for (const day of out.values()) {
    day.sigils.sort((a, b) => compare(a.title, b.title) || compare(a.path, b.path) || a.index - b.index);
    day.trackers.sort((a, b) => b.pages - a.pages || b.minutes - a.minutes || compare(a.title, b.title));
    day.count =
      (day.note === null ? 0 : 1) + day.sigils.length + day.decks.length + day.trackers.length + day.projected.length +
      day.written.length + day.published.length + day.caught.length;
  }
  return out;
}

/** The note half of a day: what was written on it, what went out on it, and
 *  what was caught into its own note. A daily note is the DAY, not a note
 *  written on it, so it never appears as `written`; the same goes for an
 *  inbox note named for a day (`Inbox/2026-09-23.md`). */
function placeWritten(out: Map<string, DayAgenda>, written: readonly AgendaNoteSource[], daily: ReadonlyMap<string, string>): void {
  const dayOfDaily = new Map<string, string>();
  for (const [iso, path] of daily) dayOfDaily.set(path, iso);
  for (const n of written) {
    const own = dayOfDaily.get(n.path) ?? null;
    const inbox = own === null ? inboxDayOf(n.path) : null;
    if (own !== null) {
      const day = out.get(own);
      if (day !== undefined && n.excerpt !== "") day.noteExcerpt = n.excerpt;
    }
    const catchDay = own ?? inbox;
    if (catchDay !== null && (n.captured > 0 || n.voice > 0)) {
      out.get(catchDay)?.caught.push({ path: n.path, title: n.title, lines: n.captured, voice: n.voice });
    }
    if (own === null && inbox === null && n.day !== null) {
      out.get(n.day)?.written.push(noteRow(n));
    }
    if (n.published && n.publishedDay !== null && n.publishedDay !== n.day) {
      out.get(n.publishedDay)?.published.push(noteRow(n));
    }
  }
  for (const day of out.values()) {
    day.written.sort((a, b) => compare(a.title, b.title) || compare(a.path, b.path));
    day.published.sort((a, b) => compare(a.title, b.title) || compare(a.path, b.path));
    day.caught.sort((a, b) => compare(a.path, b.path));
  }
}

function noteRow(n: AgendaNoteSource): DayNote {
  return { path: n.path, title: n.title, excerpt: n.excerpt, tags: n.tags, kind: isVoiceNotePath(n.path) ? "voice" : "note", published: n.published };
}

/** Every day the sources hold anything on, newest first — the Timeline's
 *  `days`, handed straight back to `agendaByDay`. Nothing ahead of `today`:
 *  a timeline is what happened. */
export function agendaDays(sources: AgendaSources, today: string): string[] {
  const days = new Set<string>();
  const add = (iso: string | null | undefined): void => {
    if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) && iso <= today) days.add(iso);
  };
  for (const iso of sources.notes.keys()) add(iso);
  for (const sigil of sources.sigils) for (const entry of sigil.entries) add(entry.date);
  for (const tracker of sources.trackers) for (const session of tracker.sessions) add(session.date);
  for (const grade of sources.grades) add(localDay(grade.ts));
  for (const n of sources.written ?? []) {
    add(n.day);
    if (n.published) add(n.publishedDay);
    add(inboxDayOf(n.path));
  }
  return [...days].sort((a, b) => compare(b, a));
}

/** The unit bands of every course across `days` — the months ahead, read as
 *  stretches rather than as a hundred separate cells. Pure, and the same
 *  projection the cells draw, so a band can never disagree with them. */
export function agendaBands(sigils: readonly AgendaSigilSource[], days: readonly string[], today: string): AgendaBand[] {
  let horizon = today;
  for (const iso of days) if (iso > horizon) horizon = iso;
  const out: AgendaBand[] = [];
  for (const sigil of sigils) {
    if (sigil.plan.mode !== "course" || sigil.plan.course === null) continue;
    for (const band of courseBands(projectCourse(sigil.plan, sigil.entries, today, horizon))) {
      out.push({ path: sigil.path, index: sigil.index, title: sigil.plan.title, ...band });
    }
  }
  return out.sort((a, b) => compare(a.start, b.start) || compare(a.title, b.title));
}

/** How many cards were graded across a day's decks, and how many kept. */
export function gradedOn(day: DayAgenda): { graded: number; kept: number } {
  return day.decks.reduce((acc, d) => ({ graded: acc.graded + d.graded, kept: acc.kept + d.kept }), { graded: 0, kept: 0 });
}
