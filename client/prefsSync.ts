// PREFERENCES THAT TRAVEL WITH THE VAULT — the client's half.
//
// The preferences below are read from localStorage by a dozen modules, most of
// them at import time (the theme before the first paint, the editor width,
// the chrome language). That is exactly why the sync happens in TWO places
// and neither of them is a component:
//
//   · PULL, before React mounts (client/main.tsx): one GET of
//     /api/prefs, and every key the vault holds a NEWER stamp for than this
//     device is written into localStorage right then — so the modules that
//     read at import see the vault's answer, not last week's. A visitor gets
//     401 and nothing happens; the phone on a hosted instance and the desktop
//     app on any machine are admins over the same folder and get the same
//     file.
//   · PUSH, from a patch on Storage itself: `localStorage.setItem` and
//     `removeItem` are wrapped once, so every one of those dozen call sites
//     keeps writing localStorage the way it always has and the vault hears
//     about it a second later, debounced, in one PUT that also carries back
//     whatever the vault learned from another device meanwhile.
//
// WHICH keys travel is an allowlist, not "everything with the prefix": tabs,
// the workspace, pane widths, the tags shelf's height, window identity,
// recents, fold state and every "collapsed" flag describe THIS window on THIS
// screen, and a phone inheriting a desktop's four-column layout would be a
// bug, not a feature. What travels is what a person would call a setting.
//
// Stamps are wall-clock milliseconds; newest wins per key, on both sides
// (server/prefs.ts merges the same way). A cleared key travels as a tombstone.

import { STORAGE_PREFIX } from "./storageMigration.ts";

const STAMPS_KEY = `${STORAGE_PREFIX}prefs-sync`;
const OFF_KEY = `${STORAGE_PREFIX}prefs-sync-off`;

/** The keys that are preferences, as opposed to window state. Each is a
 *  localStorage key without the product prefix. */
const TRAVELS = new Set([
  "theme",
  "site-theme",
  "lang",
  "editorLang",
  "vim",
  "editorWidth",
  "editorWidthCustom",
  "headingNumbers",
  "selToolbar",
  "sidebarSide",
  "show-attachments",
  "graph",
  "comment.author",
]);

interface Entry {
  v: string | null;
  t: number;
}
type PrefMap = Record<string, Entry>;

export function prefsSyncEnabled(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) === null;
  } catch {
    return false;
  }
}

export function setPrefsSyncEnabled(on: boolean): void {
  try {
    if (on) localStorage.removeItem(OFF_KEY);
    else localStorage.setItem(OFF_KEY, "1");
  } catch {
    // storage unavailable: nothing to switch
  }
  window.dispatchEvent(new Event("astrolabe:prefs-sync"));
  if (on) void pullPrefs();
}

export function travels(key: string): boolean {
  return key.startsWith(STORAGE_PREFIX) && TRAVELS.has(key.slice(STORAGE_PREFIX.length));
}

function readStamps(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STAMPS_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: Record<string, number> = {};
    for (const [k, t] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof t === "number" && Number.isFinite(t)) out[k] = t;
    }
    return out;
  } catch {
    return {};
  }
}

function writeStamps(stamps: Record<string, number>): void {
  raw.setItem.call(localStorage, STAMPS_KEY, JSON.stringify(stamps));
}

/** The originals, held before the patch so the module's own writes (the
 *  stamps, an applied remote value) never re-enter the push queue. */
const raw = {
  setItem: Storage.prototype.setItem,
  removeItem: Storage.prototype.removeItem,
};

/** Write what the vault knows and this device does not yet — a newer stamp,
 *  or a key this device never stamped. Returns the keys that changed. */
function applyRemote(remote: PrefMap): string[] {
  const stamps = readStamps();
  const changed: string[] = [];
  for (const [k, e] of Object.entries(remote)) {
    if (!travels(k)) continue;
    const mine = stamps[k];
    if (mine !== undefined && mine >= e.t) continue;
    const current = localStorage.getItem(k);
    if (e.v === null) {
      if (current !== null) {
        raw.removeItem.call(localStorage, k);
        changed.push(k);
      }
    } else if (current !== e.v) {
      raw.setItem.call(localStorage, k, e.v);
      changed.push(k);
    }
    stamps[k] = e.t;
  }
  writeStamps(stamps);
  return changed;
}

/** Keys this device holds that the vault has never heard of (a device that
 *  chose its settings before the sync existed): stamped now, so the first
 *  push carries them and the vault does not answer with nothing. */
function unstampedLocal(): PrefMap {
  const stamps = readStamps();
  const out: PrefMap = {};
  const now = Date.now();
  for (const name of TRAVELS) {
    const k = STORAGE_PREFIX + name;
    if (stamps[k] !== undefined) continue;
    const v = localStorage.getItem(k);
    if (v === null) continue;
    out[k] = { v, t: now };
  }
  return out;
}

let denied = false;
let pending: PrefMap = {};
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight = false;

function schedulePush(delay = 1200): void {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void pushPrefs();
  }, delay);
}

async function pushPrefs(): Promise<void> {
  if (inflight || denied || !prefsSyncEnabled()) return;
  const keys = pending;
  if (Object.keys(keys).length === 0) return;
  pending = {};
  inflight = true;
  try {
    const res = await fetch("/api/prefs", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys }),
    });
    if (res.status === 401 || res.status === 403) {
      denied = true; // a visitor, or a preview session: nothing to sync
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const stamps = readStamps();
    for (const [k, e] of Object.entries(keys)) stamps[k] = Math.max(stamps[k] ?? 0, e.t);
    writeStamps(stamps);
    const body = (await res.json()) as { keys?: PrefMap };
    applyRemote(body.keys ?? {});
  } catch {
    // Offline, or the server is restarting: keep the keys and try again on
    // the next change, or in a while.
    pending = { ...keys, ...pending };
    schedulePush(30_000);
  } finally {
    inflight = false;
  }
}

/** Boot: the vault's preferences, applied before the first paint. Resolves
 *  without throwing whatever happens — a preference is never worth a blank
 *  page. */
export async function pullPrefs(): Promise<string[]> {
  if (!prefsSyncEnabled()) return [];
  try {
    const res = await fetch("/api/prefs", { credentials: "same-origin" });
    if (res.status === 401 || res.status === 403) {
      denied = true;
      return [];
    }
    if (!res.ok) return [];
    denied = false;
    const body = (await res.json()) as { keys?: PrefMap };
    const changed = applyRemote(body.keys ?? {});
    // Anything this device chose before the sync existed goes up now.
    const fresh = unstampedLocal();
    if (Object.keys(fresh).length > 0) {
      pending = { ...pending, ...fresh };
      schedulePush(0);
    }
    return changed;
  } catch {
    return [];
  }
}

/** Wrap Storage once. Only writes to `localStorage` for a travelling key are
 *  noticed; sessionStorage and every other key pass straight through. */
export function installPrefsSync(): void {
  if (typeof Storage === "undefined") return;
  const proto = Storage.prototype;
  if ((proto as { __astrolabePrefsSync?: boolean }).__astrolabePrefsSync) return;
  (proto as { __astrolabePrefsSync?: boolean }).__astrolabePrefsSync = true;
  proto.setItem = function (this: Storage, key: string, value: string): void {
    raw.setItem.call(this, key, value);
    if (this === localStorage && travels(key)) {
      pending[key] = { v: String(value), t: Date.now() };
      schedulePush();
    }
  };
  proto.removeItem = function (this: Storage, key: string): void {
    raw.removeItem.call(this, key);
    if (this === localStorage && travels(key)) {
      pending[key] = { v: null, t: Date.now() };
      schedulePush();
    }
  };
  // A change made in the last second before the tab closes still leaves.
  window.addEventListener("pagehide", () => {
    if (denied || !prefsSyncEnabled() || Object.keys(pending).length === 0) return;
    const keys = pending;
    pending = {};
    try {
      void fetch("/api/prefs", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys }),
        keepalive: true,
      });
    } catch {
      // the page is going away either way
    }
  });
}
