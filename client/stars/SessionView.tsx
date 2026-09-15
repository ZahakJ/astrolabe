// THE SESSION. One star at a time, in the middle of the page; the card is
// the hero and everything else — the breadcrumb, the progress bar, the
// three small actions — stays out of its way.
//
// What is on screen is the queue's business (client/stars/queue.ts); this
// file only asks it for the next star, shows the front, turns the card,
// and hands back a grade. A grade that changes the schedule goes to
// `POST /api/star/review`, which writes the plugin's comment into the note;
// a grade that only moves the star between learning steps writes nothing,
// because the note has no line for "ten minutes from now" and does not
// need one. The vault event that follows a write re-reads the stars WITHOUT
// resetting the reader's place (the queue keys by text, not line).
//
// Keys, the Review page's: Space or Enter turns the card and, once turned,
// grades it Good; 1–4 are the four grades. A typed constellation puts an
// input on the front, and Enter there checks the answer instead.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConstellationMeta, Star } from "../../shared/constellations.ts";
import { isoDate } from "../../shared/routine.ts";
import type { Grade } from "../../shared/srs.ts";
import type { Pick, Preview } from "../../shared/srsSession.ts";
import { getConstellations, getStars, reviewStar } from "../api.ts";
import { countPhrase, localeNum, t } from "../i18n.ts";
import { st, stf } from "./copy.ts";
import { landOnLine } from "../landing.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { starsTabFor } from "../workspace.ts";
import Face from "./Face.tsx";
import { headOf, StarQueue } from "./queue.ts";
import { diffAnswer, type DiffOp } from "./typed.ts";

const VAULT_EVENT = "astrolabe:vault";
const GRADES: Grade[] = ["again", "hard", "good", "easy"];
const GRADE_LABEL = { again: "starsAgain", hard: "starsHard", good: "starsGood", easy: "starsEasy" } as const;

/** "10m", "2h", "4d" — a preview on a grade button. */
function previewText(p: Preview): string {
  if (p.unit === "days") return stf("starsInDays", { n: localeNum(p.n) });
  if (p.n >= 60 * 24) return stf("starsInDays", { n: localeNum(Math.round(p.n / (60 * 24))) });
  if (p.n >= 60) return stf("starsInHours", { n: localeNum(Math.round(p.n / 60)) });
  return stf("starsInMinutes", { n: localeNum(p.n) });
}

function msText(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  return stf("starsInMinutes", { n: localeNum(min) });
}

function kindLabel(p: Pick): string {
  if (p.kind === "new") return st("starsKindNew");
  if (p.kind === "review") return st("starsKindReview");
  return p.relearn ? st("starsKindRelearn") : st("starsKindLearning");
}

function Diff({ ops }: { ops: DiffOp[] }) {
  return (
    <span className="s-session__diff" dir="auto">
      {ops.map((op, i) => (
        <span key={i} className={`s-session__diff--${op.kind}`}>
          {op.text}
        </span>
      ))}
    </span>
  );
}

export default function SessionView({ path, section }: { path: string; section: string | null }) {
  const [meta, setMeta] = useState<ConstellationMeta | null | "gone">(null);
  const [stars, setStars] = useState<Star[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [queue, setQueue] = useState<StarQueue | null>(null);
  const [tick, setTick] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState<ReturnType<typeof diffAnswer> | null>(null);
  const openStars = useStore((s) => s.openStars);
  const closeTab = useStore((s) => s.closeTab);
  const today = isoDate(new Date());
  const page = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const bump = useCallback((): void => setTick((n) => n + 1), []);

  const loadStars = useCallback((): Promise<Star[]> => getStars(path, section), [path, section]);

  useEffect(() => {
    let alive = true;
    Promise.all([getConstellations(), loadStars()])
      .then(([list, s]) => {
        if (!alive) return;
        const m = list.find((c) => c.path === path) ?? null;
        setMeta(m ?? "gone");
        setStars(s);
        setFailed(false);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [path, loadStars]);

  // The queue is built ONCE, from the first read; later reads refresh the
  // stars under it.
  useEffect(() => {
    if (queue !== null || meta === null || meta === "gone" || stars === null) return;
    setQueue(new StarQueue(headOf(meta), stars, today));
  }, [queue, meta, stars, today]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onVault = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        loadStars()
          .then((s) => {
            setStars(s);
            queue?.refresh(s);
            bump();
          })
          .catch(() => {});
      }, 250);
    };
    window.addEventListener(VAULT_EVENT, onVault);
    return () => {
      window.removeEventListener(VAULT_EVENT, onVault);
      if (timer) clearTimeout(timer);
    };
  }, [loadStars, queue, bump]);

  // `tick` is what makes the queue's mutations visible; the memo reads it.
  const current = useMemo(() => (queue ? queue.next() : null), [queue, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const previews = useMemo(() => (queue && current ? queue.previews(current.pick, current.star) : null), [queue, current]);
  const typedKind = meta !== null && meta !== "gone" && meta.kind === "typed" && current?.star.kind === "qa";

  const reset = useCallback((): void => {
    setRevealed(false);
    setTyped("");
    setChecked(null);
  }, []);

  const grade = useCallback(
    async (g: Grade): Promise<void> => {
      if (!queue) return;
      const done = queue.grade(g);
      reset();
      bump();
      if (!done) return;
      if (done.write !== null) {
        try {
          await reviewStar(done.star.path, done.star.line, done.star.dir, g, today);
        } catch {
          toast(st("starsSaveFailed"), "error");
        }
      }
    },
    [queue, reset, bump, today],
  );

  const undo = useCallback(async (): Promise<void> => {
    if (!queue) return;
    const back = queue.undoLast();
    reset();
    bump();
    if (!back || !back.wrote) return;
    try {
      // The grade rides along for a server that predates `restore`: the
      // worst case is then a re-grade, never a lost star.
      await reviewStar(back.star.path, back.star.line, back.star.dir, back.grade, today, back.restore);
    } catch {
      toast(st("starsUndoFailed"), "error");
    }
  }, [queue, reset, bump, today]);

  const skip = useCallback((): void => {
    queue?.skip();
    reset();
    bump();
  }, [queue, reset, bump]);

  const reveal = useCallback((): void => {
    if (typedKind && current && checked === null) setChecked(diffAnswer(typed, current.star.back));
    setRevealed(true);
  }, [typedKind, current, checked, typed]);

  const studyAhead = useCallback((): void => {
    if (meta === null || meta === "gone" || stars === null) return;
    setQueue(new StarQueue(headOf(meta), stars, today, true));
    reset();
  }, [meta, stars, today, reset]);

  const studyMore = useCallback((): void => {
    if (meta === null || meta === "gone" || stars === null) return;
    // A fresh walk over what is still due (a lapse leaves stars due today)
    // and, when nothing is, the ones due soonest.
    const again = new StarQueue(headOf(meta), stars, today, false);
    setQueue(again.isEmpty() ? new StarQueue(headOf(meta), stars, today, true) : again);
    reset();
  }, [meta, stars, today, reset]);

  const backToShelf = useCallback((): void => {
    openStars(null);
    closeTab(starsTabFor(path, section));
  }, [openStars, closeTab, path, section]);

  // The page answers the keyboard while it has focus. Scoped to the element
  // so a note in the other pane keeps its own keys; the typed input keeps
  // Enter for itself and hands everything else up.
  useEffect(() => {
    const el = page.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("button, a, textarea, select")) return;
      if (target?.closest("input") && !(target as HTMLInputElement).classList.contains("s-session__input")) return;
      if (!current) return;
      const inInput = target?.classList.contains("s-session__input") === true;
      if (e.key === "Enter" || (e.key === " " && !inInput)) {
        e.preventDefault();
        if (!revealed) reveal();
        else void grade("good");
      } else if (/^[1-4]$/.test(e.key) && revealed && !inInput) {
        e.preventDefault();
        void grade(GRADES[Number(e.key) - 1]);
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [current, revealed, grade, reveal]);

  // Focus: the page for its keys, the input when the star wants typing.
  useEffect(() => {
    if (!current) return;
    if (typedKind && !revealed) input.current?.focus();
    else if (!page.current?.contains(document.activeElement)) page.current?.focus({ preventScroll: true });
  }, [current, typedKind, revealed]);

  const title = meta !== null && meta !== "gone" ? (meta.implicit ? st("starsEverything") : meta.title) : "";
  const icon = meta !== null && meta !== "gone" ? meta.icon : null;
  const progress = queue ? queue.progress() : { done: 0, total: 0 };
  const crumbSection = section ?? current?.star.section ?? null;

  let body: React.JSX.Element;
  if (failed) {
    body = <p className="s-stars__empty">{st("starsFailed")}</p>;
  } else if (meta === "gone") {
    body = (
      <div className="s-stars__empty">
        <p className="s-stars__emptytext">{st("starsGone")}</p>
        <button type="button" className="s-btn s-session__backbtn" onClick={backToShelf}>
          {st("starsBack")}
        </button>
      </div>
    );
  } else if (!queue || !stars) {
    body = <div className="s-session__card s-session__card--loading" aria-busy="true" />;
  } else if (current === null) {
    // The session is over. When an orbit slot names this constellation and
    // nothing is due here any more, the Orbits integration ticks that slot
    // for today — one call to client/routines' helper, made here once that
    // export lands (CONSTELLATIONS-SPEC.md, "Orbits integration").
    const summary = queue.summary();
    if (stars.length === 0) {
      body = (
        <div className="s-stars__empty">
          <p className="s-stars__emptytext">{st("starsNothingToStudy")}</p>
          <p className="s-stars__emptyhint">{st("starsNothingToStudyHint")}</p>
          <button type="button" className="s-btn s-session__backbtn" onClick={backToShelf}>
            {st("starsBack")}
          </button>
        </div>
      );
    } else {
      const pct = summary.graded === 0 ? null : Math.round((summary.kept / summary.graded) * 100);
      const mm = Math.floor(summary.seconds / 60);
      const ss = String(summary.seconds % 60).padStart(2, "0");
      body = (
        <section className="s-session__summary" data-testid="session-summary" aria-live="polite">
          <h2 className="s-session__summaryhead">{st("starsDone")}</h2>
          <p className="s-session__summarylead">{st("starsDoneHint")}</p>
          {summary.graded > 0 && (
            <dl className="s-session__stats">
              <div className="s-session__stat">
                <dt>{st("starsStatGraded")}</dt>
                <dd>{countPhrase(summary.graded, "stars")}</dd>
              </div>
              <div className="s-session__stat">
                <dt>{st("starsStatRetention")}</dt>
                <dd>{pct === null ? "—" : stf("starsPercent", { n: localeNum(pct) })}</dd>
              </div>
              <div className="s-session__stat">
                <dt>{st("starsStatTime")}</dt>
                <dd dir="ltr">{`${localeNum(mm)}:${ss}`}</dd>
              </div>
            </dl>
          )}
          {summary.again.length > 0 && (
            <div className="s-session__againlist">
              <h3 className="s-session__againhead">{st("starsAgainList")}</h3>
              <ul>
                {summary.again.map((s) => (
                  <li key={s.id}>
                    <button type="button" className="s-session__againrow" onClick={() => landOnLine(s.path, s.line)} dir="auto">
                      {s.front}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="s-session__summaryactions">
            {summary.graded > 0 ? (
              <button type="button" className="s-btn s-btn--accent" onClick={studyMore}>
                {st("starsStudyMore")}
              </button>
            ) : (
              <button type="button" className="s-btn s-btn--accent" onClick={studyAhead} data-testid="session-ahead">
                {st("starsStudyAhead")}
              </button>
            )}
            <button type="button" className="s-btn" onClick={backToShelf}>
              {st("starsBack")}
            </button>
          </div>
        </section>
      );
    }
  } else {
    const { pick, star } = current;
    const early = queue.earlyBy();
    body = (
      <>
        <article className={`s-session__card${revealed ? " s-session__card--open" : ""}`} data-testid="session-card" data-kind={star.kind} data-dir={star.dir}>
          <div className="s-session__meta">
            <span className={`s-session__kind s-session__kind--${pick.kind}`}>{kindLabel(pick)}</span>
            {early > 0 && <span className="s-session__early">{stf("starsEarly", { n: msText(early) })}</span>}
            <span className="s-session__spacer" />
            <button type="button" className="s-session__action" onClick={() => landOnLine(star.path, star.line)} title={st("starsEditTitle")}>
              {st("starsEdit")}
            </button>
            <button type="button" className="s-session__action" onClick={skip} title={st("starsSkipTitle")}>
              {st("starsSkip")}
            </button>
            <button type="button" className="s-session__action" onClick={() => void undo()} disabled={!queue.canUndo()} title={st("starsUndoTitle")}>
              {st("starsUndo")}
            </button>
          </div>
          <Face md={star.front} path={star.path} className="s-session__front" />
          {typedKind && (
            <form
              className="s-session__typed"
              onSubmit={(e) => {
                e.preventDefault();
                if (!revealed) reveal();
              }}
            >
              <input
                ref={input}
                className="s-session__input"
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={st("starsTypedPlaceholder")}
                aria-label={st("starsTypedPlaceholder")}
                disabled={revealed}
                dir="auto"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              {!revealed && (
                <button type="submit" className="s-btn s-btn--accent s-session__check">
                  {st("starsCheck")}
                </button>
              )}
            </form>
          )}
          {revealed ? (
            <div className="s-session__answer" key={star.id}>
              {checked && (
                <p className={`s-session__verdict s-session__verdict--${checked.ok ? "ok" : "no"}`} role="status">
                  <b>{checked.ok ? st("starsTypedRight") : st("starsTypedWrong")}</b>
                  {!checked.ok && (
                    <>
                      {" · "}
                      <span className="s-session__verdictlabel">{st("starsYourAnswer")}</span> <Diff ops={checked.ops} />
                    </>
                  )}
                </p>
              )}
              <hr className="s-session__rule" />
              <Face md={star.back} path={star.path} className="s-session__back" />
              {star.extra && <Face md={star.extra} path={star.path} className="s-session__extra" />}
            </div>
          ) : (
            !typedKind && (
              <button type="button" className="s-btn s-btn--accent s-session__show" onClick={reveal} data-testid="session-show">
                {st("starsShow")}
              </button>
            )
          )}
        </article>
        {revealed && previews && (
          <div className="s-session__grades" role="group" aria-label={st("starsStudy")}>
            {GRADES.map((g, i) => (
              <button key={g} type="button" className={`s-btn s-session__grade s-session__grade--${g}`} onClick={() => void grade(g)} data-testid={`grade-${g}`}>
                <span className="s-session__gradekey" aria-hidden="true">
                  {localeNum(i + 1)}
                </span>
                <span className="s-session__gradelabel">{st(GRADE_LABEL[g])}</span>
                <span className="s-session__gradein">{previewText(previews[g])}</span>
              </button>
            ))}
          </div>
        )}
        <p className="s-session__keys">{st("starsKeysHint")}</p>
      </>
    );
  }

  return (
    <div className="s-stars s-session" data-testid="stars-session" ref={page} tabIndex={-1}>
      <header className="s-session__head">
        <nav className="s-session__crumbs" aria-label={t("stars")}>
          <button type="button" className="s-session__crumb s-session__crumb--back" onClick={backToShelf}>
            <span className="s-session__chev" aria-hidden="true">‹</span> {t("stars")}
          </button>
          {title && (
            <>
              <span className="s-session__crumbsep s-session__chev" aria-hidden="true">
                ›
              </span>
              <span className="s-session__crumb s-session__crumb--title" dir="auto">
                {icon && (
                  <span className="s-session__icon" aria-hidden="true">
                    {icon}
                  </span>
                )}
                {title}
              </span>
            </>
          )}
          {crumbSection && (
            <>
              <span className="s-session__crumbsep s-session__chev" aria-hidden="true">
                ›
              </span>
              <span className="s-session__crumb s-session__crumb--section" dir="auto">
                {crumbSection}
              </span>
            </>
          )}
        </nav>
        {progress.total > 0 && (
          <div className="s-session__progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label={stf("starsProgress", { done: localeNum(progress.done), total: localeNum(progress.total) })}>
            <span className="s-session__bar" style={{ inlineSize: `${Math.round((progress.done / progress.total) * 100)}%` }} />
            <span className="s-session__progresstext">{stf("starsProgress", { done: localeNum(progress.done), total: localeNum(progress.total) })}</span>
          </div>
        )}
      </header>
      {body}
    </div>
  );
}
