// WRITING — how the editor behaves, and where new notes and files go. A tab
// body (see ./TabBody.tsx).
//
// Before the settings purge these rows were split between "This device" (the
// editor's switches, because they are kept in this browser) and "Vault" (the
// folders, because they name folders). A reader does not arrive asking where a
// value is stored; they arrive asking "how do I make new notes start from a
// template" or "where do my pasted images go". So: what the app opens on and
// how the editor behaves first, then where new notes come from, the two doors
// into the vault that do not start from a note, and where files and tags live.
// Vim and the drawings folder — set once by the few who want them — sit
// behind the Advanced line at the foot.

import { useSettings } from "./context.ts";
import { isAttachmentMode, modeUsesFolder } from "../../../shared/attachments.ts";
import { t, tf } from "../../i18n.ts";
import { useStore } from "../../state.ts";
import { TextInput, Toggle } from "../controls/Fields.tsx";
import { PathInput } from "../controls/PathInput.tsx";
import { Select } from "../controls/Select.tsx";
import { selectionToolbarEnabled, setSelectionToolbarEnabled } from "../SelectionMenu.tsx";
import { FRENCH_AUTOCORRECT_EVENT, frenchAutocorrectEnabled, setFrenchAutocorrectEnabled } from "../../frenchPref.ts";
import { PeriodicForm } from "./PeriodicForm.tsx";
import { ClipperControl } from "./ClipperControl.tsx";
import { UniqueNoteFields } from "./PairControls.tsx";
import { TagLabelEditor } from "./TagLabelEditor.tsx";
import { useEventPref } from "./devicePrefs.ts";
import { Advanced } from "./Fold.tsx";
import { Part, Parts, Row } from "./Row.tsx";
import { FOLDER_MAX, enumLabel } from "./form.ts";

export default function WritingTab() {
  const { pocket, form, setForm, errors, field, eff, inh } = useSettings();
  const vimMode = useStore((s) => s.vimMode);
  const toggleVim = useStore((s) => s.toggleVim);
  const relativeLines = useStore((s) => s.relativeLines);
  const toggleRelativeLines = useStore((s) => s.toggleRelativeLines);
  const toolbar = useEventPref("astrolabe:seltoolbar", selectionToolbarEnabled);
  const french = useEventPref(FRENCH_AUTOCORRECT_EVENT, frenchAutocorrectEnabled);
  const attachMode = isAttachmentMode(form.attachMode) ? form.attachMode : inh.attachmentsMode;
  const bySubfolder = attachMode === "subfolder";
  return (
    <section data-section="writing">
      {pocket && <p className="s-smodal__offnote">{t("pocketVaultNotice")}</p>}
      {/* OPEN ON LAUNCH (shared/launch.ts): a fact about the vault, on the home
          note's precedent — what the day starts with follows the vault to the
          next machine. The session is restored underneath whichever door is
          chosen. The note path is a part of the row: it means something only
          while "A note" is the answer. */}
      <Row label={t("rowLaunch")} hint={t("hintLaunch")}>
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
            <Part label={t("rowLaunchNote")} hint={t("hintLaunchNote")}>
              <PathInput kind="note" placeholder="Home.md" label={t("rowLaunchNote")} {...field("launchNote")} />
            </Part>
          )}
        </Parts>
      </Row>
      {/* THE LABEL IS THE THING, THE HINT SAYS WHAT ON DOES. The status bar's
          pill and the palette row flip the same values; this is simply the
          place a reader who has met neither can find them. */}
      <Row device label={t("selToolbarLabel")} hint={t("hintSelToolbar")}>
        <Toggle label={t("selToolbarLabel")} onLabel={t("on")} offLabel={t("off")} value={toolbar} onChange={setSelectionToolbarEnabled} />
      </Row>
      {/* FRENCH, CORRECTED AS YOU TYPE — on by default, because the person who
          asked for it writes French (client/frenchPref.ts). The hint carries
          what it changes and that one undo takes it back; the ⓘ, the list. */}
      <Row device label={t("rowFrenchAutocorrect")} hint={t("hintFrenchAutocorrect")} more={t("moreFrenchAutocorrect")}>
        <Toggle label={t("rowFrenchAutocorrect")} onLabel={t("on")} offLabel={t("off")} value={french} onChange={setFrenchAutocorrectEnabled} />
      </Row>
      {/* The card on a note with nothing in its frontmatter yet: shown by
          default (the owner: "should prob show by default on all created
          notes"), with the switch here for the reader who wants a bare page. */}
      {/* A switch like its neighbours (it was a two-segment On/Off, the one
          two-state row in the panel not drawn as a switch). */}
      <Row label={t("rowEmptyPropsCard")} hint={t("hintEmptyPropsCard")}>
        <Toggle
          label={t("rowEmptyPropsCard")}
          onLabel={t("on")}
          offLabel={t("off")}
          value={form.emptyPropsCard !== "off"}
          onChange={(on) => setForm((f) => (f ? { ...f, emptyPropsCard: on ? "on" : "off" } : f))}
        />
      </Row>

      {/* ── New notes ───────────────────────────────────────────────────────
          Where a note comes from: the stencils, the one every new note starts
          from, the notes named by the calendar and the ones named by the
          minute. The placeholders are what is in force: an empty field beside
          a working feature has to say what it is using. */}
      <div className="s-smodal__sub">{t("groupNewNotes")}</div>
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

      {/* ── Capture (docs/capture.md) ───────────────────────────────────────
          The two doors into the vault that do not start from a note: the quick
          capture sheet's inbox, and the clipper — a bookmarklet and the token
          inside it, which lives in the data directory and never in the vault.
          The import wizard is not a row; its doors are named in the note. */}
      <div className="s-smodal__sub">{t("captureSection")}</div>
      {!pocket && <p className="s-smodal__note">{t("importDoorsNote")}</p>}
      <Row label={t("captureInboxLabel")} hint={t("captureInboxHint")} more={t("moreCaptureInbox")}>
        <TextInput placeholder="Inbox.md" dir="ltr" label={t("captureInboxLabel")} {...field("captureInbox")} />
      </Row>
      <Row locked={pocket} label={t("clipperLabel")} hint={t("clipperHint")} more={t("moreClipper")}>
        <ClipperControl siteName={eff.siteName} />
      </Row>

      {/* ── Files & tags ────────────────────────────────────────────────────
          Obsidian's "Default location for new attachments", named the same
          way so a migrating vault owner finds what they expect. Every upload
          obeys it and nothing already on disk moves when it changes. The
          folder is a PART: it belongs to two of the four modes, and under the
          other two it is disabled rather than left to mislead. */}
      <div className="s-smodal__sub">{t("groupFilesTags")}</div>
      <Row label={t("rowAttachmentLocation")} hint={t("hintAttachmentLocation")} error={errors.attachFolder}>
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
            <Part label={t("rowAttachmentFolder")} hint={t(bySubfolder ? "hintAttachmentSubfolder" : "hintAttachmentFolder")}>
              <TextInput
                placeholder={eff.attachments.folder}
                maxLength={FOLDER_MAX + 1}
                dir="ltr"
                label={t("rowAttachmentFolder")}
                invalid={errors.attachFolder !== undefined}
                {...field("attachFolder")}
              />
            </Part>
          )}
        </Parts>
      </Row>
      {/* The tag pages' folder answers "where does this instance write", and
          the labels table "what does a tag get called" — the table's hint
          says which one wins. */}
      <Row label={t("rowTagsFolder")} hint={t("hintTagsFolder")}>
        <TextInput placeholder={eff.tagsFolder} dir="ltr" label={t("rowTagsFolder")} {...field("tagsFolder")} />
      </Row>
      {form.tagsFolder.trim() === "" && eff.tagsFolderDetected && (
        <p className="s-smodal__note">{tf("templatesDetectedHint", { folder: eff.tagsFolder })}</p>
      )}
      {/* DISPLAY ONLY: the vault keeps its canonical tags, the URLs keep
          canonical slugs, and search answers to both — which is the ⓘ. */}
      <Row label={t("tagLabelsRowLabel")} hint={t("tagLabelsPageWins")} more={t("tagLabelsNote")} wide>
        <TagLabelEditor rows={form.tagLabels} onChange={(rows) => setForm((f) => (f ? { ...f, tagLabels: rows } : f))} />
      </Row>

      <Advanced tab="writing">
        <Row device label={t("rowVimKeys")} hint={t("hintVimKeys")}>
          <Parts>
            <Toggle label={t("rowVimKeys")} onLabel={t("on")} offLabel={t("off")} value={vimMode} onChange={() => toggleVim()} />
            {vimMode && (
              <Part label={t("rowRelativeLines")} hint={t("hintRelativeLines")}>
                <Toggle label={t("rowRelativeLines")} onLabel={t("on")} offLabel={t("off")} value={relativeLines} onChange={() => toggleRelativeLines()} />
              </Part>
            )}
          </Parts>
        </Row>
        {/* Where the sidebar's pencil files a drawing (the owner: "create the
            drawing in a specified space in settings or by default the root
            directory"). */}
        <Row label={t("drawingsFolderLabel")} hint={t("drawingsFolderHint")}>
          <TextInput placeholder={t("vaultRoot")} dir="ltr" label={t("drawingsFolderLabel")} {...field("drawingsFolder")} />
        </Row>
      </Advanced>
    </section>
  );
}
