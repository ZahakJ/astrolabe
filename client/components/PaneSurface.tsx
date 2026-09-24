// WHAT A PANE SHOWS — the surface its active tab asks for, with none of the
// pane's own chrome (no tab strip, no drop zones, no focus ring).
//
// Split out of Pane.tsx so the phone shell (client/phone/) can draw exactly
// the same surfaces — the editor, the reading view, the book reader, the
// graph, Orbits, Sigils, the Media page — inside a screen of its own, without
// importing the desktop's tab strip to not render it. `surfaceOf()` in
// client/workspace.ts still decides; this file is the switch over its answer,
// and the one place a new surface is wired for both shells.

import { Suspense, type ReactNode } from "react";
import { lazySurface } from "../lazySurface.tsx";
import { useStore } from "../state.ts";
import { activeTabOf, paneAt, surfaceOf } from "../workspace.ts";
const GraphView = lazySurface(() => import("./GraphView.tsx"));
const MediaView = lazySurface(() => import("../media/MediaView.tsx"));
const RoutinesView = lazySurface(() => import("../routines/RoutinesView.tsx"));
const ReviewWeekView = lazySurface(() => import("../review/ReviewWeekView.tsx"));
const CalendarView = lazySurface(() => import("../calendar/CalendarView.tsx"));
const FeedsView = lazySurface(() => import("../feeds/FeedsView.tsx"));
const OrbitsSurface = lazySurface(() => import("../orbits/OrbitsSurface.tsx"));
const Editor = lazySurface(() => import("./Editor.tsx"));
const ReadingView = lazySurface(() => import("../reading/ReadingView.tsx"));
// The books surface keeps its own chunk boundary (scripts/check-bundle.mjs
// pins it): a pane that never shows a book never downloads the shelf, the
// reader or — two boundaries further in — pdf.js.
const BooksSurface = lazySurface(() => import("../books/BooksSurface.tsx"));
// The canvas and the whole of Excalidraw behind it: the largest chunk in the
// product, loaded the first time a drawing is opened and never before.
const DrawingSurface = lazySurface(() => import("../drawing/DrawingSurface.tsx"));

export default function PaneSurface({ id, children }: { id: string; children?: ReactNode }) {
  const workspace = useStore((s) => s.workspace);
  const admin = useStore((s) => s.admin);
  const reloadTicks = useStore((s) => s.reloadTick);
  const openBook = useStore((s) => s.openBook);
  const closeLibrary = useStore((s) => s.closeLibrary);
  const zen = useStore((s) => s.zen);
  const setZen = useStore((s) => s.setZen);
  const clearBookTarget = useStore((s) => s.clearBookTarget);
  const closeTab = useStore((s) => s.closeTab);
  const setPaneMode = useStore((s) => s.setPaneMode);
  const pane = paneAt(workspace, id);
  if (pane === null) return null;

  const tab = activeTabOf(pane);
  const surface = surfaceOf(pane);
  const focused = workspace.focus === id;

  const reading = surface === "reading" || !admin;
  return surface === "book" || surface === "library" ? (
      // A BOOK IS A TAB (the owner: "prob should just treat it like a normal
      // tab?? so people can open the book while taking notes"). The reader
      // stopped being a full-screen layer over the app; it renders here, in a
      // pane, beside whatever else is open. BooksSurface still takes a route
      // and callbacks and owns no global state — exactly the move its header
      // promised — and `active` scopes its window-level zathura keys to the
      // FOCUSED pane, because `j` typed toward a different pane must not turn
      // a page here.
      <Suspense fallback={<div className="s-books" />}>
        <BooksSurface
          active={focused}
          route={
            surface === "library" || tab === null
              ? { kind: "library" }
              : // The one place that tells the two anchor shapes apart. A PDF's
                // target has a `page`, an EPUB's an `href` (client/workspace.ts
                // ::BookTarget); each reader takes only its own, so neither has
                // to know the other exists.
                {
                  kind: "book",
                  path: tab.path,
                  anchor: pane.bookTarget !== null && "page" in pane.bookTarget ? pane.bookTarget : null,
                  place: pane.bookTarget !== null && "href" in pane.bookTarget ? pane.bookTarget : null,
                }
          }
          onRoute={(next) => {
            if (next.kind === "library") setPaneMode(id, "library");
            else openBook(next.path, next.place ?? next.anchor ?? null);
          }}
          onExit={() => {
            // Leaving the shelf returns the pane to its tabs; closing a book
            // closes the book's TAB — the same thing closing any tab means.
            if (surface === "library") closeLibrary();
            else if (tab !== null) closeTab(tab.path);
          }}
          onLanded={() => clearBookTarget(id)}
          zen={zen}
          onZen={() => setZen(!zen)}
        />
      </Suspense>
    ) : surface === "graph" ? (
      // THE GRAPH IS A TAB (the owner: "graph view should have its own
      // position in the top tab strip"): it draws in the pane that holds its
      // tab, beside whatever else is open, and clicking a node opens that
      // note as the tab next to it, so a reader flips between the map and
      // the note the way they flip between two notes.
      <Suspense fallback={<div className="s-graph" />}>
        <GraphView />
      </Suspense>
    ) : surface === "media" ? (
      // The Media page is a tab like the graph: every tracker in the vault,
      // shelved, in the pane that holds it.
      <Suspense fallback={<div className="s-media" />}>
        <MediaView />
      </Suspense>
    ) : surface === "routines" ? (
      // The Sigils page: today's checklists, every sigil in the vault,
      // a tab like the Media page.
      <Suspense fallback={<div className="s-routines" />}>
        <RoutinesView />
      </Suspense>
    ) : surface === "calendar" ? (
      // The Calendar: the month, the size a month is read at, and the door
      // into any day's note. A tab like the Media page — it was a card at the
      // top of the Sigils page until 3.18.
      <Suspense fallback={<div className="s-calpage" />}>
        <CalendarView />
      </Suspense>
    ) : surface === "feeds" ? (
      // Feeds: the reading list's unread items and a reader beside them
      // (docs/feeds.md), a tab like the Calendar.
      <Suspense fallback={<div className="s-feeds" />}>
        <FeedsView />
      </Suspense>
    ) : surface === "review-week" ? (
      // The weekly review: the week added up, a tab like the Sigils page.
      <Suspense fallback={<div className="s-review" />}>
        <ReviewWeekView />
      </Suspense>
    ) : surface === "orbits" && tab !== null ? (
      // Orbits: the shelf, or a session over one deck —
      // the tab's path says which. A tab on the Sigils page's terms; keyed
      // by path so leaving one session for another starts it afresh.
      <Suspense fallback={<div className="s-orbits" />}>
        <OrbitsSurface key={tab.path} tabPath={tab.path} />
      </Suspense>
    ) : surface === "drawing" && tab !== null ? (
      // A DRAWING IS A TAB, like a book: the canvas fills the pane beside
      // whatever else is open, and `active` scopes Excalidraw's own keys to
      // the focused pane. A visitor never reaches here — a drawing is a note
      // and an unpublished one 404s like any other.
      <Suspense fallback={<div className="s-drawing" />}>
        <DrawingSurface key={tab.path} path={tab.path} active={focused} />
      </Suspense>
    ) : tab !== null && !reading && surface === "edit" ? (
      <Suspense fallback={<div className="s-editor" />}>
        <Editor key={`${tab.path}#${reloadTicks}`} path={tab.path} paneId={id} />
      </Suspense>
    ) : tab !== null && (surface === "reading" || surface === "edit") ? (
      <Suspense fallback={<div className="s-reading" />}>
        <ReadingView key={`${tab.path}#${reloadTicks}`} path={tab.path} />
      </Suspense>
    ) : (
      // The empty state, the graph and the locked vault are the shell's own and
      // stay there: they are about the WINDOW, not about a pane, and the solo
      // pane hands them straight through.
      (children ?? null)
    );
}
