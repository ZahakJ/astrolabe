// ASK THE VAULT — the answer panel (docs/ask.md).
//
// A question, an answer that streams in as the model writes it, and the
// passages it was allowed to read, numbered — every `[n]` in the answer is a
// button that opens the note at the heading it came from. The answer is
// grounded ONLY in those passages (server/ask.ts, shared/semantic.ts
// ASK_SYSTEM): a question the vault cannot answer is answered "the vault says
// nothing about…", not from the model's own memory.
//
// It says who answered and whether the question left the machine, before
// and after: the model's name, and "on this machine" or "sent to Anthropic".
// "Copy as note" writes the answer into the vault — through a naming dialog
// that prints the path it will create, never silently — with `source: ask`
// in its frontmatter and every citation a wikilink.
//
// The last question and answer survive the panel closing (a module variable,
// not the store): opening a source closes the panel so the note can be read,
// and coming back should find the answer still there.

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { AskEvent, AskSourceWire, AskStatus } from "../../shared/types.ts";
import { answerMarkdown, questionFileName, splitCitations } from "../../shared/semantic.ts";
import { ApiError, createNote, putNote } from "../api.ts";
import { askErrorLine, askQuestion, askStatus, statusLine } from "../askApi.ts";
import { useDialog } from "../a11y.ts";
import { localeNum, t, tf } from "../i18n.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { actionToast } from "../undoToast.ts";
import { localIsoDay } from "../../shared/dates.ts";
import "../styles/ask.css";

interface Session {
  question: string;
  answer: string;
  sources: AskSourceWire[];
  model: string;
  remote: boolean;
  state: "idle" | "asking" | "streaming" | "done" | "error";
  error: string | null;
  firstTokenMs: number | null;
  ms: number | null;
}

const EMPTY: Session = {
  question: "",
  answer: "",
  sources: [],
  model: "",
  remote: false,
  state: "idle",
  error: null,
  firstTokenMs: null,
  ms: null,
};

let lastSession: Session = EMPTY;

function seconds(ms: number): string {
  return localeNum(Math.round(ms / 100) / 10);
}

function today(): string {
  return localIsoDay();
}

export default function AskPanel() {
  const setAskOpen = useStore((s) => s.setAskOpen);
  const pending = useStore((s) => s.askQuestion);
  useStore((s) => s.language);
  const [session, setSession] = useState<Session>(lastSession);
  const [draft, setDraft] = useState<string>(pending ?? lastSession.question);
  const [status, setStatus] = useState<AskStatus | null | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  const update = useCallback((next: (s: Session) => Session) => {
    setSession((prev) => {
      const s = next(prev);
      lastSession = s;
      return s;
    });
  }, []);

  const close = useCallback(() => {
    setAskOpen(false);
  }, [setAskOpen]);

  useDialog(panelRef, { manualFocus: true, onEscape: close });

  useEffect(() => {
    fieldRef.current?.focus();
    const ctl = new AbortController();
    askStatus(ctl.signal)
      .then(setStatus)
      .catch(() => {
        if (!ctl.signal.aborted) setStatus(null);
      });
    return () => {
      ctl.abort();
      // A question in flight is abandoned with the panel: the server stops
      // generating when the stream is cancelled.
      abortRef.current?.abort();
    };
  }, []);

  const ask = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (question === "") return;
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      update(() => ({ ...EMPTY, question, state: "asking" }));
      const onEvent = (e: AskEvent): void => {
        if (ctl.signal.aborted) return;
        if (e.type === "sources") update((s) => ({ ...s, sources: e.sources, model: e.model, remote: e.remote, state: "streaming" }));
        else if (e.type === "delta") update((s) => ({ ...s, answer: s.answer + e.text }));
        else if (e.type === "done") update((s) => ({ ...s, state: "done", firstTokenMs: e.firstTokenMs, ms: e.ms }));
        else update((s) => ({ ...s, state: "error", error: askErrorLine(e.code) }));
      };
      try {
        await askQuestion(question, onEvent, ctl.signal);
      } catch (err) {
        if (ctl.signal.aborted) return;
        update((s) => ({ ...s, state: "error", error: askErrorLine(err instanceof ApiError ? err.code : undefined) }));
      }
    },
    [update],
  );

  // A question handed over by the palette is asked at once.
  useEffect(() => {
    if (pending) void ask(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFieldKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void ask(draft);
    }
  };

  const openSource = (s: AskSourceWire): void => {
    close();
    void import("../landing.ts").then((m) => m.landOnLine(s.path, s.line));
  };

  const copyAsNote = async (): Promise<void> => {
    const { promptExtractPath } = await import("../sectionActions.ts");
    const target = await promptExtractPath(t("askCopyTitle"), "Ask", questionFileName(session.question));
    if (!target) return;
    const text = answerMarkdown({
      question: session.question,
      answer: session.answer,
      sources: session.sources,
      model: session.model,
      local: !session.remote,
      date: today(),
    });
    try {
      await createNote(target);
      await putNote(target, text);
      await useStore.getState().loadTree();
      // The panel steps aside so the toast — and its Open — are not under
      // the scrim; the answer is still here when the panel is reopened.
      close();
      actionToast(tf("askCopied", { path: target }), t("captureOpenNote"), () => useStore.getState().openNote(target));
    } catch (err) {
      console.error("astrolabe: writing the answer failed", err);
      toast(err instanceof ApiError && err.status === 409 ? t("askCopyExists") : t("askCopyFailed"), "error");
    }
  };

  const busy = session.state === "asking" || session.state === "streaming";
  const unavailable = status === undefined ? null : statusLine(status);
  const remoteSetting = status?.remote ?? false;
  const { segments, invalid } = splitCitations(session.answer, session.sources.length);
  const paragraphs: (typeof segments)[] = [[]];
  for (const seg of segments) {
    if (seg.kind === "cite") {
      paragraphs[paragraphs.length - 1].push(seg);
      continue;
    }
    const parts = seg.text.split(/\n{2,}/);
    parts.forEach((part, i) => {
      if (i > 0) paragraphs.push([]);
      if (part !== "") paragraphs[paragraphs.length - 1].push({ kind: "text", text: part });
    });
  }
  const cited = new Set(segments.flatMap((s) => (s.kind === "cite" ? [s.n] : [])));

  return (
    <div className="s-ask-overlay" onMouseDown={close}>
      <div
        ref={panelRef}
        className="s-ask"
        role="dialog"
        aria-modal="true"
        aria-labelledby="s-ask-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="s-ask__head">
          <h2 id="s-ask-title" className="s-ask__title">{t("askTitle")}</h2>
          <button type="button" className="s-iconbtn s-ask__close" onClick={close} aria-label={t("close")} title={t("close")}>
            ✕
          </button>
        </header>
        <div className="s-ask__form">
          <textarea
            ref={fieldRef}
            className="s-ask__field"
            rows={2}
            dir="auto"
            value={draft}
            placeholder={t("askPlaceholder")}
            aria-label={t("askTitle")}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onFieldKey}
          />
          <button type="button" className="s-ask__send" onClick={() => void ask(draft)} disabled={busy || draft.trim() === "" || unavailable !== null}>
            {busy ? t("askAsking") : t("askSend")}
          </button>
        </div>
        {/* Where the question will go, BEFORE it goes. */}
        <p className="s-ask__where">
          {unavailable ?? (status ? tf(remoteSetting ? "askWhereRemote" : "askWhereLocal", { model: status.chatModel }) : "\u{a0}")}
          {status && status.pending > 0 && unavailable === null && (
            <> · {tf("askIndexing", { done: localeNum(status.indexedNotes), total: localeNum(status.notes) })}</>
          )}
        </p>

        {session.state !== "idle" && (
          <section className="s-ask__result" aria-live="polite" aria-busy={busy}>
            <p className="s-ask__q" dir="auto">{session.question}</p>
            {session.state === "asking" && <p className="s-ask__wait">{t("askReading")}</p>}
            {session.answer !== "" && (
              <div className="s-ask__answer" dir="auto">
                {paragraphs.map((para, i) => (
                  <p key={i}>
                    {para.map((seg, j) =>
                      seg.kind === "text" ? (
                        <span key={j}>{seg.text}</span>
                      ) : (
                        <button
                          key={j}
                          type="button"
                          className="s-ask__cite"
                          onClick={() => openSource(session.sources[seg.n - 1])}
                          title={session.sources[seg.n - 1].heading ? `${session.sources[seg.n - 1].title} › ${session.sources[seg.n - 1].heading}` : session.sources[seg.n - 1].title}
                          aria-label={tf("askCiteOpen", { n: localeNum(seg.n), title: session.sources[seg.n - 1].title })}
                        >
                          {localeNum(seg.n)}
                        </button>
                      ),
                    )}
                  </p>
                ))}
              </div>
            )}
            {/* Said once: when the line above already says Ollama is down,
                the failed question does not say it again. */}
            {session.state === "error" && session.error !== unavailable && <p className="s-ask__error">{session.error}</p>}
            {invalid.length > 0 && session.state === "done" && <p className="s-ask__note">{t("askInvalidCites")}</p>}
            {session.model !== "" && (
              <p className="s-ask__model">
                {tf(session.remote ? "askAnsweredRemote" : "askAnsweredLocal", { model: session.model })}
                {session.state === "done" && session.firstTokenMs !== null && session.ms !== null && (
                  <> · {tf("askTiming", { first: seconds(session.firstTokenMs), all: seconds(session.ms) })}</>
                )}
              </p>
            )}
            {session.sources.length > 0 && (
              <>
                <h3 className="s-ask__srchead">{t("askSources")}</h3>
                <ol className="s-ask__sources">
                  {session.sources.map((s) => (
                    <li key={s.n} className={`s-ask__source${cited.has(s.n) ? " s-ask__source--cited" : ""}`} value={s.n}>
                      <button type="button" className="s-ask__srcopen" onClick={() => openSource(s)} title={s.path}>
                        <span className="s-ask__srcnum" aria-hidden="true">{localeNum(s.n)}</span>
                        <span className="s-ask__srctitle">
                          <bdi>{s.title}</bdi>
                          {s.heading && (
                            <>
                              {" › "}
                              <bdi>{s.heading}</bdi>
                            </>
                          )}
                        </span>
                      </button>
                      <p className="s-ask__srctext" dir="auto">{s.text.length > 220 ? `${s.text.slice(0, 217).trimEnd()}…` : s.text}</p>
                    </li>
                  ))}
                </ol>
              </>
            )}
            <div className="s-ask__actions">
              <button type="button" className="s-ask__secondary" onClick={() => {
                update(() => EMPTY);
                setDraft("");
                fieldRef.current?.focus();
              }} disabled={busy}>
                {t("askAnother")}
              </button>
              <button type="button" className="s-ask__primary" onClick={() => void copyAsNote()} disabled={session.state !== "done" || session.answer.trim() === ""}>
                {t("askCopyAsNote")}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
