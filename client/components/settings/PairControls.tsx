// A row that answers one question with two fields (3.28): the unique note's
// folder and name. Its own file, like PeriodicForm, so the settings index
// counts the ROW once and not each field inside it (scripts/settings-index.mjs
// reads the page's own file). Feeds' switch and list note, which shared this
// file, became a switch with a part under it in the second settings pass.

import { t } from "../../i18n.ts";
import { TextInput } from "../controls/Fields.tsx";

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
