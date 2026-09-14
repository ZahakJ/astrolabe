// Periodic notes (shared/periodic.ts): a format names a day or a week and
// reads it back.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPeriod, isWeeklyFormat, isoWeek, parsePeriod, periodicDateOf, periodicPath } from "../shared/periodic.ts";

const sun = new Date(2026, 8, 13, 12); // Sunday 13 September 2026

describe("a period format", () => {
  it("names a day and a week, literals kept", () => {
    assert.equal(formatPeriod("YYYY-MM-DD", sun), "2026-09-13");
    assert.equal(formatPeriod("YYYY/MM/[day] D", sun), "2026/09/day 13");
    assert.deepEqual(isoWeek(sun), { year: 2026, week: 37 });
    assert.equal(formatPeriod("YYYY-[W]ww", sun), "2026-W37");
    assert.equal(isWeeklyFormat("YYYY-[W]ww"), true);
    assert.equal(isWeeklyFormat("YYYY-MM-DD"), false);
    assert.equal(isWeeklyFormat("[week]-YYYY-MM-DD"), false);
  });
  it("names a weekly note by the ISO week-year, and keeps a [YYYY] literal", () => {
    const monday = new Date(2025, 11, 29, 12); // Monday 29 December 2025 = week 1 of 2026
    assert.equal(formatPeriod("YYYY-[W]ww", monday), "2026-W01");
    assert.equal(parsePeriod("YYYY-[W]ww", "2026-W01")?.getDate(), 29);
    assert.equal(formatPeriod("[YYYY]-YYYY", monday), "YYYY-2025");
  });
  it("reads a name back, rejecting what does not fit", () => {
    assert.equal(parsePeriod("YYYY-MM-DD", "2026-09-13")?.getDate(), 13);
    assert.equal(parsePeriod("YYYY-MM-DD", "2026-02-31"), null);
    assert.equal(parsePeriod("YYYY-MM-DD", "notes"), null);
    const monday = parsePeriod("YYYY-[W]ww", "2026-W37")!;
    assert.equal(monday.getDay(), 1);
    assert.equal(monday.getDate(), 7);
  });
  it("builds and recognises a path under a folder, format carrying folders", () => {
    assert.equal(periodicPath("daily", "YYYY-MM-DD", sun), "daily/2026-09-13.md");
    assert.equal(periodicPath("Journal", "YYYY/YYYY-MM-DD", sun), "Journal/2026/2026-09-13.md");
    assert.equal(periodicPath("", "YYYY-MM-DD", sun), "2026-09-13.md");
    assert.equal(periodicDateOf("Journal", "YYYY/YYYY-MM-DD", "Journal/2026/2026-09-13.md")?.getMonth(), 8);
    assert.equal(periodicDateOf("daily", "YYYY-MM-DD", "Other/2026-09-13.md"), null);
  });
});
