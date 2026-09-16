// The month grid (shared/calendar.ts): a month in either calendar, seven
// wide, first column by the reader's week, padded with its neighbours.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, addMonths, daysBetween, firstOfMonth, monthCells, monthLength, ymdOf } from "../shared/calendar.ts";
import { weekOrder } from "../shared/routine.ts";

const tue = new Date(2026, 8, 15, 12); // Tuesday 15 September 2026

describe("a Gregorian month", () => {
  it("knows its first day, its length and its neighbours", () => {
    assert.equal(firstOfMonth(tue, "gregorian").getDate(), 1);
    assert.equal(monthLength(tue, "gregorian"), 30);
    assert.equal(monthLength(new Date(2026, 1, 10, 12), "gregorian"), 28);
    assert.equal(monthLength(new Date(2028, 1, 10, 12), "gregorian"), 29);
    const next = addMonths(tue, 1, "gregorian");
    assert.deepEqual(ymdOf(next, "gregorian"), { year: 2026, month: 10, day: 1 });
    const back = addMonths(new Date(2026, 0, 31, 12), -1, "gregorian");
    assert.deepEqual(ymdOf(back, "gregorian"), { year: 2025, month: 12, day: 1 });
    assert.deepEqual(ymdOf(addMonths(tue, 4, "gregorian"), "gregorian"), { year: 2027, month: 1, day: 1 });
  });

  it("lays September 2026 out Monday-first for English and Saturday-first for Arabic", () => {
    const en = monthCells(tue, "gregorian", weekOrder("en"));
    // 1 September 2026 is a Tuesday: one Monday of August leads.
    assert.equal(en[0][0].iso, "2026-08-31");
    assert.equal(en[0][0].inMonth, false);
    assert.equal(en[0][1].iso, "2026-09-01");
    assert.equal(en[0][1].day, 1);
    assert.equal(en.length, 5);
    assert.equal(en[4][6].iso, "2026-10-04");
    assert.equal(en[4][6].day, 4);
    assert.equal(en[4][6].inMonth, false);
    const ar = monthCells(tue, "gregorian", weekOrder("ar"));
    assert.equal(ar[0][0].iso, "2026-08-29"); // the Saturday before
    assert.equal(ar[0][3].iso, "2026-09-01");
    assert.equal(ar.flat().filter((c) => c.inMonth).length, 30);
  });

  it("never draws fewer than four rows nor more than six", () => {
    // February 2027 starts on a Monday and has 28 days: exactly four rows.
    assert.equal(monthCells(new Date(2027, 1, 1, 12), "gregorian", weekOrder("en")).length, 4);
    // August 2026 starts on a Saturday, 31 days, Monday-first: six rows.
    assert.equal(monthCells(new Date(2026, 7, 1, 12), "gregorian", weekOrder("en")).length, 6);
  });
});

describe("a Hijri month", () => {
  it("reads the Umm al-Qura parts of a date", () => {
    // 15 September 2026 is 4 Rabiʻ II 1448 in ICU's Umm al-Qura tables —
    // and whatever a future ICU says, it must say the same thing here as
    // in the long date the chrome prints beside the grid.
    assert.deepEqual(ymdOf(tue, "hijri"), { year: 1448, month: 4, day: 4 });
    const long = new Intl.DateTimeFormat("en-u-nu-latn", { calendar: "islamic-umalqura", day: "numeric" }).format(tue);
    assert.equal(String(ymdOf(tue, "hijri").day), long);
  });

  it("finds the first of the month, its length, and walks to the next", () => {
    const first = firstOfMonth(tue, "hijri");
    assert.equal(ymdOf(first, "hijri").day, 1);
    assert.equal(ymdOf(first, "hijri").month, 4);
    const len = monthLength(tue, "hijri");
    assert.ok(len === 29 || len === 30, `a Hijri month is 29 or 30 days, not ${len}`);
    const next = addMonths(tue, 1, "hijri");
    assert.deepEqual([ymdOf(next, "hijri").month, ymdOf(next, "hijri").day], [5, 1]);
    const prev = addMonths(tue, -1, "hijri");
    assert.deepEqual([ymdOf(prev, "hijri").month, ymdOf(prev, "hijri").day], [3, 1]);
    assert.equal(daysBetween(first, next), len);
    // Twelve months on is the same month of the next year.
    const year = addMonths(tue, 12, "hijri");
    assert.deepEqual([ymdOf(year, "hijri").year, ymdOf(year, "hijri").month], [1449, 4]);
  });

  it("lays the month out with the neighbours' Hijri day numbers in the padding", () => {
    const rows = monthCells(tue, "hijri", weekOrder("ar"));
    const cells = rows.flat();
    assert.equal(cells.filter((c) => c.inMonth).length, monthLength(tue, "hijri"));
    const firstIn = cells.find((c) => c.inMonth)!;
    assert.equal(firstIn.day, 1);
    for (const c of cells) assert.equal(c.day, ymdOf(c.date, "hijri").day);
    assert.equal(cells.length % 7, 0);
  });
});

describe("day arithmetic", () => {
  it("adds days at local noon, so a DST change is not a change of date", () => {
    const d = addDays(new Date(2026, 2, 28, 12), 2);
    assert.equal(d.getDate(), 30);
    assert.equal(d.getHours(), 12);
    assert.equal(daysBetween(new Date(2026, 2, 28, 12), d), 2);
  });
});
