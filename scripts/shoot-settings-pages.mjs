// Photograph every settings page — the desktop dialog at 1280×800 and the
// phone shell at 412×915, in English and Arabic, dark and light — for review.
//
//   CHROMIUM=/usr/bin/chromium node scripts/shoot-settings-pages.mjs <url> <password> <out-dir> [en|ar] [dark|light] [desktop|phone]
//
// Not a gate: it asserts nothing. The walk (scripts/settings-walk.mjs, under
// check-fidelity and check-phone) is what proves the pages; this is the
// camera the design pass was reviewed with (contracts/settings-design.md).

import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { visiblePages } from "../client/components/settings/tabs.ts";

const [url, password, out, onlyLang, onlyTheme, onlyHost] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage: node scripts/shoot-settings-pages.mjs <url> <password> <out-dir> [en|ar] [dark|light] [desktop|phone]");
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const THEMES = { dark: "github-dark", light: "github-light" };

async function session(host, lang, theme) {
  const viewport = host === "desktop" ? { width: 1280, height: 800 } : { width: 412, height: 915 };
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: host === "phone", hasTouch: host === "phone" });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(async (pw) => {
    await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) });
  }, password);
  await page.evaluate(
    ([l, th]) => {
      localStorage.setItem("astrolabe.whatsnewSeen", "9.9.9");
      localStorage.setItem("astrolabe.prefs-sync-off", "1");
      localStorage.setItem("astrolabe.tourSeen", "1");
      localStorage.setItem("astrolabe.editorLang", l);
      localStorage.setItem("astrolabe.theme", th);
      localStorage.removeItem("astrolabe:settings-tab");
    },
    [lang, THEMES[theme]],
  );
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1500);
  return { ctx, page };
}

const pocket = false;
for (const host of ["desktop", "phone"]) {
  if (onlyHost && host !== onlyHost) continue;
  for (const lang of ["en", "ar"]) {
    if (onlyLang && lang !== onlyLang) continue;
    for (const theme of ["dark", "light"]) {
      if (onlyTheme && theme !== onlyTheme) continue;
      const { ctx, page } = await session(host, lang, theme);
      const pages = visiblePages(pocket);
      if (host === "desktop") {
        await page.keyboard.press("Control+p");
        await page.waitForTimeout(300);
        await page.keyboard.type(lang === "ar" ? "الإعدادات" : "Settings");
        await page.waitForTimeout(300);
        await page.keyboard.press("Enter");
        await page.waitForSelector(".s-smodal .s-smodal__railbtn", { timeout: 15000 });
        for (const [i, s] of pages.entries()) {
          await page.locator(`#s-smodal-tab-${s.id}`).click();
          await page.waitForTimeout(450);
          await page.screenshot({ path: `${out}/desktop-${lang}-${theme}-${String(i + 1).padStart(2, "0")}-${s.id}.png` });
        }
      } else {
        await page.goto(`${url}/?`, { waitUntil: "load" });
        await page.waitForTimeout(1200);
        const more = page.locator(".s-ph-tab[data-tab='more']");
        await more.click().catch(() => {});
        await page.waitForTimeout(500);
        await page.locator(".s-ph-more .s-ph-row", { hasText: lang === "ar" ? /^الإعدادات$/ : /^Settings$/ }).first().click();
        await page.waitForSelector("[data-screen='settings'] .s-ph-row[data-section]", { timeout: 10000 });
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${out}/phone-${lang}-${theme}-00-list.png`, fullPage: false });
        for (const [i, s] of pages.entries()) {
          await page.locator(`[data-screen='settings'] .s-ph-row[data-section="${s.id}"]`).click();
          await page.waitForSelector(`[data-screen='settings-section'][data-section="${s.id}"]`, { timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(700);
          await page.screenshot({ path: `${out}/phone-${lang}-${theme}-${String(i + 1).padStart(2, "0")}-${s.id}.png` });
          await page.goBack();
          await page.waitForTimeout(600);
        }
      }
      await ctx.close();
      console.log(`shot ${host} ${lang} ${theme}`);
    }
  }
}
await browser.close();
