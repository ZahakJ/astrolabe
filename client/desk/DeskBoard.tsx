// THE DESK'S CONTENT — the filters, the board, the list and the series
// lanes, mounted by both shells (./DeskView.tsx on the desktop,
// client/phone/screens/DeskScreen.tsx on a phone). Each shell draws its own
// frame around it.
//
// THREE WAYS TO MOVE A CARD, and every one ends in the same write
// (./actions.ts moveTo):
//   · drag it by the pointer onto another column (a mouse or a pen — a finger
//     scrolls the page instead, and has the pill below);
//   · from the keyboard: Space lifts the focused card, the arrows walk it
//     between columns in the reading direction, Space drops it and Escape
//     puts it back, each step said in a live region;
//   · the status pill on every card, a short menu of the seven columns.
// A drop on Published never publishes by itself: it asks, and only the ✦
// flow's answer puts the piece on the site.

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  boardColumns,
  DESK_STATUSES,
  isOverdue,
  NO_SERIES,
  nextStepOf,
  seriesLanes,
  type DeskData,
  type DeskPiece,
  type DeskStatus,
  type Lane,
} from "../../shared/desk.ts";
import { goalProgress } from "../../shared/wordGoal.ts";
import { localIsoDay } from "../../shared/dates.ts";
import { relativeDate, siteDate } from "../dates.ts";
import { countPhrase, localeNum, t, tf } from "../i18n.ts";
import { useStore } from "../state.ts";
import type { DeskState, DeskView } from "./hooks.ts";
import { moveTo, startPlanned } from "./actions.ts";
import { openNewPiece } from "./door.ts";
import { langLabel, nextStepText, statusLabel } from "./words.ts";
import { StatusPill } from "./StatusPill.tsx";
import "./desk.css";

const todayIso = (): string => localIsoDay();

function dueText(due: string, locale: string): string {
  const [y, m, d] = due.split("-").map(Number);
  return siteDate(new Date(y, m - 1, d), locale, { dateStyle: "medium" });
}

// ───────────────────────────────────────────────────────────── a card

interface CardProps {
  piece: DeskPiece;
  seriesTitle: string | null;
  today: string;
  lifted: boolean;
  onOpen: (path: string) => void;
  onMove: (piece: DeskPiece, to: DeskStatus) => void;
  onKey?: (e: ReactKeyboardEvent<HTMLElement>, piece: DeskPiece) => void;
  onPointerDown?: (e: ReactPointerEvent<HTMLElement>, piece: DeskPiece) => void;
  compact?: boolean;
}

function Words({ piece }: { piece: DeskPiece }) {
  if (piece.goal === null) return <span className="s-desk-card__words">{countPhrase(piece.words, "words")}</span>;
  const pct = goalProgress(piece.words, piece.goal);
  return (
    <span className="s-desk-card__words s-desk-card__words--goal">
      <span>{tf("deskWordsOfGoal", { words: localeNum(piece.words), goal: countPhrase(piece.goal, "words") })}</span>
      <span
        className="s-desk-card__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct * 100)}
        aria-label={t("deskWordTarget")}
      >
        <span style={{ inlineSize: `${pct * 100}%` }} />
      </span>
    </span>
  );
}

function Card({ piece, seriesTitle, today, lifted, onOpen, onMove, onKey, onPointerDown, compact = false }: CardProps) {
  const locale = useStore((s) => s.blogLocale);
  const next = nextStepOf(piece);
  const late = isOverdue(piece, today);
  return (
    <article
      className={`s-desk-card${lifted ? " s-desk-card--lifted" : ""}${compact ? " s-desk-card--compact" : ""}`}
      data-path={piece.path}
      data-stage={piece.stage}
      tabIndex={0}
      aria-roledescription={t("deskCardRole")}
      aria-label={piece.title}
      onKeyDown={(e) => onKey?.(e, piece)}
      onPointerDown={(e) => onPointerDown?.(e, piece)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, a")) return;
        onOpen(piece.path);
      }}
    >
      <h3 className="s-desk-card__title" dir="auto">
        {piece.title}
      </h3>
      {piece.angle !== "" && (
        <p className="s-desk-card__angle" dir="auto">
          {piece.angle}
        </p>
      )}
      {(seriesTitle !== null || piece.lang !== null || piece.due !== null) && (
        <p className="s-desk-card__tags">
          {seriesTitle !== null && (
            <span className="s-desk-card__series" dir="auto">
              {seriesTitle}
            </span>
          )}
          {piece.lang !== null && <span className="s-desk-card__lang">{langLabel(piece.lang)}</span>}
          {piece.due !== null && (
            <span className={`s-desk-card__lang s-desk-card__due${late ? " s-desk-card__due--late" : ""}`}>
              {tf(late ? "deskOverdue" : "deskDue", { date: dueText(piece.due, locale) })}
            </span>
          )}
        </p>
      )}
      <Words piece={piece} />
      <p className="s-desk-card__next" dir="auto">
        <span className="s-desk-card__nextlabel">{t("deskNextLabel")}</span> {nextStepText(next)}
      </p>
      {piece.status === "published" && !piece.published && <p className="s-desk-card__warn">{t("deskNotOut")}</p>}
      <div className="s-desk-card__foot">
        <span className="s-desk-card__when" title={tf("deskTouched", { when: relativeDate(piece.mtimeMs, locale, { dateStyle: "medium" }) })}>
          {relativeDate(piece.mtimeMs, locale, { dateStyle: "medium" })}
        </span>
        <StatusPill piece={piece} onMove={(to) => onMove(piece, to)} />
      </div>
    </article>
  );
}

// ───────────────────────────────────────────────────────────── the board

interface Lift {
  path: string;
  /** The column the lifted card is over, keyboard or pointer. */
  over: DeskStatus;
  /** Pointer drags: the card's offset from where it started. */
  dx: number;
  dy: number;
  by: "pointer" | "keyboard";
}

function Board({ data, pieces, phone, onOpen, onMoved }: { data: DeskData; pieces: DeskPiece[]; phone: boolean; onOpen: (path: string) => void; onMoved: () => void }) {
  const columns = useMemo(() => boardColumns(pieces), [pieces]);
  const titles = useMemo(() => new Map(data.series.map((s) => [s.path, s.title])), [data]);
  const [lift, setLift] = useState<Lift | null>(null);
  const [said, setSaid] = useState("");
  const liftRef = useRef<Lift | null>(null);
  liftRef.current = lift;
  const drag = useRef<{ piece: DeskPiece; x: number; y: number; id: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const today = todayIso();
  const pieceAt = (path: string): DeskPiece | undefined => pieces.find((p) => p.path === path);

  const move = useCallback(
    async (piece: DeskPiece, to: DeskStatus) => {
      if (await moveTo(piece, to)) onMoved();
    },
    [onMoved],
  );

  const seriesTitleOf = (p: DeskPiece): string | null => (p.series !== null ? (titles.get(p.series) ?? null) : p.seriesRef);

  // ── the keyboard lift ──
  const onKey = (e: ReactKeyboardEvent<HTMLElement>, piece: DeskPiece): void => {
    if (e.target !== e.currentTarget) return;
    const cur = liftRef.current;
    if (e.key === "Enter" && cur === null) {
      e.preventDefault();
      onOpen(piece.path);
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      if (cur === null) {
        setLift({ path: piece.path, over: piece.stage, dx: 0, dy: 0, by: "keyboard" });
        setSaid(tf("deskLifted", { name: piece.title, status: statusLabel(piece.stage) }));
      } else {
        setLift(null);
        if (cur.over !== piece.stage) {
          setSaid(tf("deskDropped", { name: piece.title, status: statusLabel(cur.over) }));
          void move(piece, cur.over);
        } else setSaid(t("deskMoveCancelled"));
      }
      return;
    }
    if (cur === null) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setLift(null);
      setSaid(t("deskMoveCancelled"));
      return;
    }
    const rtl = e.currentTarget.closest("[dir]")?.getAttribute("dir") === "rtl";
    const step = e.key === "ArrowRight" ? (rtl ? -1 : 1) : e.key === "ArrowLeft" ? (rtl ? 1 : -1) : e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const at = DESK_STATUSES.indexOf(cur.over);
    const over = DESK_STATUSES[Math.max(0, Math.min(DESK_STATUSES.length - 1, at + step))];
    setLift({ ...cur, over });
    setSaid(tf("deskOverColumn", { status: statusLabel(over) }));
  };

  // ── the pointer drag ──
  const columnAt = (x: number, y: number): DeskStatus | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-column]");
    const s = el?.dataset.column;
    return s && (DESK_STATUSES as readonly string[]).includes(s) ? (s as DeskStatus) : null;
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>, piece: DeskPiece): void => {
    // A finger scrolls; it moves a card with the pill.
    if (phone || e.pointerType === "touch" || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, a, [role=menu]")) return;
    drag.current = { piece, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
  };
  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      const d = drag.current;
      if (d === null || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 6) return;
      d.moved = true;
      e.preventDefault();
      setLift({ path: d.piece.path, over: columnAt(e.clientX, e.clientY) ?? d.piece.stage, dx, dy, by: "pointer" });
    };
    const onUp = (e: PointerEvent): void => {
      const d = drag.current;
      if (d === null || e.pointerId !== d.id) return;
      drag.current = null;
      if (!d.moved) return;
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      const over = columnAt(e.clientX, e.clientY);
      setLift(null);
      if (over !== null && over !== d.piece.stage) void move(d.piece, over);
    };
    const onCancel = (): void => {
      drag.current = null;
      setLift((cur) => (cur?.by === "pointer" ? null : cur));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [move]);

  const open = (path: string): void => {
    if (suppressClick.current) return;
    onOpen(path);
  };
  const lifted = lift === null ? null : pieceAt(lift.path) ?? null;

  return (
    <>
      <div className={`s-desk-board${phone ? " s-desk-board--stacked" : ""}${lift !== null ? " s-desk-board--lifting" : ""}`} data-testid="desk-board">
        {columns.map((col) => {
          const over = lift !== null && lift.over === col.status && lifted !== null && lifted.stage !== col.status;
          return (
            <section
              key={col.status}
              className={`s-desk-col${over ? " s-desk-col--over" : ""}`}
              data-column={col.status}
              aria-label={statusLabel(col.status)}
            >
              <h2 className="s-desk-col__head">
                <span className="s-desk-pill__dot" data-stage={col.status} aria-hidden="true" />
                <span className="s-desk-col__name">{statusLabel(col.status)}</span>
                <span className="s-desk-col__count">{localeNum(col.pieces.length)}</span>
              </h2>
              <div className="s-desk-col__cards">
                {col.pieces.map((p) => (
                  <div
                    key={p.path}
                    className="s-desk-slot"
                    style={lift?.path === p.path && lift.by === "pointer" ? { transform: `translate(${lift.dx}px, ${lift.dy}px)` } : undefined}
                  >
                    <Card
                      piece={p}
                      seriesTitle={seriesTitleOf(p)}
                      today={today}
                      lifted={lift?.path === p.path}
                      onOpen={open}
                      onMove={(piece, to) => void move(piece, to)}
                      onKey={onKey}
                      onPointerDown={onPointerDown}
                    />
                  </div>
                ))}
                {over && lifted !== null && <div className="s-desk-col__socket" aria-hidden="true" />}
                {col.pieces.length === 0 && !over && <p className="s-desk-col__empty">{t("deskColumnEmpty")}</p>}
              </div>
            </section>
          );
        })}
      </div>
      <p className="s-sr-only" aria-live="polite">
        {said}
      </p>
    </>
  );
}

// ───────────────────────────────────────────────────────────── the list

function List({ data, pieces, onOpen, onMoved }: { data: DeskData; pieces: DeskPiece[]; onOpen: (path: string) => void; onMoved: () => void }) {
  const locale = useStore((s) => s.blogLocale);
  const columns = useMemo(() => boardColumns(pieces).filter((c) => c.pieces.length > 0), [pieces]);
  const titles = useMemo(() => new Map(data.series.map((s) => [s.path, s.title])), [data]);
  const today = todayIso();
  return (
    <div className="s-desk-list" data-testid="desk-list">
      {columns.map((col) => (
        <section key={col.status} className="s-desk-list__group" aria-label={statusLabel(col.status)}>
          <h2 className="s-desk-list__head">
            <span className="s-desk-pill__dot" data-stage={col.status} aria-hidden="true" />
            <span>{statusLabel(col.status)}</span>
            <span className="s-desk-col__count">{localeNum(col.pieces.length)}</span>
          </h2>
          <ul className="s-desk-list__rows">
            {col.pieces.map((p) => {
              const series = p.series !== null ? (titles.get(p.series) ?? null) : p.seriesRef;
              return (
                <li key={p.path} className="s-desk-row" data-path={p.path}>
                  <button type="button" className="s-desk-row__open" onClick={() => onOpen(p.path)}>
                    <span className="s-desk-row__title" dir="auto">
                      {p.title}
                    </span>
                    {p.angle !== "" && (
                      <span className="s-desk-row__angle" dir="auto">
                        {p.angle}
                      </span>
                    )}
                    <span className="s-desk-row__meta">
                      {series !== null && <span dir="auto">{series}</span>}
                      <span>{p.goal !== null ? tf("deskWordsOfGoal", { words: localeNum(p.words), goal: countPhrase(p.goal, "words") }) : countPhrase(p.words, "words")}</span>
                      <span>{relativeDate(p.mtimeMs, locale, { dateStyle: "medium" })}</span>
                      {p.due !== null && <span className={isOverdue(p, today) ? "s-desk-card__due--late" : undefined}>{tf(isOverdue(p, today) ? "deskOverdue" : "deskDue", { date: dueText(p.due, locale) })}</span>}
                    </span>
                  </button>
                  <StatusPill
                    piece={p}
                    onMove={(to) =>
                      void moveTo(p, to).then((ok) => {
                        if (ok) onMoved();
                      })
                    }
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────── the lanes

function LaneView({ lane, onOpen, onMoved }: { lane: Lane; onOpen: (path: string) => void; onMoved: () => void }) {
  const pct = lane.total === 0 ? 0 : lane.drafted / lane.total;
  return (
    <section className="s-desk-lane" aria-label={lane.title} data-lane={lane.key}>
      <header className="s-desk-lane__head">
        <div className="s-desk-lane__titles">
          {lane.series !== null ? (
            <button type="button" className="s-desk-lane__title" dir="auto" onClick={() => onOpen(lane.series!.path)}>
              {lane.title}
            </button>
          ) : (
            <span className="s-desk-lane__title s-desk-lane__title--bare" dir="auto">
              {lane.title}
            </span>
          )}
          {lane.series !== null && lane.series.description !== "" && (
            <p className="s-desk-lane__desc" dir="auto">
              {lane.series.description}
            </p>
          )}
          {lane.series === null && <p className="s-desk-lane__desc">{t("deskSeriesNoNote")}</p>}
        </div>
        <div className="s-desk-lane__progress">
          <span>{tf("deskSeriesProgress", { drafted: localeNum(lane.drafted), total: localeNum(lane.total) })}</span>
          {lane.published > 0 && <span className="s-desk-lane__pub">{tf("deskSeriesPublished", { n: localeNum(lane.published) })}</span>}
          <span className="s-desk-card__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} aria-label={t("deskSeriesBar")}>
            <span style={{ inlineSize: `${pct * 100}%` }} />
          </span>
        </div>
      </header>
      {lane.entries.length === 0 ? (
        <p className="s-desk-lane__empty">{t("deskSeriesEmpty")}</p>
      ) : (
        <ol className="s-desk-lane__entries">
          {lane.entries.map((e, i) => (
            <li key={`${i}:${e.kind === "piece" ? e.piece.path : e.ref}`} className={`s-desk-entry s-desk-entry--${e.kind}`}>
              <span className="s-desk-entry__n">{localeNum(i + 1)}</span>
              {e.kind === "piece" && (
                <>
                  <button type="button" className="s-desk-entry__open" onClick={() => onOpen(e.piece.path)}>
                    <span className="s-desk-entry__title" dir="auto">
                      {e.piece.title}
                    </span>
                    {e.piece.angle !== "" && (
                      <span className="s-desk-entry__angle" dir="auto">
                        {e.piece.angle}
                      </span>
                    )}
                  </button>
                  <StatusPill
                    piece={e.piece}
                    onMove={(to) =>
                      void moveTo(e.piece, to).then((ok) => {
                        if (ok) onMoved();
                      })
                    }
                  />
                </>
              )}
              {e.kind === "note" && (
                <button type="button" className="s-desk-entry__open" onClick={() => onOpen(e.path)}>
                  <span className="s-desk-entry__title" dir="auto">
                    {e.ref}
                  </span>
                  <span className="s-desk-entry__angle">{t("deskEntryNote")}</span>
                </button>
              )}
              {e.kind === "planned" && (
                <>
                  <span className="s-desk-entry__open s-desk-entry__open--planned">
                    <span className="s-desk-entry__title" dir="auto">
                      {e.ref}
                    </span>
                    <span className="s-desk-entry__angle">{t("deskPlanned")}</span>
                  </span>
                  {lane.series !== null && (
                    <button type="button" className="s-btn s-desk-entry__start" onClick={() => void startPlanned(e.ref, lane.series!.path)}>
                      {t("deskStartPlanned")}
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Lanes({ data, onOpen, onMoved, filterSeries }: { data: DeskData; onOpen: (path: string) => void; onMoved: () => void; filterSeries: string | null }) {
  const lanes = useMemo(() => seriesLanes(data).filter((l) => filterSeries === null || filterSeries === NO_SERIES || l.key === filterSeries), [data, filterSeries]);
  if (lanes.length === 0) {
    return (
      <div className="s-desk-empty">
        <p>{t("deskNoSeries")}</p>
        <button type="button" className="s-btn" onClick={() => openNewPiece("series")}>
          {t("deskNewSeries")}
        </button>
      </div>
    );
  }
  return (
    <div className="s-desk-lanes" data-testid="desk-lanes">
      {lanes.map((lane) => (
        <LaneView key={lane.key} lane={lane} onOpen={onOpen} onMoved={onMoved} />
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────── filters

function Filters({ state, phone }: { state: DeskState; phone: boolean }) {
  const { data, filter, setFilter, view, setView } = state;
  const views: { value: DeskView; label: string }[] = [
    { value: "board", label: t("deskViewBoard") },
    { value: "list", label: t("deskViewList") },
    { value: "series", label: t("deskViewSeries") },
  ];
  const active = filter.series !== null || filter.lang !== null || filter.status !== null;
  return (
    <div className="s-desk-bar">
      <div className="s-desk-views" role="radiogroup" aria-label={t("deskViewLabel")}>
        {views.map((v) => (
          <button
            key={v.value}
            type="button"
            role="radio"
            aria-checked={view === v.value}
            className="s-desk-chip s-desk-view"
            data-view={v.value}
            onClick={() => setView(v.value)}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className="s-desk-filters" role="group" aria-label={t("deskFilters")}>
        <select
          className="s-desk-chip s-desk-select"
          aria-label={t("deskFilterSeries")}
          value={filter.series ?? ""}
          onChange={(e) => setFilter({ ...filter, series: e.target.value === "" ? null : e.target.value })}
        >
          <option value="">{t("deskAllSeries")}</option>
          <option value={NO_SERIES}>{t("deskNoSeriesFilter")}</option>
          {(data?.series ?? []).map((s) => (
            <option key={s.path} value={s.path}>
              {s.title}
            </option>
          ))}
        </select>
        <select
          className="s-desk-chip s-desk-select"
          aria-label={t("deskFilterLang")}
          value={filter.lang ?? ""}
          onChange={(e) => setFilter({ ...filter, lang: e.target.value === "en" || e.target.value === "ar" ? e.target.value : null })}
        >
          <option value="">{t("deskAllLangs")}</option>
          <option value="en">{langLabel("en")}</option>
          <option value="ar">{langLabel("ar")}</option>
        </select>
        {(view === "list" || (view === "board" && phone)) && (
          <select
            className="s-desk-chip s-desk-select"
            aria-label={t("deskFilterStatus")}
            value={filter.status ?? ""}
            onChange={(e) => setFilter({ ...filter, status: e.target.value === "" ? null : (e.target.value as DeskStatus) })}
          >
            <option value="">{t("deskAllStatuses")}</option>
            {DESK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        )}
        {active && (
          <button type="button" className="s-desk-chip s-desk-chip--clear" onClick={() => setFilter({ series: null, lang: null, status: null })}>
            {t("deskClearFilters")}
          </button>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────── the whole

export default function DeskContent({ state, phone = false, onOpen }: { state: DeskState; phone?: boolean; onOpen: (path: string) => void }) {
  const { data, failed, pieces, view, filter, reload } = state;
  useStore((s) => s.language);
  if (data === null) return <p className="s-desk-note">{failed ? t("deskFailed") : t("deskLoading")}</p>;
  const empty = data.pieces.length === 0 && data.series.length === 0;
  return (
    <>
      {!empty && <Filters state={state} phone={phone} />}
      {empty ? (
        <div className="s-desk-empty" data-testid="desk-empty">
          <svg className="s-desk-empty__glyph" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
            <path d="M8 38h32M12 38V24h24v14M16 24v-6h16v6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M30 6 22 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p>{t("deskEmpty")}</p>
          <div className="s-desk-empty__acts">
            <button type="button" className="s-btn s-btn--accent" onClick={() => openNewPiece("essay")}>
              {t("deskNewEssay")}
            </button>
            <button type="button" className="s-btn" onClick={() => openNewPiece("series")}>
              {t("deskNewSeries")}
            </button>
          </div>
        </div>
      ) : view === "series" ? (
        <Lanes data={data} onOpen={onOpen} onMoved={reload} filterSeries={filter.series} />
      ) : pieces.length === 0 ? (
        <p className="s-desk-note">{t("deskEmptyFiltered")}</p>
      ) : view === "list" ? (
        <List data={data} pieces={pieces} onOpen={onOpen} onMoved={reload} />
      ) : (
        <Board data={data} pieces={pieces} phone={phone} onOpen={onOpen} onMoved={reload} />
      )}
    </>
  );
}
