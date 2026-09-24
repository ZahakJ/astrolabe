// TABLE ACTIONS: the palette's wire, the source-side command, and every
// action over one fixture table.
//
// Three layers, each tested where it can be loaded under `node --test`:
//   1. client/tableActions.ts — the palette says WHAT on a window event, the
//      mounted editor answers by flipping `handled`, and a row with no table
//      under the caret says so in a toast instead of doing nothing visible.
//      A few lines of fake window/document stand in for the browser.
//   2. tableModel.ts `sourceTableCommand` — what `runTableCommand` does when
//      the caret is IN the pipes: the edit, the prettify, and the caret's
//      landing cell (tables.ts itself drags CSS and CodeMirror's DOM in).
//   3. The whole vocabulary over one fixture table (escaped pipes, inline
//      code, alignment, Arabic): add and remove a row and a column, move
//      both ways, align, sort, duplicate, and the one-cell write — with the
//      invariants that make them safe to run unattended: the result still
//      parses, no other cell's text moves, and each action has its inverse.
//
// Markdown tables have no header toggle: GFM requires the header row and the
// model keeps it (row 0 is not deletable, nothing inserts above it) — tested
// below as the refusal it is.

import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  alignName,
  cellEdit,
  cellText,
  columnCount,
  deleteTableColumn,
  deleteTableRow,
  duplicateTableRow,
  formatTable,
  insertTableColumn,
  insertTableRow,
  moveTableColumn,
  moveTableRow,
  navRows,
  parseTable,
  rowCount,
  setColumnAlign,
  sortTableRows,
  sourceTableCommand,
  type TableShape,
} from "../client/editor/tableModel.ts";

// ── 1. the palette's wire ───────────────────────────────────────────────────

/** Just enough of a document for client/toast.ts: elements with a class
 *  list, a dataset, children and a text. */
class FakeEl {
  className = "";
  textContent = "";
  dataset: Record<string, string> = {};
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  attrs: Record<string, string> = {};
  classList = {
    contains: (c: string) => this.className.split(/\s+/).includes(c),
    add: (c: string) => {
      if (!this.classList.contains(c)) this.className = `${this.className} ${c}`.trim();
    },
  };
  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
  }
  appendChild(el: FakeEl): FakeEl {
    el.parent = this;
    this.children.push(el);
    return el;
  }
  insertBefore(el: FakeEl, ref: FakeEl): FakeEl {
    el.parent = this;
    this.children.splice(this.children.indexOf(ref), 0, el);
    return el;
  }
  remove(): void {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  querySelector(sel: string): FakeEl | null {
    return this.all().find((el) => matches(el, sel)) ?? null;
  }
  all(): FakeEl[] {
    return this.children.flatMap((c) => [c, ...c.all()]);
  }
}

const body = new FakeEl();
const matches = (el: FakeEl, sel: string): boolean => {
  // ".a" or ".a:not(.b)" — the two shapes toast.ts asks for.
  const m = /^\.([\w-]+)(?::not\(\.([\w-]+)\))?$/.exec(sel);
  if (!m) throw new Error(`selector the fake does not speak: ${sel}`);
  return el.classList.contains(m[1]) && !(m[2] && el.classList.contains(m[2]));
};
const frames: (() => void)[] = [];
const g = globalThis as Record<string, unknown>;
const saved: Record<string, unknown> = {};

before(() => {
  for (const k of ["window", "document", "requestAnimationFrame"]) saved[k] = g[k];
  const win = new EventTarget() as EventTarget & { setTimeout: typeof setTimeout };
  win.setTimeout = ((fn: () => void) => 0) as unknown as typeof setTimeout; // toasts never retire mid-test
  g.window = win;
  g.document = {
    body,
    createElement: () => new FakeEl(),
    querySelector: (sel: string) => body.all().find((el) => matches(el, sel)) ?? null,
    querySelectorAll: (sel: string) => body.all().filter((el) => matches(el, sel)),
  };
  g.requestAnimationFrame = (fn: () => void) => {
    frames.push(fn);
    return frames.length;
  };
});

after(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete g[k];
    else g[k] = v;
  }
});

function flush(): void {
  while (frames.length) frames.shift()!();
}

const toasts = (): string[] => body.all().filter((el) => el.classList.contains("s-toast")).map((el) => el.textContent);

describe("tableCommand: the palette asks, the editor answers", () => {
  beforeEach(() => {
    body.children = [];
    frames.length = 0;
  });

  it("dispatches the command on the next frame, not before", async () => {
    const { tableCommand, TABLE_COMMAND_EVENT } = await import("../client/tableActions.ts");
    const heard: string[] = [];
    const listener = (e: Event) => {
      const d = (e as CustomEvent<{ cmd: string; handled: { value: boolean } }>).detail;
      heard.push(d.cmd);
      d.handled.value = true;
    };
    (g.window as EventTarget).addEventListener(TABLE_COMMAND_EVENT, listener);
    try {
      tableCommand("rowBelow");
      assert.deepEqual(heard, [], "the overlay is gone and focus is back before the command runs");
      flush();
      assert.deepEqual(heard, ["rowBelow"]);
      assert.deepEqual(toasts(), [], "a handled command says nothing");
    } finally {
      (g.window as EventTarget).removeEventListener(TABLE_COMMAND_EVENT, listener);
    }
  });

  it("says so when no editor had a table under the caret", async () => {
    const { tableCommand } = await import("../client/tableActions.ts");
    const { installDictionary, setLang } = await import("../client/i18n.ts");
    const en = (await import("../client/i18n/en.ts")).default;
    installDictionary("en", en);
    setLang("en");
    tableCommand("colAfter");
    flush(); // the command, then the toast's own fill
    flush();
    assert.deepEqual(toasts(), [en.tableNotHere]);
  });

  it("carries each palette row by name", async () => {
    const { tableCommand, TABLE_COMMAND_EVENT } = await import("../client/tableActions.ts");
    const heard: string[] = [];
    const listener = (e: Event) => {
      const d = (e as CustomEvent<{ cmd: string; handled: { value: boolean } }>).detail;
      heard.push(d.cmd);
      d.handled.value = true;
    };
    (g.window as EventTarget).addEventListener(TABLE_COMMAND_EVENT, listener);
    try {
      for (const cmd of ["rowAbove", "rowBelow", "colBefore", "colAfter", "editSource"] as const) tableCommand(cmd);
      flush();
      assert.deepEqual(heard, ["rowAbove", "rowBelow", "colBefore", "colAfter", "editSource"]);
    } finally {
      (g.window as EventTarget).removeEventListener(TABLE_COMMAND_EVENT, listener);
    }
  });
});

// ── the fixture ─────────────────────────────────────────────────────────────

const FIXTURE = [
  "| Name | Code | Qty | ملاحظة |",
  "| :--- | :-: | --: | --- |",
  "| Apple | `a\\|b` | 3 | حلو |",
  "| Pipe \\| cell | `x` | 12 | مرّ |",
  "| Pear |  | 7 | |",
].join("\n");

const grid = (shape: TableShape): string[][] => navRows(shape).map((_, r) => Array.from({ length: columnCount(shape) }, (_, c) => cellText(shape, r, c)));
const shapeOf = (src: string): TableShape => {
  const s = parseTable(src);
  assert.ok(s, `does not parse:\n${src}`);
  return s;
};
const gridOf = (src: string): string[][] => grid(shapeOf(src));
const BASE = gridOf(FIXTURE);

describe("the fixture itself", () => {
  it("parses as 4 columns × 1 header + 3 rows, with the escaped pipe and the code span inside their cells", () => {
    const s = shapeOf(FIXTURE);
    assert.equal(columnCount(s), 4);
    assert.equal(rowCount(s), 4);
    assert.equal(cellText(s, 1, 1), "`a\\|b`");
    assert.equal(cellText(s, 2, 0), "Pipe \\| cell");
    assert.deepEqual([0, 1, 2, 3].map((c) => alignName(s, c)), ["left", "center", "right", "none"]);
  });
});

// ── 2. the palette with the caret in the pipes ──────────────────────────────

describe("sourceTableCommand: the palette over the source", () => {
  const OFFSET = 40; // the block sits 40 characters into the note
  // The caret in "Apple" (row 1, col 0) and in "12" (row 2, col 2).
  const at = (needle: string): number => OFFSET + FIXTURE.indexOf(needle) + 1;

  it("adds a row below the caret's row and lands in its first cell", () => {
    const res = sourceTableCommand(FIXTURE, OFFSET, at("Apple"), "rowBelow");
    assert.ok(res);
    assert.equal(res.src, formatTable(res.src), "prettified in the same edit");
    const g2 = gridOf(res.src);
    assert.deepEqual(g2[2], ["", "", "", ""]);
    assert.deepEqual([g2[0], g2[1], ...g2.slice(3)], BASE);
    const landed = parseTable(res.src, OFFSET)!;
    assert.equal(res.anchor, navRows(landed)[2].cells[0].trimFrom);
  });

  it("adds a row above a body row, and refuses one above the header", () => {
    const res = sourceTableCommand(FIXTURE, OFFSET, at("12"), "rowAbove");
    assert.ok(res);
    assert.deepEqual(gridOf(res.src)[2], ["", "", "", ""]);
    assert.equal(sourceTableCommand(FIXTURE, OFFSET, at("Name"), "rowAbove"), null);
  });

  it("adds a column either side of the caret's column and lands in the new column, same row", () => {
    for (const [cmd, want] of [["colBefore", 2], ["colAfter", 3]] as const) {
      const res = sourceTableCommand(FIXTURE, OFFSET, at("12"), cmd);
      assert.ok(res, cmd);
      const s = parseTable(res.src, OFFSET)!;
      assert.equal(columnCount(s), 5);
      assert.deepEqual(grid(s).map((r) => r[want]), ["", "", "", ""], `${cmd}: the new column is empty`);
      assert.deepEqual(grid(s).map((r) => r.filter((_, i) => i !== want)), BASE, `${cmd}: nothing else moved`);
      assert.equal(res.anchor, navRows(s)[2].cells[want].trimFrom, `${cmd}: the caret is in the new cell`);
    }
  });

  it("answers null for something that is not a table", () => {
    assert.equal(sourceTableCommand("just a line\nand another", 0, 3, "rowBelow"), null);
  });
});

// ── 3. every action over the fixture ────────────────────────────────────────

describe("every table action over the fixture", () => {
  it("add and remove a row are inverses, anywhere in the body", () => {
    for (let row = 0; row < rowCount(shapeOf(FIXTURE)); row++) {
      const added = insertTableRow(FIXTURE, row, "below");
      assert.ok(added, `below ${row}`);
      assert.deepEqual(gridOf(added.src)[added.row], ["", "", "", ""]);
      const removed = deleteTableRow(added.src, added.row);
      assert.ok(removed);
      assert.equal(removed.src, FIXTURE, `row ${row}: add then remove is the original, byte for byte`);
    }
  });

  it("the header row cannot be removed or have a row put above it", () => {
    assert.equal(deleteTableRow(FIXTURE, 0), null);
    assert.equal(insertTableRow(FIXTURE, 0, "above"), null);
    assert.equal(insertTableRow(FIXTURE, 99, "below"), null);
  });

  it("add and remove a column are inverses, and the alignment row goes with them", () => {
    for (let col = 0; col < 4; col++) {
      for (const where of ["before", "after"] as const) {
        const added = insertTableColumn(FIXTURE, col, where);
        assert.ok(added, `${where} ${col}`);
        const s = shapeOf(added.src);
        assert.equal(columnCount(s), 5);
        assert.equal(s.aligns.length, 5, "the delimiter row grew with the table");
        const removed = deleteTableColumn(added.src, added.col);
        assert.ok(removed);
        assert.deepEqual(gridOf(removed.src), BASE, `${where} ${col}: the cells are back`);
        assert.deepEqual([0, 1, 2, 3].map((c) => alignName(shapeOf(removed.src), c)), ["left", "center", "right", "none"]);
      }
    }
  });

  it("a one-column table keeps its last column", () => {
    assert.equal(deleteTableColumn("| a |\n| - |\n| b |", 0), null);
  });

  it("moving a column there and back is the original, alignment included", () => {
    for (let col = 0; col < 3; col++) {
      const there = moveTableColumn(FIXTURE, col, 1);
      assert.ok(there);
      assert.equal(there.col, col + 1);
      const s = shapeOf(there.src);
      assert.deepEqual(grid(s).map((r) => r[col + 1]), BASE.map((r) => r[col]), "the column's cells travelled together");
      assert.equal(alignName(s, col + 1), alignName(shapeOf(FIXTURE), col), "and its alignment with them");
      const back = moveTableColumn(there.src, there.col, -1);
      assert.ok(back);
      assert.equal(back.src, FIXTURE);
    }
    assert.equal(moveTableColumn(FIXTURE, 0, -1), null, "nothing left of the first column");
    assert.equal(moveTableColumn(FIXTURE, 3, 1), null, "nothing right of the last");
  });

  it("moving a body row there and back is the original; the header is not a destination", () => {
    const there = moveTableRow(FIXTURE, 0, 1);
    assert.ok(there);
    assert.deepEqual(gridOf(there.src)[2], BASE[1]);
    const back = moveTableRow(there.src, there.row, -1);
    assert.ok(back);
    assert.equal(back.src, FIXTURE);
    assert.equal(moveTableRow(FIXTURE, 0, -1), null);
    assert.equal(moveTableRow(FIXTURE, 2, 1), null);
  });

  it("aligning a column changes that column's delimiter and no cell", () => {
    for (const align of ["left", "center", "right", "none"] as const) {
      const out = setColumnAlign(FIXTURE, 3, align);
      assert.ok(out, align);
      assert.equal(alignName(shapeOf(out), 3), align);
      assert.deepEqual([0, 1, 2].map((c) => alignName(shapeOf(out), c)), ["left", "center", "right"]);
      assert.deepEqual(gridOf(out), BASE);
    }
  });

  it("sorting reorders whole body rows and keeps the header", () => {
    const numeric = sortTableRows(FIXTURE, 2, "numeric");
    assert.ok(numeric);
    assert.deepEqual(gridOf(numeric).map((r) => r[2]), ["Qty", "3", "7", "12"]);
    const za = sortTableRows(FIXTURE, 0, "za");
    assert.ok(za);
    assert.deepEqual(gridOf(za).map((r) => r[0]), ["Name", "Pipe \\| cell", "Pear", "Apple"]);
    // a sort moves rows, never cells within a row
    const rows = new Set(BASE.slice(1).map((r) => r.join("\u0000")));
    for (const r of gridOf(za).slice(1)) assert.ok(rows.has(r.join("\u0000")));
  });

  it("duplicating a row copies it beneath itself", () => {
    const res = duplicateTableRow(FIXTURE, 2);
    assert.ok(res);
    assert.equal(res.row, 3);
    assert.deepEqual(gridOf(res.src)[3], BASE[2]);
  });

  it("prettifying is idempotent and changes no cell", () => {
    const once = formatTable(FIXTURE);
    assert.equal(formatTable(once), once);
    assert.deepEqual(gridOf(once), BASE);
  });
});

describe("the cell edit contract", () => {
  const apply = (src: string, e: { from: number; to: number; insert: string }): string => src.slice(0, e.from) + e.insert + src.slice(e.to);

  it("writes one cell and only that cell", () => {
    const e = cellEdit(FIXTURE, 1, 3, "حامض");
    assert.ok(e);
    const out = gridOf(apply(FIXTURE, e));
    assert.equal(out[1][3], "حامض");
    out[1][3] = BASE[1][3];
    assert.deepEqual(out, BASE);
  });

  it("escapes a typed pipe, keeps an escaped one, and folds a newline to a space", () => {
    const e = cellEdit(FIXTURE, 3, 0, "a | b \\| c\nd");
    assert.ok(e);
    const out = shapeOf(apply(FIXTURE, e));
    assert.equal(columnCount(out), 4, "a typed pipe did not split the cell");
    assert.equal(cellText(out, 3, 0), "a \\| b \\| c d");
  });

  it("fills a cell the row never wrote (a ragged row) without touching its neighbours", () => {
    const ragged = "| a | b | c |\n| - | - | - |\n| 1 |";
    const e = cellEdit(ragged, 1, 2, "three");
    assert.ok(e);
    const out = shapeOf(apply(ragged, e));
    assert.deepEqual(grid(out)[1], ["1", "", "three"]);
  });

  it("refuses a cell outside the table", () => {
    assert.equal(cellEdit(FIXTURE, 9, 0, "x"), null);
    assert.equal(cellEdit(FIXTURE, 1, 9, "x"), null);
    assert.equal(cellEdit("not a table", 0, 0, "x"), null);
  });
});
