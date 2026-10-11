// The desktop's presence book — the pure half of electron/presence.ts, kept
// apart so tests/desktop.test.ts can prove it without Electron.
//
// Every open vault's server reports its own activity; Discord shows one. The
// one that changed LAST wins, because that is the vault the reader just
// touched. A vault that reports null (presence off there, or nothing to say)
// steps aside rather than clearing what another vault shows.

import type { DiscordActivity, PresenceToParent } from "../shared/presence/types.ts";

export { isPresenceToParent, presenceStatusMessage } from "../shared/presence/messages.ts";

export class PresenceBook {
  private readonly entries = new Map<string, { clientId: string | null; activity: DiscordActivity | null; at: number }>();

  set(vault: string, msg: PresenceToParent, now: number): void {
    this.entries.set(vault, { clientId: msg.clientId, activity: msg.activity, at: now });
  }

  drop(vault: string): void {
    this.entries.delete(vault);
  }

  /** The most recent vault with something to show, or null. */
  pick(): { clientId: string; activity: DiscordActivity } | null {
    let best: { clientId: string; activity: DiscordActivity; at: number } | null = null;
    for (const e of this.entries.values()) {
      if (e.activity === null || e.clientId === null) continue;
      if (best === null || e.at >= best.at) best = { clientId: e.clientId, activity: e.activity, at: e.at };
    }
    return best === null ? null : { clientId: best.clientId, activity: best.activity };
  }
}
