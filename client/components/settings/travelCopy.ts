// THE TRAVEL ROW'S OWN COPY — both languages, in the settings chunk.
//
// WHY HERE AND NOT IN client/i18n.ts. The dictionary is first-paint code:
// every string in it (in the reader's language) comes before the first paint, the anonymous
// visitor reading one article included. This row sits behind an admin door
// in a lazily loaded panel, so its two dozen strings travel with that chunk,
// the way Orbits' do (client/orbits/copy.ts) and the tour deck's do. Only the
// ROW'S OWN label and hint stay in the dictionary (`rowTravel`, `hintTravel`),
// because the settings search index resolves them before the panel exists.
// Gated like the dictionary: tests/prefs.test.ts walks this table for an empty
// half, an untranslated half, or placeholders that differ.
//
// `tv()` and `tvf()` are `t()` and `tf()` over this table, spelled apart so
// a grep for either finds exactly one dictionary.

import { getLang, isolate } from "../../i18n.ts";

export interface TravelText {
  en: string;
  ar: string;
}

export const TRAVEL_COPY = {
  // The eight items, as the checklist names them.
  travelSite: { en: "site", ar: "الموقع" },
  travelDesigns: { en: "designs", ar: "التصاميم" },
  travelCustomCss: { en: "custom CSS", ar: "CSS مخصص" },
  travelFonts: { en: "fonts", ar: "الخطوط" },
  travelLayouts: { en: "layouts", ar: "التخطيطات" },
  travelBooks: { en: "books", ar: "الكتب" },
  travelAnnotations: { en: "annotations", ar: "الحواشي" },
  travelPrefs: { en: "preferences", ar: "التفضيلات" },
  // The three states an item can be in, as the glyph's accessible name.
  travelInVault: { en: "in the vault", ar: "في الخزانة" },
  travelNotYet: { en: "on this machine only — not in the vault yet", ar: "على هذا الجهاز فقط، ليس في الخزانة بعد" },
  travelNothing: { en: "nothing to carry yet", ar: "لا شيء يُنقل بعد" },
  travelLastPass: { en: "Last pass {when}", ar: "آخر دورة {when}" },
  travelReconciled: { en: "{n} files reconciled", ar: "تمت مطابقة {n} من الملفات" },
  travelNoPass: { en: "No pass has run yet.", ar: "لم تجرِ أي دورة بعد." },
  travelPrefsPulled: { en: "{n} preference keys, pulled {when}", ar: "{n} من مفاتيح التفضيلات، سُحبت {when}" },
  travelResync: { en: "Re-sync now", ar: "أعد المزامنة الآن" },
  travelResyncing: { en: "Re-syncing…", ar: "جارٍ إعادة المزامنة…" },
  travelResynced: { en: "Re-synced: {n} files moved", ar: "أُعيدت المزامنة: نُقل {n} من الملفات" },
  travelResyncFailed: { en: "Could not re-sync", ar: "تعذّرت إعادة المزامنة" },
  travelTooLarge: { en: "{file} was not copied: over the 5 MB limit for one file", ar: "لم يُنسخ {file}: يتجاوز حدّ 5 ميغابايت للملف الواحد" },
  travelOverTotal: { en: "{file} was not copied: the fonts folder is over its 40 MB limit", ar: "لم يُنسخ {file}: مجلد الخطوط يتجاوز حدّه البالغ 40 ميغابايت" },
  travelCopyFailed: { en: "{file} could not be copied: {detail}", ar: "تعذّر نسخ {file}: {detail}" },
  travelRedo: {
    en: "Still yours to redo on a new machine: the git token or SSH key, the admin password, screen warmth.",
    ar: "ما يبقى عليك إعداده على جهاز جديد: رمز git أو مفتاح SSH، وكلمة مرور المشرف، ودفء الشاشة.",
  },
} satisfies Record<string, TravelText>;

export type TravelKey = keyof typeof TRAVEL_COPY;

export function tv(key: TravelKey): string {
  return TRAVEL_COPY[key][getLang()];
}

/** `{name}` substitution with every value bidi-isolated, like `tf()`. */
export function tvf(key: TravelKey, vars: Record<string, string | number>): string {
  return tv(key).replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? isolate(vars[name]) : m));
}
