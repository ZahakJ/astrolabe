// THE DAYS SOMETHING WAS KEPT, for the month grid's second mark.
//
// Two surfaces draw the same grid and want the same set: the sidebar's
// Calendar section and the Calendar page (client/calendar/CalendarView.tsx).
// The hook lived in Sidebar.tsx while the Sigils page computed the set from
// the routines it was already holding; once the month left that page
// (3.18) there were two askers and no page holding the answer, so it moved
// here rather than being written twice.
//
// A day counts when a sigil logged it OR a book was read that day
// (`loggedDaysOf` in shared/calendar.ts: the trackers' `sessions:` lines
// ride the same fetch). Both routes are admin's, so `active` is how a caller
// says "not for a visitor" as well as "not while I am closed"; a shelf that
// fails to load costs the grid only its marks.

import { useEffect, useState } from "react";
import { getRoutines, getTrackers } from "./api.ts";
import { loggedDaysOf } from "../shared/calendar.ts";
import type { TrackerMeta } from "../shared/types.ts";

/** Re-read a beat after the vault changes — a box ticked in the editor is
 *  the grid's business too. */
const VAULT_SETTLE_MS = 600;

export function useLoggedDays(active: boolean): ReadonlySet<string> {
  const [days, setDays] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const read = (): void => {
      Promise.all([getRoutines(), getTrackers().catch((): TrackerMeta[] => [])])
        .then(([routines, trackers]) => {
          if (!alive) return;
          setDays(loggedDaysOf(routines, trackers));
        })
        .catch(() => {});
    };
    read();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onVault = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(read, VAULT_SETTLE_MS);
    };
    window.addEventListener("astrolabe:vault", onVault);
    return () => {
      alive = false;
      window.removeEventListener("astrolabe:vault", onVault);
      if (timer) clearTimeout(timer);
    };
  }, [active]);
  return days;
}
