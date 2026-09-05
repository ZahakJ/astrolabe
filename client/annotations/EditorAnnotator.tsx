// The editor's annotation popover. The editor is CodeMirror, not rendered
// prose, so there is nothing to paint on; what the selection menu can do is
// ask for a note on the selected words, and this listens for that ask
// (window event `vellum:annotate`) and opens the same popover the reading
// view uses. The mark is painted the next time the note is read.
import { useEffect, useState } from "react";
import { newHighlightId } from "../../shared/bookAnchor.ts";
import type { NoteAnnotation } from "../../shared/types.ts";
import { useStore } from "../state.ts";
import { ANNOTATE_EVENT, type AnnotateRequest } from "./fromSource.ts";
import AnnotationPopover from "./AnnotationPopover.tsx";

export default function EditorAnnotator() {
  const admin = useStore((s) => s.admin);
  const [open, setOpen] = useState<{ path: string; draft: NoteAnnotation; at: { left: number; top: number } } | null>(null);
  useEffect(() => {
    const onAsk = (ev: Event): void => {
      const d = (ev as CustomEvent<AnnotateRequest>).detail;
      if (!d || !d.quote) return;
      const now = Date.now();
      const w = Math.min(360, window.innerWidth - 24);
      const left = Math.min(Math.max(12, d.x - w / 2), window.innerWidth - w - 12);
      const top = d.y + 260 > window.innerHeight ? Math.max(12, d.y - 270) : d.y + 12;
      setOpen({
        path: d.path,
        at: { left, top },
        draft: { id: newHighlightId(), quote: d.quote, prefix: d.prefix, suffix: d.suffix, ink: 1, note: "", public: false, createdAt: now, updatedAt: now },
      });
    };
    window.addEventListener(ANNOTATE_EVENT, onAsk);
    return () => window.removeEventListener(ANNOTATE_EVENT, onAsk);
  }, []);
  if (!admin || !open) return null;
  return <AnnotationPopover key={open.draft.id} path={open.path} initial={open.draft} fresh canEdit at={open.at} onClose={() => setOpen(null)} />;
}
