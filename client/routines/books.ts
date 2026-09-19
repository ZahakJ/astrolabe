// THE SIGIL ↔ BOOK LINK. A sigil slot that names a book — with a wikilink
// to its tracker note or to the PDF itself ("evening: 20 pages of
// [[Muqaddimah]]"), or through the plan's own `book:` line, which adds
// "Read N pages of it" to every day — is the day's reading in the plan,
// and the reader is where the reading happens. So a session that ends in
// the reader ticks the slot for today, through the tick route the checkbox
// already uses, exactly as a study session that leaves nothing due ticks a
// slot that links its deck (client/routines/orbits.ts, the pattern this
// file copies rather than generalises: two callers, two small files, and
// the Sigils page untouched).
//
// The `book:` task is ticked only when the sitting covered the day's ask —
// the tracker's pace, or any page at all when the tracker names none — so
// a two-page glance does not seal a twenty-page day. A linked slot is
// ticked on any logged session: the slot's text is the reader's own
// wording of the ask, and the app cannot read "a chapter" off it.
//
// Nothing here is state: the tick is the log line the checkbox writes, and
// the way back (the toast's Undo) is the same route with yesterday's list.

import { tasksFor, type RoutineTask } from "../../shared/routine.ts";
import { stripNoteExt } from "../../shared/noteFormat.ts";
import type { RoutineMeta } from "../../shared/types.ts";
import { getRoutines, updateRoutine } from "../api.ts";
import { parseWikilink, WIKILINK_RE } from "../editor/links.ts";
import { useStore } from "../state.ts";
import { linksOf } from "./orbits.ts";

export interface BookSessionFacts {
  /** The tracker note the session was logged to, and the fence's title. */
  trackerPath: string;
  trackerTitle: string;
  /** The book's vault path — a `.pdf` or a `.epub`. */
  bookPath: string;
  pages: number;
  /** The tracker's `pace:` — the day's ask for a `book:` task. */
  pace: number | null;
  /** The day the sitting happened — today for a session ended in the
   *  reader, an earlier day for one a closed tab left behind and the next
   *  open logged. The tick goes on THAT day's row: a sitting read on
   *  Tuesday is Tuesday's slot, and ticking Wednesday's for it would seal a
   *  day nobody read on. */
  date: string;
}

function sameKey(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function samePath(a: string, b: string): boolean {
  return stripNoteExt(a).toLowerCase() === stripNoteExt(b).toLowerCase();
}

/** True when a wikilink's target names the BOOK: its whole path, or its file
 *  name, with or without the extension. Either format — a sigil that says
 *  "read [[Adonis.epub]]" ticks on the sitting that read it, exactly as one
 *  naming a PDF does. */
function namesBook(target: string, bookPath: string): boolean {
  const ext = /\.(pdf|epub)$/i;
  const t = target.trim().toLowerCase().replace(ext, "");
  const full = bookPath.toLowerCase().replace(ext, "");
  return t === full || t === (full.split("/").pop() ?? full);
}

/** Whether this task, on this day, is about this book. */
function taskIsBook(task: RoutineTask, facts: BookSessionFacts): boolean {
  if (task.book) return task.text !== null && sameKey(task.text, facts.trackerTitle) && facts.pages >= (facts.pace ?? 1);
  const tree = useStore.getState().tree;
  if (linksOf(task, tree).some((l) => l.path !== null && samePath(l.path, facts.trackerPath))) return true;
  const text = task.text ?? task.key;
  for (const m of text.matchAll(WIKILINK_RE)) {
    if (namesBook(parseWikilink(m[1]).target, facts.bookPath)) return true;
  }
  return false;
}

/** Tick, for today, every sigil task that is about the book just read.
 *  Resolves to how many were ticked and the way to untick exactly those;
 *  a failure to read or write is a quiet zero — the session's own toast is
 *  what the reader is looking at, and the log line is the fact that
 *  matters. */
export async function tickSlotsForBook(facts: BookSessionFacts): Promise<{ ticked: number; revert: () => Promise<void> }> {
  const today = facts.date;
  const nothing = { ticked: 0, revert: async () => undefined };
  let routines: RoutineMeta[];
  try {
    routines = await getRoutines();
  } catch {
    return nothing;
  }
  const reverts: (() => Promise<void>)[] = [];
  let ticked = 0;
  for (const meta of routines) {
    if (meta.template) continue;
    const entry = meta.entries.find((e) => e.date === today) ?? null;
    const before = entry?.done ?? [];
    let done = before;
    for (const task of tasksFor(meta.plan, today)) {
      if (done.some((d) => sameKey(d, task.key)) || !taskIsBook(task, facts)) continue;
      done = [...done, task.key];
      ticked++;
    }
    if (done === before) continue;
    try {
      await updateRoutine(meta.path, meta.index, { date: today, done });
      reverts.push(() => updateRoutine(meta.path, meta.index, { date: today, done: before }).then(() => undefined));
    } catch {
      ticked -= done.length - before.length;
    }
  }
  return {
    ticked,
    revert: async () => {
      for (const r of reverts) await r().catch(() => undefined);
    },
  };
}
