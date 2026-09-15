// The update policy, as one decision with no wires attached.
//
// A friend's Windows build downloaded a release on its own, and the owner's
// verdict was the whole policy in one breath: "no auto updates in general, and
// if there are any annoying reminders then we should be able to turn these
// off". So the decision of what an update check may DO is written here, pure,
// and proved by tests/updatePolicy.test.ts — because the previous policy was
// also written down (in the header of electron/update.ts, at length) and it
// still downloaded 190 MB into a stranger's home directory. A rule that lives
// in prose drifts; a rule that returns `download: false` for every input is
// one a test can hold.
//
// Electron-free on purpose, like electron/prefs.ts: `node --test` cannot start
// a browser process, and the root `npm run typecheck` follows this file in
// from the test.

/** The reader's one preference about updates, kept desktop-side beside the
 *  window bounds (electron/prefs.ts): `notify` checks quietly and says when a
 *  release exists; `off` never checks and never reminds. The menu's "Check for
 *  updates…" is a request in both states and always answers. */
export type UpdatesPref = "notify" | "off";

export interface UpdateSituation {
  pref: UpdatesPref;
  /** A person asked (the menu item, the status-bar chip) rather than the timer. */
  manual: boolean;
  /** The running build. */
  current: string;
  /** The newest release's tag once the check has answered; null before it has
   *  (or when the question is only whether to ask at all). */
  latest: string | null;
  /** The version this launch has already reminded the reader about, or null. */
  reminded: string | null;
}

export interface UpdateDecision {
  /** Ask the releases endpoint at all. */
  check: boolean;
  /** Say "3.x available" — the pill and, once, a toast. */
  remind: boolean;
  /** Fetch bytes. ALWAYS false here: a download is a click, never a decision. */
  download: boolean;
}

/** `1.6.0` vs `1.7.0`, numerically per part — enough for this repo's own tags,
 *  which is the only versioning this has to understand. */
export function newer(remote: string, local: string): boolean {
  const a = remote.replace(/^v/, "").split(".").map(Number);
  const b = local.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/** What a check is allowed to do in this situation.
 *
 *  Three rules, in the order a reader would state them:
 *    · With updates `off`, the timer asks nothing. A person asking by hand is
 *      still answered — "off" is about being interrupted, not about being
 *      refused information.
 *    · A newer release is said ONCE per version per launch. The six-hour timer
 *      finding the same release again is not news; a manual check repeats it,
 *      because a person who asked deserves an answer either way.
 *    · Nothing is ever downloaded by a check. `download` is false for every
 *      input, and the test says so for every input it can think of. */
export function decideUpdate(s: UpdateSituation): UpdateDecision {
  const check = s.manual || s.pref === "notify";
  const isNew = check && s.latest !== null && newer(s.latest, s.current);
  const remind = isNew && (s.manual || s.reminded !== s.latest);
  return { check, remind, download: false };
}

/** Read a stored preference of unknown provenance. Anything that is not the
 *  literal "off" is `notify`: a hand edit or a future value must not silence
 *  the check by accident, because silence is the state nobody notices. */
export function parseUpdatesPref(raw: unknown): UpdatesPref {
  return raw === "off" ? "off" : "notify";
}
