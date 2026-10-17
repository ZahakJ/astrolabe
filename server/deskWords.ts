// A piece's length over time, for the Writing desk (docs/writing-desk.md).
//
// A note knows how long it is now and nothing about yesterday. Versions
// (server/versions.ts) keep text, at most forty of them, and only for writes
// made through this app; a curve of a draft growing over a month needs one
// number a day from every door a note comes in by — a save here, a save in
// Obsidian picked up by the watcher, a sync. The indexer passes every one of
// them, so it reports a piece's count here (server/indexer.ts), and this
// ledger keeps the LAST count of each day: ASTROLABE_DATA/desk-words.json,
// `{ version: 1, words: { <path>: { <YYYY-MM-DD>: <words> } } }`.
//
// Owner-only data, like created.json beside it: GET /api/desk answers for an
// admin session alone, and nothing here reaches the blog, the feed or search.
// A rename carries the log to the new path (server/renameRoutes.ts); a delete
// leaves it, so a piece restored from the trash keeps its curve.
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { logWords, wordPoints, type WordLog } from "../shared/desk.ts";
import { dataDir } from "./site.ts";
import { localIsoDay } from "../shared/dates.ts";

const FILE = "desk-words.json";

interface Ledger {
  version: 1;
  words: Record<string, WordLog>;
}

let ledger: Ledger | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

function storePath(): string {
  return path.join(dataDir(), FILE);
}

function load(): Ledger {
  if (ledger) return ledger;
  let out: Ledger = { version: 1, words: {} };
  try {
    const parsed = JSON.parse(readFileSync(storePath(), "utf8")) as { words?: unknown };
    const words = parsed?.words;
    if (typeof words === "object" && words !== null && !Array.isArray(words)) {
      for (const [p, log] of Object.entries(words as Record<string, unknown>)) {
        if (typeof log !== "object" || log === null || Array.isArray(log)) continue;
        const clean: WordLog = {};
        for (const [day, n] of Object.entries(log as Record<string, unknown>)) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(day) && typeof n === "number" && Number.isInteger(n) && n >= 0) clean[day] = n;
        }
        out.words[p] = clean;
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("astrolabe: desk-words.json unreadable — the desk's word curves start again:", err);
    }
    out = { version: 1, words: {} };
  }
  ledger = out;
  return out;
}

function persist(): void {
  if (!ledger || !dirty) return;
  dirty = false;
  const file = storePath();
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(ledger)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, file);
  chmodSync(file, 0o600);
}

function schedule(): void {
  dirty = true;
  if (flushTimer) return;
  // One write per burst: the first index of a vault reports every piece.
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      persist();
    } catch (err) {
      console.warn("astrolabe: could not write desk-words.json:", err);
    }
  }, 1500);
  flushTimer.unref?.();
}

/** The server's own calendar day — the day the owner sat down to write. */
const today = (): string => localIsoDay();

/** The indexer saw `relPath`, a piece, at `words` words. */
export function noteDeskWords(relPath: string, words: number, day = today()): void {
  const book = load();
  const before = book.words[relPath] ?? {};
  const after = logWords(before, day, words);
  if (after === before && book.words[relPath] !== undefined) return;
  book.words[relPath] = after;
  schedule();
}

/** A piece's curve, oldest day first. */
export function deskWordPoints(relPath: string): { day: string; words: number }[] {
  return wordPoints(load().words[relPath] ?? {});
}

/** A rename or move: the log follows the note. */
export function moveDeskWords(from: string, to: string): void {
  const book = load();
  const log = book.words[from];
  if (log === undefined) return;
  book.words[to] = { ...(book.words[to] ?? {}), ...log };
  delete book.words[from];
  schedule();
}

/** A folder moved: every log under it follows. */
export function moveDeskWordsFolder(from: string, to: string): void {
  const book = load();
  const prefix = `${from.replace(/\/+$/, "")}/`;
  const dest = `${to.replace(/\/+$/, "")}/`;
  let moved = false;
  for (const p of Object.keys(book.words)) {
    if (!p.startsWith(prefix)) continue;
    book.words[`${dest}${p.slice(prefix.length)}`] = book.words[p];
    delete book.words[p];
    moved = true;
  }
  if (moved) schedule();
}

/** For tests and shutdown: write now. */
export function flushDeskWords(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  persist();
}

/** For tests: forget the in-memory ledger so the next read hits the file. */
export function resetDeskWordsForTests(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  ledger = null;
  dirty = false;
}
