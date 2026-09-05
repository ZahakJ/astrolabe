// The note's annotations, PAINTED IN THE EDITOR.
//
// The reading view paints a mark with the CSS Custom Highlight API over
// rendered prose; the editor is CodeMirror over source, so the same passage
// is found the other way round: the document is reduced to prose with a map
// back to source offsets (client/annotations/fromSource.ts), the anchor is
// found in that prose exactly as the reading view finds it in the rendered
// words (`findQuote` over the folded text), and the hit is mapped back onto
// the source and decorated. The decoration is a real <span>, so — unlike the
// reading view — hovering and clicking a mark are ordinary DOM events; they
// are announced on the window for EditorAnnotator, which owns the tooltip
// and the popover.
//
// Recomputed 120ms after the document or the list changes, never on every
// keystroke; between recomputes the ranges ride on the change set, so a mark
// stays on its words while they are being typed around.

import { RangeSet, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet } from "@codemirror/view";
import {
  ANNOTATE_HOVER_EVENT,
  ANNOTATE_OPEN_EVENT,
  type AnnotateHover,
  type AnnotateOpenRequest,
} from "../annotations/fromSource.ts";
import { placeInSource } from "../annotations/placeInSource.ts";
import { peekAnnotations, subscribeAnnotations } from "../annotations/useAnnotations.ts";
import { notePathFacet } from "./livePreview.ts";
import "../styles/annotation-marks.css";

const setMarks = StateEffect.define<DecorationSet>();

const marksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    for (const e of tr.effects) if (e.is(setMarks)) return e.value;
    return tr.docChanged ? marks.map(tr.changes) : marks;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const painter = ViewPlugin.fromClass(
  class {
    private timer = 0;
    private readonly unsubscribe: () => void;
    private hovered: string | null = null;
    private readonly view: EditorView;
    constructor(view: EditorView) {
      this.view = view;
      const path = view.state.facet(notePathFacet);
      this.unsubscribe = subscribeAnnotations(path, () => this.schedule());
      this.schedule();
    }
    update(u: { docChanged: boolean }): void {
      if (u.docChanged) this.schedule();
    }
    schedule(): void {
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.compute(), 120);
    }
    compute(): void {
      const path = this.view.state.facet(notePathFacet);
      const list = peekAnnotations(path);
      if (!list) return;
      const placed = placeInSource(this.view.state.doc.toString(), list);
      const ranges = placed.map(({ from, to, annotation }) =>
        Decoration.mark({
          class: `s-ann-mark s-ann-mark--ink-${annotation.ink}${annotation.public ? " s-ann-mark--public" : ""}`,
          attributes: { "data-ann-id": annotation.id },
        }).range(from, to),
      );
      this.view.dispatch({ effects: setMarks.of(RangeSet.of(ranges, true)) });
    }
    /** The mark under the pointer, announced once per change. */
    hover(target: EventTarget | null): void {
      const el = target instanceof Element ? target.closest<HTMLElement>(".s-ann-mark") : null;
      const id = el?.dataset.annId ?? null;
      if (id === this.hovered) return;
      this.hovered = id;
      const r = el?.getBoundingClientRect();
      const detail: AnnotateHover = {
        path: this.view.state.facet(notePathFacet),
        id,
        rect: r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null,
      };
      window.dispatchEvent(new CustomEvent(ANNOTATE_HOVER_EVENT, { detail }));
    }
    destroy(): void {
      clearTimeout(this.timer);
      this.unsubscribe();
      if (this.hovered) this.hover(null);
    }
  },
  {
    eventHandlers: {
      mousemove(e) {
        this.hover(e.target);
      },
      mouseleave() {
        this.hover(null);
      },
      click(e, view) {
        const el = e.target instanceof Element ? e.target.closest<HTMLElement>(".s-ann-mark") : null;
        const id = el?.dataset.annId;
        if (!id) return;
        const sel = view.state.selection.main;
        if (!sel.empty) return; // a drag that ended on a mark is a selection
        const detail: AnnotateOpenRequest = { path: view.state.facet(notePathFacet), id, x: e.clientX, y: e.clientY };
        window.dispatchEvent(new CustomEvent(ANNOTATE_OPEN_EVENT, { detail }));
      },
    },
  },
);

export function annotationMarks(): Extension {
  return [marksField, painter];
}
