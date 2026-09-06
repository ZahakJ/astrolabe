// THE GRIP on a side pane's inner edge: drag it to resize the pane, drag it
// off the window edge to collapse the pane, double-click it to go back to
// the default width. The collapse buttons and Ctrl/Cmd+B stay; this is the
// hand's way of doing the same things.
//
// Pointer events with capture, so a drag that leaves the strip keeps going.
// While a drag runs the root wears `s-app--pane-drag`, which switches the
// panes' width transitions off (a transition fighting a pointer is a lag)
// and paints a column cursor everywhere. The width lands on the root as the
// pane's own custom property (`--sidebar-w`, `--panel-w`), which every rule
// in app.css already reads, and is remembered per browser
// (client/paneWidths.ts).

import { useEffect, useRef } from "react";
import { t } from "../i18n.ts";
import {
  PANE_COLLAPSE_AT,
  PANE_REOPEN_AT,
  applyPaneWidths,
  clampPane,
  dragWidth,
  paneVar,
  writePaneWidth,
  type Pane,
} from "../paneWidths.ts";
import { useStore } from "../state.ts";

let applied = false;

function collapse(pane: Pane, on: boolean): void {
  const s = useStore.getState();
  if (pane === "sidebar") s.setSidebarCollapsed(on);
  else s.setPanelCollapsed(on);
}

export default function PaneGrip({ pane }: { pane: Pane }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (applied) return;
    applied = true;
    applyPaneWidths(document.documentElement);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    const grip = ref.current;
    const paneEl = grip?.parentElement;
    if (!grip || !paneEl) return;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const rect = paneEl.getBoundingClientRect();
    const left = rect.left + rect.width / 2 < window.innerWidth / 2;
    const root = document.documentElement;
    const startWidth = rect.width;
    let last = startWidth;
    let collapsing = false;
    root.classList.add("s-app--pane-drag");
    const move = (ev: PointerEvent): void => {
      const raw = dragWidth(ev.clientX, rect, left);
      collapsing = raw < PANE_COLLAPSE_AT;
      paneEl.classList.toggle("s-pane--leaving", collapsing);
      if (!collapsing) {
        last = clampPane(raw);
        root.style.setProperty(paneVar(pane), `${last}px`);
      }
    };
    const up = (): void => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
      root.classList.remove("s-app--pane-drag");
      paneEl.classList.remove("s-pane--leaving");
      if (collapsing) {
        // Off the edge: the pane closes, and reopens at the width it had
        // before the drag rather than the sliver it was dragged to.
        root.style.setProperty(paneVar(pane), `${clampPane(startWidth)}px`);
        collapse(pane, true);
      } else {
        writePaneWidth(pane, last);
      }
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
  };

  return (
    <div
      ref={ref}
      className="s-pane-grip"
      role="separator"
      aria-orientation="vertical"
      aria-label={pane === "sidebar" ? t("paneGripNotes") : t("paneGripPanel")}
      title={pane === "sidebar" ? t("paneGripNotes") : t("paneGripPanel")}
      onPointerDown={onPointerDown}
      onDoubleClick={() => {
        document.documentElement.style.removeProperty(paneVar(pane));
        writePaneWidth(pane, null);
      }}
    />
  );
}

/** Pointer handlers for a collapsed pane's reopen handle: a drag inward of
 *  `PANE_REOPEN_AT` pixels reopens it. A click still reopens it too, through
 *  the button's own onClick — this only adds the gesture. */
export function reopenDragProps(pane: Pane): {
  onPointerDown(e: React.PointerEvent<HTMLButtonElement>): void;
} {
  return {
    onPointerDown(e) {
      if (e.button !== 0) return;
      const el = e.currentTarget;
      const startX = e.clientX;
      const left = el.getBoundingClientRect().left < window.innerWidth / 2;
      const move = (ev: PointerEvent): void => {
        const inward = left ? ev.clientX - startX : startX - ev.clientX;
        if (inward >= PANE_REOPEN_AT) {
          done();
          collapse(pane, false);
        }
      };
      const done = (): void => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", done);
        el.removeEventListener("pointercancel", done);
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          // never captured
        }
      };
      el.setPointerCapture(e.pointerId);
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", done);
      el.addEventListener("pointercancel", done);
    },
  };
}
