// The words of Settings → Vault → Voice transcription, apart from the React
// that draws them (VoiceEngineNote.tsx), so tests/voiceEngine.test.ts can read
// the status line a forced GPU failure leaves behind.

import { getNumerals, localeNum, t, tf } from "../../i18n.ts";
import { toNumerals } from "../../../shared/numerals.ts";
import { isVoiceModelSetting, voiceModelBytes, voiceModelInfo, type VoiceEngineKind, type VoiceEngineState, type VoiceModelId } from "../../../shared/voice.ts";

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
  if (id === "base-q5_1") return t("voiceModelBase");
  if (id === "small-q5_1") return t("voiceModelSmall");
  if (id === "large-v3-turbo") return t("voiceModelTurboFull");
  return t("voiceModelTurbo");
}

/** What a model costs where it will run: its download, and on the processor
 *  what a minute of speech costs on two cores (the measured floor a machine
 *  with no GPU is likely to have — contracts/features.md). Every model in the
 *  catalogue runs faster than speech there, so the sentence is "a minute in
 *  about N s", rounded to five. */
export function modelCost(id: VoiceModelId, engine: VoiceEngineKind): string {
  const size = modelSize(voiceModelBytes(id, engine));
  if (engine === "gpu") return size;
  const secs = voiceModelInfo(id).cpuSecondsPerMinute;
  return tf("voiceCostCpu", { size, secs: localeNum(Math.max(5, Math.round(secs / 5) * 5)) });
}

/** Which form the sizes on the row are for: the processor's when the row says
 *  so, otherwise what the server knows about this machine (the GPU's until it
 *  has been asked). */
export function sizesFor(backend: string, state: VoiceEngineState | null): VoiceEngineKind {
  if (backend === "cpu") return "cpu";
  return state?.engine ?? "gpu";
}

function backendWord(backend: string): string {
  if (backend === "cpu") return t("voiceBackendCpu");
  if (backend === "gpu") return t("voiceBackendGpu");
  if (backend === "cuda") return "CUDA";
  if (backend === "metal") return "Metal";
  return "Vulkan";
}

/** The line under the row. `model` and `backend` are the form's; `saved` is
 *  the saved pair as `model|backend`; `state` is `GET /api/voice/engine`. A
 *  pending choice says what it will fetch; a download says how far it is; a
 *  model on disk says which model ran where — or will, when that is known. */
export function voiceStatusLine(choice: string, backend: string, saved: string, state: VoiceEngineState | null): string | null {
  if (choice === "off") return t("voiceNoteOff");
  if (!isVoiceModelSetting(choice)) return null;
  const model = choice as VoiceModelId;
  if (`${model}|${backend}` !== saved || state === null || state.model !== model) {
    return tf("voiceNoteFirstUse", { size: modelSize(voiceModelBytes(model, sizesFor(backend, state))) });
  }
  if (state.downloaded < state.bytes) {
    const pct = state.bytes > 0 ? Math.floor((state.downloaded / state.bytes) * 100) : 0;
    return state.downloaded > 0 ? tf("voiceNoteFetching", { pct: localeNum(pct) }) : tf("voiceNoteFirstUse", { size: modelSize(state.bytes) });
  }
  const name = voiceModelLabel(model);
  // Where it last ran — unless that was a GPU and the setting now says
  // processor only, when the last run says nothing about the next.
  if (state.backend !== null && !(state.choice === "cpu" && state.backend !== "cpu")) {
    return tf("voiceNoteRanOn", { model: name, backend: backendWord(state.backend) });
  }
  if (state.engine !== null) return tf("voiceNoteRunsOn", { model: name, backend: backendWord(state.engine) });
  return t("voiceNoteReady");
}
