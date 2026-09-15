// A CSV/TSV READER for the import tab — small on purpose. Anki's own
// export, a spreadsheet's "save as CSV", a hand-typed tab-separated list:
// quoted fields with embedded delimiters, doubled quotes and newlines
// inside quotes are all it needs to know. The delimiter is the file's own:
// a tab when the first line has more tabs than commas (or the name says
// .tsv), a comma otherwise.

export function delimiterOf(text: string, name = ""): string {
  if (/\.tsv$/i.test(name)) return "\t";
  const head = text.slice(0, text.indexOf("\n") < 0 ? text.length : text.indexOf("\n"));
  const tabs = (head.match(/\t/g) ?? []).length;
  const commas = (head.match(/,/g) ?? []).length;
  if (tabs > commas) return "\t";
  const semis = (head.match(/;/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

/** Anki's exports start with `#`-lines naming the separator and the
 *  columns; they are not rows. */
export function stripAnkiHeader(text: string): string {
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length && /^#(separator|html|tags|columns|notetype|deck|guid)\b/i.test(lines[i])) i++;
  return lines.slice(i).join("\n");
}

/** A guess at which column is which: the first two are front and back,
 *  a third is extra — the order every flashcard export uses. */
export function guessColumns(width: number): { front: number; back: number; extra: number | null } {
  return { front: 0, back: Math.min(1, Math.max(0, width - 1)), extra: width > 2 ? 2 : null };
}
