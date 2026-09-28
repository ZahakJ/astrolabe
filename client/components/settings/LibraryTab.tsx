// LIBRARY — the public shelf of books, courses and lecture series: whether it
// shows, what it is called, where its door is, and which folders fill it.
// Instance-only. A page body (see ./TabBody.tsx), split from Collections in
// the second settings pass. The collections' idiom again: a master switch,
// then what it governs beneath it, labels spelled literally for the index.

import { useSettings } from "./context.ts";
import { LIBRARY_SITE_TITLE_MAX } from "../../../shared/library.ts";
import { t } from "../../i18n.ts";
import { TextInput, Toggle } from "../controls/Fields.tsx";
import { Row } from "./Row.tsx";
import { LibraryRootsEditor, LibraryPathEditor } from "./LibraryEditors.tsx";

export default function LibraryTab() {
  const { form, setForm, errors, libraryOff } = useSettings();
  return (
    <section data-section="library">
      <Row kind="toggle" label={t("rowLibrary")} hint={t("hintLibrary")} more={t("libraryNote")}>
        <Toggle
          label={t("rowLibrary")}
          value={form.libraryOn === "on"}
          onChange={(on) => setForm((f) => (f ? { ...f, libraryOn: on ? "on" : "off" } : f))}
        />
      </Row>
      {libraryOff && <p className="s-smodal__offnote">{t("libraryOffNotice")}</p>}
      <Row kind="text" label={t("rowLibraryTitle")} hint={t("hintLibraryTitle")} error={errors.libraryTitle} off={libraryOff}>
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
      <Row kind="toggle" label={t("rowLibraryNav")} hint={t("hintLibraryNav")} off={libraryOff}>
        <Toggle
          label={t("rowLibraryNav")}
          disabled={libraryOff}
          value={form.libraryNav === "on"}
          onChange={(on) => setForm((f) => (f ? { ...f, libraryNav: on ? "on" : "off" } : f))}
        />
      </Row>
      <Row kind="toggle" label={t("rowLibraryHome")} hint={t("hintLibraryHome")} off={libraryOff}>
        <Toggle
          label={t("rowLibraryHome")}
          disabled={libraryOff}
          value={form.libraryHome === "on"}
          onChange={(on) => setForm((f) => (f ? { ...f, libraryHome: on ? "on" : "off" } : f))}
        />
      </Row>
      {/* THE ROOTS COME BEFORE THE ROWS. The two placements are about the
          door; the roots are about the shelf, and the rows are the exceptions
          to the roots — so the general sentence is read before the twelve
          special ones. */}
      <Row kind="table" label={t("rowLibraryRoots")} hint={t("hintLibraryRoots")} error={errors.libraryRoots} off={libraryOff}>
        <LibraryRootsEditor
          roots={form.libraryRoots}
          rows={form.libraryRows}
          disabled={libraryOff}
          onChange={(roots) => setForm((f) => (f ? { ...f, libraryRoots: roots } : f))}
          onRowsChange={(rows) => setForm((f) => (f ? { ...f, libraryRows: rows } : f))}
        />
      </Row>
      {/* No `error` here on purpose: the message belongs beside the field
          that broke, inside its own card (§ validate). */}
      <Row kind="table" label={t("rowLibraryPaths")} hint={t("hintLibraryPaths")} off={libraryOff}>
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
