// THE FLOATING PLAYER — what is being read, and the four things a listener
// does to it: pause, replay, rate, stop (docs/read-aloud.md).
//
// Fixed to the viewport's foot, so it survives scrolling: a reader who
// selects a paragraph and scrolls on to follow it keeps the controls. It
// shows the sentence being spoken (lit in the page too, when it came from
// the page), where that sentence is in the passage, and — when the device's
// own voices are speaking instead of the app's — the one line that says which
// of the three states is true (player.ts's header): the app's voices speak and
// nothing is said; a device voice stands in, NAMED, with the ▾ that changes it
// and the button to the real remedy; or no voice here speaks the language at
// all, and the line says what would. Mounted once per shell (App, the phone
// shell); nothing is drawn while nothing is playing.

import "../styles/speech.css";
import { getLang, t, tf, localeNum } from "../i18n.ts";
import { useStore } from "../state.ts";
import { Select } from "../components/controls/Select.tsx";
import { isSpeakLang, SPEAK_ENGINES } from "../../shared/speech.ts";
import { voiceChoices } from "../../shared/speechVoices.ts";
import { deviceVoiceList, localeName, useDeviceVoicesVersion, voicesFor, voiceShortName } from "./deviceVoices.ts";
import { cycleRate, pause, replay, resume, stop, switchDeviceVoice, switchEngineVoice, usePlayer, type DeviceReading } from "./player.ts";
import { useSpeakStatus } from "./speakStatus.ts";
import { manyVoices, voiceGroups } from "./voiceOptions.ts";

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d={d} fill="currentColor" />
    </svg>
  );
}

const PLAY = "M8 5.5v13l11-6.5z";
const PAUSE = "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z";
const REPLAY = "M12 5V2L7.5 6.5 12 11V7.5a5 5 0 1 1-5 5H4.5A7.5 7.5 0 1 0 12 5z";
const STOP = "M6.5 6.5h11v11h-11z";

/** The Read aloud row, where the app's own voices are installed. The
 *  passage stops first: on a phone the player sits over the settings screen
 *  it just opened, and a reader going to install better voices will hear
 *  the passage again in them. */
function openReadAloudSettings(): void {
  stop();
  useStore.getState().openSettingsAt("rowReadAloud");
}

/** The device voice reading now, named, with the ▾ of every other voice on
 *  this device that speaks the language. */
function DeviceVoicePicker({ device }: { device: DeviceReading }) {
  useDeviceVoicesVersion();
  const ui = getLang();
  const language = localeName(device.lang, ui);
  const voices = voicesFor(deviceVoiceList(), device.lang);
  if (!device.voice || voices.length === 0) {
    return <span className="s-speak__voicename">{device.voice ? voiceShortName(device.voice) : t("speakDeviceVoiceUnnamed")}</span>;
  }
  return (
    <Select
      label={tf("speakDeviceVoicePick", { language })}
      triggerClass="s-speak__voice"
      valueDir="ltr"
      value={device.voice.uri}
      onChange={switchDeviceVoice}
      options={voices.map((v) => ({ value: v.voiceURI, label: voiceShortName(v), labelDir: "ltr" as const, note: localeName(v.lang, ui) }))}
    />
  );
}

/** THE APP'S VOICE, NAMED, with the ▾ of every other app voice for the
 *  language — the built-in ones and the reader's own (the voices folder) —
 *  for the owner. Choosing one is saving it as the language's voice, the
 *  same setting as Settings' picker, and the sentence is read again in it.
 *  Drawn only when there is a choice to make. */
function EngineVoicePicker({ lang, voice }: { lang: string; voice: string }) {
  const status = useSpeakStatus();
  if (!status || !isSpeakLang(lang) || voice === "external") return null;
  const installed = new Set(SPEAK_ENGINES.filter((e) => status.engines[e].installed));
  const choices = voiceChoices(lang, status.settings.engine, installed, status.own.voices);
  const groups = voiceGroups(choices, voice, { withDefault: false });
  if (groups.reduce((n, g) => n + g.options.length, 0) < 2) return null;
  const language = localeName(lang, getLang());
  const first = choices.builtin[0]?.id ?? null;
  return (
    <span className="s-speak__engine" data-voice={voice}>
      <Select
        label={tf("speakVoiceFor", { language })}
        triggerClass="s-speak__voice"
        valueDir={voice.startsWith("own:") ? "ltr" : undefined}
        value={voice}
        onChange={(id) => void switchEngineVoice(id, id === first)}
        groups={groups}
        filter={manyVoices(groups)}
        filterPlaceholder={t("speakVoiceFilter")}
      />
    </span>
  );
}

/** The owner's external speaker failed on this passage. */
function FailedLine({ owner }: { owner: boolean }) {
  return (
    <span className="s-speak__note" data-state="failed" role="alert">
      {t("speakExternalFailed")}{" "}
      {owner && (
        <button type="button" className="s-speak__install" onClick={openOwnVoicesSettings}>
          {t("speakExternalOpen")}
        </button>
      )}
    </span>
  );
}

function openOwnVoicesSettings(): void {
  stop();
  useStore.getState().openSettingsAt("rowOwnVoices");
}

/** The line under the sentence when the device's voices were asked. */
function DeviceLine({ device, owner }: { device: DeviceReading; owner: boolean }) {
  const language = localeName(device.lang, getLang());
  const install = owner && device.why !== "pocket" && (
    <button type="button" className="s-speak__install" onClick={openReadAloudSettings}>
      {t("speakInstallAppVoices")}
    </button>
  );
  if (device.none) {
    const says =
      device.why === "pocket"
        ? tf("speakNoDeviceVoicePocket", { language })
        : owner
          ? tf("speakNoDeviceVoice", { language })
          : tf("speakNoDeviceVoiceVisitor", { language });
    return (
      <span className="s-speak__note" data-state="none" role="status">
        {says} {install}
      </span>
    );
  }
  const lead =
    device.why === "notInstalled"
      ? tf("speakAppVoicesMissing", { language })
      : device.why === "pocket"
        ? t("speakPocketReading")
        : t("speakDeviceNote");
  return (
    <span className="s-speak__note" data-state="device">
      {lead} <DeviceVoicePicker device={device} />
      {install && device.why === "notInstalled" && install}
    </span>
  );
}

export default function SpeechPlayer({ owner = true }: { owner?: boolean }) {
  const s = usePlayer();
  if (s.status === "idle" || s.sentences.length === 0) return null;
  const playing = s.status === "playing" || s.status === "loading";
  const sentence = s.sentences[Math.min(s.index, s.sentences.length - 1)] ?? "";
  return (
    <div className="s-speak" role="region" aria-label={t("speakPlayer")} data-status={s.status} data-source={s.source ?? ""}>
      <div className="s-speak__controls">
        <button
          type="button"
          className="s-speak__btn s-speak__btn--main"
          aria-label={playing ? t("speakPause") : t("speakPlay")}
          title={playing ? t("speakPause") : t("speakPlay")}
          onClick={() => (playing ? pause() : resume())}
        >
          <Icon d={playing ? PAUSE : PLAY} />
        </button>
        <button type="button" className="s-speak__btn" aria-label={t("speakReplay")} title={t("speakReplay")} onClick={replay}>
          <Icon d={REPLAY} />
        </button>
        <button
          type="button"
          className="s-speak__btn s-speak__rate"
          aria-label={tf("speakRateNow", { rate: localeNum(s.rate) })}
          title={t("speakRate")}
          onClick={cycleRate}
        >
          <bdi dir="ltr">{localeNum(s.rate)}×</bdi>
        </button>
        <button type="button" className="s-speak__btn" aria-label={t("speakStop")} title={t("speakStop")} onClick={stop}>
          <Icon d={STOP} />
        </button>
      </div>
      <div className="s-speak__text">
        <p className="s-speak__sentence" dir="auto" lang={s.lang ?? undefined} aria-live="polite">
          {s.status === "loading" && <span className="s-speak__dot" aria-hidden="true" />}
          <mark>{sentence}</mark>
        </p>
        <p className="s-speak__meta">
          {s.sentences.length > 1 && (
            <span>{tf("speakPosition", { at: localeNum(s.index + 1), of: localeNum(s.sentences.length) })}</span>
          )}
          {s.device && <DeviceLine device={s.device} owner={owner} />}
          {s.failed === "external" && <FailedLine owner={owner} />}
          {owner && s.source === "engine" && s.voice && s.lang && <EngineVoicePicker lang={s.lang} voice={s.voice} />}

        </p>
      </div>
    </div>
  );
}
