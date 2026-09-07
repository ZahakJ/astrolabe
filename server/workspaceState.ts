// THE LAST WORKSPACE, KEPT BESIDE THE VAULT.
//
// The open tabs and the pane layout are localStorage, which is per ORIGIN, and
// the desktop app's origin is `http://127.0.0.1:<port>`. The port is remembered
// per vault, but a launch that finds it busy — a previous instance still
// dying, any other process — moves to the next free one, and the window then
// opens on a fresh origin: no tabs, no layout, and the first note in the tree
// (the owner: "why does the app keep opening on 1t-sram"). So the workspace is
// also written here, ASTROLABE_DATA/workspace.json, on every change, and a
// window that finds nothing in its own storage asks for it. Last writer wins;
// it is a backup of one window's state, not a sync between windows.

import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./site.ts";

const FILE = "workspace.json";
const MAX_BYTES = 256 * 1024;

function file(): string {
  return path.join(dataDir(), FILE);
}

export async function readWorkspaceState(): Promise<unknown | null> {
  try {
    const text = await fs.readFile(file(), "utf8");
    if (Buffer.byteLength(text) > MAX_BYTES) return null;
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/** The client's own serialisation, stored as given: the shape belongs to
 *  client/workspace.ts and `parseWorkspace` there is total, so an old file
 *  under a new client is recovered, never fatal. Only the size is policed. */
export async function writeWorkspaceState(state: unknown): Promise<boolean> {
  if (typeof state !== "object" || state === null) return false;
  const text = JSON.stringify(state);
  if (Buffer.byteLength(text) > MAX_BYTES) return false;
  const target = file();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, text, "utf8");
  await fs.rename(tmp, target);
  return true;
}
