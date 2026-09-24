// The GFM pipe-table MODEL: split a row into cells, locate a cell around a
// document offset, move rows and columns, and prettify the pipes.
//
// Pure string/offset logic, deliberately apart from tables.ts, and for the
// same reason calloutDefs.ts sits apart from callouts.ts: tables.ts imports
// the reading renderer (whose import chain carries .css files) and CodeMirror,
// and `node --test` can load neither, so the logic the tests must exercise
// lives here with no imports at all. tables.ts is the only other consumer.
//
// Offsets are absolute when a `base` is passed in (the caller hands us the
// document offset of the block's first character), so a caller can dispatch a
// selection straight from a CellRange without re-adding anything.

/** One cell of one row. `from`/`to` bound the RAW segment between the pipes
 *  (spaces included, escapes intact); `trimFrom`/`trimTo` bound the content a
 *  caret should land on. For an all-whitespace cell the trimmed range
 *  collapses one character in from the pipe — `|  |` puts the caret between
 *  the pads, not against the wall. */
export interface TableCell {
  from: number;
  to: number;
  trimFrom: number;
  trimTo: number;
  /** Trimmed raw text — `\|` stays `\|` so widths and round-trips see the
   *  bytes the file actually holds. */
  text: string;
}

export interface TableLine {
  from: number;
  to: number;
  cells: TableCell[];
  /** Whether the source line carried a leading / trailing pipe — a column
   *  move must rebuild the line in the author's own style, not silently
   *  reformat it (prettifying is format-on-exit's job, on exit). */
  leadPipe: boolean;
  trailPipe: boolean;
}

/** `:---` is not `---`: both render left-aligned, but the colon is the
 *  author's explicit choice and formatting must not erase it. */
export interface TableAlign {
  left: boolean;
  right: boolean;
}

export interface TableShape {
  header: TableLine;
  delimiter: TableLine;
  aligns: TableAlign[];
  body: TableLine[];
  from: number;
  to: number;
}

const DELIM_CELL_RE = /^:?-+:?$/;

/** True at index `i` when text[i] === "|" is escaped. Counts the run of
 *  backslashes before it: `\|` is a literal pipe, `\\|` is a literal
 *  backslash and then a real separator — parity, not presence. */
function pipeEscaped(text: string, i: number): boolean {
  let k = i - 1;
  while (k >= 0 && text[k] === "\\") k--;
  return (i - 1 - k) % 2 === 1;
}

/** Split one row line into cells. GFM splits BEFORE inline parsing, so an
 *  unescaped pipe splits even inside backticks; only `\|` holds a cell
 *  together — which is exactly what the reading renderer's splitRow does,
 *  and the two must agree or a widget click lands in the wrong cell. */
export function splitRowCells(text: string, base = 0): TableCell[] {
  // Segment boundaries at every unescaped pipe.
  const bounds: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "|" && !pipeEscaped(text, i)) bounds.push(i);
  }
  const segs: { from: number; to: number }[] = [];
  let start = 0;
  for (const b of bounds) {
    segs.push({ from: start, to: b });
    start = b + 1;
  }
  segs.push({ from: start, to: text.length });

  // A leading pipe leaves an empty (all-space) first segment; a trailing pipe
  // an empty last one. Both are punctuation, not cells.
  const trimmed = text.trim();
  if (segs.length > 1 && trimmed.startsWith("|") && text.slice(segs[0].from, segs[0].to).trim() === "") {
    segs.shift();
  }
  const lastPipe = text.lastIndexOf("|");
  if (
    segs.length > 1 &&
    lastPipe !== -1 &&
    !pipeEscaped(text, lastPipe) &&
    text.slice(segs[segs.length - 1].from, segs[segs.length - 1].to).trim() === "" &&
    segs[segs.length - 1].from === lastPipe + 1
  ) {
    segs.pop();
  }

  return segs.map((seg) => {
    const raw = text.slice(seg.from, seg.to);
    const lead = raw.length - raw.trimStart().length;
    const content = raw.trim();
    let trimFrom: number;
    let trimTo: number;
    if (content === "") {
      const inset = Math.min(1, raw.length);
      trimFrom = trimTo = seg.from + inset;
    } else {
      trimFrom = seg.from + lead;
      trimTo = trimFrom + content.length;
    }
    return {
      from: base + seg.from,
      to: base + seg.to,
      trimFrom: base + trimFrom,
      trimTo: base + trimTo,
      text: content,
    };
  });
}

function parseLine(text: string, base: number): TableLine {
  const trimmed = text.trim();
  return {
    from: base,
    to: base + text.length,
    cells: splitRowCells(text, base),
    leadPipe: trimmed.startsWith("|"),
    trailPipe: trimmed.length > 1 && trimmed.endsWith("|") && !pipeEscaped(trimmed, trimmed.length - 1),
  };
}

/** Parse a table block (header, delimiter, body rows — the whole block, no
 *  surrounding prose). Null when the second line is not a delimiter row:
 *  every mutation below refuses rather than guessing, because a guessed
 *  "table" edit on a paragraph full of pipes eats prose. */
export function parseTable(src: string, base = 0): TableShape | null {
  const lines = src.split("\n");
  if (lines.length < 2) return null;
  if (!lines[0].includes("|")) return null;
  const delimCells = splitRowCells(lines[1]);
  if (delimCells.length === 0 || !lines[1].includes("|")) return null;
  if (!delimCells.every((c) => DELIM_CELL_RE.test(c.text))) return null;

  let offset = base;
  const header = parseLine(lines[0], offset);
  offset += lines[0].length + 1;
  const delimiter = parseLine(lines[1], offset);
  offset += lines[1].length + 1;
  const body: TableLine[] = [];
  for (let i = 2; i < lines.length; i++) {
    body.push(parseLine(lines[i], offset));
    offset += lines[i].length + 1;
  }
  return {
    header,
    delimiter,
    aligns: delimCells.map((c) => ({
      left: c.text.startsWith(":"),
      right: c.text.endsWith(":"),
    })),
    body,
    from: base,
    to: base + src.length,
  };
}

/** Navigable rows: the header, then the body — the delimiter is punctuation
 *  and never a stop. */
export function navRows(shape: TableShape): TableLine[] {
  return [shape.header, ...shape.body];
}

/** Which navigable row an offset sits on. The delimiter line answers as the
 *  header (row 0): Tab from `| --- |` should behave like Tab from the
 *  header, not throw. Null outside the block. */
export function rowIndexAt(shape: TableShape, pos: number): number | null {
  if (pos < shape.from || pos > shape.to) return null;
  const rows = navRows(shape);
  for (let i = 0; i < rows.length; i++) {
    if (pos >= rows[i].from && pos <= rows[i].to) return i;
  }
  if (pos >= shape.delimiter.from && pos <= shape.delimiter.to) return 0;
  return null;
}

/** Which cell of `row` an offset sits in. An offset on a pipe (or in the
 *  space beside one) belongs to the nearest cell whose raw segment has not
 *  ended yet — clicking a wall should not strand the caret cell-less. */
export function colIndexAt(row: TableLine, pos: number): number {
  for (let j = 0; j < row.cells.length; j++) {
    if (pos <= row.cells[j].to) return j;
  }
  return Math.max(0, row.cells.length - 1);
}

/** Grapheme display width, for pipe alignment: CJK and emoji occupy two
 *  monospace columns, combining marks ride their base for free. Counting
 *  UTF-16 units instead put every column after a Chinese cell one pipe off
 *  per character. Intl.Segmenter clusters; the wide test is the East-Asian
 *  Wide/Fullwidth blocks plus emoji. Arabic is width 1 — cursive, not wide. */
export function displayWidth(text: string): number {
  let width = 0;
  for (const g of segment(text)) {
    const cp = g.codePointAt(0) ?? 0;
    // Zero-width joiners/marks standing alone (post-clustering this is rare).
    if (cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0xfeff) continue;
    width += isWideCodePoint(cp) ? 2 : 1;
  }
  return width;
}

function segment(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const out: string[] = [];
    for (const s of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)) {
      out.push(s.segment);
    }
    return out;
  }
  return Array.from(text); // per code point — good enough where Segmenter is missing
}

function isWideCodePoint(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK radicals, punctuation
    (cp >= 0x3041 && cp <= 0x33ff) || // kana, CJK symbols
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) || // unified ideographs
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) || // fullwidth forms
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) || // emoji
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

/** Delimiter cell for a width: the colons keep their places, the dashes
 *  stretch. Width is never below 3 so `:-:` always fits. */
function delimCell(align: TableAlign | undefined, width: number): string {
  const w = Math.max(3, width);
  const left = align?.left ? ":" : "-";
  const right = align?.right ? ":" : "-";
  return left + "-".repeat(w - 2) + right;
}

function padCell(text: string, width: number, align: TableAlign | undefined): string {
  const pad = Math.max(0, width - displayWidth(text));
  if (align?.right && !align.left) return " ".repeat(pad) + text;
  if (align?.left && align.right) {
    const l = Math.floor(pad / 2);
    return " ".repeat(l) + text + " ".repeat(pad - l);
  }
  return text + " ".repeat(pad);
}

/** Prettify a table block: every cell padded to its column's width, the
 *  delimiter stretched to match, leading/trailing pipes normalized in, short
 *  rows squared off with empty cells. Cell CONTENT is copied verbatim —
 *  trimmed, never rewritten — so `\|` escapes and pipes hidden in inline
 *  code survive because splitting is the only thing that ever looks inside.
 *  Returns the input untouched when it does not parse as a table: formatting
 *  runs on exit, and "the caret left a block that stopped being a table
 *  mid-edit" must be a no-op, not a mangling. */
export function formatTable(src: string): string {
  const shape = parseTable(src);
  if (!shape) return src;
  const rows = [shape.header, ...shape.body];
  const cols = Math.max(shape.aligns.length, ...rows.map((r) => r.cells.length));
  const widths: number[] = [];
  for (let j = 0; j < cols; j++) {
    let w = 3;
    for (const r of rows) {
      const cell = r.cells[j];
      if (cell) w = Math.max(w, displayWidth(cell.text));
    }
    widths.push(w);
  }
  const rowText = (r: TableLine): string =>
    "| " +
    widths.map((w, j) => padCell(r.cells[j]?.text ?? "", w, shape.aligns[j])).join(" | ") +
    " |";
  const delimText =
    "| " + widths.map((w, j) => delimCell(shape.aligns[j], w)).join(" | ") + " |";
  return [rowText(shape.header), delimText, ...shape.body.map(rowText)].join("\n");
}

/** Raw segments of a line, padded out to `cols` — the shared bed for every
 *  column command, which must keep every line the same shape or the edit
 *  shears.
 *
 *  `fill` is what a padded-on cell holds, and the DELIMITER's is not a space:
 *  a ragged table (a code span with a pipe in it widens the header past the
 *  alignment row, and GFM allows it) padded with blanks writes `| |` into the
 *  delimiter, which is not a delimiter cell — the block stops parsing as a
 *  table and the very next command refuses on a table the reader can see. */
function rawSegments(
  line: TableLine,
  srcBase: number,
  src: string,
  cols: number,
  fill = " ",
): string[] {
  const segs = line.cells.map((c) => src.slice(c.from - srcBase, c.to - srcBase));
  while (segs.length < cols) segs.push(fill);
  return segs;
}

/** What a padded-on cell holds on this line. */
function fillFor(line: TableLine, shape: TableShape): string {
  return line === shape.delimiter ? " --- " : " ";
}

function joinSegments(segs: string[], line: TableLine): string {
  // Padded-on cells force pipes on both sides — a row that gained a column
  // cannot express it without them.
  const lead = line.leadPipe || segs.length > line.cells.length ? "|" : "";
  const trail = line.trailPipe || segs.length > line.cells.length ? "|" : "";
  return lead + segs.join("|") + trail;
}

/** Move column `col` one step (`dir` ±1) in EVERY line of the block —
 *  header, delimiter and all body rows in the same transaction, because a
 *  column move that skips the delimiter walks each column's alignment into
 *  its neighbour's. Returns the new block and the column's new index, or
 *  null at the edges (the caller keeps the keystroke a no-op). */
export function moveTableColumn(
  src: string,
  col: number,
  dir: 1 | -1,
): { src: string; col: number } | null {
  const shape = parseTable(src);
  if (!shape) return null;
  const rows = [shape.header, shape.delimiter, ...shape.body];
  const cols = Math.max(shape.aligns.length, ...rows.map((r) => r.cells.length));
  const target = col + dir;
  if (col < 0 || col >= cols || target < 0 || target >= cols) return null;
  const out = rows.map((line) => {
    const segs = rawSegments(line, shape.from, src, cols, fillFor(line, shape));
    [segs[col], segs[target]] = [segs[target], segs[col]];
    return joinSegments(segs, line);
  });
  return { src: out.join("\n"), col: target };
}

/** Swap body row `row` (0-based within the body) with its neighbour.
 *  Header and delimiter never move — dragging the header into the body is
 *  the corruption this signature makes unrepresentable. */
export function moveTableRow(
  src: string,
  row: number,
  dir: 1 | -1,
): { src: string; row: number } | null {
  const shape = parseTable(src);
  if (!shape) return null;
  const target = row + dir;
  if (row < 0 || row >= shape.body.length || target < 0 || target >= shape.body.length) {
    return null;
  }
  const lines = src.split("\n");
  const a = 2 + row;
  const b = 2 + target;
  [lines[a], lines[b]] = [lines[b], lines[a]];
  return { src: lines.join("\n"), row: target };
}

/** An empty row matching the column count, for Tab-in-the-last-cell. Three
 *  spaces per cell so the caret has somewhere to sit; format-on-exit will
 *  restretch it. */
export function emptyRowText(cols: number): string {
  return "|" + "   |".repeat(Math.max(1, cols));
}

// ── The commands the table UI runs ──────────────────────────────────────────
//
// Everything below is the vocabulary the widget's context menu, its keyboard
// and the command palette all speak — insert, delete, duplicate, move, align,
// sort, and the one-cell write that editing in place is made of. They live
// HERE, in the file with no imports, for the reason the rest of this module
// does: a command that rewrites a table is string surgery, and string surgery
// is the half a test can actually pin down (tests/tables.test.ts).
//
// TWO INDEX SPACES, AND ONLY ONE OF THEM IS PUBLIC. `moveTableRow` above
// counts BODY rows, because the header is not a destination for a move. Every
// command below counts NAVIGABLE rows — 0 is the header, 1 is the first body
// row — because that is what a caret sitting in a cell knows about itself,
// and a menu that had to translate would translate wrong once. `rowLine()` is
// the single place the two meet.

/** Which source LINE a navigable row is: 0 → the header, r ≥ 1 → body row
 *  r-1, which sits one line further down because the delimiter is line 1. */
function rowLine(row: number): number {
  return row === 0 ? 0 : row + 1;
}

/** How many columns a block has: the widest of the alignment row and every
 *  row in it. A short row is still a row of this table. */
export function columnCount(shape: TableShape): number {
  const rows = [shape.header, shape.delimiter, ...shape.body];
  return Math.max(shape.aligns.length, ...rows.map((r) => r.cells.length));
}

/** Navigable row count (the header plus the body). */
export function rowCount(shape: TableShape): number {
  return 1 + shape.body.length;
}

/** Column `col`'s alignment, in the word the menu shows. */
export function alignName(
  shape: TableShape,
  col: number,
): "left" | "center" | "right" | "none" {
  const a = shape.aligns[col];
  if (!a) return "none";
  if (a.left && a.right) return "center";
  if (a.right) return "right";
  if (a.left) return "left";
  return "none";
}

/** A cell's text as the FILE holds it, escapes intact; "" outside the table.
 *  The in-place editor shows this rather than the rendered text, because a
 *  cell holds markdown: an editor that displayed `**bold**` as bold and then
 *  wrote it back would eat the author's syntax on the first commit. */
export function cellText(shape: TableShape, row: number, col: number): string {
  return navRows(shape)[row]?.cells[col]?.text ?? "";
}

/** Escape what a cell may not hold raw.
 *
 *  A typed `|` becomes `\|`; an already-escaped one is left alone — parity,
 *  not presence, the same count `pipeEscaped` does, because `\\|` is a
 *  literal backslash and then a separator and re-escaping it would split one
 *  cell into two on the next parse. Newlines become spaces: a row IS a line,
 *  and a cell that wants a break says `<br>`. */
export function escapeCellText(text: string): string {
  const flat = text.replace(/[\r\n]+/g, " ");
  let out = "";
  for (let i = 0; i < flat.length; i++) {
    if (flat[i] === "|" && !pipeEscaped(flat, i)) out += "\\";
    out += flat[i];
  }
  return out.trim();
}

/** One cell's write, as a MINIMAL change: the offsets of the raw segment to
 *  replace and what to put there, relative to the block's own start (add the
 *  block's document offset and dispatch). Minimal on purpose — every other
 *  cell's bytes are then untouched by construction rather than by care, which
 *  is what makes a committed cell one undo step over one range instead of a
 *  whole-block rewrite that the history, the widget and `git diff` all have
 *  to read.
 *
 *  A row too short to hold the column is rewritten whole, padded out to the
 *  table's width: there is no segment to replace until the cell exists. */
export function cellEdit(
  src: string,
  row: number,
  col: number,
  text: string,
): { from: number; to: number; insert: string } | null {
  const shape = parseTable(src);
  if (!shape) return null;
  const line = navRows(shape)[row];
  if (!line || col < 0 || col >= columnCount(shape)) return null;
  const body = escapeCellText(text);
  const cell = line.cells[col];
  if (cell) return { from: cell.from, to: cell.to, insert: ` ${body} ` };
  const segs = rawSegments(line, 0, src, col + 1);
  segs[col] = ` ${body} `;
  return { from: line.from, to: line.to, insert: joinSegments(segs, line) };
}

/** Insert an empty row above or below navigable row `row`. Above the header
 *  is refused: the row above a header is not a row, it is a different table.
 *  Returns the block and the new row's navigable index. */
export function insertTableRow(
  src: string,
  row: number,
  where: "above" | "below",
): { src: string; row: number } | null {
  const shape = parseTable(src);
  if (!shape) return null;
  if (row < 0 || row >= rowCount(shape)) return null;
  if (row === 0 && where === "above") return null;
  const at = rowLine(row) + (where === "below" ? 1 : 0) + (row === 0 ? 1 : 0);
  const lines = src.split("\n");
  lines.splice(at, 0, emptyRowText(columnCount(shape)));
  return { src: lines.join("\n"), row: at - 1 };
}

/** Delete navigable row `row`. The header is refused — a table without its
 *  header is not a table with one row fewer, it is prose full of pipes. */
export function deleteTableRow(src: string, row: number): { src: string; row: number } | null {
  const shape = parseTable(src);
  if (!shape) return null;
  if (row <= 0 || row >= rowCount(shape)) return null;
  const lines = src.split("\n");
  lines.splice(rowLine(row), 1);
  return { src: lines.join("\n"), row: Math.min(row, rowCount(shape) - 2) };
}

/** Copy navigable row `row` directly beneath itself. The header duplicates
 *  into the FIRST BODY ROW rather than into a second header: a table has one
 *  header, and a copy of the column names is a genuinely useful first row. */
export function duplicateTableRow(src: string, row: number): { src: string; row: number } | null {
  const shape = parseTable(src);
  if (!shape) return null;
  if (row < 0 || row >= rowCount(shape)) return null;
  const lines = src.split("\n");
  const at = rowLine(row) + (row === 0 ? 2 : 1);
  lines.splice(at, 0, lines[rowLine(row)]);
  return { src: lines.join("\n"), row: at - 1 };
}

/** Insert an empty column beside column `col`, in EVERY line including the
 *  delimiter — the all-lines-or-nothing rule `moveTableColumn` already
 *  follows, for the same reason: a column added to the rows but not to the
 *  alignment row shifts every alignment one place along. */
export function insertTableColumn(
  src: string,
  col: number,
  where: "before" | "after",
): { src: string; col: number } | null {
  const shape = parseTable(src);
  if (!shape) return null;
  const cols = columnCount(shape);
  if (col < 0 || col >= cols) return null;
  const at = col + (where === "after" ? 1 : 0);
  const out = [shape.header, shape.delimiter, ...shape.body].map((line) => {
    const segs = rawSegments(line, 0, src, cols, fillFor(line, shape));
    segs.splice(at, 0, line === shape.delimiter ? " --- " : "   ");
    return joinSegments(segs, line);
  });
  return { src: out.join("\n"), col: at };
}

/** Delete column `col` everywhere. The last column is refused: a table with
 *  no columns has no rows either. */
export function deleteTableColumn(src: string, col: number): { src: string; col: number } | null {
  const shape = parseTable(src);
  if (!shape) return null;
  const cols = columnCount(shape);
  if (cols <= 1 || col < 0 || col >= cols) return null;
  const out = [shape.header, shape.delimiter, ...shape.body].map((line) => {
    const segs = rawSegments(line, 0, src, cols, fillFor(line, shape));
    segs.splice(col, 1);
    return joinSegments(segs, line);
  });
  return { src: out.join("\n"), col: Math.min(col, cols - 2) };
}

/** Set column `col`'s alignment by rewriting ONE delimiter cell, keeping its
 *  width so the pipes below it do not jump before format-on-exit runs. */
export function setColumnAlign(
  src: string,
  col: number,
  align: "left" | "center" | "right" | "none",
): string | null {
  const shape = parseTable(src);
  if (!shape) return null;
  const cell = shape.delimiter.cells[col];
  if (!cell) return null;
  const width = Math.max(3, cell.text.length);
  const dashes = (n: number): string => "-".repeat(Math.max(1, n));
  const body =
    align === "center"
      ? ":" + dashes(width - 2) + ":"
      : align === "left"
        ? ":" + dashes(width - 1)
        : align === "right"
          ? dashes(width - 1) + ":"
          : dashes(width);
  return src.slice(0, cell.trimFrom) + body + src.slice(cell.trimTo);
}

/** Digits that are digits in another script. A column of ١٢ and ٩٨ is a
 *  column of numbers, and "sort numerically" has to mean that on an Arabic
 *  instance or the row is a decoration. */
function latinDigits(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x0660 && cp <= 0x0669) out += String(cp - 0x0660);
    else if (cp >= 0x06f0 && cp <= 0x06f9) out += String(cp - 0x06f0);
    else out += ch;
  }
  return out;
}

/** The number a cell means, or null when it does not mean one. Both grouping
 *  separators come out, a currency mark or a trailing % is ignored, and a
 *  cell with no digit in it is not a number however it is punctuated. */
function cellNumber(text: string): number | null {
  const cleaned = latinDigits(text)
    .replace(/[٬,  \s]/g, "")
    .replace(/[^0-9.+-]/g, "");
  if (!/\d/.test(cleaned)) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Sort the BODY rows by column `col`. The header and the alignment row never
 *  move. Stable, so a sort on a second column keeps the first one's order
 *  inside ties; `numeric` puts the rows holding no number last, because a
 *  blank is not smaller than 1, it is not a number at all. */
export function sortTableRows(
  src: string,
  col: number,
  mode: "az" | "za" | "numeric",
): string | null {
  const shape = parseTable(src);
  if (!shape) return null;
  if (col < 0 || col >= columnCount(shape)) return null;
  const lines = src.split("\n");
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const rows = shape.body.map((line, i) => ({
    text: lines[2 + i],
    key: line.cells[col]?.text ?? "",
    at: i,
  }));
  rows.sort((a, b) => {
    let d: number;
    if (mode === "numeric") {
      const x = cellNumber(a.key);
      const y = cellNumber(b.key);
      if (x === null && y === null) d = 0;
      else if (x === null) d = 1;
      else if (y === null) d = -1;
      else d = x - y;
    } else {
      d = collator.compare(a.key, b.key) * (mode === "za" ? -1 : 1);
    }
    return d !== 0 ? d : a.at - b.at;
  });
  return [lines[0], lines[1], ...rows.map((r) => r.text)].join("\n");
}

/**
 * A palette row run with the caret IN the table's source (no widget drawn to
 * talk to): the row or column is added beside the cell the caret sits in, the
 * block is prettified in the same edit — the reader is looking at the pipes,
 * so a ragged block is what they would see — and the caret lands in the cell
 * the command made. `src` is the block, `blockFrom` its offset in the
 * document, `head` the caret's document offset. `null` when the command does
 * not apply there (a row above the header).
 */
export function sourceTableCommand(
  src: string,
  blockFrom: number,
  head: number,
  cmd: "rowAbove" | "rowBelow" | "colBefore" | "colAfter",
): { src: string; anchor: number } | null {
  const shape = parseTable(src, blockFrom);
  if (!shape) return null;
  const row = rowIndexAt(shape, head) ?? 0;
  const col = colIndexAt(navRows(shape)[row], head);
  let out: string;
  let landRow = row;
  let landCol = col;
  if (cmd === "rowAbove" || cmd === "rowBelow") {
    const res = insertTableRow(src, row, cmd === "rowAbove" ? "above" : "below");
    if (!res) return null;
    out = res.src;
    landRow = res.row;
    landCol = 0;
  } else {
    const res = insertTableColumn(src, col, cmd === "colBefore" ? "before" : "after");
    if (!res) return null;
    out = res.src;
    landCol = res.col;
  }
  out = formatTable(out);
  const next = parseTable(out, blockFrom);
  const landing = next ? navRows(next)[landRow]?.cells[landCol]?.trimFrom : undefined;
  return { src: out, anchor: landing ?? blockFrom };
}

/** A fresh table: `rows` INCLUDING the header — the picker draws a grid and
 *  the reader counts the squares they drew — and `cols` columns, every cell
 *  empty so the first thing typed is the author's and not a placeholder they
 *  have to delete first. */
export function tableSkeleton(rows: number, cols: number): string {
  const n = Math.max(1, Math.min(50, Math.floor(cols)));
  const r = Math.max(1, Math.min(200, Math.floor(rows)));
  const out = [emptyRowText(n), "|" + " --- |".repeat(n)];
  for (let i = 1; i < r; i++) out.push(emptyRowText(n));
  return out.join("\n");
}
