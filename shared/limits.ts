// Limits both sides of the wire need to agree on. The upload cap lives here
// because the drop-zone hint states it in words ("10 MB max" / "بحد أقصى ١٠
// ميغابايت") — a hint that quoted its own hard-coded number could drift away
// from the cap the server actually enforces.

/** Largest image POST /api/upload accepts, in whole megabytes. */
export const UPLOAD_MAX_MB = 10;

/** The same cap in bytes (what the server checks). */
export const UPLOAD_MAX_BYTES = UPLOAD_MAX_MB * 1024 * 1024;

/** Largest FONT POST /api/fonts/upload accepts, in whole megabytes. Same
 *  reason as the image cap above: the Typography drop-zone states the number
 *  in words, and a hint that quoted its own constant would drift from the one
 *  the server enforces. */
export const FONT_UPLOAD_MAX_MB = 5;

/** The same cap in bytes (what server/customFonts.ts checks). */
export const FONT_UPLOAD_MAX_BYTES = FONT_UPLOAD_MAX_MB * 1024 * 1024;

/** The most an export archive may hold, in whole gigabytes. The ZIP writer
 *  (shared/zip.ts) keeps 32-bit sizes and offsets and no ZIP64 record, so
 *  the format's own ceiling is 4 GB; two is the stated cap, with room under
 *  it for the archive's own headers, and it is stated in the dialog's error
 *  line for the same reason the upload cap is stated in the drop-zone. */
export const EXPORT_MAX_GB = 2;

/** The same cap in bytes (what server/export.ts sums the files against). */
export const EXPORT_MAX_BYTES = EXPORT_MAX_GB * 1024 * 1024 * 1024;

/** Largest file POST /api/constellations/import takes, in whole megabytes:
 *  an Anki .apkg is mostly its media, and a language deck with audio for
 *  every word runs to a couple of hundred. The import tab states the number
 *  for the same reason the drop-zone does. */
export const STARS_IMPORT_MAX_MB = 256;

/** The same cap in bytes (what the server's body limit checks). */
export const STARS_IMPORT_MAX_BYTES = STARS_IMPORT_MAX_MB * 1024 * 1024;
