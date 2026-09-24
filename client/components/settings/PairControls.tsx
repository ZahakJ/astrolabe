// Two Vault rows that answer one question with two controls (3.28): the
// unique note's folder and name, and Feeds' switch and list note. Their own
// file, like PeriodicForm, so the settings index counts the ROW once and not
// each field inside it (scripts/settings-index.mjs reads the tab's own file).

import { t } from "../../i18n.ts";
import { TextInput, Toggle } from "../controls/Fields.tsx";
import { PathInput } from "../controls/PathInput.tsx";

interface FieldProps {
  value: string;
  onChange: (v: string) => void;
}

export function UniqueNoteFields({ folder, format, folderInForce, formatInForce, vaultRoot }: { folder: FieldProps; format: FieldProps; folderInForce: string; formatInForce: string; vaultRoot: string }) {
  return (
    <div className="s-smodal__pair" role="group" aria-label={t("uniqueRowLabel")}>
      <TextInput placeholder={folderInForce || vaultRoot} dir="ltr" label={t("uniqueFolderLabel")} {...folder} />
      <TextInput placeholder={formatInForce} dir="ltr" label={t("uniqueFormatLabel")} {...format} />
    </div>
  );
}

export function FeedsFields({ fetch, onFetch, note, noteInForce }: { fetch: boolean; onFetch: (on: boolean) => void; note: FieldProps; noteInForce: string }) {
  return (
    <div className="s-smodal__pair" role="group" aria-label={t("rowFeeds")}>
      <Toggle label={t("feedsFetchToggle")} onLabel={t("on")} offLabel={t("off")} value={fetch} onChange={onFetch} />
      <PathInput kind="note" placeholder={noteInForce} label={t("feedsNoteField")} {...note} />
    </div>
  );
}
