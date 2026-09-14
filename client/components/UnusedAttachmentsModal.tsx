// Unused attachments (palette: "Unused attachments") — the files no note
// points at, with a way to sweep them into the trash.
//
// The delete previews say what a delete would BREAK; nothing said what a
// delete would not touch at all. A vault that has had images pasted into it
// for two years holds a thousand files under `attachments/`, and the twenty
// stale screenshots among them are indistinguishable by eye from the figures
// an essay still embeds. The index has always known the difference (it is
// the same walk that decides what a visitor may fetch); this is the surface
// that asks it.
//
// NOTHING HERE ERASES. "Move to trash" sends each chosen path through the
// same `DELETE /api/attachment` the tree's row menu uses, so every file lands
// in `.trash/` with its origin recorded, and the toast's Undo restores the
// whole sweep through the trash browser's own machinery. A sweep that could
// not be taken back would be the folder-delete bug at scale.
//
// Same panel family as the trash browser (raised ground, small-caps header,
// a scrolling row list) so it reads as that surface's sibling — which it is.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UnusedAttachment } from "../../shared/types.ts";
import { useDialog } from "../a11y.ts";
import { deleteAttachment, listUnusedAttachments } from "../api.ts";
import { clearBrokenEmbeds } from "../editor/embeds.ts";
import { countPhrase, localeNum, t, tf } from "../i18n.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { actionToast } from "../undoToast.ts";
import { formatSize } from "./AttachmentViewer.tsx";
import "../styles/unused.css";

type Feed =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; files: UnusedAttachment[]; total: number };

export default function UnusedAttachmentsModal() {
  const setUnusedOpen = useStore((s) => s.setUnusedOpen);
  useStore((s) => s.language); // re-render the chrome strings on a language change
  const [feed, setFeed] = useState<Feed>({ state: "loading" });
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setUnusedOpen(false), [setUnusedOpen]);
  // Focus trap + restoration, and Esc — the same hook every other dialog
  // takes, so a keyboard reader lands back on the palette that opened this.
  useDialog(boxRef, { onEscape: close });

  const reload = useCallback(() => {
    setFeed({ state: "loading" });
    setChosen(new Set());
    listUnusedAttachments()
      .then((result) => setFeed({ state: "ready", files: result.files, total: result.total }))
      .catch((err: unknown) => {
        console.error("astrolabe: listing unused attachments failed", err);
        setFeed({ state: "error" });
      });
  }, []);

  useEffect(reload, [reload]);

  const files = feed.state === "ready" ? feed.files : [];
  const allChosen = files.length > 0 && files.every((f) => chosen.has(f.path));
  const chosenFiles = useMemo(() => files.filter((f) => chosen.has(f.path)), [files, chosen]);
  const chosenBytes = chosenFiles.reduce((n, f) => n + f.size, 0);
  const totalBytes = files.reduce((n, f) => n + f.size, 0);

  const toggle = (path: string): void => {
    setChosen((cur) => {
      const next = new Set(cur);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleAll = (): void => {
    setChosen(allChosen ? new Set() : new Set(files.map((f) => f.path)));
  };

  const sweep = (): void => {
    if (chosenFiles.length === 0 || busy) return;
    setBusy(true);
    // One request per file, in order, each answered with the trash entry it
    // became. Sequential rather than a fan-out: two hundred concurrent
    // renames into one `.trash/` are two hundred races for the same counter
    // suffix, and the server's trash manifest is one file.
    const run = async (): Promise<void> => {
      const entries: string[] = [];
      let failed = 0;
      for (const file of chosenFiles) {
        try {
          const result = await deleteAttachment(file.path);
          if (result.trashPath) entries.push(result.trashPath.slice(result.trashPath.lastIndexOf("/") + 1));
        } catch (err) {
          failed++;
          console.error(`astrolabe: could not trash ${file.path}`, err);
        }
      }
      const store = useStore.getState();
      // What the store's own deleteAttachment does after ONE file, done once
      // after all of them: the tree, the publish surfaces (a published note
      // cannot embed an unused file by definition, but the counts moved),
      // the embed cache, and a remount of what is open.
      await store.loadTree();
      void store.loadPublished();
      clearBrokenEmbeds();
      store.bumpReload();
      if (failed > 0) toast(tf("unusedTrashFailed", { files: countPhrase(failed, "files") }), "error");
      if (entries.length > 0) {
        // The Undo restores every entry the sweep made — the trash browser's
        // own restore, per entry, exactly what deletedToast() does for one.
        actionToast(tf("unusedTrashedToast", { files: countPhrase(entries.length, "files") }), t("undo"), () => {
          void Promise.allSettled(entries.map((name) => useStore.getState().restoreTrash(name))).then((results) => {
            const back = results.filter((r) => r.status === "fulfilled").length;
            if (back < entries.length) console.error("astrolabe: undoing the sweep left entries in .trash", results);
            toast(back < entries.length ? t("restoreFailed") : tf("unusedRestoredToast", { files: countPhrase(back, "files") }), back < entries.length ? "error" : "info");
            reload();
          });
        });
      }
      reload();
    };
    void run().finally(() => setBusy(false));
  };

  return (
    <div className="s-unused-overlay" onMouseDown={close}>
      <div
        ref={boxRef}
        className="s-unused"
        role="dialog"
        aria-modal="true"
        aria-label={t("unusedTitle")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="s-unused__header">
          <h2 className="s-unused__title">{t("unusedTitle")}</h2>
          {feed.state === "ready" && files.length > 0 && (
            <span className="s-unused__count" dir="auto">
              {`${countPhrase(files.length, "files")} · ${formatSize(totalBytes)}`}
            </span>
          )}
          <button
            type="button"
            className="s-unused__close"
            title={t("close")}
            aria-label={t("closeUnused")}
            onClick={close}
          >
            ×
          </button>
        </header>

        {/* What "unused" means, said once: the four routes the index checks.
            A reader about to move two hundred files deserves the definition
            before the checkbox, not in a doc page. */}
        <p className="s-unused__help" dir="auto">
          {t("unusedHelp")}
        </p>

        <div className="s-unused__list">
          {feed.state === "loading" && <div className="s-unused__empty">{t("unusedLoading")}</div>}
          {feed.state === "error" && <div className="s-unused__empty">{t("unusedLoadFailed")}</div>}
          {feed.state === "ready" && files.length === 0 && (
            <div className="s-unused__empty">{t("unusedEmpty")}</div>
          )}
          {feed.state === "ready" && files.length > 0 && (
            <label className="s-unusedrow s-unusedrow--all">
              <input type="checkbox" className="s-unusedrow__check" checked={allChosen} onChange={toggleAll} />
              <span className="s-unusedrow__name">{t("unusedSelectAll")}</span>
            </label>
          )}
          {feed.state === "ready" &&
            files.map((file) => (
              <label key={file.path} className="s-unusedrow">
                <input
                  type="checkbox"
                  className="s-unusedrow__check"
                  checked={chosen.has(file.path)}
                  onChange={() => toggle(file.path)}
                />
                <span className="s-unusedrow__main">
                  <span className="s-unusedrow__name" dir="auto">
                    {file.path}
                  </span>
                  <span className="s-unusedrow__meta" dir="auto">
                    {formatSize(file.size)}
                  </span>
                </span>
              </label>
            ))}
          {feed.state === "ready" && feed.total > files.length && (
            <div className="s-unused__more" dir="auto">
              {tf("unusedTruncated", { shown: localeNum(files.length), total: localeNum(feed.total) })}
            </div>
          )}
        </div>

        {feed.state === "ready" && files.length > 0 && (
          <footer className="s-unused__footer">
            <span className="s-unused__chosen" dir="auto">
              {tf("unusedSelected", { files: countPhrase(chosenFiles.length, "files"), size: formatSize(chosenBytes) })}
            </span>
            <button
              type="button"
              className="s-unused__trash"
              disabled={chosenFiles.length === 0 || busy}
              title={t("cmdTrashHint")}
              onClick={sweep}
            >
              {t("unusedTrash")}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
