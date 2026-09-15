// SPACED REPETITION — SM-2, and the plugin's comment that records it.
//
// A card's schedule is written into the note as the Obsidian Spaced
// Repetition plugin writes it — `<!--SR:!2026-09-27,4,250-->`: the due day,
// the interval in days, the ease ×1000 — so a vault reviewed there and here
// is one vault. Pure; tested in tests/srs.test.ts.

export type Grade = "again" | "hard" | "good" | "easy";

export interface Schedule {
  /** ISO day the card is due. */
  due: string;
  /** Days between the last review and the due day. */
  interval: number;
  /** Ease factor ×1000 (2500 = 2.5). */
  ease: number;
}

export const EASE_START = 2500;
export const EASE_MIN = 1300;

// One comment may hold SEVERAL schedules, `!` after `!`: that is how the
// plugin records a `front:::back` pair (front→back first, back→front
// second) and a paragraph with more than one cloze. The first group is the
// first schedule; the tail group catches the rest so the whole comment
// matches — a two-schedule comment used to match NOTHING here, which left
// it visible in the reading view and made the pair's cards look new.
export const SR_RE = /<!--\s*SR:!?(\d{4}-\d{2}-\d{2}),(\d+),(\d+)((?:!\d{4}-\d{2}-\d{2},\d+,\d+)*)\s*-->/;
const SR_SLOT_RE = /!?(\d{4}-\d{2}-\d{2}),(\d+),(\d+)/g;

/** The FIRST schedule in the comment — every card that is one card. */
export function parseSrComment(text: string): Schedule | null {
  const m = SR_RE.exec(text);
  if (!m) return null;
  return { due: m[1], interval: Number(m[2]), ease: Number(m[3]) };
}

/** Every schedule in the comment, in slot order; empty when there is none. */
export function parseSrComments(text: string): Schedule[] {
  const m = SR_RE.exec(text);
  if (!m) return [];
  const out: Schedule[] = [];
  for (const slot of `${m[1]},${m[2]},${m[3]}${m[4]}`.matchAll(SR_SLOT_RE)) {
    out.push({ due: slot[1], interval: Number(slot[2]), ease: Number(slot[3]) });
  }
  return out;
}

export function formatSrComment(s: Schedule): string {
  return `<!--SR:!${s.due},${s.interval},${s.ease}-->`;
}

/** The plugin's multi-schedule comment: `<!--SR:!d,i,e!d,i,e-->`. */
export function formatSrComments(list: readonly Schedule[]): string {
  return `<!--SR:${list.map((s) => `!${s.due},${s.interval},${s.ease}`).join("")}-->`;
}

export function hasSrComment(text: string): boolean {
  return SR_RE.test(text);
}

/** `iso` moved by `days` in UTC arithmetic — a due day is a calendar day,
 *  and DST has no business in it. */
export function shiftDay(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** SM-2, as the plugin applies it. A new card's first "good" is one day,
 *  its second six, then interval × ease. "hard" halves the growth and
 *  lowers the ease; "easy" grows faster and raises it; "again" resets to a
 *  day and lowers the ease. Ease never drops under 1.3. */
export function review(prev: Schedule | null, grade: Grade, today: string): Schedule {
  let ease = prev?.ease ?? EASE_START;
  let interval: number;
  const last = prev?.interval ?? 0;
  if (grade === "again") {
    ease = Math.max(EASE_MIN, ease - 200);
    interval = 1;
  } else if (grade === "hard") {
    ease = Math.max(EASE_MIN, ease - 150);
    interval = Math.max(1, Math.round(last * 1.2) || 1);
  } else if (grade === "good") {
    interval = last === 0 ? 1 : last === 1 ? 6 : Math.round((last * ease) / 1000);
  } else {
    ease = ease + 150;
    interval = last === 0 ? 4 : last === 1 ? 8 : Math.round((last * ease * 1.3) / 1000);
  }
  interval = Math.min(interval, 36500);
  return { due: shiftDay(today, interval), interval, ease };
}

export function isDue(s: Schedule | null, today: string): boolean {
  return s === null || s.due <= today;
}
