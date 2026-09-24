// AN EMBED HELD ON THE PHONE: the embed menu as an action sheet, and "Move…"
// in place of the drag.
//
// A finger cannot drag a CodeMirror line reliably — the same press scrolls the
// note, selects a word or raises the keyboard depending on a few pixels — so
// on the phone a long press on a picture, a card or a page is the whole
// gesture: it opens the sheet the desktop's right-click opens (client/
// embedMenu.ts, the same rows from the same table), and its "Move…" row lists
// where the embed can go — the top of the note, under any heading, the end —
// and moves the line there with the same arithmetic a drop uses
// (shared/embedActions.ts). Lazy: imported on the first hold.

import type { OutlineRow } from "../books/chrome.tsx";
import { applyChanges, landEmbed, type DropSpot } from "../../shared/embedActions.ts";
import { splitFrontmatter } from "../../shared/noteParse.ts";
import { embedVerbs, type EmbedMenuTarget } from "../embedMenu.ts";
import { t, tf } from "../i18n.ts";
import { applyNoteContent, noteContent } from "../sectionActions.ts";
import { sectionsOf } from "../sections.ts";
import type { ActionRow } from "./ActionSheet.tsx";
import { ACTION_SHEET, LIST_SHEET } from "./sheetIds.ts";

interface SheetHost {
  openSheet(id: string, data?: unknown): void;
}

/** Move the embed to one of the note's landmarks. */
async function moveTo(target: EmbedMenuTarget, spot: DropSpot): Promise<void> {
  const payload = { note: target.note, source: target.source, span: target.span, lines: target.lines, path: null };
  const view = target.view;
  if (target.surface === "editor" && view) {
    const edit = landEmbed(view.state.doc.toString(), target.note, payload, spot);
    if (edit) view.dispatch({ changes: edit.changes, selection: { anchor: edit.at }, scrollIntoView: true, userEvent: "move" });
    return;
  }
  const content = await noteContent(target.note);
  const edit = landEmbed(content, target.note, payload, spot);
  if (edit) await applyNoteContent(target.note, applyChanges(content, edit.changes));
}

async function openMoveSheet(phone: SheetHost, target: EmbedMenuTarget): Promise<void> {
  const content = target.view ? target.view.state.doc.toString() : await noteContent(target.note);
  const lines = content.split("\n");
  const first = splitFrontmatter(content).bodyStartLine;
  const spots: DropSpot[] = [{ line: first, after: false }];
  const rows: OutlineRow[] = [{ label: t("embedMoveTop"), depth: 0 }];
  for (const s of sectionsOf(content)) {
    rows.push({ label: tf("embedMoveUnder", { heading: s.text }), depth: Math.max(0, s.level - 1) });
    spots.push({ line: s.headingLine, after: true });
  }
  rows.push({ label: t("embedMoveEnd"), depth: 0 });
  spots.push({ line: Math.max(0, lines.length - 1), after: true });
  phone.openSheet(LIST_SHEET, {
    title: t("embedMoveTitle"),
    rows,
    pick: (i: number) => {
      const spot = spots[i];
      if (spot) void moveTo(target, spot);
    },
  });
}

/** Open the embed's sheet. False when the element is not an embed the menu
 *  knows (a note transclusion), so the caller can let the press be. */
export async function openEmbedSheet(phone: SheetHost, target: EmbedMenuTarget): Promise<boolean> {
  const got = await embedVerbs(target, { touch: true, onMove: () => void openMoveSheet(phone, target) });
  if (!got) return false;
  const rows: ActionRow[] = got.verbs.filter((v) => v.action !== null).map((v) => ({ label: v.label, danger: v.danger, onSelect: v.run }));
  if (rows.length === 0) return false;
  window.getSelection()?.removeAllRanges();
  phone.openSheet(ACTION_SHEET, { title: got.title, rows });
  return true;
}
