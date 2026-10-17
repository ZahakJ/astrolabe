// THE DESK'S READS — one source for both shells (docs/writing-desk.md).
//
// GET /api/desk, re-read whenever the vault moves (a status written from the
// board, a piece edited in Obsidian), with the filters and the chosen view
// kept here so the desktop page and the phone screen draw the same answer.
// The view and the filters are a per-browser convenience, remembered in
// localStorage when it is there and forgotten without complaint when not.

import { useEffect, useMemo, useState } from "react";
import { ALL, filterPieces, type DeskData, type DeskFilter, type DeskPiece } from "../../shared/desk.ts";
import { getDesk } from "../api.ts";
import { useStore } from "../state.ts";
import { useVaultTick } from "../vaultTick.ts";

export type DeskView = "board" | "list" | "series";
const VIEWS: readonly DeskView[] = ["board", "list", "series"];
const VIEW_KEY = "astrolabe.desk-view";
const FILTER_KEY = "astrolabe.desk-filter";

function readView(fallback: DeskView): DeskView {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return (VIEWS as readonly string[]).includes(v ?? "") ? (v as DeskView) : fallback;
  } catch {
    return fallback;
  }
}

function readFilter(): DeskFilter {
  try {
    const raw = JSON.parse(localStorage.getItem(FILTER_KEY) ?? "null") as Partial<DeskFilter> | null;
    if (raw === null || typeof raw !== "object") return ALL;
    return {
      series: typeof raw.series === "string" ? raw.series : null,
      lang: raw.lang === "en" || raw.lang === "ar" ? raw.lang : null,
      status: typeof raw.status === "string" ? (raw.status as DeskFilter["status"]) : null,
    };
  } catch {
    return ALL;
  }
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private window or blocked storage: the choice lasts as long as the page
  }
}

export interface DeskState {
  data: DeskData | null;
  failed: boolean;
  /** The pieces the filter keeps. */
  pieces: DeskPiece[];
  filter: DeskFilter;
  setFilter(next: DeskFilter): void;
  view: DeskView;
  setView(next: DeskView): void;
  /** Re-read now, after a write this page made. */
  reload(): void;
}

export function useDesk(defaultView: DeskView = "board"): DeskState {
  const admin = useStore((s) => s.admin);
  const tick = useVaultTick();
  const [data, setData] = useState<DeskData | null>(null);
  const [failed, setFailed] = useState(false);
  const [own, setOwn] = useState(0);
  const [filter, setFilterState] = useState<DeskFilter>(readFilter);
  const [view, setViewState] = useState<DeskView>(() => readView(defaultView));

  useEffect(() => {
    if (!admin) return;
    let live = true;
    getDesk()
      .then((d) => {
        if (!live) return;
        setData(d);
        setFailed(false);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [admin, tick, own]);

  // A series filter naming a series that is gone shows everything rather than
  // an empty board the reader cannot explain.
  const effective = useMemo<DeskFilter>(() => {
    if (data === null || filter.series === null || filter.series.startsWith("\u0000")) return filter;
    return data.series.some((s) => s.path === filter.series) ? filter : { ...filter, series: null };
  }, [data, filter]);
  const pieces = useMemo(() => (data === null ? [] : filterPieces(data.pieces, effective)), [data, effective]);

  return {
    data,
    failed,
    pieces,
    filter: effective,
    setFilter: (next) => {
      setFilterState(next);
      remember(FILTER_KEY, JSON.stringify(next));
    },
    view,
    setView: (next) => {
      setViewState(next);
      remember(VIEW_KEY, next);
    },
    reload: () => setOwn((n) => n + 1),
  };
}
