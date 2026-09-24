// THE FEDIVERSE, FOR ONE AUTHOR (docs/webmentions.md, ActivityPub).
//
// Behind Settings → Publishing → Fediverse, off by default, the blog is ONE
// ActivityPub actor — `@handle@host` — that Mastodon and its neighbours can
// find (WebFinger, NodeInfo), follow, and read:
//
//   · the actor at `/actor`: the site's name, tagline, logo and banner, and
//     an RSA key generated once into ASTROLABE_DATA/activitypub-key.pem
//     (0600). Every request this module sends is signed with it (HTTP
//     Signatures, rsa-sha256 over `(request-target) host date digest`), and
//     every activity it accepts must be signed by the key of the actor it
//     claims to come from;
//   · an outbox of the federable pages (server/federation.ts — the feed's
//     own list, scoped as the site speaks without a reader) as `Create`
//     activities: an `Article` with a title and a link, or a `Note` when the
//     post is short enough to be read whole in a timeline, each with its
//     language (`contentMap`);
//   · an inbox that takes Follow (accepted at once; the follower is kept in
//     ASTROLABE_DATA/activitypub.db), Undo Follow, Like and Announce (filed
//     in the comments store as `like` and `repost`, shown at once), a reply
//     (`Create` of a `Note` in reply to a page — filed as a `reply` awaiting
//     moderation), Undo of a Like or Announce, and Delete (what that actor's
//     activity filed is removed, and nothing else);
//   · deliveries: on publish a `Create` goes to every follower's inbox (the
//     shared inbox when the server offers one, so a thousand followers on
//     one server are one request), an `Update` on a republish that changed
//     the page, a `Delete` when it stops being federable. Queued in
//     activitypub.db, one at a time, three retries (server/jobQueue.ts).
//
// Object ids ARE the page URLs, so a Mastodon user who pastes a post's
// address into search gets the post (the content negotiation in
// server/activitypubRoutes.ts answers it), and a reply's `inReplyTo` names a
// page this module can resolve with the same rule webmentions use.

import { createHash, createPublicKey, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { FEDIVERSE_NOTE_MAX, fediverseAddress } from "../shared/fediverse.ts";
import { normalizeUrl } from "../shared/mentions.ts";
import { splitFrontmatter } from "../shared/noteParse.ts";
import { stripMarkdown } from "../shared/prose.ts";
import { escapeHtml } from "../shared/snippet.ts";
import type { PostMeta } from "../shared/types.ts";
import { addInteraction, ensureInteractionsStore, removeByRef } from "./comments.ts";
import { addPublishListener, federablePosts, pageUrl, pathForUrl, publicOrigin, type LedgerRow, type PageState } from "./federation.ts";
import { JobQueue, RetryLater, type JobRow } from "./jobQueue.ts";
import { FetchRefused, safeFetch } from "./safeFetch.ts";
import { fediverseEffective, getSettings, VERSION } from "./settings.ts";
import { dataDir, siteLanguage, siteName, tagline } from "./site.ts";
import { readNote } from "./vault.ts";

export const AS_CONTEXT = "https://www.w3.org/ns/activitystreams";
export const AS_PUBLIC = "https://www.w3.org/ns/activitystreams#Public";
export const AP_CONTENT_TYPE = "application/activity+json";
const AP_ACCEPT = 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"';
/** How far a signed request's Date may be from ours. */
const SIGNATURE_SKEW_MS = 12 * 60 * 60 * 1000;
/** A remote actor's key and inbox are asked again after a day. */
const ACTOR_CACHE_MS = 24 * 60 * 60 * 1000;
export const OUTBOX_PAGE = 20;

// ── The store ───────────────────────────────────────────────────────────────

let db: DatabaseSync | null = null;
let dbFile: string | null = null;
let keyFile: string | null = null;
let queue: JobQueue | null = null;
let unlisten: (() => void) | null = null;

function store(): DatabaseSync {
  if (db) return db;
  const file = dbFile ?? path.join(dataDir(), "activitypub.db");
  mkdirSync(path.dirname(file), { recursive: true });
  const opened = new DatabaseSync(file);
  opened.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS followers (
      actor       TEXT PRIMARY KEY,
      inbox       TEXT NOT NULL,
      sharedInbox TEXT,
      followedMs  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS actors (
      id          TEXT PRIMARY KEY,
      inbox       TEXT NOT NULL,
      sharedInbox TEXT,
      name        TEXT NOT NULL,
      url         TEXT,
      icon        TEXT,
      keyId       TEXT NOT NULL,
      pem         TEXT NOT NULL,
      fetchedMs   INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS posts (
      path     TEXT PRIMARY KEY,
      hash     TEXT NOT NULL,
      mtimeMs  REAL NOT NULL,
      objectId TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  db = opened;
  queue = new JobQueue({ db: opened, table: "deliveries", run: runDelivery });
  return opened;
}

function deliveries(): JobQueue {
  store();
  return queue!;
}

// ── The key ─────────────────────────────────────────────────────────────────

interface KeyPair {
  privatePem: string;
  publicPem: string;
}

let keys: KeyPair | null = null;

/** The actor's key, generated once and kept. */
export function actorKeys(): KeyPair {
  if (keys) return keys;
  const file = keyFile ?? path.join(dataDir(), "activitypub-key.pem");
  if (!existsSync(file)) {
    const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, pair.privateKey.export({ type: "pkcs8", format: "pem" }) as string, { mode: 0o600 });
    try {
      chmodSync(file, 0o600);
    } catch {
      /* a filesystem without modes */
    }
  }
  const privatePem = readFileSync(file, "utf8");
  const publicPem = createPublicKey(privatePem).export({ type: "spki", format: "pem" }) as string;
  keys = { privatePem, publicPem };
  return keys;
}

// ── Addresses ───────────────────────────────────────────────────────────────

export function actorId(origin: string): string {
  return `${origin}/actor`;
}

function imageUrl(ref: string | undefined, origin: string): string | null {
  if (!ref) return null;
  if (/^https:\/\//i.test(ref)) return ref;
  return `${origin}/api/file?path=${encodeURIComponent(ref)}`;
}

// ── HTTP Signatures ─────────────────────────────────────────────────────────

export function digestOf(body: string): string {
  return `SHA-256=${createHash("sha256").update(body).digest("base64")}`;
}

/** The headers a signed request carries: Host, Date, Digest (with a body)
 *  and the Signature over them. */
export function signRequest(method: "GET" | "POST", url: string, body: string | null, keyId: string, privatePem: string, now = new Date()): Record<string, string> {
  const u = new URL(url);
  const headers: Record<string, string> = { Host: u.host, Date: now.toUTCString() };
  const names = ["(request-target)", "host", "date"];
  if (body !== null) {
    headers.Digest = digestOf(body);
    names.push("digest");
  }
  const lines = names.map((name) =>
    name === "(request-target)" ? `(request-target): ${method.toLowerCase()} ${u.pathname}${u.search}` : `${name}: ${headers[name[0].toUpperCase() + name.slice(1)]}`,
  );
  const signature = cryptoSign("sha256", Buffer.from(lines.join("\n")), privatePem).toString("base64");
  headers.Signature = `keyId="${keyId}",algorithm="rsa-sha256",headers="${names.join(" ")}",signature="${signature}"`;
  return headers;
}

export interface ParsedSignature {
  keyId: string;
  headers: string[];
  signature: string;
}

export function parseSignatureHeader(value: string): ParsedSignature | null {
  const fields: Record<string, string> = {};
  for (const m of value.matchAll(/([a-zA-Z]+)="([^"]*)"/g)) fields[m[1]] = m[2];
  if (!fields.keyId || !fields.signature) return null;
  const algorithm = (fields.algorithm ?? "rsa-sha256").toLowerCase();
  if (algorithm !== "rsa-sha256" && algorithm !== "hs2019") return null;
  return { keyId: fields.keyId, headers: (fields.headers ?? "date").toLowerCase().split(/\s+/), signature: fields.signature };
}

export class SignatureError extends Error {}

/** Check a request's signature against `pem`. Throws SignatureError with the
 *  reason; returns when the signature holds. `headers` are lowercased. */
export function verifySignature(
  sig: ParsedSignature,
  method: string,
  pathAndQuery: string,
  headers: Record<string, string>,
  body: string | null,
  pem: string,
  now = Date.now(),
): void {
  if (method.toUpperCase() === "POST") {
    if (!sig.headers.includes("digest")) throw new SignatureError("digest not signed");
    if (!headers.digest || body === null || headers.digest !== digestOf(body)) throw new SignatureError("digest mismatch");
  }
  if (!sig.headers.includes("date") && !sig.headers.includes("(created)")) throw new SignatureError("date not signed");
  const date = Date.parse(headers.date ?? "");
  if (!Number.isFinite(date) || Math.abs(now - date) > SIGNATURE_SKEW_MS) throw new SignatureError("date out of range");
  const lines: string[] = [];
  for (const name of sig.headers) {
    if (name === "(request-target)") lines.push(`(request-target): ${method.toLowerCase()} ${pathAndQuery}`);
    else if (headers[name] !== undefined) lines.push(`${name}: ${headers[name]}`);
    else throw new SignatureError(`signed header ${name} missing`);
  }
  let ok = false;
  try {
    ok = cryptoVerify("sha256", Buffer.from(lines.join("\n")), pem, Buffer.from(sig.signature, "base64"));
  } catch {
    ok = false;
  }
  if (!ok) throw new SignatureError("signature does not verify");
}

// ── Remote actors ───────────────────────────────────────────────────────────

export interface RemoteActor {
  id: string;
  inbox: string;
  sharedInbox: string | null;
  name: string;
  url: string | null;
  icon: string | null;
  keyId: string;
  pem: string;
}

/** GET an ActivityPub document, signed (servers in "secure mode" ask). */
async function fetchAp(url: string, origin: string): Promise<Record<string, unknown>> {
  const k = actorKeys();
  const signed = signRequest("GET", url, null, `${actorId(origin)}#main-key`, k.privatePem);
  const res = await safeFetch(url, { headers: { ...signed, Accept: AP_ACCEPT }, maxBytes: 512 * 1024 });
  if (res.status === 410 || res.status === 404) throw new FetchRefused(`gone (${res.status})`);
  if (res.status >= 400) throw new RetryLater(`answered ${res.status}`);
  try {
    const parsed = JSON.parse(res.body) as unknown;
    if (typeof parsed !== "object" || parsed === null) throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new FetchRefused("not JSON");
  }
}

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

function firstUrl(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return firstUrl(v[0]);
  if (typeof v === "object" && v !== null) return str((v as Record<string, unknown>).url) ?? str((v as Record<string, unknown>).href);
  return null;
}

function idOf(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null) return str((v as Record<string, unknown>).id);
  return null;
}

/** The actor behind a key (or an actor id), from the cache or the network. */
export async function remoteActor(keyOrActor: string, origin: string, fresh = false): Promise<RemoteActor> {
  const bare = keyOrActor.split("#")[0];
  const cached = store()
    .prepare("SELECT * FROM actors WHERE id = ? OR keyId = ?")
    .get(bare, keyOrActor) as unknown as (RemoteActor & { fetchedMs: number }) | undefined;
  if (cached && !fresh && Date.now() - cached.fetchedMs < ACTOR_CACHE_MS) return cached;
  let doc = await fetchAp(bare, origin);
  // A key document that names its owner: fetch the owner.
  if (str(doc.owner) && !str(doc.inbox)) doc = await fetchAp(str(doc.owner)!, origin);
  const id = str(doc.id);
  const inbox = str(doc.inbox);
  const keysField = Array.isArray(doc.publicKey) ? doc.publicKey : [doc.publicKey];
  const key = (keysField as unknown[]).find((k) => typeof k === "object" && k !== null && (str((k as Record<string, unknown>).id) === keyOrActor || !keyOrActor.includes("#"))) as Record<string, unknown> | undefined;
  const pem = key ? str(key.publicKeyPem) : null;
  if (!id || !inbox || !pem || !key) throw new FetchRefused("not an actor with a key");
  if (key.owner !== undefined && str(key.owner) !== id) throw new FetchRefused("key owned by another actor");
  const endpoints = (doc.endpoints ?? {}) as Record<string, unknown>;
  const actor: RemoteActor = {
    id,
    inbox,
    sharedInbox: str(endpoints.sharedInbox),
    name: (str(doc.name) ?? str(doc.preferredUsername) ?? id).slice(0, 80),
    url: firstUrl(doc.url) ?? id,
    icon: firstUrl(doc.icon),
    keyId: str(key.id) ?? `${id}#main-key`,
    pem,
  };
  store()
    .prepare("INSERT OR REPLACE INTO actors (id, inbox, sharedInbox, name, url, icon, keyId, pem, fetchedMs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(actor.id, actor.inbox, actor.sharedInbox, actor.name, actor.url, actor.icon, actor.keyId, actor.pem, Date.now());
  return actor;
}

/** For the tests: an actor known without the network. */
export function rememberActorForTests(actor: RemoteActor): void {
  store()
    .prepare("INSERT OR REPLACE INTO actors (id, inbox, sharedInbox, name, url, icon, keyId, pem, fetchedMs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(actor.id, actor.inbox, actor.sharedInbox, actor.name, actor.url, actor.icon, actor.keyId, actor.pem, Date.now());
}

// ── Documents ───────────────────────────────────────────────────────────────

/** The actor document. */
export function actorDocument(origin: string): Record<string, unknown> {
  const id = actorId(origin);
  const s = getSettings();
  const icon = imageUrl(s.logo ?? s.favicon, origin);
  const banner = imageUrl(s.home?.banner, origin);
  const about = tagline();
  return {
    "@context": [AS_CONTEXT, "https://w3id.org/security/v1"],
    id,
    type: "Person",
    preferredUsername: fediverseEffective().handle,
    name: siteName(),
    ...(about ? { summary: `<p>${escapeHtml(about)}</p>` } : {}),
    url: `${origin}/`,
    inbox: `${id}/inbox`,
    outbox: `${id}/outbox`,
    followers: `${id}/followers`,
    following: `${id}/following`,
    endpoints: { sharedInbox: `${id}/inbox` },
    manuallyApprovesFollowers: false,
    discoverable: true,
    ...(icon ? { icon: { type: "Image", url: icon } } : {}),
    ...(banner ? { image: { type: "Image", url: banner } } : {}),
    publicKey: { id: `${id}#main-key`, owner: id, publicKeyPem: actorKeys().publicPem },
  };
}

/** WebFinger's answer for `resource`, or null when it names nobody here. */
export function webfinger(resource: string, origin: string): Record<string, unknown> | null {
  const host = new URL(origin).host.toLowerCase();
  const handle = fediverseEffective().handle;
  const id = actorId(origin);
  const r = resource.trim();
  const acct = /^acct:@?([^@]+)@(.+)$/i.exec(r);
  const matches = acct
    ? acct[1].toLowerCase() === handle && acct[2].toLowerCase() === host
    : r === id || r === `${origin}/` || r === origin;
  if (!matches) return null;
  return {
    subject: `acct:${handle}@${host}`,
    aliases: [id, `${origin}/`],
    links: [
      { rel: "self", type: AP_CONTENT_TYPE, href: id },
      { rel: "http://webfinger.net/rel/profile-page", type: "text/html", href: `${origin}/` },
    ],
  };
}

export function nodeinfoLinks(origin: string): Record<string, unknown> {
  return { links: [{ rel: "http://nodeinfo.diaspora.software/ns/schema/2.1", href: `${origin}/nodeinfo/2.1` }] };
}

export function nodeinfo(): Record<string, unknown> {
  return {
    version: "2.1",
    software: { name: "astrolabe", version: VERSION, repository: "https://github.com/ZahakJ/astrolabe" },
    protocols: ["activitypub"],
    services: { inbound: [], outbound: ["rss2.0"] },
    openRegistrations: false,
    usage: { users: { total: 1, activeMonth: 1, activeHalfyear: 1 }, localPosts: federablePosts().length },
    metadata: { nodeName: siteName() },
  };
}

/** The language a post is written in: Arabic when Arabic letters are 40% of
 *  its letters (the language filter's own threshold), else English; the
 *  site's language when it has no letters at all. */
export function postLanguage(text: string): "ar" | "en" {
  let letters = 0;
  let arabic = 0;
  for (const ch of text) {
    if (!/\p{L}/u.test(ch)) continue;
    letters++;
    if (/[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(ch)) arabic++;
  }
  if (letters === 0) return siteLanguage();
  return arabic / letters >= 0.4 ? "ar" : "en";
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p !== "")
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("");
}

/** A post as an ActivityPub object: its id is its page. */
export async function objectFor(post: PostMeta, origin: string, updated: string | null = null): Promise<Record<string, unknown>> {
  const url = pageUrl(post.path, origin);
  let text = post.excerpt;
  try {
    text = stripMarkdown(splitFrontmatter((await readNote(post.path)).content).body).trim();
  } catch {
    /* the excerpt stands */
  }
  const lang = postLanguage(text || post.title);
  const link = `<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`;
  const short = text.length <= FEDIVERSE_NOTE_MAX;
  const content = short ? `${paragraphs(text)}${link}` : `<p>${escapeHtml(post.excerpt)}</p>${link}`;
  const banner = post.banner ? imageUrl(post.banner, origin) : null;
  return {
    id: url,
    type: short ? "Note" : "Article",
    ...(short ? {} : { name: post.title }),
    attributedTo: actorId(origin),
    url,
    published: new Date(post.date).toISOString(),
    ...(updated ? { updated } : {}),
    to: [AS_PUBLIC],
    cc: [`${actorId(origin)}/followers`],
    content,
    contentMap: { [lang]: content },
    ...(banner ? { attachment: [{ type: "Image", mediaType: mediaTypeOf(banner), url: banner, name: post.title }] } : {}),
    tag: post.tags.map((t) => ({ type: "Hashtag", name: `#${t}`, href: `${origin}/topic/${encodeURIComponent(t)}` })),
  };
}

function mediaTypeOf(url: string): string {
  const ext = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase();
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : ext === "avif" ? "image/avif" : "image/jpeg";
}

function createOf(object: Record<string, unknown>, origin: string): Record<string, unknown> {
  return {
    id: `${String(object.id)}#create`,
    type: "Create",
    actor: actorId(origin),
    published: object.published,
    to: object.to,
    cc: object.cc,
    object,
  };
}

/** The outbox: an OrderedCollection whose pages carry Create activities,
 *  newest first. */
export async function outbox(origin: string, page: number | null): Promise<Record<string, unknown>> {
  const id = `${actorId(origin)}/outbox`;
  const all = federablePosts();
  if (page === null) {
    return { "@context": AS_CONTEXT, id, type: "OrderedCollection", totalItems: all.length, first: `${id}?page=1`, last: `${id}?page=${Math.max(1, Math.ceil(all.length / OUTBOX_PAGE))}` };
  }
  const slice = all.slice((page - 1) * OUTBOX_PAGE, page * OUTBOX_PAGE);
  const items = [];
  for (const post of slice) items.push(createOf(await objectFor(post, origin), origin));
  return {
    "@context": AS_CONTEXT,
    id: `${id}?page=${page}`,
    type: "OrderedCollectionPage",
    partOf: id,
    ...(page * OUTBOX_PAGE < all.length ? { next: `${id}?page=${page + 1}` } : {}),
    ...(page > 1 ? { prev: `${id}?page=${page - 1}` } : {}),
    orderedItems: items,
  };
}

/** The followers collection: how many, never who — a follower list is a
 *  portrait of an audience, and the owner sees the count in Settings. */
export function followersCollection(origin: string): Record<string, unknown> {
  return { "@context": AS_CONTEXT, id: `${actorId(origin)}/followers`, type: "OrderedCollection", totalItems: followerCount() };
}

export function followingCollection(origin: string): Record<string, unknown> {
  return { "@context": AS_CONTEXT, id: `${actorId(origin)}/following`, type: "OrderedCollection", totalItems: 0, orderedItems: [] };
}

/** The object a page's URL names, for content negotiation — null when the
 *  page is not federable. */
export async function objectForPath(notePath: string, origin: string): Promise<Record<string, unknown> | null> {
  const post = federablePosts().find((p) => p.path === notePath);
  if (!post) return null;
  return { "@context": AS_CONTEXT, ...(await objectFor(post, origin)) };
}

// ── Followers ───────────────────────────────────────────────────────────────

export function followerCount(): number {
  return Number((store().prepare("SELECT COUNT(*) AS n FROM followers").get() as { n: number | bigint }).n);
}

function followerInboxes(): string[] {
  const rows = store().prepare("SELECT inbox, sharedInbox FROM followers").all() as unknown as { inbox: string; sharedInbox: string | null }[];
  return [...new Set(rows.map((r) => r.sharedInbox ?? r.inbox))];
}

// ── The inbox ───────────────────────────────────────────────────────────────

export type InboxOutcome = "followed" | "unfollowed" | "filed" | "removed" | "ignored";

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

/** Act on one activity whose signature has been checked: `actor` is the
 *  actor whose key signed it, and the activity must claim that actor. */
export async function handleActivity(activity: Record<string, unknown>, actor: RemoteActor, origin: string): Promise<InboxOutcome> {
  if (idOf(activity.actor) !== actor.id) return "ignored";
  const type = str(activity.type);
  const object = activity.object;
  const me = actorId(origin);
  if (type === "Follow") {
    if (idOf(object) !== me) return "ignored";
    store()
      .prepare("INSERT OR REPLACE INTO followers (actor, inbox, sharedInbox, followedMs) VALUES (?, ?, ?, ?)")
      .run(actor.id, actor.inbox, actor.sharedInbox, Date.now());
    const accept = {
      "@context": AS_CONTEXT,
      id: `${me}#accept-${createHash("sha256").update(String(activity.id ?? actor.id)).digest("hex").slice(0, 16)}`,
      type: "Accept",
      actor: me,
      object: activity,
    };
    deliveries().add("deliver", { inbox: actor.inbox, body: JSON.stringify(accept) });
    return "followed";
  }
  if (type === "Undo" && typeof object === "object" && object !== null) {
    const inner = object as Record<string, unknown>;
    if (idOf(inner.actor) !== null && idOf(inner.actor) !== actor.id) return "ignored";
    if (str(inner.type) === "Follow") {
      store().prepare("DELETE FROM followers WHERE actor = ?").run(actor.id);
      return "unfollowed";
    }
    const ref = idOf(inner);
    if (ref && removeByRef(ref, actor.id) > 0) return "removed";
    return "ignored";
  }
  if (type === "Undo") {
    const ref = idOf(object);
    if (ref && removeByRef(ref, actor.id) > 0) return "removed";
    return "ignored";
  }
  if (type === "Delete") {
    const ref = idOf(object);
    if (ref === actor.id) {
      // The account itself is gone: so is what it said, and its follow.
      store().prepare("DELETE FROM followers WHERE actor = ?").run(actor.id);
      return "removed";
    }
    if (ref && removeByRef(ref, actor.id) > 0) return "removed";
    return "ignored";
  }
  if (type === "Like" || type === "Announce") {
    const target = idOf(object);
    const notePath = target ? pathForUrl(target, origin) : null;
    const ref = str(activity.id);
    if (notePath === null || ref === null) return "ignored";
    if (!ensureInteractionsStore()) throw new RetryLater("comments store closed");
    removeByRef(ref, actor.id); // a repeated delivery files once
    addInteraction({
      notePath,
      kind: "activitypub",
      type: type === "Like" ? "like" : "repost",
      author: actor.name,
      body: "",
      source: actor.id,
      url: actor.url,
      photo: actor.icon,
      authorUrl: actor.url,
      ref,
      hidden: false,
    });
    return "filed";
  }
  if (type === "Create" && typeof object === "object" && object !== null) {
    const note = object as Record<string, unknown>;
    const inReplyTo = idOf(note.inReplyTo);
    const notePath = inReplyTo ? pathForUrl(inReplyTo, origin) : null;
    const ref = str(note.id);
    if (notePath === null || ref === null) return "ignored";
    if (idOf(note.attributedTo) !== null && idOf(note.attributedTo) !== actor.id) return "ignored";
    if (!ensureInteractionsStore()) throw new RetryLater("comments store closed");
    removeByRef(ref, actor.id);
    addInteraction({
      notePath,
      kind: "activitypub",
      type: "reply",
      author: actor.name,
      body: htmlToText(str(note.content) ?? ""),
      source: actor.id,
      url: firstUrl(note.url) ?? ref,
      photo: actor.icon,
      authorUrl: actor.url,
      ref,
      hidden: true,
    });
    return "filed";
  }
  return "ignored";
}

// ── Deliveries ──────────────────────────────────────────────────────────────

interface DeliveryPayload {
  inbox: string;
  body: string;
}

async function runDelivery(job: JobRow): Promise<void> {
  const p = JSON.parse(job.payload) as DeliveryPayload;
  const origin = publicOrigin();
  if (origin === null) throw new RetryLater("no site address yet");
  const k = actorKeys();
  const signed = signRequest("POST", p.inbox, p.body, `${actorId(origin)}#main-key`, k.privatePem);
  let res;
  try {
    res = await safeFetch(p.inbox, {
      method: "POST",
      headers: { ...signed, "Content-Type": AP_CONTENT_TYPE, Accept: AP_ACCEPT },
      body: p.body,
      maxBytes: 64 * 1024,
    });
  } catch (err) {
    if (err instanceof FetchRefused) return; // never deliverable
    throw new RetryLater(err instanceof Error ? err.message : String(err));
  }
  if (res.status === 410) {
    // The inbox is gone for good: so is whoever it served.
    store().prepare("DELETE FROM followers WHERE inbox = ? OR sharedInbox = ?").run(p.inbox, p.inbox);
    return;
  }
  if (res.status >= 500 || res.status === 429) throw new RetryLater(`inbox answered ${res.status}`);
}

/** Queue one activity for every follower's inbox. */
function deliverToFollowers(activity: Record<string, unknown>): void {
  const body = JSON.stringify({ "@context": AS_CONTEXT, ...activity });
  for (const inbox of followerInboxes()) deliveries().add("deliver", { inbox, body });
}

function recordPost(page: PageState, objectId: string): void {
  store().prepare("INSERT OR REPLACE INTO posts (path, hash, mtimeMs, objectId) VALUES (?, ?, ?, ?)").run(page.path, page.hash, page.mtimeMs, objectId);
}

// ── What the surfaces read ──────────────────────────────────────────────────

export function fediverseAddressFor(origin: string | null): string | null {
  if (origin === null) return null;
  return fediverseAddress(fediverseEffective().handle, new URL(origin).host);
}

export function deliveriesQueued(): number {
  return deliveries().size();
}

// ── Life ────────────────────────────────────────────────────────────────────

/** Join the publish reconcile. `dbFile` and `keyFile` are the tests'. */
export function initActivityPub(opts: { dbFile?: string; keyFile?: string } = {}): void {
  closeActivityPub();
  dbFile = opts.dbFile ?? null;
  keyFile = opts.keyFile ?? null;
  unlisten = addPublishListener({
    name: "fediverse",
    enabled: () => fediverseEffective().enabled,
    ledger: () => store().prepare("SELECT path, hash, mtimeMs FROM posts").all() as unknown as LedgerRow[],
    baselined: () => store().prepare("SELECT value FROM meta WHERE key = 'baselined'").get() !== undefined,
    baseline: (pages) => {
      const origin = publicOrigin();
      for (const page of pages) recordPost(page, origin ? pageUrl(page.path, origin) : "");
      store().prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('baselined', ?)").run(String(Date.now()));
    },
    published: async (page, url) => {
      const origin = publicOrigin()!;
      deliverToFollowers(createOf(await objectFor(page.post, origin), origin));
      recordPost(page, url);
    },
    changed: async (page, url) => {
      const origin = publicOrigin()!;
      const now = new Date().toISOString();
      const object = await objectFor(page.post, origin, now);
      deliverToFollowers({ id: `${url}#update-${page.hash.slice(0, 12)}`, type: "Update", actor: actorId(origin), published: now, to: object.to, cc: object.cc, object });
      recordPost(page, url);
    },
    unpublished: (row: LedgerRow) => {
      const origin = publicOrigin()!;
      const posted = store().prepare("SELECT objectId FROM posts WHERE path = ?").get(row.path) as { objectId: string } | undefined;
      const objectId = posted?.objectId || pageUrl(row.path, origin);
      deliverToFollowers({
        id: `${objectId}#delete-${Date.now()}`,
        type: "Delete",
        actor: actorId(origin),
        to: [AS_PUBLIC],
        cc: [`${actorId(origin)}/followers`],
        object: { id: objectId, type: "Tombstone" },
      });
      store().prepare("DELETE FROM posts WHERE path = ?").run(row.path);
    },
  });
  if (dbFile !== null || fediverseEffective().enabled) deliveries().kick();
}

export async function drainDeliveries(): Promise<void> {
  await deliveries().drain();
}

export function setDeliveryBackoffForTests(ms: readonly number[]): void {
  deliveries().backoffMs = ms;
}

export function closeActivityPub(): void {
  unlisten?.();
  unlisten = null;
  queue?.close();
  queue = null;
  db?.close();
  db = null;
  keys = null;
}

/** The canonical form an inbox compares ids in. */
export function sameId(a: string, b: string): boolean {
  return (normalizeUrl(a) ?? a) === (normalizeUrl(b) ?? b);
}
