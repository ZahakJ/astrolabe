// SERIES — a published note that declares its parts, in order, in frontmatter:
//
//   series:
//     - "[[Six ways to watch a program]]"
//     - "[[strace]]"
//     - tracing/ftrace.md
//
// The rule that reads the key is pure and lives here so the server, the client
// and the tests hold the same one. Resolution (which note an entry names) is
// the indexer's: server/indexer/series.ts.

import { cleanTwinRef } from "./twins.ts";

export const SERIES_KEY = "series";

/** The entries a note's `series:` key names, cleaned of their wikilink
 *  brackets, heading and alias — or null when the note declares no series.
 *
 *  YAML makes three shapes of the documented spelling: a quoted `"[[strace]]"`
 *  is a string; an unquoted `- [[strace]]` is a flow sequence inside a flow
 *  sequence (`[["strace"]]`); a one-line `series: [[a]], [[b]]` is not valid
 *  YAML at all and never reaches here. Each nested array is descended to its
 *  first scalar, which is what the author wrote between the brackets. */
export function parseSeriesRefs(fm: Record<string, unknown>): string[] | null {
  const raw = fm[SERIES_KEY];
  if (raw === undefined || raw === null) return null;
  const list = Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  for (const item of list) {
    const scalar = firstScalar(item);
    if (scalar === null) continue;
    const ref = cleanTwinRef(scalar);
    if (ref !== null) out.push(ref);
  }
  return out.length > 0 ? out : null;
}

function firstScalar(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value) && value.length > 0) return firstScalar(value[0]);
  return null;
}

/** Why an entry of a series is not one of its parts — shown to the signed-in
 *  owner only, greyed, so the plan stays readable. */
export type SeriesEntryStatus = "published" | "unpublished" | "missing" | "self" | "nested" | "claimed";
