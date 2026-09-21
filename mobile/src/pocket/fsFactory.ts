/**
 * WHERE THE CLONE LIVES: IndexedDB, through LightningFS.
 *
 * THE DECISION, AND WHY IT IS NOT A PREFERENCE. Two stores were available to a
 * Capacitor app: IndexedDB (LightningFS gives it an `fs.promises` face, which
 * is exactly what isomorphic-git asks for) and the device's real filesystem
 * through `@capacitor/filesystem`. The second one loses on an architectural
 * fact before any number is measured: the pocket server has to be reachable
 * from a SERVICE WORKER, because `<img src="/api/file?path=…">` is a browser
 * load and no shim in the page can see it — and a service worker has no
 * Capacitor bridge, so `@capacitor/filesystem` is unreachable from one by
 * construction. IndexedDB is reachable from both.
 *
 * The numbers agree with the architecture. Measured in Chromium against a
 * 2,000-note vault (the harness is scratchpad/pocket/, the figures are in
 * docs/mobile.md and CONTRACTS.md): the whole clone lands and the vault opens
 * in a few seconds, because the cost is one IndexedDB transaction per file
 * rather than one JS↔native bridge hop plus two base64 conversions per file,
 * which is what the plugin's contract makes every read and every write.
 *
 * It is the app's PRIVATE storage either way: an app's IndexedDB on Android
 * lives under the app's data directory, is removed when the app is
 * uninstalled, and no other app can read it.
 */

import LightningFS from "@isomorphic-git/lightning-fs";
import type { PocketFs } from "./fs.ts";

/** The clone's root. One vault per install: a second one would want a second
 *  index, a second sync loop and a screen to choose between them, and none of
 *  that is phase one. */
export const POCKET_DIR = "/vault";

/** The IndexedDB database name. Kept out of the repository's name on purpose —
 *  switching to another repository must not silently read the last one's
 *  objects. */
const DB = "astrolabe-pocket";

let held: PocketFs | null = null;

export async function createPocketFs(): Promise<PocketFs> {
  if (held) return held;
  const fs = new LightningFS(DB) as unknown as PocketFs;
  try {
    await fs.promises.mkdir(POCKET_DIR);
  } catch {
    // Already there, which is every launch after the first.
  }
  held = fs;
  return fs;
}

/** Persist the tree before this document goes away — see `PocketFs.flush`.
 *  Called after a clone (the door is about to navigate) and on `pagehide`
 *  (the phone is about to be put down). */
export async function flushPocketFs(fs: PocketFs): Promise<void> {
  await fs.promises.flush?.();
}

/** Throw the clone away — what "forget this vault" means. The GitHub token is
 *  a separate decision and a separate key (pocket/store.ts). */
export async function dropPocketFs(): Promise<void> {
  held = null;
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}
