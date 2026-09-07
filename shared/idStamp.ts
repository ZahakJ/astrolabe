// A numeric frontmatter `id` is a creation stamp.
//
// The owner's note template carries `id:`, and client/templates.ts mints a
// fresh one per note SHAPED like the template's: a numeric id is `Date.now()`
// padded to the template's length with random digits, so a 16-digit id is
// thirteen digits of milliseconds and three of noise, minted the moment the
// note was made. That is the truest record of creation a note carries — older
// than the file's birthtime (a save is a rename over the note and gives it a
// new inode), older than git's first sight of it, and unmoved by a
// reorganisation of the vault (server/created.ts follows paths; a note the
// ledger first met after a move was dated by the move). The owner: "make the
// real source of truth for that time be the time of creation".
//
// So the date chain reads it: `date:` → `created:` → `published:` → the id →
// the ledger. Only an id that is plainly a stamp qualifies — all digits, and
// a moment between 2000 and tomorrow — so a serial number or a hash never
// becomes a date.

const MIN_MS = Date.UTC(2000, 0, 1);

/** The moment a numeric `id` was minted, in epoch ms, or null when the value
 *  is not a stamp. Ten digits are seconds; thirteen or more are milliseconds
 *  in the first thirteen. */
export function idStampMs(id: unknown, now = Date.now()): number | null {
  const raw = typeof id === "number" ? String(Math.trunc(id)) : typeof id === "string" ? id.trim() : "";
  if (!/^\d{10,}$/.test(raw)) return null;
  let ms: number;
  if (raw.length === 10) ms = Number(raw) * 1000;
  else if (raw.length >= 13) ms = Number(raw.slice(0, 13));
  else return null;
  if (!Number.isFinite(ms) || ms < MIN_MS || ms > now + 24 * 60 * 60 * 1000) return null;
  return ms;
}
