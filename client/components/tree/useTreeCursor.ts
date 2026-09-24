// The notes tree's keyboard cursor. The tree is ONE tab stop with an
// aria-activedescendant, painted imperatively so moving it costs an attribute
// write rather than a re-render. Moved out of client/components/Sidebar.tsx
// unchanged: it was a block of that component's body, and Sidebar calls it
// exactly where the block stood.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { TREE_ALL_EVENT, TREE_REVEAL_EVENT, expandAncestors, findNode, parentOf, setAllFolders } from "./expansion.ts";
import type { TreeNode } from "../../../shared/types.ts";
import { confirmDeleteAttachment, confirmDeleteFolder, confirmDeleteNote } from "../deleteFlow.ts";
import { useStore } from "../../state.ts";

export interface MenuState {
  x: number;
  y: number;
  node: TreeNode; // the root node (path "") stands in for "vault root"
  /** Opened from the keyboard (Shift+F10 / the menu key), so focus has to go
   *  INTO the menu and come back to the row when it closes. A pointer-opened
   *  menu leaves focus where the reader put it. */
  fromKeyboard?: boolean;
}

function visibleRows(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(".s-tree__item")];
}

/** The tree's keyboard cursor (aria-activedescendant) and the epoch a bulk
 *  expansion write bumps. Called once, by Sidebar, where its body used to
 *  sit; moved out unchanged. */
export function useTreeCursor({
  tree,
  treeScrollRef,
  startRename,
  setMenu,
}: {
  tree: TreeNode | null;
  treeScrollRef: React.RefObject<HTMLElement | null>;
  startRename: (path: string) => void;
  setMenu: React.Dispatch<React.SetStateAction<MenuState | null>>;
}) {
  // ── Tree cursor (aria-activedescendant) ────────────────────────────────
  const treeRef = useRef<HTMLDivElement | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  // Bumped when the expansion map is rewritten WHOLESALE (collapse all,
  // expand all, reveal): rows keep their open state locally for cheap
  // per-chevron toggles, so a bulk write is followed by a keyed remount and
  // every row re-seeds from the map.
  const [treeEpoch, setTreeEpoch] = useState(0);
  useEffect(() => {
    const onAll = (e: Event): void => {
      const open = (e as CustomEvent<{ open: boolean }>).detail?.open === true;
      setAllFolders(useStore.getState().tree, open);
      setTreeEpoch((n) => n + 1);
    };
    const onReveal = (e: Event): void => {
      const path = (e as CustomEvent<{ path: string }>).detail?.path;
      if (typeof path !== "string" || path === "") return;
      expandAncestors(path);
      setTreeEpoch((n) => n + 1);
      setCursor(path);
      // After the remount has painted the now-visible row.
      requestAnimationFrame(() => {
        treeScrollRef.current
          ?.querySelector<HTMLElement>(`[data-tree-path="${CSS.escape(path)}"]`)
          ?.scrollIntoView({ block: "center" });
      });
    };
    window.addEventListener(TREE_ALL_EVENT, onAll);
    window.addEventListener(TREE_REVEAL_EVENT, onReveal);
    return () => {
      window.removeEventListener(TREE_ALL_EVENT, onAll);
      window.removeEventListener(TREE_REVEAL_EVENT, onReveal);
    };
  }, []);
  /** The cursor as a DOM class + activedescendant, applied imperatively so
   *  moving it costs one attribute write instead of a re-render of the tree. */
  const paintCursor = useCallback((path: string | null, scroll = true) => {
    const container = treeRef.current;
    if (!container) return;
    for (const el of container.querySelectorAll(".s-tree__item--cursor")) {
      el.classList.remove("s-tree__item--cursor");
    }
    if (path === null) {
      container.removeAttribute("aria-activedescendant");
      return;
    }
    const row = container.querySelector<HTMLElement>(
      `[data-tree-path="${CSS.escape(path)}"]`,
    );
    if (!row) {
      container.removeAttribute("aria-activedescendant");
      return;
    }
    row.classList.add("s-tree__item--cursor");
    container.setAttribute("aria-activedescendant", row.id);
    if (scroll) row.scrollIntoView({ block: "nearest" });
  }, []);

  const moveCursor = useCallback(
    (path: string | null) => {
      setCursor(path);
      paintCursor(path);
    },
    [paintCursor],
  );

  // The tree re-renders under the cursor constantly (SSE, folder toggles,
  // publish marks). Repaint after every commit so the highlight and the
  // activedescendant keep pointing at a row that still exists.
  useLayoutEffect(() => {
    paintCursor(cursor, false);
  });

  /** Where the cursor should start: the open note if it is on screen, else
   *  the first row. Never nothing — a tree you can focus but not steer is a
   *  dead end. (openPath is read off the store rather than subscribed to:
   *  Sidebar re-rendering on every note switch would cost more than this
   *  one lookup on focus.) */
  const initialCursor = useCallback((): string | null => {
    const container = treeRef.current;
    if (!container) return null;
    const rows = visibleRows(container);
    if (rows.length === 0) return null;
    const open = useStore.getState().openPath;
    const found = open ? rows.find((r) => r.dataset.treePath === open) : undefined;
    return (found ?? rows[0]).dataset.treePath ?? null;
  }, []);

  const onTreeKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const container = treeRef.current;
      if (!container) return;
      // A rename input inside a row owns its own keys (it stops propagation),
      // so anything arriving here is the tree's — EXCEPT a button that sits
      // in the tree without being a tree row: a bookmark row (BookmarksRows)
      // or the bookmarks shelf's own header. Those are real buttons with
      // their own click, and Enter on one must press IT, not the tree's
      // cursor row somewhere below. Arrows still walk the tree from there.
      const target = e.target as HTMLElement;
      if ((e.key === "Enter" || e.key === " ") && target !== container && target.closest(".s-tree__item") === null) return;
      const rows = visibleRows(container);
      if (rows.length === 0) return;
      const at = Math.max(
        0,
        rows.findIndex((r) => r.dataset.treePath === cursor),
      );
      const row = rows[at];
      const path = row?.dataset.treePath ?? null;
      const isFolder = row?.getAttribute("aria-expanded") !== null;
      const isOpen = row?.getAttribute("aria-expanded") === "true";
      const step = (to: number): void => {
        e.preventDefault();
        moveCursor(rows[Math.max(0, Math.min(rows.length - 1, to))]?.dataset.treePath ?? null);
      };

      switch (e.key) {
        case "ArrowDown":
          step(at + 1);
          return;
        case "ArrowUp":
          step(at - 1);
          return;
        case "Home":
          step(0);
          return;
        case "End":
          step(rows.length - 1);
          return;
        case "ArrowRight":
        case "ArrowLeft": {
          // Logical, not physical: in an RTL sidebar the key that opens a
          // folder is the one pointing INTO the indent, which is Left.
          const rtl = getComputedStyle(container).direction === "rtl";
          const forward = rtl ? e.key === "ArrowLeft" : e.key === "ArrowRight";
          e.preventDefault();
          if (forward) {
            if (isFolder && !isOpen) row.click(); // expand
            else if (isFolder && isOpen) step(at + 1); // …then walk in
            return;
          }
          if (isFolder && isOpen) {
            row.click(); // collapse
            return;
          }
          // Otherwise climb to the parent row: the nearest row above whose
          // indent is shallower than this one's.
          if (!path) return;
          const parent = parentOf(path);
          const parentRow = rows.find((r) => r.dataset.treePath === parent);
          if (parentRow) moveCursor(parent);
          return;
        }
        case "Enter":
        case " ":
          if (!row) return;
          e.preventDefault();
          row.click();
          return;
        case "F2":
          if (path && useStore.getState().admin) {
            e.preventDefault();
            startRename(path);
          }
          return;
        case "Delete": {
          if (!path || !useStore.getState().admin) return;
          const node = findNode(tree, path);
          if (!node) return;
          e.preventDefault();
          // The SAME flow the context menu runs (components/deleteFlow.ts):
          // the keyboard route must not be the one that skips the preview and
          // its "…still embedded by ‘essay’" warning.
          if (node.type === "folder") void confirmDeleteFolder(node.path);
          else if (node.attachment) void confirmDeleteAttachment(node.path);
          else void confirmDeleteNote(node.path);
          return;
        }
        case "ContextMenu":
          break;
        case "F10":
          if (!e.shiftKey) return;
          break;
        default:
          return;
      }
      // Shift+F10 / the context-menu key: the keyboard's right-click. It
      // opens at the row, not at the last place the mouse happened to be.
      if (!path || !useStore.getState().admin) return;
      const node = findNode(tree, path);
      if (!node) return;
      e.preventDefault();
      const box = row.getBoundingClientRect();
      setMenu({ x: Math.round(box.left + 12), y: Math.round(box.bottom), node, fromKeyboard: true });
    },
    [cursor, moveCursor, startRename, tree],
  );
  return { treeRef, cursor, setCursor, treeEpoch, setTreeEpoch, moveCursor, initialCursor, onTreeKeyDown };
}
