// `settings.presence` — read, patched, filled in. The askSettings.ts shape:
// server/settings.ts owns the file and calls these three, so the rules for
// one feature's sub-keys sit beside the feature rather than in a 2,500-line
// file. A default is stored as its absence, so settings.json only ever says
// what the owner changed.

import { isApplicationId, resolveApplicationId } from "../../shared/presence/config.ts";
import {
  PRESENCE_DEFAULTS,
  PRESENCE_IDLE_MAX,
  PRESENCE_IDLE_MIN,
  type PresenceEffective,
  type PresenceSettings,
} from "../../shared/presence/types.ts";
import { VaultError } from "../vault.ts";

const MODES = ["off", "activity", "title"] as const;
const IDLES = ["clear", "show"] as const;
const ELAPSED = ["off", "subject", "session"] as const;
const ASSETS = ["site", "uploaded"] as const;
const BOOLEANS = ["vaultName", "button", "server"] as const;

function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

function isIdleMinutes(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= PRESENCE_IDLE_MIN && value <= PRESENCE_IDLE_MAX;
}

/** settings.json → the stored shape. A malformed sub-key reads as absent
 *  (reads never fail — a hand edit must not take the instance down). */
export function readPresenceSettings(raw: unknown): PresenceSettings | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: PresenceSettings = {};
  if (oneOf(MODES, r.mode)) out.mode = r.mode;
  if (isApplicationId(r.clientId)) out.clientId = r.clientId;
  if (isIdleMinutes(r.idleMinutes)) out.idleMinutes = r.idleMinutes;
  if (oneOf(IDLES, r.idle)) out.idle = r.idle;
  for (const key of BOOLEANS) if (typeof r[key] === "boolean") out[key] = r[key];
  if (oneOf(ELAPSED, r.elapsed)) out.elapsed = r.elapsed;
  if (oneOf(ASSETS, r.assets)) out.assets = r.assets;
  return Object.keys(out).length > 0 ? out : null;
}

/** PATCH `presence` → the next stored value (null = delete the key). Strict:
 *  one bad sub-key rejects the whole patch. */
export function cleanPresencePatch(value: unknown, current: unknown): PresenceSettings | null {
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new VaultError(400, 'Settings key "presence" must be an object or null');
  }
  const next: Record<string, unknown> = { ...(readPresenceSettings(current) ?? {}) };
  const enumKey = (key: string, v: unknown, list: readonly string[], def: string): void => {
    if (v === null || v === "" || v === def) delete next[key];
    else if (oneOf(list, v)) next[key] = v;
    else throw new VaultError(400, `Settings key "presence.${key}" must be one of: ${list.join(", ")}`);
  };
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (key === "mode") enumKey(key, v, MODES, PRESENCE_DEFAULTS.mode);
    else if (key === "idle") enumKey(key, v, IDLES, PRESENCE_DEFAULTS.idle);
    else if (key === "elapsed") enumKey(key, v, ELAPSED, PRESENCE_DEFAULTS.elapsed);
    else if (key === "assets") enumKey(key, v, ASSETS, PRESENCE_DEFAULTS.assets);
    else if (key === "clientId") {
      const id = typeof v === "string" ? v.trim() : v;
      if (id === null || id === "") delete next.clientId;
      else if (isApplicationId(id)) next.clientId = id;
      else throw new VaultError(400, 'Settings key "presence.clientId" must be a Discord application id (17 to 20 digits)');
    } else if (key === "idleMinutes") {
      if (v === null || v === PRESENCE_DEFAULTS.idleMinutes) delete next.idleMinutes;
      else if (isIdleMinutes(v)) next.idleMinutes = v;
      else {
        throw new VaultError(
          400,
          `Settings key "presence.idleMinutes" must be a whole number from ${PRESENCE_IDLE_MIN} to ${PRESENCE_IDLE_MAX}`,
        );
      }
    } else if (key === "vaultName" || key === "button" || key === "server") {
      if (v === null || v === PRESENCE_DEFAULTS[key]) delete next[key];
      else if (typeof v === "boolean") next[key] = v;
      else throw new VaultError(400, `Settings key "presence.${key}" must be a boolean or null`);
    } else {
      throw new VaultError(400, `Unknown settings key: presence.${key}`);
    }
  }
  return Object.keys(next).length > 0 ? (next as PresenceSettings) : null;
}

/** Every default filled in; the id is the one in force, or null while the
 *  placeholder stands. */
export function presenceEffective(stored: PresenceSettings | undefined): PresenceEffective {
  const s = stored ?? {};
  return {
    mode: s.mode ?? PRESENCE_DEFAULTS.mode,
    clientId: resolveApplicationId(s.clientId),
    idleMinutes: s.idleMinutes ?? PRESENCE_DEFAULTS.idleMinutes,
    idle: s.idle ?? PRESENCE_DEFAULTS.idle,
    vaultName: s.vaultName ?? PRESENCE_DEFAULTS.vaultName,
    elapsed: s.elapsed ?? PRESENCE_DEFAULTS.elapsed,
    button: s.button ?? PRESENCE_DEFAULTS.button,
    server: s.server ?? PRESENCE_DEFAULTS.server,
    assets: s.assets ?? PRESENCE_DEFAULTS.assets,
  };
}
