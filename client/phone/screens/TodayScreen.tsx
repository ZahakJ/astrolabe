// TODAY — the phone's home: what today asks of the reader, on one screen.
//
// The audit counted the taps to the day's four habits on the old phone shell:
// today's note was ⋯ → Calendar → today → Create (4); a card review ⋯ →
// Orbits → Study (3); a Sigil tick ⋯ → Sigils → a 470px scroll past the stat
// tiles → tick. Here each is one row: capture at the top (the CaptureSheet's
// flow, client/capture.ts), today's note, every Sigil task due today as a
// row you tick in place, every deck with cards due as a row that starts the
// session, the tasks whose date has come, what was written on this day in
// earlier years, and the last notes you were in. After six in the evening,
// one more row: "How did the day go?", answered into the day's note.
//
// Nothing here is a second implementation, and since 3.28 nothing here is
// even this screen's own: the reads, the ticks and the reflection are
// client/today/ — the desktop's `~today` page draws the same data layer with
// its own chrome (client/today/TodayView.tsx). This file is the phone's
// rows over it.

import { memo, useRef, useState, type FormEvent } from "react";
import { noteTitleOf } from "../../../shared/noteFormat.ts";
import { dailyNoteLabel, openDailyNote } from "../../daily.ts";
import { siteDate } from "../../dates.ts";
import { countPhrase, localeNum, t, tf } from "../../i18n.ts";
import { useStore } from "../../state.ts";
import { useCaptureLine, useToday, useVoiceReady } from "../../today/hooks.ts";
import { sigilRowKey, taskRowKey, type DueTaskRow, type ReflectionState, type SigilTaskRow } from "../../today/model.ts";
import { orbitsTabFor } from "../../workspace.ts";
import { usePhone } from "../context.ts";
import { IconCheck, IconChevron, IconFile, IconMic, IconSend } from "../icons.tsx";
import TopBar from "../TopBar.tsx";
import { useScrollMemory } from "../useScrollMemory.ts";

const RECENTS_SHOWN = 8;

function CaptureField() {
  const { text, setText, busy, send } = useCaptureLine();
  const voice = useVoiceReady();
  return (
    <form
      className="s-ph-capture"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <input
        className="s-ph-field s-ph-capture__field"
        type="text"
        dir="auto"
        value={text}
        placeholder={t("capturePlaceholder")}
        aria-label={t("captureTitle")}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
        enterKeyHint="send"
      />
      {text.trim() === "" && voice ? (
        // An empty field offers the other way in: a voice note, through the
        // capture sheet's own recorder (the palette's "Voice note").
        <button type="button" className="s-ph-icon s-ph-capture__send" aria-label={t("cmdVoiceNote")} onClick={() => useStore.getState().openVoiceNote()}>
          <IconMic />
        </button>
      ) : (
        <button type="submit" className="s-ph-icon s-ph-capture__send" aria-label={t("captureSend")} disabled={busy || text.trim() === ""}>
          <IconSend />
        </button>
      )}
    </form>
  );
}

const SigilRow = memo(function SigilRow({ row, onToggle, onOpen }: { row: SigilTaskRow; onToggle: (row: SigilTaskRow) => void; onOpen: (row: SigilTaskRow) => void }) {
  const { task, meta, done } = row;
  const label = task.course ? t("phSigilSteps") : task.book ? tf("phSigilRead", { book: task.text ?? "" }) : task.slot ? `${task.slot} · ${task.text ?? ""}` : task.text ?? task.key;
  // A course's day and a book's pages are answered on the card, where the
  // steps and the page count are; the row opens it rather than guessing.
  if (row.onCard) {
    return (
      <li>
        <button type="button" className="s-ph-row s-ph-task" onClick={() => onOpen(row)}>
          <span className="s-ph-task__sigil" dir="auto">{meta.plan.emoji ?? "·"}</span>
          <span className="s-ph-hit__text">
            <bdi className="s-ph-row__name" dir="auto">{label}</bdi>
            <bdi className="s-ph-hit__snippet" dir="auto">{meta.plan.title}</bdi>
          </span>
          <span className="s-ph-row__chev" aria-hidden="true">
            <IconChevron />
          </span>
        </button>
      </li>
    );
  }
  return (
    <li>
      <button type="button" role="checkbox" aria-checked={done} className={`s-ph-row s-ph-task${done ? " s-ph-task--done" : ""}`} onClick={() => onToggle(row)}>
        <span className="s-ph-task__box" aria-hidden="true">
          {done && <IconCheck />}
        </span>
        <span className="s-ph-hit__text">
          <bdi className="s-ph-row__name" dir="auto">{label}</bdi>
          <bdi className="s-ph-hit__snippet" dir="auto">{meta.plan.title}</bdi>
        </span>
      </button>
    </li>
  );
});

const TaskRow = memo(function TaskRow({ row, onToggle, locale }: { row: DueTaskRow; onToggle: (row: DueTaskRow) => void; locale: string }) {
  const done = row.task.done;
  const due = row.task.due ?? "";
  const when = row.overdue ? tf("todayOverdue", { date: siteDate(`${due}T12:00:00`, locale, { day: "numeric", month: "short" }) || due }) : null;
  return (
    <li>
      <button type="button" role="checkbox" aria-checked={done} className={`s-ph-row s-ph-task${done ? " s-ph-task--done" : ""}`} onClick={() => onToggle(row)} data-task={`${row.path}#${row.task.line}`}>
        <span className="s-ph-task__box" aria-hidden="true">
          {done && <IconCheck />}
        </span>
        <span className="s-ph-hit__text">
          <bdi className="s-ph-row__name" dir="auto">{row.task.text}</bdi>
          <span className="s-ph-hit__snippet">
            {when !== null && <span className="s-ph-today__overdue">{when} · </span>}
            <bdi dir="auto">{row.title}</bdi>
          </span>
        </span>
      </button>
    </li>
  );
});

function Reflection({ state, onReflect }: { state: ReflectionState; onReflect: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  if (state.kind === "hidden") return null;
  if (state.kind === "done") {
    return (
      <section aria-label={t("todayReflected")} data-today="reflection">
        <h2 className="s-ph-head">{t("todayReflected")}</h2>
        <p className="s-ph-today__reflection" dir="auto">{state.text}</p>
      </section>
    );
  }
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (busy || text.trim() === "") return;
    setBusy(true);
    const ok = await onReflect(text);
    setBusy(false);
    if (ok) setText("");
  };
  return (
    <section aria-label={t("todayReflectAsk")} data-today="reflection">
      <h2 className="s-ph-head">{t("todayReflectAsk")}</h2>
      <form className="s-ph-capture" onSubmit={(e) => void submit(e)}>
        <input
          className="s-ph-field s-ph-capture__field"
          type="text"
          dir="auto"
          value={text}
          placeholder={t("todayReflectPlaceholder")}
          aria-label={t("todayReflectAsk")}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          enterKeyHint="done"
        />
        <button type="submit" className="s-ph-icon s-ph-capture__send" aria-label={t("todayReflectSave")} disabled={busy || text.trim() === ""}>
          <IconSend />
        </button>
      </form>
    </section>
  );
}

export default function TodayScreen() {
  const phone = usePhone();
  const locale = useStore((s) => s.blogLocale);
  useStore((s) => s.language);
  const day = useToday(RECENTS_SHOWN);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useScrollMemory(scrollRef);
  const { admin } = day;
  const dateLine = siteDate(`${day.today}T12:00:00`, locale, { weekday: "long", day: "numeric", month: "long" });
  const doneCount = day.sigils.filter((r) => r.done).length;
  const thisYear = Number(day.today.slice(0, 4));
  // A course's day or a book's pages are answered on the sigil's own screen.
  const openSigil = (row: SigilTaskRow): void => phone.open({ kind: "sigil", path: row.meta.path, index: row.meta.index });

  return (
    <div className="s-ph-screen s-ph-today" data-screen="today">
      <TopBar title={t("phTabToday")} />
      <div className="s-ph-scroll" ref={scrollRef}>
        <p className="s-ph-today__date">{dateLine}</p>
        {/* A pocket vault keeps a captured line too: its server answers
            `/api/capture` since 3.27.0 (mobile/src/pocket/server.ts), with
            the instance's rule for the day's inbox note. */}
        {admin && <CaptureField />}
        {admin && (
          <button type="button" className="s-ph-card s-ph-today__daily" onClick={() => void openDailyNote()}>
            <span className="s-ph-card__kicker">{t("phTodayNote")}</span>
            <bdi className="s-ph-card__title" dir="auto">{dailyNoteLabel(day.dailyPath) ?? noteTitleOf(day.dailyPath)}</bdi>
            <span className="s-ph-card__meta">{day.dailyExists ? t("phOpenIt") : t("phCreateIt")}</span>
          </button>
        )}
        {admin && <Reflection state={day.reflection} onReflect={day.reflect} />}
        {admin && day.sigils.length > 0 && (
          <section aria-label={t("routines")}>
            <h2 className="s-ph-head">
              {t("routines")}
              <span className="s-ph-head__count">{tf("routinesSummary", { done: localeNum(doneCount), of: localeNum(day.sigils.length) })}</span>
            </h2>
            <ul className="s-ph-list">
              {day.sigils.map((row) => (
                <SigilRow key={sigilRowKey(row)} row={row} onToggle={day.toggleSigil} onOpen={openSigil} />
              ))}
            </ul>
          </section>
        )}
        {admin && day.decks.length > 0 && (
          <section aria-label={t("orbits")}>
            <h2 className="s-ph-head">{t("orbits")}</h2>
            <ul className="s-ph-list">
              {day.decks.map((deck) => (
                <li key={deck.path}>
                  <button type="button" className="s-ph-row" onClick={() => phone.open({ kind: "surface", tab: orbitsTabFor(deck.path) })}>
                    <span className="s-ph-task__sigil" aria-hidden="true">{deck.icon ?? "◌"}</span>
                    <bdi className="s-ph-row__name" dir="auto">{deck.implicit ? t("orbitsEverything") : deck.title}</bdi>
                    <span className="s-ph-row__count s-ph-row__count--due">{tf("phCardsDue", { n: countPhrase(deck.counts.due, "cards") })}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {admin && day.tasks.length > 0 && (
          <section aria-label={t("todayTasksDue")} data-today="tasks">
            <h2 className="s-ph-head">
              {t("todayTasksDue")}
              <span className="s-ph-head__count">{countPhrase(day.tasks.filter((r) => !r.task.done).length, "tasks")}</span>
            </h2>
            <ul className="s-ph-list">
              {day.tasks.map((row) => (
                <TaskRow key={taskRowKey(row)} row={row} onToggle={day.toggleTask} locale={locale} />
              ))}
            </ul>
          </section>
        )}
        {admin && day.onThisDay.length > 0 && (
          <section aria-label={t("onThisDay")} data-today="onthisday">
            <h2 className="s-ph-head">{t("onThisDay")}</h2>
            <ul className="s-ph-list">
              {day.onThisDay.map((hit) => (
                <li key={`${hit.path}:${hit.kind}:${hit.year}`}>
                  <button type="button" className="s-ph-row s-ph-hit" onClick={() => phone.open({ kind: "note", path: hit.path })}>
                    <span className="s-ph-today__ago">{tf("onThisDayAgo", { n: localeNum(thisYear - hit.year) })}</span>
                    <span className="s-ph-hit__text">
                      <bdi className="s-ph-row__name" dir="auto">{hit.kind === "finished" ? tf("onThisDayFinished", { title: hit.what }) : hit.what}</bdi>
                      {hit.excerpt !== "" && <bdi className="s-ph-hit__snippet" dir="auto">{hit.excerpt}</bdi>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {day.recents.length > 0 && (
          <section aria-label={t("recentlyRead")}>
            <h2 className="s-ph-head">{t("recentlyRead")}</h2>
            <ul className="s-ph-list">
              {day.recents.map((r) => (
                <li key={r.path}>
                  <button type="button" className="s-ph-row" onClick={() => phone.open({ kind: "note", path: r.path })}>
                    <span className="s-ph-row__glyph" aria-hidden="true">
                      <IconFile />
                    </span>
                    <bdi className="s-ph-row__name" dir="auto">{r.title}</bdi>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
