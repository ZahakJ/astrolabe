// Types for the docs gate's one export, read by tests/docs.test.ts under the
// strict `npm run typecheck`. The gate itself is plain JavaScript.

export interface DocsReport {
  /** Every finding, as `file: what`; empty when the manual is true and linked. */
  errors: string[];
  files: number;
  pages: number;
}

export function checkDocs(): DocsReport;

/** Programs whose own settings a string may name ("Chrome: Settings → …"),
 *  by dictionary key. */
export const FOREIGN_SETTINGS: Map<string, string>;

/** Every "Settings → …" path in the dictionary's values that names a page, a
 *  group or a row the panel does not have, as `file: key: what`. `entries`
 *  is `key → { en, ar }`; the panel defaults to the real one. */
export function checkStrings(entries: Map<string, { en: string | null; ar: string | null }>): string[];
