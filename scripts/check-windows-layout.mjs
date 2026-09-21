// The WINDOW gate: what the shell does when the window is not 1440 wide.
//
//   node scripts/check-windows-layout.mjs http://localhost:7141 astrolabe7141
//   env: CHROMIUM=/usr/bin/chromium
//
// WHY THIS EXISTS. Every other harness in this directory looks at the app at
// one or two comfortable widths. The app is not used at comfortable widths: a
// Windows laptop is 1366 physical pixels, which is 1093 CSS px at 125% and 904
// at 150%, and half of it under Win+← is 683. Four release rounds of "resizing
// of panels/windows is clunky and weird on Windows" were four defects that
// every gate we had was blind to, because each of them is a function of the
// viewport and the pointer together:
//
//   A  a mouse-driven window under 700px became the PHONE app — drawer,
//      hamburger, no grips — because the breakpoint was width-only;
//   B  the grip sat inside the pane, on the tree's scrollbar, so the hairline
//      the eye aims at resized nothing;
//   C  stored pane widths were re-applied at boot with nothing to clamp them
//      against, and two dragged panes left the note 0px wide — persistently;
//   F  the grips were hidden outright on any device with no fine pointer,
//      which on Windows includes a convertible with a mouse attached.
//
// So the matrix is (viewport × device pixel ratio × pointer posture ×
// direction × seeded pane widths), and the assertions are about the SHELL:
// which panes are grid columns, whether each has something to drag, whether
// the note still has a column to be in, and whether anything is off-screen.
//
// DPR is in the matrix because the report kept arriving with a scaling factor
// attached and every fix had to be proved independent of it: the grip is the
// same 12 CSS px at 1, 1.25 and 1.5, and the breakpoints are CSS px at every
// one of them. A cell that passes at DPR 1 and fails at 1.5 is a fix that was
// written against the wrong unit.

import { chromium } from "playwright";

const [url = "http://localhost:7141", password = "astrolabe7141"] = process.argv.slice(2);
const executablePath = process.env.CHROMIUM;

/** The rungs. 1366 and 1280 are the two commonest laptop panels; 1024 is the
 *  same laptop at 133%, 900 is a window beside a browser on it, 700 and 600
 *  are the width-only phone band that every pointer shares. */
const WIDTHS = [1366, 1280, 1024, 900, 700, 600];
const RATIOS = [1, 1.25, 1.5];

/** The phone's own arm of DRAWER_QUERY (client/state.ts) — width only, every
 *  pointer, because two 300px measures are not a choice anyone can make. */
const PHONE_AT = 700;
/** client/paneWidths.ts MAIN_MIN. */
const MAIN_MIN = 320;
/** client/paneWidths.ts GRIP_HIT. */
const GRIP_HIT = 12;

/** The three postures Chromium actually reports on Windows — as BLINK
 *  SETTINGS, not as DevTools media emulation.
 *
 *  `Emulation.setEmulatedMedia` was tried first and is not usable here: every
 *  `setViewportSize` reissues `setDeviceMetricsOverride` and the emulated
 *  features go with it, so a posture silently stops being emulated partway
 *  down the ladder and the harness tests the mouse three times over. These
 *  flags are what `pointer_device_win.cc` itself hands Blink, so the renderer
 *  is in the posture rather than being told about it.
 *
 *  `slate` is not "a tablet": Chromium answers {coarse, hover: none} for a
 *  hardware slate — touch plus a rotation sensor plus the ACPI slate
 *  indicator — and AN ATTACHED MOUSE DOES NOT CHANGE THE ANSWER. That is the
 *  posture defect F lived in, and it is why the grips may not be hidden on a
 *  pointer test alone. `touchlaptop` has both, and is the case that must keep
 *  its 44px rows AND its grips.
 *
 *  (The numbers are Blink's own bitfields: pointer 2 = coarse, 4 = fine,
 *  6 = both; hover 1 = none, 2 = hover, 3 = both.) */
const POSTURES = {
  mouse: [],
  slate: ["--blink-settings=availablePointerTypes=2,primaryPointerType=2,availableHoverTypes=1,primaryHoverType=1"],
  touchlaptop: ["--blink-settings=availablePointerTypes=6,primaryPointerType=2,availableHoverTypes=3,primaryHoverType=2"],
};

/** What `(any-pointer: fine)` must report in each posture — asserted in every
 *  cell, so a posture that failed to take is a failure and not a pass. */
const FINE = { mouse: true, slate: false, touchlaptop: true };

/** …and what the breakpoint's OWN question answers in each (3.23.0): is this
 *  device's primary pointer a finger that cannot hover? A slate says yes and
 *  gets the drawer under 1000px, exactly as it did under the any-pointer
 *  form; a touch laptop says no, because the mouse beside the touchscreen
 *  hovers, and keeps the docked panes defect F is about. Asserted too, so a
 *  posture cannot half-take. */
const OWN_POINTER = { mouse: false, slate: true, touchlaptop: false };

const errs = [];
let checks = 0;
const fail = (where, message) => errs.push(`${where}: ${message}`);
const ok = (where, condition, message) => {
  checks++;
  if (!condition) fail(where, message);
};

async function signIn() {
  const res = await fetch(`${url}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    console.error(`check-windows-layout: login failed (${res.status}). Wrong password?`);
    process.exit(1);
  }
  const host = new URL(url).hostname;
  return (res.headers.getSetCookie?.() ?? []).map((raw) => {
    const [pair] = raw.split(";");
    const i = pair.indexOf("=");
    return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: host, path: "/" };
  });
}

/** Everything the assertions below need, read out of the live document in one
 *  round trip. Nothing here decides anything — the decisions are in JS, where
 *  a failure can say which number it wanted. */
function measure() {
  const q = (s) => document.querySelector(s);
  const box = (s) => {
    const el = q(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      l: Math.round(r.left * 10) / 10,
      r: Math.round(r.right * 10) / 10,
      w: Math.round(r.width * 10) / 10,
      display: cs.display,
      position: cs.position,
      gridArea: cs.gridArea,
    };
  };
  const row = q(".s-tree__item");
  const app = q(".s-app");
  const sidebar = q(".s-sidebar");
  const panel = q(".s-panel");
  // The seam each grip is supposed to straddle: the pane's own 1px divider.
  // Which physical edge that is depends on the direction AND on the flip, so
  // it is read off the PHYSICAL border — `border-inline-start` is the right
  // edge in Arabic, and asking for it by its logical name is how a harness
  // ends up testing the window's edge instead of the pane's.
  const seamOf = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return getComputedStyle(el).borderLeftWidth !== "0px" ? r.left : r.right;
  };
  // Half a pixel inside the window, so a seam that sits exactly on the window
  // edge is still a point the document can be asked about.
  const hit = (x) => {
    const at = Math.min(Math.max(Math.round(x), 0), innerWidth - 1);
    const el = document.elementFromPoint(at, Math.round(innerHeight / 2));
    return el ? `${el.tagName}.${String(el.className).slice(0, 30)}` : null;
  };
  const seamSidebar = seamOf(sidebar);
  const seamPanel = seamOf(panel);
  return {
    inner: innerWidth,
    dpr: devicePixelRatio,
    dir: getComputedStyle(document.body).direction,
    flip: app ? app.classList.contains("s-app--flip") : false,
    fine: matchMedia("(any-pointer: fine)").matches,
    // What the breakpoint itself asks (client/state.ts DRAWER_QUERY, 3.23.0):
    // the PRIMARY pointer, because `any-pointer: fine` is true of a phone
    // with a stylus and that phone is not a laptop.
    ownPointer: matchMedia("(pointer: coarse) and (hover: none)").matches,
    sidebar: box(".s-sidebar"),
    panel: box(".s-panel"),
    main: box(".s-main"),
    gripSidebar: box(".s-pane-grip--sidebar"),
    gripPanel: box(".s-pane-grip--panel"),
    drawerBtn: box(".s-drawer-btn"),
    panelToggle: box(".s-panel-toggle"),
    panelCollapsed: panel ? panel.classList.contains("s-panel--collapsed") : null,
    sidebarCollapsed: sidebar ? sidebar.classList.contains("s-sidebar--collapsed") : null,
    rowHeight: row ? Math.round(row.getBoundingClientRect().height) : null,
    seamSidebar,
    seamPanel,
    atSeamSidebar: seamSidebar === null ? null : hit(seamSidebar),
    atSeamPanel: seamPanel === null ? null : hit(seamPanel),
    docScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
}

/** One cell of the matrix. */
function assertCell(where, m, { posture, seeded }) {
  const phone = m.inner <= PHONE_AT;
  const drawer = phone || (m.ownPointer && m.inner <= 999);

  ok(where, m.docScroll <= 0, `the document scrolls sideways by ${m.docScroll}px`);

  if (drawer) {
    // The sidebar leaves the grid and becomes an overlay; the ☰ is its door.
    ok(where, m.sidebar.position === "fixed", `sidebar should be an overlay drawer, is ${m.sidebar.position}`);
    ok(where, m.gripSidebar.display === "none", "a drawer has no width to drag");
    // …except while the OUTLINE drawer is up on a phone: it hides the chrome
    // it covers (app.css "a phone drawer hides the chrome it covers", 3.19.0)
    // and carries its own ✕, so the ☰ is gone until it closes.
    if (phone && !m.panelCollapsed) ok(where, m.drawerBtn.display === "none", "an open outline drawer hides the ☰ it covers");
    else ok(where, m.drawerBtn.display !== "none", "a drawer needs its ☰");
    // The PANEL stays docked and resizable in the 700–999 band; below 700 it
    // is a drawer of its own and goes with the rest.
    if (!phone && !m.panelCollapsed) ok(where, m.gripPanel.display !== "none", "the outline pane stays docked here and keeps its grip");
    else ok(where, m.gripPanel.display === "none", "no grips on a phone");
    return;
  }

  // ── DOCKED. Everything below is what a window with a pointer must have. ──
  ok(where, m.sidebar.position !== "fixed", `sidebar should be a grid column, is ${m.sidebar.position}`);
  ok(where, m.sidebar.gridArea.includes("sidebar"), `sidebar was auto-placed (grid-area ${m.sidebar.gridArea})`);
  ok(where, m.drawerBtn.display === "none", "a docked sidebar must not also offer a ☰");

  // THE POINTER DOES NOT DECIDE (CONTRACTS.md, "The pane grips"). A slate
  // posture above the drawer band still has docked panes, so it still has
  // something to drag them by.
  ok(where, m.gripSidebar.display !== "none", `no sidebar grip at ${m.inner}px under ${posture}`);
  if (!m.panelCollapsed) ok(where, m.gripPanel.display !== "none", `no panel grip at ${m.inner}px under ${posture}`);

  // The strip is 12 CSS px at every device pixel ratio, with the pane's own
  // divider down the middle — so the pixel the eye aims at is the pixel that
  // resizes. It used to be 8px pinned inside the pane, and `elementFromPoint`
  // at the seam returned the <aside>.
  ok(where, Math.abs(m.gripSidebar.w - GRIP_HIT) < 0.6, `sidebar grip is ${m.gripSidebar.w}px, want ${GRIP_HIT}`);
  ok(
    where,
    m.atSeamSidebar !== null && m.atSeamSidebar.includes("s-pane-grip"),
    `the sidebar's own divider answers to ${m.atSeamSidebar}, not to the grip`,
  );
  const midS = (m.gripSidebar.l + m.gripSidebar.r) / 2;
  ok(where, Math.abs(midS - m.seamSidebar) <= 1, `sidebar grip centred at ${midS}, seam at ${m.seamSidebar}`);
  if (!m.panelCollapsed) {
    ok(
      where,
      m.atSeamPanel !== null && m.atSeamPanel.includes("s-pane-grip"),
      `the outline pane's divider answers to ${m.atSeamPanel}, not to the grip`,
    );
    const midP = (m.gripPanel.l + m.gripPanel.r) / 2;
    ok(where, Math.abs(midP - m.seamPanel) <= 1, `panel grip centred at ${midP}, seam at ${m.seamPanel}`);
  }

  // THE NOTE KEEPS A COLUMN. This is the assertion the seeded rows exist for:
  // {560, 560} stored and re-applied verbatim left `.s-main` 0px wide on a
  // 904px laptop, with the panel's header and close button off-screen, and it
  // survived a reload because boot re-applied the same pair.
  ok(where, m.main.w >= MAIN_MIN - 1, `the note column is ${m.main.w}px, floor is ${MAIN_MIN}${seeded ? " (seeded panes)" : ""}`);
  ok(where, m.panel.l >= -1 && m.panel.r <= m.inner + 1, `the outline pane runs from ${m.panel.l} to ${m.panel.r} in a ${m.inner}px window`);
  ok(where, m.sidebar.l >= -1 && m.sidebar.r <= m.inner + 1, `the sidebar runs from ${m.sidebar.l} to ${m.sidebar.r} in a ${m.inner}px window`);
  // Only while the pane is open: a collapsed pane is clipped to zero and its
  // header is `visibility: hidden`, which is the point of the collapse.
  if (m.panelToggle && !m.panelCollapsed) {
    ok(where, m.panelToggle.l >= -1 && m.panelToggle.r <= m.inner + 1, `the panel's close button is off-screen (${m.panelToggle.l}–${m.panelToggle.r})`);
  }

  // A shell with a touch pointer keeps its 44px rows whatever else is true —
  // the touch laptop is a real machine and the rule that gave it tap targets
  // is not the rule that hides grips.
  if (m.rowHeight !== null) {
    if (posture === "mouse") ok(where, m.rowHeight <= 32, `tree rows are ${m.rowHeight}px under a mouse`);
    else ok(where, m.rowHeight >= 44, `tree rows are ${m.rowHeight}px under ${posture}`);
  }
}

const cookies = await signIn();
/** One browser per posture — the flags above are process-wide. */
const browsers = new Map();
async function browserFor(posture) {
  if (!browsers.has(posture)) {
    browsers.set(
      posture,
      await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: POSTURES[posture] }),
    );
  }
  return browsers.get(posture);
}

/** One context per (ratio × posture × direction × seed); the widths inside it
 *  are a `setViewportSize`, which is what a reader dragging a window edge
 *  actually does and is the cheap way to run six rungs on one page. */
async function ladder({ dpr, posture, rtl, seeded }) {
  const browser = await browserFor(posture);
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 }, deviceScaleFactor: dpr });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  await page.addInitScript(
    (s) => {
      try {
        localStorage.setItem("astrolabe.whatsnewSeen", "9.9.9");
        localStorage.setItem("astrolabe.prefs-sync-off", "1");
        for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
      } catch {
        // a context with storage blocked still renders the defaults
      }
    },
    {
      ...(rtl ? { "astrolabe.editorLang": "ar" } : {}),
      // The panel is opened DELIBERATELY for the seeded rows, so the
      // responsive auto-collapse cannot quietly hide the thing under test.
      ...(seeded ? { "astrolabe.paneWidths": JSON.stringify({ sidebar: 560, panel: 560 }), "astrolabe.panelCollapsed": "false" } : {}),
    },
  );
  await page.goto(`${url}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".s-app", { timeout: 20000 });
  await page.waitForTimeout(900);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(300);
    const m = await page.evaluate(measure);
    const where = `${width}×${dpr} ${posture}${rtl ? " rtl" : ""}${seeded ? " seeded" : ""}`;
    if (!m.sidebar || !m.panel || !m.main) {
      fail(where, "the shell did not render a sidebar, a panel and a main column");
      continue;
    }
    if (m.inner !== width) fail(where, `asked for ${width} CSS px, got ${m.inner}`);
    if (m.fine !== FINE[posture]) {
      fail(where, `the ${posture} posture did not take: (any-pointer: fine) is ${m.fine}`);
      continue;
    }
    if (m.ownPointer !== OWN_POINTER[posture]) {
      fail(where, `the ${posture} posture did not take: (pointer: coarse) and (hover: none) is ${m.ownPointer}`);
      continue;
    }
    assertCell(where, m, { posture, seeded });
  }
  await ctx.close();
}

/** THE WINDOW MOVES; THE PANES DO NOT LAG BEHIND IT.
 *
 *  The ladder above waits 300ms after each `setViewportSize`, which is long
 *  enough for a 0.18s width transition to have finished — so it is blind to
 *  the frames in between, and that is where the fault was: with {560, 560}
 *  stored and the window taken 1440 → 904, `.s-main` measured 0px wide 30ms
 *  in and 274px at 110ms before reaching its 320px floor. The note lost its
 *  column on every resize, which is the one thing MAIN_MIN is for, and the
 *  panes visibly chased the window edge. This rung looks at the FIRST frame
 *  after the resize, which is the frame the reader sees. */
async function liveResize({ dpr, rtl }) {
  const browser = await browserFor("mouse");
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 800 }, deviceScaleFactor: dpr });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  await page.addInitScript(
    (s) => {
      try {
        localStorage.setItem("astrolabe.whatsnewSeen", "9.9.9");
        localStorage.setItem("astrolabe.prefs-sync-off", "1");
        for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
      } catch {
        // a context with storage blocked still renders the defaults
      }
    },
    {
      ...(rtl ? { "astrolabe.editorLang": "ar" } : {}),
      "astrolabe.paneWidths": JSON.stringify({ sidebar: 560, panel: 560 }),
      "astrolabe.panelCollapsed": "false",
    },
  );
  await page.goto(`${url}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".s-app", { timeout: 20000 });
  await page.waitForTimeout(900);

  // Down the ladder and back up, sampling the frame after each step rather
  // than the settled layout.
  for (const width of [1093, 904, 1093, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    const m = await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const w = (s) => { const el = document.querySelector(s); return el ? Math.round(el.getBoundingClientRect().width) : null; };
      done({ inner: innerWidth, main: w(".s-main"), sidebar: w(".s-sidebar"), panel: w(".s-panel") });
    }))));
    const where = `live ${width}×${dpr}${rtl ? " rtl" : ""}`;
    ok(where, m.inner === width, `asked for ${width} CSS px, got ${m.inner}`);
    ok(where, m.main >= MAIN_MIN - 1, `one frame after the resize the note column is ${m.main}px, floor is ${MAIN_MIN}`);
    ok(where, m.sidebar + m.panel + m.main <= width + 2, `the panes total ${m.sidebar + m.panel + m.main} in a ${width}px window`);
  }
  await ctx.close();
}

/** AND THE PHONE'S NOTES DRAWER STILL SLIDES. It rides on `.s-sidebar`, the
 *  same element the "do not animate" class freezes, so a flag raised for the
 *  outline panel's automatic collapse and never lowered stopped the drawer
 *  moving at all — measured `transition-property: none`, left −330 → 0 in one
 *  frame. The gate for windows owns this because it is the same flag. */
async function phoneDrawer() {
  const browser = await browserFor("mouse");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem("astrolabe.whatsnewSeen", "9.9.9");
      localStorage.setItem("astrolabe.prefs-sync-off", "1");
    } catch {
      // a context with storage blocked still renders the defaults
    }
  });
  await page.goto(`${url}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".s-app", { timeout: 20000 });
  await page.waitForTimeout(900);
  const where = "phone drawer";
  const btn = await page.$(".s-drawer-btn");
  ok(where, btn !== null, "the phone shell should offer a ☰");
  if (btn) {
    await btn.tap();
    await page.waitForTimeout(40);
    const m = await page.evaluate(() => {
      const el = document.querySelector(".s-sidebar");
      const cs = getComputedStyle(el);
      return { property: cs.transitionProperty, duration: cs.transitionDuration, left: Math.round(el.getBoundingClientRect().left) };
    });
    ok(where, m.property.includes("transform"), `the drawer's transition is "${m.property}" — it should slide`);
    ok(where, m.left < 0, `40ms into the slide the drawer is already fully open at ${m.left}`);
  }
  await ctx.close();
}

/** AND THE READER'S OWN FOLD STILL SLIDES.
 *
 *  The two rungs above are both about widths the reader did not ask for. This
 *  is the other side of the same flag, and it broke twice while this gate was
 *  being written: once because the automatic collapse's class was never
 *  lowered, and once because the resize path's style flush ran on the same
 *  effect as a fold and committed the collapse before the browser had a width
 *  to animate from. A fold is the reader's gesture; the 0.18s belongs to it.
 *
 *  Run at a width BELOW NARROW_QUERY, because that is where the automatic
 *  collapse has already fired and the flag is up when the reader reaches for
 *  the fold. */
async function readerFold({ width }) {
  const browser = await browserFor("mouse");
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 1 });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem("astrolabe.whatsnewSeen", "9.9.9");
      localStorage.setItem("astrolabe.prefs-sync-off", "1");
    } catch {
      // a context with storage blocked still renders the defaults
    }
  });
  await page.goto(`${url}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".s-app", { timeout: 20000 });
  await page.waitForTimeout(900);
  const where = `fold at ${width}`;
  const full = await page.evaluate(() => Math.round(document.querySelector(".s-sidebar").getBoundingClientRect().width));
  await page.keyboard.press("Control+Alt+KeyB");
  await page.waitForTimeout(60);
  const mid = await page.evaluate(() => ({
    w: Math.round(document.querySelector(".s-sidebar").getBoundingClientRect().width),
    duration: getComputedStyle(document.querySelector(".s-sidebar")).transitionDuration,
    folded: document.querySelector(".s-app").classList.contains("s-app--nosidebar"),
  }));
  ok(where, mid.folded, "Ctrl/Cmd+Alt+B should fold the sidebar");
  ok(where, !mid.duration.startsWith("0s"), `the fold has no transition to run (duration ${mid.duration})`);
  ok(where, mid.w > 1 && mid.w < full, `60ms into the fold the sidebar is ${mid.w}px of ${full} — it did not slide`);
  await page.waitForTimeout(400);
  const done = await page.evaluate(() => Math.round(document.querySelector(".s-sidebar").getBoundingClientRect().width));
  ok(where, done <= 1, `the fold settled at ${done}px`);
  await ctx.close();
}

// The ladder proper: every width at every ratio, under a mouse, which is the
// posture the report came from and the one every assertion above is strictest
// about.
for (const dpr of RATIOS) await ladder({ dpr, posture: "mouse", rtl: false, seeded: false });
// The same ladder with two panes dragged to their maximum and remembered.
for (const dpr of RATIOS) await ladder({ dpr, posture: "mouse", rtl: false, seeded: true });
// Arabic: the panes swap edges, the grips follow the inline direction, and
// every Wine run so far was LTR.
await ladder({ dpr: 1, posture: "mouse", rtl: true, seeded: false });
await ladder({ dpr: 1.5, posture: "mouse", rtl: true, seeded: true });
// The two Windows postures a laptop can be in.
await ladder({ dpr: 1.25, posture: "slate", rtl: false, seeded: false });
await ladder({ dpr: 1.25, posture: "touchlaptop", rtl: false, seeded: false });
// What the reader sees WHILE the window is being dragged, not after.
await liveResize({ dpr: 1, rtl: false });
await liveResize({ dpr: 1.5, rtl: true });
await readerFold({ width: 1300 });
await readerFold({ width: 1440 });
await phoneDrawer();

for (const each of browsers.values()) await each.close();

if (errs.length) {
  console.error(`\ncheck-windows-layout: ${errs.length} failure(s) in ${checks} checks\n`);
  for (const e of errs) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`check-windows-layout: ${checks} checks across ${WIDTHS.length} widths × ${RATIOS.length} ratios — WINDOWS LAYOUT OK`);
