// ROUTINES IN LIVE PREVIEW — the block widget, and the one place a tick on
// the card becomes a document edit.
//
// Same shape as client/editor/tracker.ts, on purpose: caret outside the
// fence → ONE block widget carrying the reading renderer's card; caret
// inside → the source. Nothing here draws: toDOM calls render.ts's
// renderRoutineFence, so the card in the editor is the card on the blog.
//
// A TICK IS A DOCUMENT EDIT. The checkbox, a field, the note box: each
// hands the widget a patch for one day, and the widget asks the pure model
// for the ONE text change that records it (`logEditFor`) — a line replaced
// inside the note's ```routine-log, or a whole log fence written under the
// plan the first time — and dispatches exactly that. One dispatch, one undo
// step, the tracker stepper's rule: the note is the only store.
//
// The plan fence and the log fence are two blocks, and the widget over the
// PLAN draws the log's entries too (the week strip, the streak, the heat).
// So the widget reads the whole document to find its log, and it must be
// rebuilt when the log changes even though its own source did not — which
// is why `eq` compares the log's text as well as the plan's.

import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { EditorState, Range } from "@codemirror/state";
import {
  logEditFor,
  parseRoutine,
  parseRoutineLog,
  routineFenceKind,
  routineFenceSpans,
  type EntryPatch,
  type RoutineFenceKind,
} from "../../shared/routine.ts";
import { renderRoutineFence } from "../reading/render.ts";
import { useStore } from "../state.ts";

interface FenceSpan {
  kind: RoutineFenceKind;
  from: number;
  to: number;
  bodyFrom: number;
  bodyTo: number;
}

export function routineFenceSpan(state: EditorState, firstLine: number, lastLine: number): FenceSpan | null {
  const doc = state.doc;
  const open = doc.line(firstLine);
  const kind = routineFenceKind(open.text);
  if (kind === null) return null;
  const close = doc.line(lastLine);
  const closed = lastLine > firstLine && /^\s*(```|~~~)\s*$/.test(close.text);
  const bodyFrom = lastLine > firstLine ? doc.line(firstLine + 1).from : open.to;
  const bodyLast = closed ? lastLine - 1 : lastLine;
  const bodyTo = bodyLast > firstLine ? doc.line(bodyLast).to : bodyFrom;
  return { kind, from: open.from, to: close.to, bodyFrom, bodyTo };
}

/** Which plan (by index) a fence at `bodyFrom` belongs to, and the log text
 *  paired with it — asked of the whole document through the shared scanner,
 *  so the editor and the server never disagree about which log is whose. */
function placeOf(docText: string, kind: RoutineFenceKind, bodyFrom: number): { index: number; planSrc: string; logSrc: string } | null {
  const spans = routineFenceSpans(docText);
  const own = spans.find((s) => s.kind === kind && s.bodyStart === bodyFrom);
  if (!own) return null;
  const plan = spans.find((s) => s.kind === "routine" && s.index === own.index);
  const log = spans.find((s) => s.kind === "routine-log" && s.index === own.index);
  return { index: own.index, planSrc: plan?.body ?? "", logSrc: log?.body ?? "" };
}

class RoutineWidget extends WidgetType {
  constructor(
    readonly kind: RoutineFenceKind,
    readonly index: number,
    readonly planSrc: string,
    readonly logSrc: string,
    readonly notePath: string,
    readonly admin: boolean,
  ) {
    super();
  }

  override eq(other: RoutineWidget): boolean {
    return (
      other.kind === this.kind &&
      other.index === this.index &&
      other.planSrc === this.planSrc &&
      other.logSrc === this.logSrc &&
      other.notePath === this.notePath &&
      other.admin === this.admin
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-s-tracker";
    const plan = parseRoutine(this.planSrc);
    const entries = plan ? parseRoutineLog(this.logSrc, plan.fields) : [];
    const log =
      this.admin && this.kind === "routine"
        ? (patch: EntryPatch): void => {
            const docText = view.state.doc.toString();
            const edit = logEditFor(docText, this.index, patch);
            if (!edit) return;
            view.dispatch({
              changes: { from: edit.from, to: edit.to, insert: edit.insert },
              userEvent: "input.routine",
            });
          }
        : undefined;
    const card = renderRoutineFence(
      this.kind,
      plan,
      entries,
      { notePath: this.notePath, tree: useStore.getState().tree },
      { onLog: log, onResize: () => view.requestMeasure() },
    );
    if (card) wrap.appendChild(card);
    return wrap;
  }

  override ignoreEvent(event: Event): boolean {
    // The card's own controls (checkboxes, inputs, the plan's <details>)
    // must keep their events; everything else falls through to the editor.
    return (
      event.type === "mousedown" ||
      event.type === "click" ||
      event.type === "change" ||
      event.type === "input" ||
      event.type === "keydown" ||
      event.type === "toggle"
    );
  }
}

export function routineBlockDeco(state: EditorState, span: FenceSpan, notePath: string): Range<Decoration> | null {
  const place = placeOf(state.doc.toString(), span.kind, span.bodyFrom);
  if (!place) return null;
  if (span.kind === "routine" && parseRoutine(place.planSrc) === null) return null;
  const widget = new RoutineWidget(span.kind, place.index, place.planSrc, place.logSrc, notePath, useStore.getState().admin);
  return Decoration.replace({ widget, block: true }).range(span.from, span.to);
}
