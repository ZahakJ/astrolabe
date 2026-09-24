// THE SERVICE WORKER — offline reading (docs/offline.md).
//
// Built by scripts/build-sw.mjs into dist/sw.js, served by the server with
// `Cache-Control: no-cache` so a new build is noticed on the next visit, and
// REGISTERED only by an admin session that has the setting on
// (client/offline.ts) — a visitor never gets a copy of the site on their
// disk, and signing out clears this one. What is kept and how a request is
// answered is shared/offlinePolicy.ts; this file is the switch.
//
// Typed by hand: the DOM lib has no FetchEvent, and pulling the WebWorker lib
// into a tsconfig that also has DOM makes every other file ambiguous.

import { SHELL_KEY, cacheName, cacheable, classify, isOurCache } from "../shared/offlinePolicy.ts";

declare const __APP_VERSION__: string;
/** Both languages' dictionary chunks (scripts/build-sw.mjs reads their hashed
 *  names off vite's manifest). */
declare const __DICTIONARY_CHUNKS__: string[];

interface ExtendableEventLike extends Event {
  waitUntil(p: Promise<unknown>): void;
}
interface FetchEventLike extends ExtendableEventLike {
  request: Request;
  respondWith(r: Promise<Response> | Response): void;
}
interface MessageEventLike extends ExtendableEventLike {
  data: unknown;
}
interface WorkerScope {
  addEventListener(type: "install" | "activate", fn: (e: ExtendableEventLike) => void): void;
  addEventListener(type: "fetch", fn: (e: FetchEventLike) => void): void;
  addEventListener(type: "message", fn: (e: MessageEventLike) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  location: Location;
}

const scope = self as unknown as WorkerScope;
const CACHE = cacheName(__APP_VERSION__);

async function clearAll(): Promise<void> {
  for (const name of await caches.keys()) if (isOurCache(name)) await caches.delete(name);
}

/** Keys are URL STRINGS and matches ignore `Vary`: the API answers carry
 *  `Vary: Cookie` (a session decides what a read returns), and a cache that
 *  honoured it would refuse its own copy the moment a header differed — a
 *  refresh with a re-set cookie, a preview header on one read and not the
 *  next. The worker only ever holds one session's copy (client/offline.ts
 *  clears it when the session ends), so the header is not a distinction
 *  worth keeping. */
async function put(key: string, response: Response): Promise<void> {
  if (!cacheable(response.status, response.type)) return;
  const cache = await caches.open(CACHE);
  await cache.put(key, response.clone());
}

function hit(key: string): Promise<Response | undefined> {
  return caches.match(key, { ignoreVary: true, cacheName: CACHE });
}

/** Network first; the last good copy when the network is gone. The copy is
 *  refreshed on every success, so what is on the device is what was last
 *  read, not what was first read. */
async function networkFirst(request: Request, key: string): Promise<Response> {
  try {
    const fresh = await fetch(request);
    await put(key, fresh);
    return fresh;
  } catch (err) {
    const kept = await hit(key);
    if (kept) return servedOffline(kept);
    throw err;
  }
}

/** A fallback answer says so in a header, so the page can tell "the copy"
 *  from "the server" — `navigator.onLine` is a coarse guess and is true on
 *  a network that goes nowhere. client/api.ts turns the header into the
 *  offline strip; a cached Response's own headers are frozen, so it is
 *  re-wrapped. */
function servedOffline(kept: Response): Response {
  const headers = new Headers(kept.headers);
  headers.set("X-Astrolabe-Offline", "1");
  return new Response(kept.body, { status: kept.status, statusText: kept.statusText, headers });
}

/** Cache first: the name is a content hash, so a hit cannot be stale. */
async function cacheFirst(request: Request): Promise<Response> {
  const kept = await hit(request.url);
  if (kept) return kept;
  const fresh = await fetch(request);
  await put(request.url, fresh);
  return fresh;
}

scope.addEventListener("install", (e) => {
  // Take over on the next fetch rather than the next tab: the reader who
  // just turned the setting on should be covered before they leave.
  // BOTH DICTIONARIES come down now, not when first asked for: the page
  // fetches one language at a time (client/i18n.ts), so the one this reader
  // has never switched to would otherwise be missing exactly when the
  // network is. A dictionary that fails to arrive is not a failed install.
  e.waitUntil(
    Promise.all([
      scope.skipWaiting(),
      ...__DICTIONARY_CHUNKS__.map(async (file) => {
        const url = new URL(file, scope.location.origin).href;
        try {
          if (!(await hit(url))) await put(url, await fetch(url));
        } catch {
          // offline at install, or a build without the chunk: fetched on use
        }
      }),
    ]),
  );
});

scope.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (isOurCache(name) && name !== CACHE) await caches.delete(name);
      await scope.clients.claim();
    })(),
  );
});

scope.addEventListener("message", (e) => {
  const data = e.data as { type?: string } | null;
  if (data?.type === "clear") e.waitUntil(clearAll());
});

scope.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== scope.location.origin) return;
  const route = classify(e.request.method, url.pathname);
  if (route === "bypass") return;
  if (route === "asset") {
    e.respondWith(cacheFirst(e.request));
    return;
  }
  if (route === "note") {
    // Keyed by the full URL — `/api/note?path=…` is one entry per note.
    e.respondWith(networkFirst(e.request, e.request.url));
    return;
  }
  // The shell: one cached copy answers every client-side route. The HTML
  // carries the session's boot payload, which is why it is network-first —
  // and why the copy is only ever taken from a request that succeeded.
  e.respondWith(networkFirst(e.request, new URL(SHELL_KEY, scope.location.origin).href));
});
