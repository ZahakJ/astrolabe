// THE TIMELINE ON THE DESKTOP — a pane surface (`~timeline`, `/timeline`):
// the vault by date, newest first, with its filters as chips above and the
// months down a rail beside it (docs/timeline.md).
//
// The list and the chips are content both shells mount (./TimelineList.tsx,
// ./TimelineChips.tsx); the rail and the page's frame are this shell's. The
// phone draws the same months as a sheet raised from its top bar
// (client/phone/screens/TimelineScreen.tsx).

import { useCallback, useRef, useState } from "react";
import { localeNum, t } from "../i18n.ts";
import { useStore } from "../state.ts";
import { useTimeline } from "./hooks.ts";
import type { TimelineItem } from "./model.ts";
import TimelineChips from "./TimelineChips.tsx";
import TimelineList, { monthLabel } from "./TimelineList.tsx";

export default function TimelineView() {
  const data = useTimeline();
  const admin = useStore((s) => s.admin);
  const locale = useStore((s) => s.blogLocale);
  const openNote = useStore((s) => s.openNote);
  useStore((s) => s.language);
  const scroller = useRef<HTMLDivElement | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const onOpen = useCallback((item: TimelineItem) => openNote(item.path), [openNote]);

  if (!admin) return <div className="s-timeline" />;
  return (
    <div className="s-timeline" data-testid="timeline">
      <header className="s-timeline__head">
        <h1 className="s-timeline__h1">{t("timeline")}</h1>
        <button
          type="button"
          className="s-btn s-timeline__review"
          onClick={() => void import("./yearReviewCommand.ts").then((m) => m.yearReviewCommand())}
        >
          {t("cmdYearReview")}
        </button>
      </header>
      <TimelineChips all={data.all} filter={data.filter} toggleKind={data.toggleKind} setFolder={data.setFolder} setTag={data.setTag} clear={data.clear} />
      <div className="s-timeline__body">
        {data.loaded ? (
          <TimelineList rows={data.rows} layout={data.layout} months={data.months} onOpen={onOpen} scrollRef={scroller} onMonth={setCurrent} />
        ) : (
          <p className="s-tl__empty">{t("timelineLoading")}</p>
        )}
        {data.months.length > 1 && (
          <nav className="s-timeline__rail" aria-label={t("timelineJump")} data-testid="timeline-months">
            <h2 className="s-timeline__railhead">{t("timelineMonths")}</h2>
            <ul className="s-timeline__months">
              {data.months.map((m) => (
                <li key={m.ym}>
                  <button
                    type="button"
                    className="s-timeline__month"
                    aria-current={m.ym === current ? "true" : undefined}
                    onClick={() => scroller.current?.scrollTo({ top: m.top })}
                  >
                    <span>{monthLabel(m.ym, locale)}</span>
                    <span className="s-timeline__monthcount">{localeNum(m.count)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}
