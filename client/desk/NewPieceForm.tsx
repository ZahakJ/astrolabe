// "NEW ESSAY IDEA" — a title and its angle, and the piece is on the desk
// (docs/writing-desk.md). The series and the language are there for the
// moment they are already known; nothing else is asked. The note lands in
// Writing/ with no `publish:` key: private until the owner publishes it.
//
// It wears the Media form's chrome (`.s-mediaform*`), the export dialog's
// shape, and is mounted on <body> because its doors (the palette, the desk,
// the sidebar) live in different trees.

import { useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DESK_FOLDER, type DeskKind, type DeskLang, type DeskSeries } from "../../shared/desk.ts";
import { noteTitleOf } from "../../shared/noteFormat.ts";
import { useDialog } from "../a11y.ts";
import { announceOverlay } from "../overlays.ts";
import { getDesk } from "../api.ts";
import { SegmentedControl, TextInput } from "../components/controls/Fields.tsx";
import { t, tf } from "../i18n.ts";
import { createPiece } from "./actions.ts";
import type { NewPiecePreset } from "./door.ts";
import "../styles/media.css";
import "./desk.css";

function NewPieceForm({ kind, preset, onClose }: { kind: DeskKind; preset: NewPiecePreset; onClose(): void }) {
  const panelRef = useRef<HTMLFormElement>(null);
  useDialog(panelRef, { onEscape: onClose });
  const [title, setTitle] = useState("");
  const [angle, setAngle] = useState("");
  const [series, setSeries] = useState(preset.series ?? "");
  const [lang, setLang] = useState<"" | DeskLang>("");
  const [known, setKnown] = useState<DeskSeries[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (kind !== "essay") return;
    let live = true;
    getDesk()
      .then((d) => {
        if (live) setKnown(d.series);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [kind]);

  const essay = kind === "essay";
  const heading = essay ? t("deskNewEssay") : t("deskNewSeries");
  const submit = async (): Promise<void> => {
    if (title.trim() === "" || busy) return;
    setBusy(true);
    const path = await createPiece(title.trim(), {
      kind,
      angle,
      series: series === "" ? "" : noteTitleOf(series),
      lang: lang === "" ? null : lang,
    });
    setBusy(false);
    if (path !== null) onClose();
  };

  return (
    <div className="s-palette-overlay" onMouseDown={onClose}>
      <form
        ref={panelRef}
        className="s-mediaform s-desk-form"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        data-testid="desk-new"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="s-mediaform__head">
          <h2 className="s-mediaform__title">{heading}</h2>
          <button type="button" className="s-mediaform__close" onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </div>
        <div className="s-mediaform__body">
          <div className="s-mediaform__row">
            <label className="s-mediaform__label" htmlFor="s-desk-new-title">
              {t("deskFieldTitle")}
            </label>
            <TextInput id="s-desk-new-title" value={title} onChange={setTitle} placeholder={essay ? t("deskFieldTitlePlaceholder") : t("deskFieldSeriesPlaceholder")} label={t("deskFieldTitle")} maxLength={120} dir="auto" />
          </div>
          <div className="s-mediaform__row">
            <label className="s-mediaform__label" htmlFor="s-desk-new-angle">
              {essay ? t("deskFieldAngle") : t("deskFieldDescription")}
            </label>
            <TextInput
              id="s-desk-new-angle"
              value={angle}
              onChange={setAngle}
              placeholder={essay ? t("deskFieldAnglePlaceholder") : t("deskFieldDescriptionPlaceholder")}
              label={essay ? t("deskFieldAngle") : t("deskFieldDescription")}
              maxLength={400}
              dir="auto"
            />
          </div>
          {essay && known.length > 0 && (
            <div className="s-mediaform__row">
              <label className="s-mediaform__label" htmlFor="s-desk-new-series">
                {t("deskFieldSeries")}
              </label>
              <select id="s-desk-new-series" className="s-ctl s-ctl-input s-desk-form__select" value={series} onChange={(e) => setSeries(e.target.value)}>
                <option value="">{t("deskNoSeriesFilter")}</option>
                {known.map((s) => (
                  <option key={s.path} value={s.path}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="s-mediaform__row">
            <span className="s-mediaform__label">{t("deskFieldLang")}</span>
            <SegmentedControl
              label={t("deskFieldLang")}
              value={lang}
              onChange={(v) => setLang(v === "en" || v === "ar" ? v : "")}
              segments={[
                { value: "", label: t("deskFieldLangAny") },
                { value: "en", label: t("deskLangEn") },
                { value: "ar", label: t("deskLangAr") },
              ]}
            />
          </div>
          <p className="s-mediaform__hint">{tf("deskFiledIn", { folder: DESK_FOLDER })}</p>
        </div>
        <div className="s-mediaform__foot">
          <button type="button" className="s-btn" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="submit" className="s-btn s-btn--accent" disabled={busy || title.trim() === ""}>
            {t("deskCreate")}
          </button>
        </div>
      </form>
    </div>
  );
}

let host: HTMLDivElement | null = null;
let root: Root | null = null;
/** On a phone the form is a layer Back closes (client/overlays.ts). */
let release: (() => void) | null = null;

function close(): void {
  if (!root || !host) return;
  const [r, h] = [root, host];
  root = null;
  host = null;
  release?.();
  release = null;
  setTimeout(() => {
    r.unmount();
    h.remove();
  }, 0);
}

export function mountNewPieceForm(kind: DeskKind, preset: NewPiecePreset): void {
  if (host) return;
  host = document.createElement("div");
  host.className = "s-desk-form-host";
  document.body.appendChild(host);
  root = createRoot(host);
  root.render(<NewPieceForm kind={kind} preset={preset} onClose={close} />);
  release = announceOverlay("desk-new", close);
}
