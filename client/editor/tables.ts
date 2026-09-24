// GFM tables in live preview, on the editor's reveal-on-caret rule: caret
// outside a table block → the block is one rendered <table> widget; caret
// inside → the pipe source, line-marked so the columns can be read while
// they are being edited. The same rule callouts and $$ math already follow
// (callouts.ts, math.ts), because three block elements with two reveal
// behaviours would be two too many.
//
// The widget does not render cells itself: it hands the block's source to
// the reading renderer (reading/render.ts), which is what the reading view,
// the blog and the editor's own transclusion widget already draw tables
// with — alignment colons, `\|` escapes, per-table direction and the theme
// included. One renderer, four surfaces, zero drift.
//
// AND THE WIDGET IS EDITABLE. Until 3.18 a click on a rendered cell dropped
// the whole block back to pipes, which is fine for a 3×3 table and
// impossible for a 60×12 one: the reader loses the grid they were reading
// the moment they touch it, and the thing they are then editing is a wall of
// padded punctuation where the column they wanted is 400 characters along a
// wrapped line. So a click now opens a text box INSIDE that cell and leaves
// the table standing. A native box rather than a contenteditable cell for the
// reason propsEdit.ts reached the same conclusion: the caret, selection and
// IME behaviour of a native text box are the platform's, which is what an
// Arabic keyboard and a Japanese IME both need, and a contenteditable cell
// nested in `.cm-content` is a second editable region for CodeMirror's own
// selection reader to walk into. The box is a <textarea>, not an <input>,
// and it draws NO box of its own: the first cut was a single-line input with
// a ring, and a three-line cell squeezed onto one scrolling line inside a lit
// rectangle is not "editing the cell", it is editing something else placed
// over it (the owner: "it squishes it in some rectangle"). The textarea
// wraps exactly where the rendered cell wrapped, grows with the text, and
// the only signs it is open are the caret and a hairline under the cell.
//
// THE NOTE IS STILL THE STATE. Nothing about the table lives anywhere but
// the markdown: the box holds the cell's own source text (escapes intact),
// a commit is one minimal change over that cell's bytes, and every command
// is a pure function of the block's text (tableModel.ts). What this file
// keeps in memory is where the reader's attention is — which cell has the
// box — the way selection.ts remembers the last click.
//
// WHAT COMMITS, AND WHEN. Never on a keystroke: a dispatch per character
// would put a doc change, a decoration rebuild and a widget diff between the
// key and the glyph, and on a 60×12 table that is measurable. The box
// commits on blur, on Tab, on Enter and before any command — one dispatch,
// one undo step (`isolateHistory`), one cell's range — and the widget
// answers it by redrawing THAT CELL (`updateDOM`), not the table.
//
// The editing verbs that work on the SOURCE (Tab/Enter cell walking,
// Alt+arrow row/column moves, prettify-on-exit) still live on a Prec.high
// keymap that answers ONLY when the caret sits in a top-level Table node —
// everywhere else every key falls through untouched, so the gate that guards
// "Tab indents" keeps holding outside tables.
//
// Tables nested in blockquotes/callouts or lists stay source in the editor
// (the reading view still renders them): replacing a range that includes
// `> ` markers would fight the callout field for the same lines.

import { estimateTable, knownHeight, noteColumnWidth, trackHeight } from "./widgetHeight.ts";
import { EditorSelection, Prec, RangeSet, StateField, Transaction, type EditorState, type Extension, type Range } from "@codemirror/state";
import {
  Decoration,
  Direction,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { isolateHistory } from "@codemirror/commands";
import type { SyntaxNode } from "@lezer/common";
import { completionStatus } from "@codemirror/autocomplete";
import "../styles/tables.css";
import { useStore } from "../state.ts";
import { renderMarkdown, renderTableCell } from "../reading/render.ts";
import { openMenuPortal } from "../components/menuPortal.tsx";
import type { MenuRow } from "../components/ContextMenu.tsx";
import { t, tf } from "../i18n.ts";
import { toast } from "../toast.ts";
import type { PaletteTableCmd } from "../tableActions.ts";
import { notePathFacet } from "./livePreview.ts";
import {
  alignName,
  cellEdit,
  cellText,
  colIndexAt,
  columnCount,
  deleteTableColumn,
  deleteTableRow,
  duplicateTableRow,
  emptyRowText,
  escapeCellText,
  formatTable,
  insertTableColumn,
  insertTableRow,
  moveTableColumn,
  moveTableRow,
  navRows,
  parseTable,
  rowCount,
  rowIndexAt,
  setColumnAlign,
  sortTableRows,
  splitRowCells,
  tableSkeleton,
  type TableCell,
  type TableShape,
} from "./tableModel.ts";

// ── Finding the table under the caret ───────────────────────────────────────

/** The top-level Table node containing `pos`, or null. Both resolve sides are
 *  tried because at a row's start/end one side resolves to the neighbouring
 *  node. Nested tables (blockquote, list) answer null on purpose — see the
 *  header. */
function tableNodeAt(state: EditorState, pos: number): SyntaxNode | null {
  const tree = syntaxTree(state);
  for (const side of [-1, 1] as const) {
    let n: SyntaxNode | null = tree.resolveInner(pos, side);
    while (n && n.name !== "Table") n = n.parent;
    if (n && n.parent?.name === "Document") return n;
  }
  return null;
}

interface TableCtx {
  blockFrom: number;
  blockTo: number;
  src: string;
  shape: TableShape;
}

/** Table context at the main head — null (fall through to the next keymap)
 *  unless there is exactly one selection range sitting in a top-level table
 *  whose source also parses as one. Offsets are DOCUMENT offsets. */
function tableContext(state: EditorState): TableCtx | null {
  if (state.selection.ranges.length !== 1) return null;
  const node = tableNodeAt(state, state.selection.main.head);
  if (!node) return null;
  const doc = state.doc;
  const blockFrom = doc.lineAt(node.from).from;
  const blockTo = doc.lineAt(node.to).to;
  const src = doc.sliceString(blockFrom, blockTo);
  const shape = parseTable(src, blockFrom);
  return shape ? { blockFrom, blockTo, src, shape } : null;
}

/** Line numbers currently touched by any selection range. Private in
 *  livePreview.ts, eight lines — re-stated rather than exported from a file
 *  this round must not touch. */
function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const from = state.doc.lineAt(range.from).number;
    const to = state.doc.lineAt(range.to).number;
    for (let n = from; n <= to; n++) lines.add(n);
  }
  return lines;
}

/** The block a WIDGET is currently drawing, read back from the document.
 *
 *  `blockFrom` is not stored on the widget for this: a table that merely slid
 *  down a line is `eq` to itself (see the widget), so its DOM is reused
 *  without any update call and any position cached on it is a release behind.
 *  `posAtDOM` asks CodeMirror where the node IS, which is the only answer
 *  that cannot go stale. The shape is parsed at base 0 — block-relative,
 *  matching everything tableModel's commands hand back — and `from` is what
 *  turns one into a document offset. */
interface WidgetBlock {
  from: number;
  to: number;
  src: string;
  shape: TableShape;
}
function blockOfWrap(view: EditorView, wrap: HTMLElement): WidgetBlock | null {
  if (!wrap.isConnected) return null;
  let pos: number;
  try {
    pos = view.posAtDOM(wrap);
  } catch {
    return null;
  }
  const node = tableNodeAt(view.state, Math.min(pos, view.state.doc.length));
  if (!node) return null;
  const doc = view.state.doc;
  const from = doc.lineAt(node.from).from;
  const to = doc.lineAt(node.to).to;
  const src = doc.sliceString(from, to);
  const shape = parseTable(src, 0);
  return shape ? { from, to, src, shape } : null;
}

// ── The widget ──────────────────────────────────────────────────────────────

/** Every rendered cell learns WHICH cell it is — row (0 = header) and column
 *  — so a click, a menu and a walk all name the same thing the model does.
 *  Read off the DOM rather than off a second parse: the renderer emits one
 *  `<tr>` per source row and exactly `header.length` cells in each, so the
 *  indices are the rendering's own. */
function markCells(table: HTMLElement): void {
  table.querySelectorAll("tr").forEach((tr, r) => {
    tr.querySelectorAll("th,td").forEach((cell, c) => {
      const el = cell as HTMLElement;
      el.dataset.row = String(r);
      el.dataset.col = String(c);
    });
  });
}

class TableWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly blockFrom: number, // doc offset of the block's first character
    readonly notePath: string,
  ) {
    super();
  }
  override eq(other: TableWidget): boolean {
    // blockFrom is deliberately NOT compared: a widget whose table merely
    // slid down a line is the same widget, and comparing positions would
    // rebuild every table's DOM on every keystroke above it. Positions are
    // asked of the view when they are needed (blockOfWrap).
    return other.src === this.src && other.notePath === this.notePath;
  }

  /** Draw the whole table into `wrap`, replacing whatever was there. */
  private draw(wrap: HTMLElement, view: EditorView): void {
    const rendered = renderMarkdown(this.src, {
      notePath: this.notePath,
      tree: useStore.getState().tree,
    });
    markCells(rendered);
    wrap.replaceChildren(rendered, touchAffordance(view, wrap));
  }

  /** What this table measured last time, else a guess from its rows
   *  (client/editor/widgetHeight.ts): a block the height map takes for one
   *  line is what made a long note grow under a fling. */
  override get estimatedHeight(): number {
    return knownHeight(`table:${this.notePath}:${this.src}`) ?? estimateTable(this.src);
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-s-table";
    this.draw(wrap, view);
    wireWidget(view, wrap);
    noteColumnWidth(view.contentDOM.clientWidth);
    trackHeight(`table:${this.notePath}:${this.src}`, wrap);
    return wrap;
  }

  /** REDRAW ONE CELL WHERE ONE CELL MOVED. A committed cell is a change to a
   *  single range, and rebuilding the table for it costs the whole rendering
   *  — 720 cells through the inline renderer on the 60×12 table this was
   *  measured on — for one `<td>` of difference. So: same note, same shape,
   *  same alignment row, and only cell text differs → patch those cells and
   *  keep the DOM (and with it the box the reader is typing in, its
   *  selection, and any IME composition riding on it). Anything else falls
   *  back to a full draw, which is still this node rather than a new one:
   *  the walk, the menu and the touch affordance all hold a reference to the
   *  wrap, and a wrap that survives every edit is what lets them. */
  override updateDOM(dom: HTMLElement, view: EditorView, from: TableWidget): boolean {
    if (from.notePath !== this.notePath) return false;
    if (from.src === this.src) return true;
    if (!this.patch(dom, from)) this.draw(dom, view);
    return true;
  }

  private patch(dom: HTMLElement, from: TableWidget): boolean {
    const before = parseTable(from.src);
    const after = parseTable(this.src);
    if (!before || !after) return false;
    // The alignment row carries the column classes the renderer stamps on
    // every cell; a change there is not a cell change.
    if (from.src.split("\n")[1] !== this.src.split("\n")[1]) return false;
    if (rowCount(before) !== rowCount(after)) return false;
    const oldRows = navRows(before);
    const newRows = navRows(after);
    const trs = dom.querySelectorAll("tr");
    if (trs.length !== newRows.length) return false;
    const patches: { el: HTMLElement; text: string }[] = [];
    for (let r = 0; r < newRows.length; r++) {
      const cells = trs[r].querySelectorAll("th,td");
      for (let c = 0; c < cells.length; c++) {
        const oldText = oldRows[r]?.cells[c]?.text ?? "";
        const newText = newRows[r]?.cells[c]?.text ?? "";
        if (oldText === newText) continue;
        const el = cells[c] as HTMLElement;
        // The box owns its own cell until it is put away; overwriting it
        // here would take the reader's caret with it.
        if (el.querySelector(".cm-s-table__input")) return false;
        patches.push({ el, text: newText });
      }
    }
    const opts = { notePath: this.notePath, tree: useStore.getState().tree };
    for (const p of patches) p.el.innerHTML = renderTableCell(p.text, opts);
    return true;
  }

  override ignoreEvent(): boolean {
    return true; // the listeners below own every gesture inside the widget
  }
}

// ── Decorations (StateField: block decorations cannot come from a ViewPlugin)

function buildTableDecos(state: EditorState): DecorationSet {
  const doc = state.doc;
  const active = activeLines(state);
  const decos: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "Table") return undefined;
      if (node.node.parent?.name !== "Document") return false; // nested: stays source
      const firstLine = doc.lineAt(node.from);
      const lastLine = doc.lineAt(node.to);
      let revealed = false;
      for (let n = firstLine.number; n <= lastLine.number; n++) {
        if (active.has(n)) {
          revealed = true;
          break;
        }
      }
      if (revealed) {
        for (let n = firstLine.number; n <= lastLine.number; n++) {
          decos.push(
            Decoration.line({ class: "cm-s-table-srcline" }).range(doc.line(n).from),
          );
        }
      } else {
        decos.push(
          Decoration.replace({
            widget: new TableWidget(
              doc.sliceString(firstLine.from, lastLine.to),
              firstLine.from,
              state.facet(notePathFacet),
            ),
            block: true,
          }).range(firstLine.from, lastLine.to),
        );
      }
      return false;
    },
  });
  return RangeSet.of(decos, true);
}

const tableField = StateField.define<DecorationSet>({
  create: buildTableDecos,
  update(deco, tr) {
    if (tr.docChanged || tr.selection || tr.effects.length > 0) {
      return buildTableDecos(tr.state);
    }
    return deco.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

// ── Editing a cell in place ─────────────────────────────────────────────────

/** The one cell with a box in it, anywhere in the app. Module-level because
 *  the widget's DOM outlives every render that touched it and because there
 *  is exactly one — two open boxes would be two uncommitted cells racing for
 *  the same undo step. */
interface OpenCell {
  view: EditorView;
  wrap: HTMLElement;
  cell: HTMLElement;
  input: HTMLTextAreaElement;
  /** The cell's rendered children, held while the box stands in for them. */
  saved: ChildNode[];
  row: number;
  col: number;
  /** The cell's source text when the box opened — what "unchanged" means. */
  original: string;
}
let open: OpenCell | null = null;

/** WHERE THE READER LAST WAS, for the palette.
 *
 *  A palette row acts on the table the caret is in. While a cell is being
 *  edited in place the caret is deliberately NOT in the table (it would
 *  reveal the source and take the widget away), so without this the five
 *  table rows would be unreachable from the very surface they are for. It is
 *  attention, not state: the note still says everything about the table, and
 *  a wrap that has left the DOM answers nothing. */
let lastTouched: { view: EditorView; wrap: HTMLElement; row: number; col: number } | null = null;

/** A menu is up over the widget, so focus leaving a cell is not the reader
 *  leaving the cell. */
let menuUp = false;

/** Put the box away. `commit` writes the typed text back as ONE change over
 *  that cell's own bytes — isolated in the history, so undo takes back this
 *  cell and no other. Unchanged text dispatches nothing at all. */
function closeCell(commit: boolean): void {
  const cur = open;
  if (!cur) return;
  open = null;
  const typed = cur.input.value;
  cur.cell.classList.remove("cm-s-table__cell--editing");
  cur.cell.style.minInlineSize = "";
  cur.cell.style.boxSizing = "";
  cur.cell.replaceChildren(...cur.saved);
  if (!commit) return;
  if (escapeCellText(typed) === escapeCellText(cur.original)) return;
  const block = blockOfWrap(cur.view, cur.wrap);
  if (!block) return;
  const edit = cellEdit(block.src, cur.row, cur.col, typed);
  if (!edit) return;
  cur.view.dispatch({
    changes: { from: block.from + edit.from, to: block.from + edit.to, insert: edit.insert },
    annotations: isolateHistory.of("full"),
    userEvent: "input.table.cell",
  });
}

/** Open the box on one cell. `mode` is the difference between walking into a
 *  cell and clicking into one: a walk selects the content (so typing
 *  replaces a column of values at speed), a click and a row move put the
 *  caret at the end and touch nothing. */
function openCell(
  view: EditorView,
  wrap: HTMLElement,
  row: number,
  col: number,
  mode: "select" | "end",
): boolean {
  closeCell(true);
  const cell = wrap.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`);
  const block = blockOfWrap(view, wrap);
  if (!cell || !block) return false;
  const text = cellText(block.shape, row, col);

  // PIN THE COLUMN. The box replaces the cell's content, so without this the
  // column collapses to the box's own minimum the moment it opens and every
  // column after it jumps — the table reflows under the reader's pointer on
  // the click that was supposed to let them type.
  const width = cell.getBoundingClientRect().width;
  cell.style.boxSizing = "border-box";
  cell.style.minInlineSize = `${Math.round(width)}px`;

  const input = document.createElement("textarea");
  input.rows = 1;
  input.className = "cm-s-table__input";
  // Note content, so it takes its OWN direction — an Arabic cell in an
  // English table types right to left, the rule every rendered block follows.
  input.dir = "auto";
  input.value = text;
  input.setAttribute("aria-label", tf("tableCellLabel", { row: String(row + 1), col: String(col + 1) }));
  input.addEventListener("keydown", cellKeydown);
  // GROWS WITH THE TEXT. `field-sizing: content` does this in CSS where it
  // exists (Chromium); the listener is the same answer for the engines that
  // lack it, and harmless where the property already did the work.
  const grow = () => {
    input.style.blockSize = "auto";
    input.style.blockSize = `${input.scrollHeight}px`;
  };
  input.addEventListener("input", grow);
  input.addEventListener("blur", () => {
    // A blur COMMITS (propsEdit.ts's rule, for its reason: typed text
    // survives the gesture that interrupted it). A menu opened from the cell
    // is not the reader leaving it.
    queueMicrotask(() => {
      if (menuUp) return;
      if (open?.input === input) closeCell(true);
    });
  });

  const saved = [...cell.childNodes];
  cell.replaceChildren(input);
  cell.classList.add("cm-s-table__cell--editing");
  open = { view, wrap, cell, input, saved, row, col, original: text };
  lastTouched = { view, wrap, row, col };
  grow();
  input.focus({ preventScroll: true });
  if (mode === "select") input.select();
  else input.setSelectionRange(text.length, text.length);
  return true;
}

/** Rows and columns as the RENDERING has them — the grid the reader sees and
 *  the one the walk moves through. */
function gridSize(wrap: HTMLElement): { rows: number; cols: number } {
  const trs = wrap.querySelectorAll("tr");
  return { rows: trs.length, cols: trs[0]?.querySelectorAll("th,td").length ?? 0 };
}

/** Which way the TABLE reads, asked of the drawing rather than of the line
 *  under it. The renderer resolves a table's direction from its header's
 *  first strong character (CONTRACTS, "Tables"), so an Arabic table in an
 *  English note runs right to left and its "move the column left" has to
 *  mean what the reader sees. */
function wrapRtl(wrap: HTMLElement): boolean {
  const table = wrap.querySelector(".s-rv-table");
  return table !== null && getComputedStyle(table).direction === "rtl";
}

/** Commit, then put the box on another cell of the same table. */
function moveTo(cur: OpenCell, row: number, col: number, mode: "select" | "end"): void {
  const { view, wrap } = cur;
  closeCell(true);
  openCell(view, wrap, row, col, mode);
}

/** Leave the table entirely: the caret goes back to the note, on the line
 *  after the block. A table that ends the document grows that line, the way
 *  Enter from the last row already does — the alternative is a caret parked
 *  on the block's own last character, which reveals the source and undoes
 *  the leaving. */
function leaveTable(cur: OpenCell, commit: boolean): void {
  const { view, wrap } = cur;
  // The block is read AFTER the commit: the commit is a change inside it, so
  // a range captured first would name the block the table used to be.
  closeCell(commit);
  const block = blockOfWrap(view, wrap);
  const to = block ? block.to : null;
  if (to === null) {
    view.focus();
    return;
  }
  if (to >= view.state.doc.length) {
    view.dispatch({
      changes: { from: to, insert: "\n" },
      selection: { anchor: to + 1 },
      scrollIntoView: true,
      userEvent: "input",
    });
  } else {
    view.dispatch({ selection: { anchor: to + 1 }, scrollIntoView: true });
  }
  view.focus();
  // Explicitly, and not through the wrap's focusout: the box was REMOVED
  // while it held focus, and a removed element's focusout is not something to
  // build a file write on — Chromium moves focus to <body> and the event is
  // the engine's business. The click-away path still goes through focusout,
  // where the blur is a real one; `scheduleFormat` is a no-op either way if
  // the other has already run.
  if (block) scheduleFormat(view, block.from);
}

/** Tab past the last cell: the table grows a row and the box lands in it. */
function growRow(cur: OpenCell): void {
  const { view, wrap } = cur;
  closeCell(true);
  const block = blockOfWrap(view, wrap);
  if (!block) return;
  const res = insertTableRow(block.src, rowCount(block.shape) - 1, "below");
  if (!res) return;
  applyBlock(view, block, res.src);
  openCell(view, wrap, res.row, 0, "select");
}

/** `<br>` at the caret — the only line break a GFM cell can hold, since a row
 *  IS a line and a newline in one is two broken tables. */
function insertBreak(cur: OpenCell): void {
  const box = cur.input;
  const at = box.selectionStart ?? box.value.length;
  const end = box.selectionEnd ?? at;
  box.value = box.value.slice(0, at) + "<br>" + box.value.slice(end);
  box.setSelectionRange(at + 4, at + 4);
}

function cellKeydown(ev: KeyboardEvent): void {
  const cur = open;
  if (!cur || ev.target !== cur.input) return;
  // EVERY KEYSTROKE INSIDE THE BOX STAYS INSIDE IT. The widget is inside
  // `.cm-content` and CodeMirror's keymap listens on the editor root, so
  // without this Tab indents the table's line, Enter splits it, and Escape
  // reaches the shell and leaves zen mode — the three failures propsEdit.ts
  // hit first with its own boxes.
  ev.stopPropagation();
  const { key } = ev;
  const grid = gridSize(cur.wrap);

  if (key === "Tab") {
    ev.preventDefault();
    const step = ev.shiftKey ? -1 : 1;
    let row = cur.row;
    let col = cur.col + step;
    if (col >= grid.cols) {
      row += 1;
      col = 0;
    } else if (col < 0) {
      row -= 1;
      col = grid.cols - 1;
    }
    if (row >= grid.rows) growRow(cur);
    else if (row < 0) moveTo(cur, 0, 0, "select");
    else moveTo(cur, row, col, "select");
    return;
  }
  if (key === "Enter" && ev.shiftKey) {
    ev.preventDefault();
    insertBreak(cur);
    return;
  }
  if (key === "Enter" || key === "ArrowDown") {
    ev.preventDefault();
    if (cur.row + 1 < grid.rows) moveTo(cur, cur.row + 1, cur.col, "end");
    else leaveTable(cur, true);
    return;
  }
  if (key === "ArrowUp") {
    ev.preventDefault();
    if (cur.row > 0) moveTo(cur, cur.row - 1, cur.col, "end");
    return;
  }
  if (key === "Escape") {
    ev.preventDefault();
    // Escape CANCELS this cell and returns to the note — the two halves of
    // one gesture, and the same cancel propsEdit.ts's boxes make.
    leaveTable(cur, false);
    return;
  }
  if ((key === "F10" && ev.shiftKey) || key === "ContextMenu") {
    ev.preventDefault();
    const box = cur.cell.getBoundingClientRect();
    openCellMenu(cur.view, cur.wrap, cur.row, cur.col, box.left + 8, box.bottom, true);
    return;
  }
  if (key === "ArrowLeft" || key === "ArrowRight") {
    const box = cur.input;
    const at = box.selectionStart ?? 0;
    const to = box.selectionEnd ?? at;
    if (at !== to) return; // a selection: the box's own business
    // Arrows are VISUAL, the rule Alt+arrow column moves already follow: in
    // an RTL table the cell to the reader's right is the logically previous
    // one. The TABLE's direction decides, not the cell's — every cell
    // carries `dir="auto"`, so one Arabic cell in an English table would
    // otherwise reverse the walk for that cell alone.
    const rtl = wrapRtl(cur.wrap);
    const forward = rtl ? key === "ArrowLeft" : key === "ArrowRight";
    if (forward && at === box.value.length && cur.col + 1 < grid.cols) {
      ev.preventDefault();
      moveTo(cur, cur.row, cur.col + 1, "end");
    } else if (!forward && at === 0 && cur.col > 0) {
      ev.preventDefault();
      moveTo(cur, cur.row, cur.col - 1, "end");
    }
  }
}

// ── The commands, one undo step each ────────────────────────────────────────

type TableCmd =
  | "rowAbove"
  | "rowBelow"
  | "colBefore"
  | "colAfter"
  | "deleteRow"
  | "deleteCol"
  | "rowUp"
  | "rowDown"
  | "colLeft"
  | "colRight"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "sortAz"
  | "sortZa"
  | "sortNumeric"
  | "duplicateRow"
  | "clearCell"
  | "editSource"
  | "copyMarkdown";

/** Every structural command's one dispatch, PRETTIFIED in the same
 *  transaction.
 *
 *  `isolateHistory` is the promise the menu makes: one row pressed is one
 *  Ctrl+Z, never half a row left behind because two commands fell inside the
 *  history's 500 ms grouping window. Formatting here rather than on the way
 *  out is the other half of that promise — a command that left the block
 *  ragged would be followed by a format transaction the moment the reader
 *  clicked away, and their first Ctrl+Z would spend itself undoing the
 *  padding instead of the row. A cell commit is deliberately NOT formatted:
 *  it is one range by design, and squaring the block off around it would
 *  turn the smallest edit in the feature into the largest. */
function applyBlock(view: EditorView, block: WidgetBlock, src: string): void {
  view.dispatch({
    changes: { from: block.from, to: block.to, insert: formatTable(src) },
    annotations: isolateHistory.of("full"),
    userEvent: "input.table",
  });
}

/** `[[from the widget]]` — run a command against one cell of one table, and
 *  put the box back where the reader will want it. Returns false when the
 *  command does not apply (an edge, the header, a table of one column), so
 *  the caller can leave the menu row disabled rather than dead. */
function runCommand(
  view: EditorView,
  wrap: HTMLElement,
  row: number,
  col: number,
  cmd: TableCmd,
): boolean {
  closeCell(true);
  const block = blockOfWrap(view, wrap);
  if (!block) return false;
  const { src, shape } = block;
  const rtl = wrapRtl(wrap);
  const refocus = (r: number, c: number): void => {
    openCell(view, wrap, r, c, "end");
  };

  switch (cmd) {
    case "rowAbove":
    case "rowBelow": {
      const res = insertTableRow(src, row, cmd === "rowAbove" ? "above" : "below");
      if (!res) return false;
      applyBlock(view, block, res.src);
      refocus(res.row, col);
      return true;
    }
    case "duplicateRow": {
      const res = duplicateTableRow(src, row);
      if (!res) return false;
      applyBlock(view, block, res.src);
      refocus(res.row, col);
      return true;
    }
    case "deleteRow": {
      const res = deleteTableRow(src, row);
      if (!res) return false;
      applyBlock(view, block, res.src);
      refocus(res.row, col);
      return true;
    }
    case "colBefore":
    case "colAfter": {
      const res = insertTableColumn(src, col, cmd === "colBefore" ? "before" : "after");
      if (!res) return false;
      applyBlock(view, block, res.src);
      refocus(row, res.col);
      return true;
    }
    case "deleteCol": {
      const res = deleteTableColumn(src, col);
      if (!res) return false;
      applyBlock(view, block, res.src);
      refocus(row, res.col);
      return true;
    }
    case "rowUp":
    case "rowDown": {
      if (row === 0) return false; // the header is not a body row
      const res = moveTableRow(src, row - 1, cmd === "rowUp" ? -1 : 1);
      if (!res) return false;
      applyBlock(view, block, res.src);
      refocus(res.row + 1, col);
      return true;
    }
    case "colLeft":
    case "colRight": {
      // Visual, like Alt+arrow: the table's own direction flips them.
      const dir = ((cmd === "colRight" ? 1 : -1) * (rtl ? -1 : 1)) as 1 | -1;
      const res = moveTableColumn(src, col, dir);
      if (!res) return false;
      applyBlock(view, block, res.src);
      refocus(row, res.col);
      return true;
    }
    case "alignLeft":
    case "alignCenter":
    case "alignRight": {
      const want = cmd === "alignLeft" ? "left" : cmd === "alignCenter" ? "center" : "right";
      // Pressing the alignment a column already has takes it OFF, back to the
      // colonless default — the only way a menu of three choices can unset
      // one without a fourth row that says "none".
      const next = alignName(shape, col) === want ? "none" : want;
      const out = setColumnAlign(src, col, next);
      if (out === null) return false;
      applyBlock(view, block, out);
      refocus(row, col);
      return true;
    }
    case "sortAz":
    case "sortZa":
    case "sortNumeric": {
      const mode = cmd === "sortAz" ? "az" : cmd === "sortZa" ? "za" : "numeric";
      const out = sortTableRows(src, col, mode);
      if (out === null || out === src) return out !== null;
      applyBlock(view, block, out);
      refocus(row, col);
      return true;
    }
    case "clearCell": {
      const edit = cellEdit(src, row, col, "");
      if (!edit) return false;
      // Through applyBlock, not as a minimal cell change: a MENU row is a
      // deliberate act and has to be one Ctrl+Z all the way back, which means
      // it must not leave a ragged block for format-on-exit to tidy in a
      // second transaction the reader's first undo would then spend itself
      // on. (The keyboard's own cell commit is minimal on purpose — see
      // closeCell.)
      applyBlock(view, block, src.slice(0, edit.from) + edit.insert + src.slice(edit.to));
      refocus(row, col);
      return true;
    }
    case "copyMarkdown": {
      void copyMarkdown(formatTable(src));
      refocus(row, col);
      return true;
    }
    case "editSource": {
      // The caret into this cell's own source. That reveals the block — the
      // reveal-on-caret rule, unchanged — and the way back is the way it has
      // always been: take the caret out of the block again.
      const cell = navRows(shape)[row]?.cells[col];
      const at = block.from + (cell ? cell.trimTo : shape.header.to);
      view.dispatch({
        selection: { anchor: Math.min(at, view.state.doc.length) },
        scrollIntoView: true,
      });
      view.focus();
      return true;
    }
  }
}

async function copyMarkdown(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(t("tableCopied"));
  } catch (err) {
    console.error("astrolabe: copying a table failed", err);
    toast(t("tableCopyFailed"), "error");
  }
}

// ── The menu ────────────────────────────────────────────────────────────────

/** The rows, in the order a reader looks for them: what the table gains,
 *  what it loses, what moves, how a column reads, how the rows order, then
 *  the two doors out. The alignment rows carry `checked`, which is what makes
 *  the whole menu reserve the tick column (ContextMenu.tsx's rule) — and that
 *  is the point: the column a reader right-clicked says how it is aligned
 *  before they choose anything. */
function menuRows(
  view: EditorView,
  wrap: HTMLElement,
  row: number,
  col: number,
  ran: { value: boolean },
): MenuRow[] {
  const block = blockOfWrap(view, wrap);
  const shape = block?.shape ?? null;
  const cols = shape ? columnCount(shape) : 1;
  const rows = shape ? rowCount(shape) : 1;
  const align = shape ? alignName(shape, col) : "none";
  const rtl = wrapRtl(wrap);
  const cmd = (label: string, id: TableCmd, disabled = false, checked?: boolean): MenuRow => ({
    label,
    disabled,
    checked,
    onSelect: () => {
      ran.value = true;
      runCommand(view, wrap, row, col, id);
    },
  });
  const sep: MenuRow = { label: null };
  return [
    cmd(t("tableRowAbove"), "rowAbove", row === 0),
    cmd(t("tableRowBelow"), "rowBelow"),
    cmd(t("tableColBefore"), "colBefore"),
    cmd(t("tableColAfter"), "colAfter"),
    sep,
    cmd(t("tableDeleteRow"), "deleteRow", row === 0),
    cmd(t("tableDeleteCol"), "deleteCol", cols <= 1),
    cmd(t("tableDuplicateRow"), "duplicateRow"),
    cmd(t("tableClearCell"), "clearCell"),
    sep,
    cmd(t("tableRowUp"), "rowUp", row <= 1),
    cmd(t("tableRowDown"), "rowDown", row === 0 || row >= rows - 1),
    cmd(t("tableColLeft"), "colLeft", rtl ? col >= cols - 1 : col <= 0),
    cmd(t("tableColRight"), "colRight", rtl ? col <= 0 : col >= cols - 1),
    sep,
    cmd(t("tableAlignStart"), "alignLeft", false, align === "left"),
    cmd(t("tableAlignCenter"), "alignCenter", false, align === "center"),
    cmd(t("tableAlignEnd"), "alignRight", false, align === "right"),
    sep,
    cmd(t("tableSortAz"), "sortAz", rows <= 2),
    cmd(t("tableSortZa"), "sortZa", rows <= 2),
    cmd(t("tableSortNumeric"), "sortNumeric", rows <= 2),
    sep,
    cmd(t("tableEditSource"), "editSource"),
    cmd(t("tableCopyMarkdown"), "copyMarkdown"),
  ];
}

function openCellMenu(
  view: EditorView,
  wrap: HTMLElement,
  row: number,
  col: number,
  x: number,
  y: number,
  fromKeyboard: boolean,
): void {
  const ran = { value: false };
  menuUp = true;
  openMenuPortal({
    at: { x, y, fromKeyboard },
    rows: menuRows(view, wrap, row, col, ran),
    label: t("tableMenu"),
    onClose: () => {
      menuUp = false;
      // ContextMenu closes BEFORE it runs the chosen row, so "was a command
      // chosen" is only answerable one microtask later. Nothing chosen: the
      // box the menu was opened from gets its focus back.
      queueMicrotask(() => {
        if (!ran.value && open?.wrap === wrap) open.input.focus({ preventScroll: true });
      });
    },
  });
}

// ── The widget's own listeners ──────────────────────────────────────────────

/** The ⋯ a finger can reach. A right-click is a pointer this surface may not
 *  have and Shift+F10 is a key it does not either, so on a coarse pointer the
 *  table carries its own door — 44px, the shell's floor, and drawn only
 *  there (styles/tables.css), so a mouse never sees a button it does not
 *  need and the two surfaces keep drawing the same table. */
function touchAffordance(view: EditorView, wrap: HTMLElement): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "cm-s-table__bar";
  const more = document.createElement("button");
  more.type = "button";
  more.className = "cm-s-table__more";
  more.setAttribute("aria-label", t("tableMenu"));
  more.textContent = "⋯";
  more.addEventListener("mousedown", (ev) => ev.preventDefault());
  more.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const at = open?.wrap === wrap ? { row: open.row, col: open.col } : { row: 0, col: 0 };
    const box = more.getBoundingClientRect();
    openCellMenu(view, wrap, at.row, at.col, box.left, box.bottom, false);
  });
  bar.appendChild(more);
  return bar;
}

function cellOf(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const cell = target.closest("th,td");
  return cell instanceof HTMLElement && cell.dataset.row !== undefined ? cell : null;
}

function wireWidget(view: EditorView, wrap: HTMLElement): void {
  wrap.addEventListener("mousedown", (ev) => {
    const target = ev.target as Element | null;
    if (target?.closest(".cm-s-table__input, .cm-s-table__more")) return; // the control's own
    const cell = cellOf(ev.target);
    if (!cell) return;
    // preventDefault, and no dispatch: the caret must stay OUT of the block
    // or the reveal rule takes the table away on the click that asked to
    // edit it. What moves is focus, into the box.
    ev.preventDefault();
    if (ev.button === 2) return; // the contextmenu handler below owns it
    openCell(view, wrap, Number(cell.dataset.row), Number(cell.dataset.col), "end");
  });

  wrap.addEventListener("contextmenu", (ev) => {
    const cell = cellOf(ev.target);
    if (!cell) return;
    ev.preventDefault();
    ev.stopPropagation();
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    // Open the box first: a menu of eighteen rows about "this cell" has to
    // say which cell, and the box is how the table says it.
    openCell(view, wrap, row, col, "end");
    openCellMenu(view, wrap, row, col, ev.clientX, ev.clientY, false);
  });

  // FORMAT WHEN THE READER IS DONE, not when they walk between cells. The
  // caret never enters the block while the widget is up, so the keymap's own
  // format-on-exit never fires for a table edited in place — this is that
  // rule's other half, and `scheduleFormat` refusing a block a selection
  // still touches keeps the two from ever fighting.
  wrap.addEventListener("focusout", () => {
    queueMicrotask(() => {
      if (menuUp || !wrap.isConnected) return;
      if (wrap.contains(document.activeElement)) return;
      if (open?.wrap === wrap) closeCell(true);
      const block = blockOfWrap(view, wrap);
      if (block) scheduleFormat(view, block.from);
    });
  });
}

// ── Cell navigation in the SOURCE (Tab / Shift+Tab / Enter) ─────────────────

/** Select a cell's trimmed content (so typing replaces it); an empty cell is
 *  a caret between the pads. `collapse` lands a caret at the content's end
 *  instead — Enter walks rows, and walking must not arm an overwrite. */
function selectCell(
  view: EditorView,
  cell: TableCell | undefined,
  fallback: number,
  collapse = false,
): void {
  const sel = cell
    ? collapse
      ? EditorSelection.single(cell.trimTo)
      : EditorSelection.single(cell.trimFrom, cell.trimTo)
    : EditorSelection.single(fallback);
  view.dispatch({ selection: sel, scrollIntoView: true });
}

function nextCell(view: EditorView): boolean {
  const ctx = tableContext(view.state);
  if (!ctx) return false;
  if (completionStatus(view.state) !== null) return false; // Enter/Tab belong to the tooltip
  const head = view.state.selection.main.head;
  const rows = navRows(ctx.shape);
  const row = rowIndexAt(ctx.shape, head);
  if (row === null) return false;
  const col = colIndexAt(rows[row], head);
  if (col + 1 < rows[row].cells.length) {
    selectCell(view, rows[row].cells[col + 1], rows[row].to);
    return true;
  }
  if (row + 1 < rows.length) {
    selectCell(view, rows[row + 1].cells[0], rows[row + 1].to);
    return true;
  }
  // Tab in the last cell: the table grows a row.
  const rowText = emptyRowText(ctx.shape.header.cells.length);
  const first = splitRowCells(rowText, ctx.blockTo + 1)[0];
  view.dispatch({
    changes: { from: ctx.blockTo, insert: "\n" + rowText },
    selection: { anchor: first.trimFrom },
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
}

function prevCell(view: EditorView): boolean {
  const ctx = tableContext(view.state);
  if (!ctx) return false;
  if (completionStatus(view.state) !== null) return false;
  const head = view.state.selection.main.head;
  const rows = navRows(ctx.shape);
  const row = rowIndexAt(ctx.shape, head);
  if (row === null) return false;
  const col = colIndexAt(rows[row], head);
  if (col > 0) {
    selectCell(view, rows[row].cells[col - 1], rows[row].to);
  } else if (row > 0) {
    const prev = rows[row - 1];
    selectCell(view, prev.cells[prev.cells.length - 1], prev.to);
  }
  // First cell: consumed with no move — falling through would hand Shift+Tab
  // to the indent keymap, which dedents the table's own line.
  return true;
}

function rowDown(view: EditorView): boolean {
  const ctx = tableContext(view.state);
  if (!ctx) return false;
  if (completionStatus(view.state) !== null) return false; // Enter accepts the completion
  const head = view.state.selection.main.head;
  const rows = navRows(ctx.shape);
  const row = rowIndexAt(ctx.shape, head);
  if (row === null) return false;
  const col = colIndexAt(rows[row], head);
  if (row + 1 < rows.length) {
    const target = rows[row + 1];
    selectCell(view, target.cells[Math.min(col, target.cells.length - 1)], target.to, true);
    return true;
  }
  // Last row: Enter leaves the table downward instead of splitting a row —
  // a newline inside a row is not a taller cell, it is two broken tables.
  if (ctx.blockTo >= view.state.doc.length) {
    view.dispatch({
      changes: { from: ctx.blockTo, insert: "\n" },
      selection: { anchor: ctx.blockTo + 1 },
      scrollIntoView: true,
      userEvent: "input",
    });
  } else {
    view.dispatch({ selection: { anchor: ctx.blockTo + 1 }, scrollIntoView: true });
  }
  return true;
}

// ── Row / column moves (Alt+arrows) ─────────────────────────────────────────

function moveRowCmd(dir: 1 | -1) {
  return (view: EditorView): boolean => {
    const ctx = tableContext(view.state);
    if (!ctx) return false;
    const head = view.state.selection.main.head;
    const bodyIdx = ctx.shape.body.findIndex((l) => head >= l.from && head <= l.to);
    // Header/delimiter: consume without moving. Falling through would hand
    // Alt+arrow to moveLineUp/Down, which drags the header line out of the
    // block — the exact corruption this keymap exists to prevent.
    if (bodyIdx === -1) return true;
    const res = moveTableRow(ctx.src, bodyIdx, dir);
    if (!res) return true;
    const offset = head - ctx.shape.body[bodyIdx].from; // caret rides its row
    const newShape = parseTable(res.src, ctx.blockFrom);
    const newLine = newShape?.body[res.row];
    const anchor = newLine ? Math.min(newLine.from + offset, newLine.to) : ctx.blockFrom;
    view.dispatch({
      changes: { from: ctx.blockFrom, to: ctx.blockTo, insert: res.src },
      selection: { anchor },
      scrollIntoView: true,
      userEvent: "move",
    });
    return true;
  };
}

function moveColCmd(arrow: "left" | "right") {
  return (view: EditorView): boolean => {
    const ctx = tableContext(view.state);
    if (!ctx) return false;
    const head = view.state.selection.main.head;
    const rows = navRows(ctx.shape);
    const row = rowIndexAt(ctx.shape, head);
    if (row === null) return false;
    const col = colIndexAt(rows[row], head);
    // Arrows are VISUAL: in an RTL table (Arabic header) the column to the
    // caret's right is the logically previous one. The header's own
    // direction decides, same as the rendered table does.
    const rtl = view.textDirectionAt(ctx.shape.header.from) === Direction.RTL;
    const dir = ((arrow === "right" ? 1 : -1) * (rtl ? -1 : 1)) as 1 | -1;
    const res = moveTableColumn(ctx.src, col, dir);
    if (!res) return true; // edge: consumed, nothing sheared
    const newShape = parseTable(res.src, ctx.blockFrom);
    const newCell = newShape ? navRows(newShape)[row]?.cells[res.col] : undefined;
    view.dispatch({
      changes: { from: ctx.blockFrom, to: ctx.blockTo, insert: res.src },
      selection: { anchor: newCell ? newCell.trimFrom : ctx.blockFrom },
      scrollIntoView: true,
      userEvent: "move",
    });
    return true;
  };
}

// ── Format on exit ──────────────────────────────────────────────────────────

/** The table block (full lines) around the main head, or null. */
function blockRangeAt(state: EditorState): { from: number; to: number } | null {
  const node = tableNodeAt(state, state.selection.main.head);
  if (!node) return null;
  const doc = state.doc;
  return { from: doc.lineAt(node.from).from, to: doc.lineAt(node.to).to };
}

/** Prettify the block that WAS under the caret, off the update cycle (a
 *  dispatch inside update() is illegal). Re-resolved from scratch when the
 *  microtask runs: the block may have moved, shrunk, or stopped being a
 *  table, and formatTable refusing to parse is the no-op safety net. */
function scheduleFormat(view: EditorView, pos: number): void {
  queueMicrotask(() => {
    if (!view.dom.isConnected) return;
    const state = view.state;
    const node = tableNodeAt(state, Math.min(pos, state.doc.length));
    if (!node) return;
    const doc = state.doc;
    const from = doc.lineAt(node.from).from;
    const to = doc.lineAt(node.to).to;
    // Re-entered (or a second selection range still touches it): not an exit.
    if (state.selection.ranges.some((r) => r.from <= to && r.to >= from)) return;
    const src = doc.sliceString(from, to);
    const pretty = formatTable(src);
    if (pretty === src) return;
    view.dispatch({ changes: { from, to, insert: pretty }, userEvent: "format.table" });
  });
}

const tableFormatOnExit = ViewPlugin.fromClass(
  class {
    prev: { from: number; to: number } | null;
    constructor(readonly view: EditorView) {
      this.prev = blockRangeAt(view.state);
    }
    update(u: ViewUpdate): void {
      if (!u.selectionSet && !u.docChanged) return;
      const cur = blockRangeAt(u.state);
      let prev = this.prev;
      if (prev && u.docChanged) {
        prev = { from: u.changes.mapPos(prev.from, 1), to: u.changes.mapPos(prev.to, -1) };
      }
      this.prev = cur;
      if (!prev || (cur && cur.from === prev.from)) return; // never left
      // An undo that lands the caret outside must not be answered with a
      // fresh format edit — it would fork the history the user is walking.
      const history = u.transactions.some((tr) => {
        const e = tr.annotation(Transaction.userEvent);
        return e !== undefined && (e.startsWith("undo") || e.startsWith("redo"));
      });
      if (history) return;
      scheduleFormat(this.view, prev.from);
    }
    destroy(): void {
      if (open?.view === this.view) closeCell(false);
      if (lastTouched?.view === this.view) lastTouched = null;
    }
  },
);

// ── The palette's doors ─────────────────────────────────────────────────────

/** The table a palette row acts on: the one the CARET is in (its source is
 *  revealed, so the reader can see what they are about to change), and
 *  failing that the cell they were last editing in place — where the caret
 *  is deliberately elsewhere. Null when neither, and the caller says so. */
function paletteTarget(
  view: EditorView,
): { wrap: HTMLElement; row: number; col: number } | { ctx: TableCtx } | null {
  const ctx = tableContext(view.state);
  if (ctx) return { ctx };
  if (lastTouched && lastTouched.view === view && lastTouched.wrap.isConnected) {
    return { wrap: lastTouched.wrap, row: lastTouched.row, col: lastTouched.col };
  }
  return null;
}

/** Run one palette row. Answers false when the caret is nowhere near a table,
 *  so the palette can say so rather than doing nothing visible. */
export function runTableCommand(view: EditorView, cmd: PaletteTableCmd): boolean {
  const target = paletteTarget(view);
  if (!target) return false;
  if ("wrap" in target) return runCommand(view, target.wrap, target.row, target.col, cmd);

  // The caret is in the source: there is no widget to talk to, so the same
  // model command runs against the block under the caret and the caret lands
  // in the cell the command made.
  const { ctx } = target;
  const head = view.state.selection.main.head;
  const row = rowIndexAt(ctx.shape, head) ?? 0;
  const col = colIndexAt(navRows(ctx.shape)[row], head);
  if (cmd === "editSource") {
    view.focus();
    return true; // the caret is already in it — this row is the way IN
  }
  let src: string;
  let landRow = row;
  let landCol = col;
  if (cmd === "rowAbove" || cmd === "rowBelow") {
    const res = insertTableRow(ctx.src, row, cmd === "rowAbove" ? "above" : "below");
    if (!res) return false;
    src = res.src;
    landRow = res.row;
    landCol = 0;
  } else {
    const res = insertTableColumn(ctx.src, col, cmd === "colBefore" ? "before" : "after");
    if (!res) return false;
    src = res.src;
    landCol = res.col;
  }
  // Prettified in the same transaction, for the reason applyBlock is: the
  // caret is IN the source here, so a ragged block is not only an extra undo
  // step, it is what the reader is looking at.
  src = formatTable(src);
  const next = parseTable(src, ctx.blockFrom);
  const landing = next ? navRows(next)[landRow]?.cells[landCol]?.trimFrom : undefined;
  view.dispatch({
    changes: { from: ctx.blockFrom, to: ctx.blockTo, insert: src },
    selection: { anchor: landing ?? ctx.blockFrom },
    annotations: isolateHistory.of("full"),
    scrollIntoView: true,
    userEvent: "input.table",
  });
  view.focus();
  return true;
}

/** "Insert table…" — the picker's answer, dropped at the caret. The caret
 *  lands AFTER the block so the widget draws, and the box opens on the first
 *  header cell: the reader asked for a table, not for a screen of pipes. */
export function insertTable(view: EditorView, rows: number, cols: number): void {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  const skeleton = tableSkeleton(rows, cols);
  // A table is a BLOCK: it needs a line of its own and a blank line after it,
  // or the paragraph it lands in swallows the header row.
  const lead = line.text.trim() === "" ? "" : "\n\n";
  const insert = `${lead}${skeleton}\n\n`;
  const blockFrom = head + lead.length;
  view.dispatch({
    changes: { from: head, insert },
    selection: { anchor: blockFrom + skeleton.length + 1 },
    annotations: isolateHistory.of("full"),
    scrollIntoView: true,
    userEvent: "input.table",
  });
  view.focus();
  // The widget is drawn by the dispatch above; find it by asking the view
  // where each rendered table sits, which is the one answer that is current.
  requestAnimationFrame(() => {
    for (const el of view.dom.querySelectorAll<HTMLElement>(".cm-s-table")) {
      let pos: number;
      try {
        pos = view.posAtDOM(el);
      } catch {
        continue;
      }
      if (pos === blockFrom) {
        openCell(view, el, 0, 0, "select");
        return;
      }
    }
  });
}

// ── Assembly ────────────────────────────────────────────────────────────────

export function markdownTables(): Extension {
  return [
    tableField,
    // Prec.high: inside a table these keys outrank indentWithTab, the
    // default Enter and Alt+arrow moveLine; outside, every command returns
    // false before touching anything, so the rest of the stack is exactly
    // as it was.
    Prec.high(
      keymap.of([
        // keymap: scTableCells scTableCellsBack scTableRowDown scTableMoveRow scTableMoveColumn
        { key: "Tab", run: nextCell, shift: prevCell },
        { key: "Enter", run: rowDown },
        { key: "Alt-ArrowUp", run: moveRowCmd(-1) },
        { key: "Alt-ArrowDown", run: moveRowCmd(1) },
        { key: "Alt-ArrowLeft", run: moveColCmd("left") },
        { key: "Alt-ArrowRight", run: moveColCmd("right") },
      ]),
    ),
    tableFormatOnExit,
  ];
}
