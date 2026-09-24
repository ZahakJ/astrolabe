// A NOTE'S DAYS — which calendar day a note belongs to, and what it says
// about the days it was written on. The Timeline (client/timeline/), Today's
// "On this day" and the year in review (shared/yearReview.ts) all read the
// vault by date, and every one of them needs the same three answers:
//
//   1. THE NOTE'S OWN DAY. A daily note is FOR a day, and that day is its
//      own whenever its file was made (`daily/2025-09-24.md` written a week
//      late is still the 24th's). Otherwise a frontmatter `date:` / `created:` / `published:`
//      that spells `YYYY-MM-DD` is a calendar day and names itself; any other
//      date the indexer holds (an `id` stamp, the created ledger of
//      server/created.ts) is an INSTANT, and is read in local time — a note
//      begun at 23:30 in Riyadh is a note of that evening, not of the next
//      UTC morning. The same rule the on-this-day list always kept
//      (server/indexer.ts `onThisDay`), in one place now, so the Timeline and
//      Today can never disagree about which day a note was written.
//   2. WHAT WAS CAUGHT IN IT. A line captured into a note lands under
//      `## Captured` as `- HH:MM text` (shared/capture.ts); the phone's share
//      sheet and a short voice note land in `Inbox/YYYY-MM-DD.md` as
//      `- HH:MM — text` (shared/voice.ts). Counted here, per note.
//   3. WHAT WAS SPOKEN IN IT. A recording is linked as `[[…#t=0|🎙]]`
//      (shared/voice.ts `recordingLink`); a long transcript is its own note,
//      `Inbox/Voice — <first words>.md`.
//
// PURE, like shared/dayAgenda.ts, which is what places these on the days:
// the server's indexer and the pocket's index both build the wire rows with
// it (`GET /api/timeline`), and tests/noteDays.test.ts pins every rule.

import { localIsoDay } from "./dates.ts";
import { periodicDateOf } from "./periodic.ts";
import { RECORDING_MARK, VOICE_INBOX } from "./voice.ts";

/** The frontmatter keys a note's own date is read from, in the indexer's
 *  order (server/indexer.ts `dateMs`). */
const OWN_DATE_KEYS = ["date", "created", "published"] as const;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** `YYYY-MM-DD` of an instant, in LOCAL time. */
export function localIso(ms: number): string {
  return localIsoDay(ms);
}

/** The calendar day a note belongs to: the first frontmatter date (in the
 *  indexer's order) that spells a day, else the local day of `dateMs`, the
 *  instant the indexer settled on. Null when there is neither. */
export function noteDayOf(props: Readonly<Record<string, string>>, dateMs: number): string | null {
  for (const key of OWN_DATE_KEYS) {
    const raw = props[key];
    if (raw === undefined || raw.trim() === "") continue;
    const m = DAY_RE.exec(raw.trim());
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    // The indexer's date came from this key too (it reads them in this
    // order), just not spelled as a day: the instant is the answer.
    break;
  }
  return dateMs > 0 ? localIso(dateMs) : null;
}

/** Where the instance keeps its daily notes and how it names them — the
 *  settings' `dailyFolder` and `dailyFormat` (shared/periodic.ts). */
export interface DailyRule {
  folder: string;
  format: string;
}

/** The day a daily note is FOR, when `path` is one under `rule`. */
export function dailyDayOf(path: string, rule: DailyRule | null): string | null {
  if (rule === null) return null;
  const d = periodicDateOf(rule.folder, rule.format, path);
  return d === null ? null : localIso(d.getTime());
}

/** A note's day with the daily rule first: the day a daily note is for, else
 *  `noteDayOf`. The one entry the server and the pocket call. */
export function dayOfNote(path: string, props: Readonly<Record<string, string>>, dateMs: number, rule: DailyRule | null): string | null {
  return dailyDayOf(path, rule) ?? noteDayOf(props, dateMs);
}

/** The day a `published:` frontmatter names, when it names one — the day a
 *  note went out, which may be long after the day it was written. */
export function publishedDayOf(props: Readonly<Record<string, string>>): string | null {
  const m = DAY_RE.exec((props.published ?? "").trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** The day an inbox note is FOR — `Inbox/2026-09-23.md` — or null. */
export function inboxDayOf(path: string): string | null {
  const m = new RegExp(`^${VOICE_INBOX}/(\\d{4}-\\d{2}-\\d{2})\\.md$`).exec(path);
  return m ? m[1] : null;
}

/** A long transcript's own note (`Inbox/Voice — …md`). */
export function isVoiceNotePath(path: string): boolean {
  return path.startsWith(`${VOICE_INBOX}/Voice — `) || path.startsWith(`${VOICE_INBOX}/Voice (`) || path === `${VOICE_INBOX}/Voice.md`;
}

const CAPTURED_HEADING = /^##\s+Captured\s*$/i;
const SECTION_END = /^#{1,2}\s/;
const STAMPED_ITEM = /^[-*+]\s+(?:[01]\d|2[0-3]):[0-5]\d(?:\s|$)/;
const FENCE = /^\s*(```|~~~)/;

/** How many stamped lines a note holds that were CAUGHT rather than written:
 *  every `- HH:MM …` item under `## Captured`, and — in an inbox note, where
 *  the share sheet and the voice sheet put them with no heading — every such
 *  item anywhere. Code fences are skipped; a nested line is part of its item. */
export function capturedLines(path: string, body: string): number {
  const inbox = inboxDayOf(path) !== null;
  let inSection = false;
  let fenced = false;
  let n = 0;
  for (const line of body.split(/\r?\n/)) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    if (CAPTURED_HEADING.test(line)) {
      inSection = true;
      continue;
    }
    if (SECTION_END.test(line)) {
      inSection = false;
      continue;
    }
    if ((inSection || inbox) && STAMPED_ITEM.test(line)) n += 1;
  }
  return n;
}

/** How many recordings a note links (`[[…|🎙]]` or an embedded one in a long
 *  transcript's note). */
export function voiceMarks(path: string, body: string): number {
  let n = 0;
  const mark = `|${RECORDING_MARK}]]`;
  for (let at = body.indexOf(mark); at !== -1; at = body.indexOf(mark, at + mark.length)) n += 1;
  if (n === 0 && isVoiceNotePath(path)) return 1;
  return n;
}
