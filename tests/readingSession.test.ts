// The reading session clock (shared/readingSession.ts): starts on the
// first turn, pauses after three minutes, counts the pages turned away
// from, and reads back from a stash. Arithmetic, and therefore here.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DWELL_MS, IDLE_MS, clockMinutes, clockRunning, openClock, parseClock, summarizeClock, turnClock } from "../shared/readingSession.ts";

const MIN = 60_000;

describe("the session clock", () => {
  it("is no session until a page is turned, and counts the pages left behind", () => {
    let c = openClock([112], 0);
    assert.equal(summarizeClock(c, 5 * MIN), null);
    assert.equal(clockRunning(c, MIN), false);
    c = turnClock(c, [113], 2 * MIN);
    c = turnClock(c, [114], 4 * MIN);
    // Two pages finished (112, 113); 114 is on screen, not finished.
    assert.deepEqual(summarizeClock(c, 5 * MIN), { pages: 2, minutes: 5, from: 112, to: 114 });
    assert.equal(clockRunning(c, 5 * MIN), true);
    assert.equal(clockMinutes(c, 5 * MIN), 5);
  });
  it("pauses after three minutes without a turn, counting only those three", () => {
    let c = openClock([1], 0);
    c = turnClock(c, [2], MIN);
    // Twenty minutes away, then back: only the idle limit was reading.
    c = turnClock(c, [3], 21 * MIN);
    assert.equal(clockRunning(c, 21 * MIN + 1), true);
    assert.equal(clockRunning(c, 21 * MIN + IDLE_MS), false);
    assert.deepEqual(summarizeClock(c, 21 * MIN)?.minutes, 1 + 3);
    // The tail after the last turn is capped the same way.
    assert.deepEqual(summarizeClock(c, 60 * MIN)?.minutes, 1 + 3 + 3);
  });
  it("does not count a page flipped past, nor a turn onto the same pages", () => {
    let c = openClock([1], 0);
    c = turnClock(c, [2], DWELL_MS - 1);
    c = turnClock(c, [2], DWELL_MS + 10);
    c = turnClock(c, [3], 2 * DWELL_MS);
    assert.deepEqual(summarizeClock(c, 3 * DWELL_MS)?.pages, 1);
    // A jump to the index finishes one page, not two hundred.
    let j = openClock([10], 0);
    j = turnClock(j, [300], MIN);
    j = turnClock(j, [11], 2 * MIN);
    assert.deepEqual(summarizeClock(j, 3 * MIN), { pages: 2, minutes: 3, from: 10, to: 11 });
  });
  it("counts both pages of a spread, and never a page twice", () => {
    let c = openClock([2, 3], 0);
    c = turnClock(c, [4, 5], MIN);
    c = turnClock(c, [2, 3], 2 * MIN);
    c = turnClock(c, [4, 5], 3 * MIN);
    assert.equal(summarizeClock(c, 4 * MIN)?.pages, 4);
    assert.equal(summarizeClock(c, 4 * MIN)?.to, 5);
  });
  it("rounds a short sitting up to a minute and reads a stash back", () => {
    let c = openClock([1], 0);
    c = turnClock(c, [2], 10_000);
    assert.equal(summarizeClock(c, 12_000)?.minutes, 1);
    assert.deepEqual(parseClock(JSON.parse(JSON.stringify(c))), c);
    assert.equal(parseClock(null), null);
    assert.equal(parseClock({ showing: ["a"], read: [], lastTurnAt: 0, activeMs: 0, startedAt: null, from: null }), null);
    assert.equal(parseClock({ showing: [1], read: [], lastTurnAt: "0", activeMs: 0, startedAt: null, from: null }), null);
  });
});
