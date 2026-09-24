// The delete preview and the trash. Mounted from server/api.ts below the auth
// guard; moved out of that file unchanged.

import { Hono } from "hono";
import type { DeletePreview, TrashEntry } from "../shared/types.ts";
import { VaultError, emitEvent, listTrash, listVaultFiles, normalizeRel, purgeFromTrash, restoreFromTrash, safeAbs } from "./vault.ts";
import { promises as fsp } from "node:fs";
import { indexFile, indexUnder, notesLinkingTo, notesReferencing, registerAttachment, whenIndexed } from "./indexer.ts";
import { isNotePath } from "../shared/noteFormat.ts";
import { isPublishLimited } from "./auth.ts";
import { jsonBody, requiredQuery, requiredString } from "./requestBody.ts";

export const trashRoutes = new Hono();

// ------------------------------------------------------- delete preview
//
// What a delete is ACTUALLY about to take. The folder dialog used to count
// markdown and nothing else, so a folder holding four images and no notes
// said "0 notes will move" — and the essay one folder over, which still
// embedded all four, went to the public site with four broken images and no
// warning anywhere. The indexer has always known which notes point at which
// attachment (it is the same walk that decides what /api/file will serve a
// visitor); it just was not being asked before the destructive verb ran.
//
// The number that matters is not how many files go, it is how many of them
// something that SURVIVES still points at — so notes inside the target are
// not survivors, and a folder whose images only its own notes use reports 0.
//
// Admin-eyes-only: the referrer list names vault paths, which is exactly what
// /attachments and /published withhold from a visitor, so it takes the same
// 404-not-a-route gate rather than a 403.

/** How many referring notes the answer NAMES. The dialog wants to say "…by
 *  ‘essay.md’" when it can and "…by 12 notes" when it cannot; past a handful
 *  the names stop being information and start being a wall. */
const REFERRER_SAMPLE = 5;

trashRoutes.get("/delete-preview", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  const target = normalizeRel(requiredQuery(c.req.query("path"), "path"));
  if (!target) throw new VaultError(400, 'Query parameter "path" is required');
  const abs = safeAbs(target);
  let stat;
  try {
    stat = await fsp.lstat(abs);
  } catch {
    throw new VaultError(404, `Not found: ${target}`);
  }

  let preview: DeletePreview;
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    const { notes: inside, attachments } = await listVaultFiles(target);
    // Notes under the folder go WITH it, so a link from one of them is not a
    // link that will break. deleteFolder() applies the same ignore rules to
    // the same walk, so these are the same files it will move.
    const doomed = new Set(inside);
    const referrers = new Set<string>();
    let referenced = 0;
    for (const att of attachments) {
      const refs = notesReferencing(att).filter((p) => !doomed.has(p));
      if (refs.length === 0) continue;
      referenced++;
      for (const ref of refs) referrers.add(ref);
    }
    preview = {
      kind: "folder",
      notes: inside.length,
      attachments: attachments.length,
      referenced,
      referrers: [...referrers].sort().slice(0, REFERRER_SAMPLE),
      referrerCount: referrers.size,
    };
  } else if (stat.isSymbolicLink()) {
    // A symlink is a link: the delete unlinks it without touching whatever it
    // points at, and deleteFolder() already refuses to describe a tree it will
    // not move. Report the one file the call will actually remove.
    preview = { kind: "attachment", notes: 0, attachments: 1, referenced: 0, referrers: [], referrerCount: 0 };
  } else if (target.toLowerCase().endsWith(".md")) {
    // A note breaks things too — its incoming [[wikilinks]] go dangling — so
    // the same question is asked one object over and answered in the same
    // shape. `referenced` stays 0: it counts ATTACHMENTS, and a note is not one.
    const refs = notesLinkingTo(target);
    preview = {
      kind: "note",
      notes: 1,
      attachments: 0,
      referenced: 0,
      referrers: refs.slice(0, REFERRER_SAMPLE),
      referrerCount: refs.length,
    };
  } else {
    const refs = notesReferencing(target);
    preview = {
      kind: "attachment",
      notes: 0,
      attachments: 1,
      referenced: refs.length > 0 ? 1 : 0,
      referrers: refs.slice(0, REFERRER_SAMPLE),
      referrerCount: refs.length,
    };
  }
  return c.json(preview);
});

// ------------------------------------------------------------------- trash
//
// The bin every delete dialog in this product promises ("recoverable from
// disk") and that nothing in the product could reach. `.trash/` is a dot-dir,
// deliberately invisible to the tree, the indexer and the watcher, so honouring
// the promise meant handing the owner a terminal. These three routes close
// that loop: list it, restore out of it, empty it. Admin-only — the listing
// names deleted vault paths, so it takes the same 404-not-a-route gate
// /attachments and /published take, and the two mutations ride the auth guard.

trashRoutes.get("/trash", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  const entries: TrashEntry[] = await listTrash();
  return c.json(entries);
});

// Restore one entry to its recorded origin (or beside it under a counter, or
// at the vault root when nothing recorded where it came from). The answer says
// which of those happened; the client's toast repeats it, because a silent
// "restored" that landed somewhere else is the same class of lie this whole
// round is about.
trashRoutes.post("/trash/restore", async (c) => {
  const body = await jsonBody(c);
  const name = requiredString(body, "name");
  const result = await restoreFromTrash(name);
  if (result.dir) {
    // A restored folder arrives whole; the watcher would find it eventually,
    // but this route answers now and the client refetches immediately.
    await indexUnder(result.path);
    emitEvent({ kind: "created", path: result.path, dir: true });
  } else if (isNotePath(result.path)) {
    // isNotePath, not `.md`: a restored `.tex` note has to be INDEXED like the
    // note it is, not registered as an attachment (which is what an
    // extension-literal test did to it).
    await indexFile(result.path);
    emitEvent({ kind: "created", path: result.path });
  } else {
    registerAttachment(result.path);
    emitEvent({ kind: "created", path: result.path });
  }
  await whenIndexed();
  return c.json({ ok: true, path: result.path, renamed: result.renamed });
});

// The bin's own permanent delete — the one delete in the product with nothing
// behind it, which is why the client puts it behind a `grave` dialog like
// every other irreversible verb.
trashRoutes.delete("/trash", async (c) => {
  const name = requiredQuery(c.req.query("name"), "name");
  await purgeFromTrash(name);
  return c.json({ ok: true });
});
