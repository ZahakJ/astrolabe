// IS THIS LINE FRENCH? — the detector alone, in a file of its own.
//
// shared/script.ts asks this for every line the editor AND the reading view
// lay out (the per-line `lang` that picks the spellcheck dictionary), so it
// is on every first paint. The correction table it used to share a module
// with is 15 kB the reading view never needs, and the bundle gate caught the
// two together over budget on the blog reader's first paint. The table and
// the typography live in shared/french.ts, which re-exports this so the
// editor and the tests keep one import.
//

/** A line in a right-to-left or CJK script is not French whatever Latin words
 *  it also carries: those lines already have their own answer (script.ts). */
const NOT_LATIN_RE =
  /[\u0590-\u05ff\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb1d-\ufb4f\ufb50-\ufdff\ufe70-\ufeff\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;

/** Letters a French text is full of and an English one borrows rarely. NOT
 *  `é`, `ï`, `ë`, `ü`: English writes café, résumé, fiancé, naïve, Zoë and
 *  Brontë with them and an English line about a café is not French. The
 *  words carrying these count as ONE marker between them, however many there
 *  are — a crème brûlée is two accents and still an English dessert — so the
 *  second marker always has to be a French word. */
const FRENCH_LETTER_RE = /[èêàçùœâîôûÈÊÀÇÙŒÂÎÔÛ]/;

/** Whole-word markers, chosen against English rather than for French: `on`,
 *  `a`, `en`, `plus`, `car`, `son`, `as`, `me`, `si` are all French function
 *  words, and all of them are English words too, so an English sentence about
 *  a car and its son would have counted as French. Every word here is one an
 *  English line does not use. */
const FRENCH_WORDS = new Set([
  "je", "tu", "il", "elle", "nous", "vous", "ils", "elles", "lui", "eux", "moi", "toi", "te", "se",
  "le", "la", "les", "un", "une", "des", "de", "du", "au", "aux",
  "et", "ou", "mais", "donc", "ne", "pas", "jamais", "rien", "que", "qui", "quoi", "dont",
  "ce", "cet", "cette", "ces", "cela", "ceci", "mon", "mes", "tes", "ses", "notre", "votre", "leur", "leurs",
  "est", "sont", "suis", "sommes", "avons", "avez", "ont", "avoir", "fait", "faire", "peut", "veut", "doit",
  "pour", "dans", "sur", "sous", "avec", "sans", "chez", "vers", "entre", "depuis", "pendant", "avant", "contre",
  "bien", "tout", "tous", "toute", "toutes", "aussi", "comme", "oui", "alors", "puis", "quand", "parce",
  "encore", "toujours", "peu", "beaucoup", "trop", "assez", "autre", "autres", "chaque", "quel", "quelle", "quels", "quelles",
]);

/** Words that settle the question the other way. `la`, `de`, `un`, `que`,
 *  `il`, `les` are Spanish, Italian, Portuguese and Catalan too, and `est`,
 *  `et`, `qui` are Latin — so *la casa de mi madre es un hotel* scored as
 *  French and had its hotel given a circumflex. One of these on the line,
 *  as a whole word, and the line is not French, whatever else it scores;
 *  each is a function word of one of those languages that neither French
 *  nor English uses (`do`, `com`, `um`, `non`, `con`, `dos`, `es` are left
 *  out for exactly that reason — English has the first four, French `con`,
 *  `dos` and `tu es`). */
const NOT_FRENCH_WORDS = new Set([
  // Spanish
  "el", "los", "las", "del", "por", "para", "una", "pero", "muy", "esta", "este", "como", "yo", "mi", "su", "sus", "mis",
  "porque", "cuando", "donde", "hasta", "desde", "sin",
  // Italian
  "di", "gli", "della", "delle", "dei", "degli", "anche", "questo", "sono", "perché", "più",
  // Portuguese
  "uma", "das", "são", "não",
  // Catalan
  "els", "amb", "dels", "són",
  // Latin
  "quod", "sunt", "ergo", "quae", "enim", "atque",
]);

/** The elisions: `j'ai`, `qu'il`, `n'est`, `c'est`, `l'école`, `d'un`, `s'il`.
 *  The letter is a hit only when the apostrophe follows it — bare `l` or `d`
 *  is nothing, and English has no elision that leaves one of these letters
 *  standing on its own before an apostrophe (`don't` tokenises as `don`). */
const ELISIONS = new Set(["j", "qu", "n", "c", "l", "d", "s", "m", "t"]);

/** Word tokens with their trailing character, so an elision can see its
 *  apostrophe. Letters only — digits, `#tags`, `[[links]]` and URLs are not
 *  words of any language. */
export const TOKEN_RE = /\p{L}+/gu;

/** How many French markers a line carries; `looksFrench` is `>= 2`. Exported
 *  for the tests, which are about the threshold as much as the words. */
export function frenchScore(line: string): number {
  if (NOT_LATIN_RE.test(line)) return 0;
  let score = 0;
  let accented = false;
  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(line); m; m = TOKEN_RE.exec(line)) {
    const word = m[0];
    if (FRENCH_LETTER_RE.test(word)) {
      accented = true;
      continue;
    }
    const lower = word.toLowerCase();
    if (NOT_FRENCH_WORDS.has(lower)) return 0;
    // A word in capitals is a name or an acronym, not a function word: `UN`,
    // `LA`, `EST`, `ET` are the United Nations, Los Angeles, a time zone and
    // a film studio, and an English meeting note carrying two of them was
    // French. (`Je`, `Il`, `Les` at the head of a sentence still count.)
    if (word.length > 1 && word === word.toUpperCase()) continue;
    if (FRENCH_WORDS.has(lower)) {
      score += 1;
      continue;
    }
    const next = line.charAt(m.index + word.length);
    if ((next === "'" || next === "’") && ELISIONS.has(lower)) score += 1;
  }
  return score + (accented ? 1 : 0);
}

/** True for a line written in French: two French markers, whole words. A
 *  line of English with one French word in it is not French, and a line of
 *  Arabic, Hebrew or CJK never is. */
export function looksFrench(line: string): boolean {
  return frenchScore(line) >= 2;
}

/** The note's own answer, from its frontmatter: `lang: fr` (or `language:
 *  fr`, the key the properties card already offers, or a regional `fr-CA`)
 *  makes every line of the note French without the per-line test. Reads the
 *  frontmatter TEXT — the caller has already cut it out with
 *  shared/textLayout.ts's `frontmatterText`. */
export function noteIsFrench(fmText: string): boolean {
  const m = /^[ \t]*(?:lang|language)[ \t]*:[ \t]*["']?([A-Za-z-]+)["']?[ \t]*$/m.exec(fmText);
  return m !== null && m[1].toLowerCase().split("-")[0] === "fr";
}

