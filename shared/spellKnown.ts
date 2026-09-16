// WHICH DICTIONARIES EXIST — two sets and one question, in a file with no
// imports, because client/main.tsx asks it before anything else loads and
// must not drag shared/script.ts (and the French detector behind it) into
// the entry chunk for the sake of one boolean.
//
// `available` is what the desktop app learns from Electron; `declared` is
// what the reader says their browser has (client/spellDicts.ts). A line is
// spellchecked only in a language one of the two knows — the rule that
// keeps a French or Arabic line from being underlined against English.

let available: ReadonlySet<string> = new Set();
let declared: ReadonlySet<string> = new Set();

const base = (l: string): string => l.toLowerCase().split("-")[0];

export function setSpellcheckAvailable(langs: readonly string[]): void {
  // "ar-SA" counts for "ar": dictionaries are named regionally, lines are not.
  available = new Set(langs.map(base));
}

export function setSpellcheckDeclared(langs: readonly string[]): void {
  declared = new Set(langs.map(base));
}

export function spellcheckKnown(lang: string): boolean {
  // "*" is macOS: the system checker reads `lang` itself and supports what the
  // system supports, so every line-level language is worth inviting it for.
  return available.has("*") || available.has(lang) || declared.has(lang);
}
