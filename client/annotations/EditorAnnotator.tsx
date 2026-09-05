// The editor's side of annotations. The editor is CodeMirror, not rendered
// prose; its marks are painted by client/editor/annotationMarks.ts, and this
// listens for what that painter and the selection menu announce on the
// window: a fresh "Annotate" on a selection (`vellum:annotate`), a click on a
// painted mark (`vellum:annotate-open`) and the pointer resting on one
// (`vellum:annotate-hover`). It opens the same popover the reading view uses
// and the same tooltip.
import { useEffect, useState } from "react";
import { newHighlightId } from "../../shared/bookAnchor.ts";
import type { NoteAnnotation } from "../../shared/types.ts";
import { useStore } from "../state.ts";
import {
  ANNOTATE_EVENT,
  ANNOTATE_HOVER_EVENT,
  ANNOTATE_OPEN_EVENT,
  type AnnotateHover,
  type AnnotateOpenRequest,
  type AnnotateRequest,
} from "./fromSource.ts";
import { peekAnnotations } from "./useAnnotations.ts";
import AnnotationPopover from "./AnnotationPopover.tsx";
import AnnotationTip, { type TipRect } from "./AnnotationTip.tsx";
import "../styles/annotations.css";

function placeAt(x: number, y: number): { left: number; top: number } {
  const w = Math.min(360, window.innerWidth - 24);
  const left = Math.min(Math.max(12, x - w / 2), window.innerWidth - w - 12);
  const top = y + 260 > window.innerHeight ? Math.max(12, y - 270) : y + 12;
  return { left, top };
}

export default function EditorAnnotator() {
  const admin = useStore((s) => s.admin);
  const [open, setOpen] = useState<{ path: string; draft: NoteAnnotation; fresh: boolean; at: { left: number; top: number } } | null>(null);
  const [hover, setHover] = useState<{ annotation: NoteAnnotation; rect: TipRect } | null>(null);
  useEffect(() => {
    const onAsk = (ev: Event): void => {
      const d = (ev as CustomEvent<AnnotateRequest>).detail;
      if (!d || !d.quote) return;
      const now = Date.now();
      setHover(null);
      setOpen({
        path: d.path,
        fresh: true,
        at: placeAt(d.x, d.y),
        draft: { id: newHighlightId(), quote: d.quote, prefix: d.prefix, suffix: d.suffix, ink: 1, note: "", public: false, createdAt: now, updatedAt: now },
      });
    };
    const onOpen = (ev: Event): void => {
      const d = (ev as CustomEvent<AnnotateOpenRequest>).detail;
      const hit = d && peekAnnotations(d.path)?.find((a) => a.id === d.id);
      if (!hit) return;
      setHover(null);
      setOpen({ path: d.path, fresh: false, at: placeAt(d.x, d.y), draft: { ...hit } });
    };
    const onHover = (ev: Event): void => {
      const d = (ev as CustomEvent<AnnotateHover>).detail;
      const hit = d?.id && d.rect ? peekAnnotations(d.path)?.find((a) => a.id === d.id) : undefined;
      setHover(hit && d.rect ? { annotation: hit, rect: d.rect } : null);
    };
    window.addEventListener(ANNOTATE_EVENT, onAsk);
    window.addEventListener(ANNOTATE_OPEN_EVENT, onOpen);
    window.addEventListener(ANNOTATE_HOVER_EVENT, onHover);
    return () => {
      window.removeEventListener(ANNOTATE_EVENT, onAsk);
      window.removeEventListener(ANNOTATE_OPEN_EVENT, onOpen);
      window.removeEventListener(ANNOTATE_HOVER_EVENT, onHover);
    };
  }, []);
  if (!admin) return null;
  return (
    <>
      {hover && !open && <AnnotationTip annotation={hover.annotation} rect={hover.rect} canEdit />}
      {open && (
        <AnnotationPopover key={open.draft.id} path={open.path} initial={open.draft} fresh={open.fresh} canEdit at={open.at} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
