// THE POCKET VAULT'S OWN BACKUP & SYNC TAB.
//
// A pocket vault is a GitHub repository cloned into the Android app's private
// storage and served to this client by a server inside the WebView
// (mobile/src/pocket/). It has no instance behind it, so the tab it used to
// show here — remote URL, branch, SSH or token, an interval, a Sync now that
// drives a server's git — described a machine that was not there. A friend of
// the owner installed the APK, opened a vault from GitHub, typed into those
// fields and pressed Save: "the sync settings don't save… the sync switch
// keeps turning itself back off." It never could. The pocket server answered
// `gitSync` as a fixed block and its PATCH wrote to the phone's own
// Preferences, so every Save succeeded and every reload undid it.
//
// This is what belongs there instead, and all of it is already true: the
// repository this phone opened, the ONE LINE the shell paints over the vault
// (`shared/pocketSync.ts` decides it — the panel and the strip are one rule
// with two renderings), a Sync now that performs the pull and the push the app
// does on its own anyway, the `(phone)` conflict pairs still standing, and the
// door back to the connection screen.
//
// Mounted by SettingsModal.tsx's sync section when `me.pocket`, and parsed
// into the settings index FROM THIS FILE with `mode: "pocket"`
// (scripts/settings-index.mjs), so a search for "repository" or "leave" finds
// these rows on a phone and does not offer them in a browser.

import { useCallback, useEffect, useState } from "react";
import type { PocketConflict, PocketSyncStatus } from "../../../shared/types.ts";
import { pocketSyncLine } from "../../../shared/pocketSync.ts";
import { getPocketSync, pocketLeave, pocketSyncNow } from "../../api.ts";
import { returnToShell } from "../../androidShell.ts";
import { localeNum, t, tf } from "../../i18n.ts";
import { useStore } from "../../state.ts";
import { toast } from "../../toast.ts";
import { confirmModal } from "../Confirm.tsx";
import { Row } from "./Row.tsx";

/** The line, in the reader's language. The RULE that chose it is shared with
 *  the shell's strip; this is only the dictionary lookup, which is why a
 *  reader who glances at the strip and then opens the panel reads the same
 *  sentence rather than two versions of one fact. */
function lineText(status: PocketSyncStatus, nowMs: number): string {
  const line = pocketSyncLine(status, nowMs);
  switch (line.key) {
    case "conflicts":
      return tf("pocketLineConflicts", { count: localeNum(line.count) });
    case "toPush":
      return tf("pocketLineToPush", { count: localeNum(line.count) });
    case "syncedAgo":
      return tf("pocketLineSyncedAgo", { count: localeNum(line.minutes) });
    case "syncing":
      return t("pocketLineSyncing");
    case "pushing":
      return t("pocketLinePushing");
    case "offline":
      return t("pocketLineOffline");
    case "failed":
      return t("pocketLineFailed");
    case "syncedJustNow":
      return t("pocketLineSyncedJustNow");
    default:
      return t("pocketLineNever");
  }
}

/** Which of the three tones the line is painted in. Conflicts and a failure
 *  are the two states a reader must not scroll past. */
function lineTone(status: PocketSyncStatus): string {
  if (status.conflicts.length > 0 || status.error !== null) return " s-smodal__syncline--bad";
  if (status.ahead > 0 || !status.online) return "";
  return " s-smodal__syncline--muted";
}

export function PocketSyncPanel() {
  const [status, setStatus] = useState<PocketSyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void getPocketSync()
        .then((s) => {
          if (alive) setStatus(s);
        })
        .catch(() => {
          // The shell is not there (a browser opened this build), or the page
          // is going away: the panel stays quiet rather than alarming.
        });
    };
    load();
    // The state changes without this panel touching it — a save commits, the
    // debounced push fires thirty seconds later, the app comes back to the
    // foreground and pulls. A few seconds is the same beat the instance's own
    // status block keeps.
    const id = window.setInterval(load, 4000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const syncNow = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      setStatus(await pocketSyncNow());
    } catch {
      // The line itself carries the lasting account of a failure; this is for
      // the press that went nowhere at all.
      toast(t("pocketSyncFailed"), "error");
    } finally {
      setBusy(false);
    }
  }, []);

  /** Open one half of a conflict pair. The panel goes first — a file opened
   *  behind a modal is a file nobody reads. */
  const open = useCallback((path: string): void => {
    useStore.getState().setSettingsOpen(false);
    useStore.getState().openNote(path);
  }, []);

  const leave = useCallback(async (): Promise<void> => {
    if (leaving) return;
    const ok = await confirmModal({
      title: t("pocketLeaveTitle"),
      body: t("pocketLeaveBody"),
      confirmLabel: t("pocketLeaveAction"),
    });
    if (!ok) return;
    setLeaving(true);
    try {
      await pocketLeave();
      // The shell's navigation gate catches this path on any host and brings
      // the connection screen up with nothing auto-opening.
      returnToShell();
    } catch {
      toast(t("pocketLeaveFailed"), "error");
      setLeaving(false);
    }
  }, [leaving]);

  const conflicts: PocketConflict[] = status?.conflicts ?? [];

  return (
    <>
      <Row label={t("rowPocketRepo")} hint={t("hintPocketRepo")}>
        <div className="s-smodal__sync">
          {/* A repository name is a literal somebody will compare against
              github.com, so it keeps its own LTR isolate inside an Arabic
              panel — the same rule the remote URL row upstairs keeps. */}
          <div className="s-smodal__syncline">
            <bdi dir="ltr">{status === null ? t("loading") : status.repo}</bdi>
          </div>
          {status !== null && (
            <div className="s-smodal__syncline s-smodal__syncline--muted">
              <span>{tf("pocketOnBranch", { branch: status.branch })}</span>
            </div>
          )}
        </div>
      </Row>

      <Row label={t("rowPocketState")} hint={t("hintPocketState")}>
        <div className="s-smodal__sync">
          <div
            className={`s-smodal__syncline${status === null ? " s-smodal__syncline--muted" : lineTone(status)}`}
            role="status"
          >
            <span>{status === null ? t("loading") : lineText(status, Date.now())}</span>
          </div>
        </div>
      </Row>

      {/* Section-level verb, on its own line and with no label: it is not the
          value of a field called "State". The same shape the instance's sync
          actions take one branch up. */}
      <div className="s-smodal__actions">
        <button
          type="button"
          className="s-btn s-btn--accent"
          disabled={busy || status === null}
          onClick={() => void syncNow()}
        >
          {busy ? t("syncing") : t("syncNow")}
        </button>
      </div>

      <Row label={t("rowPocketConflicts")} hint={t("hintPocketConflicts")}>
        <div className="s-smodal__sync">
          {conflicts.length === 0 ? (
            <div className="s-smodal__syncline s-smodal__syncline--muted">
              <span>{t("pocketNoConflicts")}</span>
            </div>
          ) : (
            <>
              <ul className="s-pocketconflicts">
                {conflicts.map((pair) => (
                  <li key={pair.phonePath} className="s-pocketconflicts__pair">
                    <button type="button" className="s-linkbtn" onClick={() => open(pair.path)}>
                      <bdi dir="auto">{pair.path}</bdi>
                    </button>
                    <button type="button" className="s-linkbtn" onClick={() => open(pair.phonePath)}>
                      <bdi dir="auto">{pair.phonePath}</bdi>
                    </button>
                  </li>
                ))}
              </ul>
              {/* The manual's one-line contract, where the pairs are: nothing
                  was merged, and the person who wrote both sentences decides. */}
              <div className="s-smodal__syncline s-smodal__syncline--muted">
                <span>{t("pocketConflictRule")}</span>
              </div>
            </>
          )}
        </div>
      </Row>

      <Row label={t("rowPocketLeave")} hint={t("hintPocketLeave")}>
        <button type="button" className="s-btn" disabled={leaving} onClick={() => void leave()}>
          {t("pocketLeaveAction")}
        </button>
      </Row>
    </>
  );
}
