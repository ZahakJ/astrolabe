// The two messages between a vault's server child and the desktop parent
// (types.ts PresenceToParent / PresenceFromParent), and their guards. Both
// sides check what arrives: the channel also carries `astrolabe:listening`,
// and a future message must not be mistaken for this one.

import type { PresenceConnection, PresenceFromParent, PresenceToParent } from "./types.ts";

const CONNECTIONS: readonly PresenceConnection[] = ["off", "searching", "connected", "invalid-id"];

export function isPresenceToParent(msg: unknown): msg is PresenceToParent {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return (
    m.type === "astrolabe:presence" &&
    (m.clientId === null || typeof m.clientId === "string") &&
    (m.activity === null || (typeof m.activity === "object" && !Array.isArray(m.activity)))
  );
}

export function isPresenceFromParent(msg: unknown): msg is PresenceFromParent {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m.type === "astrolabe:presence-status" && (CONNECTIONS as readonly unknown[]).includes(m.connection);
}

export function presenceStatusMessage(connection: PresenceConnection): PresenceFromParent {
  return { type: "astrolabe:presence-status", connection };
}
