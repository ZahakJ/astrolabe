// Backup & sync's live half: the status block (what the last push did, and
// when) and the two verbs beside it. Split out of SettingsModal.tsx (3.27.0)
// unchanged.

import { useEffect, useState } from "react";
import { localeNum, t, tf } from "../../i18n.ts";
import { useStore } from "../../state.ts";
import { onSyncChange, refreshSyncStatus, runSyncInit, runSyncNow, syncBusy, syncCause, syncSnapshot, syncWhen } from "../../sync.ts";

/** The remote as a reader can TELL APART: host plus path, credentials-free.
 *  "github.com" alone names the host two different vaults share; the full URL
 *  is five rows above in this same panel, so nothing is revealed by echoing
 *  its identifying half here. Falls back to whatever the server reports. */
export function remoteLabel(remote: string): string | null {
  const value = remote.trim();
  if (value === "") return null;
  const scp = /^[^@\s]+@([^:\s]+):(.+)$/.exec(value);
  if (scp) return `${scp[1]}/${scp[2].replace(/^\/+/, "")}`;
  try {
    const url = new URL(value);
    // hostname + pathname only: URL parsing leaves userinfo behind by
    // construction, so a pasted credential can never ride along.
    return `${url.hostname}${url.pathname}`.replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Live repo state: what the vault's repository IS right now. The two actions
 *  used to live inside this box under a label reading "Status", which made
 *  section-level verbs read as the value of a field; they are their own row
 *  now (SyncActions). */
export function SyncStatusBlock({
  authMode,
  remote,
  stale,
}: {
  authMode: string;
  remote: string;
  stale: boolean;
}) {
  const locale = useStore((s) => s.blogLocale);
  const [, bump] = useState(0);

  useEffect(() => onSyncChange(() => bump((n) => n + 1)), []);
  useEffect(() => {
    void refreshSyncStatus();
    const id = window.setInterval(() => void refreshSyncStatus(), 5000);
    return () => window.clearInterval(id);
  }, []);

  const status = syncSnapshot();
  const busy = syncBusy();
  const failed = status?.last != null && !status.last.ok;
  const state = busy ? "busy" : failed ? "error" : status?.repo ? "ok" : "idle";
  const cause = syncCause(authMode, status);
  const target = remoteLabel(remote) ?? status?.remoteHost ?? t("syncNoRemote");
  const lastAt = status?.last != null ? syncWhen(status.last.at, locale) : null;

  return (
    <div className="s-smodal__sync">
      <div className="s-smodal__syncline">
        <span className={`s-syncdot s-syncdot--${state}`} aria-hidden="true" />
        <span>
          {status === null
            ? t("loading")
            : !status.repo
              ? t("syncNotRepo")
              : tf("syncOnBranch", { branch: status.branch ?? "—", host: target })}
        </span>
      </div>
      {status?.repo && (
        // Three counts, separated by a hairline rather than a "·": the Eastern
        // Arabic zero IS a dot, so a middle-dot separator beside it produced
        // the unreadable "٠٠" run. Each count is also its own isolate — one
        // interpolated "{ahead} ahead · {behind} behind" reordered under RTL
        // into two colliding numerals. ahead/behind are number | null, and
        // null is NOT zero: it means nothing here has reached the remote.
        <div className="s-smodal__syncline s-smodal__syncline--muted s-smodal__counts">
          <span>
            {status.dirty > 0 ? tf("syncTipDirty", { count: localeNum(status.dirty) }) : t("syncTipClean")}
          </span>
          {status.ahead !== null && status.behind !== null && (
            <>
              <bdi>{tf("syncAhead", { count: localeNum(status.ahead) })}</bdi>
              <bdi>{tf("syncBehind", { count: localeNum(status.behind) })}</bdi>
            </>
          )}
        </div>
      )}
      {status?.repo && (status.ahead === null || status.behind === null) && (
        <div className="s-smodal__syncline">
          <span className="s-smodal__syncwarn">{t("syncNoTracking")}</span>
        </div>
      )}
      {status?.last != null && lastAt !== null && status.last.ok && (
        <div className="s-smodal__syncline s-smodal__syncline--muted s-smodal__counts">
          {/* Two ISOLATES, not one dir="auto" span: "auto" takes its direction
              from the first strong character — the Arabic date — and then
              reorders everything after it around that. */}
          <bdi>{lastAt}</bdi>
          <bdi>
            {status.last.committed && status.last.sha
              ? tf("syncPushedSha", { sha: status.last.sha })
              : t(
                  status.last.committed
                    ? "syncPushed"
                    : status.last.remoteAdvanced === true
                      ? "syncPushedOnly"
                      : "syncUpToDate",
                )}
          </bdi>
        </div>
      )}
      {status?.last != null && lastAt !== null && !status.last.ok && (
        <div className="s-smodal__syncfail">
          <div className="s-smodal__syncline s-smodal__syncline--bad s-smodal__counts">
            <bdi>{lastAt}</bdi>
            <bdi>{cause ?? t("syncFailed")}</bdi>
          </div>
          {/* git's own words, verbatim and token-scrubbed — the diagnosis, and
              the thing a reader pastes into a search box. Its OWN dir="ltr"
              block: bidi cannot reach into it from the localized line above,
              and it is selectable text rather than a tooltip. */}
          <div className="s-smodal__syncgit">
            <span className="s-smodal__syncgitlabel">{t("syncGitSaid")}</span>
            <code className="s-smodal__syncgittext" dir="ltr">
              {status.last.message}
            </code>
          </div>
        </div>
      )}
      {cause !== null && !failed && (
        <div className="s-smodal__syncline s-smodal__syncwarn">
          <span>{cause}</span>
        </div>
      )}
      {stale && (
        <div className="s-smodal__syncline s-smodal__syncline--muted">
          <span>{t("syncSaveFirst")}</span>
        </div>
      )}
    </div>
  );
}

/** Initialize / Sync now. SECTION-level verbs, so they sit in their own
 *  full-width row rather than inside a field called "Status". Both act on what
 *  the SERVER has stored, never on what the form shows — acting while the two
 *  disagree would push to the old remote and then report success — so they
 *  wait for the save, and the status block above says so.
 *
 *  "Initialize repository" LEAVES once the vault is one. A permanently greyed
 *  button holding the primary position, forever, is not a control. */
export function SyncActions({ stale, disabled }: { stale: boolean; disabled: boolean }) {
  const [, bump] = useState(0);
  useEffect(() => onSyncChange(() => bump((n) => n + 1)), []);
  const status = syncSnapshot();
  const busy = syncBusy();
  const blocked = disabled || stale || busy || status === null;
  return (
    <div className={`s-smodal__actions${disabled ? " s-smodal__actions--off" : ""}`}>
      {status !== null && !status.repo && (
        <button type="button" className="s-btn" disabled={blocked} onClick={() => void runSyncInit()}>
          {t("syncInitialize")}
        </button>
      )}
      <button
        type="button"
        className="s-btn s-btn--accent"
        disabled={blocked || !status?.repo || !status.configured}
        onClick={() => void runSyncNow()}
      >
        {busy ? t("syncing") : t("syncNow")}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typography — four slots over the self-hosted catalog, plus a live specimen.
// ---------------------------------------------------------------------------
