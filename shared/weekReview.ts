// THE WEEK, ADDED UP. What the weekly review page says, computed from what
// the vault and the device already keep and stored nowhere:
//
//   - pages and hours by book, from the `sessions:` lines the reader logged
//     into each tracker (shared/tracker.ts);
//   - every tracker's progress and the day it is projected to finish;
//   - each sigil's days done this week and its streak (shared/routine.ts);
//   - the cards graded and the retention, from the Orbits log the device
//     keeps in localStorage (client/orbits/log.ts hands the entries in);
//   - the notes created and the notes most edited, from the query route and
//     the version store.
//
// NOTHING IS WRITTEN. The page is a reading of the week, and a reading that
// kept its own ledger would be a second source of truth about the sigils
// and the trackers — the one thing "the note is the state" forbids. Pure,
// like every module the review reads from; the page is the only thing that
// knows a network.

import { paceProjection, minutesLeft, readingSpeed, type TrackerSession } from "./tracker.ts";
import { routineStats, shiftDate, weekStart, type RoutineEntry, type RoutinePlan } from "./routine.ts";

/** A week as two ISO days, both inclusive. */
export interface WeekRange {
  start: string;
  end: string;
}

/** The week `today` falls in, on the site's own week: Monday to Sunday for
 *  an English instance, Saturday to Friday for an Arabic one. */
export function weekOf(today: string, lang: "en" | "ar" = "en"): WeekRange {
  const start = weekStart(today, lang);
  return { start, end: shiftDate(start, 6) };
}

/** The week before `week`, for the review's "last week" comparisons. */
export function previousWeek(week: WeekRange): WeekRange {
  return { start: shiftDate(week.start, -7), end: shiftDate(week.end, -7) };
}

export function inWeek(iso: string, week: WeekRange): boolean {
  return iso >= week.start && iso <= week.end;
}

/** An epoch ms as the reader's own calendar day — the day they read, graded
 *  or wrote, in their zone. The same rule client/orbits/log.ts::dayOf keeps
 *  for the Orbits log, written here so the shared module owes nothing to
 *  the client. */
export function localDay(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ── Books ───────────────────────────────────────────────────────────────────

/** The slice of a tracker the review reads: the fields TrackerMeta carries
 *  and nothing the page does not print. */
export interface ReviewTracker {
  path: string;
  index: number;
  title: string;
  kind: string | null;
  kindKey: "book" | "game" | "film" | "show" | "course" | "project" | "habit" | null;
  unit: string | null;
  status: string;
  done: number | null;
  total: number | null;
  percent: number | null;
  pace: number | null;
  due: string | null;
  sessions: TrackerSession[];
}

export interface BookWeek {
  path: string;
  index: number;
  title: string;
  pages: number;
  minutes: number;
  sessions: number;
  /** Pages a minute over the book's last sessions, or null. */
  speed: number | null;
}

/** Every tracker with at least one session this week, most read first. */
export function booksThisWeek(trackers: readonly ReviewTracker[], week: WeekRange): BookWeek[] {
  const out: BookWeek[] = [];
  for (const t of trackers) {
    const inside = t.sessions.filter((s) => inWeek(s.date, week));
    if (inside.length === 0) continue;
    out.push({
      path: t.path,
      index: t.index,
      title: t.title,
      pages: inside.reduce((n, s) => n + s.pages, 0),
      minutes: inside.reduce((n, s) => n + s.minutes, 0),
      sessions: inside.length,
      speed: readingSpeed(t.sessions),
    });
  }
  return out.sort((a, b) => b.pages - a.pages || b.minutes - a.minutes || a.title.localeCompare(b.title));
}

export interface TrackerOutlook {
  path: string;
  index: number;
  title: string;
  kindKey: ReviewTracker["kindKey"];
  unit: string | null;
  done: number | null;
  total: number | null;
  percent: number | null;
  /** The finish date from `pace:`, or the pace a `due:` asks for. */
  projection: ReturnType<typeof paceProjection>;
  /** Minutes left at the book's own reading speed, when it has one. */
  minutesLeft: number | null;
}

/** Every ACTIVE tracker, the ones nearest done first — where the week left
 *  each work, and when it will be finished. */
export function trackerOutlook(trackers: readonly ReviewTracker[], today: string): TrackerOutlook[] {
  return trackers
    .filter((t) => t.status === "active")
    .map((t) => ({
      path: t.path,
      index: t.index,
      title: t.title,
      kindKey: t.kindKey,
      unit: t.unit,
      done: t.done,
      total: t.total,
      percent: t.percent,
      projection: paceProjection(t, today),
      minutesLeft: minutesLeft(t),
    }))
    .sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1) || a.title.localeCompare(b.title));
}

// ── Sigils ──────────────────────────────────────────────────────────────────

export interface SigilWeek {
  path: string;
  index: number;
  title: string;
  /** Complete days this week, and the target or the plan's own count. */
  done: number;
  of: number;
  streak: number;
}

/** Each sigil's week, as its own card counts it — the same routineStats,
 *  so the review and the card never disagree. Templates are the caller's
 *  to leave out. */
export function sigilsThisWeek(
  routines: readonly { path: string; index: number; plan: RoutinePlan; entries: RoutineEntry[] }[],
  today: string,
  lang: "en" | "ar" = "en",
): SigilWeek[] {
  return routines
    .map((r) => {
      const stats = routineStats(r.plan, r.entries, today, lang, 1);
      return { path: r.path, index: r.index, title: r.plan.title, done: stats.week.done, of: stats.week.of, streak: stats.streak };
    })
    .sort((a, b) => b.done / Math.max(1, b.of) - a.done / Math.max(1, a.of) || a.title.localeCompare(b.title));
}

// ── Orbits ──────────────────────────────────────────────────────────────────

/** The shape of one Orbits log entry the review needs. */
export interface ReviewGrade {
  path: string;
  grade: "again" | "hard" | "good" | "easy";
  ts: number;
}

export interface OrbitsWeek {
  graded: number;
  /** Good or easy over all grades, or null when nothing was graded. */
  retention: number | null;
  /** Days of the week with at least one grade. */
  days: number;
  /** Per deck, most graded first. */
  decks: { path: string; graded: number; retention: number | null }[];
}

export function orbitsThisWeek(log: readonly ReviewGrade[], week: WeekRange): OrbitsWeek {
  const inside = log.filter((e) => inWeek(localDay(e.ts), week));
  const kept = (list: readonly ReviewGrade[]): number | null => {
    if (list.length === 0) return null;
    return list.filter((e) => e.grade === "good" || e.grade === "easy").length / list.length;
  };
  const byDeck = new Map<string, ReviewGrade[]>();
  for (const e of inside) byDeck.set(e.path, [...(byDeck.get(e.path) ?? []), e]);
  const decks = [...byDeck.entries()]
    .map(([path, list]) => ({ path, graded: list.length, retention: kept(list) }))
    .sort((a, b) => b.graded - a.graded || a.path.localeCompare(b.path));
  return { graded: inside.length, retention: kept(inside), days: new Set(inside.map((e) => localDay(e.ts))).size, decks };
}

// ── Notes ───────────────────────────────────────────────────────────────────

export interface ReviewNote {
  path: string;
  title: string;
  /** When the note was written (frontmatter date, else first sight). */
  dateMs: number;
  mtimeMs: number;
}

export interface NotesWeek {
  /** Notes whose date falls in the week, newest first. */
  created: ReviewNote[];
  /** Notes touched in the week that were not created in it, most edited
   *  first — by the version count when the store has one, by the last
   *  write otherwise. */
  edited: (ReviewNote & { edits: number })[];
}

/** `edits` is path → versions written this week, for the notes the caller
 *  asked the version store about; a note not in the map counts its one
 *  known write. */
export function notesThisWeek(notes: readonly ReviewNote[], week: WeekRange, edits: ReadonlyMap<string, number>, limit = 12): NotesWeek {
  const created = notes
    .filter((n) => n.dateMs > 0 && inWeek(localDay(n.dateMs), week))
    .sort((a, b) => b.dateMs - a.dateMs)
    .slice(0, limit);
  const createdSet = new Set(created.map((n) => n.path));
  const edited = notes
    .filter((n) => !createdSet.has(n.path) && n.mtimeMs > 0 && inWeek(localDay(n.mtimeMs), week))
    .map((n) => ({ ...n, edits: Math.max(1, edits.get(n.path) ?? 1) }))
    .sort((a, b) => b.edits - a.edits || b.mtimeMs - a.mtimeMs)
    .slice(0, limit);
  return { created, edited };
}
