// The door from a tracker to the folder of the owner's own notes on that
// work. Three surfaces open it — the Media card's folder chip, the right
// panel's "Notes of this work" section and the phone's tracker screen — and
// they must agree on where it leads. One function, so they never drift.
//
// THE FOLDER IS ALWAYS SHOWN IN THE TREE (3.39.3). The chip used to open the
// folder's own note when it had one and reveal the folder only when it had
// none, and the reveal moved the tree's cursor without painting it — the
// cursor ring draws only while the tree holds keyboard focus — and left the
// folder itself collapsed. So from the Media page the owner saw either a note
// open with the directory nowhere in sight, or nothing at all ("can you make
// it possible to open the directory through the media view? like just
// highlight it on the left bar"). Now the sidebar opens, the folder is
// unfolded and pulsed in the tree (useTreeCursor's reveal), and a folder that
// has its own note opens that note as well, as before.
import type { TrackerMeta } from "../shared/types.ts";
import { TREE_REVEAL_EVENT } from "./components/Sidebar.tsx";
import { useStore } from "./state.ts";

export function openTrackerFolder(meta: TrackerMeta): void {
  if (meta.folder === null) return;
  const store = useStore.getState();
  if (meta.folderNote !== null) {
    store.openNote(meta.folderNote);
    store.setView("editor");
  }
  store.setSidebarCollapsed(false);
  const path = meta.folder;
  // A frame later: the sidebar may have been collapsed, and the tree measures
  // where to scroll only once it has laid out (the palette's reveal waits the
  // same frame).
  requestAnimationFrame(() => window.dispatchEvent(new CustomEvent(TREE_REVEAL_EVENT, { detail: { path, folder: true } })));
}
