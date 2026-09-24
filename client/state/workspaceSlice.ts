// The workspace: the tree, the panes and their tabs, books, and the surfaces
// a tab can hold. Moved out of client/state.ts unchanged.

import { CALENDAR_TAB, FEEDS_TAB, GRAPH_TAB, MEDIA_TAB, SIGILS_TAB, TODAY_TAB, activeTabOf, closeAfterIn, closeAllPanes, closeOthersIn, closePane as closePaneIn, closeTabIn, dropTabSplit as dropTabSplitIn, focusPane as focusPaneIn, isCalendarTab, isFeedsTab, isGraphTab, isMediaTab, isOrbitsTab, isSigilsTab, isTodayTab, moveTab as moveTabIn, openInPane, orbitsTabFor, paneAt, pruneWorkspace, reorderTab as reorderTabIn, resizeCols as resizeColsIn, resizeRows as resizeRowsIn, setBookTarget as setBookTargetIn, setPaneMode as setPaneModeIn, setPinned as setPinnedIn, splitPane as splitPaneIn, stepTab as stepTabIn, type Workspace } from "../workspace.ts";
import { SURFACE_TABS, dropDirty, guarded, isSurfaceView } from "./helpers.ts";
import type { State } from "./types.ts";
import type { StoreGet, StoreSet } from "./sliceTypes.ts";
import type { TwinPair } from "../../shared/types.ts";
import * as api from "../api.ts";
import { collectNotes, setAliasTable } from "../editor/links.ts";
import { mirrorOf } from "../state.ts";
import { persistWorkspace } from "./persistence.ts";
import { setTwinSwapTable } from "../twinSwap.ts";

/** The tree, the panes and their tabs, the books, and the surfaces a tab can hold. */
export function workspaceSlice(set: StoreSet, get: StoreGet) {
  return {
    loadTree: () =>
      guarded("loading vault tree", async () => {
        // The tree and the ALIAS table are one refresh. A tree carries
        // filenames; an alias lives in frontmatter, so the client cannot derive
        // it — and a resolver that knows one and not the other draws a dashed
        // "unresolved" link at a note that is sitting right there, then offers
        // to create a duplicate of it. Their staleness is now identical, which
        // is the only way the editor and the backlink panel can agree.
        //
        // The alias half fails SOFTLY: it is an enrichment of the tree, not a
        // condition of it, and the last good table is kept rather than cleared.
        // The TWIN TABLE refreshes with them, for the same reason and with
        // the same softness: it is derived from frontmatter the client cannot
        // see, every surface that draws a twin mark reads it, and a table one
        // vault-change out of date would put a pill on a note whose `twin:`
        // line was just deleted. A visitor's half of the same answer is the
        // link-time swap table, which the reading renderer consults.
        const [tree, aliases, twins] = await Promise.all([
          api.getTree(),
          api.getAliases().catch((err: unknown) => {
            console.error("astrolabe: loading the alias table failed", err);
            return null;
          }),
          api.getTwins().catch((err: unknown) => {
            console.error("astrolabe: loading the twin table failed", err);
            return null;
          }),
        ]);
        if (aliases !== null) setAliasTable(aliases);
        if (twins !== null) {
          const byPath: Record<string, TwinPair> = {};
          for (const pair of twins.pairs) byPath[pair.path] = pair;
          setTwinSwapTable(twins.swap);
          set({ twins: byPath });
        }
        set({ tree });
      }),

    commitWorkspace: (ws) => set((s) => ({ ...s, ...mirrorOf(ws) })),

    focusPane: (id) => set((s) => ({ ...s, ...mirrorOf(focusPaneIn(s.workspace, id)) })),

    splitFocusedPane: (axis) => {
      const s = get();
      const pane = paneAt(s.workspace, s.workspace.focus);
      // The new pane opens on the SAME note, which is what a split is for:
      // the second view of the thing you are already reading. An empty pane
      // beside a note is a pane the reader then has to fill.
      const carry = pane === null ? null : activeTabOf(pane);
      const next = splitPaneIn(s.workspace, s.workspace.focus, axis, carry);
      if (next === null) return false;
      set({ ...s, ...mirrorOf(next) });
      return true;
    },

    closeFocusedPane: () =>
      set((s) => ({ ...s, ...mirrorOf(closePaneIn(s.workspace, s.workspace.focus)) })),

    openBook: (path, target = null) =>
      set((s) => {
        // The target rides the open itself (OpenHow.book): the pane's one-shot
        // `bookTarget` — "land on page 212, flash that rectangle" — consumed
        // by the reader and cleared; a tab that permanently remembered its
        // citation would reopen there forever. A pane still in "library" mode
        // is answering the shelf by opening a book, so the mode comes home to
        // the tabs.
        let ws = openInPane(s.workspace, s.workspace.focus, path, target === null ? {} : { book: target });
        if (paneAt(ws, ws.focus)?.mode === "library") ws = setPaneModeIn(ws, ws.focus, "edit");
        return { ...s, ...mirrorOf(ws) };
      }),

    clearBookTarget: (paneId) =>
      set((s) => ({ ...s, ...mirrorOf(setBookTargetIn(s.workspace, paneId, null)) })),

    openLibrary: () =>
      set((s) => ({
        ...s,
        ...mirrorOf(setPaneModeIn(s.workspace, s.workspace.focus, "library")),
        view: "editor",
      })),

    closeLibrary: () =>
      set((s) => {
        const pane = paneAt(s.workspace, s.workspace.focus);
        if (pane === null || pane.mode !== "library") return s;
        return { ...s, ...mirrorOf(setPaneModeIn(s.workspace, s.workspace.focus, "edit")) };
      }),

    setPaneMode: (paneId, mode) =>
      set((s) => ({ ...s, ...mirrorOf(setPaneModeIn(s.workspace, paneId, mode)) })),

    openNote: (path) => {
      set((s) => ({
        ...mirrorOf(openInPane(s.workspace, s.workspace.focus, path)),
        view: "editor",
        // Unknown until the status bar reads the new note's frontmatter —
        // unless the published set already knows the answer.
        openPublished: s.openPath === path ? s.openPublished : s.publishedPaths?.has(path) ?? null,
        // Mobile drawer: picking a note dismisses the overlay sidebar.
      }));
      void get().refreshBacklinks();
    },

    stepTab: (delta) => {
      set((s) => {
        const ws = stepTabIn(s.workspace, s.workspace.focus, delta);
        return ws === s.workspace ? s : { ...s, ...mirrorOf(ws) };
      });
      // The panel follows the note the way it does for any other tab change.
      void get().refreshBacklinks();
    },

    closeActiveTab: () => {
      const s = get();
      const pane = paneAt(s.workspace, s.workspace.focus);
      const tab = pane === null ? null : activeTabOf(pane);
      // A pane showing the graph or the shelf has no tab to close, and closing
      // "whatever the last note was" from under it would be a guess.
      if (tab !== null) s.closeTab(tab.path);
    },

    closeTab: (path) => {
      set((s) => {
        const ws = closeTabIn(s.workspace, s.workspace.focus, path);
        if (ws === s.workspace) return s;
        return { ...s, ...mirrorOf(ws), dirty: dropDirty(s.dirty, ws) };
      });
      void get().refreshBacklinks();
    },

    // ── The tab context menu's rows ─────────────────────────────────────────
    // Every one of them goes through a reducer in client/workspace.ts rather
    // than filtering an array here, because "which tabs does this take" is a
    // question with one answer and it is written down there — pins survive,
    // the active tab lands on its neighbour, and the dirty map is trimmed to
    // what is still open. Four subtly different filters in this file is how
    // "close others" and "close to the right" end up disagreeing about a pin.

    closeOtherTabs: (path) => {
      set((s) => {
        const ws = closeOthersIn(s.workspace, s.workspace.focus, path);
        return { ...s, ...mirrorOf(ws), dirty: dropDirty(s.dirty, ws) };
      });
      void get().refreshBacklinks();
    },

    closeTabsAfter: (path) => {
      set((s) => {
        const ws = closeAfterIn(s.workspace, s.workspace.focus, path);
        return { ...s, ...mirrorOf(ws), dirty: dropDirty(s.dirty, ws) };
      });
    },

    closeAllTabs: () => {
      set((s) => {
        const ws = closeAllPanes(s.workspace);
        return { ...s, ...mirrorOf(ws), dirty: dropDirty(s.dirty, ws) };
      });
      void get().refreshBacklinks();
    },

    setTabPinned: (path, pinned) =>
      set((s) => ({ ...s, ...mirrorOf(setPinnedIn(s.workspace, s.workspace.focus, path, pinned)) })),

    moveTabTo: (path, index) =>
      set((s) => ({ ...s, ...mirrorOf(reorderTabIn(s.workspace, s.workspace.focus, path, index)) })),

    dropTab: (from, path, to, dest) =>
      set((s) => {
        let ws: Workspace;
        if (dest.kind === "edge") {
          ws = dropTabSplitIn(s.workspace, from, path, to, dest.edge);
        } else if (from !== null) {
          ws = moveTabIn(s.workspace, from, path, to, dest.index);
        } else {
          // Born in the strip: a tree drag opens a real tab in the target
          // pane, then slides it to where it was dropped.
          ws = openInPane(focusPaneIn(s.workspace, to), to, path, { newTab: true });
          ws = reorderTabIn(ws, to, path, dest.index);
        }
        return { ...s, ...mirrorOf(ws) };
      }),

    setView: (view) => {
      if (isSurfaceView(view)) {
        const path = SURFACE_TABS[view];
        set((s) => {
          // A pane still showing the shelf answers this the way it answers
          // a book (openBook above): the page's tab opens AND the mode comes
          // home to the tabs, or the shelf keeps the screen and the reader
          // sees a tab they cannot look at.
          let ws = openInPane(s.workspace, s.workspace.focus, path);
          if (paneAt(ws, ws.focus)?.mode === "library") ws = setPaneModeIn(ws, ws.focus, "edit");
          return { ...s, ...mirrorOf(ws), view: "editor" };
        });
        return;
      }
      set({ view });
    },
    mediaOpen: () => {
      const ws = get().workspace;
      const pane = paneAt(ws, ws.focus);
      const tab = pane === null ? null : activeTabOf(pane);
      return tab !== null && isMediaTab(tab.path);
    },
    toggleMedia: () => {
      const s = get();
      if (s.mediaOpen()) s.closeTab(MEDIA_TAB);
      else s.setView("media");
    },
    applyWorkspace: (ws) => {
      // A restored layout: the arrangement swapped whole, then pruned against
      // the tree the way a stored one is on boot, so a note that has gone
      // since the save does not become a dead tab.
      const existing = new Set(collectNotes(get().tree).map((n) => n.path));
      const pruned = pruneWorkspace(ws, existing);
      set((s) => ({ ...s, ...mirrorOf(pruned) }));
      persistWorkspace(pruned);
    },
    sigilsOpen: () => {
      const ws = get().workspace;
      const pane = paneAt(ws, ws.focus);
      const tab = pane === null ? null : activeTabOf(pane);
      return tab !== null && isSigilsTab(tab.path);
    },
    toggleSigils: () => {
      const s = get();
      if (s.sigilsOpen()) s.closeTab(SIGILS_TAB);
      else s.setView("sigils");
    },
    calendarOpen: () => {
      const ws = get().workspace;
      const pane = paneAt(ws, ws.focus);
      const tab = pane === null ? null : activeTabOf(pane);
      return tab !== null && isCalendarTab(tab.path);
    },
    toggleCalendar: () => {
      const s = get();
      if (s.calendarOpen()) s.closeTab(CALENDAR_TAB);
      else s.setView("calendar");
    },
    feedsOpen: () => {
      const ws = get().workspace;
      const pane = paneAt(ws, ws.focus);
      const tab = pane === null ? null : activeTabOf(pane);
      return tab !== null && isFeedsTab(tab.path);
    },
    toggleFeeds: () => {
      const s = get();
      if (s.feedsOpen()) s.closeTab(FEEDS_TAB);
      else s.setView("feeds");
    },
    todayOpen: () => {
      const ws = get().workspace;
      const pane = paneAt(ws, ws.focus);
      const tab = pane === null ? null : activeTabOf(pane);
      return tab !== null && isTodayTab(tab.path);
    },
    toggleToday: () => {
      const s = get();
      if (s.todayOpen()) s.closeTab(TODAY_TAB);
      else s.setView("today");
    },
    orbitsOpen: () => {
      const ws = get().workspace;
      const pane = paneAt(ws, ws.focus);
      const tab = pane === null ? null : activeTabOf(pane);
      return tab !== null && isOrbitsTab(tab.path);
    },
    toggleOrbits: () => {
      const s = get();
      const ws = s.workspace;
      const pane = paneAt(ws, ws.focus);
      const tab = pane === null ? null : activeTabOf(pane);
      // The door closes whichever Orbits tab is in front — the shelf
      // or a session — the way the other doors close their page.
      if (tab !== null && isOrbitsTab(tab.path)) s.closeTab(tab.path);
      else s.setView("orbits");
    },
    openOrbits: (path, section = null) => {
      set((s) => ({
        ...s,
        ...mirrorOf(openInPane(s.workspace, s.workspace.focus, orbitsTabFor(path, section))),
        view: "editor",
      }));
    },
    graphOpen: () => {
      const ws = get().workspace;
      const pane = paneAt(ws, ws.focus);
      const tab = pane === null ? null : activeTabOf(pane);
      return tab !== null && isGraphTab(tab.path) && get().view === "editor";
    },
    toggleGraph: () => {
      const s = get();
      if (s.graphOpen()) s.closeTab(GRAPH_TAB);
      else s.setView("graph");
    },
    resizeCols: (gap, ratio) =>
      set((s) => {
        const ws = resizeColsIn(s.workspace, gap, ratio);
        return ws === s.workspace ? s : { ...s, ...mirrorOf(ws) };
      }),
    resizeRows: (col, ratio) =>
      set((s) => {
        const ws = resizeRowsIn(s.workspace, col, ratio);
        return ws === s.workspace ? s : { ...s, ...mirrorOf(ws) };
      }),
  } satisfies Partial<State>;
}
