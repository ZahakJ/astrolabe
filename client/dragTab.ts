// The tab being dragged, if any — one value for the whole window.
//
// NOT store state on purpose. A drag is transient pointer chrome: it exists
// between dragstart and dragend, it must never be persisted or mirrored to
// other windows, and routing it through the zustand store would re-render
// every subscriber on pickup just to say "a ghost is moving". The pieces that
// care — the tab that is being lifted (client/components/Tabs.tsx) and the
// drop zones every pane raises while a drag is live
// (client/components/PaneDropZones.tsx) — subscribe here instead.
//
// The payload also rides the native DataTransfer under TAB_MIME, but this
// module is the one the UI reads: `dataTransfer.getData()` is empty during
// dragover by spec (protected mode), so zones could not know what is hovering
// them from the event alone.
//
// A drag arriving from ANOTHER WINDOW (the desktop's second window on the
// same vault, or two browser tabs) has the MIME and no module state. It is
// adopted: `dragenter` with the MIME raises a FOREIGN drag whose path is
// unknown until the drop, every pane's zones rise for it, and the drop reads
// the payload off the DataTransfer (`dropPayload`). The window it came from
// learns of the move from its own `dragend`: a drop nobody here handled
// that still reports `dropEffect: "move"` was taken by another window, and
// the tab leaves the way it leaves a pane. The owner: "I need to be able to
// drag and drop tabs all the time on separate windows".

import { useSyncExternalStore } from "react";

export interface TabDrag {
  /** The pane the tab was lifted from — null for a note or book dragged
   *  straight off the TREE, which has no tab anywhere yet, and for a drag
   *  from another window. */
  pane: string | null;
  /** Empty for a foreign drag until the drop, when the DataTransfer opens. */
  path: string;
  /** Lifted in another window: the payload is only readable on drop. */
  foreign?: boolean;
}

export const TAB_MIME = "application/x-astrolabe-tab";

let current: TabDrag | null = null;
/** Did a drop target in THIS window take the drag? Read by the source tab's
 *  dragend to tell "moved to another window" from "moved here". */
let handled = false;
const subs = new Set<() => void>();

export function beginTabDrag(drag: TabDrag): void {
  current = drag;
  handled = false;
  for (const f of subs) f();
}

export function markTabDropHandled(): void {
  handled = true;
}

export function tabDropHandled(): boolean {
  return handled;
}

/** What a drop carries: this window's own drag, or the payload of one that
 *  came from another window, parsed off the DataTransfer (readable on drop,
 *  and only then). Null when there is nothing to land. */
export function dropPayload(dt: DataTransfer): TabDrag | null {
  if (current !== null && current.foreign !== true) return current;
  try {
    const raw = dt.getData(TAB_MIME);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const path = (parsed as { path?: unknown })?.path;
    if (typeof path === "string" && path !== "") return { pane: null, path, foreign: true };
  } catch {
    // not ours
  }
  return null;
}

/** Raise a foreign drag when one enters this window, and lower it when the
 *  ghost leaves. There is no `dragend` for a drag that started elsewhere, so
 *  "left" is a `dragover` heartbeat going quiet: the browser fires one every
 *  few tens of milliseconds while the pointer is over the document. */
function watchForeignTabDrags(): void {
  let quiet: ReturnType<typeof setTimeout> | null = null;
  const lower = (): void => {
    if (quiet !== null) clearTimeout(quiet);
    quiet = null;
    if (current?.foreign === true) endTabDrag();
  };
  document.addEventListener("dragenter", (e) => {
    if (current !== null) return;
    if (!e.dataTransfer?.types.includes(TAB_MIME)) return;
    beginTabDrag({ pane: null, path: "", foreign: true });
  });
  document.addEventListener("dragover", () => {
    if (current?.foreign !== true) return;
    if (quiet !== null) clearTimeout(quiet);
    quiet = setTimeout(lower, 250);
  });
  document.addEventListener("drop", () => {
    if (current?.foreign === true) setTimeout(lower, 0);
  });
}

if (typeof document !== "undefined") watchForeignTabDrags();

export function endTabDrag(): void {
  if (current === null) return;
  current = null;
  for (const f of subs) f();
}

/** The live value, for event handlers that fire outside React's render. */
export function tabDrag(): TabDrag | null {
  return current;
}

export function useTabDrag(): TabDrag | null {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => current,
  );
}
