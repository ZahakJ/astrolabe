// The release timer for `publish: <date>` (shared/publishAt.ts).
//
// The index decides visibility once, when it reads a note; a post scheduled
// for nine o'clock is not re-read at nine o'clock by anything. So the index
// hands every future `publish:` here, and ONE timer — armed for the earliest
// of them — announces each note as changed when its moment comes. That is the
// same event a save sends, so the note is re-read (and now published), every
// derived list is rebuilt, and every open tab and the feed hear of it, by the
// path a save already takes. Nothing here decides anything.

import { emitEvent } from "./vault.ts";

const due = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | null = null;

/** setTimeout's ceiling is 2^31 − 1 ms (~24.8 days); a later date re-arms
 *  from the nearer wake-up rather than firing at once. */
const MAX_WAIT = 2 ** 31 - 1;

function arm(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  let next = Infinity;
  for (const at of due.values()) next = Math.min(next, at);
  if (next === Infinity) return;
  timer = setTimeout(release, Math.min(Math.max(next - Date.now(), 0), MAX_WAIT));
  // A pending release must not keep a stopping server (or a test) alive.
  timer.unref?.();
}

function release(): void {
  timer = null;
  const now = Date.now();
  for (const [path, at] of [...due]) {
    if (at > now) continue;
    due.delete(path);
    emitEvent({ kind: "changed", path });
  }
  arm();
}

/** The index read `path` with a future `publish:` date (or with none: null). */
export function setScheduledPublish(path: string, at: number | null): void {
  const had = due.get(path);
  if (at === null) {
    if (had === undefined) return;
    due.delete(path);
  } else {
    if (had === at) return;
    due.set(path, at);
  }
  arm();
}

/** Every note waiting for its moment, soonest first. */
export function scheduledPublishes(): { path: string; at: number }[] {
  return [...due].map(([path, at]) => ({ path, at })).sort((a, b) => a.at - b.at || a.path.localeCompare(b.path));
}
