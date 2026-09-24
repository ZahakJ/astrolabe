// THE MANUAL, TRUE AND LINKED. Assert: every link in the docs lands, in both
// languages; every "Settings → …" path names a tab and a row that exist;
// every image is on disk; and every page ships in Arabic with the same
// headings as its English twin.
//
//   npm run check-docs   ·   node scripts/check-docs.mjs
//
// WHY THIS EXISTS. The manual is good writing that stopped being checked. A
// 3.15 audit found 5 dead English anchors, 71 Arabic anchors pointing at
// English heading ids (a reader lands at the top of the page, which looks like
// nothing is wrong), a link to a page that had been renamed two releases
// earlier, and five settings paths naming tabs that no longer exist. None of
// it was a lie when it was written; every gate the repo had looked at code,
// and nothing looked at prose that names product surfaces. This does.
//
// Pure, no browser, no server, like check-keymap: it reads the Markdown under
// docs/ and the README, walks the links with marked's lexer (so link syntax
// quoted inside a code span or a fence is left alone — the docs show plenty
// of it), and resolves each one against the tree. Anchors resolve through
// `headingIds` in scripts/build-docs.mjs, the ONE slug rule, which is
// GitHub's — so a link the gate blesses lands on the site and on GitHub both.
//
// The settings check reads the panel's own source: the tab table in
// SettingsModal.tsx, the group headings it renders, and the checked-in row
// index (settingsIndex.ts, itself held to the source by check-settings), with
// the labels resolved through client/i18n.ts in the page's language. A path
// may stop after any segment and run on into prose ("Settings → Vault under
// the daily rows"); what it may not do is name a tab, a group or a row that
// is not there, in either language.
//
// tests/docs.test.ts runs the same function under `npm test`.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { PAGES, headingIds } from "./build-docs.mjs";
import { SETTINGS_INDEX } from "../client/components/settings/settingsIndex.ts";
import { tabSources } from "./settings-index.mjs";
import { readDictionary } from "./dictionary.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");

// ── The dictionary, the tabs, the groups ────────────────────────────────────

function dictionary() {
  // client/i18n/en.ts and ar.ts, read as text (scripts/dictionary.mjs).
  return readDictionary(root);
}

/** The panel's tabs (`TABS` in settings/tabs.ts) and, per tab, the group
 *  headings it renders (`s-smodal__sub`) — read out of each tab body's file
 *  through the same switch scripts/settings-index.mjs reads for rows. */
function panel(dict) {
  const tabsFile = read("client/components/settings/tabs.ts");
  const tabsSrc = /const TABS: Tab\[\] = \[([\s\S]*?)\];/.exec(tabsFile)?.[1] ?? "";
  const tabs = [...tabsSrc.matchAll(/id: "(\w+)", key: "(\w+)"/g)].map((m) => ({ id: m[1], label: dict.get(m[2]) }));
  const groups = new Map(tabs.map((t) => [t.id, []]));
  for (const { tab, files } of tabSources()) {
    for (const file of files) {
      for (const line of read(file).split("\n")) {
        const sub = /s-smodal__sub"?>\{t\("(\w+)"\)\}/.exec(line);
        if (sub && groups.has(tab)) groups.get(tab).push(dict.get(sub[1]));
      }
    }
  }
  const rows = new Map(tabs.map((t) => [t.id, []]));
  for (const r of SETTINGS_INDEX) rows.get(r.tab)?.push(dict.get(r.label));
  return { tabs, groups, rows };
}

// ── Markdown walking ────────────────────────────────────────────────────────

/** Every link and image token in a document, code spans and fences excluded
 *  (marked never tokenises inside them, which is the point of using it). */
function linksOf(markdown) {
  const out = [];
  const walk = (tokens) => {
    for (const t of tokens ?? []) {
      if (t.type === "link") out.push({ kind: "link", href: t.href });
      if (t.type === "image") out.push({ kind: "image", href: t.href });
      if (t.type === "table") {
        for (const c of t.header) walk(c.tokens);
        for (const r of t.rows) for (const c of r) walk(c.tokens);
      }
      walk(t.tokens);
      walk(t.items);
    }
  };
  marked.use({ gfm: true });
  walk(marked.lexer(markdown));
  // Raw HTML in the sources (`<a href>`, `<img src>`) — the README's hero.
  for (const m of markdown.matchAll(/<(?:a|img)\b[^>]*\b(?:href|src)="([^"]+)"/g)) out.push({ kind: m[0].startsWith("<img") ? "image" : "link", href: m[1] });
  return out;
}

/** The prose with code spans and fences blanked, so a settings path quoted
 *  as an example inside backticks is not read as a claim. */
function proseOf(markdown) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return markdown.replace(/```[\s\S]*?```/g, blank).replace(/`[^`\n]*`/g, blank).replace(/\*/g, "");
}

// ── The checks ──────────────────────────────────────────────────────────────

const ARROW = "(?:→|←)";
const STOP = /[.,;:()"“”\[\]—–?!،؛؟|]|\s(?:and|or|و)\s/;

/** `"Settings → This device → This app"` → segments, each cut at the first
 *  character that cannot be part of a label. */
function segmentsOf(text) {
  // A path wrapped by the source's line width is one path.
  return text.replace(/\s+/g, " ").split(new RegExp(`\\s*${ARROW}\\s*`)).map((s) => {
    const stop = STOP.exec(s);
    return (stop ? s.slice(0, stop.index) : s).trim();
  });
}

/** The label that opens `segment`, longest first, or null. A label must end
 *  the segment or be followed by a space so "Vault" is not found in
 *  "Vaulted". */
function labelAt(segment, labels) {
  const hit = labels
    .filter((l) => l && (segment === l || segment.startsWith(`${l} `)))
    .sort((a, b) => b.length - a.length)[0];
  return hit ?? null;
}

function checkSettingsPaths(file, markdown, lang, p, errors) {
  const settingsWord = lang === "ar" ? "الإعدادات" : "Settings";
  const re = new RegExp(`${settingsWord}\\s*${ARROW}\\s*((?:[^\\n]|\\n(?!\\n)){1,200})`, "g");
  const prose = proseOf(markdown);
  for (const m of prose.matchAll(re)) {
    const line = prose.slice(0, m.index).split("\n").length;
    const segs = segmentsOf(m[1]);
    const tab = p.tabs.find((t) => labelAt(segs[0], [t.label?.[lang]]));
    if (!tab) {
      errors.push(`${file}:${line}: "${settingsWord} → ${segs[0]}" names no settings tab (${p.tabs.map((t) => t.label?.[lang]).join(" · ")})`);
      continue;
    }
    if (segs[0] !== tab.label[lang] || segs.length < 2) continue; // prose follows the tab, or the path ends there
    const groups = p.groups.get(tab.id).map((g) => g?.[lang]);
    const rows = p.rows.get(tab.id).map((r) => r?.[lang]);
    const second = labelAt(segs[1], [...groups, ...rows]);
    if (!second) {
      errors.push(`${file}:${line}: "${settingsWord} → ${segs[0]} → ${segs[1]}" names no row or group on the ${tab.label.en} tab`);
      continue;
    }
    if (segs[1] !== second || segs.length < 3) continue;
    // Under a group comes a row, or a smaller group ("Typography → Your own fonts").
    if (groups.includes(second) && !labelAt(segs[2], [...rows, ...groups])) {
      errors.push(`${file}:${line}: "${settingsWord} → ${segs[0]} → ${segs[1]} → ${segs[2]}" names no row under ${second} on the ${tab.label.en} tab`);
    }
  }
}

function checkLinks(file, markdown, errors) {
  const dir = dirname(file);
  const own = headingIds(markdown).map((h) => h.id);
  for (const { kind, href } of linksOf(markdown)) {
    if (/^(https?:|mailto:|data:)/.test(href)) continue;
    const [path, hash] = href.split("#");
    if (path === "") {
      if (hash && !own.includes(hash)) errors.push(`${file}: #${hash} is not a heading of this page (${nearest(hash, own)})`);
      continue;
    }
    const target = posix.normalize(posix.join(dir, decodeURIComponent(path)));
    const abs = join(root, target);
    if (!existsSync(abs)) {
      errors.push(`${file}: ${kind} → ${href} — ${target} does not exist`);
      continue;
    }
    if (hash) {
      if (!/\.md$/.test(target)) {
        errors.push(`${file}: ${href} carries an anchor into a file that is not Markdown`);
        continue;
      }
      const ids = headingIds(read(target)).map((h) => h.id);
      if (!ids.includes(hash)) errors.push(`${file}: ${href} — ${target} has no heading "${hash}" (${nearest(hash, ids)})`);
    }
  }
}

/** For the message: the id that shares the most characters with the miss. */
function nearest(hash, ids) {
  const score = (id) => {
    let n = 0;
    while (n < hash.length && n < id.length && hash[n] === id[n]) n++;
    return n;
  };
  const best = [...ids].sort((a, b) => score(b) - score(a))[0];
  return best ? `nearest: #${best}` : "the page has no headings";
}

function checkPairs(errors) {
  const listed = new Set(PAGES.map((p) => p.file));
  for (const f of readdirSync(join(root, "docs")).filter((f) => f.endsWith(".md") && f !== "README.md")) {
    if (!listed.has(f)) errors.push(`docs/${f} is not in SECTIONS (scripts/build-docs.mjs), so the site never shows it`);
  }
  for (const f of readdirSync(join(root, "docs/ar")).filter((f) => f.endsWith(".md"))) {
    if (!listed.has(f)) errors.push(`docs/ar/${f} is not in SECTIONS (scripts/build-docs.mjs), so the site never shows it`);
  }
  for (const page of PAGES) {
    const en = join(root, "docs", page.file);
    const ar = join(root, "docs/ar", page.file);
    if (!existsSync(en)) errors.push(`docs/${page.file} is in SECTIONS but missing`);
    if (!existsSync(ar)) {
      errors.push(`docs/ar/${page.file} is missing — every page ships in both languages`);
      continue;
    }
    if (!existsSync(en)) continue;
    const shape = (p) => headingIds(readFileSync(p, "utf8")).map((h) => h.depth);
    const a = shape(en);
    const b = shape(ar);
    if (a.join(",") !== b.join(",")) {
      const at = a.findIndex((d, i) => d !== b[i]);
      errors.push(
        `docs/${page.file} and docs/ar/${page.file} differ in heading structure (${a.length} vs ${b.length} headings; first difference at heading ${at < 0 ? Math.min(a.length, b.length) + 1 : at + 1})`,
      );
    }
  }
}

/** Every finding, as `file: what`; empty when the manual is true and linked. */
export function checkDocs() {
  const errors = [];
  const dict = dictionary();
  const p = panel(dict);
  const files = [
    "README.md",
    "docs/README.md",
    ...readdirSync(join(root, "docs")).filter((f) => f.endsWith(".md") && f !== "README.md").map((f) => `docs/${f}`),
    ...readdirSync(join(root, "docs/ar")).filter((f) => f.endsWith(".md")).map((f) => `docs/ar/${f}`),
  ];
  for (const file of files) {
    const markdown = read(file);
    const lang = file.startsWith("docs/ar/") ? "ar" : "en";
    checkLinks(file, markdown, errors);
    checkSettingsPaths(file, markdown, lang, p, errors);
  }
  checkPairs(errors);
  return { errors, files: files.length, pages: PAGES.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { errors, files, pages } = checkDocs();
  if (errors.length > 0) {
    console.error(`check-docs: ${errors.length} problem(s) in ${files} files\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`check-docs: ${files} files · ${pages} pages in both languages · every link, anchor, image and settings path resolves`);
  console.log("DOCS OK");
}
