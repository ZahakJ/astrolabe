// A STUDY SESSION — Anki's learning queue, in memory, over SM-2 on disk.
//
// shared/srs.ts is the whole of what the note remembers: one SM-2 schedule
// per star, in the plugin's comment. What it cannot hold is the ten minutes
// between "again" and the second look — Anki's LEARNING STEPS — and a
// session is exactly that: a small machine that decides which star to show
// next and, on a grade, whether anything is written back. Pure, so the
// client's queue (client/stars/queue.ts) and the node tests hold one copy of
// the rules the spec sets out (CONSTELLATIONS-SPEC.md, "Scheduling"):
//
//   · a NEW star, or a review graded "again", enters the steps (`steps:` from
//     the fence, default 1m then 10m) and is re-shown after each step within
//     the session; graduating writes SM-2's first schedule (good → 1 day,
//     easy → 4 days);
//   · "again" on a review is a LAPSE: SM-2's `again` result is written (one
//     day, ease −200) AND the star sits in the relearning step (10m);
//   · the order is: learning stars whose step is due → due reviews (soonest
//     first, then document order) → new stars, interleaved one after every
//     four reviews.
//
// The steps are session-local by design: close the page and they are gone,
// and the note is still right — a star mid-step has no schedule yet (new) or
// the one-day lapse schedule (relearning), and either way it comes back.

import type { Star, Step } from "./constellations.ts";
import { DEFAULT_STEPS, RELEARN_STEPS } from "./constellations.ts";
import { isDue, review, type Grade, type Schedule } from "./srs.ts";

const MINUTE_MS = 60_000;
/** Reviews shown between one new star and the next. */
const REVIEWS_PER_NEW = 4;

/** Why a star is in front of the reader right now. */
export type SessionKind = "learning" | "review" | "new";

export interface LearningEntry {
  id: string;
  /** Index into the steps the star is on (0 = the first). */
  step: number;
  /** When the step elapses, ms since the epoch. */
  dueAt: number;
  /** Relearning after a lapse: the relearn steps, and graduating writes
   *  nothing (the lapse already wrote the one-day schedule). */
  relearn: boolean;
}

export interface SessionState {
  /** Due review stars, in the order they should be asked. */
  reviews: string[];
  /** New stars still to be introduced, in document order, already capped. */
  fresh: string[];
  learning: LearningEntry[];
  /** Reviews shown since the last new star — the interleave counter. */
  sinceNew: number;
  /** Stars put aside for this session ("Skip"). */
  buried: string[];
  /** Grades given, in order — the session's own summary. */
  graded: Array<{ id: string; grade: Grade; kind: SessionKind }>;
}

export interface Pick {
  id: string;
  kind: SessionKind;
  /** For a learning star: the step it is on. */
  step: number;
  relearn: boolean;
}

/** The preview a grade button shows: minutes inside the steps, days once
 *  SM-2 takes over. */
export type Preview = { unit: "minutes"; n: number } | { unit: "days"; n: number };

function byDue(a: Star, b: Star): number {
  const da = a.schedule?.due ?? "";
  const db = b.schedule?.due ?? "";
  return da < db ? -1 : da > db ? 1 : a.line - b.line || (a.dir === "fwd" ? -1 : 1);
}

/** The session's opening state. `newAllowed` is what the daily limit still
 *  permits (the caller reads it from its per-device counter); `ahead` builds
 *  a session from the stars NOT due — "Study ahead" — soonest first. */
export function startSession(stars: Star[], today: string, newAllowed: number, ahead = false): SessionState {
  const due = stars.filter((s) => s.schedule !== null && (ahead ? !isDue(s.schedule, today) : isDue(s.schedule, today)));
  due.sort(byDue);
  const fresh = ahead ? [] : stars.filter((s) => s.schedule === null).slice(0, Math.max(0, newAllowed));
  return { reviews: due.map((s) => s.id), fresh: fresh.map((s) => s.id), learning: [], sinceNew: 0, buried: [], graded: [] };
}

/** How many stars the session still has to show, learning ones included. */
export function remaining(state: SessionState): number {
  return state.reviews.length + state.fresh.length + state.learning.length;
}

/** The next star to show, or null when the session is over. A learning
 *  star whose step has elapsed always comes first; when nothing else is
 *  left the earliest learning star is shown early rather than making the
 *  reader sit out a timer — Anki's "learn ahead", without the setting. */
export function pick(state: SessionState, now: number): Pick | null {
  const ready = state.learning.filter((l) => l.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt)[0];
  if (ready) return { id: ready.id, kind: "learning", step: ready.step, relearn: ready.relearn };
  const wantNew = state.fresh.length > 0 && (state.reviews.length === 0 || state.sinceNew >= REVIEWS_PER_NEW);
  if (wantNew) return { id: state.fresh[0], kind: "new", step: 0, relearn: false };
  if (state.reviews.length > 0) return { id: state.reviews[0], kind: "review", step: 0, relearn: false };
  const early = [...state.learning].sort((a, b) => a.dueAt - b.dueAt)[0];
  if (early) return { id: early.id, kind: "learning", step: early.step, relearn: early.relearn };
  return null;
}

function without(state: SessionState, id: string): SessionState {
  return {
    ...state,
    reviews: state.reviews.filter((x) => x !== id),
    fresh: state.fresh.filter((x) => x !== id),
    learning: state.learning.filter((x) => x.id !== id),
  };
}

function stepsFor(relearn: boolean, steps: Step[]): Step[] {
  const list = relearn ? RELEARN_STEPS : steps.length > 0 ? steps : DEFAULT_STEPS;
  return list;
}

export interface GradeResult {
  state: SessionState;
  /** The schedule to write into the note, or null when the grade only moved
   *  the star between steps. */
  write: Schedule | null;
}

/** Apply a grade to the star `p` names. */
export function grade(state: SessionState, p: Pick, star: Star, g: Grade, now: number, today: string, steps: Step[]): GradeResult {
  const base = without(state, p.id);
  const graded = [...state.graded, { id: p.id, grade: g, kind: p.kind }];
  const sinceNew = p.kind === "review" ? state.sinceNew + 1 : p.kind === "new" ? 0 : state.sinceNew;
  const learn = (entry: LearningEntry): GradeResult => ({ state: { ...base, learning: [...base.learning, entry], sinceNew, graded }, write: null });
  const done = (write: Schedule | null): GradeResult => ({ state: { ...base, sinceNew, graded }, write });

  if (p.kind === "review") {
    const next = review(star.schedule, g, today);
    if (g === "again") {
      // A lapse: SM-2's own result goes to the note now, and the star comes
      // back in ten minutes so the session ends with it known.
      const [first] = stepsFor(true, steps);
      return { ...learn({ id: p.id, step: 0, dueAt: now + first * MINUTE_MS, relearn: true }), write: next };
    }
    return done(next);
  }

  const list = stepsFor(p.relearn, steps);
  const at = p.kind === "new" ? 0 : p.step;
  if (g === "again") return learn({ id: p.id, step: 0, dueAt: now + list[0] * MINUTE_MS, relearn: p.relearn });
  if (g === "hard") {
    // Hard repeats the current step (Anki shows it again after the same
    // wait) — a new star's first "hard" is its first step.
    const wait = list[Math.min(at, list.length - 1)];
    return learn({ id: p.id, step: at, dueAt: now + wait * MINUTE_MS, relearn: p.relearn });
  }
  if (g === "good" && at + 1 < list.length) {
    return learn({ id: p.id, step: at + 1, dueAt: now + list[at + 1] * MINUTE_MS, relearn: p.relearn });
  }
  // Graduating. A relearning star already carries the lapse schedule; a new
  // one gets SM-2's first — one day for good, four for easy.
  if (p.relearn) return done(null);
  return done(review(null, g, today));
}

/** What each grade would do, for the four buttons. */
export function preview(p: Pick, star: Star, g: Grade, today: string, steps: Step[]): Preview {
  if (p.kind === "review") return { unit: "days", n: review(star.schedule, g, today).interval };
  const list = stepsFor(p.relearn, steps);
  const at = p.kind === "new" ? 0 : p.step;
  if (g === "again") return { unit: "minutes", n: list[0] };
  if (g === "hard") return { unit: "minutes", n: list[Math.min(at, list.length - 1)] };
  if (g === "good" && at + 1 < list.length) return { unit: "minutes", n: list[at + 1] };
  if (p.relearn) return { unit: "days", n: star.schedule?.interval ?? 1 };
  return { unit: "days", n: review(null, g, today).interval };
}

/** Put a star aside for the rest of the session. */
export function bury(state: SessionState, id: string): SessionState {
  return { ...without(state, id), buried: [...state.buried, id] };
}

/** Days with at least one grade, counted back from `today` without a gap —
 *  the shelf's streak. `days` are ISO days that saw a session, any order. */
export function streakOf(days: Iterable<string>, today: string): number {
  const set = new Set(days);
  let n = 0;
  let d = today;
  // A reader who has not studied YET today keeps yesterday's streak on the
  // shelf; the count only breaks once a whole day passed without a session.
  if (!set.has(d)) d = shiftDay(d, -1);
  while (set.has(d)) {
    n += 1;
    d = shiftDay(d, -1);
  }
  return n;
}

export function shiftDay(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Stars due on each of the next `days` days, from their schedules — the
 *  forecast. Index 0 is today (overdue stars included there). */
export function forecast(stars: Star[], today: string, days = 30): number[] {
  const out = new Array<number>(days).fill(0);
  const last = shiftDay(today, days - 1);
  for (const s of stars) {
    if (s.schedule === null) continue;
    const due = s.schedule.due;
    if (due <= today) out[0] += 1;
    else if (due <= last) {
      const i = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
      if (i >= 0 && i < days) out[i] += 1;
    }
  }
  return out;
}

/** New / learning / young / mature, as Anki draws them: young is a schedule
 *  under 21 days, mature 21 and over. "Learning" is session-local and the
 *  note cannot say it, so it is what the caller's session knows. */
export function statesOf(stars: Star[], learningIds: Set<string> = new Set()): { new: number; learning: number; young: number; mature: number } {
  const out = { new: 0, learning: 0, young: 0, mature: 0 };
  for (const s of stars) {
    if (learningIds.has(s.id)) out.learning += 1;
    else if (s.schedule === null) out.new += 1;
    else if (s.schedule.interval < 21) out.young += 1;
    else out.mature += 1;
  }
  return out;
}
