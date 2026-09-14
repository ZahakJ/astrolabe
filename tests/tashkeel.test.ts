// Tashkeel (shared/tashkeel.ts): the strip removes exactly the marks the
// palette can write and nothing else; pointing a selection lands one mark
// after every Arabic letter, after the letter's existing marks, and never
// twice; the tatweel stretches between letters only.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HARAKAT, countTashkeel, isArabicLetter, pointText, stripTashkeel } from "../shared/tashkeel.ts";

describe("stripTashkeel()", () => {
  it("removes the harakat block, the dagger alif and the tatweel", () => {
    assert.equal(stripTashkeel("الْمُقَدِّمَة"), "المقدمة");
    assert.equal(stripTashkeel("بِسْمِ اللّٰهِ"), "بسم الله");
    assert.equal(stripTashkeel("كتـــاب"), "كتاب");
    // Tanwin, all three.
    assert.equal(stripTashkeel("كِتَابًا كِتَابٌ كِتَابٍ"), "كتابا كتاب كتاب");
    // U+0670 on its own.
    assert.equal(stripTashkeel("هٰذَا"), "هذا");
  });
  it("keeps hamza, every letter, and other scripts", () => {
    assert.equal(stripTashkeel("أَإِآؤُئِء"), "أإآؤئء");
    assert.equal(stripTashkeel("résumé — naïve"), "résumé — naïve");
    assert.equal(stripTashkeel("ة ى ک ی"), "ة ى ک ی");
    assert.equal(stripTashkeel(""), "");
  });
  it("removes every mark the palette offers, and only those", () => {
    for (const { char } of HARAKAT) assert.equal(stripTashkeel(`ب${char}`), "ب", char);
    // The Qur'anic small high marks (U+06D6…) are not in the table: a strip
    // that reached past what the palette writes would take pause marks a
    // careful typist never asked it to touch.
    assert.equal(stripTashkeel("بۖ"), "بۖ");
  });
  it("counts what it would remove", () => {
    assert.equal(countTashkeel("الْمُقَدِّمَة"), 6);
    assert.equal(countTashkeel("المقدمة"), 0);
  });
});

describe("pointText()", () => {
  it("puts the mark after every Arabic letter and nothing else", () => {
    assert.equal(pointText("كتب", "fatha"), "كَتَبَ");
    assert.equal(pointText("كتب ok", "damma"), "كُتُبُ ok");
    assert.equal(pointText("ء", "fatha"), "ءَ");
  });
  it("adds after a letter's existing marks, never twice", () => {
    assert.equal(pointText("كَتب", "shadda"), "كَّتّبّ");
    assert.equal(pointText("كَ", "fatha"), "كَ");
    assert.equal(pointText("كَّ", "fatha"), "كَّ");
  });
  it("stretches with tatweel between two letters only", () => {
    assert.equal(pointText("كتب", "tatweel"), "كـتـب");
    assert.equal(pointText("كَتب ب", "tatweel"), "كَـتـب ب");
    // A single letter has nothing to stretch to.
    assert.equal(pointText("ب", "tatweel"), "ب");
  });
  it("strip undoes point", () => {
    for (const { id } of HARAKAT) assert.equal(stripTashkeel(pointText("في الكتاب", id)), "في الكتاب");
  });
});

describe("isArabicLetter()", () => {
  it("knows a letter from a mark", () => {
    assert.equal(isArabicLetter("ب"), true);
    assert.equal(isArabicLetter("ء"), true);
    assert.equal(isArabicLetter("َ"), false);
    assert.equal(isArabicLetter("ـ"), false);
    assert.equal(isArabicLetter("a"), false);
  });
});
