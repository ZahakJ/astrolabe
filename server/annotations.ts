// NOTE ANNOTATIONS — what the owner said about a passage, kept beside the
// vault and never in it (ASTROLABE_DATA/annotations.json, the books.json idiom).
//
// The store is a map from note path to its annotations. A path is the key
// because it is what every shell asks by; the rename and folder-move routes
// carry the entries along so an annotation survives the note moving, and a
// note that is deleted keeps its entries until something writes over them —
// an entry for a note that is not there costs nothing and answers nothing.
//
// WHO SEES WHAT. The owner sees every annotation of a note they can read. A
// visitor sees only the PUBLIC ones, and only on a note that is published to
// them — the same two-part gate comments have — and never learns that the
// private ones exist.

import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { INK_COUNT, newHighlightId } from "../shared/bookAnchor.ts";
import { CONTEXT_MAX, NOTE_MAX, QUOTE_MAX, foldSpace } from "../shared/textQuote.ts";
import type { NoteAnnotation } from "../shared/types.ts";
import { dataDir } from "./site.ts";
import { VaultError } from "./vault.ts";

const FILE = "annotations.json";
/** Per note. A note with more marks than this is a note that should be split. */
const PER_NOTE_MAX = 400;
/** C0 controls and DEL, out at write time — the comments rule. */
const CONTROLS = new RegExp("[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]", "g");

interface StoreFile {
  version: 1;
  notes: Record<string, NoteAnnotation[]>;
}

let cache: { store: StoreFile; mtimeMs: number } | null = null;

function storePath(): string {
  return path.join(dataDir(), FILE);
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(CONTROLS, "").slice(0, max) : "";
}

function clean(value: unknown): NoteAnnotation | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const quote = foldSpace(text(v.quote, QUOTE_MAX));
  if (quote === "") return null;
  const id = typeof v.id === "string" && /^[a-z0-9]{6,32}$/.test(v.id) ? v.id : newHighlightId();
  const inkRaw = typeof v.ink === "number" && Number.isFinite(v.ink) ? Math.round(v.ink) : 1;
  const now = Date.now();
  const createdAt = typeof v.createdAt === "number" && Number.isFinite(v.createdAt) ? v.createdAt : now;
  const updatedAt = typeof v.updatedAt === "number" && Number.isFinite(v.updatedAt) ? v.updatedAt : createdAt;
  return {
    id,
    quote,
    prefix: foldSpace(text(v.prefix, CONTEXT_MAX * 2)).slice(-CONTEXT_MAX),
    suffix: foldSpace(text(v.suffix, CONTEXT_MAX * 2)).slice(0, CONTEXT_MAX),
    ink: Math.min(INK_COUNT, Math.max(1, inkRaw)),
    note: text(v.note, NOTE_MAX).trim(),
    public: v.public === true,
    createdAt,
    updatedAt,
  };
}

function readStore(): StoreFile {
  const file = storePath();
  let mtimeMs = -1;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    cache = { store: { version: 1, notes: {} }, mtimeMs };
    return cache.store;
  }
  if (cache && cache.mtimeMs === mtimeMs) return cache.store;
  const store: StoreFile = { version: 1, notes: {} };
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    const notes = (parsed as { notes?: unknown })?.notes;
    if (typeof notes === "object" && notes !== null && !Array.isArray(notes)) {
      for (const [notePath, list] of Object.entries(notes as Record<string, unknown>)) {
        if (!Array.isArray(list)) continue;
        const kept = list.map(clean).filter((a): a is NoteAnnotation => a !== null).slice(0, PER_NOTE_MAX);
        if (kept.length > 0) store.notes[notePath] = kept;
      }
    }
  } catch (err) {
    console.warn("astrolabe: annotations.json unreadable — annotations start fresh:", err);
  }
  cache = { store, mtimeMs };
  return store;
}

function persist(store: StoreFile): void {
  const file = storePath();
  mkdirSync(path.dirname(file), { recursive: true });
  // Write-then-rename, the settings.ts and books.json rule: a torn file would
  // lose what nobody can recompute.
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, file);
  chmodSync(file, 0o600);
  cache = null;
}

/** Every annotation of a note (the owner's view), oldest first. */
export function listAnnotations(notePath: string): NoteAnnotation[] {
  return [...(readStore().notes[notePath] ?? [])].sort((a, b) => a.createdAt - b.createdAt);
}

/** The public ones only — a visitor's view, and the shape a public page gets. */
export function publicAnnotations(notePath: string): NoteAnnotation[] {
  return listAnnotations(notePath).filter((a) => a.public);
}

/** Upsert by id: a new mark, an edited message, a changed ink or a flipped
 *  public switch are one request with one id. */
export function putAnnotation(notePath: string, input: unknown): NoteAnnotation {
  const next = clean(input);
  if (next === null) throw new VaultError(400, "An annotation needs a quote");
  const store = readStore();
  const previous = store.notes[notePath] ?? [];
  const at = previous.findIndex((a) => a.id === next.id);
  if (at === -1 && previous.length >= PER_NOTE_MAX) {
    throw new VaultError(400, `A note may hold ${PER_NOTE_MAX} annotations`);
  }
  const merged: NoteAnnotation =
    at === -1 ? next : { ...next, createdAt: previous[at].createdAt, updatedAt: Date.now() };
  const list = at === -1 ? [...previous, merged] : previous.map((a, i) => (i === at ? merged : a));
  persist({ ...store, notes: { ...store.notes, [notePath]: list } });
  return merged;
}

export function deleteAnnotation(notePath: string, id: string): void {
  const store = readStore();
  const previous = store.notes[notePath];
  if (!previous) return;
  const list = previous.filter((a) => a.id !== id);
  const notes = { ...store.notes };
  if (list.length === 0) delete notes[notePath];
  else notes[notePath] = list;
  persist({ ...store, notes });
}

/** A renamed note takes its annotations with it. */
export function moveAnnotations(from: string, to: string): void {
  const store = readStore();
  const list = store.notes[from];
  if (!list) return;
  const notes = { ...store.notes };
  delete notes[from];
  notes[to] = [...(notes[to] ?? []), ...list];
  persist({ ...store, notes });
}

/** A moved folder takes every note's annotations with it. */
export function moveAnnotationsFolder(fromDir: string, toDir: string): void {
  const store = readStore();
  const prefix = fromDir.endsWith("/") ? fromDir : `${fromDir}/`;
  const target = toDir.endsWith("/") ? toDir : `${toDir}/`;
  let moved = false;
  const notes: Record<string, NoteAnnotation[]> = {};
  for (const [notePath, list] of Object.entries(store.notes)) {
    if (notePath.startsWith(prefix)) {
      notes[target + notePath.slice(prefix.length)] = list;
      moved = true;
    } else notes[notePath] = list;
  }
  if (moved) persist({ ...store, notes });
}
