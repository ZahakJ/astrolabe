// SPELLCHECK IN — which line languages the reader wants handed to the
// spellchecker (shared/spellKnown.ts), and what this device can honestly offer.
//
// What the APP can do about spelling is one thing in every host: decide, per
// line, whether to invite the checker (client/editor/bidi.ts stamps a `lang`
// on every line whose script disagrees with the note, and `spellcheck="false"`
// on the ones it should leave alone). What the checker can DO differs:
//
//   · in a browser the page cannot see which dictionaries exist, so it offers
//     the four line languages the editor stamps (French, Arabic, Hebrew,
//     Persian) and checks none until the reader chooses — a chosen language
//     is underlined only if the browser has its dictionary, which the row's
//     ⓘ says, with where Chrome keeps them;
//   · in the desktop app Electron reports the dictionaries this computer
//     really has, so it offers exactly those (and checks them all until the
//     reader unticks one);
//   · on macOS the system checker reads each line's `lang` itself, and with
//     spelling switched off in the Edit menu there is nothing to choose — the
//     row then says so in one sentence and draws no control.
//
// Device-local on purpose — a dictionary is a device's, not a vault's.

import { setSpellcheckDeclared, spellcheckEnv } from "../shared/spellKnown.ts";
import { t } from "./i18n.ts";

const KEY = "astrolabe.spellDicts";
export const SPELL_DICTS_EVENT = "astrolabe:spell-dicts";
/** The line-level languages the editor can stamp and a dictionary can exist
 *  for (shared/script.ts; Japanese has none anywhere). */
export const DECLARABLE = ["fr", "ar", "he", "fa"] as const;
export type Declarable = (typeof DECLARABLE)[number];

const isDeclarable = (l: string): l is Declarable => (DECLARABLE as readonly string[]).includes(l);

/** A dictionary's NAME in the chrome's language — what its chip says. Named
 *  one by one so the dictionary gate sees every key used. */
const NAMES: Record<Declarable, () => string> = {
  fr: () => t("spellDict_fr"),
  ar: () => t("spellDict_ar"),
  he: () => t("spellDict_he"),
  fa: () => t("spellDict_fa"),
};

export function dictionaryName(code: Declarable): string {
  return NAMES[code]();
}

/** The reader's stored choice, or null when they have never chosen. */
export function storedDictionaries(): Declarable[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    return DECLARABLE.filter((d) => raw.split(",").includes(d));
  } catch {
    return null;
  }
}

/** What the "Spellcheck in" row shows on this device. */
export type SpellOffer =
  /** A browser: the four languages, none checked until chosen. */
  | { mode: "browser"; offered: Declarable[]; chosen: Declarable[] }
  /** The desktop app: the dictionaries this computer has. */
  | { mode: "desktop"; offered: Declarable[]; chosen: Declarable[] }
  /** No choice to make, and the sentence that says why. */
  | { mode: "system" | "off" | "none"; offered: []; chosen: [] };

export function spellOffer(): SpellOffer {
  const env = spellcheckEnv();
  const stored = storedDictionaries();
  if (!env.desktop) return { mode: "browser", offered: [...DECLARABLE], chosen: stored ?? [] };
  if (!env.on) return { mode: "off", offered: [], chosen: [] };
  if (env.system) return { mode: "system", offered: [], chosen: [] };
  const offered = DECLARABLE.filter((d) => env.available.includes(d));
  if (offered.length === 0) return { mode: "none", offered: [], chosen: [] };
  return { mode: "desktop", offered, chosen: stored === null ? offered : offered.filter((d) => stored.includes(d)) };
}

/** The languages chosen right now (what the row shows filled). */
export function browserDictionaries(): Declarable[] {
  return spellOffer().chosen;
}

export function setBrowserDictionaries(langs: readonly string[]): void {
  const next = DECLARABLE.filter((d) => langs.includes(d));
  try {
    localStorage.setItem(KEY, next.join(","));
  } catch {
    // A locked-down browser: the choice lives for this page only.
  }
  setSpellcheckDeclared(next);
  window.dispatchEvent(new CustomEvent(SPELL_DICTS_EVENT, { detail: [...next] }));
}

/** Read once at startup so the first paint already knows. Only a choice the
 *  reader MADE is applied: in the desktop app "never chosen" means every
 *  dictionary this computer has. */
export function applyBrowserDictionaries(): void {
  const stored = storedDictionaries();
  if (stored !== null) setSpellcheckDeclared(stored.filter(isDeclarable));
}
