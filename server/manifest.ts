// THE INSTALLABLE SITE: /manifest.webmanifest and its icon.
//
// A phone installs a site from its manifest, and the manifest is what puts
// the installed site in the share sheet (shared/manifest.ts declares the
// share target). Everything in it is the SITE's — its name, its default
// theme's colours, its favicon — and every one of those is a setting, so the
// document is built per request rather than shipped with the client. Both
// routes are open like /favicon.ico: a phone fetches them without a cookie,
// and they name nothing a stranger could not read off the login page.

import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { brandMarkSvg } from "../shared/brandMark.ts";
import { customThemeSlug } from "../shared/customTheme.ts";
import { buildManifest, DEFAULT_SWATCH, MANIFEST_ICON_PATH, MANIFEST_PATH, themeSwatch } from "../shared/manifest.ts";
import { THEMES } from "../shared/themes.ts";
import { contentTypeFor } from "./api.ts";
import { customThemes } from "./designs.ts";
import { faviconPath } from "./settings.ts";
import { siteLanguage, siteName, tagline, visitorTheme } from "./site.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const tokensFile = path.join(projectRoot, "client", "styles", "tokens.css");

// tokens.css is read once per change of the file — it ships with the code,
// so in practice once — and never on the request path.
let tokensStamp = "";
let tokensCss = "";
function tokens(): string {
  try {
    const stat = statSync(tokensFile);
    const stamp = `${stat.size}:${stat.mtimeMs}`;
    if (stamp !== tokensStamp) {
      tokensCss = readFileSync(tokensFile, "utf8");
      tokensStamp = stamp;
    }
  } catch {
    tokensCss = "";
    tokensStamp = "";
  }
  return tokensCss;
}

/** The ground and accent of the theme a visitor lands on: the pinned or
 *  mirrored theme's swatch, a custom theme's own `--bg`/`--accent` over its
 *  base's swatch, and the product default when nothing is set or readable. */
export function siteColours(): { bg: string; accent: string } {
  const css = tokens();
  const choice = visitorTheme() ?? THEMES[0];
  const slug = customThemeSlug(choice);
  if (slug !== null) {
    const custom = customThemes().find((t) => t.id === slug);
    if (custom) {
      const base = themeSwatch(css, custom.base) ?? DEFAULT_SWATCH;
      return { bg: custom.tokens["--bg"] ?? base.bg, accent: custom.tokens["--accent"] ?? base.accent };
    }
  }
  return themeSwatch(css, choice) ?? DEFAULT_SWATCH;
}

/** The mark on a plate in the site's colours: the favicon's drawing, sized
 *  for a launcher. The plate fills the whole box (no rounded corners) so a
 *  maskable icon has nothing to clip through; the mark sits inside the safe
 *  zone a launcher keeps (the middle 80%). */
export function manifestIconSvg(colours = siteColours()): string {
  const inner = brandMarkSvg({ size: 512, detail: "full", color: colours.accent })
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>$/, "");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512">` +
    `<rect width="100" height="100" fill="${colours.bg}"/>` +
    `<g transform="translate(18 18) scale(0.64)" fill="none" stroke="${colours.accent}" stroke-linecap="round" stroke-linejoin="round">${inner}</g></svg>`
  );
}

export const manifestRoutes = new Hono();

manifestRoutes.get(MANIFEST_PATH, (c) => {
  const colours = siteColours();
  const favicon = faviconPath();
  const doc = buildManifest({
    name: siteName(),
    description: tagline(),
    lang: siteLanguage(),
    // Both the ground: the splash and the status bar are painted in it, and
    // the accent is for the mark on the icon, not for a bar across the top of
    // the phone. `<meta name="theme-color">` below says the same colour.
    background: colours.bg,
    theme: colours.bg,
    // The configured favicon, when it is a raster a launcher can use; an SVG
    // favicon adds nothing the built-in mark does not already give.
    icons: favicon && !/\.svg$/i.test(favicon) ? [{ src: "/favicon.ico", type: contentTypeFor(favicon) }] : [],
  });
  return c.body(JSON.stringify(doc, null, 2), 200, {
    "Content-Type": "application/manifest+json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
});

manifestRoutes.get(MANIFEST_ICON_PATH, (c) =>
  c.body(manifestIconSvg(), 200, {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "no-cache",
    // Same belt as /favicon.ico's SVG branch: an image, never a document.
    "Content-Security-Policy": "sandbox",
  }),
);

/** The two head tags the shell carries so a browser finds the manifest and
 *  paints its chrome in the site's colour before any script runs. Built here,
 *  beside the manifest, so the colour in `<meta name="theme-color">` and the
 *  one in the document can never disagree. */
export function manifestHeadTags(): string[] {
  return [
    `<link rel="manifest" href="${MANIFEST_PATH}" />`,
    `<meta name="theme-color" content="${siteColours().bg}" />`,
  ];
}
