// A note's annotations, fetched once per path per session and shared by
// whichever surface is showing the note; writes go through here so the
// reading view, the article page and the lesson page all see the same list.

import { useEffect, useState } from "react";
import type { NoteAnnotation } from "../../shared/types.ts";
import { deleteAnnotation as apiDelete, getAnnotations, putAnnotation as apiPut } from "../api.ts";

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();
const cache = new Map<string, NoteAnnotation[]>();
const inflight = new Map<string, Promise<void>>();

function emit(path: string): void {
  for (const cb of listeners.get(path) ?? []) cb();
}

function load(path: string, force = false): Promise<void> {
  if (!force && cache.has(path)) return Promise.resolve();
  const running = inflight.get(path);
  if (running && !force) return running;
  const p = getAnnotations(path)
    .then((res) => {
      cache.set(path, res.annotations);
    })
    .catch(() => {
      // Not published to this session, or the server said no: a note with no
      // annotations, which is what the page shows.
      cache.set(path, []);
    })
    .finally(() => {
      inflight.delete(path);
      emit(path);
    });
  inflight.set(path, p);
  return p;
}

/** Forget a note's list (a rename, a session change). */
export function invalidateAnnotations(path?: string): void {
  if (path === undefined) cache.clear();
  else cache.delete(path);
}

/** The list as cached right now (null before the first load), without
 *  subscribing — for code outside React, such as the editor's mark painter. */
export function peekAnnotations(path: string): NoteAnnotation[] | null {
  return cache.get(path) ?? null;
}

/** Be told whenever a note's list changes, and start the load if it has not
 *  happened. Returns the unsubscribe. */
export function subscribeAnnotations(path: string, cb: Listener): () => void {
  let set = listeners.get(path);
  if (!set) listeners.set(path, (set = new Set()));
  set.add(cb);
  void load(path);
  return () => {
    set?.delete(cb);
  };
}

export function useAnnotations(path: string | null): NoteAnnotation[] | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (path === null) return;
    const cb = () => setTick((n) => n + 1);
    let set = listeners.get(path);
    if (!set) listeners.set(path, (set = new Set()));
    set.add(cb);
    void load(path);
    return () => {
      set?.delete(cb);
    };
  }, [path]);
  return path === null ? null : (cache.get(path) ?? null);
}

export async function saveAnnotation(path: string, annotation: NoteAnnotation): Promise<NoteAnnotation> {
  const saved = await apiPut(path, annotation);
  const list = cache.get(path) ?? [];
  const at = list.findIndex((a) => a.id === saved.id);
  cache.set(path, at === -1 ? [...list, saved] : list.map((a, i) => (i === at ? saved : a)));
  emit(path);
  return saved;
}

export async function removeAnnotation(path: string, id: string): Promise<void> {
  await apiDelete(path, id);
  cache.set(path, (cache.get(path) ?? []).filter((a) => a.id !== id));
  emit(path);
}
