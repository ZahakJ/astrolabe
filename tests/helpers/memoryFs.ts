// An in-memory `fs.promises` for the pocket server's tests.
//
// The pocket vault's filesystem on a phone is IndexedDB through LightningFS
// (mobile/src/pocket/fsFactory.ts), which node:test cannot open and should not
// have to: what is under test is the SERVER, and a server is only interesting
// in what it does with a filesystem, not in which one. So the tests hand it
// this — the same `PocketFs` interface, a Map underneath.
//
// It implements the subset `PocketVaultIO` uses, with the one behaviour the
// code actually branches on: a missing path throws an `ENOENT`-shaped error.

import type { PocketFs, PocketStat } from "../../mobile/src/pocket/fs.ts";

function missing(path: string): Error & { code: string } {
  const err = new Error(`ENOENT: no such file or directory, ${path}`) as Error & { code: string };
  err.code = "ENOENT";
  return err;
}

function statOf(type: "file" | "dir", size: number, mtimeMs: number): PocketStat {
  return {
    type,
    mode: type === "dir" ? 0o040755 : 0o100644,
    size,
    mtimeMs,
    // isomorphic-git normalizes every stat into the index's on-disk shape and
    // reads all of these; an absent `ctimeMs` is a crash inside its
    // working-tree walk rather than a stat with a field missing. LightningFS
    // answers them all, so this does too.
    ctimeMs: mtimeMs,
    ino: 0,
    uid: 0,
    gid: 0,
    dev: 0,
    isFile: () => type === "file",
    isDirectory: () => type === "dir",
    isSymbolicLink: () => false,
  };
}

export interface MemoryFs extends PocketFs {
  /** Every file path currently held, absolute. */
  paths(): string[];
  /** Move the clock the next write stamps files with — the write precondition
   *  is an mtime comparison, and a test that wrote twice in one millisecond
   *  could not tell a stale save from a fresh one. */
  tick(ms?: number): void;
}

export function makeMemoryFs(seed: Record<string, string> = {}, startMs = 1_700_000_000_000): MemoryFs {
  const files = new Map<string, { data: Uint8Array; mtimeMs: number }>();
  const dirs = new Set<string>(["/"]);
  let clock = startMs;

  /** `/a/b/.` and `/a//b/` are `/a/b`. A real filesystem folds these and
   *  isomorphic-git relies on it — its working-tree walk lstats `<dir>/.`
   *  before it reads anything. */
  const normalize = (path: string): string => {
    const parts: string[] = [];
    for (const segment of path.split("/")) {
      if (segment === "" || segment === ".") continue;
      if (segment === "..") parts.pop();
      else parts.push(segment);
    }
    return `/${parts.join("/")}`;
  };

  const ensureParents = (path: string): void => {
    const parts = normalize(path).split("/").slice(1, -1);
    let at = "";
    for (const part of parts) {
      at += `/${part}`;
      dirs.add(at);
    }
  };

  const promises: PocketFs["promises"] = {
    async readFile(path, options) {
      const held = files.get(normalize(path));
      if (!held) throw missing(path);
      const wantsText = typeof options === "string" ? options === "utf8" : options?.encoding === "utf8";
      return wantsText ? new TextDecoder().decode(held.data) : held.data;
    },
    async writeFile(path, data) {
      const key = normalize(path);
      ensureParents(key);
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
      // The clock moves on every write, the way a real one does. The write
      // PRECONDITION is an mtime comparison, so a filesystem that stamped two
      // consecutive writes identically would make a stale save look fresh —
      // which is the one thing these tests are about.
      files.set(key, { data: bytes, mtimeMs: clock });
      clock += 1;
    },
    async unlink(path) {
      if (!files.delete(normalize(path))) throw missing(path);
    },
    async readdir(path) {
      const key = normalize(path);
      const prefix = key === "/" ? "/" : `${key}/`;
      if (!dirs.has(key)) throw missing(path);
      const names = new Set<string>();
      for (const held of [...files.keys(), ...dirs]) {
        if (held === key || !held.startsWith(prefix)) continue;
        const rest = held.slice(prefix.length);
        const name = rest.split("/")[0];
        if (name) names.add(name);
      }
      return [...names].sort();
    },
    async mkdir(path) {
      const key = normalize(path);
      if (dirs.has(key)) {
        const err = new Error(`EEXIST: file already exists, ${path}`) as Error & { code: string };
        err.code = "EEXIST";
        throw err;
      }
      ensureParents(key);
      dirs.add(key);
    },
    async rmdir(path) {
      dirs.delete(normalize(path));
    },
    async stat(path) {
      const key = normalize(path);
      const held = files.get(key);
      if (held) return statOf("file", held.data.byteLength, held.mtimeMs);
      if (dirs.has(key)) return statOf("dir", 0, clock);
      throw missing(path);
    },
    async lstat(path) {
      return promises.stat(path);
    },
    // Present because isomorphic-git BINDS every name in its command list
    // when it wraps a filesystem, and an absent one is a crash before the
    // first read rather than a missing feature. A vault has no symlinks in it
    // — server/vault.ts refuses them outright — so these are the honest
    // answers rather than stubs.
    async readlink(path) {
      throw missing(path);
    },
    async symlink() {
      throw new Error("EPERM: a vault holds no symlinks");
    },
    async rename(from, to) {
      const key = normalize(from);
      const held = files.get(key);
      if (!held) throw missing(from);
      ensureParents(normalize(to));
      files.set(normalize(to), { data: held.data, mtimeMs: clock });
      files.delete(key);
    },
  };

  for (const [path, content] of Object.entries(seed)) {
    ensureParents(normalize(path));
    files.set(normalize(path), { data: new TextEncoder().encode(content), mtimeMs: clock });
  }

  return {
    promises,
    paths: () => [...files.keys()].sort(),
    tick: (ms = 1000) => {
      clock += ms;
    },
  };
}
