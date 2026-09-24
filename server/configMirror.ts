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
// Since 3.16.0 the person's own ledgers travel too: layouts.json (the named
// layouts), books.json (the shelf and where each book was left off) and
// annotations.json (the notes to self on words). They were kept per
// instance as "ledgers", and the owner's test was the opposite: "set things
// up once and transfer all your settings and everything from one device to
// another by just running the executable and giving it the vault". A
// reading position is the reader's, not the machine's.
//
// Since 3.18.0 the UPLOADED FONTS actually travel. `DIRS` said `fonts` from
// the day this file was written, and `fonts/` has held nothing but two
// directories (`catalog/`, `custom/`) since 357202c — so the one directory
// entry matched no file at all, and an uploaded face named by a typography
// slot arrived on the next machine as a raw `custom:…` id rendering in
// Georgia (maturity brief §4.1: "it doesn't upload everything"). Type is the
// most visible part of a look. The entry is `fonts/custom` now, with the
// index that names each face, under two caps so a hand-dropped 80 MB face
// never lands in git history. The catalog is NOT mirrored: it is re-fetchable,
// and the receiving side warms it instead (warmSiteFonts, below).
//
// What does NOT travel, on purpose: git-credentials.json (a token is a
// device's), comments.db (a site's social record), created.json (birth
// times the indexer rebuilds), pdftext.json (a cache), versions/ (note
// history — large, and git sync is the durable copy), session-epoch (a
// session is a server's), fonts/catalog/ (re-fetchable) and the author-sites
// cache (rebuilt anywhere). Since 3.24.0 also ask-credentials.json (the
// Anthropic key is a device's, like the git token) and embeddings.db (the
// meaning index — a cache, re-read on any machine from its own Ollama).
// Since 3.28 also feeds.db (what this server fetched and what its reader
// marked read — a machine's, and never the vault's; kept articles are notes).
// And webmentions.db, activitypub.db and activitypub-key.pem (docs/webmentions.md):
// a site's conversations with other servers, its followers, and the private key
// its fediverse identity signs with — a key in a git history is a key published.

import fs from "node:fs/promises";
import path from "node:path";
import { FONT_UPLOAD_MAX_BYTES } from "../shared/limits.ts";
import type { TravelItem, TravelProblem, TravelStatus } from "../shared/types.ts";
import { isCustomFileName } from "./customFonts.ts";
import { activeDesignFontRefs } from "./designs.ts";
import { catalogSlotIds, designCatalogIds, warmFonts } from "./fonts.ts";
import { PREFS_FILE, readPrefs } from "./prefs.ts";
import { fontSlots } from "./settings.ts";
import { dataDir } from "./site.ts";
import { getVaultRoot } from "./vault.ts";

export const MIRROR_DIR = ".astrolabe";
/** Exported for the test that pins the list: a file dropped from it stops
 *  travelling silently. */
export const FILES = ["settings.json", "designs.json", "custom.css", "layouts.json", "books.json", "annotations.json"];
/** Directories mirrored file by file (flat, no recursion). `fonts/custom` is
 *  every uploaded face plus the `index.json` that names them; `listCustomFonts`
 *  readdirs, so the order the files land in is harmless. Pinned by the tests
 *  like FILES. */
export const DIRS = ["fonts/custom"];
/** Per-file cap for a mirrored directory entry — the same ceiling the upload
 *  route enforces, so a file the panel would have refused is refused here. */
export const FILE_MAX_BYTES = FONT_UPLOAD_MAX_BYTES;
/** Per-directory cap. Eight full faces is a large site; this is what a git
 *  remote is asked to hold, and it is counted with `index.json` first so the
 *  names always travel even when a face does not. */
export const DIR_TOTAL_MAX_BYTES = 40 * 1024 * 1024;
/** The two files that MUST be reconciled from the vault before the receiving
 *  side can draw its type; importing either warms the catalog (below). */
const TYPE_FILES = new Set(["settings.json", "designs.json"]);
/** The ledgers their modules write at 0600 (server/books.ts, layouts.ts,
 *  annotations.ts). A git clone lands them at 0644; the mirror sets the mode
 *  back when the copy comes in from the vault. */
const PRIVATE_FILES = new Set(["layouts.json", "books.json", "annotations.json"]);
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

/** Why a file did not move on a pass. Every one of these is shown in the
 *  travel row (client/components/settings/TravelRow.tsx): a face that stayed
 *  behind silently is exactly the bug this file used to have. `detail` is
 *  the byte count for the two caps and the error's message for a failed copy. */
export type MirrorProblem = TravelProblem;

export interface MirrorPass {
  /** Wall-clock milliseconds when the pass finished. */
  at: number;
  toVault: string[];
  toData: string[];
  problems: MirrorProblem[];
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

/** Which entries of a mirrored directory may move, and which are held back
 *  by a cap. Pure, for the tests. `sizes` is the byte count of the copy that
 *  would move (the larger side, when both exist); the order is the order the
 *  caps are applied in, so `index.json` is counted first and a directory
 *  whose faces overflow still carries the names of the ones that fit. */
export function applyCaps(
  entries: { rel: string; size: number }[],
  fileMax = FILE_MAX_BYTES,
  totalMax = DIR_TOTAL_MAX_BYTES,
): { allowed: string[]; problems: MirrorProblem[] } {
  const allowed: string[] = [];
  const problems: MirrorProblem[] = [];
  let total = 0;
  const ordered = [...entries].sort((a, b) => {
    const ai = path.basename(a.rel) === "index.json" ? 0 : 1;
    const bi = path.basename(b.rel) === "index.json" ? 0 : 1;
    return ai - bi || a.rel.localeCompare(b.rel);
  });
  for (const { rel, size } of ordered) {
    if (size > fileMax) {
      problems.push({ rel, reason: "too-large", detail: String(size) });
      continue;
    }
    if (total + size > totalMax) {
      problems.push({ rel, reason: "over-total", detail: String(size) });
      continue;
    }
    total += size;
    allowed.push(rel);
  }
  return { allowed, problems };
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
 *  a reader never meets a half-written file and the two sides then agree.
 *  `mode`, when given, is set on the landed copy: the data side's ledgers
 *  are private files, whatever mode the vault's copy arrived with. */
async function carry(from: string, to: string, mode?: number): Promise<void> {
  await fs.mkdir(path.dirname(to), { recursive: true });
  const tmp = `${to}.${process.pid}.tmp`;
  await fs.copyFile(from, tmp);
  const st = await fs.stat(from);
  if (mode !== undefined) await fs.chmod(tmp, mode);
  await fs.utimes(tmp, st.atime, st.mtime);
  await fs.rename(tmp, to);
}

/** One file, both ways. Returns what moved and whether the vault holds a copy
 *  afterwards — the second is what "met" means (below). */
async function mirrorOne(rel: string, firstContact: boolean): Promise<{ moved: Side | null; vaultHas: boolean }> {
  const inData = path.join(dataDir(), rel);
  const inVault = path.join(mirrorRoot(), rel);
  const data = await statOrNull(inData);
  const vault = await statOrNull(inVault);
  const source = pickSource(data, vault, firstContact);
  if (source === "data") await carry(inData, inVault);
  else if (source === "vault") await carry(inVault, inData, PRIVATE_FILES.has(rel) ? 0o600 : undefined);
  return { moved: source, vaultHas: vault !== null || source === "data" };
}

// ── Which files this server has met the vault over ──────────────────────
// ASTROLABE_DATA/mirror-state.json: `{ vault, reconciled }` — the vault this
// state is about (its realpath) and the relative paths already reconciled
// with it once. Absent for every file on an instance that predates the
// mirror, which is exactly the first-contact case above. KEYED BY THE VAULT
// because one data directory can be pointed at another folder (the desktop
// app's "Open vault…", an ASTROLABE_VAULT edit), and a set of files met over
// the OLD vault says nothing about the new one: a mismatch resets the set,
// so the new vault wins its first contact too.
//
// A file is only "met" once the vault actually held a copy — its own, or the
// one this side just gave it. A file absent on both sides used to be marked
// met all the same, and when the vault's copy then arrived (a git pull, a
// Syncthing catch-up) the clocks decided, which is the race first contact
// exists to prevent.
const STATE_FILE = "mirror-state.json";
let reconciled: { key: string; set: Set<string> } | null = null;

async function vaultKey(): Promise<string> {
  const root = getVaultRoot();
  try {
    return await fs.realpath(root);
  } catch {
    return path.resolve(root);
  }
}

async function loadReconciled(key: string): Promise<Set<string>> {
  const cacheKey = `${path.resolve(dataDir())}\0${key}`;
  if (reconciled !== null && reconciled.key === cacheKey) return reconciled.set;
  let set = new Set<string>();
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(path.join(dataDir(), STATE_FILE), "utf8"));
    const rec = parsed as { vault?: unknown; reconciled?: unknown } | null;
    const list = rec?.reconciled;
    // A state file from before the vault was recorded (3.16–3.17) is trusted
    // as-is: it was written over the only vault this data directory has had.
    if (rec?.vault === undefined || rec.vault === key) {
      set = new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []);
    }
  } catch {
    // absent or unreadable: nothing met yet
  }
  reconciled = { key: cacheKey, set };
  return set;
}

async function saveReconciled(key: string): Promise<void> {
  if (reconciled === null) return;
  const target = path.join(dataDir(), STATE_FILE);
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(
    tmp,
    JSON.stringify({ vault: key, reconciled: [...reconciled.set].sort() }, null, 2) + "\n",
    "utf8",
  );
  await fs.rename(tmp, target);
}

/** How many files this server has reconciled with its vault at least once. */
export function reconciledCount(): number {
  return reconciled?.set.size ?? 0;
}

async function listFiles(dir: string): Promise<{ name: string; size: number }[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const out: { name: string; size: number }[] = [];
    for (const e of entries) {
      if (!e.isFile() || e.name.endsWith(".tmp") || e.name.startsWith(".")) continue;
      const st = await statOrNull(path.join(dir, e.name));
      if (st) out.push({ name: e.name, size: st.size });
    }
    return out;
  } catch {
    return [];
  }
}

// ── The receiving side's type ────────────────────────────────────────────
// settings.json names catalog families by id and designs.json names the
// active design's faces; neither carries the files, which live under
// fonts/catalog and are fetched on demand. Before 3.18.0 the only thing that
// fetched them was the settings PATCH and the picker — so a fresh clone
// reported `ui: "lora"` and painted zero @font-face until someone opened
// Settings → Site. Now any pass that imports either file warms the same set
// the PATCH would, and so does boot. Fire and forget: a machine without a
// network keeps its stack until it has one, and the pass never waits on it.
type Warmer = (ids: string[]) => Promise<void>;
let warmer: Warmer = warmFonts;

/** Tests swap the downloader for a recorder; `null` restores the real one. */
export function setFontWarmer(fn: Warmer | null): void {
  warmer = fn ?? warmFonts;
}

/** Every catalog id the site needs on disk right now: the four slots plus
 *  the active design's faces (a design may name a family no slot does). */
export function siteCatalogIds(): string[] {
  const slots = fontSlots();
  return [...new Set([...catalogSlotIds(slots), ...designCatalogIds(activeDesignFontRefs(), slots)])];
}

let warming: Promise<void> | null = null;

/** Coalesced: a boot that imports settings.json would otherwise start the
 *  same download twice (the pass and then startConfigMirror), and a reader
 *  pressing Re-sync twice joins the download in flight. */
export function warmSiteFonts(): Promise<void> {
  if (warming !== null) return warming;
  let ids: string[];
  try {
    ids = siteCatalogIds();
  } catch (err) {
    console.warn("astrolabe: could not read the site's typography to warm it:", err instanceof Error ? err.message : err);
    return Promise.resolve();
  }
  if (ids.length === 0) return Promise.resolve();
  warming = warmer(ids).finally(() => {
    warming = null;
  });
  return warming;
}

let last: MirrorPass | null = null;

/** The last pass this server ran, for the travel row. */
export function lastPass(): MirrorPass | null {
  return last;
}

/** One pass over every mirrored file, both ways. Returns what moved and what
 *  could not, for the log line, the travel row and the tests. Never throws:
 *  a mirror that could take the server down over a permissions error on one
 *  file is worse than a stale copy. */
export async function mirrorConfig(): Promise<MirrorPass> {
  const out: MirrorPass = { at: Date.now(), toVault: [], toData: [], problems: [] };
  const root = getVaultRoot();
  if (!root) return out;
  const data = path.resolve(dataDir());
  const mirror = path.resolve(mirrorRoot());
  if (data === mirror) return out;
  const rels = [...FILES];
  for (const dir of DIRS) {
    const sizes = new Map<string, number>();
    for (const side of [path.join(data, dir), path.join(mirror, dir)]) {
      for (const { name, size } of await listFiles(side)) {
        // Forward slashes on every platform: `rel` is written into
        // mirror-state.json and shown in the travel row, and path.join on
        // Windows would spell it with backslashes there.
        const rel = `${dir}/${name}`;
        sizes.set(rel, Math.max(sizes.get(rel) ?? 0, size));
      }
    }
    const { allowed, problems } = applyCaps([...sizes].map(([rel, size]) => ({ rel, size })));
    rels.push(...allowed);
    out.problems.push(...problems);
  }
  const key = await vaultKey();
  const met = await loadReconciled(key);
  let learned = false;
  for (const rel of rels) {
    try {
      const { moved, vaultHas } = await mirrorOne(rel, !met.has(rel));
      if (moved === "data") out.toVault.push(rel);
      else if (moved === "vault") out.toData.push(rel);
      if (vaultHas && !met.has(rel)) {
        met.add(rel);
        learned = true;
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(`astrolabe: could not mirror ${rel}:`, detail);
      out.problems.push({ rel, reason: "copy-failed", detail });
    }
  }
  if (learned) await saveReconciled(key).catch(() => {});
  out.at = Date.now();
  last = out;
  if (out.toData.some((rel) => TYPE_FILES.has(rel))) void warmSiteFonts();
  return out;
}

/** "Re-sync now": one pass, then the warm whether or not anything moved — a
 *  reader who pressed the button after a failed download wants the retry. */
export async function resyncNow(): Promise<MirrorPass> {
  const pass = await mirrorConfig();
  await warmSiteFonts();
  return pass;
}

// ── The reader ───────────────────────────────────────────────────────────
// mirror-state.json was written for two releases and read by nothing; the
// travel row is its reader. Every item is answered by looking at the disk
// NOW, not by trusting the last pass: "in the vault" means a file another
// machine would receive, and that is a stat, not a memory.

const SINGLE_ITEMS: { id: TravelItem["id"]; rel: string }[] = [
  { id: "settings", rel: "settings.json" },
  { id: "designs", rel: "designs.json" },
  { id: "customCss", rel: "custom.css" },
  { id: "layouts", rel: "layouts.json" },
  { id: "books", rel: "books.json" },
  { id: "annotations", rel: "annotations.json" },
];

async function countFaces(dir: string): Promise<number> {
  return (await listFiles(dir)).filter((f) => isCustomFileName(f.name)).length;
}

export async function travelStatus(): Promise<TravelStatus> {
  const data = dataDir();
  const mirror = mirrorRoot();
  const items: TravelItem[] = [];
  for (const { id, rel } of SINGLE_ITEMS) {
    items.push({
      id,
      inData: (await statOrNull(path.join(data, rel))) !== null,
      inVault: (await statOrNull(path.join(mirror, rel))) !== null,
      count: null,
    });
  }
  const facesInData = await countFaces(path.join(data, "fonts", "custom"));
  const facesInVault = await countFaces(path.join(mirror, "fonts", "custom"));
  items.push({ id: "fonts", inData: facesInData > 0, inVault: facesInVault > 0, count: facesInVault });
  let prefKeys = 0;
  try {
    prefKeys = Object.keys(await readPrefs()).length;
  } catch {
    // unreadable: reported as absent
  }
  const prefsThere = (await statOrNull(path.join(mirror, PREFS_FILE))) !== null;
  items.push({ id: "prefs", inData: prefsThere, inVault: prefsThere, count: prefKeys });
  return {
    items,
    lastPass: last
      ? { at: new Date(last.at).toISOString(), toVault: last.toVault, toData: last.toData, problems: last.problems }
      : null,
    reconciled: reconciledCount(),
  };
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/** Boot: one pass now (awaited, so the first request sees the vault's copy),
 *  the catalog warmed once (not awaited: a download is not a boot step), then
 *  a quiet pass every few seconds for as long as the server lives. */
export async function startConfigMirror(): Promise<void> {
  const first = await mirrorConfig();
  if (first.toData.length > 0) console.log(`  settings from the vault: ${first.toData.join(", ")}`);
  for (const p of first.problems) console.warn(`  not mirrored (${p.reason}): ${p.rel} — ${p.detail}`);
  void warmSiteFonts();
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
