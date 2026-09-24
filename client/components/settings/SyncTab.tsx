// BACKUP & SYNC, for an instance: a server pointing git at a remote. (A
// pocket vault IS the repository and draws ./PocketSync.tsx instead — the
// choice is ./TabBody.tsx's.) Split out of SettingsModal.tsx (3.27.0)
// unchanged.

import { useSettings } from "./context.ts";
import { t } from "../../i18n.ts";
import { SegmentedControl, TextInput, Toggle } from "../controls/Fields.tsx";
import { Select } from "../controls/Select.tsx";
import { Row } from "./Row.tsx";
import { TravelRow } from "./TravelRow.tsx";
import { SyncStatusBlock, SyncActions } from "./SyncStatus.tsx";
import { intervalLabel } from "./tabs.ts";

export default function SyncTab() {
  const { form, setForm, saving, errors, field, clearToken, eff, syncOff, syncStale, intervalChoices } = useSettings();
  return (
    <section data-section="sync">
      {/* A master switch is a SWITCH: two states, both visible,
          no list to open to learn there are only two. */}
      <Row label={t("rowSyncEnabled")} hint={t("hintSyncEnabled")}>
        <Toggle
          label={t("rowSyncEnabled")}
          onLabel={t("on")}
          offLabel={t("off")}
          value={form.syncEnabled === "on"}
          onChange={(on) => setForm((f) => (f ? { ...f, syncEnabled: on ? "on" : "off" } : f))}
        />
      </Row>
      {syncOff && <p className="s-smodal__offnote">{t("syncOffNotice")}</p>}
      <Row
        label={t("rowSyncRemote")}
        hint={t("hintSyncRemote")}
        error={errors.syncRemote}
        off={syncOff}
      >
        <TextInput
          placeholder={t("phSyncRemote")}
          dir="ltr"
          autoComplete="off"
          label={t("rowSyncRemote")}
          invalid={errors.syncRemote !== undefined}
          disabled={syncOff}
          {...field("syncRemote")}
        />
      </Row>
      <Row
        label={t("rowSyncBranch")}
        hint={t("hintSyncBranch")}
        error={errors.syncBranch}
        off={syncOff}
      >
        <TextInput
          placeholder="main"
          dir="ltr"
          autoComplete="off"
          label={t("rowSyncBranch")}
          invalid={errors.syncBranch !== undefined}
          disabled={syncOff}
          {...field("syncBranch")}
        />
      </Row>
      <Row label={t("rowSyncAuth")} hint={t("hintSyncAuth")} off={syncOff}>
        <SegmentedControl
          label={t("rowSyncAuth")}
          disabled={syncOff}
          segments={[
            { value: "ssh", label: t("authSsh") },
            { value: "token", label: t("authToken") },
          ]}
          {...field("syncAuth")}
        />
      </Row>
      {form.syncAuth === "token" && (
        <>
          <Row label={t("rowSyncUser")} hint={t("hintSyncUser")} off={syncOff}>
            <TextInput
              placeholder={t("phSyncUser")}
              dir="ltr"
              autoComplete="off"
              label={t("rowSyncUser")}
              disabled={syncOff}
              {...field("syncUser")}
            />
          </Row>
          <Row
            label={t("rowSyncToken")}
            hint={t("hintSyncToken")}
            error={errors.syncToken}
            off={syncOff}
          >
            <div className="s-smodal__tokenfield">
              <TextInput
                type="password"
                placeholder={t(eff.gitSync.tokenSet ? "phTokenStored" : "phTokenNew")}
                dir="ltr"
                autoComplete="new-password"
                label={t("rowSyncToken")}
                invalid={errors.syncToken !== undefined}
                disabled={syncOff}
                {...field("syncToken")}
              />
              <button
                type="button"
                className="s-btn"
                disabled={syncOff || !eff.gitSync.tokenSet || saving}
                onClick={clearToken}
              >
                {t("clearToken")}
              </button>
            </div>
            <span className="s-smodal__hint">
              {t(eff.gitSync.tokenSet ? "tokenSetYes" : "tokenSetNo")}
            </span>
          </Row>
        </>
      )}
      <Row label={t("rowSyncPull")} hint={t("hintSyncPull")} off={syncOff}>
        <Toggle
          label={t("rowSyncPull")}
          onLabel={t("on")}
          offLabel={t("off")}
          disabled={syncOff}
          value={form.syncPullFirst === "on"}
          onChange={(on) => setForm((f) => (f ? { ...f, syncPullFirst: on ? "on" : "off" } : f))}
        />
      </Row>
      <Row
        label={t("rowSyncInterval")}
        hint={t("hintSyncInterval")}
        error={errors.syncInterval}
        off={syncOff}
      >
        {/* A closed set of SENTENCES, not a number with a decoder
            hint under it ("minutes; 0 = manual only"): the panel
            has a NumberInput with a unit for the case where a
            number is genuinely the value (the Arabic size match),
            and this is not that case — "Every 6 hours" and
            "Manual only" are the two things a reader is choosing
            between. A value hand-written into settings.json
            outside the set still gets a row. */}
        <Select
          label={t("rowSyncInterval")}
          disabled={syncOff}
          options={intervalChoices.map((minutes) => ({
            value: String(minutes),
            label: intervalLabel(minutes),
          }))}
          {...field("syncInterval")}
        />
      </Row>
      <Row label={t("rowSyncStatus")} hint={t("hintSyncStatus")} off={syncOff}>
        <SyncStatusBlock
          authMode={form.syncAuth}
          remote={form.syncRemote}
          stale={syncStale}
        />
      </Row>
      {/* Section-level verbs, on their own line and with no label
          at all: they are not the value of a field called
          "Status", and an empty label cell would only reintroduce
          the grid they do not belong in. */}
      <SyncActions stale={syncStale} disabled={syncOff} />
      {/* What the vault's .astrolabe/ folder holds for the next
          machine (server/configMirror.ts) — independent of git
          sync, so it is not greyed with the rows above. */}
      <TravelRow />
    </section>
  );
}
