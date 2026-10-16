// THE SIDE PANEL'S STACK — the DOM half of client/sidePanel.ts.
//
// Every section of the panel is a <PanelSection>: a header that folds it (a
// button with aria-expanded, its title and its count) and a body that is a
// labelled region. The stack around them owns what used to be eleven separate
// collapse flags, the order, and the heights:
//
//   · The stack itself never scrolls. Each open body gets a height from
//     `layoutStack` and scrolls inside itself, with the shared edge fade, so no
//     header is ever below somebody else's list. (The one exception is a panel
//     too short for every open section's minimum; then the stack scrolls as a
//     whole, which is still better than a section nobody can reach.)
//   · A splitter sits above each open section that has an open section above
//     it. Dragging it hands height across (`dragSplit`); double-clicking it
//     forgets every dragged height; it is a focusable separator, so the arrow
//     keys do the same.
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
import { attachScrollFade } from "../scrollFade.ts";
import {
  dragSplit,
  isCollapsed,
  layoutStack,
  moveSection,
  parseStackPrefs,
  serializeStackPrefs,
  splitValue,
  type SectionId,
  type StackPrefs,
} from "../sidePanel.ts";

/** How long a folding body keeps its content while it animates shut. */
const FOLD_MS = 170;
/** Pointer travel before a press on a header becomes a reorder. */
const REORDER_AT = 6;
const KEY_STEP = 16;
const KEY_STEP_BIG = 64;

interface Parts {
  root: HTMLElement;
  body: HTMLElement;
  content: HTMLElement;
  toggle: HTMLElement | null;
  fill: boolean;
}

interface Placed {
  ids: SectionId[];
  heights: number[];
  mins: number[];
  caps: number[];
}

interface StackApi {
  resizable: boolean;
  collapsed: (id: SectionId) => boolean;
  setCollapsed: (id: SectionId, value: boolean) => void;
  register: (id: SectionId, parts: Parts) => () => void;
  splitAbove: (id: SectionId) => boolean;
  dragging: SectionId | null;
  onSplitDown: (id: SectionId, e: ReactPointerEvent<HTMLElement>) => void;
  onSplitKey: (id: SectionId, e: ReactKeyboardEvent<HTMLElement>) => void;
  resetSizes: () => void;
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

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
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
  resizable,
  sections,
  head,
  className,
}: {
  /** Where the order, the folds and the heights are kept (this browser, this
   *  vault: localStorage is per origin, and every vault is its own). */
  storageKey: string;
  legacy?: (id: SectionId) => boolean | null;
  /** Splitters and shared height (the desktop pane). Without it the sections
   *  simply flow, and whatever holds the stack scrolls (the phone's sheet). */
  resizable: boolean;
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
  const [splits, setSplits] = useState("");
  const [dragging, setDragging] = useState<SectionId | null>(null);
  const [dropY, setDropY] = useState<number | null>(null);
  const placed = useRef<Placed | null>(null);
  const suppressClick = useRef(false);
  const refocus = useRef<SectionId | null>(null);
  const frame = useRef(0);
  const ro = useRef<ResizeObserver | null>(null);

  const visible = useCallback((): SectionId[] => prefsRef.current.order.filter((id) => reg.current.has(id)), []);

  const apply = useCallback((ids: SectionId[], heights: number[]) => {
    ids.forEach((id, i) => {
      const parts = reg.current.get(id);
      if (parts) parts.body.style.height = `${heights[i]}px`;
    });
    for (let i = 1; i < ids.length; i++) {
      const split = reg.current.get(ids[i])?.root.querySelector<HTMLElement>(":scope > .s-psec__split");
      if (split) split.setAttribute("aria-valuenow", String(splitValue(heights[i - 1], heights[i])));
    }
  }, []);

  const relayout = useCallback(() => {
    frame.current = 0;
    const stack = stackRef.current;
    if (!stack || !resizable) return;
    const ids = visible();
    const open = ids.filter((id) => !isCollapsed(prefsRef.current, id));
    let chrome = 0;
    for (const id of ids) {
      const parts = reg.current.get(id);
      if (!parts) continue;
      chrome += parts.root.offsetHeight - parts.body.offsetHeight;
      if (isCollapsed(prefsRef.current, id)) parts.body.style.height = "0px";
    }
    const boxes = open.map((id) => {
      const parts = reg.current.get(id);
      return {
        natural: parts?.content.offsetHeight ?? 0,
        fill: parts?.fill ?? false,
        stored: prefsRef.current.sizes[id],
      };
    });
    const out = layoutStack(stack.clientHeight - chrome, boxes);
    placed.current = { ids: open, heights: out.heights, mins: out.mins, caps: out.caps };
    apply(open, out.heights);
    stack.classList.toggle("s-pstack--overflow", out.overflow);
    const key = open.slice(1).join(" ");
    setSplits((prev) => (prev === key ? prev : key));
  }, [apply, resizable, visible]);

  const schedule = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(relayout);
  }, [relayout]);

  useLayoutEffect(() => {
    const stack = stackRef.current;
    if (!stack || !resizable) return;
    const observer = new ResizeObserver(schedule);
    ro.current = observer;
    observer.observe(stack);
    for (const parts of reg.current.values()) observer.observe(parts.content);
    // The first layout lands without animating; after it, every change does.
    relayout();
    const settle = requestAnimationFrame(() => stack.classList.remove("s-pstack--still"));
    return () => {
      observer.disconnect();
      ro.current = null;
      cancelAnimationFrame(settle);
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [relayout, resizable, schedule]);

  // A fold, a reorder or a forgotten size changes the layout's inputs without
  // changing a single observed box.
  useLayoutEffect(() => {
    if (resizable) relayout();
    const id = refocus.current;
    if (id) {
      refocus.current = null;
      reg.current.get(id)?.toggle?.focus();
    }
  }, [prefs, present, relayout, resizable]);

  const register = useCallback((id: SectionId, parts: Parts) => {
    reg.current.set(id, parts);
    ro.current?.observe(parts.content);
    setPresent((list) => (list.includes(id) ? list : [...list, id]));
    return () => {
      if (reg.current.get(id) === parts) reg.current.delete(id);
      ro.current?.unobserve(parts.content);
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

  const resetSizes = useCallback(() => setPrefs((p) => ({ ...p, sizes: {} })), []);

  /** Keep the heights a drag (or a key) left — every open section's, not
   *  only the two it moved: a section left to size itself would ask for its
   *  whole content on the next layout, and the sharing that follows would
   *  hand back the very height the reader just took from it. */
  const commit = useCallback((ids: SectionId[], after: number[]) => {
    setPrefs((p) => {
      const sizes = { ...p.sizes };
      ids.forEach((id, i) => {
        sizes[id] = after[i];
      });
      return { ...p, sizes };
    });
  }, []);

  const onSplitDown = useCallback(
    (id: SectionId, e: ReactPointerEvent<HTMLElement>) => {
      const at = placed.current;
      const stack = stackRef.current;
      if (!at || !stack || e.button !== 0) return;
      const index = at.ids.indexOf(id);
      if (index <= 0) return;
      e.preventDefault();
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);
      const y0 = e.clientY;
      const start = { ...at, heights: [...at.heights] };
      let next = start.heights;
      stack.classList.add("s-pstack--drag");
      const move = (ev: PointerEvent): void => {
        next = dragSplit(start.heights, start.mins, start.caps, index, ev.clientY - y0);
        apply(start.ids, next);
      };
      const end = (): void => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        stack.classList.remove("s-pstack--drag");
        if (next !== start.heights) commit(start.ids, next);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
    },
    [apply, commit],
  );

  const onSplitKey = useCallback(
    (id: SectionId, e: ReactKeyboardEvent<HTMLElement>) => {
      const at = placed.current;
      if (!at) return;
      const index = at.ids.indexOf(id);
      if (index <= 0) return;
      const step = e.shiftKey ? KEY_STEP_BIG : KEY_STEP;
      const delta =
        e.key === "ArrowUp" ? -step
        : e.key === "ArrowDown" ? step
        : e.key === "PageUp" ? -KEY_STEP_BIG
        : e.key === "PageDown" ? KEY_STEP_BIG
        : e.key === "Home" ? -100_000
        : e.key === "End" ? 100_000
        : 0;
      if (e.key === "Enter") {
        e.preventDefault();
        resetSizes();
        return;
      }
      if (delta === 0) return;
      e.preventDefault();
      const next = dragSplit(at.heights, at.mins, at.caps, index, delta);
      apply(at.ids, next);
      commit(at.ids, next);
    },
    [apply, commit, resetSizes],
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

  const splitSet = useMemo(() => new Set(splits.split(" ").filter(Boolean)), [splits]);
  const ordered = useMemo(() => {
    const byId = new Map(sections.map((s) => [s.id, s]));
    return prefs.order.map((id) => byId.get(id)).filter((s): s is StackSection => s !== undefined);
  }, [prefs.order, sections]);
  const presentInOrder = useMemo(() => prefs.order.filter((id) => present.includes(id)), [prefs.order, present]);

  const api = useMemo<StackApi>(
    () => ({
      resizable,
      collapsed: (id) => isCollapsed(prefs, id),
      setCollapsed,
      register,
      splitAbove: (id) => resizable && splitSet.has(id),
      dragging,
      onSplitDown,
      onSplitKey,
      resetSizes,
      onHeadDown,
      onHeadKey,
      takeClick,
      present: presentInOrder,
      setAll,
    }),
    [dragging, onHeadDown, onHeadKey, onSplitDown, onSplitKey, prefs, presentInOrder, register, resetSizes, resizable, setAll, setCollapsed, splitSet, takeClick],
  );

  return (
    <StackContext.Provider value={api}>
      {head}
      <div
        ref={stackRef}
        className={`s-pstack ${resizable ? "s-pstack--sized s-pstack--still" : "s-pstack--flow"}${dragging ? " s-pstack--reorder" : ""}${className ? ` ${className}` : ""}`}
      >
        {ordered.map((s) => (
          <Fragment key={s.id}>{s.node}</Fragment>
        ))}
        {dropY !== null && <div className="s-pstack__drop" style={{ top: dropY }} aria-hidden="true" />}
      </div>
    </StackContext.Provider>
  );
}

/** One section: header, splitter, body. `count` null hides the badge;
 *  `fill` makes the body take whatever height it is given (the graph). */
export function PanelSection({
  id,
  title,
  count = null,
  actions,
  hint,
  className,
  fill = false,
  children,
}: {
  id: SectionId;
  title: string;
  count?: number | string | null;
  actions?: ReactNode;
  hint?: string;
  className?: string;
  fill?: boolean;
  children: ReactNode;
}) {
  const api = useContext(StackContext);
  const uid = useId();
  const headId = `${uid}-head`;
  const bodyId = `${uid}-body`;
  const rootRef = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const collapsed = api ? api.collapsed(id) : false;
  const [shown, setShown] = useState(!collapsed);

  useEffect(() => {
    if (!collapsed) {
      setShown(true);
      return;
    }
    if (!api?.resizable || reducedMotion()) {
      setShown(false);
      return;
    }
    // The content stays while the body closes over it, then goes.
    const timer = setTimeout(() => setShown(false), FOLD_MS);
    return () => clearTimeout(timer);
  }, [collapsed, api?.resizable]);

  const register = api?.register;
  useLayoutEffect(() => {
    const root = rootRef.current;
    const body = bodyRef.current;
    const content = contentRef.current;
    if (!register || !root || !body || !content) return;
    return register(id, { root, body, content, toggle: toggleRef.current, fill });
  }, [register, id, fill]);

  useEffect(() => attachScrollFade(bodyRef.current), []);

  const label = typeof count === "number" ? localeNum(count) : count;
  const badge = label !== null && label !== "" ? <span className="s-panel-count">{label}</span> : null;
  const open = !collapsed;

  return (
    <section
      ref={rootRef}
      className={`s-psec${fill ? " s-psec--fill" : ""}${collapsed ? " s-psec--collapsed" : ""}${api?.dragging === id ? " s-psec--lifted" : ""}${className ? ` ${className}` : ""}`}
      data-section={id}
      title={hint}
    >
      {api?.splitAbove(id) && (
        <div
          className="s-psec__split"
          role="separator"
          aria-orientation="horizontal"
          aria-label={tf("sectionResize", { name: title })}
          aria-controls={bodyId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={50}
          tabIndex={0}
          title={t("sectionResizeHint")}
          onPointerDown={(e) => api.onSplitDown(id, e)}
          onKeyDown={(e) => api.onSplitKey(id, e)}
          onDoubleClick={api.resetSizes}
        />
      )}
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
      <div
        ref={bodyRef}
        id={bodyId}
        className="s-psec__body s-scrollfade"
        role={open ? "region" : undefined}
        aria-labelledby={open ? headId : undefined}
      >
        <div ref={contentRef} className="s-psec__content">
          {(open || shown) && children}
        </div>
      </div>
    </section>
  );
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
