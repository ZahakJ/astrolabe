/**
 * THE SYNC STATE MACHINE — one line of text the owner can trust.
 *
 * The shell shows a single line about the pocket vault: "synced 2 minutes
 * ago", "3 changes to push", "offline", "2 conflicts". That line is the ONLY
 * account anybody gets of whether their writing has left the phone, so it must
 * never be optimistic. Two rules follow from that and they are the whole
 * design:
 *
 *   - A pending push is ALWAYS louder than a past success. A vault with
 *     unpushed commits says how many, even if it pulled a second ago; saying
 *     "synced" while three commits sit in a pocket is the one lie that costs
 *     somebody their writing.
 *   - A conflict is louder still, and it never ages out. The `(phone)` files
 *     stay named until the owner has dealt with them.
 *
 * Pure: a reducer over events and a formatter over the state. The thing that
 * actually fetches and pushes (pocket/git.ts) drives it and renders it, and
 * the rule itself is tested without a network (tests/pocketSync.test.ts).
 */

import type { ConflictPair } from "./conflict.ts";

export type SyncPhase = "idle" | "pulling" | "pushing";

export interface SyncState {
  phase: SyncPhase;
  /** Commits made on this phone that the remote has not got. */
  ahead: number;
  /** When the last complete pull-and-push finished, epoch ms; null = never. */
  syncedAtMs: number | null;
  /** Is the network there, as far as the last attempt could tell? */
  online: boolean;
  /** Unresolved `(phone)` pairs from a diverged pull. */
  conflicts: ConflictPair[];
  /** The last failure's sentence, cleared by the next success. */
  error: string | null;
}

export const initialSyncState: SyncState = {
  phase: "idle",
  ahead: 0,
  syncedAtMs: null,
  online: true,
  conflicts: [],
  error: null,
};

export type SyncEvent =
  | { kind: "committed" }
  | { kind: "pull-started" }
  | { kind: "pull-done"; conflicts: ConflictPair[] }
  | { kind: "push-started" }
  | { kind: "push-done"; atMs: number }
  | { kind: "offline" }
  | { kind: "failed"; message: string }
  | { kind: "conflicts-cleared" };

export function syncReduce(state: SyncState, event: SyncEvent): SyncState {
  switch (event.kind) {
    case "committed":
      return { ...state, ahead: state.ahead + 1 };
    case "pull-started":
      return { ...state, phase: "pulling", online: true, error: null };
    case "pull-done":
      return {
        ...state,
        phase: "idle",
        online: true,
        error: null,
        // A conflict pair announced twice is one pair. The list is keyed by
        // the phone-side path, which is unique by construction.
        conflicts: mergePairs(state.conflicts, event.conflicts),
        // The conflict commit is a commit, and it has to be pushed like any
        // other, or the laptop never learns the pair exists.
        ahead: state.ahead + (event.conflicts.length > 0 ? 1 : 0),
      };
    case "push-started":
      return { ...state, phase: "pushing", online: true, error: null };
    case "push-done":
      return { ...state, phase: "idle", ahead: 0, syncedAtMs: event.atMs, online: true, error: null };
    case "offline":
      return { ...state, phase: "idle", online: false };
    case "failed":
      return { ...state, phase: "idle", error: event.message };
    case "conflicts-cleared":
      return { ...state, conflicts: [] };
    default:
      return state;
  }
}

function mergePairs(held: ConflictPair[], incoming: ConflictPair[]): ConflictPair[] {
  const byPhonePath = new Map(held.map((pair) => [pair.phonePath, pair]));
  for (const pair of incoming) byPhonePath.set(pair.phonePath, pair);
  return [...byPhonePath.values()];
}

/** What the line SAYS, as a key plus its numbers — the shell turns it into
 *  words through mobile/src/i18n.ts, so the rule is one place and the two
 *  languages are another. */
export type SyncLine =
  | { key: "syncing" }
  | { key: "pushing" }
  | { key: "conflicts"; count: number }
  | { key: "toPush"; count: number }
  | { key: "offline" }
  | { key: "failed"; message: string }
  | { key: "syncedAgo"; minutes: number }
  | { key: "syncedJustNow" }
  | { key: "never" };

/** The precedence, in the order it is decided. Conflicts, then work in
 *  flight, then work waiting, then the network, then the last failure, then —
 *  only when nothing else is true — how long ago all was well. */
export function syncLine(state: SyncState, nowMs: number): SyncLine {
  if (state.conflicts.length > 0) return { key: "conflicts", count: state.conflicts.length };
  if (state.phase === "pulling") return { key: "syncing" };
  if (state.phase === "pushing") return { key: "pushing" };
  if (state.ahead > 0 && !state.online) return { key: "toPush", count: state.ahead };
  if (!state.online) return { key: "offline" };
  if (state.ahead > 0) return { key: "toPush", count: state.ahead };
  if (state.error !== null) return { key: "failed", message: state.error };
  if (state.syncedAtMs === null) return { key: "never" };
  const minutes = Math.floor((nowMs - state.syncedAtMs) / 60_000);
  return minutes < 1 ? { key: "syncedJustNow" } : { key: "syncedAgo", minutes };
}

/** How long a push waits after a save before it goes. Long enough that typing
 *  a paragraph is one push rather than nine; short enough that putting the
 *  phone down and picking up the laptop works. */
export const PUSH_DEBOUNCE_MS = 30_000;
