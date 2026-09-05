// Draw the folder glyph set from its catalog.
//
// Reads shared/folderIconCatalog.ts (the names, in both languages, shelved by
// subject), takes each hand-drawn glyph from shared/folderIconsHand.ts and
// each Lucide glyph from node_modules/lucide-static/icon-nodes.json, and
// writes two files:
//
//   shared/folderIconNames.ts  — the closed enum. Tiny; imported by everything
//                                that VALIDATES an icon (the server's PATCH, the
//                                store's hydration, the blog's frontmatter).
//   shared/folderIconPaths.ts  — the drawings and the search keys. Imported by
//                                the glyph renderer and the picker only, and
//                                loaded lazily, so 250 drawings never ride in
//                                the entry closure.
//
// Lucide ships circles, rects, lines and polylines beside paths; every one is
// rewritten here as a `d` string so the renderer stays the single <svg> of
// <path>s it has always been. Run `node scripts/gen-folder-icons.mjs`;
// `--check` fails when the checked-in files are stale.

import { readFileSync, writeFileSync } from "node:fs";
import { FOLDER_ICON_ENTRIES } from "../shared/folderIconCatalog.ts";
import { FOLDER_ICON_HAND_PATHS } from "../shared/folderIconsHand.ts";

const root = new URL("../", import.meta.url);
const nodes = JSON.parse(readFileSync(new URL("node_modules/lucide-static/icon-nodes.json", root), "utf8"));
const tags = JSON.parse(readFileSync(new URL("node_modules/lucide-static/tags.json", root), "utf8"));

const num = (v) => String(Number(v));

/** A `d` string re-spelled for the renderer's grid walk (tests/folderIcons.test.ts):
 *  every command explicit (an implicit repeat after `m` is a relative LINE, so
 *  `m9 11-6 6` becomes `M9 11l-6 6`), a leading relative moveto made absolute
 *  as the spec says it is, and the two arc flags Lucide packs together
 *  (`a2 2 0 00-2-2`) split back into separate numbers. */
function normalizeD(d) {
  const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/y;
  let i = 0;
  let cmd = "";
  /** What an implicit repeat means after `cmd`: a lineto of the same kind. */
  let next = "";
  let out = "";
  let first = true;
  const skip = () => {
    while (i < d.length && /[\s,]/.test(d[i])) i++;
  };
  while (i < d.length) {
    skip();
    if (i >= d.length) break;
    if (/[A-Za-z]/.test(d[i])) {
      const raw = d[i++];
      next = raw === "M" ? "L" : raw === "m" ? "l" : raw;
      cmd = first && raw === "m" ? "M" : raw;
    } else cmd = next;
    if (!cmd) throw new Error(`path does not start with a command: ${d}`);
    first = false;
    const n = ARITY[cmd.toUpperCase()];
    if (n === undefined) throw new Error(`unknown path command "${cmd}" in ${d}`);
    const args = [];
    for (let k = 0; k < n; k++) {
      skip();
      if (cmd.toUpperCase() === "A" && (k === 3 || k === 4)) {
        if (d[i] !== "0" && d[i] !== "1") throw new Error(`bad arc flag in ${d}`);
        args.push(d[i++]);
        continue;
      }
      NUM.lastIndex = i;
      const m = NUM.exec(d);
      if (!m) throw new Error(`expected a number at ${i} in ${d}`);
      args.push(String(Number(m[0])));
      i = NUM.lastIndex;
    }
    out += cmd + args.join(" ");
  }
  return out;
}

function pathOf([tag, a]) {
  switch (tag) {
    case "path":
      return normalizeD(a.d);
    case "circle": {
      const cx = Number(a.cx), cy = Number(a.cy), r = Number(a.r);
      return `M${num(cx - r)} ${num(cy)}a${r} ${r} 0 1 0 ${num(2 * r)} 0a${r} ${r} 0 1 0 ${num(-2 * r)} 0`;
    }
    case "ellipse": {
      const cx = Number(a.cx), cy = Number(a.cy), rx = Number(a.rx), ry = Number(a.ry);
      return `M${num(cx - rx)} ${num(cy)}a${rx} ${ry} 0 1 0 ${num(2 * rx)} 0a${rx} ${ry} 0 1 0 ${num(-2 * rx)} 0`;
    }
    case "rect": {
      const x = Number(a.x), y = Number(a.y), w = Number(a.width), h = Number(a.height);
      const r = Math.min(Number(a.rx ?? a.ry ?? 0), w / 2, h / 2);
      if (!r) return `M${num(x)} ${num(y)}h${num(w)}v${num(h)}h${num(-w)}z`;
      return (
        `M${num(x + r)} ${num(y)}h${num(w - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${num(h - 2 * r)}` +
        `a${r} ${r} 0 0 1 ${-r} ${r}h${num(-(w - 2 * r))}a${r} ${r} 0 0 1 ${-r} ${-r}v${num(-(h - 2 * r))}a${r} ${r} 0 0 1 ${r} ${-r}z`
      );
    }
    case "line":
      return `M${num(a.x1)} ${num(a.y1)}L${num(a.x2)} ${num(a.y2)}`;
    case "polyline":
    case "polygon": {
      const pts = String(a.points).trim().split(/[\s,]+/).map(num);
      let d = `M${pts[0]} ${pts[1]}`;
      for (let k = 2; k < pts.length; k += 2) d += `L${pts[k]} ${pts[k + 1]}`;
      return tag === "polygon" ? `${d}z` : d;
    }
    default:
      throw new Error(`unhandled svg element <${tag}>`);
  }
}

const names = [];
const paths = {};
const keys = {};
const missing = [];
for (const entry of FOLDER_ICON_ENTRIES) {
  if (names.includes(entry.name)) throw new Error(`duplicate icon name "${entry.name}"`);
  names.push(entry.name);
  if (entry.lucide) {
    const shape = nodes[entry.lucide];
    if (!shape) {
      missing.push(`${entry.name} ← ${entry.lucide}`);
      continue;
    }
    paths[entry.name] = shape.map(pathOf);
    keys[entry.name] = [...new Set([entry.lucide.replace(/-/g, " "), ...(tags[entry.lucide] ?? []), ...(entry.keys ?? "").split(/\s+/)])]
      .filter(Boolean)
      .join(" ");
  } else {
    const hand = FOLDER_ICON_HAND_PATHS[entry.name];
    if (!hand) {
      missing.push(`${entry.name} (hand-drawn, no paths)`);
      continue;
    }
    paths[entry.name] = hand;
    keys[entry.name] = (entry.keys ?? "").trim();
  }
}
if (missing.length) {
  console.error(`gen-folder-icons: ${missing.length} icon(s) have no drawing:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

const head = "// GENERATED by scripts/gen-folder-icons.mjs from shared/folderIconCatalog.ts — do not edit.\n";
const namesSrc =
  head +
  "\n/** The closed folder glyph set, in picker order. */\nexport const FOLDER_ICON_NAMES = [\n" +
  names.map((n) => `  ${JSON.stringify(n)},`).join("\n") +
  "\n] as const;\n";
const pathsSrc =
  head +
  "\n/** SVG `d` strings per glyph on a 0 0 24 24 grid: stroke 1.7, fill none, currentColor, round caps. */\n" +
  "export const FOLDER_ICON_PATHS: Record<string, readonly string[]> = {\n" +
  names.map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(paths[n])},`).join("\n") +
  "\n};\n\n/** Search words per glyph (English), beyond its two names. */\nexport const FOLDER_ICON_KEYS: Record<string, string> = {\n" +
  names.map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(keys[n])},`).join("\n") +
  "\n};\n";

const targets = [
  ["shared/folderIconNames.ts", namesSrc],
  ["shared/folderIconPaths.ts", pathsSrc],
];
if (process.argv.includes("--check")) {
  let stale = false;
  for (const [file, src] of targets) {
    let cur = "";
    try {
      cur = readFileSync(new URL(file, root), "utf8");
    } catch {}
    if (cur !== src) {
      stale = true;
      console.error(`gen-folder-icons: ${file} is stale — run node scripts/gen-folder-icons.mjs`);
    }
  }
  process.exit(stale ? 1 : 0);
}
for (const [file, src] of targets) writeFileSync(new URL(file, root), src);
console.log(`gen-folder-icons: ${names.length} glyphs (${Object.keys(FOLDER_ICON_HAND_PATHS).length} hand-drawn)`);
