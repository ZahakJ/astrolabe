// BLOCK IDS — the ` ^id` at the end of a paragraph or list item that makes it
// addressable: `[[Note#^id]]` links to it, `![[Note#^id]]` transcludes just
// that block, the hover card shows it, and the palette's `#` jump lands on it.
//
// Obsidian's syntax, kept exactly (a caret, then letters, digits and hyphens,
// after whitespace at the end of the line, or on a line of its own after the
// block), because vaults already carry these and a migrating reader must not
// find dead links. Pure, like shared/blockAlign.ts, whose shape this copies:
// the editor's hide pass, the reading renderer, the anchor scanner and the
// "Copy link to block" action all read one rule.

export const BLOCK_ID_RE = /(?:^|\s+)\^([A-Za-z0-9-]+)\s*$/;

/** The id a line carries at its end (`"abc12"` for ` ^abc12`), or null. */
export function parseBlockId(line: string): { id: string; start: number } | null {
  const m = BLOCK_ID_RE.exec(line);
  if (!m) return null;
  return { id: m[1], start: m.index };
}

/** True when the line is NOTHING but a block id — Obsidian's "id on its own
 *  line after the block" form, which attaches to the block above. */
export function isBareBlockId(line: string): boolean {
  return /^\s*\^[A-Za-z0-9-]+\s*$/.test(line);
}

export function stripBlockId(line: string): string {
  return line.replace(BLOCK_ID_RE, "");
}

/** `line` carrying `id` at its end, replacing any it had. */
export function withBlockId(line: string, id: string): string {
  const bare = stripBlockId(line).replace(/[ \t]+$/, "");
  return bare === "" ? `^${id}` : `${bare} ^${id}`;
}

/** A fresh six-character id, as Obsidian mints them: enough to never collide
 *  in one note, short enough to read in a link. */
export function mintBlockId(random: () => number = Math.random): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(random() * alphabet.length)];
  return out;
}

const LIST_LINE_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+/;
const BLOCK_START_RE = /^\s*(?:#{1,6}\s|```|~~~|>|\|)/;

/** The lines of the block that owns line `line` (1-based): a list item with
 *  its indented continuation, or the paragraph the line sits in — walked up
 *  and down over non-blank lines that do not start another block. A bare
 *  `^id` line belongs to the block above it. Null when the line is blank. */
export function blockRange(lines: readonly string[], line: number): { start: number; end: number } | null {
  let i = line - 1;
  if (i < 0 || i >= lines.length) return null;
  if (isBareBlockId(lines[i])) {
    if (i === 0 || lines[i - 1].trim() === "") return { start: i, end: i + 1 };
    i--;
  }
  if (lines[i].trim() === "") return null;
  // A blockquote is the run of `>` lines around this one.
  if (/^\s*>/.test(lines[i])) {
    let start = i;
    while (start > 0 && /^\s*>/.test(lines[start - 1])) start--;
    let end = i + 1;
    while (end < lines.length && /^\s*>/.test(lines[end])) end++;
    return { start, end };
  }
  const item = LIST_LINE_RE.exec(lines[i]);
  if (item) {
    const indent = item[1].length;
    let end = i + 1;
    // Continuation: deeper-indented lines (children, wrapped text) until a
    // blank line or a sibling at the same indent or shallower.
    for (; end < lines.length; end++) {
      const l = lines[end];
      if (l.trim() === "") break;
      const lead = /^\s*/.exec(l)?.[0].length ?? 0;
      if (lead <= indent && !isBareBlockId(l)) break;
    }
    return { start: i, end };
  }
  let start = i;
  while (start > 0 && lines[start - 1].trim() !== "" && !BLOCK_START_RE.test(lines[start - 1]) && !LIST_LINE_RE.test(lines[start - 1])) start--;
  if (BLOCK_START_RE.test(lines[i]) || LIST_LINE_RE.test(lines[i])) start = i;
  let end = i + 1;
  while (end < lines.length && lines[end].trim() !== "" && !BLOCK_START_RE.test(lines[end]) && !LIST_LINE_RE.test(lines[end])) end++;
  return { start, end };
}

/** The markdown of the block at `line`, its own id marker stripped, or null. */
export function markdownBlock(md: string, line: number): string | null {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const range = blockRange(lines, line);
  if (!range) return null;
  const slice = lines.slice(range.start, range.end);
  // The id on its own line goes; the id at the end of the last line goes —
  // for a quote, from the last quoted line's text, keeping its `>`.
  while (slice.length > 0 && isBareBlockId(slice[slice.length - 1])) slice.pop();
  if (slice.length > 0) slice[slice.length - 1] = stripBlockId(slice[slice.length - 1]);
  const text = slice.join("\n").trim();
  return text === "" ? null : text;
}
