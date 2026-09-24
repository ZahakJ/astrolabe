// A note's history and its versions. Mounted from server/api.ts below the
// auth guard; moved out of that file unchanged.

import { Hono } from "hono";
import type { NoteVersionBlob, NoteVersionsResponse } from "../shared/types.ts";
import { VaultError, assertNotePath, emitEvent, noteExists, safeAbs, suppressWatcherEcho, writeNote } from "./vault.ts";
import { indexFile } from "./indexer.ts";
import { isPublishLimited } from "./auth.ts";
import { jsonBody, requiredString } from "./requestBody.ts";
import { listVersions, readVersion, versionsEnabled } from "./versions.ts";
import { noteHistory, noteRevisionBlob } from "./gitSync.ts";

export const versionRoutes = new Hono();

// -------------------------------------------------------------- note history
// The read half of Backup & sync: `git log` over one note, and one revision's
// bytes. Admin-eyes-only and 404 to a visitor exactly as /api/settings is — a
// stranger learning that a published essay had eleven drafts, when each one
// landed and what its commit message said is a leak of the author's process
// even where the note itself is public.
//
// Both routes are READ-ONLY git. Restoring a revision is not here: it goes
// through PUT /api/note like every other write in this product, precondition
// and all, so it is an ordinary edit — undoable, autosave-aware, and itself a
// revision the next snapshot records.
//
// A vault that is not a git repository is NOT an error. It is the commonest
// state a first-run instance is in, and the honest answer is `repo: false` so
// the panel can offer the door (turn Backup & sync on) instead of printing an
// empty list under a heading that promises history.

versionRoutes.get("/history", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  const rel = assertNotePath(c.req.query("path") ?? "");
  // safeAbs is the containment check, and it is run for its THROW: `..`
  // segments are a 400, an ignored path (.git, .trash, any dotfile) and
  // anything that leaves the vault through a symlink are a 404. A path that
  // cannot be reached through the note API must not be reachable through its
  // history either — the vault root is the boundary in both directions.
  safeAbs(rel);
  const limit = Number.parseInt(c.req.query("limit") ?? "", 10);
  return c.json(await noteHistory(rel, Number.isFinite(limit) ? limit : undefined));
});

versionRoutes.get("/history/blob", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  // The path here is the one the LISTING gave for that revision — a note that
  // has been renamed lives under its old name in its older commits, so this is
  // not always the note's path today. It gets the identical treatment either
  // way: a note path, inside the vault, not ignored.
  const rel = assertNotePath(c.req.query("path") ?? "");
  safeAbs(rel);
  const sha = (c.req.query("sha") ?? "").trim();
  return c.json(await noteRevisionBlob(rel, sha));
});

// ------------------------------------------------------ note versions
//
// The other half of history: what the vault's own write path kept, with or
// without git (server/versions.ts). Same admin gate as /history, but a 401
// rather than a 404 — this store exists on every instance, so "there is
// nothing here" would be the one answer that is never true, and the client
// treats a 401 as "log in" rather than as "this note has no past".

/** `at` is a filename in the store: digits, nothing else. */
function versionAt(raw: string | undefined): number {
  const s = (raw ?? "").trim();
  if (!/^[1-9][0-9]{0,15}$/.test(s)) throw new VaultError(400, "Query param \"at\" must be an epoch-ms integer");
  return Number.parseInt(s, 10);
}

versionRoutes.get("/versions", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Login required");
  const rel = assertNotePath(c.req.query("path") ?? "");
  safeAbs(rel); // the same containment throw /history relies on
  const answer: NoteVersionsResponse = { enabled: versionsEnabled(), versions: await listVersions(rel) };
  return c.json(answer);
});

versionRoutes.get("/versions/one", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Login required");
  const rel = assertNotePath(c.req.query("path") ?? "");
  safeAbs(rel);
  const at = versionAt(c.req.query("at"));
  const content = await readVersion(rel, at);
  if (content === null) throw new VaultError(404, `No version of ${rel} at ${at}`);
  const answer: NoteVersionBlob = { path: rel, at, content };
  return c.json(answer);
});

// Restore THROUGH the ordinary write path, so the text being replaced is
// itself kept (reason "restore", exempt from the collapse window) and the
// open editor learns of it the way it learns of any external write — the
// `changed` event, adopted as an undoable transaction. No special path.
versionRoutes.post("/versions/restore", async (c) => {
  const body = await jsonBody(c);
  const rel = assertNotePath(requiredString(body, "path"));
  const at = versionAt(typeof body.at === "number" ? String(body.at) : typeof body.at === "string" ? body.at : "");
  const content = await readVersion(rel, at);
  if (content === null) throw new VaultError(404, `No version of ${rel} at ${at}`);
  const existed = await noteExists(rel);
  suppressWatcherEcho(rel);
  const written = await writeNote(rel, content, undefined, "restore");
  emitEvent({ kind: existed ? "changed" : "created", path: written.path });
  await indexFile(written.path);
  return c.json(written);
});
