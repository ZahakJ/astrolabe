/**
 * WHAT THE PHONE REMEMBERS ABOUT A POCKET VAULT.
 *
 * Capacitor Preferences, same store the shell's server list uses
 * (SharedPreferences under Android), for the same reason: the NATIVE side
 * reads some of it, and a value only the WebView can see would not have been
 * enough.
 *
 * ON THE TOKEN, AND WHY IT IS NOT ENCRYPTED. SharedPreferences is a file in
 * the app's private data directory: readable by this app's uid and no other on
 * a device that has not been rooted, and not encrypted at rest. The
 * alternative is EncryptedSharedPreferences over the Android keystore, which
 * defends against an attacker holding the unlocked device or a root shell, and
 * costs a Java plugin plus a failure mode — a keystore entry invalidated when
 * the owner's fingerprint enrolment changes — whose symptom is a vault that
 * will not open and cannot say why. What is being protected is a `repo`-scoped
 * GitHub token the owner can revoke from their account page in one click, and
 * revocation is the mitigation that matches that. The decision is written down
 * in CONTRACTS.md so a later round can change it with the argument in hand
 * rather than rediscovering it.
 */

import { Preferences } from "@capacitor/preferences";

const TOKEN = "pocket.token";
const USER = "pocket.user";
const REPO = "pocket.repo";
const BASE = "pocket.base";
const STATE = "pocket.state";

/** Which door the shell opens without being asked. Written here and read by
 *  connect.ts on every launch. */
const DOOR = "pocket.door";

export interface PocketUser {
  login: string;
  name: string | null;
  email: string | null;
}

export interface PocketRepoChoice {
  /** "owner/name". */
  fullName: string;
  branch: string;
  cloneUrl: string;
}

async function readJson<T>(key: string): Promise<T | null> {
  const { value } = await Preferences.get({ key });
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    // A half-written preference must never be the reason a screen is blank.
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await Preferences.set({ key, value: JSON.stringify(value) });
}

export async function readToken(): Promise<string | null> {
  const { value } = await Preferences.get({ key: TOKEN });
  return value ?? null;
}

export async function writeToken(token: string): Promise<void> {
  await Preferences.set({ key: TOKEN, value: token });
}

/** Sign out: the token, the account and the repository choice go together.
 *  The CLONE stays — it is the owner's notes, and a sign-out is not a delete. */
export async function forgetSignIn(): Promise<void> {
  await Preferences.remove({ key: TOKEN });
  await Preferences.remove({ key: USER });
}

export const readUser = (): Promise<PocketUser | null> => readJson<PocketUser>(USER);
export const writeUser = (user: PocketUser): Promise<void> => writeJson(USER, user);

export const readRepo = (): Promise<PocketRepoChoice | null> => readJson<PocketRepoChoice>(REPO);
export const writeRepo = (repo: PocketRepoChoice): Promise<void> => writeJson(REPO, repo);
export const forgetRepo = (): Promise<void> => Preferences.remove({ key: REPO });

/** The remote commit this clone was last level with — the thing that makes a
 *  shallow repository able to tell a fast-forward from a divergence. */
export async function readBase(): Promise<string | null> {
  const { value } = await Preferences.get({ key: BASE });
  return value ?? null;
}

export async function writeBase(sha: string): Promise<void> {
  await Preferences.set({ key: BASE, value: sha });
}

/** Where the shell goes on launch. "pocket" only once a clone exists. */
export type PocketDoor = "instance" | "pocket";

export async function readDoor(): Promise<PocketDoor | null> {
  const { value } = await Preferences.get({ key: DOOR });
  return value === "pocket" || value === "instance" ? value : null;
}

export async function writeDoor(door: PocketDoor): Promise<void> {
  await Preferences.set({ key: DOOR, value: door });
}

/**
 * The client's own device state — preferences, the workspace, the instance
 * settings — behind the `PocketStore` the server asks for.
 *
 * It does NOT go in the repository, and that is a decision rather than
 * laziness: `state/workspace` is which notes this phone has open, and pushing
 * it would mean opening the laptop to find the phone's tabs. What travels
 * between a person's machines is their notes.
 */
export function createPocketStore(): { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> } {
  return {
    async get(key: string): Promise<unknown> {
      const held = (await readJson<Record<string, unknown>>(STATE)) ?? {};
      return held[key] ?? null;
    },
    async set(key: string, value: unknown): Promise<void> {
      const held = (await readJson<Record<string, unknown>>(STATE)) ?? {};
      held[key] = value;
      await writeJson(STATE, held);
    },
  };
}
