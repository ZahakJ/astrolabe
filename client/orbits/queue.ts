// THE SESSION'S QUEUE: shared/srsSession.ts's machine, held for one page.
//
// The session view asks this for the next star, hands it each grade, and
// reads its summary at the end; everything it knows that the shared machine
// does not is the plumbing of a browser — the daily new-star counter and
// the grade log in localStorage (client/orbits/log.ts), the one-level undo,
// and the clock. No React in here, so the rules can be read in one place
// and the view stays a view. The machine's sessions are immutable, which is
// what makes undo one field: the session as it was before the grade.
//
// CARDS ARE KEYED BY THEIR TEXT, NOT THEIR LINE. The first grade on a
// `?` block or a cloze writes a comment LINE into the note and every star
// below it moves down one; a queue keyed by line would lose its place on the
// re-read that follows. The note, the direction, the kind and the two faces
// are stable until the reader edits them — and an edited star is a new
// star. Two stars that share all of that (`dog::chien` under one heading,
// `dog::perro` under the next; the same phrase highlighted in two notes of
// the implicit deck) are told apart by their ORDER in the note,
// which a comment line does not change either. `refresh()` swaps in the
// re-read stars under the same keys and the walk goes on.

import type { DeckMeta, DeckCard, Step } from "../../shared/decks.ts";
import { DEFAULT_NEW_PER_DAY, DEFAULT_STEPS } from "../../shared/decks.ts";
import { isDue, type Grade, type Schedule } from "../../shared/srs.ts";
import {
  createSession,
  gradeCard,
  nextCard,
  previews as previewsOf,
  remaining,
  skipCard,
  type IntervalPreview,
  type Phase,
  type Session,
} from "../../shared/srsSession.ts";
import { appendLog, countNew, dropLastLog, newIntroduced } from "./log.ts";

/** Why a star is in front of the reader: the machine's phase, and whether
 *  it was shown before its learning step elapsed (nothing else was left). */
export interface Pick {
  id: string;
  phase: Phase;
  early: boolean;
}

/** What a grade button promises: minutes inside the steps, days once SM-2
 *  takes over — the machine's own preview shape. */
export type Preview = IntervalPreview;

/** Session keys for a list of stars in document order: the same list on
 *  a later read yields the same keys, whatever the line numbers did. */
export function keysOf(stars: readonly DeckCard[]): string[] {
  const seen = new Map<string, number>();
  return stars.map((s) => {
    const base = `${s.path}#${s.dir}#${s.kind}#${s.front}#${s.back}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}#${n}`;
  });
}

/** What the view needs to know about the deck a session is over.
 *  The fence's steps and daily limit ride on the shelf's meta row when the
 *  server sends them (the implicit deck has none); the defaults
 *  stand in otherwise, so a session never waits on a second request. */
export interface SessionHead {
  path: string;
  steps: Step[];
  newPerDay: number;
}

export function headOf(meta: DeckMeta & { steps?: Step[]; newPerDay?: number }): SessionHead {
  const steps = Array.isArray(meta.steps) && meta.steps.length > 0 ? meta.steps : DEFAULT_STEPS;
  const newPerDay = typeof meta.newPerDay === "number" && meta.newPerDay >= 0 ? meta.newPerDay : DEFAULT_NEW_PER_DAY;
  return { path: meta.path, steps, newPerDay };
}

interface Undo {
  session: Session;
  key: string;
  /** The schedule the star carried before the grade — what a restore
   *  writes back; null means "no comment yet". */
  before: Schedule | null;
  wrote: boolean;
  grade: Grade;
  countedNew: boolean;
}

export interface Graded {
  /** The session key — `cardOf(key)` is the star AS THE LAST READ HAS IT,
   *  which is the line a write must name once an earlier write moved it. */
  key: string;
  star: DeckCard;
  pick: Pick;
  grade: Grade;
  /** The schedule to write into the note, or null for a step move. */
  write: Schedule | null;
}

export class CardQueue {
  readonly head: SessionHead;
  readonly today: string;
  readonly ahead: boolean;
  readonly startedAt: number;
  private stars = new Map<string, DeckCard>();
  private session: Session;
  private undo: Undo | null = null;
  /** Keys put aside for this walk ("Skip") — the summary still counts the
   *  due ones among what is left today. */
  private buried: string[] = [];
  /** The pick the reader is looking at, held until it is graded or skipped
   *  so a learning timer elapsing behind the card does not swap it. */
  private current: Pick | null = null;

  constructor(head: SessionHead, stars: DeckCard[], today: string, ahead = false, now = Date.now()) {
    this.head = head;
    this.today = today;
    this.ahead = ahead;
    this.startedAt = now;
    this.refresh(stars);
    // Study ahead is a walk over what is NOT due yet; the day's new stars
    // are the daily limit's business and never ride along with it.
    const allowed = ahead ? 0 : Math.max(0, head.newPerDay - newIntroduced(head.path, today));
    this.session = createSession(this.keyed(stars), today, now, { newLimit: allowed, steps: head.steps, studyAhead: ahead });
  }

  /** Stars with their session key in place of the vault id — the machine
   *  never sees a line number. */
  private keyed(stars: DeckCard[]): DeckCard[] {
    const keys = keysOf(stars);
    return stars.map((s, i) => ({ ...s, id: keys[i] }));
  }

  /** A re-read of the note: faces and schedules refresh under the same
   *  keys; the order the reader is walking stays theirs. */
  refresh(stars: DeckCard[]): void {
    const keys = keysOf(stars);
    this.stars = new Map(stars.map((s, i) => [keys[i], s]));
  }

  cardOf(key: string): DeckCard | null {
    return this.stars.get(key) ?? null;
  }

  /** The star to show now. A key whose star vanished between reads is
   *  dropped rather than shown as a blank. */
  next(now = Date.now()): { pick: Pick; star: DeckCard } | null {
    if (this.current !== null) {
      const star = this.stars.get(this.current.id);
      if (star) return { pick: this.current, star };
      this.session = skipCard(this.session, this.current.id);
      this.current = null;
    }
    for (;;) {
      const n = nextCard(this.session, now);
      if (n === null) return null;
      const star = this.stars.get(n.star.id);
      if (star) {
        this.current = { id: n.star.id, phase: n.phase, early: n.early };
        return { pick: this.current, star };
      }
      this.session = skipCard(this.session, n.star.id);
    }
  }

  /** A learning star not yet due, when the pick had to show it early: how
   *  long until its step elapses, for the view's small timer note. */
  earlyBy(now = Date.now()): number {
    if (this.current === null || !this.current.early) return 0;
    const entry = this.session.learning.find((l) => l.id === this.current!.id);
    return entry ? Math.max(0, entry.dueAt - now) : 0;
  }

  previews(p: Pick, star: DeckCard): Record<Grade, Preview> {
    const got = previewsOf(this.withStar(p.id, star), p.id, this.today);
    // A pick the machine no longer knows (never, in practice: the pick is
    // held until graded) previews as a plain new star would.
    return got ?? { again: { minutes: this.head.steps[0] }, hard: { minutes: this.head.steps[0] }, good: { minutes: this.head.steps[1] ?? this.head.steps[0] }, easy: { days: 4 } };
  }

  /** The session with the star AS THE LAST READ HAS IT: a schedule edited
   *  in the note since the walk began is what SM-2 must build on. */
  private withStar(key: string, star: DeckCard): Session {
    const known = this.session.stars[key];
    if (known && known.schedule === star.schedule) return this.session;
    return { ...this.session, stars: { ...this.session.stars, [key]: { ...star, id: key } } };
  }

  grade(g: Grade, now = Date.now()): Graded | null {
    const cur = this.next(now);
    if (cur === null) return null;
    const { pick: p, star } = cur;
    const before = this.session;
    const result = gradeCard(this.withStar(p.id, star), p.id, g, now, this.today);
    const countedNew = p.phase === "new";
    this.undo = { session: before, key: p.id, before: star.schedule, wrote: result.write !== null, grade: g, countedNew };
    this.session = result.session;
    this.current = null;
    if (countedNew) countNew(this.head.path, this.today, 1);
    appendLog({ path: star.path, line: star.line, grade: g, ts: now });
    return { key: p.id, star, pick: p, grade: g, write: result.write };
  }

  /** Put the current star aside for this session. */
  skip(): void {
    if (this.current === null) return;
    this.session = skipCard(this.session, this.current.id);
    this.buried.push(this.current.id);
    this.undo = null;
    this.current = null;
  }

  canUndo(): boolean {
    return this.undo !== null;
  }

  /** Take back the last grade: the queue returns to where it was, the log
   *  forgets the grade, and the caller is told what schedule to put back in
   *  the note (nothing, when the grade only moved a step). */
  undoLast(): { key: string; star: DeckCard; wrote: boolean; grade: Grade; restore: Schedule | null } | null {
    const u = this.undo;
    if (u === null) return null;
    const star = this.stars.get(u.key);
    if (!star) return null;
    this.session = u.session;
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
    const left = remaining(this.session).total;
    return { done: this.session.done, total: this.session.done + left };
  }

  /** `dueLeft` counts what is still due today after this walk: the reviews
   *  not reached, and the due ones the reader skipped — a skipped star is
   *  put aside for the session, not for the day. */
  summary(now = Date.now()): { graded: number; kept: number; again: DeckCard[]; seconds: number; dueLeft: number } {
    const log = this.session.log;
    const again = this.session.again.map((k) => this.stars.get(k)).filter((s): s is DeckCard => s !== undefined);
    const kept = log.filter((x) => x.grade === "good" || x.grade === "easy").length;
    const skippedDue = this.buried.filter((k) => {
      const s = this.stars.get(k);
      return s !== undefined && s.schedule !== null && isDue(s.schedule, this.today);
    }).length;
    return { graded: log.length, kept, again, seconds: Math.round((now - this.startedAt) / 1000), dueLeft: this.session.reviews.length + skippedDue };
  }

  /** Keys of stars currently in a learning step — for the states chart. */
  learningKeys(): Set<string> {
    return new Set(this.session.learning.map((l) => l.id));
  }

  isEmpty(): boolean {
    return remaining(this.session).total === 0;
  }
}
