// "HIGHLIGHTS → NOTE", the shelf's half. The pure module
// (shared/highlightsNote.ts) decides what the note says; this fetches the
// three things it needs — the book's highlights from the store, its
// outline from pdf.js, the note as it stands — and writes the answer
// beside the PDF.
//
// THE NOTE LIVES BESIDE THE BOOK, named after it: `Books/Muqaddimah.pdf`
// gets `Books/Muqaddimah — Highlights.md` (an Arabic instance spells the
// suffix in Arabic, and either spelling is found again on a re-run, so a
// chrome language flipped between two runs does not fork the note). The
// write goes through applyNoteContent: an editor holding the note takes it
// as one undoable step, and the markers keep the reader's own prose safe
// either way.
//
// The document is opened for its outline only and destroyed at once —
// the same discipline covers.ts keeps, because a worker-side heap is not a
// handle and a shelf that leaks one per click is a shelf that stalls.

import { highlightsBlock, mergeHighlightsNote } from "../../shared/highlightsNote.ts";
import type { OutlineEntry } from "../../shared/highlightsNote.ts";
import { noteTitleOf } from "../../shared/noteFormat.ts";
import type { BookEntry } from "../../shared/types.ts";
import { countPhrase, localeNum, t, tf } from "../i18n.ts";
import { treeHasPath } from "../media/mediaModel.ts";
import { applyNoteContent, noteContent } from "../sectionActions.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { actionToast } from "../undoToast.ts";
import { ApiError } from "../api.ts";
import { getBookHighlights } from "./api.ts";
import { readOutline } from "./outline.ts";
import { closeDocument, openDocument } from "./pdfjs.ts";
import { bookTitleOf } from "./session.ts";

/** The suffix in each chrome language — both are looked for, so the note
 *  is one note whichever language wrote it first. */
const SUFFIXES = { en: "Highlights", ar: "اقتباسات" } as const;

/** Where the note goes: beside the PDF, under the book's file name and the
 *  suffix. An existing note in either spelling wins over a new one. */
export function highlightsNotePath(pdfPath: string, tree: ReturnType<typeof useStore.getState>["tree"]): string {
  const slash = pdfPath.lastIndexOf("/");
  const folder = slash === -1 ? "" : pdfPath.slice(0, slash + 1);
  const base = pdfPath.slice(slash + 1).replace(/\.pdf$/i, "");
  const candidates = [t("bookHighlightsNoteSuffix"), ...Object.values(SUFFIXES)].map((suffix) => `${folder}${base} — ${suffix}.md`);
  return candidates.find((p) => treeHasPath(tree, p)) ?? candidates[0];
}

/** Write (or rewrite) the book's highlights note, and say where it went. */
export async function writeHighlightsNote(entry: BookEntry): Promise<void> {
  let highlights;
  try {
    highlights = (await getBookHighlights(entry.key)).highlights;
  } catch {
    toast(t("bookHighlightsFailed"), "error");
    return;
  }
  if (highlights.length === 0) {
    toast(t("bookHighlightsNone"));
    return;
  }
  let outline: OutlineEntry[] = [];
  try {
    const doc = await openDocument(entry.path);
    try {
      outline = await readOutline(doc);
    } finally {
      closeDocument(doc);
    }
  } catch {
    // A book whose outline will not read gets one list, which is what a
    // book with no outline gets — the action must not fail on it.
  }
  const state = useStore.getState();
  const path = highlightsNotePath(entry.path, state.tree);
  const title = bookTitleOf(entry);
  // Plain substitution rather than tf(): tf() wraps every value in bidi
  // isolates, which is right for a toast and wrong inside a wikilink's
  // target or label, where the note has to spell the file's name exactly.
  const labelFor = (page: number): string => t("bookCiteLabel").replace("{title}", title).replace("{page}", localeNum(page));
  const lead = t("bookHighlightsLead").replace("{book}", entry.name);
  const block = highlightsBlock({ highlights, outline, target: entry.name, labelFor });
  try {
    // The note as it is on disk, asked for rather than read off the tree:
    // a note made a moment ago may not be in the tree this tab holds yet,
    // and "not in the tree" taken as "does not exist" would overwrite the
    // prose the reader just wrote around the block. Only a 404 means new.
    const existing = await noteContent(path).catch((err: unknown) => {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    });
    await applyNoteContent(path, mergeHighlightsNote(existing, block, lead));
  } catch {
    toast(t("bookHighlightsFailed"), "error");
    return;
  }
  actionToast(tf("bookHighlightsWritten", { count: countPhrase(highlights.length, "highlights"), note: noteTitleOf(path) }), t("bookHighlightsOpen"), () => {
    // The action was pressed on the shelf, and a pane still in library mode
    // would open the tab behind the shelf — a note the reader cannot see.
    // The shelf closes first, as it does when a book is opened from it.
    const s = useStore.getState();
    s.closeLibrary();
    s.openNote(path);
  });
}
