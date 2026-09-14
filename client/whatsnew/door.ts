// WHAT'S NEW — the door. First-paint safe: two localStorage keys, a version
// compare, and a dynamic import of the deck.
//
// The owner: "whenever you update to a new version and open that version for
// the first time you get some super nice looking modern popup with a preview
// of all the features added in said update" — enabled by default, with a
// switch in Settings → This device. So:
//
//   · `astrolabe.whatsnewSeen` holds the newest deck this DEVICE has seen.
//     A device, not the vault: the deck is about the build this browser just
//     loaded, and the phone updates on its own day.
//   · `astrolabe.whatsnew` = "off" is the switch, and it TRAVELS (prefsSync):
//     "don't show me these" is a preference of the person.
//
// A fresh install — no `astrolabe.*` key at all — is not an update: the tour
// is that reader's welcome, and the deck marks itself seen in silence. An
// existing device without a seen-mark (every device the day this shipped) is
// an update, and gets the CURRENT version's deck only, never the back
// catalogue.

import { RELEASE_VERSIONS, compareVersions } from "./versions.ts";

const SEEN_KEY = "astrolabe.whatsnewSeen";
const OFF_KEY = "astrolabe.whatsnew";
export const WHATSNEW_EVENT = "astrolabe:whatsnew";

const current = (): string => (typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0");

export function whatsNewEnabled(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setWhatsNewEnabled(on: boolean): void {
  try {
    if (on) localStorage.removeItem(OFF_KEY);
    else localStorage.setItem(OFF_KEY, "off");
  } catch {
    // storage unavailable
  }
  window.dispatchEvent(new CustomEvent(WHATSNEW_EVENT));
}

function seenVersion(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

function anyAstrolabeKey(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("astrolabe.") && k !== SEEN_KEY) return true;
    }
  } catch {
    // storage unavailable
  }
  return false;
}

/** READ ONCE, AT MODULE LOAD. The boot itself writes `astrolabe.recents`,
 *  `astrolabe.tabs` and `astrolabe.prefs-sync` within the first frames — so
 *  by the time the door's timer fires, a fresh install has keys and reads
 *  as an old device (every new reader got 3.11.0's deck through 3.13.0).
 *  This module evaluates with App.tsx's imports, before main.tsx runs a
 *  line, and storageMigration — the one import ahead of it — writes
 *  nothing on a vault that has nothing to migrate. */
const FRESH_AT_LOAD = seenVersion() === null && !anyAstrolabeKey();

export function markWhatsNewSeen(version: string = current()): void {
  try {
    localStorage.setItem(SEEN_KEY, version);
  } catch {
    // storage unavailable
  }
}

/** The decks this device has not seen, newest first, never newer than the
 *  build itself. A device with no mark gets only the current version's. */
export function pendingReleases(): string[] {
  const seen = seenVersion();
  const now = current();
  const eligible = RELEASE_VERSIONS.filter((v) => compareVersions(v, now) <= 0);
  if (seen === null) {
    const newest = eligible.filter((v) => compareVersions(v, now) === 0 || v.slice(0, v.lastIndexOf(".")) === now.slice(0, now.lastIndexOf(".")));
    return newest.sort((a, b) => compareVersions(b, a)).slice(0, 1);
  }
  return eligible.filter((v) => compareVersions(v, seen) > 0).sort((a, b) => compareVersions(b, a));
}

let opened = false;

/** Open the deck for the pending releases, once per session, if the switch
 *  is on. Called by App.tsx once the admin shell has settled. */
export function maybeOpenWhatsNew(): void {
  if (opened) return;
  if (FRESH_AT_LOAD && seenVersion() === null) {
    // A fresh install: this build is the first one, not a new one.
    markWhatsNewSeen();
    return;
  }
  if (!whatsNewEnabled()) {
    markWhatsNewSeen();
    return;
  }
  const pending = pendingReleases();
  if (pending.length === 0) return;
  opened = true;
  openWhatsNew(pending);
}

/** Open the deck for `versions` (newest first), or for every release up to
 *  this build when none are given — the palette's door. */
export function openWhatsNew(versions?: string[]): void {
  const list =
    versions ??
    RELEASE_VERSIONS.filter((v) => compareVersions(v, current()) <= 0).sort((a, b) => compareVersions(b, a));
  if (list.length === 0) return;
  void import("./WhatsNew.tsx")
    .then((mod) => mod.openWhatsNewDeck(list))
    .catch((err: unknown) => {
      console.error("astrolabe: loading the what's-new deck failed", err);
    });
}
