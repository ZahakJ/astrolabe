// THE REVIEW PAGE. The vault's flashcards, the due ones first.
//
// A workspace TAB like the Routines page (`REVIEW_TAB` in client/workspace.ts)
// and a lazy chunk with its own stylesheet. Nothing here is new syntax: a
// card is a ==highlight==, a `> [!quote]`, or a `Question\n?\nAnswer` the
// note already holds (shared/flashcards.ts), and a grade goes to
// `POST /api/card/review`, which writes the next due day into the note as
// the Spaced Repetition plugin's comment. The page shows one card at a
// time: the front, then the answer, then four grades with the interval each
// would give, so the reader never grades blind.
//
// Reads `GET /api/cards`; the queue is built once from what is due and
// re-read on the vault event WITHOUT resetting the reader's place — a save
// in another pane is not a reason to shuffle the deck under them.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SiteMark from "../components/SiteMark.tsx";
import type { CardMeta } from "../../shared/types.ts";
import { isDue, review, type Grade } from "../../shared/srs.ts";
import { isoDate } from "../../shared/routine.ts";
import { getCards, reviewCard } from "../api.ts";
import { siteDate } from "../dates.ts";
import { localeNum, t, tf } from "../i18n.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { renderMarkdown } from "../reading/render.ts";
import "../styles/review.css";

const VAULT_EVENT = "astrolabe:vault";
const GRADES: Grade[] = ["again", "hard", "good", "easy"];
const GRADE_LABEL: Record<Grade, "reviewAgain" | "reviewHard" | "reviewGood" | "reviewEasy"> = {
  again: "reviewAgain",
  hard: "reviewHard",
  good: "reviewGood",
  easy: "reviewEasy",
};
const KIND_LABEL = { qa: "reviewKindQa", cloze: "reviewKindCloze", quote: "reviewKindQuote" } as const;

/** A card's identity across re-reads. NOT its line: the first grade
 *  writes a comment line into the note and every card below it moves down
 *  one, which would empty a queue keyed by line. The front is stable until
 *  the reader edits it, and an edited card is a new card. */
function keyOf(m: CardMeta): string {
  return `${m.path}#${m.card.kind}#${m.card.front}`;
}

/** A face of the card — markdown through the reading renderer, so a cloze
 *  front with **[…]** and a quote with its `**source**` read as prose. */
function Face({ md, path, className }: { md: string; path: string; className: string }) {
  const host = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.replaceChildren(renderMarkdown(md, { notePath: path, tree: useStore.getState().tree }));
    return () => el.replaceChildren();
  }, [md, path]);
  return <div ref={host} className={className} dir="auto" />;
}

export default function ReviewView() {
  const [all, setAll] = useState<CardMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [queue, setQueue] = useState<string[] | null>(null);
  const [ahead, setAhead] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const openNote = useStore((s) => s.openNote);
  const setView = useStore((s) => s.setView);
  const locale = useStore((s) => s.blogLocale);
  const today = isoDate(new Date());
  const page = useRef<HTMLDivElement | null>(null);

  const load = useCallback((): void => {
    getCards()
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

  const byKey = useMemo(() => new Map((all ?? []).map((m) => [keyOf(m), m])), [all]);
  const dueCount = useMemo(() => (all ?? []).filter((m) => isDue(m.card.schedule, today)).length, [all, today]);

  // The queue is built ONCE from the first read: what is due, oldest due
  // first, then the never-reviewed. A later read only refreshes the cards'
  // faces and schedules; the order the reader is walking stays theirs.
  useEffect(() => {
    if (all === null || queue !== null) return;
    const due = all.filter((m) => isDue(m.card.schedule, today));
    due.sort((a, b) => (a.card.schedule?.due ?? "0").localeCompare(b.card.schedule?.due ?? "0"));
    setQueue(due.map(keyOf));
  }, [all, queue, today]);

  const current = queue !== null && queue.length > 0 ? byKey.get(queue[0]) ?? null : null;
  // A card that vanished from the vault between reads is skipped, not shown
  // as a blank.
  useEffect(() => {
    if (queue !== null && queue.length > 0 && !byKey.has(queue[0]) && all !== null) setQueue((q) => (q ?? []).slice(1));
  }, [queue, byKey, all]);

  const grade = useCallback(
    async (g: Grade): Promise<void> => {
      if (!current) return;
      const key = keyOf(current);
      setRevealed(false);
      // "Again" comes back at the end of today's walk; anything else is
      // done for the day.
      setQueue((q) => {
        const rest = (q ?? []).filter((k) => k !== key);
        return g === "again" ? [...rest, key] : rest;
      });
      if (g !== "again") setDone((n) => n + 1);
      try {
        await reviewCard(current.path, current.card.line, g, today);
      } catch {
        toast(t("reviewSaveFailed"), "error");
      }
      load();
    },
    [current, load, today],
  );

  const studyAhead = useCallback((): void => {
    const rest = (all ?? []).filter((m) => !isDue(m.card.schedule, today));
    rest.sort((a, b) => (a.card.schedule?.due ?? "").localeCompare(b.card.schedule?.due ?? ""));
    setAhead(true);
    setRevealed(false);
    setQueue(rest.map(keyOf));
  }, [all, today]);

  // The page answers the keyboard while it has focus: Space or Enter turns
  // the card, 1–4 grade it. Scoped to the element so a note in the other
  // pane keeps its own keys.
  useEffect(() => {
    const el = page.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement | null)?.closest("button, a, input, textarea")) return;
      if (!current) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!revealed) setRevealed(true);
        else void grade("good");
      } else if (/^[1-4]$/.test(e.key) && revealed) {
        e.preventDefault();
        void grade(GRADES[Number(e.key) - 1]);
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [current, revealed, grade]);

  const open = useCallback(
    (m: CardMeta): void => {
      openNote(m.path);
      setView("editor");
    },
    [openNote, setView],
  );

  const dateLine = siteDate(`${today}T12:00:00`, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const total = (queue?.length ?? 0) + done;

  return (
    <div className="s-review" data-testid="review-page" ref={page} tabIndex={-1}>
      <header className="s-review__head">
        <div className="s-review__headtext">
          <p className="s-review__date">{dateLine}</p>
          <h1 className="s-review__h1">{t("review")}</h1>
          <p className="s-review__lead">
            {all === null
              ? t("reviewLead")
              : dueCount === 0
                ? t("reviewNothingDue")
                : dueCount === 1
                  ? t("reviewDueOne")
                  : tf("reviewDue", { n: localeNum(dueCount) })}
            {all !== null && all.length > 0 ? ` · ${tf("reviewTotal", { n: localeNum(all.length) })}` : ""}
          </p>
        </div>
        {current && total > 0 && (
          <p className="s-review__progress" aria-live="polite">
            {tf("reviewProgress", { done: localeNum(Math.min(done + 1, total)), total: localeNum(total) })}
          </p>
        )}
      </header>
      {failed ? (
        <p className="s-review__empty">{t("reviewFailed")}</p>
      ) : all !== null && all.length === 0 ? (
        <div className="s-review__empty">
          <span className="s-review__emptystar" aria-hidden="true"><SiteMark size={32} /></span>
          <p className="s-review__emptytext">{t("reviewEmpty")}</p>
          <p className="s-review__emptyhint">{t("reviewEmptyHint")}</p>
        </div>
      ) : current === null && queue !== null ? (
        <div className="s-review__empty">
          <span className="s-review__emptystar" aria-hidden="true"><SiteMark size={32} /></span>
          <p className="s-review__emptytext">{t("reviewDone")}</p>
          <p className="s-review__emptyhint">{t("reviewDoneHint")}</p>
          {!ahead && all !== null && all.length > 0 && (
            <button type="button" className="s-btn s-review__ahead" onClick={studyAhead}>
              {t("reviewStudyAhead")}
            </button>
          )}
        </div>
      ) : current !== null ? (
        <article className={`s-review__card${revealed ? " s-review__card--open" : ""}`} data-testid="review-card" data-kind={current.card.kind}>
          <div className="s-review__meta">
            <span className="s-review__kind">{t(KIND_LABEL[current.card.kind])}</span>
            <button type="button" className="s-review__note" onClick={() => open(current)} title={t("reviewOpenNote")}>
              {current.title}
            </button>
          </div>
          <Face md={current.card.front} path={current.path} className="s-review__front" />
          {revealed ? (
            <>
              <hr className="s-review__rule" />
              <Face md={current.card.back} path={current.path} className="s-review__back" />
              <div className="s-review__grades" role="group" aria-label={t("review")}>
                {GRADES.map((g, i) => (
                  <button
                    key={g}
                    type="button"
                    className={`s-btn s-review__grade s-review__grade--${g}`}
                    onClick={() => void grade(g)}
                    data-testid={`grade-${g}`}
                  >
                    <span className="s-review__gradekey" aria-hidden="true">{localeNum(i + 1)}</span>
                    <span className="s-review__gradelabel">{t(GRADE_LABEL[g])}</span>
                    <span className="s-review__gradein">{tf("reviewInDays", { n: localeNum(review(current.card.schedule, g, today).interval) })}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button type="button" className="s-btn s-btn--accent s-review__show" onClick={() => setRevealed(true)} data-testid="review-show">
              {t("reviewShow")}
            </button>
          )}
        </article>
      ) : null}
    </div>
  );
}
