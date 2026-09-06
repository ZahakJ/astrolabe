// THE MEDIA PAGE'S SHELVES, decided without the DOM.
//
// Everything on the page that is a decision rather than a drawing lives
// here: which shelf a tracker belongs on, the order the shelves come in, and
// how a card's count reads. Kept free of React and CSS so `node --test`
// (tests/media.test.ts) can hold the page to its promises — the same split
// shared/tracker.ts already made for the card.

import { defaultTrackerStep, foldKind, type TrackerKind, type TrackerStatus } from "../../shared/tracker.ts";
import type { TrackerMeta, TreeNode } from "../../shared/types.ts";

/** Does the vault already hold a file at `path`? Asked of the tree the store
 *  already has rather than of the server, because the form asks it before
 *  every create and a 404 for "not yet" is a red line in the console for a
 *  question whose usual answer is no. */
/** True when a FOLDER of this path stands in the tree (treeHasPath answers
 *  for files only). Used to find which media root a vault already has. */
export function treeHasFolder(tree: TreeNode | null, path: string): boolean {
  const want = path.toLowerCase();
  const walk = (node: TreeNode): boolean => {
    if (node.type !== "folder") return false;
    if (node.path.toLowerCase() === want) return true;
    return (node.children ?? []).some(walk);
  };
  return tree !== null && walk(tree);
}

export function treeHasPath(tree: TreeNode | null, path: string): boolean {
  const want = path.toLowerCase();
  const walk = (node: TreeNode): boolean => {
    if (node.type !== "folder") return node.path.toLowerCase() === want;
    return (node.children ?? []).some(walk);
  };
  return tree !== null && walk(tree);
}

/** A shelf is a kind, or the one shelf for kinds we have no word for. */
export type Shelf = TrackerKind | "other";

/** The page's reading order: the owner's three first, then the rest of the
 *  seven, then whatever words authors invented. A shelf with nothing on it
 *  is not drawn. */
export const SHELF_ORDER: Shelf[] = ["show", "game", "book", "film", "course", "project", "habit", "other"];

/** Which shelf a tracker sits on. `movie`, `series`, `tv` fold as the card
 *  folds them; a word the fold does not know goes to the last shelf. */
export function shelfOf(meta: Pick<TrackerMeta, "kind">): Shelf {
  return foldKind(meta.kind) ?? "other";
}

/** The shelves, in order, each with its trackers — most recently touched
 *  first, which is how `GET /api/trackers` already hands them over. */
export function shelve(
  all: readonly TrackerMeta[],
  status: TrackerStatus | null,
): { shelf: Shelf; items: TrackerMeta[] }[] {
  const groups = new Map<Shelf, TrackerMeta[]>();
  for (const meta of all) {
    if (status !== null && meta.status !== status) continue;
    const shelf = shelfOf(meta);
    const list = groups.get(shelf);
    if (list) list.push(meta);
    else groups.set(shelf, [meta]);
  }
  return SHELF_ORDER.filter((shelf) => groups.has(shelf)).map((shelf) => ({
    shelf,
    items: groups.get(shelf) ?? [],
  }));
}

/** The status filters, in the board's order: what is happening now first. */
export const STATUS_FILTERS: TrackerStatus[] = ["active", "planned", "done", "paused", "dropped"];

/** What the form holds while it is open — strings throughout, because a
 *  field that is half typed is a string and not yet a number. */
export interface MediaDraft {
  kind: string;
  title: string;
  cover: string;
  done: string;
  total: string;
  openEnded: boolean;
  unit: string;
  step: string;
  season: string;
  folder: string;
  status: TrackerStatus;
  rating: string;
  started: string;
  finished: string;
  notes: string;
}

export function emptyDraft(kind: TrackerKind = "show"): MediaDraft {
  return {
    kind,
    title: "",
    cover: "",
    done: "",
    total: "",
    openEnded: false,
    unit: "",
    step: "",
    season: "",
    folder: "",
    status: "planned",
    rating: "",
    started: "",
    finished: "",
    notes: "",
  };
}

/** A card's fence, back into the form. The progress splits into its halves;
 *  a fence with a count and no ceiling is the open-ended switch, on. */
export function draftOf(meta: TrackerMeta): MediaDraft {
  return {
    kind: meta.kind ?? "",
    title: meta.title,
    cover: meta.cover ?? "",
    done: meta.done === null ? "" : String(meta.done),
    total: meta.total === null ? "" : String(meta.total),
    openEnded: meta.done !== null && meta.total === null,
    unit: meta.unit ?? "",
    step: meta.step === defaultTrackerStep(meta.unit, foldKind(meta.kind)) ? "" : String(meta.step),
    season: meta.season ?? "",
    folder: meta.folder ?? "",
    status: meta.status,
    rating: meta.rating === null ? "" : String(Math.round((meta.rating.value / meta.rating.max) * 100) / 10),
    started: meta.started ?? "",
    finished: meta.finished ?? "",
    notes: meta.notes ?? "",
  };
}

/** A typed number, or null for anything that is not one. */
export function numberOf(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
