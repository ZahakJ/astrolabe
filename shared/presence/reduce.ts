// Many tabs, one presence. Every open admin tab reports what it is showing;
// Discord can show one thing, and the honest one is whatever the reader last
// TOUCHED — not the last tab to post, which is usually a background tab's
// heartbeat. Pure, so the idle crossing and the subject timer are tested
// with a hand-held clock.

import { PRESENCE_STALE_MS } from "./config.ts";
import { isPresenceKind, PRESENCE_KINDS, type Activity, type HeldReport, type PresenceEffective, type PresenceReport } from "./types.ts";

const CLIENT_RE = /^[A-Za-z0-9_-]{8,64}$/;
const PATH_MAX = 1000;
const TITLE_MAX = 200;

export function holdReport(report: PresenceReport, receivedAt: number): HeldReport {
  return { report, receivedAt, activeAt: receivedAt - report.idleMs };
}

/** The body of `POST /api/presence`, or the sentence naming its first
 *  problem. Absolute and climbing paths are refused here rather than
 *  trusted later: the path is only ever looked up, but a lookup key that
 *  could name something outside the vault has no business in the table. */
export function validateReport(body: unknown): PresenceReport | string {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return "The report must be a JSON object.";
  const b = body as Record<string, unknown>;
  if (typeof b.client !== "string" || !CLIENT_RE.test(b.client)) {
    return "client must be 8 to 64 letters, digits, dashes or underscores.";
  }
  if (!isPresenceKind(b.kind)) return `kind must be one of: ${PRESENCE_KINDS.join(", ")}.`;
  const out: PresenceReport = { client: b.client, kind: b.kind, idleMs: 0 };
  if (b.path !== undefined) {
    const p = b.path;
    if (typeof p !== "string" || p === "" || p.length > PATH_MAX) return `path must be a non-empty string of at most ${PATH_MAX} characters.`;
    if (p.includes("\0")) return "path must not contain a NUL character.";
    if (p.startsWith("/") || p.startsWith("\\") || /^[A-Za-z]:/.test(p)) return "path must be relative to the vault.";
    if (p.split(/[/\\]/).includes("..")) return "path must not climb out of the vault.";
    out.path = p;
  }
  if (b.title !== undefined) {
    if (typeof b.title !== "string" || b.title.length > TITLE_MAX) return `title must be a string of at most ${TITLE_MAX} characters.`;
    out.title = b.title;
  }
  if (b.cardsLeft !== undefined) {
    const n = b.cardsLeft;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 100_000) return "cardsLeft must be a whole number from 0 to 100000.";
    out.cardsLeft = n;
  }
  const idle = b.idleMs;
  if (typeof idle !== "number" || !Number.isInteger(idle) || idle < 0 || idle > 1e9) {
    return "idleMs must be a whole number of milliseconds from 0 to 1000000000.";
  }
  out.idleMs = idle;
  return out;
}

function subjectKey(kind: string, subject: Activity["subject"]): string {
  return `${kind}\u0000${subject === null ? "" : (subject.path ?? `title:${subject.title}`)}`;
}

/** The title a path stands for before the indexer is asked: its file name.
 *  The host replaces it with the note's own title when the note is known. */
function fallbackTitle(path: string): string {
  const last = path.split(/[/\\]/).pop() ?? path;
  return last.replace(/\.(excalidraw\.md|md|tex|latex|pdf|epub|excalidraw)$/i, "");
}

export function reduceReports(
  held: Iterable<HeldReport>,
  now: number,
  settings: PresenceEffective,
  prev: Activity | null,
  sessionSince: number,
): Activity | null {
  let best: HeldReport | null = null;
  for (const h of held) {
    if (now - h.receivedAt > PRESENCE_STALE_MS) continue;
    if (best === null || h.activeAt > best.activeAt) best = h;
  }
  if (best === null) return null;
  if (now - best.activeAt >= settings.idleMinutes * 60_000) {
    if (settings.idle === "clear") return null;
    const since = prev !== null && prev.kind === "idle" ? prev.subjectSince : now;
    return { kind: "idle", subject: null, cardsLeft: null, subjectSince: since, sessionSince };
  }
  const r = best.report;
  const subject =
    r.path !== undefined
      ? { path: r.path, title: r.title ?? fallbackTitle(r.path) }
      : r.title !== undefined
        ? { path: null, title: r.title }
        : null;
  const same = prev !== null && subjectKey(prev.kind, prev.subject) === subjectKey(r.kind, subject);
  return {
    kind: r.kind,
    subject,
    cardsLeft: r.cardsLeft ?? null,
    subjectSince: same ? prev.subjectSince : now,
    sessionSince,
  };
}
