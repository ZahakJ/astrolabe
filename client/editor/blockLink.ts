// "COPY LINK TO THIS BLOCK" — the editor half of block references.
//
// The caret's line names the block. If the block already carries a ` ^id`
// (on that line, or on the bare line under it), the link uses it; otherwise
// a fresh id is minted and appended to the block's LAST line — one dispatch,
// one undo step, the alignSelection precedent (SelectionMenu.tsx) — and
// `[[Note#^id]]` goes to the clipboard. A heading line gets a section link
// instead, which is what the reader meant by "link to this".

import type { EditorView } from "@codemirror/view";
import { blockRange, isBareBlockId, mintBlockId, parseBlockId, withBlockId } from "../../shared/blockId.ts";
import { t } from "../i18n.ts";
import { noteTitleOf } from "../../shared/noteFormat.ts";
import { slugAnchor } from "../../shared/tex.ts";
import { toast } from "../toast.ts";

export function copyBlockLink(view: EditorView, path: string): void {
  const doc = view.state.doc;
  const caret = doc.lineAt(view.state.selection.main.head);
  const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*$/.exec(caret.text);
  if (heading) {
    // A heading is addressed by its text, or by its slug when the text cannot
    // be spelled inside [[…#…]] (sectionActions.ts's rule).
    const text = heading[1].replace(/\s+#+\s*$/, "");
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
  // The id lives on the block's last line, or on a bare line right under it.
  const lastLine = doc.line(range.end); // 1-based: range.end is the exclusive 0-based end
  const own = parseBlockId(lastLine.text) ?? (isBareBlockId(lastLine.text) ? parseBlockId(lastLine.text) : null);
  let id = own?.id ?? null;
  if (id === null) {
    id = mintBlockId();
    const next = withBlockId(lastLine.text, id);
    view.dispatch({ changes: { from: lastLine.from, to: lastLine.to, insert: next }, userEvent: "input" });
  }
  const link = `[[${noteTitleOf(path)}#^${id}]]`;
  void navigator.clipboard
    .writeText(link)
    .then(() => toast(t("blockLinkCopied")))
    .catch(() => toast(t("blockLinkCopyFailed"), "error"));
}
