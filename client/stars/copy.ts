// THE CONSTELLATIONS' OWN COPY — the shelf, the session, the statistics
// drawer and the New constellation form, in both languages.
//
// WHY HERE AND NOT IN client/i18n.ts. The DICT is entry-chunk code: every
// string in it is downloaded by every reader on first paint, the anonymous
// visitor reading one article included. This surface has a hundred-odd
// strings and sits behind an admin door, so its copy travels with its own
// lazy chunk — exactly as the tour deck's does (client/components/
// tourCards.ts) and the presets' names do (shared/presets.ts). Both halves
// are required, resolved through the same `getLang()` every other surface
// reads, and gated: tests/srsSession.test.ts walks this table the way
// check-i18n walks the DICT, so an empty `ar` or a placeholder that differs
// between the halves fails the build. Only the DOORS' strings stay in the
// DICT (the status bar, the tab, the palette rows), because they are
// painted before this module exists.
//
// `st()` and `stf()` are `t()` and `tf()` over this table, spelled apart so
// a grep for either finds exactly one dictionary.

import { getLang } from "../i18n.ts";

export interface StarsText {
  en: string;
  ar: string;
}

export const STARS_COPY = {
  starsImport: { en: "Import…", ar: "استيراد…" },
  // The shelf.
  starsLead: {
    en: "A constellation is a note; its stars are lines in it. Each one comes back on the schedule the note keeps.",
    ar: "الكوكبة ملاحظة، ونجومها أسطر فيها. يعود كل نجم على الجدول الذي تحفظه الملاحظة.",
  },
  starsDueToday: { en: "{n} due today", ar: "{n} مستحقة اليوم" },
  starsNothingDue: { en: "Nothing due today", ar: "لا شيء مستحق اليوم" },
  starsStreak: { en: "{days} in a row", ar: "{days} على التوالي" },
  starsStudy: { en: "Study", ar: "ادرس" },
  starsStudySection: { en: "Study section", ar: "ادرس قسمًا" },
  starsSectionRow: { en: "{name} · {due} due", ar: "{name} · {due} مستحق" },
  starsDueLabel: { en: "due", ar: "مستحق" },
  starsNewLabel: { en: "new", ar: "جديد" },
  starsTotalLabel: { en: "total", ar: "الكل" },
  starsPercent: { en: "{n}%", ar: "{n}٪" },
  starsEverything: { en: "Everything else", ar: "كل ما سواها" },
  starsEverythingHint: { en: "Cards outside any constellation, by folder", ar: "بطاقات خارج أي كوكبة، بحسب المجلد" },
  starsStats: { en: "Statistics", ar: "الإحصاءات" },
  starsStatsFor: { en: "Statistics for {title}", ar: "إحصاءات {title}" },
  starsEmpty: { en: "No constellations yet", ar: "لا كوكبات بعد" },
  starsEmptyHint: {
    en: "A constellation is a note with a constellation fence at the top; every line below it shaped like this is a star:",
    ar: "الكوكبة ملاحظة تبدأ بسياج constellation؛ وكل سطر تحته بهذا الشكل نجم:",
  },
  starsEmptyHint2: { en: "Or write one here — the New constellation button makes the note for you.", ar: "أو اكتب واحدة هنا: زر «كوكبة جديدة» ينشئ الملاحظة لك." },
  starsFailed: { en: "Could not load the constellations.", ar: "تعذّر تحميل الكوكبات." },
  starsRetention30: { en: "Retention, 30 days", ar: "الاستبقاء خلال ٣٠ يومًا" },
  starsNoGrades: { en: "No grades yet", ar: "لا درجات بعد" },
  starsOpenNote: { en: "Open the note", ar: "افتح الملاحظة" },
  // The session.
  starsBack: { en: "Back to the shelf", ar: "عودة إلى الرف" },
  starsShow: { en: "Show answer", ar: "أظهر الإجابة" },
  starsAgain: { en: "Again", ar: "مرة أخرى" },
  starsHard: { en: "Hard", ar: "صعب" },
  starsGood: { en: "Good", ar: "جيد" },
  starsEasy: { en: "Easy", ar: "سهل" },
  starsInMinutes: { en: "{n}m", ar: "{n}د" },
  starsInHours: { en: "{n}h", ar: "{n}س" },
  starsInDays: { en: "{n}d", ar: "{n}ي" },
  starsProgress: { en: "{done} of {total}", ar: "{done} من {total}" },
  starsEdit: { en: "Edit", ar: "تحرير" },
  starsEditTitle: { en: "Open the note at this star", ar: "افتح الملاحظة عند هذا النجم" },
  starsSkip: { en: "Skip", ar: "تخطَّ" },
  starsSkipTitle: { en: "Put this star aside for this session", ar: "أَجِّل هذا النجم لهذه الجلسة" },
  starsUndo: { en: "Undo", ar: "تراجع" },
  starsUndoTitle: { en: "Take back the last grade", ar: "استرجع الدرجة الأخيرة" },
  starsCheck: { en: "Check", ar: "تحقّق" },
  starsTypedPlaceholder: { en: "Type the answer", ar: "اكتب الإجابة" },
  starsTypedRight: { en: "Correct", ar: "صحيح" },
  starsTypedWrong: { en: "Not quite", ar: "ليس تمامًا" },
  starsYourAnswer: { en: "You typed", ar: "كتبت" },
  starsKindNew: { en: "New", ar: "جديد" },
  starsKindLearning: { en: "Learning", ar: "قيد التعلم" },
  starsKindReview: { en: "Review", ar: "مراجعة" },
  starsKindRelearn: { en: "Relearning", ar: "إعادة تعلّم" },
  starsEarly: { en: "Shown early; its step ends in {n}", ar: "عُرض مبكرًا؛ تنتهي خطوته بعد {n}" },
  starsKeysHint: { en: "Space shows the answer · 1–4 grade", ar: "المسافة تُظهر الإجابة · ١–٤ للتقييم" },
  starsDone: { en: "Session complete", ar: "اكتملت الجلسة" },
  starsDoneHint: { en: "Nothing left for today in this constellation.", ar: "لم يبقَ شيء لليوم في هذه الكوكبة." },
  starsStatGraded: { en: "Graded", ar: "قُيِّمت" },
  starsStatRetention: { en: "Retention", ar: "الاستبقاء" },
  starsStatTime: { en: "Time", ar: "الوقت" },
  starsAgainList: { en: "Marked “again”", ar: "عُلِّمت «مرة أخرى»" },
  starsStudyMore: { en: "Study more", ar: "ادرس المزيد" },
  starsStudyAhead: { en: "Study ahead", ar: "ذاكر مسبقًا" },
  starsNothingToStudy: { en: "Nothing to study yet", ar: "لا شيء للدراسة بعد" },
  starsNothingToStudyHint: { en: "This constellation has no stars. Add front::back lines to the note.", ar: "ليس في هذه الكوكبة نجوم. أضف أسطر وجه::ظهر إلى الملاحظة." },
  starsSaveFailed: { en: "Could not record that grade", ar: "تعذّر تسجيل تلك الدرجة" },
  starsUndoFailed: { en: "Could not undo that grade", ar: "تعذّر التراجع عن تلك الدرجة" },
  starsGone: { en: "That constellation is not in the vault.", ar: "تلك الكوكبة ليست في الخزانة." },
  // The statistics drawer.
  starsForecast30: { en: "Due over the next 30 days", ar: "المستحق خلال الثلاثين يومًا القادمة" },
  starsForecastBar: { en: "{n} on {date}", ar: "{n} في {date}" },
  starsStates: { en: "Stars by state", ar: "النجوم بحسب الحالة" },
  starsStateNew: { en: "New", ar: "جديد" },
  starsStateLearning: { en: "Learning", ar: "قيد التعلم" },
  starsStateYoung: { en: "Young", ar: "فتيّ" },
  starsStateMature: { en: "Mature", ar: "ناضج" },
  starsHardest: { en: "Hardest ten", ar: "أصعب عشرة" },
  starsHardestNone: { en: "No star has been marked “again” yet.", ar: "لم يُعلَّم أي نجم «مرة أخرى» بعد." },
  starsAgainCount: { en: "{n}× again", ar: "{n}× مرة أخرى" },
  // The New constellation modal.
  starsNewTitle: { en: "New constellation", ar: "كوكبة جديدة" },
  starsTabWrite: { en: "Write", ar: "اكتب" },
  starsTabImport: { en: "Import", ar: "استيراد" },
  starsFieldTitle: { en: "Title", ar: "العنوان" },
  starsFieldIcon: { en: "Icon", ar: "الأيقونة" },
  starsFieldIconHint: { en: "One emoji or glyph, drawn on the shelf", ar: "رمز تعبيري أو حرف واحد يُرسم على الرف" },
  starsFieldKind: { en: "Kind", ar: "النوع" },
  starsKindBasic: { en: "Basic — front to back", ar: "أساسي: من الوجه إلى الظهر" },
  starsKindReversed: { en: "Reversed — back to front", ar: "معكوس: من الظهر إلى الوجه" },
  starsKindBoth: { en: "Both ways", ar: "الاتجاهان" },
  starsKindTyped: { en: "Typed — you type the answer", ar: "مكتوب: تكتب الإجابة" },
  starsKindClozeOnly: { en: "Cloze only — ==highlights==", ar: "فراغات فقط: ==التظليلات==" },
  starsFieldFolder: { en: "Folder", ar: "المجلد" },
  starsFieldCards: { en: "Cards", ar: "البطاقات" },
  starsCardsHint: {
    en: "One per line: front::back, or front::back::extra for a reading, an example, a mnemonic.",
    ar: "بطاقة في كل سطر: وجه::ظهر، أو وجه::ظهر::إضافة لقراءة أو مثال أو معين على الحفظ.",
  },
  starsFieldFile: { en: "File", ar: "الملف" },
  starsFileHint: { en: "An Anki .apkg, or a .csv / .tsv with a column mapper below", ar: "ملف .apkg من Anki، أو .csv / .tsv مع مطابقة الأعمدة أدناه" },
  starsChooseFile: { en: "Choose a file…", ar: "اختر ملفًا…" },
  starsApkgNote: { en: "One constellation per deck; media goes beside the notes.", ar: "كوكبة لكل مجموعة، والوسائط تُحفظ بجانب الملاحظات." },
  starsColumns: { en: "Columns", ar: "الأعمدة" },
  starsColFront: { en: "Front", ar: "الوجه" },
  starsColBack: { en: "Back", ar: "الظهر" },
  starsColExtra: { en: "Extra", ar: "إضافة" },
  starsColNone: { en: "None", ar: "بلا" },
  starsColumnN: { en: "Column {n}", ar: "العمود {n}" },
  starsHeaderRow: { en: "The first row is a header", ar: "الصف الأول عنوان" },
  starsRowsFound: { en: "{n} in the file", ar: "{n} في الملف" },
  starsCreate: { en: "Create", ar: "أنشئ" },
  starsImportGo: { en: "Import", ar: "استورد" },
  starsTitleRequired: { en: "Give the constellation a name", ar: "أعطِ الكوكبة اسمًا" },
  starsCardsRequired: { en: "Write at least one card", ar: "اكتب بطاقة واحدة على الأقل" },
  starsFileRequired: { en: "Choose a file first", ar: "اختر ملفًا أولًا" },
  starsCreated: { en: "“{title}” is on the shelf", ar: "«{title}» على الرف" },
  starsCreateFailed: { en: "Could not create the constellation", ar: "تعذّر إنشاء الكوكبة" },
  starsImported: { en: "{n} imported", ar: "استُوردت {n}" },
  starsImportFailed: { en: "Could not import that file", ar: "تعذّر استيراد ذلك الملف" },
  starsWhere: { en: "Saved as {path}", ar: "تُحفظ في {path}" },
} satisfies Record<string, StarsText>;

export type StarsKey = keyof typeof STARS_COPY;

export function st(key: StarsKey): string {
  return STARS_COPY[key][getLang()];
}

export function stf(key: StarsKey, vars: Record<string, string | number>): string {
  return st(key).replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}
