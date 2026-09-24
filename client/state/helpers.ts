// The small rules the store's slices share: which edge "auto" resolves to,
// the shared empty values, the guarded write and its wait for a clean buffer,
// the delete toast, the dirty-map and path remaps, the surface table. Moved
// out of client/state.ts unchanged.

import { CALENDAR_TAB, FEEDS_TAB, GRAPH_TAB, MEDIA_TAB, ORBITS_TAB, REVIEW_WEEK_TAB, SIGILS_TAB, TIMELINE_TAB, TODAY_TAB, allPaths, type Workspace } from "../workspace.ts";
import type { FolderMark } from "../../shared/folderIcons.ts";
import { t, tf, type Lang } from "../i18n.ts";
import type { PublicFolderCard } from "../../shared/types.ts";
import type { SidebarSide, SidebarSidePref, State } from "./types.ts";
import { actionToast } from "../undoToast.ts";
import { defaultSide, useStore } from "../state.ts";
import { noteTitleOf } from "../../shared/noteFormat.ts";
import { toast } from "../toast.ts";

/** A note path as the reader knows it: the basename, minus `.md`. The toast
 *  that names a note is a sentence, not a file listing — and tf() bidi-isolates
 *  the value, so an Arabic title still reads correctly inside it. */
export function noteTitle(path: string): string {
  return noteTitleOf(path);
}

/** The empty folder→glyph map, shared. One frozen object rather than a fresh
 *  `{}` per loadMe: TreeRow is memoized over 1.4k rows, and the overwhelming
 *  majority of vaults mark nothing at all — those vaults should never see the
 *  store's `folderIcons` identity change and so never re-key a single row. */
export const NO_FOLDER_ICONS: Record<string, FolderMark> = Object.freeze({});

/** The empty public-folder list, shared. Same argument as NO_FOLDER_ICONS: a
 *  site with the feature off must never see this array's identity change. */
export const NO_PUBLIC_FOLDERS: PublicFolderCard[] = Object.freeze([]) as unknown as PublicFolderCard[];

/** Resolve the three-state preference against the language in force. */
export function effectiveSide(pref: SidebarSidePref, lang: Lang): SidebarSide {
  return pref === "auto" ? defaultSide(lang) : pref;
}

/** The dirty map names OPEN notes and nothing else. A bulk close that left
 *  entries behind would keep the unsaved count in "Close others (2 unsaved)"
 *  counting notes that are no longer anywhere — and that count is the whole
 *  reason those rows are trustworthy. */
export function dropDirty(dirty: Record<string, boolean>, ws: Workspace): Record<string, boolean> {
  const open = new Set(allPaths(ws));
  const out: Record<string, boolean> = {};
  for (const [path, flag] of Object.entries(dirty)) if (open.has(path)) out[path] = flag;
  return out;
}

export function remap(current: string, from: string, to: string): string {
  if (current === from) return to;
  if (current.startsWith(`${from}/`)) return to + current.slice(from.length);
  return current;
}

/** Resolve once `dirty[path]` clears (autosave landed), or after timeoutMs. */
export function waitForClean(path: string, timeoutMs: number): Promise<void> {
  if (!useStore.getState().dirty[path]) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      unsubscribe();
      resolve();
    }, timeoutMs);
    const unsubscribe = useStore.subscribe((s) => {
      if (!s.dirty[path]) {
        window.clearTimeout(timer);
        unsubscribe();
        resolve();
      }
    });
  });
}

/** What a delete says afterwards.
 *
 *  Three delete verbs named the trash and offered nothing to do about it
 *  (v1.8 UX audit F24) — which is a receipt, not a way back: the reader who
 *  deleted the wrong row had to know the trash browser exists, find it in the
 *  palette, and recognise the file among everything else in there. The `.trash`
 *  machinery has answered "put it back" since it shipped; the toast just never
 *  asked it. Mirrors move.ts's undo exactly, and for the same reason.
 *
 *  A PERMANENT delete keeps the plain sentence. There is nothing behind it,
 *  and an Undo button that cannot undo is worse than none. */
export function deletedToast(
  get: () => State,
  message: string,
  trashPath: string | undefined,
): void {
  if (trashPath === undefined) {
    toast(message);
    return;
  }
  // The trash entry's NAME is its id (server/vault.ts trashEntryAbs): the
  // basename of where it landed, which the delete answered with.
  const entry = trashPath.slice(trashPath.lastIndexOf("/") + 1);
  actionToast(message, t("undo"), () => {
    get()
      .restoreTrash(entry)
      .then((result) => {
        // Where it LANDED, said differently when that is not where it came
        // from — the same sentence the trash browser prints, because a
        // restore that quietly went somewhere else is the lie the delete
        // previews exist to stop telling.
        toast(
          tf(result.renamed ? "restoredRenamedToast" : "restoredToast", {
            name: entry,
            path: result.path,
          }),
        );
      })
      .catch((err: unknown) => {
        console.error("astrolabe: undoing a delete failed", err);
        toast(t("restoreFailed"), "error");
      });
  });
}

/** Run a store mutation, log any failure and tell the reader.
 *
 *  `failMessage` is a LOCALIZED line the caller supplies. Without it the toast
 *  used to fall back to `err.message`, which is the server's English log prose
 *  (CONTRACTS: "`error` is English prose written for a log and for curl. It is
 *  NOT a string any UI may print") — so an Arabic operator whose delete failed
 *  read "Note not found: x.md" inside a fully Arabic panel. Worse, the second
 *  fallback built its sentence out of the English `label` this function takes
 *  for the CONSOLE: a non-Error rejection put "toggling publish failed" on
 *  screen in literal English, a string no translation table has ever held
 *  (v1.8 UX audit F45).
 *
 *  Both are gone. The reader gets a localized line; the diagnosis stays where
 *  a diagnosis belongs — the console call above, which carries the whole error
 *  object. Callers that can say something more useful still pass their own
 *  line, and that is still the better answer. */
export async function guarded(
  label: string,
  fn: () => Promise<void>,
  failMessage?: string,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`astrolabe: ${label} failed`, err);
    toast(failMessage ?? t("actionFailed"), "error");
  }
}

/** The pages a pane can show that are not a note, by the name `setView`
 *  takes, and the virtual tab each one opens (client/workspace.ts). */
export type SurfaceView = "graph" | "media" | "sigils" | "orbits" | "review-week" | "calendar" | "feeds" | "today" | "timeline";
export const SURFACE_TABS: Record<SurfaceView, string> = {
  graph: GRAPH_TAB,
  media: MEDIA_TAB,
  sigils: SIGILS_TAB,
  orbits: ORBITS_TAB,
  "review-week": REVIEW_WEEK_TAB,
  calendar: CALENDAR_TAB,
  today: TODAY_TAB,
  timeline: TIMELINE_TAB,
  feeds: FEEDS_TAB,
};
export function isSurfaceView(view: string): view is SurfaceView {
  return Object.prototype.hasOwnProperty.call(SURFACE_TABS, view);
}
