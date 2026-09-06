// "Collections…" on a note, "Publish as a collection…" on a folder.
//
// A collection was joined by typing `folders: games` into frontmatter, and a
// collection could only be a list of such notes. Both are now a right-click
// away: a note's popover ticks the collections it belongs to (the write goes
// through /api/frontmatter, byte-surgical, the shape the properties card
// uses), and a folder's popover makes the folder a collection — every
// published note under it belongs, and frontmatter still adds strays from
// elsewhere. Anchored like the Library popover, placed by the same rule.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FOLDER_DESC_MAX, FOLDER_TITLE_MAX, PUBLIC_FOLDERS_MAX, collectionsForPath, folderId, suggestSlug } from "../../shared/publicFolders.ts";
import { libraryTitleOf } from "../../shared/library.ts";
import type { FolderIcon } from "../../shared/folderIcons.ts";
import type { PublicFolderRef } from "../../shared/types.ts";
import { getNote, getSettings, patchSettings, setFrontmatter } from "../api.ts";
import { foldersOf } from "../collections/foldersOf.ts";
import { localeNum, t, tf } from "../i18n.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { anchorPopover } from "./anchorPopover.ts";
import FolderGlyph from "./FolderGlyph.tsx";
import "../styles/libraryfolder.css";

export interface CollectionsPopState {
  kind: "note" | "folder";
  /** Vault-relative path of the note or the folder. */
  path: string;
  name: string;
  x: number;
  y: number;
  fromKeyboard: boolean;
}

interface Rows {
  enabled: boolean;
  nav: boolean;
  home: boolean;
  folders: PublicFolderRef[];
}

export default function CollectionsPopover({ state, onClose }: { state: CollectionsPopState; onClose(): void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [rows, setRows] = useState<Rows | null>(null);
  const [declared, setDeclared] = useState<string[] | null>(null);
  const [title, setTitle] = useState(() => libraryTitleOf(state.path) || state.name);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const treeIcon = useStore((s) => (state.kind === "folder" ? s.folderIcons[state.path] : undefined));

  useEffect(() => {
    let live = true;
    void Promise.all([
      getSettings(),
      state.kind === "note" ? getNote(state.path).then((n) => foldersOf(n.content)) : Promise.resolve([] as string[]),
    ])
      .then(([s, mine]) => {
        if (!live) return;
        const pf = s.effective.publicFolders;
        setRows({ enabled: pf.enabled, nav: pf.nav, home: pf.home, folders: pf.folders.map((r) => ({ ...r })) });
        setDeclared(mine);
      })
      .catch(() => {
        if (live) toast(t("collectionsFailed"), "error");
        onClose();
      });
    return () => {
      live = false;
    };
  }, [state.kind, state.path, onClose]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    anchorPopover(el, state.x, state.y);
    el.querySelector<HTMLElement>("input, button")?.focus();
  }, [state.x, state.y, rows]);

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

  const saveRows = async (next: Rows, done: string): Promise<void> => {
    setBusy(true);
    try {
      await patchSettings({ publicFolders: { enabled: next.enabled, nav: next.nav, home: next.home, folders: next.folders.length ? next.folders : null } });
      toast(done);
      onClose();
    } catch {
      toast(t("collectionsFailed"), "error");
      setBusy(false);
    }
  };

  // ── A note: tick the collections it belongs to ────────────────────────────
  const toggle = async (slug: string, on: boolean): Promise<void> => {
    if (!declared) return;
    const next = on ? [...declared, slug] : declared.filter((s) => s !== slug);
    setDeclared(next);
    try {
      await setFrontmatter(state.path, "folders", next.length ? { kind: "list", items: next } : null);
    } catch {
      toast(t("collectionsFailed"), "error");
      setDeclared(declared);
    }
  };

  const auto = rows ? collectionsForPath(state.path, rows.folders) : [];
  const owning = rows && state.kind === "folder" ? rows.folders.find((r) => r.folder === state.path) ?? null : null;

  return (
    <div ref={ref} className="s-libpop" role="dialog" aria-label={t("rowPublicFolders")} style={{ left: state.x, top: state.y }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="s-libpop__title">
        <span>{t("rowPublicFolders")}</span>
        <bdi className="s-libpop__folder">{state.name}</bdi>
      </div>

      {rows && state.kind === "note" && declared && (
        rows.folders.length === 0 ? (
          <p className="s-libpop__hint">{t("collectionsNone")}</p>
        ) : (
          <div className="s-libpop__rows" role="group" aria-label={t("rowPublicFolders")}>
            {rows.folders.map((row) => {
              const byFolder = auto.includes(row.slug);
              const on = byFolder || declared.includes(row.slug);
              return (
                <label key={row.id} className={`s-libpop__row${row.hidden ? " s-libpop__row--hidden" : ""}`}>
                  <input type="checkbox" checked={on} disabled={byFolder} onChange={(e) => void toggle(row.slug, e.target.checked)} />
                  <span className="s-libpop__glyph" aria-hidden="true">
                    <FolderGlyph icon={row.icon} size={14} />
                  </span>
                  <span className="s-libpop__rowtitle" dir="auto">
                    {row.title}
                  </span>
                  {byFolder && <span className="s-libpop__kind">{t("collectionsWholeFolder")}</span>}
                  {row.hidden && !byFolder && <span className="s-libpop__kind">{t("publicFolderHidden")}</span>}
                </label>
              );
            })}
          </div>
        )
      )}

      {rows && state.kind === "folder" && owning && (
        <>
          <p className="s-libpop__on" dir="auto">
            {tf("collectionPopOn", { title: owning.title })}
          </p>
          <div className="s-libpop__actions">
            <a className="s-btn" href={`/folder/${encodeURIComponent(owning.slug)}`} target="_blank" rel="noreferrer">
              {t("collectionPopOpen")}
            </a>
            <button
              type="button"
              className="s-btn s-btn--danger"
              disabled={busy}
              onClick={() => {
                const { folder: _drop, ...rest } = owning;
                void saveRows({ ...rows, folders: rows.folders.map((r) => (r.id === owning.id ? rest : r)) }, t("collectionUnlinked"));
              }}
            >
              {t("collectionPopStop")}
            </button>
          </div>
        </>
      )}

      {rows && state.kind === "folder" && !owning && (
        <>
          <input
            className="s-input s-libpop__name"
            value={title}
            dir="auto"
            maxLength={FOLDER_TITLE_MAX}
            aria-label={t("publicFolderTitle")}
            spellCheck={false}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && title.trim()) {
                e.preventDefault();
                void make();
              }
            }}
          />
          <input
            className="s-input s-libpop__name"
            value={description}
            dir="auto"
            maxLength={FOLDER_DESC_MAX}
            aria-label={t("publicFolderDesc")}
            placeholder={t("publicFolderDescPlaceholder")}
            spellCheck={false}
            onChange={(e) => setDescription(e.target.value)}
          />
          <p className="s-libpop__hint">{t("collectionPopHint")}</p>
          <p className="s-libpop__hint">{t("folderNoteHint")}</p>
          <div className="s-libpop__actions">
            <span className="s-libpop__url" dir="ltr">
              /folder/{freshSlug(title, rows.folders)}
            </span>
            <button
              type="button"
              className="s-btn s-btn--accent"
              disabled={busy || !title.trim() || rows.folders.length >= PUBLIC_FOLDERS_MAX}
              title={rows.folders.length >= PUBLIC_FOLDERS_MAX ? tf("collectionsFull", { max: localeNum(PUBLIC_FOLDERS_MAX) }) : undefined}
              onClick={() => void make()}
            >
              {t("collectionPopMake")}
            </button>
          </div>
        </>
      )}
    </div>
  );

  async function make(): Promise<void> {
    if (!rows) return;
    const icon: FolderIcon = treeIcon ?? "archive";
    const row: PublicFolderRef = { id: folderId(), slug: freshSlug(title, rows.folders), title: title.trim(), icon, folder: state.path };
    if (description.trim()) row.description = description.trim();
    // The first collection switches the feature on, as the first library
    // path switches the library on: a collection nobody can reach is a
    // mistake, not a setting.
    const enabled = rows.enabled || rows.folders.length === 0;
    await saveRows({ ...rows, enabled, folders: [...rows.folders, row] }, enabled && !rows.enabled ? t("collectionMadeOn") : t("collectionMade"));
  }
}

/** A slug for a new row that no row already holds. */
function freshSlug(title: string, taken: readonly PublicFolderRef[]): string {
  const base = suggestSlug(title) || "collection";
  const used = new Set(taken.map((r) => r.slug));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const slug = `${base}-${n}`;
    if (!used.has(slug)) return slug;
  }
}
