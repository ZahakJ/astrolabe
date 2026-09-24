// The Timeline's filters, as chips: a toggle per kind (none pressed means
// every kind), and a folder and a tag, each a native select dressed as a
// chip — a phone answers a select with its own picker, which is the right
// control for "one of forty folders" under a thumb. Shared by both shells'
// Timeline, like the list under it.

import { useMemo } from "react";
import { localeNum, t } from "../i18n.ts";
import { countBy, kindCounts, TIMELINE_KINDS, type TimelineFilter, type TimelineItem, type TimelineKind } from "./model.ts";
import { KindIcon, kindLabel } from "./words.tsx";

export interface TimelineChipsProps {
  all: readonly TimelineItem[];
  filter: TimelineFilter;
  toggleKind: (kind: TimelineKind) => void;
  setFolder: (folder: string | null) => void;
  setTag: (tag: string | null) => void;
  clear: () => void;
}

export default function TimelineChips({ all, filter, toggleKind, setFolder, setTag, clear }: TimelineChipsProps) {
  const kinds = useMemo(() => kindCounts(all), [all]);
  const folders = useMemo(() => countBy(all, (it) => [it.folder]), [all]);
  const tags = useMemo(() => countBy(all, (it) => it.tags), [all]);
  const active = filter.kinds.size > 0 || filter.folder !== null || filter.tag !== null;
  return (
    <div className="s-tl__chips" role="group" aria-label={t("timelineFilters")} data-testid="timeline-chips">
      {TIMELINE_KINDS.filter((k) => (kinds.get(k) ?? 0) > 0).map((kind) => (
        <button
          key={kind}
          type="button"
          className="s-tl__chip"
          aria-pressed={filter.kinds.has(kind)}
          data-kind={kind}
          onClick={() => toggleKind(kind)}
        >
          <KindIcon kind={kind} />
          <span>{kindLabel(kind)}</span>
          <span className="s-tl__chipcount">{localeNum(kinds.get(kind) ?? 0)}</span>
        </button>
      ))}
      {folders.length > 1 && (
        <select
          className="s-tl__chip s-tl__select"
          value={filter.folder ?? "\u0000"}
          aria-label={t("timelineAllFolders")}
          onChange={(e) => setFolder(e.target.value === "\u0000" ? null : e.target.value)}
        >
          <option value={"\u0000"}>{t("timelineAllFolders")}</option>
          {folders.map((f) => (
            <option key={f.value} value={f.value}>
              {f.value === "" ? t("vaultRoot") : f.value} ({localeNum(f.count)})
            </option>
          ))}
        </select>
      )}
      {tags.length > 0 && (
        <select
          className="s-tl__chip s-tl__select"
          value={filter.tag ?? "\u0000"}
          aria-label={t("timelineAllTags")}
          onChange={(e) => setTag(e.target.value === "\u0000" ? null : e.target.value)}
        >
          <option value={"\u0000"}>{t("timelineAllTags")}</option>
          {tags.map((tag) => (
            <option key={tag.value} value={tag.value}>
              #{tag.value} ({localeNum(tag.count)})
            </option>
          ))}
        </select>
      )}
      {active && (
        <button type="button" className="s-tl__chip s-tl__chip--clear" onClick={clear}>
          {t("timelineClear")}
        </button>
      )}
    </div>
  );
}
