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

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  LIBRARY_KINDS,
  LIBRARY_PATHS_MAX,
  LIBRARY_TITLE_MAX,
  libraryFolder,
  libraryRowForFolder,
  libraryUrl,
} from "../../shared/library.ts";
import type { LibraryKind, LibraryPathRef } from "../../shared/types.ts";
import { getSettings, patchSettings } from "../api.ts";
import { localeNum, t, tf } from "../i18n.ts";
import { toast } from "../toast.ts";
import { anchorPopover } from "./anchorPopover.ts";
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
  const [draft, setDraft] = useState<LibraryPathRef | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void getSettings()
      .then((s) => {
        if (!live) return;
        const l = s.effective.library;
        const paths = l.paths.map((p) => ({ ...p }));
        setShelf({ enabled: l.enabled, nav: l.nav, home: l.home, title: l.title, paths });
        setDraft(libraryRowForFolder(state.path, state.unitNames, paths));
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

  const save = async (paths: LibraryPathRef[], enabled: boolean, done: string) => {
    if (!shelf) return;
    setBusy(true);
    try {
      await patchSettings({ library: { enabled, nav: shelf.nav, home: shelf.home, title: shelf.title, paths } });
      toast(done);
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
      {shelf && !existing && draft && (
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
    await save([...shelf.paths, row], enabled, enabled && !shelf.enabled ? t("libraryAddedOn") : t("libraryAdded"));
  }
}
