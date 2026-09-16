// The weekly review's sums (shared/weekReview.ts): the week's bounds on
// each site's week, pages and hours by book from the sessions, the
// trackers' outlook, the sigils' week, the Orbits grades and the notes.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRoutine } from "../shared/routine.ts";
import { booksThisWeek, localDay, notesThisWeek, orbitsThisWeek, previousWeek, sigilsThisWeek, trackerOutlook, weekOf, type ReviewTracker } from "../shared/weekReview.ts";

function tracker(over: Partial<ReviewTracker>): ReviewTracker {
  return { path: "Media/Books/M.md", index: 0, title: "M", kind: "book", kindKey: "book", unit: null, status: "active", done: 100, total: 500, percent: 20, pace: null, due: null, sessions: [], ...over };
}
const s = (date: string, pages: number, minutes: number) => ({ date, from: null, to: null, pages, minutes });
/** Noon on an ISO day, in the machine's own zone — what localDay reads back. */
const noon = (iso: string): number => new Date(`${iso}T12:00:00`).getTime();

describe("the week", () => {
  it("runs Monday to Sunday on an English site and Saturday to Friday on an Arabic one", () => {
    // 2026-09-15 is a Tuesday.
    assert.deepEqual(weekOf("2026-09-15", "en"), { start: "2026-09-14", end: "2026-09-20" });
    assert.deepEqual(weekOf("2026-09-15", "ar"), { start: "2026-09-12", end: "2026-09-18" });
    assert.deepEqual(previousWeek(weekOf("2026-09-15", "en")), { start: "2026-09-07", end: "2026-09-13" });
    assert.equal(localDay(noon("2026-09-15")), "2026-09-15");
  });
});

describe("books this week", () => {
  it("sums the sessions inside the week per tracker, most read first, with the book's speed", () => {
    const week = weekOf("2026-09-15", "en");
    const a = tracker({ title: "A", sessions: [s("2026-09-13", 50, 50), s("2026-09-14", 10, 10), s("2026-09-15", 20, 10)] });
    const b = tracker({ path: "B.md", title: "B", sessions: [s("2026-09-16", 40, 60)] });
    const none = tracker({ path: "C.md", title: "C", sessions: [s("2026-09-01", 99, 99)] });
    const rows = booksThisWeek([a, b, none], week);
    assert.deepEqual(rows.map((r) => [r.title, r.pages, r.minutes, r.sessions]), [["B", 40, 60, 1], ["A", 30, 20, 2]]);
    assert.equal(rows[1].speed, 80 / 70);
  });
  it("lists the active trackers nearest done first, with the projection and the time left", () => {
    const rows = trackerOutlook(
      [tracker({ title: "Half", done: 250, percent: 50, pace: 50, sessions: [s("2026-09-14", 30, 20)] }), tracker({ title: "Start", percent: 20 }), tracker({ title: "Done", status: "done", percent: 100 })],
      "2026-09-15",
    );
    assert.deepEqual(rows.map((r) => r.title), ["Half", "Start"]);
    assert.deepEqual(rows[0].projection, { kind: "done-by", date: "2026-09-20", pace: 50 });
    assert.equal(rows[0].minutesLeft, Math.round(250 / 1.5));
    assert.equal(rows[1].projection, null);
    assert.equal(rows[1].minutesLeft, null);
  });
});

describe("sigils this week", () => {
  it("counts each sigil's complete days against its target and carries the streak", () => {
    const plan = parseRoutine("title: Walk\nitems: walk\ntarget: 5\n")!;
    const entries = ["2026-09-13", "2026-09-14", "2026-09-15"].map((date) => ({ date, done: ["walk"], skipped: [], values: {}, note: null }));
    const [row] = sigilsThisWeek([{ path: "Sigils/Walk.md", index: 0, plan, entries }], "2026-09-15", "en");
    assert.deepEqual([row.title, row.done, row.of, row.streak], ["Walk", 2, 5, 3]);
  });
});

describe("orbits this week", () => {
  it("counts the grades in the week, the retention and the days, per deck too", () => {
    const week = weekOf("2026-09-15", "en");
    const log = [
      { path: "Orbits/Kana.md", grade: "good" as const, ts: noon("2026-09-14") },
      { path: "Orbits/Kana.md", grade: "again" as const, ts: noon("2026-09-14") },
      { path: "Orbits/Verbs.md", grade: "easy" as const, ts: noon("2026-09-15") },
      { path: "Orbits/Verbs.md", grade: "good" as const, ts: noon("2026-09-01") },
    ];
    const week1 = orbitsThisWeek(log, week);
    assert.deepEqual([week1.graded, week1.retention, week1.days], [3, 2 / 3, 2]);
    assert.deepEqual(week1.decks, [
      { path: "Orbits/Kana.md", graded: 2, retention: 0.5 },
      { path: "Orbits/Verbs.md", graded: 1, retention: 1 },
    ]);
    assert.deepEqual(orbitsThisWeek([], week), { graded: 0, retention: null, days: 0, decks: [] });
  });
});

describe("notes this week", () => {
  it("separates the notes created in the week from the ones edited, the most edited first", () => {
    const week = weekOf("2026-09-15", "en");
    const notes = [
      { path: "New.md", title: "New", dateMs: noon("2026-09-15"), mtimeMs: noon("2026-09-15") },
      { path: "Old edited.md", title: "Old edited", dateMs: noon("2026-08-01"), mtimeMs: noon("2026-09-14") },
      { path: "Old busy.md", title: "Old busy", dateMs: noon("2026-08-01"), mtimeMs: noon("2026-09-14") - 1 },
      { path: "Untouched.md", title: "Untouched", dateMs: noon("2026-08-01"), mtimeMs: noon("2026-08-02") },
    ];
    const out = notesThisWeek(notes, week, new Map([["Old busy.md", 7]]));
    assert.deepEqual(out.created.map((n) => n.path), ["New.md"]);
    assert.deepEqual(out.edited.map((n) => [n.path, n.edits]), [["Old busy.md", 7], ["Old edited.md", 1]]);
    assert.equal(out.createdTotal, 1);
    assert.equal(out.editedTotal, 2);
  });

  it("caps each list at the limit and says how many there were", () => {
    const week = weekOf("2026-09-15", "en");
    const notes = Array.from({ length: 20 }, (_, i) => ({ path: `n${i}.md`, title: `n${i}`, dateMs: noon("2026-09-14") + i, mtimeMs: noon("2026-09-14") + i }));
    const out = notesThisWeek(notes, week, new Map(), 5);
    assert.equal(out.created.length, 5);
    assert.equal(out.createdTotal, 20);
    // Newest first.
    assert.equal(out.created[0].path, "n19.md");
    assert.equal(out.edited.length, 0);
    assert.equal(out.editedTotal, 0);
  });
});
