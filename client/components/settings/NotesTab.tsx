// NEW NOTES & TEMPLATES — where a new note starts from: the stencils, the one
// every new note starts from, the notes named by the calendar and the ones
// named by the minute, and the two doors into the vault that do not start from
// a note (quick capture's inbox, the clipper). A page body (see
// ./TabBody.tsx), split from Writing in the second settings pass.
//
// The placeholders are what is in force: an empty field beside a working
// feature has to say what it is using.

import { useSettings } from "./context.ts";
import { t, tf } from "../../i18n.ts";
import { TextInput } from "../controls/Fields.tsx";
import { PeriodicForm } from "./PeriodicForm.tsx";
import { ClipperControl } from "./ClipperControl.tsx";
import { UniqueNoteFields } from "./PairControls.tsx";
import { Row } from "./Row.tsx";

export default function NotesTab() {
  const { pocket, form, setForm, field, eff } = useSettings();
  return (
    <section data-section="notes">
      {pocket && <p className="s-smodal__offnote">{t("pocketVaultNotice")}</p>}
      <Row label={t("templatesFolderLabel")} hint={t("templatesFolderHint")}>
        {/* "Templates" is not copy: it is the folder's literal default name. */}
        <TextInput placeholder={eff.templatesFolder ?? "Templates"} dir="ltr" label={t("templatesFolderLabel")} {...field("templatesFolder")} />
      </Row>
      {form.templatesFolder.trim() === "" && eff.templatesFolderDetected && eff.templatesFolder && (
        <p className="s-smodal__note">{tf("templatesDetectedHint", { folder: eff.templatesFolder })}</p>
      )}
      {/* The {{placeholder}} grammar is the template FILE's reference, and
          sits behind this row's ⓘ. */}
      <Row label={t("defaultTemplateLabel")} hint={t("defaultTemplateHint")} more={t("templatePlaceholdersHint")}>
        <TextInput
          placeholder={eff.templatesFolder ? `${eff.templatesFolder}/Note.md` : "Templates/Note.md"}
          dir="ltr"
          label={t("defaultTemplateLabel")}
          {...field("defaultTemplate")}
        />
      </Row>
      {/* PERIODIC NOTES (shared/periodic.ts): ONE row with a sub-form rather
          than nine — nine rows asking the same two questions is a table. */}
      <Row label={t("periodicRowLabel")} hint={t("periodicRowHint")} more={t("periodicFormatNote")} wide>
        <PeriodicForm
          form={form}
          inForce={{
            dailyFolder: eff.dailyFolder,
            templatesFolder: eff.templatesFolder,
            formats: { day: eff.dailyFormat, week: eff.weeklyFormat, month: eff.monthlyFormat, year: eff.yearlyFormat },
          }}
          onChange={(key, value) => setForm((f) => (f ? { ...f, [key]: value } : f))}
        />
      </Row>
      {/* THE UNIQUE NOTE (client/uniqueNote.ts): the same idea as the periodic
          notes — a note named by when — with a finer clock. One row, two
          fields: where a minute-named note goes, and what it is called. */}
      <Row label={t("uniqueRowLabel")} hint={t("uniqueFolderHint")} more={t("uniqueFormatHint")} wide>
        <UniqueNoteFields folder={field("uniqueFolder")} format={field("uniqueFormat")} folderInForce={eff.uniqueFolder} formatInForce={eff.uniqueFormat} vaultRoot={t("vaultRoot")} />
      </Row>

      {/* CAPTURE (docs/capture.md): the quick capture sheet's inbox, and the
          clipper — a bookmarklet and the token inside it, which lives in the
          data directory and never in the vault. The import wizard is not a
          row; its doors are named in the note. */}
      {!pocket && <p className="s-smodal__note">{t("importDoorsNote")}</p>}
      <Row label={t("captureInboxLabel")} hint={t("captureInboxHint")} more={t("moreCaptureInbox")}>
        <TextInput placeholder="Inbox.md" dir="ltr" label={t("captureInboxLabel")} {...field("captureInbox")} />
      </Row>
      <Row locked={pocket} label={t("clipperLabel")} hint={t("clipperHint")} more={t("moreClipper")}>
        <ClipperControl siteName={eff.siteName} />
      </Row>
    </section>
  );
}
