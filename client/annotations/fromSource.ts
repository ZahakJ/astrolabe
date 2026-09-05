// A selection made in the EDITOR names source text; the anchor has to name
// the words a reader sees. This strips the inline markdown that vanishes in
// rendering — emphasis, code ticks, wikilink brackets, link targets, list
// and heading markers — so a quote taken over `**vortex** lines` reattaches
// to the rendered "vortex lines". Deliberately shallow: a passage that is
// mostly syntax was never a passage worth marking.
//
// It is a SCANNER rather than a chain of regex replacements because the
// editor also paints the marks (client/editor/annotationMarks.ts), and a mark
// found in the prose has to be put back on the source: every prose character
// remembers the source index it came from.

/** The prose of `text` and, per prose character, its index in `text`. */
export function proseMapOfSource(text: string): { text: string; map: number[] } {
  let out = "";
  const map: number[] = [];
  const emit = (s: string, at: number): void => {
    for (let k = 0; k < s.length; k++) {
      out += s[k];
      map.push(at + k);
    }
  };
  let lineStart = 0;
  while (lineStart <= text.length) {
    const nl = text.indexOf("\n", lineStart);
    const lineEnd = nl === -1 ? text.length : nl;
    const line = text.slice(lineStart, lineEnd);
    let j = 0;
    const lead = /^[ \t]*(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+(?:\[[ xX]\][ \t]+)?|\d+[.)][ \t]+)/.exec(line);
    if (lead) j = lead[0].length;
    // Closing markers to step over when the scan reaches them.
    const skip = new Map<number, number>();
    while (j < line.length) {
      const hop = skip.get(j);
      if (hop !== undefined) {
        j += hop;
        continue;
      }
      const rest = line.slice(j);
      let m: RegExpExecArray | null;
      if ((m = /^\[\[([^\]|]+)\|([^\]]+)\]\]/.exec(rest))) {
        emit(m[2], lineStart + j + 2 + m[1].length + 1);
        j += m[0].length;
        continue;
      }
      if ((m = /^\[\[([^\]]+)\]\]/.exec(rest))) {
        emit(m[1], lineStart + j + 2);
        j += m[0].length;
        continue;
      }
      if ((m = /^!?\[([^\]]*)\]\([^)]*\)/.exec(rest))) {
        emit(m[1], lineStart + j + (rest.startsWith("!") ? 2 : 1));
        j += m[0].length;
        continue;
      }
      if ((m = /^`([^`\n]+)`/.exec(rest))) {
        emit(m[1], lineStart + j + 1);
        j += m[0].length;
        continue;
      }
      if ((m = /^(\*\*|__|~~|==)(.+?)\1/.exec(rest)) || (m = /^(\*|_)([^*_\n]+?)\1/.exec(rest))) {
        // Step over the opening marker now and the closing one when reached;
        // the words between are scanned like any others (they may nest).
        const len = m[1].length;
        skip.set(j + len + m[2].length, len);
        j += len;
        continue;
      }
      emit(line[j], lineStart + j);
      j++;
    }
    if (nl === -1) break;
    emit("\n", nl);
    lineStart = nl + 1;
  }
  return { text: out, map };
}

export function proseOfSource(text: string): string {
  return proseMapOfSource(text).text;
}

/** What the editor dispatches on "Annotate" (window event `vellum:annotate`). */
export interface AnnotateRequest {
  path: string;
  quote: string;
  prefix: string;
  suffix: string;
  x: number;
  y: number;
}

export const ANNOTATE_EVENT = "vellum:annotate";

/** A click on a painted mark in the editor: open that annotation. */
export interface AnnotateOpenRequest {
  path: string;
  id: string;
  x: number;
  y: number;
}
export const ANNOTATE_OPEN_EVENT = "vellum:annotate-open";

/** The pointer resting on a painted mark in the editor (or leaving one:
 *  `id` null). */
export interface AnnotateHover {
  path: string;
  id: string | null;
  rect: { left: number; top: number; width: number; height: number } | null;
}
export const ANNOTATE_HOVER_EVENT = "vellum:annotate-hover";
