// NOTES — the vault, two ways: as a TREE, or one FOLDER per screen.
//
// FOLDERS (3.26): the desktop tree is a single scrolling outline with
// disclosure triangles, which on a phone was a column of 28px rows indented
// until the names no longer fit. So a folder became a SCREEN: 52px rows, a
// folder's count and a chevron, a tap that pushes, the OS back gesture to come
// out again. Its top bar is the folder's path as crumbs (../Crumbs.tsx), each a
// way up, and its ‹ goes UP — to the parent by path, never merely to whatever
// history holds (../up.ts; the reader on a Galaxy Z Fold whose ‹ opened Today).
//
// TREE (3.34): the same reader, "I can no longer browse folders and notes as
// easily as before". A tree is a reader's way through a vault they know, so
// the Notes tab offers it beside Folders — a switch in the tab's top bar,
// remembered — and on a two-column screen (the open Fold, a tablet) it is
// where the tab starts. Folders open in place under a disclosure chevron, in
// ONE list with the notes (../treeRows.ts computes the rows; this draws them),
// and the device remembers which folders are open.
//
// In both, a folder's pictures and films are ONE row, "Files · 13", after its
// notes, that opens in place; a tap on a file opens the attachment viewer,
// which takes a history entry like every other layer (client/overlays.ts). A
// long press on a row is its menu (rename, move, pin, publish, delete) as an
// action sheet — the desktop's own flows (client/move.ts,
// components/deleteFlow.ts). A folder with no notes says so, with a button to
// write the first one there. The root carries the reader's pinned rows first
// and the vault's tags as one chip row. Pulling the list down past its top
// refreshes the vault (../usePullRefresh.ts). And a list comes back scrolled
// to where it was left (../nav.ts).

import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import type { TagCount, TreeNode } from "../../../shared/types.ts";
import { isDrawingPath, isNotePath, noteLabelOf } from "../../../shared/noteFormat.ts";
import { getTags } from "../../api.ts";
import { isViewable } from "../../components/AttachmentViewer.tsx";
import { lazySurface } from "../../lazySurface.tsx";
import { confirmDeleteFolder, confirmDeleteNote } from "../../components/deleteFlow.ts";
import { promptModal } from "../../components/Confirm.tsx";
import { countPhrase, localeNum, t } from "../../i18n.ts";
import { checkName, itemOf, parentDir, renameTo } from "../../move.ts";
import { promptNewFolder, promptNewNote } from "../../prompts.ts";
import { useStore } from "../../state.ts";
import { findNode, orderChildren, readTreeOrder, togglePinned, writeTreeOrder, type TreeOrderPrefs, type TreeSort } from "../../treeOrder.ts";
import { isBookPath } from "../../workspace.ts";
import { useActionSheet, type ActionRow } from "../ActionSheet.tsx";
import { usePhone } from "../context.ts";
import Crumbs from "../Crumbs.tsx";
import { IconBook, IconChevron, IconFile, IconFolder, IconImage, IconPlus, IconSort } from "../icons.tsx";
import { topOf, type Screen } from "../nav.ts";
import { notesView, setNotesView, subscribeNotesView, type NotesView } from "../notesView.ts";
import { MOVE_SHEET, TAG_SHEET } from "../sheetIds.ts";
import { countOpenable, filesKey, visibleRows, type TreeRules } from "../treeRows.ts";
import { phoneTree } from "../phoneTree.ts";
import { useScrollMemory } from "../useScrollMemory.ts";
import { usePullRefresh } from "../usePullRefresh.ts";
import { publishWithConfirmation } from "../publish.ts";
import TopBar from "../TopBar.tsx";
import { useLongPress } from "../useLongPress.ts";

const AttachmentViewer = lazySurface(() => import("../../components/AttachmentViewer.tsx"));

/** A tree longer than this draws only the rows near the screen. Every row is
 *  one fixed height (phone.css `.s-ph-row`, 52px), so the window is a sum. */
const WINDOW_AT = 160;
const ROW_H = 52;
/** Rows drawn past each edge of the screen while windowing. */
const OVERSCAN = 12;

/** What a row opens: a folder pushes a list, a note or a book a screen. */
export function screenForNode(node: TreeNode): Screen | null {
  if (node.type === "folder") return { kind: "folder", path: node.path };
  if (isBookPath(node.path)) return { kind: "surface", tab: node.path };
  if (isDrawingPath(node.path)) return { kind: "surface", tab: node.path };
  if (!node.attachment && isNotePath(node.path)) return { kind: "note", path: node.path };
  return null;
}

/** A node the list shows: folders, notes, books and drawings. The other
 *  attachments are gathered in a folder's "Files" row. */
function listed(node: TreeNode): boolean {
  if (node.type === "folder") return !node.name.startsWith(".");
  return screenForNode(node) !== null;
}

/** An attachment the "Files" row gathers: what the viewer can show. */
function gathered(node: TreeNode): boolean {
  return node.type === "file" && isViewable(node) && !isBookPath(node.path);
}

const opens = (n: TreeNode): boolean => screenForNode(n) !== null;
/** What the list will SHOW under a folder: notes, books and drawings — a
 *  folder of images counts nothing, because nothing in it opens as a note. */
function countNotes(node: TreeNode): number {
  return countOpenable(node, opens);
}

function usePrefs(): [TreeOrderPrefs, (p: TreeOrderPrefs) => void] {
  const [prefs, setPrefs] = useState<TreeOrderPrefs>(readTreeOrder);
  const set = (p: TreeOrderPrefs): void => {
    writeTreeOrder(p);
    setPrefs(p);
  };
  return [prefs, set];
}

/** The verbs a long press offers on a row. */
export function rowActions(node: TreeNode, prefs: TreeOrderPrefs, setPrefs: (p: TreeOrderPrefs) => void, openMove: (path: string, isFolder: boolean) => void): ActionRow[] {
  const store = useStore.getState();
  const rows: ActionRow[] = [];
  const folder = node.type === "folder";
  const note = !folder && !node.attachment;
  const item = itemOf(node);
  if (!store.admin) return rows;
  if (folder) rows.push({ label: t("newNoteHere"), onSelect: () => void promptNewNote(node.path) });
  rows.push({
    label: t("rename"),
    onSelect: () => {
      const dir = parentDir(node.path);
      void promptModal({
        title: t("rename"),
        value: folder ? node.name : noteLabelOf(node.name),
        confirmLabel: t("rename"),
        check: (raw) => checkName(item, dir, raw),
      }).then((picked) => {
        if (picked) void renameTo(item, picked.slice(picked.lastIndexOf("/") + 1));
      });
    },
  });
  rows.push({ label: t("moveTo"), onSelect: () => openMove(node.path, folder) });
  const pinned = prefs.pinned.includes(node.path);
  rows.push({ label: pinned ? t("treeUnpin") : t("treePin"), onSelect: () => setPrefs(togglePinned(readTreeOrder(), [node.path], !pinned)) });
  if (note) {
    const published = store.publishedPaths?.has(node.path) ?? false;
    rows.push({
      label: published ? t("phUnpublish") : t("publish"),
      onSelect: () => void publishWithConfirmation(node.path, !published),
    });
    rows.push({ label: t("delete"), danger: true, onSelect: () => void confirmDeleteNote(node.path) });
  }
  if (folder) rows.push({ label: t("deleteFolder"), danger: true, onSelect: () => void confirmDeleteFolder(node.path) });
  return rows;
}

function Glyph({ node }: { node: TreeNode }) {
  return (
    <span className="s-ph-row__glyph" aria-hidden="true">
      {node.type === "folder" ? <IconFolder /> : isBookPath(node.path) ? <IconBook /> : <IconFile />}
    </span>
  );
}

const Row = memo(function Row({ node, onOpen, onMenu, pinned, current }: { node: TreeNode; onOpen: (node: TreeNode) => void; onMenu: (node: TreeNode) => void; pinned?: boolean; current?: boolean }) {
  const press = useLongPress(() => onMenu(node));
  const folder = node.type === "folder";
  const label = folder ? node.name : noteLabelOf(node.name);
  return (
    <li>
      <button
        type="button"
        className={`s-ph-row${pinned ? " s-ph-row--pinned" : ""}${current ? " s-ph-row--current" : ""}`}
        data-path={node.path}
        aria-current={current ? "page" : undefined}
        {...press.handlers}
        onClick={(e) => {
          if (press.fired()) {
            e.preventDefault();
            return;
          }
          onOpen(node);
        }}
      >
        <Glyph node={node} />
        <bdi className="s-ph-row__name" dir="auto">
          {label}
        </bdi>
        {folder && (
          <>
            <span className="s-ph-row__count">{localeNum(countNotes(node))}</span>
            <span className="s-ph-row__chev" aria-hidden="true">
              <IconChevron />
            </span>
          </>
        )}
      </button>
    </li>
  );
});

/** One row of the tree: a folder with its disclosure, or a note. */
// Props are the node itself (the same object until the tree is refreshed) and
// primitives, never the row's item — the rows are recomputed on every toggle,
// and a new object per row would re-render all of them, not just the new ones.
const TreeRow = memo(function TreeRow({ node, depth, open, onOpen, onToggle, onMenu, current }: { node: TreeNode; depth: number; open: boolean; onOpen: (node: TreeNode) => void; onToggle: (key: string) => void; onMenu: (node: TreeNode) => void; current: boolean }) {
  const press = useLongPress(() => onMenu(node));
  const folder = node.type === "folder";
  return (
    <li>
      <button
        type="button"
        className={`s-ph-row s-ph-trow${current ? " s-ph-row--current" : ""}`}
        style={{ paddingInlineStart: indent(depth) }}
        data-path={node.path}
        data-depth={depth}
        aria-expanded={folder ? open : undefined}
        aria-current={current ? "page" : undefined}
        {...press.handlers}
        onClick={(e) => {
          if (press.fired()) {
            e.preventDefault();
            return;
          }
          if (folder) onToggle(node.path);
          else onOpen(node);
        }}
      >
        <span className="s-ph-trow__disc" aria-hidden="true">
          {folder && <IconChevron />}
        </span>
        <Glyph node={node} />
        <bdi className="s-ph-row__name" dir="auto">
          {folder ? node.name : noteLabelOf(node.name)}
        </bdi>
        {folder && <span className="s-ph-row__count">{localeNum(countNotes(node))}</span>}
      </button>
    </li>
  );
});

/** Indentation for a tree row: 16px of edge, then 20 a level, to six. */
function indent(depth: number): string {
  return `${8 + Math.min(depth, 6) * 20}px`;
}

/** A folder's attachments, folded into one row that opens in place. */
function FilesRow({ folder, count, open, depth, onToggle }: { folder: string; count: number; open: boolean; depth: number; onToggle: () => void }) {
  return (
    <li>
      <button type="button" className="s-ph-row s-ph-trow s-ph-row--files" style={depth >= 0 ? { paddingInlineStart: indent(depth) } : undefined} aria-expanded={open} data-files={folder} onClick={onToggle}>
        <span className="s-ph-trow__disc" aria-hidden="true">
          <IconChevron />
        </span>
        <span className="s-ph-row__glyph" aria-hidden="true">
          <IconImage />
        </span>
        <span className="s-ph-row__name">{t("phFiles")}</span>
        <span className="s-ph-row__count">{localeNum(count)}</span>
      </button>
    </li>
  );
}

function FileRow({ node, depth, onOpen }: { node: TreeNode; depth: number; onOpen: () => void }) {
  return (
    <li>
      <button type="button" className="s-ph-row s-ph-trow s-ph-row--file" style={{ paddingInlineStart: indent(depth) }} data-path={node.path} onClick={onOpen}>
        <span className="s-ph-trow__disc" aria-hidden="true" />
        <span className="s-ph-row__glyph" aria-hidden="true">
          <IconImage />
        </span>
        <bdi className="s-ph-row__name" dir="auto">
          {node.name}
        </bdi>
      </button>
    </li>
  );
}

/** "No notes here yet", and a way to write the first one. */
function EmptyFolder({ path, depth }: { path: string; depth?: number }) {
  const admin = useStore((s) => s.admin);
  return (
    <div className="s-ph-emptyfolder" style={depth !== undefined ? { paddingInlineStart: indent(depth + 1) } : undefined} data-empty-folder={path}>
      <p className="s-ph-emptyfolder__text">{t("phFolderNoNotes")}</p>
      {admin && (
        <button type="button" className="s-ph-btn s-ph-btn--quiet" data-action="new-note-here" onClick={() => void promptNewNote(path)}>
          {t("newNoteHere")}
        </button>
      )}
    </div>
  );
}

/** The key the list the reader is on reports its selection by: the note open
 *  beside it on a tablet. */
function useCurrentPath(): string | null {
  const phone = usePhone();
  if (!phone.tablet) return null;
  const top = topOf(phone.state);
  return top.kind === "note" ? top.path : top.kind === "surface" ? top.tab : null;
}

function useExpansionEpoch(): number {
  return useSyncExternalStore(phoneTree.subscribe, phoneTree.epoch, phoneTree.epoch);
}

/** THE TREE: every row that shows, windowed when there are many. */
function TreeList({ root, prefs, onOpen, onMenu, onFiles, scroller }: { root: TreeNode; prefs: TreeOrderPrefs; onOpen: (n: TreeNode) => void; onMenu: (n: TreeNode) => void; onFiles: (folder: string, index: number) => void; scroller: RefObject<HTMLDivElement | null> }) {
  const epoch = useExpansionEpoch();
  const current = useCurrentPath();
  const rules = useMemo<TreeRules>(() => ({ order: (kids, parent) => orderChildren(kids, parent, prefs), listed, file: gathered }), [prefs]);
  // `epoch` is the expansion's version: a toggle is a new list, nothing else is.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => visibleRows(root, phoneTree.memory.isOpen, rules), [root, rules, epoch]);
  const listRef = useRef<HTMLUListElement | null>(null);
  const windowed = rows.length > WINDOW_AT;
  // WHERE THE SCREEN IS, read only when layout is already clean — in a
  // frame callback after a scroll, and in the tap itself BEFORE the toggle
  // changes anything — so the window is known while React renders. Reading it
  // after the new rows are in the document (a layout effect) forced a style
  // pass over every row at once: the one long task check-perf found.
  const geo = useRef({ top: 0, scroll: 0, height: 1000 });
  const [, setTick] = useState(0);
  const read = useCallback((): void => {
    const el = scroller.current;
    const list = listRef.current;
    if (!el || !list) return;
    geo.current = { top: list.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop, scroll: el.scrollTop, height: el.clientHeight };
  }, [scroller]);
  const toggle = useCallback(
    (key: string) => {
      read();
      phoneTree.toggle(key);
    },
    [read],
  );
  const span = (g: { top: number; scroll: number; height: number }): [number, number] => {
    const first = Math.max(0, Math.floor((g.scroll - g.top) / ROW_H) - OVERSCAN);
    return [first, Math.min(rows.length, Math.ceil((g.scroll - g.top + g.height) / ROW_H) + OVERSCAN)];
  };
  const range = span(geo.current);
  useEffect(() => {
    const el = scroller.current;
    if (!windowed || !el) return;
    let raf = 0;
    const onFrame = (): void => {
      raf = 0;
      const before = span(geo.current);
      read();
      const after = span(geo.current);
      if (before[0] !== after[0] || before[1] !== after[1]) setTick((n) => n + 1);
    };
    const onScroll = (): void => {
      if (raf === 0) raf = requestAnimationFrame(onFrame);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowed, rows.length, scroller, read]);
  const [from, to] = windowed ? range : [0, rows.length];
  const shown = rows.slice(from, to);
  return (
    <ul
      ref={listRef}
      className="s-ph-list s-ph-tree"
      aria-label={t("phViewTree")}
      data-rows={rows.length}
      style={windowed ? { paddingTop: from * ROW_H, paddingBottom: (rows.length - to) * ROW_H } : undefined}
    >
      {shown.map((item) => {
        switch (item.kind) {
          case "node":
            return <TreeRow key={item.node.path} node={item.node} depth={item.depth} open={item.open} onOpen={onOpen} onToggle={toggle} onMenu={onMenu} current={current === item.node.path} />;
          case "files":
            return <FilesRow key={filesKey(item.folder)} folder={item.folder} count={item.count} open={item.open} depth={item.depth} onToggle={() => toggle(filesKey(item.folder))} />;
          case "file":
            return <FileRow key={item.node.path} node={item.node} depth={item.depth} onOpen={() => onFiles(item.folder, item.index)} />;
          case "empty":
            return (
              <li key={`${item.folder}\u0000empty`} className="s-ph-tree__empty">
                <EmptyFolder path={item.folder} depth={item.depth - 1} />
              </li>
            );
        }
      })}
    </ul>
  );
}

const SORTS: { sort: TreeSort; key: "phSortAZ" | "phSortZA" | "phSortManual" }[] = [
  { sort: "name", key: "phSortAZ" },
  { sort: "name-desc", key: "phSortZA" },
  { sort: "manual", key: "phSortManual" },
];

function ViewSwitch({ view }: { view: NotesView }) {
  return (
    <div className="s-ph-seg s-ph-seg--bar" role="group" aria-label={t("phNotesView")}>
      {(["tree", "folders"] as const).map((v) => (
        <button
          key={v}
          type="button"
          data-notes-view={v}
          aria-pressed={view === v}
          className={`s-ph-seg__btn${view === v ? " s-ph-seg__btn--on" : ""}`}
          onClick={() => setNotesView(v)}
        >
          {t(v === "tree" ? "phViewTree" : "phViewFolders")}
        </button>
      ))}
    </div>
  );
}

export default function NotesScreen({ path, onBack, onUp }: { path: string; onBack?: () => void; onUp?: (path: string) => void }) {
  const phone = usePhone();
  const tree = useStore((s) => s.tree);
  const admin = useStore((s) => s.admin);
  useStore((s) => s.language);
  useStore((s) => s.publishedPaths);
  const [prefs, setPrefs] = usePrefs();
  const actions = useActionSheet();
  const view = useSyncExternalStore(subscribeNotesView, () => notesView(phone.tablet), () => notesView(phone.tablet));
  const treeView = path === "" && view === "tree";
  const node = path === "" ? tree : findNode(tree, path);
  const rows = useMemo(() => (node?.children ? orderChildren(node.children, node.path, prefs).filter(listed) : []), [node, prefs]);
  const pinnedNodes = useMemo(
    () => (path === "" && tree ? prefs.pinned.map((p) => findNode(tree, p)).filter((n): n is TreeNode => n !== null && listed(n)) : []),
    [path, tree, prefs],
  );
  const [tags, setTags] = useState<TagCount[]>([]);
  useEffect(() => {
    if (path !== "") return;
    let live = true;
    getTags()
      .then((list) => live && setTags(list.slice().sort((a, b) => b.count - a.count).slice(0, 24)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [path, tree]);
  // A folder that moved takes its open state with it.
  const lastRemap = useStore((s) => s.lastRemap);
  useEffect(() => {
    phoneTree.follow(lastRemap);
  }, [lastRemap]);

  const listRef = useRef<HTMLDivElement | null>(null);
  useScrollMemory(listRef);
  const pull = usePullRefresh(listRef);
  const epoch = useExpansionEpoch();
  const current = useCurrentPath();
  const files = useMemo(() => (node?.children ?? []).filter(gathered), [node]);
  const filesOpen = phoneTree.memory.isOpen(filesKey(path)) && epoch >= 0;
  const [viewer, setViewer] = useState<{ items: TreeNode[]; index: number } | null>(null);
  const open = useCallback((n: TreeNode): void => {
    const screen = screenForNode(n);
    if (screen) phone.open(screen);
    // `phone` changes with every navigation; the rows are memo'd on this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone.open]);
  const openMove = (p: string, isFolder: boolean): void => phone.openSheet(MOVE_SHEET, { path: p, isFolder });
  const menu = (n: TreeNode): void => actions(n.type === "folder" ? n.name : noteLabelOf(n.name), rowActions(n, prefs, setPrefs, openMove));
  const menuRef = useRef(menu);
  menuRef.current = menu;
  const onMenu = useCallback((n: TreeNode) => menuRef.current(n), []);
  const openFiles = useCallback(
    (folder: string, index: number) => {
      const f = folder === "" ? tree : findNode(tree, folder);
      const items = (f?.children ?? []).filter(gathered);
      if (items[index]) setViewer({ items, index });
    },
    [tree],
  );
  const sortMenu = (): void =>
    actions(
      t("phSort"),
      SORTS.map(({ sort, key }) => ({
        label: t(key),
        note: prefs.sort === sort ? t("phCurrent") : undefined,
        onSelect: () => setPrefs({ ...readTreeOrder(), sort }),
      })),
    );
  const title = path === "" ? t("phTabNotes") : (node?.name ?? path.slice(path.lastIndexOf("/") + 1));
  const toTop = (): void => listRef.current?.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <div className="s-ph-screen s-ph-notes" data-screen="notes" data-folder={path} data-view={path === "" ? view : "folders"}>
      <TopBar
        title={title}
        userTitle={path !== ""}
        onBack={onBack}
        onTitle={toTop}
        lead={path === "" ? <ViewSwitch view={view} /> : onUp ? <Crumbs path={path} onUp={onUp} onCurrent={toTop} /> : undefined}
        actions={
          admin ? (
            <>
              <button type="button" className="s-ph-icon" aria-label={t("phSort")} onClick={sortMenu}>
                <IconSort />
              </button>
              <button
                type="button"
                className="s-ph-icon"
                aria-label={path === "" ? t("newNote") : t("newNoteHere")}
                data-action="new-note"
                onClick={() => void promptNewNote(path)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  actions(t("phCreate"), [
                    { label: t("newNote"), onSelect: () => void promptNewNote(path) },
                    { label: t("newFolder"), onSelect: () => void promptNewFolder(path) },
                  ]);
                }}
              >
                <IconPlus />
              </button>
            </>
          ) : undefined
        }
      />
      <div className="s-ph-scroll" ref={listRef}>
        {pull}
        {path === "" && tags.length > 0 && (
          <div className="s-ph-chips" role="list" aria-label={t("tags")}>
            {tags.map((tag) => (
              <button key={tag.tag} type="button" role="listitem" className="s-ph-chip" onClick={() => phone.open({ kind: "tag", tag: tag.tag })}>
                <bdi>#{tag.tag}</bdi>
                <span className="s-ph-chip__n">{localeNum(tag.count)}</span>
              </button>
            ))}
            <button type="button" role="listitem" className="s-ph-chip s-ph-chip--all" data-chip="all-tags" onClick={() => phone.openSheet(TAG_SHEET, { mode: "browse" })}>
              {t("phAllTags")}
            </button>
          </div>
        )}
        {pinnedNodes.length > 0 && (
          <section aria-label={t("phPinned")}>
            <h2 className="s-ph-head">{t("phPinned")}</h2>
            <ul className="s-ph-list">
              {pinnedNodes.map((n) => (
                <Row key={`pin:${n.path}`} node={n} onOpen={open} onMenu={onMenu} pinned current={current === n.path} />
              ))}
            </ul>
          </section>
        )}
        {node === null ? (
          <p className="s-ph-empty">{tree === null ? t("loading") : t("phFolderGone")}</p>
        ) : treeView ? (
          <>
            {pinnedNodes.length > 0 && <h2 className="s-ph-head">{t("phAllNotes")}</h2>}
            <TreeList root={node} prefs={prefs} onOpen={open} onMenu={onMenu} onFiles={openFiles} scroller={listRef} />
            <p className="s-ph-foot">{countPhrase(countNotes(node), "notes")}</p>
          </>
        ) : (
          <>
            {pinnedNodes.length > 0 && rows.length > 0 && <h2 className="s-ph-head">{t("phAllNotes")}</h2>}
            {rows.length === 0 ? (
              <EmptyFolder path={path} />
            ) : (
              <ul className="s-ph-list" aria-label={title}>
                {rows.map((n) => (
                  <Row key={n.path} node={n} onOpen={open} onMenu={onMenu} current={current === n.path} />
                ))}
              </ul>
            )}
            {files.length > 0 && (
              <ul className="s-ph-list s-ph-files" aria-label={t("phFiles")}>
                <FilesRow folder={path} count={files.length} open={filesOpen} depth={-1} onToggle={() => phoneTree.toggle(filesKey(path))} />
                {filesOpen && files.map((f, i) => <FileRow key={f.path} node={f} depth={0} onOpen={() => setViewer({ items: files, index: i })} />)}
              </ul>
            )}
            {rows.length > 0 && <p className="s-ph-foot">{countPhrase(countNotes(node), "notes")}</p>}
          </>
        )}
      </div>
      {viewer !== null && viewer.items[viewer.index] && (
        <Suspense fallback={null}>
          <AttachmentViewer items={viewer.items} index={viewer.index} onIndex={(i) => setViewer((v) => (v ? { ...v, index: i } : v))} onClose={() => setViewer(null)} />
        </Suspense>
      )}
    </div>
  );
}
