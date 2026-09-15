// THE FIELDS AN ORBIT KNOWS BY NAME — what "minutes" or "focus" means, said
// once, for the form that offers them and the card that shows them.
//
// The owner, on the study preset's `focus:scale:5`: "idk what the focus
// thingy is, kinda weird". A field is a word and a type in a fence, and the
// card drew exactly that: the word, and five numbered buttons. Nothing said
// what the buttons rate. So every field the presets reach for has a plain
// sentence here, in both languages, and the two surfaces that draw fields
// read it — the form as the line under the toggle, the card as the title on
// the name and on the scale. A field of the reader's own gets the generic
// sentence for its type ("rated from 1 to 5"), which is still a sentence.
//
// Tiny and DOM-free on purpose: the card is one lazy chunk and the form is
// another, and this is the one thing they must agree on.

import type { RoutineField, RoutineFieldType } from "../shared/routine.ts";
import { getLang, t, tf, type I18nKey } from "./i18n.ts";

/** A field the form offers as a toggle: its key in each language, its
 *  parts, and the words for it. `unit`/`max` are the suggestion's defaults;
 *  the form lets the reader change them. */
export interface KnownField {
  id: string;
  key: { en: string; ar: string };
  type: RoutineFieldType;
  unit: { en: string; ar: string } | null;
  max: number | null;
  label: I18nKey;
  help: I18nKey;
}

export const KNOWN_FIELDS: readonly KnownField[] = [
  { id: "minutes", key: { en: "minutes", ar: "دقائق" }, type: "number", unit: null, max: null, label: "orbitFieldMinutes", help: "orbitFieldMinutesHelp" },
  { id: "weight", key: { en: "weight", ar: "الوزن" }, type: "number", unit: { en: "kg", ar: "كغ" }, max: null, label: "orbitFieldWeight", help: "orbitFieldWeightHelp" },
  { id: "focus", key: { en: "focus", ar: "التركيز" }, type: "scale", unit: null, max: 5, label: "orbitFieldFocus", help: "orbitFieldFocusHelp" },
  { id: "mood", key: { en: "mood", ar: "المزاج" }, type: "scale", unit: null, max: 5, label: "orbitFieldMood", help: "orbitFieldMoodHelp" },
  { id: "energy", key: { en: "energy", ar: "الطاقة" }, type: "scale", unit: null, max: 5, label: "orbitFieldEnergy", help: "orbitFieldEnergyHelp" },
  { id: "water", key: { en: "water", ar: "ماء" }, type: "count", unit: { en: "glasses", ar: "أكواب" }, max: null, label: "orbitFieldWater", help: "orbitFieldWaterHelp" },
  { id: "pages", key: { en: "pages", ar: "صفحات" }, type: "count", unit: null, max: null, label: "orbitFieldPages", help: "orbitFieldPagesHelp" },
  { id: "hours", key: { en: "hours", ar: "ساعات" }, type: "number", unit: null, max: null, label: "orbitFieldHours", help: "orbitFieldHoursHelp" },
  { id: "quality", key: { en: "quality", ar: "الجودة" }, type: "scale", unit: null, max: 5, label: "orbitFieldQuality", help: "orbitFieldQualityHelp" },
  { id: "notes", key: { en: "notes", ar: "ملاحظات" }, type: "text", unit: null, max: null, label: "orbitFieldNotes", help: "orbitFieldNotesHelp" },
];

function sameKey(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** The known field a plan's field is, by its key in either language, or
 *  null for one of the reader's own. */
export function knownFieldOf(field: Pick<RoutineField, "key">): KnownField | null {
  return KNOWN_FIELDS.find((k) => sameKey(k.key.en, field.key) || sameKey(k.key.ar, field.key)) ?? null;
}

/** The field a known suggestion adds, in the instance's language. */
export function fieldFromKnown(k: KnownField, lang: "en" | "ar" = getLang()): RoutineField {
  return { key: k.key[lang], type: k.type, unit: k.unit ? k.unit[lang] : null, max: k.max };
}

/** One plain sentence about a field — the known one's own, or the generic
 *  sentence for its type. What the card says on hover and the form under
 *  the toggle. */
export function fieldHelp(field: RoutineField): string {
  const known = knownFieldOf(field);
  if (known) return t(known.help);
  switch (field.type) {
    case "scale":
      return tf("orbitFieldScaleHelp", { key: field.key, max: String(field.max ?? 5) });
    case "number":
      return field.unit ? tf("orbitFieldNumberUnitHelp", { key: field.key, unit: field.unit }) : tf("orbitFieldNumberHelp", { key: field.key });
    case "count":
      return field.unit ? tf("orbitFieldCountUnitHelp", { key: field.key, unit: field.unit }) : tf("orbitFieldCountHelp", { key: field.key });
    case "check":
      return tf("orbitFieldCheckHelp", { key: field.key });
    default:
      return tf("orbitFieldTextHelp", { key: field.key });
  }
}

/** True for a text field that IS the day's note: the card then keeps one
 *  box for it rather than a field input and a note line that say the same. */
export function isNotesField(field: RoutineField): boolean {
  return field.type === "text" && /^(note|notes|ملاحظة|ملاحظات)$/i.test(field.key.trim());
}
