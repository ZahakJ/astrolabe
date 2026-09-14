// Quran references (shared/quranRefs.ts) and the verse data beside them.
//
// Two kinds of claim. The GRAMMAR — `2:255`, a range, a name in either
// script, a verse the surah does not have — is what the editor's popup, the
// reading renderer and the blog all parse through, so it is pinned here once.
// The TABLE is data copied by hand, and a wrong ayah count is the quiet kind
// of bug: `2:287` would render nothing and say nothing. So every one of the
// 114 counts is checked against the Tanzil text itself, and the text is
// checked against the mushaf's total.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  AYAH_COUNT,
  findSurah,
  formatAyahRef,
  matchSurahs,
  parseAyahRef,
  SURAHS,
} from "../shared/quranRefs.ts";

const DATA_URL = new URL("../client/data/quran-uthmani.json", import.meta.url);

describe("the surah table", () => {
  it("has 114 rows, numbered in order", () => {
    assert.equal(SURAHS.length, 114);
    SURAHS.forEach((s, i) => assert.equal(s.n, i + 1));
  });

  it("knows the ayah counts a reader would check first", () => {
    assert.equal(SURAHS[0].ayahs, 7);
    assert.equal(SURAHS[1].ayahs, 286);
    assert.equal(SURAHS[113].ayahs, 6);
    assert.equal(SURAHS[35].ayahs, 83);
  });

  it("sums to the mushaf's 6236 verses", () => {
    assert.equal(
      SURAHS.reduce((n, s) => n + s.ayahs, 0),
      AYAH_COUNT,
    );
  });
});

describe("the verse data (client/data/quran-uthmani.json)", () => {
  const doc = JSON.parse(readFileSync(DATA_URL, "utf8")) as {
    source: string;
    license: string;
    verses: string[][];
  };

  it("holds 6236 verses in 114 surahs, and credits Tanzil", () => {
    assert.equal(doc.verses.length, 114);
    assert.equal(
      doc.verses.reduce((n, s) => n + s.length, 0),
      AYAH_COUNT,
    );
    assert.match(doc.source, /tanzil\.net/);
    assert.match(doc.license, /Attribution/);
  });

  it("agrees with the table on every surah's count", () => {
    SURAHS.forEach((s, i) => {
      assert.equal(doc.verses[i].length, s.ayahs, `surah ${s.n} (${s.en})`);
    });
  });

  it("is the Uthmani script, pointed", () => {
    // Ayat al-Kursi opens with «ٱللَّهُ» — the alef wasla (U+0671) is
    // Uthmani's mark, and the shadda + fatha on the second lam are the
    // pointing. Matched by code point rather than by a pasted literal,
    // because two editors normalise the mark order two ways.
    assert.match(doc.verses[1][254], /^ٱلل[َّ]{2}هُ /);
    // Every verse has letters and none is empty.
    for (const surah of doc.verses) for (const v of surah) assert.ok(/[؀-ۿ]/.test(v));
  });
});

describe("findSurah", () => {
  it("takes a number, an Arabic name or a transliteration", () => {
    assert.equal(findSurah("2")?.n, 2);
    assert.equal(findSurah("114")?.n, 114);
    assert.equal(findSurah("البقرة")?.n, 2);
    assert.equal(findSurah("بقرة")?.n, 2);
    assert.equal(findSurah("الْبَقَرَة")?.n, 2);
    assert.equal(findSurah("سورة البقرة")?.n, 2);
    assert.equal(findSurah("Al-Baqarah")?.n, 2);
    assert.equal(findSurah("al baqara")?.n, 2);
    assert.equal(findSurah("Baqarah")?.n, 2);
    assert.equal(findSurah("Surah Al-Kahf")?.n, 18);
  });

  it("is not fooled by article-shaped syllables", () => {
    assert.equal(findSurah("Anbiya")?.n, 21);
    assert.equal(findSurah("An'am")?.n, 6);
    assert.equal(findSurah("Ash-Shura")?.n, 42);
    assert.equal(findSurah("shura")?.n, 42);
    assert.equal(findSurah("Adh-Dhariyat")?.n, 51);
    assert.equal(findSurah("Nas")?.n, 114);
    assert.equal(findSurah("Nasr")?.n, 110);
  });

  it("knows the common alternate spellings", () => {
    assert.equal(findSurah("Imran")?.n, 3);
    assert.equal(findSurah("Al-Imran")?.n, 3);
    assert.equal(findSurah("Fatiha")?.n, 1);
    assert.equal(findSurah("Yaseen")?.n, 36);
    assert.equal(findSurah("Taha")?.n, 20);
    assert.equal(findSurah("Ikhlas")?.n, 112);
    assert.equal(findSurah("آل عمران")?.n, 3);
    assert.equal(findSurah("ال عمران")?.n, 3);
    assert.equal(findSurah("يس")?.n, 36);
  });

  it("answers null to numbers off the end and names it has never heard", () => {
    assert.equal(findSurah("0"), null);
    assert.equal(findSurah("115"), null);
    assert.equal(findSurah("Genesis"), null);
    assert.equal(findSurah("التكوين"), null);
    assert.equal(findSurah(""), null);
  });
});

describe("parseAyahRef", () => {
  it("reads surah:ayah with a number", () => {
    assert.deepEqual(parseAyahRef("2:255"), { surah: 2, from: 255, to: 255 });
    assert.deepEqual(parseAyahRef(" 1:1 "), { surah: 1, from: 1, to: 1 });
    assert.deepEqual(parseAyahRef("114:6"), { surah: 114, from: 6, to: 6 });
  });

  it("reads a range with any dash", () => {
    assert.deepEqual(parseAyahRef("2:255-257"), { surah: 2, from: 255, to: 257 });
    assert.deepEqual(parseAyahRef("2:255–257"), { surah: 2, from: 255, to: 257 });
    assert.deepEqual(parseAyahRef("2:255 — 257"), { surah: 2, from: 255, to: 257 });
  });

  it("reads names in either script, with any separator", () => {
    assert.deepEqual(parseAyahRef("الفاتحة:1"), { surah: 1, from: 1, to: 1 });
    assert.deepEqual(parseAyahRef("البقرة ٢٥٥"), { surah: 2, from: 255, to: 255 });
    assert.deepEqual(parseAyahRef("البقرة: ٢٥٥-٢٥٧"), { surah: 2, from: 255, to: 257 });
    assert.deepEqual(parseAyahRef("Al-Baqarah 255"), { surah: 2, from: 255, to: 255 });
    assert.deepEqual(parseAyahRef("Ali 'Imran 33"), { surah: 3, from: 33, to: 33 });
    assert.deepEqual(parseAyahRef("آل عمران ٣٣"), { surah: 3, from: 33, to: 33 });
    assert.deepEqual(parseAyahRef("Yusuf/4"), { surah: 12, from: 4, to: 4 });
    assert.deepEqual(parseAyahRef("2：255"), { surah: 2, from: 255, to: 255 });
  });

  it("refuses a verse the surah does not have, and a backwards range", () => {
    assert.equal(parseAyahRef("2:287"), null);
    assert.equal(parseAyahRef("1:0"), null);
    assert.equal(parseAyahRef("2:257-255"), null);
    assert.equal(parseAyahRef("2:255-300"), null);
    assert.equal(parseAyahRef("115:1"), null);
  });

  it("refuses what is not a reference at all", () => {
    assert.equal(parseAyahRef(""), null);
    assert.equal(parseAyahRef("Ayat al-Kursi"), null);
    assert.equal(parseAyahRef("2"), null);
    assert.equal(parseAyahRef("2:"), null);
    assert.equal(parseAyahRef("Bukhari 1"), null);
  });
});

describe("formatAyahRef", () => {
  it("captions in the chrome's language and numerals", () => {
    const one = { surah: 2, from: 255, to: 255 };
    const range = { surah: 2, from: 255, to: 257 };
    assert.equal(formatAyahRef(one, "ar"), "البقرة ٢٥٥");
    assert.equal(formatAyahRef(range, "ar"), "البقرة ٢٥٥–٢٥٧");
    assert.equal(formatAyahRef(one, "en"), "Al-Baqarah 2:255");
    assert.equal(formatAyahRef(range, "en"), "Al-Baqarah 2:255–257");
  });
});

describe("matchSurahs (the popup inside `> [!ayah] `)", () => {
  it("lists all 114 for nothing typed, in mushaf order", () => {
    assert.equal(matchSurahs("").length, 114);
    assert.equal(matchSurahs("")[0].n, 1);
  });

  it("narrows by number, by Arabic and by transliteration, prefixes first", () => {
    assert.deepEqual(matchSurahs("11").map((s) => s.n), [11, 110, 111, 112, 113, 114]);
    assert.equal(matchSurahs("الب")[0].n, 2);
    assert.equal(matchSurahs("ب")[0].n, 2);
    assert.equal(matchSurahs("baq")[0].n, 2);
    assert.equal(matchSurahs("al-baq")[0].n, 2);
    assert.equal(matchSurahs("kahf")[0].n, 18);
    // "al" is every Al-: the writer typed the article, not a name yet.
    assert.ok(matchSurahs("al").length > 50);
    assert.deepEqual(matchSurahs("zzz"), []);
  });
});
