// WHAT TO DO WHEN A SAVE IS REFUSED AND THE DISK WILL NOT ANSWER.
//
// THE BUG this exists to end (v1.8 client-solidity audit, finding B1): the save
// path answered a 409 by re-reading the note, and the re-read was written
// `getNote(path).catch(() => null)`. When it returned null the branch simply
// returned — no `onDiverge`, no `onSaveError`, nothing. `baseMtimeMs` stayed
// stale, so EVERY later autosave 409'd the same way and returned the same way,
// in silence, forever. The tab kept its dirty dot, the reader kept typing, and
// the `beforeunload` beacon carried the same stale precondition the server had
// been refusing all along — so the text went nowhere, and the only notice
// anybody got was the note being an hour behind the next time they opened it.
//
// The answer is not "try once more". A 409 we cannot re-base on is a TRANSIENT
// state with a wide range of durations — a server restarting (seconds), a
// laptop's wifi coming back (a minute), a session that expired and needs a
// login (as long as the reader takes). So: retry, back off, and SPEAK — first
// immediately, so the reader learns while it is still one sentence; then again
// once the backoff has reached its ceiling, because by then this has stopped
// being a blip; then at long intervals, because a message every fifteen seconds
// is a message nobody reads.
//
// It is a pure function with a test, like `revalidate.ts` beside it, for the
// same reason: this is a POLICY, and a policy buried in four `if`s inside an
// async catch is a policy nobody can check.

/** The escalating waits, in ms. The last one is the ceiling and repeats. */
const WAITS = [1_000, 2_000, 4_000, 8_000, 15_000];

/** Which attempt first waits the ceiling — the moment "the disk is briefly
 *  busy" becomes "something is wrong", and worth saying a second time. */
const CEILING = WAITS.length - 1;

/** How many ceiling-length attempts pass between the later announcements.
 *  Eight × 15s ≈ two minutes: often enough that a reader who walked away comes
 *  back to a live message, rare enough that it is not a heartbeat. */
const REANNOUNCE_EVERY = 8;

export interface RetryStep {
  /** How long to wait before trying the write again. */
  waitMs: number;
  /** Whether the reader is told about THIS attempt. */
  announce: boolean;
}

/** The plan for retry number `attempt` (0 = the first failure). Never gives
 *  up: the buffer still holds the reader's only copy of the text, and a client
 *  that stops trying has decided on their behalf that the server is not coming
 *  back. Backing off to a quiet 15s costs nothing and recovers by itself the
 *  moment it can. */
export function staleRetryStep(attempt: number): RetryStep {
  const i = Math.min(Math.max(attempt, 0), CEILING);
  const announce =
    attempt <= 0 || attempt === CEILING || (attempt > CEILING && (attempt - CEILING) % REANNOUNCE_EVERY === 0);
  return { waitMs: WAITS[i], announce };
}

/** WHETHER A WRITE THAT SIMPLY DID NOT LAND IS WORTH TRYING AGAIN BY ITSELF.
 *
 *  The bug (2026-11 purge, E1): a save that failed because the server was
 *  down — a restart, a dropped wifi — was announced once and then left alone,
 *  "the next edit reschedules the save". A reader who had stopped typing came
 *  back to a server that had been up for minutes and a note on disk without
 *  their last paragraph; the text lived only in the tab, and closing it or a
 *  crash lost it. Waiting fixes most failures, so most failures retry on the
 *  same backoff as the stale case above:
 *
 *   - no status at all: the request never got an answer (network, server down);
 *   - 5xx: the server answered and failed — it may not next time;
 *   - 401 / 403: the session lapsed; signing in again in any tab revives it;
 *   - 408 / 429: the server asked for time.
 *
 *  What waiting cannot fix is a request the server will refuse forever as
 *  written (413 too large, 400 malformed, 404 a path it will not create):
 *  those are said once and wait for the reader, as before. */
export function retriesOnItsOwn(status: number | undefined): boolean {
  if (status === undefined) return true;
  if (status >= 500) return true;
  return status === 401 || status === 403 || status === 408 || status === 429;
}
