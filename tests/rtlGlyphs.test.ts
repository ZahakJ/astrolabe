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
    // A literal class list or a template literal (`s-tree__chevron${open ? …}`);
    // the attributes may hold arrow functions, so `=>` does not end the tag.
    for (const m of src.matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\})(?:[^>]|=>)*>\s*([^<\s])\s*<\//g)) {
      if (!MIRRORED.test(m[3])) continue;
      for (const c of (m[1] ?? m[2]).matchAll(/(?<![\w-])s-[\w-]+/g)) out.add(c[0]);
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

  // Every lone mirrored glyph the sweep and its leftovers pinned: the Orbits
  // session's crumbs, both calendars' prev/next, the properties shelf, the
  // sidebar tree (and every panel toggle that borrows its chevron), the tag
  // tree's branches, and the three breadcrumb separators.
  const GUARDED = [
    "s-session__chev",
    "s-cal__chev",
    "s-calpage__chev",
    "s-propshelf__chev",
    "s-tree__chevron",
    "s-tag__branch",
    "s-statusbar__crumb-sep",
    "s-lib-crumbs__sep",
    "s-dsgr__crumbsep",
  ];
  // Left to the browser, knowingly: the selection menu's submenu chevron lives
  // in a file another change owns at the time of writing; the next pass pins it.
  const UNGUARDED = new Set(["s-selmenu__chev"]);

  it("finds the chevrons it guards", () => {
    for (const c of GUARDED) assert.ok(classes.has(c), c);
  });

  it("every lone mirrored glyph is guarded (or knowingly left)", () => {
    const base = [...classes].filter((c) => !/--/.test(c) && !/^s-session__crumbsep$/.test(c));
    const stray = base.filter((c) => !GUARDED.includes(c) && !UNGUARDED.has(c));
    assert.deepEqual(stray, [], "pin it left-to-right and flip it by hand under RTL, then add it to GUARDED");
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
    for (const c of GUARDED) {
      assert.ok(pinned(c), `${c} is not pinned left-to-right`);
      assert.ok(
        all.some((r) => r.selectors.some((s) => s === `[dir="rtl"] .${c}`) && /scaleX\(\s*-1\s*\)/.test(r.body)),
        `${c} is not flipped under RTL`,
      );
    }
  });

  it("an open disclosure chevron turns down in both directions", () => {
    for (const c of ["s-tree__chevron--open", "s-tag__branch--open"]) {
      for (const sel of [`.${c}`, `[dir="rtl"] .${c}`]) {
        assert.ok(
          all.some((r) => r.selectors.includes(sel) && /rotate\(\s*90deg\s*\)/.test(r.body)),
          `${sel} does not turn a quarter down`,
        );
      }
    }
  });
});
