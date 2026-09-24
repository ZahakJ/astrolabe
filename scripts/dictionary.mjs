// THE DICTIONARY, READ AS TEXT — for the gates that must not import the app.
//
// Since the language split the strings live in two files: client/i18n/en.ts
// (the key list) and client/i18n/ar.ts. Every gate that reads the dictionary
// (check-i18n, check-settings, check-docs, check-names, the settings index)
// reads it through here, so the file format is spelled in one place. Values
// come back exactly as written between the quotes — escapes included — which
// is what those gates always compared.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

export const DICTIONARY_FILES = { en: "client/i18n/en.ts", ar: "client/i18n/ar.ts" };

const ENTRY = /^ {2}([A-Za-z0-9_]+): "((?:[^"\\]|\\.)*)",$/;

/** `key → value` for one language file, in file order. */
export function readLanguage(lang, root = ROOT) {
  const out = new Map();
  const lines = readFileSync(path.join(root, DICTIONARY_FILES[lang]), "utf8").split("\n");
  for (const line of lines) {
    const m = ENTRY.exec(line);
    if (m) out.set(m[1], m[2]);
  }
  return out;
}

/** `key → { en, ar }` over the English key list; a key missing from the
 *  Arabic file comes back with `ar: null` (the type forbids it; the gates
 *  still say so in words). Keys only the Arabic has are in `strays`. */
export function readDictionary(root = ROOT) {
  const en = readLanguage("en", root);
  const ar = readLanguage("ar", root);
  const entries = new Map();
  for (const [k, v] of en) entries.set(k, { en: v, ar: ar.has(k) ? ar.get(k) : null });
  const strays = [...ar.keys()].filter((k) => !en.has(k));
  return Object.assign(entries, { strays });
}
