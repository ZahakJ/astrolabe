// BACKUP & SYNC — where copies of the vault are kept. A page body (see
// ./TabBody.tsx), drawn in both kinds of vault:
//
//   · an instance points its server's git at a remote (the rows below);
//   · a pocket vault IS the repository, and draws ./PocketSync.tsx instead.
//
// Note versions and what travels with the vault — the other two answers to
// "where are copies of my work kept" — are their own page since the second
// settings pass (VersionsTab). Branch and pull-first — `main` and on for
// nearly everyone — sit behind the Advanced line. The username a token
// belongs to is a part of the token row.

import { useSettings } from "./context.ts";
import { t } from "../../i18n.ts";
import { SegmentedControl, TextInput, Toggle } from "../controls/Fields.tsx";
import { Select } from "../controls/Select.tsx";
import { Advanced, InstanceOnly, PocketOnly } from "./Fold.tsx";
import { Part, Parts, Row } from "./Row.tsx";
import { PocketSyncRows } from "./PocketSync.tsx";
import { SyncStatusBlock, SyncActions } from "./SyncStatus.tsx";
import { intervalLabel } from "./tabs.ts";

export default function SyncTab() {
  const { form, setForm, saving, errors, field, clearToken, eff, syncOff, syncStale, intervalChoices } = useSettings();
  return (
    <section data-section="sync">
      <InstanceOnly>
        {/* A master switch is a SWITCH: two states, both visible. */}
        <Row kind="toggle" label={t("rowSyncEnabled")} hint={t("hintSyncEnabled")}>
          <Toggle
            label={t("rowSyncEnabled")}
            value={form.syncEnabled === "on"}
            onChange={(on) => setForm((f) => (f ? { ...f, syncEnabled: on ? "on" : "off" } : f))}
          />
        </Row>
        {syncOff && <p className="s-smodal__offnote">{t("syncOffNotice")}</p>}
        <Row kind="text" label={t("rowSyncRemote")} hint={t("hintSyncRemote")} error={errors.syncRemote} off={syncOff}>
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
        <Row kind="segmented" label={t("rowSyncAuth")} hint={t("hintSyncAuth")} off={syncOff}>
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
          <Row kind="text"
            label={t("rowSyncToken")}
            hint={t("hintSyncToken")}
            error={errors.syncToken}
            off={syncOff}
            after={<span className="s-smodal__hint">{t(eff.gitSync.tokenSet ? "tokenSetYes" : "tokenSetNo")}</span>}
          >
            <Parts>
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
                <button type="button" className="s-btn" disabled={syncOff || !eff.gitSync.tokenSet || saving} onClick={clearToken}>
                  {t("clearToken")}
                </button>
              </div>
              <Part kind="text" label={t("rowSyncUser")} hint={t("hintSyncUser")}>
                <TextInput placeholder={t("phSyncUser")} dir="ltr" autoComplete="off" label={t("rowSyncUser")} disabled={syncOff} {...field("syncUser")} />
              </Part>
            </Parts>
          </Row>
        )}
        <Row kind="select" label={t("rowSyncInterval")} hint={t("hintSyncInterval")} error={errors.syncInterval} off={syncOff}>
          {/* A closed set of SENTENCES, not a number with a decoder hint under
              it: "Every 6 hours" and "Manual only" are the two things a reader
              is choosing between. A hand-written value outside the set still
              gets a row. */}
          <Select
            label={t("rowSyncInterval")}
            disabled={syncOff}
            options={intervalChoices.map((minutes) => ({ value: String(minutes), label: intervalLabel(minutes) }))}
            {...field("syncInterval")}
          />
        </Row>
        <Row kind="status" label={t("rowSyncStatus")} hint={t("hintSyncStatus")} off={syncOff}>
          <SyncStatusBlock authMode={form.syncAuth} remote={form.syncRemote} stale={syncStale} />
        </Row>
        {/* Section-level verbs, on their own line and with no label: they are
            not the value of a field called "Status". */}
        <SyncActions stale={syncStale} disabled={syncOff} />
      </InstanceOnly>
      <PocketOnly>
        <PocketSyncRows />
      </PocketOnly>

      <InstanceOnly>
        <Advanced tab="sync">
          <Row kind="text" label={t("rowSyncBranch")} hint={t("hintSyncBranch")} error={errors.syncBranch} off={syncOff}>
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
          <Row kind="toggle" label={t("rowSyncPull")} hint={t("hintSyncPull")} off={syncOff}>
            <Toggle
              label={t("rowSyncPull")}
              disabled={syncOff}
              value={form.syncPullFirst === "on"}
              onChange={(on) => setForm((f) => (f ? { ...f, syncPullFirst: on ? "on" : "off" } : f))}
            />
          </Row>
        </Advanced>
      </InstanceOnly>
    </section>
  );
}
