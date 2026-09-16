// The timeline view of a query fence: the `as: timeline` / `by:` keys
// (shared/queryFence.ts) and the ordering behind them (shared/timeline.ts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseQueryFence } from "../shared/queryFence.ts";
import { groupRuns, localDayUtc, parseTimelineDate, timelineMs, timelineOrder } from "../shared/timeline.ts";

const day = (y: number, m: number, d: number): number => Date.UTC(y, m - 1, d);
const NOON = 12 * 3600 * 1000;

describe("the timeline keys", () => {
  it("parses as: timeline with by: created by default", () => {
    const spec = parseQueryFence("tag:reading\nas: timeline");
    assert.equal(spec.as, "timeline");
    assert.equal(spec.by, "created");
    assert.deepEqual(spec.sort, { key: "date", dir: "desc" });
    assert.deepEqual(spec.show, ["title", "excerpt"]);
  });
  it("reads by: modified and moves the server sort with it", () => {
    const spec = parseQueryFence("as: timeline\nby: modified");
    assert.equal(spec.by, "modified");
    assert.deepEqual(spec.sort, { key: "modified", dir: "desc" });
  });
  it("reads by: <prop> as a frontmatter key, lowercased, and the Arabic spellings", () => {
    assert.deepEqual(parseQueryFence("by: Read").by, { prop: "read" });
    assert.equal(parseQueryFence("عرض: زمني\nبحسب: تعديل").as, "timeline");
    assert.equal(parseQueryFence("عرض: زمني\nبحسب: تعديل").by, "modified");
  });
  it("keeps an asc sort as oldest first", () => {
    assert.equal(parseQueryFence("as: timeline\nsort: date asc").sort.dir, "asc");
  });
});

describe("parseTimelineDate", () => {
  it("reads the shapes a hand writes", () => {
    assert.equal(parseTimelineDate("2026-03-04"), day(2026, 3, 4));
    assert.equal(parseTimelineDate("2026/03/04"), day(2026, 3, 4));
    assert.equal(parseTimelineDate("2026-03-04T10:00:00Z"), day(2026, 3, 4));
    assert.equal(parseTimelineDate("2026-03"), day(2026, 3, 1));
    assert.equal(parseTimelineDate("2026"), day(2026, 1, 1));
    assert.equal(parseTimelineDate("٢٠٢٦-٠٣-٠٤"), day(2026, 3, 4));
    assert.equal(parseTimelineDate("March 4, 2026"), day(2026, 3, 4));
  });
  it("refuses what is not a date", () => {
    for (const bad of ["", "soon", "2026-13-01", "2026-02-31", "reading", undefined, null]) {
      assert.equal(parseTimelineDate(bad), null, String(bad));
    }
  });
});

describe("timelineOrder", () => {
  const rows = [
    // mtimes at UTC noon on three days: a moment the local zone cannot move
    // across midnight, whichever zone the tests run in.
    { title: "a", dateMs: day(2024, 1, 1), mtimeMs: day(2026, 1, 3) + NOON, props: { read: "2026-01-05" } },
    { title: "b", dateMs: day(2026, 6, 1), mtimeMs: day(2026, 1, 1) + NOON, props: { read: "not yet" } },
    { title: "c", dateMs: 0, mtimeMs: day(2026, 1, 2) + NOON, props: { read: "2025-12-31" } },
  ];
  it("places rows by the note date, newest first, undated last", () => {
    assert.deepEqual(timelineOrder(rows, "created", "desc").map((r) => r.row.title), ["b", "a", "c"]);
    assert.deepEqual(timelineOrder(rows, "created", "asc").map((r) => r.row.title), ["a", "b", "c"]);
  });
  it("places rows by a frontmatter date", () => {
    const out = timelineOrder(rows, { prop: "read" }, "desc");
    assert.deepEqual(out.map((r) => r.row.title), ["a", "c", "b"]);
    assert.equal(out[2].ms, null);
  });
  it("places rows by their mtime, as the local day at UTC midnight", () => {
    assert.equal(timelineMs(rows[0], "modified"), day(2026, 1, 3));
    assert.deepEqual(timelineOrder(rows, "modified", "desc").map((r) => r.row.title), ["a", "c", "b"]);
  });
  it("reads a note's own frontmatter day as that day, and a birthtime as a local moment", () => {
    // A frontmatter `date:` is a calendar day: the server stores it at UTC
    // midnight and the timeline keeps it there, whatever the zone.
    const named = { dateMs: day(2026, 3, 4), mtimeMs: 0, props: { date: "2026-03-04" } };
    assert.equal(timelineMs(named, "created"), day(2026, 3, 4));
    // No frontmatter date: dateMs is a birthtime, a moment, read in the
    // local zone — so an evening save lands on its own evening's day.
    const evening = new Date(2026, 11, 31, 22, 30).getTime(); // local time
    const born = { dateMs: evening, mtimeMs: evening, props: {} };
    assert.equal(timelineMs(born, "created"), day(2026, 12, 31));
    assert.equal(timelineMs(born, "modified"), day(2026, 12, 31));
    assert.equal(localDayUtc(evening), day(2026, 12, 31));
  });
  it("groups consecutive rows under one key", () => {
    const groups = groupRuns([1, 1, 2, 1, 3], (n) => (n === 3 ? null : String(n)));
    assert.deepEqual(groups, [
      { key: "1", rows: [1, 1] },
      { key: "2", rows: [2] },
      { key: "1", rows: [1] },
      { key: null, rows: [3] },
    ]);
  });
});
