// SETTINGS → LANGUAGE → READ ALOUD (docs/read-aloud.md). One row: the
// engine, whether it is on this machine (and the button that puts it there),
// a voice for the languages that have more than one, and the speed.
//
// ON THE CPU, BY DESIGN, and the row says so: the owner ruled the GPU out,
// and the people this is for may have none. Two engines, the lighter one the
// default — Light (Piper) speaks a word in well under a second on any
// computer; Natural (Kokoro) sounds better and wants a recent CPU. Arabic is
// always Light's and Japanese always Natural's, whichever is chosen, and the
// row names both facts rather than letting a Japanese selection discover one.
//
// The Install button runs the same kind of job the whisper model's first
// download does (Vault → Voice transcription): the server makes a venv under
// its data folder, installs wheels, fetches the models, and this row polls
// `GET /api/speak/status` and prints the phase and the percentage.

import { useEffect, useState } from "react";
import { speakInstall, speakStatus } from "../../api.ts";
import { localeNum, t, tf } from "../../i18n.ts";
import { SPEAK_VOICES, type SpeakEngineId, type SpeakStatus } from "../../../shared/speech.ts";
import { SegmentedControl } from "../controls/Fields.tsx";
import { Select } from "../controls/Select.tsx";
import { useSettings } from "./context.ts";
import { modelSize } from "./voiceStatus.ts";

function engineName(e: SpeakEngineId): string {
  return e === "natural" ? t("speakEngineNatural") : t("speakEngineLight");
}

function useSpeakStatus(): [SpeakStatus | null, () => void] {
  const [status, setStatus] = useState<SpeakStatus | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    speakStatus().then(
      (s) => {
        if (live && "engines" in s) setStatus(s);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [tick]);
  // While an install runs, the row follows it.
  const running = status !== null && (status.install.phase === "python" || status.install.phase === "packages" || status.install.phase === "models");
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1500);
    return () => window.clearInterval(id);
  }, [running]);
  return [status, () => setTick((n) => n + 1)];
}

function InstallLine({ status, engine, onInstall }: { status: SpeakStatus; engine: SpeakEngineId; onInstall: () => void }) {
  const e = status.engines[engine];
  const job = status.install;
  if (status.test) return <p className="s-smodal__note">{t("speakStatusTest")}</p>;
  if (job.engine === engine && (job.phase === "python" || job.phase === "packages" || job.phase === "models")) {
    const pct = e.bytes > 0 ? Math.floor((e.downloaded / e.bytes) * 100) : 0;
    return (
      <p className="s-smodal__note" role="status">
        {job.phase === "python" ? t("speakPhasePython") : job.phase === "packages" ? t("speakPhasePackages") : tf("speakPhaseModels", { pct: localeNum(pct) })}
      </p>
    );
  }
  if (e.installed) {
    return <p className="s-smodal__note">{tf("speakStatusReady", { engine: engineName(engine), size: modelSize(e.bytes) })}</p>;
  }
  return (
    <>
      {job.phase === "failed" && job.engine === engine && (
        <p className="s-smodal__offnote" role="alert">
          {job.code === "speakNoPython" ? t("speakNoPython") : tf("speakFailed", { error: job.error ?? "" })}
        </p>
      )}
      <p className="s-smodal__note">{t("speakStatusNone")}</p>
      <button type="button" className="s-btn s-btn--accent" onClick={onInstall}>
        {tf("speakInstall", { engine: engineName(engine), size: modelSize(e.bytes) })}
      </button>
    </>
  );
}

export function ReadAloudControls() {
  const { pocket, form, field } = useSettings();
  const [status, refresh] = useSpeakStatus();
  const engine: SpeakEngineId = form.speakEngine === "natural" ? "natural" : "light";
  const install = (which: SpeakEngineId): void => {
    void speakInstall(which).then(refresh, refresh);
  };
  const naturalIn = status?.engines.natural.installed ?? false;
  const voiceOptions = (lang: "en" | "ja") => [
    { value: "", label: SPEAK_VOICES.natural[lang]![0].name },
    ...SPEAK_VOICES.natural[lang]!.slice(1).map((v) => ({ value: v.id, label: v.name })),
  ];
  return (
    <>
      <SegmentedControl
        label={t("rowReadAloud")}
        segments={[
          { value: "light", label: t("speakEngineLight"), note: t("speakEngineLightNote") },
          { value: "natural", label: t("speakEngineNatural"), note: t("speakEngineNaturalNote") },
        ]}
        {...field("speakEngine")}
      />
      {pocket ? (
        <p className="s-smodal__note">{t("speakPocketNote")}</p>
      ) : (
        status && <InstallLine status={status} engine={engine} onInstall={() => install(engine)} />
      )}
      {/* The two facts the choice does not change. */}
      <p className="s-smodal__note">
        {engine === "light" && !naturalIn ? t("speakJaNeedsNatural") : t("speakArIsLight")}
      </p>
      {engine === "light" && !naturalIn && status && !status.test && !pocket && status.engines.light.installed && (
        <button type="button" className="s-btn" onClick={() => install("natural")}>
          {tf("speakInstall", { engine: t("speakEngineNatural"), size: modelSize(status.engines.natural.bytes) })}
        </button>
      )}
      {(engine === "natural" || naturalIn) && (
        <div className="s-smodal__pair">
          <div className="s-smodal__voice">
            <span className="s-smodal__voicelabel" aria-hidden="true">{t("speakVoiceEn")}</span>
            <Select label={t("speakVoiceEn")} options={voiceOptions("en")} {...field("speakVoiceEn")} />
          </div>
          <div className="s-smodal__voice">
            <span className="s-smodal__voicelabel" aria-hidden="true">{t("speakVoiceJa")}</span>
            <Select label={t("speakVoiceJa")} options={voiceOptions("ja")} {...field("speakVoiceJa")} />
          </div>
        </div>
      )}
      <SegmentedControl
        label={t("speakRate")}
        segments={[
          { value: "0.8", label: t("speakRateSlow") },
          { value: "1", label: t("speakRateNormal") },
          { value: "1.2", label: t("speakRateFast") },
        ]}
        {...field("speakRate")}
      />
    </>
  );
}
