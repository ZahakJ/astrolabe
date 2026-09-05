// The NAME of each folder glyph, in the reader's language.
//
// Read from the catalog (shared/folderIconCatalog.ts) rather than from the
// i18n dictionary: three hundred glyph names in two languages are the
// picker's business and the settings panel's, and a dictionary row is loaded
// by every bundle. The catalog is only ever imported by the two admin chunks
// that print a glyph's name. check-i18n cannot see these strings, which is
// fine — they are DATA (a Lucide icon's name), not chrome copy, and the
// catalog holds both languages side by side so neither can go missing.

import { FOLDER_ICON_BY_NAME, FOLDER_ICON_GROUPS, type FolderIconGroupId } from "../shared/folderIconCatalog.ts";
import type { FolderIcon } from "../shared/folderIcons.ts";
import { getLang, t, type I18nKey } from "./i18n.ts";

/** The localized name of one glyph — a button's accessible name, a select
 *  row's text. Read at call time, never cached: the chrome language can
 *  change under a mounted component. */
export function folderIconLabel(icon: FolderIcon): string {
  const entry = FOLDER_ICON_BY_NAME.get(icon);
  if (!entry) return icon;
  return getLang() === "ar" ? entry.ar : entry.en;
}

/** The shelves the picker sorts the set onto. Spelled out rather than
 *  computed so check-i18n counts every key as used. */
const GROUP_KEYS: Record<FolderIconGroupId, I18nKey> = {
  make: "folderIconGroupMake",
  study: "folderIconGroupStudy",
  tech: "folderIconGroupTech",
  play: "folderIconGroupPlay",
  go: "folderIconGroupGo",
  nature: "folderIconGroupNature",
  life: "folderIconGroupLife",
  work: "folderIconGroupWork",
  marks: "folderIconGroupMarks",
};

export function folderIconGroupLabel(id: FolderIconGroupId): string {
  return t(GROUP_KEYS[id]);
}

export { FOLDER_ICON_GROUPS };
