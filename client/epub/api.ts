// The EPUB reader's half of /api/books/epub. Thin, like client/books/api.ts:
// the decisions are on the server (server/epub.ts, which does the reading and
// the rebuilding) and in the shared place format (shared/epubAnchor.ts); this
// file gets bytes across the wire.
//
// The reading POSITION does not come through here. An EPUB's place is stored
// in the same books.json record a PDF's is, under the same content key, and
// therefore through the same routes (client/books/api.ts::saveBookState) —
// see shared/bookAnchor.ts for why `page` is the chapter's index and
// `chapter` is its href.

import { ApiError, withPreview } from "../api.ts";
import type { EpubManifest, EpubSearchResponse } from "../../shared/types.ts";

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url, withPreview());
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON body — the status is the whole answer
  }
  if (!res.ok) {
    const message =
      body !== null && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : `HTTP ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

/** The book's shape — title, binding, reading order, contents, cover — in one
 *  request, before a word of it has been fetched. */
export function getEpubManifest(path: string): Promise<EpubManifest> {
  return json<EpubManifest>(`/api/books/epub/manifest?path=${encodeURIComponent(path)}`);
}

/** One chapter, rebuilt from an allowlist by the server, with its own
 *  stylesheet in a leading `<style>`. Text rather than JSON: it is a document,
 *  and an envelope around it would only have to be unwrapped. */
export async function getEpubChapter(path: string, href: string): Promise<string> {
  const res = await fetch(itemUrl(path, href), withPreview());
  if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
  return res.text();
}

/** Where one of the book's own files is served from — the URL the sanitizer
 *  already rewrote every `src` in a chapter to, spelled here so the cover can
 *  use the same door. */
export function itemUrl(path: string, href: string): string {
  return `/api/books/epub/item?path=${encodeURIComponent(path)}&href=${encodeURIComponent(href)}`;
}

/** Find a phrase in the whole book. Server-side: the alternative is fetching
 *  every chapter of a 300-chapter book in order to search it. */
export function searchEpub(path: string, query: string): Promise<EpubSearchResponse> {
  return json<EpubSearchResponse>(
    `/api/books/epub/search?path=${encodeURIComponent(path)}&q=${encodeURIComponent(query)}`,
  );
}
