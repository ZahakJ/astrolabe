// The line under Settings → Vault → Voice transcription: what the machine
// behind the panel has actually got — the model on disk or not yet (and how
// big it is), where it runs once it has run, and a pending choice named as
// pending. Asked of `GET /api/voice/engine` when the row is drawn, because
// "downloads on first use" is a promise the owner deserves to see kept.

import { useEffect, useState } from "react";
import { voiceEngine } from "../../api.ts";
import { getNumerals, localeNum, t, tf } from "../../i18n.ts";
import { toNumerals } from "../../../shared/numerals.ts";
import { VOICE_MODELS, type VoiceEngineState, type VoiceModelId } from "../../../shared/voice.ts";

/** "574 MB" / "1.5 GB" in the instance's numerals, decimal units — the size a
 *  download dialog and the model host both print. */
export function modelSize(bytes: number): string {
  const mb = bytes / 1e6;
  if (mb < 1000) return `${localeNum(Math.round(mb))} ${t("unitMB")}`;
  const gb = (mb / 1000).toFixed(1);
  const num = getNumerals() === "arab" ? toNumerals(gb, "arab").replace(".", "٫") : gb;
  return `${num} ${t("unitGB")}`;
}

export function voiceModelLabel(id: VoiceModelId): string {
  if (id === "large-v3-turbo") return t("voiceModelTurboFull");
  if (id === "small-q5_1") return t("voiceModelSmall");
  return t("voiceModelTurbo");
}

export function VoiceEngineNote({ model, saved }: { model: string; saved: string }) {
  const [state, setState] = useState<VoiceEngineState | null>(null);
  useEffect(() => {
    let live = true;
    voiceEngine().then(
      (s) => live && setState(s),
      () => live && setState(null),
    );
    return () => {
      live = false;
    };
  }, [saved]);
  if (model === "off") return <p className="s-smodal__note">{t("voiceNoteOff")}</p>;
  const info = VOICE_MODELS.find((m) => m.id === model);
  if (!info) return null;
  if (model !== saved || state === null || state.model !== model) {
    return <p className="s-smodal__note">{tf("voiceNoteFirstUse", { size: modelSize(info.bytes) })}</p>;
  }
  if (state.downloaded < state.bytes) {
    const pct = state.bytes > 0 ? Math.floor((state.downloaded / state.bytes) * 100) : 0;
    return (
      <p className="s-smodal__note">
        {state.downloaded > 0 ? tf("voiceNoteFetching", { pct: localeNum(pct) }) : tf("voiceNoteFirstUse", { size: modelSize(info.bytes) })}
      </p>
    );
  }
  return (
    <p className="s-smodal__note">
      {state.backend ? tf("voiceNoteReadyOn", { backend: state.backend.toUpperCase() === "CPU" ? t("voiceBackendCpu") : state.backend === "cuda" ? "CUDA" : state.backend === "metal" ? "Metal" : "Vulkan" }) : t("voiceNoteReady")}
    </p>
  );
}
