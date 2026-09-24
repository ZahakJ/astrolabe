// Assert: every t()/tf() key used in client/ exists in the dictionary
// (client/i18n/en.ts, the key list, and client/i18n/ar.ts), every key
// defines BOTH en and ar (non-empty, and ar actually differs / is Arabic),
// every key is used somewhere (counted from the CALL SITES only — the
// dictionary is excluded from the usage scan, or a key whose English value is
// its own name marks itself used and no dead key can ever be reported; see the
// note at the scan), tf() placeholders match across langs, and
// no user-visible English copy is typed straight into the source (bypassing
// t()) — in JSX *or* in the imperative DOM builders — and the same for the Android
// shell (mobile/src), which keeps its own two-language table.
//
// That last scan is the point of this script. Diffing dict-against-used only
// proves the dictionary is tidy; it can never see a string that never went
// near t(), so it certified "PARITY OK / 290 of 290" while `btn.title =
// "Fold section"` shipped to an Arabic instance. The source-against-dict half
// below is what actually answers "is the translation complete", and it has to
// cover .ts as well as .tsx: the editor's chrome (fold chevrons, embed cards,
// upload pills, transclusions) is built with createElement + textContent, not
// JSX, which is exactly where the survivors were hiding.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { copyWords, readShellDictionary, scanDom, scanTsx } from "./i18nScan.mjs";
import { readDictionary } from "./dictionary.mjs";

// TWO ROOTS, ONE DICTIONARY. `client/` is where the dictionary lives and where
// almost every call site is; `electron/` is the native application menu, whose
// copy is user-visible chrome in exactly the way a button label is and which
// this gate could not see at all — its scan root was `client/`, so the menu
// could have shipped untranslated past a green build. The dictionary itself
// stays put: the point is that `electron/` USES it rather than keeping a second
// one that would drift.
// `shared/` joined the roots with the theme builder's surface layer: every
// token in shared/customTheme.ts names its dictionary key (`label:
// "tkSidebarBg"`), which is the one place those 124 keys are spoken, and a
// scan that could not see it reported the whole dictionary block dead.
const ROOTS = ["../client/", "../electron/", "../shared/"].map(
  (r) => new URL(r, import.meta.url).pathname,
);
const root = ROOTS[0];
const src = readFileSync(join(root, "i18n.ts"), "utf8");

// The dictionary: client/i18n/en.ts (the key list) and client/i18n/ar.ts,
// read as text through scripts/dictionary.mjs. A key only the Arabic file has
// is refused here in words as well as by the type.
const entries = readDictionary(new URL("..", import.meta.url).pathname);

// `rel` is recorded alongside the absolute path rather than sliced off one
// prefix later: with two roots there is no single prefix to slice, and a
// findings line that printed half a path would be worse than one that printed
// none.
const files = [];
for (const base of ROOTS) {
  let exists = true;
  try {
    statSync(base);
  } catch {
    exists = false; // a checkout without the desktop app is not a failure
  }
  if (!exists) continue;
  (function walk(d) {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(p)) files.push({ abs: p, rel: p.slice(base.length) });
    }
  })(base);
}

const used = new Set();
const errs = [];
for (const { abs: f } of files) {
  // THE DICTIONARY IS NOT A CALL SITE. This scan used to read i18n.ts along
  // with everything else, and the dead-key check below is a set difference
  // against it — so a key whose own English value happens to be the key name
  // (`read: { en: "read", … }`) matched the `"([A-Za-z0-9_]+)"` token scan
  // inside its OWN definition and marked itself used. `read` was reachable
  // from nowhere in the product and the gate still printed "used keys: 617 /
  // dict keys: 617 · PARITY OK". A gate that counts a definition as a use can
  // never report a dead key, which made the whole line ceremonial.
  if (f.endsWith("/i18n.ts") || /\/i18n\/(en|ar)\.ts$/.test(f)) continue;
  const s = readFileSync(f, "utf8");
  // Keys reach t()/tf() literally, via conditionals (t(a ? "x" : "y")), and via
  // thunk tables — so count any quoted dict-key token outside i18n.ts itself.
  for (const mm of s.matchAll(/"([A-Za-z0-9_]+)"/g)) if (entries.has(mm[1])) used.add(mm[1]);
}

for (const k of entries.strays) errs.push(`MISSING en (only client/i18n/ar.ts has it): ${k}`);
for (const [k, v] of entries) {
  if (!v.en) errs.push(`MISSING en: ${k}`);
  if (!v.ar) errs.push(`MISSING ar: ${k}`);
  if (v.en && v.ar && v.en === v.ar && /[A-Za-z]{3}/.test(v.en)) errs.push(`ar === en (untranslated?): ${k} = "${v.en}"`);
  if (v.ar && !/[؀-ۿ]/.test(v.ar) && /[A-Za-z]{3}/.test(v.ar)) errs.push(`ar has no Arabic script: ${k} = "${v.ar}"`);
  // placeholder parity
  const ph = (s) => [...(s || "").matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join(",");
  if (ph(v.en) !== ph(v.ar)) errs.push(`placeholder mismatch: ${k} en[${ph(v.en)}] ar[${ph(v.ar)}]`);
}
// ── Bare English copy in JSX, and in the imperative DOM ─────────────────────
// The dictionary can only guard strings that go through t()/tf(); a literal
// typed straight into JSX or written into a DOM node is invisible to it, and
// such literals have shipped ("note (default)" in a settings <select>,
// `btn.title = "Fold section"` on an Arabic instance). The scan reads the
// TypeScript syntax tree (scripts/i18nScan.mjs, which says what the old
// line-by-line regexes could not see): JSX text, the copy-bearing
// attributes, braced string children, and the DOM sinks, each followed
// through conditionals and `||`/`??`, never into a call's arguments.
// Keycaps and code (<kbd>, <code>), identifiers, URLs and proper names are
// not copy; a literal its author marks "not copy" on or just above its line
// is skipped, and says why there.
// countPhrase(n, "words") unit names are keys into the plural table, not copy.
const COUNT_UNITS = new Set(
  [...src.slice(src.indexOf("type CountUnit ="), src.indexOf("const UNITS")).matchAll(/"(\w+)"/g)].map(
    (m) => m[1],
  ),
);
for (const { abs: f, rel } of files) {
  if (rel === "i18n.ts") continue; // the dictionary itself
  // shared/ is in the roots for the USAGE scan (its token specs name
  // dictionary keys); it builds no DOM and no JSX.
  if (f.includes("/shared/")) continue;
  const source = readFileSync(f, "utf8");
  if (f.endsWith(".tsx")) {
    for (const hit of scanTsx(source, f)) errs.push(`BARE ENGLISH (${hit.kind}): ${rel}:${hit.line}  “${hit.text.slice(0, 60)}”`);
  }
  for (const hit of scanDom(source, f)) {
    // A countPhrase unit is a key into the plural table, not copy.
    if (COUNT_UNITS.has(hit.text)) continue;
    errs.push(`BARE ENGLISH (dom ${hit.kind}): ${rel}:${hit.line}  “${hit.text.slice(0, 60)}”`);
  }
}

// ── The Android shell (mobile/src) ──────────────────────────────────────────
// Its own dictionary, mobile/src/i18n.ts, because the connect screen and the
// capture sheet speak before the client exists. The KEYS are held equal by
// the type (`const ar: Copy`); this holds the VALUES: both present, the
// Arabic in Arabic, the same parameters interpolated, every key used — and
// no English typed past it into the shell's DOM, its `el()` builders, or the
// JSON error bodies its service worker answers with.
{
  const mobileRoot = new URL("../mobile/src/", import.meta.url).pathname;
  let present = true;
  try {
    statSync(join(mobileRoot, "i18n.ts"));
  } catch {
    present = false; // a checkout without the Android shell is not a failure
  }
  if (present) {
    const dict = readShellDictionary(readFileSync(join(mobileRoot, "i18n.ts"), "utf8"));
    if (dict.en.size === 0) errs.push("MOBILE: could not read mobile/src/i18n.ts (no `const en = {…}`)");
    for (const [key, en] of dict.en) {
      const ar = dict.ar.get(key);
      if (!ar) {
        errs.push(`MOBILE MISSING ar: ${key}`);
        continue;
      }
      if (!en || !en.text.trim()) errs.push(`MOBILE MISSING en: ${key}`);
      // A value with words to translate must carry Arabic script in Arabic;
      // a proper name ("Astrolabe") is the same in both.
      if (en && copyWords(en.text).length > 0 && !/[\u0600-\u06ff]/.test(ar.text)) errs.push(`MOBILE ar has no Arabic script: ${key} = "${ar.text}"`);
      if (en && en.holes.join(",") !== ar.holes.join(",")) errs.push(`MOBILE placeholder mismatch: ${key} en[${en.holes}] ar[${ar.holes}]`);
    }
    for (const key of dict.ar.keys()) if (!dict.en.has(key)) errs.push(`MOBILE ar-only key: ${key}`);

    const mobileFiles = [];
    (function walk(d) {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(p) && !p.endsWith("/i18n.ts")) mobileFiles.push(p);
      }
    })(mobileRoot);
    // A key is used as `t.key`, or by NAME where the sync line picks its
    // words (shared/pocketSync.ts answers `{ key: "syncing" }`).
    const pocketSync = new URL("../shared/pocketSync.ts", import.meta.url).pathname;
    const mobileText = [...mobileFiles, pocketSync].map((f) => readFileSync(f, "utf8")).join("\n");
    for (const key of dict.en.keys()) {
      if (!new RegExp(`\\.${key}\\b|"${key}"`).test(mobileText)) errs.push(`MOBILE UNUSED key: ${key}`);
    }
    for (const f of mobileFiles) {
      for (const hit of scanDom(readFileSync(f, "utf8"), f, { shell: true })) {
        errs.push(`BARE ENGLISH (mobile ${hit.kind}): mobile/src/${f.slice(mobileRoot.length)}:${hit.line}  “${hit.text.slice(0, 60)}”`);
      }
    }
    console.log(`mobile keys: ${dict.en.size} en / ${dict.ar.size} ar, ${mobileFiles.length} shell files scanned`);
  }
}

for (const k of used) if (!entries.has(k)) errs.push(`USED BUT UNDEFINED: ${k}`);
for (const k of entries.keys()) if (!used.has(k)) errs.push(`UNUSED dict key: ${k}`);

console.log(`dict keys: ${entries.size}, used keys: ${used.size}`);
if (errs.length) { console.log("FAIL:\n" + errs.join("\n")); process.exit(1); }
console.log("PARITY OK");
