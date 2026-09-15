// FLASHCARDS — what the reader already marked, as cards to review.
//
// No new syntax is asked of anyone. Three things a note already holds are
// cards:
//
//   · `Question\n?\nAnswer` (the Spaced Repetition plugin's block form) and
//     the inline `Question::Answer` — front and back as written;
//   · `==a highlight==` inside a paragraph — a CLOZE: the paragraph with the
//     highlight blanked is the front, the highlight the back;
//   · `> [!quote]` callouts, including the PDF reader's citations — the
//     source and the opening words are the front, the whole quote the back.
//
// Constellations (shared/constellations.ts) read the same lines and add
// three things the plugin's syntax already allows:
//
//   · a third segment, `front::back::extra` — a reading, an example, a
//     mnemonic, shown on the answer side;
//   · `front:::back`, the plugin's REVERSED PAIR: one line, two cards, and
//     two schedules in one comment `<!--SR:!d,i,e!d,i,e-->`, front→back
//     first (that order is the plugin's, so the vault stays one vault);
//   · trailing `#tags` on a card line, and the nearest heading above a card
//     as its SECTION, so a shelf can study "Lesson 3 only".
//
// The schedule is the plugin's own comment (shared/srs.ts) on the line after
// the card's block, so Obsidian's plugin and Astrolabe review one vault.
// Pure, like shared/tracker.ts: the indexer scans with it, the review route
// writes with it, and the tests hold both.

import { closesFence, fenceOpener, sourceLines } from "./fences.ts";
import { EASE_START, formatSrComments, hasSrComment, parseSrComments, shiftDay, type Schedule } from "./srs.ts";

export type CardKind = "qa" | "cloze" | "quote";

export interface Card {
  kind: CardKind;
  /** 1-based line the card's block starts on (full source). */
  line: number;
  /** 1-based line of the block's LAST line — the SR comment sits after it. */
  end: number;
  front: string;
  back: string;
  /** The third `::` segment of an inline card, or null. */
  extra: string | null;
  /** A `front:::back` line: this card and its back→front twin share the line. */
  reversed: boolean;
  /** The first schedule in the comment — this card's own. */
  schedule: Schedule | null;
  /** The second schedule in the comment — the twin's, for a pair; otherwise null. */
  scheduleRev: Schedule | null;
  /** Trailing `#tags` on the card's line, lower-cased, without the `#`. */
  tags: string[];
  /** The nearest heading above the card, or null before the first. */
  section: string | null;
}

const CLOZE_RE = /==([^=\n]{1,200})==/g;
const HEADING_RE = /^\s{0,3}#{1,6}\s/;
/** The front of an inline card is one line's worth, not a paragraph. */
const FRONT_MAX = 400;
/** The comment at the end of an inline card's own line. */
const TRAILING_SR_RE = /\s*<!--\s*SR:[^>]*-->\s*$/;
/** `#tags` at the very end of a line — the indexer's tag shape, only trailing. */
const TRAILING_TAGS_RE = /(?:\s+#[\p{L}\p{N}_][\p{L}\p{N}_/-]*)+\s*$/u;

/** Every card in a note, in document order. */
export function scanCards(md: string): Card[] {
  const lines = sourceLines(md);
  const out: Card[] = [];
  let fence: ReturnType<typeof fenceOpener> = null;
  let inFrontmatter = lines[0]?.trim() === "---";
  let section: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inFrontmatter) {
      if (i > 0 && (line.trim() === "---" || line.trim() === "...")) inFrontmatter = false;
      continue;
    }
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    const opened = fenceOpener(line);
    if (opened) {
      fence = opened;
      continue;
    }
    if (HEADING_RE.test(line)) {
      section = headingText(line);
      continue;
    }
    // A line that is only a schedule belongs to the block above it. A line
    // that ENDS with one is an inline card that has been graded — skipping
    // it (as this once did) made every inline card vanish from the vault
    // the moment it was first reviewed.
    if (line.replace(TRAILING_SR_RE, "").trim() === "") continue;

    // A quote callout: `> [!quote] Source` then quoted lines.
    const quote = /^\s*>\s*\[!(quote|cite|citation)\]\s*(.*)$/i.exec(line);
    if (quote) {
      let j = i + 1;
      const body: string[] = [];
      while (j < lines.length && /^\s*>/.test(lines[j])) {
        body.push(lines[j].replace(/^\s*>\s?/, ""));
        j++;
      }
      const text = body.join("\n").trim();
      if (text !== "") {
        const source = quote[2].trim();
        const opening = text.split(/\s+/).slice(0, 6).join(" ");
        out.push(single("quote", i + 1, j, `${source ? `**${source}**\n\n` : ""}${opening}…`, text, scheduleAfter(lines, j), section));
      }
      i = j - 1;
      continue;
    }

    // The block form: a line, a lone `?`, then the answer lines.
    if (i + 2 < lines.length && lines[i + 1].trim() === "?" && !/^\s*>/.test(line)) {
      let j = i + 2;
      const answer: string[] = [];
      while (j < lines.length && lines[j].trim() !== "" && !hasSrComment(lines[j])) {
        answer.push(lines[j]);
        j++;
      }
      // The question may be several lines above the `?`, back to a blank.
      let s = i;
      while (s > 0 && lines[s - 1].trim() !== "" && !HEADING_RE.test(lines[s - 1]) && !hasSrComment(lines[s - 1])) s--;
      const question = lines.slice(s, i + 1).join("\n").trim();
      if (question !== "" && answer.length > 0) {
        out.push(single("qa", s + 1, j, question, answer.join("\n").trim(), scheduleAfter(lines, j), section));
      }
      i = j - 1;
      continue;
    }

    // Inline `Question::Answer`, `Question::Answer::Extra`, `Front:::Back`.
    const inline = parseInline(line);
    if (inline && !/^\s*[-*+]\s+\[/.test(line) && !line.trim().startsWith("|")) {
      // The comment is at the end of the card's own line, or alone on the
      // next one (the plugin's older placement). Never the NEXT card's.
      const slots = hasSrComment(line) ? slotsOf(line) : scheduleSlotsAfter(lines, i + 1);
      out.push({
        kind: "qa",
        line: i + 1,
        end: i + 1,
        front: inline.front,
        back: inline.back,
        extra: inline.extra,
        reversed: inline.reversed,
        schedule: slots[0] ?? null,
        scheduleRev: inline.reversed ? slots[1] ?? null : null,
        tags: inline.tags,
        section,
      });
      continue;
    }

    // A paragraph with ==highlights==: one cloze card per paragraph.
    const paraStart = i;
    let j = i;
    while (j < lines.length && lines[j].trim() !== "" && !/^\s*>/.test(lines[j]) && !HEADING_RE.test(lines[j]) && !hasSrComment(lines[j]) && !fenceOpener(lines[j])) j++;
    const para = lines.slice(paraStart, j).join("\n");
    const marks = [...para.matchAll(CLOZE_RE)].map((m) => m[1]);
    if (marks.length > 0) {
      out.push(single("cloze", paraStart + 1, j, para.replace(CLOZE_RE, "**[…]**"), marks.join(" · "), scheduleAfter(lines, j), section));
    }
    i = Math.max(i, j - 1);
  }
  return out;
}

/** A card that is one card: no twin, no extra, no line tags. */
function single(kind: CardKind, line: number, end: number, front: string, back: string, schedule: Schedule | null, section: string | null): Card {
  return { kind, line, end, front, back, extra: null, reversed: false, schedule, scheduleRev: null, tags: [], section };
}

/** `# Heading ##` → "Heading". */
function headingText(line: string): string {
  return line.replace(/^\s{0,3}#{1,6}\s+/, "").replace(/\s+#+\s*$/, "").trim();
}

interface InlineCard {
  front: string;
  back: string;
  extra: string | null;
  reversed: boolean;
  tags: string[];
}

/** The pieces of an inline card line, or null when the line is not one.
 *  `:::` is looked for first — to the `::` rule it would read as a front,
 *  an empty gap and a back beginning with a colon. */
function parseInline(line: string): InlineCard | null {
  const bare = line.replace(TRAILING_SR_RE, "");
  const tagsMatch = TRAILING_TAGS_RE.exec(bare);
  const text = tagsMatch ? bare.slice(0, tagsMatch.index) : bare;
  const tags = tagsMatch ? [...tagsMatch[0].matchAll(/#([^\s#]+)/g)].map((m) => m[1].toLowerCase()) : [];
  const pair = /^(.{1,400}?)\s?:::\s?(.+)$/.exec(text);
  const one = pair ?? /^(.{1,400}?)\s?::\s?(.+)$/.exec(text);
  if (!one) return null;
  const front = one[1].trim();
  if (front === "" || front.length > FRONT_MAX) return null;
  const rest = one[2];
  const split = /^(.+?)\s?::\s?(.+)$/.exec(rest);
  const back = (split ? split[1] : rest).trim();
  const extra = split ? split[2].trim() : null;
  if (back === "") return null;
  return { front, back, extra: extra || null, reversed: pair !== null, tags };
}

/** The schedule on the line after a block (0-based index of that line). */
function scheduleAfter(lines: string[], at: number): Schedule | null {
  return scheduleSlotsAfter(lines, at)[0] ?? null;
}

/** The schedules on the line after a block, when that line is a comment
 *  and nothing else — a following inline card's trailing comment is its own. */
function scheduleSlotsAfter(lines: string[], at: number): Array<Schedule | null> {
  const line = lines[at];
  if (line === undefined || line.replace(TRAILING_SR_RE, "").trim() !== "") return [];
  return slotsOf(line);
}

/** The comment's schedules with the PLACEHOLDER read as "none": a pair
 *  whose back→front twin was graded before its front→back card holds a
 *  zero-interval slot in first place (writeSchedule explains), and a card
 *  behind that slot is still new. */
function slotsOf(line: string): Array<Schedule | null> {
  return parseSrComments(line).map((s) => (s.interval === 0 ? null : s));
}

/** `md` with the card starting on `line` given `schedule`: the SR comment
 *  after its block replaced, or added on the line after it (an inline card
 *  takes the comment at the end of its own line). Every other byte kept.
 *
 *  `slot` is which schedule in the comment is being written — 0 for a card
 *  that is one card and for the front→back half of a pair, 1 for the
 *  back→front half. The plugin keeps the slots POSITIONAL and has no way to
 *  spell "the first is still new", so when the second half is graded first
 *  the first slot is filled with a placeholder the plugin can read (due
 *  today, interval 0, the starting ease) and scanCards reads back as
 *  "no schedule". Writing slot 0 later replaces it. */
export function writeSchedule(md: string, line: number, schedule: Schedule, slot: 0 | 1 = 0): string {
  const card = scanCards(md).find((c) => c.line === line);
  if (!card) return md;
  const eol = /\r\n/.test(md) ? "\r\n" : "\n";
  const lines = md.replace(/\r?\n$/, "").split(/\r?\n/);
  const trailing = /\r?\n$/.test(md);
  const slots: Schedule[] = [];
  if (slot === 0) {
    slots.push(schedule);
    if (card.scheduleRev) slots.push(card.scheduleRev);
  } else {
    slots.push(card.schedule ?? { due: shiftDay(schedule.due, -schedule.interval), interval: 0, ease: EASE_START });
    slots.push(schedule);
  }
  const comment = formatSrComments(slots);
  if (card.kind === "qa" && card.end === card.line) {
    // Inline card: comment on the same line.
    const idx = card.line - 1;
    const bare = lines[idx].replace(TRAILING_SR_RE, "");
    lines[idx] = `${bare} ${comment}`;
  } else {
    const after = card.end; // 0-based index of the line after the block
    if (lines[after] !== undefined && lines[after].replace(TRAILING_SR_RE, "").trim() === "" && hasSrComment(lines[after])) lines[after] = comment;
    else lines.splice(after, 0, comment);
  }
  return lines.join(eol) + (trailing ? eol : "");
}
