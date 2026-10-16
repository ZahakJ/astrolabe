// Renders the brand assets that are pictures: docs/brand/hero.html →
// docs/brand/hero.png (the brand card; the README banner and the og:image are the
// editor-and-site composite, docs/media/hero-split-v3.png and docs/gh-hero-v3.png).
//   CHROMIUM=/usr/bin/chromium node scripts/shoot-brand.mjs
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/usr/bin/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
await page.goto(`file://${root}docs/brand/hero.html`);
await page.waitForTimeout(200);
await page.screenshot({ path: `${root}docs/brand/hero.png` });
console.log("wrote docs/brand/hero.png");
await browser.close();
