#!/usr/bin/env node
// THE POCKET VAULT'S HALF OF `www/`.
//
//   node scripts/build-pocket.mjs          (run by `npm run build`)
//
// The shell's own two screens are built by vite into `www/`. This adds the
// third thing the APK now carries: THE WEB CLIENT ITSELF, so a phone with no
// server of its own has something to open a git clone with.
//
// Three pieces, and one trick.
//
//   www/index.html    the client's own index.html, with its entry module
//                     TAKEN OFF and replaced by our bootstrap. That is the
//                     trick: the client must not start until the clone is
//                     open and `fetch` is patched, and a classic script
//                     cannot make a module script wait. So the entry's URL is
//                     handed to the bootstrap, which imports it when the
//                     vault is ready. `client/` is not modified by any of
//                     this — that was the constraint.
//
//                     AND IT IS THE PAGE AT `/`, which the shell's own two
//                     screens used to be. The client routes on the PATHNAME
//                     (`/graph`, `/Ideas/Note`, client/router.ts): served
//                     anywhere but the root it rewrites its own address on the
//                     first paint and a reload lands somewhere else. So the
//                     root is the vault's, the shell moves to `shell.html`,
//                     and the bootstrap sends a launch with no pocket vault
//                     straight there — behind the splash, which the shell
//                     holds up until it has painted, so nothing flashes.
//   www/pocket-boot.js  the bootstrap (src/pocket/boot.ts).
//   www/sw.js         the service worker (src/pocket/sw.ts), at the root so
//                     its scope is the whole origin — and at exactly the name
//                     the client already registers for offline reading, so
//                     the client's own call installs it and there is never a
//                     second registration to fight with.
//
// Everything else of the client's build (assets/, pdfjs/, excalidraw/,
// fonts/) is copied verbatim, at the SAME paths, because the client's HTML
// and its chunk graph address them absolutely and rewriting them would mean
// owning a second build of somebody else's bundle.

import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE = join(HERE, "..");
const ROOT = join(MOBILE, "..");
const DIST = join(ROOT, "dist");
const WWW = join(MOBILE, "www");

const version = JSON.parse(readFileSync(join(MOBILE, "package.json"), "utf8")).version;
const clientId = process.env.ASTROLABE_GITHUB_CLIENT_ID ?? readDotEnv("ASTROLABE_GITHUB_CLIENT_ID") ?? "";

/** `mobile/.env`, read by hand: this script runs outside vite, and the one
 *  value it needs must come from the same place vite reads it from. */
function readDotEnv(name) {
  const file = join(MOBILE, ".env");
  if (!existsSync(file)) return null;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (match && match[1] === name) return match[2].replace(/^["']|["']$/g, "");
  }
  return null;
}

if (!existsSync(join(DIST, "index.html"))) {
  console.error(
    "build-pocket: no client build at dist/.\n" +
      "  The APK ships the web client so a pocket vault has something to open it with.\n" +
      "  run, from the repository root:  npm run build",
  );
  process.exit(1);
}

mkdirSync(WWW, { recursive: true });

// ── the client's build, verbatim except for its front page ──────────────────

for (const entry of ["assets", "pdfjs", "excalidraw", "fonts"]) {
  const from = join(DIST, entry);
  if (existsSync(from)) cpSync(from, join(WWW, entry), { recursive: true });
}

const html = readFileSync(join(DIST, "index.html"), "utf8");
const entry = /<script[^>]+type="module"[^>]+src="([^"]+)"[^>]*>\s*<\/script>/.exec(html);
if (!entry) {
  console.error("build-pocket: dist/index.html has no module entry — has the client build changed shape?");
  process.exit(1);
}
const pocketHtml = html.replace(
  entry[0],
  `<script>window.__POCKET_ENTRY__=${JSON.stringify(entry[1])}</script>\n` +
    `    <script type="module" src="/pocket-boot.js"></script>`,
);
// The shell's own page steps aside for it. `cap sync` copies this whole
// directory into the APK's assets and Capacitor's Bridge opens `/`, so `/` has
// to be the thing that owns the pathname.
renameSync(join(WWW, "index.html"), join(WWW, "shell.html"));
writeFileSync(join(WWW, "index.html"), pocketHtml);

// The client's own service worker is the OFFLINE CACHE of a remote server.
// A pocket vault has no remote server and needs no cache — it is the copy —
// and shipping that file at /sw.js would put a second worker at the same name
// as ours. It does not travel.
rmSync(join(WWW, "sw.js"), { force: true });

// ── our two scripts ─────────────────────────────────────────────────────────

const define = {
  __GITHUB_CLIENT_ID__: JSON.stringify(clientId),
  __POCKET_VERSION__: JSON.stringify(version),
};

await build({
  entryPoints: [join(MOBILE, "src", "pocket", "boot.ts")],
  outfile: join(WWW, "pocket-boot.js"),
  bundle: true,
  format: "esm",
  target: "es2020",
  minify: true,
  define,
  banner: { js: `/* Astrolabe ${version} — the pocket vault (docs/mobile.md) */` },
});

await build({
  entryPoints: [join(MOBILE, "src", "pocket", "sw.ts")],
  outfile: join(WWW, "sw.js"),
  bundle: true,
  // A classic worker, not a module one: module service workers are a recent
  // arrival in Android's WebView and this file's job is to exist on every
  // phone the APK runs on.
  format: "iife",
  target: "es2020",
  minify: true,
  define,
  banner: { js: `/* Astrolabe ${version} — the pocket vault's seam (mobile/src/pocket/sw.ts) */` },
});

const bytes = (path) => (existsSync(path) ? statSync(path).size : 0);
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
console.log(
  `  pocket: index.html (the vault) · shell.html (the two screens) · pocket-boot.js ${kb(bytes(join(WWW, "pocket-boot.js")))} · ` +
    `sw.js ${kb(bytes(join(WWW, "sw.js")))}${clientId ? "" : "  (no ASTROLABE_GITHUB_CLIENT_ID — the third door will say so)"}`,
);
