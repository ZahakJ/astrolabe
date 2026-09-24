// GLYPHS NO, PATHS YES — a mirrored character is never flipped by hand.
//
// ‹ › « » are Bidi_Mirrored: in a right-to-left line the browser draws each
// as its mirror image, so a breadcrumb or a "previous" chevron already points
// the way Arabic reads. Three rules once added `transform: scaleX(-1)` under
// `[dir="rtl"]` to such glyphs (the Orbits breadcrumb, the sidebar month, the
// Calendar page) and turned them back around. An SVG arrow or ← / → (not
// mirrored) DOES need the flip; this test only forbids it on the glyphs the
// browser already mirrors.

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

describe("RTL: mirrored glyphs are not flipped by hand", () => {
  it("finds the chevrons it guards", () => {
    const classes = mirroredGlyphClasses();
    for (const c of ["s-session__chev", "s-cal__chev", "s-calpage__chev"]) assert.ok(classes.has(c), c);
  });

  it("no [dir=rtl] rule transforms a class that only ever holds ‹ › « »", () => {
    const classes = mirroredGlyphClasses();
    const flips: string[] = [];
    for (const f of walk(path.join(root, "client"), /\.css$/)) {
      const css = readFileSync(f, "utf8");
      for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        if (!/scaleX\(\s*-1\s*\)|rotate\(\s*180deg\s*\)/.test(m[2])) continue;
        for (const sel of m[1].split(",")) {
          if (!/\[dir="?rtl"?\]|:dir\(rtl\)/.test(sel)) continue;
          const cls = [...sel.matchAll(/\.([\w-]+)/g)].map((x) => x[1]);
          const last = cls[cls.length - 1];
          if (last && classes.has(last)) flips.push(`${path.relative(root, f)}: ${sel.trim()}`);
        }
      }
    }
    assert.deepEqual(flips, [], "a Bidi_Mirrored glyph is already mirrored under RTL");
  });
});
