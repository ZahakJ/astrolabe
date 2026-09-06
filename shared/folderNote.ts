// FOLDER NOTES — a folder's own metadata, kept in the vault.
//
// A folder can carry a note named like itself (Obsidian's folder-note
// convention: `Books/Feynman Lectures/Feynman Lectures.md`) or an `index.md`
// (`_index.md`, `README.md`) inside it. Its frontmatter describes the FOLDER:
//
//   description: One line under the title.        (also `blurb:`, `summary:`)
//   icon: flask                                    (a mark from the glyph set)
//   cover: attachments/cover.jpg                   (also `banner:`)
//   source: https://…
//   library: book | course | series                (this folder is a path on the shelf)
//   title: A nicer name than the folder's
//   hidden: true
//
// A TAG PAGE (a note in the tags folder) reads the same keys under
// `collection: true`, plus `folder:` — that is how a collection is declared in
// the vault rather than in a settings row: the tag is the collection, notes
// join by carrying it, and the page gives it a mark, a line and a folder.
//
// Categories (settings.topics: folders) read title, description, icon and
// hidden from here; collections that name the folder fall back to the
// description; the library takes the whole set, and `library:` DECLARES a
// path without a settings row at all. Settings rows still win where they say
// something — the vault is where the facts live, settings is where the owner
// overrides one. Pure: shared by the indexer and the tests.

import { isFolderMark, type FolderMark } from "./folderIcons.ts";
import { isLibraryKind } from "./library.ts";
import { vaultFolderPath } from "./publicFolders.ts";
import type { LibraryKind } from "./types.ts";

export interface FolderMeta {
  title?: string;
  description?: string;
  icon?: FolderMark;
  cover?: string;
  source?: string;
  library?: LibraryKind;
  hidden?: boolean;
  /** For a TAG PAGE declaring a collection: the vault folder whose published
   *  notes all belong, beside the ones carrying the tag. */
  folder?: string;
}

const INDEX_NAMES = new Set(["index", "_index", "readme"]);

/** The folder this note describes, if it is a folder note; null otherwise.
 *  Never the vault root: a root `index.md` is the home note, not a folder's. */
export function folderOfNote(notePath: string): string | null {
  const slash = notePath.lastIndexOf("/");
  if (slash <= 0) return null;
  const folder = notePath.slice(0, slash);
  const base = notePath.slice(slash + 1).replace(/\.(md|tex)$/i, "");
  const folderName = folder.slice(folder.lastIndexOf("/") + 1);
  if (base === folderName || INDEX_NAMES.has(base.toLowerCase())) return folder;
  return null;
}

/** The note paths that could be `folder`'s folder note, most specific first. */
export function folderNoteCandidates(folder: string): string[] {
  const name = folder.slice(folder.lastIndexOf("/") + 1);
  return [`${folder}/${name}.md`, `${folder}/index.md`, `${folder}/_index.md`, `${folder}/README.md`, `${folder}/readme.md`];
}

const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s === "" ? undefined : s.slice(0, max);
};

/** What a folder note's frontmatter says about its folder. Unknown or empty
 *  values are simply absent; nothing here throws. */
export function folderMetaOf(fm: Record<string, unknown>): FolderMeta {
  const out: FolderMeta = {};
  const title = str(fm.title, 80);
  if (title) out.title = title;
  const description = str(fm.description, 300) ?? str(fm.blurb, 300) ?? str(fm.summary, 300);
  if (description) out.description = description;
  if (isFolderMark(fm.icon)) out.icon = fm.icon;
  const cover = str(fm.cover, 500) ?? str(fm.banner, 500);
  if (cover) out.cover = cover;
  const source = str(fm.source, 500);
  if (source) out.source = source;
  if (isLibraryKind(fm.library)) out.library = fm.library;
  else if (fm.library === true) out.library = "book";
  if (fm.hidden === true) out.hidden = true;
  const folder = vaultFolderPath(fm.folder);
  if (folder !== null) out.folder = folder;
  return out;
}

export function hasFolderMeta(meta: FolderMeta | null | undefined): meta is FolderMeta {
  return !!meta && Object.keys(meta).length > 0;
}
