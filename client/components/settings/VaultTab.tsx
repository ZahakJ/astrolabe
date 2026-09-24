// VAULT — where this instance puts things: templates, periodic notes,
// attachments, the clipper, voice, the door a launch opens. A tab body (see
// ./TabBody.tsx), split out of SettingsModal.tsx (3.27.0) unchanged.

import { useSettings } from "./context.ts";
import { isAttachmentMode, modeUsesFolder } from "../../../shared/attachments.ts";
import { t, tf } from "../../i18n.ts";
import { SegmentedControl, TextInput, Toggle } from "../controls/Fields.tsx";
import { PathInput } from "../controls/PathInput.tsx";
import { Select } from "../controls/Select.tsx";
import { PeriodicForm } from "./PeriodicForm.tsx";
import { ClipperControl } from "./ClipperControl.tsx";
import { modelSize, VoiceEngineNote, voiceModelLabel } from "./VoiceEngineNote.tsx";
import { VOICE_MODELS } from "../../../shared/voice.ts";
import { Row } from "./Row.tsx";
import { FOLDER_MAX, enumLabel } from "./form.ts";

export default function VaultTab() {
  const { initial, pocket, form, setForm, errors, field, onOffSegments, eff, inh } = useSettings();
  return (
    <section data-section="vault">
      {/* WHERE THIS INSTANCE PUTS THINGS, all in one tab. Templates
          were filed under Publishing (a stencil carrying
          `publish: true` really does reach the post list) and
          attachments under it too, which meant an operator looking
          for "which folder does this write to" read a tab about
          comments and share buttons first. Three folder questions
          in one place answer each other; a folder filed by its
          consequence answers nobody. */}
      {pocket && <p className="s-smodal__offnote">{t("pocketVaultNotice")}</p>}
      <div className="s-smodal__sub">{t("templatesSection")}</div>
      <Row
        label={t("templatesFolderLabel")}
        hint={t("templatesFolderHint")}
      >
        <TextInput
          // The placeholder is the DETECTED folder when there is
          // one: an empty field beside a working feature has to
          // say what is in force, or the reader clears a folder
          // they never set and cannot tell what changed.
          placeholder={eff.templatesFolder ?? "Templates"}
          dir="ltr"
          label={t("templatesFolderLabel")}
          {...field("templatesFolder")}
        />
      </Row>
      {form.templatesFolder.trim() === "" && eff.templatesFolderDetected && eff.templatesFolder && (
        <p className="s-smodal__note">
          {tf("templatesDetectedHint", { folder: eff.templatesFolder })}
        </p>
      )}
      {/* The hadith corpus: a folder question on the templates
          folder's terms — detected when the vault names it, and
          the detected value printed rather than a blank field
          beside a feature that is quietly working. */}
      <Row locked={pocket} label={t("hadithFolderLabel")} hint={t("hadithFolderHint")} more={t("moreHadithFolder")}>
        <TextInput
          placeholder={eff.hadithFolder ?? "Corpus/hadith"}
          dir="ltr"
          label={t("hadithFolderLabel")}
          {...field("hadithFolder")}
        />
      </Row>
      {form.hadithFolder.trim() === "" && eff.hadithFolderDetected && eff.hadithFolder && (
        <p className="s-smodal__note">
          {tf("templatesDetectedHint", { folder: eff.hadithFolder })}
        </p>
      )}
      {/* The {{placeholder}} grammar rode as a paragraph over the
          whole section; it is the template FILE's reference and
          sits behind this row's ⓘ now. */}
      <Row label={t("defaultTemplateLabel")} hint={t("defaultTemplateHint")} more={t("templatePlaceholdersHint")}>
        <TextInput
          placeholder={eff.templatesFolder ? `${eff.templatesFolder}/Note.md` : "Templates/Note.md"}
          dir="ltr"
          label={t("defaultTemplateLabel")}
          {...field("defaultTemplate")}
        />
      </Row>
      {/* PERIODIC NOTES (shared/periodic.ts): the folder the
          four kinds share, and a name and a template for the
          day, the week, the month and the year. ONE row with a
          sub-form (settings/PeriodicForm.tsx) rather than nine:
          the tab holds eighteen rows and nine of them asking
          the same two questions is a table. The placeholders
          are what is in force, as the templates folder's is. */}
      <div className="s-smodal__sub">{t("periodicSection")}</div>
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
      {/* THE UNIQUE NOTE (client/uniqueNote.ts): the palette's
          "New unique note" stamps a name from the minute and
          asks nothing. Beside the periodic rows because it is
          the same idea — a note named by when — with a finer
          clock; the placeholders are what is in force. */}
      <Row label={t("uniqueFolderLabel")} hint={t("uniqueFolderHint")}>
        <TextInput placeholder={eff.uniqueFolder || t("vaultRoot")} dir="ltr" label={t("uniqueFolderLabel")} {...field("uniqueFolder")} />
      </Row>
      <Row label={t("uniqueFormatLabel")} hint={t("uniqueFormatHint")}>
        <TextInput placeholder={eff.uniqueFormat} dir="ltr" label={t("uniqueFormatLabel")} {...field("uniqueFormat")} />
      </Row>
      {/* CAPTURE (docs/capture.md): the two doors into the vault
          that do not start from a note. The inbox is the
          quick-capture sheet's second target, a note on the
          daily template's terms; the clipper is a bookmarklet
          and the token inside it, which lives in the data
          directory and never in the vault. Both are questions
          about where this instance PUTS things, like every row
          above. */}
      <div className="s-smodal__sub">{t("captureSection")}</div>
      <Row label={t("captureInboxLabel")} hint={t("captureInboxHint")} more={t("moreCaptureInbox")}>
        <TextInput placeholder="Inbox.md" dir="ltr" label={t("captureInboxLabel")} {...field("captureInbox")} />
      </Row>
      <Row locked={pocket} label={t("clipperLabel")} hint={t("clipperHint")} more={t("moreClipper")}>
        <ClipperControl siteName={eff.siteName} />
      </Row>
      {/* VOICE NOTES (docs/capture.md "Voice"): the model that
          turns a recording into words on THIS machine, and
          whether the recording stays once they have landed. The
          language pin is on the Language tab, with the other
          questions about which language a thing is in. A pocket
          vault runs no model and keeps every recording, so both
          rows are its locked facts. */}
      <Row locked={pocket} label={t("rowVoiceModel")} hint={t("hintVoiceModel")} more={t("moreVoiceModel")}>
        <Select
          label={t("rowVoiceModel")}
          options={[
            ...VOICE_MODELS.map((m) => ({ value: m.id, label: voiceModelLabel(m.id), note: modelSize(m.bytes) })),
            { value: "off", label: t("voiceModelOff") },
          ]}
          {...field("voiceModel")}
        />
      </Row>
      {!pocket && <VoiceEngineNote model={form.voiceModel} saved={initial?.voiceModel ?? ""} />}
      <Row locked={pocket} label={t("rowVoiceKeepAudio")} hint={t("hintVoiceKeepAudio")}>
        <Toggle
          label={t("rowVoiceKeepAudio")}
          onLabel={t("on")}
          offLabel={t("off")}
          value={form.voiceKeepAudio === "on"}
          onChange={(on) => setForm((f) => (f ? { ...f, voiceKeepAudio: on ? "on" : "off" } : f))}
        />
      </Row>
      {/* Where the sidebar's pencil files a drawing (the owner:
          "create the drawing in a specified space in settings or
          by default the root directory"). Beside the other two
          folder questions, for the reason they are together. */}
      <Row label={t("drawingsFolderLabel")} hint={t("drawingsFolderHint")}>
        <TextInput
          placeholder={t("vaultRoot")}
          dir="ltr"
          label={t("drawingsFolderLabel")}
          {...field("drawingsFolder")}
        />
      </Row>
      {/* OPEN ON LAUNCH (shared/launch.ts). Here rather than under
          This device because it is a fact about the vault, on the
          home note's precedent: what the day starts with follows
          the vault to the next machine. The session is restored
          underneath whichever door is chosen. */}
      <div className="s-smodal__sub">{t("launchSection")}</div>
      <Row label={t("rowLaunch")} hint={t("hintLaunch")}>
        <Select
          label={t("rowLaunch")}
          value={form.launch}
          onChange={(v) => setForm((f) => (f ? { ...f, launch: v } : f))}
          options={[
            { value: "resume", label: t("launchResume") },
            { value: "sigils", label: t("launchSigils") },
            { value: "orbits", label: t("launchOrbits") },
            { value: "today", label: t("launchToday") },
            { value: "note", label: t("launchNote") },
          ]}
        />
      </Row>
      {form.launch === "note" && (
        <Row label={t("rowLaunchNote")} hint={t("hintLaunchNote")}>
          <PathInput kind="note" placeholder="Home.md" label={t("rowLaunchNote")} {...field("launchNote")} />
        </Row>
      )}

      {/* Obsidian's "Default location for new attachments", named
          the same way so a migrating vault owner finds what they
          expect. Every upload path obeys it — editor paste and
          drop, the tree's file drop, the banner picker — and
          nothing already on disk moves when it changes.

          Beside Templates for the same reason Templates is here:
          both answer "where does this instance PUT things in the
          vault", and both are folders the operator will look for
          in one place. */}
      <div className="s-smodal__sub">{t("groupAttachments")}</div>
      <Row
        label={t("rowAttachmentLocation")}
        hint={t("hintAttachmentLocation")}
      >
        <Select
          label={t("rowAttachmentLocation")}
          value={form.attachMode}
          onChange={(v) => setForm((f) => (f ? { ...f, attachMode: v } : f))}
          options={[
            { value: "", label: t("inheritSegment"), note: enumLabel(inh.attachmentsMode) },
            { value: "vault-root", label: t("locVaultRoot") },
            { value: "same-folder", label: t("locSameFolder") },
            { value: "subfolder", label: t("locSubfolder") },
            { value: "specified", label: t("locSpecified") },
          ]}
        />
      </Row>
      {/* The folder field belongs to two of the four modes; under
          the other two it would be a control that quietly does
          nothing, so it is disabled rather than left to mislead. */}
      <Row
        label={t("rowAttachmentFolder")}
        hint={t(
          (form.attachMode || inh.attachmentsMode) === "subfolder"
            ? "hintAttachmentSubfolder"
            : "hintAttachmentFolder",
        )}
        error={errors.attachFolder}
        off={
          !modeUsesFolder(
            isAttachmentMode(form.attachMode) ? form.attachMode : inh.attachmentsMode,
          )
        }
      >
        <TextInput
          placeholder={eff.attachments.folder}
          maxLength={FOLDER_MAX + 1}
          dir="ltr"
          label={t("rowAttachmentFolder")}
          invalid={errors.attachFolder !== undefined}
          disabled={
            !modeUsesFolder(
              isAttachmentMode(form.attachMode)
                ? form.attachMode
                : inh.attachmentsMode,
            )
          }
          {...field("attachFolder")}
        />
      </Row>

      {/* The tag pages' folder, with the two folder rows above it
          rather than beside the LABELS table it used to sit on top
          of: this row answers "where does this instance write", and
          the table answers "what does a tag get called". They were
          one group because a page in this folder outranks the
          table — which is a sentence, and now it is one, in the
          table's own hint. */}
      <div className="s-smodal__sub">{t("tags")}</div>
      <Row
        label={t("rowTagsFolder")}
        hint={t("hintTagsFolder")}
      >
        <TextInput
          placeholder={eff.tagsFolder}
          dir="ltr"
          label={t("rowTagsFolder")}
          {...field("tagsFolder")}
        />
      </Row>
      {/* Same note the templates folder carries, from the same
          key: both fields auto-detect, so both have to SAY which
          folder they found — an empty field that silently means
          "2 - Tags" on this vault and "tags" on the next one is a
          field the reader cannot reason about. */}
      {form.tagsFolder.trim() === "" && eff.tagsFolderDetected && (
        <p className="s-smodal__note">
          {tf("templatesDetectedHint", { folder: eff.tagsFolder })}
        </p>
      )}

      {/* The net under the autosave. On this tab because it is a
          question about what this instance WRITES and where (the
          data directory), like every row above it — and not on
          Backup & sync, whose rows all describe a repository this
          row exists to do without. */}
      <div className="s-smodal__sub">{t("history")}</div>
      <Row
        locked={pocket}
        label={t("rowNoteVersions")}
        hint={t("hintNoteVersions")}
        more={t("moreNoteVersions")}
        env={{ name: "NOTE_VERSIONS", value: eff.noteVersions ? "on" : "off", inherits: form.noteVersions === "" }}
      >
        <SegmentedControl
          label={t("rowNoteVersions")}
          segments={onOffSegments(inh.noteVersions)}
          {...field("noteVersions")}
        />
      </Row>
      {/* The shelf's page text (server/pdfText.ts): whether the
          sidebar search reads the vault's PDFs. Filed here with the
          other questions about what this instance does with the
          vault's own files, and a three-way row like Comments
          because the middle state — "whatever PDF_SEARCH says" —
          is the row being empty, which a checkbox cannot be. */}
      <div className="s-smodal__sub">{t("libraryBooks")}</div>
      <Row
        locked={pocket}
        label={t("rowPdfSearch")}
        hint={t("hintPdfSearch")}
        env={{ name: "PDF_SEARCH", value: eff.pdfSearch ? "on" : "off", inherits: form.pdfSearch === "" }}
      >
        <SegmentedControl
          label={t("rowPdfSearch")}
          segments={onOffSegments(inh.pdfSearch)}
          {...field("pdfSearch")}
        />
      </Row>
    </section>
  );
}
