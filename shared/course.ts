// WALKING A COURSE — the cursor, the projection and the bands.
//
// SPLIT FROM shared/routine.ts ON PURPOSE, and the split is a budget, not a
// taste. That module is a STATIC import of the entry chunk: render.ts and the
// live preview must be able to parse a ```sigil fence before anything paints,
// so every byte of it is a byte every reader downloads, a visitor to a blog
// post included. Reading a course's steps has to live there. WALKING them does
// not: only the card, the Sigils page, the Calendar page and the form ever ask
// where the cursor is or what day a step lands on, and all four are lazy
// chunks. So the walk lives here, and the first paint never carries it.
//
// PURE, like its parent and for the same reasons: `node --test`
// (tests/routine.test.ts) and shared/dayAgenda.ts both load it, and neither
// has a DOM. Nothing here reads a date from the note, because the note has
// none — every date below is computed from the cursor forward, which is why a
// missed day costs nothing but a day.

import {
  capacityOn,
  courseAsks,
  shiftDate,
  weekdayOfDate,
  type CourseStep,
  type RoutineEntry,
  type RoutinePlan,
} from "./routine.ts";

function keySet(entries: readonly RoutineEntry[], pick: (e: RoutineEntry) => readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const e of entries) for (const k of pick(e)) out.add(k.trim().toLowerCase());
  return out;
}

/** The steps still owed, in order: everything from the cursor on that is
 *  neither ticked nor given up. A step ticked out of turn is simply gone
 *  from the list — the cursor is a fact about the log, not a pointer the
 *  note keeps. */
export function courseRemaining(plan: RoutinePlan, entries: readonly RoutineEntry[]): CourseStep[] {
  if (plan.course === null) return [];
  const done = keySet(entries, (e) => e.done);
  const skipped = keySet(entries, (e) => e.skipped);
  return plan.course.steps.filter((s) => !done.has(s.key.toLowerCase()) && !skipped.has(s.key.toLowerCase()));
}

/** THE CURSOR: the first step neither done nor skipped, or null when the
 *  course is finished. */
export function courseCursor(plan: RoutinePlan, entries: readonly RoutineEntry[]): CourseStep | null {
  return courseRemaining(plan, entries)[0] ?? null;
}

/** How far through the course the reader is: steps answered, of all. */
export function courseProgress(plan: RoutinePlan, entries: readonly RoutineEntry[]): { done: number; of: number } {
  const of = plan.course?.steps.length ?? 0;
  return { done: of - courseRemaining(plan, entries).length, of };
}

/** One projected day of a course. */
export interface CourseDay {
  iso: string;
  steps: CourseStep[];
}

/** How far ahead a projection will ever walk: ten years of days is longer
 *  than any curriculum and short enough that a course with no allowed day
 *  at all cannot spin. */
const PROJECT_GUARD = 3660;

/** THE PROJECTION. The steps still owed, laid onto the days from `from`
 *  forward: rest days are stepped over, each allowed day takes at least one
 *  step and then as many more as its capacity still holds. Nothing here is
 *  read from the note and nothing is written to it — miss a day and the same
 *  call, made tomorrow, returns the same steps one day later.
 *
 *  `until` stops the walk at a date (the drawn month's end, or today for the
 *  card); without it the walk runs until the course is finished. */
export function projectCourse(
  plan: RoutinePlan,
  entries: readonly RoutineEntry[],
  from: string,
  until?: string,
): CourseDay[] {
  const course = plan.course;
  if (course === null) return [];
  const left = courseRemaining(plan, entries);
  const out: CourseDay[] = [];
  let iso = from;
  let i = 0;
  for (let guard = 0; guard < PROJECT_GUARD && i < left.length; guard++) {
    if (until !== undefined && iso > until) break;
    const wd = weekdayOfDate(iso);
    if (courseAsks(course, wd)) {
      const cap = capacityOn(course, wd);
      const take: CourseStep[] = [];
      let used = 0;
      while (i < left.length) {
        const step = left[i];
        const mins = step.minutes;
        // The day always takes one step, however long it is: a step bigger
        // than the budget is a step that takes the day (and, if it is not
        // finished, tomorrow as well — which is the whole point).
        if (take.length > 0 && (cap === null || mins === null || used + mins > cap)) break;
        take.push(step);
        used += mins ?? 0;
        i++;
        if (cap === null) break;
      }
      if (take.length > 0) out.push({ iso, steps: take });
    }
    iso = shiftDate(iso, 1);
  }
  return out;
}

/** The day the course is projected to finish, or null when it already has. */
export function courseFinish(plan: RoutinePlan, entries: readonly RoutineEntry[], today: string): string | null {
  const days = projectCourse(plan, entries, today);
  return days.length === 0 ? null : days[days.length - 1].iso;
}

/** What `iso` shows on the card: the steps its log already records — so a
 *  tick can be taken back — then, for today and the days ahead, the ones the
 *  projection puts there. A past day shows only what it actually held. */
export function courseStepsOn(
  plan: RoutinePlan,
  entries: readonly RoutineEntry[],
  iso: string,
  today: string,
): CourseStep[] {
  const course = plan.course;
  if (course === null) return [];
  const entry = entries.find((e) => e.date === iso) ?? null;
  const answered = new Set([...(entry?.done ?? []), ...(entry?.skipped ?? [])].map((k) => k.trim().toLowerCase()));
  const out = course.steps.filter((s) => answered.has(s.key.toLowerCase()));
  if (iso < today) return out;
  const seen = new Set(out.map((s) => s.key));
  for (const s of projectCourse(plan, entries, today, iso).find((d) => d.iso === iso)?.steps ?? []) {
    if (!seen.has(s.key)) out.push(s);
  }
  return out;
}


/** A unit and the stretch of days the projection gives it — what the months
 *  ahead look like when you stand back: "Genki I — lesson 3: 27 Oct – 9 Nov".
 *  A unit the reader comes back to later gets a band each time. */
export interface CourseBand {
  unit: string;
  start: string;
  end: string;
  steps: number;
}

export function courseBands(days: readonly CourseDay[]): CourseBand[] {
  const out: CourseBand[] = [];
  for (const day of days) {
    for (const step of day.steps) {
      const last = out[out.length - 1];
      if (last !== undefined && last.unit === step.unit) {
        last.end = day.iso;
        last.steps++;
      } else out.push({ unit: step.unit, start: day.iso, end: day.iso, steps: 1 });
    }
  }
  return out;
}

