// THE TIMELINE ON A PHONE — the vault by date, under More and in the
// Calendar's ⋯ (docs/timeline.md). The list and the chips are the desktop's
// own content parts (client/timeline/); the month jump, which the desktop
// keeps in a rail beside the list, is a sheet here, raised from the top bar,
// because a 412px screen has no "beside".

import { useCallback, useRef, useState } from "react";
import { localeNum, t } from "../../i18n.ts";
import { useStore } from "../../state.ts";
import { useTimeline } from "../../timeline/hooks.ts";
import type { TimelineItem } from "../../timeline/model.ts";
import TimelineChips from "../../timeline/TimelineChips.tsx";
import TimelineList, { monthLabel } from "../../timeline/TimelineList.tsx";
import { usePhone } from "../context.ts";
import { IconCalendar, IconChevron } from "../icons.tsx";
import RoutedSheet from "../RoutedSheet.tsx";
import TopBar from "../TopBar.tsx";

export default function TimelineScreen({ onBack }: { onBack?: () => void }) {
  const phone = usePhone();
  const data = useTimeline();
  const locale = useStore((s) => s.blogLocale);
  useStore((s) => s.language);
  const scroller = useRef<HTMLDivElement | null>(null);
  const [months, setMonths] = useState(false);
  const closeMonths = useCallback(() => setMonths(false), []);
  const onOpen = useCallback(
    (item: TimelineItem) => {
      if (item.kind === "sigil" && item.index !== null) phone.open({ kind: "sigil", path: item.path, index: item.index });
      else phone.open({ kind: "note", path: item.path });
    },
    [phone],
  );

  return (
    <div className="s-ph-screen s-ph-timeline" data-screen="timeline">
      <TopBar
        title={t("timeline")}
        onBack={onBack}
        actions={
          data.months.length > 1 ? (
            <button type="button" className="s-ph-icon" aria-label={t("timelineJump")} onClick={() => setMonths(true)} data-action="months">
              <IconCalendar />
            </button>
          ) : undefined
        }
      />
      <div className="s-ph-timeline__chips">
        <TimelineChips all={data.all} filter={data.filter} toggleKind={data.toggleKind} setFolder={data.setFolder} setTag={data.setTag} clear={data.clear} />
      </div>
      {data.loaded ? (
        <TimelineList rows={data.rows} layout={data.layout} months={data.months} onOpen={onOpen} scrollRef={scroller} />
      ) : (
        <p className="s-ph-empty">{t("timelineLoading")}</p>
      )}
      {months && (
        <RoutedSheet id="timeline-months" label={t("timelineMonths")} detent="half" onGone={closeMonths}>
          <ul className="s-ph-list" data-testid="timeline-months">
            {data.months.map((m) => (
              <li key={m.ym}>
                <button
                  type="button"
                  className="s-ph-row"
                  data-month={m.ym}
                  onClick={() => {
                    scroller.current?.scrollTo({ top: m.top });
                    phone.closeSheet("timeline-months");
                  }}
                >
                  <span className="s-ph-row__name">{monthLabel(m.ym, locale)}</span>
                  <span className="s-ph-row__count">{localeNum(m.count)}</span>
                  <span className="s-ph-row__chev" aria-hidden="true">
                    <IconChevron />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </RoutedSheet>
      )}
    </div>
  );
}
