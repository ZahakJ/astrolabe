// The door from a tracker to the folder of the owner's own notes on that
// work. Two surfaces open it — the Media card's folder chip and the right
// panel's "Notes of this work" section — and they must agree on where it
// leads: the folder's own note when it has one, else the folder revealed in
// the tree with the sidebar open first (the order the palette's own reveal
// keeps). One function, so the two never drift.
import type { TrackerMeta } from "../shared/types.ts";
import { TREE_REVEAL_EVENT } from "./components/Sidebar.tsx";
import { sidebarIsDrawer, useStore } from "./state.ts";

export function openTrackerFolder(meta: TrackerMeta): void {
  if (meta.folder === null) return;
  const store = useStore.getState();
  if (meta.folderNote !== null) {
    store.openNote(meta.folderNote);
    store.setView("editor");
    return;
  }
  if (sidebarIsDrawer()) store.setSidebarOpen(true);
  else store.setSidebarCollapsed(false);
  const path = meta.folder;
  requestAnimationFrame(() => window.dispatchEvent(new CustomEvent(TREE_REVEAL_EVENT, { detail: { path } })));
}
