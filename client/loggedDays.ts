// THE DAYS THE VAULT KEPT — the month grid's second mark, in one place.
//
// `loggedDaysOf` (shared/calendar.ts) is the arithmetic: a day a sigil logged
// a line, or a day a book was read. This is the READ behind it.
//
// ONE CALLER, the sidebar's Calendar fold. It was Sidebar.tsx's private hook
// until 3.18; it was lifted out on the way to a second caller that, in the
// end, does not want it — the Calendar page names what each day HELD, which
// is a richer read than a set of dates (shared/dayAgenda.ts), so it makes its
// own. The hook stays out here anyway: Sidebar.tsx is the largest component
// in the client and a self-contained read with its own debounce is easier to
// find, and to reason about, under its own name.
//
// Admin only, because both routes are; a shelf that will not load costs the
// grid its marks and nothing else. One read when the caller turns it on, and
// one more a beat after the last save when the vault changes — the burst of
// autosaves a tick writes is ONE re-read, not one per frame.

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
