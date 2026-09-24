// THE IMPORT WIZARD (docs/import.md): Notion, Evernote or Obsidian, in three
// steps — choose, preview, commit — and an undo after.
//
// One dialog for both shells: it wears the Media form's frame (`.s-mediaform`,
// client/styles/media.css) and is raised by a store flag (`importFolder`), so
// the desktop mounts it in App.tsx and the phone as one of its layers, where
// Back closes it like any sheet. Its doors are the palette ("Import notes…"),
// a folder's ⋯ in the sidebar ("Import notes here…", which fills the target
// folder in) and a row under More on the phone. It is not a Settings row: the
// Vault tab holds eighteen rows, and it says where the doors are instead.
//
// NOTHING IS WRITTEN UNTIL COMMIT. The preview is the server's plan, counted:
// notes, attachments, links rewritten, every collision with where it goes
// instead, the frontmatter it writes. Commit streams its progress; the undo
// that follows takes back every file the import wrote that has not been
// edited since.

import { useRef, useState, type ChangeEvent } from "react";
import { IMPORT_FOLDER_DEFAULT, type ImportPreview, type ImportSourceKind } from "../../shared/importPlan.ts";
import { NOTES_IMPORT_MAX_MB } from "../../shared/limits.ts";
import { useDialog } from "../a11y.ts";
import { SegmentedControl, TextInput } from "../components/controls/Fields.tsx";
import { countPhrase, localeNum, t, tf, type I18nKey } from "../i18n.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { commitImport, previewImport, undoImport, type ImportInput } from "./api.ts";
import "../styles/media.css";
import "../styles/import.css";

const SOURCES: Array<{ value: ImportSourceKind; label: I18nKey; hint: I18nKey; accept: string }> = [
  { value: "notion", label: "importNotion", hint: "importNotionHint", accept: ".zip" },
  { value: "evernote", label: "importEvernote", hint: "importEvernoteHint", accept: ".enex" },
  { value: "obsidian", label: "importObsidian", hint: "importObsidianHint", accept: ".zip" },
];

type Step = { kind: "choose" } | { kind: "preview"; preview: ImportPreview } | { kind: "running"; done: number; total: number; path: string } | { kind: "done"; undoId: string; notes: string[]; attachments: number; folder: string } | { kind: "undone"; removed: number; kept: string[] };

function refreshVault(): void {
  const s = useStore.getState();
  void s.loadTree();
  void s.refreshBacklinks();
}

export default function ImportDialog() {
  const initialFolder = useStore((s) => s.importFolder);
  const close = (): void => useStore.getState().closeImport();
  useStore((s) => s.language);
  const [source, setSource] = useState<ImportSourceKind>("notion");
  const [folder, setFolder] = useState(initialFolder && initialFolder !== "" ? initialFolder : IMPORT_FOLDER_DEFAULT);
  const [input, setInput] = useState<ImportInput | null>(null);
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const dirRef = useRef<HTMLInputElement | null>(null);
  useDialog(panel, { onEscape: () => step.kind !== "running" && close() });
  const spec = SOURCES.find((s) => s.value === source)!;

  const pickFile = (e: ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0];
    setError(null);
    setInput(f ? { kind: "file", file: f } : null);
  };
  const pickDir = (e: ChangeEvent<HTMLInputElement>): void => {
    const list = [...(e.target.files ?? [])];
    setError(null);
    setInput(list.length > 0 ? { kind: "folder", files: list.map((file) => ({ file, path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name })) } : null);
  };

  const preview = async (): Promise<void> => {
    if (input === null) {
      setError(t("importPickFirst"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setStep({ kind: "preview", preview: await previewImport(source, folder.trim(), input) });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("importPreviewFailed"));
    } finally {
      setBusy(false);
    }
  };

  const commit = async (plan: ImportPreview): Promise<void> => {
    setStep({ kind: "running", done: 0, total: plan.notes + plan.attachments, path: "" });
    setError(null);
    try {
      const done = await commitImport(plan.planId, (line) => {
        if (line.type === "progress") setStep({ kind: "running", done: line.done, total: line.total, path: line.path });
      });
      setStep({ kind: "done", undoId: done.undoId, notes: done.notes, attachments: done.attachments.length, folder: plan.folder });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("importCommitFailed"));
      setStep({ kind: "preview", preview: plan });
    } finally {
      refreshVault();
    }
  };

  const undo = async (undoId: string): Promise<void> => {
    setBusy(true);
    try {
      const back = await undoImport(undoId);
      setStep({ kind: "undone", removed: back.removed.length, kept: back.kept });
      refreshVault();
    } catch (err) {
      toast(err instanceof Error && err.message ? err.message : t("importUndoFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const running = step.kind === "running";
  return (
    <div className="s-palette-overlay s-import-overlay" onMouseDown={() => !running && close()}>
      <div ref={panel} className="s-mediaform s-import" role="dialog" aria-modal="true" aria-label={t("importTitle")} onMouseDown={(e) => e.stopPropagation()} data-testid="import-dialog">
        <div className="s-mediaform__head">
          <h2 className="s-mediaform__title">{t("importTitle")}</h2>
          <button type="button" className="s-mediaform__close" onClick={close} aria-label={t("close")} disabled={running}>
            ×
          </button>
        </div>

        <div className="s-mediaform__body" aria-live="polite">
          {step.kind === "choose" && (
            <>
              <div className="s-mediaform__row">
                <span className="s-mediaform__label">{t("importSource")}</span>
                <SegmentedControl
                  value={source}
                  onChange={(v) => {
                    setSource(v as ImportSourceKind);
                    setInput(null);
                  }}
                  segments={SOURCES.map((s) => ({ value: s.value, label: t(s.label) }))}
                  label={t("importSource")}
                />
                <p className="s-mediaform__hint">{t(spec.hint)}</p>
              </div>
              <div className="s-mediaform__row">
                <span className="s-mediaform__label">{t("importFile")}</span>
                <div className="s-import__pick">
                  <button type="button" className="s-btn s-mediaform__upload" onClick={() => fileRef.current?.click()} data-testid="import-pick-file">
                    {input?.kind === "file" ? input.file.name : source === "evernote" ? t("importChooseEnex") : t("importChooseZip")}
                  </button>
                  {source === "obsidian" && (
                    <button type="button" className="s-btn s-mediaform__upload" onClick={() => dirRef.current?.click()}>
                      {input?.kind === "folder" ? tf("importFolderPicked", { n: countPhrase(input.files.length, "files") }) : t("importChooseFolder")}
                    </button>
                  )}
                </div>
                <input ref={fileRef} type="file" accept={spec.accept} hidden onChange={pickFile} aria-label={t("importFile")} data-testid="import-file" />
                <input ref={dirRef} type="file" hidden multiple onChange={pickDir} aria-label={t("importChooseFolder")} {...({ webkitdirectory: "" } as Record<string, string>)} />
                <p className="s-mediaform__hint">{tf("importCap", { mb: localeNum(NOTES_IMPORT_MAX_MB) })}</p>
              </div>
              <label className="s-mediaform__row">
                <span className="s-mediaform__label">{t("importFolder")}</span>
                <TextInput value={folder} onChange={setFolder} label={t("importFolder")} maxLength={180} dir="auto" placeholder={t("vaultRoot")} />
                <p className="s-mediaform__hint">{t("importFolderHint")}</p>
              </label>
            </>
          )}

          {step.kind === "preview" && <PreviewSummary preview={step.preview} />}

          {step.kind === "running" && (
            <div className="s-import__progress" data-testid="import-progress">
              <progress max={Math.max(1, step.total)} value={step.done} aria-label={t("importWriting")} />
              <p className="s-mediaform__hint">{tf("importProgress", { done: localeNum(step.done), total: localeNum(step.total) })}</p>
              {step.path && (
                <p className="s-import__path" dir="auto">
                  {step.path}
                </p>
              )}
            </div>
          )}

          {step.kind === "done" && (
            <div className="s-import__done" data-testid="import-done">
              <p>{tf("importDone", { notes: countPhrase(step.notes.length, "notes"), files: countPhrase(step.attachments, "files"), folder: step.folder || t("vaultRoot") })}</p>
              <p className="s-mediaform__hint">{t("importDoneHint")}</p>
            </div>
          )}

          {step.kind === "undone" && (
            <div className="s-import__done" data-testid="import-undone">
              <p>{tf("importUndone", { n: countPhrase(step.removed, "files") })}</p>
              {step.kept.length > 0 && (
                <>
                  <p className="s-mediaform__hint">{tf("importUndoKept", { n: countPhrase(step.kept.length, "files") })}</p>
                  <ul className="s-import__list">
                    {step.kept.map((p) => (
                      <li key={p} dir="auto">
                        {p}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {error && (
            <p className="s-mediaform__error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="s-mediaform__foot">
          {step.kind === "choose" && (
            <>
              <button type="button" className="s-btn" onClick={close}>
                {t("cancel")}
              </button>
              <button type="button" className="s-btn s-btn--accent" onClick={() => void preview()} disabled={busy} data-testid="import-preview">
                {busy ? t("importReading") : t("importPreview")}
              </button>
            </>
          )}
          {step.kind === "preview" && (
            <>
              <button type="button" className="s-btn" onClick={() => setStep({ kind: "choose" })}>
                {t("importBack")}
              </button>
              <button type="button" className="s-btn s-btn--accent" onClick={() => void commit(step.preview)} data-testid="import-commit">
                {tf("importCommit", { n: countPhrase(step.preview.notes, "notes") })}
              </button>
            </>
          )}
          {step.kind === "done" && (
            <>
              <button type="button" className="s-btn" onClick={() => void undo(step.undoId)} disabled={busy} data-testid="import-undo">
                {t("importUndo")}
              </button>
              <button type="button" className="s-btn s-btn--accent" onClick={close}>
                {t("importClose")}
              </button>
            </>
          )}
          {step.kind === "undone" && (
            <button type="button" className="s-btn s-btn--accent" onClick={close}>
              {t("importClose")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewSummary({ preview }: { preview: ImportPreview }) {
  const fm = preview.frontmatter;
  return (
    <div className="s-import__preview" data-testid="import-summary">
      <p className="s-import__lead">{tf("importWillWrite", { notes: countPhrase(preview.notes, "notes"), files: countPhrase(preview.attachments, "files"), folder: preview.folder || t("vaultRoot") })}</p>
      <ul className="s-import__facts">
        <li>{tf("importLinks", { n: countPhrase(preview.links, "links") })}</li>
        {preview.attachments > 0 && <li>{tf("importAttachmentsTo", { folder: preview.attachmentsFolder || t("vaultRoot") })}</li>}
        <li>{tf("importFrontmatter", { props: localeNum(fm.properties), tags: localeNum(fm.tags), created: localeNum(fm.created), aliases: localeNum(fm.aliases) })}</li>
        {fm.publishCleared > 0 && <li>{tf("importPublishCleared", { n: countPhrase(fm.publishCleared, "notes") })}</li>}
        <li>{t("importPrivate")}</li>
      </ul>
      {preview.collisions.length > 0 && (
        <section className="s-import__section">
          <h3 className="s-import__h">{tf("importCollisions", { n: localeNum(preview.collisions.length) })}</h3>
          <ul className="s-import__list">
            {preview.collisions.map((c) => (
              <li key={c.source} dir="auto">
                <bdi>{c.wanted}</bdi> → <bdi>{c.target}</bdi> <span className="s-import__why">({t(c.reason === "exists" ? "importCollisionExists" : "importCollisionDuplicate")})</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="s-import__section">
        <h3 className="s-import__h">{t("importSample")}</h3>
        <ul className="s-import__list">
          {preview.sample.map((p) => (
            <li key={p} dir="auto">
              {p}
            </li>
          ))}
          {preview.notes > preview.sample.length && <li>{tf("importAndMore", { n: localeNum(preview.notes - preview.sample.length) })}</li>}
        </ul>
      </section>
      {preview.skipped.length > 0 && (
        <details className="s-import__section">
          <summary className="s-import__h">{tf("importSkipped", { n: countPhrase(preview.skipped.length, "files") })}</summary>
          <ul className="s-import__list">
            {preview.skipped.slice(0, 50).map((s) => (
              <li key={s.path} dir="auto">
                {s.path}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
