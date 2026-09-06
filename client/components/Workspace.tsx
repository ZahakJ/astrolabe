// The pane grid: columns along the inline axis, at most two panes stacked in
// each. `client/workspace.ts` is the model and is proven there; this file is
// only the shape it takes on screen.
//
// COLUMN ORDER IS READING ORDER, and nothing here says "left". `columns[0]` is
// the inline-START column and the grid lays them out with `grid-auto-flow:
// column`, so an Arabic instance mirrors for free — the same way the shell's
// own `"sidebar main panel"` areas already do. A layout saved in English opens
// correctly in Arabic with nothing about sides stored.
//
// FOCUS IS GEOMETRIC, though, and that is the one deliberate exception: the
// arrow that moves between panes is a fact about the SCREEN, not about reading
// order, so `paneInDirection()` resolves it from live rects. A reader pressing
// ← at a grid is pointing, not reading.

import { useEffect, useRef, type ReactNode } from "react";
import { t } from "../i18n.ts";
import { useStore } from "../state.ts";
import { paneInDirection, type PaneId } from "../workspace.ts";
import Pane from "./Pane.tsx";

// THE SPLIT GRIPS. The grid's 1px gap is the divider, and an 8px strip sits
// over it: between two columns, and between the two panes of a column. Drag
// it and the weights follow the hand; double-click and the pair is evened
// out. The owner and a friend asked for exactly this ("the resizing needs to
// be done even with split screen"; "ضروري الريسايز بالماوس").
//
// During the drag the grid's template is written straight onto the element
// and the store hears about it once, on release: a store write per pointer
// move would re-render every pane (and the editors inside them) sixty times
// a second for a line moving by a pixel.
const GRIP_MIN = 0.1;
const GRIP_MAX = 0.9;

function clampShare(x: number): number {
  return Math.min(GRIP_MAX, Math.max(GRIP_MIN, x));
}

/** The share of the pair's extent (`a` first, then `b`) that a pointer at
 *  `at` gives `a`. Reads the two live rects, so it is right for a mirrored
 *  (Arabic) grid where column 0 is on the RIGHT: whichever of the two starts
 *  first on screen is measured from, and the share is flipped if that is
 *  `b`. */
function shareAt(at: number, a: [number, number], b: [number, number]): number {
  const start = Math.min(a[0], b[0]);
  const total = a[1] + b[1];
  if (total <= 0) return 0.5;
  const raw = (at - start) / total;
  return clampShare(a[0] <= b[0] ? raw : 1 - raw);
}

function ColGrip({ gap, rootRef }: { gap: number; rootRef: React.RefObject<HTMLDivElement | null> }) {
  const resizeCols = useStore((s) => s.resizeCols);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    const root = rootRef.current;
    const grip = e.currentTarget;
    if (root === null) return;
    const cols = [...root.querySelectorAll<HTMLElement>(":scope > .s-panecol")];
    const a = cols[gap];
    const b = cols[gap + 1];
    if (a === undefined || b === undefined) return;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const weights = useStore.getState().workspace.layout.colWeights.slice();
    const pair = weights[gap] + weights[gap + 1];
    let share = weights[gap] / pair;
    document.documentElement.classList.add("s-app--split-drag", "s-app--split-drag-x");
    const move = (ev: PointerEvent): void => {
      share = shareAt(ev.clientX, [ra.left, ra.width], [rb.left, rb.width]);
      const next = weights.slice();
      next[gap] = pair * share;
      next[gap + 1] = pair * (1 - share);
      root.style.gridTemplateColumns = next.map((w) => `${w}fr`).join(" ");
    };
    const up = (): void => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
      document.documentElement.classList.remove("s-app--split-drag", "s-app--split-drag-x");
      resizeCols(gap, share);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
  };
  return (
    <div
      className="s-split-grip s-split-grip--col"
      role="separator"
      aria-orientation="vertical"
      aria-label={t("splitGripCols")}
      title={t("splitGripCols")}
      onPointerDown={onPointerDown}
      onDoubleClick={() => resizeCols(gap, 0.5)}
    />
  );
}

function RowGrip({ col, top }: { col: number; top: number }) {
  const resizeRows = useStore((s) => s.resizeRows);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    const grip = e.currentTarget;
    const column = grip.parentElement;
    if (column === null) return;
    const panes = [...column.querySelectorAll<HTMLElement>(":scope > [data-pane]")];
    const a = panes[0];
    const b = panes[1];
    if (a === undefined || b === undefined) return;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    let share = top;
    document.documentElement.classList.add("s-app--split-drag", "s-app--split-drag-y");
    const move = (ev: PointerEvent): void => {
      share = shareAt(ev.clientY, [ra.top, ra.height], [rb.top, rb.height]);
      column.style.gridTemplateRows = `${share}fr ${1 - share}fr`;
      grip.style.top = `calc(${share * 100}% - 4px)`;
    };
    const up = (): void => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
      document.documentElement.classList.remove("s-app--split-drag", "s-app--split-drag-y");
      resizeRows(col, share);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
  };
  return (
    <div
      className="s-split-grip s-split-grip--row"
      role="separator"
      aria-orientation="horizontal"
      aria-label={t("splitGripRows")}
      title={t("splitGripRows")}
      style={{ top: `calc(${top * 100}% - 4px)` }}
      onPointerDown={onPointerDown}
      onDoubleClick={() => resizeRows(col, 0.5)}
    />
  );
}

/** Live rects for every pane, read at the moment an arrow is pressed rather
 *  than tracked: a resize, a fold and a split all move them, and a cache would
 *  answer for a layout that is no longer on screen. */
function paneRects(root: HTMLElement | null): Record<PaneId, DOMRect> {
  const out: Record<PaneId, DOMRect> = {};
  if (root === null) return out;
  for (const el of root.querySelectorAll<HTMLElement>("[data-pane]")) {
    const id = el.dataset.pane;
    if (id !== undefined) out[id] = el.getBoundingClientRect();
  }
  return out;
}

export default function Workspace({ children }: { children?: ReactNode }) {
  const workspace = useStore((s) => s.workspace);
  const focusPane = useStore((s) => s.focusPane);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const columns = workspace.layout.columns;

  // Arrow between panes. Installed here rather than in App.tsx's global
  // listener because it needs the rects, and the rects are this element's.
  useEffect(() => {
    if (columns.length === 1 && columns[0].length === 1) return; // nothing to move to
    const onKey = (e: KeyboardEvent): void => {
      if (!e.altKey || !e.shiftKey || !(e.ctrlKey || e.metaKey)) return;
      const dir =
        e.key === "ArrowLeft" ? "left"
        : e.key === "ArrowRight" ? "right"
        : e.key === "ArrowUp" ? "up"
        : e.key === "ArrowDown" ? "down"
        : null;
      if (dir === null) return;
      const next = paneInDirection(paneRects(rootRef.current), workspace.focus, dir);
      if (next === null) return;
      e.preventDefault();
      focusPane(next);
      // Put the caret where the eye just went, or the reader has focused a
      // pane they then have to click into.
      requestAnimationFrame(() => {
        rootRef.current
          ?.querySelector<HTMLElement>(`[data-pane="${next}"] .cm-content`)
          ?.focus();
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [columns, workspace.focus, focusPane]);

  // One pane: render exactly what the shell rendered before panes existed, with
  // no grid, no wrapper and no data attribute. A reader who never splits pays
  // nothing for the feature, and every `:has()` and zen rule that keys off
  // `.s-view > .s-editor` keeps matching.
  const solo = columns.length === 1 && columns[0].length === 1;
  if (solo) return <Pane id={columns[0][0]} solo>{children}</Pane>;

  return (
    <div
      ref={rootRef}
      className="s-panes"
      style={{ gridTemplateColumns: workspace.layout.colWeights.map((w) => `${w}fr`).join(" ") }}
    >
      {columns.map((col, i) => {
        const rows = col.map((id) => workspace.layout.rowWeights[id] ?? 1);
        const rowTotal = rows.reduce((a, b) => a + b, 0);
        return (
          <div
            key={col.join("+")}
            className="s-panecol"
            style={{ gridTemplateRows: rows.map((w) => `${w}fr`).join(" ") }}
            data-col={i}
          >
            {col.map((id) => (
              <Pane key={id} id={id} />
            ))}
            {col.length === 2 && <RowGrip col={i} top={rows[0] / rowTotal} />}
            {i < columns.length - 1 && <ColGrip gap={i} rootRef={rootRef} />}
          </div>
        );
      })}
    </div>
  );
}
