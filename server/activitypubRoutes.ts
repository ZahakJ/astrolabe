// The fediverse's doors (docs/webmentions.md, server/activitypub.ts).
//
// Mounted at the site's root from server/index.ts with one line: these are
// the addresses other servers know, not part of the JSON API. Every one of
// them answers only while Settings → Publishing → Fediverse is ON; off, each
// falls through to whatever the site would have answered without the feature
// (the SPA's not-found, or a 404 for the inbox).
//
//   GET  /.well-known/webfinger?resource=acct:handle@host   JRD
//   GET  /.well-known/nodeinfo  ·  GET /nodeinfo/2.1         NodeInfo
//   GET  /actor                  the actor (for an ActivityPub Accept only —
//                                a browser falls through to the site)
//   GET  /actor/outbox[?page=n]  Create activities, newest first
//   GET  /actor/followers        a count, never a list
//   GET  /actor/following        empty
//   POST /actor/inbox            signed activities (HTTP Signatures)
//   GET  /<page> with an ActivityPub Accept: that page as its object, when
//        it is federable — how a pasted link resolves in Mastodon's search,
//        and how a reply's `inReplyTo` is fetched.

import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { clientIp } from "./auth.ts";
import {
  AP_CONTENT_TYPE,
  actorDocument,
  followersCollection,
  followingCollection,
  handleActivity,
  nodeinfo,
  nodeinfoLinks,
  objectForPath,
  outbox,
  parseSignatureHeader,
  remoteActor,
  SignatureError,
  verifySignature,
  webfinger,
} from "./activitypub.ts";
import { requestOrigin } from "./blog.ts";
import { pathForUrl, publicOrigin, rememberOrigin } from "./federation.ts";
import { RetryLater } from "./jobQueue.ts";
import { FetchRefused } from "./safeFetch.ts";
import { fediverseEffective } from "./settings.ts";

const AP_JSON = `${AP_CONTENT_TYPE}; charset=utf-8`;

function on(): boolean {
  return fediverseEffective().enabled;
}

/** The site's address as other servers know it (SITE_URL, else this
 *  request's), remembered for the background deliveries. */
function originOf(c: Context): string {
  const seen = requestOrigin(c);
  rememberOrigin(seen);
  return publicOrigin() ?? seen;
}

function wantsActivity(c: Context): boolean {
  const accept = c.req.header("accept") ?? "";
  return /application\/activity\+json|application\/ld\+json/i.test(accept);
}

function ap(c: Context, body: unknown, status = 200) {
  return c.body(JSON.stringify(body), status as 200, {
    "Content-Type": AP_JSON,
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*",
    Vary: "Accept",
  });
}

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120;
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

export const activitypubPublic = new Hono();

activitypubPublic.get("/.well-known/webfinger", (c) => {
  if (!on()) return c.json({ error: "Not found" }, 404);
  const resource = c.req.query("resource") ?? "";
  const jrd = resource === "" ? null : webfinger(resource, originOf(c));
  if (jrd === null) return c.json({ error: "Not found" }, 404);
  return c.body(JSON.stringify(jrd), 200, {
    "Content-Type": "application/jrd+json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-cache",
  });
});

activitypubPublic.get("/.well-known/nodeinfo", (c) => {
  if (!on()) return c.json({ error: "Not found" }, 404);
  return c.json(nodeinfoLinks(originOf(c)), 200, { "Access-Control-Allow-Origin": "*" });
});

activitypubPublic.get("/nodeinfo/2.1", (c) => {
  if (!on()) return c.json({ error: "Not found" }, 404);
  return c.body(JSON.stringify(nodeinfo()), 200, {
    "Content-Type": 'application/json; profile="http://nodeinfo.diaspora.software/ns/schema/2.1#"; charset=utf-8',
    "Access-Control-Allow-Origin": "*",
  });
});

activitypubPublic.get("/actor", (c, next) => {
  if (!on() || !wantsActivity(c)) return next();
  return ap(c, actorDocument(originOf(c)));
});

activitypubPublic.get("/actor/outbox", async (c, next) => {
  if (!on()) return next();
  const raw = c.req.query("page");
  const page = raw === undefined ? null : Number(raw);
  if (page !== null && (!Number.isInteger(page) || page < 1 || page > 10_000)) return c.json({ error: "Bad page" }, 400);
  return ap(c, await outbox(originOf(c), page));
});

activitypubPublic.get("/actor/followers", (c, next) => {
  if (!on()) return next();
  return ap(c, followersCollection(originOf(c)));
});

activitypubPublic.get("/actor/following", (c, next) => {
  if (!on()) return next();
  return ap(c, followingCollection(originOf(c)));
});

activitypubPublic.post(
  "/actor/inbox",
  bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.json({ error: "Request body too large" }, 413) }),
  async (c) => {
    if (!on()) return c.json({ error: "Not found" }, 404);
    if (rateLimited(clientIp(c))) return c.json({ error: "Slow down" }, 429);
    const origin = originOf(c);
    const body = await c.req.text();
    let activity: Record<string, unknown>;
    try {
      const parsed = JSON.parse(body) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
      activity = parsed as Record<string, unknown>;
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    const sig = parseSignatureHeader(c.req.header("signature") ?? "");
    if (sig === null) return c.json({ error: "Signature required" }, 401);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(c.req.header())) headers[k.toLowerCase()] = v;
    const url = new URL(c.req.url);
    let actor;
    try {
      actor = await remoteActor(sig.keyId, origin);
    } catch (err) {
      // An account deleting itself signs with a key that is already gone.
      // Nothing it said can be checked; nothing is done.
      if (activity.type === "Delete" && err instanceof FetchRefused) return c.body(null, 202);
      if (err instanceof RetryLater) return c.json({ error: "Could not fetch the signing key" }, 503);
      return c.json({ error: "Unknown signing key" }, 401);
    }
    try {
      verifySignature(sig, "POST", url.pathname + url.search, headers, body, actor.pem);
    } catch (err) {
      // A key that rotated: ask once more, then give up.
      if (!(err instanceof SignatureError)) throw err;
      try {
        actor = await remoteActor(sig.keyId, origin, true);
        verifySignature(sig, "POST", url.pathname + url.search, headers, body, actor.pem);
      } catch {
        return c.json({ error: `Signature: ${err.message}` }, 401);
      }
    }
    try {
      await handleActivity(activity, actor, origin);
    } catch (err) {
      if (err instanceof RetryLater) return c.json({ error: "Try again later" }, 503);
      throw err;
    }
    return c.body(null, 202);
  },
);

/** Content negotiation for a page: its ActivityPub object. Registered last,
 *  so it only sees what nothing above answered. */
activitypubPublic.get("*", async (c, next) => {
  if (!on() || !wantsActivity(c) || c.req.path.startsWith("/api/")) return next();
  const origin = originOf(c);
  const notePath = pathForUrl(origin + c.req.path, origin);
  if (notePath === null) return next();
  const object = await objectForPath(notePath, origin);
  if (object === null) return next();
  return ap(c, object);
});
