// OFFLINE READING — the policy the service worker follows.
//
// The worker (client/sw.ts) is a switch over this file, so what is kept on
// the device and how each request is answered can be read — and tested
// (tests/offlinePolicy.test.ts) — without a browser. Four answers:
//
//   shell   the app's HTML: network first, the cached copy when the network
//           is gone. Every client-side route serves the same shell, so one
//           cached "/" opens any note.
//   asset   a built chunk, stylesheet, font or pdf.js file: cache first —
//           the names are content-hashed, so a hit is always right.
//   note    the reads a note needs (the tree, the note, its backlinks, the
//           session): network first, the last good copy when it fails, so
//           what was read online is readable on the train.
//   bypass  everything else — every write, every other API — never cached,
//           never answered from the cache. Offline, a write fails the way it
//           would with the server down, and the editor's own retry keeps the
//           text until the network is back.

export type OfflineRoute = "shell" | "asset" | "note" | "bypass";

/** The reads worth keeping. `/api/me` is here so a cached shell can still
 *  learn it is an admin session; the worker is only ever REGISTERED for one
 *  (client/offline.ts), and a 401 is never cached (only 200s are). */
const NOTE_READS = new Set(["/api/me", "/api/tree", "/api/note", "/api/backlinks", "/api/settings", "/api/boot"]);

const ASSET_PREFIXES = ["/assets/", "/pdfjs/", "/excalidraw/", "/fonts/"];
const ASSET_EXT = /\.(js|mjs|css|woff2?|ttf|otf|wasm|svg|png|ico|webmanifest)$/;

export function classify(method: string, pathname: string): OfflineRoute {
  if (method.toUpperCase() !== "GET") return "bypass";
  if (pathname === "/sw.js") return "bypass";
  if (NOTE_READS.has(pathname)) return "note";
  if (pathname.startsWith("/api/")) return "bypass";
  if (ASSET_PREFIXES.some((p) => pathname.startsWith(p)) || ASSET_EXT.test(pathname)) return "asset";
  // A path with no extension is a client-side route: the note's own address,
  // /routines, /graph — every one of them mounts the same shell.
  if (/\.[a-z0-9]+$/i.test(pathname)) return "bypass";
  return "shell";
}

/** One cache per build. The activate step deletes every other one, so a
 *  new version never serves last week's chunks beside this week's shell. */
export const CACHE_PREFIX = "astrolabe-offline-";
export function cacheName(version: string): string {
  return `${CACHE_PREFIX}${version}`;
}
export function isOurCache(name: string): boolean {
  return name.startsWith(CACHE_PREFIX);
}

/** Only a full, plain 200 is worth keeping: a redirect, a 401, a 206 range
 *  answer or an opaque cross-origin response would be served back as if it
 *  were the thing itself. */
export function cacheable(status: number, type: string): boolean {
  return status === 200 && type === "basic";
}

/** The shell is keyed by ONE address whatever route asked for it. */
export const SHELL_KEY = "/";
