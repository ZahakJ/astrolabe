// THE TIMELINE'S READS — one source for both shells (docs/timeline.md).
//
// Everything the Calendar page reads, plus the notes with their days
// (`GET /api/timeline`), handed to shared/dayAgenda.ts over every day the
// vault holds anything on (`agendaDays`), with the course projection off: a
// timeline is what happened. The desktop page (./TimelineView.tsx) and the
// phone's screen (client/phone/screens/TimelineScreen.tsx) draw the answer
// with their own chrome; the filter's state is kept here so each shell's
// chips and the list below them agree.

import { useEffect, useMemo, useState } from "react";
import { agendaByDay, agendaDays } from "../../shared/dayAgenda.ts";
import { isoDate } from "../../shared/routine.ts";
import type { RoutineMeta, TimelineNote, TrackerMeta } from "../../shared/types.ts";
import { getRoutines, getTimelineNotes, getTrackers } from "../api.ts";
import { dailyNotesByDay, loadPeriodic, usePeriodic } from "../daily.ts";
import { readLog, type LogEntry } from "../orbits/log.ts";
import { useStore } from "../state.ts";
import { useVaultTick } from "../vaultTick.ts";
import { filterItems, itemsOf, layoutOf, monthsOf, NO_FILTER, rowsOf, type TimelineFilter, type TimelineItem, type TimelineKind } from "./model.ts";

interface Sources {
  notes: TimelineNote[];
  routines: RoutineMeta[];
  trackers: TrackerMeta[];
  grades: LogEntry[];
}

export interface TimelineData {
  loaded: boolean;
  /** Every item, before the filter — what the chips count. */
  all: TimelineItem[];
  items: TimelineItem[];
  rows: ReturnType<typeof rowsOf>;
  layout: ReturnType<typeof layoutOf>;
  months: ReturnType<typeof monthsOf>;
  filter: TimelineFilter;
  toggleKind(kind: TimelineKind): void;
  setFolder(folder: string | null): void;
  setTag(tag: string | null): void;
  clear(): void;
}

export function useTimeline(): TimelineData {
  const admin = useStore((s) => s.admin);
  const tree = useStore((s) => s.tree);
  const tick = useVaultTick();
  const periodic = usePeriodic();
  const [sources, setSources] = useState<Sources | null>(null);
  const [filter, setFilter] = useState<TimelineFilter>(NO_FILTER);

  useEffect(() => {
    if (!admin) return;
    let live = true;
    void Promise.all([getTimelineNotes().catch(() => []), getRoutines().catch(() => []), getTrackers().catch(() => []), loadPeriodic()]).then(([notes, routines, trackers]) => {
      if (!live) return;
      setSources({ notes, routines: routines.filter((r) => !r.template), trackers, grades: readLog() });
    });
    return () => {
      live = false;
    };
  }, [admin, tick]);

  const today = isoDate(new Date());
  const daily = useMemo(() => dailyNotesByDay(tree), [tree, periodic]);
  const all = useMemo(() => {
    if (sources === null) return [];
    const agendaSources = { notes: daily, sigils: sources.routines, trackers: sources.trackers, grades: sources.grades, written: sources.notes };
    const days = agendaDays(agendaSources, today);
    const agenda = agendaByDay(days, agendaSources, today, { project: false });
    const tags = new Map(sources.notes.map((n) => [n.path, n.tags]));
    return itemsOf(days, agenda, (path) => tags.get(path) ?? []);
  }, [sources, daily, today]);

  const items = useMemo(() => filterItems(all, filter), [all, filter]);
  const rows = useMemo(() => rowsOf(items), [items]);
  const layout = useMemo(() => layoutOf(rows), [rows]);
  const months = useMemo(() => monthsOf(rows, layout), [rows, layout]);

  return {
    loaded: sources !== null,
    all,
    items,
    rows,
    layout,
    months,
    filter,
    toggleKind: (kind) =>
      setFilter((f) => {
        const kinds = new Set(f.kinds);
        if (kinds.has(kind)) kinds.delete(kind);
        else kinds.add(kind);
        return { ...f, kinds };
      }),
    setFolder: (folder) => setFilter((f) => ({ ...f, folder })),
    setTag: (tag) => setFilter((f) => ({ ...f, tag })),
    clear: () => setFilter(NO_FILTER),
  };
}
