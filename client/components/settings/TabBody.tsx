// THE ONE SWITCH FROM A PAGE'S ID TO ITS BODY — drawn by the desktop's dialog
// beside its rail and by the phone shell's Settings screen under a top bar, so
// the two can never disagree about which rows a page has, or which kind of
// vault draws it.
//
// The render conditions ARE the index: scripts/settings-index.mjs reads each
// `{tab === "…" && …}` line below, takes the mode from its `pocket` clause
// (`!pocket` = instance-only) and the rows from the file of the component it
// renders — and inside that file, from `<InstanceOnly>`, `<PocketOnly>`,
// `<Advanced>` and `<Part>` (settings/Fold.tsx, settings/Row.tsx). Keep each
// condition on one line with its component, the way it is written here.
//
// A page whose rows are ALL kept in this browser (`device` in tabs.ts) says so
// once, above its first row, and its rows wear no mark of their own
// (contracts/settings-design.md, "This device, said once").

import "../../styles/localization.css";
import "../../styles/publicfolders.css";
import "../../styles/librarypaths.css";
import { t } from "../../i18n.ts";
import { AboutTab } from "./AboutTab.tsx";
import AppearanceTab from "./AppearanceTab.tsx";
import AskTab from "./AskTab.tsx";
import CollectionsTab from "./CollectionsTab.tsx";
import { useSettings } from "./context.ts";
import ConversationTab from "./ConversationTab.tsx";
import DatesTab from "./DatesTab.tsx";
import DeviceTab from "./DeviceTab.tsx";
import LanguageTab from "./LanguageTab.tsx";
import LibraryTab from "./LibraryTab.tsx";
import NotesTab from "./NotesTab.tsx";
import PublishingTab from "./PublishingTab.tsx";
import ReadingTab from "./ReadingTab.tsx";
import { DevicePage } from "./Row.tsx";
import SiteTab from "./SiteTab.tsx";
import SpeechTab from "./SpeechTab.tsx";
import SyncTab from "./SyncTab.tsx";
import { devicePage } from "./tabs.ts";
import TypeTab from "./TypeTab.tsx";
import VersionsTab from "./VersionsTab.tsx";
import WritingTab from "./WritingTab.tsx";

export default function TabBody({ tab }: { tab: string }) {
  const { pocket, loaded } = useSettings();
  const device = devicePage(tab);
  return (
    <DevicePage.Provider value={device}>
      {device && <p className="s-smodal__devnote">{t("settingsDevicePage")}</p>}
      {tab === "appearance" && <AppearanceTab />}
      {tab === "type" && <TypeTab />}
      {tab === "language" && <LanguageTab />}
      {tab === "dates" && <DatesTab />}
      {tab === "writing" && <WritingTab />}
      {tab === "notes" && <NotesTab />}
      {tab === "reading" && <ReadingTab />}
      {tab === "speech" && <SpeechTab />}
      {tab === "site" && <SiteTab />}
      {tab === "publishing" && !pocket && <PublishingTab />}
      {tab === "conversation" && !pocket && <ConversationTab />}
      {tab === "collections" && !pocket && <CollectionsTab />}
      {tab === "library" && !pocket && <LibraryTab />}
      {/* One body for both kinds of vault: an instance's git rows and a
          pocket's repository rows are `<InstanceOnly>`/`<PocketOnly>` inside
          it. */}
      {tab === "sync" && <SyncTab />}
      {tab === "versions" && <VersionsTab />}
      {tab === "ask" && !pocket && <AskTab />}
      {tab === "device" && <DeviceTab />}
      {tab === "about" && <AboutTab about={loaded.about ?? null} />}
    </DevicePage.Provider>
  );
}
