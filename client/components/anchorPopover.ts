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

export function anchorPopover(el: HTMLElement, x: number, y: number): void {
  const rtl = getComputedStyle(document.documentElement).direction === "rtl";
  const { width, height } = el.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  let left = rtl ? x - width : x;
  if (left + width > vw - EDGE) left = x - width;
  if (left < EDGE) left = x;
  left = Math.max(EDGE, Math.min(left, vw - width - EDGE));
  let top = y;
  if (top + height > vh - EDGE) top = y - height;
  top = Math.max(EDGE, Math.min(top, vh - height - EDGE));
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}
