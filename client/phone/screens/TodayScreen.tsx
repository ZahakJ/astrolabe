// TODAY — the phone's home: what today asks of the reader, on one screen.
//
// The audit counted the taps to the day's four habits on the old phone shell:
// today's note was ⋯ → Calendar → today → Create (4); a card review ⋯ →
// Orbits → Study (3); a Sigil tick ⋯ → Sigils → a 470px scroll past the stat
// tiles → tick. Here each is one row: capture at the top (the CaptureSheet's
// flow, client/capture.ts), today's note, every Sigil task due today as a
// row you tick in place, every deck with cards due as a row that starts the
// session, and the last notes you were in.
//
// Nothing here is a second implementation. The ticks go through the same
// `POST /api/routine` edit the Sigil card dispatches, computed with the same
// `tasksFor` the card draws from (shared/routine.ts) — only the card's stats
// header and heat map are left behind, because a checklist is a checklist.

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { RoutineMeta } from "../../../shared/types.ts";
import type { DeckMeta } from "../../../shared/decks.ts";
import { isoDate, tasksFor, type RoutineTask } from "../../../shared/routine.ts";
import { noteTitleOf } from "../../../shared/noteFormat.ts";
import { getDecks, getRoutines, updateRoutine } from "../../api.ts";
import { capture } from "../../capture.ts";
import { dailyNoteLabel, dailyNotePath, loadPeriodic, openDailyNote } from "../../daily.ts";
import { siteDate } from "../../dates.ts";
import { collectNotes } from "../../editor/links.ts";
import { countPhrase, t, tf } from "../../i18n.ts";
import { recentNotes } from "../../recents.ts";
import { useStore } from "../../state.ts";
import { toast } from "../../toast.ts";
import { actionToast } from "../../undoToast.ts";
import { orbitsTabFor, ROUTINES_TAB } from "../../workspace.ts";
import { usePhone } from "../context.ts";
import { IconCheck, IconChevron, IconFile, IconSend } from "../icons.tsx";
import TopBar from "../TopBar.tsx";

const VAULT_EVENT = "astrolabe:vault";
const RECENTS_SHOWN = 8;

/** Re-read on the vault's own event, a beat after a burst settles. */
function useVaultTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const on = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setTick((n) => n + 1), 400);
    };
    window.addEventListener(VAULT_EVENT, on);
    return () => {
      window.removeEventListener(VAULT_EVENT, on);
      if (timer) clearTimeout(timer);
    };
  }, []);
  return tick;
}

function CaptureField() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const openNote = useStore((s) => s.openNote);
  const send = async (): Promise<void> => {
    const line = text.trim();
    if (line === "" || busy) return;
    setBusy(true);
    try {
      const path = await capture(line, "daily");
      if (path === null) return;
      setText("");
      actionToast(tf("capturedTo", { name: dailyNoteLabel(path) ?? noteTitleOf(path) }), t("captureOpenNote"), () => openNote(path));
    } catch {
      toast(t("captureFailed"), "error");
    } finally {
      setBusy(false);
    }
  };
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
      <button type="submit" className="s-ph-icon s-ph-capture__send" aria-label={t("captureSend")} disabled={busy || text.trim() === ""}>
        <IconSend />
      </button>
    </form>
  );
}

interface TaskRow {
  meta: RoutineMeta;
  task: RoutineTask;
  done: boolean;
}

const SigilRow = memo(function SigilRow({ row, onToggle, onOpen }: { row: TaskRow; onToggle: (row: TaskRow) => void; onOpen: (row: TaskRow) => void }) {
  const { task, meta, done } = row;
  // A course's day and a book's pages are answered on the card, where the
  // steps and the page count are; the row opens it rather than guessing.
  const onCard = task.course === true || task.book === true;
  const label = task.course ? t("phSigilSteps") : task.book ? tf("phSigilRead", { book: task.text ?? "" }) : task.slot ? `${task.slot} · ${task.text ?? ""}` : task.text ?? task.key;
  if (onCard) {
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

function sameKey(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export default function TodayScreen() {
  const phone = usePhone();
  const admin = useStore((s) => s.admin);
  const pocket = useStore((s) => s.pocket);
  const tree = useStore((s) => s.tree);
  const locale = useStore((s) => s.blogLocale);
  useStore((s) => s.language);
  const tick = useVaultTick();
  const today = isoDate(new Date());
  const [routines, setRoutines] = useState<RoutineMeta[] | null>(null);
  const [decks, setDecks] = useState<DeckMeta[]>([]);
  const [dailyPath, setDailyPath] = useState(() => dailyNotePath());

  useEffect(() => {
    if (!admin) return;
    let live = true;
    void loadPeriodic().then(() => live && setDailyPath(dailyNotePath()));
    getRoutines()
      .then((list) => live && setRoutines(list.filter((m) => !m.template)))
      .catch(() => live && setRoutines([]));
    getDecks(today)
      .then((list) => live && setDecks(list.filter((d) => d.counts.due > 0)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [admin, today, tick]);

  const rows = useMemo<TaskRow[]>(() => {
    const out: TaskRow[] = [];
    for (const meta of routines ?? []) {
      const entry = meta.entries.find((e) => e.date === today) ?? null;
      for (const task of tasksFor(meta.plan, today)) {
        out.push({ meta, task, done: entry?.done.some((d) => sameKey(d, task.key)) ?? false });
      }
    }
    return out;
  }, [routines, today]);

  // A tick is answered on screen at once and written behind it; a failed
  // write puts the box back and says so. One row re-renders, not the page.
  const toggle = useCallback(
    (row: TaskRow): void => {
      const entry = row.meta.entries.find((e) => e.date === today) ?? null;
      const was = entry?.done ?? [];
      const done = row.done ? was.filter((d) => !sameKey(d, row.task.key)) : [...was, row.task.key];
      const nextMeta: RoutineMeta = {
        ...row.meta,
        entries: entry ? row.meta.entries.map((e) => (e === entry ? { ...e, done } : e)) : [...row.meta.entries, { date: today, done, skipped: [], deferred: [], values: {}, note: null }],
      };
      setRoutines((list) => (list ?? []).map((m) => (m.path === row.meta.path && m.index === row.meta.index ? nextMeta : m)));
      updateRoutine(row.meta.path, row.meta.index, { date: today, done }).catch(() => {
        toast(tf("routinesSaveFailed", { title: row.meta.plan.title }), "error");
        setRoutines((list) => (list ?? []).map((m) => (m.path === row.meta.path && m.index === row.meta.index ? row.meta : m)));
      });
    },
    [today],
  );
  const openSigil = useCallback((): void => phone.open({ kind: "surface", tab: ROUTINES_TAB }), [phone]);

  const recents = useMemo(() => {
    if (!tree) return [];
    const titles = new Map(collectNotes(tree).map((n) => [n.path, n.title]));
    return recentNotes(tree, { limit: RECENTS_SHOWN }).map((path) => ({ path, title: titles.get(path) ?? path }));
  }, [tree]);

  const dailyExists = useMemo(() => (tree ? collectNotes(tree).some((n) => n.path === dailyPath) : false), [tree, dailyPath]);
  const dateLine = siteDate(`${today}T12:00:00`, locale, { weekday: "long", day: "numeric", month: "long" });
  const doneCount = rows.filter((r) => r.done).length;

  return (
    <div className="s-ph-screen s-ph-today" data-screen="today">
      <TopBar title={t("phTabToday")} />
      <div className="s-ph-scroll">
        <p className="s-ph-today__date">{dateLine}</p>
        {/* Not in a pocket vault: the pocket server has no `/api/capture`
            (mobile/src/pocket/server.ts answers it 404), and a field that
            accepts a line and then fails to keep it is worse than no field.
            The daily note card below is the pocket's way to today's note. */}
        {admin && !pocket && <CaptureField />}
        {admin && (
          <button type="button" className="s-ph-card s-ph-today__daily" onClick={() => void openDailyNote()}>
            <span className="s-ph-card__kicker">{t("phTodayNote")}</span>
            <bdi className="s-ph-card__title" dir="auto">{dailyNoteLabel(dailyPath) ?? noteTitleOf(dailyPath)}</bdi>
            <span className="s-ph-card__meta">{dailyExists ? t("phOpenIt") : t("phCreateIt")}</span>
          </button>
        )}
        {admin && rows.length > 0 && (
          <section aria-label={t("routines")}>
            <h2 className="s-ph-head">
              {t("routines")}
              <span className="s-ph-head__count">{tf("routinesSummary", { done: String(doneCount), of: String(rows.length) })}</span>
            </h2>
            <ul className="s-ph-list">
              {rows.map((row) => (
                <SigilRow key={`${row.meta.path}#${row.meta.index}#${row.task.key}`} row={row} onToggle={toggle} onOpen={openSigil} />
              ))}
            </ul>
          </section>
        )}
        {admin && decks.length > 0 && (
          <section aria-label={t("orbits")}>
            <h2 className="s-ph-head">{t("orbits")}</h2>
            <ul className="s-ph-list">
              {decks.map((deck) => (
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
        {recents.length > 0 && (
          <section aria-label={t("recentlyRead")}>
            <h2 className="s-ph-head">{t("recentlyRead")}</h2>
            <ul className="s-ph-list">
              {recents.map((r) => (
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
