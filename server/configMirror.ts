// INSTANCE SETTINGS TRAVEL WITH THE VAULT.
//
// The instance's own configuration lives in ASTROLABE_DATA — settings.json
// (site name, tagline, logo, language, home note, folders, typography,
// calendars, the git remote), designs.json (the designer's documents and
// custom themes), custom.css, and the custom fonts — and ASTROLABE_DATA is per
// server: the hosted instance has one, the desktop app on each machine has
// its own, and a site name chosen on one never reached the others. The owner:
// "do we save a .astrolabe/configs on the vault folder? we prob should and
// that would be an easy sync across all platforms with all configs and logo
// and name and all that".
//
// So every one of those files is MIRRORED into `<vault>/.astrolabe/`, and
// from there back into the data directory of every other server over the
// same folder. The mirror is a plain rule applied every few seconds and once
// at boot, in both directions: whichever copy is newer wins, byte for byte,
// mtime carried across so the two sides settle and stop copying. A file that
// exists on one side only is copied to the other. There is no merge — two
// machines editing the same setting in the same minute get the later one —
// and there is no network: whatever carries the notes between machines (git
// sync, Syncthing, a shared disk) carries `.astrolabe/` with them, and the
// hosted instance and the desktop app over one folder need nothing at all.
//
// The data directory stays the working copy: settings.ts and designs.ts keep
// reading it (both are mtime-cached, so an imported file is seen on the next
// read), and every write lands there first. `.astrolabe/` is a dot-directory,
// never listed, indexed, watched or served (server/vault.ts).
//
// What does NOT travel, on purpose: git-credentials.json (a token is a
// device's), comments.db (a site's social record), created.json and books.json
// (per-instance ledgers), session-epoch (a session is a server's), and the
// author-sites cache (rebuilt anywhere).

import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./site.ts";
import { getVaultRoot } from "./vault.ts";

export const MIRROR_DIR = ".astrolabe";
const FILES = ["settings.json", "designs.json", "custom.css"];
const DIRS = ["fonts"];
const TICK_MS = 5_000;
/** Two copies whose mtimes differ by less than this are the same write:
 *  `utimes` lands on whole-millisecond boundaries on some filesystems and on
 *  nanoseconds on others, and a mirror that keeps copying a file back and
 *  forth over a rounding error would never settle. */
const SAME_MS = 1_000;

export type Side = "data" | "vault";

interface Copy {
  mtimeMs: number;
  size: number;
}

/** Which side has the copy the other should take, or null when they agree.
 *  Pure, for the tests: `data` and `vault` are the two copies' stats, absent
 *  as null. */
export function pickSource(data: Copy | null, vault: Copy | null): Side | null {
  if (data === null && vault === null) return null;
  if (data === null) return "vault";
  if (vault === null) return "data";
  const gap = data.mtimeMs - vault.mtimeMs;
  if (Math.abs(gap) < SAME_MS) return data.size === vault.size ? null : gap >= 0 ? "data" : "vault";
  return gap > 0 ? "data" : "vault";
}

function mirrorRoot(): string {
  return path.join(getVaultRoot(), MIRROR_DIR);
}

async function statOrNull(file: string): Promise<Copy | null> {
  try {
    const st = await fs.stat(file);
    return st.isFile() ? { mtimeMs: st.mtimeMs, size: st.size } : null;
  } catch {
    return null;
  }
}

/** Copy `from` over `to` through a sibling temp file, carrying the mtime, so
 *  a reader never meets a half-written file and the two sides then agree. */
async function carry(from: string, to: string): Promise<void> {
  await fs.mkdir(path.dirname(to), { recursive: true });
  const tmp = `${to}.${process.pid}.tmp`;
  await fs.copyFile(from, tmp);
  const st = await fs.stat(from);
  await fs.utimes(tmp, st.atime, st.mtime);
  await fs.rename(tmp, to);
}

async function mirrorOne(rel: string): Promise<Side | null> {
  const inData = path.join(dataDir(), rel);
  const inVault = path.join(mirrorRoot(), rel);
  const source = pickSource(await statOrNull(inData), await statOrNull(inVault));
  if (source === "data") await carry(inData, inVault);
  else if (source === "vault") await carry(inVault, inData);
  return source;
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && !e.name.endsWith(".tmp") && !e.name.startsWith(".")).map((e) => e.name);
  } catch {
    return [];
  }
}

/** One pass over every mirrored file, both ways. Returns what moved, for the
 *  log line and the tests. Never throws: a mirror that could take the server
 *  down over a permissions error on one file is worse than a stale copy. */
export async function mirrorConfig(): Promise<{ toVault: string[]; toData: string[] }> {
  const out = { toVault: [] as string[], toData: [] as string[] };
  const root = getVaultRoot();
  if (!root) return out;
  const data = path.resolve(dataDir());
  const mirror = path.resolve(mirrorRoot());
  if (data === mirror) return out;
  const rels = [...FILES];
  for (const dir of DIRS) {
    const names = new Set([...(await listFiles(path.join(data, dir))), ...(await listFiles(path.join(mirror, dir)))]);
    for (const name of names) rels.push(path.join(dir, name));
  }
  for (const rel of rels) {
    try {
      const moved = await mirrorOne(rel);
      if (moved === "data") out.toVault.push(rel);
      else if (moved === "vault") out.toData.push(rel);
    } catch (err) {
      console.warn(`astrolabe: could not mirror ${rel}:`, err instanceof Error ? err.message : err);
    }
  }
  return out;
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/** Boot: one pass now (awaited, so the first request sees the vault's copy),
 *  then a quiet pass every few seconds for as long as the server lives. */
export async function startConfigMirror(): Promise<void> {
  const first = await mirrorConfig();
  if (first.toData.length > 0) console.log(`  settings from the vault: ${first.toData.join(", ")}`);
  if (timer !== null) return;
  timer = setInterval(() => {
    if (running) return;
    running = true;
    void mirrorConfig().finally(() => {
      running = false;
    });
  }, TICK_MS);
  timer.unref?.();
}
