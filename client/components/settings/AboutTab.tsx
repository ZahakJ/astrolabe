// ABOUT — this app and this instance: what's new, and on the desktop the
// app's own name, icon, launcher and updates; then the version, where it
// keeps its files, how much is in it, and where its settings are documented.
// `check-settings` reads DOC_TOPICS out of this file and opens every file and
// anchor it names.
//
// THIS APP (the settings purge). The desktop's rows and the what's-new switch
// were the last four rows on "This device" once every other row there had
// gone to the section its question belongs to — a tab of one row in a browser.
// They are questions about the APP rather than about the notes, which is what
// About already answered, so they open it.

import { useEffect, useState } from "react";
import type { AboutInfo } from "../../../shared/types.ts";
import { localeNum, t, tf, type I18nKey } from "../../i18n.ts";
import { desktop, type DesktopBrand, type DesktopUpdatesPref } from "../../desktop/bridge.ts";
import { toast } from "../../toast.ts";
import { WHATSNEW_EVENT, setWhatsNewEnabled, whatsNewEnabled } from "../../whatsnew/door.ts";
import { SegmentedControl, TextInput, Toggle } from "../controls/Fields.tsx";
import { useEventPref } from "./devicePrefs.ts";
import { Row } from "./Row.tsx";

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



/** The group of rows about the APP, under its heading. The desktop's rows
 *  are drawn only where the bridge offers them (a browser has no tray to
 *  rename); the what's-new switch is every device's. */
function AppRows() {
  const whatsNew = useEventPref(WHATSNEW_EVENT, whatsNewEnabled);
  return (
    <>
      <div className="s-smodal__sub">{t("groupThisApp")}</div>
      <Row device label={t("rowWhatsNew")} hint={t("hintWhatsNew")}>
        <Toggle value={whatsNew} onChange={setWhatsNewEnabled} label={t("rowWhatsNew")} onLabel={t("on")} offLabel={t("off")} />
      </Row>
      <AppIdentityRows />
      <UpdatesRow />
    </>
  );
}

/** The docs pages this panel's own settings are documented in. Named rather
 *  than linked: the docs ship in the repository, not on the running site, and
 *  a link that 404s into the SPA fallback is worse than a name a reader can
 *  search for. Every file and anchor here is a REAL one — `check-settings`
 *  opens each file and slugs its headings the way build-docs does — because
 *  the list once named seven README anchors that had moved to docs/ years
 *  earlier, and a citation that resolves to nothing is worse than none. */
export const DOC_TOPICS: { key: I18nKey; file: string; anchor?: string }[] = [
  { key: "docSiteSettings", file: "docs/configuration.md", anchor: "the-settings-panel" },
  { key: "docTheming", file: "docs/theming.md" },
  { key: "docTypography", file: "docs/typography.md" },
  { key: "docArabic", file: "docs/arabic-and-rtl.md" },
  { key: "docBlogMode", file: "docs/blog-mode.md" },
  { key: "docComments", file: "docs/publishing.md", anchor: "comments" },
  { key: "docSync", file: "docs/backup-and-sync.md" },
];

export function AboutTab({ about }: { about: AboutInfo | null }) {
  if (about === null) return <div className="s-bmodal__empty">{t("loading")}</div>;
  const facts: { label: string; value: string; path?: boolean }[] = [
    { label: t("aboutVersion"), value: `Astrolabe ${about.version}` },
    { label: t("aboutRuntime"), value: `Node ${about.node}` },
    { label: t("aboutVault"), value: about.vaultPath, path: true },
    { label: t("aboutData"), value: about.dataPath, path: true },
    // Where the panel's own answers are kept. The title bar used to say
    // "— settings.json", which named the file without saying where it was;
    // this says both, beside the other absolute paths, and only to an admin
    // (GET /api/settings 404s to everyone else).
    { label: t("aboutSettingsFile"), value: about.settingsPath, path: true },
    { label: t("aboutFontsDir"), value: about.customFontsPath, path: true },
  ];
  const counts: { label: string; value: string }[] = [
    { label: t("aboutNotes"), value: localeNum(about.notes) },
    { label: t("aboutPublished"), value: localeNum(about.published) },
    { label: t("aboutAttachments"), value: localeNum(about.attachments) },
    { label: t("aboutTags"), value: localeNum(about.tags) },
  ];
  return (
    <section data-section="about">
      <AppRows />
      <div className="s-smodal__sub">{t("groupThisInstance")}</div>
      <dl className="s-about">
        {facts.map((f) => (
          <div className="s-about__row" key={f.label}>
            <dt className="s-about__key">{f.label}</dt>
            {/* Absolute paths are LTR machine strings; in an Arabic panel they
                keep their own direction and their own start edge, or a
                "/home/…" reorders around its slashes. */}
            <dd className={`s-about__val${f.path ? " s-about__val--path" : ""}`} dir="ltr">
              {f.value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="s-smodal__note">{t("aboutSettingsNote")}</p>

      <div className="s-smodal__sub">{t("aboutContents")}</div>
      <div className="s-about__counts">
        {counts.map((c) => (
          <div className="s-about__count" key={c.label}>
            <span className="s-about__countnum">{c.value}</span>
            <span className="s-about__countlabel">{c.label}</span>
          </div>
        ))}
      </div>

      <div className="s-smodal__sub">{t("aboutDocs")}</div>
      <p className="s-smodal__note">{t("aboutDocsNote")}</p>
      <ul className="s-about__docs">
        {DOC_TOPICS.map((d) => (
          <li key={d.key} className="s-about__doc">
            <span className="s-about__docname">{t(d.key)}</span>
            <code className="s-about__docanchor" dir="ltr">
              {d.file}
              {d.anchor ? `#${d.anchor}` : ""}
            </code>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------
