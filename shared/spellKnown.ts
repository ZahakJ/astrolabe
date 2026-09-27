// WHICH DICTIONARIES EXIST, AND WHICH THE READER WANTS — in a file with no
// imports, because client/main.tsx asks it before anything else loads and
// must not drag shared/script.ts (and the French detector behind it) into
// the entry chunk for the sake of one boolean.
//
// Two facts and one choice:
//   · `available` — what the desktop app learns from Electron: the languages
//     its spellchecker was switched on for, each one a dictionary that really
//     exists on this computer ("*" on macOS, where the OS decides);
//   · `desktop` / `on` — whether there is an app around the page at all, and
//     whether its spellchecker is on (Edit → Spelling);
//   · `chosen` — which line languages the reader wants checked
//     (client/spellDicts.ts, the "Spellcheck in" row). In a browser nothing is
//     checked until chosen, because a page cannot see which dictionaries the
//     browser has; in the desktop app every available language is checked
//     until the reader says otherwise.
//
// A line is handed to the spellchecker only in a language the rules above
// allow — the rule that keeps a French or Arabic line from being underlined
// against English.

let available: ReadonlySet<string> = new Set();
let desktop = false;
let on = true;
/** null = the reader has not chosen (the host's default applies). */
let chosen: ReadonlySet<string> | null = null;

const base = (l: string): string => l.toLowerCase().split("-")[0];

/** The desktop app's report (client/desktop/index.ts, from its hello): the
 *  tags its spellchecker runs in, and whether spelling is on at all. */
export function setSpellcheckAvailable(langs: readonly string[], enabled = true): void {
  // "ar-SA" counts for "ar": dictionaries are named regionally, lines are not.
  available = new Set(langs.map(base));
  desktop = true;
  on = enabled;
}

/** The reader's choice of line languages (client/spellDicts.ts). */
export function setSpellcheckDeclared(langs: readonly string[]): void {
  chosen = new Set(langs.map(base));
}

/** What this page can say about spelling here, for the settings row. */
export function spellcheckEnv(): { desktop: boolean; on: boolean; system: boolean; available: string[] } {
  return { desktop, on, system: available.has("*"), available: [...available].filter((l) => l !== "*") };
}

export function spellcheckKnown(lang: string): boolean {
  // "*" is macOS: the system checker reads `lang` itself and supports what the
  // system supports, so every line-level language is worth inviting it for.
  if (available.has("*")) return true;
  if (desktop) return available.has(lang) && (chosen === null || chosen.has(lang));
  return chosen !== null && chosen.has(lang);
}
