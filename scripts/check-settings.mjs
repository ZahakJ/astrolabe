// The settings index still describes the settings panel — and the panel
// still keeps its own rules.
//
//   node scripts/check-settings.mjs
//
// A search that silently stops finding a row is worse than no search: the
// reader searches "arabic", finds nothing, and concludes the instance cannot do
// it. The index is generated from the panel's source, so the only way it goes
// wrong is by not being regenerated — which is exactly what this catches.
//
// It also closes a hole in check-i18n that has been open the whole time. That
// gate's usage scan counts any quoted dict-key token OUTSIDE i18n.ts, including
// one sitting in a comment — so a key whose last real call site was deleted can
// stay "used" forever because its name survives in a note about it. Every key
// in the index here is one this file has just seen in a `label={t("…")}` or
// `hint={t("…")}` position in real JSX, so a settings key that has stopped
// being rendered shows up as a REMOVED row rather than as nothing at all.
//
// Three more rules, each of which was broken once and fixed once, and which
// nothing else measures:
//   · every hint is ONE sentence of at most fourteen English words (CONTRACTS
//     "Settings panel"); fifteen hints had crept past it, one to fifty-two;
//   · the hint and its three siblings are `--text-muted`, never `--text-faint`
//     (DESIGN.md: faint is the non-text bar; a hint is read) — check-contrast
//     measures token pairs, not which selector wears which token;
//   · About's documentation list names files and headings that EXIST, slugged
//     the way build-docs slugs them; it named seven README anchors for years.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { settingsRows, tabSources } from "./settings-index.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(root + p, "utf8");
const HINT_MAX_WORDS = 14;

const checked = read("client/components/settings/settingsIndex.ts");
const parsed = [...checked.matchAll(/\{ tab: "([a-z]+)", label: "([A-Za-z0-9_]+)"(?:, hint: "([A-Za-z0-9_]+)")?(?:, env: "([A-Z0-9_]+)")?(?:, mode: "([a-z]+)")? \}/g)]
  .map((m) => ({ tab: m[1], label: m[2], hint: m[3] ?? null, env: m[4] ?? null, mode: m[5] ?? null }));

const fromSource = settingsRows();
const key = (r) => `${r.tab}/${r.label}/${r.hint ?? ""}/${r.env ?? ""}/${r.mode ?? ""}`;

const inFile = new Set(parsed.map(key));
const inSource = new Set(fromSource.map(key));
const errs = [];

for (const r of fromSource) {
  if (!inFile.has(key(r))) errs.push(`  ADDED or CHANGED in the panel, missing from the index: ${r.tab} / ${r.label}`);
}
for (const r of parsed) {
  if (!inSource.has(key(r))) errs.push(`  REMOVED or CHANGED in the panel, still in the index: ${r.tab} / ${r.label}`);
}
// The panel is the thing being described, so an empty parse is a broken parser
// rather than an empty panel — and would otherwise pass silently.
if (fromSource.length < 40) errs.push(`  only ${fromSource.length} rows parsed out of the panel — the parser is broken, not the panel`);

// ── Hints: fourteen words ───────────────────────────────────────────────────
// Every key the two panel files hand to `hint=`, including the ones chosen by
// a ternary (`hint={t(cond ? "a" : "b")}`) that the index parser cannot see.
// Since 3.27.0 the panel is a host and its tabs are files
// (client/components/settings/<Tab>Tab.tsx, chosen by TabBody.tsx): every file
// the index reads rows from is a file whose hints count, plus the dialog and
// About (whose DOC_TOPICS list is checked below).
const panelSrc = [
  ...new Set([
    "client/components/SettingsModal.tsx",
    "client/components/settings/AboutTab.tsx",
    ...tabSources().map((s) => s.files[0]),
  ]),
]
  .map(read)
  .join("\n");
const hintKeys = new Set();
for (const m of panelSrc.matchAll(/hint=\{t\(([^)]*)\)\}/g)) {
  for (const k of m[1].matchAll(/"([A-Za-z0-9_]+)"/g)) hintKeys.add(k[1]);
}
const i18n = read("client/i18n.ts");
const dict = i18n.slice(i18n.indexOf("const DICT = {"));
const english = (k) => {
  const m = new RegExp(`^  ${k}: \\{\\s*en: "((?:[^"\\\\]|\\\\.)*)"`, "m").exec(dict);
  return m ? m[1] : null;
};
let hintsChecked = 0;
for (const k of hintKeys) {
  const en = english(k);
  if (en === null) {
    errs.push(`  hint key ${k} has no English entry in DICT`);
    continue;
  }
  hintsChecked += 1;
  const words = en.trim().split(/\s+/).length;
  if (words > HINT_MAX_WORDS) errs.push(`  hint ${k} runs to ${words} words (max ${HINT_MAX_WORDS}): "${en}"`);
}
if (hintsChecked < 60) errs.push(`  only ${hintsChecked} hints found — the hint scan is broken, not the panel`);

// ── Hints are read, so they are muted ───────────────────────────────────────
// The last `color:` declared for each selector across the two sheets in link
// order (app.css, then settings.css) is what the browser paints outside any
// media block; it must be the muted token.
const READ_SELECTORS = [".s-smodal__hint", ".s-smodal__dirty", ".s-about__countlabel", ".s-smodal__fontmeta"];
const sheets = read("client/styles/app.css") + "\n" + read("client/styles/settings.css");
// Strip comments, then walk top-level rule blocks (media blocks are skipped:
// they are one nested level deeper and a `{` inside them is not a rule start
// at depth 0).
const css = sheets.replace(/\/\*[\s\S]*?\*\//g, "");
const lastColor = new Map();
let depth = 0;
let selector = "";
let body = "";
for (let i = 0; i < css.length; i++) {
  const ch = css[i];
  if (ch === "{") {
    depth += 1;
    if (depth === 1) body = "";
    continue;
  }
  if (ch === "}") {
    depth -= 1;
    if (depth === 0) {
      const sels = selector.trim().split(",").map((s) => s.trim());
      const color = [...body.matchAll(/(?:^|;)\s*color\s*:\s*([^;]+)/g)].pop()?.[1]?.trim();
      if (color !== undefined) for (const s of sels) lastColor.set(s, color);
      selector = "";
    }
    continue;
  }
  if (depth === 0) selector += ch;
  else if (depth === 1) body += ch;
  // depth 1 with a selector containing "@media" never happens at depth 0
  // because the media prelude is at depth 0 and its inner rules at depth 1+.
}
for (const s of READ_SELECTORS) {
  const c = lastColor.get(s);
  if (c === undefined) errs.push(`  ${s} has no color rule in app.css/settings.css`);
  else if (c !== "var(--text-muted)") errs.push(`  ${s} is painted ${c}; a hint is READ, so it is var(--text-muted)`);
}

// ── About's doc list names real files and headings ──────────────────────────
// build-docs' own slug rule, restated: lowercase, non-alphanumerics to "-".
const slugify = (text) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
const topics = [...panelSrc.matchAll(/\{ key: "(doc[A-Za-z]+)", file: "([^"]+)"(?:, anchor: "([^"]+)")? \}/g)];
if (topics.length < 5) errs.push(`  only ${topics.length} DOC_TOPICS parsed — the parser is broken, not the panel`);
for (const [, k, file, anchor] of topics) {
  if (!existsSync(root + file)) {
    errs.push(`  ${k} names ${file}, which does not exist`);
    continue;
  }
  if (anchor === undefined) continue;
  const headings = [...read(file).matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((m) => slugify(m[1]));
  if (!headings.includes(anchor)) errs.push(`  ${k} names ${file}#${anchor}; that file's headings are ${headings.join(", ")}`);
}

if (errs.length > 0) {
  console.error(`check-settings: the panel disagrees with its own rules\n${errs.join("\n")}\n\n  index drift: run node scripts/gen-settings-index.mjs`);
  process.exit(1);
}
console.log(`check-settings: ${fromSource.length} rows · ${fromSource.filter((r) => r.env).length} with an env var · index matches the panel`);
console.log(`check-settings: ${hintsChecked} hints ≤ ${HINT_MAX_WORDS} words · ${READ_SELECTORS.length} read-text selectors muted · ${topics.length} doc topics resolve`);
console.log("SETTINGS OK");
