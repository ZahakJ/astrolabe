// An image setting (logo, favicon, home banner): a path or URL field with a
// thumbnail, and the vault picker it opens. Split out of SettingsModal.tsx
// (3.27.0) unchanged.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useDialog } from "../../a11y.ts";
import { listAttachments, uploadAttachment } from "../../api.ts";
import { bannerSrc } from "../../banner.ts";
import { useBannerSrc } from "../BannerImg.tsx";
import { localeNum, t, tf } from "../../i18n.ts";
import { UPLOAD_MAX_MB } from "../../../shared/limits.ts";
import { TextInput } from "../controls/Fields.tsx";
import { toast } from "../../toast.ts";

export function ImagePicker({
  title,
  onPick,
  onClose,
}: {
  title: string;
  onPick: (path: string) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [attachments, setAttachments] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // The picker is a dialog stacked on the settings dialog: it takes the trap
  // while it is up and gives focus back to the "Pick" button that opened it.
  // (Escape is owned by SettingsModal's own capture-phase handler, which
  // closes the picker first — so no onEscape here.)
  useDialog(panelRef);

  useEffect(() => {
    let disposed = false;
    listAttachments(true)
      .then((list) => {
        if (!disposed) setAttachments(list);
      })
      .catch(() => {
        if (!disposed) setAttachments([]);
      });
    return () => {
      disposed = true;
    };
  }, []);

  const upload = useCallback(
    (file: File) => {
      if (busy) return;
      setBusy(true);
      uploadAttachment(file, true)
        .then((res) => {
          setBusy(false);
          onPick(res.path);
        })
        .catch((err: unknown) => {
          setBusy(false);
          console.error("astrolabe: upload failed", err);
          toast(err instanceof Error ? err.message : t("uploadFailed"));
        });
    },
    [busy, onPick],
  );

  const filtered = (attachments ?? []).filter((p) =>
    p.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <div className="s-palette-overlay s-smodal-picker" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="s-bmodal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="s-bmodal__head">
          <span className="s-bmodal__title" id={titleId}>{title}</span>
          <button type="button" className="s-bmodal__close" onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </div>

        {/* Real button: a div that opens a file picker is unreachable by
            keyboard (see BannerModal). Drag handlers ride along on it. */}
        <button
          type="button"
          className={`s-bmodal__drop${dragOver ? " s-bmodal__drop--over" : ""}`}
          aria-label={t("chooseImageFile")}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) upload(file);
          }}
        >
          {t(busy ? "working" : "dropImage")}
          <span className="s-bmodal__drophint">{tf("dropHint", { max: localeNum(UPLOAD_MAX_MB) })}</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = "";
            }}
          />
        </button>

        <div className="s-bmodal__pick">
          <input
            className="s-bmodal__input"
            type="text"
            placeholder={t("searchAttachments")}
            aria-label={t("searchAttachments")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            spellCheck={false}
          />
          <div className="s-bmodal__list">
            {attachments === null && <div className="s-bmodal__empty">{t("loading")}</div>}
            {attachments !== null && filtered.length === 0 && (
              <div className="s-bmodal__empty">
                {t(attachments.length === 0 ? "noAttachments" : "noMatchesDot")}
              </div>
            )}
            {filtered.slice(0, 200).map((p) => (
              <button
                key={p}
                type="button"
                className="s-bmodal__item"
                onClick={() => onPick(p)}
                disabled={busy}
              >
                <img className="s-bmodal__thumb" src={bannerSrc(p)} alt="" loading="lazy" />
                <span className="s-bmodal__itempath" dir="ltr">
                  {p}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Image-valued field: preview chip + pick/clear. An invalid value or an
 *  unloadable image shows a designed ⌀ placeholder chip, never the browser's
 *  raw broken-image glyph. */
export function ImageField({
  value,
  placeholder,
  invalid,
  disabled,
  onChange,
  onOpenPicker,
  // Forwarded by Row: the row's <label> points at `id`, so the text field —
  // not the wrapper div — has to be the thing carrying it.
  id,
  "aria-describedby": describedBy,
}: {
  value: string;
  placeholder: string;
  invalid?: boolean;
  /** The row is inert (a switch above it is off). The field AND both of its
   *  buttons go with it — a live "Pick…" beside a dimmed field is the same
   *  invisible-state bug the dimming is there to prevent. */
  disabled?: boolean;
  onChange: (v: string) => void;
  onOpenPicker: () => void;
  id?: string;
  "aria-describedby"?: string;
}) {
  const trimmed = value.trim();
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [trimmed]);
  const isImage = trimmed !== "";
  // The field's thumbnail answers "did what I typed find a file?", so it has
  // to resolve the value the way the SITE will: bare filenames included
  // (client/banner.ts). It used to preview /api/file?path=<whatever was
  // typed>, which showed the ⌀ for a value the public page would have
  // rendered perfectly — and vice versa.
  const { src, pending, missing } = useBannerSrc(trimmed);
  const showImg = isImage && !invalid && !broken && src !== null;
  return (
    <div className="s-smodal__imgfield">
      {showImg && (
        <img
          className="s-smodal__imgthumb"
          src={src ?? ""}
          alt=""
          onError={() => setBroken(true)}
        />
      )}
      {isImage && !invalid && pending && (
        <span className="s-smodal__imgthumb s-smodal__imgthumb--pending" aria-hidden="true" />
      )}
      {isImage && !showImg && !pending && (
        <span
          className="s-smodal__imgthumb s-smodal__imgthumb--missing"
          title={missing || broken ? tf("bannerMissingTitle", { value: trimmed }) : undefined}
          aria-hidden="true"
        >
          ⌀
        </span>
      )}
      <TextInput
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        invalid={invalid}
        disabled={disabled}
        label={placeholder}
        dir="ltr"
      />
      <button type="button" className="s-btn" disabled={disabled} onClick={onOpenPicker}>
        {t("pick")}
      </button>
      {isImage && (
        <button type="button" className="s-btn" disabled={disabled} onClick={() => onChange("")} aria-label={t("clear")}>
          ×
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Backup & sync — the live half of the section: repo state, last result, and
// the two actions (initialize / sync now). The settings ROWS above it are
// ordinary form rows; this block is the mirror the reader checks afterwards.
// ---------------------------------------------------------------------------
