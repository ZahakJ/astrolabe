// THE DEVICE'S MEMORY OF ITS SESSIONS. The note holds a star's schedule and
// nothing else — the plugin keeps no history either — so retention, the
// streak and "the ten hardest stars" come from a per-device LOG in
// localStorage (`astrolabe.stars.log`, a ring of the last 5000 grades) and
// the daily new-star counter beside it. Both are caches a reader can lose
// without losing anything the vault knows; neither travels with prefs sync
// (client/prefsSync.ts is an allowlist). Every access is wrapped: a private
// window, a blocked site store or a full quota must leave the session
// working and the statistics merely blank.

import type { Grade } from "../../shared/srs.ts";
import { shiftDay } from "../../shared/srsSession.ts";

export const LOG_KEY = "astrolabe.stars.log";
const LOG_CAP = 5000;
const NEW_PREFIX = "astrolabe.stars.new.";

export interface LogEntry {
  path: string;
  line: number;
  grade: Grade;
  /** ms since the epoch. */
  ts: number;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Quota or a blocked store: the statistics go blank, the session goes on.
  }
}

export function readLog(): LogEntry[] {
  const raw = read(LOG_KEY);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is LogEntry =>
        typeof e === "object" && e !== null && typeof (e as LogEntry).path === "string" && typeof (e as LogEntry).line === "number" && typeof (e as LogEntry).ts === "number",
    );
  } catch {
    return [];
  }
}

export function appendLog(entry: LogEntry): void {
  const log = readLog();
  log.push(entry);
  write(LOG_KEY, JSON.stringify(log.length > LOG_CAP ? log.slice(log.length - LOG_CAP) : log));
}

/** Undo's half: the last entry for this star goes, so a re-grade is not
 *  counted twice. */
export function dropLastLog(path: string, line: number): void {
  const log = readLog();
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].path === path && log[i].line === line) {
      log.splice(i, 1);
      break;
    }
  }
  write(LOG_KEY, JSON.stringify(log));
}

/** ISO day of a timestamp, in the reader's own zone — the day they studied. */
export function dayOf(ts: number): string {
  const d = new Date(ts);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Grades good or easy over all grades in the last `days` days, or null
 *  when nothing was graded. `path` narrows to one constellation. */
export function retention(log: LogEntry[], today: string, days = 30, path: string | null = null): number | null {
  const since = Date.parse(`${shiftDay(today, -(days - 1))}T00:00:00`);
  let all = 0;
  let kept = 0;
  for (const e of log) {
    if (e.ts < since || (path !== null && e.path !== path)) continue;
    all += 1;
    if (e.grade === "good" || e.grade === "easy") kept += 1;
  }
  return all === 0 ? null : kept / all;
}

/** Per-day retention for a sparkline: one value per day over `days`, oldest
 *  first, null on days with no grades. */
export function retentionSeries(log: LogEntry[], today: string, days = 30, path: string | null = null): Array<number | null> {
  const first = shiftDay(today, -(days - 1));
  const all = new Array<number>(days).fill(0);
  const kept = new Array<number>(days).fill(0);
  for (const e of log) {
    if (path !== null && e.path !== path) continue;
    const day = dayOf(e.ts);
    if (day < first || day > today) continue;
    const i = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000);
    if (i < 0 || i >= days) continue;
    all[i] += 1;
    if (e.grade === "good" || e.grade === "easy") kept[i] += 1;
  }
  return all.map((n, i) => (n === 0 ? null : kept[i] / n));
}

/** The days that saw a grade — the streak's input. */
export function studyDays(log: LogEntry[]): Set<string> {
  return new Set(log.map((e) => dayOf(e.ts)));
}

/** The stars graded "again" most often, worst first. */
export function hardest(log: LogEntry[], path: string | null, limit = 10): Array<{ path: string; line: number; again: number; seen: number }> {
  const by = new Map<string, { path: string; line: number; again: number; seen: number }>();
  for (const e of log) {
    if (path !== null && e.path !== path) continue;
    const key = `${e.path}#${e.line}`;
    const row = by.get(key) ?? { path: e.path, line: e.line, again: 0, seen: 0 };
    row.seen += 1;
    if (e.grade === "again") row.again += 1;
    by.set(key, row);
  }
  return [...by.values()]
    .filter((r) => r.again > 0)
    .sort((a, b) => b.again - a.again || b.seen - a.seen)
    .slice(0, limit);
}

// ── the daily new-star counter ──────────────────────────────────────────────
// `astrolabe.stars.new.<path>.<YYYY-MM-DD>`: how many new stars this device
// introduced from one constellation today, so no device can be walked into
// a hundred new kana on day one by reloading. Reviews are never counted.

export function newIntroduced(path: string, today: string): number {
  const n = Number(read(`${NEW_PREFIX}${path}.${today}`) ?? "0");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function countNew(path: string, today: string, delta = 1): void {
  write(`${NEW_PREFIX}${path}.${today}`, String(Math.max(0, newIntroduced(path, today) + delta)));
}
