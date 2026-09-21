/**
 * THE FILESYSTEM THE POCKET VAULT LIVES ON.
 *
 * One interface, deliberately shaped as the `fs.promises` subset
 * `isomorphic-git` asks for, so the same object is both "the vault" and "the
 * repository" and there is never a copy of a note in two places.
 *
 * The backing store is IndexedDB (LightningFS). The alternative considered was
 * a `@capacitor/filesystem` adapter, and it lost on a fact rather than a
 * preference: the pocket server has to be reachable from a SERVICE WORKER,
 * because `<img src="/api/file?path=…">` is not a `fetch` the page can patch,
 * and a service worker has no Capacitor bridge — `@capacitor/filesystem` is
 * unreachable from it by construction. The measured numbers are in
 * docs/mobile.md and CONTRACTS.md; the architecture decided it first.
 */

/** What `fs.stat`/`fs.lstat` answers. Only the fields anything here reads. */
export interface PocketStat {
  type: "file" | "dir" | "symlink";
  mode: number;
  size: number;
  mtimeMs: number;
  ino?: number;
  ctimeMs?: number;
  uid?: number;
  gid?: number;
  dev?: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

/** The `fs.promises` surface. `isomorphic-git` uses exactly these. */
export interface PocketFsPromises {
  readFile(path: string, options?: { encoding?: "utf8" } | string): Promise<Uint8Array | string>;
  writeFile(path: string, data: Uint8Array | string, options?: { encoding?: "utf8"; mode?: number } | string): Promise<void>;
  unlink(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  mkdir(path: string, options?: { mode?: number }): Promise<void>;
  rmdir(path: string): Promise<void>;
  stat(path: string): Promise<PocketStat>;
  lstat(path: string): Promise<PocketStat>;
  rename(from: string, to: string): Promise<void>;
  readlink?(path: string): Promise<string>;
  symlink?(target: string, path: string): Promise<void>;
  /** Persist the directory tree NOW.
   *
   *  LightningFS writes a file's bytes to IndexedDB at once but saves its
   *  "superblock" — the tree of names and stats — on a 500 ms idle timer. A
   *  clone that finishes and immediately hands the WebView to the vault
   *  therefore arrives at a document whose filesystem has the objects and not
   *  the names, and the first thing it says is "Could not find HEAD".
   *  Everything that navigates away flushes first. */
  flush?(): Promise<void>;
}

export interface PocketFs {
  promises: PocketFsPromises;
}

/** True when a failure is "there is no such path" rather than a real fault.
 *  LightningFS throws an `ENOENT` named error; a shimmed FS may only set
 *  `code`. Both are the same answer and neither is worth a toast. */
export function isMissing(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown; name?: unknown; message?: unknown };
  return e.code === "ENOENT" || e.name === "ENOENT" || String(e.message ?? "").includes("ENOENT");
}

export async function exists(fs: PocketFs, path: string): Promise<boolean> {
  try {
    await fs.promises.stat(path);
    return true;
  } catch (err) {
    if (isMissing(err)) return false;
    throw err;
  }
}

/** `mkdir -p`. LightningFS has no recursive flag, and every write into a note's
 *  folder needs its parents to exist first. */
export async function mkdirp(fs: PocketFs, path: string): Promise<void> {
  const parts = path.split("/").filter(Boolean);
  let at = "";
  for (const part of parts) {
    at += `/${part}`;
    try {
      await fs.promises.mkdir(at);
    } catch (err) {
      if (!(err instanceof Error) || !/EEXIST/.test(String((err as { code?: string }).code ?? err.message))) {
        // A directory that is already there is the goal, not a failure. Any
        // other error is real and belongs to the caller.
        if (!(await exists(fs, at))) throw err;
      }
    }
  }
}

export async function readUtf8(fs: PocketFs, path: string): Promise<string> {
  const data = await fs.promises.readFile(path, { encoding: "utf8" });
  return typeof data === "string" ? data : new TextDecoder().decode(data);
}

export async function readBytes(fs: PocketFs, path: string): Promise<Uint8Array> {
  const data = await fs.promises.readFile(path);
  return typeof data === "string" ? new TextEncoder().encode(data) : data;
}

/** Every file under `dir`, vault-relative, depth first, skipping `.git` and
 *  the other dot-directories the vault contract already hides. */
export async function walk(fs: PocketFs, root: string, skip: (name: string) => boolean): Promise<string[]> {
  const out: string[] = [];
  const queue: string[] = [""];
  while (queue.length > 0) {
    const rel = queue.pop() as string;
    let names: string[];
    try {
      names = await fs.promises.readdir(rel ? `${root}/${rel}` : root);
    } catch (err) {
      if (isMissing(err)) continue;
      throw err;
    }
    for (const name of names) {
      if (skip(name)) continue;
      const childRel = rel ? `${rel}/${name}` : name;
      let stat: PocketStat;
      try {
        stat = await fs.promises.lstat(`${root}/${childRel}`);
      } catch (err) {
        if (isMissing(err)) continue;
        throw err;
      }
      if (stat.isDirectory()) queue.push(childRel);
      else if (stat.isFile()) out.push(childRel);
    }
  }
  return out;
}
