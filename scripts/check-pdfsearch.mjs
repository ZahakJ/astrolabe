// PDF SEARCH, IN A REAL BROWSER — the harness the feature shipped with.
//
//   CHROMIUM=/usr/bin/chromium node scripts/check-pdfsearch.mjs http://127.0.0.1:7423 <password> [outDir]
//
// Against a running server whose vault holds `Books/Treatise.pdf` with the
// word "zephyr" on page 3 and nowhere in a note (a three-page PDF written by
// hand is enough — tests/pdfText.test.ts shows the shape), it proves the whole
// loop rather than any one layer of it:
//
//   1. /api/search answers the word with a `kind: "book"` row naming page 3,
//      and `in:books` alone lists the shelf.
//   2. The sidebar draws the row — title, "p. 3" in the chrome's numerals, the
//      marked snippet — and the `?` card lists `in:books`.
//   3. Clicking the row opens the reader ON that page, by the road a citation
//      takes (client/books/door.ts::openBookPage).
//   4. The settings row is live: PATCH pdfSearch=false empties the book rows
//      at once, and null brings them back without a restart.
//
// Screenshots land in outDir (default /tmp/astrolabe-pdfsearch). Not an npm
// script: it needs a server, a vault and a browser, which is exactly the
// situation `npm test` exists to avoid.

import { mkdirSync } from "node:fs";

const [base, password, out = "/tmp/astrolabe-pdfsearch"] = process.argv.slice(2);
if (!base || !password) {
  console.error("usage: CHROMIUM=/usr/bin/chromium node scripts/check-pdfsearch.mjs <base url> <admin password> [outDir]");
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const { chromium } = await import("playwright");
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 400)));

const fail = (msg) => {
  console.log("FAIL:", msg);
  process.exitCode = 1;
};

// `load`, never `networkidle`: the app holds an SSE stream open for ever.
await page.goto(base, { waitUntil: "load" });
await page.waitForTimeout(800);
await page.evaluate(async (pw) => {
  await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: pw }),
  });
}, password);
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(1200);
// A new version opens its "what's new" deck once; it sits over the sidebar.
for (let i = 0; i < 3 && (await page.locator(".s-wn-overlay").count()); i++) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
}

// 1. The API: the shape the sidebar consumes.
const hits = await page.evaluate(() => fetch("/api/search?q=zephyr").then((r) => r.json()));
console.log("api hits:", JSON.stringify(hits));
const book = hits.find((h) => h.kind === "book");
if (!book) fail("no book hit from /api/search?q=zephyr");
else if (book.page !== 3 || book.path !== "Books/Treatise.pdf") fail(`wrong book hit ${JSON.stringify(book)}`);

const scoped = await page.evaluate(() => fetch("/api/search?q=in:books").then((r) => r.json()));
console.log("in:books:", JSON.stringify(scoped));
if (!scoped.length || scoped.some((h) => h.kind !== "book")) fail("in:books did not list the shelf alone");

// 2. The sidebar row and the help card.
const input = page.locator(".s-search__input");
await input.click();
await input.fill("zephyr");
await page.waitForSelector(".s-search-hit--book", { timeout: 8000 }).catch(() => fail("no book row in the sidebar"));
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/1-search-hit.png` });
const rowText = await page.locator(".s-search-hit--book").first().innerText().catch(() => "");
console.log("row:", JSON.stringify(rowText));
// localeNum wraps the digits in bidi isolates (U+2068/U+2069) by design.
if (!/Treatise\s+p\./.test(rowText) || !/p\.\s*⁨?3⁩?/.test(rowText)) fail(`row text unexpected: ${rowText}`);

await page.locator(".s-searchbar .s-iconbtn").first().click();
await page.waitForTimeout(300);
const help = await page.locator(".s-searchhelp").innerText().catch(() => "");
if (!/in:books/.test(help)) fail("help card does not list in:books");
await page.screenshot({ path: `${out}/2-help-card.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// 3. The click: the reader must open on page 3.
await page.locator(".s-search-hit--book").first().click();
await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}/3-reader-page.png` });
const url = page.url();
console.log("url:", url);
if (!/\/book\/Books\/Treatise\.pdf/.test(url)) fail(`reader did not open: ${url}`);
const pageText = await page.evaluate(() => document.body.innerText);
if (!/zephyr/i.test(pageText)) fail("reader does not show the page that holds the word");
else console.log("reader shows page 3");

// 4. The setting, live.
await page.keyboard.press("Escape");
const settings = await page.evaluate(() => fetch("/api/settings").then((r) => r.json()));
console.log("settings effective.pdfSearch:", settings.effective?.pdfSearch, "inherited:", settings.inherited?.pdfSearch);
if (settings.effective?.pdfSearch !== true) fail("effective.pdfSearch is not true");
const patch = (body) =>
  page.evaluate(
    (b) =>
      fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(
        (r) => r.status,
      ),
    body,
  );
const searchKinds = () =>
  page.evaluate(() => fetch("/api/search?q=zephyr").then((r) => r.json()).then((h) => h.map((x) => x.kind ?? "note")));
console.log("patch off:", await patch({ pdfSearch: false }), "kinds:", JSON.stringify(await searchKinds()));
if ((await searchKinds()).includes("book")) fail("book rows survive pdfSearch=false");
console.log("patch inherit:", await patch({ pdfSearch: null }), "kinds:", JSON.stringify(await searchKinds()));
if (!(await searchKinds()).includes("book")) fail("book rows do not return after pdfSearch=null");

await browser.close();
console.log(process.exitCode ? "PDFSEARCH FAILED" : "PDFSEARCH OK");
