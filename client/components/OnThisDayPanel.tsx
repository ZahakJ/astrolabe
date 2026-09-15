// ON THIS DAY — the archive read back: what you wrote, or finished, on
// this month-day in earlier years. A strip under the backlinks, present
// only when there is something to say; the Orbits page draws the same
// list at the top of the day. Nothing is stored — the notes' own dates and
// the trackers' `finished:` lines are the record.

import { useEffect, useState } from "react";
import type { OnThisDayHit } from "../../shared/types.ts";
import { isoDate } from "../../shared/routine.ts";
import { getOnThisDay } from "../api.ts";
import { localeNum, t, tf } from "../i18n.ts";
import { useStore } from "../state.ts";

const COLLAPSED_KEY = "astrolabe.onthisday-collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

export function useOnThisDay(): OnThisDayHit[] {
  const admin = useStore((s) => s.admin);
  const [rows, setRows] = useState<OnThisDayHit[]>([]);
  useEffect(() => {
    if (!admin) {
      setRows([]);
      return;
    }
    let dead = false;
    getOnThisDay(isoDate(new Date()))
      .then((list) => {
        if (!dead) setRows(list);
      })
      .catch(() => setRows([]));
    return () => {
      dead = true;
    };
  }, [admin]);
  return rows;
}

export function OnThisDayList({ rows }: { rows: OnThisDayHit[] }) {
  const openNote = useStore((s) => s.openNote);
  const setView = useStore((s) => s.setView);
  const thisYear = new Date().getFullYear();
  return (
    <ul className="s-otd__list">
      {rows.map((r) => (
        <li key={`${r.path}:${r.kind}:${r.year}`} className="s-otd__row">
          <span className="s-otd__ago">{tf("onThisDayAgo", { n: localeNum(thisYear - r.year) })}</span>
          <button
            type="button"
            className="s-otd__open"
            dir="auto"
            onClick={() => {
              openNote(r.path);
              setView("editor");
            }}
            title={r.path}
          >
            {r.kind === "finished" ? tf("onThisDayFinished", { title: r.what }) : tf("onThisDayWrote", { title: r.what })}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function OnThisDayPanel() {
  const rows = useOnThisDay();
  const preview = useStore((s) => s.previewVisitor);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  if (preview || rows.length === 0) return null;
  const toggle = (): void => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, String(next));
    } catch {
      // storage unavailable
    }
  };
  return (
    <section className="s-otd">
      <header className="s-panel-header">
        <button type="button" className="s-mentions__toggle" onClick={toggle} aria-expanded={!collapsed} title={t(collapsed ? "showOnThisDay" : "hideOnThisDay")}>
          <span className={`s-tree__chevron${collapsed ? "" : " s-tree__chevron--open"}`} aria-hidden="true">›</span>
          <span className="s-panel-title">{t("onThisDay")}</span>
          <span className="s-panel-count">{localeNum(rows.length)}</span>
        </button>
      </header>
      {!collapsed && (
        <div className="s-panel-body">
          <OnThisDayList rows={rows} />
        </div>
      )}
    </section>
  );
}
