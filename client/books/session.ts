// A READING SESSION, LOGGED. The reader's clock (shared/readingSession.ts)
// says "27 pages in 41 minutes"; this module says where that goes.
//
// IT GOES INTO THE BOOK'S TRACKER NOTE, and nowhere else. The tracker is
// found by its `file:` line when one names this PDF, and by its title
// otherwise (the PDF's own /Title or its file name, against `kind: book`
// trackers) — so a shelf that was set up before `file:` existed still
// works, and a reader who wants two editions kept apart writes the line.
// The fence gains one `sessions:` line and, when it counts pages, its
// progress moves by the pages read; the tracker card's "4 h 20 left" is
// read back off those lines. The write goes through applyNoteContent, so
// an editor holding the note takes it as one undoable transaction, and the
// toast's Undo takes the line and the nudge back out of the note as it is
// THEN — not a snapshot from before, which would also undo whatever the
// reader typed in between.
//
// NO TRACKER, NO GUESSING. A book with no tracker gets a toast that says
// so and offers to make one — a `Media/Books/<title>.md` note with the
// fence the Media page would write, `file:` pointing at this PDF and the
// session already in it. The offer is a button; the app never files a
// note for a reader who did not ask.
//
// THE STASH. Between page turns the clock is written to localStorage under
// the book's key, and cleared when the session is logged. A tab closed
// mid-sitting (the commonest end of a session, and one no fetch survives)
// is therefore logged the next time the same book opens — a toast then, an
// Undo on it, and the new sitting starts clean. Per-device, a cache, and
// nothing the vault does not learn within a day.

import { mediaNoteContent, mediaNotePath, mediaProgress, MEDIA_ROOTS } from "../../shared/media.ts";
import { noteTitleOf } from "../../shared/noteFormat.ts";
import { parseClock, type SessionClock, type SessionSummary } from "../../shared/readingSession.ts";
import { isoDate } from "../../shared/routine.ts";
import { appendTrackerSession, dropLastTrackerSession, editTrackerFence, foldKind, formatSessionLine, setTrackerProgress, trackerCountsPages, type TrackerSession } from "../../shared/tracker.ts";
import type { BookOpenResponse, TrackerMeta } from "../../shared/types.ts";
import { getTrackers, putNote } from "../api.ts";
import { countPhrase, t, tf } from "../i18n.ts";
import { treeHasFolder, treeHasPath } from "../media/mediaModel.ts";
import { tickSlotsForBook } from "../routines/books.ts";
import { applyNoteContent, noteContent } from "../sectionActions.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { formatDuration } from "../trackerUnits.ts";
import { actionToast } from "../undoToast.ts";

const STASH_PREFIX = "astrolabe.reading.session.";

/** The name a book goes by when its tracker has to be found by title: the
 *  PDF's own title, else its file name without the extension. */
export function bookTitleOf(entry: Pick<BookOpenResponse, "name" | "state">): string {
  return (entry.state?.title ?? "").trim() || entry.name.replace(/\.pdf$/i, "");
}

function samePdf(file: string, path: string): boolean {
  const a = file.toLowerCase().replace(/^\/+/, "");
  const b = path.toLowerCase();
  if (a === b) return true;
  const base = b.split("/").pop() ?? b;
  return a === base || a.replace(/\.pdf$/, "") === base.replace(/\.pdf$/, "");
}

/** The tracker for this PDF: by `file:` first, then by title among book
 *  trackers (and trackers of no kind, which is what a bare fence is). Null
 *  when nothing on the shelf names it. */
export async function findBookTracker(entry: Pick<BookOpenResponse, "path" | "name" | "state">, shelf?: TrackerMeta[]): Promise<TrackerMeta | null> {
  const list = shelf ?? (await getTrackers().catch(() => [] as TrackerMeta[]));
  const byFile = list.find((m) => m.file !== null && samePdf(m.file, entry.path));
  if (byFile) return byFile;
  const title = bookTitleOf(entry).toLowerCase();
  return list.find((m) => m.title.trim().toLowerCase() === title && (foldKind(m.kind) === "book" || m.kind === null)) ?? null;
}

// ── The stash ───────────────────────────────────────────────────────────────

export function readStash(key: string): SessionClock | null {
  try {
    const raw = localStorage.getItem(STASH_PREFIX + key);
    return raw === null ? null : parseClock(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeStash(key: string, clock: SessionClock): void {
  try {
    localStorage.setItem(STASH_PREFIX + key, JSON.stringify(clock));
  } catch {
    // A full or blocked store costs a session on a closed tab, nothing more.
  }
}

export function clearStash(key: string): void {
  try {
    localStorage.removeItem(STASH_PREFIX + key);
  } catch {
    // see writeStash
  }
}

// ── The log ─────────────────────────────────────────────────────────────────

function sessionOf(summary: SessionSummary, date: string): TrackerSession {
  return { date, from: summary.from, to: summary.to, pages: summary.pages, minutes: summary.minutes };
}

/** Log a finished sitting: the tracker's fence, the sigils' tick, the
 *  toast with its Undo. `date` defaults to today; the stash hands in the
 *  day the sitting actually happened. Never throws — a session that will
 *  not log says so in a toast. */
export async function logSession(entry: BookOpenResponse, summary: SessionSummary, date: string = isoDate(new Date())): Promise<void> {
  const pages = countPhrase(summary.pages, "pages");
  const time = formatDuration(summary.minutes);
  const session = sessionOf(summary, date);
  const meta = await findBookTracker(entry);
  if (meta === null) {
    actionToast(tf("bookSessionNoTracker", { pages, time }), t("bookSessionTrackIt"), () => {
      void trackBook(entry, session);
    });
    return;
  }
  let before: string;
  let after: string;
  try {
    before = await noteContent(meta.path);
    after = editTrackerFence(before, meta.index, (body) => {
      let next = appendTrackerSession(body, session);
      // The bar moves by the pages read only when the bar counts pages: a
      // tracker kept in chapters is the reader's to move.
      if (trackerCountsPages({ unit: meta.unit, kindKey: foldKind(meta.kind) })) next = setTrackerProgress(next, summary.pages);
      return next;
    });
    if (after !== before) await applyNoteContent(meta.path, after);
  } catch {
    toast(t("bookSessionFailed"), "error");
    return;
  }
  const tick = await tickSlotsForBook({ trackerPath: meta.path, trackerTitle: meta.title, pdfPath: entry.path, pages: summary.pages, pace: meta.pace });
  actionToast(tf("bookSessionLogged", { pages, time, note: noteTitleOf(meta.path) }), t("undo"), () => {
    void (async () => {
      try {
        // The note as it is NOW, minus this one line and this one nudge —
        // not the snapshot from before, which would undo anything the
        // reader typed in the meantime.
        const current = await noteContent(meta.path);
        const reverted = editTrackerFence(current, meta.index, (body) => {
          let next = dropLastTrackerSession(body);
          if (trackerCountsPages({ unit: meta.unit, kindKey: foldKind(meta.kind) })) next = setTrackerProgress(next, -summary.pages);
          return next;
        });
        if (reverted !== current) await applyNoteContent(meta.path, reverted);
        await tick.revert();
        toast(t("bookSessionUndone"));
      } catch {
        toast(t("bookSessionFailed"), "error");
      }
    })();
  });
}

/** Make the tracker note the toast offered: the Media page's own shape,
 *  with `file:` and the session in it. */
async function trackBook(entry: BookOpenResponse, session: TrackerSession): Promise<void> {
  const state = useStore.getState();
  const title = bookTitleOf(entry);
  const path = mediaNotePath("book", title, {
    lang: state.siteLanguage,
    existing: MEDIA_ROOTS.filter((root) => treeHasFolder(state.tree, root)),
  });
  if (treeHasPath(state.tree, path)) {
    toast(tf("mediaExists", { path }), "error");
    return;
  }
  const pages = entry.state?.pages ?? 0;
  const at = session.to ?? entry.state?.page ?? 1;
  try {
    await putNote(
      path,
      mediaNoteContent({
        title,
        kind: "book",
        progress: pages > 0 ? mediaProgress(Math.min(at, pages), pages) : mediaProgress(at, null),
        status: "reading",
        started: session.date,
        file: entry.path,
        sessions: formatSessionLine(session),
      }),
    );
    toast(tf("bookSessionTracked", { title, path }));
  } catch {
    toast(t("bookSessionFailed"), "error");
  }
}
