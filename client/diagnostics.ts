// DIAGNOSTICS — what this window can see, as one JSON blob for the clipboard.
//
// For the bug report that cannot be reproduced here. The owner's friend on
// Windows: "resizing panels doesn't work", four releases running; every
// grip drags under the Windows renderer in Wine, so what is left is the
// machine itself — what its pointer media queries say, how wide the window
// is in CSS pixels, whether the grip element exists and what is on top of
// it. This gathers exactly those facts. The palette's "Copy diagnostics"
// puts them on the clipboard; the reader pastes them in a message.
//
// Nothing here identifies the person: no paths, no note titles, no vault
// name — the user agent, the geometry, the media queries, the panes.

import { DRAWER_QUERY, useStore } from "./state.ts";
import { desktop } from "./desktop/bridge.ts";

declare const __APP_VERSION__: string;

function box(el: Element | null): Record<string, number> | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
}

function grip(sel: string): Record<string, unknown> {
  const el = document.querySelector(sel);
  if (!el) return { present: false };
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const top = r.width > 0 ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
  return {
    present: true,
    box: box(el),
    display: cs.display,
    zIndex: cs.zIndex,
    cursor: cs.cursor,
    // What a click at the grip's centre would hit — the grip itself, or
    // something painted over it.
    onTop: top === el ? "the grip" : top ? `${top.tagName.toLowerCase()}.${[...top.classList].slice(0, 2).join(".")}` : "nothing",
  };
}

/** The scrollbar's width on this platform: 0 for overlay scrollbars (Linux
 *  and macOS by default), ~17 for Windows' classic ones, which sit exactly
 *  where a side pane's inner edge is. */
function scrollbarWidth(): number {
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll;visibility:hidden";
  document.body.appendChild(probe);
  const w = probe.offsetWidth - probe.clientWidth;
  probe.remove();
  return w;
}

export function collectDiagnostics(): Record<string, unknown> {
  const s = useStore.getState();
  const mq = (q: string): boolean => window.matchMedia(q).matches;
  return {
    version: __APP_VERSION__,
    when: new Date().toISOString(),
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    desktop: desktop() !== null,
    window: { innerWidth: window.innerWidth, innerHeight: window.innerHeight, devicePixelRatio: window.devicePixelRatio, screen: [screen.width, screen.height] },
    document: { dir: document.documentElement.dir || "ltr", lang: document.documentElement.lang },
    media: {
      anyPointerFine: mq("(any-pointer: fine)"),
      anyPointerCoarse: mq("(any-pointer: coarse)"),
      pointerFine: mq("(pointer: fine)"),
      pointerCoarse: mq("(pointer: coarse)"),
      hover: mq("(hover: hover)"),
      anyHover: mq("(any-hover: hover)"),
      drawer: mq(DRAWER_QUERY),
      drawerQuery: DRAWER_QUERY,
      maxTouchPoints: navigator.maxTouchPoints,
    },
    scrollbarWidth: scrollbarWidth(),
    sidebar: {
      collapsed: s.sidebarCollapsed,
      open: s.sidebarOpen,
      side: s.sidebarSide,
      box: box(document.querySelector(".s-sidebar")),
      position: document.querySelector(".s-sidebar") ? getComputedStyle(document.querySelector(".s-sidebar")!).position : null,
      grip: grip(".s-sidebar .s-pane-grip"),
    },
    panel: {
      collapsed: s.panelCollapsed,
      box: box(document.querySelector(".s-panel")),
      grip: grip(".s-panel .s-pane-grip"),
    },
    split: {
      columns: [...document.querySelectorAll(".s-panecol")].map((c) => box(c)),
      grips: [...document.querySelectorAll(".s-split-grip")].map((g) => ({ box: box(g), display: getComputedStyle(g).display })),
    },
    cssVars: {
      sidebarW: getComputedStyle(document.documentElement).getPropertyValue("--sidebar-w").trim(),
      panelW: getComputedStyle(document.documentElement).getPropertyValue("--panel-w").trim(),
    },
    pointerEvents: "PointerEvent" in window,
    zen: s.zen,
  };
}

export async function copyDiagnostics(): Promise<boolean> {
  const text = JSON.stringify(collectDiagnostics(), null, 2);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // No clipboard (an http origin on a LAN, a locked-down browser): the
    // console still gets it, which is where a report is copied from anyway.
    console.log(text);
    return false;
  }
}
