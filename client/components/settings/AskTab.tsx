// ASK THE VAULT (docs/ask.md): which models read the notes and answer about
// them. Instance-only. A tab body (see ./TabBody.tsx), split out of
// SettingsModal.tsx (3.27.0) unchanged.

import { useSettings } from "./context.ts";
import { t } from "../../i18n.ts";
import { NumberInput, SegmentedControl, TextInput } from "../controls/Fields.tsx";
import { Row } from "./Row.tsx";
import { AskStatusBlock } from "./AskStatusBlock.tsx";
import { ANTHROPIC_MODEL_PLACEHOLDER } from "./tabs.ts";

export default function AskTab() {
  const { saving, errors, field, clearAskKey, eff } = useSettings();
  return (
    <section data-section="ask">
      <Row label={t("rowAskProvider")} hint={t("hintAskProvider")}>
        <SegmentedControl
          label={t("rowAskProvider")}
          segments={[
            { value: "ollama", label: t("askProviderLocal") },
            { value: "anthropic", label: t("askProviderAnthropic") },
          ]}
          {...field("askProvider")}
        />
      </Row>
      <Row label={t("rowAskChatModel")} hint={t("hintAskChatModel")} error={errors.askChatModel}>
        <TextInput
          placeholder="qwen3.5:9b"
          dir="ltr"
          autoComplete="off"
          label={t("rowAskChatModel")}
          invalid={errors.askChatModel !== undefined}
          {...field("askChatModel")}
        />
      </Row>
      <Row label={t("rowAskAnthropicModel")} hint={t("hintAskAnthropicModel")} error={errors.askAnthropicModel}>
        <TextInput
          placeholder={ANTHROPIC_MODEL_PLACEHOLDER}
          dir="ltr"
          autoComplete="off"
          label={t("rowAskAnthropicModel")}
          invalid={errors.askAnthropicModel !== undefined}
          {...field("askAnthropicModel")}
        />
      </Row>
      <Row label={t("rowAskKey")} hint={t("hintAskKey")} error={errors.askKey}>
        <div className="s-smodal__tokenfield">
          <TextInput
            type="password"
            placeholder={t(eff.ask.keySet ? "phTokenStored" : "phAskKeyNew")}
            dir="ltr"
            autoComplete="new-password"
            label={t("rowAskKey")}
            invalid={errors.askKey !== undefined}
            {...field("askKey")}
          />
          <button type="button" className="s-btn" disabled={!eff.ask.keySet || saving} onClick={clearAskKey}>
            {t("askClearKey")}
          </button>
        </div>
        <span className="s-smodal__hint">{t(eff.ask.keySet ? "askKeySetYes" : "askKeySetNo")}</span>
      </Row>
      <Row label={t("rowAskEmbedModel")} hint={t("hintAskEmbedModel")} error={errors.askEmbedModel}>
        <TextInput
          placeholder="embeddinggemma"
          dir="ltr"
          autoComplete="off"
          label={t("rowAskEmbedModel")}
          invalid={errors.askEmbedModel !== undefined}
          {...field("askEmbedModel")}
        />
      </Row>
      <Row label={t("rowAskTopK")} hint={t("hintAskTopK")} error={errors.askTopK}>
        <NumberInput
          label={t("rowAskTopK")}
          unit={t("askTopKUnit")}
          min={2}
          max={12}
          invalid={errors.askTopK !== undefined}
          {...field("askTopK")}
        />
      </Row>
      <Row label={t("rowAskStatus")} hint={t("hintAskStatus")}>
        <AskStatusBlock />
      </Row>
    </section>
  );
}
