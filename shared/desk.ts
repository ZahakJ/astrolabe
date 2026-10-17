// THE WRITING DESK — the pieces of writing the owner means to write, from a
// passing idea to a published post (docs/writing-desk.md).
//
// A PIECE IS AN ORDINARY NOTE. Everything the desk knows is in its
// frontmatter, in keys Obsidian reads as plain properties:
//
//   ---
//   kind: essay
//   status: drafting          # idea → researching → outlining → drafting → editing → published, or parked
//   angle: One line that says what the piece argues.
//   series: "[[Bridges]]"     # optional: the series note it belongs to
//   lang: en                  # optional: en or ar
//   priority: high            # optional: high, medium or low
//   due: 2026-11-01           # optional
//   goal: 3000                # optional: the word target the status bar already reads
//   next: Find the 1820 survey # optional: the next step, in the writer's words
//   ---
//
// A SERIES is a note with `kind: series`, a `description:`, and its pieces in
// order under the `series:` key the blog's series already reads
// (shared/series.ts). An entry that names no note yet is a PLANNED SLOT: the
// piece exists as a name before it exists as a file.
//
// `series:` means two things, and `kind:` says which. On a piece it names the
// series the piece belongs to (one entry); on every other note it lists the
// parts of a series. The indexer reads it that way round (server/indexer.ts),
// so a draft's membership never turns the draft into a blog series of one.
//
// NOTHING HERE PUBLISHES ANYTHING. A piece is on the site when, and only when,
// its note carries `publish: true` — written by the ✦ toggle the rest of the
// product uses, never by the desk. `status: published` without the flag is a
// piece the writer has called finished and not yet sent out, and the desk
// shows it among the pieces being edited until it really is out.
//
// Pure: no DOM, no Node, no fetch. The server builds the wire shape from the
// index with it and the client draws the board from that; tests/desk.test.ts
// holds both halves.

import { parseSeriesRefs } from "./series.ts";

/** The road a piece travels, in order. */
export const DESK_STAGES = ["idea", "researching", "outlining", "drafting", "editing", "published"] as const;
export type DeskStage = (typeof DESK_STAGES)[number];
/** A stage, or set aside. */
export type DeskStatus = DeskStage | "parked";
/** The board's columns, left to right in the reading direction. */
export const DESK_STATUSES: readonly DeskStatus[] = [...DESK_STAGES, "parked"];

export type DeskKind = "essay" | "series";
export type DeskLang = "en" | "ar";
export type DeskPriority = "high" | "medium" | "low";

/** What one note's frontmatter says to the desk. */
export interface DeskMeta {
  kind: DeskKind;
  /** As written, folded to a known status; anything else reads as an idea. */
  status: DeskStatus;
  /** A piece's series, cleaned of its wikilink brackets but not resolved.
   *  Always null on a series note (its `series:` is the list of its parts). */
  series: string | null;
  lang: DeskLang | null;
  angle: string;
  priority: DeskPriority | null;
  /** YYYY-MM-DD, or null. */
  due: string | null;
  /** The writer's own next step, or "". */
  next: string;
  /** A series note's `description:`, or "". */
  description: string;
}

/** The ceiling on a one-line field: an angle is a sentence, not a paragraph. */
const LINE_MAX = 400;

function scalar(v: unknown): string | null {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (Array.isArray(v) && v.length > 0) return scalar(v[0]);
  return null;
}

/** The value of `key`, whatever its case in the file. */
function field(fm: Record<string, unknown>, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(fm, key)) return fm[key];
  for (const k of Object.keys(fm)) if (k.trim().toLowerCase() === key) return fm[k];
  return undefined;
}

function line(fm: Record<string, unknown>, key: string): string {
  const s = scalar(field(fm, key));
  return s === null ? "" : s.replace(/\s+/g, " ").slice(0, LINE_MAX);
}

/** `kind:` as the desk reads it. `piece` and `post` are accepted as other
 *  spellings of essay, because a writer reaches for the word they use. */
export function deskKindOf(fm: Record<string, unknown>): DeskKind | null {
  const k = line(fm, "kind").toLowerCase();
  if (k === "essay" || k === "piece" || k === "post") return "essay";
  if (k === "series") return "series";
  return null;
}

/** A status as written → the status it means. Unknown or empty → idea, so a
 *  note that says `kind: essay` and nothing else lands in the first column. */
export function parseDeskStatus(raw: string): DeskStatus {
  const s = raw.trim().toLowerCase();
  if ((DESK_STATUSES as readonly string[]).includes(s)) return s as DeskStatus;
  // The few spellings a hand reaches for first.
  if (s === "research") return "researching";
  if (s === "outline") return "outlining";
  if (s === "draft") return "drafting";
  if (s === "edit" || s === "revising" || s === "review") return "editing";
  if (s === "done") return "published";
  if (s === "paused" || s === "on hold" || s === "shelved") return "parked";
  return "idea";
}

function parseLang(raw: string): DeskLang | null {
  const s = raw.trim().toLowerCase();
  if (s === "en" || s === "english") return "en";
  if (s === "ar" || s === "arabic" || s === "عربي" || s === "العربية") return "ar";
  return null;
}

function parsePriority(raw: string): DeskPriority | null {
  const s = raw.trim().toLowerCase();
  if (s === "high" || s === "1" || s === "urgent") return "high";
  if (s === "medium" || s === "2" || s === "normal") return "medium";
  if (s === "low" || s === "3") return "low";
  return null;
}

function parseDue(raw: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(m[3]) ? null : `${m[1]}-${m[2]}-${m[3]}`;
}

/** What the desk reads off a note's parsed frontmatter, or null when the note
 *  is not a piece or a series. */
export function deskMetaOf(fm: Record<string, unknown>): DeskMeta | null {
  const kind = deskKindOf(fm);
  if (kind === null) return null;
  const refs = kind === "essay" ? parseSeriesRefs(fm) : null;
  return {
    kind,
    status: parseDeskStatus(line(fm, "status")),
    series: refs?.[0] ?? null,
    lang: parseLang(line(fm, "lang")),
    angle: line(fm, "angle"),
    priority: parsePriority(line(fm, "priority")),
    due: parseDue(line(fm, "due")),
    next: line(fm, "next"),
    description: kind === "series" ? line(fm, "description") : "",
  };
}

/** Where a piece stands on the board. The flag wins: a piece carrying
 *  `publish: true` IS published whatever its status says, and a status of
 *  published without the flag is still being edited. */
export function stageOf(status: DeskStatus, published: boolean): DeskStatus {
  if (published) return "published";
  return status === "published" ? "editing" : status;
}

// ───────────────────────────────────────────────────────────── the wire shape

/** One piece, as GET /api/desk sends it (admin only). */
export interface DeskPiece {
  path: string;
  title: string;
  /** The status the note says. */
  status: DeskStatus;
  /** Where the board shows it: `stageOf(status, published)`. */
  stage: DeskStatus;
  published: boolean;
  /** The series note the piece names, resolved to its path; null when it
   *  names none or names a note that is not there. */
  series: string | null;
  /** The entry as written, kept so an unresolved series still has a name. */
  seriesRef: string | null;
  lang: DeskLang | null;
  angle: string;
  priority: DeskPriority | null;
  due: string | null;
  next: string;
  words: number;
  /** `goal:` (shared/wordGoal.ts), or null. */
  goal: number | null;
  mtimeMs: number;
}

/** One entry of a series' list. `path` is null for a planned slot. */
export interface DeskSlot {
  ref: string;
  path: string | null;
}

/** One series note. */
export interface DeskSeries {
  path: string;
  title: string;
  status: DeskStatus;
  description: string;
  lang: DeskLang | null;
  angle: string;
  published: boolean;
  slots: DeskSlot[];
  mtimeMs: number;
}

export interface DeskData {
  pieces: DeskPiece[];
  series: DeskSeries[];
}

export interface DeskSourceRow {
  path: string;
  title: string;
}

/** One piece, with what it is built from (GET /api/desk/piece, admin only). */
export interface DeskPieceDetail {
  piece: DeskPiece;
  /** The series' title, when the piece names one that is a note. */
  seriesTitle: string | null;
  /** Notes this piece links to, that are not web clips. */
  linked: DeskSourceRow[];
  /** PDFs and EPUBs it links to: the library's books. */
  books: DeskSourceRow[];
  /** Linked notes the clipper made (a `source:` URL in their frontmatter). */
  clips: (DeskSourceRow & { url: string })[];
  /** Notes that link here. */
  backlinks: DeskSourceRow[];
  /** Words per day, oldest first (server/deskWords.ts). */
  words: { day: string; words: number }[];
}

// ─────────────────────────────────────────────────────────────── the board

export interface DeskFilter {
  /** A series path, NO_SERIES for the pieces in none, or null for all. */
  series: string | null;
  lang: DeskLang | null;
  status: DeskStatus | null;
}

export const NO_SERIES = "\u0000none";
export const ALL: DeskFilter = { series: null, lang: null, status: null };

export function filterPieces(pieces: readonly DeskPiece[], f: DeskFilter): DeskPiece[] {
  return pieces.filter((p) => {
    if (f.status !== null && p.stage !== f.status) return false;
    if (f.lang !== null && p.lang !== f.lang) return false;
    if (f.series === NO_SERIES) return p.series === null && p.seriesRef === null;
    if (f.series !== null && p.series !== f.series) return false;
    return true;
  });
}

const PRIORITY_RANK: Record<DeskPriority, number> = { high: 0, medium: 1, low: 2 };

/** The order inside a column: priority first, then the nearest due date,
 *  then the piece touched last. A board answers "what do I pick up next". */
export function comparePieces(a: DeskPiece, b: DeskPiece): number {
  const pa = a.priority === null ? 1.5 : PRIORITY_RANK[a.priority];
  const pb = b.priority === null ? 1.5 : PRIORITY_RANK[b.priority];
  if (pa !== pb) return pa - pb;
  if (a.due !== b.due) {
    if (a.due === null) return 1;
    if (b.due === null) return -1;
    return a.due < b.due ? -1 : 1;
  }
  if (a.mtimeMs !== b.mtimeMs) return b.mtimeMs - a.mtimeMs;
  return a.title.localeCompare(b.title);
}

/** Every column, in road order, with its pieces sorted. Every status gets a
 *  column, empty or not, so a drop target is always where the eye expects. */
export function boardColumns(pieces: readonly DeskPiece[]): { status: DeskStatus; pieces: DeskPiece[] }[] {
  return DESK_STATUSES.map((status) => ({
    status,
    pieces: pieces.filter((p) => p.stage === status).sort(comparePieces),
  }));
}

/** A piece has been drafted once it has reached drafting or gone past it. */
export function isDrafted(stage: DeskStatus): boolean {
  return stage === "drafting" || stage === "editing" || stage === "published";
}

/** One row of a series lane: a piece, another note the list names, or a
 *  planned slot with no note yet. */
export type LaneEntry =
  | { kind: "piece"; piece: DeskPiece }
  | { kind: "note"; ref: string; path: string }
  | { kind: "planned"; ref: string };

export interface Lane {
  /** The series note's path, or `ref:<name>` for a series named by pieces
   *  that has no note. */
  key: string;
  title: string;
  series: DeskSeries | null;
  entries: LaneEntry[];
  drafted: number;
  published: number;
  total: number;
}

/** Every series as a lane: its declared list in order (pieces, other notes and
 *  planned slots), then the pieces that name the series without being listed,
 *  in board order. A series named by pieces but with no note of its own still
 *  gets a lane, under the name they gave it. */
export function seriesLanes(data: DeskData): Lane[] {
  const byPath = new Map(data.pieces.map((p) => [p.path, p]));
  const lanes: Lane[] = [];
  for (const s of data.series) {
    const entries: LaneEntry[] = [];
    const seen = new Set<string>();
    for (const slot of s.slots) {
      if (slot.path === null) {
        entries.push({ kind: "planned", ref: slot.ref });
        continue;
      }
      if (seen.has(slot.path) || slot.path === s.path) continue;
      seen.add(slot.path);
      const piece = byPath.get(slot.path);
      entries.push(piece ? { kind: "piece", piece } : { kind: "note", ref: slot.ref, path: slot.path });
    }
    const extra = data.pieces.filter((p) => p.series === s.path && !seen.has(p.path)).sort(comparePieces);
    for (const piece of extra) entries.push({ kind: "piece", piece });
    lanes.push(laneOf(s.path, s.title, s, entries));
  }
  // Pieces naming a series that is not a note: grouped by the name written.
  const orphans = new Map<string, DeskPiece[]>();
  for (const p of data.pieces) {
    if (p.series !== null || p.seriesRef === null) continue;
    const key = p.seriesRef.toLowerCase();
    const list = orphans.get(key) ?? [];
    list.push(p);
    orphans.set(key, list);
  }
  for (const list of orphans.values()) {
    list.sort(comparePieces);
    lanes.push(laneOf(`ref:${list[0].seriesRef}`, list[0].seriesRef ?? "", null, list.map((piece) => ({ kind: "piece" as const, piece }))));
  }
  return lanes;
}

function laneOf(key: string, title: string, series: DeskSeries | null, entries: LaneEntry[]): Lane {
  let drafted = 0;
  let published = 0;
  for (const e of entries) {
    if (e.kind !== "piece") continue;
    if (isDrafted(e.piece.stage)) drafted++;
    if (e.piece.stage === "published") published++;
  }
  return { key, title, series, entries, drafted, published, total: entries.length };
}

// ─────────────────────────────────────────────────────────────── next step

/** What the card says to do next. `own` is the writer's `next:`; the rest are
 *  the desk's suggestion for the stage, keyed for the dictionary. */
export type NextStep =
  | { kind: "own"; text: string }
  | { kind: "angle" | "research" | "outline" | "headings" | "finish" | "publish" | "reread" | "live" | "parked" }
  | { kind: "words"; n: number };

export function nextStepOf(p: Pick<DeskPiece, "next" | "stage" | "status" | "angle" | "words" | "goal">): NextStep {
  if (p.next !== "") return { kind: "own", text: p.next };
  switch (p.stage) {
    case "idea":
      return p.angle === "" ? { kind: "angle" } : { kind: "research" };
    case "researching":
      return { kind: "outline" };
    case "outlining":
      return { kind: "headings" };
    case "drafting":
      return p.goal !== null && p.words < p.goal ? { kind: "words", n: p.goal - p.words } : { kind: "finish" };
    case "editing":
      return p.status === "published" ? { kind: "publish" } : { kind: "reread" };
    case "published":
      return { kind: "live" };
    case "parked":
      return { kind: "parked" };
  }
}

/** Is `due` (YYYY-MM-DD) before `today` (YYYY-MM-DD)? A published piece is
 *  never late. */
export function isOverdue(p: Pick<DeskPiece, "due" | "stage">, today: string): boolean {
  return p.due !== null && p.stage !== "published" && p.stage !== "parked" && p.due < today;
}

// ──────────────────────────────────────────────────────────────── capture

/** The folder a new piece is filed in. */
export const DESK_FOLDER = "Writing";

/** A file name from a title: the characters no file system allows out, the
 *  spaces folded, never a dotfile. */
export function pieceFileName(title: string): string {
  const clean = title.replace(/[\\/:*?"<>|#^[\]]+/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  return (clean || "Untitled").slice(0, 120);
}

export function pieceNotePath(title: string, folder = DESK_FOLDER): string {
  const dir = folder.replace(/^\/+|\/+$/g, "");
  return `${dir === "" ? "" : `${dir}/`}${pieceFileName(title)}.md`;
}

function quoted(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export interface NewPiece {
  kind: DeskKind;
  angle: string;
  /** A series note's name (written as a wikilink), or "". Pieces only. */
  series?: string;
  lang?: DeskLang | null;
  status?: DeskStatus;
}

/** The text of a new piece or series note: the frontmatter, and for a piece an
 *  empty outline to grow. No `publish:` key, ever — a new piece is private. */
export function newPieceContent(p: NewPiece): string {
  const lines = ["---", `kind: ${p.kind}`, `status: ${p.status ?? "idea"}`];
  const angle = p.angle.replace(/\s+/g, " ").trim().slice(0, LINE_MAX);
  if (p.kind === "series") {
    lines.push(`description: ${quoted(angle)}`);
    if (p.lang) lines.push(`lang: ${p.lang}`);
    lines.push("series: []");
    lines.push("---", "");
    return `${lines.join("\n")}\n`;
  }
  lines.push(`angle: ${quoted(angle)}`);
  const series = (p.series ?? "").trim();
  if (series !== "") lines.push(`series: ${quoted(`[[${series.replace(/^\[\[|\]\]$/g, "")}]]`)}`);
  if (p.lang) lines.push(`lang: ${p.lang}`);
  lines.push("---", "", "## Outline", "", "- ", "");
  return `${lines.join("\n")}\n`;
}

// ───────────────────────────────────────────────────── outline → headings

const OUTLINE_NAMES = new Set(["outline", "the outline", "plan", "مخطط", "المخطط", "الخطة"]);

interface OutlineItem {
  depth: number;
  text: string;
}

/** The note's outline section: a heading named Outline (or المخطط) and the
 *  list under it, down to the next heading of the same level or higher. */
export function findOutline(src: string): { level: number; start: number; end: number; items: OutlineItem[] } | null {
  const lines = src.split("\n");
  let fence: string | null = null;
  let inFrontmatter = lines[0]?.replace(/\r$/, "") === "---";
  let at = -1;
  let level = 0;
  let end = lines.length;
  for (let i = inFrontmatter ? 1 : 0; i < lines.length; i++) {
    const text = lines[i].replace(/\r$/, "");
    if (inFrontmatter) {
      if (text === "---") inFrontmatter = false;
      continue;
    }
    const marker = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(text);
    if (marker) {
      if (fence === null) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const h = /^(#{1,6})[ \t]+(.*?)[ \t#]*$/.exec(text);
    if (!h) continue;
    if (at < 0) {
      if (OUTLINE_NAMES.has(h[2].trim().toLowerCase())) {
        at = i;
        level = h[1].length;
      }
    } else if (h[1].length <= level) {
      end = i;
      break;
    }
  }
  if (at < 0) return null;
  const items: OutlineItem[] = [];
  fence = null;
  for (let i = at + 1; i < end; i++) {
    const text = lines[i].replace(/\r$/, "");
    const marker = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(text);
    if (marker) {
      if (fence === null) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const m = /^([ \t]*)(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?(.*)$/.exec(text);
    if (!m) continue;
    const item = m[2].trim();
    if (item === "") continue;
    const indent = m[1].replace(/\t/g, "    ").length;
    items.push({ depth: indent >= 2 ? 1 : 0, text: item });
  }
  return { level, start: at, end, items };
}

/** The outline's items, written out as headings after it. A top-level item
 *  becomes a heading at the outline's own level (an essay's sections are the
 *  outline's siblings), a nested item one level deeper. The outline itself
 *  stays: it is the plan, and the headings are the draft growing out of it.
 *  An item that already has a heading of its own is skipped, so running it
 *  twice adds nothing. Null when the note has no outline. */
export function outlineToHeadings(src: string): { text: string; added: number } | null {
  const outline = findOutline(src);
  if (outline === null) return null;
  const lines = src.split("\n");
  const existing = new Set<string>();
  for (const l of lines) {
    const h = /^#{1,6}[ \t]+(.*?)[ \t#]*\r?$/.exec(l);
    if (h) existing.add(h[1].trim().toLowerCase());
  }
  const out: string[] = [];
  for (const item of outline.items) {
    const key = item.text.toLowerCase();
    if (existing.has(key)) continue;
    existing.add(key);
    const level = Math.min(6, outline.level + item.depth);
    out.push(`${"#".repeat(level)} ${item.text}`, "");
  }
  if (out.length === 0) return { text: src, added: 0 };
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  // Inserted where the outline section ends, with one blank line before.
  const before = lines.slice(0, outline.end);
  while (before.length > outline.start + 1 && before[before.length - 1].replace(/\r$/, "").trim() === "") before.pop();
  const after = lines.slice(outline.end);
  const joined = [...before, "", ...out, ...after];
  let text = joined.join("\n");
  if (eol === "\r\n") text = text.replace(/\r?\n/g, "\r\n");
  const added = out.length / 2;
  return { text, added };
}

// ────────────────────────────────────────────────────── words over time

/** One point per day: the piece's word count at the last save of that day. */
export type WordLog = Record<string, number>;

/** Keep at most this many days per piece; the oldest go first. */
export const WORD_LOG_DAYS = 400;

/** The log with today's count written in. Returns the SAME object when
 *  nothing changed, so a caller can skip the write. */
export function logWords(log: WordLog, day: string, words: number): WordLog {
  if (log[day] === words) return log;
  const next: WordLog = { ...log, [day]: words };
  const days = Object.keys(next).sort();
  for (const d of days.slice(0, Math.max(0, days.length - WORD_LOG_DAYS))) delete next[d];
  return next;
}

/** The log as points in day order. */
export function wordPoints(log: WordLog): { day: string; words: number }[] {
  return Object.keys(log)
    .sort()
    .map((day) => ({ day, words: log[day] }));
}

/** Does this note's source declare it a piece? A cheap look at the leading
 *  frontmatter, for the editor to decide whether the piece bar is worth
 *  loading at all. */
export function isPieceSource(src: string): boolean {
  if (!src.startsWith("---\n") && !src.startsWith("---\r\n")) return false;
  const end = src.search(/\r?\n---(\r?\n|$)/);
  if (end < 0) return false;
  return /^kind:[ \t]*["']?(essay|piece|post)["']?[ \t]*(#.*)?$/im.test(src.slice(0, end));
}

/** One edit that turns `from` into `to`: the common prefix and suffix kept,
 *  the middle replaced — so a caret before the change stays where it was. */
export function minimalChange(from: string, to: string): { from: number; to: number; insert: string } {
  let a = 0;
  while (a < from.length && a < to.length && from[a] === to[a]) a++;
  let b = 0;
  while (b < from.length - a && b < to.length - a && from[from.length - 1 - b] === to[to.length - 1 - b]) b++;
  return { from: a, to: from.length - b, insert: to.slice(a, to.length - b) };
}
