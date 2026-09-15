import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Star } from "../shared/constellations.ts";
import { forecast, grade, pick, preview, startSession, statesOf, streakOf } from "../shared/srsSession.ts";
import { STARS_COPY } from "../client/stars/copy.ts";
import { delimiterOf, parseDelimited, stripAnkiHeader } from "../client/stars/csv.ts";
import { diffAnswer, normaliseAnswer } from "../client/stars/typed.ts";

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

const TODAY = "2026-09-15";
const NOW = Date.parse("2026-09-15T09:00:00Z");
const MIN = 60_000;

function star(line: number, schedule: Star["schedule"] = null): Star {
  return { id: `n.md#${line}#fwd`, path: "n.md", line, end: line, dir: "fwd", kind: "qa", front: `f${line}`, back: `b${line}`, extra: null, section: null, tags: [], schedule };
}

describe("a session's queue", () => {
  it("shows due reviews soonest first, then new stars, one after every four reviews", () => {
    const stars = [
      star(1, { due: "2026-09-14", interval: 3, ease: 2500 }),
      star(2, { due: "2026-09-10", interval: 1, ease: 2500 }),
      star(3, { due: "2026-09-20", interval: 6, ease: 2500 }),
      star(4),
      star(5),
      star(6, { due: "2026-09-15", interval: 2, ease: 2500 }),
      star(7, { due: "2026-09-15", interval: 2, ease: 2500 }),
      star(8, { due: "2026-09-15", interval: 2, ease: 2500 }),
    ];
    let s = startSession(stars, TODAY, 10);
    assert.deepEqual(s.reviews, ["n.md#2#fwd", "n.md#1#fwd", "n.md#6#fwd", "n.md#7#fwd", "n.md#8#fwd"]);
    assert.deepEqual(s.fresh, ["n.md#4#fwd", "n.md#5#fwd"]);
    const order: string[] = [];
    for (let i = 0; i < 7; i++) {
      const p = pick(s, NOW)!;
      order.push(`${p.kind}:${p.id.split("#")[1]}`);
      const st = stars.find((x) => x.id === p.id)!;
      s = grade(s, p, st, "easy", NOW, TODAY, [1, 10]).state;
    }
    assert.deepEqual(order, ["review:2", "review:1", "review:6", "review:7", "new:4", "review:8", "new:5"]);
    assert.equal(pick(s, NOW), null);
  });

  it("caps new stars at the daily allowance and never limits reviews", () => {
    const stars = [star(1), star(2), star(3), star(4, { due: "2026-01-01", interval: 1, ease: 2500 })];
    const s = startSession(stars, TODAY, 2);
    assert.equal(s.fresh.length, 2);
    assert.equal(s.reviews.length, 1);
    assert.equal(startSession(stars, TODAY, 0).fresh.length, 0);
  });

  it("walks a new star through the learning steps and writes only on graduation", () => {
    const n = star(1);
    let s = startSession([n], TODAY, 10);
    let p = pick(s, NOW)!;
    assert.equal(p.kind, "new");
    assert.deepEqual(preview(p, n, "good", TODAY, [1, 10]), { unit: "minutes", n: 10 });
    assert.deepEqual(preview(p, n, "easy", TODAY, [1, 10]), { unit: "days", n: 4 });
    assert.deepEqual(preview(p, n, "again", TODAY, [1, 10]), { unit: "minutes", n: 1 });
    let r = grade(s, p, n, "good", NOW, TODAY, [1, 10]);
    assert.equal(r.write, null);
    s = r.state;
    assert.equal(s.learning[0].step, 1);
    assert.equal(s.learning[0].dueAt, NOW + 10 * MIN);
    // Not due yet, but nothing else is left: shown early.
    p = pick(s, NOW + MIN)!;
    assert.equal(p.kind, "learning");
    assert.deepEqual(preview(p, n, "good", TODAY, [1, 10]), { unit: "days", n: 1 });
    r = grade(s, p, n, "good", NOW + 11 * MIN, TODAY, [1, 10]);
    assert.deepEqual(r.write, { due: "2026-09-16", interval: 1, ease: 2500 });
    assert.equal(pick(r.state, NOW), null);
  });

  it("a lapse writes SM-2's again and relearns for ten minutes, then writes nothing more", () => {
    const rv = star(1, { due: "2026-09-14", interval: 12, ease: 2500 });
    const s = startSession([rv], TODAY, 10);
    const p = pick(s, NOW)!;
    assert.equal(p.kind, "review");
    assert.deepEqual(preview(p, rv, "good", TODAY, [1, 10]), { unit: "days", n: 30 });
    const r = grade(s, p, rv, "again", NOW, TODAY, [1, 10]);
    assert.deepEqual(r.write, { due: "2026-09-16", interval: 1, ease: 2300 });
    assert.equal(r.state.learning.length, 1);
    assert.equal(r.state.learning[0].relearn, true);
    assert.equal(r.state.learning[0].dueAt, NOW + 10 * MIN);
    // Ready learning stars come before anything else.
    const again = pick(r.state, NOW + 10 * MIN)!;
    assert.equal(again.kind, "learning");
    assert.equal(again.relearn, true);
    const done = grade(r.state, again, { ...rv, schedule: r.write }, "good", NOW + 10 * MIN, TODAY, [1, 10]);
    assert.equal(done.write, null);
    assert.equal(pick(done.state, NOW + 10 * MIN), null);
  });

  it("study ahead takes the stars not yet due, soonest first", () => {
    const stars = [star(1, { due: "2026-09-20", interval: 6, ease: 2500 }), star(2, { due: "2026-09-17", interval: 2, ease: 2500 }), star(3)];
    const s = startSession(stars, TODAY, 10, true);
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
    const f = forecast([star(1, { due: "2026-09-01", interval: 1, ease: 2500 }), star(2, { due: "2026-09-17", interval: 2, ease: 2500 }), star(3, { due: "2027-01-01", interval: 100, ease: 2500 }), star(4)], TODAY, 30);
    assert.equal(f.length, 30);
    assert.equal(f[0], 1);
    assert.equal(f[2], 1);
    assert.equal(f.reduce((a, b) => a + b, 0), 2);
  });
  it("splits stars into new, learning, young and mature", () => {
    const st = statesOf([star(1), star(2, { due: "x", interval: 3, ease: 2500 }), star(3, { due: "x", interval: 21, ease: 2500 })], new Set(["n.md#1#fwd"]));
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
