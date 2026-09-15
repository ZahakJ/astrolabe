// THE SESSION. One star at a time, in the middle of the page; the card is
// the hero and everything else — the breadcrumb, the progress bar, the
// three small actions — stays out of its way.
//
// What is on screen is the queue's business (client/orbits/queue.ts); this
// file only asks it for the next star, shows the front, turns the card,
// and hands back a grade. A grade that changes the schedule goes to
// `POST /api/orbits/card/review`, which writes the plugin's comment into the note;
// a grade that only moves the star between learning steps writes nothing,
// because the note has no line for "ten minutes from now" and does not
// need one. Writes go one at a time, and each one is followed by a re-read
// of the stars before the next is sent: the first grade on a cloze or a
// `?` block puts a comment LINE into the note, and a reader who grades the
// next star before that re-read would name a line that has just moved down
// (the server answers 409 and the grade is lost). The re-read does not
// reset the reader's place — the queue keys by text, not line — and the
// vault event that follows a write triggers the same re-read for a write
// made elsewhere.
//
// Keys, the Review page's: Space or Enter turns the card and, once turned,
// grades it Good; 1–4 are the four grades. A typed deck puts an
// input on the front, and Enter there checks the answer instead.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EVERYTHING_ELSE, type DeckMeta, type DeckCard } from "../../shared/decks.ts";
import { isoDate } from "../../shared/routine.ts";
import type { Grade } from "../../shared/srs.ts";
import { getDecks, getDeckCards, reviewDeckCard } from "../api.ts";
import { countPhrase, localeNum, t } from "../i18n.ts";
import { st, stf } from "./copy.ts";
import { landOnLine } from "../landing.ts";
import { tickSlotForDeck } from "../routines/orbits.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { orbitsTabFor } from "../workspace.ts";
import Face from "./Face.tsx";
import { headOf, CardQueue, type Pick, type Preview } from "./queue.ts";
import { diffAnswer, type DiffOp } from "./typed.ts";

const VAULT_EVENT = "astrolabe:vault";
const GRADES: Grade[] = ["again", "hard", "good", "easy"];
const GRADE_LABEL = { again: "orbitsAgain", hard: "orbitsHard", good: "orbitsGood", easy: "orbitsEasy" } as const;

/** "10m", "2h", "4d" — a preview on a grade button. */
function previewText(p: Preview): string {
  if ("days" in p) return stf("orbitsInDays", { n: localeNum(p.days) });
  if (p.minutes >= 60 * 24) return stf("orbitsInDays", { n: localeNum(Math.round(p.minutes / (60 * 24))) });
  if (p.minutes >= 60) return stf("orbitsInHours", { n: localeNum(Math.round(p.minutes / 60)) });
  return stf("orbitsInMinutes", { n: localeNum(p.minutes) });
}

function msText(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  return stf("orbitsInMinutes", { n: localeNum(min) });
}

function kindLabel(p: Pick): string {
  if (p.phase === "new") return st("orbitsKindNew");
  if (p.phase === "review") return st("orbitsKindReview");
  return p.phase === "relearning" ? st("orbitsKindRelearn") : st("orbitsKindLearning");
}

/** The chip's class: relearning wears learning's colour — the reader is
 *  inside a step either way. */
function kindClass(p: Pick): string {
  return p.phase === "relearning" ? "learning" : p.phase;
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
  const [meta, setMeta] = useState<DeckMeta | null | "gone">(null);
  const [stars, setStars] = useState<DeckCard[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [queue, setQueue] = useState<CardQueue | null>(null);
  const [tick, setTick] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState<ReturnType<typeof diffAnswer> | null>(null);
  const openOrbits = useStore((s) => s.openOrbits);
  const closeTab = useStore((s) => s.closeTab);
  const today = isoDate(new Date());
  const page = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const bump = useCallback((): void => setTick((n) => n + 1), []);
  /** The writes, in order; each waits for the one before it and its re-read. */
  const writes = useRef<Promise<void>>(Promise.resolve());

  const loadCards = useCallback((): Promise<DeckCard[]> => getDeckCards(path, section), [path, section]);

  /** Re-read the stars under the queue's keys. Quiet on failure: the view
   *  keeps what it has, and the next vault event tries again. */
  const reread = useCallback(
    (q: CardQueue | null): Promise<void> =>
      loadCards()
        .then((s) => {
          setStars(s);
          q?.refresh(s);
          bump();
        })
        .catch(() => {}),
    [loadCards, bump],
  );
  const enqueueWrite = useCallback((job: () => Promise<void>): void => {
    writes.current = writes.current.then(job, job);
  }, []);

  useEffect(() => {
    let alive = true;
    // The shelf first: a path that is not on it is not a deck
    // (a plain note's address, a deleted one), and that is told apart from
    // a request that failed — the stars route would 404 either way.
    getDecks(today)
      .then(async (list) => {
        const m = list.find((c) => c.path === path) ?? null;
        const s = m === null ? [] : await loadCards();
        if (!alive) return;
        setMeta(m ?? "gone");
        setStars(s);
        setFailed(false);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [path, loadCards]); // eslint-disable-line react-hooks/exhaustive-deps -- `today` is read once, at open

  // The queue is built ONCE, from the first read; later reads refresh the
  // stars under it.
  useEffect(() => {
    if (queue !== null || meta === null || meta === "gone" || stars === null) return;
    setQueue(new CardQueue(headOf(meta), stars, today));
  }, [queue, meta, stars, today]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onVault = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void reread(queue), 250);
    };
    window.addEventListener(VAULT_EVENT, onVault);
    return () => {
      window.removeEventListener(VAULT_EVENT, onVault);
      if (timer) clearTimeout(timer);
    };
  }, [reread, queue]);

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
    (g: Grade): void => {
      if (!queue) return;
      const done = queue.grade(g);
      reset();
      bump();
      if (!done || done.write === null) return;
      enqueueWrite(async () => {
        // The star as the LAST read has it: its line, not the line it had
        // when the reader first saw it.
        const star = queue.cardOf(done.key) ?? done.star;
        try {
          await reviewDeckCard(star.path, star.line, star.dir, g, today);
        } catch {
          toast(st("orbitsSaveFailed"), "error");
          return;
        }
        await reread(queue);
      });
    },
    [queue, reset, bump, today, enqueueWrite, reread],
  );

  const undo = useCallback((): void => {
    if (!queue) return;
    const back = queue.undoLast();
    reset();
    bump();
    if (!back || !back.wrote) return;
    enqueueWrite(async () => {
      const star = queue.cardOf(back.key) ?? back.star;
      try {
        // `restore` is the schedule the star had before the grade; the
        // server writes it back verbatim (null strips a first grade's
        // comment). The grade rides along for a server that predates
        // `restore`, and such a server answers with a RE-GRADE — the
        // reader is told the note kept the grade rather than shown a
        // queue that disagrees with it.
        const res = await reviewDeckCard(star.path, star.line, star.dir, back.grade, today, back.restore);
        const got = res.schedule;
        const same = back.restore === null ? got === null : got !== null && got.due === back.restore.due && got.interval === back.restore.interval && got.ease === back.restore.ease;
        if (!same) toast(st("orbitsUndoFailed"), "error");
      } catch {
        toast(st("orbitsUndoFailed"), "error");
        return;
      }
      await reread(queue);
    });
  }, [queue, reset, bump, today, enqueueWrite, reread]);

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
    setQueue(new CardQueue(headOf(meta), stars, today, true));
    reset();
  }, [meta, stars, today, reset]);

  const studyMore = useCallback((): void => {
    if (meta === null || meta === "gone" || stars === null) return;
    // A fresh walk over what is still due (a lapse leaves stars due today)
    // and, when nothing is, the ones due soonest.
    const again = new CardQueue(headOf(meta), stars, today, false);
    setQueue(again.isEmpty() ? new CardQueue(headOf(meta), stars, today, true) : again);
    reset();
  }, [meta, stars, today, reset]);

  const backToShelf = useCallback((): void => {
    openOrbits(null);
    closeTab(orbitsTabFor(path, section));
  }, [openOrbits, closeTab, path, section]);

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
        else grade("good");
      } else if (/^[1-4]$/.test(e.key) && revealed && !inInput) {
        e.preventDefault();
        grade(GRADES[Number(e.key) - 1]);
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [current, revealed, grade, reveal]);

  // The end of a session, once per walk. When a sigil slot names this
  // deck and nothing is due here any more, the slot is ticked for
  // today through client/routines' helper — an effect and not part of the
  // render, because a tick is a write. The implicit deck is no
  // note and no slot can link it.
  const ended = useRef<CardQueue | null>(null);
  useEffect(() => {
    if (!queue || current !== null || stars === null || ended.current === queue) return;
    ended.current = queue;
    const summary = queue.summary();
    if (queue.ahead || summary.graded === 0 || summary.dueLeft > 0 || path === EVERYTHING_ELSE) return;
    void tickSlotForDeck(path);
  }, [queue, current, stars, path]);

  // Focus: the page for its keys, the input when the star wants typing.
  useEffect(() => {
    if (!current) return;
    if (typedKind && !revealed) input.current?.focus();
    else if (!page.current?.contains(document.activeElement)) page.current?.focus({ preventScroll: true });
  }, [current, typedKind, revealed]);

  const title = meta !== null && meta !== "gone" ? (meta.implicit ? t("orbitsEverything") : meta.title) : "";
  const icon = meta !== null && meta !== "gone" ? meta.icon : null;
  const progress = queue ? queue.progress() : { done: 0, total: 0 };
  const crumbSection = section ?? current?.star.section ?? null;

  let body: React.JSX.Element;
  if (failed) {
    body = <p className="s-orbits__empty">{st("orbitsFailed")}</p>;
  } else if (meta === "gone") {
    body = (
      <div className="s-orbits__empty">
        <p className="s-orbits__emptytext">{st("orbitsGone")}</p>
        <button type="button" className="s-btn s-session__backbtn" onClick={backToShelf}>
          {st("orbitsBack")}
        </button>
      </div>
    );
  } else if (!queue || !stars) {
    body = <div className="s-session__card s-session__card--loading" aria-busy="true" />;
  } else if (current === null) {
    // The session is over (the effect above has told the orbits).
    const summary = queue.summary();
    if (stars.length === 0) {
      body = (
        <div className="s-orbits__empty">
          <p className="s-orbits__emptytext">{st("orbitsNothingToStudy")}</p>
          <p className="s-orbits__emptyhint">{st("orbitsNothingToStudyHint")}</p>
          <button type="button" className="s-btn s-session__backbtn" onClick={backToShelf}>
            {st("orbitsBack")}
          </button>
        </div>
      );
    } else {
      const pct = summary.graded === 0 ? null : Math.round((summary.kept / summary.graded) * 100);
      const mm = Math.floor(summary.seconds / 60);
      const ss = String(summary.seconds % 60).padStart(2, "0");
      body = (
        <section className="s-session__summary" data-testid="session-summary" aria-live="polite">
          <h2 className="s-session__summaryhead">{st("orbitsDone")}</h2>
          <p className="s-session__summarylead">{summary.dueLeft > 0 ? stf("orbitsDoneLeft", { n: countPhrase(summary.dueLeft, "cards") }) : st("orbitsDoneHint")}</p>
          {summary.graded > 0 && (
            <dl className="s-session__stats">
              <div className="s-session__stat">
                <dt>{st("orbitsStatGraded")}</dt>
                <dd>{countPhrase(summary.graded, "cards")}</dd>
              </div>
              <div className="s-session__stat">
                <dt>{st("orbitsStatRetention")}</dt>
                <dd>{pct === null ? "—" : stf("orbitsPercent", { n: localeNum(pct) })}</dd>
              </div>
              <div className="s-session__stat">
                <dt>{st("orbitsStatTime")}</dt>
                <dd dir="ltr">{`${localeNum(mm)}:${ss}`}</dd>
              </div>
            </dl>
          )}
          {summary.again.length > 0 && (
            <div className="s-session__againlist">
              <h3 className="s-session__againhead">{st("orbitsAgainList")}</h3>
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
            {summary.graded > 0 || summary.dueLeft > 0 ? (
              <button type="button" className="s-btn s-btn--accent" onClick={studyMore}>
                {st("orbitsStudyMore")}
              </button>
            ) : (
              <button type="button" className="s-btn s-btn--accent" onClick={studyAhead} data-testid="session-ahead">
                {st("orbitsStudyAhead")}
              </button>
            )}
            <button type="button" className="s-btn" onClick={backToShelf}>
              {st("orbitsBack")}
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
            <span className={`s-session__kind s-session__kind--${kindClass(pick)}`}>{kindLabel(pick)}</span>
            {early > 0 && <span className="s-session__early">{stf("orbitsEarly", { n: msText(early) })}</span>}
            <span className="s-session__spacer" />
            <button type="button" className="s-session__action" onClick={() => landOnLine(star.path, star.line)} title={st("orbitsEditTitle")}>
              {st("orbitsEdit")}
            </button>
            <button type="button" className="s-session__action" onClick={skip} title={st("orbitsSkipTitle")}>
              {st("orbitsSkip")}
            </button>
            <button type="button" className="s-session__action" onClick={undo} disabled={!queue.canUndo()} title={st("orbitsUndoTitle")}>
              {st("orbitsUndo")}
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
                placeholder={st("orbitsTypedPlaceholder")}
                aria-label={st("orbitsTypedPlaceholder")}
                disabled={revealed}
                dir="auto"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              {!revealed && (
                <button type="submit" className="s-btn s-btn--accent s-session__check">
                  {st("orbitsCheck")}
                </button>
              )}
            </form>
          )}
          {revealed ? (
            <div className="s-session__answer" key={star.id}>
              {checked && (
                <p className={`s-session__verdict s-session__verdict--${checked.ok ? "ok" : "no"}`} role="status">
                  <b>{checked.ok ? st("orbitsTypedRight") : st("orbitsTypedWrong")}</b>
                  {!checked.ok && (
                    <>
                      {" · "}
                      <span className="s-session__verdictlabel">{st("orbitsYourAnswer")}</span> <Diff ops={checked.ops} />
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
                {st("orbitsShow")}
              </button>
            )
          )}
        </article>
        {revealed && previews && (
          <div className="s-session__grades" role="group" aria-label={st("orbitsStudy")}>
            {GRADES.map((g, i) => (
              <button key={g} type="button" className={`s-btn s-session__grade s-session__grade--${g}`} onClick={() => grade(g)} data-testid={`grade-${g}`}>
                <span className="s-session__gradekey" aria-hidden="true">
                  {localeNum(i + 1)}
                </span>
                <span className="s-session__gradelabel">{st(GRADE_LABEL[g])}</span>
                <span className="s-session__gradein">{previewText(previews[g])}</span>
              </button>
            ))}
          </div>
        )}
        <p className="s-session__keys">{st("orbitsKeysHint")}</p>
      </>
    );
  }

  return (
    <div className="s-orbits s-session" data-testid="orbits-session" ref={page} tabIndex={-1}>
      <header className="s-session__head">
        <nav className="s-session__crumbs" aria-label={t("orbits")}>
          <button type="button" className="s-session__crumb s-session__crumb--back" onClick={backToShelf}>
            <span className="s-session__chev" aria-hidden="true">‹</span> {t("orbits")}
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
          <div className="s-session__progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label={stf("orbitsProgress", { done: localeNum(progress.done), total: localeNum(progress.total) })}>
            <span className="s-session__bar" style={{ inlineSize: `${Math.round((progress.done / progress.total) * 100)}%` }} />
            <span className="s-session__progresstext">{stf("orbitsProgress", { done: localeNum(progress.done), total: localeNum(progress.total) })}</span>
          </div>
        )}
      </header>
      {body}
    </div>
  );
}
