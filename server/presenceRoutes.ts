// Discord presence's two routes (docs/plans/discord-presence.md). Admin only,
// both ways: a visitor has no presence to report, and the status describes
// the owner's machine. A 404 rather than a 403, as /api/settings answers, so
// the route does not announce itself.

import { Hono } from "hono";
import { validateReport } from "../shared/presence/reduce.ts";
import { isPublishLimited } from "./auth.ts";
import { presenceStatus, reportPresence } from "./presence/host.ts";
import { jsonBody } from "./requestBody.ts";
import { VaultError } from "./vault.ts";

export const presenceRoutes = new Hono();

presenceRoutes.post("/presence", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  const report = validateReport(await jsonBody(c));
  if (typeof report === "string") throw new VaultError(400, report);
  reportPresence(report);
  return c.json({ ok: true });
});

presenceRoutes.get("/presence", (c) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  return c.json(presenceStatus());
});
