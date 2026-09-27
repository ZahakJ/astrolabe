// THE SETTINGS INDEX — what a search across the panel matches against.
//
// GENERATED from the panel's own source by `node scripts/gen-settings-index.mjs`,
// and held there by `npm run check-settings`. It is generated rather than
// hand-kept for the obvious reason: a hundred rows spread over a dozen files
// will drift from any list a human maintains, and a search that silently stops
// finding a row is worse than no search — the reader concludes the setting does
// not exist.
//
// It carries KEYS, not words. The search resolves them through `t()` at the
// moment it runs, so an Arabic instance searches Arabic labels and an English
// one searches English, from one index.

import type { I18nKey } from "../../i18n.ts";
import type { ControlKind } from "./catalogue.ts";

export interface SettingEntry {
  /** The page this row lives in — `TABS[].id` in settings/tabs.ts. */
  tab: string;
  /** The rail group of that page — `GROUPS[].id` (You · Your site · Data ·
   *  App), read out of tabs.ts with the page. */
  group: "you" | "site" | "data" | "app";
  /** The row's label key. Also how a result finds its row in the DOM: `Row`
   *  stamps the RESOLVED label as `data-setting`, and the result resolves the
   *  same key to look it up. */
  label: I18nKey;
  /** Which control of the catalogue draws it (contracts/settings-design.md;
   *  `kind` on the row in the source). The browser walk sets every row by
   *  its kind and reads it back after a reload. */
  kind: ControlKind;
  /** Kept in this browser (or by the desktop install) and saved as it
   *  changes: it never raises the Save bar. */
  device?: true;
  hint?: I18nKey;
  /** The paragraph(s) behind the row's ⓘ — searched too, because the word a
   *  reader types is often in the reference text and not in the label. */
  more?: I18nKey[];
  /** The environment variable behind the row's ⓘ, when it has one. Searching
   *  `SITE_LANG` and landing on the row is the operator's half of this. */
  env?: string;
  /** WHICH KIND OF VAULT DRAWS THIS ROW, when it is not both. A pocket vault
   *  (a repository cloned onto a phone — mobile/src/pocket/) has no public
   *  site and no server-side repository, so Collections, Ask, the site's
   *  publishing rows and the whole repository side of Backup & sync are
   *  `instance`; the pocket's own Backup & sync rows are `pocket`. Read
   *  off the panel's own render condition (`{tab === "ask" && !pocket && …}`
   *  in TabBody.tsx, `<InstanceOnly>` inside a section) by
   *  scripts/settings-index.mjs, so the index cannot drift from what is drawn. The SEARCH honours it: a hit
   *  that scrolls to a row this vault does not have is the exact failure the
   *  index exists to prevent. */
  mode?: "instance" | "pocket";
  /** A PART, not a row: a control folded into the row whose label this is
   *  (`<Part>` in settings/Row.tsx — the audit's MERGE). It keeps its own
   *  label so a search finds it, and it stamps its own `data-setting`, so the
   *  hit lands on it; it does not count against a section's eighteen rows. */
  row?: I18nKey;
  /** Behind the section's Advanced line (settings/Fold.tsx), which a hit
   *  opens before it scrolls. */
  adv?: true;
}

export const SETTINGS_INDEX: SettingEntry[] = [
  { tab: "appearance", group: "you", label: "rowYourTheme", kind: "select", device: true, hint: "hintYourTheme" },
  { tab: "appearance", group: "you", label: "rowScreenWarmth", kind: "slider", device: true, hint: "hintScreenWarmth" },
  { tab: "appearance", group: "you", label: "rowScreenDim", kind: "slider", device: true, hint: "hintScreenDim" },
  { tab: "appearance", group: "you", label: "rowSidebarSide", kind: "segmented", device: true, hint: "hintSidebarSide" },
  { tab: "appearance", group: "you", label: "rowEditorWidth", kind: "segmented", device: true, hint: "hintEditorWidth" },
  { tab: "appearance", group: "you", label: "editorWidthCustom", kind: "text", hint: "editorWidthCustomHint", row: "rowEditorWidth" },
  { tab: "type", group: "you", label: "rowTextDirection", kind: "segmented", hint: "hintTextDirection", more: ["noteLayoutOverride"] },
  { tab: "type", group: "you", label: "rowTextAlign", kind: "select", hint: "hintTextAlign" },
  { tab: "type", group: "you", label: "rowFontProse", kind: "select", hint: "hintFontProse", more: ["typographyNote"] },
  { tab: "type", group: "you", label: "rowFontUi", kind: "select", hint: "hintFontUi" },
  { tab: "type", group: "you", label: "rowFontMono", kind: "select", hint: "hintFontMono" },
  { tab: "type", group: "you", label: "rowFontArabic", kind: "select", hint: "hintFontArabic" },
  { tab: "type", group: "you", label: "rowSizeAdjust", kind: "text", hint: "hintSizeAdjust" },
  { tab: "language", group: "you", label: "rowEditorLanguage", kind: "segmented", device: true, hint: "hintEditorLanguage" },
  { tab: "language", group: "you", label: "rowLanguage", kind: "segmented", hint: "hintLanguage", env: "SITE_LANG" },
  { tab: "language", group: "you", label: "rowSpellDicts", kind: "chips", device: true, hint: "hintSpellDicts", more: ["moreSpellDicts"] },
  { tab: "language", group: "you", label: "rowLanguageFilter", kind: "select", hint: "hintLanguageFilter", env: "LANGUAGE_FILTER" },
  { tab: "language", group: "you", label: "rowLanguageToggle", kind: "toggle", hint: "hintLanguageToggle", more: ["visitorSwitchNote"] },
  { tab: "dates", group: "you", label: "rowDateCalendar", kind: "segmented", hint: "hintDateCalendar" },
  { tab: "dates", group: "you", label: "rowDateOrder", kind: "segmented", hint: "hintDateOrder" },
  { tab: "dates", group: "you", label: "rowDateSeparator", kind: "segmented", hint: "hintDateSeparator", row: "rowDateOrder" },
  { tab: "dates", group: "you", label: "rowDateLocale", kind: "text", hint: "hintDateLocale", env: "BLOG_LOCALE", adv: true },
  { tab: "writing", group: "you", label: "rowLaunch", kind: "select", hint: "hintLaunch" },
  { tab: "writing", group: "you", label: "rowLaunchNote", kind: "path", hint: "hintLaunchNote", row: "rowLaunch" },
  { tab: "writing", group: "you", label: "selToolbarLabel", kind: "toggle", device: true, hint: "hintSelToolbar" },
  { tab: "writing", group: "you", label: "rowFrenchAutocorrect", kind: "toggle", device: true, hint: "hintFrenchAutocorrect", more: ["moreFrenchAutocorrect"] },
  { tab: "writing", group: "you", label: "rowEmptyPropsCard", kind: "toggle", hint: "hintEmptyPropsCard" },
  { tab: "writing", group: "you", label: "rowAttachmentLocation", kind: "select", hint: "hintAttachmentLocation" },
  { tab: "writing", group: "you", label: "rowAttachmentFolder", kind: "path", row: "rowAttachmentLocation" },
  { tab: "writing", group: "you", label: "rowTagsFolder", kind: "path", hint: "hintTagsFolder" },
  { tab: "writing", group: "you", label: "tagLabelsRowLabel", kind: "table", hint: "tagLabelsPageWins", more: ["tagLabelsNote"] },
  { tab: "writing", group: "you", label: "drawingsFolderLabel", kind: "path", hint: "drawingsFolderHint", adv: true },
  { tab: "notes", group: "you", label: "templatesFolderLabel", kind: "path", hint: "templatesFolderHint" },
  { tab: "notes", group: "you", label: "defaultTemplateLabel", kind: "path", hint: "defaultTemplateHint", more: ["templatePlaceholdersHint"] },
  { tab: "notes", group: "you", label: "periodicRowLabel", kind: "table", hint: "periodicRowHint", more: ["periodicFormatNote"] },
  { tab: "notes", group: "you", label: "uniqueRowLabel", kind: "text", hint: "uniqueFolderHint", more: ["uniqueFormatHint"] },
  { tab: "notes", group: "you", label: "captureInboxLabel", kind: "path", hint: "captureInboxHint", more: ["moreCaptureInbox"] },
  { tab: "notes", group: "you", label: "clipperLabel", kind: "action", hint: "clipperHint", more: ["moreClipper"] },
  { tab: "reading", group: "you", label: "rowHeadingNumbers", kind: "toggle", device: true, hint: "hintHeadingNumbers" },
  { tab: "reading", group: "you", label: "rowPdfSearch", kind: "segmented", hint: "hintPdfSearch", env: "PDF_SEARCH" },
  { tab: "reading", group: "you", label: "rowFeeds", kind: "toggle", hint: "hintFeeds", more: ["moreFeeds"] },
  { tab: "reading", group: "you", label: "feedsNoteField", kind: "path", row: "rowFeeds" },
  { tab: "reading", group: "you", label: "hadithFolderLabel", kind: "path", hint: "hadithFolderHint", more: ["moreHadithFolder"], adv: true },
  { tab: "speech", group: "you", label: "rowReadAloud", kind: "table", hint: "hintReadAloud", more: ["moreReadAloud"] },
  { tab: "speech", group: "you", label: "rowReadersListen", kind: "toggle", hint: "hintReadersListen", mode: "instance" },
  { tab: "speech", group: "you", label: "rowVoiceLanguage", kind: "segmented", hint: "hintVoiceLanguage", more: ["moreVoiceLanguage"] },
  { tab: "speech", group: "you", label: "rowVoiceModel", kind: "select", hint: "hintVoiceModel", more: ["moreVoiceModel"] },
  { tab: "speech", group: "you", label: "rowVoiceKeepAudio", kind: "toggle", hint: "hintVoiceKeepAudio" },
  { tab: "speech", group: "you", label: "rowOwnVoices", kind: "table", hint: "hintOwnVoices", more: ["moreOwnVoices"], adv: true },
  { tab: "site", group: "site", label: "rowSiteName", kind: "text", env: "SITE_NAME" },
  { tab: "site", group: "site", label: "rowTagline", kind: "text", hint: "hintTagline", env: "SITE_TAGLINE" },
  { tab: "site", group: "site", label: "rowLogo", kind: "path", hint: "hintLogo" },
  { tab: "site", group: "site", label: "rowFavicon", kind: "path", hint: "hintFavicon" },
  { tab: "site", group: "site", label: "rowDefaultTheme", kind: "select", hint: "hintDefaultTheme", env: "DEFAULT_THEME" },
  { tab: "site", group: "site", label: "rowAmbient", kind: "toggle", hint: "hintAmbient", mode: "instance" },
  { tab: "site", group: "site", label: "rowFooter", kind: "text", hint: "hintFooter", env: "SITE_FOOTER", adv: true },
  { tab: "publishing", group: "site", label: "rowPublicLayout", kind: "segmented", hint: "hintPublicLayout", env: "PUBLIC_LAYOUT", mode: "instance" },
  { tab: "publishing", group: "site", label: "rowOpenDesigner", kind: "action", hint: "hintOpenDesigner", mode: "instance", row: "rowPublicLayout" },
  { tab: "publishing", group: "site", label: "rowMode", kind: "segmented", hint: "hintMode", mode: "instance" },
  { tab: "publishing", group: "site", label: "rowHomeNote", kind: "path", hint: "hintHomeNote", env: "HOME_NOTE", mode: "instance" },
  { tab: "publishing", group: "site", label: "rowHomeBanner", kind: "path", hint: "hintHomeBanner", mode: "instance" },
  { tab: "publishing", group: "site", label: "rowShareButtons", kind: "toggle", hint: "hintShareButtons", mode: "instance" },
  { tab: "publishing", group: "site", label: "rowExternalVideo", kind: "toggle", hint: "hintExternalVideo", more: ["moreExternalVideo"], mode: "instance" },
  { tab: "publishing", group: "site", label: "rowExcludeTags", kind: "text", hint: "hintExcludeTags", env: "EXCLUDE_TAGS", mode: "instance", adv: true },
  { tab: "publishing", group: "site", label: "rowAuthorSites", kind: "text", hint: "hintAuthorSites", mode: "instance", adv: true },
  { tab: "conversation", group: "site", label: "rowComments", kind: "segmented", hint: "hintComments", env: "COMMENTS", mode: "instance" },
  { tab: "conversation", group: "site", label: "rowWebmentions", kind: "toggle", hint: "hintWebmentions", more: ["moreWebmentionsAccept", "moreWebmentionsSend"], mode: "instance" },
  { tab: "conversation", group: "site", label: "rowWebmentionsAccept", kind: "toggle", hint: "hintWebmentionsAccept", mode: "instance", row: "rowWebmentions" },
  { tab: "conversation", group: "site", label: "rowWebmentionsSend", kind: "toggle", hint: "hintWebmentionsSend", mode: "instance", row: "rowWebmentions" },
  { tab: "conversation", group: "site", label: "rowFediverse", kind: "toggle", hint: "hintFediverse", more: ["moreFediverse"], mode: "instance" },
  { tab: "conversation", group: "site", label: "rowFediverseHandle", kind: "text", hint: "hintFediverseHandle", mode: "instance", row: "rowFediverse" },
  { tab: "collections", group: "site", label: "rowTopicsMode", kind: "segmented", hint: "hintTopicsMode", mode: "instance" },
  { tab: "collections", group: "site", label: "rowPublicFolders", kind: "toggle", hint: "hintPublicFolders", mode: "instance" },
  { tab: "collections", group: "site", label: "rowPublicFoldersList", kind: "table", hint: "hintPublicFoldersList", mode: "instance" },
  { tab: "collections", group: "site", label: "rowPublicFoldersHome", kind: "toggle", hint: "hintPublicFoldersHome", mode: "instance" },
  { tab: "collections", group: "site", label: "rowPublicFoldersNav", kind: "toggle", hint: "hintPublicFoldersNav", mode: "instance" },
  { tab: "library", group: "site", label: "rowLibrary", kind: "toggle", hint: "hintLibrary", more: ["libraryNote"], mode: "instance" },
  { tab: "library", group: "site", label: "rowLibraryTitle", kind: "text", hint: "hintLibraryTitle", mode: "instance" },
  { tab: "library", group: "site", label: "rowLibraryNav", kind: "toggle", hint: "hintLibraryNav", mode: "instance" },
  { tab: "library", group: "site", label: "rowLibraryHome", kind: "toggle", hint: "hintLibraryHome", mode: "instance" },
  { tab: "library", group: "site", label: "rowLibraryRoots", kind: "table", hint: "hintLibraryRoots", mode: "instance" },
  { tab: "library", group: "site", label: "rowLibraryPaths", kind: "table", hint: "hintLibraryPaths", mode: "instance" },
  { tab: "sync", group: "data", label: "rowSyncEnabled", kind: "toggle", hint: "hintSyncEnabled", mode: "instance" },
  { tab: "sync", group: "data", label: "rowSyncRemote", kind: "text", hint: "hintSyncRemote", mode: "instance" },
  { tab: "sync", group: "data", label: "rowSyncAuth", kind: "segmented", hint: "hintSyncAuth", mode: "instance" },
  { tab: "sync", group: "data", label: "rowSyncToken", kind: "text", hint: "hintSyncToken", mode: "instance" },
  { tab: "sync", group: "data", label: "rowSyncUser", kind: "text", hint: "hintSyncUser", mode: "instance", row: "rowSyncToken" },
  { tab: "sync", group: "data", label: "rowSyncInterval", kind: "select", hint: "hintSyncInterval", mode: "instance" },
  { tab: "sync", group: "data", label: "rowSyncStatus", kind: "status", hint: "hintSyncStatus", mode: "instance" },
  { tab: "sync", group: "data", label: "rowPocketRepo", kind: "status", hint: "hintPocketRepo", mode: "pocket" },
  { tab: "sync", group: "data", label: "rowPocketState", kind: "status", hint: "hintPocketState", mode: "pocket" },
  { tab: "sync", group: "data", label: "rowPocketConflicts", kind: "status", hint: "hintPocketConflicts", mode: "pocket" },
  { tab: "sync", group: "data", label: "rowPocketLeave", kind: "action", hint: "hintPocketLeave", mode: "pocket" },
  { tab: "sync", group: "data", label: "rowSyncBranch", kind: "text", hint: "hintSyncBranch", mode: "instance", adv: true },
  { tab: "sync", group: "data", label: "rowSyncPull", kind: "toggle", hint: "hintSyncPull", mode: "instance", adv: true },
  { tab: "versions", group: "data", label: "rowNoteVersions", kind: "segmented", hint: "hintNoteVersions", more: ["moreNoteVersions"], env: "NOTE_VERSIONS" },
  { tab: "versions", group: "data", label: "rowTravel", kind: "status", hint: "hintTravel", mode: "instance" },
  { tab: "versions", group: "data", label: "rowPrefsSync", kind: "toggle", device: true, hint: "hintPrefsSync" },
  { tab: "ask", group: "data", label: "rowAskProvider", kind: "segmented", hint: "hintAskProvider", mode: "instance" },
  { tab: "ask", group: "data", label: "rowAskChatModel", kind: "text", hint: "hintAskChatModel", mode: "instance" },
  { tab: "ask", group: "data", label: "rowAskAnthropicModel", kind: "text", hint: "hintAskAnthropicModel", mode: "instance" },
  { tab: "ask", group: "data", label: "rowAskKey", kind: "text", hint: "hintAskKey", mode: "instance" },
  { tab: "ask", group: "data", label: "rowAskStatus", kind: "status", hint: "hintAskStatus", mode: "instance" },
  { tab: "ask", group: "data", label: "rowAskEmbedModel", kind: "text", hint: "hintAskEmbedModel", mode: "instance", adv: true },
  { tab: "ask", group: "data", label: "rowAskTopK", kind: "text", hint: "hintAskTopK", mode: "instance", adv: true },
  { tab: "device", group: "app", label: "rowOffline", kind: "toggle", device: true, hint: "hintOffline" },
  { tab: "device", group: "app", label: "rowVimKeys", kind: "toggle", device: true, hint: "hintVimKeys" },
  { tab: "device", group: "app", label: "rowRelativeLines", kind: "toggle", hint: "hintRelativeLines", row: "rowVimKeys" },
  { tab: "device", group: "app", label: "rowWhatsNew", kind: "toggle", device: true, hint: "hintWhatsNew" },
  { tab: "device", group: "app", label: "rowAppName", kind: "text", device: true, hint: "hintAppName" },
  { tab: "device", group: "app", label: "rowAppIcon", kind: "action", device: true, hint: "hintAppIcon" },
  { tab: "device", group: "app", label: "rowUpdates", kind: "segmented", device: true, hint: "hintUpdates" },
];
