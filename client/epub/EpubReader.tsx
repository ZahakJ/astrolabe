// THE EPUB READER. One scrolling column of a book, set in the app's own type.
//
// The owner's ask was "the arabic prints suck super bad… can you maybe
// support epub through reader maybe?", and everything odd about this component
// is that sentence being taken literally. An Arabic PDF is a PICTURE of type:
// the shaping was decided once by whatever made the file, the measure is
// frozen, and zooming makes the picture bigger rather than the text larger. An
// EPUB is markup, so the browser shapes it — with the Noto Naskh Arabic this
// product already carries, at whatever size the reader asks for, at whatever
// measure the window gives. The job here is to get out of the way of that.
//
// WHAT IS SHARED WITH THE PDF READER, AND WHAT IS NOT.
//
// Shared: the chrome (client/books/chrome.tsx — the search line, the contents
// panel, the key sheet), the stylesheet's chrome half
// (client/styles/books.css), the reading position (the same books.json record
// under the same content key), the sitting clock and where a sitting goes
// (client/books/session.ts), and the fold that makes «المقدمة» find
// «الْمُقَدِّمَة» (shared/fold.ts, through the server).
//
// Not shared, because the formats genuinely differ: there are NO PAGES here.
// A page in a reflowing text is a fact about the window, not about the book,
// so a place is a chapter and a fraction of it (shared/epubAnchor.ts), the
// status line counts chapters, and there is no dual-page mode, no rotation and
// no night-mode composite — the theme's own paper and ink are already the
// page, because the book is being SET rather than photographed.
//
// THE SLOT DISCIPLINE IS BookReader's. Every chapter gets a box whose height
// is either measured or estimated, so the scrollbar is honest from the first
// frame; the chapter in view and its two neighbours hold real markup, and
// everything else is an empty box of the right height. A 300-chapter book is
// then three chapters of DOM, not three hundred — which is the difference
// between a reader that opens and one that hangs the tab.
//
// THE PUBLISHER'S CSS IS SCOPED, NOT TRUSTED. It arrives sanitized from
// server/epub.ts and is prefixed with this reader's own selector before it
// reaches the document (client/epub/scope.ts, shared/epubCss.ts). Neither
// half can reach the other: the book cannot repaint the app, and the app's
// stylesheet cannot break the book.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_BOOK_STATE, linkSafe, ZOOM_MAX, ZOOM_MIN, type BookState } from "../../shared/bookAnchor.ts";
import {
  citationQuery,
  epubCitationLink,
  formatEpubAnchor,
  type EpubAnchor,
} from "../../shared/epubAnchor.ts";
import { foldQuery } from "../../shared/fold.ts";
import { clockMinutes, clockRunning, openClock, summarizeClock, turnClock, type SessionClock } from "../../shared/readingSession.ts";
import type { BookOpenResponse, EpubHit, EpubManifest } from "../../shared/types.ts";
import { localDay } from "../../shared/weekReview.ts";
import { scrollBehavior } from "../a11y.ts";
import { beaconBookState, openBookByPath, saveBookState } from "../books/api.ts";
import { HelpSheet, OutlinePanel, SearchLine, type HelpRow, type OutlineRow } from "../books/chrome.tsx";
import { clearStash, logSession, readStash, writeStash } from "../books/session.ts";
import { localeNum, t, tf } from "../i18n.ts";
import { shortcutKey } from "../keys.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { formatDuration } from "../trackerUnits.ts";
import { panesInOrder } from "../workspace.ts";
import { getEpubChapter, getEpubManifest, searchEpub } from "./api.ts";
import { chapterRanges, collapsedOffsets, rangeAt, splitChapter, type Chapter } from "./scope.ts";
import "../styles/epub.css";

/** How far `j`/`k` move, in CSS pixels — four lines of body type, the same
 *  step the PDF reader uses and for the same reason. */
const SCROLL_STEP = 72;

/** How long the chrome lingers after the last pointer movement or keystroke. */
const CHROME_MS = 2200;

/** Debounce on the position write. */
const SAVE_MS = 900;

/** A stash older than this is a different sitting (BookReader says why). */
const RESUME_MS = 30 * 60_000;

/** How tall an unmeasured chapter is assumed to be, before any of the book
 *  has been laid out. A chapter of a novel at a comfortable measure is
 *  roughly two screens; the estimate is replaced by the running average of
 *  what has actually been measured as soon as there is one, so this number
 *  only ever governs the very first frame. */
const CHAPTER_GUESS_PX = 1400;

/** Chapters holding real markup: the one in view and one either side. Two is
 *  what stops a fast scroll from meeting an empty box; more is DOM nobody is
 *  looking at, and a 300-chapter book is exactly where that matters. */
const WINDOW_RADIUS = 1;

/** How many chapters' markup is KEPT after it leaves the window. Reading back
 *  a page, stepping to a footnote and back, and flipping between two chapters
 *  are all one gesture to a reader and must not cost a request each; a whole
 *  book's worth of them is a tab that grows all evening. Twenty-four is about
 *  an hour of reading, at a few tens of kilobytes each. */
const CHAPTER_CACHE_MAX = 24;

/** The cache, bounded, oldest first — a Map iterates in insertion order, which
 *  is all the eviction order this needs. */
function evict(next: Map<string, Chapter>): Map<string, Chapter> {
  while (next.size > CHAPTER_CACHE_MAX) {
    const oldest = next.keys().next();
    if (oldest.done) break;
    next.delete(oldest.value);
  }
  return next;
}

/** The selector every chapter box wears, and therefore the prefix the
 *  publisher's stylesheet is confined to. Spelled once. */
const CHAPTER_SELECTOR = ".s-epub__chapter";

/** The CSS Custom Highlight the search paints with — the SAME name the PDF
 *  reader uses, so `::highlight(astrolabe-book-search)` in books.css paints
 *  both and a reader meets one colour of found-text in this product. */
const HIGHLIGHT_NAME = "astrolabe-book-search";

type Overlay = "none" | "search" | "outline" | "help";

const HELP_ROWS: HelpRow[] = [
  { keys: "j k", label: "bookKeyScroll" },
  { keys: "Space", label: "bookKeyPage" },
  { keys: "J K", label: "epubKeyChapter" },
  { keys: "gg G", label: "epubKeyFirstLast" },
  { keys: "/", label: "bookKeySearch" },
  { keys: "n N", label: "bookKeyNextMatch" },
  { keys: "o", label: "bookKeyOutline" },
  { keys: "+ -", label: "epubKeyType" },
  { keys: "0", label: "epubKeyTypeReset" },
  { keys: "c", label: "epubKeyCite" },
  { keys: "z", label: "bookKeyZen" },
  { keys: "l", label: "bookKeyLibrary" },
  { keys: "q", label: "bookKeyClose" },
  { keys: ":end", label: "bookKeyEndSession" },
  { keys: "?", label: "bookKeyHelp" },
];

interface Props {
  /** Vault path of the `.epub`. Changing it opens a different book in place. */
  path: string;
  /** The place a URL hash or a citation named (`#ch=…&at=…`, `#ch=…&q=…`).
   *  Landed on once, then cleared by the pane. */
  place?: EpubAnchor | null;
  active?: boolean;
  onLanded?(): void;
  onClose(): void;
  onLibrary(): void;
  zen?: boolean;
  onZen?(): void;
}

/** The contents, flattened for the shared panel: one row per entry, its
 *  nesting kept as a depth. */
interface FlatToc {
  label: string;
  href: string;
  fragment: string;
  depth: number;
}

function flattenToc(rows: EpubManifest["toc"], depth = 0, out: FlatToc[] = []): FlatToc[] {
  for (const row of rows) {
    out.push({ label: row.label, href: row.href, fragment: row.fragment, depth });
    flattenToc(row.children, depth + 1, out);
  }
  return out;
}

export default function EpubReader({ path, place = null, active = true, onLanded, onClose, onLibrary, zen = false, onZen }: Props) {
  const [entry, setEntry] = useState<BookOpenResponse | null>(null);
  const [manifest, setManifest] = useState<EpubManifest | null>(null);
  const [failed, setFailed] = useState(false);
  const [state, setState] = useState<BookState>(DEFAULT_BOOK_STATE);
  /** Which chapter is in view, as an index into the spine. */
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState<Map<string, Chapter>>(new Map());
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<EpubHit[]>([]);
  const [hitAt, setHitAt] = useState(0);
  const [chromeShown, setChromeShown] = useState(true);
  const [clockTick, setClockTick] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const boxes = useRef(new Map<string, HTMLElement>());
  /** href → the height that chapter laid out to, at the current type size. */
  const heights = useRef(new Map<string, number>());
  const stateRef = useRef(state);
  const manifestRef = useRef<EpubManifest | null>(null);
  const entryRef = useRef<BookOpenResponse | null>(null);
  const keyRef = useRef<string | null>(null);
  const restoredRef = useRef(false);
  const selfScroll = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const chromeTimer = useRef<number | null>(null);
  const clock = useRef<SessionClock | null>(null);
  /** Where the reader is, at scroll resolution — what the debounced write and
   *  the pagehide beacon read at the moment they fire. */
  const anchor = useRef({ index: 0, href: "", fraction: 0 });
  /** A vi-style `g` waiting for its second `g`. */
  const pendingG = useRef(false);
  /** The place still to be landed on: a citation, a `#ch=` in the URL, or the
   *  stored position. Cleared once the reader is actually there. */
  const pendingPlace = useRef<EpubAnchor | null>(null);

  stateRef.current = state;
  manifestRef.current = manifest;
  entryRef.current = entry;

  const spine = manifest?.spine ?? [];
  const toc = useMemo(() => (manifest === null ? [] : flattenToc(manifest.toc)), [manifest]);

  /** The type size, as a multiplier. Stored in the book's `zoom` — the same
   *  field a PDF's scale lives in, because it is the same reader preference
   *  wearing the format's own units. */
  const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, state.zoom || 1));

  // ── Open ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let live = true;
    setEntry(null);
    setManifest(null);
    setFailed(false);
    setLoaded(new Map());
    setHits([]);
    heights.current = new Map();
    boxes.current = new Map();
    restoredRef.current = false;
    keyRef.current = null;

    void (async () => {
      try {
        // The position comes back before a word of the book does, so the first
        // chapter laid out is the chapter the reader left off in.
        const opened = await openBookByPath(path);
        if (!live) return;
        setEntry(opened);
        keyRef.current = opened.key;
        const stashed = readStash(opened.key);
        if (stashed !== null && Date.now() - stashed.lastTurnAt > RESUME_MS) {
          clearStash(opened.key);
          const summary = summarizeClock(stashed, Date.now());
          if (summary) void logSession(opened, summary, localDay(stashed.lastTurnAt));
          clock.current = null;
        } else {
          clock.current = stashed;
        }
        const restored = opened.state ?? { ...DEFAULT_BOOK_STATE, path: opened.path };
        setState(restored);
        // The URL's place outranks the stored one: a citation is a request.
        pendingPlace.current =
          place ?? (restored.chapter === "" ? null : { href: restored.chapter, fraction: restored.offset, query: null });

        const shape = await getEpubManifest(path);
        if (!live) return;
        setManifest(shape);
        const patch: Partial<BookState> = {
          // `pages` is the chapter COUNT for an EPUB — see shared/bookAnchor.ts
          // for why the two formats share the pair.
          pages: shape.spine.length,
          path: opened.path,
          title: shape.title,
          author: shape.author,
          rtl: shape.direction === "rtl",
        };
        setState((prev) => ({ ...prev, ...patch }));
        void saveBookState(opened.key, patch).catch(() => {
          // A position that will not save is not worth interrupting reading.
        });
      } catch {
        if (live) setFailed(true);
      }
    })();

    return () => {
      live = false;
    };
    // `place` is a one-shot the pane clears; re-running on it would re-open
    // the book every time a citation arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // ── Chapters ──────────────────────────────────────────────────────────────

  /** The hrefs that should hold real markup right now. */
  const wanted = useMemo(() => {
    const out: string[] = [];
    for (let i = Math.max(0, index - WINDOW_RADIUS); i <= Math.min(spine.length - 1, index + WINDOW_RADIUS); i++) {
      out.push(spine[i].href);
    }
    return out;
  }, [index, spine]);

  /** The same set, for the render's lookup. */
  const shown = useMemo(() => new Set(wanted), [wanted]);

  useEffect(() => {
    let live = true;
    void (async () => {
      for (const href of wanted) {
        if (!live || loaded.has(href)) continue;
        try {
          const html = await getEpubChapter(path, href);
          if (!live) return;
          const chapter = splitChapter(html, CHAPTER_SELECTOR);
          setLoaded((prev) => (prev.has(href) ? prev : evict(new Map(prev).set(href, chapter))));
        } catch {
          // A chapter that will not load leaves an empty box with the book's
          // own height in it; the rest of the volume still reads. Marked as
          // loaded-but-empty so the fetch is not retried on every scroll.
          if (!live) return;
          setLoaded((prev) => (prev.has(href) ? prev : evict(new Map(prev).set(href, { css: "", body: "" }))));
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [wanted, loaded, path]);

  /** The publisher's stylesheets, deduplicated — every chapter of a book
   *  usually links the same one, and thirty copies of it in the document is
   *  thirty parses of the same three kilobytes. */
  const bookCss = useMemo(() => {
    const seen = new Set<string>();
    for (const chapter of loaded.values()) if (chapter.css.trim() !== "") seen.add(chapter.css);
    return [...seen].join("\n");
  }, [loaded]);

  /** How tall an unmeasured chapter is taken to be: the average of what has
   *  been measured, or the first-frame guess when nothing has. */
  const guess = (): number => {
    const measured = [...heights.current.values()];
    if (measured.length === 0) return CHAPTER_GUESS_PX;
    return Math.round(measured.reduce((a, b) => a + b, 0) / measured.length);
  };

  /** Measure whatever is mounted. Runs after every layout-affecting change,
   *  because a chapter's height is the scrollbar's honesty. */
  useEffect(() => {
    for (const [href, el] of boxes.current) {
      // Only what is actually DRAWN: a box outside the window is holding its
      // remembered height, so measuring it would be measuring the memory.
      if (!shown.has(href) || !loaded.has(href)) continue;
      const height = el.offsetHeight;
      if (height > 0) heights.current.set(href, height);
    }
  }, [loaded, scale, shown]);

  // ── Where the reader is ───────────────────────────────────────────────────

  /** The chapter containing a scroll position, and how far down it. A walk
   *  rather than a binary search: the mounted set is three boxes and the rest
   *  are known heights, so the answer comes out of `offsetTop` on the few
   *  elements that exist. */
  const placeAt = useCallback(
    (top: number): { index: number; href: string; fraction: number } | null => {
      if (spine.length === 0) return null;
      let best: { index: number; href: string; fraction: number } | null = null;
      for (let i = 0; i < spine.length; i++) {
        const el = boxes.current.get(spine[i].href);
        if (!el) continue;
        if (el.offsetTop <= top + 4) {
          const height = el.offsetHeight || 1;
          best = { index: i, href: spine[i].href, fraction: Math.min(1, Math.max(0, (top - el.offsetTop) / height)) };
        } else break;
      }
      return best ?? { index: 0, href: spine[0].href, fraction: 0 };
    },
    [spine],
  );

  /** The debounced write, and the address bar with it.
   *
   *  THE HASH RIDES THE SAME DEBOUNCE as the save, and that is the whole
   *  reason this is one function. The fraction changes on every scroll frame,
   *  so a `replaceState` per frame would be sixty history writes a second;
   *  hanging it off the save means one, carrying the last position rather than
   *  an old one — exactly the bargain the save itself makes. */
  const queueSave = useCallback(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      const { index: at, href, fraction } = anchor.current;
      if (href !== "" && typeof location !== "undefined") {
        const hash = `#${formatEpubAnchor({ href, fraction, query: null })}`;
        if (location.hash !== hash) history.replaceState(history.state, "", `${location.pathname}${location.search}${hash}`);
      }
      const key = keyRef.current;
      if (!key) return;
      void saveBookState(key, { page: at + 1, offset: fraction, chapter: href }).catch(() => {
        // The next scroll tries again, and pagehide tries once more.
      });
    }, SAVE_MS);
  }, []);

  const onScroll = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller || !restoredRef.current || selfScroll.current) return;
    const found = placeAt(scroller.scrollTop);
    if (!found) return;
    anchor.current = found;
    queueSave();
    if (found.index !== index) {
      setIndex(found.index);
      setState((prev) => ({ ...prev, page: found.index + 1, offset: found.fraction, chapter: found.href }));
    }
  }, [index, placeAt, queueSave]);

  /** Scroll to a place, mounting its chapter first when it is not mounted.
   *  Returns once the reader is actually there. */
  const goToPlace = useCallback(
    async (target: EpubAnchor): Promise<void> => {
      const shape = manifestRef.current;
      if (shape === null) return;
      const at = shape.spine.findIndex((item) => item.href === target.href);
      if (at === -1) return;
      setIndex(at);
      // The box exists as soon as the spine is rendered, whether or not the
      // chapter's markup is in it — which is what makes this land on the right
      // part of the book before the chapter has even been fetched.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const el = boxes.current.get(target.href);
      const scroller = scrollRef.current;
      if (!el || !scroller) return;
      selfScroll.current = true;
      // TWICE, A FRAME APART, and the second pass is the load-bearing one.
      // Between the first scroll and the next frame the chapter's own markup
      // may arrive, a placeholder above may take its remembered height, or a
      // type-size change may re-lay out the whole column — and every one of
      // those moves the box this just scrolled to. Landing once and leaving
      // it is how zooming to read a footnote quietly loses your place.
      const land = (): void => {
        scroller.scrollTo({ top: el.offsetTop + (target.fraction ?? 0) * (el.offsetHeight || 0), behavior: "auto" });
      };
      land();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      land();
      window.setTimeout(() => {
        selfScroll.current = false;
      }, 0);
      anchor.current = { index: at, href: target.href, fraction: target.fraction ?? 0 };
      setState((prev) => ({ ...prev, page: at + 1, offset: target.fraction ?? 0, chapter: target.href }));
      queueSave();
    },
    [queueSave],
  );

  // A citation arriving while the book is ALREADY open — a click on a
  // `[[Book.epub#ch=…&q=…]]` in the note beside it. Declared after `goToPlace`
  // because that is where it is defined, not because the order matters to
  // React: an effect runs after the render that declared it.
  useEffect(() => {
    if (place === null || manifest === null || !restoredRef.current) return;
    pendingPlace.current = place;
    void goToPlace(place);
  }, [place, manifest, goToPlace]);

  // THE RESTORE. Once the spine has boxes, land on the place that was pending
  // — the citation, the URL's `#ch=`, or the stored position — and only then
  // start believing scroll events.
  useEffect(() => {
    if (manifest === null || restoredRef.current || spine.length === 0) return;
    if (!boxes.current.get(spine[0].href)) return;
    const target = pendingPlace.current;
    restoredRef.current = true;
    // A book nobody has opened starts at its first chapter, and says so in the
    // address bar — a book is a bookmarkable place from the first frame, not
    // from the first scroll.
    void goToPlace(target ?? { href: spine[0].href, fraction: 0, query: null });
    scrollRef.current?.focus({ preventScroll: true });
    if (clock.current === null) clock.current = openClock([stateRef.current.page], Date.now());
  }, [manifest, spine, goToPlace]);

  // Landing on the QUOTATION a citation named, once its chapter is really
  // there. A fraction is a scroll offset and a quotation is a sentence: the
  // sentence is what still finds the passage in a reissued file, so `q` wins
  // over `at` and is honoured as soon as the words exist to be found.
  useEffect(() => {
    const target = pendingPlace.current;
    if (target === null || target.query === null || !restoredRef.current) return;
    const host = boxes.current.get(target.href)?.querySelector<HTMLElement>(".s-epub__body");
    if (!host || !loaded.has(target.href)) return;
    pendingPlace.current = null;
    flashPhrase(host, target.query, scrollRef.current);
    onLanded?.();
  }, [loaded, onLanded]);

  // ── The sitting ───────────────────────────────────────────────────────────
  //
  // A chapter is this format's page: the clock turns when the reader crosses
  // into a new one, the tracker's fence gains "N chapters in M minutes", and
  // `progressOf` reads the same pair it reads for a PDF. There is nothing
  // truer available without weighing every chapter, and a sitting measured in
  // chapters is a sitting the reader recognises.
  useEffect(() => {
    if (!restoredRef.current || clock.current === null) return;
    const next = turnClock(clock.current, [state.page], Date.now());
    if (next === clock.current) return;
    clock.current = next;
    if (keyRef.current) writeStash(keyRef.current, next);
    setClockTick((n) => n + 1);
  }, [state.page]);

  useEffect(() => {
    const id = window.setInterval(() => setClockTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const endSession = useCallback((quiet = false): void => {
    const c = clock.current;
    const opened = entryRef.current;
    const now = Date.now();
    const summary = c === null ? null : summarizeClock(c, now);
    if (keyRef.current) clearStash(keyRef.current);
    clock.current = c === null ? null : openClock(c.showing, now);
    setClockTick((n) => n + 1);
    if (summary && opened) void logSession(opened, summary);
    else if (!quiet) toast(t("bookSessionNone"));
  }, []);

  // Closing the book ends the sitting; leaving its tab open does not.
  useEffect(
    () => () => {
      const open = panesInOrder(useStore.getState().workspace).some((p) => p.tabs.some((tab) => tab.path === path));
      if (!open) endSession(true);
    },
    [path, endSession],
  );

  // The last write of a session, off a tab that is closing.
  useEffect(() => {
    const flush = (): void => {
      const key = keyRef.current;
      if (!key || !restoredRef.current) return;
      beaconBookState(key, {
        page: anchor.current.index + 1,
        offset: anchor.current.fraction,
        chapter: anchor.current.href,
      });
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  // ── The type size ─────────────────────────────────────────────────────────
  //
  // Every chapter's height changes with it, so the measurements are dropped
  // and the reader is put back where it was — zooming in to read a footnote
  // must not throw away your place, which is the commonest gesture there is.
  const setScale = useCallback(
    (next: number) => {
      const clamped = Math.min(3, Math.max(0.6, Math.round(next * 100) / 100));
      heights.current = new Map();
      setState((prev) => ({ ...prev, zoom: clamped }));
      const key = keyRef.current;
      if (key) void saveBookState(key, { zoom: clamped }).catch(() => {});
      const here = { ...anchor.current };
      window.setTimeout(() => {
        void goToPlace({ href: here.href, fraction: here.fraction, query: null });
      }, 0);
    },
    [goToPlace],
  );

  // ── Search ────────────────────────────────────────────────────────────────

  const runSearch = useCallback(
    async (text: string) => {
      setQuery(text);
      if (text.trim() === "") {
        setHits([]);
        return;
      }
      try {
        const res = await searchEpub(path, text);
        setHits(res.hits);
        setHitAt(0);
        if (res.hits.length === 0) {
          toast(t("bookNoMatches"));
          return;
        }
        await landOnHit(res.hits[0], text);
      } catch {
        toast(t("epubSearchFailed"), "error");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path],
  );

  /** Go to one hit and paint it. The chapter is mounted first: the offset the
   *  server sent is into the chapter's TEXT, and there is no text to walk
   *  until the markup is in the document. */
  const landOnHit = useCallback(
    async (hit: EpubHit, text: string) => {
      await goToPlace({ href: hit.href, fraction: null, query: null });
      // Two frames: one for the chapter to mount, one for it to lay out.
      for (let tries = 0; tries < 60; tries++) {
        const host = boxes.current.get(hit.href)?.querySelector<HTMLElement>(".s-epub__body");
        if (host && host.childNodes.length > 0) {
          paintHit(host, hit, text, scrollRef.current);
          return;
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    },
    [goToPlace],
  );

  const stepHit = useCallback(
    (delta: number) => {
      if (hits.length === 0) return;
      const next = (hitAt + delta + hits.length) % hits.length;
      setHitAt(next);
      void landOnHit(hits[next], query);
    },
    [hitAt, hits, landOnHit, query],
  );

  // ── Citing ────────────────────────────────────────────────────────────────

  /** Copy a wikilink to whatever is selected.
   *
   *  A QUOTATION, NOT A RECTANGLE. The PDF reader anchors a citation to four
   *  numbers on a page because a PDF's geometry is fixed; an EPUB's is not,
   *  and a rectangle in a reflowing text is a rectangle in one window at one
   *  type size. So the link carries the first words — `#ch=…&q=…` — and the
   *  reader honours it by finding them. CONTRACTS.md records what a
   *  round-trip-safe range anchor would need if this is ever worth more. */
  const copyCitation = useCallback(() => {
    const selection = window.getSelection();
    const text = selection === null ? "" : selection.toString();
    if (text.trim() === "") {
      toast(t("epubCiteNothing"));
      return;
    }
    const node = selection?.anchorNode ?? null;
    const box = node === null ? null : (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)?.closest<HTMLElement>(CHAPTER_SELECTOR);
    const href = box?.dataset.href ?? stateRef.current.chapter;
    if (href === "") return;
    const name = path.split("/").pop() ?? path;
    // The alias is the CHAPTER's own name where the book gives one, and the
    // book's otherwise — not a translated phrase. A PDF's citation reads
    // "Ihya, p. 212" because a page number needs a word in front of it; a
    // chapter is already titled, in the book's own language, and putting an
    // English "Chapter" in front of an Arabic one would be this product
    // talking over the book.
    const chapter = manifestRef.current?.spine.find((item) => item.href === href)?.title ?? "";
    const link = epubCitationLink(
      name,
      { href, fraction: null, query: citationQuery(text) },
      chapter || name.replace(/\.epub$/i, ""),
      linkSafe,
    );
    void navigator.clipboard
      .writeText(link)
      .then(() => toast(t("epubCiteCopied")))
      .catch(() => toast(t("epubCiteFailed"), "error"));
  }, [path]);

  // ── The chrome that gets out of the way ──────────────────────────────────

  const wake = useCallback(() => {
    setChromeShown(true);
    if (chromeTimer.current !== null) window.clearTimeout(chromeTimer.current);
    chromeTimer.current = window.setTimeout(() => setChromeShown(false), CHROME_MS);
  }, []);

  useEffect(() => {
    wake();
    return () => {
      if (chromeTimer.current !== null) window.clearTimeout(chromeTimer.current);
    };
  }, [wake]);

  // ── The keyboard ──────────────────────────────────────────────────────────
  //
  // EVERY CHARACTER KEY GOES THROUGH shortcutKey(). `e.key === "j"` is false
  // on an Arabic keyboard — see client/keys.ts — and a reader whose system
  // keyboard is Arabic is precisely who this feature was built for.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!active) return;
      const target = e.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing) return;
      const scroller = scrollRef.current;
      const key = shortcutKey(e);
      wake();

      if (e.key === "Escape") {
        if (overlay !== "none") {
          e.preventDefault();
          setOverlay("none");
        }
        return;
      }
      // The browser's own zoom chord, taken over: the reader means the BOOK's
      // type, not the whole application's.
      if (e.ctrlKey || e.metaKey) {
        if (key === "=" || key === "+") {
          e.preventDefault();
          setScale(scale * 1.15);
        } else if (key === "-") {
          e.preventDefault();
          setScale(scale / 1.15);
        } else if (key === "0") {
          e.preventDefault();
          setScale(1);
        }
        return;
      }
      if (e.altKey) return;

      const goChapter = (delta: number): void => {
        const shape = manifestRef.current;
        if (shape === null) return;
        const next = Math.min(shape.spine.length - 1, Math.max(0, anchor.current.index + delta));
        void goToPlace({ href: shape.spine[next].href, fraction: 0, query: null });
      };

      if (pendingG.current) {
        pendingG.current = false;
        if (key === "g") {
          e.preventDefault();
          const shape = manifestRef.current;
          if (shape) void goToPlace({ href: shape.spine[0].href, fraction: 0, query: null });
          return;
        }
      }

      switch (key) {
        case "j":
          e.preventDefault();
          scroller?.scrollBy({ top: SCROLL_STEP, behavior: "auto" });
          break;
        case "k":
          e.preventDefault();
          scroller?.scrollBy({ top: -SCROLL_STEP, behavior: "auto" });
          break;
        case "J":
          e.preventDefault();
          goChapter(1);
          break;
        case "K":
          e.preventDefault();
          goChapter(-1);
          break;
        case "g":
          e.preventDefault();
          pendingG.current = true;
          break;
        case "G": {
          e.preventDefault();
          const shape = manifestRef.current;
          if (shape) void goToPlace({ href: shape.spine[shape.spine.length - 1].href, fraction: 0, query: null });
          break;
        }
        case "/":
          e.preventDefault();
          setOverlay("search");
          break;
        case "n":
          e.preventDefault();
          stepHit(1);
          break;
        case "N":
          e.preventDefault();
          stepHit(-1);
          break;
        case "o":
          e.preventDefault();
          setOverlay(overlay === "outline" ? "none" : "outline");
          break;
        case "c":
          e.preventDefault();
          copyCitation();
          break;
        case "+":
        case "=":
          e.preventDefault();
          setScale(scale * 1.15);
          break;
        case "-":
          e.preventDefault();
          setScale(scale / 1.15);
          break;
        case "0":
          e.preventDefault();
          setScale(1);
          break;
        case "z":
          e.preventDefault();
          onZen?.();
          break;
        case "l":
          e.preventDefault();
          onLibrary();
          break;
        case "q":
          e.preventDefault();
          onClose();
          break;
        case "?":
          e.preventDefault();
          setOverlay(overlay === "help" ? "none" : "help");
          break;
        default:
          if (e.key === " ") {
            e.preventDefault();
            scroller?.scrollBy({ top: (e.shiftKey ? -1 : 1) * ((scroller.clientHeight || 600) - 60), behavior: "auto" });
          }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, copyCitation, goToPlace, onClose, onLibrary, onZen, overlay, scale, setScale, stepHit, wake]);

  /** Follow one of the book's own links: a footnote marker, a cross-reference,
   *  a jump back. The target chapter is mounted by `goToPlace` and the
   *  fragment is scrolled to once it is there. */
  const followLink = useCallback(
    (e: React.SyntheticEvent): void => {
      const from = e.target instanceof Element ? e.target : null;
      const link = from?.closest<HTMLElement>("[data-href]");
      if (!link) return;
      const href = link.dataset.href ?? "";
      const fragment = link.dataset.fragment ?? "";
      if (href === "") return;
      e.preventDefault();
      void goToPlace({ href, fraction: 0, query: null }).then(() => {
        if (fragment === "") return;
        // Two frames: the chapter has to mount before its ids exist.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => scrollToFragment(boxes.current.get(href) ?? null, fragment, scrollRef.current)),
        );
      });
    },
    [goToPlace],
  );

  // WHERE THE PALETTE COMES IN. This reader registers nothing with it, and
  // that is deliberate rather than an omission: the palette's table is
  // module-level and global (client/components/CommandPalette.tsx), so a row
  // that acts on "the open book" would be a row that lies whenever no book is
  // open — the PDF reader answered the same question with its `:` line for the
  // same reason. What the palette gained for this round is the one row that is
  // true everywhere: "Library", which is how a reader reaches the shelf — and
  // therefore an EPUB — without knowing a URL. Everything a book can do is on
  // a key, and every key is in `?`.

  // ── Render ────────────────────────────────────────────────────────────────

  if (failed) {
    return (
      <div className="s-book s-book--empty">
        <p className="s-book__message">{t("epubOpenFailed")}</p>
        <button type="button" className="s-book__button" onClick={onLibrary}>
          {t("bookLibrary")}
        </button>
      </div>
    );
  }

  const title = state.title || manifest?.title || entry?.name.replace(/\.epub$/i, "") || "";
  const chapterTitle = spine[index]?.title ?? "";

  const sessionState = ((): { running: boolean; minutes: number } | null => {
    void clockTick;
    const c = clock.current;
    if (c === null || c.startedAt === null) return null;
    const now = Date.now();
    return { running: clockRunning(c, now), minutes: clockMinutes(c, now) };
  })();

  const outlineRows: OutlineRow[] | null =
    manifest === null ? null : toc.map((row) => ({ label: row.label, depth: row.depth, current: row.href === state.chapter }));

  return (
    <div className="s-book s-epub" onMouseMove={wake} data-chrome={chromeShown ? "on" : "off"} data-overlay={overlay}>
      {/* The publisher's own stylesheet, every selector confined to a chapter
          box (client/epub/scope.ts). It is a real <style> rather than inline
          attributes because a book's CSS is a cascade and inline styles are
          not one — and because the app's own rules then still win where they
          are more specific, which is how the theme keeps the paper. */}
      {bookCss !== "" && <style>{bookCss}</style>}

      <div
        className="s-book__scroll s-epub__scroll"
        ref={scrollRef}
        onScroll={onScroll}
        tabIndex={-1}
        role="document"
        aria-label={tf("bookReaderLabel", { title })}
      >
        <div
          className="s-epub__doc"
          dir={manifest?.direction ?? "ltr"}
          lang={manifest?.language || undefined}
          style={{ "--epub-scale": scale } as React.CSSProperties}
          // The book's own cross-references. They arrive as `data-href`
          // rather than as real links (server/epub.ts says why), so the jump
          // is this one delegated handler — and it is delegated rather than
          // bound per anchor because a chapter can carry five hundred
          // footnote links and five hundred listeners is five hundred
          // listeners.
          onClick={followLink}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") followLink(e);
          }}
        >
          {manifest === null && <p className="s-book__message">{t("bookLoading")}</p>}
          {spine.map((item) => {
            // THE WINDOW DECIDES WHAT IS DRAWN, not what has been fetched.
            // `loaded` is a cache — a chapter read and come back to must not
            // be re-fetched — and rendering everything IN it was the bug that
            // made a 298-chapter book accumulate 298 chapters of DOM as the
            // reader worked through it: the slot discipline held on the
            // request and quietly did not hold on the document.
            const chapter = shown.has(item.href) ? loaded.get(item.href) : undefined;
            const known = heights.current.get(item.href);
            return (
              <section
                key={item.href}
                className="s-epub__chapter"
                data-href={item.href}
                ref={(el) => {
                  if (el) boxes.current.set(item.href, el);
                  else boxes.current.delete(item.href);
                }}
                // A chapter nobody is looking at is an empty box of the right
                // height: the scrollbar stays honest and the DOM stays three
                // chapters big. An unmeasured one borrows the running average.
                style={chapter === undefined ? { minBlockSize: `${known ?? guess()}px` } : undefined}
                aria-label={item.title || undefined}
              >
                {chapter === undefined ? (
                  <div className="s-epub__pending" aria-hidden="true" />
                ) : (
                  // The markup was rebuilt from an allowlist on the server
                  // (server/epub.ts) and stripped of everything that could
                  // fetch or run again on the way in (client/epub/scope.ts).
                  <div className="s-epub__body" dangerouslySetInnerHTML={{ __html: chapter.body }} />
                )}
              </section>
            );
          })}
        </div>
      </div>

      <header className="s-book__top">
        {/* The book and the chapter it is open at. TWO SPANS, because a phone
            is 390px wide and an ellipsis takes the END of a string: one span
            truncated to "ديوان ت…" tells a reader nothing they did not
            already know from the tab above it, while the chapter's name is
            the part that changes as they read. So the book's name is the half
            that goes under 700px (epub.css) and the chapter's is the half
            that stays. */}
        <span className="s-book__title" dir="auto">
          <span className="s-epub__of">{title}</span>
          {chapterTitle !== "" && <span className="s-epub__sep" aria-hidden="true"> — </span>}
          {chapterTitle !== "" && <span className="s-epub__chaptername">{chapterTitle}</span>}
        </span>
        {onZen && (
          <button
            type="button"
            className="s-book__act"
            onClick={onZen}
            aria-pressed={zen}
            aria-label={zen ? t("exitZen") : t("bookZen")}
            title={zen ? t("exitZen") : t("bookZen")}
          >
            <span aria-hidden="true">{zen ? "⤡" : "⤢"}</span>
          </button>
        )}
        {sessionState !== null && (
          <button type="button" className="s-book__act s-book__act--end" onClick={() => endSession()} title={t("bookSessionEndTitle")}>
            {t("bookSessionEnd")}
          </button>
        )}
        {/* The type size and the citation by finger: `+` `-` `c` have no
            touch twin, and this surface is read on a phone more than the PDF
            one is — reflowing text is the reason phones can hold books. */}
        <button type="button" className="s-book__act s-book__touchzoom" onClick={() => setScale(scale / 1.15)} aria-label={t("epubTypeSmaller")}>
          −
        </button>
        <button type="button" className="s-book__act s-book__touchzoom" onClick={() => setScale(scale * 1.15)} aria-label={t("epubTypeBigger")}>
          +
        </button>
        <button type="button" className="s-book__act s-book__touchzoom" onClick={copyCitation} aria-label={t("epubCiteAction")}>
          ❝
        </button>
        <button
          type="button"
          className="s-book__act"
          onClick={() => setOverlay(overlay === "outline" ? "none" : "outline")}
          aria-label={t("bookOutline")}
          aria-expanded={overlay === "outline"}
        >
          <span aria-hidden="true">☰</span>
        </button>
        <button type="button" className="s-book__act" onClick={onClose} aria-label={t("bookClose")}>
          <span aria-hidden="true">✕</span>
        </button>
      </header>

      <footer className="s-book__status">
        <button
          type="button"
          className="s-book__status-page"
          onClick={() => setOverlay(overlay === "outline" ? "none" : "outline")}
          title={t("bookOutline")}
        >
          {tf("epubChapterOf", { chapter: localeNum(index + 1), total: localeNum(spine.length) })}
        </button>
        {/* The type size, and the way back to it. A reader with no keyboard
            can make the type bigger from the title bar but had no `0` to
            press; the number that reports the size is the obvious place to
            put the reset, so it is a button and says so. */}
        <button type="button" className="s-book__status-page" onClick={() => setScale(1)} title={t("epubTypeReset")}>
          {tf("bookZoomPct", { percent: localeNum(Math.round(scale * 100)) })}
        </button>
        {hits.length > 0 && <span>{tf("bookMatchOf", { index: localeNum(hitAt + 1), total: localeNum(hits.length) })}</span>}
        {sessionState !== null && (
          <span className="s-book__session" data-running={sessionState.running ? "on" : "off"}>
            {sessionState.running ? tf("bookSessionTimer", { time: formatDuration(sessionState.minutes) }) : t("bookSessionPaused")}
          </span>
        )}
      </footer>

      {overlay === "search" && (
        <SearchLine
          value={query}
          onChange={setQuery}
          onCancel={() => setOverlay("none")}
          onSubmit={(text) => {
            setOverlay("none");
            void runSearch(text);
          }}
        />
      )}

      {overlay === "outline" && (
        <OutlinePanel
          rows={outlineRows}
          onPick={(at) => {
            setOverlay("none");
            const row = toc[at];
            if (!row) return;
            void goToPlace({ href: row.href, fraction: 0, query: null }).then(() => {
              if (row.fragment !== "") scrollToFragment(boxes.current.get(row.href) ?? null, row.fragment, scrollRef.current);
            });
          }}
          onClose={() => setOverlay("none")}
        />
      )}

      {overlay === "help" && <HelpSheet title={t("bookHelpTitle")} rows={HELP_ROWS} onClose={() => setOverlay("none")} />}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function highlights(): { set(name: string, value: object): void; delete(name: string): void } | null {
  const css = CSS as unknown as { highlights?: { set(name: string, value: object): void; delete(name: string): void } };
  return css.highlights ?? null;
}

/** How far down the screen a found passage is put. Not `block: "center"`, for
 *  two reasons: a hit centred on the screen has as much of the book below it
 *  as above, which reads as being at the END of something; and a hit near the
 *  top of a chapter, centred, leaves the SCROLL POSITION inside the previous
 *  chapter, so the status line then names a chapter the reader is not in. A
 *  quarter down is where the eye goes and it keeps the bookkeeping honest. */
const HIT_FROM_TOP = 0.25;

/** Paint a Range with the CSS Custom Highlight API and scroll it into view.
 *  Where the browser lacks the API the passage still scrolls into view and is
 *  simply not tinted — the same bargain client/books/BookReader.tsx makes. */
function showRange(range: Range, scroller: HTMLElement | null): void {
  const registry = highlights();
  registry?.delete(HIGHLIGHT_NAME);
  const Ctor = (window as unknown as { Highlight?: new (...ranges: Range[]) => object }).Highlight;
  if (registry && Ctor) registry.set(HIGHLIGHT_NAME, new Ctor(range));
  const el = range.startContainer.parentElement;
  if (!el) return;
  if (!scroller) {
    el.scrollIntoView({ block: "center", behavior: scrollBehavior() });
    return;
  }
  const base = scroller.getBoundingClientRect().top - scroller.scrollTop;
  const top = el.getBoundingClientRect().top - base;
  // …and never above the chapter the hit is IN. A hit in the first line of a
  // chapter would otherwise be shown with the previous chapter's last
  // paragraph above it, which is pleasant to read and makes the status line
  // name a chapter the reader is not in — the scroll position is what "which
  // chapter" is computed from.
  const chapter = el.closest<HTMLElement>(".s-epub__chapter");
  const floor = chapter === null ? 0 : chapter.getBoundingClientRect().top - base;
  scroller.scrollTo({ top: Math.max(floor, top - scroller.clientHeight * HIT_FROM_TOP), behavior: scrollBehavior() });
}

/** Land on the k-th hit the server found, in the chapter that is now mounted.
 *  The server's offset is into the COLLAPSED text (server/epub.ts::
 *  chapterText), so it is walked back through the same collapse before it is
 *  turned into a Range — otherwise the flash lands a few words off, which is
 *  worse than not flashing at all. */
function paintHit(host: HTMLElement, hit: EpubHit, query: string, scroller: HTMLElement | null): void {
  const { text, nodes } = chapterRanges(host);
  const { at } = collapsedOffsets(text);
  const from = at[hit.offset];
  if (from === undefined) return;
  const length = foldQuery(query).length;
  const to = at[Math.min(at.length - 1, hit.offset + Math.max(1, length))] ?? from + 1;
  const range = rangeAt(nodes, from, to);
  if (range) showRange(range, scroller);
}

/** Find a quotation in a chapter and flash it — what `#ch=…&q=…` is honoured
 *  by. The fold is shared/fold.ts, so a citation made from pointed Arabic is
 *  found in a reissue that dropped the harakat, and vice versa. */
function flashPhrase(host: HTMLElement, phrase: string, scroller: HTMLElement | null): void {
  const { text, nodes } = chapterRanges(host);
  const needle = foldQuery(phrase);
  if (needle === "") return;
  const folded: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const piece = foldQuery(text[i]);
    for (let k = 0; k < piece.length; k++) {
      folded.push(piece[k]);
      map.push(i);
    }
  }
  const found = folded.join("").indexOf(needle);
  if (found === -1) return;
  const range = rangeAt(nodes, map[found], (map[found + needle.length - 1] ?? map[map.length - 1]) + 1);
  if (range) showRange(range, scroller);
}

/** A contents entry that points inside a chapter (`chapter.xhtml#sec3`). The
 *  id survives the sanitizer precisely so this works. */
function scrollToFragment(box: HTMLElement | null, fragment: string, scroller: HTMLElement | null): void {
  if (!box || !scroller) return;
  const target = box.querySelector<HTMLElement>(`[id="${CSS.escape(fragment)}"]`);
  target?.scrollIntoView({ block: "start", behavior: scrollBehavior() });
}
