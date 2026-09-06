// THE LIBRARY — the owner's books, courses and series on the public site.
//
// A blog is for written things: an essay is read once, whole, and the next
// one is whichever came next in time. A book's chapters and a course's
// lectures are not that. They are read IN ORDER, over weeks, a piece at a
// time, and a reader wants to know where they are in the whole. So they get
// a shell of their own — the library — and this module is the rule for what a
// path in it is.
//
// A PATH IS A FOLDER. The vault already has the shape: a book is a folder of
// chapter folders of concept notes, a course is a folder of lecture folders
// of notes, and the reading companion writes exactly that. So the owner
// declares a folder, gives it a kind, a title, a blurb and a cover, and the
// folder's own structure is the path's: every immediate subfolder is a UNIT
// (a chapter, a lecture, a week), every published note inside is a LESSON,
// and notes sitting directly in the path's folder are its introduction. No
// frontmatter is asked of any note beyond `publish: true`, and a hub note the
// companion wrote (named like its unit) simply comes first in its unit.
//
// WHY A SHARED MODULE: the same three-way agreement publicFolders.ts keeps —
// the PATCH handler, the settings editor's inline validation and the read-side
// cleaner must agree on what a legal row is, or the panel shows a green field
// beside a 400.

import { folderId, folderSlug } from "./publicFolders.ts";
import type { LibraryKind, LibraryPathRef, LibraryUnit, LibrarySettings } from "./types.ts";

export const LIBRARY_PATHS_MAX = 24;
export const LIBRARY_TITLE_MAX = 80;
export const LIBRARY_BLURB_MAX = 300;
export const LIBRARY_FOLDER_MAX = 300;
export const LIBRARY_SOURCE_MAX = 500;
export const LIBRARY_SITE_TITLE_MAX = 40;

export const LIBRARY_KINDS: LibraryKind[] = ["book", "course", "series"];

export function isLibraryKind(value: unknown): value is LibraryKind {
  return value === "book" || value === "course" || value === "series";
}

/** The slug rule is the public folder's: it is a URL segment and nothing
 *  else, and one character set for every address on the site. */
export const librarySlug = folderSlug;
export const libraryPathId = folderId;

/** A vault-relative folder, normalised: forward slashes, no leading or
 *  trailing slash, no `.`/`..` segment, no empty segment. Null when the value
 *  cannot name a folder at all. The ROOT is not a path: a library entry that
 *  names the whole vault would make every note a lesson of one book. */
export function libraryFolder(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (text === "" || text.length > LIBRARY_FOLDER_MAX) return null;
  const parts = text.split("/");
  for (const part of parts) {
    if (part === "" || part === "." || part === ".." || part !== part.trim()) return null;
  }
  return parts.join("/");
}

export type LibraryRowError =
  | "notObject"
  | "title"
  | "titleLength"
  | "slug"
  | "folder"
  | "kind"
  | "blurbLength"
  | "sourceLength";

/** Why a row is not a path, or null when it is one. */
export function libraryRowError(entry: unknown): LibraryRowError | null {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return "notObject";
  const row = entry as Record<string, unknown>;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  if (title === "") return "title";
  if (title.length > LIBRARY_TITLE_MAX) return "titleLength";
  if (librarySlug(row.slug) === null) return "slug";
  if (libraryFolder(row.folder) === null) return "folder";
  if (!isLibraryKind(row.kind)) return "kind";
  if (typeof row.blurb === "string" && row.blurb.trim().length > LIBRARY_BLURB_MAX) return "blurbLength";
  if (typeof row.source === "string" && row.source.trim().length > LIBRARY_SOURCE_MAX) return "sourceLength";
  return null;
}

const ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

/** A stored or posted row, cleaned into a path, or null when it is not one. */
export function cleanLibraryPath(entry: unknown, fallbackId: () => string): LibraryPathRef | null {
  if (libraryRowError(entry) !== null) return null;
  const row = entry as Record<string, unknown>;
  const out: LibraryPathRef = {
    id: typeof row.id === "string" && ID_RE.test(row.id) ? row.id : fallbackId(),
    slug: librarySlug(row.slug) as string,
    folder: libraryFolder(row.folder) as string,
    kind: row.kind as LibraryKind,
    title: (row.title as string).trim(),
  };
  const blurb = typeof row.blurb === "string" ? row.blurb.trim() : "";
  if (blurb !== "") out.blurb = blurb;
  const cover = typeof row.cover === "string" ? row.cover.trim() : "";
  if (cover !== "") out.cover = cover;
  const source = typeof row.source === "string" ? row.source.trim() : "";
  if (source !== "" && /^https?:\/\//i.test(source)) out.source = source;
  if (row.hidden === true) out.hidden = true;
  return out;
}

/** Editor rows → the wire list: blank rows dropped, every field trimmed. */
export function libraryList(rows: readonly LibraryPathRef[]): LibraryPathRef[] {
  const out: LibraryPathRef[] = [];
  for (const row of rows) {
    if (row.title.trim() === "" && row.folder.trim() === "" && row.slug.trim() === "") continue;
    const next: LibraryPathRef = {
      id: row.id,
      slug: row.slug.trim().toLowerCase(),
      folder: row.folder.trim().replace(/^\/+|\/+$/g, ""),
      kind: row.kind,
      title: row.title.trim(),
    };
    if ((row.blurb ?? "").trim() !== "") next.blurb = (row.blurb ?? "").trim();
    if ((row.cover ?? "").trim() !== "") next.cover = (row.cover ?? "").trim();
    if ((row.source ?? "").trim() !== "") next.source = (row.source ?? "").trim();
    if (row.hidden) next.hidden = true;
    out.push(next);
  }
  return out;
}

// ── Units ───────────────────────────────────────────────────────────────────

/** What a unit's folder name says about it. The companion sorts chapters
 *  with a `B2| ` prefix and a course keeps `L1`…`L14`; both are read here,
 *  once, so the shell prints "Lecture 3" and "Chapter 40" in its own language
 *  and sorts by the number rather than by the letters. */
export function unitOfName(dirName: string): Pick<LibraryUnit, "name" | "kind" | "number"> {
  const name = dirName.replace(/^[^|]{1,8}\|\s*/, "").trim();
  let m: RegExpExecArray | null;
  if ((m = /^(?:L|Lec|Lecture|محاضرة)\s*0*(\d+)\b/i.exec(name)) !== null) {
    return { name, kind: "lecture", number: Number(m[1]) };
  }
  if ((m = /^(?:Ch|Chap|Chapter|الفصل|فصل)\s*0*(\d+)\b/i.exec(name)) !== null) {
    return { name, kind: "chapter", number: Number(m[1]) };
  }
  if ((m = /^(?:W|Wk|Week|الأسبوع|أسبوع)\s*0*(\d+)\b/i.exec(name)) !== null) {
    return { name, kind: "week", number: Number(m[1]) };
  }
  if ((m = /^(?:Part|Pt|الجزء|جزء)\s*0*(\d+)\b/i.exec(name)) !== null) {
    return { name, kind: "part", number: Number(m[1]) };
  }
  return { name, kind: "unit", number: null };
}

/** The folders whose published notes are LESSONS rather than posts: every
 *  visible path of an enabled library, normalised. Empty when the library is
 *  off or every path is hidden — a shelf that reaches nobody gives the blog
 *  its notes back. */
export function libraryLessonFolders(lib: LibrarySettings | undefined): string[] {
  if (!lib || lib.enabled !== true) return [];
  const out: string[] = [];
  for (const ref of lib.paths ?? []) {
    if (ref.hidden) continue;
    const folder = libraryFolder(ref.folder);
    if (folder !== null && !out.includes(folder)) out.push(folder);
  }
  return out;
}

/** Is this note inside one of the lesson folders? The boundary is the slash:
 *  `Books/Feynman` never claims `Books/Feynman Lectures`. */
export function isLibraryLesson(notePath: string, folders: readonly string[]): boolean {
  for (const folder of folders) {
    if (notePath.startsWith(folder + "/")) return true;
  }
  return false;
}

/** The vault-relative COVER images of an enabled library's visible paths —
 *  what /api/file may serve a visitor beside the published notes' own
 *  attachments, because a shelf with holes where the art should be is the
 *  tracker-cover bug again. An https cover is not a vault file and is not
 *  listed. Read live from settings, never cached with the index: a cover set
 *  in the panel must show on the next request, and the index has not moved. */
export function libraryCoverPaths(lib: LibrarySettings | undefined): string[] {
  if (!lib || lib.enabled !== true) return [];
  const out: string[] = [];
  for (const ref of lib.paths ?? []) {
    if (ref.hidden || !ref.cover) continue;
    const cover = ref.cover.trim();
    if (/^https?:\/\//i.test(cover)) continue;
    const norm = libraryFolder(cover);
    if (norm !== null && !out.includes(norm)) out.push(norm);
  }
  return out;
}

/** A folder's name as a shelf TITLE: the sorting prefix (`B2| `) gone, the
 *  rest as written. What the tree's "Library…" popover and the settings
 *  panel's folder chooser fill the title field with. */
export function libraryTitleOf(folder: string): string {
  const base = folder.slice(folder.lastIndexOf("/") + 1);
  return base.replace(/^[^|]{1,8}\|\s*/, "").trim();
}

/** The kind a folder most likely is, read off its subfolders' names and, when
 *  those say nothing, off the folder's own address: `L1..L14` is a course,
 *  `Chapter 39..41` is a book, a folder under "Lectures" is a course and one
 *  under "Talks" or "Series" a series. A guess the reader can overturn in one
 *  click, so it errs toward the common case: a book. */
export function guessLibraryKind(folder: string, unitNames: readonly string[]): LibraryKind {
  const kinds = new Map<string, number>();
  for (const name of unitNames) {
    const k = unitOfName(name).kind;
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
  }
  const n = (k: string): number => kinds.get(k) ?? 0;
  if (n("lecture") > 0 && n("lecture") >= n("chapter")) return "course";
  if (n("chapter") > 0) return "book";
  if (n("week") > 0) return "course";
  const address = folder.toLowerCase();
  if (/\b(lecture|lectures|course|courses|class|classes|ocw|mooc|semester|محاضرات|دورة|دورات)\b/.test(address)) return "course";
  if (/\b(series|talks|podcast|podcasts|season|episodes|سلسلة|سلاسل|حلقات)\b/.test(address)) return "series";
  return "book";
}

/** A slug for a new row that no existing row already holds: the title's
 *  slug, then `-2`, `-3`… The editor shows it and the reader can retype it. */
export function libraryFreshSlug(title: string, taken: readonly LibraryPathRef[]): string {
  const base = librarySlug(title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "")) ?? "shelf";
  const used = new Set(taken.map((row) => row.slug));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const slug = `${base}-${n}`;
    if (!used.has(slug)) return slug;
  }
}

/** A row for a folder the reader just chose: title from the folder's name,
 *  a fresh address, the kind guessed from what is inside. */
export function libraryRowForFolder(folder: string, unitNames: readonly string[], taken: readonly LibraryPathRef[]): LibraryPathRef {
  const title = libraryTitleOf(folder) || folder;
  return {
    id: libraryPathId(),
    slug: libraryFreshSlug(title, taken),
    folder,
    kind: guessLibraryKind(folder, unitNames),
    title,
  };
}

/** Natural order: `L2` before `L10`, `Chapter 9` before `Chapter 40`, and a
 *  plain name after every numbered one. */
export function compareUnits(
  a: Pick<LibraryUnit, "name" | "number" | "key">,
  b: Pick<LibraryUnit, "name" | "number" | "key">,
): number {
  if (a.number !== null && b.number !== null && a.number !== b.number) return a.number - b.number;
  if (a.number !== null && b.number === null) return -1;
  if (a.number === null && b.number !== null) return 1;
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) || a.key.localeCompare(b.key);
}

/** Lessons inside a unit: the hub (a note named like its unit) first, then
 *  natural order by title, so `Part 2` follows `Part 1` and not `Part 10`. */
export function compareLessons(unitName: string) {
  const hub = unitName.trim().toLowerCase();
  return (a: { title: string; path: string }, b: { title: string; path: string }): number => {
    const ah = a.title.trim().toLowerCase() === hub ? 0 : 1;
    const bh = b.title.trim().toLowerCase() === hub ? 0 : 1;
    if (ah !== bh) return ah - bh;
    return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }) || a.path.localeCompare(b.path);
  };
}

/** `/library`, `/library/<slug>`, `/library/<slug>/<n>`. */
export function libraryUrl(slug?: string, lesson?: number): string {
  if (slug === undefined) return "/library";
  return lesson === undefined ? `/library/${encodeURIComponent(slug)}` : `/library/${encodeURIComponent(slug)}/${lesson}`;
}
