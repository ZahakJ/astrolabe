#!/usr/bin/env node
// THE NAMES GATE. Two features were renamed twice in three releases — the
// daily routine (Routines → Orbits → Sigils) and the spaced-repetition
// page (Review → Constellations, its working name → Orbits) — and the owner
// asked for one thing above all: "make sure the old paths and names are not
// vestigial and confusing anywhere". A rename that leaves one toast, one
// hint, one heading or one folder saying the old word is worse than no
// rename, and no reviewer can read every surface twice. So this greps them.
//
// WHAT IS READ: every en and ar VALUE in client/i18n.ts and in the Orbits
// surface's own copy table (client/orbits/copy.ts); every docs/*.md and
// docs/ar/*.md; README.md; vault-seed/**; the packages' own descriptions
// (the AppStream metainfo, electron-builder.yml, the package.json files);
// the what's-new deck (client/whatsnew/releaseNotes.ts); and the section
// headings of CONTRACTS.md and every contracts/*.md. WHAT IS LOOKED FOR: the words nothing a reader sees may say
// any more — routine, constellation, flashcard (say "card") — and their
// Arabic (الروتين, الكوكبات, بطاقات تعليمية). Then client/ and server/
// source for the old ADDRESSES "/constellations" and "/routines", which
// may exist only as redirect sources.
//
// THE ONE EXCEPTION, spelled the same way everywhere: a line that carries
// the word "lineage" in a comment — `<!-- lineage -->` in Markdown,
// `// lineage` in the deck's source, `lineage:` in a code comment — is
// history and is skipped. It exists because the lineage has to be told
// somewhere (the 3.15.0 slide is titled "Routines are Sigils now" by the
// owner's decision, the docs say which older fences still work), and it
// must be marked on the line so the exception is visible where it is
// used. There are NO exceptions in i18n values: a string a reader sees has
// no footnote to hide behind. A hit prints file:line and the script exits
// non-zero. `npm run check-names`.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const rel = (p) => relative(root, p);

/** The forbidden words. Word-ish boundaries on the Latin ones so "routine"
 *  in "subroutine" is not caught by accident (it never appears, but the
 *  gate should not be the reason it cannot); the Arabic ones are looked
 *  for whole. */
const WORDS = [
  { re: /\broutines?\b/i, say: "routine → sigil" },
  { re: /\bconstellations?\b/i, say: "constellation → deck (the page is Orbits)" },
  { re: /\bflash-?cards?\b/i, say: "flashcard → card" },
  { re: /الروتين/, say: "الروتين → السِّجِلّ" },
  { re: /الكوكبات/, say: "الكوكبات → المدارات / المجموعات" },
  { re: /بطاقات تعليمية/, say: "بطاقات تعليمية → بطاقات" },
];
const LINEAGE = /lineage/;

const hits = [];
function hit(file, line, text, why) {
  hits.push(`${rel(file)}:${line}: ${why} — ${text.trim().slice(0, 120)}`);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "site" || name === "node_modules") continue;
      walk(p, out);
    } else out.push(p);
  }
  return out;
}

/** Every line of a file against the words, the lineage marker honoured
 *  (or not, for the dictionaries). */
function scanLines(file, lines, { allowLineage }) {
  lines.forEach((text, i) => {
    if (allowLineage && LINEAGE.test(text)) return;
    for (const w of WORDS) if (w.re.test(text)) hit(file, i + 1, text, w.say);
  });
}

// ── 1. Dictionary VALUES: client/i18n.ts and client/orbits/copy.ts ──────────
// Only the quoted en:/ar: values, never the keys (`routinesAdd` is an
// identifier the owner let stand) and never the comments (which explain the
// lineage and may say the old words).
function scanDict(file) {
  const src = readFileSync(file, "utf8").split("\n");
  src.forEach((text, i) => {
    // A comment line, or the comment tail of a code line, is not copy.
    const code = text.replace(/\/\/.*$/, "");
    for (const m of code.matchAll(/\b(en|ar):\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g)) {
      const value = m[2].slice(1, -1);
      for (const w of WORDS) if (w.re.test(value)) hit(file, i + 1, value, `${w.say} (${m[1]} value)`);
    }
  });
}
scanDict(join(root, "client/i18n.ts"));
scanDict(join(root, "client/orbits/copy.ts"));
scanDict(join(root, "client/components/settings/travelCopy.ts"));

// ── 2. Prose: the docs, the README, the seed vault ───────────────────────────
for (const dir of ["docs", "docs/ar"]) {
  for (const name of readdirSync(join(root, dir))) {
    if (!name.endsWith(".md")) continue;
    const file = join(root, dir, name);
    scanLines(file, readFileSync(file, "utf8").split("\n"), { allowLineage: true });
  }
}
scanLines(join(root, "README.md"), readFileSync(join(root, "README.md"), "utf8").split("\n"), { allowLineage: true });
for (const file of walk(join(root, "vault-seed"))) {
  if (!/\.(md|tex|txt)$/.test(file)) continue;
  scanLines(file, readFileSync(file, "utf8").split("\n"), { allowLineage: true });
}
// The packages' own blurbs: what a software centre or `apt show` prints.
// The 3.16 rename sweep read every page of the manual and missed both of
// these ("trackers, orbits and flashcards"), which is how a store listing
// ends up describing a release two names ago.
for (const rel of ["desktop/appstream/dev.astrolabe.desktop.metainfo.xml", "desktop/electron-builder.yml", "package.json", "mobile/package.json", "desktop/package.json"]) {
  const file = join(root, rel);
  scanLines(file, readFileSync(file, "utf8").split("\n"), { allowLineage: true });
}

// ── 3. The what's-new deck ──────────────────────────────────────────────────
// Every slide of every release is read on first open of a version, so the
// deck is copy. The history it tells (3.11 shipped "Routines"; 3.13's
// "Flashcards" slide) is marked `// lineage` line by line. Imports, comment
// lines, `docs:` slugs (links, which the site's MOVED table redirects) and a
// demo's internal note path are code, not copy, and are not read.
{
  const file = join(root, "client/whatsnew/releaseNotes.ts");
  const lines = readFileSync(file, "utf8").split("\n").map((text) => (/^\s*(import\b|\/\/|\/\*|\*)|^\s*(docs|notePath):\s*"/.test(text) ? "" : text));
  scanLines(file, lines, { allowLineage: true });
}

// ── 4. The contracts' headings ──────────────────────────────────────────────
// CONTRACTS.md is the map; the contracts themselves are contracts/*.md, one
// file per area, and every heading in every one of them is read.
for (const file of [join(root, "CONTRACTS.md"), ...readdirSync(join(root, "contracts")).filter((n) => n.endsWith(".md")).map((n) => join(root, "contracts", n))]) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((text, i) => {
    if (!/^#{1,6}\s/.test(text)) return;
    if (LINEAGE.test(text)) return;
    for (const w of WORDS) if (w.re.test(text)) hit(file, i + 1, text, `${w.say} (heading)`);
  });
}

// ── 5. The old addresses in source ──────────────────────────────────────────
// "/constellations" and "/routines" may survive only where a bookmark from
// an older release is turned into the new address, and that line says so.
// An ADDRESS is a string literal that begins with the path (`"/routines"`,
// `"/constellations/"`); a module path (`../routines/orbits.ts`) and the
// tick route's own name (`GET /api/routines`, an identifier the owner let
// stand, mounted under /api) are not addresses of a page.
const ADDRESSES = [/["'`]\/constellations(?:\/|["'`])/, /["'`]\/routines(?:\/|["'`])/];
for (const dir of ["client", "server"]) {
  for (const file of walk(join(root, dir))) {
    if (!/\.(ts|tsx|mjs|css)$/.test(file)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, i) => {
      if (LINEAGE.test(text)) return;
      const stripped = text.replace(/api\.(get|post|put|delete)\("\/routines?\b/g, "");
      for (const re of ADDRESSES) if (re.test(stripped)) hit(file, i + 1, text, "an old page address in source (redirect sources are marked lineage)");
    });
  }
}

if (hits.length > 0) {
  console.error(`NAMES: ${hits.length} hit${hits.length === 1 ? "" : "s"} — the old words are still on a surface a reader sees:`);
  for (const h of hits) console.error(`  ${h}`);
  process.exit(1);
}
console.log("NAMES OK — no routine / constellation / flashcard on any reader-facing surface; old addresses only as marked redirects");
