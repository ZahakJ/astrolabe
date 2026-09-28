// READ ALOUD & VOICE NOTES — the voices that read to you, and the words you
// speak into notes. A page body (see ./TabBody.tsx), split from "Reading &
// speech" in the second settings pass.
//
// Read aloud (docs/read-aloud.md): a selection read by voices on this
// machine's CPU, in the language it is written in — one block for the
// engine, its install, the voices and the speed. Not locked in a pocket
// vault: there it is this phone's own voices, the only ones it has. Under it,
// whether the blog's visitors may ask for the same, which is an instance's.
//
// Voice notes (docs/capture.md "Voice"): the other direction — what you say,
// turned into words on THIS machine. Which language it is heard in, the model
// and where it runs, and whether the recording stays once its words have
// landed. A pocket vault runs no model and keeps every recording, so all three
// are its locked facts.

import { useSettings } from "./context.ts";
import { t } from "../../i18n.ts";
import { SegmentedControl, Toggle } from "../controls/Fields.tsx";
import { OwnVoicesControls } from "./OwnVoices.tsx";
import { ReadAloudControls } from "./ReadAloudControls.tsx";
import { useVoiceEngine, VoiceEngineNote, VoiceModelFields } from "./VoiceEngineNote.tsx";
import { Advanced, InstanceOnly } from "./Fold.tsx";
import { Row } from "./Row.tsx";

export default function SpeechTab() {
  const { initial, pocket, form, setForm, field } = useSettings();
  const voiceSaved = `${initial?.voiceModel ?? ""}|${initial?.voiceBackend ?? ""}`;
  const voiceState = useVoiceEngine(!pocket, voiceSaved);
  return (
    <section data-section="speech">
      <Row kind="table" label={t("rowReadAloud")} hint={t("hintReadAloud")} more={t("moreReadAloud")}>
        <ReadAloudControls />
      </Row>
      <InstanceOnly>
        {/* Off unless the owner says so: every new sentence a visitor asks
            for is this machine's CPU; the server speaks only words that are on
            a published page, and caps each address. */}
        <Row kind="toggle" label={t("rowReadersListen")} hint={t("hintReadersListen")}>
          <Toggle
            label={t("rowReadersListen")}
            value={form.speakPublic === "on"}
            onChange={(on) => setForm((f) => (f ? { ...f, speakPublic: on ? "on" : "off" } : f))}
          />
        </Row>
      </InstanceOnly>

      {pocket && <p className="s-smodal__offnote">{t("pocketReadingNotice")}</p>}
      <Row kind="segmented" locked={pocket} label={t("rowVoiceLanguage")} hint={t("hintVoiceLanguage")} more={t("moreVoiceLanguage")}>
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
      <Row kind="select" locked={pocket} label={t("rowVoiceModel")} hint={t("hintVoiceModel")} more={t("moreVoiceModel")}>
        <VoiceModelFields
          model={form.voiceModel}
          onModel={field("voiceModel").onChange}
          backend={form.voiceBackend}
          onBackend={field("voiceBackend").onChange}
          state={voiceState}
        />
      </Row>
      {!pocket && <VoiceEngineNote model={form.voiceModel} backend={form.voiceBackend} saved={voiceSaved} state={voiceState} />}
      <Row kind="toggle" locked={pocket} label={t("rowVoiceKeepAudio")} hint={t("hintVoiceKeepAudio")}>
        <Toggle
          label={t("rowVoiceKeepAudio")}
          value={form.voiceKeepAudio === "on"}
          onChange={(on) => setForm((f) => (f ? { ...f, voiceKeepAudio: on ? "on" : "off" } : f))}
        />
      </Row>

      <Advanced tab="speech">
        {/* Voices already on this machine (docs/read-aloud.md, "Your own
            voices"): a folder of Piper voices the server scans, and — folded
            inside — an external speaker. A server's, so locked in a pocket. */}
        <Row kind="table" locked={pocket} label={t("rowOwnVoices")} hint={t("hintOwnVoices")} more={t("moreOwnVoices")}>
          <OwnVoicesControls />
        </Row>
      </Advanced>
    </section>
  );
}
