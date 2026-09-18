// THE DAYS THE VAULT KEPT — the month grid's second mark, in one place.
//
// `loggedDaysOf` (shared/calendar.ts) is the arithmetic: a day a sigil logged
// a line, or a day a book was read. This is the READ behind it, and it lives
// here rather than in either of its two callers because both of them want the
// same set on the same terms: the sidebar's Calendar fold and the Calendar
// page (client/calendar/CalendarView.tsx). It was the sidebar's private hook
// until the calendar left the Sigils page in 3.18; a copy in the page would
// have been a second debounce to keep in step with this one.
//
// Admin only, because both routes are; a shelf that will not load costs the
// grid its marks and nothing else. One read when the caller turns it on, and
// one more a beat after the last save when the vault changes — the burst of
// autosaves a tick writes is ONE re-read, not one per frame.
//
// PER MOUNT, not per app: the fold and the page each keep their own settle
// timer, so with both open the vault's quiet costs two small GETs instead of
// one. That is the honest price of a hook, and it is the price the sidebar
// alone already paid; a module-level cache would buy a GET and sell the
// guarantee that what a caller mounts is what a caller reads.

import { useEffect, useState } from "react";
import { loggedDaysOf } from "../shared/calendar.ts";
import type { TrackerMeta } from "../shared/types.ts";
import { getRoutines, getTrackers } from "./api.ts";

/** How long after the last vault frame the set is re-read. */
const SETTLE_MS = 600;

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
      timer = setTimeout(read, SETTLE_MS);
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
