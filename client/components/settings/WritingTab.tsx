// WRITING — how the editor opens and behaves, and where uploaded files and tag
// pages go. A page body (see ./TabBody.tsx).
//
// Before the second settings pass this page also held templates, the periodic
// notes' table, the unique note and both capture doors — five subjects under
// ALL-CAPS subheads. Those are New notes & templates now; Vim keys, a
// per-device key map, went to This device. What is left is the vault's own
// editing rules plus the two per-device switches a writer reaches for (each
// marked: they save as they change, here only).

import { useSettings } from "./context.ts";
import { isAttachmentMode, modeUsesFolder } from "../../../shared/attachments.ts";
import { t, tf } from "../../i18n.ts";
import { TextInput, Toggle } from "../controls/Fields.tsx";
import { PathInput } from "../controls/PathInput.tsx";
import { Select } from "../controls/Select.tsx";
import { selectionToolbarEnabled, setSelectionToolbarEnabled } from "../SelectionMenu.tsx";
import { FRENCH_AUTOCORRECT_EVENT, frenchAutocorrectEnabled, setFrenchAutocorrectEnabled } from "../../frenchPref.ts";
import { TagLabelEditor } from "./TagLabelEditor.tsx";
import { useEventPref } from "./devicePrefs.ts";
import { Advanced } from "./Fold.tsx";
import { Part, Parts, Row } from "./Row.tsx";
import { FOLDER_MAX, enumLabel } from "./form.ts";

export default function WritingTab() {
  const { pocket, form, setForm, errors, field, eff, inh } = useSettings();
  const toolbar = useEventPref("astrolabe:seltoolbar", selectionToolbarEnabled);
  const french = useEventPref(FRENCH_AUTOCORRECT_EVENT, frenchAutocorrectEnabled);
  const attachMode = isAttachmentMode(form.attachMode) ? form.attachMode : inh.attachmentsMode;
  const bySubfolder = attachMode === "subfolder";
  return (
    <section data-section="writing">
      {pocket && <p className="s-smodal__offnote">{t("pocketVaultNotice")}</p>}
      {/* OPEN ON LAUNCH (shared/launch.ts): a fact about the vault, on the home
          note's precedent — what the day starts with follows the vault to the
          next machine, which is why it is here and not on This device. The
          session is restored underneath whichever door is chosen. The note
          path is a part of the row: it means something only while "A note"
          is the answer. */}
      <Row kind="select" label={t("rowLaunch")} hint={t("hintLaunch")}>
        <Parts>
          <Select
            label={t("rowLaunch")}
            value={form.launch}
            onChange={(v) => setForm((f) => (f ? { ...f, launch: v } : f))}
            options={[
              { value: "resume", label: t("launchResume") },
              { value: "sigils", label: t("launchSigils") },
              { value: "orbits", label: t("launchOrbits") },
              { value: "today-page", label: t("launchTodayPage") },
              { value: "today", label: t("launchToday") },
              { value: "note", label: t("launchNote") },
            ]}
          />
          {form.launch === "note" && (
            <Part kind="path" label={t("rowLaunchNote")} hint={t("hintLaunchNote")}>
              <PathInput kind="note" pickable placeholder="Home.md" label={t("rowLaunchNote")} {...field("launchNote")} />
            </Part>
          )}
        </Parts>
      </Row>
      {/* THE LABEL IS THE THING, THE HINT SAYS WHAT ON DOES. The status bar's
          pill and the palette row flip the same values; this is simply the
          place a reader who has met neither can find them. */}
      <Row kind="toggle" device label={t("selToolbarLabel")} hint={t("hintSelToolbar")}>
        <Toggle label={t("selToolbarLabel")} value={toolbar} onChange={setSelectionToolbarEnabled} />
      </Row>
      {/* FRENCH, CORRECTED AS YOU TYPE — on by default, because the person who
          asked for it writes French (client/frenchPref.ts). The hint carries
          what it changes and that one undo takes it back; the ⓘ, the list. */}
      <Row kind="toggle" device label={t("rowFrenchAutocorrect")} hint={t("hintFrenchAutocorrect")} more={t("moreFrenchAutocorrect")}>
        <Toggle label={t("rowFrenchAutocorrect")} value={french} onChange={setFrenchAutocorrectEnabled} />
      </Row>
      {/* THE PROPERTIES CARD, and whether it is drawn at all: the owner's
          "make it possible to disable the properties block". Off hides it in
          the owner's editor and reading view and never a visitor's (client/
          propsCard.ts); a right-click on the card says the same thing and
          its toast names this row. The card on a note with nothing in its
          frontmatter yet is a PART — it means something only while there is
          a card to draw — shown by default (the owner: "should prob show by
          default on all created notes") for the reader who wants a bare page
          to switch off. */}
      <Row kind="toggle" label={t("rowPropsCard")} hint={t("hintPropsCard")}>
        <Parts>
          <Toggle
            label={t("rowPropsCard")}
            value={form.propsCard !== "off"}
            onChange={(on) => setForm((f) => (f ? { ...f, propsCard: on ? "on" : "off" } : f))}
          />
          {form.propsCard !== "off" && (
            <Part kind="toggle" label={t("rowEmptyPropsCard")} hint={t("hintEmptyPropsCard")}>
              <Toggle
                label={t("rowEmptyPropsCard")}
                value={form.emptyPropsCard !== "off"}
                onChange={(on) => setForm((f) => (f ? { ...f, emptyPropsCard: on ? "on" : "off" } : f))}
              />
            </Part>
          )}
        </Parts>
      </Row>

      {/* Obsidian's "Default location for new attachments", named the same
          way so a migrating vault owner finds what they expect. Every upload
          obeys it and nothing already on disk moves when it changes. The
          folder is a PART: it belongs to two of the four modes. */}
      <Row kind="select" label={t("rowAttachmentLocation")} hint={t("hintAttachmentLocation")} error={errors.attachFolder}>
        <Parts>
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
          {modeUsesFolder(attachMode) && (
            <Part kind="path" label={t("rowAttachmentFolder")} hint={t(bySubfolder ? "hintAttachmentSubfolder" : "hintAttachmentFolder")}>
              {/* A vault folder in "specified" mode, which the vault can
                  offer; in "subfolder" mode a NAME made under each note's own
                  folder, which no list of the vault's folders answers. */}
              {bySubfolder ? (
                <TextInput
                  placeholder={eff.attachments.folder}
                  maxLength={FOLDER_MAX + 1}
                  dir="ltr"
                  label={t("rowAttachmentFolder")}
                  invalid={errors.attachFolder !== undefined}
                  {...field("attachFolder")}
                />
              ) : (
                <PathInput
                  kind="folder"
                  pickable
                  placeholder={eff.attachments.folder}
                  maxLength={FOLDER_MAX + 1}
                  label={t("rowAttachmentFolder")}
                  invalid={errors.attachFolder !== undefined}
                  {...field("attachFolder")}
                />
              )}
            </Part>
          )}
        </Parts>
      </Row>
      {/* The tag pages' folder answers "where does this instance write", and
          the labels table "what does a tag get called" — the table's hint
          says which one wins. */}
      <Row kind="path" label={t("rowTagsFolder")} hint={t("hintTagsFolder")}>
        <PathInput kind="folder" pickable placeholder={eff.tagsFolder} label={t("rowTagsFolder")} {...field("tagsFolder")} />
      </Row>
      {form.tagsFolder.trim() === "" && eff.tagsFolderDetected && (
        <p className="s-smodal__note">{tf("templatesDetectedHint", { folder: eff.tagsFolder })}</p>
      )}
      {/* DISPLAY ONLY: the vault keeps its canonical tags, the URLs keep
          canonical slugs, and search answers to both — which is the ⓘ. */}
      <Row kind="table" label={t("tagLabelsRowLabel")} hint={t("tagLabelsPageWins")} more={t("tagLabelsNote")}>
        <TagLabelEditor rows={form.tagLabels} onChange={(rows) => setForm((f) => (f ? { ...f, tagLabels: rows } : f))} />
      </Row>

      <Advanced tab="writing">
        {/* Where the sidebar's pencil files a drawing (the owner: "create the
            drawing in a specified space in settings or by default the root
            directory"). */}
        <Row kind="path" label={t("drawingsFolderLabel")} hint={t("drawingsFolderHint")}>
          <PathInput kind="folder" pickable placeholder={t("vaultRoot")} label={t("drawingsFolderLabel")} {...field("drawingsFolder")} />
        </Row>
      </Advanced>
    </section>
  );
}
