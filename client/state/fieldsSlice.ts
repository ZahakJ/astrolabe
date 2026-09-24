// The store's first slice: every field's first value, the two language
// switches, and the one-line setters. Spread first into the store, so its
// initializers run in the order they always did. Moved out of client/state.ts
// unchanged.

import { DEFAULT_DATE_CALENDAR } from "../../shared/dates.ts";
import { DEFAULT_LAUNCH } from "../../shared/launch.ts";
import { DEFAULT_TEXT_ALIGN, DEFAULT_TEXT_DIRECTION } from "../../shared/textLayout.ts";
import { NO_FOLDER_ICONS, NO_PUBLIC_FOLDERS, effectiveSide } from "./helpers.ts";
import { PANEL_COLLAPSED_KEY, SIDEBAR_COLLAPSED_KEY, ZEN_KEY, readFlag, readReading, readRelativeLines, readSidebarSidePref, readVim } from "./persistence.ts";
import type { State } from "./types.ts";
import type { StoreCtx, StoreGet, StoreSet } from "./sliceTypes.ts";
import * as api from "../api.ts";
import { applyLanguage } from "./dom.ts";
import { boot } from "../boot.ts";
import { emptyWorkspace } from "../workspace.ts";
import { readEditorLang, writeEditorLang, writeVisitorLang } from "../langPref.ts";

/** The store's first values, the two language switches, and the one-line setters beside them. */
export function fieldsSlice(set: StoreSet, get: StoreGet, ctx: StoreCtx) {
  const { initialTheme } = ctx;
  return {
    tree: null,
    workspace: emptyWorkspace(),
    lastRemap: null,
    openPath: null,
    openTabs: [],
    dirty: {},
    view: "editor",
    theme: initialTheme,
    // Admin-only, and only once /api/me has answered.
    publicTheme: null,
    vimMode: readVim(),
    relativeLines: readRelativeLines(),
    vimSubMode: null,
    readingMode: readReading(),
    paletteOpen: false,
    // Both are settled again in loadMe() once the instance language is known;
    // until then "auto" resolves against the boot default (en → left).
    sidebarSidePref: readSidebarSidePref(),
    sidebarSide: effectiveSide(readSidebarSidePref(), "en"),
    sidebarCollapsed: readFlag(SIDEBAR_COLLAPSED_KEY) ?? false,
    // No stored choice → the panel starts wherever the viewport wants it
    // (BacklinksPanel's media query), which is collapsed on narrow screens.
    panelCollapsed: readFlag(PANEL_COLLAPSED_KEY) ?? false,
    paneStill: false,
    zen: readFlag(ZEN_KEY) ?? false,
    backlinks: [],
    reloadTick: 0,
    pendingHeading: null,
    pendingCaret: null,

    admin: true,
    pocket: false,
    authReady: false,
    authProtected: false,
    publicReads: true,
    homeNote: null,
    launch: DEFAULT_LAUNCH,
    authorSites: [],
    publicFolders: NO_PUBLIC_FOLDERS,
    publicFoldersHome: false,
    publicFoldersNav: false,
    topicsMode: "tags",
    library: null,
    siteName: "Astrolabe",
    language: "en",
    siteLanguage: "en",
    editorLangPref: readEditorLang(),
    languageToggle: false,
    obsidianVault: false,
    languageFilter: "off",
    languageFallback: null,
    visibility: null,
    commentsEnabled: false,
    setVisitorLang: (lang) => {
      if (!get().languageToggle || get().language === lang) return;
      // THE OWNER, SIGNED IN, TAPPING THEIR OWN SITE'S ع. Their chrome is
      // their editor language — chromeLang() never reads the visitor key for
      // an admin — so writing the visitor key here flipped the shell for
      // exactly as long as it took the next loadMe() (a save, a sign-in, a
      // preview) to resolve it back to the editor preference: a switch that
      // worked and then quietly undid itself. The tap is the same choice the
      // This-device row makes, so it goes to the same place — and lands on
      // "follow" rather than a pin when it names the site's own language,
      // which keeps the default reachable from the switch too. Visitors are
      // untouched: for them this branch never runs.
      if (get().admin) {
        get().setEditorLang(lang === get().siteLanguage ? null : lang);
        return;
      }
      writeVisitorLang(lang);
      // Tell the API layer BEFORE anything refetches: every subsequent call
      // (including the loadMe below) must declare the new language, or the
      // server would scope the reply to the language they just left.
      api.setReaderLang(lang);
      // Same order loadMe uses: dictionary + <html dir/lang> first, so the
      // components re-rendering off `language` already read the new strings.
      // Numerals stay one system per instance (localeDigits). Month names
      // follow this chrome language inside siteDate() — English chrome must
      // not print "أغسطس".
      applyLanguage(lang, get().blogLocale);
      // Same rule as loadMe: an "auto" side follows the direction LIVE, so a
      // visitor flipping the EN/ع switch moves the notes sidebar with it.
      set({ language: lang, sidebarSide: effectiveSide(get().sidebarSidePref, lang) });
      // Under `languageFilter: "follow"` the switch is not cosmetic: the
      // reader has just changed WHICH NOTES EXIST for them, so everything
      // derived from the published collection has to be refetched. Without
      // this the chrome flipped to Arabic and went on listing the English
      // posts — the exact chrome/content disagreement the mode exists to end.
      // /api/me comes first because it carries the fallback flag for the new
      // language; the SSE stream is torn down and resubscribed by the same
      // reloadTick the tree listens on.
      if (get().languageFilter === "follow") {
        void (async () => {
          await get().loadMe();
          await get().loadTree();
          get().bumpReload();
        })();
      }
    },
    // The editor's own language, and deliberately the SHORTER of the two
    // routines beside it. Nothing about the vault changes: not the API
    // scope (an admin session is never language-limited — server/language.ts
    // hands it ADMIN_SCOPE without reading the header), not the published
    // set, not one byte of what a visitor is served. The chrome re-reads
    // itself and the sidebar picks its edge again; that is the whole blast
    // radius, which is the point of the setting.
    setEditorLang: (lang) => {
      if (!get().admin) return; // admin-only affordance, like previewVisitor
      // The guard is on the PREFERENCE, not on the language it resolves to:
      // picking "English" while following an English site is a real change
      // (it pins), and only re-picking what this window already holds is the
      // no-op. THIS WINDOW'S, not localStorage's: a peer window writes the
      // shared key before its bus message arrives here, so a guard on the
      // stored value saw "already ar" and returned without repainting — the
      // second window kept its old chrome until a reload.
      if (lang === get().editorLangPref) return;
      writeEditorLang(lang);
      const next = lang ?? get().siteLanguage;
      // Same order loadMe and setVisitorLang use: dictionary + <html dir/lang>
      // first, so components re-rendering off `language` already read the new
      // strings. blogLocale is untouched for the same reason it is there —
      // dates and numerals are one system per INSTANCE.
      applyLanguage(next, get().blogLocale);
      // An "auto" sidebar side follows the direction LIVE, exactly as it does
      // for the visitor switch and for a settings-side language change.
      set({
        language: next,
        editorLangPref: lang,
        sidebarSide: effectiveSide(get().sidebarSidePref, next),
      });
    },
    loginOpen: false,
    desktopUpdate: null,
    desktopZoom: 1,
    setDesktopZoom: (desktopZoom) => set({ desktopZoom }),
    desktopOwnsSession: false,
    desktopBrandIcon: null,
    moderationOpen: false,
    trashOpen: false,
    importFolder: null,
    unusedOpen: false,
    previewVisitor: false,

    // The layout the served shell named, so a visitor's first frame is the
    // shell they will keep rather than an app that turns into one (boot.ts).
    publicLayout: boot.layout ?? "app",
    designNotice: null,
    tagline: null,
    shareButtons: false,
    ambient: false,
    footerLine: null,
    blogLocale: "en",
    bannerFallback: "generated",
    home: null,
    logo: null,
    dateCalendar: DEFAULT_DATE_CALENDAR,
    textDirection: DEFAULT_TEXT_DIRECTION,
    textAlign: DEFAULT_TEXT_ALIGN,
    emptyPropsCard: true,
    folderIcons: NO_FOLDER_ICONS,
    attachmentFolder: null,
    drawingsFolder: "",
    // Normalized to the shared empty object, not stored as a fresh `{}`:
    // clearing the last folder's mark must leave the tree's 1.4k memoized rows
    // reading the same identity they read before anything was marked.
    setFolderIcons: (icons) =>
      set({ folderIcons: Object.keys(icons).length > 0 ? icons : NO_FOLDER_ICONS }),
    setHome: (home) => set({ home }),
    bannerModalOpen: false,
    settingsOpen: false,
    setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
    captureOpen: false,
    setCaptureOpen: (captureOpen) => set(captureOpen ? { captureOpen } : { captureOpen, captureVoice: false }),
    captureVoice: false,
    openVoiceNote: () => set({ captureOpen: true, captureVoice: true }),
    settingsFocus: null,
    openSettingsAt: (settingsFocus) => set({ settingsOpen: true, settingsFocus }),
    shortcutsOpen: false,
    setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
    askOpen: false,
    askQuestion: null,
    setAskOpen: (askOpen, question = null) => set({ askOpen, askQuestion: askOpen ? question : null }),

    publishedPaths: null,
    twins: {},
    publishedCounts: null,
    publishedFilter: false,
    openPublished: null,
  } satisfies Partial<State>;
}
