// BOOKMARKS IN THE TREE — the rows above the vault that come from
// Bookmarks.md (shared/bookmarks.ts, client/bookmarks.ts). Drag a row onto
// another to reorder; the note is rewritten with the list lines moved.
//
// Three kinds of row, from the note's own grammar: a note, a HEADING inside
// a note (the row opens the note and lands on the heading, exactly as the
// `[[Note#Heading]]` it was written as would), and a SEARCH — an inline code
// span holding a query — which runs it in the search box above. A search
// row is a saved search, and the reason it is a bookmark rather than a
// separate "saved searches" pane is that the reader already has a note for
// the things they keep coming back to, and a query is one of those things.

import { useEffect, useState, type DragEvent } from "react";
import { BOOKMARKS_EVENT, bookmarksNow, loadBookmarks, reorder } from "../bookmarks.ts";
import { bookmarkKey, type BookmarkItem } from "../../shared/bookmarks.ts";
import { resolveLink } from "../editor/links.ts";
import { localeNum, t, tf } from "../i18n.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";

const COLLAPSED_KEY = "astrolabe.bookmarks-collapsed";

/** Open a note and, when the bookmark names a heading, land on it. A note
 *  that is already open cannot be "opened" into a landing, so the heading is
 *  asked for directly — the same two doors a clicked `[[Note#Heading]]` uses
 *  (client/editor/livePreview.ts). */
function openBookmark(path: string, heading: string | null): void {
  const store = useStore.getState();
  if (heading !== null && store.openPath === path) {
    window.dispatchEvent(new CustomEvent("astrolabe:goto-heading", { detail: { text: heading } }));
    return;
  }
  if (heading !== null) store.setPendingHeading(heading);
  store.openNote(path);
}

export default function BookmarksRows() {
  const tree = useStore((s) => s.tree);
  const openPath = useStore((s) => s.openPath);
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
    const order = items.map(bookmarkKey);
    const from = order.indexOf(dragging);
    const to = order.indexOf(onto);
    if (from === -1 || to === -1) return;
    order.splice(from, 1);
    order.splice(to, 0, dragging);
    setDragging(null);
    reorder(order).catch(() => toast(t("bookmarkFailed"), "error"));
  };

  const row = (b: BookmarkItem) => {
    const key = bookmarkKey(b);
    const search = b.kind === "search";
    const path = search ? null : resolveLink(b.target, tree);
    const missing = !search && path === null;
    const label = b.label ?? (search ? b.target : `${b.target.split("/").pop() ?? b.target}${b.heading !== null ? ` › ${b.heading}` : ""}`);
    const active = !search && path !== null && path === openPath && b.heading === null;
    const title = search ? tf("bookmarkRunSearch", { query: b.target }) : b.heading !== null ? `${path ?? b.target}#${b.heading}` : (path ?? b.target);
    return (
      <button
        key={key}
        type="button"
        className={`s-tree__row s-bookmarks__row${active ? " s-tree__row--active" : ""}${missing ? " s-bookmarks__row--missing" : ""}${search && b.label === null ? " s-bookmarks__row--search" : ""}${dragging === key ? " is-dragging" : ""}`}
        draggable
        onDragStart={() => setDragging(key)}
        onDragEnd={() => setDragging(null)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => drop(e, key)}
        onClick={() => {
          // The search box listens for this (Sidebar.tsx) and reveals the
          // pane holding the results, the same door a clicked #tag uses.
          if (search) window.dispatchEvent(new CustomEvent("astrolabe:search", { detail: b.target }));
          else if (path !== null) openBookmark(path, b.heading);
        }}
        title={title}
        dir="auto"
      >
        <span className="s-bookmarks__star" aria-hidden="true">{search ? "⌕" : b.heading !== null ? "§" : "★"}</span>
        <bdi>{label}</bdi>
      </button>
    );
  };

  return (
    <div className="s-tree__pinned s-bookmarks" role="group" aria-label={t("bookmarks")} title={t("bookmarksHint")}>
      <button type="button" className="s-tree__pinned-head s-bookmarks__head" onClick={toggle} aria-expanded={!collapsed} title={t(collapsed ? "showBookmarks" : "hideBookmarks")}>
        <span className={`s-tree__chevron${collapsed ? "" : " s-tree__chevron--open"}`} aria-hidden="true">›</span>
        <span>{t("bookmarks")}</span>
        <span className="s-bookmarks__count">{localeNum(items.length)}</span>
      </button>
      {!collapsed && items.map(row)}
    </div>
  );
}
