/**
 * THE POCKET PAGE'S FIRST LINE.
 *
 * `/` is the web client's own build, shipped inside the APK, with one change
 * made at build time (mobile/scripts/build-pocket.mjs): its entry module is
 * not loaded by the HTML. This is loaded instead, and it loads the entry when
 * the vault is ready.
 *
 * It is also the app's front door, so this is what decides which of the three
 * things the APK can show is showing: a capture sheet, the connection screen
 * (`/shell.html` — it moved, because the client routes on the pathname), or
 * the pocket vault.
 *
 * THE ORDER MATTERS AND IS THE WHOLE FILE.
 *
 *   1. Patch `fetch` for `/api/*`. It has to be in place before a single
 *      module of the client evaluates, because client/prefsSync.ts asks for
 *      `/api/prefs` from the entry's top level.
 *   2. Open the clone and build the index.
 *   3. Register the worker and wait to be controlled, so the first
 *      `<img src="/api/file?…">` the first note renders has somewhere to go.
 *   4. THEN import the client.
 *
 * `client/` is not modified by any of this. That was the constraint: the web
 * client must not learn that a pocket vault exists, or there would be two
 * clients to keep true.
 */

import { SplashScreen } from "@capacitor/splash-screen";
import { AstrolabeNative } from "../native.ts";
import { lang, pocketWords } from "../i18n.ts";
import { createPocketFs, POCKET_DIR } from "./fsFactory.ts";
import { gitAuthHeader } from "./github.ts";
import { PocketSession } from "./session.ts";
import {
  createPocketStore,
  forgetRepo,
  forgetSignIn,
  readBase,
  readDoor,
  readRepo,
  readToken,
  readUser,
  writeBase,
  writeDoor,
} from "./store.ts";
import { nativeGitHttp } from "./transport.ts";
import { syncLine, type SyncState } from "./sync.ts";
import type { PocketRequest } from "./server.ts";
import type { VaultEvent } from "../../../shared/types.ts";

declare global {
  interface Window {
    /** The client's real entry module, put here by the build. */
    __POCKET_ENTRY__?: string;
    /** The live session, for the shell's own strip and for the harness. */
    __POCKET__?: PocketSession;
  }
}

/** The shell's own two screens, which used to be at `/`. Everything that is
 *  not a pocket vault goes there, behind the splash, before a byte of the
 *  client is imported. */
function toTheShell(): void {
  location.replace(`/shell.html${location.search}`);
}

async function boot(): Promise<void> {
  document.documentElement.lang = lang;

  // A SHARE opened this activity, not a reader: the capture sheet lives in the
  // shell and answers for it. Asked first, because a share dropped on the
  // floor is the one failure that app must never have.
  const share = await AstrolabeNative.pendingShare().catch(() => ({}));
  if ("text" in share || "subject" in share) return toTheShell();

  // `?pick=1` is the back gesture leaving a vault (MainActivity): the reader
  // asked for the connection screen and must not be put straight back.
  if (new URLSearchParams(location.search).has("pick")) return toTheShell();

  const repo = await readRepo();
  const token = await readToken();
  const user = await readUser();
  if (!repo || !token || (await readDoor()) !== "pocket") {
    // No pocket vault on this phone, or the owner's last door was their own
    // instance. Either way the shell is the screen that can act on it.
    return toTheShell();
  }

  const fs = await createPocketFs();
  const session = new PocketSession({
    fs,
    http: nativeGitHttp,
    dir: POCKET_DIR,
    repo,
    headers: gitAuthHeader(token),
    author: {
      name: user?.name || user?.login || "Astrolabe pocket",
      // GitHub's no-reply address for an account with no public email: a
      // commit needs an author and inventing one would put a stranger's
      // address in the owner's history.
      email: user?.email || `${user?.login ?? "astrolabe"}@users.noreply.github.com`,
    },
    base: { read: readBase, write: writeBase },
    store: createPocketStore(),
    onSync: paintSyncLine,
    onEvent: tellTheWorker,
    // "Leave this vault" in Settings → Backup & sync. The three facts that
    // make this phone open a repository without asking go together: which
    // repository, the token that reaches it, and the door the shell opens on
    // launch. The CLONE stays — leaving is not a delete — and the client
    // navigates to the connection screen itself (client/androidShell.ts).
    onLeave: async () => {
      await forgetRepo();
      await forgetSignIn();
      await writeDoor("instance");
    },
  });
  window.__POCKET__ = session;

  installFetchShim(session);
  answerTheWorker(session);

  await session.build();
  await registerWorker();
  session.installLifecycle();

  // The client mounts now; the pull runs beside it. A reader who opened the
  // app to write one sentence should not watch a spinner for the network
  // first — the notes are already on the device.
  const entry = window.__POCKET_ENTRY__;
  if (entry) await import(/* @vite-ignore */ entry);
  // Held until the client has been imported, for the reason the shell holds
  // it: the splash and the ground under it are the same colour, so hiding it
  // after the first paint is a dissolve rather than a cut.
  await SplashScreen.hide().catch(() => {});
  void session.pull();
}

/**
 * `fetch` for `/api/*`, answered in this page.
 *
 * Everything else — the client's own chunks, its fonts, pdf.js's data files —
 * goes to the real fetch, which reaches the APK's own assets.
 */
function installFetchShim(session: PocketSession): void {
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const absolute = new URL(url, location.href);
    if (absolute.origin !== location.origin || !absolute.pathname.startsWith("/api/")) {
      return real(input as RequestInfo, init);
    }
    const request: PocketRequest = {
      method: (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase(),
      url: absolute.href,
      headers: headersOf(init, input),
      body: await bodyOf(init, input),
    };
    const answer = await session.handle(request);
    return new Response(answer.body as BodyInit | null, { status: answer.status, headers: answer.headers });
  };
}

function headersOf(init: RequestInit | undefined, input: RequestInfo | URL): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (value: HeadersInit | undefined): void => {
    if (!value) return;
    new Headers(value).forEach((v, k) => {
      out[k.toLowerCase()] = v;
    });
  };
  if (input instanceof Request) add(input.headers);
  add(init?.headers);
  return out;
}

async function bodyOf(init: RequestInit | undefined, input: RequestInfo | URL): Promise<string | null> {
  if (init?.body !== undefined && init.body !== null) {
    return typeof init.body === "string" ? init.body : new Response(init.body as BodyInit).text();
  }
  if (input instanceof Request && input.body !== null) return input.clone().text();
  return null;
}

/** The worker's questions, answered from the same server the shim uses. */
function answerTheWorker(session: PocketSession): void {
  navigator.serviceWorker?.addEventListener("message", (event) => {
    const data = event.data as { pocket?: string; request?: PocketRequest } | undefined;
    const port = event.ports[0];
    if (data?.pocket !== "request" || !data.request || !port) return;
    void session
      .handle(data.request)
      .then((answer) => {
        const body =
          answer.body instanceof Uint8Array
            ? (answer.body.buffer.slice(
                answer.body.byteOffset,
                answer.body.byteOffset + answer.body.byteLength,
              ) as ArrayBuffer)
            : answer.body;
        port.postMessage({ status: answer.status, headers: answer.headers, body }, body instanceof ArrayBuffer ? [body] : []);
      })
      .catch((err: Error) => {
        port.postMessage({
          status: 500,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: err.message }),
        });
      });
  });
}

function tellTheWorker(event: VaultEvent): void {
  navigator.serviceWorker?.controller?.postMessage({ pocket: "event", event });
}

async function registerWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true });
        // A worker that never claims is not worth a hung page: the `fetch`
        // shim answers every call the client makes, and only images would be
        // missing. Three seconds, then on.
        setTimeout(resolve, 3000);
      });
    }
  } catch {
    // An origin that refuses workers still gets a working vault; what it
    // loses is images inside notes, which is degraded rather than broken.
  }
}

/** The shell's one line about the vault, drawn over the client's own chrome.
 *  It is the only account anybody gets of whether their writing has left the
 *  phone, so it is never optimistic — see pocket/sync.ts. */
function paintSyncLine(state: SyncState): void {
  const line = syncLine(state, Date.now());
  const node = document.getElementById("pocket-sync") ?? makeSyncNode();
  node.dataset.key = line.key;
  node.textContent = syncText(line);
  node.hidden = line.key === "syncedAgo" || line.key === "syncedJustNow";
}

function makeSyncNode(): HTMLElement {
  const node = document.createElement("div");
  node.id = "pocket-sync";
  node.setAttribute("role", "status");
  node.setAttribute("aria-live", "polite");
  node.hidden = true;
  node.onclick = () => void window.__POCKET__?.push();
  document.body.append(node);
  const style = document.createElement("style");
  // Logical properties and the app's own tokens: the strip has to sit at the
  // start edge in English and the end edge in Arabic without a second rule.
  style.textContent = `
#pocket-sync {
  position: fixed;
  /* Above the client's own status bar, not over it: the line is the shell's
     and must not sit on the room's. */
  inset-block-end: calc(env(safe-area-inset-bottom, 0px) + 2.75rem);
  inset-inline-start: 0.5rem;
  z-index: 40;
  padding: 0.5rem 0.75rem;
  min-block-size: 44px;
  display: flex;
  align-items: center;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  color: var(--text-2, #8b949e);
  background: var(--bg-2, #161b22);
  border: 1px solid var(--border, #30363d);
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.3);
}
#pocket-sync[data-key="conflicts"], #pocket-sync[data-key="failed"] { color: var(--danger, #f85149); }
`;
  document.head.append(style);
  return node;
}

function syncText(line: ReturnType<typeof syncLine>): string {
  // The words live in the shell's dictionary (mobile/src/i18n.ts), in both
  // languages; the RULE that chose this line lives in pocket/sync.ts.
  switch (line.key) {
    case "conflicts":
      return pocketWords().syncConflicts(line.count);
    case "toPush":
      return pocketWords().syncToPush(line.count);
    case "syncedAgo":
      return pocketWords().syncedAgo(line.minutes);
    case "failed":
      return pocketWords().syncFailed;
    default:
      return pocketWords()[line.key];
  }
}

void boot();
