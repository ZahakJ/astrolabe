// THE ORBITS PAGE. Every ```orbit in the vault, as today's checklists.
//
// A workspace TAB like the Media page (`ROUTINES_TAB` in client/workspace.ts)
// and a lazy chunk with its own stylesheet. It is a second drawing of the
// card the note already draws — the same renderer (client/reading/routine.ts)
// mounted into React, one card per plan — plus a form that writes a new
// orbit as a note of its own under `Orbits/`. A tick here goes to
// `POST /api/routine`, which records the day in the note's log fence with
// the same pure edit the editor's widget dispatches into its buffer.
//
// Reads `GET /api/routines`; re-reads on the window's `astrolabe:vault`
// event, because a box ticked in the editor is still this page's business.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SiteMark from "../components/SiteMark.tsx";
import type { RoutineMeta } from "../../shared/types.ts";
import { dayStatus, isoDate, type EntryPatch } from "../../shared/routine.ts";
import { getCards, getRoutines, updateRoutine } from "../api.ts";
import { isDue } from "../../shared/srs.ts";
import { siteDate } from "../dates.ts";
import { localeNum, t, tf } from "../i18n.ts";
import { confirmDeleteNote } from "../components/deleteFlow.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { renderRoutineCard } from "../reading/routine.ts";
import { renderMarkdown, renderTasksBlock } from "../reading/render.ts";
import { parseTasksFence, shift } from "../../shared/tasks.ts";
import { RoutineForm } from "./RoutineForm.tsx";
import { decorateStarTasks } from "./stars.ts";
import { OnThisDayList, useOnThisDay } from "../components/OnThisDayPanel.tsx";
import "../styles/routines.css";

export const VAULT_EVENT = "astrolabe:vault";

/** The reading renderer's card, mounted in React. Rebuilt whenever the meta
 *  changes (a tick answered by the server, a hand edit heard on the vault
 *  event); the card holds no state of its own, so a rebuild is the truth. */
function RoutineCard({
  meta,
  today,
  onLog,
  onOpen,
  onEdit,
  onDelete,
}: {
  meta: RoutineMeta;
  today: string;
  onLog: (patch: EntryPatch) => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    // The author's notes go through the markdown pipeline, as the reading
    // view's fence branch does it (render.ts routineBlock).
    const notesHtml = meta.plan.notes ? renderMarkdown(meta.plan.notes, { notePath: meta.path, tree: useStore.getState().tree }).innerHTML : undefined;
    const card = renderRoutineCard(meta.plan, meta.entries, {
      notePath: meta.path,
      notesHtml,
      today,
      onLog,
      onOpen,
      actions: [
        { label: t("routinesEdit"), onClick: onEdit },
        { label: t("routinesDelete"), onClick: onDelete },
      ],
    });
    el.replaceChildren(card);
    // A slot that wikilinks a constellation gets its "N due · Study" chip
    // (client/routines/stars.ts) — after the draw, on the drawn card.
    decorateStarTasks(card, meta, today);
    return () => el.replaceChildren();
  }, [meta, today, onLog, onOpen, onEdit, onDelete]);
  return <div ref={host} className="s-routines__card" />;
}

/** Open tasks due by today, live: the day's dashboard is where a to-do
 *  with a date belongs, next to the routines that carry no dates. */
function DueTasks({ today }: { today: string }) {
  const host = useRef<HTMLDivElement | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    // Every vault frame would re-fetch every task in the vault; a burst of
    // autosaves is one re-read, a beat after the last of them.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onVault = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setTick((n) => n + 1), 400);
    };
    window.addEventListener(VAULT_EVENT, onVault);
    return () => {
      window.removeEventListener(VAULT_EVENT, onVault);
      if (timer) clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const spec = parseTasksFence(`not done\ndue before ${shift(today, 1)}`, today);
    el.replaceChildren(renderTasksBlock(spec, { notePath: "", tree: useStore.getState().tree }, { live: true }));
    return () => el.replaceChildren();
  }, [today, tick]);
  return <div ref={host} className="s-routines__tasks" />;
}

/** How many flashcards are due today — one line with a door to the Review
 *  page, because the morning's checklist is where the day's cards belong. */
function CardsDue({ today }: { today: string }) {
  const [due, setDue] = useState(0);
  const toggleReview = useStore((s) => s.toggleReview);
  useEffect(() => {
    let alive = true;
    const read = (): void => {
      getCards()
        .then((list) => {
          if (alive) setDue(list.filter((m) => isDue(m.card.schedule, today)).length);
        })
        .catch(() => {});
    };
    read();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onVault = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(read, 400);
    };
    window.addEventListener(VAULT_EVENT, onVault);
    return () => {
      alive = false;
      window.removeEventListener(VAULT_EVENT, onVault);
      if (timer) clearTimeout(timer);
    };
  }, [today]);
  if (due === 0) return null;
  return (
    <section className="s-routines__cards" data-testid="routines-cards-due">
      <span className="s-routines__cardstext">{due === 1 ? t("routinesCardsDueOne") : tf("routinesCardsDue", { n: localeNum(due) })}</span>
      <button type="button" className="s-btn s-btn--accent" onClick={toggleReview}>
        {t("routinesReview")}
      </button>
    </section>
  );
}

export default function RoutinesView() {
  const [all, setAll] = useState<RoutineMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState<{ open: boolean; editing: RoutineMeta | null }>({ open: false, editing: null });
  const openNote = useStore((s) => s.openNote);
  const setView = useStore((s) => s.setView);
  const locale = useStore((s) => s.blogLocale);
  const today = isoDate(new Date());

  const load = useCallback((): void => {
    getRoutines()
      .then((list) => {
        setAll(list);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    load();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onVault = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 250);
    };
    window.addEventListener(VAULT_EVENT, onVault);
    return () => {
      window.removeEventListener(VAULT_EVENT, onVault);
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  const live = useMemo(() => (all ?? []).filter((m) => !m.template), [all]);
  const templates = useMemo(() => (all ?? []).filter((m) => m.template), [all]);
  const complete = useMemo(
    () => live.filter((m) => dayStatus(m.plan, m.entries.find((e) => e.date === today) ?? null, today, today) === "complete").length,
    [live, today],
  );
  const asked = useMemo(() => live.filter((m) => dayStatus(m.plan, null, today, today) !== "rest").length, [live, today]);

  const log = useCallback(
    async (meta: RoutineMeta, patch: EntryPatch): Promise<void> => {
      try {
        await updateRoutine(meta.path, meta.index, patch);
      } catch {
        toast(tf("routinesSaveFailed", { title: meta.plan.title }), "error");
      }
      load();
    },
    [load],
  );

  const open = useCallback(
    (meta: RoutineMeta): void => {
      openNote(meta.path);
      setView("editor");
    },
    [openNote, setView],
  );

  const remove = useCallback(
    (meta: RoutineMeta): void => {
      void confirmDeleteNote(meta.path).then(load);
    },
    [load],
  );

  const onThisDay = useOnThisDay();
  const dateLine = siteDate(`${today}T12:00:00`, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="s-routines" data-testid="routines-page">
      <header className="s-routines__head">
        <div className="s-routines__headtext">
          <p className="s-routines__date">{dateLine}</p>
          <h1 className="s-routines__h1">{t("routines")}</h1>
          <p className="s-routines__lead">
            {live.length > 0 && asked > 0 ? tf("routinesSummary", { done: localeNum(complete), of: localeNum(asked) }) : t("routinesLead")}
          </p>
        </div>
        <button type="button" className="s-btn s-btn--accent s-routines__addbtn" onClick={() => setForm({ open: true, editing: null })}>
          {t("routinesAdd")}
        </button>
      </header>
      {onThisDay.length > 0 && (
        <section className="s-routines__otd" aria-label={t("onThisDay")}>
          <h2 className="s-routines__otdhead">{t("onThisDay")}</h2>
          <OnThisDayList rows={onThisDay} />
        </section>
      )}
      <CardsDue today={today} />
      <section className="s-routines__due" aria-label={t("routinesTasksHead")}>
        <DueTasks today={today} />
      </section>
      {failed ? (
        <p className="s-routines__empty">{t("routinesFailed")}</p>
      ) : all !== null && live.length === 0 ? (
        <div className="s-routines__empty">
          <span className="s-routines__emptystar" aria-hidden="true"><SiteMark size={32} /></span>
          <p className="s-routines__emptytext">{t("routinesEmpty")}</p>
          <p className="s-routines__emptyhint">{t("routinesEmptyHint")}</p>
        </div>
      ) : (
        <div className="s-routines__grid">
          {live.map((meta) => (
            <RoutineCard
              key={`${meta.path}::${meta.index}`}
              meta={meta}
              today={today}
              onLog={(patch) => void log(meta, patch)}
              onOpen={() => open(meta)}
              onEdit={() => setForm({ open: true, editing: meta })}
              onDelete={() => remove(meta)}
            />
          ))}
        </div>
      )}
      {form.open && (
        <RoutineForm
          editing={form.editing}
          templates={templates}
          onClose={() => setForm({ open: false, editing: null })}
          onSaved={() => {
            setForm({ open: false, editing: null });
            load();
          }}
        />
      )}
    </div>
  );
}
