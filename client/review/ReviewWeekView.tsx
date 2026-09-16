// THE WEEKLY REVIEW. One page, in the serif, that says what the week was:
// the pages and hours read by book, where every tracked work stands and
// when it will be done, how the sigils went, the cards graded and kept,
// the notes written and the notes worked on — each row a door to the note
// it came from.
//
// NOTHING IS STORED. The page reads what the vault and the device already
// keep — the trackers' `sessions:` lines, the sigil logs, the Orbits log in
// localStorage, the query route's dates and the version store's counts —
// and adds it up in shared/weekReview.ts every time it opens. A review that
// kept its own ledger would be a second truth about the sigils and the
// trackers, and "the note is the state" allows no second truth. It is a
// workspace tab like the Sigils page (`REVIEW_WEEK_TAB`), a lazy chunk with
// its own stylesheet, and it PRINTS: the sheet registers itself with
// client/print.ts while it is on screen, so Ctrl+P and the Print button
// both put this page, and not the note beside it, on paper.
//
// The week is the site's week — Monday to Sunday for an English instance,
// Saturday to Friday for an Arabic one — and the arrows walk to earlier
// weeks, because the sums are as true of last week as of this one.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EVERYTHING_ELSE } from "../../shared/decks.ts";
import { noteTitleOf } from "../../shared/noteFormat.ts";
import { isoDate, shiftDate } from "../../shared/routine.ts";
import { foldKind } from "../../shared/tracker.ts";
import {
  booksThisWeek,
  localDay,
  notesThisWeek,
  orbitsThisWeek,
  previousWeek,
  sigilsThisWeek,
  trackerOutlook,
  weekOf,
  type BookWeek,
  type NotesWeek,
  type OrbitsWeek,
  type ReviewTracker,
  type SigilWeek,
  type TrackerOutlook,
  type WeekRange,
} from "../../shared/weekReview.ts";
import { getNoteVersions, getRoutines, getTrackers, queryNotes } from "../api.ts";
import { siteDate } from "../dates.ts";
import { countPhrase, getLang, localeNum, t, tf } from "../i18n.ts";
import { readLog } from "../orbits/log.ts";
import { printNote, setPrintable } from "../print.ts";
import { useStore } from "../state.ts";
import { formatDuration, KIND_UNIT, unitKey } from "../trackerUnits.ts";
import "../styles/review.css";

/** How many notes the version store is asked about: the ones touched most
 *  recently in the week. Twelve requests in parallel is a blink; four
 *  hundred would be a page that never finishes adding up. */
const VERSIONED_NOTES = 12;

interface WeekData {
  books: BookWeek[];
  trackers: TrackerOutlook[];
  sigils: SigilWeek[];
  orbits: OrbitsWeek;
  notes: NotesWeek;
}

async function loadWeek(week: WeekRange, today: string, lang: "en" | "ar"): Promise<WeekData> {
  const [trackers, routines, hits] = await Promise.all([getTrackers(), getRoutines(), queryNotes("", "modified", "desc", 500)]);
  const reviewTrackers: ReviewTracker[] = trackers.map((m) => ({
    path: m.path,
    index: m.index,
    title: m.title,
    kind: m.kind,
    kindKey: foldKind(m.kind),
    unit: m.unit,
    status: m.status,
    done: m.done,
    total: m.total,
    percent: m.percent,
    pace: m.pace,
    due: m.due,
    sessions: m.sessions,
  }));
  // The version store, asked about the notes the week touched most recently:
  // a note saved twenty times in the week outranks one saved once, which is
  // what "most edited" means. A store that is off answers with nothing and
  // the order falls back to the last write.
  const startMs = new Date(`${week.start}T00:00:00`).getTime();
  const endMs = new Date(`${shiftDate(week.end, 1)}T00:00:00`).getTime();
  const touched = hits.filter((h) => h.mtimeMs >= startMs && h.mtimeMs < endMs).slice(0, VERSIONED_NOTES);
  const edits = new Map<string, number>();
  await Promise.all(
    touched.map(async (h) => {
      try {
        const res = await getNoteVersions(h.path);
        if (!res.enabled) return;
        edits.set(h.path, res.versions.filter((v) => v.at >= startMs && v.at < endMs).length + 1);
      } catch {
        // One note's history unreadable: it counts its one known write.
      }
    }),
  );
  return {
    books: booksThisWeek(reviewTrackers, week),
    trackers: trackerOutlook(reviewTrackers, today),
    sigils: sigilsThisWeek(routines.filter((r) => !r.template), today, lang),
    orbits: orbitsThisWeek(readLog(), week),
    notes: notesThisWeek(hits, week, edits),
  };
}

/** A count in the tracker's unit: the chrome's word for a unit it knows,
 *  agreed with the number; the author's own word otherwise. */
function inUnit(row: TrackerOutlook, n: number): string {
  const known = unitKey(row.unit) ?? (row.kindKey ? KIND_UNIT[row.kindKey] : null);
  return known ? countPhrase(n, known) : `${localeNum(n)} ${row.unit ?? ""}`.trim();
}

function countOf(row: TrackerOutlook): string {
  if (row.done === null || row.total === null) return row.percent === null ? "" : tf("trackerPercent", { percent: localeNum(Math.round(row.percent)) });
  return `${localeNum(row.done)} / ${inUnit(row, row.total)}`;
}

export default function ReviewWeekView() {
  // The chrome's language decides the week, as it does on the sigil card.
  const lang = getLang();
  const locale = useStore((s) => s.blogLocale);
  const openNote = useStore((s) => s.openNote);
  const today = isoDate(new Date());
  const [week, setWeek] = useState<WeekRange>(() => weekOf(today, lang));
  const [data, setData] = useState<WeekData | null>(null);
  const [failed, setFailed] = useState(false);
  const sheet = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setFailed(false);
    loadWeek(week, today, lang)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [week, today, lang]);

  // The sheet on paper is this page, cloned — but only while its pane holds
  // the focus, so a note being read beside the review still prints itself.
  useEffect(() => {
    setPrintable(() => {
      const el = sheet.current;
      if (el === null) return null;
      const focus = useStore.getState().workspace.focus;
      const pane = document.querySelector(`[data-pane="${CSS.escape(focus)}"]`);
      if (pane !== null && !pane.contains(el)) return null;
      return el.cloneNode(true) as HTMLElement;
    });
    return () => setPrintable(null);
  }, []);

  const open = useCallback(
    (path: string) => (e: React.MouseEvent) => {
      e.preventDefault();
      openNote(path);
    },
    [openNote],
  );

  const current = useMemo(() => weekOf(today, lang), [today, lang]);
  const isCurrent = week.start === current.start;
  const dateOf = (iso: string): string => siteDate(`${iso}T12:00:00`, locale, { day: "numeric", month: "long" });
  const range = tf("reviewWeekOf", { start: dateOf(week.start), end: dateOf(week.end) });
  const totals = data ? data.books.reduce((acc, b) => ({ pages: acc.pages + b.pages, minutes: acc.minutes + b.minutes }), { pages: 0, minutes: 0 }) : null;

  return (
    <div className="s-review" data-testid="review-week">
      <div className="s-review__bar">
        <button type="button" className="s-btn" onClick={() => setWeek(previousWeek(week))}>
          {t("reviewPrev")}
        </button>
        <button type="button" className="s-btn" onClick={() => setWeek(current)} disabled={isCurrent}>
          {t("reviewThisWeek")}
        </button>
        <button type="button" className="s-btn" onClick={() => setWeek({ start: shiftDate(week.start, 7), end: shiftDate(week.end, 7) })} disabled={isCurrent}>
          {t("reviewNext")}
        </button>
        <span className="s-review__spacer" />
        <button type="button" className="s-btn s-btn--accent" onClick={() => void printNote()}>
          {t("reviewPrint")}
        </button>
      </div>

      <article className="s-review__sheet" ref={sheet}>
        <header className="s-review__head">
          <p className="s-review__range">{range}</p>
          <h1 className="s-review__h1">{t("reviewWeek")}</h1>
        </header>

        {failed && <p className="s-review__empty">{t("reviewFailed")}</p>}
        {!failed && data === null && <p className="s-review__empty">{t("reviewLoading")}</p>}

        {data !== null && (
          <>
            <section className="s-review__section">
              <h2 className="s-review__h2">{t("reviewBooks")}</h2>
              {data.books.length === 0 ? (
                <p className="s-review__empty">{t("reviewBooksNone")}</p>
              ) : (
                <>
                  <ul className="s-review__list">
                    {data.books.map((b) => (
                      <li key={`${b.path}#${b.index}`} className="s-review__row">
                        <a href="#" className="s-review__link" onClick={open(b.path)} dir="auto">
                          {b.title}
                        </a>
                        <span className="s-review__fact">
                          {tf("reviewBookRow", { pages: countPhrase(b.pages, "pages"), time: formatDuration(b.minutes), sessions: countPhrase(b.sessions, "sessions") })}
                          {b.speed !== null && ` · ${tf("reviewBookSpeed", { speed: countPhrase(Math.round(b.speed * 10) / 10, "pages") })}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {totals !== null && data.books.length > 1 && (
                    <p className="s-review__total">{tf("reviewTotals", { pages: countPhrase(totals.pages, "pages"), time: formatDuration(totals.minutes) })}</p>
                  )}
                </>
              )}
            </section>

            <section className="s-review__section">
              <h2 className="s-review__h2">{t("reviewTrackers")}</h2>
              {data.trackers.length === 0 ? (
                <p className="s-review__empty">{t("reviewTrackersNone")}</p>
              ) : (
                <ul className="s-review__list">
                  {data.trackers.map((row) => (
                    <li key={`${row.path}#${row.index}`} className="s-review__row">
                      <a href="#" className="s-review__link" onClick={open(row.path)} dir="auto">
                        {row.title}
                      </a>
                      <span className="s-review__fact">
                        {countOf(row)}
                        {row.projection !== null &&
                          ` · ${tf(row.projection.kind === "done-by" ? "trackerPaceDoneBy" : "trackerPaceNeeded", { pace: inUnit(row, row.projection.pace), date: dateOf(row.projection.date) })}`}
                        {row.minutesLeft !== null && ` · ${tf("reviewTimeLeft", { left: formatDuration(row.minutesLeft) })}`}
                      </span>
                      {row.percent !== null && (
                        <span className="s-review__bar-track" aria-hidden="true">
                          <span className="s-review__bar-fill" style={{ inlineSize: `${Math.max(1, Math.min(100, Math.round(row.percent)))}%` }} />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="s-review__section">
              <h2 className="s-review__h2">{t("routines")}</h2>
              {data.sigils.length === 0 ? (
                <p className="s-review__empty">{t("reviewSigilsNone")}</p>
              ) : (
                <ul className="s-review__list">
                  {data.sigils.map((row) => (
                    <li key={`${row.path}#${row.index}`} className="s-review__row">
                      <a href="#" className="s-review__link" onClick={open(row.path)} dir="auto">
                        {row.title}
                      </a>
                      <span className="s-review__fact">{tf("reviewSigilRow", { done: localeNum(row.done), of: localeNum(row.of), streak: localeNum(row.streak) })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="s-review__section">
              <h2 className="s-review__h2">{t("orbits")}</h2>
              {data.orbits.graded === 0 ? (
                <p className="s-review__empty">{t("reviewOrbitsNone")}</p>
              ) : (
                <>
                  <p className="s-review__total">
                    {tf("reviewOrbitsRow", {
                      graded: countPhrase(data.orbits.graded, "cards"),
                      days: countPhrase(data.orbits.days, "days"),
                      retention: localeNum(Math.round((data.orbits.retention ?? 0) * 100)),
                    })}
                  </p>
                  <ul className="s-review__list">
                    {data.orbits.decks.map((d) => (
                      <li key={d.path} className="s-review__row">
                        {d.path === EVERYTHING_ELSE ? (
                          <span className="s-review__link">{t("orbitsEverything")}</span>
                        ) : (
                          <a href="#" className="s-review__link" onClick={open(d.path)} dir="auto">
                            {noteTitleOf(d.path)}
                          </a>
                        )}
                        <span className="s-review__fact">
                          {tf("reviewOrbitsDeck", { graded: countPhrase(d.graded, "cards"), retention: localeNum(Math.round((d.retention ?? 0) * 100)) })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="s-review__note">{t("reviewOrbitsDevice")}</p>
            </section>

            <section className="s-review__section">
              <h2 className="s-review__h2">{t("reviewNotesCreated")}</h2>
              {data.notes.created.length === 0 ? (
                <p className="s-review__empty">{t("reviewNotesNone")}</p>
              ) : (
                <ul className="s-review__list s-review__list--cols">
                  {data.notes.created.map((n) => (
                    <li key={n.path} className="s-review__row">
                      <a href="#" className="s-review__link" onClick={open(n.path)} dir="auto">
                        {n.title}
                      </a>
                      <span className="s-review__fact">{dateOf(localDay(n.dateMs))}</span>
                    </li>
                  ))}
                </ul>
              )}
              {data.notes.createdTotal > data.notes.created.length && (
                <p className="s-review__note">{tf("reviewMore", { count: countPhrase(data.notes.createdTotal - data.notes.created.length, "notes") })}</p>
              )}
              {data.notes.edited.length > 0 && (
                <>
                  <h3 className="s-review__h3">{t("reviewNotesEdited")}</h3>
                  <ul className="s-review__list s-review__list--cols">
                    {data.notes.edited.map((n) => (
                      <li key={n.path} className="s-review__row">
                        <a href="#" className="s-review__link" onClick={open(n.path)} dir="auto">
                          {n.title}
                        </a>
                        <span className="s-review__fact">{countPhrase(n.edits, "versions")}</span>
                      </li>
                    ))}
                  </ul>
                  {data.notes.editedTotal > data.notes.edited.length && (
                    <p className="s-review__note">{tf("reviewMore", { count: countPhrase(data.notes.editedTotal - data.notes.edited.length, "notes") })}</p>
                  )}
                </>
              )}
            </section>

            <p className="s-review__note s-review__colophon">{t("reviewNotStored")}</p>
          </>
        )}
      </article>
    </div>
  );
}
