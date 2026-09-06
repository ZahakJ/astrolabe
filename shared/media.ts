// THE MEDIA PAGE'S NOTES — where a new work goes and what its fence says.
//
// A work on the Media page IS a note carrying one ```tracker fence (the
// tracker feature, shared/tracker.ts); the page is a view over every such
// note plus a form that writes one. Pure, so the note path and the fence a
// form composes are tested under node.

import { setTrackerFields, type TrackerFields, type TrackerKind } from "./tracker.ts";

export const MEDIA_ROOT = "Media";

/** The folder each kind files under. Anything else takes its own word,
 *  capitalised, so a "podcast" lands in Media/Podcast. */
export const MEDIA_FOLDERS: Record<TrackerKind, string> = {
  book: "Books",
  game: "Games",
  film: "Films",
  show: "Shows",
  course: "Courses",
  project: "Projects",
  habit: "Habits",
};

/** A title as a file name: no path separators, no leading dot, trimmed. */
export function mediaFileName(title: string): string {
  const clean = title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  return (clean || "Untitled").slice(0, 120);
}

export function mediaNotePath(kind: TrackerKind | string, title: string): string {
  const word = kind.trim();
  const folder = (MEDIA_FOLDERS as Record<string, string>)[word] ?? (word ? word[0].toUpperCase() + word.slice(1) : "Other");
  return `${MEDIA_ROOT}/${folder}/${mediaFileName(title)}.md`;
}

/** The fence body a new work gets, from the form's fields, in the fixed
 *  order setTrackerFields writes. */
export function mediaFenceBody(fields: TrackerFields & { title: string }): string {
  return setTrackerFields("", fields);
}

/** The whole note: the title as frontmatter, then the fence. */
export function mediaNoteContent(fields: TrackerFields & { title: string }): string {
  const title = fields.title.replace(/"/g, "'");
  return `---\ntitle: "${title}"\n---\n\n\`\`\`tracker\n${mediaFenceBody(fields)}\`\`\`\n`;
}

/** The progress line a form writes: `done/total`, or `done` alone when the
 *  total is open-ended (hours of a game nobody has timed). A bare number is
 *  read as a percentage by the parser, so an open-ended count is written with
 *  its unit spelled beside it on the `unit:` line and a `total` of none. */
export function mediaProgress(done: number, total: number | null): string {
  const d = Math.max(0, Math.round(done * 100) / 100);
  if (total === null || !(total > 0)) return `${d}/?`;
  return `${d}/${Math.round(total * 100) / 100}`;
}
