// Build the kanji readings table from KANJIDIC2.
//
//   node scripts/gen-kanji-readings.mjs <path/to/kanjidic2.xml>
//
// Reads the EDRDG's kanjidic2.xml (download it once from
// https://www.edrdg.org/kanjidic/kanjidic2.xml.gz and unpack it; it is not
// checked in) and writes shared/data/kanjiReadings.json: the jōyō kanji
// only — grades 1 to 6 (primary school) and grade 8 (secondary), 2,136
// characters — each with its kun'yomi and on'yomi, most common first as
// KANJIDIC orders them. Everything else in the file (stroke counts, radicals,
// dictionary indices, meanings in five languages, the JIS X 0212 and 0213
// characters) is left out: the furigana popover asks one question, "how is
// this kanji read", and a 100 kB answer to that question is a lazy chunk the
// first paint never pays for, where the 60 MB source would not be.
//
// The readings are normalised for the popover's use:
//   · kun'yomi drop the okurigana after the dot (つ.ぐ → つ) and the dashes
//     that mark a prefix or suffix (-がた → がた), because the reading
//     written over a kanji is the part the kanji itself carries;
//   · the okurigana themselves are kept beside the kun list, as `x` — one
//     array per kun reading, of the endings KANJIDIC wrote after the dot —
//     because they are what tells 食べる (た.べる) from 食う (く.う): a lone
//     kanji followed by kana is suggested the reading whose okurigana the
//     kana continue. Omitted when no kun reading of the kanji has any;
//   · on'yomi are converted from KANJIDIC's katakana to hiragana (ア → あ),
//     because furigana in a printed book is hiragana whichever kind of
//     reading it is;
//   · duplicates that the rules create (おも.う and おも.い both → おも) are
//     folded, keeping the first and pooling their okurigana.
//
// ATTRIBUTION — REQUIRED BY THE LICENCE. KANJIDIC2 is the property of the
// Electronic Dictionary Research and Development Group (EDRDG) and is used
// under the Creative Commons Attribution-ShareAlike 4.0 licence
// (https://www.edrdg.org/edrdg/licence.html). The generated file carries the
// same notice in its `source` and `license` fields and docs/japanese.md says
// so in both languages.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Katakana → hiragana: the two syllabaries sit 0x60 apart for every
 *  syllable; the prolonged-sound mark ー has no hiragana twin and stays.
 *  The same rule as shared/furigana.ts::toHiragana, spelled here so the
 *  generator has no TypeScript import to resolve. */
function toHiragana(s) {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    out += cp >= 0x30a1 && cp <= 0x30f6 ? String.fromCodePoint(cp - 0x60) : ch;
  }
  return out;
}

/** A kun reading split at its dot: the part the kanji carries, and the
 *  okurigana after it (empty when there is none). Prefix/suffix dashes go. */
function splitKun(reading) {
  const [stem, tail = ""] = reading.replace(/-/g, "").split(".");
  return { stem, tail };
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const r of list) {
    if (r === "" || seen.has(r)) continue;
    seen.add(r);
    out.push(r);
  }
  return out;
}

/** The table, from the XML text. Exported so a test can run it over a
 *  fixture: the shape of the output (`{k, o, x?}` per kanji, jōyō only,
 *  hiragana everywhere, okurigana split off) is what the popover depends on. */
export function readingsFromXml(xml) {
  const kanji = {};
  const charRe = /<character>([\s\S]*?)<\/character>/g;
  let count = 0;
  for (let m = charRe.exec(xml); m; m = charRe.exec(xml)) {
    const body = m[1];
    const literal = /<literal>(.*?)<\/literal>/.exec(body)?.[1];
    const grade = Number(/<grade>(\d+)<\/grade>/.exec(body)?.[1] ?? 0);
    // Grades 1–6 are the kyōiku kanji, 8 the rest of the jōyō list; 9 and 10
    // are the jinmeiyō (name) kanji, which a school reader is not expected
    // to read and which would double the file for readings that are
    // rarely the wanted ones.
    if (!literal || !(grade >= 1 && grade <= 8)) continue;
    const k = [];
    const x = [];
    const o = [];
    const readRe = /<reading r_type="(ja_kun|ja_on)">(.*?)<\/reading>/g;
    for (let r = readRe.exec(body); r; r = readRe.exec(body)) {
      if (r[1] === "ja_on") {
        o.push(toHiragana(r[2]));
        continue;
      }
      const { stem, tail } = splitKun(r[2]);
      if (stem === "") continue;
      let at = k.indexOf(stem);
      if (at < 0) {
        at = k.push(stem) - 1;
        x.push([]);
      }
      if (tail !== "" && !x[at].includes(tail)) x[at].push(tail);
    }
    const entry = { k, o: dedupe(o) };
    if (x.some((t) => t.length > 0)) entry.x = x;
    kanji[literal] = entry;
    count++;
  }
  const version = /<database_version>(.*?)<\/database_version>/.exec(xml)?.[1] ?? "";
  return {
    source: "KANJIDIC2, Electronic Dictionary Research and Development Group (EDRDG), https://www.edrdg.org/",
    license: "CC BY-SA 4.0 — https://www.edrdg.org/edrdg/licence.html",
    version,
    count,
    kanji,
  };
}

function main() {
  const from = process.argv[2];
  if (!from) {
    console.error("usage: node scripts/gen-kanji-readings.mjs <kanjidic2.xml>");
    process.exit(2);
  }
  const table = readingsFromXml(readFileSync(from, "utf8"));
  const out = new URL("../shared/data/kanjiReadings.json", import.meta.url);
  // One line per kanji: a diff of the table reads as a list of characters.
  const body = Object.entries(table.kanji)
    .map(([ch, r]) => `${JSON.stringify(ch)}:${JSON.stringify(r)}`)
    .join(",\n");
  const json =
    `{"source":${JSON.stringify(table.source)},\n"license":${JSON.stringify(table.license)},\n` +
    `"version":${JSON.stringify(table.version)},\n"count":${table.count},\n"kanji":{\n${body}\n}}\n`;
  writeFileSync(out, json);
  console.log(`gen-kanji-readings: ${table.count} kanji (KANJIDIC2 ${table.version}) → ${json.length} bytes`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
