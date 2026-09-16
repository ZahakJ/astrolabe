// THE MERMAID FENCE IN LIVE PREVIEW — the query fence's shape: caret outside
// → the reading renderer's diagram; caret inside → the source. Nothing to
// write back: a diagram is drawn from its text and the text is the note.

import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { EditorState, Range } from "@codemirror/state";
import { fenceSpanOf, type FenceSpan } from "./fenceSpan.ts";
import { renderMermaidBlock } from "../reading/render.ts";

export function mermaidFenceKind(line: string): "mermaid" | null {
  const m = /^\s*(?:`{3,}|~{3,})\s*([^\s`~]*)\s*$/.exec(line);
  return m && m[1].toLowerCase() === "mermaid" ? "mermaid" : null;
}

export function mermaidFenceSpan(state: EditorState, firstLine: number, lastLine: number): FenceSpan | null {
  return mermaidFenceKind(state.doc.line(firstLine).text) === null ? null : fenceSpanOf(state, firstLine, lastLine);
}

class MermaidWidget extends WidgetType {
  constructor(readonly src: string) {
    super();
  }
  override eq(other: MermaidWidget): boolean {
    return other.src === this.src;
  }
  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-s-tracker";
    // The host is the source's own height until the picture lands, and the
    // editor is told when it does — the widget's height is not the source's.
    wrap.appendChild(renderMermaidBlock(this.src, { onResize: () => view.requestMeasure() }));
    return wrap;
  }
  override ignoreEvent(event: Event): boolean {
    return event.type === "mousedown" || event.type === "click";
  }
}

export function mermaidBlockDeco(state: EditorState, span: FenceSpan): Range<Decoration> {
  const widget = new MermaidWidget(state.doc.sliceString(span.bodyFrom, span.bodyTo));
  return Decoration.replace({ widget, block: true }).range(span.from, span.to);
}
