// THE TIMELINE'S LIST — every day the vault holds anything on, newest first,
// grouped by month and day, drawn as a VIRTUAL list: only the rows in view
// (and a screen's worth either side) are mounted, because a vault can hold
// thousands of days and a list of ten thousand buttons is a page that takes
// seconds to open and scrolls like it (docs/timeline.md).
//
// Content, not chrome: both shells mount it — the desktop page beside its
// month rail (./TimelineView.tsx), the phone's screen under its top bar
// (client/phone/screens/TimelineScreen.tsx) — the way both mount the
// Calendar's month. Its rows' heights are the model's (`ROW_HEIGHT`), pinned
// again in client/styles/timeline.css; a row that drew taller than its slot
// would overlap the next one, which is the one thing a virtual list cannot
// forgive.

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type RefObject } from "react";
import { siteDate } from "../dates.ts";
import { localeNum, t } from "../i18n.ts";
import { useStore } from "../state.ts";
import { ROW_HEIGHT, monthAt, visibleRange, type Layout, type TimelineItem, type TimelineRow } from "./model.ts";
import { detailText, KindIcon, kindLabel, monthLabel } from "./words.tsx";

export { monthLabel };
import "../styles/timeline.css";

const Item = memo(function Item({ item, top, onOpen }: { item: TimelineItem; top: number; onOpen: (item: TimelineItem) => void }) {
  return (
    <div className="s-tl__slot" style={{ top, height: ROW_HEIGHT.item }}>
      <button type="button" className="s-tl__item" data-kind={item.kind} data-path={item.path} onClick={() => onOpen(item)}>
        <span className="s-tl__icon" aria-hidden="true">
          <KindIcon kind={item.kind} />
        </span>
        <span className="s-tl__text">
          <span className="s-tl__title">
            <span className="s-tl__visually-hidden">{kindLabel(item.kind)}: </span>
            <bdi dir="auto">{item.title}</bdi>
          </span>
          {/* The line keeps the row's direction; the words inside take their
              own, so an English excerpt in an Arabic list still starts at the
              leading edge beside its title. */}
          <span className="s-tl__excerpt">
            <bdi dir="auto">{detailText(item.detail)}</bdi>
          </span>
        </span>
      </button>
    </div>
  );
});

export interface TimelineListProps {
  rows: readonly TimelineRow[];
  layout: Layout;
  months: readonly { ym: string; top: number }[];
  onOpen: (item: TimelineItem) => void;
  /** The scroller, for a shell's month jump (`scrollTo({ top })`). */
  scrollRef?: RefObject<HTMLDivElement | null>;
  /** Told which month the top of the view is in, as the reader scrolls. */
  onMonth?: (ym: string | null) => void;
}

export default function TimelineList({ rows, layout, months, onOpen, scrollRef, onMonth }: TimelineListProps) {
  const locale = useStore((s) => s.blogLocale);
  useStore((s) => s.language);
  const own = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState({ top: 0, height: 800 });

  const attach = useCallback(
    (el: HTMLDivElement | null) => {
      own.current = el;
      if (scrollRef) (scrollRef as { current: HTMLDivElement | null }).current = el;
    },
    [scrollRef],
  );

  useLayoutEffect(() => {
    const el = own.current;
    if (!el) return;
    setView({ top: el.scrollTop, height: el.clientHeight || 800 });
    const ro = new ResizeObserver(() => setView((v) => ({ ...v, height: el.clientHeight || v.height })));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = own.current;
    if (!el) return;
    let frame = 0;
    const onScroll = (): void => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setView((v) => (v.top === el.scrollTop ? v : { ...v, top: el.scrollTop }));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const current = monthAt(months, view.top);
  useEffect(() => onMonth?.(current), [current, onMonth]);

  const [first, last] = visibleRange(layout, view.top, view.height);
  const mounted: ReactElement[] = [];
  for (let i = first; i < last; i++) {
    const row = rows[i];
    const top = layout.tops[i];
    if (row.type === "month") {
      mounted.push(
        <div key={row.key} className="s-tl__slot s-tl__month" style={{ top, height: ROW_HEIGHT.month }} data-month={row.ym}>
          <h2 className="s-tl__monthname">{monthLabel(row.ym, locale)}</h2>
          <span className="s-tl__count">{localeNum(row.count)}</span>
        </div>,
      );
    } else if (row.type === "day") {
      mounted.push(
        <div key={row.key} className="s-tl__slot s-tl__day" style={{ top, height: ROW_HEIGHT.day }}>
          <h3 className="s-tl__dayname">{siteDate(`${row.iso}T12:00:00`, locale, { weekday: "long", day: "numeric", month: "long" }) || row.iso}</h3>
        </div>,
      );
    } else {
      mounted.push(<Item key={row.key} item={row.item} top={top} onOpen={onOpen} />);
    }
  }

  return (
    <div ref={attach} className="s-tl__scroll" data-testid="timeline-list" tabIndex={-1}>
      {rows.length === 0 ? (
        <p className="s-tl__empty">{t("timelineEmpty")}</p>
      ) : (
        <div className="s-tl__canvas" style={{ height: layout.total }}>
          {mounted}
        </div>
      )}
    </div>
  );
}
