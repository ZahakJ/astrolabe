// Where Excalidraw finds its fonts. The package reads this global BEFORE it
// loads a typeface, and it must be set before the package's module evaluates,
// which is why this file is imported first and imports nothing.
//
// The prefix is spelled again in vite.config.ts (`EXCALIDRAW_BASE`), which
// copies `dist/prod/fonts` there at build time and serves it in dev. Without
// this the package fetches its fonts from a CDN, which `connect-src 'self'`
// blocks and a self-hosted product must not want anyway.
declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string;
  }
}

export const EXCALIDRAW_BASE = "/excalidraw/";

if (typeof window !== "undefined") {
  window.EXCALIDRAW_ASSET_PATH = EXCALIDRAW_BASE;
  // The package registers every face with OUR url first and its CDN second,
  // and there is no setting that drops the second. Chromium checks every
  // source in a FontFace list against the CSP as the face is created, so a
  // list that names esm.sh logs a violation per face on every drawing opened
  // — two hundred red lines about fonts that were never going to be fetched.
  // The shim removes any source that is not this origin or inline data
  // before the browser sees it; the fonts it removes are exactly the ones
  // `font-src 'self' data:` refuses, so nothing loads differently.
  const Native = window.FontFace;
  if (typeof Native === "function" && !(Native as { __astrolabe?: boolean }).__astrolabe) {
    const Shimmed = function (this: FontFace, family: string, source: ConstructorParameters<typeof FontFace>[1], descriptors?: FontFaceDescriptors): FontFace {
      const src =
        typeof source === "string"
          ? source
              .split(/,\s*(?=url\()/)
              .filter((part) => part.startsWith(`url(${location.origin}`) || part.startsWith("url(/") || part.startsWith("url(data:"))
              .join(", ") || source
          : source;
      return new Native(family, src, descriptors);
    } as unknown as typeof FontFace;
    Shimmed.prototype = Native.prototype;
    (Shimmed as { __astrolabe?: boolean }).__astrolabe = true;
    window.FontFace = Shimmed;
  }
}
