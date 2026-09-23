// THE SHEET — the phone shell's one layer.
//
// Everything that was a dialog, a popover or a drawer on the desktop is this
// on a phone: the note's outline and backlinks, the tree row's actions, a
// confirmation, a rename, the calendar's day. One component, so there is one
// way in (from the bottom edge, where the thumb is), one way out (down, or
// back), and one set of promises:
//
//   · A HISTORY ENTRY. The shell opens a sheet through `nav.openSheet`, which
//     pushes; the OS back gesture pops it before it pops the screen under it.
//     This component never touches history itself — it asks, through
//     `onDismiss`, and the shell's nav decides (client/phone/nav.ts).
//   · INERT UNDERNEATH. The shell sets `inert` on everything that is not the
//     sheet layer while one is up, so a stray tap cannot reach the note and a
//     screen reader cannot wander behind the sheet.
//   · TRANSFORMS ONLY. The panel moves by `transform`, the scrim by `opacity`,
//     and the finger's drag writes the transform straight onto the element —
//     no React render per touchmove, no layout, no style invalidation outside
//     the panel. (The audit measured the drawer pan dropping 12 of 60 frames
//     because it set a custom property on <html> per move; this is the same
//     gesture done the cheap way.)
//   · DETENTS. A reading sheet opens at half height and a drag up takes it to
//     90%; an action sheet is as tall as its rows. A flick or a drag past a
//     quarter of its height dismisses.
//
// The tablet's slide-over (`side`) is the same component entering from the
// trailing edge — logical, so Arabic brings it in from the left.

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useDialog } from "../a11y.ts";

export type Detent = "half" | "full" | "auto";

export interface SheetProps {
  /** The accessible name. */
  label: string;
  /** Header content under the handle (a title, a segmented control). It is
   *  also the grab region: a drag that starts here moves the sheet. */
  header?: ReactNode;
  detent?: Detent;
  /** The tablet's slide-over from the trailing edge. */
  side?: boolean;
  /** The shell is animating this sheet out (its entry is already gone). */
  leaving?: boolean;
  onDismiss: () => void;
  /** Where focus lands on open. Default: the panel itself — an action
   *  sheet's first row is not a choice the reader made. */
  initialFocus?: () => HTMLElement | null | undefined;
  className?: string;
  children: ReactNode;
}

/** px/ms past which a release is a flick, whatever the distance. */
const FLICK = 0.6;
/** Share of the panel's travel past which a slow release dismisses. */
const DISMISS_AT = 0.25;

export default function Sheet({ label, header, detent: initial = "auto", side = false, leaving = false, onDismiss, initialFocus, className = "", children }: SheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const scrimRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [detent, setDetent] = useState<Detent>(initial);
  const drag = useRef<{ id: number; start: number; last: number; t: number; v: number; base: number; size: number } | null>(null);

  // Enter on the frame after mount, so the transition has a start to run from.
  useLayoutEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const dismiss = useCallback(() => {
    if (leaving) return;
    onDismiss();
  }, [leaving, onDismiss]);

  // The product's one focus trap: focus in on open, Tab kept inside, Escape
  // dismisses, focus back to the opener on close.
  useDialog(panelRef, { initialFocus: initialFocus ?? (() => panelRef.current), onEscape: dismiss, active: !leaving });

  // ── the finger ────────────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0 || leaving) return;
    // A control in the header (a segment, a ✕) keeps its tap.
    if ((e.target as HTMLElement).closest("button, input, a, [role=tab], [role=radio]") && !(e.target as HTMLElement).closest(".s-ph-sheet__handle")) return;
    const panel = panelRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    // Where the panel rests now, as a translation from fully open.
    const m = new DOMMatrixReadOnly(getComputedStyle(panel).transform);
    const base = side ? m.m41 : m.m42;
    drag.current = { id: e.pointerId, start: side ? e.clientX : e.clientY, last: side ? e.clientX : e.clientY, t: e.timeStamp, v: 0, base, size: side ? r.width : r.height };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panel.style.transition = "none";
    if (scrimRef.current) scrimRef.current.style.transition = "none";
  };

  const rtl = (): boolean => panelRef.current?.closest("[dir]")?.getAttribute("dir") === "rtl";

  const onPointerMove = (e: React.PointerEvent): void => {
    const d = drag.current;
    const panel = panelRef.current;
    if (!d || d.id !== e.pointerId || !panel) return;
    const at = side ? e.clientX : e.clientY;
    const dt = Math.max(1, e.timeStamp - d.t);
    d.v = (at - d.last) / dt;
    d.last = at;
    d.t = e.timeStamp;
    let delta = at - d.start;
    // Toward the dismissing edge: down, or toward the trailing edge.
    const sign = side && rtl() ? -1 : 1;
    let pos = d.base + delta;
    if (side) {
      pos = sign > 0 ? Math.max(0, pos) : Math.min(0, pos);
      panel.style.transform = `translate3d(${pos}px,0,0)`;
    } else {
      // Past fully open is a little resistance, not travel.
      if (pos < 0) pos = pos / 4;
      delta = pos;
      panel.style.transform = `translate3d(0,${pos}px,0)`;
    }
    if (scrimRef.current) scrimRef.current.style.opacity = String(Math.max(0, 1 - Math.abs(pos) / d.size));
  };

  const onPointerUp = (e: React.PointerEvent): void => {
    const d = drag.current;
    const panel = panelRef.current;
    if (!d || d.id !== e.pointerId || !panel) return;
    drag.current = null;
    const sign = side && rtl() ? -1 : 1;
    const moved = ((side ? e.clientX : e.clientY) - d.start) * sign;
    const at = d.base * sign + moved;
    const v = d.v * sign;
    panel.style.transition = "";
    panel.style.transform = "";
    if (scrimRef.current) {
      scrimRef.current.style.transition = "";
      scrimRef.current.style.opacity = "";
    }
    if (!side && detent === "half" && (v < -FLICK || moved < -60)) {
      setDetent("full");
      return;
    }
    if (!side && detent === "full" && initial === "half" && (v > FLICK || moved > 60) && at < d.size * 0.6) {
      setDetent("half");
      return;
    }
    if (v > FLICK || at > d.size * DISMISS_AT + (side ? 0 : d.base * sign)) {
      // Hold the panel where the finger left it; the shell's pop moves it out.
      panel.style.transform = side ? `translate3d(${at * sign}px,0,0)` : `translate3d(0,${at}px,0)`;
      requestAnimationFrame(() => {
        if (panelRef.current) panelRef.current.style.transform = "";
      });
      dismiss();
    }
  };

  const phase = leaving ? "leaving" : open ? "open" : "entering";
  const cls = [
    "s-ph-sheet",
    side ? "s-ph-sheet--side" : `s-ph-sheet--${detent}`,
    `s-ph-sheet--${phase}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      <div ref={scrimRef} className="s-ph-sheet__scrim" onClick={dismiss} aria-hidden="true" />
      <div
        ref={panelRef}
        className="s-ph-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        <div
          className="s-ph-sheet__grab"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {!side && <div className="s-ph-sheet__handle" aria-hidden="true" />}
          {header}
        </div>
        <div className="s-ph-sheet__body">{children}</div>
      </div>
    </div>
  );
}
