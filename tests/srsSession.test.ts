import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Star } from "../shared/constellations.ts";
import type { Schedule } from "../shared/srs.ts";
import { createSession, gradeStar, nextStar, phaseOf, previews, remaining, retention, skipStar, waitFor, type Session } from "../shared/srsSession.ts";
import { STARS_COPY } from "../client/stars/copy.ts";
import { delimiterOf, parseDelimited, stripAnkiHeader } from "../client/stars/csv.ts";
import { cardsOfText } from "../client/stars/lines.ts";
import { hardest, newIntroduced, readLog, retention as deviceRetention, retentionSeries } from "../client/stars/log.ts";
import { headOf, keysOf, StarQueue } from "../client/stars/queue.ts";
import { forecast, statesOf, streakOf } from "../client/stars/stats.ts";
import { diffAnswer, normaliseAnswer } from "../client/stars/typed.ts";

// A fake localStorage for the queue's daily counter and the device's log
// (client/stars/log.ts reads it lazily; node's own wants a flag and warns
// without it).
const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  },
});

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

// The surface's copy travels in its own chunk (client/stars/copy.ts), which
// check-i18n does not walk — so this is that table's parity gate, with the
// same rules: both halves present, the Arabic actually Arabic, and the
// placeholders the same on both sides.
describe("the constellations' own copy", () => {
  it("has both languages and matching placeholders for every key", () => {
    const ph = (s: string): string => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    for (const [key, text] of Object.entries(STARS_COPY)) {
      assert.ok(text.en.trim() !== "", `${key}: empty en`);
      assert.ok(text.ar.trim() !== "", `${key}: empty ar`);
      assert.ok(/[؀-ۿ]/.test(text.ar), `${key}: ar has no Arabic script`);
      assert.notEqual(text.en, text.ar, `${key}: untranslated`);
      assert.equal(ph(text.en), ph(text.ar), `${key}: placeholders differ`);
    }
    assert.ok(Object.keys(STARS_COPY).length > 80);
  });
});


// ── The client's walk, as the UI builder wrote it, over the kept machine ────

const DAY = "2026-09-15";
const NOW = Date.parse("2026-09-15T09:00:00Z");

function s2(line: number, schedule: Star["schedule"] = null): Star {
  return { id: `n.md#${line}#fwd`, path: "n.md", line, end: line, dir: "fwd", kind: "qa", front: `f${line}`, back: `b${line}`, extra: null, section: null, tags: [], schedule };
}

describe("a session's queue, from the client's side", () => {
  it("shows due reviews soonest first, then new stars, one after every four reviews", () => {
    const stars = [
      s2(1, { due: "2026-09-14", interval: 3, ease: 2500 }),
      s2(2, { due: "2026-09-10", interval: 1, ease: 2500 }),
      s2(3, { due: "2026-09-20", interval: 6, ease: 2500 }),
      s2(4),
      s2(5),
      s2(6, { due: "2026-09-15", interval: 2, ease: 2500 }),
      s2(7, { due: "2026-09-15", interval: 2, ease: 2500 }),
      s2(8, { due: "2026-09-15", interval: 2, ease: 2500 }),
    ];
    let s = createSession(stars, DAY, NOW, { newLimit: 10, steps: [1, 10] });
    assert.deepEqual(s.reviews, ["n.md#2#fwd", "n.md#1#fwd", "n.md#6#fwd", "n.md#7#fwd", "n.md#8#fwd"]);
    assert.deepEqual(s.fresh, ["n.md#4#fwd", "n.md#5#fwd"]);
    const order: string[] = [];
    for (let i = 0; i < 7; i++) {
      const p = nextStar(s, NOW)!;
      order.push(`${p.phase}:${p.star.id.split("#")[1]}`);
      s = gradeStar(s, p.star.id, "easy", NOW, DAY).session;
    }
    assert.deepEqual(order, ["review:2", "review:1", "review:6", "review:7", "new:4", "review:8", "new:5"]);
    assert.equal(nextStar(s, NOW), null);
  });

  it("caps new stars at the daily allowance and never limits reviews", () => {
    const stars = [s2(1), s2(2), s2(3), s2(4, { due: "2026-01-01", interval: 1, ease: 2500 })];
    const s = createSession(stars, DAY, NOW, { newLimit: 2 });
    assert.equal(s.fresh.length, 2);
    assert.equal(s.reviews.length, 1);
    assert.equal(createSession(stars, DAY, NOW, { newLimit: 0 }).fresh.length, 0);
  });

  it("walks a new star through the learning steps and writes only on graduation", () => {
    const n = s2(1);
    let s = createSession([n], DAY, NOW, { newLimit: 10, steps: [1, 10] });
    let p = nextStar(s, NOW)!;
    assert.equal(p.phase, "new");
    assert.deepEqual(previews(s, n.id, DAY)!.good, { minutes: 10 });
    assert.deepEqual(previews(s, n.id, DAY)!.easy, { days: 4 });
    assert.deepEqual(previews(s, n.id, DAY)!.again, { minutes: 1 });
    let r = gradeStar(s, p.star.id, "good", NOW, DAY);
    assert.equal(r.write, null);
    s = r.session;
    assert.equal(s.learning[0].step, 1);
    assert.equal(s.learning[0].dueAt, NOW + 10 * MIN);
    // Not due yet, but nothing else is left: shown early.
    p = nextStar(s, NOW + MIN)!;
    assert.equal(p.phase, "learning");
    assert.equal(p.early, true);
    assert.deepEqual(previews(s, n.id, DAY)!.good, { days: 1 });
    r = gradeStar(s, p.star.id, "good", NOW + 11 * MIN, DAY);
    assert.deepEqual(r.write, { due: "2026-09-16", interval: 1, ease: 2500 });
    assert.equal(nextStar(r.session, NOW), null);
  });

  it("a lapse writes SM-2's again and relearns for ten minutes, then writes nothing more", () => {
    const rv = s2(1, { due: "2026-09-14", interval: 12, ease: 2500 });
    const s = createSession([rv], DAY, NOW, { newLimit: 10, steps: [1, 10] });
    const p = nextStar(s, NOW)!;
    assert.equal(p.phase, "review");
    assert.deepEqual(previews(s, rv.id, DAY)!.good, { days: 30 });
    const r = gradeStar(s, p.star.id, "again", NOW, DAY);
    assert.deepEqual(r.write, { due: "2026-09-16", interval: 1, ease: 2300 });
    assert.equal(r.session.learning.length, 1);
    assert.equal(r.session.learning[0].phase, "relearning");
    assert.equal(r.session.learning[0].dueAt, NOW + 10 * MIN);
    // Ready learning stars come before anything else.
    const again = nextStar(r.session, NOW + 10 * MIN)!;
    assert.equal(again.phase, "relearning");
    assert.equal(again.early, false);
    const done = gradeStar(r.session, again.star.id, "good", NOW + 10 * MIN, DAY);
    assert.equal(done.write, null);
    assert.equal(nextStar(done.session, NOW + 10 * MIN), null);
  });

  it("study ahead takes the stars not yet due, soonest first, and no new ones", () => {
    const stars = [s2(1, { due: "2026-09-20", interval: 6, ease: 2500 }), s2(2, { due: "2026-09-17", interval: 2, ease: 2500 }), s2(3)];
    const s = createSession(stars, DAY, NOW, { newLimit: 0, studyAhead: true });
    assert.deepEqual(s.reviews, ["n.md#2#fwd", "n.md#1#fwd"]);
    assert.deepEqual(s.fresh, []);
  });
});

describe("the shelf's numbers", () => {
  it("counts a streak back from today, forgiving a day not yet studied", () => {
    assert.equal(streakOf(["2026-09-15", "2026-09-14", "2026-09-13", "2026-09-10"], "2026-09-15"), 3);
    assert.equal(streakOf(["2026-09-14", "2026-09-13"], "2026-09-15"), 2);
    assert.equal(streakOf(["2026-09-12"], "2026-09-15"), 0);
    assert.equal(streakOf([], "2026-09-15"), 0);
  });
  it("forecasts due stars per day with the overdue on today", () => {
    const f = forecast([s2(1, { due: "2026-09-01", interval: 1, ease: 2500 }), s2(2, { due: "2026-09-17", interval: 2, ease: 2500 }), s2(3, { due: "2027-01-01", interval: 100, ease: 2500 }), s2(4)], DAY, 30);
    assert.equal(f.length, 30);
    assert.equal(f[0], 1);
    assert.equal(f[2], 1);
    assert.equal(f.reduce((a, b) => a + b, 0), 2);
  });
  it("splits stars into new, learning, young and mature", () => {
    const st = statesOf([s2(1), s2(2, { due: "x", interval: 3, ease: 2500 }), s2(3, { due: "x", interval: 21, ease: 2500 })], new Set(["n.md#1#fwd"]));
    assert.deepEqual(st, { new: 0, learning: 1, young: 1, mature: 1 });
  });
});

describe("a typed answer", () => {
  it("forgives case, space, Unicode form and kana width", () => {
    assert.equal(normaliseAnswer("  Ｔｏｋｙｏ  "), "tokyo");
    assert.equal(normaliseAnswer("ｶﾀｶﾅ"), "カタカナ");
    assert.equal(diffAnswer("Tokyo ", "tokyo").ok, true);
  });
  it("marks what was typed wrongly and what was missed", () => {
    const d = diffAnswer("tokio", "tokyo");
    assert.equal(d.ok, false);
    assert.deepEqual(
      d.ops.map((o) => `${o.kind}:${o.text}`),
      ["same:tok", "drop:i", "add:y", "same:o"],
    );
  });
});

describe("the CSV reader", () => {
  it("picks the delimiter from the first line and reads quoted fields", () => {
    assert.equal(delimiterOf("a\tb\tc\n"), "\t");
    assert.equal(delimiterOf("a,b\n"), ",");
    assert.equal(delimiterOf("a;b\n", "x.csv"), ";");
    assert.deepEqual(parseDelimited('"Hello, world",b\n"say ""hi""",c\r\n', ","), [
      ["Hello, world", "b"],
      ['say "hi"', "c"],
    ]);
  });
  it("skips Anki's #-header lines", () => {
    assert.equal(stripAnkiHeader("#separator:tab\n#html:true\nfront\tback\n"), "front\tback\n");
  });
});

// ── The client's queue over the machine (client/stars/queue.ts) ─────────────

function twin(line: number, front: string, back: string, dir: "fwd" | "rev" = "fwd", schedule: Star["schedule"] = null): Star {
  return { id: `n.md#${line}#${dir}`, path: "n.md", line, end: line, dir, kind: "qa", front, back, extra: null, section: null, tags: [], schedule };
}
const HEAD = { path: "n.md", steps: [1, 10], newPerDay: 10 };

describe("the session keys", () => {
  it("tell two stars with the same faces apart by their order, and survive a shifted line", () => {
    const first = [twin(3, "dog", "chien"), twin(4, "cat", "chat"), twin(9, "dog", "chien"), twin(3, "chien", "dog", "rev")];
    const keys = keysOf(first);
    assert.equal(new Set(keys).size, 4, "four distinct keys");
    // A comment line written after the cat moves the second dog down one.
    const later = [twin(3, "dog", "chien"), twin(4, "cat", "chat"), twin(10, "dog", "chien"), twin(3, "chien", "dog", "rev")];
    assert.deepEqual(keysOf(later), keys);
  });

  it("the queue shows both twins and writes each grade to its own line", () => {
    store.clear();
    const stars = [twin(3, "dog", "chien"), twin(9, "dog", "perro")];
    const q = new StarQueue(HEAD, stars, DAY, false, NOW);
    const a = q.grade("easy", NOW)!;
    const b = q.grade("easy", NOW)!;
    assert.deepEqual([a.star.line, b.star.line], [3, 9]);
    assert.notEqual(a.key, b.key);
    assert.equal(q.next(NOW), null);
    assert.equal(newIntroduced("n.md", DAY), 2);
  });

  it("a re-read after a write keeps the reader's place and hands the write the moved line", () => {
    store.clear();
    const stars = [twin(5, "a", "1"), twin(7, "b", "2"), twin(9, "c", "3")];
    const q = new StarQueue(HEAD, stars, DAY, false, NOW);
    const first = q.grade("easy", NOW)!;
    assert.equal(first.star.line, 5);
    // The write put a comment line under `a`; every star below moved.
    q.refresh([twin(5, "a", "1", "fwd", first.write), twin(8, "b", "2"), twin(10, "c", "3")]);
    const next = q.next(NOW)!;
    assert.equal(next.star.front, "b");
    assert.equal(next.star.line, 8);
    const second = q.grade("easy", NOW)!;
    assert.equal(q.starOf(second.key)?.line, 8);
    // A star that vanished between reads is dropped, not shown blank.
    q.refresh([twin(5, "a", "1", "fwd", first.write), twin(8, "b", "2", "fwd", second.write)]);
    assert.equal(q.next(NOW), null);
  });

  it("undo gives back the schedule, the counter and the log entry; skip leaves a due star due", () => {
    store.clear();
    const due = { due: "2026-09-10", interval: 3, ease: 2500 };
    const stars = [twin(3, "x", "1", "fwd", due), twin(4, "y", "2", "fwd", due), twin(5, "z", "3")];
    const q = new StarQueue(HEAD, stars, DAY, false, NOW);
    const g = q.grade("again", NOW)!;
    assert.equal(g.star.front, "x");
    assert.deepEqual(g.write, { due: "2026-09-16", interval: 1, ease: 2300 });
    assert.equal(readLog().length, 1);
    const back = q.undoLast()!;
    assert.equal(back.wrote, true);
    assert.deepEqual(back.restore, due);
    assert.equal(readLog().length, 0);
    assert.equal(q.next(NOW)!.star.front, "x", "the undone star is back in front");
    q.grade("good", NOW);
    assert.equal(q.next(NOW)!.star.front, "y");
    q.skip();
    const z = q.grade("easy", NOW)!;
    assert.equal(z.star.front, "z");
    assert.equal(newIntroduced("n.md", DAY), 1);
    assert.equal(q.next(NOW), null);
    const s = q.summary(NOW + 65_000);
    assert.equal(s.graded, 2);
    assert.equal(s.dueLeft, 1, "the skipped y is still due today");
    assert.equal(s.seconds, 65);
    assert.equal(q.canUndo(), true);
    q.undoLast();
    assert.equal(newIntroduced("n.md", DAY), 0, "undoing a new star's grade gives the day its allowance back");
  });

  it("reads the fence's steps and limit from the shelf row, defaults when the row's are unusable", () => {
    const row = { path: "n.md", title: "n", icon: null, kind: "basic" as const, tags: [], implicit: false, counts: { total: 0, new: 0, due: 0 }, sections: [], steps: [], newPerDay: -1 };
    assert.deepEqual(headOf(row), { path: "n.md", steps: [1, 10], newPerDay: 10 });
    assert.deepEqual(headOf({ ...row, steps: [2, 20, 60], newPerDay: 0 }), { path: "n.md", steps: [2, 20, 60], newPerDay: 0 });
  });
});

describe("the device's log", () => {
  it("narrows retention and the hardest list to one note, and buckets the series by local day", () => {
    const at = (day: string, h = 12): number => new Date(`${day}T${String(h).padStart(2, "0")}:00:00`).getTime();
    const log = [
      { path: "a.md", line: 1, grade: "again" as const, ts: at("2026-09-15") },
      { path: "a.md", line: 1, grade: "good" as const, ts: at("2026-09-15") },
      { path: "a.md", line: 2, grade: "again" as const, ts: at("2026-09-14", 23) },
      { path: "b.md", line: 1, grade: "easy" as const, ts: at("2026-09-01") },
      { path: "b.md", line: 1, grade: "easy" as const, ts: at("2026-07-01") },
    ];
    assert.equal(deviceRetention(log, DAY, 30, "a.md"), 1 / 3);
    assert.equal(deviceRetention(log, DAY, 30, "b.md"), 1, "July is outside the window");
    assert.equal(deviceRetention(log, DAY, 30, "c.md"), null);
    const series = retentionSeries(log, DAY, 30, "a.md");
    assert.equal(series.length, 30);
    assert.equal(series[29], 0.5);
    assert.equal(series[28], 0, "eleven at night is still that day");
    assert.deepEqual(hardest(log, "a.md").map((r) => [r.line, r.again]), [[1, 1], [2, 1]]);
    assert.deepEqual(hardest(log, "b.md"), []);
  });
});

describe("the modal's card lines", () => {
  it("reads two and three segments, the plugin's :::, CRLF, and skips what is not a card", () => {
    const cards = cardsOfText("to eat::食べる::taberu\r\nto drink:::飲む\r\nnot a card\r\n::nothing\r\nfront::\r\nあ：a\r\n  spaced :: out :: \r\n");
    assert.deepEqual(cards, [
      { front: "to eat", back: "食べる", extra: "taberu" },
      { front: "to drink", back: "飲む", extra: null },
      { front: "spaced", back: "out", extra: null },
    ]);
  });
});

describe("the CSV reader, harder", () => {
  it("survives a BOM, CRLF, a semicolon file and a newline inside quotes", () => {
    const text = '﻿front;back\r\n"a;b";"line one\nline two"\r\n\r\nc;d\r\n';
    assert.equal(delimiterOf(text), ";");
    assert.deepEqual(parseDelimited(text, ";"), [["front", "back"], ["a;b", "line one\nline two"], ["c", "d"]]);
  });
});

describe("a typed answer, harder", () => {
  it("folds width and case for kana and romaji, and reads an empty answer as all missed", () => {
    assert.equal(normaliseAnswer("ｶﾀｶﾅ"), normaliseAnswer("カタカナ"));
    assert.equal(normaliseAnswer("ＫＡ "), "ka");
    assert.equal(diffAnswer("か", "か").ok, true);
    const empty = diffAnswer("", "ka");
    assert.equal(empty.ok, false);
    assert.deepEqual(empty.ops, [{ kind: "add", text: "ka" }]);
  });
});
