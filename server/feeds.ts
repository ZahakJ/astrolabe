// FEEDS AND READ-LATER (docs/feeds.md): the list in a note, the rounds, and
// Keep.
//
// OPT-IN, AND QUIET WHEN IT IS OFF. Settings → Vault → Feeds is off on a new
// instance, and while it is off this module asks no server anything: no
// timer does work, the Feeds surface lists what was already fetched, and the
// row's note says why nothing new arrives. The list is still read (the
// surface shows it, with its problems), because reading a note is not network.
// This is the embeddings pattern (server/ask.ts): a store under
// ASTROLABE_DATA, a job woken by the vault's own events, and nothing at all
// when its dependency — here the owner's consent — is absent.
//
// THE CADENCE IS SYNC'S. With git sync on a timer (`gitSync.intervalMinutes`),
// a round of feeds runs on the same interval: one schedule for everything
// this instance does over the network, so a laptop on a metered line has one
// number to turn down. With sync off, the hour. A round asks every feed with
// its validators (`If-None-Match`, `If-Modified-Since`), so an unchanged feed
// costs a 304 and no bytes.
//
// THE LIST IS READ ON INDEX. The Feeds note is re-read whenever the watcher
// says it changed (after the note index has applied the event), and a feed
// that appears in it is asked at once when fetching is on — adding a line and
// seeing its articles is one gesture, not an hour's wait.
//
// KEEP IS THE CLIPPER. An article worth keeping goes through `performKeep`
// (server/clip.ts): `htmlToMarkdown` over the page (fetched when the feed
// carried only a teaser and fetching is on), the clip's never-overwrite
// naming, the clip's one-write-at-a-time queue, and a note in the feed's
// folder with `source:`, `feed:`, `published:`, `kept:` and the feed's tags.
// No `publish:` key — nothing kept from a feed is public until the owner
// publishes it by hand. From then on it is a note like any other: a
// `==highlight==` in it is a card in Orbits' implicit deck, because the
// indexer reads every note's cards and a kept article is a note.
//
// SEPARATE FROM THE BLOG'S RSS. `/feed.xml` (server/blog.ts) is what this site
// publishes; nothing here reads or writes it.

import path from "node:path";
import { FEEDS_NOTE_DEFAULT, feedsCadenceMinutes, isoDay, parseFeedList, type FeedItemFull, type FeedItemSummary, type FeedList, type FeedSpec, type FeedsState, type FeedSummary } from "../shared/feeds.ts";
import { htmlExcerpt, proseLength, sanitizeFeedHtml } from "../shared/feedHtml.ts";
import { performKeep } from "./clip.ts";
import { discoverFeeds, parseFeed } from "./feedParse.ts";
import { FeedStore, type ItemRow } from "./feedStore.ts";
import { gitSyncEffective } from "./gitSync.ts";
import { whenIndexed } from "./indexer.ts";
import { feedsEffective } from "./settings.ts";
import { dataDir } from "./site.ts";
import { noteExists, onEvent, readNote, VaultError } from "./vault.ts";

/** The most one fetch may bring back. A feed is text; a feed that is ten
 *  megabytes is an archive, and a page is rarely a tenth of that. */
export const FETCH_MAX_BYTES = 8 * 1024 * 1024;
/** How long one ask may take. */
export const FETCH_TIMEOUT_MS = 20_000;
/** Below this many letters of prose, what the feed carried is a teaser and
 *  Keep fetches the page. */
export const FULL_ARTICLE_MIN = 900;
/** Feeds asked at once in a round. */
const PARALLEL = 3;
/** The round timer's tick. */
const TICK_MS = 60_000;

const USER_AGENT = "Astrolabe feeds (+https://github.com/ZahakJ/astrolabe)";

let store: FeedStore | null = null;
let storeFile: string | null = null;
let list: FeedList = { feeds: [], problems: [] };
let listNote = FEEDS_NOTE_DEFAULT;
let listExists = false;
let lastRound: number | null = null;
let running: Promise<void> | null = null;
let timer: NodeJS.Timeout | null = null;
let unsubscribe: (() => void) | null = null;
/** The first read of the list, which every reader of the state waits for. */
let loaded: Promise<unknown> = Promise.resolve();

function openStore(): FeedStore {
  if (store === null) store = new FeedStore(storeFile ?? path.join(dataDir(), "feeds.db"));
  return store;
}

// ── The list ────────────────────────────────────────────────────────────────

/** Read the Feeds note into the list. Resolves to the feeds that were not in
 *  the list before (the ones a round should ask at once). */
export async function reloadList(): Promise<FeedSpec[]> {
  const note = feedsEffective().note;
  const before = new Set(list.feeds.map((f) => f.url));
  listNote = note;
  try {
    const { content } = await readNote(note);
    list = parseFeedList(content);
    listExists = true;
  } catch {
    list = { feeds: [], problems: [] };
    listExists = false;
  }
  return list.feeds.filter((f) => !before.has(f.url));
}

// ── Fetching ────────────────────────────────────────────────────────────────

export interface Fetched {
  status: number;
  body: string;
  contentType: string;
  etag: string | null;
  modified: string | null;
  /** Where the answer came from after redirects. */
  url: string;
}

/** One GET, bounded in time and in bytes. Throws with a sentence the surface
 *  can print. */
export async function fetchText(url: string, validators: { etag?: string | null; modified?: string | null } = {}, accept = "application/rss+xml, application/atom+xml, application/feed+json, application/json;q=0.9, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.8, */*;q=0.5"): Promise<Fetched> {
  const headers: Record<string, string> = { "User-Agent": USER_AGENT, Accept: accept };
  if (validators.etag) headers["If-None-Match"] = validators.etag;
  if (validators.modified) headers["If-Modified-Since"] = validators.modified;
  const res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  const out = {
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
    etag: res.headers.get("etag"),
    modified: res.headers.get("last-modified"),
    url: res.url || url,
  };
  if (res.status === 304 || !res.body) {
    await res.body?.cancel().catch(() => {});
    return { ...out, body: "" };
  }
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > FETCH_MAX_BYTES) {
    await res.body.cancel().catch(() => {});
    throw new Error(`too large (${declared} bytes)`);
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > FETCH_MAX_BYTES) {
      await reader.cancel().catch(() => {});
      throw new Error(`too large (over ${FETCH_MAX_BYTES} bytes)`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  const charset = /charset=([^;]+)/i.exec(out.contentType)?.[1]?.trim().replace(/^"|"$/g, "") ?? "utf-8";
  let body: string;
  try {
    body = new TextDecoder(charset).decode(bytes);
  } catch {
    body = new TextDecoder("utf-8").decode(bytes);
  }
  return { ...out, body };
}

function reason(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return "timed out";
    const cause = (err as Error & { cause?: { code?: string } }).cause?.code;
    return cause ? `${err.message} (${cause})` : err.message;
  }
  return String(err);
}

/** Ask one feed. Records the answer (or the failure) in the store; never throws. */
export async function pollFeed(spec: FeedSpec, now = Date.now()): Promise<{ fresh: number; error: string | null }> {
  const db = openStore();
  const have = db.feed(spec.url);
  const target = have?.resolved ?? spec.url;
  try {
    let got = await fetchText(target, { etag: have?.etag, modified: have?.modified });
    if (got.status === 304) {
      db.recordFetch(spec.url, { checked: now, error: null });
      return { fresh: 0, error: null };
    }
    if (got.status < 200 || got.status >= 300) throw new Error(`HTTP ${got.status}`);
    let parsed = parseFeed(got.body, got.contentType, got.url);
    let resolved = have?.resolved ?? null;
    if (parsed === null) {
      // A page, not a feed: follow the first feed it advertises, once.
      const found = discoverFeeds(got.body, got.url);
      if (found.length === 0) throw new Error("not a feed, and the page names none");
      got = await fetchText(found[0]);
      if (got.status < 200 || got.status >= 300) throw new Error(`HTTP ${got.status} from ${found[0]}`);
      parsed = parseFeed(got.body, got.contentType, got.url);
      if (parsed === null) throw new Error(`${found[0]} is not a feed`);
      resolved = found[0];
    }
    const fresh = db.upsertItems(spec.url, parsed.items, now);
    db.recordFetch(spec.url, {
      checked: now,
      error: null,
      resolved,
      title: parsed.title ?? have?.title ?? null,
      site: parsed.site ?? have?.site ?? null,
      etag: got.etag,
      modified: got.modified,
    });
    return { fresh, error: null };
  } catch (err) {
    const why = reason(err);
    db.recordFetch(spec.url, { checked: now, error: why });
    return { fresh: 0, error: why };
  }
}

/** One round: every feed in the list, a few at a time. Single-flight — a
 *  call while a round runs waits for that round. `only` narrows it to some
 *  feeds (the ones just added to the list). */
export function runRound(only: readonly FeedSpec[] | null = null): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      if (only === null) await reloadList();
      const todo = [...(only ?? list.feeds)];
      const workers = Array.from({ length: Math.min(PARALLEL, todo.length) }, async () => {
        for (let spec = todo.shift(); spec; spec = todo.shift()) await pollFeed(spec);
      });
      await Promise.all(workers);
      if (only === null) lastRound = Date.now();
    } finally {
      running = null;
    }
  })();
  return running;
}

export function cadenceMinutes(): number {
  return feedsCadenceMinutes(gitSyncEffective());
}

function tick(): void {
  if (!feedsEffective().fetch || running) return;
  const due = (lastRound ?? 0) + cadenceMinutes() * 60_000;
  if (Date.now() < due) return;
  void runRound().catch((err: unknown) => console.error("astrolabe: a round of feeds failed", err));
}

/** Start: read the list, watch its note, and tick. Nothing is fetched here —
 *  the first tick does that, and only when fetching is on. `dbFile` and the
 *  timer are the tests' to choose. */
export function initFeeds(opts: { dbFile?: string; timer?: boolean } = {}): void {
  storeFile = opts.dbFile ?? null;
  loaded = reloadList().catch(() => {});
  unsubscribe?.();
  unsubscribe = onEvent((event) => {
    const note = feedsEffective().note;
    if (event.path !== note && event.toPath !== note && event.path !== listNote) return;
    void (async () => {
      await whenIndexed();
      const added = await reloadList();
      if (added.length > 0 && feedsEffective().fetch) void runRound(added).catch(() => {});
    })();
  });
  if (opts.timer !== false && timer === null) {
    timer = setInterval(tick, TICK_MS);
    timer.unref?.();
  }
}

/** For the tests: close the store and forget the state. */
export function closeFeeds(): void {
  if (timer) clearInterval(timer);
  timer = null;
  unsubscribe?.();
  unsubscribe = null;
  store?.close();
  store = null;
  lastRound = null;
  list = { feeds: [], problems: [] };
}

// ── What the surface reads ──────────────────────────────────────────────────

function feedTitle(spec: FeedSpec, row: { title: string | null } | null): string {
  if (row?.title) return row.title;
  try {
    return new URL(spec.url).hostname;
  } catch {
    return spec.url;
  }
}

function summaryOf(item: ItemRow): FeedItemSummary {
  return {
    feed: item.feed,
    guid: item.guid,
    title: item.title,
    url: item.url,
    author: item.author,
    published: item.published,
    read: item.read,
    kept: item.kept,
    excerpt: htmlExcerpt(item.summary ?? item.content ?? ""),
  };
}

export async function feedsState(): Promise<FeedsState> {
  await loaded;
  const eff = feedsEffective();
  if (eff.note !== listNote) await reloadList();
  const db = openStore();
  const counts = db.unreadCounts();
  const rows = new Map(db.feeds().map((r) => [r.url, r]));
  const feeds: FeedSummary[] = list.feeds.map((spec) => {
    const row = rows.get(spec.url) ?? null;
    return {
      url: spec.url,
      title: feedTitle(spec, row),
      site: row?.site ?? null,
      folder: spec.folder,
      tags: spec.tags,
      unread: counts.get(spec.url) ?? 0,
      checked: row?.checked ?? null,
      error: row?.error ?? null,
    };
  });
  const items = db.unread(list.feeds.map((f) => f.url)).map(summaryOf);
  // Opening the surface with fetching on and no round yet is the first round.
  if (eff.fetch && lastRound === null && !running && list.feeds.length > 0) void runRound().catch(() => {});
  return {
    fetch: eff.fetch,
    note: eff.note,
    noteExists: listExists,
    cadenceMinutes: cadenceMinutes(),
    lastRound,
    busy: running !== null,
    feeds,
    items,
    problems: list.problems,
  };
}

function specOf(feedUrl: string): FeedSpec {
  const spec = list.feeds.find((f) => f.url === feedUrl);
  if (!spec) throw new VaultError(404, "That feed is not in the list", "feedUnknown");
  return spec;
}

function itemOf(feedUrl: string, guid: string): ItemRow {
  const item = openStore().item(feedUrl, guid);
  if (!item) throw new VaultError(404, "No such item", "feedItemUnknown");
  return item;
}

export function openItem(feedUrl: string, guid: string): FeedItemFull {
  const item = itemOf(feedUrl, guid);
  const html = item.content ?? item.summary ?? "";
  const base = item.url ?? feedUrl;
  return {
    ...summaryOf(item),
    html: sanitizeFeedHtml(html, base),
    summaryOnly: proseLength(html) < FULL_ARTICLE_MIN,
  };
}

export function markRead(feedUrl: string, guid: string, read: boolean): void {
  if (!openStore().setRead(feedUrl, guid, read)) throw new VaultError(404, "No such item", "feedItemUnknown");
}

export function markAllRead(feedUrl: string | null): number {
  return openStore().readAll(feedUrl);
}

/** Keep one item: the article as a note in the feed's folder. When the feed
 *  carried only a teaser and fetching is on, the page is fetched and its
 *  article (`contentRoot`: `<article>`, then `<main>`) is what is kept; when
 *  fetching is off, or the page cannot be had, what the feed carried is. */
export async function keepItem(feedUrl: string, guid: string): Promise<{ path: string; fetched: boolean; already: boolean }> {
  await whenIndexed();
  const spec = specOf(feedUrl);
  const item = itemOf(feedUrl, guid);
  if (item.kept !== null && (await noteExists(item.kept).catch(() => false))) return { path: item.kept, fetched: false, already: true };
  let html = item.content ?? item.summary;
  let base = item.url ?? feedUrl;
  let fetched = false;
  if ((html === null || proseLength(html) < FULL_ARTICLE_MIN) && item.url && feedsEffective().fetch) {
    try {
      const page = await fetchText(item.url, {}, "text/html, application/xhtml+xml;q=0.9, */*;q=0.5");
      if (page.status >= 200 && page.status < 300 && /html/i.test(page.contentType || "text/html") && page.body.trim() !== "") {
        html = page.body;
        base = page.url;
        fetched = true;
      }
    } catch {
      /* the feed's own words are kept instead */
    }
  }
  const row = openStore().feed(feedUrl);
  const kept = await performKeep({
    folder: spec.folder,
    title: item.title,
    url: item.url,
    html,
    baseUrl: base,
    feed: feedTitle(spec, row),
    published: isoDay(item.published),
    tags: spec.tags,
  });
  openStore().setKept(feedUrl, guid, kept);
  return { path: kept, fetched, already: false };
}
