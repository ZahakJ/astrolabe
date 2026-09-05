// THE ANNOTATION LAYER over a rendered note: paints the marks, offers
// "Annotate" over a fresh selection (owner only), opens a popover on a mark,
// and lists every annotation under the prose. Mounted beside the rendered
// body in the reading view and on the public article and lesson pages; the
// public pages pass `canEdit: false` and only ever receive the public marks.
//
// The rendered prose is imperative DOM the host replaces on every render, so
// this component watches the host with a MutationObserver and repaints when
// the words change — which is also what reattaches a mark after an edit.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { newHighlightId } from "../../shared/bookAnchor.ts";
import type { TextQuote } from "../../shared/textQuote.ts";
import type { NoteAnnotation } from "../../shared/types.ts";
import { t } from "../i18n.ts";
import { anchorFromSelection, clearMarks, marksSupported, paintMarks, rangeAtPoint, rangeFor } from "./anchor.ts";
import { useAnnotations } from "./useAnnotations.ts";
import AnnotationPopover from "./AnnotationPopover.tsx";
import AnnotationTip, { type TipRect } from "./AnnotationTip.tsx";
import "../styles/annotations.css";

interface Placed {
  annotation: NoteAnnotation;
  range: Range | null;
}

/** Where a popover opens, clamped into the window. */
function placeNear(rect: DOMRect): { left: number; top: number } {
  const w = Math.min(360, window.innerWidth - 24);
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - w - 12);
  const below = rect.bottom + 8;
  const top = below + 240 > window.innerHeight ? Math.max(12, rect.top - 250) : below;
  return { left, top };
}

export default function AnnotationLayer({
  path,
  host,
  canEdit,
  /** One letter naming the surface, so two hosts on one page (a split pane)
   *  paint under different registry names. */
  scope,
}: {
  path: string;
  host: HTMLElement | null;
  canEdit: boolean;
  scope: "r" | "p" | "l" | "d";
}) {
  const annotations = useAnnotations(path);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [fab, setFab] = useState<{ x: number; y: number; anchor: TextQuote } | null>(null);
  const [open, setOpen] = useState<{ draft: NoteAnnotation; at: { left: number; top: number }; fresh: boolean } | null>(null);
  const [tick, setTick] = useState(0);
  const [hover, setHover] = useState<{ id: string; rect: TipRect } | null>(null);
  const supported = useMemo(() => marksSupported(), []);

  // Repaint whenever the prose or the list changes.
  useEffect(() => {
    if (!host) return;
    const mo = new MutationObserver(() => setTick((n) => n + 1));
    mo.observe(host, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, [host]);

  useEffect(() => {
    if (!host || !annotations) {
      setPlaced([]);
      return;
    }
    const next: Placed[] = annotations.map((annotation) => ({ annotation, range: rangeFor(host, annotation) }));
    setPlaced(next);
    if (supported) {
      paintMarks(
        scope,
        next.filter((p) => p.range !== null).map((p) => ({ range: p.range as Range, ink: p.annotation.ink, isPublic: p.annotation.public })),
      );
    }
    return () => clearMarks(scope);
  }, [host, annotations, tick, scope, supported]);

  // The owner's selection → the floating button.
  useEffect(() => {
    if (!host || !canEdit) return;
    let raf = 0;
    const onSel = (): void => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !host.contains(sel.getRangeAt(0).commonAncestorContainer)) {
          setFab(null);
          return;
        }
        const anchor = anchorFromSelection(host);
        if (!anchor) {
          setFab(null);
          return;
        }
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        setFab({ x: rect.left + rect.width / 2, y: rect.top - 6, anchor });
      });
    };
    document.addEventListener("selectionchange", onSel);
    return () => {
      document.removeEventListener("selectionchange", onSel);
      cancelAnimationFrame(raf);
    };
  }, [host, canEdit]);

  // The pointer resting on a mark names it. Custom highlights take no
  // events, so the mark under the pointer is found the way the click finds
  // it, once per animation frame while the pointer moves.
  useEffect(() => {
    if (!host) return;
    let raf = 0;
    let last: string | null = null;
    const onMove = (e: MouseEvent): void => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const ranged = placed.filter((p) => p.range !== null).map((p) => ({ id: p.annotation.id, range: p.range as Range }));
        const id = ranged.length ? rangeAtPoint(ranged, e.clientX, e.clientY) : null;
        if (id === last) return;
        last = id;
        const hit = id ? ranged.find((r) => r.id === id) : undefined;
        if (!hit) {
          setHover(null);
          return;
        }
        // The line the pointer is on, not the whole mark: a mark that wraps
        // three lines would otherwise put the card a paragraph away.
        const rects = [...hit.range.getClientRects()];
        const row = rects.find((r) => e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2) ?? hit.range.getBoundingClientRect();
        setHover({ id: hit.id, rect: { left: row.left, top: row.top, width: row.width, height: row.height } });
      });
    };
    const onLeave = (): void => {
      cancelAnimationFrame(raf);
      last = null;
      setHover(null);
    };
    host.addEventListener("mousemove", onMove);
    host.addEventListener("mouseleave", onLeave);
    return () => {
      host.removeEventListener("mousemove", onMove);
      host.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, [host, placed]);

  // A click on a mark opens it.
  useEffect(() => {
    if (!host) return;
    const onClick = (e: MouseEvent): void => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return; // a drag is a selection, not a click
      const target = e.target as HTMLElement | null;
      if (target?.closest("a, button, input, textarea")) return;
      const id = rangeAtPoint(
        placed.filter((p) => p.range !== null).map((p) => ({ id: p.annotation.id, range: p.range as Range })),
        e.clientX,
        e.clientY,
      );
      if (!id) return;
      const hit = placed.find((p) => p.annotation.id === id);
      if (!hit || !hit.range) return;
      setFab(null);
      setHover(null);
      setOpen({ draft: { ...hit.annotation }, at: placeNear(hit.range.getBoundingClientRect()), fresh: false });
    };
    host.addEventListener("click", onClick);
    return () => host.removeEventListener("click", onClick);
  }, [host, placed]);

  const begin = useCallback(() => {
    if (!fab) return;
    const draft: NoteAnnotation = {
      id: newHighlightId(),
      ...fab.anchor,
      ink: 1,
      note: "",
      public: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setOpen({ draft, at: placeNear(new DOMRect(fab.x - 180, fab.y, 360, 0)), fresh: true });
    setFab(null);
    window.getSelection()?.removeAllRanges();
  }, [fab]);

  const openFromList = (p: Placed): void => {
    const rect = p.range?.getBoundingClientRect();
    if (p.range && rect) {
      const el = p.range.startContainer.parentElement;
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    setOpen({ draft: { ...p.annotation }, at: placeNear(rect ?? new DOMRect(window.innerWidth / 2 - 180, window.innerHeight / 2, 360, 0)), fresh: false });
  };

  if (!annotations && !canEdit) return null;
  const listed = placed.filter((p) => canEdit || p.annotation.public);
  return (
    <>
      {fab && canEdit && (
        <button
          type="button"
          className="s-ann-fab"
          style={{ left: fab.x, top: fab.y }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={begin}
        >
          <span aria-hidden="true">✎</span> {t("annotateSelection")}
        </button>
      )}
      {hover && !open && (() => {
        const hit = placed.find((p) => p.annotation.id === hover.id);
        return hit ? <AnnotationTip annotation={hit.annotation} rect={hover.rect} canEdit={canEdit} /> : null;
      })()}
      {open && (
        <AnnotationPopover
          key={open.draft.id}
          path={path}
          initial={open.draft}
          fresh={open.fresh}
          canEdit={canEdit}
          at={open.at}
          onClose={() => setOpen(null)}
        />
      )}
      {listed.length > 0 && (
        <section className="s-ann-list" aria-label={canEdit ? t("annotationsHeading") : t("annotationsPublicHeading")}>
          <p className="s-ann-list__head">{canEdit ? t("annotationsHeading") : t("annotationsPublicHeading")}</p>
          {!supported && <p className="s-ann-list__orphan">{t("annotationUnsupported")}</p>}
          {listed.map((p) => (
            <div
              key={p.annotation.id}
              className="s-ann-list__item"
              role="button"
              tabIndex={0}
              onClick={() => openFromList(p)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openFromList(p);
                }
              }}
            >
              <span className="s-ann-list__dot" data-ink={p.annotation.ink} aria-hidden="true" />
              <div>
                <div className="s-ann-list__quote" dir="auto">
                  {p.annotation.quote}
                  {canEdit && p.annotation.public && <span className="s-ann-list__badge">{t("annotationPublic")}</span>}
                </div>
                {p.annotation.note && (
                  <p className="s-ann-list__note" dir="auto">
                    {p.annotation.note}
                  </p>
                )}
                {p.range === null && <span className="s-ann-list__orphan">{t("annotationOrphan")}</span>}
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
