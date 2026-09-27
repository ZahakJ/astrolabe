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
  /** The page this row lives in — `TABS[].id` in settings/tabs.ts. */
  tab: string;
  /** The rail group of that page — `GROUPS[].id` (You · Your site · Data ·
   *  App), read out of tabs.ts with the page. */
  group: "you" | "site" | "data" | "app";
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
  { tab: "appearance", group: "you", label: "rowYourTheme", hint: "hintYourTheme" },
  { tab: "appearance", group: "you", label: "rowScreenWarmth", hint: "hintScreenWarmth" },
  { tab: "appearance", group: "you", label: "rowScreenDim", hint: "hintScreenDim" },
  { tab: "appearance", group: "you", label: "rowSidebarSide", hint: "hintSidebarSide" },
  { tab: "appearance", group: "you", label: "rowEditorWidth", hint: "hintEditorWidth" },
  { tab: "appearance", group: "you", label: "editorWidthCustom", hint: "editorWidthCustomHint", row: "rowEditorWidth" },
  { tab: "type", group: "you", label: "rowTextDirection", hint: "hintTextDirection", more: ["noteLayoutOverride"] },
  { tab: "type", group: "you", label: "rowTextAlign", hint: "hintTextAlign" },
  { tab: "type", group: "you", label: "rowFontProse", hint: "hintFontProse", more: ["typographyNote"] },
  { tab: "type", group: "you", label: "rowFontUi", hint: "hintFontUi" },
  { tab: "type", group: "you", label: "rowFontMono", hint: "hintFontMono" },
  { tab: "type", group: "you", label: "rowFontArabic", hint: "hintFontArabic" },
  { tab: "type", group: "you", label: "rowSizeAdjust", hint: "hintSizeAdjust" },
  { tab: "language", group: "you", label: "rowEditorLanguage", hint: "hintEditorLanguage" },
  { tab: "language", group: "you", label: "rowLanguage", hint: "hintLanguage", env: "SITE_LANG" },
  { tab: "language", group: "you", label: "rowSpellDicts", hint: "hintSpellDicts", more: ["moreSpellDicts"] },
  { tab: "language", group: "you", label: "rowLanguageFilter", hint: "hintLanguageFilter", env: "LANGUAGE_FILTER" },
  { tab: "language", group: "you", label: "rowLanguageToggle", hint: "hintLanguageToggle", more: ["visitorSwitchNote"] },
  { tab: "dates", group: "you", label: "rowDateCalendar", hint: "hintDateCalendar" },
  { tab: "dates", group: "you", label: "rowDateOrder", hint: "hintDateOrder" },
  { tab: "dates", group: "you", label: "rowDateSeparator", hint: "hintDateSeparator", row: "rowDateOrder" },
  { tab: "dates", group: "you", label: "rowDateLocale", hint: "hintDateLocale", env: "BLOG_LOCALE", adv: true },
  { tab: "writing", group: "you", label: "rowLaunch", hint: "hintLaunch" },
  { tab: "writing", group: "you", label: "rowLaunchNote", hint: "hintLaunchNote", row: "rowLaunch" },
  { tab: "writing", group: "you", label: "selToolbarLabel", hint: "hintSelToolbar" },
  { tab: "writing", group: "you", label: "rowFrenchAutocorrect", hint: "hintFrenchAutocorrect", more: ["moreFrenchAutocorrect"] },
  { tab: "writing", group: "you", label: "rowEmptyPropsCard", hint: "hintEmptyPropsCard" },
  { tab: "writing", group: "you", label: "rowAttachmentLocation", hint: "hintAttachmentLocation" },
  { tab: "writing", group: "you", label: "rowAttachmentFolder", row: "rowAttachmentLocation" },
  { tab: "writing", group: "you", label: "rowTagsFolder", hint: "hintTagsFolder" },
  { tab: "writing", group: "you", label: "tagLabelsRowLabel", hint: "tagLabelsPageWins", more: ["tagLabelsNote"] },
  { tab: "writing", group: "you", label: "drawingsFolderLabel", hint: "drawingsFolderHint", adv: true },
  { tab: "notes", group: "you", label: "templatesFolderLabel", hint: "templatesFolderHint" },
  { tab: "notes", group: "you", label: "defaultTemplateLabel", hint: "defaultTemplateHint", more: ["templatePlaceholdersHint"] },
  { tab: "notes", group: "you", label: "periodicRowLabel", hint: "periodicRowHint", more: ["periodicFormatNote"] },
  { tab: "notes", group: "you", label: "uniqueRowLabel", hint: "uniqueFolderHint", more: ["uniqueFormatHint"] },
  { tab: "notes", group: "you", label: "captureInboxLabel", hint: "captureInboxHint", more: ["moreCaptureInbox"] },
  { tab: "notes", group: "you", label: "clipperLabel", hint: "clipperHint", more: ["moreClipper"] },
  { tab: "reading", group: "you", label: "rowHeadingNumbers", hint: "hintHeadingNumbers" },
  { tab: "reading", group: "you", label: "rowPdfSearch", hint: "hintPdfSearch", env: "PDF_SEARCH" },
  { tab: "reading", group: "you", label: "rowFeeds", hint: "hintFeeds", more: ["moreFeeds"] },
  { tab: "reading", group: "you", label: "hadithFolderLabel", hint: "hadithFolderHint", more: ["moreHadithFolder"], adv: true },
  { tab: "speech", group: "you", label: "rowReadAloud", hint: "hintReadAloud", more: ["moreReadAloud"] },
  { tab: "speech", group: "you", label: "rowReadersListen", hint: "hintReadersListen", mode: "instance" },
  { tab: "speech", group: "you", label: "rowVoiceLanguage", hint: "hintVoiceLanguage", more: ["moreVoiceLanguage"] },
  { tab: "speech", group: "you", label: "rowVoiceModel", hint: "hintVoiceModel", more: ["moreVoiceModel"] },
  { tab: "speech", group: "you", label: "rowVoiceKeepAudio", hint: "hintVoiceKeepAudio" },
  { tab: "speech", group: "you", label: "rowOwnVoices", hint: "hintOwnVoices", more: ["moreOwnVoices"], adv: true },
  { tab: "site", group: "site", label: "rowSiteName", env: "SITE_NAME" },
  { tab: "site", group: "site", label: "rowTagline", hint: "hintTagline", env: "SITE_TAGLINE" },
  { tab: "site", group: "site", label: "rowLogo", hint: "hintLogo" },
  { tab: "site", group: "site", label: "rowFavicon", hint: "hintFavicon" },
  { tab: "site", group: "site", label: "rowDefaultTheme", hint: "hintDefaultTheme", env: "DEFAULT_THEME" },
  { tab: "site", group: "site", label: "rowAmbient", hint: "hintAmbient", mode: "instance" },
  { tab: "site", group: "site", label: "rowFooter", hint: "hintFooter", env: "SITE_FOOTER", adv: true },
  { tab: "publishing", group: "site", label: "rowPublicLayout", hint: "hintPublicLayout", env: "PUBLIC_LAYOUT", mode: "instance" },
  { tab: "publishing", group: "site", label: "rowOpenDesigner", hint: "hintOpenDesigner", mode: "instance", row: "rowPublicLayout" },
  { tab: "publishing", group: "site", label: "rowMode", hint: "hintMode", mode: "instance" },
  { tab: "publishing", group: "site", label: "rowHomeNote", hint: "hintHomeNote", env: "HOME_NOTE", mode: "instance" },
  { tab: "publishing", group: "site", label: "rowHomeBanner", hint: "hintHomeBanner", mode: "instance" },
  { tab: "publishing", group: "site", label: "rowShareButtons", hint: "hintShareButtons", mode: "instance" },
  { tab: "publishing", group: "site", label: "rowExternalVideo", hint: "hintExternalVideo", more: ["moreExternalVideo"], mode: "instance" },
  { tab: "publishing", group: "site", label: "rowExcludeTags", hint: "hintExcludeTags", env: "EXCLUDE_TAGS", mode: "instance", adv: true },
  { tab: "publishing", group: "site", label: "rowAuthorSites", hint: "hintAuthorSites", mode: "instance", adv: true },
  { tab: "conversation", group: "site", label: "rowComments", hint: "hintComments", env: "COMMENTS", mode: "instance" },
  { tab: "conversation", group: "site", label: "rowWebmentions", hint: "hintWebmentions", more: ["moreWebmentionsAccept", "moreWebmentionsSend"], mode: "instance" },
  { tab: "conversation", group: "site", label: "rowWebmentionsAccept", hint: "hintWebmentionsAccept", mode: "instance", row: "rowWebmentions" },
  { tab: "conversation", group: "site", label: "rowWebmentionsSend", hint: "hintWebmentionsSend", mode: "instance", row: "rowWebmentions" },
  { tab: "conversation", group: "site", label: "rowFediverse", hint: "hintFediverse", more: ["moreFediverse"], mode: "instance" },
  { tab: "conversation", group: "site", label: "rowFediverseHandle", hint: "hintFediverseHandle", mode: "instance", row: "rowFediverse" },
  { tab: "collections", group: "site", label: "rowTopicsMode", hint: "hintTopicsMode", mode: "instance" },
  { tab: "collections", group: "site", label: "rowPublicFolders", hint: "hintPublicFolders", mode: "instance" },
  { tab: "collections", group: "site", label: "rowPublicFoldersList", hint: "hintPublicFoldersList", mode: "instance" },
  { tab: "collections", group: "site", label: "rowPublicFoldersHome", hint: "hintPublicFoldersHome", mode: "instance" },
  { tab: "collections", group: "site", label: "rowPublicFoldersNav", hint: "hintPublicFoldersNav", mode: "instance" },
  { tab: "library", group: "site", label: "rowLibrary", hint: "hintLibrary", more: ["libraryNote"], mode: "instance" },
  { tab: "library", group: "site", label: "rowLibraryTitle", hint: "hintLibraryTitle", mode: "instance" },
  { tab: "library", group: "site", label: "rowLibraryNav", hint: "hintLibraryNav", mode: "instance" },
  { tab: "library", group: "site", label: "rowLibraryHome", hint: "hintLibraryHome", mode: "instance" },
  { tab: "library", group: "site", label: "rowLibraryRoots", hint: "hintLibraryRoots", mode: "instance" },
  { tab: "library", group: "site", label: "rowLibraryPaths", hint: "hintLibraryPaths", mode: "instance" },
  { tab: "sync", group: "data", label: "rowSyncEnabled", hint: "hintSyncEnabled", mode: "instance" },
  { tab: "sync", group: "data", label: "rowSyncRemote", hint: "hintSyncRemote", mode: "instance" },
  { tab: "sync", group: "data", label: "rowSyncAuth", hint: "hintSyncAuth", mode: "instance" },
  { tab: "sync", group: "data", label: "rowSyncToken", hint: "hintSyncToken", mode: "instance" },
  { tab: "sync", group: "data", label: "rowSyncUser", hint: "hintSyncUser", mode: "instance", row: "rowSyncToken" },
  { tab: "sync", group: "data", label: "rowSyncInterval", hint: "hintSyncInterval", mode: "instance" },
  { tab: "sync", group: "data", label: "rowSyncStatus", hint: "hintSyncStatus", mode: "instance" },
  { tab: "sync", group: "data", label: "rowPocketRepo", hint: "hintPocketRepo", mode: "pocket" },
  { tab: "sync", group: "data", label: "rowPocketState", hint: "hintPocketState", mode: "pocket" },
  { tab: "sync", group: "data", label: "rowPocketConflicts", hint: "hintPocketConflicts", mode: "pocket" },
  { tab: "sync", group: "data", label: "rowPocketLeave", hint: "hintPocketLeave", mode: "pocket" },
  { tab: "sync", group: "data", label: "rowSyncBranch", hint: "hintSyncBranch", mode: "instance", adv: true },
  { tab: "sync", group: "data", label: "rowSyncPull", hint: "hintSyncPull", mode: "instance", adv: true },
  { tab: "versions", group: "data", label: "rowNoteVersions", hint: "hintNoteVersions", more: ["moreNoteVersions"], env: "NOTE_VERSIONS" },
  { tab: "versions", group: "data", label: "rowTravel", hint: "hintTravel", mode: "instance" },
  { tab: "versions", group: "data", label: "rowPrefsSync", hint: "hintPrefsSync" },
  { tab: "ask", group: "data", label: "rowAskProvider", hint: "hintAskProvider", mode: "instance" },
  { tab: "ask", group: "data", label: "rowAskChatModel", hint: "hintAskChatModel", mode: "instance" },
  { tab: "ask", group: "data", label: "rowAskAnthropicModel", hint: "hintAskAnthropicModel", mode: "instance" },
  { tab: "ask", group: "data", label: "rowAskKey", hint: "hintAskKey", mode: "instance" },
  { tab: "ask", group: "data", label: "rowAskStatus", hint: "hintAskStatus", mode: "instance" },
  { tab: "ask", group: "data", label: "rowAskEmbedModel", hint: "hintAskEmbedModel", mode: "instance", adv: true },
  { tab: "ask", group: "data", label: "rowAskTopK", hint: "hintAskTopK", mode: "instance", adv: true },
  { tab: "device", group: "app", label: "rowOffline", hint: "hintOffline" },
  { tab: "device", group: "app", label: "rowVimKeys", hint: "hintVimKeys" },
  { tab: "device", group: "app", label: "rowRelativeLines", hint: "hintRelativeLines", row: "rowVimKeys" },
  { tab: "device", group: "app", label: "rowWhatsNew", hint: "hintWhatsNew" },
  { tab: "device", group: "app", label: "rowAppName", hint: "hintAppName" },
  { tab: "device", group: "app", label: "rowAppIcon", hint: "hintAppIcon" },
  { tab: "device", group: "app", label: "rowUpdates", hint: "hintUpdates" },
];
