// GATE: the phone shell, driven like a phone — and measured like one.
//
//   node scripts/check-phone.mjs [http://localhost:8190] [outdir]
//   env: CHROMIUM=/usr/bin/chromium
//        ASTROLABE_PASSWORD=<pw>  — when the instance sets ADMIN_PASSWORD_HASH;
//                                without an admin session half these screens
//                                do not exist and the run refuses loudly
//                                rather than "passing".
// Exits 1 on any miss. Run it like check-fidelity / check-a11y.
//
// WHY IT WAS REWRITTEN (3.26.0). The gate this replaces measured four
// properties — 44px targets, 16px fields, nothing sideways, nothing covered —
// across ten surfaces, two languages and two postures, and it was green on
// the day the audit found that a tap on a note in the phone's drawer OPENED
// NOTHING: the back-gesture guard's `history.back()` landed after the router's
// `pushState` and restored the page the reader had just left. Every property
// it measured was true of a shell that did not work. So the measurements stay
// — they still catch what they caught — and beside them the gate now asks the
// phone shell (client/phone/) the questions a reader asks with their thumb:
//
//   · A TREE TAP CHANGES THE URL AND THE TITLE. The P0, as an assertion.
//   · BACK POPS A SCREEN — the browser's own back, which is the Android back
//     button and the OS back gesture — and lands on the list it came from.
//   · BACK CLOSES A SHEET before it pops the screen under it.
//   · PUBLISH ASKS. The note sheet's Publish raises a question, and saying
//     no leaves the note unpublished (the audit's harness published a note
//     by accident through the old shell's one-tap pill).
//   · A LONG PRESS IS A MENU (an action sheet), not a tap.
//   · THE SHELL IS THE PHONE'S: no tab strip, no status bar, no pane grip, no
//     sidebar drawer anywhere in the document.
//   · A DEEP LINK OPENS ITS NOTE, and back from it comes home to Today
//     instead of leaving the app.
//   · ROUND 2 (3.27.0) — EVERY SURFACE IS A SCREEN, and each is asked what a
//     thumb asks of it: Study starts the session full screen; a Sigil tick
//     answers at once and the server has it; a book wears one bar of its
//     own and its scrubber moves the page; ⋯ is an action sheet Back closes;
//     the theme picker (a layer on <body>) takes a history entry; a Settings
//     section saves, and Back with an edit asks first and keeps the edit on
//     Cancel; the tag picker writes the tag into the note; a list comes back
//     scrolled where it was left. (Classic, the drawer shell kept for one
//     release, was deleted with this round; so was its pass here.)
//
// THE MATRIX. Every screen and sheet is measured and photographed in both
// languages on four shapes: a Pixel 7 (412×915, a finger); a 720×820 phone at
// DPR 1.5 with a STYLUS — primary pointer coarse, `any-pointer: fine`, the
// posture that was once served the desktop shell (a blink setting on its own
// browser: `hasTouch` would override the pointer media); and a touch tablet in
// both orientations (820×1180 and 1180×820), where the shell draws two columns
// and the note sheet slides over from the trailing edge.
//
// THE MEASUREMENTS (DESIGN.md, "Below 700px, or on ANY coarse pointer";
// CONTRACTS.md, "The phone shell"):
//
//   1. NOTHING OVERFLOWS SIDEWAYS. A strip that scrolls on purpose
//      (`overflow-x: auto`: the tag chips, a wide table) is exempt.
//   2. EVERY SHELL TARGET IS ≥44px. Height always; width too when the control
//      has no words in it. Prose, a native checkbox inside a ≥44px label and
//      a data picture's cells are not shell targets.
//   3. EVERY TEXT FIELD IS ≥16px (under it iOS zooms into the field).
//   4. NOTHING COVERS A TARGET — `elementFromPoint` at each target's centre
//      answers the target itself. Under an open sheet, only the sheet's own
//      targets are asked (the page under it is inert on purpose).

import { chromium, devices } from "playwright";
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { zipSync } from "../shared/zip.ts";

const [url = "http://localhost:8190", out = "shots"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const MEASURE = String.raw`((scope) => {
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
  const inScroller = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden") return true;
    }
    return false;
  };
  const PROSE =
    ".cm-content, .s-rv-prose, .s-rv p, .s-rv li, .s-rv-p, .s-rv-list, .s-rv-quote," +
    " .s-blog-article, .s-marginalia__list, .s-feeds__prose";
  const CHART = ".s-rv-routine__heat, .s-graph__nav, .s-tracker";
  const root = scope ? document.querySelector(scope) : document.body;
  if (!root) return out;
  for (const el of root.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
    if (el.closest("[inert]")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.bottom < 0 || r.top > vh) continue;
    if (cs.clipPath && cs.clipPath !== "none" && r.width <= 2) continue;
    if ((r.right > vw + 1 || r.left < -1) && !inScroller(el) && !el.closest(".s-ph-sheet--side")) {
      out.overflow.push([sel(el), Math.round(r.left), Math.round(r.right)]);
    }
    const tag = el.tagName;
    const role = el.getAttribute("role");
    const interactive =
      tag === "BUTTON" || (tag === "A" && el.hasAttribute("href")) || tag === "SUMMARY" || tag === "SELECT" || tag === "TEXTAREA" ||
      (tag === "INPUT" && el.type !== "hidden") ||
      ["button", "link", "menuitem", "menuitemcheckbox", "tab", "switch", "option", "checkbox"].includes(role);
    if (interactive && !el.closest(PROSE) && !el.closest(CHART) && !el.disabled) {
      const boxed = tag === "INPUT" && (el.type === "checkbox" || el.type === "radio");
      const owner = boxed ? el.closest("label") : null;
      const box = owner ? owner.getBoundingClientRect() : r;
      const wordy = (el.textContent || "").trim().length > 1;
      if (box.height < 43.5 || (!wordy && box.width < 43.5)) out.small.push([sel(el), +box.width.toFixed(1), +box.height.toFixed(1)]);
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx > 0 && cy > 0 && cx < vw && cy < vh && !inScroller(el)) {
        const hit = document.elementFromPoint(cx, cy);
        if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) out.covered.push([sel(el), sel(hit)]);
      }
    }
    const typed = tag === "INPUT" ? el.type : "";
    if (tag === "TEXTAREA" || (tag === "INPUT" && ["text", "search", "number", "email", "password", "url", "tel", ""].includes(typed))) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 15.95) out.fonts.push([sel(el), +fs.toFixed(2)]);
    }
  }
  const once = (rows) => [...new Set(rows.map((r) => JSON.stringify(r)))].map((s) => JSON.parse(s));
  out.overflow = once(out.overflow);
  out.small = once(out.small);
  out.fonts = once(out.fonts);
  out.covered = once(out.covered);
  return out;
})`;

/** The shapes. `touch` decides whether a press is a tap or a click. */
const SHAPES = [
  { name: "phone", touch: true, args: [], context: { ...devices["Pixel 7"], viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true } },
  {
    name: "stylus",
    touch: false,
    args: ["--blink-settings=availablePointerTypes=6,primaryPointerType=2,availableHoverTypes=3,primaryHoverType=1"],
    context: { viewport: { width: 720, height: 820 }, deviceScaleFactor: 1.5, isMobile: false, hasTouch: false },
  },
  { name: "tablet", touch: true, tablet: true, args: [], context: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { name: "tablet-land", touch: true, tablet: true, args: [], context: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
];

const fail = [];
const pass = [];
function check(ok, what, detail = "") {
  (ok ? pass : fail).push(what);
  console.log(`${ok ? "  ok  " : "  MISS"} ${what}${ok || detail === "" ? "" : `\n        ${detail}`}`);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const browsers = [browser];

/** Admin cookies, or nothing worth measuring. */
async function signIn() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load" });
  const api = (path, init) =>
    page.evaluate(async ([p, i]) => {
      const r = await fetch(p, i ?? undefined);
      let body = await r.text();
      try {
        body = JSON.parse(body);
      } catch {
        /* text */
      }
      return { status: r.status, body };
    }, [path, init ?? null]);
  let me = (await api("/api/me")).body;
  if (!me?.admin) {
    const password = process.env.ASTROLABE_PASSWORD ?? process.env.VELLUM_PASSWORD ?? "";
    if (!password) {
      console.error("check-phone: not an admin session and no ASTROLABE_PASSWORD — most screens would not mount.");
      process.exit(1);
    }
    const res = await api("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (res.status !== 200) {
      console.error(`check-phone: login failed (${res.status}).`);
      process.exit(1);
    }
    me = (await api("/api/me")).body;
  }
  if (!me?.admin) {
    console.error("check-phone: still not an admin after login.");
    process.exit(1);
  }
  // A note and a folder to walk to: the first folder with a note in it.
  const tree = (await api("/api/tree")).body;
  let folder = null;
  let note = null;
  for (const node of tree.children ?? []) {
    if (node.type !== "folder") continue;
    const n = (node.children ?? []).find((c) => c.type === "file" && !c.attachment && /\.md$/.test(c.path));
    if (n) {
      folder = node.path;
      note = n.path;
      break;
    }
  }
  const cookies = await ctx.cookies();
  await ctx.close();
  if (!folder || !note) {
    console.error("check-phone: the vault has no folder with a note in it to walk to.");
    process.exit(1);
  }
  return { cookies, folder, note };
}

const { cookies, folder, note } = await signIn();
const notePermalink = "/" + note.replace(/\.md$/, "").split("/").map(encodeURIComponent).join("/");

// ── FEEDS AND IMPORT (3.28): a feed of our own, and an export to import ────
// Nothing here fetches the internet: this process serves the feed fixtures
// (tests/fixtures/feeds) on 127.0.0.1 with their hosts rewritten to itself,
// points the instance at a list note of its own for the run (the owner's
// Feeds.md and fetch setting are put back afterwards), and zips the Notion
// fixture export in memory for the import wizard.
const FIXTURES = new URL("../tests/fixtures/", import.meta.url).pathname;
const feedServer = createServer((req, res) => {
  const origin = `http://127.0.0.1:${feedServer.address().port}`;
  const read = (n) => readFileSync(path.join(FIXTURES, "feeds", n), "utf8").replaceAll("https://marginal.example", origin);
  if (req.url === "/rss.xml") return res.writeHead(200, { "Content-Type": "application/rss+xml; charset=utf-8" }).end(read("rss.xml"));
  if (req.url === "/essays/marginalia") return res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(read("article.html"));
  res.writeHead(404).end();
});
await new Promise((r) => feedServer.listen(0, "127.0.0.1", r));
const FEED_URL = `http://127.0.0.1:${feedServer.address().port}/rss.xml`;
const FEED_NOTE = "check-phone-feeds.md";
function treeFiles(root, prefix = "") {
  const out = [];
  for (const n of readdirSync(path.join(root, prefix))) {
    const rel = prefix ? `${prefix}/${n}` : n;
    if (statSync(path.join(root, rel)).isDirectory()) out.push(...treeFiles(root, rel));
    else out.push({ name: rel, data: new Uint8Array(readFileSync(path.join(root, rel))) });
  }
  return out;
}
const NOTION_ZIP = Buffer.from(zipSync(treeFiles(path.join(FIXTURES, "import", "notion"))));
const IMPORT_FOLDER = "check-phone-import";

/** One admin fetch, from a throwaway page that carries the session. */
async function adminApi(calls) {
  const ctx = await browser.newContext();
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load" });
  const out = await page.evaluate(async (list) => {
    const answers = [];
    for (const [p, init] of list) {
      const r = await fetch(p, init ?? undefined);
      let body = await r.text();
      try {
        body = JSON.parse(body);
      } catch {
        /* text */
      }
      answers.push({ status: r.status, body });
    }
    return answers;
  }, calls);
  await ctx.close();
  return out;
}
const J = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const [settingsBefore] = await adminApi([["/api/settings"]]);
const feedsBefore = settingsBefore.body?.feeds ?? null;
await adminApi([
  ["/api/settings", J("PATCH", { feeds: { fetch: true, note: FEED_NOTE } })],
  [`/api/note?path=${encodeURIComponent(FEED_NOTE)}`, J("PUT", { content: `# check-phone\n\n\`\`\`feeds\n${FEED_URL} → check-phone-kept\n\`\`\`\n` })],
]);
const [round] = await adminApi([["/api/feeds/refresh", J("POST", {})]]);
check(round.status === 200 && (round.body.items ?? []).length > 0, "a round of feeds reads the local fixture feed", JSON.stringify(round.body).slice(0, 200));

try {
  for (const shape of SHAPES) {
    const pb = shape.args.length === 0 ? browser : await chromium.launch({ executablePath: process.env.CHROMIUM, args: shape.args });
    if (pb !== browser) browsers.push(pb);
    for (const lang of ["en", "ar"]) {
      const ctx = await pb.newContext(shape.context);
      await ctx.addCookies(cookies);
      await ctx.addInitScript((l) => {
        try {
          localStorage.setItem("astrolabe.whatsnewSeen", "9.9.9");
          localStorage.setItem("astrolabe.prefs-sync-off", "1");
          localStorage.setItem("astrolabe.editorLang", l);
          localStorage.setItem("astrolabe.tourSeen", "1");
        } catch {
          /* private window */
        }
      }, lang);
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const tag = (what) => `${shape.name} ${lang}: ${what}`;
      const press = (loc) => (shape.touch ? loc.first().tap() : loc.first().click());
      const settle = (ms = 700) => page.waitForTimeout(ms);
      const state = () =>
        page.evaluate(() => ({
          path: location.pathname,
          title: document.title,
          screens: [...document.querySelectorAll("[data-screen]")].map((e) => e.getAttribute("data-screen")),
          depth: history.state?.phone?.depth ?? null,
          sheets: history.state?.phone?.entry?.sheets ?? [],
          sheetUp: document.querySelector(".s-ph-sheet--open") !== null,
        }));
      let n = 0;
      const measure = async (name, scope = null) => {
        n += 1;
        await settle(250);
        const r = await page.evaluate(`${MEASURE}(${JSON.stringify(scope)})`);
        await page.screenshot({ path: `${out}/phone-${shape.name}-${lang}-${String(n).padStart(2, "0")}-${name}.png` });
        const t = (what) => tag(`${name}: ${what}`);
        check(r.docScroll === 0, t("the page does not scroll sideways"), `${r.docScroll}px of it`);
        check(r.overflow.length === 0, t("nothing hangs past an edge"), r.overflow.slice(0, 6).map((o) => `${o[0]} [${o[1]}…${o[2]}]`).join("\n        "));
        check(r.small.length === 0, t("every target is 44px"), r.small.slice(0, 8).map((s) => `${s[0]} ${s[1]}×${s[2]}`).join("\n        "));
        check(r.fonts.length === 0, t("every field is 16px"), r.fonts.slice(0, 8).map((f) => `${f[0]} ${f[1]}px`).join("\n        "));
        check(r.covered.length === 0, t("no target is under another layer"), r.covered.slice(0, 8).map((c) => `${c[0]} ← ${c[1]}`).join("\n        "));
      };
      const tab = (id) => press(page.locator(`.s-ph-tab[data-tab="${id}"]`));

      console.log(`\n── ${shape.name} ${lang} ───────────────────────────────`);
      await page.goto(url + "/", { waitUntil: "domcontentloaded" });
      await settle(1600);

      // ── the shell is the phone's ──────────────────────────────────────────
      const chrome = await page.evaluate((tablet) => ({
        phone: document.querySelector(".s-ph") !== null,
        desktop: [".s-app", ".s-tabs", ".s-statusbar", ".s-pane-grip", ".s-sidebar", ".s-drawer-btn"].filter((s) => document.querySelector(s) !== null),
        tablet: document.querySelector(".s-ph--tablet") !== null,
        tabbar: document.querySelector(tablet ? ".s-ph-rail" : ".s-ph-tabs") !== null,
      }), !!shape.tablet);
      check(chrome.phone, tag("the phone shell is mounted"));
      check(chrome.desktop.length === 0, tag("no desktop chrome in the document"), chrome.desktop.join(", "));
      check(chrome.tablet === !!shape.tablet, tag(shape.tablet ? "two columns on a tablet" : "one column on a phone"));
      check(chrome.tabbar, tag(shape.tablet ? "the navigation rail is there" : "the tab bar is there"));
      await measure("today");

      // ── Notes: a folder, then a note — the P0 as an assertion ─────────────
      await tab("notes");
      await settle();
      await measure("notes");
      await press(page.locator(`.s-ph-row[data-path="${folder}"]`));
      await settle();
      const inFolder = await state();
      check(inFolder.screens.includes("notes") && (await page.locator(`[data-folder="${folder}"]`).count()) > 0, tag("a folder tap pushes the folder"));
      await measure("folder");
      await press(page.locator(`.s-ph-row[data-path="${note}"]`));
      await settle(1600);
      const onNote = await state();
      check(onNote.path === notePermalink, tag("a tree tap changes the URL"), `${inFolder.path} → ${onNote.path}, wanted ${notePermalink}`);
      check(onNote.title !== inFolder.title && onNote.title.length > 0, tag("a tree tap changes the title"), `${inFolder.title} → ${onNote.title}`);
      check(onNote.screens.includes("note"), tag("the note screen is up"));
      if (!shape.tablet) {
        check((await page.locator(".s-ph-tabs").count()) === 0, tag("the note screen has no tab bar"));
      }
      await measure("note");

      // ── the note sheet, and back closing it first ─────────────────────────
      await press(page.locator(".s-ph-note .s-ph-top__actions button").last());
      await settle();
      const sheet = await state();
      check(sheet.sheets.includes("note") && sheet.depth === onNote.depth + 1, tag("the note sheet takes a history entry"), JSON.stringify(sheet));
      await measure("sheet-outline", ".s-ph-sheet");
      for (const seg of ["backlinks", "properties", "actions"]) {
        await press(page.locator(`.s-ph-seg__btn[data-segment="${seg}"]`));
        await settle(450);
        await measure(`sheet-${seg}`, ".s-ph-sheet");
      }
      // PUBLISH ASKS — and "no" leaves it private.
      const publishRow = page.locator('.s-ph-actions__row[data-action="publish"]');
      if ((await publishRow.count()) > 0) {
        const before = await page.evaluate(async (p) => ((await (await fetch("/api/published")).json()).paths ?? []).includes(p), note);
        await press(publishRow);
        await settle(900);
        const asked = await page.locator(".s-ph-ask").count();
        check(asked > 0, tag("publish asks before it publishes"));
        if (asked > 0) await measure("publish-ask", ".s-ph-ask");
        await page.goBack();
        await settle(900);
        const after = await page.evaluate(async (p) => ((await (await fetch("/api/published")).json()).paths ?? []).includes(p), note);
        check((await page.locator(".s-ph-ask").count()) === 0, tag("back cancels the question"));
        check(before === after, tag("a cancelled publish publishes nothing"), `${before} → ${after}`);
        await press(page.locator(".s-ph-note .s-ph-top__actions button").last());
        await settle();
      }
      const beforeBack = await state();
      await page.goBack();
      await settle();
      const closed = await state();
      check(beforeBack.sheetUp && !closed.sheetUp && closed.path === notePermalink, tag("back closes the sheet and keeps the note"), JSON.stringify({ before: beforeBack.sheets, after: closed }));

      // ── the keyboard's bar (a finger's editor) ────────────────────────────
      if (shape.name === "phone") {
        await page.locator(".s-ph-note .cm-content").first().tap();
        await settle(700);
        check((await page.locator(".s-ph-kbbar").count()) > 0, tag("the accessory bar rides the keyboard while writing"));
        await measure("editing");
        await press(page.locator('.s-ph-kbbar__key[data-key="hide"]'));
        await settle(400);
      }
      // Reading mode: the icon names the mode the note is IN.
      const modeBefore = await page.locator(".s-ph-note__mode").getAttribute("data-mode");
      await press(page.locator(".s-ph-note__mode"));
      await settle(900);
      const modeAfter = await page.locator(".s-ph-note__mode").getAttribute("data-mode");
      check(modeBefore !== modeAfter, tag("the mode icon flips the mode it names"), `${modeBefore} → ${modeAfter}`);
      await measure("reading");
      await press(page.locator(".s-ph-note__mode"));
      await settle(500);

      // ── back pops the screen ──────────────────────────────────────────────
      await page.goBack();
      await settle(900);
      const popped = await state();
      if (shape.tablet) {
        check(!popped.screens.includes("note") && popped.screens.includes("notes"), tag("back pops the note off the column"), JSON.stringify(popped));
      } else {
        check(popped.screens.includes("notes") && !popped.screens.includes("note"), tag("back pops the note screen to its folder"), JSON.stringify(popped));
      }

      // ── a long press is a menu ────────────────────────────────────────────
      await page.locator(`.s-ph-row[data-path="${note}"]`).first().dispatchEvent("contextmenu");
      await settle(600);
      check((await page.locator(".s-ph-actions").count()) > 0, tag("a long press raises the row's action sheet"));
      await measure("row-actions", ".s-ph-sheet");
      await page.goBack();
      await settle(600);
      check((await page.locator(".s-ph-actions").count()) === 0, tag("back closes the action sheet"));

      // ── search, calendar, more ────────────────────────────────────────────
      await tab("search");
      await settle(900);
      check(await page.evaluate(() => document.activeElement?.classList.contains("s-ph-search__field") ?? false), tag("the search field is focused on arrival"));
      await page.locator(".s-ph-search__field").fill("a");
      await settle(900);
      await measure("search");
      await press(page.locator('.s-ph-search .s-ph-seg__btn[data-segment="commands"]'));
      await settle(400);
      await measure("search-commands");
      await tab("calendar");
      await settle(1500);
      await measure("calendar");
      await press(page.locator(".s-calpage__day").nth(17));
      await settle(900);
      check((await state()).sheets.includes("calendar-day"), tag("a calendar day opens as a sheet with an entry"));
      await measure("calendar-day", ".s-ph-sheet");
      await page.goBack();
      await settle(700);
      check(!(await state()).sheetUp, tag("back closes the day"));
      await tab("more");
      await settle(700);
      await measure("more");

      // ── Round 2's screens (3.27.0) ────────────────────────────────────────
      // Each of them is a screen of its own now — measured, photographed, and
      // asked the question a thumb asks of it.
      const moreRow = async (re) => {
        await tab("more");
        await settle(600);
        const hit = await page.evaluate((src) => {
          const rx = new RegExp(src);
          const row = [...document.querySelectorAll(".s-ph-more .s-ph-row")].find((r) => rx.test(r.textContent ?? ""));
          if (!row) return false;
          row.setAttribute("data-check-phone", "row");
          return true;
        }, re.source);
        if (hit) {
          await press(page.locator('[data-check-phone="row"]'));
          await page.evaluate(() => document.querySelector('[data-check-phone="row"]')?.removeAttribute("data-check-phone"));
        }
        await settle(1400);
        return hit;
      };
      const back = async (ms = 800) => {
        await page.goBack();
        await settle(ms);
      };

      // ORBITS: the decks, a deck, and Study starts the session.
      if (await moreRow(/^(Orbits|المدارات)/)) {
        check((await state()).screens.includes("orbits"), tag("Orbits opens its list of decks"));
        await measure("orbits");
        const deck = page.locator(".s-ph-row[data-deck]");
        if ((await deck.count()) > 0) {
          await press(deck);
          await settle(1200);
          check((await state()).screens.includes("deck"), tag("a deck row opens the deck"));
          await measure("deck");
          await press(page.locator('[data-action="study"]'));
          const studying = await page.waitForSelector('[data-testid="orbits-session"]', { timeout: 10000 }).then(() => true, () => false);
          await settle(900);
          const s = await state();
          check(studying && s.screens.includes("session") && /^\/orbits\/./.test(decodeURIComponent(s.path)), tag("Study starts the session, full screen"), JSON.stringify(s));
          if (shape.tablet) check((await page.locator(".s-ph-cols--full").count()) > 0, tag("the session takes both columns"));
          await measure("session");
          await back();
          check((await state()).screens.includes("deck"), tag("back from the session lands on the deck"));
          await back();
        }
        await back();
      }

      // SIGILS: the list, a sigil, and a tick that persists.
      if (await moreRow(/^(Sigils|السِّجِلّ)/)) {
        check((await state()).screens.includes("sigils"), tag("Sigils opens its list"));
        await measure("sigils");
        const row = page.locator(".s-ph-row[data-sigil]");
        if ((await row.count()) > 0) {
          await press(row);
          await settle(1400);
          check((await state()).screens.includes("sigil"), tag("a sigil row opens the sigil"));
          await measure("sigil");
          const box = page.locator(".s-ph-sigil__card .s-rv-routine__today input.s-rv-routine__check:not([disabled])").first();
          if ((await box.count()) > 0) {
            const before = await box.isChecked();
            await box.click();
            await settle(1500);
            const after = await box.isChecked();
            const path = await page.locator("[data-screen='sigil']").getAttribute("data-path");
            const saved = await page.evaluate(async (p) => {
              const list = await (await fetch("/api/routines")).json();
              const d = new Date();
              const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              const meta = list.find((m) => m.path === p);
              return (meta?.entries ?? []).find((e) => e.date === today)?.done.length ?? 0;
            }, path);
            check(after !== before && (after ? saved > 0 : true), tag("a sigil tick answers at once and persists"), `checked ${before} → ${after}, server has ${saved} done today`);
          }
          await back();
        }
        await back();
      }

      // MEDIA: the shelves, a tracker.
      if (await moreRow(/^(Media|الوسائط)/)) {
        check((await state()).screens.includes("media"), tag("Media opens its shelves"));
        await measure("media");
        const row = page.locator(".s-ph-row[data-tracker]");
        if ((await row.count()) > 0) {
          await press(row);
          await settle(1200);
          check((await state()).screens.includes("tracker"), tag("a tracker row opens its card"));
          await measure("tracker");
          await back();
        }
        await back();
      }

      // FEEDS (3.28): the list, an item, Keep from its ⋯ sheet — and the note
      // is there. The kept note is removed and the item marked unread again,
      // so the next shape keeps it afresh.
      if (await moreRow(/^(Feeds|الخلاصات)/)) {
        check((await state()).screens.includes("feeds"), tag("Feeds opens its list"));
        await settle(900);
        await measure("feeds");
        const row = page.locator(".s-ph-row[data-feed-item]");
        check((await row.count()) > 0, tag("the local feed's items are listed"));
        if ((await row.count()) > 0) {
          const guid = await row.first().getAttribute("data-feed-item");
          await press(row);
          await settle(1400);
          check((await state()).screens.includes("feed-item"), tag("an item opens as a screen"));
          await measure("feed-item");
          await press(page.locator('[data-action="feed-more"]'));
          await settle(700);
          check((await page.locator(".s-ph-actions").count()) > 0, tag("the item's ⋯ is an action sheet"));
          await measure("feed-sheet", ".s-ph-sheet");
          await press(page.locator(".s-ph-actions__row").first());
          await settle(2500);
          const kept = await page.evaluate(async ([f, g]) => (await (await fetch(`/api/feeds/item?feed=${encodeURIComponent(f)}&guid=${encodeURIComponent(g)}`)).json()).kept, [FEED_URL, guid]);
          const there = kept ? await page.evaluate(async (p) => (await fetch(`/api/note?path=${encodeURIComponent(p)}`)).status, kept) : 0;
          check(typeof kept === "string" && kept.startsWith("check-phone-kept/") && there === 200, tag("Keep writes the article into the feed's folder"), `kept ${kept} (${there})`);
          if (kept) {
            await page.evaluate(async ([p, f, g]) => {
              await fetch(`/api/note?path=${encodeURIComponent(p)}&permanent=1`, { method: "DELETE" });
              await fetch("/api/feeds/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feed: f, guid: g, read: false }) });
            }, [kept, FEED_URL, guid]);
          }
          await back();
          check((await state()).screens.includes("feeds"), tag("back from an item lands on Feeds"));
        }
        await back();
      } else check(false, tag("More has a Feeds row"));

      // IMPORT (3.28): the wizard from More — a Notion export previewed,
      // imported and undone, and Back closes the dialog like a sheet.
      if (await moreRow(/^(Import notes|استيراد ملاحظات)/)) {
        await page.waitForSelector("[data-testid=import-dialog]", { timeout: 5000 }).catch(() => {});
        check((await state()).sheets.includes("layer:import"), tag("the import wizard takes a history entry"));
        await measure("import", "[data-testid=import-dialog]");
        await page.locator("[data-testid=import-file]").setInputFiles({ name: "notion-export.zip", mimeType: "application/zip", buffer: NOTION_ZIP });
        await page.locator("[data-testid=import-dialog] input:not([type=file])").first().fill(IMPORT_FOLDER);
        await press(page.locator("[data-testid=import-preview]"));
        await page.waitForSelector("[data-testid=import-summary]", { timeout: 15000 }).catch(() => {});
        check((await page.locator("[data-testid=import-summary]").count()) > 0, tag("the import previews the export"));
        await measure("import-preview", "[data-testid=import-dialog]");
        await press(page.locator("[data-testid=import-commit]"));
        await page.waitForSelector("[data-testid=import-done]", { timeout: 15000 }).catch(() => {});
        const has = () => page.evaluate(async (f) => ((await (await fetch("/api/tree")).json()).children ?? []).some((c) => c.path === f), IMPORT_FOLDER);
        check((await page.locator("[data-testid=import-done]").count()) > 0 && (await has()), tag("the import writes the notes"));
        await press(page.locator("[data-testid=import-undo]"));
        await page.waitForSelector("[data-testid=import-undone]", { timeout: 15000 }).catch(() => {});
        await settle(600);
        check((await page.locator("[data-testid=import-undone]").count()) > 0 && !(await has()), tag("undo takes the import back"));
        await back(700);
        check((await page.locator("[data-testid=import-dialog]").count()) === 0, tag("back closes the import wizard"));
      } else check(false, tag("More has an Import notes row"));

      // THE LIBRARY AND A BOOK: the reader's own bar, and its scrubber moves.
      if (await moreRow(/^(Library|المكتبة)/)) {
        await measure("library");
        const pdf = page.locator('.s-ph-row[data-path$=".pdf"]');
        const long = page.locator('.s-ph-row[data-path*="Long"]');
        const book = (await long.count()) > 0 ? long : pdf;
        if ((await book.count()) > 0) {
          await press(book);
          await page.waitForSelector(".s-book__phonebar", { timeout: 15000 }).catch(() => {});
          await settle(2200);
          const chrome = await page.evaluate(() => ({
            bar: document.querySelectorAll(".s-book__phonebar").length,
            desktopBar: document.querySelectorAll(".s-book__top, .s-book__status").length,
            phoneTop: document.querySelectorAll(".s-ph-top, .s-ph-tabs").length,
            barH: Math.round(document.querySelector(".s-book__phonebar")?.getBoundingClientRect().height ?? 0),
          }));
          check(chrome.bar === 1 && chrome.desktopBar === 0 && chrome.phoneTop === 0, tag("a book wears one bar of its own and nothing else"), JSON.stringify(chrome));
          await measure("reader");
          const scrub = page.locator(".s-book__scrub");
          if ((await scrub.count()) > 0) {
            const before = await page.evaluate(() => document.querySelector(".s-book__scroll")?.scrollTop ?? 0);
            // Wherever the book was left, to the other half of it.
            await scrub.evaluate((el) => {
              const input = el;
              const max = Number(input.max);
              input.value = String(Number(input.value) > max / 2 ? 2 : Math.max(2, max - 1));
              input.dispatchEvent(new Event("input", { bubbles: true }));
              input.dispatchEvent(new Event("change", { bubbles: true }));
            });
            await settle(1500);
            const after = await page.evaluate(() => document.querySelector(".s-book__scroll")?.scrollTop ?? 0);
            check(Math.abs(after - before) > 100, tag("the reader's scrubber moves through the book"), `${before} → ${after}`);
          }
          // ⋯ is the phone's action sheet, and Back closes it.
          await press(page.locator(".s-book__phonebar .s-book__phonebtn").last());
          await settle(700);
          check((await page.locator(".s-ph-actions").count()) > 0, tag("the reader's ⋯ is an action sheet"));
          await measure("reader-menu", ".s-ph-sheet");
          await back(700);
          check((await page.locator(".s-ph-actions").count()) === 0 && (await state()).screens.includes("reader"), tag("back closes the reader's sheet and keeps the book"));
          await back();
        }
        await back();
      }

      // AN OVERLAY ON <body> TAKES AN ENTRY: the theme picker, closed by Back.
      await tab("more");
      await settle(600);
      const themeRow = await page.evaluate(() => {
        const row = [...document.querySelectorAll(".s-ph-more .s-ph-row")].find((r) => /Theme|السمة|المظهر/.test(r.textContent ?? ""));
        row?.setAttribute("data-check-phone", "theme");
        return !!row;
      });
      if (themeRow) {
        await press(page.locator('[data-check-phone="theme"]'));
        await settle(900);
        const up = await state();
        check((await page.locator(".s-tpick-overlay").count()) > 0 && up.sheets.includes("overlay:theme-picker"), tag("the theme picker takes a history entry"), JSON.stringify(up));
        await back(700);
        check((await page.locator(".s-tpick-overlay").count()) === 0 && (await state()).screens.includes("more"), tag("back closes the theme picker and stays on More"));
      }

      // SETTINGS: a list of sections; a section saves, and asks before Back
      // throws an edit away.
      if (await moreRow(/^(Settings|الإعدادات)$/)) {
        check((await state()).screens.includes("settings"), tag("Settings is a list of sections"));
        await measure("settings");
        await press(page.locator('.s-ph-row[data-section="site"]'));
        await page.waitForSelector("[data-screen='settings-section'] .s-smodal__row", { timeout: 10000 }).catch(() => {});
        await settle(900);
        check((await state()).screens.includes("settings-section"), tag("a section is a screen"));
        await measure("settings-site");
        const tagline = page.locator('[data-screen="settings-section"] [data-setting] input').nth(1);
        const value = `check-phone ${shape.name} ${lang} ${Date.now() % 100000}`;
        await tagline.fill(value);
        await settle(500);
        check(await page.evaluate(() => document.querySelector(".s-ph-settings--dirty") !== null), tag("an edit raises the save bar"));
        await measure("settings-dirty");
        await page.goBack();
        await settle(900);
        const asked = await page.locator(".s-ph-ask").count();
        check(asked > 0 && (await state()).screens.includes("settings-section"), tag("back with an edit asks, and the section stays"));
        if (asked > 0) {
          await back(900);
          check((await page.locator(".s-ph-ask").count()) === 0 && (await tagline.inputValue()) === value, tag("cancelling keeps the edit"));
        }
        await press(page.locator('.s-ph-savebar [data-action="save"]'));
        await settle(1600);
        const saved = await page.evaluate(async () => (await (await fetch("/api/settings")).json()).effective?.tagline);
        check(saved === value, tag("a Settings section saves"), `tagline is ${JSON.stringify(saved)}`);
        await back();
        await back();
      }

      // THE TAG PICKER WRITES A TAG, from the note sheet's Properties.
      await page.goto(url + notePermalink, { waitUntil: "domcontentloaded" });
      await settle(1800);
      await press(page.locator(".s-ph-note .s-ph-top__actions button").last());
      await settle(700);
      await press(page.locator('.s-ph-seg__btn[data-segment="properties"]'));
      await settle(900);
      const tagsRow = page.locator('.s-ph-prop[data-prop="tags"], .s-ph-prop[data-prop="Tags"]');
      if ((await tagsRow.count()) > 0) {
        await press(tagsRow);
        await settle(900);
        check((await state()).sheets.includes("tags"), tag("the tag picker is a sheet over the note sheet"));
        await measure("tag-picker", ".s-ph-tagsheet");
        const fresh = `cp${shape.name.replace(/[^a-z]/g, "")}${lang}${Date.now() % 100000}`;
        await page.locator(".s-ph-tagsheet__field").fill(fresh);
        await settle(400);
        await press(page.locator(".s-ph-tagsheet__add"));
        await settle(1500);
        const written = await page.evaluate(async (p) => (await (await fetch(`/api/note?path=${encodeURIComponent(p)}`)).json()).content ?? "", note);
        check(new RegExp(`tags:[^\\n]*${fresh}|\\n\\s*-\\s*${fresh}`).test(written), tag("the tag picker writes the tag into the note"), written.slice(0, 160));
        await back(700);
        check(!(await state()).sheets.includes("tags"), tag("back closes the tag picker"));
      }
      // Off the note sheet, then off the note (a deep link: back is Today).
      if ((await state()).sheetUp) await back(700);
      if ((await state()).screens.includes("note")) await back(900);

      // A LIST COMES BACK WHERE IT WAS LEFT.
      await tab("notes");
      await settle(700);
      const busiest = await page.evaluate(() => {
        const rows = [...document.querySelectorAll(".s-ph-row[data-path]")];
        let best = null;
        let most = 0;
        for (const r of rows) {
          const n = Number(r.querySelector(".s-ph-row__count")?.textContent?.replace(/[^0-9٠-٩]/g, "").replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)) ?? 0);
          if (n > most) {
            most = n;
            best = r.getAttribute("data-path");
          }
        }
        return best;
      });
      if (busiest) {
        await press(page.locator(`.s-ph-row[data-path="${busiest}"]`));
        await settle(900);
        const scroller = shape.tablet ? ".s-ph-cols__list .s-ph-scroll" : ".s-ph-stage .s-ph-scroll";
        const y = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return 0;
          el.scrollTop = Math.min(260, el.scrollHeight - el.clientHeight);
          return el.scrollTop;
        }, scroller);
        await settle(300);
        if (y > 40 && !shape.tablet) {
          const target = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            const r = el.getBoundingClientRect();
            const row = [...el.querySelectorAll(".s-ph-row[data-path]")].find((x) => {
              const b = x.getBoundingClientRect();
              return b.top > r.top + 10 && b.bottom < r.bottom - 10 && /\.md$/.test(x.getAttribute("data-path") ?? "");
            });
            row?.setAttribute("data-check-phone", "deep");
            return !!row;
          }, scroller);
          if (target) {
            await press(page.locator('[data-check-phone="deep"]'));
            await settle(1500);
            await back(1200);
            const again = await page.evaluate((sel) => document.querySelector(sel)?.scrollTop ?? 0, scroller);
            check(Math.abs(again - y) < 4, tag("back returns a list to where it was scrolled"), `${y} → ${again}`);
          }
        }
        await back(600);
      }

      // ── the capture sheet and its voice half (3.24.0) ─────────────────────
      // Opened by the chord, which also proves a hardware keyboard to the
      // phone shell; a layer with a history entry of its own. Only the
      // sheet's own controls are measured — the page under it is inert.
      await page.keyboard.press("Control+Shift+d");
      const captured = await page.waitForSelector(".s-capture", { timeout: 10000 }).then(() => true, () => false);
      check(captured, tag("the capture chord raises the capture sheet"));
      if (captured) {
        check((await state()).sheets.includes("layer:capture"), tag("capture takes a history entry"));
        await measure("capture", ".s-capture");
        const voice = page.locator(".s-capture__mode");
        if ((await voice.count()) > 0) {
          await voice.first().click();
          const mic = await page.waitForSelector(".s-voice__mic", { timeout: 10000 }).then(() => true, () => false);
          check(mic, tag("the capture sheet's voice half opens"));
          if (mic) await measure("voice", ".s-capture");
        }
        await page.goBack();
        await settle(800);
        check((await page.locator(".s-capture").count()) === 0, tag("back closes the capture sheet"));
      }

      // ── a deep link, and back from it ─────────────────────────────────────
      await page.goto(url + notePermalink, { waitUntil: "domcontentloaded" });
      await settle(1800);
      const deep = await state();
      check(deep.screens.includes("note") && deep.path === notePermalink, tag("a deep link opens its note"), JSON.stringify(deep));
      await page.goBack();
      await settle(900);
      const home = await state();
      check(home.path === "/" && home.screens.includes("today"), tag("back from a deep link comes home to Today"), JSON.stringify(home));

      check(errors.length === 0, tag("no page errors"), errors.slice(0, 4).join("\n        "));
      await ctx.close();
    }
  }

} finally {
  // The owner's feeds setting back as it was, the run's list note gone.
  await adminApi([
    ["/api/settings", J("PATCH", { feeds: feedsBefore ? { fetch: feedsBefore.fetch ?? null, note: feedsBefore.note ?? null } : null })],
    [`/api/note?path=${encodeURIComponent(FEED_NOTE)}&permanent=1`, { method: "DELETE" }],
    // The folder the run's keeps went into (each kept note was removed as it
    // was checked, so it is empty by now).
    ["/api/folder?path=check-phone-kept&permanent=1", { method: "DELETE" }],
  ]).catch(() => {});
  feedServer.close();
  for (const b of browsers) await b.close().catch(() => {});
}

console.log(fail.length === 0 ? `\ncheck-phone: all green (${pass.length} checks)` : `\ncheck-phone: ${fail.length} failure(s) of ${pass.length + fail.length}`);
process.exit(fail.length === 0 ? 0 : 1);
