// SIGILS, ON A PHONE: every sigil as a row that says how today stands, and a
// sigil as a screen of its own (./SigilScreen.tsx) with today's checklist
// first.
//
// The desktop's page is a masonry of whole cards, stats and heat maps
// included; on a phone that was a scroll of several screens before the second
// sigil's ticks. The row answers the morning's question — "2 of 3 today", a
// rest day, done, the step a course is on — and the day's ticks themselves
// are one tap further, or already on Today.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { courseProgress } from "../../../shared/course.ts";
import { dayStatus, isoDate, tasksFor } from "../../../shared/routine.ts";
import type { RoutineMeta } from "../../../shared/types.ts";
import { getRoutines } from "../../api.ts";
import { localeNum, t, tf } from "../../i18n.ts";
import { RoutineForm } from "../../routines/RoutineForm.tsx";
import { useStore } from "../../state.ts";
import { usePhone } from "../context.ts";
import { IconCheck, IconChevron, IconPlus } from "../icons.tsx";
import RoutedLayer from "../RoutedLayer.tsx";
import TopBar from "../TopBar.tsx";
import { useScrollMemory } from "../useScrollMemory.ts";
import { useVaultTick } from "../useVaultTick.ts";
import "../../styles/routines.css";


function sameKey(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** How today stands for one sigil, in a few words, and whether it is done. */
export function todayLine(meta: RoutineMeta, today: string): { text: string; done: boolean } {
  const { plan, entries } = meta;
  const entry = entries.find((e) => e.date === today) ?? null;
  if (plan.mode === "course" && plan.course !== null) {
    const p = courseProgress(plan, entries);
    const status = dayStatus(plan, entry, today, today);
    if (p.done >= p.of && p.of > 0) return { text: t("sigilCourseFinished"), done: true };
    return { text: tf("sigilCourseWhere", { n: localeNum(Math.min(p.done + 1, p.of)), of: localeNum(p.of) }), done: status === "complete" };
  }
  const tasks = tasksFor(plan, today);
  if (tasks.length === 0) return { text: t("routineDayRest"), done: false };
  const done = tasks.filter((task) => entry?.done.some((d) => sameKey(d, task.key))).length;
  if (done >= tasks.length) return { text: t("routineDayComplete"), done: true };
  return { text: tf("phSigilToday", { done: localeNum(done), of: localeNum(tasks.length) }), done: false };
}

export default function SigilsScreen({ onBack }: { onBack?: () => void }) {
  const phone = usePhone();
  const admin = useStore((s) => s.admin);
  const locale = useStore((s) => s.blogLocale);
  useStore((s) => s.language);
  const tick = useVaultTick();
  const today = isoDate(new Date());
  const [all, setAll] = useState<RoutineMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useScrollMemory(scrollRef);

  const load = useCallback(() => {
    getRoutines()
      .then((list) => {
        setAll(list);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load, tick]);

  // The page's own order: by title in the site's language, never by the
  // newest-touched (a tick writes the note, and a row that jumped to the top
  // on every tick is the flash the owner saw on the desktop page).
  const live = useMemo(
    () => (all ?? []).filter((m) => !m.template).sort((a, b) => a.plan.title.localeCompare(b.plan.title, locale) || a.path.localeCompare(b.path)),
    [all, locale],
  );
  const templates = useMemo(() => (all ?? []).filter((m) => m.template), [all]);
  const rows = useMemo(() => live.map((meta) => ({ meta, line: todayLine(meta, today) })), [live, today]);
  const complete = rows.filter((r) => r.line.done).length;

  return (
    <div className="s-ph-screen s-ph-sigils" data-screen="sigils">
      <TopBar
        title={t("routines")}
        onBack={onBack}
        onTitle={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
        actions={
          admin ? (
            <button type="button" className="s-ph-icon" aria-label={t("routinesAdd")} onClick={() => setAdding(true)}>
              <IconPlus />
            </button>
          ) : undefined
        }
      />
      <div className="s-ph-scroll" ref={scrollRef}>
        {rows.length > 0 && <p className="s-ph-today__date">{tf("routinesSummary", { done: localeNum(complete), of: localeNum(rows.length) })}</p>}
        {failed ? (
          <p className="s-ph-empty">{t("routinesFailed")}</p>
        ) : all !== null && rows.length === 0 ? (
          <div className="s-ph-empty">
            <p>{t("routinesEmpty")}</p>
            <p className="s-ph-foot">{t("routinesEmptyHint")}</p>
          </div>
        ) : (
          <ul className="s-ph-list" aria-label={t("routines")}>
            {rows.map(({ meta, line }) => (
              <li key={`${meta.path}#${meta.index}`}>
                <button type="button" className={`s-ph-row${line.done ? " s-ph-row--done" : ""}`} data-sigil={meta.path} onClick={() => phone.open({ kind: "sigil", path: meta.path, index: meta.index })}>
                  <span className="s-ph-task__sigil" dir="auto" aria-hidden="true">{meta.plan.emoji ?? "·"}</span>
                  <span className="s-ph-hit__text">
                    <bdi className="s-ph-row__name" dir="auto">{meta.plan.title || t("routineUntitled")}</bdi>
                    <span className="s-ph-hit__snippet">{line.text}</span>
                  </span>
                  {line.done && (
                    <span className="s-ph-row__done" aria-hidden="true">
                      <IconCheck />
                    </span>
                  )}
                  <span className="s-ph-row__chev" aria-hidden="true">
                    <IconChevron />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {adding && (
        <RoutedLayer id="new-sigil" onGone={() => setAdding(false)}>
          <RoutineForm
            editing={null}
            templates={templates}
            onClose={() => setAdding(false)}
            onSaved={() => {
              setAdding(false);
              load();
            }}
          />
        </RoutedLayer>
      )}
    </div>
  );
}
