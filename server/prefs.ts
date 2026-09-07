// PREFERENCES THAT TRAVEL WITH THE VAULT.
//
// The client keeps its preferences in localStorage: theme, chrome language,
// editor language, vim, the writing column's width, the formatting toolbar,
// heading numbers, which side the sidebar hangs on. localStorage is per
// browser profile — so the owner's Windows desktop, Linux desktop and phone
// each held their own, and a theme chosen on one never reached the others
// (the owner: "is there a way to sync configs between operating systems? like
// to phone and between windows and linux").
//
// They live here instead, in ONE file inside the vault: `.astrolabe/prefs.json`.
// Inside the vault and not in ASTROLABE_DATA on purpose: every server over this
// folder — the desktop app on each machine, the hosted instance the phone
// opens — reads the same file, and whatever carries the notes between machines
// (Syncthing, git sync, a shared disk) carries the preferences with them, for
// free, with no account anywhere. A dot-directory is never listed, indexed,
// watched or served (server/vault.ts::isIgnoredName), so the file is invisible
// to the tree and to visitors.
//
// The shape is a map of localStorage key → { v, t }: the value and the moment
// it was set. Merging is per key, newest wins, and a removed key is a tombstone
// (`v: null`) so a preference cleared on one device clears on the next rather
// than coming back from it. The client (client/prefsSync.ts) decides WHICH keys
// travel; the server only asks that they wear the product's prefix and stay
// small.

import { Hono } from "hono";
import type { Context } from "hono";
import fs from "node:fs/promises";
import path from "node:path";
import { isPublishLimited } from "./auth.ts";
import { getVaultRoot, VaultError } from "./vault.ts";

export interface PrefEntry {
  v: string | null;
  t: number;
}

export type PrefMap = Record<string, PrefEntry>;

export const PREFS_DIR = ".astrolabe";
export const PREFS_FILE = "prefs.json";
const KEY_PREFIX = "astrolabe.";
const MAX_KEYS = 200;
const MAX_KEY_LENGTH = 120;
const MAX_VALUE_BYTES = 64 * 1024;
const MAX_FILE_BYTES = 512 * 1024;

function prefsPath(): string {
  return path.join(getVaultRoot(), PREFS_DIR, PREFS_FILE);
}

function isEntry(x: unknown): x is PrefEntry {
  if (typeof x !== "object" || x === null) return false;
  const { v, t } = x as Record<string, unknown>;
  const value = v === null || (typeof v === "string" && Buffer.byteLength(v) <= MAX_VALUE_BYTES);
  return value && typeof t === "number" && Number.isFinite(t) && t >= 0;
}

function isKey(k: string): boolean {
  return k.startsWith(KEY_PREFIX) && k.length <= MAX_KEY_LENGTH && /^[\w.:-]+$/.test(k);
}

/** Every well-formed entry of an untrusted map; the rest is dropped, never
 *  fatal — a stray hand edit of the file must not lock every device out. */
export function sanitizePrefs(raw: unknown): PrefMap {
  const out: PrefMap = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const [k, e] of Object.entries(raw as Record<string, unknown>)) {
    if (!isKey(k) || !isEntry(e)) continue;
    out[k] = { v: e.v, t: Math.floor(e.t) };
    if (Object.keys(out).length >= MAX_KEYS) break;
  }
  return out;
}

/** Per key, the newer stamp wins; a tie keeps what the file already holds. */
export function mergePrefs(base: PrefMap, incoming: PrefMap): { merged: PrefMap; changed: boolean } {
  const merged: PrefMap = { ...base };
  let changed = false;
  for (const [k, e] of Object.entries(incoming)) {
    const have = merged[k];
    if (have !== undefined && have.t >= e.t) continue;
    merged[k] = e;
    changed = true;
  }
  return { merged, changed };
}

export async function readPrefs(): Promise<PrefMap> {
  let text: string;
  try {
    text = await fs.readFile(prefsPath(), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
  if (Buffer.byteLength(text) > MAX_FILE_BYTES) return {};
  try {
    return sanitizePrefs((JSON.parse(text) as { keys?: unknown })?.keys);
  } catch {
    return {};
  }
}

/** Written whole and renamed into place, like every other file the server
 *  owns: a sync tool copying a half-written file would carry a broken one. */
export async function writePrefs(map: PrefMap): Promise<void> {
  const file = prefsPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ version: 1, keys: map }, null, 2) + "\n", "utf8");
  await fs.rename(tmp, file);
}

// ---------------------------------------------------------------- routes

export const prefsRoutes = new Hono();

/** Admin-eyes-only, both ways: the preferences are the owner's, and a visitor
 *  (or an admin wearing the preview header) gets 401, never a file. */
function assertAdmin(c: Context): void {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
}

prefsRoutes.get("/", async (c) => {
  assertAdmin(c);
  return c.json({ keys: await readPrefs() });
});

/** Merge a device's changed keys in and answer with the whole map, so one
 *  round trip both pushes and pulls. Mounted below the auth guard, so the
 *  write is already admin-only; the read gate above keeps the answer so. */
prefsRoutes.put("/", async (c) => {
  assertAdmin(c);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new VaultError(400, "Invalid JSON body");
  }
  const incoming = sanitizePrefs((body as { keys?: unknown })?.keys);
  const base = await readPrefs();
  const { merged, changed } = mergePrefs(base, incoming);
  if (changed) await writePrefs(merged);
  return c.json({ keys: merged });
});
