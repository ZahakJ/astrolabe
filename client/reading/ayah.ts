// THE VERSE, DRAWN. This module owns the one thing the ayah callout must not
// make everybody pay for: the Uthmani text of the whole Quran (client/data/
// quran-uthmani.json, ~1.3 MB, Tanzil Project, CC BY 3.0 — verbatim, credited
// under every callout with a link to tanzil.net, as the license asks).
//
// IT IS LOADED ON DEMAND. render.ts reaches it through a dynamic import from
// the callout branch (ayahBlock there), the shape the tracker card and KaTeX
// already take: the callout's box is in the tree at once, this chunk lands
// into it, and a reader of a note with no verse on it downloads none of it.
// scripts/check-bundle.mjs asserts that (FORBIDDEN "the Quran text"), so
// nothing may import this module statically — not even for its types.
//
// It builds DOM, not markdown: scripture is not prose to be parsed, and a
// `*` inside a verse must never become emphasis. The commentary under the
// verse is the author's and goes through the normal pipeline in render.ts.

import quran from "../data/quran-uthmani.json";
import type { AyahRef } from "../../shared/quranRefs.ts";

const VERSES: readonly (readonly string[])[] = quran.verses;

/** The basmala as Tanzil spells it — verse 1:1, and the prefix Tanzil puts on
 *  the first verse of every other surah but At-Tawbah. It is kept inside
 *  that verse's text (the file is verbatim) and only SET APART here, on its
 *  own centred line, the way a mushaf opens a surah. */
const BASMALA = VERSES[0][0];

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";

function arabicDigits(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => ARABIC_INDIC[Number(d)]);
}

/** The verses a reference names, in order. */
export function ayahVerses(ref: AyahRef): { n: number; text: string }[] {
  const surah = VERSES[ref.surah - 1] ?? [];
  const out: { n: number; text: string }[] = [];
  for (let n = ref.from; n <= ref.to; n++) {
    const text = surah[n - 1];
    if (text !== undefined) out.push({ n, text });
  }
  return out;
}

/** The verse text block: `dir="rtl" lang="ar"`, each verse followed by its
 *  number in ornate brackets (the mushaf's end-of-ayah mark, in the digits a
 *  mushaf uses), and a basmala set on its own line when the range opens a
 *  surah. Classes are `s-rv-ayah*` (client/reading/reading.css). */
export function renderAyahText(ref: AyahRef): HTMLElement {
  const box = document.createElement("div");
  box.className = "s-rv-ayah__text";
  box.dir = "rtl";
  box.lang = "ar";
  const verses = ayahVerses(ref);
  verses.forEach(({ n, text }, i) => {
    let body = text;
    // Surah 1's basmala IS its first verse and stays in line; elsewhere the
    // prefix Tanzil carries on verse 1 is the surah's heading, not part of
    // the ayah a reader is quoting.
    if (i === 0 && n === 1 && ref.surah !== 1 && text.startsWith(`${BASMALA} `)) {
      const head = document.createElement("span");
      head.className = "s-rv-ayah__basmala";
      head.textContent = BASMALA;
      box.appendChild(head);
      body = text.slice(BASMALA.length + 1);
    }
    const verse = document.createElement("span");
    verse.className = "s-rv-ayah__verse";
    verse.textContent = body;
    const num = document.createElement("span");
    num.className = "s-rv-ayah__num";
    num.textContent = `﴿${arabicDigits(n)}﴾`;
    box.append(verse, " ", num, " ");
  });
  return box;
}
