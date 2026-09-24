// The library's two tables — the ROOTS a shelf is read from and the PATHS
// (one row per shelf) — with the glyphs and the folder line they share.
// Split out of SettingsModal.tsx (3.27.0) unchanged; the Collections tab
// (./CollectionsTab.tsx) is their one caller.

import { useEffect, useMemo, useState } from "react";
import { pickFolder } from "../FolderPicker.tsx";
import { findFolderNode, unitNamesOf } from "../../libraryFolders.ts";
import { addressProblem, leafOf, parentOf, publishedChildFolders, rootOf, rootOffers, type RootOffer } from "../../libraryShelf.ts";
import { suggestSlug, FOLDER_SLUG_MAX } from "../../../shared/publicFolders.ts";
import { guessLibraryKind, libraryFreshSlug, libraryPathId, libraryRowForFolder, libraryTitleOf, libraryUrl, LIBRARY_BLURB_MAX, LIBRARY_KINDS, LIBRARY_PATHS_MAX, LIBRARY_SOURCE_MAX, LIBRARY_TITLE_MAX, LIBRARY_ROOTS_MAX } from "../../../shared/library.ts";
import type { LibraryKind, LibraryPath, LibraryPathRef, LibraryRoot, TreeNode } from "../../../shared/types.ts";
import { getLibrary, getTrackers } from "../../api.ts";
import { getLang, isolate, localeNum, t, tf } from "../../i18n.ts";
import { useStore } from "../../state.ts";
import { SegmentedControl, TextInput, Toggle, type Segment } from "../controls/Fields.tsx";
import { PathInput } from "../controls/PathInput.tsx";
import { libraryRowsProblem } from "./form.ts";

/** The three kinds, as a mark: a closed book, a lecture screen, a stack. Small
 *  enough for a 44px summary line, and the only thing on it that does not need
 *  reading. */
export function kindGlyph(kind: LibraryKind) {
  const d =
    kind === "book"
      ? "M3.5 2.5h7a1.5 1.5 0 0 1 1.5 1.5v9.5H5a1.5 1.5 0 0 1-1.5-1.5z M12 11.5H5a1.5 1.5 0 0 0-1.5 1.5"
      : kind === "course"
        ? "M2.5 3.5h11v7.5h-11z M6.5 13.5h3"
        : "M2.5 5.5h11v8h-11z M4 3.5h8 M5.5 1.5h5";
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false" className="s-libpaths__glyph">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const kindLabelOf = (kind: LibraryKind): string =>
  kind === "book" ? t("libraryKindBook") : kind === "course" ? t("libraryKindCourse") : t("libraryKindSeries");

/** A vault path drawn so the LEAF survives. `.s-libpaths__folder-parent`
 *  ellipsises and the leaf does not, because eight books under one parent are
 *  eight identical prefixes and eight names that differ — and an end-ellipsis
 *  on a left-to-right path hides exactly the half that matters. */
export function FolderPath({ folder, empty }: { folder: string; empty?: string }) {
  if (folder === "") return <span className="s-libpaths__folder-name s-libpaths__folder-name--empty">{empty ?? t("libraryPathNoFolder")}</span>;
  return (
    <span className="s-libpaths__folder-name" dir="ltr">
      <span className="s-libpaths__folder-parent">{parentOf(folder)}</span>
      <span className="s-libpaths__folder-leaf">{leafOf(folder)}</span>
    </span>
  );
}

/** THE SHELF ROOTS. One line each: a kind, the folder, a cross — and under it
 *  the consequence, which is the whole point of the control. "Choose Books,
 *  say book" is a sentence about the vault's shape, and the reader should not
 *  have to save it to find out which folders it just put on the shelf.
 *
 *  The fold OFFER lives here too, because it is an offer to make a root. It
 *  never folds anything on its own: the rows it would retire are listed with
 *  the order they would produce, and two buttons say which. */
export function LibraryRootsEditor({
  roots,
  rows,
  disabled,
  onChange,
  onRowsChange,
}: {
  roots: LibraryRoot[];
  rows: LibraryPathRef[];
  disabled: boolean;
  onChange: (roots: LibraryRoot[]) => void;
  onRowsChange: (rows: LibraryPathRef[]) => void;
}) {
  const publishedPaths = useStore((s) => s.publishedPaths);
  useEffect(() => {
    if (publishedPaths === null) void useStore.getState().loadPublished();
  }, [publishedPaths]);
  const kindSegments: Segment[] = LIBRARY_KINDS.map((kind) => ({ value: kind, label: kindLabelOf(kind) }));

  const choose = async (i: number | null): Promise<void> => {
    const folder = await pickFolder({ title: t("libraryPathChooseTitle"), current: i === null ? null : roots[i].folder });
    if (folder === null) return;
    if (i === null) onChange([...roots, { id: libraryPathId(), folder, kind: guessLibraryKind(folder, []) }]);
    else onChange(roots.map((root, n) => (n === i ? { ...root, folder } : root)));
  };

  // WHICH FOLDERS THIS JUST PUT ON THE SHELF, counted from the tree the panel
  // already has — the same discovery the indexer does, so the line is not a
  // promise, it is the answer.
  const joinLine = (folder: string): string => {
    const children = publishedChildFolders(folder, publishedPaths);
    if (children.length === 0) return t("libraryRootNone");
    // Joined by `Intl.ListFormat` in the instance's language rather than a
    // hand-typed comma — Arabic separates a list with `،`, and this list is
    // the one place in the panel where English and Arabic folder names stand
    // side by side, so each name is bidi-isolated on its own too (tf() isolates
    // the whole substitution, which is not enough when the substitution IS the
    // list). Same rule as deleteFlow.ts's referrer phrase.
    const names = children.map((child) => isolate(libraryTitleOf(child) || child));
    const list = new Intl.ListFormat(getLang(), { style: "short", type: "unit" }).format(names);
    return children.length === 1
      ? tf("libraryRootJoinOne", { list })
      : tf("libraryRootJoin", { n: localeNum(children.length), list });
  };

  // ── The offer ────────────────────────────────────────────────────────────
  // A Media tracker that names a path's folder lends its cover, so a row whose
  // only remaining word is `cover:` says nothing the shelf would lose. That is
  // the one thing the panel cannot read off the rows, so it asks — once, and
  // only when there is an offer to make.
  const [lent, setLent] = useState<ReadonlySet<string> | null>(null);
  const maybeOffer = useMemo(() => rootOffers(rows, roots, new Set()), [rows, roots]);
  useEffect(() => {
    if (maybeOffer === null || lent !== null) return;
    let live = true;
    void getTrackers()
      // BOTH halves, exactly as the server asks for them: its `lent` map skips
      // a tracker with no `cover:` (server/indexer.ts libraryRefs), so a
      // tracker that names the folder and lends nothing lends NOTHING. Taking
      // the folder alone made a row whose only remaining word was `cover:`
      // look foldable, and folding it took the book's picture off the shelf.
      .then(
        (list) =>
          live &&
          setLent(
            new Set(
              list
                .filter((tr) => tr.cover !== null && tr.folder !== null && tr.folder !== "")
                .map((tr) => tr.folder as string),
            ),
          ),
      )
      .catch(() => live && setLent(new Set()));
    return () => {
      live = false;
    };
  }, [maybeOffer, lent]);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const offer: RootOffer | null = useMemo(
    () => (lent === null ? null : rootOffers(rows, roots, lent)),
    [rows, roots, lent],
  );
  const showOffer = offer !== null && offer.parent !== dismissed && roots.length < LIBRARY_ROOTS_MAX;

  /** Make the offered parent a root, optionally retiring the rows it makes
   *  redundant. Nothing here saves: the panel's own Save does. */
  const takeOffer = (fold: boolean): void => {
    if (offer === null) return;
    onChange([...roots, { id: libraryPathId(), folder: offer.parent, kind: offer.kind }]);
    if (fold) {
      const gone = new Set(offer.foldable.map((row) => row.id));
      onRowsChange(rows.filter((row) => !gone.has(row.id)));
    }
    setDismissed(offer.parent);
  };

  /** The shelf order folding would produce: the rows that stay, in their own
   *  order, then the folded folders by title. Said out loud because it is the
   *  one thing folding changes that the reader did not ask for. */
  const foldedOrder = (): string[] => {
    if (offer === null) return [];
    const gone = new Set(offer.foldable.map((row) => row.id));
    const kept = rows.filter((row) => !gone.has(row.id)).map((row) => row.title);
    const derived = offer.foldable
      .map((row) => row.title)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    return [...kept, ...derived];
  };

  return (
    <div className="s-libroots">
      {roots.length === 0 ? (
        <p className="s-libroots__lede">{t("libraryRootsEmpty")}</p>
      ) : (
        roots.map((root, i) => (
          <div className="s-libroots__row" key={root.id}>
            <div className="s-libroots__head">
              <SegmentedControl
                label={t("libraryPathKind")}
                value={root.kind}
                disabled={disabled}
                segments={kindSegments}
                onChange={(v) => onChange(roots.map((r, n) => (n === i ? { ...r, kind: v as LibraryKind } : r)))}
              />
              <button
                type="button"
                className="s-libpaths__folder"
                disabled={disabled}
                title={t("libraryPathFolder")}
                onClick={() => void choose(i)}
              >
                <FolderPath folder={root.folder} />
                <span className="s-libpaths__folder-cta">{t("libraryPathChoose")}</span>
              </button>
              <button
                type="button"
                className="s-pfolders__del"
                title={t("libraryRootRemove")}
                aria-label={t("libraryRootRemove")}
                disabled={disabled}
                onClick={() => onChange(roots.filter((_, n) => n !== i))}
              >
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
                  <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <p className="s-libroots__join" dir="auto">
              {joinLine(root.folder)}
            </p>
          </div>
        ))
      )}
      {showOffer && offer !== null && (
        <div className="s-libroots__offer">
          <p className="s-libroots__offertitle" dir="auto">
            {tf("libraryRootOffer", { parent: leafOf(offer.parent), n: localeNum(offer.rows.length) })}
          </p>
          {/* WHAT SAYING YES PUTS ON THE SHELF, before it is said. The offer
              named only the rows that would fold, and the folders the root
              claims that have no row yet — the whole point of a root — went
              on the public shelf unannounced. This is the same consequence
              line a saved root carries, asked one press earlier. */}
          <p className="s-libroots__join" dir="auto">
            {joinLine(offer.parent)}
          </p>
          {offer.foldable.length > 0 && (
            <>
              <p className="s-libroots__offerbody">
                {offer.foldable.length === 1
                  ? t("libraryRootOfferFoldOne")
                  : tf("libraryRootOfferFold", { n: localeNum(offer.foldable.length) })}
              </p>
              <p className="s-libroots__offerorder" dir="auto">
                {foldedOrder().join(" · ")}
              </p>
            </>
          )}
          <div className="s-libroots__offeractions">
            {offer.foldable.length > 0 && (
              <button type="button" className="s-btn s-btn--accent" disabled={disabled} onClick={() => takeOffer(true)}>
                {offer.foldable.length === 1
                  ? t("libraryRootOfferFoldBtnOne")
                  : tf("libraryRootOfferFoldBtn", { n: localeNum(offer.foldable.length) })}
              </button>
            )}
            <button type="button" className="s-btn" disabled={disabled} onClick={() => takeOffer(false)}>
              {t("libraryRootOfferKeep")}
            </button>
            <button type="button" className="s-pfolders__unlink" onClick={() => setDismissed(offer.parent)}>
              {t("libraryRootOfferDismiss")}
            </button>
          </div>
        </div>
      )}
      <div className="s-libpaths__actions">
        <button
          type="button"
          className="s-pfolders__add"
          disabled={disabled || roots.length >= LIBRARY_ROOTS_MAX}
          onClick={() => void choose(null)}
        >
          {t("libraryRootAdd")}
        </button>
      </div>
    </div>
  );
}

/** THE LIBRARY'S PATHS. One FOLDED card per path, because a row is an
 *  exception and twelve exceptions open at once is a page of forms. The
 *  summary is the whole row at a glance — kind, title, leaf folder, how many
 *  of its notes are published, its tools and its switch — on one 44px line,
 *  and the fields are behind it.
 *
 *  THE FOLDER IS CHOSEN, NOT TYPED: a path is a vault folder, so the row's
 *  first control is a button that opens the vault's folders to click
 *  (FolderPicker.tsx), and Add opens the same picker before there is a row at
 *  all — the title, address and kind are then guessed from the folder
 *  (`libraryRowForFolder`) and the reader corrects rather than composes.
 *
 *  Under the rows: everything ELSE on the shelf — a root's children and the
 *  folders whose own note declares them — each with the address it answers on
 *  and one press to turn it into a row. And under THAT, the folders the panel
 *  expected and the server did not send, with the reason. */
export function LibraryPathEditor({
  rows,
  roots,
  disabled,
  onChange,
}: {
  rows: LibraryPathRef[];
  roots: LibraryRoot[];
  disabled: boolean;
  onChange: (rows: LibraryPathRef[]) => void;
}) {
  const set = (i: number, patch: Partial<LibraryPathRef>): void => {
    onChange(rows.map((row, n) => (n === i ? { ...row, ...patch } : row)));
  };
  const move = (i: number, delta: number): void => {
    const to = i + delta;
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    const [row] = next.splice(i, 1);
    next.splice(to, 0, row);
    onChange(next);
  };
  const kindSegments: Segment[] = LIBRARY_KINDS.map((kind) => ({ value: kind, label: kindLabelOf(kind) }));
  /** Which cards the reader has opened. A card also opens when it is new, and
   *  when it holds the marked field — an error you must go looking for is an
   *  error the footer is lying about. */
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const problem = libraryRowsProblem(rows);

  /** Choose a folder for row `i`, or for a NEW row when `i` is null. */
  const choose = async (i: number | null): Promise<void> => {
    const folder = await pickFolder({ title: t("libraryPathChooseTitle"), current: i === null ? null : rows[i].folder });
    if (folder === null) return;
    if (i === null) {
      const row = libraryRowForFolder(folder, unitNamesOf(folder), rows);
      setOpened((o) => ({ ...o, [row.id]: true }));
      onChange([...rows, row]);
      return;
    }
    const row = rows[i];
    set(i, { folder, ...(row.title.trim() === "" ? { title: libraryTitleOf(folder) } : {}) });
  };
  // What a reader would get: the notes inside, and how many are published.
  // The library only lists published notes, so a path whose notes are all
  // drafts is a shelf with nothing on it — and the reason the owner asked
  // "how do I see the library on the public site?".
  const tree = useStore((s) => s.tree);
  const publishedPaths = useStore((s) => s.publishedPaths);
  useEffect(() => {
    if (publishedPaths === null) void useStore.getState().loadPublished();
  }, [publishedPaths]);
  const countsOf = (folder: string): { notes: number; published: number } => {
    const node = findFolderNode(tree, folder);
    let notes = 0;
    let published = 0;
    const walk = (n: TreeNode): void => {
      for (const c of n.children ?? []) {
        if (c.type === "folder") walk(c);
        else if (!c.attachment) {
          notes++;
          if (publishedPaths?.has(c.path)) published++;
        }
      }
    };
    if (node) walk(node);
    return { notes, published };
  };
  // The shelf as the SERVER sees it — the rows, the roots' children and the
  // folders whose note declares `library:`, with the addresses it actually
  // emitted. The panel derives the same list to know what is MISSING; it never
  // guesses at what is present.
  const [shelf, setShelf] = useState<LibraryPath[] | null>(null);
  useEffect(() => {
    let live = true;
    void getLibrary().then((paths) => live && setShelf(paths)).catch(() => live && setShelf([]));
    return () => {
      live = false;
    };
  }, [rows.length, roots.length]);
  const fromVault = (shelf ?? []).filter((p) => !rows.some((r) => r.folder === p.folder));

  // Every address already spoken for, and who holds it — so "Needs an address"
  // can name the path that took the one this folder wanted.
  const takenBy = new Map<string, string>();
  for (const row of rows) if (row.slug) takenBy.set(row.slug, row.title);
  for (const path of shelf ?? []) takenBy.set(path.slug, path.title);
  const onShelf = new Set((shelf ?? []).map((p) => p.folder));
  const needsAddress: { folder: string; problem: ReturnType<typeof addressProblem> }[] = [];
  for (const root of roots) {
    for (const child of publishedChildFolders(root.folder, publishedPaths)) {
      if (onShelf.has(child) || rows.some((r) => r.folder === child)) continue;
      const why = addressProblem(child, takenBy);
      if (why !== null) needsAddress.push({ folder: child, problem: why });
    }
  }

  const arrow = (up: boolean) => (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
      <path
        d={up ? "M8 12V4M4 8l4-4 4 4" : "M8 4v8M4 8l4 4 4-4"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
  /** A control inside a <summary> must not also open the card: the click that
   *  presses it would bubble to the disclosure and answer a question nobody
   *  asked. Stopping it here keeps both keyboard routes intact — Enter on the
   *  button presses the button, Enter on the summary opens the card. */
  const notTheSummary = (e: { stopPropagation: () => void }): void => e.stopPropagation();

  const customise = (p: { slug: string; folder: string; kind: LibraryKind; title: string }): void => {
    const row: LibraryPathRef = { id: libraryPathId(), slug: p.slug, folder: p.folder, kind: p.kind, title: p.title };
    setOpened((o) => ({ ...o, [row.id]: true }));
    onChange([...rows, row]);
  };

  return (
    <div className="s-libpaths">
      {rows.length === 0 ? (
        <p className="s-pfolders__empty">{t("libraryPathsEmpty")}</p>
      ) : (
        rows.map((row, i) => {
          const counts = row.folder ? countsOf(row.folder) : null;
          const mine = problem?.index === i ? problem : null;
          return (
            <details
              className={`s-libpaths__card${row.hidden ? " s-libpaths__card--hidden" : ""}${mine ? " s-libpaths__card--bad" : ""}`}
              key={row.id}
              open={opened[row.id] === true || mine !== null}
              onToggle={(e) => {
                const el = e.currentTarget as HTMLDetailsElement;
                // THE MARKED CARD DOES NOT CLOSE. `open` above already says so,
                // but a <details> is toggled by the browser, not by React, and
                // React rewrites the attribute only when the value it renders
                // CHANGES — which it does not, because `mine` was already
                // forcing it open. So the reader could fold the one place the
                // message lives away and be left with a disabled Save and a
                // footer asking them to fix a field nothing marks. Push it back
                // open; the second toggle this fires records it.
                if (mine !== null && !el.open) {
                  el.open = true;
                  return;
                }
                setOpened((o) => ({ ...o, [row.id]: el.open }));
              }}
            >
              <summary className="s-libpaths__summary" title={t("libraryCardOpen")}>
                {kindGlyph(row.kind)}
                <bdi className="s-libpaths__sumtitle" dir="auto">
                  {row.title.trim() === "" ? t("libraryPathNoFolder") : row.title}
                </bdi>
                {/* The folder, ONLY when it is not the title again. A row
                    whose title is the folder's own name printed it twice on
                    one line and spent the width it took truncating the half
                    that was already there. */}
                {row.folder !== "" && leafOf(row.folder) !== row.title.trim() && (
                  <span className="s-libpaths__sumfolder" dir="ltr">
                    {leafOf(row.folder)}
                  </span>
                )}
                {counts && (
                  <span className={`s-libpaths__count${counts.notes > 0 && counts.published === 0 ? " s-libpaths__count--none" : ""}`}>
                    {tf("libraryPathLessons", { published: localeNum(counts.published), notes: localeNum(counts.notes) })}
                  </span>
                )}
                <span className="s-libpaths__tools">
                  <button
                    type="button"
                    className="s-pfolders__move"
                    title={t("libraryPathUp")}
                    aria-label={t("libraryPathUp")}
                    disabled={disabled || i === 0}
                    onClick={(e) => {
                      notTheSummary(e);
                      move(i, -1);
                    }}
                  >
                    {arrow(true)}
                  </button>
                  <button
                    type="button"
                    className="s-pfolders__move"
                    title={t("libraryPathDown")}
                    aria-label={t("libraryPathDown")}
                    disabled={disabled || i === rows.length - 1}
                    onClick={(e) => {
                      notTheSummary(e);
                      move(i, 1);
                    }}
                  >
                    {arrow(false)}
                  </button>
                  <button
                    type="button"
                    className="s-pfolders__del"
                    title={t("libraryPathRemove")}
                    aria-label={t("libraryPathRemove")}
                    disabled={disabled}
                    onClick={(e) => {
                      notTheSummary(e);
                      onChange(rows.filter((_, n) => n !== i));
                    }}
                  >
                    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
                      <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                  {/* ON means VISIBLE — a lit switch is the affirmative state,
                      and the affirmative thing about a path is that it shows. */}
                  <span
                    className="s-libpaths__sumswitch"
                    /* a11y-ok: not an activation — it stops the switch's own
                       click from also opening the card behind it. The control
                       is the <button role="switch"> inside. */
                    onClick={notTheSummary}
                  >
                    <Toggle
                      label={t("libraryPathVisible")}
                      onLabel={t("libraryPathVisible")}
                      offLabel={t("libraryPathHidden")}
                      value={row.hidden !== true}
                      disabled={disabled}
                      onChange={(on) => set(i, { hidden: on ? undefined : true })}
                    />
                  </span>
                </span>
              </summary>
              <div className="s-libpaths__body">
                <div className="s-libpaths__head">
                  <SegmentedControl
                    label={t("libraryPathKind")}
                    value={row.kind}
                    disabled={disabled}
                    segments={kindSegments}
                    onChange={(v) => set(i, { kind: v as LibraryKind })}
                  />
                  <span className="s-libpaths__url" dir="ltr">
                    {libraryUrl(row.slug || "…")}
                  </span>
                </div>
                <button
                  type="button"
                  className={`s-libpaths__folder${row.folder ? "" : " s-libpaths__folder--empty"}`}
                  disabled={disabled}
                  title={t("libraryPathFolder")}
                  aria-invalid={mine?.field === "folder" ? true : undefined}
                  onClick={() => void choose(i)}
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
                    <path d="M1.5 12.5v-9h4l1.5 2h7.5v7z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                  </svg>
                  <FolderPath folder={row.folder} />
                  <span className="s-libpaths__folder-cta">{t("libraryPathChoose")}</span>
                </button>
                <div className="s-libpaths__grid">
                  <label className="s-libpaths__field">
                    <span className="s-libpaths__caption">{t("libraryPathTitle")}</span>
                    <TextInput
                      value={row.title}
                      onChange={(v) =>
                        set(i, {
                          title: v,
                          ...(row.slug.trim() === "" ? { slug: suggestSlug(v) } : {}),
                        })
                      }
                      placeholder={t("libraryPathTitlePlaceholder")}
                      label={t("libraryPathTitle")}
                      disabled={disabled}
                      invalid={mine?.field === "title"}
                      dir="auto"
                      maxLength={LIBRARY_TITLE_MAX}
                    />
                  </label>
                  <label className="s-libpaths__field">
                    <span className="s-libpaths__caption">{t("libraryPathSlug")}</span>
                    <TextInput
                      value={row.slug}
                      onChange={(v) => set(i, { slug: v })}
                      placeholder={t("libraryPathSlugPlaceholder")}
                      label={t("libraryPathSlug")}
                      disabled={disabled}
                      invalid={mine?.field === "slug"}
                      dir="ltr"
                      maxLength={FOLDER_SLUG_MAX}
                    />
                  </label>
                </div>
                <details className="s-libpaths__more" open={!!(row.blurb || row.cover || row.source) || mine?.field === "blurb" || mine?.field === "source"}>
                  <summary>{t("libraryPathDetails")}</summary>
                  <div className="s-libpaths__grid s-libpaths__grid--more">
                    <label className="s-libpaths__field s-libpaths__field--wide">
                      <span className="s-libpaths__caption">{t("libraryPathBlurb")}</span>
                      <TextInput
                        value={row.blurb ?? ""}
                        onChange={(v) => set(i, { blurb: v })}
                        placeholder={t("libraryPathBlurbPlaceholder")}
                        label={t("libraryPathBlurb")}
                        disabled={disabled}
                        invalid={mine?.field === "blurb"}
                        dir="auto"
                        maxLength={LIBRARY_BLURB_MAX}
                      />
                    </label>
                    <label className="s-libpaths__field">
                      <span className="s-libpaths__caption">{t("libraryPathCover")}</span>
                      <PathInput
                        value={row.cover ?? ""}
                        onChange={(v) => set(i, { cover: v })}
                        kind="image"
                        placeholder={t("libraryPathCoverPlaceholder")}
                        label={t("libraryPathCover")}
                        disabled={disabled}
                      />
                    </label>
                    <label className="s-libpaths__field">
                      <span className="s-libpaths__caption">{t("libraryPathSource")}</span>
                      <TextInput
                        value={row.source ?? ""}
                        onChange={(v) => set(i, { source: v })}
                        placeholder={t("libraryPathSourcePlaceholder")}
                        label={t("libraryPathSource")}
                        disabled={disabled}
                        invalid={mine?.field === "source"}
                        dir="ltr"
                        maxLength={LIBRARY_SOURCE_MAX}
                      />
                    </label>
                  </div>
                </details>
                {mine && (
                  <p className="s-libpaths__bad" role="alert">
                    {mine.message}
                  </p>
                )}
                {counts && counts.notes > 0 && counts.published === 0 && (
                  <p className="s-libpaths__bad">{t("libraryPathNonePublished")}</p>
                )}
              </div>
            </details>
          );
        })
      )}
      {(fromVault.length > 0 || needsAddress.length > 0) && (
        <div className="s-libpaths__vault">
          {fromVault.length > 0 && (
            <>
              <span className="s-libpaths__caption">{t("libraryVaultPaths")}</span>
              {fromVault.map((p) => {
                const via = rootOf(p.folder, roots);
                return (
                  <div key={p.id} className="s-libpaths__vaultrow">
                    {kindGlyph(p.kind)}
                    <bdi className="s-libpaths__vaulttitle" dir="auto">
                      {p.title}
                    </bdi>
                    {leafOf(p.folder) !== p.title && (
                      <span className="s-libpaths__sumfolder" dir="ltr">
                        {leafOf(p.folder)}
                      </span>
                    )}
                    <span className="s-libpaths__count">
                      {via ? tf("libraryViaRoot", { root: leafOf(via.folder) }) : t("libraryFromFolderNote")}
                    </span>
                    <span className="s-libpaths__url" dir="ltr">
                      {libraryUrl(p.slug)}
                    </span>
                    <button
                      type="button"
                      className="s-pfolders__unlink"
                      disabled={disabled || rows.length >= LIBRARY_PATHS_MAX}
                      onClick={() => customise(p)}
                    >
                      {t("libraryCustomise")}
                    </button>
                  </div>
                );
              })}
            </>
          )}
          {needsAddress.length > 0 && (
            <>
              <span className="s-libpaths__caption s-libpaths__caption--bad">{t("libraryNeedsAddress")}</span>
              {needsAddress.map(({ folder, problem: why }) => (
                <div key={folder} className="s-libpaths__vaultrow">
                  <bdi className="s-libpaths__vaulttitle" dir="auto">
                    {libraryTitleOf(folder) || folder}
                  </bdi>
                  {leafOf(folder) !== (libraryTitleOf(folder) || folder) && (
                    <span className="s-libpaths__sumfolder" dir="ltr">
                      {leafOf(folder)}
                    </span>
                  )}
                  <span className="s-libpaths__count s-libpaths__count--none" dir="auto">
                    {why?.kind === "taken" ? tf("libraryNeedsAddressTaken", { title: why.by }) : t("libraryNeedsAddressArabic")}
                  </span>
                  <button
                    type="button"
                    className="s-pfolders__unlink"
                    disabled={disabled || rows.length >= LIBRARY_PATHS_MAX}
                    onClick={() => {
                      const title = libraryTitleOf(folder) || folder;
                      customise({
                        slug: libraryFreshSlug(title, rows),
                        folder,
                        kind: rootOf(folder, roots)?.kind ?? guessLibraryKind(folder, unitNamesOf(folder)),
                        title,
                      });
                    }}
                  >
                    {t("libraryCustomise")}
                  </button>
                </div>
              ))}
            </>
          )}
          <p className="s-libpaths__hint">{t("libraryOrderNote")}</p>
        </div>
      )}
      <div className="s-libpaths__actions">
        <button
          type="button"
          className="s-pfolders__add"
          disabled={disabled || rows.length >= LIBRARY_PATHS_MAX}
          onClick={() => void choose(null)}
        >
          {t("libraryPathAdd")}
        </button>
        {/* A keyboard legend on a device with no keyboard is a taunt
            (DESIGN.md): the tree hint is hidden under `pointer: coarse`. */}
        <span className="s-libpaths__hint s-libpaths__hint--pointer">{t("libraryPathsTreeHint")}</span>
        <span className="s-libpaths__hint">{t("folderNoteHint")}</span>
      </div>
    </div>
  );
}
