// THE CALENDAR PAGE — the month, at the size a month deserves.
//
// A workspace TAB like the Media page (`CALENDAR_TAB` in client/workspace.ts)
// and a lazy chunk with its own stylesheet. The grid is the one the sidebar
// draws (components/CalendarGrid.tsx) — one implementation of a month, in
// the site's calendar, with the site's week and the site's numerals — given
// room here instead of a 200px fold: a click still opens the day's note
// through the daily-note command's own door.
//
// WHY IT IS ITS OWN PAGE. It was a card at the top of the Sigils page until
// 3.18 (the owner: "kinda weird and useless in the sigils window"). The
// Sigils page answers "what do I keep every day, and did I keep it today";
// a month answers "which day", which is a different question and a different
// errand. Two answers on one page made the checklist scroll past a thing
// nobody had come for. The sidebar's fold stays exactly as it was — that one
// is the glance you take without leaving the note; this is the room.
//
// The page holds no state of its own. The marks are `useLoggedDays`
// (client/loggedDays.ts), the same read the sidebar's fold makes.

import { isoDate } from "../../shared/routine.ts";
import CalendarGrid from "../components/CalendarGrid.tsx";
import { siteDate } from "../dates.ts";
import { t } from "../i18n.ts";
import { useLoggedDays } from "../loggedDays.ts";
import { useStore } from "../state.ts";
import "../styles/calendar.css";

export default function CalendarView() {
  const locale = useStore((s) => s.blogLocale);
  const admin = useStore((s) => s.admin);
  // The sigil and reading marks come off admin-only routes; a visitor gets
  // the month and the note dots, which is everything they may see anyway.
  const logged = useLoggedDays(admin);
  const today = isoDate(new Date());
  const dateLine = siteDate(`${today}T12:00:00`, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="s-calpage" data-testid="calendar-page">
      <header className="s-calpage__head">
        <p className="s-calpage__date">{dateLine}</p>
        <h1 className="s-calpage__h1">{t("calendar")}</h1>
        <p className="s-calpage__lead">{t("calendarLead")}</p>
      </header>
      <div className="s-calpage__card">
        <CalendarGrid logged={logged} />
      </div>
    </div>
  );
}
