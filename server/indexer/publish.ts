// What a visitor may fetch: the published set's attachments, the export
// selection, the reverse lookups a delete dialog asks. Moved out of
// server/indexer.ts, which keeps the store these read.

import type { ExportScope } from "../../shared/types.ts";
import { isNoteVisibleToVisitor, languageHidden, type FilterLang } from "./language.ts";
import { addAttachment, attachmentPaths, byName, notes, publishedSet, type NoteRecord } from "../indexer.ts";
import { collectionRows, libraryRefs, refsWithLessons } from "./posts.ts";
import { drawingSvgPath, isDrawingPath, noteLabelOf } from "../../shared/noteFormat.ts";
import { folderImagePaths } from "../../shared/folderIcons.ts";
import { folderOf, linkCandidates, resolveBanner, resolveEmbed, resolveImageRef, resolveLink } from "./resolve.ts";
import { getSettings, settingsAssetPaths } from "../settings.ts";
import { isImagePath } from "../../shared/attachments.ts";
import { libraryCoverPaths } from "../../shared/library.ts";
import { posterNamesIn } from "../../shared/videoEmbeds.ts";
import path from "node:path";

let allowedAttachmentsCache: Set<string> | null = null; // null = recompute

// The same walk one step wider: attachment path -> every note that embeds or
// links it, published or not. `allowedAttachments()` answers "may a VISITOR
// fetch this byte"; this answers "would deleting this file break something a
// reader can see", which is the question a delete dialog has to ask and never
// did. Same lifecycle, same invalidation — see invalidateDerived().
let attachmentRefsCache: Map<string, Set<string>> | null = null;

// ------------------------------------------------------------------- publish

/** Drop the attachment walks (invalidateDerived owns the call). */
export function dropAttachmentMemos(): void {
  allowedAttachmentsCache = null;
  attachmentRefsCache = null;
}

/** Attachment paths embedded/linked by published notes — recomputed on demand
 *  after any index mutation (resolution can shift when files come and go). */
export function allowedAttachments(): Set<string> {
  if (allowedAttachmentsCache === null) {
    const allowed = new Set<string>();
    for (const notePath of publishedSet) {
      const record = notes.get(notePath);
      if (!record) continue;
      for (const link of record.links) {
        const resolved = resolveEmbed(link.target, false, null);
        if (resolved && attachmentPaths.has(resolved)) allowed.add(resolved);
        // `![[sketch.excalidraw]]` resolves to the DRAWING, a note, and what
        // the published page shows is the picture exported beside it. The
        // picture rides the drawing's door: the note is published, so the
        // svg it embeds is a visitor's to fetch, and nothing else about the
        // drawing is.
        const drawing = resolved ?? resolveLink(link.target, false, null);
        if (drawing && isDrawingPath(drawing)) {
          const svg = drawingSvgPath(drawing);
          if (attachmentPaths.has(svg)) allowed.add(svg);
        }
      }
      // The other half of the embed syntax. `![alt](Media/x.png)` never went
      // through wikilinkRegex(), so `record.links` cannot see it — and the
      // renderer turns it straight into /api/file?path=Media/x.png. Both
      // OBSIDIAN-COMPAT.md and the README promise the form works on the
      // published site; it failed CLOSED (admin saw the image, visitor saw a
      // placeholder, nothing said why), which is a silent public-site
      // breakage of exactly the invisible-state kind. Path first, then the
      // basename fallback resolveEmbed() gives wikilinks, so a note that
      // moved folders keeps rendering.
      for (const asset of record.assets) {
        if (attachmentPaths.has(asset)) {
          allowed.add(asset);
          continue;
        }
        const byName = resolveEmbed(path.posix.basename(asset), false, null);
        if (byName && attachmentPaths.has(byName)) allowed.add(byName);
      }
      // A published note's banner attachment is visitor-visible too.
      const banner = resolveBanner(record);
      if (banner && attachmentPaths.has(banner)) allowed.add(banner);
      // A film's still (`![[clip.mp4|poster=frame.jpg]]`): the page asks for
      // it before the film, so a visitor must be able to have it.
      for (const poster of posterPaths(record)) allowed.add(poster);
      // THE FOURTH ROUTE, and the one that is invisible to every markdown
      // scanner: a ```tracker fence's `cover:`. It is inside a code block, so
      // neither `record.links` nor `record.assets` can hold it, and a shelf
      // published with its art would have shown the owner the covers and the
      // reader a row of holes. Same ladder the embeds take.
      for (const cover of trackerCovers(record)) allowed.add(cover);
    }
    allowedAttachmentsCache = allowed;
  }
  return allowedAttachmentsCache;
}

/** Every attachment ONE note points at, by any of the three routes the
 *  renderer honours. Factored out because two callers need exactly this walk
 *  and they must not drift: `allowedAttachments()` (may a visitor fetch it)
 *  and `attachmentRefs()` (would deleting it break a note). A file the publish
 *  allowlist serves but the delete dialog cannot see is the whole bug. */
function collectAttachmentTargets(record: NoteRecord, add: (att: string) => void): void {
  for (const link of record.links) {
    const resolved = resolveEmbed(link.target, false, null);
    if (resolved && attachmentPaths.has(resolved)) add(resolved);
  }
  // The other half of the embed syntax. `![alt](Media/x.png)` never went
  // through wikilinkRegex(), so `record.links` cannot see it — and the
  // renderer turns it straight into /api/file?path=Media/x.png. Both
  // OBSIDIAN-COMPAT.md and the README promise the form works on the
  // published site; it failed CLOSED (admin saw the image, visitor saw a
  // placeholder, nothing said why), which is a silent public-site
  // breakage of exactly the invisible-state kind. Path first, then the
  // basename fallback resolveEmbed() gives wikilinks, so a note that
  // moved folders keeps rendering.
  for (const asset of record.assets) {
    if (attachmentPaths.has(asset)) {
      add(asset);
      continue;
    }
    const byName = resolveEmbed(path.posix.basename(asset), false, null);
    if (byName && attachmentPaths.has(byName)) add(byName);
  }
  // A note's banner attachment counts too: it is visitor-visible when the note
  // is published, and deleting it blanks the post's header either way.
  const banner = resolveBanner(record);
  if (banner && attachmentPaths.has(banner)) add(banner);
  // A film's poster, by the same argument (and the twin of the loop in
  // allowedAttachments()).
  for (const poster of posterPaths(record)) add(poster);
  // And a tracker's cover, by the same argument the banner makes — see the
  // twin of this loop in allowedAttachments(). These two walks must never
  // drift; a file the publish allowlist serves but the delete dialog cannot
  // see is the whole bug this function was factored out to prevent.
  for (const cover of trackerCovers(record)) add(cover);
}

/** The attachment paths a note's ```tracker fences name as covers, resolved.
 *  One implementation, two callers (the allowlist and the reference map), for
 *  the reason collectAttachmentTargets() itself exists. */
/** A tracker's `cover:` as something the session may fetch, or null.
 *
 *  The same path-then-basename ladder `trackerCovers()` climbs, applied per
 *  session: a FULL PATH (what the Media page's picker and its upload write,
 *  `attachments/cover.jpg`) is taken as it is when the file exists — and for
 *  a visitor only when the allowlist carries it — and anything else goes
 *  through `resolveEmbed()` as a wikilink name would, then by its basename.
 *  Before this the shelf resolved the raw text only, so a cover the editor's
 *  card drew (its resolver tries the literal path) was a glyph on the board.
 *  An `https://` cover passes through untouched: it is not ours to scope. */
export function coverPath(cover: string | null, visitor: boolean, lang: FilterLang): string | null {
  if (cover === null) return null;
  if (/^https:\/\//i.test(cover)) return cover;
  if (attachmentPaths.has(cover)) {
    return visitor && !allowedAttachments().has(cover) ? null : cover;
  }
  return resolveEmbed(cover, visitor, lang) ?? resolveEmbed(path.posix.basename(cover), visitor, lang);
}

/** The stills a note's film embeds name (`|poster=frame.jpg`), resolved.
 *  Read off the lines its links were found on: a poster rides the same
 *  `![[…]]` as its film, so the line is already in the record. */
function posterPaths(record: NoteRecord): string[] {
  const out: string[] = [];
  const lines = new Set(record.links.map((l) => l.line));
  for (const line of lines) {
    for (const name of posterNamesIn(line)) {
      const hit = resolveEmbed(name, false, null);
      if (hit && attachmentPaths.has(hit) && !out.includes(hit)) out.push(hit);
    }
  }
  return out;
}

function trackerCovers(record: NoteRecord): string[] {
  const out: string[] = [];
  for (const tracker of record.trackers) {
    if (tracker.cover === null) continue;
    // Path first, then the basename fallback resolveEmbed() gives wikilinks —
    // exactly what `assets` does above, so `cover: art.jpg` finds the file
    // wherever the vault keeps its attachments.
    if (attachmentPaths.has(tracker.cover)) {
      out.push(tracker.cover);
      continue;
    }
    const byName = resolveEmbed(path.posix.basename(tracker.cover), false, null);
    if (byName && attachmentPaths.has(byName)) out.push(byName);
  }
  return out;
}

/** attachment path -> the notes that embed or link it. Built lazily over
 *  EVERY note (not just the published ones): the question it answers is
 *  "what breaks if this file goes", and an unpublished note breaking is still
 *  the owner's note breaking. */
function attachmentRefs(): Map<string, Set<string>> {
  if (attachmentRefsCache === null) {
    const map = new Map<string, Set<string>>();
    for (const record of notes.values()) {
      collectAttachmentTargets(record, (att) => {
        let set = map.get(att);
        if (!set) map.set(att, (set = new Set()));
        set.add(record.path);
      });
    }
    attachmentRefsCache = map;
  }
  return attachmentRefsCache;
}

// ---------------------------------------------------------------------- export

export interface ExportSelection {
  /** Note paths in the archive, sorted — every format the index holds. */
  notes: string[];
  /** Attachment paths the notes point at, sorted, deduplicated. Empty when
   *  the caller asked for notes alone. */
  attachments: string[];
}

/** What an export takes: the notes a scope names, and the files those notes
 *  reference by any route the renderer honours. Answered from the index —
 *  the same `collectAttachmentTargets()` walk the delete dialog and the
 *  publish allowlist use, so an export can never carry a picture the app
 *  would not show, nor miss one it would. Not re-parsed: the index already
 *  knows every note's links, assets, banner and tracker covers, and a second
 *  parser here would drift from the first the way the three regexes this
 *  file keeps in step nearly did.
 *
 *  A drawing embed (`![[sketch.excalidraw]]`) brings the svg exported beside
 *  it, on the argument `allowedAttachments()` makes: the picture is what the
 *  drawing SHOWS, and a reader without Excalidraw has nothing else.
 *
 *  Folder and tag scopes are the ADMIN's: every note, published or not —
 *  the export is admin-only and a visitor never reaches it. */
export function exportSelection(scope: ExportScope, target: string, withAttachments: boolean): ExportSelection {
  let paths: string[];
  switch (scope) {
    case "note":
      paths = notes.has(target) ? [target] : [];
      break;
    case "folder": {
      const prefix = target === "" ? "" : `${target}/`;
      paths = [...notes.keys()].filter((p) => p.startsWith(prefix));
      break;
    }
    case "tag":
      paths = notesWithTag(target);
      break;
    case "vault":
      paths = [...notes.keys()];
      break;
  }
  paths.sort();
  const attachments = new Set<string>();
  if (withAttachments) {
    for (const notePath of paths) {
      const record = notes.get(notePath);
      if (!record) continue;
      collectAttachmentTargets(record, (att) => attachments.add(att));
      for (const link of record.links) {
        const drawing = resolveLink(link.target, false, null);
        if (drawing && isDrawingPath(drawing)) {
          const svg = drawingSvgPath(drawing);
          if (attachmentPaths.has(svg)) attachments.add(svg);
        }
      }
    }
  }
  return { notes: paths, attachments: [...attachments].sort() };
}

/** The notes that embed or link `attachmentRel`, sorted. Empty for a path no
 *  note points at — and for a note path, which is what `backlinks()` is for.
 *
 *  This is the number every delete dialog in the product was missing. A
 *  folder holding four images and no markdown said "0 notes" and moved on;
 *  the essay one folder over went to the public site with four broken
 *  embeds, and nothing anywhere said a word. */
export function notesReferencing(attachmentRel: string): string[] {
  const set = attachmentRefs().get(attachmentRel);
  return set ? [...set].sort() : [];
}

/** The notes that `[[wikilink]]` a NOTE, sorted — the same question one
 *  object over, so a note delete can name what it is about to orphan.
 *  Cheaper than `backlinks()`: no context line is read. */
export function notesLinkingTo(noteRel: string): string[] {
  const out: string[] = [];
  for (const candidate of linkCandidates(noteRel)) {
    const record = notes.get(candidate);
    if (record === undefined) continue;
    if (record.links.some((link) => resolveLink(link.target, false, null) === noteRel)) out.push(record.path);
  }
  return out.sort();
}

/** The notes `noteRel` links to — its resolved outgoing wikilinks, admin
 *  scope. "Suggest links" (server/embeddings.ts) leaves these out: a passage
 *  the note already links to is not a suggestion. */
export function notesLinkedFrom(noteRel: string): string[] {
  const record = notes.get(noteRel);
  if (record === undefined) return [];
  const out = new Set<string>();
  for (const link of record.links) {
    const target = resolveLink(link.target, false, null);
    if (target !== null && target !== noteRel) out.add(target);
  }
  return [...out].sort();
}

/** Every note carrying `tag` OR a tag nested under it, sorted.
 *
 *  The candidate list for a tag rename, and deliberately WIDER than what the
 *  rewrite will change: the index reads `#define` inside a shell fence as a tag
 *  (tests/tags.test.ts pins that known over-count) while `server/tagRewrite.ts`
 *  refuses to edit code, so a file can arrive here and contribute nothing. That
 *  asymmetry is the right one — the cheap in-memory scan proposes, the surgeon
 *  disposes, and the number the dialog prints comes from the surgeon.
 *
 *  Nested tags come along because a tag hierarchy is one name with slashes in
 *  it: renaming `zettel` and leaving `zettel/seed` behind is the failure every
 *  Obsidian thread about this feature complains of. */
export function notesWithTag(tag: string): string[] {
  const root = tag.trim().replace(/^#/, "").toLowerCase();
  if (root === "") return [];
  const prefix = `${root}/`;
  const out: string[] = [];
  for (const record of notes.values()) {
    if (record.tags.some((t) => t === root || t.startsWith(prefix))) out.push(record.path);
  }
  return out.sort();
}

export function isNotePublished(relPath: string): boolean {
  return publishedSet.has(relPath);
}

export function isAllowedAttachment(relPath: string): boolean {
  if (allowedAttachments().has(relPath)) return true;
  // A library path's cover is visitor-visible on the shelf's terms. Read LIVE
  // from settings rather than baked into the allowlist above: that cache is
  // dropped only by index mutations, and a cover set in the panel has moved
  // no file — it would have stayed a 404 until the next vault event.
  if (!attachmentPaths.has(relPath)) return false;
  const settings = getSettings();
  // ON THE SHELF'S TERMS MEANS ON THE SHELF. A path with no published note
  // under it is not sent to anybody (server/library.ts resolveLibraryPath
  // returns null on zero lessons), so its cover is art nobody can reach a
  // page for — and serving it anyway handed an anonymous caller a picture out
  // of a folder every note of which is a draft. Folder notes make that easy
  // to do by accident (`library: book` + `cover:` and nothing published yet)
  // and shelf roots make it the default shape, so the filter is here rather
  // than in libraryCoverPaths: the rule is about THIS index, not about a
  // settings shape shared/library.ts can judge on its own.
  if (libraryCoverPaths({ enabled: settings.library?.enabled, paths: refsWithLessons(libraryRefs()) }).includes(relPath)) {
    return true;
  }
  // A folder's or a collection's image mark, on the same live terms.
  if (folderImagePaths(settings.folderIcons).includes(relPath)) return true;
  return collectionRows().some((row) => row.icon === relPath);
}

/** Published notes as { path, title }, unsorted. */
/** The visitor sidebar's flat note list. This is a discovery surface like any
 *  other, so the languageFilter applies: leaving it unfiltered would list the
 *  titles and paths of notes every other public surface is hiding. */
export function publishedNotes(lang: FilterLang): { path: string; title: string }[] {
  const out: { path: string; title: string }[] = [];
  for (const notePath of publishedSet) {
    const record = notes.get(notePath);
    if (record && !languageHidden(record, lang)) out.push({ path: record.path, title: record.title });
  }
  return out;
}

/** The visitor-visible notes currently indexed under a folder — what a
 *  `{kind:"deleted", dir:true}` event is about to take away from the public
 *  collection. Sampled synchronously by the SSE visitor filter, before the
 *  chained reindex tears the records down. Hidden and unpublished notes are
 *  never named, so fanning a folder delete out through this leaks nothing the
 *  visitor could not already enumerate from /api/tree. */
export function visibleNotesUnder(relFolder: string, lang: FilterLang): string[] {
  const prefix = `${relFolder}/`;
  const out: string[] = [];
  for (const notePath of publishedSet) {
    if (notePath.startsWith(prefix) && isNoteVisibleToVisitor(notePath, lang)) out.push(notePath);
  }
  return out.sort();
}

/** Every published note path — the ADMIN's view of publish state, and the
 *  only one that is not a visitor surface. `publishedNotes()` above applies
 *  the languageFilter because it feeds the visitor's sidebar; this one must
 *  not, or the owner's own publish marks inherit a rule written for strangers
 *  and a published-but-hidden note reads as unpublished in the editor that
 *  published it. Sorted, so the answer is stable across reindexes. */
export function publishedPaths(): string[] {
  return [...publishedSet].sort();
}

export function publishedCounts(): { notes: number; total: number } {
  return { notes: publishedSet.size, total: notes.size };
}

// --------------------------------------------------------------- attachments

/** All indexed image attachments, sorted — the admin banner picker's list. */
export function listImageAttachments(): string[] {
  return [...attachmentPaths].filter((p) => isImagePath(p)).sort((a, b) => a.localeCompare(b));
}

/** Every attachment NO note points at — the complement of `attachmentRefs()`
 *  plus the four routes a file is used by WITHOUT a note naming it: the svg a
 *  drawing exports beside itself, a library path's cover, a folder's or a
 *  collection's image mark (settings, or the folder note's own `icon:` /
 *  `banner:`), and the site assets settings name (logo, favicon, the home
 *  banner). Reused collectors, never a second parse: a file this list calls
 *  unused while the publish allowlist serves it is the delete-preview bug
 *  wearing a third hat, and the only way to be sure the two agree is for
 *  them to be the same walk.
 *
 *  `.trash/`, `.obsidian/` and every other ignored tree are absent by
 *  construction — `attachmentPaths` is filled by the same walk that ignores
 *  them (vault.ts listVaultFiles). Sorted, so the list is stable between two
 *  openings of the modal. */
export function unreferencedAttachments(): string[] {
  const used = new Set<string>(attachmentRefs().keys());
  const settings = getSettings();
  for (const record of notes.values()) {
    if (isDrawingPath(record.path)) {
      const svg = drawingSvgPath(record.path);
      if (attachmentPaths.has(svg)) used.add(svg);
    }
    // A folder note's own mark and cover, resolved the way a banner is:
    // from the note's folder first, then anywhere in the vault by name.
    for (const meta of [record.folderMeta, record.collectionMeta]) {
      if (!meta) continue;
      for (const value of [meta.icon, meta.cover]) {
        if (typeof value !== "string" || value === "") continue;
        const resolved = resolveImageRef(value, folderOf(record.path));
        if (resolved !== null && attachmentPaths.has(resolved)) used.add(resolved);
      }
    }
  }
  // UNFILTERED on purpose, where isAllowedAttachment() filters by "has a
  // published lesson". The agreement the docstring above asks for is
  // ONE-DIRECTIONAL — nothing the allowlist serves may be called unused — so a
  // stricter allowlist keeps it. Going the other way would put the cover the
  // owner chose for a book they have not published yet into a delete list,
  // which is the very bug this walk exists to prevent.
  for (const cover of libraryCoverPaths({ enabled: settings.library?.enabled, paths: libraryRefs() })) used.add(cover);
  for (const icon of folderImagePaths(settings.folderIcons)) used.add(icon);
  for (const row of collectionRows()) if (typeof row.icon === "string") used.add(row.icon);
  for (const asset of settingsAssetPaths()) used.add(asset);
  return [...attachmentPaths].filter((p) => !used.has(p)).sort((a, b) => a.localeCompare(b));
}

/** Register a just-written attachment immediately (uploads must show up in
 *  the picker / resolve as banners before the watcher debounce lands). */
export function registerAttachment(relPath: string): void {
  addAttachment(relPath);
}

// `attachmentsUnder`, `notesUnder`, `attachmentReferrers` and
// `attachmentUsage` stood between here and the title helper below. They served
// `GET /api/impact`, which asked what a delete would really take — and that
// question is now `deletePreview()`'s, which walks the same files
// `deleteFolder()` will actually move (`listVaultFiles`) and reads references
// through `notesReferencing()`. Keeping a second, differently-derived answer
// beside it is how two dialogs come to describe one delete differently.

/** A note's display title (sanitized, as every other surface shows it), or
 *  its basename when the note is not indexed. */
export function noteTitle(relPath: string): string {
  // Not indexed: the FILE surfaces' name (shared/noteFormat.ts noteLabelOf) —
  // `.md` off, `.tex` and `.latex` kept, as the tree shows it.
  return notes.get(relPath)?.title ?? noteLabelOf(relPath);
}
