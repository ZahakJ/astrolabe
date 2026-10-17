// The SIDE PANEL gate: the right panel's stack of sections, driven.
//
//   node scripts/check-sidepanel.mjs http://127.0.0.1:7451 <password>
//   env: CHROMIUM=/usr/bin/chromium
//
// WHY THIS EXISTS. 3.45.0 gave every section a box of its own that
// scrolled, and splitters to share the panel's height between them; 3.45.1
// put the panel back as it was — every open section showing all of itself,
// the panel scrolling as a whole — and kept the folding headers.
// This gate holds what that promises, with every section open, at two
// window heights:
//
//   1. NOTHING SCROLLS BUT THE PANEL. No section body, and nothing inside
//      one, is a scroller with hidden content: each is as tall as what it
//      holds. When the sections are taller than the window the stack under
//      the bar scrolls, and every header can be scrolled to. No splitter is
//      left in the DOM.
//   2. A LONG LIST IS CUT, NOT BOXED. A list that can run long shows at most
//      LIST_FIRST rows and a "Show N more" button that adds rows.
//   3. THE CONTROLS ARE WHAT THEY SAY. Each header is a button with
//      aria-expanded that controls a labelled region; a fold and a reorder
//      (drag and Alt+↑) survive a reload; fold-all folds every section.
//
// It seeds nothing in the vault: it opens the note with the most backlinks.

import { chromium } from "playwright";

const [url = "http://127.0.0.1:7451", password = ""] = process.argv.slice(2);
const executablePath = process.env.CHROMIUM;
const LIST_FIRST = 20;
const HEIGHTS = [900, 520];

const errs = [];
let checks = 0;
const ok = (where, condition, message) => {
  checks++;
  if (!condition) errs.push(`${where}: ${message}`);
};

const login = await fetch(`${url}/api/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password }),
});
if (!login.ok) {
  console.error(`check-sidepanel: login failed (${login.status}). Wrong password?`);
  process.exit(1);
}
const host = new URL(url).hostname;
const cookies = (login.headers.getSetCookie?.() ?? []).map((raw) => {
  const [pair] = raw.split(";");
  const i = pair.indexOf("=");
  return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: host, path: "/" };
});

// The note the most links point at: the busiest panel the vault can show.
const tree = await (await fetch(`${url}/api/tree`, { headers: { cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") } })).json();
const paths = [];
(function walk(nodes) {
  for (const n of Array.isArray(nodes) ? nodes : (nodes?.children ?? nodes?.notes ?? [])) {
    if (n.children) walk(n.children);
    else if (typeof n.path === "string" && n.path.endsWith(".md")) paths.push(n.path);
  }
})(tree);
let note = null;
let most = -1;
for (const p of paths.slice(0, 200)) {
  const r = await fetch(`${url}/api/backlinks?path=${encodeURIComponent(p)}`, { headers: { cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") } });
  const list = r.ok ? await r.json() : [];
  if (Array.isArray(list) && list.length > most) {
    most = list.length;
    note = p;
  }
}
if (!note) {
  console.error("check-sidepanel: the vault has no notes to open");
  process.exit(1);
}
const noteUrl = `${url}/${note.replace(/\.md$/, "").split("/").map(encodeURIComponent).join("/")}`;

const ALL_OPEN = JSON.stringify({
  collapsed: Object.fromEntries(
    ["outline", "footnotes", "localgraph", "tracker", "history", "backlinks", "nearby", "related", "suggest", "mentions", "onthisday"].map((id) => [id, false]),
  ),
});

const browser = await chromium.launch({ executablePath });

async function openAt(height, stored) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height } });
  await ctx.addCookies(cookies);
  await ctx.addInitScript((seed) => {
    if (sessionStorage.getItem("check-sidepanel")) return;
    sessionStorage.setItem("check-sidepanel", "1");
    const kv = {
      "astrolabe.whatsnewSeen": "9.9.9",
      "astrolabe.tourSeen": "1",
      "astrolabe.prefs-sync-off": "1",
      "astrolabe.panelCollapsed": "false",
    };
    if (seed !== null) kv["astrolabe.sidepanel"] = seed;
    for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
  }, stored);
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(noteUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  return { ctx, page, pageErrors };
}

/** The stack, read in one round trip. */
const read = (page) =>
  page.evaluate(() => {
    const stack = document.querySelector(".s-panel .s-pstack");
    if (!stack) return null;
    const sr = stack.getBoundingClientRect();
    // Every element inside a section that clips content it could scroll to.
    const scrollers = [];
    for (const el of stack.querySelectorAll(".s-psec *")) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) {
        scrollers.push(`${el.closest(".s-psec").dataset.section}: ${el.className || el.tagName}`);
      }
    }
    return {
      top: sr.top,
      scrollTop: stack.scrollTop,
      scrollHeight: stack.scrollHeight,
      clientHeight: stack.clientHeight,
      scrollers,
      splitters: stack.querySelectorAll(".s-psec__split, [role=separator]").length,
      sections: [...stack.querySelectorAll(".s-psec")].map((s) => {
        const head = s.querySelector(".s-psec__head").getBoundingClientRect();
        const toggle = s.querySelector(".s-psec__toggle");
        const body = s.querySelector(".s-psec__body");
        const controls = toggle?.getAttribute("aria-controls");
        return {
          id: s.dataset.section,
          headTop: head.top - sr.top + stack.scrollTop,
          headBottom: head.bottom - sr.top + stack.scrollTop,
          expanded: toggle?.getAttribute("aria-expanded"),
          isButton: toggle?.tagName === "BUTTON",
          controlsRegion: controls ? document.getElementById(controls) === body : false,
          region: body.getAttribute("role"),
          labelled: body.getAttribute("aria-labelledby") === toggle?.id,
          body: body.getBoundingClientRect().height,
          more: !!body.querySelector(".s-psec__more"),
        };
      }),
    };
  });

/** The rows of the backlinks list: its cards. */
const backlinkRows = (page) => page.locator(".s-panel [data-section=backlinks] .s-backlink").count();

for (const height of HEIGHTS) {
  const where = `${height}px`;
  const { ctx, page, pageErrors } = await openAt(height, ALL_OPEN);
  const m = await read(page);
  ok(where, m !== null, "no stack in the panel");
  if (!m) {
    await ctx.close();
    continue;
  }
  ok(where, m.sections.length >= 3, `only ${m.sections.length} sections drawn`);
  // 1. Natural heights; the panel is the one scroller.
  ok(where, m.scrollers.length === 0, `a section scrolls inside itself: ${m.scrollers.slice(0, 4).join(" | ")}`);
  ok(where, m.splitters === 0, `${m.splitters} splitters left in the panel`);
  for (const s of m.sections) {
    ok(where, s.expanded === "true", `${s.id} did not open`);
    ok(where, s.isButton && s.controlsRegion, `${s.id}'s header is not a button controlling its body`);
    ok(where, s.region === "region" && s.labelled, `${s.id}'s open body is not a region labelled by its header`);
    ok(where, s.headBottom <= m.scrollHeight + 1, `${s.id}'s header is past the end of the panel's scroll`);
  }
  const content = m.sections.reduce((a, s) => a + (s.headBottom - s.headTop) + s.body, 0);
  if (content > m.clientHeight + 4) {
    ok(where, m.scrollHeight > m.clientHeight, "the open sections are taller than the panel, yet it does not scroll");
    const last = m.sections[m.sections.length - 1];
    await page.locator(`.s-panel [data-section="${last.id}"] .s-psec__toggle`).scrollIntoViewIfNeeded();
    const after = await read(page);
    ok(where, after.scrollTop > 0, `scrolling to ${last.id}'s header did not scroll the panel`);
  }

  // 2. The backlinks list is cut at LIST_FIRST, and "Show more" adds rows.
  const rows = await backlinkRows(page);
  ok(where, rows <= LIST_FIRST, `the backlinks list draws ${rows} cards at first`);
  const backlinks = m.sections.find((s) => s.id === "backlinks");
  if (backlinks?.more) {
    await page.locator(".s-panel [data-section=backlinks] .s-psec__more").click();
    await page.waitForTimeout(200);
    const grown = await backlinkRows(page);
    ok(where, grown > rows, `"Show more" left the backlinks at ${grown} cards`);
    const again = await read(page);
    ok(where, again.scrollers.length === 0, `a longer list made a section scroll inside itself: ${again.scrollers.slice(0, 4).join(" | ")}`);
  }
  ok(where, pageErrors.length === 0, `page errors: ${pageErrors.slice(0, 3).join(" | ")}`);
  await ctx.close();
}

// 3. Fold, fold-all, reorder — and a reload keeps them.
{
  const where = "controls";
  const { ctx, page, pageErrors } = await openAt(900, null);
  let m = await read(page);
  const first = m.sections[0].id;
  const last = m.sections[m.sections.length - 1].id;
  // Fold the first section with a click.
  await page.locator(`.s-panel [data-section="${first}"] .s-psec__toggle`).click();
  await page.waitForTimeout(400);
  m = await read(page);
  const folded = m.sections.find((s) => s.id === first);
  ok(where, folded.expanded === "false" && folded.body <= 1, `a click did not fold ${first} (${folded.expanded}, ${Math.round(folded.body)}px)`);
  // Move the last section to the top with Alt+↑, repeatedly.
  const head = page.locator(`.s-panel [data-section="${last}"] .s-psec__toggle`);
  await head.focus();
  for (let i = 0; i < m.sections.length; i++) await page.keyboard.press("Alt+ArrowUp");
  await page.waitForTimeout(300);
  m = await read(page);
  ok(where, m.sections[0].id === last, `Alt+↑ did not bring ${last} to the top (${m.sections.map((s) => s.id)})`);
  ok(where, await page.evaluate((id) => document.activeElement?.closest(".s-psec")?.dataset.section === id, last), "the moved header lost the focus");
  // Fold all: every section a header, so the whole stack is on screen for
  // the pointer reorder that follows.
  await page.locator(".s-panel .s-pstack__foldall").click();
  await page.waitForTimeout(300);
  m = await read(page);
  ok(where, m.sections.every((s) => s.expanded === "false"), "fold-all left a section open");
  // A pointer reorder: the (new) first header dragged below the last.
  const a = await page.locator(`.s-panel [data-section="${last}"] .s-psec__toggle`).boundingBox();
  const end = await page.locator(".s-panel .s-psec").last().boundingBox();
  await page.mouse.move(a.x + 40, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 40, a.y + 20, { steps: 4 });
  await page.mouse.move(a.x + 40, end.y + end.height - 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  m = await read(page);
  ok(where, m.sections[m.sections.length - 1].id === last, `a header drag did not move ${last} to the end (${m.sections.map((s) => s.id)})`);
  ok(where, m.sections.every((s) => s.expanded === "false"), "the drag's release opened a section");
  const order = m.sections.map((s) => s.id).join(",");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  m = await read(page);
  ok(where, m.sections.map((s) => s.id).join(",") === order, "a reload changed the order");
  ok(where, m.sections.every((s) => s.expanded === "false"), "a reload reopened a folded section");
  // Open all.
  await page.locator(".s-panel .s-pstack__foldall").click();
  await page.waitForTimeout(400);
  m = await read(page);
  ok(where, m.sections.every((s) => s.expanded === "true"), "open-all left a section folded");
  ok(where, pageErrors.length === 0, `page errors: ${pageErrors.slice(0, 3).join(" | ")}`);
  await ctx.close();
}

await browser.close();
if (errs.length > 0) {
  console.error(`check-sidepanel: ${errs.length} of ${checks} checks failed (note: ${note})\n  ${errs.join("\n  ")}`);
  process.exit(1);
}
console.log(`check-sidepanel: ${checks} checks passed on ${note} at ${HEIGHTS.join(", ")}px`);
