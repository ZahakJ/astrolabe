// What a Timeline row says, and the glyph it wears — the words from the
// dictionary, the glyphs drawn here, both shared by the two shells' chips
// and lists (./TimelineList.tsx, ./TimelineChips.tsx).

import { dateNamesLocale } from "../../shared/dates.ts";
import { siteDateIn } from "../dates.ts";
import { countPhrase, getLang, localeNum, t, tf, type I18nKey } from "../i18n.ts";
import { formatDuration } from "../trackerUnits.ts";
import type { ItemDetail, TimelineKind } from "./model.ts";

const KIND_LABEL: Record<TimelineKind, I18nKey> = {
  note: "timelineKindNote",
  daily: "timelineKindDaily",
  sigil: "timelineKindSigil",
  session: "timelineKindSession",
  voice: "timelineKindVoice",
  capture: "timelineKindCapture",
  published: "timelineKindPublished",
};

/** A date in the GREGORIAN calendar whatever the site prints days in, with
 *  the month names in the chrome's language (`dateNamesLocale` — the rule
 *  `siteDate` applies itself and `siteDateIn` leaves to its caller). */
export function gregorianDate(date: Date, locale: string, options: Intl.DateTimeFormatOptions): string {
  return siteDateIn(date, dateNamesLocale(locale, getLang()), "gregorian", options);
}

/** A month heading. The grouping is by the Gregorian month the ISO day falls
 *  in, so its name is the Gregorian month's whatever calendar the site
 *  prints days in. */
export function monthLabel(ym: string, locale: string): string {
  return gregorianDate(new Date(`${ym}-15T12:00:00`), locale, { month: "long", year: "numeric" }) || ym;
}

export function kindLabel(kind: TimelineKind): string {
  return t(KIND_LABEL[kind]);
}

/** The second line of a row. */
export function detailText(detail: ItemDetail): string {
  switch (detail.kind) {
    case "excerpt":
      return detail.text;
    case "sigil":
      return detail.note ?? (detail.of > 0 ? tf("timelineSigilDone", { done: localeNum(detail.done), of: localeNum(detail.of) }) : "");
    case "session": {
      const pages = detail.pages > 0 ? countPhrase(detail.pages, "pages") : "";
      const time = detail.minutes > 0 ? formatDuration(detail.minutes) : "";
      return [pages, time].filter(Boolean).join(" · ") || countPhrase(detail.sessions, "sessions");
    }
    case "catch": {
      const parts: string[] = [];
      if (detail.lines > 0) parts.push(tf("timelineCaught", { n: countPhrase(detail.lines, "lines") }));
      if (detail.voice > 0) parts.push(countPhrase(detail.voice, "recordings"));
      return parts.join(" · ");
    }
  }
}

const PATHS: Record<TimelineKind, string> = {
  // a page with a turned corner
  note: "M6 3h8l4 4v14H6zM14 3v4h4",
  // a leaf of a wall calendar
  daily: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  // the seal: a ring with its mark (the Sigils door's glyph)
  sigil: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M9 12.5l2 2 4-5",
  // an open book
  session: "M3 5c3-1 6-1 9 1c3-2 6-2 9-1v14c-3-1-6-1-9 1c-3-2-6-2-9-1zM12 6v14",
  // a microphone
  voice: "M9 3h6v11H9zM5 11a7 7 0 0 0 14 0M12 18v3",
  // a line caught: an arrow into a tray
  capture: "M12 3v10M8 9l4 4 4-4M4 15v5h16v-5",
  // a page going out
  published: "M5 12h11M12 7l5 5-5 5M20 4v16",
};

export function KindIcon({ kind }: { kind: TimelineKind }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[kind]} />
    </svg>
  );
}
