
import { folderMetaOf, folderOfNote, type FolderMeta } from "../shared/folderNote.ts";
import { promises as fs } from "node:fs";
import path from "node:path";
import MiniSearch from "minisearch";
import type { VaultEvent } from "../shared/types.ts";
import { stripBidiControls } from "../shared/bidi.ts";
import { createdMs, forgetCreated, seedFromGit } from "./created.ts";
import { idStampMs } from "../shared/idStamp.ts";
import { foldTerm } from "../shared/fold.ts";
import { snippetOf } from "../shared/snippet.ts";
// The markdown→prose strip behind snippets, backlink context and excerpts.
// Moved to shared/ with the rest of the pure index (the phone's pocket server
// cuts snippets by the same rule; see shared/prose.ts).
import { isDrawingPath, isNotePath, isTexPath, noteTitleOf } from "../shared/noteFormat.ts";
import { drawingIndexText } from "../shared/drawing.ts";
import { markdownAnchors, type NoteAnchor } from "../shared/anchors.ts";
// The pure half of this file, which the pocket server on the phone
// (mobile/src/pocket/) reads the same vault with. Moved rather than copied:
// two spellings of "what does [[Folder/Note]] name" is a backlinks panel that
// loses rows on one of the two, silently.
import { linkKeys, parseAssets, parseFmDate, parseLinks, parseTags, scalarProps, splitFrontmatter, bannerOf, wikilinkRegex } from "../shared/noteParse.ts";
export { wikilinkRegex };
import { pageFlag } from "./pages.ts";
import { publishFlag, readFrontmatter } from "./publish.ts";
import { parseAliases, parseFace, parseFolders, parseTwin, readNoteFrontmatter } from "./noteFrontmatter.ts";
import { scanTrackers, type Tracker } from "../shared/tracker.ts";
import { scanRoutines, type RoutineBlock } from "../shared/routine.ts";
import { scanTasks, type Task } from "../shared/tasks.ts";
import { scanCards, type Card } from "../shared/cards.ts";
import { deckOf, type Deck } from "../shared/decks.ts";
import { readTexNote } from "./texNote.ts";
// Cyclic with this module (settings.ts → site.ts → here) and inert: every
// call below happens at request time, never while either module is loading.
import { hadithKeyOfFrontmatter } from "../shared/hadithRefs.ts";
import { listFolderFiles, listVaultFiles, onEvent, readNote, safeAbs } from "./vault.ts";
import { detectArabic } from "./indexer/language.ts";
import { dropAttachmentMemos } from "./indexer/publish.ts";
import { dropFolderMemos } from "./indexer/folders.ts";
import { dropTwinsMemo, resolveLink } from "./indexer/resolve.ts";
import { flatBody, labelsOfFm, props } from "./indexer/queries.ts";
export { isNoteVisibleToVisitor, publishedCensus, visibleUnder, publishedTopics } from "./indexer/language.ts";
export type { FilterLang, PublishedCensus } from "./indexer/language.ts";
export { resolveLink, aliasEntries, twinOf, twinSwapTable, twinPairs, twinFaceOf, resolveEmbed, noteAnchors, resolveLabel, resolveCitekey, resolveImageRef, resolveBannerRef, publishedBanner } from "./indexer/resolve.ts";
export type { TwinLink } from "./indexer/resolve.ts";
export { detectTemplatesFolder, detectHadithFolder, hadithLookup, detectTagsFolder, isTemplateNote } from "./indexer/folders.ts";
export { exportSelection, notesReferencing, notesLinkingTo, notesLinkedFrom, notesWithTag, isNotePublished, isAllowedAttachment, publishedNotes, visibleNotesUnder, publishedPaths, publishedCounts, listImageAttachments, unreferencedAttachments, registerAttachment, noteTitle } from "./indexer/publish.ts";
export type { ExportSelection } from "./indexer/publish.ts";
export { folderMeta, libraryRefs, collectionRows, tagPageCollections, publicFolderCounts, libraryLessons, posts, pages, trackers, routines } from "./indexer/posts.ts";
export { mentions, hasNote, linkSpellingFor, tasks, cards, decks, deckCards, onThisDay, timelineNotes, queryPaths, queryNotes, search, replaceCandidates, graph, backlinks, searchTerms, searchMatches, tags, props, tagPageLabels } from "./indexer/queries.ts";
export type { SearchOptions } from "./indexer/queries.ts";

export interface NoteRecord {
  path: string;
  title: string;
  body: string; // content minus frontmatter
  /** How many source lines the frontmatter block occupied (0 when none, and 0
   *  for `.tex`, whose `body` IS the full file). Every `lineIdx` in this
   *  record counts inside `body`, but the editor and the reading view count
   *  the FULL file — this offset is what lets the wire carry a line number a
   *  click can actually land on. */
  bodyStartLine: number;
  links: { target: string; line: string; lineIdx: number }[];
  /** Vault-relative destinations of STANDARD-markdown images — `![alt](Media/x.png)`
   *  — resolved against this note's own folder. `links` only ever holds
   *  `[[wikilink]]`/`![[embed]]` targets, so without this the publish
   *  allowlist could not see the other half of the syntax the renderer
   *  supports, and every markdown-embedded image in a published note 404'd
   *  to visitors while the admin saw it. Absolute URLs and anything that
   *  climbs out of the vault are dropped here, not later. */
  assets: string[];
  tags: string[];
  /** Frontmatter `labels:` — a TAG PAGE's own display names, `{ ar: برمجيات }`.
   *  Kept on every record rather than only on notes under the tags folder,
   *  because the folder is a runtime setting: gate the read on it and renaming
   *  `tags/` to `topics/` would need a full reindex to take effect. Null when
   *  the note has no such key, which is every note but a handful. Display
   *  only — nothing here ever changes what a tag IS. */
  labels: Record<string, string> | null;
  /** Frontmatter `folders:` — the PUBLIC FOLDER slugs this note claims
   *  membership of (shared/publicFolders.ts). Slugs only, already normalized;
   *  a slug no settings.json declares simply matches nothing, which is what
   *  lets an author write the frontmatter before making the folder. Empty for
   *  almost every note, and kept on every record rather than gated on the
   *  setting for the reason `labels` gives: the setting is edited at runtime,
   *  and a gate here would need a full reindex to take effect. */
  folders: string[];
  /** What this note says about ITS FOLDER when it is that folder's note
   *  (shared/folderNote.ts): a note named like the folder, or index.md
   *  inside it. Null for every other note. */
  folderMeta: FolderMeta | null;
  /** What this note says when it is a TAG PAGE declaring `collection: true`:
   *  the collection's mark, line, title, folder and hidden flag. Read only for
   *  notes under the tags folder; null everywhere else. */
  collectionMeta: FolderMeta | null;
  /** Every ```tracker fence in this note, parsed (shared/tracker.ts). Empty
   *  for almost every note.
   *
   *  Two things need it and neither can re-read the file: `trackers()` builds
   *  the board's list from it, and `allowedAttachments()` reads the COVER out
   *  of it. That second one is the whole reason it is a record field rather
   *  than something the route parses on demand — a cover name lives inside a
   *  code fence, which `parseLinks()` and `parseAssets()` both skip, so
   *  without this the art on a published shelf renders for the owner and
   *  404s for every visitor. */
  trackers: Tracker[];
  /** Frontmatter `collection:` + `number:` → the key a `> [!hadith]` callout
   *  looks this note up by (shared/hadithRefs.ts hadithKey), or null — which
   *  is every note but the corpus. Kept on every record rather than only
   *  under the hadith folder, for `labels`' reason: the folder is a runtime
   *  setting, and gating the read on it would need a full reindex to take
   *  effect. The folder is applied at lookup time (hadithLookup). */
  hadithRef: string | null;
  /** Every ```routine plan in this note with its log (shared/routine.ts) —
   *  the Sigils page's list. Empty for almost every note. */
  routines: RoutineBlock[];
  /** Every task line in this note (shared/tasks.ts), full-source lines. */
  tasks: Task[];
  /** Every card this note already holds (shared/cards.ts). */
  cards: Card[];
  /** The note as a deck when it carries a ```deck fence
   *  (shared/decks.ts) — its stars are `cards` with the fence's
   *  kind applied. Null for almost every note. */
  deck: Deck | null;
  /** File mtime in epoch ms — what the tracker board sorts by. `dateMs` below
   *  is the POST date (frontmatter first, birthtime second), which is when a
   *  thing was written; a shelf answers "what did I touch last". */
  mtimeMs: number;
  /** frontmatter `publish` is exactly true / "true" */
  published: boolean;
  /** frontmatter `page` is exactly true / "true" — a STATIC PAGE (About,
   *  Contact): still an ordinary note, but not an article. Read on every
   *  index so the flag is live; ACTED ON only in designed mode (see
   *  server/pages.ts), which is what keeps the stock blog unchanged. */
  page: boolean;
  /** frontmatter `banner:` raw value (https URL or vault-relative attachment
   *  path), trimmed; null when absent/non-string. */
  banner: string | null;
  /** Post date in epoch ms: frontmatter date/created/published (first that
   *  parses wins), else file birthtime (mtime where the fs has no birthtime). */
  dateMs: number;
  /** True when the body is predominantly Arabic script (Arabic-block
   *  codepoints ≥ 40% of the letter codepoints in its PROSE), false when it
   *  is predominantly something else, and null when the prose holds no
   *  letters at all — an image-only or numeric note has no language, so the
   *  filter leaves it alone rather than guessing. Computed once per
   *  (re)index: the languageFilter's per-note cache. */
  arabic: boolean | null;
  /** For a `.tex` note: the reader's prose, with every control sequence,
   *  math delimiter, label and citation key already gone. NULL for markdown,
   *  which derives the same thing lazily from `body` via stripMarkdown().
   *
   *  This one field is what makes a LaTeX note searchable by its WORDS. The
   *  raw source stays in `body` because backlink context and the editor both
   *  count in source LINES, and a prose string has none. */
  prose: string | null;
  /** Named places inside this note — markdown headings and LaTeX labels in one
   *  table, which is what lets `[[Note#anchor]]` and `\ref{Note#anchor}` be a
   *  single lookup regardless of the target's format. */
  anchors: NoteAnchor[];
  /** LaTeX's own cross-reference vocabulary: `\cite{key}` and the `\ref{key}`
   *  that found NO local `\label`. Kept apart from `links` because it resolves
   *  against different tables (byCitekey / byLabel) — and because a
   *  bibliography key is not a note name, so putting it through basename
   *  resolution would draw a broken edge for every reference in a paper. */
  xrefs: { kind: "cite" | "ref"; key: string; line: string; lineIdx: number }[];
  /** LaTeX only: the paragraph a post excerpt is cut from (the abstract when
   *  the paper has one). Extracted at parse time because finding it means
   *  walking the document TREE, not the source lines. */
  excerptSource: string | null;
  /** Bibliography keys this note ANSWERS to: `\bibitem{…}` values plus a
   *  frontmatter `citekey:`. A `\cite{knuth1997}` anywhere in the vault
   *  becomes an edge to the note carrying that key. */
  citekeys: string[];
  /** The OTHER names this note answers to — frontmatter `aliases:`, exactly as
   *  the author spelled them (see parseAliases). Kept on the record, not only
   *  in the lookup table, because three surfaces need the spelling back: search
   *  says WHICH alias matched, `[[` autocomplete offers them, and removeFile
   *  unregisters them. */
  aliases: string[];
  /** The OTHER FACE this note DECLARES — frontmatter `twin:`, unwrapped from
   *  its wikilink but not yet resolved (see `twinOf`, which resolves it and
   *  makes the relation symmetric). Null for almost every note. */
  twinRef: string | null;
  /** This face's own short label — frontmatter `face:`. What lets a pair of
   *  SAME-LANGUAGE faces ("short"/"long") say which is which; null for the
   *  ordinary bilingual pair, whose two languages say it already. */
  face: string | null;
  /** Scalar frontmatter as strings, keys lowercased, lists joined with
   *  ", " — what `prop:status=reading` tests and a ```query table shows.
   *  Kept on the record rather than re-read, like `labels` and `folders`. */
  props: Record<string, string>;
  /** Lazily computed prose-stripped body for snippets (null until first use).
   *  Records are replaced wholesale on reindex, so this never goes stale. */
  flat: string | null;
  /** Lazily computed blog-post fields (same lifecycle as `flat`). */
  post: { excerpt: string; words: number } | null;
}

export const notes = new Map<string, NoteRecord>();
export const byName = new Map<string, Set<string>>(); // lowercased basename -> paths
export const byPathLower = new Map<string, string>(); // lowercased vault-relative path -> path
// Frontmatter `aliases:` — lowercased alias -> paths. A SECOND name table, kept
// strictly behind the first: an Obsidian vault links a note by an alias as
// readily as by its filename, and without this every `[[ML]]` in the vault the
// README recruits rendered dashed and offered to create a duplicate note.
export const byAlias = new Map<string, Set<string>>();
// The two vault-wide LaTeX lookups, so an imported project lights up unmodified:
// a `\ref{sec:method}` that matches no label in its own document, and a
// `\cite{knuth1997}` whose key some note in the vault carries.
export const byLabel = new Map<string, Set<string>>();   // lowercased \label id -> paths
export const byCitekey = new Map<string, Set<string>>(); // lowercased citekey  -> paths

// ── The reverse link index ────────────────────────────────────────────────
//
// `backlinks()` answered "who points at this note?" by walking every note ×
// every link and calling resolveLink() on each one — 40,000 resolutions and
// 83 ms per note open on the 1,388-note fixture, paid again on every panel
// refresh. The graph audit named it beside the graph view itself.
//
// The way out is in resolveLink()'s own shape: it is a lookup in THREE tables
// — the path table, the basename table, the alias table — so the set of link
// keys that could possibly answer with a given note is finite and readable off
// that note alone (its path, its path minus the note extension, its basename,
// every alias it declares). Same for `\cite`/`\ref`, one table over: a note's
// citekeys and its non-heading labels. File every link under the key the
// resolver would reduce it to, and a backlink query becomes "union the sources
// filed under those keys, then verify each one with the real resolver".
//
// VERIFICATION STAYS, deliberately. The candidate set is a superset — a
// basename key can name three notes and only one of them wins pickShortest,
// and the visitor filter can move that winner — so every hit is still put
// through resolveLink() before it is reported. What disappears is the walk
// over the notes that were never candidates, not a single rule about which
// candidate is right. One resolver, one answer, no second implementation to
// drift.
export const linkSources = new Map<string, Set<string>>(); // link key -> notes carrying it
export const xrefSources = new Map<string, Set<string>>(); // \cite/\ref key -> notes carrying it

function fileUnder(map: Map<string, Set<string>>, key: string, notePath: string): void {
  if (!key) return;
  let set = map.get(key);
  if (!set) map.set(key, (set = new Set()));
  set.add(notePath);
}

function unfileFrom(map: Map<string, Set<string>>, key: string, notePath: string): void {
  const set = map.get(key);
  if (!set) return;
  set.delete(notePath);
  if (set.size === 0) map.delete(key);
}

// ── The graph revision ────────────────────────────────────────────────────
//
// `/api/graph` is the largest response the product makes (534 kB on the
// fixture, ~5 MB at 10k notes) and its memo used to be dropped by EVERY vault
// event and EVERY non-GET request — so during a sync storm each poll paid a
// full rebuild of an answer that had not changed. Most writes do not touch the
// graph at all: typing a paragraph changes no link, no tag, no name and no
// publish flag.
//
// So the index counts its own graph-shaped changes instead, and the memo is
// validated against the count rather than thrown away on rumour. See
// graphSignature() for exactly what "graph-shaped" means, and
// server/graphCache.ts for the read side.
let graphRev = 0;

/** How many graph-shaped changes the index has applied. Monotonic; the only
 *  promise is that it CHANGES whenever `graph()` would answer differently. */
export function graphRevision(): number {
  return graphRev;
}

// The same bargain, one shelf over. `tags()` and `props()` each walk EVERY
// note on EVERY request — the sidebar asks for both whenever the tree moves,
// and `props()` also splits and folds every frontmatter value it finds, which
// on the 2,376-note perf fixture measured 29 ms per request against a tree
// read's 1.5 ms. Nothing memoized either one.
//
// The graph revision cannot stand in for this: it deliberately ignores
// `props`, because a note whose `status:` changed draws the same graph and
// must not cost a rebuild of a 5 MB answer. So the shelves count their own
// changes, with their own signature.
let shelfRev = 0;

/** How many shelf-shaped changes the index has applied. Monotonic; the only
 *  promise is that it CHANGES whenever `tags()` or `props()` would answer
 *  differently. */
export function shelfRevision(): number {
  return shelfRev;
}

/** Everything about one note the tag and property shelves can see: which tags
 *  it carries, which frontmatter keys and values it carries, and the two flags
 *  that decide whether a visitor's shelf counts it at all. */
function shelfSignature(record: NoteRecord | undefined): string | null {
  if (record === undefined) return null;
  const props: string[] = [];
  for (const [key, value] of Object.entries(record.props)) props.push(`${key}=${value}`);
  props.sort();
  return [
    record.published ? "1" : "0",
    record.arabic === null ? "?" : record.arabic ? "ar" : "la",
    record.tags.join(","),
    props.join(SIG_SEP),
  ].join(SIG_FIELD);
}

/** Everything about one note that `graph()` — or the resolution tables it
 *  leans on — can see. Two records with the same signature contribute the same
 *  nodes, the same edges and the same resolution behaviour, so a reindex that
 *  produces one is invisible to the graph and must not cost a rebuild.
 *
 *  It covers more than the graph's own fields on purpose: aliases, labels and
 *  citekeys are how OTHER notes' links land here, and the note's own path and
 *  basename are its entry in the name table. Miss one of those and the memo
 *  survives a change it should not have survived — the one failure mode this
 *  whole mechanism must not have. */
function graphSignature(record: NoteRecord | undefined): string | null {
  if (record === undefined) return null;
  return [
    record.path,
    record.title,
    record.published ? "1" : "0",
    record.arabic === null ? "?" : record.arabic ? "ar" : "la",
    record.tags.join(","),
    record.aliases.join(","),
    record.citekeys.join(","),
    // A twin MERGES two nodes into one on the visitor graph and unions two
    // backlink panels, so a declaration appearing or moving changes the graph
    // — miss it here and the memo survives a change it should not have.
    record.twinRef ?? "",
    record.face ?? "",
    record.links.map((link) => link.target).join(SIG_SEP),
    record.xrefs.map((xref) => `${xref.kind}:${xref.key}`).join(SIG_SEP),
    // LABELS only — a heading slug is not in byLabel and no edge is ever drawn
    // from one, so renaming an H2 must not cost the whole vault a rebuild.
    labelAnchors(record).map((anchor) => anchor.id).join(SIG_SEP),
  ].join(SIG_FIELD);
}

/** Separators no filename, tag, alias, label or link target can contain, so no
 *  two different records can spell the same signature by accident. */
const SIG_SEP = "\u0000";
const SIG_FIELD = "\u0001";

/** The anchors that go into `byLabel` — a `\label{…}`, an equation, a figure.
 *  Heading and section slugs are NOT labels (`[[Note#Heading]]` resolves by the
 *  note, never by the anchor), and addKeys(), removeKeys() and the graph
 *  signature all have to agree on that or one of them registers a key another
 *  forgets. */
export function labelAnchors(record: NoteRecord): NoteAnchor[] {
  // A block id is a note-local address like a heading, never a vault-wide
  // \\ref label.
  return record.anchors.filter((a) => a.kind !== "heading" && a.kind !== "section" && a.kind !== "block");
}

// Publish state: the set of published note paths, plus (derived lazily) the
// set of attachment paths that published notes embed/link — the only files
// /api/file will serve to non-admin visitors.
export const publishedSet = new Set<string>();

/** How many times the index has changed under the Nearby corpus
 *  (server/nearby.ts): bumped in invalidateDerived, read by nearbySources. */
let nearbyRev = 0;

/** Every cache derived from the shape of the index goes stale together: any
 *  mutation that changes a note's links, a note's existence or an attachment's
 *  existence changes all of these answers, and resolution itself shifts as
 *  files come and go.
 *
 *  The templates memo joins them here rather than hanging off `onEvent` (where
 *  treeCache and graphCache hang) DELIBERATELY: `detectTemplatesFolder()` is a
 *  walk of the INDEX, not of the disk, and the index applies a vault event
 *  asynchronously. A memo dropped when the event fires would be refilled from
 *  the pre-event index by any request arriving in that window and would then
 *  stay wrong until the next vault change — the exact stale-memo trap
 *  graphCache.ts had to grow a `whenIndexed()` microtask for. These five call
 *  sites ARE the index's mutations, so a memo dropped here cannot be early. */
function invalidateDerived(): void {
  dropAttachmentMemos();
  dropTwinsMemo();
  dropFolderMemos();
  // The Nearby corpus (server/nearby.ts) weighs every note against the
  // vault's term frequencies, so one changed note moves every score a little
  // — its document frequencies are dropped here, at the index's own
  // mutations, for the reason the memos above are: a drop on the event would
  // be refilled from the pre-event index. Per-note term counts survive; they
  // are keyed by mtime and only the changed note re-tokenizes.
  nearbyRev++;
}

/** What server/nearby.ts reads: every indexed note as a title, a tag list
 *  and its prose — the same stripped, snippet-capped body search snippets
 *  are cut from (flatBody), computed once per record and read lazily so a
 *  vault whose owner never opens the panel never pays for it. */
export function nearbySources(): { rev: number; notes: NearbySource[] } {
  const out: NearbySource[] = [];
  for (const record of notes.values()) {
    out.push({
      path: record.path,
      title: record.title,
      mtimeMs: record.mtimeMs,
      tags: record.tags,
      prose: () => flatBody(record),
    });
  }
  return { rev: nearbyRev, notes: out };
}

export interface NearbySource {
  path: string;
  title: string;
  mtimeMs: number;
  tags: readonly string[];
  prose: () => string;
}

// Attachments (non-md files): known paths + lowercased basename (with
// extension) -> paths, so ![[image.png]] embeds resolve like wikilinks.
export const attachmentPaths = new Set<string>();
export const attachmentsByName = new Map<string, Set<string>>();
// Lowercased attachment path -> the real path. A banner (and any other
// path-form image reference) may be written with the casing the author's file
// manager showed them — "Media/Cover.PNG" for "media/cover.png" — and a vault
// that resolves basenames case-insensitively must not turn out to be
// case-SENSITIVE the moment the value carries a folder.
export const attachmentsByPathLower = new Map<string, string>();

/** Markdown larger than this gets a MINIMAL record instead of a full one: its
 *  body is never read, so it is absent from full-text search, the link graph,
 *  backlinks, tags and excerpts — but it is still a note, with its title,
 *  publish flag, banner and date, so it appears in the tree, in the post list,
 *  in RSS and on its own URL like any other.
 *
 *  It used to be dropped outright, and that was invisible data loss with the
 *  worst possible blast radius: `/api/note`'s visitor gate reads publishedSet,
 *  so a note the owner had marked `publish: true` answered 404 TO VISITORS
 *  while the admin's own request succeeded — the one failure mode nobody can
 *  see from inside the product. Nothing was logged, and the comment here
 *  claimed the opposite ("still readable via /api/note"). */
const MAX_INDEXED_MD_BYTES = 2 * 1024 * 1024;

/** How much of an oversized note is read for its frontmatter. Frontmatter is
 *  at the top by definition; 64 KB is a hundred times any real block. */
const OVERSIZED_HEAD_BYTES = 64 * 1024;

/** Paths currently held as minimal records — the boot summary counts them, and
 *  the set keeps the warning to one line per file rather than one per save. */
export const oversized = new Set<string>();

/** Bounded concurrency for boot-time indexing: avoids EMFILE on big vaults. */
const BOOT_CONCURRENCY = 64;

// `aliases` is a NAME field, so it is boosted like one — under the title (the
// filename is what the note is called) and over tags. A note findable by a
// `[[alias]]` and invisible to a search for the same word is a note whose
// aliases the reader cannot trust.
export const mini = new MiniSearch<{ path: string; title: string; body: string; tags: string; aliases: string }>({
  idField: "path",
  fields: ["title", "body", "tags", "aliases"],
  searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 6, aliases: 4, tags: 2 } },
  // DIACRITICS ARE NOT PART OF A WORD'S IDENTITY — Obsidian's eighth
  // most-requested feature of all time, and the one this vault's owner needs
  // most. minisearch's default `processTerm` lowercases and stops there, so a
  // note headed «الْمُقَدِّمَة» is filed under a term no reader will ever type;
  // «المقدمة» answers "no matches" and the search box looks broken. The fold
  // (shared/fold.ts) is applied HERE, which is the one place that fixes both
  // directions at once: minisearch runs `processTerm` over the terms it FILES
  // and over the terms it is ASKED for, so the plain spelling finds the pointed
  // note and the pointed spelling finds the plain one — with no second copy of
  // the query and no widening of the index.
  //
  // A term that folds away to nothing (a lone shadda a typist left behind) is
  // dropped rather than filed: `null` is minisearch's own "skip this token",
  // and an empty term in the index is a term every query matches.
  processTerm: (term) => foldTerm(term) || null,
  // THE SERVER USED TO DIE HERE, and it died in the most ordinary situation
  // this product has: two clients saving into one vault. Reproduced 5/5 with
  // two clients alternating precondition saves (~520 writes), always the same
  // way — an uncaught TypeError thrown from inside minisearch, out of a
  // promise nothing in this process owns, taking the whole server with it.
  //
  // Automatic vacuuming is an ASYNC BATCHED WALK of the term index
  // (`performVacuuming`: `for (const [term] of this._index) … await
  // setTimeout(batchWait)`), scheduled by `discard()` and running between
  // ticks. Every save calls removeFile() → `mini.discard` and then
  // `mini.add` — so a vacuum begun by one save is still walking the radix
  // tree when the next save mutates it, and an iterator over a tree that has
  // just had nodes spliced out from under it reads properties of undefined.
  // No amount of care at OUR call sites fixes that: the two halves are the
  // library's, and it hands us no way to await one of them.
  //
  // So the schedule becomes ours. `autoVacuum: false` means nothing ever
  // vacuums behind a mutation's back; `scheduleVacuum()` below runs one
  // explicitly, ON THE SAME `settled` CHAIN every index mutation now goes
  // through, which makes "a vacuum is running" and "a save is applying"
  // mutually exclusive states rather than a race. `mini.replace()` was the
  // other candidate fix and is not one: it is `discard()` + `add()` with our
  // own two lines moved inside the library, and it schedules the same vacuum.
  autoVacuum: false,
});

/** How long the index must be quiet before the deferred vacuum runs. Long
 *  enough that a burst of saves (or a `git pull`) is one vacuum rather than
 *  fifty; short enough that a working session never carries dirt for long. */
const VACUUM_IDLE_MS = 2_000;

/** Dirt below this is not worth a walk — minisearch's own default trigger. */
const VACUUM_MIN_DIRT = 20;

let vacuumTimer: NodeJS.Timeout | null = null;

/** What the term index is carrying. Diagnostics for the perf harness and for
 *  the test that proves the deferred vacuum actually runs — a vacuum nobody
 *  can observe is a vacuum that quietly stopped happening. */
export function indexStats(): { notes: number; dirt: number; vacuuming: boolean } {
  return { notes: notes.size, dirt: mini.dirtCount, vacuuming: mini.isVacuuming };
}

/** Book a vacuum for the next quiet moment, at most one at a time.
 *
 *  Deliberately NOT debounced-by-restart: under a sustained storm a restarting
 *  timer would never fire and the index would grow dirt forever. One timer per
 *  window, re-booked after it runs, so a long storm is vacuumed periodically
 *  and a quiet vault is vacuumed once. */
function scheduleVacuum(): void {
  if (vacuumTimer !== null || mini.dirtCount < VACUUM_MIN_DIRT) return;
  vacuumTimer = setTimeout(() => {
    vacuumTimer = null;
    // Enqueued, not called: the whole point is that no mutation runs while the
    // walk is in the air. batchWait 0 keeps the yields (other requests still
    // get served between batches) without the 10 ms sleep that made the
    // library's own vacuum take seconds on a real index.
    void enqueue(() => mini.vacuum({ batchSize: 4_000, batchWait: 0 }));
  }, VACUUM_IDLE_MS);
  // A pending vacuum must never be the reason a process refuses to exit.
  vacuumTimer.unref?.();
}

// ------------------------------------------------------------------ building

export async function initIndexer(): Promise<void> {
  // Before the first walk: the commit that added each note, when the vault
  // is a repository, so an old vault seeds true dates rather than the
  // birthtimes its edits left behind. Nothing when the ledger already exists.
  await seedFromGit();
  const t0 = performance.now();
  const { notes: noteFiles, attachments } = await listVaultFiles();
  for (const file of attachments) addAttachment(file);
  // Index with bounded concurrency: a 1.4k-note vault must not open 1.4k fds.
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < noteFiles.length) {
      const file = noteFiles[next++];
      // applyIndexFile, not indexFile: boot is the one moment nothing else can
      // be touching the index (serve() has not been called, no vacuum is
      // scheduled), so putting 1,388 files through the one-at-a-time chain
      // would only throw away the overlap the fd budget above exists to buy.
      await applyIndexFile(file);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(BOOT_CONCURRENCY, noteFiles.length) }, worker),
  );
  onEvent(handleEvent);
  // The oversized tail is named in the boot line, not just in the per-file
  // warnings above it: "3 by metadata only" is the number that explains why a
  // search comes back empty for text the operator can see on screen.
  const metaOnly = oversized.size > 0 ? `, ${oversized.size} by metadata only (over ${MAX_INDEXED_MD_BYTES / 1024 / 1024} MB)` : "";
  console.log(
    `  indexed ${notes.size} notes, ${attachmentPaths.size} attachments in ${Math.round(performance.now() - t0)}ms${metaOnly}`,
  );
}

/** Resolves once every watcher event emitted so far has been applied to the
 *  index. Callers that observe state both before and after an event (the SSE
 *  visitor filter) await this between the two reads. */
let settled: Promise<void> = Promise.resolve();

export function whenIndexed(): Promise<void> {
  return settled;
}

/** Put one unit of index work on the chain and hand back the promise for IT.
 *
 *  THE CHAIN IS NOW THE ONLY DOOR into the index's mutable state — watcher
 *  events, the routes' own eager reindexes, and the minisearch vacuum all
 *  queue here. That is what makes the vacuum safe (see `autoVacuum: false`
 *  above): two things that both mutate the term index can no longer be in
 *  flight at the same moment, whatever order the event loop wakes them in.
 *
 *  A task that throws is logged and swallowed, exactly as before: one bad file
 *  must not poison the chain for every event behind it. */
function enqueue(task: () => Promise<void>, describe = "task"): Promise<void> {
  const next = settled
    .then(task)
    .catch((err) => console.error(`indexer: ${describe} failed:`, err));
  settled = next;
  return next;
}

function handleEvent(event: VaultEvent): void {
  const isNote = isNotePath(event.path);
  const apply = async (): Promise<void> => {
    switch (event.kind) {
      case "created":
      case "changed":
        if (event.dir) break;
        if (isNote) await applyIndexFile(event.path);
        else addAttachment(event.path);
        break;
      case "deleted":
        if (event.dir) removeFolder(event.path);
        else if (isNote) removeFile(event.path);
        else removeAttachment(event.path);
        break;
      case "renamed":
        // A FOLDER move arrives as one `dir` event (vault.moveFolder), the
        // same shape a folder delete uses — the per-file storm is suppressed,
        // so this branch is the only thing that will ever tell the index that
        // 715 notes changed address. Without it the old records survived as
        // ghosts: search hit paths that 404'd, the graph drew edges into a
        // folder that no longer existed, and the moved notes were not indexed
        // at their new home at all.
        if (event.dir) {
          if (event.toPath) await reindexFolderMove(event.path, event.toPath);
          break;
        }
        // An ATTACHMENT renamed where it stands (vault.renameAttachment) is
        // an attachment at both ends: its basename index moves with it, or the
        // embeds rewritten to the new name would resolve to nothing.
        if (!isNote) {
          removeAttachment(event.path);
          if (event.toPath) addAttachment(event.toPath);
          break;
        }
        removeFile(event.path);
        if (event.toPath) await applyIndexFile(event.toPath);
        break;
      case "bulk":
        // Never reaches here: the aggregate coalescer (server/vault.ts) only
        // feeds the refetching subscribers, and the index is not one of them —
        // it gets every path, always. Stated so the switch is honest about the
        // kind existing on the type.
        break;
    }
  };
  // Chain on the previous apply so events land in order and whenIndexed()
  // always covers the newest event.
  void enqueue(apply, `apply ${event.kind} ${event.path}`);
}

/** Index (or reindex) one note immediately. Exported so API writes can update
 *  the index synchronously instead of waiting out the watcher debounce —
 *  otherwise a rename issued right after a save misses freshly written links.
 *
 *  "Immediately" now means "next on the chain", not "right now, on top of
 *  whatever else is halfway through". Two clients saving into one vault put
 *  two of these in flight at once — that is the ordinary case, not the exotic
 *  one — and interleaving them was how the term index got mutated underneath
 *  its own vacuum (see `autoVacuum: false`). Callers await it exactly as
 *  before and get a stronger guarantee: when this resolves, every index
 *  mutation queued before it has also landed. */
export function indexFile(relPath: string): Promise<void> {
  return enqueue(() => applyIndexFile(relPath), `index ${relPath}`);
}

/** True when a filesystem error means THE FILE IS NOT THERE, and only then.
 *
 *  Everything else — EMFILE under a `git pull`, EACCES on a file the owner
 *  chmodded, EIO on a flaky external disk, EBUSY on a Windows share — says the
 *  file could not be READ, which is a different fact and must lead somewhere
 *  different. `safeAbs()` throws a VaultError for a path outside the vault;
 *  that is not an errno and is not "absent" either. */
function isMissing(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/** A read that failed for a reason other than absence: say so, once, loudly.
 *
 *  The bug this replaces was silent and permanent. An untyped `catch` here
 *  called `removeFile()`, so ONE EMFILE — the ordinary consequence of a big
 *  `git pull` against a watcher — dropped that note out of search, out of the
 *  graph, out of backlinks and out of the tag counts, with nothing written
 *  anywhere and nothing to bring it back short of a restart. Keeping the
 *  previous record is strictly better: it is stale by however much the file
 *  changed, and the next event on that path fixes it.
 *
 *  THE DEFAULT IS "KEEP", and that is the deliberate half. A handful of
 *  refusals that are not errnos land here too — `safeAbs()` answers a 404 for
 *  a path it cannot resolve, which on an unreadable directory is the same
 *  EACCES wearing a different coat, and for a dangling symlink is a genuinely
 *  unservable note. Keeping a record for the second case costs a search hit
 *  that 404s when clicked; evicting for the first costs a note that vanishes
 *  from the whole product until a restart. Those are not close. */
function keepStale(relPath: string, err: unknown, what: string): void {
  const reason =
    (err as NodeJS.ErrnoException | null)?.code ??
    (err instanceof Error ? err.message : String(err));
  console.warn(
    `astrolabe: could not ${what} "${relPath}" (${reason}) — keeping the previous index entry; ` +
      "it will refresh on the next change to that file",
  );
}

async function applyIndexFile(relPath: string): Promise<void> {
  let stat;
  let abs;
  try {
    abs = safeAbs(relPath);
    stat = await fs.stat(abs);
  } catch (err) {
    if (!isMissing(err)) {
      keepStale(relPath, err, "stat");
      return;
    }
    removeFile(relPath);
    return;
  }
  // Oversized markdown: metadata only, body never read. Search degrades; the
  // note does not disappear. See MAX_INDEXED_MD_BYTES.
  if (stat.size > MAX_INDEXED_MD_BYTES) {
    await indexOversized(relPath, abs, stat);
    return;
  }
  let content: string;
  try {
    content = (await readNote(relPath)).content;
  } catch (err) {
    if (!isMissing(err)) {
      keepStale(relPath, err, "read");
      return;
    }
    removeFile(relPath); // vanished between the stat and the read
    return;
  }
  // Read BEFORE the record is torn down: the graph revision moves only if this
  // reindex changes something the graph can see, and that comparison needs the
  // old signature in hand. Typing a paragraph is the common case and it changes
  // none of it.
  const wasGraph = graphSignature(notes.get(relPath));
  const wasShelf = shelfSignature(notes.get(relPath));
  removeFile(relPath, true);
  // Display title: bidi controls out. A filename may legitimately be Arabic
  // or mixed-script, but an embedded RLO makes "invoice<U+202E>fdp.exe.md"
  // render as "invoiceexe.pdf" in the public post list, in RSS <title> and in
  // the og: tags third parties consume. The RESOLUTION key below keeps the raw
  // basename, so [[wikilinks]] written with the same characters still resolve.
  const rawTitle = noteTitleOf(relPath);
  const title = stripBidiControls(rawTitle);
  // ONE branch, at the one point where a note's TEXT is interpreted. Below it
  // every field is format-blind again: links are wikilink-shaped either way,
  // tags come from the same frontmatter text, and `prose` is what the search
  // index, the language detector and the excerpt builder all read.
  // A DRAWING IS INDEXED BY ITS WORDS. The file is a scene (JSON, or JSON in a
  // fence); what a reader can search for and what the graph can follow are
  // the text elements on the canvas and the [[links]] typed into them, so
  // that is the content the note record is built from — never the JSON,
  // which would put every element id into the search index.
  const indexed = isDrawingPath(relPath) ? drawingIndexText(relPath, content) : content;
  const parts = isTexPath(relPath)
    ? texParts(relPath, indexed)
    : markdownParts(relPath, indexed);
  const fm = parts.fm;
  const record: NoteRecord = {
    path: relPath,
    title,
    body: parts.body,
    bodyStartLine: parts.bodyStartLine,
    links: parts.links,
    xrefs: parts.xrefs,
    assets: parts.assets,
    tags: parseTags(parts.tagSource, parts.frontmatter),
    labels: labelsOfFm(fm),
    // `parts.fm` is already format-correct (readNoteFrontmatter's two branches
    // live in markdownParts/texParts), so a `.tex` note joins a public folder
    // from its `%---` comment block exactly as a markdown note does.
    folders: parseFolders(fm),
    folderMeta: folderOfNote(relPath) !== null ? folderMetaOf(fm) : null,
    collectionMeta: fm.collection === true ? folderMetaOf(fm) : null,
    // The fence walk is shared/fences.ts', so a ```tracker shown INSIDE a
    // ```markdown block is documentation, not a tracker — the same rule the
    // outline and the anchor table keep.
    trackers: scanTrackers(parts.body),
    hadithRef: hadithKeyOfFrontmatter(fm),
    routines: scanRoutines(parts.body),
    tasks: scanTasks(content),
    cards: scanCards(content),
    deck: deckOf(content, relPath, title),
    mtimeMs: stat.mtimeMs,
    published: publishFlag(fm),
    page: pageFlag(fm),
    banner: bannerOf(fm),
    dateMs:
      parseFmDate(fm.date) ??
      parseFmDate(fm.created) ??
      parseFmDate(fm.published) ??
      // A numeric `id` is the stamp the template minted when the note was
      // made (shared/idStamp.ts) — the creation time itself, and older than
      // anything the filesystem or the ledger can know.
      idStampMs(fm.id) ??
      // Not the birthtime itself: a save is a rename over the note and gives
      // it a new inode, so the birthtime is the last edit. The ledger keeps
      // the first one this instance saw (server/created.ts).
      createdMs(relPath, stat.birthtimeMs, stat.mtimeMs),
    arabic: detectArabic(parts.prose ?? parts.body),
    prose: parts.prose,
    anchors: parts.anchors,
    citekeys: parts.citekeys,
    aliases: parseAliases(fm),
    twinRef: parseTwin(fm),
    face: parseFace(fm),
    props: scalarProps(fm),
    excerptSource: parts.firstParagraph,
    flat: null,
    post: null,
  };
  oversized.delete(relPath); // it may have just shrunk back under the cap
  notes.set(relPath, record);
  addName(rawTitle, relPath);
  byPathLower.set(relPath.toLowerCase(), relPath);
  addKeys(record);
  if (record.published) publishedSet.add(relPath);
  invalidateDerived();
  if (graphSignature(record) !== wasGraph) graphRev++;
  if (shelfSignature(record) !== wasShelf) shelfRev++;
  // Tags are indexed too so "#tag" (and frontmatter-only tags) are findable.
  mini.add({
    path: relPath,
    title,
    // A `.tex` note is indexed on its PROSE. Feeding minisearch the raw source
    // would make every document match "begin", "textbf" and "usepackage" and
    // none of them match the sentence the reader remembers writing.
    body: record.prose ?? record.body,
    tags: record.tags.join(" "),
    aliases: record.aliases.join(" "),
  });
}

/** What indexFile() needs from a note's text, in one shape for both formats. */
interface NoteParts {
  /** Raw source minus frontmatter — LINE-indexed, because backlink context and
   *  the editor both count in source lines. */
  body: string;
  /** Lines the stripped frontmatter took with it — see NoteRecord. */
  bodyStartLine: number;
  /** Frontmatter TEXT (YAML), for parseTags(). */
  frontmatter: string;
  /** Where inline `#tags` are looked for. Markdown: the body. LaTeX: nowhere —
   *  `#` is a macro-parameter character there, so `#tag` in a `.tex` file is a
   *  compile error, not a tag. Frontmatter tags work in both. */
  tagSource: string;
  fm: Record<string, unknown>;
  links: NoteRecord["links"];
  xrefs: NoteRecord["xrefs"];
  assets: string[];
  prose: string | null;
  anchors: NoteAnchor[];
  citekeys: string[];
  /** LaTeX only: the abstract-or-first paragraph, already plain prose. */
  firstParagraph: string | null;
}

function markdownParts(relPath: string, content: string): NoteParts {
  const { body, frontmatter, bodyStartLine } = splitFrontmatter(content);
  const fm = readFrontmatter(content);
  return {
    body,
    bodyStartLine,
    frontmatter,
    tagSource: body,
    fm,
    links: parseLinks(body),
    xrefs: [],
    assets: parseAssets(body, relPath),
    prose: null,
    anchors: markdownAnchors(content),
    citekeys: citekeyOf(fm),
    firstParagraph: null,
  };
}

function texParts(relPath: string, content: string): NoteParts {
  const tex = readTexNote(relPath, content);
  return {
    body: content,
    bodyStartLine: 0, // a .tex body IS the full file; its lineIdx is already absolute
    frontmatter: tex.frontmatter,
    tagSource: "",
    fm: tex.fm,
    links: tex.links,
    xrefs: tex.xrefs,
    assets: tex.assets,
    prose: tex.prose,
    anchors: tex.anchors,
    citekeys: tex.citekeys,
    firstParagraph: tex.firstParagraph,
  };
}

/** A markdown note can claim a citation key too — `citekey: knuth1997` in its
 *  frontmatter — so a literature note written in markdown answers a `\cite`
 *  from a LaTeX paper. The vocabulary is LaTeX's; the notes need not be. */
function citekeyOf(fm: Record<string, unknown>): string[] {
  const value = fm.citekey;
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim());
  }
  return [];
}

/** Register a record's labels, citekeys and aliases in the vault-wide tables.
 *
 *  Aliases ride HERE, beside the other two, and not in their own call: every
 *  path that indexes a note calls addKeys() and every path that forgets one
 *  calls removeKeys(), so a table added to this pair cannot be the one a future
 *  incremental `indexFile()` leaves stale. A stale alias resolving to a deleted
 *  note is worse than no aliases at all. */
function addKeys(record: NoteRecord): void {
  for (const anchor of labelAnchors(record)) {
    let set = byLabel.get(anchor.id.toLowerCase());
    if (!set) byLabel.set(anchor.id.toLowerCase(), (set = new Set()));
    set.add(record.path);
  }
  for (const key of record.citekeys) {
    let set = byCitekey.get(key.toLowerCase());
    if (!set) byCitekey.set(key.toLowerCase(), (set = new Set()));
    set.add(record.path);
  }
  // Keyed on the alias EXACTLY as written (lowercased), the same bargain the
  // name table strikes with a raw basename: `title` is sanitized for display,
  // the resolution key is not, so a link written with the author's own
  // characters still resolves.
  for (const alias of record.aliases) {
    let set = byAlias.get(alias.toLowerCase());
    if (!set) byAlias.set(alias.toLowerCase(), (set = new Set()));
    set.add(record.path);
  }
  // …and the REVERSE direction, filed under the key the resolver will reduce
  // each target to. It rides here for the same reason aliases do: one pair of
  // functions owns every vault-wide table, so a table added later cannot be
  // the one an incremental reindex leaves pointing at a note that moved.
  for (const link of record.links) {
    const { key, asPath } = linkKeys(link.target);
    fileUnder(linkSources, key, record.path);
    if (asPath !== key) fileUnder(linkSources, asPath, record.path);
  }
  for (const xref of record.xrefs) fileUnder(xrefSources, xref.key.toLowerCase(), record.path);
}

function removeKeys(record: NoteRecord): void {
  const drop = (map: Map<string, Set<string>>, key: string): void => {
    const set = map.get(key.toLowerCase());
    if (!set) return;
    set.delete(record.path);
    if (set.size === 0) map.delete(key.toLowerCase());
  };
  for (const anchor of record.anchors) drop(byLabel, anchor.id);
  for (const key of record.citekeys) drop(byCitekey, key);
  for (const alias of record.aliases) drop(byAlias, alias);
  for (const link of record.links) {
    const { key, asPath } = linkKeys(link.target);
    unfileFrom(linkSources, key, record.path);
    if (asPath !== key) unfileFrom(linkSources, asPath, record.path);
  }
  for (const xref of record.xrefs) unfileFrom(xrefSources, xref.key.toLowerCase(), record.path);
}

/** A folder MOVED: drop every record under the old prefix, then index the
 *  subtree at its new home. Walks only what moved — `listVaultFiles()` would
 *  re-read all 1,388 notes of a real vault to learn what one drag did.
 *
 *  Awaited through the same `settled` chain every other event uses, so the
 *  route's `whenIndexed()` covers it and the `/api/tree` + `/api/graph` refetch
 *  the client fires on the 200 is already correct. */
export async function reindexFolderMove(fromRel: string, toRel: string): Promise<void> {
  removeFolder(fromRel);
  const { notes: moved, attachments } = await listFolderFiles(toRel);
  for (const file of attachments) addAttachment(file);
  // Already ON the chain (the event that called us is a chain task), so this
  // takes the un-enqueued form. Enqueuing from inside a chain task waits for a
  // promise that cannot resolve until we return: a deadlock, not a slowdown.
  for (const file of moved) await applyIndexFile(file);
}

/** Every note that a move of the subtree at `relFolder` could invalidate — the
 *  set the link rewrite has to walk, sampled BEFORE the move while the links
 *  still resolve.
 *
 *  Three kinds, in one pass over the index. Calling `backlinks()` once per moved
 *  note instead is O(notes²): on the 715-note folder of a real vault that is a
 *  million link resolutions for one drag.
 *   - notes INSIDE the folder: they travel, so every relative destination they
 *     carry has to be re-expressed from the new address;
 *   - notes whose `[[wikilinks]]` resolve to a note inside it (path-form links
 *     dangle; basename links do not, and the rewriter leaves them alone);
 *   - notes whose markdown embeds point at any file inside it — the case that
 *     breaks when a `Media/` folder is dragged and every `![](Media/x.png)` in
 *     the vault stops resolving, for the admin and for every visitor. */
export function notesAffectedByFolderMove(relFolder: string): string[] {
  const prefix = `${relFolder}/`;
  const out = new Set<string>();
  for (const record of notes.values()) {
    if (record.path.startsWith(prefix)) {
      out.add(record.path);
      continue;
    }
    if (record.assets.some((asset) => asset.startsWith(prefix))) {
      out.add(record.path);
      continue;
    }
    for (const link of record.links) {
      if (!link.target.includes("/") && !link.target.includes("\\")) continue; // basename form survives
      const hit = resolveLink(link.target, false, null);
      if (hit !== null && hit.startsWith(prefix)) {
        out.add(record.path);
        break;
      }
    }
  }
  return [...out].sort();
}

/** Index a whole subtree that just APPEARED — a folder restored out of
 *  `.trash/`. The watcher will notice it too, but only after its debounce,
 *  and the restore route answers immediately: without this the tree refetch
 *  that follows a restore showed the folder while search, the graph and the
 *  publish count still thought it was gone. Symmetric with `removeFolder()`,
 *  which is what the delete side does. */
export function indexUnder(relFolder: string): Promise<void> {
  // ONE chain task for the whole subtree — not one per file. A restore is a
  // single logical mutation, and slicing it into hundreds of queue entries
  // would let a save land in the middle of a half-restored folder.
  return enqueue(async () => {
    const { notes: noteFiles, attachments } = await listVaultFiles(relFolder);
    for (const file of attachments) addAttachment(file);
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < noteFiles.length) await applyIndexFile(noteFiles[next++]);
    };
    await Promise.all(
      Array.from({ length: Math.min(BOOT_CONCURRENCY, noteFiles.length) }, worker),
    );
  }, `index under ${relFolder}`);
}

/** The first `bytes` of a file as UTF-8, without reading the rest of it. */
async function readHead(abs: string, bytes: number): Promise<string> {
  const handle = await fs.open(abs, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

/** Metadata-only record for a note past MAX_INDEXED_MD_BYTES: title, publish
 *  flag, banner, date and frontmatter tags, read from the file's HEAD. No
 *  body, so no minisearch entry, no links, no assets, no excerpt — everything
 *  else about the note behaves normally, including publication. */
async function indexOversized(relPath: string, abs: string, stat: { size: number; birthtimeMs: number; mtimeMs: number }): Promise<void> {
  const known = oversized.has(relPath); // sampled before removeFile() clears it
  let head: string;
  try {
    head = await readHead(abs, OVERSIZED_HEAD_BYTES);
  } catch (err) {
    // Same rule as applyIndexFile's two reads: absence removes, anything else
    // keeps what we had and says why.
    if (!isMissing(err)) {
      keepStale(relPath, err, "read the head of");
      return;
    }
    removeFile(relPath);
    return;
  }
  const wasGraph = graphSignature(notes.get(relPath)); // see applyIndexFile
  const wasShelf = shelfSignature(notes.get(relPath));
  removeFile(relPath, true);
  const rawTitle = noteTitleOf(relPath);
  // The head is enough for frontmatter in BOTH formats: a `%--- … %---%` block
  // opens on line 1 exactly as a `---` block does.
  const frontmatter = isTexPath(relPath)
    ? readTexNote(relPath, head).frontmatter
    : splitFrontmatter(head).frontmatter;
  const fm = readNoteFrontmatter(relPath, head);
  const record: NoteRecord = {
    path: relPath,
    title: stripBidiControls(rawTitle),
    body: "",
    bodyStartLine: 0,
    links: [],
    xrefs: [],
    assets: [],
    prose: null,
    anchors: [],
    citekeys: citekeyOf(fm),
    // The head carried the whole frontmatter block, so an oversized note
    // answers to its aliases exactly as it answers to its title.
    aliases: parseAliases(fm),
    twinRef: parseTwin(fm),
    face: parseFace(fm),
    excerptSource: null,
    tags: parseTags("", frontmatter),
    labels: labelsOfFm(fm),
    // The head carried the whole frontmatter block (readNoteFrontmatter above
    // read BOTH formats out of it), so an oversized note is a member of its
    // folders exactly as a normal one is.
    folders: parseFolders(fm),
    folderMeta: folderOfNote(relPath) !== null ? folderMetaOf(fm) : null,
    collectionMeta: fm.collection === true ? folderMetaOf(fm) : null,
    // No body was read at all (metadata-only), so this note contributes no
    // trackers and no tracker covers — the same silence it keeps about links
    // and assets, and for the same reason.
    trackers: [],
    // The head carried the frontmatter, so an oversized corpus note still
    // files under its key — though with no body read, a lookup that lands on
    // it has no text to show and answers as if it were not there.
    hadithRef: hadithKeyOfFrontmatter(fm),
    routines: [],
    tasks: [],
    cards: [],
    deck: null,
    props: {},
    mtimeMs: stat.mtimeMs,
    published: publishFlag(fm),
    page: pageFlag(fm),
    banner: bannerOf(fm),
    dateMs:
      parseFmDate(fm.date) ??
      parseFmDate(fm.created) ??
      parseFmDate(fm.published) ??
      // A numeric `id` is the stamp the template minted when the note was
      // made (shared/idStamp.ts) — the creation time itself, and older than
      // anything the filesystem or the ledger can know.
      idStampMs(fm.id) ??
      // Not the birthtime itself: a save is a rename over the note and gives
      // it a new inode, so the birthtime is the last edit. The ledger keeps
      // the first one this instance saw (server/created.ts).
      createdMs(relPath, stat.birthtimeMs, stat.mtimeMs),
    // No body was read, so there is no prose to judge: "no language", which
    // languageHidden() leaves alone on both an ar and an en site.
    arabic: null,
    flat: null,
    post: null,
  };
  notes.set(relPath, record);
  addName(rawTitle, relPath);
  byPathLower.set(relPath.toLowerCase(), relPath);
  addKeys(record);
  if (record.published) publishedSet.add(relPath);
  invalidateDerived();
  if (graphSignature(record) !== wasGraph) graphRev++;
  if (shelfSignature(record) !== wasShelf) shelfRev++;
  // Say it out loud, once per file: a silently unsearchable note is exactly
  // the kind of state this product must never keep to itself.
  oversized.add(relPath);
  if (!known) {
    console.warn(
      `astrolabe: "${relPath}" is ${Math.round(stat.size / 1024 / 1024)} MB (cap ${MAX_INDEXED_MD_BYTES / 1024 / 1024} MB) — ` +
        "indexed by metadata only: it stays readable, publishable and listed, but its text is not searchable and its links are not in the graph",
    );
  }
}

/** Forget one note.
 *
 *  `reindexing` says the caller is about to put a record straight back at this
 *  path and will move the graph and shelf revisions itself, by comparing the
 *  old signatures with the new ones. Every OTHER caller is a real deletion,
 *  and a deletion always changes both. */
function removeFile(relPath: string, reindexing = false): void {
  const record = notes.get(relPath);
  if (!record) return;
  if (!reindexing) graphRev++;
  if (!reindexing) shelfRev++;
  if (!reindexing) forgetCreated(relPath);
  notes.delete(relPath);
  oversized.delete(relPath);
  removeKeys(record);
  // The resolution key is the RAW basename (record.title is the sanitized
  // display title) — addName registered it, removeName must unregister it.
  removeName(noteTitleOf(relPath), relPath);
  if (byPathLower.get(relPath.toLowerCase()) === relPath) byPathLower.delete(relPath.toLowerCase());
  publishedSet.delete(relPath);
  invalidateDerived();
  if (mini.has(relPath)) {
    mini.discard(relPath);
    // The dirt this leaves is cleaned on OUR schedule now, never behind a
    // save's back — see `autoVacuum: false`.
    scheduleVacuum();
  }
}

function removeFolder(relFolder: string): void {
  const prefix = `${relFolder}/`;
  for (const notePath of [...notes.keys()]) {
    if (notePath.startsWith(prefix)) removeFile(notePath);
  }
  for (const attPath of [...attachmentPaths]) {
    if (attPath.startsWith(prefix)) removeAttachment(attPath);
  }
}

export function addAttachment(relPath: string): void {
  if (attachmentPaths.has(relPath)) return;
  attachmentPaths.add(relPath);
  invalidateDerived();
  const key = path.posix.basename(relPath).toLowerCase();
  let set = attachmentsByName.get(key);
  if (!set) attachmentsByName.set(key, (set = new Set()));
  set.add(relPath);
  attachmentsByPathLower.set(relPath.toLowerCase(), relPath);
}

function removeAttachment(relPath: string): void {
  if (!attachmentPaths.delete(relPath)) return;
  invalidateDerived();
  const key = path.posix.basename(relPath).toLowerCase();
  const set = attachmentsByName.get(key);
  if (attachmentsByPathLower.get(relPath.toLowerCase()) === relPath) {
    attachmentsByPathLower.delete(relPath.toLowerCase());
  }
  if (!set) return;
  set.delete(relPath);
  if (set.size === 0) attachmentsByName.delete(key);
}

function addName(title: string, relPath: string): void {
  const key = title.toLowerCase();
  let set = byName.get(key);
  if (!set) byName.set(key, (set = new Set()));
  set.add(relPath);
}

function removeName(title: string, relPath: string): void {
  const key = title.toLowerCase();
  const set = byName.get(key);
  if (!set) return;
  set.delete(relPath);
  if (set.size === 0) byName.delete(key);
}

// The window, the escape and the `<mark>` pass live in shared/snippet.ts now,
// shared with the page store (server/pdfText.ts): a book page's snippet must
// be cut by the rule a note's is, because the client draws both with one
// renderer.
export function makeSnippet(record: NoteRecord, terms: string[]): string {
  return snippetOf(flatBody(record), terms);
}
