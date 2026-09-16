// THE TEMPLATE'S QUESTIONS — one sheet, a field per distinct label, in the
// order the template names them (`{{prompt:Label}}` / `{{VALUE:Label}}`,
// client/templates.ts).
//
// One sheet rather than one dialog per label, because a template with four
// prompts asked four times in a row is a form the writer cannot see the end
// of — and cannot go BACK in. Here every question is on screen at once, Tab
// walks them, Enter on any field inserts, and Escape from anywhere cancels
// the whole insertion: the promise resolves null and the caller writes
// nothing. A blank answer is an answer (the placeholder is replaced by
// nothing), so an optional field can be left alone.
//
// Mounted on demand like LayoutPicker.tsx — a createRoot at the document body
// — and reached by dynamic import, so a template that asks nothing (nearly
// all of them) never loads this chunk.

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useDialog } from "../a11y.ts";
import { t } from "../i18n.ts";
import { TextInput } from "./controls/Fields.tsx";
// The Media form's frame (.s-mediaform*), the way the export dialog wears
// it: the sheet is a lazy chunk and must bring the sheet it dresses in.
import "../styles/media.css";

function Sheet({ labels, onDone }: { labels: string[]; onDone: (answers: Map<string, string> | null) => void }) {
  const [values, setValues] = useState<string[]>(() => labels.map(() => ""));
  const panelRef = useRef<HTMLFormElement | null>(null);
  const cancel = (): void => onDone(null);
  useDialog(panelRef, { onEscape: cancel });
  // The first field takes the caret: the sheet exists to be typed into.
  useEffect(() => {
    panelRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const answers = new Map<string, string>();
    labels.forEach((label, i) => answers.set(label, values[i]));
    onDone(answers);
  };

  return (
    <div className="s-palette-overlay" onMouseDown={cancel}>
      <form
        ref={panelRef}
        className="s-mediaform s-tplvalues"
        role="dialog"
        aria-modal="true"
        aria-label={t("templateValuesTitle")}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="s-mediaform__head">
          <h2 className="s-mediaform__title">{t("templateValuesTitle")}</h2>
          <button type="button" className="s-mediaform__close" onClick={cancel} aria-label={t("close")}>
            ×
          </button>
        </div>
        <div className="s-mediaform__body">
          {labels.map((label, i) => {
            const id = `s-tplvalues-${i}`;
            // A bare `{{VALUE}}` has no label of its own; the sheet lends it one.
            const caption = label === "" ? t("templateValuesUnnamed") : label;
            return (
              <div className="s-mediaform__row" key={id}>
                {/* The label is the template author's own text — it takes its
                    direction from itself, not from the chrome. */}
                <label className="s-mediaform__label s-tplvalues__label" htmlFor={id} dir="auto">
                  {caption}
                </label>
                <TextInput
                  id={id}
                  value={values[i]}
                  onChange={(v) => setValues((cur) => cur.map((x, j) => (j === i ? v : x)))}
                  label={caption}
                  dir="auto"
                />
              </div>
            );
          })}
          <p className="s-mediaform__hint">{t("templateValuesHint")}</p>
        </div>
        <div className="s-mediaform__foot">
          <button type="button" className="s-btn" onClick={cancel}>
            {t("cancel")}
          </button>
          <button type="submit" className="s-btn s-btn--accent">
            {t("templateValuesInsert")}
          </button>
        </div>
      </form>
    </div>
  );
}

let root: Root | null = null;
let mount: HTMLElement | null = null;

/** Ask for every label and resolve with the answers, or null on Escape /
 *  Cancel / the backdrop. One sheet at a time: a second call while one is
 *  open resolves null rather than stacking a question on a question. */
export function askTemplateValues(labels: string[]): Promise<Map<string, string> | null> {
  return new Promise((resolve) => {
    if (root) {
      resolve(null);
      return;
    }
    mount = document.createElement("div");
    document.body.appendChild(mount);
    root = createRoot(mount);
    const done = (answers: Map<string, string> | null): void => {
      root?.unmount();
      root = null;
      mount?.remove();
      mount = null;
      resolve(answers);
    };
    root.render(<Sheet labels={labels} onDone={done} />);
  });
}
