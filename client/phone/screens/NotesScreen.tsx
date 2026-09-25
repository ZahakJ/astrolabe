// NOTES — the vault's folders as pushed lists, one folder per screen.
//
// The desktop tree is a single scrolling outline with disclosure triangles,
// which on a phone is a column of 28px rows indented until the names no
// longer fit (the audit's drawer: 320 of 412px, half of it the tag shelf).
// Here a folder is a SCREEN: 52px rows, a folder's count and a chevron, a tap
// that pushes, and the OS back gesture to come out again. The root carries
// the reader's pinned rows first and the vault's tags as one chip row, not
// half the screen.
//
// A folder's pictures, recordings and films come after its notes as a FILES
// section — the first sixty, then a count — and a tap opens the desktop's
// attachment viewer, which on a phone takes a history entry like every other
// layer (client/overlays.ts), so Back closes it. The chip row ends in "All
// tags", which opens the tag picker (../TagPickerSheet.tsx) to browse them
// all. And a folder comes back scrolled to where it was left (nav.ts).
//
// A long press on a row is its menu (rename, move, pin, publish, delete) as
// an action sheet — the same verbs the desktop's row menu offers, through the
// same flows (client/move.ts, components/deleteFlow.ts), so a rename on the
// phone rewrites the same wikilinks and offers the same undo.

import { memo, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { TagCount, TreeNode } from "../../../shared/types.ts";
import { isDrawingPath, isNotePath, noteLabelOf } from "../../../shared/noteFormat.ts";
import { getTags } from "../../api.ts";
import { isViewable } from "../../components/AttachmentViewer.tsx";
import { lazySurface } from "../../lazySurface.tsx";
import { confirmDeleteFolder, confirmDeleteNote } from "../../components/deleteFlow.ts";
import { promptModal } from "../../components/Confirm.tsx";
import { countPhrase, localeNum, t, tf } from "../../i18n.ts";
import { checkName, itemOf, parentDir, renameTo } from "../../move.ts";
import { promptNewFolder, promptNewNote } from "../../prompts.ts";
import { useStore } from "../../state.ts";
import { findNode, orderChildren, readTreeOrder, togglePinned, writeTreeOrder, type TreeOrderPrefs, type TreeSort } from "../../treeOrder.ts";
import { isBookPath } from "../../workspace.ts";
import { useActionSheet, type ActionRow } from "../ActionSheet.tsx";
import { usePhone } from "../context.ts";
import { IconBook, IconChevron, IconFile, IconFolder, IconImage, IconPlus, IconSort } from "../icons.tsx";
import { MOVE_SHEET, TAG_SHEET } from "../sheetIds.ts";
import { useScrollMemory } from "../useScrollMemory.ts";
import { publishWithConfirmation } from "../publish.ts";
import type { Screen } from "../nav.ts";
import TopBar from "../TopBar.tsx";
import { useLongPress } from "../useLongPress.ts";

const AttachmentViewer = lazySurface(() => import("../../components/AttachmentViewer.tsx"));

/** A folder's files, shown after its notes: this many, then a count. */
const FILES_SHOWN = 60;

/** What a row opens: a folder pushes a list, a note or a book a screen. */
export function screenForNode(node: TreeNode): Screen | null {
  if (node.type === "folder") return { kind: "folder", path: node.path };
  if (isBookPath(node.path)) return { kind: "surface", tab: node.path };
  if (isDrawingPath(node.path)) return { kind: "surface", tab: node.path };
  if (!node.attachment && isNotePath(node.path)) return { kind: "note", path: node.path };
  return null;
}

/** A node the list shows: folders, notes, books and drawings. The other
 *  attachments (a folder of 1,158 images) are the desktop's to list. */
function listed(node: TreeNode): boolean {
  if (node.type === "folder") return !node.name.startsWith(".");
  return screenForNode(node) !== null;
}

function countNotes(node: TreeNode): number {
  let n = 0;
  for (const c of node.children ?? []) {
    // What the list will SHOW: notes, books and drawings — a folder of
    // images counts nothing, because nothing in it opens here.
    if (c.type === "folder") n += countNotes(c);
    else if (screenForNode(c) !== null) n += 1;
  }
  return n;
}

function usePrefs(): [TreeOrderPrefs, (p: TreeOrderPrefs) => void] {
  const [prefs, setPrefs] = useState<TreeOrderPrefs>(readTreeOrder);
  const set = (p: TreeOrderPrefs): void => {
    writeTreeOrder(p);
    setPrefs(p);
  };
  return [prefs, set];
}

/** The verbs a long press offers on a row. Exported: the note screen's own
 *  Actions segment offers the same list for the note in hand. */
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

const Row = memo(function Row({ node, onOpen, onMenu, pinned }: { node: TreeNode; onOpen: (node: TreeNode) => void; onMenu: (node: TreeNode) => void; pinned?: boolean }) {
  const press = useLongPress(() => onMenu(node));
  const folder = node.type === "folder";
  const book = isBookPath(node.path);
  const count = folder ? countNotes(node) : 0;
  const label = folder ? node.name : noteLabelOf(node.name);
  return (
    <li>
      <button
        type="button"
        className={`s-ph-row${pinned ? " s-ph-row--pinned" : ""}`}
        data-path={node.path}
        {...press.handlers}
        onClick={(e) => {
          if (press.fired()) {
            e.preventDefault();
            return;
          }
          onOpen(node);
        }}
      >
        <span className="s-ph-row__glyph" aria-hidden="true">
          {folder ? <IconFolder /> : book ? <IconBook /> : <IconFile />}
        </span>
        <bdi className="s-ph-row__name" dir="auto">
          {label}
        </bdi>
        {folder && (
          <>
            <span className="s-ph-row__count">{localeNum(count)}</span>
            <span className="s-ph-row__chev" aria-hidden="true">
              <IconChevron />
            </span>
          </>
        )}
      </button>
    </li>
  );
});

const SORTS: { sort: TreeSort; key: "phSortAZ" | "phSortZA" | "phSortManual" }[] = [
  { sort: "name", key: "phSortAZ" },
  { sort: "name-desc", key: "phSortZA" },
  { sort: "manual", key: "phSortManual" },
];

export default function NotesScreen({ path, onBack }: { path: string; onBack?: () => void; onUp?: (path: string) => void }) {
  const phone = usePhone();
  const tree = useStore((s) => s.tree);
  const admin = useStore((s) => s.admin);
  useStore((s) => s.language);
  useStore((s) => s.publishedPaths);
  const [prefs, setPrefs] = usePrefs();
  const actions = useActionSheet();
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

  const listRef = useRef<HTMLDivElement | null>(null);
  useScrollMemory(listRef);
  const files = useMemo(() => (node?.children ?? []).filter((c) => c.type === "file" && isViewable(c)), [node]);
  const [viewer, setViewer] = useState<number | null>(null);
  const open = (n: TreeNode): void => {
    const screen = screenForNode(n);
    if (screen) phone.open(screen);
  };
  const openMove = (p: string, isFolder: boolean): void => phone.openSheet(MOVE_SHEET, { path: p, isFolder });
  const menu = (n: TreeNode): void => actions(n.type === "folder" ? n.name : noteLabelOf(n.name), rowActions(n, prefs, setPrefs, openMove));
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

  return (
    <div className="s-ph-screen s-ph-notes" data-screen="notes" data-folder={path}>
      <TopBar
        title={title}
        userTitle={path !== ""}
        onBack={onBack}
        onTitle={() => listRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
        actions={
          admin ? (
            <>
              <button type="button" className="s-ph-icon" aria-label={t("phSort")} onClick={sortMenu}>
                <IconSort />
              </button>
              <button
                type="button"
                className="s-ph-icon"
                aria-label={t("newNote")}
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
                <Row key={`pin:${n.path}`} node={n} onOpen={open} onMenu={menu} pinned />
              ))}
            </ul>
          </section>
        )}
        {node === null ? (
          <p className="s-ph-empty">{tree === null ? t("loading") : t("phFolderGone")}</p>
        ) : rows.length === 0 ? (
          <p className="s-ph-empty">{t("phFolderEmpty")}</p>
        ) : (
          <>
            {pinnedNodes.length > 0 && <h2 className="s-ph-head">{t("phAllNotes")}</h2>}
            <ul className="s-ph-list" aria-label={title}>
              {rows.map((n) => (
                <Row key={n.path} node={n} onOpen={open} onMenu={menu} />
              ))}
            </ul>
            {files.length > 0 && (
              <section aria-label={t("phFiles")}>
                <h2 className="s-ph-head">
                  {t("phFiles")}
                  <span className="s-ph-head__count">{localeNum(files.length)}</span>
                </h2>
                <ul className="s-ph-list">
                  {files.slice(0, FILES_SHOWN).map((f, i) => (
                    <li key={f.path}>
                      <button type="button" className="s-ph-row" data-path={f.path} onClick={() => setViewer(i)}>
                        <span className="s-ph-row__glyph" aria-hidden="true">
                          <IconImage />
                        </span>
                        <bdi className="s-ph-row__name" dir="auto">
                          {f.name}
                        </bdi>
                      </button>
                    </li>
                  ))}
                </ul>
                {files.length > FILES_SHOWN && <p className="s-ph-foot">{tf("phMoreFiles", { n: localeNum(files.length - FILES_SHOWN) })}</p>}
              </section>
            )}
            <p className="s-ph-foot">{countPhrase(countNotes(node), "notes")}</p>
          </>
        )}
      </div>
      {viewer !== null && files[viewer] && (
        <Suspense fallback={null}>
          <AttachmentViewer items={files} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />
        </Suspense>
      )}
    </div>
  );
}
