// GATE: a phone rule is never silently undone by a later global one.
//
//   npm run check-cascade   ·   node scripts/check-cascade.mjs [--list]
//
// WHY THIS EXISTS. The phone and the touch shell are written as `@media`
// blocks over the desktop's rules, and a block only wins if it comes AFTER
// what it overrides. Five times now a phone rule has been dead on arrival
// because a rule for the same selector and property sat later in the cascade
// with no condition at all: What's-new's position count (`display: inline`
// for a phone, then `display: none` for everyone eighteen lines further down),
// the library-roots editor's wrapping, three settings declarations (app.css
// states them, settings.css loads later and restates the desktop values), and
// the tag shelf's sort button. None of them is visible in a diff or a review:
// each file reads correctly on its own, and the loser is simply never applied.
// So the build reads the cascade the way the browser does and names them.
//
// WHAT IT READS. Every client/styles/*.css. The ORDER is the browser's:
// the sheets client/index.html links, in link order, and after them every
// sheet a module imports (Vite injects those as their chunks load, so they
// always follow the linked ones — but not in any order this script can know,
// so two imported sheets are never compared with each other).
//
// WHAT IT FAILS ON. A declaration inside a phone or touch block — an `@media`
// that asks `(pointer: coarse)`, `(hover: none)` or a `max-width` of 1000px
// or less, and not under `not` — whose property is set again, for the SAME
// selector, by a later rule with no condition at all — outside every `@media`
// (`@supports` is not a condition on the device). A later rule under a
// reader's PREFERENCE (`prefers-reduced-motion`, `forced-colors`) is not a
// loss: it is narrower than the phone block and overrides it on purpose — the
// reduced-motion sheet exists to take the drawer's slide away. Same selector means same
// specificity, so "later" is the whole of the contest; `!important` is
// honoured the way the cascade honours it. Shorthands and their longhands,
// and a logical property and its physical twins, count as the same property
// (`padding` undoes `padding-top`; `min-height` undoes `min-block-size`).
//
// WHAT IT DOES NOT CLAIM. Different selectors that happen to reach the same
// element are not compared: that needs the DOM, and check-phone measures the
// result there. This gate is the cheap half — it catches the shape that keeps
// recurring, in a second, with no browser.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const STYLES = path.join(ROOT, "client/styles");
const LIST = process.argv.includes("--list");

// ── Load order ─────────────────────────────────────────────────────────────
const html = readFileSync(path.join(ROOT, "client/index.html"), "utf8");
const linked = [...html.matchAll(/<link rel="stylesheet" href="\/styles\/([^"]+\.css)"/g)].map((m) => m[1]);
const all = readdirSync(STYLES).filter((f) => f.endsWith(".css")).sort();
for (const f of linked) {
  if (!all.includes(f)) {
    console.error(`check-cascade: index.html links /styles/${f}, which is not in client/styles/`);
    process.exit(1);
  }
}
/** A sheet's place in the cascade: its link index, or one past the last for
 *  every imported sheet (they tie — see the header). */
const rankOf = (file) => (linked.includes(file) ? linked.indexOf(file) : linked.length);

// ── A small CSS reader ─────────────────────────────────────────────────────
// No nesting in this codebase and no dependency worth taking for the rest:
// comments blanked (keeping line numbers), then a walk over braces with a
// stack of the at-rules that enclose each rule.

function blankComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
}

/** @returns {{file, rank, order, line, selectors: string[], decls: {prop, important, line}[], media: string[], opaque: boolean}[]} */
function rulesOf(file) {
  const src = blankComments(readFileSync(path.join(STYLES, file), "utf8"));
  const out = [];
  const stack = []; // { kind: "media"|"supports"|"container"|"skip"|"rule", cond }
  let i = 0;
  let start = 0;
  let order = 0;
  const lineAt = (at) => src.slice(0, at).split("\n").length;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      const close = src.indexOf(ch, i + 1);
      i = close === -1 ? src.length : close + 1;
      continue;
    }
    if (ch === ";" && (stack.length === 0 || stack[stack.length - 1].kind !== "rule")) {
      start = i + 1; // an at-statement (@import) between rules
      i++;
      continue;
    }
    if (ch === "{") {
      const head = src.slice(start, i).trim();
      if (head.startsWith("@")) {
        const name = /^@([a-z-]+)/.exec(head)?.[1] ?? "";
        const cond = head.slice(name.length + 1).trim().replace(/\s+/g, " ");
        const kind = name === "media" ? "media" : name === "supports" ? "supports" : name === "container" ? "container" : "skip";
        stack.push({ kind, cond });
      } else {
        const inSkip = stack.some((s) => s.kind === "skip");
        const bodyEnd = src.indexOf("}", i);
        if (!inSkip) {
          const body = src.slice(i + 1, bodyEnd);
          const decls = [];
          let at = i + 1;
          for (const part of body.split(";")) {
            const m = /^\s*([-a-zA-Z]+)\s*:([\s\S]*)$/.exec(part);
            if (m) {
              decls.push({
                prop: m[1].toLowerCase(),
                important: /!\s*important\s*$/i.test(m[2].trim()),
                line: lineAt(at + part.search(/\S/)),
              });
            }
            at += part.length + 1;
          }
          out.push({
            file,
            rank: rankOf(file),
            order: order++,
            line: lineAt(start + (src.slice(start, i).search(/\S/) || 0)),
            selectors: splitSelectors(head),
            decls,
            media: stack.filter((s) => s.kind === "media").map((s) => s.cond),
            opaque: stack.some((s) => s.kind === "container"),
          });
        }
        i = bodyEnd + 1;
        start = i;
        continue;
      }
      i++;
      start = i;
      continue;
    }
    if (ch === "}") {
      stack.pop();
      i++;
      start = i;
      continue;
    }
    i++;
  }
  return out;
}

/** Top-level commas only: `:is(a, b)` is one selector. */
function splitSelectors(head) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of head) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/\s+/g, " ").replace(/\s*([>+~])\s*/g, " $1 ")).filter(Boolean);
}

// ── Which blocks are the phone's, and which rules reach a phone anyway ─────
/** One `@media` condition is a phone/touch block when some comma-arm of it
 *  asks for a coarse pointer, no hover, or a narrow viewport — and not under
 *  `not`. */
function phoneCond(cond) {
  return cond.split(/,(?![^()]*\))/).some((arm) => {
    if (/\bnot\b/.test(arm)) return false;
    if (/\(\s*pointer:\s*coarse\s*\)|\(\s*any-pointer:\s*coarse\s*\)|\(\s*hover:\s*none\s*\)/.test(arm)) return true;
    const w = /max-width:\s*(\d+(?:\.\d+)?)px/.exec(arm);
    return w !== null && Number(w[1]) <= 1000;
  });
}
const isPhone = (rule) => !rule.opaque && rule.media.some(phoneCond);
/** Applies everywhere: no `@media` around it (and no `@container`). */
const isGlobal = (rule) => !rule.opaque && rule.media.length === 0;

// ── Properties that overlap ────────────────────────────────────────────────
// Each property becomes the set of physical "slots" it writes. Logical sides
// map to BOTH physical ones: inline-start is left in English and right in
// Arabic, and a product with both loses the rule in one of them.
const SIDES = ["top", "right", "bottom", "left"];
const BLOCK = ["top", "bottom"];
const INLINE = ["left", "right"];
function boxSlots(base, suffix = "") {
  const p = (s) => `${base}-${s}${suffix}`;
  return {
    [`${base}${suffix}`]: SIDES.map(p),
    [`${base}-block${suffix}`]: BLOCK.map(p),
    [`${base}-inline${suffix}`]: INLINE.map(p),
    [`${base}-block-start${suffix}`]: [p("top")],
    [`${base}-block-end${suffix}`]: [p("bottom")],
    [`${base}-inline-start${suffix}`]: INLINE.map(p),
    [`${base}-inline-end${suffix}`]: INLINE.map(p),
    ...Object.fromEntries(SIDES.map((s) => [p(s), [p(s)]])),
  };
}
const SLOTS = {
  ...boxSlots("margin"),
  ...boxSlots("padding"),
  ...boxSlots("scroll-margin"),
  ...boxSlots("scroll-padding"),
  ...boxSlots("border", "-width"),
  ...boxSlots("border", "-style"),
  ...boxSlots("border", "-color"),
  inset: SIDES.map((s) => `pos-${s}`),
  "inset-block": BLOCK.map((s) => `pos-${s}`),
  "inset-inline": INLINE.map((s) => `pos-${s}`),
  "inset-block-start": ["pos-top"],
  "inset-block-end": ["pos-bottom"],
  "inset-inline-start": ["pos-left", "pos-right"],
  "inset-inline-end": ["pos-left", "pos-right"],
  ...Object.fromEntries(SIDES.map((s) => [s, [`pos-${s}`]])),
  width: ["width"],
  "inline-size": ["width"],
  height: ["height"],
  "block-size": ["height"],
  "min-width": ["min-width"],
  "min-inline-size": ["min-width"],
  "max-width": ["max-width"],
  "max-inline-size": ["max-width"],
  "min-height": ["min-height"],
  "min-block-size": ["min-height"],
  "max-height": ["max-height"],
  "max-block-size": ["max-height"],
  gap: ["row-gap", "column-gap"],
  "grid-gap": ["row-gap", "column-gap"],
  "row-gap": ["row-gap"],
  "column-gap": ["column-gap"],
  flex: ["flex-grow", "flex-shrink", "flex-basis"],
  "flex-grow": ["flex-grow"],
  "flex-shrink": ["flex-shrink"],
  "flex-basis": ["flex-basis"],
  "flex-flow": ["flex-direction", "flex-wrap"],
  "flex-direction": ["flex-direction"],
  "flex-wrap": ["flex-wrap"],
  overflow: ["overflow-x", "overflow-y"],
  "overflow-x": ["overflow-x"],
  "overflow-inline": ["overflow-x"],
  "overflow-y": ["overflow-y"],
  "overflow-block": ["overflow-y"],
  "grid-template": ["grid-template-columns", "grid-template-rows", "grid-template-areas"],
  "grid-template-columns": ["grid-template-columns"],
  "grid-template-rows": ["grid-template-rows"],
  "grid-template-areas": ["grid-template-areas"],
  "place-items": ["align-items", "justify-items"],
  "place-content": ["align-content", "justify-content"],
  "place-self": ["align-self", "justify-self"],
  background: ["background-color", "background-image"],
  "background-color": ["background-color"],
  "background-image": ["background-image"],
  "border-radius": ["radius-tl", "radius-tr", "radius-br", "radius-bl"],
  outline: ["outline-width", "outline-style", "outline-color"],
  "text-decoration": ["text-decoration-line", "text-decoration-color", "text-decoration-style"],
  font: ["font-size", "font-weight", "font-family", "line-height", "font-style"],
  "font-size": ["font-size"],
  "font-weight": ["font-weight"],
  "font-family": ["font-family"],
  "line-height": ["line-height"],
  "font-style": ["font-style"],
};
for (const side of SIDES) {
  SLOTS[`border-${side}`] = [`border-${side}-width`, `border-${side}-style`, `border-${side}-color`];
}
for (const [logical, phys] of [["block-start", ["top"]], ["block-end", ["bottom"]], ["inline-start", INLINE], ["inline-end", INLINE]]) {
  SLOTS[`border-${logical}`] = phys.flatMap((s) => [`border-${s}-width`, `border-${s}-style`, `border-${s}-color`]);
}
SLOTS.border = SIDES.flatMap((s) => [`border-${s}-width`, `border-${s}-style`, `border-${s}-color`]);
SLOTS["border-width"] = SIDES.map((s) => `border-${s}-width`);
SLOTS["border-style"] = SIDES.map((s) => `border-${s}-style`);
SLOTS["border-color"] = SIDES.map((s) => `border-${s}-color`);
for (const [a, b] of [["top-left", "tl"], ["top-right", "tr"], ["bottom-right", "br"], ["bottom-left", "bl"], ["start-start", "tl"], ["start-end", "tr"], ["end-end", "br"], ["end-start", "bl"]]) {
  SLOTS[`border-${a}-radius`] = b === "tl" || b === "tr" ? ["radius-tl", "radius-tr"] : ["radius-bl", "radius-br"];
}
const slotsOf = (prop) => SLOTS[prop] ?? [prop];

// ── The contest ────────────────────────────────────────────────────────────
const rules = all.flatMap(rulesOf);
/** Is `b` later in the cascade than `a`? `null` when the order is unknowable
 *  (two imported sheets). */
function later(a, b) {
  if (a.file === b.file) return b.order > a.order;
  if (a.rank !== b.rank) return b.rank > a.rank;
  return null;
}

/** selector → every declaration any rule makes for it, with its rule. */
const bySelector = new Map();
for (const rule of rules) {
  if (!isPhone(rule) && !isGlobal(rule)) continue;
  for (const sel of rule.selectors) {
    if (!bySelector.has(sel)) bySelector.set(sel, []);
    bySelector.get(sel).push(rule);
  }
}

const dead = [];
let phoneDecls = 0;
for (const [sel, owners] of bySelector) {
  for (const p of owners) {
    if (!isPhone(p)) continue;
    for (const d of p.decls) {
      phoneDecls++;
      const mine = new Set(slotsOf(d.prop));
      // The LAST global rule that undoes this declaration wins the report —
      // it is the one a fix has to move above the block.
      let killer = null;
      for (const g of owners) {
        if (g === p || isPhone(g) || later(p, g) !== true) continue;
        for (const gd of g.decls) {
          if (d.important && !gd.important) continue;
          if (!slotsOf(gd.prop).some((s) => mine.has(s))) continue;
          if (killer === null || later(killer.rule, g) === true) killer = { rule: g, decl: gd };
        }
      }
      if (killer === null) continue;
      // …unless a phone rule for the same selector comes later still and
      // states the slot again: then the phone has the last word after all.
      const rescued = owners.some(
        (q) =>
          q !== p &&
          isPhone(q) &&
          later(killer.rule, q) === true &&
          q.decls.some((qd) => (qd.important || !killer.decl.important) && slotsOf(qd.prop).some((s) => mine.has(s))),
      );
      if (rescued) continue;
      dead.push(
        `client/styles/${p.file}:${d.line}  ${sel} { ${d.prop} }  in @media ${p.media.join(" / ")}\n` +
          `    undone by client/styles/${killer.rule.file}:${killer.decl.line}  ${sel} { ${killer.decl.prop} }` +
          (killer.rule.media.length ? `  in @media ${killer.rule.media.join(" / ")}` : "  (no condition)"),
      );
    }
  }
}

console.log(
  `cascade: ${all.length} sheets (${linked.length} linked, ${all.length - linked.length} imported) · ` +
    `${rules.length} rules · ${phoneDecls} phone/touch declarations checked`,
);
if (LIST || dead.length > 0) {
  for (const line of dead) console.log(`DEAD  ${line}`);
}
if (dead.length > 0) {
  console.log(
    `\nFAIL: ${dead.length} phone/touch declaration(s) never apply.\n` +
      `Move the later global rule ABOVE the @media block (or fold the phone value into a block\n` +
      `that comes after it). A phone rule that loses to a desktop rule is a phone rule nobody sees.`,
  );
  process.exit(1);
}
console.log("CASCADE OK");
