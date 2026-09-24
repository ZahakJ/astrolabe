// The year in review (shared/yearReview.ts): a fixture vault added up into
// `Reviews/<year>.md`, byte for byte, and a second run that rewrites only the
// block between the markers.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgendaNoteSource } from "../shared/dayAgenda.ts";
import { parseRoutine, parseRoutineLog } from "../shared/routine.ts";
import type { ReviewGrade } from "../shared/weekReview.ts";
import {
  bestStreak,
  daysOfYear,
  mergeYearReview,
  REVIEW_END,
  REVIEW_START,
  reviewPath,
  reviewYears,
  yearNumbers,
  yearReviewBlock,
  type YearReviewInput,
  type YearReviewWords,
} from "../shared/yearReview.ts";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

const WORDS: YearReviewWords = {
  lead: "2025 in review",
  atAGlance: "At a glance",
  notesBegun: (n, words) => `${plural(n, "note", "notes")} begun; ${plural(words, "word", "words")} written in them and the daily notes`,
  dailyDays: (n) => `${plural(n, "day", "days")} with a daily note`,
  sigilTicks: (n) => plural(n, "sigil tick", "sigil ticks"),
  cardsReviewed: (n) => `${plural(n, "card", "cards")} reviewed on this device`,
  pagesRead: (pages, sittings) => `${plural(pages, "page", "pages")} read in ${plural(sittings, "sitting", "sittings")}`,
  booksFinished: (n) => `${plural(n, "book", "books")} finished`,
  months: "Months",
  monthColumns: ["Month", "Notes", "Daily notes", "Sigil ticks", "Cards", "Pages"],
  sigils: "Sigils",
  sigilLine: (ticks, streak) => `${plural(ticks, "tick", "ticks")} · best streak ${plural(streak, "day", "days")}`,
  books: "Books finished",
  finishedOn: (date) => `finished ${date}`,
  mostLinked: "Most linked",
  links: (n) => plural(n, "link", "links"),
  none: "Nothing this year.",
  monthName: (m) => MONTHS[m - 1],
  num: (n) => String(n),
};

function note(path: string, day: string | null, words: number, extra: Partial<AgendaNoteSource> = {}): AgendaNoteSource & { words: number } {
  const title = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");
  return { path, title, day, publishedDay: null, published: false, excerpt: "", tags: [], captured: 0, voice: 0, words, ...extra };
}

function ts(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

const PLAN = parseRoutine("title: Morning\nitems: water, stretch")!;
const LOG = [
  "2025-01-01 | done: water, stretch",
  "2025-01-02 | done: water, stretch",
  "2025-01-03 | done: water",
  "2025-01-04 | done: water, stretch",
  "2025-01-05 | done: water, stretch",
  "2025-01-06 | done: water, stretch",
  "2024-12-31 | done: water, stretch",
].join("\n");

const FIXTURE: YearReviewInput = {
  year: 2025,
  today: "2026-09-23",
  notes: [
    note("Essays/On reading.md", "2025-01-02", 1200),
    note("Essays/Old.md", "2024-06-01", 999),
    note("Daily/2025-01-01.md", "2025-01-01", 80),
    note("Daily/2025-03-10.md", "2025-03-10", 40),
    note("Books/Dune.md", "2025-02-01", 300),
    note("Hub.md", "2024-01-01", 10),
  ],
  daily: new Map([
    ["2025-01-01", "Daily/2025-01-01.md"],
    ["2025-03-10", "Daily/2025-03-10.md"],
  ]),
  sigils: [{ path: "Sigils/Morning.md", index: 0, plan: PLAN, entries: parseRoutineLog(LOG, PLAN.fields) }],
  trackers: [
    { path: "Books/Dune.md", title: "Dune", kind: "book", finished: "2025-03-04", rating: { value: 4, max: 5 }, sessions: [{ date: "2025-02-10", pages: 40, minutes: 50 }, { date: "2025-03-01", pages: 60, minutes: 70 }] },
    { path: "Games/Elden.md", title: "Elden Ring", kind: "game", finished: "2025-04-01", rating: null, sessions: [] },
    { path: "Books/Old.md", title: "Old", kind: "book", finished: "2024-04-01", rating: null, sessions: [] },
  ],
  grades: [
    { path: "Decks/Kana.md", grade: "good", ts: ts("2025-01-02") },
    { path: "Decks/Kana.md", grade: "again", ts: ts("2025-01-02") },
    { path: "Decks/Kana.md", grade: "easy", ts: ts("2024-12-30") },
  ] satisfies ReviewGrade[],
  edges: [
    { source: "Essays/On reading.md", target: "Hub.md" },
    { source: "Daily/2025-01-01.md", target: "Hub.md" },
    { source: "Daily/2025-03-10.md", target: "Books/Dune.md" },
    { source: "Essays/Old.md", target: "Books/Dune.md" },
    { source: "Essays/On reading.md", target: "Essays/On reading.md" },
  ],
};

const EXPECTED = `${REVIEW_START}

## At a glance

- 2 notes begun; 1620 words written in them and the daily notes
- 2 days with a daily note
- 11 sigil ticks
- 2 cards reviewed on this device
- 100 pages read in 2 sittings
- 1 book finished

## Months

| Month | Notes | Daily notes | Sigil ticks | Cards | Pages |
| --- | ---: | ---: | ---: | ---: | ---: |
| January | 1 | 1 | 11 | 2 | 0 |
| February | 1 | 0 | 0 | 0 | 40 |
| March | 0 | 1 | 0 | 0 | 60 |
| April | 0 | 0 | 0 | 0 | 0 |
| May | 0 | 0 | 0 | 0 | 0 |
| June | 0 | 0 | 0 | 0 | 0 |
| July | 0 | 0 | 0 | 0 | 0 |
| August | 0 | 0 | 0 | 0 | 0 |
| September | 0 | 0 | 0 | 0 | 0 |
| October | 0 | 0 | 0 | 0 | 0 |
| November | 0 | 0 | 0 | 0 | 0 |
| December | 0 | 0 | 0 | 0 | 0 |

## Sigils

- [[Sigils/Morning|Morning]] — 11 ticks · best streak 3 days

## Books finished

- [[Books/Dune|Dune]] — finished 2025-03-04 · ★ 4/5

## Most linked

- [[Hub]] — 2 links
- [[Books/Dune|Dune]] — 1 link

${REVIEW_END}`;

describe("the year added up", () => {
  it("renders the fixture vault byte for byte", () => {
    assert.equal(yearReviewBlock(yearNumbers(FIXTURE), WORDS), EXPECTED);
  });

  it("is deterministic: the same vault, the same bytes", () => {
    assert.equal(yearReviewBlock(yearNumbers(FIXTURE), WORDS), yearReviewBlock(yearNumbers({ ...FIXTURE, notes: [...FIXTURE.notes].reverse(), edges: [...FIXTURE.edges].reverse() }), WORDS));
  });

  it("walks every day of a past year, and stops at today inside the current one", () => {
    assert.equal(daysOfYear(2025, "2026-09-23").length, 365);
    assert.equal(daysOfYear(2024, "2026-09-23").length, 366);
    assert.deepEqual(daysOfYear(2026, "2026-01-03"), ["2026-01-01", "2026-01-02", "2026-01-03"]);
  });

  it("reads a streak with the Sigil card's rule: a partial day breaks it", () => {
    // 1 and 2 complete, 3 partial, 4–6 complete: the best run is three days.
    assert.equal(bestStreak(FIXTURE.sigils[0], daysOfYear(2025, "2026-09-23"), "2026-09-23"), 3);
  });

  it("offers the years the vault holds anything in, newest first", () => {
    assert.deepEqual(reviewYears(FIXTURE.notes, FIXTURE.daily, FIXTURE.sigils, "2026-09-23"), [2025, 2024]);
  });

  it("files the note under Reviews/", () => {
    assert.equal(reviewPath(2025), "Reviews/2025.md");
  });
});

describe("writing the note", () => {
  const block = yearReviewBlock(yearNumbers(FIXTURE), WORDS);

  it("opens a new note with its lead line", () => {
    assert.equal(mergeYearReview(null, block, WORDS.lead), `2025 in review\n\n${block}\n`);
  });

  it("rewrites only the block between the markers on a second run", () => {
    const first = mergeYearReview(null, block, WORDS.lead);
    const annotated = `${first.replace("2025 in review", "2025 in review\n\nA year of reading.")}\n## My own notes\n\nKept.\n`;
    const next = yearReviewBlock(yearNumbers({ ...FIXTURE, notes: [...FIXTURE.notes, note("Essays/Late.md", "2025-12-30", 5)] }), WORDS);
    const second = mergeYearReview(annotated, next, WORDS.lead);
    assert.ok(second.startsWith("2025 in review\n\nA year of reading.\n\n"));
    assert.ok(second.endsWith("\n## My own notes\n\nKept.\n"));
    assert.ok(second.includes("- 3 notes begun"));
    assert.equal(second.split(REVIEW_START).length, 2, "one block, never two");
  });

  it("appends the block when the markers were taken out", () => {
    assert.equal(mergeYearReview("My year.\n", block, WORDS.lead), `My year.\n\n${block}\n`);
  });
});
