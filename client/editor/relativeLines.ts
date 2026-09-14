// RELATIVE LINE NUMBERS — vim's `number relativenumber`, for the note.
//
// A gutter that counts outwards from the caret's line: the line the caret
// is on shows its own number, every other line the distance to it, so `7j`
// and `3k` can be read off the margin the way a vim user reads them. The
// editor has no line numbers otherwise (it is a prose editor, and a column
// of numbers beside a paragraph is noise), so this gutter exists only while
// vim keys are on AND the device switch under them says so (Settings → This
// device). It is a compartment in setup.ts, like vim itself, so a live view
// takes it on and off without a rebuild.
//
// The built-in `lineNumbers()` will not do: its markers are recomputed on
// document and viewport changes, not on a selection change, and a relative
// column that lags the caret by a keystroke is worse than none.

import { EditorView, GutterMarker, gutter } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

class Num extends GutterMarker {
  constructor(
    readonly text: string,
    readonly current: boolean,
  ) {
    super();
  }
  eq(other: Num): boolean {
    return other.text === this.text && other.current === this.current;
  }
  toDOM(): Node {
    const span = document.createElement("span");
    span.className = this.current ? "s-relnum__n is-current" : "s-relnum__n";
    span.textContent = this.text;
    return span;
  }
}

export function relativeLineNumbers(): Extension {
  return [
    // A class on the editor for the stylesheet: the gutter is moved from the
    // scroller's far edge to the text's side (app.css, ".s-relnum-on").
    EditorView.editorAttributes.of({ class: "s-relnum-on" }),
    gutter({
      class: "s-relnum",
      lineMarker(view, block) {
        const doc = view.state.doc;
        const here = doc.lineAt(view.state.selection.main.head).number;
        const n = doc.lineAt(block.from).number;
        const rel = Math.abs(n - here);
        return new Num(rel === 0 ? String(n) : String(rel), rel === 0);
      },
      // The gutter must follow the caret, not only the document.
      lineMarkerChange: (update) => update.selectionSet || update.docChanged || update.viewportChanged,
      // Room for the widest number the note can need, so the text column
      // does not shift as the reader scrolls past line 99.
      initialSpacer: (view) => new Num(String(Math.max(99, view.state.doc.lines)).replace(/\d/g, "8"), false),
      updateSpacer: (spacer, update) => {
        const want = String(Math.max(99, update.state.doc.lines)).replace(/\d/g, "8");
        return spacer instanceof Num && spacer.text === want ? spacer : new Num(want, false);
      },
    }),
    EditorView.baseTheme({
      ".s-relnum": {
        minWidth: "3ch",
        paddingInlineEnd: "10px",
        textAlign: "end",
        fontFamily: "var(--font-mono)",
        fontSize: "0.786rem",
        color: "var(--text-faint)",
        userSelect: "none",
      },
      ".s-relnum__n": { display: "inline-block", minWidth: "2ch" },
      ".s-relnum__n.is-current": { color: "var(--accent)", fontWeight: "600" },
    }),
  ];
}
