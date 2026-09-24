// THE CALENDAR PAGE. The month, full width, with what every day held.
//
// The month used to be a 440px grid at the top of the Sigils page, where it
// could say which days had a note and nothing else about them — the owner:
// "I might honestly remove the calendar view from the sigil window… kinda
// weird and useless in the sigils window". It is a page of its own now
// (`CALENDAR_TAB`, `/calendar`, a door in the status bar beside the seal and
// the ring), a workspace tab like the Sigils page and a lazy chunk with its
// own stylesheet. The SIDEBAR's Calendar section is untouched: that one is a
// date picker, this one is a month you read.
//
// WHAT A CELL SAYS comes from shared/dayAgenda.ts, which is pure and adds up
// only what the vault and the device already keep — the daily note from the
// tree, the sigils that logged that day with the status their own cards give
// them, the cards graded from the device's Orbits log, the sittings from the
// trackers' `sessions:` lines. Nothing is stored: a calendar that kept its
// own ledger would be a second truth about the sigils and the trackers, and
// "the note is the state" allows no second truth.
//
// ONE CONTROL PER CELL, and the DAY PANE is where you act. A cell is one
// button — the number, the marks and a few lines of what the day holds — and
// pressing it SELECTS the day; the pane beside the grid (under it on a
// phone) then shows that day in full, every row a door to the note it came
// from, led by "Open the day's note" / "Create the day's note", which goes
// through `openPeriodicNoteAt` — the same door Ctrl/Cmd Alt D uses, template
// and all. A single click does not silently write a file; a labelled button
// does, and says so first. Double-clicking a cell is the shortcut for
// readers who would rather not travel.
//
// ONE TAB STOP for the grid, the sidebar grid's argument (forty-two buttons
// would be forty-two stops): the arrows walk the days, the vertical ones the
// weeks, Home/End the row, PageUp/PageDown the month, and crossing an edge
// turns the page. Left and right are MIRRORED under RTL, because the cell to
// the visual left of this one is tomorrow there. The pane that follows is
// the second stop and holds every link.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addMonths, firstOfMonth, monthCells, noon, ymdOf, type GridCalendar, type GridCell } from "../../shared/calendar.ts";
import { agendaBands, agendaByDay, emptyAgenda, gradedOn, type DayAgenda } from "../../shared/dayAgenda.ts";
import { EVERYTHING_ELSE } from "../../shared/decks.ts";
import { dateNamesLocale } from "../../shared/dates.ts";
import { isNotePath, noteTitleOf } from "../../shared/noteFormat.ts";
import { isoDate, weekOrder, type DayStatus, type Weekday } from "../../shared/routine.ts";
import type { RoutineMeta, TrackerMeta } from "../../shared/types.ts";
import { getRoutines, getTrackers } from "../api.ts";
import { dailyNotesByDay, openPeriodicNoteAt, usePeriodic } from "../daily.ts";
import { getDateBothStyle, getDateCalendar, siteDate, siteDateIn } from "../dates.ts";
import { countPhrase, localeNum, t, tf, type I18nKey } from "../i18n.ts";
import { readLog, type LogEntry } from "../orbits/log.ts";
import { useStore } from "../state.ts";
import { formatDuration } from "../trackerUnits.ts";
import "../styles/calendarpage.css";

/** The vault event the Sigils page listens to as well: a box ticked in the
 *  editor is this page's business too. */
const VAULT_EVENT = "astrolabe:vault";

const WEEKDAY_LABEL: Record<Weekday, I18nKey> = {
  mon: "weekdayMon",
  tue: "weekdayTue",
  wed: "weekdayWed",
  thu: "weekdayThu",
  fri: "weekdayFri",
  sat: "weekdaySat",
  sun: "weekdaySun",
};

const STATUS_LABEL: Record<DayStatus, I18nKey> = {
  complete: "routineDayComplete",
  partial: "routineDayPartial",
  missed: "routineDayMissed",
  rest: "routineDayRest",
  none: "routineDayNone",
};

/** How many rows a cell prints before it says "and N more". Four is what
 *  fits a cell at the widths the grid is drawn at without the row heights
 *  arguing with each other. */
const ROWS_PER_CELL = 4;

/** Which calendar leads the grid, and which (if any) sits in the corner —
 *  the `both` order the site already chose for every printed date
 *  (components/CalendarGrid.tsx makes the same choice; the rule is the
 *  site's, not the surface's). */
function gridCalendars(lang: "en" | "ar"): { primary: GridCalendar; secondary: GridCalendar | null } {
  const cal = getDateCalendar();
  if (cal === "gregorian") return { primary: "gregorian", secondary: null };
  if (cal === "hijri") return { primary: "hijri", secondary: null };
  const order = getDateBothStyle().order;
  const hijriFirst = order === "auto" ? lang === "ar" : order === "hijri-first";
  return hijriFirst ? { primary: "hijri", secondary: "gregorian" } : { primary: "gregorian", secondary: "hijri" };
}

/** "27 Oct" — a band's edge, short enough to sit twice on one row. */
function bandDate(iso: string, locale: string): string {
  return siteDate(`${iso}T12:00:00`, locale, { day: "numeric", month: "short" }) || iso;
}

function isRtl(): boolean {
  return getComputedStyle(document.documentElement).direction === "rtl";
}

/** A deck's name: the note's title, or the chrome's word for the implicit
 *  deck, which is not a note and is named for what it is. */
function deckName(path: string): string {
  if (path === EVERYTHING_ELSE || !isNotePath(path)) return t("orbitsEverything");
  return noteTitleOf(path);
}

/** Everything the page reads, in one shape — reloaded together so a cell
 *  never shows half a day. */
interface Sources {
  routines: RoutineMeta[];
  trackers: TrackerMeta[];
  grades: LogEntry[];
}

const NO_SOURCES: Sources = { routines: [], trackers: [], grades: [] };

/** How a shell draws the day pane when it does not sit beside the grid. The
 *  phone shell passes one: the pane becomes a sheet raised by a tap on a day
 *  (client/phone/screens/CalendarScreen.tsx), because a 412px screen has no
 *  "beside" and "under the month" is a scroll away from the finger that
 *  chose the day. Absent, the pane is laid out as it always was. */
export type DayPaneHost = (pane: ReactNode, label: string, close: () => void) => ReactNode;

/** `timelineDoor`: the page's own door to the Timeline (3.28), the same days
 *  read as one list. The phone keeps that door in its top bar's ⋯ and passes
 *  false. */
export default function CalendarView({ dayHost, timelineDoor = true }: { dayHost?: DayPaneHost; timelineDoor?: boolean }) {
  const tree = useStore((s) => s.tree);
  const lang = useStore((s) => s.language);
  const locale = useStore((s) => s.blogLocale);
  const openNote = useStore((s) => s.openNote);
  // Read per render, not memoised: the calendar setting changes under this
  // page when the owner saves Settings, and the store re-renders us for it.
  const calendarSetting = useStore((s) => s.dateCalendar);
  const { primary, secondary } = useMemo(() => gridCalendars(lang), [lang, calendarSetting]);
  const order = useMemo(() => weekOrder(lang), [lang]);
  const today = isoDate(new Date());

  const [first, setFirst] = useState(() => firstOfMonth(new Date(), primary));
  // A calendar switch re-anchors on today's month in the NEW calendar: the
  // first of Safar is nothing in Gregorian.
  useEffect(() => setFirst(firstOfMonth(new Date(), primary)), [primary]);

  const rows = useMemo(() => monthCells(first, primary, order), [first, primary, order]);
  const days = useMemo(() => rows.flat().map((c) => c.iso), [rows]);

  // ── What the month held ──────────────────────────────────────────────────
  const [sources, setSources] = useState<Sources>(NO_SOURCES);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    const read = (): void => {
      // A visitor has no /api/routines (401, the books shelf's rule) and no
      // Orbits log worth reading; both refusals are answered with nothing,
      // and the daily notes from the tree still draw the month.
      void Promise.all([getRoutines().catch(() => []), getTrackers().catch(() => [])]).then(([routines, trackers]) => {
        if (!alive) return;
        setSources({ routines: routines.filter((r) => !r.template), trackers, grades: readLog() });
        setLoaded(true);
      });
    };
    read();
    // Every vault frame would re-read every sigil and tracker in the vault;
    // a burst of autosaves is one re-read, a beat after the last of them.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onVault = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(read, 400);
    };
    window.addEventListener(VAULT_EVENT, onVault);
    return () => {
      alive = false;
      window.removeEventListener(VAULT_EVENT, onVault);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Re-read when the tree moves AND when the periodic settings do: the daily
  // folder can change under this page from Settings → Vault.
  const periodic = usePeriodic();
  const notes = useMemo(() => dailyNotesByDay(tree), [tree, periodic]);
  const agenda = useMemo(
    () => agendaByDay(days, { notes, sigils: sources.routines, trackers: sources.trackers, grades: sources.grades }, today),
    [days, notes, sources, today],
  );
  // THE MONTHS AHEAD, READ AS STRETCHES. A course's projected steps are one
  // faint line per cell, which answers "what do I do on the 27th" and not
  // "when does lesson 3 happen". The band strip under the grid answers the
  // second question, out of the SAME projection, so the two cannot disagree.
  const bands = useMemo(() => agendaBands(sources.routines, days, today), [sources.routines, days, today]);

  // ── The cursor, which is also the selection ──────────────────────────────
  const inMonth = useMemo(() => rows.flat().filter((c) => c.inMonth), [rows]);
  const [cursor, setCursor] = useState(today);
  /** The day pane's sheet is up (only with a `dayHost`). */
  const [dayOpen, setDayOpen] = useState(false);
  const pick = useCallback((iso: string): void => {
    setCursor(iso);
    if (dayHost) setDayOpen(true);
  }, [dayHost]);
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
  // instance reads "September"), digits per the instance.
  const namesLocale = dateNamesLocale(locale, lang);
  const title = siteDateIn(first, namesLocale, primary, { month: "long", year: "numeric" });

  const turn = useCallback((offset: number): void => setFirst((f) => addMonths(f, offset, primary)), [primary]);

  /** Move the cursor to `date`, turning the page when it is off it. */
  const moveTo = useCallback(
    (date: Date): void => {
      const iso = isoDate(date);
      if (rows.flat().some((c) => c.iso === iso && c.inMonth)) {
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
      const step = (d: number): Date => new Date(at.getFullYear(), at.getMonth(), at.getDate() + d, 12);
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

  const openDay = useCallback(
    (iso: string): void => {
      void openPeriodicNoteAt("day", noon(new Date(`${iso}T12:00:00`)));
    },
    [],
  );

  const selected = agenda.get(cursor) ?? emptyAgenda(cursor);
  const selectedLong = siteDate(`${cursor}T12:00:00`, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="s-calpage" data-testid="calendar-page">
      <header className="s-calpage__head">
        <div className="s-calpage__headtext">
          <p className="s-calpage__today">{siteDate(`${today}T12:00:00`, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          <h1 className="s-calpage__h1">{t("calendar")}</h1>
          <p className="s-calpage__lead">{t("calendarPageLead")}</p>
        </div>
        {timelineDoor && (
          <button type="button" className="s-btn s-calpage__timeline" onClick={() => useStore.getState().setView("timeline")} data-testid="calendar-timeline">
            {t("timelineFromCalendar")}
          </button>
        )}
      </header>

      <div className="s-calpage__body">
        <div className="s-calpage__month-col">
        {/* The month's own bar, over the month and not over the day pane:
            at 1600px a bar in the page head drifts a third of a screen from
            the thing it turns. */}
        <div className="s-calpage__bar">
          <button type="button" className="s-btn s-calpage__nav" aria-label={t("calendarPrevMonth")} title={t("calendarPrevMonth")} onClick={() => turn(-1)}>
            <span className="s-calpage__chev" aria-hidden="true">‹</span>
          </button>
          <h2 className="s-calpage__month">{title}</h2>
          <button type="button" className="s-btn s-calpage__nav" aria-label={t("calendarNextMonth")} title={t("calendarNextMonth")} onClick={() => turn(1)}>
            <span className="s-calpage__chev" aria-hidden="true">›</span>
          </button>
          <button type="button" className="s-btn s-calpage__todaybtn" onClick={() => moveTo(new Date())}>
            {t("calendarTodayShort")}
          </button>
        </div>
        <table ref={gridRef} className="s-calpage__table" role="grid" aria-label={title} onKeyDown={onKeyDown}>
          <thead>
            <tr>
              {/* Intl's weekday names in the chrome language: the full name
                  in English, the one letter an Arabic calendar prints. The
                  full name is the column's `abbr`, which is what a screen
                  reader announces for the cells under it. */}
              {rows[0].map((cell, i) => (
                <th key={order[i]} scope="col" className="s-calpage__wd" abbr={t(WEEKDAY_LABEL[order[i]])}>
                  {siteDateIn(cell.date, namesLocale, primary, { weekday: lang === "ar" ? "narrow" : "short" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0].iso}>
                {row.map((cell) => (
                  <Cell
                    key={cell.iso}
                    cell={cell}
                    day={agenda.get(cell.iso) ?? emptyAgenda(cell.iso)}
                    today={today}
                    cursor={cursor}
                    secondary={secondary}
                    locale={locale}
                    onSelect={pick}
                    onOpen={openDay}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {bands.length > 0 && (
          <section className="s-calpage__bands" aria-label={t("sigilCourseBands")} data-testid="calendar-bands">
            <h3 className="s-calpage__bandsh">{t("sigilCourseBands")}</h3>
            <ul className="s-calpage__bandlist">
              {bands.map((b, i) => (
                <li key={`${b.path}#${b.index}#${i}`} className="s-calpage__band">
                  <button type="button" className="s-calpage__panelink" dir="auto" onClick={() => openNote(b.path)}>
                    {b.unit === "" ? b.title : `${b.title} · ${b.unit}`}
                  </button>
                  <span className="s-calpage__fact">
                    {tf("sigilCourseBand", { start: bandDate(b.start, locale), end: bandDate(b.end, locale) })} · {countPhrase(b.steps, "steps")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        </div>

        {/* THE DAY PANE. Beside the grid where there is room, under it on a
            phone (calendarpage.css) — one place, one DOM, so nothing is
            written twice and nothing is hidden from a reader who tabs. */}
        {(() => {
          const pane = (
        <aside className="s-calpage__pane" aria-label={selectedLong} data-testid="calendar-day">
          <h2 className="s-calpage__paneh">{selectedLong}</h2>
          {selected.note === null ? (
            <button type="button" className="s-btn s-btn--accent s-calpage__door" onClick={() => openDay(cursor)}>
              {t("calendarCreateNote")}
            </button>
          ) : (
            <button type="button" className="s-btn s-btn--accent s-calpage__door" onClick={() => openNote(selected.note as string)}>
              {t("calendarOpenNote")}
            </button>
          )}

          {selected.sigils.length > 0 && (
            <section className="s-calpage__panesec">
              <h3 className="s-calpage__paneh3">{t("routines")}</h3>
              <ul className="s-calpage__panelist">
                {selected.sigils.map((s) => (
                  <li key={`${s.path}#${s.index}`} className="s-calpage__panerow">
                    <button type="button" className="s-calpage__panelink" dir="auto" onClick={() => openNote(s.path)}>
                      {s.title}
                    </button>
                    <span className={`s-calpage__status s-calpage__status--${s.status}`}>
                      {s.of > 0 ? tf("calendarSigilDone", { done: localeNum(s.done), of: localeNum(s.of) }) : t(STATUS_LABEL[s.status])}
                    </span>
                    {s.note !== null && <span className="s-calpage__panenote" dir="auto">{s.note}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {selected.projected.length > 0 && (
            <section className="s-calpage__panesec">
              <h3 className="s-calpage__paneh3">{t("sigilCourse")}</h3>
              <ul className="s-calpage__panelist">
                {selected.projected.map((p, i) => (
                  <li key={`${p.path}#${p.index}#${i}`} className="s-calpage__panerow s-calpage__panerow--ahead">
                    <button type="button" className="s-calpage__panelink" dir="auto" onClick={() => openNote(p.path)}>
                      {p.text}
                    </button>
                    <span className="s-calpage__fact" dir="auto">
                      {p.unit === "" ? p.title : `${p.title} · ${p.unit}`}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="s-calpage__panenote">{t("sigilCourseProjectedNote")}</p>
            </section>
          )}

          {selected.decks.length > 0 && (
            <section className="s-calpage__panesec">
              <h3 className="s-calpage__paneh3">{t("orbits")}</h3>
              <ul className="s-calpage__panelist">
                {selected.decks.map((d) => (
                  <li key={d.path} className="s-calpage__panerow">
                    {d.path === EVERYTHING_ELSE || !isNotePath(d.path) ? (
                      <span className="s-calpage__panelink s-calpage__panelink--flat">{deckName(d.path)}</span>
                    ) : (
                      <button type="button" className="s-calpage__panelink" dir="auto" onClick={() => openNote(d.path)}>
                        {deckName(d.path)}
                      </button>
                    )}
                    <span className="s-calpage__fact">
                      {tf("calendarDeckRow", { graded: countPhrase(d.graded, "cards"), kept: localeNum(Math.round((d.kept / Math.max(1, d.graded)) * 100)) })}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="s-calpage__panenote">{t("reviewOrbitsDevice")}</p>
            </section>
          )}

          {selected.trackers.length > 0 && (
            <section className="s-calpage__panesec">
              <h3 className="s-calpage__paneh3">{t("calendarReading")}</h3>
              <ul className="s-calpage__panelist">
                {selected.trackers.map((tr) => (
                  <li key={`${tr.path}#${tr.index}`} className="s-calpage__panerow">
                    <button type="button" className="s-calpage__panelink" dir="auto" onClick={() => openNote(tr.path)}>
                      {tr.title}
                    </button>
                    <span className="s-calpage__fact">{tf("calendarTrackerRow", { pages: countPhrase(tr.pages, "pages"), time: formatDuration(tr.minutes) })}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {selected.count === 0 && <p className="s-calpage__paneempty">{loaded ? t("calendarDayEmpty") : t("calendarLoading")}</p>}
        </aside>
          );
          if (!dayHost) return pane;
          return dayOpen ? dayHost(pane, selectedLong, () => setDayOpen(false)) : null;
        })()}
      </div>
    </div>
  );
}

/** One day. A button and nothing else: the number, the other calendar's
 *  number in the corner, and up to `ROWS_PER_CELL` lines of what the day
 *  held — every one of them inert text, because the pane beside the grid is
 *  where those rows are doors and a cell with six controls in it is a cell
 *  no one can tab through. */
function Cell({
  cell,
  day,
  today,
  cursor,
  secondary,
  locale,
  onSelect,
  onOpen,
}: {
  cell: GridCell;
  day: DayAgenda;
  today: string;
  cursor: string;
  secondary: GridCalendar | null;
  locale: string;
  onSelect: (iso: string) => void;
  onOpen: (iso: string) => void;
}) {
  const isToday = cell.iso === today;
  const graded = gradedOn(day);
  // The daily note is a DOT beside the number, not a line: in a journalling
  // vault it is titled by its own date, and a cell that prints "2026-09-15"
  // under a 15 has spent a line saying nothing. The lines are for what the
  // day held that the number cannot say.
  // A line is either something the day HELD (solid) or something a course is
  // on course to ask of it (faint): the projection is not a fact about the
  // day, and drawing it in the same ink as a kept sigil would say it was.
  const lines: { text: string; ahead?: true }[] = [];
  for (const s of day.sigils) {
    // A course's day is named by the step it answered, not by the course:
    // "Japanese" on twenty cells says nothing the month did not already.
    if (s.steps.length > 0) for (const step of s.steps) lines.push({ text: step });
    else lines.push({ text: s.title });
  }
  if (graded.graded > 0) lines.push({ text: countPhrase(graded.graded, "cards") });
  for (const tr of day.trackers) lines.push({ text: tr.title });
  for (const p of day.projected) lines.push({ text: p.text, ahead: true });
  const shown = lines.slice(0, ROWS_PER_CELL);
  const dayName = siteDate(cell.date, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  // The whole cell in one sentence, because the rows inside it are not
  // separately reachable: the day, then everything it held.
  const label = [
    dayName,
    day.note !== null ? t("calendarCellNote") : null,
    ...day.sigils.map((s) => `${s.title} — ${t(STATUS_LABEL[s.status])}`),
    graded.graded > 0 ? countPhrase(graded.graded, "cards") : null,
    ...day.trackers.map((tr) => tr.title),
    ...day.projected.map((p) => `${p.text} — ${t("sigilCourseProjected")}`),
  ]
    .filter(Boolean)
    .join(", ");
  const cls = [
    "s-calpage__day",
    cell.inMonth ? "" : "s-calpage__day--out",
    isToday ? "is-today" : "",
    cell.iso === cursor ? "is-selected" : "",
    day.count > 0 ? "has-items" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    // SELECTION IS THE GRIDCELL'S, not a pressed button. A day is not a
    // toggle — nothing about it is on or off — and `aria-pressed` on all
    // forty-two of them made a reader walking the month hear "toggle button,
    // not pressed" on every day of it. `aria-selected` is the grid's own
    // word for the cell the pane is following, and it is set on the one cell
    // that has it: an unselected day says nothing rather than "not selected".
    <td role="gridcell" className="s-calpage__cell" aria-selected={cell.iso === cursor ? true : undefined}>
      <button
        type="button"
        className={cls}
        data-iso={cell.iso}
        tabIndex={cell.iso === cursor ? 0 : -1}
        aria-label={label}
        aria-current={isToday ? "date" : undefined}
        title={label}
        onClick={() => onSelect(cell.iso)}
        onDoubleClick={() => onOpen(cell.iso)}
      >
        <span className="s-calpage__daynum">
          <span className="s-calpage__num">{localeNum(cell.day)}</span>
          {secondary !== null && <span className="s-calpage__alt" aria-hidden="true">{localeNum(ymdOf(cell.date, secondary).day)}</span>}
          {day.note !== null && <span className="s-calpage__notedot" aria-hidden="true" />}
        </span>
        <span className="s-calpage__lines" aria-hidden="true">
          {shown.map((line, i) => (
            <span key={i} className={line.ahead ? "s-calpage__line s-calpage__line--ahead" : "s-calpage__line"} dir="auto">
              {line.text}
            </span>
          ))}
          {lines.length > shown.length && <span className="s-calpage__more">{tf("calendarMore", { n: localeNum(lines.length - shown.length) })}</span>}
        </span>
      </button>
    </td>
  );
}
