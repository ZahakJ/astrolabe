// SETTINGS → ASK → STATUS (docs/ask.md). What the four doors will find when
// they are opened: whether Ollama answered, whether the two models are on
// this machine, how far the meaning index has got, and where an answer goes.
// A Re-index button asks for a pass now (it is otherwise the watcher's).
//
// It reads the server's CURRENT settings, not the unsaved form: a status for
// a model nobody has saved yet would be a promise the Save has not made.

import { useCallback, useEffect, useState } from "react";
import type { AskStatus } from "../../../shared/types.ts";
import { askReindex, askStatus } from "../../askApi.ts";
import { localeNum, t, tf } from "../../i18n.ts";
import { useStore } from "../../state.ts";

export function AskStatusBlock() {
  useStore((s) => s.language);
  const [status, setStatus] = useState<AskStatus | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = useCallback((signal?: AbortSignal) => {
    askStatus(signal)
      .then(setStatus)
      .catch(() => {
        if (!signal?.aborted) setStatus(null);
      });
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    load(ctl.signal);
    // While the index is filling, the numbers move; a slow poll shows it.
    const timer = window.setInterval(() => load(), 4_000);
    return () => {
      ctl.abort();
      window.clearInterval(timer);
    };
  }, [load]);

  const reindex = (): void => {
    setBusy(true);
    askReindex()
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setBusy(false));
  };

  if (status === undefined) return <p className="s-askstat__line">…</p>;
  if (status === null) return <p className="s-askstat__line">{t("askErrUnavailable")}</p>;
  const lines: { text: string; bad: boolean }[] = [
    { text: status.ollama ? t("askStatOllamaUp") : t("askErrOllamaDown"), bad: !status.ollama },
  ];
  if (status.ollama) {
    lines.push({
      text: status.embedModelReady ? tf("askStatModelReady", { model: status.embedModel }) : tf("askErrPullModel", { model: status.embedModel }),
      bad: !status.embedModelReady,
    });
  }
  lines.push({
    text: status.remote
      ? status.chatReady
        ? tf("askStatRemote", { model: status.chatModel })
        : t("askErrNoKey")
      : status.chatReady
        ? tf("askStatModelReady", { model: status.chatModel })
        : tf("askErrPullModel", { model: status.chatModel }),
    bad: !status.chatReady,
  });
  lines.push({
    text: tf("askStatIndex", {
      done: localeNum(status.indexedNotes),
      total: localeNum(status.notes),
      chunks: localeNum(status.chunks - status.pending),
    }),
    bad: false,
  });
  return (
    <div className="s-askstat">
      <ul className="s-askstat__list">
        {lines.map((l, i) => (
          <li key={i} className={`s-askstat__line${l.bad ? " s-askstat__line--bad" : ""}`} dir="auto">
            {l.text}
          </li>
        ))}
      </ul>
      <button type="button" className="s-btn" onClick={reindex} disabled={busy || !status.ollama}>
        {t("askReindex")}
      </button>
    </div>
  );
}
