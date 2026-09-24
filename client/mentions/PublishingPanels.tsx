// The second lines under the webmentions and fediverse rows in Settings →
// Publishing (docs/webmentions.md). Not rows of their own: the tab holds
// eighteen at most, and a list of sent mentions and a follower count are
// answers ABOUT a switch, so they sit under it in the row's `after` line.
//
// One request feeds both (GET /api/webmentions/status), asked once per
// opening of the tab.

import { useEffect, useId, useState } from "react";
import type { FederationStatus, SentMentionStatus } from "../../shared/types.ts";
import { siteDate } from "../dates.ts";
import { countPhrase, t, tf } from "../i18n.ts";
import { useStore } from "../state.ts";
import { fetchFederationStatus, safeHref, shortUrl } from "./mentionsApi.ts";
import "./mentions.css";

let pending: Promise<FederationStatus> | null = null;
let pendingAt = 0;

/** One status request for every panel mounted in the same moment. */
function useFederationStatus(): FederationStatus | null {
  const [status, setStatus] = useState<FederationStatus | null>(null);
  useEffect(() => {
    if (pending === null || Date.now() - pendingAt > 2000) {
      pending = fetchFederationStatus();
      pendingAt = Date.now();
    }
    let disposed = false;
    pending.then((s) => !disposed && setStatus(s)).catch(() => !disposed && setStatus(null));
    return () => {
      disposed = true;
    };
  }, []);
  return status;
}

const STATUS_KEYS: Record<SentMentionStatus, "sentQueued" | "sentSent" | "sentNoEndpoint" | "sentFailed" | "sentSkipped"> = {
  queued: "sentQueued",
  sent: "sentSent",
  noEndpoint: "sentNoEndpoint",
  failed: "sentFailed",
  skipped: "sentSkipped",
};

/** Under "Send webmentions": the newest fifty sends and how each went. */
export function SentPanel({ on }: { on: boolean }) {
  const status = useFederationStatus();
  const locale = useStore((s) => s.blogLocale);
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (status === null) return null;
  const sent = status.sent;
  return (
    <div className="s-mentions-panel">
      {on && status.origin === null && <p className="s-smodal__conseq s-smodal__conseq--warn">{t("federationNoOrigin")}</p>}
      {sent.length === 0 ? (
        <p className="s-smodal__conseq s-smodal__conseq--plain">{t(on ? "sentNone" : "sentOff")}</p>
      ) : (
        <>
          <button type="button" className="s-btn s-mentions-panel__toggle" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)}>
            {tf("sentShow", { count: countPhrase(sent.length, "mentions") })}
          </button>
          <ul className="s-mentions-panel__list" id={listId} hidden={!open}>
            {sent.map((s) => {
              const href = safeHref(s.target);
              return (
                <li key={`${s.source} ${s.target}`} className="s-mentions-panel__item">
                  <span className={`s-mentions-panel__status s-mentions-panel__status--${s.status}`}>{t(STATUS_KEYS[s.status])}</span>
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" dir="ltr" className="s-mentions-panel__target" title={s.target}>
                      {shortUrl(s.target)}
                    </a>
                  ) : (
                    <span dir="ltr" className="s-mentions-panel__target">{shortUrl(s.target)}</span>
                  )}
                  <time className="s-mentions-panel__time" dateTime={new Date(s.sentMs).toISOString()}>
                    {siteDate(new Date(s.sentMs), locale, { month: "short", day: "numeric" })}
                  </time>
                  <span className="s-mentions-panel__from" dir="auto">{s.notePath.replace(/\.(md|tex)$/i, "")}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/** Under "Fediverse": the address people search for, and how many follow. */
export function FediverseNote({ on }: { on: boolean }) {
  const status = useFederationStatus();
  if (status === null) return null;
  if (!on) return <p className="s-smodal__conseq s-smodal__conseq--plain">{t("fediverseOffNote")}</p>;
  if (status.address === null) return <p className="s-smodal__conseq s-smodal__conseq--warn">{t("federationNoOrigin")}</p>;
  return (
    <p className="s-smodal__conseq s-smodal__conseq--plain">
      {tf("fediverseOnNote", { address: status.address, followers: countPhrase(status.followers, "followers") })}
      {!status.originFixed && <> {t("federationOriginGuessed")}</>}
    </p>
  );
}
