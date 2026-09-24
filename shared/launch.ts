// OPEN ON LAUNCH — what the admin's shell shows first.
//
// The app restored the last session and, with nothing to restore, opened the
// home note; that stays the default (`resume`). A reader whose day starts
// with a checklist wants the Sigils page first, one whose day starts with
// cards wants the Orbits shelf, a journaller wants today's note, and a
// reader with a hub note wants that. One setting, five doors and a path —
// the fifth (3.28) is the Today page (client/today/), which holds the day's
// note, the sigils, the cards and the tasks on one page. It is a door on
// THIS setting rather than a device switch of its own: two settings that
// both decide what a launch opens would have to be told which one wins.
//
// A SITE setting (settings.json, mirrored into the vault) rather than a
// browser one, on the home note's precedent: what a vault opens on is a
// fact about the vault, and it follows the vault to the next machine. The
// session itself is still restored underneath — the door is opened on TOP
// of where the reader left off, so nothing they had open is lost to it.

import { isNotePath } from "./noteFormat.ts";
import type { LaunchDoor, LaunchSetting } from "./types.ts";

export const LAUNCH_DOORS: readonly LaunchDoor[] = ["resume", "sigils", "orbits", "today", "today-page"];
export const DEFAULT_LAUNCH: LaunchDoor = "resume";

export function isLaunchDoor(value: unknown): value is LaunchDoor {
  return typeof value === "string" && (LAUNCH_DOORS as readonly string[]).includes(value);
}

/** A stored value read back: a door, a note path, or null for anything
 *  else (a path that is not a note, an empty string, a number). */
export function parseLaunch(value: unknown): LaunchSetting | null {
  if (isLaunchDoor(value)) return value;
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean !== "" && isNotePath(clean) ? clean : null;
}
