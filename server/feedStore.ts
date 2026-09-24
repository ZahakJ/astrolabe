// THE FEEDS' OWN STORE: ASTROLABE_DATA/feeds.db (docs/feeds.md).
//
// What the server has fetched and what the reader did with it — read, kept —
// lives in the data directory and NEVER in the vault. A vault is synced,
// versioned and published; a hundred items an hour from somebody else's blog
// would be a hundred commits of noise in it, and an unread flag is a fact about
// one reader on one machine, not about the notes. What the reader KEEPS becomes
// a note (server/feeds.ts `keepItem`), and that is the only door from here into
// the vault. The database is node:sqlite, the store server/comments.ts opened
// first and server/embeddings.ts keeps its vectors in; like the vectors it is
// never mirrored (server/configMirror.ts lists it among what does not travel):
// deleting it loses the read flags and nothing else.
//
// Items are keyed by (feed, guid). A feed's items are pruned to the newest
// KEEP_PER_FEED once read, so a feed that has run for a year is not a year of
// articles on disk.

import { chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ParsedItem } from "./feedParse.ts";

/** Read items kept per feed, newest first; unread ones are never pruned. */
export const KEEP_PER_FEED = 300;

export interface FeedRow {
  url: string;
  /** Where the feed actually is, when the list named a page and discovery
   *  followed its `<link rel="alternate">`. */
  resolved: string | null;
  title: string | null;
  site: string | null;
  etag: string | null;
  modified: string | null;
  checked: number | null;
  error: string | null;
}

export interface ItemRow {
  feed: string;
  guid: string;
  url: string | null;
  title: string;
  author: string | null;
  published: number | null;
  content: string | null;
  summary: string | null;
  /** When this server first saw it, ms — the order of an undated item. */
  seen: number;
  read: boolean;
  kept: string | null;
}

interface RawItem {
  feed: string;
  guid: string;
  url: string | null;
  title: string;
  author: string | null;
  published: number | null;
  content: string | null;
  summary: string | null;
  seen: number;
  read: number;
  kept: string | null;
}

function toItem(r: RawItem): ItemRow {
  return { ...r, published: r.published === null ? null : Number(r.published), seen: Number(r.seen), read: Number(r.read) === 1 };
}

export class FeedStore {
  private db: DatabaseSync;

  constructor(file: string) {
    mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    // What the reader reads is a fact about them: owner-only, like the
    // settings file beside it.
    try {
      chmodSync(file, 0o600);
    } catch {
      /* a filesystem without modes */
    }
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS feeds (
        url      TEXT PRIMARY KEY,
        resolved TEXT,
        title    TEXT,
        site     TEXT,
        etag     TEXT,
        modified TEXT,
        checked  INTEGER,
        error    TEXT
      );
      CREATE TABLE IF NOT EXISTS items (
        feed      TEXT NOT NULL,
        guid      TEXT NOT NULL,
        url       TEXT,
        title     TEXT NOT NULL,
        author    TEXT,
        published INTEGER,
        content   TEXT,
        summary   TEXT,
        seen      INTEGER NOT NULL,
        read      INTEGER NOT NULL DEFAULT 0,
        kept      TEXT,
        PRIMARY KEY (feed, guid)
      );
      CREATE INDEX IF NOT EXISTS items_unread ON items (read, feed);
    `);
  }

  close(): void {
    this.db.close();
  }

  feed(url: string): FeedRow | null {
    const row = this.db.prepare("SELECT * FROM feeds WHERE url = ?").get(url) as unknown as FeedRow | undefined;
    if (!row) return null;
    return { ...row, checked: row.checked === null ? null : Number(row.checked) };
  }

  feeds(): FeedRow[] {
    return (this.db.prepare("SELECT * FROM feeds").all() as unknown as FeedRow[]).map((r) => ({ ...r, checked: r.checked === null ? null : Number(r.checked) }));
  }

  /** Record one ask: what the server said (validators, title) or why it failed. */
  recordFetch(url: string, patch: Partial<Omit<FeedRow, "url">> & { checked: number }): void {
    const have = this.feed(url);
    const next: FeedRow = {
      url,
      resolved: have?.resolved ?? null,
      title: have?.title ?? null,
      site: have?.site ?? null,
      etag: have?.etag ?? null,
      modified: have?.modified ?? null,
      error: null,
      ...patch,
    };
    this.db
      .prepare("INSERT OR REPLACE INTO feeds (url, resolved, title, site, etag, modified, checked, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(next.url, next.resolved, next.title, next.site, next.etag, next.modified, next.checked, next.error);
  }

  /** New items in, existing ones refreshed (their words may have been
   *  corrected upstream) with the reader's flags left alone. Returns how many
   *  were new. */
  upsertItems(feed: string, items: readonly ParsedItem[], now: number): number {
    const exists = this.db.prepare("SELECT 1 AS x FROM items WHERE feed = ? AND guid = ?");
    const insert = this.db.prepare(
      "INSERT INTO items (feed, guid, url, title, author, published, content, summary, seen, read, kept) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)",
    );
    const update = this.db.prepare("UPDATE items SET url = ?, title = ?, author = ?, published = ?, content = ?, summary = ? WHERE feed = ? AND guid = ?");
    let fresh = 0;
    // Items arrive newest first; the order they were SEEN in is kept so an
    // undated feed still lists newest first.
    const n = items.length;
    items.forEach((it, i) => {
      if (exists.get(feed, it.guid)) {
        update.run(it.url, it.title, it.author, it.published, it.content, it.summary, feed, it.guid);
      } else {
        insert.run(feed, it.guid, it.url, it.title, it.author, it.published, it.content, it.summary, now + (n - i));
        fresh++;
      }
    });
    this.prune(feed);
    return fresh;
  }

  private prune(feed: string): void {
    const rows = this.db.prepare("SELECT guid FROM items WHERE feed = ? AND read = 1 ORDER BY COALESCE(published, seen) DESC").all(feed) as unknown as { guid: string }[];
    if (rows.length <= KEEP_PER_FEED) return;
    const del = this.db.prepare("DELETE FROM items WHERE feed = ? AND guid = ?");
    for (const r of rows.slice(KEEP_PER_FEED)) del.run(feed, r.guid);
  }

  item(feed: string, guid: string): ItemRow | null {
    const row = this.db.prepare("SELECT * FROM items WHERE feed = ? AND guid = ?").get(feed, guid) as unknown as RawItem | undefined;
    return row ? toItem(row) : null;
  }

  /** Unread items of these feeds, newest first. */
  unread(feeds: readonly string[], limit = 500): ItemRow[] {
    if (feeds.length === 0) return [];
    const marks = feeds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(`SELECT * FROM items WHERE read = 0 AND feed IN (${marks}) ORDER BY COALESCE(published, seen) DESC LIMIT ?`)
      .all(...feeds, limit) as unknown as RawItem[];
    return rows.map(toItem);
  }

  unreadCounts(): Map<string, number> {
    const rows = this.db.prepare("SELECT feed, COUNT(*) AS n FROM items WHERE read = 0 GROUP BY feed").all() as unknown as { feed: string; n: number }[];
    return new Map(rows.map((r) => [r.feed, Number(r.n)]));
  }

  setRead(feed: string, guid: string, read: boolean): boolean {
    const res = this.db.prepare("UPDATE items SET read = ? WHERE feed = ? AND guid = ?").run(read ? 1 : 0, feed, guid);
    return Number(res.changes) > 0;
  }

  /** Every unread item of one feed (or of every feed) read at once. */
  readAll(feed: string | null): number {
    const res = feed === null ? this.db.prepare("UPDATE items SET read = 1 WHERE read = 0").run() : this.db.prepare("UPDATE items SET read = 1 WHERE read = 0 AND feed = ?").run(feed);
    return Number(res.changes);
  }

  setKept(feed: string, guid: string, notePath: string): void {
    this.db.prepare("UPDATE items SET kept = ?, read = 1 WHERE feed = ? AND guid = ?").run(notePath, feed, guid);
  }
}
