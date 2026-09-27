// Derive the settings index from the panel's own source.
//
// Shared by `scripts/check-settings.mjs` (which asserts the checked-in index
// still matches), by the generator that writes it and by `check-docs` (which
// reads the group headings a "Settings → A → B" path may name). It is a
// SOURCE parse, not an import: the panel is React with store closures in it,
// and a gate that needs a browser is a gate nobody runs — the same reason
// check-i18n reads the dictionary files as text.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(root + p, "utf8");

/** The tab switch (client/components/settings/TabBody.tsx): one line per tab
 *  body, `{tab === "site" && <SiteTab />}`, in the order a reader meets them.
 *
 *  A line may say WHICH KIND OF VAULT it is drawn in — `{tab === "ask" &&
 *  !pocket && <AskTab />}` — and the mode is read off that condition rather
 *  than out of a second list somebody has to remember to update. A row with
 *  no mode is drawn in both kinds of vault, which is nearly all of them.
 *
 *  INSIDE a tab's file (the settings purge) four more things are read, each
 *  a tag on a line of its own:
 *    · `<InstanceOnly>` … `</InstanceOnly>` and `<PocketOnly>` … — the kind of
 *      vault the rows between them are drawn in (settings/Fold.tsx);
 *    · `<Advanced tab="…">` … `</Advanced>` — rows behind the section's
 *      Advanced line, which the index marks `adv: true`;
 *    · `<Part label={t("…")} …>` — a control folded into the row above it
 *      (the audit's MERGE), indexed as its own entry with `row:` naming its
 *      host, so a search still finds it and lands on it;
 *    · `<SomethingRows />` or `<SomethingRow />` — a component in its own
 *      file under settings/ whose rows are read IN PLACE, inheriting the
 *      mode and the Advanced flag around it (the travel row, the pocket's
 *      sync rows). */
const SETTINGS_DIR = "client/components/settings/";
/** A component a line renders → the file its rows are written in, when the
 *  two names differ. */
const FILE_OF = { PocketSyncRows: "PocketSync.tsx" };

function fileOf(comp) {
  const file = SETTINGS_DIR + (FILE_OF[comp] ?? `${comp}.tsx`);
  return existsSync(root + file) ? file : null;
}

/** Every file a tab body reads rows from, nested components included. */
function nestedFiles(file, seen = new Set()) {
  if (seen.has(file)) return [];
  seen.add(file);
  const out = [file];
  for (const line of read(file).split("\n")) {
    const inline = /^\s*(?:\{[^}]*&&\s*)?<([A-Z][A-Za-z]*Rows?)\b[^>]*\/>/.exec(line);
    const nested = inline && fileOf(inline[1]);
    if (nested) out.push(...nestedFiles(nested, seen));
  }
  return out;
}

/** The pages as client/components/settings/tabs.ts lists them — id, label key
 *  and rail group, in rail order — read as text like everything here. */
export function pages() {
  const src = /export const TABS: Tab\[\] = \[([\s\S]*?)\n\];/.exec(read(SETTINGS_DIR + "tabs.ts"))?.[1] ?? "";
  const out = [...src.matchAll(/\{ id: "(\w+)", key: "(\w+)", intro: "(\w+)", group: "(\w+)"(, device: true)? \}/g)].map((m) => ({
    id: m[1],
    key: m[2],
    intro: m[3],
    group: m[4],
    device: m[5] !== undefined,
  }));
  if (out.length < 10) throw new Error(`settings-index: only ${out.length} pages read out of tabs.ts — the parser is broken`);
  return out;
}

/** Every tab body the switch renders: its tab, its mode and its files. */
export function tabSources() {
  const out = [];
  for (const line of read(SETTINGS_DIR + "TabBody.tsx").split("\n")) {
    const m = /\{tab === "([a-z]+)" &&(?: (!?)pocket &&)?/.exec(line);
    if (!m) continue;
    const mode = m[2] === undefined ? null : m[2] === "!" ? "instance" : "pocket";
    const comp = /<([A-Z][A-Za-z]+)/.exec(line.slice(m.index + m[0].length))?.[1];
    if (!comp) throw new Error(`settings-index: no component on the ${m[1]} line of TabBody.tsx`);
    const file = fileOf(comp);
    if (!file) throw new Error(`settings-index: ${comp} (the ${m[1]} tab) has no file under ${SETTINGS_DIR}`);
    out.push({ tab: m[1], mode, files: nestedFiles(file) });
  }
  return out;
}

/** Read one file's rows (and group headings) in reading order. */
function parseFile(file, ctx, rows, groups, seen) {
  if (seen.has(file)) return;
  seen.add(file);
  const modes = [ctx.mode];
  let adv = ctx.adv ? 1 : 0;
  const lines = read(file).split("\n");
  const last = () => rows.at(-1);
  const lastRow = () => [...rows].reverse().find((r) => r.row === undefined);
  /** The Row/Part tag being read, until its label line. */
  let pending = null;
  for (const line of lines) {
    // A tag named in a comment ("`<InstanceOnly>` inside a section") is prose
    // about the wrapper, not the wrapper: only a line of code opens one.
    const code = !/^\s*(?:\/\/|\/\*|\*|\{\/\*)/.test(line);
    if (code && /<InstanceOnly>/.test(line)) modes.push("instance");
    if (code && /<PocketOnly>/.test(line)) modes.push("pocket");
    if (code && /<\/(?:InstanceOnly|PocketOnly)>/.test(line)) modes.pop();
    if (code && /<Advanced\b/.test(line)) {
      adv += 1;
      groups.push({ tab: ctx.tab, key: "settingsAdvanced" });
    }
    if (code && /<\/Advanced>/.test(line)) adv -= 1;
    const mode = modes.at(-1) ?? null;

    const sub = /s-smodal__sub"?>\{t\("(\w+)"\)\}/.exec(line);
    if (sub) groups.push({ tab: ctx.tab, key: sub[1] });

    const inline = /^\s*(?:\{[^}]*&&\s*)?<([A-Z][A-Za-z]*Rows?)\b[^>]*\/>/.exec(line);
    const nested = inline && fileOf(inline[1]);
    if (nested) {
      parseFile(nested, { tab: ctx.tab, mode, adv: adv > 0 }, rows, groups, seen);
      continue;
    }

    // A `<Row …>` / `<Part …>` tag may span lines; what it says about itself
    // before its label — its catalogue `kind`, whether it is kept on this
    // `device` — is gathered from the tag's first line to its label line.
    if (code && /<(?:Row|Part)\b/.test(line)) pending = { kind: null, device: false, part: /<Part\b/.test(line) };
    if (pending && code) {
      const kind = /\bkind="(\w+)"/.exec(line);
      if (kind) pending.kind = kind[1];
      if (/\sdevice(?=[\s>]|$)/.test(line)) pending.device = true;
    }

    const label = /label=\{t\("([A-Za-z0-9_]+)"\)\}/.exec(line);
    if (label) {
      // A row's own label and the CONTROL inside it usually carry the same key
      // — `<Row label={t("rowVimKeys")}><Toggle label={t("rowVimKeys")} …>` —
      // because the control needs an accessible name and the row already has
      // the right words. Two matches, one row: a repeat of the key we are
      // already collecting is that control, not a new row. The same holds for
      // a part and the control inside it, and for a host row's own control
      // that follows one of its parts.
      const part = pending?.part === true;
      const host = part ? lastRow() : undefined;
      const repeat = label[1] === last()?.label || (!part && label[1] === lastRow()?.label && last()?.row === lastRow()?.label);
      if (!repeat && pending) {
        rows.push({
          tab: ctx.tab,
          label: label[1],
          kind: pending.kind,
          device: pending.device,
          hint: null,
          more: [],
          env: null,
          mode,
          row: host?.label,
          adv: adv > 0,
        });
      }
      pending = null;
    }
    const entry = last();
    if (!entry || entry.tab !== ctx.tab) continue;
    const hint = /hint=\{t\("([A-Za-z0-9_]+)"\)\}/.exec(line);
    if (hint && entry.hint === null) entry.hint = hint[1];
    const env = /name:\s*"([A-Z0-9_]+)"/.exec(line);
    if (env && entry.env === null) entry.env = env[1];
    const more = /more=\{(\[?\s*t\("[A-Za-z0-9_]+"\)(?:\s*,\s*t\("[A-Za-z0-9_]+"\))*\s*\]?)\}/.exec(line);
    if (more && entry.more.length === 0) entry.more = [...more[1].matchAll(/t\("([A-Za-z0-9_]+)"\)/g)].map((m) => m[1]);
  }
}

/** Every row and group heading the panel renders, in the order a reader
 *  meets them. */
export function parseSettings() {
  const rows = [];
  const groups = [];
  for (const { tab, mode, files } of tabSources()) {
    parseFile(files[0], { tab, mode, adv: false }, rows, groups, new Set());
  }
  const groupOf = new Map(pages().map((p) => [p.id, p.group]));
  for (const r of rows) r.group = groupOf.get(r.tab) ?? "";
  return { rows, groups };
}

/** Every row the panel renders (parts included), in reading order. */
export function settingsRows() {
  return parseSettings().rows;
}

/** One index entry as the checked-in file writes it — the generator writes
 *  exactly this and `check-settings` compares exactly this. */
export function entryLine(r) {
  return (
    `  { tab: "${r.tab}", group: "${r.group}", label: "${r.label}", kind: "${r.kind}"` +
    (r.device ? ", device: true" : "") +
    (r.hint ? `, hint: "${r.hint}"` : "") +
    (r.more && r.more.length > 0 ? `, more: [${r.more.map((k) => `"${k}"`).join(", ")}]` : "") +
    (r.env ? `, env: "${r.env}"` : "") +
    (r.mode ? `, mode: "${r.mode}"` : "") +
    (r.row ? `, row: "${r.row}"` : "") +
    (r.adv ? ", adv: true" : "") +
    " },"
  );
}
