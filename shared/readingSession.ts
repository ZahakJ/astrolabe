// THE READING SESSION CLOCK. A sitting with a book, counted from its page
// turns and nothing else.
//
// The PDF reader has no "start session" button, and it must not need one:
// nobody presses a button before they read, and a timer that runs from the
// moment the book opens counts the cup of tea, the phone call and the tab
// left open overnight. So the clock is QUIET. It starts on the first page
// turn, it counts the time between turns, and it stops counting once three
// minutes pass without one — a page nobody has turned in three minutes is a
// page nobody is reading. The last three minutes before the pause DO count:
// a long page read slowly is still read, and "paused after three minutes"
// is the promise the docs make.
//
// What a session says at the end: the pages FINISHED (every page turned away
// from — not the span, which would count a jump to the index as a hundred
// pages read), the first and last page, and the minutes counted. A page
// flipped past in under a few seconds was not read and is not counted,
// which is what keeps a fast scroll through a chapter from logging the
// chapter.
//
// Pure, and a value: the reader keeps one of these in a ref and hands it
// timestamps, tests hand it numbers. Nothing here knows a DOM, a clock or a
// book. The reader also stashes it in localStorage between turns, so a tab
// closed mid-sitting is logged the next time the same book opens rather
// than lost — the stash is this object, serialised.

/** Three minutes without a turn, and the clock stops counting. */
export const IDLE_MS = 3 * 60_000;

/** A page left sooner than this was flipped past, not read. Four seconds
 *  is under the time it takes to find one's place on a new page, and over
 *  the time a scroll takes to cross one. */
export const DWELL_MS = 4_000;

export interface SessionClock {
  /** When the first turn happened; null while the reader is still on the
   *  page the book opened at. A session with no turn is no session. */
  startedAt: number | null;
  /** The last turn (or the open), from which the next gap is measured. */
  lastTurnAt: number;
  /** The pages on screen since `lastTurnAt` — one, or two in a spread. */
  showing: number[];
  /** Milliseconds counted so far. */
  activeMs: number;
  /** The page the sitting began on: the first page turned away from. */
  from: number | null;
  /** Every page finished, in the order finished, no repeats. */
  read: number[];
}

/** A clock for a book that has just opened on `pages`. */
export function openClock(pages: number[], now: number): SessionClock {
  return { startedAt: null, lastTurnAt: now, showing: [...pages], activeMs: 0, from: null, read: [] };
}

/** The reader is now looking at `pages`. Returns a NEW clock; the old one
 *  is untouched (a ref swap, and the tests read like arithmetic). A "turn"
 *  onto the same pages is not a turn. */
export function turnClock(clock: SessionClock, pages: number[], now: number): SessionClock {
  if (samePages(clock.showing, pages)) return clock;
  const gap = Math.max(0, now - clock.lastTurnAt);
  const started = clock.startedAt !== null;
  // The time counted is the time between turns, capped at the idle limit:
  // a gap longer than that was a pause, and only its first three minutes
  // were reading. The gap before the FIRST turn counts on the same terms —
  // the sitting begins with this turn, but the page being left was read in
  // the minutes before it, and a session that dropped them would owe the
  // reader its first page every time.
  const activeMs = clock.activeMs + Math.min(gap, IDLE_MS);
  const read = [...clock.read];
  // The pages being left count as finished when the reader stayed on them
  // long enough to have read them. Before the first turn the dwell is the
  // whole time since the open, which is what it should be.
  if (gap >= DWELL_MS) {
    for (const p of clock.showing) if (!read.includes(p)) read.push(p);
  }
  return {
    startedAt: started ? clock.startedAt : now,
    lastTurnAt: now,
    showing: [...pages],
    activeMs,
    from: clock.from ?? (clock.showing[0] ?? null),
    read,
  };
}

/** What the sitting adds up to at `now`. The pages on screen at the end
 *  are NOT counted (nobody turned away from them) but the time on them is,
 *  up to the idle limit. Null when there was no sitting: no turn at all,
 *  or one that finished no page. */
export interface SessionSummary {
  pages: number;
  minutes: number;
  from: number;
  to: number;
}

export function summarizeClock(clock: SessionClock, now: number): SessionSummary | null {
  if (clock.startedAt === null) return null;
  const tail = Math.min(Math.max(0, now - clock.lastTurnAt), IDLE_MS);
  const pages = clock.read.length;
  if (pages === 0) return null;
  const minutes = Math.max(1, Math.round((clock.activeMs + tail) / 60_000));
  const last = clock.showing[clock.showing.length - 1] ?? clock.read[clock.read.length - 1];
  return { pages, minutes, from: clock.from ?? clock.read[0], to: last };
}

/** True while the clock is running: a turn has happened and the last one
 *  is within the idle limit. The reader's status line shows the timer only
 *  then, so a paused clock is not a lie about reading. */
export function clockRunning(clock: SessionClock, now: number): boolean {
  return clock.startedAt !== null && now - clock.lastTurnAt < IDLE_MS;
}

/** The minutes the clock would report if it ended now — the status line's
 *  number. Zero before the first turn. */
export function clockMinutes(clock: SessionClock, now: number): number {
  if (clock.startedAt === null) return 0;
  const tail = Math.min(Math.max(0, now - clock.lastTurnAt), IDLE_MS);
  return Math.floor((clock.activeMs + tail) / 60_000);
}

/** A clock read back from a stash: the shape checked field by field, since
 *  localStorage is where hand edits and older versions live. Null for
 *  anything that is not a clock. */
export function parseClock(raw: unknown): SessionClock | null {
  if (typeof raw !== "object" || raw === null) return null;
  const c = raw as Record<string, unknown>;
  const nums = (v: unknown): number[] | null => (Array.isArray(v) && v.every((n) => typeof n === "number" && Number.isFinite(n)) ? (v as number[]) : null);
  const showing = nums(c.showing);
  const read = nums(c.read);
  if (showing === null || read === null) return null;
  if (typeof c.lastTurnAt !== "number" || typeof c.activeMs !== "number") return null;
  if (c.startedAt !== null && typeof c.startedAt !== "number") return null;
  if (c.from !== null && typeof c.from !== "number") return null;
  return { startedAt: c.startedAt as number | null, lastTurnAt: c.lastTurnAt, showing, activeMs: c.activeMs, from: c.from as number | null, read };
}

function samePages(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((p, i) => p === b[i]);
}
