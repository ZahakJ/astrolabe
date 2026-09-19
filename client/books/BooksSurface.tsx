// The books surface: the shelf and the reader, and the one component that
// knows which of the two is on screen.
//
// It takes a ROUTE and callbacks and owns no global state, which is the whole
// point: it is the body of a PANE now (client/components/Pane.tsx), exactly
// the move its portal-era header promised. Nothing in here reaches for
// `useStore`, `document.body` or the address bar — the pane decides where the
// route lives and what closing means, and `active` tells the reader whether
// its pane holds the keyboard, because zathura keys listen on `window` and a
// `j` typed toward another pane must not turn a page here.

import { Suspense } from "react";
import { lazySurface } from "../lazySurface.tsx";
import type { BookAnchor } from "../../shared/bookAnchor.ts";
import type { EpubAnchor } from "../../shared/epubAnchor.ts";
import { t } from "../i18n.ts";
import "../styles/books.css";

export type BooksRoute =
  | { kind: "library" }
  | {
      kind: "book";
      path: string;
      /** The passage a citation named, when a `[[Book.pdf#page=42&rect=…]]` in
       *  a note is what opened this. The reader jumps to the page and pulses
       *  the rectangle once. Absent for an ordinary open. */
      anchor?: BookAnchor | null;
      /** The same thing for an EPUB: a chapter and either a fraction of it or
       *  the first words of a passage (`#ch=…&at=…`, `#ch=…&q=…`). Two fields
       *  rather than one union because the two formats answer "where in a
       *  book" with different nouns — pages against chapters — and a route
       *  that blurred them would push the branch into every reader. */
      place?: EpubAnchor | null;
    };

export interface BooksSurfaceProps {
  route: BooksRoute;
  /** Move within the surface (shelf → book, book → shelf). */
  onRoute(route: BooksRoute): void;
  /** Leave the surface entirely. */
  onExit(): void;
  /** Whether this surface's pane holds the keyboard. Defaults true so a lone
   *  surface behaves as the full-screen reader always did. */
  active?: boolean;
  /** The route's citation anchor has been landed on — the pane may clear its
   *  one-shot target. */
  onLanded?(): void;
  /** The shell's zen switch, handed through to the reader so `z` and the
   *  title-bar button can ask for the book alone on the screen. Still no
   *  global state in here: the pane reads the store and passes the answer. */
  zen?: boolean;
  onZen?(): void;
}

// The reader is split from the shelf on purpose: a reader who only ever
// browses their shelf never downloads the page renderer, the text layer or the
// search matcher, and the shelf is what a click on "Library" reaches first.
// (pdf.js itself is behind a further boundary again — client/books/pdfjs.ts —
// so neither of these two chunks contains it.)
const BookLibrary = lazySurface(() => import("./BookLibrary.tsx"));
const BookReader = lazySurface(() => import("./BookReader.tsx"));
// And the third chunk: the EPUB reader. Split from the PDF one on exactly the
// argument above — the two formats share the chrome and nothing else, and a
// reader opening a 300 kB EPUB has no business downloading a page renderer, a
// canvas compositor and a column detector to do it. Neither chunk contains
// pdf.js; this one does not even reach the boundary that would.
const EpubReader = lazySurface(() => import("../epub/EpubReader.tsx"));

/** Which reader a path opens in. The extension, and nothing cleverer: the
 *  server has already refused anything that is not one of the two, and a
 *  reader chosen by sniffing bytes would be a reader that cannot be chosen
 *  until the bytes arrive. */
function isEpub(path: string): boolean {
  return /\.epub$/i.test(path);
}

export default function BooksSurface({ route, onRoute, onExit, active = true, onLanded, zen, onZen }: BooksSurfaceProps) {
  return (
    <div className="s-books" role="region" aria-label={t("bookLibrary")}>
      <Suspense fallback={<p className="s-books__loading">{t("bookLoading")}</p>}>
        {route.kind === "library" ? (
          <BookLibrary
            active={active}
            onOpen={(path, anchor) => onRoute({ kind: "book", path, anchor })}
            onClose={onExit}
          />
        ) : isEpub(route.path) ? (
          <EpubReader
            key={route.path}
            active={active}
            path={route.path}
            place={route.place ?? null}
            onLanded={onLanded}
            onClose={onExit}
            onLibrary={() => onRoute({ kind: "library" })}
            zen={zen}
            onZen={onZen}
          />
        ) : (
          <BookReader
            key={route.path}
            active={active}
            path={route.path}
            citation={route.anchor ?? null}
            onLanded={onLanded}
            onClose={onExit}
            onLibrary={() => onRoute({ kind: "library" })}
            zen={zen}
            onZen={onZen}
          />
        )}
      </Suspense>
    </div>
  );
}
