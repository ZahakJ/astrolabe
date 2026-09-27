// Regenerate client/components/settings/settingsIndex.ts from the panel source.
//
//   node scripts/gen-settings-index.mjs
//
// Run it after adding, moving or renaming a settings row. `npm run
// check-settings` fails the build when the checked-in file and the source
// disagree, so this is the only way the two stay in step — and the failure
// message names this command.

import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { entryLine, settingsRows } from "./settings-index.mjs";

export const INDEX_FILE = fileURLToPath(new URL("../client/components/settings/settingsIndex.ts", import.meta.url));

/** The whole checked-in file for these rows — what this script writes and
 *  what check-settings compares the file on disk against, byte for byte. */
export function renderIndex(rows) {
  const body = rows.map(entryLine).join("\n");
  return `// THE SETTINGS INDEX — what a search across the panel matches against.
//
// GENERATED from the panel's own source by \`node scripts/gen-settings-index.mjs\`,
// and held there by \`npm run check-settings\`. It is generated rather than
// hand-kept for the obvious reason: a hundred rows spread over a dozen files
// will drift from any list a human maintains, and a search that silently stops
// finding a row is worse than no search — the reader concludes the setting does
// not exist.
//
// It carries KEYS, not words. The search resolves them through \`t()\` at the
// moment it runs, so an Arabic instance searches Arabic labels and an English
// one searches English, from one index.

import type { I18nKey } from "../../i18n.ts";

export interface SettingEntry {
  /** The page this row lives in — \`TABS[].id\` in settings/tabs.ts. */
  tab: string;
  /** The rail group of that page — \`GROUPS[].id\` (You · Your site · Data ·
   *  App), read out of tabs.ts with the page. */
  group: "you" | "site" | "data" | "app";
  /** The row's label key. Also how a result finds its row in the DOM: \`Row\`
   *  stamps the RESOLVED label as \`data-setting\`, and the result resolves the
   *  same key to look it up. */
  label: I18nKey;
  hint?: I18nKey;
  /** The paragraph(s) behind the row's ⓘ — searched too, because the word a
   *  reader types is often in the reference text and not in the label. */
  more?: I18nKey[];
  /** The environment variable behind the row's ⓘ, when it has one. Searching
   *  \`SITE_LANG\` and landing on the row is the operator's half of this. */
  env?: string;
  /** WHICH KIND OF VAULT DRAWS THIS ROW, when it is not both. A pocket vault
   *  (a repository cloned onto a phone — mobile/src/pocket/) has no public
   *  site and no server-side repository, so Collections, Ask, the site's
   *  publishing rows and the whole repository side of Backup & sync are
   *  \`instance\`; the pocket's own Backup & sync rows are \`pocket\`. Read
   *  off the panel's own render condition (\`{tab === "ask" && !pocket && …}\`
   *  in TabBody.tsx, \`<InstanceOnly>\` inside a section) by
   *  scripts/settings-index.mjs, so the index cannot drift from what is drawn. The SEARCH honours it: a hit
   *  that scrolls to a row this vault does not have is the exact failure the
   *  index exists to prevent. */
  mode?: "instance" | "pocket";
  /** A PART, not a row: a control folded into the row whose label this is
   *  (\`<Part>\` in settings/Row.tsx — the audit's MERGE). It keeps its own
   *  label so a search finds it, and it stamps its own \`data-setting\`, so the
   *  hit lands on it; it does not count against a section's eighteen rows. */
  row?: I18nKey;
  /** Behind the section's Advanced line (settings/Fold.tsx), which a hit
   *  opens before it scrolls. */
  adv?: true;
}

export const SETTINGS_INDEX: SettingEntry[] = [
${body}
];
`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const rows = settingsRows();
  writeFileSync(INDEX_FILE, renderIndex(rows));
  console.log(`settings index: ${rows.filter((r) => !r.row).length} rows · ${rows.filter((r) => r.row).length} parts`);
}
