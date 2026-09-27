// THE ONE SWITCH FROM A SECTION'S ID TO ITS BODY — drawn by the desktop's
// dialog under its rail and by the phone shell's Settings screen under a top
// bar, so the two can never disagree about which rows a section has, or which
// kind of vault draws it.
//
// The render conditions ARE the index: scripts/settings-index.mjs reads each
// `{tab === "…" && …}` line below, takes the mode from its `pocket` clause
// (`!pocket` = instance-only) and the rows from the file of the component it
// renders — and inside that file, from `<InstanceOnly>`, `<PocketOnly>`,
// `<Advanced>` and `<Part>` (settings/Fold.tsx, settings/Row.tsx). Keep each
// condition on one line with its component, the way it is written here.

import "../../styles/localization.css";
import "../../styles/publicfolders.css";
import "../../styles/librarypaths.css";
import { AboutTab } from "./AboutTab.tsx";
import AppearanceTab from "./AppearanceTab.tsx";
import AskTab from "./AskTab.tsx";
import CollectionsTab from "./CollectionsTab.tsx";
import { useSettings } from "./context.ts";
import LanguageTab from "./LanguageTab.tsx";
import ReadingTab from "./ReadingTab.tsx";
import SiteTab from "./SiteTab.tsx";
import SyncTab from "./SyncTab.tsx";
import WritingTab from "./WritingTab.tsx";

export default function TabBody({ tab }: { tab: string }) {
  const { pocket, loaded } = useSettings();
  return (
    <>
      {tab === "appearance" && <AppearanceTab />}
      {tab === "language" && <LanguageTab />}
      {tab === "writing" && <WritingTab />}
      {tab === "reading" && <ReadingTab />}
      {tab === "site" && <SiteTab />}
      {tab === "collections" && !pocket && <CollectionsTab />}
      {/* One body for both kinds of vault: an instance's git rows and a
          pocket's repository rows are `<InstanceOnly>`/`<PocketOnly>` inside
          it, around the versions and travel rows both keep. */}
      {tab === "sync" && <SyncTab />}
      {tab === "ask" && !pocket && <AskTab />}
      {tab === "about" && <AboutTab about={loaded.about ?? null} />}
    </>
  );
}
