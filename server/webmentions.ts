// WEBMENTIONS (docs/webmentions.md, W3C Webmention).
//
// TWO SWITCHES, BOTH OFF. Settings → Publishing → Accept webmentions lets
// other sites tell this one they linked to a page; Send webmentions tells
// other sites when a page here links to them. Each is network access the
// owner consents to separately, and with both off this module asks no server
// anything and answers `/webmention` with a 404, the way a site without the
// feature would.
//
// RECEIVING. `POST /webmention` (server/webmentionRoutes.ts) checks what it
// can without the network — the target is a FEDERABLE page of this site
// (server/federation.ts: published, listed, not curated away by the
// language filter; a LEGACY_HOSTS address resolved to where it lives now) —
// and queues the rest: fetch the source (server/safeFetch.ts: public
// addresses only, a megabyte, ten seconds), verify it links to the target,
// read it as microformats2 (shared/mentions.ts), and file it in the comments
// store as `kind: "webmention"` with its `type` and `source`, HIDDEN — awaiting
// the owner's approval in the moderation panel, like nothing else in that
// store is. A source that later stops linking (or answers 410/404) withdraws
// the mention: on a new webmention for the same pair, or on "Verify again".
//
// SENDING. On publish and on a republish that changed the page (the
// reconcile in server/federation.ts), the page's links to other sites
// (shared/mentions.ts::outboundLinks) are each sent a webmention at the
// endpoint the target advertises, and the (source, target) pair is recorded
// with the page's content hash — an unchanged page sends nothing again, and
// a link removed in a republish is sent once more so the other site sees it
// gone. The last fifty outcomes are the Sent panel under Publishing.
//
// THE STORE. `ASTROLABE_DATA/webmentions.db` (node:sqlite): the job queue
// (server/jobQueue.ts — one at a time, three retries with backoff), the
// seen pairs (which comment a (source, target) filed), the sent ledger, and
// the publish ledger the reconcile compares against. Machine state, never
// mirrored into the vault (server/configMirror.ts).

import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { discoverEndpoint, linksTo, normalizeUrl, outboundLinks, parseMention, sameUrl } from "../shared/mentions.ts";
import type { SentMention, SentMentionStatus } from "../shared/types.ts";
import { addInteraction, ensureInteractionsStore, getComment, removeComment, updateInteraction } from "./comments.ts";
import { addPublishListener, isFederable, pageUrl, pathForUrl, publicOrigin, type LedgerRow, type PageState } from "./federation.ts";
import { JobQueue, RetryLater, type JobRow } from "./jobQueue.ts";
import { FetchRefused, safeFetch, type SafeResponse } from "./safeFetch.ts";
import { webmentionsEffective } from "./settings.ts";
import { dataDir } from "./site.ts";
import { readNote } from "./vault.ts";

/** The Sent panel's length. */
export const SENT_PANEL_MAX = 50;
/** Receive jobs allowed to wait at once; past it the endpoint answers 429. */
export const RECEIVE_QUEUE_MAX = 500;

const HTML_ACCEPT = "text/html, application/xhtml+xml;q=0.9, */*;q=0.2";

let db: DatabaseSync | null = null;
let dbFile: string | null = null;
let queue: JobQueue | null = null;
let unlisten: (() => void) | null = null;

/** Every fetch this feature makes goes through here, one at a time — the
 *  queue's jobs and the moderator's "Verify again" alike. */
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

function store(): DatabaseSync {
  if (db) return db;
  const file = dbFile ?? path.join(dataDir(), "webmentions.db");
  mkdirSync(path.dirname(file), { recursive: true });
  const opened = new DatabaseSync(file);
  opened.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS seen (
      source     TEXT NOT NULL,
      target     TEXT NOT NULL,
      notePath   TEXT NOT NULL,
      commentId  INTEGER NOT NULL,
      verifiedMs INTEGER NOT NULL,
      PRIMARY KEY (source, target)
    );
    CREATE INDEX IF NOT EXISTS idx_seen_comment ON seen (commentId);
    CREATE TABLE IF NOT EXISTS sent (
      source   TEXT NOT NULL,
      target   TEXT NOT NULL,
      notePath TEXT NOT NULL,
      hash     TEXT NOT NULL,
      status   TEXT NOT NULL,
      code     INTEGER,
      endpoint TEXT,
      detail   TEXT,
      sentMs   INTEGER NOT NULL,
      PRIMARY KEY (source, target)
    );
    CREATE INDEX IF NOT EXISTS idx_sent_time ON sent (sentMs);
    CREATE TABLE IF NOT EXISTS pages (
      path    TEXT PRIMARY KEY,
      hash    TEXT NOT NULL,
      mtimeMs REAL NOT NULL,
      url     TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  db = opened;
  queue = new JobQueue({ db: opened, table: "jobs", run: (job) => serial(() => runJob(job)), onGiveUp: gaveUp });
  return opened;
}

function jobs(): JobQueue {
  store();
  return queue!;
}

// ── Receiving ───────────────────────────────────────────────────────────────

export type ReceiveRefusal = "off" | "badSource" | "badTarget" | "sameUrl" | "busy";

/** The synchronous half of `POST /webmention`: everything that can be
 *  refused without the network. Queues the rest and answers null, or names
 *  the refusal. `origin` is the site's address as this request reached it. */
export function acceptWebmention(source: string, target: string, origin: string): ReceiveRefusal | null {
  if (!webmentionsEffective().accept) return "off";
  const src = normalizeUrl(source);
  if (src === null) return "badSource";
  const tgt = normalizeUrl(target);
  if (tgt === null) return "badTarget";
  if (sameUrl(src, tgt)) return "sameUrl";
  const notePath = pathForUrl(tgt, origin);
  if (notePath === null) return "badTarget";
  if (jobs().size("receive") >= RECEIVE_QUEUE_MAX) return "busy";
  jobs().add("receive", { source: src, target: tgt, notePath, origin }, `receive ${src} ${tgt}`);
  return null;
}

interface ReceivePayload {
  source: string;
  target: string;
  notePath: string;
  origin: string;
}

interface SeenRow {
  source: string;
  target: string;
  notePath: string;
  commentId: number;
}

function seenPair(source: string, target: string): SeenRow | null {
  const row = store().prepare("SELECT source, target, notePath, commentId FROM seen WHERE source = ? AND target = ?").get(source, target);
  return (row as unknown as SeenRow | undefined) ?? null;
}

function withdraw(row: SeenRow): void {
  removeComment(row.commentId);
  store().prepare("DELETE FROM seen WHERE source = ? AND target = ?").run(row.source, row.target);
}

export type VerifyOutcome = "filed" | "updated" | "withdrawn" | "dropped" | "unreachable";

/** Fetch, verify and file (or refresh, or withdraw) one mention. */
async function receive(p: ReceivePayload): Promise<VerifyOutcome> {
  const prior = seenPair(p.source, p.target);
  // The target stopped being public since the mention arrived: nothing about
  // it may be kept, and nothing is fetched on its behalf.
  if (!isFederable(p.notePath)) {
    if (prior) withdraw(prior);
    return prior ? "withdrawn" : "dropped";
  }
  let res: SafeResponse;
  try {
    res = await safeFetch(p.source, { headers: { Accept: HTML_ACCEPT } });
  } catch (err) {
    if (err instanceof FetchRefused) {
      if (prior) withdraw(prior);
      return prior ? "withdrawn" : "dropped";
    }
    throw new RetryLater(err instanceof Error ? err.message : String(err));
  }
  if (res.status >= 500 || res.status === 429) throw new RetryLater(`source answered ${res.status}`);
  const targets = [p.target, pageUrl(p.notePath, p.origin)];
  const origin = publicOrigin();
  if (origin !== null) targets.push(pageUrl(p.notePath, origin));
  if (res.status >= 400 || !linksTo(res.body, res.url, targets)) {
    // Gone (410/404), or no longer linking: the spec's deletion.
    if (prior) withdraw(prior);
    return prior ? "withdrawn" : "dropped";
  }
  if (!ensureInteractionsStore()) throw new RetryLater("comments store closed");
  const mention = parseMention(res.body, res.url, p.target);
  let host = "";
  try {
    host = new URL(p.source).host;
  } catch {
    /* normalised above */
  }
  const fields = {
    type: mention.type,
    author: mention.author?.name || host,
    body: mention.summary || mention.name || "",
    url: mention.url,
    photo: mention.author?.photo ?? null,
    authorUrl: mention.author?.url ?? null,
  };
  const now = Date.now();
  if (prior && getComment(prior.commentId)) {
    updateInteraction(prior.commentId, fields);
    store().prepare("UPDATE seen SET verifiedMs = ? WHERE source = ? AND target = ?").run(now, p.source, p.target);
    return "updated";
  }
  const filed = addInteraction({
    notePath: p.notePath,
    kind: "webmention",
    source: p.source,
    hidden: true,
    ...fields,
  });
  store()
    .prepare("INSERT OR REPLACE INTO seen (source, target, notePath, commentId, verifiedMs) VALUES (?, ?, ?, ?, ?)")
    .run(p.source, p.target, p.notePath, filed.id, now);
  return "filed";
}

/** "Verify again" from the moderation panel: fetch the source now (in the
 *  queue's turn) and keep, refresh or withdraw the mention. */
export async function verifyAgain(commentId: number): Promise<VerifyOutcome> {
  const row = store()
    .prepare("SELECT source, target, notePath, commentId FROM seen WHERE commentId = ?")
    .get(commentId) as unknown as SeenRow | undefined;
  if (!row) return "dropped";
  const origin = publicOrigin() ?? new URL(row.target).origin;
  try {
    return await serial(() => receive({ source: row.source, target: row.target, notePath: row.notePath, origin }));
  } catch (err) {
    if (err instanceof RetryLater) return "unreachable";
    throw err;
  }
}

// ── Sending ─────────────────────────────────────────────────────────────────

interface SendPayload {
  source: string;
  target: string;
  notePath: string;
  hash: string;
}

function recordSent(p: SendPayload, status: SentMentionStatus, code: number | null, endpoint: string | null, detail: string | null): void {
  store()
    .prepare(
      `INSERT INTO sent (source, target, notePath, hash, status, code, endpoint, detail, sentMs)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (source, target) DO UPDATE SET notePath = excluded.notePath, hash = excluded.hash,
         status = excluded.status, code = excluded.code, endpoint = excluded.endpoint,
         detail = excluded.detail, sentMs = excluded.sentMs`,
    )
    .run(p.source, p.target, p.notePath, p.hash, status, code, endpoint, detail, Date.now());
}

async function send(p: SendPayload): Promise<void> {
  // Checked AGAIN at send time, not only when queued: a page unpublished (or
  // filtered away) while its sends waited sends nothing.
  const origin = publicOrigin();
  if (!webmentionsEffective().send || origin === null || !isFederable(p.notePath) || !sameUrl(p.source, pageUrl(p.notePath, origin))) {
    recordSent(p, "skipped", null, null, "the page is no longer public");
    return;
  }
  let page: SafeResponse;
  try {
    page = await safeFetch(p.target, { headers: { Accept: HTML_ACCEPT } });
  } catch (err) {
    if (err instanceof FetchRefused) {
      recordSent(p, "failed", null, null, err.message);
      return;
    }
    throw new RetryLater(err instanceof Error ? err.message : String(err));
  }
  if (page.status >= 500 || page.status === 429) throw new RetryLater(`target answered ${page.status}`);
  const endpoint = discoverEndpoint(page.headers.link, page.status < 400 ? page.body : "", page.url);
  if (endpoint === null) {
    recordSent(p, "noEndpoint", page.status, null, null);
    return;
  }
  let answer: SafeResponse;
  try {
    answer = await safeFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "*/*" },
      body: new URLSearchParams({ source: p.source, target: p.target }).toString(),
      maxBytes: 64 * 1024,
    });
  } catch (err) {
    if (err instanceof FetchRefused) {
      recordSent(p, "failed", null, endpoint, err.message);
      return;
    }
    throw new RetryLater(err instanceof Error ? err.message : String(err));
  }
  if (answer.status >= 500 || answer.status === 429) throw new RetryLater(`endpoint answered ${answer.status}`);
  if (answer.status >= 200 && answer.status < 300) recordSent(p, "sent", answer.status, endpoint, null);
  else recordSent(p, "failed", answer.status, endpoint, answer.body.slice(0, 200) || null);
}

/** Queue the sends one page's publish calls for. `previous` is the targets
 *  the last version sent to, which a republish tells once more. */
async function queueSends(page: PageState, source: string): Promise<void> {
  if (!webmentionsEffective().send) return;
  const origin = publicOrigin();
  if (origin === null) return;
  let content: string;
  try {
    content = (await readNote(page.path)).content;
  } catch {
    return;
  }
  const home = new URL(origin).host.toLowerCase();
  const targets = outboundLinks(content).filter((t) => {
    try {
      // This site's own pages are never a target: a webmention to oneself
      // tells nobody anything, and it is the one way a private page's
      // address could ride out on a send.
      return new URL(t).host.toLowerCase() !== home;
    } catch {
      return false;
    }
  });
  const before = store()
    .prepare("SELECT target, hash FROM sent WHERE source = ?")
    .all(source) as unknown as { target: string; hash: string }[];
  const already = new Map(before.map((r) => [r.target, r.hash]));
  const all = new Set([...targets, ...already.keys()]);
  for (const target of all) {
    if (already.get(target) === page.hash) continue;
    const p: SendPayload = { source, target, notePath: page.path, hash: page.hash };
    recordSent(p, "queued", null, null, null);
    jobs().add("send", p, `send ${source} ${target}`);
  }
}

function recordPage(page: PageState, url: string): void {
  store()
    .prepare("INSERT OR REPLACE INTO pages (path, hash, mtimeMs, url) VALUES (?, ?, ?, ?)")
    .run(page.path, page.hash, page.mtimeMs, url);
}

// ── The queue ───────────────────────────────────────────────────────────────

async function runJob(job: JobRow): Promise<void> {
  const payload = JSON.parse(job.payload) as unknown;
  if (job.kind === "receive") {
    if (!webmentionsEffective().accept) return; // switched off while it waited
    await receive(payload as ReceivePayload);
  } else if (job.kind === "send") {
    await send(payload as SendPayload);
  }
}

function gaveUp(job: JobRow, error: string): void {
  if (job.kind !== "send") return;
  recordSent(JSON.parse(job.payload) as SendPayload, "failed", null, null, error);
}

// ── What the surfaces read ──────────────────────────────────────────────────

/** The Sent panel: the newest outcomes, queued ones included. */
export function sentMentions(limit = SENT_PANEL_MAX): SentMention[] {
  const rows = store()
    .prepare("SELECT source, target, notePath, status, code, detail, sentMs FROM sent ORDER BY sentMs DESC LIMIT ?")
    .all(limit) as unknown as { source: string; target: string; notePath: string; status: SentMentionStatus; code: number | null; detail: string | null; sentMs: number }[];
  return rows.map((r) => ({ ...r, code: r.code ?? null, detail: r.detail ?? null }));
}

// ── Life ────────────────────────────────────────────────────────────────────

/** Open the store lazily and join the publish reconcile. `dbFile` is the
 *  tests' to choose. */
export function initWebmentions(opts: { dbFile?: string } = {}): void {
  closeWebmentions();
  dbFile = opts.dbFile ?? null;
  unlisten = addPublishListener({
    name: "webmentions",
    enabled: () => webmentionsEffective().send,
    ledger: () => store().prepare("SELECT path, hash, mtimeMs FROM pages").all() as unknown as LedgerRow[],
    baselined: () => store().prepare("SELECT value FROM meta WHERE key = 'baselined'").get() !== undefined,
    baseline: (pages) => {
      const origin = publicOrigin();
      for (const page of pages) recordPage(page, origin ? pageUrl(page.path, origin) : "");
      store().prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('baselined', ?)").run(String(Date.now()));
    },
    published: async (page, source) => {
      await queueSends(page, source);
      recordPage(page, source);
    },
    changed: async (page, source) => {
      await queueSends(page, source);
      recordPage(page, source);
    },
    // An unpublished page sends nothing (it is not public any more); it
    // leaves the ledger, so publishing it again is a publish.
    unpublished: (row) => {
      store().prepare("DELETE FROM pages WHERE path = ?").run(row.path);
    },
  });
  // Whatever was waiting when the server stopped.
  if (dbFile !== null || webmentionsEffective().accept || webmentionsEffective().send) jobs().kick();
}

/** Work the queue until idle (the tests). */
export async function drainWebmentions(): Promise<void> {
  await jobs().drain();
}

/** For the tests: waits between retries. */
export function setWebmentionBackoffForTests(ms: readonly number[]): void {
  jobs().backoffMs = ms;
}

export function closeWebmentions(): void {
  unlisten?.();
  unlisten = null;
  queue?.close();
  queue = null;
  db?.close();
  db = null;
}
