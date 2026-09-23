// CALENDAR — the month as it is on the desktop (CalendarView, unchanged: its
// 50×56 grid was already the one surface the audit found fitting a phone),
// with the day pane lifted into a sheet. On the desktop the pane sits beside
// the grid; on a phone it sat under it, a scroll away from the finger that
// had just chosen the day. A tap on a day now raises that day.

import { useCallback } from "react";
import { lazySurface } from "../../lazySurface.tsx";
import { t } from "../../i18n.ts";
import { useStore } from "../../state.ts";
import RoutedSheet from "../RoutedSheet.tsx";
import TopBar from "../TopBar.tsx";
import type { DayPaneHost } from "../../calendar/CalendarView.tsx";

const CalendarView = lazySurface(() => import("../../calendar/CalendarView.tsx"));

export default function CalendarScreen() {
  useStore((s) => s.language);
  const host = useCallback<DayPaneHost>(
    (pane, label, close) => (
      <RoutedSheet id="calendar-day" label={label} detent="half" onGone={close}>
        <div className="s-ph-calday">{pane}</div>
      </RoutedSheet>
    ),
    [],
  );
  return (
    <div className="s-ph-screen s-ph-calendar" data-screen="calendar">
      <TopBar title={t("calendar")} />
      <div className="s-ph-scroll">
        <CalendarView dayHost={host} />
      </div>
    </div>
  );
}
