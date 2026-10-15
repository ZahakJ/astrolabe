// GATE: no Arabic glyph is cut, crossed or collided.
//   node scripts/check-ink.mjs [http://localhost:6801] [outdir]
//   env: CHROMIUM=/usr/bin/chromium
//        ASTROLABE_PASSWORD=<pw>  — when the instance sets ADMIN_PASSWORD_HASH;
//                                 the blog half runs only then, because in open
//                                 local mode every visitor is the admin
//        INK_THEMES=all | id,id   — the rooms to walk (default: five)
// Exits 1 on any finding.
//
// Arabic text was being cut through its letters. Three defects, one family,
// and none of them visible to a gate that reads layout boxes, because the
// layout box of an Arabic line is the font's content area and the marks live
// outside it:
//
//   · a truncating label (`white-space: nowrap; overflow: hidden;
//     text-overflow: ellipsis`) clipped VERTICALLY as well as sideways, so a
//     shadda or a damma over a tab title, an outline row or a tree label was
//     sliced off — and `overflow: hidden` turned off the flex item's automatic
//     minimum, so a long note's outline squeezed every row to half a line and
//     cut each heading through its middle;
//   · wrapped display text (headings, post and card titles) at Latin leading,
//     1.1–1.3: the kasra under one line met the damma over the next, and the
//     hairline under an h1 ran through its descenders;
//   · a clamped snippet clipped at its padding box, which let the hidden third
//     line's marks show through the padding as stray dots.
//
// The fixes are tokens (client/styles/tokens.css, "Leading for a script with
// marks above and below") and one pattern (`overflow: clip visible`), and
// tests/inkCss.test.ts holds the stylesheets to the pattern without a
// browser. This gate holds the RESULT: it writes two notes that carry every
// shape that broke — a vocalised h1 long enough to wrap, thirty headings so
// the outline has to scroll, callouts, a table, lists, a link each way so the
// backlinks panel has a vocalised snippet — sets the instance to Arabic, and
// measures every Arabic line's INK (scripts/ink-measure.mjs) in the editor,
// the reading view, the phone shell and, as a signed-out reader, the blog,
// scrolling each long surface through, in each room. Language, layout and
// fixtures are restored however the run ends.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { measureInk } from "./ink-measure.mjs";
import { THEMES } from "../shared/themes.ts";

const [url = "http://localhost:6801", out = "scratchpad/ink"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const DIR = "check-ink/مَكَاتِيبُ مُشَكَّلَةٌ";
const A = `${DIR}/فِي حُدُودِ اليَقِينِ.md`;
const B = `${DIR}/رِسَالَةٌ قَصِيرَةٌ.md`;

const vocal =
  "إِنَّ اللُّغَةَ العَرَبِيَّةَ لُغَةٌ شَرِيفَةٌ، وَفِيهَا حُرُوفٌ تَنْزِلُ تَحْتَ السَّطْرِ كَالْيَاءِ وَالْجِيمِ وَالْعَيْنِ، " +
  "وَأُخْرَى تَعْلُو فَوْقَهُ كَالْأَلِفِ وَاللَّامِ وَالْكَافِ؛ ﴿إِنَّ مَعَ الْعُسْرِ يُسْرًا﴾ وَلِلشَّدَّةِ وَالتَّنْوِينِ مَكَانُهُمَا فَوْقَ الحَرْفِ.";
const sections = Array.from(
  { length: 30 },
  (_, i) => `${i % 3 === 0 ? "##" : "###"} البَابُ ${i + 1}: فِي أُصُولِ الرِّيَاضِيَّاتِ وَحُدُودِ البُرْهَانِ\n\n${vocal}\n`,
).join("\n");
const NOTE_A = `---
publish: true
tags: [مُشَكَّلٌ, check-ink]
---
# عُنْوَانٌ طَوِيلٌ بِالتَّشْكِيلِ الكَامِلِ: فِي أُصُولِ الرِّيَاضِيَّاتِ وَحُدُودِ اليَقِينِ

${vocal} ${vocal}

> [!note] مُلَاحَظَةٌ مُهِمَّةٌ جِدًّا عَنِ البُرْهَانِ وَحُدُودِهِ فِي الأَنْسَاقِ الصُّورِيَّةِ
> ${vocal}

> [!quote] اقْتِبَاسٌ
> أَنَا الَّذِي نَظَرَ الأَعْمَى إِلَى أَدَبِي ** وَأَسْمَعَتْ كَلِمَاتِي مَنْ بِهِ صَمَمُ

| العَمُودُ الأَوَّلُ | العَمُودُ الثَّانِي |
| --- | --- |
| خَلِيَّةٌ فِيهَا جِيمٌ وَيَاءٌ | ﴿قُلْ هُوَ اللَّهُ أَحَدٌ﴾ |

- عُنْصُرٌ أَوَّلُ: يَجِيءُ بَعْدَهُ [[رِسَالَةٌ قَصِيرَةٌ]]
- عُنْصُرٌ ثَانٍ: ==تَظْلِيلٌ عَلَى نَصٍّ مُشَكَّلٍ== وَ**خَطٌّ عَرِيضٌ**

${sections}`;
const NOTE_B = `---
publish: true
---
# رِسَالَةٌ قَصِيرَةٌ

${vocal} وَفِي [[فِي حُدُودِ اليَقِينِ]] تَفْصِيلُ ذَلِكَ: ${vocal}
`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const fail = [];
const report = (surface, rows) => {
  for (const r of rows) {
    const line = `${surface}: ${r.kind} ${r.where} [${r.detail}] by ${r.by} (fs ${r.fs}, lh ${r.lh}) ×${r.count} «${r.text}»`;
    fail.push(line);
    console.log(`  FAIL  ${line}`);
  }
  if (rows.length === 0) console.log(`  ok    ${surface}`);
};

const admin = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const api = (path, init) =>
  admin.request.fetch(`${url}${path}`, init).then(async (r) => ({ status: r.status(), body: await r.json().catch(() => null) }));
const json = (method, body) => ({ method, headers: { "content-type": "application/json" }, data: JSON.stringify(body) });

// UNSET IS A VALUE (check-caret says why): the run PATCHes back exactly what
// it found, `null` included.
let restore = null;
let wrote = false;
const cleanup = async () => {
  if (restore) await api("/api/settings", json("PATCH", restore)).catch(() => {});
  if (wrote) {
    for (const p of [A, B]) {
      await api(`/api/note?path=${encodeURIComponent(p)}&permanent=true`, { method: "DELETE" }).catch(() => {});
    }
    await api(`/api/folder?path=${encodeURIComponent(DIR)}&permanent=true`, { method: "DELETE" }).catch(() => {});
    await api(`/api/folder?path=check-ink&permanent=true`, { method: "DELETE" }).catch(() => {});
  }
  await browser.close().catch(() => {});
};

const settle = async (page) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
};

/** Measure, then page the main scroller through and measure again: the marks
 *  that break are wherever the vocalised text happens to be. */
async function walk(page, surface, scrollerSel) {
  const rows = [];
  const seen = new Set();
  for (let step = 0; step < 8; step++) {
    await settle(page);
    for (const r of await page.evaluate(measureInk)) {
      const k = `${r.kind}|${r.where}|${r.by}`;
      if (!seen.has(k)) {
        seen.add(k);
        rows.push(r);
      }
    }
    const moved = await page.evaluate((sel) => {
      const s = document.querySelector(sel);
      if (!s || s.scrollTop + s.clientHeight >= s.scrollHeight - 2) return false;
      s.scrollTop += s.clientHeight * 0.8;
      return true;
    }, scrollerSel);
    if (!moved) break;
  }
  report(surface, rows);
}

const notePath = (p) => `/${p.replace(/\.md$/, "").split("/").map(encodeURIComponent).join("/")}`;

try {
  let me = (await api("/api/me")).body;
  const password = process.env.ASTROLABE_PASSWORD ?? "";
  if (!me?.admin) {
    if (!password) {
      console.error("check-ink: not an admin session. Run it against open local mode, or set ASTROLABE_PASSWORD.");
      await cleanup();
      process.exit(2);
    }
    const res = await api("/api/login", json("POST", { password }));
    if (res.status !== 200) {
      console.error(`check-ink: login failed (${res.status}). Refusing.`);
      await cleanup();
      process.exit(2);
    }
    me = (await api("/api/me")).body;
  }
  const raw = (await api("/api/settings")).body ?? {};
  restore = { language: raw.language ?? null, publicLayout: raw.publicLayout ?? null };
  await api("/api/settings", json("PATCH", { language: "ar", ...(password ? { publicLayout: "blog" } : {}) }));
  for (const [p, content] of [[A, NOTE_A], [B, NOTE_B]]) {
    const w = await api(`/api/note?path=${encodeURIComponent(p)}`, json("PUT", { content }));
    if (w.status !== 200) {
      console.error(`check-ink: could not write ${p} (${w.status}).`);
      await cleanup();
      process.exit(2);
    }
  }
  wrote = true;

  const rooms =
    process.env.INK_THEMES === "all"
      ? [...THEMES]
      : (process.env.INK_THEMES?.split(",") ?? ["astrolabe-dark", "iron-gall", "parchment", "void", "solar"]);

  for (const theme of rooms) {
    console.log(`\n${theme}`);
    const prep = async (ctx) => {
      await ctx.addInitScript((th) => {
        try {
          localStorage.setItem("astrolabe.theme", th);
          localStorage.setItem("astrolabe.site-theme", th);
          localStorage.setItem("astrolabe.whatsnew", "off");
          localStorage.setItem("astrolabe.reading", "false");
        } catch {}
      }, theme);
    };
    // The desk: the editor, then the same note read.
    await prep(admin);
    const page = await admin.newPage();
    page.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 200)));
    await page.goto(`${url}${notePath(A)}`, { waitUntil: "load" });
    await page.waitForSelector(".cm-content", { timeout: 25000 });
    await page.waitForTimeout(1500);
    await walk(page, `${theme} editor`, ".cm-scroller");
    await page.screenshot({ path: `${out}/ink-${theme}-editor.png` });
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+e");
    await page.waitForSelector(".s-rv", { timeout: 10000 }).catch(() => {});
    const scroller = await page.evaluate(() => {
      for (let a = document.querySelector(".s-rv"); a; a = a.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(a).overflowY) && a.scrollHeight > a.clientHeight) {
          a.setAttribute("data-ink-scroller", "");
          return true;
        }
      }
      return false;
    });
    await walk(page, `${theme} reading`, scroller ? "[data-ink-scroller]" : ".s-rv");
    await page.screenshot({ path: `${out}/ink-${theme}-reading.png` });
    await page.keyboard.press("Control+e");
    await page.close();

    // The phone shell, signed in.
    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      storageState: await admin.storageState(),
    });
    await prep(phone);
    const pp = await phone.newPage();
    await pp.goto(`${url}${notePath(A)}`, { waitUntil: "load" });
    await pp.waitForTimeout(2000);
    await walk(pp, `${theme} phone`, ".cm-scroller");
    await pp.screenshot({ path: `${out}/ink-${theme}-phone.png` });
    await phone.close();

    // The blog, as a reader who has never signed in.
    if (password) {
      for (const [w, h] of [[1440, 900], [390, 844]]) {
        const reader = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 700 });
        await prep(reader);
        const rp = await reader.newPage();
        await rp.goto(`${url}/`, { waitUntil: "load" });
        await rp.waitForTimeout(1500);
        await walk(rp, `${theme} blog index ${w}`, ".s-blog");
        await rp.goto(`${url}${notePath(A)}`, { waitUntil: "load" });
        await rp.waitForTimeout(1500);
        await walk(rp, `${theme} blog article ${w}`, ".s-blog");
        await rp.screenshot({ path: `${out}/ink-${theme}-blog-${w}.png` });
        await reader.close();
      }
    }
  }
} finally {
  await cleanup();
}

console.log(
  fail.length === 0
    ? "\ncheck-ink: OK — no Arabic mark is cut, crossed by a rule, or run into the next line."
    : `\ncheck-ink: ${fail.length} FAILED`,
);
process.exit(fail.length === 0 ? 0 : 1);
