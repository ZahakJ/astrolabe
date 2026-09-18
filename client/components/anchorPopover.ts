// Place a fixed popover at a point, the way the tree's context menu does it.
//
// One rule, three callers (the folder-icon picker, the folder's library
// popover, and whatever comes next): open toward the reading direction, fold
// back when that edge is full, clamp on both axes so the box is never cut by
// the viewport. Written once here rather than pasted, because the three must
// AGREE — two popovers that fold at different distances from the edge feel
// like two apps.

/** Margin the popover keeps from every viewport edge (the menu's number). */
const EDGE = 8;

/** Hold a box of `size` starting at `start` inside `viewport`, keeping EDGE
 *  from both sides. Exported because BOTH edges matter and only one of them
 *  kept getting written: the sync popover clamped the near edge by hand and
 *  came out 358px wide at x = −189 on a phone, more than half of it off the
 *  screen. A box wider than the viewport is pinned to the leading margin
 *  rather than centred on nothing. */
export function clampAxis(start: number, size: number, viewport: number): number {
  if (size >= viewport - EDGE * 2) return EDGE;
  return Math.max(EDGE, Math.min(start, viewport - size - EDGE));
}

export function anchorPopover(el: HTMLElement, x: number, y: number): void {
  const rtl = getComputedStyle(document.documentElement).direction === "rtl";
  const { width, height } = el.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  let left = rtl ? x - width : x;
  if (left + width > vw - EDGE) left = x - width;
  if (left < EDGE) left = x;
  let top = y;
  if (top + height > vh - EDGE) top = y - height;
  el.style.left = `${Math.round(clampAxis(left, width, vw))}px`;
  el.style.top = `${Math.round(clampAxis(top, height, vh))}px`;
}
