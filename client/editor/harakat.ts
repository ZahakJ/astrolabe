// The harakat palette, and the three tashkeel commands.
//
// WRITING A DIACRITIC IS THE ONE THING AN ARABIC KEYBOARD MAKES HARD. The
// letters are on the caps; the marks are behind Shift on keys nobody has
// memorised (fatha is Shift+Q on the Arabic 101 layout, kasra Shift+A, shadda
// Shift+~), the dagger alif is on no layout at all, and a Latin keyboard has
// none of them. Search has folded these marks since the fold table was
// written, so a note pointed carefully is FOUND easily — it just could not be
// written easily. This is the door: `Ctrl/Cmd Alt ;` (and the selection
// menu's Insert page) opens a small list at the caret naming every mark with
// its glyph in both languages; ↑↓ walk it, Enter inserts, Esc leaves.
//
// The arithmetic is shared/tashkeel.ts, pure and tested; this file is the
// editor's use of it. Plain DOM rather than React, like the find panel and
// the section chevrons: it is summoned from a CodeMirror keymap, outside
// every React tree, and it is nine buttons.
//
// The chord is `;` because that key is the SAME PHYSICAL KEY on the Arabic
// 101 layout as on a US one (it types «ك» there), and client/keys.ts +
// layoutKeys.ts resolve it by position when the layout's character is not
// Latin — so the binding works from the keyboard this feature exists for.

import "../styles/harakat.css";
import { EditorSelection, Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { HARAKAT, countTashkeel, pointText, stripTashkeel, type HarakaId } from "../../shared/tashkeel.ts";
import { anchorPopover } from "../components/anchorPopover.ts";
import { t, type I18nKey } from "../i18n.ts";
import { toast } from "../toast.ts";

/** The chord, spelled the way the shortcut sheet and the selection menu
 *  print it. One string, three surfaces. */
export const HARAKAT_KEYS = "Ctrl/Cmd Alt ;";

/** Each mark's name is a dictionary key written out — check-i18n counts a
 *  key as used only when it appears as a quoted token in client/, so a
 *  template like `t(`tk${id}`)` would mark all ten dead. */
const NAME: Record<HarakaId, I18nKey> = {
  fatha: "tkFatha",
  damma: "tkDamma",
  kasra: "tkKasra",
  fathatan: "tkFathatan",
  dammatan: "tkDammatan",
  kasratan: "tkKasratan",
  shadda: "tkShadda",
  sukun: "tkSukun",
  daggerAlif: "tkDaggerAlif",
  tatweel: "tkTatweel",
};

/** A combining mark drawn on the dotted circle U+25CC, which is how every
 *  character table shows one; the tatweel is a spacing character and is
 *  shown as itself, between two letters so the stroke joins something. */
function glyphOf(id: HarakaId, char: string): string {
  return id === "tatweel" ? `ب${char}ب` : `◌${char}`;
}

/** Insert one mark. With a selection every range is POINTED (the mark after
 *  each Arabic letter — shared/tashkeel.ts::pointText); with a bare caret the
 *  mark lands at the caret, i.e. on the character just typed, which is where
 *  a keyboard would put it. One transaction, one undo step. */
export function insertHaraka(view: EditorView, id: HarakaId): boolean {
  const mark = HARAKAT.find((h) => h.id === id)?.char;
  if (!mark) return false;
  const state = view.state;
  const spec = state.changeByRange((range) => {
    if (range.empty) {
      return {
        changes: { from: range.from, insert: mark },
        range: EditorSelection.cursor(range.from + mark.length),
      };
    }
    const text = state.sliceDoc(range.from, range.to);
    const next = pointText(text, id);
    if (next === text) return { range };
    return {
      changes: { from: range.from, to: range.to, insert: next },
      range: EditorSelection.range(range.from, range.from + next.length),
    };
  });
  view.dispatch(spec, { userEvent: "input", scrollIntoView: true });
  return true;
}

/** Strip the marks out of every selected range. Declines (false) on a bare
 *  caret and when nothing in the selection carries a mark, so the menu row
 *  never dispatches an empty change. */
export function stripTashkeelSelection(view: EditorView): boolean {
  const state = view.state;
  let changed = false;
  const spec = state.changeByRange((range) => {
    if (range.empty) return { range };
    const text = state.sliceDoc(range.from, range.to);
    const next = stripTashkeel(text);
    if (next === text) return { range };
    changed = true;
    return {
      changes: { from: range.from, to: range.to, insert: next },
      range: EditorSelection.range(range.from, range.from + next.length),
    };
  });
  if (!changed) return false;
  view.dispatch(spec, { userEvent: "delete", scrollIntoView: true });
  return true;
}

/** The selection, unpointed, on the clipboard — the note keeps its marks.
 *  For the quotation that goes into a search box, a URL or a message where
 *  the harakat would be noise. */
export function copyWithoutTashkeel(view: EditorView): void {
  const sel = view.state.selection.main;
  if (sel.empty) return;
  const text = stripTashkeel(view.state.sliceDoc(sel.from, sel.to));
  void navigator.clipboard
    .writeText(text)
    .then(() => toast(t("copiedWithoutTashkeel")))
    .catch(() => toast(t("blockLinkCopyFailed"), "error"));
}

/** Strip the WHOLE note, as one change: one undo step takes every mark back.
 *  Through the editor rather than the file so the buffer, the dirty flag and
 *  the history all see it as an edit the reader made. Says so when there was
 *  nothing to strip instead of dispatching a change that changes nothing. */
export function stripTashkeelNote(view: EditorView): boolean {
  const doc = view.state.doc.toString();
  if (countTashkeel(doc) === 0) {
    toast(t("tashkeelNoneToast"));
    return false;
  }
  // Keep the caret where it was, measured from the START — every mark
  // removed BEFORE the caret moves it back by one, and the map does that.
  const changes: { from: number; to: number }[] = [];
  const re = /[ً-ْٰـ]+/g;
  for (let m = re.exec(doc); m !== null; m = re.exec(doc)) changes.push({ from: m.index, to: m.index + m[0].length });
  view.dispatch({ changes, userEvent: "delete", scrollIntoView: true });
  toast(t("tashkeelStrippedToast"));
  return true;
}

// ── The palette ────────────────────────────────────────────────────────────

let openHost: HTMLDivElement | null = null;

export function closeHarakatPalette(): void {
  openHost?.remove();
  openHost = null;
}

export function isHarakatPaletteOpen(): boolean {
  return openHost !== null;
}

/** Open the list at the caret (or at the selection's head). Returns true so
 *  a keymap can use it directly. */
export function openHarakatPalette(view: EditorView): boolean {
  closeHarakatPalette();
  const head = view.state.selection.main.head;
  const at = view.coordsAtPos(head);
  const x = at ? at.left : window.innerWidth / 2;
  const y = at ? at.bottom + 4 : window.innerHeight / 2;

  const overlay = document.createElement("div");
  overlay.className = "s-harakat-overlay";
  const box = document.createElement("div");
  box.className = "s-harakat";
  box.setAttribute("role", "menu");
  box.setAttribute("aria-label", t("harakatPalette"));
  box.tabIndex = -1;

  const title = document.createElement("div");
  title.className = "s-harakat__title";
  title.textContent = t("harakatPalette");
  box.appendChild(title);

  const rows: HTMLButtonElement[] = [];
  let active = 0;
  const light = (i: number): void => {
    active = (i + rows.length) % rows.length;
    rows.forEach((b, k) => b.classList.toggle("s-harakat__row--active", k === active));
    rows[active].scrollIntoView({ block: "nearest" });
  };
  const finish = (): void => {
    closeHarakatPalette();
    view.focus();
  };
  const choose = (id: HarakaId): void => {
    finish();
    insertHaraka(view, id);
  };

  for (const { id, char } of HARAKAT) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "s-harakat__row";
    b.setAttribute("role", "menuitem");
    // The name is the mark's, not the glyph's: a screen reader would
    // otherwise announce "dotted circle, combining fatha" over a row whose
    // visible name already says "Fatha".
    b.setAttribute("aria-label", t(NAME[id]));
    b.dataset.haraka = id;
    const glyph = document.createElement("span");
    glyph.className = "s-harakat__glyph";
    glyph.setAttribute("aria-hidden", "true");
    glyph.textContent = glyphOf(id, char);
    const name = document.createElement("span");
    name.className = "s-harakat__name";
    name.textContent = t(NAME[id]);
    b.append(glyph, name);
    // The pointer lights a row only by moving over it — the palette's rule,
    // so the row Enter runs and the row under the finger are the same row.
    b.addEventListener("mousemove", () => light(rows.indexOf(b)));
    // mousedown, not click: a click would first blur the box, and a blur
    // closes it — the row would vanish under the finger before it fired.
    b.addEventListener("mousedown", (e) => {
      e.preventDefault();
      choose(id);
    });
    rows.push(b);
    box.appendChild(b);
  }

  box.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      finish();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      light(active + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      light(active - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      light(0);
    } else if (e.key === "End") {
      e.preventDefault();
      light(rows.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(HARAKAT[active].id);
    }
  });
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) finish();
  });
  overlay.addEventListener("contextmenu", (e) => e.preventDefault());

  overlay.appendChild(box);
  document.body.appendChild(overlay);
  openHost = overlay;
  // Placed from the real box, after it is in the document — the tree menu's
  // rule, and the reason the popover is not positioned before it exists.
  anchorPopover(box, x, y);
  light(0);
  box.focus();
  return true;
}

/** The keymap: `Mod-Alt-;` opens the palette. Prec.high like the format
 *  keymap so it beats the defaults, below the vim compartment. */
export const harakatKeymap: Extension = Prec.high(
  keymap.of([{ key: "Mod-Alt-;", run: openHarakatPalette, preventDefault: true }]),
);
