// Tag rename and merge. Mounted from server/api.ts below the auth guard; moved
// out of that file unchanged.

import { Hono } from "hono";
import type { TagRenamePreview, TagRenameResult } from "../shared/types.ts";
import { VaultError, noteExists } from "./vault.ts";
import { applyBulk, previewBulk } from "./bulkRewrite.ts";
import { isPublishLimited } from "./auth.ts";
import { isTagName, rewriteTag } from "./tagRewrite.ts";
import { jsonBody, requiredQuery, requiredString } from "./requestBody.ts";
import { notesWithTag, whenIndexed } from "./indexer.ts";
import { renameTagLabels, restoreTagLabels } from "./settings.ts";
import { renameWithLinkRewrite } from "./renameRoutes.ts";
import { tagKey } from "../shared/tagLabels.ts";
import { tagsFolder } from "./tagLabels.ts";

export const tagRoutes = new Hono();

// --------------------------------------------------------- tag rename/merge
//
// Obsidian's sixth most-wanted feature, 811 likes and eight years old. A tag is
// the one piece of a vault's vocabulary its keeper changes their mind about, and
// there has never been a safe way to change it: find-and-replace over YAML eats
// quote styles and block lists, and doing it by hand over four hundred notes is
// not a thing anybody does twice.
//
// Renaming ONTO a tag that already exists is a MERGE, and the routes say so
// rather than refusing it — merging `#ml` into `#machine-learning` is half of
// what people are asking for. The dialog states it in words, because a merge is
// the one operation here that renaming back does not undo (the two tags are one
// tag afterwards, and nothing recorded which note carried which). The undo
// bundle does undo it, for as long as it lives.

/** Where a tag's own page lives, when the vault keeps such pages. The path IS
 *  the tag (server/indexer.ts's tagPageLabels derives one from the other), so a
 *  renamed tag has to take its page with it — leaving `tags/software.md` behind
 *  after `software` became `code` leaves a page defining labels for a tag no
 *  note carries, and the Arabic chip the page was written for silently reverts. */
function tagPagePath(tag: string): string {
  return `${tagsFolder()}/${tag}.md`;
}

/** The tag-page move a rename implies: `[from, to]`, or null when there is no
 *  page to move (the usual case) or when the destination is already taken —
 *  which is what a MERGE means for pages, and two pages cannot be merged by a
 *  file rename. The old page is then left where it is, and the answer says so. */
async function tagPageMove(from: string, to: string): Promise<[string, string] | null> {
  const source = tagPagePath(from);
  if (!(await noteExists(source))) return null;
  const dest = tagPagePath(to);
  if (await noteExists(dest)) return null;
  return [source, dest];
}

/** Canonicalise and screen the pair. Shared by the dry run and the apply, so
 *  the two cannot end up describing different operations — the preview promise
 *  this whole section rests on. */
function tagRenamePair(rawFrom: string, rawTo: string): { from: string; to: string } {
  const from = tagKey(rawFrom);
  const to = tagKey(rawTo);
  if (!isTagName(from)) throw new VaultError(400, `Not a tag: ${from}`, "badTag");
  if (!isTagName(to)) throw new VaultError(400, `Not a tag: ${to}`, "badTag");
  if (from === to) throw new VaultError(400, "That is the name it already has", "sameTag");
  // Renaming a tag INTO its own subtree (`zettel` → `zettel/seed`) would remap
  // the children twice on the way past themselves; there is no sane answer, so
  // it is refused before anything is read.
  if (to.startsWith(`${from}/`) || from.startsWith(`${to}/`)) {
    throw new VaultError(400, "A tag cannot be renamed into its own subtree", "nestedTag");
  }
  return { from, to };
}

tagRoutes.get("/tags/rename-preview", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  const { from, to } = tagRenamePair(
    requiredQuery(c.req.query("from"), "from"),
    requiredQuery(c.req.query("to"), "to"),
  );
  const preview = await previewBulk(notesWithTag(from), (relPath, content) =>
    rewriteTag(relPath, content, from, to),
  );
  const move = await tagPageMove(from, to);
  const result: TagRenamePreview = {
    from,
    to,
    // The destination already exists in the vault: two topics are becoming one.
    merge: notesWithTag(to).length > 0,
    notes: preview.notes,
    edits: preview.edits,
    files: preview.files.map((f) => ({ path: f.path, count: f.count })),
    page: move === null ? null : move[1],
  };
  return c.json(result);
});

tagRoutes.post("/tags/rename", async (c) => {
  const body = await jsonBody(c);
  const { from, to } = tagRenamePair(requiredString(body, "from"), requiredString(body, "to"));

  const candidates = notesWithTag(from);
  // THE PAGE MOVES FIRST, and the order is the undo's. A tag page that carries
  // its own tag is rewritten by the pass below like any other note, and the
  // undo bundle records the path it wrote to — so if the file were renamed
  // afterwards, the bundle would name a path that no longer exists and the undo
  // would silently skip the one file the reader is most likely to look at.
  let moved: [string, string] | null = await tagPageMove(from, to);
  if (moved !== null) {
    try {
      await renameWithLinkRewrite(moved[0], moved[1]);
    } catch (err) {
      console.error(`astrolabe: moving the tag page ${moved[0]} failed`, err);
      moved = null;
    }
  }
  const page = moved;
  const paths = candidates.map((p) => (page !== null && p === page[0] ? page[1] : p));

  // A TAG'S LABEL IS PART OF THE TAG, exactly as a folder's glyph is part of the
  // folder (settings.moveFolderIcons, one noun over). Re-keyed BEFORE the files
  // so a rewrite that then fails part-way leaves settings describing the name
  // the surviving notes are moving toward, not one nothing carries.
  const labelsBefore = renameTagLabels(from, to);
  const result = await applyBulk(
    paths,
    (relPath, content) => rewriteTag(relPath, content, from, to),
    {
      revert: async () => {
        if (labelsBefore !== null) restoreTagLabels(labelsBefore);
        if (page !== null) await renameWithLinkRewrite(page[1], page[0]);
      },
    },
  );
  await whenIndexed();
  const answer: TagRenameResult = { ...result, from, to, page: page === null ? null : page[1] };
  return c.json(answer);
});
