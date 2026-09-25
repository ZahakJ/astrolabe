import { createReadStream, readFileSync, promises as fsp } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { contentTypeFor } from "../shared/attachments.ts";
import { stripNoteExt } from "../shared/noteFormat.ts";
import { DECK_IMPORT_MAX_BYTES, NOTES_IMPORT_MAX_BYTES, UPLOAD_MAX_BYTES } from "../shared/limits.ts";
import { VOICE_MAX_BYTES } from "../shared/voice.ts";
import { editTrackerFence, setTrackerFields, setTrackerProgress, trackerFenceSpans, type TrackerFields } from "../shared/tracker.ts";
import { applyEdit, editRoutinePlan, logEditFor, routineFenceSpans, type EntryPatch } from "../shared/routine.ts";
import { TASK_LINE_RE, toggleTaskLine } from "../shared/tasks.ts";
import type { AliasesResponse, AnchorsResponse, BannerResolution, FrontmatterResult, LanguageFilterMode, NoteState, NoteStatesResponse, NoteWriteResult, PropertyValue, PublishedPaths, PublishResult, TagLabelsResponse, TreeNode, TwinsResponse, XrefResponse } from "../shared/types.ts";
import { authGuard, authRoutes, isPublishLimited } from "./auth.ts";
import { contentDisposition, exportStream, parseExportQuery, planExport, summarize } from "./export.ts";
import { languageScope } from "./language.ts";
import { libraryFor } from "./library.ts";
import { deleteAnnotation, listAnnotations, moveAnnotationsFolder, publicAnnotations, putAnnotation } from "./annotations.ts";
import { visibilityFor, type VisibilityQuery } from "./visibility.ts";
import { commentCounts, commentsEnabled } from "./comments.ts";
import type { FilterLang } from "./indexer.ts";
import { aliasEntries, backlinks, indexFile, indexUnder, isAllowedAttachment, isNotePublished, isNoteVisibleToVisitor, noteAnchors, notesLinkingTo, resolveLink, posts, publishedNotes, publishedPaths, resolveBannerRef, resolveCitekey, resolveEmbed, resolveLabel, search, queryNotes, mentions, tasks, onThisDay, timelineNotes, linkSpellingFor, hasNote, searchMatches, queryPaths, trackers, routines, hadithLookup, twinOf, twinPairs, twinSwapTable, whenIndexed } from "./indexer.ts";
import { sendEncoded } from "./compress.ts";
import { nearbyNotes } from "./nearby.ts";
import { askRoutes } from "./ask.ts";
import { feedRoutes } from "./feedRoutes.ts";
import { importRoutes } from "./importRoutes.ts";
import { hadithKey, parseHadithRef } from "../shared/hadithRefs.ts";
import { graphBody, invalidateGraph, localGraphJson } from "./graphCache.ts";
import { propShelf, tagShelf } from "./shelfCache.ts";
import { invalidateTree, treeBody } from "./treeCache.ts";
import { activeDesignFontRefs } from "./designs.ts";
import { designRoutes } from "./designRoutes.ts";
import { bookRoutes } from "./bookRoutes.ts";
import { epubRoutes } from "./epubRoutes.ts";
import { captureLine, clipAdminRoutes, clipRoutes } from "./clip.ts";
import { voiceRoutes } from "./voice.ts";
import { speakRoutes } from "./speak.ts";
import { deckImportRoutes } from "./deckImportRoutes.ts";
import { searchPages } from "./pdfText.ts";
import { prefsRoutes } from "./prefs.ts";
import { staticPagesActive } from "./pages.ts";
// The three v1.8 bulk verbs: the engine, the tag surgeon, the heading detector.
import { applyBulk, undoBulk } from "./bulkRewrite.ts";
import { anchorsOfContent, forgetRename, observeWrite, rewriteHeadingLinks } from "./headingRepair.ts";
import { addNoteAlias, setNoteFrontmatterLine, setNotePublishFlag, twinSeed } from "./noteFrontmatter.ts";
import { TWIN_KEY, twinLine } from "../shared/twins.ts";
import { frontmatterKeyRefusal, setNoteProperty } from "../shared/frontmatterEdit.ts";
import { buildDesignFontCss, buildFontCss, catalogEntry, fontDir, isCacheFileName, slotsAreSystem } from "./fonts.ts";
import { CUSTOM_FONT_MAX_BYTES, customDir, customMime, isCustomFileName, listCustomFonts } from "./customFonts.ts";
import { fontSlots, moveFolderIcons, moveLibraryFolders, settingsAssetPaths } from "./settings.ts";
// Localised tag labels: display names for canonical tags, plus the query
// rewrite that makes search answer to both spellings.
import { canonicalTag, expandTagQuery, visibleTagLabels } from "./tagLabels.ts";
import { customCssPath, fontsDir, LANGUAGE_FILTER_MODES } from "./site.ts";
import { SEED_GUIDE, seedAvailable, seedVault } from "./seed.ts";
import { VaultError, createFolder, createNote, assertNotePath, deleteAttachment, deleteFolder, deleteNote, emitEvent, getVaultRoot, noteExists, noteMtime, normalizeRel, readNote, suppressWatcherEcho, writeNote } from "./vault.ts";
import { jsonBody, requiredQuery, requiredString } from "./requestBody.ts";
import { moveFolderWithLinkRewrite } from "./renameRoutes.ts";
import { trashRoutes } from "./trashRoutes.ts";
import { tagRoutes } from "./tagRoutes.ts";
import { replaceRoutes } from "./replaceRoutes.ts";
import { fileRoutes } from "./fileRoutes.ts";
import { commentRoutes } from "./commentRoutes.ts";
import { deckRoutes } from "./deckRoutes.ts";
import { settingsRoutes } from "./settingsRoutes.ts";
import { syncRoutes } from "./syncRoutes.ts";
import { versionRoutes } from "./versionRoutes.ts";
import { eventRoutes } from "./eventRoutes.ts";
import { webmentionApi } from "./webmentionRoutes.ts";
import { renameRoutes } from "./renameRoutes.ts";
export type { MoveFolderResponse } from "./renameRoutes.ts";

export const api = new Hono();

// Request-body caps, enforced BEFORE any handler buffers a body into memory
// (hono/body-limit rejects on Content-Length up front and meters chunked
// streams as they arrive). Without this, unauthenticated surfaces that parse
// JSON — login, and comment posting with COMMENTS=on — would buffer arbitrarily
// large bodies before their own field-length checks ran, an easy memory-DoS on
// an internet-exposed instance. The general cap is generous (big vault notes
// over PUT /api/note are legitimate); the anonymous surfaces get much tighter
// ones (a comment is ≤ 2000 chars + ≤ 40 of author; 64 KB covers any honest
// payload, JSON escaping and multibyte included). One path-aware middleware —
// not stacked limiters — so a chunked upload to /api/comments is cut off at
// the tight cap, never buffered up to the big one first. A reverse proxy body
// cap (nginx `client_max_body_size`) is still a sensible extra layer — README.
const API_BODY_MAX = 10 * 1024 * 1024; // 10 MB: any /api request
const COMMENT_BODY_MAX = 64 * 1024; //    64 KB: comment posts + login
// UPLOAD_MAX_BYTES (10 MB: the image itself) is shared/limits.ts — the
// client drop-zone hint states the same number in words.
// The multipart envelope (boundary lines, field headers) rides on top of the
// image bytes, so the wire cap leaves a little headroom above the image cap.
const UPLOAD_BODY_MAX = UPLOAD_MAX_BYTES + 64 * 1024;
// A font upload is its own, tighter cap (CUSTOM_FONT_MAX_BYTES ≈ 5 MB): the
// route sniffs magic bytes, so the only thing this stops is a body that never
// had to be read at all. The multipart envelope rides on top of the file.
const FONT_BODY_MAX = CUSTOM_FONT_MAX_BYTES + 64 * 1024;
// An Anki deck is its media (server/deckImportRoutes.ts): the one body this
// API buffers whole that is honestly allowed to be big.
const DECK_IMPORT_BODY_MAX = DECK_IMPORT_MAX_BYTES + 64 * 1024;
// So is an export for the import wizard (server/importRoutes.ts): a Notion or
// Obsidian zip, an .enex, or a folder's files in one multipart body.
const NOTES_IMPORT_BODY_MAX = NOTES_IMPORT_MAX_BYTES + 1024 * 1024;
// A voice note (server/voice.ts) arrives as multipart from the web client and
// as base64 inside JSON from the Android shell, which is the larger of the
// two: four bytes on the wire for every three of recording.
const VOICE_BODY_MAX = Math.ceil((VOICE_MAX_BYTES * 4) / 3) + 64 * 1024;

function tooLarge(maxBytes: number) {
  return (c: Context) => c.json({ error: `Request body too large (${maxBytes} bytes max)` }, 413);
}

const TIGHT_BODY_PATHS = new Set(["/api/comments", "/api/login"]);
api.use("*", async (c, next) => {
  const post = c.req.method === "POST";
  const max = post && TIGHT_BODY_PATHS.has(c.req.path)
    ? COMMENT_BODY_MAX
    : post && c.req.path === "/api/upload"
      ? UPLOAD_BODY_MAX
      : post && c.req.path === "/api/fonts/upload"
        ? FONT_BODY_MAX
        : post && c.req.path === "/api/orbits/import"
          ? DECK_IMPORT_BODY_MAX
          : post && c.req.path === "/api/import/preview"
            ? NOTES_IMPORT_BODY_MAX
          : post && c.req.path === "/api/voice"
            ? VOICE_BODY_MAX
            : API_BODY_MAX;
  return bodyLimit({ maxSize: max, onError: tooLarge(max) })(c, next);
});

// ── Caching discipline: one middleware, above everything ────────────────────
// EVERY body this API answers varies by session cookie and by the visitor-
// preview header, and none of them said so. /api/tree, /note, /posts, /search,
// /graph, /tags, /backlinks and /me carried NO Cache-Control at all, and
// nothing anywhere carried `Vary`. The README recommends running nginx in
// front, where a shared cache is entitled to reuse a cacheable-looking 200 for
// the next caller — and the object at risk is an admin's entire vault tree
// being handed to an anonymous visitor, or a visitor's published-only tree
// being served back to the admin.
//
// `private, no-store` is the right default for an API whose every answer is
// scoped to who asked; `Vary` states the two dimensions for any cache that
// ignores the first. Both are DEFAULTS: a route that set its own
// Cache-Control keeps it, and the content-addressed font routes (immutable,
// deliberately shared, containing no session-varying byte) are skipped
// entirely so a CDN can still hold them.
// X-Astrolabe-Lang joined the list the moment `languageFilter: "follow"` existed:
// under that mode two readers of the SAME url, with the same (absent) cookie
// and no preview header, get different post lists, different topics, different
// search results and a different graph. A cache that did not know that would
// serve an Arabic reader's collection to an English one — the same class of
// bug the Cookie dimension was added to prevent, one axis over.
const VARY_ON = "Cookie, X-Astrolabe-Preview, X-Astrolabe-Lang, X-Vellum-Preview, X-Vellum-Lang";

api.use("*", async (c, next) => {
  await next();
  const headers = c.res.headers;
  const cache = headers.get("Cache-Control");
  if (cache?.includes("immutable")) return; // content-addressed, session-free
  const vary = headers.get("Vary");
  if (!vary) headers.set("Vary", VARY_ON);
  else if (!/\bcookie\b/i.test(vary)) headers.set("Vary", `${vary}, ${VARY_ON}`);
  if (!cache) headers.set("Cache-Control", "private, no-store");
});

// Auth first: /login, /logout, /me are always reachable; the guard runs before
// every route registered below it (401s mutations without an admin session,
// and gates reads too when PUBLIC=false).
api.route("/", authRoutes);

// Instance styling hook: ASTROLABE_DATA/custom.css, when present, is served to
// admin and visitor alike (registered before the guard + listed in its
// OPEN_PATHS — pure styling leaks nothing, and the login page of a PUBLIC=false
// vault should still carry the instance's look). Existence is checked per
// request so the file can be added or removed without a restart.
api.get("/custom.css", (c) => {
  const file = customCssPath();
  if (!file) return c.json({ error: "No custom.css configured" }, 404);
  return c.body(readFileSync(file, "utf8"), 200, {
    "Content-Type": "text/css; charset=utf-8",
    "Cache-Control": "no-cache",
  });
});

// Custom fonts: GET /api/fonts/<file> serves ASTROLABE_DATA/fonts/<file> for
// @font-face rules in custom.css. Same openness rationale as custom.css
// (registered before the guard + prefix-exempted in it): fonts are pure
// styling, and the login page of a PUBLIC=false vault should still render in
// the instance's typeface. Strictly basename-only (no separators, no
// dotfiles), whitelisted extensions, ETag + immutable long cache.
const FONT_MIME: Record<string, string> = {
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
};

// Typography: the catalog cache under ASTROLABE_DATA/fonts/catalog/<id>/<file>,
// referenced by every src in the generated /api/site-fonts.css. Same openness
// as /api/fonts/<file> above (it is prefix-exempted in the auth guard) and the
// same path discipline, tightened: the directory must be a KNOWN catalog id —
// an allowlist, not a sanitizer — and the filename must match the shape this
// server generates (lowercase slug + .woff2). Nothing else is reachable.
api.get("/fonts/catalog/:id/:file", async (c) => {
  const id = c.req.param("id");
  const file = c.req.param("file");
  if (!catalogEntry(id) || !isCacheFileName(file)) {
    return c.json({ error: "Font not found" }, 404);
  }
  const abs = path.join(fontDir(id), file);
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    const read = await fsp.readFile(abs);
    bytes = new Uint8Array(read.buffer.slice(read.byteOffset, read.byteOffset + read.byteLength));
  } catch {
    return c.json({ error: "Font not found" }, 404);
  }
  const etag = `"${bytes.byteLength.toString(16)}-${id}-${file}"`;
  const ifNoneMatch = c.req.header("if-none-match");
  if (ifNoneMatch && ifNoneMatch.split(",").some((tag) => tag.trim() === etag || tag.trim() === `W/${etag}`)) {
    return c.body(null, 304, { "ETag": etag });
  }
  return c.body(bytes, 200, {
    "Content-Type": "font/woff2",
    "ETag": etag,
    // Content-stable: the cache path changes when the family changes.
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });
});

// The generated typography stylesheet: self-hosted @font-face blocks for the
// chosen catalog faces, three composite families (the Arabic slot's faces
// first, narrowed to the Arabic unicode ranges, so a mixed paragraph picks the
// right face per CHARACTER), then the :root remap of --font-serif/--font-ui/
// --font-mono. Open like custom.css — it IS the public site's typography —
// and it contains no external URL by construction: every src points back at
// /api/fonts/catalog/… on this server.
// It also carries THE ACTIVE DESIGN'S OWN FACES, under their own
// `AstrolabeDsg-<slot>-<id>` families. A visitor must receive the type a
// PUBLISHED design references, and there is one stylesheet on a visitor's page
// where that can happen — this one. Nothing here downloads: the route is open,
// so a stranger must never be able to make this server fetch from Google. A
// family that is not on disk emits nothing at all and the `var(--font-*)`
// beside it in `--dsg-head-font` answers instead; the caching happens where an
// ADMIN saves the design, exactly as it happens where an admin saves a slot.
api.get("/site-fonts.css", async (c) => {
  const slots = fontSlots();
  const refs = activeDesignFontRefs();
  const css =
    slotsAreSystem(slots) && refs.length === 0
      ? "/* No webfonts configured. */\n"
      : (await buildFontCss(slots, { prefix: "Astrolabe", root: true })) +
        (await buildDesignFontCss(refs, slots));
  return c.body(css, 200, {
    "Content-Type": "text/css; charset=utf-8",
    // The link carries a ?v= signature of the picks, so a save shows up at
    // once; the bytes themselves may be revalidated cheaply.
    "Cache-Control": "no-cache",
  });
});

// The uploaded faces, as the Typography tab lists them. It sits HERE, above
// GET /fonts/:file, because that route's `:file` would otherwise swallow the
// word "custom" — and it gates itself rather than leaning on the auth guard,
// because the /api/fonts/ prefix is exempt from the guard for READS (the
// bytes are public; the inventory is not). Same shape as GET /api/settings:
// a visitor, or an admin previewing as one, gets a 404.
api.get("/fonts/custom", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  return c.json(await listCustomFonts());
});

// Uploaded faces (ASTROLABE_DATA/fonts/custom/<file>). Served on exactly the
// terms the catalog cache is — open like custom.css, because a face IS the
// public site's typography and the login page of a PUBLIC=false vault should
// render in it — and with exactly the same path discipline: the name must
// match the shape the uploader GENERATES (lowercase slug + a known font
// extension), so nothing else under the directory is reachable and no caller
// string is ever joined into a path.
api.get("/fonts/custom/:file", async (c) => {
  const file = c.req.param("file");
  if (!isCustomFileName(file)) return c.json({ error: "Font not found" }, 404);
  const abs = path.join(customDir(), file);
  let stat;
  try {
    // lstat, NOT stat: `stat` follows symlinks, so a link planted in the fonts
    // directory served whatever it pointed at. Verified: `symlink.woff2` →
    // /etc/passwd came back 200 with `Content-Type: font/woff2`, to an
    // anonymous request, on a route deliberately exempted from the auth guard
    // so the login page of a private vault can render in the instance's face.
    // Nothing the API does can create such a link (names are generated), but
    // this route reads a directory a human also writes into, and refusing a
    // link outright costs one letter.
    stat = await fsp.lstat(abs);
    if (!stat.isFile()) throw new Error("not a regular file");
  } catch {
    return c.json({ error: `Font not found: ${file}` }, 404);
  }
  const etag = `"${stat.size.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}"`;
  const ifNoneMatch = c.req.header("if-none-match");
  if (ifNoneMatch && ifNoneMatch.split(",").some((tag) => tag.trim() === etag || tag.trim() === `W/${etag}`)) {
    return c.body(null, 304, { "ETag": etag });
  }
  const nodeStream = createReadStream(abs);
  nodeStream.on("error", (err: unknown) => console.error(`font stream error for ${file}:`, err));
  return c.body(Readable.toWeb(nodeStream) as unknown as ReadableStream, 200, {
    "Content-Type": customMime(file),
    "ETag": etag,
    // A replaced face is a new filename (the uploader never overwrites), so
    // these bytes are content-stable like the catalog cache.
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": String(stat.size),
  });
});

api.get("/fonts/:file", async (c) => {
  const file = c.req.param("file");
  // Basename only: reject anything with path separators (a literal "/" can
  // only arrive percent-encoded — Hono decodes params), traversal dots-as-
  // segment, NUL, or a leading dot (dotfiles stay invisible, as everywhere).
  if (
    !file ||
    file.includes("/") ||
    file.includes("\\") ||
    file.includes("\0") ||
    file.startsWith(".") ||
    file !== path.basename(file)
  ) {
    return c.json({ error: "Invalid font path" }, 400);
  }
  const ext = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
  const mime = FONT_MIME[ext];
  if (!mime || !file.includes(".")) {
    return c.json({ error: "Unsupported font type (woff2, woff, ttf, otf)" }, 400);
  }
  const abs = path.join(fontsDir(), file);
  let stat;
  try {
    // lstat for the reason the custom-font route above states: this one is the
    // custom.css escape hatch, so the directory it reads is written by hand.
    stat = await fsp.lstat(abs);
    if (!stat.isFile()) throw new Error("not a regular file");
  } catch {
    return c.json({ error: `Font not found: ${file}` }, 404);
  }
  const etag = `"${stat.size.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}"`;
  const headers: Record<string, string> = {
    "Content-Type": mime,
    "ETag": etag,
    // Fonts are content-stable assets: cache hard, revalidate never. A font
    // swap ships as a new filename (and a custom.css edit, served no-cache).
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  };
  const ifNoneMatch = c.req.header("if-none-match");
  if (ifNoneMatch && ifNoneMatch.split(",").some((t) => t.trim() === etag || t.trim() === `W/${etag}`)) {
    return c.body(null, 304, { "ETag": etag });
  }
  const nodeStream = createReadStream(abs);
  nodeStream.on("error", (err: unknown) => console.error(`font stream error for ${file}:`, err));
  return c.body(Readable.toWeb(nodeStream) as unknown as ReadableStream, 200, {
    ...headers,
    "Content-Length": String(stat.size),
  });
});

// The clipper (server/clip.ts) sits ABOVE the guard on purpose: a
// bookmarklet on somebody else's page has no cookie to show, so `POST
// /api/clip` checks its own token (or the admin session, when there is one)
// and nothing else is reachable through it — its OPTIONS answers a CORS
// preflight and its POST is the whole surface.
api.route("/", clipRoutes);

api.use("*", authGuard);

// Any write can reshape the vault, and the watcher that would notice is
// debounced 100 ms — long enough for the client's own "create note, then
// refetch the tree" round trip to be answered from a stale memo. Dropping it
// up front costs one directory walk on the next read and removes the race
// entirely. See server/treeCache.ts for the full invalidation contract.
api.use("*", async (c, next) => {
  const writes = c.req.method !== "GET" && c.req.method !== "HEAD";
  if (writes) {
    invalidateTree();
    invalidateGraph();
  }
  await next();
  // Again on the way out: a concurrent read that arrived mid-write could have
  // re-memoized the pre-write state between those two points.
  if (writes) {
    invalidateTree();
    invalidateGraph();
  }
});

api.onError((err, c) => {
  if (err instanceof VaultError) {
    // `code` rides beside `error` when the thrower named one: the prose is for
    // logs and curl, the code is what a localized UI can translate.
    return c.json(
      err.code ? { error: err.message, code: err.code } : { error: err.message },
      err.status as ContentfulStatusCode,
    );
  }
  console.error("api error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// Visitors (hash configured, no admin session) see the vault as a flat curated
// collection: only published notes, no folder structure, names are titles.
function publishedTree(lang: FilterLang): TreeNode {
  const children: TreeNode[] = publishedNotes(lang)
    .map(({ path: notePath, title }) => ({ name: title, path: notePath, type: "file" as const }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return { name: path.basename(getVaultRoot()), path: "", type: "folder", children };
}

// The admin tree carries the vault's ATTACHMENTS as well as its notes (each
// non-markdown file gets a TreeNode.attachment marker) — a Media/ folder that
// expanded to nothing was read by a real owner as "my files are missing".
// The visitor tree does not, and cannot: publishedTree() is built from
// publishedNotes() alone, so no filename outside the published set is ever
// named to a visitor (or to an admin previewing as one), whatever the sidebar
// is showing at the time. Attachment BYTES stay gated by /api/file's
// allowlist check either way.
api.get("/tree", async (c) => {
  const limited = isPublishLimited(c);
  // The visitor tree is NOT memoized here: it is language-scoped, so it varies
  // per reader (the cache would need the lang in its key, and this arm is a
  // filter over an in-memory set rather than a disk walk).
  if (limited) return c.json(publishedTree(languageScope(c, limited).lang));
  // The ADMIN tree is memoized (server/treeCache.ts): the walk, its JSON and
  // its compressed forms are rebuilt only after something could have changed
  // the vault's shape. Was a full recursive readdir per request — ~29 ms and
  // 171 kB on the 1,388-note fixture, asked for on every vault event.
  return sendEncoded(c, await treeBody());
});

api.get("/note", async (c) => {
  const notePath = requiredQuery(c.req.query("path"), "path");
  if (isPublishLimited(c) && !isNotePublished(normalizeRel(notePath))) {
    throw new VaultError(404, `Note not found: ${normalizeRel(notePath)}`);
  }
  return c.json(await readNote(notePath));
});

/** How many notes one revalidation may ask about. The caller is a client's set
 *  of OPEN TABS, not its vault: a request naming more than this is a bug or an
 *  abuse, and either way `/api/tree` is the route for "tell me about
 *  everything". */
const NOTE_STATE_MAX = 64;

// "IS WHAT I AM HOLDING STILL THE FILE?" — asked about the open tabs, answered
// in one round trip, without their bodies.
//
// THE INCIDENT THIS EXISTS FOR: one vault, two servers — the desktop app's
// child server and a systemd instance behind the web admin. A note was
// published from the web; the desktop app had been running for days with that
// note's buffer loaded from BEFORE the publish. Each server watches the vault
// for its OWN subscribers, so the "changed" frame that would have refreshed
// the desktop buffer was addressed to a stream that had long since dropped,
// and EventSource replays nothing it missed. The write precondition
// (`writeNote`, below in this file at `PUT /api/note`) still refused the stale
// save — nothing was lost — but the client had no way to LEARN it was stale
// until it tried to write, which is the worst possible moment to find out.
//
// So the client re-asks on every wake: an SSE reconnect, or the window
// becoming visible again. Clean buffers reload silently; a dirty one gets the
// conflict strip there and then.
api.get("/note/state", async (c) => {
  const asked = c.req.queries("path") ?? [];
  if (asked.length === 0) throw new VaultError(400, 'Query parameter "path" is required');
  if (asked.length > NOTE_STATE_MAX) {
    throw new VaultError(400, `Too many paths (${NOTE_STATE_MAX} max)`);
  }
  const limited = isPublishLimited(c);
  const states: NoteState[] = [];
  for (const asking of asked) {
    const notePath = normalizeRel(asking);
    // A visitor learns nothing here that /api/note would not already tell
    // them, and learns it the same way: an unpublished note is not "hidden",
    // it is ABSENT. `null` is also what a deleted note answers, so the two
    // are indistinguishable to a caller who was never allowed to tell them
    // apart.
    if (limited && !isNotePublished(notePath)) {
      states.push({ path: notePath, mtimeMs: null });
      continue;
    }
    states.push({ path: notePath, mtimeMs: await noteMtime(notePath).catch(() => null) });
  }
  const response: NoteStatesResponse = { states };
  return c.json(response);
});

/** The optional `baseMtimeMs` write precondition off a request body. Validated
 *  here; enforced by `writeNote`, next to the write it guards. Only the
 *  editor's buffer registry sends it — the publish toggle, the banner setter,
 *  the section writer and the rename link-rewrite each derive a whole file from
 *  the one they are about to replace, and keep today's behaviour. */
function baseMtime(body: Record<string, unknown>): number | undefined {
  const base = body.baseMtimeMs;
  if (base === undefined || base === null) return undefined;
  if (typeof base !== "number") {
    throw new VaultError(400, 'Body field "baseMtimeMs" must be a number');
  }
  return base;
}

api.put("/note", async (c) => {
  const path = requiredQuery(c.req.query("path"), "path");
  const body = await jsonBody(c);
  if (typeof body.content !== "string") {
    throw new VaultError(400, 'Body field "content" must be a string');
  }
  // Same ordering discipline as /api/publish and /api/frontmatter, and for
  // the same reason: the SSE visitor filter (visitorEvent) samples visibility
  // BEFORE the event and again after, so an event that arrives after the
  // reindex reads the post-edit state as "was". Letting the watcher's
  // debounced echo carry this write did exactly that — an edit that turned a
  // visible note into a hidden one (language flip, publish line removed)
  // emitted nothing at all instead of the mandated "deleted", leaving the
  // visitor's sidebar holding a live link to a note the site now hides; the
  // reverse edit emitted "changed" where the contract requires "created".
  // This is the editor's own save path, i.e. the common case.
  const existed = await noteExists(path);
  // The anchor table as the INDEX still has it — i.e. before this write. It is
  // read here, three statements early, because `indexFile()` below replaces it;
  // it costs nothing (the record is in memory) and it is the entire input to
  // heading-rename detection. See server/headingRepair.ts for why the write
  // path is the seam and the editor is not.
  const anchorsBefore = noteAnchors(path);
  suppressWatcherEcho(path);
  const written = await writeNote(path, body.content, baseMtime(body));
  emitEvent({ kind: existed ? "changed" : "created", path: written.path });
  // Index now rather than after the watcher debounce, so an immediately
  // following rename/search sees this note's links.
  await indexFile(written.path);
  const result: NoteWriteResult = { ...written };
  if (existed) {
    const offer = await headingRepairOffer(written.path, anchorsBefore, body.content);
    if (offer) result.headingRepair = offer;
  }
  return c.json(result);
});

/** Which notes could carry a `[[…#anchor]]` into `relPath`, minus the note
 *  itself. Its own buffer is open in the editor that just saved it, and
 *  rewriting the file underneath that buffer is exactly the divergence
 *  client/editor/buffers.ts spends a whole module avoiding. */
function headingLinkSources(relPath: string): string[] {
  return notesLinkingTo(relPath).filter((source) => source !== relPath);
}

/** One note's `[[…#from]]` links into `relPath`, rewritten or merely counted.
 *  `to === null` counts: the same walk, the same matcher, no edit — so the
 *  number in the offer and the number in the toast cannot disagree. */
function headingLinkPass(
  relPath: string,
  text: string,
  from: { id: string; title: string },
  to: { id: string; title: string } | null,
): { text: string; count: number } {
  return rewriteHeadingLinks(
    text,
    (target) => resolveLink(target, false, null) === relPath,
    from,
    to ?? from,
  );
}

/** The write path's one extra question: "did that rename a heading other notes
 *  link into?" — asked after every save, and answered `null` for the ninety-nine
 *  saves in a hundred that renamed nothing. Detection is free (both anchor
 *  tables are already in hand); the reads below happen only once a rename is on
 *  the table. */
async function headingRepairOffer(
  relPath: string,
  before: ReturnType<typeof noteAnchors>,
  content: string,
): Promise<NoteWriteResult["headingRepair"] | null> {
  const rename = observeWrite(relPath, before, content);
  if (rename === null) return null;
  const from = { id: rename.from, title: rename.fromTitle };
  let links = 0;
  for (const source of headingLinkSources(relPath)) {
    try {
      links += headingLinkPass(relPath, (await readNote(source)).content, from, null).count;
    } catch {
      // A note the index still names and the disk no longer has contributes
      // nothing — it is not a reason to withhold the offer for the rest.
    }
  }
  return links === 0 ? null : { ...rename, links };
}

/** The same write, reachable by `navigator.sendBeacon`.
 *
 *  It exists for exactly one moment: the tab is closing with unsaved text in it.
 *  A `fetch` started in `beforeunload` is cancelled with the document, and
 *  `keepalive` is capped and unreliable across browsers; `sendBeacon` is the one
 *  transport the platform promises to deliver after the page is gone — and it
 *  is POST-only, which is the entire reason this route is a POST of something
 *  `PUT /note` already does.
 *
 *  Everything else about it is identical, including the precondition: a
 *  last-gasp save that clobbers a newer version is still a clobber, and the
 *  reader who caused it is by definition not there to be asked.
 *
 *  One deliberate difference: it does NOT look for a renamed heading. The
 *  offer that would raise is a toast with a button, and this route runs while
 *  the page is being torn down — there is nobody left to press it, and a
 *  `sendBeacon` has no response to carry it in either. */
api.post("/note/flush", async (c) => {
  const body = await jsonBody(c);
  const path = requiredString(body, "path");
  if (typeof body.content !== "string") {
    throw new VaultError(400, 'Body field "content" must be a string');
  }
  const existed = await noteExists(path);
  suppressWatcherEcho(path);
  const written = await writeNote(path, body.content, baseMtime(body));
  emitEvent({ kind: existed ? "changed" : "created", path: written.path });
  await indexFile(written.path);
  return c.json(written);
});

api.post("/note", async (c) => {
  const body = await jsonBody(c);
  const path = requiredString(body, "path");
  const created = await createNote(path);
  await indexFile(path);
  return c.json(created);
});

/** THE STARTER VAULT, ON A CLICK.
 *
 *  Boot used to copy `vault-seed/` into any vault directory that held no
 *  markdown — including one the reader had made themselves and pointed us at
 *  (server/seed.ts argues the case). Taking that away without giving the offer
 *  a door would leave a first-run reader looking at an empty tree with a guide
 *  they can never find, so here is the door: the empty state asks, this
 *  answers, and the reader gets the same five notes they used to be given
 *  without being asked.
 *
 *  GET reports whether the offer is even available (a seed to copy, and
 *  nothing of the reader's to copy it over). Both are admin-only in the shape
 *  every owner-surface uses — a 404 to a visitor, never a 403, so an anonymous
 *  caller learns nothing about the instance. */
api.get("/seed", (c) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  return c.json({ available: seedAvailable(getVaultRoot()), guide: SEED_GUIDE });
});

api.post("/seed", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  const guide = seedVault(getVaultRoot());
  if (guide === null) {
    // Not an error the reader caused: the vault filled up between the offer
    // and the answer (another window, a sync), and the honest answer is that
    // there is nothing left to seed rather than five files over their notes.
    throw new VaultError(409, "This vault already has notes in it", "seedNotEmpty");
  }
  // The watcher will find the files on its own debounce; the index must not
  // wait for it, because the client opens the guide on this response.
  await indexUnder("");
  emitEvent({ kind: "created", path: guide });
  return c.json({ guide });
});

// Rename and folder move, links rewritten (server/renameRoutes.ts).
api.route("/", renameRoutes);

// Delete ONE note. Same two-speed contract as DELETE /api/folder, and for the
// same reason: the default MOVES the file to `.trash/` (recoverable from disk,
// invisible to tree/index/watcher), `?permanent=true` removes it for good.
// The parameter is spelled and parsed exactly like the folder route's —
// `1`/`true`/`yes`/`on` — so one rule covers both delete verbs.
api.delete("/note", async (c) => {
  const notePath = requiredQuery(c.req.query("path"), "path");
  const permanent = TRUTHY_QUERY.has((c.req.query("permanent") ?? "").toLowerCase());
  const result = await deleteNote(notePath, { permanent });
  // Await the index the way DELETE /api/folder does: the client refetches
  // /api/tree, /api/graph and the published count on this 200, and a note that
  // is still in the index when they answer is a note the reader sees a second
  // time in their own search results.
  await whenIndexed();
  return c.json({ ok: true, ...result });
});

api.post("/folder", async (c) => {
  const body = await jsonBody(c);
  await createFolder(requiredString(body, "path"));
  return c.json({ ok: true });
});

// Move a folder and everything under it to a new vault-relative path — the
// server half of dragging a folder onto another folder in the tree. Same
// `{ path, toPath }` body as /api/rename, because to the reader dragging a note
// and dragging a folder are one gesture. Admin-only (the auth guard 401s every
// non-GET, preview sessions included), and every refusal — into its own
// descendant, onto an existing name, a symlinked folder — happens before a byte
// moves. See moveFolderWithLinkRewrite for the ordering.
api.post("/folder/move", async (c) => {
  const body = await jsonBody(c);
  const from = requiredString(body, "path");
  const to = requiredString(body, "toPath");
  const result = await moveFolderWithLinkRewrite(from, to);
  moveAnnotationsFolder(from, to);
  // A FOLDER'S GLYPH IS PART OF THE FOLDER. settings.folderIcons is keyed by
  // path, and this route is where a folder's path changes — rename and move
  // are the same operation here (Sidebar's renameTo dispatches both to it).
  // Without this, renaming `Games` to `Play` left the mark on a key nothing
  // matches: the glyph vanished and came back only if the owner happened to
  // rename it back. The subtree comes along; a marked child keeps its mark.
  // AFTER the move, never before — a refusal (into its own descendant, onto
  // an existing name) must not have moved anything, settings included.
  moveFolderIcons(from, to);
  // A LIBRARY PATH IS A FOLDER, so a folder's path changing is the path's own
  // address changing. Without this the row kept naming a folder the vault no
  // longer had: the path vanished from /library and every published note
  // inside it came back as a blog post. Same ordering argument as the glyph —
  // after the move, so a refusal moves nothing, settings included.
  moveLibraryFolders(from, to);
  return c.json(result);
});

// Delete a folder and everything under it. Default is Obsidian's safe move to
// `.trash/` at the vault root; `?permanent=true` removes it for good. Admin-only
// (the auth guard 401s every non-GET, preview sessions included). The index is
// updated synchronously — vault.deleteFolder emits the synthetic dir-delete —
// so the /api/graph, /api/search and published counts the UI refetches right
// after are already correct.
const TRUTHY_QUERY = new Set(["1", "true", "yes", "on"]);

api.delete("/folder", async (c) => {
  const folderPath = requiredQuery(c.req.query("path"), "path");
  const permanent = TRUTHY_QUERY.has((c.req.query("permanent") ?? "").toLowerCase());
  const result = await deleteFolder(folderPath, { permanent });
  // The glyph goes with the folder, at both speeds. A trashed folder that is
  // fished back out of `.trash/` by hand comes back unmarked, and that is the
  // right trade: the alternative is a settings.json that accumulates a mark
  // for every folder the vault has ever had, forever, and hits its cap on a
  // vault the owner would describe as small.
  moveFolderIcons(folderPath, null);
  // The row and the root go with the folder, on the same argument.
  moveLibraryFolders(folderPath, null);
  await whenIndexed();
  return c.json(result);
});

// Delete ONE attachment, at the same two speeds as a note and a folder. The
// tree has listed a vault's images, PDFs and recordings since attachments
// landed, and offered no verb on a single one of them: the only way to remove
// a stale upload was to delete the folder around it, which is precisely the
// gesture that lost the owner a published essay's images. Admin-only via the
// auth guard (DELETE). vault.deleteAttachment emits its own synthetic event,
// so the index is settled before the answer.
api.delete("/attachment", async (c) => {
  const filePath = requiredQuery(c.req.query("path"), "path");
  const permanent = TRUTHY_QUERY.has((c.req.query("permanent") ?? "").toLowerCase());
  const result = await deleteAttachment(filePath, { permanent });
  await whenIndexed();
  return c.json({ ok: true, ...result });
});

// The delete preview and the trash (server/trashRoutes.ts).
api.route("/", trashRoutes);

// Toggle a note's publish flag with a surgical frontmatter line edit — every
// other byte of the file is preserved. Admin-only via the auth guard (POST).
api.post("/publish", async (c) => {
  const body = await jsonBody(c);
  const notePath = requiredString(body, "path");
  if (typeof body.publish !== "boolean") {
    throw new VaultError(400, 'Body field "publish" must be a boolean');
  }
  const note = await readNote(notePath);
  // Format-aware: markdown gets its `---` YAML line, LaTeX its `%---%` comment
  // block. Same surgical contract either way — every other byte is preserved.
  const updated = setNotePublishFlag(note.path, note.content, body.publish);
  if (updated !== note.content) {
    // The synthetic event below is the whole story — swallow the watcher's
    // redundant echo of this write so listeners don't see the toggle twice.
    suppressWatcherEcho(note.path);
    // THE READ-MODIFY-WRITE CARRIES ITS OWN PRECONDITION. This route derives a
    // whole file from the one it is about to replace, and its read is three
    // statements up — a window of MILLISECONDS, not the days a client's buffer
    // can hold — so it was left unconditional for a long time. That was an
    // argument about how likely the race is, not about what happens when it
    // lands: with a second server writing the same vault, the loser is a
    // frontmatter line silently reverting, which is exactly this feature's
    // incident. `note.mtimeMs` is free (readNote stat'd the file already) and
    // turns "unlikely" into "impossible".
    await writeNote(note.path, updated, note.mtimeMs);
    // Broadcast BEFORE reindexing so the SSE visitor filter can observe the
    // publish state both before and after (created/deleted transitions).
    emitEvent({ kind: "changed", path: note.path });
  }
  await indexFile(note.path);
  const result: PublishResult = { ok: true, path: note.path, published: isNotePublished(note.path) };
  return c.json(result);
});

// Surgical frontmatter property setter (admin-only via the auth guard).
// Same machinery as /api/publish: byte-surgical edit, watcher-echo
// suppression, immediate reindex.
//
// THE ALLOWLIST BECAME A POLICY (v1.8 spec K). Two keys — `banner`, `folders` —
// was the right shape while this product owned both of them; it is the wrong
// shape for a properties card, whose whole job is the keys ASTROLABE DOES NOT KNOW
// ABOUT. A vault imported from Obsidian carries `cssclasses`, `rating`,
// `status`, `source`, whatever the author invented, and a card that can show
// them but not edit them is the Obsidian complaint verbatim.
//
// So: arbitrary keys, guarded by SHAPE rather than by name — a single-line
// identifier, capped, no control characters, nothing that could smuggle a
// second YAML line into the block (shared/frontmatterEdit.ts owns that half,
// including the `.tex` comment-block rule that a non-ASCII key would break the
// whole block) — with one closed set of exceptions:
//
//   publish             has its own route, which broadcasts, re-filters the SSE
//                       visitor stream and re-counts the public site. Reaching
//                       it through here would set the flag and tell nobody.
//   id / uuid / guid    machine bookkeeping. Another tool's primary key is not
//   dg-* / dg_*         a property the reader meant to retype, and rewriting
//                       one silently breaks whatever syncs against it.
//
// The card renders exactly that set faint and read-only (isMachineKey,
// client/editor/noteMeta.ts), so the refusal below is the second gate, not the
// first — which is the arrangement every mutating surface in this product uses.
const PROTECTED_KEYS = /^(?:publish|id|uuid|guid|dg[-_].*)$/i;
const FRONTMATTER_VALUE_MAX = 500;
/** A property, not a database: chips a reader can actually read. */
const FRONTMATTER_LIST_MAX = 64;

/** One line, no control characters, capped — the discipline every frontmatter
 *  write in this file has applied since v1.2, in one place now that the values
 *  arriving here come from a card instead of from two hard-coded callers. */
function frontmatterText(raw: unknown, what: string): string {
  if (typeof raw !== "string") throw new VaultError(400, `${what} must be a string`);
  const value = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  if (value.length > FRONTMATTER_VALUE_MAX) {
    throw new VaultError(400, `${what} too long (${FRONTMATTER_VALUE_MAX} characters max)`);
  }
  return value;
}

/** The wire's `value` → the typed value the writer spells. A bare string (or
 *  `null`) is the pre-v1.8 shape and still means "text" (or "remove"). */
function frontmatterValue(raw: unknown): PropertyValue | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "string") {
    const text = frontmatterText(raw, 'Body field "value"');
    return text === "" ? null : { kind: "text", text };
  }
  if (typeof raw !== "object") {
    throw new VaultError(400, 'Body field "value" must be a string, an object or null');
  }
  const v = raw as Record<string, unknown>;
  switch (v.kind) {
    case "text": {
      const text = frontmatterText(v.text, 'Property field "text"');
      return text === "" ? null : { kind: "text", text };
    }
    case "bool":
      if (typeof v.bool !== "boolean") {
        throw new VaultError(400, 'Property field "bool" must be a boolean');
      }
      return { kind: "bool", bool: v.bool };
    case "date": {
      const date = frontmatterText(v.date, 'Property field "date"');
      if (date === "") return null;
      // It is written UNQUOTED, so it has to be a date YAML reads as one.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new VaultError(400, "A date property must be spelled YYYY-MM-DD");
      }
      return { kind: "date", date };
    }
    case "list": {
      if (!Array.isArray(v.items)) {
        throw new VaultError(400, 'Property field "items" must be an array');
      }
      if (v.items.length > FRONTMATTER_LIST_MAX) {
        throw new VaultError(400, `Too many values (${FRONTMATTER_LIST_MAX} max)`);
      }
      const items: string[] = [];
      for (const item of v.items) {
        const text = frontmatterText(item, "A list value");
        if (text !== "") items.push(text);
      }
      return { kind: "list", items };
    }
    default:
      throw new VaultError(400, `Unknown property kind: ${String(v.kind)}`);
  }
}

api.post("/frontmatter", async (c) => {
  const body = await jsonBody(c);
  const notePath = requiredString(body, "path");
  const key = requiredString(body, "key");
  if (PROTECTED_KEYS.test(key)) {
    throw new VaultError(400, `Frontmatter key not editable: ${key}`);
  }
  const value = frontmatterValue(body.value);
  const note = await readNote(notePath);
  // Shape guard second, so a key that names a protected machine field answers
  // the same way whatever its spelling looks like.
  const refusal = frontmatterKeyRefusal(note.path, key);
  if (refusal !== null) throw new VaultError(400, refusal);
  const updated = setNoteProperty(note.path, note.content, key, value);
  if (updated !== note.content) {
    suppressWatcherEcho(note.path);
    // Same precondition as /api/publish, for the same reason: a line edit
    // derived from a file somebody else replaced mid-request writes back every
    // byte of the version it read, banner line included.
    await writeNote(note.path, updated, note.mtimeMs);
    emitEvent({ kind: "changed", path: note.path });
  }
  await indexFile(note.path);
  const result: FrontmatterResult = { ok: true, path: note.path, key, value };
  return c.json(result);
});

// Every alias in the vault — the name table the client cannot derive.
//
// `[[` autocomplete builds its list from the tree in the store, and a tree
// carries filenames: an alias lives in frontmatter the client has never read.
// Without this, a vault's aliases resolved when typed in full and could not be
// COMPLETED, which is the same feature working in one place and missing in the
// place the author actually reaches for it.
//
// Visitor-scoped exactly as resolution is (`aliasEntries` applies the same
// filter), so an alias can never name a note a visitor may not discover.
api.get("/aliases", (c) => {
  const limited = isPublishLimited(c);
  const response: AliasesResponse = { aliases: aliasEntries(limited, languageScope(c, limited).lang) };
  return c.json(response);
});

/** A name, not a paragraph — the same ceiling a frontmatter value gets. */
const ALIAS_MAX = 200;

// Add one alias to a note's frontmatter — the write behind "keep the old title
// as an alias" after a rename. Merging and format (a `.tex` note's aliases live
// in its comment block) belong to server/noteFrontmatter.ts; this route is the
// same read-edit-write-reindex shape /api/frontmatter uses, including the
// watcher-echo suppression that stops the edit arriving twice.
api.post("/alias", async (c) => {
  const body = await jsonBody(c);
  const notePath = requiredString(body, "path");
  // Same discipline as /api/frontmatter: one line, no control characters — a
  // frontmatter write must never be able to smuggle extra YAML into the block.
  const alias = requiredString(body, "alias").replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  if (!alias) throw new VaultError(400, 'Body field "alias" must not be blank');
  if (alias.length > ALIAS_MAX) {
    throw new VaultError(400, `Alias too long (${ALIAS_MAX} characters max)`);
  }
  const note = await readNote(notePath);
  const updated = addNoteAlias(note.path, note.content, alias);
  if (updated !== note.content) {
    suppressWatcherEcho(note.path);
    // Same precondition as /api/publish and /api/frontmatter.
    await writeNote(note.path, updated, note.mtimeMs);
    emitEvent({ kind: "changed", path: note.path });
  }
  await indexFile(note.path);
  return c.json({ ok: true, path: note.path, alias });
});

// ==================================================== bulk rewrites (v1.8)
//
// Three routes over one engine (server/bulkRewrite.ts), and one route to take
// any of them back. Everything here is ADMIN-ONLY at both gates a mutating
// owner surface uses: the auth guard 401s every non-GET, and the GET dry-run
// answers a visitor 404 rather than 403 — the preview names vault paths, which
// is exactly what /attachments and /published withhold.
//
// Every one of them is a DRY RUN FIRST. Nothing in this product may rewrite two
// hundred files on a click without having shown, in a number the reader can
// read, what it is about to do — and the number has to come from the writer
// itself, not from a second estimate that can drift away from it.

/** Take back a bulk edit — the Undo button on the toast every route below
 *  raises. `410` means the offer has expired (the bundle's TTL, or four more
 *  bulk edits since), which the client says in words rather than as an error. */
api.post("/bulk/undo", async (c) => {
  const body = await jsonBody(c);
  const undoId = requiredString(body, "undoId");
  return c.json(await undoBulk(undoId));
});

// ------------------------------------------------- heading-link repair
//
// The offer that raised this ride on PUT /api/note's own response — the seam
// argued in server/headingRepair.ts. This is where it is taken.
//
// The client sends what it was offered, and the server checks the offer against
// the note as it stands NOW: `to` must be a real anchor in the file. That guard
// is what keeps this from being "rewrite any wikilink tail in the vault to any
// string" — a route the auth guard would happily allow an admin to misuse by
// accident (a stale toast from a note they have since edited again).

api.post("/links/heading-repair", async (c) => {
  const body = await jsonBody(c);
  const notePath = normalizeRel(requiredString(body, "path"));
  assertNotePath(notePath);
  const fromId = requiredString(body, "from").trim();
  const fromTitle = typeof body.fromTitle === "string" ? body.fromTitle.trim() : fromId;
  const toId = requiredString(body, "to").trim();
  if (fromId === "" || toId === "") {
    throw new VaultError(400, 'Body fields "from" and "to" must not be blank');
  }

  // The anchor being repaired TO has to exist in the note right now. A stale
  // offer (the reader kept typing, or renamed the heading again) is refused
  // rather than applied to a heading that is no longer there.
  const target = anchorsOfContent(notePath, (await readNote(notePath)).content).find(
    (a) => a.id.toLowerCase() === toId.toLowerCase(),
  );
  if (target === undefined) {
    throw new VaultError(409, `No such heading in ${notePath}: ${toId}`, "headingGone");
  }

  const from = { id: fromId, title: fromTitle };
  const to = { id: target.id, title: target.title };
  const sources = headingLinkSources(notePath);
  const result = await applyBulk(sources, (_p, content) => {
    const next = headingLinkPass(notePath, content, from, to);
    return next.count === 0 ? null : next;
  });
  // The chain is spent: the links now name the heading where it stands, and a
  // second Undo-then-repair round should start from today's text.
  forgetRename(notePath);
  return c.json(result);
});

// Tag rename and merge (server/tagRoutes.ts).
api.route("/", tagRoutes);

// Vault-wide search and replace (server/replaceRoutes.ts).
api.route("/", replaceRoutes);

api.get("/resolve", (c) => {
  const name = requiredQuery(c.req.query("name"), "name");
  // A miss is an EXPECTED outcome (broken embeds are normal in a real vault):
  // answer 200 { path: null } instead of 404 so every visit to a note with
  // broken embeds doesn't spray red network errors across the console.
  const limited = isPublishLimited(c);
  return c.json({ path: resolveEmbed(name, limited, languageScope(c, limited).lang) });
});

// A `banner:` value (or any settings image reference) → the file it names.
//
// The client cannot answer this itself: the ladder ends in the vault-wide
// basename index, and a visitor's tree does not carry attachments at all. A
// miss is 200 `{ path: null }`, like /api/resolve — a typo'd banner is an
// ordinary state of a vault, not a server error — and null is exactly what the
// admin surfaces turn into the "missing image" placeholder and the visitor
// surfaces turn into nothing at all.
//
// `note` is the note the value was read from, and it is what makes
// `banner: cover.png` beside the note work. Visitors are scoped to files
// /api/file would actually serve them, so this can never become a probe for
// which unpublished attachments exist.
api.get("/banner", (c) => {
  const value = requiredQuery(c.req.query("value"), "value");
  const note = c.req.query("note");
  let notePath: string | null = null;
  if (note !== undefined && note !== "") {
    try {
      notePath = normalizeRel(note);
    } catch {
      notePath = null; // an unusable note path just drops the relative rung
    }
  }
  const limited = isPublishLimited(c);
  // A visitor may not use a private note's folder as the search base, and may
  // not learn where anything they cannot fetch lives.
  if (limited && notePath !== null && !isNoteVisibleToVisitor(notePath, languageScope(c, limited).lang)) {
    notePath = null;
  }
  const hit = resolveBannerRef(
    value,
    notePath,
    limited,
    // The two visitor-fetchable sets /api/file itself honours: attachments a
    // published note uses, plus the assets settings names (logo, home banner,
    // favicon). Resolving to a path the very next request would 404 on is the
    // failure this endpoint exists to remove.
    (rel) => isAllowedAttachment(rel) || settingsAssetPaths().has(rel),
  );
  const result: BannerResolution = { value, path: hit };
  return c.json(result);
});

// ------------------------------------------------ anchors & cross-references
//
// One anchor space: a markdown heading and a LaTeX \label are the same kind of
// thing, so these two routes serve `[[Note#anchor]]`, `\ref{Note#anchor}`,
// `![[Paper#eq:fourier]]` and the `#` half of wikilink autocomplete without
// any of them knowing the target's format.

api.get("/anchors", (c) => {
  const notePath = normalizeRel(requiredQuery(c.req.query("path"), "path"));
  // Same gate /api/note applies: a visitor may read a published note, so a
  // visitor may read where its anchors are. Nothing else.
  if (isPublishLimited(c) && !isNotePublished(notePath)) {
    throw new VaultError(404, `Note not found: ${notePath}`);
  }
  const result: AnchorsResponse = { path: notePath, anchors: noteAnchors(notePath) };
  return c.json(result);
});

// A `\ref{sec:method}` or `\cite{knuth1997}` that found nothing LOCAL — the
// caller has already checked its own document, because local-first is what
// keeps an imported project compiling the way it always did. A miss is 200
// with nulls, like /api/resolve: unresolved cross-references are the normal
// state of a bibliography, not an error worth painting red in a console.
api.get("/xref", (c) => {
  const limited = isPublishLimited(c);
  const label = c.req.query("label");
  const cite = c.req.query("cite");
  if (label === undefined && cite === undefined) {
    throw new VaultError(400, "Missing query param: label or cite");
  }
  const result: XrefResponse = { path: null, anchor: null };
  if (label !== undefined && label !== "") {
    const hit = resolveLabel(label, limited, languageScope(c, limited).lang);
    if (hit) {
      result.path = hit.path;
      result.anchor = hit.anchor;
    }
  } else if (cite !== undefined && cite !== "") {
    result.path = resolveCitekey(cite, limited, languageScope(c, limited).lang);
  }
  return c.json(result);
});

// The `astrolabe.sty` a `.tex` note needs to compile OUTSIDE Astrolabe. It is a
// dozen lines and it is the whole reason `\note{…}` is an honest syntax rather
// than a lock-in: drop this beside the document, `\usepackage{astrolabe}`, and
// pdflatex renders the link as a hyperref (or as emphasis when hyperref is not
// loaded). Served to anyone who can reach the instance — it is a constant,
// carries nothing about the vault, and a reader who cannot download it cannot
// compile the paper they were just shown.
const ASTROLABE_STY_PATH = new URL("../assets/astrolabe.sty", import.meta.url).pathname;
let astrolabeStyCache: string | null = null;

const styHeaders = (name: string) => ({
  "Content-Type": "text/x-tex; charset=utf-8",
  "Content-Disposition": `inline; filename="${name}"`,
  "Cache-Control": "public, max-age=3600",
  "X-Content-Type-Options": "nosniff",
});
api.get("/astrolabe.sty", (c) => {
  astrolabeStyCache ??= readFileSync(ASTROLABE_STY_PATH, "utf8");
  return c.body(astrolabeStyCache, 200, styHeaders("astrolabe.sty"));
});
// `vellum.sty` keeps being served, as a package of its own: a paper written
// under the old name carries `\usepackage{vellum}` and `\vellum{…}`, and a
// URL a reader bookmarked must not start answering 404 because the product
// changed its name. The file provides both macro spellings.
const LEGACY_STY_PATH = new URL("../assets/vellum.sty", import.meta.url).pathname;
let legacyStyCache: string | null = null;
api.get("/vellum.sty", (c) => {
  legacyStyCache ??= readFileSync(LEGACY_STY_PATH, "utf8");
  return c.body(legacyStyCache, 200, styHeaders("vellum.sty"));
});

// ------------------------------------------------------- attachment serving

// The served-type table is shared/attachments.ts's (MIME_TYPES), which the
// pocket's /api/file reads too. Re-exported: server/index.ts and manifest.ts
// have always asked this module for it.
export { contentTypeFor };

// Attachments: serving, uploads and the lists (server/fileRoutes.ts).
api.route("/", fileRoutes);

// The admin UI's publish state, from an ADMIN source. The client used to read
// it off /api/tree with `credentials: "omit"` — its own session hidden so the
// server would answer as if to a stranger — which meant the owner's publish
// stars and published filter were built out of the VISITOR tree, and so wore
// the visitor's languageFilter (CONTRACTS.md: "Admin surfaces are never
// filtered"). It also made the whole feature conditional on a password hash
// plus open public reads, so an open local vault silently had no publish
// marks at all. Same 404-not-a-route gate as /attachments: a language-hidden
// published note's path is exactly what the public surfaces withhold.
api.get("/published", (c) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  const body: PublishedPaths = { paths: publishedPaths() };
  return c.json(body);
});

// Comments, the marginalia (server/commentRoutes.ts).
api.route("/", commentRoutes);

// Every discovery surface below resolves ONE scope and hands `scope.lang` down
// (server/language.ts). An admin session gets `null` — no filter, ever.
//
// SEARCH MATCHES BOTH SPELLINGS OF A TAG. `expandTagQuery` appends the
// canonical tag whenever the query holds one of its localised labels, so an
// Arabic reader typing «برمجيات» finds the notes tagged `#software` — without
// the index ever learning about a display setting (see server/tagLabels.ts for
// why the rewrite lives on the query and not in minisearch's `tags` field).
// SEARCH OPERATORS ride the same route (v1.8, parity #7). `tag:`, `path:`,
// `is:published`, `is:page`, `before:`/`after:`, `linkto:`/`linkfrom:` are
// peeled off inside `search()` (server/searchQuery.ts) — there is no second
// endpoint and no mode flag, because the reader types them into the box they
// already have. What this route contributes is the VOCABULARY: both hooks let
// the localised spelling of a tag reach its canonical form, one for the
// operator and one for the loose words, and neither is applied to the other's
// half (see SearchOptions).
/** The contract's cap on one answer — the note index's own, restated here
 *  because this route is now where two indexes share it. */
const SEARCH_HITS_MAX = 50;

// BOOK PAGES ANSWER THE SAME BOX (server/pdfText.ts). Two indexes, one query,
// one list: the note index first, then the pages of the shelf's PDFs as
// `kind: "book"` rows, together capped at the fifty the contract promises —
// notes give way to books only when the books are there, so a vault without
// a PDF sees exactly the list it always saw. `in:books` / `in:notes` pick one
// index; the scope is read from the same parse both sides use. Admin sessions
// only: the shelf is an enumeration of the owner's directory, and a visitor
// never learns a PDF exists from a search any more than from the tree.
api.get("/search", (c) => {
  const limited = isPublishLimited(c);
  const q = c.req.query("q") ?? "";
  const hits = search(q, limited, languageScope(c, limited).lang, {
    canonicalTag,
    expandTerms: expandTagQuery,
  });
  if (limited) return c.json(hits);
  const pages = searchPages(q);
  if (pages.length === 0) return c.json(hits);
  return c.json([...hits.slice(0, Math.max(0, SEARCH_HITS_MAX - pages.length)), ...pages]);
});

// The expansion under one hit: every line of ONE note the query matches, so a
// click can land on the line instead of at the note's top. Same scope ladder
// as /search itself — including `expandTagQuery`, or an Arabic reader whose
// label-spelled query FOUND the note would expand it to "no matches". The
// answer for a hidden note is the answer for a missing one: `[]`, never a 404
// that confirms the path exists (searchMatches applies the visitor filter).
api.get("/onthisday", (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  return c.json(onThisDay(c.req.query("date") ?? ""));
});

// The Timeline's notes (docs/timeline.md): every note with the day it
// belongs to, its excerpt, tags, words and what was captured or spoken into
// it. The sigils, the trackers and the daily notes the client already holds;
// shared/dayAgenda.ts puts all of them on the days. Admin only: it is the
// whole vault's shape, drafts included.
api.get("/timeline", (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  return c.json(timelineNotes());
});

// ── Capture ─────────────────────────────────────────────────────────────
// The quick-capture sheet's append (docs/capture.md): one line under
// `## Captured` in `path` — today's note when `path` is absent — stamped
// with the caller's `time` (`HH:MM`, the reader's clock; the server's when
// missing). The client creates today's note through its own daily-note door
// first, so the template lands; this route then only ever appends.
api.post("/capture", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  const body = await jsonBody(c);
  const text = requiredString(body, "text");
  const target = typeof body.path === "string" && body.path !== "" ? assertNotePath(body.path) : null;
  const time = typeof body.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.time) ? body.time : null;
  const path = await captureLine(target, text, time);
  return c.json({ ok: true, path });
});

// The clip token, for the Settings tab (admin-only; server/clip.ts).
api.route("/", clipAdminRoutes);

// Voice notes: a recording in, transcribed on this machine, words into the
// inbox (server/voice.ts, docs/capture.md "Voice").
api.route("/", voiceRoutes);
api.route("/", speakRoutes);

api.get("/tasks", (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  return c.json(tasks());
});

// Flip one task line: `[ ]` ↔ `[x]`, ✅ stamped or removed
// (shared/tasks.ts toggleTaskLine). The line must still be a task when the
// write lands, or the answer is 409 — the note may have moved under a fence.
api.post("/task", async (c) => {
  const body = await jsonBody(c);
  const notePath = requiredString(body, "path");
  const line = typeof body.line === "number" && Number.isInteger(body.line) && body.line >= 1 ? body.line : 0;
  const done = body.done === true;
  if (line === 0) throw new VaultError(400, "A task needs a line");
  const today = typeof body.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);
  const note = await readNote(notePath);
  const lines = note.content.split(/(?<=\n)/);
  const raw = lines[line - 1];
  if (raw === undefined) throw new VaultError(409, "That line is gone", "stale");
  const eol = /\r?\n$/.exec(raw)?.[0] ?? "";
  const text = raw.slice(0, raw.length - eol.length);
  if (!TASK_LINE_RE.test(text)) throw new VaultError(409, "That line is no longer a task", "stale");
  const next = toggleTaskLine(text, done, today);
  if (next !== text) {
    lines[line - 1] = next + eol;
    suppressWatcherEcho(note.path);
    await writeNote(note.path, lines.join(""), note.mtimeMs);
    emitEvent({ kind: "changed", path: note.path });
    await indexFile(note.path);
  }
  return c.json({ ok: true, path: note.path, line, done });
});

// Orbits, the vault's own spaced repetition (server/deckRoutes.ts).
api.route("/", deckRoutes);

// Ask the vault: meaning search, related notes, link suggestions and
// questions answered from the notes (server/ask.ts). Admin-only, every route.
api.route("/", askRoutes);

// Feeds and read-later (server/feeds.ts, docs/feeds.md): the owner's list of
// other people's feeds, read and kept. Admin-only, every route — the GETs
// too. Not the blog's own /rss.xml, which is outbound and lives in blog.ts.
api.route("/", feedRoutes);

// The import wizard (server/importRoutes.ts, docs/import.md): Notion, Evernote
// and Obsidian exports, previewed, committed, undone. Admin-only.
api.route("/", importRoutes);

api.get("/mentions", (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  return c.json(mentions(c.req.query("path") ?? ""));
});

// Turn one prose mention into a link: the phrase at [start, end) of `line`
// in `path` becomes `[[Target]]` (or `[[Target|phrase]]` when the words are
// not the title's own spelling). The slice is re-checked against `phrase`
// before anything is written — the note may have moved under the panel —
// and the write goes under the mtime precondition like every line edit.
api.post("/mentions/link", async (c) => {
  const body = await jsonBody(c);
  const notePath = requiredString(body, "path");
  const target = requiredString(body, "target");
  const phrase = requiredString(body, "phrase");
  const line = typeof body.line === "number" && Number.isInteger(body.line) && body.line >= 1 ? body.line : 0;
  const start = typeof body.start === "number" && Number.isInteger(body.start) && body.start >= 0 ? body.start : -1;
  const end = typeof body.end === "number" && Number.isInteger(body.end) && body.end > start ? body.end : -1;
  if (line === 0 || start < 0 || end < 0) throw new VaultError(400, "A mention needs a line and a span");
  if (!hasNote(target)) throw new VaultError(404, "No such note to link to");
  const note = await readNote(notePath);
  const lines = note.content.split(/(?<=\n)/);
  const raw = lines[line - 1];
  if (raw === undefined) throw new VaultError(409, "That line is gone", "stale");
  const text = raw.replace(/\r?\n$/, "");
  if (text.slice(start, end) !== phrase) throw new VaultError(409, "That mention has moved", "stale");
  const spelling = linkSpellingFor(target);
  const link = phrase === spelling ? `[[${spelling}]]` : `[[${spelling}|${phrase}]]`;
  lines[line - 1] = `${text.slice(0, start)}${link}${text.slice(end)}${raw.slice(text.length)}`;
  const updated = lines.join("");
  suppressWatcherEcho(note.path);
  await writeNote(note.path, updated, note.mtimeMs);
  emitEvent({ kind: "changed", path: note.path });
  await indexFile(note.path);
  return c.json({ ok: true, path: note.path, line, link });
});

api.get("/query", (c) => {
  const limited = isPublishLimited(c);
  const key = c.req.query("sort") ?? "date";
  const sortKey = (["date", "modified", "title", "path", "relevance"] as const).find((k) => k === key) ?? "date";
  const dir = c.req.query("dir") === "asc" ? "asc" : "desc";
  const limit = Number(c.req.query("limit")) || 100;
  return c.json(
    queryNotes(c.req.query("q") ?? "", limited, languageScope(c, limited).lang, { key: sortKey, dir }, limit, {
      canonicalTag,
      expandTerms: expandTagQuery,
    }),
  );
});

// The PATHS a query names, nothing else — for a surface that colours or
// counts notes rather than listing them (the graph's groups by query). No
// snippets, no rank tiers, and no fifty-hit cap: a graph that coloured only
// the first fifty physics notes would be lying about the other hundred.
// Same scope ladder as /search.
api.get("/query/paths", (c) => {
  const limited = isPublishLimited(c);
  return c.json(
    queryPaths(c.req.query("q") ?? "", limited, languageScope(c, limited).lang, {
      canonicalTag,
      expandTerms: expandTagQuery,
    }),
  );
});

api.get("/search/matches", (c) => {
  const limited = isPublishLimited(c);
  return c.json(
    searchMatches(
      normalizeRel(c.req.query("path") ?? ""),
      c.req.query("q") ?? "",
      limited,
      languageScope(c, limited).lang,
      { expandTerms: expandTagQuery },
    ),
  );
});

// `?around=<path>` answers with just that note's neighborhood — the shape the
// backlinks panel's local graph draws. Without it the panel pulled the ENTIRE
// vault graph (534 kB on the 1,388-note fixture, ~4 MB on a 10k-note vault)
// on every app open in order to render a dozen nodes. Both forms are memoized
// per audience AND per language; see server/graphCache.ts.
api.get("/graph", (c) => {
  const publishedOnly = isPublishLimited(c);
  const lang = languageScope(c, publishedOnly).lang;
  const around = c.req.query("around");
  if (around === undefined || around === "") {
    return sendEncoded(c, graphBody(publishedOnly, lang));
  }
  // Slices are small and there are as many as there are notes, so they are
  // built per request and compressed by the ordinary middleware rather than
  // memoized per path.
  return c.body(localGraphJson(normalizeRel(around), publishedOnly, lang), 200, {
    "Content-Type": "application/json",
  });
});

api.get("/backlinks", (c) => {
  const notePath = requiredQuery(c.req.query("path"), "path");
  const limited = isPublishLimited(c);
  return c.json(backlinks(normalizeRel(notePath), limited, languageScope(c, limited).lang));
});

// Topics. A tag carried only by notes the reader's language hides must not
// appear as a pill: its page would come back empty, and the count on it is an
// existence leak.
api.get("/tags", (c) => {
  const limited = isPublishLimited(c);
  return c.json(tagShelf(limited, languageScope(c, limited).lang));
});

// Properties: every frontmatter key with a count and its top values, for the
// shelf under the tags. Scoped like /api/tags, and for the same reason.
api.get("/props", (c) => {
  const limited = isPublishLimited(c);
  return c.json(propShelf(limited, languageScope(c, limited).lang));
});

// Notes that read like this one, without a model anywhere near them
// (server/nearby.ts). Admin only: the scoring reads every note's body, and
// a visitor's "related posts" would be an oracle for unpublished notes.
api.get("/nearby", (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  return c.json(nearbyNotes(normalizeRel(requiredQuery(c.req.query("path"), "path"))));
});

// The DISPLAY names of those tags: canonical tag → language → label, merged
// from the tag pages' own frontmatter and settings.tagLabels. Open to every
// session, because a chip's word is what the public site paints — and scoped
// exactly like /api/tags above, so it can never become an oracle for a tag
// EXCLUDE_TAGS or the language filter is hiding. The canonical tag stays the
// key everywhere: this route changes what a reader SEES and nothing else.
api.get("/tag-labels", (c) => {
  const limited = isPublishLimited(c);
  const response: TagLabelsResponse = {
    labels: visibleTagLabels(limited, languageScope(c, limited).lang),
  };
  return c.json(response);
});

// Blog: published notes as posts, newest first. Visitor-safe by construction
// (published notes only, EXCLUDE_TAGS filtered). With COMMENTS=on each post
// carries its comment count — the one per-session branch: visitors count
// visible comments only, admin sessions include hidden ones.
api.get("/posts", (c) => {
  // Visitor sessions (and admin-as-visitor preview) get the language filter
  // applied at the scope this request resolved to; admin lists are never
  // filtered. The blog client derives prev/next adjacency from this list, so
  // an Arabic reader's "next post" is the next post THEY can read.
  // Static pages leave the feed ONLY in designed mode (server/pages.ts): with
  // the stock blog on, staticPagesActive() is false and this is the call it
  // always was.
  const limited = isPublishLimited(c);
  const list = posts(limited, languageScope(c, limited).lang, staticPagesActive());
  if (commentsEnabled()) {
    const counts = commentCounts(!limited);
    for (const post of list) post.commentCount = counts.get(post.path) ?? 0;
  }
  return c.json(list);
});

// TWINS: the two faces of one note (shared/twins.ts).
//
// ONE ROUTE, TWO ANSWERS, and which one you get is which side of the login
// you are on — because the two questions are different questions.
//
//  • The ADMIN asks "which of my notes have another face, and how far behind
//    is it": `pairs`, one row per twinned note in both directions, so the tab
//    mark, the tree mark and the status-bar pill are a lookup rather than a
//    request per note.
//  • A VISITOR asks nothing at all, and is handed the LINK-TIME SWAP TABLE
//    instead: the wikilinks in this reader's language scope that would
//    otherwise land nowhere, each pointing at the face they can actually read.
//    Empty unless the language filter is doing something, which is what keeps
//    the swap out of the editor — the author linked what they linked.
api.get("/twins", (c) => {
  const limited = isPublishLimited(c);
  const response: TwinsResponse = limited
    ? { pairs: [], swap: twinSwapTable(languageScope(c, limited).lang) }
    : { pairs: twinPairs(), swap: {} };
  return c.json(response);
});

// "Create twin…": the other face, beside this one, declared on BOTH files.
//
// Two writes and one order, because a crash between them must leave the vault
// readable either way: the NEW file is written first (carrying its `twin:`
// already), and only then is the source's own line added. Interrupted after
// the first, the vault holds a note declaring a twin that does not yet
// declare it back — which is the one-sided case the index already resolves
// symmetrically. Interrupted the other way round it would hold a source
// pointing at nothing.
api.post("/twin", async (c) => {
  const body = await jsonBody(c);
  const from = normalizeRel(requiredString(body, "path"));
  const to = normalizeRel(requiredString(body, "toPath"));
  if (from === to) throw new VaultError(400, "A note cannot be its own twin", "twinSelf");
  const existing = twinOf(from);
  if (existing !== null) {
    throw new VaultError(409, `"${from}" already has a twin`, "twinExists");
  }
  const source = await readNote(from);
  await createNote(to); // 409s before a byte moves when the name is taken
  // Each side names the other by BASENAME, the spelling `[[` completion and
  // the rename rewriter both speak. Not the display title: that one has bidi
  // controls stripped for drawing, and a resolution key must be the bytes the
  // file actually wears.
  const nameOf = (rel: string): string => stripNoteExt(path.posix.basename(rel));
  await writeNote(to, twinSeed(from, source.content, nameOf(from)));
  await writeNote(from, setNoteFrontmatterLine(from, source.content, TWIN_KEY, twinLine(nameOf(to))));
  await indexFile(to);
  await indexFile(from);
  return c.json({ path: to });
});

// The shelf: every ```tracker fence this session may see (a ```tracker-board
// draws it). Scoped by trackers() exactly as posts() scopes the feed —
// published notes only for a visitor, the language filter at this request's
// scope, templates out of both lists — because publishing a reading or gaming
// shelf is the point of the feature and the endpoint is what makes leaving one
// on a public note safe.
// Note annotations (server/annotations.ts). The owner reads and writes every
// annotation of any note; a visitor reads the PUBLIC ones of a published note
// and nothing else — the comments gate, line for line.
api.get("/annotations", (c) => {
  const notePath = requiredQuery(c.req.query("path"), "path");
  const limited = isPublishLimited(c);
  if (limited) {
    if (!isNotePublished(notePath)) throw new VaultError(404, `Note not found: ${notePath}`);
    return c.json({ path: notePath, annotations: publicAnnotations(notePath) });
  }
  return c.json({ path: notePath, annotations: listAnnotations(notePath) });
});

api.put("/annotations", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  const body = await jsonBody(c);
  const notePath = requiredString(body, "path");
  return c.json(putAnnotation(notePath, body.annotation));
});

api.delete("/annotations", (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  const notePath = requiredQuery(c.req.query("path"), "path");
  const id = requiredQuery(c.req.query("id"), "id");
  deleteAnnotation(notePath, id);
  return c.json({ ok: true });
});

// The library shelf: every path this session may read a lesson of, with the
// folder's structure resolved (server/library.ts). Public on the posts terms.
api.get("/library", (c) => c.json(libraryFor(c)));

// EDIT ONE TRACKER FENCE, from outside the editor (the Media page). The
// note is read, the `index`-th tracker fence is rewritten by the same pure
// transforms the stepper uses (shared/tracker.ts: setTrackerFields for the
// form's fields, setTrackerProgress for a nudge), and the whole note is
// written back under the mtime precondition every line edit carries. One
// request, one write, one file event.
api.post("/tracker", async (c) => {
  const body = await jsonBody(c);
  const notePath = requiredString(body, "path");
  const index = typeof body.index === "number" && Number.isInteger(body.index) && body.index >= 0 ? body.index : 0;
  const set = body.set && typeof body.set === "object" ? (body.set as Record<string, unknown>) : null;
  const delta = typeof body.delta === "number" && Number.isFinite(body.delta) ? body.delta : 0;
  const fields: TrackerFields = {};
  if (set) {
    for (const key of ["kind", "season", "cover", "progress", "unit", "status", "rating", "started", "finished", "pace", "due", "notes"] as const) {
      const v = set[key];
      if (v === null) fields[key] = null;
      else if (typeof v === "string") fields[key] = v.slice(0, key === "notes" ? 4000 : 400);
    }
    if (typeof set.title === "string" && set.title.trim() !== "") fields.title = set.title.slice(0, 400);
  }
  const note = await readNote(notePath);
  if (trackerFenceSpans(note.content).length === 0) throw new VaultError(400, "That note carries no tracker fence");
  const updated = editTrackerFence(note.content, index, (fence) => {
    let next = setTrackerFields(fence, fields);
    if (delta !== 0) next = setTrackerProgress(next, delta);
    return next;
  });
  if (updated !== note.content) {
    suppressWatcherEcho(note.path);
    await writeNote(note.path, updated, note.mtimeMs);
    emitEvent({ kind: "changed", path: note.path });
  }
  await indexFile(note.path);
  return c.json({ ok: true, path: note.path, index });
});

api.get("/trackers", (c) => {
  const limited = isPublishLimited(c);
  return c.json(trackers(limited, languageScope(c, limited).lang));
});

// The corpus door for `> [!hadith] Bukhari 1`: the callout's text, parsed on
// the server through the same shared grammar the indexer filed the corpus
// under (shared/hadithRefs.ts), answered from the hadith folder at THIS
// session's scope — a visitor is answered only from published notes, so the
// path in the answer is always one they may open. 404 when no corpus note
// answers, and the client draws a plain quote callout then: the reference is
// still the author's words, and a callout is never broken.
api.get("/hadith", (c) => {
  const ref = parseHadithRef(requiredQuery(c.req.query("ref"), "ref"));
  if (ref === null) throw new VaultError(400, "Not a hadith reference");
  const limited = isPublishLimited(c);
  const hit = hadithLookup(hadithKey(ref.collection, ref.number), limited, languageScope(c, limited).lang);
  if (hit === null) throw new VaultError(404, "No corpus note answers this reference");
  return c.json(hit);
});

// ------------------------------------------------------------------ routines
// The daily tracker (shared/routine.ts). Two writes, both through the note:
// `entry` records one day in the plan's ```routine-log (the same edit the
// editor's widget dispatches into its buffer, computed by the same pure
// function, so the page and the editor never disagree about the log's
// shape); `plan` replaces the plan fence's body from the form. Admin only:
// the auth guard above already 401s a visitor's POST.
api.post("/routine", async (c) => {
  const body = await jsonBody(c);
  const notePath = requiredString(body, "path");
  const index = typeof body.index === "number" && Number.isInteger(body.index) && body.index >= 0 ? body.index : 0;
  const note = await readNote(notePath);
  if (!routineFenceSpans(note.content).some((s) => s.kind === "routine" && s.index === index)) {
    throw new VaultError(400, "That note carries no sigil fence");
  }
  let updated = note.content;
  const entry = body.entry && typeof body.entry === "object" ? (body.entry as Record<string, unknown>) : null;
  if (entry && typeof entry.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
    const list = (v: unknown): string[] | undefined =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 200)).slice(0, 100) : undefined;
    const patch: EntryPatch = { date: entry.date, done: list(entry.done), skipped: list(entry.skipped), deferred: list(entry.deferred) };
    if (entry.values && typeof entry.values === "object") {
      patch.values = {};
      for (const [k, v] of Object.entries(entry.values as Record<string, unknown>)) {
        if (v === null) patch.values[k.slice(0, 100)] = null;
        else if (typeof v === "string") patch.values[k.slice(0, 100)] = v.slice(0, 400);
      }
    }
    if (entry.note === null) patch.note = null;
    else if (typeof entry.note === "string") patch.note = entry.note.slice(0, 2000);
    const edit = logEditFor(updated, index, patch);
    if (edit) updated = applyEdit(updated, edit);
  }
  if (typeof body.plan === "string") updated = editRoutinePlan(updated, index, body.plan.slice(0, 20000));
  if (updated !== note.content) {
    suppressWatcherEcho(note.path);
    await writeNote(note.path, updated, note.mtimeMs);
    emitEvent({ kind: "changed", path: note.path });
  }
  await indexFile(note.path);
  return c.json({ ok: true, path: note.path, index });
});

api.get("/routines", (c) => {
  // Admin only, 401 rather than an empty list: a visitor has no page that
  // asks, and a list of nothing would read as "no routines" to any client
  // that did (the books shelf's rule, server/bookRoutes.ts).
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  return c.json(routines());
});

// -------------------------------------------------------------------- export
// A ZIP of the notes a scope names and the attachments they reference
// (server/export.ts). Admin only, 401 rather than a smaller archive: the
// published subset already has a door — the site — and a visitor handed a
// zip of "what you may see" would learn which paths exist from its names.
// The response is a download, not JSON: the client reaches it through an
// `<a download>` so the browser's own download manager shows the progress
// and the cookie carries the session.
api.get("/export", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  const request = parseExportQuery({
    scope: c.req.query("scope"),
    target: c.req.query("target"),
    links: c.req.query("links"),
    attachments: c.req.query("attachments"),
  });
  const plan = await planExport(request);
  // The DRY RUN: the same validation, the same cap, the same 404 for an
  // empty scope — answered as JSON so the dialog can print the count and
  // the size (or the refusal, in the reader's language) before a download
  // that the browser would otherwise report as "failed" with no reason.
  if (c.req.query("dry") === "1") return c.json(summarize(plan));
  return c.body(exportStream(plan), 200, {
    "Content-Type": "application/zip",
    "Content-Disposition": contentDisposition(plan.filename),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  });
});

// -------------------------------------------------------------------- design
// The site design engine (ASTROLABE_DATA/designs.json): named, versioned designs
// and custom themes. Mounted here, BELOW the auth guard, so every mutation
// under the prefix is already 401 to a visitor and to an admin wearing the
// preview header; the routes add the read-side gate themselves. Two routes
// under it are deliberately public — /api/design/public (the active design,
// scrubbed per session) and /api/design/themes.css (styling, like
// custom.css). See server/designRoutes.ts.
api.route("/design", designRoutes);
// --------------------------------------------------------------------- books
// The reader (ASTROLABE_DATA/books.json): the vault's PDFs as a shelf, and where
// each one was left off. Mounted here, below the auth guard, so the writes are
// already admin-only; both reads add `assertAdminRead` themselves because a
// shelf is an enumeration of the owner's own directory. The PDF BYTES are not
// served from here at all — the reader fetches them from /api/file, gated
// exactly as every embed is. See server/bookRoutes.ts.
//
// The EPUB half is mounted FIRST and separately, because it is the one part of
// the reader that does serve vault bytes (a chapter, a plate, a stylesheet,
// out of the zip and never onto the disk) and so it wears /api/file's
// publish gate rather than the shelf's admin-only one. Keeping it in its own
// file is what stops server/bookRoutes.ts's "no bytes through here" from
// becoming a sentence that used to be true. See server/epubRoutes.ts.
api.route("/books/epub", epubRoutes);
api.route("/books", bookRoutes);
// ------------------------------------------------------ deck import
// An Anki .apkg or a CSV/TSV, written as deck notes. Admin-only
// like every write; a file route, so it sits apart from the JSON ones. See
// server/deckImportRoutes.ts.
api.route("/orbits", deckImportRoutes);
// --------------------------------------------------------------------- prefs
// The client's localStorage preferences, kept in `.astrolabe/prefs.json`
// INSIDE the vault so every server over this folder — the desktop app on each
// machine, the hosted instance the phone opens — reads the same ones, and
// whatever syncs the notes syncs them. Admin-only both ways. See server/prefs.ts.
api.route("/prefs", prefsRoutes);
// ---------------------------------------------------------------- visibility
// "What will this setting cost me?", answered in notes, from this vault,
// BEFORE the save. Admin-only (the counts describe exactly what the public
// surfaces withhold), and every query param is a HYPOTHETICAL: absent ones
// describe what is in force right now, so the settings panel can ask the same
// route for "as it stands" and "as it would be" and print the difference.
//
// It exists because the owner enabled a boolean and his public site dropped
// from 20 posts to 2 with no warning anywhere. A control that can hide a site
// must state its consequence in real numbers, and only the server holds those
// numbers.
api.get("/visibility", (c) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  const query: VisibilityQuery = {};
  const mode = c.req.query("languageFilter")?.trim().toLowerCase();
  if (mode !== undefined && mode !== "") {
    if (!(LANGUAGE_FILTER_MODES as readonly string[]).includes(mode)) {
      throw new VaultError(400, `languageFilter must be one of: ${LANGUAGE_FILTER_MODES.join(", ")}`);
    }
    query.languageFilter = mode as LanguageFilterMode;
  }
  const tags = c.req.query("excludeTags");
  if (tags !== undefined) {
    query.excludeTags = tags.split(",").map((t) => t.trim()).filter(Boolean);
  }
  const layout = c.req.query("publicLayout")?.trim().toLowerCase();
  if (layout === "app" || layout === "blog") query.publicLayout = layout;
  const homeMode = c.req.query("home")?.trim().toLowerCase();
  if (homeMode === "note" || homeMode === "dashboard") query.homeMode = homeMode;
  const homeNote = c.req.query("homeNote");
  // "" is meaningful here and distinct from absent: it asks "what if I cleared
  // the home note", which is a real thing the panel's field can be in.
  if (homeNote !== undefined) query.homeNote = homeNote.trim() === "" ? null : homeNote.trim();
  return c.json(visibilityFor(query));
});

// Settings, the theme mirror and the operator's faces (server/settingsRoutes.ts).
api.route("/", settingsRoutes);

// Backup and sync, workspace state, layouts (server/syncRoutes.ts).
api.route("/", syncRoutes);

// Note history and versions (server/versionRoutes.ts).
api.route("/", versionRoutes);

// The SSE event stream (server/eventRoutes.ts).
api.route("/", eventRoutes);

// Webmentions and the fediverse (server/webmentionRoutes.ts, docs/webmentions.md).
api.route("/", webmentionApi);
