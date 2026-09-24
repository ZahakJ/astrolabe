// COLLECTIONS — how the public site groups notes: categories, custom public
// folders, the library shelf. Instance-only. A tab body (see ./TabBody.tsx),
// split out of SettingsModal.tsx (3.27.0) unchanged.

import { useSettings } from "./context.ts";
import { LIBRARY_SITE_TITLE_MAX } from "../../../shared/library.ts";
import { t } from "../../i18n.ts";
import { SegmentedControl, TextInput, Toggle } from "../controls/Fields.tsx";
import { Row } from "./Row.tsx";
import { LibraryRootsEditor, LibraryPathEditor } from "./LibraryEditors.tsx";
import { PublicFolderEditor } from "./PublicFolderEditor.tsx";

export default function CollectionsTab() {
  const { form, setForm, errors, foldersOff, libraryOff } = useSettings();
  return (
    <section data-section="collections">
      {/* ── CUSTOM PUBLIC FOLDERS ───────────────────────────
          ONE option with sub-options, the Backup tab's idiom: a
          master switch on its own row, then everything it governs
          `off` and `disabled` beneath it. The label is spelled out
          literally on its own line because scripts/settings-index
          parses this file AS TEXT (map-vault §2) — a label built
          from a variable is a row the settings search cannot find. */}
      <div className="s-smodal__sub">{t("groupPublicFolders")}</div>
      <p className="s-smodal__note">{t("publicFoldersNote")}</p>
      <Row label={t("rowTopicsMode")} hint={t("hintTopicsMode")} wide>
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
      {/* COLLECTIONS BELONG TO THE TAGS SYSTEM: hand-made topics
          beside the tag topics. Under folders the folders ARE the
          categories and this whole block is gone — the owner met
          the two side by side as "kinda confusing". */}
      {form.topicsMode !== "folders" && (
        <>
      <Row label={t("rowPublicFolders")} hint={t("hintPublicFolders")}>
        <Toggle
          label={t("rowPublicFolders")}
          onLabel={t("on")}
          offLabel={t("off")}
          value={form.publicFoldersOn === "on"}
          onChange={(on) =>
            setForm((f) => (f ? { ...f, publicFoldersOn: on ? "on" : "off" } : f))
          }
        />
      </Row>
      {foldersOff && <p className="s-smodal__offnote">{t("publicFoldersOffNotice")}</p>}
      <Row
        label={t("rowPublicFoldersList")}
        hint={t("hintPublicFoldersList")}
        error={errors.publicFolderRows}
        off={foldersOff}
        wide
      >
        <PublicFolderEditor
          rows={form.publicFolderRows}
          disabled={foldersOff}
          onChange={(rows) =>
            setForm((f) => (f ? { ...f, publicFolderRows: rows } : f))
          }
        />
      </Row>
      {/* WHERE THE NOTES COME FROM, said once and in the place the
          question occurs: a table of folders with no members is a
          navigation to nothing, and nothing else on this panel
          explains that membership is declared in the note. */}
      <p className="s-smodal__offnote">{t("publicFoldersFrontmatter")}</p>
        </>
      )}
      <Row label={t("rowPublicFoldersHome")} hint={t("hintPublicFoldersHome")} off={foldersOff}>
        <Toggle
          label={t("rowPublicFoldersHome")}
          onLabel={t("on")}
          offLabel={t("off")}
          disabled={foldersOff}
          value={form.publicFoldersHome === "on"}
          onChange={(on) =>
            setForm((f) => (f ? { ...f, publicFoldersHome: on ? "on" : "off" } : f))
          }
        />
      </Row>
      <Row label={t("rowPublicFoldersNav")} hint={t("hintPublicFoldersNav")} off={foldersOff}>
        <Toggle
          label={t("rowPublicFoldersNav")}
          onLabel={t("on")}
          offLabel={t("off")}
          disabled={foldersOff}
          value={form.publicFoldersNav === "on"}
          onChange={(on) =>
            setForm((f) => (f ? { ...f, publicFoldersNav: on ? "on" : "off" } : f))
          }
        />
      </Row>

      {/* ── THE LIBRARY ─────────────────────────────────────
          The collections' idiom again: a master switch, then
          what it governs beneath it. Spelled literally for the
          settings index, as above. */}
      <div className="s-smodal__sub">{t("groupLibrary")}</div>
      <p className="s-smodal__note">{t("libraryNote")}</p>
      <Row label={t("rowLibrary")} hint={t("hintLibrary")}>
        <Toggle
          label={t("rowLibrary")}
          onLabel={t("on")}
          offLabel={t("off")}
          value={form.libraryOn === "on"}
          onChange={(on) => setForm((f) => (f ? { ...f, libraryOn: on ? "on" : "off" } : f))}
        />
      </Row>
      {libraryOff && <p className="s-smodal__offnote">{t("libraryOffNotice")}</p>}
      <Row label={t("rowLibraryTitle")} hint={t("hintLibraryTitle")} error={errors.libraryTitle} off={libraryOff}>
        <TextInput
          value={form.libraryTitle}
          onChange={(v) => setForm((f) => (f ? { ...f, libraryTitle: v } : f))}
          placeholder={t("libraryTitle")}
          label={t("rowLibraryTitle")}
          disabled={libraryOff}
          dir="auto"
          maxLength={LIBRARY_SITE_TITLE_MAX}
        />
      </Row>
      <Row label={t("rowLibraryNav")} hint={t("hintLibraryNav")} off={libraryOff}>
        <Toggle
          label={t("rowLibraryNav")}
          onLabel={t("on")}
          offLabel={t("off")}
          disabled={libraryOff}
          value={form.libraryNav === "on"}
          onChange={(on) => setForm((f) => (f ? { ...f, libraryNav: on ? "on" : "off" } : f))}
        />
      </Row>
      <Row label={t("rowLibraryHome")} hint={t("hintLibraryHome")} off={libraryOff}>
        <Toggle
          label={t("rowLibraryHome")}
          onLabel={t("on")}
          offLabel={t("off")}
          disabled={libraryOff}
          value={form.libraryHome === "on"}
          onChange={(on) => setForm((f) => (f ? { ...f, libraryHome: on ? "on" : "off" } : f))}
        />
      </Row>
      {/* THE ROOTS COME BEFORE THE ROWS. The two placements are
          about the door; the roots are about the shelf, and the
          rows are the exceptions to the roots — so the general
          sentence is read before the twelve special ones. */}
      <Row label={t("rowLibraryRoots")} hint={t("hintLibraryRoots")} error={errors.libraryRoots} off={libraryOff} wide>
        <LibraryRootsEditor
          roots={form.libraryRoots}
          rows={form.libraryRows}
          disabled={libraryOff}
          onChange={(roots) => setForm((f) => (f ? { ...f, libraryRoots: roots } : f))}
          onRowsChange={(rows) => setForm((f) => (f ? { ...f, libraryRows: rows } : f))}
        />
      </Row>
      {/* No `error` here on purpose: the message belongs beside the
          field that broke, inside its own card (§ validate). */}
      <Row label={t("rowLibraryPaths")} hint={t("hintLibraryPaths")} off={libraryOff} wide>
        <LibraryPathEditor
          rows={form.libraryRows}
          roots={form.libraryRoots}
          disabled={libraryOff}
          onChange={(rows) => setForm((f) => (f ? { ...f, libraryRows: rows } : f))}
        />
      </Row>
    </section>
  );
}
