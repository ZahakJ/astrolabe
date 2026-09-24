// The webmention doors (docs/webmentions.md, server/webmentions.ts).
//
// Two apps, mounted with one line each:
//
//   `webmentionPublic` (server/index.ts, at the site's root — the endpoint is
//   a public address other sites POST to, not part of the JSON API):
//     POST /webmention   form-encoded `source` and `target` (W3C §3.2)
//       → 202 queued · 400 with the reason · 404 when Accept webmentions is
//         off (a site without the feature) · 429 past the rate limit.
//
//   `webmentionApi` (server/api.ts, below the auth guard):
//     GET  /webmentions?path=        what other sites said about one note, as
//                                    comments with `kind` and `type`; visitors
//                                    get the approved ones of a federable note
//     GET  /webmentions/status       (admin) the Publishing tab's panels
//     POST /webmentions/:id/verify   (admin, by the guard) fetch the source
//                                    again: kept, refreshed or withdrawn
//
// And the advertisement every public page carries while accepting is on:
// `<link rel="webmention">` in the served head and a `Link:` header.

import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { FederationStatus } from "../shared/types.ts";
import { clientIp, isPublishLimited } from "./auth.ts";
import { deliveriesQueued, fediverseAddressFor, followerCount } from "./activitypub.ts";
import { requestOrigin } from "./blog.ts";
import { listInteractions, moderationEnabled } from "./comments.ts";
import { isFederable, publicOrigin, reconcile, rememberOrigin } from "./federation.ts";
import { isNotePublished } from "./indexer.ts";
import { webmentionsEffective } from "./settings.ts";
import { siteUrl } from "./site.ts";
import { normalizeRel, VaultError } from "./vault.ts";
import { acceptWebmention, sentMentions, verifyAgain, type ReceiveRefusal } from "./webmentions.ts";

// ── The advertisement ───────────────────────────────────────────────────────

/** The `<head>` tag, while accepting. */
export function webmentionHeadTags(origin: string): string[] {
  if (!webmentionsEffective().accept) return [];
  return [`<link rel="webmention" href="${origin}/webmention" />`];
}

/** The `Link:` header, while accepting; null otherwise. */
export function webmentionLinkHeader(origin: string): string | null {
  if (!webmentionsEffective().accept) return null;
  return `<${origin}/webmention>; rel="webmention"`;
}

// ── The endpoint ────────────────────────────────────────────────────────────

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 1000) {
    for (const [key, times] of hits) if (times.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(key);
  }
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

/** For the tests. */
export function resetWebmentionRateForTests(): void {
  hits.clear();
}

const REFUSALS: Record<ReceiveRefusal, [number, string]> = {
  off: [404, "Not found"],
  badSource: [400, "source must be an http(s) URL"],
  badTarget: [400, "target is not a published page of this site"],
  sameUrl: [400, "source and target are the same page"],
  busy: [429, "Too many mentions are waiting; try again later"],
};

export const webmentionPublic = new Hono();

webmentionPublic.post(
  "/webmention",
  bodyLimit({ maxSize: 8 * 1024, onError: (c) => c.text("Request body too large", 413) }),
  async (c) => {
    if (!webmentionsEffective().accept) return c.text("Not found", 404);
    const origin = requestOrigin(c);
    rememberOrigin(origin);
    if (rateLimited(clientIp(c))) return c.text("Slow down — try again in a minute", 429);
    const type = c.req.header("content-type") ?? "";
    if (!/application\/x-www-form-urlencoded|multipart\/form-data/i.test(type)) {
      return c.text("Send source and target form-encoded", 400);
    }
    const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    const source = typeof form.source === "string" ? form.source : "";
    const target = typeof form.target === "string" ? form.target : "";
    if (source === "" || target === "") return c.text("source and target are required", 400);
    const refusal = acceptWebmention(source, target, origin);
    if (refusal !== null) {
      const [status, message] = REFUSALS[refusal];
      return c.text(message, status as 400 | 404 | 429);
    }
    return c.text("Accepted: the mention will be verified, then moderated.", 202);
  },
);

// ── The API ─────────────────────────────────────────────────────────────────

export const webmentionApi = new Hono();

function adminOnly(c: Context): void {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
}

webmentionApi.get("/webmentions/status", (c) => {
  adminOnly(c);
  rememberOrigin(requestOrigin(c));
  // Opening the panel is a good moment to catch a switch just turned on.
  void reconcile();
  const origin = publicOrigin();
  const body: FederationStatus = {
    origin,
    originFixed: siteUrl() !== null,
    sent: sentMentions(),
    address: fediverseAddressFor(origin),
    followers: followerCount(),
    deliveriesQueued: deliveriesQueued(),
  };
  return c.json(body);
});

webmentionApi.get("/webmentions", (c) => {
  if (!moderationEnabled()) throw new VaultError(404, "Not found");
  const raw = c.req.query("path") ?? "";
  if (raw === "") throw new VaultError(400, 'Query parameter "path" is required');
  const notePath = normalizeRel(raw);
  const limited = isPublishLimited(c);
  // A visitor reads what other sites said only about a page this site talks
  // to other sites about; the admin reads any published note's.
  if (limited ? !isFederable(notePath) : !isNotePublished(notePath)) throw new VaultError(404, `Note not found: ${notePath}`);
  return c.json(listInteractions(notePath, !limited));
});

webmentionApi.post("/webmentions/:id/verify", async (c) => {
  adminOnly(c);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) throw new VaultError(400, "Invalid comment id");
  if (!moderationEnabled()) throw new VaultError(404, "Not found");
  return c.json({ outcome: await verifyAgain(id) });
});
