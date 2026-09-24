// A LIST COMES BACK WHERE IT WAS LEFT.
//
// The push that leaves a list stamps its scroll offset into the history entry
// it leaves (nav.ts `scrollOf`), and the pop that returns hands it back as
// `NavState.scroll`. This hook, on the list's scroller, puts it there. A list
// whose rows arrive a beat later (Today's sigils, a tag's notes, the decks)
// is not tall enough on the first frame, so the offset is re-applied as the
// content grows — for a second at most, and never once the reader has
// scrolled it themselves.

import { useLayoutEffect, type RefObject } from "react";
import { usePhone } from "./context.ts";

const PATIENCE_MS = 1200;

export function useScrollMemory(ref: RefObject<HTMLElement | null>): void {
  const phone = usePhone();
  const want = phone.state.scroll ?? 0;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || want <= 0) return;
    let done = false;
    let touched = false;
    const apply = (): void => {
      if (done || touched) return;
      el.scrollTop = want;
      if (Math.abs(el.scrollTop - want) < 2) done = true;
    };
    apply();
    if (done) return;
    const onTouch = (): void => {
      touched = true;
    };
    el.addEventListener("pointerdown", onTouch, { passive: true, once: true });
    el.addEventListener("wheel", onTouch, { passive: true, once: true });
    const ro = new ResizeObserver(apply);
    for (const child of el.children) ro.observe(child);
    const mo = new MutationObserver(() => {
      for (const child of el.children) ro.observe(child);
      apply();
    });
    mo.observe(el, { childList: true });
    const stop = window.setTimeout(() => {
      done = true;
      ro.disconnect();
      mo.disconnect();
    }, PATIENCE_MS);
    return () => {
      window.clearTimeout(stop);
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener("pointerdown", onTouch);
      el.removeEventListener("wheel", onTouch);
    };
    // Once per mount: the offset belongs to the entry this screen was
    // restored from, not to whatever the nav says later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
