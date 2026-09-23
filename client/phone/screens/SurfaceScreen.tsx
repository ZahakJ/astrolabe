// THE LEGACY SCREEN — Round 1's frame for the surfaces that do not have a
// phone shape of their own yet: Orbits, Sigils, the Media page, the graph,
// the weekly review, the book shelf and its readers, a drawing.
//
// Each of them was already a workspace TAB on the desktop, drawn by the
// pane's surface switch (components/PaneSurface.tsx); here the same switch
// draws it full screen under a phone top bar — no tab strip, no status bar,
// no edit/read pill on a page where it means nothing (the audit found one on
// Orbits, Sigils and Calendar). Their own phone variants (list rows and a
// detail screen for Orbits and Sigils, the book reader's own chrome) are
// Round 2; this frame is what lets them be reached and left like screens.

import PaneSurface from "../../components/PaneSurface.tsx";
import { useStore } from "../../state.ts";
import { activeTabOf, paneAt, surfaceOf } from "../../workspace.ts";
import { surfaceTitle } from "../titles.ts";
import TopBar from "../TopBar.tsx";

export default function SurfaceScreen({ tab, onBack }: { tab: string; onBack: () => void }) {
  useStore((s) => s.language);
  const paneId = useStore((s) => s.workspace.focus);
  const here = useStore((s) => {
    const pane = paneAt(s.workspace, s.workspace.focus);
    if (pane === null) return false;
    if (tab === "~library") return surfaceOf(pane) === "library";
    return activeTabOf(pane)?.path === tab && surfaceOf(pane) !== "library";
  });
  const { title, user } = surfaceTitle(tab);
  return (
    <div className="s-ph-screen s-ph-legacy" data-screen="surface" data-surface={tab}>
      <TopBar title={title} userTitle={user} onBack={onBack} />
      <section className="s-view s-ph-view s-ph-legacy__body" data-pane={paneId}>
        {here ? <PaneSurface id={paneId} /> : <div className="s-ph-loading" aria-hidden="true" />}
      </section>
    </div>
  );
}
