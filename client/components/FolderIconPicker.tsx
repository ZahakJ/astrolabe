// THE FOLDER ICON PICKER — the whole UI for choosing a folder's mark.
//
// WHY IT IS NOT A SETTINGS ROW. A folder's glyph is a property OF THAT
// FOLDER, and the place a reader is when they want to change it is the folder
// itself, in the tree. So it hangs off the context menu, beside Rename — the
// other verb that belongs to the folder rather than to the instance. The
// settings panel's public-folder rows open the same popover from a button, so
// there is one way to choose a glyph and not two.
//
// THREE HUNDRED GLYPHS NEED A SEARCH. The first cut was a grid of twenty and
// no field; a grid of three hundred is a wall. So: a search field on top that
// has focus the moment the popover opens (type "tel" and the telescope is the
// first cell), and under it the set on nine shelves by subject, scrolling,
// with the folder's current mark ringed and scrolled into view. The footer
// says which glyph the pointer or the arrows are on — at 16px a drawing is a
// guess and its name is the answer — and holds "No icon", which is a
// different KIND of act from choosing one and gets a row of its own.
//
// It is anchored, not modal: the row it describes must stay visible behind it.
// Positioning, edge-folding and Escape follow the context menu's own rules
// (anchorPopover.ts) so the two feel like one surface — because they are:
// one opens the other, at the same point on the screen.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { FOLDER_ICON_ENTRIES, type FolderIconEntry } from "../../shared/folderIconCatalog.ts";
import { FOLDER_ICON_KEYS } from "../../shared/folderIconPaths.ts";
import type { FolderIcon } from "../../shared/folderIcons.ts";
import { FOLDER_ICON_GROUPS, folderIconGroupLabel, folderIconLabel } from "../folderIconLabels.ts";
import { getLang, t, tf } from "../i18n.ts";
import { anchorPopover } from "./anchorPopover.ts";
import FolderGlyph from "./FolderGlyph.tsx";
// The popover's styles travel with this chunk, not with app.css — see the
// sheet's own header for why.
import "../styles/foldericons.css";

export interface IconPickState {
  /** Vault-relative folder path being marked (or any key the caller uses to
   *  tell one picker from another). Never "" for a tree folder — the vault
   *  root is not a folder anyone can put a glyph on. */
  path: string;
  /** The folder's own name, for the popover's title. */
  name: string;
  /** What it wears now, or null. */
  current: FolderIcon | null;
  x: number;
  y: number;
  /** Opened from the keyboard, so focus must come back to the tree on close. */
  fromKeyboard: boolean;
}

/** Cells per row — also the arrow keys' vertical stride, so the two are read
 *  from ONE place. A coarse pointer gets 44px cells and one fewer of them. */
function columns(): number {
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches ? 6 : 7;
}

const fold = (s: string): string => s.toLocaleLowerCase().normalize("NFKD").replace(/[ً-ْـ]/g, "");

/** The entries a query matches, best first: a name that STARTS with the
 *  words, then one that contains them, then a search key. Both languages are
 *  searched whatever the chrome language — a reader may type "book" into an
 *  Arabic panel and mean it. */
function search(query: string): FolderIconEntry[] {
  const q = fold(query.trim());
  if (!q) return [];
  const scored: { entry: FolderIconEntry; score: number }[] = [];
  for (const entry of FOLDER_ICON_ENTRIES) {
    const en = fold(entry.en);
    const ar = fold(entry.ar);
    const name = entry.name.replace(/-/g, " ");
    let score = -1;
    if (en.startsWith(q) || ar.startsWith(q) || name.startsWith(q)) score = 0;
    else if (en.includes(q) || ar.includes(q) || name.includes(q)) score = 1;
    else if ((FOLDER_ICON_KEYS[entry.name] ?? "").includes(q)) score = 2;
    if (score >= 0) scored.push({ entry, score });
  }
  return scored.sort((a, b) => a.score - b.score).map((s) => s.entry);
}

export default function FolderIconPicker({
  state,
  onPick,
  onClose,
}: {
  state: IconPickState;
  /** null clears the folder's mark. */
  onPick(icon: FolderIcon | null): void;
  onClose(): void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  // What the footer names: the cell under the pointer or the arrows, else
  // the current mark.
  const [named, setNamed] = useState<FolderIcon | null>(state.current);
  const cols = useMemo(columns, []);

  // The visible cells, flat, in reading order — the roving tab stop walks this
  // list whether it is shelved or a search result.
  const shelves = useMemo(() => {
    if (query.trim()) return [{ id: null, icons: search(query) }];
    return FOLDER_ICON_GROUPS.map((g) => ({ id: g.id, icons: g.icons }));
  }, [query]);
  const flat = useMemo(() => shelves.flatMap((s) => s.icons.map((e) => e.name as FolderIcon)), [shelves]);
  const [at, setAt] = useState(() => Math.max(0, flat.indexOf(state.current as FolderIcon)));
  useEffect(() => {
    setAt((i) => (i < flat.length ? i : 0));
  }, [flat]);

  // Placed once per anchor; the list scrolls inside a fixed box so a search
  // that shortens it never moves the popover under the reader's hand.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    anchorPopover(el, state.x, state.y);
    inputRef.current?.focus();
    // The current mark, in view: a reader changing "telescope" to something
    // near it should see where they are.
    el.querySelector<HTMLElement>(".s-tree-iconpick__cell--on")?.scrollIntoView({ block: "center" });
  }, [state.x, state.y]);

  // Click-out and Escape, exactly as the context menu closes.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const focusCell = (i: number) => {
    const n = Math.max(0, Math.min(flat.length - 1, i));
    setAt(n);
    setNamed(flat[n] ?? null);
    const cell = listRef.current?.querySelectorAll<HTMLButtonElement>(".s-tree-iconpick__cell")[n];
    cell?.focus();
    cell?.scrollIntoView({ block: "nearest" });
  };

  const onGridKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // The horizontal arrows are PHYSICAL keys on a logical grid: in Arabic the
    // first cell is on the right, so ArrowRight must walk backwards or the
    // reader's arrow and the reader's eye disagree.
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    switch (e.key) {
      case "ArrowRight":
        focusCell(at + (rtl ? -1 : 1));
        break;
      case "ArrowLeft":
        focusCell(at + (rtl ? 1 : -1));
        break;
      case "ArrowDown":
        focusCell(at + cols);
        break;
      case "ArrowUp":
        // Off the top of the grid is the search field.
        if (at < cols) inputRef.current?.focus();
        else focusCell(at - cols);
        break;
      case "Home":
        focusCell(0);
        break;
      case "End":
        focusCell(flat.length - 1);
        break;
      case "Tab":
        // A popover is not a tab ring. Tab leaves and closes, like the menu.
        onClose();
        return;
      case "Backspace":
        inputRef.current?.focus();
        return;
      default:
        // Typing on the grid is typing INTO the search: the reader does not
        // have to find the field first.
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          setQuery((q) => q + e.key);
          inputRef.current?.focus();
          break;
        }
        return;
    }
    e.preventDefault();
  };

  const onInputKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusCell(0);
    } else if (e.key === "Enter") {
      // Enter on a search takes its first answer — "tel⏎" is the telescope.
      e.preventDefault();
      if (flat[0] !== undefined) onPick(flat[0]);
    } else if (e.key === "Tab") {
      onClose();
    }
  };

  const lang = getLang();
  const namedEntry = named ? FOLDER_ICON_ENTRIES.find((e) => e.name === named) : undefined;
  let cellIndex = -1;

  return (
    <div
      ref={ref}
      className="s-tree-iconpick"
      role="dialog"
      aria-label={tf("folderIconFor", { name: state.name })}
      // Physical `left`, like the context menu one line of code away: this is
      // a viewport coordinate the effect above has already resolved for the
      // reading direction, not a box inside a flow.
      style={{ left: state.x, top: state.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="s-tree-iconpick__title" dir="auto">
        {state.name}
      </div>
      <input
        ref={inputRef}
        className="s-tree-iconpick__search"
        type="search"
        value={query}
        dir="auto"
        placeholder={t("folderIconSearch")}
        aria-label={t("folderIconSearch")}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onInputKey}
      />
      <div
        ref={listRef}
        className="s-tree-iconpick__list"
        role="radiogroup"
        aria-label={t("folderIcon")}
        onKeyDown={onGridKey}
        onMouseLeave={() => setNamed(flat[at] ?? state.current)}
      >
        {flat.length === 0 && <p className="s-tree-iconpick__none">{t("folderIconNoMatch")}</p>}
        {shelves.map((shelf) =>
          shelf.icons.length === 0 ? null : (
            <div key={shelf.id ?? "search"} className="s-tree-iconpick__shelf">
              {shelf.id && <div className="s-tree-iconpick__shelf-name">{folderIconGroupLabel(shelf.id)}</div>}
              <div className="s-tree-iconpick__grid" style={{ gridTemplateColumns: `repeat(${cols}, var(--cell))` }}>
                {shelf.icons.map((entry) => {
                  const icon = entry.name as FolderIcon;
                  const i = ++cellIndex;
                  const on = state.current === icon;
                  const label = lang === "ar" ? entry.ar : entry.en;
                  return (
                    <button
                      key={icon}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={label}
                      title={label}
                      tabIndex={at === i ? 0 : -1}
                      className={`s-tree-iconpick__cell${on ? " s-tree-iconpick__cell--on" : ""}`}
                      onMouseEnter={() => setNamed(icon)}
                      onFocus={() => {
                        setAt(i);
                        setNamed(icon);
                      }}
                      onClick={() => onPick(icon)}
                    >
                      <FolderGlyph icon={icon} size={17} />
                    </button>
                  );
                })}
              </div>
            </div>
          ),
        )}
      </div>
      <div className="s-tree-iconpick__foot">
        <span className="s-tree-iconpick__named" dir="auto">
          {namedEntry ? (
            <>
              <FolderGlyph icon={namedEntry.name} size={14} />
              {lang === "ar" ? namedEntry.ar : namedEntry.en}
            </>
          ) : state.current ? (
            folderIconLabel(state.current)
          ) : (
            t("folderIconNone")
          )}
        </span>
        <button
          type="button"
          className={`s-tree-iconpick__clear${state.current === null ? " s-tree-iconpick__clear--on" : ""}`}
          aria-pressed={state.current === null}
          onClick={() => onPick(null)}
        >
          {t("folderIconNone")}
        </button>
      </div>
    </div>
  );
}
