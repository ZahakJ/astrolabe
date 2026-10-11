// The presence HOST: every admin tab's report in, one Discord activity out
// (docs/plans/discord-presence.md, "Architecture"). Reduce → policy → render
// is the shared core; what lives here is the table, the clock, the facts the
// policy asks about a note, and the choice of ONE sink — so the same activity
// is never sent to Discord twice:
//
//   · a parent process (the desktop app, which always runs where Discord
//     runs) gets every change over IPC and owns the socket;
//   · else, with `settings.presence.server` on, this process speaks to a
//     Discord on its own machine;
//   · else nothing leaves at all.
//
// Settings are read on every tick rather than cached: the owner flips the
// mode or pastes an id in Settings, and the next tick obeys.

import { PRESENCE_STALE_MS, PRESENCE_TICK_MS } from "../../shared/presence/config.ts";
import { applyPolicy } from "../../shared/presence/policy.ts";
import { holdReport, reduceReports } from "../../shared/presence/reduce.ts";
import { renderActivity, sameActivity, vaultNameOf } from "../../shared/presence/render.ts";
import type {
  Activity,
  DiscordActivity,
  HeldReport,
  PresenceConnection,
  PresenceEffective,
  PresenceReport,
  PresenceStatus,
  PresenceToParent,
} from "../../shared/presence/types.ts";
import { notes } from "../indexer.ts";
import { getSettings } from "../settings.ts";
import { excludedTags, publicLayout, siteLanguage, siteUrl } from "../site.ts";
import { getVaultRoot } from "../vault.ts";
import { DiscordIpcClient } from "./discordIpc.ts";
import { presenceEffective } from "./settings.ts";

/** Where a changed activity goes. Injectable so a test can stand where the
 *  desktop parent would and read what it would have been told. */
export type PresenceSink = (clientId: string | null, activity: DiscordActivity | null) => void;

export interface PresenceOptions {
  sink?: PresenceSink;
  now?: () => number;
}

let held = new Map<string, HeldReport>();
let prev: Activity | null = null;
let sessionSince = 0;
let told: { clientId: string | null; activity: DiscordActivity | null } | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let injected: PresenceSink | null = null;
let clock: () => number = Date.now;
let parentConnection: PresenceConnection = "searching";
let local: DiscordIpcClient | null = null;

export { isPresenceFromParent } from "../../shared/presence/messages.ts";

export function initPresence(opts: PresenceOptions = {}): void {
  if (timer !== null) clearInterval(timer);
  injected = opts.sink ?? null;
  clock = opts.now ?? Date.now;
  held = new Map();
  prev = null;
  told = null;
  sessionSince = clock();
  parentConnection = "searching";
  timer = setInterval(tick, PRESENCE_TICK_MS);
  timer.unref?.();
  tick();
}

export function setParentConnection(c: PresenceConnection): void {
  parentConnection = c;
}

export function reportPresence(report: PresenceReport, now = clock()): void {
  held.set(report.client, holdReport(report, now));
  tick(now);
}

function settings(): PresenceEffective {
  return presenceEffective(getSettings().presence);
}

function viaParent(): boolean {
  return injected !== null || typeof process.send === "function";
}

/** What the policy may know about a note — never more than two booleans. */
function facts(path: string): { optOut: boolean; excluded: boolean } {
  const record = notes.get(path);
  if (record === undefined) return { optOut: false, excluded: false };
  const optOut = (record.props.presence ?? "").trim().toLowerCase() === "false";
  const ex = [...excludedTags()].map((t) => t.replace(/^#/, "").toLowerCase());
  const excluded = record.tags.some((tag) => {
    const t = tag.replace(/^#/, "").toLowerCase();
    return ex.some((e) => e !== "" && (t === e || t.startsWith(`${e}/`)));
  });
  return { optOut, excluded };
}

/** The reducer names a subject by its file; the note's own title is better. */
function withTitles(activity: Activity | null): Activity | null {
  const path = activity?.subject?.path;
  if (activity === null || activity.subject === null || path === null || path === undefined) return activity;
  const record = notes.get(path);
  if (record === undefined || record.title.trim() === "") return activity;
  return { ...activity, subject: { path, title: record.title } };
}

function render(s: PresenceEffective, now: number): DiscordActivity | null {
  for (const [client, h] of held) if (now - h.receivedAt > PRESENCE_STALE_MS) held.delete(client);
  prev = withTitles(reduceReports(held.values(), now, s, prev, sessionSince));
  if (s.mode === "off" || s.clientId === null) return null;
  const pub = applyPolicy(prev, s, facts);
  if (pub === null) return null;
  let root: string | null = null;
  try {
    root = getVaultRoot();
  } catch {
    root = null;
  }
  return renderActivity(pub, {
    lang: siteLanguage(),
    vaultName: root === null ? null : vaultNameOf(root) || null,
    siteUrl: siteUrl(),
    publicLayout: publicLayout(),
    settings: s,
  });
}

function tick(now = clock()): void {
  const s = settings();
  const activity = render(s, now);
  const clientId = s.mode === "off" ? null : s.clientId;
  if (viaParent()) {
    dropLocal();
    if (told !== null && told.clientId === clientId && sameActivity(told.activity, activity)) return;
    told = { clientId, activity };
    if (injected !== null) injected(clientId, activity);
    else if (process.connected) {
      const msg: PresenceToParent = { type: "astrolabe:presence", clientId, activity };
      process.send?.(msg);
    }
    return;
  }
  if (s.server && clientId !== null) {
    if (local === null) {
      local = new DiscordIpcClient({ clientId, pid: process.pid });
      local.start();
    } else if (local.id !== clientId) local.setClientId(clientId);
    local.setActivity(activity);
    told = { clientId, activity };
    return;
  }
  dropLocal();
  told = { clientId, activity: null };
}

function dropLocal(): void {
  if (local === null) return;
  const gone = local;
  local = null;
  void gone.stop();
}

export function presenceStatus(now = clock()): PresenceStatus {
  const s = settings();
  const enabled = s.mode !== "off" && s.clientId !== null;
  const host = viaParent() ? "desktop" : enabled && s.server ? "server" : "none";
  let clients = 0;
  for (const h of held.values()) if (now - h.receivedAt <= PRESENCE_STALE_MS) clients++;
  return {
    enabled,
    mode: s.mode,
    applicationId: s.clientId === null ? "placeholder" : "set",
    host,
    connection: !enabled ? "off" : host === "desktop" ? parentConnection : (local?.connection ?? "off"),
    clients,
    activity: told?.activity ?? null,
  };
}

/** Clear what Discord shows and close the socket. Never throws. */
export async function stopPresence(): Promise<void> {
  if (timer !== null) clearInterval(timer);
  timer = null;
  held.clear();
  try {
    if (injected !== null) {
      if (told?.activity) injected(told.clientId, null);
    } else if (typeof process.send === "function" && process.connected && told?.activity) {
      const msg: PresenceToParent = { type: "astrolabe:presence", clientId: told.clientId, activity: null };
      process.send(msg);
    }
  } catch {
    // A parent already gone is the usual reason we are stopping.
  }
  told = null;
  const client = local;
  local = null;
  if (client !== null) await client.stop();
}
