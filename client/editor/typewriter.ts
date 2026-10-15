// Typewriter scrolling: the line being written stays at the middle of the
// editor, so the eyes rest in one place and the text moves past them.
//
// The scroll rides on the transaction that moved the caret (a transaction
// extender adds the `scrollIntoView` effect to it), so there is no second
// dispatch and no frame where the caret sits at the bottom edge first. Only
// typing and the keyboard move the page: a click or a drag selects where the
// reader pointed, and jumping the text out from under the pointer would be
// the wrong answer to "I clicked here". `scrollPastEnd` lets the last line
// reach the middle too.

import { EditorState, type Extension, type Transaction } from "@codemirror/state";
import { EditorView, scrollPastEnd } from "@codemirror/view";

function follows(tr: Transaction): boolean {
  if (tr.isUserEvent("select.pointer")) return false;
  if (tr.docChanged) return tr.isUserEvent("input") || tr.isUserEvent("delete") || tr.isUserEvent("undo") || tr.isUserEvent("redo");
  return tr.selection !== undefined && tr.isUserEvent("select");
}

export function typewriterScrolling(): Extension {
  return [
    scrollPastEnd(),
    EditorState.transactionExtender.of((tr) =>
      follows(tr) ? { effects: EditorView.scrollIntoView(tr.newSelection.main.head, { y: "center" }) } : null,
    ),
  ];
}
