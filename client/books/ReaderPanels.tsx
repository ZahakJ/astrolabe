// The reader's overlays: the command line, the go-to panel, the citation,
// margin-note and annotations panels, and the help table. BookReader opens
// them; each is a plain component over its props. Moved out of
// client/books/BookReader.tsx unchanged.

import type { BookHighlight } from "../../shared/bookAnchor.ts";
import { outlinePage, type OutlineRow as ChromeOutlineRow, type HelpRow } from "./chrome.tsx";
import type { CiteTarget } from "./cite.ts";
import type { OutlineEntry } from "../../shared/highlightsNote.ts";
import { localeNum, t, tf } from "../i18n.ts";
import { parseFraction, parseNumber } from "./commands.ts";
import { useDialog } from "../a11y.ts";
import { useRef, useState } from "react";

/** One entry of the book's contents — the outline walk is client/books/
 *  outline.ts, shared with the shelf's "Highlights → note". */
export type OutlineRow = OutlineEntry;

/** A citation the reader has assembled and not yet written. Held rather than
 *  written straight through because the confirmation's quote field is
 *  EDITABLE, and because the highlights are only saved if the reader goes
 *  ahead — a cancelled citation must not leave ink on the page. */
export interface PendingCite {
  /** One per page the selection crossed, already assembled by column geometry
   *  and carrying the id its citation link will name. */
  marks: BookHighlight[];
  /** The quotation as it will be written — the reader's to edit. */
  quote: string;
  target: string | null;
  /** Open with the note picker focused (`Shift+C`) rather than the quote. */
  picking: boolean;
}

// ── Overlays ────────────────────────────────────────────────────────────────

interface LineProps {
  value: string;
  onChange(next: string): void;
  onSubmit(value: string): void;
  onCancel(): void;
}

export function CommandLine({ value, onChange, onSubmit, onCancel }: LineProps) {
  return (
    <form
      className="s-book__line"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      <span className="s-book__prompt" aria-hidden="true">
        :
      </span>
      <input
        className="s-book__input"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        aria-label={t("bookCommandLabel")}
        placeholder={t("bookCommandPlaceholder")}
      />
    </form>
  );
}

/** The book's contents as the shared panel wants them (client/books/
 *  chrome.tsx): a label, a depth, and the page printed at the end of the row.
 *  The panel calls back with an INDEX, which is turned back into a page here
 *  — the panel is a list and does not know what a row means. */
export function outlineRows(rows: OutlineRow[] | null): ChromeOutlineRow[] | null {
  return rows === null ? null : rows.map((row) => ({ label: row.title, depth: row.depth, trailing: outlinePage(row.page) }));
}

/**
 * The go-to panel: one field that takes everything the reader might mean by
 * "take me to…", and the contents listed under it so a chapter is a click or
 * an arrow key away.
 *
 * The field's grammar IS the command line's page grammar — `212`, `+3`, `-3`,
 * `40%`, in Latin or Eastern Arabic digits — plus a chapter name, which
 * filters the list as it is typed. Enter takes the number when the field is
 * one, and the lit chapter otherwise; the arrow keys move the light. The
 * panel says what Enter will do before it is pressed, because a reader who
 * typed `40` and meant `40%` deserves to see "page 40" first.
 */
export function GotoPanel({
  page,
  pages,
  rows,
  onPick,
  onClose,
}: {
  page: number;
  pages: number;
  rows: OutlineRow[] | null;
  onPick(page: number): void;
  onClose(): void;
}) {
  const [text, setText] = useState("");
  const [lit, setLit] = useState(0);
  const target = targetOf(text, page, pages);
  const needle = text.trim().toLowerCase();
  // A numeric field leaves the whole contents on show — the list is then a
  // second door, not a filter — and a word narrows it.
  const shown = (rows ?? []).filter((row) => target !== null || needle === "" || row.title.toLowerCase().includes(needle));
  const litIndex = Math.min(lit, Math.max(0, shown.length - 1));
  const submit = () => {
    if (target !== null) onPick(target);
    else if (shown[litIndex]) onPick(shown[litIndex].page || 1);
  };
  return (
    <aside className="s-book__outline s-book__goto" aria-label={t("bookGotoTitle")}>
      <header className="s-book__outline-head">
        <h2>{t("bookGotoTitle")}</h2>
        <button type="button" className="s-book__act" onClick={onClose} aria-label={t("closeViewer")}>
          <span aria-hidden="true">✕</span>
        </button>
      </header>
      <form
        className="s-book__goto-field"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          className="s-book__input"
          autoFocus
          value={text}
          dir="auto"
          onChange={(e) => {
            setText(e.target.value);
            setLit(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setLit(Math.min(shown.length - 1, litIndex + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setLit(Math.max(0, litIndex - 1));
            }
          }}
          aria-label={t("bookGotoLabel")}
          placeholder={t("bookGotoPlaceholder")}
        />
        <p className="s-book__goto-hint" aria-live="polite">
          {target !== null
            ? tf("bookGotoTarget", { page: localeNum(target) })
            : shown[litIndex]
              ? tf("bookGotoChapter", { title: shown[litIndex].title })
              : tf("bookPageOf", { page: localeNum(page), total: localeNum(pages) })}
        </p>
      </form>
      {rows === null && <p className="s-book__message">{t("bookLoading")}</p>}
      {rows !== null && rows.length === 0 && <p className="s-book__message">{t("bookNoOutline")}</p>}
      {rows !== null && rows.length > 0 && shown.length === 0 && (
        <p className="s-book__message">{t("bookGotoNoChapter")}</p>
      )}
      <ol className="s-book__outline-list">
        {shown.map((row, i) => (
          <li key={`${row.title}-${i}`} style={{ paddingInlineStart: `${row.depth * 14}px` }}>
            <button
              type="button"
              className={`s-book__outline-row${target === null && i === litIndex ? " s-book__outline-row--lit" : ""}`}
              onClick={() => onPick(row.page || 1)}
              onMouseEnter={() => setLit(i)}
              dir="auto"
            >
              <span className="s-book__outline-title">{row.title}</span>
              {row.page > 0 && <span className="s-book__outline-page">{localeNum(row.page)}</span>}
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}

/** Where the go-to field points, or null when it names no page: a bare number
 *  is a page, `+3`/`-3` step from here, `40%` is a proportion of the book. */
function targetOf(text: string, page: number, pages: number): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const fraction = parseFraction(trimmed);
  if (fraction !== null) return pageAtFraction(fraction, pages);
  const n = parseNumber(trimmed);
  if (n === null) return null;
  const relative = trimmed.startsWith("+") || trimmed.startsWith("-");
  const wanted = Math.round(relative ? page + n : n);
  return Math.min(Math.max(1, wanted), Math.max(1, pages));
}

/** The page a proportion lands on. 0% is the first page and 100% the last,
 *  so a reader "halfway" through a 300-page book is on page 150, not 151. */
export function pageAtFraction(percent: number, pages: number): number {
  if (pages <= 1) return 1;
  return Math.min(pages, Math.max(1, 1 + Math.round(((pages - 1) * percent) / 100)));
}

// ── Annotating and citing ───────────────────────────────────────────────────

/**
 * The confirmation `c` shows before one character reaches a note.
 *
 * THE QUOTE FIELD IS EDITABLE, AND THAT IS THE POINT OF THE PANEL. A PDF page
 * has no reading order in it — only glyphs at coordinates — so assembling a
 * passage is inference, and inference is occasionally wrong: a running head
 * caught in the selection, a footnote marker, a column detector that read a
 * wide table as two columns. Every one of those produces a quotation that is
 * fluent, plausible and NOT WHAT THE BOOK SAYS, and a wrong quotation that
 * looks right is the worst thing this reader could put into someone's writing.
 * So it is shown, in full, in a field, before it is written.
 *
 * The note picker is here too rather than in a dialog of its own: `c` opens
 * this with the quote focused and the note beside you already chosen, and
 * `Shift+C` opens the same panel with the picker focused. One surface, two
 * doors, nothing to learn twice.
 */
export function CitePanel({
  cite,
  targets,
  onSubmit,
  onCancel,
}: {
  cite: PendingCite;
  targets: CiteTarget[];
  onSubmit(quote: string, target: string): void;
  onCancel(): void;
}) {
  const [quote, setQuote] = useState(cite.quote);
  const [target, setTarget] = useState(cite.target ?? targets[0]?.path ?? "");
  const sheetRef = useRef<HTMLFormElement>(null);
  // A sheet over a page of a book, with the reader's own words in it: Tab must
  // not walk out into the page underneath, and cancelling must put the reader
  // back where they were marking. `manualFocus` — the fields below choose for
  // themselves which one opens focused, and which one it is depends on whether
  // the reader is still picking a destination.
  useDialog(sheetRef, { manualFocus: true });
  return (
    <form
      ref={sheetRef}
      className="s-book__sheet"
      role="dialog"
      aria-modal="true"
      aria-label={t("bookCiteTitle")}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(quote, target);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
        // Ctrl+Enter files it from inside the textarea, where a bare Enter has
        // to keep meaning "new line" — a quotation is prose and prose has
        // paragraphs in it.
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          onSubmit(quote, target);
        }
      }}
    >
      <label className="s-book__field">
        <span className="s-book__field-name">{t("bookCiteInto")}</span>
        <select
          className="s-book__select"
          autoFocus={cite.picking}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          {targets.map((option) => (
            <option key={option.path} value={option.path}>
              {option.title}
            </option>
          ))}
        </select>
      </label>
      <label className="s-book__field">
        <span className="s-book__field-name">{t("bookCiteQuoteLabel")}</span>
        <textarea
          className="s-book__quote"
          autoFocus={!cite.picking}
          value={quote}
          dir="auto"
          rows={6}
          onChange={(e) => setQuote(e.target.value)}
        />
      </label>
      <div className="s-book__sheet-acts">
        <button type="button" className="s-book__button" onClick={onCancel}>
          {t("cancel")}
        </button>
        <button type="submit" className="s-book__button s-book__button--primary" disabled={target === ""}>
          {t("save")}
        </button>
      </div>
    </form>
  );
}

/** A note in the margin. The one place in this reader where the reader's own
 *  words go, so it is a plain textarea and nothing else. */
export function MarginNotePanel({
  mark,
  onSubmit,
  onCancel,
}: {
  mark: BookHighlight;
  onSubmit(note: string): void;
  onCancel(): void;
}) {
  const [note, setNote] = useState(mark.note);
  const sheetRef = useRef<HTMLFormElement>(null);
  // Same terms as the citation sheet above: the ring stays in, and Cancel
  // hands the reader back to the passage they marked.
  useDialog(sheetRef, { manualFocus: true });
  return (
    <form
      ref={sheetRef}
      className="s-book__sheet"
      role="dialog"
      aria-modal="true"
      aria-label={t("bookMarginNote")}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(note);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          onSubmit(note);
        }
      }}
    >
      <blockquote className="s-book__sheet-quote" dir="auto">
        {mark.text}
      </blockquote>
      <label className="s-book__field">
        <span className="s-book__field-name">{t("bookMarginNote")}</span>
        <textarea
          className="s-book__quote"
          autoFocus
          value={note}
          dir="auto"
          rows={4}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="s-book__sheet-acts">
        <button type="button" className="s-book__button" onClick={onCancel}>
          {t("cancel")}
        </button>
        <button type="submit" className="s-book__button s-book__button--primary">
          {t("save")}
        </button>
      </div>
    </form>
  );
}

/** Every passage marked in this book — the panel `A` opens.
 *
 *  It is also the accessibility answer to the ink: a coloured rectangle over a
 *  page is invisible to a screen reader and unreachable from a keyboard, so
 *  the passages exist HERE as text, in reading order, with a control each for
 *  the three things one can do to them. Nothing in this reader is reachable
 *  only by pointing at it. */
export function AnnotationsPanel({
  marks,
  onGo,
  onNote,
  onDelete,
  onClose,
}: {
  marks: BookHighlight[];
  onGo(mark: BookHighlight): void;
  onNote(mark: BookHighlight): void;
  onDelete(mark: BookHighlight): void;
  onClose(): void;
}) {
  return (
    <aside className="s-book__outline s-book__annots" aria-label={t("bookOutline")}>
      <header className="s-book__outline-head">
        <h2>{t("bookAnnotations")}</h2>
        <button type="button" className="s-book__act" onClick={onClose} aria-label={t("bookAnnotations")}>
          <span aria-hidden="true">✕</span>
        </button>
      </header>
      {marks.length === 0 && <p className="s-book__message">{t("bookNoAnnotations")}</p>}
      <ol className="s-book__outline-list">
        {marks.map((mark) => (
          <li key={mark.id} className="s-book__annot">
            <button type="button" className="s-book__annot-body" onClick={() => onGo(mark)} dir="auto">
              <span className="s-book__ink-chip" data-ink={mark.ink} aria-hidden="true" />
              <span className="s-book__annot-page">{localeNum(mark.page)}</span>
              <span className="s-book__annot-text">{mark.text}</span>
              {mark.note !== "" && <span className="s-book__annot-note">{mark.note}</span>}
            </button>
            <span className="s-book__annot-acts">
              <button
                type="button"
                className="s-book__act"
                onClick={() => onNote(mark)}
                aria-label={t("bookMarginNote")}
              >
                <span aria-hidden="true">✎</span>
              </button>
              <button
                type="button"
                className="s-book__act"
                onClick={() => onDelete(mark)}
                aria-label={t("delete")}
              >
                <span aria-hidden="true">✕</span>
              </button>
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

/** The reader's own key sheet. Deliberately local rather than a section of the
 *  app-wide sheet: these keys are live only while a book is open, and a global
 *  list that describes them everywhere is a list that lies most of the time. */
export const HELP_ROWS: HelpRow[] = [
  { keys: "j k", label: "bookKeyScroll" },
  { keys: "J K", label: "bookKeyPageStep" },
  { keys: "Space", label: "bookKeyPage" },
  { keys: "gg G", label: "bookKeyFirstLast" },
  { keys: "12G", label: "bookKeyGoto" },
  { keys: "p", label: "bookKeyGoPage" },
  { keys: "/", label: "bookKeySearch" },
  { keys: "n N", label: "bookKeyNextMatch" },
  { keys: "o", label: "bookKeyOutline" },
  { keys: "+ -", label: "bookKeyZoom" },
  { keys: "a s", label: "bookKeyFit" },
  { keys: "d", label: "bookKeyDual" },
  { keys: "i", label: "bookKeyInvert" },
  { keys: "r", label: "bookKeyRotate" },
  { keys: "m '", label: "bookKeyMarks" },
  { keys: "h H", label: "bookKeyHighlight" },
  { keys: "c C", label: "bookKeyCite" },
  { keys: "e", label: "bookKeyMarginNote" },
  { keys: "x", label: "bookKeyUnhighlight" },
  { keys: "A", label: "bookKeyAnnotations" },
  { keys: ":", label: "bookKeyCommand" },
  { keys: "z", label: "bookKeyZen" },
  { keys: "l", label: "bookKeyLibrary" },
  { keys: "q", label: "bookKeyClose" },
  // A command, not a key — listed here because the title-bar button that
  // does the same only appears once a page has been turned, and the help
  // sheet is where a reader looks for what the reader can do.
  { keys: ":end", label: "bookKeyEndSession" },
  { keys: "?", label: "bookKeyHelp" },
];
