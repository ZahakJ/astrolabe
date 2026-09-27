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

export interface SettingEntry {
  /** The section this row lives in — `TABS[].id` in settings/tabs.ts. */
  tab: string;
  /** The row's label key. Also how a result finds its row in the DOM: `Row`
   *  stamps the RESOLVED label as `data-setting`, and the result resolves the
   *  same key to look it up. */
  label: I18nKey;
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
  { tab: "appearance", label: "rowYourTheme", hint: "hintYourTheme" },
  { tab: "appearance", label: "rowScreenWarmth", hint: "hintScreenWarmth" },
  { tab: "appearance", label: "rowScreenDim", hint: "hintScreenDim" },
  { tab: "appearance", label: "rowSidebarSide", hint: "hintSidebarSide" },
  { tab: "appearance", label: "rowEditorWidth", hint: "hintEditorWidth" },
  { tab: "appearance", label: "editorWidthCustom", hint: "editorWidthCustomHint", row: "rowEditorWidth" },
  { tab: "appearance", label: "rowTextDirection", hint: "hintTextDirection" },
  { tab: "appearance", label: "rowTextAlign", hint: "hintTextAlign" },
  { tab: "appearance", label: "rowFontProse", hint: "hintFontProse" },
  { tab: "appearance", label: "rowFontUi", hint: "hintFontUi" },
  { tab: "appearance", label: "rowFontMono", hint: "hintFontMono" },
  { tab: "appearance", label: "rowFontArabic", hint: "hintFontArabic" },
  { tab: "appearance", label: "rowSizeAdjust", hint: "hintSizeAdjust" },
  { tab: "language", label: "rowEditorLanguage", hint: "hintEditorLanguage" },
  { tab: "language", label: "rowLanguage", hint: "hintLanguage", env: "SITE_LANG" },
  { tab: "language", label: "rowSpellDicts", hint: "hintSpellDicts", more: ["moreSpellDicts"] },
  { tab: "language", label: "rowDateCalendar", hint: "hintDateCalendar" },
  { tab: "language", label: "rowDateOrder", hint: "hintDateOrder" },
  { tab: "language", label: "rowDateSeparator", hint: "hintDateSeparator", row: "rowDateOrder" },
  { tab: "language", label: "rowLanguageFilter", hint: "hintLanguageFilter", env: "LANGUAGE_FILTER" },
  { tab: "language", label: "rowLanguageToggle", hint: "hintLanguageToggle", more: ["visitorSwitchNote"] },
  { tab: "language", label: "rowDateLocale", hint: "hintDateLocale", env: "BLOG_LOCALE", adv: true },
  { tab: "writing", label: "rowLaunch", hint: "hintLaunch" },
  { tab: "writing", label: "rowLaunchNote", hint: "hintLaunchNote", row: "rowLaunch" },
  { tab: "writing", label: "selToolbarLabel", hint: "hintSelToolbar" },
  { tab: "writing", label: "rowFrenchAutocorrect", hint: "hintFrenchAutocorrect", more: ["moreFrenchAutocorrect"] },
  { tab: "writing", label: "rowEmptyPropsCard", hint: "hintEmptyPropsCard" },
  { tab: "writing", label: "templatesFolderLabel", hint: "templatesFolderHint" },
  { tab: "writing", label: "defaultTemplateLabel", hint: "defaultTemplateHint", more: ["templatePlaceholdersHint"] },
  { tab: "writing", label: "periodicRowLabel", hint: "periodicRowHint", more: ["periodicFormatNote"] },
  { tab: "writing", label: "uniqueRowLabel", hint: "uniqueFolderHint", more: ["uniqueFormatHint"] },
  { tab: "writing", label: "captureInboxLabel", hint: "captureInboxHint", more: ["moreCaptureInbox"] },
  { tab: "writing", label: "clipperLabel", hint: "clipperHint", more: ["moreClipper"] },
  { tab: "writing", label: "rowAttachmentLocation", hint: "hintAttachmentLocation" },
  { tab: "writing", label: "rowAttachmentFolder", row: "rowAttachmentLocation" },
  { tab: "writing", label: "rowTagsFolder", hint: "hintTagsFolder" },
  { tab: "writing", label: "tagLabelsRowLabel", hint: "tagLabelsPageWins", more: ["tagLabelsNote"] },
  { tab: "writing", label: "rowVimKeys", hint: "hintVimKeys", adv: true },
  { tab: "writing", label: "rowRelativeLines", hint: "hintRelativeLines", row: "rowVimKeys", adv: true },
  { tab: "writing", label: "drawingsFolderLabel", hint: "drawingsFolderHint", adv: true },
  { tab: "reading", label: "rowHeadingNumbers", hint: "hintHeadingNumbers" },
  { tab: "reading", label: "rowOffline", hint: "hintOffline" },
  { tab: "reading", label: "rowPdfSearch", hint: "hintPdfSearch", env: "PDF_SEARCH" },
  { tab: "reading", label: "rowFeeds", hint: "hintFeeds", more: ["moreFeeds"] },
  { tab: "reading", label: "rowReadAloud", hint: "hintReadAloud", more: ["moreReadAloud"] },
  { tab: "reading", label: "rowReadersListen", hint: "hintReadersListen", mode: "instance" },
  { tab: "reading", label: "rowVoiceLanguage", hint: "hintVoiceLanguage", more: ["moreVoiceLanguage"] },
  { tab: "reading", label: "rowVoiceModel", hint: "hintVoiceModel", more: ["moreVoiceModel"] },
  { tab: "reading", label: "rowVoiceKeepAudio", hint: "hintVoiceKeepAudio" },
  { tab: "reading", label: "rowOwnVoices", hint: "hintOwnVoices", more: ["moreOwnVoices"], adv: true },
  { tab: "reading", label: "hadithFolderLabel", hint: "hadithFolderHint", more: ["moreHadithFolder"], adv: true },
  { tab: "site", label: "rowSiteName", env: "SITE_NAME" },
  { tab: "site", label: "rowTagline", hint: "hintTagline", env: "SITE_TAGLINE" },
  { tab: "site", label: "rowLogo", hint: "hintLogo" },
  { tab: "site", label: "rowFavicon", hint: "hintFavicon" },
  { tab: "site", label: "rowDefaultTheme", hint: "hintDefaultTheme", env: "DEFAULT_THEME" },
  { tab: "site", label: "rowAmbient", hint: "hintAmbient", mode: "instance" },
  { tab: "site", label: "rowPublicLayout", hint: "hintPublicLayout", env: "PUBLIC_LAYOUT", mode: "instance" },
  { tab: "site", label: "rowOpenDesigner", hint: "hintOpenDesigner", mode: "instance", row: "rowPublicLayout" },
  { tab: "site", label: "rowShareButtons", hint: "hintShareButtons", mode: "instance" },
  { tab: "site", label: "rowExternalVideo", hint: "hintExternalVideo", more: ["moreExternalVideo"], mode: "instance" },
  { tab: "site", label: "rowMode", hint: "hintMode", mode: "instance" },
  { tab: "site", label: "rowHomeNote", hint: "hintHomeNote", env: "HOME_NOTE", mode: "instance" },
  { tab: "site", label: "rowHomeBanner", hint: "hintHomeBanner", mode: "instance" },
  { tab: "site", label: "rowComments", hint: "hintComments", env: "COMMENTS", mode: "instance" },
  { tab: "site", label: "rowWebmentions", hint: "hintWebmentions", more: ["moreWebmentionsAccept", "moreWebmentionsSend"], mode: "instance" },
  { tab: "site", label: "rowWebmentionsAccept", hint: "hintWebmentionsAccept", mode: "instance", row: "rowWebmentions" },
  { tab: "site", label: "rowWebmentionsSend", hint: "hintWebmentionsSend", mode: "instance", row: "rowWebmentions" },
  { tab: "site", label: "rowFediverse", hint: "hintFediverse", more: ["moreFediverse"], mode: "instance" },
  { tab: "site", label: "rowFediverseHandle", hint: "hintFediverseHandle", mode: "instance", row: "rowFediverse" },
  { tab: "site", label: "rowFooter", hint: "hintFooter", env: "SITE_FOOTER", adv: true },
  { tab: "site", label: "rowExcludeTags", hint: "hintExcludeTags", env: "EXCLUDE_TAGS", mode: "instance", adv: true },
  { tab: "site", label: "rowAuthorSites", hint: "hintAuthorSites", mode: "instance", adv: true },
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
  { tab: "sync", label: "rowSyncEnabled", hint: "hintSyncEnabled", mode: "instance" },
  { tab: "sync", label: "rowSyncRemote", hint: "hintSyncRemote", mode: "instance" },
  { tab: "sync", label: "rowSyncAuth", hint: "hintSyncAuth", mode: "instance" },
  { tab: "sync", label: "rowSyncToken", hint: "hintSyncToken", mode: "instance" },
  { tab: "sync", label: "rowSyncUser", hint: "hintSyncUser", mode: "instance", row: "rowSyncToken" },
  { tab: "sync", label: "rowSyncInterval", hint: "hintSyncInterval", mode: "instance" },
  { tab: "sync", label: "rowSyncStatus", hint: "hintSyncStatus", mode: "instance" },
  { tab: "sync", label: "rowPocketRepo", hint: "hintPocketRepo", mode: "pocket" },
  { tab: "sync", label: "rowPocketState", hint: "hintPocketState", mode: "pocket" },
  { tab: "sync", label: "rowPocketConflicts", hint: "hintPocketConflicts", mode: "pocket" },
  { tab: "sync", label: "rowPocketLeave", hint: "hintPocketLeave", mode: "pocket" },
  { tab: "sync", label: "rowNoteVersions", hint: "hintNoteVersions", more: ["moreNoteVersions"], env: "NOTE_VERSIONS" },
  { tab: "sync", label: "rowTravel", hint: "hintTravel", mode: "instance" },
  { tab: "sync", label: "rowPrefsSync", hint: "hintPrefsSync" },
  { tab: "sync", label: "rowSyncBranch", hint: "hintSyncBranch", mode: "instance", adv: true },
  { tab: "sync", label: "rowSyncPull", hint: "hintSyncPull", mode: "instance", adv: true },
  { tab: "ask", label: "rowAskProvider", hint: "hintAskProvider", mode: "instance" },
  { tab: "ask", label: "rowAskChatModel", hint: "hintAskChatModel", mode: "instance" },
  { tab: "ask", label: "rowAskAnthropicModel", hint: "hintAskAnthropicModel", mode: "instance" },
  { tab: "ask", label: "rowAskKey", hint: "hintAskKey", mode: "instance" },
  { tab: "ask", label: "rowAskStatus", hint: "hintAskStatus", mode: "instance" },
  { tab: "ask", label: "rowAskEmbedModel", hint: "hintAskEmbedModel", mode: "instance", adv: true },
  { tab: "ask", label: "rowAskTopK", hint: "hintAskTopK", mode: "instance", adv: true },
  { tab: "about", label: "rowAppName", hint: "hintAppName" },
  { tab: "about", label: "rowAppIcon", hint: "hintAppIcon" },
  { tab: "about", label: "rowUpdates", hint: "hintUpdates" },
  { tab: "about", label: "rowWhatsNew", hint: "hintWhatsNew" },
];
