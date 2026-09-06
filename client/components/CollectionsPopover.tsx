// "Collections…" on a note, "Publish folder as a topic…" on a folder.
//
// Both live under the TAGS system (under folders the folders are the
// categories and neither verb is offered). A collection is a tag the owner
// curates: it is declared in the vault by a TAG PAGE (`<tags folder>/<tag>.md`
// with `collection: true`), notes join by carrying the tag, and the page may
// name a `folder:` whose published notes all belong. So:
//
//  * a FOLDER's popover writes that tag page — tag, title, description, the
//    folder's tree mark, `folder: <this folder>` — through the note routes,
//    nothing in settings;
//  * a NOTE's popover ticks the collections the server knows (/api/collections:
//    tag pages and any settings rows), writing `tags:` for a collection that
//    is a tag and `folders:` for a legacy row, byte-surgically through
//    /api/frontmatter. A membership that comes from the folder is shown ticked
//    and cannot be unticked here.
//
// Anchored like the Library popover, placed by the same rule.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FOLDER_DESC_MAX, FOLDER_TITLE_MAX, collectionsForPath, suggestSlug } from "../../shared/publicFolders.ts";
import { libraryTitleOf } from "../../shared/library.ts";
import type { FolderMark } from "../../shared/folderIcons.ts";
import type { PublicFolderRef } from "../../shared/types.ts";
import { createNote, getCollections, getNote, getSettings, setFrontmatter } from "../api.ts";
import { foldersOf, tagsOf } from "../collections/foldersOf.ts";
import { t, tf } from "../i18n.ts";
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

export default function CollectionsPopover({ state, onClose }: { state: CollectionsPopState; onClose(): void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [rows, setRows] = useState<PublicFolderRef[] | null>(null);
  const [tagsFolder, setTagsFolder] = useState<string>("");
  const [declared, setDeclared] = useState<{ folders: string[]; tags: string[] } | null>(null);
  const [title, setTitle] = useState(() => libraryTitleOf(state.path) || state.name);
  const [tag, setTag] = useState(() => suggestSlug(libraryTitleOf(state.path) || state.name));
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const treeIcon = useStore((s) => (state.kind === "folder" ? s.folderIcons[state.path] : undefined));

  useEffect(() => {
    let live = true;
    void Promise.all([
      getCollections(),
      getSettings(),
      state.kind === "note" ? getNote(state.path).then((n) => ({ folders: foldersOf(n.content), tags: tagsOf(n.content) })) : Promise.resolve(null),
    ])
      .then(([list, s, mine]) => {
        if (!live) return;
        setRows(list);
        setTagsFolder(s.effective.tagsFolder);
        setDeclared(mine ?? { folders: [], tags: [] });
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

  // ── A note: tick the collections it belongs to ────────────────────────────
  const toggle = async (row: PublicFolderRef, on: boolean): Promise<void> => {
    if (!declared) return;
    const before = declared;
    try {
      if (row.tag) {
        const next = on ? [...declared.tags, row.tag] : declared.tags.filter((s) => s !== row.tag);
        setDeclared({ ...declared, tags: next });
        await setFrontmatter(state.path, "tags", next.length ? { kind: "list", items: next } : null);
      } else {
        const next = on ? [...declared.folders, row.slug] : declared.folders.filter((s) => s !== row.slug);
        setDeclared({ ...declared, folders: next });
        await setFrontmatter(state.path, "folders", next.length ? { kind: "list", items: next } : null);
      }
    } catch {
      toast(t("collectionsFailed"), "error");
      setDeclared(before);
    }
  };

  const auto = rows ? collectionsForPath(state.path, rows) : [];
  const owning = rows && state.kind === "folder" ? rows.find((r) => r.folder === state.path) ?? null : null;
  const cleanTag = tag.trim().replace(/^#/, "").toLowerCase().replace(/\s+/g, "-");
  const pagePath = tagsFolder && cleanTag ? `${tagsFolder}/${cleanTag}.md` : "";

  return (
    <div ref={ref} className="s-libpop" role="dialog" aria-label={t("rowPublicFolders")} style={{ left: state.x, top: state.y }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="s-libpop__title">
        <span>{t("rowPublicFolders")}</span>
        <bdi className="s-libpop__folder">{state.name}</bdi>
      </div>

      {rows && state.kind === "note" && declared && (
        rows.filter((r) => !r.hidden).length === 0 ? (
          <p className="s-libpop__hint">{t("collectionsNone")}</p>
        ) : (
          <div className="s-libpop__rows" role="group" aria-label={t("rowPublicFolders")}>
            {rows.filter((r) => !r.hidden).map((row) => {
              const byFolder = auto.includes(row.slug);
              const mine = row.tag ? declared.tags.includes(row.tag) : declared.folders.includes(row.slug);
              const on = byFolder || mine;
              return (
                <label key={row.id} className="s-libpop__row">
                  <input type="checkbox" checked={on} disabled={byFolder} onChange={(e) => void toggle(row, e.target.checked)} />
                  <span className="s-libpop__glyph" aria-hidden="true">
                    <FolderGlyph icon={row.icon} size={14} />
                  </span>
                  <span className="s-libpop__rowtitle" dir="auto">
                    {row.title}
                  </span>
                  {byFolder ? <span className="s-libpop__kind">{t("collectionsWholeFolder")}</span> : row.tag ? <span className="s-libpop__kind">#{row.tag}</span> : null}
                </label>
              );
            })}
          </div>
        )
      )}

      {rows && state.kind === "folder" && owning && (
        <>
          <p className="s-libpop__on" dir="auto">
            {tf("collectionTopicExists", { title: owning.title })}
          </p>
          <div className="s-libpop__actions">
            <a className="s-btn" href={`/folder/${encodeURIComponent(owning.slug)}`} target="_blank" rel="noreferrer">
              {t("collectionPopOpen")}
            </a>
          </div>
        </>
      )}

      {rows && state.kind === "folder" && !owning && (
        <>
          <input
            className="s-input s-libpop__name"
            value={tag}
            dir="ltr"
            maxLength={60}
            aria-label={t("collectionTopicTag")}
            placeholder={t("collectionTopicTag")}
            spellCheck={false}
            onChange={(e) => setTag(e.target.value)}
          />
          <input
            className="s-input s-libpop__name"
            value={title}
            dir="auto"
            maxLength={FOLDER_TITLE_MAX}
            aria-label={t("publicFolderTitle")}
            placeholder={t("publicFolderTitle")}
            spellCheck={false}
            onChange={(e) => setTitle(e.target.value)}
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
            onKeyDown={(e) => {
              if (e.key === "Enter" && cleanTag) {
                e.preventDefault();
                void make();
              }
            }}
          />
          <p className="s-libpop__hint">{t("collectionTopicHint")}</p>
          <div className="s-libpop__actions">
            <span className="s-libpop__url" dir="ltr">
              {pagePath}
            </span>
            <button type="button" className="s-btn s-btn--accent" disabled={busy || !cleanTag || !pagePath} onClick={() => void make()}>
              {t("collectionTopicMake")}
            </button>
          </div>
        </>
      )}
    </div>
  );

  async function make(): Promise<void> {
    if (!pagePath) return;
    setBusy(true);
    try {
      // The page may already exist (a tag with labels, say): creating it is
      // then a no-op and the keys below are added to what is there.
      await createNote(pagePath).catch(() => undefined);
      const icon: FolderMark = treeIcon ?? "tag";
      await setFrontmatter(pagePath, "collection", { kind: "bool", bool: true });
      await setFrontmatter(pagePath, "folder", { kind: "text", text: state.path });
      await setFrontmatter(pagePath, "icon", { kind: "text", text: icon });
      if (title.trim() && title.trim() !== cleanTag) await setFrontmatter(pagePath, "title", { kind: "text", text: title.trim() });
      if (description.trim()) await setFrontmatter(pagePath, "description", { kind: "text", text: description.trim() });
      toast(tf("collectionTopicMade", { path: pagePath }));
      onClose();
    } catch {
      toast(t("collectionsFailed"), "error");
      setBusy(false);
    }
  }
}
