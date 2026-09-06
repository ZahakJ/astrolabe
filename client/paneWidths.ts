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

export const PANE_WIDTHS_KEY = "astrolabe.paneWidths";

export interface PaneWidths {
  sidebar?: number;
  panel?: number;
}

export function clampPane(width: number): number {
  return Math.round(Math.min(PANE_MAX, Math.max(PANE_MIN, width)));
}

/** The width a drag asks for: the pointer's distance from the edge the pane
 *  stands on. `left` says which edge. */
export function dragWidth(pointerX: number, rect: { left: number; right: number }, left: boolean): number {
  return left ? pointerX - rect.left : rect.right - pointerX;
}

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

/** Put the stored widths on the root, so the panes open at the widths the
 *  reader left them. Called once at boot by the first grip to mount. */
export function applyPaneWidths(root: HTMLElement): void {
  const w = readPaneWidths();
  for (const pane of ["sidebar", "panel"] as const) {
    const n = w[pane];
    if (n !== undefined) root.style.setProperty(paneVar(pane), `${n}px`);
    else root.style.removeProperty(paneVar(pane));
  }
}
