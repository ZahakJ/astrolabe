// THE READER'S CHROME, ONCE, FOR BOTH READERS.
//
// There are two reading surfaces in this product now — a PDF one that paints
// pages onto canvases (client/books/BookReader.tsx) and an EPUB one that lays
// out the book's own markup (client/epub/EpubReader.tsx) — and they disagree
// about almost everything below the chrome. What they agree about completely
// is the chrome: a search line that slides up from the bottom, a contents
// panel on the leading edge, and a key sheet behind `?`. Three components,
// one stylesheet (client/styles/books.css), and the moment there are two
// copies of them they start to drift — one gets the Escape handling, the other
// gets the focus ring, and a reader who uses both formats learns two
// interfaces for one product.
//
// So they live here, generically: the contents panel takes ROWS with a label
// and a depth and calls back with an index, which a PDF reader turns into a
// page and an EPUB reader turns into a chapter href. The panel has no idea
// which it is talking to, and that is the point — it is a list, and the two
// readers are what know what a row means.

import { useEffect, useRef, useState } from "react";
import { localeNum, t, type I18nKey } from "../i18n.ts";

// ── The line at the bottom ──────────────────────────────────────────────────

interface LineProps {
  value: string;
  onChange(next: string): void;
  onSubmit(value: string): void;
  onCancel(): void;
}

/** `/` in either reader: one field, Enter searches, Escape closes. `dir` is
 *  auto because the thing being typed is a phrase out of the book, which may
 *  be in a different script from the interface around it. */
export function SearchLine({ value, onChange, onSubmit, onCancel }: LineProps) {
  return (
    <form
      className="s-book__line"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      <span className="s-book__prompt" aria-hidden="true">
        /
      </span>
      <input
        className="s-book__input"
        autoFocus
        type="search"
        value={value}
        dir="auto"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        aria-label={t("bookSearchLabel")}
        placeholder={t("bookSearchPlaceholder")}
      />
    </form>
  );
}

// ── The contents ────────────────────────────────────────────────────────────

/** One row of a book's own contents, as the panel needs it. `trailing` is
 *  whatever the format prints at the end of the row — a page number for a
 *  PDF, nothing for an EPUB, which has no page numbers to print. */
export interface OutlineRow {
  label: string;
  depth: number;
  trailing?: string;
  /** The row the reader is in right now, lit. Absent means "not known". */
  current?: boolean;
}

export function OutlinePanel({
  rows,
  onPick,
  onClose,
}: {
  /** Null while the contents are still being read. */
  rows: OutlineRow[] | null;
  onPick(index: number): void;
  onClose(): void;
}) {
  return (
    <aside className="s-book__outline" aria-label={t("bookOutline")}>
      <header className="s-book__outline-head">
        <h2>{t("bookOutline")}</h2>
        <button type="button" className="s-book__act" onClick={onClose} aria-label={t("closeViewer")}>
          <span aria-hidden="true">✕</span>
        </button>
      </header>
      {rows === null && <p className="s-book__message">{t("bookLoading")}</p>}
      {rows !== null && rows.length === 0 && <p className="s-book__message">{t("bookNoOutline")}</p>}
      <ol className="s-book__outline-list">
        {(rows ?? []).map((row, i) => (
          <li key={`${row.label}-${i}`} style={{ paddingInlineStart: `${row.depth * 14}px` }}>
            <button
              type="button"
              className={`s-book__outline-row${row.current ? " s-book__outline-row--lit" : ""}`}
              onClick={() => onPick(i)}
              aria-current={row.current ? "true" : undefined}
              dir="auto"
            >
              <span className="s-book__outline-title">{row.label}</span>
              {row.trailing !== undefined && row.trailing !== "" && (
                <span className="s-book__outline-page">{row.trailing}</span>
              )}
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}

/** A page number as a contents row prints it — in the instance's own numerals,
 *  because an Arabic instance prints ٢١٢ everywhere else and a contents page
 *  that suddenly says 212 reads as somebody else's software. */
export function outlinePage(page: number): string {
  return page > 0 ? localeNum(page) : "";
}

// ── The key sheet ───────────────────────────────────────────────────────────

export interface HelpRow {
  keys: string;
  label: I18nKey;
}

/** `?` in either reader. The ROWS are the caller's, because the two readers
 *  have different keys: an EPUB has no dual-page mode and no rotation, and a
 *  sheet that listed them would be a sheet that lies. */
export function HelpSheet({ title, rows, onClose }: { title: string; rows: readonly HelpRow[]; onClose(): void }) {
  return (
    <aside className="s-book__help" aria-label={title}>
      <header className="s-book__outline-head">
        <h2>{title}</h2>
        <button type="button" className="s-book__act" onClick={onClose} aria-label={t("closeViewer")}>
          <span aria-hidden="true">✕</span>
        </button>
      </header>
      <dl className="s-book__help-list">
        {rows.map((row) => (
          <div key={`${row.keys}-${row.label}`} className="s-book__help-row">
            <dt>
              <kbd>{row.keys}</kbd>
            </dt>
            <dd>{t(row.label)}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

// ── The phone's chrome ──────────────────────────────────────────────────────
//
// ON A PHONE THE READER WEARS ONE BAR (3.27.0). The audit found three chrome
// layers over a book on a 412px screen: the app's tab strip, this reader's
// seven-glyph bar with the title cut to "Sa…", and the status bar with its
// READING pill — and the page at 84% under all of it. The phone shell now
// draws no app chrome over a book at all (client/phone/screens/
// ReaderScreen.tsx), and the reader draws ONE 44px bar: the way back, the
// title, a scrubber through the pages (a PDF) or the chapters (an EPUB), and
// ⋯ — whose verbs (contents, search, night, cite, the sitting) the phone
// shows as its own action sheet, with the contents as a sheet of their own.
// The page takes everything under the bar. Zoom stays under the fingers
// (pinch) and on two touch buttons at the trailing corner.

/** What the phone shell lends a reader: its way back, its action sheet and
 *  its list sheet. The reader decides what goes in them; the shell decides
 *  how they look. Nothing in the books chunk imports the phone shell. */
export interface PhoneReaderHost {
  onBack(): void;
  /** The ⋯ verbs, as the phone's action sheet. */
  menu(title: string, rows: { label: string; note?: string; onSelect(): void }[]): void;
  /** The book's contents, as a sheet; a pick is an index into `rows`. */
  outline(title: string, rows: OutlineRow[], pick: (index: number) => void): void;
}

function BackGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

function DotsGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

/** The reader's one bar on a phone. `at`/`total` are pages or chapters; the
 *  scrubber moves the number under the thumb as it slides and jumps only on
 *  release, so a drag across a 600-page book is one render per frame of a
 *  label, not six hundred page loads. */
export function PhoneBar({
  title,
  at,
  total,
  unit,
  onBack,
  onScrub,
  onMenu,
}: {
  title: string;
  at: number;
  total: number;
  /** How the scrubber names a position to a screen reader: "Page 12 of 340". */
  unit: (at: number, total: number) => string;
  onBack(): void;
  onScrub(to: number): void;
  onMenu(): void;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const ref = useRef<HTMLInputElement | null>(null);
  const commit = useRef(onScrub);
  commit.current = onScrub;
  // The native `change` fires once, on release (or per key press): that is
  // the jump. React's onChange is the INPUT event and moves only the label.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const done = (): void => {
      const to = Number(el.value);
      setDrag(null);
      if (Number.isFinite(to)) commit.current(to);
    };
    el.addEventListener("change", done);
    return () => el.removeEventListener("change", done);
  }, [total]);
  const max = Math.max(1, total);
  const shown = Math.min(max, Math.max(1, drag ?? at));
  return (
    <header className="s-book__phonebar">
      <button type="button" className="s-book__phonebtn s-book__phoneback" onClick={onBack} aria-label={t("phBack")}>
        <BackGlyph />
      </button>
      <span className="s-book__phonetitle" dir="auto">
        {title}
      </span>
      {total > 1 && (
        <input
          ref={ref}
          className="s-book__scrub"
          type="range"
          min={1}
          max={max}
          step={1}
          value={shown}
          onChange={(e) => setDrag(Number(e.target.value))}
          aria-label={t("bookScrub")}
          aria-valuetext={unit(shown, max)}
        />
      )}
      <span className="s-book__scrubat" aria-hidden="true">
        {localeNum(shown)}/{localeNum(max)}
      </span>
      <button type="button" className="s-book__phonebtn" onClick={onMenu} aria-label={t("phMore")} aria-haspopup="menu">
        <DotsGlyph />
      </button>
    </header>
  );
}

/** Zoom (a PDF) or type size (an EPUB) by finger, at the trailing corner. */
export function PhoneZoom({ onOut, onIn, outLabel, inLabel }: { onOut(): void; onIn(): void; outLabel: string; inLabel: string }) {
  return (
    <div className="s-book__phonezoom" role="group" aria-label={t("bookZoomGroup")}>
      <button type="button" className="s-book__phonebtn" onClick={onOut} aria-label={outLabel}>
        −
      </button>
      <button type="button" className="s-book__phonebtn" onClick={onIn} aria-label={inLabel}>
        +
      </button>
    </div>
  );
}
