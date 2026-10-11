// WHAT THIS TAB IS DOING, AS ONE PRESENCE REPORT — the pure half of the
// reporter (./report.ts), split out so tests/presenceClient.test.ts can hold
// it under Node without a store, a window or a clock.
//
// The table it implements is docs/plans/discord-presence.md "Event sources
// per surface". It reads the FOCUSED pane, not `noteFocus`: the reader with a
// book in one pane and a note in the other is reading the book while the
// keyboard is in it, and that is the answer Discord should give.
//
// A report carries a PATH and never a title. The server reads the title off
// the note (frontmatter `title:`, `presence: false`, the excluded tags) and
// judges it; a title made here would be one the policy had not seen.

import type { PresenceKind, PresenceReport } from "../../shared/presence/types.ts";
import { activeTabOf, orbitsSessionOf, paneAt, surfaceOf, type Workspace } from "../workspace.ts";

/** The implicit "everything else" deck (shared/decks.ts EVERYTHING_ELSE):
 *  a deck with no note behind it, so no path to send. Written out rather than
 *  imported so this chunk does not carry the deck parser for one string. */
const IMPLICIT_DECK = "*";

/** The slices of the store a report is made from, plus what the reporter
 *  keeps itself (the tab's id, the cards left, when the tab was hidden). */
export interface PresenceInputs {
  workspace: Workspace;
  readingMode: boolean;
  /** This tab's id (./report.ts `clientId`). */
  client: string;
  /** client/presence/orbitsLeft.ts: the session on screen, or null. */
  cardsLeft: number | null;
  /** When the tab was hidden, or null while it is visible. A hidden tab
   *  counts as idle from that moment, whatever input it saw before. */
  hiddenAt: number | null;
}

/** The kind and subject of what is in front of the reader. */
export function subjectOf(ws: Workspace, readingMode: boolean): { kind: PresenceKind; path?: string; deck?: true } {
  const pane = paneAt(ws, ws.focus);
  if (pane === null) return { kind: "browsing" };
  const tab = activeTabOf(pane);
  // A FOLLOWER pane holds no tabs and renders the note-focus pane's note; the
  // reader in it is in that note.
  const followed = pane.follow === "note" ? paneAt(ws, ws.noteFocus) : null;
  const path = tab?.path ?? (followed ? activeTabOf(followed)?.path : undefined);
  switch (surfaceOf(pane)) {
    case "edit":
      return path === undefined ? { kind: "browsing" } : { kind: readingMode ? "reading" : "writing", path };
    case "reading":
      return path === undefined ? { kind: "browsing" } : { kind: "reading", path };
    case "book":
      return path === undefined ? { kind: "browsing" } : { kind: "book", path };
    case "drawing":
      return path === undefined ? { kind: "drawing" } : { kind: "drawing", path };
    case "orbits": {
      // The shelf without a session is browsing; a session is studying, with
      // the deck as its subject unless it is the deck with no note.
      const session = tab ? orbitsSessionOf(tab.path) : null;
      if (session === null) return { kind: "browsing" };
      return session.path === IMPLICIT_DECK || session.path === "" ? { kind: "orbits", deck: true } : { kind: "orbits", path: session.path, deck: true };
    }
    case "library":
    case "media":
      return { kind: "library" };
    default:
      return { kind: "browsing" };
  }
}

/** The report this tab would send now. `lastInput` and `now` are ms on one
 *  clock (the tab's); the server only ever sees their difference. */
export function deriveReport(s: PresenceInputs, lastInput: number, now: number): PresenceReport {
  const subject = subjectOf(s.workspace, s.readingMode);
  const since = s.hiddenAt === null ? lastInput : Math.min(lastInput, s.hiddenAt);
  const report: PresenceReport = { client: s.client, kind: subject.kind, idleMs: Math.max(0, Math.round(now - since)) };
  if (subject.path !== undefined) report.path = subject.path;
  if (subject.deck && s.cardsLeft !== null) report.cardsLeft = s.cardsLeft;
  return report;
}

/** Whether two reports say something different to Discord — the heartbeat's
 *  `idleMs` aside, which changes on every call and is the heartbeat's job. */
export function sameSubject(a: PresenceReport | null, b: PresenceReport): boolean {
  return a !== null && a.kind === b.kind && a.path === b.path && a.cardsLeft === b.cardsLeft;
}

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Sixteen characters of [A-Za-z0-9] from the given random bytes. */
export function mintClientId(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < 16; i++) out += ID_ALPHABET[(bytes[i] ?? 0) % ID_ALPHABET.length];
  return out;
}
