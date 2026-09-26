// Tiny chrome-string localizer. The app chrome speaks the instance language
// (settings.language / SITE_LANG env, via /api/me): every user-facing chrome
// string funnels through t()/tf() below. Note CONTENT is never translated —
// it renders as authored (per-block dir=auto handles mixed scripts).
//
// Components that render t() strings should subscribe to the store's
// `language` field so a live settings change re-renders them; state.ts calls
// setLang() before it commits the new language to the store.

import { numeralSystem, toNumerals, type NumeralSystem } from "../shared/numerals.ts";
// The key list is the English file's (client/i18n/en.ts). A TYPE import: the
// strings themselves are fetched, never bundled here.
import type { I18nKey } from "./i18n/en.ts";

export type { I18nKey };

export type Lang = "en" | "ar";

let current: Lang = "en";
let numerals: NumeralSystem = "latn";

/** Set the active chrome language (state.ts owns the call — after the
 *  language's dictionary is installed; see whenDictionary below). */
export function setLang(lang: Lang): void {
  current = lang;
}

export function getLang(): Lang {
  return current;
}

/** Set the instance's date locale — it decides the numerals EVERY number in
 *  the chrome is rendered in, not just the dates (state.ts owns the call). */
export function setNumeralLocale(locale: string): void {
  numerals = numeralSystem(locale);
}

/** The active numbering system (chrome counts + dates agree by construction). */
export function getNumerals(): NumeralSystem {
  return numerals;
}

/** A bare number in the instance's numeral system ("3" / "٣"), grouped in
 *  thousands ("1,214" / "١٬٢١٤"). Grouping is not decoration: every caller is
 *  a COUNT, and the one that matters most sits in a dialog whose whole job is
 *  conveying magnitude before a subtree is erased — "1214" reads as a token,
 *  "1,214" reads as a number. The Arabic separator is U+066C, the one that
 *  belongs with Eastern Arabic digits. */
export function localeNum(n: number): string {
  const grouped = new Intl.NumberFormat("en-US").format(n);
  return numerals === "arab" ? toNumerals(grouped, numerals).replaceAll(",", "٬") : grouped;
}

// ── The dictionaries, one language at a time ────────────────────────────────
// The strings live in client/i18n/en.ts and client/i18n/ar.ts, and NEITHER is
// in the entry chunk: the page fetches the language it starts in and, when the
// reader switches, the other one — so an English reader never downloads the
// Arabic and an Arabic reader never downloads the English (they were ~40% of
// the entry together). The switch AWAITS its chunk (`whenDictionary`): the
// chrome flips when the new strings are here, never a frame before, so there
// is no flash of the wrong language and no key name on screen. Nothing renders
// a t() string before the first dictionary lands: the shells draw nothing
// until /api/me has answered, and loadMe awaits the dictionary before it
// commits the language. The service worker keeps both for offline reading.
//
// Node callers (the tests, the desktop's native menu, the scripts that print
// the settings index) have no chunks to fetch: they import
// client/i18n/both.ts, which installs the two files directly.

/** One language's strings, by key. */
export type Dictionary = Readonly<Record<I18nKey, string>>;

const installed: Partial<Record<Lang, Dictionary>> = {};
const loading: Partial<Record<Lang, Promise<void>>> = {};

/** Hand this module a language's strings (the loader below, or both.ts). */
export function installDictionary(lang: Lang, dict: Dictionary): void {
  installed[lang] = dict;
}

/** Whether t() can speak `lang` right now. */
export function hasDictionary(lang: Lang): boolean {
  return installed[lang] !== undefined;
}

/** Fetch `lang`'s strings; resolves once t() can speak it. One request per
 *  language however many callers ask, and a failed one may be asked again. */
export function loadDictionary(lang: Lang): Promise<void> {
  if (installed[lang]) return Promise.resolve();
  const pending =
    loading[lang] ??
    (lang === "ar" ? import("./i18n/ar.ts") : import("./i18n/en.ts")).then(
      (mod) => installDictionary(lang, mod.default),
      (err: unknown) => {
        delete loading[lang];
        throw err;
      },
    );
  loading[lang] = pending;
  return pending;
}

let switchToken = 0;

/** Run `apply` — the caller's switch to `lang` — once `lang`'s strings are
 *  here: at once when they already are, after the fetch when not. A later
 *  switch supersedes an earlier one still waiting, so a quick en → ar → en
 *  never lands on Arabic. A fetch that fails applies anyway (t() then speaks
 *  whatever is installed): the reader asked for a change, and the direction
 *  and the dates still honour it. */
export function whenDictionary(lang: Lang, apply: () => void): void {
  const token = ++switchToken;
  if (hasDictionary(lang)) {
    apply();
    return;
  }
  void loadDictionary(lang)
    .catch(() => {})
    .then(() => {
      if (token === switchToken) apply();
    });
}

/** The chrome string for `key` in the active language — or, if that one is
 *  not installed (a fetch that failed), in whichever is. */
export function t(key: I18nKey): string {
  const dict = installed[current] ?? installed.en ?? installed.ar;
  return dict ? dict[key] : key;
}

// ── Locale numerals ─────────────────────────────────────────────────────────
// One numeral policy for every NUMBER the instance renders — blog post dates,
// moderation-row dates, marginalia timestamps AND every count beside them.
// Which digits plain "ar" resolves to is an ICU-version detail (some builds
// answer latn, others arab), so an Arabic site would otherwise print
// "15 أغسطس" in one place and "١٥ أغسطس" in the next. Eastern Arabic numerals
// are the intent: name them. An admin who spells a numbering system out
// (`ar-EG-u-nu-latn`) keeps exactly what they asked for — and the counts
// follow that choice too, because both read shared/numerals.ts.
export { arabicDefaultDigits, localeDigits } from "../shared/numerals.ts";

// ── Per-string direction ────────────────────────────────────────────────────
// Note-derived text (titles, tree labels, snippets) renders in ITS OWN
// direction, not the chrome's. In the DOM that is `dir="auto"`; on a <canvas>
// there is no such attribute, so the graphs ask this for `ctx.direction`.
// Same rule the HTML attribute uses: the first strong character wins, and a
// string with no strong character falls back to the chrome language.

// The explicit marks count too: `dir="auto"` treats U+200F RIGHT-TO-LEFT MARK
// (and U+200E LEFT-TO-RIGHT MARK) as strong characters of their direction, so
// a canvas label that opens with an RLM must resolve rtl exactly as the same
// string does in the DOM — this is the one place the two rules have to agree.
// U+061C (ALM) already falls inside the Arabic range. The Arabic-presentation
// range stops at U+FEFC: U+FEFF is the BOM (bidi class BN), not strong.
const RTL_STRONG = /[\u0591-\u07FF\u0860-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC\u200F]/u;
const LTR_STRONG = /[A-Za-z\u00C0-\u058F\u0900-\u1FFF\u2C00-\uD7FF\uF900-\uFB17\u200E]/u;

/** The direction `text` would get under `dir="auto"`. */
export function autoDir(text: string): "ltr" | "rtl" {
  for (const ch of text) {
    if (RTL_STRONG.test(ch)) return "rtl";
    if (LTR_STRONG.test(ch)) return "ltr";
  }
  return current === "ar" ? "rtl" : "ltr";
}

// Substituted values are almost always note-derived (a path, a title, a tag)
// and therefore of unknown direction: spliced raw into an Arabic sentence, a
// Latin path reorders against the words around it and a path containing an
// explicit bidi override (U+202E) can reshuffle the whole sentence — worst of
// all in the delete confirmation, where the reader must be able to tell which
// folder holds which note. FSI…PDI (the isolate the `dir="auto"` attribute
// applies in the DOM) resolves each value's direction on its own and keeps it
// from leaking into the sentence. Invisible in every renderer.
const FSI = "⁨";
const PDI = "⁩";

/** Isolate a value spliced into a sentence (first-strong direction, no leak). */
export function isolate(value: string | number): string {
  return `${FSI}${String(value)}${PDI}`;
}

/** t() with `{name}` placeholder substitution; every value bidi-isolated. */
export function tf(key: I18nKey, vars: Record<string, string | number>): string {
  let out = t(key);
  for (const [name, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${name}}`, isolate(value));
  }
  return out;
}

// ── Count phrases ───────────────────────────────────────────────────────────
// Arabic agreement needs real plural forms (1 / 2 / 3–10 / 11+); English just
// needs an s. The digits come from localeNum(), i.e. the SAME numbering system
// the dates use — a card that reads "٩ يناير ٢٠٢٦" must not finish with
// "3 دقائق قراءة".

export type CountUnit =
  | "units"
  | "steps"
  | "notes"
  | "files"
  | "trashItems"
  | "publishedNotes"
  | "links"
  | "chapters"
  // What a vault-wide replace is about to WRITE, as opposed to how many notes
  // it will touch. Both numbers are in the same sentence and they are rarely
  // the same number — "3 replacements in 2 notes" is the shape of the answer —
  // so the unit is its own rather than borrowed from "changes", which the
  // designer's save bar has already given a different meaning.
  | "replacements"
  | "words"
  | "chars"
  | "comments"
  | "marginNotes"
  | "foldedLines"
  | "readMinutes"
  | "changes"
  | "unsaved"
  // A tracker's default unit, one per kind (client/reading/tracker.ts). They
  // are count units and not dictionary strings because they always arrive with
  // a number in front of them — "62 / 130 pages", "١٣٠ صفحات" — and Arabic
  // agreement is exactly what a bare noun would get wrong.
  | "pages"
  | "hours"
  | "minutes"
  | "episodes"
  | "lessons"
  | "tasks"
  | "days"
  | "cards"
  | "orbits"
  // The reader's own counts: passages marked in a book, sittings with it,
  // and the versions the store kept of a note — the weekly review's units.
  | "highlights"
  | "sessions"
  // The phone's one-line properties card: "3 properties ›".
  | "properties"
  | "versions"
  // The Timeline and the year in review (3.28): lines captured into a day's
  // note, recordings linked from it, sigil ticks, books finished, and the
  // sittings with a book.
  | "lines"
  | "recordings"
  | "ticks"
  | "books"
  | "sittings"
  // Webmentions and the fediverse (docs/webmentions.md).
  | "likes"
  | "reposts"
  | "followers"
  | "mentions"
  // Read aloud's voices folder: "French: 3 voices" (docs/read-aloud.md).
  | "voices";

const UNITS: Record<CountUnit, { en: [string, string]; ar: { one: string; two: string; few: string; many: string } }> = {
  // What a bulk tab-close is about to FLUSH. It is a count with a consequence
  // attached, which is why the rows carry it at all: "Close others" over a
  // dozen tabs is a different decision when two of them have unsaved edits,
  // and the row is the last place it can be said. Same honesty `/api/delete-
  // preview` already brings to a delete.
  unsaved: {
    en: ["unsaved", "unsaved"],
    ar: { one: "غير محفوظة", two: "غير محفوظتين", few: "غير محفوظة", many: "غير محفوظة" },
  },
  notes: { en: ["note", "notes"], ar: { one: "ملاحظة واحدة", two: "ملاحظتان", few: "ملاحظات", many: "ملاحظة" } },
  // The library counts units (chapters, lectures) beside the lessons above.
  units: { en: ["unit", "units"], ar: { one: "وحدة واحدة", two: "وحدتان", few: "وحدات", many: "وحدة" } },
  // A course's steps (shared/routine.ts) — the thing a course is a list of.
  properties: { en: ["property", "properties"], ar: { one: "خاصية واحدة", two: "خاصيتان", few: "خصائص", many: "خاصية" } },
  steps: { en: ["step", "steps"], ar: { one: "خطوة واحدة", two: "خطوتان", few: "خطوات", many: "خطوة" } },
  replacements: {
    en: ["replacement", "replacements"],
    ar: { one: "استبدال واحد", two: "استبدالان", few: "استبدالات", many: "استبدالًا" },
  },
  // The sidebar footer counts the vault's ATTACHMENTS beside its notes — the
  // images, PDFs and recordings that are not notes but are certainly files.
  files: { en: ["file", "files"], ar: { one: "ملف واحد", two: "ملفان", few: "ملفات", many: "ملفًا" } },
  voices: { en: ["voice", "voices"], ar: { one: "صوت واحد", two: "صوتان", few: "أصوات", many: "صوتًا" } },
  // The trash holds folders, notes and attachments side by side, so its header
  // cannot count "files": one of the three rows in the fixture is a folder of
  // four notes, and calling that a file is the same small dishonesty this
  // whole round is about, one surface later.
  trashItems: {
    en: ["item", "items"],
    ar: { one: "عنصر واحد", two: "عنصران", few: "عناصر", many: "عنصرًا" },
  },
  // The visitor graph HUD counts published notes specifically.
  publishedNotes: {
    en: ["published note", "published notes"],
    ar: { one: "ملاحظة منشورة واحدة", two: "ملاحظتان منشورتان", few: "ملاحظات منشورة", many: "ملاحظة منشورة" },
  },
  links: { en: ["link", "links"], ar: { one: "رابط واحد", two: "رابطان", few: "روابط", many: "رابطًا" } },
  words: { en: ["word", "words"], ar: { one: "كلمة واحدة", two: "كلمتان", few: "كلمات", many: "كلمة" } },
  chars: { en: ["char", "chars"], ar: { one: "حرف واحد", two: "حرفان", few: "أحرف", many: "حرفًا" } },
  comments: { en: ["comment", "comments"], ar: { one: "تعليق واحد", two: "تعليقان", few: "تعليقات", many: "تعليقًا" } },
  // Marginalia counts its own entries "notes" (margin notes = حواشٍ), which is
  // a different word from a vault note (ملاحظة) — hence its own unit.
  marginNotes: { en: ["note", "notes"], ar: { one: "حاشية واحدة", two: "حاشيتان", few: "حواشٍ", many: "حاشية" } },
  // The editor's folded-section chip ("12 folded lines" / "١٢ سطرا مطويا").
  foldedLines: {
    en: ["folded line", "folded lines"],
    ar: { one: "سطر مطوي واحد", two: "سطران مطويان", few: "أسطر مطوية", many: "سطرًا مطويًا" },
  },
  // "min read" does not inflect in English; Arabic does, and the "قراءة" rides
  // along inside each form so the dual reads as a proper construct
  // ("دقيقتا قراءة"), not a number glued to a singular.
  readMinutes: {
    en: ["min read", "min read"],
    ar: { one: "دقيقة قراءة", two: "دقيقتا قراءة", few: "دقائق قراءة", many: "دقيقة قراءة" },
  },
  // The designer's save bar counts the decisions waiting to be written. A
  // number is what makes "unsaved" actionable, and a number in a sentence
  // needs the same agreement every other count in the product gets.
  changes: {
    en: ["change", "changes"],
    ar: { one: "تغيير واحد", two: "تغييران", few: "تغييرات", many: "تغييرًا" },
  },
  // The tracker units. Each one lands after a fraction ("62 / 130 pages"), so
  // the singular forms are the ones a lone total takes.
  pages: { en: ["page", "pages"], ar: { one: "صفحة واحدة", two: "صفحتان", few: "صفحات", many: "صفحة" } },
  hours: { en: ["hour", "hours"], ar: { one: "ساعة واحدة", two: "ساعتان", few: "ساعات", many: "ساعة" } },
  minutes: { en: ["minute", "minutes"], ar: { one: "دقيقة واحدة", two: "دقيقتان", few: "دقائق", many: "دقيقة" } },
  episodes: { en: ["episode", "episodes"], ar: { one: "حلقة واحدة", two: "حلقتان", few: "حلقات", many: "حلقة" } },
  lessons: { en: ["lesson", "lessons"], ar: { one: "درس واحد", two: "درسان", few: "دروس", many: "درسًا" } },
  chapters: { en: ["chapter", "chapters"], ar: { one: "فصل واحد", two: "فصلان", few: "فصول", many: "فصلًا" } },
  tasks: { en: ["task", "tasks"], ar: { one: "مهمة واحدة", two: "مهمتان", few: "مهام", many: "مهمة" } },
  days: { en: ["day", "days"], ar: { one: "يوم واحد", two: "يومان", few: "أيام", many: "يومًا" } },
  // The decks count their cards: "3 cards due", "١٠ بطاقات".
  cards: { en: ["card", "cards"], ar: { one: "بطاقة واحدة", two: "بطاقتان", few: "بطاقات", many: "بطاقة" } },
  // …but what is DUE is counted in orbits: a card coming back around is an
  // orbit closing, and the owner wanted the page to say so ("one orbit due").
  orbits: { en: ["orbit", "orbits"], ar: { one: "مدار واحد", two: "مداران", few: "مدارات", many: "مدارًا" } },
  highlights: { en: ["highlight", "highlights"], ar: { one: "اقتباس واحد", two: "اقتباسان", few: "اقتباسات", many: "اقتباسًا" } },
  sessions: { en: ["session", "sessions"], ar: { one: "جلسة واحدة", two: "جلستان", few: "جلسات", many: "جلسة" } },
  versions: { en: ["save", "saves"], ar: { one: "حفظة واحدة", two: "حفظتان", few: "حفظات", many: "حفظة" } },
  lines: { en: ["line", "lines"], ar: { one: "سطر واحد", two: "سطران", few: "أسطر", many: "سطرًا" } },
  recordings: { en: ["recording", "recordings"], ar: { one: "تسجيل واحد", two: "تسجيلان", few: "تسجيلات", many: "تسجيلًا" } },
  ticks: { en: ["tick", "ticks"], ar: { one: "علامة واحدة", two: "علامتان", few: "علامات", many: "علامة" } },
  books: { en: ["book", "books"], ar: { one: "كتاب واحد", two: "كتابان", few: "كتب", many: "كتابًا" } },
  sittings: { en: ["sitting", "sittings"], ar: { one: "جلسة واحدة", two: "جلستان", few: "جلسات", many: "جلسة" } },
  likes: { en: ["like", "likes"], ar: { one: "إعجاب واحد", two: "إعجابان", few: "إعجابات", many: "إعجابًا" } },
  reposts: { en: ["repost", "reposts"], ar: { one: "إعادة نشر واحدة", two: "إعادتا نشر", few: "إعادات نشر", many: "إعادة نشر" } },
  followers: { en: ["follower", "followers"], ar: { one: "متابع واحد", two: "متابعان", few: "متابعين", many: "متابعًا" } },
  mentions: { en: ["mention", "mentions"], ar: { one: "إشارة واحدة", two: "إشارتان", few: "إشارات", many: "إشارة" } },
};

/** "3 notes" / "3 ملاحظات" — a number with its correctly-agreed unit. */
export function countPhrase(n: number, unit: CountUnit): string {
  const forms = UNITS[unit];
  const num = localeNum(n);
  if (current === "en") return `${num} ${n === 1 ? forms.en[0] : forms.en[1]}`;
  const ar = forms.ar;
  if (n === 1) return ar.one;
  if (n === 2) return ar.two;
  if (n === 0) return `لا ${ar.few}`;
  if (n >= 3 && n <= 10) return `${num} ${ar.few}`;
  return `${num} ${ar.many}`;
}
