// THE IMPORTER: an Anki .apkg or a CSV/TSV → deck notes for Orbits.
//
// The owner's decks live in Anki, and "screw Anki" is only a plan if the
// decks come along. This module turns an Anki deck into one of Orbits'
// decks: one Markdown note per Anki deck, its cards as the
// lines shared/cards.ts already reads, its schedules as the Spaced
// Repetition plugin's comment — so an imported deck is indistinguishable
// from one written by hand, and NOTHING about it lives outside the note.
//
// What Anki has and this does not, and what happens to it:
//
//   NOTE TYPES are not rendered. A card in Anki is a template over fields;
//   here a card is `front::back`. So the first two fields are front and
//   back, every further non-empty field is the `::extra` (shown on the
//   answer side), a note whose type makes two cards becomes the plugin's
//   `front:::back` pair, and a Cloze note becomes one `==highlight==` line
//   per deletion. A third or later template on a non-cloze type is skipped
//   and counted: nothing here knows what it would have shown.
//
//   HTML in a field becomes text: tags stripped, entities decoded, a `<br>`
//   a space (a card is one line), `[sound:x.mp3]` and `<img src=x>` the
//   vault's own `![[x]]` embed, with the media copied into the attachments
//   folder the settings name — beside the note, like a paste would land.
//
//   THE SCHEDULE comes from the cards table, not the revlog: `due` counted
//   in days from the collection's creation day for a review card, seconds
//   for a card still in learning; `ivl` in days; `factor` already ×1000,
//   which is exactly the plugin's ease. A new card gets no comment. A
//   suspended card is skipped — the owner took it out of rotation on
//   purpose and the note has no way to say so.
//
//   SUBDECKS `A::B::C` become sections: headings inside A's note, so the
//   shelf can still study "B / C only".
//
// The archive is opened by server/zip.ts; the collection is a SQLite file
// and node:sqlite reads it — a dynamic import, so a Node too old for it
// says so (501) instead of failing to boot the whole server for the sake of
// one route. Newer Anki exports (`collection.anki21b`) compress the
// database and every media file with zstd; node:zlib has that too, and the
// same guard covers its absence.

import { promises as fsp } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { extensionOf, ATTACHMENT_TYPES } from "../shared/attachments.ts";
import { cardLineOf, DEFAULT_FOLDER, serialiseDeck, type DeckKind, type NewCard } from "../shared/decks.ts";
import { scanCards } from "../shared/cards.ts";
import { EASE_MIN, EASE_START, type Schedule } from "../shared/srs.ts";
import { registerAttachment, indexFile } from "./indexer.ts";
import { dataDir, uploadDirFor } from "./site.ts";
import { emitEvent, normalizeRel, safeAbs, VaultError, writeNote } from "./vault.ts";
import { readZipEntry, zipIndex, ZipError, type ZipEntry } from "./zip.ts";
import { localIsoDay } from "../shared/dates.ts";

// ───────────────────────────────────────────────────────────── the shapes

/** One card as the importer hands it to the note writer. A `reversed`
 *  card carries two schedules (front→back, back→front) the way the plugin
 *  keeps them in one comment; a `cloze` card's `front` is the whole line
 *  with its own deletion already marked `==…==`. */
export interface ImportCard {
  kind: "qa" | "reversed" | "cloze";
  front: string;
  back: string;
  extra: string | null;
  tags: string[];
  /** The section heading the card sits under, or null for the deck's own cards. */
  section: string | null;
  schedule: Schedule | null;
  /** The reverse direction's schedule, for a `reversed` pair. */
  reverse: Schedule | null;
}

export interface ImportDeck {
  title: string;
  cards: ImportCard[];
}

export type SkipReason =
  | "suspended"
  | "empty"
  | "frontTooLong"
  | "extraTemplates"
  | "unreadable"
  | "mediaUnsupported"
  | "mediaMissing";

export interface ImportResult {
  created: string[];
  /** Stars written: a `:::` pair counts two, like the skips do. */
  cards: number;
  skipped: Array<{ reason: SkipReason; count: number }>;
}

/** The counts as they accumulate; `list()` is the wire shape. */
export class Skips {
  private readonly counts = new Map<SkipReason, number>();
  add(reason: SkipReason, n = 1): void {
    this.counts.set(reason, (this.counts.get(reason) ?? 0) + n);
  }
  list(): Array<{ reason: SkipReason; count: number }> {
    return [...this.counts].map(([reason, count]) => ({ reason, count }));
  }
}

/** The inline card regex in shared/cards.ts takes at most 400
 *  characters before the `::`; a longer front is not a card there. */
const FRONT_MAX = 400;

// ───────────────────────────────────────────── a field's HTML, as text

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** An Anki field's HTML as one line of Markdown-ish text. Media references
 *  become the vault's embeds BEFORE the tags are stripped, so an `<img>`
 *  survives as `![[name]]` rather than vanishing with its tag. Line breaks
 *  collapse to a space: a card is one line of the note, and the four
 *  buttons under it do not care where the field's author pressed Enter. */
export function fieldText(html: string): string {
  let text = html
    .replace(/\[sound:([^\]]+)\]/g, (_, name: string) => `![[${decodeEntities(name).trim()}]]`)
    .replace(/<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi, (_, a?: string, b?: string, c?: string) => {
      const src = decodeEntities((a ?? b ?? c ?? "").trim());
      if (src === "") return " ";
      // A picture on the web is a link, not a file the archive carries.
      return /^[a-z][a-z0-9+.-]*:\/\//i.test(src) ? ` ![](${src}) ` : ` ![[${src}]] `;
    })
    // Anki's own LaTeX wrappers → the vault's math delimiters.
    .replace(/\[\$\$\]([\s\S]*?)\[\/\$\$\]/g, "$$$$$1$$$$")
    .replace(/\[\$\]([\s\S]*?)\[\/\$\]/g, "$$$1$$")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?(?:p|div|li|tr|h[1-6])\b[^>]*>/gi, " ")
    .replace(/<[a-z!/][^>]*>/gi, "");
  text = decodeEntities(text);
  return text.replace(/\s+/g, " ").trim();
}

/** `::` is the card separator, so a field that contains it would split
 *  where the author never meant a card to. Spaced out, it still reads.
 *  Every colon that touches another gets the space, not every pair: a
 *  `:::` softened pairwise leaves `: ::` behind, and that still splits. */
function unsplit(text: string): string {
  return text.replace(/:(?=:)/g, ": ");
}

/** The last word on whether a line is a card: the vault's own scanner
 *  reads it back. What it cannot read (a front nothing above foresaw) is
 *  skipped and counted rather than written as a line nobody will study. */
function readable(card: ImportCard): boolean {
  const line = cardLineOf(newCardOf({ ...card, schedule: null, reverse: null }));
  return line !== null && scanCards(`${line}\n`).length === 1;
}

const CLOZE_RE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;
/** The same shape without the global flag: `test()` on a global regex
 *  carries `lastIndex` from one string to the next. */
const CLOZE_TEST = /\{\{c\d+::/;

/** The distinct deletion numbers in a cloze field, in first-seen order. */
export function clozeOrdinals(text: string): number[] {
  const seen: number[] = [];
  for (const m of text.matchAll(CLOZE_RE)) {
    const n = Number(m[1]);
    if (!seen.includes(n)) seen.push(n);
  }
  return seen;
}

/** The cloze text as the line for deletion `ord`: that deletion becomes a
 *  `==highlight==`, every other deletion is shown plain (its hint dropped),
 *  which is what Anki shows on that card's answer side. `==` inside the
 *  text would open a highlight of its own, so it is softened. */
export function clozeLine(text: string, ord: number): string {
  const soft = text.replace(/==/g, "= =");
  return unsplit(
    soft.replace(CLOZE_RE, (_, n: string, body: string) => {
      const inner = body.replace(/==/g, "= =").trim();
      return Number(n) === ord ? `==${inner}==` : inner;
    }),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** The highlight the vault reads is `==…==` with no `=` inside and at most
 *  200 characters (shared/cards.ts, and the reading view's <mark>
 *  agrees), so a deletion like `{{c1::E = mc²}}` cannot be a highlight.
 *  Rather than lose the card it becomes a plain `front::back`: the text
 *  with the deletion blanked the way the scanner blanks one, and the
 *  deletion as the answer — the same card, studied the same way. */
export function clozeAsQa(text: string, ord: number): { front: string; back: string } | null {
  const answers: string[] = [];
  const front = unsplit(
    text.replace(CLOZE_RE, (_, n: string, body: string) => {
      const inner = body.trim();
      if (Number(n) !== ord) return inner;
      answers.push(inner);
      return "**[…]**";
    }),
  )
    .replace(/\s+/g, " ")
    .trim();
  const back = unsplit(answers.join(" · ")).replace(/\s+/g, " ").trim();
  return back === "" || front === "" ? null : { front, back };
}

/** Whether every deletion `ord` marks in `text` reads back as a highlight. */
export function clozeReadable(text: string, ord: number): boolean {
  for (const m of text.matchAll(CLOZE_RE)) {
    if (Number(m[1]) !== ord) continue;
    const inner = m[2].replace(/==/g, "= =").trim();
    if (inner === "" || inner.length > 200 || inner.includes("=")) return false;
  }
  return true;
}

/** Anki tags are `parent::child` and may hold anything; the note's are
 *  `#word`, and `/` is how the vault nests them. */
function cleanTags(raw: string): string[] {
  return raw
    .split(/\s+/)
    .map((t) => t.replace(/::/g, "/").replace(/[^\p{L}\p{N}_\-/]+/gu, "").replace(/^\/+|\/+$/g, ""))
    .filter((t) => t !== "");
}

// ───────────────────────────────────────────────── the note, serialised

/** An imported card in the shape the shared serialiser writes
 *  (shared/decks.ts cardLineOf): the pair, the cloze and the two
 *  schedules map one to one, and the escaping is the serialiser's. */
function newCardOf(card: ImportCard): NewCard {
  return {
    front: card.front,
    back: card.back,
    extra: card.extra,
    section: card.section,
    tags: card.tags,
    reversed: card.kind === "reversed",
    cloze: card.kind === "cloze",
    schedule: card.schedule,
    scheduleRev: card.reverse,
  };
}

/** The text of an imported deck note — the shared serialiser
 *  over the deck's cards, with the title in the fence: the importer names
 *  its files by a free-path rule that can add a number ("Spanish 2.md"),
 *  and the shelf must still say "Spanish". */
export function serialiseImportedDeck(deck: ImportDeck, kind: DeckKind = "basic"): string {
  const title = deck.title.replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim() || "Imported deck";
  return serialiseDeck({ title, kind, titleInFence: true }, deck.cards.map(newCardOf));
}

// ───────────────────────────────────────────────────────── CSV and TSV

/** RFC 4180 as people actually write it: quoted fields with `""` inside,
 *  newlines inside quotes, a delimiter that is a tab or a comma (or what
 *  Anki's own `#separator:` line says), a BOM ignored, a blank line no
 *  row. Anki's text export opens with `#key:value` lines; `#separator:`
 *  is honoured and the rest are skipped. */
export function parseDelimited(text: string, delimiter?: string): { rows: string[][]; delimiter: string } {
  let src = text.replace(/^﻿/, "");
  let sep = delimiter ?? "";
  // Anki's directives sit before the rows, one per line.
  while (/^#[a-z][a-z ]*:/i.test(src)) {
    const nl = src.indexOf("\n");
    const line = (nl < 0 ? src : src.slice(0, nl)).trim();
    src = nl < 0 ? "" : src.slice(nl + 1);
    const m = /^#separator:(.*)$/i.exec(line);
    if (m && sep === "") sep = separatorNamed(m[1].trim());
  }
  if (sep === "") {
    const head = src.slice(0, src.indexOf("\n") < 0 ? src.length : src.indexOf("\n"));
    sep = head.includes("\t") ? "\t" : head.includes(",") ? "," : head.includes(";") ? ";" : "\t";
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return { rows, delimiter: sep };
}

function separatorNamed(name: string): string {
  switch (name.toLowerCase()) {
    case "tab":
      return "\t";
    case "comma":
      return ",";
    case "semicolon":
      return ";";
    case "pipe":
      return "|";
    case "colon":
      return ":";
    case "space":
      return " ";
    default:
      return name.length === 1 ? name : "\t";
  }
}

const HEADER_WORDS = new Set([
  "front", "back", "extra", "question", "answer", "term", "definition", "word", "meaning",
  "hint", "example", "notes", "note", "tags", "reading", "translation", "prompt", "response",
  "text", "cloze", "kanji", "kana", "english", "arabic", "deck", "notetype", "guid",
]);

/** Whether the first row names its columns rather than being a card:
 *  every cell short and label-shaped, and at least one a word people
 *  actually head a column with. "cat,gato" stays a card. */
export function looksLikeHeader(row: string[]): boolean {
  if (row.length === 0 || row.some((c) => c.trim() === "" || c.length > 30 || /[.?!:]/.test(c))) return false;
  return row.some((c) => HEADER_WORDS.has(c.trim().toLowerCase()));
}

export interface CsvOptions {
  title: string;
  /** 0-based column indexes. */
  front: number;
  back: number;
  extra: number | null;
  tags: number | null;
  /** null: decide by `looksLikeHeader`. */
  header: boolean | null;
  delimiter?: string;
}

/** A CSV/TSV as one deck. */
export function csvDeck(text: string, opts: CsvOptions, skips: Skips): ImportDeck {
  const { rows } = parseDelimited(text, opts.delimiter);
  const header = opts.header ?? (rows.length > 1 && looksLikeHeader(rows[0]));
  const cards: ImportCard[] = [];
  for (const row of header ? rows.slice(1) : rows) {
    const cell = (i: number | null): string => (i === null || i < 0 || i >= row.length ? "" : unsplit(fieldText(row[i])));
    const front = cell(opts.front);
    const back = cell(opts.back);
    if (front === "" || back === "") {
      skips.add("empty");
      continue;
    }
    if (front.length > FRONT_MAX) {
      skips.add("frontTooLong");
      continue;
    }
    const extra = cell(opts.extra);
    const card: ImportCard = {
      kind: "qa",
      front,
      back,
      extra: extra === "" ? null : extra,
      tags: opts.tags === null ? [] : cleanTags(row[opts.tags] ?? ""),
      section: null,
      schedule: null,
      reverse: null,
    };
    if (!readable(card)) {
      skips.add("unreadable");
      continue;
    }
    cards.push(card);
  }
  return { title: opts.title, cards };
}

// ─────────────────────────────────────────────────────────── the .apkg

/** node:sqlite's surface, typed by hand so the module loads on a Node
 *  without it: the import below is the only place the name appears. */
interface SqliteDb {
  prepare(sql: string): { all(...args: unknown[]): Array<Record<string, unknown>>; get(...args: unknown[]): Record<string, unknown> | undefined };
  close(): void;
}

async function openSqlite(file: string): Promise<SqliteDb> {
  let mod: { DatabaseSync: new (file: string, opts?: { readOnly?: boolean }) => SqliteDb };
  try {
    mod = (await import("node:sqlite")) as unknown as typeof mod;
  } catch {
    throw new VaultError(501, `Importing .apkg needs node:sqlite (Node 22.5 or newer); this server runs ${process.version}`, "deckImportNoSqlite");
  }
  return new mod.DatabaseSync(file, { readOnly: true });
}

async function zstd(): Promise<(bytes: Uint8Array) => Uint8Array> {
  const zlib = await import("node:zlib");
  const fn = (zlib as unknown as { zstdDecompressSync?: (b: Uint8Array) => Buffer }).zstdDecompressSync;
  if (typeof fn !== "function") {
    throw new VaultError(501, `This .apkg was made by a recent Anki and is zstd-compressed; reading it needs Node 22.15 or newer (this server runs ${process.version})`, "deckImportNoZstd");
  }
  return (bytes) => {
    const out = fn(bytes);
    return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
  };
}

/** The `media` file of a recent export: a protobuf `MediaEntries` message
 *  — repeated field 1, each a `MediaEntry` whose field 1 is the name. The
 *  archive names the files by their index in that list. Two varint-and-
 *  length reads are the whole of the format this needs, so no library. */
export function mediaNamesFromProto(bytes: Uint8Array): string[] {
  const names: string[] = [];
  const dec = new TextDecoder();
  let at = 0;
  const varint = (): number => {
    let shift = 0;
    let value = 0;
    for (;;) {
      if (at >= bytes.length) throw new ZipError("apkg: the media index is truncated");
      const b = bytes[at++];
      value += (b & 0x7f) * 2 ** shift;
      shift += 7;
      if ((b & 0x80) === 0) return value;
    }
  };
  const skip = (wire: number): void => {
    if (wire === 0) varint();
    else if (wire === 1) at += 8;
    else if (wire === 2) at += varint();
    else if (wire === 5) at += 4;
    else throw new ZipError("apkg: unknown wire type in the media index");
  };
  while (at < bytes.length) {
    const key = varint();
    if ((key & 7) !== 2 || key >>> 3 !== 1) {
      skip(key & 7);
      continue;
    }
    const len = varint();
    const entry = bytes.subarray(at, at + len);
    at += len;
    // Inside the entry: field 1 (name) is the only one wanted.
    let name = "";
    let i = 0;
    const inner = (): number => {
      let shift = 0;
      let value = 0;
      for (;;) {
        const b = entry[i++];
        if (b === undefined) throw new ZipError("apkg: the media index is truncated");
        value += (b & 0x7f) * 2 ** shift;
        shift += 7;
        if ((b & 0x80) === 0) return value;
      }
    };
    while (i < entry.length) {
      const k = inner();
      const wire = k & 7;
      if (wire === 2) {
        const l = inner();
        if (k >>> 3 === 1) name = dec.decode(entry.subarray(i, i + l));
        i += l;
      } else if (wire === 0) inner();
      else if (wire === 1) i += 8;
      else if (wire === 5) i += 4;
      else break;
    }
    names.push(name);
  }
  return names;
}

interface Sched {
  crt: number;
}

/** Anki's cards row → the plugin's schedule, or null for a card never
 *  studied. `due` is days from the collection's creation day for a review
 *  card (queue 2 or 3), epoch seconds for one in learning (queue 1); a
 *  card in a filtered deck keeps its real due in `odue`. `ivl` in days;
 *  `factor` ×1000 already. The date is the SERVER's local day, as `crt`
 *  is the local day-rollover of the machine that made the deck. */
export function ankiSchedule(card: { type: number; queue: number; due: number; odue: number; odid: number; ivl: number; factor: number }, col: Sched, now = Date.now()): Schedule | null {
  if (card.type === 0) return null;
  const due = card.odid !== 0 && card.odue !== 0 ? card.odue : card.due;
  let dueMs: number;
  if (card.queue === 1 || (card.type !== 2 && due > 1_000_000_000)) dueMs = due * 1000;
  else dueMs = (col.crt + due * 86400) * 1000;
  if (!Number.isFinite(dueMs) || dueMs <= 0) dueMs = now;
  const ivl = card.ivl > 0 ? Math.min(card.ivl, 36500) : 1;
  const ease = card.factor > 0 ? Math.max(EASE_MIN, card.factor) : EASE_START;
  return { due: localIso(dueMs), interval: ivl, ease };
}

function localIso(ms: number): string {
  return localIsoDay(ms);
}

interface AnkiNoteType {
  fields: string[];
  templates: number;
}

interface AnkiCard {
  nid: number;
  did: number;
  ord: number;
  type: number;
  queue: number;
  due: number;
  odue: number;
  odid: number;
  ivl: number;
  factor: number;
}

export interface ApkgContents {
  decks: ImportDeck[];
  /** name → the archive entry holding it, for the media the cards mention. */
  media: Map<string, { entry: ZipEntry; compressed: boolean }>;
}

/** The archive's collection, read into decks. `tmpDir` is where the SQLite
 *  file is put for node:sqlite to open — under ASTROLABE_DATA/tmp in
 *  production — and removed again before this returns. */
export async function readApkg(bytes: Uint8Array, tmpDir: string, skips: Skips): Promise<ApkgContents> {
  const index = zipIndex(bytes);
  // An export with "support older Anki versions" on carries a plain
  // `collection.anki21` (and a stub `.anki2`); one without carries a
  // zstd-compressed `.anki21b` and the same stub. The plain one is
  // preferred when both are there: it needs nothing the stub does not.
  const legacy = index.get("collection.anki21") ?? (index.has("collection.anki21b") ? undefined : index.get("collection.anki2"));
  const modern = legacy ? undefined : index.get("collection.anki21b");
  if (!modern && !legacy) throw new VaultError(400, "Not an Anki package: no collection inside the archive", "orbitsImportNotApkg");
  const inflate = modern ? await zstd() : null;
  const dbBytes = modern && inflate ? inflate(readZipEntry(bytes, modern)) : readZipEntry(bytes, legacy!);
  const media = new Map<string, { entry: ZipEntry; compressed: boolean }>();
  const mediaEntry = index.get("media");
  if (mediaEntry) {
    const raw = readZipEntry(bytes, mediaEntry);
    let names: Record<string, string> = {};
    if (modern && inflate) {
      mediaNamesFromProto(inflate(raw)).forEach((name, i) => {
        names[String(i)] = name;
      });
    } else {
      try {
        names = JSON.parse(new TextDecoder().decode(raw)) as Record<string, string>;
      } catch {
        names = {};
      }
    }
    for (const [key, name] of Object.entries(names)) {
      const entry = index.get(key);
      if (entry && typeof name === "string") media.set(path.posix.basename(name), { entry, compressed: modern !== undefined });
    }
  }

  await fsp.mkdir(tmpDir, { recursive: true });
  const file = path.join(tmpDir, `collection-${randomBytes(6).toString("hex")}.sqlite`);
  await fsp.writeFile(file, dbBytes);
  try {
    const db = await openSqlite(file);
    try {
      return { decks: decksOf(db, skips), media };
    } finally {
      db.close();
    }
  } catch (err) {
    // A file that is not a database, or one without Anki's tables: the
    // archive is the caller's, so the answer is 400 and not a server fault.
    if ((err as NodeJS.ErrnoException | null)?.code === "ERR_SQLITE_ERROR") {
      throw new VaultError(400, `Not an Anki package: ${(err as Error).message}`, "orbitsImportNotApkg");
    }
    throw err;
  } finally {
    await fsp.rm(file, { force: true });
  }
}

function decksOf(db: SqliteDb, skips: Skips): ImportDeck[] {
  const col = db.prepare("select crt, models, decks from col").get();
  if (!col) throw new VaultError(400, "Not an Anki package: the collection has no col row", "orbitsImportNotApkg");
  const crt = Number(col.crt) || Math.floor(Date.now() / 1000);
  const tables = new Set(db.prepare("select name from sqlite_master where type = 'table'").all().map((r) => String(r.name)));

  // Note types and deck names: JSON in `col` for the schema every legacy
  // export writes, their own tables for a recent one.
  const types = new Map<number, AnkiNoteType>();
  const deckNames = new Map<number, string>();
  if (tables.has("notetypes") && tables.has("fields")) {
    for (const row of db.prepare("select id from notetypes").all()) {
      const id = Number(row.id);
      const fields = db.prepare("select name from fields where ntid = ? order by ord").all(id).map((r) => String(r.name));
      const templates = tables.has("templates") ? db.prepare("select count(*) as n from templates where ntid = ?").get(id) : undefined;
      types.set(id, { fields, templates: Number(templates?.n ?? 1) });
    }
    for (const row of db.prepare("select id, name from decks").all()) {
      deckNames.set(Number(row.id), String(row.name).replace(/\x1f/g, "::"));
    }
  } else {
    const models = parseJson<Record<string, { flds?: Array<{ name: string; ord?: number }>; tmpls?: unknown[] }>>(col.models);
    for (const [id, m] of Object.entries(models)) {
      const flds = [...(m.flds ?? [])].sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0));
      types.set(Number(id), { fields: flds.map((f) => f.name), templates: (m.tmpls ?? []).length || 1 });
    }
    const decks = parseJson<Record<string, { name?: string }>>(col.decks);
    for (const [id, d] of Object.entries(decks)) deckNames.set(Number(id), String(d.name ?? "Default"));
  }

  const cardsByNote = new Map<number, AnkiCard[]>();
  for (const row of db.prepare("select nid, did, ord, type, queue, due, odue, odid, ivl, factor from cards order by nid, ord").all()) {
    const card: AnkiCard = {
      nid: Number(row.nid),
      did: Number(row.did),
      ord: Number(row.ord),
      type: Number(row.type),
      queue: Number(row.queue),
      due: Number(row.due),
      odue: Number(row.odue),
      odid: Number(row.odid),
      ivl: Number(row.ivl),
      factor: Number(row.factor),
    };
    const list = cardsByNote.get(card.nid) ?? [];
    list.push(card);
    cardsByNote.set(card.nid, list);
  }

  // Deck order is Anki's own: by name, so a subdeck follows its parent.
  const decks = new Map<string, ImportDeck>();
  const deckFor = (did: number): { deck: ImportDeck; section: string | null } => {
    const full = deckNames.get(did) ?? "Default";
    const parts = full.split("::").map((p) => p.trim()).filter((p) => p !== "");
    const top = parts[0] ?? "Default";
    let deck = decks.get(top);
    if (!deck) {
      deck = { title: top, cards: [] };
      decks.set(top, deck);
    }
    return { deck, section: parts.length > 1 ? parts.slice(1).join(" / ") : null };
  };
  const scheduleOf = (card: AnkiCard): Schedule | null => ankiSchedule(card, { crt });

  for (const row of db.prepare("select id, mid, flds, tags from notes order by id").all()) {
    const nid = Number(row.id);
    const cards = cardsByNote.get(nid) ?? [];
    if (cards.length === 0) continue;
    const type = types.get(Number(row.mid)) ?? { fields: [], templates: 1 };
    const fields = String(row.flds).split("\x1f");
    const tags = cleanTags(String(row.tags ?? ""));
    const live = cards.filter((c) => {
      if (c.queue === -1) {
        skips.add("suspended");
        return false;
      }
      return true;
    });
    if (live.length === 0) continue;

    const clozeField = fields.findIndex((f) => CLOZE_TEST.test(f));
    if (clozeField >= 0) {
      // One line per deletion: the card for deletion N is the one with ord N-1.
      const text = fieldText(fields[clozeField]);
      const ords = clozeOrdinals(text);
      for (const card of live) {
        const ord = card.ord + 1;
        if (!ords.includes(ord)) {
          skips.add("empty");
          continue;
        }
        const { deck, section } = deckFor(card.odid || card.did);
        const base = { extra: null, tags, section, schedule: scheduleOf(card), reverse: null };
        const qa = clozeReadable(text, ord) ? null : clozeAsQa(text, ord);
        const made: ImportCard = qa ? { kind: "qa", ...qa, ...base } : { kind: "cloze", front: clozeLine(text, ord), back: "", ...base };
        if (!readable(made)) {
          skips.add("unreadable");
          continue;
        }
        deck.cards.push(made);
      }
      continue;
    }

    const front = unsplit(fieldText(fields[0] ?? ""));
    const back = unsplit(fieldText(fields[1] ?? ""));
    // "Basic (optional reversed card)" keeps its switch in a third field
    // called Add Reverse, holding a "y"; that is a setting, not an extra.
    const extras = fields
      .slice(2)
      .filter((_, i) => !/^add reverse$/i.test(type.fields[i + 2] ?? ""))
      .map((f) => unsplit(fieldText(f)))
      .filter((f) => f !== "");
    const extra = extras.length > 0 ? extras.join(" · ") : null;
    const forward = live.find((c) => c.ord === 0) ?? null;
    const reverse = live.find((c) => c.ord === 1) ?? null;
    const others = live.filter((c) => c.ord > 1);
    if (others.length > 0) skips.add("extraTemplates", others.length);
    if (!forward && !reverse) continue;
    if (front === "" || back === "") {
      skips.add("empty", (forward ? 1 : 0) + (reverse ? 1 : 0));
      continue;
    }
    if (front.length > FRONT_MAX || (reverse && back.length > FRONT_MAX)) {
      skips.add("frontTooLong", (forward ? 1 : 0) + (reverse ? 1 : 0));
      continue;
    }
    const { deck, section } = deckFor((forward ?? reverse)!.odid || (forward ?? reverse)!.did);
    let made: ImportCard;
    if (forward && reverse) {
      made = { kind: "reversed", front, back, extra, tags, section, schedule: scheduleOf(forward), reverse: scheduleOf(reverse) };
    } else if (forward) {
      made = { kind: "qa", front, back, extra, tags, section, schedule: scheduleOf(forward), reverse: null };
    } else {
      // Only the reverse card exists (an "optional reversed" type whose
      // forward card was deleted): back→front is what Anki asked.
      made = { kind: "qa", front: back, back: front, extra, tags, section, schedule: scheduleOf(reverse!), reverse: null };
    }
    if (!readable(made)) {
      skips.add("unreadable", forward && reverse ? 2 : 1);
      continue;
    }
    deck.cards.push(made);
  }

  // Cards under a section, grouped so each heading is written once, in
  // the order the sections first appeared; the deck's own cards first.
  for (const deck of decks.values()) {
    const order = new Map<string | null, number>([[null, 0]]);
    for (const card of deck.cards) if (!order.has(card.section)) order.set(card.section, order.size);
    deck.cards = deck.cards
      .map((card, i) => ({ card, i }))
      .sort((a, b) => order.get(a.card.section)! - order.get(b.card.section)! || a.i - b.i)
      .map((x) => x.card);
  }
  return [...decks.values()];
}

function parseJson<T>(value: unknown): T {
  if (typeof value !== "string" || value.trim() === "") return {} as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return {} as T;
  }
}

// ──────────────────────────────────────────────────── into the vault

const EMBED_RE = /!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;

/** A deck title as a filename: the characters no filesystem or wikilink
 *  takes are dropped, and an empty result is named for what it is. */
export function noteBaseName(title: string): string {
  const clean = title
    .replace(/[/\\:*?"<>|#^[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120);
  return clean || "Imported deck";
}

/** The first free `<dir>/<base>.md`, `<base> 2.md`, …: importing the same
 *  deck twice makes a second note, never a merge into the first. */
async function freeNotePath(dir: string, base: string): Promise<string> {
  for (let i = 1; i <= 500; i++) {
    const rel = normalizeRel(`${dir}/${i === 1 ? base : `${base} ${i}`}.md`);
    const abs = safeAbs(rel);
    try {
      await fsp.access(abs);
    } catch {
      return rel;
    }
  }
  throw new VaultError(409, `Could not find a free name for "${base}"`);
}

export interface ImportTarget {
  /** Vault-relative folder the notes go in; DEFAULT_FOLDER when empty. */
  folder: string;
}

/** Writes the decks as notes and copies the media their cards mention into
 *  the attachments folder the settings resolve for that note's folder. A
 *  media file that already exists there with the same bytes is reused; one
 *  with different bytes gets a numbered name and the embeds follow it. */
export async function writeDecks(decks: ImportDeck[], target: ImportTarget, media: ApkgContents["media"], archive: Uint8Array | null, skips: Skips): Promise<ImportResult> {
  const folder = normalizeRel(target.folder) || DEFAULT_FOLDER;
  const created: string[] = [];
  let cards = 0;
  const inflate = [...media.values()].some((m) => m.compressed) ? await zstd() : null;
  const placed = new Map<string, string>();
  for (const deck of decks) {
    if (deck.cards.length === 0) continue;
    const rel = await freeNotePath(folder, noteBaseName(deck.title));
    const attachDir = uploadDirFor(folder);
    for (const card of deck.cards) {
      for (const text of [card.front, card.back, card.extra ?? ""]) {
        for (const m of text.matchAll(EMBED_RE)) {
          const name = m[1].trim();
          if (placed.has(name)) continue;
          const found = media.get(name);
          if (!found || !archive) {
            skips.add("mediaMissing");
            placed.set(name, name);
            continue;
          }
          if (!Object.prototype.hasOwnProperty.call(ATTACHMENT_TYPES, extensionOf(name))) {
            skips.add("mediaUnsupported");
            placed.set(name, name);
            continue;
          }
          let bytes = readZipEntry(archive, found.entry);
          if (found.compressed && inflate) bytes = inflate(bytes);
          placed.set(name, await placeMedia(attachDir, name, bytes));
        }
      }
    }
    const renamed: ImportDeck = {
      title: deck.title,
      cards: deck.cards.map((card) => ({
        ...card,
        front: renameEmbeds(card.front, placed),
        back: renameEmbeds(card.back, placed),
        extra: card.extra === null ? null : renameEmbeds(card.extra, placed),
      })),
    };
    await writeNote(rel, serialiseImportedDeck(renamed));
    await indexFile(rel);
    emitEvent({ kind: "created", path: rel });
    created.push(rel);
    // Stars, not lines: a `:::` pair is two cards in Anki and two here, and
    // the skips are counted in cards too, so the two numbers add up.
    for (const card of deck.cards) cards += card.kind === "reversed" ? 2 : 1;
  }
  return { created, cards, skipped: skips.list() };
}

function renameEmbeds(text: string, placed: Map<string, string>): string {
  return text.replace(EMBED_RE, (whole, name: string) => {
    const to = placed.get(name.trim());
    return to === undefined || to === name.trim() ? whole : `![[${to}]]`;
  });
}

/** The media file's final basename inside `dir`. */
async function placeMedia(dir: string, name: string, bytes: Uint8Array): Promise<string> {
  const ext = extensionOf(name);
  const stem = name.slice(0, name.length - ext.length - 1);
  for (let i = 1; i <= 200; i++) {
    const candidate = i === 1 ? name : `${stem}-${i}.${ext}`;
    const rel = normalizeRel(`${dir}/${candidate}`);
    const abs = safeAbs(rel);
    let existing: Buffer | null = null;
    try {
      existing = await fsp.readFile(abs);
    } catch {
      /* free */
    }
    if (existing === null) {
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, bytes);
      registerAttachment(rel);
      return candidate;
    }
    if (existing.length === bytes.length && existing.equals(bytes)) return candidate;
  }
  throw new VaultError(409, `Could not find a free name for the media file "${name}"`);
}

/** Where the collection is unpacked: a directory of our own under the
 *  data dir, so a crash mid-import leaves at most a stray file there and
 *  never in the vault. */
export function importTmpDir(): string {
  return path.join(dataDir(), "tmp");
}

export interface ImportRequest {
  name: string;
  bytes: Uint8Array;
  folder: string;
  csv: Omit<CsvOptions, "title"> & { title: string | null };
}

/** The whole import, from an uploaded file to the notes it made. */
export async function importFile(req: ImportRequest): Promise<ImportResult> {
  const skips = new Skips();
  const ext = extensionOf(req.name);
  const target = { folder: req.folder };
  if (ext === "apkg" || ext === "zip" || ext === "colpkg") {
    let contents: ApkgContents;
    try {
      contents = await readApkg(req.bytes, importTmpDir(), skips);
    } catch (err) {
      if (err instanceof ZipError) throw new VaultError(400, err.message, "orbitsImportNotApkg");
      throw err;
    }
    return writeDecks(contents.decks, target, contents.media, req.bytes, skips);
  }
  if (ext === "csv" || ext === "tsv" || ext === "txt") {
    const text = new TextDecoder("utf-8").decode(req.bytes);
    const title = req.csv.title?.trim() || noteBaseName(req.name.replace(/\.[^.]+$/, ""));
    const deck = csvDeck(text, { ...req.csv, title, delimiter: ext === "tsv" ? "\t" : req.csv.delimiter }, skips);
    return writeDecks([deck], target, new Map(), null, skips);
  }
  throw new VaultError(400, "Import takes an Anki .apkg or a .csv/.tsv file", "orbitsImportUnknownType");
}
