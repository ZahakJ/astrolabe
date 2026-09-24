// Derive the settings index from the panel's own source.
//
// Shared by `scripts/check-settings.mjs` (which asserts the checked-in index
// still matches) and by the generator that writes it. It is a SOURCE parse, not
// an import: the panel is React with store closures in it, and a gate that
// needs a browser is a gate nobody runs — the same reason check-i18n reads the
// DICT block as text.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(root + p, "utf8");

/** The tab switch (client/components/settings/TabBody.tsx): one line per tab
 *  body, `{tab === "site" && <SiteTab />}`, in the order a reader meets them.
 *
 *  A line may also say WHICH KIND OF VAULT it is drawn in. Since 3.22.2 the
 *  panel has two Backup & sync tabs and two fewer tabs on a phone: a pocket
 *  vault is a repository cloned onto a device, with no public site to publish
 *  to and no server-side repository to point at a remote, so `{tab ===
 *  "publishing" && !pocket && <PublishingTab />}` and `{tab === "sync" &&
 *  pocket && …<PocketSyncPanel />…}` are both real render conditions in the
 *  source. The mode is read off that condition rather than out of a second
 *  list somebody has to remember to update — the same bargain the whole index
 *  strikes with the panel. A row with no mode is drawn in both kinds of vault,
 *  which is nearly all of them.
 *
 *  SINCE 3.27.0 EACH BODY IS A FILE (the panel was 5,190 lines and the phone
 *  shell hosts the same bodies as pushed screens), so a line names the
 *  COMPONENT and the rows are read out of that component's file. */
const SETTINGS_DIR = "client/components/settings/";
/** A component a tab line renders → the file its rows are written in. */
const FILE_OF = { PocketSyncPanel: "PocketSync.tsx" };
/** Row-bearing components a tab body mounts inside itself, appended after
 *  the body's own rows in the order a reader meets them. The travel row is
 *  mounted at the end of the sync tab (`<TravelRow />`); it reports what an
 *  instance's data directory has mirrored into the vault. */
const NESTED = { SyncTab: ["TravelRow"] };

/** Every tab body the switch renders: its tab, its mode and its files. */
export function tabSources() {
  const out = [];
  for (const line of read(SETTINGS_DIR + "TabBody.tsx").split("\n")) {
    const m = /\{tab === "([a-z]+)" &&(?: (!?)pocket &&)?/.exec(line);
    if (!m) continue;
    const mode = m[2] === undefined ? null : m[2] === "!" ? "instance" : "pocket";
    const comp = /<([A-Z][A-Za-z]+)/.exec(line.slice(m.index + m[0].length))?.[1];
    if (!comp) throw new Error(`settings-index: no component on the ${m[1]} line of TabBody.tsx`);
    const files = [FILE_OF[comp] ?? `${comp}.tsx`, ...(NESTED[comp] ?? []).map((c) => FILE_OF[c] ?? `${c}.tsx`)];
    out.push({ tab: m[1], mode, files: files.map((f) => SETTINGS_DIR + f) });
  }
  return out;
}

function rowsIn(lines, from, to, tab, mode = null) {
  const out = [];
  let pending = null;
  for (let i = from; i < to; i++) {
    const line = lines[i];
    const label = /label=\{t\("([A-Za-z0-9_]+)"\)\}/.exec(line);
    if (label) {
      // A row's own label and the CONTROL inside it usually carry the same key
      // — `<Row label={t("rowVimKeys")}><Toggle label={t("rowVimKeys")} …>` —
      // because the control needs an accessible name and the row already has
      // the right words. Two matches, one row: a repeat of the key we are
      // already collecting is that control, not a new row.
      if (label[1] !== pending?.label) {
        if (pending) out.push(pending);
        pending = { tab, label: label[1], hint: null, env: null, mode };
      }
    }
    if (!pending) continue;
    const hint = /hint=\{t\("([A-Za-z0-9_]+)"\)\}/.exec(line);
    if (hint && pending.hint === null) pending.hint = hint[1];
    const env = /name:\s*"([A-Z0-9_]+)"/.exec(line);
    if (env && pending.env === null) pending.env = env[1];
  }
  if (pending) out.push(pending);
  return out;
}

/** Every row the panel renders, in the order a reader meets them. */
export function settingsRows() {
  const rows = [];
  for (const { tab, mode, files } of tabSources()) {
    for (const file of files) {
      const lines = read(file).split("\n");
      rows.push(...rowsIn(lines, 0, lines.length, tab, mode));
    }
  }
  return rows;
}
