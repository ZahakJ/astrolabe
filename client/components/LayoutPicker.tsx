// NAMED LAYOUTS — the picker: every saved arrangement, Restore and Delete.
// Opened from the palette's "Restore a layout…"; "Save layout as…" is the
// palette's own prompt and never comes here.

import { useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useDialog } from "../a11y.ts";
import { deleteLayout, getLayouts } from "../api.ts";
import { relativeDate } from "../dates.ts";
import { t, tf } from "../i18n.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { restoreLayout } from "../layouts.ts";
// The Media form's frame (.s-mediaform*): this picker is its own lazy chunk
// and drew unframed on a session that had not opened the Media page yet.
import "../styles/media.css";

function Picker({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<{ name: string; at: number }[] | null>(null);
  const locale = useStore((s) => s.blogLocale);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useDialog(panelRef, { onEscape: onClose });
  const load = (): void => {
    getLayouts()
      .then((r) => setRows(r.layouts))
      .catch(() => setRows([]));
  };
  useEffect(load, []);

  const restore = async (name: string): Promise<void> => {
    // The palette's "Load layout: …" rows make the same call (client/layouts.ts).
    if (await restoreLayout(name)) onClose();
  };
  const remove = async (name: string): Promise<void> => {
    try {
      await deleteLayout(name);
      toast(tf("layoutDeleted", { name }));
      load();
    } catch {
      toast(t("layoutFailed"), "error");
    }
  };

  return (
    <div className="s-palette-overlay" onMouseDown={onClose}>
      <div ref={panelRef} className="s-mediaform s-layouts" role="dialog" aria-modal="true" aria-label={t("layoutsTitle")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="s-mediaform__head">
          <h2 className="s-mediaform__title">{t("layoutsTitle")}</h2>
          <button type="button" className="s-mediaform__close" onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </div>
        <div className="s-mediaform__body">
          {rows === null ? null : rows.length === 0 ? (
            <p className="s-mediaform__hint">{t("layoutsEmpty")}</p>
          ) : (
            <ul className="s-layouts__list">
              {rows.map((r) => (
                <li key={r.name} className="s-layouts__row">
                  <span className="s-layouts__name" dir="auto">
                    {r.name}
                  </span>
                  <span className="s-layouts__when">{r.at > 0 ? relativeDate(r.at, locale, { dateStyle: "medium" }) : ""}</span>
                  <button type="button" className="s-btn s-btn--accent" onClick={() => void restore(r.name)}>
                    {t("layoutRestore")}
                  </button>
                  <button type="button" className="s-btn" onClick={() => void remove(r.name)}>
                    {t("layoutDelete")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

let root: Root | null = null;
let mount: HTMLElement | null = null;

export function openLayoutPicker(): void {
  if (root) return;
  mount = document.createElement("div");
  document.body.appendChild(mount);
  root = createRoot(mount);
  const close = (): void => {
    root?.unmount();
    root = null;
    mount?.remove();
    mount = null;
  };
  root.render(<Picker onClose={close} />);
}
