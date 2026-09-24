// CAPTURE — the web clipper, the phone's share sheet, and the append that
// quick capture makes (docs/capture.md).
//
// `POST /api/clip` is the one route in this API that answers to something
// other than an admin cookie. A bookmarklet runs on somebody else's page: the
// session cookie is SameSite=Lax and never rides a cross-site POST, and the
// page's own Content-Security-Policy may forbid a fetch to this origin
// altogether. So the clipper carries its own credential — a per-vault token,
// made here, kept in ASTROLABE_DATA (never in the vault: a vault is synced,
// shared and published, and a token in it is a token in the git remote) and
// shown once in Settings → Vault → Clipper, inside the bookmarklet. The
// share sheet on a phone is the other caller: an installed site (the
// manifest, shared/manifest.ts) POSTs the shared page as a FORM, from the
// browser the reader signed in with, so the cookie IS there and the answer
// is a redirect to the note that was just written.
//
// Both callers land in the same two verbs: a page with an address becomes a
// note under `Clips/`; a thought without one is appended under `## Captured`
// in today's note. The arithmetic is shared/capture.ts; this file is the
// door, the credential and the write.

import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import type { Context } from "hono";
import { appendCaptured, CLIPS_FOLDER, clipFileName, clipNote, isClippableUrl, splitSharedText } from "../shared/capture.ts";
import { htmlTitle, htmlToMarkdown } from "../shared/htmlToMarkdown.ts";
import { keptNote } from "../shared/feeds.ts";
import { DAILY_FORMAT_DEFAULT, periodicPath } from "../shared/periodic.ts";
import { stripBidiControls } from "../shared/bidi.ts";
import { clientIp, isPublishLimited } from "./auth.ts";
import { notePathToUrl } from "./blog.ts";
import { invalidateGraph } from "./graphCache.ts";
import { indexFile } from "./indexer.ts";
import { dailyFolder, getSettings } from "./settings.ts";
import { dataDir, siteLanguage, siteName } from "./site.ts";
import { invalidateTree } from "./treeCache.ts";
import { emitEvent, noteExists, readNote, suppressWatcherEcho, VaultError, writeNote } from "./vault.ts";

// ── The token ───────────────────────────────────────────────────────────────

const TOKEN_FILE = "clip-token";
const TOKEN_BYTES = 24;

function tokenFile(): string {
  return path.join(dataDir(), TOKEN_FILE);
}

/** The token on disk, or null when none has been made. Read per call: the
 *  file is one line, and a token rotated by another process (the desktop
 *  app beside a web instance on one data directory) must be seen at once. */
export function clipToken(): string | null {
  try {
    const raw = readFileSync(tokenFile(), "utf8").trim();
    return /^[a-f0-9]{32,}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** The token, made on first ask. 0600 like the session epoch beside it. */
export function ensureClipToken(): string {
  const have = clipToken();
  if (have) return have;
  return rotateClipToken();
}

/** A new token; the old one stops working the moment this returns. This is
 *  the whole revocation story, and it is enough: a bookmarklet is a line in
 *  a browser, and replacing it is dragging the new one to the bar. */
export function rotateClipToken(): string {
  const next = randomBytes(TOKEN_BYTES).toString("hex");
  mkdirSync(dataDir(), { recursive: true });
  writeFileSync(tokenFile(), `${next}\n`, { encoding: "utf8", mode: 0o600 });
  return next;
}

function tokenMatches(given: string): boolean {
  const have = clipToken();
  if (!have) return false;
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(have, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

// A wrong token costs the caller a slot: forty misses in a quarter hour and
// the address is refused until the window passes. The token is 192 random
// bits, so this is not what keeps it safe — it is what keeps a scan from
// filling the log.
const MISS_WINDOW_MS = 15 * 60 * 1000;
const MISS_MAX = 40;
const misses = new Map<string, number[]>();

function missed(ip: string): void {
  const now = Date.now();
  const list = (misses.get(ip) ?? []).filter((t) => now - t < MISS_WINDOW_MS);
  list.push(now);
  misses.set(ip, list);
}

function tooManyMisses(ip: string): boolean {
  const now = Date.now();
  const list = (misses.get(ip) ?? []).filter((t) => now - t < MISS_WINDOW_MS);
  if (list.length === 0) misses.delete(ip);
  else misses.set(ip, list);
  return list.length >= MISS_MAX;
}

// ── The writes ──────────────────────────────────────────────────────────────

// ONE WRITE AT A TIME. Two captures in the same instant — six sheets on six
// devices, a double-tapped bookmarklet, the share sheet and a script — each
// read the note, each append to what they read, and the last write wins over
// the rest: five lines lost, five 200s for them. The mtime precondition on
// writeNote does not catch it, because every read saw the same file. So
// every write this file makes waits for the one before it; the queue is per
// process, which is the whole world for a vault (server/vault.ts holds the
// same assumption).
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}

/** `YYYY-MM-DD` and `HH:MM` on the server's own clock. The client passes its
 *  own when it has one (the sheet); a phone's share sheet does not. */
function localDate(now = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
function localTime(now = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(now.getHours())}:${p(now.getMinutes())}`;
}

/** Today's daily note, by the instance's folder and format
 *  (shared/periodic.ts). The client's own door (client/daily.ts) creates the
 *  note WITH its template before it asks the server to append; this is the
 *  path for a caller that has no client — the share sheet — and a note made
 *  here starts bare. */
export function dailyNotePathToday(): string {
  return periodicPath(dailyFolder(), getSettings().dailyFormat ?? DAILY_FORMAT_DEFAULT, new Date());
}

/** Append `text` under `## Captured` in `target` (today's note when null),
 *  creating the note when it is not there. Resolves to the note's path. */
export function captureLine(target: string | null, text: string, time: string | null): Promise<string> {
  return serial(() => captureLineNow(target, text, time));
}

async function captureLineNow(target: string | null, text: string, time: string | null): Promise<string> {
  const clean = stripBidiControls(text).replace(/\r\n?/g, "\n").trim();
  if (clean === "") throw new VaultError(400, "Nothing to capture", "captureEmpty");
  if (clean.length > 20_000) throw new VaultError(413, "That is a note, not a line", "captureTooLong");
  const rel = target ?? dailyNotePathToday();
  const existed = await noteExists(rel);
  const current = existed ? await readNote(rel) : null;
  const next = appendCaptured(current?.content ?? "", clean, time ?? localTime());
  suppressWatcherEcho(rel);
  const written = await writeNote(rel, next, current?.mtimeMs, "autosave");
  emitEvent({ kind: existed ? "changed" : "created", path: written.path });
  await indexFile(written.path);
  return written.path;
}

/** A free name in `folder` (Clips/ for a clip, the feed's folder for a kept
 *  article): the title's, or the title's with ` (2)`, ` (3)`… A clip never
 *  overwrites — two pages with one title are two notes. */
async function freeClipPath(title: string, fallback: string, folder: string = CLIPS_FOLDER): Promise<string> {
  const file = clipFileName(title, fallback);
  const stem = file.slice(0, -3);
  const dir = folder === "" ? "" : `${folder}/`;
  for (let n = 1; n < 1000; n++) {
    const rel = `${dir}${n === 1 ? stem : `${stem} (${n})`}.md`;
    if (!(await noteExists(rel))) return rel;
  }
  throw new VaultError(409, "A thousand clips with that title already", "clipNoFreeName");
}

export interface ClipRequest {
  url: string | null;
  title: string | null;
  /** The selection as HTML, or the whole page. */
  html: string | null;
  /** The selection as plain text. */
  selection: string | null;
  /** What a share sheet hands over as `text`. */
  text: string | null;
}

export interface ClipOutcome {
  kind: "clipped" | "captured";
  path: string;
}

/** Decide what a clip request is and write it. A request with an address
 *  (in `url`, or inside the shared `text`) is a page and becomes a note under
 *  Clips/; one without is a thought and goes under `## Captured` today. */
export function performClip(req: ClipRequest): Promise<ClipOutcome> {
  return serial(() => performClipNow(req));
}

async function performClipNow(req: ClipRequest): Promise<ClipOutcome> {
  const shared = req.text ? splitSharedText(req.text) : { url: null, rest: "" };
  const url = req.url?.trim() || shared.url;
  if (!url) {
    const thought = [req.selection?.trim(), shared.rest].filter((s): s is string => !!s).join("\n");
    return { kind: "captured", path: await captureLineNow(null, thought, null) };
  }
  if (!isClippableUrl(url)) throw new VaultError(400, "Not a web address", "clipBadUrl");
  const html = req.html && req.html.trim() !== "" ? req.html : null;
  const givenTitle = req.title?.trim() || null;
  const title = stripBidiControls(givenTitle ?? (html ? htmlTitle(html) : null) ?? new URL(url).hostname).replace(/\s+/g, " ").trim();
  let body: string;
  if (html) body = htmlToMarkdown(html, { baseUrl: url });
  else if (req.selection && req.selection.trim() !== "") body = req.selection.trim();
  else body = shared.rest;
  const rel = await freeClipPath(title, new URL(url).hostname);
  const content = clipNote({ title, url, date: localDate(), body });
  suppressWatcherEcho(rel);
  const written = await writeNote(rel, content);
  emitEvent({ kind: "created", path: written.path });
  await indexFile(written.path);
  return { kind: "clipped", path: written.path };
}

// ── Keep: a feed's article, through the clipper's own door ──────────────────

export interface KeepRequest {
  /** Vault-relative folder the note is filed in (the feed's `→ Folder`). */
  folder: string;
  title: string;
  /** The article's address. */
  url: string | null;
  /** The article as HTML — the page, or what the feed carried. */
  html: string | null;
  /** What relative links in `html` resolve against. */
  baseUrl: string | null;
  /** The feed's name, for the `feed:` line. */
  feed: string;
  /** `YYYY-MM-DD` the feed dated it, or null. */
  published: string | null;
  tags: readonly string[];
}

/** Write a kept feed article as a note: the clip's converter
 *  (`htmlToMarkdown`), the clip's naming (never overwrites), the clip's queue
 *  (one write at a time), and the feed's facts in the frontmatter
 *  (shared/feeds.ts `keptNote`). Resolves to the note's path. */
export function performKeep(req: KeepRequest): Promise<string> {
  return serial(async () => {
    const host = req.url && isClippableUrl(req.url) ? new URL(req.url).hostname : "Article";
    const title = stripBidiControls(req.title).replace(/\s+/g, " ").trim() || host;
    const body = req.html && req.html.trim() !== "" ? htmlToMarkdown(req.html, { baseUrl: req.baseUrl ?? req.url }) : "";
    const rel = await freeClipPath(title, host, req.folder);
    const content = keptNote({ title, url: req.url, feed: req.feed, published: req.published, kept: localDate(), tags: req.tags, body });
    suppressWatcherEcho(rel);
    const written = await writeNote(rel, content);
    emitEvent({ kind: "created", path: written.path });
    await indexFile(written.path);
    return written.path;
  });
}

// ── The routes ──────────────────────────────────────────────────────────────

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Mounted BEFORE the auth guard (server/api.ts): the route decides for
 *  itself whether the caller is the admin's browser or a bookmarklet with the
 *  token, and nothing else under /api is reachable through it. */
export const clipRoutes = new Hono();

// A bookmarklet's fetch is cross-origin. It sends `text/plain` so the
// browser does not preflight, and it can only READ the answer when the
// answer says any origin may — which is safe to say: the request carries
// the token and never a cookie (`*` and credentials do not mix).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

/** What an anonymous share-sheet form may weigh before its token is seen. */
const ANONYMOUS_FORM_LIMIT = 256 * 1024;

clipRoutes.options("/clip", (c) => c.body(null, 204, CORS));

clipRoutes.post("/clip", async (c) => {
  const type = c.req.header("content-type") ?? "";
  const asForm = /application\/x-www-form-urlencoded|multipart\/form-data/i.test(type);
  // BEFORE THE BODY IS READ: an anonymous caller must not make the server
  // buffer and parse ten megabytes on its way to a 401. A JSON caller can
  // only authenticate with the session or a bearer header, so with neither
  // the answer is known already; a form (the phone's share sheet) may carry
  // its token inside the body, so it is read — but an anonymous form is
  // capped at a fraction of the general limit, because a share is a title,
  // a URL and a selection, not a page.
  const sessionAllowed = !isPublishLimited(c);
  const bearerHeader = /^Bearer\s+(\S+)$/i.exec(c.req.header("authorization") ?? "")?.[1] ?? null;
  if (!sessionAllowed && bearerHeader === null) {
    if (!asForm) return c.json({ error: "Admin session or clip token required" }, 401, CORS);
    const declared = Number(c.req.header("content-length") ?? "0");
    if (declared > ANONYMOUS_FORM_LIMIT) return c.html(refusedSharePage(), 413);
  }
  let fields: Record<string, unknown>;
  try {
    if (asForm) fields = (await c.req.parseBody()) as Record<string, unknown>;
    else {
      const body = await c.req.json();
      if (typeof body !== "object" || body === null) throw new Error("not an object");
      fields = body as Record<string, unknown>;
    }
  } catch {
    throw new VaultError(400, "Invalid clip body");
  }
  // Who is asking: the admin's own browser (the share sheet, the app), or
  // a bookmarklet carrying the token. A visitor previewing as one is neither.
  const ip = clientIp(c);
  const given = str(fields.token) ?? bearerHeader;
  let allowed = sessionAllowed;
  if (!allowed && given !== null) {
    if (tooManyMisses(ip)) return c.json({ error: "Too many attempts" }, 429, CORS);
    allowed = tokenMatches(given);
    if (!allowed) missed(ip);
  }
  if (!allowed) {
    // A form is a phone's share sheet, and what it shows the reader is this
    // answer: a sentence in the site's language with the way in, not JSON.
    if (asForm) return c.html(refusedSharePage(), 401);
    return c.json({ error: "Admin session or clip token required" }, 401, CORS);
  }
  // Only now: an anonymous caller must not be able to drop the caches
  // (the guarded routes get this from the middleware below the guard).
  invalidateTree();
  invalidateGraph();
  const outcome = await performClip({
    url: str(fields.url),
    title: str(fields.title),
    html: str(fields.html),
    selection: str(fields.selection),
    text: str(fields.text),
  });
  invalidateTree();
  invalidateGraph();
  // A form POST is a navigation (the share sheet): land on the note. A JSON
  // caller (the bookmarklet, the app) gets the answer as data.
  if (asForm) return c.redirect(notePathToUrl(outcome.path), 303);
  return c.json(outcome, 200, CORS);
});

/** The page a share sheet lands on when the browser it runs in holds no
 *  session: the site's language, one sentence, the front door. The words
 *  live here and not in client/i18n.ts because no client is involved — the
 *  phone navigated straight to the API. */
function refusedSharePage(): string {
  const ar = siteLanguage() === "ar";
  const name = siteName();
  const title = ar ? `سجّل الدخول إلى ${name} أولًا` : `Sign in to ${name} first`;
  const body = ar
    ? "لم تصل المشاركة: هذا المتصفح ليس مسجّلًا للدخول. افتح الموقع، سجّل الدخول، ثم شارك مرة أخرى."
    : "The share did not land: this browser is not signed in. Open the site, sign in, then share again.";
  const link = ar ? "افتح الموقع" : "Open the site";
  const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  return (
    `<!doctype html><html lang="${ar ? "ar" : "en"}" dir="${ar ? "rtl" : "ltr"}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>` +
    `<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.25rem;line-height:1.5}</style></head>` +
    `<body><h1>${esc(title)}</h1><p>${esc(body)}</p><p><a href="/">${esc(link)}</a></p></body></html>`
  );
}

/** Admin-only, mounted after the guard: the token the Settings tab prints
 *  into the bookmarklet, and the button that replaces it. */
export const clipAdminRoutes = new Hono();

clipAdminRoutes.get("/clip/token", (c: Context) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  return c.json({ token: ensureClipToken() });
});

clipAdminRoutes.post("/clip/token/rotate", (c: Context) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  return c.json({ token: rotateClipToken() });
});
