// VERSIONS & TRAVEL — the net under the autosave, and what the vault carries to
// the next machine. A page body (see ./TabBody.tsx), split from Backup & sync
// in the second settings pass: both rows answer "where are copies of my work
// kept", and neither needs git.
//
//   · Note versions: a copy of what a note said before each save, in the data
//     directory. A pocket vault's history is its repository, so there it is a
//     locked fact.
//   · What travels: what the vault's .astrolabe/ folder carries for the next
//     machine (server/configMirror.ts) — independent of git sync — and
//     whether THIS browser's preferences ride along.

import { useSettings } from "./context.ts";
import { t } from "../../i18n.ts";
import { SegmentedControl, Toggle } from "../controls/Fields.tsx";
import { prefsSyncEnabled, setPrefsSyncEnabled } from "../../prefsSync.ts";
import { useEventPref } from "./devicePrefs.ts";
import { InstanceOnly } from "./Fold.tsx";
import { Row } from "./Row.tsx";
import { TravelRow } from "./TravelRow.tsx";

export default function VersionsTab() {
  const { pocket, form, field, onOffSegments, eff, inh } = useSettings();
  const prefsSync = useEventPref("astrolabe:prefs-sync", prefsSyncEnabled);
  return (
    <section data-section="versions">
      {pocket && <p className="s-smodal__offnote">{t("pocketVersionsNotice")}</p>}
      <Row
        locked={pocket}
        label={t("rowNoteVersions")}
        hint={t("hintNoteVersions")}
        more={t("moreNoteVersions")}
        env={{ name: "NOTE_VERSIONS", value: eff.noteVersions ? "on" : "off", inherits: form.noteVersions === "" }}
      >
        <SegmentedControl label={t("rowNoteVersions")} segments={onOffSegments(inh.noteVersions)} {...field("noteVersions")} />
      </Row>
      <InstanceOnly>
        <TravelRow />
      </InstanceOnly>
      <Row device label={t("rowPrefsSync")} hint={t("hintPrefsSync")}>
        <Toggle label={t("rowPrefsSync")} onLabel={t("on")} offLabel={t("off")} value={prefsSync} onChange={setPrefsSyncEnabled} />
      </Row>
    </section>
  );
}
