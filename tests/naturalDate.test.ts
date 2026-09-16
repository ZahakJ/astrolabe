// Natural-language dates (shared/naturalDate.ts): what the editor's `@`
// completion understands, in both languages, against a pinned "now".
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { foldPhrase, naturalDatePhrases, naturalDateSuggestions, parseNaturalDate } from "../shared/naturalDate.ts";

const now = new Date(2026, 8, 15, 10, 30); // Tuesday 15 September 2026, mid-morning

const iso = (d: Date | undefined): string | null =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null;
const day = (phrase: string, lang: "en" | "ar" = "en"): string | null => iso(parseNaturalDate(phrase, now, lang)?.date);

describe("English phrases", () => {
  it("knows the three anchors and the week either way", () => {
    assert.equal(day("today"), "2026-09-15");
    assert.equal(day("Tomorrow"), "2026-09-16");
    assert.equal(day("yesterday"), "2026-09-14");
    assert.equal(day("next week"), "2026-09-22");
    assert.equal(day("last week"), "2026-09-08");
  });

  it("lands on local noon, so a filename built from it never slips a day", () => {
    assert.equal(parseNaturalDate("tomorrow", now)?.date.getHours(), 12);
  });

  it("reads a weekday as the coming one, 'next' as strictly after today", () => {
    assert.equal(day("tuesday"), "2026-09-15"); // today is Tuesday
    assert.equal(day("next tuesday"), "2026-09-22");
    assert.equal(day("thursday"), "2026-09-17");
    assert.equal(day("next monday"), "2026-09-21");
    assert.equal(day("Mon"), "2026-09-21");
    assert.equal(day("last friday"), "2026-09-11");
  });

  it("counts distances in days and weeks, forward and back", () => {
    assert.equal(day("in 3 days"), "2026-09-18");
    assert.equal(day("in a week"), "2026-09-22");
    assert.equal(day("in 2 weeks"), "2026-09-29");
    assert.equal(day("3 days ago"), "2026-09-12");
    assert.equal(day("2 weeks ago"), "2026-09-01");
  });

  it("reads a day with a month name, either order, year optional", () => {
    assert.equal(day("15 september"), "2026-09-15");
    assert.equal(day("15 sep 2026"), "2026-09-15");
    assert.equal(day("Sept 15"), "2026-09-15");
    assert.equal(day("september 15, 2027"), "2027-09-15");
    // Already past this year: next year's, because a written date is an
    // appointment far more often than a memory.
    assert.equal(day("1 january"), "2027-01-01");
    assert.equal(day("14 september"), "2027-09-14");
    assert.equal(day("30 february"), null);
  });

  it("refuses what it cannot read honestly", () => {
    assert.equal(day("foo"), null);
    assert.equal(day("15/9"), null); // day-first or month-first? no guessing
    assert.equal(day(""), null);
    assert.equal(day("in x days"), null);
  });
});

describe("Arabic phrases", () => {
  it("knows the anchors, with or without tanwin", () => {
    assert.equal(day("اليوم", "ar"), "2026-09-15");
    assert.equal(day("غدًا", "ar"), "2026-09-16");
    assert.equal(day("غداً", "ar"), "2026-09-16");
    assert.equal(day("غدا", "ar"), "2026-09-16");
    assert.equal(day("أمس", "ar"), "2026-09-14");
    assert.equal(day("امس", "ar"), "2026-09-14");
    assert.equal(day("الأسبوع القادم", "ar"), "2026-09-22");
    assert.equal(day("الاسبوع الماضي", "ar"), "2026-09-08");
  });

  it("reads a weekday with its qualifier after it, agreeing in gender", () => {
    assert.equal(day("الخميس القادم", "ar"), "2026-09-17");
    assert.equal(day("الجمعة القادمة", "ar"), "2026-09-18");
    assert.equal(day("يوم الاثنين القادم", "ar"), "2026-09-21");
    assert.equal(day("الثلاثاء", "ar"), "2026-09-15");
    assert.equal(day("يوم الخميس", "ar"), "2026-09-17");
    assert.equal(day("الثلاثاء القادم", "ar"), "2026-09-22");
    assert.equal(day("الجمعة الماضية", "ar"), "2026-09-11");
    assert.equal(parseNaturalDate("الجمعة القادمة", now, "ar")?.phrase, "الجمعة القادمة");
  });

  it("counts distances with Eastern digits and the dual", () => {
    assert.equal(day("بعد ٣ أيام", "ar"), "2026-09-18");
    assert.equal(day("بعد 3 ايام", "ar"), "2026-09-18");
    assert.equal(day("بعد يومين", "ar"), "2026-09-17");
    assert.equal(day("بعد يوم", "ar"), "2026-09-16");
    assert.equal(day("بعد أسبوعين", "ar"), "2026-09-29");
    assert.equal(day("قبل أسبوع", "ar"), "2026-09-08");
    assert.equal(day("قبل ٤ أيام", "ar"), "2026-09-11");
  });

  it("reads a day with a month name — Gregorian, Levantine, or Hijri", () => {
    assert.equal(day("١٥ سبتمبر", "ar"), "2026-09-15");
    assert.equal(day("15 أيلول", "ar"), "2026-09-15");
    assert.equal(day("١ كانون الثاني", "ar"), "2027-01-01");
    // A Hijri month NAME makes the date Hijri wherever the site calendar
    // points: 15 Ramadan 1448 is 22 February 2027 in the Umm al-Qura tables.
    assert.equal(day("١٥ رمضان", "ar"), "2027-02-22");
    assert.equal(day("15 ramadan"), "2027-02-22");
    assert.equal(day("1 muharram 1449"), "2027-06-06");
    assert.equal(day("١ محرم ١٤٤٩", "ar"), "2027-06-06");
  });
});

describe("the completion's rows", () => {
  it("offers the anchors, the week, then the weekdays from tomorrow on", () => {
    const rows = naturalDatePhrases(now, "en").map((r) => r.phrase);
    assert.deepEqual(rows.slice(0, 5), ["today", "tomorrow", "yesterday", "next week", "next wednesday"]);
    assert.equal(rows.length, 11);
    assert.equal(rows[rows.length - 1], "next tuesday");
    const ar = naturalDatePhrases(now, "ar").map((r) => r.phrase);
    assert.deepEqual(ar.slice(0, 5), ["اليوم", "غدًا", "أمس", "الأسبوع القادم", "الأربعاء القادم"]);
    assert.ok(ar.includes("الجمعة القادمة"));
  });

  it("narrows by word start, and leads with the writer's own phrase", () => {
    assert.deepEqual(naturalDateSuggestions("t", now, "en").map((r) => r.phrase), ["today", "tomorrow", "next thursday", "next tuesday"]);
    assert.deepEqual(naturalDateSuggestions("to", now, "en").map((r) => r.phrase), ["today", "tomorrow"]);
    assert.deepEqual(naturalDateSuggestions("thu", now, "en").map((r) => r.phrase), ["thursday", "next thursday"]);
    assert.deepEqual(naturalDateSuggestions("in 3 days", now, "en").map((r) => r.phrase), ["in 3 days"]);
    assert.deepEqual(naturalDateSuggestions("15 sep", now, "en").map((r) => r.phrase), ["15 sep"]);
    assert.deepEqual(naturalDateSuggestions("zzz", now, "en"), []);
  });

  it("finds a row through the other language's spelling too", () => {
    // An Arabic chrome, a writer who typed the English word from habit.
    assert.deepEqual(naturalDateSuggestions("tom", now, "ar").map((r) => r.phrase), ["غدًا"]);
    assert.deepEqual(naturalDateSuggestions("غ", now, "en").map((r) => r.phrase), ["tomorrow"]);
  });

  it("marks a day within a week as near, so it can be linked by its weekday", () => {
    assert.equal(parseNaturalDate("tomorrow", now)?.near, true);
    assert.equal(parseNaturalDate("in 2 weeks", now)?.near, false);
  });
});

describe("foldPhrase", () => {
  it("folds case, harakat, hamza forms and digits to one spelling", () => {
    assert.equal(foldPhrase("  Next   MONDAY "), "next monday");
    assert.equal(foldPhrase("غَدًا"), foldPhrase("غدا"));
    assert.equal(foldPhrase("الأحد"), foldPhrase("الاحد"));
    assert.equal(foldPhrase("بعد ٣ أيام"), "بعد 3 ايام");
    assert.equal(foldPhrase("tomorrow."), "tomorrow");
  });
});
