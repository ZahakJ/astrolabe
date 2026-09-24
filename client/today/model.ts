// TODAY'S MODEL — what today asks of the reader, as data (docs/today.md).
//
// Today is drawn twice: as the phone's home tab (client/phone/screens/
// TodayScreen.tsx) and as a pane surface on the desktop (./TodayView.tsx,
// `~today`). Both read THIS and ./hooks.ts, and neither draws the other's
// chrome (scripts/shell-seam.mjs): the rows, the order they come in, what a
// tick writes and when the evening's question is asked are decided once.
//
// PURE — no store, no fetch, no DOM — so tests/todayModel.test.ts loads it.
// Every rule it applies is somebody else's already: a Sigil task is due when
// `tasksFor` says so (shared/routine.ts), a task is due when the Sigils page's
// own "due by today" fence would list it (shared/tasks.ts), a deck is due
// when its shelf count says so (the server's `isDue`), the reflection is
// whatever shared/reflection.ts reads under `## Reflection`.

import type { DeckMeta } from "../../shared/decks.ts";
import { reflectionOf, isEvening } from "../../shared/reflection.ts";
import { shiftDate, tasksFor, type RoutineTask } from "../../shared/routine.ts";
import { filterTasks, parseTasksFence } from "../../shared/tasks.ts";
import type { OnThisDayHit, RoutineMeta, TaskMeta } from "../../shared/types.ts";

/** One Sigil task due today, as a row that ticks in place. */
export interface SigilTaskRow {
  meta: RoutineMeta;
  task: RoutineTask;
  done: boolean;
  /** A course's day and a book's pages are answered on the sigil's own card,
   *  where the steps and the page count are; the row opens it instead. */
  onCard: boolean;
}

function sameKey(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Every task every (non-template) sigil asks of `today`, in the vault's
 *  sigil order, each marked with whether today's log already ticks it. */
export function sigilRows(routines: readonly RoutineMeta[], today: string): SigilTaskRow[] {
  const out: SigilTaskRow[] = [];
  for (const meta of routines) {
    if (meta.template) continue;
    const entry = meta.entries.find((e) => e.date === today) ?? null;
    for (const task of tasksFor(meta.plan, today)) {
      out.push({ meta, task, done: entry?.done.some((d) => sameKey(d, task.key)) ?? false, onCard: task.course === true || task.book === true });
    }
  }
  return out;
}

/** What ticking (or unticking) `row` makes of its sigil: the new meta to
 *  show at once, and the `done` list `POST /api/routine` is sent. The same
 *  edit the Sigil card dispatches — a list of keys for one date. */
export function toggledSigil(row: SigilTaskRow, today: string): { meta: RoutineMeta; done: string[] } {
  const entry = row.meta.entries.find((e) => e.date === today) ?? null;
  const was = entry?.done ?? [];
  const done = row.done ? was.filter((d) => !sameKey(d, row.task.key)) : [...was, row.task.key];
  const meta: RoutineMeta = {
    ...row.meta,
    entries: entry
      ? row.meta.entries.map((e) => (e === entry ? { ...e, done } : e))
      : [...row.meta.entries, { date: today, done, skipped: [], deferred: [], values: {}, note: null }],
  };
  return { meta, done };
}

/** One open task with a date that has come: due today, or overdue. */
export interface DueTaskRow extends TaskMeta {
  overdue: boolean;
}

/** The open tasks due today or before it — exactly the Sigils page's "Due by
 *  today" fence (`not done` / `due before tomorrow`), so the two pages list
 *  the same tasks — overdue first, oldest first, then by note and line. */
export function dueTasks(rows: readonly TaskMeta[], today: string): DueTaskRow[] {
  const spec = parseTasksFence(`not done\ndue before ${shiftDate(today, 1)}`, today);
  return filterTasks([...rows], spec)
    .filter((r) => !r.task.cancelled)
    .map((r) => ({ ...r, overdue: (r.task.due ?? today) < today }))
    .sort((a, b) => cmp(a.task.due ?? "", b.task.due ?? "") || cmp(a.title, b.title) || a.task.line - b.task.line);
}

/** The decks with cards due today, in the shelf's order. */
export function decksDue(decks: readonly DeckMeta[]): DeckMeta[] {
  return decks.filter((d) => d.counts.due > 0);
}

/** On this day: what was WRITTEN on this month-day in earlier years, and
 *  what was FINISHED, newest year first (the server's order kept). */
export function onThisDayRows(hits: readonly OnThisDayHit[]): OnThisDayHit[] {
  return [...hits].sort((a, b) => b.year - a.year || cmp(a.path, b.path));
}

/** Where the evening's question stands. `hidden` before six with nothing
 *  written; `ask` from six until an answer is under `## Reflection`; `done`
 *  once one is (shown, even the next morning, until the day turns). A daily
 *  note that does not exist yet is simply one with no reflection in it. */
export type ReflectionState = { kind: "hidden" } | { kind: "ask" } | { kind: "done"; text: string };

export function reflectionState(content: string | null, now: Date): ReflectionState {
  const written = content === null ? null : reflectionOf(content);
  if (written !== null && written !== "") return { kind: "done", text: written };
  return isEvening(now) ? { kind: "ask" } : { kind: "hidden" };
}

/** A tick's key for React — stable across a re-read of the vault. */
export function sigilRowKey(row: SigilTaskRow): string {
  return `${row.meta.path}#${row.meta.index}#${row.task.key}`;
}

export function taskRowKey(row: TaskMeta): string {
  return `${row.path}#${row.task.line}`;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
