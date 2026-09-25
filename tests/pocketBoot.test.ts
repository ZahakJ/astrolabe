// THE POCKET PAGE'S FIRST LINE (mobile/src/pocket/boot.ts), piece by piece.
//
// boot() itself runs only where there is a page; what is tested here is what
// it installs: the `fetch` shim that answers `/api/*` from the pocket and
// passes everything else to the real fetch, the answer to the service
// worker's questions (an image's `/api/file`, which is not a fetch the page
// can patch), and the words of the shell's one sync line. The session is a
// stub that records what it was asked.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { answerTheWorker, installFetchShim, syncText } from "../mobile/src/pocket/boot.ts";
import type { PocketRequest, PocketResponse } from "../mobile/src/pocket/server.ts";
import { pocketWords } from "../mobile/src/i18n.ts";
import type { SyncLine } from "../mobile/src/pocket/sync.ts";

function stubSession(answer: (req: PocketRequest) => PocketResponse | Promise<PocketResponse>) {
  const asked: PocketRequest[] = [];
  return {
    asked,
    async handle(req: PocketRequest): Promise<PocketResponse> {
      asked.push(req);
      return answer(req);
    },
  };
}

const ORIGIN = "https://localhost";

function page() {
  const passed: string[] = [];
  const target = {
    location: { href: `${ORIGIN}/Ideas/Note`, origin: ORIGIN },
    fetch: (async (input: RequestInfo | URL) => {
      passed.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      return new Response("from the network");
    }) as typeof fetch,
  };
  return { target, passed };
}

describe("the fetch shim", () => {
  it("answers /api/* on this origin from the pocket, with the method, the headers and the body", async () => {
    const session = stubSession(() => ({ status: 201, headers: { "Content-Type": "application/json", "X-Pocket": "yes" }, body: '{"ok":true}' }));
    const { target, passed } = page();
    installFetchShim(session, target);
    const res = await target.fetch("/api/note?path=Welcome.md", { method: "put", headers: { "Content-Type": "application/json", "X-Astrolabe-Preview": "1" }, body: '{"content":"x"}' });
    assert.equal(res.status, 201);
    assert.equal(res.headers.get("x-pocket"), "yes");
    assert.deepEqual(await res.json(), { ok: true });
    assert.deepEqual(passed, []);
    const [req] = session.asked;
    assert.equal(req.method, "PUT");
    assert.equal(req.url, `${ORIGIN}/api/note?path=Welcome.md`);
    assert.deepEqual(req.headers, { "content-type": "application/json", "x-astrolabe-preview": "1" });
    assert.equal(req.body, '{"content":"x"}');
  });

  it("reads a Request's own method, headers and body", async () => {
    const session = stubSession(() => ({ status: 200, headers: {}, body: new TextEncoder().encode("bytes") }));
    const { target } = page();
    installFetchShim(session, target);
    const res = await target.fetch(new Request(`${ORIGIN}/api/capture`, { method: "POST", headers: { "X-One": "1" }, body: "captured" }));
    assert.equal(await res.text(), "bytes");
    const [req] = session.asked;
    assert.equal(req.method, "POST");
    assert.equal(req.headers?.["x-one"], "1");
    assert.equal(req.body, "captured");
  });

  it("a GET carries no body, and a URL object works like a string", async () => {
    const session = stubSession(() => ({ status: 200, headers: {}, body: null }));
    const { target } = page();
    installFetchShim(session, target);
    await target.fetch(new URL(`${ORIGIN}/api/tree`));
    assert.equal(session.asked[0].method, "GET");
    assert.equal(session.asked[0].body, null);
  });

  it("everything else goes to the real fetch: the client's chunks, another origin, a path that only looks like the API", async () => {
    const session = stubSession(() => {
      throw new Error("the pocket must not be asked");
    });
    const { target, passed } = page();
    installFetchShim(session, target);
    for (const url of ["/assets/index.js", "https://github.com/api/x", `${ORIGIN}/apiary`, "/fonts/api/face.woff2"]) {
      assert.equal(await (await target.fetch(url)).text(), "from the network");
    }
    assert.deepEqual(passed, ["/assets/index.js", "https://github.com/api/x", `${ORIGIN}/apiary`, "/fonts/api/face.woff2"]);
    assert.deepEqual(session.asked, []);
  });
});

describe("the service worker's questions", () => {
  /** The worker posts `{ pocket: "request", request }` with a port to answer on. */
  function ask(container: EventTarget, data: unknown): Promise<{ data: any; transfer: unknown[] }> {
    return new Promise((resolve) => {
      const port = {
        postMessage(message: unknown, transfer: unknown[] = []) {
          resolve({ data: message, transfer });
        },
      };
      const event = Object.assign(new Event("message"), { data, ports: [port] });
      container.dispatchEvent(event);
    });
  }

  it("answers a request with the pocket's answer, handing binary bodies over as a transferred buffer", async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const session = stubSession((req): PocketResponse => (req.url.includes("/api/file") ? { status: 200, headers: { "Content-Type": "image/png" }, body: png } : { status: 200, headers: {}, body: "text" }));
    const container = new EventTarget();
    answerTheWorker(session, container);
    const request: PocketRequest = { method: "GET", url: `${ORIGIN}/api/file?path=Media/a.png`, headers: {}, body: null };
    const { data, transfer } = await ask(container, { pocket: "request", request });
    assert.equal(data.status, 200);
    assert.equal(data.headers["Content-Type"], "image/png");
    assert.ok(data.body instanceof ArrayBuffer);
    assert.deepEqual(new Uint8Array(data.body), png);
    assert.deepEqual(transfer, [data.body]);
    const text = await ask(container, { pocket: "request", request: { ...request, url: `${ORIGIN}/api/tree` } });
    assert.equal(text.data.body, "text");
    assert.deepEqual(text.transfer, []);
  });

  it("a pocket that throws is a 500 with its sentence, not a worker left waiting", async () => {
    const session = stubSession(() => {
      throw new Error("The repository is not part of the vault.");
    });
    const container = new EventTarget();
    answerTheWorker(session, container);
    const { data } = await ask(container, { pocket: "request", request: { method: "GET", url: `${ORIGIN}/api/x`, headers: {}, body: null } });
    assert.equal(data.status, 500);
    assert.deepEqual(JSON.parse(data.body), { error: "The repository is not part of the vault." });
  });

  it("ignores a message that is not a pocket request", () => {
    const session = stubSession(() => ({ status: 200, headers: {}, body: null }));
    const container = new EventTarget();
    answerTheWorker(session, container);
    container.dispatchEvent(Object.assign(new Event("message"), { data: { pocket: "event" }, ports: [{ postMessage: () => assert.fail("answered") }] }));
    container.dispatchEvent(Object.assign(new Event("message"), { data: { pocket: "request", request: { method: "GET", url: "/api/x" } }, ports: [] }));
    assert.deepEqual(session.asked, []);
  });

  it("does nothing where there is no worker to answer", () => {
    assert.doesNotThrow(() => answerTheWorker(stubSession(() => ({ status: 200, headers: {}, body: null })), undefined));
  });
});

describe("the sync line's words", () => {
  it("each line the rule can choose is a sentence of the shell's dictionary", () => {
    const words = pocketWords();
    const lines: [SyncLine, string][] = [
      [{ key: "conflicts", count: 2 }, words.syncConflicts(2)],
      [{ key: "toPush", count: 3 }, words.syncToPush(3)],
      [{ key: "syncedAgo", minutes: 4 }, words.syncedAgo(4)],
      [{ key: "failed", message: "remote-moved" }, words.syncFailed],
      [{ key: "syncing" }, words.syncing],
      [{ key: "pushing" }, words.pushing],
      [{ key: "offline" }, words.offline],
      [{ key: "never" }, words.never],
      [{ key: "syncedJustNow" }, words.syncedJustNow],
    ];
    for (const [line, want] of lines) assert.equal(syncText(line), want, line.key);
  });
});

describe("the sync line's place on the phone (3.34)", () => {
  // Read from the source: the strip's stylesheet is written by boot() into a
  // page this test does not have. The line hides itself for "synced" — and
  // its own `display: flex` used to outrank the browser's [hidden] rule, so
  // "Synced just now." sat over the phone's tab bar for good.
  const src = readFileSync(new URL("../mobile/src/pocket/boot.ts", import.meta.url), "utf8");
  it("a hidden line is not drawn", () => {
    assert.match(src, /#pocket-sync\[hidden\] \{ display: none; \}/);
  });
  it("it stands clear of the phone shell's tab bar and rail", () => {
    assert.match(src, /\.s-ph-doc:has\(\.s-ph--tabs\) #pocket-sync \{ inset-block-end: calc\(env\(safe-area-inset-bottom, 0px\) \+ 68px\); \}/);
    assert.match(src, /\.s-ph-doc:has\(\.s-ph--tablet\) #pocket-sync \{ inset-inline-start: calc\(72px \+ 0\.5rem\); \}/);
  });
  it("pulling a list down asks the pocket for a pull", () => {
    assert.match(src, /addEventListener\("astrolabe:refresh", \(\) => void session\.pull\(\)\)/);
  });
});
