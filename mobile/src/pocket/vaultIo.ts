/**
 * THE WORKING TREE, AS THE POCKET SERVER SEES IT.
 *
 * `PocketVaultIO` in vault-relative paths over a `PocketFs` rooted at the
 * clone. Two things it owns that the server does not have to think about:
 *
 *   - PATH SAFETY. Every path arriving here came out of a URL or a request
 *     body. `..`, an absolute path, a NUL byte and `.git/` are refused here,
 *     once, rather than at seventy call sites — the same boundary
 *     server/vault.ts draws with `safeAbs`.
 *   - `mtimeMs`. It is the write precondition the whole two-writer contract
 *     rests on, so it is read back from the filesystem after every write
 *     rather than guessed from the clock.
 */

import { exists, isMissing, mkdirp, readBytes, readUtf8, walk, type PocketFs } from "./fs.ts";
import type { PocketFile, PocketVaultIO } from "./server.ts";

/** Directories the vault does not contain, whatever the filesystem says.
 *  `.git` is the repository, `.obsidian` is another app's settings, `.trash`
 *  is this device's undo drawer and `.astrolabe` is the settings that travel
 *  WITH the vault (server/configMirror.ts, and the pocket's own
 *  `PATCH /api/settings`) — the tree shows none of them. The instance draws
 *  exactly this line: `.astrolabe/` is "never listed, indexed, watched or
 *  served", and a settings file appearing as an attachment in somebody's
 *  sidebar would be the phone disagreeing with the laptop about what a vault
 *  contains. */
const HIDDEN = new Set([".git", ".obsidian", ".trash", ".astrolabe"]);

export class PocketVaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PocketVaultError";
  }
}

/** A path from a request → a path inside the clone, or a refusal. The rules
 *  are server/vault.ts's, kept deliberately boring. */
export function safeVaultPath(raw: string): string {
  const path = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!path) throw new PocketVaultError("A path is required");
  if (path.includes("\u0000")) throw new PocketVaultError("That path is not a path");
  for (const segment of path.split("/")) {
    if (segment === "" || segment === "." || segment === "..") {
      throw new PocketVaultError(`That path leaves the vault: ${raw}`);
    }
  }
  if (path === ".git" || path.startsWith(".git/")) {
    throw new PocketVaultError("The repository is not part of the vault");
  }
  return path;
}

export function createVaultIo(fs: PocketFs, root: string): PocketVaultIO {
  const abs = (path: string): string => `${root}/${safeVaultPath(path)}`;

  async function statOf(path: string): Promise<PocketFile | null> {
    try {
      const stat = await fs.promises.stat(abs(path));
      if (!stat.isFile()) return null;
      return { path, size: stat.size, mtimeMs: stat.mtimeMs };
    } catch (err) {
      if (isMissing(err)) return null;
      throw err;
    }
  }

  async function write(path: string, data: string | Uint8Array): Promise<number> {
    const target = abs(path);
    const slash = target.lastIndexOf("/");
    if (slash > root.length) await mkdirp(fs, target.slice(0, slash));
    if (typeof data === "string") await fs.promises.writeFile(target, data, { encoding: "utf8" });
    else await fs.promises.writeFile(target, data);
    const stat = await fs.promises.stat(target);
    return stat.mtimeMs;
  }

  return {
    async list(): Promise<PocketFile[]> {
      // `.trash` IS listed: the trash route reads it. `.git` and `.obsidian`
      // are not part of the vault at any depth.
      const paths = await walk(fs, root, (name) => name === ".git" || name === ".obsidian");
      const out: PocketFile[] = [];
      for (const path of paths) {
        const stat = await fs.promises.stat(`${root}/${path}`);
        out.push({ path, size: stat.size, mtimeMs: stat.mtimeMs });
      }
      return out;
    },

    async readText(path: string): Promise<string | null> {
      try {
        return await readUtf8(fs, abs(path));
      } catch (err) {
        if (isMissing(err)) return null;
        throw err;
      }
    },

    async readBytes(path: string): Promise<Uint8Array | null> {
      try {
        return await readBytes(fs, abs(path));
      } catch (err) {
        if (isMissing(err)) return null;
        throw err;
      }
    },

    writeText: (path, content) => write(path, content),
    writeBytes: (path, content) => write(path, content),

    async remove(path: string): Promise<void> {
      try {
        await fs.promises.unlink(abs(path));
      } catch (err) {
        if (!isMissing(err)) throw err;
      }
    },

    async rename(from: string, to: string): Promise<void> {
      const target = abs(to);
      const slash = target.lastIndexOf("/");
      if (slash > root.length) await mkdirp(fs, target.slice(0, slash));
      await fs.promises.rename(abs(from), target);
    },

    async makeFolder(path: string): Promise<void> {
      await mkdirp(fs, abs(path));
    },

    stat: statOf,
  };
}

/** Is this vault path one the tree and the index should ignore? */
export function isHiddenPath(path: string): boolean {
  const first = path.split("/")[0] ?? "";
  return HIDDEN.has(first);
}

export { exists };
