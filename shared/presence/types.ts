// Discord presence — the shapes every side agrees on (docs/plans/discord-presence.md).
//
// Three layers, three types, and the order matters because it IS the privacy
// model: a client sends a `PresenceReport` (what surface, which path — the path
// stays on the server); the server reduces every report into one `Activity`
// (still private: it carries the path); the POLICY turns that into a
// `PublicActivity`, which is the first thing allowed out of the process; and
// the RENDER turns that into Discord's own `DiscordActivity`. Nothing below
// `PublicActivity` may ever hold a vault path.
//
// Pure types only — this file is imported by the client bundle, the server and
// the desktop main process alike.

/** What the reader is doing. `idle` is never REPORTED by a client; the reducer
 *  produces it when no client has seen input for `idleMinutes`. */
export type PresenceKind = "writing" | "reading" | "book" | "orbits" | "drawing" | "library" | "browsing";

export const PRESENCE_KINDS: readonly PresenceKind[] = ["writing", "reading", "book", "orbits", "drawing", "library", "browsing"];

export function isPresenceKind(value: unknown): value is PresenceKind {
  return typeof value === "string" && (PRESENCE_KINDS as readonly string[]).includes(value);
}

/** ONE CLIENT'S WORD, posted to `POST /api/presence` (admin sessions only) on
 *  every change and as a heartbeat every PRESENCE_HEARTBEAT_MS. */
export interface PresenceReport {
  /** This tab's id: 8–64 chars of [A-Za-z0-9_-], minted once per tab. */
  client: string;
  kind: PresenceKind;
  /** The subject's vault-relative path (a note, a book, a drawing, a deck).
   *  The SERVER turns it into a title and judges it; it never leaves the
   *  server. Absent for kinds with no subject (library, browsing). */
  path?: string;
  /** A subject with no path — kept for symmetry; today every subject has one.
   *  Judged by the same policy as a path's title. ≤ 200 chars. */
  title?: string;
  /** Orbits only: how many cards are left in the session. */
  cardsLeft?: number;
  /** Milliseconds since this tab last saw input (pointer, key, focus). The
   *  server computes `activeAt = receivedAt − idleMs`, so clocks need not
   *  agree. ≥ 0. */
  idleMs: number;
}

/** A report as the server keeps it. */
export interface HeldReport {
  report: PresenceReport;
  /** Server clock, ms, when the report arrived. */
  receivedAt: number;
  /** `receivedAt − report.idleMs`: when this client last saw a human. */
  activeAt: number;
}

/** The ONE activity the host reduces every client to. Private: `subject.path`
 *  is a vault path. */
export interface Activity {
  kind: PresenceKind | "idle";
  subject: { path: string | null; title: string } | null;
  cardsLeft: number | null;
  /** When the subject (kind + path/title) last changed, host clock ms. */
  subjectSince: number;
  /** When the host started, host clock ms. */
  sessionSince: number;
}

/** What the policy lets out. No path, ever. */
export interface PublicActivity {
  kind: PresenceKind | "idle";
  /** The subject's title, or null when the mode or the note withholds it. */
  title: string | null;
  cardsLeft: number | null;
  /** `timestamps.start`, or null when the elapsed timer is off. */
  since: number | null;
}

/** Discord's own `activity` object, the subset Rich Presence uses (the gateway
 *  Activity object; SET_ACTIVITY takes it under `args.activity`). */
export interface DiscordActivity {
  /** 0 = Playing. SET_ACTIVITY accepts 0, 2, 3 and 5. */
  type: 0;
  details?: string;
  state?: string;
  timestamps?: { start: number };
  assets?: {
    large_image?: string;
    large_text?: string;
    small_image?: string;
    small_text?: string;
  };
  buttons?: { label: string; url: string }[];
}

/** `settings.presence` — stored in settings.json; every field optional, a
 *  default is stored as its absence (server/settings.ts). */
export type PresenceMode = "off" | "activity" | "title";
export type PresenceIdle = "clear" | "show";
export type PresenceElapsed = "off" | "subject" | "session";
export type PresenceAssets = "site" | "uploaded";

export interface PresenceSettings {
  mode?: PresenceMode;
  /** The Discord application id, 17–20 digits; absent → the placeholder in
   *  shared/presence/config.ts (which means: nothing connects). */
  clientId?: string;
  /** 1–120; default 10. */
  idleMinutes?: number;
  idle?: PresenceIdle;
  vaultName?: boolean;
  elapsed?: PresenceElapsed;
  button?: boolean;
  /** This server process connects to Discord itself (a self-hoster with
   *  Discord on the same machine). Ignored under the desktop app, which owns
   *  presence for every vault it has open. */
  server?: boolean;
  assets?: PresenceAssets;
}

/** The same, with every default filled in — what `effective.presence` carries
 *  and what the core functions take. */
export interface PresenceEffective {
  mode: PresenceMode;
  /** The id in force, or null while it is the placeholder. */
  clientId: string | null;
  idleMinutes: number;
  idle: PresenceIdle;
  vaultName: boolean;
  elapsed: PresenceElapsed;
  button: boolean;
  server: boolean;
  assets: PresenceAssets;
}

export const PRESENCE_DEFAULTS: PresenceEffective = {
  mode: "off",
  clientId: null,
  idleMinutes: 10,
  idle: "clear",
  vaultName: false,
  elapsed: "subject",
  button: false,
  server: false,
  assets: "site",
};

export const PRESENCE_IDLE_MIN = 1;
export const PRESENCE_IDLE_MAX = 120;

/** The connection as a host sees it. `off`: presence is off or has no id;
 *  `searching`: no Discord socket answers (Discord is not running — silent);
 *  `connected`: handshake done; `invalid-id`: Discord closed with 4000 and
 *  the client has stopped retrying until the id changes. */
export type PresenceConnection = "off" | "searching" | "connected" | "invalid-id";

/** `GET /api/presence` — what the Settings page's status row prints. */
export interface PresenceStatus {
  /** `mode !== "off"` and an application id is set. */
  enabled: boolean;
  mode: PresenceMode;
  /** Whether an application id is in force (never the id itself to a client
   *  that did not set it — it is in settings anyway, but this is a status). */
  applicationId: "set" | "placeholder";
  /** Who speaks to Discord for this vault. */
  host: "desktop" | "server" | "none";
  connection: PresenceConnection;
  /** Clients reporting right now (not stale). */
  clients: number;
  /** The activity as last handed to the sink, for the status row's preview;
   *  already past the policy, so safe to show. */
  activity: DiscordActivity | null;
}

/** The message a server child sends its desktop parent (electron/presence.ts)
 *  whenever the rendered activity changes, and once at boot. */
export interface PresenceToParent {
  type: "astrolabe:presence";
  /** The application id the activity is for, or null when presence is off
   *  here (the parent then clears what this vault last showed). */
  clientId: string | null;
  activity: DiscordActivity | null;
}

/** The parent's answer: how its one connection is doing. */
export interface PresenceFromParent {
  type: "astrolabe:presence-status";
  connection: PresenceConnection;
}
