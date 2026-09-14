// BOOKMARKS — the client half: one cached read of Bookmarks.md, edits that
// go back as byte-surgical writes of that note, and a listener list for the
// sidebar section and the palette rows. The note is the state
// (shared/bookmarks.ts); this module only spares the sidebar a fetch per
// render and hears the vault event when the note changes elsewhere.

import { createNote, getNote, putNote } from "./api.ts";
import { BOOKMARKS_PATH, addBookmark, isBookmarked, parseBookmarks, removeBookmark, reorderBookmarks, type BookmarkItem } from "../shared/bookmarks.ts";
import { markSelfWrite } from "./state.ts";

export const BOOKMARKS_EVENT = "astrolabe:bookmarks";

let content: string | null = null;
let mtimeMs: number | undefined;
let inflight: Promise<BookmarkItem[]> | null = null;
let known = false;

export function bookmarksNow(): BookmarkItem[] {
  return content === null ? [] : parseBookmarks(content);
}

export function bookmarksKnown(): boolean {
  return known;
}

/** Read the note (a 404 is "no bookmarks yet"), once per change. */
export function loadBookmarks(force = false): Promise<BookmarkItem[]> {
  if (!force && known) return Promise.resolve(bookmarksNow());
  if (inflight) return inflight;
  inflight = getNote(BOOKMARKS_PATH)
    .then((note) => {
      content = note.content;
      mtimeMs = note.mtimeMs;
    })
    .catch(() => {
      content = null;
      mtimeMs = undefined;
    })
    .then(() => {
      known = true;
      inflight = null;
      window.dispatchEvent(new CustomEvent(BOOKMARKS_EVENT));
      return bookmarksNow();
    });
  return inflight;
}

export function isNoteBookmarked(path: string): boolean {
  return content !== null && isBookmarked(content, path);
}

async function write(next: string): Promise<void> {
  if (content === null) {
    try {
      await createNote(BOOKMARKS_PATH);
    } catch {
      // exists after all (a stale cache): the put below carries no mtime
    }
  }
  markSelfWrite(BOOKMARKS_PATH);
  const saved = await putNote(BOOKMARKS_PATH, next, content === null ? undefined : mtimeMs);
  content = next;
  mtimeMs = saved.mtimeMs;
  window.dispatchEvent(new CustomEvent(BOOKMARKS_EVENT));
}

export async function toggleBookmark(path: string): Promise<boolean> {
  await loadBookmarks();
  const base = content ?? "";
  const on = isBookmarked(base, path);
  await write(on ? removeBookmark(base, path) : addBookmark(base, path));
  return !on;
}

export async function reorder(order: readonly string[]): Promise<void> {
  await loadBookmarks();
  if (content === null) return;
  await write(reorderBookmarks(content, order));
}

/** The vault told us the note moved under us: forget and re-read. */
export function bookmarksChanged(): void {
  known = false;
  void loadBookmarks(true);
}
