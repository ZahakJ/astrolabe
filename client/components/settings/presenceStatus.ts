// SETTINGS → DISCORD → STATUS, as sentences: which ones a presence status
// (GET /api/presence) earns, pure so tests/presenceClient.test.ts can hold
// every state to its words without drawing the page (./PresenceTab.tsx).

import type { PresenceStatus } from "../../../shared/presence/types.ts";
import type { I18nKey } from "../../i18n.ts";

/** The sentences for one status, in the order a reader fixes them: switch it
 *  on, give it an id, give it a host, start Discord. */
export function presenceStatusLines(status: PresenceStatus): { key: I18nKey; preview?: string }[] {
  if (status.mode === "off") return [{ key: "presenceStatOff" }];
  if (status.applicationId === "placeholder") return [{ key: "presenceStatNoId" }];
  if (status.host === "none") return [{ key: "presenceStatNoHost" }];
  const host: I18nKey = status.host === "desktop" ? "presenceStatHostDesktop" : "presenceStatHostServer";
  switch (status.connection) {
    case "connected": {
      const a = status.activity;
      const words = a ? [a.details, a.state].filter((w): w is string => typeof w === "string" && w !== "") : [];
      return [
        { key: host },
        words.length > 0 ? { key: "presenceStatShowing", preview: words.join(" · ") } : { key: "presenceStatShowingNothing" },
      ];
    }
    case "invalid-id":
      return [{ key: "presenceStatInvalidId" }];
    case "searching":
      return [{ key: status.host === "desktop" ? "presenceStatSearchingDesktop" : "presenceStatSearchingServer" }];
    default:
      return [{ key: "presenceStatOff" }];
  }
}
