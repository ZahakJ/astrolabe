// The card that appears when the pointer rests on a mark: the note, or the
// marked words when there is no note yet, and what a click will do. Shared
// by the reading view (which finds the mark under the pointer through the
// highlight ranges) and the editor (where the mark is a span). It takes no
// pointer itself, so it never gets in the way of the click it announces.

import type { NoteAnnotation } from "../../shared/types.ts";
import { t } from "../i18n.ts";

export interface TipRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export default function AnnotationTip({ annotation, rect, canEdit }: { annotation: NoteAnnotation; rect: TipRect; canEdit: boolean }) {
  const w = Math.min(320, window.innerWidth - 24);
  const left = Math.min(Math.max(12, rect.left + rect.width / 2 - w / 2), window.innerWidth - w - 12);
  // Above the words when there is room, else below them.
  const above = rect.top > 140;
  const style = above ? { left, bottom: window.innerHeight - rect.top + 8 } : { left, top: rect.top + rect.height + 8 };
  return (
    <div className={`s-ann-tip${above ? " s-ann-tip--above" : ""}`} style={style} role="tooltip">
      <span className="s-ann-tip__dot" data-ink={annotation.ink} aria-hidden="true" />
      {annotation.note ? (
        <p className="s-ann-tip__note" dir="auto">
          {annotation.note}
        </p>
      ) : (
        <p className="s-ann-tip__quote" dir="auto">
          {annotation.quote}
        </p>
      )}
      <span className="s-ann-tip__hint">{canEdit ? t("annotationTipEdit") : t("annotationTipRead")}</span>
    </div>
  );
}
