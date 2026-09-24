// WHAT MAY LEAVE, AND WHEN IT CHANGED (docs/webmentions.md).
//
// Two features talk to other sites about this one — webmentions
// (server/webmentions.ts) and the fediverse (server/activitypub.ts) — and
// they share two questions this module answers once:
//
// 1. WHICH PAGES ARE PUBLIC ENOUGH TO TALK ABOUT. One rule, `federable`:
//    the site's reads are open (PUBLIC is not false), and the note is in the
//    list the site's own feed is made from — `posts(true, siteScope().lang,
//    staticPagesActive())`: published, not a template, not a library lesson
//    (a lesson is reachable but UNLISTED), not a designed site's static page,
//    and not curated away by the language filter AS THE SITE SPEAKS WITHOUT A
//    READER (the crawler's scope, server/language.ts::siteScope). Under
//    "follow" with the reader switch on, that is the site language's half:
//    the other half is per-reader visibility, and a follower's timeline is
//    nobody's reader. The same rule answers "may this be a webmention's
//    target", "may this page send one", and "may this go in the outbox" — so
//    a test can hold all three to it (tests/federation.test.ts).
//
// 2. WHAT CHANGED. The features act on publish, republish and unpublish, and
//    there is no single "publish" gesture to hook: a note becomes public by a
//    frontmatter edit, from the editor, the phone, a git pull or another
//    editor on the same folder. So this module RECONCILES instead — after the
//    vault settles, it compares the federable set and each page's content
//    hash with what each feature last acted on (its own ledger) and hands it
//    the difference: `published`, `changed`, `unpublished`. A feature whose
//    ledger is empty the first time it runs takes the whole set as its
//    BASELINE and acts on nothing — turning the fediverse on does not send
//    followers two hundred old posts, and turning webmentions on does not
//    spray every site the archive ever linked.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import type { PostMeta } from "../shared/types.ts";
import { normalizeUrl } from "../shared/mentions.ts";
import { noteCandidates } from "../shared/noteFormat.ts";
import { publicReads } from "./auth.ts";
import { notePathToUrl } from "./blog.ts";
import { posts, whenIndexed } from "./indexer.ts";
import { siteScope } from "./language.ts";
import { staticPagesActive } from "./pages.ts";
import { legacyRedirectTarget, siteUrl } from "./site.ts";
import { onEvent, safeAbs } from "./vault.ts";

// ── 1. The gate ─────────────────────────────────────────────────────────────

/** Every page this site may talk to other sites about, newest first. */
export function federablePosts(): PostMeta[] {
  if (!publicReads()) return [];
  return posts(true, siteScope().lang, staticPagesActive());
}

export function isFederable(notePath: string): boolean {
  return federablePosts().some((p) => p.path === notePath);
}

// ── The site's own address ──────────────────────────────────────────────────

let rememberedOrigin: string | null = null;

/** The origin other sites know this one by: SITE_URL when set (the only
 *  stable answer, and the one the docs ask for), else the origin the owner
 *  last opened Settings → Publishing at — which is what a background job
 *  that has no request of its own must go on. Null until either exists. */
export function publicOrigin(): string | null {
  return siteUrl() ?? rememberedOrigin;
}

/** Record the origin an ADMIN request arrived at (the Publishing status
 *  route) — never an anonymous one, whose forwarded host is its own. */
export function rememberOrigin(origin: string): void {
  if (siteUrl() !== null) return;
  const clean = normalizeUrl(origin);
  if (clean !== null) rememberedOrigin = clean.replace(/\/$/, "");
}

/** For the tests. */
export function resetOriginForTests(): void {
  rememberedOrigin = null;
}

export function pageUrl(notePath: string, origin: string): string {
  return origin + notePathToUrl(notePath);
}

/** The federable note an address on THIS site names, or null — an address
 *  on another host, on a host the site used to have (LEGACY_HOSTS, resolved
 *  to where it lives now), a path that is no federable page. Matching is the
 *  deep-link router's: `.md` optional, case-insensitive, percent-decoded. */
export function pathForUrl(raw: string, origin: string): string | null {
  let url: URL;
  let home: URL;
  try {
    url = new URL(raw);
    home = new URL(origin);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const ours = url.host.toLowerCase() === home.host.toLowerCase();
  const moved = !ours && legacyRedirectTarget(url.host, url.pathname, "") !== null;
  if (!ours && !moved) return null;
  let decoded: string;
  try {
    decoded = url.pathname.split("/").map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
  const rel = decoded.replace(/^\/+/, "").replace(/\/+$/, "");
  if (rel === "") return null;
  const wants = noteCandidates(rel).map((c) => c.toLowerCase());
  for (const post of federablePosts()) {
    if (wants.includes(post.path.toLowerCase())) return post.path;
  }
  return null;
}

// ── 2. The reconcile ────────────────────────────────────────────────────────

/** One federable page as it stands now. */
export interface PageState {
  path: string;
  hash: string;
  mtimeMs: number;
  title: string;
  post: PostMeta;
}

/** What a feature last acted on for one page. */
export interface LedgerRow {
  path: string;
  hash: string;
  mtimeMs: number;
}

/** A feature that acts on publish: its own ledger, and what it does. */
export interface PublishListener {
  name: string;
  /** Is the feature switched on right now? Off, it is skipped and its ledger
   *  left as it was. */
  enabled(): boolean;
  /** What it last acted on (live pages only). */
  ledger(): LedgerRow[];
  /** True once the feature has taken a baseline. */
  baselined(): boolean;
  /** Record the baseline: these pages exist, act on none of them. */
  baseline(pages: PageState[]): void;
  published(page: PageState, source: string): Promise<void> | void;
  changed(page: PageState, source: string): Promise<void> | void;
  unpublished(row: LedgerRow): Promise<void> | void;
}

const listeners: PublishListener[] = [];

export function addPublishListener(listener: PublishListener): () => void {
  listeners.push(listener);
  return () => {
    const at = listeners.indexOf(listener);
    if (at !== -1) listeners.splice(at, 1);
  };
}

export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

async function currentPages(known: Map<string, LedgerRow>): Promise<PageState[]> {
  const out: PageState[] = [];
  for (const post of federablePosts()) {
    let abs: string;
    try {
      abs = safeAbs(post.path);
    } catch {
      continue;
    }
    try {
      const stat = await fs.stat(abs);
      const prior = known.get(post.path);
      // An unchanged mtime is an unchanged page: no read, no hash.
      if (prior && prior.mtimeMs === stat.mtimeMs) {
        out.push({ path: post.path, hash: prior.hash, mtimeMs: stat.mtimeMs, title: post.title, post });
        continue;
      }
      const text = await fs.readFile(abs, "utf8");
      out.push({ path: post.path, hash: contentHash(text), mtimeMs: stat.mtimeMs, title: post.title, post });
    } catch {
      /* gone between the index and here: the next event reconciles it */
    }
  }
  return out;
}

let running: Promise<void> | null = null;
let again = false;

/** Compare the federable set with every enabled feature's ledger and hand
 *  each the difference. Serialised: a reconcile asked for while one runs
 *  runs once more after it. */
export function reconcile(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await whenIndexed();
        await reconcileOnce();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function reconcileOnce(): Promise<void> {
  const active = listeners.filter((l) => l.enabled());
  if (active.length === 0) return;
  const origin = publicOrigin();
  // Every ledger's rows, so an unchanged page is never read twice.
  const known = new Map<string, LedgerRow>();
  for (const l of active) for (const row of l.ledger()) if (!known.has(row.path)) known.set(row.path, row);
  const pages = await currentPages(known);
  for (const l of active) {
    if (!l.baselined()) {
      l.baseline(pages);
      continue;
    }
    // Nothing can be announced without an address to announce it at; the
    // ledger stays as it is, and the next reconcile with one catches up.
    if (origin === null) continue;
    const ledger = new Map(l.ledger().map((r) => [r.path, r]));
    const live = new Set<string>();
    for (const page of pages) {
      live.add(page.path);
      const row = ledger.get(page.path);
      try {
        if (!row) await l.published(page, pageUrl(page.path, origin));
        else if (row.hash !== page.hash) await l.changed(page, pageUrl(page.path, origin));
      } catch (err) {
        console.error(`astrolabe: ${l.name} could not act on ${page.path}:`, err);
      }
    }
    for (const row of ledger.values()) {
      if (live.has(row.path)) continue;
      try {
        await l.unpublished(row);
      } catch (err) {
        console.error(`astrolabe: ${l.name} could not withdraw ${row.path}:`, err);
      }
    }
  }
}

let timer: NodeJS.Timeout | null = null;
let tick: NodeJS.Timeout | null = null;
let unsubscribe: (() => void) | null = null;
const DEBOUNCE_MS = 1500;
/** The slow pass: a switch turned on (its baseline), or a setting that moved
 *  the federable set without touching a file (the language filter, PUBLIC)
 *  — both are caught within a minute. A pass over unchanged files is one
 *  stat each. */
const TICK_MS = 60_000;

/** Reconcile after the vault settles, on the minute, and once now. */
export function initFederation(): void {
  unsubscribe?.();
  unsubscribe = onEvent((event) => {
    if (event.kind === "bulk") return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void reconcile();
    }, DEBOUNCE_MS);
    timer.unref?.();
  });
  if (tick === null) {
    tick = setInterval(() => {
      if (listeners.some((l) => l.enabled())) void reconcile();
    }, TICK_MS);
    tick.unref?.();
  }
  void reconcile();
}

/** For the tests. */
export function closeFederation(): void {
  unsubscribe?.();
  unsubscribe = null;
  if (timer) clearTimeout(timer);
  timer = null;
  if (tick) clearInterval(tick);
  tick = null;
  listeners.length = 0;
}
