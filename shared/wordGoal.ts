// A note's word goal: `goal: 3000` in its frontmatter.
//
// An essay written to a length — a forum post with a ceiling, a chapter with
// a target — wants the count beside the target, not a number to compare in
// one's head. The goal is a property of the note, so it travels with the
// vault and reads the same in Obsidian; the status bar draws it against the
// live count (shared/wordCount.ts), and nothing else changes.

const DIGITS = /[٠-٩۰-۹]/g;

/** The leading frontmatter's `goal:` as a word count, or null. Only a plain
 *  number counts (`3000`, `3,000`, `3 000`, `٣٠٠٠`); `goal: finish draft`
 *  is somebody's own property, and is left alone. */
export function wordGoalOf(src: string): number | null {
  if (!src.startsWith("---\n") && !src.startsWith("---\r\n")) return null;
  const end = src.search(/\r?\n---(\r?\n|$)/);
  if (end < 0) return null;
  const m = /^goal:[ \t]*["']?([0-9٠-٩۰-۹][0-9٠-٩۰-۹,_  ]*)["']?[ \t]*$/m.exec(src.slice(0, end));
  if (!m) return null;
  const n = Number(
    m[1]
      .replace(DIGITS, (d) => String((d.charCodeAt(0) - (d >= "۰" ? 0x6f0 : 0x660)) % 10))
      .replace(/[,_  ]/g, ""),
  );
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** How far `words` has come toward `goal`, 0–1. */
export function goalProgress(words: number, goal: number): number {
  return Math.max(0, Math.min(1, words / goal));
}
