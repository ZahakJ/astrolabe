// THE TASKS FENCE IN LIVE PREVIEW — the query fence's widget, with live
// boxes: a tick posts one line flip to the note the task lives in (which
// may be this note; the SSE echo redraws it).

import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { EditorState, Range } from "@codemirror/state";
import { parseTasksFence, tasksFenceKind } from "../../shared/tasks.ts";
import { isoDate } from "../../shared/routine.ts";
import { renderTasksBlock } from "../reading/render.ts";
import { useStore } from "../state.ts";

interface FenceSpan {
  from: number;
  to: number;
  bodyFrom: number;
  bodyTo: number;
}

export function tasksFenceSpan(state: EditorState, firstLine: number, lastLine: number): FenceSpan | null {
  const doc = state.doc;
  const open = doc.line(firstLine);
  if (tasksFenceKind(open.text) === null) return null;
  const close = doc.line(lastLine);
  const closed = lastLine > firstLine && /^\s*(```|~~~)\s*$/.test(close.text);
  const bodyFrom = lastLine > firstLine ? doc.line(firstLine + 1).from : open.to;
  const bodyLast = closed ? lastLine - 1 : lastLine;
  const bodyTo = bodyLast > firstLine ? doc.line(bodyLast).to : bodyFrom;
  return { from: open.from, to: close.to, bodyFrom, bodyTo };
}

class TasksWidget extends WidgetType {
  constructor(readonly src: string, readonly notePath: string, readonly admin: boolean) {
    super();
  }
  override eq(other: TasksWidget): boolean {
    return other.src === this.src && other.notePath === this.notePath && other.admin === this.admin;
  }
  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-s-tracker";
    wrap.appendChild(
      renderTasksBlock(parseTasksFence(this.src, isoDate(new Date())), { notePath: this.notePath, tree: useStore.getState().tree }, { live: this.admin, onResize: () => view.requestMeasure() }),
    );
    return wrap;
  }
  override ignoreEvent(event: Event): boolean {
    return event.type === "mousedown" || event.type === "click" || event.type === "change";
  }
}

export function tasksBlockDeco(state: EditorState, span: FenceSpan, notePath: string): Range<Decoration> {
  const widget = new TasksWidget(state.doc.sliceString(span.bodyFrom, span.bodyTo), notePath, useStore.getState().admin);
  return Decoration.replace({ widget, block: true }).range(span.from, span.to);
}
