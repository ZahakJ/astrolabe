/**
 * WHAT A POCKET VAULT SAYS ABOUT ITSELF — one rule, two renderings.
 *
 * The Android shell paints a single line over the vault ("3 changes to push",
 * "2 conflicts", "Synced 4 minutes ago"), and since 3.22.2 the settings panel's
 * Backup & sync tab shows the same fact in the same words. Two implementations
 * of "is my writing somewhere else yet" would eventually disagree, and the
 * quieter of the two would be the one believed — so the PRECEDENCE lives here,
 * once, and both sides resolve the key it returns through their own dictionary.
 *
 * Two rules decide the order, and they are the whole design:
 *
 *   - A pending push is ALWAYS louder than a past success. A vault with
 *     unpushed commits says how many, even if it pulled a second ago; saying
 *     "synced" while three commits sit in a pocket is the one lie that costs
 *     somebody their writing.
 *   - A conflict is louder still, and it never ages out. The `(phone)` files
 *     stay named until the owner has dealt with them.
 *
 * Pure, and tested without a network (tests/pocketSync.test.ts).
 */

/** The state this rule reads. `PocketSyncStatus` (shared/types.ts) satisfies
 *  it, and so does the shell's own richer `SyncState` — which is the point:
 *  neither side has to convert before asking what its line says. */
export interface PocketSyncFacts {
  phase: "idle" | "pulling" | "pushing";
  ahead: number;
  syncedAtMs: number | null;
  online: boolean;
  conflicts: readonly unknown[];
  error: string | null;
}

/** What the line SAYS, as a key plus its numbers — each side turns it into
 *  words through its own dictionary, so the rule is one place and the two
 *  languages are another. */
export type PocketSyncLine =
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
export function pocketSyncLine(state: PocketSyncFacts, nowMs: number): PocketSyncLine {
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
