// A STUDY SESSION — Anki's learning queue, in memory, over SM-2 in the note.
//
// The note holds one number per star: the SM-2 schedule in the plugin's
// comment (shared/srs.ts). That is a DAY granularity, and a first meeting
// with a kana needs minutes: see it, fail it, see it again in one minute,
// then in ten, and only then let it go for a day. So a session keeps a
// LEARNING QUEUE the note never sees — a new star, or a review the reader
// failed, walks the deck's steps (`steps:` in the fence, default
// 1m then 10m; relearning always 10m) and is shown again when its step has
// elapsed within the same session. GRADUATING — good after the last step,
// easy at any step — is the moment the note is written. Closing the page
// forgets the steps; the note holds the truth, and a card mid-step comes
// back tomorrow as the new card it still is.
//
// Pure and clock-free: every function takes `now` (epoch ms) and `today`
// (ISO day) and returns a NEW session, never mutating the one it was given.
// That is what makes "undo the last grade" one line in the client (keep the
// previous session) and what lets the tests walk a whole evening in
// microseconds. The client (client/orbits/queue.ts) owns the clock, the
// localStorage daily-new counter and the write to the server.

import { isDue, review, type Grade, type Schedule } from "./srs.ts";
import { DEFAULT_STEPS, RELEARN_STEPS, type DeckCard, type Step } from "./decks.ts";

/** Where a star is in the session. "review" is a star with a schedule that
 *  has come due; "new" one with none; "learning" a new star inside its
 *  steps; "relearning" a review the reader failed, inside the relearn step. */
export type Phase = "new" | "learning" | "review" | "relearning";

export interface LearningEntry {
  id: string;
  phase: "learning" | "relearning";
  /** Index into the steps the entry is walking. */
  step: number;
  /** When the step elapses (epoch ms). */
  dueAt: number;
}

export interface SessionLog {
  id: string;
  grade: Grade;
  ts: number;
}

export interface Session {
  /** Every star the session was built from, by id — the faces to show. */
  stars: Record<string, DeckCard>;
  /** Learning steps in minutes; relearning steps likewise. */
  steps: Step[];
  relearnSteps: Step[];
  /** Due reviews still to show, soonest due first, then document order. */
  reviews: string[];
  /** New stars still to introduce, document order, already cut to the limit. */
  fresh: string[];
  /** Stars inside a learning step. */
  learning: LearningEntry[];
  /** Reviews shown since the last new star — the 4:1 interleave's counter. */
  sinceNew: number;
  /** How many new stars have been introduced (shown once) this session —
   *  what the client adds to the day's counter. */
  introduced: number;
  /** Stars that left the session for good (graduated, reviewed, skipped). */
  done: number;
  /** Ids the reader graded "again" at least once — the summary's list. */
  again: string[];
  log: SessionLog[];
  /** Epoch ms the session began. */
  startedAt: number;
}

export interface SessionOptions {
  /** Learning steps in minutes (the fence's `steps:`). */
  steps?: Step[];
  relearnSteps?: Step[];
  /** New stars this session may introduce — the day's remaining allowance. */
  newLimit: number;
  /** Include stars whose schedule is not yet due, as reviews ("study ahead"). */
  studyAhead?: boolean;
}

/** What the session shows next. `early` is true when only stars inside a
 *  step remain and the soonest is being shown before its step elapsed —
 *  Anki does the same rather than make the reader watch a clock. */
export interface NextCard {
  star: DeckCard;
  phase: Phase;
  early: boolean;
}

/** What a grade would mean for the star, for the four buttons: a step in
 *  minutes, or the SM-2 interval in days. */
export type IntervalPreview = { minutes: number } | { days: number };

export interface GradeResult {
  session: Session;
  /** The schedule to write into the note, or null when the star only moved
   *  a step and the note is untouched. */
  write: Schedule | null;
}

const REVIEWS_PER_NEW = 4;

/** A session over `stars` (document order) for `today`. */
export function createSession(stars: readonly DeckCard[], today: string, now: number, options: SessionOptions): Session {
  const byId: Record<string, DeckCard> = {};
  const due: DeckCard[] = [];
  const fresh: string[] = [];
  for (const star of stars) {
    if (byId[star.id]) continue;
    byId[star.id] = star;
    if (star.schedule === null) fresh.push(star.id);
    else if (options.studyAhead || isDue(star.schedule, today)) due.push(star);
  }
  // Soonest due first; a stable sort keeps document order among equals.
  const reviews = due
    .map((star, order) => ({ star, order }))
    .sort((a, b) => a.star.schedule!.due.localeCompare(b.star.schedule!.due) || a.order - b.order)
    .map((r) => r.star.id);
  const limit = Math.max(0, Math.floor(options.newLimit));
  return {
    stars: byId,
    steps: options.steps && options.steps.length > 0 ? options.steps.slice() : DEFAULT_STEPS.slice(),
    relearnSteps: options.relearnSteps && options.relearnSteps.length > 0 ? options.relearnSteps.slice() : RELEARN_STEPS.slice(),
    reviews,
    fresh: fresh.slice(0, limit),
    learning: [],
    sinceNew: 0,
    introduced: 0,
    done: 0,
    again: [],
    log: [],
    startedAt: now,
  };
}

/** The star to show now, or null when the session is over.
 *
 *  Order: a learning star whose step has elapsed (the soonest first) →
 *  a due review → a new star; and after every four reviews one new star is
 *  slipped in so the new ones are not all left for the end. When only
 *  stars inside a step remain, the soonest is shown early. */
export function nextCard(session: Session, now: number): NextCard | null {
  const ready = soonest(session.learning.filter((e) => e.dueAt <= now));
  if (ready) return { star: session.stars[ready.id], phase: ready.phase, early: false };
  const hasReviews = session.reviews.length > 0;
  const hasFresh = session.fresh.length > 0;
  if (hasReviews && (session.sinceNew < REVIEWS_PER_NEW || !hasFresh)) {
    return { star: session.stars[session.reviews[0]], phase: "review", early: false };
  }
  if (hasFresh) return { star: session.stars[session.fresh[0]], phase: "new", early: false };
  if (hasReviews) return { star: session.stars[session.reviews[0]], phase: "review", early: false };
  const waiting = soonest(session.learning);
  if (waiting) return { star: session.stars[waiting.id], phase: waiting.phase, early: true };
  return null;
}

function soonest(entries: LearningEntry[]): LearningEntry | null {
  let best: LearningEntry | null = null;
  for (const entry of entries) if (best === null || entry.dueAt < best.dueAt) best = entry;
  return best;
}

/** How many milliseconds until the next learning step elapses, when the
 *  session has nothing but waiting stars — the client's timer. Null when
 *  there is something to show now or nothing at all. */
export function waitFor(session: Session, now: number): number | null {
  const next = nextCard(session, now);
  if (!next || !next.early) return null;
  const entry = soonest(session.learning);
  return entry ? Math.max(0, entry.dueAt - now) : null;
}

/** The phase a star is in right now. */
export function phaseOf(session: Session, id: string): Phase | null {
  const entry = session.learning.find((e) => e.id === id);
  if (entry) return entry.phase;
  if (session.reviews.includes(id)) return "review";
  if (session.fresh.includes(id)) return "new";
  return null;
}

/** What each grade would do to the star, for the buttons. A star in a
 *  step reads its steps ("1m", "10m") and graduates into SM-2's first
 *  intervals; a review reads SM-2 straight. */
export function previews(session: Session, id: string, today: string): Record<Grade, IntervalPreview> | null {
  const star = session.stars[id];
  const phase = phaseOf(session, id);
  if (!star || phase === null) return null;
  if (phase === "review") {
    const at = (grade: Grade): IntervalPreview => ({ days: review(star.schedule, grade, today).interval });
    return { again: { minutes: session.relearnSteps[0] }, hard: at("hard"), good: at("good"), easy: at("easy") };
  }
  const relearn = phase === "relearning";
  const steps = relearn ? session.relearnSteps : session.steps;
  const step = session.learning.find((e) => e.id === id)?.step ?? 0;
  const graduate = (grade: "good" | "easy"): IntervalPreview =>
    relearn ? { days: star.schedule?.interval ?? 1 } : { days: review(null, grade, today).interval };
  return {
    again: { minutes: steps[0] },
    hard: { minutes: steps[step] },
    good: step + 1 < steps.length ? { minutes: steps[step + 1] } : graduate("good"),
    easy: graduate("easy"),
  };
}

/** The reader graded the star. Returns the new session and, when the star
 *  graduated or was reviewed, the schedule the note must now hold.
 *
 *  A LAPSE — "again" on a review — writes SM-2's own answer (one day, ease
 *  down 200) at once and keeps the star in the relearning step, so the
 *  note is right even if the page closes mid-step. Graduating relearning
 *  writes nothing more: the lapse already did. */
export function gradeCard(session: Session, id: string, grade: Grade, now: number, today: string): GradeResult {
  const star = session.stars[id];
  const phase = phaseOf(session, id);
  if (!star || phase === null) return { session, write: null };
  const log = [...session.log, { id, grade, ts: now }];
  const again = grade === "again" && !session.again.includes(id) ? [...session.again, id] : session.again;
  const base: Session = { ...session, log, again };

  if (phase === "review") {
    const schedule = review(star.schedule, grade, today);
    const reviews = base.reviews.filter((r) => r !== id);
    const stars = { ...base.stars, [id]: { ...star, schedule } };
    if (grade === "again") {
      const entry: LearningEntry = { id, phase: "relearning", step: 0, dueAt: now + base.relearnSteps[0] * 60_000 };
      return { session: { ...base, stars, reviews, sinceNew: base.sinceNew + 1, learning: [...base.learning, entry] }, write: schedule };
    }
    return { session: { ...base, stars, reviews, sinceNew: base.sinceNew + 1, done: base.done + 1 }, write: schedule };
  }

  // A new star being met, or a star inside its steps.
  const relearn = phase === "relearning";
  const steps = relearn ? base.relearnSteps : base.steps;
  const current = base.learning.find((e) => e.id === id);
  const step = current?.step ?? 0;
  const others = base.learning.filter((e) => e.id !== id);
  const fresh = phase === "new" ? base.fresh.filter((f) => f !== id) : base.fresh;
  const introduced = phase === "new" ? base.introduced + 1 : base.introduced;
  const sinceNew = phase === "new" ? 0 : base.sinceNew;
  const entryPhase: "learning" | "relearning" = relearn ? "relearning" : "learning";
  const at = (index: number): LearningEntry => ({ id, phase: entryPhase, step: index, dueAt: now + steps[index] * 60_000 });

  if (grade === "again") {
    return { session: { ...base, fresh, introduced, sinceNew, learning: [...others, at(0)] }, write: null };
  }
  if (grade === "hard") {
    return { session: { ...base, fresh, introduced, sinceNew, learning: [...others, at(step)] }, write: null };
  }
  if (grade === "good" && step + 1 < steps.length) {
    return { session: { ...base, fresh, introduced, sinceNew, learning: [...others, at(step + 1)] }, write: null };
  }
  // Graduation. A relearning star already carries the lapse's schedule.
  const write = relearn ? null : review(null, grade, today);
  const stars = write ? { ...base.stars, [id]: { ...star, schedule: write } } : base.stars;
  return { session: { ...base, stars, fresh, introduced, sinceNew, learning: others, done: base.done + 1 }, write };
}

/** Bury the star for this session: it leaves every queue and is not
 *  counted as done. A skipped new star was not introduced. */
export function skipCard(session: Session, id: string): Session {
  return {
    ...session,
    reviews: session.reviews.filter((r) => r !== id),
    fresh: session.fresh.filter((f) => f !== id),
    learning: session.learning.filter((e) => e.id !== id),
  };
}

/** Stars still in the session, by queue — the progress bar's numbers. */
export function remaining(session: Session): { review: number; new: number; learning: number; total: number } {
  const counts = { review: session.reviews.length, new: session.fresh.length, learning: session.learning.length, total: 0 };
  counts.total = counts.review + counts.new + counts.learning;
  return counts;
}

/** Good and easy over every grade in the log — the session's retention,
 *  0–1, or null when nothing was graded. */
export function retention(log: readonly SessionLog[]): number | null {
  if (log.length === 0) return null;
  const kept = log.filter((e) => e.grade === "good" || e.grade === "easy").length;
  return kept / log.length;
}
