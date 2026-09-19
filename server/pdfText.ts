// THE PAGE STORE: the text of every book on the shelf, so the sidebar's one
// search box can answer from a PDF as readily as from a note.
//
// Until now the box saw notes only, and a book could be searched only from
// inside it, one volume at a time (`/` in the reader). For a vault whose
// argument is "my reading and my notes about it in one place", that is half
// the promise: the reader remembers a sentence, does not remember which of
// forty books it is in, and the box says "no results". This module reads
// every PDF the shelf knows ONCE, page by page, and keeps the text in
// ASTROLABE_DATA/pdftext.json; `searchPages()` then answers a query with
// `{ kind: "book", path, page, snippet }` rows beside the note hits.
//
// KEYED BY THE BOOK'S BYTES, exactly as server/books.ts keys a reading
// position: `bookKey()` — the same sha256 sample — so a book that is renamed
// or re-filed keeps its text without a second read, and a book that is
// re-saved (an OCR pass, which is the one edit that CHANGES the text) is read
// again under its new key. Where each key's bytes live right now is an
// in-memory table rebuilt from the shelf walk and kept current by the vault
// watcher, so a search never lists a page of a book that is no longer there.
//
// THE STORE IS OUR BOOKKEEPING AND LIVES WITH THE REST OF IT — the argument
// in server/books.ts holds here word for word: a sidecar beside every PDF is
// litter in a directory the owner syncs, and the vault stays as clean as they
// left it. Same file shape (`version: 1`, mtime-cached reads that never throw,
// write-then-rename at 0o600), with one departure: after its own write this
// module keeps the parsed store instead of dropping the cache, because
// re-parsing forty megabytes after every book would be most of the boot.
//
// EXTRACTION IS IN THE BACKGROUND, BOUNDED, AND NEVER RETRIED IN A LOOP. It
// starts after the note index is built (server/index.ts), runs two books at a
// time, yields between pages, and stops the moment the setting is turned off.
// Every axis is capped by name in shared/pdfText.ts — pages per book, text per
// page, text per book, the store as a whole, bytes per file — because a vault
// is a directory and a directory can be a scan dump. A book pdf.js cannot open
// (damaged, encrypted, too large) is recorded under its key with the reason,
// so a boot is not a fresh attempt at the same failure; only new bytes earn a
// new try.
//
// THE FOLD IS THE NOTE INDEX'S FOLD. A page is stored as pdf.js hands it
// over (whitespace collapsed, control characters out) and matched through
// `foldTerm` on both sides, which is the same function minisearch's
// `processTerm` applies to every note — «المقدمة» finds a pointed
// «الْمُقَدِّمَة» on a page for the same reason it finds one in a note, and a
// snippet is cut and `<mark>`ed by server/snippet.ts, the code the note hits
// use. Two fold tables that disagreed would be a search that finds a word in
// a note and not in the book the note quotes it from.
//
// PDF.JS UNDER NODE. The client reaches the engine through exactly one door
// (client/books/pdfjs.ts, held by `npm run check-books`) because a static
// import there is a megabyte in the first paint. That concern is the
// browser's; here the engine is the same package's `legacy` build, reached
// with a dynamic import so a vault with no PDFs never loads it, running on
// the main thread with no worker (Node has none to give it) and yielding to
// the event loop between pages.

import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isBookKey } from "../shared/bookAnchor.ts";
import { foldTerm } from "../shared/fold.ts";
import {
  cleanBookTitle,
  cleanPageText,
  cleanPdfTextEntry,
  cleanPdfTextFailure,
  entryChars,
  PDFTEXT_BOOK_CHARS_MAX,
  PDFTEXT_FILE_BYTES_MAX,
  PDFTEXT_PAGE_CHARS_MAX,
  PDFTEXT_PAGES_MAX,
  PDFTEXT_STORE_BOOKS_MAX,
  PDFTEXT_STORE_CHARS_MAX,
  type PdfTextEntry,
  type PdfTextFailure,
} from "../shared/pdfText.ts";
import { parseSearchQuery, searchScope } from "../shared/searchQuery.ts";
import type { SearchHit, VaultEvent } from "../shared/types.ts";
import { bookKey, isPdfPath, listBooks } from "./books.ts";
import { getSettings } from "./settings.ts";
import { dataDir } from "./site.ts";
import { escapeHtml, snippetOf } from "./snippet.ts";
import { normalizeRel, onEvent, safeAbs, VaultError } from "./vault.ts";

const PDFTEXT_FILE = "pdftext.json";

/** Books read at once. Two keeps a spinning disk and one core busy without
 *  the main thread — which is also the thread serving every request — being
 *  handed four content streams to parse between two ticks. */
const EXTRACT_CONCURRENCY = 2;

/** How long the store waits after a book lands before writing. A shelf walk
 *  extracts a book every few seconds; one write per book would rewrite a
 *  growing file a few hundred times, so writes coalesce and the last one is
 *  forced when the pass ends. */
const PERSIST_IDLE_MS = 1_500;

/** How long a burst of watcher events settles before the queue is worked. A
 *  PDF arriving over Syncthing is a dozen `changed` events; the last one is
 *  the one with the whole file behind it. */
const EVENT_SETTLE_MS = 2_000;

/** Book rows in a mixed answer, and in a `in:books` answer. Twenty pages
 *  beside up to thirty notes is a sidebar; fifty on their own is the same cap
 *  a note search has. */
export const BOOK_HITS_MAX = 20;
export const BOOK_HITS_SCOPED_MAX = 50;
/** Pages of ONE book in an answer. A term on three hundred pages of one
 *  volume must not push every other book off the list. */
export const BOOK_HITS_PER_BOOK = 5;

/** Characters of a page's opening shown when nothing was matched — a bare
 *  `in:books` lists the shelf, and a row needs something under its title. */
const OPENING_CHARS = 160;

// ── The setting ────────────────────────────────────────────────────────────

let envOn = true;

/** Read PDF_SEARCH from the environment. Call once at startup. ON unless the
 *  variable says off — a feature that has to be discovered in a .env file is
 *  a feature most owners never get. */
export function initPdfText(env: NodeJS.ProcessEnv = process.env): void {
  envOn = !/^(off|false|0|no)$/i.test(env.PDF_SEARCH?.trim() ?? "");
}

/** PDF_SEARCH alone — what the settings row's "Inherit" lands on. */
export function envPdfSearch(): boolean {
  return envOn;
}

/** Live merge: settings.pdfSearch when set, else PDF_SEARCH. Read on every
 *  search and between every two pages of an extraction, so turning the row
 *  off stops the work rather than merely hiding its results. */
export function pdfSearchEnabled(): boolean {
  return getSettings().pdfSearch ?? envOn;
}

// ── The store ──────────────────────────────────────────────────────────────

interface StoreFile {
  version: 1;
  /** Page text by content key. */
  texts: Record<string, PdfTextEntry>;
  /** Books that could not be read, by content key, so a boot does not try
   *  the same damaged file again. A sibling of `texts` rather than a variant
   *  of it: an entry is either text or a reason, and a record that could be
   *  both is a record one of the two readers gets wrong. */
  failures: Record<string, PdfTextFailure>;
}

function emptyStore(): StoreFile {
  return { version: 1, texts: {}, failures: {} };
}

let cache: { store: StoreFile; mtimeMs: number } | null = null;

function storePath(): string {
  return path.join(dataDir(), PDFTEXT_FILE);
}

/** mtime-checked like books.json, and a read NEVER throws: a corrupt store
 *  costs a re-extraction, and losing that must not also cost the search. */
function readStore(): StoreFile {
  const file = storePath();
  let mtimeMs = -1;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    // No file yet. The store being filled by the first pass lives in the
    // cache under mtime -1 until its first write; minting a fresh empty one
    // per read here (which books.json can afford, since every change there
    // is persisted at once) would hand `persist()` an empty object and throw
    // the pass away.
    if (cache === null || cache.mtimeMs !== mtimeMs) cache = { store: emptyStore(), mtimeMs };
    return cache.store;
  }
  if (cache && cache.mtimeMs === mtimeMs) return cache.store;
  const store = emptyStore();
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    const texts = (parsed as { texts?: unknown })?.texts;
    if (typeof texts === "object" && texts !== null && !Array.isArray(texts)) {
      for (const [key, value] of Object.entries(texts as Record<string, unknown>)) {
        // A key that is not a digest is not ours — dropped, as books.json
        // drops it, because the file is a map from OUR key space.
        if (!isBookKey(key)) continue;
        const entry = cleanPdfTextEntry(value);
        if (entry !== null) store.texts[key] = entry;
      }
    }
    const failures = (parsed as { failures?: unknown })?.failures;
    if (typeof failures === "object" && failures !== null && !Array.isArray(failures)) {
      for (const [key, value] of Object.entries(failures as Record<string, unknown>)) {
        if (!isBookKey(key)) continue;
        const failure = cleanPdfTextFailure(value);
        if (failure !== null) store.failures[key] = failure;
      }
    }
  } catch (err) {
    console.warn("astrolabe: pdftext.json unreadable — book text will be extracted again:", err);
  }
  cache = { store, mtimeMs };
  return store;
}

function persist(store: StoreFile): void {
  const file = storePath();
  mkdirSync(path.dirname(file), { recursive: true });
  // Write-then-rename, same as books.json: a crash mid-write must not leave a
  // torn file that the next boot reads as "no books", then spends ten minutes
  // re-reading the shelf to rebuild.
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(store), { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, file);
  chmodSync(file, 0o600);
  // Keep what was just written rather than dropping the cache: the file is
  // tens of megabytes and this process is the only writer during a pass. The
  // mtime check above still picks up a restore or a hand edit from outside.
  let mtimeMs = -1;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    // The rename just succeeded; a stat that fails now is a filesystem in
    // trouble, and the next read will simply re-parse.
  }
  cache = { store, mtimeMs };
}

/** How much text the store holds — the STORE_CHARS_MAX ledger, kept beside
 *  the store rather than recounted per book, and recounted when the store
 *  object itself is a new one (a reload from disk). */
let storeChars = -1;
let countedFor: StoreFile | null = null;

function countStoreChars(store: StoreFile): number {
  if (countedFor !== store || storeChars < 0) {
    storeChars = 0;
    for (const entry of Object.values(store.texts)) storeChars += entryChars(entry);
  foldInBackground(store);
    countedFor = store;
  }
  return storeChars;
}

// ── Where each book is now ─────────────────────────────────────────────────

/** content key → the vault path those bytes were last seen at. Built by the
 *  shelf walk, kept current by the watcher; the search iterates THIS, not the
 *  store, so a book that has left the vault leaves the results with it even
 *  though its text is kept for its return. */
const pathByKey = new Map<string, string>();

/** The folded pages of an entry, built on first search and dropped with the
 *  entry (a WeakMap: a store reloaded from disk is new objects). Folding at
 *  search time per query would walk forty million code points; folding once
 *  and testing with `includes` is the difference between a search that
 *  answers as you type and one that does not. */
const foldedPages = new WeakMap<PdfTextEntry, string[]>();

function foldedOf(entry: PdfTextEntry): string[] {
  let folded = foldedPages.get(entry);
  if (folded === undefined) {
    folded = entry.pages.map((page) => foldTerm(page));
    foldedPages.set(entry, folded);
  }
  return folded;
}

function forgetPath(rel: string): void {
  for (const [key, at] of pathByKey) {
    if (at === rel) pathByKey.delete(key);
  }
}

// ── Extraction ─────────────────────────────────────────────────────────────

type Engine = typeof import("pdfjs-dist");

let engine: Promise<Engine> | null = null;

/** The engine, loaded on first use and never for a vault without a PDF. The
 *  `legacy` build is the one pdf.js ships for Node. */
function loadEngine(): Promise<Engine> {
  engine ??= import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<Engine>;
  return engine;
}

/** What one extraction produced: an entry, a reason, or `null` when the
 *  work was abandoned (the setting went off mid-book) and nothing should be
 *  recorded. */
type Outcome = { entry: PdfTextEntry } | { failure: PdfTextFailure } | null;

async function extractOne(rel: string): Promise<Outcome> {
  const abs = safeAbs(rel);
  const size = statSync(abs).size;
  if (size > PDFTEXT_FILE_BYTES_MAX) return { failure: { reason: "tooLarge", at: Date.now() } };
  const pdfjs = await loadEngine();
  const data = new Uint8Array(await readFile(abs));
  const task = pdfjs.getDocument({
    data,
    // No fonts are drawn and nothing is fetched: the engine is here to read
    // content streams and nothing else.
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  try {
    let doc: Awaited<typeof task.promise>;
    try {
      doc = await task.promise;
    } catch (err) {
      const name = (err as { name?: unknown } | null)?.name;
      return { failure: { reason: name === "PasswordException" ? "encrypted" : "parse", at: Date.now() } };
    }
    let title = "";
    try {
      const meta = await doc.getMetadata();
      title = cleanBookTitle((meta.info as { Title?: unknown } | undefined)?.Title);
    } catch {
      // A book with unreadable metadata is still a book with pages.
    }
    const pageCount = doc.numPages;
    const pages: string[] = [];
    let chars = 0;
    let truncated = pageCount > PDFTEXT_PAGES_MAX;
    const last = Math.min(pageCount, PDFTEXT_PAGES_MAX);
    for (let p = 1; p <= last; p++) {
      // The one place the setting is re-read mid-work: a reader who turned
      // the row off is owed a server that stops, not one that finishes the
      // atlas first.
      if (!pdfSearchEnabled()) return null;
      let text = "";
      try {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        // Items joined as pdf.js's own text layer joins them: `hasEOL` is a
        // line break, everything else runs on. Whitespace collapses in
        // cleanPageText, so the break only matters as a word boundary.
        for (const item of content.items) {
          if ("str" in item) text += item.hasEOL ? `${item.str}\n` : item.str;
        }
        page.cleanup();
      } catch {
        // One page pdf.js cannot read (a broken content stream) keeps its
        // slot empty so every page after it still has the right number.
      }
      const clean = cleanPageText(text);
      // The page cap cut it: a table, a concordance, an OCR run gone wrong.
      // Its tail would not make the page more findable, but the entry says
      // it is not the whole page.
      if (clean.length === PDFTEXT_PAGE_CHARS_MAX && text.length > clean.length) truncated = true;
      if (chars + clean.length > PDFTEXT_BOOK_CHARS_MAX) {
        truncated = true;
        break;
      }
      chars += clean.length;
      pages.push(clean);
      // Yield: a 900-page book must not hold the event loop for the seconds
      // its content streams take to parse.
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    return { entry: { title, pageCount, pages, truncated, extractedAt: Date.now() } };
  } finally {
    await task.destroy().catch(() => {});
  }
}

// ── Scheduling ─────────────────────────────────────────────────────────────

let running = false;
let walkWanted = false;
const queued = new Set<string>();
let kickTimer: NodeJS.Timeout | null = null;
let persistTimer: NodeJS.Timeout | null = null;
let dirty = false;
/** Whether a full walk has happened since the process started (or since the
 *  setting was last turned on) — what `searchPages` checks so a row turned
 *  on at runtime starts the work without a restart. */
let walked = false;

/** The last pass, for the boot line and the test that proves a walk ran. */
export interface PdfTextStats {
  /** Books on the shelf whose text is in the store. */
  searchable: number;
  /** Extracted during the last pass. */
  extracted: number;
  /** Recorded failures (damaged, encrypted, too large) on the shelf. */
  failed: number;
  /** Skipped this pass because the store is at its cap; tried again next boot. */
  skipped: number;
  /** Characters of text held. */
  chars: number;
}

let lastStats: PdfTextStats = { searchable: 0, extracted: 0, failed: 0, skipped: 0, chars: 0 };

export function pdfTextStats(): PdfTextStats {
  return { ...lastStats };
}

function schedulePersist(): void {
  dirty = true;
  if (persistTimer !== null) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    flushPersist();
  }, PERSIST_IDLE_MS);
}

function flushPersist(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!dirty) return;
  dirty = false;
  try {
    persist(readStore());
  } catch (err) {
    console.warn("astrolabe: could not write pdftext.json:", err);
  }
}

/** Ask for work, coalesced: a burst of watcher events becomes one pass. */
function kick(walk: boolean): void {
  if (walk) walkWanted = true;
  if (kickTimer !== null) return;
  kickTimer = setTimeout(() => {
    kickTimer = null;
    if (!running) void run();
  }, walk ? 0 : EVENT_SETTLE_MS);
}

/** Drop the entries the shelf no longer needs when the store is over its
 *  book cap: books not seen on the shelf, oldest extraction first. A book that
 *  IS on the shelf is never evicted for one that is not. */
function evictOverCap(store: StoreFile): void {
  const keys = Object.keys(store.texts);
  const gone = keys.filter((key) => !pathByKey.has(key)).sort((a, b) => store.texts[a].extractedAt - store.texts[b].extractedAt);
  // Over the book cap: the oldest orphans go. Over the CHAR cap: orphans go
  // too, oldest first, until it fits — a re-saved PDF gets a new key and its
  // old text would otherwise count against the cap forever, silently
  // shutting new books out.
  let overBooks = Math.max(0, keys.length - PDFTEXT_STORE_BOOKS_MAX);
  for (const key of gone) {
    if (overBooks <= 0 && storeChars <= PDFTEXT_STORE_CHARS_MAX) break;
    storeChars -= entryChars(store.texts[key]);
    delete store.texts[key];
    overBooks--;
    schedulePersist();
  }
}

/** Fold the loaded pages off the request path: one entry per turn of the
 *  event loop, so the first search after boot does not fold forty million
 *  characters synchronously. */
function foldInBackground(store: StoreFile): void {
  const entries = Object.values(store.texts);
  let i = 0;
  const step = (): void => {
    if (i >= entries.length) return;
    foldedOf(entries[i++]);
    setImmediate(step);
  };
  setImmediate(step);
}

async function run(): Promise<void> {
  running = true;
  let extracted = 0;
  let skipped = 0;
  try {
    while (walkWanted || queued.size > 0) {
      if (!pdfSearchEnabled()) {
        walkWanted = false;
        queued.clear();
        walked = false;
        break;
      }
      let targets: string[];
      if (walkWanted) {
        walkWanted = false;
        queued.clear();
        // PDFs ONLY. The shelf holds EPUBs too now, and this sweep is a
        // pdf.js text extraction — handing it an EPUB means one failed open
        // per book, a "3 unreadable" line on every boot, and a store entry
        // remembering that a book which is perfectly readable could not be
        // read. An EPUB's text is not extracted and cached at all: it is
        // markup, and server/epub.ts reads a chapter of it out of the zip in
        // milliseconds whenever the in-book search asks.
        const { books } = await listBooks();
        const pdfs = books.filter((book) => isPdfPath(book.path));
        pathByKey.clear();
        for (const book of pdfs) pathByKey.set(book.key, book.path);
        targets = pdfs.map((book) => book.path);
        walked = true;
      } else {
        targets = [...queued];
        queued.clear();
      }
      const store = readStore();
      let cursor = 0;
      const worker = async (): Promise<void> => {
        for (;;) {
          const index = cursor++;
          if (index >= targets.length || !pdfSearchEnabled()) return;
          const rel = targets[index];
          let key: string;
          try {
            key = await bookKey(rel);
          } catch (err) {
            // Gone between the walk and now, or unreadable: not on the shelf.
            if (!(err instanceof VaultError)) console.warn(`astrolabe: pdf text: ${rel}:`, err);
            forgetPath(rel);
            continue;
          }
          pathByKey.set(key, rel);
          if (store.texts[key] !== undefined || store.failures[key] !== undefined) continue;
          if (countStoreChars(store) >= PDFTEXT_STORE_CHARS_MAX) {
            skipped += 1;
            continue;
          }
          let outcome: Outcome;
          try {
            outcome = await extractOne(rel);
          } catch (err) {
            // Anything pdf.js throws past its own promise — an out-of-memory
            // on a pathological file — is a parse failure for our purposes:
            // recorded, not retried every boot.
            console.warn(`astrolabe: pdf text: could not read ${rel}:`, err);
            outcome = { failure: { reason: "parse", at: Date.now() } };
          }
          if (outcome === null) return;
          if ("entry" in outcome) {
            store.texts[key] = outcome.entry;
            storeChars = countStoreChars(store) + entryChars(outcome.entry);
            extracted += 1;
          } else {
            store.failures[key] = outcome.failure;
          }
          schedulePersist();
        }
      };
      await Promise.all(Array.from({ length: EXTRACT_CONCURRENCY }, worker));
      evictOverCap(store);
    }
  } catch (err) {
    console.warn("astrolabe: pdf text extraction stopped:", err);
  } finally {
    running = false;
    flushPersist();
    const store = readStore();
    let searchable = 0;
    let failed = 0;
    for (const key of pathByKey.keys()) {
      if (store.texts[key] !== undefined) searchable += 1;
      else if (store.failures[key] !== undefined) failed += 1;
    }
    lastStats = { searchable, extracted, failed, skipped, chars: countStoreChars(store) };
    if (extracted > 0 || skipped > 0 || failed > 0) {
      const tail = [
        failed > 0 ? `${failed} unreadable` : "",
        skipped > 0 ? `${skipped} skipped (store at ${Math.round(PDFTEXT_STORE_CHARS_MAX / 1e6)}M chars)` : "",
      ].filter(Boolean);
      console.log(
        `  pdf text: ${searchable} books searchable, ${extracted} read now${tail.length > 0 ? `, ${tail.join(", ")}` : ""}`,
      );
    }
  }
}

function handleEvent(event: VaultEvent): void {
  if (event.kind === "bulk") return;
  // A folder moved or deleted takes every book under it along; the walk is
  // the only thing that knows the new addresses.
  if (event.dir) {
    if (event.kind !== "created") kick(true);
    return;
  }
  const from = isPdfPath(event.path) ? normalizeRel(event.path) : null;
  const to = event.toPath !== undefined && isPdfPath(event.toPath) ? normalizeRel(event.toPath) : null;
  switch (event.kind) {
    case "created":
    case "changed":
      if (from === null) return;
      queued.add(from);
      kick(false);
      return;
    case "deleted":
      if (from !== null) forgetPath(from);
      return;
    case "renamed":
      if (from !== null) forgetPath(from);
      if (to !== null) {
        queued.add(to);
        kick(false);
      }
      return;
  }
}

let started = false;

/** Subscribe to the vault and, when the setting allows, start the first walk.
 *  Called once from server/index.ts after the note index is built: the
 *  index is what the first request needs, and the shelf can wait its turn. */
export function startPdfText(): void {
  if (started) return;
  started = true;
  onEvent(handleEvent);
  if (pdfSearchEnabled()) kick(true);
}

/** A walk, now, and a promise for its end — for the harness and the tests.
 *  Production never waits on this. */
export async function extractAll(): Promise<PdfTextStats> {
  walkWanted = true;
  if (kickTimer !== null) {
    clearTimeout(kickTimer);
    kickTimer = null;
  }
  if (!running) await run();
  else {
    while (running) await new Promise<void>((resolve) => setTimeout(resolve, 20));
    if (walkWanted) await run();
  }
  return pdfTextStats();
}

// ── The search ─────────────────────────────────────────────────────────────

/** A book's row title: the PDF's own /Title when it has one, else the file's
 *  name without the extension — what the shelf card prints. */
function titleFor(entry: PdfTextEntry, rel: string): string {
  return entry.title || path.posix.basename(rel).replace(/\.pdf$/i, "");
}

/** Occurrences of `needle` in `hay`, capped — a score, not a count anyone
 *  reads, so past the cap the exact number is not worth the scan. */
function countIn(hay: string, needle: string, cap = 50): number {
  let n = 0;
  let at = 0;
  while (n < cap) {
    const i = hay.indexOf(needle, at);
    if (i === -1) break;
    n += 1;
    at = i + needle.length;
  }
  return n;
}

/**
 * Pages of the shelf's books that hold every word of the query.
 *
 * Substring semantics per term over the fold, deliberately NOT minisearch:
 * the note index ranks fuzzily because a note is a thing the reader wrote
 * and half-remembers; a book page is quoted, and "which page SAYS that" is
 * the question — the same reason `searchMatches` answers a note's lines
 * exactly. Everything is AND, like the operators. Only `in:` and `path:`
 * apply to a book (a PDF has no tags, no publish flag, no date, no links); a
 * query carrying any other operator is a notes question and gets no book rows.
 *
 * Admin sessions only, by the caller's construction: the route asks this
 * beside the note index only for an unlimited session, because the shelf is
 * an enumeration of the owner's directory.
 */
export function searchPages(query: string): SearchHit[] {
  if (!pdfSearchEnabled()) return [];
  const parsed = parseSearchQuery(query);
  const scope = searchScope(parsed.filters);
  if (scope === "notes" || scope === "none") return [];
  const pathFilters: { value: string; negated: boolean }[] = [];
  for (const filter of parsed.filters) {
    if (filter.kind === "in") continue;
    if (filter.kind === "path") {
      pathFilters.push({ value: filter.value, negated: filter.negated });
      continue;
    }
    return [];
  }
  // A row turned on at runtime starts the work on the first search rather
  // than at the next restart.
  if (!walked && !running) kick(true);

  const words = parsed.text.split(/\s+/).filter(Boolean);
  const terms = words.map((w) => foldTerm(w)).filter(Boolean);
  const store = readStore();
  const cap = scope === "books" ? BOOK_HITS_SCOPED_MAX : BOOK_HITS_MAX;
  const books = [...pathByKey.entries()]
    .filter(([, rel]) => {
      const lower = rel.toLowerCase();
      return pathFilters.every((f) => lower.includes(f.value) !== f.negated);
    })
    .sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: "base" }));

  const hits: SearchHit[] = [];
  if (terms.length === 0) {
    // Only operators: list the shelf, one row per book, the way a lone
    // `tag:` lists notes. The snippet is the book's opening, unmarked.
    for (const [key, rel] of books) {
      const entry = store.texts[key];
      if (entry === undefined) continue;
      const opening = entry.pages.find((p) => p.length > 0) ?? "";
      hits.push({
        kind: "book",
        path: rel,
        title: titleFor(entry, rel),
        snippet: escapeHtml(opening.slice(0, OPENING_CHARS)),
        score: 0,
        page: Math.max(1, entry.pages.findIndex((p) => p.length > 0) + 1),
      });
      if (hits.length >= cap) break;
    }
    return hits;
  }

  const scored: { rel: string; entry: PdfTextEntry; page: number; score: number }[] = [];
  for (const [key, rel] of books) {
    const entry = store.texts[key];
    if (entry === undefined) continue;
    const folded = foldedOf(entry);
    const own: { page: number; score: number }[] = [];
    for (let i = 0; i < folded.length; i++) {
      const page = folded[i];
      let score = 0;
      let all = true;
      for (const term of terms) {
        const n = countIn(page, term);
        if (n === 0) {
          all = false;
          break;
        }
        score += n;
      }
      if (all) own.push({ page: i + 1, score });
    }
    own.sort((a, b) => b.score - a.score || a.page - b.page);
    for (const { page, score } of own.slice(0, BOOK_HITS_PER_BOOK)) scored.push({ rel, entry, page, score });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.rel.localeCompare(b.rel, undefined, { sensitivity: "base" }) ||
      a.page - b.page,
  );
  for (const { rel, entry, page, score } of scored.slice(0, cap)) {
    hits.push({
      kind: "book",
      path: rel,
      title: titleFor(entry, rel),
      snippet: snippetOf(entry.pages[page - 1], words),
      score,
      page,
    });
  }
  return hits;
}
