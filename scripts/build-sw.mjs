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

await build({
  entryPoints: [path.join(root, "client", "sw.ts")],
  outfile: path.join(root, "dist", "sw.js"),
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: true,
  define: { __APP_VERSION__: JSON.stringify(version) },
  banner: { js: `/* Astrolabe ${version} — offline reading (docs/offline.md) */` },
});
console.log(`  sw.js built for ${version}`);
