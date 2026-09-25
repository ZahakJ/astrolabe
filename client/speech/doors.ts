// THE DOORS INTO THE PLAYER — what a selection or a note becomes when it is
// read aloud (docs/read-aloud.md).
//
// A DOM selection (the reading view, a book's text layer, an EPUB chapter,
// the blog) is read as the reader sees it: furigana spoken ONCE, as its base
// (the <rt> readings are dropped — a text extraction of a <ruby> otherwise
// reads the word and then its reading), buttons and footnote marks dropped. An editor selection is source, and goes through shared/speech.ts's
// prose reduction instead (./editorSpeak.ts, loaded only where an editor is).
//
// No CodeMirror here: the blog imports this module, and a visitor's page must
// not carry an editor.

import { speak, type SpeakRequest } from "./player.ts";
import { speechTextOfNote } from "../../shared/speech.ts";
import { getNote } from "../api.ts";
import { toast } from "../toast.ts";
import { t } from "../i18n.ts";

/** Where a selection may be read from by the chip: rendered prose. The
 *  editor has its own row in the selection menu. */
export const SPEAKABLE = ".s-reading, .s-epub__body, .s-book__doc, .s-blog-article, [data-speakable]";

/** The words of a range as they are SPOKEN. */
export function textOfRange(range: Range): string {
  const frag = range.cloneContents();
  const box = document.createElement("div");
  box.appendChild(frag);
  for (const el of Array.from(box.querySelectorAll("rt, rp, button, script, style, sup.footnote-ref, .footnote-ref, [aria-hidden='true']"))) {
    el.remove();
  }
  // Block boundaries become sentence boundaries: a heading and the paragraph
  // under it are two thoughts even when the heading has no full stop.
  for (const el of Array.from(box.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, blockquote, div, tr, br"))) {
    el.append(document.createTextNode("\n\n"));
  }
  return (box.textContent ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** The paragraph a selection starts in — for the language test when the
 *  selection is one word. */
export function contextOfRange(range: Range): string | null {
  const start = range.startContainer;
  const el = start.nodeType === Node.ELEMENT_NODE ? (start as Element) : start.parentElement;
  const block = el?.closest("p, li, h1, h2, h3, h4, h5, h6, blockquote, td, dd");
  const text = block?.textContent?.trim() ?? "";
  return text === "" ? null : text.slice(0, 1000);
}

export function pathOfNode(node: Node | null): string | null {
  const el = node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement;
  return el?.closest<HTMLElement>("[data-note-path]")?.dataset.notePath ?? null;
}

/** The page's current selection, when it is rendered prose. */
export function domSelectionRequest(): SpeakRequest | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const anchor = range.commonAncestorContainer;
  const el = anchor.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor.parentElement;
  if (!el || el.closest(".cm-editor, input, textarea, [contenteditable='true']")) return null;
  if (!el.closest(SPEAKABLE)) return null;
  const text = textOfRange(range);
  if (!/[\p{L}\p{N}]/u.test(text)) return null;
  return { text, context: contextOfRange(range), path: pathOfNode(anchor), range: range.cloneRange() };
}

/** Ctrl/Cmd ⇧ . and the selection rows: read what is selected, wherever it
 *  is. Answers false when there was nothing to read. */
export async function speakSelection(): Promise<boolean> {
  const active = document.activeElement;
  const cm = active instanceof Element ? active.closest<HTMLElement>(".cm-editor") : null;
  if (cm) {
    const { speakEditorElement } = await import("./editorSpeak.ts");
    if (speakEditorElement(cm, "selection")) return true;
  }
  const req = domSelectionRequest();
  if (!req) {
    toast(t("speakNothingSelected"));
    return false;
  }
  speak(req);
  return true;
}

/** "Read this note": the reading view's rendered body when the note is on
 *  screen as reading (lit sentence by sentence as it goes), the editor from
 *  its caret when it is being written, else the note's source. */
export async function readNote(path: string, surface: "reading" | "edit" | null): Promise<void> {
  if (surface !== "edit") {
    for (const host of Array.from(document.querySelectorAll<HTMLElement>(".s-reading[data-note-path]"))) {
      if (host.dataset.notePath !== path) continue;
      const body = host.querySelector<HTMLElement>(".s-reading__body");
      if (!body || body.offsetParent === null) continue;
      const range = document.createRange();
      range.selectNodeContents(body);
      const text = textOfRange(range);
      if (text !== "") {
        speak({ text, path, range });
        return;
      }
    }
  }
  if (surface !== "reading") {
    const editors = Array.from(document.querySelectorAll<HTMLElement>(".cm-editor"));
    if (editors.length > 0) {
      const { speakEditorElement, focusedEditorFor } = await import("./editorSpeak.ts");
      const cm = focusedEditorFor(path, editors);
      if (cm && speakEditorElement(cm, "note")) return;
    }
  }
  try {
    const note = await getNote(path);
    speak({ text: speechTextOfNote(note.content), path });
  } catch {
    toast(t("speakNothingSelected"));
  }
}
