// A LINE OF PROSE CAN SAY WHERE IT SITS. `Some words {.center}` centres that
// paragraph; a heading, an image line and a lone sentence take the same
// marker, `{.left}`, `{.right}`, `{.center}` or `{.justify}`, at the end of
// the block's first or last line. Pandoc's attribute braces, so a document
// that leaves for another tool still parses; Obsidian shows the braces as
// text, which is the honest failure. The note-level `align:` frontmatter key
// (shared/textLayout.ts) sets the default and a marker overrides it for one
// block. Pure, shared by the editor (hides the marker, classes the lines)
// and the reading view (strips it, classes the element).

export type BlockAlign = "left" | "center" | "right" | "justify";

const MARKER_RE = /[ \t]*\{\.(left|center|centre|centered|centred|right|justify|justified)\}[ \t]*$/i;

function canonical(word: string): BlockAlign {
  const w = word.toLowerCase();
  if (w === "centre" || w === "centered" || w === "centred") return "center";
  if (w === "justified") return "justify";
  return w as BlockAlign;
}

/** The marker at the end of `line`, with the index it (and the space before
 *  it) starts at, or null. */
export function parseAlignMarker(line: string): { align: BlockAlign; start: number } | null {
  const m = MARKER_RE.exec(line);
  if (!m) return null;
  return { align: canonical(m[1]), start: m.index };
}

export function stripAlignMarker(line: string): string {
  return line.replace(MARKER_RE, "");
}

/** `line` with its marker replaced by `align`'s, or removed for null. */
export function withAlignMarker(line: string, align: BlockAlign | null): string {
  const bare = stripAlignMarker(line).replace(/[ \t]+$/, "");
  if (align === null) return bare;
  return bare === "" ? `{.${align}}` : `${bare} {.${align}}`;
}

/** The alignment a block of lines carries: its last line's marker, else its
 *  first line's. Null when neither says anything. */
export function blockAlignOf(lines: readonly string[]): BlockAlign | null {
  if (lines.length === 0) return null;
  return parseAlignMarker(lines[lines.length - 1])?.align ?? parseAlignMarker(lines[0])?.align ?? null;
}
