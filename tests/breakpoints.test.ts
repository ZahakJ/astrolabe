import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

// BREAKPOINT PARITY — "a phone" is one width everywhere.
//
// The shell decides phone-or-desktop with PHONE_SHELL_QUERY (client/
// shellQuery.ts): ≤700px, or a coarse pointer that cannot hover. Stylesheets
// that restyle something "for phones" used to pick their own width — 720 in
// settings, attachments and presets, 760 in the composer, 640 in the
// hovercard, the theme picker and the palette — so a 701–760px window was a
// phone to one sheet and a desktop to the next. This test holds every
// stylesheet under client/ (and the Android shell's own) to the shell's
// width: a `max-width` in the phone band (601–799px) is 700, unless the
// three lines above it say why not with the words "not the shell's 700"
// (the public blog's 640 does, for its own grids). And no source file
// re-spells a phone-band query in a string: it imports the constant.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHELL_WIDTH = 700;
const BAND = { lo: 601, hi: 799 };
const REASON = "not the shell's 700";

function walk(dir: string, keep: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, keep));
    else if (keep(name)) out.push(p);
  }
  return out;
}

const stylesheets = [
  ...walk(path.join(root, "client"), (n) => n.endsWith(".css")),
  ...walk(path.join(root, "mobile/src"), (n) => n.endsWith(".css")),
];
const sources = [
  ...walk(path.join(root, "client"), (n) => /\.tsx?$/.test(n)),
  ...walk(path.join(root, "shared"), (n) => /\.tsx?$/.test(n)),
  ...walk(path.join(root, "mobile/src"), (n) => /\.tsx?$/.test(n)),
];

/** Every `max-width: Npx` inside an `@media` condition, with its line. */
export function phoneBandWidths(css: string): { line: number; px: number; justified: boolean }[] {
  const lines = css.split("\n");
  const out: { line: number; px: number; justified: boolean }[] = [];
  const re = /@media\s+([^{]+)\{/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    const line = css.slice(0, m.index).split("\n").length;
    for (const w of m[1].matchAll(/max-width:\s*(\d+)px/g)) {
      const px = Number(w[1]);
      if (px < BAND.lo || px > BAND.hi) continue;
      const above = lines.slice(Math.max(0, line - 4), line - 1).join("\n");
      out.push({ line, px, justified: above.includes(REASON) });
    }
  }
  return out;
}

describe("breakpoint parity", () => {
  it("the shell's width is the constant this test enforces", () => {
    const q = readFileSync(path.join(root, "client/shellQuery.ts"), "utf8");
    assert.match(q, new RegExp(`PHONE_SHELL_QUERY = "\\(max-width: ${SHELL_WIDTH}px\\)`));
  });

  it("scans a real set of stylesheets", () => {
    assert.ok(stylesheets.length > 40, `only ${stylesheets.length} stylesheets found`);
    assert.ok(stylesheets.some((f) => f.endsWith("client/phone/phone.css")));
    assert.ok(stylesheets.some((f) => f.endsWith("client/reading/query.css")));
  });

  it("every phone-band max-width in every stylesheet is the shell's 700, or says why not", () => {
    const drift: string[] = [];
    for (const file of stylesheets) {
      for (const { line, px, justified } of phoneBandWidths(readFileSync(file, "utf8"))) {
        if (px !== SHELL_WIDTH && !justified) drift.push(`${path.relative(root, file)}:${line} max-width: ${px}px`);
      }
    }
    assert.deepEqual(drift, [], `a stylesheet calls a different width "phone":\n  ${drift.join("\n  ")}`);
  });

  it("a justified exception is rare, and the reason is written next to it", () => {
    const justified: string[] = [];
    for (const file of stylesheets) {
      for (const w of phoneBandWidths(readFileSync(file, "utf8"))) {
        if (w.px !== SHELL_WIDTH) justified.push(path.relative(root, file));
      }
    }
    // Only the public blog's own layout grids today. A new file here is a
    // decision worth a second look, not a mechanical addition.
    assert.deepEqual([...new Set(justified)], ["client/styles/blog.css"]);
  });

  it("the detector catches the widths that drifted before, and honours a reason", () => {
    assert.deepEqual(
      phoneBandWidths("@media (max-width: 720px) {\n}\n@media (max-width: 760px), (pointer: coarse) {\n}").map((w) => [w.px, w.justified]),
      [[720, false], [760, false]],
    );
    assert.deepEqual(
      phoneBandWidths(`/* ${REASON}: a grid */\n@media (max-width: 640px) {\n}`).map((w) => w.justified),
      [true],
    );
    // Outside the band: a 560 stack, a 900 desk, a 1100 composer — not phones.
    assert.deepEqual(phoneBandWidths("@media (max-width: 560px) {}\n@media (max-width: 900px) {}"), []);
  });

  it("no source file re-spells a phone-band query; it imports PHONE_SHELL_QUERY", () => {
    const copies: string[] = [];
    for (const file of sources) {
      if (file.endsWith("client/shellQuery.ts")) continue;
      readFileSync(file, "utf8").split("\n").forEach((text, i) => {
        const code = text.replace(/\/\/.*$/, "");
        if (/^\s*\*/.test(code)) return; // a doc comment's body
        for (const m of code.matchAll(/["'`][^"'`]*\(max-width:\s*(\d+)px\)/g)) {
          const px = Number(m[1]);
          if (px >= BAND.lo && px <= BAND.hi) copies.push(`${path.relative(root, file)}:${i + 1} ${text.trim()}`);
        }
        if (/["'`]\(pointer: coarse\) and \(hover: none\)/.test(code)) copies.push(`${path.relative(root, file)}:${i + 1} ${text.trim()}`);
      });
    }
    assert.deepEqual(copies, [], `use PHONE_SHELL_QUERY from client/shellQuery.ts:\n  ${copies.join("\n  ")}`);
  });
});
