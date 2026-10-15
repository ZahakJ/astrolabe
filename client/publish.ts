// Client-side mirror of the server's publish-flag check (server/publish.ts):
// a note is published when frontmatter `publish` is exactly true or "true", or
// a date that has come (shared/publishAt.ts). Used by the status bar / palette
// to know the OPEN note's state without an extra endpoint — the note content
// is already fetched for word counts.

import { publishAtMs } from "../shared/publishAt.ts";

/** Extract the leading frontmatter block's inner text, or null. */
function frontmatterBlock(src: string): string | null {
  if (!src.startsWith("---\n") && !src.startsWith("---\r\n")) return null;
  const nl = src.startsWith("---\r\n") ? "\r\n" : "\n";
  const open = 3 + nl.length;
  const close = src.indexOf(`${nl}---`, open);
  return close === -1 ? null : src.slice(open, close);
}

/** The raw `publish:` value of the leading frontmatter, or null. */
function publishValue(src: string): string | null {
  const block = frontmatterBlock(src);
  if (block === null) return null;
  for (const line of block.split(/\r?\n/)) {
    const m = /^publish:\s*(.*?)\s*$/.exec(line);
    if (m) return m[1];
  }
  return null;
}

/** The moment a `publish: <date>` names, while it is still to come; null
 *  for a note that is published, unpublished, or past its date. */
export function scheduledAtContent(src: string, now = Date.now()): number | null {
  const raw = publishValue(src);
  const at = raw === null ? null : publishAtMs(raw);
  return at !== null && at > now ? at : null;
}

/** True when the raw note content carries `publish: true` (or "true"), or a
 *  `publish:` date that has come. */
export function isPublishedContent(src: string, now = Date.now()): boolean {
  const raw = publishValue(src);
  if (raw === null) return false;
  const at = publishAtMs(raw);
  if (at !== null) return at <= now;
  const quoted = /^(["']).*\1$/.test(raw);
  const value = quoted ? raw.slice(1, -1) : raw;
  // Mirror the server exactly (fm.publish === true || fm.publish === "true"):
  // unquoted true/True/TRUE are YAML booleans → true; a QUOTED value is a
  // string, and only the exact string "true" counts — "True"/"TRUE" do not.
  if (quoted) return value === "true";
  return value === "true" || value === "True" || value === "TRUE";
}
