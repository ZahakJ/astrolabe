// NATURAL-LANGUAGE DATES — "tomorrow", "next thursday", "in 3 days",
// "15 september", «غدًا», «الخميس القادم», «بعد ٣ أيام», «١٥ سبتمبر» — read
// into a calendar day.
//
// The editor's `@` completion (client/editor/dateMention.ts) is the door: a
// writer types `@tom`, sees "tomorrow · Wednesday 16 September", presses
// Enter, and a wikilink to that day's daily note lands in the sentence. This
// module is the arithmetic, kept pure so tests/naturalDate.test.ts can drive
// it under node --test with no editor — and bilingual in ONE table rather than
// two, because a phrase table that exists per language is a table that drifts
// per language.
//
// WHAT IS UNDERSTOOD, in both languages: today / tomorrow / yesterday; next
// week and last week; a weekday, bare ("monday" = the coming one, today
// included) or with next/last; "in N days/weeks" and "N days ago"; and a day
// with a month name, with or without a year. What is NOT understood is
// deliberate: bare numerals ("15/9") read differently on every continent, and
// a completion that silently picked one order would insert the wrong day
// with total confidence. A month NAME settles the calendar too — «١٥ رمضان»
// is a Hijri date wherever the site's own calendar setting points, and
// "15 september" a Gregorian one; the site calendar decides only how the
// resolved day is SHOWN, never what a written month means.
//
// A Hijri day is resolved by scanning forward with Intl (the same
// islamic-umalqura tables shared/dates.ts formats with) rather than by any
// lunar arithmetic of this module's own: nothing in this codebase hand-rolls
// a calendar, and the scan is a few hundred cheap formatToParts calls, done
// once per keystroke that spells a Hijri month.

import { HIJRI_CALENDAR } from "./dates.ts";
import { foldQuery } from "./fold.ts";

export type NaturalLang = "en" | "ar";

/** A phrase and the day it names — local noon, like every periodic date
 *  (shared/periodic.ts), so a filename built from it never slips a day for a
 *  reader off Greenwich. */
export interface NaturalDate {
  date: Date;
  /** How the phrase is spelled in the row: the canonical wording when the
   *  input matched a known phrase, the input itself (trimmed) otherwise. */
  phrase: string;
  /** Within a week of today, either way. The insert alias uses this: a near
   *  day reads best as its weekday, a far one as its full date. */
  near: boolean;
}

const DAY_MS = 86_400_000;

/** Local noon of `d`'s day. */
function noon(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
}

function addDays(d: Date, n: number): Date {
  const out = noon(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Eastern Arabic-Indic (and Persian) digits to ASCII, so «٣» and "3" are
 *  the same number to the patterns below. */
function westernDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return String((code >= 0x06f0 ? code - 0x06f0 : code - 0x0660) % 10);
  });
}

/** The fold every pattern is matched against: Latin lowercased, Arabic
 *  hamza/teh-marbuta/alef-maksura folded, harakat dropped, whitespace
 *  collapsed, digits Western. The same fold search uses (shared/fold.ts), so
 *  «غداً», «غدًا» and «غدا» are one word here as they are there. */
export function foldPhrase(input: string): string {
  return foldQuery(westernDigits(input)).replace(/[.,،]+$/g, "").trim();
}

// ── Vocabulary ────────────────────────────────────────────────────────────

/** A word with every spelling it is accepted under, already folded. */
interface Word {
  en: string;
  ar: string;
  /** Folded alternatives, either language. */
  alt?: string[];
}

const TODAY: Word = { en: "today", ar: "اليوم", alt: ["tdy"] };
const TOMORROW: Word = { en: "tomorrow", ar: "غدًا", alt: ["tmrw", "tmr", "بكره", "بكرا"] };
const YESTERDAY: Word = { en: "yesterday", ar: "أمس", alt: ["امس", "البارحه", "مبارح"] };
const NEXT_WEEK: Word = { en: "next week", ar: "الأسبوع القادم", alt: ["الاسبوع القادم", "الاسبوع المقبل", "الأسبوع المقبل", "الاسبوع الجاي"] };
const LAST_WEEK: Word = { en: "last week", ar: "الأسبوع الماضي", alt: ["الاسبوع الماضي", "الاسبوع الفائت", "الأسبوع الفائت"] };

/** Weekdays, Sunday first to match `Date.getDay()`. */
const WEEKDAYS: Word[] = [
  { en: "sunday", ar: "الأحد", alt: ["sun", "الاحد", "احد"] },
  { en: "monday", ar: "الاثنين", alt: ["mon", "الإثنين", "الاثنين", "اثنين", "الأثنين"] },
  { en: "tuesday", ar: "الثلاثاء", alt: ["tue", "tues", "ثلاثاء", "الثلاثا"] },
  { en: "wednesday", ar: "الأربعاء", alt: ["wed", "الاربعاء", "اربعاء", "الاربعا"] },
  { en: "thursday", ar: "الخميس", alt: ["thu", "thur", "thurs", "خميس"] },
  { en: "friday", ar: "الجمعة", alt: ["fri", "الجمعه", "جمعه"] },
  { en: "saturday", ar: "السبت", alt: ["sat", "سبت"] },
];

/** Gregorian months, January first. The Arabic column is the Egyptian/Gulf
 *  set Intl prints for `ar`; the Levantine names (كانون الثاني…) are
 *  alternatives, because a writer in Damascus types those. */
const MONTHS: Word[] = [
  { en: "january", ar: "يناير", alt: ["jan", "كانون الثاني", "كانون ثاني"] },
  { en: "february", ar: "فبراير", alt: ["feb", "شباط"] },
  { en: "march", ar: "مارس", alt: ["mar", "اذار", "آذار"] },
  { en: "april", ar: "أبريل", alt: ["apr", "ابريل", "افريل", "نيسان"] },
  { en: "may", ar: "مايو", alt: ["ايار", "أيار", "ماي"] },
  { en: "june", ar: "يونيو", alt: ["jun", "حزيران", "يونيه", "جوان"] },
  { en: "july", ar: "يوليو", alt: ["jul", "تموز", "يوليه", "جويلية"] },
  { en: "august", ar: "أغسطس", alt: ["aug", "اغسطس", "اب", "آب", "اوت"] },
  { en: "september", ar: "سبتمبر", alt: ["sep", "sept", "ايلول", "أيلول"] },
  { en: "october", ar: "أكتوبر", alt: ["oct", "اكتوبر", "تشرين الاول", "تشرين الأول", "تشرين اول"] },
  { en: "november", ar: "نوفمبر", alt: ["nov", "تشرين الثاني", "تشرين ثاني"] },
  { en: "december", ar: "ديسمبر", alt: ["dec", "كانون الاول", "كانون الأول", "كانون اول"] },
];

/** Hijri months, Muharram first — with the transliterations a Latin
 *  keyboard produces. A Hijri month NAME is what makes a written date Hijri. */
const HIJRI_MONTHS: Word[] = [
  { en: "muharram", ar: "محرم", alt: ["muharrem", "المحرم"] },
  { en: "safar", ar: "صفر", alt: [] },
  { en: "rabi al-awwal", ar: "ربيع الأول", alt: ["rabi i", "rabi' al-awwal", "rabi al awwal", "rabi 1", "ربيع الاول", "ربيع اول"] },
  { en: "rabi al-thani", ar: "ربيع الآخر", alt: ["rabi ii", "rabi' al-thani", "rabi al thani", "rabi al-akhir", "rabi 2", "ربيع الاخر", "ربيع الثاني", "ربيع ثاني"] },
  { en: "jumada al-ula", ar: "جمادى الأولى", alt: ["jumada i", "jumada al-awwal", "jumada al ula", "jumada 1", "جمادى الاولى", "جمادى الاول", "جمادى اولى"] },
  { en: "jumada al-akhirah", ar: "جمادى الآخرة", alt: ["jumada ii", "jumada al-thani", "jumada al akhirah", "jumada 2", "جمادى الاخره", "جمادى الثانيه", "جمادى الاخره"] },
  { en: "rajab", ar: "رجب", alt: [] },
  { en: "shaban", ar: "شعبان", alt: ["sha'ban", "sha ban", "shaaban"] },
  { en: "ramadan", ar: "رمضان", alt: ["ramadhan", "ramazan"] },
  { en: "shawwal", ar: "شوال", alt: ["shawal"] },
  { en: "dhu al-qadah", ar: "ذو القعدة", alt: ["dhul qadah", "dhu al qadah", "dhul-qadah", "dhu al-qi'dah", "ذو القعده", "ذي القعده", "ذي القعدة"] },
  { en: "dhu al-hijjah", ar: "ذو الحجة", alt: ["dhul hijjah", "dhu al hijjah", "dhul-hijjah", "ذو الحجه", "ذي الحجه", "ذي الحجة"] },
];

/** Every folded spelling of a word, canonical first. */
function spellings(word: Word): string[] {
  return [word.en, word.ar, ...(word.alt ?? [])].map(foldPhrase);
}

function matchWord(folded: string, word: Word): boolean {
  return spellings(word).includes(folded);
}

/** Index of the word in `table` whose spelling is exactly `folded`. */
function indexIn(folded: string, table: Word[]): number {
  return table.findIndex((word) => matchWord(folded, word));
}

/** The canonical spelling of a word in `lang`. */
function say(word: Word, lang: NaturalLang): string {
  return lang === "ar" ? word.ar : word.en;
}

// ── Parsing ───────────────────────────────────────────────────────────────

const NEXT_AR = /^(?:يوم )?(.+?) (?:القادم|القادمه|المقبل|المقبله|الجاي|الجايه|القادمة|المقبلة)$/;
const LAST_AR = /^(?:يوم )?(.+?) (?:الماضي|الماضيه|الماضية|الفائت|الفائته|السابق|السابقه)$/;

/** An amount word: "3", "a"/"an" (one), Arabic dual endings are handled by
 *  the callers' own regexes. */
function amount(text: string): number | null {
  if (text === "a" || text === "an" || text === "one") return 1;
  if (/^\d{1,3}$/.test(text)) return Number(text);
  return null;
}

/** "next friday" / «الجمعة القادمة»: the qualifier agrees with the noun in
 *  Arabic (Friday is the one feminine weekday), and follows it. */
function weekdayPhrase(idx: number, q: "next" | "last" | null, lang: NaturalLang): string {
  const day = say(WEEKDAYS[idx], lang);
  if (q === null) return day;
  if (lang === "en") return `${q} ${day}`;
  const feminine = idx === 5;
  if (q === "next") return `${day} ${feminine ? "القادمة" : "القادم"}`;
  return `${day} ${feminine ? "الماضية" : "الماضي"}`;
}

/** The day `weekdayIndex` next falls on. `strict` skips today. */
function upcoming(now: Date, weekdayIndex: number, strict: boolean): Date {
  let delta = (weekdayIndex - now.getDay() + 7) % 7;
  if (delta === 0 && strict) delta = 7;
  return addDays(now, delta);
}

/** The day `weekdayIndex` last fell on, strictly before today. */
function previous(now: Date, weekdayIndex: number): Date {
  let delta = (now.getDay() - weekdayIndex + 7) % 7;
  if (delta === 0) delta = 7;
  return addDays(now, -delta);
}

/** A written day-and-month, either order, with an optional year:
 *  "15 september", "september 15", "sep 15, 2026", "15 sept 2026",
 *  «15 سبتمبر», «15 رمضان 1448». Returns the day number, the month text and
 *  the year, or null when the shape is not that. */
function splitDayMonth(folded: string): { day: number; month: string; year: number | null } | null {
  let m = /^(\d{1,2})(?:st|nd|rd|th)? ([^\d]+?)(?: (\d{4}))?$/.exec(folded);
  if (m) return { day: Number(m[1]), month: m[2].trim(), year: m[3] ? Number(m[3]) : null };
  m = /^([^\d]+?) (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/.exec(folded);
  if (m) return { day: Number(m[2]), month: m[1].trim(), year: m[3] ? Number(m[3]) : null };
  return null;
}

/** The Hijri year/month/day of a Gregorian day, by Intl. Null on an ICU
 *  build without the Umm al-Qura tables — then a Hijri phrase simply does not
 *  resolve, which is honest. */
let hijriFormatter: Intl.DateTimeFormat | undefined;

function hijriParts(d: Date): { year: number; month: number; day: number } | null {
  try {
    // Built once and kept: a scan is hundreds of these calls per keystroke,
    // and constructing an Intl.DateTimeFormat costs more than formatting
    // with one — the scan with a fresh formatter each time was the whole
    // budget of a keystroke; with one kept it is a few milliseconds.
    if (hijriFormatter === undefined) {
      hijriFormatter = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
        calendar: HIJRI_CALENDAR,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        numberingSystem: "latn",
      });
    }
    const fmt = hijriFormatter;
    const fields: Record<string, string> = {};
    for (const part of fmt.formatToParts(d)) fields[part.type] = part.value;
    const year = Number.parseInt(fields.year ?? "", 10);
    const month = Number.parseInt(fields.month ?? "", 10);
    const day = Number.parseInt(fields.day ?? "", 10);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return { year, month, day };
  } catch {
    return null;
  }
}

/** The next day on or after `now` whose Hijri date is `month`/`day` (of
 *  `year`, when one was written). Scans forward one Hijri year plus a
 *  month; with a year, scans the whole span between now and that year. */
function hijriDay(now: Date, month: number, day: number, year: number | null): Date | null {
  const today = hijriParts(now);
  if (today === null) return null;
  if (year !== null && (year < today.year - 200 || year > today.year + 200)) return null;
  // Without a year: the coming occurrence, like a Gregorian "15 september",
  // found inside the next lunar year and a bit. With one: the year delta
  // (354.37 days a Hijri year) puts the scan's start within reach of the
  // target and it walks a window wide enough that the approximation cannot
  // miss — about 800 formatToParts calls at the very worst, and only for a
  // phrase that spelled a Hijri month AND a year.
  const years = year === null ? 0 : year - today.year;
  const start = year === null ? noon(now) : addDays(now, Math.round(years * 354.37) - 400);
  const span = year === null ? 440 : 800;
  for (let i = 0; i < span; i++) {
    const d = addDays(start, i);
    const h = hijriParts(d);
    if (h === null) return null;
    if (h.month === month && h.day === day && (year === null || h.year === year)) {
      if (year !== null || d.getTime() >= noon(now).getTime()) return d;
    }
  }
  return null;
}

/** Read `input` as a day. `now` is injectable so a test is a test. */
export function parseNaturalDate(input: string, now: Date, lang: NaturalLang = "en"): NaturalDate | null {
  const folded = foldPhrase(input);
  if (folded === "") return null;
  const near = (date: Date, phrase: string): NaturalDate => ({
    date,
    phrase,
    near: Math.abs(date.getTime() - noon(now).getTime()) <= 7 * DAY_MS,
  });

  if (matchWord(folded, TODAY)) return near(noon(now), say(TODAY, lang));
  if (matchWord(folded, TOMORROW)) return near(addDays(now, 1), say(TOMORROW, lang));
  if (matchWord(folded, YESTERDAY)) return near(addDays(now, -1), say(YESTERDAY, lang));
  if (matchWord(folded, NEXT_WEEK)) return near(addDays(now, 7), say(NEXT_WEEK, lang));
  if (matchWord(folded, LAST_WEEK)) return near(addDays(now, -7), say(LAST_WEEK, lang));

  // Weekdays: bare, "next …", "this …", "last …" — and the Arabic forms,
  // where the qualifier follows the noun and agrees with it (الجمعة
  // القادمة, الخميس القادم). A bare weekday is the coming one, today
  // included; "next" skips today, so "next monday" on a Monday is a week off.
  let m = /^(?:(next|this|last|coming) )?(.+?)$/.exec(folded);
  if (m) {
    // «يوم الخميس» is «الخميس» with the word "day" in front, as Arabic says it.
    const idx = indexIn(m[2].replace(/^يوم /, ""), WEEKDAYS);
    if (idx !== -1) {
      const q = m[1] === "last" ? "last" : m[1] === "next" ? "next" : null;
      return near(q === "last" ? previous(now, idx) : upcoming(now, idx, q === "next"), weekdayPhrase(idx, q, lang));
    }
  }
  m = NEXT_AR.exec(folded);
  if (m) {
    const idx = indexIn(m[1], WEEKDAYS);
    if (idx !== -1) return near(upcoming(now, idx, true), weekdayPhrase(idx, "next", lang));
  }
  m = LAST_AR.exec(folded);
  if (m) {
    const idx = indexIn(m[1], WEEKDAYS);
    if (idx !== -1) return near(previous(now, idx), weekdayPhrase(idx, "last", lang));
  }

  // Distances. English "in 3 days" / "3 days ago" / "in a week"; Arabic
  // «بعد ٣ أيام» / «قبل أسبوعين» / «بعد يوم», with the dual carrying its
  // own number.
  m = /^in (\S+) (day|days|week|weeks|wk|wks)$/.exec(folded);
  if (m) {
    const n = amount(m[1]);
    if (n !== null) return near(addDays(now, n * (m[2].startsWith("w") ? 7 : 1)), folded);
  }
  m = /^(\S+) (day|days|week|weeks|wk|wks) ago$/.exec(folded);
  if (m) {
    const n = amount(m[1]);
    if (n !== null) return near(addDays(now, -n * (m[2].startsWith("w") ? 7 : 1)), folded);
  }
  m = /^(بعد|قبل) (?:(\d{1,3}) )?(يوم|ايام|يومين|اسبوع|اسابيع|اسبوعين)$/.exec(folded);
  if (m) {
    const unit = m[3];
    // Both plurals: «أسبوع/أسبوعين» begin اسب after the fold, «أسابيع» اسا
    // — the broken plural changes the second letter, and a test on the
    // first three read "three weeks ago" as three days.
    const weeks = unit.startsWith("اس");
    let n: number;
    if (m[2] !== undefined) n = Number(m[2]);
    else if (unit === "يومين" || unit === "اسبوعين") n = 2;
    else n = 1;
    const sign = m[1] === "بعد" ? 1 : -1;
    return near(addDays(now, sign * n * (weeks ? 7 : 1)), input.trim());
  }

  // A day with a month name — the month decides the calendar.
  const dm = splitDayMonth(folded);
  if (dm && dm.day >= 1 && dm.day <= 31) {
    const g = indexIn(dm.month, MONTHS);
    if (g !== -1) {
      const year = dm.year;
      const candidate = (y: number): Date | null => {
        const d = new Date(y, g, dm.day, 12);
        return d.getMonth() === g && d.getDate() === dm.day ? d : null;
      };
      if (year !== null) {
        const d = candidate(year);
        return d ? near(d, input.trim()) : null;
      }
      // No year: this year's if it is still ahead (today included), else
      // next year's — a written date is almost always an appointment.
      const thisYear = candidate(now.getFullYear());
      if (thisYear && thisYear.getTime() >= noon(now).getTime()) return near(thisYear, input.trim());
      const nextYear = candidate(now.getFullYear() + 1);
      return nextYear ? near(nextYear, input.trim()) : null;
    }
    const h = indexIn(dm.month, HIJRI_MONTHS);
    if (h !== -1 && dm.day <= 30) {
      const d = hijriDay(now, h + 1, dm.day, dm.year);
      return d ? near(d, input.trim()) : null;
    }
  }
  return null;
}

// ── Suggestions ───────────────────────────────────────────────────────────

/** The phrases offered before anything is typed, in the order a writer
 *  reaches for them: the three anchors, then the week, then each weekday
 *  from tomorrow onward — so the row a writer wants is never below a day
 *  that has already passed. */
export function naturalDatePhrases(now: Date, lang: NaturalLang): NaturalDate[] {
  const out: NaturalDate[] = [];
  const push = (text: string): void => {
    const parsed = parseNaturalDate(text, now, lang);
    if (parsed) out.push(parsed);
  };
  push(say(TODAY, lang));
  push(say(TOMORROW, lang));
  push(say(YESTERDAY, lang));
  push(say(NEXT_WEEK, lang));
  for (let i = 1; i <= 7; i++) push(weekdayPhrase((now.getDay() + i) % 7, "next", lang));
  return out;
}

/** What the completion shows for `typed`: the standing phrases whose folded
 *  spelling starts with the folded input — in either language, because a
 *  writer on an Arabic chrome may still type "tom" — and, first, the input
 *  itself when it reads as a date of its own and is not already one of the
 *  rows ("in 3 days", "15 september", a bare "thursday"). Empty when nothing
 *  matches, which closes the popup. */
export function naturalDateSuggestions(typed: string, now: Date, lang: NaturalLang): NaturalDate[] {
  const folded = foldPhrase(typed);
  const standing = naturalDatePhrases(now, lang);
  if (folded === "") return standing;
  const twins = naturalDatePhrases(now, lang === "ar" ? "en" : "ar");
  const rows = standing.filter((row, i) => {
    const heads = [foldPhrase(row.phrase), twins[i] ? foldPhrase(twins[i].phrase) : ""];
    // A word start anywhere in the phrase, so "thu" reaches "next thursday".
    return heads.some((h) => h !== "" && (h.startsWith(folded) || h.includes(` ${folded}`)));
  });
  const parsed = parseNaturalDate(typed, now, lang);
  if (parsed && !rows.some((row) => foldPhrase(row.phrase) === foldPhrase(parsed.phrase))) rows.unshift(parsed);
  return rows;
}
