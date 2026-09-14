// OFFLINE READING — the door to the service worker (client/sw.ts).
//
// A device setting (localStorage, not the vault: whether THIS machine keeps
// a copy is this machine's business), on by default, honoured only for an
// admin session: the worker is registered when the session is known and
// the switch is on, and UNREGISTERED — its caches deleted — when either
// stops being true. So signing out takes the vault's copy off the device
// with the session, and a visitor never gets one. The desktop app is
// skipped: its server is on the same machine, and there is nothing to be
// offline from.

import { useEffect, useState } from "react";
import { desktop } from "./desktop/bridge.ts";
import { isOurCache } from "../shared/offlinePolicy.ts";
import { SERVED_OFFLINE_EVENT, SERVED_ONLINE_EVENT, servingOfflineNow } from "./api.ts";

const KEY = "astrolabe.offline";
export const OFFLINE_EVENT = "astrolabe:offline";

export function offlineEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setOfflineEnabled(on: boolean): void {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, "off");
  } catch {
    // Private mode: the switch is per session, then.
  }
  window.dispatchEvent(new CustomEvent(OFFLINE_EVENT));
}

export function offlineSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && desktop() === null;
}

/** Delete every copy this origin keeps. The page can reach the Cache API
 *  itself, so this works whether or not a worker is running. */
export async function clearOfflineCopy(): Promise<void> {
  if (typeof caches === "undefined") return;
  for (const name of await caches.keys()) if (isOurCache(name)) await caches.delete(name);
}

/** Bring the worker in line with the session and the switch. Idempotent;
 *  called whenever either changes (App.tsx). */
export async function syncOfflineWorker(admin: boolean): Promise<void> {
  if (!offlineSupported()) return;
  try {
    if (admin && offlineEnabled()) {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      return;
    }
    for (const reg of await navigator.serviceWorker.getRegistrations()) await reg.unregister();
    await clearOfflineCopy();
  } catch {
    // An origin that refuses workers (http on a LAN address, a locked-down
    // browser) reads exactly as it did before this file existed.
  }
}

/** Is the network there? `navigator.onLine` plus its two events — a
 *  coarse answer, but the one the browser has. */
export function subscribeOnline(fn: (online: boolean) => void): () => void {
  const on = (): void => fn(true);
  const off = (): void => fn(false);
  window.addEventListener("online", on);
  window.addEventListener("offline", off);
  return () => {
    window.removeEventListener("online", on);
    window.removeEventListener("offline", off);
  };
}

/** Are we reading the device's copy? True when the browser reports no
 *  network, or when the worker's last answer came from the copy
 *  (client/api.ts) — the browser's flag is true on a network that goes
 *  nowhere, and the worker's word is what actually happened. The strip and
 *  the shell's notice row both follow this. */
export function useOffline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [served, setServed] = useState(servingOfflineNow);
  useEffect(() => subscribeOnline(setOnline), []);
  useEffect(() => {
    const off = (): void => setServed(true);
    const on = (): void => setServed(false);
    window.addEventListener(SERVED_OFFLINE_EVENT, off);
    window.addEventListener(SERVED_ONLINE_EVENT, on);
    return () => {
      window.removeEventListener(SERVED_OFFLINE_EVENT, off);
      window.removeEventListener(SERVED_ONLINE_EVENT, on);
    };
  }, []);
  return !online || served;
}
