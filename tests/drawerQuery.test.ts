import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

// The drawer breakpoint lives in two places that cannot import each other:
// client/state.ts (matchMedia) and the stylesheets (@media). They drifted once
// in spirit — the stylesheet said "phone or no fine pointer", the store said
// "under 1000px" — and the shell would have opened the drawer for a sidebar
// the grid still held. They drifted AGAIN in 3.23.0: app.css moved to the
// primary pointer and tokens.css kept `not (any-pointer: fine)`, so on a
// 701–999px stylus phone the menus raised from the drawer painted under it —
// because this test only ever read app.css. It reads every stylesheet now,
// and every client source for a private copy of either query.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const state = readFileSync(path.join(root, "client/state.ts"), "utf8");
const drawer = /export const DRAWER_QUERY = "([^"]+)";/.exec(state);
const phone = /export const PHONE_QUERY = "([^"]+)";/.exec(state);

const stylesDir = path.join(root, "client/styles");
const sheets = readdirSync(stylesDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => ({ file: `client/styles/${f}`, css: readFileSync(path.join(stylesDir, f), "utf8") }));

/** Every `@media` condition in a sheet, with its line. */
function mediaOf(css: string): { line: number; cond: string }[] {
  const out: { line: number; cond: string }[] = [];
  const re = /@media\s+([^{]+)\{/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    out.push({ line: css.slice(0, m.index).split("\n").length, cond: m[1].trim().replace(/\s+/g, " ") });
  }
  return out;
}

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("the drawer breakpoint", () => {
  it("is one string, decided by the primary pointer", () => {
    assert.ok(drawer, "DRAWER_QUERY not found");
    const q = drawer![1];
    // THE PRIMARY POINTER, NOT `any-pointer` (3.23.0). `any-pointer: fine` is
    // true on every phone that has ever met a stylus or a bluetooth mouse, and
    // it handed a 720px Galaxy the docked desktop shell. The pair below asks
    // what the device's own input IS: a finger, and one that cannot hover — so
    // a touch laptop (coarse primary, `hover: hover` from the mouse beside it)
    // still keeps its docked, resizable panes, which is what defect F bought.
    assert.ok(
      q.includes("(pointer: coarse) and (hover: none)"),
      "the drawer band must be decided by the PRIMARY pointer",
    );
    assert.ok(!q.includes("any-pointer"), "a stylus is an any-pointer: fine, and a stylus is not a mouse");
    assert.ok(phone, "PHONE_QUERY not found");
    assert.ok(q.startsWith(`${phone![1]}, `), "PHONE_QUERY is DRAWER_QUERY's first arm");
  });

  it("is mirrored by app.css in exactly six blocks", () => {
    const css = sheets.find((s) => s.file.endsWith("/app.css"))!.css;
    assert.equal(css.split(`@media ${drawer![1]} {`).length - 1, 6, "app.css should carry the drawer query in exactly six blocks");
  });

  // Every stylesheet, not just app.css: tokens.css (the menu rungs over the
  // drawer) and swipe.css (the pan) both answer to the drawer and both had
  // their own copy. The 999px band exists ONLY as the drawer's second arm, so
  // any condition that names it and is not the query, character for
  // character, is a copy that has drifted — as is any `any-pointer`.
  it("is the only 999px band, and no stylesheet asks any-pointer", () => {
    const drift: string[] = [];
    for (const { file, css } of sheets) {
      for (const { line, cond } of mediaOf(css)) {
        if (cond.includes("999px") && cond !== drawer![1]) drift.push(`${file}:${line} @media ${cond}`);
        if (cond.includes("any-pointer")) drift.push(`${file}:${line} @media ${cond}`);
      }
    }
    assert.deepEqual(drift, [], `a stylesheet carries its own drawer query:\n  ${drift.join("\n  ")}`);
  });

  // The TypeScript copies: `(max-width: 700px)` spelled out in backGesture,
  // StatusBar, PaneGrip and BacklinksPanel, and a 640 in CommandPalette that
  // meant the same thing. One constant each, imported from client/state.ts.
  it("is imported, never re-spelled, by the client's code", () => {
    const copies: string[] = [];
    for (const file of sources(path.join(root, "client"))) {
      if (file.endsWith(`${path.sep}state.ts`) && path.dirname(file) === path.join(root, "client")) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((text, i) => {
        const code = text.replace(/\/\/.*$/, "");
        if (/^\s*\*/.test(code)) return; // a doc comment's body
        // A NAMED, EXPORTED query is the cure, not the disease: the phone
        // shell's own mount condition (client/shellQuery.ts, 3.26.0) is a
        // different question from the drawer's and lives in one constant.
        if (/^\s*export const [A-Z_]+_QUERY = /.test(code)) return;
        if (/["'`]\(max-width: (640|700|999)px\)/.test(code) || /any-pointer/.test(code)) {
          copies.push(`${path.relative(root, file)}:${i + 1} ${text.trim()}`);
        }
      });
    }
    assert.deepEqual(copies, [], `use DRAWER_QUERY / PHONE_QUERY from client/state.ts:\n  ${copies.join("\n  ")}`);
  });
});
