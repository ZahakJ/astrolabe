// THE FOLDER GLYPH SET — one closed vocabulary, drawn once, used twice.
//
// A folder in the vault tree may wear one of these, and (feature B) so may a
// public folder on the blog. Both surfaces read the SAME table, which is the
// whole reason this module exists: two hand-kept icon lists drift, and the
// second one to drift is always the one the visitor sees.
//
// WHY A CLOSED ENUM AND NOT A NAME. shared/designChrome.ts:188-190 settled
// this for the site designer and the argument is unchanged here: a free-text
// icon field is a promise the renderer cannot keep. Someone types "bookshelf",
// nothing draws, and the only feedback is a blank space. A union of twenty
// means the picker IS the documentation and an unknown value is a 400 at the
// door rather than a hole in the sidebar. Three hundred is still closed.
//
// WHY PATH STRINGS AND NOT JSX. This module is loaded by server/settings.ts to
// validate a PATCH and by tests/folderIcons.test.ts under bare node. A `.tsx`
// full of elements could be neither. The client wraps these in one <svg> in
// client/components/FolderGlyph.tsx; nothing else here knows React exists.
//
// HOW THEY ARE DRAWN (client/components/design/SectionGlyph.tsx:11-25):
//  * A 0 0 24 24 grid, stroke 1.7, fill none, currentColor, round caps/joins —
//    the sidebar's own house style (Sidebar.tsx:349-403), so a folder glyph and
//    an attachment glyph sit on the same row without one looking imported.
//  * The drawing is the SHAPE OF THE THING, never a letter or a symbol.
//  * Every glyph must survive 14px. That rule threw out more detail than it
//    kept: the telescope lost its finder scope, the pawn its bevel, the
//    gamepad its shoulder buttons. What is left is silhouette.
//  * NO TWO CONFUSABLE AT 14px, including against the attachment glyphs that
//    share the tree. `music` is a SINGLE note precisely because the audio
//    attachment glyph is already the beamed pair (Sidebar.tsx:369-377), and
//    `book` is the OPEN book because a closed one reads as `archive` at 14px.

import { FOLDER_ICON_NAMES } from "./folderIconNames.ts";

/** The set, in picker order — generated from shared/folderIconCatalog.ts by
 *  scripts/gen-folder-icons.mjs: the twenty hand-drawn originals first (their
 *  names are what a 2.6 settings.json stores), then the Lucide drawings the
 *  catalog shelves by subject. */
export type FolderIcon = (typeof FOLDER_ICON_NAMES)[number];

export const FOLDER_ICONS: readonly FolderIcon[] = FOLDER_ICON_NAMES;

/** A folder's mark may also be AN IMAGE OF THE OWNER'S OWN — a vault-relative
 *  attachment (`attachments/icons/rocket.svg`), uploaded through the picker
 *  or pointed at. The union stays closed in the sense that matters: a glyph
 *  name is one of the set, an image is a path with an image extension and no
 *  `..`, and anything else is a 400 at the door. The renderer draws the
 *  glyph from its paths and the image from /api/file, which serves it to a
 *  visitor on the covers' terms (server/indexer.ts isAllowedAttachment). */
export type FolderImage = `${string}.${"svg" | "png" | "webp" | "gif" | "jpg" | "jpeg"}`;
export type FolderMark = FolderIcon | FolderImage;

const IMAGE_RE = /\.(?:svg|png|webp|gif|jpe?g)$/i;

export function isFolderImage(value: unknown): value is FolderImage {
  if (typeof value !== "string" || value.length > 400 || !IMAGE_RE.test(value)) return false;
  if (value.startsWith("/") || value.includes("\\") || /^[A-Za-z]:/.test(value)) return false;
  return !value.split("/").some((part) => part === "" || part === "." || part === "..");
}

/** A glyph name or an image path — what a folder, a collection, a folder
 *  note or a tag page may wear. */
export function isFolderMark(value: unknown): value is FolderMark {
  return isFolderIcon(value) || isFolderImage(value);
}

/** The image marks among a folder-icon map's values, for the file gate. */
export function folderImagePaths(map: Readonly<Record<string, FolderMark>> | undefined): string[] {
  const out: string[] = [];
  for (const mark of Object.values(map ?? {})) if (isFolderImage(mark) && !out.includes(mark)) out.push(mark);
  return out;
}

/** Is this a glyph this build can actually draw? The one gate every PATCH,
 *  every frontmatter row and every hydrated store value goes through — a
 *  value that fails it must never reach a renderer, because an unknown icon
 *  renders NOTHING and a folder that silently lost its mark is a bug report. */
export function isFolderIcon(value: unknown): value is FolderIcon {
  return typeof value === "string" && NAMES.has(value);
}

/** The enum as a lookup. Built from the NAMES, deliberately never from the
 *  path table — that is a bundle contract, not a style preference. Everything
 *  that merely VALIDATES an icon (the store's hydration, the settings PATCH,
 *  feature B's frontmatter) would otherwise drag eighty kilobytes of drawings
 *  behind it into every chunk that touches it. The path table is loaded
 *  lazily by the one renderer (FolderGlyph.tsx) and by the picker. */
const NAMES = new Set<string>(FOLDER_ICONS);

/** How many folders may carry a mark. The number `excludeTags`/`tagLabels`
 *  argue for (settings.ts:1108-1119): settings.json is read on every request
 *  and GET /api/settings is fetched every time the panel opens, so a map with
 *  no ceiling is a self-inflicted 400 kB response waiting to happen. Two
 *  hundred marked folders is far past the point where a mark still MEANS
 *  anything — a tree where every row has a glyph has no glyphs. */
export const FOLDER_ICONS_MAX = 200;

/** Read-side cleaner for a stored `folderIcons` map: keeps the rows this
 *  build can draw and DROPS the rest in silence.
 *
 *  Silence is the same call `cleanTagLabels` makes, for the same reason: this
 *  is a bulk map, a hand-edited settings.json naming one glyph that does not
 *  exist must not cost the other nineteen folders their marks, and a read
 *  that throws takes the instance down. The PATCH handler is where a bad row
 *  is a 400 — a write is a person making a claim, a read is a file. */
export function cleanFolderIcons(value: unknown): Record<string, FolderMark> {
  const out: Record<string, FolderMark> = Object.create(null) as Record<string, FolderMark>;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { ...out };
  let kept = 0;
  for (const [rawKey, icon] of Object.entries(value as Record<string, unknown>)) {
    if (kept >= FOLDER_ICONS_MAX) break;
    const key = folderIconKey(rawKey);
    if (key === null || !isFolderMark(icon)) continue;
    out[key] = icon;
    kept++;
  }
  return { ...out };
}

/** A stored key normalized to the vault-relative folder path it claims to be,
 *  or null when it cannot be one. Shape only — whether that folder EXISTS is
 *  not asked, here or anywhere: a folder can be renamed by any means the
 *  owner likes (git pull, Finder, another editor), and a map that pruned
 *  itself on every read would lose a mark to a five-second outage. */
export function folderIconKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // A TRAILING slash is punctuation — `TreeNode.path` never carries one, and a
  // reader typing "notes/games/" means the folder either way. A LEADING one is
  // not: stripping it is exactly the silent rewrite `vaultRel()` exists to
  // refuse (settings.ts:705-720). `{"/etc": "book"}` must be an error, not a
  // mark quietly placed on `etc`. Same for a backslash and a drive letter:
  // a path that cannot mean what it says is an error, not a hint.
  const key = raw.trim().replace(/\/+$/, "");
  if (key === "" || key.length > 400) return null;
  if (key.startsWith("/") || key.includes("\\") || /^[A-Za-z]:/.test(key)) return null;
  // No `..`, no empty or `.` segment — the shape half of what `vaultRel()`
  // refuses; the other half (ignored-dir rejection) needs the vault root and
  // stays server-side. Checked here as well so the picker and the blog bundle
  // share ONE definition of a legal key rather than trusting what got through.
  if (key.split("/").some((part) => part === "" || part === "." || part === "..")) return null;
  return key;
}
