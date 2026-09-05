// The folder glyph set (shared/folderIcons.ts).
//
// A pure module with a pure test: no vault, no server, no DOM. What it guards
// is the one failure mode a closed icon vocabulary has — the enum and the
// drawing table falling out of step. Add a name to `FolderIcon` and forget the
// paths and the picker shows a blank cell; add paths under a name the union
// does not have and the glyph is unreachable from every UI in the product.
// Neither shows up in a typecheck of the DRAWINGS, because a path table keyed
// by the union is satisfied by a table that also has extra keys.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cleanFolderIcons,
  FOLDER_ICONS,
  FOLDER_ICONS_MAX,
  folderIconKey,
  isFolderIcon,
} from "../shared/folderIcons.ts";
import { FOLDER_ICON_ENTRIES, FOLDER_ICON_GROUPS } from "../shared/folderIconCatalog.ts";
import { FOLDER_ICON_HAND_PATHS } from "../shared/folderIconsHand.ts";
import { FOLDER_ICON_KEYS, FOLDER_ICON_PATHS } from "../shared/folderIconPaths.ts";

/** Every point a `d` string actually lands on, absolute. Enough SVG path
 *  grammar to walk these twenty glyphs and no more: the commands they use,
 *  each one's argument arity, and the rule that a repeated argument group
 *  repeats the command (an implicit `L` after an `M`). Curve CONTROL points
 *  are walked too — a control point outside the box drags the curve out with
 *  it, which is the whole thing being checked. */
function vertices(d: string): [number, number][] {
  const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+/g) ?? [];
  const out: [number, number][] = [];
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let cmd = "M";
  let i = 0;
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    const n = ARITY[up];
    if (n === undefined) throw new Error(`unknown path command "${cmd}" in ${d}`);
    const args = tokens.slice(i, i + n).map(Number);
    i += n;
    if (up === "Z") {
      x = startX;
      y = startY;
    } else if (up === "H") {
      x = rel ? x + args[0] : args[0];
    } else if (up === "V") {
      y = rel ? y + args[0] : args[0];
    } else if (up === "A") {
      // rx ry rot large sweep dx dy — only the endpoint is a position. The
      // radii are bounded by the endpoint distance, so an arc cannot bulge
      // meaningfully past a box both of its ends sit inside.
      x = rel ? x + args[5] : args[5];
      y = rel ? y + args[6] : args[6];
    } else {
      // M/L/T take one point; C/S/Q take control points then the endpoint.
      for (let k = 0; k + 1 < n; k += 2) {
        const px = rel ? x + args[k] : args[k];
        const py = rel ? y + args[k + 1] : args[k + 1];
        if (k + 2 >= n) {
          x = px;
          y = py;
        } else {
          out.push([px, py]);
        }
      }
    }
    out.push([x, y]);
    if (up === "M") {
      startX = x;
      startY = y;
      // A repeated argument group after M is an implicit lineto.
      cmd = rel ? "l" : "L";
    }
  }
  return out;
}

describe("the folder glyph set", () => {
  it("lists a few hundred glyphs, the twenty originals first, with no duplicates", () => {
    assert.ok(FOLDER_ICONS.length >= 250, `only ${FOLDER_ICONS.length} glyphs`);
    assert.equal(new Set(FOLDER_ICONS).size, FOLDER_ICONS.length);
    // The originals keep their names: a 2.6 settings.json must still draw.
    for (const original of Object.keys(FOLDER_ICON_HAND_PATHS)) {
      assert.ok(isFolderIcon(original), `${original} left the set`);
      assert.deepEqual(FOLDER_ICON_PATHS[original], FOLDER_ICON_HAND_PATHS[original]);
    }
    assert.equal(Object.keys(FOLDER_ICON_HAND_PATHS).length, 20);
  });

  it("is generated from the catalog, and the catalog names every glyph in both languages", () => {
    assert.deepEqual(
      [...FOLDER_ICONS],
      FOLDER_ICON_ENTRIES.map((e) => e.name),
    );
    for (const entry of FOLDER_ICON_ENTRIES) {
      assert.match(entry.name, /^[a-z][a-z0-9-]*$/, `${entry.name} is not a kebab name`);
      assert.ok(entry.en.trim().length > 0, `${entry.name} has no English name`);
      assert.match(entry.ar, /[\u0600-\u06FF]/, `${entry.name} has no Arabic name`);
      assert.equal(typeof FOLDER_ICON_KEYS[entry.name], "string");
    }
    assert.equal(FOLDER_ICON_GROUPS.length, 9);
  });

  it("keeps the enum and the path table in step, both directions", () => {
    assert.deepEqual([...FOLDER_ICONS].sort(), Object.keys(FOLDER_ICON_PATHS).sort());
  });

  it("gives every glyph at least one path, and every path real data", () => {
    for (const icon of FOLDER_ICONS) {
      const paths = FOLDER_ICON_PATHS[icon];
      assert.ok(Array.isArray(paths) && paths.length > 0, `${icon} has no paths`);
      for (const d of paths) {
        assert.ok(typeof d === "string" && d.length > 0, `${icon} has an empty path`);
        // Every `d` starts with an absolute moveto. A path that opens with a
        // relative command is positioned by whatever the renderer's current
        // point happens to be, which for a fresh <path> is the origin — it
        // draws, it just draws in the wrong corner.
        assert.match(d, /^M/, `${icon} path does not start with an absolute moveto: ${d}`);
        // Nothing but path grammar: numbers, commands, separators. This is the
        // one place a stray letter (a copy-pasted `stroke="…"`, an `NaN` from a
        // generator) would otherwise reach an <svg> unnoticed.
        assert.match(d, /^[MmLlHhVvCcSsQqTtAaZz0-9,.\s-]+$/, `${icon} path has stray characters: ${d}`);
      }
    }
  });

  it("draws inside the 24×24 grid it declares", () => {
    // Coordinates are not clamped anywhere, so a glyph that strays outside the
    // viewBox is simply CROPPED — and at 14px a cropped stroke reads as a
    // different drawing rather than as a bug. Checked over the VERTEX walk,
    // not over the raw numbers: half these commands are relative, and `-3.8`
    // inside `a3.8 3.8 0 0 1 3.8-3.8` is a delta, not a position.
    for (const icon of FOLDER_ICONS) {
      for (const d of FOLDER_ICON_PATHS[icon]) {
        for (const [x, y] of vertices(d)) {
          const inside = x >= -0.5 && x <= 24.5 && y >= -0.5 && y <= 24.5;
          assert.ok(inside, `${icon} leaves the grid at ${x},${y} in ${d}`);
        }
      }
    }
  });

  it("…and the walk that checks that is not vacuous", () => {
    // A gate nobody has watched FAIL is a gate nobody has. Absolute and
    // relative forms of the same square, then one that walks off the grid.
    assert.deepEqual(vertices("M2 2h20v20H2z"), [
      [2, 2],
      [22, 2],
      [22, 22],
      [2, 22],
      [2, 2],
    ]);
    assert.deepEqual(vertices("M2 2 6 4c1 1 2 2 3 3"), [
      [2, 2],
      [6, 4],
      [7, 5],
      [8, 6],
      [9, 7],
    ]);
    assert.ok(
      vertices("M2 2a3 3 0 0 1 26-1").some(([x]) => x > 24.5),
      "a path that leaves the box was walked as if it stayed inside",
    );
  });

  it("recognizes its own members and nothing else", () => {
    for (const icon of FOLDER_ICONS) assert.equal(isFolderIcon(icon), true, icon);
    for (const other of ["", "bookshelf", "Book", "toString", "__proto__", 3, null, undefined, {}]) {
      assert.equal(isFolderIcon(other), false, String(other));
    }
  });
});

describe("folderIconKey", () => {
  it("normalizes a key to the path the tree uses", () => {
    assert.equal(folderIconKey(" notes/games/ "), "notes/games");
    assert.equal(folderIconKey("Reading"), "Reading");
  });

  it("refuses anything that cannot be a vault-relative folder", () => {
    // `/Reading` and `C:/vault` are REFUSED, not rewritten: a key silently
    // turned into a different folder from the one it names is the bug
    // vaultRel()'s comment was written about.
    for (const bad of [
      "",
      "   ",
      "/Reading",
      "..",
      "a/../b",
      "a//b",
      "./a",
      "C:/vault",
      "notes\\games",
      7,
      null,
      undefined,
    ]) {
      assert.equal(folderIconKey(bad), null, JSON.stringify(bad));
    }
  });
});

describe("cleanFolderIcons", () => {
  it("keeps the readable rows and drops the rest in silence", () => {
    assert.deepEqual(
      cleanFolderIcons({
        Reading: "book",
        Games: "bookshelf", // a glyph this build cannot draw
        "../escape": "leaf", // a key that cannot be a folder
        "Films/": "film", // a key that only needs tidying
        Broken: 42,
      }),
      { Reading: "book", "Films": "film" },
    );
  });

  it("is total over garbage — it never throws", () => {
    for (const bad of [null, undefined, 7, "book", [], [["a", "book"]]]) {
      assert.deepEqual(cleanFolderIcons(bad), {});
    }
  });

  it("stops at the cap rather than letting a hand-edited file grow forever", () => {
    const big: Record<string, string> = {};
    for (let i = 0; i < FOLDER_ICONS_MAX + 50; i++) big[`f${i}`] = "star";
    assert.equal(Object.keys(cleanFolderIcons(big)).length, FOLDER_ICONS_MAX);
  });

  it("cannot be used to reach Object.prototype", () => {
    // The keys are vault paths from a JSON file, so `__proto__` arrives as an
    // OWN property and `out[key] = …` on a plain object would invoke the
    // setter instead of defining anything.
    const cleaned = cleanFolderIcons(JSON.parse('{"__proto__": "book", "Reading": "leaf"}'));
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
    assert.equal(Object.getPrototypeOf({}), Object.prototype);
    assert.equal(cleaned.Reading, "leaf");
  });
});
