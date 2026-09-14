// One entry point for "render this note's content", whatever format it is in.
//
// Every reading surface — the reading view, the blog article, the blog home
// note, the hover preview, the editor's transclusion widget — calls this
// instead of picking a renderer itself. That is what makes "a `.tex` post
// publishes exactly like a `.md` post" true by construction rather than by
// six separate remembering-to-do-its.

import { findAnchor, noteAnchors } from "../../shared/anchors.ts";
import { markdownBlock } from "../../shared/blockId.ts";
import { isTexPath } from "../../shared/noteFormat.ts";
import { markdownSection, renderMarkdown, type RenderOptions } from "./render.ts";
import { renderTex, renderTexAnchor } from "./texRender.ts";

export type { RenderOptions } from "./render.ts";

/** Render a note's raw content to a detached element tree (class "s-rv"). */
export function renderNoteContent(content: string, opts: RenderOptions): HTMLElement {
  return isTexPath(opts.notePath) ? renderTex(content, opts) : renderMarkdown(content, opts);
}

/** Render just the block an `#anchor` names inside a note — one equation, one
 *  figure, one section — or the WHOLE note when the anchor misses, which is
 *  what `![[Note#missing]]` did before anchors existed.
 *
 *  This is the second half of the one-entry-point bargain above, and it exists
 *  because the first half was not enough: `![[Note#Section]]` sliced correctly
 *  in the reading view and the blog while the editor's transclusion widget
 *  pulled in the entire note and left the anchor out of the card's title, so
 *  the same wikilink meant two different things twelve pixels apart. A markdown
 *  heading and a LaTeX `\label` are one lookup here (shared/anchors.ts), so the
 *  caller never has to know which format it is pointing at. */
export function renderNoteSlice(
  content: string,
  opts: RenderOptions,
  anchor: string | null,
): HTMLElement {
  if (!anchor) return renderNoteContent(content, opts);
  const hit = findAnchor(noteAnchors(opts.notePath, content), anchor);
  if (!hit) return renderNoteContent(content, opts);
  if (isTexPath(opts.notePath)) {
    // `renderTexAnchor` answers null for an anchor whose blocks are empty —
    // rarer than a miss and handled the same way: the whole note.
    return renderTexAnchor(content, anchor, opts) ?? renderTex(content, opts);
  }
  // A block anchor slices ONE block (shared/blockId.ts markdownBlock); a
  // heading slices its section. Either miss falls back to the whole note.
  const slice = hit.kind === "block" ? markdownBlock(content, hit.line) : markdownSection(content, hit.line);
  return slice === null ? renderMarkdown(content, opts) : renderMarkdown(slice, opts);
}
