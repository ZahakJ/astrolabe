import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

// ONE PHONE QUESTION, ASKED ONCE (3.27.0).
//
// This file held the drawer breakpoint to one string across client/state.ts
// and every stylesheet — it drifted twice, once in spirit (the stylesheet said
// "phone or no fine pointer", the store "under 1000px") and once for real
// (tokens.css kept `not (any-pointer: fine)` after app.css moved to the
// primary pointer). The drawer is gone now: the Classic phone layout was
// deleted, the desktop shell is never mounted where PHONE_SHELL_QUERY
// matches, and DRAWER_QUERY and PHONE_QUERY went with the overlay they
// decided. What stays true, and is held here: the phone question is ONE
// constant (client/shellQuery.ts), nothing re-spells it in code, no
// stylesheet carries the drawer's 999px band or asks `any-pointer`, and the
// drawer's chrome left no rule behind.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shellQuery = readFileSync(path.join(root, "client/shellQuery.ts"), "utf8");
const state = readFileSync(path.join(root, "client/state.ts"), "utf8");

const stylesDir = path.join(root, "client/styles");
const sheets = [
  ...readdirSync(stylesDir)
    .filter((f) => f.endsWith(".css"))
    .map((f) => ({ file: `client/styles/${f}`, css: readFileSync(path.join(stylesDir, f), "utf8") })),
  { file: "client/phone/phone.css", css: readFileSync(path.join(root, "client/phone/phone.css"), "utf8") },
];

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

describe("the phone question", () => {
  it("is one constant, decided by the primary pointer", () => {
    const q = /export const PHONE_SHELL_QUERY = "([^"]+)";/.exec(shellQuery)?.[1];
    assert.ok(q, "PHONE_SHELL_QUERY not found");
    // THE PRIMARY POINTER, NOT `any-pointer` (3.23.0): `any-pointer: fine` is
    // true on every phone that has met a stylus or a bluetooth mouse.
    assert.ok(q.includes("(pointer: coarse) and (hover: none)"));
    assert.ok(!q.includes("any-pointer"));
    assert.ok(!/export const (DRAWER|PHONE)_QUERY/.test(state), "the drawer's two queries went with the drawer");
  });

  it("no stylesheet carries the drawer's 999px band, and none asks any-pointer", () => {
    const drift: string[] = [];
    for (const { file, css } of sheets) {
      for (const { line, cond } of mediaOf(css)) {
        if (/999px/.test(cond) || cond.includes("any-pointer")) drift.push(`${file}:${line} @media ${cond}`);
      }
    }
    assert.deepEqual(drift, [], `a stylesheet still asks the drawer's question:\n  ${drift.join("\n  ")}`);
  });

  it("the drawer's chrome left no rule and no element behind", () => {
    const chrome = /\.s-drawer-btn|\.s-drawer-backdrop|\.s-app--drawer|__phoneclose|\.s-panel__scrim|--z-drawer/;
    const left = sheets.filter(({ css }) => chrome.test(css)).map(({ file }) => file);
    assert.deepEqual(left, [], `drawer chrome still styled in:\n  ${left.join("\n  ")}`);
    const code = sources(path.join(root, "client"))
      .filter((f) => /s-drawer-btn|s-drawer-backdrop|s-app--drawer|__phoneclose|sidebarOpen|sidebarIsDrawer/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(root, f));
    assert.deepEqual(code, [], `drawer chrome still drawn or read in:\n  ${code.join("\n  ")}`);
  });

  // The TypeScript copies: `(max-width: 700px)` was once spelled out in five
  // files. A NAMED, EXPORTED query is the cure; a string literal is a copy.
  it("is imported, never re-spelled, by the client's code", () => {
    const copies: string[] = [];
    for (const file of sources(path.join(root, "client"))) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((text, i) => {
        const code = text.replace(/\/\/.*$/, "");
        if (/^\s*\*/.test(code)) return; // a doc comment's body
        if (/^\s*export const [A-Z_]+_QUERY = /.test(code)) return;
        if (/["'`]\(max-width: (640|700|999)px\)/.test(code) || /any-pointer/.test(code)) {
          copies.push(`${path.relative(root, file)}:${i + 1} ${text.trim()}`);
        }
      });
    }
    assert.deepEqual(copies, [], `use PHONE_SHELL_QUERY from client/shellQuery.ts:\n  ${copies.join("\n  ")}`);
  });
});
