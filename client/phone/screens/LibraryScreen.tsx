// THE BOOKSHELF, ON A PHONE: every PDF and EPUB in the vault as a row — the
// title the book gives itself (or its file name), the author or the folder
// it sits in, and how far in the reader is — most recently read first. A tap
// opens the book in the reader's own phone chrome (./ReaderScreen.tsx).
//
// The desktop's shelf is a wall of typographic plates that fetch their covers
// as they scroll into view, through pdf.js; on a phone that wall is two
// plates wide and the cover work is a CPU a phone does not have to spare. A
// list is what a phone reads a library as.

import { useEffect, useMemo, useRef, useState } from "react";
import { progressOf } from "../../../shared/bookAnchor.ts";
import type { BookEntry } from "../../../shared/types.ts";
import { getBooks } from "../../books/api.ts";
import { localeNum, t, tf } from "../../i18n.ts";
import { useStore } from "../../state.ts";
import { usePhone } from "../context.ts";
import { IconBook, IconChevron } from "../icons.tsx";
import TopBar from "../TopBar.tsx";
import { useScrollMemory } from "../useScrollMemory.ts";
import { useVaultTick } from "../../vaultTick.ts";

function titleOf(entry: BookEntry): string {
  return entry.state?.title || entry.name.replace(/\.(pdf|epub)$/i, "");
}

function subOf(entry: BookEntry): string {
  if (entry.state?.author) return entry.state.author;
  const at = entry.path.lastIndexOf("/");
  return at === -1 ? "" : entry.path.slice(0, at);
}

export default function LibraryScreen({ onBack }: { onBack?: () => void }) {
  const phone = usePhone();
  useStore((s) => s.language);
  const tick = useVaultTick();
  const [books, setBooks] = useState<BookEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useScrollMemory(scrollRef);

  useEffect(() => {
    let live = true;
    getBooks()
      .then((r) => {
        if (!live) return;
        setBooks(r.books);
        setFailed(false);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [tick]);

  // Opened ones first, by when they were last touched; then the rest by name.
  const rows = useMemo(() => {
    const list = [...(books ?? [])];
    const opened = list.filter((b) => b.state !== null).sort((a, b) => b.mtimeMs - a.mtimeMs);
    const rest = list.filter((b) => b.state === null).sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
    return [...opened, ...rest];
  }, [books]);

  return (
    <div className="s-ph-screen s-ph-library" data-screen="library">
      <TopBar title={t("bookLibrary")} onBack={onBack} onTitle={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })} />
      <div className="s-ph-scroll" ref={scrollRef}>
        {failed ? (
          <p className="s-ph-empty">{t("bookShelfFailed")}</p>
        ) : books === null ? (
          <p className="s-ph-empty">{t("loading")}</p>
        ) : rows.length === 0 ? (
          <p className="s-ph-empty">{t("bookShelfEmpty")}</p>
        ) : (
          <ul className="s-ph-list" aria-label={t("bookLibrary")}>
            {rows.map((b) => {
              const pct = b.state ? Math.round(progressOf(b.state) * 100) : null;
              return (
                <li key={b.path}>
                  <button type="button" className="s-ph-row" data-path={b.path} onClick={() => phone.open({ kind: "surface", tab: b.path }, "push")}>
                    <span className="s-ph-row__glyph" aria-hidden="true">
                      <IconBook />
                    </span>
                    <span className="s-ph-hit__text">
                      <bdi className="s-ph-row__name" dir="auto">{titleOf(b)}</bdi>
                      <bdi className="s-ph-hit__snippet" dir="auto">{subOf(b)}</bdi>
                    </span>
                    {pct !== null && <span className="s-ph-row__count">{tf("trackerPercent", { percent: localeNum(pct) })}</span>}
                    <span className="s-ph-row__chev" aria-hidden="true">
                      <IconChevron />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
