// Marginalia: visitor comments under published notes, stored in a local
// SQLite file (node:sqlite — zero dependencies). Opt-in via COMMENTS=on or
// the settings panel (settings.commentsEnabled overrides the env value, live);
// off (the default) keeps the whole feature dark: no db file, routes 404.

import { mkdirSync } from "node:fs";
import path from "node:path";
import { envRead } from "../shared/envName.ts";
import { DatabaseSync } from "node:sqlite";
import type { CommentData } from "../shared/types.ts";
import { stripBidiControls } from "../shared/bidi.ts";
import type { InteractionKind, MentionType } from "../shared/mentions.ts";
import { getSettings } from "./settings.ts";

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_POSTS = 5;

export const AUTHOR_MAX = 40;
export const BODY_MAX = 2000;

let db: DatabaseSync | null = null;
let envOn = false;
let commentsDataDir = path.resolve("data");
let lastOpenErrorAt = 0;

/** Read COMMENTS / ASTROLABE_DATA from the environment. Call once at startup. */
export function initComments(env: NodeJS.ProcessEnv = process.env): void {
  envOn = /^(on|true|1|yes)$/i.test(env.COMMENTS?.trim() ?? "");
  commentsDataDir = path.resolve(envRead(env, "ASTROLABE_DATA")?.trim() || "data");
  if (envOn) openDb();
}

/** Open (or reuse) the comments db. Failures are logged, not thrown — the
 *  feature then just stays dark (commentsEnabled() false). */
function openDb(): void {
  if (db) return;
  try {
    mkdirSync(commentsDataDir, { recursive: true });
    const file = path.join(commentsDataDir, "comments.db");
    const opened = new DatabaseSync(file);
    opened.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS comments (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        notePath  TEXT    NOT NULL,
        author    TEXT    NOT NULL,
        body      TEXT    NOT NULL,
        createdMs INTEGER NOT NULL,
        ip        TEXT    NOT NULL,
        hidden    INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_comments_notePath ON comments (notePath, createdMs);
    `);
    // Migration: databases created before moderation lack the `hidden` column
    // (CREATE TABLE IF NOT EXISTS never touches an existing table). Add it once.
    const cols = opened.prepare("PRAGMA table_info(comments)").all() as unknown as { name: string }[];
    if (!cols.some((col) => col.name === "hidden")) {
      opened.exec("ALTER TABLE comments ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0");
      console.log("astrolabe: comments db migrated — added hidden column");
    }
    // Migration (webmentions and the fediverse, docs/webmentions.md): the
    // same table holds what other sites said about a note. `kind` is the
    // channel (a visitor's form, a webmention, an ActivityPub activity),
    // `type` the gesture (like, repost, reply, mention), `source` the page or
    // actor it came from, `ref` the remote id a later Delete or Undo names.
    // Every existing row is a visitor's comment, which is the default.
    for (const [name, decl] of [
      ["kind", "TEXT NOT NULL DEFAULT 'comment'"],
      ["type", "TEXT"],
      ["source", "TEXT"],
      ["url", "TEXT"],
      ["photo", "TEXT"],
      ["authorUrl", "TEXT"],
      ["ref", "TEXT"],
    ] as const) {
      if (!cols.some((col) => col.name === name)) opened.exec(`ALTER TABLE comments ADD COLUMN ${name} ${decl}`);
    }
    opened.exec("CREATE INDEX IF NOT EXISTS idx_comments_ref ON comments (ref)");
    db = opened;
    console.log(`astrolabe: comments enabled — ${file}`);
  } catch (err) {
    // Warn at most once a minute — this runs on every comments check while
    // the toggle wants comments on but the db cannot open.
    if (Date.now() - lastOpenErrorAt > 60_000) {
      lastOpenErrorAt = Date.now();
      console.error("astrolabe: could not open the comments db:", err);
    }
  }
}

/** COMMENTS alone — what the comments row's "Inherit" would land on. */
export function envCommentsEnabled(): boolean {
  return envOn;
}

/** Is the store wanted for what OTHER SITES say — webmentions accepted, or
 *  the fediverse switch on? Those land in this table (and in moderation)
 *  whether or not the visitor comment form is on: the switch that consents
 *  to one is not the switch for the other. */
export function interactionsWanted(): boolean {
  const s = getSettings();
  return s.webmentions?.accept === true || s.fediverse?.enabled === true;
}

/** The moderation surfaces' gate: the store is open for ANY of its
 *  channels. Opens the db lazily, like the form's switch does. */
export function moderationEnabled(): boolean {
  if (commentsEnabled()) return true;
  if (!interactionsWanted()) return false;
  if (db === null) openDb();
  return db !== null;
}

/** Open the store for a webmention or an activity to land in, whatever the
 *  comment form's switch says. False when it cannot open. */
export function ensureInteractionsStore(): boolean {
  if (db === null) openDb();
  return db !== null;
}

/** Live merge: settings.commentsEnabled when set, else COMMENTS. Turning the
 *  feature on at runtime opens the db lazily right here; turning it off keeps
 *  the db file (and the open handle) but darkens every route/UI surface. */
export function commentsEnabled(): boolean {
  const want = getSettings().commentsEnabled ?? envOn;
  if (want && db === null) openDb();
  return want && db !== null;
}

interface CommentRow {
  id: number;
  notePath: string;
  author: string;
  body: string;
  createdMs: number;
  hidden: number;
  kind: string;
  type: string | null;
  source: string | null;
  url: string | null;
  photo: string | null;
  authorUrl: string | null;
}

const COLUMNS = "id, notePath, author, body, createdMs, hidden, kind, type, source, url, photo, authorUrl";

function toComment(r: CommentRow, moderator: boolean): CommentData {
  const { hidden, kind, type, source, url, photo, authorUrl, ...rest } = r;
  const out: CommentData = { ...rest };
  // A visitor's comment keeps exactly the shape it always had; what came
  // from another site says where.
  if (kind !== "comment") {
    out.kind = kind as InteractionKind;
    if (type) out.type = type as MentionType;
    if (source) out.source = source;
    if (url) out.url = url;
    if (photo) out.photo = photo;
    if (authorUrl) out.authorUrl = authorUrl;
  }
  // Visitors never learn a hidden flag exists; moderators always get it.
  if (moderator) out.hidden = hidden === 1;
  return out;
}

/** All comments for a note, oldest first. The stored IP never leaves the
 *  server. Moderators see hidden comments (flagged); visitors never do. */
export function listComments(notePath: string, moderator = false): CommentData[] {
  if (!db) return [];
  // The form's comments only: what other sites said is the Mentions
  // section's (listInteractions), so nothing is shown twice.
  const sql = `SELECT ${COLUMNS} FROM comments
    WHERE notePath = ? AND kind = 'comment'${moderator ? "" : " AND hidden = 0"} ORDER BY createdMs, id`;
  const rows = db.prepare(sql).all(notePath) as unknown as CommentRow[];
  return rows.map((r) => toComment(r, moderator));
}

/** Comment counts per note path in one query (the blog's commentCount).
 *  Visitors count visible comments only; moderators include hidden ones. */
export function commentCounts(includeHidden: boolean): Map<string, number> {
  const out = new Map<string, number>();
  if (!db) return out;
  const rows = db
    .prepare(
      `SELECT notePath, COUNT(*) AS n FROM comments WHERE kind = 'comment'${includeHidden ? "" : " AND hidden = 0"} GROUP BY notePath`,
    )
    .all() as unknown as { notePath: string; n: number | bigint }[];
  for (const row of rows) out.set(row.notePath, Number(row.n));
  return out;
}

/** Newest comments across every note (moderation panel), hidden included. */
export function listAllComments(limit: number): CommentData[] {
  if (!db) return [];
  const rows = db
    .prepare(
      `SELECT ${COLUMNS} FROM comments ORDER BY createdMs DESC, id DESC LIMIT ?`,
    )
    .all(limit) as unknown as CommentRow[];
  return rows.map((r) => toComment(r, true));
}

/** Flip a comment's hidden flag. True when the row exists. */
export function setCommentHidden(id: number, hidden: boolean): boolean {
  if (!db) return false;
  return db.prepare("UPDATE comments SET hidden = ? WHERE id = ?").run(hidden ? 1 : 0, id).changes > 0;
}

export function addComment(notePath: string, author: string, body: string, ip: string): CommentData {
  if (!db) throw new Error("comments disabled");
  const createdMs = Date.now();
  const result = db
    .prepare("INSERT INTO comments (notePath, author, body, createdMs, ip) VALUES (?, ?, ?, ?, ?)")
    .run(notePath, author, body, createdMs, ip);
  return { id: Number(result.lastInsertRowid), notePath, author, body, createdMs };
}

/** What other sites said about one note — webmentions and fediverse
 *  activities, oldest first. Visitors see the approved ones only. */
export function listInteractions(notePath: string, moderator = false): CommentData[] {
  if (!db) return [];
  const sql = `SELECT ${COLUMNS} FROM comments
    WHERE notePath = ? AND kind <> 'comment'${moderator ? "" : " AND hidden = 0"} ORDER BY createdMs, id`;
  const rows = db.prepare(sql).all(notePath) as unknown as CommentRow[];
  return rows.map((r) => toComment(r, moderator));
}

/** One row as the moderator sees it (re-verify reads its source). */
export function getComment(id: number): CommentData | null {
  if (!db) return null;
  const row = db.prepare(`SELECT ${COLUMNS} FROM comments WHERE id = ?`).get(id) as unknown as CommentRow | undefined;
  return row ? toComment(row, true) : null;
}

export interface InteractionInput {
  notePath: string;
  kind: Exclude<InteractionKind, "comment">;
  type: MentionType;
  author: string;
  body: string;
  source: string;
  url?: string | null;
  photo?: string | null;
  authorUrl?: string | null;
  /** The remote id a later Delete or Undo will name. */
  ref?: string | null;
  /** Filed hidden, i.e. awaiting moderation. */
  hidden: boolean;
  createdMs?: number;
}

/** File what another site said. Author and body are capped and stripped of
 *  bidi controls on the comment form's own terms (server/api.ts). */
export function addInteraction(input: InteractionInput): CommentData {
  if (!db) throw new Error("comments store closed");
  const author = stripBidiControls(input.author).trim().slice(0, AUTHOR_MAX) || "Anonymous";
  const body = stripBidiControls(input.body).trim().slice(0, BODY_MAX);
  const createdMs = input.createdMs ?? Date.now();
  const result = db
    .prepare(
      "INSERT INTO comments (notePath, author, body, createdMs, ip, hidden, kind, type, source, url, photo, authorUrl, ref) VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      input.notePath,
      author,
      body,
      createdMs,
      input.hidden ? 1 : 0,
      input.kind,
      input.type,
      input.source,
      input.url ?? null,
      input.photo ?? null,
      input.authorUrl ?? null,
      input.ref ?? null,
    );
  return getComment(Number(result.lastInsertRowid))!;
}

/** Rewrite what a mention says (a re-verified source that changed), keeping
 *  its moderation state. */
export function updateInteraction(
  id: number,
  input: Pick<InteractionInput, "type" | "author" | "body" | "url" | "photo" | "authorUrl">,
): boolean {
  if (!db) return false;
  return (
    db
      .prepare("UPDATE comments SET author = ?, body = ?, type = ?, url = ?, photo = ?, authorUrl = ? WHERE id = ?")
      .run(
        stripBidiControls(input.author).trim().slice(0, AUTHOR_MAX) || "Anonymous",
        stripBidiControls(input.body).trim().slice(0, BODY_MAX),
        input.type,
        input.url ?? null,
        input.photo ?? null,
        input.authorUrl ?? null,
        id,
      ).changes > 0
  );
}

/** Remove every row filed under one remote id by one source (a Delete, an
 *  Undo — only the actor that made a thing may take it back). */
export function removeByRef(ref: string, source: string): number {
  if (!db) return 0;
  return Number(db.prepare("DELETE FROM comments WHERE ref = ? AND source = ?").run(ref, source).changes);
}

/** True when a row was actually deleted. */
export function removeComment(id: number): boolean {
  if (!db) return false;
  return db.prepare("DELETE FROM comments WHERE id = ?").run(id).changes > 0;
}

/** Honeypot reply: shaped exactly like a stored comment so bots can't tell.
 *  The id continues the table's real AUTOINCREMENT sequence (sqlite_sequence
 *  survives deletes) with a nudge of jitter, so a probing bot sees ids in the
 *  same range real posts would get instead of a telltale [1e6, 2e6) band.
 *  (A follow-up GET can still notice the row never landed — closing that
 *  would mean persisting spam, which isn't worth it.) */
export function phantomComment(notePath: string, author: string, body: string): CommentData {
  let nextId = 1;
  if (db) {
    try {
      const row = db
        .prepare("SELECT COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'comments'), 0) + 1 AS next")
        .get() as { next: number | bigint } | undefined;
      if (row) nextId = Number(row.next);
    } catch {
      // sqlite_sequence unavailable — fall back to MAX(id) + 1
      const row = db.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS next FROM comments").get() as
        | { next: number | bigint }
        | undefined;
      if (row) nextId = Number(row.next);
    }
  }
  return { id: nextId + Math.floor(Math.random() * 2), notePath, author, body, createdMs: Date.now() };
}

// Sliding-window post limiter, same shape as the login limiter in auth.ts:
// checking never consumes an attempt — only recordCommentPost() does.
const postTimes = new Map<string, number[]>();

export function commentRateLimited(ip: string): boolean {
  const now = Date.now();
  if (postTimes.size > 1000) {
    for (const [key, times] of postTimes) {
      if (times.every((t) => now - t >= RATE_WINDOW_MS)) postTimes.delete(key);
    }
  }
  const recent = (postTimes.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  postTimes.set(ip, recent);
  return recent.length >= RATE_MAX_POSTS;
}

export function recordCommentPost(ip: string): void {
  const times = postTimes.get(ip) ?? [];
  times.push(Date.now());
  postTimes.set(ip, times);
}
