// Types for scripts/dictionary.mjs, so tests/i18nSplit.test.ts can import it.
export const DICTIONARY_FILES: { en: string; ar: string };
export function readLanguage(lang: "en" | "ar", root?: string): Map<string, string>;
export function readDictionary(root?: string): Map<string, { en: string; ar: string | null }> & { strays: string[] };
