// ONE SETTINGS SECTION, as a screen: the same tab body the desktop dialog
// draws (components/settings/TabBody.tsx, read from the same form hook), under
// a top bar, with its OWN Save.
//
// THE SAVE/DISCARD RULE. The dialog has one Save for every server tab and asks
// before its ✕ throws edits away. A phone section is a screen you leave by
// Back, so the rule moves with it: while a section holds edits a bar rises
// from the bottom edge — what is pending, Discard, Save — and every way off
// the screen (the ‹, the OS back gesture, a tab, a row that opens something
// else) is refused by the navigation (nav.ts `canLeave`) and asked about
// instead: "Close without saving?", Discard or stay. The edits are never
// unmounted under the question — a Back that the browser had already popped
// is put straight back. `This device` commits every row on tap, as it does on
// the desktop, so it has no bar and nothing to guard.

import { useEffect, useRef } from "react";
import { ImagePicker } from "../../components/settings/ImageField.tsx";
import { loadedCtx, SettingsContext } from "../../components/settings/context.ts";
import { SETTINGS_INDEX } from "../../components/settings/settingsIndex.ts";
import TabBody from "../../components/settings/TabBody.tsx";
import { revealRow, tabIntro } from "../../components/settings/tabs.ts";
import { useSettingsForm } from "../../components/settings/useSettingsForm.ts";
import { t } from "../../i18n.ts";
import { useStore } from "../../state.ts";
import { usePhone } from "../context.ts";
import { screenKey } from "../nav.ts";
import { settingsTitle } from "../titles.ts";
import RoutedLayer from "../RoutedLayer.tsx";
import TopBar from "../TopBar.tsx";

export default function SettingsSectionScreen({ section, onBack }: { section: string; onBack: () => void }) {
  const phone = usePhone();
  const focus = useStore((s) => s.settingsFocus);
  useStore((s) => s.language);
  const settings = useSettingsForm();
  const { pocket, form, loadError, saving, patch, dirty, valid, save, discard, picker, setPicker, setForm, dirtyRef } = settings;
  const ctx = loadedCtx(settings);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const device = section === "device";

  // The guard: while there are edits, every way off this screen asks first.
  const key = screenKey({ kind: "settings", section });
  const discardRef = useRef(discard);
  discardRef.current = discard;
  useEffect(() => {
    if (device) return;
    phone.setGuard(key, { dirty: () => dirtyRef.current, discard: () => discardRef.current() });
    return () => phone.setGuard(key, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, device]);

  // A row asked for by name (a search hit, `openSettingsAt`): mark it, once
  // the rows exist.
  useEffect(() => {
    if (focus === null || form === null) return;
    const entry = SETTINGS_INDEX.find((row) => row.label === focus);
    if (entry === undefined || entry.tab !== section) return;
    useStore.setState({ settingsFocus: null });
    revealRow(bodyRef.current, t(entry.label));
  }, [focus, form, section]);

  const status = saving ? t(patch.fonts ? "fontFetching" : "saving") : dirty ? t(valid ? "unsavedChanges" : "fixMarkedFields") : "";

  return (
    <div className={`s-ph-screen s-ph-settings s-ph-settings--section${dirty && !device ? " s-ph-settings--dirty" : ""}`} data-screen="settings-section" data-section={section}>
      <TopBar title={settingsTitle(section)} onBack={onBack} onTitle={() => bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" })} />
      <div className="s-ph-scroll s-ph-settings__body" ref={bodyRef} data-popbounds>
        {loadError && <p className="s-ph-empty">{loadError}</p>}
        {!loadError && ctx === null && <p className="s-ph-empty">{t("loading")}</p>}
        {ctx && (
          <SettingsContext.Provider value={ctx}>
            <p className="s-smodal__note s-ph-settings__intro">{t(tabIntro(section, pocket))}</p>
            <TabBody tab={section} />
          </SettingsContext.Provider>
        )}
      </div>
      {!device && (
        // Always in the tree, slid out of view while there is nothing to
        // save: rising is a transform, and the status line inside it is the
        // one spoken status of the form (role=status), as the dialog's is.
        <div className="s-ph-savebar" aria-hidden={dirty || saving ? undefined : true}>
          <span className="s-ph-savebar__status" role="status">
            {status}
          </span>
          <button type="button" className="s-ph-btn s-ph-btn--quiet" onClick={discard} disabled={!dirty || saving} tabIndex={dirty ? undefined : -1}>
            {t("discardChanges")}
          </button>
          <button type="button" className="s-ph-btn s-ph-btn--accent" onClick={save} disabled={!dirty || !valid || saving} tabIndex={dirty ? undefined : -1} data-action="save">
            {t("save")}
          </button>
        </div>
      )}
      {picker && (
        // The vault's image picker, with an entry of its own: Back closes the
        // picker, not the section under it.
        <RoutedLayer id="image-picker" onGone={() => setPicker(null)}>
          <ImagePicker
            title={t(picker === "favicon" ? "faviconImage" : picker === "logo" ? "logoImage" : "rowHomeBanner")}
            onPick={(path) => {
              setForm((f) => (f ? { ...f, [picker]: path } : f));
              setPicker(null);
            }}
            onClose={() => setPicker(null)}
          />
        </RoutedLayer>
      )}
    </div>
  );
}
