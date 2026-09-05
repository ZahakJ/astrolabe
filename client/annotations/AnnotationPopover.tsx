// The annotation popover on its own: what was marked, what was said, the
// ink, the public switch, save and delete. Used over a painted mark by the
// layer and over an editor selection by EditorAnnotator, which is why it takes
// a draft and a place rather than a host.
import { useCallback, useState } from "react";
import { INK_COUNT } from "../../shared/bookAnchor.ts";
import { NOTE_MAX } from "../../shared/textQuote.ts";
import type { NoteAnnotation } from "../../shared/types.ts";
import { confirmModal } from "../components/Confirm.tsx";
import { t } from "../i18n.ts";
import { toast } from "../toast.ts";
import { removeAnnotation, saveAnnotation } from "./useAnnotations.ts";
import "../styles/annotations.css";

export default function AnnotationPopover({
  path,
  initial,
  fresh,
  canEdit,
  at,
  onClose,
}: {
  path: string;
  initial: NoteAnnotation;
  fresh: boolean;
  canEdit: boolean;
  at: { left: number; top: number };
  onClose(): void;
}) {
  const [draft, setDraft] = useState<NoteAnnotation>(initial);
  const save = useCallback(async () => {
    try {
      await saveAnnotation(path, { ...draft, note: draft.note.slice(0, NOTE_MAX) });
      onClose();
      toast(t("annotationSaved"));
    } catch {
      toast(t("annotationFailed"), "error");
    }
  }, [draft, path, onClose]);
  const del = useCallback(async () => {
    const yes = await confirmModal({ title: t("annotationDeleteTitle"), confirmLabel: t("annotationDelete") });
    if (!yes) return;
    try {
      await removeAnnotation(path, draft.id);
      onClose();
    } catch {
      toast(t("annotationFailed"), "error");
    }
  }, [draft.id, path, onClose]);
  return (
    <div className="s-ann-pop" role="dialog" aria-label={canEdit ? t("annotationTitle") : t("annotationPublicTitle")} style={at}>
      <div className="s-ann-pop__head">
        <span>{canEdit ? t("annotationTitle") : t("annotationPublicTitle")}</span>
        <button type="button" className="s-ann-pop__close" aria-label={t("annotationClose")} onClick={onClose}>
          ✕
        </button>
      </div>
      <p className="s-ann-pop__quote" dir="auto">
        {draft.quote}
      </p>
      {canEdit ? (
        <>
          <textarea
            className="s-ann-pop__field"
            autoFocus
            dir="auto"
            value={draft.note}
            placeholder={t("annotationPlaceholder")}
            maxLength={NOTE_MAX}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void save();
            }}
          />
          <div className="s-ann-pop__row">
            <div className="s-ann-inks" role="radiogroup" aria-label={t("annotationInk")}>
              {Array.from({ length: INK_COUNT }, (_, i) => i + 1).map((ink) => (
                <button
                  key={ink}
                  type="button"
                  role="radio"
                  aria-checked={draft.ink === ink}
                  aria-label={`${t("annotationInk")} ${ink}`}
                  className={`s-ann-ink${draft.ink === ink ? " s-ann-ink--on" : ""}`}
                  data-ink={ink}
                  onClick={() => setDraft({ ...draft, ink })}
                />
              ))}
            </div>
            <label className="s-ann-pop__public">
              <input type="checkbox" checked={draft.public} onChange={(e) => setDraft({ ...draft, public: e.target.checked })} />
              {draft.public ? t("annotationPublic") : t("annotationPrivate")}
            </label>
          </div>
          {draft.public && <p className="s-ann-pop__hint">{t("annotationPublicHint")}</p>}
          <div className="s-ann-pop__actions">
            {!fresh && (
              <button type="button" className="s-ann-pop__danger" onClick={() => void del()}>
                {t("annotationDelete")}
              </button>
            )}
            <button type="button" className="s-btn" onClick={onClose}>
              {t("annotationClose")}
            </button>
            <button type="button" className="s-btn s-btn--accent" onClick={() => void save()}>
              {t("annotationSave")}
            </button>
          </div>
        </>
      ) : (
        <p className="s-ann-pop__note" dir="auto">
          {draft.note}
        </p>
      )}
    </div>
  );
}
