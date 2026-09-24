// The folders the index detects by name: templates, the hadith corpus, tag
// pages. Moved out of server/indexer.ts, which keeps the store these read.

import { languageHidden, type FilterLang } from "./language.ts";
import type { HadithHit } from "../../shared/types.ts";
import { attachmentPaths, notes, oversized, publishedSet, type NoteRecord } from "../indexer.ts";
import { collectionLabel, splitHadith } from "../../shared/hadithRefs.ts";
import { hadithFolder, templatesFolder } from "../settings.ts";
import { props } from "./queries.ts";

// ----------------------------------------------------------------- templates

/** Folder basenames that MEAN "templates" without a reader having configured
 *  anything: Obsidian's own default, the underscore-prefixed convention, and
 *  the Arabic word an ar-language vault would use.
 *
 *  A LEADING ORDERING PREFIX IS NOT PART OF THE NAME. Real vaults number their
 *  top level — "4 - Templates", "04. Templates", "1_Templates" (Johnny.Decimal
 *  and PARA both do it, and the vault this was measured against is one of
 *  them) — and a matcher that misses those is a matcher that misses the case
 *  it exists for. The prefix is stripped, then the rest must match WHOLE:
 *  "Templates for clients" is a folder of notes about templates, not a folder
 *  of templates, and guessing it would hide real posts from the blog. */
const ORDERING_PREFIX = /^\s*\d+\s*[-._)]*\s*/;
const TEMPLATE_FOLDER_NAMES = /^_?templates?$|^قوالب$/i;

function looksLikeTemplatesFolder(name: string): boolean {
  return TEMPLATE_FOLDER_NAMES.test(name.replace(ORDERING_PREFIX, "").trim());
}

/** The vault's templates folder when it is UNAMBIGUOUS, else null.
 *
 *  Auto-detection exists so the feature works on an imported Obsidian vault
 *  with nothing configured; it must never GUESS. So: every folder holding an
 *  indexed file is a candidate by basename, and the answer is the single
 *  match — or, when several match, the single one at the vault root. Two
 *  plausible folders and no root-level tie-break means null, and the settings
 *  field says which one to pick. A wrong guess here would hide a folder of
 *  real posts from the blog and offer the reader the wrong list of templates,
 *  which is strictly worse than asking. */
/** The last answer, held until the index changes shape (invalidateDerived).
 *  A box rather than a bare string, so "no templates folder" (null) memoizes
 *  as firmly as a hit — the null answer is the common one, and it was the one
 *  paying for the whole walk on every call. */
let templatesFolderMemo: { value: string | null } | null = null;

export function detectTemplatesFolder(): string | null {
  // MEASURED: this walk is O(notes + attachments) and it was being run once
  // PER PUBLISHED POST by isTemplateNote() inside posts(), publicFolderCounts()
  // and trackers() — i.e. O(published × total) on the blog's home endpoint,
  // 854 ms on a 3k-note vault, and eight concurrent anonymous GETs were enough
  // to wedge a single-threaded server. The memo is half the fix; hoisting the
  // lookup out of those three loops (templateMatcher() below) is the other.
  if (templatesFolderMemo !== null) return templatesFolderMemo.value;
  const candidates = new Set<string>();
  const consider = (relPath: string): void => {
    const segments = relPath.split("/");
    // The file's own name is not a folder — stop one short.
    for (let i = 0; i < segments.length - 1; i++) {
      if (looksLikeTemplatesFolder(segments[i])) candidates.add(segments.slice(0, i + 1).join("/"));
    }
  };
  for (const notePath of notes.keys()) consider(notePath);
  for (const attPath of attachmentPaths) consider(attPath);
  const atRoot = [...candidates].filter((p) => !p.includes("/"));
  const value =
    candidates.size === 1 ? [...candidates][0] : atRoot.length === 1 ? atRoot[0] : null;
  templatesFolderMemo = { value };
  return value;
}

// ------------------------------------------------------------ hadith corpus

/** Folder basenames that MEAN "the hadith corpus lives here", on the
 *  templates matcher's terms (ordering prefix stripped, whole-name match):
 *  the English word and its plural, the Arabic singular, plural and the
 *  definite forms. `Corpus/hadith` — the layout the docs suggest — matches
 *  on its last segment, which is what the walk below tests. */
const HADITH_FOLDER_NAMES = /^_?(?:a?hadith|ahadeeth)$|^حديث$|^الحديث$|^أحاديث$|^الأحاديث$|^احاديث$/i;

function looksLikeHadithFolder(name: string): boolean {
  return HADITH_FOLDER_NAMES.test(name.replace(ORDERING_PREFIX, "").trim());
}

let hadithFolderMemo: { value: string | null } | null = null;

/** Drop the templates and hadith folder memos (invalidateDerived owns the call). */
export function dropFolderMemos(): void {
  templatesFolderMemo = null;
  hadithFolderMemo = null;
}

/** The vault's hadith corpus folder when it is UNAMBIGUOUS, else null — the
 *  `detectTemplatesFolder` rule, memoized the same way and dropped by the
 *  same `invalidateDerived()`, because a callout on a public page asks this
 *  on every render. Only folders that actually hold a corpus note count: a
 *  folder called "hadith" full of essays about hadith is not a corpus, and
 *  guessing it would answer every callout with "nothing here". */
export function detectHadithFolder(): string | null {
  if (hadithFolderMemo !== null) return hadithFolderMemo.value;
  const candidates = new Set<string>();
  for (const record of notes.values()) {
    if (record.hadithRef === null) continue;
    const segments = record.path.split("/");
    for (let i = 0; i < segments.length - 1; i++) {
      if (looksLikeHadithFolder(segments[i])) candidates.add(segments.slice(0, i + 1).join("/"));
    }
  }
  // A nested match ("Corpus/hadith") and its parent ("Corpus/hadith/Bukhari"
  // is not a candidate, but "1 - Hadith/Bukhari" and "1 - Hadith" could both
  // be) resolve to the SHORTEST, which contains the rest.
  let value: string | null = null;
  if (candidates.size > 0) {
    const sorted = [...candidates].sort((a, b) => a.length - b.length);
    const root = sorted[0];
    value = sorted.every((c) => c === root || c.startsWith(`${root}/`)) ? root : null;
  }
  hadithFolderMemo = { value };
  return value;
}

/** The corpus note that answers `key` (`bukhari#1`) for this session, or
 *  null. `visitor` scopes it exactly as `/api/note` scopes a read — published
 *  notes only, the language filter applied — so the path handed back is
 *  always one the caller may open, and an unpublished corpus is invisible
 *  rather than half-visible. Ties (two notes claiming the same hadith) go to
 *  the lexically first path, so the answer is stable across restarts. */
export function hadithLookup(key: string, visitor: boolean, lang: FilterLang): HadithHit | null {
  const folder = hadithFolder();
  if (folder === null) return null;
  const prefix = `${folder}/`;
  let best: NoteRecord | null = null;
  for (const record of notes.values()) {
    if (record.hadithRef !== key || !record.path.startsWith(prefix)) continue;
    if (visitor && (!publishedSet.has(record.path) || languageHidden(record, lang))) continue;
    if (oversized.has(record.path)) continue; // no body was read — nothing to show
    if (best === null || record.path < best.path) best = record;
  }
  if (best === null) return null;
  const props = best.props;
  const { chain, matn } = splitHadith(best.body, props.chain ?? props.isnad ?? null);
  const collection = key.slice(0, key.lastIndexOf("#"));
  const asWritten = props.collection ?? collection;
  return {
    path: best.path,
    title: best.title,
    collection,
    label: {
      en: collectionLabel(collection, "en", asWritten),
      ar: collectionLabel(collection, "ar", asWritten),
    },
    number: Number(key.slice(key.lastIndexOf("#") + 1)),
    chain,
    matn,
    grade: props.grade ?? props.الدرجة ?? null,
  };
}

// --------------------------------------------------------------- tag pages

/** Folder basenames that MEAN "the tag pages live here". Same shape and same
 *  ordering-prefix rule as the templates matcher above, and shared with it for
 *  the same reason the templates one exists: an imported Obsidian vault names
 *  this folder itself, and a feature that only works once the reader has found
 *  a settings field is a feature nobody finds.
 *
 *  THIS FOLDER IS THE HALF THAT WAS MISSING. Templates auto-detected from the
 *  first day; tag labels shipped with a hard `tags` default beside it, so on
 *  the vault both were measured against — whose folders are "4 - Templates"
 *  and "2 - Tags" — the picker found its templates and every Arabic tag chip
 *  silently rendered its canonical English tag. Two halves of one promise,
 *  disagreeing. */
const TAG_FOLDER_NAMES = /^_?tags?$|^وسوم$|^الوسوم$/i;

function looksLikeTagsFolder(name: string): boolean {
  return TAG_FOLDER_NAMES.test(name.replace(ORDERING_PREFIX, "").trim());
}

/** The vault's tag-pages folder when it is UNAMBIGUOUS, else null. The rule is
 *  `detectTemplatesFolder`'s, deliberately: single match wins, several match
 *  and the single ROOT-level one wins, otherwise null and the settings field
 *  says which. A wrong guess costs less here than it does for templates (a
 *  mislabelled chip, not a hidden post), but "never guess" is cheaper still
 *  and keeps one rule in the reader's head for both fields. */
export function detectTagsFolder(): string | null {
  const candidates = new Set<string>();
  for (const notePath of notes.keys()) {
    const segments = notePath.split("/");
    for (let i = 0; i < segments.length - 1; i++) {
      if (looksLikeTagsFolder(segments[i])) candidates.add(segments.slice(0, i + 1).join("/"));
    }
  }
  if (candidates.size === 1) return [...candidates][0];
  const atRoot = [...candidates].filter((p) => !p.includes("/"));
  return atRoot.length === 1 ? atRoot[0] : null;
}

/** True when `relPath` lives in the templates folder. A template is a stencil,
 *  not a post: it renders as literal `{{date}}` placeholders and duplicates
 *  every real article's structure, so it stays out of the blog's post list
 *  (and therefore out of RSS, the dashboard and the topic pages built from
 *  it) even when its frontmatter carries the `publish: true` it was written to
 *  hand DOWN to the notes made from it. */
export function isTemplateNote(relPath: string): boolean {
  return templateMatcher()(relPath);
}

/** The same question, asked once for a whole loop.
 *
 *  THE POINT IS THE HOIST. `isTemplateNote()` resolves the folder every time
 *  it is asked — settings read, path normalized, containment checked, and
 *  (before the memo above) the whole index walked — and three of this file's
 *  hot loops asked it once per published note. A list is one folder lookup and
 *  N string comparisons; anything else is the audit's 854 ms.
 *
 *  Resolved lazily, never at module-evaluation time: settings.ts imports this
 *  module (through site.ts), so the two are a cycle and only a RUNTIME call is
 *  safe in either direction. The merge rule — stored value over auto-detection
 *  — lives there and is not copied here. */
export function templateMatcher(): (relPath: string) => boolean {
  const folder = templatesFolder();
  if (folder === null) return () => false;
  const prefix = `${folder}/`;
  return (relPath) => relPath === folder || relPath.startsWith(prefix);
}
