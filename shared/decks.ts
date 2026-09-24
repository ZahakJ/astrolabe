// DECKS — the vault's own spaced-repetition study system, ORBITS: the
// contract, shared by the indexer, the API, the shelf and the session.
//
// A card comes back around on its schedule — that is what an orbit is, and
// why the page is called Orbits (المدارات). Inside it a DECK (مجموعة) is a
// note and a CARD (بطاقة) a line. (The system was built under the working
// name Constellations, a deck a constellation and a card a star; the owner
// renamed it before it shipped, and nothing a reader sees says the old
// words.) The owner: "screw Anki… let's make our own version and integrate
// it". Everything here stands on shared/cards.ts and shared/srs.ts and
// keeps their one promise: THE NOTE IS THE STATE. A deck is a note with a
// ```deck fence; its cards are the card lines the vault already reads
// (`Card` there is the line as scanned; `DeckCard` here is one face of it,
// named and directed); each card's schedule is the Obsidian Spaced
// Repetition plugin's comment, so the vault stays one vault with the plugin.
//
// The TYPES are the contract and do not change without telling the other
// worktrees. The functions are thin on purpose: scanCards already knows the
// lines, the pairs, the tags and the sections, and this module only applies
// the note's `kind` to what it found and gives each card a name.

import { closesFence, fenceOpener, sourceLines } from "./fences.ts";
import { clearSchedule, scanCards, writeSchedule, type Card } from "./cards.ts";
import { formatSrComments, type Schedule } from "./srs.ts";

/** How a deck's `::` lines become stars. */
export type DeckKind = "basic" | "reversed" | "both" | "typed" | "cloze-only";

/** A learning step, in minutes. */
export type Step = number;

export interface DeckCard {
  /** `${path}#${line}#${dir}` — stable across a session, unique in the vault. */
  id: string;
  path: string;
  /** 1-based line the star's block starts on; the schedule comment sits after `end`. */
  line: number;
  end: number;
  /** "fwd" is front→back; "rev" is the reversed twin a `:::` line makes. */
  dir: "fwd" | "rev";
  kind: "qa" | "cloze" | "quote";
  front: string;
  back: string;
  /** The optional third segment of `front::back::extra`: a reading, an example, a mnemonic. */
  extra: string | null;
  /** The nearest heading above the star, or null. */
  section: string | null;
  tags: string[];
  schedule: Schedule | null;
}

export interface Deck {
  path: string;
  title: string;
  icon: string | null;
  kind: DeckKind;
  newPerDay: number;
  /** Learning steps in minutes, e.g. [1, 10]; relearning is always [10]. */
  steps: Step[];
  tags: string[];
  sections: string[];
  cards: DeckCard[];
}

/** What GET /api/orbits returns per deck. */
export interface DeckMeta {
  path: string;
  title: string;
  icon: string | null;
  kind: DeckKind;
  tags: string[];
  /** The fence's session parameters, so the shelf can start a session
   *  without a second read: the daily new allowance and the learning steps
   *  in minutes. The implicit deck carries the defaults. */
  newPerDay: number;
  steps: Step[];
  /** The implicit "Everything else" deck, grouped from the whole vault. */
  implicit: boolean;
  counts: { total: number; new: number; due: number };
  sections: Array<{ name: string; total: number; due: number }>;
}

export const DECK_FENCE = "deck";
export const DEFAULT_STEPS: Step[] = [1, 10];
export const RELEARN_STEPS: Step[] = [10];
export const DEFAULT_NEW_PER_DAY = 10;
export const DEFAULT_FOLDER = "Orbits";
/** The `path` of the implicit "Everything else" deck on the wire:
 *  every card outside a deck note, its sections the vault's top
 *  folders. Not a note path, and no note can be called it. */
export const EVERYTHING_ELSE = "*";

export interface FenceHead {
  title: string | null;
  icon: string | null;
  kind: DeckKind;
  newPerDay: number;
  steps: Step[];
  tags: string[];
}

const KINDS: readonly DeckKind[] = ["basic", "reversed", "both", "typed", "cloze-only"];

/** Which deck fence this line opens, or null — the tracker's
 *  question (shared/tracker.ts trackerFenceKind), asked of our word. */
export function deckFenceOpens(line: string): boolean {
  const m = /^\s*(?:`{3,}|~{3,})\s*([^\s`~]*)\s*$/.exec(line);
  return m !== null && m[1].toLowerCase() === DECK_FENCE;
}

/** The fence's key: value lines, or null when the note has no fence.
 *
 *  Line-based on purpose, like the tracker: the body looks like YAML and is
 *  not, because "title: Lesson 3: verbs" must be a title and not a syntax
 *  error. Keys are matched with their spaces, hyphens, underscores and case
 *  folded away — `new per day`, `new-per-day` and `newPerDay` are one key —
 *  and unknown keys are ignored. An empty fence is still a deck:
 *  the fence is the declaration, the values are optional. */
export function parseDeckFence(md: string): FenceHead | null {
  const body = fenceBody(md);
  if (body === null) return null;
  const head: FenceHead = { title: null, icon: null, kind: "basic", newPerDay: DEFAULT_NEW_PER_DAY, steps: DEFAULT_STEPS.slice(), tags: [] };
  for (const raw of body) {
    const m = /^\s*([^:#][^:]*?)\s*:\s*(.*?)\s*$/.exec(raw);
    if (!m) continue;
    const key = m[1].toLowerCase().replace(/[\s_-]+/g, "");
    const value = m[2];
    if (key === "title") head.title = value || null;
    else if (key === "icon") head.icon = value || null;
    else if (key === "kind") {
      const kind = value.toLowerCase().replace(/[\s_]+/g, "-");
      if ((KINDS as readonly string[]).includes(kind)) head.kind = kind as DeckKind;
    } else if (key === "newperday") {
      const n = Number.parseInt(value, 10);
      if (Number.isFinite(n) && n >= 0) head.newPerDay = n;
    } else if (key === "steps") {
      const steps = parseSteps(value);
      if (steps.length > 0) head.steps = steps;
    } else if (key === "tags") {
      head.tags = value
        .split(/[,\s]+/)
        .map((tag) => tag.replace(/^#+/, "").toLowerCase())
        .filter((tag) => tag !== "");
    }
  }
  return head;
}

/** The lines inside the first ```deck fence, or null. Frontmatter
 *  is skipped so a `---` block cannot hide one, and the fence walk is
 *  shared/fences.ts' so a fence shown INSIDE a ```markdown block is
 *  documentation, not a declaration. */
function fenceBody(md: string): string[] | null {
  const lines = sourceLines(md);
  let inFrontmatter = lines[0]?.trim() === "---";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inFrontmatter) {
      if (i > 0 && (line.trim() === "---" || line.trim() === "...")) inFrontmatter = false;
      continue;
    }
    const fence = fenceOpener(line);
    if (!fence) continue;
    const ours = deckFenceOpens(line);
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length && !closesFence(lines[j], fence); j++) body.push(lines[j]);
    if (ours) return body;
    i = j;
  }
  return null;
}

/** "1m, 10m" → [1, 10]; "1h" is 60, "1d" 1440, a bare number is minutes.
 *  Zero and nonsense are dropped, so a typo cannot make a step that never
 *  comes due. */
export function parseSteps(value: string): Step[] {
  const out: Step[] = [];
  for (const part of value.split(/[,\s]+/)) {
    const m = /^(\d+(?:\.\d+)?)\s*(m|min|h|d)?$/i.exec(part);
    if (!m) continue;
    const n = Number(m[1]);
    const unit = (m[2] ?? "m").toLowerCase();
    const minutes = unit === "h" ? n * 60 : unit === "d" ? n * 1440 : n;
    if (minutes > 0) out.push(minutes);
  }
  return out;
}

/** Every star in the note, in document order, with the note's kind applied:
 *
 *   · basic / typed: a `::` line is one star front→back; a `:::` line is two.
 *   · both: every `::` line is a pair as well.
 *   · reversed: a `::` line is one star back→front; a `:::` line stays two.
 *   · cloze-only: only the ==highlight== cards, nothing else.
 *
 *  Block cards (`?`), clozes and quotes are always one star front→back —
 *  a reversed cloze would be a question with no answer. The twin of a pair
 *  keeps the line's `extra` on its answer side: a mnemonic helps both ways. */
export function scanDeckCards(md: string, path: string, kind: DeckKind): DeckCard[] {
  return deckCardsOf(scanCards(md), path, kind);
}

/** scanDeckCards over cards already scanned — the indexer holds every note's
 *  cards and not its text, and the implicit deck is read from them. */
export function deckCardsOf(cards: readonly Card[], path: string, kind: DeckKind): DeckCard[] {
  const out: DeckCard[] = [];
  for (const card of cards) {
    if (kind === "cloze-only" && card.kind !== "cloze") continue;
    const inline = card.kind === "qa" && card.end === card.line;
    const pair = card.reversed || (inline && kind === "both");
    const only = inline && !card.reversed && kind === "reversed" ? "rev" : "fwd";
    if (pair) {
      out.push(cardOf(card, path, "fwd", card.schedule));
      out.push(cardOf(card, path, "rev", card.scheduleRev));
    } else {
      out.push(cardOf(card, path, only, card.schedule));
    }
  }
  return out;
}

function cardOf(card: Card, path: string, dir: "fwd" | "rev", schedule: Schedule | null): DeckCard {
  const flipped = dir === "rev";
  return {
    id: `${path}#${card.line}#${dir}`,
    path,
    line: card.line,
    end: card.end,
    dir,
    kind: card.kind,
    front: flipped ? card.back : card.front,
    back: flipped ? card.front : card.back,
    extra: card.extra,
    section: card.section,
    tags: card.tags,
    schedule,
  };
}

/** The note as a deck, or null when it carries no fence. `title`
 *  is the note's own (the indexer's), used when the fence names none.
 *  `sections` are the headings that have at least one star under them, in
 *  document order — a heading over prose alone is not a lesson. */
export function deckOf(md: string, path: string, title: string): Deck | null {
  const head = parseDeckFence(md);
  if (!head) return null;
  const stars = scanDeckCards(md, path, head.kind);
  const sections: string[] = [];
  for (const star of stars) {
    if (star.section !== null && !sections.includes(star.section)) sections.push(star.section);
  }
  return {
    path,
    title: head.title ?? title,
    icon: head.icon,
    kind: head.kind,
    newPerDay: head.newPerDay,
    steps: head.steps,
    tags: head.tags,
    sections,
    cards: stars,
  };
}

/** The note text with one star's schedule written: the plugin's comment
 *  after the block, with two schedules in one comment for a `:::` pair.
 *
 *  Which slot a "rev" star owns depends on the line: the twin of a pair is
 *  the second schedule; the lone back→front star of a `reversed` note is the
 *  line's only card and owns the first. The note itself says which, through
 *  its fence — so a star from a note whose kind has since changed still
 *  lands in the slot the note now means. */
export function writeCardSchedule(md: string, star: DeckCard, schedule: Schedule): string {
  const slot = slotOf(md, star);
  return slot === null ? md : writeSchedule(md, star.line, schedule, slot);
}

/** The note text with one star's schedule put BACK — the session's undo.
 *  `restore` is the schedule the star had before the grade, written
 *  verbatim; null means it had none, and the comment the grade wrote is
 *  taken out (or the twin's slot kept, for a pair). The note is then the
 *  note it was, byte for byte, rather than re-graded from a guess. */
export function restoreCardSchedule(md: string, star: DeckCard, restore: Schedule | null): string {
  const slot = slotOf(md, star);
  if (slot === null) return md;
  return restore === null ? clearSchedule(md, star.line, slot) : writeSchedule(md, star.line, restore, slot);
}

function slotOf(md: string, star: DeckCard): 0 | 1 | null {
  if (star.dir !== "rev") return 0;
  const card = scanCards(md).find((c) => c.line === star.line);
  if (!card) return null;
  const kind = parseDeckFence(md)?.kind ?? "basic";
  return card.reversed || kind === "both" ? 1 : 0;
}

/** Where a new deck lands: `<folder>/<title>.md`. The title is
 *  made a filename by the rule the composer's extractions use
 *  (client/noteName.ts): the filesystem's forbidden set plus the three the
 *  vault forbids (`[`, `]`, `#`), because the shelf will spell this note as
 *  `[[title]]` in an orbit. An empty folder means the vault root. */
export function deckNotePath(folder: string | null | undefined, title: string): string {
  const base = title
    .replace(/[\\/:*?"<>|[\]#]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // A name that begins with a dot is a file the vault never lists — the
    // title "..." would make a note nobody could open.
    .replace(/^\.+/, "");
  const dir = (folder ?? DEFAULT_FOLDER).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").trim();
  return `${dir ? `${dir}/` : ""}${base || "Deck"}.md`;
}

export interface NewCard {
  front: string;
  back: string;
  extra?: string | null;
  section?: string | null;
  /** A `front:::back` pair — two stars on one line, the plugin's shape. */
  reversed?: boolean;
  /** A cloze paragraph: `front` is the whole line with its `==deletions==`
   *  already marked, and there is no back. */
  cloze?: boolean;
  /** Trailing `#tags` for the line, without the `#`. */
  tags?: string[];
  /** A schedule the card arrives with — an import's; a new note has none. */
  schedule?: Schedule | null;
  /** The twin's schedule, for a pair. */
  scheduleRev?: Schedule | null;
}

/** The line one card makes in the note, comment included, or null when
 *  the card has nothing the scanner would read back (no front; no back on
 *  a card that needs one). One rule for the modal and the importer alike:
 *
 *   · the text is folded to one line, and every `::` inside it is spaced
 *     to `: :` — a line is the syntax, and a second `::` would move the
 *     answer into the extra (`std::vector` reads back as `std: :vector`,
 *     which still says what it said; dropping a colon would not);
 *   · a front that BEGINS like Markdown structure is escaped with a
 *     backslash: `# of legs::8` is a heading to the scanner, `> ` a quote,
 *     `| ` a table row, `- [ ]` a task, and three backticks open a fence
 *     that swallows every card after it until the note ends. The backslash
 *     keeps the line a paragraph in every renderer and shows nothing;
 *   · a pair's comment carries two schedules, and when only one side has
 *     one the other takes the same — what the plugin itself writes when it
 *     first meets such a pair, and better than throwing a side's history
 *     away. A cloze's comment sits on the line after it, where the scanner
 *     reads a block's. */
export function cardLineOf(card: NewCard): string | null {
  // The fence's rule for a tag with a space in it, so `#a b` cannot read
  // back as a back that ends in " #a b".
  const tags = (card.tags ?? []).map((t) => t.replace(/^#+/, "").trim().replace(/[\s,]+/g, "-")).filter((t) => t !== "");
  const tail = tags.length > 0 ? ` ${tags.map((t) => `#${t}`).join(" ")}` : "";
  const front = escapeLead(segment(card.front));
  if (front === "") return null;
  if (card.cloze) {
    const comment = card.schedule ? `\n${formatSrComments([card.schedule])}` : "";
    return `${front}${tail}${comment}`;
  }
  const back = segment(card.back);
  if (back === "") return null;
  const extra = segment(card.extra ?? "");
  const sep = card.reversed ? ":::" : "::";
  let comment = "";
  if (card.reversed) {
    const one = card.schedule ?? card.scheduleRev ?? null;
    if (one) comment = formatSrComments([card.schedule ?? one, card.scheduleRev ?? one]);
  } else if (card.schedule) comment = formatSrComments([card.schedule]);
  return `${front}${sep}${back}${extra ? `::${extra}` : ""}${tail}${comment ? ` ${comment}` : ""}`;
}

/** The text of a new deck note: frontmatter title, the fence, then
 *  the cards as lines (`cardLineOf`) under their section headings, in the
 *  order given. Cards the scanner would not read back are dropped rather
 *  than written as lines nobody will study — the importer counts those
 *  before it gets here. */
export function serialiseDeck(head: { title: string; icon?: string | null; kind?: DeckKind; tags?: string[]; newPerDay?: number; titleInFence?: boolean }, cards: NewCard[]): string {
  // Every value in the fence is ONE LINE: a title, an icon or a tag holding
  // a newline would end the fence early and turn the rest of the head into
  // cards. The fence is line-based (parseDeckFence), so folding
  // is the whole of the escaping it needs.
  const title = oneLine(head.title);
  const icon = oneLine(head.icon ?? "");
  const lines: string[] = ["---", `title: ${yamlScalar(title)}`, "---", "", "```" + DECK_FENCE];
  // The shelf reads the FENCE's title, and the indexer names a note by its
  // file: a title the filename rule had to bend ("Lesson 3: verbs") is
  // written into the fence so the shelf still says what the reader typed.
  if (head.titleInFence || deckNotePath("", title) !== `${title}.md`) lines.push(`title: ${title}`);
  if (icon) lines.push(`icon: ${icon}`);
  lines.push(`kind: ${head.kind ?? "basic"}`);
  if (head.newPerDay !== undefined && head.newPerDay !== DEFAULT_NEW_PER_DAY && head.newPerDay >= 0) lines.push(`new per day: ${Math.floor(head.newPerDay)}`);
  // A tag is one word to the fence (it splits on commas and spaces), so a
  // tag typed with a space is joined the way the indexer spells tags.
  const tags = (head.tags ?? []).map((t) => t.replace(/^#+/, "").trim().replace(/[\s,]+/g, "-")).filter((t) => t !== "");
  if (tags.length > 0) lines.push(`tags: ${tags.join(", ")}`);
  lines.push("```", "");
  let section: string | null = null;
  for (const card of cards) {
    const line = cardLineOf(card);
    if (line === null) continue;
    const at = card.section?.trim() || null;
    if (at !== null && at !== section) {
      if (lines[lines.length - 1] !== "") lines.push("");
      lines.push(`## ${at.replace(/\s+/g, " ")}`, "");
      section = at;
    }
    lines.push(line);
    // A cloze is a paragraph; a blank line closes it so the next card does
    // not fold into it.
    if (card.cloze) lines.push("");
  }
  return lines.join("\n").replace(/\n+$/, "") + "\n";
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function segment(text: string): string {
  return text
    .replace(/\r?\n/g, " ")
    .replace(/:(?=:)/g, ": ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Idempotent: a front already escaped begins with the backslash and is
 *  left alone, so the importer's text and the modal's meet one rule. */
function escapeLead(front: string): string {
  return /^(?:#|>|\||`{3}|~{3}|[-*+]\s+\[)/.test(front) ? `\\${front}` : front;
}

/** A frontmatter title, quoted only when YAML would misread it bare. */
function yamlScalar(value: string): string {
  return /[:#"'[\]{}&*!|>%@`,?-]|^\s|\s$/.test(value) || value === "" ? JSON.stringify(value) : value;
}
