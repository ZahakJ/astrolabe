// THE YEAR IN REVIEW — a note, `Reviews/<year>.md`, that adds a year up
// (docs/timeline.md "Year in review").
//
// The palette's "Year in review…" asks which year and writes this. It is the
// weekly review's argument (shared/weekReview.ts) at the scale of a year, with
// one difference: the week is a page that stores nothing, and the year is a
// NOTE — something to keep, link, annotate and read again next December. So
// the numbers are computed here, from what the vault already keeps, and
// written between two markers; a second run rewrites only what is between
// them, and whatever the owner wrote around the block stays theirs (the
// highlights note's contract, shared/highlightsNote.ts).
//
// NOTHING IS COUNTED TWICE. The days are placed by shared/dayAgenda.ts — the
// Calendar's and the Timeline's aggregation — over every day of the year, and
// the months, the ticks, the cards and the pages are sums over its answer.
// The streaks are the Sigil card's own rule (`dayStatus`, rest days
// transparent). The words are the post list's count, per note begun that year.
//
// PURE and deterministic: the words (the note speaks the chrome's language at
// the moment it is written) and the numeral formatting come in as arguments,
// and tests/yearReview.test.ts renders a fixture vault byte for byte.

import { agendaByDay, gradedOn, type AgendaNoteSource, type AgendaSigilSource } from "./dayAgenda.ts";
import { stripNoteExt } from "./noteFormat.ts";
import { dayStatus, shiftDate, type RoutineEntry } from "./routine.ts";
import { foldKind, type TrackerRating, type TrackerSession } from "./tracker.ts";
import type { ReviewGrade } from "./weekReview.ts";

export const REVIEW_START = "<!-- astrolabe:year-review -->";
export const REVIEW_END = "<!-- /astrolabe:year-review -->";

/** Where a year's review is written. An address, the same in every language. */
export const REVIEWS_FOLDER = "Reviews";

export function reviewPath(year: number): string {
  return `${REVIEWS_FOLDER}/${year}.md`;
}

/** The words the note is written in, and how it prints a number. Handed in
 *  by the client from its dictionary, so this module holds no language. */
export interface YearReviewWords {
  /** "2025 in review" — the first line of a note the command creates. */
  lead: string;
  atAGlance: string;
  /** Each count is a phrase the client builds with its own plural rules
   *  (i18n `countPhrase`), so "1 book" and "١١ كتابًا" are both right. */
  notesBegun: (notes: number, words: number) => string;
  dailyDays: (n: number) => string;
  sigilTicks: (n: number) => string;
  cardsReviewed: (n: number) => string;
  pagesRead: (pages: number, sittings: number) => string;
  booksFinished: (n: number) => string;
  months: string;
  /** The table's header cells, in order: month, notes, daily notes, sigil
   *  ticks, cards, pages. */
  monthColumns: readonly [string, string, string, string, string, string];
  sigils: string;
  sigilLine: (ticks: number, streak: number) => string;
  books: string;
  finishedOn: (date: string) => string;
  mostLinked: string;
  links: (n: number) => string;
  /** Said under a heading with nothing in it. */
  none: string;
  monthName: (month: number) => string;
  /** A bare number, in the table. */
  num: (n: number) => string;
}

export interface YearReviewTracker {
  path: string;
  title: string;
  kind: string | null;
  finished: string | null;
  rating: TrackerRating | null;
  sessions: readonly TrackerSession[];
}

export interface YearReviewInput {
  year: number;
  /** The last day counted — the year's end, or today inside the current year. */
  today: string;
  /** Every note with its day (GET /api/timeline), with its word count. */
  notes: readonly (AgendaNoteSource & { words: number })[];
  /** ISO day → the daily note's path (client/daily.ts `dailyNotesByDay`). */
  daily: ReadonlyMap<string, string>;
  sigils: readonly AgendaSigilSource[];
  trackers: readonly YearReviewTracker[];
  grades: readonly ReviewGrade[];
  /** The vault's links (GET /api/graph edges): who links to whom. */
  edges: readonly { source: string; target: string }[];
}

export interface MonthRow {
  month: number;
  notes: number;
  daily: number;
  ticks: number;
  cards: number;
  pages: number;
}

export interface SigilYear {
  path: string;
  title: string;
  ticks: number;
  best: number;
}

export interface YearNumbers {
  notes: number;
  words: number;
  dailyDays: number;
  ticks: number;
  cards: number;
  pages: number;
  sittings: number;
  months: MonthRow[];
  sigils: SigilYear[];
  books: { path: string; title: string; finished: string; rating: TrackerRating | null }[];
  mostLinked: { path: string; title: string; links: number }[];
}

const MOST_LINKED = 10;

/** Every day of `year` up to `today`, oldest first. */
export function daysOfYear(year: number, today: string): string[] {
  const out: string[] = [];
  const last = `${year}-12-31` < today ? `${year}-12-31` : today;
  for (let iso = `${year}-01-01`; iso <= last; iso = shiftDate(iso, 1)) out.push(iso);
  return out;
}

/** The longest run of complete days in `days` (oldest first), rest days
 *  transparent — the Sigil card's streak rule (shared/routine.ts
 *  `routineStats`), read over a year instead of back from today. Days before
 *  the sigil's first entry were not tracked and break nothing. */
export function bestStreak(sigil: AgendaSigilSource, days: readonly string[], today: string): number {
  const byDate = new Map<string, RoutineEntry>();
  for (const e of sigil.entries) byDate.set(e.date, e);
  const since = sigil.entries.length > 0 ? sigil.entries.reduce((m, e) => (e.date < m ? e.date : m), sigil.entries[0].date) : null;
  if (since === null) return 0;
  let run = 0;
  let best = 0;
  for (const iso of days) {
    if (iso < since) continue;
    const status = dayStatus(sigil.plan, byDate.get(iso) ?? null, iso, today);
    if (status === "complete") {
      run += 1;
      if (run > best) best = run;
    } else if (status === "rest" || (status === "none" && iso >= today)) {
      // Transparent: a day the plan asks nothing of, or today still open.
    } else run = 0;
  }
  return best;
}

/** The year, added up. */
export function yearNumbers(input: YearReviewInput): YearNumbers {
  const days = daysOfYear(input.year, input.today);
  const agenda = agendaByDay(
    days,
    { notes: input.daily, sigils: input.sigils, trackers: input.trackers.map((t, index) => ({ path: t.path, index, title: t.title, sessions: t.sessions })), grades: input.grades, written: input.notes },
    input.today,
    { project: false },
  );
  const months: MonthRow[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, notes: 0, daily: 0, ticks: 0, cards: 0, pages: 0 }));
  const ticksBySigil = new Map<string, number>();
  let sittings = 0;
  for (const iso of days) {
    const day = agenda.get(iso);
    if (day === undefined) continue;
    const row = months[Number(iso.slice(5, 7)) - 1];
    row.notes += day.written.length;
    if (day.note !== null) row.daily += 1;
    for (const s of day.sigils) {
      row.ticks += s.done;
      const key = `${s.path}#${s.index}`;
      ticksBySigil.set(key, (ticksBySigil.get(key) ?? 0) + s.done);
    }
    row.cards += gradedOn(day).graded;
    for (const t of day.trackers) {
      row.pages += t.pages;
      sittings += t.sessions;
    }
  }
  const inYear = (iso: string | null): boolean => iso !== null && iso.startsWith(`${input.year}-`) && iso <= input.today;
  const begun = new Set(
    input.notes.filter((n) => inYear(n.day)).map((n) => n.path),
  );
  // "Words written" is the words IN the notes begun this year — the one count
  // the vault can stand behind; a note edited this year but begun in another
  // is not counted, because nothing records how much of it was this year's.
  // A daily note counts by the day it IS, whatever day its file was made.
  const dailyDay = new Map<string, string>();
  for (const [iso, path] of input.daily) dailyDay.set(path, iso);
  let words = 0;
  for (const n of input.notes) {
    const own = dailyDay.get(n.path);
    if (own !== undefined ? inYear(own) : begun.has(n.path)) words += n.words;
  }

  const sigils: SigilYear[] = input.sigils
    .map((s) => ({ path: s.path, title: s.plan.title, ticks: ticksBySigil.get(`${s.path}#${s.index}`) ?? 0, best: bestStreak(s, days, input.today) }))
    .filter((s) => s.ticks > 0 || s.best > 0)
    .sort((a, b) => b.ticks - a.ticks || b.best - a.best || cmp(a.title, b.title));

  const books = input.trackers
    .filter((t) => t.finished !== null && inYear(t.finished.slice(0, 10)) && foldKind(t.kind) === "book")
    .map((t) => ({ path: t.path, title: t.title, finished: t.finished!.slice(0, 10), rating: t.rating }))
    .sort((a, b) => cmp(a.finished, b.finished) || cmp(a.title, b.title));

  // MOST LINKED: the notes the year's own notes kept pointing at — links
  // FROM a note begun (or a daily note kept) this year, counted per target.
  const titles = new Map(input.notes.map((n) => [n.path, n.title]));
  const fromYear = new Set(begun);
  for (const [iso, path] of input.daily) if (inYear(iso)) fromYear.add(path);
  const inbound = new Map<string, number>();
  for (const e of input.edges) {
    if (!fromYear.has(e.source) || e.source === e.target || !titles.has(e.target)) continue;
    inbound.set(e.target, (inbound.get(e.target) ?? 0) + 1);
  }
  const mostLinked = [...inbound]
    .map(([path, links]) => ({ path, title: titles.get(path) ?? path, links }))
    .sort((a, b) => b.links - a.links || cmp(a.title, b.title))
    .slice(0, MOST_LINKED);

  return {
    notes: months.reduce((n, m) => n + m.notes, 0),
    words,
    dailyDays: months.reduce((n, m) => n + m.daily, 0),
    ticks: months.reduce((n, m) => n + m.ticks, 0),
    cards: months.reduce((n, m) => n + m.cards, 0),
    pages: months.reduce((n, m) => n + m.pages, 0),
    sittings,
    months,
    sigils,
    books,
    mostLinked,
  };
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `[[Folder/Note|Title]]` — the path keeps the link unambiguous in a vault
 *  with two notes of one name; the title keeps it readable. */
function link(path: string, title: string): string {
  const target = stripNoteExt(path);
  const base = target.slice(target.lastIndexOf("/") + 1);
  return base === title && !target.includes("/") ? `[[${target}]]` : `[[${target}|${title}]]`;
}

/** The generated block, markers included. */
export function yearReviewBlock(numbers: YearNumbers, words: YearReviewWords): string {
  const n = words.num;
  const lines: string[] = [REVIEW_START, ""];
  lines.push(`## ${words.atAGlance}`, "");
  lines.push(`- ${words.notesBegun(numbers.notes, numbers.words)}`);
  lines.push(`- ${words.dailyDays(numbers.dailyDays)}`);
  lines.push(`- ${words.sigilTicks(numbers.ticks)}`);
  lines.push(`- ${words.cardsReviewed(numbers.cards)}`);
  lines.push(`- ${words.pagesRead(numbers.pages, numbers.sittings)}`);
  lines.push(`- ${words.booksFinished(numbers.books.length)}`);
  lines.push("", `## ${words.months}`, "");
  lines.push(`| ${words.monthColumns.join(" | ")} |`);
  lines.push(`|${words.monthColumns.map((_, i) => (i === 0 ? " --- " : " ---: ")).join("|")}|`);
  for (const m of numbers.months) {
    lines.push(`| ${words.monthName(m.month)} | ${n(m.notes)} | ${n(m.daily)} | ${n(m.ticks)} | ${n(m.cards)} | ${n(m.pages)} |`);
  }
  lines.push("", `## ${words.sigils}`, "");
  if (numbers.sigils.length === 0) lines.push(words.none);
  for (const s of numbers.sigils) lines.push(`- ${link(s.path, s.title)} — ${words.sigilLine(s.ticks, s.best)}`);
  lines.push("", `## ${words.books}`, "");
  if (numbers.books.length === 0) lines.push(words.none);
  for (const b of numbers.books) {
    const stars = b.rating === null ? "" : ` · ★ ${n(b.rating.value)}/${n(b.rating.max)}`;
    lines.push(`- ${link(b.path, b.title)} — ${words.finishedOn(b.finished)}${stars}`);
  }
  lines.push("", `## ${words.mostLinked}`, "");
  if (numbers.mostLinked.length === 0) lines.push(words.none);
  for (const m of numbers.mostLinked) lines.push(`- ${link(m.path, m.title)} — ${words.links(m.links)}`);
  lines.push("", REVIEW_END);
  return lines.join("\n");
}

/** The whole note: `existing` with its marked block replaced, or the block
 *  appended when the markers are gone; a note that did not exist opens with
 *  the lead line. Only the block is ever rewritten. */
export function mergeYearReview(existing: string | null, block: string, lead: string): string {
  if (existing === null || existing.trim() === "") return `${lead}\n\n${block}\n`;
  const start = existing.indexOf(REVIEW_START);
  const end = start === -1 ? -1 : existing.indexOf(REVIEW_END, start + REVIEW_START.length);
  if (start === -1 || end === -1) {
    const sep = existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
    return `${existing}${sep}${block}\n`;
  }
  return existing.slice(0, start) + block + existing.slice(end + REVIEW_END.length);
}

/** The years a vault holds anything in, newest first — what the command
 *  offers. */
export function reviewYears(notes: readonly { day: string | null }[], daily: ReadonlyMap<string, string>, sigils: readonly AgendaSigilSource[], today: string): number[] {
  const years = new Set<number>();
  const add = (iso: string | null): void => {
    if (iso !== null && /^\d{4}-/.test(iso) && iso <= today) years.add(Number(iso.slice(0, 4)));
  };
  for (const n of notes) add(n.day);
  for (const iso of daily.keys()) add(iso);
  for (const s of sigils) for (const e of s.entries) add(e.date);
  return [...years].sort((a, b) => b - a);
}
