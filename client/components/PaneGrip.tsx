// THE GRIP on a side pane's seam: drag it to resize the pane, drag it off the
// window edge to collapse the pane, double-click it to go back to the default
// width. The collapse buttons and Ctrl/Cmd+Alt+B stay; this is the hand's way
// of doing the same things.
//
// ── IT STRADDLES THE SEAM, AND IT IS A SIBLING OF THE PANES ────────────────
// The strip used to be the pane's own last child, 8px wide, pinned inside the
// pane's inner edge — which put it exactly on the tree's scrollbar and left
// the 1px divider the reader aims at answering to nothing. The pane is
// `overflow: hidden` (that is what makes the collapse a width animation), so a
// strip that reaches past the divider cannot live inside it. It lives in the
// `.s-app` grid instead, positioned off `--sidebar-w`/`--panel-w`, 12px wide
// with the divider down its middle.
//
// ── THE DRAG IS RELATIVE ───────────────────────────────────────────────────
// The pane grows by how far the hand moved, not by where the hand happens to
// be: see `dragWidth` in client/paneWidths.ts.
//
// ── A SCROLL THUMB STILL SCROLLS ───────────────────────────────────────────
// Half the strip lies over the pane, and on a platform with classic (space-
// taking) scrollbars — Windows — that is where the tree's bar is. A press that
// lands on a real bar scrolls that element for the length of the drag instead
// of resizing the pane, so the file list does not resize when the reader meant
// to scroll it. Overlay-scrollbar platforms have no bar in the layout and the
// whole strip resizes, which is what they should do.
//
// Pointer events with capture, so a drag that leaves the strip keeps going.
// While a drag runs the root wears `s-app--pane-drag`, which switches the
// panes' width transitions off (a transition fighting a pointer is a lag) and
// paints a column cursor everywhere.

import { useEffect } from "react";
import { t } from "../i18n.ts";
import {
  PANE_COLLAPSE_AT,
  PANE_REOPEN_AT,
  applyPaneWidths,
  applyPaneWidthsNow,
  clampPane,
  dragWidth,
  layoutPanes,
  onScrollbar,
  paneVar,
  readPaneWidths,
  writePaneWidth,
  type Pane,
  type PaneRoom,
} from "../paneWidths.ts";
import { DRAWER_QUERY, useStore } from "../state.ts";

/** Where the phone drops both panes out of the grid (app.css keeps the same
 *  number; it is DRAWER_QUERY's own first arm). */
const PHONE_QUERY = "(max-width: 700px)";

function collapse(pane: Pane, on: boolean): void {
  const s = useStore.getState();
  if (pane === "sidebar") s.setSidebarCollapsed(on);
  else s.setPanelCollapsed(on);
}

/** The pane element a grip governs. The grip is a sibling now, so it cannot
 *  ask its parent — and a ref threaded through two lazily-loaded surfaces
 *  would be a ref that is null exactly while the chunk is arriving. */
function paneEl(pane: Pane): HTMLElement | null {
  return document.querySelector<HTMLElement>(pane === "sidebar" ? ".s-sidebar" : ".s-panel");
}

/** How much room the panes have, here, now. */
export function paneRoom(): PaneRoom {
  const s = useStore.getState();
  const phone = window.matchMedia(PHONE_QUERY).matches;
  const drawer = window.matchMedia(DRAWER_QUERY).matches;
  return {
    viewport: window.innerWidth,
    sidebarDocked: !s.zen && !phone && !drawer && !s.sidebarCollapsed,
    panelDocked: !s.zen && !phone && !s.panelCollapsed,
  };
}

/** A CLASSIC scrollbar under this point, or null.
 *
 *  Classic means "takes room in the layout", which is also exactly when the
 *  bar is permanently drawn and hit-testable — Windows. An overlay bar takes
 *  no room, comes and goes with the scroll, and must not cost the grip a third
 *  of its strip on the platforms that use them.
 *
 *  `elementsFromPoint` (plural) rather than hiding the grip and asking for the
 *  single top element: the whole stack under the pointer is already the
 *  answer, and it is one call with no style write in the middle of a pointer
 *  handler. The borders are subtracted because `offsetWidth - clientWidth`
 *  counts them too, and `.s-sidebar`'s own 1px separator is not a scrollbar. */
function scrollerUnder(x: number, y: number): HTMLElement | null {
  for (const node of document.elementsFromPoint(x, y)) {
    const el = node as HTMLElement;
    if (el.classList.contains("s-pane-grip")) continue;
    if (el.scrollHeight <= el.clientHeight) continue;
    const cs = getComputedStyle(el);
    const bar = el.offsetWidth - el.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
    if (!(bar > 0)) continue;
    const r = el.getBoundingClientRect();
    const edges = { left: r.left + parseFloat(cs.borderLeftWidth), right: r.right - parseFloat(cs.borderRightWidth) };
    return onScrollbar(x, edges, bar, cs.direction === "rtl") ? el : null;
  }
  return null;
}

export default function PaneGrip({ pane }: { pane: Pane }) {
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    const grip = e.currentTarget;
    const el = paneEl(pane);
    if (!el) return;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);

    // A press on a real scrollbar is a scroll, not a resize.
    const scroller = scrollerUnder(e.clientX, e.clientY);
    if (scroller) {
      const startY = e.clientY;
      const startTop = scroller.scrollTop;
      const ratio = scroller.scrollHeight / scroller.clientHeight;
      const scroll = (ev: PointerEvent): void => {
        scroller.scrollTop = startTop + (ev.clientY - startY) * ratio;
      };
      const stop = (): void => {
        grip.removeEventListener("pointermove", scroll);
        grip.removeEventListener("pointerup", stop);
        grip.removeEventListener("pointercancel", stop);
      };
      grip.addEventListener("pointermove", scroll);
      grip.addEventListener("pointerup", stop);
      grip.addEventListener("pointercancel", stop);
      return;
    }

    const rect = el.getBoundingClientRect();
    const left = rect.left + rect.width / 2 < window.innerWidth / 2;
    const root = document.documentElement;
    // The pane's CONTENT width is the number the property carries (both panes
    // are `border-box` and one separator wide); seeding from the border box
    // instead crept the pane a pixel wider on every grab.
    const startWidth = el.clientWidth;
    const startX = e.clientX;
    let last = startWidth;
    let collapsing = false;
    root.classList.add("s-app--pane-drag");
    const move = (ev: PointerEvent): void => {
      const raw = dragWidth(ev.clientX, startX, startWidth, left);
      collapsing = raw < PANE_COLLAPSE_AT;
      el.classList.toggle("s-pane--leaving", collapsing);
      if (!collapsing) {
        const room = paneRoom();
        const fits = layoutPanes({ ...readPaneWidths(), [pane]: raw }, room, pane);
        last = fits[pane] ?? clampPane(raw);
        root.style.setProperty(paneVar(pane), `${last}px`);
        const other: Pane = pane === "sidebar" ? "panel" : "sidebar";
        const push = fits[other];
        if (push !== undefined) root.style.setProperty(paneVar(other), `${push}px`);
      }
    };
    const up = (): void => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
      root.classList.remove("s-app--pane-drag");
      el.classList.remove("s-pane--leaving");
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
      className={`s-pane-grip s-pane-grip--${pane}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={pane === "sidebar" ? t("paneGripNotes") : t("paneGripPanel")}
      title={pane === "sidebar" ? t("paneGripNotes") : t("paneGripPanel")}
      onPointerDown={onPointerDown}
      onDoubleClick={() => {
        document.documentElement.style.removeProperty(paneVar(pane));
        writePaneWidth(pane, null);
        applyPaneWidths(document.documentElement, paneRoom());
      }}
    />
  );
}

/** THE PANES ANSWER THE WINDOW, NOT ONLY THE HAND.
 *
 *  Called once, from the shell. It applies the stored widths at boot and
 *  re-applies them — clamped against the room that is actually there — on
 *  every resize, on every fold, and when the drawer breakpoint is crossed.
 *  Without the listener a window dragged narrow kept the widths it was given
 *  when it was wide: at 904px a stored {560, 560} left the note 0px, the
 *  panel's header and close button off-screen, and the toolbar drawn over the
 *  sidebar — and it survived a reload, because boot re-applied the same pair.
 *  rAF-throttled, because a frame drag on Windows fires this continuously. */
export function usePaneLayout(): void {
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const panelCollapsed = useStore((s) => s.panelCollapsed);
  const zen = useStore((s) => s.zen);
  useEffect(() => {
    let frame = 0;
    const apply = (): void => {
      frame = 0;
      // WITHOUT THE 0.18s: a width the WINDOW asked for arrives at once. A
      // pane animating toward a moving window edge is the lag this seam is
      // about, with `.s-main` passing through 0px on the way down.
      applyPaneWidthsNow(document.documentElement, paneRoom());
    };
    const schedule = (): void => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    // Boot, and every fold and unfold — which run this effect again through
    // its deps. THROUGH the transition, not around it: a fold is the reader's
    // own gesture and the 0.18s is part of it, and the still-write above
    // forces a style flush that would commit the collapse before the browser
    // ever saw a width to animate from.
    applyPaneWidths(document.documentElement, paneRoom());
    const drawer = window.matchMedia(DRAWER_QUERY);
    const phone = window.matchMedia(PHONE_QUERY);
    window.addEventListener("resize", schedule);
    drawer.addEventListener("change", schedule);
    phone.addEventListener("change", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      drawer.removeEventListener("change", schedule);
      phone.removeEventListener("change", schedule);
    };
  }, [sidebarCollapsed, panelCollapsed, zen]);
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
