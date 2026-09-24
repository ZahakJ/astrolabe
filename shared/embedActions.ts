// AN EMBED YOU CAN PICK UP — the pure half.
//
// A picture, a file card, a drawn PDF page or a drawing in a note is a line of
// source (`![[pic.png|300]]`, `![[Book.pdf#page=42]]`, `![alt](media/x.png)`),
// and everything the reader can now do to one is arithmetic on that line:
//
//   · dragged WITHIN its note, the line moves to the drop point — widths,
//     anchors and alignment markers intact, one change set, one undo step;
//   · dropped into ANOTHER note, the same reference is inserted there (never a
//     copy of the file), re-based when it is a relative markdown path;
//   · copied, it is the Markdown exactly as written, the vault path, or the
//     file's absolute URL;
//   · and the menu that offers all of this offers only what can be done here —
//     the availability matrix at the bottom, one table for the editor, the
//     reading view and the phone's sheet.
//
// No DOM and no CodeMirror: the editor (client/editor/embedGrip.ts), the
// reading view (client/embedPickup.ts) and the tests all call the same code.

import { parseAlignMarker } from "./blockAlign.ts";

/** What an embed draws as. Notes and blocks (`![[Note]]`) are transclusions
 *  and are not picked up this way: their card is the note's words, and a
 *  right-click on words belongs to the words. */
export type EmbedKind = "image" | "file" | "pdfpage" | "drawing" | "audio";

/** One embed's source span in a document, in document offsets. */
export interface EmbedSpan {
  from: number;
  to: number;
  /** The text between `from` and `to`, exactly. */
  source: string;
  /** `![[…]]` rather than `![alt](dest)`. */
  wiki: boolean;
}

export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

/** A change set expressed against the ORIGINAL document, plus where the moved
 *  or inserted embed starts in the NEW one (the caret goes there). */
export interface EmbedEdit {
  changes: TextChange[];
  at: number;
}

const WIKI_EMBED_RE = /!\[\[([^[\]\n]+?)\]\]/g;
// The markdown image form. The destination runs to whitespace or `)`, or is
// `<…>`; an optional title follows. The same shape server/moveLinks.ts reads.
const MD_IMAGE_RE = /!\[[^\]\n]*\]\((?:<[^<>\n]*>|[^)\s]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g;

/** Every embed in `text`, in order, offset by `offset`. */
export function embedSpansIn(text: string, offset = 0): EmbedSpan[] {
  const out: EmbedSpan[] = [];
  for (const re of [WIKI_EMBED_RE, MD_IMAGE_RE]) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      out.push({ from: offset + m.index, to: offset + m.index + m[0].length, source: m[0], wiki: re === WIKI_EMBED_RE });
    }
  }
  return out.sort((a, b) => a.from - b.from);
}

interface Line {
  from: number;
  to: number;
  text: string;
  /** 0-based. */
  index: number;
}

function lineAt(doc: string, pos: number): Line {
  const p = Math.max(0, Math.min(pos, doc.length));
  const from = doc.lastIndexOf("\n", p - 1) + 1;
  const nl = doc.indexOf("\n", p);
  const to = nl === -1 ? doc.length : nl;
  let index = 0;
  for (let i = doc.indexOf("\n"); i !== -1 && i < from; i = doc.indexOf("\n", i + 1)) index++;
  return { from, to, text: doc.slice(from, to), index };
}

function lineStarts(doc: string): number[] {
  const starts = [0];
  for (let i = doc.indexOf("\n"); i !== -1; i = doc.indexOf("\n", i + 1)) starts.push(i + 1);
  return starts;
}

/** The embed nearest `pos` on `pos`'s line — how a widget, which knows only
 *  roughly where it sits, finds the exact source it draws. `name` narrows the
 *  choice to embeds whose source mentions it (two pictures on one line). */
export function embedSpanNear(doc: string, pos: number, name?: string): EmbedSpan | null {
  const line = lineAt(doc, pos);
  let best: EmbedSpan | null = null;
  for (const span of embedSpansIn(line.text, line.from)) {
    if (name !== undefined && name !== "" && !span.source.includes(name)) continue;
    const d = pos < span.from ? span.from - pos : pos > span.to ? pos - span.to : 0;
    const bd = best === null ? Infinity : pos < best.from ? best.from - pos : pos > best.to ? pos - best.to : 0;
    if (d < bd) best = span;
  }
  return best;
}

/** The first occurrence of `source` inside lines `fromLine..toLine`
 *  (0-based, inclusive) — how the reading view, which knows a block's lines
 *  and the embed's exact text, finds the span. */
export function findEmbedInLines(doc: string, source: string, fromLine: number, toLine: number): EmbedSpan | null {
  const starts = lineStarts(doc);
  const a = starts[Math.max(0, Math.min(fromLine, starts.length - 1))] ?? 0;
  const endLine = Math.max(fromLine, Math.min(toLine, starts.length - 1));
  const b = endLine + 1 < starts.length ? starts[endLine + 1] - 1 : doc.length;
  const at = doc.slice(a, b).indexOf(source);
  if (at === -1) return null;
  return { from: a + at, to: a + at + source.length, source, wiki: source.startsWith("![[") };
}

/** True when the embed is the whole of its line — give or take whitespace and
 *  a trailing `{.center}` — so that moving it means moving the LINE. */
export function isStandaloneEmbed(doc: string, span: { from: number; to: number }): boolean {
  const line = lineAt(doc, span.from);
  if (span.to > line.to) return false;
  let rest = line.text.slice(0, span.from - line.from) + line.text.slice(span.to - line.from);
  const marker = parseAlignMarker(rest);
  if (marker) rest = rest.slice(0, marker.start);
  return rest.trim() === "";
}

/** Where a drop lands: a document position (the editor's posAtCoords), or a
 *  line boundary (the reading view knows blocks, not characters). */
export type DropSpot = { pos: number } | { line: number; after: boolean };

/** Resolve a drop to an insertion point at a LINE BOUNDARY: before the drop
 *  line when the drop is in its first half, after it otherwise. */
function boundary(doc: string, spot: DropSpot): { at: number; before: boolean; line: Line } {
  if ("pos" in spot) {
    const line = lineAt(doc, spot.pos);
    const before = spot.pos - line.from <= (line.to - line.from) / 2;
    return { at: before ? line.from : line.to, before, line };
  }
  const starts = lineStarts(doc);
  const idx = Math.max(0, Math.min(spot.line, starts.length - 1));
  const line = lineAt(doc, starts[idx]);
  return { at: spot.after ? line.to : line.from, before: !spot.after, line };
}

// ── paragraphs ──────────────────────────────────────────────────────────────
// An embed on a line of its own is a PARAGRAPH: markdown wants a blank line
// between it and the prose around it, and taking one out must not leave two
// blank lines where there was one. The two functions below keep that true, so
// a note that was tidy before a drag is tidy after it.

function blankAt(lines: readonly string[], i: number): boolean {
  return i < 0 || i >= lines.length || lines[i].trim() === "";
}

/** The range a block embed's line comes out with: the line and its newline,
 *  and — when it stood between blank lines — one of those, so the break it
 *  leaves behind is one break. */
function blockCut(doc: string, lines: readonly string[], starts: readonly number[], i: number): { from: number; to: number } {
  const last = i === lines.length - 1;
  const lineTo = starts[i] + lines[i].length;
  if (blankAt(lines, i - 1) && blankAt(lines, i + 1)) {
    // The blank line BEFORE it goes with it; at the very top, the one after.
    if (i > 0) return { from: starts[i - 1], to: last ? lineTo : lineTo + 1 };
    if (i + 1 < lines.length) {
      const nextLast = i + 1 === lines.length - 1;
      return { from: starts[i], to: starts[i + 1] + lines[i + 1].length + (nextLast ? 0 : 1) };
    }
  }
  if (!last) return { from: starts[i], to: lineTo + 1 };
  if (i > 0) return { from: starts[i] - 1, to: lineTo };
  return { from: 0, to: doc.length };
}

/** The line index a drop puts a block BEFORE (`lines.length` = after the
 *  last line). A document's trailing newline is not a line to land after. */
function boundaryIndex(doc: string, lines: readonly string[], spot: DropSpot): number {
  let k: number;
  if ("pos" in spot) {
    const line = lineAt(doc, spot.pos);
    const before = spot.pos - line.from <= (line.to - line.from) / 2;
    k = before ? line.index : line.index + 1;
  } else {
    const idx = Math.max(0, Math.min(spot.line, lines.length - 1));
    k = spot.after ? idx + 1 : idx;
  }
  if (k >= lines.length && lines.length > 1 && lines[lines.length - 1] === "") k = lines.length - 1;
  return Math.max(0, Math.min(k, lines.length));
}

/** Put `text` as a paragraph of its own before line `k`: a blank line
 *  between it and any prose it touches, and no doubled blank lines. */
function blockInsert(doc: string, lines: readonly string[], starts: readonly number[], k: number, text: string): { change: TextChange; at: number } {
  const prevBlank = blankAt(lines, k - 1);
  const nextBlank = blankAt(lines, k);
  if (k >= lines.length) {
    const lead = `\n${prevBlank ? "" : "\n"}`;
    return { change: { from: doc.length, to: doc.length, insert: `${lead}${text}` }, at: doc.length + lead.length };
  }
  const lead = prevBlank ? "" : "\n";
  const insert = `${lead}${text}\n${nextBlank ? "" : "\n"}`;
  return { change: { from: starts[k], to: starts[k], insert }, at: starts[k] + lead.length };
}

/**
 * Move an embed to a drop spot inside the SAME document.
 *
 * A standalone embed moves its whole line (the `|300`, the `#page=42`, the
 * `{.center}` all ride along) to the line boundary nearest the drop, as a
 * paragraph of its own. An embed in the middle of a sentence moves just its
 * own text, to the exact drop position. Null when the drop would leave the
 * note as it was.
 */
export function moveEmbedEdit(doc: string, span: { from: number; to: number }, spot: DropSpot): EmbedEdit | null {
  const source = doc.slice(span.from, span.to);
  if (isStandaloneEmbed(doc, span)) {
    const lines = doc.split("\n");
    const starts = lineStarts(doc);
    const own = lineAt(doc, span.from);
    const k = boundaryIndex(doc, lines, spot);
    // Dropped on its own line, or at either edge of it: stays.
    if (k === own.index || k === own.index + 1) return null;
    const cut = blockCut(doc, lines, starts, own.index);
    const put = blockInsert(doc, lines, starts, k, own.text);
    const removed = cut.to - cut.from;
    const changes = sortChanges([{ from: cut.from, to: cut.to, insert: "" }, put.change]);
    if (applyChanges(doc, changes) === doc) return null;
    const at = (put.change.from >= cut.to ? put.at - removed : put.at) + (span.from - own.from);
    return { changes, at };
  }
  const drop = "pos" in spot ? spot.pos : boundary(doc, spot).at;
  if (drop >= span.from && drop <= span.to) return null;
  const removed = span.to - span.from;
  const at = drop >= span.to ? drop - removed : drop;
  return { changes: sortChanges([{ from: span.from, to: span.to, insert: "" }, { from: drop, to: drop, insert: source }]), at };
}

/** Insert an embed dropped in from ANOTHER note as a paragraph of its own at
 *  the line boundary nearest the drop. */
export function insertEmbedEdit(doc: string, spot: DropSpot, source: string): EmbedEdit {
  if (doc === "") return { changes: [{ from: 0, to: 0, insert: source }], at: 0 };
  const lines = doc.split("\n");
  const put = blockInsert(doc, lines, lineStarts(doc), boundaryIndex(doc, lines, spot), source);
  return { changes: [put.change], at: put.at };
}

/** Take an embed out, and its line with it when it stood alone. */
export function removeEmbedEdit(doc: string, span: { from: number; to: number }): EmbedEdit {
  if (isStandaloneEmbed(doc, span)) {
    const cut = blockCut(doc, doc.split("\n"), lineStarts(doc), lineAt(doc, span.from).index);
    return { changes: [{ ...cut, insert: "" }], at: cut.from };
  }
  // Mid-sentence: the embed and ONE of the spaces around it.
  let { from, to } = span;
  if (doc[to] === " " && (from === 0 || doc[from - 1] === " ")) to++;
  else if (from > 0 && doc[from - 1] === " " && (to >= doc.length || doc[to] === "\n")) from--;
  return { changes: [{ from, to, insert: "" }], at: from };
}

function sortChanges(changes: TextChange[]): TextChange[] {
  return changes.sort((a, b) => a.from - b.from || a.to - b.to);
}

/** Apply a change set expressed against the original document. */
export function applyChanges(doc: string, changes: readonly TextChange[]): string {
  let out = doc;
  for (const c of [...changes].sort((a, b) => b.from - a.from || b.to - a.to)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  }
  return out;
}

// ── references across notes ─────────────────────────────────────────────────

function dirOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
}

function resolveFrom(dir: string, rel: string): string | null {
  const parts = rel.startsWith("/") ? [] : dir ? dir.split("/") : [];
  for (const seg of rel.replace(/^\/+/, "").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join("/");
}

function relativeFrom(dir: string, target: string): string {
  const from = dir ? dir.split("/") : [];
  const to = target.split("/");
  let same = 0;
  while (same < from.length && same < to.length - 1 && from[same] === to[same]) same++;
  return [...Array<string>(from.length - same).fill(".."), ...to.slice(same)].join("/");
}

/**
 * The same reference, written for another note. `![[…]]` resolves by name or
 * by vault path and means the same thing in every note, so it travels as it
 * is. A RELATIVE markdown destination (`![x](../media/a.png)`) resolves
 * against the note it is written in; carried into a note in another folder it
 * would point at nothing, so it is re-expressed from the new note's folder.
 */
export function rebaseEmbedSource(source: string, fromNote: string, toNote: string): string {
  if (source.startsWith("![[")) return source;
  const m = /^(!\[[^\]\n]*\]\()(<[^<>\n]*>|[^)\s]+)([\s\S]*)$/.exec(source);
  if (!m) return source;
  const [, head, rawDest, tail] = m;
  const angled = rawDest.startsWith("<") && rawDest.endsWith(">");
  const dest = angled ? rawDest.slice(1, -1) : rawDest;
  if (/^[a-z][a-z0-9+.-]*:/i.test(dest) || dest.startsWith("/") || dest.startsWith("#")) return source;
  if (dirOf(fromNote) === dirOf(toNote)) return source;
  let decoded = dest;
  try {
    decoded = decodeURIComponent(dest);
  } catch {
    // a stray % is not an encoding
  }
  const target = resolveFrom(dirOf(fromNote), decoded);
  if (target === null || target === "") return source;
  let out = relativeFrom(dirOf(toNote), target);
  if (!angled && /[\s()<>%]/.test(out)) out = out.split("/").map((s) => (s === ".." ? s : encodeURIComponent(s))).join("/");
  return `${head}${angled ? `<${out}>` : out}${tail}`;
}

// ── the copy strings ────────────────────────────────────────────────────────

/** The URL the server serves a vault file at (client/editor/embeds.ts
 *  `fileUrl`), made absolute against the page's origin. */
export function embedFileUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, "")}/api/file?path=${encodeURIComponent(path)}`;
}

/** The three strings the menu's copy rows put on the clipboard. Markdown is
 *  the source EXACTLY as written — width, anchor, alt text — and never a
 *  re-spelling of it. */
export function embedCopyStrings(source: string, path: string | null, origin: string): { markdown: string; path: string | null; link: string | null } {
  return {
    markdown: source,
    path,
    link: path === null ? null : embedFileUrl(origin, path),
  };
}

// ── the menu ────────────────────────────────────────────────────────────────

export type EmbedAction =
  | "copyImage"
  | "copyLink"
  | "copyMarkdown"
  | "copyPath"
  | "open"
  | "goToPage"
  | "reveal"
  | "saveAs"
  | "move"
  | "rename"
  | "remove";

export interface EmbedMenuContext {
  kind: EmbedKind;
  /** The session may write (not a visitor, not previewing as one). */
  admin: boolean;
  /** The embed names a file the server knows. A broken embed can still be
   *  removed and copied as Markdown — nothing that needs the file is offered. */
  resolved: boolean;
  /** `navigator.clipboard.write` and `ClipboardItem` exist here. */
  clipboardImage: boolean;
  /** `navigator.clipboard.writeText` exists here. */
  clipboardText: boolean;
  /** The note on this surface can be edited from here (an editor, or a
   *  reading view of a note the owner may write). */
  canEdit: boolean;
  /** A finger, not a pointer: no sidebar to reveal in, and "Move…" stands in
   *  for the drag a finger cannot make. */
  touch: boolean;
}

/** The rows, in order, with `null` for a separator. What a row cannot do here
 *  it is simply not offered: a menu row that does nothing is worse than none. */
export function embedMenuActions(ctx: EmbedMenuContext): (EmbedAction | null)[] {
  const pictured = ctx.kind === "image" || ctx.kind === "drawing" || ctx.kind === "pdfpage";
  const copy: EmbedAction[] = [];
  if (ctx.admin && pictured && ctx.resolved && ctx.clipboardImage) copy.push("copyImage");
  if (ctx.resolved && ctx.clipboardText) copy.push("copyLink");
  if (ctx.admin && ctx.clipboardText) copy.push("copyMarkdown");
  if (ctx.admin && ctx.resolved && ctx.clipboardText) copy.push("copyPath");
  const reach: EmbedAction[] = [];
  if (ctx.resolved) reach.push("open");
  if (ctx.admin && ctx.resolved && ctx.kind === "pdfpage") reach.push("goToPage");
  if (ctx.admin && ctx.resolved && !ctx.touch) reach.push("reveal");
  if (ctx.resolved) reach.push("saveAs");
  const arrange: EmbedAction[] = [];
  if (ctx.admin && ctx.canEdit && ctx.touch) arrange.push("move");
  // A drawing is two files (the drawing and the picture exported beside it),
  // and renaming one without the other breaks the embed: not offered.
  if (ctx.admin && ctx.resolved && ctx.kind !== "drawing") arrange.push("rename");
  const tail: EmbedAction[] = [];
  if (ctx.admin && ctx.canEdit) tail.push("remove");
  const out: (EmbedAction | null)[] = [];
  for (const group of [copy, reach, arrange, tail]) {
    if (group.length === 0) continue;
    if (out.length > 0) out.push(null);
    out.push(...group);
  }
  return out;
}
