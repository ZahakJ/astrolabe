// A BOOK, ON A PHONE: the reader with its own chrome and nothing else.
//
// The audit counted three chrome layers over a book on a Pixel 7 — the app's
// tab strip, the reader's seven-glyph bar with the title cut to "Sa…", and the
// status bar's READING pill. Here the phone draws none of its own: no top bar,
// no tab bar, and on a tablet no list column. The reader draws one 44px bar
// (client/books/chrome.tsx PhoneBar) — back, title, a scrubber, ⋯ — and this
// screen lends it the phone's action sheet for ⋯ and a list sheet for the
// contents. The PDF opens at its width; pinch zoom and the − + buttons stay.
//
// The store still holds the book as the workspace tab (applyScreen opened
// it), so a citation that opened it (`[[Book.pdf#page=42&rect=…]]`) lands on
// its passage exactly as it does in a desktop pane.

import { Suspense, useMemo } from "react";
import type { PhoneReaderHost } from "../../books/chrome.tsx";
import { t } from "../../i18n.ts";
import { lazySurface } from "../../lazySurface.tsx";
import { useStore } from "../../state.ts";
import { activeTabOf, paneAt } from "../../workspace.ts";
import { useActionSheet } from "../ActionSheet.tsx";
import { usePhone } from "../context.ts";
import { LIST_SHEET } from "../sheetIds.ts";
import "../../styles/books.css";

const BookReader = lazySurface(() => import("../../books/BookReader.tsx"));
const EpubReader = lazySurface(() => import("../../epub/EpubReader.tsx"));

export default function ReaderScreen({ tab, onBack }: { tab: string; onBack: () => void }) {
  const phone = usePhone();
  const actions = useActionSheet();
  const paneId = useStore((s) => s.workspace.focus);
  const target = useStore((s) => {
    const pane = paneAt(s.workspace, s.workspace.focus);
    return pane !== null && activeTabOf(pane)?.path === tab ? pane.bookTarget : null;
  });
  const clearBookTarget = useStore((s) => s.clearBookTarget);
  const zen = useStore((s) => s.zen);
  useStore((s) => s.language);

  const host = useMemo<PhoneReaderHost>(
    () => ({
      onBack,
      menu: (title, rows) => actions(title, rows),
      outline: (title, rows, pick) => phone.openSheet(LIST_SHEET, { title, rows, pick }),
    }),
    [onBack, actions, phone],
  );

  const epub = /\.epub$/i.test(tab);
  return (
    <div className="s-ph-screen s-ph-reader" data-screen="reader" data-path={tab}>
      <div className="s-books s-ph-reader__body" role="region" aria-label={t("bookLibrary")}>
        <Suspense fallback={<p className="s-book__message">{t("bookLoading")}</p>}>
          {epub ? (
            <EpubReader
              key={tab}
              path={tab}
              place={target !== null && "href" in target ? target : null}
              onLanded={() => clearBookTarget(paneId)}
              onClose={onBack}
              onLibrary={onBack}
              zen={zen}
              phone={host}
            />
          ) : (
            <BookReader
              key={tab}
              path={tab}
              citation={target !== null && "page" in target ? target : null}
              onLanded={() => clearBookTarget(paneId)}
              onClose={onBack}
              onLibrary={onBack}
              zen={zen}
              phone={host}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
}
