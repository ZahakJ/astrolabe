// "@tomorrow" → [[daily/2026-09-16|Wednesday]].
//
// Type `@` at the start of a word and a small completion opens, the slash
// menu's cousin: today, tomorrow, yesterday, next week, the seven weekdays —
// and whatever phrase is typed after the `@`, read by shared/naturalDate.ts
// ("in 3 days", "15 september", «بعد ٣ أيام», «الخميس القادم»). Each row
// shows the day it resolves to in the site's own calendar, and Enter puts a
// wikilink to THAT DAY'S DAILY NOTE where the `@` was — the folder and
// name the instance's periodic settings say (client/daily.ts), never a
// hard-coded `daily/`. The link's alias is the day as a reader would say it:
// the weekday name when the day is within a week, the full date otherwise.
// So a journal entry that says "see [[daily/2026-09-16|Wednesday]]" is a
// link a reader can follow AND a sentence a reader can read.
//
// A word start only, and never in code: `a@b.com` opens nothing, a `@` in a
// fenced block opens nothing, and a `@` after a letter is somebody's handle.
// The trigger is the character, the discipline is where it is allowed.

import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { dailyNotePath, loadPeriodic } from "../daily.ts";
import { siteDate } from "../dates.ts";
import { getLang } from "../i18n.ts";
import { useStore } from "../state.ts";
import { stripNoteExt } from "../../shared/noteFormat.ts";
import { naturalDateSuggestions, type NaturalDate } from "../../shared/naturalDate.ts";
import { inCodeOrLink } from "./syntaxSite.ts";

/** `@` plus what follows it on the line, up to the caret. The phrase may
 *  carry spaces ("in 3 days") and either script's digits; it stops at a
 *  second `@` or a bracket, which is where a phrase would have stopped
 *  being one. */
const MENTION_TAIL = /@([^@[\]\n]{0,40})$/u;

/** The link the row inserts, and its alias. */
function linkFor(row: NaturalDate): string {
  const locale = useStore.getState().blogLocale;
  const target = stripNoteExt(dailyNotePath(row.date));
  const alias = row.near
    ? siteDate(row.date, locale, { weekday: "long" })
    : siteDate(row.date, locale, { dateStyle: "long" });
  return `[[${target}|${alias}]]`;
}

function applyRow(row: NaturalDate) {
  return (view: EditorView, _c: Completion, from: number, to: number): void => {
    const insert = linkFor(row);
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
      userEvent: "input.complete",
    });
  };
}

export async function dateMentionSource(context: CompletionContext): Promise<CompletionResult | null> {
  const match = context.matchBefore(MENTION_TAIL);
  if (!match) return null;
  // A WORD START: the line's beginning, whitespace, or an opening bracket
  // or quote. Anything else glued to the `@` — a letter, a digit, a dot — is
  // an address or a handle, and a date popup on `me@` would be the
  // autocomplete-on-syntax this codebase refuses everywhere.
  const before = context.state.sliceDoc(Math.max(0, match.from - 1), match.from);
  if (before !== "" && !/[\s([{«"'“‘]/.test(before)) return null;
  if (inCodeOrLink(context.state, match.from)) return null;
  // The periodic settings decide the link's folder and name; the first
  // popup of a session may have to fetch them, every later one reads the
  // cache.
  await loadPeriodic();
  const typed = match.text.slice(1);
  const rows = naturalDateSuggestions(typed, new Date(), getLang());
  if (rows.length === 0) return null;
  const locale = useStore.getState().blogLocale;
  const options: Completion[] = rows.map((row, i) => ({
    label: row.phrase,
    // The day it resolves to, in the site's calendar — so «الخميس القادم»
    // shows its Hijri date on a Hijri instance and "next thursday" its
    // Gregorian one on the default. The row's whole promise is this line.
    detail: siteDate(row.date, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    type: "text",
    boost: rows.length - i, // the module's order, not CodeMirror's scorer
    apply: applyRow(row),
  }));
  return {
    from: match.from,
    options,
    // We ranked and we filtered — the source re-runs per keystroke, which
    // is how "in 3 d" closes the popup and "in 3 days" reopens it.
    filter: false,
  };
}
