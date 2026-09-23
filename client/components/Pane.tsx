// One pane: a tab bar and the surface its active tab asks for.
//
// It draws exactly what `App.tsx`'s `.s-view` drew before panes existed —
// editor, reading view, graph, or an empty state — because the surfaces did not
// change; only how many of them can be on screen at once did. `surfaceOf()` in
// client/workspace.ts is what decides, and it is TOTAL over any pane state, so
// there is no invariant to police here: a `.pdf` tab renders the reader
// whatever the mode says, which is what makes Ctrl/Cmd+E a harmless no-op on a
// book rather than a mode the pane cannot honour.
//
// SOLO IS NOT A SPECIAL CASE OF THE GRID — it is the shell exactly as it was.
// A reader who never splits gets the same DOM they had before, so every
// `:has()` rule, every zen selector and every `.s-view > .s-editor` in the
// stylesheet keeps matching. The grid arrives only once there is something to
// arrange.

import { Suspense, type ReactNode } from "react";
import { lazySurface } from "../lazySurface.tsx";
import { useStore } from "../state.ts";
import { paneAt } from "../workspace.ts";
import Tabs from "./Tabs.tsx";
import PaneSurface from "./PaneSurface.tsx";
import { useTabDrag } from "../dragTab.ts";

// The drop zones exist only between dragstart and dragend, so their code has
// no business in first paint — the chunk loads when the first tab is LIFTED,
// and a drag is hundreds of ms long where the fetch is a handful. This is
// what kept the entry inside its check-bundle budget.
const PaneDropZones = lazySurface(() => import("./PaneDropZones.tsx"));

export default function Pane({
  id,
  solo = false,
  children,
}: {
  id: string;
  solo?: boolean;
  children?: ReactNode;
}) {
  const workspace = useStore((s) => s.workspace);
  const focusPane = useStore((s) => s.focusPane);
  const dragging = useTabDrag() !== null;
  const pane = paneAt(workspace, id);
  if (pane === null) return null;
  const focused = workspace.focus === id;
  // The surface itself — editor, reading view, book, graph… — is
  // PaneSurface's (shared with the phone shell); a pane adds its chrome.
  const body = <PaneSurface id={id}>{children}</PaneSurface>;

  if (solo) {
    return (
      <section className="s-view" data-pane={id}>
        {body}
        {/* The solo pane raises drop zones too: dragging one of two tabs to
            the edge is exactly how the FIRST split is made. */}
        {dragging && (
          <Suspense fallback={null}>
            <PaneDropZones paneId={id} />
          </Suspense>
        )}
      </section>
    );
  }

  return (
    <section
      className={`s-view s-pane${focused ? " s-pane--focused" : ""}`}
      data-pane={id}
      // Clicking anywhere in a pane focuses it — the same meaning a click on
      // its tab has. Capture, so it lands before the editor takes the caret.
      onMouseDownCapture={() => {
        if (!focused) focusPane(id);
      }}
    >
      <Tabs paneId={id} />
      {body}
      {dragging && (
        <Suspense fallback={null}>
          <PaneDropZones paneId={id} />
        </Suspense>
      )}
    </section>
  );
}
