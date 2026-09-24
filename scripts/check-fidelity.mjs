// GATE: the editor's live preview and the reading view draw the SAME PIXELS
// for the same markdown.
//   node scripts/check-fidelity.mjs [http://localhost:6801] [outdir]
//   env: CHROMIUM=/usr/bin/chromium
//        ASTROLABE_PASSWORD=<pw>  — when the instance sets ADMIN_PASSWORD_HASH;
//                                without an admin session no editor mounts and
//                                the run refuses loudly instead of "passing".
// Exits 1 on any miss. Run it like check-caret / check-i18n.
//
// CONTRACTS.md "Tables": one renderer, four surfaces — and where the editor
// cannot reuse the renderer (a callout is a run of lines, a fence is a run of
// lines, a footnote ref is a mark) its stylesheet has to say the reading
// view's numbers. Nothing held it to that: the callout title reset its hue to
// note-blue over a warning's bar, the table widget inherited CodeMirror's
// `overflow-wrap: anywhere` and broke "Identifier" into "Ide/ntif/ier" on a
// phone while the reading view scrolled the wrap, the code fence was two
// pixels larger, the footnote reference one smaller, the quote bar physical.
// Every one of those is a computed style, so this gate writes ONE rich note
// — a callout, an Arabic callout, tables (one Arabic, one too wide for the
// column), a sized and a bare picture, a transclusion, a fence, display and
// inline maths, a footnote, ruby, lists, a task, a quote, a rule, every inline
// mark — opens it in the editor with the caret parked on a neutral line (the
// reveal-on-caret rule rewrites whatever line the caret is on), scrolls the
// whole note through CodeMirror's viewport so every block is materialised,
// reads the computed style of each anchor, flips to the reading view with
// Ctrl+E and reads the same anchors there. A pair disagrees when any listed
// property differs (colours are normalised through a canvas so `color(srgb)`
// and `rgb()` compare as numbers; lengths within half a pixel are equal; an
// x offset within 8px is equal — the editor's line has CodeMirror's own 6px
// inset). Vertical rhythm is NOT compared: the editor draws a blank line as a
// line and the reading view collapses it into a margin, by design.
//
// The same anchors run in the Arabic chrome (`astrolabe.editorLang`, the
// device-local switch), where an Arabic callout has to bar on the right on
// BOTH its lines in both surfaces, and the Arabic table has to sit at the
// column's end with its first column outermost. Then a phone-shaped context
// (390 wide, coarse pointer) asserts no single-word cell of the wide table
// breaks inside the word in either surface — the defect that started this.
//
// The fixture is written through the API and deleted, permanently, however
// the run ends; the picture it embeds is uploaded and deleted the same way.
//
// Last, the dictionary split (3.29): an Arabic chrome whose dictionary chunk
// is held back 1.5s is watched from its first byte, and no English chrome
// string and no key name may ever reach its DOM — the switch waits for its
// strings, so there is no flash of the wrong language.

import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
import enDict from "../client/i18n/en.ts";
import arDict from "../client/i18n/ar.ts";

// What an Arabic first paint must never show (the dictionary step at the end):
// an English chrome string — one of two words or more, so a note's own title
// cannot be mistaken for chrome — or a key name, camelCase as every key is.
const ENGLISH_CHROME = new Set(
  Object.entries(enDict)
    .filter(([k, v]) => v !== arDict[k] && /[A-Za-z]{3}/.test(v) && /\s/.test(v.trim()))
    .map(([, v]) => v.trim()),
);
const DICT_KEYS = new Set(Object.keys(enDict).filter((k) => /[a-z][A-Z]/.test(k)));
const ARABIC_CHROME = new Set(Object.values(arDict).map((v) => v.trim()));

const [url = "http://localhost:6801", out = "shots"] = process.argv.slice(2);
const NOTE_PATH = "fidelity-gate.md";
const PNG_NAME = "fidelity-gate.png";
// A 16×16 opaque PNG, so a bare embed has a box and a `|120` embed a width.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAADElEQVR4nGP4z8DAAAAACAABiqEfDgAAAABJRU5ErkJggg==",
  "base64",
);

const FIXTURE = (png) => `---
title: Fidelity gate
tags: [fidelitygate]
---

# Fidelity gate

parking line, nothing to reveal

A paragraph with \`inline code\`, a footnote[^1], inline math $E = mc^2$ and ruby {漢字|かんじ} inside it.

> [!warning] Mind the gap
> The warning's body sits under its title bar.

> [!tip] تنبيه بالعربية
> نص عربي داخل التنبيه يمتد على سطر كامل.

| Name | Count | Gamma |
|------|------:|:-----:|
| Alpha | 1,204 | 0.50 |
| Beta | 98 | 12.25 |

| الاسم | العدد |
|------|------|
| ألف | ١٢ |
| باء | ٩٨ |

| Identifier | Description | Measurement | Classification | Provenance | Annotation |
|------------|-------------|-------------|----------------|------------|------------|
| Alphabetical | Extraordinarily long description | 1,204,567 | Gamma | Observatory | Uncontroversial |
| Betamethasone | Another remarkably verbose cell | 98,765 | Delta | Laboratory | Straightforward |

![[${png}|120]]

![[${png}]]

![[${NOTE_PATH.replace(/\\.md$/, "")}#Fidelity gate]]

\`\`\`js
const alpha = beta(gamma, 42);
\`\`\`

$$
\\int_0^1 x^2\\,dx = \\tfrac{1}{3}
$$

- one
- two

1. first
2. second

- [ ] open task
- [x] done task

> A plain quote.

Inline runs: **strong words**, *emphasised words*, ~~struck words~~, ==marked words==, a tag #fidelitygate-inline, a link to [[${NOTE_PATH.replace(/\\.md$/, "")}]] and an [outside link](https://example.com/page).

---

[^1]: The footnote's text.
`;

// [name, editor finder, reading finder, properties]. A finder is `selector`
// or `selector|text` — the first match whose text contains `text`. `x` is
// the box's left edge relative to the prose column's text start, `width` the
// box's width; everything else is a computed style.
const PAIRS = [
  ["prose", ".cm-line|A paragraph with", ".s-rv-p|A paragraph with", ["fontFamily", "fontSize", "lineHeight", "color"]],
  ["h1", ".cm-line.cm-s-h1", ".s-rv-h1", ["fontSize", "fontFamily", "fontWeight", "color", "lineHeight", "letterSpacing"]],
  ["inline code", ".cm-s-inline-code", ".s-rv-p .s-rv-code|inline code", ["fontFamily", "fontSize", "backgroundColor", "color", "paddingInlineStart", "borderRadius", "borderTopColor"]],
  ["footnote ref", ".cm-s-footnote", ".s-rv-fnref a", ["color", "fontSize", "fontFamily", "lineHeight"]],
  ["footnote sup", ".cm-s-footnote", ".s-rv-fnref", ["verticalAlign", "fontSize"]],
  ["inline math", ".cm-s-math .katex", ".s-rv-math .katex", ["fontSize", "direction"]],
  ["ruby", ".cm-s-ruby", ".s-reading__content ruby", ["fontSize", "lineHeight", "rubyPosition"]],
  ["ruby rt", ".cm-s-ruby rt", ".s-reading__content ruby rt", ["fontSize", "color", "fontFamily"]],
  ["callout box", ".cm-line.cm-s-callout--warning", ".s-rv-callout--warning", ["borderInlineStartColor", "borderInlineStartWidth", "backgroundColor", "paddingInlineStart", "paddingInlineEnd"]],
  ["callout title", ".cm-s-callout__title.cm-s-callout--warning", ".s-rv-callout--warning .s-rv-callout__title", ["color", "fontSize", "fontFamily", "fontWeight"]],
  ["callout body", ".cm-line.cm-s-callout--warning.cm-s-callout--last", ".s-rv-callout--warning .s-rv-callout__body .s-rv-p", ["fontSize", "fontStyle", "color", "fontFamily", "lineHeight"]],
  ["arabic callout title line", ".cm-line.cm-s-callout--tip.cm-s-callout--first", ".s-rv-callout--tip", ["direction", "borderLeftWidth", "borderRightWidth"]],
  ["arabic callout body line", ".cm-line.cm-s-callout--tip.cm-s-callout--last", ".s-rv-callout--tip .s-rv-callout__body .s-rv-p", ["direction"]],
  ["table cell", ".cm-s-table td|Alpha", ".s-reading__content .s-rv-table td|Alpha", ["whiteSpace", "overflowWrap", "wordBreak", "paddingInlineStart", "borderTopColor", "fontSize", "fontFamily", "lineHeight", "textAlign"]],
  ["table head", ".cm-s-table th|Name", ".s-reading__content .s-rv-table th|Name", ["backgroundColor", "color", "fontSize", "fontWeight", "fontFamily", "whiteSpace", "overflowWrap", "letterSpacing"]],
  ["table", ".cm-s-table .s-rv-table|Name", ".s-reading__content .s-rv-table|Name", ["fontSize", "borderCollapse", "direction", "minWidth", "x"]],
  ["arabic table", ".cm-s-table .s-rv-table|الاسم", ".s-reading__content .s-rv-table|الاسم", ["direction", "x"]],
  ["arabic table first column", ".cm-s-table th|الاسم", ".s-reading__content .s-rv-table th|الاسم", ["x"]],
  ["sized image", ".cm-s-embed-image--sized img", ".s-rv-img[style*=\"width\"]", ["width", "x", "borderRadius", "borderTopColor", "borderTopWidth"]],
  ["bare image", ".cm-s-embed-image:not(.cm-s-embed-image--sized) img", ".s-rv-figure .s-rv-img:not([style])", ["width", "borderRadius", "borderTopWidth", "maxWidth"]],
  ["transclusion title", ".cm-s-transclude__title", ".s-rv-transclude__title", ["color", "fontSize", "fontFamily", "fontWeight", "letterSpacing", "textTransform"]],
  ["transclusion box", ".cm-s-transclude", ".s-rv-transclude", ["backgroundColor", "borderTopColor", "borderRadius", "paddingInlineStart"]],
  ["transclusion body", ".cm-s-transclude__body", ".s-rv-transclude__body", ["fontSize", "maxHeight", "lineHeight", "overflowY"]],
  ["code fence", ".cm-line.cm-s-codeblock", ".s-rv-pre", ["fontFamily", "fontSize", "backgroundColor", "color", "lineHeight"]],
  ["code keyword", ".cm-line.cm-s-codeblock .ͼp", ".s-rv-pre .tok-keyword", ["color"]],
  ["display math", ".cm-s-math-block .katex-display", ".s-rv-mathblock .katex-display", ["fontSize", "textAlign"]],
  ["display math box", ".cm-s-math-block", ".s-rv-mathblock", ["backgroundColor", "overflowX", "direction"]],
  ["list item", ".cm-line|one", ".s-rv-list li|one", ["fontSize", "lineHeight", "color", "fontFamily"]],
  ["task box", ".cm-line|open task", "li.s-rv-task|open task", ["width", "height", "marginInlineEnd", "marginInlineStart", "borderRadius", "borderTopColor"], "input"],
  ["quote", ".cm-line.cm-s-quote|A plain quote", ".s-rv-quote|A plain quote", ["borderInlineStartColor", "borderInlineStartWidth", "color", "fontStyle", "paddingInlineStart", "borderLeftWidth", "borderRightWidth"]],
  ["rule", ".cm-s-hr-rule", ".s-reading__content > .s-rv-hr", ["height", "backgroundImage", "borderRadius"]],
  ["wikilink", ".cm-s-wikilink|fidelity-gate", ".s-rv-p .s-rv-wikilink|fidelity-gate", ["color", "textDecorationLine", "fontWeight"]],
  ["tag", ".cm-s-tag", ".s-rv-p .s-rv-tag", ["color", "backgroundColor", "fontSize", "borderRadius", "paddingInlineStart", "fontFamily"]],
  ["highlight", ".cm-s-highlight", ".s-rv-p .s-rv-mark", ["backgroundColor", "color", "borderRadius"]],
  ["strong", ".cm-s-strong", ".s-rv-p strong", ["fontWeight", "color"]],
  ["emphasis", ".cm-s-em", ".s-rv-p em", ["fontStyle"]],
  ["strike", ".cm-s-strike", ".s-rv-p del", ["textDecorationLine", "color"]],
  ["outside link", ".cm-s-link", ".s-rv-p .s-rv-ext", ["color", "textDecorationLine", "textDecorationColor"]],
];

// Runs in the page. `side` 0 is the editor, 1 the reading view.
const READ = `(pairs, side) => {
  const find = (finder, child) => {
    const [sel, text] = finder.split("|");
    const all = [...document.querySelectorAll(sel)];
    const hit = text ? all.find((e) => e.textContent.includes(text)) ?? null : all[0] ?? null;
    return hit && child ? hit.querySelector(child) : hit;
  };
  const canvas = document.createElement("canvas").getContext("2d");
  const color = (v) => {
    canvas.fillStyle = "#000";
    canvas.fillStyle = v;
    const s = canvas.fillStyle;
    const m = /^color\\(srgb ([\\d.]+) ([\\d.]+) ([\\d.]+)(?: \\/ ([\\d.]+))?\\)$/.exec(s);
    if (!m) return s;
    const c = (x) => Math.round(parseFloat(x) * 255);
    return m[4] === undefined || parseFloat(m[4]) === 1 ? "#" + [m[1], m[2], m[3]].map((x) => c(x).toString(16).padStart(2, "0")).join("") : "rgba(" + c(m[1]) + ", " + c(m[2]) + ", " + c(m[3]) + ", " + m[4] + ")";
  };
  // The column's START edge — where prose begins — so x reads the same
  // in an Arabic shell, where the start is the right edge. The editor's line
  // carries CodeMirror's own inset (theme.ts .cm-line), the reading
  // column its gutter padding.
  const column = document.querySelector(side === 0 ? ".cm-content" : ".s-reading__content");
  const rtl = getComputedStyle(column).direction === "rtl";
  // (A line scrolled out of CodeMirror's viewport is not in the DOM: then
  // the inset is the theme's number.)
  const inset = side === 0 ? find(".cm-line|A paragraph with") : column;
  const ics = inset ? getComputedStyle(inset) : null;
  const pad = ics ? parseFloat(rtl ? ics.paddingRight : ics.paddingLeft) : side === 0 ? 6 : 0;
  const crect = column.getBoundingClientRect();
  const ox = rtl ? crect.right - pad : crect.left + pad;
  const out = {};
  for (const [name, edSel, rvSel, props, child] of pairs) {
    const el = find(side === 0 ? edSel : rvSel, child);
    if (!el) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const o = {};
    for (const p of props) {
      if (p === "width") o[p] = r.width;
      else if (p === "x") o[p] = rtl ? ox - r.right : r.left - ox;
      else if (/color/i.test(p)) o[p] = color(cs[p]);
      else if (p === "backgroundImage") o[p] = cs[p].replace(/color\\(srgb[^)]*\\)/g, (c) => color(c));
      else o[p] = cs[p];
    }
    out[name] = o;
  }
  return out;
}`;

// Single-word cells drawn on more than one line: the text's own client rects.
const WRAPPED = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].filter((c) => {
  if (/\\s/.test(c.textContent.trim())) return false;
  const r = document.createRange();
  r.selectNodeContents(c);
  return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size > 1;
}).map((c) => c.textContent)`;

const VIEW = `(() => { const c = document.querySelector(".cm-content"); const t = c && c.cmTile; return t && t.root && t.root.view; })()`;

mkdirSync(out, { recursive: true });
const fail = [];
const check = (ok, label, detail = "") => {
  if (!ok) fail.push(`${label} ${detail}`);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
};
const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const same = (a, b) => {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 0.5;
  const pa = /^(-?[\d.]+)px$/.exec(String(a));
  const pb = /^(-?[\d.]+)px$/.exec(String(b));
  if (pa && pb) return Math.abs(parseFloat(pa[1]) - parseFloat(pb[1])) <= 0.5;
  return false;
};
const fmt = (v) => (typeof v === "number" ? `${Math.round(v * 10) / 10}px` : String(v));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const contexts = [];
const newContext = async (opts) => {
  const ctx = await browser.newContext(opts);
  contexts.push(ctx);
  return ctx;
};
const first = await newContext({ viewport: { width: 1440, height: 900 } });
const apiPage = await first.newPage();
await apiPage.goto(url, { waitUntil: "load" });
const api = (path, init) =>
  apiPage.evaluate(
    async ([p, i]) => {
      const r = await fetch(p, i ?? undefined);
      const text = await r.text();
      let body = text;
      try {
        body = JSON.parse(text);
      } catch {
        /* text */
      }
      return { status: r.status, body };
    },
    [path, init ?? null],
  );

let pngPath = null;
let cookies = [];
const cleanup = async () => {
  await api(`/api/note?path=${encodeURIComponent(NOTE_PATH)}&permanent=true`, { method: "DELETE" }).catch(() => {});
  if (pngPath) await api(`/api/attachment?path=${encodeURIComponent(pngPath)}&permanent=true`, { method: "DELETE" }).catch(() => {});
};

try {
  let me = (await api("/api/me")).body;
  if (!me?.admin) {
    const password = process.env.ASTROLABE_PASSWORD ?? "";
    if (!password) {
      console.error("check-fidelity: not an admin session and no ASTROLABE_PASSWORD — no editor would mount.");
      process.exit(1);
    }
    const res = await api("/api/login", json("POST", { password }));
    if (res.status !== 200) {
      console.error(`check-fidelity: login failed (${res.status}).`);
      process.exit(1);
    }
    me = (await api("/api/me")).body;
    if (!me?.admin) {
      console.error("check-fidelity: still not an admin after login.");
      process.exit(1);
    }
  }
  cookies = await first.cookies();

  // The picture, then the note that embeds it by the name the server kept.
  const up = await apiPage.evaluate(
    async ([name, b64]) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const form = new FormData();
      form.append("file", new File([bytes], name, { type: "image/png" }), name);
      const r = await fetch("/api/upload", { method: "POST", body: form });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    [PNG_NAME, PNG.toString("base64")],
  );
  check(up.status === 200 && up.body?.path, "fixture picture uploaded", up.status === 200 ? up.body.path : `HTTP ${up.status}`);
  pngPath = up.body?.path ?? null;
  const pngName = pngPath ? pngPath.slice(pngPath.lastIndexOf("/") + 1) : PNG_NAME;
  const w = await api(`/api/note?path=${encodeURIComponent(NOTE_PATH)}`, json("PUT", { content: FIXTURE(pngName) }));
  check(w.status === 200, "fixture note written", w.status === 200 ? "" : `HTTP ${w.status} ${JSON.stringify(w.body).slice(0, 120)}`);
  if (w.status !== 200) throw new Error("no fixture");

  const openNote = async (page, lang) => {
    await page.goto(url, { waitUntil: "load" });
    await page.evaluate((l) => {
      localStorage.setItem("astrolabe.whatsnewSeen", "9.9.9");
      localStorage.setItem("astrolabe.prefs-sync-off", "1");
      localStorage.setItem("astrolabe.editorLang", l);
    }, lang);
    await page.goto(`${url}/${encodeURIComponent(NOTE_PATH.replace(/\.md$/, ""))}`, { waitUntil: "load" });
    await page.waitForSelector(".cm-content", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector(".cm-s-table") !== null, null, { timeout: 20000 });
    // KaTeX and the transclusion arrive on their own time.
    await page.waitForFunction(() => document.querySelector(".cm-s-math .katex") !== null && document.querySelector(".cm-s-transclude__body .s-rv") !== null, null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(600);
    // Park the caret on the neutral line so every block below is rendered.
    await page.evaluate(
      ([v]) => {
        const view = eval(v);
        if (!view) return;
        const pos = view.state.doc.toString().indexOf("parking line");
        view.dispatch({ selection: { anchor: Math.max(0, pos) } });
      },
      [VIEW],
    );
    await page.waitForTimeout(300);
  };

  /** Read the editor's anchors, scrolling the viewport through the note. */
  const readEditor = async (page) => {
    const merged = {};
    const wrapped = new Set();
    for (let step = 0; step < 40; step++) {
      const part = await page.evaluate(`(${READ})(${JSON.stringify(PAIRS)}, 0)`);
      for (const k of Object.keys(part)) if (!(k in merged)) merged[k] = part[k];
      for (const c of await page.evaluate(WRAPPED(".cm-s-table td, .cm-s-table th"))) wrapped.add(c);
      const atEnd = await page.evaluate(() => {
        const s = document.querySelector(".cm-scroller");
        const before = s.scrollTop;
        s.scrollTop += 400;
        return s.scrollTop === before;
      });
      await page.waitForTimeout(150);
      if (atEnd) break;
    }
    return { styles: merged, wrapped: [...wrapped] };
  };

  const readReading = async (page) => {
    await page.keyboard.press("Control+e");
    await page.waitForSelector(".s-reading__content", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector(".s-reading__content .s-rv-math .katex") !== null && document.querySelector(".s-rv-transclude__body .s-rv") !== null, null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(600);
    const styles = await page.evaluate(`(${READ})(${JSON.stringify(PAIRS)}, 1)`);
    const wrapped = await page.evaluate(WRAPPED(".s-reading__content .s-rv-table td, .s-reading__content .s-rv-table th"));
    return { styles, wrapped };
  };

  const compare = (label, ed, rv) => {
    let misses = 0;
    for (const [name, , , props] of PAIRS) {
      const a = ed[name];
      const b = rv[name];
      if (!a || !b) {
        check(false, `${label}: ${name}`, `${a ? "" : "missing in the editor"}${a || b ? "" : " and "}${b ? "" : "missing in the reading view"}`);
        misses++;
        continue;
      }
      // An x offset within 8px is the same edge: the editor's line inset and
      // a centred picture's rounding are not what this gate is for.
      const diffs = props.filter((p) => (p === "x" ? Math.abs(a[p] - b[p]) > 8 : !same(a[p], b[p]))).map((p) => `${p}: editor ${fmt(a[p])} / reading ${fmt(b[p])}`);
      check(diffs.length === 0, `${label}: ${name}`, diffs.join("; "));
      if (diffs.length) misses++;
    }
    return misses;
  };

  // ── Desktop, both chrome languages ────────────────────────────────────
  for (const lang of ["en", "ar"]) {
    const ctx = await newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addCookies(cookies);
    const page = await ctx.newPage();
    await openNote(page, lang);
    await page.screenshot({ path: `${out}/fidelity-${lang}-editor.png` });
    const ed = await readEditor(page);
    const rv = await readReading(page);
    await page.screenshot({ path: `${out}/fidelity-${lang}-reading.png` });
    console.log(`\n${lang}: ${Object.keys(ed.styles).length}/${PAIRS.length} anchors found in the editor, ${Object.keys(rv.styles).length}/${PAIRS.length} in the reading view`);
    compare(lang, ed.styles, rv.styles);
    check(ed.wrapped.length === 0, `${lang}: no table word breaks in the editor`, ed.wrapped.join(", "));
    check(rv.wrapped.length === 0, `${lang}: no table word breaks in the reading view`, rv.wrapped.join(", "));
    // The Arabic table: the column's END edge in both, first column outermost.
    const tableEnd = (s) => {
      const t = s["arabic table"];
      const th = s["arabic table first column"];
      return t && th ? { dir: t.direction, x: t.x, thx: th.x } : null;
    };
    const e = tableEnd(ed.styles);
    const r = tableEnd(rv.styles);
    check(e !== null && e.dir === "rtl", `${lang}: Arabic table resolves rtl in the editor`, e ? e.dir : "missing");
    check(r !== null && r.dir === "rtl", `${lang}: Arabic table resolves rtl in the reading view`, r ? r.dir : "missing");
    if (e && r) check(Math.abs(e.thx - r.thx) <= 8, `${lang}: Arabic table's first column sits at the same edge`, `editor ${fmt(e.thx)} / reading ${fmt(r.thx)}`);
    const ac = ed.styles["arabic callout title line"];
    check(ac && ac.direction === "rtl" && ac.borderRightWidth !== "0px" && ac.borderLeftWidth === "0px", `${lang}: Arabic callout title line is rtl and barred on the right in the editor`, ac ? `${ac.direction} L${ac.borderLeftWidth} R${ac.borderRightWidth}` : "missing");
    await page.close();
  }

  // ── Phone: the wide table wraps by word, in both surfaces ─────────────
  {
    const ctx = await newContext({ ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addCookies(cookies);
    const page = await ctx.newPage();
    await openNote(page, "en");
    const ed = await readEditor(page);
    await page.screenshot({ path: `${out}/fidelity-phone-editor.png` });
    const rv = await readReading(page);
    await page.screenshot({ path: `${out}/fidelity-phone-reading.png` });
    console.log("");
    check(ed.wrapped.length === 0, "phone: no table word breaks in the editor", ed.wrapped.join(", "));
    check(rv.wrapped.length === 0, "phone: no table word breaks in the reading view", rv.wrapped.join(", "));
    const cell = ed.styles["table cell"];
    check(cell && cell.overflowWrap === "break-word" && cell.whiteSpace === "normal" && cell.wordBreak === "normal", "phone: the editor's table cells carry the reading view's wrap rules", cell ? `${cell.whiteSpace} / ${cell.wordBreak} / ${cell.overflowWrap}` : "missing");
    await page.close();
  }

  // ── An Arabic page never shows English before its dictionary lands ──────
  // The dictionaries are two chunks (client/i18n/en.ts, ar.ts), neither in
  // the entry, and a language switch AWAITS its chunk. So: an Arabic chrome
  // whose chunk is held back 1.5s must show NOTHING from the dictionary in the
  // meantime — not the English (a flash of the wrong language) and not a key
  // name (t() with nothing installed). Every text node and every copy-bearing
  // attribute the page ever puts in the DOM, from the first byte, is recorded
  // and held against both lists; then the Arabic is on screen.
  {
    const ctx = await newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addCookies(cookies);
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("astrolabe.whatsnewSeen", "9.9.9");
        localStorage.setItem("astrolabe.prefs-sync-off", "1");
        localStorage.setItem("astrolabe.editorLang", "ar");
      } catch {}
      const seen = new Set();
      window.__seen = seen;
      const ATTRS = ["title", "placeholder", "aria-label"];
      const take = (node) => {
        if (node.nodeType === 3) {
          const s = node.data.trim();
          if (s) seen.add(s);
          return;
        }
        if (node.nodeType !== 1) return;
        for (const a of ATTRS) {
          const v = node.getAttribute(a);
          if (v) seen.add(v.trim());
        }
        for (const c of node.childNodes) take(c);
      };
      new MutationObserver((records) => {
        for (const r of records) {
          if (r.type === "characterData") take(r.target);
          else if (r.type === "attributes") take(r.target);
          else for (const n of r.addedNodes) take(n);
        }
      }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    });
    let held = 0;
    await ctx.route(/\/assets\/ar-[\w-]+\.js$/, async (route) => {
      held++;
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => document.documentElement.lang === "ar" && document.querySelector(".s-tree__item") !== null, null, { timeout: 30000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/fidelity-ar-first-paint.png` });
    const seen = await page.evaluate(() => [...window.__seen]);
    check(held > 0, "ar first paint: the Arabic dictionary came as its own chunk (and was held back)", `${held} request(s)`);
    const englishHits = seen.filter((s) => ENGLISH_CHROME.has(s));
    check(englishHits.length === 0, "ar first paint: no English chrome string ever reached the DOM", englishHits.slice(0, 8).join(" | "));
    const keyHits = seen.filter((s) => DICT_KEYS.has(s));
    check(keyHits.length === 0, "ar first paint: no dictionary key was ever drawn as text", keyHits.slice(0, 8).join(" | "));
    const arabicShown = seen.some((s) => ARABIC_CHROME.has(s));
    check(arabicShown, "ar first paint: the Arabic chrome is on screen", `${seen.length} strings seen`);
    await page.close();
  }
} finally {
  await cleanup();
  for (const c of contexts) await c.close().catch(() => {});
  await browser.close();
}

console.log(fail.length === 0 ? "\ncheck-fidelity: all green" : `\ncheck-fidelity: ${fail.length} failure(s)`);
process.exit(fail.length === 0 ? 0 : 1);
