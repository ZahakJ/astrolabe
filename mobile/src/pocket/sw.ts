/// <reference lib="webworker" />
/**
 * THE SEAM — how the web client's `/api/*` calls reach the pocket server.
 *
 * The client in `client/` is not modified for this, at all. It asks for
 * `/api/tree`, and something has to answer. Two seams were available and both
 * are used, for two different kinds of request:
 *
 *   - `fetch()` is patched in the page (pocket/boot.ts). It is the fast path
 *     for the seventy typed fetchers in client/api.ts: no round trip, no
 *     dependency on a worker being alive.
 *   - THIS WORKER catches everything that is not a `fetch`. `<img
 *     src="/api/file?path=…">` is a browser load, not a call the page makes,
 *     and no shim in the page can see it. Neither can the PDF reader's range
 *     requests, nor an `<audio>` element, nor `EventSource`. A service worker
 *     sees all of them, because it sits under the network rather than beside
 *     the code.
 *
 * It holds no vault of its own: the repository, the index and the git clone
 * live in the page, where the native bridge is. So it asks the page, over a
 * MessageChannel, and hands back what the page says. One exception, below:
 * `/api/events`, which is a stream and must outlive a single message.
 *
 * IT IS SERVED AT `/sw.js`, ON PURPOSE. The client registers `/sw.js` itself
 * for offline reading (client/offline.ts), and on a pocket vault that
 * registration installs THIS worker — so the client's own call does the
 * claiming and there is no second registration to fight with. A pocket vault
 * needs no offline cache: it IS the copy.
 *
 * ITS WORDS ARE THE SHELL'S (src/i18n.ts): a worker has a `navigator` too, so
 * the two sentences it can say reach an Arabic phone in Arabic.
 */

import { t } from "../i18n.ts";

declare const self: ServiceWorkerGlobalScope;

const API = "/api/";

/** The open `/api/events` streams, one per EventSource the client has up. */
const streams = new Set<ReadableStreamDefaultController<Uint8Array>>();

self.addEventListener("install", () => {
  // The page that registered this worker is the page that needs it, now.
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const activate = event as ExtendableEvent;
  activate.waitUntil(
    (async () => {
      // A pocket vault carries its own copy of everything; a cache left behind
      // by an earlier session of this app would only be a second, staler one.
      for (const name of await caches.keys()) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = (event as FetchEvent).request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // A NAVIGATION TO A NOTE'S OWN ADDRESS. The client routes on the pathname —
  // `/Ideas/Astrolabe`, `/graph`, `/calendar` — and pushes those into history
  // without asking anyone. Inside the session that is free; a RELOAD asks the
  // app's asset server for a file that was never a file, and gets a 404 where
  // the vault should be. A server answers this with a catch-all; here the
  // catch-all is one line.
  if (request.mode === "navigate" && !url.pathname.startsWith(API)) {
    (event as FetchEvent).respondWith(
      fetch(request).then((answer) =>
        answer.status === 404 ? fetch("/index.html") : answer,
      ),
    );
    return;
  }

  if (!url.pathname.startsWith(API)) return;

  if (url.pathname === "/api/events") {
    (event as FetchEvent).respondWith(eventStream());
    return;
  }
  (event as FetchEvent).respondWith(askThePage(request));
});

/**
 * The vault's own event stream.
 *
 * The client opens an EventSource and expects frames for as long as it is
 * open; a worker that answered once and closed would put it in a reconnect
 * loop. So the stream is held here and fed by the page, which posts an event
 * whenever it writes a note or a pull brings one down.
 */
function eventStream(): Response {
  let keepAlive: ReturnType<typeof setInterval>;
  let mine: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      mine = controller;
      streams.add(controller);
      controller.enqueue(new TextEncoder().encode(": astrolabe pocket\n\n"));
      // The same fifteen seconds the server uses: long enough to be quiet,
      // short enough that a stream nobody is feeding still proves it is alive.
      keepAlive = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode("event: ping\ndata: \n\n"));
        } catch {
          clearInterval(keepAlive);
          streams.delete(controller);
        }
      }, 15_000);
    },
    cancel() {
      clearInterval(keepAlive);
      if (mine) streams.delete(mine);
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}

self.addEventListener("message", (event) => {
  const data = (event as ExtendableMessageEvent).data as { pocket?: string; event?: unknown } | undefined;
  if (data?.pocket !== "event") return;
  const frame = new TextEncoder().encode(`event: message\ndata: ${JSON.stringify(data.event)}\n\n`);
  for (const controller of [...streams]) {
    try {
      controller.enqueue(frame);
    } catch {
      streams.delete(controller);
    }
  }
});

/**
 * One request, handed to the page that owns the vault.
 *
 * A worker with no page is a worker with no vault — the clone is in the page's
 * IndexedDB and the git transport is behind the page's native bridge. That
 * happens exactly once, at the moment the worker takes over before the page
 * has finished booting, and the honest answer is a 503 the client will retry
 * rather than an empty JSON body it would render as an empty vault.
 */
async function askThePage(request: Request): Promise<Response> {
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const page = all[0];
  if (!page) {
    return new Response(JSON.stringify({ error: t.pocketNotOpenYet, code: "booting" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const headers: Record<string, string> = {};
  request.headers.forEach((value, name) => {
    headers[name.toLowerCase()] = value;
  });
  const body = request.method === "GET" || request.method === "HEAD" ? null : await request.text();

  const answer = await new Promise<{
    status: number;
    headers: Record<string, string>;
    body: ArrayBuffer | string | null;
  }>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => reject(new Error(t.pocketNoAnswer)), 30_000);
    channel.port1.onmessage = (message) => {
      clearTimeout(timer);
      resolve(message.data);
    };
    page.postMessage(
      { pocket: "request", request: { method: request.method, url: request.url, headers, body } },
      [channel.port2],
    );
  }).catch((err: Error) => ({
    status: 504,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error: err.message, code: "pocketTimeout" }),
  }));

  return new Response(answer.body as BodyInit | null, { status: answer.status, headers: answer.headers });
}

export {};
