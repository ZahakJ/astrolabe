// READING & SPEECH — the reading view, the books and feeds you read, the
// voices that read to you, and the voice notes you speak. A tab body (see
// ./TabBody.tsx).
//
// Gathered by the settings purge from four tabs: numbered headings and the
// offline copy were on "This device", Read aloud and the transcription
// language on "Language & dates", book search, feeds and the transcription
// model on "Vault", and visitors' read aloud on "Publishing". Each was filed by
// its machinery (where it is stored, what it names); a reader asks "can this
// read to me", and the answer was in three places.

import { useSettings } from "./context.ts";
import { t } from "../../i18n.ts";
import { SegmentedControl, TextInput, Toggle } from "../controls/Fields.tsx";
import { headingNumbersPref, setHeadingNumbersPref } from "../../reading/headingNumbers.ts";
import { toast } from "../../toast.ts";
import { confirmModal } from "../Confirm.tsx";
import { OFFLINE_EVENT, clearOfflineCopy, offlineEnabled, offlineSupported, setOfflineEnabled } from "../../offline.ts";
import { FeedsFields } from "./PairControls.tsx";
import { OwnVoicesControls } from "./OwnVoices.tsx";
import { ReadAloudControls } from "./ReadAloudControls.tsx";
import { useVoiceEngine, VoiceEngineNote, VoiceModelFields } from "./VoiceEngineNote.tsx";
import { useEventPref } from "./devicePrefs.ts";
import { Advanced, InstanceOnly } from "./Fold.tsx";
import { Row } from "./Row.tsx";

export default function ReadingTab() {
  const { initial, pocket, form, setForm, field, onOffSegments, eff, inh } = useSettings();
  const numbered = useEventPref("astrolabe:heading-numbers", headingNumbersPref);
  const offline = useEventPref(OFFLINE_EVENT, offlineEnabled);
  const voiceSaved = `${initial?.voiceModel ?? ""}|${initial?.voiceBackend ?? ""}`;
  const voiceState = useVoiceEngine(!pocket, voiceSaved);
  return (
    <section data-section="reading">
      {pocket && <p className="s-smodal__offnote">{t("pocketReadingNotice")}</p>}
      <Row device label={t("rowHeadingNumbers")} hint={t("hintHeadingNumbers")}>
        <Toggle label={t("rowHeadingNumbers")} onLabel={t("on")} offLabel={t("off")} value={numbered} onChange={setHeadingNumbersPref} />
      </Row>
      {offlineSupported() && (
        <Row device label={t("rowOffline")} hint={t("hintOffline")}>
          <div className="s-settings__inline">
            <Toggle value={offline} onChange={setOfflineEnabled} label={t("rowOffline")} onLabel={t("on")} offLabel={t("off")} />
            {/* Deletes bytes, so it asks — the panel's rule for anything that
                does. At the trailing edge of the row, like the other verbs. */}
            <button
              type="button"
              className="s-btn"
              onClick={() => {
                void confirmModal({ title: t("offlineClearTitle"), body: t("offlineClearBody"), confirmLabel: t("offlineClear") }).then((ok) => {
                  if (ok) void clearOfflineCopy().then(() => toast(t("offlineCleared")));
                });
              }}
            >
              {t("offlineClear")}
            </button>
          </div>
        </Row>
      )}
      {/* The shelf's page text (server/pdfText.ts): whether the sidebar search
          reads the vault's PDFs. Three-way like Comments, because the middle
          state — "whatever PDF_SEARCH says" — is the row being empty. */}
      <Row
        locked={pocket}
        label={t("rowPdfSearch")}
        hint={t("hintPdfSearch")}
        env={{ name: "PDF_SEARCH", value: eff.pdfSearch ? "on" : "off", inherits: form.pdfSearch === "" }}
      >
        <SegmentedControl label={t("rowPdfSearch")} segments={onOffSegments(inh.pdfSearch)} {...field("pdfSearch")} />
      </Row>
      {/* FEEDS (docs/feeds.md): the list of other people's feeds lives in a
          note; this row is the consent. Off, the server asks no feed for
          anything — network access is the owner's to switch on. */}
      <Row locked={pocket} label={t("rowFeeds")} hint={t("hintFeeds")} more={t("moreFeeds")} wide>
        <FeedsFields
          fetch={form.feedsFetch === "on"}
          onFetch={(on) => setForm((f) => (f ? { ...f, feedsFetch: on ? "on" : "off" } : f))}
          note={field("feedsNote")}
          noteInForce={eff.feeds.note}
        />
      </Row>

      {/* ── Read aloud (docs/read-aloud.md) ─────────────────────────────────
          A selection read aloud by voices on this machine's CPU, in the
          language it is written in: one row — the engine, its install, the
          voices, the speed. Not locked in a pocket vault: there it is this
          phone's own voices, the only ones it has. Under it, whether the
          blog's visitors may ask for the same, which is an instance's. */}
      <div className="s-smodal__sub">{t("groupListening")}</div>
      <Row label={t("rowReadAloud")} hint={t("hintReadAloud")} more={t("moreReadAloud")}>
        <ReadAloudControls />
      </Row>
      <InstanceOnly>
        {/* Off unless the owner says so: every new sentence a visitor asks
            for is this machine's CPU; the server speaks only words that are on
            a published page, and caps each address. */}
        <Row label={t("rowReadersListen")} hint={t("hintReadersListen")}>
          <Toggle
            label={t("rowReadersListen")}
            onLabel={t("on")}
            offLabel={t("off")}
            value={form.speakPublic === "on"}
            onChange={(on) => setForm((f) => (f ? { ...f, speakPublic: on ? "on" : "off" } : f))}
          />
        </Row>
      </InstanceOnly>

      {/* ── Voice notes (docs/capture.md "Voice") ───────────────────────────
          The other direction: what you say, turned into words on THIS
          machine. Which language it is heard in (Detect for a vault that
          speaks both; a pin for a speaker the detector keeps mishearing), the
          model and where it runs, and whether the recording stays once its
          words have landed. A pocket vault runs no model and keeps every
          recording, so all three are its locked facts. */}
      <div className="s-smodal__sub">{t("groupVoiceNotes")}</div>
      <Row locked={pocket} label={t("rowVoiceLanguage")} hint={t("hintVoiceLanguage")} more={t("moreVoiceLanguage")}>
        <SegmentedControl
          label={t("rowVoiceLanguage")}
          segments={[
            { value: "auto", label: t("voiceLangAuto") },
            { value: "ar", label: t("langAr") },
            { value: "en", label: t("langEn") },
          ]}
          {...field("voiceLanguage")}
        />
      </Row>
      <Row locked={pocket} label={t("rowVoiceModel")} hint={t("hintVoiceModel")} more={t("moreVoiceModel")} wide>
        <VoiceModelFields
          model={form.voiceModel}
          onModel={field("voiceModel").onChange}
          backend={form.voiceBackend}
          onBackend={field("voiceBackend").onChange}
          state={voiceState}
        />
      </Row>
      {!pocket && <VoiceEngineNote model={form.voiceModel} backend={form.voiceBackend} saved={voiceSaved} state={voiceState} />}
      <Row locked={pocket} label={t("rowVoiceKeepAudio")} hint={t("hintVoiceKeepAudio")}>
        <Toggle
          label={t("rowVoiceKeepAudio")}
          onLabel={t("on")}
          offLabel={t("off")}
          value={form.voiceKeepAudio === "on"}
          onChange={(on) => setForm((f) => (f ? { ...f, voiceKeepAudio: on ? "on" : "off" } : f))}
        />
      </Row>

      <Advanced tab="reading">
        {/* Voices already on this machine (docs/read-aloud.md, "Your own
            voices"): a folder of Piper voices the server scans, and — folded
            inside — an external speaker. A server's, so locked in a pocket. */}
        <Row locked={pocket} label={t("rowOwnVoices")} hint={t("hintOwnVoices")} more={t("moreOwnVoices")}>
          <OwnVoicesControls />
        </Row>
        {/* The corpus the callouts read: detected when the vault names it, and
            the detected value printed rather than a blank field beside a
            feature that is quietly working. */}
        <Row locked={pocket} label={t("hadithFolderLabel")} hint={t("hadithFolderHint")} more={t("moreHadithFolder")}>
          <TextInput placeholder={eff.hadithFolder ?? "Corpus/hadith"} dir="ltr" label={t("hadithFolderLabel")} {...field("hadithFolder")} />
        </Row>
      </Advanced>
    </section>
  );
}
