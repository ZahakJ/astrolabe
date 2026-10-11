// HOW MANY CARDS ARE LEFT IN THE ORBITS SESSION ON SCREEN — the one number
// the presence reporter (./report.ts) cannot read out of the store.
//
// The queue lives in SessionView's component state, not in the store, and it
// should stay there: putting a session's queue in the store to tell Discord
// "12 left" would make every grade re-render every store subscriber. So the
// session view says the number here when it changes and says null when it
// unmounts, and the reporter listens. A plain module rather than a store
// field for the same reason, and small, because SessionView is in the Orbits
// chunk and this is the one line of presence it carries.

let left: number | null = null;
const listeners = new Set<() => void>();

/** The session view's word: the cards left, or null when no session is drawn. */
export function setOrbitsLeft(n: number | null): void {
  const next = n === null || !Number.isFinite(n) || n < 0 ? null : Math.round(n);
  if (next === left) return;
  left = next;
  for (const fn of listeners) fn();
}

export function getOrbitsLeft(): number | null {
  return left;
}

/** Called on every change; returns the unsubscribe. */
export function onOrbitsLeft(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
