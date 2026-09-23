// QUICK CAPTURE — a line, from anywhere, into today's note (docs/capture.md).
//
// Ctrl/Cmd+Shift+D (and the palette) opens a small sheet over whatever is on
// screen: type, Enter, and the line is under `## Captured` in today's note
// with the time beside it — the note is never opened, the reader's place is
// never lost. A second control picks the inbox instead, when one is pinned
// in Settings → Vault. On a phone the sheet sits at the bottom of the
// screen, where a thumb is, with a field and buttons a thumb can hit.
//
// The flow itself is client/capture.ts; this file is the surface, and it is
// lazy (App.tsx) because it is opened rarely and the first paint should not
// carry it.
//
// VOICE (3.24.0, docs/capture.md "Voice"): the same sheet, with its field
// swapped for a recorder — opened that way by the palette's "Voice note" and
// the phone's ⋯ row, and switched to from the text field by the microphone in
// the title row. The recorder is a chunk of its own (components/
// VoiceRecorder.tsx): the text sheet is the common case and does not carry it.

import { lazy, Suspense, useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { noteTitleOf } from "../../shared/noteFormat.ts";
import { capture, captureInbox, type CaptureTarget } from "../capture.ts";
import { dailyNoteLabel, dailyNotePath, loadPeriodic } from "../daily.ts";
import { t, tf } from "../i18n.ts";
import { useDialog } from "../a11y.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { actionToast } from "../undoToast.ts";
import { SegmentedControl } from "./controls/Fields.tsx";
import "../styles/capture.css";

const VoiceRecorder = lazy(() => import("./VoiceRecorder.tsx"));

export default function CaptureSheet() {
  const setCaptureOpen = useStore((s) => s.setCaptureOpen);
  const openNote = useStore((s) => s.openNote);
  // Subscribed so a live language change re-renders the sheet's words.
  useStore((s) => s.language);
  const [voice, setVoice] = useState(() => useStore.getState().captureVoice);
  const [text, setText] = useState("");
  const [target, setTarget] = useState<CaptureTarget>("daily");
  const [inbox, setInbox] = useState<string | null>(null);
  const [today, setToday] = useState<string>(() => dailyNotePath());
  const [busy, setBusy] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const restoreRef = useRef<Element | null>(null);

  const close = useCallback(() => setCaptureOpen(false), [setCaptureOpen]);

  // The inbox and today's path come from the cached settings; both are
  // usually already known, and neither is worth a spinner.
  useEffect(() => {
    let live = true;
    void Promise.all([captureInbox(), loadPeriodic()]).then(([pinned]) => {
      if (!live) return;
      setInbox(pinned);
      setToday(dailyNotePath());
    });
    return () => {
      live = false;
    };
  }, []);

  // Focus the field on open and put focus back where it came from on close
  // — the sheet is opened from the editor more often than not, and the
  // next keystroke after Esc must land in the note again.
  useEffect(() => {
    restoreRef.current = document.activeElement;
    if (!useStore.getState().captureVoice) fieldRef.current?.focus();
    return () => {
      const back = restoreRef.current;
      if (back instanceof HTMLElement && back.isConnected) back.focus();
    };
  }, []);

  const sheetRef = useRef<HTMLDivElement>(null);
  // Tab stays inside the sheet: an aria-modal layer that lets focus walk out
  // behind it strands a keyboard reader in a note they cannot see. This was
  // written out by hand here — the SECOND bespoke ring in the codebase, where
  // CONTRACTS allows exactly one (Confirm.tsx, for its three-button Enter
  // semantics) — and the hand-rolled version read its ring from a selector
  // that had to be kept in step with the markup. `manualFocus`: the effect
  // above already puts the caret in the field, which is the whole point of a
  // capture sheet.
  useDialog(sheetRef, { manualFocus: true, restoreFocus: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    // Capture phase, ahead of the shell's own Escape handling (App.tsx).
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close]);

  const submit = useCallback(async () => {
    const line = text.trim();
    if (line === "" || busy) return;
    setBusy(true);
    try {
      const path = await capture(line, target);
      if (path === null) return; // the daily door has said why
      close();
      // The confirmation names the note and opens it on request — the sheet
      // exists so the reader does NOT have to go there, but sometimes they
      // want to.
      actionToast(tf("capturedTo", { name: dailyNoteLabel(path) ?? noteTitleOf(path) }), t("captureOpenNote"), () => openNote(path));
    } catch (err) {
      console.error("astrolabe: capture failed", err);
      toast(t("captureFailed"), "error");
    } finally {
      setBusy(false);
    }
  }, [text, target, busy, close, openNote]);

  const onFieldKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    // Enter captures; Shift+Enter is a new line for a thought that needs two.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  const todayName = dailyNoteLabel(today) ?? noteTitleOf(today);
  const options = [
    { value: "daily", label: tf("captureTargetDaily", { name: todayName }) },
    // "Inbox (Reading list)" names the note; a note that is itself called
    // Inbox would read "Inbox (Inbox)", so it gets the bare word.
    ...(inbox
      ? [{ value: "inbox", label: /^inbox$/i.test(noteTitleOf(inbox)) ? t("captureTargetInboxBare") : tf("captureTargetInbox", { name: noteTitleOf(inbox) }) }]
      : []),
  ];

  return (
    <div className="s-capture-overlay" onMouseDown={close}>
      <div
        ref={sheetRef}
        className="s-capture"
        role="dialog"
        aria-modal="true"
        aria-labelledby="s-capture-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="s-capture__head">
          <h2 id="s-capture-title" className="s-capture__title">{voice ? t("voiceTitle") : t("captureTitle")}</h2>
          {/* The other half of the sheet, one press away: a microphone from
              the text field, a pencil back from the recorder. A switch of
              MODE, so it says what it switches to. */}
          <button
            type="button"
            className="s-capture__mode"
            aria-label={voice ? t("captureTypeInstead") : t("captureVoiceInstead")}
            title={voice ? t("captureTypeInstead") : t("captureVoiceInstead")}
            onClick={() => {
              setVoice((v) => !v);
              if (voice) requestAnimationFrame(() => fieldRef.current?.focus());
            }}
          >
            {voice ? (
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" />
                <path d="M12 18v3" />
              </svg>
            )}
          </button>
        </div>
        {voice ? (
          <Suspense fallback={null}>
            <VoiceRecorder onClose={close} />
          </Suspense>
        ) : (
          <>
            <textarea
              ref={fieldRef}
              className="s-capture__field"
              rows={2}
              value={text}
              placeholder={t("capturePlaceholder")}
              aria-label={t("captureTitle")}
              dir="auto"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onFieldKey}
              disabled={busy}
            />
            <div className="s-capture__row">
              <div className="s-capture__where">
                <span className="s-capture__where-label">{t("captureWhere")}</span>
                {inbox ? (
                  // A segmented pair, not the dropdown Select: two choices is a
                  // pair of radios, and the Select's popover is portaled to the
                  // body at a z-index below this sheet's overlay, where it would
                  // open underneath the very control that asked for it.
                  <SegmentedControl
                    label={t("captureWhere")}
                    value={target}
                    onChange={(v) => setTarget(v === "inbox" ? "inbox" : "daily")}
                    segments={options}
                  />
                ) : (
                  <span className="s-capture__target" dir="auto">{options[0].label}</span>
                )}
              </div>
            </div>
            {!inbox && <p className="s-capture__hint">{t("captureNoInboxHint")}</p>}
            <div className="s-capture__actions">
              <button type="button" className="s-capture__cancel" onClick={close}>
                {t("cancel")}
              </button>
              <button type="button" className="s-capture__send" onClick={() => void submit()} disabled={busy || text.trim() === ""}>
                {t("captureSend")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
