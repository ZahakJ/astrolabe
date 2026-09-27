// COLLECTIONS — how the public site groups notes: categories from tags or from
// folders, and the owner's own hand-made collections. Instance-only. A page
// body (see ./TabBody.tsx); the library shelf, which shared this page until
// the second settings pass, is its own page (LibraryTab).
//
// ONE option with sub-options: a master switch on its own row, then
// everything it governs `off` and `disabled` beneath it. Labels are spelled
// out literally, each on its own line, because scripts/settings-index parses
// this file AS TEXT — a label built from a variable is a row the settings
// search cannot find.

import { useSettings } from "./context.ts";
import { t } from "../../i18n.ts";
import { SegmentedControl, Toggle } from "../controls/Fields.tsx";
import { Row } from "./Row.tsx";
import { PublicFolderEditor } from "./PublicFolderEditor.tsx";

export default function CollectionsTab() {
  const { form, setForm, errors, foldersOff } = useSettings();
  return (
    <section data-section="collections">
      <Row kind="segmented" label={t("rowTopicsMode")} hint={t("hintTopicsMode")}>
        <SegmentedControl
          label={t("rowTopicsMode")}
          value={form.topicsMode}
          segments={[
            { value: "tags", label: t("topicsModeTags"), note: t("topicsModeTagsNote") },
            { value: "folders", label: t("topicsModeFolders"), note: t("topicsModeFoldersNote") },
          ]}
          onChange={(v) => setForm((f) => (f ? { ...f, topicsMode: v } : f))}
        />
      </Row>
      {form.topicsMode === "folders" && <p className="s-smodal__offnote">{t("topicsModeFoldersNotice")}</p>}
      {/* COLLECTIONS BELONG TO THE TAGS SYSTEM: hand-made topics beside the
          tag topics. Under folders the folders ARE the categories and this
          whole block is gone — the owner met the two side by side as "kinda
          confusing". */}
      {form.topicsMode !== "folders" && (
        <>
          <Row kind="toggle" label={t("rowPublicFolders")} hint={t("hintPublicFolders")}>
            <Toggle
              label={t("rowPublicFolders")}
              value={form.publicFoldersOn === "on"}
              onChange={(on) => setForm((f) => (f ? { ...f, publicFoldersOn: on ? "on" : "off" } : f))}
            />
          </Row>
          {foldersOff && <p className="s-smodal__offnote">{t("publicFoldersOffNotice")}</p>}
          <Row kind="table" label={t("rowPublicFoldersList")} hint={t("hintPublicFoldersList")} error={errors.publicFolderRows} off={foldersOff}>
            <PublicFolderEditor
              rows={form.publicFolderRows}
              disabled={foldersOff}
              onChange={(rows) => setForm((f) => (f ? { ...f, publicFolderRows: rows } : f))}
            />
          </Row>
          {/* WHERE THE NOTES COME FROM, said once and in the place the
              question occurs: a table of folders with no members is a
              navigation to nothing, and nothing else on this page explains
              that membership is declared in the note. */}
          <p className="s-smodal__offnote">{t("publicFoldersFrontmatter")}</p>
        </>
      )}
      <Row kind="toggle" label={t("rowPublicFoldersHome")} hint={t("hintPublicFoldersHome")} off={foldersOff}>
        <Toggle
          label={t("rowPublicFoldersHome")}
          disabled={foldersOff}
          value={form.publicFoldersHome === "on"}
          onChange={(on) => setForm((f) => (f ? { ...f, publicFoldersHome: on ? "on" : "off" } : f))}
        />
      </Row>
      <Row kind="toggle" label={t("rowPublicFoldersNav")} hint={t("hintPublicFoldersNav")} off={foldersOff}>
        <Toggle
          label={t("rowPublicFoldersNav")}
          disabled={foldersOff}
          value={form.publicFoldersNav === "on"}
          onChange={(on) => setForm((f) => (f ? { ...f, publicFoldersNav: on ? "on" : "off" } : f))}
        />
      </Row>
    </section>
  );
}
