// TODAY ON THE DESKTOP — a pane surface (`~today`, `/today`) that holds what
// the day asks of the reader, in one column at reading width (docs/today.md).
//
// The phone has had this as its home tab since 3.26; the desktop had the same
// pieces scattered across four pages — the daily note behind Ctrl/Cmd Alt D,
// the Sigils page's checklist, the Orbits shelf's due counts, the tasks fence
// — and a reader who wanted the morning at a glance opened all four. Here
// they are one page, in the order a day is met: a line to capture, the day's
// note, what the sigils ask, the cards that are due, the tasks whose date has
// come, what was written on this day in earlier years, and the notes last
// read. After six in the evening, one more: "How did the day go?"
//
// THE DAY'S NOTE IS RENDERED, NOT EDITED. An editor inside a dashboard is a
// second editor for one file, with its own buffer and its own autosave racing
// the pane that opens the same note — so the note is drawn read-only by the
// reading view's renderer (client/reading/renderNote.ts), and "Open" puts it
// in a pane of its own, where the one editor for that file is.
//
// The data is client/today/hooks.ts — the phone's Today lifted out of its
// screen so both shells read one source (scripts/shell-seam.mjs keeps the
// chrome apart). This file is the desktop's chrome and nothing else.

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { EVERYTHING_ELSE } from "../../shared/decks.ts";
import { noteTitleOf } from "../../shared/noteFormat.ts";
import { dailyNoteLabel, openDailyNote } from "../daily.ts";
import { siteDate } from "../dates.ts";
import { countPhrase, localeNum, t, tf } from "../i18n.ts";
import { renderNoteContent } from "../reading/renderNote.ts";
import { useStore } from "../state.ts";
import { applyNoteLayoutTo } from "../textLayout.ts";
import { useCaptureLine, useToday, useVoiceReady } from "./hooks.ts";
import { sigilRowKey, taskRowKey, type DueTaskRow, type SigilTaskRow } from "./model.ts";
import "../reading/reading.css";
import "../styles/today.css";

const RECENTS_SHOWN = 8;

function Section({ title, count, children, testid }: { title: string; count?: string; children: ReactNode; testid: string }) {
  return (
    <section className="s-today__section" aria-label={title} data-testid={testid}>
      <h2 className="s-today__h2">
        {title}
        {count !== undefined && <span className="s-today__count">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

function CaptureLine() {
  const { text, setText, busy, send } = useCaptureLine();
  const voice = useVoiceReady();
  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    void send();
  };
  return (
    <form className="s-today__capture" onSubmit={onSubmit} data-testid="today-capture">
      <input
        className="s-today__field"
        type="text"
        dir="auto"
        value={text}
        placeholder={t("capturePlaceholder")}
        aria-label={t("captureTitle")}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
      />
      {voice && (
        <button type="button" className="s-btn s-today__mic" onClick={() => useStore.getState().openVoiceNote()} title={t("cmdVoiceNote")} aria-label={t("cmdVoiceNote")}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>
      )}
      <button type="submit" className="s-btn s-btn--accent" disabled={busy || text.trim() === ""}>
        {t("captureSend")}
      </button>
    </form>
  );
}

/** The day's note, drawn by the reading view's renderer into a detached tree
 *  and swapped in — never `innerHTML` over note text. */
function DailyNote({ path, content }: { path: string; content: string }) {
  const host = useRef<HTMLDivElement | null>(null);
  const tree = useStore((s) => s.tree);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const body = renderNoteContent(content, { notePath: path, tree });
    body.classList.add("s-today__prose");
    applyNoteLayoutTo(body, content);
    el.replaceChildren(body);
  }, [path, content, tree]);
  return <div ref={host} className="s-today__render" />;
}

function SigilItem({ row, onToggle }: { row: SigilTaskRow; onToggle: (row: SigilTaskRow) => void }) {
  const setView = useStore((s) => s.setView);
  const { task, meta } = row;
  const label = task.course ? t("phSigilSteps") : task.book ? tf("phSigilRead", { book: task.text ?? "" }) : task.slot ? `${task.slot} · ${task.text ?? ""}` : task.text ?? task.key;
  if (row.onCard) {
    return (
      <li className="s-today__row">
        <span className="s-today__glyph" aria-hidden="true">{meta.plan.emoji ?? "·"}</span>
        <button type="button" className="s-today__link" onClick={() => setView("routines")}>
          <bdi dir="auto">{label}</bdi>
        </button>
        <bdi className="s-today__meta" dir="auto">{meta.plan.title}</bdi>
      </li>
    );
  }
  return (
    <li className={`s-today__row${row.done ? " s-today__row--done" : ""}`}>
      <label className="s-today__check">
        <input type="checkbox" checked={row.done} onChange={() => onToggle(row)} />
        <bdi dir="auto">{label}</bdi>
      </label>
      <bdi className="s-today__meta" dir="auto">{meta.plan.title}</bdi>
    </li>
  );
}

function TaskItem({ row, onToggle, locale }: { row: DueTaskRow; onToggle: (row: DueTaskRow) => void; locale: string }) {
  const openNote = useStore((s) => s.openNote);
  const due = row.task.due ?? "";
  return (
    <li className={`s-today__row${row.task.done ? " s-today__row--done" : ""}`}>
      <label className="s-today__check">
        <input type="checkbox" checked={row.task.done} onChange={() => onToggle(row)} />
        <bdi dir="auto">{row.task.text}</bdi>
      </label>
      <span className="s-today__meta">
        {row.overdue && <span className="s-today__overdue">{tf("todayOverdue", { date: siteDate(`${due}T12:00:00`, locale, { day: "numeric", month: "short" }) || due })}</span>}
        <button type="button" className="s-today__link s-today__link--quiet" onClick={() => openNote(row.path)} title={row.path}>
          <bdi dir="auto">{row.title}</bdi>
        </button>
      </span>
    </li>
  );
}

function Reflection({ state, onReflect }: { state: ReturnType<typeof useToday>["reflection"]; onReflect: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  if (state.kind === "hidden") return null;
  if (state.kind === "done") {
    return (
      <Section title={t("todayReflected")} testid="today-reflection">
        <p className="s-today__reflection" dir="auto">{state.text}</p>
      </Section>
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
    <Section title={t("todayReflectAsk")} testid="today-reflection">
      <form className="s-today__capture" onSubmit={(e) => void submit(e)}>
        <input
          className="s-today__field"
          type="text"
          dir="auto"
          value={text}
          placeholder={t("todayReflectPlaceholder")}
          aria-label={t("todayReflectAsk")}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />
        <button type="submit" className="s-btn s-btn--accent" disabled={busy || text.trim() === ""}>
          {t("todayReflectSave")}
        </button>
      </form>
    </Section>
  );
}

export default function TodayView() {
  const day = useToday(RECENTS_SHOWN);
  const locale = useStore((s) => s.blogLocale);
  const openNote = useStore((s) => s.openNote);
  const openOrbits = useStore((s) => s.openOrbits);
  useStore((s) => s.language);
  const dateLine = siteDate(`${day.today}T12:00:00`, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const thisYear = Number(day.today.slice(0, 4));
  const doneCount = day.sigils.filter((r) => r.done).length;
  const quiet = day.sigilsLoaded && day.sigils.length === 0 && day.decks.length === 0 && day.tasks.length === 0;

  if (!day.admin) return <div className="s-today" />;
  return (
    <div className="s-today" data-testid="today">
      <div className="s-today__sheet">
        <header className="s-today__head">
          <p className="s-today__date">{dateLine}</p>
          <h1 className="s-today__h1">{t("todayPage")}</h1>
        </header>

        <CaptureLine />

        <Section title={t("phTodayNote")} testid="today-daily">
          <div className="s-today__dailyhead">
            <bdi className="s-today__dailyname" dir="auto">{dailyNoteLabel(day.dailyPath) ?? noteTitleOf(day.dailyPath)}</bdi>
            <button type="button" className="s-btn s-today__open" onClick={() => void openDailyNote()} data-testid="today-open-daily">
              {day.dailyExists ? t("phOpenIt") : t("phCreateIt")}
            </button>
          </div>
          {day.dailyExists && day.dailyContent !== null ? (
            day.dailyContent.trim() === "" ? <p className="s-today__empty">{t("todayDailyEmpty")}</p> : <DailyNote path={day.dailyPath} content={day.dailyContent} />
          ) : (
            <p className="s-today__empty">{t("todayNoDaily")}</p>
          )}
        </Section>

        <Reflection state={day.reflection} onReflect={day.reflect} />

        {day.sigils.length > 0 && (
          <Section title={t("routines")} count={tf("routinesSummary", { done: localeNum(doneCount), of: localeNum(day.sigils.length) })} testid="today-sigils">
            <ul className="s-today__list">
              {day.sigils.map((row) => (
                <SigilItem key={sigilRowKey(row)} row={row} onToggle={day.toggleSigil} />
              ))}
            </ul>
          </Section>
        )}

        {day.decks.length > 0 && (
          <Section title={t("orbits")} testid="today-orbits">
            <ul className="s-today__list">
              {day.decks.map((deck) => (
                <li key={deck.path} className="s-today__row">
                  <span className="s-today__glyph" aria-hidden="true">{deck.icon ?? "◌"}</span>
                  <bdi className="s-today__name" dir="auto">{deck.implicit || deck.path === EVERYTHING_ELSE ? t("orbitsEverything") : deck.title}</bdi>
                  <span className="s-today__meta">{tf("phCardsDue", { n: countPhrase(deck.counts.due, "cards") })}</span>
                  <button type="button" className="s-btn s-btn--accent s-today__study" onClick={() => openOrbits(deck.path)} aria-label={tf("orbitsChipStudyTitle", { title: deck.implicit ? t("orbitsEverything") : deck.title })}>
                    {t("orbitsChipStudy")}
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {day.tasks.length > 0 && (
          <Section title={t("todayTasksDue")} count={countPhrase(day.tasks.filter((r) => !r.task.done).length, "tasks")} testid="today-tasks">
            <ul className="s-today__list">
              {day.tasks.map((row) => (
                <TaskItem key={taskRowKey(row)} row={row} onToggle={day.toggleTask} locale={locale} />
              ))}
            </ul>
          </Section>
        )}

        {quiet && <p className="s-today__empty s-today__quiet">{t("todayNothingAsked")}</p>}

        {day.onThisDay.length > 0 && (
          <Section title={t("onThisDay")} testid="today-onthisday">
            <ul className="s-today__list">
              {day.onThisDay.map((hit) => (
                <li key={`${hit.path}:${hit.kind}:${hit.year}`} className="s-today__row s-today__row--stack">
                  <span className="s-today__ago">{tf("onThisDayAgo", { n: localeNum(thisYear - hit.year) })}</span>
                  <button type="button" className="s-today__link" onClick={() => openNote(hit.path)} title={hit.path}>
                    <bdi dir="auto">{hit.kind === "finished" ? tf("onThisDayFinished", { title: hit.what }) : hit.what}</bdi>
                  </button>
                  {hit.excerpt !== "" && (
                    <span className="s-today__excerpt">
                      <bdi dir="auto">{hit.excerpt}</bdi>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {day.recents.length > 0 && (
          <Section title={t("recentlyRead")} testid="today-recent">
            <ul className="s-today__list s-today__list--recent">
              {day.recents.map((r) => (
                <li key={r.path}>
                  <button type="button" className="s-today__link" onClick={() => openNote(r.path)} title={r.path}>
                    <bdi dir="auto">{r.title}</bdi>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
