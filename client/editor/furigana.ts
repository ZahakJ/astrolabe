// Furigana in the editor: the three doors, and the one insert they share.
//
// A reader highlights a word with kanji in it, right-clicks, and the Insert
// page offers "Furigana…" (SelectionMenu.tsx); the palette offers the same
// popover as "Add furigana to selection" and a no-questions-asked
// "Furigana: automatic for selection". All three end in `writeFurigana`
// below, which replaces the selection with the `{base|reading}` span
// shared/furigana.ts spells — one transaction, one undo step, the same
// bargain harakat.ts makes for a diacritic.
//
// THE READINGS TABLE IS LOADED WHEN A DOOR OPENS, NOT BEFORE. It is ~100 kB
// of jōyō kanji (shared/data/kanjiReadings.json, from KANJIDIC2 — see the
// generator for the EDRDG attribution), reached only through the dynamic
// import here, so an English or Arabic vault that never writes a kanji never
// downloads it and the first-paint budget scripts/check-bundle.mjs holds is
// untouched. The popover itself (components/FuriganaPopover.tsx) is React and
// is loaded the same way, for the same reason: it is nine kB of chrome for a
// gesture most sessions never make.

import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { furiganaSpanAt, hasKanji } from "../../shared/furigana.ts";
import { autoFurigana, type ReadingsTable } from "../../shared/furiganaReadings.ts";
import { countPhrase, t, tf } from "../i18n.ts";
import { toast } from "../toast.ts";

let tablePromise: Promise<ReadingsTable> | null = null;

/** The readings, fetched once per session and shared by every door. */
export function loadReadings(): Promise<ReadingsTable> {
  tablePromise ??= import("../../shared/data/kanjiReadings.json").then(
    (m) => (m.default as { kanji: ReadingsTable }).kanji,
  );
  return tablePromise;
}

/** What the popover opens on: the range it will replace, the base it shows,
 *  and — when the selection touched a span that is already there — that
 *  span's readings, which the fields open on instead of the suggestions. */
export interface FuriganaTarget {
  from: number;
  to: number;
  base: string;
  readings: string[] | null;
}

/** The main selection as a furigana base, or null when it cannot be one:
 *  empty, across lines, no kanji in it, or carrying a character the syntax
 *  itself uses (a brace or a bar would make the span unreadable). The
 *  selection's own leading and trailing whitespace stays outside the span.
 *
 *  A selection INSIDE a span that is already there — the caret's line shows
 *  the source, so its base is as selectable as any word — is that span,
 *  whole, with its readings: the second visit corrects the reading rather
 *  than nesting a new span in the old one (shared/furigana.ts::
 *  furiganaSpanAt says what that would have written). */
export function furiganaBase(view: EditorView): FuriganaTarget | null {
  const sel = view.state.selection.main;
  if (sel.empty) return null;
  const line = view.state.doc.lineAt(sel.from);
  if (sel.to > line.to) return null;
  const span = furiganaSpanAt(line.text, sel.from - line.from, sel.to - line.from);
  if (span !== null) {
    return { from: line.from + span.start, to: line.from + span.end, base: span.base, readings: span.readings };
  }
  const raw = view.state.sliceDoc(sel.from, sel.to);
  const lead = raw.length - raw.trimStart().length;
  const base = raw.trim();
  if (base === "" || !hasKanji(base) || /[{}|\\]/.test(base)) return null;
  return { from: sel.from + lead, to: sel.from + lead + base.length, base, readings: null };
}

/** Whether the menu row and the palette rows should be offered at all. */
export function selectionHasKanji(view: EditorView): boolean {
  return furiganaBase(view) !== null;
}

/** Replace `[from, to)` with the span and leave the caret after it. */
export function writeFurigana(view: EditorView, from: number, to: number, span: string): void {
  view.dispatch({
    changes: { from, to, insert: span },
    selection: EditorSelection.cursor(from + span.length),
    userEvent: "input",
    scrollIntoView: true,
  });
}

/** THE AUTOMATIC MODE: every kanji run in the selection takes its first
 *  suggestion, no popover. Runs the table does not know (a name kanji, a
 *  rare one) are left as they are, and the toast says how many were written
 *  so silence never means "done". Line by line, because a span may not cross
 *  a line; one transaction, so one undo takes all of it back. */
export async function autoFuriganaSelection(view: EditorView): Promise<boolean> {
  const sel = view.state.selection.main;
  if (sel.empty || !hasKanji(view.state.sliceDoc(sel.from, sel.to))) {
    toast(t("furiganaNoKanji"));
    return false;
  }
  const table = await loadReadings();
  if (!view.dom.isConnected) return false;
  const changes: { from: number; to: number; insert: string }[] = [];
  let count = 0;
  const doc = view.state.doc;
  for (let n = doc.lineAt(sel.from).number; n <= doc.lineAt(sel.to).number; n++) {
    const line = doc.line(n);
    const from = Math.max(line.from, sel.from);
    const to = Math.min(line.to, sel.to);
    if (to <= from) continue;
    // The whole line goes in, the selected part is what gets wrapped: a run
    // the selection stops on still sees the kana after it.
    const out = autoFurigana(line.text, table, { from: from - line.from, to: to - line.from });
    if (out.count === 0) continue;
    changes.push({ from: line.from, to: line.to, insert: out.text });
    count += out.count;
  }
  if (count === 0) {
    toast(t("furiganaNoneKnown"));
    return false;
  }
  view.dispatch({ changes, userEvent: "input", scrollIntoView: true });
  toast(tf("furiganaWritten", { words: countPhrase(count, "words") }));
  view.focus();
  return true;
}

/** The popover, loaded with the table it needs. Opened a tick after the
 *  menu that summoned it has closed (SelectionMenu.tsx explains the timing);
 *  the palette dispatches it through Editor.tsx like the harakat commands. */
export async function openFuriganaPopover(view: EditorView): Promise<boolean> {
  const target = furiganaBase(view);
  if (target === null) {
    toast(t("furiganaNoKanji"));
    return false;
  }
  const [{ openFuriganaPopover: open }, table] = await Promise.all([
    import("../components/FuriganaPopover.tsx"),
    loadReadings(),
  ]);
  if (!view.dom.isConnected) return false;
  open(view, target, table);
  return true;
}
