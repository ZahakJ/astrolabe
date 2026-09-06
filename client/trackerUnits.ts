// The units a tracker counts in, on their own so the right panel (entry
// bundle) can agree a count without pulling the reading renderer with it.
import type { CountUnit } from "./i18n.ts";
import type { TrackerKind } from "../shared/tracker.ts";

/** What each kind is counted in when the author names no `unit:`. These are
 *  countPhrase keys, not words: "130 pages" is "١٣٠ صفحات" in Arabic and a
 *  bare English noun on an Arabic card is exactly the half-translation
 *  check-i18n exists to catch. An author's own `unit:` is CONTENT and prints
 *  as they wrote it. */
export const KIND_UNIT: Record<TrackerKind, CountUnit> = {
  book: "pages",
  game: "hours",
  film: "minutes",
  show: "episodes",
  course: "lessons",
  project: "tasks",
  habit: "days",
};

/** An author's `unit:` that is one of the units the chrome already knows, in
 *  either language, so "chapters" on an Arabic card reads فصول and «صفحات»
 *  on an English one reads pages, with the count agreed. Anything else is
 *  the author's own word and prints as typed. */
const UNIT_WORDS: Record<string, CountUnit> = {
  page: "pages", pages: "pages", "صفحة": "pages", "صفحات": "pages",
  chapter: "chapters", chapters: "chapters", "فصل": "chapters", "فصول": "chapters",
  hour: "hours", hours: "hours", hrs: "hours", "ساعة": "hours", "ساعات": "hours",
  minute: "minutes", minutes: "minutes", min: "minutes", mins: "minutes", "دقيقة": "minutes", "دقائق": "minutes",
  episode: "episodes", episodes: "episodes", ep: "episodes", eps: "episodes", "حلقة": "episodes", "حلقات": "episodes",
  lesson: "lessons", lessons: "lessons", lecture: "lessons", lectures: "lessons", "درس": "lessons", "دروس": "lessons", "محاضرة": "lessons", "محاضرات": "lessons",
  task: "tasks", tasks: "tasks", "مهمة": "tasks", "مهام": "tasks",
  day: "days", days: "days", "يوم": "days", "أيام": "days",
};
export function unitKey(word: string | null): CountUnit | null {
  if (word === null) return null;
  return UNIT_WORDS[word.trim().toLowerCase()] ?? null;
}
