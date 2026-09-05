// The shelf, once per session, and where a reader is on each path.
//
// ONE FETCH, SHARED: the shelf page, a path page, a lesson page and the home
// band all read the same array, and a second subscriber mounting mid-fetch
// joins the promise rather than starting another (the graphCache rule). The
// cache is keyed on the session's scope (admin, preview) because the server
// answers each scope with a different shelf. Vault events mark it stale.
//
// PROGRESS IS THE READER'S, per browser. A lesson a reader opened is marked
// read under `vellum.library` — never sent to the server, never shown to
// anybody else. It is what lets a path page say "continue" and a shelf card
// say "3 of 24", and it is exactly as private as a bookmark.

import { useEffect, useState } from "react";
import type { LibraryLesson, LibraryPath } from "../../shared/types.ts";
import { getLibrary } from "../api.ts";
import { useStore } from "../state.ts";

type Listener = () => void;
const listeners = new Set<Listener>();
let cacheKey: string | null = null;
let shelf: LibraryPath[] | null = null;
let inflight: Promise<LibraryPath[]> | null = null;
let revision = 0;

function scopeKey(): string {
  const s = useStore.getState();
  return `${s.admin ? "a" : "v"}|${s.previewVisitor ? "p" : "-"}|${s.language}`;
}

function emit(): void {
  revision += 1;
  for (const cb of listeners) cb();
}

function load(): Promise<LibraryPath[]> {
  const key = scopeKey();
  if (shelf !== null && cacheKey === key) return Promise.resolve(shelf);
  if (inflight && cacheKey === key) return inflight;
  cacheKey = key;
  inflight = getLibrary()
    .then((paths) => {
      if (cacheKey !== key) return paths;
      shelf = paths;
      inflight = null;
      emit();
      return paths;
    })
    .catch((err: unknown) => {
      if (cacheKey === key) inflight = null;
      throw err;
    });
  return inflight;
}

/** Drop the shelf so the next reader refetches — the vault changed, or the
 *  owner saved the settings that declare it. */
export function invalidateLibrary(): void {
  shelf = null;
  inflight = null;
  cacheKey = null;
  emit();
}

/** The shelf, or null while it loads (and after a failure, which the pages
 *  render as an empty shelf: a library that cannot be fetched is a library
 *  with nothing on it, not an error page). */
export function useLibrary(): LibraryPath[] | null {
  const [, setTick] = useState(0);
  const admin = useStore((s) => s.admin);
  const preview = useStore((s) => s.previewVisitor);
  const language = useStore((s) => s.language);
  useEffect(() => {
    const cb = () => setTick((n) => n + 1);
    listeners.add(cb);
    void load().catch(() => {
      shelf = [];
      emit();
    });
    return () => {
      listeners.delete(cb);
    };
  }, [admin, preview, language]);
  return cacheKey === scopeKey() ? shelf : null;
}

/** A path's lessons in reading order, each with its unit — the flat list the
 *  lesson page walks and the URLs count in. */
export interface LessonStep {
  n: number;
  unit: LibraryPath["units"][number];
  lesson: LibraryLesson;
}

export function stepsOf(path: LibraryPath): LessonStep[] {
  const out: LessonStep[] = [];
  let n = 0;
  for (const unit of path.units) for (const lesson of unit.lessons) out.push({ n: ++n, unit, lesson });
  return out;
}

// ── Progress ────────────────────────────────────────────────────────────────

const PROGRESS_KEY = "vellum.library";

interface Progress {
  /** slug → note paths read. Paths rather than numbers, so a unit added in
   *  the middle does not shift what counts as read. */
  read: Record<string, string[]>;
  /** slug → the note path last opened, for "continue". */
  last: Record<string, string>;
}

function readProgress(): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Progress>) : null;
    return {
      read: parsed && typeof parsed.read === "object" && parsed.read ? parsed.read : {},
      last: parsed && typeof parsed.last === "object" && parsed.last ? parsed.last : {},
    };
  } catch {
    return { read: {}, last: {} };
  }
}

function writeProgress(p: Progress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    // no storage: the reader's place lasts the session
  }
}

const progressListeners = new Set<Listener>();

export function markRead(slug: string, notePath: string): void {
  const p = readProgress();
  const list = p.read[slug] ?? [];
  if (!list.includes(notePath)) p.read[slug] = [...list, notePath];
  p.last[slug] = notePath;
  writeProgress(p);
  for (const cb of progressListeners) cb();
}

export function clearProgress(slug: string): void {
  const p = readProgress();
  delete p.read[slug];
  delete p.last[slug];
  writeProgress(p);
  for (const cb of progressListeners) cb();
}

/** What this browser has read of a path: the read set, the last-opened path,
 *  and the count of read lessons that still exist on the path. */
export function useProgress(path: LibraryPath | null): { read: Set<string>; last: string | null; done: number } {
  const [, setTick] = useState(0);
  useEffect(() => {
    const cb = () => setTick((n) => n + 1);
    progressListeners.add(cb);
    return () => {
      progressListeners.delete(cb);
    };
  }, []);
  if (!path) return { read: new Set(), last: null, done: 0 };
  const p = readProgress();
  const read = new Set(p.read[path.slug] ?? []);
  const present = new Set(stepsOf(path).map((s) => s.lesson.path));
  let done = 0;
  for (const item of read) if (present.has(item)) done++;
  const last = p.last[path.slug] ?? null;
  return { read, last: last && present.has(last) ? last : null, done };
}
