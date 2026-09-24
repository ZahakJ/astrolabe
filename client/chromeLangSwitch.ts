// THE WAY BACK: the chrome-language switch that is always on screen — its
// label, its words, the names it answers to. The preference a press writes is
// langPref.ts::chromeLangPref (the store action needs only that, and it is in
// every first paint); this table is for the faces, which live in lazy chunks.
//
// The owner's ask: "people who only know english or arabic [should] switch ui
// on demand without having to go to settings. Cuz then if they switch by
// mistake then ggs they won't know how to switch back." Settings → This
// device → Editor language is a row reached through a panel written in the
// language the reader cannot read, and the palette rows needed a chord they
// had to already know. So the switch is a pill (the desktop's status bar, the
// phone's More and Settings headers, the note sheet), a chord and a palette
// row — and every one of them is labelled by the rule below.
//
// THE LABEL IS THE OTHER LANGUAGE, IN ITS OWN SCRIPT. `ع` while the chrome is
// English, `EN` while it is Arabic: the reader who cannot read the current
// chrome still recognises their own language, which is the one thing a
// language picker has to get right. Its words come in BOTH languages and are
// not in the dictionary on purpose: a page holds one dictionary at a time
// (client/i18n.ts loads the other on demand), and the half of the sentence
// this control most needs is the half in the language that is NOT loaded.

import type { Lang } from "./i18n.ts";
import { otherLang } from "./langPref.ts";

/** "Switch to X" in both languages, keyed by the language switched TO. The
 *  two sentences are the dictionary's job everywhere else; here the page has
 *  only one dictionary and the sentence has to be readable in the other. */
const SWITCH_TO: Record<Lang, Record<Lang, string>> = {
  ar: { en: "Switch to Arabic", ar: "التبديل إلى العربية" },
  en: { en: "Switch to English", ar: "التبديل إلى الإنجليزية" },
};

export interface ChromeLangSwitch {
  /** The language a press lands on. */
  target: Lang;
  /** The pill's face: the target's own name, in its own script. */
  glyph: string;
  /** "Switch to X" in the target language — what its reader recognises. */
  own: string;
  /** The same sentence in the language on screen now. */
  here: string;
  /** Tooltip and accessible name: both sentences, the one on screen first
   *  ("Switch to Arabic · التبديل إلى العربية"). */
  title: string;
  /** The palette row: the TARGET language first, so a reader stuck in the
   *  wrong chrome reads their own words at the start of the row. */
  row: string;
}

/** What the switch shows while the chrome reads `current`. */
export function chromeLangSwitch(current: Lang): ChromeLangSwitch {
  const target = otherLang(current);
  const own = SWITCH_TO[target][target];
  const here = SWITCH_TO[target][current];
  return {
    target,
    glyph: target === "ar" ? "ع" : "EN",
    own,
    here,
    title: `${here} · ${own}`,
    row: `${own} · ${here}`,
  };
}

/** The words the palette row also answers to, in both languages, whichever
 *  way it currently points: a reader types the name of the language they
 *  WANT or the one they are STUCK in, and either has to find the way out. */
export const CHROME_LANG_ALIASES: readonly string[] = [
  "English",
  "Arabic",
  "language",
  "interface",
  "الإنجليزية",
  "إنجليزي",
  "العربية",
  "عربي",
  "اللغة",
  "الواجهة",
];

