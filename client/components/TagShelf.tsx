// The tag shelf under the notes tree, and the properties face that shares its
// box. `useTagShelf` holds its state and is called by Sidebar where that state
// used to be declared; `TagShelf` draws it. Moved out of
// client/components/Sidebar.tsx unchanged.

import { localeNum, t, tf, type Lang } from "../i18n.ts";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { TagCount } from "../../shared/types.ts";
import { flattenTagTree, tagTree, type TagSort } from "../../shared/tagTree.ts";
import { lazySurface } from "../lazySurface.tsx";
import { label as tagLabel } from "../tagLabels.ts";
import { useStore } from "../state.ts";

// The properties shelf is the owner's and starts under the tags, so it
// rides its own chunk with its own stylesheet: a visitor never fetches it,
// and the admin first paint does not carry a list nobody has scrolled to.
const PropsShelf = lazySurface(() => import("./PropsShelf.tsx"));

// Tags section collapse (tag-heavy vaults: the pill cloud can eat the tree's
// room) — persisted like the tree's folder expansion.
const TAGS_COLLAPSED_KEY = "astrolabe.tags-collapsed";
/** Which of the shelf's two faces shows: the tags or the properties. ONE
 *  box under the tree, a tab for each, so neither eats the tree's room (the
 *  owner: "tags and properties in the same box, toggle between them"). */
const SHELF_TAB_KEY = "astrolabe.shelf-tab";
type ShelfTab = "tags" | "props";
function loadShelfTab(): ShelfTab {
  try {
    return localStorage.getItem(SHELF_TAB_KEY) === "props" ? "props" : "tags";
  } catch {
    return "tags";
  }
}
/** The shelf's height when the reader has dragged its top edge (px), or null
 *  for the stylesheet's own cap. Per browser, like the pane widths. */
const TAGS_HEIGHT_KEY = "astrolabe.tags-height";
const TAGS_MIN_H = 48;
function loadTagsHeight(): number | null {
  try {
    const n = Number(localStorage.getItem(TAGS_HEIGHT_KEY));
    return Number.isFinite(n) && n >= TAGS_MIN_H ? n : null;
  } catch {
    return null;
  }
}
/** How many tag pills the shelf shows before it offers the rest (F17) — a
 *  dozen is about four rows in a 292px sidebar, which leaves the tree the pane.
 *  The pills arrive sorted by count, so the twelve shown are the twelve used. */
const TAG_SHELF_CAP = 12;
const TAG_SORT_KEY = "astrolabe.tags-sort";
const TAG_OPEN_KEY = "astrolabe.tags-open";

function loadTagsCollapsed(): boolean {
  try {
    return localStorage.getItem(TAGS_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

/** The tag shelf's own context menu. A separate state from the tree's because
 *  a tag is not a tree node — it has no path, no parent and exactly one verb —
 *  and threading an optional node through every row of the menu above would
 *  have made eleven guards out of one. They share the placement rule and the
 *  `.s-menu` chrome, which is the part that has to agree. */
export interface TagMenuState {
  x: number;
  y: number;
  tag: string;
  fromKeyboard?: boolean;
}

/** Up/Down inside a WRAPPED row of chips: the index of the nearest chip on the
 *  next (`dir` 1) or previous (`dir` -1) visual line, measured from the centre
 *  of the one you are on. `offsetTop` is the line: chips on one line share it,
 *  and it is the only thing that knows where the text wrapped. Returns -1 when
 *  there is no such line. */
function rowStep(chips: HTMLElement[], at: number, dir: 1 | -1): number {
  const from = chips[at];
  if (!from) return -1;
  const line = from.offsetTop;
  const centre = from.offsetLeft + from.offsetWidth / 2;
  /** Is `a` further along in the travel direction than `b`? */
  const beyond = (a: number, b: number): boolean => (a - b) * dir > 0;
  let bestLine: number | null = null;
  let best = -1;
  let bestDx = Infinity;
  for (let i = 0; i < chips.length; i++) {
    const top = chips[i].offsetTop;
    // Only lines strictly past the current one, and only the FIRST such line.
    if (!beyond(top, line)) continue;
    if (bestLine !== null && beyond(top, bestLine)) continue;
    const dx = Math.abs(chips[i].offsetLeft + chips[i].offsetWidth / 2 - centre);
    if (bestLine !== null && top === bestLine && dx >= bestDx) continue;
    bestLine = top;
    bestDx = dx;
    best = i;
  }
  return best;
}

/** The tag shelf's state: its fold, its two faces, its height, its roving
 *  stop, the cap and the branch tree. Called once, by Sidebar, where the
 *  shelf block used to sit; moved out unchanged. */
export function useTagShelf({
  tags,
  query,
  lang,
  setTagMenu,
}: {
  tags: TagCount[];
  query: string;
  lang: Lang;
  setTagMenu: React.Dispatch<React.SetStateAction<TagMenuState | null>>;
}) {
  const [tagsCollapsed, setTagsCollapsed] = useState(loadTagsCollapsed);
  const [shelfTab, setShelfTabState] = useState<ShelfTab>(loadShelfTab);
  const [propCount, setPropCount] = useState(0);
  const setShelfTab = (tab: ShelfTab): void => {
    setShelfTabState(tab);
    try {
      localStorage.setItem(SHELF_TAB_KEY, tab);
    } catch {
      // storage unavailable — the choice lives for this session
    }
  };
  const [tagsHeight, setTagsHeight] = useState<number | null>(loadTagsHeight);
  // THE SHELF'S TOP EDGE IS A GRIP (the owner: "should def be able to expand
  // and contract that"). Drag it up for more pills, down for more tree;
  // double-click for the stylesheet's own height. Pointer capture, like the
  // pane grips, and the height lands on the element itself.
  const onTagsGrip = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    const grip = e.currentTarget;
    const shelf = grip.parentElement;
    if (shelf === null) return;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startH = shelf.getBoundingClientRect().height;
    const sidebarH = shelf.closest(".s-sidebar")?.getBoundingClientRect().height ?? window.innerHeight;
    let last = startH;
    document.documentElement.classList.add("s-app--split-drag", "s-app--split-drag-y");
    const move = (ev: PointerEvent): void => {
      last = Math.max(TAGS_MIN_H, Math.min(sidebarH * 0.8, startH + (startY - ev.clientY)));
      shelf.style.height = `${last}px`;
      shelf.style.maxHeight = `${last}px`;
    };
    const up = (): void => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
      document.documentElement.classList.remove("s-app--split-drag", "s-app--split-drag-y");
      const h = Math.round(last);
      setTagsHeight(h);
      try {
        localStorage.setItem(TAGS_HEIGHT_KEY, String(h));
      } catch {
        // storage unavailable — the height still holds for this session
      }
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
  };
  const resetTagsHeight = (): void => {
    setTagsHeight(null);
    try {
      localStorage.removeItem(TAGS_HEIGHT_KEY);
    } catch {
      // storage unavailable
    }
  };
  /** Which tag pill currently carries the shelf's single tab stop. Null until
   *  the reader moves it; the derivation below is what decides where Tab
   *  lands before that, and it re-decides whenever the tag list changes under
   *  it (an SSE reindex can drop the tag the cursor was parked on). */
  const [tagCursor, setTagCursor] = useState<string | null>(null);

  // ── The tag shelf, capped ────────────────────────────────────────────────
  /** THE SHELF SHOWS A DOZEN AND OFFERS THE REST (v1.8 audit, F17: twenty-three
   *  tags ate a quarter of the pane before the tree got a row).
   *
   *  `max-height: 24vh` with its own scroll (app.css) was the cap, and a cap
   *  that is a quarter of the window is still a quarter of the window: the
   *  pills arrive sorted by count, so what a reader loses is the BOTTOM of
   *  their own tree to the TAIL of a list they have mostly never clicked. The
   *  tree's own "Show N more" (attachments.css) is the idiom already in this
   *  pane, and it is the honest one — the count is on the button, so nothing
   *  is silently truncated. The scroll cap stays for the expanded case.
   *
   *  One pill is never worth a row that says "one more", so the cap only
   *  applies once there are at least two to hide. */
  const [allTags, setAllTags] = useState(false);
  const shownTags = useMemo(() => {
    if (allTags || tags.length <= TAG_SHELF_CAP + 1) return tags;
    const head = tags.slice(0, TAG_SHELF_CAP);
    // The tag DOING the filtering is on the shelf wherever it sorts: a filter
    // whose own pill is hidden is a filter with no way to clear it.
    const filtering = query.trim().startsWith("#") ? query.trim().slice(1) : null;
    if (filtering !== null && !head.some((e) => e.tag === filtering)) {
      const pinned = tags.find((e) => e.tag === filtering);
      if (pinned) return [...head.slice(0, TAG_SHELF_CAP - 1), pinned];
    }
    return head;
  }, [tags, allTags, query]);

  // ── The tag shelf's single tab stop ──────────────────────────────────────
  /** Where Tab enters the shelf: the reader's own cursor while it still names
   *  a tag, else the tag currently filtering the search (so Tab lands on the
   *  filter you are looking at), else the first pill. */
  // THE SHELF IS A TREE. `zettel/seed` and `zettel/idea` used to be two
  // pills that both began with "zettel/"; now `zettel` is one row with the
  // count of everything under it, and a chevron opens the branch. Sort by
  // count (the old order) or by name; both remembered per device.
  const [tagSort, setTagSort] = useState<TagSort>(() => {
    try {
      return localStorage.getItem(TAG_SORT_KEY) === "name" ? "name" : "count";
    } catch {
      return "count";
    }
  });
  const [openTags, setOpenTags] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(TAG_OPEN_KEY) ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  // Hover previews over the pills (client/tagPreview.ts): rest on a tag and
  // the three notes that carry it most float beside it. The same engine as
  // the hit rows above, by dynamic import for the same first-paint reason —
  // and fetched on the FIRST pointer or focus to reach the list, not on
  // mount: the shelf is on screen in every session, admin and visitor
  // alike, and a chunk pulled at boot for a card most sessions never open is
  // a boot cost, however small. Installed on the list, which mounts and
  // unmounts with the collapse, and re-installed on a language flip because
  // the card's count line is t() text. The shelf's counts are read through a
  // ref so a tag list that reloads under a standing card is not a reason to
  // re-install.
  const tagListRef = useRef<HTMLDivElement | null>(null);
  const tagCountsRef = useRef<TagCount[]>([]);
  tagCountsRef.current = tags;
  useEffect(() => {
    const list = tagListRef.current;
    if (tagsCollapsed || tags.length === 0 || !list) return;
    let dispose: (() => void) | null = null;
    let dead = false;
    let asked = false;
    const arm = (first: Event): void => {
      if (asked) return;
      asked = true;
      list.removeEventListener("pointerover", arm);
      list.removeEventListener("focusin", arm);
      void import("../tagPreview.ts").then((m) => {
        if (dead || !tagListRef.current) return;
        dispose = m.installTagPreviews(tagListRef.current, tagListRef.current, (tag) => {
          // A branch row ("zettel", with children) counts its whole subtree;
          // the flat list carries only the leaf tags, so a branch reads null
          // and the card shows its three without a total.
          const hit = tagCountsRef.current.find((entry) => entry.tag === tag);
          return hit ? hit.count : null;
        });
        // The event that fetched the engine happened before the engine was
        // listening. Say it again, so the pill the pointer is already on (or
        // the one the keyboard already reached) opens its card now rather
        // than on the next move.
        const target = first.target;
        if (!(target instanceof HTMLElement) || !list.contains(target)) return;
        if (first.type === "focusin" && document.activeElement === target) {
          target.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
        } else if (first.type === "pointerover" && target.matches(":hover")) {
          target.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
        }
      });
    };
    list.addEventListener("pointerover", arm);
    list.addEventListener("focusin", arm);
    return () => {
      dead = true;
      list.removeEventListener("pointerover", arm);
      list.removeEventListener("focusin", arm);
      dispose?.();
    };
  }, [tagsCollapsed, tags.length === 0, lang]);
  const toggleBranch = useCallback((tag: string): void => {
    setOpenTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      try {
        localStorage.setItem(TAG_OPEN_KEY, JSON.stringify([...next]));
      } catch {
        // storage unavailable
      }
      return next;
    });
  }, []);
  const tagRows = useMemo(() => {
    // The filtering tag's branch is open whatever was stored: a filter whose
    // own pill is folded away is a filter with no way to clear it.
    const filtering = query.trim().startsWith("#") ? query.trim().slice(1) : null;
    const open = new Set(openTags);
    if (filtering !== null) {
      const parts = filtering.split("/");
      for (let i = 1; i < parts.length; i++) open.add(parts.slice(0, i).join("/"));
    }
    return flattenTagTree(tagTree(shownTags, tagSort), open);
  }, [shownTags, tagSort, openTags, query]);

  const tagStop = useMemo(() => {
    // Over the SHOWN pills, not every tag: a stop on a pill that is not on the
    // shelf leaves the shelf with no tabIndex 0 in it at all, i.e. unreachable.
    const has = (tag: string | null): boolean =>
      tag !== null && tagRows.some((row) => row.node.tag === tag);
    if (has(tagCursor)) return tagCursor;
    const filtering = query.trim().startsWith("#") ? query.trim().slice(1) : null;
    if (has(filtering)) return filtering;
    return tagRows[0]?.node.tag ?? null;
  }, [tagCursor, query, tagRows]);

  /**
   * ARROWS WALK THE PILLS. The shelf is a WRAPPED grid, so both axes have to
   * mean something: Left/Right step one pill in READING order (logical, so
   * they swap under RTL — the same rule the tree's Left/Right keep), and
   * Up/Down step a visual ROW, landing on the pill nearest the one you left in
   * the inline direction. Home/End go to the ends of the shelf. Geometry comes
   * out of the DOM rather than the model because only the DOM knows where the
   * lines broke.
   */
  const onTagsKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const rtl = document.documentElement.getAttribute("dir") === "rtl";
    const pills = [...e.currentTarget.querySelectorAll<HTMLElement>(".s-tag")];
    const at = pills.findIndex((pill) => pill === document.activeElement);
    if (at < 0) return;
    let to = -1;
    if (e.key === "Home") to = 0;
    else if (e.key === "End") to = pills.length - 1;
    else if (e.key === (rtl ? "ArrowLeft" : "ArrowRight")) to = at + 1;
    else if (e.key === (rtl ? "ArrowRight" : "ArrowLeft")) to = at - 1;
    else if (e.key === "ArrowDown") to = rowStep(pills, at, 1);
    else if (e.key === "ArrowUp") to = rowStep(pills, at, -1);
    else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      // The keyboard's right-click, on the pill the roving stop is parked on.
      // "Rename tag…" is admin-only and mouse-only without it, and the reader
      // who cannot drag a tree row is the same reader who cannot right-click.
      if (!useStore.getState().admin) return;
      e.preventDefault();
      const box = pills[at].getBoundingClientRect();
      setTagMenu({
        x: Math.round(box.left + 12),
        y: Math.round(box.bottom),
        tag: pills[at].dataset.tag ?? "",
        fromKeyboard: true,
      });
      return;
    } else return;
    if (to < 0 || to >= pills.length) return;
    e.preventDefault();
    const next = pills[to];
    setTagCursor(next.dataset.tag ?? null);
    next.focus();
  }, []);
  return {
    tagsCollapsed, setTagsCollapsed, shelfTab, setShelfTab, propCount, setPropCount,
    tagsHeight, onTagsGrip, resetTagsHeight, tagCursor, setTagCursor, allTags, setAllTags,
    shownTags, tagSort, setTagSort, openTags, tagListRef, toggleBranch, tagRows, tagStop,
    onTagsKeyDown,
  };
}

/** The tag shelf (and the properties face beside it) as Sidebar draws it,
 *  from `useTagShelf`. Moved out of Sidebar's JSX unchanged. */
export function TagShelf({
  shelf,
  tags,
  admin,
  query,
  setQuery,
  setTagMenu,
}: {
  shelf: ReturnType<typeof useTagShelf>;
  tags: TagCount[];
  admin: boolean;
  query: string;
  setQuery: (query: string) => void;
  setTagMenu: React.Dispatch<React.SetStateAction<TagMenuState | null>>;
}) {
  const {
    tagsCollapsed, setTagsCollapsed, shelfTab, setShelfTab, propCount, setPropCount,
    tagsHeight, onTagsGrip, resetTagsHeight, setTagCursor, setAllTags,
    shownTags, tagSort, setTagSort, openTags, tagListRef, toggleBranch, tagRows, tagStop,
    onTagsKeyDown,
  } = shelf;
  return (
    <div
      className={`s-tags${tagsCollapsed ? " s-tags--collapsed" : ""}`}
      style={tagsHeight !== null && !tagsCollapsed ? { height: tagsHeight, maxHeight: tagsHeight } : undefined}
    >
      {!tagsCollapsed && (
        <div
          className="s-tags__grip"
          role="separator"
          aria-orientation="horizontal"
          aria-label={t("tagsGrip")}
          title={t("tagsGrip")}
          onPointerDown={onTagsGrip}
          onDoubleClick={resetTagsHeight}
        />
      )}
      <button
        type="button"
        className="s-tags__toggle"
        onClick={() => {
          const next = !tagsCollapsed;
          setTagsCollapsed(next);
          try {
            localStorage.setItem(TAGS_COLLAPSED_KEY, String(next));
          } catch {
            // storage unavailable — collapse still works for this session
          }
        }}
        aria-expanded={!tagsCollapsed}
        title={tagsCollapsed ? t("showTags") : t("hideTags")}
      >
        <span
          className={`s-tree__chevron${tagsCollapsed ? "" : " s-tree__chevron--open"}`}
          aria-hidden="true"
        >
          ›
        </span>
        <span className="s-tags__title">{shelfTab === "tags" ? t("tags") : t("propsShelf")}</span>
        <span className="s-tags__total">{localeNum(shelfTab === "tags" ? tags.length : propCount)}</span>
      </button>
      {/* The shelf's two faces. A tab each, beside the fold: the tags or
          the properties, never both stacked. Admin only for the second —
          a visitor's sidebar has no properties to browse. */}
      {!tagsCollapsed && admin && (
        <div className="s-shelf__tabs" role="tablist" aria-label={t("tags") + " · " + t("propsShelf")}>
          <button type="button" role="tab" className={`s-shelf__tab${shelfTab === "tags" ? " is-on" : ""}`} aria-selected={shelfTab === "tags"} onClick={() => setShelfTab("tags")}>
            {t("tags")}
          </button>
          <button type="button" role="tab" className={`s-shelf__tab${shelfTab === "props" ? " is-on" : ""}`} aria-selected={shelfTab === "props"} onClick={() => setShelfTab("props")}>
            {t("propsShelf")}
          </button>
        </div>
      )}
      {!tagsCollapsed && shelfTab === "tags" && (
        <button
          type="button"
          className="s-tags__sort"
          onClick={() => {
            const next: TagSort = tagSort === "count" ? "name" : "count";
            setTagSort(next);
            try {
              localStorage.setItem(TAG_SORT_KEY, next);
            } catch {
              // storage unavailable
            }
          }}
          title={t(tagSort === "count" ? "tagsSortByName" : "tagsSortByCount")}
          aria-label={t(tagSort === "count" ? "tagsSortByName" : "tagsSortByCount")}
        >
          {tagSort === "count" ? "#↓" : "A→Z"}
        </button>
      )}
      {!tagsCollapsed && shelfTab === "tags" && (
      /* ONE TAB STOP FOR THE WHOLE TAG SHELF, for the reason the tree
         beside it is one: on the 1,388-note fixture this list is 113
         pills, and 113 plain buttons made the sidebar 120 tab stops —
         measured, the first control PAST the pane arrived at stop #121,
         and arrives at #10 now. Same argument, same pane; the tree took
         it and this list had not. A single-select listbox is
         what it already behaves like (one tag filters, clicking it again
         clears), so the roles say so and `aria-selected` carries the state
         the gold pill was carrying alone. Roving tabindex rather than
         `aria-activedescendant`: these are real buttons, there are a
         hundred of them and not a thousand, and moving the stop is one
         attribute on two nodes. */
      <div
        className="s-tags__list"
        role="listbox"
        aria-label={t("tags")}
        onKeyDown={onTagsKeyDown}
        ref={tagListRef}
      >
        {tagRows.map(({ node, depth }) => {
          const tag = node.tag;
          const count = node.count;
          const active = query.trim() === `#${tag}`;
          const branch = node.children.length > 0;
          return (
          <span key={tag} className={`s-tag__row${depth > 0 || (branch && openTags.has(tag)) ? " s-tag__row--full" : ""}`} style={depth > 0 ? { paddingInlineStart: `${depth * 14}px` } : undefined}>
          {branch && (
            <button
              type="button"
              className={`s-tag__branch${openTags.has(tag) ? " s-tag__branch--open" : ""}`}
              aria-label={tf(openTags.has(tag) ? "tagsCloseBranch" : "tagsOpenBranch", { tag })}
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                toggleBranch(tag);
              }}
            >
              ›
            </button>
          )}
          <button
            type="button"
            role="option"
            data-tag={tag}
            aria-selected={active}
            tabIndex={tag === tagStop ? 0 : -1}
            className={active ? "s-tag s-tag--active" : "s-tag"}
            onClick={() => {
              // The stop follows the pointer too, so the arrows continue
              // from where the reader last clicked (the tree does the
              // same on mousedown, for the same reason).
              setTagCursor(tag);
              setQuery(active ? "" : `#${tag}`);
            }}
            title={tf(active ? "clearTagFilter" : "searchTag", { tag })}
            /* A TAG IS A THING YOU CAN RENAME. It was the one object in
               this sidebar with no verbs on it at all — Obsidian's sixth
               most-requested feature, eight years old — and right-clicking
               the pill is where every reader already looks for it. */
            onContextMenu={(e) => {
              if (!useStore.getState().admin) return;
              e.preventDefault();
              e.stopPropagation();
              setTagCursor(tag);
              setTagMenu({ x: e.clientX, y: e.clientY, tag });
            }}
          >
            {/* The hash belongs TO the tag name, so the two share one
                bidi isolate: without it the RTL shell drew a Latin tag as
                "baby #", the hash flush against the pill's right edge.
                The count stays outside the isolate — it is chrome, and
                keeps the pill's own inline order. Same rendering as the
                blog's .s-blog-chip. */}
            <bdi className="s-tag__name">
              <span className="s-tag__hash" aria-hidden="true">#</span>
              {depth > 0 ? tagLabel(tag).split("/").pop() : tagLabel(tag)}
            </bdi>
            <span className="s-tag__count">{localeNum(count)}</span>
          </button>
          </span>
          );
        })}
      </div>
      )}
      {/* OUTSIDE the listbox: a control that is not one of the options may
          not sit among them. It is one extra tab stop and it earns it —
          the shelf's whole tail lives behind it. */}
      {!tagsCollapsed && shelfTab === "tags" && shownTags.length < tags.length && (
        <button
          type="button"
          className="s-tags__more"
          onClick={() => setAllTags(true)}
        >
          {tf("showMoreRows", { count: localeNum(tags.length - shownTags.length) })}
        </button>
      )}
      {!tagsCollapsed && admin && shelfTab === "props" && (
        <Suspense fallback={null}>
          <PropsShelf query={query} setQuery={setQuery} embedded onCount={setPropCount} />
        </Suspense>
      )}
    </div>
  );
}
