// THE CALENDAR PAGE. The month, on a page of its own.
//
// A workspace TAB like the Media page and the Sigils page (`CALENDAR_TAB` in
// client/workspace.ts, `/calendar` in the router) and a lazy chunk. It draws
// the SAME grid the sidebar's Calendar section draws
// (client/components/CalendarGrid.tsx) — there is one month grid in this
// product and this page is not a second one — at a size a page can afford,
// with the legend the dots never had room for.
//
// WHY IT EXISTS. The grid sat at the top of the Sigils page until 3.18, above
// today's checklists, where the owner found it "kinda weird and useless in
// the sigils window": the Sigils page answers "what does today ask of me",
// and a month of past days answers something else. So the month took the door
// it deserved and the Sigils page kept only what asks something of today.
//
// The page holds no state: the marks are `useLoggedDays` (client/loggedDays.ts,
// admin-gated because the routes are), the dots come off the tree, and a
// click goes through the daily note's own door, so a note created here is
// templated exactly as Ctrl/Cmd Alt D would template it.

import CalendarGrid from "../components/CalendarGrid.tsx";
import { openDailyNote } from "../daily.ts";
import { siteDate } from "../dates.ts";
import { isoDate } from "../../shared/routine.ts";
import { t } from "../i18n.ts";
import { useLoggedDays } from "../loggedDays.ts";
import { useStore } from "../state.ts";
import "../styles/calendar.css";

export default function CalendarView() {
  const admin = useStore((s) => s.admin);
  const locale = useStore((s) => s.blogLocale);
  const logged = useLoggedDays(admin);
  const today = isoDate(new Date());
  const dateLine = siteDate(`${today}T12:00:00`, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="s-calpage" data-testid="calendar-page">
      <header className="s-calpage__head">
        <div className="s-calpage__headtext">
          <p className="s-calpage__date">{dateLine}</p>
          <h1 className="s-calpage__h1">{t("calendar")}</h1>
          <p className="s-calpage__lead">{t("calendarLead")}</p>
        </div>
        {admin && (
          <button type="button" className="s-btn s-btn--accent s-calpage__today" onClick={() => void openDailyNote()}>
            {t("cmdDailyNote")}
          </button>
        )}
      </header>
      <section className="s-calpage__month" aria-label={t("calendar")}>
        <CalendarGrid logged={logged} />
        {/* The dots have carried their meaning in each cell's `aria-label`
            since they were drawn; on a page there is room to say it in ink
            too — in the SAME words, so the legend and the screen reader
            never describe the same dot differently. */}
        <ul className="s-calpage__legend">
          <li className="s-calpage__key">
            <span className="s-cal__dot s-cal__dot--note" aria-hidden="true" />
            {t("calendarCellNote")}
          </li>
          <li className="s-calpage__key">
            <span className="s-cal__dot s-cal__dot--log" aria-hidden="true" />
            {t("calendarCellLogged")}
          </li>
        </ul>
      </section>
    </div>
  );
}
