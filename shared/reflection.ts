// THE EVENING REFLECTION — the text arithmetic behind Today's last prompt,
// "How did the day go?" (docs/today.md).
//
// After six in the evening, Today asks one question with one field under it,
// and what is typed lands in the day's own note under `## Reflection`. The
// heading is the address, as `## Captured` is the capture sheet's
// (shared/capture.ts): English in every language, so a template can carry it,
// a query can find it, and a month of daily notes reads alike. A daily
// template that already writes an empty `## Reflection` is the common case
// and the reason for this module's one rule: NEVER A SECOND HEADING. When the
// note has the heading, the text goes at the end of that section; only a
// note without one gets the heading appended.
//
// Pure, like shared/capture.ts: the client computes the next content and
// writes it through the section door (client/sectionActions.ts
// `applyNoteContent` — the open editor's buffer first, the API otherwise),
// and tests/reflection.test.ts pins the bytes.

/** The heading the reflection lives under. An address, not chrome. */
export const REFLECTION_HEADING = "## Reflection";

const HEADING_LINE = /^##\s+Reflection\s*$/i;
/** A heading that ENDS the section: level one or two. A `###` under it is
 *  part of it. */
const SECTION_END = /^#{1,2}\s/;
const FENCE = /^\s*(```|~~~)/;

/** The hour the question starts being asked, local time. */
export const EVENING_HOUR = 18;

export function isEvening(now: Date): boolean {
  return now.getHours() >= EVENING_HOUR;
}

/** Where the reflection section is: the heading's line index and the index
 *  one past its last line. Headings inside a code fence are not headings. */
function sectionOf(lines: readonly string[]): { at: number; end: number } | null {
  let fenced = false;
  let at = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    if (at === -1) {
      if (HEADING_LINE.test(line)) at = i;
      continue;
    }
    if (SECTION_END.test(line)) return { at, end: i };
  }
  return at === -1 ? null : { at, end: lines.length };
}

/** What the day's note says under `## Reflection`, trimmed: null when there
 *  is no such heading, "" when the heading is there with nothing under it
 *  (a template's empty section — the question is still open). */
export function reflectionOf(content: string): string | null {
  const lines = content.split(/\r?\n/);
  const found = sectionOf(lines);
  if (found === null) return null;
  return lines.slice(found.at + 1, found.end).join("\n").trim();
}

/** `content` with `text` added under `## Reflection`: at the end of the
 *  section when the note has one (a blank line between it and what is there
 *  already), else as a new section at the end of the note. Line endings
 *  follow the note's own; the text's own lines are kept. */
export function appendReflection(content: string, text: string): string {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const clean = text.replace(/\r\n?/g, "\n").replace(/^\n+|\n+$/g, "").trim();
  if (clean === "") return content;
  const block = clean.split("\n");
  const lines = content.split(eol);
  const found = sectionOf(lines);
  if (found === null) {
    const body = content.replace(/\s+$/, "");
    const head = body === "" ? "" : `${body}${eol}${eol}`;
    return `${head}${REFLECTION_HEADING}${eol}${eol}${block.join(eol)}${eol}`;
  }
  // After the section's last non-blank line, so a blank line the note keeps
  // before the next heading stays where it is.
  let last = found.end - 1;
  while (last > found.at && lines[last].trim() === "") last--;
  // …and a heading straight after the section gets a blank line back.
  const tail = last + 1 === found.end && found.end < lines.length ? [""] : [];
  lines.splice(last + 1, 0, "", ...block, ...tail);
  let out = lines.join(eol);
  if (!out.endsWith(eol)) out += eol;
  return out;
}
