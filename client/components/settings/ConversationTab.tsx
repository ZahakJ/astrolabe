// COMMENTS & MENTIONS (docs/webmentions.md) — who may answer a published note:
// comments, webmentions and the fediverse. Each is network access or visitor
// input the owner consents to on its own, all off on a new instance. What a
// switch has done is said UNDER it (the row's `after` line) rather than in a
// row of its own. Instance-only (`!pocket` in ./TabBody.tsx). A page body,
// split from "Your site" in the second settings pass.

import { useSettings } from "./context.ts";
import { t } from "../../i18n.ts";
import { SegmentedControl, TextInput, Toggle } from "../controls/Fields.tsx";
import { FediverseNote, SentPanel } from "../../mentions/PublishingPanels.tsx";
import { Part, Parts, Row } from "./Row.tsx";

export default function ConversationTab() {
  const { form, setForm, errors, field, onOffSegments, eff, inh } = useSettings();
  return (
    <section data-section="conversation">
      <Row label={t("rowComments")} hint={t("hintComments")} env={{ name: "COMMENTS", value: eff.commentsEnabled ? "on" : "off", inherits: form.comments === "" }}>
        <SegmentedControl label={t("rowComments")} segments={onOffSegments(inh.commentsEnabled)} {...field("comments")} />
      </Row>
      <Row
        label={t("rowWebmentions")}
        hint={t("hintWebmentions")}
        more={[t("moreWebmentionsAccept"), t("moreWebmentionsSend")]}
        after={<SentPanel on={form.wmSend === "on"} />}
      >
        <Parts>
          <Part label={t("rowWebmentionsAccept")} hint={t("hintWebmentionsAccept")}>
            <Toggle
              label={t("rowWebmentionsAccept")}
              onLabel={t("on")}
              offLabel={t("off")}
              value={form.wmAccept === "on"}
              onChange={(on) => setForm((f) => (f ? { ...f, wmAccept: on ? "on" : "off" } : f))}
            />
          </Part>
          <Part label={t("rowWebmentionsSend")} hint={t("hintWebmentionsSend")}>
            <Toggle
              label={t("rowWebmentionsSend")}
              onLabel={t("on")}
              offLabel={t("off")}
              value={form.wmSend === "on"}
              onChange={(on) => setForm((f) => (f ? { ...f, wmSend: on ? "on" : "off" } : f))}
            />
          </Part>
        </Parts>
      </Row>
      <Row
        label={t("rowFediverse")}
        hint={t("hintFediverse")}
        more={t("moreFediverse")}
        error={errors.fediHandle}
        after={<FediverseNote on={form.fediEnabled === "on"} />}
      >
        <Parts>
          <Toggle
            label={t("rowFediverse")}
            onLabel={t("on")}
            offLabel={t("off")}
            value={form.fediEnabled === "on"}
            onChange={(on) => setForm((f) => (f ? { ...f, fediEnabled: on ? "on" : "off" } : f))}
          />
          {form.fediEnabled === "on" && (
            <Part label={t("rowFediverseHandle")} hint={t("hintFediverseHandle")}>
              <TextInput placeholder={eff.fediverse.handle} dir="ltr" label={t("rowFediverseHandle")} invalid={errors.fediHandle !== undefined} {...field("fediHandle")} />
            </Part>
          )}
        </Parts>
      </Row>
    </section>
  );
}
