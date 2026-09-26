// A PYTHON FOR A MACHINE THAT HAS NONE (docs/read-aloud.md, "Installing").
//
// Read aloud's engines are Python packages, and the Install button used to
// need one of two things already on the machine: `uv`, or a Python 3.10–3.13.
// A reader who installed the desktop app on Windows or Linux had neither —
// the app is one download, and nothing about it said "and now install a
// programming language" — so Install stopped at "This machine needs uv or
// Python" and the app never read (a real report: "tried on Linux,
// unfortunately it does not read").
//
// So when neither is found, the installer fetches one: the "install-only"
// CPython build from python-build-standalone (the relocatable Pythons `uv`
// itself installs), stripped, 21–34 MB, for this platform and processor. It
// lands in ASTROLABE_DATA/tts/python/ — the data folder, beside the venv made
// from it, never the vault and never the app's own directory (which an update
// replaces) — and is checked before it is trusted: its exact size and its
// SHA-256, pinned below. Unpacked here in Node (no `tar` on the PATH is
// assumed; Windows before 1803 and a stripped container have none), and run
// by its full path, so nothing depends on `where` or `which` finding it.
//
// The table is pinned to one release. Bumping it is: pick the release's
// `cpython-3.12.*-<triple>-install_only_stripped.tar.gz` assets, copy their
// sizes and digests (the release lists both), run tests/standalonePython.test.ts.

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, promises as fsp } from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

export const PYTHON_RELEASE = "20260924";
const PYTHON_VERSION = "3.12.14";
const HOST = `https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_RELEASE}`;

export interface PythonBuild {
  /** The asset's file name. */
  file: string;
  url: string;
  bytes: number;
  sha256: string;
}

function build(triple: string, bytes: number, sha256: string): PythonBuild {
  const file = `cpython-${PYTHON_VERSION}+${PYTHON_RELEASE}-${triple}-install_only_stripped.tar.gz`;
  return { file, url: `${HOST}/${encodeURIComponent(file)}`, bytes, sha256 };
}

/** Keyed `${process.platform}-${process.arch}`. Linux is the glibc build
 *  (musl systems — Alpine — are not offered one and are told to bring a
 *  Python). */
export const PYTHON_BUILDS: Readonly<Record<string, PythonBuild>> = {
  "linux-x64": build("x86_64-unknown-linux-gnu", 34_270_188, "269b2c99e4db15b242bf01832f4fea1e8f1a664f273cff519393f296e9820b41"),
  "linux-arm64": build("aarch64-unknown-linux-gnu", 29_199_580, "c8499b61252c433280f134df954464d19811527b31cb920c35fc6967c1222e35"),
  "win32-x64": build("x86_64-pc-windows-msvc", 22_052_624, "c5bf8edfe858c1df9891be498b5bbc8761d383df5b9790658b088fea4870433a"),
  "win32-arm64": build("aarch64-pc-windows-msvc", 21_085_875, "1d07bd9c97e6e1942b290bd2daa22d5a41e1e5acd2fd3d4c696892ceffe47144"),
  "darwin-x64": build("x86_64-apple-darwin", 24_719_239, "7ea9761b9069c10b9a20531d568645849d604c59e9c7f11f6659f1e1790c968e"),
  "darwin-arm64": build("aarch64-apple-darwin", 25_017_789, "c2edb321cd32ec2b170df208db0446dccc4398db602ca27cf2079098fb1f7d9d"),
};

export function pythonBuildFor(platform: NodeJS.Platform, arch: string): PythonBuild | null {
  return PYTHON_BUILDS[`${platform}-${arch}`] ?? null;
}

/** The path module for `platform`: this machine's own when it is this
 *  machine, the platform's flavour when the tests describe another. */
function pathsFor(platform: NodeJS.Platform): path.PlatformPath {
  if (platform === process.platform) return path;
  return platform === "win32" ? path.win32 : path.posix;
}

/** The interpreter inside an unpacked install-only build. */
export function standalonePythonExe(root: string, platform: NodeJS.Platform = process.platform): string {
  const p = pathsFor(platform);
  return platform === "win32" ? p.join(root, "python.exe") : p.join(root, "bin", "python3");
}

/** The venv's interpreter: `Scripts\python.exe` on Windows, `bin/python`
 *  elsewhere — whichever Python the venv was made from. */
export function venvPythonIn(venv: string, platform: NodeJS.Platform = process.platform): string {
  const p = pathsFor(platform);
  return platform === "win32" ? p.join(venv, "Scripts", "python.exe") : p.join(venv, "bin", "python");
}

/** A program on the PATH, found the way the shell would — WITHOUT spawning
 *  `which` or `where` (a stripped Windows, or a PATH that lost System32,
 *  has no `where`; and a spawn per lookup is a spawn too many). On Windows
 *  the PATHEXT extensions are tried and the lookup is case-blind. */
export function findOnPath(
  name: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  isFile: (p: string) => boolean,
): string | null {
  const win = platform === "win32";
  const p = win ? path.win32 : path.posix;
  const rawPath = win ? (env.PATH ?? env.Path ?? env.path ?? "") : (env.PATH ?? "");
  const dirs = rawPath.split(win ? ";" : ":").filter((d) => d.trim() !== "");
  const exts = win
    ? p.extname(name) !== ""
      ? [""]
      : (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean).map((e) => e.toLowerCase())
    : [""];
  for (const dir of dirs) {
    const clean = win ? dir.replace(/^"(.*)"$/, "$1") : dir;
    for (const ext of exts) {
      const candidate = p.join(clean, name + ext);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

// ── Unpacking ──────────────────────────────────────────────────────────────

/** A path inside the archive that stays inside `dest`, or null. */
function safeJoin(dest: string, name: string): string | null {
  const rel = name.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (rel === "" || rel.startsWith("/") || /^[A-Za-z]:/.test(rel)) return null;
  const out = path.resolve(dest, rel);
  const root = path.resolve(dest);
  return out === root || out.startsWith(root + path.sep) ? out : null;
}

function field(block: Buffer, from: number, len: number): string {
  const raw = block.subarray(from, from + len);
  const nul = raw.indexOf(0);
  return raw.subarray(0, nul < 0 ? raw.length : nul).toString("utf8");
}

function octal(block: Buffer, from: number, len: number): number {
  // GNU base-256 for large sizes: the high bit of the first byte.
  if (block[from] & 0x80) {
    let n = 0;
    for (let i = from + 1; i < from + len; i++) n = n * 256 + block[i];
    return n;
  }
  const s = field(block, from, len).trim();
  return s === "" ? 0 : parseInt(s, 8);
}

function paxRecords(data: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let at = 0;
  while (at < data.length) {
    const space = data.indexOf(0x20, at);
    if (space < 0) break;
    const len = parseInt(data.subarray(at, space).toString("utf8"), 10);
    if (!Number.isFinite(len) || len <= 0) break;
    const rec = data.subarray(space + 1, at + len - 1).toString("utf8");
    const eq = rec.indexOf("=");
    if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1);
    at += len;
  }
  return out;
}

/** Unpack a .tar.gz into `dest`: files, directories, symlinks and hard
 *  links, with ustar, GNU long names and pax headers — what
 *  python-build-standalone's archives use. An entry that would land outside
 *  `dest` is refused, not skipped: an archive that tries is not one to run. */
export async function extractTarGz(file: string, dest: string, platform: NodeJS.Platform = process.platform): Promise<void> {
  await fsp.mkdir(dest, { recursive: true });
  let buf: Buffer = Buffer.alloc(0);
  let longName: string | null = null;
  let longLink: string | null = null;
  let pax: Record<string, string> = {};
  const links: { at: string; target: string; hard: boolean }[] = [];
  let pending: { remaining: number; pad: number; sink: ((chunk: Buffer) => void) | null; done: () => Promise<void> } | null = null;
  let ended = false;

  const take = async (): Promise<void> => {
    for (;;) {
      if (pending) {
        if (pending.remaining > 0) {
          if (buf.length === 0) return;
          const n = Math.min(pending.remaining, buf.length);
          pending.sink?.(buf.subarray(0, n));
          buf = buf.subarray(n);
          pending.remaining -= n;
          if (pending.remaining > 0) return;
        }
        if (buf.length < pending.pad) return;
        buf = buf.subarray(pending.pad);
        const finish = pending.done;
        pending = null;
        await finish();
        continue;
      }
      if (ended || buf.length < 512) return;
      const block = buf.subarray(0, 512);
      buf = buf.subarray(512);
      if (block.every((b) => b === 0)) {
        ended = true;
        return;
      }
      const type = String.fromCharCode(block[156] || 0x30);
      const size = octal(block, 124, 12);
      const pad = (512 - (size % 512)) % 512;
      const prefix = field(block, 345, 155);
      const baseName = field(block, 0, 100);
      const name = pax.path ?? longName ?? (prefix ? `${prefix}/${baseName}` : baseName);
      const linkName = pax.linkpath ?? longLink ?? field(block, 157, 100);
      const mode = octal(block, 100, 8);
      if (type === "L" || type === "K" || type === "x" || type === "g") {
        const parts: Buffer[] = [];
        pending = {
          remaining: size,
          pad,
          sink: (c) => parts.push(Buffer.from(c)),
          done: async () => {
            const data = Buffer.concat(parts);
            if (type === "L") longName = field(data, 0, data.length);
            else if (type === "K") longLink = field(data, 0, data.length);
            else if (type === "x") pax = paxRecords(data);
          },
        };
        continue;
      }
      longName = null;
      longLink = null;
      pax = {};
      const out = safeJoin(dest, name);
      if (out === null) throw new Error(`the archive names a path outside its folder: ${name}`);
      if (type === "5") {
        await fsp.mkdir(out, { recursive: true });
        pending = { remaining: size, pad, sink: null, done: async () => {} };
        continue;
      }
      if (type === "2" || type === "1") {
        links.push({ at: out, target: linkName, hard: type === "1" });
        pending = { remaining: size, pad, sink: null, done: async () => {} };
        continue;
      }
      if (type !== "0" && type !== "7") {
        // Devices, FIFOs: nothing a Python needs.
        pending = { remaining: size, pad, sink: null, done: async () => {} };
        continue;
      }
      await fsp.mkdir(path.dirname(out), { recursive: true });
      const chunks: Buffer[] = [];
      pending = {
        remaining: size,
        pad,
        sink: (c) => chunks.push(Buffer.from(c)),
        done: async () => {
          await fsp.writeFile(out, Buffer.concat(chunks), { mode: platform === "win32" ? undefined : mode & 0o777 || 0o644 });
        },
      };
    }
  };

  const gunzip = createGunzip();
  const input = createReadStream(file).pipe(gunzip);
  for await (const chunk of input as AsyncIterable<Buffer>) {
    buf = buf.length === 0 ? chunk : Buffer.concat([buf, chunk]);
    await take();
  }
  await take();
  for (const link of links) {
    await fsp.mkdir(path.dirname(link.at), { recursive: true });
    await fsp.rm(link.at, { force: true });
    if (link.hard) {
      const from = safeJoin(dest, link.target);
      if (from === null) throw new Error(`the archive links outside its folder: ${link.target}`);
      await fsp.copyFile(from, link.at);
    } else {
      // A symlink must resolve inside the folder too.
      const from = path.resolve(path.dirname(link.at), link.target);
      const root = path.resolve(dest);
      if (path.isAbsolute(link.target) || !(from === root || from.startsWith(root + path.sep))) {
        throw new Error(`the archive links outside its folder: ${link.target}`);
      }
      if (platform === "win32") {
        // No symlinks without Developer Mode: the file itself, copied.
        if (existsSync(from)) await fsp.copyFile(from, link.at);
      } else {
        await fsp.symlink(link.target, link.at);
      }
    }
  }
}

// ── Fetching ───────────────────────────────────────────────────────────────

export class PythonFetchError extends Error {}

/** Download, check and unpack the standalone Python into `root` (which ends
 *  up holding `bin/python3` or `python.exe`). `onProgress` hears 0–100.
 *  Answers the interpreter's path. A second call with the interpreter in
 *  place does nothing. */
export async function fetchStandalonePython(
  root: string,
  onProgress: (pct: number) => void,
  opts: { platform?: NodeJS.Platform; arch?: string; fetcher?: typeof fetch; spec?: PythonBuild } = {},
): Promise<string> {
  const platform = opts.platform ?? process.platform;
  const arch = opts.arch ?? process.arch;
  const exe = standalonePythonExe(root, platform);
  // Checked with this machine's separators: the same layout, wherever the
  // archive was meant to run (the Windows build is unpacked on Linux by the
  // verification scripts).
  const onDisk = path.join(root, ...(platform === "win32" ? ["python.exe"] : ["bin", "python3"]));
  if (existsSync(onDisk)) return exe;
  const spec = opts.spec ?? pythonBuildFor(platform, arch);
  if (!spec) throw new PythonFetchError(`No standalone Python is offered for ${platform}-${arch}`);
  const parent = path.dirname(root);
  await fsp.mkdir(parent, { recursive: true });
  const tarball = path.join(parent, `${spec.file}.part`);
  const staging = `${root}.part`;
  await fsp.rm(staging, { recursive: true, force: true });
  let res: Response;
  try {
    res = await (opts.fetcher ?? fetch)(spec.url, { redirect: "follow" });
  } catch (err) {
    throw new PythonFetchError(`Could not reach github.com for Python: ${String((err as Error).message ?? err)}`);
  }
  if (!res.ok || !res.body) throw new PythonFetchError(`github.com answered ${res.status} for Python`);
  const hash = createHash("sha256");
  let got = 0;
  let said = -1;
  const count = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      got += chunk.length;
      hash.update(chunk);
      const pct = Math.min(100, Math.floor((got / spec.bytes) * 100));
      if (pct !== said) {
        said = pct;
        onProgress(pct);
      }
      cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), count, createWriteStream(tarball));
    if (got !== spec.bytes) throw new PythonFetchError(`Python arrived at ${got} bytes, not ${spec.bytes}`);
    const digest = hash.digest("hex");
    if (digest !== spec.sha256) throw new PythonFetchError(`Python's checksum is ${digest.slice(0, 12)}…, not the pinned ${spec.sha256.slice(0, 12)}…`);
    await extractTarGz(tarball, staging, platform);
    // The archive's one top folder is `python/`.
    const inner = path.join(staging, "python");
    await fsp.rm(root, { recursive: true, force: true });
    await fsp.rename(existsSync(inner) ? inner : staging, root);
    if (!existsSync(onDisk)) throw new PythonFetchError("The Python archive held no interpreter where one was expected");
    return exe;
  } finally {
    await fsp.rm(tarball, { force: true });
    await fsp.rm(staging, { recursive: true, force: true });
  }
}
