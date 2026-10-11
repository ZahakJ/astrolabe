// Discord presence for the whole desktop app (docs/plans/discord-presence.md).
// Each vault's server child sends its rendered activity over the IPC channel
// it already has; this keeps the latest per vault, picks one, and drives ONE
// socket to Discord for the app — two vaults open must not fight over the
// card. Nothing crosses the renderer wall, so no preload channel exists for
// it. The children are told how the socket is doing, so the Settings status
// row inside the app is honest.

import type { ChildProcess } from "node:child_process";
import { DiscordIpcClient } from "../server/presence/discordIpc.ts";
import type { PresenceConnection } from "../shared/presence/types.ts";
import { isPresenceToParent, PresenceBook, presenceStatusMessage } from "./presenceState.ts";

const book = new PresenceBook();
const children = new Map<string, { child: ChildProcess; onMessage: (msg: unknown) => void }>();
let client: DiscordIpcClient | null = null;
let connection: PresenceConnection = "off";

function tell(child: ChildProcess): void {
  if (!child.connected) return;
  try {
    child.send(presenceStatusMessage(connection));
  } catch {
    // A child on its way out; its exit handler will detach it.
  }
}

function setConnection(next: PresenceConnection): void {
  if (next === connection) return;
  connection = next;
  for (const { child } of children.values()) tell(child);
}

function refresh(): void {
  const pick = book.pick();
  if (pick === null) {
    client?.setActivity(null);
    return;
  }
  // Created on the first thing worth showing: an app whose vaults all have
  // presence off never touches a socket.
  if (client === null) {
    client = new DiscordIpcClient({ clientId: pick.clientId, pid: process.pid });
    client.onConnection(setConnection);
    client.start();
    setConnection(client.connection);
  } else if (client.id !== pick.clientId) {
    client.setClientId(pick.clientId);
  }
  client.setActivity(pick.activity);
}

/** After `startVaultServer` (and again after a respawn: a new child). */
export function attachPresence(vault: string, child: ChildProcess): void {
  detachPresence(vault);
  const onMessage = (msg: unknown): void => {
    if (!isPresenceToParent(msg)) return;
    book.set(vault, msg, Date.now());
    refresh();
  };
  child.on("message", onMessage);
  children.set(vault, { child, onMessage });
  tell(child);
}

export function detachPresence(vault: string): void {
  const entry = children.get(vault);
  if (entry !== undefined) entry.child.off("message", entry.onMessage);
  children.delete(vault);
  book.drop(vault);
  refresh();
}

/** Whether quitting has a Discord card to clear first. */
export function presenceActive(): boolean {
  return client !== null;
}

/** Clear the card and close the socket; resolves even if Discord is wedged. */
export async function shutdownPresence(): Promise<void> {
  const c = client;
  client = null;
  if (c !== null) await c.stop();
}
