// THE SEAM BETWEEN THE TWO SHELLS, as a rule a machine checks.
//
// The phone shell (client/phone/) and the desktop shell (client/App.tsx and
// client/components/) share the store, the API, the dictionary and every
// content surface — and must share NOTHING of each other's chrome, or the two
// drift back into the one retrofitted shell the phone shell replaced (the
// audit counted 97 phone @media blocks and 2,245 lines of override CSS in
// app.css). Four rules:
//
//   1. client/phone/ never imports app.css — the phone's look is phone.css.
//   2. client/components/ never imports from client/phone/ — the desktop's
//      parts do not lean on the phone's.
//   3. client/phone/ never imports the desktop's chrome: the tab strip, the
//      pane grid, the grips, the status bar, the sidebar.
//   4. client/phone/phone.css asks no width question: no `@media` on
//      min-width / max-width. Being mounted is the condition.
//
// Used by scripts/check-shell-seam.mjs (the gate) and tests/shellSeam.test.ts.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const DESKTOP_CHROME = /(^|\/)(Tabs|Workspace|PaneGrip|StatusBar|Sidebar|PaneDropZones)\.tsx$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Every import specifier in a module's text (static, dynamic, side-effect). */
export function importsOf(text) {
  const out = [];
  const re = /\bimport\s*(?:[^"'`;]*?\sfrom\s*)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1] ?? m[2]);
  return out;
}

/** Width questions in a stylesheet: `@media (max-width…)`, `(min-width…)`,
 *  and the range syntax (`width <= 700px`). */
export function widthQueries(css) {
  const out = [];
  for (const m of css.matchAll(/@media[^{]*/g)) {
    if (/\b(min|max)-width\b|\bwidth\s*[<>]=?/.test(m[0])) out.push(m[0].trim());
  }
  return out;
}

/** All violations under `root` (the repository). Empty when the seam holds. */
export function seamViolations(root) {
  const client = join(root, "client");
  const errs = [];
  const phoneDir = join(client, "phone");
  const compDir = join(client, "components");
  for (const f of walk(phoneDir)) {
    const rel = relative(root, f);
    if (/\.tsx?$/.test(f)) {
      for (const spec of importsOf(readFileSync(f, "utf8"))) {
        if (/(^|\/)app\.css$/.test(spec)) errs.push(`${rel}: imports app.css (${spec})`);
        if (DESKTOP_CHROME.test(spec)) errs.push(`${rel}: imports the desktop's chrome (${spec})`);
      }
    }
    if (f.endsWith(".css")) {
      const css = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const q of widthQueries(css)) errs.push(`${rel}: asks a width question (${q})`);
      if (/@import\s+["'][^"']*app\.css/.test(css)) errs.push(`${rel}: @imports app.css`);
    }
  }
  for (const f of walk(compDir)) {
    if (!/\.tsx?$/.test(f)) continue;
    for (const spec of importsOf(readFileSync(f, "utf8"))) {
      if (/(^|\/)phone\//.test(spec)) errs.push(`${relative(root, f)}: imports from client/phone/ (${spec})`);
    }
  }
  return errs;
}
