// Turns Tanzil's quran-uthmani.txt (surah|ayah|text, one verse per line) into
// client/data/quran-uthmani.json — a one-off, kept for provenance; the JSON
// is committed and nothing runs this at build time. To regenerate: download
// the Uthmani text from https://tanzil.net/download/ (type: simple text,
// one verse per line), then
//   node scripts/build-quran.mjs quran-uthmani.txt client/data/quran-uthmani.json
// It writes 114 arrays of verse strings, VERBATIM — the
// Tanzil license forbids changing the text, so the basmala Tanzil prefixes to
// the first ayah of every surah but 1 and 9 stays exactly where they put it.
import { readFileSync, writeFileSync } from "node:fs";
const [src, out] = process.argv.slice(2);
const surahs = [];
for (const line of readFileSync(src, "utf8").split("\n")) {
  const m = /^(\d+)\|(\d+)\|(.*)$/.exec(line);
  if (!m) continue;
  const s = Number(m[1]), a = Number(m[2]);
  (surahs[s - 1] ??= [])[a - 1] = m[3];
}
if (surahs.length !== 114) throw new Error(`expected 114 surahs, got ${surahs.length}`);
const total = surahs.reduce((n, s) => n + s.length, 0);
if (total !== 6236) throw new Error(`expected 6236 verses, got ${total}`);
for (const [i, s] of surahs.entries()) for (const [j, v] of s.entries()) if (typeof v !== "string") throw new Error(`hole at ${i + 1}:${j + 1}`);
const doc = {
  source: "Tanzil Quran Text (Uthmani, Version 1.1) — Tanzil Project, https://tanzil.net",
  license: "Creative Commons Attribution 3.0. Verbatim copy; the text must not be changed. Source must be credited with a link to tanzil.net.",
  verses: surahs,
};
writeFileSync(out, JSON.stringify(doc));
console.log(`wrote ${out}: ${total} verses`);
