// SITTINGS FROM PROGRESS, on the server: the memory and the write.
//
// The rule is shared/sittings.ts. This module is the two things a pure
// function cannot be: the MEMORY of the progress each tracker last showed,
// kept in ASTROLABE_DATA/trackers-progress.json so a restart does not meet
// every book again as a move; and the WRITE of the estimated line into the
// note, which happens inside the indexer's own read of the note (the hook in
// server/indexer.ts), so every door a changed note comes in by is covered by
// one line of code — the editor's save, the Media page's − / +, a sync from
// the phone, a pull, a hand edit in another program.
//
// A MEMORY, NOT A SECOND TRUTH. The sittings are the note's; this file only
// knows what the last read looked like and which line the instance wrote,
// by its exact text. Lose the file and nothing is wrong: every tracker is met
// fresh, and a first sighting writes nothing.
//
// THE WRITE carries the mtime precondition every edit does. Refused (a save
// landed between the read and the write), nothing is remembered for that
// note, and the next read of it asks again.

import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { localIsoDay } from "../shared/dates.ts";
import {
  appendSittingLine,
  estimatedSession,
  estimateMinutes,
  isReadingTracker,
  lineCount,
  observeProgress,
  replaceSittingLine,
  type SeenTracker,
  type SittingAction,
} from "../shared/sittings.ts";
import { editTrackerFence, formatSessionLine, parseSessionLine, parseTracker, setTrackerFields, trackerFenceSpans, type Tracker, type TrackerSession } from "../shared/tracker.ts";
import { bookPagesOf } from "./books.ts";
import { notes, setTrackerObserver } from "./indexer.ts";
import { templateMatcher } from "./indexer/folders.ts";
import { dataDir } from "./site.ts";
import { emitEvent, suppressWatcherEcho, writeNote } from "./vault.ts";

const FILE = "trackers-progress.json";

interface Memory {
  version: 1;
  /** `path#index` → what that tracker last looked like. */
  trackers: Record<string, SeenTracker>;
}

let memory: Memory | null = null;
let clock: () => Date = () => new Date();
/** The rewrite the last read of a note made, for the save that caused it:
 *  PUT /api/note hands it back so the editor adopts the line. */
const rewrites = new Map<string, { content: string; mtimeMs: number }>();

function storePath(): string {
  return path.join(dataDir(), FILE);
}

function isSeen(v: unknown): v is SeenTracker {
  const o = v as SeenTracker | null;
  return (
    typeof o === "object" && o !== null && typeof o.title === "string" && typeof o.done === "number" &&
    typeof o.high === "number" && typeof o.day === "string" && Array.isArray(o.measured) &&
    o.measured.every((l) => typeof l === "string") && (o.line === null || typeof o.line === "string")
  );
}

function load(): Memory {
  if (memory) return memory;
  const out: Memory = { version: 1, trackers: {} };
  try {
    const parsed = JSON.parse(readFileSync(storePath(), "utf8")) as { trackers?: unknown };
    if (typeof parsed.trackers === "object" && parsed.trackers !== null) {
      for (const [key, value] of Object.entries(parsed.trackers as Record<string, unknown>)) {
        if (isSeen(value)) out.trackers[key] = value;
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`astrolabe: ${FILE} unreadable — every tracker is met fresh, and nothing is written until one moves:`, err);
    }
  }
  memory = out;
  return out;
}

function persist(): void {
  if (!memory) return;
  const file = storePath();
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(memory)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, file);
  chmodSync(file, 0o600);
}

/** Every measured and estimated sitting of every reading tracker the index
 *  holds — the vault's pace, when a book has none of its own yet. */
function vaultSessions(): TrackerSession[] {
  const out: TrackerSession[] = [];
  for (const record of notes.values()) {
    for (const t of record.trackers) if (isReadingTracker(t)) out.push(...t.sessions);
  }
  return out;
}

/** The fence body after `action`, and the seen state to keep; null when the
 *  action found nothing to do (the line it would fold into is gone). */
function apply(body: string, tracker: Tracker, action: NonNullable<SittingAction>, prev: SeenTracker, seen: SeenTracker, today: string): { body: string; seen: SeenTracker } | null {
  const own = prev.line !== null ? parseSessionLine(prev.line) : null;
  const ownToday = own !== null && own.date === today && own.estimate !== undefined ? own : null;
  const estimate = (count: number) =>
    estimateMinutes({ count, unit: tracker.unit, own: tracker.sessions, vault: vaultSessions(), total: tracker.total, bookPages: bookPagesOf(tracker.file) });
  if (action.kind === "add") {
    const delta = action.to - action.from;
    if (ownToday !== null && prev.line !== null) {
      // FOLD into the day's own line: the range extended, the count summed,
      // the estimate recomputed for the whole.
      const count = lineCount(ownToday) + delta;
      const line = formatSessionLine(estimatedSession(today, ownToday.from ?? (ownToday.to === null ? null : action.from), action.to, count, tracker.unit, estimate(count)));
      const folded = replaceSittingLine(body, prev.line, line);
      if (folded !== null) return { body: folded, seen: { ...seen, line } };
    }
    const line = formatSessionLine(estimatedSession(today, action.from, action.to, delta, tracker.unit, estimate(delta)));
    const appended = appendSittingLine(body, line) ?? setTrackerFields(body, { sessions: line });
    return { body: appended, seen: { ...seen, line } };
  }
  // SHRINK the day's own line by what the backward move took back.
  if (ownToday === null || prev.line === null) return null;
  const count = lineCount(ownToday) - action.by;
  const to = ownToday.to !== null ? ownToday.to - action.by : null;
  const line = count > 0 ? formatSessionLine(estimatedSession(today, ownToday.from, to, count, tracker.unit, estimate(count))) : null;
  const shrunk = replaceSittingLine(body, prev.line, line);
  if (shrunk === null) return null;
  return { body: shrunk, seen: { ...seen, line, high: seen.high - action.by } };
}

/** The indexer's hook: observe every tracker in the note, write what the
 *  moves ask for, and answer the new text (null when nothing was written). */
export async function observeNote(relPath: string, content: string, mtimeMs: number): Promise<{ content: string; mtimeMs: number } | null> {
  const mem = load();
  const prefix = `${relPath}#`;
  if (templateMatcher()(relPath)) return null;
  const spans = trackerFenceSpans(content);
  if (spans.length === 0 && !Object.keys(mem.trackers).some((k) => k.startsWith(prefix))) return null;
  const today = localIsoDay(clock());
  const next: Record<string, SeenTracker | null> = {};
  let text = content;
  for (const span of spans) {
    const key = `${prefix}${span.index}`;
    const tracker = parseTracker(span.body);
    if (tracker === null) {
      next[key] = null;
      continue;
    }
    const prev = mem.trackers[key];
    const { seen, action } = observeProgress(prev, tracker, today);
    if (seen === null || action === null || prev === undefined) {
      next[key] = seen;
      continue;
    }
    let done: { body: string; seen: SeenTracker } | null = null;
    const edited = editTrackerFence(text, span.index, (body) => {
      done = apply(body, tracker, action, prev, seen, today);
      return done === null ? body : done.body;
    });
    next[key] = done === null ? seen : (done as { seen: SeenTracker }).seen;
    text = edited;
  }
  // A tracker that left the note (or a note with fewer fences) is forgotten.
  for (const key of Object.keys(mem.trackers)) {
    if (key.startsWith(prefix) && !(key in next)) next[key] = null;
  }
  let written: { content: string; mtimeMs: number } | null = null;
  if (text !== content) {
    try {
      suppressWatcherEcho(relPath);
      const note = await writeNote(relPath, text, mtimeMs);
      written = { content: text, mtimeMs: note.mtimeMs };
    } catch (err) {
      // A save landed in between: remember nothing for this note, so the read
      // that save causes asks again against the text it wrote.
      console.warn(`astrolabe: an estimated sitting for "${relPath}" was not written (${(err as Error).message}); the next read will ask again`);
      return null;
    }
  }
  let changed = false;
  for (const [key, seen] of Object.entries(next)) {
    const before = mem.trackers[key];
    if (seen === null) {
      if (before !== undefined) {
        delete mem.trackers[key];
        changed = true;
      }
    } else if (before === undefined || JSON.stringify(before) !== JSON.stringify(seen)) {
      mem.trackers[key] = seen;
      changed = true;
    }
  }
  // Written through before the note's event goes out: a restart one instant
  // after the write must not meet this move again.
  if (changed) persist();
  if (written !== null) {
    rewrites.set(relPath, written);
    emitEvent({ kind: "changed", path: relPath });
  }
  return written;
}

/** The rewrite the index's last read of `relPath` made, taken once. */
export function takeSittingRewrite(relPath: string): { content: string; mtimeMs: number } | null {
  const hit = rewrites.get(relPath) ?? null;
  rewrites.delete(relPath);
  return hit;
}

/** Register the hook. Before the first index walk, so a move made while the
 *  instance was down (a sync, an edit in another program) is met at boot. */
export function initSittings(): void {
  load();
  setTrackerObserver(observeNote);
}

/** After the first walk: forget the trackers of notes that no longer exist. */
export function pruneSittings(): void {
  const mem = load();
  let changed = false;
  for (const key of Object.keys(mem.trackers)) {
    if (!notes.has(key.slice(0, key.lastIndexOf("#")))) {
      delete mem.trackers[key];
      changed = true;
    }
  }
  if (changed) persist();
}

/** Tests: the day the instance believes it is, and a restart's empty head. */
export function setSittingsClock(next: () => Date): void {
  clock = next;
}
export function forgetSittingsMemory(): void {
  memory = null;
  rewrites.clear();
}
