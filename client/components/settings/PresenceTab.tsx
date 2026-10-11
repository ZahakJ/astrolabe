// DISCORD (docs/presence.md): how much Discord is told while you work, and
// which process tells it. Instance-only — a pocket vault has no server to
// speak to Discord — and every row is the vault's (they raise the Save bar),
// because what this vault lets out is a fact about the vault, not about the
// browser that set it. A page body (see ./TabBody.tsx).
//
// The privacy rule is not a row: titles only, never paths, and a note can
// say `presence: false`. It is the Mode row's ⓘ, and the server applies it
// whatever these rows say (shared/presence/policy.ts).

import { useEffect, useMemo, useState } from "react";
import type { PresenceStatus } from "../../../shared/presence/types.ts";
import { IS_DESKTOP } from "../../desktop/bridge.ts";
import { t, tf, type I18nKey } from "../../i18n.ts";
import { getPresenceStatus } from "../../presence/api.ts";
import { useStore } from "../../state.ts";
import { SegmentedControl, TextInput, Toggle } from "../controls/Fields.tsx";
import { Select } from "../controls/Select.tsx";
import { useSettings } from "./context.ts";
import { Advanced } from "./Fold.tsx";
import { presenceStatusLines } from "./presenceStatus.ts";
import { Row } from "./Row.tsx";

/** "Idle after" — a closed set of sentences, like the sync interval's; a
 *  value hand-written into settings.json outside it still gets an option. */
const IDLE_CHOICES = [5, 10, 15, 30, 60];

/** "10 minutes" / "10 دقائق": the Arabic noun agrees with the number (3–10
 *  take the plural, the rest the singular — 2 only by a hand-edited
 *  settings.json, where "2 دقيقة" is a fair price). Western digits in both
 *  languages, as the dictionary writes every count on this page. */
function idleLabel(n: number): string {
  const key: I18nKey = n === 1 ? "presenceIdleOne" : n >= 3 && n <= 10 ? "presenceIdleFew" : "presenceIdleMany";
  return tf(key, { count: String(n) });
}

/** How often the status row asks while the page is open. */
const STATUS_POLL_MS = 5_000;

export default function PresenceTab() {
  const { form, setForm, field, errors, homeOff } = useSettings();
  const toggle = (key: "presenceVaultName" | "presenceButton" | "presenceServer") => ({
    value: form[key] === "on",
    onChange: (on: boolean) => setForm((f) => (f ? { ...f, [key]: on ? "on" : "off" } : f)),
  });
  const idleChoices = useMemo(() => {
    const stored = Number(form.presenceIdleMinutes);
    const all = Number.isInteger(stored) && stored > 0 && !IDLE_CHOICES.includes(stored) ? [...IDLE_CHOICES, stored] : IDLE_CHOICES;
    return [...all].sort((a, b) => a - b);
  }, [form.presenceIdleMinutes]);
  return (
    <section data-section="presence">
      <Row kind="segmented" label={t("rowPresenceMode")} hint={t("hintPresenceMode")} more={t("morePresenceMode")}>
        <SegmentedControl
          label={t("rowPresenceMode")}
          segments={[
            { value: "off", label: t("presenceModeOff") },
            { value: "activity", label: t("presenceModeActivity") },
            { value: "title", label: t("presenceModeTitle") },
          ]}
          {...field("presenceMode")}
        />
      </Row>
      <Row kind="text" label={t("rowPresenceClientId")} hint={t("hintPresenceClientId")} error={errors.presenceClientId}>
        {/* A number to paste, not words: machine text, left to right. */}
        <TextInput
          placeholder="123456789012345678"
          dir="ltr"
          autoComplete="off"
          label={t("rowPresenceClientId")}
          invalid={errors.presenceClientId !== undefined}
          {...field("presenceClientId")}
        />
      </Row>
      <Row kind="select" label={t("rowPresenceIdleAfter")} hint={t("hintPresenceIdleAfter")}>
        <Select label={t("rowPresenceIdleAfter")} options={idleChoices.map((n) => ({ value: String(n), label: idleLabel(n) }))} {...field("presenceIdleMinutes")} />
      </Row>
      <Row kind="segmented" label={t("rowPresenceIdle")} hint={t("hintPresenceIdle")}>
        <SegmentedControl
          label={t("rowPresenceIdle")}
          segments={[
            { value: "clear", label: t("presenceIdleClear") },
            { value: "show", label: t("presenceIdleShow") },
          ]}
          {...field("presenceIdle")}
        />
      </Row>
      <Row kind="toggle" label={t("rowPresenceVaultName")} hint={t("hintPresenceVaultName")}>
        <Toggle label={t("rowPresenceVaultName")} {...toggle("presenceVaultName")} />
      </Row>
      <Row kind="segmented" label={t("rowPresenceElapsed")} hint={t("hintPresenceElapsed")}>
        <SegmentedControl
          label={t("rowPresenceElapsed")}
          segments={[
            { value: "off", label: t("presenceElapsedOff") },
            { value: "subject", label: t("presenceElapsedSubject") },
            { value: "session", label: t("presenceElapsedSession") },
          ]}
          {...field("presenceElapsed")}
        />
      </Row>
      {/* The button links the public site, so it means nothing while visitors
          land in the read-only app; and Discord takes only an https address,
          which is SITE_URL's to say — the hint names both conditions rather
          than a second setting exposing the environment. */}
      <Row kind="toggle" off={homeOff} label={t("rowPresenceButton")} hint={t(homeOff ? "hintPresenceButtonOff" : "hintPresenceButton")}>
        <Toggle label={t("rowPresenceButton")} disabled={homeOff} {...toggle("presenceButton")} />
      </Row>
      {/* Drawn on the desktop too, so the page has the same rows everywhere
          (the settings index lists them once); there it is inert and says
          why — the app owns the one connection for every vault it opens. */}
      <Row kind="toggle" off={IS_DESKTOP} label={t("rowPresenceServer")} hint={t(IS_DESKTOP ? "hintPresenceServerDesktop" : "hintPresenceServer")} more={t("morePresenceServer")}>
        <Toggle label={t("rowPresenceServer")} disabled={IS_DESKTOP} {...toggle("presenceServer")} />
      </Row>
      <Row kind="status" label={t("rowPresenceStatus")} hint={t("hintPresenceStatus")}>
        <p className="s-smodal__status" dir="auto">
          <PresenceStatusText />
        </p>
      </Row>
      <Advanced tab="presence">
        <Row kind="segmented" label={t("rowPresenceAssets")} hint={t("hintPresenceAssets")} more={t("morePresenceAssets")}>
          <SegmentedControl
            label={t("rowPresenceAssets")}
            segments={[
              { value: "site", label: t("presenceAssetsSite") },
              { value: "uploaded", label: t("presenceAssetsUploaded") },
            ]}
            {...field("presenceAssets")}
          />
        </Row>
      </Advanced>
    </section>
  );
}

/** SETTINGS → DISCORD → STATUS. What the server's presence host says right
 *  now — the SAVED settings, not the form: a status for an id nobody has
 *  saved would be a promise the Save has not made (AskStatusBlock's rule).
 *  One muted line of one or two sentences, the catalogue's status kind. */
function PresenceStatusText() {
  useStore((s) => s.language);
  const [status, setStatus] = useState<PresenceStatus | null | undefined>(undefined);
  useEffect(() => {
    const ctl = new AbortController();
    const load = (): void => {
      getPresenceStatus(ctl.signal)
        .then(setStatus)
        .catch(() => {
          if (!ctl.signal.aborted) setStatus(null);
        });
    };
    load();
    const timer = window.setInterval(load, STATUS_POLL_MS);
    return () => {
      ctl.abort();
      window.clearInterval(timer);
    };
  }, []);
  if (status === undefined) return <>…</>;
  if (status === null) return <>{t("presenceStatUnavailable")}</>;
  return <>{presenceStatusLines(status).map((l) => (l.preview === undefined ? t(l.key) : tf(l.key, { activity: l.preview }))).join(" ")}</>;
}
