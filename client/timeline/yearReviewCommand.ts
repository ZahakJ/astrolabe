// "Year in review…" — the palette's command and the Timeline's button
// (docs/timeline.md "Year in review"). Asks which year, adds it up with
// shared/yearReview.ts over what the vault keeps, writes `Reviews/<year>.md`
// — only the block between the markers when the note is already there — and
// opens it. A lazy module: the palette imports it on the first run.
//
// The words go in from the dictionary at the moment of writing, in the
// chrome's language, the way the highlights note takes its words
// (client/books/highlightsNote.ts): the note is the owner's to keep, in the
// language they were reading the app in when they asked for it.

import { reviewPath, reviewYears, mergeYearReview, yearNumbers, yearReviewBlock, type YearReviewWords } from "../../shared/yearReview.ts";
import { isoDate } from "../../shared/routine.ts";
import { ApiError, createNote, getGraph, getNote, getRoutines, getTimelineNotes, getTrackers } from "../api.ts";
import { promptModal } from "../components/Confirm.tsx";
import { dailyNotesByDay, loadPeriodic } from "../daily.ts";
import { countPhrase, localeNum, t, tf } from "../i18n.ts";
import { readLog } from "../orbits/log.ts";
import { applyNoteContent } from "../sectionActions.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { stripBidiControls } from "../../shared/bidi.ts";
import { gregorianDate } from "./words.tsx";

/** A sentence for the NOTE, not the chrome: `tf` isolates every placeholder
 *  with FSI/PDI so a phrase sits right inside a line of the other script on
 *  screen, and those invisible characters written into a file are noise a
 *  search, a diff and every other editor would trip on. The markdown line
 *  is its own paragraph; the reading view isolates it with `dir="auto"`. */
function pf(key: Parameters<typeof tf>[0], vars: Record<string, string | number>): string {
  return stripBidiControls(tf(key, vars));
}

function words(year: number): YearReviewWords {
  const locale = useStore.getState().blogLocale;
  // A year is a name, not a quantity: no thousands separator ("2,026").
  const yearName = localeNum(year).replace(/[,٬]/g, "");
  return {
    lead: pf("yearReviewLead", { year: yearName }),
    atAGlance: t("yearReviewGlance"),
    notesBegun: (notes, w) => pf("yearReviewNotes", { notes: countPhrase(notes, "notes"), words: countPhrase(w, "words") }),
    dailyDays: (n) => pf("yearReviewDaily", { days: countPhrase(n, "days") }),
    sigilTicks: (n) => pf("yearReviewTicks", { ticks: countPhrase(n, "ticks") }),
    cardsReviewed: (n) => pf("yearReviewCards", { cards: countPhrase(n, "cards") }),
    pagesRead: (pages, sittings) => pf("yearReviewPages", { pages: countPhrase(pages, "pages"), sittings: countPhrase(sittings, "sittings") }),
    booksFinished: (n) => pf("yearReviewBooks", { books: countPhrase(n, "books") }),
    months: t("yearReviewMonths"),
    monthColumns: [t("yearReviewColMonth"), t("yearReviewColNotes"), t("yearReviewColDaily"), t("yearReviewColTicks"), t("yearReviewColCards"), t("yearReviewColPages")],
    sigils: t("yearReviewSigils"),
    sigilLine: (ticks, streak) => pf("yearReviewSigilLine", { ticks: countPhrase(ticks, "ticks"), streak: countPhrase(streak, "days") }),
    books: t("yearReviewBooksHead"),
    finishedOn: (date) => pf("yearReviewFinishedOn", { date: gregorianDate(new Date(`${date}T12:00:00`), locale, { day: "numeric", month: "long" }) || date }),
    mostLinked: t("yearReviewLinked"),
    links: (n) => countPhrase(n, "links"),
    none: t("yearReviewNone"),
    monthName: (m) => gregorianDate(new Date(year, m - 1, 15, 12), locale, { month: "long" }),
    num: (n) => localeNum(n),
  };
}

/** Ask for a year, write its review, open it. */
export async function yearReviewCommand(): Promise<void> {
  const store = useStore.getState();
  if (!store.admin) return;
  const today = isoDate(new Date());
  let notes, routines, trackers;
  try {
    await loadPeriodic();
    [notes, routines, trackers] = await Promise.all([getTimelineNotes(), getRoutines(), getTrackers()]);
  } catch (err) {
    console.error("astrolabe: reading the vault for the year in review failed", err);
    toast(t("yearReviewFailed"), "error");
    return;
  }
  const sigils = routines.filter((r) => !r.template);
  const daily = dailyNotesByDay(useStore.getState().tree);
  const years = reviewYears(notes, daily, sigils, today);
  const thisYear = Number(today.slice(0, 4));
  // In the first weeks of a year the year worth adding up is the one that
  // just ended; any other time, the one being lived.
  const suggested = today.slice(5) < "02-01" && years.includes(thisYear - 1) ? thisYear - 1 : years[0] ?? thisYear;
  const answer = await promptModal({
    title: t("yearReviewAsk"),
    body: tf("yearReviewBody", { years: years.length > 0 ? years.map((y) => localeNum(y)).join(store.language === "ar" ? "، " : ", ") : localeNum(thisYear) }),
    value: String(suggested),
    confirmLabel: t("yearReviewConfirm"),
    check: (raw) => {
      const text = raw.trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
      if (!/^\d{4}$/.test(text) || Number(text) > thisYear) return { value: "", error: text === "" ? undefined : t("yearReviewBadYear") };
      return { value: text };
    },
  });
  if (answer === null) return;
  const year = Number(answer);
  try {
    const graph = await getGraph().catch(() => ({ nodes: [], edges: [] }));
    const numbers = yearNumbers({
      year,
      today,
      notes,
      daily,
      sigils,
      trackers: trackers.map((tr) => ({ path: tr.path, title: tr.title, kind: tr.kind, finished: tr.finished, rating: tr.rating, sessions: tr.sessions })),
      grades: readLog(),
      edges: graph.edges,
    });
    const w = words(year);
    const block = yearReviewBlock(numbers, w);
    const path = reviewPath(year);
    let existing: string | null = null;
    try {
      existing = (await getNote(path)).content;
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) throw err;
    }
    const content = mergeYearReview(existing, block, w.lead);
    if (existing === null) {
      await createNote(path);
      await useStore.getState().loadTree();
    }
    await applyNoteContent(path, content);
    useStore.getState().openNote(path);
    toast(tf("yearReviewWritten", { path }));
  } catch (err) {
    console.error("astrolabe: writing the year in review failed", err);
    toast(t("yearReviewFailed"), "error");
  }
}
