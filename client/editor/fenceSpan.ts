// WHERE A FENCED BLOCK'S PARTS SIT — shared by every fence widget.
//
// The tracker, the routine, the query and the tasks widgets each need the
// same four offsets: the opener's start, the closer's end, and the body
// between them (the range a widget rewrites). Four copies of the same ten
// lines drifted once already; this is the one.

import type { EditorState } from "@codemirror/state";

export interface FenceSpan {
  from: number; // start of the opening ``` line
  to: number; // end of the closing line (or of the block, unterminated)
  bodyFrom: number;
  bodyTo: number;
}

/** The span of the fence opened on `firstLine` and closed on `lastLine` (the
 *  syntax tree's block bounds). An unterminated fence has no closing line
 *  to exclude — its body runs to the end of the block. */
export function fenceSpanOf(state: EditorState, firstLine: number, lastLine: number): FenceSpan {
  const doc = state.doc;
  const open = doc.line(firstLine);
  const close = doc.line(lastLine);
  const closed = lastLine > firstLine && /^\s*(```|~~~)\s*$/.test(close.text);
  const bodyFrom = lastLine > firstLine ? doc.line(firstLine + 1).from : open.to;
  const bodyLast = closed ? lastLine - 1 : lastLine;
  const bodyTo = bodyLast > firstLine ? doc.line(bodyLast).to : bodyFrom;
  return { from: open.from, to: close.to, bodyFrom, bodyTo };
}
