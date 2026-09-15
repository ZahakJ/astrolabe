// Furigana (shared/furigana.ts): the `{漢字|かんじ}` syntax is the Obsidian
// plugin's, so what parses here must be what parses there; the readings a
// popover suggests are ordered by what a reader is likeliest to want; and the
// table the generator writes has the one shape the popover reads.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findFurigana,
  furiganaSpanAt,
  hasKanji,
  rubySegments,
  serialiseFurigana,
  stripFurigana,
} from "../shared/furigana.ts";
import {
  autoFurigana,
  kanjiRuns,
  suggestReadings,
  toHiragana,
  type ReadingsTable,
} from "../shared/furiganaReadings.ts";
import { spellcheckLang } from "../shared/script.ts";
// The generator is a build script, not product code, so it ships no types;
// its one pure function is imported here to hold its output shape.
// @ts-expect-error — scripts/*.mjs carries no declaration file
import { readingsFromXml } from "../scripts/gen-kanji-readings.mjs";

describe("findFurigana()", () => {
  it("reads a whole-word span", () => {
    assert.deepEqual(findFurigana("これは{漢字|かんじ}です"), [
      { start: 3, end: 11, base: "漢字", readings: ["かんじ"] },
    ]);
  });
  it("reads a per-character span", () => {
    assert.deepEqual(findFurigana("{漢字|かん|じ}")[0].readings, ["かん", "じ"]);
  });
  it("keeps kana inside the base", () => {
    const [span] = findFurigana("{食べ物|た|もの}");
    assert.equal(span.base, "食べ物");
    assert.deepEqual(span.readings, ["た", "もの"]);
  });
  it("leaves an escaped brace alone", () => {
    assert.deepEqual(findFurigana("\\{漢字|かんじ}"), []);
  });
  it("is not fooled by a brace group with no bar", () => {
    assert.deepEqual(findFurigana("{漢字} and {.center}"), []);
  });
  it("takes the innermost group when braces nest", () => {
    const spans = findFurigana("{{漢字|かんじ}}");
    assert.equal(spans.length, 1);
    assert.equal(spans[0].start, 1);
    assert.equal(spans[0].base, "漢字");
  });
  it("wants a Japanese base — {x|y} in an English note is not a ruby", () => {
    assert.deepEqual(findFurigana("the set {x|y}"), []);
  });
  it("refuses an empty reading and a span across lines", () => {
    assert.deepEqual(findFurigana("{漢字|}"), []);
    assert.deepEqual(findFurigana("{漢字|かん||じ}"), []);
    assert.deepEqual(findFurigana("{漢字\n|かんじ}"), []);
  });
  it("finds several on one line, in order", () => {
    const spans = findFurigana("{日本|にほん}の{漢字|かんじ}");
    assert.deepEqual(spans.map((s) => s.base), ["日本", "漢字"]);
  });
});

describe("furiganaSpanAt()", () => {
  const text = "これは{漢字|かんじ}のテストです。";
  it("hands a selection inside a span the whole span, so a second visit edits it", () => {
    // 漢 alone, the reading, the closing brace: all the one span.
    for (const [from, to] of [[4, 5], [7, 10], [10, 11], [3, 11]]) {
      const span = furiganaSpanAt(text, from, to);
      assert.equal(span?.start, 3);
      assert.equal(span?.end, 11);
      assert.deepEqual(span?.readings, ["かんじ"]);
    }
  });
  it("answers null beside a span and on a line without one", () => {
    assert.equal(furiganaSpanAt(text, 0, 3), null);
    assert.equal(furiganaSpanAt(text, 11, 14), null);
    assert.equal(furiganaSpanAt("漢字のテスト", 0, 2), null);
  });
});

describe("serialiseFurigana() and stripFurigana()", () => {
  it("writes the plugin's spelling", () => {
    assert.equal(serialiseFurigana("漢字", ["かんじ"]), "{漢字|かんじ}");
    assert.equal(serialiseFurigana("漢字", ["かん", "じ"]), "{漢字|かん|じ}");
  });
  it("round-trips", () => {
    const text = serialiseFurigana("食べ物", ["た", "もの"]);
    const [span] = findFurigana(text);
    assert.equal(serialiseFurigana(span.base, span.readings), text);
  });
  it("strips to the base for outlines and search", () => {
    assert.equal(stripFurigana("{日本|にほん}の{漢字|かんじ}を読む"), "日本の漢字を読む");
    assert.equal(stripFurigana("no furigana here"), "no furigana here");
  });
});

describe("rubySegments()", () => {
  it("puts one reading over the whole base", () => {
    assert.deepEqual(rubySegments("漢字", ["かんじ"]), [{ text: "漢字", rt: "かんじ" }]);
  });
  it("puts one reading over each kanji and skips the kana", () => {
    assert.deepEqual(rubySegments("食べ物", ["た", "もの"]), [
      { text: "食", rt: "た" },
      { text: "べ", rt: null },
      { text: "物", rt: "もの" },
    ]);
  });
  it("falls back to the joined reading when the count is off", () => {
    assert.deepEqual(rubySegments("漢字", ["か", "ん", "じ"]), [{ text: "漢字", rt: "かんじ" }]);
  });
});

// A small table in the generator's shape: enough to hold the ordering rules.
const TABLE: ReadingsTable = {
  漢: { k: [], o: ["かん"] },
  字: { k: ["あざ", "あざな", "な"], o: ["じ"] },
  食: { k: ["く", "た", "は"], o: ["しょく", "じき"], x: [["う", "らう"], ["べる"], ["む"]] },
  山: { k: ["やま"], o: ["さん", "せん"] },
  物: { k: ["もの"], o: ["ぶつ", "もつ"] },
};

describe("suggestReadings()", () => {
  it("puts on'yomi first in a compound", () => {
    assert.deepEqual(suggestReadings("漢字", 1, TABLE), ["じ", "あざ", "あざな", "な"]);
    assert.deepEqual(suggestReadings("漢字", 0, TABLE), ["かん"]);
  });
  it("puts kun'yomi first for a lone kanji", () => {
    assert.deepEqual(suggestReadings("山", 0, TABLE), ["やま", "さん", "せん"]);
  });
  it("puts the kun reading whose okurigana follow at the very front", () => {
    assert.equal(suggestReadings("食", 0, TABLE, "べる")[0], "た");
    assert.equal(suggestReadings("食", 0, TABLE, "べた")[0], "た"); // inflected
    assert.equal(suggestReadings("食", 0, TABLE, "う")[0], "く");
    assert.equal(suggestReadings("食", 0, TABLE, "む")[0], "は");
    // No kana after it: KANJIDIC's own order stands.
    assert.equal(suggestReadings("食", 0, TABLE)[0], "く");
  });
  it("answers nothing for a kanji the table does not know", () => {
    assert.deepEqual(suggestReadings("龍", 0, TABLE), []);
  });
});

describe("kanjiRuns() and autoFurigana()", () => {
  it("splits on kana and carries what follows", () => {
    const runs = kanjiRuns("食べ物を漢字で");
    assert.deepEqual(
      runs.map((r) => [r.text, r.start, r.end, r.after]),
      [["食", 0, 1, "べ物を漢"], ["物", 2, 3, "を漢字で"], ["漢字", 4, 6, "で"]],
    );
  });
  it("writes the first suggestion over every known run, one reading per word", () => {
    const { text, count } = autoFurigana("食べ物を漢字で", TABLE);
    assert.equal(text, "{食|た}べ{物|もの}を{漢字|かんじ}で");
    assert.equal(count, 3);
  });
  it("wraps only the runs inside the range but reads past its end", () => {
    // The selection ends right after 食; the べ after it still picks た.
    const { text, count } = autoFurigana("食べ物", TABLE, { from: 0, to: 1 });
    assert.equal(text, "{食|た}べ物");
    assert.equal(count, 1);
  });
  it("leaves a run the table does not fully know, and one already annotated", () => {
    const { text, count } = autoFurigana("{漢字|かんじ}と龍山", TABLE);
    assert.equal(text, "{漢字|かんじ}と龍山");
    assert.equal(count, 0);
  });
  it("hasKanji() is what gates the menu row", () => {
    assert.equal(hasKanji("ひらがな only"), false);
    assert.equal(hasKanji("漢"), true);
  });
});

describe("toHiragana()", () => {
  it("shifts katakana and keeps the long-vowel mark", () => {
    assert.equal(toHiragana("カンジ"), "かんじ");
    assert.equal(toHiragana("コーヒー"), "こーひー");
    assert.equal(toHiragana("すでに"), "すでに");
  });
});

describe("spellcheckLang() names Japanese", () => {
  it("after the RTL scripts, and not for Latin", () => {
    assert.equal(spellcheckLang("これは漢字です"), "ja");
    assert.equal(spellcheckLang("カタカナ"), "ja");
    assert.equal(spellcheckLang("ｶﾀｶﾅ（半角）"), "ja");
    assert.equal(spellcheckLang("An English line"), null);
    // An Arabic line quoting a Japanese word is an Arabic line.
    assert.equal(spellcheckLang("كلمة 漢字"), "ar");
    // An English sentence quoting one kanji keeps its own face; a Japanese
    // line naming a Latin thing is still Japanese.
    assert.equal(spellcheckLang("A plain 漢 written by hand"), null);
    assert.equal(spellcheckLang("これはCSSのテストです"), "ja");
    assert.equal(spellcheckLang("{漢字|かんじ} = kanji"), "ja");
  });
});

describe("gen-kanji-readings", () => {
  const FIXTURE = `<?xml version="1.0"?>
<kanjidic2>
<header><file_version>4</file_version><database_version>2026-258</database_version></header>
<character>
<literal>食</literal>
<misc><grade>2</grade></misc>
<reading_meaning><rmgroup>
<reading r_type="pinyin">shi2</reading>
<reading r_type="ja_on">ショク</reading>
<reading r_type="ja_on">ジキ</reading>
<reading r_type="ja_kun">く.う</reading>
<reading r_type="ja_kun">く.らう</reading>
<reading r_type="ja_kun">た.べる</reading>
<reading r_type="ja_kun">は.む</reading>
</rmgroup></reading_meaning>
</character>
<character>
<literal>亜</literal>
<misc><grade>8</grade></misc>
<reading_meaning><rmgroup>
<reading r_type="ja_on">ア</reading>
<reading r_type="ja_kun">つ.ぐ</reading>
</rmgroup></reading_meaning>
</character>
<character>
<literal>方</literal>
<misc><grade>2</grade></misc>
<reading_meaning><rmgroup>
<reading r_type="ja_on">ホウ</reading>
<reading r_type="ja_kun">かた</reading>
<reading r_type="ja_kun">-かた</reading>
<reading r_type="ja_kun">-がた</reading>
</rmgroup></reading_meaning>
</character>
<character>
<literal>凪</literal>
<misc><grade>9</grade></misc>
<reading_meaning><rmgroup>
<reading r_type="ja_kun">なぎ</reading>
</rmgroup></reading_meaning>
</character>
<character>
<literal>丂</literal>
<misc></misc>
</character>
</kanjidic2>`;
  const table = readingsFromXml(FIXTURE) as {
    source: string;
    license: string;
    version: string;
    count: number;
    kanji: ReadingsTable;
  };
  it("keeps jōyō grades only and counts them", () => {
    assert.deepEqual(Object.keys(table.kanji).sort(), ["亜", "方", "食"]);
    assert.equal(table.count, 3);
    assert.equal(table.version, "2026-258");
  });
  it("writes hiragana on'yomi and okurigana-free kun'yomi, in KANJIDIC order", () => {
    assert.deepEqual(table.kanji["食"], {
      k: ["く", "た", "は"],
      o: ["しょく", "じき"],
      x: [["う", "らう"], ["べる"], ["む"]],
    });
    assert.deepEqual(table.kanji["亜"], { k: ["つ"], o: ["あ"], x: [["ぐ"]] });
  });
  it("drops the prefix/suffix dashes and folds the duplicates they leave", () => {
    assert.deepEqual(table.kanji["方"], { k: ["かた", "がた"], o: ["ほう"] });
  });
  it("carries the EDRDG attribution the licence requires", () => {
    assert.match(table.source, /KANJIDIC2/);
    assert.match(table.source, /EDRDG/);
    assert.match(table.license, /CC BY-SA 4\.0/);
  });
});
