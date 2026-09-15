// THE SESSION'S QUEUE: shared/srsSession.ts's machine, held for one page.
//
// The session view asks this for the next star, hands it each grade, and
// reads its summary at the end; everything it knows that the shared machine
// does not is the plumbing of a browser — the daily new-star counter and
// the grade log in localStorage (client/stars/log.ts), the one-level undo,
// and the clock. No React in here, so the rules can be read in one place
// and the view stays a view.
//
// STARS ARE KEYED BY THEIR TEXT, NOT THEIR LINE. The first grade on a
// `?` block or a cloze writes a comment LINE into the note and every star
// below it moves down one; a queue keyed by line would lose its place on the
// re-read that follows. The note, the direction, the kind and the two faces
// are stable until the reader edits them — and an edited star is a new
// star. Two stars that share all of that (`dog::chien` under one heading,
// `dog::perro` under the next; the same phrase highlighted in two notes of
// the implicit constellation) are told apart by their ORDER in the note,
// which a comment line does not change either. `refresh()` swaps in the
// re-read stars under the same keys and the walk goes on.

import type { ConstellationMeta, Star, Step } from "../../shared/constellations.ts";
import { DEFAULT_NEW_PER_DAY, DEFAULT_STEPS } from "../../shared/constellations.ts";
import { isDue, type Grade, type Schedule } from "../../shared/srs.ts";
import { bury, grade as applyGrade, pick, preview, remaining, startSession, type Pick, type Preview, type SessionState } from "../../shared/srsSession.ts";
import { appendLog, countNew, dropLastLog, newIntroduced } from "./log.ts";

/** Session keys for a list of stars in document order: the same list on
 *  a later read yields the same keys, whatever the line numbers did. */
export function keysOf(stars: readonly Star[]): string[] {
  const seen = new Map<string, number>();
  return stars.map((s) => {
    const base = `${s.path}#${s.dir}#${s.kind}#${s.front}#${s.back}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}#${n}`;
  });
}

/** What the view needs to know about the constellation a session is over.
 *  The fence's steps and daily limit ride on the shelf's meta row when the
 *  server sends them (the implicit constellation has none); the defaults
 *  stand in otherwise, so a session never waits on a second request. */
export interface SessionHead {
  path: string;
  steps: Step[];
  newPerDay: number;
}

export function headOf(meta: ConstellationMeta & { steps?: Step[]; newPerDay?: number }): SessionHead {
  const steps = Array.isArray(meta.steps) && meta.steps.length > 0 ? meta.steps : DEFAULT_STEPS;
  const newPerDay = typeof meta.newPerDay === "number" && meta.newPerDay >= 0 ? meta.newPerDay : DEFAULT_NEW_PER_DAY;
  return { path: meta.path, steps, newPerDay };
}

interface Undo {
  state: SessionState;
  key: string;
  /** The schedule the star carried before the grade — what a restore
   *  writes back; null means "no comment yet". */
  before: Schedule | null;
  wrote: boolean;
  grade: Grade;
  countedNew: boolean;
}

export interface Graded {
  /** The session key — `starOf(key)` is the star AS THE LAST READ HAS IT,
   *  which is the line a write must name once an earlier write moved it. */
  key: string;
  star: Star;
  pick: Pick;
  grade: Grade;
  /** The schedule to write into the note, or null for a step move. */
  write: Schedule | null;
}

export class StarQueue {
  readonly head: SessionHead;
  readonly today: string;
  readonly ahead: boolean;
  readonly startedAt: number;
  private stars = new Map<string, Star>();
  private state: SessionState;
  private undo: Undo | null = null;
  /** The pick the reader is looking at, held until it is graded or skipped
   *  so a learning timer elapsing behind the card does not swap it. */
  private current: Pick | null = null;

  constructor(head: SessionHead, stars: Star[], today: string, ahead = false, now = Date.now()) {
    this.head = head;
    this.today = today;
    this.ahead = ahead;
    this.startedAt = now;
    this.refresh(stars);
    const allowed = Math.max(0, head.newPerDay - newIntroduced(head.path, today));
    this.state = startSession(this.keyed(stars), today, allowed, ahead);
  }

  /** Stars with their session key in place of the vault id — the machine
   *  never sees a line number. */
  private keyed(stars: Star[]): Star[] {
    const keys = keysOf(stars);
    return stars.map((s, i) => ({ ...s, id: keys[i] }));
  }

  /** A re-read of the note: faces and schedules refresh under the same
   *  keys; the order the reader is walking stays theirs. */
  refresh(stars: Star[]): void {
    const keys = keysOf(stars);
    this.stars = new Map(stars.map((s, i) => [keys[i], s]));
  }

  starOf(key: string): Star | null {
    return this.stars.get(key) ?? null;
  }

  /** The star to show now. A key whose star vanished between reads is
   *  dropped rather than shown as a blank. */
  next(now = Date.now()): { pick: Pick; star: Star } | null {
    if (this.current !== null) {
      const star = this.stars.get(this.current.id);
      if (star) return { pick: this.current, star };
      this.state = bury(this.state, this.current.id);
      this.current = null;
    }
    for (;;) {
      const p = pick(this.state, now);
      if (p === null) return null;
      const star = this.stars.get(p.id);
      if (star) {
        this.current = p;
        return { pick: p, star };
      }
      this.state = bury(this.state, p.id);
    }
  }

  /** A learning star not yet due, when the pick had to show it early: how
   *  long until its step elapses, for the view's small timer note. */
  earlyBy(now = Date.now()): number {
    if (this.current === null || this.current.kind !== "learning") return 0;
    const entry = this.state.learning.find((l) => l.id === this.current!.id);
    return entry ? Math.max(0, entry.dueAt - now) : 0;
  }

  previews(p: Pick, star: Star): Record<Grade, Preview> {
    const keyed = { ...star, id: p.id };
    return {
      again: preview(p, keyed, "again", this.today, this.head.steps),
      hard: preview(p, keyed, "hard", this.today, this.head.steps),
      good: preview(p, keyed, "good", this.today, this.head.steps),
      easy: preview(p, keyed, "easy", this.today, this.head.steps),
    };
  }

  grade(g: Grade, now = Date.now()): Graded | null {
    const cur = this.next(now);
    if (cur === null) return null;
    const { pick: p, star } = cur;
    const result = applyGrade(this.state, p, { ...star, id: p.id }, g, now, this.today, this.head.steps);
    const countedNew = p.kind === "new";
    this.undo = { state: this.state, key: p.id, before: star.schedule, wrote: result.write !== null, grade: g, countedNew };
    this.state = result.state;
    this.current = null;
    if (countedNew) countNew(this.head.path, this.today, 1);
    appendLog({ path: star.path, line: star.line, grade: g, ts: now });
    return { key: p.id, star, pick: p, grade: g, write: result.write };
  }

  /** Put the current star aside for this session. */
  skip(): void {
    if (this.current === null) return;
    this.state = bury(this.state, this.current.id);
    this.undo = null;
    this.current = null;
  }

  canUndo(): boolean {
    return this.undo !== null;
  }

  /** Take back the last grade: the queue returns to where it was, the log
   *  forgets the grade, and the caller is told what schedule to put back in
   *  the note (nothing, when the grade only moved a step). */
  undoLast(): { key: string; star: Star; wrote: boolean; grade: Grade; restore: Schedule | null } | null {
    const u = this.undo;
    if (u === null) return null;
    const star = this.stars.get(u.key);
    if (!star) return null;
    this.state = u.state;
    this.current = null;
    this.undo = null;
    if (u.countedNew) countNew(this.head.path, this.today, -1);
    dropLastLog(star.path, star.line);
    return { key: u.key, star, wrote: u.wrote, grade: u.grade, restore: u.before };
  }

  /** Progress: stars finished this session against the walk's length.
   *  "Finished" counts a star once, when it leaves the queue for good; a
   *  star mid-step is neither done nor unseen, so it sits in `remaining`. */
  progress(): { done: number; total: number } {
    const left = remaining(this.state);
    const finished = new Set(this.state.graded.map((g) => g.id));
    for (const l of this.state.learning) finished.delete(l.id);
    return { done: finished.size, total: finished.size + left };
  }

  /** `dueLeft` counts what is still due today after this walk: the reviews
   *  not reached, and the due ones the reader skipped — a skipped star is
   *  put aside for the session, not for the day. */
  summary(now = Date.now()): { graded: number; kept: number; again: Star[]; seconds: number; dueLeft: number } {
    const g = this.state.graded;
    const againKeys = new Set(g.filter((x) => x.grade === "again").map((x) => x.id));
    const again = [...againKeys].map((k) => this.stars.get(k)).filter((s): s is Star => s !== undefined);
    const kept = g.filter((x) => x.grade === "good" || x.grade === "easy").length;
    const skippedDue = this.state.buried.filter((k) => {
      const s = this.stars.get(k);
      return s !== undefined && s.schedule !== null && isDue(s.schedule, this.today);
    }).length;
    return { graded: g.length, kept, again, seconds: Math.round((now - this.startedAt) / 1000), dueLeft: this.state.reviews.length + skippedDue };
  }

  /** Keys of stars currently in a learning step — for the states chart. */
  learningKeys(): Set<string> {
    return new Set(this.state.learning.map((l) => l.id));
  }

  isEmpty(): boolean {
    return remaining(this.state) === 0;
  }
}
