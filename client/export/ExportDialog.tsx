// THE EXPORT DIALOG: one sheet, four scopes, two ways out.
//
// The only door out of the vault used to be the printer — one note, on
// paper. This is the other one: a ZIP of the notes a scope names (this note,
// a folder, a tag, everything) with the attachments they reference, and, for
// a single note, a standalone HTML page with the theme's colours and the
// pictures inside it (html.ts). Nothing leaves the machine that the reader
// did not ask for: the archive is a download from the reader's own server
// to the reader's own disk, and the page is built in this tab.
//
// It wears the Media form's chrome (`.s-mediaform*`, client/styles/media.css)
// rather than a third dialog family — a reader who has filled in one sheet
// here has filled in this one — and adds only the few rules export.css
// states. Mounted imperatively on <body> like the theme picker, because its
// two openers (the palette, the tree's folder menu) live in different
// component trees.
//
// THE DRY RUN IS THE FORM'S ONLY LIVE LINE. Every change to the scope, the
// folder, the tag or the attachments switch asks `?dry=1` what the same
// download would hold, and the answer — "12 notes, 4 files · 3.2 MB", or the
// cap's refusal, or "nothing matches" — is printed under the controls
// before the browser's download manager is involved. Without it a 413 is a
// download the browser reports as "failed" with no sentence attached.

import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useDialog } from "../a11y.ts";
import { ApiError, getTags } from "../api.ts";
import { exportSummary, exportUrl, type ExportParams } from "./api.ts";
import { formatSize } from "../components/AttachmentViewer.tsx";
import { SegmentedControl, Toggle } from "../components/controls/Fields.tsx";
import { pickFolder } from "../components/FolderPicker.tsx";
import { EXPORT_MAX_GB } from "../../shared/limits.ts";
import type { ExportLinkStyle, ExportScope, ExportSummary, TagCount } from "../../shared/types.ts";
import { noteTitleOf } from "../../shared/noteFormat.ts";
import { countPhrase, localeNum, t, tf } from "../i18n.ts";
import { parentDir } from "../move.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import type { ExportPreset } from "./door.ts";
import { exportNoteAsHtml } from "./html.ts";
import "../styles/media.css";
import "./export.css";

const SCOPES: ExportScope[] = ["note", "folder", "tag", "vault"];

type Preview = { kind: "counting" } | { kind: "ready"; summary: ExportSummary } | { kind: "error"; text: string };

/** The error line for a refused dry run, in the reader's language — by the
 *  server's stable code, never by its English prose (CONTRACTS, "API"). */
function refusalText(err: unknown): string {
  const code = err instanceof ApiError ? err.code : undefined;
  if (code === "exportTooLarge") return tf("exportTooLarge", { gb: localeNum(EXPORT_MAX_GB) });
  if (code === "exportEmpty") return t("replaceNothing");
  return t("exportFailed");
}

function ExportDialog({ preset, onClose }: { preset: ExportPreset; onClose(): void }) {
  const openPath = useStore((s) => s.openPath);
  const panelRef = useRef<HTMLFormElement>(null);
  useDialog(panelRef, { onEscape: onClose });

  const [scope, setScope] = useState<ExportScope>(preset.scope ?? (openPath ? "note" : "vault"));
  const [folder, setFolder] = useState<string>(preset.folder ?? (openPath ? parentDir(openPath) : ""));
  const [tag, setTag] = useState("");
  const [links, setLinks] = useState<ExportLinkStyle>("wiki");
  const [attachments, setAttachments] = useState(true);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [preview, setPreview] = useState<Preview>({ kind: "counting" });
  const [busy, setBusy] = useState(false);

  // The tag list, for the datalist under the tag field. Fetched once; a tag
  // typed that the list does not know is still sent — the server answers
  // "nothing matches" through the dry run like any other empty scope.
  useEffect(() => {
    getTags().then(setTags).catch(() => setTags([]));
  }, []);

  const params = useMemo<ExportParams | null>(() => {
    const target = scope === "note" ? openPath ?? "" : scope === "folder" ? folder : scope === "tag" ? tag.trim() : "";
    if (scope === "note" && !openPath) return null;
    if (scope === "tag" && !target) return null;
    return { scope, target, links, attachments };
  }, [scope, openPath, folder, tag, links, attachments]);

  // The dry run, debounced a beat so a tag being typed asks once, not per
  // keystroke; the link style is not in its deps because it changes no count.
  useEffect(() => {
    if (params === null) {
      setPreview({ kind: "error", text: scope === "note" ? t("exportNothingOpen") : t("replaceNothing") });
      return;
    }
    setPreview({ kind: "counting" });
    const controller = new AbortController();
    const timer = setTimeout(() => {
      exportSummary(params, controller.signal)
        .then((summary) => setPreview({ kind: "ready", summary }))
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setPreview({ kind: "error", text: refusalText(err) });
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.scope, params?.target, params?.attachments, params === null]);

  const download = (): void => {
    if (params === null || preview.kind !== "ready") return;
    // An `<a download>` and not a fetch: the browser's own download manager
    // shows the progress of a 2 GB archive, the cookie carries the session,
    // and nothing is held in this tab's memory. Same-origin, so `download`
    // is honoured and the server's Content-Disposition names the file.
    const a = document.createElement("a");
    a.href = exportUrl(params);
    a.download = preview.summary.filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    onClose();
  };

  const html = async (): Promise<void> => {
    if (!openPath || busy) return;
    setBusy(true);
    try {
      const name = await exportNoteAsHtml(openPath);
      toast(tf("exportHtmlDone", { name }));
      onClose();
    } catch (err: unknown) {
      console.error("astrolabe: the HTML export failed", err);
      toast(t("exportHtmlFailed"), "error");
      setBusy(false);
    }
  };

  const heading = t("tbExport");
  const scopeLabel = (s: ExportScope): string =>
    s === "note" ? t("exportScopeNote") : s === "folder" ? t("exportScopeFolder") : s === "tag" ? t("exportScopeTag") : t("exportScopeVault");

  return (
    <div className="s-palette-overlay" onMouseDown={onClose}>
      <form
        ref={panelRef}
        className="s-mediaform s-export"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          download();
        }}
      >
        <div className="s-mediaform__head">
          <h2 className="s-mediaform__title" dir="auto">{heading}</h2>
          <button type="button" className="s-mediaform__close" onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </div>

        <div className="s-mediaform__body">
          <div className="s-mediaform__row">
            <span className="s-mediaform__label">{t("exportScope")}</span>
            <SegmentedControl
              value={scope}
              onChange={(v) => setScope(v as ExportScope)}
              segments={SCOPES.map((s) => ({ value: s, label: scopeLabel(s) }))}
              label={t("exportScope")}
            />
            {scope === "note" && openPath && (
              <p className="s-mediaform__hint s-export__path" dir="auto">{noteTitleOf(openPath)}</p>
            )}
          </div>

          {scope === "folder" && (
            <div className="s-mediaform__row">
              <span className="s-mediaform__label" id="s-export-folder-label">{t("exportFolder")}</span>
              <div className="s-mediaform__folderrow">
                <span className={`s-mediaform__folder${folder === "" ? " s-mediaform__folder--none" : ""}`} dir="auto" aria-labelledby="s-export-folder-label">
                  {folder === "" ? t("moveVaultRoot") : folder}
                </span>
                <button
                  type="button"
                  className="s-btn s-mediaform__unlink"
                  onClick={() => {
                    void pickFolder({ title: t("exportFolder"), current: folder }).then((picked) => {
                      if (picked !== null) setFolder(picked);
                    });
                  }}
                >
                  {t("exportChooseFolder")}
                </button>
              </div>
            </div>
          )}

          {scope === "tag" && (
            <label className="s-mediaform__row">
              <span className="s-mediaform__label">{t("tagLabelsTag")}</span>
              <input
                className="s-bmodal__input"
                type="text"
                dir="auto"
                list="s-export-tags"
                value={tag}
                placeholder={t("exportTagPlaceholder")}
                onChange={(e) => setTag(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <datalist id="s-export-tags">
                {tags.map((row) => (
                  <option key={row.tag} value={row.tag} />
                ))}
              </datalist>
            </label>
          )}

          <div className="s-mediaform__row">
            <span className="s-mediaform__label">{t("exportLinks")}</span>
            <SegmentedControl
              value={links}
              onChange={(v) => setLinks(v as ExportLinkStyle)}
              segments={[
                { value: "wiki", label: t("exportLinksWiki") },
                { value: "relative", label: t("exportLinksRelative") },
              ]}
              label={t("exportLinks")}
            />
            <p className="s-mediaform__hint">{t("exportLinksHint")}</p>
          </div>

          <div className="s-mediaform__row">
            <span className="s-mediaform__label">{t("groupAttachments")}</span>
            <Toggle
              value={attachments}
              onChange={setAttachments}
              label={t("groupAttachments")}
              onLabel={t("exportAttachmentsOn")}
              offLabel={t("exportAttachmentsOff")}
            />
          </div>

          {/* The dry run's line. `aria-live` so a keyboard reader hears the
              count change as the scope does, and the refusal when it comes. */}
          <p
            className={`s-export__preview${preview.kind === "error" ? " s-export__preview--bad" : ""}`}
            aria-live="polite"
            dir="auto"
          >
            {preview.kind === "counting" && t("loading")}
            {preview.kind === "ready" &&
              tf("exportPreview", {
                notes: countPhrase(preview.summary.notes, "notes"),
                files: countPhrase(preview.summary.attachments, "files"),
                size: formatSize(preview.summary.bytes),
              })}
            {preview.kind === "error" && preview.text}
          </p>

          {scope === "note" && openPath && <p className="s-mediaform__hint">{t("exportHtmlHint")}</p>}
        </div>

        <div className="s-mediaform__foot">
          <button type="button" className="s-btn" onClick={onClose}>
            {t("cancel")}
          </button>
          {scope === "note" && openPath && (
            <button type="button" className="s-btn" disabled={busy} onClick={() => void html()}>
              {t("exportHtml")}
            </button>
          )}
          <button type="submit" className="s-btn s-btn--accent" disabled={preview.kind !== "ready" || busy}>
            {t("exportDownload")}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Imperative mount — the theme picker's shape, for the theme picker's reason.
// ---------------------------------------------------------------------------

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function close(): void {
  if (!root || !host) return;
  const [r, h] = [root, host];
  root = null;
  host = null;
  // Unmount on a later tick: React refuses to unmount a root while it is
  // rendering, and this is called from inside the dialog's own handlers.
  setTimeout(() => {
    r.unmount();
    h.remove();
  }, 0);
}

export function mountExportDialog(preset: ExportPreset): void {
  if (host) return;
  host = document.createElement("div");
  host.className = "s-export-host";
  document.body.appendChild(host);
  root = createRoot(host);
  root.render(<ExportDialog preset={preset} onClose={close} />);
}
