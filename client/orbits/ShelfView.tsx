// THE SHELF. Every deck in the vault as a card — its icon, its
// tags, what is due, a month of retention as a small line — with the
// implicit "Everything else" (the cards outside any deck note,
// by folder) last, the way Orbits' first page ("Review", before 3.16) listed the whole vault.
//
// Reads `GET /api/orbits`; re-read on the vault event, because a
// session in the next tab writes schedules into the notes and the counts
// here should say so. Study opens a SESSION TAB (client/workspace.ts) —
// the shelf stays where it is, and the session sits beside it. The
// statistics come from the device's log (client/orbits/log.ts) and the
// schedules, nothing stored.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DeckMeta } from "../../shared/decks.ts";
import { isoDate } from "../../shared/routine.ts";
import { streakOf } from "./stats.ts";
import { getDecks } from "../api.ts";
import { ContextMenu, type MenuAnchor, type MenuRow } from "../components/ContextMenu.tsx";
import SiteMark from "../components/SiteMark.tsx";
import { siteDate } from "../dates.ts";
import { countPhrase, localeNum, t } from "../i18n.ts";
import { st, stf } from "./copy.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { ORBITS_ASK_EVENT, takeOrbitsAsk, type OrbitsAsk } from "./ask.ts";
import { readLog, retention, retentionSeries, studyDays, type LogEntry } from "./log.ts";
import NewDeckModal from "./NewDeckModal.tsx";
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
  meta: DeckMeta;
  log: LogEntry[];
  today: string;
  onStudy: (section: string | null) => void;
  onStats: () => void;
  onOpen: () => void;
}) {
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  // The log names the NOTE a star sits in. For a deck that is its
  // path; for the implicit one it is any note that is not a deck,
  // so the caller hands this card a log already narrowed to those.
  const own = meta.implicit ? null : meta.path;
  const series = useMemo(() => retentionSeries(log, today, 30, own), [log, today, own]);
  const kept = useMemo(() => retention(log, today, 30, own), [log, today, own]);
  const sections = meta.sections.filter((s) => s.total > 0);
  const openSections = (e: { currentTarget: HTMLElement; detail?: number }): void => {
    const r = e.currentTarget.getBoundingClientRect();
    const rtl = getComputedStyle(document.documentElement).direction === "rtl";
    setMenu({ x: rtl ? r.right : r.left, y: r.bottom + 4, fromKeyboard: e.detail === 0 });
  };
  const rows: MenuRow[] = sections.map((s) => ({
    label: stf("orbitsSectionRow", { name: s.name, due: localeNum(s.due) }),
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
            {meta.implicit ? t("orbitsEverything") : meta.title}
          </h2>
          {meta.implicit ? (
            <p className="s-shelf__cardsub">{st("orbitsEverythingHint")}</p>
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
          {/* "1 orbit due" / "3 orbits due" — the unit agrees with the number
              in both languages (countPhrase), so no bare "orbits" after a 1. */}
          <b>{countPhrase(meta.counts.due, "orbits")}</b> {st("orbitsDueLabel")}
        </span>
        <span className="s-shelf__stat">
          <b>{localeNum(meta.counts.new)}</b> {st("orbitsNewLabel")}
        </span>
        <span className="s-shelf__stat">
          <b>{localeNum(meta.counts.total)}</b> {st("orbitsTotalLabel")}
        </span>
      </p>
      <div className="s-shelf__retention" title={st("orbitsRetention30")}>
        <Sparkline series={series} />
        <span className="s-shelf__retentionlabel">{kept === null ? st("orbitsNoGrades") : stf("orbitsPercent", { n: localeNum(Math.round(kept * 100)) })}</span>
      </div>
      <div className="s-shelf__actions">
        <button
          type="button"
          className="s-btn s-btn--accent s-shelf__study"
          onClick={() => onStudy(null)}
          disabled={meta.counts.total === 0}
          data-testid="shelf-study"
        >
          {st("orbitsStudy")}
        </button>
        {sections.length > 0 && (
          <button type="button" className="s-btn s-shelf__sections" onClick={openSections} aria-haspopup="menu" aria-expanded={menu !== null}>
            {st("orbitsStudySection")} <span aria-hidden="true">▾</span>
          </button>
        )}
      </div>
      <footer className="s-shelf__foot">
        <button type="button" className="s-btn s-shelf__small" onClick={onStats} data-testid="shelf-stats">
          {st("orbitsStats")}
        </button>
        {!meta.implicit && (
          <button type="button" className="s-btn s-shelf__small" onClick={onOpen} title={st("orbitsOpenNote")}>
            {st("orbitsOpenNote")}
          </button>
        )}
      </footer>
      {menu && <ContextMenu at={menu} rows={rows} label={st("orbitsStudySection")} onClose={() => setMenu(null)} />}
    </article>
  );
}

export default function ShelfView() {
  const [all, setAll] = useState<DeckMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [modal, setModal] = useState<"new" | "import" | null>(null);
  const [stats, setStats] = useState<DeckMeta | null>(null);
  const [log, setLog] = useState<LogEntry[]>(() => readLog());
  const openOrbits = useStore((s) => s.openOrbits);
  const openNote = useStore((s) => s.openNote);
  const locale = useStore((s) => s.blogLocale);
  const today = isoDate(new Date());
  const [asked, setAsked] = useState<OrbitsAsk | null>(null);

  const load = useCallback((): void => {
    getDecks(isoDate(new Date()))
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
    (meta: DeckMeta, section: string | null): void => {
      openOrbits(meta.path, section);
    },
    [openOrbits],
  );
  useEffect(() => {
    const answer = (ask: OrbitsAsk): void => {
      if (ask === "new" || ask === "import") setModal(ask);
      else setAsked(ask);
    };
    const pending = takeOrbitsAsk();
    if (pending) answer(pending);
    const onAsk = (e: Event): void => {
      const ask = (e as CustomEvent<{ ask: OrbitsAsk }>).detail?.ask;
      takeOrbitsAsk();
      if (ask) answer(ask);
    };
    window.addEventListener(ORBITS_ASK_EVENT, onAsk);
    return () => window.removeEventListener(ORBITS_ASK_EVENT, onAsk);
  }, []);
  useEffect(() => {
    if (asked !== "study" || all === null) return;
    setAsked(null);
    const first = all.find((m) => m.counts.due > 0);
    if (first) study(first, null);
    else toast(st("orbitsNothingDue"));
  }, [asked, all, study]);

  const sorted = useMemo(() => {
    const list = all ?? [];
    // The implicit one last; the rest as the server lists them (by path).
    return [...list.filter((m) => !m.implicit), ...list.filter((m) => m.implicit && m.counts.total > 0)];
  }, [all]);
  const dueTotal = useMemo(() => sorted.reduce((n, m) => n + m.counts.due, 0), [sorted]);
  // The implicit deck's grades are the log entries on notes that
  // are not decks — its statistics must not count Hiragana's.
  const restLog = useMemo(() => {
    const named = new Set(sorted.filter((m) => !m.implicit).map((m) => m.path));
    return log.filter((e) => !named.has(e.path));
  }, [log, sorted]);
  const streak = useMemo(() => streakOf(studyDays(log), today), [log, today]);
  const dateLine = siteDate(`${today}T12:00:00`, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="s-orbits s-shelf" data-testid="orbits-shelf">
      <header className="s-orbits__head">
        <div className="s-orbits__headtext">
          <p className="s-orbits__date">{dateLine}</p>
          <h1 className="s-orbits__h1">{t("orbits")}</h1>
          <p className="s-orbits__lead">
            {all === null ? st("orbitsLead") : dueTotal === 0 ? st("orbitsNothingDue") : stf("orbitsDueToday", { n: countPhrase(dueTotal, "orbits") })}
            {streak > 0 ? ` · ${stf("orbitsStreak", { days: countPhrase(streak, "days") })}` : ""}
          </p>
        </div>
        <div className="s-orbits__headactions">
          <button type="button" className="s-btn" onClick={() => setModal("import")} data-testid="shelf-import">
            {st("orbitsImport")}
          </button>
          <button type="button" className="s-btn s-btn--accent" onClick={() => setModal("new")} data-testid="shelf-new">
            {t("orbitsNewDeck")}
          </button>
        </div>
      </header>
      {failed ? (
        <p className="s-orbits__empty">{st("orbitsFailed")}</p>
      ) : all !== null && sorted.length === 0 ? (
        <div className="s-orbits__empty" data-testid="shelf-empty">
          <span className="s-orbits__emptymark" aria-hidden="true">
            <SiteMark size={32} />
          </span>
          <p className="s-orbits__emptytext">{st("orbitsEmpty")}</p>
          <p className="s-orbits__emptyhint">{st("orbitsEmptyHint")}</p>
          <pre className="s-orbits__syntax" dir="ltr">
            {"```deck\nicon: あ\n```\nあ::a\nい::i::the second kana"}
          </pre>
          <p className="s-orbits__emptyhint">{st("orbitsEmptyHint2")}</p>
        </div>
      ) : (
        <div className="s-shelf__grid">
          {sorted.map((meta) => (
            <ShelfCard
              key={meta.path}
              meta={meta}
              log={meta.implicit ? restLog : log}
              today={today}
              onStudy={(section) => study(meta, section)}
              onStats={() => setStats(meta)}
              onOpen={() => openNote(meta.path)}
            />
          ))}
        </div>
      )}
      {modal && (
        <NewDeckModal
          tab={modal}
          onClose={() => setModal(null)}
          onCreated={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {stats && <StatsDrawer meta={stats} log={stats.implicit ? restLog : log} today={today} onClose={() => setStats(null)} />}
    </div>
  );
}
