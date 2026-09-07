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
 *  as null.
 *
 *  FIRST CONTACT IS NOT A RACE. `firstContact` is true the first time this
 *  server compares a file against the vault's copy, and then THE VAULT WINS
 *  whenever it holds one, whatever the clocks say. The vault is the source
 *  of truth the owner asked for; a data directory that has never met it is
 *  a machine's private defaults, and its mtime says nothing about which is
 *  right. This rule was written after the alternative happened: a desktop
 *  whose settings.json was 31 bytes and a day younger than the site's met
 *  the vault, "won" on mtime, and within five seconds the hosted instance
 *  had imported the 31 bytes over its own configuration. */
export function pickSource(data: Copy | null, vault: Copy | null, firstContact = false): Side | null {
  if (data === null && vault === null) return null;
  if (data === null) return "vault";
  if (vault === null) return "data";
  if (firstContact) return "vault";
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

async function mirrorOne(rel: string, firstContact: boolean): Promise<Side | null> {
  const inData = path.join(dataDir(), rel);
  const inVault = path.join(mirrorRoot(), rel);
  const source = pickSource(await statOrNull(inData), await statOrNull(inVault), firstContact);
  if (source === "data") await carry(inData, inVault);
  else if (source === "vault") await carry(inVault, inData);
  return source;
}

// ── Which files this server has met the vault over ──────────────────────
// ASTROLABE_DATA/mirror-state.json: the relative paths already reconciled once.
// Absent for every file on an instance that predates the mirror, which is
// exactly the first-contact case above.
const STATE_FILE = "mirror-state.json";
let reconciled: Set<string> | null = null;

async function loadReconciled(): Promise<Set<string>> {
  if (reconciled !== null) return reconciled;
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(path.join(dataDir(), STATE_FILE), "utf8"));
    const list = (parsed as { reconciled?: unknown })?.reconciled;
    reconciled = new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []);
  } catch {
    reconciled = new Set();
  }
  return reconciled;
}

async function saveReconciled(): Promise<void> {
  if (reconciled === null) return;
  const target = path.join(dataDir(), STATE_FILE);
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify({ reconciled: [...reconciled].sort() }, null, 2) + "\n", "utf8");
  await fs.rename(tmp, target);
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
  const met = await loadReconciled();
  let learned = false;
  for (const rel of rels) {
    try {
      const moved = await mirrorOne(rel, !met.has(rel));
      if (moved === "data") out.toVault.push(rel);
      else if (moved === "vault") out.toData.push(rel);
      if (!met.has(rel)) {
        met.add(rel);
        learned = true;
      }
    } catch (err) {
      console.warn(`astrolabe: could not mirror ${rel}:`, err instanceof Error ? err.message : err);
    }
  }
  if (learned) await saveReconciled().catch(() => {});
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
