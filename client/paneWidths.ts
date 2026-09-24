// The two side panes' widths, as the reader drags them.
//
// PER BROWSER, like the collapse flags: how wide you like your tree is a
// habit of the screen you are on. The pure half lives here (clamping, the
// collapse threshold, the stored shape) so it is tested; the drag itself is
// client/components/PaneGrip.tsx.

export type Pane = "sidebar" | "panel";

export const PANE_MIN = 168;
export const PANE_MAX = 560;
/** Dragged narrower than this, a pane is being pushed off its edge: on
 *  release it collapses rather than sitting at a width nothing fits in. */
export const PANE_COLLAPSE_AT = 112;
/** How far a collapsed pane's reopen handle must be dragged inward to reopen. */
export const PANE_REOPEN_AT = 40;

/** THE GRIP STRADDLES THE SEAM. The strip is 12px wide with the pane's own
 *  1px divider down its middle, so the pixel the eye aims at — the hairline
 *  between the pane and the note — is the pixel that resizes. It used to be
 *  8px sitting ENTIRELY inside the pane, which put it on the tree's scrollbar
 *  and left the divider itself (and everything past it) answering to nothing:
 *  `elementFromPoint` at the seam returned the `<aside>`, cursor `auto`. That
 *  is the "you have to hunt for the exact spot" half of the Windows report. */
export const GRIP_HIT = 12;
/** The narrowest the note's own column may be squeezed to by the panes. Below
 *  this the editor is a ribbon and the panel's header and close button are
 *  off-screen — which persisted, because the stored widths were re-applied at
 *  boot with nothing to clamp them against. */
export const MAIN_MIN = 320;

export const PANE_WIDTHS_KEY = "astrolabe.paneWidths";

export interface PaneWidths {
  sidebar?: number;
  panel?: number;
}

export function clampPane(width: number): number {
  return Math.round(Math.min(PANE_MAX, Math.max(PANE_MIN, width)));
}

/** The width a drag asks for.
 *
 *  RELATIVE, and that is the whole point: the pane grows by exactly as far as
 *  the hand moved, from wherever on the strip the hand took hold. The old form
 *  was absolute (`pointerX - rect.left`), so the pane jumped to the pointer's
 *  own offset the instant the pointer moved a single pixel — grab the strip at
 *  its inner edge and the pane snapped up to 6px narrower before it started
 *  tracking. `left` says which edge the pane stands on: on the trailing side
 *  the pane grows as the pointer moves back toward the start. */
export function dragWidth(pointerX: number, startX: number, startWidth: number, left: boolean): number {
  return startWidth + (left ? pointerX - startX : startX - pointerX);
}

/** IS THIS POINT ON A SCROLLBAR?
 *
 *  Half the grip's strip lies over the pane, and on a platform with CLASSIC
 *  (space-taking) scrollbars — Windows — that is where the tree's bar is. A
 *  press there is a scroll, not a resize: "when I grab the divider the file
 *  list scrolls instead" was the same complaint read from the other side, and
 *  before the strip straddled the seam the grip WAS the bar's last 8px.
 *
 *  `bar` is the scroller's own gutter width with its borders taken out, and
 *  it is 0 on every overlay-scrollbar platform — those have no bar in the
 *  layout to be in the way of, and must not cost the grip a third of its
 *  strip. `rtl` because a vertical bar sits on the scroller's INLINE-END edge,
 *  which is its left in Arabic. */
export function onScrollbar(x: number, edges: { left: number; right: number }, bar: number, rtl: boolean): boolean {
  if (!(bar > 0)) return false;
  const from = rtl ? edges.left : edges.right - bar;
  return x >= from && x <= from + bar;
}

export interface PaneRoom {
  /** The viewport's width in CSS px. */
  viewport: number;
  /** Whether each pane occupies a grid column at all: a collapsed pane, a
   *  sidebar that is a drawer, and zen all occupy none. */
  sidebarDocked: boolean;
  panelDocked: boolean;
}

/** WHAT THE PANES MAY ACTUALLY OCCUPY, given the window they are in.
 *
 *  `clampPane` alone knows only 168..560, which is a statement about a pane
 *  and not about a screen: two 560px panes on a 904px laptop leave the note
 *  nothing, and the stored pair was re-applied verbatim at every boot. This is
 *  the one place that answers "how wide may these two be, here" — called at
 *  boot, on every drag frame and on every window resize, so the answer cannot
 *  drift between them.
 *
 *  The pane being dragged keeps what it asked for wherever there is room; the
 *  shortfall comes out of the OTHER pane first (down to PANE_MIN), and only
 *  then out of the dragged one. When even two minimum panes plus MAIN_MIN do
 *  not fit, the trailing pane gives up its column — the caller collapses it
 *  through the store's own setter, which is the path that leaves a door. */
export function layoutPanes(want: PaneWidths, room: PaneRoom, dragging?: Pane): PaneWidths {
  const out: PaneWidths = {};
  const sidebar = room.sidebarDocked ? clampPane(want.sidebar ?? DEFAULT_SIDEBAR) : 0;
  const panel = room.panelDocked ? clampPane(want.panel ?? DEFAULT_PANEL) : 0;
  if (room.sidebarDocked) out.sidebar = sidebar;
  if (room.panelDocked) out.panel = panel;
  // Each docked pane also costs its own 1px separator.
  const separators = (room.sidebarDocked ? 1 : 0) + (room.panelDocked ? 1 : 0);
  let over = sidebar + panel + separators + MAIN_MIN - room.viewport;
  if (over <= 0) return out;

  // The pane that is NOT under the hand gives first.
  const order: Pane[] = dragging === "sidebar" ? ["panel", "sidebar"] : ["sidebar", "panel"];
  for (const pane of order) {
    if (over <= 0) break;
    const have = out[pane];
    if (have === undefined) continue;
    const give = Math.min(over, have - PANE_MIN);
    if (give <= 0) continue;
    out[pane] = have - give;
    over -= give;
  }
  return out;
}

/** The widths a pane opens at when nothing is stored — the stylesheet's own
 *  defaults, repeated here because the clamp above has to have a number to
 *  work from and `getComputedStyle` on an unregistered custom property hands
 *  back the `clamp(...)` text rather than a length. */
export const DEFAULT_SIDEBAR = 292;
export const DEFAULT_PANEL = 300;

export function parsePaneWidths(raw: string | null): PaneWidths {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const out: PaneWidths = {};
    for (const key of ["sidebar", "panel"] as const) {
      const n = v[key];
      if (typeof n === "number" && Number.isFinite(n)) out[key] = clampPane(n);
    }
    return out;
  } catch {
    return {};
  }
}

export function readPaneWidths(): PaneWidths {
  try {
    return parsePaneWidths(localStorage.getItem(PANE_WIDTHS_KEY));
  } catch {
    return {};
  }
}

export function writePaneWidth(pane: Pane, width: number | null): void {
  try {
    const next = readPaneWidths();
    if (width === null) delete next[pane];
    else next[pane] = clampPane(width);
    localStorage.setItem(PANE_WIDTHS_KEY, JSON.stringify(next));
  } catch {
    // storage full or unavailable — the width lasts the session
  }
}

/** The CSS custom property each pane reads its width from. */
export function paneVar(pane: Pane): string {
  return pane === "sidebar" ? "--sidebar-w" : "--panel-w";
}

/** What the root should carry for each pane: a number of px, or null for
 *  "say nothing and let the stylesheet decide".
 *
 *  Saying nothing is not the same as saying the default. `--sidebar-w`'s own
 *  value is `clamp(224px, calc(100vw - 776px), 292px)` — the rule that hands
 *  the 1000–1068 band its surplus to the reading column — and an inline
 *  `292px` would overwrite it at exactly the widths it was written for. So the
 *  property is written only when there is something to say: a width the reader
 *  dragged, or a width the window is too narrow to grant. */
export function paneStyle(stored: PaneWidths, room: PaneRoom): { sidebar: number | null; panel: number | null } {
  const fits = layoutPanes(stored, room);
  const pick = (pane: Pane, fallback: number): number | null => {
    const n = fits[pane];
    if (n === undefined) return null;
    if (stored[pane] !== undefined) return n;
    return n < fallback ? n : null;
  };
  return { sidebar: pick("sidebar", DEFAULT_SIDEBAR), panel: pick("panel", DEFAULT_PANEL) };
}

/** Put the stored widths on the root, CLAMPED TO THE ROOM THEY ARE IN.
 *
 *  What is STORED stays what the reader dragged — "how wide you like your
 *  tree" is a habit, and a narrow window is not a reason to forget it. What is
 *  APPLIED is what fits. Called at the first grip's mount and again on every
 *  window resize, so a window dragged narrow re-clamps without a reload and a
 *  window dragged wide again gives the pane back. */
export function applyPaneWidths(root: HTMLElement, room: PaneRoom): void {
  const style = paneStyle(readPaneWidths(), room);
  for (const pane of ["sidebar", "panel"] as const) {
    const n = style[pane];
    if (n !== null) root.style.setProperty(paneVar(pane), `${n}px`);
    else root.style.removeProperty(paneVar(pane));
  }
}

/** The class that says "this width is not the hand's doing", so the panes'
 *  0.18s does not play. React puts it on `.s-app` for the outline panel's
 *  automatic collapse (`paneStill`, client/state.ts); this file puts it on the
 *  root for the length of one write, the way the drag's own class does. */
export const PANE_STILL = "s-app--pane-still";

/** THE SAME WIDTHS, ARRIVING AT ONCE — which is what a window resize is.
 *
 *  A window dragged narrower re-clamps the panes on every frame, and a 0.18s
 *  width transition chasing a frame drag is precisely the lag this seam exists
 *  to remove. Measured before this: two 560px panes stored, the window taken
 *  from 1440 to 904, and `.s-main` was 0px wide 30ms in, 274px at 110ms and
 *  only reached its 320px floor after about 200ms — the note losing its column
 *  on every resize, which is the one thing `MAIN_MIN` is for.
 *
 *  Two style flushes and no timer: the first commits `transition: none` as the
 *  current style, the second commits the new widths underneath it, and the
 *  class comes off having animated nothing. The reader's own double-click
 *  reset calls `applyPaneWidths` directly and keeps its 0.18s. */
export function applyPaneWidthsNow(root: HTMLElement, room: PaneRoom): void {
  root.classList.add(PANE_STILL);
  void root.offsetWidth;
  applyPaneWidths(root, room);
  void root.offsetWidth;
  root.classList.remove(PANE_STILL);
}
