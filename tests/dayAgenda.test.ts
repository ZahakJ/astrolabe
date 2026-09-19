// What a day held (shared/dayAgenda.ts): the Calendar page's cells, added up
// from the daily notes, the sigil logs, the device's Orbits log and the
// trackers' sittings — and stored nowhere.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agendaBands, agendaByDay, emptyAgenda, gradedOn, type AgendaSources } from "../shared/dayAgenda.ts";
import { parseRoutine, parseRoutineLog } from "../shared/routine.ts";
import type { ReviewGrade } from "../shared/weekReview.ts";

const PLAN = `title: Morning
items: water, stretch
tuesday:
  evening: read`;

function sigil(path: string, log: string) {
  const plan = parseRoutine(PLAN);
  assert.ok(plan !== null);
  return { path, index: 0, plan, entries: parseRoutineLog(log, plan.fields) };
}

/** Local noon on `iso`, the instant every day in this product is taken at —
 *  so a grade's `ts` lands on the day the reader was living in whatever the
 *  test machine's zone is. */
function ts(iso: string, hour = 12): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, hour).getTime();
}

function grade(path: string, iso: string, g: ReviewGrade["grade"]): ReviewGrade {
  return { path, grade: g, ts: ts(iso) };
}

const EMPTY: AgendaSources = { notes: new Map(), sigils: [], trackers: [], grades: [] };
const DAYS = ["2026-09-14", "2026-09-15", "2026-09-16"];
const TODAY = "2026-09-16";

describe("an empty month", () => {
  it("still answers for every day it was asked about, and for nothing else", () => {
    const out = agendaByDay(DAYS, EMPTY, TODAY);
    assert.deepEqual([...out.keys()].sort(), DAYS);
    for (const day of out.values()) assert.equal(day.count, 0);
    assert.equal(out.get("2026-09-17"), undefined);
  });

  it("hands back a whole empty day for a caller that asks for one", () => {
    assert.deepEqual(emptyAgenda("2026-09-15"), { iso: "2026-09-15", note: null, sigils: [], decks: [], trackers: [], projected: [], count: 0 });
  });
});

describe("the daily note", () => {
  it("lands on its own day and counts as one thing", () => {
    const out = agendaByDay(DAYS, { ...EMPTY, notes: new Map([["2026-09-15", "daily/2026-09-15.md"]]) }, TODAY);
    assert.equal(out.get("2026-09-15")?.note, "daily/2026-09-15.md");
    assert.equal(out.get("2026-09-15")?.count, 1);
    assert.equal(out.get("2026-09-14")?.note, null);
  });

  it("ignores a note for a day outside the month asked for", () => {
    const out = agendaByDay(DAYS, { ...EMPTY, notes: new Map([["2026-08-01", "daily/2026-08-01.md"]]) }, TODAY);
    for (const day of out.values()) assert.equal(day.note, null);
  });
});

describe("the sigils", () => {
  it("appear only on the days they logged, with the status their own card gives", () => {
    // Tuesday 15 September 2026: water, stretch and the evening slot.
    const s = sigil("Sigils/Morning.md", ["2026-09-14 | done: water, stretch", "2026-09-15 | done: water, stretch, evening | slept well"].join("\n"));
    const out = agendaByDay(DAYS, { ...EMPTY, sigils: [s] }, TODAY);
    const mon = out.get("2026-09-14")?.sigils ?? [];
    const tue = out.get("2026-09-15")?.sigils ?? [];
    assert.equal(mon.length, 1);
    assert.equal(mon[0].title, "Morning");
    assert.equal(mon[0].status, "complete"); // Monday asks for the two items only
    assert.equal(mon[0].done, 2);
    assert.equal(mon[0].of, 2);
    assert.equal(tue[0].of, 3); // …Tuesday for the evening slot as well
    assert.equal(tue[0].done, 3);
    assert.equal(tue[0].note, "slept well");
    assert.equal(out.get("2026-09-16")?.sigils.length, 0);
  });

  it("calls a past day with nothing ticked missed and a future one not-yet", () => {
    const s = sigil("Sigils/Morning.md", ["2026-09-14 | 0", "2026-09-16 | 0"].join("\n"));
    const out = agendaByDay(DAYS, { ...EMPTY, sigils: [s] }, "2026-09-15");
    assert.equal(out.get("2026-09-14")?.sigils[0].status, "missed");
    assert.equal(out.get("2026-09-16")?.sigils[0].status, "none");
  });

  it("sorts a day's sigils by title, so a re-read never reshuffles them", () => {
    const b = sigil("Sigils/B.md", "2026-09-15 | done: water");
    const a = sigil("Sigils/A.md", "2026-09-15 | done: water");
    a.plan.title = "Apple";
    b.plan.title = "Zebra";
    const out = agendaByDay(DAYS, { ...EMPTY, sigils: [b, a] }, TODAY);
    assert.deepEqual(out.get("2026-09-15")?.sigils.map((s) => s.title), ["Apple", "Zebra"]);
  });
});

describe("the cards graded", () => {
  it("buckets the device's log by the reader's own day and by deck", () => {
    const grades = [
      grade("Decks/Kana.md", "2026-09-15", "good"),
      grade("Decks/Kana.md", "2026-09-15", "again"),
      grade("Decks/Kana.md", "2026-09-15", "easy"),
      grade("Decks/Verbs.md", "2026-09-15", "good"),
      grade("Decks/Kana.md", "2026-09-14", "hard"),
      grade("Decks/Kana.md", "2026-08-01", "good"), // outside the month
    ];
    const out = agendaByDay(DAYS, { ...EMPTY, grades }, TODAY);
    const tue = out.get("2026-09-15");
    assert.equal(tue?.decks.length, 2);
    // Most graded first.
    assert.deepEqual(tue?.decks[0], { path: "Decks/Kana.md", graded: 3, kept: 2 });
    assert.deepEqual(tue?.decks[1], { path: "Decks/Verbs.md", graded: 1, kept: 1 });
    assert.deepEqual(gradedOn(tue!), { graded: 4, kept: 3 });
    assert.deepEqual(out.get("2026-09-14")?.decks, [{ path: "Decks/Kana.md", graded: 1, kept: 0 }]);
    assert.deepEqual(gradedOn(out.get("2026-09-16")!), { graded: 0, kept: 0 });
  });

  it("counts a grade at either end of the day as that day's", () => {
    const grades: ReviewGrade[] = [
      { path: "Decks/Kana.md", grade: "good", ts: ts("2026-09-15", 0) },
      { path: "Decks/Kana.md", grade: "good", ts: ts("2026-09-15", 23) },
    ];
    const out = agendaByDay(DAYS, { ...EMPTY, grades }, TODAY);
    assert.equal(out.get("2026-09-15")?.decks[0].graded, 2);
  });
});

describe("the sittings", () => {
  it("adds a tracker's sessions up per day, most read first", () => {
    const trackers = [
      {
        path: "Media/Kafka.md",
        index: 0,
        title: "The Trial",
        sessions: [
          { date: "2026-09-15", from: 1, to: 20, pages: 19, minutes: 40 },
          { date: "2026-09-15", from: 20, to: 31, pages: 11, minutes: 20 },
          { date: "2026-09-14", from: 0, to: 1, pages: 1, minutes: 5 },
        ],
      },
      {
        path: "Media/Herbert.md",
        index: 0,
        title: "Dune",
        sessions: [{ date: "2026-09-15", from: 1, to: 6, pages: 5, minutes: 90 }],
      },
    ];
    const out = agendaByDay(DAYS, { ...EMPTY, trackers }, TODAY);
    const tue = out.get("2026-09-15");
    assert.deepEqual(
      tue?.trackers.map((tr) => [tr.title, tr.pages, tr.minutes, tr.sessions]),
      [
        ["The Trial", 30, 60, 2],
        ["Dune", 5, 90, 1],
      ],
    );
    assert.equal(out.get("2026-09-14")?.trackers.length, 1);
    assert.equal(out.get("2026-09-16")?.trackers.length, 0);
  });
});

describe("a course on the month (3.19.0)", () => {
  const COURSE = `title: Japanese
mode: course
days: mon, tue, wed, thu, fri
steps: |
  # Kana
  - hiragana rows
  - katakana rows
  # Genki I
  - lesson 1
  - lesson 2`;
  function course(log: string) {
    const plan = parseRoutine(COURSE);
    assert.ok(plan !== null);
    return { path: "Sigils/Japanese.md", index: 0, plan, entries: parseRoutineLog(log, plan.fields) };
  }
  // Mon 2026-09-14 … Fri 2026-09-18, with Wednesday as today.
  const WEEK = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"];

  it("draws the steps a day answered solid and the ones ahead of it faint", () => {
    const key = course("").plan.course!.steps[0].key;
    const done = course(`2026-09-14 | done: ${key}`);
    const out = agendaByDay(WEEK, { ...EMPTY, sigils: [done] }, TODAY);
    assert.deepEqual(out.get("2026-09-14")!.sigils[0].steps, ["hiragana rows"], "the day it happened");
    assert.deepEqual(out.get("2026-09-14")!.projected, [], "nothing is projected behind today");
    // From today (Wednesday) the three that are left take the next three days.
    assert.deepEqual(
      WEEK.map((iso) => out.get(iso)!.projected.map((p) => p.text)),
      [[], [], ["katakana rows"], ["lesson 1"], ["lesson 2"]],
    );
    assert.equal(out.get("2026-09-18")!.count, 1, "a projected step is something the day holds");
  });

  it("reads the months ahead as unit bands", () => {
    const bands = agendaBands([course("")], WEEK, TODAY);
    assert.deepEqual(
      bands.map((b) => [b.title, b.unit, b.start, b.end, b.steps]),
      [
        ["Japanese", "Kana", "2026-09-16", "2026-09-17", 2],
        ["Japanese", "Genki I", "2026-09-18", "2026-09-18", 1],
      ],
    );
    // A weekly sigil has no bands at all.
    assert.deepEqual(agendaBands([sigil("Sigils/Morning.md", "")], WEEK, TODAY), []);
  });
});

describe("the count a cell shows", () => {
  it("is the note, the sigils, the decks and the trackers together", () => {
    const s = sigil("Sigils/Morning.md", "2026-09-15 | done: water");
    const out = agendaByDay(
      DAYS,
      {
        notes: new Map([["2026-09-15", "daily/2026-09-15.md"]]),
        sigils: [s],
        grades: [grade("Decks/Kana.md", "2026-09-15", "good")],
        trackers: [{ path: "Media/Kafka.md", index: 0, title: "The Trial", sessions: [{ date: "2026-09-15", from: null, to: null, pages: 3, minutes: 10 }] }],
      },
      TODAY,
    );
    assert.equal(out.get("2026-09-15")?.count, 4);
    assert.equal(out.get("2026-09-14")?.count, 0);
  });
});
