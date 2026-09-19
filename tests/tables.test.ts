// Tables: the string model under the live-preview table editor.
//
// Everything here exercises client/editor/tableModel.ts — the pure half of
// the table feature, split from tables.ts precisely so this file can load it
// under `node --test` (the CodeMirror/renderer half drags .css through its
// import chain, which node cannot parse).
//
// The invariants that matter, in order of how expensive their violation is:
//   1. A structural edit (column move, prettify) NEVER rewrites cell content —
//      `\|` escapes and pipes inside inline code included. Splitting is the
//      only operation allowed to look inside a cell.
//   2. A column move carries the alignment row with it. A move that shears
//      the delimiter walks every column's alignment into its neighbour's,
//      which corrupts silently — the table still parses, it just lies.
//   3. Formatting is idempotent and refuses non-tables: it runs unattended on
//      every caret exit, so "almost a table" must round-trip untouched.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  alignName,
  cellEdit,
  cellText,
  colIndexAt,
  columnCount,
  deleteTableColumn,
  deleteTableRow,
  displayWidth,
  duplicateTableRow,
  emptyRowText,
  escapeCellText,
  formatTable,
  insertTableColumn,
  insertTableRow,
  moveTableColumn,
  moveTableRow,
  parseTable,
  rowCount,
  rowIndexAt,
  setColumnAlign,
  sortTableRows,
  splitRowCells,
  tableSkeleton,
} from "../client/editor/tableModel.ts";

const TABLE = ["| Name | Qty | Price |", "| :--- | :-: | ----: |", "| Apple | 3 | $1.20 |", "| Pear | 12 | $0.90 |"].join("\n");

describe("splitRowCells", () => {
  it("splits a piped row into trimmed cells with source offsets", () => {
    const cells = splitRowCells("| a | bc |", 100);
    assert.equal(cells.length, 2);
    assert.deepEqual(cells.map((c) => c.text), ["a", "bc"]);
    // "| a | bc |" — 'a' at index 2, 'bc' at 6.
    assert.equal(cells[0].trimFrom, 102);
    assert.equal(cells[0].trimTo, 103);
    assert.equal(cells[1].trimFrom, 106);
    assert.equal(cells[1].trimTo, 108);
  });

  it("handles rows without leading/trailing pipes", () => {
    assert.deepEqual(splitRowCells("a | b").map((c) => c.text), ["a", "b"]);
    assert.deepEqual(splitRowCells("| a | b").map((c) => c.text), ["a", "b"]);
    assert.deepEqual(splitRowCells("a | b |").map((c) => c.text), ["a", "b"]);
  });

  it("keeps \\| inside a cell and lets \\\\| split (parity, not presence)", () => {
    assert.deepEqual(splitRowCells("| a \\| b | c |").map((c) => c.text), ["a \\| b", "c"]);
    // Backslash-backslash is a literal backslash; the pipe after it is real.
    assert.deepEqual(splitRowCells("| a \\\\| b |").map((c) => c.text), ["a \\\\", "b"]);
  });

  it("collapses an empty cell's caret target one character in from the pipe", () => {
    const cells = splitRowCells("|  |  |");
    assert.equal(cells.length, 2);
    // `|  |` — raw segment starts at 1; the caret goes to 2, between the
    // pads, not flush against the wall.
    assert.equal(cells[0].trimFrom, 2);
    assert.equal(cells[0].trimTo, 2);
  });

  it("keeps a trailing escaped pipe as content, not punctuation", () => {
    assert.deepEqual(splitRowCells("| a | b \\|").map((c) => c.text), ["a", "b \\|"]);
  });
});

describe("parseTable", () => {
  it("reads header, delimiter, alignment and body", () => {
    const shape = parseTable(TABLE);
    assert.ok(shape);
    assert.deepEqual(shape.header.cells.map((c) => c.text), ["Name", "Qty", "Price"]);
    assert.equal(shape.body.length, 2);
    assert.deepEqual(shape.aligns, [
      { left: true, right: false },
      { left: true, right: true },
      { left: false, right: true },
    ]);
  });

  it("refuses when the second line is not a delimiter row", () => {
    assert.equal(parseTable("| a | b |\n| c | d |"), null);
    assert.equal(parseTable("just prose"), null);
    assert.equal(parseTable("| lone header |"), null);
  });

  it("maps the delimiter line to the header for navigation", () => {
    const shape = parseTable(TABLE)!;
    assert.equal(rowIndexAt(shape, shape.delimiter.from + 3), 0);
    assert.equal(rowIndexAt(shape, shape.body[1].from + 2), 2);
    assert.equal(rowIndexAt(shape, shape.to + 5), null);
  });

  it("assigns an offset on a pipe to the nearest unfinished cell", () => {
    const shape = parseTable(TABLE)!;
    // Offset 0 is the leading pipe of the header — cell 0's problem.
    assert.equal(colIndexAt(shape.header, shape.from), 0);
    assert.equal(colIndexAt(shape.header, shape.header.to), 2);
  });
});

describe("displayWidth", () => {
  it("counts CJK and emoji as two columns, Latin and Arabic as one", () => {
    assert.equal(displayWidth("abc"), 3);
    assert.equal(displayWidth("表格"), 4);
    assert.equal(displayWidth("表a"), 3);
    assert.equal(displayWidth("🙂"), 2);
    assert.equal(displayWidth("جدول"), 4); // Arabic is cursive, not wide
  });

  it("clusters combining marks with their base", () => {
    // e + combining acute is one grapheme, one column.
    assert.equal(displayWidth("é"), 1);
  });
});

describe("formatTable", () => {
  it("pads every column to its widest cell and stretches the delimiter", () => {
    const pretty = formatTable("| a | bbbb |\n| - | - |\n| cc | d |");
    assert.equal(pretty, ["| a   | bbbb |", "| --- | ---- |", "| cc  | d    |"].join("\n"));
  });

  it("is idempotent", () => {
    const once = formatTable(TABLE);
    assert.equal(formatTable(once), once);
  });

  it("keeps explicit alignment colons where the author put them", () => {
    const pretty = formatTable(TABLE);
    const delim = pretty.split("\n")[1];
    assert.match(delim, /^\| :-+ \| :-+: \| -+: \|$/);
  });

  it("pads right- and center-aligned cells on the correct side", () => {
    const pretty = formatTable("| head | mid |\n| ---: | :-: |\n| x | y |");
    const row = pretty.split("\n")[2];
    assert.equal(row, "|    x |  y  |");
  });

  it("never rewrites cell content: escapes and code-span pipes survive", () => {
    const src = "| a \\| b | `x` |\n| - | - |\n| `c \\| d` | e |";
    const before = parseTable(src)!;
    const after = parseTable(formatTable(src))!;
    assert.deepEqual(
      after.header.cells.map((c) => c.text),
      before.header.cells.map((c) => c.text),
    );
    assert.deepEqual(
      after.body[0].cells.map((c) => c.text),
      before.body[0].cells.map((c) => c.text),
    );
  });

  it("squares off short rows and adopts stray extra columns", () => {
    const pretty = formatTable("| a | b |\n| - | - |\n| only |\n| x | y | extra |");
    const lines = pretty.split("\n");
    // Every line ends with the same number of cells.
    for (const line of lines) {
      assert.equal(splitRowCells(line).length, 3);
    }
  });

  it("lines the pipes up even when a column holds CJK", () => {
    const pretty = formatTable("| 表格 | b |\n| - | - |\n| x | 说明文字 |");
    const widths = pretty.split("\n").map((l) => displayWidth(l));
    assert.equal(new Set(widths).size, 1);
  });

  it("returns a non-table untouched", () => {
    const notATable = "prose with | a pipe\nand another line";
    assert.equal(formatTable(notATable), notATable);
  });
});

describe("moveTableColumn", () => {
  it("moves header, alignment row and every body row together", () => {
    const res = moveTableColumn(TABLE, 0, 1);
    assert.ok(res);
    assert.equal(res.col, 1);
    const shape = parseTable(res.src)!;
    assert.deepEqual(shape.header.cells.map((c) => c.text), ["Qty", "Name", "Price"]);
    assert.deepEqual(shape.body[0].cells.map((c) => c.text), ["3", "Apple", "$1.20"]);
    // The alignment travelled with its column — Name is still :---, Qty :-:.
    assert.deepEqual(shape.aligns[0], { left: true, right: true });
    assert.deepEqual(shape.aligns[1], { left: true, right: false });
  });

  it("refuses at the edges instead of wrapping", () => {
    assert.equal(moveTableColumn(TABLE, 0, -1), null);
    assert.equal(moveTableColumn(TABLE, 2, 1), null);
  });

  it("pads a short row rather than shearing it", () => {
    const src = "| a | b |\n| - | - |\n| only |";
    const res = moveTableColumn(src, 0, 1)!;
    const shape = parseTable(res.src)!;
    assert.deepEqual(shape.body[0].cells.map((c) => c.text), ["", "only"]);
  });
});

describe("moveTableRow", () => {
  it("swaps adjacent body rows and reports the new index", () => {
    const res = moveTableRow(TABLE, 0, 1);
    assert.ok(res);
    assert.equal(res.row, 1);
    const shape = parseTable(res.src)!;
    assert.deepEqual(shape.body.map((r) => r.cells[0].text), ["Pear", "Apple"]);
  });

  it("refuses at the edges — the header is not a destination", () => {
    assert.equal(moveTableRow(TABLE, 0, -1), null);
    assert.equal(moveTableRow(TABLE, 1, 1), null);
  });
});

describe("emptyRowText", () => {
  it("matches the column count Tab-in-the-last-cell needs", () => {
    assert.equal(splitRowCells(emptyRowText(3)).length, 3);
    assert.equal(splitRowCells(emptyRowText(1)).length, 1);
  });
});

// ── The commands the table UI runs ──────────────────────────────────────────
//
// Two invariants run through every case below, and they are the ones a
// reader would notice the loss of before they noticed anything else:
//
//   THE ALIGNMENT ROW TRAVELS WITH ITS COLUMN. Insert, delete and move all
//   rewrite the delimiter in the same pass as the rows. A command that misses
//   it corrupts silently: the table still parses, it just lies about which
//   column is centred.
//
//   BYTES NOBODY TOUCHED DO NOT MOVE. A cell edit is one range; every other
//   cell in the block comes out of it identical, escapes and all. That is
//   what makes the widget able to redraw one `<td>`, and what makes one
//   committed cell one undo step.

/** Nav-row/column text as a plain grid, for asserting a whole table at once. */
const grid = (src: string): string[][] => {
  const shape = parseTable(src)!;
  const cols = columnCount(shape);
  return [shape.header, ...shape.body].map((row) =>
    Array.from({ length: cols }, (_v, j) => row.cells[j]?.text ?? ""),
  );
};

describe("escapeCellText", () => {
  it("escapes a typed pipe and leaves an escaped one alone", () => {
    assert.equal(escapeCellText("a | b"), "a \\| b");
    assert.equal(escapeCellText("a \\| b"), "a \\| b");
    // `\\` is a literal backslash, so the pipe after it is a real separator
    // and has to be escaped — parity, not presence.
    assert.equal(escapeCellText("a \\\\| b"), "a \\\\\\| b");
  });

  it("flattens newlines and trims, because a row is a line", () => {
    assert.equal(escapeCellText("  one\ntwo  "), "one two");
    assert.equal(escapeCellText("a<br>b"), "a<br>b");
  });
});

describe("cellEdit", () => {
  it("replaces one cell's raw segment and nothing else", () => {
    const edit = cellEdit(TABLE, 2, 1, "7")!;
    const out = TABLE.slice(0, edit.from) + edit.insert + TABLE.slice(edit.to);
    assert.equal(grid(out)[2][1], "7");
    // Every OTHER line is byte for byte what it was.
    const before = TABLE.split("\n");
    const after = out.split("\n");
    assert.equal(after[0], before[0]);
    assert.equal(after[1], before[1]);
    assert.equal(after[2], before[2]);
  });

  it("escapes the pipes a typed cell brought with it", () => {
    const edit = cellEdit(TABLE, 1, 0, "Apple | Pear")!;
    const out = TABLE.slice(0, edit.from) + edit.insert + TABLE.slice(edit.to);
    const shape = parseTable(out)!;
    assert.equal(shape.body[0].cells.length, 3); // still three cells
    assert.equal(shape.body[0].cells[0].text, "Apple \\| Pear");
  });

  it("grows a short row rather than refusing the cell", () => {
    const src = "| a | b |\n| - | - |\n| only |";
    const edit = cellEdit(src, 1, 1, "second")!;
    const out = src.slice(0, edit.from) + edit.insert + src.slice(edit.to);
    assert.deepEqual(grid(out)[1], ["only", "second"]);
  });

  it("refuses a column the table does not have", () => {
    assert.equal(cellEdit(TABLE, 0, 9, "x"), null);
    assert.equal(cellEdit("prose", 0, 0, "x"), null);
  });
});

describe("insertTableRow", () => {
  it("adds an empty row below, keeping the column count", () => {
    const res = insertTableRow(TABLE, 1, "below")!;
    assert.equal(res.row, 2);
    const shape = parseTable(res.src)!;
    assert.equal(rowCount(shape), 4);
    assert.deepEqual(grid(res.src)[2], ["", "", ""]);
    assert.deepEqual(grid(res.src)[3], ["Pear", "12", "$0.90"]);
  });

  it("adds above a body row and refuses above the header", () => {
    const res = insertTableRow(TABLE, 1, "above")!;
    assert.deepEqual(grid(res.src)[1], ["", "", ""]);
    assert.equal(insertTableRow(TABLE, 0, "above"), null);
  });

  it("below the header lands in the first body position", () => {
    const res = insertTableRow(TABLE, 0, "below")!;
    assert.equal(res.row, 1);
    assert.deepEqual(grid(res.src)[0], ["Name", "Qty", "Price"]);
    assert.deepEqual(grid(res.src)[1], ["", "", ""]);
    // The alignment row is still line 1 and still says what it said.
    assert.equal(res.src.split("\n")[1], TABLE.split("\n")[1]);
  });
});

describe("deleteTableRow / duplicateTableRow", () => {
  it("deletes a body row and reports where the caret goes", () => {
    const res = deleteTableRow(TABLE, 1)!;
    assert.deepEqual(grid(res.src).map((r) => r[0]), ["Name", "Pear"]);
    assert.equal(res.row, 1);
  });

  it("clamps to the last row when the last row is what went", () => {
    const res = deleteTableRow(TABLE, 2)!;
    assert.equal(res.row, 1);
    assert.equal(parseTable(res.src)!.body.length, 1);
  });

  it("refuses the header — a table without one is prose full of pipes", () => {
    assert.equal(deleteTableRow(TABLE, 0), null);
  });

  it("duplicates a row directly beneath itself, bytes and all", () => {
    const res = duplicateTableRow(TABLE, 1)!;
    assert.equal(res.row, 2);
    const lines = res.src.split("\n");
    assert.equal(lines[2], lines[3]);
    assert.equal(parseTable(res.src)!.body.length, 3);
  });

  it("duplicates the HEADER into the first body row, not into a second header", () => {
    const res = duplicateTableRow(TABLE, 0)!;
    assert.equal(res.row, 1);
    assert.deepEqual(grid(res.src)[0], ["Name", "Qty", "Price"]);
    assert.deepEqual(grid(res.src)[1], ["Name", "Qty", "Price"]);
    assert.equal(res.src.split("\n")[1], TABLE.split("\n")[1]);
  });
});

describe("insertTableColumn / deleteTableColumn", () => {
  it("inserts into the header, the alignment row and every body row", () => {
    const res = insertTableColumn(TABLE, 1, "before")!;
    assert.equal(res.col, 1);
    const shape = parseTable(res.src)!;
    assert.equal(columnCount(shape), 4);
    assert.deepEqual(grid(res.src)[0], ["Name", "", "Qty", "Price"]);
    assert.deepEqual(grid(res.src)[1], ["Apple", "", "3", "$1.20"]);
    // The alignments that existed kept their columns, and the new one is bare.
    assert.equal(alignName(shape, 0), "left");
    assert.equal(alignName(shape, 1), "none");
    assert.equal(alignName(shape, 2), "center");
    assert.equal(alignName(shape, 3), "right");
  });

  it("inserts after the last column", () => {
    const res = insertTableColumn(TABLE, 2, "after")!;
    assert.equal(res.col, 3);
    assert.deepEqual(grid(res.src)[0], ["Name", "Qty", "Price", ""]);
  });

  it("deletes a column out of every line, alignment included", () => {
    const res = deleteTableColumn(TABLE, 1)!;
    assert.equal(res.col, 1);
    const shape = parseTable(res.src)!;
    assert.equal(columnCount(shape), 2);
    assert.deepEqual(grid(res.src)[0], ["Name", "Price"]);
    assert.equal(alignName(shape, 0), "left");
    assert.equal(alignName(shape, 1), "right");
  });

  it("refuses the last column", () => {
    const one = "| a |\n| - |\n| b |";
    assert.equal(deleteTableColumn(one, 0), null);
  });

  it("never rewrites a cell it is only moving past", () => {
    const src = "| a \\| b | `x` |\n| - | - |\n| c | d |";
    const res = insertTableColumn(src, 0, "after")!;
    assert.deepEqual(grid(res.src)[0], ["a \\| b", "", "`x`"]);
    assert.deepEqual(grid(res.src)[1], ["c", "", "d"]);
  });

  it("pads a RAGGED table's delimiter with a delimiter, not with a blank", () => {
    // GFM lets a row carry more cells than the alignment row — an unescaped
    // pipe inside a code span is one way to get there. Padding the delimiter
    // with " " would write `| |` into it, which is not a delimiter cell: the
    // block stops parsing as a table and every later command refuses on a
    // table the reader can plainly see.
    const src = "| a | `x|y` |\n| - | - |\n| c | d |";
    assert.equal(parseTable(src)!.header.cells.length, 3);
    for (const out of [
      insertTableColumn(src, 0, "after")!.src,
      deleteTableColumn(src, 0)!.src,
      moveTableColumn(src, 0, 1)!.src,
    ]) {
      assert.ok(parseTable(out), `still a table: ${JSON.stringify(out)}`);
    }
  });
});

describe("setColumnAlign", () => {
  it("sets each alignment and keeps the delimiter's width", () => {
    const before = TABLE.split("\n")[1];
    for (const [want, re] of [
      ["left", /^\|.*\| :-+ \|/],
      ["right", /^\|.*\| -+: \|/],
      ["center", /^\|.*\| :-+: \|/],
      ["none", /^\|.*\| -+ \|/],
    ] as const) {
      const out = setColumnAlign(TABLE, 1, want)!;
      const delim = out.split("\n")[1];
      assert.equal(delim.length, before.length, `${want} changed the width`);
      assert.match(delim, re);
      assert.equal(alignName(parseTable(out)!, 1), want === "none" ? "none" : want);
    }
  });

  it("leaves the rows alone", () => {
    const out = setColumnAlign(TABLE, 0, "center")!;
    const a = TABLE.split("\n");
    const b = out.split("\n");
    assert.equal(b[0], a[0]);
    assert.equal(b[2], a[2]);
    assert.equal(b[3], a[3]);
  });

  it("refuses a column the alignment row does not have", () => {
    assert.equal(setColumnAlign(TABLE, 7, "left"), null);
  });
});

describe("sortTableRows", () => {
  const T = [
    "| Name | Qty |",
    "| --- | --- |",
    "| pear | 12 |",
    "| Apple | 3 |",
    "| fig | |",
  ].join("\n");

  it("sorts A→Z case-insensitively and never moves the header", () => {
    const out = sortTableRows(T, 0, "az")!;
    assert.deepEqual(grid(out).map((r) => r[0]), ["Name", "Apple", "fig", "pear"]);
    assert.equal(out.split("\n")[1], T.split("\n")[1]);
  });

  it("sorts Z→A", () => {
    const out = sortTableRows(T, 0, "za")!;
    assert.deepEqual(grid(out).map((r) => r[0]), ["Name", "pear", "fig", "Apple"]);
  });

  it("sorts numerically, and a cell with no number in it goes last", () => {
    const out = sortTableRows(T, 1, "numeric")!;
    assert.deepEqual(grid(out).map((r) => r[0]), ["Name", "Apple", "pear", "fig"]);
  });

  it("reads grouped and Arabic-Indic digits as the numbers they are", () => {
    const src = ["| n |", "| - |", "| 1,204 |", "| ٩٨ |", "| 12 |"].join("\n");
    const out = sortTableRows(src, 0, "numeric")!;
    assert.deepEqual(grid(out).map((r) => r[0]), ["n", "12", "٩٨", "1,204"]);
  });

  it("is stable, so a second sort keeps the first one's order inside ties", () => {
    const src = ["| k | v |", "| - | - |", "| a | 2 |", "| a | 1 |"].join("\n");
    const out = sortTableRows(src, 0, "az")!;
    assert.deepEqual(grid(out)[1], ["a", "2"]);
    assert.deepEqual(grid(out)[2], ["a", "1"]);
  });

  it("refuses a column that is not there", () => {
    assert.equal(sortTableRows(T, 5, "az"), null);
    assert.equal(sortTableRows("prose", 0, "az"), null);
  });
});

describe("tableSkeleton", () => {
  it("counts the header among the rows the picker drew", () => {
    const shape = parseTable(tableSkeleton(3, 4))!;
    assert.equal(rowCount(shape), 3);
    assert.equal(columnCount(shape), 4);
    assert.equal(shape.body.length, 2);
  });

  it("is empty everywhere, and parses as a table", () => {
    const src = tableSkeleton(2, 2);
    assert.ok(parseTable(src));
    for (const row of grid(src)) for (const cell of row) assert.equal(cell, "");
  });

  it("never produces a table with no row and no column", () => {
    assert.ok(parseTable(tableSkeleton(0, 0)));
    assert.equal(columnCount(parseTable(tableSkeleton(0, 0))!), 1);
  });
});

describe("cellText / alignName / counts", () => {
  it("hands back the source spelling, escapes intact", () => {
    const shape = parseTable("| a \\| b |\n| - |\n| c |")!;
    assert.equal(cellText(shape, 0, 0), "a \\| b");
    assert.equal(cellText(shape, 1, 0), "c");
    assert.equal(cellText(shape, 9, 0), "");
  });

  it("names every alignment the delimiter can spell", () => {
    const shape = parseTable("| a | b | c | d |\n| --- | :-- | --: | :-: |\n| 1 | 2 | 3 | 4 |")!;
    assert.equal(alignName(shape, 0), "none");
    assert.equal(alignName(shape, 1), "left");
    assert.equal(alignName(shape, 2), "right");
    assert.equal(alignName(shape, 3), "center");
  });

  it("counts a stray extra column in, so a command can square it off", () => {
    const shape = parseTable("| a | b |\n| - | - |\n| x | y | z |")!;
    assert.equal(columnCount(shape), 3);
    assert.equal(rowCount(shape), 2);
  });
});
