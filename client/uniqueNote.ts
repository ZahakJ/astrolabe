// THE UNIQUE NOTE: a note named after the minute it was made, and nothing
// asked. Zettelkasten's stamp (`202609151042`), Obsidian's "Unique note
// creator" — the door for the idea that has no title yet and must not wait
// for one. Where it lands and what it is called are Settings → Vault, under
// the periodic rows (shared/periodic.ts formats it: the daily tokens plus
// HH, mm, ss); the default is the vault root and `YYYYMMDDHHmm`.
//
// Two ideas in one minute do happen, and the second must not fail with
// "exists": the name takes a ` 2`, ` 3`… suffix, checked against the tree the
// client already holds. The store's createNote does the rest — the default
// template, the tree reload, the open — so this note is born exactly the way
// a Ctrl/Cmd N note is, minus the question.

import { collectNotes } from "./editor/links.ts";
import { freePath, periodicPath, UNIQUE_FORMAT_DEFAULT } from "../shared/periodic.ts";
import { useStore } from "./state.ts";
import { templateSettings } from "./templates.ts";

interface Unique {
  folder: string;
  format: string;
}

let cached: Unique = { folder: "", format: UNIQUE_FORMAT_DEFAULT };

/** Prime the cache from the instance's settings; safe to call often. The
 *  palette's hint reads the cache synchronously (the defaults until the
 *  first fetch lands), which every door through here primes first. */
export async function loadUnique(): Promise<Unique> {
  try {
    const s = await templateSettings();
    cached = { folder: s.uniqueFolder, format: s.uniqueFormat || UNIQUE_FORMAT_DEFAULT };
  } catch {
    // settings unreachable: the defaults stand
  }
  return cached;
}

/** The path a unique note made at `now` would take. */
export function uniqueNotePath(now = new Date()): string {
  return periodicPath(cached.folder, cached.format, now);
}

/** Make the note and open it. Admin only, like every creation. */
export async function createUniqueNote(): Promise<void> {
  const store = useStore.getState();
  if (!store.admin) return;
  await loadUnique();
  const taken = new Set(collectNotes(useStore.getState().tree).map((n) => n.path));
  const path = freePath(uniqueNotePath(), taken);
  await useStore.getState().createNote(path);
}
