// Comments (marginalia). Mounted from server/api.ts below the auth guard;
// moved out of that file unchanged.

import { Hono } from "hono";
import { AUTHOR_MAX, BODY_MAX, addComment, commentRateLimited, commentsEnabled, listAllComments, listComments, phantomComment, recordCommentPost, removeComment, setCommentHidden } from "./comments.ts";
import type { CommentData } from "../shared/types.ts";
import { VaultError, normalizeRel } from "./vault.ts";
import { clientIp, isPublishLimited } from "./auth.ts";
import { isNotePath } from "../shared/noteFormat.ts";
import { isNotePublished } from "./indexer.ts";
import { jsonBody, requiredQuery, requiredString } from "./requestBody.ts";
import { stripBidiControls } from "../shared/bidi.ts";

export const commentRoutes = new Hono();

// ------------------------------------------------------ comments (marginalia)
// Live only with COMMENTS=on; otherwise every route 404s like it doesn't exist.
// Comments hang off published notes: for visitors (and posting, for everyone)
// an unpublished/missing note answers the same 404 a missing note would.

function assertCommentsEnabled(): void {
  if (!commentsEnabled()) throw new VaultError(404, "Not found");
}

function commentNotePath(rel: string): string {
  const notePath = normalizeRel(rel);
  if (!isNotePath(notePath)) {
    throw new VaultError(400, `Not a note path: ${rel}`);
  }
  return notePath;
}

// Moderation feed: newest comments across all notes, hidden ones included.
// Registered before GET /comments so nothing shadows it; admin sessions only —
// visitors (and admin-as-visitor preview) get the same 404 a missing route
// would give. Must be admin-gated explicitly: the auth guard passes GETs.
commentRoutes.get("/comments/all", (c) => {
  assertCommentsEnabled();
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  const raw = c.req.query("limit");
  let limit = 100;
  if (raw !== undefined) {
    limit = Number(raw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new VaultError(400, "limit must be an integer between 1 and 500");
    }
  }
  return c.json(listAllComments(limit));
});

commentRoutes.get("/comments", (c) => {
  assertCommentsEnabled();
  const notePath = commentNotePath(requiredQuery(c.req.query("path"), "path"));
  // Admins may read (moderate) comments on any note; visitors only where
  // the note itself is visible to them.
  const limited = isPublishLimited(c);
  if (limited && !isNotePublished(notePath)) {
    throw new VaultError(404, `Note not found: ${notePath}`);
  }
  // Admin responses carry the hidden flag (and hidden comments); visitor
  // responses exclude hidden rows and never mention the flag at all.
  return c.json(listComments(notePath, !limited));
});

// NOTE: the 64 KB body cap (see the body-limit middleware up top) runs ahead
// of jsonBody() here — the rate limiter can only run post-parse, so that cap
// is what actually bounds memory per connection on this anonymous surface.
commentRoutes.post("/comments", async (c) => {
  assertCommentsEnabled();
  const payload = await jsonBody(c);
  const notePath = commentNotePath(requiredString(payload, "path"));
  // Comments attach to the published site only — for anyone, admin included.
  if (!isNotePublished(notePath)) {
    throw new VaultError(404, `Note not found: ${notePath}`);
  }
  // Comment author + body are the ONE unauthenticated channel that renders
  // into the public page, so bidi controls come out at write time — the same
  // discipline /api/frontmatter applies to C0 controls. The chrome's <bdi> /
  // FSI…PDI isolation stops an override from escaping the name span, but it
  // cannot stop the name from lying about itself: an author of
  // "Ali<U+202E>rotartsinimd" renders as "AliAdministrator", neatly inside
  // the byline, and reads as genuine. Strip before length-capping so the cap
  // measures characters the reader will actually see.
  const body = typeof payload.body === "string" ? stripBidiControls(payload.body).trim() : "";
  if (!body) throw new VaultError(400, 'Body field "body" must be a non-empty string');
  if (body.length > BODY_MAX) {
    throw new VaultError(400, `Comment is too long (${BODY_MAX} characters max)`);
  }
  const author =
    (typeof payload.author === "string"
      ? stripBidiControls(payload.author).trim().slice(0, AUTHOR_MAX)
      : "") || "Anonymous";
  // Honeypot: the hidden "website" field is invisible to humans. A filled-in
  // value marks a bot — answer success, store nothing.
  if (typeof payload.website === "string" && payload.website.trim() !== "") {
    return c.json(phantomComment(notePath, author, body));
  }
  const ip = clientIp(c);
  if (commentRateLimited(ip)) {
    throw new VaultError(429, "Slow down — try again in a minute");
  }
  recordCommentPost(ip);
  const comment: CommentData = addComment(notePath, author, body, ip);
  return c.json(comment);
});

// Admin-only via the auth guard (mutation on a non-exempt path). Hide/unhide:
// a hidden comment stays in the db (evidence, reversibility) but vanishes from
// every visitor-facing response.
commentRoutes.patch("/comments/:id", async (c) => {
  assertCommentsEnabled();
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) throw new VaultError(400, "Invalid comment id");
  const payload = await jsonBody(c);
  if (typeof payload.hidden !== "boolean") {
    throw new VaultError(400, 'Body field "hidden" must be a boolean');
  }
  if (!setCommentHidden(id, payload.hidden)) throw new VaultError(404, "Comment not found");
  return c.json({ ok: true });
});

// Admin-only via the auth guard (mutation on a non-exempt path).
commentRoutes.delete("/comments/:id", (c) => {
  assertCommentsEnabled();
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) throw new VaultError(400, "Invalid comment id");
  if (!removeComment(id)) throw new VaultError(404, "Comment not found");
  return c.json({ ok: true });
});
