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
//   · CLASSIC IS STILL THERE: `This device → Phone layout: Classic` mounts
//     the desktop's drawer shell (for one release).
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
import { mkdirSync } from "node:fs";

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
    " .s-blog-article, .s-marginalia__list";
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

      // ── the legacy screens ────────────────────────────────────────────────
      for (const [label, surface] of [
        ["orbits", "~orbits"],
        ["sigils", "~sigils"],
        ["library", "~library"],
        ["graph", "~graph"],
      ]) {
        await page.evaluate((s) => {
          const rows = [...document.querySelectorAll(".s-ph-more .s-ph-row")];
          const want = { "~orbits": 0, "~sigils": 1, "~library": 2, "~graph": 4 }[s];
          rows[want]?.click();
        }, surface);
        await settle(1800);
        const s = await state();
        check(s.screens.includes("surface"), tag(`${label} opens as a screen`), JSON.stringify(s));
        await measure(label);
        await page.goBack();
        await settle(800);
      }
      // Settings: a layer with a history entry of its own.
      await page.evaluate(() => [...document.querySelectorAll(".s-ph-more .s-ph-row")].find((r) => r.textContent?.match(/Settings|الإعدادات|إعدادات/))?.click());
      await settle(1600);
      check((await state()).sheets.includes("layer:settings"), tag("settings takes a history entry"));
      await measure("settings");
      await page.goBack();
      await settle(1000);
      check((await page.locator(".s-smodal").count()) === 0, tag("back closes settings"));

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

  // ── Classic, for one release ──────────────────────────────────────────────
  {
    const ctx = await browser.newContext(SHAPES[0].context);
    await ctx.addCookies(cookies);
    await ctx.addInitScript(() => {
      localStorage.setItem("astrolabe.whatsnewSeen", "9.9.9");
      localStorage.setItem("astrolabe.prefs-sync-off", "1");
      localStorage.setItem("astrolabe.phoneLayout", "classic");
    });
    const page = await ctx.newPage();
    await page.goto(url + "/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1600);
    const shells = await page.evaluate(() => ({ phone: !!document.querySelector(".s-ph"), desktop: !!document.querySelector(".s-app") }));
    check(!shells.phone && shells.desktop, "classic: Phone layout → Classic mounts the drawer shell");

    // THE P0, IN THE SHELL IT HAPPENED IN (3.26.1). Classic still loads the
    // back-gesture guard, and its retraction raced the router: a note tapped
    // in the drawer did not open (client/backGuard.ts). Tap one, and require
    // the address, the title and the active tab to name it, drawer closed.
    const where = () =>
      page.evaluate(() => ({
        path: decodeURIComponent(location.pathname),
        title: document.title,
        tab: document.querySelector(".s-tab--active")?.textContent?.trim() ?? "",
        drawer: document.querySelector(".s-app--drawer") !== null,
      }));
    const before = await where();
    await page.tap(".s-drawer-btn");
    await page.waitForTimeout(600);
    const name = await page.evaluate(() => {
      const row = [...document.querySelectorAll(".s-sidebar .s-tree__item[data-tree-path]")].find(
        (r) => /\.md$/i.test(r.dataset.treePath ?? "") && r.getAttribute("aria-selected") !== "true" && r.getBoundingClientRect().height > 0,
      );
      if (!row) return null;
      row.setAttribute("data-check-phone", "tap");
      return row.dataset.treePath.split("/").pop().replace(/\.md$/i, "");
    });
    if (name === null) {
      check(false, "classic: a note tapped in the drawer opens", "the drawer showed no note row to tap");
    } else {
      await page.tap('[data-check-phone="tap"]');
      await page.waitForTimeout(2000);
      const after = await where();
      const miss = [];
      if (after.path === before.path || !after.path.includes(name)) miss.push(`address ${before.path} → ${after.path}`);
      if (!after.title.includes(name)) miss.push(`title "${after.title}"`);
      if (!after.tab.includes(name)) miss.push(`active tab "${after.tab}"`);
      if (after.drawer) miss.push("the drawer is still out");
      check(miss.length === 0, "classic: a note tapped in the drawer opens", `tapped "${name}": ${miss.join("; ")}`);

      // …and Classic's one-tap Publish in the bottom bar asks first.
      const target = await page.evaluate(async () => {
        const { paths } = await (await fetch("/api/published")).json();
        const p = decodeURIComponent(location.pathname).slice(1);
        return paths.some((x) => x.replace(/\.md$/i, "") === p) ? null : p;
      });
      if (target !== null && (await page.locator(".s-statusbar__pub").count()) > 0) {
        await page.tap(".s-statusbar__pub");
        await page.waitForTimeout(600);
        const asked = await page.locator(".s-confirm").isVisible().catch(() => false);
        if (asked) await page.tap(".s-confirm__cancel");
        await page.waitForTimeout(700);
        const live = await page.evaluate(async (p) => ((await (await fetch("/api/published")).json()).paths ?? []).some((x) => x.replace(/\.md$/i, "") === p), target);
        check(asked && !live, "classic: the bottom bar's Publish asks, and a cancel publishes nothing", `asked=${asked} published=${live}`);
      }
    }
    await ctx.close();
  }
} finally {
  for (const b of browsers) await b.close().catch(() => {});
}

console.log(fail.length === 0 ? `\ncheck-phone: all green (${pass.length} checks)` : `\ncheck-phone: ${fail.length} failure(s) of ${pass.length + fail.length}`);
process.exit(fail.length === 0 ? 0 : 1);
