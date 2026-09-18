// Status-bar backup indicator (ADMIN only, and only once backup & sync is
// switched on with a remote — an instance that never configured it shows
// nothing at all).
//
// Deliberately quiet: a branch glyph, plus a count only when there is
// something uncommitted. Click opens a small panel with the whole diagnosis in
// it — branch, remote, ahead/behind, the last result, and git's own error line
// as SELECTABLE text with a copy button.
//
// It used to be a native `title` tooltip and a click that re-ran the sync.
// CONTRACTS.md calls that error text "the diagnosis", i.e. the string a reader
// pastes into a search box: a tooltip cannot be selected or copied, takes a
// second of hover, and does not exist at all on touch. And on a FAILURE, the
// one affordance the badge offered was the one action that cannot explain the
// failure — so the panel leads with "Backup settings" instead.

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useDialog } from "../a11y.ts";
import { clampAxis } from "./anchorPopover.ts";
import { localeNum, t, tf } from "../i18n.ts";
import { useStore } from "../state.ts";
import {
  onSyncChange,
  refreshSyncStatus,
  runSyncNow,
  syncBusy,
  syncCause,
  syncSnapshot,
  syncWhen,
  SYNC_PANEL_EVENT,
} from "../sync.ts";

const POLL_MS = 20_000;

export default function SyncBadge() {
  const admin = useStore((s) => s.admin);
  const preview = useStore((s) => s.previewVisitor);
  const locale = useStore((s) => s.blogLocale);
  useStore((s) => s.language); // re-render the chrome strings on language change
  const [, bump] = useState(0);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [anchor, setAnchor] = useState<CSSProperties>({});
  const wrapRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  /** The status bar clips its own overflow (long breadcrumbs must not push the
   *  bar around), so the panel is `position: fixed` and pinned to the badge by
   *  hand. Anchored on the reading direction's END edge, which is the side the
   *  bar's own segments grow from.
   *
   *  BOTH EDGES, through the popovers' own clamp. The old arithmetic held the
   *  near edge to 8px and said nothing about the far one, so wherever the
   *  badge sits inland — which on a 390px phone is everywhere, because the
   *  bar's right cluster is not at the right of the screen — a 358px panel
   *  anchored to it started at x = −189 and the diagnosis it exists to show
   *  was off the side of the phone. `clampAxis` is the rule the folder-icon
   *  picker and the library popover are placed by; one rule, so two popovers
   *  cannot fold at different distances from the same edge. */
  const place = useCallback(() => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rtl = document.documentElement.dir === "rtl";
    // Measured, never assumed: the width is a `min()` of a cap and the
    // viewport, and the panel is on screen by the time this runs.
    //
    // `offsetWidth`, NOT a bounding rect: the panel arrives on
    // `s-palette-in`, which is `scale(0.985)` at its first frame, and a
    // bounding rect reports the TRANSFORMED box. Placing against it read 355
    // for a 360px panel and hung the trailing edge 5px past the badge it is
    // anchored to — a placement whose error depended on which frame of an
    // animation the measurement landed in. Layout width has no frames.
    const width = popRef.current?.offsetWidth ?? 0;
    const vw = document.documentElement.clientWidth;
    setAnchor({
      bottom: Math.round(window.innerHeight - rect.top + 8),
      left: Math.round(clampAxis(rtl ? rect.left : rect.right - width, width, vw)),
    });
  }, []);

  useEffect(() => onSyncChange(() => bump((n) => n + 1)), []);

  useEffect(() => {
    if (!admin || preview) return;
    void refreshSyncStatus();
    const id = window.setInterval(() => void refreshSyncStatus(), POLL_MS);
    const onFocus = (): void => void refreshSyncStatus();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [admin, preview]);

  /** THE TOAST'S DOOR (v1.8 UX audit F40). "Vault committed and pushed —
   *  a3f19c2" ends with a button, and the button opens this panel, which is
   *  where the rest of the answer already lives. Focus follows it: a reader
   *  who arrived by pressing a button and was left with focus back on the
   *  vanished toast has been handed nothing. It lands INSIDE the panel now
   *  (useDialog below), which is one better than the badge beside it. */
  useEffect(() => {
    const onOpen = (): void => {
      setOpen(true);
    };
    window.addEventListener(SYNC_PANEL_EVENT, onOpen);
    return () => window.removeEventListener(SYNC_PANEL_EVENT, onOpen);
  }, []);

  // Click-outside and Esc close the panel. Capture phase for the key, like the
  // other overlays, so the editor never sees it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    place();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  useEffect(() => setCopied(false), [open]);

  // THE PALETTE CLOSES IT. This panel sits at --z-popover, one rung ABOVE the
  // toasts and two above the palette, which is right for a toast landing on
  // its buttons and wrong for a full-viewport sheet: the popover stayed lit
  // and unblurred over the palette's own backdrop. Ctrl/Cmd+P is a keystroke,
  // so the outside-mousedown above never sees it.
  const paletteOpen = useStore((s) => s.paletteOpen);
  useEffect(() => {
    if (paletteOpen) setOpen(false);
  }, [paletteOpen]);

  // A POPOVER THAT STAYED PUT WHILE THE READER WALKED PAST IT. Twenty-one Tab
  // presses left the panel open, unblurred, and focus somewhere in the app
  // behind it — and this one holds an error message people are meant to select
  // and copy. The ring stays inside; closing hands focus back to the badge
  // when the badge is what opened it, and to nothing when the toast that
  // opened it has already gone, which is the honest answer. Escape and the
  // outside mousedown are the listeners above.
  useDialog(popRef, { active: open });

  const status = syncSnapshot();
  // Never shown to a visitor, and never shown on an instance that has not
  // turned sync on — the feature is invisible until it is asked for.
  if (!admin || preview || !status || !status.enabled || !status.configured) return null;

  const busy = syncBusy();
  const failed = status.last !== null && !status.last.ok;
  const state = busy ? "busy" : failed ? "error" : status.dirty > 0 ? "dirty" : "clean";
  const error = failed ? (status.last?.message ?? "") : null;
  // The cause we can state, ahead of git's implementation detail.
  const cause = syncCause(status.authMode, status);

  const label = busy
    ? t("syncing")
    : failed
      ? t("syncErrorShort")
      : status.dirty > 0
        ? localeNum(status.dirty)
        : "";

  const copyError = (): void => {
    if (error === null) return;
    void navigator.clipboard
      ?.writeText(error)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  // No trailing `·`. The badge used to print its own separator dot, which is
  // half of the two-separator-systems bug the status bar had: `.s-syncwrap`
  // is a GROUP now (app.css marks it with the same leading hairline every
  // other right-cluster segment carries), and a group that also emits a dot
  // is marked twice.
  return (
    <>
      <span className="s-syncwrap" ref={wrapRef}>
        <button
          type="button"
          ref={btnRef}
          className={`s-statusbar__btn s-sync s-sync--${state}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={t("syncDetails")}
        >
          <svg
            className="s-sync__glyph"
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="6" cy="4" r="2" />
            <circle cx="6" cy="20" r="2" />
            <circle cx="18" cy="8" r="2" />
            <path d="M6 6v8" />
            <path d="M18 10c0 4-6 3-6 8" />
          </svg>
          {label !== "" && <span className="s-sync__label">{label}</span>}
        </button>

        {open && (
          <div
            ref={popRef}
            className="s-syncpop"
            style={anchor}
            role="dialog"
            aria-modal="true"
            aria-label={t("syncDetails")}
          >
            <div className="s-syncpop__line">
              {status.repo
                ? tf("syncTipBranch", { branch: status.branch ?? "—", host: status.remoteHost ?? "—" })
                : t("syncTipNoRepo")}
            </div>
            {status.repo && (
              <div className="s-syncpop__line s-syncpop__line--muted s-smodal__counts">
                <span>
                  {status.dirty > 0 ? tf("syncTipDirty", { count: localeNum(status.dirty) }) : t("syncTipClean")}
                </span>
                {/* Separated by a hairline, not a "·": the Eastern Arabic zero
                    is itself a dot. And null is not zero: no remote-tracking ref means nothing here
                    has ever reached the remote, which is the opposite of the
                    "0 ahead · 0 behind" a fully backed-up vault reads. */}
                {status.ahead !== null && status.behind !== null && (
                  <>
                    <bdi>{tf("syncAhead", { count: localeNum(status.ahead) })}</bdi>
                    <bdi>{tf("syncBehind", { count: localeNum(status.behind) })}</bdi>
                  </>
                )}
              </div>
            )}
            {status.repo && (status.ahead === null || status.behind === null) && (
              <div className="s-syncpop__line">
                <span className="s-syncpop__warn">{t("syncNoTracking")}</span>
              </div>
            )}
            {status.last !== null && (
              <div className="s-syncpop__line s-syncpop__line--muted s-smodal__counts">
                {/* Isolated separately: dir="auto" over "date — message" takes
                    its direction from the date and reorders the rest. */}
                <bdi>{syncWhen(status.last.at, locale)}</bdi>
                {/* The sha names the pass, here as in the toast that
                    announced it (F40) — the panel is where a reader comes back
                    to look it up after the toast has gone. */}
                <bdi>
                  {status.last.ok
                    ? status.last.committed && status.last.sha
                      ? tf("syncPushedSha", { sha: status.last.sha })
                      : t(
                          status.last.committed
                            ? "syncPushed"
                            : status.last.remoteAdvanced === true
                              ? "syncPushedOnly"
                              : "syncUpToDate",
                        )
                    : (cause ?? t("syncFailed"))}
                </bdi>
              </div>
            )}
            {error !== null && (
              <div className="s-syncpop__err">
                <span className="s-syncpop__errlabel">{t("syncGitSaid")}</span>
                {/* git's words, verbatim, in their own LTR isolate — and
                    selectable, which is the whole point of not being a
                    tooltip. */}
                <code className="s-syncpop__errtext" dir="ltr">
                  {error}
                </code>
                <button type="button" className="s-btn s-syncpop__copy" onClick={copyError}>
                  {t(copied ? "syncCopied" : "syncCopyError")}
                </button>
              </div>
            )}
            <div className="s-syncpop__btns">
              <button
                type="button"
                className={`s-btn${failed ? " s-btn--accent" : ""}`}
                onClick={() => {
                  setOpen(false);
                  useStore.getState().setSettingsOpen(true);
                }}
              >
                {t("syncOpenSettings")}
              </button>
              <button
                type="button"
                className={`s-btn${failed ? "" : " s-btn--accent"}`}
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  void runSyncNow();
                }}
              >
                {busy ? t("syncing") : t("syncNow")}
              </button>
            </div>
          </div>
        )}
      </span>
    </>
  );
}
