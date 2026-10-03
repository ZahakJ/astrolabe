// GATE: a tracker's folder chip on the Media page SHOWS the folder in the tree.
//   node scripts/check-media.mjs [http://localhost:6801]
//   env: CHROMIUM=/usr/bin/chromium
//        ASTROLABE_PASSWORD=<pw>  — when the instance sets ADMIN_PASSWORD_HASH.
// Exits 1 on any miss. Run it like check-caret.
//
// The owner, from the Media page (3.39.3): "can you make it possible to open
// the directory for a book through the media view? like just highlight it on
// the left bar". The chip existed and did two things, neither visible: for a
// folder with its own note it opened the note and never touched the tree; for
// a plain folder it moved the tree's keyboard cursor to a CLOSED row, and the
// cursor ring draws only while the tree holds focus, which a click on the
// Media page never gives it. So this gate writes two trackers — one over a
// plain folder of two notes, one over a folder that has its own note — opens
// the Media page, presses each chip, and asks the tree: is the folder's row
// there, is it unfolded (its first note's row on screen), is it painted (the
// revealed class on it and a background that is not transparent), is the
// sidebar open; and for the noted folder, did the note open as well. Then it
// deletes what it wrote, permanently, however the run ends.

import { chromium } from "playwright";

const [url = "http://localhost:6801"] = process.argv.slice(2);
const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const ROOT = "Media gate";
const PLAIN = `${ROOT}/Plain folder`;
const NOTED = `${ROOT}/Noted folder`;
const FIXTURES = [
  [`${PLAIN}/One.md`, "# One\n\nfirst\n"],
  [`${PLAIN}/Two.md`, "# Two\n\nsecond\n"],
  [`${NOTED}/Noted folder.md`, "# Noted folder\n\nthe folder's own note\n"],
  [`${NOTED}/Chapter.md`, "# Chapter\n\nx\n"],
  ["Media/Books/Media gate plain.md", `---\ntitle: "Media gate plain"\n---\n\n\`\`\`tracker\ntitle: Media gate plain\nkind: book\nprogress: 1/9\nunit: chapters\nstatus: reading\nfolder: ${PLAIN}\n\`\`\`\n`],
  ["Media/Books/Media gate noted.md", `---\ntitle: "Media gate noted"\n---\n\n\`\`\`tracker\ntitle: Media gate noted\nkind: book\nprogress: 2/9\nunit: chapters\nstatus: reading\nfolder: ${NOTED}\n\`\`\`\n`],
];

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures += 1;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
// One context: the session is a cookie (see check-caret).
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const apiPage = await context.newPage();
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

let wrote = false;
const restore = async () => {
  if (wrote) {
    for (const [p] of FIXTURES) {
      await api(`/api/note?path=${encodeURIComponent(p)}&permanent=true`, { method: "DELETE" }).catch(() => {});
    }
    await api(`/api/folder?path=${encodeURIComponent(ROOT)}&permanent=true`, { method: "DELETE" }).catch(() => {});
  }
  await browser.close().catch(() => {});
};

/** What the tree says about a folder's row right now. */
const rowState = (page, folder, firstNote) =>
  page.evaluate(
    ([f, n]) => {
      const row = document.querySelector(`[data-tree-path="${CSS.escape(f)}"]`);
      const cs = row ? getComputedStyle(row) : null;
      const sidebar = document.querySelector(".s-sidebar, [data-pane='sidebar'], aside");
      return {
        found: row !== null,
        revealed: row?.classList.contains("s-tree__item--revealed") ?? false,
        painted: cs !== null && cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent",
        unfolded: document.querySelector(`[data-tree-path="${CSS.escape(n)}"]`) !== null,
        onScreen: row ? (() => { const r = row.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.width > 0; })() : false,
        sidebarShown: sidebar ? getComputedStyle(sidebar).display !== "none" && sidebar.getBoundingClientRect().width > 0 : null,
        path: location.pathname,
      };
    },
    [folder, firstNote],
  );

try {
  let me = (await api("/api/me")).body;
  if (!me.admin) {
    const password = process.env.ASTROLABE_PASSWORD ?? "";
    if (!password) {
      console.error("check-media: not an admin session; run against open local mode or set ASTROLABE_PASSWORD.");
      await restore();
      process.exit(2);
    }
    const res = await api("/api/login", json("POST", { password }));
    if (res.status !== 200) {
      console.error(`check-media: login failed (${res.status}). Refusing.`);
      await restore();
      process.exit(2);
    }
    me = (await api("/api/me")).body;
  }
  if (me.pocket === true) {
    console.log("check-media: a pocket vault has no Media page; nothing to check.");
    await restore();
    process.exit(0);
  }

  for (const [path, content] of FIXTURES) {
    const w = await api(`/api/note?path=${encodeURIComponent(path)}`, json("PUT", { content }));
    wrote = true;
    check(w.status === 200 || w.status === 201, `fixture written  ${path}`, w.status === 200 || w.status === 201 ? "" : `${w.status} ${JSON.stringify(w.body).slice(0, 120)}`);
  }

  const page = await context.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem("astrolabe.whatsnewSeen", "9.0.0");
    } catch {
      /* no storage */
    }
  });

  // ── The plain folder: the chip reveals it, open and painted, and the page stays ──
  await page.goto(`${url}/media`, { waitUntil: "domcontentloaded" });
  await page.locator(".s-media__folder", { hasText: "Plain folder" }).first().waitFor({ timeout: 15000 });
  const plainChip = page.locator(".s-media__folder", { hasText: "Plain folder" }).first();
  check(/2/.test((await plainChip.textContent()) ?? ""), "plain: the chip counts the folder's two notes", (await plainChip.textContent()) ?? "");
  await plainChip.click();
  await page.waitForTimeout(600);
  const plain = await rowState(page, PLAIN, `${PLAIN}/One.md`);
  check(plain.path === "/media", "plain: the Media page stays (no note to open)", plain.path);
  check(plain.found, "plain: the folder's row is in the tree");
  check(plain.unfolded, "plain: the folder is revealed OPEN — its first note's row is drawn");
  check(plain.revealed && plain.painted, "plain: the row is painted without the tree holding focus", JSON.stringify({ revealed: plain.revealed, painted: plain.painted }));
  check(plain.onScreen, "plain: the row is scrolled on screen");
  check(plain.sidebarShown !== false, "plain: the sidebar is open");
  await page.waitForTimeout(3 * 720 + 300);
  const after = await rowState(page, PLAIN, `${PLAIN}/One.md`);
  check(!after.revealed, "plain: the pulse is a mark of arrival — gone after three beats");

  // ── The noted folder: the note opens AND the folder is revealed ──
  await page.goto(`${url}/media`, { waitUntil: "domcontentloaded" });
  const notedChip = page.locator(".s-media__folder", { hasText: "Noted folder" }).first();
  await notedChip.waitFor({ timeout: 15000 });
  await notedChip.click();
  await page.waitForTimeout(800);
  const noted = await rowState(page, NOTED, `${NOTED}/Chapter.md`);
  check(decodeURIComponent(noted.path).endsWith("/Noted folder/Noted folder"), "noted: the folder's own note opens", decodeURIComponent(noted.path));
  check(noted.found && noted.unfolded, "noted: the folder is revealed open in the tree as well", JSON.stringify({ found: noted.found, unfolded: noted.unfolded }));
  check(noted.revealed && noted.painted, "noted: the row is painted", JSON.stringify({ revealed: noted.revealed, painted: noted.painted }));
} catch (e) {
  console.error(e);
  failures += 1;
} finally {
  await restore();
}

if (failures > 0) {
  console.error(`\nMEDIA FAILED: ${failures} miss(es)`);
  process.exit(1);
}
console.log("\nMEDIA OK");
