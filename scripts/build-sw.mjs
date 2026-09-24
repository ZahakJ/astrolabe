// Build the service worker (client/sw.ts) into dist/sw.js — a classic
// script at the site root, UNHASHED, so its scope is the whole origin and its
// address never changes; the server serves it with no-cache so a new build is
// picked up on the next visit. Part of `npm run build`; check-bundle asserts
// the file exists and carries the current version, so a dist built with a
// bare `vite build` does not ship without it.
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;

// THE TWO DICTIONARIES, by their hashed names. A page fetches one language at
// a time (client/i18n.ts), so a reader who has only ever read in English has
// never fetched the Arabic — and offline, the switch would find nothing. The
// worker takes both at install (client/sw.ts), so the switch works with the
// network gone. Read from vite's manifest, which this step runs after.
const manifest = JSON.parse(readFileSync(path.join(root, "dist", ".vite", "manifest.json"), "utf8"));
const dictionaries = ["i18n/en.ts", "i18n/ar.ts"].map((src) => {
  const hit = manifest[src] ?? Object.values(manifest).find((e) => e.src === src);
  if (!hit) throw new Error(`build-sw: no chunk for ${src} in dist/.vite/manifest.json`);
  return `/${hit.file}`;
});

await build({
  entryPoints: [path.join(root, "client", "sw.ts")],
  outfile: path.join(root, "dist", "sw.js"),
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: true,
  define: { __APP_VERSION__: JSON.stringify(version), __DICTIONARY_CHUNKS__: JSON.stringify(dictionaries) },
  banner: { js: `/* Astrolabe ${version} — offline reading (docs/offline.md) */` },
});
console.log(`  sw.js built for ${version}`);
