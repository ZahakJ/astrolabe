// The SIDE PANEL gate: the right panel's stack of sections, driven.
//
//   node scripts/check-sidepanel.mjs http://127.0.0.1:7451 <password>
//   env: CHROMIUM=/usr/bin/chromium
//
// WHY THIS EXISTS. The panel used to be one scroller with eleven sections
// poured into it, and the owner's report was the failure that shape makes:
// Nearby and everything under the backlinks were below a list you had to
// scroll past to find. The stack (client/components/PanelStack.tsx, the
// arithmetic in client/sidePanel.ts) promises three things a screenshot
// cannot check, and this gate holds them at three window heights, with every
// section open:
//
//   1. NO SECTION IS UNREACHABLE. Every header lies inside the stack's box,
//      and the stack itself does not scroll — unless the window is too short
//      for every open section's minimum, the one case it is allowed to.
//   2. A SPLITTER KEEPS A MINIMUM. Dragged (and pushed with End and Home) as
//      far as it goes, no open body is left below BODY_MIN, or its content
//      when that is shorter; and the total height never changes.
//   3. THE CONTROLS ARE WHAT THEY SAY. Each header is a button with
//      aria-expanded that controls a labelled region; each splitter a
//      focusable separator with a value; a fold, a drag and a reorder survive
//      a reload; fold-all folds every section.
//
// It seeds nothing in the vault: it opens the note with the most backlinks.

import { chromium } from "playwright";

const [url = "http://127.0.0.1:7451", password = ""] = process.argv.slice(2);
const executablePath = process.env.CHROMIUM;
const BODY_MIN = 64;
const BODY_FLOOR = 32;
const HEIGHTS = [900, 700, 520];

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
    return {
      top: sr.top,
      bottom: sr.bottom,
      scrolls: stack.scrollHeight > stack.clientHeight + 1,
      overflow: stack.classList.contains("s-pstack--overflow"),
      sections: [...stack.querySelectorAll(".s-psec")].map((s) => {
        const head = s.querySelector(".s-psec__head").getBoundingClientRect();
        const toggle = s.querySelector(".s-psec__toggle");
        const body = s.querySelector(".s-psec__body");
        const content = s.querySelector(".s-psec__content");
        const split = s.querySelector(":scope > .s-psec__split");
        const controls = toggle?.getAttribute("aria-controls");
        return {
          id: s.dataset.section,
          headTop: head.top,
          headBottom: head.bottom,
          expanded: toggle?.getAttribute("aria-expanded"),
          isButton: toggle?.tagName === "BUTTON",
          controlsRegion: controls ? document.getElementById(controls) === body : false,
          region: body.getAttribute("role"),
          labelled: body.getAttribute("aria-labelledby") === toggle?.id,
          body: body.getBoundingClientRect().height,
          content: content.getBoundingClientRect().height,
          fill: s.classList.contains("s-psec--fill"),
          split: split
            ? {
                role: split.getAttribute("role"),
                tab: split.tabIndex,
                value: split.getAttribute("aria-valuenow"),
                label: split.getAttribute("aria-label"),
              }
            : null,
        };
      }),
    };
  });

const floorOf = (s) => (s.fill ? BODY_FLOOR : Math.min(BODY_FLOOR, s.content));

for (const height of HEIGHTS) {
  const where = `${height}px`;
  const { ctx, page, pageErrors } = await openAt(height, ALL_OPEN);
  let m = await read(page);
  ok(where, m !== null, "no stack in the panel");
  if (!m) {
    await ctx.close();
    continue;
  }
  ok(where, m.sections.length >= 3, `only ${m.sections.length} sections drawn`);
  // 1. Every header inside the stack's box; the stack does not scroll.
  for (const s of m.sections) {
    const inside = s.headTop >= m.top - 1 && s.headBottom <= m.bottom + 1;
    ok(where, inside || m.overflow, `${s.id}'s header is out of reach (${Math.round(s.headTop)}–${Math.round(s.headBottom)} in ${Math.round(m.top)}–${Math.round(m.bottom)})`);
    ok(where, s.expanded === "true", `${s.id} did not open`);
    ok(where, s.isButton && s.controlsRegion, `${s.id}'s header is not a button controlling its body`);
    ok(where, s.region === "region" && s.labelled, `${s.id}'s open body is not a region labelled by its header`);
    ok(where, s.body >= floorOf(s) - 1, `${s.id}'s body is ${Math.round(s.body)}px`);
  }
  ok(where, !m.scrolls || m.overflow, "the stack scrolls as a whole although its minimums fit");
  // Splitters: one above every open section but the first.
  const splits = m.sections.slice(1).filter((s) => s.split);
  ok(where, splits.length === m.sections.length - 1, `${splits.length} splitters for ${m.sections.length} open sections`);
  for (const s of splits) {
    ok(where, s.split.role === "separator" && s.split.tab === 0 && s.split.value !== null && !!s.split.label, `${s.id}'s splitter is not a focusable, labelled separator with a value`);
  }

  // 2. Push every splitter to both ends; nothing goes below its minimum and
  //    the total holds.
  if (!m.overflow && splits.length > 0) {
    const total = (x) => x.sections.reduce((a, s) => a + s.body, 0);
    const before = total(m);
    for (const key of ["End", "Home"]) {
      for (const s of splits) {
        await page.locator(`.s-panel [data-section="${s.id}"] > .s-psec__split`).focus();
        await page.keyboard.press(key);
      }
      await page.waitForTimeout(300);
      m = await read(page);
      for (const s of m.sections) {
        const min = s.fill ? BODY_MIN : Math.min(BODY_MIN, s.content);
        ok(`${where} ${key}`, s.body >= Math.min(min, before / m.sections.length) - 1, `${s.id} squeezed to ${Math.round(s.body)}px (min ${Math.round(min)})`);
      }
      ok(`${where} ${key}`, Math.abs(total(m) - before) <= 2, `the total moved from ${Math.round(before)} to ${Math.round(total(m))}`);
    }
    // Every splitter dragged past the window's top edge and past its bottom
    // one. Measured WHILE the button is held and again after: the live drag
    // is the splitter's own arithmetic (dragSplit), the settled one is the
    // layout's, and each must hold the minimum on its own. Which drag reaches
    // a minimum depends on what can grow on the other side (a list stops at
    // its content, the graph never does), so all of them are tried.
    let box = null;
    for (const s of splits) {
      const handle = page.locator(`.s-panel [data-section="${s.id}"] > .s-psec__split`);
      for (const toY of [0, height - 1]) {
        box = await handle.boundingBox();
        if (!box) continue;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2, toY, { steps: 10 });
        for (const phase of ["held", "let go"]) {
          if (phase === "let go") {
            await page.mouse.up();
            await page.waitForTimeout(250);
          }
          m = await read(page);
          for (const x of m.sections) {
            const min = x.fill ? BODY_MIN : Math.min(BODY_MIN, x.content);
            ok(`${where} drag ${s.id}→${toY} ${phase}`, x.body >= Math.min(min, before / m.sections.length) - 1, `${x.id} squeezed to ${Math.round(x.body)}px`);
          }
          ok(`${where} drag ${s.id}→${toY} ${phase}`, Math.abs(total(m) - before) <= 2, `the total moved from ${Math.round(before)} to ${Math.round(total(m))}`);
        }
      }
    }
    if (box) {
      // The drag is kept, exactly, across a reload.
      const kept = m.sections.map((s) => Math.round(s.body));
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      const again = (await read(page)).sections.map((s) => Math.round(s.body));
      ok(`${where} drag`, kept.every((h, i) => Math.abs(h - again[i]) <= 2), `a reload changed the heights ${kept} → ${again}`);
    }
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
  const order = m.sections.map((s) => s.id).join(",");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  m = await read(page);
  ok(where, m.sections.map((s) => s.id).join(",") === order, "a reload changed the order");
  ok(where, m.sections.find((s) => s.id === first)?.expanded === "false", "a reload reopened a folded section");
  // Fold all, then open all.
  await page.locator(".s-panel .s-pstack__foldall").click();
  await page.waitForTimeout(400);
  m = await read(page);
  ok(where, m.sections.every((s) => s.expanded === "false"), "fold-all left a section open");
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
