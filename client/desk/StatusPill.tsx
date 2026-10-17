// A piece's status as a pill that opens the seven columns as a menu: the
// board's third way to move a card, the list's and the lanes' only one, and
// the piece bar's in the editor. Arrows walk the menu, Escape closes it and
// hands focus back to the pill.

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { DESK_STATUSES, type DeskPiece, type DeskStatus } from "../../shared/desk.ts";
import { t, tf } from "../i18n.ts";
import { statusLabel } from "./words.ts";
import "./pill.css";

/** The status as a pill that opens the seven columns as a menu. */
export function StatusPill({ piece, onMove }: { piece: DeskPiece; onMove: (to: DeskStatus) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent): void => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", away, true);
    // The first row, so the arrows start from somewhere.
    requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>("[role=menuitemradio][aria-checked=true]")?.focus());
    return () => window.removeEventListener("pointerdown", away, true);
  }, [open]);
  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const items = [...(root.current?.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    }
  };
  return (
    <div className="s-desk-pill" ref={root}>
      <button
        ref={button}
        type="button"
        className="s-desk-pill__btn"
        data-stage={piece.stage}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={tf("deskStatusOf", { status: statusLabel(piece.stage) })}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="s-desk-pill__dot" aria-hidden="true" />
        <span>{statusLabel(piece.stage)}</span>
        <svg className="s-desk-pill__chev" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="s-desk-pill__menu" role="menu" aria-label={t("deskMoveTitle")} onKeyDown={onMenuKey} onClick={(e) => e.stopPropagation()}>
          {DESK_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={s === piece.stage}
              className="s-desk-pill__item"
              data-stage={s}
              onClick={() => {
                setOpen(false);
                if (s !== piece.stage) onMove(s);
              }}
            >
              <span className="s-desk-pill__dot" aria-hidden="true" />
              <span>{statusLabel(s)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
