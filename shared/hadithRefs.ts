// Hadith references: `> [!hadith] Bukhari 1` and the corpus note that answers
// it.
//
// PURE, and shared by three parties that must agree letter for letter: the
// indexer, which files every corpus note under a key made from its
// frontmatter (`collection:` + `number:`); the route, which turns the
// callout's text into the same key; and the renderer, which names the
// collection in the chrome's language. The text is the owner's — Astrolabe
// ships no hadith corpus (docs/arabic-and-rtl.md, "Ayah and hadith
// callouts") — so the only thing this module knows is how to spell.
//
// Grammar: `<collection> <number>` — a separator of spaces, ":", "#" or an
// Arabic comma, digits in either numeral system. The collection is matched
// through a small alias table for the books everyone cites (Bukhari,
// البخاري, Sahih al-Bukhari are one key) and otherwise folded to itself, so
// a corpus of "Ibn Hibban" still answers to `[!hadith] Ibn Hibban 12`.

import { foldTerm } from "./fold.ts";

export interface HadithRef {
  /** The canonical collection key — `bukhari`, or a folded custom name. */
  collection: string;
  number: number;
}

interface Collection {
  key: string;
  ar: string;
  en: string;
  aliases: string[];
}

/* prettier-ignore */
const COLLECTIONS: readonly Collection[] = [
  { key: "bukhari", ar: "صحيح البخاري", en: "Sahih al-Bukhari", aliases: ["bukhari", "al-bukhari", "sahih bukhari", "sahih al-bukhari", "البخاري", "بخاري", "صحيح البخاري"] },
  { key: "muslim", ar: "صحيح مسلم", en: "Sahih Muslim", aliases: ["muslim", "sahih muslim", "مسلم", "صحيح مسلم"] },
  { key: "abudawud", ar: "سنن أبي داود", en: "Sunan Abi Dawud", aliases: ["abu dawud", "abi dawud", "abu daud", "abu dawood", "sunan abi dawud", "أبو داود", "أبي داود", "ابو داود", "سنن أبي داود"] },
  { key: "tirmidhi", ar: "جامع الترمذي", en: "Jami' at-Tirmidhi", aliases: ["tirmidhi", "at-tirmidhi", "jami at-tirmidhi", "الترمذي", "ترمذي", "جامع الترمذي", "سنن الترمذي"] },
  { key: "nasai", ar: "سنن النسائي", en: "Sunan an-Nasa'i", aliases: ["nasai", "an-nasai", "sunan an-nasai", "النسائي", "نسائي", "سنن النسائي"] },
  { key: "ibnmajah", ar: "سنن ابن ماجه", en: "Sunan Ibn Majah", aliases: ["ibn majah", "ibn maja", "sunan ibn majah", "ابن ماجه", "ابن ماجة", "سنن ابن ماجه"] },
  { key: "malik", ar: "موطأ مالك", en: "Muwatta Malik", aliases: ["malik", "muwatta", "muwatta malik", "مالك", "الموطأ", "موطأ مالك"] },
  { key: "ahmad", ar: "مسند أحمد", en: "Musnad Ahmad", aliases: ["ahmad", "musnad ahmad", "أحمد", "مسند أحمد"] },
  { key: "nawawi", ar: "الأربعون النووية", en: "An-Nawawi's Forty", aliases: ["nawawi", "40 nawawi", "nawawi 40", "arbain", "النووية", "الأربعون النووية", "الأربعين النووية"] },
  { key: "riyad", ar: "رياض الصالحين", en: "Riyad as-Salihin", aliases: ["riyad", "riyad as-salihin", "riyadh", "رياض الصالحين"] },
];

/** A collection name reduced to what it counts as: folded (shared/fold.ts),
 *  lowercased, spaces and punctuation gone, and the genre words that decorate
 *  a title — Sahih, Sunan, Jami', Musnad, صحيح, سنن — dropped so the book's
 *  own name is what is compared. */
function foldCollection(text: string): string {
  const folded = foldTerm(text.toLowerCase())
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^(?:sahih|sunan|jami|musnad|kitab|صحيح|سنن|جامع|مسند|كتاب)\s+/g, "")
    .replace(/^(?:al|an|ar|as|ash|at|ad|adh|az)\s+/, "")
    .replace(/\s+/g, "");
  return folded.replace(/^ال(?=.{3})/, "");
}

const BY_ALIAS: Map<string, Collection> = (() => {
  const map = new Map<string, Collection>();
  for (const c of COLLECTIONS) {
    map.set(c.key, c);
    for (const alias of c.aliases) map.set(foldCollection(alias), c);
  }
  return map;
})();

/** The key a collection name files under: a known book's canonical key, or
 *  the folded name itself for a book the table has never heard of. Empty for
 *  text that folds away to nothing. */
export function collectionKey(text: string): string {
  const folded = foldCollection(text);
  if (folded === "") return "";
  return BY_ALIAS.get(folded)?.key ?? folded;
}

/** How a collection is named in the chrome's language. A custom collection
 *  has no translation and is shown as the corpus note spelled it. */
export function collectionLabel(key: string, lang: "en" | "ar", asWritten: string): string {
  const known = BY_ALIAS.get(key);
  if (!known) return asWritten;
  return lang === "ar" ? known.ar : known.en;
}

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";

function asciiDigits(text: string): string {
  return text.replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)));
}

const REF_RE = /^\s*(.+?)\s*(?:[:#،,]|\s)\s*#?\s*(\d+)\s*$/;

/** `Bukhari 1`, `Bukhari:1`, `البخاري ١`, `Sahih Muslim #2564` → a reference,
 *  or null when there is no collection or no number in the text. */
export function parseHadithRef(text: string): HadithRef | null {
  const m = REF_RE.exec(asciiDigits(text));
  if (!m) return null;
  const collection = collectionKey(m[1]);
  const number = Number(m[2]);
  if (collection === "" || number < 1) return null;
  return { collection, number };
}

/** The one string the index files a corpus note under and the route looks
 *  up: `bukhari#1`. Built from frontmatter on one side and from the callout's
 *  text on the other, through the same fold. */
export function hadithKey(collection: string, number: number): string {
  return `${collection}#${number}`;
}

/** A corpus note's `collection:` + `number:` frontmatter → its key, or null
 *  when either is missing. `number` arrives as a number from YAML or as a
 *  string from a hand-written `number: "12"`; both are read. */
export function hadithKeyOfFrontmatter(fm: Record<string, unknown>): string | null {
  const raw = fm.collection;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const num = fm.number;
  const n = typeof num === "number" ? num : typeof num === "string" ? Number(asciiDigits(num.trim())) : NaN;
  if (!Number.isInteger(n) || n < 1) return null;
  const key = collectionKey(raw);
  return key === "" ? null : hadithKey(key, n);
}

/** The isnad openers: a paragraph that begins with one of these (pointed or
 *  not) is the chain, and the text after it is the matn. */
const ISNAD_RE = /^(?:حدثنا|حدثني|أخبرنا|أخبرني|اخبرنا|اخبرني|عن\s|سمعت\s|قال\s+حدثنا)/;

/** Split a corpus note's body into the chain of narrators and the text.
 *  The frontmatter's own `chain:` (or `isnad:`) wins when present; otherwise
 *  a first paragraph that opens like an isnad is taken for one, and a body
 *  with no such paragraph is all matn. Markdown is left in place: the caller
 *  renders both halves through the normal pipeline. */
export function splitHadith(
  body: string,
  chainFromFrontmatter?: string | null,
): { chain: string | null; matn: string } {
  const text = body.replace(/\r\n/g, "\n").trim();
  if (chainFromFrontmatter && chainFromFrontmatter.trim() !== "") {
    return { chain: chainFromFrontmatter.trim(), matn: text };
  }
  const paragraphs = text.split(/\n\s*\n/);
  if (paragraphs.length >= 2 && ISNAD_RE.test(foldTerm(paragraphs[0]).trim())) {
    return { chain: paragraphs[0].trim(), matn: paragraphs.slice(1).join("\n\n").trim() };
  }
  return { chain: null, matn: text };
}
