// THE TEXT OF A NOTE AS A VISITOR IS SENT IT.
//
// `GET /api/note` hands a reader the note's raw source, because the reading
// view renders it in the browser. Two kinds of words in that source were
// never the reader's:
//
//  - the author's comments, `%% … %%` and `<!-- … -->` (shared/privateText.ts);
//  - the frontmatter the Writing desk and a series keep for their author
//    (2026-11 purge, P3): a published series hub listed its unpublished
//    drafts under `series:` — the page drew only the published parts, but the
//    JSON named every draft — and a published essay piece carried its
//    `angle:`, `status:`, `next:` and `priority:` with it.
//
// So a visitor's copy keeps the published parts of a series and nothing of
// the desk's working notes. Every other byte is the file's: the frontmatter
// the renderer reads (banner, title, cssclass, numbering) is untouched, and
// the edit is the properties card's own byte-surgical writer, so nothing is
// re-serialized.

import { isNoteVisibleToVisitor, notes, resolveLink, seriesEntries } from "./indexer.ts";
import { setNoteProperty } from "../shared/frontmatterEdit.ts";
import { stripPrivateComments } from "../shared/privateText.ts";

/** The desk's working fields on a piece or a series (shared/desk.ts) — the
 *  author's plan, not the post. `goal:` stays: it is the word target any note
 *  may carry, and the status bar reads it, not the desk alone. */
export const DESK_PRIVATE_KEYS = ["status", "angle", "next", "priority", "due"] as const;

/** `content` as a visitor may receive it. `relPath` is normalized and known
 *  to be published (the route has already refused anything else). */
export function visitorNoteContent(relPath: string, content: string): string {
  let out = stripPrivateComments(content);
  const record = notes.get(relPath);
  if (record === undefined) return out;
  const edit = (key: string, value: Parameters<typeof setNoteProperty>[3]): void => {
    try {
      out = setNoteProperty(relPath, out, key, value);
    } catch {
      // A key this writer refuses to touch (malformed block, odd key) is left
      // as it is: failing the read would hide a published note over YAML.
    }
  };
  if (record.seriesRefs != null) {
    const entries = seriesEntries(relPath);
    const shown = entries.filter((e) => e.status === "published").map((e) => `[[${e.ref}]]`);
    if (shown.length !== entries.length) edit("series", shown.length > 0 ? { kind: "list", items: shown } : null);
  }
  if (record.desk !== null) {
    for (const key of DESK_PRIVATE_KEYS) edit(key, null);
    // On a piece, `series:` names the series it belongs to — a draft series
    // is the author's plan too.
    if (record.desk.kind === "essay" && record.desk.series !== null) {
      const target = resolveLink(record.desk.series, false, null);
      if (target === null || !isNoteVisibleToVisitor(target, null)) edit("series", null);
    }
  }
  return out;
}
