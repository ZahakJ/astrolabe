// "COPY LINK TO THIS BLOCK" — the editor half of block references.
//
// The caret's line names the block. If the block already carries a ` ^id`
// (on that line, or on the bare line under it), the link uses it; otherwise
// a fresh id is minted and appended to the block's LAST line — one dispatch,
// one undo step, the alignSelection precedent (SelectionMenu.tsx) — and
// `[[Note#^id]]` goes to the clipboard. A heading line gets a section link
// instead, which is what the reader meant by "link to this".

import type { EditorView } from "@codemirror/view";
import { blockRange, mintBlockId, parseBlockId, withBlockId } from "../../shared/blockId.ts";
import { t } from "../i18n.ts";
import { noteTitleOf } from "../../shared/noteFormat.ts";
import { slugAnchor } from "../../shared/tex.ts";
import { toast } from "../toast.ts";
import { headingOf, headingTitle } from "../../shared/headings.ts";

export function copyBlockLink(view: EditorView, path: string): void {
  const doc = view.state.doc;
  const caret = doc.lineAt(view.state.selection.main.head);
  const heading = headingOf(caret.text);
  const title = heading ? headingTitle(heading.raw) : "";
  if (title) {
    // A heading is addressed by its title (shared/headings.ts — what the
    // reading view shows and the anchor table files), or by its slug when the
    // title cannot be spelled inside [[…#…]] (sectionActions.ts's rule).
    const text = title;
    const anchor = /[[\]|#]/.test(text) ? slugAnchor(text) : text;
    void navigator.clipboard
      .writeText(`[[${noteTitleOf(path)}#${anchor}]]`)
      .then(() => toast(t("sectionLinkCopied")))
      .catch(() => toast(t("blockLinkCopyFailed"), "error"));
    return;
  }
  const lines: string[] = [];
  for (let n = 1; n <= doc.lines; n++) lines.push(doc.line(n).text);
  const range = blockRange(lines, caret.number);
  if (!range) {
    toast(t("blockLinkNoBlock"), "error");
    return;
  }
  // The id lives on a LIST ITEM's own line (its children are their own
  // blocks, with their own ids), else on the block's last line — which is a
  // bare `^id` line when the author wrote one under the paragraph.
  const startLine = doc.line(range.start + 1);
  const isItem = /^\s*(?:[-*+]|\d+[.)])\s+/.test(startLine.text);
  const target = isItem ? startLine : doc.line(range.end); // range.end is the exclusive 0-based end
  let id = parseBlockId(target.text)?.id ?? null;
  if (id === null) {
    id = mintBlockId();
    const next = withBlockId(target.text, id);
    view.dispatch({ changes: { from: target.from, to: target.to, insert: next }, userEvent: "input" });
  }
  const link = `[[${noteTitleOf(path)}#^${id}]]`;
  void navigator.clipboard
    .writeText(link)
    .then(() => toast(t("blockLinkCopied")))
    .catch(() => toast(t("blockLinkCopyFailed"), "error"));
}
