// The furigana popover: the selected word, a reading for it, and the readings
// the table knows, as chips.
//
// Opened from the selection menu's Insert page and from the palette
// (client/editor/furigana.ts is the door; this file is the room). Two ways to
// write a reading, both the syntax shared/furigana.ts reads:
//
//   one reading for the word      {漢字|かんじ}     — the default, and how a
//                                                   compound is read
//   a reading per character       {漢字|かん|じ}    — one input per kanji, the
//                                                   kana between them fixed
//
// Every input is PREFILLED with the first suggestion (on'yomi first in a
// compound, kun'yomi first for a lone kanji, the okurigana-matching one
// first of all — shared/furiganaReadings.ts::suggestReadings), so the common case is
// Enter. The chips under each are the rest of that kanji's readings; in
// word mode a chip rebuilds the whole reading from the chosen pieces, in
// character mode it fills its own input. Nothing here looks the WORD up: it
// is a table of how each kanji can be read, and the note says so.
//
// Dressed like the selection menu and the harakat palette (same raised
// ground, same tokens), placed by anchorPopover at the selection's end, and
// its insides mirror on their own in the Arabic chrome — only the base and
// the reading fields are pinned LTR, because Japanese is.
//
// KEYBOARD-COMPLETE: Enter inserts from any field, Esc cancels, Tab walks
// the fields, chips and buttons and wraps at the ends so focus never leaves
// the box for the note underneath.

import "../styles/furigana.css";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { EditorView } from "@codemirror/view";
import { isKanji, serialiseFurigana } from "../../shared/furigana.ts";
import { kanjiRuns, suggestReadings, type ReadingsTable } from "../../shared/furiganaReadings.ts";
import { writeFurigana, type FuriganaTarget } from "../editor/furigana.ts";
import { anchorPopover } from "./anchorPopover.ts";
import { t, tf } from "../i18n.ts";
import { useStore } from "../state.ts";

interface Slot {
  /** The kanji itself. */
  kanji: string;
  /** Its readings, best first; empty when the table does not know it. */
  suggestions: string[];
}

/** One slot per kanji of the base, in order, with its suggestions. */
function slotsOf(base: string, table: ReadingsTable): Slot[] {
  const out: Slot[] = [];
  for (const run of kanjiRuns(base)) {
    const chars = [...run.text];
    chars.forEach((kanji, i) => {
      out.push({ kanji, suggestions: suggestReadings(run.text, i, table, run.after) });
    });
  }
  return out;
}

/** The whole-word reading built from one reading per kanji: the kana and
 *  anything else in the base stay as they are between the pieces. */
function composeWord(base: string, pieces: string[]): string {
  let k = 0;
  let out = "";
  for (const ch of base) out += isKanji(ch) ? (pieces[k++] ?? "") : ch;
  return out;
}

interface Props {
  view: EditorView;
  target: FuriganaTarget;
  table: ReadingsTable;
  x: number;
  y: number;
  onClose: () => void;
}

function FuriganaPopover({ view, target, table, x, y, onClose }: Props) {
  useStore((s) => s.language); // re-render the strings on a live language flip
  const boxRef = useRef<HTMLDivElement>(null);
  const firstInput = useRef<HTMLInputElement>(null);
  const slots = useMemo(() => slotsOf(target.base, table), [target.base, table]);
  // A span that is already there opens in the shape it was written in — one
  // reading over the word, or one per kanji — with its own readings in the
  // fields, so what the reader sees is what the note says and Enter changes
  // nothing. A new span opens in word mode on the suggestions.
  const existing = target.readings;
  const perChar = existing !== null && existing.length > 1 && existing.length === slots.length ? existing : null;
  const [mode, setMode] = useState<"word" | "char">(perChar ? "char" : "word");
  // The chosen piece per kanji — what the chips write and what word mode is
  // rebuilt from. The first suggestion to begin with, or nothing when the
  // table has none, which leaves the input honestly empty.
  const [pieces, setPieces] = useState<string[]>(() => perChar ?? slots.map((s) => s.suggestions[0] ?? ""));
  const [word, setWord] = useState<string>(() =>
    existing !== null && perChar === null
      ? existing.join("")
      : composeWord(target.base, slots.map((s) => s.suggestions[0] ?? "")),
  );

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    anchorPopover(el, x, y);
    // After placement, like every popover in this shell: an unplaced box
    // cannot take focus, and without focus Esc lands on the page.
    firstInput.current?.focus();
    firstInput.current?.select();
  }, [x, y]);

  // Mode flips put the caret back in the first field: the fields it had were
  // just replaced by different ones.
  useEffect(() => {
    firstInput.current?.focus();
    firstInput.current?.select();
  }, [mode]);

  const finish = (): void => {
    onClose();
    view.focus();
  };

  const readings = mode === "word" ? [word.trim()] : pieces.map((p) => p.trim());
  const complete = readings.every((r) => r !== "" && !/[{}|\n\\]/.test(r));

  const insert = (): void => {
    if (!complete) return;
    finish();
    writeFurigana(view, target.from, target.to, serialiseFurigana(target.base, readings));
  };

  const choose = (i: number, reading: string): void => {
    const next = pieces.slice();
    next[i] = reading;
    setPieces(next);
    if (mode === "word") setWord(composeWord(target.base, next));
    firstInput.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      finish();
      return;
    }
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
      e.preventDefault();
      insert();
      return;
    }
    // Tab stays inside the box: the note under it would take the focus and
    // the popover would sit there, open and unreachable.
    if (e.key === "Tab" && boxRef.current) {
      const items = [...boxRef.current.querySelectorAll<HTMLElement>("input, button:not(:disabled)")];
      if (items.length === 0) return;
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : at >= items.length - 1 ? 0 : at + 1;
      e.preventDefault();
      items[next].focus();
    }
  };

  // A kanji the table does not know gets an empty row, not a sentence: the
  // empty input beside it already says so, and the row keeps the kanji's
  // place in the list.
  const chips = (i: number, slot: Slot): React.ReactNode => (
    <div className="s-furi__chips" role="group" aria-label={tf("furiganaReadingLabel", { kanji: slot.kanji })}>
      {slot.suggestions.map((r) => (
        <button
          type="button" // a11y-ok: the chip's name is its own text — the reading, {r}, which the gate cannot see through the variable
          key={r}
          lang="ja"
          className={`s-furi__chip${pieces[i] === r ? " s-furi__chip--on" : ""}`}
          aria-pressed={pieces[i] === r}
          onClick={() => choose(i, r)}
        >
          {r}
        </button>
      ))}
    </div>
  );

  return (
    <div
      className="s-furi-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) finish();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={boxRef}
        className="s-furi"
        role="dialog"
        aria-modal="true"
        aria-label={t("furiganaTitle")}
        onKeyDown={onKeyDown}
      >
        <div className="s-furi__head">
          <span className="s-furi__title">{t("furiganaTitle")}</span>
          <span className="s-furi__base" lang="ja" dir="ltr">
            {target.base}
          </span>
        </div>
        <div className="s-furi__modes" role="radiogroup" aria-label={t("furiganaTitle")}>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "word"}
            className={`s-furi__mode${mode === "word" ? " s-furi__mode--on" : ""}`}
            onClick={() => setMode("word")}
          >
            {t("furiganaModeWord")}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "char"}
            className={`s-furi__mode${mode === "char" ? " s-furi__mode--on" : ""}`}
            onClick={() => setMode("char")}
          >
            {t("furiganaModeChar")}
          </button>
        </div>

        {mode === "word" ? (
          <div className="s-furi__row">
            <input
              ref={firstInput}
              className="s-furi__input"
              type="text"
              lang="ja"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              aria-label={t("furiganaTitle")}
              value={word}
              onChange={(e) => setWord(e.target.value)}
            />
            {slots.map((slot, i) => (
              <div className="s-furi__slot" key={`${slot.kanji}-${i}`}>
                <span className="s-furi__kanji" lang="ja" aria-hidden="true">
                  {slot.kanji}
                </span>
                {chips(i, slot)}
              </div>
            ))}
          </div>
        ) : (
          <div className="s-furi__row">
            {slots.map((slot, i) => (
              <div className="s-furi__slot" key={`${slot.kanji}-${i}`}>
                <span className="s-furi__kanji" lang="ja" aria-hidden="true">
                  {slot.kanji}
                </span>
                <div className="s-furi__slotbody">
                  <input
                    ref={i === 0 ? firstInput : undefined}
                    className="s-furi__input"
                    type="text"
                    lang="ja"
                    dir="ltr"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label={tf("furiganaReadingLabel", { kanji: slot.kanji })}
                    value={pieces[i]}
                    onChange={(e) => {
                      const next = pieces.slice();
                      next[i] = e.target.value;
                      setPieces(next);
                    }}
                  />
                  {chips(i, slot)}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="s-furi__note">{t("furiganaNote")}</p>
        <div className="s-furi__actions">
          <button type="button" className="s-btn" onClick={finish}>
            {t("cancel")}
          </button>
          <button type="button" className="s-btn s-btn--accent" disabled={!complete} onClick={insert}>
            {t("furiganaInsert")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Mounting ───────────────────────────────────────────────────────────────
// On <body>, like the selection menu: summoned from a CodeMirror handler or
// the palette, outside every React tree in the app.

let host: HTMLDivElement | null = null;
let root: Root | null = null;

export function closeFuriganaPopover(): void {
  if (!host || !root) return;
  const h = host;
  const r = root;
  host = null;
  root = null;
  setTimeout(() => {
    r.unmount();
    h.remove();
  }, 0);
}

export function openFuriganaPopover(view: EditorView, target: FuriganaTarget, table: ReadingsTable): void {
  closeFuriganaPopover();
  const at = view.coordsAtPos(target.to) ?? view.coordsAtPos(target.from);
  const x = at ? at.left : window.innerWidth / 2;
  const y = at ? at.bottom + 4 : window.innerHeight / 2;
  host = document.createElement("div");
  host.className = "s-furi-host";
  document.body.appendChild(host);
  root = createRoot(host);
  root.render(
    <FuriganaPopover view={view} target={target} table={table} x={x} y={y} onClose={closeFuriganaPopover} />,
  );
}
