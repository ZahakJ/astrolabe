// When a note was WRITTEN, kept the one place a save cannot move it.
//
// A post's date falls back to the file's birthtime when the frontmatter says
// nothing — and the editor saves through a temp file renamed over the note
// (vault.ts, the torn-file rule), which is a NEW inode with a new birthtime on
// every keystroke that lands. So "the day I wrote it" quietly became "the day
// I fixed a typo", and the blog reordered itself under the owner. The fix is
// not to give up atomic writes; it is to remember the first birthtime this
// instance ever saw for a path, in VELLUM_DATA/created.json, and answer with
// that from then on. Frontmatter still wins (a `date:` is the author's word);
// this ledger is only the fallback's memory.
//
// Seeding is the honest part. On an existing vault every edited note already
// carries a late birthtime, and the only older record of when a file appeared
// is git, when the vault is a repository (backup & sync makes it one): the
// commit that ADDED the path is read once, for every path, in a single
// `git log`, and the earlier of that and the birthtime is kept. A vault with
// no history seeds from what the filesystem says, which is the best available.
//
// Renames keep the inode, so a moved note's birthtime is still its own; the
// ledger follows the path the indexer reports and forgets a path when the
// indexer forgets it, so a note that leaves and comes back is met fresh.
import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { dataDir } from "./site.ts";
import { getVaultRoot } from "./vault.ts";

const FILE = "created.json";
const run = promisify(execFile);

interface Ledger {
  version: 1;
  /** vault-relative path → epoch ms of first sight */
  created: Record<string, number>;
}

let ledger: Ledger | null = null;
let dirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** Set by seedFromGit(); consulted only while the ledger has no entry. */
let gitAdded: Map<string, number> | null = null;

function storePath(): string {
  return path.join(dataDir(), FILE);
}

function load(): Ledger {
  if (ledger) return ledger;
  const file = storePath();
  let out: Ledger = { version: 1, created: {} };
  try {
    statSync(file);
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    const created = (parsed as { created?: unknown })?.created;
    if (typeof created === "object" && created !== null && !Array.isArray(created)) {
      for (const [p, ms] of Object.entries(created as Record<string, unknown>)) {
        if (typeof ms === "number" && Number.isFinite(ms) && ms > 0) out.created[p] = ms;
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("vellum: created.json unreadable — creation dates reseed from the files:", err);
    }
    out = { version: 1, created: {} };
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
  writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, file);
  chmodSync(file, 0o600);
}

function schedule(): void {
  dirty = true;
  if (flushTimer) return;
  // One write per burst: a first index touches every note in the vault.
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      persist();
    } catch (err) {
      console.warn("vellum: could not write created.json:", err);
    }
  }, 800);
}

/**
 * Read, once, when each path first appeared in the vault's history. Only worth
 * doing when the ledger is empty (a fresh instance over an old vault);
 * afterwards the ledger is the record.
 *
 * `--diff-filter=A` alone answers by the path a file was ADDED under, and a
 * vault that has been reorganised (this one has, many times) holds most notes
 * under paths they were renamed to later — the first attempt found none of
 * the owner's notes. So the whole history is walked oldest-first with renames
 * detected: an A seeds the path, an R carries the origin from the old path to
 * the new one, a D forgets it. One `git log`, whatever the vault's size.
 */
export async function seedFromGit(): Promise<void> {
  const root = getVaultRoot();
  if (!root) return;
  if (Object.keys(load().created).length > 0) return;
  try {
    const { stdout } = await run(
      "git",
      ["-C", root, "log", "--reverse", "--name-status", "-M", "--format=%x01%at", "--", "."],
      { maxBuffer: 256 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
    );
    const map = new Map<string, number>();
    let at = 0;
    for (const raw of stdout.split("\n")) {
      if (raw === "") continue;
      if (raw.startsWith("\x01")) {
        at = Number(raw.slice(1)) * 1000;
        continue;
      }
      if (!Number.isFinite(at) || at <= 0) continue;
      const cols = raw.split("\t");
      const status = cols[0] ?? "";
      if (status.startsWith("A") && cols[1]) {
        if (!map.has(cols[1])) map.set(cols[1], at);
      } else if (status.startsWith("R") && cols[1] && cols[2]) {
        const origin = map.get(cols[1]) ?? at;
        map.delete(cols[1]);
        map.set(cols[2], origin);
      } else if (status.startsWith("D") && cols[1]) {
        map.delete(cols[1]);
      }
    }
    gitAdded = map;
  } catch {
    // Not a repository, or no git on the box: the filesystem's word stands.
    gitAdded = null;
  }
}

/** The moment `relPath` was first written, as this instance knows it: the
 *  ledger's entry, else (seeding it now) the earlier of git's first add and
 *  the file's birthtime, else its mtime. */
export function createdMs(relPath: string, birthtimeMs: number, mtimeMs: number): number {
  const book = load();
  const known = book.created[relPath];
  if (known !== undefined) return known;
  const fs = birthtimeMs > 0 ? birthtimeMs : mtimeMs;
  const git = gitAdded?.get(relPath);
  const seed = git !== undefined && git > 0 && git < fs ? git : fs;
  book.created[relPath] = seed;
  schedule();
  return seed;
}

/** The indexer forgot the path (deleted, or moved away): so does the ledger.
 *  A move within the vault keeps the inode, so the new path reseeds from the
 *  same birthtime and nothing is lost. */
export function forgetCreated(relPath: string): void {
  const book = load();
  if (book.created[relPath] === undefined) return;
  delete book.created[relPath];
  schedule();
}

/** For tests and shutdown: write now. */
export function flushCreated(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  persist();
}

/** For tests: drop the in-memory ledger so the next read hits the file. */
export function resetCreatedForTests(): void {
  ledger = null;
  gitAdded = null;
  dirty = false;
}
