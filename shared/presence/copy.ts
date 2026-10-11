// What Discord's card says, in the vault's two chrome languages. Kept apart
// from client/i18n.ts because this copy is rendered on the server (and in the
// desktop's main process), which never loads the client dictionary. Arabic
// prints Western digits, as the rest of the product does.

import type { PresenceKind } from "./types.ts";

export type PresenceLang = "en" | "ar";

export const KIND_LABEL: Record<PresenceKind | "idle", { en: string; ar: string }> = {
  writing: { en: "Writing", ar: "يكتب" },
  reading: { en: "Reading", ar: "يقرأ" },
  book: { en: "Reading a book", ar: "يقرأ كتابًا" },
  orbits: { en: "Reviewing cards", ar: "يراجع البطاقات" },
  drawing: { en: "Drawing", ar: "يرسم" },
  library: { en: "In the library", ar: "في المكتبة" },
  browsing: { en: "Browsing the vault", ar: "يتصفّح الخزانة" },
  idle: { en: "Idle", ar: "خامل" },
};

export const BUTTON_LABEL: { en: string; ar: string } = { en: "Read the blog", ar: "اقرأ المدونة" };

export function kindLabel(kind: PresenceKind | "idle", lang: PresenceLang): string {
  return KIND_LABEL[kind][lang];
}

/** "12 cards left". Arabic counts the noun the way client/i18n.ts
 *  countPhrase does: dual for two, plural for three to ten, singular from
 *  eleven on. */
export function cardsLeftPhrase(n: number, lang: PresenceLang): string {
  const num = String(Math.max(0, Math.trunc(n)));
  if (lang === "en") return n === 1 ? "1 card left" : `${num} cards left`;
  if (n === 0) return "لا بطاقات متبقية";
  if (n === 1) return "بطاقة واحدة متبقية";
  if (n === 2) return "بطاقتان متبقيتان";
  if (n >= 3 && n <= 10) return `${num} بطاقات متبقية`;
  return `${num} بطاقة متبقية`;
}
