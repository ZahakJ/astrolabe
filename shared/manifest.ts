// THE WEB APP MANIFEST — the file that makes the site installable.
//
// Served by the server at /manifest.webmanifest (server/index.ts) and built
// here, in shared/, so tests can read the document without a server. It is
// generated per request rather than shipped as a static file because every
// field a phone shows — the name on the home screen, the colour of the
// splash, the icon — is the SITE's, and the site's name and theme are
// settings that change without a build.
//
// The `share_target` is the point of the exercise: with it declared, the
// installed site appears in the phone's share sheet, and a page or a thought
// shared to it is POSTed to /api/clip (server/clip.ts) and lands in the vault.

/** The address the shell links and the worker keeps. One spelling, imported
 *  by the server route, the head injection and the offline policy. */
export const MANIFEST_PATH = "/manifest.webmanifest";
export const MANIFEST_ICON_PATH = "/manifest-icon.svg";
export const CLIP_PATH = "/api/clip";

export interface ManifestInput {
  name: string;
  description?: string | null;
  lang: "en" | "ar";
  /** The ground and the accent of the site's default theme, as hex. */
  background: string;
  theme: string;
  /** Extra icons ahead of the built-in mark: the configured favicon, when
   *  there is one, with its content type. */
  icons?: { src: string; type: string }[];
}

/** The name under the home-screen icon, where a phone shows about twelve
 *  characters: the whole name when it fits, else the longest run of whole
 *  words that does — "My Reading" for "My Reading Room", never "My Reading R". */
export function shortName(name: string): string {
  if (name.length <= 12) return name;
  const cut = name.slice(0, 13);
  const space = cut.lastIndexOf(" ");
  return (space > 0 ? cut.slice(0, space) : cut.slice(0, 12)).trim();
}

/** The manifest document as an object; the route serialises it. */
export function buildManifest(input: ManifestInput): Record<string, unknown> {
  const name = input.name.trim() || "Astrolabe";
  const icons = [
    ...(input.icons ?? []).map((icon) => ({ src: icon.src, type: icon.type, sizes: "any" })),
    // The mark on a plate, drawn in the theme's own colours. An SVG is the
    // one format the server can draw without a rasteriser, and "any" plus
    // "maskable" lets the phone scale and clip it as its launcher likes.
    { src: MANIFEST_ICON_PATH, type: "image/svg+xml", sizes: "any", purpose: "any maskable" },
  ];
  return {
    name,
    short_name: shortName(name),
    ...(input.description ? { description: input.description } : {}),
    lang: input.lang,
    dir: input.lang === "ar" ? "rtl" : "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: input.background,
    theme_color: input.theme,
    icons,
    share_target: {
      action: CLIP_PATH,
      method: "POST",
      enctype: "application/x-www-form-urlencoded",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}

/** The identity swatch of a built-in theme, read out of tokens.css — the
 *  `--swatch-<id>-bg` / `-accent` pair the theme picker paints its dots with.
 *  Those are the two colours a phone asks for (the splash ground and the
 *  status bar), and reading them from the stylesheet keeps one source of
 *  truth: a theme retuned in tokens.css retunes its splash. Null when the id
 *  has no swatch (a custom theme, a typo). */
export function themeSwatch(tokensCss: string, themeId: string): { bg: string; accent: string } | null {
  const id = themeId.replace(/[^a-z0-9-]/gi, "");
  if (id === "") return null;
  const pick = (part: string): string | null => {
    const m = new RegExp(`--swatch-${id}-${part}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(tokensCss);
    return m ? m[1].toLowerCase() : null;
  };
  const bg = pick("bg");
  const accent = pick("accent");
  return bg && accent ? { bg, accent } : null;
}

/** The colours the manifest falls back to: the product default (iron-gall)
 *  as tokens.css states it. Spelled here so a missing stylesheet still gives
 *  a phone a splash that matches the app's first paint. */
export const DEFAULT_SWATCH = { bg: "#16130e", accent: "#c9a227" } as const;
