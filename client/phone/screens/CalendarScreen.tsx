// CALENDAR — the month as it is on the desktop (CalendarView, unchanged: its
// 50×56 grid was already the one surface the audit found fitting a phone),
// with the day pane lifted into a sheet. On the desktop the pane sits beside
// the grid; on a phone it sat under it, a scroll away from the finger that
// had just chosen the day. A tap on a day now raises that day.
//
// The ⋯ (3.28) is the month's other reading: the Timeline, the same days as
// one list, newest first (client/timeline/), and the year in review.

import { useCallback } from "react";
import { lazySurface } from "../../lazySurface.tsx";
import { t } from "../../i18n.ts";
import { useStore } from "../../state.ts";
import { TIMELINE_TAB } from "../../workspace.ts";
import { useActionSheet } from "../ActionSheet.tsx";
import { usePhone } from "../context.ts";
import { IconDots } from "../icons.tsx";
import RoutedSheet from "../RoutedSheet.tsx";
import TopBar from "../TopBar.tsx";
import type { DayPaneHost } from "../../calendar/CalendarView.tsx";

const CalendarView = lazySurface(() => import("../../calendar/CalendarView.tsx"));

export default function CalendarScreen() {
  useStore((s) => s.language);
  const admin = useStore((s) => s.admin);
  const phone = usePhone();
  const actions = useActionSheet();
  const host = useCallback<DayPaneHost>(
    (pane, label, close) => (
      <RoutedSheet id="calendar-day" label={label} detent="half" onGone={close}>
        <div className="s-ph-calday">{pane}</div>
      </RoutedSheet>
    ),
    [],
  );
  const more = (): void =>
    actions(t("calendar"), [
      { label: t("timeline"), onSelect: () => phone.open({ kind: "surface", tab: TIMELINE_TAB }) },
      { label: t("cmdYearReview"), onSelect: () => void import("../../timeline/yearReviewCommand.ts").then((m) => m.yearReviewCommand()) },
    ]);
  return (
    <div className="s-ph-screen s-ph-calendar" data-screen="calendar">
      <TopBar
        title={t("calendar")}
        actions={
          admin ? (
            <button type="button" className="s-ph-icon" aria-label={t("phMore")} onClick={more} data-action="more">
              <IconDots />
            </button>
          ) : undefined
        }
      />
      <div className="s-ph-scroll">
        <CalendarView dayHost={host} timelineDoor={false} />
      </div>
    </div>
  );
}
