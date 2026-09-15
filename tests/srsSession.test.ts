import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Star } from "../shared/constellations.ts";
import { forecast, grade, pick, preview, startSession, statesOf, streakOf } from "../shared/srsSession.ts";
import { STARS_COPY } from "../client/stars/copy.ts";
import { delimiterOf, parseDelimited, stripAnkiHeader } from "../client/stars/csv.ts";
import { cardsOfText } from "../client/stars/lines.ts";
import { hardest, newIntroduced, readLog, retention, retentionSeries } from "../client/stars/log.ts";
import { headOf, keysOf, StarQueue } from "../client/stars/queue.ts";
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
    const q = new StarQueue(HEAD, stars, TODAY, false, NOW);
    const a = q.grade("easy", NOW)!;
    const b = q.grade("easy", NOW)!;
    assert.deepEqual([a.star.line, b.star.line], [3, 9]);
    assert.notEqual(a.key, b.key);
    assert.equal(q.next(NOW), null);
    assert.equal(newIntroduced("n.md", TODAY), 2);
  });

  it("a re-read after a write keeps the reader's place and hands the write the moved line", () => {
    store.clear();
    const stars = [twin(5, "a", "1"), twin(7, "b", "2"), twin(9, "c", "3")];
    const q = new StarQueue(HEAD, stars, TODAY, false, NOW);
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
    const q = new StarQueue(HEAD, stars, TODAY, false, NOW);
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
    assert.equal(newIntroduced("n.md", TODAY), 1);
    assert.equal(q.next(NOW), null);
    const s = q.summary(NOW + 65_000);
    assert.equal(s.graded, 2);
    assert.equal(s.dueLeft, 1, "the skipped y is still due today");
    assert.equal(s.seconds, 65);
    assert.equal(q.canUndo(), true);
    q.undoLast();
    assert.equal(newIntroduced("n.md", TODAY), 0, "undoing a new star's grade gives the day its allowance back");
  });

  it("reads the fence's steps and limit from the shelf row, defaults otherwise", () => {
    const row = { path: "n.md", title: "n", icon: null, kind: "basic" as const, tags: [], implicit: false, counts: { total: 0, new: 0, due: 0 }, sections: [] };
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
    assert.equal(retention(log, TODAY, 30, "a.md"), 1 / 3);
    assert.equal(retention(log, TODAY, 30, "b.md"), 1, "July is outside the window");
    assert.equal(retention(log, TODAY, 30, "c.md"), null);
    const series = retentionSeries(log, TODAY, 30, "a.md");
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
