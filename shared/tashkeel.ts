// Tashkeel — the Arabic diacritics — as text operations.
//
// Search has folded these marks since the fold table was written
// (shared/fold.ts): «المقدمة» finds «الْمُقَدِّمَة». What the product never
// had was a way to WRITE them. Every keyboard hides the harakat behind
// Shift-combinations nobody remembers (fatha is Shift+Q on the Arabic 101
// layout, shadda is Shift+~, the dagger alif is on no layout at all), and a
// careful typist quoting a pointed text either hunts for each one or gives
// up. The palette in client/editor/harakat.ts is the door; this module is
// the arithmetic, kept pure so tests/tashkeel.test.ts can drive it under
// node --test with no editor.
//
// One table, both directions: the same code points the palette inserts are
// the ones `stripTashkeel()` removes, so a mark the palette can write is a
// mark the strip can take back, and no third list can drift from either.

/** Every mark the palette offers, in the order it lists them: the three
 *  short vowels, their tanwin, then the two consonant marks, the Qur'anic
 *  dagger alif, and the tatweel — which is not a diacritic at all but a
 *  typographic stretch, listed here because it is the other thing an Arabic
 *  writer cannot find on a keyboard and the other thing search folds. */
export const HARAKAT = [
  { id: "fatha", char: "َ" },
  { id: "damma", char: "ُ" },
  { id: "kasra", char: "ِ" },
  { id: "fathatan", char: "ً" },
  { id: "dammatan", char: "ٌ" },
  { id: "kasratan", char: "ٍ" },
  { id: "shadda", char: "ّ" },
  { id: "sukun", char: "ْ" },
  { id: "daggerAlif", char: "ٰ" },
  { id: "tatweel", char: "ـ" },
] as const;

export type HarakaId = (typeof HARAKAT)[number]["id"];

export const TATWEEL = "ـ";

/** The marks `stripTashkeel` removes: the harakat block U+064B–U+0652 (tanwin,
 *  the short vowels, shadda, sukun), the superscript alef U+0670, and the
 *  tatweel U+0640. A SUBSET of what the search fold ignores
 *  (shared/fold.ts), on purpose: this is an EDIT to the writer's text, not a
 *  way of matching it, so the Qur'anic pause marks, the hamza and maddah
 *  marks and the zero-width joiners the fold looks straight through stay
 *  where the writer put them. Everything this removes, the fold ignores —
 *  a search never depends on a mark this leaves behind. */
const TASHKEEL_RE = /[ً-ْٰـ]/g;

/** An Arabic LETTER — something a haraka can sit on. The main block minus
 *  its own marks, plus the extended letters (Persian, Urdu, the alef wasla).
 *  Hamza on its own (U+0621) is a letter and takes a fatha like any other. */
const ARABIC_LETTER_RE = /[ء-غف-يٱ-ۓ]/;

export function isArabicLetter(ch: string): boolean {
  return ARABIC_LETTER_RE.test(ch);
}

export function isTashkeel(ch: string): boolean {
  return /[ً-ْٰـ]/.test(ch);
}

/** The text without its diacritics. Hamza, every letter and every other
 *  script pass through untouched — only the marks the table above names go. */
export function stripTashkeel(text: string): string {
  return text.replace(TASHKEEL_RE, "");
}

/** How many marks `stripTashkeel` would remove — so a command can say
 *  "nothing here to strip" instead of rewriting a note into itself. */
export function countTashkeel(text: string): number {
  return text.match(TASHKEEL_RE)?.length ?? 0;
}

export function harakaChar(id: HarakaId): string {
  const hit = HARAKAT.find((h) => h.id === id);
  return hit ? hit.char : "";
}

/** Point a SELECTION: the mark lands after every Arabic letter of the text —
 *  after the letter's existing marks, so a shadda added to a word that
 *  already carries a fatha keeps the fatha and gains the shadda rather than
 *  splitting the two around it. Letters of other scripts, spaces and
 *  punctuation are untouched, so pointing a mixed line vowels only the
 *  Arabic in it.
 *
 *  The tatweel is the one mark that is not combining, and "after every
 *  letter" would be nonsense for it: a tatweel between a letter and a space
 *  draws a stroke into nothing. So it goes BETWEEN two Arabic letters only —
 *  which stretches the selected word the way a calligrapher would, and is
 *  the only thing a stretch applied to a selection could reasonably mean. */
export function pointText(text: string, id: HarakaId): string {
  const mark = harakaChar(id);
  if (mark === "") return text;
  const chars = [...text];
  const out: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    out.push(ch);
    if (!isArabicLetter(ch)) continue;
    if (id === "tatweel") {
      // The next non-mark character has to be a letter too.
      let j = i + 1;
      while (j < chars.length && isTashkeel(chars[j]) && chars[j] !== TATWEEL) j++;
      if (j < chars.length && isArabicLetter(chars[j])) {
        // Copy this letter's own marks first; the stretch goes after them.
        while (i + 1 < chars.length && isTashkeel(chars[i + 1]) && chars[i + 1] !== TATWEEL) out.push(chars[++i]);
        out.push(mark);
      }
      continue;
    }
    // Skip past the marks already on this letter, then add ours — unless it
    // is already there: pointing a fatha onto a fatha twice is a typo the
    // palette should not be able to make.
    let j = i + 1;
    let present = false;
    while (j < chars.length && isTashkeel(chars[j]) && chars[j] !== TATWEEL) {
      if (chars[j] === mark) present = true;
      out.push(chars[j]);
      j++;
    }
    if (!present) out.push(mark);
    i = j - 1;
  }
  return out.join("");
}
