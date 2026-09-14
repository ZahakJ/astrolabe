// UNUSED ATTACHMENTS: the files in the vault no note points at.
//
// The delete previews (server/api.ts /delete-preview) answer "what breaks if
// this goes"; the export answers "what rides along with these notes". Both
// walk the index's own attachment references. This is the same walk's third
// question — "what is nothing pointing at?" — and it is the question a vault
// that has had images pasted into it for two years cannot answer by eye:
// 1,176 files under `attachments/`, and no way to tell the twenty stale
// screenshots from the eleven hundred figures that essays still embed.
//
// The index says WHICH (indexer.ts unreferencedAttachments()); this module
// stats them, because the list is worth sorting by what reclaiming it would
// buy, and it caps the answer, because a modal is not a place for six
// thousand rows. The route never deletes anything: the client sends each
// chosen path to `DELETE /api/attachment`, which moves it to `.trash/` and
// answers with the entry Undo restores.

import { promises as fs } from "node:fs";
import type { UnusedAttachment, UnusedAttachments } from "../shared/types.ts";
import { unreferencedAttachments } from "./indexer.ts";
import { safeAbs } from "./vault.ts";

/** The most rows one listing carries. Above this the reader is told the
 *  true total and asked to sweep in passes — moving two thousand files
 *  clears the top of the list and the next opening shows the rest. */
export const UNUSED_ATTACHMENTS_MAX = 2000;

export async function listUnusedAttachments(): Promise<UnusedAttachments> {
  const paths = unreferencedAttachments();
  const files: UnusedAttachment[] = [];
  let total = 0;
  for (const rel of paths) {
    let abs: string;
    try {
      abs = safeAbs(rel);
    } catch {
      continue; // an index entry the path rules no longer accept
    }
    // lstat and a regular file only — the rule /api/file and the export
    // keep: a symlink is not an attachment, and a file that vanished
    // between the index and now is not ours to invent.
    let stat;
    try {
      stat = await fs.lstat(abs);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    total++;
    if (files.length < UNUSED_ATTACHMENTS_MAX) files.push({ path: rel, size: stat.size, mtimeMs: stat.mtimeMs });
  }
  return { files, total };
}
