// Read aloud from the EDITOR (docs/read-aloud.md): a selection, or the note
// from the caret. Loaded only where an editor is — it imports CodeMirror, and
// ./doors.ts, which the blog carries, must not.
//
// An editor selection is SOURCE: `**bold**`, `[[Target|alias]]`, a footnote
// mark. It goes through shared/speech.ts's prose reduction (the one the word
// count uses) so the engine hears the words, never the markup — and furigana
// `{漢字|かんじ}` is spoken once, as its reading.

import { EditorView } from "@codemirror/view";
import { speechTextOfNote, speechTextOfSelection } from "../../shared/speech.ts";
import { notePathFacet } from "../editor/livePreview.ts";
import { speak } from "./player.ts";

/** Read from one editor: its selection, or the note from the start of the
 *  caret's line (the whole note when the caret is at the top or in the
 *  frontmatter). Answers false when there was nothing to read. */
export function speakEditor(view: EditorView, what: "selection" | "note"): boolean {
  const { doc } = view.state;
  const path = view.state.facet(notePathFacet) || null;
  const { from, to, head } = view.state.selection.main;
  if (what === "selection") {
    if (from === to) return false;
    const text = speechTextOfSelection(doc.sliceString(from, to));
    if (!/[\p{L}\p{N}]/u.test(text)) return false;
    const line = doc.lineAt(from);
    speak({ text, path, context: doc.sliceString(line.from, Math.min(line.to, line.from + 1000)) });
    return true;
  }
  const fm = /^---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(doc.toString());
  const bodyStart = fm ? fm[0].length : 0;
  const start = head <= bodyStart ? 0 : doc.lineAt(head).from;
  const text = speechTextOfNote(doc.sliceString(start));
  if (!/[\p{L}\p{N}]/u.test(text)) return false;
  speak({ text, path });
  return true;
}

export function speakEditorElement(el: HTMLElement, what: "selection" | "note"): boolean {
  const view = EditorView.findFromDOM(el);
  return view ? speakEditor(view, what) : false;
}

/** The editor showing `path` that the reader was last in: the focused one
 *  when it is that note's, else the first that is. */
export function focusedEditorFor(path: string, editors: HTMLElement[]): HTMLElement | null {
  const mine = editors.filter((el) => {
    const view = EditorView.findFromDOM(el);
    return view !== null && view.state.facet(notePathFacet) === path;
  });
  return mine.find((el) => el.contains(document.activeElement)) ?? mine[0] ?? null;
}
