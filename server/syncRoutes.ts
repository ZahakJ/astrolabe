// Backup and sync, the workspace state and the saved layouts. Mounted from
// server/api.ts below the auth guard; moved out of that file unchanged.

import { Hono } from "hono";
import { VaultError } from "./vault.ts";
import { cleanName, deleteLayout, getLayout, listLayouts, putLayout } from "./layouts.ts";
import { gitStatus, initRepo, snapshotNow, syncAtLaunch, syncNow } from "./gitSync.ts";
import { isProtected, isPublishLimited } from "./auth.ts";
import { jsonBody } from "./requestBody.ts";
import { readWorkspaceState, writeWorkspaceState } from "./workspaceState.ts";
import { resyncNow, travelStatus } from "./configMirror.ts";

export const syncRoutes = new Hono();

// -------------------------------------------------------------- backup & sync
// Git backup (server/gitSync.ts). Admin-eyes-only, all three: the POSTs are
// mutations, so the auth guard 401s visitors and preview sessions already; the
// GET is gated here the same way /api/settings is — a visitor learning the
// branch, the dirty count and the remote host of the operator's backup is a
// leak, and an admin PREVIEWING as a visitor must see exactly what a stranger
// would. Sync errors reaching the client are the real git line, token-scrubbed
// by gitSync.scrub() before it ever leaves the module.

// A REAL CREDENTIAL, IN EVERY MODE. In open local mode (no
// ADMIN_PASSWORD_HASH) the auth guard treats every caller as admin, so these
// three routes were reachable by anyone who could reach the port — and they
// are not ordinary admin routes: PATCH the remote, POST /sync/now, and the
// whole vault is committed and pushed to an address the caller chose. That is
// exfiltration with the operator's own git. "Everyone is admin" is a
// defensible answer for editing notes on a trusted LAN; it is not a
// defensible answer for "send my vault somewhere".
export function assertCredentialed(): void {
  if (!isProtected()) {
    throw new VaultError(
      403,
      "Backup & sync needs an admin password: set ADMIN_PASSWORD_HASH (npm run hash-password) and restart. " +
        "Without one, every visitor to this port is an admin and could push your vault to a remote of their choosing.",
      "sync_needs_password",
    );
  }
}

// The STATUS read stays available in open local mode. It is the one route of
// the three that cannot move data anywhere, the client polls it on every page
// load to decide whether to draw the badge at all, and answering 403 there put
// a red line in the console of the default first-run experience for no gain:
// on an instance where every caller is already a full admin, the branch name
// leaks nothing the vault itself does not.
syncRoutes.get("/sync/status", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  return c.json(await gitStatus());
});

// What travels with the vault (server/configMirror.ts): the mirror's own
// report — each item's presence on either side, the last pass and what it
// could not copy. Same gate as the status above: the list names the files a
// remote will hold, and a preview session is a visitor.
syncRoutes.get("/sync/travel", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  return c.json(await travelStatus());
});

// "Re-sync now": one mirror pass plus the font warm, then the same report.
syncRoutes.post("/sync/travel", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  await resyncNow();
  return c.json(await travelStatus());
});

syncRoutes.post("/sync/init", async (c) => {
  assertCredentialed();
  return c.json(await initRepo());
});

syncRoutes.post("/sync/now", async (c) => {
  assertCredentialed();
  return c.json(await syncNow("manual"));
});

// A window opened: the client says so once per load, and the server runs a
// pass when one is due (server/gitSync.ts::syncAtLaunch). The answer is only
// whether it ran; the status route says how it went.
syncRoutes.post("/sync/launch", async (c) => {
  assertCredentialed();
  return c.json({ ran: await syncAtLaunch() });
});

// The last workspace, kept beside the vault (server/workspaceState.ts): what
// a desktop window restores when its own storage is empty — a new port is a
// new origin, and a new origin has no tabs.
syncRoutes.get("/state/workspace", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  return c.json({ workspace: await readWorkspaceState() });
});

// Named layouts (server/layouts.ts): the arrangement under a name.
syncRoutes.get("/layouts", (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  return c.json({ layouts: listLayouts() });
});
syncRoutes.get("/layouts/one", (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  const name = cleanName(c.req.query("name"));
  if (name === null) throw new VaultError(400, "A layout needs a name");
  const workspace = getLayout(name);
  if (workspace === null) throw new VaultError(404, "No such layout");
  return c.json({ name, workspace });
});
syncRoutes.put("/layouts", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  const body = await jsonBody(c);
  const name = cleanName(body.name);
  if (name === null) throw new VaultError(400, "A layout needs a name (one line, up to 60 characters)");
  if (!putLayout(name, body.workspace)) throw new VaultError(400, "That layout could not be saved (too large, or the store is full)");
  return c.json({ ok: true, name });
});
syncRoutes.delete("/layouts", (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  const name = cleanName(c.req.query("name"));
  if (name === null || !deleteLayout(name)) throw new VaultError(404, "No such layout");
  return c.json({ ok: true });
});

syncRoutes.put("/state/workspace", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new VaultError(400, "Invalid JSON body");
  }
  const ok = await writeWorkspaceState((body as { workspace?: unknown })?.workspace);
  return c.json({ ok });
});

// A LOCAL commit, and nothing else. Deliberately NOT behind
// assertCredentialed(): that gate exists because a sync can send the whole
// vault to an address the caller chose, and this one moves no bytes off the
// machine at all — it writes a commit into a repository that is already on the
// operator's disk. Holding it to the "everyone is admin is not good enough"
// bar would put a password between the reader and the safety point they are
// making BEFORE the scary edit, which is the one moment the product must not
// argue with them.
syncRoutes.post("/sync/snapshot", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  return c.json(await snapshotNow());
});
