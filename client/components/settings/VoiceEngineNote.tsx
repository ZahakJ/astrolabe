// Settings → Vault → Voice transcription: the row's two controls (the model,
// and where it runs) and the line under it — what the machine behind the
// panel has actually got. Asked of `GET /api/voice/engine` when the row is
// drawn, because "downloads on first use" is a promise the owner deserves to
// see kept. The words are ./voiceStatus.ts.
//
// Its own file, like PairControls.tsx, so the settings index counts the ROW
// once and not each control inside it.

import { useEffect, useState } from "react";
import { voiceEngine } from "../../api.ts";
import { t } from "../../i18n.ts";
import { VOICE_MODELS, type VoiceEngineState } from "../../../shared/voice.ts";
import { SegmentedControl } from "../controls/Fields.tsx";
import { Select } from "../controls/Select.tsx";
import { modelCost, sizesFor, voiceModelLabel, voiceStatusLine } from "./voiceStatus.ts";

/** The engine state, asked again whenever the saved choice changes. */
export function useVoiceEngine(ask: boolean, savedKey: string): VoiceEngineState | null {
  const [state, setState] = useState<VoiceEngineState | null>(null);
  useEffect(() => {
    if (!ask) return;
    let live = true;
    voiceEngine().then(
      (s) => live && setState(s),
      () => live && setState(null),
    );
    return () => {
      live = false;
    };
  }, [ask, savedKey]);
  return state;
}

export function VoiceModelFields({
  model,
  onModel,
  backend,
  onBackend,
  state,
}: {
  model: string;
  onModel: (v: string) => void;
  backend: string;
  onBackend: (v: string) => void;
  state: VoiceEngineState | null;
}) {
  const engine = sizesFor(backend, state);
  return (
    <div className="s-smodal__pair s-smodal__voicepair" role="group" aria-label={t("rowVoiceModel")}>
      <Select
        label={t("rowVoiceModel")}
        options={[
          ...VOICE_MODELS.map((m) => ({ value: m.id, label: voiceModelLabel(m.id), note: modelCost(m.id, engine) })),
          { value: "off", label: t("voiceModelOff") },
        ]}
        value={model}
        onChange={onModel}
      />
      <SegmentedControl
        label={t("voiceBackendLabel")}
        segments={[
          { value: "auto", label: t("voiceBackendAuto") },
          { value: "cpu", label: t("voiceBackendCpuOnly") },
        ]}
        value={backend}
        onChange={onBackend}
      />
    </div>
  );
}

export function VoiceEngineNote({ model, backend, saved, state }: { model: string; backend: string; saved: string; state: VoiceEngineState | null }) {
  const line = voiceStatusLine(model, backend, saved, state);
  return line === null ? null : <p className="s-smodal__note">{line}</p>;
}
