// Quran references: the 114 surahs and the grammar of `> [!ayah] 2:255`.
//
// PURE, like shared/tracker.ts and for the same two reasons: `node --test`
// loads it without a DOM, and the editor's autocomplete, the reading renderer
// and the tests must all agree on what a reference IS. The verse TEXT is not
// here — it is 1.3 MB of Uthmani script in client/data/quran-uthmani.json and
// reaches a page only through a dynamic import when an ayah callout is on it
// (client/reading/ayah.ts). This module is the part every surface may hold.
//
// The grammar, deliberately tolerant because a reference is typed from memory
// in whichever script the writer is thinking in:
//
//   <surah><sep><ayah>[<dash><ayah>]
//   surah  := 1–114 | an Arabic name (البقرة, with or without ال, pointed or
//             not, «سورة» prefix allowed) | an English transliteration
//             (Al-Baqarah, al baqarah, Baqara — article, hyphens, apostrophes
//             and the final -h are all optional)
//   sep    := ":" | "：" | "/" | whitespace
//   ayah   := digits, ASCII or Arabic-Indic
//   dash   := "-" | "–" | "—"
//
// A reference that names a verse the surah does not have is NOT a reference
// (`2:290` → null): the renderer then falls back to an ordinary quote callout
// wearing the text as its title, which is the "never broken" rule the
// tracker's unparseable-fence fallback already set.

import { foldTerm } from "./fold.ts";

export interface Surah {
  /** 1-based number, the one every mushaf prints. */
  n: number;
  /** The Arabic name, with its article where it has one. */
  ar: string;
  /** The common English transliteration (Tanzil's spellings). */
  en: string;
  /** How many ayat the surah has — the upper bound a reference may name. */
  ayahs: number;
}

export interface AyahRef {
  surah: number;
  from: number;
  /** Inclusive; equals `from` for a single verse. */
  to: number;
}

/* prettier-ignore */
export const SURAHS: readonly Surah[] = [
  { n: 1, ar: "الفاتحة", en: "Al-Fatihah", ayahs: 7 },
  { n: 2, ar: "البقرة", en: "Al-Baqarah", ayahs: 286 },
  { n: 3, ar: "آل عمران", en: "Ali 'Imran", ayahs: 200 },
  { n: 4, ar: "النساء", en: "An-Nisa", ayahs: 176 },
  { n: 5, ar: "المائدة", en: "Al-Ma'idah", ayahs: 120 },
  { n: 6, ar: "الأنعام", en: "Al-An'am", ayahs: 165 },
  { n: 7, ar: "الأعراف", en: "Al-A'raf", ayahs: 206 },
  { n: 8, ar: "الأنفال", en: "Al-Anfal", ayahs: 75 },
  { n: 9, ar: "التوبة", en: "At-Tawbah", ayahs: 129 },
  { n: 10, ar: "يونس", en: "Yunus", ayahs: 109 },
  { n: 11, ar: "هود", en: "Hud", ayahs: 123 },
  { n: 12, ar: "يوسف", en: "Yusuf", ayahs: 111 },
  { n: 13, ar: "الرعد", en: "Ar-Ra'd", ayahs: 43 },
  { n: 14, ar: "إبراهيم", en: "Ibrahim", ayahs: 52 },
  { n: 15, ar: "الحجر", en: "Al-Hijr", ayahs: 99 },
  { n: 16, ar: "النحل", en: "An-Nahl", ayahs: 128 },
  { n: 17, ar: "الإسراء", en: "Al-Isra", ayahs: 111 },
  { n: 18, ar: "الكهف", en: "Al-Kahf", ayahs: 110 },
  { n: 19, ar: "مريم", en: "Maryam", ayahs: 98 },
  { n: 20, ar: "طه", en: "Ta-Ha", ayahs: 135 },
  { n: 21, ar: "الأنبياء", en: "Al-Anbiya", ayahs: 112 },
  { n: 22, ar: "الحج", en: "Al-Hajj", ayahs: 78 },
  { n: 23, ar: "المؤمنون", en: "Al-Mu'minun", ayahs: 118 },
  { n: 24, ar: "النور", en: "An-Nur", ayahs: 64 },
  { n: 25, ar: "الفرقان", en: "Al-Furqan", ayahs: 77 },
  { n: 26, ar: "الشعراء", en: "Ash-Shu'ara", ayahs: 227 },
  { n: 27, ar: "النمل", en: "An-Naml", ayahs: 93 },
  { n: 28, ar: "القصص", en: "Al-Qasas", ayahs: 88 },
  { n: 29, ar: "العنكبوت", en: "Al-'Ankabut", ayahs: 69 },
  { n: 30, ar: "الروم", en: "Ar-Rum", ayahs: 60 },
  { n: 31, ar: "لقمان", en: "Luqman", ayahs: 34 },
  { n: 32, ar: "السجدة", en: "As-Sajdah", ayahs: 30 },
  { n: 33, ar: "الأحزاب", en: "Al-Ahzab", ayahs: 73 },
  { n: 34, ar: "سبأ", en: "Saba", ayahs: 54 },
  { n: 35, ar: "فاطر", en: "Fatir", ayahs: 45 },
  { n: 36, ar: "يس", en: "Ya-Sin", ayahs: 83 },
  { n: 37, ar: "الصافات", en: "As-Saffat", ayahs: 182 },
  { n: 38, ar: "ص", en: "Sad", ayahs: 88 },
  { n: 39, ar: "الزمر", en: "Az-Zumar", ayahs: 75 },
  { n: 40, ar: "غافر", en: "Ghafir", ayahs: 85 },
  { n: 41, ar: "فصلت", en: "Fussilat", ayahs: 54 },
  { n: 42, ar: "الشورى", en: "Ash-Shura", ayahs: 53 },
  { n: 43, ar: "الزخرف", en: "Az-Zukhruf", ayahs: 89 },
  { n: 44, ar: "الدخان", en: "Ad-Dukhan", ayahs: 59 },
  { n: 45, ar: "الجاثية", en: "Al-Jathiyah", ayahs: 37 },
  { n: 46, ar: "الأحقاف", en: "Al-Ahqaf", ayahs: 35 },
  { n: 47, ar: "محمد", en: "Muhammad", ayahs: 38 },
  { n: 48, ar: "الفتح", en: "Al-Fath", ayahs: 29 },
  { n: 49, ar: "الحجرات", en: "Al-Hujurat", ayahs: 18 },
  { n: 50, ar: "ق", en: "Qaf", ayahs: 45 },
  { n: 51, ar: "الذاريات", en: "Adh-Dhariyat", ayahs: 60 },
  { n: 52, ar: "الطور", en: "At-Tur", ayahs: 49 },
  { n: 53, ar: "النجم", en: "An-Najm", ayahs: 62 },
  { n: 54, ar: "القمر", en: "Al-Qamar", ayahs: 55 },
  { n: 55, ar: "الرحمن", en: "Ar-Rahman", ayahs: 78 },
  { n: 56, ar: "الواقعة", en: "Al-Waqi'ah", ayahs: 96 },
  { n: 57, ar: "الحديد", en: "Al-Hadid", ayahs: 29 },
  { n: 58, ar: "المجادلة", en: "Al-Mujadilah", ayahs: 22 },
  { n: 59, ar: "الحشر", en: "Al-Hashr", ayahs: 24 },
  { n: 60, ar: "الممتحنة", en: "Al-Mumtahanah", ayahs: 13 },
  { n: 61, ar: "الصف", en: "As-Saff", ayahs: 14 },
  { n: 62, ar: "الجمعة", en: "Al-Jumu'ah", ayahs: 11 },
  { n: 63, ar: "المنافقون", en: "Al-Munafiqun", ayahs: 11 },
  { n: 64, ar: "التغابن", en: "At-Taghabun", ayahs: 18 },
  { n: 65, ar: "الطلاق", en: "At-Talaq", ayahs: 12 },
  { n: 66, ar: "التحريم", en: "At-Tahrim", ayahs: 12 },
  { n: 67, ar: "الملك", en: "Al-Mulk", ayahs: 30 },
  { n: 68, ar: "القلم", en: "Al-Qalam", ayahs: 52 },
  { n: 69, ar: "الحاقة", en: "Al-Haqqah", ayahs: 52 },
  { n: 70, ar: "المعارج", en: "Al-Ma'arij", ayahs: 44 },
  { n: 71, ar: "نوح", en: "Nuh", ayahs: 28 },
  { n: 72, ar: "الجن", en: "Al-Jinn", ayahs: 28 },
  { n: 73, ar: "المزمل", en: "Al-Muzzammil", ayahs: 20 },
  { n: 74, ar: "المدثر", en: "Al-Muddaththir", ayahs: 56 },
  { n: 75, ar: "القيامة", en: "Al-Qiyamah", ayahs: 40 },
  { n: 76, ar: "الإنسان", en: "Al-Insan", ayahs: 31 },
  { n: 77, ar: "المرسلات", en: "Al-Mursalat", ayahs: 50 },
  { n: 78, ar: "النبأ", en: "An-Naba", ayahs: 40 },
  { n: 79, ar: "النازعات", en: "An-Nazi'at", ayahs: 46 },
  { n: 80, ar: "عبس", en: "'Abasa", ayahs: 42 },
  { n: 81, ar: "التكوير", en: "At-Takwir", ayahs: 29 },
  { n: 82, ar: "الانفطار", en: "Al-Infitar", ayahs: 19 },
  { n: 83, ar: "المطففين", en: "Al-Mutaffifin", ayahs: 36 },
  { n: 84, ar: "الانشقاق", en: "Al-Inshiqaq", ayahs: 25 },
  { n: 85, ar: "البروج", en: "Al-Buruj", ayahs: 22 },
  { n: 86, ar: "الطارق", en: "At-Tariq", ayahs: 17 },
  { n: 87, ar: "الأعلى", en: "Al-A'la", ayahs: 19 },
  { n: 88, ar: "الغاشية", en: "Al-Ghashiyah", ayahs: 26 },
  { n: 89, ar: "الفجر", en: "Al-Fajr", ayahs: 30 },
  { n: 90, ar: "البلد", en: "Al-Balad", ayahs: 20 },
  { n: 91, ar: "الشمس", en: "Ash-Shams", ayahs: 15 },
  { n: 92, ar: "الليل", en: "Al-Layl", ayahs: 21 },
  { n: 93, ar: "الضحى", en: "Ad-Duha", ayahs: 11 },
  { n: 94, ar: "الشرح", en: "Ash-Sharh", ayahs: 8 },
  { n: 95, ar: "التين", en: "At-Tin", ayahs: 8 },
  { n: 96, ar: "العلق", en: "Al-'Alaq", ayahs: 19 },
  { n: 97, ar: "القدر", en: "Al-Qadr", ayahs: 5 },
  { n: 98, ar: "البينة", en: "Al-Bayyinah", ayahs: 8 },
  { n: 99, ar: "الزلزلة", en: "Az-Zalzalah", ayahs: 8 },
  { n: 100, ar: "العاديات", en: "Al-'Adiyat", ayahs: 11 },
  { n: 101, ar: "القارعة", en: "Al-Qari'ah", ayahs: 11 },
  { n: 102, ar: "التكاثر", en: "At-Takathur", ayahs: 8 },
  { n: 103, ar: "العصر", en: "Al-'Asr", ayahs: 3 },
  { n: 104, ar: "الهمزة", en: "Al-Humazah", ayahs: 9 },
  { n: 105, ar: "الفيل", en: "Al-Fil", ayahs: 5 },
  { n: 106, ar: "قريش", en: "Quraysh", ayahs: 4 },
  { n: 107, ar: "الماعون", en: "Al-Ma'un", ayahs: 7 },
  { n: 108, ar: "الكوثر", en: "Al-Kawthar", ayahs: 3 },
  { n: 109, ar: "الكافرون", en: "Al-Kafirun", ayahs: 6 },
  { n: 110, ar: "النصر", en: "An-Nasr", ayahs: 3 },
  { n: 111, ar: "المسد", en: "Al-Masad", ayahs: 5 },
  { n: 112, ar: "الإخلاص", en: "Al-Ikhlas", ayahs: 4 },
  { n: 113, ar: "الفلق", en: "Al-Falaq", ayahs: 5 },
  { n: 114, ar: "الناس", en: "An-Nas", ayahs: 6 },
];

/** Total verses in the mushaf — what client/data/quran-uthmani.json must hold. */
export const AYAH_COUNT = 6236;

// ── Folding ─────────────────────────────────────────────────────────────────

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_INDIC = "۰۱۲۳۴۵۶۷۸۹";

/** Arabic-Indic (and Persian) digits → ASCII, everything else untouched. */
function asciiDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (d) => {
    const i = ARABIC_INDIC.indexOf(d);
    return String(i >= 0 ? i : EXTENDED_INDIC.indexOf(d));
  });
}

/** A transliteration reduced the same way: lowercase letters only, and a
 *  final -h dropped — "Baqarah" and "Baqara" are one name. */
function foldLatin(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "").replace(/h$/, "");
}

/** The assimilated article off the front of a folded transliteration —
 *  al-, an-, ar-, as-, ash-, at-, ad-, adh-, az- — when a whole name is left
 *  behind it. Longer forms first: "ashshura" must lose "ash", not "as". */
function bareLatin(key: string): string {
  return key.replace(/^a(?:sh|dh|l|n|r|s|t|d|z)(?=[a-z]{3})/, "");
}

/** Every key a surah answers to: its Arabic name with and without «ال», its
 *  transliteration with and without the article. BOTH forms are filed, and
 *  the lookup tries the typed text as-is before stripping anything — because
 *  a stripper that ran on both sides took "anbiya" (Al-Anbiya without its
 *  article) for "an-" + "biya" and found nothing. */
const BY_KEY: Map<string, Surah> = (() => {
  const map = new Map<string, Surah>();
  const file = (key: string, s: Surah): void => {
    if (key !== "" && !map.has(key)) map.set(key, s);
  };
  for (const s of SURAHS) {
    const ar = foldTerm(s.ar).replace(/\s+/g, "");
    file(ar, s);
    file(ar.replace(/^ال/, ""), s);
    const en = foldLatin(s.en);
    file(en, s);
    file(bareLatin(en), s);
  }
  // Spellings a reader reaches for that the fold cannot derive from Tanzil's
  // own: the third surah's name alone is written a dozen ways in English.
  const extra: [string, number][] = [
    ["imran", 3],
    ["alimran", 3],
    ["aalimran", 3],
    ["nisa", 4],
    ["maida", 5],
    ["dhuha", 93],
    ["yaseen", 36],
    ["hujraat", 49],
    ["rahmaan", 55],
  ];
  for (const [key, n] of extra) file(foldLatin(key), SURAHS[n - 1]);
  return map;
})();

/** The surah a typed name or number means, or null. */
export function findSurah(text: string): Surah | null {
  const raw = asciiDigits(text).trim().replace(/^سورة\s+/, "").replace(/^surah?\s+/i, "");
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    return n >= 1 && n <= 114 ? SURAHS[n - 1] : null;
  }
  if (/[\u0600-\u06ff]/.test(raw)) {
    const key = foldTerm(raw).replace(/\s+/g, "");
    return BY_KEY.get(key) ?? BY_KEY.get(key.replace(/^ال/, "")) ?? null;
  }
  const latin = foldLatin(raw);
  if (latin === "") return null;
  return BY_KEY.get(latin) ?? BY_KEY.get(bareLatin(latin)) ?? null;
}

// ── The reference ───────────────────────────────────────────────────────────

const WITH_SEP = /^\s*(.+?)\s*[:：/]\s*(\d+)\s*(?:[-–—]\s*(\d+))?\s*$/;
const WITH_SPACE = /^\s*(.+?)\s+(\d+)\s*(?:[-–—]\s*(\d+))?\s*$/;

/** `2:255`, `2:255-257`, `البقرة:255`, `البقرة ٢٥٥`, `Al-Baqarah 255` → a
 *  reference, or null when the text names no verse the mushaf has. */
export function parseAyahRef(text: string): AyahRef | null {
  const ascii = asciiDigits(text);
  const m = WITH_SEP.exec(ascii) ?? WITH_SPACE.exec(ascii);
  if (!m) return null;
  const surah = findSurah(m[1]);
  if (!surah) return null;
  const from = Number(m[2]);
  const to = m[3] === undefined ? from : Number(m[3]);
  if (from < 1 || to < from || to > surah.ayahs) return null;
  return { surah: surah.n, from, to };
}

/** The caption under a verse: «البقرة ٢٥٥» / «البقرة ٢٥٥–٢٥٧» in Arabic
 *  chrome, "Al-Baqarah 2:255" / "Al-Baqarah 2:255–257" in English.
 *
 *  The Arabic caption uses Arabic-Indic digits ON PURPOSE, against the
 *  instance-wide Western-digits rule in shared/numerals.ts: that rule is
 *  about the chrome, and this caption is part of the quotation — a mushaf
 *  numbers its verses ٢٥٥, and a reader who has one open will look for the
 *  same figure. The en form carries the surah number too, because an English
 *  reader cites "2:255", not a name. */
export function formatAyahRef(ref: AyahRef, lang: "en" | "ar"): string {
  const s = SURAHS[ref.surah - 1];
  const range = ref.to === ref.from ? `${ref.from}` : `${ref.from}–${ref.to}`;
  if (lang === "ar") {
    const digits = range.replace(/[0-9]/g, (d) => ARABIC_INDIC[Number(d)]);
    return `${s.ar} ${digits}`;
  }
  return `${s.en} ${s.n}:${range}`;
}

/** Surahs whose name (either script) or number starts with — then contains —
 *  what was typed, in mushaf order within each tier. The editor's popup
 *  inside `> [!ayah] ` draws from this; empty input lists all 114. */
export function matchSurahs(typed: string): Surah[] {
  const raw = asciiDigits(typed).trim();
  if (raw === "") return [...SURAHS];
  if (/^\d+$/.test(raw)) return SURAHS.filter((s) => String(s.n).startsWith(raw));
  const arabic = /[\u0600-\u06ff]/.test(raw);
  const needle = arabic ? foldTerm(raw).replace(/\s+/g, "").replace(/^ال/, "") : foldLatin(raw);
  if (needle === "") return [];
  const prefix: Surah[] = [];
  const inside: Surah[] = [];
  for (const s of SURAHS) {
    // Both the full and the bare form: "al" lists every Al- surah, "baq"
    // still finds Al-Baqarah, and «الب» and «ب» both reach it in Arabic.
    const full = arabic ? foldTerm(s.ar).replace(/\s+/g, "") : foldLatin(s.en);
    const bare = arabic ? full.replace(/^ال/, "") : bareLatin(full);
    if (full.startsWith(needle) || bare.startsWith(needle)) prefix.push(s);
    else if (full.includes(needle)) inside.push(s);
  }
  return [...prefix, ...inside];
}
