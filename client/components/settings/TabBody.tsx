// THE ONE SWITCH FROM A TAB'S ID TO ITS BODY — drawn by the desktop's dialog
// under its rail and by the phone shell's Settings screen under a top bar, so
// the two can never disagree about which rows a tab has, or which kind of
// vault draws it.
//
// The render conditions ARE the index: scripts/settings-index.mjs reads each
// `{tab === "…" && …}` line below, takes the mode from its `pocket` clause
// (`!pocket` = instance-only, `pocket` = pocket-only) and the rows from the
// file of the component it renders. Keep each condition on one line with its
// component, the way it is written here.

import "../../styles/localization.css";
import "../../styles/publicfolders.css";
import "../../styles/librarypaths.css";
import { AboutTab } from "./AboutTab.tsx";
import AskTab from "./AskTab.tsx";
import CollectionsTab from "./CollectionsTab.tsx";
import { useSettings } from "./context.ts";
import DeviceTab from "./DeviceTab.tsx";
import LanguageTab from "./LanguageTab.tsx";
import { PocketSyncPanel } from "./PocketSync.tsx";
import PublishingTab from "./PublishingTab.tsx";
import SiteTab from "./SiteTab.tsx";
import SyncTab from "./SyncTab.tsx";
import VaultTab from "./VaultTab.tsx";

export default function TabBody({ tab }: { tab: string }) {
  const { pocket, loaded } = useSettings();
  return (
    <>
      {/* "This device" is its own module (DeviceTab.tsx) and the FIRST tab,
          because it is the one tab the Save button does not speak for. */}
      {tab === "device" && <DeviceTab />}
      {tab === "site" && <SiteTab />}
      {tab === "language" && <LanguageTab />}
      {tab === "publishing" && !pocket && <PublishingTab />}
      {tab === "collections" && !pocket && <CollectionsTab />}
      {tab === "vault" && <VaultTab />}
      {tab === "sync" && !pocket && <SyncTab />}
      {/* THE SAME TAB, FOR A VAULT THAT IS ITSELF THE REPOSITORY: the
          repository it opened, the line the shell paints over the vault, a
          Sync now, the `(phone)` pairs still standing, and the door back to
          the connection screen. */}
      {tab === "sync" && pocket && <section data-section="sync"><PocketSyncPanel /></section>}
      {tab === "ask" && !pocket && <AskTab />}
      {tab === "about" && <AboutTab about={loaded.about ?? null} />}
    </>
  );
}
