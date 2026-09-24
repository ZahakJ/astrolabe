// The custom public folders table on Collections: which vault folders the
// public site names, under what title, slug and icon. Split out of
// SettingsModal.tsx (3.27.0) unchanged.

import { Suspense, useEffect, useState } from "react";
import type { PublicFolderRef } from "../../../shared/types.ts";
import type { FolderMark } from "../../../shared/folderIcons.ts";
import { folderIconLabel } from "../../folderIconLabels.ts";
import FolderGlyph from "../FolderGlyph.tsx";
import type { IconPickState } from "../FolderIconPicker.tsx";
import { pickFolder } from "../FolderPicker.tsx";
import { lazySurface } from "../../lazySurface.tsx";
import { folderId, suggestSlug, FOLDER_DESC_MAX, FOLDER_SLUG_MAX, FOLDER_TITLE_MAX, PUBLIC_FOLDERS_MAX } from "../../../shared/publicFolders.ts";
import { getCollections } from "../../api.ts";
import { t } from "../../i18n.ts";
import { TextInput, Toggle } from "../controls/Fields.tsx";

export const FolderIconPicker = lazySurface(() => import("../FolderIconPicker.tsx"));

/** THE PUBLIC-FOLDERS TABLE.
 *
 *  A list of the owner's own collections: a glyph, a title, the slug that
 *  becomes `/folder/<slug>`, one line of description, a hide switch, and the
 *  two buttons that move a row. It is the same kind of control as the tag-label
 *  table above and for the same reason — the values are a LIST the reader adds
 *  to, reorders and deletes from, and a textarea of `slug | title | icon` lines
 *  would be a syntax to learn on top of a feature to learn.
 *
 *  Four deliberate details:
 *   · THE SLUG IS `dir="ltr"`, the title and description `dir="auto"`. A slug
 *     is machine text — a URL segment and a frontmatter value — and must never
 *     be reordered by an RTL panel; a title is prose in its own language.
 *   · THE SLUG FILLS ITSELF FROM THE TITLE while it is still empty. The shared
 *     TextInput has no `onBlur` (and growing one for a single row is worse
 *     than doing this on change), so the suggestion runs as the title is
 *     typed and stops the moment the reader touches the slug field — which is
 *     also what makes an Arabic title leave the field empty rather than
 *     filling it with hyphens.
 *   · REORDER IS TWO BUTTONS, not a drag. The row order is the order the
 *     folders appear in the nav and on the home band, and ↑/↓ is reachable
 *     from a keyboard and from a finger with no gesture to discover.
 *   · HIDE IS NOT DELETE. A hidden folder keeps its title, glyph, slug and
 *     members and reaches no visitor — the lossless take-down NavItems have.
 */
export function PublicFolderEditor({
  rows,
  disabled,
  onChange,
}: {
  rows: PublicFolderRef[];
  disabled: boolean;
  onChange: (rows: PublicFolderRef[]) => void;
}) {
  const set = (i: number, patch: Partial<PublicFolderRef>): void => {
    onChange(rows.map((row, n) => (n === i ? { ...row, ...patch } : row)));
  };
  // The collections the VAULT declares (tag pages), listed under the rows so
  // the owner sees the whole navigation from here without a row per one.
  const [fromPages, setFromPages] = useState<PublicFolderRef[]>([]);
  useEffect(() => {
    let live = true;
    void getCollections()
      .then((all) => live && setFromPages(all.filter((r) => r.tag && !rows.some((row) => row.slug === r.slug))))
      .catch(() => live && setFromPages([]));
    return () => {
      live = false;
    };
  }, [rows]);
  // The glyph button opens the tree's own picker (search, shelves, the lot)
  // anchored under the button; `path` carries the row id so the pick lands
  // on the right row when the list has reordered underneath.
  const [iconPick, setIconPick] = useState<IconPickState | null>(null);
  const move = (i: number, delta: number): void => {
    const to = i + delta;
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    const [row] = next.splice(i, 1);
    next.splice(to, 0, row);
    onChange(next);
  };
  return (
    <div className="s-pfolders">
      {rows.length === 0 ? (
        <p className="s-pfolders__empty">{t("publicFoldersEmpty")}</p>
      ) : (
        rows.map((row, i) => (
          <div className="s-pfolders__card" key={row.id}>
            <div className="s-pfolders__main">
              {/* The chosen glyph, drawn beside the list that names it: the
                  Select renders text rows, and a folder mark that can only be
                  read as the word "gamepad" is not a mark. */}
              <button
                type="button"
                className="s-pfolders__iconbtn"
                disabled={disabled}
                aria-label={t("publicFolderIcon")}
                title={t("publicFolderIcon")}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setIconPick({
                    path: row.id,
                    name: row.title || t("publicFolderIcon"),
                    current: row.icon,
                    x: r.left,
                    y: r.bottom + 4,
                    fromKeyboard: e.detail === 0,
                  });
                }}
              >
                <span className="s-pfolders__glyph" aria-hidden="true">
                  <FolderGlyph icon={row.icon} size={18} />
                </span>
                <span className="s-pfolders__iconname">{folderIconLabel(row.icon)}</span>
              </button>
              <TextInput
                value={row.title}
                onChange={(v) =>
                  set(i, {
                    title: v,
                    ...(row.slug.trim() === "" ? { slug: suggestSlug(v) } : {}),
                  })
                }
                placeholder={t("publicFolderTitlePlaceholder")}
                label={t("publicFolderTitle")}
                disabled={disabled}
                dir="auto"
                maxLength={FOLDER_TITLE_MAX}
              />
              <TextInput
                value={row.slug}
                onChange={(v) => set(i, { slug: v })}
                placeholder={t("publicFolderSlugPlaceholder")}
                label={t("publicFolderSlug")}
                disabled={disabled}
                dir="ltr"
                maxLength={FOLDER_SLUG_MAX}
              />
            </div>
            <button
              type="button"
              className={`s-libpaths__folder${row.folder ? "" : " s-libpaths__folder--empty"}`}
              disabled={disabled}
              title={t("publicFolderFolder")}
              onClick={() =>
                void pickFolder({ title: t("publicFolderFolder"), current: row.folder ?? null }).then((folder) => {
                  if (folder !== null) set(i, { folder });
                })
              }
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
                <path d="M1.5 12.5v-9h4l1.5 2h7.5v7z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              <span className="s-libpaths__folder-path" dir="ltr">
                {row.folder || t("publicFolderFolderNone")}
              </span>
              <span className="s-libpaths__folder-cta">{t("libraryPathChoose")}</span>
            </button>
            {row.folder && (
              <button type="button" className="s-pfolders__unlink" disabled={disabled} onClick={() => set(i, { folder: undefined })}>
                {t("publicFolderFolderClear")}
              </button>
            )}
            <div className="s-pfolders__extra">
              <TextInput
                value={row.description ?? ""}
                onChange={(v) => set(i, { description: v })}
                placeholder={t("publicFolderDescPlaceholder")}
                label={t("publicFolderDesc")}
                disabled={disabled}
                dir="auto"
                maxLength={FOLDER_DESC_MAX}
              />
              {/* ON means VISIBLE — the library paths' rule, same shape. */}
              <Toggle
                label={t("publicFolderVisible")}
                onLabel={t("publicFolderVisible")}
                offLabel={t("publicFolderHidden")}
                value={row.hidden !== true}
                disabled={disabled}
                onChange={(on) => set(i, { hidden: on ? undefined : true })}
              />
              <button
                type="button"
                className="s-pfolders__move"
                title={t("publicFolderUp")}
                aria-label={t("publicFolderUp")}
                disabled={disabled || i === 0}
                onClick={() => move(i, -1)}
              >
                {/* Geometry, not a glyph: an SVG arrow takes no bidi and needs
                    no mirroring rule (the tag table's ✕ makes the same call). */}
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
                  <path d="M8 12V4M4 8l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                className="s-pfolders__move"
                title={t("publicFolderDown")}
                aria-label={t("publicFolderDown")}
                disabled={disabled || i === rows.length - 1}
                onClick={() => move(i, 1)}
              >
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
                  <path d="M8 4v8M4 8l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                className="s-pfolders__del"
                title={t("publicFolderRemove")}
                aria-label={t("publicFolderRemove")}
                disabled={disabled}
                onClick={() => onChange(rows.filter((_, n) => n !== i))}
              >
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
                  <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        ))
      )}
      {fromPages.length > 0 && (
        <div className="s-libpaths__vault">
          <span className="s-libpaths__caption">{t("collectionsVaultRows")}</span>
          {fromPages.map((r) => (
            <div key={r.id} className="s-libpaths__vaultrow">
              <span className="s-pfolders__glyph" aria-hidden="true">
                <FolderGlyph icon={r.icon} size={16} />
              </span>
              <span className="s-libpaths__vaulttitle" dir="auto">
                {r.title}
              </span>
              <span className="s-libpaths__url" dir="ltr">
                #{r.tag}
                {r.folder ? ` · ${r.folder}` : ""}
              </span>
              <span className="s-libpaths__count">{t("collectionFromTagPage")}</span>
            </div>
          ))}
        </div>
      )}
      <p className="s-libpaths__hint">{t("tagPageHint")}</p>
      {iconPick && (
        <Suspense fallback={null}>
          <FolderIconPicker
            state={iconPick}
            onPick={(icon: FolderMark | null) => {
              // A public folder always wears a mark, so "No icon" only closes.
              if (icon !== null) {
                const i = rows.findIndex((r) => r.id === iconPick.path);
                if (i >= 0) set(i, { icon });
              }
              setIconPick(null);
            }}
            onClose={() => setIconPick(null)}
          />
        </Suspense>
      )}
      <button
        type="button"
        className="s-pfolders__add"
        disabled={disabled || rows.length >= PUBLIC_FOLDERS_MAX}
        onClick={() =>
          onChange([...rows, { id: folderId(), slug: "", title: "", icon: "book" }])
        }
      >
        {t("publicFolderAdd")}
      </button>
    </div>
  );
}
