// A MIRRORED GLYPH IS MIRRORED ONCE — by hand, never by the font's luck.
//
// ‹ › « » are Bidi_Mirrored, and whether Chromium draws one mirrored in a
// right-to-left line depends on the font the glyph comes from: isolated in a
// default sans it is mirrored; in the app's Arabic stack (Noto Sans Arabic
// first) it is not. A chevron that relies on the browser points the right
// way on one machine and backwards on the next, and a hand flip on top of a
// mirror that sometimes happens is the same bug inverted (the Orbits
// breadcrumb pointed backwards in Arabic at 3.23). So every element whose
// whole text is one such glyph is pinned `direction: ltr` (never mirrored)
// and, if it flips, flips by hand under `[dir="rtl"]`.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIRRORED = /^[‹›«»]$/;

function walk(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (ext.test(name)) out.push(p);
  }
  return out;
}

/** Classes of elements whose whole text is one mirrored glyph. */
function mirroredGlyphClasses(): Set<string> {
  const out = new Set<string>();
  for (const f of walk(path.join(root, "client"), /\.tsx$/)) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/className="([^"]+)"[^>]*>\s*([^<\s])\s*</g)) {
      if (MIRRORED.test(m[2])) for (const c of m[1].split(/\s+/)) out.add(c);
    }
  }
  return out;
}

/** Every rule in every client stylesheet, as { selectors, body }. */
function rules(): { file: string; selectors: string[]; body: string }[] {
  const out: { file: string; selectors: string[]; body: string }[] = [];
  for (const f of walk(path.join(root, "client"), /\.css$/)) {
    const css = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      out.push({ file: path.relative(root, f), selectors: m[1].split(",").map((s) => s.trim()), body: m[2] });
    }
  }
  return out;
}

describe("RTL: a Bidi_Mirrored glyph is mirrored once, by hand", () => {
  const classes = mirroredGlyphClasses();
  const all = rules();
  const pinned = (cls: string): boolean =>
    all.some((r) => r.selectors.some((s) => new RegExp(`^\\.${cls}$`).test(s)) && /direction:\s*ltr/.test(r.body));

  it("finds the chevrons it guards", () => {
    for (const c of ["s-session__chev", "s-cal__chev", "s-calpage__chev", "s-propshelf__chev"]) assert.ok(classes.has(c), c);
  });

  it("every class a stylesheet flips under RTL is pinned left-to-right first", () => {
    const loose: string[] = [];
    for (const r of all) {
      if (!/scaleX\(\s*-1\s*\)/.test(r.body)) continue;
      for (const sel of r.selectors) {
        if (!/\[dir="?rtl"?\]|:dir\(rtl\)/.test(sel)) continue;
        const last = [...sel.matchAll(/\.([\w-]+)/g)].map((x) => x[1]).pop();
        if (last && classes.has(last) && !pinned(last)) loose.push(`${r.file}: ${sel}`);
      }
    }
    assert.deepEqual(loose, [], "pin it (`direction: ltr; unicode-bidi: isolate`) so the font cannot mirror it a second time");
  });

  it("the chevrons that point along a line are pinned and flipped", () => {
    for (const c of ["s-session__chev", "s-cal__chev", "s-calpage__chev", "s-propshelf__chev"]) {
      assert.ok(pinned(c), `${c} is not pinned left-to-right`);
      assert.ok(
        all.some((r) => r.selectors.some((s) => s === `[dir="rtl"] .${c}`) && /scaleX\(\s*-1\s*\)/.test(r.body)),
        `${c} is not flipped under RTL`,
      );
    }
  });
});
