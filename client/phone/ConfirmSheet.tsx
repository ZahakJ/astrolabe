// EVERY QUESTION THE PRODUCT ASKS, AS A SHEET.
//
// `confirmModal` and `promptModal` (client/components/Confirm.tsx) are the
// product's two questions — "delete this?", "what is it called?" — asked from
// forty places. On the desktop a centred dialog answers them; here this host
// takes the same bridge (`registerConfirmHost`) and asks from the bottom edge,
// with the history entry every phone layer carries: Back is Cancel.
//
// Nothing that asks knows which host answered. That is the point: the delete
// flow, New note, New folder, rename and publish-with-confirmation are one
// implementation each, on both shells.

import { useCallback, useEffect, useRef, useState } from "react";
import { registerConfirmHost, runCheck, setConfirmOpen, type ConfirmRequest, type ConfirmResult } from "../components/Confirm.tsx";
import { t } from "../i18n.ts";
import { usePhone } from "./context.ts";
import Sheet from "./Sheet.tsx";

import { CONFIRM_SHEET } from "./sheetIds.ts";

export default function ConfirmSheetHost() {
  const phone = usePhone();
  const [current, setCurrent] = useState<ConfirmRequest | null>(null);
  const [raw, setRaw] = useState("");
  const queue = useRef<ConfirmRequest[]>([]);
  const currentRef = useRef<ConfirmRequest | null>(null);
  const fieldRef = useRef<HTMLInputElement | null>(null);
  const phoneRef = useRef(phone);
  phoneRef.current = phone;
  /** The current question's sheet has been on screen. Until it has, its
   *  absence from the nav is a push still queued behind a pop (an action
   *  sheet's row that asks a question), not a Cancel. */
  const seenUp = useRef(false);

  const show = useCallback((next: ConfirmRequest | null) => {
    currentRef.current = next;
    seenUp.current = false;
    setConfirmOpen(next !== null);
    setCurrent(next);
    setRaw(next?.kind === "prompt" ? next.opts.value ?? "" : "");
    if (next !== null) phoneRef.current.openSheet(CONFIRM_SHEET);
  }, []);

  useEffect(
    () =>
      registerConfirmHost((p) => {
        if (currentRef.current) queue.current.push(p);
        else show(p);
      }),
    [show],
  );

  /** Answer the question on screen, step its sheet out of history, and ask
   *  the next one (after the pop, through the nav's queue). */
  const settle = useCallback(
    (result: ConfirmResult, value: string | null = null) => {
      const cur = currentRef.current;
      if (!cur) return;
      currentRef.current = null;
      if (cur.kind === "prompt") cur.resolve(result === "confirm" ? value : null);
      else cur.resolve(result);
      phoneRef.current.closeSheet(CONFIRM_SHEET);
      const next = queue.current.shift() ?? null;
      setConfirmOpen(next !== null);
      setCurrent(null);
      if (next) show(next);
    },
    [show],
  );

  // Back (or anything else) took the sheet's entry away: that is a Cancel.
  const up = phone.state.sheets.includes(CONFIRM_SHEET);
  useEffect(() => {
    if (up && currentRef.current !== null) seenUp.current = true;
    if (!up && currentRef.current !== null && seenUp.current) {
      const cur = currentRef.current;
      currentRef.current = null;
      if (cur.kind === "prompt") cur.resolve(null);
      else cur.resolve("cancel");
      const next = queue.current.shift() ?? null;
      setConfirmOpen(next !== null);
      setCurrent(null);
      if (next) show(next);
    }
  }, [up, show]);

  if (!current || !up) return null;

  if (current.kind === "prompt") {
    const opts = current.opts;
    const checked = runCheck(opts, raw);
    const submit = (): void => {
      if (!checked.value || checked.error) return;
      settle("confirm", checked.value);
    };
    return (
      <Sheet
        label={opts.title}
        onDismiss={() => settle("cancel")}
        className="s-ph-ask"
        initialFocus={() => fieldRef.current}
        header={<h2 className="s-ph-sheet__title">{opts.title}</h2>}
      >
        {opts.body && <p className="s-ph-ask__body" dir="auto">{opts.body}</p>}
        <form
          className="s-ph-ask__form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            ref={fieldRef}
            className="s-ph-field"
            type="text"
            dir="auto"
            value={raw}
            placeholder={opts.placeholder}
            aria-label={opts.title}
            onChange={(e) => setRaw(e.target.value)}
            onFocus={(e) => {
              const v = e.currentTarget.value;
              const dot = v.lastIndexOf(".");
              e.currentTarget.setSelectionRange(0, dot > 0 ? dot : v.length);
            }}
            spellCheck={false}
            autoComplete="off"
            enterKeyHint="done"
          />
          <p className={`s-ph-ask__note${checked.error ? " s-ph-ask__note--bad" : ""}`} dir="auto" role={checked.error ? "alert" : undefined}>
            {checked.error ?? checked.note ?? " "}
          </p>
          <div className="s-ph-ask__buttons">
            <button type="button" className="s-ph-btn" onClick={() => settle("cancel")}>
              {opts.cancelLabel ?? t("cancel")}
            </button>
            <button type="submit" className="s-ph-btn s-ph-btn--accent" disabled={!checked.value || !!checked.error}>
              {opts.confirmLabel ?? t("create")}
            </button>
          </div>
        </form>
      </Sheet>
    );
  }

  const { opts } = current;
  return (
    <Sheet
      label={opts.title}
      onDismiss={() => settle("cancel")}
      className={`s-ph-ask${opts.grave ? " s-ph-ask--grave" : ""}`}
      header={<h2 className="s-ph-sheet__title">{opts.title}</h2>}
    >
      {opts.body && <p className="s-ph-ask__body" dir="auto">{opts.body}</p>}
      {opts.warn && <p className="s-ph-ask__warn" dir="auto" role="note">{opts.warn}</p>}
      <div className="s-ph-ask__buttons s-ph-ask__buttons--stack">
        <button type="button" className={`s-ph-btn ${opts.accent ? "s-ph-btn--accent" : opts.grave ? "s-ph-btn--grave" : "s-ph-btn--danger"}`} onClick={() => settle("confirm")}>
          {opts.confirmLabel ?? t("delete")}
        </button>
        {opts.extraLabel && (
          <button type="button" className="s-ph-btn s-ph-btn--quiet" onClick={() => settle("extra")}>
            {opts.extraLabel}
          </button>
        )}
        <button type="button" className="s-ph-btn" onClick={() => settle("cancel")}>
          {opts.cancelLabel ?? t("cancel")}
        </button>
      </div>
    </Sheet>
  );
}
