// The owner's shelf, once, for every surface that asks: the right panel's
// tracker section and the sidebar's folder marks both need "which trackers
// exist and which folders they name", and neither should cost a request per
// note switch. Fetched on first use, refreshed on the vault event, shared.
import { useEffect, useState } from "react";
import type { TrackerMeta } from "../shared/types.ts";
import { getTrackers } from "./api.ts";
import { useStore } from "./state.ts";

/** App.tsx fires this on every vault event; spelled here rather than imported
 *  from the Media page, which is a lazy chunk the entry must not pull in. */
export const VAULT_EVENT = "astrolabe:vault";

let shelf: TrackerMeta[] | null = null;
let inflight: Promise<TrackerMeta[]> | null = null;
const listeners = new Set<() => void>();

export function loadShelf(force: boolean): Promise<TrackerMeta[]> {
  if (!force && shelf !== null) return Promise.resolve(shelf);
  if (inflight) return inflight;
  inflight = getTrackers()
    .then((list) => {
      shelf = list;
      for (const fn of listeners) fn();
      return list;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** The shelf as React state: null until it has been read once; refreshed a
 *  beat after any vault event. Admin only — visitors have no shelf and the
 *  route would 404 — and never while previewing as a visitor. */
export function useTrackerShelf(): TrackerMeta[] | null {
  const admin = useStore((s) => s.admin);
  const preview = useStore((s) => s.previewVisitor);
  const [list, setList] = useState<TrackerMeta[] | null>(shelf);
  useEffect(() => {
    if (!admin || preview) return;
    const sync = (): void => setList(shelf);
    listeners.add(sync);
    void loadShelf(false).then(sync);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onVault = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void loadShelf(true), 300);
    };
    window.addEventListener(VAULT_EVENT, onVault);
    return () => {
      listeners.delete(sync);
      window.removeEventListener(VAULT_EVENT, onVault);
      if (timer) clearTimeout(timer);
    };
  }, [admin, preview]);
  return admin && !preview ? list : null;
}

/** The tracker whose `folder:` IS this folder, if any: the mark the tree
 *  wears beside a folder that is a book, a show, a course on the shelf. */
export function trackerOfFolder(list: TrackerMeta[] | null, folder: string): TrackerMeta | null {
  if (!list) return null;
  return list.find((m) => m.folder === folder) ?? null;
}
