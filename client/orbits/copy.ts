// ORBITS' OWN COPY — the shelf, the session, the statistics drawer and
// the New deck form, in both languages. Orbits is the spaced-repetition
// page; inside it a DECK (مجموعة) is a note and a CARD (بطاقة) a line.
//
// WHY HERE AND NOT IN client/i18n.ts. The dictionary is first-paint code:
// every string in it (in the reader's language) comes before the first paint, the anonymous
// visitor reading one article included. This surface has a hundred-odd
// strings and sits behind an admin door, so its copy travels with its own
// lazy chunk — exactly as the tour deck's does (client/components/
// tourCards.ts) and the presets' names do (shared/presets.ts). Both halves
// are required, resolved through the same `getLang()` every other surface
// reads, and gated: tests/srsSession.test.ts walks this table the way
// check-i18n walks the dictionary, so an empty `ar` or a placeholder that differs
// between the halves fails the build. Only the DOORS' strings stay in the
// dictionary (the status bar, the tab, the palette rows), because they are
// painted before this module exists.
//
// `st()` and `stf()` are `t()` and `tf()` over this table, spelled apart so
// a grep for either finds exactly one dictionary.

import { getLang } from "../i18n.ts";

export interface OrbitsText {
  en: string;
  ar: string;
}

export const ORBITS_COPY = {
  orbitsImport: { en: "Import…", ar: "استيراد…" },
  // The shelf.
  orbitsLead: {
    en: "A deck is a note; its cards are lines in it. Each one comes back around on the schedule the note keeps.",
    ar: "المجموعة ملاحظة، وبطاقاتها أسطر فيها. تعود كل بطاقة على الجدول الذي تحفظه الملاحظة.",
  },
  // Arabic puts the count LAST: "بطاقة واحدة" and "٣ بطاقات" would ask an
  // adjective to agree with a count that changes at one, and a sentence
  // that ends in the count agrees with nothing.
  orbitsDueToday: { en: "{n} due today", ar: "المستحق اليوم: {n}" },
  orbitsNothingDue: { en: "No orbits due today", ar: "لا مدارات مستحقة اليوم" },
  orbitsStreak: { en: "{days} in a row", ar: "{days} على التوالي" },
  orbitsStudy: { en: "Study", ar: "ادرس" },
  orbitsStudySection: { en: "Study section", ar: "ادرس قسمًا" },
  orbitsSectionRow: { en: "{name} · {due} due", ar: "{name} · {due} مستحق" },
  // The deck card counts what is due in ORBITS (the count unit in i18n.ts):
  // "3 orbits due", "0 orbits due".
  orbitsDueLabel: { en: "due", ar: "مستحقة" },
  orbitsNewLabel: { en: "new", ar: "جديد" },
  orbitsTotalLabel: { en: "total", ar: "الكل" },
  orbitsPercent: { en: "{n}%", ar: "{n}٪" },
  orbitsEverythingHint: { en: "Cards outside any deck, by folder", ar: "بطاقات خارج أي مجموعة، بحسب المجلد" },
  orbitsStats: { en: "Statistics", ar: "الإحصاءات" },
  orbitsStatsFor: { en: "Statistics for {title}", ar: "إحصاءات {title}" },
  orbitsEmpty: { en: "No decks yet", ar: "لا مجموعات بعد" },
  orbitsEmptyHint: {
    en: "A deck is a note with a deck fence at the top; every line below it shaped like this is a card:",
    ar: "المجموعة ملاحظة تبدأ بسياج deck؛ وكل سطر تحته بهذا الشكل بطاقة:",
  },
  orbitsEmptyHint2: { en: "Or write one here — the New deck button makes the note for you.", ar: "أو اكتب واحدة هنا: زر «مجموعة جديدة» ينشئ الملاحظة لك." },
  orbitsFailed: { en: "Could not load the decks.", ar: "تعذّر تحميل المجموعات." },
  orbitsRetention30: { en: "Retention, 30 days", ar: "الاستبقاء خلال ٣٠ يومًا" },
  orbitsNoGrades: { en: "No grades yet", ar: "لا درجات بعد" },
  orbitsOpenNote: { en: "Open the note", ar: "افتح الملاحظة" },
  // The session.
  orbitsBack: { en: "Back to the shelf", ar: "عودة إلى الرف" },
  orbitsShow: { en: "Show answer", ar: "أظهر الإجابة" },
  orbitsAgain: { en: "Again", ar: "مرة أخرى" },
  orbitsHard: { en: "Hard", ar: "صعب" },
  orbitsGood: { en: "Good", ar: "جيد" },
  orbitsEasy: { en: "Easy", ar: "سهل" },
  orbitsInMinutes: { en: "{n}m", ar: "{n}د" },
  orbitsInHours: { en: "{n}h", ar: "{n}س" },
  orbitsInDays: { en: "{n}d", ar: "{n}ي" },
  orbitsProgress: { en: "{done} of {total}", ar: "{done} من {total}" },
  orbitsEdit: { en: "Edit", ar: "تحرير" },
  orbitsEditTitle: { en: "Open the note at this card", ar: "افتح الملاحظة عند هذه البطاقة" },
  orbitsSkip: { en: "Skip", ar: "تخطَّ" },
  orbitsSkipTitle: { en: "Put this card aside for this session", ar: "أَجِّل هذه البطاقة لهذه الجلسة" },
  orbitsUndo: { en: "Undo", ar: "تراجع" },
  orbitsUndoTitle: { en: "Take back the last grade", ar: "استرجع الدرجة الأخيرة" },
  orbitsCheck: { en: "Check", ar: "تحقّق" },
  orbitsTypedPlaceholder: { en: "Type the answer", ar: "اكتب الإجابة" },
  orbitsTypedRight: { en: "Correct", ar: "صحيح" },
  orbitsTypedWrong: { en: "Not quite", ar: "ليس تمامًا" },
  orbitsYourAnswer: { en: "You typed", ar: "كتبت" },
  orbitsKindNew: { en: "New", ar: "جديد" },
  orbitsKindLearning: { en: "Learning", ar: "قيد التعلم" },
  orbitsKindReview: { en: "Review", ar: "مراجعة" },
  orbitsKindRelearn: { en: "Relearning", ar: "إعادة تعلّم" },
  orbitsEarly: { en: "Shown early; its step ends in {n}", ar: "عُرض مبكرًا؛ تنتهي خطوته بعد {n}" },
  orbitsKeysHint: { en: "Space shows the answer · 1–4 grade", ar: "المسافة تُظهر الإجابة · ١–٤ للتقييم" },
  orbitsDone: { en: "Session complete", ar: "اكتملت الجلسة" },
  orbitsDoneHint: { en: "Nothing left for today in this deck.", ar: "لم يبقَ شيء لليوم في هذه المجموعة." },
  // What "Skip" left behind — a skipped card is put aside for the session,
  // not for the day, and Study more walks it. The count ends the sentence
  // for the same reason as orbitsDueToday.
  orbitsDoneLeft: { en: "Still due today: {n}. Study more to walk them.", ar: "ما زال مستحقًا اليوم: {n}. «ادرس المزيد» يعود إليها." },
  orbitsStatGraded: { en: "Graded", ar: "قُيِّمت" },
  orbitsStatRetention: { en: "Retention", ar: "الاستبقاء" },
  orbitsStatTime: { en: "Time", ar: "الوقت" },
  orbitsAgainList: { en: "Marked “again”", ar: "عُلِّمت «مرة أخرى»" },
  orbitsStudyMore: { en: "Study more", ar: "ادرس المزيد" },
  orbitsStudyAhead: { en: "Study ahead", ar: "ذاكر مسبقًا" },
  orbitsNothingToStudy: { en: "Nothing to study yet", ar: "لا شيء للدراسة بعد" },
  orbitsNothingToStudyHint: { en: "This deck has no cards. Add front::back lines to the note.", ar: "ليس في هذه المجموعة بطاقات. أضف أسطر وجه::ظهر إلى الملاحظة." },
  orbitsSaveFailed: { en: "Could not record that grade", ar: "تعذّر تسجيل تلك الدرجة" },
  orbitsUndoFailed: { en: "Could not undo that grade", ar: "تعذّر التراجع عن تلك الدرجة" },
  orbitsGone: { en: "That deck is not in the vault.", ar: "تلك المجموعة ليست في الخزانة." },
  // The statistics drawer.
  orbitsForecast30: { en: "Due over the next 30 days", ar: "المستحق خلال الثلاثين يومًا القادمة" },
  orbitsForecastBar: { en: "{n} on {date}", ar: "{n} في {date}" },
  orbitsStates: { en: "Cards by state", ar: "البطاقات بحسب الحالة" },
  orbitsStateNew: { en: "New", ar: "جديد" },
  orbitsStateLearning: { en: "Learning", ar: "قيد التعلم" },
  orbitsStateYoung: { en: "Young", ar: "فتيّ" },
  orbitsStateMature: { en: "Mature", ar: "ناضج" },
  orbitsHardest: { en: "Hardest ten", ar: "أصعب عشرة" },
  orbitsHardestNone: { en: "No card has been marked “again” yet.", ar: "لم تُعلَّم أي بطاقة «مرة أخرى» بعد." },
  orbitsAgainCount: { en: "{n}× again", ar: "{n}× مرة أخرى" },
  // The New deck modal.
  orbitsNewTitle: { en: "New deck", ar: "مجموعة جديدة" },
  orbitsTabWrite: { en: "Write", ar: "اكتب" },
  orbitsTabImport: { en: "Import", ar: "استيراد" },
  orbitsFieldTitle: { en: "Title", ar: "العنوان" },
  orbitsFieldIcon: { en: "Icon", ar: "الأيقونة" },
  orbitsFieldIconHint: { en: "One emoji or glyph, drawn on the shelf", ar: "رمز تعبيري أو حرف واحد يُرسم على الرف" },
  orbitsFieldKind: { en: "Kind", ar: "النوع" },
  orbitsKindBasic: { en: "Basic — front to back", ar: "أساسي: من الوجه إلى الظهر" },
  orbitsKindReversed: { en: "Reversed — back to front", ar: "معكوس: من الظهر إلى الوجه" },
  orbitsKindBoth: { en: "Both ways", ar: "الاتجاهان" },
  orbitsKindTyped: { en: "Typed — you type the answer", ar: "مكتوب: تكتب الإجابة" },
  orbitsKindClozeOnly: { en: "Cloze only — ==highlights==", ar: "فراغات فقط: ==التظليلات==" },
  orbitsFieldFolder: { en: "Folder", ar: "المجلد" },
  orbitsFieldCards: { en: "Cards", ar: "البطاقات" },
  orbitsCardsHint: {
    en: "One per line: front::back, or front::back::extra for a reading, an example, a mnemonic.",
    ar: "بطاقة في كل سطر: وجه::ظهر، أو وجه::ظهر::إضافة لقراءة أو مثال أو معين على الحفظ.",
  },
  orbitsFieldFile: { en: "File", ar: "الملف" },
  orbitsFileHint: { en: "An Anki .apkg, or a .csv / .tsv with a column mapper below", ar: "ملف .apkg من Anki، أو .csv / .tsv مع مطابقة الأعمدة أدناه" },
  orbitsChooseFile: { en: "Choose a file…", ar: "اختر ملفًا…" },
  orbitsApkgNote: { en: "One note per Anki deck; media goes beside the notes.", ar: "ملاحظة لكل مجموعة في Anki، والوسائط تُحفظ بجانب الملاحظات." },
  orbitsColumns: { en: "Columns", ar: "الأعمدة" },
  orbitsColFront: { en: "Front", ar: "الوجه" },
  orbitsColBack: { en: "Back", ar: "الظهر" },
  orbitsColExtra: { en: "Extra", ar: "إضافة" },
  orbitsColNone: { en: "None", ar: "بلا" },
  orbitsColumnN: { en: "Column {n}", ar: "العمود {n}" },
  orbitsHeaderRow: { en: "The first row is a header", ar: "الصف الأول عناوين الأعمدة" },
  orbitsRowsFound: { en: "{n} in the file", ar: "{n} في الملف" },
  orbitsCreate: { en: "Create", ar: "أنشئ" },
  orbitsImportGo: { en: "Import", ar: "استورد" },
  orbitsTitleRequired: { en: "Give the deck a name", ar: "أعطِ المجموعة اسمًا" },
  orbitsCardsRequired: { en: "Write at least one card", ar: "اكتب بطاقة واحدة على الأقل" },
  orbitsFileRequired: { en: "Choose a file first", ar: "اختر ملفًا أولًا" },
  orbitsCreated: { en: "“{title}” is on the shelf", ar: "«{title}» على الرف" },
  orbitsCreateFailed: { en: "Could not create the deck", ar: "تعذّر إنشاء المجموعة" },
  orbitsImported: { en: "{n} imported", ar: "استُوردت {n}" },
  orbitsImportFailed: { en: "Could not import that file", ar: "تعذّر استيراد ذلك الملف" },
  orbitsWhere: { en: "Saved as {path}", ar: "تُحفظ في {path}" },
} satisfies Record<string, OrbitsText>;

export type OrbitsKey = keyof typeof ORBITS_COPY;

export function st(key: OrbitsKey): string {
  return ORBITS_COPY[key][getLang()];
}

export function stf(key: OrbitsKey, vars: Record<string, string | number>): string {
  return st(key).replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}
