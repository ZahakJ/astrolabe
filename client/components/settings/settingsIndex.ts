// THE SETTINGS INDEX — what a search across the panel matches against.
//
// GENERATED from the panel's own source by `node scripts/gen-settings-index.mjs`,
// and held there by `npm run check-settings`. It is generated rather than
// hand-kept for the obvious reason: eighty-eight rows spread over two files
// will drift from any list a human maintains, and a search that silently stops
// finding a row is worse than no search — the reader concludes the setting does
// not exist.
//
// It carries KEYS, not words. The search resolves them through `t()` at the
// moment it runs, so an Arabic instance searches Arabic labels and an English
// one searches English, from one index.

import type { I18nKey } from "../../i18n.ts";

export interface SettingEntry {
  /** The tab this row lives on — `TABS[].id` in settings/tabs.ts. */
  tab: string;
  /** The row's label key. Also how a result finds its row in the DOM: `Row`
   *  stamps the RESOLVED label as `data-setting`, and the result resolves the
   *  same key to look it up. */
  label: I18nKey;
  hint?: I18nKey;
  /** The environment variable behind the row's ⓘ, when it has one. Searching
   *  `SITE_LANG` and landing on the row is the operator's half of this. */
  env?: string;
  /** WHICH KIND OF VAULT DRAWS THIS ROW, when it is not both. A pocket vault
   *  (a repository cloned onto a phone — mobile/src/pocket/) has no public
   *  site and no server-side repository, so Publishing, Collections and the
   *  whole git-sync tab are `instance`; the pocket's own Backup & sync rows
   *  are `pocket`. Read off the panel's own render condition
   *  (`{tab === "sync" && !pocket && (`) by scripts/settings-index.mjs, so
   *  the index cannot drift from what is drawn. The SEARCH honours it: a hit
   *  that scrolls to a row this vault does not have is the exact failure the
   *  index exists to prevent. */
  mode?: "instance" | "pocket";
}

export const SETTINGS_INDEX: SettingEntry[] = [
  { tab: "device", label: "rowAppName", hint: "hintAppName" },
  { tab: "device", label: "rowAppIcon", hint: "hintAppIcon" },
  { tab: "device", label: "rowUpdates", hint: "hintUpdates" },
  { tab: "device", label: "rowYourTheme", hint: "hintYourTheme" },
  { tab: "device", label: "rowScreenWarmth", hint: "hintScreenWarmth" },
  { tab: "device", label: "rowScreenDim", hint: "hintScreenDim" },
  { tab: "device", label: "rowEditorLanguage", hint: "hintEditorLanguage" },
  { tab: "device", label: "rowSidebarSide", hint: "hintSidebarSide" },
  { tab: "device", label: "rowEditorWidth", hint: "hintEditorWidth" },
  { tab: "device", label: "editorWidthCustom" },
  { tab: "device", label: "rowVimKeys", hint: "hintVimKeys" },
  { tab: "device", label: "rowRelativeLines", hint: "hintRelativeLines" },
  { tab: "device", label: "selToolbarLabel", hint: "hintSelToolbar" },
  { tab: "device", label: "rowHeadingNumbers", hint: "hintHeadingNumbers" },
  { tab: "device", label: "rowFrenchAutocorrect", hint: "hintFrenchAutocorrect" },
  { tab: "device", label: "rowWhatsNew", hint: "hintWhatsNew" },
  { tab: "device", label: "rowOffline", hint: "hintOffline" },
  { tab: "device", label: "rowPrefsSync", hint: "hintPrefsSync" },
  { tab: "site", label: "rowSiteName", env: "SITE_NAME" },
  { tab: "site", label: "rowTagline", hint: "hintTagline", env: "SITE_TAGLINE" },
  { tab: "site", label: "rowFooter", hint: "hintFooter", env: "SITE_FOOTER" },
  { tab: "site", label: "rowLogo", hint: "hintLogo" },
  { tab: "site", label: "rowFavicon", hint: "hintFavicon" },
  { tab: "site", label: "rowDefaultTheme", hint: "hintDefaultTheme", env: "DEFAULT_THEME" },
  { tab: "site", label: "rowFontProse", hint: "hintFontProse" },
  { tab: "site", label: "rowFontUi", hint: "hintFontUi" },
  { tab: "site", label: "rowFontMono", hint: "hintFontMono" },
  { tab: "site", label: "rowFontArabic", hint: "hintFontArabic" },
  { tab: "site", label: "rowSizeAdjust", hint: "hintSizeAdjust" },
  { tab: "language", label: "rowLanguage", hint: "hintLanguage", env: "SITE_LANG" },
  { tab: "language", label: "rowSpellDicts", hint: "hintSpellDicts" },
  { tab: "language", label: "rowDateLocale", hint: "hintDateLocale", env: "BLOG_LOCALE" },
  { tab: "language", label: "rowLanguageFilter", hint: "hintLanguageFilter", env: "LANGUAGE_FILTER" },
  { tab: "language", label: "rowLanguageToggle", hint: "hintLanguageToggle" },
  { tab: "language", label: "rowDateCalendar", hint: "hintDateCalendar" },
  { tab: "language", label: "rowDateOrder", hint: "hintDateOrder" },
  { tab: "language", label: "rowDateSeparator", hint: "hintDateSeparator" },
  { tab: "language", label: "rowTextDirection", hint: "hintTextDirection" },
  { tab: "language", label: "rowTextAlign", hint: "hintTextAlign" },
  { tab: "language", label: "rowEmptyPropsCard", hint: "hintEmptyPropsCard" },
  { tab: "language", label: "rowVoiceLanguage", hint: "hintVoiceLanguage" },
  { tab: "language", label: "tagLabelsRowLabel", hint: "tagLabelsPageWins" },
  { tab: "publishing", label: "rowPublicLayout", hint: "hintPublicLayout", env: "PUBLIC_LAYOUT", mode: "instance" },
  { tab: "publishing", label: "rowOpenDesigner", hint: "hintOpenDesigner", mode: "instance" },
  { tab: "publishing", label: "rowExcludeTags", hint: "hintExcludeTags", env: "EXCLUDE_TAGS", mode: "instance" },
  { tab: "publishing", label: "rowComments", hint: "hintComments", env: "COMMENTS", mode: "instance" },
  { tab: "publishing", label: "rowShareButtons", hint: "hintShareButtons", mode: "instance" },
  { tab: "publishing", label: "rowAmbient", hint: "hintAmbient", mode: "instance" },
  { tab: "publishing", label: "rowAuthorSites", hint: "hintAuthorSites", mode: "instance" },
  { tab: "publishing", label: "rowMode", hint: "hintMode", mode: "instance" },
  { tab: "publishing", label: "rowHomeNote", hint: "hintHomeNote", env: "HOME_NOTE", mode: "instance" },
  { tab: "publishing", label: "rowHomeBanner", hint: "hintHomeBanner", mode: "instance" },
  { tab: "collections", label: "rowTopicsMode", hint: "hintTopicsMode", mode: "instance" },
  { tab: "collections", label: "rowPublicFolders", hint: "hintPublicFolders", mode: "instance" },
  { tab: "collections", label: "rowPublicFoldersList", hint: "hintPublicFoldersList", mode: "instance" },
  { tab: "collections", label: "rowPublicFoldersHome", hint: "hintPublicFoldersHome", mode: "instance" },
  { tab: "collections", label: "rowPublicFoldersNav", hint: "hintPublicFoldersNav", mode: "instance" },
  { tab: "collections", label: "rowLibrary", hint: "hintLibrary", mode: "instance" },
  { tab: "collections", label: "rowLibraryTitle", hint: "hintLibraryTitle", mode: "instance" },
  { tab: "collections", label: "rowLibraryNav", hint: "hintLibraryNav", mode: "instance" },
  { tab: "collections", label: "rowLibraryHome", hint: "hintLibraryHome", mode: "instance" },
  { tab: "collections", label: "rowLibraryRoots", hint: "hintLibraryRoots", mode: "instance" },
  { tab: "collections", label: "rowLibraryPaths", hint: "hintLibraryPaths", mode: "instance" },
  { tab: "vault", label: "templatesFolderLabel", hint: "templatesFolderHint" },
  { tab: "vault", label: "hadithFolderLabel", hint: "hadithFolderHint" },
  { tab: "vault", label: "defaultTemplateLabel", hint: "defaultTemplateHint" },
  { tab: "vault", label: "periodicRowLabel", hint: "periodicRowHint" },
  { tab: "vault", label: "uniqueRowLabel", hint: "uniqueFolderHint" },
  { tab: "vault", label: "captureInboxLabel", hint: "captureInboxHint" },
  { tab: "vault", label: "clipperLabel", hint: "clipperHint" },
  { tab: "vault", label: "rowFeeds", hint: "hintFeeds" },
  { tab: "vault", label: "rowVoiceModel", hint: "hintVoiceModel" },
  { tab: "vault", label: "rowVoiceKeepAudio", hint: "hintVoiceKeepAudio" },
  { tab: "vault", label: "drawingsFolderLabel", hint: "drawingsFolderHint" },
  { tab: "vault", label: "rowLaunch", hint: "hintLaunch" },
  { tab: "vault", label: "rowLaunchNote", hint: "hintLaunchNote" },
  { tab: "vault", label: "rowAttachmentLocation", hint: "hintAttachmentLocation" },
  { tab: "vault", label: "rowAttachmentFolder" },
  { tab: "vault", label: "rowTagsFolder", hint: "hintTagsFolder" },
  { tab: "vault", label: "rowNoteVersions", hint: "hintNoteVersions", env: "NOTE_VERSIONS" },
  { tab: "vault", label: "rowPdfSearch", hint: "hintPdfSearch", env: "PDF_SEARCH" },
  { tab: "sync", label: "rowSyncEnabled", hint: "hintSyncEnabled", mode: "instance" },
  { tab: "sync", label: "rowSyncRemote", hint: "hintSyncRemote", mode: "instance" },
  { tab: "sync", label: "rowSyncBranch", hint: "hintSyncBranch", mode: "instance" },
  { tab: "sync", label: "rowSyncAuth", hint: "hintSyncAuth", mode: "instance" },
  { tab: "sync", label: "rowSyncUser", hint: "hintSyncUser", mode: "instance" },
  { tab: "sync", label: "rowSyncToken", hint: "hintSyncToken", mode: "instance" },
  { tab: "sync", label: "rowSyncPull", hint: "hintSyncPull", mode: "instance" },
  { tab: "sync", label: "rowSyncInterval", hint: "hintSyncInterval", mode: "instance" },
  { tab: "sync", label: "rowSyncStatus", hint: "hintSyncStatus", mode: "instance" },
  { tab: "sync", label: "rowTravel", hint: "hintTravel", mode: "instance" },
  { tab: "sync", label: "rowPocketRepo", hint: "hintPocketRepo", mode: "pocket" },
  { tab: "sync", label: "rowPocketState", hint: "hintPocketState", mode: "pocket" },
  { tab: "sync", label: "rowPocketConflicts", hint: "hintPocketConflicts", mode: "pocket" },
  { tab: "sync", label: "rowPocketLeave", hint: "hintPocketLeave", mode: "pocket" },
  { tab: "ask", label: "rowAskProvider", hint: "hintAskProvider", mode: "instance" },
  { tab: "ask", label: "rowAskChatModel", hint: "hintAskChatModel", mode: "instance" },
  { tab: "ask", label: "rowAskAnthropicModel", hint: "hintAskAnthropicModel", mode: "instance" },
  { tab: "ask", label: "rowAskKey", hint: "hintAskKey", mode: "instance" },
  { tab: "ask", label: "rowAskEmbedModel", hint: "hintAskEmbedModel", mode: "instance" },
  { tab: "ask", label: "rowAskTopK", hint: "hintAskTopK", mode: "instance" },
  { tab: "ask", label: "rowAskStatus", hint: "hintAskStatus", mode: "instance" },
];
