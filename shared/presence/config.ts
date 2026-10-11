// Discord presence — the one place the application id, the image URLs and the
// timings are written (docs/plans/discord-presence.md, docs/presence.md).

import type { PresenceKind } from "./types.ts";

/** THE DISCORD APPLICATION ID, OR RATHER WHERE IT GOES.
 *
 *  Only the owner can create the Discord application (discord.com/developers
 *  → New Application → copy the Application ID from General Information).
 *  Paste it either here, in place of this constant, or — without touching the
 *  code — into Settings → Discord → Application id, which overrides this.
 *  While this placeholder stands and settings carry no id, nothing connects
 *  and the status row says so. */
export const PRESENCE_APPLICATION_ID = "PASTE_YOUR_DISCORD_APPLICATION_ID";

/** A Discord snowflake: 17–20 decimal digits. */
export function isApplicationId(value: unknown): value is string {
  return typeof value === "string" && /^\d{17,20}$/.test(value);
}

/** The id in force: the setting when set, else the constant when it has been
 *  replaced with a real id, else null. */
export function resolveApplicationId(settingsId: string | undefined | null): string | null {
  if (isApplicationId(settingsId)) return settingsId;
  if (isApplicationId(PRESENCE_APPLICATION_ID)) return PRESENCE_APPLICATION_ID;
  return null;
}

/** The images Discord shows, hosted on the project's own pages site — docs/
 *  is served at the repository's GitHub Pages URL, so these are the files in
 *  docs/brand/presence/. Discord accepts an external image URL as an asset
 *  value (the gateway Activity object, "Activity Asset Image"). The same
 *  PNGs are there for a portal upload (`assets: "uploaded"`), under the same
 *  names as keys. */
export const PRESENCE_ASSET_BASE = "https://zahakj.github.io/astrolabe/brand/presence/";

/** The large image: the mark. */
export const PRESENCE_LARGE_ASSET = "mark";

/** The small image per kind: the glyph. */
export const PRESENCE_SMALL_ASSET: Record<PresenceKind | "idle", string> = {
  writing: "pen",
  reading: "page",
  book: "book",
  orbits: "cards",
  drawing: "brush",
  library: "shelf",
  browsing: "compass",
  idle: "moon",
};

/** An asset's value for the wire: a URL on the pages site, or the uploaded key. */
export function presenceAsset(name: string, assets: "site" | "uploaded"): string {
  return assets === "site" ? `${PRESENCE_ASSET_BASE}${name}.png` : name;
}

/** Discord's Rich Presence rate: one SET_ACTIVITY per 15 seconds (the
 *  official discord-rpc client queues to this); the IPC client coalesces to
 *  it and sends only when the activity changed. */
export const PRESENCE_RATE_MS = 15_000;

/** A client posts a heartbeat this often while nothing changes, carrying how
 *  long since it last saw input. */
export const PRESENCE_HEARTBEAT_MS = 60_000;

/** A client silent for this long is dropped from the table (two heartbeats
 *  and a half: a tab that was closed, a laptop that went to sleep). */
export const PRESENCE_STALE_MS = 150_000;

/** How often the host re-reduces (idle crossings happen between reports). */
export const PRESENCE_TICK_MS = 5_000;

/** Reconnect backoff while no Discord socket answers: doubling from the
 *  first to the cap, reset after a handshake. */
export const PRESENCE_BACKOFF_FIRST_MS = 5_000;
export const PRESENCE_BACKOFF_CAP_MS = 300_000;

/** Discord's string limits (details, state, large_text, small_text). */
export const PRESENCE_TEXT_MAX = 128;
/** A button's label and url (the gateway Activity Buttons object). */
export const PRESENCE_BUTTON_LABEL_MAX = 32;
export const PRESENCE_BUTTON_URL_MAX = 512;
