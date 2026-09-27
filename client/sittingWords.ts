// How a day's sittings are SAID — the calendar's day pane, the Timeline, the
// weekly review. One place, so the mark means one thing wherever it appears:
// `~` before the time when any of it was estimated from a move of the
// progress bar (shared/sittings.ts) rather than counted by the reader's clock.
// Its own module, not trackerUnits.ts: that one rides in the entry bundle,
// and every caller of this is a lazy page.

import { ESTIMATE_MARK } from "../shared/tracker.ts";
import { countPhrase, localeNum, t } from "./i18n.ts";
import { formatDuration, unitKey } from "./trackerUnits.ts";

/** "41 min", or "~41 min" when any of those minutes were estimated. */
export function sittingDuration(minutes: number, estimated: number): string {
  const text = formatDuration(minutes);
  return estimated > 0 ? `${ESTIMATE_MARK}${text}` : text;
}

/** What the sittings covered: the pages, and any count kept in another unit
 *  ("2 chapters"), agreed and translated when the chrome knows the word. */
export function sittingAmount(pages: number, units: readonly { unit: string; count: number }[] = []): string {
  const parts: string[] = [];
  if (pages > 0 || units.length === 0) parts.push(countPhrase(pages, "pages"));
  for (const u of units) {
    const key = unitKey(u.unit);
    parts.push(key !== null ? countPhrase(u.count, key) : `${localeNum(u.count)} ${u.unit}`);
  }
  return parts.join(" · ");
}

/** The pane's word under an estimated row: from the reader's own pace, or
 *  from the stated defaults (docs/trackers.md says which numbers). */
export function estimateNote(defaultPace: boolean): string {
  return t(defaultPace ? "sittingEstimated" : "sittingEstimatedPace");
}
