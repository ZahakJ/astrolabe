// The grip between a two-column screen's list and its note: drag it (or give
// it focus and use the arrow keys) to trade width between them; a double tap
// puts it back. The width is remembered per device and written as one custom
// property on the columns (`--ph-list-w`), which phone.css clamps so the note
// never narrows past a phone's measure whatever was remembered on a wider
// screen. The finger's drag writes that property straight onto the element —
// no React render per move — and the width is saved on release.

import { useEffect, useRef, type RefObject } from "react";
import { t } from "../i18n.ts";

const KEY = "astrolabe.phone-list-width";
const MIN = 240;
/** The note keeps at least this much. */
const NOTE_MIN = 320;
const STEP = 16;

export function readListWidth(): number | null {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) && n >= MIN ? n : null;
  } catch {
    return null;
  }
}

function saveListWidth(w: number | null): void {
  try {
    if (w === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(Math.round(w)));
  } catch {
    /* kept for the session */
  }
}

export default function ColumnGrip({ cols, list }: { cols: RefObject<HTMLElement | null>; list: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ id: number } | null>(null);

  const bounds = (): [number, number] => {
    const total = cols.current?.clientWidth ?? 0;
    return [MIN, Math.max(MIN, total - NOTE_MIN)];
  };
  const apply = (w: number | null): number | null => {
    const el = cols.current;
    if (!el) return null;
    if (w === null) {
      el.style.removeProperty("--ph-list-w");
    } else {
      const [lo, hi] = bounds();
      w = Math.min(hi, Math.max(lo, w));
      el.style.setProperty("--ph-list-w", `${Math.round(w)}px`);
    }
    ref.current?.setAttribute("aria-valuenow", String(Math.round(list.current?.getBoundingClientRect().width ?? 0)));
    return w;
  };

  useEffect(() => {
    apply(readListWidth());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rtl = (): boolean => cols.current?.closest("[dir]")?.getAttribute("dir") === "rtl";
  const widthAt = (x: number): number => {
    const r = list.current?.getBoundingClientRect();
    if (!r) return MIN;
    return rtl() ? r.right - x : x - r.left;
  };

  return (
    <div
      ref={ref}
      className="s-ph-cols__grip"
      role="separator"
      aria-orientation="vertical"
      aria-label={t("phListWidth")}
      aria-valuemin={MIN}
      tabIndex={0}
      data-grip="list"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        drag.current = { id: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.classList.add("s-ph-cols__grip--drag");
      }}
      onPointerMove={(e) => {
        if (drag.current?.id !== e.pointerId) return;
        apply(widthAt(e.clientX));
      }}
      onPointerUp={(e) => {
        if (drag.current?.id !== e.pointerId) return;
        drag.current = null;
        e.currentTarget.classList.remove("s-ph-cols__grip--drag");
        saveListWidth(apply(widthAt(e.clientX)));
      }}
      onPointerCancel={(e) => {
        drag.current = null;
        e.currentTarget.classList.remove("s-ph-cols__grip--drag");
      }}
      onDoubleClick={() => {
        apply(null);
        saveListWidth(null);
      }}
      onKeyDown={(e) => {
        const now = list.current?.getBoundingClientRect().width ?? MIN;
        const forward = rtl() ? "ArrowLeft" : "ArrowRight";
        const backward = rtl() ? "ArrowRight" : "ArrowLeft";
        let next: number | null | undefined;
        if (e.key === forward) next = now + STEP;
        else if (e.key === backward) next = now - STEP;
        else if (e.key === "Home") next = MIN;
        else if (e.key === "End") next = bounds()[1];
        else if (e.key === "Escape" || e.key === "Enter") next = undefined;
        if (next === undefined) return;
        e.preventDefault();
        saveListWidth(apply(next));
      }}
    />
  );
}
