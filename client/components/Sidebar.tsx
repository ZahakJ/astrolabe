import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import SiteMark from "./SiteMark.tsx";
import { lazySurface } from "../lazySurface.tsx";
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from "react";
import type { SearchHit, SearchMatch, TagCount, TreeNode } from "../../shared/types.ts";
import { dailyNotesByDay, usePeriodic } from "../daily.ts";
import { getTags, patchSettings, publishNote, search, searchMatches, seedStatus, seedVault } from "../api.ts";
import { dragFileCount, dragHasFiles, droppedFiles, uploadDroppedFiles } from "../attachments.ts";
import { useBannerSrc } from "./BannerImg.tsx";
import { collectNotes, resolveLink, type NoteRef } from "../editor/links.ts";
import { useVaultGraph } from "../graphCache.ts";
import { countPhrase, localeNum, t, tf } from "../i18n.ts";
// client/landing.ts (landOnLine, installNotePreviews) is reached by DYNAMIC
// import below: this chunk is inside the admin-first-paint budget that
// check-bundle measures, and a landing/hover module is interaction-time code.
// The reading view imports the same module statically, so there is exactly one
// instance either way.
// Tag chips print the vault's own display label when one exists (a tag page's
// `labels:` map, or settings.tagLabels); `data`/keys/searches stay canonical.
import { useTagLabels } from "../tagLabels.ts";
import BookmarksRows from "./BookmarksRows.tsx";
// Rename/merge a tag across the whole vault — the pill's one verb.
import { promptTagRename } from "../tagRename.ts";
import { autoScroll, canDrop, draggedItem, endDrag, itemOf, renameTo, moveTo, stopAutoScroll, type MoveItem } from "../move.ts";
import { promptNewDrawing, promptNewFolder, promptNewNote } from "../prompts.ts";
import { openExportDialog } from "../export/door.ts";
import { newNoteFromTemplateCommand } from "../templateActions.ts";
import { useStore } from "../state.ts";
import AttachmentViewer, { isViewable } from "./AttachmentViewer.tsx";
// The reader's door only — a tiny module whose heavy half (the shelf, the page
// renderer, pdf.js) is behind a dynamic import. See client/books/door.ts.
import { openBookPage, openBookPath } from "../books/door.ts";
import { confirmModal } from "./Confirm.tsx";
import { ContextMenu, type MenuAnchor, type MenuRow } from "./ContextMenu.tsx";
import { moveViaPicker, pickMoveTarget } from "./MovePicker.tsx";
import { confirmDeleteAttachment, confirmDeleteFolder, confirmDeleteNote } from "./deleteFlow.ts";
import { renderSnippet, snippetIsEmpty } from "./snippet.tsx";
// Per-folder glyphs. The MARK is static — it paints on the tree's first frame,
// so it has to be in this chunk. The PICKER is not: it opens from a context
// menu, which is interaction time, and a lazy() boundary is what keeps its
// twenty labels and its popover out of the admin first paint that
// check-bundle measures (the same argument client/landing.ts makes above).
import BrandMark from "./BrandMark.tsx";
import type { IconPickState } from "./FolderIconPicker.tsx";
import type { LibraryPopState } from "./LibraryFolderPopover.tsx";
import type { CollectionsPopState } from "./CollectionsPopover.tsx";
import { PINNED_PARENT, findNode as findTreeNode, readTreeOrder, reorder, togglePinned, topLevelOf, writeTreeOrder, type TreeOrderPrefs, type TreeSort } from "../treeOrder.ts";
import type { FolderMark } from "../../shared/folderIcons.ts";
import { toast } from "../toast.ts";
import "../styles/move.css";
import { ensureMd } from "../../shared/noteFormat.ts";
import { IconClip, IconCollapseAll, IconDrawing, IconNewFolder, IconNewNote } from "./tree/icons.tsx";
import { useTreeCursor, type MenuState } from "./tree/useTreeCursor.ts";
import { PubRow, TopicSection, TreeChildren } from "./tree/TreeRow.tsx";
import { TREE_ALL_EVENT, buildTopics, countAttachments, countNotes, setFoldersUnder } from "./tree/expansion.ts";
import { TagShelf, useTagShelf, type TagMenuState } from "./TagShelf.tsx";
export { TREE_ALL_EVENT, TREE_REVEAL_EVENT } from "./tree/expansion.ts";

const SEARCH_DEBOUNCE_MS = 200;

// The tree's attachment rows are a FILTER, not a fact of the vault: this
// remembers whether the reader wants them. Default on — the whole point is
// that files nobody could see were assumed lost.
const SHOW_ATTACHMENTS_KEY = "astrolabe.show-attachments";

function loadShowAttachments(): boolean {
  try {
    return localStorage.getItem(SHOW_ATTACHMENTS_KEY) !== "false";
  } catch {
    return true;
  }
}

// Mount-gated on `iconPick`, with its own <Suspense> — the App.tsx rule: a
// boundary tears down everything under it, and this one wraps nothing but the
// popover, so the tree behind it never blinks while the chunk lands.
const FolderIconPicker = lazySurface(() => import("./FolderIconPicker.tsx"));
const LibraryFolderPopover = lazySurface(() => import("./LibraryFolderPopover.tsx"));
const CollectionsPopover = lazySurface(() => import("./CollectionsPopover.tsx"));

// The two v1.8 search surfaces, mount-gated for the same reason and split for
// one more: the replace panel carries the dry-run list, its own stylesheet and
// the confirm dialog, and it is opened by a fraction of sessions. Neither
// belongs in a chunk the sidebar downloads to draw a tree.
const ReplacePanel = lazySurface(() => import("./ReplacePanel.tsx"));
const SearchHelp = lazySurface(() => import("./SearchHelp.tsx"));
// The box's second mode, "meaning" (docs/ask.md): results ranked by the
// embedding index rather than by the words. Its own chunk — an admin who never
// flips the switch never downloads it.
const SemanticResults = lazySurface(() => import("./SemanticResults.tsx"));
const MEANING_KEY = "astrolabe.search-meaning";

export default function Sidebar() {
  const tree = useStore((s) => s.tree);
  const openNote = useStore((s) => s.openNote);
  const admin = useStore((s) => s.admin);
  const homeNote = useStore((s) => s.homeNote);
  const siteName = useStore((s) => s.siteName);
  // Re-renders the chrome strings on a live language change; also threaded
  // into the memoized rows below so their tooltips follow.
  const lang = useStore((s) => s.language);
  const logo = useStore((s) => s.logo);
  // The logo is an admin-typed image reference, so it climbs the same
  // resolution ladder a note's `banner:` does (client/banner.ts): a bare
  // "mark.svg" finds brand/mark.svg. Unresolvable falls back to the wordmark
  // — the identity the sidebar has always had — never to a broken <img>.
  const logoSrc = useBannerSrc(logo).src;
  const publishedFilter = useStore((s) => s.publishedFilter);
  const publishedPaths = useStore((s) => s.publishedPaths);

  const [query, setQuery] = useState("");
  /** Search by MEANING instead of by the words (admin; remembered on this
   *  device only — it is a way of using the box, not a setting). */
  const [meaning, setMeaningState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MEANING_KEY) === "on";
    } catch {
      return false;
    }
  });
  const setMeaning = (on: boolean): void => {
    setMeaningState(on);
    try {
      if (on) localStorage.setItem(MEANING_KEY, "on");
      else localStorage.removeItem(MEANING_KEY);
    } catch {
      // storage unavailable
    }
  };
  // ESCAPE CLEARS THE FILTER FROM ANYWHERE IN THE SIDEBAR. A tag pill fills
  // the search with `#tag`, and the way out used to be clicking into the
  // field, selecting the text and deleting it (the owner: "shouldn't need to
  // manually highlight the search and delete it"). Bubble phase, after the
  // shell's own Escape (capture) has had its say: anything that claimed the
  // key prevented its default, and the editor keeps Escape for itself.
  useEffect(() => {
    if (!query) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const target = e.target instanceof Element ? e.target : null;
      const inSidebar = target !== null && target.closest(".s-sidebar") !== null;
      const onBody = target === null || target === document.body || target === document.documentElement;
      if (!inSidebar && !onBody) return;
      if (target?.closest("input, textarea, [contenteditable]")) return; // the field's own handler
      setQuery("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [query]);
  /** Replace mode (admin only). It takes over the results region rather than
   *  stacking under it — a dry run squeezed between a tree and a tag cloud is
   *  a dry run nobody reads, and reading it is the whole feature. */
  const [replacing, setReplacing] = useState(false);
  // Ctrl/Cmd+Shift+F (App.tsx): open the vault's search & replace here, with
  // the pane shown and the Find field ready.
  useEffect(() => {
    const onOpen = (): void => {
      const st = useStore.getState();
      if (st.sidebarCollapsed) st.setSidebarCollapsed(false);
      setReplacing(true);
      setHelpOpen(false);
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>(".s-replace__input")?.focus());
    };
    window.addEventListener("astrolabe:replace-open", onOpen);
    return () => window.removeEventListener("astrolabe:replace-open", onOpen);
  }, []);
  /** The operator card. Open one at a time with replace mode: both hang off
   *  the same field, and two popovers over one input is a shell arguing with
   *  itself. */
  const [helpOpen, setHelpOpen] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  /** Hit rows expanded to their per-line matches (chevron). Query-scoped:
   *  both reset with the results they annotate. */
  const [expandedHits, setExpandedHits] = useState<Set<string>>(() => new Set());
  /** Match lines per expanded path — "loading" while the fetch is out,
   *  "error" is rendered as the honest empty state rather than a toast (the
   *  whole-note click beside it still works). */
  const [hitMatches, setHitMatches] = useState<Map<string, SearchMatch[] | "loading" | "error">>(
    () => new Map(),
  );
  /** What the matches on screen were fetched FOR — a late response for an
   *  abandoned query must die here, not repopulate the new query's rows. */
  const matchQueryRef = useRef("");
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const [tags, setTags] = useState<TagCount[]>([]);
  // Only a session with a tree has days to mark, and only an admin has the
  // route; a visitor's grid still dots the published daily notes.
  // A VISITOR gets the month only when there is a day in it to open: the
  // grid's one act is opening the day's note, and a published vault with no
  // daily note published would hand every click a "sign in" toast. Cheap —
  // one string compare per note, and only re-read when the tree moves.
  const periodic = usePeriodic();
  const hasDailyNotes = useMemo(() => (tree === null ? false : dailyNotesByDay(tree).size > 0), [tree, periodic]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [tagMenu, setTagMenu] = useState<TagMenuState | null>(null);
  /** The open folder-icon popover (feature A). Null = closed. */
  const [iconPick, setIconPick] = useState<IconPickState | null>(null);
  const [libPop, setLibPop] = useState<LibraryPopState | null>(null);
  const [colPop, setColPop] = useState<CollectionsPopState | null>(null);
  // THE READER'S ARRANGEMENT of the tree (client/treeOrder.ts): sort, manual
  // order, pinned scratch area — per browser. Focus and the selection are
  // session state: a focus survives no reload on purpose.
  const [treePrefs, setTreePrefsState] = useState<TreeOrderPrefs>(readTreeOrder);
  const setTreePrefs = useCallback((next: TreeOrderPrefs | ((p: TreeOrderPrefs) => TreeOrderPrefs)) => {
    setTreePrefsState((p) => {
      const n = typeof next === "function" ? next(p) : next;
      writeTreeOrder(n);
      return n;
    });
  }, []);
  const [focus, setFocus] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  /** The sort menu's anchor, or null when it is closed — the same shape the
   *  tree's own menu uses, because both are ContextMenu now. */
  const [sortAt, setSortAt] = useState<MenuAnchor | null>(null);
  const onSelectToggle = useCallback((path: string | null) => {
    setSelected((prev) => {
      if (path === null) return prev.size === 0 ? prev : new Set();
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);
  const onReorder = useCallback(
    (parent: string, visible: string[], moved: string[], target: string, before: boolean) => {
      setTreePrefs((p) => reorder(p, parent, visible, moved, target, before));
    },
    [setTreePrefs],
  );
  /** PUBLISH EVERY NOTE UNDER A FOLDER.
   *
   *  One `publish: true` per note, through the same route the status bar's
   *  star uses — never a bulk endpoint of its own, so a folder publish and a
   *  single publish cannot drift apart in what they write or in what they
   *  refuse. Notes already published are skipped rather than rewritten, which
   *  is what lets the confirm dialog name a truthful number.
   *
   *  It asks first, and the dialog says the consequence out loud: this is the
   *  one tree action whose effect is visible to strangers. */
  const publishFolder = useCallback(async (node: TreeNode): Promise<void> => {
    const paths: string[] = [];
    const walk = (n: TreeNode): void => {
      if (n.type === "file" && !n.attachment && n.path.endsWith(".md")) paths.push(n.path);
      for (const child of n.children ?? []) walk(child);
    };
    walk(node);
    if (paths.length === 0) {
      toast(t("folderPublishEmpty"));
      return;
    }
    const published = useStore.getState().publishedPaths;
    const todo = published === null ? paths : paths.filter((p) => !published.has(p));
    if (todo.length === 0) {
      toast(t("folderPublishNone"));
      return;
    }
    const ok = await confirmModal({
      title: tf("folderPublishTitle", { count: countPhrase(todo.length, "notes") }),
      body: tf("folderPublishBody", { folder: node.name }),
      confirmLabel: t("folderPublishConfirm"),
    });
    if (!ok) return;
    let done = 0;
    let failed = 0;
    for (const path of todo) {
      try {
        await publishNote(path, true);
        done++;
      } catch (err) {
        failed++;
        console.error(`astrolabe: could not publish ${path}:`, err);
      }
    }
    await useStore.getState().loadPublished();
    if (done > 0) toast(tf("folderPublishDone", { count: countPhrase(done, "notes") }));
    if (failed > 0) toast(tf("folderPublishFailed", { count: countPhrase(failed, "notes") }), "error");
  }, []);

  const selectedItems = useCallback((): MoveItem[] => {
    const tree = useStore.getState().tree;
    return topLevelOf([...selected])
      .map((path) => findTreeNode(tree, path))
      .filter((n): n is TreeNode => n !== null)
      .map(itemOf);
  }, [selected]);
  // Under settings.topics "folders" the folders are the categories and there
  // is nothing to curate by hand: the two collection verbs leave the menu.
  const collectionsByHand = useStore((s) => s.topicsMode !== "folders");
  const [showAttachments, setShowAttachments] = useState(loadShowAttachments);
  // The open lightbox: the viewable attachments of ONE folder plus the
  // position inside it, so ← / → walk that folder and nothing else.
  const [viewer, setViewer] = useState<{ items: TreeNode[]; index: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  /** SEARCH BY KEYBOARD ALONE: type, arrow down the hits, Enter to open.
   *
   *  Roving FOCUS rather than the palette's `aria-activedescendant`, and the
   *  difference is the markup: a palette row is a `role="option"` div, while a
   *  hit is a real <button> sitting beside a second button (the chevron). Move
   *  focus and Enter, Space, the browser's own scrolling and every screen
   *  reader's announcement come for free — and nothing has to pretend a
   *  button is an option, which is the nested-interactive trap the chevron was
   *  split out to avoid in the first place. */
  const hitButtons = (): HTMLButtonElement[] =>
    [...(resultsRef.current?.querySelectorAll<HTMLButtonElement>(".s-search-hit") ?? [])];

  const focusHit = (index: number): void => {
    const buttons = hitButtons();
    if (buttons.length === 0) return;
    // Wrap at both ends: a list you can walk off is a list you have to look at.
    buttons[((index % buttons.length) + buttons.length) % buttons.length].focus();
  };

  /** Arrows walk the hits; Escape and walking up off the top return to the
   *  field, so the reader never has to reach for the mouse to type again. */
  const onResultsKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Escape") return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const buttons = hitButtons();
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      searchRef.current?.focus();
      return;
    }
    if (at === -1) return; // focus is on a chevron or a match row: leave it alone
    e.preventDefault();
    if (e.key === "ArrowUp" && at === 0) searchRef.current?.focus();
    else focusHit(at + (e.key === "ArrowDown" ? 1 : -1));
  };
  // The tree's own scroller — the auto-scroll target during a drag, and the
  // element that wears the vault-root drop ring. NOT the same element as
  // `treeRef` below: that one is the inner `role="tree"` div, which is the
  // single tab stop and carries aria-activedescendant. The scroller is the
  // <nav> around it, because scrolling and dropping are the outer element's
  // job and focus is the inner one's.
  const treeScrollRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  // The vault ROOT is the one folder with no row of its own, and "put this back
  // at the top level" has to be a gesture. Two surfaces stand in for it, both
  // wired here so they cannot drift apart:
  //   - the tree's own empty space under the last row, which is the obvious
  //     place to reach for — and is exactly what a 1,375-note vault does not
  //     have, since the rows fill the pane;
  //   - the sidebar HEADER, which carries the vault's name, is on screen at
  //     every scroll position, and never moves. That one is the answer for a
  //     full tree.
  // A sticky "vault root" row inside the tree was the other candidate and was
  // rejected: appearing at dragstart it pushes every row down 26px under a
  // pointer that has already picked something up.
  // Dropping OS files anywhere on the tree attaches them to the vault: onto a
  // folder row for that folder, onto the tree's own ground for the root. The
  // attachment-location setting has the last word on where they actually land
  // (the toast names it), and every type /api/upload accepts is welcome —
  // anything else is refused before a byte goes on the wire.
  const onDropFiles = useCallback((dir: string, files: File[]) => {
    if (!useStore.getState().admin) return;
    void uploadDroppedFiles(files, dir);
  }, []);

  //
  // ONE set of handlers for BOTH drags that can land on the vault root: an
  // in-app move (a tree path, `draggedItem()` set) and files from the desktop.
  // They compose here rather than as two spreads on the same element, because
  // two objects each carrying `onDragOver` would silently mean "the second
  // one" — the first would be dropped by the spread and its affordance would
  // simply stop appearing. Which drag is in flight is decided once, at the
  // top of each handler, and the two never overlap.
  const rootDropProps = useCallback((ref: { current: HTMLElement | null }, cls: string) => ({
    onDragEnter: (e: ReactDragEvent) => {
      if (!admin || draggedItem() || !dragHasFiles(e.dataTransfer)) return;
      setRootDrag(dragFileCount(e.dataTransfer));
    },
    onDragOver: (e: ReactDragEvent) => {
      const item = draggedItem();
      if (!item) {
        if (!admin || !dragHasFiles(e.dataTransfer)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        return;
      }
      const ok = canDrop(item, "");
      // preventDefault is what allows the drop; withholding it is the refusal.
      if (ok) e.preventDefault();
      e.dataTransfer.dropEffect = ok ? "move" : "none";
      ref.current?.classList.toggle(cls, ok);
    },
    onDragLeave: (e: ReactDragEvent) => {
      if (!draggedItem() && dragHasFiles(e.dataTransfer)) {
        if (e.currentTarget === e.target) setRootDrag(0);
        return;
      }
      if (ref.current?.contains(e.relatedTarget as Node | null)) return;
      ref.current?.classList.remove(cls);
    },
    onDrop: (e: ReactDragEvent) => {
      e.preventDefault();
      ref.current?.classList.remove(cls);
      const item = draggedItem();
      endDrag();
      if (!item) {
        setRootDrag(0);
        // "" is the vault root as CONTEXT — the attachment-location setting
        // still has the last word on where the files actually land.
        if (admin && dragHasFiles(e.dataTransfer)) onDropFiles("", droppedFiles(e.dataTransfer));
        return;
      }
      if (canDrop(item, "")) void moveTo(item, "");
    },
  }), [admin, onDropFiles]);
  // Set when a reveal had to happen first; the effect below focuses once the
  // pane is actually on screen (see revealSidebar).
  const focusWhenShown = useRef(false);
  const zen = useStore((s) => s.zen);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);

  /** Bring the sidebar back before anything tries to use it. A collapsed pane
   *  (and zen) is `visibility: hidden` until React commits the class removal,
   *  and a hidden field CANNOT take focus — calling focus() in the same tick
   *  silently does nothing and the reader's next keystrokes go to the page.
   *  So when a reveal was needed, the focus waits for the commit. */
  const revealSidebar = (): boolean => {
    const store = useStore.getState();
    const hidden = store.zen || store.sidebarCollapsed;
    if (store.zen) store.setZen(false);
    if (store.sidebarCollapsed) store.setSidebarCollapsed(false);
    return hidden;
  };

  const focusSearch = (): void => {
    searchRef.current?.focus();
    searchRef.current?.select();
  };

  useEffect(() => {
    if (!focusWhenShown.current || zen || sidebarCollapsed) return;
    focusWhenShown.current = false;
    focusSearch();
  }, [zen, sidebarCollapsed]);

  // Ctrl/Cmd+K (App dispatches "astrolabe:quicksearch"): focus the search box.
  // If the chrome is out of the way, bring it back first — focusing a search
  // field the reader cannot see would swallow every keystroke that follows.
  useEffect(() => {
    const onQuickSearch = () => {
      if (revealSidebar()) focusWhenShown.current = true;
      else focusSearch();
    };
    window.addEventListener("astrolabe:quicksearch", onQuickSearch);
    return () => window.removeEventListener("astrolabe:quicksearch", onQuickSearch);
  }, []);

  // The palette's "Search by meaning…": the same reveal, in the other mode.
  useEffect(() => {
    const onMeaning = () => {
      setMeaning(true);
      if (revealSidebar()) focusWhenShown.current = true;
      else focusSearch();
    };
    window.addEventListener("astrolabe:search-meaning", onMeaning);
    return () => window.removeEventListener("astrolabe:search-meaning", onMeaning);
  }, []);
  // Not while previewing as a visitor: a visitor's box searches the words.
  const previewing = useStore((s) => s.previewVisitor);
  const meaningOn = admin && meaning && !previewing;

  /** Chevron: fold or unfold one hit's match lines, fetching them once per
   *  query. The list can be empty for a real hit — fuzzy/title/alias matches
   *  have no line that SAYS the words — and the row states that instead of
   *  pretending (see searchMatches in server/indexer.ts). */
  const toggleHitMatches = useCallback((path: string) => {
    setExpandedHits((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    const q = matchQueryRef.current;
    if (!q) return;
    setHitMatches((prev) => {
      if (prev.has(path)) return prev; // fetched (or in flight) for this query
      searchMatches(path, q)
        .then((list) => {
          if (matchQueryRef.current !== q) return; // the reader typed on
          setHitMatches((cur) => new Map(cur).set(path, list));
        })
        .catch((err: unknown) => {
          console.error("astrolabe: loading search matches failed", err);
          if (matchQueryRef.current !== q) return;
          setHitMatches((cur) => new Map(cur).set(path, "error"));
        });
      return new Map(prev).set(path, "loading");
    });
  }, []);

  // Hover previews over the hit rows — the blog shell's engine with the admin
  // wiring (client/landing.ts). Installed on the results region, which mounts
  // and unmounts with the query; re-installed on a language flip because a
  // rendered card carries t() chrome.
  const hasResults = hits !== null;
  useEffect(() => {
    if (!hasResults) return;
    let dispose: (() => void) | null = null;
    let dead = false;
    void import("../landing.ts").then((m) => {
      if (dead || !resultsRef.current) return;
      dispose = m.installNotePreviews(resultsRef.current, resultsRef.current);
    });
    return () => {
      dead = true;
      dispose?.();
    };
  }, [hasResults, lang]);

  // Debounced search.
  useEffect(() => {
    const q = query.trim();
    // Expansions and their fetched lines belong to the query that earned
    // them; a new query starts folded.
    matchQueryRef.current = q;
    setExpandedHits(new Set());
    setHitMatches(new Map());
    // In meaning mode the words are not searched at all: SemanticResults
    // asks the embedding index instead.
    if (!q || meaningOn) {
      setHits(null);
      return;
    }
    const timer = window.setTimeout(() => {
      search(q).then(setHits).catch((err: unknown) => {
        console.error("astrolabe: search failed", err);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, meaningOn]);

  // Editor wiring: clicking a #tag pill in the editor (inline or in the
  // frontmatter properties card) pushes a search query here.
  useEffect(() => {
    const onSearch = (ev: Event) => {
      const detail = (ev as CustomEvent<string>).detail;
      if (typeof detail !== "string") return;
      // Clicking a #tag in the editor asks for RESULTS; show the pane holding
      // them (same reasoning as the quick-search reveal above).
      revealSidebar();
      setQuery(detail);
    };
    window.addEventListener("astrolabe:search", onSearch);
    return () => window.removeEventListener("astrolabe:search", onSearch);
  }, []);

  // Tags track the tree: refetch whenever the vault changes shape/content.
  useEffect(() => {
    getTags().then(setTags).catch((err: unknown) => {
      console.error("astrolabe: loading tags failed", err);
    });
  }, [tree]);

  // Visitor topic sections need per-note tags; /api/graph carries them (and
  // is publish-scoped for visitors). It comes from the shared cache, which is
  // what keeps SSE freshness without refetching the whole vault graph once
  // per changed file (client/graphCache.ts).
  const visitorGraph = useVaultGraph(!admin);
  const noteTags = useMemo<Map<string, string[]> | null>(
    () =>
      visitorGraph
        ? new Map(visitorGraph.nodes.map((n) => [n.id, n.tags] as [string, string[]]))
        : null,
    [visitorGraph],
  );

  // Pick (or clear) a folder's glyph. The map is REPLACED whole, which is what
  // makes "no icon" possible at all — a merging PATCH could add a key but
  // never remove one, so the cleared folder's mark would come back on the next
  // read. The store is updated from the server's own answer rather than
  // optimistically: this is one small PATCH on an explicit click, and a row
  // that shows a glyph the disk does not have is the worse failure.
  const chooseFolderIcon = useCallback((path: string, icon: FolderMark | null) => {
    setIconPick(null);
    const next: Record<string, FolderMark> = { ...useStore.getState().folderIcons };
    if (icon === null) delete next[path];
    else next[path] = icon;
    void (async () => {
      try {
        const saved = await patchSettings({ folderIcons: next });
        useStore.getState().setFolderIcons(saved.effective.folderIcons);
      } catch {
        toast(t("folderIconFailed"), "error");
      }
    })();
  }, []);

  const commitRename = useCallback((node: TreeNode, rawName: string) => {
    setRenaming(null);
    const name = rawName.trim();
    if (!name || name === node.name || name.includes("/")) return;
    // ONE path for both kinds. `renameTo` dispatches a folder to
    // /api/folder/move and a note to /api/rename, which is the difference that
    // kept folders unrenameable — and both now get the collision message, the
    // remap-before-reload ordering and the undo toast that the drag has had all
    // along. `ensureMd` still puts the extension back on a note: a reader
    // typing a new title should not have to remember it.
    void renameTo(itemOf(node), node.type === "file" ? ensureMd(name) : name);
  }, []);

  const cancelRename = useCallback(() => setRenaming(null), []);

  // Every delete dialog in the product now lives in ONE module
  // (components/deleteFlow.ts) and every surface calls it. Two surfaces
  // building the same dialog is how the palette ended up saying
  // "irreversible" over an action this menu promised was recoverable — and
  // how the folder dialog could count markdown while the folder held four
  // images. The flow asks /api/delete-preview first: the counts and the
  // "…still embedded by ‘essay’" line come from the server's own walk of the
  // files the delete will actually move, not from this component's tree.

  // How many desktop files are hovering the tree's own ground (the vault
  // root). Separate from the rows' own count so a row's highlight never leaves
  // the whole pane lit; `rootDropProps` above sets it.
  const [rootDrag, setRootDrag] = useState(0);

  const pinnedNodes = useMemo(
    () => treePrefs.pinned.map((p) => findTreeNode(tree, p)).filter((n): n is TreeNode => n !== null),
    [tree, treePrefs.pinned],
  );

  const openMenu = useCallback((e: ReactMouseEvent, node: TreeNode) => {
    if (!useStore.getState().admin) return; // menu holds only mutating actions
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const startRename = useCallback((path: string) => {
    if (!useStore.getState().admin) return;
    setRenaming(path);
  }, []);

  const { treeRef, cursor, setCursor, treeEpoch, setTreeEpoch, moveCursor, initialCursor, onTreeKeyDown } =
    useTreeCursor({ tree, treeScrollRef, startRename, setMenu });

  const shelf = useTagShelf({ tags, query, lang, setTagMenu });

  const noteCount = useMemo(() => countNotes(tree), [tree]);
  const attachmentCount = useMemo(() => countAttachments(tree), [tree]);

  const setAttachmentsShown = useCallback((next: boolean) => {
    setShowAttachments(next);
    try {
      localStorage.setItem(SHOW_ATTACHMENTS_KEY, String(next));
    } catch {
      // storage unavailable — the filter still works for this session
    }
  }, []);

  // Identity changes with the flag — which costs nothing: every row re-renders
  // on a toggle anyway, since the filter itself is one of their props.
  const toggleAttachments = useCallback(
    () => setAttachmentsShown(!showAttachments),
    [setAttachmentsShown, showAttachments],
  );

  const showAllAttachments = useCallback(
    () => setAttachmentsShown(true),
    [setAttachmentsShown],
  );

  /** A click on an attachment row. A PDF or an EPUB is a BOOK: it opens in the
   *  reader (client/books/, client/epub/), which remembers the place, gives it
   *  a keyboard and puts it on a shelf with the vault's other books. A PDF
   *  used to open a browser tab, which renders one perfectly well and cannot
   *  do any of those three things; an EPUB opened a DOWNLOAD, which is the
   *  same failure one step further along. Everything else opens in the viewer,
   *  carrying its folder with it so the arrow keys have somewhere to go. */
  const openAttachment = useCallback((node: TreeNode, siblings: TreeNode[]) => {
    if (node.attachment?.kind === "book") {
      openBookPath(node.path);
      return;
    }
    const items = siblings.filter(isViewable);
    const index = Math.max(0, items.findIndex((n) => n.path === node.path));
    if (items.length > 0) setViewer({ items, index });
  }, []);

  // The tree is replaced wholesale on every vault event; a viewer left open on
  // a file that has since been deleted would keep showing a stale frame.
  useEffect(() => {
    setViewer((cur) => {
      if (!cur) return cur;
      const live = new Set<string>();
      const walk = (node: TreeNode): void => {
        if (node.type === "file") live.add(node.path);
        for (const child of node.children ?? []) walk(child);
      };
      if (tree) walk(tree);
      const items = cur.items.filter((n) => live.has(n.path));
      if (items.length === 0) return null;
      const at = cur.items[cur.index];
      const index = Math.max(0, items.findIndex((n) => n.path === at?.path));
      return { items, index };
    });
  }, [tree]);

  // Visitor collection: flat, alphabetical (collectNotes sorts by title),
  // with the home note pinned first. Also reused for the admin's
  // "published only" sidebar filter.
  const flatNotes = useMemo(() => {
    if (admin && !publishedFilter) return null;
    // A copy, because the home note is pinned into place below and the list
    // collectNotes hands back is the shared, memoized one.
    let notes: readonly NoteRef[] = collectNotes(tree);
    if (admin) notes = notes.filter((n) => publishedPaths?.has(n.path));
    const home = homeNote ? resolveLink(homeNote, tree) : null;
    if (home) {
      const i = notes.findIndex((n) => n.path === home);
      if (i > 0) notes = [notes[i], ...notes.slice(0, i), ...notes.slice(i + 1)];
    }
    return { notes, home };
  }, [admin, publishedFilter, publishedPaths, tree, homeNote]);

  // Visitor sidebar: blog-style topic sections derived from published notes'
  // tags. Falls back to the flat list until the tag map has loaded. The admin
  // sidebar (tree + "published only" filter) is untouched.
  // "The labels moved" — a settings save, a tag page edited, a session change.
  // A version number rather than the map: see client/tagLabels.ts.
  const tagLabelsVersion = useTagLabels();
  const topics = useMemo(() => {
    if (admin || !flatNotes || noteTags === null) return null;
    return buildTopics(flatNotes.notes, flatNotes.home, noteTags);
    // `lang` and the label version are dependencies because buildTopics bakes
    // the DISPLAY label into each section — a topic renamed in Settings must
    // repaint without a reload.
  }, [admin, flatNotes, noteTags, lang, tagLabelsVersion]);

  /** The tree's context menu, as ROWS rather than as markup.
   *
   *  It was thirty-eight lines of `<button role="menuitem">` with nine
   *  handlers that each called `setMenu(null)` on their own, its own placement
   *  copy, its own Escape listener and its own focus restore — the second
   *  implementation of a menu this app already had one of, and the two
   *  disagreed (only ContextMenu dismissed on a `contextmenu` elsewhere or on
   *  a resize). ContextMenu.tsx's own header says these should end up on it.
   *
   *  The GROUPS are the other half of the port, and they are why a `null` row
   *  appears four times below: seventeen rows in one flat column is a list to
   *  read rather than a menu to aim at, and the audit measured exactly zero
   *  separators in a folder's menu. They are, in order: make something here ·
   *  name and mark this row · publish and export it · arrange it · remove it.
   *  The destructive tail keeps the hairline app.css draws for it, so no
   *  separator is written before Delete. */
  const menuRows = useMemo<MenuRow[]>(() => {
    if (!menu) return [];
    const node = menu.node;
    const folder = node.type === "folder" || node.path === "";
    const real = node.path !== "";
    const realFolder = node.type === "folder" && real;
    const note = node.type === "file" && !node.attachment;
    const movable = real && !node.attachment;
    const fromKeyboard = menu.fromKeyboard === true;
    const rows: MenuRow[] = [];

    if (folder) {
      rows.push({ label: t("newNoteHere"), onSelect: () => void promptNewNote(node.path) });
      rows.push({ label: t("newDrawingHere"), onSelect: () => void promptNewDrawing(node.path) });
      // The third door into templates, and the one that carries a DESTINATION:
      // the palette and the keystroke create wherever the reader last was,
      // while this one creates in the folder under the pointer — which is the
      // whole reason someone right-clicked a folder.
      rows.push({ label: t("cmdNewFromTemplate"), onSelect: () => void newNoteFromTemplateCommand(node.path) });
      rows.push({ label: t("newFolder"), onSelect: () => void promptNewFolder(node.path) });
    }

    const identity: MenuRow[] = [];
    // Notes AND FOLDERS, never an attachment, never the vault root. This row
    // was notes-only because it called the note rename route, which answers
    // "Not a markdown path" to a folder — while /api/folder/move, which has
    // always been able to do it and rewrites every wikilink across the
    // subtree, sat one menu row below under "Move to…". Renaming a folder cost
    // three operations, one of them semi-destructive. Attachments stay out:
    // their move endpoints are note routes.
    if (movable) identity.push({ label: t("rename"), onSelect: () => setRenaming(node.path) });
    // A folder's own property, edited at the folder — beside Rename, which is
    // the other verb that belongs to this row rather than to the instance.
    // Never the vault ROOT: its key would be the empty path, which is not a
    // folder anything can be keyed by. Notes and attachments never get one
    // (DESIGN.md's no-icon-clutter rule for files stands; only folders were
    // exempted).
    if (realFolder) {
      identity.push({
        label: t("folderIcon"),
        onSelect: () =>
          setIconPick({
            path: node.path,
            name: node.name,
            current: useStore.getState().folderIcons[node.path] ?? null,
            x: menu.x,
            y: menu.y,
            fromKeyboard,
          }),
      });
      // The shelf, from the folder: a path in the library IS a vault folder,
      // and the reader is looking at it. Same terms as the icon row above.
      identity.push({
        label: t("libraryMenu"),
        onSelect: () =>
          setLibPop({
            path: node.path,
            name: node.name,
            unitNames: (node.children ?? []).filter((c) => c.type === "folder").map((c) => c.name),
            x: menu.x,
            y: menu.y,
            fromKeyboard,
          }),
      });
    }
    // A collection from the folder, on the library's terms. Notes get the
    // membership popover in the same group.
    if (collectionsByHand && realFolder) {
      identity.push({
        label: t("collectionTopicMenu"),
        onSelect: () => setColPop({ kind: "folder", path: node.path, name: node.name, x: menu.x, y: menu.y, fromKeyboard }),
      });
    }
    if (collectionsByHand && note) {
      identity.push({
        label: t("collectionsMenu"),
        onSelect: () =>
          setColPop({ kind: "note", path: node.path, name: node.name.replace(/\.md$/i, ""), x: menu.x, y: menu.y, fromKeyboard }),
      });
    }
    if (identity.length > 0) {
      if (rows.length > 0) rows.push({ label: null });
      rows.push(...identity);
    }

    const outward: MenuRow[] = [];
    // PUBLISHING IS ITS OWN VERB. The topic row above writes a page whose
    // members are notes that are already published; this is the row that
    // publishes them, and the two sit near each other so the difference is
    // visible at the moment it matters. Folders only, never the vault root —
    // "publish everything" is not a menu item.
    if (admin && realFolder) outward.push({ label: t("folderPublishAll"), onSelect: () => void publishFolder(node) });
    // The folder as a ZIP — the export dialog opened on this folder, with the
    // rest of its choices still the reader's to make.
    if (admin && realFolder) {
      outward.push({ label: t("treeExportFolder"), onSelect: () => openExportDialog({ scope: "folder", folder: node.path }) });
    }
    // The way IN, beside the way out: the import wizard with this folder as
    // its target (docs/import.md). The vault root offers it too.
    if (admin && folder) outward.push({ label: t("treeImportHere"), onSelect: () => useStore.getState().openImport(node.path) });
    if (outward.length > 0) {
      if (rows.length > 0) rows.push({ label: null });
      rows.push(...outward);
    }

    const arrange: MenuRow[] = [];
    // The keyboard and touch route to the same operation the drag performs. It
    // is not a convenience: HTML5 drag does not exist on a touch screen and
    // cannot be reached from the keyboard at all, so without this row the
    // tree's ONLY way to move a note is mouse-only. Offered on notes and
    // folders alike — never on an attachment (the move endpoints are note
    // routes) and never on the vault root.
    if (movable) {
      const many = selected.has(node.path) && selected.size > 1;
      arrange.push({
        label: many ? tf("treeMoveMany", { n: localeNum(selected.size) }) : t("moveTo"),
        onSelect: () => {
          // A row inside the selection moves the whole selection: one picker,
          // then one move per item.
          const items = many ? selectedItems() : [itemOf(node)];
          if (items.length === 1) {
            void moveViaPicker(items[0]);
            return;
          }
          void (async () => {
            const choice = await pickMoveTarget(items[0]);
            if (choice === null || !("dir" in choice)) return;
            for (const it of items) if (canDrop(it, choice.dir)) await moveTo(it, choice.dir);
            onSelectToggle(null);
          })();
        },
      });
    }
    // Fold-all, scoped: every folder under this one closes (or opens), the way
    // the header's button does for the whole vault.
    if (realFolder) {
      arrange.push({
        label: t("treeFoldInside"),
        onSelect: () => {
          setFoldersUnder(useStore.getState().tree, node.path, false);
          setTreeEpoch((n) => n + 1);
        },
      });
      arrange.push({
        label: t("treeUnfoldInside"),
        onSelect: () => {
          setFoldersUnder(useStore.getState().tree, node.path, true);
          setTreeEpoch((n) => n + 1);
        },
      });
    }
    // The scratch area and the focus: a row's own arrangement verbs, per
    // browser, nothing on disk.
    if (movable) {
      const many = selected.has(node.path) && selected.size > 1;
      arrange.push({
        label: treePrefs.pinned.includes(node.path)
          ? t("treeUnpin")
          : many
            ? tf("treePinMany", { n: localeNum(selected.size) })
            : t("treePin"),
        onSelect: () => {
          const paths = many ? [...selected] : [node.path];
          const on = !treePrefs.pinned.includes(node.path);
          setTreePrefs((p) => togglePinned(p, paths, on));
          if (many) onSelectToggle(null);
        },
      });
      arrange.push({
        label: focus === node.path ? t("treeFocusAll") : t("treeFocus"),
        onSelect: () => setFocus(focus === node.path ? null : node.path),
      });
    }
    // A view filter among the mutations, and deliberately so: the reader who
    // lost their files looks for them by right-clicking the folder that should
    // hold them.
    if (attachmentCount > 0) {
      arrange.push({ label: showAttachments ? t("hideAttachments") : t("showAttachments"), onSelect: toggleAttachments });
    }
    if (arrange.length > 0) {
      if (rows.length > 0) rows.push({ label: null });
      rows.push(...arrange);
    }

    // The destructive tail. No separator is pushed before it: app.css draws
    // its own hairline above the first `--danger` row, and two rules for one
    // line is how they come to disagree.
    if (note) rows.push({ label: t("delete"), danger: true, onSelect: () => void confirmDeleteNote(node.path) });
    // ATTACHMENTS only. The tree has listed a vault's images, PDFs and
    // recordings since attachments landed and offered no verb on a single one
    // of them — so the only way to remove a stale upload was to delete the
    // folder around it, which is exactly the gesture that took a published
    // essay's four images with it.
    if (node.type === "file" && node.attachment) {
      rows.push({ label: t("deleteAttachment"), danger: true, onSelect: () => void confirmDeleteAttachment(node.path) });
    }
    // Never on the root row: the vault itself is not deletable (the server
    // 400s an empty path), and offering it would be a trap.
    if (realFolder) rows.push({ label: t("deleteFolder"), danger: true, onSelect: () => void confirmDeleteFolder(node.path) });

    return rows;
  }, [
    menu,
    admin,
    attachmentCount,
    collectionsByHand,
    focus,
    lang,
    selected,
    showAttachments,
    treePrefs.pinned,
    confirmDeleteAttachment,
    confirmDeleteFolder,
    confirmDeleteNote,
    onSelectToggle,
    selectedItems,
    setFocus,
    setTreePrefs,
    toggleAttachments,
  ]);

  return (
    // Named by what it holds ("Notes sidebar"), never by the edge it is on:
    // that edge is right in Arabic and left in English.
    <aside
      className="s-sidebar"
      aria-label={t("paneNotes")}
      // A file dragged in from the desktop and dropped ANYWHERE in this pane
      // that is not a folder row must do nothing — the browser's default is to
      // navigate away to the image, which throws the reader's whole session
      // out for missing a 26px row by a few pixels. Folder rows stop `dragover`
      // from reaching here and set their own "copy"; everything else answers
      // "none", which both paints the refusal and suppresses the navigation.
      onDragOver={(e) => {
        if (draggedItem() || !dragHasFiles(e.dataTransfer)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "none";
      }}
    >
      {/* The header doubles as the vault-root drop target — see rootDropProps.
          It is the only part of the sidebar that names the vault and is on
          screen at every scroll position. */}
      <header
        className="s-sidebar-header"
        ref={headerRef}
        {...(admin ? rootDropProps(headerRef, "s-sidebar-header--dropok") : {})}
      >
        {admin ? (
          // The wordmark doubles as the preview toggle: one click shows the
          // site exactly as a visitor gets it (same path as the status-bar eye).
          <button
            type="button"
            className="s-title"
            title={t("viewPublicSite")}
            onClick={() => void useStore.getState().setPreviewVisitor(true)}
          >
            {logoSrc ? (
              <img className="s-title__logo" src={logoSrc} alt={siteName} />
            ) : (
              <>
                <BrandMark size={16} className="s-title__mark" />
                {/* THE NAME IS ITS OWN ELEMENT, because a bare text node
                    inside a flex box is an ANONYMOUS flex item: it cannot be
                    given `min-width: 0`, it will not shrink below its own
                    min-content width, and `text-overflow: ellipsis` on the
                    box above it has nothing to apply to. A sixteen-character
                    name (`Almucantar-Notes`) in a 224px pane ran out of the header and under
                    the tools instead of ellipsising. One span, and the rule
                    in app.css finally has an element to act on. */}
                <span className="s-title__name">{siteName}</span>
              </>
            )}
          </button>
        ) : (
          <h1 className="s-title">
            {logoSrc ? (
              <img className="s-title__logo" src={logoSrc} alt={siteName} />
            ) : (
              <>
                <BrandMark size={16} className="s-title__mark" />
                {/* THE NAME IS ITS OWN ELEMENT, because a bare text node
                    inside a flex box is an ANONYMOUS flex item: it cannot be
                    given `min-width: 0`, it will not shrink below its own
                    min-content width, and `text-overflow: ellipsis` on the
                    box above it has nothing to apply to. A sixteen-character
                    name (`Almucantar-Notes`) in a 224px pane ran out of the header and under
                    the tools instead of ellipsising. One span, and the rule
                    in app.css finally has an element to act on. */}
                <span className="s-title__name">{siteName}</span>
              </>
            )}
          </h1>
        )}
        {admin && (
          <span className="s-sidebar-actions">
            <button
              type="button"
              className="s-iconbtn"
              title={t("newNote")}
              aria-label={t("newNote")}
              onClick={() => void promptNewNote("")}
            >
              <IconNewNote />
            </button>
            {/* A drawing one click from the top (the owner: "add a new drawing
                logo on top to start a drawing in the root directory"), in the
                drawings folder from settings or the root. The folder menu
                still starts one inside a folder. */}
            <button
              type="button"
              className="s-iconbtn"
              title={t("newDrawing")}
              aria-label={t("newDrawing")}
              onClick={() => void promptNewDrawing(useStore.getState().drawingsFolder)}
            >
              <IconDrawing />
            </button>
            <button
              type="button"
              className="s-iconbtn"
              title={t("collapseAll")}
              aria-label={t("collapseAll")}
              onClick={() =>
                window.dispatchEvent(new CustomEvent(TREE_ALL_EVENT, { detail: { open: false } }))
              }
            >
              <IconCollapseAll />
            </button>
            <button
              type="button"
              className="s-iconbtn"
              title={t("newFolder")}
              aria-label={t("newFolder")}
              onClick={() => void promptNewFolder("")}
            >
              <IconNewFolder />
            </button>
          </span>
        )}
      </header>
      <div className="s-search">
        <input
          ref={searchRef}
          className="s-search__input"
          type="search"
          placeholder={t(meaningOn ? "searchMeaningPlaceholder" : "searchPlaceholder")}
          // A placeholder is not a label: it disappears the moment the reader
          // types, and several screen readers never announce it at all.
          aria-label={t(meaningOn ? "searchMeaningTitle" : "searchTitle")}
          title={t(meaningOn ? "searchMeaningTitle" : "searchTitle")}
          value={query}
          // The field follows its text, not the chrome: an operator query
          // (`prop:status="in progress"`, which the properties shelf and a
          // search bookmark put here) is Latin, and in an RTL box its
          // closing quote was drawn at the far end of the line.
          dir="auto"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && query) {
              e.preventDefault();
              setQuery("");
              return;
            }
            // Down from the field steps into the results; Enter does too, so
            // the fastest path from a typed word to an open note is two keys.
            if ((e.key === "ArrowDown" || e.key === "Enter") && !e.altKey && !e.ctrlKey && !e.metaKey) {
              if (hitButtons().length === 0) return;
              e.preventDefault();
              focusHit(0);
            }
          }}
          spellCheck={false}
        />
        {/* The card is positioned against THIS box, so it hangs from the field
            it explains rather than from the pane. */}
        {helpOpen && (
          <Suspense fallback={null}>
            <SearchHelp onClose={() => setHelpOpen(false)} />
          </Suspense>
        )}
      </div>

      {/* Two doors under the box (v1.8): a grammar nobody can guess, and the
          rewrite nobody trusts. Both are quiet icon buttons — the search box
          is unchanged for a reader who wants none of it. */}
      <div className="s-searchbar">
        <button
          type="button"
          className={`s-iconbtn${helpOpen ? " s-searchbar__on" : ""}`}
          aria-expanded={helpOpen}
          title={t("searchHelpOpen")}
          aria-label={t("searchHelpOpen")}
          onClick={() => {
            setHelpOpen((v) => !v);
            setReplacing(false);
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.6 9.2a2.5 2.5 0 1 1 3 2.4v1.4" />
            <path d="M12.6 16.6h-.01" />
          </svg>
        </button>
        {admin && (
          <button
            type="button"
            className={`s-iconbtn${replacing ? " s-searchbar__on" : ""}`}
            aria-expanded={replacing}
            title={replacing ? t("replaceClose") : t("replaceOpen")}
            aria-label={replacing ? t("replaceClose") : t("replaceOpen")}
            onClick={() => {
              setReplacing((v) => !v);
              setHelpOpen(false);
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h11l-3-3M20 17H9l3 3" />
            </svg>
          </button>
        )}
        {/* EXACT OR MEANING (docs/ask.md). A switch, not a second box: the
            words stay in the field when the mode flips, so the same query can
            be asked both ways. The glyph is two overlapping circles — things
            that are near each other rather than the same. */}
        {admin && !previewing && (
          <button
            type="button"
            className={`s-iconbtn${meaningOn ? " s-searchbar__on" : ""}`}
            aria-pressed={meaningOn}
            title={t(meaningOn ? "searchMeaningOff" : "searchMeaningOn")}
            aria-label={t("searchMeaningToggle")}
            onClick={() => {
              setMeaning(!meaning);
              setReplacing(false);
              setHelpOpen(false);
              searchRef.current?.focus();
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="9" cy="12" r="5.5" />
              <circle cx="15" cy="12" r="5.5" />
            </svg>
          </button>
        )}
      </div>

      {admin && publishedFilter && (
        <div className="s-filterbar">
          <span className="s-filterbar__label">
            <span aria-hidden="true">✦</span> {t("publishedOnly")}
          </span>
          <button
            type="button"
            className="s-filterbar__clear"
            onClick={() => useStore.getState().setPublishedFilter(false)}
          >
            {t("showAll")}
          </button>
        </div>
      )}

      {admin && replacing ? (
        <Suspense fallback={null}>
          <ReplacePanel query={query} onClose={() => setReplacing(false)} />
        </Suspense>
      ) : meaningOn && query.trim() !== "" ? (
        <Suspense fallback={null}>
          <SemanticResults query={query.trim()} listRef={resultsRef} onKeyDown={onResultsKeyDown} />
        </Suspense>
      ) : hits !== null ? (
        // A results list that swaps in silently is a list a screen-reader user
        // never learns about — the count is announced politely as it lands.
        <div
          className="s-search__results"
          role="region"
          aria-label={t("searchResultsAria")}
          ref={resultsRef}
          onKeyDown={onResultsKeyDown}
        >
          <p className="s-sr-only" role="status">
            {hits.length === 0 ? t("noResultsAria") : tf("resultCount", { count: localeNum(hits.length) })}
          </p>
          {hits.length === 0 && <p className="s-search__none">{t("noMatchesDot")}</p>}
          {hits.map((hit) =>
            hit.kind === "book" ? (
              // ONE PAGE OF A BOOK (server/pdfText.ts). Keyed by page, because
              // the same volume answers several times; no hover preview and no
              // line chevron, because both are about a note's source. The click
              // opens the reader on the page by the road a citation takes.
              <div key={`${hit.path}#${hit.page ?? 1}`} className="s-search-row s-search-row--book">
                <button
                  type="button"
                  className="s-search-hit s-search-hit--book"
                  onClick={() => openBookPage(hit.path, hit.page ?? 1)}
                >
                  <span className="s-search-hit__title">
                    <span className="s-sr-only">{t("searchKindBook")} </span>
                    <bdi>{hit.title}</bdi>
                    {/* A real space, not only a margin: a screen reader (and
                        innerText) would otherwise run "Treatise" into "p. 3". */}
                    {" "}
                    <span className="s-search-hit__page">
                      {tf("searchHitPage", { n: localeNum(hit.page ?? 1) })}
                    </span>
                  </span>
                  {!snippetIsEmpty(hit.snippet) && (
                    <span className="s-search-hit__snippet" dir="auto">
                      {renderSnippet(hit.snippet)}
                    </span>
                  )}
                </button>
              </div>
            ) : (
            <div key={hit.path} className="s-search-row" data-preview-path={hit.path}>
            <button
              type="button"
              className="s-search-hit"
              onClick={() => openNote(hit.path)}
            >
              {/* Direction per note, alignment per chrome (see BacklinksPanel):
                  the isolate goes around the title, not around the line that
                  also carries the ✦ published star. */}
              <span className="s-search-hit__title">
                <bdi>{hit.title}</bdi>
                {admin && publishedPaths?.has(hit.path) && (
                  <span className="s-pubstar" role="img" title={t("published")} aria-label={t("published")}>
                    ✦
                  </span>
                )}
              </span>
              {/* WHY this row is here, when the title does not say so. An
                  alias is often a word the note's own text never contains, so
                  without this line the hit looks like a search bug — and when
                  two notes claim one alias, this is where the reader can see
                  which one answered. */}
              {hit.alias !== undefined && (
                <span className="s-search-hit__why" dir="auto">
                  {tf("searchMatchedAlias", { alias: hit.alias })}
                </span>
              )}
              {!snippetIsEmpty(hit.snippet) && (
                <span className="s-search-hit__snippet" dir="auto">
                  {renderSnippet(hit.snippet)}
                </span>
              )}
            </button>
            {/* The chevron is the hit's SIBLING, not its child — a button may
                not contain a button, and the row click keeps meaning "open the
                note" exactly as before. */}
            <button
              type="button"
              className="s-search-expand s-iconbtn"
              onClick={() => toggleHitMatches(hit.path)}
              aria-expanded={expandedHits.has(hit.path)}
              aria-label={tf(expandedHits.has(hit.path) ? "searchHitMatchesHide" : "searchHitMatches", { label: hit.title })}
              title={tf(expandedHits.has(hit.path) ? "searchHitMatchesHide" : "searchHitMatches", { label: hit.title })}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
            {expandedHits.has(hit.path) && (() => {
              const state = hitMatches.get(hit.path);
              if (state === undefined || state === "loading") return null;
              if (state === "error" || state.length === 0) {
                // An honest empty state: the NOTE matched (fuzzy spelling, its
                // title, an alias) even though no line contains the words —
                // and a fetch error earns the same quiet row, because the
                // whole-note click above it still works either way.
                return <p className="s-search-matches__none">{t("noMatchesDot")}</p>;
              }
              return (
                <div className="s-search-matches">
                  {state.map((m) => (
                    <button
                      key={m.line}
                      type="button"
                      className="s-search-match"
                      onClick={() =>
                        void import("../landing.ts").then((mod) => mod.landOnLine(hit.path, m.line))
                      }
                    >
                      <span className="s-search-match__line" aria-hidden="true">
                        {localeNum(m.line)}
                      </span>
                      <span className="s-search-match__text" dir="auto">
                        {renderSnippet(m.text)}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })()}
            </div>
            ),
          )}
        </div>
      ) : topics !== null && flatNotes !== null ? (
        <nav className="s-publist s-topics" aria-label={t("notesByTopic")}>
          {flatNotes.home !== null &&
            flatNotes.notes
              .filter((note) => note.path === flatNotes.home)
              .map((note) => (
                <PubRow
                  key={note.path}
                  path={note.path}
                  title={note.title}
                  isHome
                  lang={lang}
                  onOpen={openNote}
                />
              ))}
          {flatNotes.home !== null && topics.length > 0 && (
            <div className="s-topics__rule" aria-hidden="true" />
          )}
          {topics.map((section) => (
            <TopicSection key={section.key} section={section} lang={lang} onOpen={openNote} />
          ))}
          {flatNotes.notes.length === 0 && (
            <p className="s-publist__none">{t("nothingPublished")}</p>
          )}
        </nav>
      ) : flatNotes !== null ? (
        <nav className="s-publist" aria-label={admin ? t("publishedNotes") : t("notes")}>
          {admin && (
            <div className="s-publist__head">
              <span className="s-publist__headstar" aria-hidden="true">✦</span>
              {t("publishedOnly")}
            </div>
          )}
          {flatNotes.notes.map((note) => (
            <PubRow
              key={note.path}
              path={note.path}
              title={note.title}
              isHome={note.path === flatNotes.home}
              lang={lang}
              onOpen={openNote}
            />
          ))}
          {flatNotes.notes.length === 0 && (
            <p className="s-publist__none">{t("nothingPublished")}</p>
          )}
        </nav>
      ) : (
        <nav
          // The dropping class and its title come from the desktop-drop work;
          // everything else on this element is the in-app move machinery. They
          // decorate the same <nav> but never at the same moment — one drag
          // carries OS files, the other carries a tree path.
          className={`s-tree${rootDrag > 0 ? " s-tree--dropping" : ""}`}
          title={rootDrag > 0 ? t("dropFilesTitle") : undefined}
          ref={treeScrollRef}
          onContextMenu={(e) => {
            if (tree && e.target === e.currentTarget) openMenu(e, tree);
          }}
          // CAPTURE phase, deliberately: the rows stop dragover from bubbling
          // (so a row inside a folder never lights the root up), and auto-scroll
          // has to run while the pointer is over ROWS — which is all of the
          // time. This is the only handler that sees every dragover.
          onDragOverCapture={(e) => {
            if (draggedItem() && treeScrollRef.current) {
              autoScroll(treeScrollRef.current, e.clientY);
            }
          }}
          // The other vault-root surface: the tree's own empty space below the
          // last row (rows stop dragover from bubbling, so anything arriving
          // here came from the container itself).
          {...rootDropProps(treeScrollRef, "s-tree--droproot")}
          // …plus the one thing the shared handler cannot know: a pointer that
          // has left the tree entirely must stop the auto-scroll it started.
          onDragLeave={(e) => {
            if (treeScrollRef.current?.contains(e.relatedTarget as Node | null)) return;
            treeScrollRef.current?.classList.remove("s-tree--droproot");
            stopAutoScroll();
          }}
        >
          {/* One tab stop for the whole vault. `aria-activedescendant` names
              the row the reader is on (see the tree keyboard model above); the
              roles make it a tree to a screen reader instead of a pile of
              unlabelled divs, which is what it was. A 1,388-row vault that
              spends 1,388 tab stops before the note is a tree nobody tabs
              past twice. */}
          <div
            ref={treeRef}
            className="s-tree__root"
            role="tree"
            aria-label={t("vaultTree")}
            tabIndex={0}
            onKeyDown={onTreeKeyDown}
            onFocus={(e) => {
              if (e.target !== e.currentTarget) return;
              if (cursor === null) moveCursor(initialCursor());
            }}
            onMouseDown={(e) => {
              // Clicking a row moves the cursor there, so the arrows continue
              // from where the reader last pointed rather than from wherever
              // the keyboard left off.
              const row = (e.target as HTMLElement).closest<HTMLElement>(".s-tree__item");
              if (row?.dataset.treePath !== undefined) setCursor(row.dataset.treePath);
            }}
          >
            {/* TreeChildren, not a bare map: it is what knows about
                attachments, the "show more" row that keeps a 1,158-file folder
                from janking, and the folders-first ordering. It threads
                index/setSize down to each row for aria-posinset/setsize. */}
            {/* THE SCRATCH AREA: pinned notes and folders, above the vault in
                the reader's own order, each row the row it is elsewhere. */}
            <BookmarksRows />
            {pinnedNodes.length > 0 && (
              <div className="s-tree__pinned" role="group" aria-label={t("treePinned")}>
                <div className="s-tree__pinned-head">
                  <span>{t("treePinned")}</span>
                  <button type="button" className="s-tree__pinned-clear" onClick={() => setTreePrefs((p) => ({ ...p, pinned: [] }))}>
                    {t("treeUnpinAll")}
                  </button>
                </div>
                <TreeChildren
                  key={`pinned-${treeEpoch}`}
                  nodes={pinnedNodes}
                  parent={PINNED_PARENT}
                  depth={0}
                  renaming={renaming}
                  lang={lang}
                  admin={admin}
                  showAttachments={showAttachments}
                  order={treePrefs}
                  focus={null}
                  selected={selected}
                  onSelectToggle={onSelectToggle}
                  onReorder={onReorder}
                  onOpen={openNote}
                  onStartRename={startRename}
                  onCommitRename={commitRename}
                  onCancelRename={cancelRename}
                  onMenu={openMenu}
                  onAttachment={openAttachment}
                  onShowAttachments={showAllAttachments}
                  onDropFiles={onDropFiles}
                />
              </div>
            )}
            {focus !== null && (
              <div className="s-tree__focus" role="status">
                <span dir="auto">{tf("treeFocusedOn", { name: focus.slice(focus.lastIndexOf("/") + 1).replace(/\.md$/i, "") })}</span>
                <button type="button" className="s-tree__focus-clear" onClick={() => setFocus(null)}>
                  {t("treeFocusAll")}
                </button>
              </div>
            )}
            <TreeChildren
              key={treeEpoch}
              nodes={tree?.children ?? []}
              parent=""
              order={treePrefs}
              focus={focus}
              selected={selected}
              onSelectToggle={onSelectToggle}
              onReorder={onReorder}
              depth={0}
              renaming={renaming}
              lang={lang}
              admin={admin}
              showAttachments={showAttachments}
              onOpen={openNote}
              onStartRename={startRename}
              onCommitRename={commitRename}
              onCancelRename={cancelRename}
              onMenu={openMenu}
              onAttachment={openAttachment}
              onShowAttachments={showAllAttachments}
              onDropFiles={onDropFiles}
            />
          </div>
          {/* A VAULT WITH NOTHING IN IT IS THE FIRST SCREEN SOMEBODY SEES, and
              it was 292 pixels of nothing (v1.8 UX audit F41). The two doors
              are the two answers: write something, or take the guide the
              server stopped writing into people's own directories unasked
              (server/seed.ts — this is the offer that replaced it). */}
          {tree !== null && (tree.children?.length ?? 0) === 0 && <TreeEmpty />}
        </nav>
      )}

      {(tags.length > 0 || admin) && (
        <TagShelf shelf={shelf} tags={tags} admin={admin} query={query} setQuery={setQuery} setTagMenu={setTagMenu} />
      )}

      {/* The footer counts what is actually in the vault — notes AND the files
          beside them — and carries the filter that decides whether the second
          number is on screen. A hidden filter that removes a thousand rows is
          the bug this round is about, so the OFF state is drawn, not implied:
          the clip goes grey and the count is struck through. */}
      <footer
        className={`s-sidebar-foot${admin && attachmentCount > 0 ? " s-sidebar-foot--split" : ""}`}
      >
        <span>{countPhrase(noteCount, "notes")}</span>
        {/* The sort menu: the server's order, reversed, or the reader's own.
            It used to be a hand-rolled box that closed on `onMouseLeave` and
            on nothing else — not Escape, not an outside click, and on a phone,
            which has no mouseleave at all, not ever. It is the tree's menu now,
            anchored on the button instead of at a pointer: the rows are
            CHOICES, so they carry the ✓ column ContextMenu grew for them. */}
        <span className="s-treesort">
          <button
            type="button"
            className={`s-attfilter s-attfilter--${treePrefs.sort === "name" ? "off" : "on"}`}
            aria-haspopup="menu"
            aria-expanded={sortAt !== null}
            title={t("treeSort")}
            onClick={(e) => {
              if (sortAt !== null) {
                setSortAt(null);
                return;
              }
              const box = e.currentTarget.getBoundingClientRect();
              const rtl = getComputedStyle(document.documentElement).direction === "rtl";
              setSortAt({
                // The menu's own reading-start edge, aligned with the button's:
                // ContextMenu grows toward the reading direction from the point
                // it is given, so the point is the button's leading corner.
                x: Math.round(rtl ? box.right : box.left),
                y: Math.round(box.top),
                // `detail === 0` is Enter or Space on the button — a pointer
                // click always reports at least one. A keyboard opener has to
                // get focus INTO the menu and back out of it.
                fromKeyboard: e.detail === 0,
              });
            }}
          >
            <span className="s-attfilter__clip" aria-hidden="true">⇅</span>
            <span className="s-attfilter__count">
              {treePrefs.sort === "name" ? t("treeSortName") : treePrefs.sort === "name-desc" ? t("treeSortNameDesc") : t("treeSortManual")}
            </span>
          </button>
          {sortAt !== null && (
            <ContextMenu
              at={sortAt}
              label={t("treeSort")}
              onClose={() => setSortAt(null)}
              rows={[
                ...(["name", "name-desc", "manual"] as TreeSort[]).map((mode) => ({
                  label: mode === "name" ? t("treeSortName") : mode === "name-desc" ? t("treeSortNameDesc") : t("treeSortManual"),
                  checked: treePrefs.sort === mode,
                  onSelect: () => setTreePrefs((p) => ({ ...p, sort: mode })),
                })),
                // Not a choice — it UNDOES one, and every hand-made position
                // with it. Its own group, and no tick: nothing is ever "on
                // Reset".
                { label: null },
                {
                  label: t("treeSortReset"),
                  onSelect: () => setTreePrefs((p) => ({ ...p, sort: "name", order: {} })),
                },
              ]}
            />
          )}
        </span>
        {admin && attachmentCount > 0 && (
          <button
            type="button"
            className={`s-attfilter s-attfilter--${showAttachments ? "on" : "off"}`}
            onClick={toggleAttachments}
            aria-pressed={showAttachments}
            title={showAttachments ? t("hideAttachments") : t("showAttachments")}
          >
            <span className="s-attfilter__clip">
              <IconClip />
            </span>
            <span className="s-attfilter__count">
              {showAttachments
                ? countPhrase(attachmentCount, "files")
                : tf("attachmentsHidden", { count: countPhrase(attachmentCount, "files") })}
            </span>
          </button>
        )}
      </footer>

      {menu && (
        <ContextMenu
          at={menu}
          rows={menuRows}
          label={t("rowActions")}
          onClose={() => setMenu(null)}
        />
      )}

      {/* The tag shelf's menu. One verb today, and it is the verb the forum has
          been asking for since 2018: rename (and, onto a name that exists,
          merge). The same component as the tree's, because a menu that looks
          like another menu and dismisses differently is the bug ContextMenu
          exists to end — a separate CALL because a tag is not a tree node. */}
      {tagMenu && (
        <ContextMenu
          at={tagMenu}
          rows={[
            {
              label: t("renameTag"),
              onSelect: () => void promptTagRename(tagMenu.tag, tags.map((entry) => entry.tag)),
            },
          ]}
          label={t("tagActions")}
          onClose={() => setTagMenu(null)}
        />
      )}

      {iconPick && (
        <Suspense fallback={null}>
          <FolderIconPicker
            state={iconPick}
            onPick={(icon) => chooseFolderIcon(iconPick.path, icon)}
            onClose={() => {
              // Same courtesy the context menu does: a popover a keyboard
              // reader opened must put them back on the tree, not on <body>.
              if (iconPick.fromKeyboard) treeRef.current?.focus();
              setIconPick(null);
            }}
          />
        </Suspense>
      )}

      {libPop && (
        <Suspense fallback={null}>
          <LibraryFolderPopover
            state={libPop}
            onClose={() => {
              if (libPop.fromKeyboard) treeRef.current?.focus();
              setLibPop(null);
            }}
          />
        </Suspense>
      )}

      {colPop && (
        <Suspense fallback={null}>
          <CollectionsPopover
            state={colPop}
            onClose={() => {
              if (colPop.fromKeyboard) treeRef.current?.focus();
              setColPop(null);
            }}
          />
        </Suspense>
      )}

      {viewer && (
        <AttachmentViewer
          items={viewer.items}
          index={viewer.index}
          onIndex={(index) => setViewer((cur) => (cur ? { ...cur, index } : cur))}
          onClose={() => setViewer(null)}
        />
      )}
    </aside>
  );
}

/** THE EMPTY VAULT'S INVITATION.
 *
 *  Three marks and two doors, the shape every other empty state in this
 *  product settled on (the designer's, the graph's): a glyph, one sentence
 *  saying what is true, and something to press. The guide door only appears
 *  when there IS a guide to copy and nothing of the reader's to copy it over —
 *  `GET /api/seed` answers both questions, and a button that would 409 is a
 *  button that should not be drawn.
 *
 *  Asked once, on mount. This component exists only while the vault is empty,
 *  which is a state a vault leaves exactly once. */
function TreeEmpty() {
  const [seed, setSeed] = useState<{ available: boolean; guide: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useStore((s) => s.language); // re-render the chrome strings on language change

  useEffect(() => {
    let disposed = false;
    seedStatus()
      .then((s) => {
        if (!disposed) setSeed(s);
      })
      .catch(() => {
        // A visitor gets a 404 here by design, and a visitor has no folders in
        // their sidebar to begin with: no door, no noise.
        if (!disposed) setSeed({ available: false, guide: "" });
      });
    return () => {
      disposed = true;
    };
  }, []);

  const takeSeed = (): void => {
    setBusy(true);
    seedVault()
      .then(async ({ guide }) => {
        await useStore.getState().loadTree();
        // Straight into the guide, and NO toast: thirteen rows appearing where
        // there were none and the guide opening in the pane is a louder
        // confirmation than a sentence, and a toast fired here would be swept
        // away by App.tsx's own navigation dismissal a frame later anyway.
        useStore.getState().openNote(guide);
      })
      .catch((err: unknown) => {
        console.error("astrolabe: seeding the vault failed", err);
        toast(t("seedFailed"), "error");
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="s-tree__empty">
      <span className="s-tree__empty-star" aria-hidden="true"><SiteMark size={28} /></span>
      <p className="s-tree__empty-body">{t("vaultEmptyBody")}</p>
      <div className="s-tree__empty-acts">
        <button
          type="button"
          className="s-btn s-btn--accent"
          disabled={busy}
          onClick={() => void promptNewNote("")}
        >
          {t("newNote")}
        </button>
        {seed?.available === true && (
          <button type="button" className="s-btn" disabled={busy} onClick={takeSeed}>
            {t("vaultEmptySeed")}
          </button>
        )}
      </div>
    </div>
  );
}
