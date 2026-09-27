// THIS DEVICE — the app itself, here: an offline copy of what you open, the
// Vim key map, the what's-new deck after an update, and on the desktop the
// app's own name, icon, launcher entry and update checks. A page body (see
// ./TabBody.tsx), the first of the rail's App group.
//
// Only truly per-device things live here — every row is kept in this browser
// (or, for the desktop's, by this install) and saves as it changes, which the
// page says once (`device` in tabs.ts). The purge had dissolved a "This
// device" tab that was a storage mechanism's name over the theme and the
// reader's language; those stay where their questions are asked (Appearance,
// Language). What came back is the handful of rows about the APP rather than
// about notes, which had been parked on About.

import { useEffect, useState } from "react";
import { t, tf } from "../../i18n.ts";
import { desktop, type DesktopBrand, type DesktopUpdatesPref } from "../../desktop/bridge.ts";
import { useStore } from "../../state.ts";
import { toast } from "../../toast.ts";
import { confirmModal } from "../Confirm.tsx";
import { OFFLINE_EVENT, clearOfflineCopy, offlineEnabled, offlineSupported, setOfflineEnabled } from "../../offline.ts";
import { WHATSNEW_EVENT, setWhatsNewEnabled, whatsNewEnabled } from "../../whatsnew/door.ts";
import { SegmentedControl, TextInput, Toggle } from "../controls/Fields.tsx";
import { useEventPref } from "./devicePrefs.ts";
import { Part, Parts, Row } from "./Row.tsx";

export default function DeviceTab() {
  const offline = useEventPref(OFFLINE_EVENT, offlineEnabled);
  const whatsNew = useEventPref(WHATSNEW_EVENT, whatsNewEnabled);
  const vimMode = useStore((s) => s.vimMode);
  const toggleVim = useStore((s) => s.toggleVim);
  const relativeLines = useStore((s) => s.relativeLines);
  const toggleRelativeLines = useStore((s) => s.toggleRelativeLines);
  return (
    <section data-section="device">
      {offlineSupported() && (
        <Row device label={t("rowOffline")} hint={t("hintOffline")}>
          <div className="s-settings__inline">
            <Toggle value={offline} onChange={setOfflineEnabled} label={t("rowOffline")} onLabel={t("on")} offLabel={t("off")} />
            {/* Deletes bytes, so it asks — the panel's rule for anything that
                does. At the trailing edge of the row, like the other verbs. */}
            <button
              type="button"
              className="s-btn"
              onClick={() => {
                void confirmModal({ title: t("offlineClearTitle"), body: t("offlineClearBody"), confirmLabel: t("offlineClear") }).then((ok) => {
                  if (ok) void clearOfflineCopy().then(() => toast(t("offlineCleared")));
                });
              }}
            >
              {t("offlineClear")}
            </button>
          </div>
        </Row>
      )}
      <Row device label={t("rowVimKeys")} hint={t("hintVimKeys")}>
        <Parts>
          <Toggle label={t("rowVimKeys")} onLabel={t("on")} offLabel={t("off")} value={vimMode} onChange={() => toggleVim()} />
          {vimMode && (
            <Part label={t("rowRelativeLines")} hint={t("hintRelativeLines")}>
              <Toggle label={t("rowRelativeLines")} onLabel={t("on")} offLabel={t("off")} value={relativeLines} onChange={() => toggleRelativeLines()} />
            </Part>
          )}
        </Parts>
      </Row>
      <Row device label={t("rowWhatsNew")} hint={t("hintWhatsNew")}>
        <Toggle value={whatsNew} onChange={setWhatsNewEnabled} label={t("rowWhatsNew")} onLabel={t("on")} offLabel={t("off")} />
      </Row>
      <AppIdentityRows />
      <UpdatesRow />
    </section>
  );
}

/** THIS APP'S NAME AND ICON, on the desktop only. Astrolabe is one person's
 *  name for it; the reader running it over their own vault gets to call the
 *  tray, the window, the launcher entry and the About box whatever they like,
 *  and an update never takes it back (electron/brand.ts). The rows render
 *  only where the bridge offers them — a browser has no tray to rename. */
function AppIdentityRows() {
  const bridge = desktop();
  const [brand, setBrand] = useState<DesktopBrand | null>(null);
  const [name, setName] = useState("");
  useEffect(() => {
    void bridge?.brandGet?.().then((b) => {
      setBrand(b);
      setName(b.custom ? b.name : "");
    });
  }, [bridge]);
  if (!bridge?.brandGet || brand === null) return null;
  const apply = (b: DesktopBrand): void => {
    setBrand(b);
    setName(b.custom ? b.name : "");
  };
  const save = (): void => {
    const typed = name.trim();
    const current = brand.custom ? brand.name : "";
    if (typed === current) return;
    void bridge.brandSet?.(typed).then(apply);
  };
  return (
    <>
      <Row device label={t("rowAppName")} hint={t("hintAppName")}>
        <TextInput label={t("rowAppName")} value={name} placeholder={brand.name} onChange={setName} onBlur={save} />
      </Row>
      <Row device label={t("rowAppIcon")} hint={t("hintAppIcon")}>
        <span className="s-ctl-inline">
          {brand.iconDataUrl && <img className="s-ctl-iconpreview" src={brand.iconDataUrl} alt="" width={28} height={28} />}
          <button type="button" className="s-ctl-select" onClick={() => void bridge.brandPickIcon?.().then(apply)}>
            {t("appIconChoose")}
          </button>
          {brand.custom && (
            <button type="button" className="s-ctl-select" onClick={() => void bridge.brandClear?.().then(apply)}>
              {t("appBrandReset")}
            </button>
          )}
        </span>
      </Row>
      {brand.launcher !== "none" && (
        <Row device label={t(brand.launcher === "start-menu" ? "rowAppLauncherWin" : "rowAppLauncher")} hint={t("hintAppLauncher")}>
          <button
            type="button"
            className="s-ctl-select"
            onClick={() =>
              void bridge.brandInstall?.().then((r) => {
                if (!r.ok) toast(t("appLauncherFailed"), "error");
                else if (r.note === "png-icon-skipped") toast(t("appLauncherPngIcon"));
                else toast(tf("appLauncherDone", { where: r.where }));
              })
            }
          >
            {t(brand.launcher === "start-menu" ? "appLauncherInstallWin" : "appLauncherInstall")}
          </button>
        </Row>
      )}
    </>
  );
}

/** SOFTWARE UPDATES, on the desktop only — and the row that exists because a
 *  friend's Windows build downloaded a release he had not asked for. Two
 *  positions, not a checkbox: "Tell me" checks quietly and says when a
 *  release exists; "Off" never checks and never reminds. Neither position
 *  downloads anything — that is the policy (electron/updatePolicy.ts), and
 *  the hint says so under the control rather than in a manual nobody opens.
 *  Stored desktop-side, in desktop.json beside the window bounds, because
 *  it is about this INSTALL rather than this browser profile: a second vault
 *  in a second window is the same app, and the same answer. */
function UpdatesRow() {
  const bridge = desktop();
  const [pref, setPref] = useState<DesktopUpdatesPref | null>(null);
  useEffect(() => {
    void bridge?.updatesPrefGet?.().then(setPref);
  }, [bridge]);
  if (!bridge?.updatesPrefGet || pref === null) return null;
  return (
    <Row device label={t("rowUpdates")} hint={t("hintUpdates")}>
      <SegmentedControl
        label={t("rowUpdates")}
        value={pref}
        onChange={(v) => {
          const next: DesktopUpdatesPref = v === "off" ? "off" : "notify";
          setPref(next);
          void bridge.updatesPrefSet?.(next).then(setPref);
        }}
        segments={[
          { value: "notify", label: t("updatesNotify") },
          { value: "off", label: t("updatesOff") },
        ]}
      />
    </Row>
  );
}


