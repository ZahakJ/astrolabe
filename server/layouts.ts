// NAMED LAYOUTS — "Research", "Writing": a workspace arrangement saved under
// a name and restored later, beside the vault so the desktop app and a
// browser share them (server/workspaceState.ts keeps the LAST workspace on
// the same terms). A layout is paths and split geometry, never content: it
// is the same shape the store serialises (client/workspace.ts
// serializeWorkspace), validated on the way back in by parseWorkspace.
//
// One JSON file, ASTROLABE_DATA/layouts.json, the books store's discipline:
// a version, a read that never throws, an atomic write at 0o600, named caps.

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "./site.ts";

interface StoreFile {
  version: 1;
  layouts: Record<string, { at: number; workspace: unknown }>;
}

export const LAYOUTS_MAX = 40;
export const LAYOUT_MAX_BYTES = 256 * 1024;
export const LAYOUT_NAME_MAX = 60;

function file(): string {
  return path.join(dataDir(), "layouts.json");
}

function empty(): StoreFile {
  return { version: 1, layouts: {} };
}

export function readLayouts(): StoreFile {
  try {
    if (!existsSync(file())) return empty();
    const parsed: unknown = JSON.parse(readFileSync(file(), "utf8"));
    if (typeof parsed !== "object" || parsed === null || (parsed as StoreFile).version !== 1) return empty();
    const raw = (parsed as StoreFile).layouts;
    const layouts: StoreFile["layouts"] = {};
    if (typeof raw === "object" && raw !== null) {
      for (const [name, entry] of Object.entries(raw)) {
        if (typeof entry !== "object" || entry === null) continue;
        const e = entry as { at?: unknown; workspace?: unknown };
        if (typeof e.workspace !== "object" || e.workspace === null) continue;
        const clean = cleanName(name);
        if (clean === null) continue;
        layouts[clean] = { at: typeof e.at === "number" ? e.at : 0, workspace: e.workspace };
      }
    }
    return { version: 1, layouts };
  } catch (err) {
    console.warn("astrolabe: layouts.json unreadable, starting empty", err);
    return empty();
  }
}

function persist(store: StoreFile): void {
  const target = file();
  mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, target);
  chmodSync(target, 0o600);
}

/** A layout name: trimmed, one line, no control characters, capped. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\p{Cc}+/gu, " ").trim();
  if (name === "" || name.length > LAYOUT_NAME_MAX) return null;
  return name;
}

export function listLayouts(): { name: string; at: number }[] {
  return Object.entries(readLayouts().layouts)
    .map(([name, e]) => ({ name, at: e.at }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getLayout(name: string): unknown | null {
  return readLayouts().layouts[name]?.workspace ?? null;
}

/** Save (or replace) a layout. False when the workspace is not an object,
 *  too large, or the store is full of OTHER names. */
export function putLayout(name: string, workspace: unknown): boolean {
  if (typeof workspace !== "object" || workspace === null) return false;
  if (Buffer.byteLength(JSON.stringify(workspace)) > LAYOUT_MAX_BYTES) return false;
  const store = readLayouts();
  if (!(name in store.layouts) && Object.keys(store.layouts).length >= LAYOUTS_MAX) return false;
  store.layouts[name] = { at: Date.now(), workspace };
  persist(store);
  return true;
}

export function deleteLayout(name: string): boolean {
  const store = readLayouts();
  if (!(name in store.layouts)) return false;
  delete store.layouts[name];
  persist(store);
  return true;
}
