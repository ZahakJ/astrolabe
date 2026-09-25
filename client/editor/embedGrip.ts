// PICKING AN EMBED UP IN THE EDITOR.
//
// The live preview draws `![[pic.png|300]]` as a picture, `![[file.pdf]]` as a
// card, `![[Book.pdf#page=42]]` as a page and `![[sketch.excalidraw]]` as its
// exported drawing (widgets.ts). Each of them now:
//
//   · DRAGS. Within the note the line moves to the drop point (one change set,
//     one undo step — shared/embedActions.ts `moveEmbedEdit`); into another
//     pane's note the same reference is inserted; out of the app the drag
//     carries the file (client/embedPickup.ts). The drop indicator is the
//     editor's own drop cursor.
//   · ANSWERS A RIGHT-CLICK, and Shift+F10 / the Menu key when the caret is on
//     an embed's source, with the embed menu (client/embedMenu.ts).
//
// Native listeners on the editor's own DOM, in the CAPTURE phase, rather than
// `EditorView.domEventHandlers`: a file card's widget ignores every event (its
// link is the browser's), so CodeMirror never hands those events to a handler,
// and the drop has to be taken before CodeMirror's own drop (which would paste
// the dragged URL as text) and before the upload handler (which would read an
// OS file) see it.

import { ViewPlugin, type EditorView } from "@codemirror/view";
import { embedSpanNear, landEmbed } from "../../shared/embedActions.ts";
import {
  beginEmbedDrag,
  dragCarriesEmbed,
  embedInfoOf,
  embedPathOf,
  endEmbedDrag,
  liftedEmbed,
} from "../embedPickup.ts";
import { useStore } from "../state.ts";
import { pathForView } from "./buffers.ts";
import { notePathFacet } from "./livePreview.ts";

/** What an embed widget's outermost element carries. */
export const EMBED_WIDGET_SEL = ".cm-s-embed-image, .cm-s-embed-file, .cm-s-embed-pdfpage, .cm-s-embed-audio, .cm-s-embed-video";

function notePathOf(view: EditorView): string {
  return pathForView(view) ?? view.state.facet(notePathFacet);
}

/** The widget element an event is on, if it is an embed's and not one of its
 *  tools (the resize handle, the alignment buttons). */
function widgetOf(view: EditorView, target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element) || !view.contentDOM.contains(target)) return null;
  if (target.closest(".cm-s-embed-tools, .cm-s-embed-handle")) return null;
  const el = target.closest<HTMLElement>(EMBED_WIDGET_SEL);
  // A transclusion card draws its note's own embeds with the reading
  // renderer; those belong to that note.
  if (!el || el.closest(".cm-s-transclude")) return null;
  return el;
}

/** The exact source a widget element draws, found from where CodeMirror says
 *  the widget sits. */
export function embedAtWidget(view: EditorView, el: HTMLElement): { from: number; to: number; source: string } | null {
  let pos: number;
  try {
    pos = view.posAtDOM(el);
  } catch {
    return null;
  }
  const span = embedSpanNear(view.state.doc.toString(), pos);
  return span === null ? null : { from: span.from, to: span.to, source: span.source };
}

function openMenu(view: EditorView, el: Element | null, span: { from: number; to: number; source: string }, x: number, y: number, fromKeyboard: boolean): void {
  void import("../embedMenu.ts").then((m) =>
    m.openEmbedMenu(
      { note: notePathOf(view), source: span.source, el, surface: "editor", view, span: { from: span.from, to: span.to }, lines: null },
      { x, y, fromKeyboard },
    ),
  );
}

export function embedGrip() {
  return ViewPlugin.fromClass(
    class {
      private readonly off: () => void;
      constructor(readonly view: EditorView) {
        const dom = view.dom;
        // Draggable from the press on, by a pointer (a finger's long press is
        // the phone's sheet — client/phone/embedSheet.ts).
        const onDown = (ev: PointerEvent): void => {
          const el = widgetOf(view, ev.target);
          // A player's own face is its scrubber: picked up by the caption.
          if (el && ev.button === 0) el.draggable = ev.pointerType !== "touch" && !(ev.target instanceof HTMLMediaElement);
        };
        const onDragStart = (ev: DragEvent): void => {
          const el = widgetOf(view, ev.target);
          if (!el) return;
          const span = embedAtWidget(view, el);
          const note = notePathOf(view);
          const info = span ? embedInfoOf(span.source, note) : null;
          if (!span || !info) return;
          // Ours, not CodeMirror's: its own widget drag would move the text
          // to a character position and paste the URL on the way.
          ev.stopPropagation();
          const resolved = embedPathOf(info);
          beginEmbedDrag(
            ev,
            { note, source: span.source, span: { from: span.from, to: span.to }, lines: null, path: typeof resolved === "string" ? resolved : null },
            el,
          );
        };
        // A press that did not become a drag is a click, and a click on a
        // picture has always meant "put me here": the caret goes after the
        // embed, which makes its line the active one and shows its source
        // beside it. (CodeMirror used to do this on the press; the press is
        // the browser's now, so the drag can start.)
        const onClick = (ev: MouseEvent): void => {
          const el = widgetOf(view, ev.target);
          if (!el || el.matches(".cm-s-embed-file, .cm-s-embed-audio, .cm-s-embed-video")) return;
          if (ev.target instanceof Element && ev.target.closest(".s-rv-pdfpage__caption")) return;
          const span = embedAtWidget(view, el);
          if (!span) return;
          view.dispatch({ selection: { anchor: span.to } });
          view.focus();
        };
        const onDragEnd = (): void => endEmbedDrag();
        const onDragOver = (ev: DragEvent): void => {
          if (!dragCarriesEmbed(ev.dataTransfer) || !useStore.getState().admin || view.state.readOnly) return;
          // Allow the drop; the drop CURSOR is CodeMirror's own, which is
          // why this does not stop the event on its way to the content.
          ev.preventDefault();
          if (ev.dataTransfer) ev.dataTransfer.dropEffect = liftedEmbed(ev.dataTransfer)?.note === notePathOf(view) ? "move" : "copy";
        };
        const onDrop = (ev: DragEvent): void => {
          const payload = liftedEmbed(ev.dataTransfer);
          if (!payload) return;
          // Taken whatever happens next: the default would paste the URL.
          ev.preventDefault();
          ev.stopPropagation();
          endEmbedDrag();
          if (!useStore.getState().admin || view.state.readOnly) return;
          const pos = view.posAtCoords({ x: ev.clientX, y: ev.clientY }) ?? view.state.selection.main.head;
          const edit = landEmbed(view.state.doc.toString(), notePathOf(view), payload, { pos });
          if (edit === null) return;
          view.focus();
          // ONE transaction — the take-out and the put-in together — so a
          // single undo puts the embed back where it was.
          view.dispatch({
            changes: edit.changes,
            selection: { anchor: edit.at },
            scrollIntoView: true,
            userEvent: payload.note === notePathOf(view) ? "move.drop" : "input.drop",
          });
        };
        const onContext = (ev: MouseEvent): void => {
          const el = widgetOf(view, ev.target);
          if (el) {
            const span = embedAtWidget(view, el);
            if (!span || !embedInfoOf(span.source, notePathOf(view))) return;
            ev.preventDefault();
            ev.stopPropagation();
            const box = el.getBoundingClientRect();
            const kb = ev.button !== 2;
            openMenu(view, el, span, kb ? box.left + 16 : ev.clientX, kb ? box.top + 16 : ev.clientY, kb);
            return;
          }
          // Shift+F10 / the Menu key with the caret on an embed's source.
          if (ev.button === 2 || !view.hasFocus) return;
          const sel = view.state.selection.main;
          if (!sel.empty) return;
          const span = embedSpanNear(view.state.doc.toString(), sel.head);
          if (!span || sel.head < span.from || sel.head > span.to) return;
          if (!embedInfoOf(span.source, notePathOf(view))) return;
          ev.preventDefault();
          ev.stopPropagation();
          const coords = view.coordsAtPos(sel.head);
          openMenu(view, null, span, coords?.left ?? 0, coords?.bottom ?? 0, true);
        };
        dom.addEventListener("pointerdown", onDown, true);
        dom.addEventListener("click", onClick);
        dom.addEventListener("dragstart", onDragStart, true);
        dom.addEventListener("dragend", onDragEnd);
        dom.addEventListener("dragover", onDragOver, true);
        dom.addEventListener("drop", onDrop, true);
        dom.addEventListener("contextmenu", onContext, true);
        this.off = () => {
          dom.removeEventListener("pointerdown", onDown, true);
          dom.removeEventListener("click", onClick);
          dom.removeEventListener("dragstart", onDragStart, true);
          dom.removeEventListener("dragend", onDragEnd);
          dom.removeEventListener("dragover", onDragOver, true);
          dom.removeEventListener("drop", onDrop, true);
          dom.removeEventListener("contextmenu", onContext, true);
        };
      }
      destroy(): void {
        this.off();
      }
    },
  );
}
