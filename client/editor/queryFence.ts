// THE QUERY FENCE IN LIVE PREVIEW — the same block widget the tracker and
// the routine have: caret outside → the reading renderer's list; caret
// inside → the source. Nothing to write back: a query reads.

import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { EditorState, Range } from "@codemirror/state";
import { fenceSpanOf, type FenceSpan } from "./fenceSpan.ts";
import { parseQueryFence, queryFenceKind } from "../../shared/queryFence.ts";
import { renderQueryBlock } from "../reading/render.ts";
import { useStore } from "../state.ts";

export function queryFenceSpan(state: EditorState, firstLine: number, lastLine: number): FenceSpan | null {
  return queryFenceKind(state.doc.line(firstLine).text) === null ? null : fenceSpanOf(state, firstLine, lastLine);
}

class QueryWidget extends WidgetType {
  constructor(readonly src: string, readonly notePath: string) {
    super();
  }
  override eq(other: QueryWidget): boolean {
    return other.src === this.src && other.notePath === this.notePath;
  }
  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-s-tracker";
    const block = renderQueryBlock(parseQueryFence(this.src), { notePath: this.notePath, tree: useStore.getState().tree }, { onResize: () => view.requestMeasure() });
    wrap.appendChild(block);
    return wrap;
  }
  override ignoreEvent(event: Event): boolean {
    return event.type === "mousedown" || event.type === "click";
  }
}

export function queryBlockDeco(state: EditorState, span: FenceSpan, notePath: string): Range<Decoration> {
  const widget = new QueryWidget(state.doc.sliceString(span.bodyFrom, span.bodyTo), notePath);
  return Decoration.replace({ widget, block: true }).range(span.from, span.to);
}
