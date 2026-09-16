// BROWSER DICTIONARIES — the languages this browser can spellcheck, as the
// reader declares them (shared/script.ts, `setSpellcheckDeclared`).
//
// The desktop app asks Electron which dictionaries exist and feeds them to
// the same set; a web page has no such question to ask, so a French or
// Arabic line in a browser was left unchecked rather than checked against
// English. This is the reader's answer for their browser: tick French, and
// French lines get the underline they deserve. Device-local on purpose — a
// dictionary is a browser's, not a vault's.

import { setSpellcheckDeclared } from "../shared/spellKnown.ts";

const KEY = "astrolabe.spellDicts";
export const SPELL_DICTS_EVENT = "astrolabe:spell-dicts";
/** The line-level languages the editor can stamp (shared/script.ts). */
export const DECLARABLE = ["fr", "ar", "he", "fa"] as const;
export type Declarable = (typeof DECLARABLE)[number];

export function browserDictionaries(): Declarable[] {
  try {
    const raw = localStorage.getItem(KEY) ?? "";
    return DECLARABLE.filter((d) => raw.split(",").includes(d));
  } catch {
    return [];
  }
}

export function setBrowserDictionaries(langs: readonly Declarable[]): void {
  try {
    localStorage.setItem(KEY, langs.join(","));
  } catch {
    // A locked-down browser: the declaration lives for this page only.
  }
  setSpellcheckDeclared(langs);
  window.dispatchEvent(new CustomEvent(SPELL_DICTS_EVENT, { detail: [...langs] }));
}

/** Read once at startup so the first paint already knows. */
export function applyBrowserDictionaries(): void {
  setSpellcheckDeclared(browserDictionaries());
}
