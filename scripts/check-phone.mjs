// GATE: the phone's four promises, measured on the real app.
//
//   node scripts/check-phone.mjs [http://localhost:8190] [outdir]
//   env: CHROMIUM=/usr/bin/chromium
//        ASTROLABE_PASSWORD=<pw>  — when the instance sets ADMIN_PASSWORD_HASH;
//                                without an admin session half these surfaces
//                                do not exist and the run refuses loudly
//                                rather than "passing".
// Exits 1 on any miss. Run it like check-fidelity / check-a11y.
//
// WHY THIS EXISTS. The phone audit that opened 3.18 found thirty-three
// defects across ten surfaces, and not one of them was invisible — they were
// a 40px button here, a 14px field there, a header that ran off the left edge
// in Arabic. Every one would have been caught by measuring, and nothing
// measured, because the properties involved are ones a screenshot review reads
// as "fine" and a unit test cannot see at all. So: a browser, a phone-shaped
// viewport, and four questions asked of every surface.
//
// THE FOUR QUESTIONS (DESIGN.md, "Below 700px, or on ANY coarse pointer";
// CONTRACTS.md, "THE TOUCH SHELL IS 44px EVERYWHERE"):
//
//   1. NOTHING OVERFLOWS SIDEWAYS. The document never scrolls horizontally,
//      and no element hangs past either edge of the window. A strip that
//      declares `overflow-x: auto` is exempt and so is everything inside it —
//      the tab row, a wide table, a heat map: those SCROLL, which is a
//      design, not a defect.
//   2. EVERY SHELL TARGET IS ≥44px. Height always; width too when the control
//      has no text in it, because an icon button is square or it is nothing.
//      What is NOT a shell target: prose (a link in a sentence sets the line
//      height of the paragraph around it — DESIGN.md says so), a native
//      checkbox or radio inside a label that is itself ≥44px (the label is
//      what a finger lands on), and a data picture's cells (the Sigils heat
//      map is a year of a habit in 12px squares; a 44px cell is not a bigger
//      chart, it is no chart).
//   3. EVERY TEXT FIELD IS ≥16px. Under 16, iOS Safari zooms the page into
//      the field on focus and leaves it there, and the reader then types into
//      a vault that has slid sideways under the keyboard.
//   4. NOTHING COVERS A TARGET. `elementFromPoint` at each target's centre
//      answers that target (or something inside it). This is the one that
//      caught the drawer's own ☰ — labelled "Close Notes sidebar" and painted
//      under the drawer, so the tap it received went to the wordmark
//      underneath — and the outline pane that covered Settings and the ⋯.
//
// TEN SURFACES × TWO LANGUAGES, at 390×844 with `isMobile` and `hasTouch`, so
// `(pointer: coarse)` and `(hover: none)` both answer the way they do on a
// phone. Arabic is not a translation pass: it is a different layout, and
// three of the audit's findings (the shelf header off the left edge, the tag
// strip's mask, the status bar's packing) existed in Arabic only.

import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const [url = "http://localhost:8190", out = "shots"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

/** The ten surfaces, by the path that opens each. `null` means "whatever the
 *  instance opens at", which is the home surface a reader actually lands on. */
const SURFACES = [
  ["editor", "/"],
  ["reading", "/?rv=1"],
  ["graph", "/graph"],
  ["media", "/media"],
  ["sigils", "/sigils"],
  ["calendar", "/calendar"],
  ["review-week", "/review-week"],
  ["orbits", "/orbits"],
  ["library", "/library"],
  ["drawer", "/?drawer=1"],
];

/** Everything the four questions are asked with, as one page function. Kept
 *  as a string and `evaluate`d so the whole walk happens in one round trip:
 *  a per-element round trip over ~1,500 nodes × 20 runs is minutes. */
const MEASURE = String.raw`(() => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const vh = de.clientHeight;
  const out = { overflow: [], small: [], fonts: [], covered: [], docScroll: 0 };

  if (de.scrollWidth > vw + 1) out.docScroll = de.scrollWidth - vw;

  const sel = (el) => {
    if (!el || !el.tagName) return String(el);
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    const cls = typeof el.className === "string" ? el.className.trim() : "";
    if (cls) s += "." + cls.split(/\s+/).slice(0, 3).join(".");
    return s;
  };

  /** Does this element sit inside something that scrolls sideways on purpose?
   *  Its box may then hang outside the window — that is what scrolling IS. */
  const inScroller = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden") return true;
    }
    return false;
  };

  /** Prose, where the 44px floor does not apply: a link in a sentence would
   *  set the line height of the paragraph around it. */
  const PROSE = ".cm-content, .s-rv-prose, .s-rv p, .s-rv li, .s-blog-article, .s-marginalia__list";
  /** A data picture, whose cells are marks and not controls. */
  const CHART = ".s-rv-routine__heat, .s-graph__nav, .s-tracker";

  const els = Array.from(document.querySelectorAll("*"));
  for (const el of els) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    // Clipped out of sight (the sr-only utility, the skip link at rest).
    if (cs.clipPath && cs.clipPath !== "none" && r.width <= 2) continue;

    // ── 1. sideways overflow
    if ((r.right > vw + 1 || r.left < -1) && !inScroller(el)) {
      out.overflow.push([sel(el), Math.round(r.left), Math.round(r.right)]);
    }

    const tag = el.tagName;
    const role = el.getAttribute("role");
    const interactive =
      tag === "BUTTON" ||
      (tag === "A" && el.hasAttribute("href")) ||
      tag === "SUMMARY" ||
      tag === "SELECT" ||
      tag === "TEXTAREA" ||
      (tag === "INPUT" && el.type !== "hidden") ||
      ["button", "link", "menuitem", "menuitemcheckbox", "tab", "switch", "option"].includes(role);

    if (interactive && !el.closest(PROSE) && !el.closest(CHART) && !el.disabled) {
      // A native checkbox/radio is drawn by the platform at its own size; the
      // LABEL around it is the target, and the label is measured on its own.
      const boxed = tag === "INPUT" && (el.type === "checkbox" || el.type === "radio");
      const owner = boxed ? el.closest("label") : null;
      const box = owner ? owner.getBoundingClientRect() : r;
      // Width is required only of a control with no words in it: a tab named
      // "Ka" is as wide as "Ka" and that is correct.
      const wordy = (el.textContent || "").trim().length > 1;
      const tooShort = box.height < 43.5;
      const tooNarrow = !wordy && box.width < 43.5;
      if (tooShort || tooNarrow) {
        out.small.push([sel(el), +box.width.toFixed(1), +box.height.toFixed(1)]);
      }

      // ── 4. covered
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx > 0 && cy > 0 && cx < vw && cy < vh && !inScroller(el)) {
        const hit = document.elementFromPoint(cx, cy);
        if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
          out.covered.push([sel(el), sel(hit)]);
        }
      }
    }

    // ── 3. text fields
    const typed = tag === "INPUT" ? el.type : "";
    if (
      tag === "TEXTAREA" ||
      (tag === "INPUT" && ["text", "search", "number", "email", "password", "url", "tel", ""].includes(typed))
    ) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 15.95) out.fonts.push([sel(el), +fs.toFixed(2)]);
    }
  }

  const once = (rows) => {
    const seen = new Set();
    return rows.filter((row) => {
      const k = JSON.stringify(row);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  out.overflow = once(out.overflow);
  out.small = once(out.small);
  out.fonts = once(out.fonts);
  out.covered = once(out.covered);
  return out;
})()`;

const fail = [];
const pass = [];
function check(ok, what, detail = "") {
  (ok ? pass : fail).push(what);
  console.log(`${ok ? "  ok  " : "  MISS"} ${what}${ok || detail === "" ? "" : `\n        ${detail}`}`);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const contexts = [];
const newContext = async (opts) => {
  const ctx = await browser.newContext(opts);
  contexts.push(ctx);
  return ctx;
};

try {
  // ── An admin session, or nothing worth measuring ─────────────────────────
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

  let me = (await api("/api/me")).body;
  if (!me?.admin) {
    const password = process.env.ASTROLABE_PASSWORD ?? process.env.VELLUM_PASSWORD ?? "";
    if (!password) {
      console.error("check-phone: not an admin session and no ASTROLABE_PASSWORD — most surfaces would not mount.");
      process.exit(1);
    }
    const res = await api("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.status !== 200) {
      console.error(`check-phone: login failed (${res.status}).`);
      process.exit(1);
    }
    me = (await api("/api/me")).body;
    if (!me?.admin) {
      console.error("check-phone: still not an admin after login.");
      process.exit(1);
    }
  }
  const cookies = await first.cookies();

  for (const lang of ["en", "ar"]) {
    const ctx = await newContext({
      ...devices["Pixel 7"],
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await ctx.addCookies(cookies);
    // The deck and the sync poller are not what is being measured, and a
    // modal over every surface would measure the modal ten times.
    await ctx.addInitScript((l) => {
      try {
        localStorage.setItem("astrolabe.whatsnewSeen", "9.9.9");
        localStorage.setItem("astrolabe.prefs-sync-off", "1");
        localStorage.setItem("astrolabe.editorLang", l);
      } catch {
        /* a private window: the defaults are fine */
      }
    }, lang);

    const page = await ctx.newPage();
    console.log(`\n── ${lang} ──────────────────────────────────────────────`);

    for (const [name, path] of SURFACES) {
      const drawer = path.endsWith("drawer=1");
      const reading = path.endsWith("rv=1");
      await page.goto(url + path.replace(/\?(drawer|rv)=1$/, ""), { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      if (drawer) {
        await page.evaluate(() => {
          document.querySelector(".s-drawer-btn")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await page.waitForTimeout(500);
      }
      if (reading) {
        await page.keyboard.press("Control+e");
        await page.waitForTimeout(800);
      }

      const r = await page.evaluate(MEASURE);
      await page.screenshot({ path: `${out}/phone-${lang}-${name}.png` });

      const tag = `${lang} ${name}`;
      check(r.docScroll === 0, `${tag}: the page does not scroll sideways`, `${r.docScroll}px of it`);
      check(
        r.overflow.length === 0,
        `${tag}: nothing hangs past an edge`,
        r.overflow.slice(0, 6).map((o) => `${o[0]} [${o[1]}…${o[2]}]`).join("\n        "),
      );
      check(
        r.small.length === 0,
        `${tag}: every shell target is 44px`,
        r.small.slice(0, 8).map((s) => `${s[0]} ${s[1]}×${s[2]}`).join("\n        "),
      );
      check(
        r.fonts.length === 0,
        `${tag}: every field is 16px`,
        r.fonts.slice(0, 8).map((f) => `${f[0]} ${f[1]}px`).join("\n        "),
      );
      check(
        r.covered.length === 0,
        `${tag}: no target is under another layer`,
        r.covered.slice(0, 8).map((c) => `${c[0]} ← ${c[1]}`).join("\n        "),
      );
    }
    await page.close();
  }
} finally {
  for (const c of contexts) await c.close().catch(() => {});
  await browser.close();
}

console.log(
  fail.length === 0
    ? `\ncheck-phone: all green (${pass.length} checks)`
    : `\ncheck-phone: ${fail.length} failure(s) of ${pass.length + fail.length}`,
);
process.exit(fail.length === 0 ? 0 : 1);
