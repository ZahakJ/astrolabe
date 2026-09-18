// Per-note URLs. Every note is a shareable, bookmarkable address:
//
//   /                     → home (empty state or HOME_NOTE)
//   /graph                → graph view
//   /library              → the book shelf
//   /book/folder/Book.pdf → that book, at the page its reader left off on
//   /sigils               → the Sigils page (`/routines`, its old name, (lineage)
//                           still lands here)
//   /orbits               → the Orbits shelf (`/review`, its old name,
//                           still lands here)
//   /orbits/a/B           → a study session over the deck a/B.md
//   /review-week          → the weekly review
//   /calendar             → the Calendar page (the month; 3.18, when it left
//                           the top of the Sigils page)
//   /folder/Note          → the note folder/Note.md (".md" stripped, segments
//                           URL-encoded; matching is case-insensitive)
//   /folder/Note#Heading  → same note, scrolled to the heading
//
// The store stays the single source of truth: installRouter() subscribes to
// openPath/view and mirrors them into history (pushState), and popstate maps
// the URL back into the store — so browser back/forward walk the notes you
// visited. applyUrl() is also called once the tree first loads, which is what
// makes a pasted deep link or a refresh land on the right note.

import { stripBidiControls } from "../shared/bidi.ts";
import type { TreeNode } from "../shared/types.ts";
import { getNote } from "./api.ts";
import { booksRouteFor, urlForBooksRoute } from "./books/door.ts";
import { collectNotes, resolveLink } from "./editor/links.ts";
import { t } from "./i18n.ts";
import { isNotePath, noteCandidates, noteTitleOf, stripNoteExt } from "../shared/noteFormat.ts";
import { useStore } from "./state.ts";
import { activeTabOf, isBookPath, isCalendarTab, isGraphTab, isMediaTab, isRoutinesTab, isOrbitsTab, isReviewWeekTab, paneAt, orbitsSessionOf, surfaceOf, type Workspace } from "./workspace.ts";

/** The focused pane is showing the graph tab. */
function graphTabActive(ws: Workspace): boolean {
  const pane = paneAt(ws, ws.focus);
  const tab = pane === null ? null : activeTabOf(pane);
  return tab !== null && isGraphTab(tab.path);
}

/** …or the Media page's. */
function mediaTabActive(ws: Workspace): boolean {
  const pane = paneAt(ws, ws.focus);
  const tab = pane === null ? null : activeTabOf(pane);
  return tab !== null && isMediaTab(tab.path);
}
/** …or the Orbits page's. */
function reviewWeekTabActive(ws: Workspace): boolean {
  const pane = paneAt(ws, ws.focus);
  const tab = pane === null ? null : activeTabOf(pane);
  return tab !== null && isReviewWeekTab(tab.path);
}
function routinesTabActive(ws: Workspace): boolean {
  const pane = paneAt(ws, ws.focus);
  const tab = pane === null ? null : activeTabOf(pane);
  return tab !== null && isRoutinesTab(tab.path);
}
/** …or the Calendar page's. */
function calendarTabActive(ws: Workspace): boolean {
  const pane = paneAt(ws, ws.focus);
  const tab = pane === null ? null : activeTabOf(pane);
  return tab !== null && isCalendarTab(tab.path);
}
/** …or a Orbits tab: the shelf, or a session over the deck
 *  the returned path names. Null when the focused tab is something else. */
function orbitsTabActive(ws: Workspace): { path: string | null; section: string | null } | null {
  const pane = paneAt(ws, ws.focus);
  const tab = pane === null ? null : activeTabOf(pane);
  if (tab === null || !isOrbitsTab(tab.path)) return null;
  const session = orbitsSessionOf(tab.path);
  return session === null ? { path: null, section: null } : session;
}

/** `/orbits`, or `/orbits/<note path>` for a session — the
 *  note path encoded a segment at a time, like a note's own permalink, and
 *  a section session carries the heading in the hash the way a note's
 *  permalink carries one. */
export function orbitsUrl(path: string | null, section: string | null = null): string {
  if (path === null) return "/orbits";
  const base = `/orbits/${path.split("/").map(encodeURIComponent).join("/")}`;
  return section ? `${base}#${encodeURIComponent(section)}` : base;
}

/** The session a `/orbits/…` address names (path null for the shelf), or
 *  undefined when the address is not an Orbits one. `/review` is the page's
 *  old address and `/constellations` its working name before it shipped; (lineage)
 *  both still open the shelf. */
function orbitsRouteOf(pathname: string, hash: string): { path: string | null; section: string | null } | undefined {
  // lineage: /review and /constellations are redirect sources only.
  if (pathname === "/review" || pathname === "/constellations" || pathname === "/constellations/" || pathname === "/orbits" || pathname === "/orbits/") return { path: null, section: null }; // lineage
  if (!pathname.startsWith("/orbits/")) return undefined;
  try {
    const rest = pathname.slice("/orbits/".length).split("/").map(decodeURIComponent).join("/");
    if (rest === "" || rest.includes("..")) return { path: null, section: null };
    const section = hash.length > 1 ? decodeURIComponent(hash.slice(1)) : null;
    return { path: rest, section: section === "" ? null : section };
  } catch {
    return { path: null, section: null };
  }
}
import { toast } from "./toast.ts";

/** True while we are applying a URL to the store (popstate / initial load):
 *  the store subscription must then replace, not push, history entries. */
let applying = false;

/** Vault note path → pathname for the address bar ("a/b.md" → "/a/b"). */
export function notePathToUrl(path: string): string {
  const trimmed = stripNoteExt(path);
  return "/" + trimmed.split("/").map(encodeURIComponent).join("/");
}

/** Pathname → the vault path it spells, WITHOUT consulting the tree
 *  ("/a/b" → "a/b.md"). The tree is a discovery surface and the languageFilter
 *  prunes it, so resolving a permalink through it would 404 exactly the
 *  published notes the filter curates away — while /api/note, which is never
 *  filtered, serves them. Callers use this as the fallback when the tree has
 *  no match and let the server answer. Null for "/" and malformed encoding. */
export function urlToNoteGuess(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = pathname.split("/").map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
  const rel = decoded.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!rel || rel.includes("..")) return null;
  // A permalink carries no extension, so the guess has to pick one. `.md`
  // first, matching the server's own resolution order — a vault that grows a
  // `Paper.tex` beside its `Paper.md` must not re-point existing permalinks.
  return isNotePath(rel) ? rel : `${rel}.md`;
}

/** Pathname → vault note path, matched against the loaded tree.
 *  Accepts "/a/b", "/a/b.md" (exact, case-insensitive) and falls back to
 *  wikilink-style basename resolution for hand-typed short links. */
export function urlToNotePath(pathname: string, tree: TreeNode | null): string | null {
  let decoded: string;
  try {
    decoded = pathname.split("/").map(decodeURIComponent).join("/");
  } catch {
    return null; // malformed percent-encoding
  }
  const rel = decoded.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!rel) return null;
  // Every note extension is tried, in resolution order: "/Papers/Heat Equation"
  // must find `Papers/Heat Equation.tex` exactly as it finds a `.md`.
  const wants = noteCandidates(rel).map((c) => c.toLowerCase());
  const notes = collectNotes(tree);
  for (const want of wants) {
    for (const note of notes) {
      if (note.path.toLowerCase() === want) return note.path;
    }
  }
  // Short link like /Welcome for a nested note — resolve like a wikilink.
  if (!rel.includes("/")) return resolveLink(rel, tree);
  return null;
}

/** The focused pane's book surface, if that is what it is showing. A book is
 *  a WORKSPACE TAB now, so "is a book on screen" is a question for the
 *  workspace — not, as in the portal era, for a flag the reader kept beside
 *  the store. */
function bookSurfaceOf(ws: Workspace): { kind: "library" } | { kind: "book"; path: string } | null {
  const pane = paneAt(ws, ws.focus);
  if (pane === null) return null;
  const surface = surfaceOf(pane);
  if (surface === "library") return { kind: "library" };
  const tab = activeTabOf(pane);
  if (surface === "book" && tab !== null && isBookPath(tab.path)) {
    return { kind: "book", path: tab.path };
  }
  return null;
}

/** The URL the current store state should display. The focused pane speaks
 *  for the window: a book tab in focus puts its own address up — still a
 *  bookmarkable place, "which page" is remembered server-side — and focusing
 *  the note beside it hands the bar back to the note. */
function urlForState(view: string, openPath: string | null, ws: Workspace): string {
  if (view === "editor" && graphTabActive(ws)) return "/graph";
  if (view === "editor" && mediaTabActive(ws)) return "/media";
  if (view === "editor" && routinesTabActive(ws)) return "/sigils";
  if (view === "editor" && calendarTabActive(ws)) return "/calendar";
  if (view === "editor" && reviewWeekTabActive(ws)) return "/review-week";
  const orbits = view === "editor" ? orbitsTabActive(ws) : null;
  if (orbits !== null) return orbitsUrl(orbits.path, orbits.section);
  const book = bookSurfaceOf(ws);
  if (book !== null) return urlForBooksRoute(book);
  return openPath ? notePathToUrl(openPath) : "/";
}

function currentUrl(): string {
  return location.pathname + location.hash;
}

function setTitle(openPath: string | null, view: string): void {
  const base = useStore.getState().siteName; // SITE_NAME branding
  const book = bookSurfaceOf(useStore.getState().workspace);
  if (view === "editor" && graphTabActive(useStore.getState().workspace)) {
    document.title = `${t("docTitleGraph")} · ${base}`;
  } else if (view === "editor" && mediaTabActive(useStore.getState().workspace)) {
    document.title = `${t("media")} · ${base}`;
  } else if (view === "editor" && routinesTabActive(useStore.getState().workspace)) {
    document.title = `${t("routines")} · ${base}`;
  } else if (view === "editor" && calendarTabActive(useStore.getState().workspace)) {
    document.title = `${t("calendar")} · ${base}`;
  } else if (view === "editor" && reviewWeekTabActive(useStore.getState().workspace)) {
    document.title = `${t("reviewWeek")} · ${base}`;
  } else if (view === "editor" && orbitsTabActive(useStore.getState().workspace) !== null) {
    // A session is titled by the note it studies; the shelf by the page.
    const at = orbitsTabActive(useStore.getState().workspace);
    const name = at?.path ? (isNotePath(at.path) ? stripBidiControls(noteTitleOf(at.path)) : t("orbitsEverything")) : t("orbits");
    document.title = `${name} · ${base}`;
  } else if (book !== null) {
    document.title =
      book.kind === "library"
        ? `${t("bookLibrary")} · ${base}`
        : `${stripBidiControls(book.path.slice(book.path.lastIndexOf("/") + 1))} · ${base}`;
  } else if (openPath) {
    const name = stripBidiControls(noteTitleOf(openPath));
    document.title = `${name} · ${base}`;
  } else {
    document.title = base;
  }
}

/** Map the current location into the store (initial load and popstate).
 *  Returns true when the URL named something we could show.
 *
 *  `initial` marks the one call made right after bootstrap: a bare "/" then
 *  means "no deep link — keep whatever bootstrap decided" (the restored
 *  session or the HOME_NOTE that enterVault already opened), and returning
 *  false lets App's syncUrl() canonicalize the address bar to that note.
 *  On popstate a "/" entry really is the empty root entry (all tabs closed),
 *  so there it still clears openPath. */
export function applyUrl(initial = false): boolean {
  const store = useStore.getState();
  applying = true;
  try {
    // Books first. A book URL opens the book as a TAB in the focused pane —
    // the same thing clicking its cover does — so a deep link, a refresh and
    // a back/forward step all land in the same workspace the click built.
    // Walking back OUT of a book needs no special case any more: the note URL
    // opens (or refocuses) the note tab, and the book tab simply stays where
    // tabs stay.
    const books = booksRouteFor(location.pathname);
    if (books) {
      if (books.kind === "library") store.openLibrary();
      else store.openBook(books.path, books.anchor ?? null);
      return true;
    }
    if (location.pathname === "/graph") {
      store.setView("graph");
      return true;
    }
    if (location.pathname === "/media") {
      store.setView("media");
      return true;
    }
    // `/routines` was the Sigils page's address until 3.15 (and `/orbits` (lineage)
    // in 3.15, which now means the spaced-repetition shelf below); a
    // bookmark still opens it, and the bar then shows `/sigils`.
    // lineage: /routines is a redirect source only.
    if (location.pathname === "/sigils" || location.pathname === "/routines") { // lineage
      store.setView("routines");
      canonicalise("/sigils");
      return true;
    }
    if (location.pathname === "/calendar") {
      store.setView("calendar");
      return true;
    }
    if (location.pathname === "/review-week") {
      store.setView("review-week");
      return true;
    }
    // `/review` was the shelf's address until 3.16; a bookmark still opens
    // the shelf, and the bar then shows `/orbits`.
    const orbits = orbitsRouteOf(location.pathname, location.hash);
    if (orbits !== undefined) {
      store.openOrbits(orbits.path, orbits.section);
      canonicalise(orbitsUrl(orbits.path, orbits.section));
      return true;
    }
    const path = urlToNotePath(location.pathname, store.tree);
    if (path) {
      open(store, path);
      return true;
    }
    // Not in the tree — which, for a visitor, does NOT mean "not there": the
    // tree only lists what the visitor may discover, and the languageFilter
    // prunes it. Ask the server, which serves any published note by path.
    // (Blog-only routes name nothing here and never will: App lands them home
    // quietly rather than reporting a missing note.)
    if (
      location.pathname !== "/" &&
      !location.pathname.startsWith("/topic/") &&
      // …and public-folder pages, for the same reason: `/folder/games` is a
      // blog-shell route, so an ADMIN who opens that URL must not have it
      // probed as a note and reported missing.
      !location.pathname.startsWith("/folder/") &&
      probeNote(location.pathname)
    ) {
      return true;
    }
    if (location.pathname === "/") {
      if (initial) return false; // keep the home note / restored session
      // BACK PAST THE FIRST NOTE LANDS ON THE ROOT ENTRY, and the root entry
      // is a place: the vault, open, with nothing in front of the reader.
      //
      // Pre-panes this nulled `openPath`, which was pure DESYNC — a pane
      // renders its own active tab from the workspace, so the note stayed on
      // screen while the status bar, the palette and every `openPath`-gated
      // command were told nothing was open, and the next `commitWorkspace`
      // snapped the mirror back anyway. The fix for that was to touch only the
      // view mode, which traded a desync for a LIE: the address bar said "/"
      // and the note was still there, so Back did nothing a reader could see
      // (v1.8 client-solidity audit, B4 — found in the emulator, where there
      // is nothing to press but Back).
      //
      // `openPath` is a derived mirror with exactly one writer, so the honest
      // way to show the empty state is to close the tabs — through the store
      // action that owns that, which saves anything dirty on the way out
      // (`release()` in the buffer registry) and re-mirrors openPath for free.
      // The cost is the tab arrangement, and it is bounded: this entry only
      // EXISTS if the session began with nothing open, and Forward reopens the
      // note the reader stepped back from.
      if (store.openPath !== null || graphTabActive(store.workspace) || mediaTabActive(store.workspace) || routinesTabActive(store.workspace) || reviewWeekTabActive(store.workspace) || orbitsTabActive(store.workspace) !== null) {
        store.closeAllTabs();
      }
      return true;
    }
    return false;
  } finally {
    applying = false;
  }
}

/** The address bar set to the page's own address. An old name (`/review`,
 *  `/routines`) opens the page through the store, and the store's mirror (lineage)
 *  rewrites the bar only when the state CHANGED — a bookmark to `/review`
 *  with the shelf already open left `/review` standing, the one vestige a
 *  redirect table cannot reach. */
function canonicalise(url: string): void {
  if (currentUrl() !== url) history.replaceState(null, "", url);
}

/** Open `path` and canonicalize the address bar to it (short and
 *  differently-cased links included, even when the note is already open —
 *  no state change means the store subscription stays silent). */
function open(store: ReturnType<typeof useStore.getState>, path: string): void {
  const heading = location.hash ? decodeURIComponent(location.hash.slice(1)) : "";
  if (heading) store.setPendingHeading(heading);
  store.openNote(path); // sets view back to "editor" as well
  const canonical = notePathToUrl(path) + location.hash;
  if (currentUrl() !== canonical) history.replaceState(null, "", canonical);
}

/** Last-resort resolution for a URL the tree cannot answer: ask /api/note.
 *  Returns true when a request went out (the caller has nothing left to do);
 *  the note opens, or the address bar falls back to the current state, once
 *  the answer lands. Anything the server refuses is a genuine 404. */
function probeNote(pathname: string): boolean {
  const guess = urlToNoteGuess(pathname);
  if (guess === null) return false;
  void getNote(guess)
    .then(() => {
      if (location.pathname !== pathname) return; // navigated away meanwhile
      applying = true;
      try {
        open(useStore.getState(), guess);
      } finally {
        applying = false;
      }
    })
    .catch(() => {
      if (location.pathname !== pathname) return;
      toast(t("noteGone"));
      syncUrl();
    });
  return true;
}

/** Replace the address bar with the canonical URL for the current state
 *  (used when a pasted URL named a note that does not exist). */
export function syncUrl(): void {
  const s = useStore.getState();
  const url = urlForState(s.view, s.openPath, s.workspace);
  setTitle(s.openPath, s.view);
  if (currentUrl() !== url) history.replaceState(null, "", url);
}

/** Wire history <-> store. Call once from App after the store exists. */
export function installRouter(): () => void {
  // Mirror store → address bar.
  const unsubscribe = useStore.subscribe((s, prev) => {
    // A locked vault that just unlocked (login): the tree arrives while the
    // address bar still shows the deep link the visitor came for. Session
    // restore is about to steal openPath, so re-apply the captured URL after
    // it settles.
    if (prev.tree === null && s.tree !== null && location.pathname !== "/") {
      const href = currentUrl();
      queueMicrotask(() => {
        history.replaceState(null, "", href);
        applyUrl();
      });
    }
    // Computed-URL comparison, not field comparison: a book tab gaining or
    // losing focus changes the address without changing `openPath` (the note
    // mirror deliberately stays on the note while a book pane holds focus).
    const url = urlForState(s.view, s.openPath, s.workspace);
    if (url === urlForState(prev.view, prev.openPath, prev.workspace)) return;
    setTitle(s.openPath, s.view);
    if (currentUrl() === url) return;
    if (applying) {
      history.replaceState(null, "", url);
    } else {
      history.pushState(null, "", url);
    }
  });

  // Address bar → store.
  const onPopState = (): void => {
    if (!applyUrl()) syncUrl();
  };
  window.addEventListener("popstate", onPopState);

  setTitle(useStore.getState().openPath, useStore.getState().view);

  return () => {
    unsubscribe();
    window.removeEventListener("popstate", onPopState);
  };
}
