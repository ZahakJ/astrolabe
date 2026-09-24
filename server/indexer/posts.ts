// The public site's lists: excerpts, posts, pages, the library, collections,
// trackers and Sigils. Moved out of server/indexer.ts, which keeps the store
// these read.

import { FenceSkipper, isFurnitureLine, proseLine } from "../../shared/prose.ts";
import { languageHidden, type FilterLang } from "./language.ts";
import { folderNoteCandidates, folderOfNote, type FolderMeta } from "../../shared/folderNote.ts";
import type { LibraryKind, LibraryPathRef, PageMeta, PostMeta, PublicFolderRef, RoutineMeta, TrackerMeta } from "../../shared/types.ts";
import { notes, publishedSet, type NoteRecord } from "../indexer.ts";
import { blogLocale, excludedTags } from "../site.ts";
import { countNoteWords, countWords, readingMinutes } from "../../shared/wordCount.ts";
import { coverPath } from "./publish.ts";
import { createHash } from "node:crypto";
import { derivedSlug, isLibraryLesson, libraryLessonFolders, libraryTitleOf } from "../../shared/library.ts";
import { effectiveFolders, folderSlug, suggestSlug } from "../../shared/publicFolders.ts";
import { getSettings, tagsFolder } from "../settings.ts";
import { isHeadingLine } from "../../shared/headings.ts";
import { numeralSystem, toNumerals } from "../../shared/numerals.ts";
import { resolveBanner, twinFaceOf } from "./resolve.ts";
import { stripNoteExt } from "../../shared/noteFormat.ts";
import { tagKey } from "../../shared/tagLabels.ts";
import { templateMatcher } from "./folders.ts";

// --------------------------------------------------------------------- posts

const EXCERPT_MAX = 220;
/** A paragraph is "real" prose once it carries this many letters — template
 *  furniture like a bare "2026-03-07 19:28" timestamp or a "Tags: a b" label
 *  line falls short and is skipped (kept only as a last-resort fallback). */
const EXCERPT_MIN_LETTERS = 30;
const EXCERPT_MAX_PARAGRAPHS = 40;

/** First real paragraph of a note body as prose: headings, images, tables,
 *  fences and math never count; consecutive prose lines are joined
 *  (hard-wrapped sources) until a blank/heading/table/fence ends a paragraph.
 *  The first paragraph with EXCERPT_MIN_LETTERS of actual letters wins;
 *  when nothing qualifies, the first letter-bearing (then any) paragraph. */
function firstParagraph(body: string): string {
  const fences = new FenceSkipper();
  let parts: string[] = [];
  let len = 0;
  let paragraphs = 0;
  let fallback = ""; // best sub-threshold paragraph seen (furniture never lands here)
  // Close the open paragraph: return it when it is real prose, else file it
  // as a fallback and return null so the scan continues.
  const finish = (): string | null => {
    if (parts.length === 0) return null;
    const para = parts.join(" ").replace(/\s+/g, " ").trim();
    parts = [];
    len = 0;
    if (!para) return null;
    paragraphs++;
    const letters = (para.match(/\p{L}/gu) ?? []).length;
    if (letters >= EXCERPT_MIN_LETTERS) return para;
    if (!fallback) fallback = para;
    return null;
  };
  for (const raw of body.split("\n")) {
    const boundary =
      fences.skip(raw) ||
      isHeadingLine(raw) ||
      /^\s*\|/.test(raw) ||
      !raw.trim() ||
      isFurnitureLine(raw);
    const line = boundary ? "" : proseLine(raw);
    if (!line) {
      // Boundary or furniture-only line (bare image/embed): paragraph ends.
      const done = finish();
      if (done) return done;
      if (paragraphs >= EXCERPT_MAX_PARAGRAPHS) break;
      continue;
    }
    parts.push(line);
    len += line.length + 1;
    if (len > EXCERPT_MAX * 3) break; // enough source for any excerpt
  }
  return finish() ?? fallback;
}

/** ~220-char excerpt cut on a word boundary, "…" marking a real cut.
 *  Single-char emphasis (*em*, _em_) is stripped here too — excerpts are
 *  plain text, unlike search snippets which keep the historical behavior. */
function excerptOf(body: string): string {
  return cutExcerpt(
    firstParagraph(body)
      // An HTML comment is not prose: a card's `<!--SR:…-->` schedule, a
      // hidden note to self. The Timeline listed a deck by its schedules.
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\s{2,}/g, " ")
      .trim()
      .replace(/(^|[\s([{])\*([^*\n]+)\*(?=[\s)\]}.,;:!?…]|$)/g, "$1$2")
      .replace(/(^|[\s([{])_([^_\n]+)_(?=[\s)\]}.,;:!?…]|$)/g, "$1$2"),
  );
}

/** Cut an already-plain paragraph to EXCERPT_MAX on a word boundary. Shared by
 *  both formats: markdown reaches it through firstParagraph(), LaTeX through
 *  the abstract-or-first-paragraph the parser hands over. */
function cutExcerpt(para: string): string {
  if (para.length <= EXCERPT_MAX) return para;
  let cut = para.slice(0, EXCERPT_MAX + 1);
  const space = cut.lastIndexOf(" ");
  cut = space > EXCERPT_MAX / 2 ? cut.slice(0, space) : cut.slice(0, EXCERPT_MAX);
  return `${cut.replace(/[\s,;:.!?…·—–-]+$/, "")}…`;
}

/** What a post whose body is only a fence says for itself.
 *
 *  A shelf note — one ```tracker fence per thing, or one ```tracker-board —
 *  has no prose at all, so `firstParagraph()` correctly finds nothing and the
 *  card, the dashboard, RSS and og:description all got a post with a title, a
 *  date and a hole where the sentence goes. The fence IS the content; this
 *  says what is in it.
 *
 *  TWO DECISIONS AT THIS SEAM.
 *
 *  1. It is computed HERE rather than folded into `record.post`, which is
 *     memoized until the note is reindexed. The sentence depends on the site's
 *     language, which is a settings row an owner can change at runtime — a
 *     cached one would keep answering in the old language until every shelf
 *     note happened to be saved again.
 *  2. It is written on the SERVER, in both languages, rather than left to the
 *     client's i18n. An excerpt is not chrome: the same string goes into RSS
 *     and into the og:description a stranger's chat app renders, where there
 *     is no client to translate it. `footerLine()` (server/site.ts) already
 *     writes visitor prose this way, off the same setting, for the same
 *     reason. Numerals go through the one policy (shared/numerals.ts), so the
 *     count matches every other number on the card. */
function fenceSummary(record: NoteRecord): string {
  const locale = blogLocale();
  const arabic = /^ar\b/i.test(locale);
  const count = record.trackers.length;
  if (count > 0) {
    const n = toNumerals(String(count), numeralSystem(locale));
    if (arabic) return count === 1 ? "رفّ فيه متتبِّع واحد." : `رفّ فيه ${n} من المتتبِّعات.`;
    return count === 1 ? "A shelf of one tracker." : `A shelf of ${n} trackers.`;
  }
  // A board is a QUERY over the vault's trackers, so it carries none of its
  // own — the note is a shelf of everything. Same sentence the palette uses
  // for the command that inserts it (i18n `slashTrackerBoardDetail`).
  for (const raw of record.body.split("\n")) {
    if (raw.trim() === "") continue;
    if (!/^\s*(?:```|~~~)\s*tracker-board\b/.test(raw)) break;
    return arabic ? "رفّ بكل المتتبّعات في الخزانة." : "A shelf of every tracker in the vault.";
  }
  return "";
}

/** `hidden` is the visitor's EXCLUDE_TAGS set, passed IN rather than fetched.
 *  `excludedTags()` builds a fresh Set out of settings on every call, and this
 *  function is called once per published post — the same "resolve a
 *  configuration value inside the loop that iterates the vault" shape as the
 *  templates walk two screens up, one loop over. */
/** The excerpt and the word count every list of notes prints, cut once per
 *  indexed version of the note and kept on the record (`record.post`). The
 *  blog's post list, the Timeline and on-this-day all read it from here, so
 *  a note says the same opening sentence wherever it is listed. */
export function postBasics(record: NoteRecord): { excerpt: string; words: number } {
  if (record.post === null) {
    record.post = {
      // LaTeX: the abstract when the paper has one, else its first real
      // paragraph — both already plain prose, so the markdown paragraph
      // walker (which reads `#`, `|`, fences and `$$`) never sees TeX.
      excerpt: record.prose !== null ? cutExcerpt(record.excerptSource ?? "") : excerptOf(record.body),
      // Counted from the WHOLE note, not from `flat` — which is capped at
      // MAX_SNIPPET_SOURCE_CHARS because snippets do not need more, and which
      // therefore under-counted every note past 128 KiB and told its readers a
      // reading time for a document that stops two thirds of the way through.
      // `countNoteWords` is the same function the author's status bar uses, so
      // the number on the published article is the number they were shown while
      // writing it. A `.tex` note's prose is already extracted and needs no
      // stripping.
      words:
        record.prose !== null ? countWords(record.prose) : countNoteWords(record.body),
    };
  }
  return record.post;
}

function postMeta(record: NoteRecord, hidden: ReadonlySet<string>, collectionRows: readonly PublicFolderRef[] = collectionRowsNow()): PostMeta {
  const basics = postBasics(record);
  const meta: PostMeta = {
    path: record.path,
    title: record.title,
    date: new Date(record.dateMs).toISOString(),
    // A body that is only a fence has no paragraph to cut; say what the fence
    // holds rather than shipping an empty slot. See fenceSummary().
    excerpt: basics.excerpt !== "" ? basics.excerpt : fenceSummary(record),
    words: basics.words,
    readingMinutes: readingMinutes(basics.words),
    tags: record.tags.filter((t) => !hidden.has(t.toLowerCase())),
  };
  // Assigned only when non-empty, like every other optional field on this
  // shape: almost no note names a folder, and an empty array on every post
  // would be bytes on the wire saying nothing.
  // …and the FOLDER-BACKED collections (a row whose `folder` holds this
  // note) join the declared ones here, at read time, because the mapping
  // lives in settings and moves without the note changing.
  const folders = effectiveFolders(record.folders, record.path, collectionRows, record.tags);
  if (folders.length > 0) meta.folders = folders;
  const banner = resolveBanner(record);
  if (banner) meta.banner = banner;
  // The OTHER FACE (shared/twins.ts), when this note has one and it is
  // published. Unfiltered on purpose — see TwinFaceRef.
  const twin = twinFaceOf(record.path);
  if (twin !== null) meta.twin = twin;
  return meta;
}

/** The folder note's metadata for `folder`, if the vault has one (the note
 *  named like the folder, else index.md and friends — shared/folderNote.ts). */
export function folderMeta(folder: string): FolderMeta | null {
  for (const candidate of folderNoteCandidates(folder)) {
    const record = notes.get(candidate);
    if (record?.folderMeta) return record.folderMeta;
  }
  return null;
}

/** Does the vault hold a PUBLISHED note anywhere under this folder? The
 *  boundary is the slash, like every other folder test on the shelf: `Books/F`
 *  never answers for `Books/Feynman Lectures`. */
function hasPublishedUnder(folder: string): boolean {
  const prefix = folder.endsWith("/") ? folder : `${folder}/`;
  for (const notePath of publishedSet) {
    if (notePath.startsWith(prefix)) return true;
  }
  return false;
}

/** The refs a visitor could reach a page for: one published note under the
 *  folder is the whole test, and it is the same one resolveLibraryPath() makes
 *  when it returns null. Used by the cover allowlist — see isAllowedAttachment. */
export function refsWithLessons(refs: readonly LibraryPathRef[]): LibraryPathRef[] {
  return refs.filter((ref) => hasPublishedUnder(ref.folder));
}

/** A folder note's `source:` is a plain string typed in the vault, and it ends
 *  up in `href` on the path page. A settings row has been https-only since the
 *  rule was written (shared/library.ts cleanLibraryPath); the vault's copy was
 *  not, so `source: javascript:alert(1)` in a folder note rode straight to the
 *  anchor. One regex, the row's own. */
function httpSource(raw: string | undefined): string | null {
  if (typeof raw !== "string") return null;
  const source = raw.trim();
  return source !== "" && /^https?:\/\//i.test(source) ? source : null;
}

/** The immediate subfolders of `folder` that hold a published note, in vault
 *  order. This is a shelf ROOT's whole discovery rule: "a folder with
 *  something published in it" is what a path is, and a prefix scan over
 *  publishedSet is what `libraryLessons()` already does one level down. */
function publishedChildrenOf(folder: string): string[] {
  const prefix = folder.endsWith("/") ? folder : `${folder}/`;
  const out = new Set<string>();
  for (const notePath of publishedSet) {
    if (!notePath.startsWith(prefix)) continue;
    const rel = notePath.slice(prefix.length);
    const slash = rel.indexOf("/");
    // A note sitting directly in the root is not a path — it is a note in a
    // folder the owner chose to hold books, and it stays a post.
    if (slash === -1) continue;
    out.add(prefix + rel.slice(0, slash));
  }
  return [...out];
}

/** Every path on the shelf, in shelf order: the settings rows first, in their
 *  own order, then the folders a SHELF ROOT claims and the folders whose note
 *  declares `library: book|course|series`.
 *
 *  A ROOT says "everything published under here is a book" once, instead of a
 *  hand-typed row per folder saying what the folder's own name already says —
 *  and, unlike a row, it covers the book that has not been written yet. Every
 *  immediate subfolder of the root that holds a published note is a path of the
 *  root's kind, titled by its name; the folder note overrides the kind, the
 *  title, the blurb, the cover, the source, the address and `hidden` for one
 *  folder, which is why the root is not the last word.
 *
 *  A settings row naming the same folder wins field by field and fills its
 *  blanks from the note (a blurb written once in the vault, a cover the row
 *  never mentioned) — so adding a root over folders the rows already name
 *  changes nothing a visitor sees. Settings' `enabled` still gates the whole
 *  shelf, and a derived path with no address is not emitted at all (see
 *  `derivedSlug`). */
export function libraryRefs(): LibraryPathRef[] {
  const lib = getSettings().library;
  const rows = (lib?.paths ?? []).map((row) => ({ ...row }));
  const byFolder = new Map(rows.map((row) => [row.folder, row]));
  const taken = new Set(rows.map((row) => row.slug));
  // Every folder that could become a path, in the order the shelf will list
  // them: each root's published children (by title, so a book added next year
  // lands where its name says and not at the end), then the folders that
  // declare themselves and live under no root at all.
  const candidates: { folder: string; kind: LibraryKind; meta: FolderMeta | null }[] = [];
  const seen = new Set<string>();
  for (const root of lib?.roots ?? []) {
    const children = publishedChildrenOf(root.folder).map((folder) => {
      const meta = folderMeta(folder);
      return { folder, kind: meta?.library ?? root.kind, meta, title: meta?.title ?? libraryTitleOf(folder) ?? folder };
    });
    children.sort(
      (a, b) =>
        a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }) ||
        a.folder.localeCompare(b.folder),
    );
    for (const child of children) {
      if (seen.has(child.folder)) continue;
      seen.add(child.folder);
      candidates.push({ folder: child.folder, kind: child.kind, meta: child.meta });
    }
  }
  const declared: { folder: string; meta: FolderMeta }[] = [];
  for (const record of notes.values()) {
    if (!record.folderMeta?.library) continue;
    const folder = folderOfNote(record.path);
    if (folder === null || seen.has(folder)) continue;
    declared.push({ folder, meta: record.folderMeta });
  }
  declared.sort((a, b) => a.folder.localeCompare(b.folder));
  for (const { folder, meta } of declared) {
    seen.add(folder);
    candidates.push({ folder, kind: meta.library as LibraryKind, meta });
  }
  // A Media tracker that names a path's folder LENDS ITS COVER, over the row's
  // and the folder note's: the book the owner tracks and the book a reader
  // opens are one picture. Resolved in admin scope; the ref cover then joins
  // the visitor allowlist through libraryCoverPaths like any other.
  const lent = new Map<string, string>();
  for (const record of notes.values()) {
    for (const tracker of record.trackers) {
      if (tracker.folder === null || tracker.cover === null || lent.has(tracker.folder)) continue;
      const cover = coverPath(tracker.cover, false, null);
      if (cover !== null) lent.set(tracker.folder, cover);
    }
  }
  for (const row of rows) {
    const cover = lent.get(row.folder);
    if (cover !== undefined) row.cover = cover;
  }
  for (const { folder, kind, meta } of candidates) {
    const row = byFolder.get(folder);
    if (row) {
      // The row is already on the shelf; the folder note only fills its blanks.
      if (meta) {
        if (!row.blurb && meta.description) row.blurb = meta.description;
        if (!row.cover && meta.cover) row.cover = meta.cover;
        if (!row.source) {
          const source = httpSource(meta.source);
          if (source !== null) row.source = source;
        }
      }
      continue;
    }
    const title = meta?.title ?? libraryTitleOf(folder) ?? folder;
    // NO COUNTER, NO "path". A derived address is the folder note's `slug:` or
    // the title's own suggestion, and a folder that has neither — an Arabic
    // title, which on this vault is three books — is not published rather than
    // being handed `/library/path-3`, an address assigned by whichever book
    // existed that morning and keyed to by every reader's saved progress. The
    // settings panel lists it under "Needs an address" with the reason; its
    // notes stay on the blog, exactly where they are today.
    const slug = derivedSlug(title, meta?.slug, taken);
    if (slug === null) continue;
    taken.add(slug);
    const ref: LibraryPathRef = {
      id: `l${createHash("sha1").update(folder).digest("hex").slice(0, 12)}`,
      slug,
      folder,
      kind,
      title,
    };
    if (meta?.description) ref.blurb = meta.description;
    if (meta?.cover) ref.cover = meta.cover;
    const lentCover = lent.get(folder);
    if (lentCover !== undefined) ref.cover = lentCover;
    const source = httpSource(meta?.source);
    if (source !== null) ref.source = source;
    if (meta?.hidden) ref.hidden = true;
    rows.push(ref);
  }
  return rows;
}

/** The lesson folders as the shelf stands now (settings rows and folder
 *  notes together), or none while the library is off. */
function lessonFoldersNow(): string[] {
  const lib = getSettings().library;
  return libraryLessonFolders({ enabled: lib?.enabled, paths: libraryRefs() });
}

/** The collection rows as settings hold them right now — the folder-backed
 *  membership is read live, like the library's lesson folders — PLUS, under
 *  `settings.topics: "folders"`, one row per parent folder of a published
 *  post: title from the folder's name (sorting prefix stripped), mark from
 *  the tree's own folder icon, slug from the title and unique in path order,
 *  so the address a folder gets is the same on every request. Under folders
 *  the declared rows are not consulted at all — a folder note (title,
 *  description, icon, hidden) is how a category is customised — so the two
 *  systems never show side by side. Templates and library lessons are not
 *  posts and make no category; a note at the vault root has no parent and
 *  none either. */
export function collectionRows(): PublicFolderRef[] {
  const settings = getSettings();
  const declared = settings.publicFolders?.folders ?? [];
  if (settings.topics !== "folders") return withTagPages(withFolderNotes(declared));
  // Under folders the declared rows are set aside whole (kept in settings
  // for the day the owner switches back): the folders are the categories,
  // and a folder note is how one is described or hidden.
  const taken = new Set<string>();
  const isTemplate = templateMatcher();
  const lessonFolders = lessonFoldersNow();
  const parents = new Set<string>();
  for (const notePath of publishedSet) {
    const slash = notePath.lastIndexOf("/");
    if (slash <= 0) continue;
    if (isTemplate(notePath)) continue;
    if (lessonFolders.length > 0 && isLibraryLesson(notePath, lessonFolders)) continue;
    parents.add(notePath.slice(0, slash));
  }
  const icons = settings.folderIcons ?? {};
  const derived: PublicFolderRef[] = [];
  for (const folder of [...parents].sort()) {
    // The folder's own note speaks first (title, description, mark, hidden),
    // then the tree's mark, then the folder's name.
    const meta = folderMeta(folder);
    const title = meta?.title ?? (libraryTitleOf(folder) || folder);
    const base = suggestSlug(title) || "folder";
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    taken.add(slug);
    const row: PublicFolderRef = { id: `a${createHash("sha1").update(folder).digest("hex").slice(0, 12)}`, slug, title, icon: meta?.icon ?? icons[folder] ?? "archive", folder };
    if (meta?.description) row.description = meta.description;
    if (meta?.hidden) row.hidden = true;
    derived.push(row);
  }
  return derived;
}

function collectionRowsNow(): PublicFolderRef[] {
  return collectionRows();
}

/** The collections the VAULT declares: every tag page under the tags folder
 *  with `collection: true`. The tag is the collection (the page's own name),
 *  its members are the notes carrying the tag plus a `folder:` the page may
 *  name, its mark/line/title come from the page. A settings row with the
 *  same slug wins field by field — that is the override, and it is rare. */
export function tagPageCollections(): PublicFolderRef[] {
  const root = tagsFolder().replace(/^\/+|\/+$/g, "");
  if (root === "") return [];
  const prefix = `${root.toLowerCase()}/`;
  const out: PublicFolderRef[] = [];
  for (const record of notes.values()) {
    if (!record.collectionMeta) continue;
    if (!record.path.toLowerCase().startsWith(prefix)) continue;
    const tag = tagKey(stripNoteExt(record.path.slice(prefix.length)));
    if (tag === "") continue;
    const meta = record.collectionMeta;
    const slug = folderSlug(tag) ?? suggestSlug(tag) ?? `t-${createHash("sha1").update(tag).digest("hex").slice(0, 8)}`;
    const row: PublicFolderRef = {
      id: `t${createHash("sha1").update(tag).digest("hex").slice(0, 12)}`,
      slug,
      title: meta.title ?? record.labels?.en ?? record.title ?? tag,
      icon: meta.icon ?? "tag",
      tag,
    };
    if (meta.description) row.description = meta.description;
    if (meta.folder) row.folder = meta.folder;
    if (meta.hidden) row.hidden = true;
    out.push(row);
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

function withTagPages(declared: readonly PublicFolderRef[]): PublicFolderRef[] {
  const out: PublicFolderRef[] = declared.map((row) => ({ ...row }));
  for (const page of tagPageCollections()) {
    const row = out.find((r) => r.slug === page.slug);
    if (!row) {
      out.push(page);
      continue;
    }
    // The row overrides what it says; the page supplies the rest.
    if (!row.description && page.description) row.description = page.description;
    if (!row.folder && page.folder) row.folder = page.folder;
    if (!row.tag) row.tag = page.tag;
  }
  return out;
}

/** Declared rows that name a folder take the folder note's description when
 *  they have none of their own — the row says WHICH folder, the vault says
 *  what it is about. */
function withFolderNotes(rows: readonly PublicFolderRef[]): PublicFolderRef[] {
  return rows.map((row) => {
    if (!row.folder || row.description) return row;
    const meta = folderMeta(row.folder);
    return meta?.description ? { ...row, description: meta.description } : row;
  });
}

/** How many posts THIS session can see in each public folder — slug → count.
 *
 *  Scoped exactly like posts(): published only, templates out, the
 *  languageFilter applied for visitors. It has to be, because the number on a
 *  folder card is a promise about the page behind it — a card saying "9" that
 *  opens onto 2 posts is the language filter leaking a count of notes the
 *  reader may not have. Only the slugs asked for are counted, so a note
 *  claiming a folder nobody declared adds nothing anywhere. */
export function publicFolderCounts(
  slugs: readonly string[],
  visitor: boolean,
  lang: FilterLang,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const slug of slugs) counts.set(slug, 0);
  if (counts.size === 0) return counts;
  const isTemplate = templateMatcher(); // once for the loop — see templateMatcher()
  const rows = collectionRowsNow();
  for (const notePath of publishedSet) {
    const record = notes.get(notePath);
    if (!record) continue;
    const folders = effectiveFolders(record.folders, record.path, rows, record.tags);
    if (folders.length === 0) continue;
    if (visitor && languageHidden(record, lang)) continue;
    if (isTemplate(notePath)) continue;
    for (const slug of folders) {
      const current = counts.get(slug);
      if (current !== undefined) counts.set(slug, current + 1);
    }
  }
  return counts;
}

/** Every lesson a library path holds: the published notes under `folder`,
 *  each with the words and minutes the post list prints, scoped exactly as
 *  posts() scopes the feed (the language filter for a visitor, templates out).
 *  The ORDER is the caller's (shared/library.ts); this answers what is there.
 *  An admin sees unpublished notes too — that is how the shelf they are
 *  arranging shows them what a visitor will and will not get — and `published`
 *  says which is which. It is for THIS server only: server/library.ts strips
 *  it off every lesson before the wire (`LibraryLesson` has no such field), so
 *  a draft is never MARKED on a page, only present for an admin and absent for
 *  a visitor. */
export function libraryLessons(
  folder: string,
  visitor: boolean,
  lang: FilterLang,
): { path: string; title: string; words: number; readingMinutes: number; excerpt: string; published: boolean }[] {
  const prefix = folder.endsWith("/") ? folder : `${folder}/`;
  const out: { path: string; title: string; words: number; readingMinutes: number; excerpt: string; published: boolean }[] = [];
  const isTemplate = templateMatcher();
  const hidden = excludedTags();
  // ONCE FOR THE LOOP, like `hidden` and `isTemplate` beside it. postMeta()
  // defaults this parameter to collectionRowsNow(), which walks the whole
  // vault; left to default it ran ONCE PER LESSON, so resolving a 40-lesson
  // book was forty full-vault walks and a five-path shelf was two hundred — on
  // every anonymous /api/me, which asks for the door. The rows are the same
  // for every lesson of every path in one request.
  const rows = collectionRowsNow();
  const source = visitor ? publishedSet : notes.keys();
  for (const notePath of source) {
    if (!notePath.startsWith(prefix)) continue;
    const record = notes.get(notePath);
    if (!record) continue;
    if (visitor && languageHidden(record, lang)) continue;
    if (isTemplate(notePath)) continue;
    const meta = postMeta(record, hidden, rows);
    out.push({
      path: meta.path,
      title: meta.title,
      words: meta.words,
      readingMinutes: meta.readingMinutes,
      excerpt: meta.excerpt,
      published: publishedSet.has(notePath),
    });
  }
  return out;
}

/** Published notes as blog posts, newest first (visitor-safe: published only,
 *  EXCLUDE_TAGS filtered). Per-note fields are cached on the index record and
 *  refresh incrementally as notes reindex. `visitor` additionally applies the
 *  languageFilter (public lists only — admin surfaces are never filtered). */
export function posts(visitor: boolean, lang: FilterLang, excludePages = false): PostMeta[] {
  const out: { dateMs: number; meta: PostMeta }[] = [];
  const isTemplate = templateMatcher(); // once for the loop — see templateMatcher()
  const hidden = excludedTags(); // likewise: one Set for the list, not one per post
  // A LESSON IS NOT A POST. A published note inside a library path belongs to
  // the shelf (server/library.ts reads it there); listing it here as well put
  // every chapter of a book on the blog home, in the topics and in the feed
  // the day the owner published them — "my chapter notes went to be actual
  // blog posts". Both lists, admin and visitor: the admin's answers "what is
  // on my blog", and the shelf is not the blog. The note's own URL still
  // works; only the listings change.
  const lessonFolders = lessonFoldersNow();
  const rows = collectionRowsNow();
  for (const notePath of publishedSet) {
    const record = notes.get(notePath);
    if (!record) continue;
    if (visitor && languageHidden(record, lang)) continue;
    if (lessonFolders.length > 0 && isLibraryLesson(notePath, lessonFolders)) continue;
    // A template is not a post — in EITHER list. The admin's post list is the
    // one that answers "what is on my blog", so a stencil sitting in it is the
    // same lie there as on the public page.
    if (isTemplate(notePath)) continue;
    // Static pages (frontmatter `page: true`) are part of the site, not of
    // the feed. The caller decides — `excludePages` is false everywhere the
    // stock blog calls this, so its lists are exactly what they always were;
    // designed mode passes staticPagesActive() (server/pages.ts).
    if (excludePages && record.page) continue;
    out.push({ dateMs: record.dateMs, meta: postMeta(record, hidden, rows) });
  }
  return out
    .sort((a, b) => b.dateMs - a.dateMs || a.meta.path.localeCompare(b.meta.path))
    .map((entry) => entry.meta);
}

/** Published STATIC PAGES (frontmatter `page: true`), alphabetical by title —
 *  the list the navigation builder offers and the designed shell routes.
 *  `visitor` applies the languageFilter, exactly as posts() does, so a page
 *  the filter curates away is never named to an anonymous caller. */
export function pages(visitor: boolean, lang: FilterLang): PageMeta[] {
  const out: PageMeta[] = [];
  for (const notePath of publishedSet) {
    const record = notes.get(notePath);
    if (!record || !record.page) continue;
    if (visitor && languageHidden(record, lang)) continue;
    out.push({ path: record.path, title: record.title });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path));
}

/** Every ```tracker fence this session may see, newest-touched first.
 *
 *  The scope is posts()' scope, deliberately and line for line: a visitor gets
 *  the published set with the language filter applied, an admin gets the whole
 *  vault unfiltered, and TEMPLATES ARE OUT of both. That last one is not a
 *  detail — a template carrying a tracker skeleton would show up on the shelf
 *  as a book you are 0% through, in the admin's own list as much as the
 *  public one, which is the same lie posts() refuses to tell about a stencil.
 *
 *  The cover is resolved HERE, through the ladder embeds use, so the board
 *  spends no /api/resolve per card — and it is resolved against the SESSION's
 *  scope, so a visitor is never handed a path they would be 404'd for. */
/** What a work's `folder:` amounts to: how many notes are under it, the note
 *  that stands for the folder itself, and the note touched LAST under it (a
 *  one-element list: the wire shape stayed a list when the card went from
 *  three recent notes to one, so an older client still reads it). Counted
 *  over the live index, so a note added to the folder in Obsidian is on the
 *  card at the next read. */
function folderFacts(folder: string | null): Pick<TrackerMeta, "folder" | "folderNotes" | "folderNote" | "folderRecent"> {
  if (folder === null) return { folder: null, folderNotes: 0, folderNote: null, folderRecent: [] };
  const prefix = `${folder}/`;
  const base = folder.split("/").pop() ?? folder;
  let count = 0;
  let own: string | null = null;
  const recent: { path: string; title: string; mtimeMs: number }[] = [];
  for (const [p, record] of notes) {
    if (!p.startsWith(prefix)) continue;
    count++;
    if (p === `${prefix}${base}.md` || (own === null && p === `${prefix}index.md`)) own = p;
    recent.push({ path: p, title: record.title, mtimeMs: record.mtimeMs });
  }
  recent.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return { folder, folderNotes: count, folderNote: own, folderRecent: recent.slice(0, 1) };
}

export function trackers(visitor: boolean, lang: FilterLang): TrackerMeta[] {
  const out: TrackerMeta[] = [];
  const paths = visitor ? publishedSet : notes.keys();
  const isTemplate = templateMatcher(); // once for the loop — see templateMatcher()
  for (const notePath of paths) {
    const record = notes.get(notePath);
    if (!record || record.trackers.length === 0) continue;
    if (visitor && languageHidden(record, lang)) continue;
    if (isTemplate(notePath)) continue;
    let index = 0;
    for (const tracker of record.trackers) {
      out.push({
        path: record.path,
        index: index++,
        started: tracker.started,
        finished: tracker.finished,
        season: tracker.season,
        notes: tracker.notes,
        ...folderFacts(visitor ? null : tracker.folder),
        step: tracker.step,
        pace: tracker.pace,
        due: tracker.due,
        // A file name is a fact about the vault's layout, scrubbed for a
        // visitor as `folder` is; the sessions are the note's own lines and
        // travel with it.
        file: visitor ? null : tracker.file,
        sessions: tracker.sessions,
        title: tracker.title,
        noteTitle: record.title,
        kind: tracker.kind,
        icon: tracker.icon,
        percent: tracker.percent,
        done: tracker.done,
        total: tracker.total,
        unit: tracker.unit,
        status: tracker.status,
        rating: tracker.rating,
        cover: coverPath(tracker.cover, visitor, lang),
        updatedMs: record.mtimeMs,
      });
    }
  }
  return out.sort(
    (a, b) => b.updatedMs - a.updatedMs || a.path.localeCompare(b.path) || a.title.localeCompare(b.title),
  );
}

/** Every ```routine in the vault with its log, newest-touched first. Admin
 *  only by construction (the route asserts it): the page that reads this
 *  writes, and a visitor's card is drawn from the note they are reading.
 *  Templates are kept and MARKED rather than dropped — the page's form
 *  offers a template note's plan as a starting point. */
export function routines(): RoutineMeta[] {
  const out: RoutineMeta[] = [];
  const isTemplate = templateMatcher();
  for (const [notePath, record] of notes) {
    if (record.routines.length === 0) continue;
    const template = isTemplate(notePath);
    for (const block of record.routines) {
      out.push({
        path: record.path,
        index: block.index,
        noteTitle: record.title,
        plan: block.plan,
        entries: block.entries,
        template,
        updatedMs: record.mtimeMs,
      });
    }
  }
  return out.sort((a, b) => b.updatedMs - a.updatedMs || a.path.localeCompare(b.path) || a.index - b.index);
}
