// THE SIDE PANEL'S STACK — the DOM half of client/sidePanel.ts.
//
// Every section of the panel is a <PanelSection>: a header that folds it (a
// button with aria-expanded, its title and its count) and a body that is a
// labelled region. The stack around them owns the folds and the order:
//
//   · Every open section shows its whole content at its own height. Nothing
//     inside the panel scrolls on its own; when the open sections are taller
//     than the window, the panel scrolls as a whole, and a section that is in
//     the way folds under its header. A list that can run long (backlinks,
//     unlinked mentions, history) shows its first rows and a "Show N more"
//     button (`useShowMore`), never a box of its own to scroll.
//   · A header dragged up or down moves its section; Alt+↑/↓ on a focused
//     header does it from the keyboard. The DOM order IS the order, so the tab
//     order follows what the eye sees.
//
// Outside a stack (the phone's history page renders the history section on
// its own), a section is simply open, with a plain header.

import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { localeNum, t, tf } from "../i18n.ts";
import { isCollapsed, moveSection, parseStackPrefs, serializeStackPrefs, type SectionId, type StackPrefs } from "../sidePanel.ts";

/** Pointer travel before a press on a header becomes a reorder. */
const REORDER_AT = 6;

interface Parts {
  root: HTMLElement;
  toggle: HTMLElement | null;
}

interface StackApi {
  collapsed: (id: SectionId) => boolean;
  setCollapsed: (id: SectionId, value: boolean) => void;
  register: (id: SectionId, parts: Parts) => () => void;
  dragging: SectionId | null;
  onHeadDown: (id: SectionId, e: ReactPointerEvent<HTMLElement>) => void;
  onHeadKey: (id: SectionId, e: ReactKeyboardEvent<HTMLElement>) => void;
  takeClick: () => boolean;
  /** The sections on screen, in order. */
  present: SectionId[];
  setAll: (collapsed: boolean) => void;
}

const StackContext = createContext<StackApi | null>(null);

/** The stack a toolbar or a section is inside, or null outside one. */
export function usePanelStack(): StackApi | null {
  return useContext(StackContext);
}

/** A section's fold, for the component that draws it — so it can stop
 *  fetching or animating while it is folded, and open itself on request. */
export function usePanelSection(id: SectionId): { collapsed: boolean; setCollapsed: (value: boolean) => void } {
  const api = useContext(StackContext);
  return {
    collapsed: api ? api.collapsed(id) : false,
    setCollapsed: (value) => api?.setCollapsed(id, value),
  };
}

function readStored(key: string, legacy?: (id: SectionId) => boolean | null): StackPrefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    // private window: the defaults, for this session
  }
  return parseStackPrefs(raw, legacy);
}

export interface StackSection {
  id: SectionId;
  node: ReactNode;
}

export function PanelStack({
  storageKey,
  legacy,
  sections,
  head,
  className,
}: {
  /** Where the order and the folds are kept (this browser, this vault:
   *  localStorage is per origin, and every vault is its own). */
  storageKey: string;
  legacy?: (id: SectionId) => boolean | null;
  sections: StackSection[];
  head?: ReactNode;
  className?: string;
}) {
  const [prefs, setPrefs] = useState<StackPrefs>(() => readStored(storageKey, legacy));
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const firstWrite = useRef(true);
  useEffect(() => {
    if (firstWrite.current) {
      firstWrite.current = false;
      return;
    }
    try {
      localStorage.setItem(storageKey, serializeStackPrefs(prefs));
    } catch {
      // storage full or unavailable: the layout still holds for this session
    }
  }, [prefs, storageKey]);

  const stackRef = useRef<HTMLDivElement | null>(null);
  const reg = useRef(new Map<SectionId, Parts>());
  const [present, setPresent] = useState<SectionId[]>([]);
  const [dragging, setDragging] = useState<SectionId | null>(null);
  const [dropY, setDropY] = useState<number | null>(null);
  const suppressClick = useRef(false);
  const refocus = useRef<SectionId | null>(null);

  const visible = useCallback((): SectionId[] => prefsRef.current.order.filter((id) => reg.current.has(id)), []);

  // A reorder re-mounts nothing, but the moved header must keep the focus.
  useLayoutEffect(() => {
    const id = refocus.current;
    if (id) {
      refocus.current = null;
      reg.current.get(id)?.toggle?.focus();
    }
  }, [prefs]);

  const register = useCallback((id: SectionId, parts: Parts) => {
    reg.current.set(id, parts);
    setPresent((list) => (list.includes(id) ? list : [...list, id]));
    return () => {
      if (reg.current.get(id) === parts) reg.current.delete(id);
      setPresent((list) => list.filter((x) => x !== id));
    };
  }, []);

  const setCollapsed = useCallback((id: SectionId, value: boolean) => {
    setPrefs((p) => (isCollapsed(p, id) === value ? p : { ...p, collapsed: { ...p.collapsed, [id]: value } }));
  }, []);

  const setAll = useCallback(
    (value: boolean) => {
      setPrefs((p) => {
        const collapsed = { ...p.collapsed };
        for (const id of visible()) collapsed[id] = value;
        return { ...p, collapsed };
      });
    },
    [visible],
  );

  const onHeadDown = useCallback(
    (id: SectionId, e: ReactPointerEvent<HTMLElement>) => {
      const stack = stackRef.current;
      // A finger on a header is a tap or the start of a scroll, never a drag.
      if (!stack || e.button !== 0 || e.pointerType === "touch") return;
      const handle = e.currentTarget;
      const pointer = e.pointerId;
      const y0 = e.clientY;
      const shown = visible();
      const others = shown.filter((x) => x !== id);
      if (others.length === 0) return;
      let active = false;
      let target = -1;
      const rectOf = (x: SectionId) => reg.current.get(x)?.root.getBoundingClientRect();
      const move = (ev: PointerEvent): void => {
        if (!active) {
          if (Math.abs(ev.clientY - y0) < REORDER_AT) return;
          active = true;
          handle.setPointerCapture(pointer);
          setDragging(id);
        }
        let idx = 0;
        for (const o of others) {
          const r = rectOf(o);
          if (r && ev.clientY > r.top + r.height / 2) idx++;
        }
        target = idx;
        const base = stack.getBoundingClientRect().top - stack.scrollTop;
        const edge = idx < others.length ? rectOf(others[idx])?.top : rectOf(others[others.length - 1])?.bottom;
        setDropY(edge === undefined ? null : Math.round(edge - base));
      };
      const finish = (keep: boolean): void => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("keydown", esc, true);
        if (!active) return;
        suppressClick.current = true;
        setDragging(null);
        setDropY(null);
        if (keep && target >= 0) {
          refocus.current = id;
          setPrefs((p) => ({ ...p, order: moveSection(p.order, shown, id, target) }));
        }
      };
      const up = (): void => finish(true);
      const cancel = (): void => finish(false);
      const esc = (ev: KeyboardEvent): void => {
        if (ev.key !== "Escape" || !active) return;
        ev.preventDefault();
        ev.stopPropagation();
        finish(false);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("keydown", esc, true);
    },
    [visible],
  );

  const onHeadKey = useCallback(
    (id: SectionId, e: ReactKeyboardEvent<HTMLElement>) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const shown = visible();
      const from = shown.indexOf(id);
      const to = from + (e.key === "ArrowUp" ? -1 : 1);
      e.preventDefault();
      if (from < 0 || to < 0 || to >= shown.length) return;
      refocus.current = id;
      setPrefs((p) => ({ ...p, order: moveSection(p.order, shown, id, to) }));
    },
    [visible],
  );

  const takeClick = useCallback(() => {
    const was = suppressClick.current;
    suppressClick.current = false;
    return was;
  }, []);

  const ordered = useMemo(() => {
    const byId = new Map(sections.map((s) => [s.id, s]));
    return prefs.order.map((id) => byId.get(id)).filter((s): s is StackSection => s !== undefined);
  }, [prefs.order, sections]);
  const presentInOrder = useMemo(() => prefs.order.filter((id) => present.includes(id)), [prefs.order, present]);

  const api = useMemo<StackApi>(
    () => ({
      collapsed: (id) => isCollapsed(prefs, id),
      setCollapsed,
      register,
      dragging,
      onHeadDown,
      onHeadKey,
      takeClick,
      present: presentInOrder,
      setAll,
    }),
    [dragging, onHeadDown, onHeadKey, prefs, presentInOrder, register, setAll, setCollapsed, takeClick],
  );

  return (
    <StackContext.Provider value={api}>
      {head}
      <div ref={stackRef} className={`s-pstack${dragging ? " s-pstack--reorder" : ""}${className ? ` ${className}` : ""}`}>
        {ordered.map((s) => (
          <Fragment key={s.id}>{s.node}</Fragment>
        ))}
        {dropY !== null && <div className="s-pstack__drop" style={{ top: dropY }} aria-hidden="true" />}
      </div>
    </StackContext.Provider>
  );
}

/** One section: a header that folds it, and its body at its own height.
 *  `count` null hides the badge. */
export function PanelSection({
  id,
  title,
  count = null,
  actions,
  hint,
  className,
  children,
}: {
  id: SectionId;
  title: string;
  count?: number | string | null;
  actions?: ReactNode;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  const api = useContext(StackContext);
  const uid = useId();
  const headId = `${uid}-head`;
  const bodyId = `${uid}-body`;
  const rootRef = useRef<HTMLElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const collapsed = api ? api.collapsed(id) : false;

  const register = api?.register;
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!register || !root) return;
    return register(id, { root, toggle: toggleRef.current });
  }, [register, id]);

  const label = typeof count === "number" ? localeNum(count) : count;
  const badge = label !== null && label !== "" ? <span className="s-panel-count">{label}</span> : null;
  const open = !collapsed;

  return (
    <section
      ref={rootRef}
      className={`s-psec${collapsed ? " s-psec--collapsed" : ""}${api?.dragging === id ? " s-psec--lifted" : ""}${className ? ` ${className}` : ""}`}
      data-section={id}
      title={hint}
    >
      <header className="s-panel-header s-psec__head">
        {api ? (
          <button
            ref={toggleRef}
            type="button"
            id={headId}
            className="s-psec__toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            title={tf(open ? "sectionHide" : "sectionShow", { name: title })}
            onPointerDown={(e) => api.onHeadDown(id, e)}
            onKeyDown={(e) => api.onHeadKey(id, e)}
            onClick={() => {
              if (api.takeClick()) return;
              api.setCollapsed(id, open);
            }}
          >
            <span className={`s-tree__chevron${open ? " s-tree__chevron--open" : ""}`} aria-hidden="true">
              ›
            </span>
            <span className="s-panel-title">{title}</span>
            {badge}
          </button>
        ) : (
          <span id={headId} className="s-psec__toggle s-psec__toggle--static">
            <span className="s-panel-title">{title}</span>
            {badge}
          </span>
        )}
        {open && actions}
      </header>
      <div id={bodyId} className="s-psec__body" role={open ? "region" : undefined} aria-labelledby={open ? headId : undefined} hidden={!open}>
        {open && children}
      </div>
    </section>
  );
}

/** How many rows a long list in a section shows before "Show N more". */
export const LIST_FIRST = 20;
/** How many more each press of it adds. */
export const LIST_STEP = 50;

/** The first rows of a list that can run long, and the button that shows
 *  more. The count comes back to LIST_FIRST when `resetKey` (the note)
 *  changes, so a long list opened once does not stay long on every note. */
export function useShowMore<T>(rows: readonly T[], resetKey: unknown): { shown: readonly T[]; more: ReactNode } {
  const [limit, setLimit] = useState(LIST_FIRST);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    setKey(resetKey);
    setLimit(LIST_FIRST);
  }
  const hidden = rows.length - limit;
  return {
    shown: hidden > 0 ? rows.slice(0, limit) : rows,
    more:
      hidden > 0 ? (
        <button type="button" className="s-psec__more" onClick={() => setLimit((n) => n + LIST_STEP)}>
          {tf("showMoreRows", { count: localeNum(Math.min(hidden, LIST_STEP)) })}
        </button>
      ) : null,
  };
}

/** Fold everything, or open everything: one button that says which. */
export function StackFoldAll() {
  const api = usePanelStack();
  if (!api || api.present.length === 0) return null;
  const anyOpen = api.present.some((id) => !api.collapsed(id));
  const label = t(anyOpen ? "sectionCollapseAll" : "sectionExpandAll");
  return (
    <button type="button" className="s-pstack__foldall s-iconbtn" onClick={() => api.setAll(anyOpen)} title={label} aria-label={label}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {anyOpen ? <path d="M7 4l5 5 5-5M7 20l5-5 5 5" /> : <path d="M7 9l5-5 5 5M7 15l5 5 5-5" />}
      </svg>
    </button>
  );
}
