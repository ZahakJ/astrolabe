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
// Then the embed you can pick up: on a second note, a right-click on the
// picture opens the embed menu and Copy as Markdown puts the embed on the
// clipboard exactly as written; a drag moves its line (and one undo moves it
// back); a drag in the reading view shows its drop line and moves the line in
// the file.
//
// Then a film (client/reading/video.ts): the fixture webm uploaded, embedded
// twice — as dropped, and from twelve seconds — draws as a player in the
// editor and in the reading view, the second one seeks to 0:12 by its own
// `#t=`, and a visitor's page carries the player too (the note is published,
// so the film is theirs to fetch).
//
// Last, the dictionary split (3.29): an Arabic chrome whose dictionary chunk
// is held back 1.5s is watched from its first byte, and no English chrome
// string and no key name may ever reach its DOM — the switch waits for its
// strings, so there is no flash of the wrong language.
//
// And Your own voices (docs/read-aloud.md): the voices folder pointed at a
// fixture outside the vault is listed in the row and in the French picker
// under "Your voices"; with ASTROLABE_SPEAK_FAKE=1 the player's ▾ switches a
// passage to a found voice. The owner's folder and voices are put back.
//
// And Read aloud (docs/read-aloud.md): a word selected in the editor and read with
// Ctrl/Cmd ⇧ ., then a word selected in the reading view and read with its
// chip — an answer from `POST /api/speak` arrives and the floating player
// shows. Run the scratch server with ASTROLABE_SPEAK_FAKE=1 and that answer
// is audio (a tone stands in for the engines); without it, nothing is
// installed and the answer must be the 409 and the player's honest line.

import { chromium, devices } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
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
const EMBED_NOTE = "fidelity-embeds.md";
const VIDEO_NOTE = "fidelity-video.md";
// A 40-second, 64×36 WebM (11 kB) — made with ffmpeg once and kept, so the
// gate needs no encoder: tests/fixtures/video/film.webm.
const FILM = readFileSync(new URL("../tests/fixtures/video/film.webm", import.meta.url));
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
let filmPath = null;
let cookies = [];
const cleanup = async () => {
  await api(`/api/note?path=${encodeURIComponent(NOTE_PATH)}&permanent=true`, { method: "DELETE" }).catch(() => {});
  await api(`/api/note?path=${encodeURIComponent(EMBED_NOTE)}&permanent=true`, { method: "DELETE" }).catch(() => {});
  if (pngPath) await api(`/api/attachment?path=${encodeURIComponent(pngPath)}&permanent=true`, { method: "DELETE" }).catch(() => {});
  await api(`/api/note?path=${encodeURIComponent(VIDEO_NOTE)}&permanent=true`, { method: "DELETE" }).catch(() => {});
  if (filmPath) await api(`/api/attachment?path=${encodeURIComponent(filmPath)}&permanent=true`, { method: "DELETE" }).catch(() => {});
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

  // ── An embed you can pick up (shared/embedActions.ts, editor/embedGrip.ts) ──
  // Right-click a picture: the one menu opens, and "Copy as Markdown" puts the
  // embed on the clipboard exactly as written. Drag it below a paragraph: its
  // line moves there, as a paragraph of its own, and one undo puts it back.
  // Then the same in the reading view, where the drop lands between blocks.
  {
    const pngName = pngPath ? pngPath.slice(pngPath.lastIndexOf("/") + 1) : PNG_NAME;
    const embedNote = `# Pick me up\n\nAlpha paragraph.\n\n![[${pngName}|120]]\n\nBeta paragraph.\n\nGamma paragraph.\n`;
    const we = await api(`/api/note?path=${encodeURIComponent(EMBED_NOTE)}`, json("PUT", { content: embedNote }));
    check(we.status === 200, "embeds: fixture note written", we.status === 200 ? "" : `HTTP ${we.status}`);
    const ctx = await newContext({ viewport: { width: 1280, height: 800 }, permissions: ["clipboard-read", "clipboard-write"] });
    await ctx.addCookies(cookies);
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "load" });
    await page.evaluate(() => {
      localStorage.setItem("astrolabe.whatsnewSeen", "9.9.9");
      localStorage.setItem("astrolabe.prefs-sync-off", "1");
      localStorage.setItem("astrolabe.editorLang", "en");
    });
    await page.goto(`${url}/${encodeURIComponent(EMBED_NOTE.replace(/\.md$/, ""))}`, { waitUntil: "load" });
    await page.waitForSelector(".cm-s-embed-image img", { timeout: 20000 });
    await page.waitForTimeout(600);
    await page.evaluate(([v]) => eval(v).dispatch({ selection: { anchor: 0 } }), [VIEW]);
    const doc = () => page.evaluate(([v]) => eval(v).state.doc.toString(), [VIEW]);
    const pic = page.locator(".cm-s-embed-image img").first();
    await pic.click({ button: "right" });
    const menuUp = await page.waitForSelector(".s-menu", { timeout: 5000 }).then(() => true, () => false);
    const rows = menuUp ? await page.locator(".s-menu .s-menu__item").allTextContents() : [];
    check(menuUp && rows.includes("Copy as Markdown") && rows.includes("Copy image") && rows.includes("Remove embed"), "embeds: right-click on a picture opens the embed menu", rows.join(" | "));
    await page.screenshot({ path: `${out}/fidelity-embed-menu.png` });
    if (menuUp) {
      await page.locator(".s-menu .s-menu__item", { hasText: "Copy as Markdown" }).click();
      await page.waitForTimeout(250);
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      check(clip === `![[${pngName}|120]]`, "embeds: Copy as Markdown copies the embed exactly as written", JSON.stringify(clip));
    }
    const before = await doc();
    const from = await pic.boundingBox();
    const to = await page.locator(".cm-line", { hasText: "Beta paragraph." }).boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 6, from.y + from.height / 2 + 6, { steps: 3 });
    await page.mouse.move(to.x + to.width - 8, to.y + to.height - 3, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const moved = await doc();
    const want = `# Pick me up\n\nAlpha paragraph.\n\nBeta paragraph.\n\n![[${pngName}|120]]\n\nGamma paragraph.\n`;
    check(moved === want, "embeds: a drag within the note moves the embed's line", JSON.stringify(moved.slice(0, 120)));
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(200);
    check((await doc()) === before, "embeds: one undo puts the moved embed back");
    // The reading view: the same picture, dragged above the first paragraph.
    await page.keyboard.press("Control+e");
    await page.waitForSelector(".s-reading__content img[data-embed-src], .s-reading__content [data-embed-src] img", { timeout: 10000 });
    await page.waitForTimeout(500);
    const rpic = page.locator(".s-reading__content [data-embed-src] img, .s-reading__content img[data-embed-src]").first();
    const rb = await rpic.boundingBox();
    const ab = await page.locator(".s-reading__content .s-rv-p", { hasText: "Alpha paragraph." }).boundingBox();
    await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
    await page.mouse.down();
    await page.mouse.move(rb.x + rb.width / 2 + 6, rb.y + rb.height / 2 + 6, { steps: 3 });
    await page.mouse.move(ab.x + 30, ab.y + 2, { steps: 8 });
    const lineShown = (await page.locator(".s-embed-dropline").count()) > 0;
    await page.mouse.up();
    await page.waitForTimeout(1200);
    const saved = (await api(`/api/note?path=${encodeURIComponent(EMBED_NOTE)}`)).body?.content ?? "";
    check(lineShown, "embeds: the reading view shows where the drop will land");
    check(saved === `# Pick me up\n\n![[${pngName}|120]]\n\nAlpha paragraph.\n\nBeta paragraph.\n\nGamma paragraph.\n`, "embeds: a drag in the reading view moves the embed's line in the file", JSON.stringify(saved.slice(0, 120)));
    await page.close();
  }

  // ── A film in a note (client/reading/video.ts) ──────────────────────────
  // The fixture webm, uploaded the way a drop uploads it and embedded as a
  // drop embeds it; then the same film from 0:12. Both are players in the
  // editor and in the reading view, the second has sought to 12 s on its
  // own, and a visitor's page of the (published) note carries the player.
  {
    const up = await apiPage.evaluate(
      async (b64) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const form = new FormData();
        form.append("file", new File([bytes], "fidelity-film.webm", { type: "video/webm" }), "fidelity-film.webm");
        const r = await fetch("/api/upload", { method: "POST", body: form });
        return { status: r.status, body: await r.json().catch(() => null) };
      },
      FILM.toString("base64"),
    );
    check(up.status === 200 && up.body?.path, "film: the fixture webm uploads", up.status === 200 ? up.body.path : `HTTP ${up.status}`);
    filmPath = up.body?.path ?? null;
    const film = filmPath ? filmPath.slice(filmPath.lastIndexOf("/") + 1) : "fidelity-film.webm";
    const content = `---\npublish: true\n---\n# A film\n\nAs dropped:\n\n![[${film}]]\n\nFrom twelve seconds:\n\n![[${film}#t=12|320]]\n\nparking line\n`;
    const wv = await api(`/api/note?path=${encodeURIComponent(VIDEO_NOTE)}`, json("PUT", { content }));
    check(wv.status === 200, "film: fixture note written", wv.status === 200 ? "" : `HTTP ${wv.status}`);
    const ctx = await newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addCookies(cookies);
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "load" });
    await page.evaluate(() => {
      localStorage.setItem("astrolabe.whatsnewSeen", "9.9.9");
      localStorage.setItem("astrolabe.prefs-sync-off", "1");
      localStorage.setItem("astrolabe.editorLang", "en");
    });
    await page.goto(`${url}/${encodeURIComponent(VIDEO_NOTE.replace(/\.md$/, ""))}`, { waitUntil: "load" });
    await page.waitForSelector(".cm-content", { timeout: 20000 });
    await page.evaluate(([v]) => {
      const view = eval(v);
      if (view) view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf("parking line") } });
    }, [VIEW]);
    // Players ask for their source when they scroll near; the fixture is short.
    const players = async (sel) => {
      // A player inside a scroller asks for its source when it is SHOWN in
      // it (the scroller clips the observer's margin): bring each one on.
      for (let i = 0; i < 2; i++) {
        await page.waitForFunction((s) => document.querySelectorAll(s).length === 2, sel, { timeout: 20000 }).catch(() => {});
        await page.evaluate(([s, n]) => document.querySelectorAll(s)[n]?.scrollIntoView({ block: "center" }), [sel, i]);
        await page.waitForTimeout(500);
      }
      await page.waitForFunction((s) => [...document.querySelectorAll(s)].length === 2 && [...document.querySelectorAll(s)].every((v) => v.readyState >= 1), sel, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(400);
      return page.evaluate((s) => [...document.querySelectorAll(s)].map((v) => ({ w: v.videoWidth, t: v.currentTime, dur: v.duration, src: v.getAttribute("src") ?? "", controls: v.controls, tab: v.tabIndex })), sel);
    };
    const ed = await players(".cm-s-embed-video video");
    check(ed.length === 2 && ed.every((v) => v.w > 0 && v.controls && v.tab === 0), "film: the editor draws both embeds as players", JSON.stringify(ed));
    check(ed[1] !== undefined && Math.abs(ed[1].t - 12) < 0.5, "film: `#t=12` seeks the editor's player to 0:12", ed[1] ? `${ed[1].t.toFixed(2)} s` : "missing");
    await page.screenshot({ path: `${out}/fidelity-film-editor.png` });
    await page.keyboard.press("Control+e");
    await page.waitForSelector(".s-reading__content", { timeout: 10000 });
    const rv = await players(".s-reading__content .s-rv-video video");
    check(rv.length === 2 && rv.every((v) => v.w > 0), "film: the reading view draws both embeds as players", JSON.stringify(rv));
    check(rv[1] !== undefined && Math.abs(rv[1].t - 12) < 0.5, "film: `#t=12` seeks the reading view's player to 0:12", rv[1] ? `${rv[1].t.toFixed(2)} s` : "missing");
    const src = await page.evaluate(() => document.querySelector(".s-reading__content .s-rv-video")?.dataset.embedSrc ?? "");
    check(src === `![[${film}]]`, "film: the player carries its embed's source for the menu and the drag", src);
    await page.screenshot({ path: `${out}/fidelity-film-reading.png` });
    await page.close();
    // A visitor: no cookies. The note is published, so the film is theirs.
    const vctx = await newContext({ viewport: { width: 1280, height: 800 } });
    const vpage = await vctx.newPage();
    await vpage.goto(`${url}/${encodeURIComponent(VIDEO_NOTE.replace(/\.md$/, ""))}`, { waitUntil: "load" });
    const vis = await vpage.waitForFunction(() => { const v = document.querySelector(".s-rv-video video"); return v !== null && v.readyState >= 1 && v.videoWidth > 0; }, null, { timeout: 20000 }).then(() => true, () => false);
    check(vis, "film: a visitor's page of the published note carries a playing-ready player");
    await vpage.screenshot({ path: `${out}/fidelity-film-visitor.png` });
    await vpage.close();
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

  // ── The way back: the status bar's chrome-language key ─────────────────
  // The key names the OTHER language in its own script; a click flips the
  // chrome (<html lang/dir>, the dictionary, the preference) without taking
  // the caret out of the note, and a second click comes home. Then the
  // chord does the same, and the palette finds the row in either language.
  // The switch awaits its dictionary chunk, so these waits are for the chunk.
  {
    const ctx = await newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addCookies(cookies);
    const page = await ctx.newPage();
    await openNote(page, "en");
    const key = page.locator('.s-statusbar:not(.s-statusbar--top) [data-testid="chrome-lang"]');
    const html = () => page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, pref: localStorage.getItem("astrolabe.editorLang"), bar: document.querySelector("footer.s-statusbar")?.getAttribute("aria-label") ?? "" }));
    const caret = () =>
      page.evaluate(([v]) => {
        const view = eval(v);
        return { focused: document.activeElement?.closest(".cm-editor") !== null, head: view ? view.state.selection.main.head : -1, path: location.pathname };
      }, [VIEW]);
    console.log("");
    check((await key.count()) === 1, "lang key: on the status bar, once");
    if ((await key.count()) === 1) {
      await page.locator(".cm-content").first().focus();
      const before = await caret();
      check((await key.textContent())?.trim() === "ع", "lang key: an English chrome shows ع", (await key.textContent()) ?? "");
      check((await key.getAttribute("title")) === "Switch to Arabic · التبديل إلى العربية", "lang key: its title is in both languages", (await key.getAttribute("title")) ?? "");
      await key.click();
      await page.waitForFunction(() => document.documentElement.lang === "ar", null, { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(500);
      const ar = await html();
      check(ar.lang === "ar" && ar.dir === "rtl", "lang key: a click turns the chrome Arabic and right-to-left", JSON.stringify(ar));
      check(ar.bar === arDict.statusBarAria, "lang key: the chrome reads the Arabic dictionary", ar.bar);
      const siteLang = me?.language === "ar" ? "ar" : "en";
      check(ar.pref === (siteLang === "ar" ? null : "ar"), "lang key: it writes the editor-language preference", `${ar.pref} on a ${siteLang} site`);
      check((await key.textContent())?.trim() === "EN", "lang key: an Arabic chrome shows EN", (await key.textContent()) ?? "");
      const during = await caret();
      check(during.focused && during.head === before.head && during.path === before.path, "lang key: the caret and the note stay put", `${JSON.stringify(before)} → ${JSON.stringify(during)}`);
      await page.screenshot({ path: `${out}/fidelity-langkey-ar.png` });
      await key.click();
      await page.waitForFunction(() => document.documentElement.lang === "en", null, { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(500);
      const en = await html();
      check(en.lang === "en" && en.dir !== "rtl" && en.bar === enDict.statusBarAria, "lang key: a second click comes home", JSON.stringify(en));
      check(en.pref === (siteLang === "en" ? null : "en"), "lang key: …to follow-the-site when that is the site's own, not a pin", `${en.pref} on a ${siteLang} site`);
      await page.screenshot({ path: `${out}/fidelity-langkey-en.png` });

      // The chord, from inside the editor.
      await page.locator(".cm-content").first().focus();
      await page.keyboard.press("Control+Alt+Shift+KeyL");
      await page.waitForFunction(() => document.documentElement.lang === "ar", null, { timeout: 10000 }).catch(() => {});
      check((await html()).lang === "ar", "lang chord: Ctrl+Alt+Shift+L switches the chrome", JSON.stringify(await html()));
      await page.keyboard.press("Control+Alt+Shift+KeyL");
      await page.waitForFunction(() => document.documentElement.lang === "en", null, { timeout: 10000 }).catch(() => {});
      check((await html()).lang === "en", "lang chord: …and back", JSON.stringify(await html()));

      // The palette row, found by either language's name in either script.
      for (const q of ["arabic", "عربي", "english", "إنجليزي"]) {
        await page.keyboard.press("Control+KeyP");
        await page.waitForSelector(".s-palette input", { timeout: 5000 }).catch(() => {});
        await page.keyboard.type(q);
        await page.waitForTimeout(400);
        const rows = await page.evaluate(() => [...document.querySelectorAll(".s-palette [role=option]")].map((r) => r.textContent ?? ""));
        check(rows.some((r) => r.includes("التبديل إلى العربية")), `lang palette: "${q}" finds the row`, rows.slice(0, 6).join(" | "));
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
      }
    }
    await page.close();
  }

  // ── Read aloud (docs/read-aloud.md) ────────────────────────────────────
  // A word selected in the editor and read with the chord, then a word
  // selected in the reading view and read with the chip: each time a
  // `POST /api/speak` answers and the floating player shows. With an engine
  // installed (a scratch server run with ASTROLABE_SPEAK_FAKE=1 stands a tone
  // in) the answer must be audio; with none, it must be the 409 that names
  // what to install, and the player must say it is reading with the device's
  // voices — the fallback is part of the contract, not a failure of it.
  {
    const status = (await api("/api/speak/status")).body;
    const installed = !!(status?.engines?.light?.installed || status?.engines?.natural?.installed);
    const ctx = await newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addCookies(cookies);
    const page = await ctx.newPage();
    const answers = [];
    page.on("response", (r) => {
      if (r.url().endsWith("/api/speak") && r.request().method() === "POST") answers.push({ status: r.status(), type: r.headers()["content-type"] ?? "" });
    });
    const heard = async (what, before) => {
      await page.waitForSelector(".s-speak", { timeout: 10000 }).catch(() => {});
      for (let waited = 0; answers.length <= before && waited < 10000; waited += 100) await page.waitForTimeout(100);
      await page.waitForTimeout(500);
      const last = answers[answers.length - 1];
      const player = await page.locator(".s-speak").count();
      if (installed) {
        check(last?.status === 200 && /^audio\//.test(last.type), `read aloud: ${what} — an audio answer arrives`, JSON.stringify(last ?? null));
      } else {
        check(last?.status === 409, `read aloud: ${what} — nothing installed answers 409 (run the scratch server with ASTROLABE_SPEAK_FAKE=1 for the audio half)`, JSON.stringify(last ?? null));
        const note = (await page.locator(".s-speak__note").textContent().catch(() => "")) ?? "";
        check(note !== "", `read aloud: ${what} — the player says whose voices are reading`, note);
      }
      check(player === 1, `read aloud: ${what} — the floating player shows`);
      await page.locator(".s-speak .s-speak__btn").last().click().catch(() => {});
      await page.waitForTimeout(200);
    };
    console.log("");
    await openNote(page, "en");
    await page.locator(".cm-content").first().focus();
    await page.evaluate(([v]) => {
      const view = eval(v);
      const at = view.state.doc.toString().indexOf("parking");
      view.dispatch({ selection: { anchor: at, head: at + "parking".length } });
    }, [VIEW]);
    let before = answers.length;
    await page.keyboard.press("Control+Shift+Period");
    await heard("the chord on an editor selection", before);
    await page.screenshot({ path: `${out}/fidelity-read-aloud-editor.png` });
    await page.keyboard.press("Control+KeyE");
    await page.waitForSelector(".s-reading__body", { timeout: 10000 });
    await page.evaluate(() => {
      const body = document.querySelector(".s-reading__body");
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const at = n.data.indexOf("parking");
        if (at < 0) continue;
        const r = document.createRange();
        r.setStart(n, at);
        r.setEnd(n, at + "parking".length);
        getSelection().removeAllRanges();
        getSelection().addRange(r);
        return;
      }
    });
    await page.waitForSelector(".s-speak-chip", { timeout: 5000 }).catch(() => {});
    check((await page.locator(".s-speak-chip").count()) === 1, "read aloud: a reading-view selection grows the chip");
    before = answers.length;
    await page.locator(".s-speak-chip").click().catch(() => {});
    await heard("the chip on a reading selection", before);
    await page.keyboard.press("Control+KeyE");
    await page.close();
  }

  // ── Read aloud: the device's voices and the three states ───────────────
  // (client/speech/player.ts, deviceVoices.ts). The server's answer is
  // fixed with a route — a 409 "not installed" for French, or a tone — so
  // this runs the same on a server with an engine, without one, or with
  // the fake; and the device's voices are a fake `speechSynthesis` put in
  // before the page's first script (addInitScript), shaped like the list
  // Chromium hands a page on Windows. Asserted, in English and Arabic:
  //   (a) the app's voices speak → the player says nothing about voices;
  //   (b) not installed, a device voice exists → the line names the app's
  //       voices (never "no voice is installed"), names the voice reading,
  //       its ▾ lists every French voice, the choice is heard and REMEMBERED,
  //       and the Install button opens Settings on the Read aloud row, where
  //       this device's French picker shows the same choice;
  //   (c) no device voice speaks French → the line says so and names both
  //       remedies — and with an EMPTY list whose engine never answers (a
  //       Linux Electron), the player still reaches (c) rather than hanging.
  {
    const FAKE_SPEECH = (kind) => `(() => {
      const lists = {
        windows: [
          ["Microsoft David - English (United States)", "en-US", true],
          ["Microsoft Zira - English (United States)", "en-US", false],
          ["Microsoft Hortense - French (France)", "fr-FR", false],
          ["Microsoft Julie - French (France)", "fr-FR", false],
          ["Microsoft Paul - French (France)", "fr-FR", false],
        ],
        english: [["Microsoft David - English (United States)", "en-US", true]],
        none: [],
      };
      const voices = lists[${JSON.stringify(kind)}].map(([name, lang, d]) => ({ name, lang, voiceURI: name, default: d, localService: true }));
      window.__spoken = [];
      class FakeUtterance {
        constructor(text) { this.text = text; this.voice = null; this.lang = ""; this.rate = 1; }
      }
      let current = null;
      const speech = {
        getVoices: () => voices.slice(),
        addEventListener() {},
        removeEventListener() {},
        speak(u) {
          current = u;
          window.__spoken.push({ text: u.text, voice: u.voice ? u.voice.name : null, lang: u.lang });
          if (voices.length === 0) return; // a Linux Electron: accepted, never spoken
          setTimeout(() => { if (current === u) u.onstart && u.onstart({}); }, 20);
          setTimeout(() => { if (current === u) { current = null; u.onend && u.onend({}); } }, 3000); // long enough to still be reading when the ▾ is used
        },
        cancel() { current = null; },
        pause() {},
        resume() {},
        speaking: false,
        pending: false,
        paused: false,
      };
      Object.defineProperty(window, "speechSynthesis", { value: speech, configurable: true });
      window.SpeechSynthesisUtterance = FakeUtterance;
    })()`;
    // A short WAV the route answers with for state (a).
    const tone = (() => {
      const n = 1600;
      const b = Buffer.alloc(44 + n * 2);
      b.write("RIFF", 0, "latin1");
      b.writeUInt32LE(36 + n * 2, 4);
      b.write("WAVEfmt ", 8, "latin1");
      b.writeUInt32LE(16, 16);
      b.writeUInt16LE(1, 20);
      b.writeUInt16LE(1, 22);
      b.writeUInt32LE(16000, 24);
      b.writeUInt32LE(32000, 28);
      b.writeUInt16LE(2, 32);
      b.writeUInt16LE(16, 34);
      b.write("data", 36, "latin1");
      b.writeUInt32LE(n * 2, 40);
      return b;
    })();
    const readParking = async (page) => {
      await page.keyboard.press("Control+KeyE");
      await page.waitForSelector(".s-reading__body", { timeout: 10000 });
      await page.evaluate(() => {
        const body = document.querySelector(".s-reading__body");
        const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const at = n.data.indexOf("parking");
          if (at < 0) continue;
          const r = document.createRange();
          r.setStart(n, at);
          r.setEnd(n, at + "parking line".length);
          getSelection().removeAllRanges();
          getSelection().addRange(r);
          return;
        }
      });
      await page.waitForSelector(".s-speak-chip", { timeout: 5000 });
      await page.locator(".s-speak-chip").click();
      await page.waitForSelector(".s-speak", { timeout: 10000 });
    };
    const stopPlayer = async (page) => {
      await page.locator(".s-speak .s-speak__controls .s-speak__btn").last().click().catch(() => {});
      await page.waitForTimeout(200);
      await page.keyboard.press("Control+KeyE");
      await page.waitForTimeout(300);
    };
    const speakPage = async (kind, answer) => {
      const ctx = await newContext({ viewport: { width: 1280, height: 800 } });
      await ctx.addCookies(cookies);
      await ctx.addInitScript(FAKE_SPEECH(kind));
      const page = await ctx.newPage();
      await page.route("**/api/speak", (route) =>
        route.request().method() !== "POST"
          ? route.continue()
          : answer === "tone"
            ? route.fulfill({ status: 200, contentType: "audio/wav", headers: { "x-speak-lang": "fr", "x-speak-engine": "light" }, body: tone })
            : route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Nothing installed speaks fr", code: "speakNotInstalled", lang: "fr", needs: "light" }) }),
      );
      return { ctx, page };
    };
    console.log("");
    for (const lang of ["en", "ar"]) {
      const tag = (s) => `read aloud (${lang}): ${s}`;
      // (a) the app's own voices answered.
      {
        const { ctx, page } = await speakPage("windows", "tone");
        await openNote(page, lang);
        await readParking(page);
        await page.waitForTimeout(700);
        check((await page.locator(".s-speak__note").count()) === 0, tag("(a) the app's voices speak — nothing is said about voices"));
        await stopPlayer(page);
        await ctx.close();
      }
      // (b) not installed; Windows-shaped device voices.
      {
        const { ctx, page } = await speakPage("windows", "409");
        await openNote(page, lang);
        await readParking(page);
        await page.waitForSelector('.s-speak__note[data-state="device"]', { timeout: 8000 }).catch(() => {});
        const line = (await page.locator('.s-speak__note[data-state="device"]').textContent().catch(() => "")) ?? "";
        check(line.includes(lang === "ar" ? "أصوات التطبيق نفسه" : "The app's own voices"), tag("(b) the line is about the APP's voices"), line);
        check(!/No voice installed|لا صوت مثبّتًا/.test(line), tag("(b) …never the old sentence"), line);
        check(line.includes("Microsoft Hortense"), tag("(b) …and names the device voice reading"), line);
        const spoke = await page.evaluate(() => window.__spoken.at(-1));
        check(spoke?.voice === "Microsoft Hortense - French (France)" && spoke?.lang === "fr-FR", tag("(b) the device was asked for that voice, in French"), JSON.stringify(spoke));
        await page.screenshot({ path: `${out}/read-aloud-device-${lang}.png` });
        await page.locator(".s-speak__voice").click();
        await page.waitForSelector(".s-ctl-pop [role=option]", { timeout: 3000 }).catch(() => {});
        const opts = await page.locator(".s-ctl-pop [role=option]").allTextContents();
        check(opts.length === 3 && opts.some((o) => o.includes("Microsoft Paul")), tag("(b) the ▾ lists every French voice on the device"), opts.join(" | "));
        await page.waitForTimeout(250); // the popover's fade-in
        await page.screenshot({ path: `${out}/read-aloud-picker-${lang}.png` });
        await page.locator(".s-ctl-pop [role=option]", { hasText: "Microsoft Paul" }).click();
        await page.waitForTimeout(300);
        const heard = await page.evaluate(() => window.__spoken.at(-1));
        check(heard?.voice === "Microsoft Paul - French (France)", tag("(b) choosing Paul reads the sentence again in Paul"), JSON.stringify(heard));
        await stopPlayer(page);
        await readParking(page);
        await page.waitForSelector('.s-speak__note[data-state="device"]', { timeout: 8000 }).catch(() => {});
        const again = (await page.locator('.s-speak__note[data-state="device"]').textContent().catch(() => "")) ?? "";
        check(again.includes("Microsoft Paul"), tag("(b) …and the next passage remembers him"), again);
        await page.locator(".s-speak__install").click();
        await page.waitForTimeout(800);
        const settingsFr = (await page.locator('.s-smodal__devvoices [data-lang="fr"]').textContent().catch(() => "")) ?? "";
        check(settingsFr.includes("Microsoft Paul"), tag("(b) Install opens Settings on Read aloud, whose device picker shows the same choice"), settingsFr);
        await page.locator(".s-smodal__devvoices").scrollIntoViewIfNeeded().catch(() => {});
        await page.screenshot({ path: `${out}/read-aloud-settings-${lang}.png` });
        await ctx.close();
      }
      // (c) the device lists voices, none French.
      {
        const { ctx, page } = await speakPage("english", "409");
        await openNote(page, lang);
        await readParking(page);
        await page.waitForSelector('.s-speak__note[data-state="none"]', { timeout: 8000 }).catch(() => {});
        // tf() isolates each filled-in value (U+2068…U+2069); read past that.
        const line = ((await page.locator('.s-speak__note[data-state="none"]').textContent().catch(() => "")) ?? "").replace(/[\u2068\u2069]/g, "");
        check(line.includes(lang === "ar" ? "لا يوجد على هذا الجهاز صوت يتكلم الفرنسية" : "No voice on this device speaks French"), tag("(c) no French voice on the device — said, with the language"), line);
        check((await page.locator(".s-speak__install").count()) === 1, tag("(c) …with the Install remedy"));
        await page.screenshot({ path: `${out}/read-aloud-none-${lang}.png` });
        await ctx.close();
      }
      // (c) an empty list whose engine never answers: a Linux Electron.
      {
        const { ctx, page } = await speakPage("none", "409");
        await openNote(page, lang);
        await readParking(page);
        await page.waitForSelector('.s-speak__note[data-state="none"]', { timeout: 9000 }).catch(() => {});
        check((await page.locator('.s-speak__note[data-state="none"]').count()) === 1, tag("(c) an engine that never answers ends in (c), not silence"));
        await ctx.close();
      }
    }
  }
  // ── Your own voices (docs/read-aloud.md) ───────────────────────────────
  // The voices folder pointed at a fixture OUTSIDE the vault — two fake
  // Piper voices (a two-speaker French model and an English one) and a model
  // with no config beside it — and the scan's answer seen where a reader
  // sees it: the row's count and its skipped line, a French picker in the
  // Read aloud row with a "Your voices" group holding both speakers, and,
  // when a tone stands in for the engines (ASTROLABE_SPEAK_FAKE=1), the
  // player's own ▾ switching an English passage to a found voice. The
  // folder and the voices the owner had are put back afterwards.
  {
    const { mkdtempSync, writeFileSync: write, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "fidelity-voices-"));
    const cfg = (code, extra = {}) =>
      JSON.stringify({ audio: { sample_rate: 22050 }, phoneme_id_map: { _: [0] }, language: { code }, num_speakers: 1, speaker_id_map: {}, ...extra });
    write(join(dir, "fr_FR-gate-low.onnx"), "onnx");
    write(join(dir, "fr_FR-gate-low.onnx.json"), cfg("fr_FR", { num_speakers: 2, speaker_id_map: { ana: 0, bruno: 1 } }));
    write(join(dir, "en_US-gatekeeper-low.onnx"), "onnx");
    write(join(dir, "en_US-gatekeeper-low.onnx.json"), cfg("en_US"));
    write(join(dir, "de_DE-lonely-low.onnx"), "onnx");
    const before = (await api("/api/settings")).body?.effective?.speak ?? {};
    const restore = async () => {
      await api("/api/settings", json("PATCH", { speak: { voicesDir: before.voicesDir ?? null, voices: { fr: before.voices?.fr ?? null, en: before.voices?.en ?? null } } }));
      rmSync(dir, { recursive: true, force: true });
    };
    try {
      const saved = await api("/api/settings", json("PATCH", { speak: { voicesDir: dir } }));
      check(saved.status === 200, "own voices: a folder outside the vault is accepted", JSON.stringify(saved.body).slice(0, 200));
      const refused = await api("/api/settings", json("PATCH", { speak: { voicesDir: "voices" } }));
      check(refused.status === 400 && refused.body?.code === "speakDirRelative", "own voices: a relative folder is refused with a code", JSON.stringify(refused.body));
      const scan = (await api("/api/speak/voices/rescan", { method: "POST" })).body;
      check(scan?.own?.voices?.length === 3, "own voices: the scan finds one voice per speaker", JSON.stringify(scan?.own?.voices?.map((v) => v.name)));
      const fake = scan?.test === true;
      for (const lang of ["en", "ar"]) {
        const dict = lang === "ar" ? arDict : enDict;
        const tag = (s) => `own voices (${lang}): ${s}`;
        const ctx = await newContext({ viewport: { width: 1280, height: 800 } });
        await ctx.addCookies(cookies);
        const page = await ctx.newPage();
        await openNote(page, lang);
        await page.keyboard.press("Control+KeyP");
        await page.waitForSelector(".s-palette input", { timeout: 5000 }).catch(() => {});
        await page.keyboard.type(lang === "ar" ? "أصواتك" : "piper");
        await page.waitForTimeout(400);
        const rows = await page.evaluate(() => [...document.querySelectorAll(".s-palette [role=option]")].map((r) => r.textContent ?? ""));
        check(rows.some((r) => r.includes(dict.cmdOwnVoices)), tag("the palette finds the row"), rows.slice(0, 4).join(" | "));
        await page.keyboard.press("Enter");
        await page.waitForSelector(".s-ownvoices__found", { timeout: 8000 }).catch(() => {});
        const found = page.locator(".s-ownvoices__found");
        check((await found.getAttribute("data-own-voices").catch(() => null)) === "3", tag("the row counts what the scan found"));
        const line = ((await found.textContent().catch(() => "")) ?? "").replace(/[⁨⁩]/g, "");
        check(line.includes(dict.ownSkipNoJson), tag("…and says why a file was skipped"), line);
        // The external speaker is the OPERATOR's to allow (SPEAK_EXTERNAL=on in
        // .env): where it is not, the folded part says so instead of fields.
        await page.locator(".s-ownvoices__external > summary").click().catch(() => {});
        await page.waitForTimeout(200);
        if (scan?.externalAllowed === false) {
          const off = ((await page.locator("[data-external-off]").textContent().catch(() => "")) ?? "").trim();
          check(off === dict.ownExternalOff && (await page.locator(".s-ownvoices__external input").count()) === 0, tag("no SPEAK_EXTERNAL: the external speaker's part names the switch, and offers no fields"), off);
        } else {
          check((await page.locator(".s-ownvoices__external input").count()) > 0, tag("SPEAK_EXTERNAL=on: the external speaker's fields are offered"));
        }
        await page.locator(".s-ownvoices").scrollIntoViewIfNeeded().catch(() => {});
        await page.screenshot({ path: `${out}/own-voices-${lang}.png` });
        // The French picker in the Read aloud row: both speakers, under "Your voices".
        const fr = page.locator('.s-smodal__voices [data-lang="fr"] [role="combobox"]');
        check((await fr.count()) === 1, tag("the Read aloud row grows a French picker"));
        await fr.scrollIntoViewIfNeeded().catch(() => {});
        await fr.click().catch(() => {});
        await page.waitForTimeout(300);
        const listed = ((await page.locator('[role="listbox"]').last().textContent().catch(() => "")) ?? "").replace(/[⁨⁩]/g, "");
        check(listed.includes(dict.speakVoicesYours) && listed.includes("Gate · Ana") && listed.includes("Gate · Bruno"), tag("…listing both speakers under Your voices"), listed);
        await page.screenshot({ path: `${out}/own-voices-picker-${lang}.png` });
        await page.keyboard.press("Escape");
        await ctx.close();
      }
      if (fake) {
        // The player's ▾: an English passage in the built-in voice, then the
        // found one chosen from the player — saved, and the sentence re-asked.
        const ctx = await newContext({ viewport: { width: 1280, height: 800 } });
        await ctx.addCookies(cookies);
        const page = await ctx.newPage();
        const voices = [];
        page.on("response", (r) => {
          if (r.url().endsWith("/api/speak") && r.request().method() === "POST") voices.push(decodeURIComponent(r.headers()["x-speak-voice"] ?? ""));
        });
        await openNote(page, "en");
        await page.keyboard.press("Control+KeyE");
        await page.waitForSelector(".s-reading__body", { timeout: 10000 });
        await page.evaluate(() => {
          const body = document.querySelector(".s-reading__body");
          const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const at = n.data.indexOf("parking");
            if (at < 0) continue;
            const r = document.createRange();
            r.setStart(n, at);
            r.setEnd(n, at + "parking line".length);
            getSelection().removeAllRanges();
            getSelection().addRange(r);
            return;
          }
        });
        await page.waitForSelector(".s-speak-chip", { timeout: 5000 }).catch(() => {});
        await page.locator(".s-speak-chip").click().catch(() => {});
        await page.waitForSelector(".s-speak__engine", { timeout: 10000 }).catch(() => {});
        check((await page.locator(".s-speak__engine").count()) === 1, "own voices: the player names the app's voice with a ▾", voices.join(","));
        await page.locator(".s-speak__engine [role=combobox]").click().catch(() => {});
        await page.waitForTimeout(300);
        await page.locator('[role="option"]', { hasText: "Gatekeeper" }).first().click().catch(() => {});
        await page.waitForFunction(() => document.querySelector(".s-speak__engine")?.getAttribute("data-voice")?.startsWith("own:"), null, { timeout: 8000 }).catch(() => {});
        check(voices.at(-1) === "own:en_US-gatekeeper-low.onnx", "own voices: choosing a found voice in the player re-reads the sentence in it", voices.join(","));
        const settled = (await api("/api/settings")).body?.effective?.speak?.voices?.en;
        check(settled === "own:en_US-gatekeeper-low.onnx", "own voices: …and it is saved as English's voice", String(settled));
        await page.screenshot({ path: `${out}/own-voices-player-en.png` });
        await page.locator(".s-speak .s-speak__controls .s-speak__btn").last().click().catch(() => {});
        await ctx.close();
      } else {
        console.log("  (own voices: the player's ▾ half needs ASTROLABE_SPEAK_FAKE=1 on the scratch server)");
      }
    } finally {
      await restore();
    }
  }
} finally {
  await cleanup();

  for (const c of contexts) await c.close().catch(() => {});
  await browser.close();
}

console.log(fail.length === 0 ? "\ncheck-fidelity: all green" : `\ncheck-fidelity: ${fail.length} failure(s)`);
process.exit(fail.length === 0 ? 0 : 1);
