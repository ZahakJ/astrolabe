// The browser's memory, under both names.
//
// Astrolabe was Vellum, and every preference this app keeps per browser —
// the theme, the editor language, the sidebar's edge, the tour, the pane
// widths, the folds — lived under `vellum.*` keys in localStorage. A rename
// that forgot them would greet every reader with the default room and the
// tour again. So, once, at boot: every `vellum.*` key is MOVED to its
// `astrolabe.*` twin (the value travels when the twin is absent; either way
// the old key goes), so nothing of the old name is left in the browser.
//
// Runs at module evaluation, imported FIRST by main.tsx, so no reader sees
// an empty key that the old one could have answered.

export const LEGACY_STORAGE_PREFIX = "vellum.";
export const STORAGE_PREFIX = "astrolabe.";

/** Move `vellum.*` → `astrolabe.*`: the value is carried where the new key is
 *  unset, and the old key is removed either way. Returns how many values were
 *  carried. Safe to call again: it never overwrites. */
export function migrateStorage(storage: Storage = localStorage): number {
  let carried = 0;
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k !== null && k.startsWith(LEGACY_STORAGE_PREFIX)) keys.push(k);
  }
  for (const old of keys) {
    const fresh = STORAGE_PREFIX + old.slice(LEGACY_STORAGE_PREFIX.length);
    if (storage.getItem(fresh) !== null) {
      storage.removeItem(old);
      continue;
    }
    const value = storage.getItem(old);
    if (value === null) continue;
    storage.setItem(fresh, value);
    // A move, not a mirror: the two users this ever concerned wanted the old
    // name gone from their machines, so the key travels and the old one goes.
    storage.removeItem(old);
    carried++;
  }
  return carried;
}

try {
  if (typeof localStorage !== "undefined") migrateStorage(localStorage);
} catch {
  // A browser that refuses storage refuses it for the readers too; nothing
  // to carry over.
}
