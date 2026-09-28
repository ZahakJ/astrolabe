// THE NOTE'S TABS — the notes opened on this device, where the glass is wide
// enough to want more than one (client/shellQuery.ts NOTE_TABS_QUERY: the
// open Fold, a tablet either way up).
//
// A reader on a Fold, 3.39.0: "it doesn't let me have more than one tab: I'm
// in a note, go back to the tree, open a note next to it, and it closes the
// first one immediately." The phone shell holds ONE note in the store (state.ts
// `setPhoneShellMode`: one pane, one tab, never persisted into the vault's
// workspace), and that stays so; the set of notes a reader is keeping open is
// this list instead, beside the store and never in it. Every note screen that
// shows on a wide glass puts its note here (and switches to it); a chip in the
// note screen's strip switches back; × closes one. Back from a note leaves the
// set alone — it is the reader's desk, not the navigation's history.
//
// Kept in localStorage (never in prefsSync's list, so never in the vault), so a
// reload or the app brought back by the OS finds the same notes. Eight at most:
// past that the one touched longest ago goes.

const KEY = "astrolabe.phone-note-tabs";
export const NOTE_TABS_MAX = 8;

interface Entry {
  path: string;
  /** When it was last shown: the order the cap drops in. */
  used: number;
}

const listeners = new Set<() => void>();
let entries: Entry[] = read();
let paths: readonly string[] = entries.map((e) => e.path);
let clock = entries.reduce((m, e) => Math.max(m, e.used), 0);
/** The note on screen last: a new tab stands just after it. */
let current: string | null = null;

function read(): Entry[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: Entry[] = [];
    for (const e of raw) {
      if (typeof e !== "object" || e === null) continue;
      const { path, used } = e as { path?: unknown; used?: unknown };
      if (typeof path !== "string" || path === "" || seen.has(path)) continue;
      seen.add(path);
      out.push({ path, used: typeof used === "number" && Number.isFinite(used) ? used : 0 });
    }
    return out.slice(0, NOTE_TABS_MAX);
  } catch {
    return [];
  }
}

function commit(next: Entry[]): void {
  entries = next;
  paths = next.map((e) => e.path);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* kept for the session */
  }
  for (const l of listeners) l();
}

/** The open notes, in the strip's order. The same array until it changes. */
export function noteTabs(): readonly string[] {
  return paths;
}

export function subscribeNoteTabs(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** A note is on screen: keep it in the set — where it already stands, or
 *  just after the one on screen before it. */
export function showNoteTab(path: string): void {
  const after = current;
  current = path;
  const at = entries.findIndex((e) => e.path === path);
  // Already the latest: nothing to write, nobody to wake.
  if (at >= 0 && entries[at].used === clock) return;
  clock += 1;
  const next = entries.slice();
  if (at >= 0) {
    next[at] = { path, used: clock };
    commit(next);
    return;
  }
  const from = after === null ? -1 : next.findIndex((e) => e.path === after);
  next.splice(from >= 0 ? from + 1 : next.length, 0, { path, used: clock });
  while (next.length > NOTE_TABS_MAX) {
    let drop = -1;
    for (let i = 0; i < next.length; i += 1) {
      if (next[i].path === path) continue;
      if (drop < 0 || next[i].used < next[drop].used) drop = i;
    }
    next.splice(drop, 1);
  }
  commit(next);
}

/** Close one. Answers the note to show in its place — the one after it, or
 *  before it at the end of the strip — or null when it was the last. */
export function closeNoteTab(path: string): string | null {
  const at = entries.findIndex((e) => e.path === path);
  if (at < 0) return null;
  const next = entries.filter((_, i) => i !== at);
  if (current === path) current = null;
  commit(next);
  return next[at]?.path ?? next[at - 1]?.path ?? null;
}

/** A note or a folder was renamed or moved (the store's `lastRemap`): the
 *  tabs follow it. */
export function remapNoteTabs(from: string, to: string): void {
  let changed = false;
  const next = entries.map((e) => {
    const p = e.path === from ? to : e.path.startsWith(`${from}/`) ? to + e.path.slice(from.length) : e.path;
    if (p !== e.path) changed = true;
    return { ...e, path: p };
  });
  if (current !== null && (current === from || current.startsWith(`${from}/`))) current = to + current.slice(from.length);
  if (changed) commit(next.filter((e, i) => next.findIndex((o) => o.path === e.path) === i));
}

/** Drop every tab whose note is gone (deleted, or never there). */
export function pruneNoteTabs(exists: (path: string) => boolean): void {
  const next = entries.filter((e) => exists(e.path));
  if (next.length !== entries.length) commit(next);
}
