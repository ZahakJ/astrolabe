// Periodic notes (shared/periodic.ts): a format names a day or a week and
// reads it back.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MONTHLY_FORMAT_DEFAULT,
  YEARLY_FORMAT_DEFAULT,
  formatPeriod,
  isWeeklyFormat,
  isoWeek,
  parsePeriod,
  periodEnd,
  periodKindOf,
  periodStart,
  periodicDateOf,
  periodicPath,
  shiftPeriod,
} from "../shared/periodic.ts";

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

// Four kinds, told apart by what the format names (periodKindOf), each with
// a first day to print from and read back to, a last day, and a step.
describe("monthly and yearly periods", () => {
  it("reads the kind off the format's tokens", () => {
    assert.equal(periodKindOf("YYYY-MM-DD"), "day");
    assert.equal(periodKindOf("YYYY-[W]ww"), "week");
    assert.equal(periodKindOf(MONTHLY_FORMAT_DEFAULT), "month");
    assert.equal(periodKindOf("YYYY/[M]MM"), "month");
    assert.equal(periodKindOf(YEARLY_FORMAT_DEFAULT), "year");
    assert.equal(periodKindOf("[Year] YYYY"), "year");
    assert.equal(periodKindOf("[MM-DD] YYYY"), "year", "literals name nothing");
  });
  it("names a month and a year, and reads them back to their first day", () => {
    assert.equal(formatPeriod("YYYY-MM", sun), "2026-09");
    assert.equal(formatPeriod("YYYY", sun), "2026");
    const month = parsePeriod("YYYY-MM", "2026-09")!;
    assert.deepEqual([month.getFullYear(), month.getMonth(), month.getDate(), month.getHours()], [2026, 8, 1, 12]);
    const year = parsePeriod("YYYY", "2026")!;
    assert.deepEqual([year.getFullYear(), year.getMonth(), year.getDate()], [2026, 0, 1]);
    assert.equal(parsePeriod("YYYY-MM", "2026-13"), null);
    assert.equal(parsePeriod("YYYY-MM", "2026-09-13"), null, "a month pattern does not swallow a day");
    assert.equal(parsePeriod("YYYY", "2026-09"), null);
    assert.equal(periodicDateOf("daily", "YYYY-MM", "daily/2026-09.md")?.getMonth(), 8);
  });
  it("starts, ends and steps each kind on the calendar", () => {
    const d = new Date(2026, 0, 31, 12); // 31 January 2026
    assert.equal(periodStart("month", d).getDate(), 1);
    assert.equal(periodEnd("month", d).getDate(), 31);
    assert.equal(periodEnd("month", new Date(2026, 1, 10, 12)).getDate(), 28);
    assert.deepEqual([periodEnd("year", d).getMonth(), periodEnd("year", d).getDate()], [11, 31]);
    // A month step from the 31st lands on 1 February, not 3 March.
    const next = shiftPeriod("month", d, 1);
    assert.deepEqual([next.getMonth(), next.getDate()], [1, 1]);
    assert.equal(shiftPeriod("year", d, -1).getFullYear(), 2025);
    assert.equal(shiftPeriod("week", sun, 1).getDate(), 14, "a week steps from its Monday");
    assert.equal(shiftPeriod("day", sun, -1).getDate(), 12);
    assert.equal(periodEnd("week", sun).getDate(), 13, "Sunday ends the week that began on Monday the 7th");
  });
});
