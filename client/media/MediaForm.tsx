// THE MEDIA FORM: one sheet for a new work and for an old one.
//
// New: the sheet composes a note at `Media/<Kind>/<Title>.md` whose body is
// one ```tracker fence (shared/media.ts) and PUTs it — the same write an
// autosave makes, so the tree, the search index and the shelf all learn of it
// through the ordinary events. It refuses to overwrite: a title that already
// has a note is an error line, not a silent replacement.
//
// Edit: the sheet opens pre-filled from the card's own fields and sends only
// fields to `POST /api/tracker`, which rewrites the fence in place. Nothing
// the author wrote outside the fence — the prose under it, the frontmatter,
// a second tracker — is touched, and the write is one file event.
//
// The progress is two numbers and a switch. A show is episodes of a season,
// a book pages of a total, a game hours of a beat time — or hours of nothing
// in particular, which is the switch: with it on the total field goes away
// and the fence says `12/?`, a count with no ceiling.

import { useEffect, useMemo, useRef, useState } from "react";
import { useDialog } from "../a11y.ts";
import { putNote, updateTracker, uploadAttachment } from "../api.ts";
import { PathInput } from "../components/controls/PathInput.tsx";
import { pickFolder } from "../components/FolderPicker.tsx";
import { NumberInput, SegmentedControl, TextInput, Toggle } from "../components/controls/Fields.tsx";
import { UPLOAD_MAX_MB } from "../../shared/limits.ts";
import { MEDIA_ROOTS, mediaNoteContent, mediaNotePath, mediaProgress } from "../../shared/media.ts";
import { defaultTrackerStep, foldKind, type TrackerFields, type TrackerKind, type TrackerStatus } from "../../shared/tracker.ts";
import type { TrackerMeta } from "../../shared/types.ts";
import { countPhrase, localeNum, t, tf, type I18nKey } from "../i18n.ts";
import { parentDir } from "../move.ts";
import { KIND_UNIT } from "../trackerUnits.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { draftOf, emptyDraft, numberOf, treeHasFolder, treeHasPath, type MediaDraft } from "./mediaModel.ts";

const KINDS: TrackerKind[] = ["show", "game", "book", "film", "course"];

const KIND_LABEL: Record<TrackerKind, I18nKey> = {
  book: "trackerKindBook",
  game: "trackerKindGame",
  film: "trackerKindFilm",
  show: "trackerKindShow",
  course: "trackerKindCourse",
  project: "trackerKindProject",
  habit: "trackerKindHabit",
};

const STATUSES: TrackerStatus[] = ["planned", "active", "done", "paused", "dropped"];

const STATUS_LABEL: Record<TrackerStatus, I18nKey> = {
  planned: "trackerStatusPlanned",
  active: "trackerStatusActive",
  done: "trackerStatusDone",
  paused: "trackerStatusPaused",
  dropped: "trackerStatusDropped",
};

/** The fields a draft becomes. Every key is sent: a cleared field is `null`,
 *  which removes the line, so an edit that empties the rating actually
 *  empties it rather than leaving last month's stars. */
function fieldsOf(draft: MediaDraft): TrackerFields & { title: string } {
  const done = numberOf(draft.done);
  const total = draft.openEnded ? null : numberOf(draft.total);
  const rating = numberOf(draft.rating);
  const kind = draft.kind.trim();
  return {
    title: draft.title.trim(),
    kind: kind === "" ? null : kind,
    season: foldKind(kind) === "show" && draft.season.trim() !== "" ? draft.season.trim() : null,
    cover: draft.cover.trim() === "" ? null : draft.cover.trim(),
    folder: draft.folder.trim() === "" ? null : draft.folder.trim(),
    progress: done === null ? null : mediaProgress(done, total),
    unit: draft.unit.trim() === "" ? null : draft.unit.trim(),
    step: (() => {
      const n = numberOf(draft.step);
      return n === null || n <= 0 ? null : String(n);
    })(),
    status: draft.status,
    rating: rating === null ? null : `${Math.min(10, rating)}/10`,
    started: draft.started.trim() === "" ? null : draft.started.trim(),
    finished: draft.finished.trim() === "" ? null : draft.finished.trim(),
    notes: draft.notes.trim() === "" ? null : draft.notes.trim(),
  };
}

export function MediaForm({
  editing,
  onClose,
  onSaved,
}: {
  editing: TrackerMeta | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<MediaDraft>(() => (editing ? draftOf(editing) : emptyDraft()));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLFormElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  useDialog(panelRef, { onEscape: onClose });
  useEffect(() => setError(null), [draft.title]);

  const set = <K extends keyof MediaDraft>(key: K, value: MediaDraft[K]): void =>
    setDraft((d) => ({ ...d, [key]: value }));

  const kindKey = foldKind(draft.kind);
  // The kind row: the five shelves, plus the card's own word when an edit
  // arrives with a kind the five do not cover ("boardgame"), so the sheet
  // never silently re-files a work.
  const segments = useMemo(() => {
    const rows: { value: string; label: string }[] = KINDS.map((kind) => ({ value: kind, label: t(KIND_LABEL[kind]) }));
    const own = draft.kind.trim();
    const folded = foldKind(own);
    if (own !== "" && (folded === null || !KINDS.includes(folded))) rows.push({ value: own, label: own });
    return rows;
  }, [draft.kind]);
  const segmentValue = kindKey && KINDS.includes(kindKey) ? kindKey : draft.kind.trim();

  // The kind's unit as a bare noun ("pages", "صفحات"): countPhrase is the
  // one place the inflected word lives, so ask it for TEN of them and drop
  // the number — ten, because Arabic's dual ("حلقتان") is its own form and
  // the plural noun is what three to ten take. The author's own unit wins
  // when they typed one.
  const kindNoun = kindKey ? countPhrase(10, KIND_UNIT[kindKey]).replace(/^[\d٠-٩٬,.\s]+/, "") : "";
  const unitWord = draft.unit.trim() !== "" ? draft.unit.trim() : kindNoun;

  const save = async (): Promise<void> => {
    const title = draft.title.trim();
    if (title === "") {
      setError(t("mediaTitleRequired"));
      return;
    }
    setBusy(true);
    const fields = fieldsOf(draft);
    try {
      if (editing) {
        await updateTracker(editing.path, editing.index, fields);
        toast(tf("mediaSaved", { title }));
      } else {
        const state = useStore.getState();
        const path = mediaNotePath(draft.kind.trim() || "other", title, {
          lang: state.siteLanguage,
          existing: MEDIA_ROOTS.filter((root) => treeHasFolder(state.tree, root)),
        });
        if (treeHasPath(state.tree, path)) {
          setError(tf("mediaExists", { path }));
          setBusy(false);
          return;
        }
        await putNote(path, mediaNoteContent(fields));
        toast(tf("mediaAdded", { title }));
      }
      onSaved();
    } catch {
      setError(tf("mediaSaveFailed", { title }));
      setBusy(false);
    }
  };

  const upload = (file: File): void => {
    if (file.size > UPLOAD_MAX_MB * 1024 * 1024) {
      toast(tf("mediaCoverTooBig", { mb: localeNum(UPLOAD_MAX_MB) }), "error");
      return;
    }
    setUploading(true);
    // The tracker note's folder is the upload's context, as it is for a
    // banner: under the "same folder" and "subfolder" attachment modes the
    // cover lands beside the note it decorates. A work not yet saved has the
    // folder its note WILL take (`Media/<Kind>/`), computed the way `save`
    // computes the path so the two never disagree.
    const state = useStore.getState();
    const context = editing
      ? parentDir(editing.path)
      : parentDir(
          mediaNotePath(draft.kind.trim() || "other", draft.title.trim() || "untitled", {
            lang: state.siteLanguage,
            existing: MEDIA_ROOTS.filter((root) => treeHasFolder(state.tree, root)),
          }),
        );
    uploadAttachment(file, true, context)
      .then((res) => set("cover", res.path))
      .catch(() => toast(tf("mediaSaveFailed", { title: file.name }), "error"))
      .finally(() => setUploading(false));
  };

  const heading = editing ? tf("mediaEditTitle", { title: editing.title }) : t("mediaFormNew");

  return (
    <div className="s-palette-overlay" onMouseDown={onClose}>
      <form
        ref={panelRef}
        className="s-mediaform"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="s-mediaform__head">
          <h2 className="s-mediaform__title" dir="auto">{heading}</h2>
          <button type="button" className="s-mediaform__close" onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </div>

        <div className="s-mediaform__body">
          <label className="s-mediaform__row">
            <span className="s-mediaform__label">{t("mediaFormKind")}</span>
            <SegmentedControl value={segmentValue} onChange={(v) => set("kind", v)} segments={segments} label={t("mediaFormKind")} />
          </label>

          <label className="s-mediaform__row">
            <span className="s-mediaform__label">{t("mediaFormTitle")}</span>
            <TextInput id="s-mediaform-title" value={draft.title} onChange={(v) => set("title", v)} placeholder={t("mediaFormTitlePlaceholder")} label={t("mediaFormTitle")} maxLength={200} dir="auto" />
          </label>

          <div className="s-mediaform__row">
            <label className="s-mediaform__label" htmlFor="s-mediaform-cover">{t("mediaFormCover")}</label>
            <div className="s-mediaform__coverrow">
              <PathInput id="s-mediaform-cover" value={draft.cover} onChange={(v) => set("cover", v)} kind="image" placeholder={t("mediaFormCoverPlaceholder")} label={t("mediaFormCover")} />
              <button type="button" className="s-btn s-mediaform__upload" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? t("mediaFormUploading") : t("mediaFormUpload")}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) upload(file);
                }}
              />
            </div>
          </div>

          <div className="s-mediaform__row s-mediaform__row--progress">
            <span className="s-mediaform__label">{t("trackerProgress")}</span>
            <div className="s-mediaform__progress">
              <NumberInput value={draft.done} onChange={(v) => set("done", v)} unit={unitWord} min={0} label={t("mediaFormDone")} placeholder="0" />
              {!draft.openEnded && (
                <NumberInput value={draft.total} onChange={(v) => set("total", v)} unit={unitWord} min={0} label={t("mediaFormTotal")} />
              )}
              <Toggle value={draft.openEnded} onChange={(v) => set("openEnded", v)} label={t("mediaFormNoTotal")} onLabel={t("mediaFormNoTotal")} offLabel={t("mediaFormTotal")} />
            </div>
            <p className="s-mediaform__hint">{t("mediaFormNoTotalHint")}</p>
          </div>

          <div className="s-mediaform__pair">
            <label className="s-mediaform__row">
              <span className="s-mediaform__label">{t("mediaFormUnit")}</span>
              <TextInput value={draft.unit} onChange={(v) => set("unit", v)} placeholder={kindNoun} label={t("mediaFormUnit")} maxLength={40} dir="auto" />
            </label>
            <label className="s-mediaform__row">
              <span className="s-mediaform__label">{t("mediaFormStep")}</span>
              <NumberInput value={draft.step} onChange={(v) => set("step", v)} unit={unitWord} min={1} label={t("mediaFormStep")} placeholder={String(defaultTrackerStep(draft.unit.trim() === "" ? null : draft.unit.trim(), foldKind(draft.kind)))} />
            </label>
            {kindKey === "show" && (
              <label className="s-mediaform__row">
                <span className="s-mediaform__label">{t("mediaFormSeason")}</span>
                <TextInput value={draft.season} onChange={(v) => set("season", v)} label={t("mediaFormSeason")} maxLength={20} dir="ltr" />
              </label>
            )}
          </div>

          <div className="s-mediaform__row">
            <span className="s-mediaform__label">{t("mediaFormFolder")}</span>
            <div className="s-mediaform__folderrow">
              <span className={`s-mediaform__folder${draft.folder ? "" : " s-mediaform__folder--none"}`} dir="auto" title={draft.folder || undefined}>
                {draft.folder || t("mediaFormFolderNone")}
              </span>
              <button
                type="button"
                className="s-btn s-mediaform__pick"
                onClick={() => {
                  void pickFolder({ title: t("mediaFormFolder"), current: draft.folder || null }).then((folder) => {
                    if (folder !== null) set("folder", folder);
                  });
                }}
              >
                {t("mediaFormFolderChoose")}
              </button>
              {draft.folder && (
                <button type="button" className="s-btn s-mediaform__unlink" onClick={() => set("folder", "")} aria-label={t("mediaFormFolderClear")} title={t("mediaFormFolderClear")}>
                  ×
                </button>
              )}
            </div>
            <p className="s-mediaform__hint">{t("mediaFormFolderHint")}</p>
          </div>

          <label className="s-mediaform__row">
            <span className="s-mediaform__label">{t("mediaFormStatus")}</span>
            <SegmentedControl
              value={draft.status}
              onChange={(v) => set("status", v as TrackerStatus)}
              segments={STATUSES.map((s) => ({ value: s, label: t(STATUS_LABEL[s]) }))}
              label={t("mediaFormStatus")}
            />
          </label>

          <div className="s-mediaform__pair">
            <label className="s-mediaform__row">
              <span className="s-mediaform__label">{t("mediaFormRating")}</span>
              <NumberInput value={draft.rating} onChange={(v) => set("rating", v)} unit={t("mediaFormRatingUnit")} min={0} max={10} step={0.5} label={t("mediaFormRating")} />
            </label>
          </div>

          <div className="s-mediaform__pair">
            {/* Native date fields: the control set has no date, and the
                browser's picker is the one piece of user-agent chrome worth
                keeping — it speaks the reader's calendar. A hand-typed
                value that is not a date is kept as written (the card prints
                it verbatim), which is why these are not required to parse. */}
            <label className="s-mediaform__row">
              <span className="s-mediaform__label">{t("mediaFormStarted")}</span>
              <input className="s-ctl s-ctl-input" type="date" value={draft.started} onChange={(e) => set("started", e.target.value)} dir="ltr" />
            </label>
            <label className="s-mediaform__row">
              <span className="s-mediaform__label">{t("mediaFormFinished")}</span>
              <input className="s-ctl s-ctl-input" type="date" value={draft.finished} onChange={(e) => set("finished", e.target.value)} dir="ltr" />
            </label>
          </div>

          <label className="s-mediaform__row">
            <span className="s-mediaform__label">{t("mediaFormNotes")}</span>
            <textarea
              className="s-ctl s-mediaform__notes"
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder={t("mediaFormNotesPlaceholder")}
              rows={3}
              dir="auto"
              maxLength={4000}
            />
          </label>
        </div>

        <div className="s-mediaform__foot">
          {error && <span className="s-mediaform__error" role="alert" dir="auto">{error}</span>}
          <button type="button" className="s-btn" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="submit" className="s-btn s-btn--accent" disabled={busy}>
            {editing ? t("save") : t("mediaCreate")}
          </button>
        </div>
      </form>
    </div>
  );
}
