// BOOKMARKS IN THE TREE — the rows above the vault that come from
// Bookmarks.md (shared/bookmarks.ts, client/bookmarks.ts). Drag a row onto
// another to reorder; the note is rewritten with the list lines moved.

import { useEffect, useState, type DragEvent } from "react";
import { BOOKMARKS_EVENT, bookmarksNow, loadBookmarks, reorder } from "../bookmarks.ts";
import { resolveLink } from "../editor/links.ts";
import { localeNum, t } from "../i18n.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";

const COLLAPSED_KEY = "astrolabe.bookmarks-collapsed";

export default function BookmarksRows() {
  const tree = useStore((s) => s.tree);
  const openPath = useStore((s) => s.openPath);
  const openNote = useStore((s) => s.openNote);
  const [items, setItems] = useState(bookmarksNow);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [dragging, setDragging] = useState<string | null>(null);

  useEffect(() => {
    const sync = (): void => setItems(bookmarksNow());
    window.addEventListener(BOOKMARKS_EVENT, sync);
    void loadBookmarks();
    return () => window.removeEventListener(BOOKMARKS_EVENT, sync);
  }, []);

  if (items.length === 0) return null;

  const toggle = (): void => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, String(next));
    } catch {
      // storage unavailable
    }
  };

  const drop = (e: DragEvent, onto: string): void => {
    e.preventDefault();
    if (dragging === null || dragging === onto) return;
    const order = items.map((b) => b.target);
    const from = order.indexOf(dragging);
    const to = order.indexOf(onto);
    if (from === -1 || to === -1) return;
    order.splice(from, 1);
    order.splice(to, 0, dragging);
    setDragging(null);
    reorder(order).catch(() => toast(t("bookmarkFailed"), "error"));
  };

  return (
    <div className="s-tree__pinned s-bookmarks" role="group" aria-label={t("bookmarks")} title={t("bookmarksHint")}>
      <button type="button" className="s-tree__pinned-head s-bookmarks__head" onClick={toggle} aria-expanded={!collapsed} title={t(collapsed ? "showBookmarks" : "hideBookmarks")}>
        <span className={`s-tree__chevron${collapsed ? "" : " s-tree__chevron--open"}`} aria-hidden="true">›</span>
        <span>{t("bookmarks")}</span>
        <span className="s-bookmarks__count">{localeNum(items.length)}</span>
      </button>
      {!collapsed &&
        items.map((b) => {
          const path = resolveLink(b.target, tree);
          const label = b.label ?? b.target.split("/").pop() ?? b.target;
          const active = path !== null && path === openPath;
          return (
            <button
              key={b.target}
              type="button"
              className={`s-tree__row s-bookmarks__row${active ? " s-tree__row--active" : ""}${path === null ? " s-bookmarks__row--missing" : ""}${dragging === b.target ? " is-dragging" : ""}`}
              draggable
              onDragStart={() => setDragging(b.target)}
              onDragEnd={() => setDragging(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => drop(e, b.target)}
              onClick={() => {
                if (path !== null) openNote(path);
              }}
              title={path ?? b.target}
              dir="auto"
            >
              <span className="s-bookmarks__star" aria-hidden="true">★</span>
              <bdi>{label}</bdi>
            </button>
          );
        })}
    </div>
  );
}
