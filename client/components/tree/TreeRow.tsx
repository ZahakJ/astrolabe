// One row of the notes tree (and the published list's and the topic
// sections' rows): the open state, the marks, drag and drop, the rename
// field. Moved out of client/components/Sidebar.tsx unchanged.

import { AttachmentGlyph, IconClip, IconDrawing } from "./icons.tsx";
import FolderGlyph from "../FolderGlyph.tsx";
import { countPhrase, localeNum, t, tf, type Lang } from "../../i18n.ts";
import { beginDrag, canDrop, draggedItem, endDrag, itemOf, makeDragGhost, moveTo, parentDir, type MoveItem } from "../../move.ts";
import { PINNED_PARENT, findNode as findTreeNode, inFocus, orderChildren, topLevelOf, type TreeOrderPrefs } from "../../treeOrder.ts";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent } from "react";
import { defaultOpen, expandedMap, parentOf, persistExpanded, persistTopicsCollapsed, topicsCollapsedMap, type TopicSectionData } from "./expansion.ts";
import type { TreeNode } from "../../../shared/types.ts";
import { beginTabDrag, endTabDrag } from "../../dragTab.ts";
import { dragFileCount, dragHasFiles, droppedFiles } from "../../attachments.ts";
import { isDrawingPath, noteLabelOf } from "../../../shared/noteFormat.ts";
import { isTabbablePath } from "../../workspace.ts";
import { trackerOfFolder, useTrackerShelf } from "../../trackerShelf.ts";
import { useStore } from "../../state.ts";

// How many rows of one folder are rendered before a "show more" row takes
// over. A real vault keeps its images in ONE folder — the fixture this was
// measured against holds 1,158 of them, and a vault's biggest note folder here
// holds 715 — and mounting that many rows in a single commit is a visible
// stall on every expand. Chunking costs one extra click on the rare huge
// folder and nothing at all everywhere else.
const CHUNK = 300;

// How long a collapsed folder has to be hovered, mid-drag, before it opens —
// "spring-loaded folders", the thing that makes a deep destination reachable
// without dropping, expanding, and picking the item up again. 600ms is the
// Finder/Obsidian figure: long enough that passing OVER a folder on the way
// somewhere else never opens it, short enough that deliberately resting on one
// does not feel broken.
const SPRING_MS = 600;

/** The items a drag carries: the dragged row alone, or the whole selection
 *  when the row is part of one (a child of a selected folder rides with it). */
let dragGroup: MoveItem[] = [];

// ---------------------------------------------------------------------------
// Tree keyboard model.
//
// The tree is one tab stop, not 1,388 of them: the container holds the focus
// and `aria-activedescendant` names the row the reader is on. That is the
// ARIA tree pattern, and here it is also the only shape that survives the
// perf contract — a roving tabindex would have to re-render rows to move,
// and these rows are memoized precisely so a keystroke doesn't touch all of
// them. Everything below therefore reads the CURRENT tree out of the DOM:
// only expanded folders render children, so "the rows in the container" and
// "the rows the reader can see" are the same list by construction.
// ---------------------------------------------------------------------------

/** aria-activedescendant needs an id, and vault paths contain spaces and
 *  slashes — so the path is encoded, never interpolated raw. */
function rowId(path: string): string {
  return `s-tree-row-${encodeURIComponent(path)}`;
}

/** One row of the flat curated list (visitor sidebar / admin publish filter). */
export const PubRow = memo(function PubRow({
  path,
  title,
  isHome,
  onOpen,
}: {
  path: string;
  title: string;
  isHome: boolean;
  lang: Lang; // memo-buster for the t() tooltip; see TreeRowProps.lang
  onOpen(path: string): void;
}) {
  const isActive = useStore((s) => s.openPath === path);
  return (
    <button
      type="button"
      className={`s-publist__item${isActive ? " s-publist__item--active" : ""}`}
      onClick={() => onOpen(path)}
      title={title}
    >
      {isHome && (
        <span className="s-publist__home" title={t("home")} aria-hidden="true">
          ✦
        </span>
      )}
      <span className="s-publist__title" dir="auto">{title}</span>
    </button>
  );
});

/** One collapsible topic section of the visitor sidebar (serif small-caps
 *  header + count, notes beneath). Collapse persists per section key. */
export const TopicSection = memo(function TopicSection({
  section,
  lang,
  onOpen,
}: {
  section: TopicSectionData;
  lang: Lang; // memo-buster for the t() tooltips; see TreeRowProps.lang
  onOpen(path: string): void;
}) {
  const [open, setOpen] = useState(
    () => !(topicsCollapsedMap.get(section.key) ?? false),
  );

  const toggle = () => {
    const next = !open;
    setOpen(next);
    topicsCollapsedMap.set(section.key, !next);
    persistTopicsCollapsed();
  };

  return (
    <section className="s-topic">
      <button
        type="button"
        className="s-topic__head"
        onClick={toggle}
        aria-expanded={open}
        title={tf(open ? "collapseSection" : "expandSection", { label: section.label })}
      >
        <span
          className={`s-tree__chevron${open ? " s-tree__chevron--open" : ""}`}
          aria-hidden="true"
        >
          ›
        </span>
        <span className="s-topic__label" dir="auto">{section.label}</span>
        <span className="s-topic__count">{localeNum(section.notes.length)}</span>
      </button>
      {open && (
        <div className="s-topic__list" role="group">
          {section.notes.map((note) => (
            <PubRow
              key={note.path}
              path={note.path}
              title={note.title}
              isHome={false}
              lang={lang}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </section>
  );
});

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  /** 0-based position among its siblings, and how many siblings there are —
   *  the flat tree model states both on every row (aria-posinset/setsize). */
  index: number;
  setSize: number;
  renaming: string | null;
  /** Active chrome language. Not read directly — it is a prop purely so a
   *  live language change busts memo() on every row and re-renders the
   *  t() tooltips, without paying for a store subscription per row. */
  lang: Lang;
  /** Whether this session may mutate the vault — what makes a row draggable
   *  and what makes it a drop target. A visitor's tree is a reading surface.
   *  Passed down rather than subscribed to per row: 1.4k store subscriptions
   *  to learn one boolean is not a price worth paying. */
  admin: boolean;
  /** False hides every attachment row (the sidebar footer's filter). */
  showAttachments: boolean;
  /** The rows rendered beside this one, filter applied — what the viewer
   *  walks with ← / →. Stable per parent render (useMemo in TreeChildren), so
   *  it does not bust memo() on rows that did not change. */
  siblings: TreeNode[];
  onOpen(path: string): void;
  onStartRename(path: string): void;
  onCommitRename(node: TreeNode, name: string): void;
  onCancelRename(): void;
  onMenu(e: ReactMouseEvent, node: TreeNode): void;
  onAttachment(node: TreeNode, siblings: TreeNode[]): void;
  /** Turns the filter back on, from the row that says what it is hiding. */
  onShowAttachments(): void;
  /** Files dropped on this row from the desktop: attach them to `dir`. */
  onDropFiles(dir: string, files: File[]): void;
  /** The folder these rows are the children of ("" for the root, or the
   *  pinned list's own sentinel) — what the manual order is keyed by. */
  parent: string;
  order: TreeOrderPrefs;
  /** The focused note or folder, or null: rows outside its branch are gone. */
  focus: string | null;
  selected: ReadonlySet<string>;
  /** Ctrl/Cmd-click: toggle a row in the selection; null clears it. */
  onSelectToggle(path: string | null): void;
  onReorder(parent: string, visible: string[], moved: string[], target: string, before: boolean): void;
}

type TreeChildrenProps = Omit<TreeRowProps, "node" | "siblings" | "index" | "setSize"> & {
  nodes: TreeNode[];
};

/** One level of the tree: the attachment filter, then the chunk cap, then the
 *  rows. Both live here rather than in TreeRow so a folder's children are
 *  filtered ONCE per render and every row of that folder shares one `siblings`
 *  array identity. */
export function TreeChildren({ nodes, ...rest }: TreeChildrenProps) {
  const visible = useMemo(() => {
    const kept = nodes.filter((n) => (rest.showAttachments || !n.attachment) && inFocus(n.path, rest.focus));
    return orderChildren(kept, rest.parent, rest.order);
  }, [nodes, rest.showAttachments, rest.focus, rest.parent, rest.order]);
  const [limit, setLimit] = useState(CHUNK);
  // A folder that shrank (delete, filter flip) must not keep a raised cap.
  const shown = visible.length <= limit ? visible : visible.slice(0, limit);
  const remaining = visible.length - shown.length;
  const hidden = nodes.length - visible.length;

  return (
    <>
      {/* posinset/setsize describe the rows a reader can actually reach, so
          they count `visible` — the filtered list — not `nodes`. A tree that
          announces "3 of 47" while showing three rows is worse than silence. */}
      {shown.map((child, i) => (
        <TreeRow
          key={child.path}
          {...rest}
          node={child}
          siblings={visible}
          index={i}
          setSize={visible.length}
        />
      ))}
      {/* The bug this round answers was a folder that opened onto NOTHING.
          With attachments hidden, an all-attachment folder would do exactly
          that again — so it says what it is holding back, indented where
          those rows would be, and the row itself is the way to see them. */}
      {visible.length === 0 && hidden > 0 && (
        <button
          type="button"
          className="s-tree__hidden"
          style={{ paddingInlineStart: `${rest.depth * 12 + 8}px` }}
          onClick={rest.onShowAttachments}
          title={t("showAttachments")}
        >
          <span className="s-tree__glyph">
            <IconClip />
          </span>
          {tf("attachmentsHidden", { count: countPhrase(hidden, "files") })}
        </button>
      )}
      {remaining > 0 && (
        <button
          type="button"
          className="s-tree__more"
          onClick={() => setLimit((n) => n + CHUNK)}
        >
          {tf("showMoreRows", { count: localeNum(remaining) })}
        </button>
      )}
    </>
  );
}

// Memoized: with stable callbacks from Sidebar, a folder toggle re-renders
// only its own subtree and opening a note re-renders only the two rows whose
// active flag flipped — not all 1.4k rows.
const TreeRow = memo(function TreeRow(props: TreeRowProps) {
  const { node, depth, renaming } = props;
  // Everything a child level needs: this row's own identity drops out, the
  // rest (callbacks, language, the attachment filter) travels down unchanged.
  const { node: _node, siblings: _siblings, ...childProps } = props;
  const isActive = useStore((s) => s.openPath === node.path);
  const isPublished = useStore(
    (s) => node.type === "file" && (s.publishedPaths?.has(node.path) ?? false),
  );
  // The other face, if this row has one. Same memo discipline as the icon
  // above: the selector returns ONE entry, never the table, so a note that
  // gains a twin repaints one row.
  const twin = useStore((s) => (node.type === "file" ? s.twins[node.path] : undefined));
  const isFolder = node.type === "folder";
  // MEMO DISCIPLINE. The selector returns a STRING or undefined, never the map
  // — 1.4k rows subscribing to an object identity would each re-render on
  // every /api/me, and a selector that built `{ icon }` per call would
  // re-render on every store change of any kind. Read here rather than
  // threaded from Sidebar so an icon change repaints one row.
  const folderIcon = useStore((s) => (node.type === "folder" ? s.folderIcons[node.path] : undefined));
  // A folder that a Media tracker names is a book, a show, a course on the
  // shelf: the row says so, and the mark is the door to the tracker.
  const shelf = useTrackerShelf();
  const tracked = node.type === "folder" ? trackerOfFolder(shelf, node.path) : null;
  const attachment = node.attachment;
  const [isOpen, setIsOpen] = useState(
    () => isFolder && (expandedMap.get(node.path) ?? defaultOpen(depth)),
  );
  // Attachments keep their extension — it is half of what the name says —
  // while a note sheds the ".md" it always has.
  const label = isFolder || attachment ? node.name : noteLabelOf(node.name);

  const open = (): void => {
    setIsOpen(true);
    expandedMap.set(node.path, true);
    persistExpanded();
  };

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    expandedMap.set(node.path, next);
    persistExpanded();
  };

  // ── Drag and drop ─────────────────────────────────────────────────────────
  // TWO drags land on this row and they are not the same gesture:
  //
  //   - an in-app drag carrying a tree path (move this note into that folder),
  //     recognised by `draggedItem()` being set;
  //   - an OS drag carrying files from the desktop (attach these here),
  //     recognised by `dragHasFiles`.
  //
  // Each has its own affordance vocabulary — --dropok/--dropbad for the move,
  // --dropping plus a file count for the attach — and the two can never be
  // live at once, because a drag is one or the other from the moment it
  // starts. The in-app drop state lives on the DOM node, not in React state: a
  // drag crosses hundreds of rows, and a `dropTarget` prop would bust memo()
  // on all 1.4k of them every time the pointer moved one row, twelve times a
  // second, to repaint one background. The FILE state is React state because
  // it carries a number the row has to print.
  const rowRef = useRef<HTMLDivElement>(null);
  const springRef = useRef(0);

  // The target folder for dropped files is this row when it IS a folder, and
  // the row's parent when it is a note — dropping onto a note means "beside
  // this note", which is the answer a reader expects and the one the
  // same-folder attachment mode would have given anyway.
  const dropDir = isFolder ? node.path : parentOf(node.path);
  // dragenter/dragleave fire for every child element the pointer crosses, so
  // the state is a DEPTH, not a boolean: a plain flag flickers off the moment
  // the pointer reaches the row's own label.
  const dragDepth = useRef(0);
  const [dropCount, setDropCount] = useState(0);

  const clearDropState = useCallback(() => {
    rowRef.current?.classList.remove("s-tree__item--dropok", "s-tree__item--dropbad");
    if (springRef.current !== 0) {
      window.clearTimeout(springRef.current);
      springRef.current = 0;
    }
  }, []);

  /** An OS file drag entering this row. Counted, not flagged — see dragDepth. */
  const onDragEnterFiles = (e: ReactDragEvent<HTMLDivElement>): void => {
    if (!props.admin || draggedItem() || !dragHasFiles(e.dataTransfer)) return;
    e.stopPropagation();
    dragDepth.current++;
    setDropCount(dragFileCount(e.dataTransfer));
  };

  const clearFileDropState = (): void => {
    dragDepth.current = 0;
    setDropCount(0);
  };

  useEffect(() => clearDropState, [clearDropState]);

  const onDragStart = (e: ReactDragEvent<HTMLDivElement>): void => {
    const item = itemOf(node);
    // Two drags share this row, and they are DIFFERENT permissions. The tree
    // MOVE (drop on a folder) is the admin's and never an attachment's — the
    // move endpoints are note routes. The tab LIFT (drop on a pane) is for
    // anything a pane can host, books included, admin or reader: dropping a
    // note beside another to read them side by side mutates nothing.
    if (props.admin && !node.attachment) beginDrag(item);
    // A row in the selection drags the whole selection with it.
    dragGroup =
      props.selected.has(node.path) && props.selected.size > 1
        ? topLevelOf([...props.selected])
            .map((p) => findTreeNode(useStore.getState().tree, p))
            .filter((n): n is TreeNode => n !== null && !n.attachment)
            .map(itemOf)
        : [item];
    e.dataTransfer.effectAllowed = "move";
    // Firefox refuses to start a drag with an empty payload.
    e.dataTransfer.setData("text/plain", node.path);
    e.dataTransfer.setDragImage(makeDragGhost(item), 14, 14);
    rowRef.current?.classList.add("s-tree__item--dragging");
    // A note or a book lifted off the tree is ALSO a tab drag (the owner:
    // "cannot simply grab a note/book from the filesystem and drop it on one
    // of my split windows"): the panes raise their drop zones, and dropping
    // opens the file there — beside the tree's own drops, which keep meaning
    // "move the file into that folder". `pane: null` is what tells the drop
    // there is no tab to remove anywhere.
    if (!item.isFolder && isTabbablePath(node.path)) {
      beginTabDrag({ pane: null, path: node.path });
    }
  };

  const onDragEnd = (): void => {
    rowRef.current?.classList.remove("s-tree__item--dragging");
    endDrag();
    endTabDrag();
  };

  const onDragOver = (e: ReactDragEvent<HTMLDivElement>): void => {
    const item = draggedItem();
    if (!item) {
      // Files dragged in from the DESKTOP. Without this branch the browser's
      // default takes over on drop and navigates the whole app away to the
      // file — the reader loses their vault to a gesture the tree invites.
      // EVERY row takes them, not only folders: a note row means "beside this
      // note", and refusing there sent the reader hunting for the folder row.
      if (!props.admin || !dragHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      return;
    }
    // Answered here, so it never reaches the tree's own root handler: a pointer
    // resting on a row inside a folder must not light the VAULT ROOT up.
    e.stopPropagation();
    // REORDERING: a sibling dragged over the top or bottom edge of this row
    // is asking to sit before or after it, not inside it. The edge zone is
    // a quarter of the row on a folder (the middle still means "into"), the
    // whole row on a note (a note is not a container).
    const sibling = item.path !== node.path && parentDir(item.path) === props.parent && !(props.parent === PINNED_PARENT && false);
    const pinnedList = props.parent === PINNED_PARENT && props.order.pinned.includes(item.path);
    if ((sibling || pinnedList) && props.admin) {
      const box = rowRef.current?.getBoundingClientRect();
      if (box) {
        const frac = (e.clientY - box.top) / box.height;
        const zone = isFolder ? 0.25 : 0.5;
        const before = frac < zone;
        const after = frac > 1 - zone;
        if (before || after) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          rowRef.current?.classList.toggle("s-tree__item--insert-before", before);
          rowRef.current?.classList.toggle("s-tree__item--insert-after", after);
          rowRef.current?.classList.remove("s-tree__item--dropok", "s-tree__item--dropbad");
          return;
        }
      }
    }
    rowRef.current?.classList.remove("s-tree__item--insert-before", "s-tree__item--insert-after");
    if (!isFolder) {
      // A note is not a container. No colour (every file row flashing red on
      // the way past its folder would be noise), just the browser's own refusal.
      e.dataTransfer.dropEffect = "none";
      return;
    }
    // Spring-loading arms for ANY folder, including one this item cannot land
    // in: resting on the folder you are dragging out of is exactly how you
    // reach the sub-folder you are dragging into.
    if (!isOpen && springRef.current === 0) {
      springRef.current = window.setTimeout(() => {
        springRef.current = 0;
        open();
      }, SPRING_MS);
    }
    const ok = canDrop(item, node.path);
    // preventDefault is what ALLOWS the drop. Withholding it on a refused
    // target is what makes the cursor say no, and it is why an invalid drop
    // cannot fire at all rather than being caught later.
    if (ok) e.preventDefault();
    e.dataTransfer.dropEffect = ok ? "move" : "none";
    rowRef.current?.classList.toggle("s-tree__item--dropok", ok);
    rowRef.current?.classList.toggle("s-tree__item--dropbad", !ok);
  };

  const onDragLeave = (e: ReactDragEvent<HTMLDivElement>): void => {
    if (!draggedItem() && dragHasFiles(e.dataTransfer)) {
      // The file drag counts down instead of testing containment: `dragDepth`
      // is exactly the mechanism that survives the pointer crossing onto the
      // row's own label, which is where a boolean flickers.
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDropCount(0);
      return;
    }
    // dragleave also fires when the pointer crosses onto a CHILD of the row
    // (the label span, the chevron). Cancelling the spring timer there would
    // make the folder never open.
    if (rowRef.current?.contains(e.relatedTarget as Node | null)) return;
    rowRef.current?.classList.remove("s-tree__item--insert-before", "s-tree__item--insert-after");
    clearDropState();
  };

  const onDrop = (e: ReactDragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation(); // the tree's own ground must not also take it
    clearDropState();
    const item = draggedItem();
    endDrag();
    if (!item) {
      // Desktop files. Every accepted type, screened for size and kind before
      // a byte goes on the wire and sniffed for magic bytes at the far end.
      clearFileDropState();
      if (props.admin && dragHasFiles(e.dataTransfer)) {
        props.onDropFiles(dropDir, droppedFiles(e.dataTransfer));
      }
      return;
    }
    const row = rowRef.current;
    const before = row?.classList.contains("s-tree__item--insert-before") ?? false;
    const after = row?.classList.contains("s-tree__item--insert-after") ?? false;
    row?.classList.remove("s-tree__item--insert-before", "s-tree__item--insert-after");
    const group = dragGroup.length ? dragGroup : [item];
    dragGroup = [];
    if (before || after) {
      // The rows of this parent that rode along, in the order they show.
      const key = (i: MoveItem) => (props.parent === PINNED_PARENT ? i.path : i.name);
      const moved = group.filter((i) => (props.parent === PINNED_PARENT ? props.order.pinned.includes(i.path) : parentDir(i.path) === props.parent)).map(key);
      const visible = props.siblings.map((n) => (props.parent === PINNED_PARENT ? n.path : n.name));
      if (moved.length > 0) props.onReorder(props.parent, visible, moved, props.parent === PINNED_PARENT ? node.path : node.name, before);
      return;
    }
    // Dropping onto a COLLAPSED folder works, and does not expand it: the
    // spring is an aid for reaching deeper, never a precondition.
    if (isFolder) {
      void (async () => {
        for (const i of group) if (canDrop(i, node.path)) await moveTo(i, node.path);
      })();
    }
  };

  const classes = [
    "s-tree__item",
    isFolder ? "s-tree__item--folder" : "s-tree__item--file",
    attachment ? "s-tree__item--att" : "",
    isActive ? "s-tree__item--active" : "",
    props.selected.has(node.path) ? "s-tree__item--selected" : "",
    dropCount > 0 ? "s-tree__item--dropping" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="s-tree__node" role="none">
      <div
        ref={rowRef}
        // The id and data-path are what aria-activedescendant and the keyboard
        // model address this row BY — the tree's single tab stop names a row
        // rather than focusing it, so the row has to be nameable.
        id={rowId(node.path)}
        data-tree-path={node.path}
        className={classes}
        style={{ paddingInlineStart: `${depth * 12 + 8}px` }}
        // Draggable for either of the row's two drags (see onDragStart): the
        // admin's tree MOVE, or the tab LIFT that anything pane-hostable gets
        // — which is what makes a BOOK liftable although attachments do not
        // move (the move endpoints are note routes). A row being renamed is
        // not draggable: the field inside it needs its text selectable.
        draggable={
          renaming !== node.path &&
          ((props.admin && !attachment) || (!isFolder && isTabbablePath(node.path)))
        }
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragEnter={onDragEnterFiles}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={(e) => {
          // Ctrl/Cmd-click gathers rows into a selection (Shift has the
          // range meaning elsewhere; here it is left to the browser); a plain
          // click on anything lets the selection go.
          if (props.admin && (e.ctrlKey || e.metaKey) && !attachment) {
            props.onSelectToggle(node.path);
            return;
          }
          if (props.selected.size > 0) props.onSelectToggle(null);
          if (isFolder) toggle();
          else if (attachment) props.onAttachment(node, props.siblings);
          else props.onOpen(node.path);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          // Same rule as the menu: /api/rename is a note route.
          if (!attachment) props.onStartRename(node.path);
        }}
        onContextMenu={(e) => props.onMenu(e, node)}
        role="treeitem"
        // The FLAT tree model (ARIA APG's second shape): every row states its
        // own level and position instead of relying on nested role="group"
        // containers. The nesting here cannot express ownership anyway — the
        // children div is a SIBLING of the row that opens it, because the row
        // is a fixed-height flex line and the subtree is not inside it — and
        // aria-owns is the weaker-supported of the two escapes.
        aria-level={depth + 1}
        aria-posinset={props.index + 1}
        aria-setsize={props.setSize}
        aria-selected={isActive}
        aria-expanded={isFolder ? isOpen : undefined}
        // Attachment names are long and the pane is narrow ("Pasted image
        // 20230906180811-10.png" is 38 characters); the tooltip is the only
        // place the whole one fits. Note rows keep their bare label.
        title={attachment ? node.name : undefined}
      >
        {isFolder && (
          <span
            className={`s-tree__chevron${isOpen ? " s-tree__chevron--open" : ""}`}
            aria-hidden="true"
          >
            ›
          </span>
        )}
        {/* The folder's own mark, in the attachment glyph's slot and at its
            size: chevron, glyph, name. A folder without one is not padded to
            match — the glyph sits in the row's flex flow, so unmarked folders
            keep the alignment they have always had and marked ones step in by
            one slot. That is the same mixed-row look the attachment rows
            already have under their notes, and it is what makes the mark read
            as a mark rather than as a column. */}
        {isFolder && folderIcon && (
          <span className="s-tree__glyph">
            <FolderGlyph icon={folderIcon} />
          </span>
        )}
        {attachment && <AttachmentGlyph kind={attachment.kind} />}
        {/* A drawing is a note row with a pencil: it opens in the canvas,
            and a reader scanning the tree should know that before the click. */}
        {!isFolder && !attachment && isDrawingPath(node.path) && (
          <span className="s-tree__glyph">
            <IconDrawing />
          </span>
        )}
        {renaming === node.path ? (
          <RenameInput
            initial={node.name}
            // A FILE wears an extension and a folder does not: "Notes v1.8"
            // must not be pre-selected down to "Notes v1".
            hasExt={node.type === "file"}
            onCommit={(name) => props.onCommitRename(node, name)}
            onCancel={props.onCancelRename}
          />
        ) : (
          <span className="s-tree__label" dir="auto">
            {label}
            {/* A bare aria-label on a <span> is not reliably exposed — the
                star needs a role before it counts as a labelled thing. */}
            {isPublished && (
              <span className="s-pubstar" role="img" title={t("published")} aria-label={t("published")}>
                ✦
              </span>
            )}
            {/* THE TREE HIDES NOTHING. Both faces of a twinned pair stay in
                the tree as the two files they are — this mark only says that
                a row HAS another face, and names it on hover. A tree that
                folded one of the two away would be the first place the
                vault stopped matching the folder on disk. */}
            {twin !== undefined && (
              <span
                className="s-tree__twin"
                role="img"
                title={tf("twinTreeTitle", { title: twin.twinTitle })}
                aria-label={tf("twinTreeTitle", { title: twin.twinTitle })}
              >
                ⇄
              </span>
            )}
          </span>
        )}
        {/* The glyph covers the five kinds; the badge names the exact type for
            the one that has no glyph of its own. */}
        {attachment?.kind === "other" && attachment.ext && (
          <span className="s-tree__ext">{attachment.ext}</span>
        )}
        {tracked && (
          <button
            type="button"
            className="s-tree__tracked"
            title={tf("treeTrackedAs", { title: tracked.title })}
            aria-label={tf("treeTrackedAs", { title: tracked.title })}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              const store = useStore.getState();
              store.openNote(tracked.path);
              store.setView("editor");
            }}
          >
            <FolderGlyph icon={tracked.icon} size={12} />
          </button>
        )}
        {/* How many files are about to land here — chrome, so it sits
            OUTSIDE the label's isolate and keeps the row's own direction. */}
        {dropCount > 0 && (
          <span className="s-drop-count">{countPhrase(dropCount, "files")}</span>
        )}
      </div>
      {isFolder && isOpen && (
        // role="none" and not "group": in the FLAT tree model the level and
        // position come off each row (aria-level/posinset/setsize), and a real
        // group here would describe an ownership this markup does not have —
        // the children div is a SIBLING of the row that opens it.
        <div className="s-tree__children" role="none">
          <TreeChildren {...childProps} parent={node.path} nodes={node.children ?? []} depth={depth + 1} />
        </div>
      )}
    </div>
  );
});

function RenameInput({
  initial,
  hasExt = false,
  onCommit,
  onCancel,
}: {
  initial: string;
  hasExt?: boolean;
  onCommit(name: string): void;
  onCancel(): void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    // The STEM, not the whole filename (v1.8 audit, F10). Renaming pre-selected
    // "Ledger.md" whole, so the first keystroke ate the extension and the note
    // was saved back as a `.md` by `ensureMd` whatever it had been — a `.tex`
    // note renamed by hand quietly changed format. The dialog prompt has
    // selected only the stem since it shipped (client/components/Confirm.tsx);
    // the inline rename is the same gesture and now answers the same way.
    const dot = hasExt ? initial.lastIndexOf(".") : -1;
    ref.current?.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial, hasExt]);

  const finish = (commit: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (commit) onCommit(value);
    else onCancel();
  };

  return (
    <input
      ref={ref}
      className="s-tree__rename"
      value={value}
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(true);
        else if (e.key === "Escape") finish(false);
      }}
    />
  );
}
