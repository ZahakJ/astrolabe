// THE SHELF'S ARITHMETIC. Three small sums the shelf and the stats drawer
// draw from what the stars already say — the streak from the device's log,
// the forecast and the new/young/mature split from the schedules in the
// notes. None of it is session logic (that is shared/srsSession.ts, the
// machine every grade goes through), so it lives beside the views that
// read it, pure and node-testable like the machine.

import type { DeckCard } from "../../shared/decks.ts";

/** Days with at least one grade, counted back from `today` without a gap —
 *  the shelf's streak. `days` are ISO days that saw a session, any order. */
export function streakOf(days: Iterable<string>, today: string): number {
  const set = new Set(days);
  let n = 0;
  let d = today;
  // A reader who has not studied YET today keeps yesterday's streak on the
  // shelf; the count only breaks once a whole day passed without a session.
  if (!set.has(d)) d = shiftDay(d, -1);
  while (set.has(d)) {
    n += 1;
    d = shiftDay(d, -1);
  }
  return n;
}

export function shiftDay(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Stars due on each of the next `days` days, from their schedules — the
 *  forecast. Index 0 is today (overdue stars included there). */
export function forecast(stars: DeckCard[], today: string, days = 30): number[] {
  const out = new Array<number>(days).fill(0);
  const last = shiftDay(today, days - 1);
  for (const s of stars) {
    if (s.schedule === null) continue;
    const due = s.schedule.due;
    if (due <= today) out[0] += 1;
    else if (due <= last) {
      const i = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
      if (i >= 0 && i < days) out[i] += 1;
    }
  }
  return out;
}

/** New / learning / young / mature, as Anki draws them: young is a schedule
 *  under 21 days, mature 21 and over. "Learning" is session-local and the
 *  note cannot say it, so it is what the caller's session knows. */
export function statesOf(stars: DeckCard[], learningIds: Set<string> = new Set()): { new: number; learning: number; young: number; mature: number } {
  const out = { new: 0, learning: 0, young: 0, mature: 0 };
  for (const s of stars) {
    if (learningIds.has(s.id)) out.learning += 1;
    else if (s.schedule === null) out.new += 1;
    else if (s.schedule.interval < 21) out.young += 1;
    else out.mature += 1;
  }
  return out;
}
