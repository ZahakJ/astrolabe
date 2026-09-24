// The store's shape: `State`, every field and action the client reads through
// `useStore`, and the small types beside it. Moved out of client/state.ts
// unchanged; that module re-exports every name, so importers are unchanged.

import type { AuthorSiteCard, Backlink, HomeSettings, LanguageFilterMode, LaunchSetting, PropertyValue, PublicFolderCard, PublicThemeInfo, PublishedCounts, TreeNode, TwinPair, VisibilityImpact } from "../../shared/types.ts";
import type { BookTarget, DropEdge, PaneMode, Workspace } from "../workspace.ts";
import type { DateCalendar } from "../../shared/dates.ts";
import type { FolderMark } from "../../shared/folderIcons.ts";
import type { I18nKey, Lang, t } from "../i18n.ts";
import type { SurfaceView } from "../state.ts";
import type { TextAlign, TextDirection } from "../../shared/textLayout.ts";
import type { ThemeChoice } from "../themes.ts";

/** Which physical edge the notes sidebar sits on, once everything is settled.
 *  PHYSICAL, not logical: a reader who asks for "the left" means the left of
 *  the screen in either language. */
export type SidebarSide = "left" | "right";

/** The stored PREFERENCE behind that side, and it is three-state on purpose.
 *  `"auto"` is the default and is re-evaluated on every language change —
 *  right in Arabic, left in English — because the leading edge is a property
 *  of the direction, not a thing the reader should have to re-pick. `"left"` /
 *  `"right"` are explicit pins that outrank the language forever.
 *
 *  Two-state was the bug: the side followed the language only while NOTHING
 *  was stored, so the first use of the palette command pinned it for good and
 *  a later switch to Arabic no longer moved it — with no way back other than
 *  clearing localStorage. */
export type SidebarSidePref = "auto" | "left" | "right";
/** "graph" left this union when the graph became a tab (`GRAPH_TAB` in
 *  client/workspace.ts): asking for it through `setView("graph")` still works
 *  and opens that tab in the focused pane. */
export type View = "editor";

/** Where a dropped tab lands on its target pane. */
export type TabDropDest = { kind: "tabs"; index: number } | { kind: "edge"; edge: DropEdge };

export interface State {
  tree: TreeNode | null;
  /** THE WORKSPACE IS THE TRUTH; `openPath` and `openTabs` below are a derived
   *  mirror of it, written by `commitWorkspace()` and by nothing else.
   *
   *  Doing it that way round is what makes panes affordable. Roughly forty
   *  places in the client read `openPath` or `openTabs` — the status bar, the
   *  router, the palette, the outline, the backlinks panel, every publish and
   *  banner action — and none of them has to learn what a pane is. They keep
   *  reading a path and a list of paths, and go on being right, because the
   *  mirror answers for the FOCUSED pane. Only the dozen or so places that
   *  WRITE the open set had to change, and they now say what they mean:
   *  `closeOthersIn`, `pruneWorkspace`, `remapWorkspace`.
   *
   *  The model itself is pure and lives in `client/workspace.ts`, where it is
   *  fuzzed over tens of thousands of random edit sequences. Nothing in this
   *  file re-implements a rule it already states. */
  workspace: Workspace;
  openPath: string | null;
  openTabs: string[];
  dirty: Record<string, boolean>;
  view: View;
  theme: ThemeChoice;
  vimMode: boolean;
  /** Vim's relative line numbers in the gutter (editor/relativeLines.ts);
   *  read only while vimMode is on. Device-local, on by default. */
  relativeLines: boolean;
  /** Which vim sub-mode the live editor is in, or null when vim is off /
   *  no editor is mounted. NOT persisted and never written by the shell —
   *  client/editor/vimStatus.ts is the only writer, forwarding vim's own
   *  `vim-mode-change`. The VIM pill needs it because "the extension is
   *  loaded" and "the keys under your fingers are commands right now" are
   *  different facts, and only the second one traps a reader. */
  vimSubMode: "normal" | "insert" | "visual" | "replace" | null;
  setVimSubMode(m: State["vimSubMode"]): void;
  /** Ctrl/Cmd+E: render the open note read-only instead of editing. */
  readingMode: boolean;
  paletteOpen: boolean;

  // ------------------------------------------------------------- shell layout
  /** The reader's stored choice: "auto" (the default — follow the language),
   *  or an explicit "left"/"right" pin. Persisted as "astrolabe.sidebarSide". */
  sidebarSidePref: SidebarSidePref;
  /** The edge the sidebar is on RIGHT NOW: the pref with "auto" resolved
   *  against the active language. Derived — never persisted, never set
   *  directly; `setSidebarSidePref` and `loadMe` are its only writers. */
  sidebarSide: SidebarSide;
  /** Set the three-state preference. This is the action a Settings →
   *  Appearance segmented control (auto / left / right) calls; the palette's
   *  three commands call it too. */
  setSidebarSidePref(pref: SidebarSidePref): void;
  /** Sidebar collapsed to its slim reopen handle (Ctrl/Cmd+Alt+B; persisted). */
  sidebarCollapsed: boolean;
  setSidebarCollapsed(b: boolean): void;
  /** Show/hide the notes sidebar. Every door — Ctrl/Cmd+Alt+B, the palette
   *  command, the status-bar switch — goes through this. */
  toggleSidebar(): void;
  /** Backlinks/outline panel collapsed (Ctrl/Cmd+Alt+Shift+B; persisted). Also
   *  set by the panel's own responsive auto-collapse on narrow viewports. */
  panelCollapsed: boolean;
  setPanelCollapsed(b: boolean, persist?: boolean): void;
  /** The SAME collapse, asked for by the viewport rather than by the reader —
   *  the responsive auto-collapse at `NARROW_QUERY`, and the phone's "a drawer
   *  starts closed". It never persists, and it raises `paneStill` in the same
   *  commit so the pane does not ANIMATE: a window maximised on a 1360px-ish
   *  screen crosses that threshold on every maximise and restore, and a 180ms
   *  width transition playing by itself is the "the panel pops open and shut
   *  on its own" half of the Windows report. */
  collapsePanelForViewport(b: boolean): void;
  /** A pane's width last changed for a reason the reader did not give. The
   *  stylesheet turns the panes' (and the note column's) transitions off while
   *  it is up — and EVERY reader-driven pane gesture puts it back down in the
   *  same `set` that starts its own animation, so the flag cannot outlive the
   *  thing it was raised for. It used to only ever go up: a window under
   *  1360px auto-collapses the panel at boot, so on a 1366 laptop the shell
   *  wore this class for the life of the page and the reader's own sidebar
   *  collapse — and the phone's notes drawer, which slides on the same
   *  element — snapped instead of moving. */
  paneStill: boolean;
  /** Zen mode: every piece of chrome steps aside and the prose column centers
   *  (Ctrl/Cmd+Shift+Z; persisted, so a reload stays zen). */
  zen: boolean;
  setZen(b: boolean): void;
  backlinks: Backlink[];
  /** Bumped when the open note changed externally; App keys the Editor on it. */
  reloadTick: number;
  /** Heading to scroll to once the next opened note finishes loading
   *  ([[Note#Heading]] navigation); consumed by Editor / ReadingView. */
  pendingHeading: string | null;
  /** Where the caret should land when `path` next mounts in an editor — a
   *  template's `{{cursor}}` (client/templates.ts), queued by the command
   *  that wrote the note before it opened it. Consumed once by Editor.tsx;
   *  a different note mounting leaves it standing for the one it names. */
  pendingCaret: { path: string; offset: number } | null;

  // ------------------------------------------------------------------ auth
  /** This session may mutate the vault (server said so via /api/me). */
  admin: boolean;
  /** THE VAULT IS A CLONE ON THIS PHONE, answered by the pocket server inside
   *  the Android WebView rather than by an instance (/api/me `pocket`). Absent
   *  = false everywhere else, which is every browser on earth. What it decides
   *  is what the settings panel OFFERS: there is no public site to publish to
   *  here and no server-side repository to point at a remote, and a row that
   *  cannot be kept must not be drawn as though it can. */
  pocket: boolean;
  /** /api/me answered — App renders nothing until then to avoid mode flashes. */
  authReady: boolean;
  /** An admin password hash is configured server-side (sign in/out matters). */
  authProtected: boolean;
  /** Reads are open without a session (PUBLIC != false). */
  publicReads: boolean;
  /** Note path/name opened for fresh visitors (HOME_NOTE). */
  homeNote: string | null;
  /** settings.launch — what the admin's shell opens on top of the restored
   *  session (shared/launch.ts). Admin sessions only; "resume" otherwise. */
  launch: LaunchSetting;
  /** The author's other sites, enriched server-side; blog home renders them. */
  authorSites: AuthorSiteCard[];
  /** settings.publicFolders — the owner's own collections, as cards the blog
   *  renders (home band, nav chips, article chips, `/folder/<slug>` page).
   *  Empty unless the instance is in blog mode AND the feature is on: the
   *  server sends nothing otherwise, and the two booleans below say only WHERE
   *  the cards may be drawn — the folder page itself works either way. */
  publicFolders: PublicFolderCard[];
  publicFoldersHome: boolean;
  publicFoldersNav: boolean;
  /** settings.topics — where the public categories come from. */
  topicsMode: "tags" | "folders";
  /** settings.library's door, as /api/me resolved it for this session: null
   *  when the feature is off or this session may read no lesson. The shelf
   *  itself is fetched by the library pages (client/library/libraryData.ts). */
  library: { nav: boolean; home: boolean; title?: string; count: number } | null;
  /** Instance branding from SITE_NAME (wordmark, titles, login modal). */
  siteName: string;
  /** THIS SESSION'S chrome language — not necessarily the site's. "ar"
   *  mirrors the whole chrome RTL; every component rendering t() strings
   *  subscribes to this so a live settings change re-renders the chrome in
   *  place. An admin reads their own `astrolabe.editorLang` (Settings →
   *  Appearance & language → Editor language), a visitor their own
   *  `astrolabe.lang` when the instance offers the switch, and everyone else
   *  settings.language / SITE_LANG; `langPref.ts::chromeLang` is the one
   *  place that rule lives. What the SITE publishes in is a settings value
   *  (`/api/settings` → `effective.language`), never this field — reading
   *  this one to answer "what language is the site?" is how the editor and
   *  the public site got welded together in the first place. */
  language: Lang;
  /** What the SITE publishes in (settings.language / SITE_LANG), untouched by
   *  anyone's per-browser preference. It is what `language` falls back to,
   *  what "Follow site" resolves to, and what a visitor with no stored choice
   *  reads — so the two values agree for every session except an admin who
   *  has pinned their editor to the other one. */
  siteLanguage: Lang;
  /** settings.languageToggle — the instance offers visitors an EN/ع switch.
   *  Off (the default) means no public language chrome exists at all. */
  languageToggle: boolean;
  /** The vault is also an Obsidian vault (`.obsidian/` exists), so a new
   *  drawing takes the Excalidraw plugin's `.excalidraw.md` spelling and the
   *  plugin opens it there. Admin only; false for everyone else. */
  obsidianVault: boolean;
  /** settings.languageFilter — how the site curates by NOTE language.
   *  "follow" is the one that changes the client's behaviour rather than just
   *  its copy: under it, flipping the EN/ع switch changes which notes exist
   *  for this reader, so the switch must refetch the vault instead of only
   *  re-skinning the chrome. */
  languageFilter: LanguageFilterMode;
  /** The server served the FULL collection because the language in force
   *  matched no published note (that language). The public shell prints a
   *  quiet line saying so — the alternative was a site that looked empty. */
  languageFallback: Lang | null;
  /** ADMIN ONLY: what the visitor-facing settings are costing in reach right
   *  now, or null when nothing material is being withheld. The status bar's
   *  standing indicator reads this — the ongoing half of "never silently hide
   *  a site". */
  visibility: VisibilityImpact | null;
  /** COMMENTS=on / settings.commentsEnabled. Off means Marginalia never even
   *  asks /api/comments — the answer is instance-wide and already in /api/me,
   *  so asking per note only bought one console 404 per note open. */
  commentsEnabled: boolean;
  /** Store the visitor's own chrome language and apply it live (strings +
   *  direction only). Ignored unless `languageToggle` is on. */
  setVisitorLang(lang: Lang): void;
  /** The admin's stored editor-language PREFERENCE: null (the default —
   *  follow the site) or an explicit pin. Persisted as "astrolabe.editorLang".
   *  Held here as well as in localStorage for the same reason
   *  `sidebarSidePref` is: the segmented control has to show which of the
   *  three states is in force, and "which one did I pick?" is not answerable
   *  from `language` alone — a pin to English and a follow of an English site
   *  render identically. */
  editorLangPref: Lang | null;
  /** Store the ADMIN's own editor chrome language and apply it live (strings
   *  + direction only), or follow the site language again with null. A device
   *  preference — it commits on click, never reaches the server, and changes
   *  nothing about what visitors are served. */
  setEditorLang(lang: Lang | null): void;
  /** THE WAY BACK (chromeLangSwitch.ts): flip this admin's chrome to
   *  the OTHER language — the pill on the status bar, the phone's More and
   *  Settings headers and note sheet, Ctrl/Cmd+Alt+Shift+L and the palette
   *  row all call this one action. The same preference setEditorLang writes,
   *  landing on "follow the site" when that is where the press points. */
  toggleChromeLang(): void;
  loginOpen: boolean;
  /** The desktop updater's last word (client/desktop): the status bar's
   *  version chip draws it — "3.x available" with a download behind it, a bar
   *  while downloading, "Restart to update" when staged. Null in a browser
   *  and before the first check. */
  desktopUpdate: { phase: string; version: string; received?: number; total?: number; installable?: boolean } | null;
  /** THE DESKTOP'S ZOOM FACTOR, so the shell can say it. 1 in a browser and
   *  until the desktop reports one. A factor nobody can see is a factor nobody
   *  can undo — Ctrl+= five times on a 1366 laptop leaves a 689px viewport,
   *  which is the phone shell with a mouse attached, and the reader has no way
   *  to know the app is not simply broken. The status bar draws a chip
   *  whenever this is not 1, and the chip is the reset. */
  desktopZoom: number;
  setDesktopZoom(factor: number): void;
  /** The desktop app holds this vault's credential itself (client/desktop):
   *  "Sign out" is hidden and a lapsed session is restored, never asked for. */
  desktopOwnsSession: boolean;
  /** The desktop app's own icon (the reader's, when set), as a data URL. */
  desktopBrandIcon: string | null;
  /** Admin moderation panel (palette: "Moderate comments"). */
  moderationOpen: boolean;
  setModerationOpen(b: boolean): void;
  /** Admin trash browser (palette: "Open trash"). The bin every delete dialog
   *  promises; nothing in the product could see it until this landed. */
  trashOpen: boolean;
  setTrashOpen(b: boolean): void;
  /** The import wizard (client/import/ImportDialog.tsx, docs/import.md):
   *  null when closed, else the target folder it opens with ("" = the
   *  default). Its doors: the palette, a folder's ⋯, More on the phone. */
  importFolder: string | null;
  openImport(folder?: string): void;
  closeImport(): void;
  /** Admin list of the files no note references (palette: "Unused
   *  attachments"). Same lifecycle as the trash browser: an admin surface
   *  over vault paths, closed by sign-out and by visitor preview. */
  unusedOpen: boolean;
  setUnusedOpen(b: boolean): void;
  /** Admin previewing the public site: every API call carries the preview
   *  flag and the server answers along its real visitor code path, so what
   *  renders IS the visitor experience (blog shell / visitor app view). */
  previewVisitor: boolean;
  /** Enter/exit visitor preview (admin only; never persisted — a reload
   *  always returns the admin to the app). */
  setPreviewVisitor(on: boolean): Promise<void>;

  // ------------------------------------------------- blog mode (PUBLIC_LAYOUT)
  /** Visitor-facing layout: "blog" wraps visitors in the classic blog shell
   *  (client/blog/), "designed" in the composed one (client/design/); admins
   *  always get the full app. The server only ever SENDS "designed" when a
   *  design is actually renderable, so this field never has to be second-
   *  guessed here. */
  publicLayout: "app" | "blog" | "designed";
  /** Why the DESIGNED site is not being served, for a real admin session only
   *  (/api/me withholds it from visitors and from an admin previewing as one).
   *  Null on every healthy instance and on every instance that is not in
   *  "designed" mode; `client/design/DesignStatus.tsx` is its only reader. */
  designNotice: { reason: string; design?: string; detail?: string } | null;
  /** SITE_TAGLINE — masthead subtitle (blog mode). */
  tagline: string | null;
  shareButtons: boolean;
  /** settings.ambient — the public masthead's ambient layer. Default OFF, so
   *  `false` is also what every non-blog surface and every unloaded session
   *  carries; client/ambient.tsx is its only reader. */
  ambient: boolean;
  /** SITE_FOOTER resolved server-side (blog mode; always set when blog). */
  footerLine: string | null;
  /** BCP47 locale for post dates (BLOG_LOCALE, default "en"). */
  blogLocale: string;
  /** BANNER_FALLBACK — what banner-less blog posts show as hero/thumb. */
  bannerFallback: "generated" | "none";
  /** settings.home — "/" mode + dashboard hero banner (blog mode; null = note). */
  home: HomeSettings | null;
  /** settings.logo — site logo image (banner-style value), blog mode. */
  logo: string | null;
  /** settings.dateCalendar — which calendar every human-facing date on this
   *  instance prints in. The formatting itself lives in client/dates.ts (a
   *  plain module, like i18n); this copy is here so React chrome that must
   *  re-render on a live settings change has something to subscribe to. */
  dateCalendar: DateCalendar;
  /** settings.textDirection / settings.textAlign — the SITE default for note
   *  prose. Same arrangement: client/textLayout.ts does the work, the store
   *  carries the value so the status bar's "this note differs" segment and
   *  the settings panel re-render when it moves. */
  textDirection: TextDirection;
  textAlign: TextAlign;
  /** The properties card on notes without frontmatter (settings.emptyPropsCard). */
  emptyPropsCard: boolean;
  /** settings.folderIcons — vault-relative FOLDER path → one glyph from the
   *  closed set. Read per row by the sidebar tree, which is why the identity
   *  of this object matters: TreeRow is memoized over 1.4k rows and reads
   *  `s.folderIcons[node.path]` (a string or undefined), so a map that is
   *  rebuilt on every loadMe would be fine, but a map rebuilt on every RENDER
   *  would not. It is replaced only when /api/me answers or the picker saves;
   *  the empty case is one shared frozen object, so a vault with no marks
   *  never allocates. */
  folderIcons: Record<string, FolderMark>;
  /** Where new attachments land (MeData.attachmentFolder), or null when the
   *  policy names no folder. The "Move to…" picker keeps notes out of it. */
  attachmentFolder: { mode: "specified" | "subfolder"; folder: string } | null;
  /** Where the sidebar's pencil starts a drawing ("" = the vault root). */
  drawingsFolder: string;
  /** Store a fresh folder→glyph map (the tree picker, post-PATCH). */
  setFolderIcons(icons: Record<string, FolderMark>): void;
  /** Merge a fresh home config into the store (the dashboard's banner save). */
  setHome(home: HomeSettings | null): void;

  // --------------------------------------------------------------- publish
  /** Published note paths (admin marks/filter); null = unknown/unavailable. */
  publishedPaths: Set<string> | null;
  /** Publish stats from /api/me ("18 published" in the status bar). */
  publishedCounts: PublishedCounts | null;
  /** Status-bar toggle: sidebar shows only published notes (admin). */
  publishedFilter: boolean;
  /** Publish state of the OPEN note, read from its frontmatter by the
   *  status bar's content fetch; null while unknown (note switching). */
  openPublished: boolean | null;

  /** Refresh publishedPaths + counts (admin; no-ops gracefully otherwise). */
  loadPublished(): Promise<void>;

  // ----------------------------------------------------------------- twins
  /** Every twinned note, keyed by path — both directions, so "does this note
   *  have another face" is a lookup and never a request (shared/twins.ts).
   *  Empty for a visitor, who gets the link-time swap table below instead. */
  twins: Record<string, TwinPair>;
  /** Flip (or set) a note's publish flag via POST /api/publish. */
  togglePublish(path: string, publish?: boolean): Promise<void>;
  setPublishedFilter(b: boolean): void;
  setOpenPublished(b: boolean | null): void;

  // ---------------------------------------------------------------- banners
  /** "Set banner…" modal (admin; acts on the open note). */
  bannerModalOpen: boolean;
  setBannerModalOpen(b: boolean): void;
  /** Write (value) or clear (null) a note's frontmatter banner. */
  setBanner(path: string, value: string | null): Promise<void>;
  /** Write (value) or remove (null) ONE frontmatter property, byte-surgically
   *  (v1.8: the editable properties card). Same choreography as setBanner —
   *  the two are the same route with a different value shape. */
  setProperty(path: string, key: string, value: PropertyValue | null): Promise<void>;

  // --------------------------------------------------------------- settings
  /** Site settings panel (admin; status-bar gear / palette "Site settings"). */
  settingsOpen: boolean;
  setSettingsOpen(b: boolean): void;
  /** The quick-capture sheet (client/components/CaptureSheet.tsx): open
   *  from anywhere by Ctrl/Cmd+Shift+D, the palette, or the phone's ⋯ menu. */
  captureOpen: boolean;
  setCaptureOpen(b: boolean): void;
  /** The same sheet, opened on its RECORDER (docs/capture.md "Voice"): the
   *  palette's "Voice note" and the phone's ⋯ row. Cleared whenever the sheet
   *  closes, so the next Ctrl/Cmd+Shift+D opens on the text field again. */
  captureVoice: boolean;
  openVoiceNote(): void;
  /** THE ROW A SURFACE ELSEWHERE IN THE APP IS POINTING AT — a settings row's
   *  own label key, or null.
   *
   *  A panel that has to say "this is switched off" owes the reader the
   *  switch, and the moderation panel was printing a shell variable instead
   *  ("start the server with COMMENTS=on"), which is an instruction most
   *  owners of this product cannot follow and none of them should have to
   *  (v1.8 UX audit F33). The key is resolved against SETTINGS_INDEX, so the
   *  caller names a ROW and not a tab plus a scroll offset — the same index the
   *  panel's own search walks, which is what keeps the two from drifting.
   *  Cleared by the panel once it has arrived. */
  settingsFocus: I18nKey | null;
  /** Open the settings panel ON a row: reveal it, mark it, and let the reader
   *  see the control that answers the sentence they just read. */
  openSettingsAt(label: I18nKey): void;

  /** Keyboard-shortcuts overlay (Ctrl/Cmd+/, the status-bar ? button, the
   *  palette). Visitors get it too — the panes, themes and search are theirs. */
  shortcutsOpen: boolean;
  setShortcutsOpen(b: boolean): void;

  /** The answer panel (client/components/AskPanel.tsx, docs/ask.md): open
   *  from the palette's "Ask the vault…" and the ⋯ menu. `askQuestion` is a
   *  question to ask at once (the palette's prompt), consumed on open. */
  askOpen: boolean;
  askQuestion: string | null;
  setAskOpen(open: boolean, question?: string | null): void;

  /** Boot: fetch /api/me, then load the vault + restore session/home note. */
  bootstrap(): Promise<void>;
  loadMe(): Promise<void>;
  /** Verify the password; throws (with the server message) on failure. */
  login(password: string): Promise<void>;
  logout(): Promise<void>;
  setLoginOpen(b: boolean): void;

  loadTree(): Promise<void>;
  openNote(path: string): void;
  closeTab(path: string): void;
  /** Walk the focused pane's tab strip: +1 the next tab, -1 the previous,
   *  wrapping. The keyboard half of the tab bar (F12). */
  stepTab(delta: number): void;
  /** Close the focused pane's ACTIVE tab — what a close chord means when the
   *  reader is not pointing at a particular one. */
  closeActiveTab(): void;
  /** Replace the workspace and re-derive the mirror. The ONE writer of
   *  `openPath`/`openTabs`. */
  commitWorkspace(ws: Workspace): void;
  /** Move the keyboard to a pane. Every tab action below acts on the FOCUSED
   *  pane, so a surface that acts on a particular one focuses it first — which
   *  is what a click on it means anyway. */
  focusPane(id: string): void;
  /** Split the focused pane, carrying its active tab into the new one.
   *  Returns false when the layout is at its cap, so the caller can say so by
   *  name instead of the keystroke appearing to do nothing. */
  splitFocusedPane(axis: "inline" | "block"): boolean;
  closeFocusedPane(): void;
  /** Open a book as an ordinary WORKSPACE TAB — beside notes, in a pane — with
   *  an optional landing target (a citation's page/rect). The full-screen
   *  overlay was Stage 9's stopgap; a book you cannot read beside the note you
   *  are taking is the wrong product, and the model carried `.pdf` tabs and
   *  `bookTarget` from day one waiting for this wire. */
  openBook(path: string, target?: BookTarget | null): void;
  /** The reader landed on its citation — the one-shot target is spent. */
  clearBookTarget(paneId: string): void;
  /** The shelf, as the focused pane's surface. Tabs stay; the mode flips. */
  openLibrary(): void;
  closeLibrary(): void;
  /** One pane's mode, set directly — what a pane's own chrome (its book
   *  surface routing to the shelf) asks for. */
  setPaneMode(paneId: string, mode: PaneMode): void;
  // The tab context menu's rows. Each names what it takes — and none of them
  // takes a PINNED tab, which is the same promise in every row, so a reader
  // never has to remember which of them respects a pin.
  closeOtherTabs(path: string): void;
  closeTabsAfter(path: string): void;
  /** Every note in this window — the row the owner asked for by name. */
  closeAllTabs(): void;
  setTabPinned(path: string, pinned: boolean): void;
  moveTabTo(path: string, index: number): void;
  /** A finished tab drag: `path` leaves `from` and lands on `to` — in its tab
   *  strip at an index, or on an edge, which splits `to` and puts the tab in
   *  the new pane. `from` is null for a drag lifted off the TREE (no tab to
   *  remove anywhere). The gesture reducers refuse whole at the caps. */
  dropTab(from: string | null, path: string, to: string, dest: TabDropDest): void;
  /** "editor", "media", or "graph" — the last opens the graph TAB in the
   *  focused pane rather than switching a window-level view. */
  setView(v: View | SurfaceView): void;
  /** True when the focused pane is showing the graph tab. */
  graphOpen(): boolean;
  /** The Media page, on the same terms as the graph. */
  mediaOpen(): boolean;
  toggleMedia(): void;
  /** The Orbits page, on the same terms. */
  sigilsOpen(): boolean;
  toggleSigils(): void;
  /** The Calendar page, on the same terms: the month with its own door. */
  calendarOpen(): boolean;
  toggleCalendar(): void;
  /** Feeds (docs/feeds.md): the tab in front of the focused pane, and its door. */
  feedsOpen(): boolean;
  toggleFeeds(): void;
  /** Today (client/today/), on the same terms: the day with its own door. */
  todayOpen(): boolean;
  toggleToday(): void;
  /** The Orbits shelf, on the same terms; a session over one
   *  deck is its own tab beside it (`openOrbits`). */
  orbitsOpen(): boolean;
  toggleOrbits(): void;
  /** Open a study session over the deck at `path` — or the shelf,
   *  for null — as a tab in the focused pane. */
  openOrbits(path: string | null, section?: string | null): void;
  /** Swap in a whole workspace — a restored named layout. */
  applyWorkspace(ws: Workspace): void;
  /** Toggle the graph tab in the focused pane: open (or focus) it, or, when it
   *  is already the active tab, close it and land on the tab beside it. */
  toggleGraph(): void;
  /** The split grips (client/components/Workspace.tsx): the share of the pair
   *  of columns either side of `gap` that the first one takes, and the share
   *  of a column's height its upper pane takes. Both clamp to 10–90 %. */
  resizeCols(gap: number, ratio: number): void;
  resizeRows(col: number, ratio: number): void;
  setTheme(t: ThemeChoice): void;
  /** The ☾/☀ move, as one action: this room's curated counterpart on the other
   *  side of the day (themes.ts::counterpartChoice), never the next id in a
   *  list. It exists as a store action rather than as two lines in the palette
   *  because the status bar's glyph, the blog's button and now a palette row
   *  all mean the same gesture, and a third copy of "which theme is the other
   *  half of this one" is how the three drift apart (v1.8 audit, F19). */
  toggleTheme(): void;
  /** What a cookieless VISITOR lands on, and why — admin sessions only (null
   *  for everyone else, which is also how the chrome knows not to draw the
   *  "Visitors see …" line). Refreshed by loadMe, by the debounced mirror of
   *  the admin's own pick, and by setPublicTheme below. */
  publicTheme: PublicThemeInfo | null;
  /** Pin the public default to a theme, or pass null to go back to following
   *  the admin's editor theme. One click from the theme picker and from the
   *  Appearance row — the whole point is that an owner can see the rule and
   *  change it in the same breath. Writes settings.defaultTheme. */
  setPublicTheme(theme: ThemeChoice | null): Promise<void>;
  toggleVim(): void;
  toggleRelativeLines(): void;
  toggleReading(): void;
  setReadingMode(b: boolean): void;
  setPaletteOpen(b: boolean): void;
  refreshBacklinks(): Promise<void>;
  createNote(path: string): Promise<void>;
  renameNote(path: string, toPath: string): Promise<void>;
  /** Default is the recoverable move to the vault's `.trash/`; `permanent`
   *  erases the file. Same two speeds as deleteFolder. */
  deleteNote(path: string, opts?: { permanent?: boolean }): Promise<void>;
  /** Move a folder (and everything under it) to the vault's .trash — or erase
   *  it outright. Closes every open tab inside it, then refreshes the tree. */
  deleteFolder(path: string, opts?: { permanent?: boolean }): Promise<void>;
  /** Delete ONE attachment (image, PDF, recording) at the same two speeds.
   *  A published note may embed it, so the publish state is refreshed with
   *  the tree — this is the one delete whose damage a stranger can see. */
  deleteAttachment(path: string, opts?: { permanent?: boolean }): Promise<void>;
  /** Restore an entry out of `.trash/`. Answers where it actually landed,
   *  which is not always where it came from — the caller says so. */
  restoreTrash(name: string): Promise<{ path: string; renamed: boolean }>;

  /** Editor reports unsaved-changes state here. */
  setDirty(path: string, dirty: boolean): void;
  /** Rewrite a path (or folder prefix) across tabs/openPath/dirty after a rename. */
  remapPath(path: string, toPath: string): void;
  /** The last path (note or folder) that moved, as `remapPath` applied it —
   *  so a surface that remembers paths OUTSIDE the workspace (the phone's
   *  navigation stack, client/phone/nav.ts) can follow a rename instead of
   *  mistaking it for the reader opening a different note. */
  lastRemap: { from: string; to: string } | null;
  /** Signal that the open note's on-disk content changed externally. */
  bumpReload(): void;
  /** Queue (or clear) a heading for the next opened note to scroll to. */
  setPendingHeading(h: string | null): void;
  /** Queue (or clear) a caret offset for a note about to open. */
  setPendingCaret(c: { path: string; offset: number } | null): void;
}
