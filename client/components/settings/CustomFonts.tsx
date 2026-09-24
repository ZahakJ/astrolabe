// Typography's live half: the uploaded faces, the specimen the pickers are
// judged against, and the preview stylesheet that makes the specimen honest
// before a save. Split out of SettingsModal.tsx (3.27.0) unchanged.

import { useEffect, useRef, useState } from "react";
import type { CustomFontInfo } from "../../../shared/types.ts";
import { ApiError } from "../../api.ts";
import { faceStack, loadFontFaces } from "../../fontFaces.ts";
import { localeNum, t, tf, type I18nKey } from "../../i18n.ts";
import { FONT_UPLOAD_MAX_MB } from "../../../shared/limits.ts";
import { SYSTEM_FONT } from "../FontPicker.tsx";

// Type SPECIMENS, deliberately not in i18n.ts: a Latin sample must stay Latin
// in an Arabic UI and an Arabic sample Arabic in an English one, or the block
// stops previewing the thing it is there to preview. The second line is mixed
// on purpose — it is the whole feature in one line: the Arabic slot answers
// for the Arabic letters and the Latin slot for "Astrolabe" and the digits,
// chosen per CHARACTER, with no markup and no language attribute.
export const SPECIMEN_LATIN = "The vault is open — a candlelit room 0123";

export const SPECIMEN_ARABIC = "خَطُّ النَّسْخِ في عمودِ القراءةِ ١٢٣٤";

/** WHAT THE SERVER REFUSED, IN THE READER'S LANGUAGE.
 *
 *  `client/api.ts` turns every failure body into an `ApiError` carrying the
 *  server's ENGLISH prose, and every call site here used to toast
 *  `err.message` — so the commonest failure of this feature (choosing the
 *  wrong file) printed "Not a recognized font file (woff2, woff, ttf, otf)"
 *  into a fully Arabic panel, and `t("fontUploadFailed")` was unreachable
 *  code. The font routes now name their failures with a stable `code`; this
 *  translates the ones worth naming and keeps the generic line for the rest.
 *
 *  Falling back to `err.message` was considered and rejected: the prose is
 *  English by construction, so showing it is the bug, not the safety net. An
 *  unnamed failure gets the generic sentence and the detail goes to the
 *  console, where it was already going. */
export const FONT_ERROR_KEYS: Record<string, I18nKey> = {
  font_unrecognized: "errFontUnrecognized",
  font_damaged: "errFontDamaged",
  font_too_large: "errFontTooLarge",
  font_no_file: "errFontNoFile",
  font_bad_body: "errFontNoFile",
  font_not_found: "errFontNotFound",
  font_bad_name: "errFontBadName",
  font_no_free_name: "errFontNoFreeName",
  font_in_use: "errFontInUse",
};

export function fontErrorText(err: unknown, fallback: I18nKey): string {
  const code = err instanceof ApiError ? err.code : undefined;
  const key = code ? FONT_ERROR_KEYS[code] : undefined;
  if (!key) return t(fallback);
  // The one code with a number in its sentence; the cap is a client constant
  // too, so it is not read back off the wire.
  return key === "errFontTooLarge"
    ? tf(key, { max: localeNum(FONT_UPLOAD_MAX_MB) })
    : t(key);
}

/** The uploaded-face manager: a drop zone and the list of what has been
 *  uploaded. It sits under the four pickers because it is inventory, not a
 *  choice — the choosing happens above, where "Your fonts" is one group among
 *  the catalog's.
 *
 *  Deleting is guarded twice: a face a slot still names is not offered a
 *  delete button at all (the row says which slot holds it), and the server
 *  409s the same case regardless of what the panel believes. */
export function CustomFonts({
  fonts,
  usedBy,
  busy,
  onUpload,
  onDelete,
}: {
  fonts: CustomFontInfo[];
  usedBy: (id: string) => string[];
  busy: boolean;
  onUpload: (file: File) => void;
  onDelete: (font: CustomFontInfo) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Each row prints its family name IN that family, which is the only honest
  // way to show what a file called "MyFace-Regular.woff2" actually is — so the
  // list asks for its own faces, exactly as a picker group does.
  useEffect(() => loadFontFaces(fonts.map((font) => font.id)), [fonts]);
  return (
    <div className="s-smodal__fonts">
      {/* Real button, like the banner and logo drop zones above: a div that
          opens a file picker is a control no keyboard can reach. The drag
          handlers ride along on it. */}
      <button
        type="button"
        className={`s-bmodal__drop${dragOver ? " s-bmodal__drop--over" : ""}`}
        aria-label={t("chooseFontFile")}
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
          if (file) onUpload(file);
        }}
      >
        {t(busy ? "working" : "dropFont")}
        <span className="s-bmodal__drophint">
          {tf("dropFontHint", { max: localeNum(FONT_UPLOAD_MAX_MB) })}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = "";
          }}
        />
      </button>
      {fonts.length === 0 && <p className="s-smodal__note">{t("noCustomFonts")}</p>}
      {fonts.length > 0 && (
        <ul className="s-smodal__fontlist">
          {fonts.map((font) => {
            const slots = usedBy(font.id);
            return (
              <li className="s-smodal__fontrow" key={font.id}>
                {/* The name is set IN the face: the row is a specimen too. */}
                <span
                  className="s-smodal__fontname"
                  dir="ltr"
                  style={{ fontFamily: faceStack(font.id, "var(--font-ui-system)") }}
                >
                  {font.family}
                </span>
                <span className="s-smodal__fontmeta">
                  <bdi>{font.format}</bdi>
                  <bdi>{tf("fontSizeKb", { count: localeNum(Math.max(1, Math.round(font.size / 1024))) })}</bdi>
                </span>
                {slots.length > 0 ? (
                  <span className="s-smodal__fontused">{tf("fontInUse", { slots: slots.join(" · ") })}</span>
                ) : (
                  <button type="button" className="s-btn s-btn--danger" disabled={busy} onClick={() => onDelete(font)}>
                    {t("remove")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The specimen block. Each row renders in its slot's PREVIEW composite
 *  ("AstrolabePreviewProse" …), which /api/font-preview.css defines from the
 *  picks currently in the form — so the reader sees the faces before saving
 *  anything, including the size-adjust dial. Every family name falls back to
 *  the matching --font-*-system stack, so an unpicked (or not-yet-fetched)
 *  slot simply shows what the site shows today.
 *
 *  ONE line per slot, and it is MIXED on purpose: that single line is the
 *  whole feature — the Arabic slot answers for the Arabic letters and the
 *  slot's own face for the Latin ones and the digits, chosen per character,
 *  with no markup and no language attribute. It used to be two lines (a Latin
 *  one and a mixed one), which was a better specimen and a worse CONTROL: the
 *  block stood 305px tall inside a 609px body, and it now has to stay on
 *  screen while the pickers below it are open. A sample nobody can see beside
 *  its picker previews nothing.
 *
 *  The line keeps the PANEL's direction and holds one inline isolate per run
 *  (dir on an inline element implies unicode-bidi: isolate), so the Arabic
 *  shapes and orders right-to-left without being flung to the opposite edge
 *  of the box — the faces being compared have to begin at the same place. */
export function FontSpecimens() {
  const rows: { key: I18nKey; cls: string }[] = [
    { key: "rowFontProse", cls: "s-smodal__specimen--prose" },
    { key: "rowFontUi", cls: "s-smodal__specimen--ui" },
    { key: "rowFontMono", cls: "s-smodal__specimen--mono" },
  ];
  return (
    <div className="s-smodal__specimens">
      {rows.map((row) => (
        <div key={row.key} className={`s-smodal__specimen ${row.cls}`}>
          <span className="s-smodal__speclabel">{t(row.key)}</span>
          <span className="s-smodal__specline">
            <bdi dir="ltr">{SPECIMEN_LATIN}</bdi>
            <span className="s-smodal__specgap"> · </span>
            <bdi dir="rtl">{SPECIMEN_ARABIC}</bdi>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Keep a <link> to /api/font-preview.css in sync with the four picks. The
 *  server caches a family the first time it is previewed, so the request is
 *  debounced (a select is a burst of changes) and its failures are silent —
 *  the specimen falls back to the system stack, which is a fine preview; a
 *  toast per keystroke is not. */
export function useFontPreview(
  prose: string,
  ui: string,
  mono: string,
  arabic: string,
  sizeAdjust: string,
): void {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const q = new URLSearchParams();
      for (const [slot, id] of [["prose", prose], ["ui", ui], ["mono", mono], ["arabic", arabic]]) {
        if (id && id !== SYSTEM_FONT) q.set(slot, id);
      }
      // The dial travels with the picks: it changes what the specimen looks
      // like without changing a single id, and it is judged against the Latin
      // line beside it or not at all.
      if (sizeAdjust.trim() !== "" && arabic !== SYSTEM_FONT) q.set("sizeAdjust", sizeAdjust.trim());
      let link = document.head.querySelector<HTMLLinkElement>("link[data-astrolabe-fontpreview]");
      if ([...q.keys()].length === 0) {
        link?.remove();
        return;
      }
      if (!link) {
        link = document.createElement("link");
        link.rel = "stylesheet";
        link.setAttribute("data-astrolabe-fontpreview", "");
        document.head.appendChild(link);
      }
      const href = `/api/font-preview.css?${q.toString()}`;
      if (link.getAttribute("href") !== href) link.setAttribute("href", href);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [prose, ui, mono, arabic, sizeAdjust]);
  // The preview families must not outlive the panel: the saved stylesheet is
  // what the app renders in.
  useEffect(() => () => document.head.querySelector("link[data-astrolabe-fontpreview]")?.remove(), []);
}

// ---------------------------------------------------------------------------
// About — what this instance IS. Everything here was previously answerable
// only from the terminal that started the server, which is the wrong place to
// ask from when you are editing the site in a browser tab.
// ---------------------------------------------------------------------------
