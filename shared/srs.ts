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

export const SR_RE = /<!--\s*SR:!?(\d{4}-\d{2}-\d{2}),(\d+),(\d+)\s*-->/;

export function parseSrComment(text: string): Schedule | null {
  const m = SR_RE.exec(text);
  if (!m) return null;
  return { due: m[1], interval: Number(m[2]), ease: Number(m[3]) };
}

export function formatSrComment(s: Schedule): string {
  return `<!--SR:!${s.due},${s.interval},${s.ease}-->`;
}

export function hasSrComment(text: string): boolean {
  return SR_RE.test(text);
}

function shift(iso: string, days: number): string {
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
  return { due: shift(today, interval), interval, ease };
}

export function isDue(s: Schedule | null, today: string): boolean {
  return s === null || s.due <= today;
}
