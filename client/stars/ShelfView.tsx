// THE SHELF. Every constellation in the vault as a card — its icon, its
// tags, what is due, a month of retention as a small line — with the
// implicit "Everything else" (the cards outside any constellation note,
// by folder) last, the way the Review page used to list the whole vault.
//
// Reads `GET /api/constellations`; re-read on the vault event, because a
// session in the next tab writes schedules into the notes and the counts
// here should say so. Study opens a SESSION TAB (client/workspace.ts) —
// the shelf stays where it is, and the session sits beside it. The
// statistics come from the device's log (client/stars/log.ts) and the
// schedules, nothing stored.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConstellationMeta } from "../../shared/constellations.ts";
import { isoDate } from "../../shared/routine.ts";
import { streakOf } from "../../shared/srsSession.ts";
import { getConstellations } from "../api.ts";
import { ContextMenu, type MenuAnchor, type MenuRow } from "../components/ContextMenu.tsx";
import SiteMark from "../components/SiteMark.tsx";
import { siteDate } from "../dates.ts";
import { countPhrase, localeNum, t } from "../i18n.ts";
import { st, stf } from "./copy.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { STARS_ASK_EVENT, takeStarsAsk, type StarsAsk } from "./ask.ts";
import { readLog, retention, retentionSeries, studyDays, type LogEntry } from "./log.ts";
import NewConstellationModal from "./NewConstellationModal.tsx";
import StatsDrawer from "./StatsDrawer.tsx";

const VAULT_EVENT = "astrolabe:vault";

/** Thirty days of retention as one line. Days without a grade break the
 *  line rather than pulling it to zero — no session is not a failed one. */
function Sparkline({ series }: { series: Array<number | null> }) {
  const w = 120;
  const h = 28;
  const step = w / Math.max(1, series.length - 1);
  const paths: string[] = [];
  let run: string[] = [];
  series.forEach((v, i) => {
    if (v === null) {
      if (run.length > 0) paths.push(run.join(" "));
      run = [];
      return;
    }
    const x = (i * step).toFixed(1);
    const y = (h - 2 - v * (h - 4)).toFixed(1);
    run.push(`${run.length === 0 ? "M" : "L"}${x} ${y}`);
  });
  if (run.length > 0) paths.push(run.join(" "));
  const dots = series.map((v, i) => (v === null ? null : { x: i * step, y: h - 2 - v * (h - 4) })).filter((p): p is { x: number; y: number } => p !== null);
  return (
    <svg className="s-shelf__spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <line x1="0" y1={h - 2} x2={w} y2={h - 2} className="s-shelf__sparkbase" />
      {paths.map((d, i) => (
        <path key={i} d={d} className="s-shelf__sparkline" />
      ))}
      {dots.length === 1 && <circle cx={dots[0].x} cy={dots[0].y} r="2" className="s-shelf__sparkdot" />}
    </svg>
  );
}

function ShelfCard({
  meta,
  log,
  today,
  onStudy,
  onStats,
  onOpen,
}: {
  meta: ConstellationMeta;
  log: LogEntry[];
  today: string;
  onStudy: (section: string | null) => void;
  onStats: () => void;
  onOpen: () => void;
}) {
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const series = useMemo(() => retentionSeries(log, today, 30, meta.path), [log, today, meta.path]);
  const kept = useMemo(() => retention(log, today, 30, meta.path), [log, today, meta.path]);
  const sections = meta.sections.filter((s) => s.total > 0);
  const openSections = (e: { currentTarget: HTMLElement; detail?: number }): void => {
    const r = e.currentTarget.getBoundingClientRect();
    const rtl = getComputedStyle(document.documentElement).direction === "rtl";
    setMenu({ x: rtl ? r.right : r.left, y: r.bottom + 4, fromKeyboard: e.detail === 0 });
  };
  const rows: MenuRow[] = sections.map((s) => ({
    label: stf("starsSectionRow", { name: s.name, due: localeNum(s.due) }),
    onSelect: () => onStudy(s.name),
  }));
  return (
    <article className={`s-shelf__card${meta.implicit ? " s-shelf__card--implicit" : ""}`} data-testid="shelf-card" data-path={meta.path}>
      <header className="s-shelf__cardhead">
        <span className="s-shelf__icon" aria-hidden="true">
          {meta.icon ?? (meta.implicit ? "∗" : "✦")}
        </span>
        <div className="s-shelf__cardtext">
          <h2 className="s-shelf__cardtitle" dir="auto">
            {meta.implicit ? st("starsEverything") : meta.title}
          </h2>
          {meta.implicit ? (
            <p className="s-shelf__cardsub">{st("starsEverythingHint")}</p>
          ) : meta.tags.length > 0 ? (
            <p className="s-shelf__tags" dir="auto">
              {meta.tags.map((tag) => (
                <span key={tag} className="s-shelf__tag">
                  #{tag}
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </header>
      <p className="s-shelf__counts">
        <span className={`s-shelf__stat${meta.counts.due > 0 ? " s-shelf__stat--due" : ""}`}>
          <b>{localeNum(meta.counts.due)}</b> {st("starsDueLabel")}
        </span>
        <span className="s-shelf__stat">
          <b>{localeNum(meta.counts.new)}</b> {st("starsNewLabel")}
        </span>
        <span className="s-shelf__stat">
          <b>{localeNum(meta.counts.total)}</b> {st("starsTotalLabel")}
        </span>
      </p>
      <div className="s-shelf__retention" title={st("starsRetention30")}>
        <Sparkline series={series} />
        <span className="s-shelf__retentionlabel">{kept === null ? st("starsNoGrades") : stf("starsPercent", { n: localeNum(Math.round(kept * 100)) })}</span>
      </div>
      <div className="s-shelf__actions">
        <button
          type="button"
          className="s-btn s-btn--accent s-shelf__study"
          onClick={() => onStudy(null)}
          disabled={meta.counts.total === 0}
          data-testid="shelf-study"
        >
          {st("starsStudy")}
        </button>
        {sections.length > 0 && (
          <button type="button" className="s-btn s-shelf__sections" onClick={openSections} aria-haspopup="menu" aria-expanded={menu !== null}>
            {st("starsStudySection")} <span aria-hidden="true">▾</span>
          </button>
        )}
      </div>
      <footer className="s-shelf__foot">
        <button type="button" className="s-btn s-shelf__small" onClick={onStats} data-testid="shelf-stats">
          {st("starsStats")}
        </button>
        {!meta.implicit && (
          <button type="button" className="s-btn s-shelf__small" onClick={onOpen} title={st("starsOpenNote")}>
            {st("starsOpenNote")}
          </button>
        )}
      </footer>
      {menu && <ContextMenu at={menu} rows={rows} label={st("starsStudySection")} onClose={() => setMenu(null)} />}
    </article>
  );
}

export default function ShelfView() {
  const [all, setAll] = useState<ConstellationMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [modal, setModal] = useState<"new" | "import" | null>(null);
  const [stats, setStats] = useState<ConstellationMeta | null>(null);
  const [log, setLog] = useState<LogEntry[]>(() => readLog());
  const openStars = useStore((s) => s.openStars);
  const openNote = useStore((s) => s.openNote);
  const locale = useStore((s) => s.blogLocale);
  const today = isoDate(new Date());
  const [asked, setAsked] = useState<StarsAsk | null>(null);

  const load = useCallback((): void => {
    getConstellations()
      .then((list) => {
        setAll(list);
        setFailed(false);
      })
      .catch(() => setFailed(true));
    setLog(readLog());
  }, []);

  useEffect(() => {
    load();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onVault = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 250);
    };
    window.addEventListener(VAULT_EVENT, onVault);
    // A session in another tab writes the log; coming back to this tab
    // should show it.
    window.addEventListener("focus", load);
    return () => {
      window.removeEventListener(VAULT_EVENT, onVault);
      window.removeEventListener("focus", load);
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  // The palette's asks. "study" needs the list, so it waits for it — as
  // STATE, not a ref: an ask that arrives while the list is already loaded
  // must still run, and only a state change re-runs the effect.
  const study = useCallback(
    (meta: ConstellationMeta, section: string | null): void => {
      openStars(meta.path, section);
    },
    [openStars],
  );
  useEffect(() => {
    const answer = (ask: StarsAsk): void => {
      if (ask === "new" || ask === "import") setModal(ask);
      else setAsked(ask);
    };
    const pending = takeStarsAsk();
    if (pending) answer(pending);
    const onAsk = (e: Event): void => {
      const ask = (e as CustomEvent<{ ask: StarsAsk }>).detail?.ask;
      takeStarsAsk();
      if (ask) answer(ask);
    };
    window.addEventListener(STARS_ASK_EVENT, onAsk);
    return () => window.removeEventListener(STARS_ASK_EVENT, onAsk);
  }, []);
  useEffect(() => {
    if (asked !== "study" || all === null) return;
    setAsked(null);
    const first = all.find((m) => m.counts.due > 0);
    if (first) study(first, null);
    else toast(st("starsNothingDue"));
  }, [asked, all, study]);

  const sorted = useMemo(() => {
    const list = all ?? [];
    // The implicit one last; the rest as the server lists them (by path).
    return [...list.filter((m) => !m.implicit), ...list.filter((m) => m.implicit && m.counts.total > 0)];
  }, [all]);
  const dueTotal = useMemo(() => sorted.reduce((n, m) => n + m.counts.due, 0), [sorted]);
  const streak = useMemo(() => streakOf(studyDays(log), today), [log, today]);
  const dateLine = siteDate(`${today}T12:00:00`, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="s-stars s-shelf" data-testid="stars-shelf">
      <header className="s-stars__head">
        <div className="s-stars__headtext">
          <p className="s-stars__date">{dateLine}</p>
          <h1 className="s-stars__h1">{t("stars")}</h1>
          <p className="s-stars__lead">
            {all === null ? st("starsLead") : dueTotal === 0 ? st("starsNothingDue") : stf("starsDueToday", { n: countPhrase(dueTotal, "stars") })}
            {streak > 0 ? ` · ${stf("starsStreak", { days: countPhrase(streak, "days") })}` : ""}
          </p>
        </div>
        <div className="s-stars__headactions">
          <button type="button" className="s-btn" onClick={() => setModal("import")} data-testid="shelf-import">
            {st("starsImport")}
          </button>
          <button type="button" className="s-btn s-btn--accent" onClick={() => setModal("new")} data-testid="shelf-new">
            {t("starsNew")}
          </button>
        </div>
      </header>
      {failed ? (
        <p className="s-stars__empty">{st("starsFailed")}</p>
      ) : all !== null && sorted.length === 0 ? (
        <div className="s-stars__empty" data-testid="shelf-empty">
          <span className="s-stars__emptystar" aria-hidden="true">
            <SiteMark size={32} />
          </span>
          <p className="s-stars__emptytext">{st("starsEmpty")}</p>
          <p className="s-stars__emptyhint">{st("starsEmptyHint")}</p>
          <pre className="s-stars__syntax" dir="ltr">
            {"```constellation\nicon: あ\n```\nあ::a\nい::i::the second kana"}
          </pre>
          <p className="s-stars__emptyhint">{st("starsEmptyHint2")}</p>
        </div>
      ) : (
        <div className="s-shelf__grid">
          {sorted.map((meta) => (
            <ShelfCard
              key={meta.path}
              meta={meta}
              log={log}
              today={today}
              onStudy={(section) => study(meta, section)}
              onStats={() => setStats(meta)}
              onOpen={() => openNote(meta.path)}
            />
          ))}
        </div>
      )}
      {modal && (
        <NewConstellationModal
          tab={modal}
          onClose={() => setModal(null)}
          onCreated={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {stats && <StatsDrawer meta={stats} log={log} today={today} onClose={() => setStats(null)} />}
    </div>
  );
}
