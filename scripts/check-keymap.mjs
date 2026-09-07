// THE KEYMAP GATE. Assert: no two rows of the ledger claim the same keystroke
// in the same place, and docs/keymap.md is a RENDERING of that ledger rather
// than a second copy of it.
//
//   npm run check-keymap   ·   node scripts/check-keymap.mjs
//
// WHY THIS EXISTS. A colliding binding is the quietest bug this product can
// have. One handler answers the key, the other never sees the event, and
// neither of them knows the other exists — so the failure surfaces as a reader
// saying "Ctrl+B does nothing", weeks later, on one platform. There is no
// stack trace and nothing to grep for, because nothing is wrong with either
// binding; what is wrong is that there are two.
//
// Two handlers carry bindings today (the window listener in client/App.tsx and
// CodeMirror's keymap stack), a desktop runtime will make three, and the plan
// that follows this stage adds roughly forty more keys across them. Forty
// bindings through three doors is not a thing anyone audits by eye, so the
// build audits it: `GROUPS` in client/components/ShortcutsHelp.tsx is the one
// place a binding exists, and this script is the subtraction.
//
// Pure logic, like check-sections.mjs and unlike check-caret.mjs: no browser,
// no server, no dependencies. It reads two files and prints a diff. The
// grammar, the scope model and the parsers live in client/keymap.ts so that
// tests/keymap.test.ts drives exactly the same code this gate does.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  RESOLVED,
  parseGroups,
  parseKeymapDoc,
  parseKeys,
  runtimesOf,
  scopeOverlap,
  shellsOf,
} from "../client/keymap.ts";

const sheetPath = new URL("../client/components/ShortcutsHelp.tsx", import.meta.url).pathname;
const docPath = new URL("../docs/keymap.md", import.meta.url).pathname;

const ROOT = new URL("..", import.meta.url).pathname;
const errs = [];

// ── The ledger ─────────────────────────────────────────────────────────────
const { rows, errors: ledgerErrors } = parseGroups(readFileSync(sheetPath, "utf8"));
errs.push(...ledgerErrors);

/** Where a row is live, in words — a collision report is unreadable without
 *  it, because "these two collide" is only true inside the overlap. */
const scopeOf = (row) => {
  const shells = shellsOf(row);
  const runtimes = runtimesOf(row);
  return `${shells.length === 2 ? "both shells" : `${shells[0]} shell`}, ${
    runtimes.length === 2 ? "both runtimes" : runtimes[0]
  }${row.admin ? ", admin" : ""}`;
};

const at = (row) => `ShortcutsHelp.tsx:${row.line}`;

/** chord id → the rows claiming it. */
const claims = new Map();
const groups = new Set();
for (const row of rows) {
  groups.add(row.group);
  if (row.keys === null && row.via === null) {
    // A row with neither renders a label and an empty key column: the sheet's
    // whole promise is "here is how you do X", and a blank answer is a lie
    // the reader can see.
    errs.push(`ROW WITH NO ANSWER  ${row.label}  ${at(row)} — neither \`keys\` nor \`via\``);
    continue;
  }
  if (row.keys === null) continue; // a surface, not a keystroke — nothing to collide
  const { chords, error } = parseKeys(row.keys);
  if (error !== null) {
    errs.push(`UNPARSEABLE KEYS  ${row.label}  ${at(row)} — [${row.keys.join(", ")}]: ${error}`);
    continue;
  }
  for (const chord of chords) {
    if (!claims.has(chord.id)) claims.set(chord.id, []);
    claims.get(chord.id).push(row);
  }
}

// ── Collisions ─────────────────────────────────────────────────────────────
// Every PAIR, not just the first duplicate: three rows on one chord are three
// distinct arguments about who wins, and reporting one of them hides two.
const declared = new Map(RESOLVED.map((r) => [`${r.chord}\u0000${[...r.rows].sort().join("\u0000")}`, r]));
const used = new Set();
let overlaps = 0;

for (const [id, claiming] of [...claims].sort((a, b) => a[0].localeCompare(b[0]))) {
  for (let i = 0; i < claiming.length; i++) {
    for (let j = i + 1; j < claiming.length; j++) {
      const a = claiming[i];
      const b = claiming[j];
      const overlap = scopeOverlap(a, b);
      if (overlap === null) continue; // disjoint scopes — the same key, never at the same time
      const token = `${id}\u0000${[a.label, b.label].sort().join("\u0000")}`;
      const resolution = declared.get(token);
      if (resolution) {
        used.add(token);
        overlaps++;
        continue;
      }
      errs.push(
        `COLLISION  ${id}  ·  overlap: ${overlap.shells.join(" + ")} shell, ${overlap.runtimes.join(" + ")}\n` +
          `  - ${a.label}  ${at(a)}  (${a.group})  ${scopeOf(a)}\n` +
          `  + ${b.label}  ${at(b)}  (${b.group})  ${scopeOf(b)}\n` +
          `  One of these two keystrokes is dead. Move one, narrow a scope, or — if the tie is\n` +
          `  genuinely broken somewhere in the code — declare it in RESOLVED (client/keymap.ts)\n` +
          `  with the rule that breaks it.`,
      );
    }
  }
}

// A declared overlap that no longer overlaps is a claim about the code that
// has stopped being true — the same reason check-i18n fails on a dead key.
for (const entry of RESOLVED) {
  const token = `${entry.chord}\u0000${[...entry.rows].sort().join("\u0000")}`;
  if (!used.has(token)) {
    errs.push(
      `DEAD RESOLUTION  ${entry.chord}  ${entry.rows.join(" ⊗ ")} — declared in RESOLVED, but these\n` +
        `  two rows no longer collide. Delete the entry: the next reader will believe it.`,
    );
  }
}

// ── The doc is a rendering, not a copy ─────────────────────────────────────
const { chords: docChords, errors: docErrors } = parseKeymapDoc(readFileSync(docPath, "utf8"));
errs.push(...docErrors);

const inDoc = new Map();
for (const entry of docChords) if (!inDoc.has(entry.chord.id)) inDoc.set(entry.chord.id, entry);

for (const [id, claiming] of [...claims].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (inDoc.has(id)) continue;
  const owners = claiming.map((r) => `${r.label} ${at(r)}`).join(", ");
  errs.push(`DOC DRIFT  - ${id}  bound by ${owners} — and absent from docs/keymap.md`);
}
for (const [id, entry] of [...inDoc].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (claims.has(id)) continue;
  errs.push(
    `DOC DRIFT  + ${id}  docs/keymap.md:${entry.line} (“${entry.cell}”) — bound by no row in GROUPS.\n` +
      `  The page renders the ledger; a key that lives only on the page is a key nobody can press.`,
  );
}

// ── Report ─────────────────────────────────────────────────────────────────
console.log(
  `keymap: ${rows.length} rows · ${groups.size} groups · ${claims.size} chords · ` +
    `${docChords.length} in docs/keymap.md · ${overlaps} declared overlap${overlaps === 1 ? "" : "s"}`,
);
// ── Every shell chord resolves by key POSITION, not by the character ──────
// `e.key` is the letter the LAYOUT produced: on an Arabic keyboard the F key
// sends "ب", so `e.key.toLowerCase() === "f"` is false and the chord is dead
// in one of the two languages this product promises. client/keys.ts
// (`shortcutKey`, `isKey`) resolves the physical key; every handler goes
// through it. Ctrl/Cmd+Shift+F was the last one that did not (3.4.2).
{
  const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      const abs = path.join(dir, name);
      if (statSync(abs).isDirectory()) walk(abs, out);
      else if (/\.tsx?$/.test(name)) out.push(abs);
    }
    return out;
  };
  const RAW = /\b(?:e|ev|event)\.key(?:\.toLowerCase\(\))?\s*===?\s*"[a-zA-Z]"/g;
  for (const file of walk(path.join(ROOT, "client"))) {
    if (file.endsWith(path.join("client", "keys.ts"))) continue;
    const src = readFileSync(file, "utf8");
    src.split("\n").forEach((line, i) => {
      if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;
      if (RAW.test(line)) errs.push(`RAW LETTER CHORD  - ${path.relative(ROOT, file)}:${i + 1}  ${line.trim().slice(0, 90)}  — use isKey()/shortcutKey() (client/keys.ts) so the chord works on an Arabic layout`);
      RAW.lastIndex = 0;
    });
  }
}

if (errs.length) {
  console.log(`FAIL: ${errs.length}\n\n${errs.join("\n\n")}`);
  process.exit(1);
}
console.log("KEYMAP OK");
