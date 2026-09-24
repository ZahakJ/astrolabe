// What the store does to the document rather than to itself: the theme and
// language attributes on <html>, the custom stylesheet, the site's fonts, the
// favicon. Moved out of client/state.ts unchanged.

import { setLang, setNumeralLocale, type Lang } from "../i18n.ts";
import type { ThemeChoice } from "../themes.ts";
import { applyThemeChoice } from "../design/customThemes.ts";

/** Add (or drop) the instance stylesheet link for ASTROLABE_DATA/custom.css.
 *  Appended to <head> so it lands after every built-in stylesheet and its
 *  rules win ties — that is the whole point of a custom.css. */
export function ensureCustomCss(enabled: boolean, version = ""): void {
  const existing = document.head.querySelector<HTMLLinkElement>("link[data-astrolabe-custom]");
  // The version rides as ?v= so a changed file is a new URL — an edge that
  // caches `.css` by extension whatever the origin says (Cloudflare gave it
  // four hours) otherwise serves the old rules until they expire.
  const href = version ? `/api/custom.css?v=${encodeURIComponent(version)}` : "/api/custom.css";
  if (enabled && existing && existing.getAttribute("href") !== href) existing.remove();
  const current = document.head.querySelector("link[data-astrolabe-custom]");
  if (enabled && !current) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-astrolabe-custom", "");
    document.head.appendChild(link);
  } else if (!enabled && current) {
    current.remove();
  }
}

/** Add (or drop) the generated typography stylesheet, /api/site-fonts.css.
 *  `sig` is the four-slot signature from /api/me: present = the instance
 *  chose catalog faces, and its value rides along as ?v= so a changed pick
 *  gives the browser a new URL to fetch rather than a cached stylesheet
 *  naming the old families. Inserted BEFORE any custom.css link so a
 *  hand-written --font-serif override still wins — the escape hatch outranks
 *  the catalog, never the other way round. */
export function ensureSiteFonts(sig: string | null): void {
  const existing = document.head.querySelector<HTMLLinkElement>("link[data-astrolabe-fonts]");
  if (sig === null) {
    existing?.remove();
    return;
  }
  const href = `/api/site-fonts.css?v=${encodeURIComponent(sig)}`;
  if (existing) {
    if (existing.getAttribute("href") !== href) existing.setAttribute("href", href);
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute("data-astrolabe-fonts", "");
  const custom = document.head.querySelector("link[data-astrolabe-custom]");
  if (custom) document.head.insertBefore(link, custom);
  else document.head.appendChild(link);
}

/** Point the shell's icon link at /favicon.ico when the instance configured a
 *  favicon (settings.json), restoring the built-in inline glyph otherwise.
 *  The ?v= buster makes a just-saved favicon show up in the tab immediately —
 *  browsers cache favicons aggressively. */
let defaultFaviconHref: string | null = null;
export function ensureFavicon(enabled: boolean): void {
  const link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) return;
  if (defaultFaviconHref === null) {
    // First sight: remember the shell's own icon (the inline glyph — or
    // /favicon.ico already, when the server injected it before first paint).
    defaultFaviconHref = link.getAttribute("href") ?? "";
  }
  if (enabled) {
    link.href = `/favicon.ico?v=${Date.now()}`;
  } else if (link.getAttribute("href")?.startsWith("/favicon.ico") && !defaultFaviconHref.startsWith("/favicon.ico")) {
    link.href = defaultFaviconHref;
  }
}

/** One writer for both theme attributes — see client/design/customThemes.ts.
 *  A built-in sets `data-theme` alone; a custom theme sets `data-theme` to its
 *  BASE and `data-custom-theme` to itself, so the generated override sheet
 *  wins on specificity and every untouched token still comes from tokens.css. */
export function applyTheme(theme: ThemeChoice): void {
  applyThemeChoice(theme);
}

/** Apply the chrome language to the document: <html dir/lang> drive the CSS
 *  logical properties (the whole chrome mirrors under dir="rtl") and the
 *  i18n module's active dictionary. Called from loadMe, so saving a new
 *  language in the settings panel re-skins the shell live — no reload. */
export function applyLanguage(lang: Lang, locale: string): void {
  setLang(lang);
  // THE CHROME'S NUMERALS FOLLOW THE CHROME'S LANGUAGE, not the site locale.
  // They used to follow `locale` (the blog's), and on an instance whose site
  // is Arabic that put Eastern Arabic digits inside an ENGLISH interface — the
  // owner met it as "the zoom shows ١٤٠٪ and my editor is in English", which
  // is mixed-script chrome, the exact thing tf()'s isolates exist to prevent
  // one level down. Visitor CARD dates go through siteDate(), which now
  // takes month names from the chrome language and digits from localeDigits.
  // Month names follow that same chrome language in siteDate(); blogLocale
  // is still passed in so a regional tag (ar-EG, en-GB) can survive when it
  // matches.
  setNumeralLocale(lang === "ar" ? locale || "ar" : "en");
  const root = document.documentElement;
  if (lang === "ar") {
    root.setAttribute("dir", "rtl");
    root.setAttribute("lang", "ar");
  } else {
    root.removeAttribute("dir");
    root.setAttribute("lang", "en");
  }
}
