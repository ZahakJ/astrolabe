// SITTINGS FROM PROGRESS — the day a book moved, written down as a sitting.
//
// The reader's clock (client/books/session.ts) logs a sitting when a PDF is
// closed. A book read on paper never passes through it: the owner presses +
// on the Media page, or types a new number into `progress:`, and the day the
// pages were read left no trace the calendar could list. This module is the
// rule that fills that gap, and it is PURE (tests/sittings.test.ts): the
// server (server/sittings.ts) calls it from the indexer every time a note is
// read, and writes what it answers into the tracker's own `sessions:` block.
//
// THE LINE IS THE READER'S SHAPE with one mark:
//
//     2026-09-27 | 139–160 | 21 pages | ~32 min
//     2026-09-27 | 3–5 | 2 chapters | ~60 min | default pace
//
// `~` before the minutes says the time was ESTIMATED, not measured; the last
// segment says the estimate rests on the stated defaults and not on the
// reader's own pace. The parser (shared/tracker.ts parseSessionLine) reads
// both, so every surface that reads sittings reads these too, and none of
// them mistakes a guess for a clock.
//
// WHAT COUNTS AS A MOVE. The server remembers, per tracker, the progress it
// last saw (`SeenTracker`). A forward move with no new measured sitting in
// the same save is a sitting; a move the save's own sitting accounts for
// (the reader's close-book write moves `progress:` and appends its line
// together) is not; a move backwards writes nothing new — but it takes back
// what the day's own estimated line had counted, up to all of it, because
// "+, +, − oops" on the Media page and a mistyped number corrected a moment
// later are corrections, not reading. Several forward moves on one day fold
// into the one line the instance wrote that day, found by its exact text: a
// line the owner has edited is theirs, and is never rewritten.
//
// THE HIGH-WATER MARK. A number typed into the editor autosaves on the way:
// `62` → `6` → `70`. Counted naively that is a move backwards and then a
// sixty-four-page sitting. So within one day a backward move that no line
// absorbed does not lower the floor the next forward move counts from: the
// day's reading starts at the most the book had reached that day.

import { formatSessionLine, parseSessionLine, trackerCountsPages, type Tracker, type TrackerSession } from "./tracker.ts";

/** What the server remembers about one tracker between two reads of its
 *  note — the whole of `trackers-progress.json`, one of these per tracker. */
export interface SeenTracker {
  /** The title it had: a different tracker at the same index (one inserted
   *  above it) is a first sighting, not a move. */
  title: string;
  /** The progress last seen. */
  done: number;
  /** The most the progress reached on `day`; the next forward move that day
   *  counts from here, not from a dip on the way to a typed number. */
  high: number;
  /** The instance's local day `high` belongs to. */
  day: string;
  /** Every measured sitting line in the block, canonically formatted — so a
   *  save that ADDS one is recognised as accounting for its own move. */
  measured: string[];
  /** The exact text of the estimated line the instance last wrote here, or
   *  null. Only a line still reading exactly this is ever rewritten. */
  line: string | null;
}

/** What one read of a tracker asks of the note. */
export type SittingAction =
  | { kind: "add"; from: number; to: number }
  | { kind: "shrink"; by: number }
  | null;

/** Is this a tracker whose moves are READING? The kinds the calendar's
 *  Reading section lists — the ones the reader logs sittings into: a book,
 *  or a bare fence (no kind) that counts pages. A game's hours and a show's
 *  episodes are not sittings with a book. */
export function isReadingTracker(tracker: Pick<Tracker, "kind" | "kindKey" | "unit">): boolean {
  if (tracker.kindKey === "book") return true;
  return tracker.kind === null && trackerCountsPages(tracker);
}

/** Canonical text of every measured sitting — the multiset `measured`. */
export function measuredLines(sessions: readonly TrackerSession[]): string[] {
  return sessions.filter((s) => s.estimate === undefined).map(formatSessionLine);
}

/** Lines in `now` that are not in `before`, counting duplicates. */
function added(before: readonly string[], now: readonly string[]): number {
  const pool = new Map<string, number>();
  for (const line of before) pool.set(line, (pool.get(line) ?? 0) + 1);
  let n = 0;
  for (const line of now) {
    const left = pool.get(line) ?? 0;
    if (left > 0) pool.set(line, left - 1);
    else n++;
  }
  return n;
}

/** The count an estimated line holds — its pages, or its other unit. */
export function lineCount(session: TrackerSession): number {
  return session.count ?? session.pages;
}

/** One read of one tracker, against what was seen before. Answers the new
 *  memory and what (if anything) to do to the note. `prev` undefined is the
 *  first sighting, which writes nothing: a tracker met for the first time
 *  has no "before" to have moved from. */
export function observeProgress(
  prev: SeenTracker | undefined,
  tracker: Pick<Tracker, "title" | "done" | "kind" | "kindKey" | "unit" | "sessions" | "sittings">,
  today: string,
): { seen: SeenTracker | null; action: SittingAction } {
  if (tracker.done === null) return { seen: null, action: null };
  const done = tracker.done;
  const measured = measuredLines(tracker.sessions);
  const fresh: SeenTracker = { title: tracker.title, done, high: done, day: today, measured, line: prev?.line ?? null };
  if (prev === undefined || prev.title !== tracker.title) return { seen: { ...fresh, line: null }, action: null };
  // A new day starts its floor where yesterday ended.
  const floor = prev.day === today ? Math.max(prev.done, prev.high) : prev.done;
  // Off for this tracker, or not a reading kind: remember, never write, so
  // switching `sittings: manual` off later does not count the gap.
  if (tracker.sittings === "manual" || !isReadingTracker(tracker)) return { seen: fresh, action: null };
  // The save brought its own sitting: that line is the account of the move.
  if (added(prev.measured, measured) > 0) return { seen: fresh, action: null };
  if (done > floor) return { seen: fresh, action: { kind: "add", from: floor, to: done } };
  if (done < prev.done) {
    // Backwards. What the day's own line can give back, it gives back (the
    // server does it and lowers the floor by what it took); the rest of the
    // dip is remembered only as the floor, see THE HIGH-WATER MARK.
    const own = prev.line !== null && prev.day === today ? parseSessionLine(prev.line) : null;
    const present = own !== null && tracker.sessions.some((s) => formatSessionLine(s) === prev.line);
    const by = present && own !== null ? Math.min(prev.done - done, lineCount(own)) : 0;
    return { seen: { ...fresh, high: floor }, action: by > 0 ? { kind: "shrink", by } : null };
  }
  return { seen: { ...fresh, high: prev.day === today ? floor : done }, action: null };
}

// ── The estimate ────────────────────────────────────────────────────────────

/** Minutes a unit takes when nothing measured says otherwise. Pages are
 *  a minute and a half — a steady non-fiction page; a chapter is twenty such
 *  pages, a section about seven, a part eighty. Hours and minutes are their
 *  own length. Any other word gets ten minutes. Stated in docs/trackers.md. */
export const DEFAULT_MINUTES: Readonly<Record<SittingUnit, number>> = {
  pages: 1.5,
  chapters: 30,
  sections: 10,
  parts: 120,
  hours: 60,
  minutes: 1,
  other: 10,
};

export type SittingUnit = "pages" | "chapters" | "sections" | "parts" | "hours" | "minutes" | "other";

const UNIT_WORDS: Record<string, SittingUnit> = {
  page: "pages", pages: "pages", p: "pages", pp: "pages", "صفحة": "pages", "صفحات": "pages", "ص": "pages",
  chapter: "chapters", chapters: "chapters", ch: "chapters", "فصل": "chapters", "فصول": "chapters",
  section: "sections", sections: "sections", "قسم": "sections", "أقسام": "sections",
  part: "parts", parts: "parts", volume: "parts", volumes: "parts", "جزء": "parts", "أجزاء": "parts", "مجلد": "parts", "مجلدات": "parts",
  hour: "hours", hours: "hours", hrs: "hours", "ساعة": "hours", "ساعات": "hours",
  minute: "minutes", minutes: "minutes", min: "minutes", mins: "minutes", "دقيقة": "minutes", "دقائق": "minutes",
};

/** A unit word (either language) → the unit the estimate knows it by. No
 *  word is pages, the book's own unit. */
export function sittingUnit(word: string | null | undefined): SittingUnit {
  const w = (word ?? "").trim().toLowerCase();
  if (w === "") return "pages";
  return UNIT_WORDS[w] ?? "other";
}

/** The unit a session line is counted in. */
function unitOfSession(s: TrackerSession): SittingUnit {
  return s.unit === undefined ? "pages" : sittingUnit(s.unit);
}

/** Minutes a unit over the last five MEASURED sittings counted in `unit`
 *  with both a count and minutes — a ratio of sums, as readingSpeed is. */
export function minutesPerUnit(sessions: readonly TrackerSession[], unit: SittingUnit): number | null {
  const timed = sessions
    .filter((s) => s.estimate === undefined && s.minutes > 0 && lineCount(s) > 0 && unitOfSession(s) === unit)
    .slice(-5);
  const minutes = timed.reduce((n, s) => n + s.minutes, 0);
  const count = timed.reduce((n, s) => n + lineCount(s), 0);
  return minutes > 0 && count > 0 ? minutes / count : null;
}

export interface EstimateInput {
  /** How many units were read. */
  count: number;
  /** The tracker's `unit:` word, or null (pages). */
  unit: string | null;
  /** This tracker's sittings. */
  own: readonly TrackerSession[];
  /** Every sitting of every book tracker in the vault. */
  vault: readonly TrackerSession[];
  /** The tracker's total, in its own unit. */
  total: number | null;
  /** Pages in the book, when the instance knows it (the `file:` PDF). */
  bookPages: number | null;
}

/** THE RULE, in one place. The reader's own pace first — minutes a unit
 *  from this tracker's measured sittings; else from every measured book
 *  sitting in the vault in the same unit; else, for a count that is not in
 *  pages, the book's pages spread over its total (a 300-page book in 12
 *  chapters is 25 pages a chapter) at the reader's page pace or the default
 *  one; else the default for the unit. `basis` says whether the reader's
 *  pace was behind the number. Never less than a minute. */
export function estimateMinutes(input: EstimateInput): { minutes: number; basis: "pace" | "default" } {
  const unit = sittingUnit(input.unit);
  const done = (rate: number, basis: "pace" | "default") => ({ minutes: Math.max(1, Math.round(input.count * rate)), basis });
  const own = minutesPerUnit(input.own, unit);
  if (own !== null) return done(own, "pace");
  const vault = minutesPerUnit(input.vault, unit);
  if (vault !== null) return done(vault, "pace");
  if (unit !== "pages" && unit !== "hours" && unit !== "minutes" && input.bookPages !== null && input.bookPages > 0 && input.total !== null && input.total > 0) {
    const pagePace = minutesPerUnit(input.own, "pages") ?? minutesPerUnit(input.vault, "pages");
    return done((input.bookPages / input.total) * (pagePace ?? DEFAULT_MINUTES.pages), pagePace !== null ? "pace" : "default");
  }
  return done(DEFAULT_MINUTES[unit], "default");
}

/** The estimated sitting for `count` units on `day`, as a session. */
export function estimatedSession(day: string, from: number | null, to: number | null, count: number, unitWord: string | null, estimate: { minutes: number; basis: "pace" | "default" }): TrackerSession {
  const pages = sittingUnit(unitWord) === "pages";
  const round = (n: number) => Math.round(n * 100) / 100;
  // A range is whole units or nothing: `139–160` reads back, `2.5–3` would not.
  const ranged = from !== null && to !== null && Number.isInteger(from) && Number.isInteger(to) && to > from;
  const session: TrackerSession = {
    date: day,
    from: ranged ? from : null,
    to: ranged ? to : null,
    pages: pages ? round(count) : 0,
    minutes: estimate.minutes,
    estimate: estimate.basis,
  };
  if (!pages) {
    session.count = round(count);
    session.unit = (unitWord ?? "").trim();
  }
  return session;
}

// ── The block, edited surgically ────────────────────────────────────────────
//
// The reader's append goes through setTrackerFields, which re-renders the
// whole block. This path may not: it runs on every save of every book, and
// a measured line the owner indented their own way must come back byte for
// byte. So these two touch exactly one line.

const FIELD_LINE = /^(\s*)([A-Za-z][\w-]*)\s*:(.*)$/;

function lines(body: string): string[] {
  return body.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

function strip(line: string): [string, string] {
  const eol = /(\r?\n)?$/.exec(line)?.[1] ?? "";
  return [line.slice(0, line.length - eol.length), eol];
}

/** The `sessions:` block's key line and the index after its last line. */
function sessionsBlock(parts: string[]): { key: number; end: number; indent: string } | null {
  for (let i = 0; i < parts.length; i++) {
    const m = FIELD_LINE.exec(strip(parts[i])[0]);
    if (!m || m[2].toLowerCase() !== "sessions" || !/^\s*[|>][-+]?\s*$/.test(m[3])) continue;
    let end = i + 1;
    let last = i;
    let indent = `${m[1]}  `;
    for (; end < parts.length; end++) {
      const [text] = strip(parts[end]);
      if (text.trim() === "") continue;
      if (!/^\s/.test(text)) break;
      last = end;
      indent = /^\s*/.exec(text)?.[0] ?? indent;
    }
    return { key: i, end: last + 1, indent };
  }
  return null;
}

/** The body with the line reading exactly `old` (inside the sessions
 *  block) replaced by `next`, or removed when `next` is null; null when no
 *  such line is there any more — the owner edited or deleted it. */
export function replaceSittingLine(body: string, old: string, next: string | null): string | null {
  const parts = lines(body);
  const block = sessionsBlock(parts);
  if (block === null) return null;
  for (let i = block.key + 1; i < block.end; i++) {
    const [text, eol] = strip(parts[i]);
    if (text.trim() !== old) continue;
    if (next === null) {
      parts.splice(i, 1);
      // The block's last line gone takes the key with it, as the reader's
      // Undo does: a fence left with `sessions: |` and nothing under it.
      const rest = sessionsBlock(parts);
      if (rest !== null && rest.end === rest.key + 1) parts.splice(rest.key, 1);
    } else {
      const lead = /^\s*/.exec(text)?.[0] ?? "";
      parts[i] = `${lead}${next}${eol}`;
    }
    return parts.join("");
  }
  return null;
}

/** The body with `line` appended to its sessions block, at the block's own
 *  indent — or null when the fence has no block yet (the caller then lets
 *  setTrackerFields create one, the reader's way). */
export function appendSittingLine(body: string, line: string): string | null {
  const parts = lines(body);
  const block = sessionsBlock(parts);
  if (block === null) return null;
  const eol = /(\r\n|\n)/.exec(body)?.[1] ?? "\n";
  if (block.end > 0 && !/\n$/.test(parts[block.end - 1])) parts[block.end - 1] += eol;
  const terminated = block.end < parts.length || /\n$/.test(body);
  parts.splice(block.end, 0, `${block.indent}${line}${terminated ? eol : ""}`);
  return parts.join("");
}
