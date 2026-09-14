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
// The schedule is the plugin's own comment (shared/srs.ts) on the line after
// the card's block, so Obsidian's plugin and Astrolabe review one vault.
// Pure, like shared/tracker.ts: the indexer scans with it, the review route
// writes with it, and the tests hold both.

import { closesFence, fenceOpener, sourceLines } from "./fences.ts";
import { formatSrComment, hasSrComment, parseSrComment, type Schedule } from "./srs.ts";

export type CardKind = "qa" | "cloze" | "quote";

export interface Card {
  kind: CardKind;
  /** 1-based line the card's block starts on (full source). */
  line: number;
  /** 1-based line of the block's LAST line — the SR comment sits after it. */
  end: number;
  front: string;
  back: string;
  schedule: Schedule | null;
}

const QA_INLINE_RE = /^(.{1,400}?)\s?::\s?(.+)$/;
const CLOZE_RE = /==([^=\n]{1,200})==/g;
const HEADING_RE = /^\s{0,3}#{1,6}\s/;

/** Every card in a note, in document order. */
export function scanCards(md: string): Card[] {
  const lines = sourceLines(md);
  const out: Card[] = [];
  let fence: ReturnType<typeof fenceOpener> = null;
  let inFrontmatter = lines[0]?.trim() === "---";
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
    if (line.trim() === "" || HEADING_RE.test(line) || hasSrComment(line)) continue;

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
        out.push({ kind: "quote", line: i + 1, end: j, front: `${source ? `**${source}**\n\n` : ""}${opening}…`, back: text, schedule: scheduleAfter(lines, j) });
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
        out.push({ kind: "qa", line: s + 1, end: j, front: question, back: answer.join("\n").trim(), schedule: scheduleAfter(lines, j) });
      }
      i = j - 1;
      continue;
    }

    // Inline `Question::Answer`.
    const inline = QA_INLINE_RE.exec(line.replace(/\s*<!--\s*SR:[^>]*-->\s*$/, ""));
    if (inline && !line.includes("::") === false && !/^\s*[-*+]\s+\[/.test(line) && !line.trim().startsWith("|")) {
      out.push({ kind: "qa", line: i + 1, end: i + 1, front: inline[1].trim(), back: inline[2].trim(), schedule: parseSrComment(line) ?? scheduleAfter(lines, i + 1) });
      continue;
    }

    // A paragraph with ==highlights==: one cloze card per paragraph.
    const paraStart = i;
    let j = i;
    while (j < lines.length && lines[j].trim() !== "" && !/^\s*>/.test(lines[j]) && !HEADING_RE.test(lines[j]) && !hasSrComment(lines[j]) && !fenceOpener(lines[j])) j++;
    const para = lines.slice(paraStart, j).join("\n");
    const marks = [...para.matchAll(CLOZE_RE)].map((m) => m[1]);
    if (marks.length > 0) {
      out.push({
        kind: "cloze",
        line: paraStart + 1,
        end: j,
        front: para.replace(CLOZE_RE, "**[…]**"),
        back: marks.join(" · "),
        schedule: scheduleAfter(lines, j),
      });
    }
    i = Math.max(i, j - 1);
  }
  return out;
}

/** The schedule on the line after a block (0-based index of that line). */
function scheduleAfter(lines: string[], at: number): Schedule | null {
  const line = lines[at];
  if (line === undefined) return null;
  return parseSrComment(line);
}

/** `md` with the card starting on `line` given `schedule`: the SR comment
 *  after its block replaced, or added on the line after it (an inline card
 *  takes the comment at the end of its own line). Every other byte kept. */
export function writeSchedule(md: string, line: number, schedule: Schedule): string {
  const card = scanCards(md).find((c) => c.line === line);
  if (!card) return md;
  const eol = /\r\n/.test(md) ? "\r\n" : "\n";
  const lines = md.replace(/\r?\n$/, "").split(/\r?\n/);
  const trailing = /\r?\n$/.test(md);
  const comment = formatSrComment(schedule);
  if (card.kind === "qa" && card.end === card.line) {
    // Inline card: comment on the same line.
    const idx = card.line - 1;
    const bare = lines[idx].replace(/\s*<!--\s*SR:[^>]*-->\s*$/, "");
    lines[idx] = `${bare} ${comment}`;
  } else {
    const after = card.end; // 0-based index of the line after the block
    if (lines[after] !== undefined && hasSrComment(lines[after])) lines[after] = comment;
    else lines.splice(after, 0, comment);
  }
  return lines.join(eol) + (trailing ? eol : "");
}
