// HOW BIG A TABLE — the palette's "Insert table…", asked rather than assumed.
//
// The slash menu's `/table` drops a 2×2 skeleton and that is right for it: it
// is a key you press mid-sentence and the cost of a wrong guess is one Tab.
// A palette row is a decision, and the decision is nearly always "how many
// columns" — a five-column table built by Tabbing off the end of a two-column
// one is five Tabs and a reformat, and the reader has to know that Tab does
// that. So this draws the grid and the reader sweeps it.
//
// A GRID, not two number boxes, and it is a real control rather than a
// picture of one: every square is a <button> with its own accessible name, so
// the pointer sweeps and the keyboard walks and both land on the same call.
// Arrows move, Enter takes, Escape leaves — useDialog owns the trap and the
// focus restore the way every other sheet in the app does.
//
// The ceiling is 10×10 because the grid IS the ceiling: a bigger table is a
// bigger table, and the menu on the widget grows one a row at a time without
// asking anybody to sweep 40 squares.

import { useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useDialog } from "../a11y.ts";
import { localeNum, t, tf } from "../i18n.ts";
import "../styles/media.css";
import "../styles/tablepicker.css";

const MAX = 10;
/** What the grid offers before anyone touches it, and what Enter takes. */
const DEFAULT_ROWS = 3;
const DEFAULT_COLS = 3;

export interface TableSize {
  /** Rows INCLUDING the header — the reader counts the squares they swept. */
  rows: number;
  cols: number;
}

function Picker({ done }: { done: (size: TableSize | null) => void }) {
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [cols, setCols] = useState(DEFAULT_COLS);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  useDialog(panelRef, { onEscape: () => done(null) });
  // The grid, once: the reader opened this to answer a question, and the
  // answer is the arrows. Focusing it on every render instead would be a
  // no-op that reads like a bug the first time someone changes this.
  useEffect(() => {
    gridRef.current?.focus();
  }, []);

  const move = (dr: number, dc: number): void => {
    setRows((r) => Math.max(1, Math.min(MAX, r + dr)));
    setCols((c) => Math.max(1, Math.min(MAX, c + dc)));
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    // The grid is one control, so the arrows are the grid's and never the
    // browser's tab ring: a 100-square roving tabindex would put 100 stops
    // between this sheet's two real ones.
    const step: Record<string, [number, number]> = {
      ArrowDown: [1, 0],
      ArrowUp: [-1, 0],
      ArrowRight: [0, 1],
      ArrowLeft: [0, -1],
    };
    const d = step[e.key];
    if (!d) return;
    e.preventDefault();
    // Physical arrows, mirrored by the reading direction: the grid grows
    // toward the reader's own "further along".
    const rtl = getComputedStyle(document.documentElement).direction === "rtl";
    move(d[0], rtl ? -d[1] : d[1]);
  };

  const squares = [];
  for (let r = 1; r <= MAX; r++) {
    for (let c = 1; c <= MAX; c++) {
      const on = r <= rows && c <= cols;
      squares.push(
        <button
          key={`${r}x${c}`}
          type="button"
          className={`s-tablepick__cell${on ? " s-tablepick__cell--on" : ""}`}
          aria-label={tf("tableSizeLabel", { rows: localeNum(r), cols: localeNum(c) })}
          aria-pressed={r === rows && c === cols}
          tabIndex={-1}
          onMouseEnter={() => {
            setRows(r);
            setCols(c);
          }}
          onClick={() => done({ rows: r, cols: c })}
        />,
      );
    }
  }

  return (
    <div className="s-palette-overlay" onMouseDown={() => done(null)}>
      <div
        ref={panelRef}
        className="s-mediaform s-tablepick"
        role="dialog"
        aria-modal="true"
        aria-label={t("cmdInsertTable")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="s-mediaform__head">
          <h2 className="s-mediaform__title">{t("cmdInsertTable")}</h2>
          <button type="button" className="s-mediaform__close" onClick={() => done(null)} aria-label={t("close")}>
            ×
          </button>
        </div>
        <div className="s-mediaform__body">
          {/* The grid takes the focus and speaks for all hundred squares:
              a roving tabindex over them would be a hundred tab stops, and
              the thing the reader is choosing is ONE size, not one square. */}
          <div
            className="s-tablepick__grid"
            role="group"
            aria-label={t("tableRowsCols")}
            tabIndex={0}
            onKeyDown={onKeyDown}
            ref={gridRef}
          >
            {squares}
          </div>
          <p className="s-tablepick__size" aria-live="polite">
            {tf("tableSize", { rows: localeNum(rows), cols: localeNum(cols) })}
          </p>
          <button
            type="button"
            className="s-btn s-btn--accent s-tablepick__go"
            onClick={() => done({ rows, cols })}
          >
            {t("tableInsertIt")}
          </button>
        </div>
      </div>
    </div>
  );
}

let root: Root | null = null;
let mount: HTMLElement | null = null;

/** Ask for a size. Resolves null when the reader leaves without choosing —
 *  and the caller then inserts NOTHING, the rule every sheet in this app
 *  follows for a question nobody answered. */
export function pickTableSize(): Promise<TableSize | null> {
  if (root) return Promise.resolve(null);
  mount = document.createElement("div");
  document.body.appendChild(mount);
  const mounted = createRoot(mount);
  root = mounted;
  return new Promise((resolve) => {
    const done = (size: TableSize | null): void => {
      root = null;
      const host = mount;
      mount = null;
      queueMicrotask(() => {
        mounted.unmount();
        host?.remove();
      });
      resolve(size);
    };
    mounted.render(<Picker done={done} />);
  });
}
