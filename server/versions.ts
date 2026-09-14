// Note versions without git: the previous content of every note, kept on
// every write, in ASTROLABE_DATA/versions/.
//
// A note's history began the day the vault became a git repository and not
// one minute before. Backup & sync is off by default and stays off on most
// instances for weeks, and in that time the 600 ms autosave in
// client/components/Editor.tsx turned a bad paste, a select-all-and-type or a
// stray Ctrl+V into the only copy of the note within a second of it
// happening. The trash catches deletes; nothing caught overwrites. This is
// the net under that gap, and it stays under it beside git afterwards,
// because a snapshot is a commit somebody has to remember to take.
//
// THE SHAPE, AND WHY:
//
//   versions/<sha1 of the vault-relative path>/<epoch-ms>.md
//   versions/<sha1 …>/index.json   { version, path, versions: [{at, mtimeMs, size, reason}] }
//
// - A hash of the path, not the path: a vault path can be 200 characters of
//   Arabic in six nested folders, and the store must not care. index.json
//   carries the path in clear so the folder is legible and a rename can
//   rewrite it.
// - The PREVIOUS content, never the new one: the new one IS the note. Keeping
//   what a write replaced means a note with one version has exactly the two
//   states a reader needs — before and after.
// - Versions closer than the window to the last kept one COLLAPSE, and the
//   OLDER one is kept. A burst of autosaves over five minutes therefore leaves
//   the text from before the burst began — which is the one that predates the
//   mistake — rather than forty near-identical copies of the mistake itself.
//   A restore is exempt (see VersionReason in shared/types.ts).
// - Caps in three directions, so the store cannot become the disk's problem:
//   per note, per version's size, and for the whole store, oldest out first.
// - Every file lands by tmp+rename at mode 0600, like every other file in the
//   data directory. A torn index is an index that forgets a version; a
//   world-readable version is a note the OS mode said nobody else could read.
// - A version write NEVER fails the note write. The save is the reader's
//   text; the version is insurance on it, and insurance that can lose the
//   thing it insures is worse than none. Failures are logged and swallowed
//   here, at the seam, and nowhere else.
//
// This module imports nothing from the rest of the server on purpose.
// vault.ts calls it from inside writeNote, so an import back into site.ts or
// settings.ts would be a cycle through the most-imported module in the
// process; instead index.ts hands it its directory and its switch at boot,
// and a test hands it a temp directory. Uninitialised, every function here is
// a no-op — the durability suite writes notes with no version store and must
// keep doing so.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { NoteVersion, VersionReason } from "../shared/types.ts";

/** At most this many versions per note; the oldest goes when a new one lands. */
export const VERSIONS_PER_NOTE = 40;
/** Two autosave versions closer than this collapse into the older one. */
export const VERSION_WINDOW_MS = 5 * 60_000;
/** A note past this size is not versioned — the indexer's own ceiling
 *  (MAX_INDEXED_MD_BYTES), for the same reason: something that size is a
 *  database somebody pasted, not writing. */
export const VERSION_MAX_NOTE_BYTES = 2 * 1024 * 1024;
/** The whole store's ceiling; the oldest version anywhere is evicted first. */
export const VERSION_STORE_BYTES = 500 * 1024 * 1024;

const INDEX_FILE = "index.json";

interface VersionIndex {
  version: 1;
  /** The vault-relative note path, in clear. */
  path: string;
  /** Ascending by `at`. */
  versions: NoteVersion[];
}

interface Store {
  dir: string;
  enabled: () => boolean;
  windowMs: number;
  storeBytes: number;
}

let store: Store | null = null;
/** Every index read-modify-write rides this chain. Two autosaves of one note
 *  a few ms apart (the timer and an explicit Ctrl+S) would otherwise read
 *  the same index and the second write would forget the first's entry. */
let chain: Promise<void> = Promise.resolve();
/** Bytes held by the whole store, tallied once by walking the indexes and
 *  kept in step from then on. `null` until the first write asks. */
let totalBytes: number | null = null;
let tmpSeq = 0;

export interface VersionsOptions {
  /** The store directory, normally ASTROLABE_DATA/versions. */
  dir: string;
  /** Read at every write, so a settings change applies without a restart. */
  enabled?: () => boolean;
  /** The collapse window. NOTE_VERSIONS_WINDOW_MS in index.ts overrides it
   *  FOR TESTS AND HARNESSES ONLY — a browser check cannot wait five minutes
   *  between two edits — and it is not a documented setting. */
  windowMs?: number;
  storeBytes?: number;
}

export function initVersions(opts: VersionsOptions): void {
  store = {
    dir: path.resolve(opts.dir),
    enabled: opts.enabled ?? (() => true),
    windowMs: opts.windowMs ?? VERSION_WINDOW_MS,
    storeBytes: opts.storeBytes ?? VERSION_STORE_BYTES,
  };
  totalBytes = null;
  chain = Promise.resolve();
}

/** Forget the store — for tests, which point it at one temp dir after another. */
export function resetVersionsForTests(): void {
  store = null;
  totalBytes = null;
  chain = Promise.resolve();
}

/** Whether writes are being versioned right now: a store, and its switch on. */
export function versionsEnabled(): boolean {
  return store !== null && store.enabled();
}

// ------------------------------------------------------------------ files

function noteDir(rel: string): string {
  if (!store) throw new Error("version store not initialised");
  return path.join(store.dir, createHash("sha1").update(rel).digest("hex"));
}

function blobName(at: number): string {
  return `${at}.md`;
}

/** tmp + rename at 0600, the data directory's own discipline. The temp file
 *  is a sibling, so the rename stays on one filesystem. */
async function writeAtomic(file: string, data: string): Promise<void> {
  tmpSeq += 1;
  const tmp = `${file}.${process.pid}.${tmpSeq}.tmp`;
  try {
    const handle = await fs.open(tmp, "w", 0o600);
    try {
      await handle.writeFile(data, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

async function readIndex(dir: string): Promise<VersionIndex | null> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(dir, INDEX_FILE), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<VersionIndex>;
    if (typeof parsed.path !== "string" || !Array.isArray(parsed.versions)) return null;
    // A corrupt entry is dropped, not a corrupt file: the versions on disk
    // beside it are still whole.
    const versions = parsed.versions.filter(
      (v): v is NoteVersion =>
        typeof v === "object" && v !== null &&
        Number.isInteger((v as NoteVersion).at) && Number.isFinite((v as NoteVersion).mtimeMs) &&
        Number.isFinite((v as NoteVersion).size) && typeof (v as NoteVersion).reason === "string",
    );
    versions.sort((a, b) => a.at - b.at);
    return { version: 1, path: parsed.path, versions };
  } catch {
    return null;
  }
}

async function writeIndex(dir: string, index: VersionIndex): Promise<void> {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await writeAtomic(path.join(dir, INDEX_FILE), `${JSON.stringify(index, null, 2)}\n`);
}

/** Every index in the store. Tolerant: a stray file in the store directory,
 *  or a note folder without an index, is skipped rather than fatal. */
async function allIndexes(): Promise<{ dir: string; index: VersionIndex }[]> {
  if (!store) return [];
  let names: string[];
  try {
    names = await fs.readdir(store.dir);
  } catch {
    return [];
  }
  const out: { dir: string; index: VersionIndex }[] = [];
  for (const name of names) {
    if (!/^[0-9a-f]{40}$/.test(name)) continue;
    const dir = path.join(store.dir, name);
    const index = await readIndex(dir);
    if (index) out.push({ dir, index });
  }
  return out;
}

async function tally(): Promise<number> {
  if (totalBytes !== null) return totalBytes;
  let sum = 0;
  for (const { index } of await allIndexes()) for (const v of index.versions) sum += v.size;
  totalBytes = sum;
  return sum;
}

/** Remove one version's blob; a blob already gone is not an error. */
async function unlinkBlob(dir: string, v: NoteVersion): Promise<void> {
  await fs.rm(path.join(dir, blobName(v.at)), { force: true });
  if (totalBytes !== null) totalBytes = Math.max(0, totalBytes - v.size);
}

/** Bring the whole store under its ceiling, oldest version first — across
 *  every note, because a cap per note is no cap on a vault of ten thousand.
 *  Runs only when the tally says it must, so the common write never walks
 *  the store. */
async function enforceStoreCap(): Promise<void> {
  if (!store) return;
  if ((await tally()) <= store.storeBytes) return;
  const all = await allIndexes();
  const flat = all.flatMap((e) => e.index.versions.map((v) => ({ ...e, v })));
  flat.sort((a, b) => a.v.at - b.v.at);
  const touched = new Map<string, VersionIndex>();
  for (const { dir, index, v } of flat) {
    if ((totalBytes ?? 0) <= store.storeBytes) break;
    await unlinkBlob(dir, v);
    index.versions = index.versions.filter((x) => x.at !== v.at);
    touched.set(dir, index);
  }
  for (const [dir, index] of touched) {
    if (index.versions.length === 0) await fs.rm(dir, { recursive: true, force: true });
    else await writeIndex(dir, index);
  }
}

/** Is a write NOW inside the collapse window of the last kept version?
 *  `at` is strictly increasing per note and can therefore sit a few ms AHEAD
 *  of the clock after a burst in one millisecond, which makes the plain
 *  difference negative — and a negative number is "less than the window"
 *  even when the window is zero. A zero window means "never collapse", and
 *  it has to mean that. */
function insideWindow(lastAt: number, windowMs: number): boolean {
  return windowMs > 0 && Date.now() - lastAt < windowMs;
}

function serial<T>(work: () => Promise<T>): Promise<T> {
  const run = chain.then(work, work);
  chain = run.then(() => undefined, () => undefined);
  return run;
}

// --------------------------------------------------------------- capture

/** What `writeNote` holds between deciding to keep a version and the write
 *  succeeding: the content is READ before the rename replaces it, and WRITTEN
 *  to the store only once the note itself is safely on disk. */
export interface VersionCapture {
  keep(): Promise<void>;
}

/** The stat of the file about to be replaced, as `writeNote` already has it. */
export interface PreviousFile {
  mtimeMs: number;
  size: number;
}

/** Decide whether the write about to happen to `rel` should leave a version
 *  behind, and if so read the content now. Answers null — cheaply, without
 *  reading the note — when the store is off, the note is too big, the write
 *  changes nothing, or an autosave lands inside the collapse window of the
 *  last kept version. Never throws: a store that cannot be read is a store
 *  that keeps nothing this time, and the save goes ahead. */
export async function captureVersion(
  rel: string,
  abs: string,
  previous: PreviousFile | null,
  next: string,
  reason: VersionReason,
): Promise<VersionCapture | null> {
  if (!store || !store.enabled() || previous === null) return null;
  if (previous.size > VERSION_MAX_NOTE_BYTES) return null;
  const s = store;
  try {
    const dir = noteDir(rel);
    if (reason === "autosave") {
      const index = await readIndex(dir);
      const last = index?.versions.at(-1);
      if (last && insideWindow(last.at, s.windowMs)) return null;
    }
    const content = await fs.readFile(abs, "utf8");
    // A write that changes nothing (a publish toggle re-saving the same
    // bytes, a fence edit that landed on the same text) is not a version.
    if (content === next) return null;
    const mtimeMs = previous.mtimeMs;
    return {
      keep: () =>
        serial(async () => {
          try {
            await keepNow(rel, dir, content, mtimeMs, reason);
          } catch (err) {
            console.warn(`astrolabe: could not keep a version of ${rel} —`, err);
          }
        }),
    };
  } catch (err) {
    console.warn(`astrolabe: could not read ${rel} for its version —`, err);
    return null;
  }
}

async function keepNow(
  rel: string,
  dir: string,
  content: string,
  mtimeMs: number,
  reason: VersionReason,
): Promise<void> {
  if (!store) return;
  const index = (await readIndex(dir)) ?? { version: 1 as const, path: rel, versions: [] };
  index.path = rel;
  const last = index.versions.at(-1);
  // Re-checked under the chain: two captures of one note can be in flight,
  // and the second must see the first's entry rather than its own stale read.
  if (reason === "autosave" && last && insideWindow(last.at, store.windowMs)) return;
  // `at` is a filename and the listing's key, so it is strictly increasing
  // per note even when the clock is not (two writes in one ms, or a clock
  // stepped backwards by NTP).
  const at = Math.max(Date.now(), (last?.at ?? 0) + 1);
  const size = Buffer.byteLength(content, "utf8");
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await writeAtomic(path.join(dir, blobName(at)), content);
  index.versions.push({ at, mtimeMs, size, reason });
  await tally();
  totalBytes = (totalBytes ?? 0) + size;
  while (index.versions.length > VERSIONS_PER_NOTE) {
    const oldest = index.versions.shift();
    if (oldest) await unlinkBlob(dir, oldest);
  }
  await writeIndex(dir, index);
  await enforceStoreCap();
}

// ----------------------------------------------------------------- reads

/** The versions kept for one note, newest first. Empty when there are none
 *  or the store is uninitialised; never throws for a missing folder. */
export async function listVersions(rel: string): Promise<NoteVersion[]> {
  if (!store) return [];
  const index = await readIndex(noteDir(rel));
  if (!index) return [];
  return [...index.versions].reverse();
}

/** One version's content, or null when no such version is kept. `at` is
 *  validated by the caller (digits only): it becomes a filename here. */
export async function readVersion(rel: string, at: number): Promise<string | null> {
  if (!store || !Number.isInteger(at) || at <= 0) return null;
  const dir = noteDir(rel);
  const index = await readIndex(dir);
  if (!index || !index.versions.some((v) => v.at === at)) return null;
  try {
    return await fs.readFile(path.join(dir, blobName(at)), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

// --------------------------------------------------------------- moves

/** A note moved: its versions follow it. When the destination already holds
 *  versions (a note deleted and a new one written at that name, then the
 *  old one restored beside it and renamed over), the two lists merge rather
 *  than one erasing the other. Errors are logged: a rename that succeeded
 *  must not be reported as failed because its history did not follow. */
export function moveVersions(from: string, to: string): Promise<void> {
  if (!store || from === to) return Promise.resolve();
  return serial(async () => {
    try {
      const fromDir = noteDir(from);
      const toDir = noteDir(to);
      const src = await readIndex(fromDir);
      if (!src) return;
      const dst = await readIndex(toDir);
      if (!dst) {
        await fs.rename(fromDir, toDir);
        await writeIndex(toDir, { ...src, path: to });
        return;
      }
      for (const v of src.versions) {
        await fs.rename(path.join(fromDir, blobName(v.at)), path.join(toDir, blobName(v.at))).catch(() => {});
      }
      const merged = [...dst.versions, ...src.versions].sort((a, b) => a.at - b.at);
      while (merged.length > VERSIONS_PER_NOTE) {
        const oldest = merged.shift();
        if (oldest) await unlinkBlob(toDir, oldest);
      }
      await writeIndex(toDir, { version: 1, path: to, versions: merged });
      await fs.rm(fromDir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`astrolabe: could not move the versions of ${from} —`, err);
    }
  });
}

/** Erase every version of one note. The trash's purge calls this: a note
 *  the reader has erased for good should not survive as forty copies in the
 *  data directory. */
export function dropVersions(rel: string): Promise<void> {
  if (!store) return Promise.resolve();
  return serial(async () => {
    try {
      const dir = noteDir(rel);
      const index = await readIndex(dir);
      if (index && totalBytes !== null) {
        for (const v of index.versions) totalBytes = Math.max(0, totalBytes - v.size);
      }
      await fs.rm(dir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`astrolabe: could not drop the versions of ${rel} —`, err);
    }
  });
}

/** Erase the versions of every note under a folder — the purge of a trashed
 *  folder. `keep(path)` lets the caller spare a path that is occupied again
 *  by a live note, whose versions are its own and not the dead folder's. */
export function dropVersionsUnder(
  folder: string,
  keep: (rel: string) => Promise<boolean>,
): Promise<void> {
  if (!store) return Promise.resolve();
  const prefix = `${folder}/`;
  return serial(async () => {
    try {
      for (const { dir, index } of await allIndexes()) {
        if (index.path !== folder && !index.path.startsWith(prefix)) continue;
        if (await keep(index.path)) continue;
        if (totalBytes !== null) {
          for (const v of index.versions) totalBytes = Math.max(0, totalBytes - v.size);
        }
        await fs.rm(dir, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn(`astrolabe: could not drop the versions under ${folder} —`, err);
    }
  });
}
