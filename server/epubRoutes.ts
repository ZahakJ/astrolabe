// HTTP surface for the EPUB reader (server/epub.ts).
//
// Mounted under /api/books/epub from server/api.ts, and kept OUT of
// server/bookRoutes.ts on purpose: that file's first paragraph promises that
// no vault bytes travel through it, and these routes exist precisely to carry
// vault bytes. Two files, two promises, neither of them quietly broken.
//
// THE GATE IS /api/file's GATE, SPELLED THE SAME WAY. A book is an
// attachment, and "may this caller read this attachment" is a question this
// product answers in exactly one place: `isAllowedAttachment(rel)` says
// whether a published note reaches it, `isPublishLimited(c)` says whether the
// caller is a visitor (or an admin wearing the preview header), and a visitor
// asking for anything else gets the same 404 that /api/file gives — not a 403,
// because a 403 is an answer to "is this here", and an unpublished folder's
// contents are not a visitor's to learn. A book in an unpublished folder is
// the NORMAL case: these routes are for the owner reading their own library.
//
// AND THE SAME SANDBOX. Every answer carries
// `Content-Security-Policy: sandbox` and `X-Content-Type-Options: nosniff`,
// exactly as /api/file does for a PDF or an SVG. The chapters are rebuilt
// from an allowlist before they leave server/epub.ts, so this is the belt to
// that braces: an `image/svg+xml` plate out of somebody's book cannot run in
// this origin even if the sanitizer is one day wrong about something.

import { Hono } from "hono";
import type { Context } from "hono";
import { isPublishLimited } from "./auth.ts";
import { EPUB_HITS_MAX, epubItem, epubManifest, searchEpub } from "./epub.ts";
import { isAllowedAttachment } from "./indexer.ts";
import { cleanEpubHref } from "../shared/epubAnchor.ts";
import type { EpubSearchResponse } from "../shared/types.ts";
import { normalizeRel, VaultError } from "./vault.ts";

export const epubRoutes = new Hono();

/** The longest query the in-book search will run. A phrase, not a corpus. */
const QUERY_MAX = 200;

/** Headers every answer here wears, whatever it is carrying. */
function sandboxHeaders(publicFile: boolean): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
    // A published book's chapters may be held by a cache; anything else is
    // private and varies by cookie, the same split /api/file makes.
    "Cache-Control": publicFile ? "public, max-age=300, stale-while-revalidate=3600" : "private, no-cache",
    ...(publicFile ? {} : { Vary: "Cookie" }),
  };
}

/** The vault path this request names, gated. Returns the path and whether a
 *  visitor may have it, so the caller can set the cache headers honestly. */
function gatedPath(c: Context): { rel: string; publicFile: boolean } {
  const raw = c.req.query("path") ?? "";
  if (!raw.trim()) throw new VaultError(400, "A path is required");
  const rel = normalizeRel(raw);
  const publicFile = isAllowedAttachment(rel);
  if (isPublishLimited(c) && !publicFile) throw new VaultError(404, `File not found: ${rel}`);
  return { rel, publicFile };
}

/** Where a chapter's own pictures and stylesheets are served from — the same
 *  route, with the href swapped. Built once per request and handed to the
 *  sanitizer, so the rewritten `src` in a chapter is the only URL shape this
 *  feature has. */
function itemUrlFor(rel: string): (href: string) => string {
  return (href) => `/api/books/epub/item?path=${encodeURIComponent(rel)}&href=${encodeURIComponent(href)}`;
}

/**
 * The book's shape: title, author, language, binding, reading order, contents,
 * cover. One request, before a word of the book has been fetched — the same
 * bargain `/api/books/one` makes for a PDF, and for the same reason: the
 * reader has to know how many chapters there are before it can lay out a
 * scrollbar, and a request per chapter is a reader that never finishes
 * painting.
 */
epubRoutes.get("/manifest", async (c) => {
  const { rel, publicFile } = gatedPath(c);
  return c.json(await epubManifest(rel, itemUrlFor(rel)), 200, sandboxHeaders(publicFile));
});

/**
 * One item out of the book: a chapter rebuilt, or a picture, stylesheet or
 * font as it is.
 *
 * A chapter comes back as `text/html` — its own stylesheet in a leading
 * `<style>`, then the rebuilt markup. The reader scopes that `<style>` under
 * its own root before it inserts any of it (shared/epubCss.ts explains why
 * prefixing and not a shadow root), so the publisher's CSS cannot reach the
 * app and the app's cannot break the book.
 */
epubRoutes.get("/item", async (c) => {
  const { rel, publicFile } = gatedPath(c);
  const href = cleanEpubHref(c.req.query("href") ?? "");
  if (href === "") throw new VaultError(400, "An href is required");
  const item = await epubItem(rel, href, itemUrlFor(rel));

  const headers = { ...sandboxHeaders(publicFile), "Content-Type": item.contentType, ETag: item.etag };
  const ifNoneMatch = c.req.header("if-none-match");
  if (ifNoneMatch && ifNoneMatch.split(",").some((tag) => tag.trim() === item.etag || tag.trim() === `W/${item.etag}`)) {
    return c.body(null, 304, { ETag: item.etag });
  }
  if (item.kind === "chapter") {
    const style = item.css && item.css.trim() !== "" ? `<style>${item.css.replace(/<\/style/gi, "<\\/style")}</style>` : "";
    return c.body(`${style}${item.html ?? ""}`, 200, headers);
  }
  const bytes = item.bytes ?? new Uint8Array();
  return c.body(bytes.slice().buffer as ArrayBuffer, 200, {
    ...headers,
    "Content-Length": String(bytes.byteLength),
  });
});

/**
 * Find a phrase in the whole book.
 *
 * Server-side, and that IS the design: the alternative is shipping every
 * chapter of a 300-chapter book to the browser in order to search it, which
 * is the whole book on every search, on a phone, over somebody's home
 * connection. The fold is `shared/fold.ts` — the same one `/` uses inside a
 * PDF and the same one the vault's own index uses.
 */
epubRoutes.get("/search", async (c) => {
  const { rel, publicFile } = gatedPath(c);
  const query = (c.req.query("q") ?? "").slice(0, QUERY_MAX);
  if (query.trim() === "") {
    const empty: EpubSearchResponse = { hits: [], truncated: false };
    return c.json(empty, 200, sandboxHeaders(publicFile));
  }
  const hits = await searchEpub(rel, query, EPUB_HITS_MAX);
  const body: EpubSearchResponse = { hits, truncated: hits.length >= EPUB_HITS_MAX };
  return c.json(body, 200, sandboxHeaders(publicFile));
});
