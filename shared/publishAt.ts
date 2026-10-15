// `publish:` as a TIME — a post written now and released later.
//
// `publish: true` publishes; `publish: 2026-11-02` or `publish: 2026-11-02 09:30`
// publishes then, and until then the note is a draft on every surface a reader
// can reach. No new key: the flag a post already carries takes a date instead
// of `true`, so a stray future `date:` can never hide a post by accident, and
// a vault opened in Obsidian reads one ordinary property.
//
// One parser for both sides: the server decides visibility with it
// (server/publish.ts), the status bar draws "Scheduled · …" with it
// (client/publish.ts), and neither can disagree with the other about when.

/** `YYYY-MM-DD`, optionally ` HH:MM` or `THH:MM[:SS]`, optionally a zone. */
const AT = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?\s*(Z|[+-]\d{2}:?\d{2})?$/;

/** The moment a `publish:` value names, in ms, or null for anything that is
 *  not a date (`true`, `false`, a typo). A date without a time is midnight
 *  where the server runs, and a time without a zone is local there too —
 *  the hour the writer meant on their own clock. YAML hands a bare date over
 *  as a UTC-midnight `Date`; that is read back as the calendar date it named. */
export function publishAtMs(value: unknown): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    if (Number.isNaN(ms)) return null;
    const midnightUtc =
      value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0;
    return midnightUtc ? new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()).getTime() : ms;
  }
  if (typeof value !== "string") return null;
  const m = AT.exec(value.trim().replace(/^(["'])(.*)\1$/, "$2"));
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0", zone] = m;
  const parts = [Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)] as const;
  if (parts[1] > 11 || parts[2] < 1 || parts[2] > 31 || parts[3] > 23 || parts[4] > 59 || parts[5] > 59) return null;
  if (zone === undefined) {
    const local = new Date(...parts);
    // 2026-02-31 rolls into March in the Date constructor; that is a typo,
    // not a schedule.
    return local.getDate() === parts[2] ? local.getTime() : null;
  }
  const offset = zone === "Z" ? 0 : (zone.startsWith("-") ? -1 : 1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(-2)));
  return Date.UTC(...parts) - offset * 60_000;
}

/** Is a `publish:` value published at `now`? `true` always; a date once it
 *  has come. */
export function publishedAt(value: unknown, now = Date.now()): boolean {
  if (value === true || value === "true") return true;
  const at = publishAtMs(value);
  return at !== null && at <= now;
}
