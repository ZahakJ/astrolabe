// Periodic notes (shared/periodic.ts): a format names a day or a week and
// reads it back.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPeriod, freePath, isWeeklyFormat, isoWeek, parsePeriod, periodicDateOf, periodicPath } from "../shared/periodic.ts";

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
  it("names a minute for the unique note, and reads the day back out of it", () => {
    const at = new Date(2026, 8, 13, 7, 5, 9);
    assert.equal(formatPeriod("YYYYMMDDHHmm", at), "202609130705");
    assert.equal(formatPeriod("YYYY-MM-DD HH[h]mm[m]ss", at), "2026-09-13 07h05m09");
    // `mm` is the minute and `MM` the month: the two never trade places.
    assert.equal(formatPeriod("MM/mm", at), "09/05");
    // A name that carries the minute still names its day.
    assert.equal(parsePeriod("YYYYMMDDHHmm", "202609130705")?.getDate(), 13);
    assert.equal(parsePeriod("YYYYMMDDHHmm", "2026091307"), null);
  });
  it("finds the next free spelling of a stamped name", () => {
    const taken = new Set(["202609130705.md", "202609130705 2.md", "zettel/202609130705.md"]);
    assert.equal(freePath("202609130706.md", taken), "202609130706.md");
    assert.equal(freePath("202609130705.md", taken), "202609130705 3.md");
    assert.equal(freePath("zettel/202609130705.md", taken), "zettel/202609130705 2.md");
    // A dot in a FOLDER is not an extension.
    assert.equal(freePath("v1.0/note", new Set(["v1.0/note"])), "v1.0/note 2");
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
