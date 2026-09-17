// THE MONTH GRID — the sidebar's Calendar section and the top of the Sigils
// page, one component.
//
// Drawn in the site's calendar (shared/calendar.ts): a Gregorian month on a
// Gregorian instance, a Hijri month on a Hijri one, and on an instance that
// prints BOTH the leading calendar's month with the other's day number small
// in each cell's corner — and nowhere else. The first column is the site
// language's first day (Monday in English, Saturday in Arabic; the Sigils
// card's own rule, shared/routine.ts `weekOrder`), the month and day names
// are Intl's in the chrome language (client/dates.ts), the digits follow the
// instance's numerals. Nothing here hand-rolls a name.
//
// A cell is DOTTED when a daily note exists for that day — read off the
// tree through the daily folder and format (client/daily.ts), which is a
// string compare per note and nothing stored — and carries a second mark
// when a sigil logged that day or a book was read (`loggedDaysOf`; the caller
// hands the set in: the Sigils page already holds every log, the sidebar
// asks once). Today is ringed. A click
// opens the day's note through the daily-note command's own door, so a note
// created from the grid is templated exactly as Ctrl/Cmd Alt D would.
//
// ONE TAB STOP for the whole grid, the tag shelf's argument: forty-two
// buttons would be forty-two stops in a pane the reader tabs THROUGH. The
// arrows walk the days, the vertical ones the weeks, Home/End the row,
// PageUp/PageDown the month; crossing an edge turns the page. Left and
// right are MIRRORED under RTL, because the cell to the visual left of
// this one is tomorrow there.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addMonths, firstOfMonth, monthCells, noon, ymdOf, type GridCalendar, type GridCell } from "../../shared/calendar.ts";
import { isoDate, weekOrder, type Weekday } from "../../shared/routine.ts";
import { dailyNotesByDay, openPeriodicNoteAt, usePeriodic } from "../daily.ts";
import { dateNamesLocale } from "../../shared/dates.ts";
import { getDateBothStyle, getDateCalendar, siteDate, siteDateIn } from "../dates.ts";
import { localeNum, t, tf, type I18nKey } from "../i18n.ts";
import { useStore } from "../state.ts";
import "../styles/calendar.css";

export interface CalendarGridProps {
  /** ISO days that carry a sigil log line or a reading session — the second
   *  mark (`loggedDaysOf`). */
  logged?: ReadonlySet<string>;
  /** The sidebar's drawer closes itself after a pick; the page does not. */
  onOpened?: () => void;
}

const WEEKDAY_LABEL: Record<Weekday, I18nKey> = {
  mon: "weekdayMon",
  tue: "weekdayTue",
  wed: "weekdayWed",
  thu: "weekdayThu",
  fri: "weekdayFri",
  sat: "weekdaySat",
  sun: "weekdaySun",
};

/** Which calendar leads the grid, and which (if any) sits in the corner —
 *  the `both` order the site already chose for every printed date. */
function gridCalendars(lang: "en" | "ar"): { primary: GridCalendar; secondary: GridCalendar | null } {
  const cal = getDateCalendar();
  if (cal === "gregorian") return { primary: "gregorian", secondary: null };
  if (cal === "hijri") return { primary: "hijri", secondary: null };
  const order = getDateBothStyle().order;
  const hijriFirst = order === "auto" ? lang === "ar" : order === "hijri-first";
  return hijriFirst ? { primary: "hijri", secondary: "gregorian" } : { primary: "gregorian", secondary: "hijri" };
}

function isRtl(): boolean {
  return getComputedStyle(document.documentElement).direction === "rtl";
}

export default function CalendarGrid({ logged, onOpened }: CalendarGridProps) {
  const tree = useStore((s) => s.tree);
  const lang = useStore((s) => s.language);
  const locale = useStore((s) => s.blogLocale);
  // Read per render, not memoised: the calendar setting changes under this
  // grid when the owner saves Settings, and the store re-renders us for it.
  const calendarSetting = useStore((s) => s.dateCalendar);
  const { primary, secondary } = useMemo(() => gridCalendars(lang), [lang, calendarSetting]);
  const order = useMemo(() => weekOrder(lang), [lang]);
  const today = isoDate(new Date());

  const [first, setFirst] = useState(() => firstOfMonth(new Date(), primary));
  // A calendar switch re-anchors on today's month in the NEW calendar: the
  // first of Safar is nothing in Gregorian.
  useEffect(() => setFirst(firstOfMonth(new Date(), primary)), [primary]);

  const rows = useMemo(() => monthCells(first, primary, order), [first, primary, order]);
  // Re-read when the tree moves AND when the periodic settings do: the daily
  // folder can change under this grid from Settings → Vault.
  const periodic = usePeriodic();
  const notes = useMemo(() => dailyNotesByDay(tree), [tree, periodic]);

  // The single tab stop: today when it is on the page, else the month's
  // first day. Kept across month turns when the reader is walking with the
  // keyboard (`pendingFocus`), reset otherwise.
  const inMonth = useMemo(() => rows.flat().filter((c) => c.inMonth), [rows]);
  const [cursor, setCursor] = useState(today);
  const pendingFocus = useRef<string | null>(null);
  const gridRef = useRef<HTMLTableElement | null>(null);
  useEffect(() => {
    if (pendingFocus.current !== null) return;
    setCursor(inMonth.some((c) => c.iso === today) ? today : inMonth[0]?.iso ?? today);
  }, [inMonth, today]);
  useEffect(() => {
    const iso = pendingFocus.current;
    if (iso === null) return;
    pendingFocus.current = null;
    setCursor(iso);
    gridRef.current?.querySelector<HTMLButtonElement>(`button[data-iso="${iso}"]`)?.focus();
  }, [rows]);

  // Month names in the CHROME language (an English reader on an Arabic
  // instance reads "September"), digits per the instance — `dateNamesLocale`
  // is the same choice `siteDate` makes; `siteDateIn` pins the calendar.
  const namesLocale = dateNamesLocale(locale, lang);
  const title = siteDateIn(first, namesLocale, primary, { month: "long", year: "numeric" });

  const turn = useCallback(
    (offset: number): void => setFirst((f) => addMonths(f, offset, primary)),
    [primary],
  );

  /** Move the tab stop to `date`, turning the page when it is off it. */
  const moveTo = useCallback(
    (date: Date): void => {
      const iso = isoDate(date);
      const onPage = rows.flat().some((c) => c.iso === iso && c.inMonth);
      if (onPage) {
        setCursor(iso);
        gridRef.current?.querySelector<HTMLButtonElement>(`button[data-iso="${iso}"]`)?.focus();
        return;
      }
      pendingFocus.current = iso;
      setFirst(firstOfMonth(date, primary));
    },
    [rows, primary],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTableElement>): void => {
      const at = noon(new Date(`${cursor}T12:00:00`));
      const step = (days: number): Date => new Date(at.getFullYear(), at.getMonth(), at.getDate() + days, 12);
      const horizontal = isRtl() ? -1 : 1;
      const row = rows.find((r) => r.some((c) => c.iso === cursor));
      const col = row ? row.findIndex((c) => c.iso === cursor) : 0;
      switch (e.key) {
        case "ArrowRight": moveTo(step(horizontal)); break;
        case "ArrowLeft": moveTo(step(-horizontal)); break;
        case "ArrowDown": moveTo(step(7)); break;
        case "ArrowUp": moveTo(step(-7)); break;
        case "Home": moveTo(step(-col)); break;
        case "End": moveTo(step(6 - col)); break;
        case "PageUp":
        case "PageDown": {
          // The same day of the neighbouring month, clipped to its length.
          const next = addMonths(first, e.key === "PageUp" ? -1 : 1, primary);
          const day = ymdOf(at, primary).day;
          const cells = monthCells(next, primary, order).flat().filter((c) => c.inMonth);
          moveTo(cells[Math.min(day, cells.length) - 1].date);
          break;
        }
        default:
          return;
      }
      e.preventDefault();
    },
    [cursor, rows, first, primary, order, moveTo],
  );

  const pick = useCallback(
    (cell: GridCell): void => {
      setCursor(cell.iso);
      void openPeriodicNoteAt("day", cell.date).then(() => onOpened?.());
    },
    [onOpened],
  );

  return (
    <div className="s-cal" data-testid="calendar-grid">
      <div className="s-cal__bar">
        <button type="button" className="s-cal__nav" aria-label={t("calendarPrevMonth")} title={t("calendarPrevMonth")} onClick={() => turn(-1)}>
          <span className="s-cal__chev" aria-hidden="true">‹</span>
        </button>
        <button
          type="button"
          className="s-cal__title"
          title={t("calendarToday")}
          aria-label={tf("calendarTitleAria", { month: title })}
          onClick={() => moveTo(new Date())}
        >
          {title}
        </button>
        <button type="button" className="s-cal__nav" aria-label={t("calendarNextMonth")} title={t("calendarNextMonth")} onClick={() => turn(1)}>
          <span className="s-cal__chev" aria-hidden="true">›</span>
        </button>
      </div>
      <table ref={gridRef} className="s-cal__table" role="grid" aria-label={title} onKeyDown={onKeyDown}>
        <thead>
          <tr>
            {/* The column heads are Intl's weekday names in the chrome
                language, narrowed: two letters in English ("Mo"), the one
                letter Arabic calendars print («ن» for الاثنين). The full
                name is the cell's `abbr`, which is what a screen reader
                announces for the column. */}
            {rows[0].map((cell, i) => (
              <th key={order[i]} scope="col" className="s-cal__wd" abbr={t(WEEKDAY_LABEL[order[i]])}>
                {lang === "ar" ? siteDateIn(cell.date, namesLocale, primary, { weekday: "narrow" }) : siteDateIn(cell.date, namesLocale, primary, { weekday: "short" }).slice(0, 2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0].iso}>
              {row.map((cell) => {
                const note = notes.get(cell.iso) ?? null;
                const isLogged = logged?.has(cell.iso) ?? false;
                const isToday = cell.iso === today;
                const dayName = siteDate(cell.date, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
                const label = [dayName, note ? t("calendarCellNote") : null, isLogged ? t("calendarCellLogged") : null].filter(Boolean).join(", ");
                const cls = [
                  "s-cal__day",
                  cell.inMonth ? "" : "s-cal__day--out",
                  isToday ? "is-today" : "",
                  note ? "has-note" : "",
                  isLogged ? "has-log" : "",
                ].filter(Boolean).join(" ");
                return (
                  <td key={cell.iso} role="gridcell" className="s-cal__cell">
                    <button
                      type="button"
                      className={cls}
                      data-iso={cell.iso}
                      tabIndex={cell.iso === cursor ? 0 : -1}
                      aria-label={label}
                      aria-current={isToday ? "date" : undefined}
                      title={label}
                      onClick={() => pick(cell)}
                    >
                      <span className="s-cal__num">{localeNum(cell.day)}</span>
                      {secondary !== null && <span className="s-cal__alt" aria-hidden="true">{localeNum(ymdOf(cell.date, secondary).day)}</span>}
                      <span className="s-cal__marks" aria-hidden="true">
                        {note && <span className="s-cal__dot s-cal__dot--note" />}
                        {isLogged && <span className="s-cal__dot s-cal__dot--log" />}
                      </span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
