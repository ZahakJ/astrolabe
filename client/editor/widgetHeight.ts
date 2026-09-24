// HOW TALL A WIDGET WILL BE, BEFORE IT IS DRAWN (3.26.1).
//
// CodeMirror keeps a height map of the whole document and only measures what
// it draws; everything else is ESTIMATED, and a widget that says nothing
// (`estimatedHeight` −1, the default) is estimated as one line. A rendered
// table is 300–600px, a picture 200-odd — so a long note's scrollbar was
// built on thirty one-line guesses, and every fling that drew a few more of
// them made the document hundreds of pixels longer under the reader's thumb:
// the thumb jumped, the position slid. Measured on a phone over three
// flings of a 450-line note with a table and a picture per section, the
// scroller's height grew 14,891 → 19,741 (+32.6%; the 3.24 audit saw +8.6%
// on a shorter one).
//
// So every sizeable widget answers `estimatedHeight`: what it measured last
// time it was drawn (the same table, the same picture at the same width — a
// table scrolled out and back, a note reopened), else a guess from its source
// that is right to within a row or so. Guessing high or low by a little is
// fine; guessing "one line" for a table is what moved the page.

/** Measured heights, by widget identity. Bounded: a vault of a thousand
 *  tables is a thousand numbers. */
const measured = new Map<string, number>();
const CAP = 2000;

export function rememberHeight(key: string, px: number): void {
  if (!(px > 4)) return;
  if (measured.size >= CAP && !measured.has(key)) measured.delete(measured.keys().next().value as string);
  measured.set(key, Math.round(px));
}

export function knownHeight(key: string): number | undefined {
  return measured.get(key);
}

/** After the widget's DOM is in the document and laid out, record its
 *  height — and again when it changes size (a picture arriving, a table
 *  re-wrapping on rotation). */
export function trackHeight(key: string, el: HTMLElement): void {
  const note = (): void => rememberHeight(key, el.getBoundingClientRect().height);
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(() => {
      if (!el.isConnected) {
        ro.disconnect();
        return;
      }
      note();
    });
    ro.observe(el);
  } else if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(note);
  }
}

/** The width the editor's text column had when a widget was last drawn —
 *  a table's rows wrap against it. Until something is drawn, the window's
 *  width less the gutters, capped at a desktop measure: the table field is
 *  built before the first widget is, and 640 on a 412px phone guessed every
 *  row one line short. */
let column = typeof window !== "undefined" && window.innerWidth > 0 ? Math.min(window.innerWidth - 40, 700) : 640;
export function noteColumnWidth(px: number): void {
  if (px > 100) column = px;
}

/** A table from its Markdown source: a header row, then each body row as
 *  tall as its longest wrapped line at this column width. */
export function estimateTable(src: string): number {
  const rows = src.split("\n").filter((l) => l.trim().startsWith("|"));
  if (rows.length < 2) return -1;
  const body = rows.slice(2);
  const charsPerLine = Math.max(16, column / 8.5);
  const ROW = 36; // one line of cell text with its padding
  const LINE = 35;
  let h = ROW; // the header
  for (const r of body) {
    // An auto-layout table gives the long column the room, so a row wraps
    // about as often as its text would across the whole column, plus the
    // cells' padding (the 1.15).
    const cells = r.split("|").slice(1, -1);
    const chars = cells.reduce((n, c) => n + c.trim().length, 0);
    const lines = Math.max(1, Math.ceil((chars * 1.15) / charsPerLine));
    h += ROW + (lines - 1) * LINE;
  }
  return h + 16; // the wrap's own margin
}

/** A picture we have not seen yet: most of the column is the best guess. */
export function estimateImage(width: number | null): number {
  return Math.round(width !== null ? Math.min(width, column) * 0.62 : Math.min(column, 560) * 0.56);
}
