// WHAT THE SHELF WILL LOOK LIKE, worked out in the panel.
//
// The settings panel has to show the owner the shelf BEFORE they save it: which
// folders a root would claim, what address each of them would take, and which
// rows a root has made redundant. The server answers the same questions from
// the index (server/indexer.ts libraryRefs), and the two must agree — so the
// address rule itself is shared (shared/library.ts derivedSlug) and only the
// discovery, which the client does off the tree and the published set, lives
// here.
//
// Pure: no store, no fetch. The panel passes what it has.

import { derivedSlugCandidate, libraryTitleOf } from "../shared/library.ts";
import type { LibraryKind, LibraryPathRef, LibraryRoot } from "../shared/types.ts";

/** A folder's last segment, and everything before it. The panel prints the
 *  leaf whole and lets the parent ellipsise: eight books under one parent are
 *  eight identical prefixes and eight names that differ. */
export function leafOf(folder: string): string {
  return folder.slice(folder.lastIndexOf("/") + 1);
}
export function parentOf(folder: string): string {
  const slash = folder.lastIndexOf("/");
  return slash === -1 ? "" : folder.slice(0, slash + 1);
}

/** The immediate subfolders of `root` that hold a published note — the
 *  server's discovery rule (`publishedChildrenOf`), read off the published set
 *  the panel already loads for its "N of M published" counts. A note sitting
 *  directly in the root is a post, not a path. */
export function publishedChildFolders(root: string, published: ReadonlySet<string> | null): string[] {
  if (published === null || root === "") return [];
  const prefix = root.endsWith("/") ? root : `${root}/`;
  const out = new Set<string>();
  for (const notePath of published) {
    if (!notePath.startsWith(prefix)) continue;
    const rel = notePath.slice(prefix.length);
    const slash = rel.indexOf("/");
    if (slash === -1) continue;
    out.add(prefix + rel.slice(0, slash));
  }
  return [...out].sort((a, b) =>
    libraryTitleOf(a).localeCompare(libraryTitleOf(b), undefined, { numeric: true, sensitivity: "base" }),
  );
}

/** The root whose immediate child this folder is, or null. */
export function rootOf(folder: string, roots: readonly LibraryRoot[]): LibraryRoot | null {
  for (const root of roots) {
    if (parentOf(folder) === `${root.folder}/`) return root;
  }
  return null;
}

/** Why a folder the panel expected on the shelf is not on it — but ONLY when
 *  the panel can prove the reason. A folder can also be missing because its
 *  own note hides it, and guessing at that would put a line under "Needs an
 *  address" about a folder the owner deliberately took down. */
export type AddressProblem = { kind: "noAddress" } | { kind: "taken"; by: string };

export function addressProblem(
  folder: string,
  taken: ReadonlyMap<string, string>,
): AddressProblem | null {
  const candidate = derivedSlugCandidate(libraryTitleOf(folder) || folder);
  if (candidate === null) return { kind: "noAddress" };
  const by = taken.get(candidate);
  return by === undefined ? null : { kind: "taken", by };
}

/** Does this row say anything the root and the folder would not?
 *
 *  A row is foldable when its title is the folder's own name, its address is
 *  the address that title suggests, its kind is the root's, and it carries no
 *  blurb, no source and no take-down. The COVER is the one field the panel
 *  cannot judge from the row alone: dropping a row whose picture only the row
 *  names would blank the card. So a cover counts as "said by the folder" only
 *  when a Media tracker names this folder and lends one — which is exactly the
 *  server's own rule (server/indexer.ts libraryRefs, the `lent` map). */
export function rowIsFoldable(row: LibraryPathRef, kind: LibraryKind, lentFolders: ReadonlySet<string>): boolean {
  if (row.kind !== kind) return false;
  if (row.hidden || (row.blurb ?? "") !== "" || (row.source ?? "") !== "") return false;
  if ((row.cover ?? "") !== "" && !lentFolders.has(row.folder)) return false;
  const name = libraryTitleOf(row.folder) || row.folder;
  if (row.title.trim() !== name) return false;
  return derivedSlugCandidate(name) === row.slug;
}

/** The one offer the panel makes: a parent folder that holds two or more of
 *  the rows and is not a root yet. The parent that holds the most comes first,
 *  and only one is offered at a time — two standing questions about the shape
 *  of the shelf is a quiz, not an offer. */
export interface RootOffer {
  parent: string;
  kind: LibraryKind;
  /** The rows under this parent, in shelf order. */
  rows: LibraryPathRef[];
  /** Those of them that say nothing the folder does not. */
  foldable: LibraryPathRef[];
}

export function rootOffers(
  rows: readonly LibraryPathRef[],
  roots: readonly LibraryRoot[],
  lentFolders: ReadonlySet<string>,
): RootOffer | null {
  const byParent = new Map<string, LibraryPathRef[]>();
  for (const row of rows) {
    const parent = parentOf(row.folder).replace(/\/$/, "");
    if (parent === "") continue;
    if (roots.some((root) => root.folder === parent)) continue;
    const list = byParent.get(parent) ?? [];
    list.push(row);
    byParent.set(parent, list);
  }
  let best: RootOffer | null = null;
  for (const [parent, list] of byParent) {
    if (list.length < 2) continue;
    // The kind the root would carry: whichever the rows under it mostly are.
    const counts = new Map<LibraryKind, number>();
    for (const row of list) counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
    let kind: LibraryKind = "book";
    let most = 0;
    for (const [k, n] of counts) if (n > most) [kind, most] = [k, n];
    const offer: RootOffer = { parent, kind, rows: list, foldable: list.filter((row) => rowIsFoldable(row, kind, lentFolders)) };
    if (best === null || offer.rows.length > best.rows.length) best = offer;
  }
  return best;
}
