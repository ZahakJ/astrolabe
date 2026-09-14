// AYAH AND HADITH CALLOUTS IN LIVE PREVIEW — the block widget.
//
// An ordinary callout is drawn in place: its lines are tinted and its title
// line wears a widget (callouts.ts), and the body stays editable text. A
// scripture callout cannot be, because its body is not in the document — the
// verse arrives from the lazy Quran chunk, the hadith from a corpus note —
// so it follows the tracker fence instead: caret outside → ONE block widget
// over the whole blockquote carrying the READING renderer's card; caret
// inside → the source, tinted like any callout, so the reference and the
// commentary can be edited.
//
// Nothing here draws anything. toDOM hands the callout's own lines to
// renderMarkdown (the table widget's precedent, tables.ts), whose callout
// branch is the one that draws the verse on the blog, in the reading view and
// here — one renderer, every surface.

import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { EditorState, Range } from "@codemirror/state";
import { renderMarkdown } from "../reading/render.ts";
import { getLang } from "../i18n.ts";
import { useStore } from "../state.ts";
import type { Callout } from "./callouts.ts";

class ScriptureWidget extends WidgetType {
  /** The caption speaks the chrome's language ("Al-Baqarah 2:255" against
   *  «البقرة ٢٥٥»), so the language is part of the widget's identity — or a
   *  live language flip would leave the old caption under a new chrome. */
  readonly lang = getLang();

  constructor(
    readonly src: string,
    readonly notePath: string,
  ) {
    super();
  }

  override eq(other: ScriptureWidget): boolean {
    // No positions in the identity (TableWidget's reason): a callout that
    // slid down a line is the same callout, and comparing offsets would
    // refetch every verse on every keystroke above it.
    return other.src === this.src && other.notePath === this.notePath && other.lang === this.lang;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-s-scripture";
    wrap.appendChild(
      renderMarkdown(this.src, {
        notePath: this.notePath,
        tree: useStore.getState().tree,
        // THE VERSE AND THE HADITH BOTH ARRIVE LATE, and CodeMirror measured
        // this widget when it was mounted — before either. Without this every
        // position below the card is off by the difference (the tracker's
        // cover has the same note).
        onResize: () => view.requestMeasure(),
      }),
    );
    // Clicking the card puts the caret at the callout's first line, which
    // reveals the source — the only way back to editing the reference. The
    // position is asked of the view at click time rather than remembered
    // from build time, because eq() above keeps this DOM across moves.
    wrap.addEventListener("mousedown", (ev) => {
      // A link inside the card (the hadith's source note, Tanzil's credit)
      // keeps its click; the delegated handler on the rendered root owns it.
      if ((ev.target as HTMLElement).closest("a")) return;
      const pos = view.posAtDOM(wrap);
      ev.preventDefault();
      view.dispatch({ selection: { anchor: Math.min(pos, view.state.doc.length) }, scrollIntoView: true });
      view.focus();
    });
    return wrap;
  }

  override ignoreEvent(event: Event): boolean {
    // The mousedown above owns the click; a link's click must still reach
    // the rendered root's own delegated handler, so it is not ignored.
    return event.type !== "click";
  }
}

/** The block decoration replacing a scripture callout whose lines the caret
 *  is not on. The callout's lines are handed over WITH their `> ` markers —
 *  the reading renderer's blockquote branch is what recognises them. */
export function scriptureBlockDeco(
  state: EditorState,
  callout: Callout,
  notePath: string,
): Range<Decoration> {
  const from = state.doc.lineAt(callout.from).from;
  const to = state.doc.lineAt(callout.to).to;
  const widget = new ScriptureWidget(state.doc.sliceString(from, to), notePath);
  return Decoration.replace({ widget, block: true }).range(from, to);
}
