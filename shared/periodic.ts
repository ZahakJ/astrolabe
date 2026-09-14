// PERIODIC NOTES — where today's (and this week's) note lives, by a format.
//
// The daily note was `daily/YYYY-MM-DD.md`, hard-coded, and there was no
// weekly note. Obsidian readers configure both (folder, format, template),
// and a migrating vault already has a `Journal/2026/2026-09-13.md` habit
// that must keep working. So the path is a FORMAT of moment-style tokens —
// `YYYY`, `MM`, `DD`, `ww` (ISO week), `[literal]`, and `/` for folders —
// read forwards to name a day and backwards to recognise one. Gregorian and
// Western digits by construction: a filename is an address, not prose; the
// Hijri date is printed beside it by the chrome (client/daily.ts).

export const DAILY_FOLDER_DEFAULT = "daily";
export const DAILY_FORMAT_DEFAULT = "YYYY-MM-DD";
export const WEEKLY_FORMAT_DEFAULT = "YYYY-[W]ww";

const TOKEN_RE = /\[([^\]]*)\]|YYYY|YY|MM|M|DD|D|ww|WW|w/g;

/** ISO-8601 week: the year the week belongs to and its number (1–53). */
export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

/** The Monday of the ISO week `date` falls in, at local noon. */
export function weekMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d;
}

/** The Monday of ISO week `week` of `year`, at local noon. */
export function mondayOfIsoWeek(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4, 12);
  const monday = weekMonday(jan4);
  monday.setDate(monday.getDate() + (week - 1) * 7);
  return monday;
}

const pad = (n: number, w: number): string => String(n).padStart(w, "0");

export function formatPeriod(format: string, date: Date): string {
  const { year: wy, week } = isoWeek(date);
  // A WEEKLY format's year is the ISO week-year, not the calendar year:
  // Monday 2025-12-29 is week 1 of 2026, and `2025-W01` would read back as
  // a week a year earlier (the review's first finding).
  const weekly = isWeeklyFormat(format);
  const year = weekly ? wy : date.getFullYear();
  return format.replace(TOKEN_RE, (tok, literal?: string) => {
    if (literal !== undefined) return literal;
    switch (tok) {
      case "YYYY": return String(year);
      case "YY": return pad(year % 100, 2);
      case "MM": return pad(date.getMonth() + 1, 2);
      case "M": return String(date.getMonth() + 1);
      case "DD": return pad(date.getDate(), 2);
      case "D": return String(date.getDate());
      case "ww":
      case "WW": return pad(week, 2);
      case "w": return String(week);
      default: return tok;
    }
  });
}

/** A note NAME (path without folder or extension) read back through the
 *  format, or null when it does not fit. A daily format yields that day at
 *  local noon; a weekly one yields its Monday. */
export function parsePeriod(format: string, name: string): Date | null {
  const order: string[] = [];
  let re = "^";
  let last = 0;
  for (const m of format.matchAll(TOKEN_RE)) {
    re += escape(format.slice(last, m.index));
    last = (m.index ?? 0) + m[0].length;
    const tok = m[0];
    if (tok.startsWith("[")) {
      re += escape(m[1] ?? "");
      continue;
    }
    order.push(tok);
    re += tok === "YYYY" ? "(\\d{4})" : tok === "YY" || tok === "MM" || tok === "DD" || tok === "ww" || tok === "WW" ? "(\\d{2})" : "(\\d{1,2})";
  }
  re += escape(format.slice(last)) + "$";
  const hit = new RegExp(re).exec(name);
  if (!hit) return null;
  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;
  let week: number | null = null;
  order.forEach((tok, i) => {
    const n = Number(hit[i + 1]);
    if (tok === "YYYY") year = n;
    else if (tok === "YY") year = 2000 + n;
    else if (tok === "MM" || tok === "M") month = n;
    else if (tok === "DD" || tok === "D") day = n;
    else week = n;
  });
  if (year === null) return null;
  if (week !== null) {
    if (week < 1 || week > 53) return null;
    return mondayOfIsoWeek(year, week);
  }
  if (month === null || day === null) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day, 12);
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when a format names a week rather than a day. */
export function isWeeklyFormat(format: string): boolean {
  return /(^|[^[])(ww|WW|w)(?![^[]*\])/.test(format.replace(/\[[^\]]*\]/g, ""));
}

/** `folder/name.md` for `date` under `format`; the format may carry `/`. */
export function periodicPath(folder: string, format: string, date: Date): string {
  const name = formatPeriod(format, date);
  const base = folder.replace(/^\/+|\/+$/g, "");
  return `${base === "" ? "" : `${base}/`}${name}.md`;
}

/** The date a note path names under `folder` + `format`, or null. */
export function periodicDateOf(folder: string, format: string, path: string): Date | null {
  const base = folder.replace(/^\/+|\/+$/g, "");
  const prefix = base === "" ? "" : `${base}/`;
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length).replace(/\.(md|tex|latex)$/i, "");
  return parsePeriod(format, rest);
}
