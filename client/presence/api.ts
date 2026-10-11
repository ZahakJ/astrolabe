// The two presence requests (docs/presence.md), kept out of client/api.ts on
// client/askApi.ts's precedent: the reporter is a lazy chunk loaded only for
// an admin who switched presence on, and the status row is on a settings
// page, so neither fetcher has any business in the entry bundle.

import type { PresenceReport, PresenceStatus } from "../../shared/presence/types.ts";
import { apiRequest } from "../api.ts";

/** One tab's word to the server. Admin only; the server answers 404 to
 *  anyone else and 400 to a malformed report. */
export function reportPresence(report: PresenceReport): Promise<unknown> {
  return apiRequest<unknown>(
    "/api/presence",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(report), keepalive: true },
    true,
  );
}

/** What the Settings → Discord status row prints. */
export function getPresenceStatus(signal?: AbortSignal): Promise<PresenceStatus> {
  return apiRequest<PresenceStatus>("/api/presence", signal ? { signal } : undefined, true);
}
