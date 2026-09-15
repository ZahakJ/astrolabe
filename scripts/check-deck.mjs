// check-deck — every what's-new slide, both languages, measured.
//
// The deck is drawings and live demos, and a drawing can look right in the
// language it was drawn in and run off its frame in the other: 3.13.0's
// ayah slide lost its verse off the right edge, 3.15.0's manual slide put its
// Arabic column outside the frame and its update chip's label outside the
// chip. Nobody looked at every slide in Arabic before shipping. This gate
// does, so a release cannot ship a slide that has not been measured.
//
// Against a RUNNING instance (the built dist; an admin password), like the
// other browser gates:
//   CHROMIUM=/usr/bin/chromium node scripts/check-deck.mjs http://127.0.0.1:8126 test
//
// For every release in the catalogue, in English and then Arabic, the loop
// is frozen at the point where every part has arrived, and:
//   · no <text> may leave the drawing's frame (the 12px inset the frame rect
//     draws at);
//   · a <text> that follows a chip-sized rect in the same group (a button, a
//     pill: 40–260px wide, under 60 tall) must sit inside it;
//   · no two <text> boxes may overlap;
//   · a live demo may not overflow the stage sideways.
// Arabic inside an SVG <text> is refused when it is set right-to-left
// (direction="rtl", text-anchor="end") or is a whole sentence: the stage
// forces drawings left-to-right and those are the two shapes that break
// (the rule releaseNotes.ts states). A short label anchored at its start is
// fine; prose goes in a DOM demo.
import { chromium } from "playwright";

const url = (process.argv[2] || "").replace(/\/$/, "");
const password = process.argv[3] || "";
if (!url || !password) {
  console.error("usage: node scripts/check-deck.mjs <url> <admin password>");
  process.exit(2);
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
let failed = 0;
const fail = (m) => { failed++; console.log(`  FAIL  ${m}`); };
for (const lang of ["en", "ar"]) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 860 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(async ({ password, lang }) => {
    await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    // Every release in the catalogue: a device that has seen nothing.
    localStorage.setItem("astrolabe.whatsnewSeen", "0.0.1");
    localStorage.setItem("astrolabe.tabs", JSON.stringify({ tabs: [], open: null }));
    localStorage.setItem("astrolabe.editorLang", lang);
    localStorage.setItem("astrolabe.prefs-sync-off", "1");
  }, { password, lang });
  await page.goto(url + "/", { waitUntil: "load" });
  await page.waitForSelector(".s-wn", { timeout: 15000 }).catch(() => null);
  if ((await page.locator(".s-wn").count()) === 0) { fail(`${lang}: the deck did not open`); await ctx.close(); continue; }
  await page.addStyleTag({ content: ".s-wn-stage * { animation-play-state: paused !important; animation-delay: -5.4s !important; } .s-wn__body { animation: none !important; }" });
  const total = await page.locator(".s-wn__dot").count();
  for (let i = 0; i < total; i++) {
    if (i > 0) { await page.locator(".s-wn__nav .s-btn--accent").click(); await page.waitForTimeout(350); }
    const version = (await page.locator(".s-wn__version").innerText()).replace(/[^\d.]/g, "");
    const title = await page.locator(".s-wn__title").innerText();
    const r = await page.evaluate(() => {
      const stage = document.querySelector(".s-wn-stage");
      const out = [];
      const svg = stage.querySelector("svg");
      if (svg) {
        // Screen boxes, not getBBox: a text inside a translated <g> reports
        // its own coordinates from getBBox, and every part of a drawing that
        // lays itself out with transforms would read as out of frame.
        const S = svg.getBoundingClientRect();
        const k = S.width / svg.viewBox.baseVal.width; // CSS px per user unit
        const inset = 11 * k;
        const box = (e) => e.getBoundingClientRect();
        const texts = [...svg.querySelectorAll("text")].filter((t) => box(t).width > 0);
        for (const t of texts) {
          const b = box(t); const txt = (t.textContent || "").trim();
          const arabic = /[\u0600-\u06FF]/.test(txt);
          if (arabic && (t.getAttribute("direction") === "rtl" || t.getAttribute("text-anchor") === "end" || t.closest("[direction='rtl']"))) out.push(`Arabic text set right-to-left inside a drawing (use a DOM demo): "${txt.slice(0, 30)}"`);
          if (arabic && txt.split(/\s+/).filter((w) => /[\u0600-\u06FF]/.test(w)).length > 6) out.push(`an Arabic sentence inside a drawing (use a DOM demo): "${txt.slice(0, 30)}"`);
          if (b.left < S.left + inset || b.right > S.right - inset || b.top < S.top + inset || b.bottom > S.bottom - inset) out.push(`out of frame: "${txt.slice(0, 30)}"`);
          const prev = t.previousElementSibling;
          if (prev && prev.tagName === "rect") { const q = box(prev); if (q.width >= 40 * k && q.width < 260 * k && q.height >= 14 * k && q.height < 60 * k && (b.left < q.left - 1 || b.right > q.right + 1)) out.push(`outside its chip: "${txt.slice(0, 30)}"`); }
        }
        for (let a = 0; a < texts.length; a++) for (let c = a + 1; c < texts.length; c++) {
          const A = box(texts[a]), B = box(texts[c]);
          const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left), oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
          if (ox > 2 && oy > 2) out.push(`overlap: "${(texts[a].textContent || "").trim().slice(0, 18)}" × "${(texts[c].textContent || "").trim().slice(0, 18)}"`);
        }
      } else {
        const s = stage.getBoundingClientRect();
        for (const e of stage.querySelectorAll("*")) { const b = e.getBoundingClientRect(); if (b.width && (b.left < s.left - 1 || b.right > s.right + 1)) { out.push(`demo overflows the stage: ${e.tagName.toLowerCase()}.${[...e.classList][0] || ""}`); break; } }
      }
      return out;
    });
    const label = `${lang} ${version} #${i + 1} "${title.slice(0, 40)}"`;
    if (r.length) for (const m of r) fail(`${label}: ${m}`); else console.log(`  ok    ${label}`);
  }
  await ctx.close();
}
await browser.close();
console.log(failed ? `\nDECK FAILED (${failed})` : "\nDECK OK");
process.exit(failed ? 1 : 0);
