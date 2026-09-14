// Dev harness (not shipped): exercise NOTE VERSIONS in the real UI — two
// autosaves over one note, the History section listing them beside git's
// commits, the version viewer, the confirm, and a restore that the open
// editor adopts. Run it against a scratch server started with a SHORT
// collapse window, since a five-minute wait is not a harness:
//
//   NOTE_VERSIONS_WINDOW_MS=1000 PORT=7311 HOST=127.0.0.1 … node server/index.ts
//   CHROMIUM=/usr/bin/chromium node scripts/shoot-versions.mjs http://127.0.0.1:7311 test /outdir Essay
//
// The vault must hold `<note>.md` before it starts; the harness types over it.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const [url = "http://127.0.0.1:7311", password = "test", out = "shots", note = "Essay"] =
  process.argv.slice(2);
mkdirSync(out, { recursive: true });
const executablePath = process.env.CHROMIUM;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));

const api = (path, init) =>
  page.evaluate(
    async ([p, i]) => {
      const r = await fetch(p, i);
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    [path, init ?? {}],
  );

await page.goto(url, { waitUntil: "load" });
// A visitor is refused before anything else happens.
console.log("[anon versions]", (await api(`/api/versions?path=${note}.md`)).status);
await api("/api/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ password }),
});
await page.goto(`${url}/${encodeURIComponent(note)}`, { waitUntil: "load" });
await page.waitForSelector(".cm-content", { timeout: 15_000 });
await page.waitForTimeout(900);
// A fresh device meets the release's what's-new deck first; it would take
// the clicks meant for the editor.
const deck = page.locator(".s-wn__close");
if (await deck.count()) {
  await deck.click();
  await page.waitForTimeout(400);
}

/** Replace the note's whole text and let the autosave land. */
const typeOver = async (text) => {
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type(text);
  await page.waitForTimeout(1500); // AUTOSAVE_MS is 600; the write follows
};

await typeOver("Second draft, typed in the browser.");
await page.waitForTimeout(1200); // past the harness's collapse window
await typeOver("Third draft, the one that went wrong.");

// The versions are there before the panel is opened.
const listed = await api(`/api/versions?path=${note}.md`);
console.log("[versions]", listed.status, JSON.stringify(listed.body?.versions?.map((v) => [v.reason, v.size])));

// Open the History section (collapsed by default) and read the timeline.
await page.locator(".s-history__toggle").click();
await page.waitForSelector(".s-histrow--version", { timeout: 10_000 });
const rows = await page.locator(".s-histrow").allTextContents();
console.log("[rows]", JSON.stringify(rows));
await page.screenshot({ path: `${out}/versions-1-timeline.png` });

// The newest version is the one before the last edit: "Second draft".
await page.locator(".s-histrow--version").first().click();
await page.waitForSelector(".s-revision__render p", { timeout: 10_000 });
console.log("[viewer]", await page.locator(".s-revision__render").innerText());
await page.screenshot({ path: `${out}/versions-2-viewer.png` });

await page.locator(".s-revision__restore").click();
await page.waitForSelector(".s-confirm", { timeout: 5_000 });
console.log("[confirm]", (await page.locator(".s-confirm").innerText()).replace(/\s+/g, " "));
await page.screenshot({ path: `${out}/versions-3-confirm.png` });
await page.locator(".s-confirm button").last().click();
await page.waitForTimeout(700);
console.log("[toast]", await page.locator(".s-toast").allTextContents());
await page.waitForTimeout(800);

// innerText of the editor carries the properties card's chrome ahead of the
// note's text, so the check is "ends with", not "equals".
const editorText = await page.locator(".cm-content").innerText();
console.log("[editor after restore]", JSON.stringify(editorText));
const disk = await api(`/api/note?path=${note}.md`);
console.log("[disk after restore]", JSON.stringify(disk.body?.content));
const after = await api(`/api/versions?path=${note}.md`);
console.log("[versions after]", JSON.stringify(after.body?.versions?.map((v) => v.reason)));
await page.screenshot({ path: `${out}/versions-4-restored.png` });

const ok =
  editorText.trim().endsWith("Second draft, typed in the browser.") &&
  disk.body?.content === "Second draft, typed in the browser." &&
  after.body?.versions?.[0]?.reason === "restore";
await browser.close();
console.log(ok ? "[shoot-versions] OK ->" : "[shoot-versions] FAILED ->", out);
process.exit(ok ? 0 : 1);
