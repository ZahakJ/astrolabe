// "Library…" on a folder — putting a folder on the shelf from the tree.
//
// The library's paths live in settings, and the first version made the reader
// go there, press Add, and TYPE the folder's path. But the reader is looking
// at the folder: it is the row they right-clicked. So this popover hangs off
// that row, beside "Folder icon", and does the one thing the row can do —
// add it to the shelf with a kind and a title (both guessed, both editable) —
// or, when it is already there, say so and offer the way off. Blurb, cover
// and source stay in the settings panel; they are prose, not a click.
//
// Anchored, not modal, and placed by the same rule as the icon picker
// (anchorPopover.ts): one opens from the same menu at the same point.
//
// AND IT READS THE MERGED SHELF, not only the settings rows. Since shelf roots
// (3.19) a folder can be on the shelf without any row naming it — through a
// root over its parent, or through its own folder note — and asking
// `settings.library.paths` alone made the popover offer to "put on the shelf"
// a book already sitting on it, whose address it would then have taken. So it
// asks /api/library too: a path with no row of its own says where it is and
// opens, and offers no "take off the shelf" (that is a `hidden:` in the folder
// note, or Customise in the panel), because deleting a row that does not exist
// is not a verb.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  LIBRARY_KINDS,
  LIBRARY_PATHS_MAX,
  LIBRARY_TITLE_MAX,
  libraryFolder,
  libraryRowForFolder,
  libraryUrl,
} from "../../shared/library.ts";
import type { LibraryKind, LibraryPath, LibraryPathRef } from "../../shared/types.ts";
import { getLibrary, getSettings, patchSettings } from "../api.ts";
import { localeNum, t, tf } from "../i18n.ts";
import { toast } from "../toast.ts";
import { actionToast } from "../undoToast.ts";
import { useStore } from "../state.ts";
import { anchorPopover } from "./anchorPopover.ts";
import { useDialog } from "../a11y.ts";
import "../styles/libraryfolder.css";

export interface LibraryPopState {
  /** Vault-relative folder path. Never "": the root is not a shelf. */
  path: string;
  name: string;
  /** The folder's subfolders' names, for the kind guess. */
  unitNames: string[];
  x: number;
  y: number;
  fromKeyboard: boolean;
}

type Shelf = { enabled: boolean; nav: boolean; home: boolean; title: string; paths: LibraryPathRef[] };

export default function LibraryFolderPopover({ state, onClose }: { state: LibraryPopState; onClose(): void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [merged, setMerged] = useState<LibraryPath[]>([]);
  const [draft, setDraft] = useState<LibraryPathRef | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    // The shelf as the SERVER answers it rides along, so the addresses the
    // draft must not collide with are all of them, not just the rows'.
    void Promise.all([getSettings(), getLibrary().catch(() => [] as LibraryPath[])])
      .then(([s, paths]) => {
        if (!live) return;
        const l = s.effective.library;
        const rows = l.paths.map((p) => ({ ...p }));
        setShelf({ enabled: l.enabled, nav: l.nav, home: l.home, title: l.title, paths: rows });
        setMerged(paths);
        const taken = [...rows, ...paths.map((p) => ({ ...p, folder: p.folder }) as LibraryPathRef)];
        setDraft(libraryRowForFolder(state.path, state.unitNames, taken));
      })
      .catch(() => {
        if (live) toast(t("libraryFailed"), "error");
        onClose();
      });
    return () => {
      live = false;
    };
  }, [state.path, state.unitNames, onClose]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    anchorPopover(el, state.x, state.y);
    el.querySelector<HTMLElement>("input, button")?.focus();
  }, [state.x, state.y, shelf]);


  // ANCHORED, BUT STILL MODAL WHILE IT IS UP. The layout effect above puts
  // focus inside (`manualFocus` keeps that the only decision), and this keeps
  // Tab from walking out into the tree the popover is about — measured at
  // twenty escapes — and puts focus back on the row that opened it. Escape and
  // the outside mousedown are the listeners below.
  useDialog(ref, { manualFocus: true });

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const folder = libraryFolder(state.path);
  const existing = shelf?.paths.find((p) => libraryFolder(p.folder) === folder) ?? null;
  // On the shelf with no row of its own: a root's child, or a folder note.
  const derived = existing === null ? (merged.find((p) => libraryFolder(p.folder) === folder) ?? null) : null;

  const save = async (paths: LibraryPathRef[], enabled: boolean, done: string, offerEdit = false) => {
    if (!shelf) return;
    setBusy(true);
    try {
      await patchSettings({ library: { enabled, nav: shelf.nav, home: shelf.home, title: shelf.title, paths } });
      // "On the shelf." and then what? The blurb, the cover and the source are
      // four clicks away in a panel the reader is not in, and the old toast
      // just named the path to them ("Settings → Collections") and faded. An
      // offer they can press is the same sentence with a door in it.
      if (offerEdit) actionToast(done, t("libraryEditToast"), () => useStore.getState().openSettingsAt("rowLibraryPaths"));
      else toast(done);
      onClose();
    } catch {
      toast(t("libraryFailed"), "error");
      setBusy(false);
    }
  };

  const kindLabel = (kind: LibraryKind): string =>
    kind === "book" ? t("libraryKindBook") : kind === "course" ? t("libraryKindCourse") : t("libraryKindSeries");

  return (
    <div
      ref={ref}
      className="s-libpop"
      role="dialog"
      aria-modal="true"
      aria-label={t("libraryTitle")}
      style={{ left: state.x, top: state.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="s-libpop__title">
        <span>{t("libraryTitle")}</span>
        <bdi className="s-libpop__folder">{state.name}</bdi>
      </div>
      {shelf && existing && (
        <>
          <p className="s-libpop__on" dir="auto">
            {tf("libraryPopOnShelf", { title: existing.title })}
            <span className="s-libpop__kind">{kindLabel(existing.kind)}</span>
          </p>
          <div className="s-libpop__actions">
            <a className="s-btn" href={libraryUrl(existing.slug)} target="_blank" rel="noreferrer">
              {t("libraryPopOpen")}
            </a>
            <button
              type="button"
              className="s-btn s-btn--danger"
              disabled={busy}
              onClick={() =>
                void save(
                  shelf.paths.filter((p) => p.id !== existing.id),
                  shelf.enabled,
                  t("libraryRemoved"),
                )
              }
            >
              {t("libraryPopRemove")}
            </button>
          </div>
        </>
      )}
      {shelf && !existing && derived && (
        <>
          <p className="s-libpop__on" dir="auto">
            {tf("libraryPopOnShelf", { title: derived.title })}
            <span className="s-libpop__kind">{kindLabel(derived.kind)}</span>
          </p>
          <p className="s-libpop__hint">{t("libraryFromFolderNote")}</p>
          <div className="s-libpop__actions">
            <a className="s-btn" href={libraryUrl(derived.slug)} target="_blank" rel="noreferrer">
              {t("libraryPopOpen")}
            </a>
          </div>
        </>
      )}
      {shelf && !existing && !derived && draft && (
        <>
          <div className="s-libpop__kinds" role="radiogroup" aria-label={t("libraryPathKind")}>
            {LIBRARY_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={draft.kind === kind}
                className={`s-libpop__kindbtn${draft.kind === kind ? " s-libpop__kindbtn--on" : ""}`}
                onClick={() => setDraft({ ...draft, kind })}
              >
                {kindLabel(kind)}
              </button>
            ))}
          </div>
          <input
            className="s-input s-libpop__name"
            value={draft.title}
            dir="auto"
            maxLength={LIBRARY_TITLE_MAX}
            aria-label={t("libraryPathTitle")}
            placeholder={t("libraryPathTitlePlaceholder")}
            spellCheck={false}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.title.trim()) {
                e.preventDefault();
                void add();
              }
            }}
          />
          <p className="s-libpop__hint">{t("libraryPopHint")}</p>
          <div className="s-libpop__actions">
            <span className="s-libpop__url" dir="ltr">
              {libraryUrl(draft.slug)}
            </span>
            <button
              type="button"
              className="s-btn s-btn--accent"
              disabled={busy || !draft.title.trim() || shelf.paths.length >= LIBRARY_PATHS_MAX}
              title={shelf.paths.length >= LIBRARY_PATHS_MAX ? tf("libraryFull", { max: localeNum(LIBRARY_PATHS_MAX) }) : undefined}
              onClick={() => void add()}
            >
              {t("libraryPopAdd")}
            </button>
          </div>
        </>
      )}
    </div>
  );

  async function add(): Promise<void> {
    if (!shelf || !draft) return;
    const row = { ...draft, title: draft.title.trim() };
    // The first path switches the library on: a shelf with a book on it that
    // nobody can reach is a mistake, not a setting.
    const enabled = shelf.enabled || shelf.paths.length === 0;
    await save([...shelf.paths, row], enabled, enabled && !shelf.enabled ? t("libraryAddedOn") : t("libraryAdded"), true);
  }
}
