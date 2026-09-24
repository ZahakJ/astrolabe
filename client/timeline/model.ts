// THE TIMELINE'S MODEL — the vault by date, as rows (docs/timeline.md).
//
// WHAT HAPPENED ON A DAY IS NOT DECIDED HERE. shared/dayAgenda.ts — the
// Calendar's aggregation, extended for this page with the notes written,
// published and caught on a day — places everything on its day; this module
// only reads its answer out as a list: one ITEM per thing the day held, then
// the items grouped by month and day into ROWS a virtual list can draw.
//
// A VIRTUAL LIST NEEDS HEIGHTS BEFORE IT HAS A DOM. A vault can hold thousands
// of days; the list mounts only the rows in view, and to know which rows those
// are it has to know where every row sits without drawing it. So every row
// kind has a fixed height (`ROW_HEIGHT`), the stylesheet draws exactly that
// height (client/styles/timeline.css pins the same numbers), and the layout is
// a prefix sum — a scroll is a binary search, a month jump is a lookup.
//
// PURE — no store, no DOM — so tests/timelineModel.test.ts loads it.

import type { DayAgenda } from "../../shared/dayAgenda.ts";

export type TimelineKind = "note" | "daily" | "sigil" | "session" | "voice" | "capture" | "published";

/** In the order the chips show them. */
export const TIMELINE_KINDS: readonly TimelineKind[] = ["note", "daily", "sigil", "session", "voice", "capture", "published"];

/** What a row says under its title, as data; the view words it. */
export type ItemDetail =
  | { kind: "excerpt"; text: string }
  | { kind: "sigil"; done: number; of: number; note: string | null }
  | { kind: "session"; pages: number; minutes: number; sessions: number }
  | { kind: "catch"; lines: number; voice: number };

export interface TimelineItem {
  /** Stable across re-reads: kind, day and what it is. */
  key: string;
  kind: TimelineKind;
  iso: string;
  path: string;
  /** For a sigil, which fence of the note. */
  index: number | null;
  title: string;
  detail: ItemDetail;
  /** The note's top folder ("" for the vault's root). */
  folder: string;
  tags: readonly string[];
}

/** Every item the days hold, newest day first; within a day, the day's own
 *  note first, then what was written, published and caught, then the sigils
 *  and the sittings — the order a day is remembered in. `tagsOf` gives a
 *  path's tags (the Timeline's notes carry them), so a daily note or a
 *  sigil's note can be filtered by tag too. */
export function itemsOf(days: readonly string[], agenda: ReadonlyMap<string, DayAgenda>, tagsOf: (path: string) => readonly string[]): TimelineItem[] {
  const out: TimelineItem[] = [];
  const sorted = [...days].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  for (const iso of sorted) {
    const day = agenda.get(iso);
    if (day === undefined) continue;
    const push = (kind: TimelineKind, path: string, title: string, detail: ItemDetail, index: number | null = null, suffix = ""): void => {
      out.push({ key: `${kind}:${iso}:${path}${index === null ? "" : `#${index}`}${suffix}`, kind, iso, path, index, title, detail, folder: topFolder(path), tags: tagsOf(path) });
    };
    if (day.note !== null) push("daily", day.note, titleOf(day.note), { kind: "excerpt", text: day.noteExcerpt ?? "" });
    for (const n of day.written) push(n.kind === "voice" ? "voice" : "note", n.path, n.title, { kind: "excerpt", text: n.excerpt });
    for (const n of day.published) push("published", n.path, n.title, { kind: "excerpt", text: n.excerpt });
    for (const c of day.caught) {
      if (c.lines > 0 || c.voice === 0) push("capture", c.path, c.title, { kind: "catch", lines: c.lines, voice: c.voice });
      else push("voice", c.path, c.title, { kind: "catch", lines: 0, voice: c.voice }, null, ":catch");
    }
    for (const s of day.sigils) push("sigil", s.path, s.title, { kind: "sigil", done: s.done, of: s.of, note: s.note }, s.index);
    for (const tr of day.trackers) push("session", tr.path, tr.title, { kind: "session", pages: tr.pages, minutes: tr.minutes, sessions: tr.sessions }, tr.index);
  }
  return out;
}

function titleOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  return base.replace(/\.(md|tex)$/i, "");
}

export function topFolder(path: string): string {
  const slash = path.indexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

export interface TimelineFilter {
  /** Empty: every kind. */
  kinds: ReadonlySet<TimelineKind>;
  folder: string | null;
  tag: string | null;
}

export const NO_FILTER: TimelineFilter = { kinds: new Set(), folder: null, tag: null };

export function filterItems(items: readonly TimelineItem[], filter: TimelineFilter): TimelineItem[] {
  return items.filter(
    (it) =>
      (filter.kinds.size === 0 || filter.kinds.has(it.kind)) &&
      (filter.folder === null || it.folder === filter.folder) &&
      (filter.tag === null || it.tags.some((t) => t.toLowerCase() === filter.tag!.toLowerCase())),
  );
}

/** A chip's choices with how many items each holds, most first. */
export function countBy(items: readonly TimelineItem[], of: (it: TimelineItem) => readonly string[]): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const it of items) for (const v of new Set(of(it))) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
}

export function kindCounts(items: readonly TimelineItem[]): Map<TimelineKind, number> {
  const out = new Map<TimelineKind, number>();
  for (const it of items) out.set(it.kind, (out.get(it.kind) ?? 0) + 1);
  return out;
}

// ── Rows ─────────────────────────────────────────────────────────────────────

export type TimelineRow =
  | { type: "month"; key: string; ym: string; count: number }
  | { type: "day"; key: string; iso: string }
  | { type: "item"; key: string; item: TimelineItem };

/** The fixed height of each row kind, in CSS pixels — the stylesheet's own
 *  numbers (client/styles/timeline.css). An item is two lines and a thumb's
 *  reach (≥ 44px on a phone). */
export const ROW_HEIGHT: Record<TimelineRow["type"], number> = { month: 52, day: 32, item: 60 };

/** The items, grouped month → day, as the rows the list draws. The items must
 *  already be newest first (`itemsOf`'s order, kept by `filterItems`). */
export function rowsOf(items: readonly TimelineItem[]): TimelineRow[] {
  const monthCount = new Map<string, number>();
  for (const it of items) monthCount.set(it.iso.slice(0, 7), (monthCount.get(it.iso.slice(0, 7)) ?? 0) + 1);
  const out: TimelineRow[] = [];
  let month = "";
  let day = "";
  for (const it of items) {
    const ym = it.iso.slice(0, 7);
    if (ym !== month) {
      month = ym;
      day = "";
      out.push({ type: "month", key: `m:${ym}`, ym, count: monthCount.get(ym) ?? 0 });
    }
    if (it.iso !== day) {
      day = it.iso;
      out.push({ type: "day", key: `d:${it.iso}`, iso: it.iso });
    }
    out.push({ type: "item", key: it.key, item: it });
  }
  return out;
}

export interface Layout {
  /** The top of each row. */
  tops: number[];
  total: number;
}

export function layoutOf(rows: readonly TimelineRow[], heights: Record<TimelineRow["type"], number> = ROW_HEIGHT): Layout {
  const tops = new Array<number>(rows.length);
  let y = 0;
  for (let i = 0; i < rows.length; i++) {
    tops[i] = y;
    y += heights[rows[i].type];
  }
  return { tops, total: y };
}

/** The rows to mount for a viewport at `scrollTop` of `height`, with
 *  `overscan` pixels either side: [first, last) indices. */
export function visibleRange(layout: Layout, scrollTop: number, height: number, overscan = 400): [number, number] {
  const { tops } = layout;
  if (tops.length === 0) return [0, 0];
  const from = Math.max(0, scrollTop - overscan);
  const to = scrollTop + height + overscan;
  // The last row whose top is at or above `from`.
  let lo = 0;
  let hi = tops.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tops[mid] <= from) lo = mid;
    else hi = mid - 1;
  }
  let end = lo;
  while (end < tops.length && tops[end] < to) end++;
  return [lo, end];
}

/** The months, newest first, with their counts and where each begins — the
 *  side rail on the desktop and the sheet on a phone. */
export function monthsOf(rows: readonly TimelineRow[], layout: Layout): { ym: string; count: number; top: number }[] {
  const out: { ym: string; count: number; top: number }[] = [];
  rows.forEach((row, i) => {
    if (row.type === "month") out.push({ ym: row.ym, count: row.count, top: layout.tops[i] });
  });
  return out;
}

/** Which month a scroll position is inside — the rail's highlighted row. */
export function monthAt(months: readonly { ym: string; top: number }[], scrollTop: number): string | null {
  let at: string | null = null;
  for (const m of months) {
    if (m.top <= scrollTop + 1) at = m.ym;
    else break;
  }
  return at ?? months[0]?.ym ?? null;
}
