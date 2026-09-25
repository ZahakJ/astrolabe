// PULL DOWN TO REFRESH, on the Notes lists.
//
// A list held at its top and pulled down past a thumb's length re-reads the
// vault: the tree from the server (or from the pocket's clone), and a
// `astrolabe:refresh` event on the window for whoever keeps the vault — the
// Android app's pocket answers it with a pull from GitHub
// (mobile/src/pocket/boot.ts), so the gesture every phone app has taught is
// also "sync now". The client does not learn that a pocket exists: it asks
// for fresh notes, and the pocket is one of the things that can hear it.
//
// Touch events, passive, and only a transform written per move: the list
// itself never moves (no layout per frame), a pill slides down from under the
// top bar and says what letting go will do.

import { createElement, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { t } from "../i18n.ts";
import { useStore } from "../state.ts";

/** How far (after the drag's resistance) a release refreshes. */
const THRESHOLD = 64;
const MAX = 96;
/** The pill stays at least this long, so a fast refresh is still seen. */
const MIN_BUSY_MS = 600;

export const REFRESH_EVENT = "astrolabe:refresh";

type Phase = "idle" | "pull" | "ready" | "busy";

export function usePullRefresh(ref: RefObject<HTMLElement | null>): ReactNode {
  const pill = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startY: number | null = null;
    let dist = 0;
    const paint = (d: number): void => {
      if (pill.current) pill.current.style.transform = `translate3d(0, ${d - 48}px, 0)`;
    };
    const go = (next: Phase): void => {
      if (phaseRef.current !== next) setPhase(next);
    };
    const onStart = (e: TouchEvent): void => {
      if (phaseRef.current === "busy" || el.scrollTop > 0 || e.touches.length !== 1) {
        startY = null;
        return;
      }
      startY = e.touches[0].clientY;
      dist = 0;
    };
    const onMove = (e: TouchEvent): void => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || el.scrollTop > 0) {
        if (dist > 0) {
          dist = 0;
          paint(0);
          go("idle");
        }
        return;
      }
      dist = Math.min(MAX, dy * 0.5);
      paint(dist);
      go(dist >= THRESHOLD ? "ready" : "pull");
    };
    const onEnd = (): void => {
      if (startY === null) return;
      startY = null;
      if (dist < THRESHOLD) {
        dist = 0;
        paint(0);
        go("idle");
        return;
      }
      dist = 0;
      paint(THRESHOLD);
      go("busy");
      const began = Date.now();
      window.dispatchEvent(new Event(REFRESH_EVENT));
      void Promise.resolve(useStore.getState().loadTree())
        .catch(() => {})
        .then(() => new Promise((r) => setTimeout(r, Math.max(0, MIN_BUSY_MS - (Date.now() - began)))))
        .then(() => {
          paint(0);
          go("idle");
        });
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [ref]);

  const words = phase === "busy" ? t("phRefreshing") : phase === "ready" ? t("phPullRelease") : t("phPull");
  return createElement(
    "div",
    { className: "s-ph-pull", "aria-hidden": phase === "busy" ? undefined : "true", "data-phase": phase },
    createElement("div", { ref: pill, className: "s-ph-pull__pill", role: phase === "busy" ? "status" : undefined }, words),
  );
}
