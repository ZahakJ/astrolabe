// A STUDY SESSION, full screen. The desktop's session view, unchanged — the
// audit found it the one part of Orbits that was already good on a phone —
// with the whole glass to itself: no tab bar, no list column on a tablet, and
// no phone top bar over its own breadcrumb, whose "‹ Orbits" is the way out
// (as is Back). Leaving by either lands on the deck it was started from.

import { orbitsSessionOf } from "../../workspace.ts";
import SessionView from "../../orbits/SessionView.tsx";
import "../../styles/orbits.css";

export default function SessionScreen({ tab }: { tab: string; onBack: () => void }) {
  const session = orbitsSessionOf(tab);
  return (
    <div className="s-ph-screen s-ph-session" data-screen="session" data-deck={session?.path ?? ""}>
      <div className="s-ph-scroll s-ph-session__body">{session && <SessionView path={session.path} section={session.section} />}</div>
    </div>
  );
}
