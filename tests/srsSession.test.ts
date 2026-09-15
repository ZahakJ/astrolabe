import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Star } from "../shared/constellations.ts";
import type { Schedule } from "../shared/srs.ts";
import { createSession, gradeStar, nextStar, phaseOf, previews, remaining, retention, skipStar, waitFor, type Session } from "../shared/srsSession.ts";

const TODAY = "2026-09-28";
const T0 = Date.UTC(2026, 8, 28, 9, 0, 0);
const MIN = 60_000;

function star(n: number, schedule: Schedule | null = null): Star {
  return { id: `k.md#${n}#fwd`, path: "k.md", line: n, end: n, dir: "fwd", kind: "qa", front: `f${n}`, back: `b${n}`, extra: null, section: null, tags: [], schedule };
}
const due = (day: string, interval = 6): Schedule => ({ due: day, interval, ease: 2500 });

/** Grade whatever is next; returns the new session and what was written. */
function step(s: Session, grade: "again" | "hard" | "good" | "easy", now: number): { session: Session; write: Schedule | null; id: string } {
  const next = nextStar(s, now);
  assert.ok(next, "nothing to show");
  const r = gradeStar(s, next.star.id, grade, now, TODAY);
  return { ...r, id: next.star.id };
}

describe("a session's queues", () => {
  it("shows due reviews soonest-due first, then new cards in document order, up to the limit", () => {
    const stars = [star(1), star(2, due("2026-09-27")), star(3, due("2026-09-20")), star(4, due("2026-10-05")), star(5), star(6)];
    const s = createSession(stars, TODAY, T0, { newLimit: 2 });
    assert.deepEqual(s.reviews, ["k.md#3#fwd", "k.md#2#fwd"]);
    assert.deepEqual(s.fresh, ["k.md#1#fwd", "k.md#5#fwd"]);
    assert.deepEqual(remaining(s), { review: 2, new: 2, learning: 0, total: 4 });
    assert.equal(nextStar(s, T0)!.star.id, "k.md#3#fwd");
    assert.equal(nextStar(s, T0)!.phase, "review");
    // Study ahead brings the not-yet-due one in, after the due ones.
    const ahead = createSession(stars, TODAY, T0, { newLimit: 0, studyAhead: true });
    assert.deepEqual(ahead.reviews, ["k.md#3#fwd", "k.md#2#fwd", "k.md#4#fwd"]);
    assert.deepEqual(ahead.fresh, []);
  });

  it("slips one new star in after every four reviews", () => {
    const stars = [star(1), star(2), ...[3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => star(n, due("2026-09-27")))];
    let s = createSession(stars, TODAY, T0, { newLimit: 10 });
    const shown: string[] = [];
    for (let i = 0; i < 11; i++) {
      const r = step(s, "easy", T0 + i * MIN);
      shown.push(r.id);
      s = r.session;
    }
    assert.deepEqual(shown, ["k.md#3#fwd", "k.md#4#fwd", "k.md#5#fwd", "k.md#6#fwd", "k.md#1#fwd", "k.md#7#fwd", "k.md#8#fwd", "k.md#9#fwd", "k.md#10#fwd", "k.md#2#fwd", "k.md#11#fwd"]);
    assert.equal(nextStar(s, T0 + 12 * MIN), null);
    assert.equal(s.introduced, 2);
    assert.equal(s.done, 11);
  });
});

describe("learning steps", () => {
  it("walks a new star through 1m and 10m and graduates to one day on good", () => {
    let s = createSession([star(1)], TODAY, T0, { newLimit: 10, steps: [1, 10] });
    assert.deepEqual(previews(s, "k.md#1#fwd", TODAY), { again: { minutes: 1 }, hard: { minutes: 1 }, good: { minutes: 10 }, easy: { days: 4 } });
    let r = step(s, "good", T0);
    s = r.session;
    assert.equal(r.write, null);
    assert.equal(phaseOf(s, "k.md#1#fwd"), "learning");
    assert.equal(s.introduced, 1);
    assert.deepEqual(previews(s, "k.md#1#fwd", TODAY), { again: { minutes: 1 }, hard: { minutes: 10 }, good: { days: 1 }, easy: { days: 4 } });
    // Not due for ten minutes: shown early only because nothing else remains.
    assert.equal(nextStar(s, T0 + MIN)!.early, true);
    assert.equal(waitFor(s, T0 + MIN), 9 * MIN);
    assert.equal(nextStar(s, T0 + 10 * MIN)!.early, false);
    assert.equal(waitFor(s, T0 + 10 * MIN), null);
    r = step(s, "good", T0 + 10 * MIN);
    s = r.session;
    assert.deepEqual(r.write, { due: "2026-09-29", interval: 1, ease: 2500 });
    assert.equal(nextStar(s, T0 + 11 * MIN), null);
    assert.equal(s.done, 1);
    assert.deepEqual(s.stars["k.md#1#fwd"].schedule, r.write);
  });

  it("again restarts the steps, hard repeats one, easy graduates at once to four days", () => {
    let s = createSession([star(1)], TODAY, T0, { newLimit: 10, steps: [1, 10] });
    s = step(s, "good", T0).session; // → step 1 (10m)
    let r = step(s, "again", T0 + 10 * MIN);
    s = r.session;
    assert.equal(r.write, null);
    assert.equal(s.learning[0].step, 0);
    assert.equal(s.learning[0].dueAt, T0 + 11 * MIN);
    assert.deepEqual(s.again, ["k.md#1#fwd"]);
    r = step(s, "hard", T0 + 11 * MIN);
    s = r.session;
    assert.equal(s.learning[0].step, 0);
    assert.equal(s.learning[0].dueAt, T0 + 12 * MIN);
    r = step(s, "easy", T0 + 12 * MIN);
    assert.deepEqual(r.write, { due: "2026-10-02", interval: 4, ease: 2650 });
    assert.equal(nextStar(r.session, T0 + 13 * MIN), null);
  });

  it("a due learning star comes before every review and every new star", () => {
    const stars = [star(1), star(2, due("2026-09-27")), star(3, due("2026-09-27"))];
    let s = createSession(stars, TODAY, T0, { newLimit: 10, steps: [1, 10] });
    s = step(s, "good", T0).session; // review 2
    s = step(s, "good", T0).session; // review 3
    s = step(s, "good", T0).session; // new 1 → learning, due at +10m
    assert.equal(nextStar(s, T0 + 10 * MIN)!.star.id, "k.md#1#fwd");
    const withMore = createSession([star(4), ...stars], TODAY, T0, { newLimit: 10 });
    let w = step(withMore, "good", T0).session; // review 2
    // 4 is new; 1 is new; the learning one, once due, outranks both.
    w = { ...w, learning: [{ id: "k.md#3#fwd", phase: "learning", step: 1, dueAt: T0 + MIN }], reviews: [] };
    assert.equal(nextStar(w, T0)!.star.id, "k.md#4#fwd");
    assert.equal(nextStar(w, T0 + MIN)!.star.id, "k.md#3#fwd");
  });
});

describe("lapses", () => {
  it("writes SM-2's again at once and relearns for ten minutes", () => {
    let s = createSession([star(1, due("2026-09-27", 15))], TODAY, T0, { newLimit: 0 });
    assert.deepEqual(previews(s, "k.md#1#fwd", TODAY), { again: { minutes: 10 }, hard: { days: 18 }, good: { days: 38 }, easy: { days: 52 } });
    let r = step(s, "again", T0);
    s = r.session;
    assert.deepEqual(r.write, { due: "2026-09-29", interval: 1, ease: 2300 });
    assert.equal(phaseOf(s, "k.md#1#fwd"), "relearning");
    assert.equal(s.learning[0].dueAt, T0 + 10 * MIN);
    assert.equal(s.done, 0);
    assert.deepEqual(previews(s, "k.md#1#fwd", TODAY), { again: { minutes: 10 }, hard: { minutes: 10 }, good: { days: 1 }, easy: { days: 1 } });
    // Graduating relearning writes nothing more: the lapse already did.
    r = step(s, "good", T0 + 10 * MIN);
    assert.equal(r.write, null);
    assert.equal(r.session.done, 1);
    assert.equal(nextStar(r.session, T0 + 11 * MIN), null);
  });

  it("good, hard and easy on a review write SM-2 and finish the star", () => {
    const s = createSession([star(1, due("2026-09-27", 6)), star(2, due("2026-09-27", 6))], TODAY, T0, { newLimit: 0 });
    const r = gradeStar(s, "k.md#1#fwd", "hard", T0, TODAY);
    assert.deepEqual(r.write, { due: "2026-10-05", interval: 7, ease: 2350 });
    assert.deepEqual(r.session.reviews, ["k.md#2#fwd"]);
    assert.equal(r.session.done, 1);
    assert.equal(r.session.sinceNew, 1);
  });
});

describe("the rest of a session", () => {
  it("skips, counts, tells retention, ignores an unknown star, and never mutates", () => {
    const stars = [star(1), star(2, due("2026-09-27"))];
    const s = createSession(stars, TODAY, T0, { newLimit: 10 });
    const skipped = skipStar(s, "k.md#2#fwd");
    assert.deepEqual(remaining(skipped), { review: 0, new: 1, learning: 0, total: 1 });
    assert.deepEqual(remaining(s), { review: 1, new: 1, learning: 0, total: 2 });
    assert.equal(gradeStar(s, "nope", "good", T0, TODAY).session, s);
    assert.equal(phaseOf(s, "nope"), null);
    assert.equal(previews(s, "nope", TODAY), null);
    assert.equal(retention([]), null);
    let t = s;
    t = gradeStar(t, "k.md#2#fwd", "good", T0, TODAY).session;
    t = gradeStar(t, "k.md#1#fwd", "again", T0, TODAY).session;
    t = gradeStar(t, "k.md#1#fwd", "easy", T0 + MIN, TODAY).session;
    assert.equal(retention(t.log), 2 / 3);
    assert.deepEqual(s.reviews, ["k.md#2#fwd"]);
    assert.equal(s.log.length, 0);
    assert.equal(nextStar(createSession([], TODAY, T0, { newLimit: 10 }), T0), null);
  });
});
