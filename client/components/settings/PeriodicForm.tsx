// THE PERIODIC-NOTES SUB-FORM: one folder, four kinds, a name and a
// template each (Settings → Vault → Periodic notes).
//
// It used to be five rows of the Vault tab — daily folder, daily name, daily
// template, weekly name, weekly template — and the month and the year would
// have made it nine, in a tab that holds eighteen. Nine rows that ask the
// same two questions four times over are a table, not a list: the kind down
// the side, the name and the template across, the folder above them all
// because the four share it. The Vault tab keeps ONE row for the whole
// thing and the settings search finds it by that row's words.
//
// The inputs here are the panel's own controls (TextInput, PathInput) with
// their own accessible names, because they sit outside a Row and no
// <label> is wired onto them for free. A blank field beside a working
// feature must say what is in force, so every placeholder is the value in
// force (the Vault tab's rule for the templates folder).

import { PathInput } from "../controls/PathInput.tsx";
import { TextInput } from "../controls/Fields.tsx";
import { t, type I18nKey } from "../../i18n.ts";
import { PERIOD_KINDS, type PeriodKind } from "../../../shared/periodic.ts";

/** The slice of the settings form this sub-form edits. */
export interface PeriodicFields {
  dailyFolder: string;
  dailyFormat: string;
  dailyTemplate: string;
  weeklyFormat: string;
  weeklyTemplate: string;
  monthlyFormat: string;
  monthlyTemplate: string;
  yearlyFormat: string;
  yearlyTemplate: string;
}

/** What is in force, for the placeholders. A null format is a kind turned off. */
export interface PeriodicInForce {
  dailyFolder: string;
  templatesFolder: string | null;
  formats: Record<PeriodKind, string | null>;
}

const FORMAT_KEY: Record<PeriodKind, keyof PeriodicFields> = {
  day: "dailyFormat",
  week: "weeklyFormat",
  month: "monthlyFormat",
  year: "yearlyFormat",
};
const TEMPLATE_KEY: Record<PeriodKind, keyof PeriodicFields> = {
  day: "dailyTemplate",
  week: "weeklyTemplate",
  month: "monthlyTemplate",
  year: "yearlyTemplate",
};
const KIND_LABEL: Record<PeriodKind, I18nKey> = {
  day: "periodKindDay",
  week: "periodKindWeek",
  month: "periodKindMonth",
  year: "periodKindYear",
};
const NAME_LABEL: Record<PeriodKind, I18nKey> = {
  day: "dailyFormatLabel",
  week: "weeklyFormatLabel",
  month: "monthlyFormatLabel",
  year: "yearlyFormatLabel",
};
const TEMPLATE_LABEL: Record<PeriodKind, I18nKey> = {
  day: "dailyTemplateLabel",
  week: "weeklyTemplateLabel",
  month: "monthlyTemplateLabel",
  year: "yearlyTemplateLabel",
};
/** The conventional template file per kind, for the placeholder. */
const TEMPLATE_FILE: Record<PeriodKind, string> = { day: "Daily.md", week: "Weekly.md", month: "Monthly.md", year: "Yearly.md" };

export function PeriodicForm({
  id,
  form,
  inForce,
  onChange,
}: {
  /** The Row's control id, so its label names this group. */
  id?: string;
  form: PeriodicFields;
  inForce: PeriodicInForce;
  onChange: (key: keyof PeriodicFields, value: string) => void;
}) {
  const templates = inForce.templatesFolder ?? "Templates";
  return (
    <div className="s-periodic" id={id} role="group" aria-label={t("periodicRowLabel")}>
      <label className="s-periodic__folder">
        <span className="s-periodic__folderlabel">{t("dailyFolderLabel")}</span>
        <TextInput
          placeholder={inForce.dailyFolder || "/"}
          dir="ltr"
          label={t("dailyFolderLabel")}
          value={form.dailyFolder}
          onChange={(v) => onChange("dailyFolder", v)}
        />
      </label>
      <div className="s-periodic__grid" role="table" aria-label={t("periodicRowLabel")}>
        <div className="s-periodic__head" role="row">
          <span role="columnheader" className="s-periodic__kind" />
          <span role="columnheader" className="s-periodic__col">{t("periodicColName")}</span>
          <span role="columnheader" className="s-periodic__col">{t("periodicColTemplate")}</span>
        </div>
        {PERIOD_KINDS.map((kind) => {
          const format = inForce.formats[kind];
          return (
            <div key={kind} className="s-periodic__row" role="row">
              <span role="rowheader" className="s-periodic__kind">{t(KIND_LABEL[kind])}</span>
              <span role="cell">
                <TextInput
                  placeholder={format ?? t("off")}
                  dir="ltr"
                  label={t(NAME_LABEL[kind])}
                  value={form[FORMAT_KEY[kind]]}
                  onChange={(v) => onChange(FORMAT_KEY[kind], v)}
                />
              </span>
              <span role="cell">
                <PathInput
                  kind="note"
                  placeholder={`${templates}/${TEMPLATE_FILE[kind]}`}
                  label={t(TEMPLATE_LABEL[kind])}
                  value={form[TEMPLATE_KEY[kind]]}
                  onChange={(v) => onChange(TEMPLATE_KEY[kind], v)}
                />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
