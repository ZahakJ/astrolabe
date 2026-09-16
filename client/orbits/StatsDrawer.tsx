// THE STATISTICS DRAWER — one deck, four answers: how much of
// what you graded in the last month you kept, what is coming due over the
// next month, how the stars split between new, learning, young and mature,
// and the ten you keep getting wrong.
//
// Nothing here is stored. Retention and the hardest ten come from the
// device's log (client/orbits/log.ts); the forecast and the states come from
// the schedules the notes hold, fetched fresh when the drawer opens. The
// drawer wears the Media form's frame (.s-mediaform) so it opens, traps
// focus and closes like every other sheet in the app.

import { useEffect, useMemo, useRef, useState } from "react";
import type { DeckMeta, DeckCard } from "../../shared/decks.ts";
import { forecast, shiftDay, statesOf } from "./stats.ts";
import { useDialog } from "../a11y.ts";
import { getDeckCards } from "../api.ts";
import { siteDate } from "../dates.ts";
import { countPhrase, localeNum, t } from "../i18n.ts";
import { st, stf } from "./copy.ts";
import { landOnLine } from "../landing.ts";
import { useStore } from "../state.ts";
import { hardest, retention, type LogEntry } from "./log.ts";

const STATE_KEYS = [
  ["new", "orbitsStateNew"],
  ["learning", "orbitsStateLearning"],
  ["young", "orbitsStateYoung"],
  ["mature", "orbitsStateMature"],
] as const;

export default function StatsDrawer({ meta, log, today, onClose }: { meta: DeckMeta; log: LogEntry[]; today: string; onClose: () => void }) {
  const [stars, setStars] = useState<DeckCard[] | null>(null);
  const locale = useStore((s) => s.blogLocale);
  const panel = useRef<HTMLDivElement | null>(null);
  useDialog(panel, { onEscape: onClose });

  useEffect(() => {
    let alive = true;
    getDeckCards(meta.path)
      .then((s) => alive && setStars(s))
      .catch(() => alive && setStars([]));
    return () => {
      alive = false;
    };
  }, [meta.path]);

  const kept = useMemo(() => retention(log, today, 30, meta.implicit ? null : meta.path), [log, today, meta]);
  const bars = useMemo(() => forecast(stars ?? [], today, 30), [stars, today]);
  const peak = Math.max(1, ...bars);
  const states = useMemo(() => statesOf(stars ?? []), [stars]);
  const total = Math.max(1, states.new + states.learning + states.young + states.mature);
  const hard = useMemo(() => hardest(log, meta.implicit ? null : meta.path, 10), [log, meta]);
  const byLine = useMemo(() => new Map((stars ?? []).map((s) => [`${s.path}#${s.line}`, s])), [stars]);
  const title = meta.implicit ? t("orbitsEverything") : meta.title;

  return (
    <div className="s-palette-overlay" onMouseDown={onClose}>
      <div ref={panel} className="s-mediaform s-statsdrawer" role="dialog" aria-modal="true" aria-label={stf("orbitsStatsFor", { title })} onMouseDown={(e) => e.stopPropagation()} data-testid="stats-drawer">
        <div className="s-mediaform__head">
          <h2 className="s-mediaform__title" dir="auto">
            {meta.icon && (
              <span className="s-session__icon" aria-hidden="true">
                {meta.icon}
              </span>
            )}
            {stf("orbitsStatsFor", { title })}
          </h2>
          <button type="button" className="s-mediaform__close" onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </div>
        <div className="s-mediaform__body s-statsdrawer__body">
          <section className="s-statsdrawer__section">
            <h3 className="s-statsdrawer__head">{st("orbitsRetention30")}</h3>
            <p className="s-statsdrawer__big" data-testid="stats-retention">
              {kept === null ? st("orbitsNoGrades") : stf("orbitsPercent", { n: localeNum(Math.round(kept * 100)) })}
            </p>
          </section>

          <section className="s-statsdrawer__section">
            <h3 className="s-statsdrawer__head">{st("orbitsForecast30")}</h3>
            <div className="s-statsdrawer__forecast" role="img" aria-label={st("orbitsForecast30")}>
              {bars.map((n, i) => {
                const day = shiftDay(today, i);
                const label = stf("orbitsForecastBar", { n: countPhrase(n, "orbits"), date: siteDate(`${day}T12:00:00`, locale, { day: "numeric", month: "short" }) });
                return (
                  <span key={day} className={`s-statsdrawer__bar${i === 0 ? " s-statsdrawer__bar--today" : ""}`} title={label}>
                    <span className="s-statsdrawer__fill" style={{ blockSize: `${Math.round((n / peak) * 100)}%` }} />
                  </span>
                );
              })}
            </div>
          </section>

          <section className="s-statsdrawer__section">
            <h3 className="s-statsdrawer__head">{st("orbitsStates")}</h3>
            <div className="s-statsdrawer__states" role="img" aria-label={st("orbitsStates")}>
              {STATE_KEYS.map(([key]) => (
                <span key={key} className={`s-statsdrawer__state s-statsdrawer__state--${key}`} style={{ flexGrow: states[key] }} />
              ))}
            </div>
            <ul className="s-statsdrawer__legend">
              {STATE_KEYS.map(([key, label]) => (
                <li key={key}>
                  <span className={`s-statsdrawer__swatch s-statsdrawer__state--${key}`} aria-hidden="true" />
                  {st(label)} <b>{localeNum(states[key])}</b>
                  <span className="s-statsdrawer__pct">{stf("orbitsPercent", { n: localeNum(Math.round((states[key] / total) * 100)) })}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="s-statsdrawer__section">
            <h3 className="s-statsdrawer__head">{st("orbitsHardest")}</h3>
            {hard.length === 0 ? (
              <p className="s-mediaform__hint">{st("orbitsHardestNone")}</p>
            ) : (
              <ol className="s-statsdrawer__hardest">
                {hard.map((row) => {
                  const star = byLine.get(`${row.path}#${row.line}`) ?? null;
                  return (
                    <li key={`${row.path}#${row.line}`}>
                      <button type="button" className="s-statsdrawer__card" onClick={() => landOnLine(row.path, row.line)} dir="auto">
                        {star ? star.front : `${row.path}:${localeNum(row.line)}`}
                      </button>
                      <span className="s-statsdrawer__again">{stf("orbitsAgainCount", { n: localeNum(row.again) })}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
