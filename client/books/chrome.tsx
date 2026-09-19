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
