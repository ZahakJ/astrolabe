// THE PHONE'S HANDLE ON THE EDITOR — CodeMirror, reached only once a note is
// being written.
//
// The note screen never imports CodeMirror: the editor is its own chunk and
// the phone shell's first paint must not carry it (scripts/check-bundle.mjs
// forbids it in every first paint). This module is imported dynamically by
// the two things that need a view — the keyboard accessory bar and the
// heading long-press — and by then the editor chunk is loaded anyway, so the
// import is a resolved promise.

import { EditorView } from "@codemirror/view";
import { redo, undo } from "@codemirror/commands";
import { startCompletion } from "@codemirror/autocomplete";
import { foldable, foldEffect, foldedRanges, unfoldEffect } from "@codemirror/language";
import { format, insertPair, toggleLinePrefix } from "../editor/commands.ts";
import { notePathFacet } from "../editor/livePreview.ts";
import { EMBED_WIDGET_SEL, embedAtWidget } from "../editor/embedGrip.ts";
import type { EmbedMenuTarget } from "../embedMenu.ts";
import { enterFocus, selectSection, setFoldsBelow } from "../editor/sectioning.ts";
import { copySectionLink, copySectionMarkdown, extractSection, noteContent } from "../sectionActions.ts";
import { sectionAtHeading, sectionsOf } from "../sections.ts";
import { t } from "../i18n.ts";

export type AccessoryAction = "link" | "tag" | "task" | "bold" | "heading" | "undo" | "redo" | "hide";

/** The editor view inside `root` (the note screen's surface), if one is mounted. */
export function viewIn(root: Element | null): EditorView | null {
  const dom = root?.querySelector<HTMLElement>(".cm-editor");
  return dom ? EditorView.findFromDOM(dom) : null;
}

/** The embed a held finger is on in the editor, as the embed menu takes it
 *  (client/phone/embedSheet.ts). Null off an embed. */
export function embedTargetAt(root: Element | null, target: EventTarget | null, note: string): EmbedMenuTarget | null {
  const view = viewIn(root);
  if (!view || !(target instanceof Element)) return null;
  if (target.closest(".cm-s-embed-tools, .cm-s-embed-handle, .cm-s-transclude")) return null;
  const el = target.closest<HTMLElement>(EMBED_WIDGET_SEL);
  if (!el) return null;
  const span = embedAtWidget(view, el);
  if (!span) return null;
  return { note, source: span.source, el, surface: "editor", view, span: { from: span.from, to: span.to }, lines: null };
}

const HEADING = /^(\s{0,3})(#{1,6})\s/;

/** None → ## → ### → none: the three a phone writer actually uses, in the
 *  order they are wanted. A `#` title is typed, not cycled into. */
function cycleHeading(view: EditorView): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const m = HEADING.exec(line.text);
  const from = line.from + (m ? m[1].length : 0);
  const to = m ? line.from + m[0].length : from;
  const level = m ? m[2].length : 0;
  const next = level === 0 ? "## " : level === 2 ? "### " : "";
  view.dispatch({ changes: { from, to, insert: next }, userEvent: "input.format", scrollIntoView: true });
  return true;
}

/** One press of the accessory bar. */
export function runAccessory(view: EditorView, action: AccessoryAction): void {
  switch (action) {
    case "link":
      insertPair(view, "[[", "]]");
      startCompletion(view);
      break;
    case "tag": {
      const { from, to } = view.state.selection.main;
      view.dispatch({ changes: { from, to, insert: "#" }, selection: { anchor: from + 1 }, userEvent: "input.type", scrollIntoView: true });
      startCompletion(view);
      break;
    }
    case "task":
      toggleLinePrefix(view, "- [ ] ");
      break;
    case "bold":
      format("bold")(view);
      break;
    case "heading":
      cycleHeading(view);
      break;
    case "undo":
      undo(view);
      break;
    case "redo":
      redo(view);
      break;
    case "hide":
      view.contentDOM.blur();
      return;
  }
  view.focus();
}

export interface HeadingVerb {
  label: string;
  run: () => void;
}

/** The heading under (x, y), and what may be done to it — the fold chevron and
 *  the heading's ⋯ that left the gutters on a phone, as one list. Null when
 *  the point is not on a heading line. */
export function headingVerbsAt(root: Element | null, x: number, y: number): { title: string; verbs: HeadingVerb[] } | null {
  const view = viewIn(root);
  if (!view) return null;
  const pos = view.posAtCoords({ x, y });
  if (pos === null) return null;
  const line = view.state.doc.lineAt(pos);
  if (!HEADING.test(line.text)) return null;
  const content = view.state.doc.toString();
  const section = sectionAtHeading(sectionsOf(content), line.number - 1);
  if (!section) return null;
  const path = view.state.facet(notePathFacet);
  let folded: { from: number; to: number } | null = null;
  foldedRanges(view.state).between(line.to, line.to, (from, to) => {
    if (from === line.to) folded = { from, to };
  });
  const range = foldable(view.state, line.from, line.to);
  const verbs: HeadingVerb[] = [];
  if (folded) verbs.push({ label: t("unfoldSection"), run: () => view.dispatch({ effects: unfoldEffect.of(folded!) }) });
  else if (range) verbs.push({ label: t("foldSection"), run: () => view.dispatch({ effects: foldEffect.of(range) }) });
  verbs.push(
    { label: t("foldBelow"), run: () => setFoldsBelow(view, section, true) },
    { label: t("unfoldBelow"), run: () => setFoldsBelow(view, section, false) },
    { label: t("copySectionLink"), run: () => copySectionLink(path, section) },
    { label: t("copySectionMd"), run: () => copySectionMarkdown(content, section) },
    { label: t("selectSection"), run: () => selectSection(view, section) },
    { label: t("focusSection"), run: () => void enterFocus(view, section) },
    {
      label: t("extractSection"),
      run: () =>
        void (async () => {
          const fresh = await noteContent(path);
          await extractSection(path, fresh, sectionAtHeading(sectionsOf(fresh), section.headingLine) ?? section);
        })(),
    },
  );
  return { title: section.text, verbs };
}
