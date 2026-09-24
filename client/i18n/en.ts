// THE ENGLISH DICTIONARY, and the key list. Every chrome string the client
// shows, by key; `t()`/`tf()` in client/i18n.ts read whichever language is
// installed. `I18nKey` is derived from THIS object, and client/i18n/ar.ts is
// held to it by type — a key added here and not there, or there and not here,
// does not compile. Neither file is in the entry chunk: the page loads the one
// it starts in and fetches the other when the reader switches (client/i18n.ts,
// loadDictionary), so an English reader never downloads the Arabic and an
// Arabic reader never downloads the English. check-i18n reads both.
//
// Note CONTENT is never translated — it renders as authored. The comments
// below explain keys; they live here, once, beside the English.

const en = {
  // ── Sidebar ──────────────────────────────────────────────────────────────
  searchPlaceholder: "Search notes…",
  searchTitle: "Search notes (Ctrl/Cmd+K)",
  noMatchesDot: "No matches.",
  tags: "Tags",
  showTags: "Show tags",
  hideTags: "Hide tags",
  searchTag: "Search #{tag}",
  clearTagFilter: "Clear #{tag} filter",
  newNote: "New note",
  newFolder: "New folder",
  newNoteHere: "New note here",
  rename: "Rename",
  delete: "Delete",
  // ── Folder glyphs ────────────────────────────────────────────────────────
  // The context menu's row, the popover it opens, and the twenty names. The
  // names are NOT decoration: the grid is twenty icon-only buttons, so each
  // one's accessible name is the only thing a screen reader has to pick by,
  // and each one's tooltip is the only thing a sighted reader has when the
  // drawing is ambiguous (a pawn IS a chess piece; nobody has to agree).
  folderIcon: "Folder icon",
  folderIconFor: "Icon for “{name}”",
  folderIconNone: "No icon",
  folderIconFailed: "Setting the folder icon failed",
  folderIconImage: "Your own image",
  folderIconImagePlaceholder: "attachments/icons/rocket.svg",
  folderIconUpload: "Upload…",
  folderIconUploading: "Uploading…",
  folderIconUseImage: "Use this image",
  folderIconImageHint: "SVG, PNG, WebP, GIF or JPEG, up to 512 KB. Kept in the vault like any attachment; a small square reads best.",
  folderIconTooBig: "That image is over 512 KB",
  folderIconUploadFailed: "The image could not be uploaded",
  folderIconSearch: "Search icons",
  folderIconNoMatch: "No icon matches",
  folderIconGroupMake: "Writing and reading",
  folderIconGroupStudy: "Science and study",
  folderIconGroupTech: "Tech and making",
  folderIconGroupPlay: "Arts and play",
  folderIconGroupGo: "Places and travel",
  folderIconGroupNature: "Nature and sky",
  folderIconGroupLife: "Food, body and home",
  folderIconGroupWork: "Work and money",
  folderIconGroupMarks: "Marks and symbols",
  folderPickFilter: "Filter folders",
  folderPickNone: "The vault has no folders yet",
  libraryMenu: "Put on the shelf…",
  libraryPopOnShelf: "On the shelf as “{title}”",
  libraryPopOpen: "Open on the shelf",
  libraryPopRemove: "Take off the shelf",
  libraryPopAdd: "Put on the shelf",
  libraryPopHint: "Every published note inside becomes a lesson; subfolders are its chapters or lectures.",
  libraryAdded: "On the shelf.",
  libraryEditToast: "Edit on the shelf",
  libraryAddedOn: "On the shelf, and the library is now open to readers.",
  libraryRemoved: "Taken off the shelf",
  libraryFailed: "Saving the library failed",
  libraryFull: "The shelf is full ({max} paths)",
  libraryPathChoose: "Choose a folder…",
  libraryPathChooseTitle: "Which folder is this?",
  libraryPathNoFolder: "No folder chosen",
  libraryPathsTreeHint: "Or right-click a folder in the tree and choose Library.",
  libraryPathDetails: "Blurb, cover and source",
  libraryPathLessons: "{published} of {notes} notes published",
  libraryPathNonePublished: "Readers see nothing here until a note inside is published.",
  pathSuggestions: "Suggestions from the vault",
  graphClose: "Close settings",
  graphTagPick: "Which tag colours a note",
  graphTagCommon: "Most shared",
  graphTagFirst: "First in the note",
  graphGather: "Gather tags",
  graphGatherHint: "Tags gathered under one name share a colour.",
  graphGatherName: "Group name",
  graphGatherTags: "tags, comma separated",
  graphGatherAdd: "Gather more tags",
  graphGatherRemove: "Remove this gathering",
  // A note deletes at the same two speeds as a folder — the first dialog
  // promises .trash, the second is the erase — so these read as the folder's
  // pair does, one line apart in the same menu.
  // ── The delete story ─────────────────────────────────────────────────────
  // Three objects delete (a note, an attachment, a folder), each at two
  // speeds (move to .trash / erase), and all six dialogs must tell the reader
  // the same truth — so the two TITLES are shared and only the consequence
  // sentence changes. They used to be six near-identical strings free to
  // drift apart one edit at a time, which is how a palette hint ended up
  // promising "irreversible" over a recoverable act.
  moveToTrashTitle: "Move “{name}” to .trash?",
  permDeleteTitle: "Permanently delete “{name}”?",
  // A note and an attachment are both ONE file: same sentence, and the path
  // inside it is what tells them apart.
  deleteFileTrashBody: "“{path}” will move to the vault’s .trash folder — recoverable from disk.",
  deleteFilePermBody: "“{path}” will be erased from disk. This cannot be undone.",
  // The tail these three used to carry — "restore it from the trash browser"
  // — was the whole of what a delete offered: an instruction to go and find a
  // surface, in a message that fades. F24 put a real Undo button in the toast,
  // so the sentence goes back to stating the fact and lets the button carry
  // the verb. (The bin is still in the palette for the reader who lets the
  // nine seconds run out.)
  noteTrashedToast: "Moved “{name}” to .trash",
  noteDeletedToast: "Deleted “{name}” permanently",
  creatingFolderFailed: "Creating folder failed",
  deleteFolder: "Delete folder",
  // The folder dialogs name what is really in there. A markdown-only count was
  // the lie that cost a published essay its images: a folder holding four
  // attachments and no notes reported "0 notes will move" and took all four
  // with it. `{contents}` carries BOTH counts (see deleteContents).
  deleteFolderTrashBody: "The folder and its contents — {contents} — move to the vault’s .trash folder, recoverable from disk.",
  moveToTrash: "Move to .trash",
  deletePermanently: "Delete permanently",
  deleteFolderPermBody: "The folder and its contents — {contents} — will be erased from disk. This cannot be undone.",
  // "0 notes and 4 files". Both halves come from countPhrase(), so the Arabic
  // agrees (ملاحظة / ملاحظتان / ملاحظات) instead of gluing a numeral to a
  // singular.
  deleteContents: "{notes} and {attachments}",
  // The collateral — the sentences the delete dialogs never said, and the
  // point of this whole section. The indexer has always known which notes
  // embed which attachment; no destructive verb was asking it. `{notes}` is
  // the referring notes BY NAME when there are few, and a count once naming
  // them would be a wall rather than information.
  //
  // The English is deliberately PASSIVE ("embedded by …", not "… embed this
  // file"). `{notes}` is a count phrase as often as it is a name, so an
  // active verb has to agree with a number the string cannot see: the first
  // draft printed "“The Moved Essay” still embed this file" whenever exactly
  // one note was named, which is a typo in the one sentence whose whole job
  // is to be believed. Arabic keeps its verb-first form, where a non-human
  // plural takes the feminine singular and both counts already agree.
  folderRefsWarn: "{count} in here — embedded by {notes}. Those embeds break.",
  attachmentRefsWarn: "Embedded by {notes} — those embeds break.",
  noteRefsWarn: "Linked from {notes} — those links go broken.",
  folderTrashedToast: "Moved “{name}” to .trash",
  folderDeletedToast: "Deleted “{name}” permanently",
  // Attachments delete too, now. Their own toasts because Arabic agrees with
  // the noun: a ملف is masculine where a ملاحظة is feminine, so reusing the
  // note's line would print "نُقلت" over a file.
  deleteAttachment: "Delete file",
  fileTrashedToast: "Moved “{name}” to .trash",
  fileDeletedToast: "Deleted “{name}” permanently",
  couldNotDeleteFile: "Could not delete that file",
  couldNotDeleteFolder: "Could not delete that folder",
  // ── Trash browser ────────────────────────────────────────────────────────
  // Every delete dialog above promises ".trash — recoverable from disk". This
  // is the surface that makes the promise keepable without a terminal.
  trashBrowser: "Trash",
  cmdOpenTrash: "Open trash",
  cmdOpenTrashHint: "restore or erase what was deleted",
  closeTrash: "Close trash",
  trashLoading: "Opening .trash…",
  trashLoadFailed: "Could not read .trash",
  trashEmpty: "The trash is empty — nothing deleted is waiting here.",
  trashFrom: "from {path}",
  trashOriginUnknown: "origin unknown — restores to the vault root",
  trashOriginTaken: "{path} is taken — restores beside it",
  restore: "Restore",
  restoredToast: "Restored “{name}” to {path}",
  restoredRenamedToast: "Restored “{name}” as {path} — its old place was taken",
  restoreFailed: "Could not restore that",
  // The trash's own permanent delete — the one delete in the product with
  // nothing behind it, which is what the body says.
  purgeBody: "“{name}” will be erased from .trash. Nothing is behind this one.",
  purgedToast: "Erased “{name}” from .trash",
  purgeFailed: "Could not erase that",
  emptyTrash: "Empty trash",
  emptyTrashTitle: "Empty the trash?",
  emptyTrashBody: "Everything in .trash — {contents} — will be erased from disk. This cannot be undone.",
  emptiedTrashToast: "Emptied .trash",
  // The wordmark ENTERS visitor preview — a mode that takes the editor away.
  // A tooltip reading "View public site" did not say that, and the click was
  // the commonest accidental way into a shell with no editing in it.
  viewPublicSite: "Preview the public site as a visitor (Esc returns)",
  publishedOnly: "Published only",
  showAll: "Show all",
  published: "Published",
  notesByTopic: "Notes by topic",
  publishedNotes: "Published notes",
  notes: "Notes",
  nothingPublished: "Nothing published yet.",
  // ── The empty vault (F41) ───────────────────────────────────────────────
  // Not a report that a list is empty — an invitation with two doors on it.
  // The guide door only draws when GET /api/seed says there is one to take.
  vaultEmptyBody: "Nothing in this vault yet. Start a note, or take the guide.",
  vaultEmptySeed: "Start with the guide",
  seedFailed: "Could not add the starter notes",
  home: "Home",
  collapseSection: "Collapse {label}",
  expandSection: "Expand {label}",

  // ── Attachments (tree rows, filter toggle, viewer) ──────────────────────
  showAttachments: "Show attachments",
  hideAttachments: "Hide attachments",
  attachmentsHidden: "{count} hidden",
  showMoreRows: "Show {count} more",
  attachmentViewer: "Attachment viewer",
  closeViewer: "Close (Esc)",
  previousFile: "Previous file",
  nextFile: "Next file",
  openInNewTab: "Open in new tab",
  downloadFile: "Download",
  fileLoadFailed: "This file could not be loaded.",
  noPreviewFor: "No preview for this file type.",
  unitBytes: "B",
  unitKB: "KB",
  unitMB: "MB",
  unitGB: "GB",

  // ── Tabs ────────────────────────────────────────────────────────────────
  closeTab: "Close {title}",
  unsaved: "unsaved",

  // ── Status bar ──────────────────────────────────────────────────────────
  noNoteOpen: "No note open",
  publish: "Publish",
  publishTitle: "Publish this note for visitors (Ctrl/Cmd+Shift+P)",
  unpublishTitle: "Unpublish this note (Ctrl/Cmd+Shift+P)",
  filterToPublished: "Filter the sidebar to published notes",
  showFullVault: "Show the full vault in the sidebar",
  // "Settings", full stop. "Site settings" said SITE about a panel that also
  // holds this browser's own theme, the editor's behavior and the backup
  // credentials, and the product has exactly one settings screen — a qualifier
  // that distinguishes nothing is a longer word for the same thing. The Arabic
  // is the dictionary's own term for the noun, as in settingsSaved and
  // settingsSections — not a fresh coinage.
  siteSettings: "Settings",
  moreTools: "More",
  // The two rows the phone's bottom bar set down (StatusBar.tsx, app.css's
  // phone-bar block). The STATE is in the label because a ✓ on one row puts
  // the tick column on every row of that menu.
  moreVimOn: "Vim keybindings — on",
  moreVimOff: "Vim keybindings — off",
  siteSettingsTitle: "Settings — identity, home page, behavior, typography, backup",
  previewAsVisitor: "Preview as visitor",
  previewAsVisitorTitle: "Preview as visitor — see exactly what the public site serves",
  // The button opens the PICKER (a room is browsed, not cycled into), so
  // its tooltip names where you are and what the click does — not the one
  // theme a "next" step would have landed on.
  themeTitle: "Theme: {theme} — click to browse them all",

  // ── Theme picker ────────────────────────────────────────────────────────
  // Theme names USED to stay untranslated "because they are proper nouns".
  // Every room was therefore identified by an obscure pigment noun —
  // verdigris, porphyry, iron-gall — which an Arabic reader met in Latin
  // script and an English one mostly could not decode either. The raw id is
  // still the value DEFAULT_THEME and the palette take (shared/themes.ts is
  // the one list, and it does not move); what changed is that the PICKER now
  // shows a human label and a one-line description of the room, in both
  // languages, with the id kept in the row's tooltip.
  thGithubDark: "GitHub Dark",
  thGithubDarkDesc: "Solid neutral greys, sky blue — the default",
  thNord: "Nord",
  thNordDesc: "Arctic blue-greys, frost cyan",
  thDracula: "Dracula",
  thDraculaDesc: "Purple-grey night, violet and pink",
  thOneDark: "One Dark",
  thOneDarkDesc: "Atom's grey, soft blue",
  thTokyoNight: "Tokyo Night",
  thTokyoNightDesc: "Deep blue night, neon blue and violet",
  thCatppuccinMocha: "Catppuccin Mocha",
  thCatppuccinMochaDesc: "Soft dark lavender, pastel mauve",
  thGruvboxDark: "Gruvbox Dark",
  thGruvboxDarkDesc: "Warm retro dark, orange",
  thSolarizedDark: "Solarized Dark",
  thSolarizedDarkDesc: "Deep teal-black, cyan",
  thMonokai: "Monokai",
  thMonokaiDesc: "Olive-black, lime green",
  thMaterialOcean: "Material Ocean",
  thMaterialOceanDesc: "Near-black navy, ocean blue",
  thPalenight: "Palenight",
  thPalenightDesc: "Muted indigo night, lilac",
  thAyuDark: "Ayu Dark",
  thAyuDarkDesc: "True dark, warm orange",
  thAyuMirage: "Ayu Mirage",
  thAyuMirageDesc: "Slate blue-grey, sky blue",
  thEverforestDark: "Everforest Dark",
  thEverforestDarkDesc: "Forest green-grey, sage",
  thRosePine: "Rosé Pine",
  thRosePineDesc: "Velvet purple-black, iris",
  thNightOwl: "Night Owl",
  thNightOwlDesc: "Midnight navy, sky blue",
  thKanagawa: "Kanagawa",
  thKanagawaDesc: "Ink-wash charcoal, wave blue",
  thGithubLight: "GitHub Light",
  thGithubLightDesc: "Clean white, link blue",
  thCatppuccinLatte: "Catppuccin Latte",
  thCatppuccinLatteDesc: "Soft light grey, mauve",
  thSolarizedLight: "Solarized Light",
  thSolarizedLightDesc: "Cream paper, blue",
  thGruvboxLight: "Gruvbox Light",
  thGruvboxLightDesc: "Warm cream, burnt orange",
  thAyuLight: "Ayu Light",
  thAyuLightDesc: "Bright white, blue",
  thEverforestLight: "Everforest Light",
  thEverforestLightDesc: "Warm paper, forest green",
  thRosePineDawn: "Rosé Pine Dawn",
  thRosePineDawnDesc: "Dawn cream, pine",
  thIronGall: "Iron gall",
  thIronGallDesc: "Gold leaf on candlelit ink",
  thVoid: "Void",
  thVoidDesc: "Cold cyan on true black",
  thLapis: "Lapis",
  thLapisDesc: "Bright gold on lapis blue-black",
  thCinnabar: "Cinnabar",
  thCinnabarDesc: "Vermilion on neutral graphite",
  thBasalt: "Basalt",
  thBasaltDesc: "Pale sky on blue-grey stone",
  thVerdigris: "Verdigris",
  thVerdigrisDesc: "Oxidised copper on green-black",
  thPorphyry: "Porphyry",
  thPorphyryDesc: "Dusty rose on purple-black stone",
  thNocturne: "Nocturne",
  thNocturneDesc: "Periwinkle on blue-black night",
  thTallow: "Tallow",
  thTallowDesc: "Candle-flame amber on brown paper",
  thSumi: "Sumi",
  thSumiDesc: "Indigo on ink-stick grey",
  thMoss: "Moss",
  thMossDesc: "Lichen green on olive-black",
  thPhosphor: "Phosphor",
  thPhosphorDesc: "P1 green on a cold screen",
  thSidereal: "Sidereal",
  thSiderealDesc: "Starlight on a moonless sky",
  thMurex: "Murex",
  thMurexDesc: "Tyrian purple on a violet night",
  thGraphite: "Graphite",
  thGraphiteDesc: "Solid neutral greys, gold leaf",
  thParchment: "Parchment",
  thParchmentDesc: "Gold leaf on warm paper",
  thSandstone: "Sandstone",
  thSandstoneDesc: "Burnt orange on desert paper",
  thLinen: "Linen",
  thLinenDesc: "Ink blue on cool daylight",
  thSolar: "Solar",
  thSolarDesc: "Burnt gold on the brightest paper",
  thPalimpsest: "Palimpsest",
  thPalimpsestDesc: "Rubric red on scraped parchment",
  thPorcelain: "Porcelain",
  thPorcelainDesc: "Deep celadon on glazed white",
  thMauveine: "Mauveine",
  thMauveineDesc: "Aniline violet on pale lilac",
  themeIdTitle: "{name} — theme id “{id}”",
  themePicker: "Theme",
  themePickerHint: "↑↓←→ preview · Enter keeps · Esc restores",
  themeGroupDark: "Dark",
  themeGroupLight: "Light",
  themeCurrent: "current",
  // The row opens the picker; the ellipsis and the verb were both saying that
  // twice. "Themes" names the thing, which is what a command list is for —
  // and the Arabic is docTheming's own word (السمات).
  browseThemes: "Themes",
  // ── What the PUBLIC gets, said out loud ──────────────────────────────────
  // The default theme follows the owner's own editor theme unless they pin
  // one, so the owner's private pick is a public act — and an owner must never
  // find that out by accident. Both surfaces that choose a theme (the picker,
  // the Appearance row) print this sentence and offer the one click that
  // changes the rule.
  visitorsFollow: "Visitors see {theme} — following your editor theme",
  visitorsPinned: "Visitors see {theme} — pinned",
  pinForVisitors: "Pin this instead",
  followMyTheme: "Follow my theme",
  themePinnedNow: "Visitors are pinned to {theme}",
  themeFollowingNow: "Visitors follow your editor theme again",
  themePinFailed: "Could not change the visitors' theme",
  themeFollowOption: "Follow my editor theme",
  graph: "graph",
  graphTitle: "Toggle graph view (Ctrl/Cmd+G)",
  signIn: "Sign in",
  signInTitle: "Sign in to edit this vault",
  signOut: "Sign out",
  signOutTitle: "Sign out — back to the visitor view",

  // ── The two panes, named by WHAT THEY ARE ───────────────────────────────
  // Never by the edge they sit on. In Arabic the notes sidebar is on the
  // right and the outline panel on the left, so "the left bar" names a
  // different pane in each language — which is exactly how a reader came to
  // ask why "the left bar cannot be folded". Both tooltips carry their
  // keystroke, in both languages.
  paneNotes: "Notes sidebar",
  paneOutline: "Outline & backlinks",
  // The keystrokes moved: Ctrl/Cmd+B is BOLD in the editor now (every reader
  // arrives with that binding), so the two pane toggles took one more
  // modifier and kept their shape — same key, Shift picks the second pane.
  rowScreenWarmth: "Screen warmth",
  hintScreenWarmth: "An amber sheet over the page, like a phone's night light. Per device.",
  rowScreenDim: "Dim the screen",
  hintScreenDim: "Darkens the page below what the monitor's own brightness reaches. Per device.",
  eyeComfortOff: "Off",
  cmdWarmScreen: "Warm the screen",
  cmdCoolScreen: "Cool the screen",
  cmdWarmScreenHint: "Night light: an amber sheet over the page, per device",
  rowEditorWidth: "Writing column",
  hintEditorWidth: "The width of the editor's and the reading view's text. Per device.",
  editorWidthMeasure: "Reading measure",
  editorWidthWide: "Wide",
  editorWidthFull: "Full width",
  editorWidthCustom: "Custom",
  editorWidthCustomPlaceholder: "900px or 70%",
  editorWidthCustomHint: "Pixels (320–2400) or a share of the pane (30–100%). It applies as you type.",
  treeFoldInside: "Collapse everything inside",
  treeUnfoldInside: "Expand everything inside",
  treeSort: "Sort the tree",
  treeSortName: "By name",
  treeSortNameDesc: "By name, reversed",
  treeSortManual: "My own order",
  treeSortReset: "Forget my order",
  treePinned: "Pinned",
  treeUnpinAll: "Unpin all",
  treePin: "Pin to top",
  treeUnpin: "Unpin",
  treePinMany: "Pin {n} items to top",
  treeMoveMany: "Move {n} items to…",
  treeFocus: "Focus here",
  treeFocusAll: "Show all",
  treeFocusedOn: "Focused on “{name}”",
  paneGripNotes: "Drag to resize the notes sidebar; drag it off the edge to close it; double-click to reset",
  tagsGrip: "Drag to resize the tag shelf; double-click to reset",
  splitGripCols: "Drag to resize the panes; double-click to even them out",
  splitGripRows: "Drag to resize the panes; double-click to even them out",
  paneGripPanel: "Drag to resize the side panel; drag it off the edge to close it; double-click to reset",
  showPaneNotes: "Show Notes sidebar (Ctrl/Cmd+Alt+B)",
  hidePaneNotes: "Hide Notes sidebar (Ctrl/Cmd+Alt+B)",
  showPaneOutline: "Show Outline & backlinks (Ctrl/Cmd+Alt+Shift+B)",
  hidePaneOutline: "Hide Outline & backlinks (Ctrl/Cmd+Alt+Shift+B)",

  // ── Right panel ─────────────────────────────────────────────────────────
  backlinks: "Backlinks",
  noNoteOpenDot: "No note open.",
  noBacklinks: "No backlinks yet — link to this note with [[…]]",
  outline: "Outline",
  // F5: the section stays and says this, instead of vanishing and leaving the
  // panel a different shape on every note.
  noHeadings: "No headings yet.",
  localGraph: "Local graph",
  showLocalGraph: "Show local graph",
  hideLocalGraph: "Hide local graph",
  // F6: this used to be "No links yet — link to or from this note with [[…]]",
  // sitting two inches above the backlinks list's "No backlinks yet — link to
  // this note with [[…]]". Two near-identical sentences in one panel teach
  // nothing twice, so the INSTRUCTION is said once, in the backlinks empty
  // (DESIGN.md names that copy), and the graph's line is now only about the
  // picture it is standing in for.
  noLinksYet: "No links yet.",
  noPublishedLinks: "No published links yet.",

  // ── Note history ────────────────────────────────────────────────────────
  // The undo of last resort: `git log` over one note, read out of the same
  // repository Backup & sync has been writing all along. The section starts
  // collapsed and asks git nothing until it is opened — see HistoryPanel.tsx.
  history: "History",
  showHistory: "Show history",
  hideHistory: "Hide history",
  historyAria: "Revisions of this note",
  historyLoading: "Reading history…",
  historyFailed: "Could not read this note's history.",
  // The empty state with a door, both halves: what is missing, and the one
  // click that starts it. A vault with no repository keeps no history at all.
  historyNoRepo: "Backup is off — turn it on to start keeping history.",
  historyOpenBackup: "Open Backup & sync",
  historyEmpty: "No revisions yet — this note has never been committed.",
  historyOlder: "Older revisions not shown.",
  // "+12 −3", said out loud for a reader who is not looking at the digits.
  revisionChanges: "{added} lines added, {removed} removed",
  revisionAria: "Open this revision",
  // OUR OWN commit subjects, said in the reader's language. `commit()` writes
  // "astrolabe snapshot: <ISO>" and "astrolabe sync: <ISO>", which is right for a
  // terminal `git log` and wrong in a timeline whose first column is already
  // the date: the row would print the moment twice, once as "3 days ago" and
  // once as a machine timestamp. Somebody else's commit subject is left
  // exactly as they wrote it.
  revisionSnapshot: "Snapshot",
  revisionBackup: "Automatic backup",
  revisionTitle: "Revision",
  revisionLoading: "Opening this revision…",
  revisionOpenFailed: "Could not read that revision.",
  revisionEmpty: "This revision is empty.",
  restoreRevision: "Restore this revision",
  closeRevision: "Close revision",
  // A restore is itself a revision, so the way back is a second restore — of
  // the text that was there a moment ago.
  revisionRestored: "Restored “{name}” as it was on {when}",
  revisionRestoreFailed: "Could not restore that revision.",
  revisionRestoreUndone: "Restore undone.",

  // ── Snapshot ────────────────────────────────────────────────────────────
  // One local commit. The point a reader comes back to after a bulk edit.
  snapshotNow: "Snapshot now",
  cmdSnapshotHint: "Commit the vault locally — a point to come back to",
  snapshotMade: "Snapshot taken — {sha}",
  snapshotNothing: "Nothing has changed since the last snapshot",
  snapshotFailed: "Snapshot failed — {message}",

  // ── Command palette ─────────────────────────────────────────────────────
  // THE PLACEHOLDER IS THE ONLY PLACE THE PREFIX MODE IS TAUGHT (v1.8 audit,
  // F21). Heading-jump has been in the palette since headings had anchors and
  // nothing anywhere said so — a mode reachable only by a character you have
  // to already know is a mode nobody has. It costs three words here.
  palettePlaceholder: "Type a command, search notes, @ or # for a heading…",
  palettePlaceholderShort: "Command, note, @ or #…",
  paletteCommands: "Commands",
  paletteOpenTabs: "Open tabs",
  paletteNotes: "Notes",
  paletteCreate: "New",
  paletteNoMatches: "No matches",
  // The second line of the no-matches block: the rescue, not the report. A
  // reader who typed something the vault does not have is the reader most
  // likely to be reaching for a heading in the note already on screen.
  paletteModeHint: "Start with @ or # to jump to a heading in this note.",
  cmdCreateHint: "create",
  cmdDailyNote: "Open daily note",
  cmdToggleGraph: "Toggle graph",
  cmdViewHint: "view",
  cmdToggleReading: "Toggle reading view",
  // No longer a command label — the per-theme `Theme: <id>` palette rows are
  // gone — but still the blog's theme-button tooltip, which names the theme
  // in force.
  cmdTheme: "Theme: {t}",
  cmdAppearanceHint: "appearance",
  cmdToggleVim: "Toggle vim",
  cmdEditorHint: "editor",
  // The side commands name a PHYSICAL edge, in both languages: an Arabic
  // reader moving the notes sidebar left is asking for the left of the
  // screen, not for "the trailing side". "Auto" is the third state and the
  // default — it follows the reading direction and keeps following it.
  cmdPaneSideAuto: "Notes sidebar: follow the language",
  cmdPaneSideLeft: "Notes sidebar: pin to the left edge",
  cmdPaneSideRight: "Notes sidebar: pin to the right edge",
  cmdLayoutHint: "layout",
  cmdLayoutCurrentHint: "layout · in force",
  // THE WAY OUT, and the reason these are palette commands at all. An editor
  // in a script you cannot read is a room whose light switch you have to find
  // by touch: Settings is four words of Arabic and a tab away, while the
  // palette is one keystroke and answers to the language's OWN name typed in
  // its OWN script — "English" is Latin in both dictionaries, so it is
  // findable from an Arabic interface, and «العربية» from an English one.
  // Three rows for a three-state preference, marked like the sidebar's.
  cmdEditorLangFollow: "Editor language: follow the site",
  cmdEditorLangEn: "Editor language: English",
  cmdEditorLangAr: "Editor language: العربية",
  cmdEditorLangHint: "this browser",
  cmdEditorLangCurrentHint: "this browser · in force",
  cmdTogglePaneNotes: "Toggle Notes sidebar",
  cmdTogglePaneOutline: "Toggle Outline & backlinks",
  cmdZen: "Zen mode",
  cmdZenHint: "chrome steps aside",
  cmdPublishNote: "Publish note",
  cmdPublishHint: "✦ live for visitors",
  cmdUnpublishNote: "Unpublish note",
  cmdUnpublishHint: "✧ visitors lose it",
  cmdSetBanner: "Set banner…",
  cmdSetBannerHint: "hero image",
  cmdRemoveBanner: "Remove banner",
  cmdRemoveBannerHint: "clear the hero image",
  cmdRenameCurrent: "Rename current note",
  cmdMoveHint: "move",
  cmdDeleteCurrent: "Delete current note",
  // The palette's delete command runs the SAME two-speed flow the tree row
  // runs, and its default speed is the recoverable one. The hint names that
  // default — a hint promising "irreversible" one keystroke before a dialog
  // promising .trash is the two-guarantees-for-one-gesture defect again.
  cmdTrashHint: "moves to .trash",
  cmdModerateComments: "Moderate comments",
  cmdMarginaliaHint: "marginalia",
  cmdSiteSettingsHint: "identity · home · behavior · type · backup",
  cmdPreviewHint: "see the public site",
  cmdExitPreview: "Exit visitor preview",
  cmdExitPreviewHint: "back to the vault",
  cmdSignInHint: "unlock editing",
  cmdSignOutHint: "back to reading",
  // ── The seven the palette did not carry (v1.8 audit, F19) ───────────────
  // Every one of these was already a gesture SOMEWHERE — a tab's context
  // menu, a chord, a tree row — and nowhere in the one surface that is meant
  // to be the complete list of what this app can do. A command that exists
  // only behind a right-click is a command a keyboard reader does not have.
  cmdRevealInTree: "Reveal note in sidebar",
  cmdRevealInTreeHint: "opens its folders",
  cmdFindInNote: "Find in note",
  cmdSplitPane: "Split pane",
  cmdSplitPaneDown: "Split pane below",
  cmdClosePane: "Close pane",
  cmdFocusNextPane: "Focus next pane",
  cmdPaneHint: "panes",
  cmdDuplicateNote: "Duplicate note",
  cmdDuplicateHint: "a copy beside it",
  noteDuplicated: "Duplicated to {path}",
  couldNotDuplicateNote: "Could not duplicate note",
  cmdCopyNoteLink: "Copy link to note",
  // Names what lands on the clipboard WITHOUT printing the brackets: raw
  // markdown syntax outside the editor is a hard rule (DESIGN.md), and a hint
  // row is outside the editor.
  cmdCopyNoteLinkHint: "paste into another note",
  noteLinkCopied: "Link to note copied",
  // ── Print (v1.8, parity #3) ──────────────────────────────────────────────
  // The ellipsis is the house convention for a row that opens a further
  // surface, and this one opens the browser's own print dialog — where the
  // reader chooses paper or PDF, which is why one row names both.
  cmdPrintNote: "Print / Export PDF…",
  /** Printed onto the sheet itself, not toasted, when the print dialog was
   *  opened from a surface with no document in it (the graph, the empty
   *  state): a blank page that explains itself beats a blank page. */
  printNothingOpen: "Nothing to print — open a note first.",
  // ONE row, whose label says where it goes. A row called "Toggle theme" in a
  // product with twenty-one rooms answers "which one?" with silence, and blind
  // cycling is the failure the per-theme `Theme:` rows were deleted for.
  cmdThemeFlip: "Switch to {theme}",
  couldNotCreateNote: "Could not create note",
  couldNotRenameNote: "Could not rename note",
  couldNotDeleteNote: "Could not delete note",
  /** The store's last-resort failure line (state.ts `guarded`). It used to be
   *  the server's English log prose, or an English phrase assembled out of a
   *  console label — see the note there. Deliberately says nothing about what
   *  went wrong: the honest diagnosis is the console entry beside it, and a
   *  sentence invented to fill the gap would be a guess. */
  actionFailed: "That did not go through",

  // ── Confirm / prompt / login modals ─────────────────────────────────────
  cancel: "Cancel",
  create: "Create",
  // The creation dialogs (client/prompts.ts). The destination line answers
  // "where does this land", and — because a path typed into the field nests
  // just as well as a name — teaches that in the same breath.
  promptInFolder: "In {folder}",
  promptAtRoot: "At the vault root — type ideas/Name to nest it",
  phFolderName: "Folder name",
  // What the typed text will actually become, shown BEFORE anything is
  // created: the ".md" and the folder used to be appended in silence.
  promptCreates: "Creates {path}",
  promptNoTraversal: "A path may not step outside the vault",
  promptNoDotName: "Names beginning with a dot are hidden from the vault",
  signInTo: "Sign in to {site}",
  signInHint: "Admin password unlocks editing.",
  password: "Password",
  signingIn: "Signing in…",
  signInFailed: "Sign-in failed",

  // ── Moderation panel ────────────────────────────────────────────────────
  moderationTitle: "Marginalia — moderation",
  newestSuffix: " (newest)",
  close: "Close",
  closeModeration: "Close moderation panel",
  readingMargins: "Reading the margins…",
  // The sentence names the STATE and stops. What to do about it is the button
  // under it (F33): the shell variable this line used to print is real, but it
  // is the operator's route, not the owner's, and the owner is who opens a
  // moderation panel.
  commentsOff: "Comments are switched off on this site, so there are no margins to moderate yet.",
  commentsOffAction: "Turn comments on…",
  commentsLoadFailed: "Could not load comments — try again in a moment.",
  marginsClean: "The margins are clean — no comments anywhere yet.",
  hiddenChip: "hidden",
  openNote: "Open {path}",
  hideComment: "Hide comment from visitors",
  unhideComment: "Unhide comment",
  deleteComment: "Delete comment",
  deleteCommentTitle: "Delete comment?",
  deleteCommentBody: "The comment will be removed for everyone. This cannot be undone.",
  // Every moderation outcome speaks now, not only the failures (F25).
  commentHiddenToast: "Comment hidden from visitors",
  commentUnhiddenToast: "Comment is visible again",
  commentDeletedToast: "Comment deleted",
  hideCommentFailed: "Hiding comment failed",
  unhideCommentFailed: "Unhiding comment failed",
  deleteCommentFailed: "Deleting comment failed",

  // ── Banner modal / image pickers ────────────────────────────────────────
  bannerTitle: "Banner",
  bannerUrlPlaceholder: "Paste an image URL (https://…) or a vault path",
  use: "Use",
  working: "Working…",
  dropImage: "Drop an image here, or click to choose a file",
  dropHint: "png · jpeg · webp · gif · svg — {max} MB max",
  searchAttachments: "Search vault attachments…",
  loading: "Loading…",
  noAttachments: "No image attachments in the vault yet.",
  attachmentsFailed: "Couldn't load the attachment list — check the server log.",
  removeBanner: "Remove banner",
  uploadFailed: "Upload failed",

  // ── Settings panel ──────────────────────────────────────────────────────
  settingsNote: "An empty field inherits the server's default and shows it greyed.",
  groupHome: "Home page",
  // ── Public folders: one option, its list, and two placement sub-options ──
  groupPublicFolders: "Custom public folders",
  publicFoldersNote: "Your own collections on the public site, beside the topics your notes tag themselves with.",
  rowPublicFolders: "Collections",
  hintPublicFolders: "Hand-made topics beside the tag topics. Off hides them; nothing is deleted.",
  publicFoldersOffNotice: "Custom folders are off, so none of them reaches a visitor.",
  rowPublicFoldersList: "Your collections",
  hintPublicFoldersList: "Each one becomes a page at /folder/<slug>, in this order.",
  publicFoldersFrontmatter: "A note joins a folder from its own frontmatter: folders: my-slug (or a list).",
  rowPublicFoldersHome: "Show on home page",
  hintPublicFoldersHome: "A band of category cards above your writings.",
  rowPublicFoldersNav: "Show in navigation",
  hintPublicFoldersNav: "Folder chips lead the topics row; an empty collection gets no chip.",
  publicFoldersEmpty: "No folders yet. Add one to give your readers a collection of their own.",
  publicFolderIcon: "Mark",
  publicFolderTitle: "Title",
  publicFolderTitlePlaceholder: "Games",
  publicFolderSlug: "Address",
  // The slug is LATIN by construction (the set is [a-z0-9-]), so the Arabic
  // placeholder shows the same specimen and names it as one — an example in a
  // script the field cannot accept would be a placeholder that lies.
  publicFolderSlugPlaceholder: "games",
  publicFolderDesc: "Description",
  publicFolderDescPlaceholder: "One line under the title",
  publicFolderHidden: "Hidden",
  publicFolderVisible: "Visible",
  publicFolderUp: "Move this folder up",
  publicFolderDown: "Move this folder down",
  publicFolderRemove: "Remove this folder",
  publicFolderAdd: "Add a folder",
  publicFolderFolder: "Vault folder",
  publicFolderFolderNone: "No folder: notes join by frontmatter",
  publicFolderFolderClear: "Unlink the folder",
  rowTopicsMode: "Categories come from",
  hintTopicsMode: "What the navigation offers readers, and what a post is filed under.",
  topicsModeTags: "Tags",
  topicsModeTagsNote: "a topic per tag",
  topicsModeFolders: "Folders",
  topicsModeFoldersNote: "the vault's own order",
  topicsModeFoldersNotice: "Every published note takes its parent folder as its category, with the folder's name and tree mark. Describe a folder with a folder note: a note named like the folder, or index.md inside it, carrying description:, icon:, title: or hidden: true.",
  collectionsMenu: "Collections…",
  collectionsNone: "No collections yet. Right-click a folder and publish it as one, or add one under Settings → Collections.",
  collectionsWholeFolder: "Whole folder",
  collectionsFailed: "Saving the collection failed",
  collectionPopOpen: "Open on the site",
  // "Publish folder as a topic…" read like it published the notes, and it
  // never did — it writes a topic page whose members are the notes that are
  // ALREADY published (the owner: "shouldn't publishing the whole folder as a
  // tag publish all the notes automatically?"). The verb is now the one the
  // action performs, and `folderPublishAll` below is the one that publishes.
  collectionTopicMenu: "Create a topic from this folder…",
  collectionTopicTag: "Tag",
  collectionTopicHint: "A tag page is written for it in your tags folder. This does not publish anything: the members are the notes inside the folder that are already published, plus any note carrying the tag. To publish them, use Publish every note in this folder.",
  collectionTopicMake: "Make it a topic",
  folderPublishAll: "Publish every note in this folder…",
  folderPublishTitle: "Publish {count}?",
  folderPublishBody: "Every note in “{folder}” and its subfolders becomes readable by anyone who can reach your site. Notes already published are left alone.",
  folderPublishConfirm: "Publish them",
  folderPublishNone: "Every note in this folder is already published.",
  folderPublishEmpty: "No notes in this folder.",
  folderPublishDone: "Published {count}.",
  folderPublishFailed: "{count} could not be published.",
  collectionTopicMade: "Now a topic. Its page: {path}",
  collectionTopicExists: "Already a topic: “{title}”",
  collectionsVaultRows: "Also in the navigation, from tag pages",
  collectionFromTagPage: "Declared by its tag page",
  tagPageHint: "Or declare one in the vault: a page in your tags folder with collection: true, and icon:, description:, folder: as you like. Nothing to list here.",
  folderNoteHint: "A note named like the folder, or index.md inside it, can carry description:, icon:, cover: and library: for the folder.",
  libraryFromFolderNote: "Declared by its folder note",
  libraryCustomise: "Customise here",
  libraryVaultPaths: "On the shelf from the vault",
  // ── Note annotations (client/annotations/) ─────────────────────────────
  annotateSelection: "Annotate",
  annotationTitle: "Note to self",
  annotationPublicTitle: "The author's note",
  annotationPlaceholder: "What do you want to say about this passage?",
  annotationInk: "Ink",
  annotationPublic: "Show to readers",
  annotationPublicHint: "On the blog and in the library, when the note is published.",
  annotationPrivate: "Only you",
  annotationSave: "Save",
  annotationDelete: "Delete",
  annotationDeleteTitle: "Delete this annotation?",
  annotationSaved: "Annotation saved",
  annotationFailed: "Could not save the annotation",
  annotationOrphan: "This passage is no longer in the note.",
  annotationsHeading: "Notes to self",
  annotationsPublicHeading: "The author's notes",
  annotationUnsupported: "This browser cannot paint annotations.",
  annotationClose: "Close",
  annotationTipEdit: "Click to edit or remove",
  annotationTipRead: "Click to read",
  // ── The library (shared/library.ts, client/library/) ────────────────────
  libraryTitle: "Library",
  libraryBooks: "Books",
  libraryCourses: "Courses",
  librarySeries: "Series",
  libraryKindBook: "Book",
  libraryKindCourse: "Course",
  libraryKindSeries: "Series",
  libraryLede: "{paths} paths, {lessons} lessons, read in order.",
  libraryEmpty: "Nothing on the shelf yet.",
  libraryMissing: "That path is not in the library.",
  libraryAll: "All of the library",
  libraryStart: "Start reading",
  libraryContinue: "Continue with lesson {n}",
  libraryReadAgain: "Read again",
  libraryProgress: "{done} of {total} read",
  libraryDone: "Finished",
  libraryForget: "Forget my place",
  librarySource: "Source",
  libraryContents: "Contents",
  libraryHours: "{count} h",
  libraryLessonOf: "Lesson {n} of {total}",
  libraryPrev: "Previous",
  libraryNext: "Next lesson",
  libraryKeysHint: "← and → move between lessons",
  libraryIntro: "Introduction",
  libraryUnitLecture: "Lecture {n}",
  libraryUnitChapter: "Chapter {n}",
  libraryUnitWeek: "Week {n}",
  libraryUnitPart: "Part {n}",
  // Settings → Publishing → The library
  groupLibrary: "The library",
  libraryNote: "Books, courses and lecture series as paths a reader walks in order. A path is a folder of your vault: its subfolders are the chapters or lectures, the published notes inside are the lessons.",
  rowLibrary: "Library",
  hintLibrary: "The master switch. Off, no visitor can reach a path.",
  libraryOffNotice: "The library is off: the paths below are kept but reach no one.",
  rowLibraryTitle: "Name",
  hintLibraryTitle: "What the door and the page are called. Empty means “Library”.",
  rowLibraryNav: "Show in navigation",
  hintLibraryNav: "A Library link beside the topics, on both public shells.",
  rowLibraryHome: "Shelf on the home page",
  hintLibraryHome: "A band of covers on the blog home. Off keeps the blog quiet.",
  rowLibraryPaths: "Paths",
  hintLibraryPaths: "Each row is one folder; the row's word wins, and only published notes appear.",
  libraryPathsEmpty: "No paths yet. Add a folder to put it on the shelf.",
  libraryPathKind: "Kind",
  libraryPathTitle: "Title",
  libraryPathTitlePlaceholder: "The Feynman Lectures",
  libraryPathSlug: "Address",
  libraryPathSlugPlaceholder: "feynman",
  libraryPathFolder: "Vault folder",
  libraryPathBlurb: "Blurb",
  libraryPathBlurbPlaceholder: "One or two sentences under the title",
  libraryPathCover: "Cover",
  libraryPathCoverPlaceholder: "attachments/cover.jpg or https://…",
  libraryPathSource: "Source link",
  libraryPathSourcePlaceholder: "https://ocw.mit.edu/…",
  libraryPathHidden: "Hidden",
  libraryPathVisible: "Visible",
  libraryPathUp: "Move this path up",
  libraryPathDown: "Move this path down",
  libraryPathRemove: "Remove this path",
  libraryPathAdd: "Add a path",
  // ── Shelf roots: one sentence about the vault's shape, instead of a row
  // per folder saying what the folder's own name already says.
  rowLibraryRoots: "Shelf roots",
  hintLibraryRoots: "Every folder inside it holding a published note is on the shelf.",
  libraryRootAdd: "Add a root…",
  libraryRootRemove: "Remove this root",
  libraryRootJoin: "{n} folders with published notes: {list}",
  libraryRootJoinOne: "1 folder with published notes: {list}",
  libraryRootNone: "No folder inside it has a published note yet.",
  libraryRootsEmpty: "A shelf root puts every published folder inside it on the shelf — choose Books once and stop typing rows.",
  errLibraryRootsMax: "At most {max} roots.",
  errLibraryRootNested: "A root cannot sit inside another root or inside a path.",
  errLibraryRootVault: "The vault itself cannot be a root.",
  libraryViaRoot: "On the shelf via {root}",
  libraryNeedsAddress: "Needs an address",
  libraryNeedsAddressArabic: "Its title makes no address. Customise it, or add slug: to its folder note.",
  libraryNeedsAddressTaken: "Its address is taken by “{title}”.",
  libraryOrderNote: "Order within a kind is the order readers see; folders from the vault follow the rows, by title.",
  libraryRootOffer: "{parent} holds {n} of your paths — make it a shelf root?",
  libraryRootOfferFold: "{n} rows say nothing the folder does not; folding them reorders the shelf:",
  // One row is the common case on a shelf the owner has already tidied, and
  // "1 rows" is the sort of thing a panel says when nobody read it out loud.
  libraryRootOfferFoldOne: "One row says nothing the folder does not; folding it reorders the shelf:",
  libraryRootOfferKeep: "Make it a root, keep the rows",
  libraryRootOfferFoldBtn: "Make it a root, fold {n} rows",
  libraryRootOfferFoldBtnOne: "Make it a root, fold one row",
  libraryRootOfferDismiss: "Not now",
  libraryCardOpen: "Open this path's fields",
  errLibraryMax: "At most {max} paths.",
  errLibraryTitle: "Every path needs a title.",
  errLibraryFolder: "“{title}” names no vault folder.",
  errLibrarySlug: "“{slug}” is not an address: lowercase letters, digits and hyphens.",
  errLibraryDupSlug: "Two paths share the address “{slug}”.",
  errFoldersMax: "{max} folders at most.",
  errFolderTitle: "Every folder needs a title.",
  errFolderSlug: "“{slug}” is not a valid address — lowercase letters, digits and hyphens only.",
  errFolderDupSlug: "Two folders share the address “{slug}”.",
  // Named after the switch that turns these two rows on, in the panel's own
  // off-note idiom: they are read by the blog shell and by nothing else, and
  // an app-layout instance opens the home note at "/" instead.
  homeBlogOnlyNotice: "Public layout is app, so “/” opens the home note instead.",
  homeNote: "What a visitor meets at the site root.",

  // ── Settings tabs ────────────────────────────────────────────────────────
  // One name and one sentence each: a rail of eight category nouns tells a
  // reader where things are, never what they decide.
  tabSite: "Site",
  introSite: "The site's name and marks, the theme visitors land on, and the type it is set in.",
  tabPublishing: "Publishing & comments",
  tabCollections: "Collections",
  introCollections: "How the public site groups notes — topics, your own collections, and the library shelf.",
  tabAbout: "About",
  introPublishing: "What visitors may see, and what the front door shows them.",
  introAbout: "The version, where it keeps files, and how much is in it.",

  // ── Appearance ───────────────────────────────────────────────────────────
  rowYourTheme: "Your theme",
  hintYourTheme: "Only this browser sees it, light or dark mode; visitors get the site default.",

  // ── The visitor language switch, said out loud ───────────────────────────
  visitorSwitchHead: "Visitor language switch",
  visitorSwitchNote: "A reader who flips it changes their own interface, never the notes.",
  visitorSwitchOn: "The switch is on: visitors see EN/ع in the public chrome.",

  // ── About ────────────────────────────────────────────────────────────────
  aboutVersion: "Version",
  aboutRuntime: "Runtime",
  aboutVault: "Vault",
  aboutData: "Instance data",
  // Where the panel's own answers are kept. This used to be a bare
  // "— settings.json" in the panel's TITLE, which named a file without saying
  // where it was and put an implementation detail in a heading.
  aboutSettingsFile: "Settings file",
  aboutFontsDir: "Uploaded fonts",
  aboutSettingsNote: "Delete that file and the instance falls back to its env defaults.",
  aboutContents: "Contents",
  aboutNotes: "notes",
  aboutPublished: "published",
  aboutAttachments: "images",
  aboutTags: "tags",
  aboutDocs: "Documentation",
  aboutDocsNote: "Every setting here is written up in the project's docs folder.",
  docSiteSettings: "Settings",
  docTheming: "Theming",
  docTypography: "Typography",
  docArabic: "Arabic & RTL",
  docBlogMode: "Blog mode",
  docComments: "Comments",
  docSync: "Backup & sync",
  rowSiteName: "Site name",
  rowTagline: "Tagline",
  hintTagline: "Sits under the site name in the masthead.",
  taglinePlaceholder: "Notes from the canopy…",
  rowFooter: "Footer",
  hintFooter: "Every page prints this; {year} and {siteName} are substituted.",
  rowLogo: "Logo",
  hintLogo: "Replaces the text wordmark in the masthead.",
  rowFavicon: "Favicon",
  hintFavicon: "Served at /favicon.ico and shown in the browser tab.",
  rowMode: "Mode",
  hintMode: "Show an intro note, or a list of recent posts.",
  rowHomeNote: "Home note",
  hintHomeNote: "The note shown at the site root in note mode.",
  rowHomeBanner: "Home banner",
  hintHomeBanner: "A wide image above the front page.",
  rowDefaultTheme: "Default theme",
  hintDefaultTheme: "The theme a visitor with no stored choice arrives on.",
  rowPublicLayout: "Public layout",
  hintPublicLayout: "Which shell a visitor lands in at the site root.",
  rowOpenDesigner: "Design the site",
  hintOpenDesigner: "Open the designer: presets, sections, navigation and type for the designed layout.",
  // TWO LANGUAGE ROWS, AND THE HINTS ARE WHERE THEY STOP BEING CONFUSABLE.
  // One value used to do both jobs, so an owner who wanted to edit in English
  // could only get there by republishing the whole site in English. Each hint
  // now names WHOSE language it is: the site's row speaks for the readers, the
  // editor's row for the one person looking at it.
  rowLanguage: "Site language",
  hintLanguage: "The language visitors read the site and its chrome in.",
  rowEditorLanguage: "Editor language",
  hintEditorLanguage: "Sets your own interface here only, never what visitors read.",
  editorLangFollow: "Follow site",
  // The notes sidebar's edge. The segment labels name a PHYSICAL edge in both
  // languages, exactly as the palette commands do — an Arabic reader pinning
  // the pane left means the left of the screen, not "the trailing side".
  rowSidebarSide: "Notes sidebar",
  hintSidebarSide: "Auto puts the tree on the reading direction's leading edge.",
  sideAuto: "Auto",
  sideLeft: "Left",
  sideRight: "Right",
  rowLanguageFilter: "Language filter",
  hintLanguageFilter: "Chooses which notes the public site shows, by their language.",
  // The four modes. Their labels are the whole difference between a switch
  // whose consequence is guessable and the boolean that cost a real site
  // eighteen of its twenty posts — so each one names WHO decides, not just
  // what is on.
  langFilterOff: "Everything",
  langFilterOffNote: "no filtering",
  langFilterFollow: "Reader's language",
  langFilterFollowNote: "each reader, their own",
  langFilterAr: "Arabic only",
  langFilterEn: "English only",
  // Consequence lines. Every one of them prints REAL counts from this vault,
  // before the save.
  langFilterOffWhy: "Every published note is public. Nothing is hidden from anyone.",
  langFilterFollowWhy: "Each reader sees only notes written in the language they are reading in — the EN/ع switch below moves the writing too, not just the buttons. Readers who never touch it get the site language.",
  langFilterFollowSplit: "Right now: {ar} of your {total} published notes reach an Arabic reader, {en} reach an English one.",
  langFilterPinnedWhy: "Pinned to {lang}: {visible} of your {total} published notes qualify; {hidden} would be hidden from every visitor.",
  langFilterPinnedIgnoresReader: "A reader's own EN/ع choice does not change this — that is what pinning means.",
  // The hard warnings. Same numbers, louder frame.
  langFilterEmptyWarn: "Nothing qualifies. No published note is written in {lang}, so the site would have nothing on it — Astrolabe will keep showing all {total} instead, and go on saying so here until you change this.",
  langFilterMostHiddenWarn: "This hides {hidden} of your {total} published notes — most of your site.",
  langFilterTopicsCut: "Topics on the public site: {visible} of {total}.",
  // "Reader's language" with no way for a reader to state one is a setting
  // that silently means something else — the exact species of bug this whole
  // round is about, one control lower down the same tab.
  langFilterFollowNeedsToggle: "The visitor switch below is off, so no reader can state a language: every one of them gets {lang}, and this behaves exactly like pinning to it. Turn the switch on to make this mode mean what it says.",
  langAr: "Arabic",
  langEn: "English",
  rowLanguageToggle: "Visitor switch",
  hintLanguageToggle: "Adds a public English/Arabic switch each reader can flip.",
  rowDateLocale: "Date locale",
  hintDateLocale: "A language tag such as en-GB; it formats post dates and RSS.",
  rowExcludeTags: "Excluded tags",
  hintExcludeTags: "Notes carrying these tags are hidden from visitors; comma-separated.",
  // Same treatment as the language filter, for the same reason: this removes
  // topic pills — and with them whole topic pages — and used to do it in
  // silence.
  excludeTagsEffect: "Hides {hidden} of {total} topics from the public site: {tags}",
  excludeTagsNoop: "No published note carries any of these — nothing is being hidden.",
  excludeTagsNone: "All {total} topics on your published notes are public.",
  rowComments: "Comments",
  hintComments: "Notes a reader can leave under a published note.",
  // The home note is the front door of a blog-mode site, and it can point at
  // a note visitors cannot see — which renders a blank homepage and says
  // nothing. Now it says something.
  homeNoteHidden: "Visitors cannot see this note, so your homepage would be blank for them. Publish it, or pick another.",
  homeNoteOk: "Visitors can see this note.",
  homeNoteUnset: "No home note set — visitors land on the writings list.",
  homeModeAppNote: "Visitors land in the app shell, so this front door is never rendered — the Public layout row above decides that.",
  // PUBLIC=false is env-only: the panel cannot change it, but it can and must
  // say that every count on this tab is moot while it is set.
  publicReadsOffWarn: "PUBLIC=false: this whole site is behind the login, so no visitor sees any of it. Every count on this page describes what would be public if you opened it.",
  // The tab-level standing summary — "as it stands", not "as it would be".
  visibilityHead: "What visitors see",
  visibilityNow: "{visible} of your {total} published notes are discoverable right now.",
  visibilityAll: "All {total} of your published notes are discoverable.",
  visibilityNothingPublished: "Nothing is published yet, so visitors see an empty site whatever these settings say.",
  // The status bar's standing indicator + its tooltip.
  reachPill: "{visible}/{total} public",
  reachPillSplit: "AR {ar} · EN {en} of {total}",
  reachTitle: "{hidden} published notes are hidden from visitors by your settings — click to open Settings.",
  reachFallbackTitle: "Your language filter matches no published note, so the site is showing everything — click to open Settings.",
  reachClosedTitle: "PUBLIC=false — the whole site is behind the login.",
  // The visitor-facing quiet note (public shell), when the filter stood down.
  langFallbackNote: "Showing every language — nothing is published in the language you are reading in.",
  rowShareButtons: "Share buttons",
  hintShareButtons: "A row of share links under every blog article.",
  rowAmbient: "Ambient masthead",
  // The hint has to say all three things an owner needs before switching this
  // on: it is theme-dependent (not every room has one), it is behind the
  // words, and a reader who has asked their system for less motion gets none
  // of it. Naming the three airs would date the moment a fourth ships.
  hintAmbient: "A slow, faint atmosphere behind the site name; off under reduced motion.",
  phVaultImageOrUrl: "vault image path or https:// URL",
  phVaultIcon: "vault image path (ico, png, svg…)",
  phExcludeTags: "draft, todo…",
  // "inherit (en)" was honest about precedence and silent about its source:
  // the owner could read WHICH value was in force and never learn WHERE it
  // came from, or where to change it outside the panel.
  on: "on",
  off: "off",
  // Enum CHOICES a reader picks between, so they are copy — the same way the
  // booleans on the adjacent rows are. (Theme names stay untranslated one row
  // up: "iron-gall"/"lapis"/"parchment" are proper nouns, not common ones.)
  modeNote: "note",
  modeDashboard: "dashboard",
  layoutApp: "app",
  layoutBlog: "blog",
  save: "Save",
  saving: "Saving…",
  unsavedChanges: "Unsaved changes",
  fixMarkedFields: "Fix the marked fields",
  settingsSaved: "Settings saved",
  settingsSaveFailed: "Could not save settings",
  settingsLoadFailed: "Could not load settings",
  pick: "Pick…",
  clear: "Clear",
  faviconImage: "Favicon image",
  logoImage: "Logo image",
  errMaxChars: "{count} max",
  errLocale: "not a valid BCP47 locale (en, ar-EG, de…)",
  errNotSimpleTag: "“{tag}” is not a simple tag",
  // A note is `.md`, `.tex` or `.latex` now — the field validates all three,
  // so the message may not keep naming only one of them.
  errMdPath: "must be a vault note path (.md, .tex, .latex)",
  errMixedContent: "http:// would be mixed content — use https:// or a vault path",
  errVaultImage: "must be a vault image path (ico, png, svg…)",
  errHttpsOrVault: "must be an https:// URL or a vault image path",
  errDotDot: "path may not contain ..",
  errImageExt: "must be an image (ico, png, svg, jpeg, gif, webp, avif, bmp)",

  // ── Preview banner ──────────────────────────────────────────────────────
  previewingPublicSite: "Previewing public site",
  exitPreview: "Exit preview",

  // ── App shell / empty states / toasts ───────────────────────────────────
  vaultPrivate: "This vault is private.",
  vaultOpen: "The vault is open.",
  keyPalette: "command palette",
  cmdOpenPalette: "Command palette",
  bookZoomIn: "Zoom in",
  bookZoomOut: "Zoom out",
  bookCiteAction: "Cite the selection",
  keyGraph: "graph view",
  keySearch: "search notes",
  keyNewNote: "new note",
  keySave: "save now",
  keyReading: "reading view",
  // Lowercase like its six neighbours: the empty state sets these as a caption
  // row, and t("shortcutsTitle") arrived title-cased in the middle of them.
  keyShortcuts: "keyboard shortcuts",
  // The phone's half of the empty state. A keymap is not an answer on a device
  // with no keyboard, so below ~700px (and on any coarse pointer) the same
  // pane offers the notes this reader was last in, plus the three doors the
  // legend was only naming.
  emptyRecent: "Recent notes",
  // The palette's own captions. paletteRecent duplicates emptyRecent's words
  // on purpose: two surfaces, one phrase TODAY — a shared key would weld them
  // so that rewording one silently rewords the other.
  paletteRecent: "Recent notes",
  // "@…" rows are headings AND LaTeX \labels; an "Outline" caption undersells
  // the second half.
  paletteHeadings: "Headings & labels",
  // The wikilink popup's create row — one sentence, not two strings glued.
  linkCreateNote: "Create “{name}”",
  // The search hit's per-line matches disclosure.
  searchHitMatches: "Matches in {label}",
  searchHitMatchesHide: "Hide matches in {label}",
  // ── The composer rows (SelectionMenu) ────────────────────────────────────
  extractSelection: "Extract selection to a new note",
  selectionExtracted: "Moved “{title}” into {path}",
  selectionExtractUndone: "Extraction undone",
  selectionExtractFailed: "Could not extract the selection",
  insFootnote: "Footnote",
  // The refusal has a voice: planFootnote declines in code spans and on a
  // duplicate definition, and a silent decline reads as a broken key.
  footnoteCollision: "Could not insert a footnote here",
  caseTitle: "Title Case",
  caseUpper: "UPPERCASE",
  caseLower: "lowercase",
  calloutPage: "Callout",
  scExtractSelection: "Extract the selection into a new linked note",
  scInsertFootnote: "Insert a footnote (numbered in order)",
  scCaseTransform: "Change the selection's case (Title / UPPER / lower)",
  scWrapCallout: "Wrap the selection in a callout",
  // ── The table keymap's shortcut-sheet rows ───────────────────────────────
  scTableCells: "Next table cell (in the last cell: adds a row)",
  scTableCellsBack: "Previous table cell",
  scTableRowDown: "Down a row (out of the table from the last row)",
  scTableMoveRow: "Move table row",
  scTableMoveColumn: "Move table column (with its alignment)",
  exitZen: "Exit zen mode (Esc)",
  // The one keystroke zen advertises on screen — the ✕ beside it is the mouse
  // route, this is the one that works when the chrome has faded.
  zenEscHint: "Esc",
  noteGone: "That note does not exist (anymore)",
  changedOnDisk: "{path} changed on disk — your unsaved edits were kept",
  publishedToast: "Published — live for visitors",
  /** The first note an instance ever publishes is the moment it stops being a
   *  private vault, and the line says that rather than counting to one. */
  publishedFirstToast: "Your first note is live — the site is public now.",
  /** The arrow leans with the reading direction: a ← in an Arabic sentence
   *  points forward, the way → does in English. */
  publishedViewAction: "View →",
  unpublishedToast: "Unpublished",
  bannerSetToast: "Banner set",
  bannerRemovedToast: "Banner removed",
  noDailyNote: "No daily note for today — sign in to create it",
  dailyNoteFailed: "Could not create today's daily note",
  // The same two, for a day that is not today and for the week, the month
  // and the year (client/daily.ts openPeriodicNoteAt).
  noPeriodicNote: "No note for that period yet — sign in to create it",
  periodicNoteFailed: "Could not create the note for that period",
  saveFailed: "Failed to save {path}",
  // The two write failures that are the DISK's news, not Astrolabe's. Both used
  // to reach the reader as the generic sentence above, which sends them
  // looking for a bug in the app. The server names them (vault.ts::
  // writeFailure) and Editor.tsx picks the key.
  saveDiskFull: "Could not save {path} — the disk is full",
  saveReadOnly: "Could not save {path} — the vault is read-only",
  // The save was refused as stale AND the file could not be re-read, so there
  // is no disk version to offer and no conflict to resolve — only the two
  // facts that matter while it lasts. Before v1.8 this state said NOTHING and
  // never ended (client/editor/saveRetry.ts).
  saveStuck: "Could not re-check {path} — your text is safe, still trying",
  openFailed: "Failed to open {path}",
  // Not an error. Inside visitor preview the server 404s an unpublished note
  // because that is the CORRECT answer for a visitor, and the generic failure
  // string turned the owner's first use of the feature into a red alarm about
  // his own site. The calm wording says what happened and what to do.
  previewNotPublished: "Not published — visitors cannot see this note",
  previewNotPublishedNamed: "“{path}” is not published — visitors cannot see it, so it left the tab bar",
  previewPrivateVault: "This vault is private: a visitor would meet the sign-in page and nothing else, so there is nothing to preview here. Preview on the instance that publishes it.",
  previewAsArabicReader: "Previewing as an Arabic reader: the language filter shows this note to them, not to English readers",
  previewAsEnglishReader: "Previewing as an English reader: the language filter shows this note to them, not to Arabic readers",
  previewHiddenNamed: "“{path}” is published, but the language filter or an excluded tag hides it from visitors reading in this language, so it left the tab bar",

  // ── Wikilink clicks (editor + reading view) ─────────────────────────────
  linkNotPublished: "“{name}” isn’t published here",
  linkMissing: "“{name}” does not exist",
  creatingNote: "Creating “{name}”…",
  backToReference: "Back to reference",

  // ── Graph view ──────────────────────────────────────────────────────────
  graphLoadFailed: "Could not load graph",
  graphEmptyAdmin: "No notes yet — create one and link it with wikilinks.",
  graphEmptyVisitor: "Nothing is published yet — the deck awaits.",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  resetView: "Reset view",
  // The graph's keyboard route: one note and its neighbours, walked with the
  // arrows. A canvas has no tab stops of its own, so the nodes get a list.
  graphNavHint: "Up and down move, forward walks into a note, Enter opens it.",
  graphWalkedTo: "Now at “{name}”, {count} links",

  // ── Reading view ────────────────────────────────────────────────────────
  emptyNoteAdmin: "This note is empty — press Ctrl+E to edit it.",
  emptyNoteVisitor: "This page is intentionally blank.",

  // ── Editor chrome (properties card) ─────────────────────────────────────
  startWriting: "Start writing…",
  properties: "Properties",
  toggleProperties: "Toggle properties",
  bannerAction: "Banner…",
  setBannerAction: "Set banner…",
  setBannerTitle: "Set a banner image for this note",

  // The card, editable in place (v1.8 — Obsidian parity #1). Every string
  // here labels a control inside the properties card; the values themselves
  // are the note's own bytes and are never translated.
  propAdd: "Add property",
  propKey: "Name",
  propValueList: "Values, comma-separated",
  propHintTitle: "The note's title, over its file name",
  propHintTags: "Tags, beside any #inline ones",
  propHintAliases: "Other names [[links]] may use",
  propHintBanner: "A hero image: a vault path or an https link",
  propHintDate: "The date the blog shows for this note",
  propHintPublish: "true puts the note on the public site",
  propHintDescription: "A line under the title on the blog",
  propHintDir: "rtl or ltr: the note's own direction",
  propHintAlign: "left, right, center or justify for this note",
  propHintNumbered: "true numbers the headings",
  propHintIcon: "A folder note's glyph or picture",
  propHintLanguage: "ar or en, for the language filter",
  propHintCssclasses: "Classes for the note's own styling",
  propValue: "Value",
  propEmpty: "Empty",
  propAddValue: "Add value",
  propRemove: "Remove {key}",
  propRemoveValue: "Remove {value}",
  propRemovedToast: "Removed {key}.",

  // ── Editor chrome built as raw DOM (folds, embeds, transclusions) ───────
  // These live in client/editor/*.ts and client/reading/render.ts — plain DOM
  // builders, not JSX — which is exactly why they were missed twice. The
  // check-i18n "bare English" scan now covers .ts DOM writes too.
  foldSection: "Fold section",
  unfoldSection: "Unfold section",
  missingImage: "Missing image",
  uploadingImage: "Uploading {name}…",
  embedNotCreated: "Not created yet — click the link to create it.",
  noteLoadFailed: "Could not load note.",
  noteEmpty: "This note is empty.",
  noteEmbedsItself: "This note embeds itself.",
  noNoteNamed: "No note named “{name}”",
  openNoteArrow: "Open note ↗",
  docTitleGraph: "Graph",

  // ── The tab context menu ─────────────────────────────────────────────────
  // Right-click a tab, or Shift+F10 / the Menu key on the focused one. Every
  // row that closes more than one tab NAMES what it is about to take, and no
  // row takes a pinned tab — one promise, spelled the same way in all of them,
  // so a reader never has to remember which rows respect a pin.
  tabActions: "Tab actions",
  tmClose: "Close",
  tmCloseOthers: "Close others",
  tmCloseAfter: "Close tabs after this one",
  tmCloseAll: "Close every note in this window",
  // "{count}" arrives already spelled by countPhrase(n, "unsaved"), so Arabic
  // agreement is right for one, two, a few and many — a bare digit dropped
  // into the sentence would be wrong in three of those four.
  tmCloseOthersN: "Close others ({count})",
  tmCloseAfterN: "Close tabs after this one ({count})",
  tmCloseAllN: "Close every note in this window ({count})",
  tmPin: "Pin",
  tmUnpin: "Unpin",
  tmCopyPath: "Copy path",
  tmPathCopied: "Path copied",
  // The pin glyph is decoration; these are the words a screen reader gets.
  tabPinned: "pinned",
  tabPreview: "preview",

  // ── The editor's own panels, which live inside our dependencies ─────────
  // CodeMirror renders the find panel, the go-to-line panel, the completion
  // list and the fold placeholders itself, in English, from string literals in
  // node_modules — so `check-i18n` cannot see them and never could: its scan
  // root is `client/`. They rendered as English chrome inside a fully mirrored
  // Arabic shell, which is the one place in the product where the translation
  // simply stopped. `EditorState.phrases` is CodeMirror's own hook for this;
  // `client/editor/searchPhrases.ts` builds the table from these keys, which is
  // what brings the strings back under the gate.
  cmFind: "Find",
  cmReplace: "Replace",
  cmNext: "next",
  cmPrevious: "previous",
  cmAll: "all",
  cmMatchCase: "match case",
  cmRegexp: "regexp",
  cmByWord: "by word",
  cmReplaceAll: "replace all",
  cmClose: "close",
  cmCurrentMatch: "current match",
  cmGoToLine: "Go to line",
  cmGo: "go",
  cmOnLine: "on line",
  // `$` is CodeMirror's own placeholder, not tf()'s `{name}` — these strings
  // are handed to the library, which substitutes into them itself. Both sides
  // must keep it; check-i18n's placeholder parity only watches `{…}`.
  cmReplacedMatches: "replaced $ matches",
  cmReplacedOnLine: "replaced match on line $",
  cmCompletions: "Completions",
  cmControlChar: "Control character",
  cmFoldedCode: "folded code",
  cmFoldTo: "to",
  cmUnfold: "unfold",

  // ── Editor slash menu ("/" at line start) ───────────────────────────────
  // Row titles only. The match key stays ASCII (see slashMenu.ts) and the
  // syntax previews ("- [ ]", "---") are markdown, not copy.
  slashCallout: "Callout",
  slashCodeBlock: "Code block",
  slashCodeBlockDetail: "``` with language search",
  slashTable: "Table",
  slashTableDetail: "2×2 skeleton",
  slashTaskList: "Task list",
  slashMathBlock: "Math block",
  slashMathDetail: "$$ display math $$",
  slashTracker: "Tracker",
  slashTrackerBoard: "Tracker board",
  slashTrackerBoardDetail: "Every tracker in the vault",
  // ── Aliases (a note's other names) ──────────────────────────────────────
  // Frontmatter `aliases:` makes one note answer to several names. Every
  // string here exists to say WHICH name was involved: Obsidian resolves an
  // alias silently, so a search result whose words appear nowhere in the note,
  // or a completion row for a name the reader has never seen on a file, reads
  // as a bug rather than as a feature working.
  aliasCompletionDetail: "alias of {title}",
  searchMatchedAlias: "matched alias “{alias}”",
  // After a rename, the old title stops naming anything — every [[link]] and
  // every published URL that used it dangles. The offer is the whole point:
  // one button, and the note keeps answering to the name it had.
  renameKeepAliasToast: "Renamed — “{title}” no longer names this note.",
  renameKeepAliasAction: "Keep as alias",
  renameAliasKeptToast: "“{title}” still finds this note.",
  renameAliasFailed: "Could not keep “{title}” as an alias.",

  // ── Bulk rewrites: heading-link repair and tag rename/merge ──────────────
  //
  // Every sentence here names a NUMBER and a NAME, because the reader is being
  // asked to approve — or take back — an edit spread across files they are not
  // looking at. "Done" on its own is what makes a bulk tool frightening.

  // Rename a heading and the [[Note#Heading]] links into it stop resolving:
  // the link still opens the note and silently lands at the top. Nothing said
  // so until v1.8; the offer is raised by the save that caused it.
  // The count goes through countPhrase() and the sentence is built so NOTHING
  // agrees with it: "1 link into …" and "4 links into …" are the same shape,
  // and the Arabic verb belongs to the update rather than to the number. The
  // reason is the one folderRefsWarn gives above — a string cannot see how
  // many its substitution turned out to be, and the first draft of that one
  // shipped "“The Moved Essay” still embed this file".
  headingRepairOffer: "{count} into “{heading}”. Update to “{to}”?",
  headingRepairAction: "Update links",
  headingRepairedToast: "Updated {count} to “{heading}”.",
  headingRepairFailed: "Could not update the links.",

  // The pill's one verb, and the dialogs around it.
  tagActions: "Tag actions",
  renameTag: "Rename tag…",
  tagRenameTitle: "Rename tag",
  // THE HASH IS PART OF THE NAME, so it rides INSIDE the substitution rather
  // than as a literal `#` in the sentence. `tf()` bidi-isolates each value;
  // leaving the hash outside that isolate puts a neutral character next to an
  // Arabic run, and the RTL shell drew «مسودة#» with the hash flush against
  // the wrong end — the same defect the sidebar pill fixed with one <bdi>
  // around both. Callers pass "#" + tag.
  tagRenameBody: "Every note carrying {tag} — and anything nested under it — is rewritten.",
  tagRenameBadName: "A tag is letters, digits, _ - and / between parts.",
  tagRenameSameName: "That is the name it already has.",
  tagRenameNested: "A tag cannot be renamed into its own subtree.",
  tagRenameCreates: "Becomes {tag}",
  // A merge is the one outcome renaming back does not reverse.
  tagRenameMerges: "{tag} already exists — the two merge into one.",
  tagRenameConfirmBody: "{count} will change: {from} becomes {to}.",
  tagRenamePage: "Its page moves to {path}.",
  tagRenameNothing: "Nothing to rewrite for {tag}.",
  tagRenameFailed: "Could not rename the tag.",
  tagMergeTitle: "Merge tags",
  tagMergeAction: "Merge",
  tagMergeWarn: "The two become one {to}; renaming back will not separate them again.",
  tagRenamedToast: "{from} is now {to} in {count}.",
  tagMergedToast: "{from} merged into {to} across {count}.",

  // The other half of a bulk edit's answer: what it did NOT touch. A file
  // somebody else edited between our read and our write is left alone, and a
  // reader who is not told finds the one stale tag six weeks later.
  bulkSkipped: "Left untouched: {count} — changed underneath while this ran.",
  bulkFailed: "{count} could not be rewritten.",
  bulkNoUndo: "Too large to undo here — restore from Backup & sync.",
  bulkUndoneToast: "Put back in {count}.",
  bulkUndoFailed: "Could not take that back.",

  // ── Search: the operator help, and the vault-wide replace ───────────────
  //
  // Two of v1.8's three search answers are CONVERSATIONS the reader has to be
  // able to read before pressing anything: a grammar nobody can guess, and a
  // rewrite of four hundred notes. The third — the diacritic fold — needs no
  // chrome at all, which is how you know it was the right shape.
  searchHelpOpen: "How to search",
  searchHelpTitle: "Search operators",
  searchHelpFold: "Diacritics and letter shapes fold: المقدمة finds الْمُقَدِّمَة, and resume finds résumé.",
  searchOpTag: "the topic and everything nested under it",
  searchOpPath: "notes whose path holds the text",
  searchOpIs: "the frontmatter flags",
  searchOpDate: "by the note's own date",
  searchOpLink: "by the link graph, in either direction",
  searchOpNot: "everything but",
  searchOpQuote: "a value with a space in it",
  searchOpAnd: "Everything narrows together — two operators both have to hold.",

  replaceOpen: "Replace across the vault",
  replaceClose: "Back to search",
  replaceTitle: "Search & replace",
  replaceFind: "Find",
  replaceWith: "Replace with",
  replaceRegex: "Regular expression",
  replaceSnapshot: "Snapshot the vault first",
  // The rail the whole feature stands on, said in one sentence before the
  // reader types anything: what it matches, and what it will never touch.
  replaceRule: "Matching is exact — case and diacritics count. Frontmatter is never touched.",
  replaceScope: "The search box above sets the scope: its operators narrow which notes are considered.",
  replaceNothing: "Nothing matches that.",
  replaceSummary: "{edits} in {notes}",
  replaceRun: "Replace in {count}",
  replaceRunning: "Replacing…",
  replaceSelectAll: "Select all",
  replaceSelectNone: "Select none",
  replaceTooMany: "More notes match than can be listed — narrow the search first.",
  replaceMoreLines: "{count} more — this note is all or nothing.",
  replaceLineFrom: "before",
  replaceLineTo: "after",
  replaceConfirmTitle: "Replace across the vault",
  replaceConfirmBody: "{edits} in {notes} will be rewritten.",
  replaceConfirmSnapshot: "A snapshot is taken first, so this is recoverable from Backup & sync even after the undo expires.",
  // NOT "Replaced {edits}": `{edits}` is already spelled "4 replacements" by
  // countPhrase, and "Replaced 4 replacements" is the noun said twice.
  replaceDoneToast: "{edits} across {notes}.",
  replaceStale: "{count} changed while you were looking — left untouched.",
  replaceSnapshotTaken: "Snapshot {sha} taken first.",
  replaceFailed: "Could not run that replace.",
  replaceBadPattern: "That pattern will not run.",

  slashDivider: "Divider",
  slashDate: "Date",
  alignLeft: "Align left",
  alignCenter: "Center",
  alignRight: "Align right",
  alignJustify: "Justify",
  imageResize: "Drag to resize; double-click for the picture's own size",
  slashCenter: "Center this line",
  slashRight: "Align this line right",
  slashLeft: "Align this line left",
  slashDailyLink: "Daily note link",

  // ── Blog shell: masthead, nav, footer ───────────────────────────────────
  blogTopics: "Topics",
  blogMore: "More",
  blogPrivate: "This journal is private.",
  blogNoPage: "There is no page here.",
  blogBackToWritings: "Back to the writings",
  blogSearchHint: "search",
  blogPoweredBy: "powered by",
  blogSwitchTheme: "Switch theme",
  // The switch always targets the OTHER language, and this label renders in
  // the CURRENT one — so the two entries are each other's counterpart, not a
  // translation pair: English chrome offers Arabic, Arabic chrome offers
  // English. One key, correct in both directions.
  blogSwitchLanguage: "Read this site in Arabic",
  blogBackToTop: "Back to top",

  // ── Blog lists: home, topics, dashboard ─────────────────────────────────
  blogWritings: "Writings",
  blogAuthorSites: "More from the author",
  rowAuthorSites: "Your other sites",
  hintAuthorSites: "Cards under your writings; one link per line, then an optional | Title.",
  phAuthorSites: "https://photos.example.com | My photography",
  errAuthorSite: "Not a valid site line: {url}",
  errAuthorSitesMax: "Six sites at most.",
  authorSitesEffect: "{count} card(s) will appear on the blog home.",
  // ── Public folders (the owner's own collections) ────────────────────────
  // "Collections", not "Folders": the word FOLDER already means a directory in
  // this product's vault, and a reader who meets it on the public site would
  // reasonably expect to be looking at the author's file tree. The URL keeps
  // /folder/ because it is an address the site has to be able to keep forever.
  blogFolders: "Collections",
  blogFolderEmpty: "Nothing in this collection yet.",
  /** The door out of an empty collection (F29). "All the writings", not "Home":
   *  the reader is standing in a list and the useful offer is the bigger list,
   *  which is also what the link goes to. */
  blogBrowseAll: "Browse all the writings",
  blogLatest: "Latest",
  blogLatestWritings: "Latest writings",
  blogMostDiscussed: "Most discussed",
  blogNothingPublished: "Nothing published here yet.",
  /** The owner's own empty dashboard (F41). The visitor never reaches this
   *  page on a vault with nothing published, so the sentence is written for
   *  the one person who can do something about it — and it names the control
   *  rather than the concept. */
  blogPublishHow: "Turn on a note’s publish star (✦ in the status bar, or “Publish” in its sidebar menu) and it appears here.",
  blogFilteredByLanguage: "This site lists only notes written in its own language.",
  blogNoTopicWritings: "No writings under this topic.",
  blogChangeBanner: "Change banner…",

  // ── Blog article ────────────────────────────────────────────────────────
  blogShare: "Share",
  blogCopyLink: "Copy link",
  blogLinkCopied: "Link copied",
  blogCopyFailed: "Could not copy the link",
  blogOlder: "Older",
  blogNewer: "Newer",
  blogMoreWritings: "More writings",
  blogRelated: "Related",
  blogRelatedWritings: "Related writings",

  // ── Blog search (nav field + Ctrl/Cmd+K overlay) ────────────────────────
  blogSearchPlaceholder: "Search writings…",
  blogSearchOpen: "Search",
  blogSearchClose: "Close search",

  // ── Marginalia (reader comments) ────────────────────────────────────────
  marginalia: "Marginalia",
  marginaliaAria: "Comments",
  marginaliaEmpty: "no notes yet",
  marginaliaName: "Your name (optional)",
  marginaliaBody: "Write in the margin…",
  marginaliaPost: "Leave a note",
  marginaliaFailed: "Posting failed",
  marginaliaAnonymous: "Anonymous",

  // ── Home banner modal (dashboard hero) ──────────────────────────────────
  homeBannerTitle: "Home banner",
  homeBannerSubtitle: "dashboard hero",
  homeBannerSet: "Home banner set",
  homeBannerRemoved: "Home banner removed",
  homeBannerFailed: "Saving the banner failed",

  // ── Typography (settings panel) ─────────────────────────────────────────
  // The type SPECIMENS are not here: a Latin sample must stay Latin in an
  // Arabic UI (and the Arabic one Arabic in an English UI) or the preview
  // stops previewing what it claims to. They live in SettingsModal.tsx.
  groupTypography: "Typography",
  // Sub-heads inside the merged Appearance & language tab.
  typographyNote: "Faces are fetched once when you save, then served from this machine.",
  rowFontProse: "Reading text",
  hintFontProse: "The font for reading text and the editor's prose.",
  rowFontUi: "Interface",
  hintFontUi: "The typeface for the sidebar, the tabs and every panel.",
  rowFontMono: "Code",
  hintFontMono: "The font for code blocks and raw markdown.",
  // The Arabic slot is a different KIND of control from the three above it —
  // one face that answers for Arabic letters inside all of them — so it gets
  // its own sub-heading rather than a fourth row at the same visual rank.
  fontArabicHead: "Arabic script",
  fontArabicHeadNote: "Arabic letters in all three slots above, per character, size-matched to the Latin face.",
  rowFontArabic: "Arabic face",
  hintFontArabic: "One font for the Arabic letters inside all three slots.",
  fontSystem: "system (no webfont)",
  fontGroupSerif: "Serif",
  fontGroupSans: "Sans-serif",
  fontGroupMono: "Monospace",
  fontGroupArabicNaskh: "Naskh & classical",
  fontGroupArabicModern: "Modern & kufi",
  fontPreview: "Preview",
  fontPreviewNote: "Live — updates before you save.",
  // "…fonts", not "…to defaults": the button sits at the end of a section in a
  // five-section panel, one row above the next heading, and an unqualified
  // "Reset to defaults" there reads as if it resets the whole panel.
  fontReset: "Reset fonts",
  fontsFetchFailed: "Could not fetch the fonts — settings were not changed",
  fontFetching: "Fetching fonts…",
  // The picker: a filter over twenty-seven catalog families plus whatever the
  // operator has uploaded.
  fontFilter: "Filter fonts…",
  fontGroupCustom: "Your fonts",

  // ── Uploaded faces (ASTROLABE_DATA/fonts/custom) ───────────────────────────
  // The catalog answers "one of ours"; this answers "the one I own", which is
  // the only possible answer for a licensed Arabic face.
  fontCustomHead: "Your own fonts",
  fontCustomNote: "Upload a face you own and every slot above will offer it.",
  dropFont: "Drop a font file, or click to choose",
  dropFontHint: "woff2, woff, ttf or otf — up to {max} MB",
  noCustomFonts: "No fonts uploaded yet.",
  fontSizeKb: "{count} KB",
  // A face a slot still names has no delete button at all; the row says which
  // slot is holding it, so the way out is obvious.
  fontInUse: "in use — {slots}",
  fontAdded: "Added {name}",
  fontUploadFailed: "The font could not be uploaded",
  // ── What the SERVER refused, said here ──────────────────────────────────
  // The upload routes answer `{ error, code }`; `error` is English prose for a
  // log and `code` is what these translate. Before them, the commonest failure
  // of the whole feature — picking the wrong file — printed the server's
  // English sentence into a fully Arabic panel, and `fontUploadFailed` was
  // dead code. It is still the fallback for a code nothing here names.
  errFontUnrecognized: "That is not a font file. Choose a woff2, woff, ttf or otf.",
  errFontDamaged: "That font file is damaged and no browser could render it.",
  errFontTooLarge: "That font file is larger than {max} MB.",
  errFontNoFile: "No file was received.",
  errFontNotFound: "That font is no longer on this instance.",
  errFontBadName: "That font file name is not one this instance created.",
  errFontNoFreeName: "Too many fonts share that name. Rename the file and try again.",
  errFontInUse: "That face is still in use. Choose another one in the slots above first.",
  fontDeleteTitle: "Remove “{name}”?",
  fontDeleteBody: "The file is deleted from this instance. Your notes are untouched, and you can upload it again.",
  fontRemoved: "Font removed",
  fontRemoveFailed: "The font could not be removed",

  // The optical dial: the only number in the panel a reader arrives at by eye,
  // set against the specimen block two rows above it.
  rowSizeAdjust: "Arabic size match",
  hintSizeAdjust: "Scales the Arabic face against the Latin one beside it.",
  sizeAdjustAuto: "auto",
  errSizeAdjust: "Must be between {min} and {max} percent",

  // ── Backup & sync (git) ─────────────────────────────────────────────────
  groupSync: "Backup & sync",
  syncNote: "Commits the vault and pushes it to a private git remote.",
  rowSyncEnabled: "Backup",
  hintSyncEnabled: "Turns the rows below on and starts backing the vault up.",
  // Shown in place of the live section while the master switch is off: six
  // fields and two buttons at full contrast, all of them inert, read as a
  // configured-and-running backup at a glance.
  syncOffNotice: "Backup is off. Turn it on to configure and run it.",
  rowSyncRemote: "Remote URL",
  hintSyncRemote: "https:// or git@host:path",
  phSyncRemote: "https://host/you/vault.git",
  rowSyncBranch: "Branch",
  hintSyncBranch: "The branch this vault is committed and pushed to.",
  rowSyncAuth: "Authentication",
  hintSyncAuth: "How this server signs in to the remote.",
  authSsh: "SSH keys (this machine)",
  authToken: "Access token",
  rowSyncUser: "Username",
  hintSyncUser: "The username the access token belongs to.",
  phSyncUser: "your git username",
  rowSyncToken: "Access token",
  hintSyncToken: "Write-only; it is stored outside the vault.",
  phTokenStored: "replace the stored token",
  phTokenNew: "paste a token",
  tokenSetYes: "A token is stored.",
  tokenSetNo: "No token stored.",
  clearToken: "Clear token",
  tokenCleared: "Token cleared",
  rowSyncPull: "Pull first",
  hintSyncPull: "Fast-forwards from the remote before pushing; it never merges.",
  // "Every" + a bare "0" + "minutes; 0 = manual only" made the reader decode a
  // magic number to learn the setting was off. The choice is a small closed
  // set, so it is a select whose options are sentences.
  rowSyncInterval: "Automatic sync",
  hintSyncInterval: "How often the vault is backed up unattended.",
  syncIntervalManual: "Manual only",
  syncIntervalMinutes: "Every {count} minutes",
  syncIntervalHourly: "Every hour",
  syncIntervalHours: "Every {count} hours",
  syncIntervalDaily: "Once a day",
  rowSyncStatus: "Status",
  hintSyncStatus: "What this vault's repository looks like right now.",
  syncNow: "Sync now",
  // Precise, like every other label in this column — and it LEAVES once the
  // vault is a repository rather than sitting there greyed forever.
  syncInitialize: "Initialize repository",
  syncing: "Syncing…",
  syncSaveFirst: "Save these settings before syncing.",
  // ── What travels (client/components/settings/TravelRow.tsx) ─────────────
  // The row's label and hint only — the settings search index resolves them
  // before the panel exists. The row's own two dozen strings travel with the
  // panel's chunk (client/components/settings/travelCopy.ts).
  rowTravel: "What travels",
  hintTravel: "Your look, your fonts and your ledgers, kept in the vault's .astrolabe folder for every machine that opens it.",
  // ── A pocket vault's own Backup & sync (client/components/settings/
  //    PocketSync.tsx) ───────────────────────────────────────────────────
  // Shown INSTEAD of the rows above when /api/me says `pocket`: the vault is
  // a repository cloned into the Android app and there is no server-side git
  // to point at a remote. The line's words match the shell's strip
  // (mobile/src/i18n.ts) because it is the same fact, decided by the same
  // rule in shared/pocketSync.ts.
  pocketSyncNote: "This vault is a GitHub repository, cloned onto this phone.",
  rowPocketRepo: "Repository",
  hintPocketRepo: "The repository this phone opened, and its branch.",
  pocketOnBranch: "on {branch}",
  rowPocketState: "State",
  hintPocketState: "The same line the app shows over your vault.",
  pocketLineSyncing: "Checking GitHub…",
  pocketLinePushing: "Sending your changes…",
  pocketLineOffline: "Offline. Your changes are safe on this phone.",
  pocketLineNever: "Not sent yet.",
  pocketLineSyncedJustNow: "Synced just now.",
  pocketLineFailed: "Could not reach GitHub. Try Sync now.",
  pocketLineConflicts: "{count} notes changed in both places. Both versions are kept.",
  pocketLineToPush: "{count} changes to send.",
  pocketLineSyncedAgo: "Synced {count} minutes ago.",
  pocketSyncFailed: "Could not sync this vault",
  rowPocketConflicts: "Kept side by side",
  hintPocketConflicts: "Notes changed here and elsewhere; nothing was merged.",
  pocketNoConflicts: "Nothing waiting.",
  pocketConflictRule: "Open both, keep the one you want and delete the other.",
  rowPocketLeave: "Leave this vault",
  hintPocketLeave: "Forgets the repository and the token; your notes stay.",
  pocketLeaveAction: "Leave",
  pocketLeaveTitle: "Leave this vault?",
  pocketLeaveBody: "This phone will forget which repository to open and the token that reaches it, and go back to the connection screen. Nothing is deleted from GitHub.",
  pocketLeaveFailed: "Could not leave this vault",
  // One sentence per tab naming what a pocket vault cannot keep, shown above
  // the rows it greys out. A greyed row with no reason is the same silence
  // this round exists to end.
  pocketSiteNotice: "A pocket vault has no public site: the marks and faces visitors would see are an instance's.",
  pocketLangNotice: "The two rows below curate what VISITORS see, and a pocket vault has none.",
  pocketVaultNotice: "The greyed rows need a server: a corpus on disk, a clipper reachable over the network, versions beside git.",
  syncErrorShort: "failed",
  syncFailed: "Sync failed",
  syncPushed: "Vault committed and pushed",
  /** The same fact, NAMED (F40). The sha is a git object id: it stays in its
   *  own LTR isolate and its own numerals wherever it is rendered — never
   *  through localeNum(), which would spell an Eastern Arabic "٣" into a
   *  string an operator is going to paste into `git show`. */
  syncPushedSha: "Vault committed and pushed — {sha}",
  syncOpenPanel: "Backup",
  syncUpToDate: "Nothing to commit — already up to date",
  // Distinct from both: nothing new to COMMIT, but commits that were only
  // local are now on the remote. The first sync after "Make it a repo" is
  // always this one, and calling it "already up to date" hid a whole upload.
  syncPushedOnly: "Pushed — nothing new to commit",
  syncInitDone: "The vault is a git repository now",
  syncNotRepo: "The vault is not a git repository yet.",
  syncNoRemote: "no remote",
  syncOnBranch: "On {branch} → {host}",
  syncTokenMissing: "Token mode is selected but no token is stored.",
  syncTipBranch: "Branch {branch} → {host}",
  syncTipNoRepo: "Not a git repository yet",
  syncTipClean: "Nothing uncommitted",
  syncTipDirty: "{count} uncommitted",
  // Two separate strings, not one "{ahead} ahead · {behind} behind": in Arabic
  // that single line reordered into "٠ متقدم ٠٠ متأخر", the two counts colliding
  // into an unreadable run. Each count now renders in its own isolated chip.
  syncAhead: "{count} ahead",
  syncBehind: "{count} behind",
  // The third state ahead/behind needs. There is no remote-tracking ref until
  // a fetch or a push has succeeded once, and calling that "0 ahead · 0 behind"
  // is character-for-character what a fully backed-up vault reads.
  syncNoTracking: "Nothing has reached the remote yet",
  // A failure line leads with the cause WE can state; git's own words stay
  // underneath it, verbatim and quotable, because that text is the diagnosis.
  syncGitSaid: "git said:",
  syncNoRemoteSet: "No remote URL is set.",
  syncCopyError: "Copy the error",
  syncCopied: "Copied",
  syncDetails: "Backup details",
  syncOpenSettings: "Backup settings",
  cmdSyncHint: "backup",
  errRemoteScheme: "Must start with https:// , ssh:// or git@host:path",
  errRemoteChars: "A git remote cannot hold spaces or shell characters",
  errRemoteCreds: "Do not put credentials in an https:// URL — use the token field",
  errBranchName: "Not a valid branch name",
  errInterval: "Whole minutes, 0 to 1440",
  errTokenSpaces: "A token cannot contain spaces",

  // ── Settings panel navigation ───────────────────────────────────────────
  // The panel outgrew one flat scroll (five sections, four screens of it), so
  // it has a section rail — the same reason Obsidian's settings has one.
  settingsSections: "Settings sections",
  // An empty field that inherits an env default and a field holding a muted
  // value looked identical. The badge says which one this is, so the
  // convention no longer has to be explained in a note at the top.
  // The middle state of a three-way row: not on, not off, TAKE THE ENV
  // DEFAULT. A checkbox cannot express it, which is why these rows are
  // segmented controls; the segment carries the value in force as its note.
  inheritSegment: "Default",
  // The generic filter field inside a select popover (the font picker names
  // its own).
  filterPlaceholder: "Filter…",
  remove: "Remove",

  // ── Mode indicators ─────────────────────────────────────────────────────
  // A mode that removes the ability to type must say so where the eye already
  // is (the status bar) AND where the hands are (the editor column). These are
  // the pills; the strip copy is below them.
  modeRead: "Reading",
  modeVim: "Vim",
  modePreview: "Preview",
  modeReadOnTitle: "Reading mode is ON — typing is off. Click (or Ctrl/Cmd+E) to edit.",
  modeReadOffTitle: "Editing. Click (or Ctrl/Cmd+E) for reading mode.",
  modeVimOnTitle: "Vim keybindings are ON — click to turn them off.",
  modeVimOffTitle: "Vim keybindings are off — click to turn them on.",
  modePreviewTitle: "Previewing as a visitor — click (or Esc) to return to the app.",
  modesLabel: "Modes",
  // Vim's SUB-mode. "Vim is on" and "the keys under your fingers are commands
  // right now" are different facts, and only the second one traps a reader —
  // so the pill carries the sub-mode beside the name and vim's own panel at
  // the foot of the editor spells it out in full.
  vimNormal: "NORMAL",
  vimInsert: "INSERT",
  vimVisual: "VISUAL",
  vimReplace: "REPLACE",
  vimNormalTitle: "Vim NORMAL mode — keys are commands, not text. Press i to type; click to leave vim.",
  vimInsertTitle: "Vim INSERT mode — keys type text. Press Esc for commands; click to leave vim.",
  vimVisualTitle: "Vim VISUAL mode — keys extend the selection. Press Esc; click to leave vim.",
  vimReplaceTitle: "Vim REPLACE mode — typing overwrites. Press Esc; click to leave vim.",
  // The in-workspace strip: one line, part of the layout, never an overlay.
  readingStrip: "Reading — this note is read-only",
  // The VERB only. The keystroke that used to be inside this string is a
  // keycap, not prose — it lives beside the call as a literal, the way every
  // other chord label in the client does (CommandPalette's `hint`) — so that
  // a phone, which has no Ctrl and no Cmd, can simply not draw it.
  readingStripAction: "Edit",
  // Zen takes the status bar to zero height, so in zen the pills are gone and
  // the strip is the only place a mode can live. Reading already had one;
  // ZEN + VIM was a modal editor with no on-screen state at all.
  vimStripNormal: "Vim NORMAL — keys are commands, not text. Press i to type.",
  vimStripInsert: "Vim INSERT — keys type text. Esc returns to commands.",
  vimStripVisual: "Vim VISUAL — keys extend the selection. Esc returns to commands.",
  vimStripReplace: "Vim REPLACE — typing overwrites. Esc returns to commands.",
  vimStripAction: "Leave vim",
  previewStripHint: "This is exactly what a visitor sees",
  exitPreviewTitle: "Exit preview (Esc)",

  // ── Status-bar panel toggles ────────────────────────────────────────────
  enterZen: "Zen mode (Ctrl/Cmd+Shift+Z)",

  // ── Keyboard shortcuts overlay (Ctrl/Cmd+/) ─────────────────────────────
  shortcutsTitle: "Keyboard shortcuts",
  shortcutsTitleKey: "Keyboard shortcuts (Ctrl/Cmd+/)",
  shortcutsPlaceholder: "Search shortcuts…",
  scGroupNav: "Navigation",
  scGroupEditing: "Editing",
  scGroupModes: "Modes",
  scGroupPublishing: "Publishing",
  scGroupPanels: "Panels",
  scPalette: "Command palette",
  scSearch: "Search notes",
  scGraph: "Graph view",
  scFollowLink: "Follow a [[wikilink]]",
  scFollowLinkKey: "Click",
  scOpenFile: "Open an image or PDF from the tree",
  scWalkFiles: "Next / previous file in the folder",
  scEscape: "Close an overlay, leave zen or preview",
  scEscapeBlog: "Close an overlay, leave preview",
  scSave: "Save now",
  scUndo: "Undo",
  scRedo: "Redo",
  scFind: "Find and replace in this note",
  scReplaceVault: "Search and replace across the vault",
  scMoveLine: "Move line up / down",
  scSlash: "Insert a block (callout, table, code…)",
  scSlashKey: "/ at line start",
  scFold: "Fold a section",
  scFoldKey: "or the chevron beside a heading",
  scFoldAll: "Fold / unfold everything",
  scViaPalette: "Command palette",
  scViaStatusBar: "Status bar",
  scHelp: "This list",
  // Shown only when the reader's keyboard types none of the Latin letters on
  // this sheet — an Arabic, Persian, Russian, Greek or Hebrew layout. The
  // letters name a POSITION there, and beside each one the sheet prints what
  // that position actually types on this keyboard.
  scLayoutNote: "Your keyboard does not type these letters. A shortcut follows the key’s position — the letter printed on the keycap — and the character it types is shown beside it.",

  // ── Moving things (drag in the tree, "Move to…", undo) ────────────────────
  // Every one of these is reachable without a mouse: the row menu and the
  // palette open the same picker the drag ends in, and the undo is a real
  // <button> in the toast, not a gesture.
  moveTo: "Move to…",
  cmdMoveCurrent: "Move note to…",
  cmdMoveFolderHint: "picks a folder",
  moveToTitle: "Move “{name}” to…",
  moveAction: "Move",
  moveFilter: "Filter folders…",
  moveVaultRoot: "Vault root",
  moveNoFolders: "No folder matches.",
  moveNowhere: "There is nowhere else to put it — the vault has no other folder.",
  // The door out of both dead ends (F11): a vault with no other folder, and a
  // filter that matches none. Named with the filter text when there is any,
  // because that text is already the reader's answer to "where does this go?".
  moveNewFolder: "New folder…",
  moveNewFolderNamed: "New folder “{name}”…",
  // The conflict dialog. It offers a NAME, never an overwrite: the two files
  // both exist and the reader decides which name the arriving one keeps.
  moveConflictTitle: "“{name}” is already there",
  moveConflictBody: "{folder} already holds a “{name}”. Give this one another name, or cancel.",
  moveNameTaken: "That name is taken here too.",
  moveNameSlash: "A name cannot contain “/”.",
  moveNameDot: "A name cannot start with “.”.",
  moveLands: "Lands at {path}",
  moveCurrently: "Currently in {folder}",
  // The toast. It names BOTH ends, because the whole risk of a drag is landing
  // somewhere you were not looking.
  movedToast: "Moved “{name}” from {from} to {to}",
  renamedToast: "Renamed “{from}” to “{name}”",
  moveUndoneToast: "Move undone — “{name}” is back in {folder}",
  undo: "Undo",
  // Refusals. The server names a code for each; the generic line is the
  // fallback for anything it has not named.
  moveFailed: "Could not move “{name}”.",
  moveNotAllowed: "That folder cannot take “{name}”.",
  moveIntoSelfError: "A folder cannot move inside itself.",
  moveConflictError: "“{name}” already exists there.",
  moveGoneError: "“{name}” is no longer there.",
  // Files dragged in from the desktop onto a folder row. The landed NAME is in
  // the message because the server takes the first free one — a counter the
  // reader does not see is a file they will not find.

  // ── Text formatting, the selection menu and colour ──────────────────────
  // Added with the formatting round. Ctrl/Cmd+B stopped folding a pane and
  // started making text bold, so the sheet needs a group that says so, and
  // the menu needs a full vocabulary in both languages. The colour names are
  // written out one by one rather than composed at the call site: the i18n
  // gate counts a key as used only when it appears as a quoted token, and a
  // template-literal key would report all nine as dead.
  scGroupFormatting: "Formatting",
  scBold: "Bold",
  scItalic: "Italic",
  scUnderline: "Underline",
  scStrikethrough: "Strikethrough",
  scHighlight: "Highlight",
  scSelectionMenu: "Formatting menu for the selection",
  scSelectionMenuKey: "Right-click, or Shift+F10",
  scTextColor: "Text colour",
  scViaSelectionMenu: "Selection menu",
  // The spelling menu hides behind a gesture nobody documents anywhere else:
  // the word must NOT be selected first, or the right-click means formatting.
  scSpellMenu: "Correct a misspelled word (suggestions + add to dictionary)",
  scSpellMenuKey: "Right-click the word itself, nothing selected",

  selMenuTitle: "Formatting",
  selGroupStyle: "Text style",
  selGroupStructure: "Structure",
  selGroupAlign: "Align",
  alignNone: "No alignment",
  selGroupInsert: "Insert",
  selGroupColor: "Colour",
  fmtBold: "Bold",
  fmtItalic: "Italic",
  fmtUnderline: "Underline",
  fmtStrikethrough: "Strikethrough",
  fmtHighlight: "Highlight",
  fmtCode: "Inline code",
  fmtHeading1: "Heading 1",
  fmtHeading2: "Heading 2",
  fmtHeading3: "Heading 3",
  fmtBulletList: "Bulleted list",
  fmtNumberedList: "Numbered list",
  fmtTaskList: "Task list",
  fmtQuote: "Quote",
  insWikilink: "Wikilink",
  insLink: "Link",
  insMath: "Inline math",
  insCodeBlock: "Code block",
  // The two tiers, named by what they DO rather than by their implementation.
  // The notes are the whole argument in one line each, because the choice
  // between them is a real one and the reader is making it here.
  colorThemeAware: "Theme-aware",
  colorThemeAwareNote: "Follows the theme — stays legible in every room, light and dark.",
  colorFixed: "Fixed ink",
  colorFixedNote: "One exact colour, whatever the theme. Readable everywhere, sharpest on some.",
  colorRemove: "Remove colour",
  colorRed: "Red",
  colorOrange: "Orange",
  colorAmber: "Amber",
  colorGreen: "Green",
  colorTeal: "Teal",
  colorBlue: "Blue",
  colorViolet: "Violet",
  colorMagenta: "Magenta",
  colorGrey: "Grey",
  selToolbarLabel: "Formatting toolbar",
  cmdSelectionToolbar: "Floating formatting toolbar",
  cmdSelectionToolbarHint: "Appears over a selection",

  // ── LaTeX notes (.tex / .latex) ──────────────────────────────────────────
  // A `.tex` note is a note like any other, so its chrome is localized like
  // any other. Only the words LaTeX itself has and markdown does not live
  // here: numbered floats, theorem environments, a bibliography.
  texAbstract: "Abstract",
  texContents: "Contents",
  texReferences: "References",
  texFigure: "Figure",
  texTable: "Table",
  texTheorem: "Theorem",
  texLemma: "Lemma",
  texProposition: "Proposition",
  texCorollary: "Corollary",
  texDefinition: "Definition",
  texRemark: "Remark",
  texExample: "Example",
  texProof: "Proof",
  // An unimplemented command renders as a muted dot, never as raw source; the
  // tooltip is the only place its name is ever shown.
  texUnsupportedCommand: "{name} is not rendered here",
  texUnresolvedRef: "No note in this vault defines {key}",
  texRefIn: "{title} — in {note}",
  texCiteOpens: "Opens {note}",
  cmdCopyAstrolabeSty: "LaTeX: download astrolabe.sty",
  cmdCopyAstrolabeStyHint: "The macro package that makes a .tex note compile outside Astrolabe",
  newTexNote: "New LaTeX note",
  // ── Drawings (client/drawing/) ─────────────────────────────────────────
  newDrawing: "New drawing",
  newDrawingHere: "New drawing here",
  cmdNewDrawingHint: "an Excalidraw canvas in the vault",
  drawingAria: "Drawing: {title}",
  drawingSaving: "Saving…",
  drawingSaved: "Saved",
  drawingUnsaved: "Unsaved strokes",
  drawingSaveFailed: "The drawing could not be saved. Your strokes are still on the canvas.",
  drawingLoadFailed: "This file is not a drawing Astrolabe can read. Open it in Obsidian, or fix the scene by hand.",
  drawingConflict: "This drawing changed on disk while you were drawing.",
  drawingKeepMine: "Keep mine",
  drawingTakeTheirs: "Use the disk version",
  drawingEmbedMissing: "{name}: open the drawing once to draw its picture",

  // ── Tables, edited in place (client/editor/tables.ts) ────────────────────
  // The menu on a cell, the box inside one, and the two palette doors. Every
  // row names what it does to the TABLE, never to "the selection": the reader
  // right-clicked a cell and the answer has to be about rows and columns.
  tableMenu: "Table actions",
  tableCellLabel: "Cell, row {row}, column {col}",
  tableRowAbove: "Insert row above",
  tableRowBelow: "Insert row below",
  tableColBefore: "Insert column before",
  tableColAfter: "Insert column after",
  tableDeleteRow: "Delete row",
  tableDeleteCol: "Delete column",
  tableDuplicateRow: "Duplicate row",
  tableClearCell: "Clear cell",
  tableRowUp: "Move row up",
  tableRowDown: "Move row down",
  tableColLeft: "Move column left",
  tableColRight: "Move column right",
  tableAlignStart: "Align column left",
  tableAlignCenter: "Align column centre",
  tableAlignEnd: "Align column right",
  tableSortAz: "Sort by this column, A→Z",
  tableSortZa: "Sort by this column, Z→A",
  tableSortNumeric: "Sort by this column, smallest first",
  tableEditSource: "Edit as Markdown",
  tableCopyMarkdown: "Copy table as Markdown",
  tableCopied: "Table copied",
  tableCopyFailed: "Could not copy — the clipboard refused",
  tableNotHere: "Put the cursor in a table first",
  tableSize: "{rows} rows × {cols} columns",
  tableSizeLabel: "A table of {rows} rows and {cols} columns",
  tableRowsCols: "Rows × columns",
  tableInsertIt: "Insert table",
  scTableEditCell: "Edit a table cell where it stands",
  scViaTableCell: "click a cell",
  scTableMenu: "Row, column, alignment and sort commands",
  scViaTableMenu: "right-click a cell (Shift F10)",

  // ── Sectioning (heading menu, outline drag, focus, numbering) ─────────────
  // A heading is a HANDLE on a subtree, and every string here names an action
  // on that subtree rather than on the line the reader clicked.
  sectionActions: "Section actions",
  copySectionLink: "Copy link to section",
  copySectionMd: "Copy section as Markdown",
  extractSection: "Extract section to a new note",
  selectSection: "Select section",
  focusSection: "Focus section",
  foldBelow: "Fold all below",
  unfoldBelow: "Unfold all below",
  sectionLinkCopied: "Link to section copied",
  sectionCopied: "Section copied",
  sectionCopyFailed: "Could not copy — the clipboard refused",
  sectionExtracted: "Moved “{title}” into {path}",
  sectionExtractUndone: "Extraction undone",
  sectionExtractFailed: "Could not extract the section",
  sectionMoved: "Moved “{title}”",
  sectionMoveUndone: "Move undone",
  sectionMoveFailed: "Could not move the section",
  // A mode that removes what is on screen has to say so, and has to name the
  // way back in the same breath.
  focusSectionOn: "Focused one section — Esc restores",
  numberHeadings: "Number the headings",
  unnumberHeadings: "Stop numbering the headings",
  scGroupSections: "Sections",
  scPrevHeading: "Previous heading",
  scNextHeading: "Next heading",
  scFocusSection: "Focus one section (Esc restores)",
  scSectionMenu: "Section actions on a heading",
  scSectionMenuKey: "Right-click a heading, or ⋯",
  scReorderSection: "Reorder a whole section",
  scViaOutlineDrag: "Drag a row in Outline",

  // ── Banners: the value that named nothing ────────────────────────────────
  // A banner used to vanish when it failed to load, which made a typo and "no
  // banner" identical on screen. These are what the ADMIN surfaces say
  // instead; a visitor still sees nothing.
  bannerMissing: "Banner image not found",
  bannerMissingTitle: "No file in the vault matches “{value}”",

  // ── Templates ────────────────────────────────────────────────────────────
  // The palette's table rows. Labelled "Table: …" rather than "Insert row":
  // the palette is one fuzzy list of two hundred commands, and a row called
  // "Insert row above" is unfindable by anyone who typed "table".
  cmdInsertTable: "Insert table…",
  cmdInsertTableHint: "Pick the rows and columns",
  cmdTableRowAbove: "Table: insert row above",
  cmdTableRowBelow: "Table: insert row below",
  cmdTableColBefore: "Table: insert column before",
  cmdTableColAfter: "Table: insert column after",
  cmdTableEditSource: "Table: edit as Markdown",
  cmdTableHint: "The table at the cursor",
  cmdInsertTemplate: "Insert template…",
  cmdNewFromTemplate: "New note from template…",
  templateFilterPlaceholder: "Search templates…",
  templatePreviewHint: "Pick a template to preview it",
  templateEmptyBody: "This template has no body — only properties.",
  // The picker's preview shows the template's FRONTMATTER as well as its body:
  // two templates whose bodies are both "# {{title}}" are told apart by these
  // rows and by nothing else, and one of them may publish the note.
  // A name the vault cannot address: `[`, `]`, `#` and `|` end or re-open a
  // wikilink, and an extraction leaves `[[<this name>]]` behind.
  promptNoLinkChars: "A name cannot contain [ ] # or |",
  // Why a note whose frontmatter says `align: justify` is set flush anyway.
  layoutHardWrapped: "set flush — this note’s paragraphs are wrapped by hand",
  templateSetsProps: "Properties it sets",
  templateNoProps: "No properties — body only",
  templateBodyLabel: "Body",
  templatePublishWarn: "Publishes the note to the public site",
  templatesNoFolder: "No templates folder yet. Name one in Settings → Vault.",
  templatesFolderEmpty: "“{folder}” holds no notes yet.",
  templatesFolderIs: "Templates: {folder}",
  templatesFolderDetected: "Templates: {folder} (detected)",
  templatesFailed: "Could not load the templates.",
  templateInserted: "Inserted “{name}”",
  templateFailed: "Applying the template failed",
  defaultTemplateFailed: "The default template could not be applied — the note is empty",
  // The prompt sheet (TemplateValuesSheet.tsx): a template's
  // {{prompt:Label}} / {{VALUE:Label}} questions, asked once each.
  templateValuesTitle: "The template asks",
  templateValuesUnnamed: "Value",
  templateValuesHint: "Each answer replaces its placeholder. Enter inserts; Escape inserts nothing.",
  templateValuesInsert: "Insert",
  // Settings rows.
  templatesSection: "Templates",
  templatesFolderLabel: "Templates folder",
  templatesFolderHint: "Template notes live here and never reach the blog's post list.",
  templatesDetectedHint: "Found automatically: {folder}",
  drawingsFolderLabel: "Drawings folder",
  drawingsFolderHint: "Where the sidebar's pencil starts a new drawing. Empty means the vault root.",
  defaultTemplateLabel: "Template for new notes",
  defaultTemplateHint: "Applied to every note made from here; off by default.",
  templatePlaceholdersHint: "Placeholders: {{date}}, {{time}}, {{title}}, {{Title}}, {{date:FORMAT}}, {{hdate}}. Anything else is left as written.",

  // ── Localization: calendar, note layout, tag labels ───────────────────────
  // Three features, one section, because they answer one question: what does
  // this instance look like to a reader who does not read English.

  // The note-layout broadcast. ONE set of words for two surfaces (the
  // properties card's chip and the status bar's segment), which is what stops
  // the two from drifting; they are deliberately SHORT, because both live in
  // a strip that is already competing for width.
  layoutDirection: "Direction",
  layoutAlignment: "Alignment",
  layoutDirAuto: "Auto",
  layoutDirLtr: "LTR",
  layoutDirRtl: "RTL",
  layoutAlignStart: "Start",
  layoutAlignLeft: "Left",
  layoutAlignRight: "Right",
  layoutAlignCenter: "Centred",
  layoutAlignJustify: "Justified",
  layoutSourceNote: "set by this note",
  layoutSourceSite: "the site default",
  layoutSegmentLabel: "Text layout",

  // Settings → Appearance & language: the calendar.
  groupCalendar: "Calendar",
  rowDateCalendar: "Date calendar",
  hintDateCalendar: "The calendar every date on the site is printed in.",
  calGregorian: "Gregorian",
  calHijri: "Hijri",
  calBoth: "Both",
  rowDateOrder: "Which calendar leads",
  hintDateOrder: "Automatic follows the site language: Hijri first on an Arabic site.",
  dateOrderAuto: "Automatic",
  dateOrderHijriFirst: "Hijri first",
  dateOrderGregorianFirst: "Gregorian first",
  rowDateSeparator: "Between the two",
  hintDateSeparator: "A bar, a dot, or the second date in brackets.",
  calSpecimen: "Today reads",
  calFeedNote: "RSS keeps Gregorian RFC-822 dates, which is what aggregators parse.",
  calArabicSuggest: "Many Arabic sites date their writing by the Hijri calendar.",

  // Settings → Appearance & language: note direction and alignment.
  groupNoteLayout: "Note layout",
  rowTextDirection: "Text direction",
  hintTextDirection: "Base direction (LTR or RTL) for note prose; Auto lets each paragraph decide.",
  rowTextAlign: "Text alignment",
  rowEmptyPropsCard: "Properties card on empty notes",
  hintEmptyPropsCard: "A one-line card on notes that have no properties yet.",
  hintTextAlign: "Where lines sit in the column; code and tables never move.",
  noteLayoutOverride: "A note's own frontmatter — dir, align — overrides both.",

  // Settings → Appearance & language: localised tag labels.
  groupTagLabels: "Tag labels",
  tagLabelsNote: "Display only: links, search and the vault keep the real tag.",
  rowTagsFolder: "Tags folder",
  hintTagsFolder: "Where a tag's own page lives; that page names the tag.",
  /** The table's own row label. NOT the group heading it sits under — a row
   *  whose label repeats the heading two lines above it says nothing twice. */
  tagLabelsRowLabel: "Labels",
  tagLabelsTag: "Tag",
  tagLabelsEnglish: "English",
  tagLabelsArabic: "Arabic",
  tagLabelsAdd: "Add a tag",
  tagLabelsRemove: "Remove this label",
  tagLabelsEmpty: "No labels yet. Add one to give a tag another name on the front end.",
  tagLabelsTagPlaceholder: "canonical tag",
  tagLabelsLabelPlaceholder: "shown instead",
  tagLabelsPageWins: "A tag with its own page is named there instead.",

  // ── Site design engine (client/design/) ─────────────────────────────────
  // The third public layout. Everything below is either the OWNER's copy (the
  // notices, which a visitor never sees — a broken design gives them the stock
  // blog and no explanation) or the designed site's own small chrome.
  layoutDesigned: "Designed",
  secHero: "Hero",
  secRichText: "Text",
  secNote: "Note",
  secPostGrid: "Post grid",
  secPostList: "Post list",
  secTopics: "Topics",
  secCta: "Call to action",
  secDivider: "Divider",
  secConfig: "Design settings",
  secPage: "Page",
  dsnReadMore: "Read more",
  dsnNoPosts: "Nothing published here yet.",
  dsnRelated: "Related",
  dsnBrokenTitle: "Design problem.",
  dsnFellBack: "Your visitors are seeing the built-in blog.",
  dsnSectionFailed: "The {section} section ({id}) could not be rendered.",
  dsnNoteMissing: "It points at a note that is not there: {note}",
  dsnNoteUnavailable: "It points at a note this reader may not see, so the page cannot be built for them.",
  dsnUnknownKind: "This build does not know that section.",
  dsnUnknownKindDetail: "This build does not know the section type “{kind}”.",
  dsnConfigInvalid: "The design is not valid: {detail}",
  dsnQuarantined: "“{design}” is kept but not rendered — {detail}",
  dsnNoDesign: "There is no design to render yet.",
  dsnNoticeSection: "A section points at a note that is not published: {detail}",
  dsnRevertStock: "Back to the stock blog",
  dsnRevertedToast: "Back on the stock blog. Your design is kept.",
  dsnRevertFailed: "Could not switch back.",

  // ── Custom theme builder (client/components/ThemeBuilder.tsx) ────────────
  themeGroupCustom: "Your themes",
  tbTitle: "Custom theme",
  tbHint: "Pick a base, then change only what you want. The app behind this panel is the preview.",
  tbNew: "New custom theme",
  tbEdit: "Edit this theme",
  tbName: "Name",
  tbBase: "Based on",
  tbBasedOn: "Based on {base}",
  tbGroup: "Listed as",
  tbTokens: "Tokens",
  tbGroupGround: "Grounds",
  tbGroupText: "Text",
  tbGroupAccent: "Accent",
  tbGroupLine: "Borders",
  tbGroupCallout: "Callouts",
  tbGroupCode: "Code",
  tbGroupGraph: "Graph",
  tbGroupSidebar: "Sidebar",
  tbGroupTabs: "Tabs & panels",
  tbGroupStatusbar: "Status bar",
  tbGroupEditor: "Editor & code",
  tbGroupReading: "Reading",
  tbGroupLinks: "Links & tags",
  tbGroupControls: "Controls",
  tbGroupOverlays: "Dialogs & toasts",
  tbGroupBlog: "Site",
  tbGroupCards: "Cards & bars",
  tbFilter: "Find a setting…",
  tbNoMatch: "Nothing here matches.",
  tbResetGroup: "Reset this group",
  tbResetAll: "Reset all",
  tbDerived: "Follows {base} until you paint it",
  // The token rows, one human name per token in both languages; the raw
  // name sits beside it in mono for people who write custom.css.
  tkBg: "Page ground",
  tkBgRaised: "Raised surfaces",
  tkBgHover: "Hover ground",
  tkText: "Body text",
  tkTextMuted: "Secondary text",
  tkTextFaint: "Hints and counts",
  tkHeading: "Headings",
  tkAccent: "Accent",
  tkAccentSoft: "Accent wash",
  tkSelectionBg: "Text selection",
  tkFocusRing: "Focus ring",
  tkBorder: "Hairlines",
  tkDanger: "Danger",
  tkCalloutNote: "Note",
  tkCalloutInfo: "Info",
  tkCalloutTodo: "To do",
  tkCalloutAbstract: "Abstract",
  tkCalloutTip: "Tip",
  tkCalloutSuccess: "Success",
  tkCalloutQuestion: "Question",
  tkCalloutWarning: "Warning",
  tkCalloutFailure: "Failure",
  tkCalloutDanger: "Danger callout",
  tkCalloutBug: "Bug",
  tkCalloutExample: "Example",
  tkCalloutQuote: "Quote callout",
  tkSynKeyword: "Keywords",
  tkSynString: "Strings",
  tkSynNumber: "Numbers",
  tkSynComment: "Comments",
  tkSynFunc: "Functions",
  tkSynType: "Types",
  tkSynProp: "Properties",
  tkSynOperator: "Operators",
  tkGraphNode: "Graph nodes",
  tkGraphEdge: "Graph edges",
  tkGraphVignette: "Graph vignette",
  tkSidebarBg: "Sidebar background",
  tkSidebarText: "Sidebar text",
  tkSidebarMuted: "Sidebar secondary text",
  tkSidebarBorder: "Sidebar edge and rules",
  tkSidebarHoverBg: "Row under the pointer",
  tkSidebarActiveBg: "Open note's row",
  tkSidebarActiveBar: "Open note's edge bar",
  tkSidebarSearchBg: "Search field",
  tkTagpillBg: "Tag pills",
  tkTagpillText: "Tag pill text",
  tkTabsBg: "Tab strip",
  tkTabsBorder: "Tab strip rules",
  tkTabText: "Tab titles",
  tkTabHoverBg: "Tab under the pointer",
  tkTabActiveBg: "Active tab",
  tkTabActiveText: "Active tab title",
  tkTabActiveBar: "Active tab's top line",
  tkPanelBg: "Outline panel background",
  tkPanelText: "Outline panel text",
  tkPanelHeading: "Panel section headings",
  tkPanelBorder: "Panel edge and rules",
  tkStatusbarBg: "Status bar",
  tkStatusbarText: "Status bar text",
  tkStatusbarBorder: "Status bar rule",
  tkEditorBg: "Editor page",
  tkEditorText: "Editor text",
  tkEditorCaret: "Caret",
  tkEditorPanelBg: "Find panel",
  tkCodeblockBg: "Code blocks",
  tkCodeblockText: "Code block text",
  tkInlineCodeBg: "Inline code",
  tkInlineCodeText: "Inline code text",
  tkCodeBorder: "Code edges",
  tkReadingBg: "Reading page",
  tkReadingText: "Reading text",
  tkQuoteBar: "Quotation bar",
  tkQuoteText: "Quotation text",
  tkHighlightBg: "Highlight",
  tkHr: "Horizontal rule",
  tkListBullet: "List bullets",
  tkTableBorder: "Table lines",
  tkTableHeadBg: "Table header",
  tkTableHeadText: "Table header text",
  tkPropsBg: "Properties card",
  tkFootnoteMarker: "Footnote numbers",
  tkLink: "External links",
  tkWikilink: "Wikilinks",
  tkWikilinkBroken: "Unresolved wikilinks",
  tkTagBg: "Tag chips in prose",
  tkTagText: "Tag chip text",
  tkButtonText: "Button text",
  tkButtonHoverBg: "Button under the pointer",
  tkButtonAccentBg: "Primary button",
  tkButtonAccentText: "Primary button text",
  tkInputBg: "Fields",
  tkInputText: "Field text",
  tkInputBorder: "Field edge",
  tkInputPlaceholder: "Field placeholder",
  tkInputFocus: "Focused field edge",
  tkMenuBg: "Menus",
  tkMenuText: "Menu text",
  tkMenuHoverBg: "Menu row under the pointer",
  tkModalBg: "Dialogs and the palette",
  tkModalText: "Dialog text",
  tkModalBorder: "Dialog edge",
  tkBackdrop: "Backdrop behind dialogs",
  tkToastBg: "Toasts",
  tkToastText: "Toast text",
  tkToastBar: "Toast's leading bar",
  tkScrollbarThumb: "Scrollbars",
  tkScrollbarThumbHover: "Scrollbar under the pointer",
  tkGraphBg: "Graph canvas",
  tkBlogBg: "Site page",
  tkBlogText: "Site text",
  tkBlogMastText: "Masthead name",
  tkBlogMastTagline: "Masthead tagline",
  tkBlogMastStar: "Masthead star",
  tkBlogNavText: "Topic chips",
  tkBlogNavHoverBg: "Topic chip under the pointer",
  tkBlogNavActiveBg: "Current topic chip",
  tkBlogNavActiveText: "Current topic chip text",
  tkCardBg: "Cards",
  tkCardText: "Card text",
  tkCardBorder: "Card edge",
  tkCardHoverBorder: "Card edge under the pointer",
  tkProgressTrack: "Progress bar track",
  tkProgressFill: "Progress bar fill",
  tbSet: "Set",
  tbInherited: "Base",
  tbResetToken: "Use the base value",
  tbAllClear: "Every contrast rule passes.",
  tbWarnRatio: "{token} on {ground} is {value}:1 — the floor is {min}:1.",
  tbWarnDeltaE: "The accent is only {value} ΔE from the body text — it needs {min} to read as an accent at all.",
  tbNeedName: "Give the theme a name.",
  tbNotATheme: "That file is not an Astrolabe theme.",
  tbFull: "This instance already holds {max} custom themes.",
  tbImport: "Import…",
  tbExport: "Export",
  tbSaved: "Saved “{name}”.",
  tbDeleted: "Theme deleted.",
  tbDeleteTitle: "Delete this theme?",
  tbDeleteBody: "“{name}” will be removed from the picker. Anything using it falls back to the theme it was built on.",

  // ── The site designer (designed mode) ────────────────────────────────────
  // The public site's own chrome first (a visitor can read these), then the
  // admin panel that builds it.
  designNavLabel: "Site navigation",
  designMenu: "Menu",
  designSecHeader: "the header",
  designSecFooter: "the footer",
  designCorruptNotice: "A design in this instance could not be read, so the stock site is being served.",

  designTitle: "Design your site",
  // The hint is searched as well as read (CommandPalette: "typing what you can
  // read must never answer 'no matches'"), and the Arabic label is the
  // imperative «صمّم» — so the noun every Arabic speaker actually types,
  // «تصميم», reached nothing. It is in the hint now, where it is also the
  // plainest description of what the row opens.
  designPaletteHint: "site design: presets, navigation, pages, type, header & footer",
  designPublicSite: "Public site",
  designLayoutApp: "App",
  designLayoutBlog: "Stock blog",
  designLayoutDesign: "Designed",
  designLayoutDesigned: "Visitors now see your design.",
  designLayoutStock: "Visitors now see the stock site.",
  /** The way back from a layout switch, offered in the toast that announces it
   *  (F26). "Switch back", not "Undo": nothing was lost — the design and the
   *  stock blog are both still there — and the reader is choosing a room, not
   *  repairing a mistake. */
  designLayoutBack: "Switch back",
  /* THE LIVE BAR — one line under the head that answers the question every
   * author actually has open while they are in here: what are VISITORS seeing
   * right now, and how do I change that back. It replaced a note that appeared
   * only while the design was off and said "switch it above when you are
   * ready", which pointed at a segmented control the reader had not yet learned
   * to read as a switch — a sentence about a thing nobody could find. It is
   * present in all three states, and it carries the action rather than
   * describing where the action is. */
  designLiveOnBody: "Visitors are seeing your design.",
  designLiveOffBlog: "Visitors are seeing the stock blog. Nothing you do in here reaches them until you put a design live.",
  designLiveOffApp: "The public site is set to the app, so visitors get the sign-in page. Nothing you do in here reaches them until you put a design live.",
  designLiveGo: "Put my design live",
  designLiveRevert: "Back to the stock blog",
  /** The sentence that is the whole point of the bar. It is printed in BOTH
   *  states, because the reader who is afraid to start needs it before they
   *  press anything and the reader who has started needs it to believe the way
   *  back is real. */
  designLiveKeep: "Either way nothing is lost: your designs stay exactly as you left them, and the stock blog is never edited.",
  designLiveNoneYet: "Start a design below and this is where you will put it live.",
  designSections: "Design sections",
  designLoading: "Loading the design…",
  designLoadFailed: "Could not load the design",
  designSaved: "Design saved",
  designSaveFailed: "Could not save the design",
  designPreview: "Live preview",
  designUnsaved: "Unsaved changes",
  designUnsavedN: "{n} not saved yet",
  // The rail's three rooms, plus the file. The words are the author's own
  // question, not our file layout.
  designGroupLibrary: "Your designs",
  designGroupPage: "The page",
  designGroupLook: "The look",
  designGroupFile: "Keeping",
  designEmptyTitle: "Nothing designed yet",
  designEmptyBody: "Start from one of the finished designs and edit it, or from a blank page. Either way your posts fill it in immediately.",
  designBrowsePresets: "Browse the presets",
  designAllSaved: "Everything saved",
  discardChanges: "Discard",
  designSave: "Save design",
  // Leaving the designer with decisions still in the air — Esc, the ×, or a
  // stray click on the backdrop. The question names the loss, because the
  // panel is the one place in the product where a keystroke used to erase an
  // afternoon's work silently.
  closeUnsavedTitle: "Close without saving?",
  closeUnsavedBody: "Your unsaved changes will be discarded.",

  designTabNav: "Navigation",
  designTabNavIntro: "Build the menu by hand: pages, notes, topics and links, in the order you choose.",
  designTabPages: "Pages",
  designTabPagesIntro: "Static pages are ordinary notes marked as pages — they leave the post feed and keep their own address.",
  designTabType: "Typography",
  designTabTypeIntro: "Size, scale, measure and rhythm. Every control is bounded to values that stay readable.",
  designTabChrome: "Header & footer",
  designTabChromeIntro: "Where the identity sits, what follows the reader down the page, and what the footer holds.",
  designTabFile: "Design file",
  designTabFileIntro: "Name this design, export it as JSON, import one, or reset to the stock defaults.",

  designNavEmpty: "No menu items yet — the site falls back to your busiest topics.",
  designAddItem: "Add",
  designNewItem: "New item",
  designHomeLabel: "Home",
  designGroupLabel: "Group",
  designKindHome: "Home",
  designKindNote: "Note",
  designKindPage: "Page",
  designKindTopic: "Topic",
  designKindUrl: "Link",
  designKindGroup: "Submenu",
  designMoveUp: "Move up",
  designMoveDown: "Move down",
  designNest: "Nest under the item above",
  designUnnest: "Lift out of the submenu",
  designHideItem: "Hide from the site",
  designShowItem: "Show on the site",
  designRemoveItem: "Remove",
  designItemLabel: "Label",
  designPickNote: "Note",
  designPickPage: "Page",
  designPickTopic: "Topic",
  designFilterNotes: "Filter notes…",
  designFilterTopics: "Filter topics…",
  designUrl: "URL",
  designNewTab: "Open in a new tab",
  designItemUnpublished: "Not visible to readers yet — publish this note and it appears.",
  designItemBadUrl: "Needs an https:// address or a site path starting with /",
  designItemHidden: "Hidden — kept here, not shown on the site",
  designNavStyle: "How the links are drawn",
  designNavStyleHint: "The bar only — a submenu stays plain, because a dropped card of pills is a control panel.",
  designNavPlain: "Plain",
  designNavPills: "Pills",
  designNavUnderline: "Underline",
  designNavBrackets: "Brackets",
  designNavFallback: "When the menu is empty",
  designNavFallbackHint: "The stock rule: your busiest published topics.",
  designFallbackTopics: "Show topics",
  designFallbackNone: "Show nothing",
  designShowSearch: "Search box",
  designShowTheme: "Theme switch",
  designShowLang: "Language switch",
  designShowLangHint: "Only where the instance offers one.",

  designPagesHow: "A page is an ordinary note whose frontmatter carries both flags:",
  designPagesEffect: "It then leaves the post feed and RSS, keeps its own clean address, and can be added to the menu above.",
  designNoPages: "No pages yet.",
  designPagesCount: "{n} published pages.",

  designTypeBase: "Body size",
  designTypeScale: "Heading scale",
  designTypeMeasure: "Line length",
  designTypeLine: "Line height",
  designTypeWeight: "Heading weight",
  designTypeTracking: "Heading tracking",
  designTypeRhythm: "Section rhythm",
  designHeadingCase: "Heading case",
  designCaseNormal: "Normal",
  designCaseSmall: "Small caps",
  designCaseUpper: "Uppercase",
  designHeadingFamily: "Heading face",
  designBodyFamily: "Body face",
  designFamilyHint: "Which of the instance's three stacks — pick the faces themselves in Settings → Site.",
  designSerif: "Serif",
  designSans: "Sans",
  designMono: "Mono",
  designFacesSection: "The faces",
  designHeadingFont: "Heading typeface",
  designBodyFont: "Body typeface",
  designMonoFont: "Code typeface",
  designFaceInherit: "This instance's own",
  designFaceHint: "A real typeface, ahead of the stack above. Left alone, the role keeps this instance's.",
  designMonoFontHint: "Code in your prose — and any role set to Mono above.",
  designFacesNote: "Arabic stays this instance's own naskh, and a face still downloading falls back to the stack above it.",
  designBoundsNote: "Every slider stops where legibility does: no size, measure or line height here can produce a site a reader cannot read.",

  designSurfaceSection: "The page",
  designSurface: "Ground",
  designSurfaceHint: "The paper the whole site is printed on. It changes no colour and no text stays less readable for it.",
  designSurfaceFlat: "Plain",
  designSurfaceRuled: "Ruled",
  designSurfaceGrid: "Grid",
  designSurfaceTinted: "Tinted",
  designSurfacePaper: "Paper",

  designScenery: "The world",
  designSceneryHint: "What the page is standing in: a field of the theme’s own light behind everything, fixed to the window rather than to the paper. It clears away where the writing is, so no text is less readable for it — which also means a narrow page leaves the world more room, and a phone shows none of it.",
  designSceneryNone: "None",
  designSceneryStarfield: "Stars",
  designSceneryAurora: "Aurora",
  designSceneryHorizon: "Horizon",
  designSceneryTopography: "Contours",
  designSceneryHalftone: "Halftone",
  designSceneryNebula: "Deep field",
  designSceneryFog: "Fog",
  designSceneryMotionNote: "Stars and aurora drift, slowly. A reader whose system asks for less motion sees the same sky, standing still.",

  designShellSection: "The room",
  designShell: "Where the chrome lives",
  designShellHint: "The biggest choice on this panel: whether the menu sits above the writing, beside it, or floats over it. Everything else on the page is the same in all five.",
  designShellStack: "Above",
  designShellRail: "Side rail",
  designShellDock: "Floating bar",
  designShellSplit: "Fixed panel",
  designShellConsole: "Console",
  designShellPhoneNote: "A phone has no room for a side column, so all five read as “Above” there. The design still arrives as its type, its ground and its world.",

  designFrame: "Blocks",
  designFrameHint: "What a card, a call to action or a band is sitting in.",
  designFramePlain: "Plain",
  designFrameWindow: "Windows",
  designFrameFloat: "Floating",

  designOrnament: "Mark",
  designOrnamentHint: "The glyph a divider signs itself with, on this design’s pages.",
  designOrnamentAsterism: "Asterism",
  designOrnamentStar: "Star",
  designOrnamentBurst: "Burst",
  designOrnamentMoon: "Moon",
  designOrnamentLozenge: "Lozenge",
  designOrnamentFleuron: "Fleuron",

  designHeaderSection: "Header",
  designHeaderLayout: "Identity",
  designLayoutStacked: "Centred",
  designLayoutStart: "Aligned",
  designLayoutInline: "One row",
  designLayoutRule: "Ruled",
  designLayoutBanner: "Banner",
  designHeaderDensity: "Height",
  designDensityCompact: "Compact",
  designDensityRegular: "Regular",
  designDensityTall: "Tall",
  designSticky: "Follows the reader",
  designStickyHint: "What stays on screen while the page scrolls.",
  designStickyNone: "Nothing",
  designStickyNav: "The menu",
  designStickyHeader: "The header",
  designShowLogo: "Logo",
  designShowLogoHint: "Uses the logo set in Settings → Site.",
  designShowName: "Site name",
  designShowTagline: "Tagline",
  designDivider: "Hairline under the header",

  designFooterSection: "Footer",
  designFooterForm: "Form",
  designFooterFormHint: "The same columns, set three ways. A colophon and a big-type ending run them together as one line.",
  designFormColumns: "Columns",
  designFormColophon: "Colophon",
  designFormGrand: "Big name",
  designFooterEmpty: "No columns yet.",
  designColumn: "Column",
  designColumnTitle: "Column heading",
  designRemoveColumn: "Remove column",
  designAddColumn: "Add a column",
  designAddEntry: "Add",
  designEntryLink: "Link",
  designEntryText: "Text",
  designEntrySocial: "Social",
  designNetwork: "Network",
  designCopyright: "Copyright line",
  designCopyrightHint: "{year} and {siteName} are filled in. Empty keeps the instance's own footer line.",
  designShowCopyright: "Show the copyright line",
  designFooterAlign: "Alignment",
  designAlignStart: "Leading edge",
  designAlignCenter: "Centred",
  designShowRss: "RSS link",
  designShowHint: "Search hint",
  designShowPowered: "Powered-by line",

  designName: "Design name",
  designNameHint: "Travels with the exported file — how you will recognise it later.",
  designUnnamed: "Unnamed design",
  designExport: "Export JSON",
  designImport: "Import JSON",
  designImported: "Design imported",
  designImportFailed: "That file is not a valid design",
  designImportTooBig: "That file is too large — a design is at most {n} MB",
  designReset: "Reset to stock",
  designResetTitle: "Reset the design?",
  designResetBody: "Every design choice returns to the stock defaults. The public site itself is not switched.",
  designResetConfirm: "Reset the design",
  designFileNote: "The design is kept even while the public site is on the stock blog, so switching between them loses nothing.",

  designSpecimenTitle: "A page of your site",
  designSpecimenLead: "This is how your prose will read: the size, the measure, the line height and the rhythm between blocks, all at once.",
  designSpecimenH2: "A second-level heading",
  designSpecimenH3: "A third-level heading",
  designSpecimenBody: "Headings step by the scale you chose, so the hierarchy holds at every size — an h3 can never outgrow the h2 above it.",

  // ── The composer: the design store, the section list, the field editors ──
  // B2's reorderable list and B1's eight section kinds meet here. The `dsn*`
  // rows are the LIST's own controls (each names the row it acts on, because
  // "Move up" alone is nine identical buttons to a screen reader); the `dso*`
  // rows are the per-section fields.
  dsnMoveUp: "Move up",
  dsnMoveDown: "Move down",
  dsnMoveUpOf: "Move {name} up",
  dsnMoveDownOf: "Move {name} down",
  dsnShowOf: "Show {name}",
  dsnRemove: "Remove",
  dsnRemoveOf: "Remove {name}",
  dsnShown: "Shown",
  dsnHidden: "Hidden",
  dsnAlwaysShown: "always shown",

  // The board's grip: a drag with a keyboard on it. The help line is
  // `aria-describedby` on every grip AND visible under the list — a gesture
  // nobody is told about is a gesture nobody uses.
  dsnGrabOf: "Reorder {name}",
  dsnDragHelp: "Drag a row by its grip — or focus one and press Space, move with the arrows, Space again to set it down.",
  dsnLifted: "{name} lifted — arrows move it",
  dsnMovedTo: "{name} is now {n} of {total}",
  dsnEmptyTitle: "An empty page, waiting",
  dsnEmptyBody: "A home page is a stack of sections: an opening panel, a grid of posts, a river of writing, the topics you keep returning to. Add the first one.",
  dsnPickerLead: "Each one lands at the bottom of the page, where you can move it.",
  dsnFull: "That is every section a design may hold — remove one to add another.",

  designTabDesigns: "Designs",
  designTabDesignsIntro: "Every design this instance holds. One is active; switching between them changes nothing on disk, so a design you turn off is a design you can turn back on unchanged.",
  designTabSections: "Sections",
  // The REORDERING instructions live under the list, on `dsnDragHelp`, beside
  // the grips they describe — so this line says what the tab is and stops.
  designTabSectionsIntro: "What the home page is made of, top to bottom. Open a row to edit what it shows.",
  designNew: "New design",
  designNewTitle: "New design",
  designCreate: "Create",
  designCreated: "Design created.",
  designActive: "Active",
  designActivate: "Make active",
  designActivated: "Design activated.",
  designDuplicate: "Duplicate",
  designDuplicated: "Design duplicated.",
  designDeleted: "Design deleted.",
  designDeleteTitle: "Delete this design?",
  designDeleteBody: "“{name}” will be removed from this instance. The stock blog is unaffected either way.",
  /** `designNoneYet` lived here and said "No design yet. Make one — …". The
   *  verb came out of the sentence when "Make one" became a real button under
   *  it (F41): a line that tells the reader to do something, beside a control
   *  that does it, says the same thing twice. */
  designNoneYetBody: "No design yet — until you make one, the public site is the stock blog.",
  designMakeOne: "Make one",
  designOpenSection: "The design you are editing",
  designTheme: "Theme",
  designThemeHint: "Forced on readers who have not chosen one of their own. A design is a look, and a look is a theme plus a layout.",
  designThemeInherit: "Site default",
  designThemeInheritNote: "The reader's own",

  dsoHintHero: "A big opening block",
  dsoHintRichText: "Your own markdown",
  dsoHintNote: "One note from the vault",
  dsoHintPostGrid: "Posts as cards",
  dsoHintPostList: "Posts as a list",
  dsoHintTopics: "The tags you write about",
  dsoHintCta: "A line and a button",
  dsoHintDivider: "A rule, a mark, or air",

  dsoHeading: "Heading",
  dsoHeadingHint: "Leave empty for none",
  dsoNoHeading: "no heading",
  dsoHeroHeadingHint: "Empty uses the site name",
  dsoHeroSiteName: "the site name",
  dsoSub: "Subtitle",
  dsoImage: "Image",
  dsoImageHint: "An https URL or a vault path",
  dsoAlign: "Alignment",
  dsoAlignStart: "Start",
  dsoAlignCenter: "Centre",
  dsoHeight: "Height",
  dsoHeightShort: "Short",
  dsoHeightTall: "Tall",
  dsoTreatment: "Treatment",
  dsoTreatmentHint: "A band needs no picture; a split sets the words beside one; a cover runs a photograph the full width of the window",
  dsoTreatmentPanel: "Panel",
  dsoTreatmentBand: "Band",
  dsoTreatmentSplit: "Split",
  dsoTreatmentCover: "Cover",
  dsoMarkdown: "Markdown",
  dsoMarkdownHint: "Rendered by the same renderer a note is — wikilinks, callouts and all.",
  dsoNote: "Note",
  dsoNoteHint: "A note that is later deleted or unpublished drops visitors to the stock blog and tells you which section.",
  dsoFilterNotes: "Filter notes…",
  dsoFilterTags: "Filter tags…",
  dsoExcerpt: "First paragraph only",
  dsoExcerptHint: "With a link through to the note",
  dsoTag: "Tag",
  dsoAllPosts: "Every post",
  dsoLimit: "How many",
  dsoPosts: "posts",
  dsoTopics: "topics",
  dsoColumns: "Columns",
  dsoCard: "Card",
  dsoCardHint: "What one post looks like",
  dsoCardBoxed: "Boxed",
  dsoCardBare: "Bare",
  dsoCardOverlay: "Overlay",
  dsoCardLedger: "Row",
  dsoCardMasonry: "Masonry",
  dsoLayout: "Layout",
  dsoLayoutHint: "How the run is set",
  dsoLayoutRiver: "River",
  dsoLayoutLedger: "Ledger",
  dsoLayoutIndex: "Index",
  dsoLayoutNumbered: "Numbered",
  dsoLayoutDateline: "Dateline",
  dsoShowBanner: "Banners",
  dsoShowExcerpt: "Excerpts",
  dsoShowDate: "Dates",
  dsoBody: "Body",
  dsoButton: "Button",
  dsoUrl: "Link",
  dsoUrlHint: "A site path like /topic/essays, or an https URL",
  dsoStyle: "Style",
  dsoStyleRule: "Rule",
  dsoStyleDots: "Dots",
  dsoStyleOrnament: "Ornament",
  dsoStyleBlank: "Air",
  dsoSpace: "Space",
  dsoOn: "On",
  dsoOff: "Off",

  dsnCorruptStore: "designs.json could not be read, so visitors are getting the stock blog. The file is untouched — repair it, or import a design over it.",
  dsoAddSection: "Add a section",
  dsoPageSection: "The page",
  dsoWidth: "Column width",
  dsoWidthHint: "How wide the composed page runs",
  dsoDensity: "Density",
  dsoCompact: "Compact",
  dsoRegular: "Regular",
  dsoRoomy: "Roomy",
  dsoArticleSection: "Article pages",
  dsoArtBanner: "Banner",
  dsoArtMeta: "Date and reading time",
  dsoArtTags: "Tags",
  dsoArtRelated: "Related posts",
  dsoArtBack: "Back link",
  dsoArtDropCap: "Drop cap",
  dsoArtDropCapHint: "An initial cap on the first paragraph. Latin prose only — Arabic letters are joined, and pulling the first one out of its word breaks the joint.",

  designSignature: "Signature styling",
  designSignatureHint: "Art direction for cards, headings and ornaments. Your content and palette stay editable.",
  designSignatureNone: "No extra styling",
  // ── Presets: the gallery chrome ──────────────────────────────────────────
  // A preset's own NAME and BLURB are not here and must not be: they travel
  // inside the preset as { en, ar } data (shared/presets.ts). Fifty of them
  // would be a hundred dictionary rows this gate could only see as dead keys,
  // and adding a preset would mean editing three files instead of one.
  designTabPresets: "Presets",
  designTabPresetsIntro: "Finished designs. Pick one and it becomes an editable copy of your own.",
  presetSearch: "Search presets…",
  presetCount: "{n} designs",
  presetFamilies: "Preset families",
  presetFamAll: "All",
  presetFamSignature: "Signature",
  presetFamEditorial: "Editorial",
  presetFamMinimal: "Minimal",
  presetFamJournal: "Journal",
  presetFamPortfolio: "Portfolio",
  presetFamReference: "Reference",
  presetFamLanding: "Landing",
  presetFamGallery: "Gallery",
  presetFamLetter: "Letter",
  presetBlank: "Start from blank",
  presetBlankHint: "The stock defaults, and nothing else.",
  presetNoMatch: "No preset matches that.",
  presetSampleNote: "Some rows are samples — your own posts fill them in as you publish.",
  presetApply: "Use this design",
  presetFillIn: "A preset ships the shape; the words stay yours. Fill in the opening panel and any button after you apply it.",
  /** WHAT "USE THIS DESIGN" DOES AND, MORE TO THE POINT, WHAT IT DOES NOT DO.
   *  The button used to promise a fork and say nothing about the public site,
   *  so the honest reading of "Use this design" was "replace what my visitors
   *  see" — and the reader who liked their current site simply did not press
   *  it. Both halves are here now, and they are printed where the thumb is
   *  rather than at the foot of a column. */
  presetForkNote: "Applying makes an editable copy — the preset itself never changes. Your public site keeps showing exactly what it shows now until you put a design live, and going back to the stock blog is one click that loses nothing.",
  presetApplied: "Your copy is open — the public site has not changed",
  // The way back out of a preset, and the crumb that says where "back" goes.
  // Two strings rather than one: the button wears the short one and the
  // screen reader is given the whole sentence.
  designWhereLabel: "Where you are",
  presetBack: "All presets",
  presetBackToGallery: "Back to all presets",
  presetPrev: "Previous preset",
  presetNext: "Next preset",
  presetPosition: "{n} of {total}",
  presetPreviewOnly: "Preview — not applied yet",
  presetKeysHint: "Esc goes back to the shelf; ← and → step through it.",

  // ── Preview content: the sample rows a fresh vault is padded with ────────
  // Copy, so it is here; DATA, so it is deliberately generic. These stand in
  // for the author's own posts only until there are enough of them.
  designCanvasLabel: "A preview of the composed site",
  designPreviewHome: "Front page",
  designPreviewArticle: "Article page",

  // ── The preview stage: the device bar over the frame ─────────────────────
  designDevice: "Preview width",
  designDeviceDesktop: "Desktop",
  designDeviceTablet: "Tablet",
  designDevicePhone: "Phone",
  designPreviewWidth: "{w} px wide",
  designZoomFit: "Fit to pane",
  designZoomActual: "Actual size",
  designPreviewFrame: "Live preview of {name}",
  pvTitle1: "On keeping a notebook",
  pvTitle2: "The long walk home",
  pvTitle3: "Notes on a quiet winter",
  pvTitle4: "What the archive remembers",
  pvTitle5: "A short history of margins",
  pvTitle6: "Reading at the speed of light",
  pvExcerpt1: "A sample paragraph, standing in for one of your own posts until you have published a few.",
  pvExcerpt2: "Enough words to show what an excerpt looks like in this design, at this measure, in this type.",
  pvExcerpt3: "Your own writing replaces this the moment there is enough of it to fill the page.",
  pvTag1: "essays",
  pvTag2: "notes",
  pvTag3: "reading",
  pvTag4: "archive",
  pvNoteBody: "A sample note, rendered where this section will render one of your own.",

  // ── Accessibility: names for surfaces that carry no visible label ────────
  // Every string here exists because something on screen is obvious to a
  // reader who can see it and silent to one who cannot: a tree of rows, a
  // canvas, a row of tabs, a bare landmark.
  skipToContent: "Skip to content",
  mainContent: "Main content",
  vaultTree: "Vault files",
  rowActions: "Row actions",
  openTabsAria: "Open notes",
  searchResultsAria: "Search results",
  paletteResultsAria: "Commands and notes",
  resultCount: "{count} results",
  noResultsAria: "No results",
  graphAria: "Vault link graph",
  // ── The graph's own settings panel (client/graphPrefs.ts) ──────────────
  graphSettings: "Graph settings",
  graphReset: "Reset",
  graphSearch: "Find a note…",
  graphColorBy: "Colour by",
  graphColorFolder: "Folder",
  graphColorTag: "Tag",
  graphColorNone: "Links",
  graphFolderDepth: "Folder depth",
  graphDepthTop: "Top level",
  graphDepthSecond: "Two levels",
  graphGroupRoot: "Vault root",
  graphGroupUntagged: "Untagged",
  graphGroupUnmatched: "No query",
  graphHideGroup: "Hide this group",
  graphShowGroup: "Show this group",
  graphPickColor: "Colour for {name}",
  graphFilters: "Filters",
  graphHideOrphans: "Hide notes with no links",
  graphMinLinks: "At least this many links",
  graphForces: "Forces",
  graphRepulsion: "Spread",
  graphLinkDistance: "Link length",
  graphGravity: "Pull to centre",
  graphDisplay: "Display",
  graphNodeSize: "Node size",
  graphEdgeAlpha: "Link opacity",
  graphLabelZoom: "Labels appear at zoom",
  graphGlow: "Glow",
  graphShown: "{shown} of {total} notes shown",
  graphNodesAria: "Graph nodes",
  localGraphAria: "Links around this note — the panel below lists them as text",
  linkedNotesAria: "Linked notes",
  chooseImageFile: "Choose an image file",
  chooseFontFile: "Choose a font file",
  statusBarAria: "Status bar",
  backlinksPanelAria: "Note context",
  siteNav: "Site sections",
  articleContent: "Article",

  // ── Attachments: dropping files, and what a delete really takes ─────────
  // The refusal copy is spoken BEFORE anything is uploaded, so it names both
  // what was turned away and what would have been welcome.
  attachKinds: "images, audio, video and PDF",
  refuseType: "{files} can’t be attached ({exts}) — Astrolabe takes {kinds}.",
  refuseSize: "{files} are over the {max} MB limit.",
  someFilesRefused: "Some files can’t be attached",
  unknownType: "unknown type",
  uploadTheRest: "Upload {files}?",
  upload: "Upload",
  filesAdded: "Added {files} to {folder}",
  /** ONE file, named. A pasted screenshot arrives called "image.png" and is
   *  stored under a dated name the reader never sees typed anywhere — so the
   *  single-file line spends its words on the name rather than on "1 file". */
  fileAdded: "Added “{name}” to {folder}",
  // Covers both reasons a stored name can differ from the dropped one — the
  // folder already held it, or it needed sanitizing — because the reader's
  // question is the same either way: what is it called now?
  savedAsName: "“{from}” was saved as “{to}”.",
  uploadUndone: "Moved {files} to .trash",
  uploadUndoFailed: "Couldn’t undo every upload — check the server log.",
  vaultRoot: "the vault root",
  // A list separator, not a sentence: Arabic uses its own comma (U+060C).
  deleteAttachmentTitle: "Move “{name}” to .trash?",
  dropFilesTitle: "Drop files to attach them here",

  // ── Settings: where new attachments go ──────────────────────────────────
  groupAttachments: "Attachments",
  rowAttachmentLocation: "New attachments",
  hintAttachmentLocation: "Where an upload is written; existing attachments never move.",
  locVaultRoot: "Vault root",
  locSameFolder: "Same folder as the note",
  locSubfolder: "Subfolder of the note’s folder",
  locSpecified: "Specified folder",
  rowAttachmentFolder: "Attachment folder",
  hintAttachmentFolder: "A vault-relative folder, created when it is first needed.",
  hintAttachmentSubfolder: "A folder name; it sits inside the note's own folder.",
  errFolderTraversal: "Must stay inside the vault (no “..”)",
  errFolderAbsolute: "Must be a vault-relative folder",
  errFolderDotfolder: "Dot-folders are invisible to the vault",
  errFolderControl: "Control characters are not allowed",
  // The status bar's live counts. "selected" qualifies the two numbers before
  // it, so it reads as "412 words · 2,310 characters selected" — the word order
  // Arabic wants too, which is why it is a suffix in both and not a prefix
  // hardcoded in JSX.
  statusSelected: "selected",
  // "{sel}" is a bare number, "{total}" a countPhrase ("840 words" / "٨٤٠ كلمة").
  statusWordsOf: "{sel} of {total}",
  statusCarets: "{n} carets",

  // ── The sentence: multi-cursor, comments ─────────────────────────────────
  scComment: "Comment out the selection",
  scSelectNext: "Select the next occurrence",
  scAddCursor: "Add a cursor",
  scAddCursorHow: "Ctrl/Cmd-click",
  scColumnSelect: "Select a column",
  scColumnSelectHow: "Alt-drag",

  // ── Settings → This device ──────────────────────────────────────────────
  tabDevice: "This device",
  shellChangeServer: "Change server or vault…",
  introDevice: "Preferences kept in this browser; each one saves itself on click.",
  groupEditing: "Reading & writing",
  groupThisBrowser: "This browser",
  // The desktop-only group: rows that exist because there is an app around
  // the page — its name, its icon, its launcher entry, its updates.
  groupThisApp: "This app",
  rowUpdates: "Software updates",
  hintUpdates: "It only tells you; nothing is downloaded or installed until you ask.",
  updatesNotify: "Tell me",
  updatesOff: "Off",
  rowVimKeys: "Vim keys",
  rowRelativeLines: "Relative line numbers",
  hintRelativeLines: "With vim keys, the margin counts lines out from the caret.",
  hintVimKeys: "Modal editing: Normal, Insert and Visual keys in the editor.",
  rowAppName: "This app's name",
  hintAppName: "What the tray, the window and the launcher call the app here.",
  rowAppIcon: "This app's icon",
  hintAppIcon: "A square PNG, or an .ico on Windows, kept beside the app's settings.",
  appIconChoose: "Choose an image…",
  appBrandReset: "Back to Astrolabe",
  rowAppLauncher: "Add to the applications menu",
  rowAppLauncherWin: "Add to the Start Menu",
  hintAppLauncher: "A launcher entry with the name and icon above; rerun after changing either.",
  appLauncherInstall: "Write the launcher entry",
  appLauncherInstallWin: "Create the shortcut",
  appLauncherDone: "Written: {where}",
  appLauncherPngIcon: "Shortcut created with the app's own icon — pick an .ico for your own.",
  appLauncherFailed: "Could not write the launcher entry.",
  rowPrefsSync: "Settings travel with the vault",
  hintPrefsSync: "Kept in the vault, so every device over it shares them.",
  checkForUpdates: "Check for updates…",
  // The desktop's zoom, in the status bar. Nothing is drawn at 100%.
  zoomChip: "{pct}%",
  zoomChipAria: "App zoom {pct} percent — click for actual size",
  zoomResetTitle: "Actual size (Ctrl/Cmd 0)",
  versionTitle: "Astrolabe {v} — the releases page",
  versionAria: "Version {v}",
  hintSelToolbar: "Formatting buttons appear over text you select.",
  rowHeadingNumbers: "Numbered headings",
  hintHeadingNumbers: "Numbers sections in the reading view; a note can override it.",
  // The French switch: what it corrects, in one breath, and the one fact a
  // person needs before trusting a thing that edits their words — that a
  // single undo takes each correction back.
  rowFrenchAutocorrect: "Auto-correct French",
  rowSpellDicts: "Browser dictionaries",
  hintSpellDicts: "Which languages this browser spellchecks; an unticked language is left alone.",
  moreSpellDicts: "A French or Arabic line is checked only in a language you tick here — otherwise it is left alone rather than underlined against English. Chrome: Settings → Languages → Spell check.",
  spellDict_fr: "French",
  spellDict_ar: "Arabic",
  spellDict_he: "Hebrew",
  spellDict_fa: "Persian",
  /** A dictionary toggle's visible words: WHICH language, then its state.
   *  Four toggles reading only "Off" were four identical controls. */
  spellDictToggle: "{lang}: {state}",
  hintFrenchAutocorrect: "Fixes missing accents and French spacing as you type; one undo takes it back.",
  moreFrenchAutocorrect: "On lines written in French: missing accents (tres → très, coeur → cœur), the space before ; : ! ? and inside « », and … for three dots. Ctrl/Cmd Z undoes one correction.",

  // ── Settings → tab names that had none ──────────────────────────────────
  tabLanguage: "Language & dates",
  introLanguage: "What the site speaks, and how it writes dates and tags.",
  tabVault: "Vault",
  introVault: "Which folders this instance writes templates, uploads and tag pages into.",

  // ── Settings → the ⓘ disclosure (replaces the badge and the env line) ────
  // `envDecidedBy` and `envOverridden` are SPLIT on {env}, not interpolated by
  // tf(): the variable name takes the mono face and its own <bdi>, which one
  // text run cannot do. Keep the placeholder in both languages.
  envDisclose: "Environment variable",
  moreDisclose: "Details",
  offlineClearTitle: "Clear the offline copy?",
  offlineClearBody: "The notes kept for reading without a network are removed from this browser.",
  envDecidedBy: "This field is empty, so {env} decides.",
  envOverridden: "Saved here, so {env} is ignored until you clear it.",
  envCopyLine: "Copy as .env line",

  // ── Menu titles ──────────────────────────────────────────────────────────
  menuFile: "File",
  menuEdit: "Edit",
  menuView: "View",
  menuGo: "Go",
  menuWindow: "Window",
  menuHelp: "Help",
  // New here.
  menuNewWindow: "New window",
  menuOpenVault: "Open vault…",
  menuRecentVaults: "Recent vaults",
  menuClearRecent: "Clear the list",
  menuNoRecent: "No vaults yet",
  menuRevealVault: "Show the vault in the file manager",
  menuCloseWindow: "Close window",
  menuQuit: "Quit Astrolabe",
  menuRedo: "Redo",
  menuCut: "Cut",
  menuCopy: "Copy",
  menuPaste: "Paste",
  menuPastePlain: "Paste as plain text",
  menuSelectAll: "Select all",
  menuFindInPage: "Find in page…",
  menuFindNext: "Find next",
  menuFindPrevious: "Find previous",
  menuSpelling: "Spelling",
  menuSpellcheckWhileTyping: "Check spelling while typing",

  // ── The spelling menu Astrolabe draws itself ────────────────────────────────
  menuAddToDictionary: "Add to dictionary",
  menuNoSuggestions: "No suggestions",
  menuActualSize: "Actual size",
  menuFullScreen: "Full screen",
  menuReload: "Reload",
  menuDevTools: "Developer tools",
  menuCommandPalette: "Command palette…",
  menuSearchNotes: "Search notes…",

  // ── Window ───────────────────────────────────────────────────────────────
  menuMinimize: "Minimize",
  menuZoomWindow: "Zoom",
  menuBringAllToFront: "Bring all to front",
  // The reference window: a second, always-on-top window on ONE note, for the
  // source you are quoting while you write in the window behind it. It is the
  // clearest thing a desktop app can do that a browser tab cannot.
  menuReferenceWindow: "Open as reference window",
  menuAlwaysOnTop: "Always on top",

  // ── Help ─────────────────────────────────────────────────────────────────
  menuShortcuts: "Keyboard shortcuts",
  menuAbout: "About Astrolabe",

  // ── Tray ─────────────────────────────────────────────────────────────────
  menuShowAstrolabe: "Show Astrolabe",

  // ── Dialogs the main process owns ────────────────────────────────────────
  // The vault picker. It is the first thing a first launch shows, so it says
  // what it is asking for rather than "Open".
  dlgChooseVault: "Choose a vault folder",
  dlgChooseVaultButton: "Open this vault",
  // The port moved. This is the ONE message in the desktop app that has to
  // exist: the reader's theme, tabs and folds for this vault are stored per
  // origin, the origin is the port, and a port that had to move is the reader's
  // layout silently reverting to defaults with nothing on screen to explain it.
  dlgPortMovedTitle: "This vault opened on a different port",
  dlgPortMovedBody: "Astrolabe keeps one port per vault ({old}) because your theme, open tabs, folds and pane sizes are stored against it. That port was taken, so this window is on {port} and starts from the defaults. Close whatever is using {old} and reopen the vault to get your layout back.",
  dlgServerFailedTitle: "Astrolabe could not start this vault",
  dlgProbeFailedTitle: "This build of Astrolabe cannot run its own server",
  dlgQuit: "Quit",
  dlgChooseAnother: "Choose another vault…",

  // Annotating: highlights, margin notes, and the six page inks.
  bookNoSelection: "Select a passage first.",
  bookNoHighlightHere: "No marked passage on this page.",
  bookHighlightFailed: "That passage could not be saved.",
  bookHighlightDeleted: "Passage unmarked.",
  bookInkSet: "Ink {ink}",
  bookAnnotations: "Marked passages",
  bookNoAnnotations: "Nothing marked in this book yet.",
  bookMarginNote: "Note in the margin",
  // Citing into a note.
  bookCiteTitle: "Quote into a note",
  bookCiteInto: "Into",
  bookCiteQuoteLabel: "The quotation, as it will be written",
  bookCiteNoTarget: "Open a note to quote into.",
  bookCited: "Quoted into {note}",
  bookCiteFailed: "The quotation could not be written.",
  bookCiteLabel: "{title}, p. {page}",
  bookPassages: "Marked passages",
  bookPassagesTruncated: "Searching the most recent passages only.",
  // A citation whose book has been renamed or has left the vault.
  bookCitationMoved: "This book is filed as “{name}” now.",
  bookCitationRepair: "Repair the link",
  bookCitationRepaired: "The link now points at “{name}”.",
  bookCitationRepairNothing: "No link to “{name}” in this note.",
  bookCitationRepairFailed: "The link could not be repaired.",
  bookCitationLost: "“{name}” is not in this vault any more.",
  // The reader's own key sheet.
  bookKeyHighlight: "Mark the selection (Shift to change ink)",
  bookKeyCite: "Quote it into a note (Shift picks the note)",
  bookKeyMarginNote: "Write a note in the margin",
  bookKeyUnhighlight: "Unmark a passage",
  bookKeyAnnotations: "Marked passages",

  // ── Searching the settings panel ─────────────────────────────────────────
  // The placeholder names what CAN be searched, because the surprising half is
  // the third one: an operator reading a deployment script types SITE_LANG and
  // lands on the row it belongs to.
  settingsSearchPlaceholder: "Search settings",
  settingsSearchNone: "Nothing matches",

  // zathura's shifted pair: j/k for the eye, J/K for the thumb.
  bookKeyPageStep: "Next / previous page",

  // ── The tree, folded and found ───────────────────────────────────────────
  collapseAll: "Collapse all folders",
  expandAll: "Expand all folders",
  tmReveal: "Reveal in the sidebar",

  // ── Software updates (desktop) ───────────────────────────────────────────
  // Toasts, never dialogs: a release is good news arriving at a random moment,
  // and good news does not get to interrupt a sentence. And two clicks, both
  // the reader's: "Download" fetches, "Restart to update" applies, and no
  // sentence here promises anything happening on its own.
  menuCheckUpdates: "Check for updates…",
  updateReady: "Astrolabe {version} is downloaded and verified",
  updateRestart: "Restart to update",
  updateAvailable: "Astrolabe {version} is out",
  updateDownload: "Download {version}",
  updateChipAvailable: "{version} available",
  updateChipAvailableTitle: "Astrolabe {version} is out. Click to download it; nothing is installed until you restart.",
  updateView: "See the release",
  updateDownloading: "Downloading Astrolabe {version}…",
  updateCurrent: "You are on the latest release.",
  updateChipDownloading: "Downloading {version}: {pct}%",
  updateChipReady: "Astrolabe {version} is downloaded and verified. Restart to use it.",
  updateFailed: "Could not check for updates — will try again later.",
  updateDownloadFailed: "The download did not complete. Click “{version} available” to try again.",

  // ── Panes ────────────────────────────────────────────────────────────────
  // The cap said out loud. A split that silently does nothing is indis-
  // tinguishable from a broken key, and this one has a real reason behind it:
  // three columns of two is the largest layout that still has a name.
  paneCapReached: "No room for another pane in this window",
  scSplitPane: "Split the pane",
  scSplitPaneDown: "Split the pane downwards",
  scClosePane: "Close the pane",
  scFocusPane: "Move to the pane above / below",
  // PHYSICAL left and right, in both languages — a reader pressing ← at a grid
  // is pointing at the screen, not reading a list. See paneInDirection().
  scFocusPaneSide: "Move to the pane on your left / right",
  // The tab strip's keys (F12). "Along the strip", not "left/right": the bar
  // mirrors with the reading direction, and next is next in both.
  scStepTab: "Next / previous tab",
  scCloseTab: "Close this tab",

  // ── Several windows, one vault ───────────────────────────────────────────
  // The wording refuses the word "locked". Nothing is locked: the text in this
  // window is intact, it is simply not the copy being saved, and the sentence
  // has to say that before it says anything else.
  leaseElsewhere: "Another window is editing this note",
  leaseTakeOver: "Edit here",
  cmdPopOut: "Open this note in a new window",

  // ── Buffers: the document outliving the pane that shows it ───────────────
  // A save refused because the file changed underneath. The wording has one
  // job, and it is not to describe the mechanism: the reader is mid-sentence
  // and needs to know, in the first four words, that nothing of theirs is gone.
  saveConflict: "{path} changed on disk — your edits are safe, and unsaved",
  // The resolution strip above a diverged editor: what happened, then the
  // two ways out. "Keep mine" leads, because it is the one that loses nothing
  // typed here.
  conflictStrip: "This note changed on disk while you were editing. Your text is intact but not saved.",
  conflictKeepMine: "Keep my version",
  conflictTakeDisk: "Use the disk version",

  // ── The safety net (client/safety.ts, client/lazySurface.tsx) ────────────
  // Four sentences for the four ways this app used to end a session with a
  // WHITE PAGE and no explanation: a render that threw, a code chunk that no
  // longer exists after a redeploy, a promise nobody caught, and a request
  // that hung forever because fetch has no deadline of its own. Every one of
  // them says the same first thing, because it is the only thing a writer
  // cares about at that moment: the words are not gone.
  crashTitle: "Astrolabe stopped drawing",
  crashBody: "Your unsaved notes were sent to the vault. Reload to carry on.",
  crashReload: "Reload",
  newBuildOnServer: "Astrolabe {version} is now on the server; this tab still runs the old build. Reload to catch up.",
  chunkGone: "This part of Astrolabe could not be loaded — it may have been updated while you were here.",
  netTimeout: "The server did not answer in time",
  sessionStale: "Signed out — sign in again to carry on",
  unexpectedError: "Something went wrong — the details are in the browser console",

  // ── The book reader ──────────────────────────────────────────────────────
  // The shelf.
  bookLibrary: "Library",
  bookCloseLibrary: "Close the library",
  bookShelfSearch: "Search the shelf…",
  bookShelfEmpty: "No books in this vault yet. Put a PDF or an EPUB in it and it appears here.",
  bookShelfFailed: "The library could not be read.",
  bookShelfTruncated: "Showing the first {count} books in this vault.",
  bookProgress: "{percent}% read",
  bookPages: "{count} pages",
  // The reader.
  bookLoading: "Opening…",
  bookOpenFailed: "This book could not be opened.",
  bookReaderLabel: "Reading {title}",
  bookClose: "Close the book",
  bookPageOf: "Page {page} of {total}",
  bookZoomPct: "{percent}%",
  bookMatchOf: "{index} of {total}",
  bookNoMatches: "No matches in this book.",
  bookOutline: "Contents",
  bookNoOutline: "This book has no contents page.",
  bookMarkSet: "Mark {name} set at page {page}",
  bookNoMark: "No mark {name} in this book",
  bookForgot: "Reading position forgotten.",
  bookInvertOff: "Night mode off",
  bookInvertNight: "Night mode — figures kept",
  bookInvertFlip: "Night mode — everything inverted",
  bookCommandLabel: "Reader command",
  bookCommandPlaceholder: "Type a command — help lists them",
  bookSearchLabel: "Search in this book",
  bookSearchPlaceholder: "Search in this book…",
  bookUnknownCommand: "Unknown command: {word}",
  // The reader's own key sheet (`?`). Deliberately not part of GROUPS in
  // ShortcutsHelp.tsx: these keys are live only while a book is open, and a
  // global list that describes them everywhere would be a list that lies most
  // of the time.
  bookHelpTitle: "Reader keys",
  bookKeyScroll: "Scroll up and down",
  bookKeyPage: "One screen down (Shift for up)",
  bookKeyFirstLast: "First page / last page",
  bookKeyGoto: "Go to a page by number",
  bookKeyGoPage: "Go to a page or a chapter",
  bookKeyZen: "Zen — the book alone on the screen",
  bookZen: "Zen mode (z)",
  bookGotoTitle: "Go to",
  bookGotoLabel: "Page number, step, percentage or chapter",
  bookGotoPlaceholder: "212, +3, 40%, or a chapter…",
  bookGotoTarget: "Enter goes to page {page}",
  bookGotoChapter: "Enter opens “{title}”",
  bookGotoNoChapter: "No chapter by that name.",
  bookKeySearch: "Search in this book",
  bookKeyNextMatch: "Next / previous match",
  bookKeyOutline: "Contents",
  bookKeyZoom: "Zoom in / out",
  bookKeyFit: "Fit width / fit whole page",
  bookKeyDual: "Two pages side by side",
  bookKeyInvert: "Night mode",
  bookKeyRotate: "Rotate (Shift to go back)",
  bookKeyMarks: "Set a mark / jump to one",
  bookKeyCommand: "Command line",
  bookKeyLibrary: "Back to the library",
  bookKeyClose: "Close the book",
  bookKeyEndSession: "End the reading session and log it to the book's tracker",
  bookKeyHelp: "This list",
  // ── The EPUB reader ──────────────────────────────────────────────────────
  // A second reading surface, for the format that REFLOWS. Its own keys and
  // its own words because it has no pages: everything here that looks like a
  // near-duplicate of a `book*` key above differs in the noun — a chapter
  // rather than a page, type size rather than zoom — and a shelf that said
  // "page 4 of 298" about a book with no pages would be lying in the one
  // place a reader checks.
  epubOpenFailed: "This EPUB could not be opened.",
  epubChapterOf: "Chapter {chapter} of {total}",
  epubChapters: "{count} chapters",
  cmdOpenLibraryHint: "Every book in this vault",
  epubTypeBigger: "Larger type",
  epubTypeSmaller: "Smaller type",
  epubTypeReset: "Reset the type size",
  epubSearchFailed: "The search could not be run.",
  epubCiteAction: "Copy citation",
  epubCiteNothing: "Select a passage first.",
  epubCiteCopied: "Citation copied.",
  epubCiteFailed: "The citation could not be copied.",
  epubKeyChapter: "Next / previous chapter",
  epubKeyFirstLast: "First chapter / last chapter",
  epubKeyType: "Larger / smaller type (also Ctrl/Cmd + and −)",
  epubKeyTypeReset: "Back to the default type size",
  epubKeyCite: "Copy a citation to the selected passage",
  // ── Trackers (```tracker, ```tracker-board) ──────────────────────────────
  // A card in a note is CONTENT, but everything around the author's own words
  // — the status chip, the kind, the units, the empty shelf — is chrome, and
  // an Arabic reader must not meet an English word on their own note.
  trackerStatusPlanned: "Planned",
  trackerStatusActive: "Active",
  trackerStatusDone: "Done",
  trackerStatusPaused: "Paused",
  trackerStatusDropped: "Dropped",
  trackerKindBook: "Book",
  trackerKindGame: "Game",
  trackerKindFilm: "Film",
  trackerKindShow: "Series",
  trackerKindCourse: "Course",
  trackerKindProject: "Project",
  trackerKindHabit: "Habit",
  trackerProgress: "Progress",
  trackerPercent: "{percent}%",
  trackerComplete: "Complete",
  trackerRating: "Rated {value} out of {max}",
  trackerStarted: "Started {date}",
  trackerFinished: "Finished {date}",
  trackerStepUp: "Nudge progress up",
  trackerStepDown: "Nudge progress down",
  trackerBoardEmpty: "Nothing on the shelf yet. Open a fence like this in any note and it appears here.",
  trackerBoardFailed: "The shelf could not be read.",
  // ── The tour: its DOORS, and only its doors ──────────────────────────────
  // Four strings, and the deck's fifteen names and thirty sentences are not
  // among them — they live in client/components/tourCards.ts, in the same
  // `{ en, ar }` shape the fifty-nine presets carry their names in, for the
  // reason written out at the top of that file: the dictionary is first-paint code
  // and every string in it is downloaded by a visitor reading one article.
  // What IS here is exactly what gets painted before the deck exists — the
  // palette row, the empty state's line, the shortcut sheet's footer.
  tourTake: "Take the tour",
  tourHint: "A deck of what this vault can do",
  tourDoor: "See what the vault can do",
  tourFooterLead: "Not sure what to look for?",
  // ── The Media page (client/media/MediaView.tsx) ───────────────────────────
  // The shelves' chrome. The kinds and statuses reuse the tracker's own words
  // above; what is new here is the page, its form and its section heads,
  // which are PLURALS ("Books") and therefore their own keys rather than the
  // card's singular kind label with an "s" glued on — Arabic has no such glue.
  media: "Media",
  mediaTitle: "Open the Media page",
  mediaLead: "What you are watching, playing and reading, each on its own shelf.",
  mediaAdd: "Add media",
  mediaEdit: "Edit",
  mediaDelete: "Delete",
  mediaDeleteTitle: "Delete “{title}” (to the trash)",
  mediaEditTitle: "Edit {title}",
  mediaOpenNote: "Open the note for {title}",
  mediaSectionShow: "Shows",
  mediaSectionGame: "Games",
  mediaSectionBook: "Books",
  mediaSectionFilm: "Films",
  mediaSectionCourse: "Courses",
  mediaSectionProject: "Projects",
  mediaSectionHabit: "Habits",
  mediaSectionOther: "Other",
  mediaFilterAll: "All",
  mediaFilterAria: "Show only",
  mediaEmpty: "Nothing on the shelves yet.",
  mediaEmptyHint: "Add a show, a game or a book and it gets a note of its own, with a progress card inside.",
  mediaFailed: "The shelves could not be read.",
  mediaSoFar: "{count} so far",
  mediaSeason: "Season {n}",
  mediaFormNew: "New media",
  mediaFormKind: "Kind",
  mediaFormTitle: "Title",
  mediaFormTitlePlaceholder: "The name as you know it",
  mediaFormCover: "Cover",
  mediaFormCoverPlaceholder: "A picture in the vault, or an https:// link",
  mediaFormUpload: "Upload a picture",
  mediaFormUploading: "Uploading…",
  mediaCoverTooBig: "That picture is over {mb} MB",
  mediaFormDone: "So far",
  mediaFormTotal: "Total",
  mediaFormNoTotal: "No fixed total",
  mediaFormNoTotalHint: "For hours in a game nobody has timed: the card counts and draws no bar.",
  mediaFormUnit: "Unit",
  mediaFormSeason: "Season",
  mediaFormStep: "Nudge by",
  mediaFormFolder: "Notes in the vault",
  trackerFolderNotes: "Notes in {folder}",
  panelTrackedIn: "Tracked in",
  trackerStepFailed: "The nudge did not save.",
  panelWorkNotes: "Notes of this work",
  panelWorkNoNotes: "No notes in its folder yet.",
  panelOpenTracker: "Open the tracker",
  showTrackerPanel: "Show the tracker",
  hideTrackerPanel: "Hide the tracker",
  mediaFormFolderHint: "A folder of your own notes on this work. The card counts them and opens the folder.",
  mediaFormFolderChoose: "Choose a folder…",
  mediaFormFolderNone: "No folder linked",
  mediaFormFolderClear: "Unlink the folder",
  mediaFolderNotes: "{count} in {folder}",
  mediaLastNote: "Last note",
  panelOpenFolder: "Open the folder",
  slashDrawing: "Drawing",
  slashDrawingDetail: "a canvas beside this note, embedded here",
  treeTrackedAs: "On the shelf as {title}: open its tracker",
  mediaFolderOpen: "Open the notes of {title}",
  mediaFormStatus: "Status",
  mediaFormRating: "Rating",
  mediaFormRatingUnit: "of 10",
  mediaFormStarted: "Started",
  mediaFormFinished: "Finished",
  mediaFormNotes: "Notes",
  mediaFormNotesPlaceholder: "A line or two of impressions. Markdown is fine.",
  mediaCreate: "Add to the shelf",
  mediaTitleRequired: "Give it a title first",
  mediaExists: "A note already exists at {path}",
  mediaAdded: "Added {title}",
  mediaSaved: "Saved {title}",
  mediaSaveFailed: "Could not save {title}",
  // ── Sigils: the daily routine and its log (shared/routine.ts, client/reading/routine.ts, client/routines/).
  //    The keys keep the identifier the code was born with; every VALUE says
  //    Sigils / سِجِلّ (3.16 — Latin sigillum, Arabic sijill, the same root; the
  //    feature was Routines in 3.11–3.14 and Orbits in 3.15, when the word
  //    went to spaced repetition, where things come back around). ──
  routines: "Sigils",
  routinesTitle: "Open Sigils",
  cmdOpenRoutines: "Open Sigils",
  // The hint says what a sigil IS, since the word is new: the palette
  // matches on the hint too, so "daily", "habit" and "log" all find the door.
  cmdOpenRoutinesHint: "view · what you keep every day, and its log",
  routinesLead: "What today asks of you, in one place — tick it off here and the note keeps the day.",
  routinesAdd: "New sigil",
  routinesEmpty: "No sigils yet.",
  routinesEmptyHint: "A sigil is a seal you set on the day — an exercise week, a morning sit, sleep, water — and the log of every day you kept it. Start from a template or draw up your own.",
  routinesFailed: "The sigils could not be loaded.",
  routinesSummary: "{done} of {of} complete today",
  routinesSaveFailed: "“{title}” could not be saved",
  routinesSaved: "“{title}” saved",
  routinesAdded: "“{title}” added to your sigils",
  routinesExists: "A note already lives at {path}",
  // ── Orbits: spaced repetition — its DOORS, and only its doors ─────────────
  // Orbits (المدارات) is the page: a card comes back around on its
  // schedule, which is what the word says. Inside it a deck (مجموعة) is a
  // note and a card (بطاقة) a line. The page replaced Review in 3.16 and
  // took the name the routine page wore in 3.15 (that page is Sigils now).
  // What is here is what gets painted before the surface exists — the
  // status bar's door, the tab's name, the palette's four rows, the Sigils
  // line. The shelf's, the session's, the drawer's and the form's own copy
  // lives in client/orbits/copy.ts, in the tour deck's `{ en, ar }` shape
  // and for the tour deck's reason (see client/components/tourCards.ts):
  // the dictionary is first-paint code, and a hundred strings for a page behind
  // an admin door do not belong in a visitor's first paint. Gated by
  // tests/srsSession.test.ts the way the deck's are.
  orbits: "Orbits",
  orbitsTitle: "Open Orbits",
  cmdOpenOrbits: "Open Orbits",
  cmdOpenOrbitsHint: "view · spaced repetition: your decks and what is due",
  cmdStudyDue: "Study due orbits",
  cmdStudyDueHint: "the first deck with orbits due",
  orbitsNewDeck: "New deck…",
  // The implicit deck — every card outside a deck note — has no note to be
  // named after, so its session tab wears this.
  orbitsEverything: "Everything else",
  cmdNewDeckHint: "a note of front::back lines",
  cmdImportDeck: "Import an Anki deck…",
  cmdImportDeckHint: ".apkg, .csv or .tsv",
  // The line on the Sigils page: "{n}" is a countPhrase ("3 cards" /
  // "٣ بطاقات"); the Arabic ends in it so no adjective has to agree with a
  // count that changes gender at one.
  routinesOrbitsDue: "{n} due",
  // Both halves of the same line when cards AND tasks are due: each is a
  // countPhrase already, joined as one noun phrase for `routinesOrbitsDue`.
  routinesDueBoth: "{cards} and {tasks}",
  addFlashcard: "Make a card",
  // ── Orbits on a sigil card (client/routines/orbits.ts): the chip a slot
  // wears when its text wikilinks a deck note ──
  orbitsChipDue: "{n} due",
  orbitsChipStudy: "Study",
  orbitsChipStudyTitle: "Study {title}",
  // ── Offline reading (client/offline.ts, client/sw.ts, docs/offline.md) ──
  rowOffline: "Offline reading",
  hintOffline: "Keeps the notes you opened readable without a network. Cleared when you sign out.",
  offlineClear: "Clear offline copy",
  offlineCleared: "Offline copy cleared",
  offlineStrip: "Offline",
  offlineStripHint: "Reading this device's copy. Edits are kept and saved when the network is back.",
  routinesTitleRequired: "Give the sigil a name",
  routineFormSlotsPlaceholder: "morning, evening",
  routinesEdit: "Edit",
  routinesDelete: "Delete",
  routinesTemplatesHead: "Your templates",
  routinesPresetsHead: "Start from",
  routinesSaveTemplate: "Save as template",
  routinesTemplateSaved: "Template “{title}” saved under {folder}",
  routineFormNew: "New sigil",
  routineFormEdit: "Edit “{title}”",
  routineFormTitle: "Name",
  routineFormTitlePlaceholder: "Daily exercise",
  routineFormKind: "Kind",
  routineFormKindOwn: "Or your own word",
  routineFormKindHint: "What sort of sigil this is. It picks the glyph and a matching set of suggestions below; the word itself is yours to change.",
  routineFormSlots: "Parts of the day",
  routineFormSlotsHint: "Split each day into parts you plan by — morning, evening — written with commas between them. Leave it empty and each day is one line.",
  routineFormItems: "Every day",
  routineFormItemsHint: "Things asked of you every single day, with commas between them: Fajr, 8 glasses, read 20 pages. Each one becomes a box to tick.",
  routineFormWeek: "What each day asks",
  routineFormWeekHint: "Write what you mean to do on each day, in each part of it. A day you leave empty is a rest day — it never counts against you.",
  routineFormFieldsHint: "Besides ticking boxes, you can write down a few things each day. Tick only what you actually want to record — nothing here is required, and a template's picks are only suggestions.",
  routineFormFieldsCustomHead: "Your own fields",
  routineFormFieldsCustomHint: "Anything the list above does not have. Give it a name, say what kind of value it holds, and it gets its own box on the card and its own column in the log.",
  routineFormFieldAdd: "Add a field",
  routineFormFieldName: "Name",
  routineFormFieldType: "Kind of value",
  routineFormFieldUnit: "Unit",
  routineFormFieldMax: "Out of",
  routineFormFieldRemove: "Remove this field",
  routineFieldTypeNumber: "Number",
  routineFieldTypeNumberHint: "any number, decimals allowed — 62, 84.2",
  routineFieldTypeCount: "Count",
  routineFieldTypeCountHint: "whole things you count — 3 glasses, 20 pages",
  routineFieldTypeScale: "Rating",
  routineFieldTypeScaleHint: "a mark from 1 to a ceiling you choose",
  routineFieldTypeText: "Text",
  routineFieldTypeTextHint: "a line of words",
  routineFieldTypeCheck: "Yes / no",
  routineFieldTypeCheckHint: "a single box: did it happen",
  routineFormTarget: "Target",
  routineFormTargetUnit: "days a week",
  routineFormTargetHint: "How many days a week you mean to complete. The card counts against it: \"3 of 6 this week\". Leave it empty and the card counts the days the plan asks something of.",
  routineFormNotes: "Notes",
  routineFormNotesHint: "Anything you want to remember about this sigil — why you started, the rules you set yourself. Shown under the card.",
  routineFormSave: "Save",
  routineFormCancel: "Cancel",
  routineFormWhere: "Saved as a note under {folder}. Its plan and its log are both in the note — edit them by hand any time.",
  routineFormStartHint: "A template fills the sheet in for you; everything on it stays yours to change. Custom starts from nothing and lets you choose each part yourself.",
  routinesCustom: "Custom",
  routineFormSectionName: "Name and look",
  routineFormSectionDays: "Days and parts",
  routineFormSectionFields: "What to record each day",
  routineFormSectionGoal: "Target and notes",
  routineFormIcon: "Icon",
  routineFormIconHint: "One emoji or a short glyph that stands for this sigil on its card. Pick one, or type your own.",
  routineFormIconOwn: "Or type one",
  routineFormIconNone: "None",
  routineFormBanner: "Banner",
  routineFormBannerHint: "A picture drawn as a strip across the top of the card. A file in the vault, or an https:// link.",
  routineFormBannerPlaceholder: "A picture in the vault, or an https:// link",
  routineFormBannerChoose: "Choose…",
  routineFormBannerRemove: "Remove the banner",
  sigilFieldMinutes: "Minutes",
  sigilFieldMinutesHelp: "How long it took, as a number of minutes.",
  sigilFieldWeight: "Weight",
  sigilFieldWeightHelp: "Your weight that day — a number with a unit.",
  sigilFieldFocus: "Focus",
  sigilFieldFocusHelp: "How focused you were, rated from 1 (scattered) to 5 (fully there).",
  sigilFieldMood: "Mood",
  sigilFieldMoodHelp: "How you felt, rated from 1 (low) to 5 (great).",
  sigilFieldEnergy: "Energy",
  sigilFieldEnergyHelp: "How much energy you had, rated from 1 (drained) to 5 (full).",
  sigilFieldWater: "Water",
  sigilFieldWaterHelp: "How much you drank, as a count of glasses.",
  sigilFieldPages: "Pages",
  sigilFieldPagesHelp: "How many pages you read.",
  sigilFieldHours: "Hours",
  sigilFieldHoursHelp: "How many hours — of sleep, of work — as a number.",
  sigilFieldQuality: "Quality",
  sigilFieldQualityHelp: "How good it was, rated from 1 (poor) to 5 (excellent).",
  sigilFieldNotes: "Notes",
  sigilFieldNotesHelp: "A line of text about the day — what you did, how it went.",
  sigilFieldScaleHelp: "{key}, rated from 1 to {max}.",
  sigilFieldNumberHelp: "{key}, as a number.",
  sigilFieldNumberUnitHelp: "{key}, as a number of {unit}.",
  sigilFieldCountHelp: "{key}, as a count.",
  sigilFieldCountUnitHelp: "{key}, as a count of {unit}.",
  sigilFieldCheckHelp: "{key} — tick it if it happened.",
  sigilFieldTextHelp: "{key}, as a line of text.",
  sigilScaleTitle: "{help} Click a number; click it again to clear.",
  routineKindExercise: "Exercise",
  routineKindHabit: "Habits",
  routineKindMind: "Mindfulness",
  routineKindSleep: "Sleep",
  routineKindWater: "Water",
  routineKindMood: "Mood",
  routineKindReading: "Reading",
  routineKindStudy: "Study",
  routineKindOwn: "Sigil",
  routineUntitled: "Untitled sigil",
  routineStreak: "day streak",
  routineStreakTitle: "{n} complete days in a row",
  routineThisWeek: "this week",
  routineWeekTitle: "{done} of {of} days complete this week",
  routineLastMonth: "last 30 days",
  routineMonthTitle: "{done} of {of} planned days complete in the last thirty",
  routineToday: "Today",
  routineVisiting: "Visiting",
  routineBackToday: "← Today",
  routineRestDay: "Nothing planned — a rest day.",
  routineSkip: "skip",
  routineSkipped: "skipped",
  routineSkipTitle: "Mark as skipped on purpose",
  routinePush: "tomorrow →",
  routinePushed: "pushed",
  routinePushTitle: "Not today: push this to tomorrow. It stays on the list until you tick it, and the tick counts for today.",
  routineCarriedHead: "Owed from earlier days",
  routineCarriedFrom: "from {day}",
  routineNotePlaceholder: "A note on the day…",
  routineHeatAria: "The last twelve weeks, a cell per day; {done} complete days in the last thirty",
  routinePlanTitle: "The week's plan",
  routineDay: "Day",
  routineDone: "Done",
  routineNote: "Note",
  routineLogTitle: "{title} — the log",
  routineLogTitleBare: "The log",
  routineLogEmpty: "Nothing logged yet. Tick a box on the card above and the first line lands here.",
  routineDayComplete: "Complete",
  routineDayPartial: "Partly done",
  routineDayMissed: "Missed",
  routineDayRest: "Rest day",
  routineDayNone: "Not yet",
  weekdayMon: "Mon",
  weekdayTue: "Tue",
  weekdayWed: "Wed",
  weekdayThu: "Thu",
  weekdayFri: "Fri",
  weekdaySat: "Sat",
  weekdaySun: "Sun",
  // ── A course: the second mode of a sigil (shared/routine.ts) ──
  // مسار is the course, خطوة the step, وحدة the unit — the owner's words.
  sigilCourse: "Course",
  sigilCourseWhere: "Step {n} of {of}",
  sigilCourseFinish: "on course to finish {date}",
  sigilCourseFinished: "every step done",
  sigilCourseNothing: "Nothing left on this course.",
  sigilCourseRest: "No step today — a rest day on this course.",
  sigilCourseAhead: "Today's steps are done. The next one waits for tomorrow.",
  sigilCourseMinutes: "{n} min",
  sigilCourseDayBudget: "{n} min today",
  sigilCoursePlanTitle: "The whole course",
  sigilCourseUnitRow: "{done} of {of} done",
  sigilCourseUnnamed: "The steps",
  sigilCourseBands: "The months ahead",
  sigilCourseBand: "{start} – {end}",
  sigilCourseProjected: "projected",
  sigilCourseProjectedNote: "Nothing here is dated in the note. Answer a step late and every one after it moves with it.",
  sigilCourseStepAria: "In {unit}: {text}",
  // ── The form's course half ──
  routineFormMode: "What this sigil is",
  routineFormModeWeek: "A week",
  routineFormModeCourse: "A course",
  routineFormModeHint: "A week asks the same things every Monday. A course is an ordered list of steps: it asks for the next one, and the dates move themselves when you fall behind.",
  routineFormDays: "Days that get a step",
  routineFormDaysHint: "Untick a day and the course steps over it — nothing is owed and nothing counts against you.",
  routineFormCapacity: "Time a day",
  routineFormCapacityPlaceholder: "15 min · sat 45 min · sun 0",
  routineFormCapacityHint: "How long you have. A day takes steps until its time runs out; name a day to give it its own. Leave it empty and each day takes exactly one step.",
  routineFormSectionCourse: "The course",
  routineFormSteps: "The steps",
  routineFormStepsHint: "One step a line, opening with «-». A line opening with «#» names the unit the steps under it belong to. Put the minutes a step wants in brackets at the end: (45 min).",
  routineFormStepsCount: "{steps} in {units}",
  routineFormStepsFinish: "starting today, the last step lands on {date}",
  routineFormStepsNone: "No steps yet.",
  slashRoutine: "Sigil",
  // ── Reading pace (shared/tracker.ts paceProjection) ──
  trackerPaceDoneBy: "{pace} a day — done by {date}",
  trackerPaceNeeded: "{pace} a day to finish by {date}",
  mediaFormPace: "Pace",
  mediaFormPaceUnit: "a day",
  mediaFormDue: "Finish by",
  routineReadTask: "{n} {unit} of {title}",
  routineReadKey: "Read",
  // ── Reading sessions (shared/readingSession.ts, client/books/session.ts) ──
  // "{pages}" arrives as countPhrase(n, "pages") and "{time}" as
  // formatDuration(), so the number agrees in Arabic and the hours read as
  // hours; "{note}" is the tracker note's title.
  bookSessionLogged: "Read {pages} in {time} — logged to {note}",
  bookSessionNoTracker: "Read {pages} in {time} — no tracker names this book",
  bookSessionTrackIt: "Track it",
  bookSessionTracked: "Tracking {title} in {path}",
  bookSessionFailed: "The session could not be logged",
  bookSessionUndone: "Session taken back",
  bookSessionEnd: "End session",
  bookSessionEndTitle: "Log the pages read so far and start afresh",
  bookSessionTimer: "Reading {time}",
  bookSessionPaused: "Paused",
  bookSessionNone: "No session to end — turn a page first",
  trackerSpeedLeft: "about {speed} pages a minute here — {left} left",
  durationHours: "{h} h {m}",
  durationHoursOnly: "{h} h",
  durationMinutes: "{m} min",
  // ── Highlights → note (shared/highlightsNote.ts) ──
  bookHighlightsToNote: "Highlights → note",
  bookHighlightsToNoteTitle: "Write every marked passage into a note beside the PDF, a heading per chapter",
  bookHighlightsNone: "Nothing marked in this book yet",
  bookHighlightsWritten: "{count} written to {note}",
  bookHighlightsOpen: "Open",
  bookHighlightsFailed: "The highlights note could not be written",
  bookHighlightsLead: "Every passage marked in [[{book}]]. What sits between the two markers is rewritten each time you run Highlights → note; anything outside them is yours.",
  bookHighlightsNoteSuffix: "Highlights",
  // ── The weekly review (shared/weekReview.ts, client/review/) ──
  reviewWeek: "The week in review",
  cmdReviewWeek: "Review the week",
  cmdReviewWeekHint: "Pages, sigils, cards and notes — this week, on one printable page",
  routinesReviewWeek: "The week ends today.",
  reviewWeekOf: "{start} to {end}",
  reviewPrint: "Print",
  reviewPrev: "Previous week",
  reviewNext: "Next week",
  reviewThisWeek: "This week",
  reviewBooks: "Reading",
  reviewBooksNone: "No sessions this week. A session is logged when you close a book in the reader.",
  reviewBookRow: "{pages} in {time}, {sessions}",
  reviewBookSpeed: "{speed} a minute",
  reviewTotals: "{pages} in {time} in all",
  reviewTrackers: "Where each work stands",
  reviewTrackersNone: "No active trackers.",
  reviewTimeLeft: "{left} left at your pace",
  reviewSigilRow: "{done} of {of} days · streak {streak}",
  reviewSigilsNone: "No sigils yet.",
  reviewOrbitsRow: "{graded} graded on {days}, {retention}% kept",
  reviewOrbitsDeck: "{graded}, {retention}% kept",
  reviewOrbitsNone: "No cards graded on this device this week.",
  reviewOrbitsDevice: "From this device's own log; grades given elsewhere are not counted here.",
  reviewNotesCreated: "Written this week",
  reviewNotesEdited: "Most edited",
  reviewNotesNone: "No notes written this week.",
  reviewMore: "and {count} more",
  reviewLoading: "Adding the week up…",
  reviewFailed: "The week could not be read.",
  reviewNotStored: "Nothing on this page is stored. It is computed from your notes, your trackers, your sigil logs and this device's Orbits log, each time it opens.",
  routineFormBook: "A book you are tracking",
  routineFormBookHint: "The tracker's title. The day gains \"Read N pages of it\" at the tracker's pace, and a tick moves the tracker.",
  // ── Tags pane, bookmarks, layouts (3.13.0) ──
  tagsSortByCount: "Sort tags by count",
  tagsSortByName: "Sort tags by name",
  tagsOpenBranch: "Show the tags under {tag}",
  tagsCloseBranch: "Hide the tags under {tag}",
  bookmarks: "Bookmarks",
  bookmarksHint: "Kept in Bookmarks.md at the vault root — readable anywhere, synced with the vault. Drag to reorder.",
  showBookmarks: "Show bookmarks",
  hideBookmarks: "Hide bookmarks",
  cmdBookmarkNote: "Bookmark this note",
  cmdUnbookmarkNote: "Remove bookmark",
  cmdBookmarkHint: "Kept in Bookmarks.md, above the tree",
  bookmarkAdded: "Bookmarked",
  bookmarkRemoved: "Bookmark removed",
  bookmarkFailed: "Bookmarks.md could not be written",
  // A search row (a code span in Bookmarks.md) runs its query in the box.
  bookmarkRunSearch: "Search: {query}",
  cmdSaveLayout: "Save layout as…",
  cmdSaveLayoutHint: "Panes, tabs and splits under a name — shared with the desktop app",
  cmdRestoreLayout: "Restore a layout…",
  cmdRestoreLayoutHint: "Swap the whole arrangement for a saved one",
  cmdLoadLayout: "Load layout: {name}",
  cmdLoadLayoutHint: "Restore this saved arrangement",
  layoutSaved: "Layout “{name}” saved",
  layoutRestored: "Layout “{name}” restored",
  layoutDeleted: "Layout “{name}” deleted",
  layoutFailed: "That layout could not be saved",
  layoutsTitle: "Layouts",
  layoutsEmpty: "No layouts saved yet — Save layout as… in the palette keeps the current arrangement.",
  layoutRestore: "Restore",
  layoutDelete: "Delete",
  // ── Periodic notes (shared/periodic.ts, client/daily.ts) ──
  periodicSection: "Periodic notes",
  periodicRowLabel: "Daily, weekly, monthly and yearly notes",
  periodicRowHint: "The folder they share, and a name and a template for each.",
  periodicFormatNote: "Names take YYYY, MM, DD, ww (the ISO week), [literals] and / for subfolders — always Gregorian, because a file name is an address. Type off to turn a kind off. A template is applied when that period's note is created; empty means the template for new notes.",
  periodicColName: "Name",
  periodicColTemplate: "Template",
  periodKindDay: "Day",
  periodKindWeek: "Week",
  periodKindMonth: "Month",
  periodKindYear: "Year",
  monthlyFormatLabel: "Monthly note name",
  monthlyTemplateLabel: "Monthly note template",
  yearlyFormatLabel: "Yearly note name",
  yearlyTemplateLabel: "Yearly note template",
  cmdMonthlyNote: "This month's note",
  cmdYearlyNote: "This year's note",
  monthlyNotesOff: "Monthly notes are off — set a monthly note name in Settings → Vault",
  yearlyNotesOff: "Yearly notes are off — set a yearly note name in Settings → Vault",
  periodWeekLabel: "Week {n} · {range}",
  // ── Open on launch (shared/launch.ts) ──
  launchSection: "Opening",
  rowLaunch: "Open on launch",
  hintLaunch: "What the app shows first, on top of where you left off.",
  launchResume: "Where I left off",
  launchSigils: "The Sigils page",
  launchOrbits: "The Orbits shelf",
  launchToday: "Today's note",
  launchNote: "A note…",
  rowLaunchNote: "Launch note",
  hintLaunchNote: "The note to open first, by its vault path.",
  // ── The month grid (client/components/CalendarGrid.tsx) ──
  calendar: "Calendar",
  // The Calendar page (client/calendar/CalendarView.tsx): its door in the
  // status bar, its row in the palette and the phone's menu, and the page's
  // own lead and legend. The month was a section at the top of the Sigils
  // page until 3.18.
  calendarPrevMonth: "Previous month",
  calendarNextMonth: "Next month",
  calendarToday: "Back to this month",
  calendarTitleAria: "{month} — back to this month",
  calendarCellNote: "has a note",
  calendarCellLogged: "a sigil or a reading logged",
  // ── The Calendar PAGE (client/calendar/CalendarView.tsx, 3.18) — the
  // month as a place of its own, which the small grid in the sidebar is not.
  calendarTitle: "Open the Calendar",
  cmdOpenCalendar: "Open the Calendar",
  cmdOpenCalendarHint: "view · the month, and what each day held",
  calendarPageLead: "The month, and what each day held.",
  calendarTodayShort: "Today",
  calendarOpenNote: "Open the day's note",
  calendarCreateNote: "Create the day's note",
  calendarSigilDone: "{done} of {of}",
  calendarDeckRow: "{graded} · {kept}% kept",
  calendarReading: "Reading",
  calendarTrackerRow: "{pages} in {time}",
  calendarDayEmpty: "Nothing on this day yet.",
  calendarLoading: "Reading the month…",
  calendarMore: "+{n} more",
  recentlyRead: "Recently read",
  dailyFolderLabel: "Daily notes folder",
  dailyFormatLabel: "Daily note name",
  dailyTemplateLabel: "Daily note template",
  weeklyFormatLabel: "Weekly note name",
  weeklyTemplateLabel: "Weekly note template",
  uniqueFolderLabel: "Unique notes folder",
  uniqueFolderHint: "Where “New unique note” files a note named by the minute.",
  uniqueFormatLabel: "Unique note name",
  uniqueFormatHint: "The daily tokens plus HH, mm and ss; must be finer than a day.",
  cmdNewUniqueNote: "New unique note",
  cmdYesterdayNote: "Yesterday's note",
  cmdTomorrowNote: "Tomorrow's note",
  cmdWeeklyNote: "This week's note",
  cmdPeriodicHint: "From the open daily note when it is one, else from today",
  weeklyNotesOff: "Weekly notes are off — set a weekly note name in Settings → Vault",
  cmdRandomNote: "Random note",
  cmdRandomNoteHint: "Somewhere you have not looked in a while",
  // ── On this day (client/components/OnThisDayPanel.tsx) ──
  onThisDay: "On this day",
  showOnThisDay: "Show on this day",
  hideOnThisDay: "Hide on this day",
  onThisDayAgo: "{n}y ago",
  onThisDayWrote: "you wrote “{title}”",
  onThisDayFinished: "you finished “{title}”",
  // ── Tasks (shared/tasks.ts) ──
  slashTasks: "Tasks",
  tasksTitle: "Tasks",
  tasksCount: "{n} tasks",
  tasksEmpty: "Nothing to do here.",
  tasksFailed: "The tasks could not be loaded.",
  tasksToggleFailed: "That task moved — reload to see it",
  tasksDueToday: "today",
  tasksPriorityHighest: "highest",
  tasksPriorityHigh: "high",
  tasksPriorityMedium: "medium",
  tasksPriorityLow: "low",
  tasksPriorityLowest: "lowest",
  routinesTasksHead: "Due by today",
  // ── Unlinked mentions (client/components/MentionsPanel.tsx) ──
  unlinkedMentions: "Unlinked mentions",
  showMentions: "Show unlinked mentions",
  hideMentions: "Hide unlinked mentions",
  mentionLink: "Link",
  mentionLinkTitle: "Wrap these words as a link to this note",
  mentionLinkAll: "Link all",
  mentionLinked: "Linked from “{title}”",
  mentionsLinkedAll: "{n} mentions linked",
  mentionLinkFailed: "That mention moved — the list was refreshed",
  // ── Query fence (shared/queryFence.ts) ──
  searchOpProp: "by a frontmatter property; prop:author alone means it has one",
  slashQuery: "Query",
  queryAll: "every note",
  queryCount: "{n} notes",
  queryEmpty: "No note answers this query.",
  queryFailed: "The query could not be run.",
  queryColTitle: "Title",
  queryColDate: "Date",
  queryColModified: "Modified",
  queryColTags: "Tags",
  queryColExcerpt: "Excerpt",
  queryColPath: "Path",
  // The timeline view (shared/timeline.ts): rows the fence's `by:` date
  // cannot place gather under this heading rather than vanish.
  timelineUndated: "Undated",
  // ── Footnotes (client/components/FootnotesPanel.tsx, reading/sidenotes.ts) ──
  footnotes: "Footnotes",
  showFootnotes: "Show footnotes",
  hideFootnotes: "Hide footnotes",
  footnoteGoRef: "Go to the reference in the text",
  footnoteGoDef: "Go to the definition",
  footnoteUndefined: "(no definition yet)",
  // ── A page of a book (client/reading/pdfPage.ts) ──
  pdfPageCaption: "{book}, p. {page}",
  pdfPageOpen: "Open the book at page {page}",
  pdfPageAlt: "Page {page} of {book}",
  // ── Diagrams (client/reading/mermaid.ts) ──
  mermaidDiagram: "Diagram",
  mermaidInvalid: "This diagram could not be drawn; its source is shown instead.",
  // ── Block references (shared/blockId.ts) ──
  cmdCopyBlockLink: "Copy link to this block",
  cmdCopyBlockLinkHint: "[[Note#^id]] — mints an id on the caret's paragraph or list item",
  blockLinkCopied: "Link to block copied",
  blockLinkCopyFailed: "The clipboard refused the link",
  blockLinkNoBlock: "Put the caret on a paragraph or a list item first",
  // ── What's new (client/whatsnew/) ──
  whatsnewEyebrow: "What's new",
  whatsnewTitle: "Astrolabe {version}",
  whatsnewNext: "Next",
  whatsnewBack: "Back",
  whatsnewDone: "Got it",
  whatsnewDontShow: "Don't show these after updates",
  whatsnewCount: "{n} of {of}",
  whatsnewManual: "Read more in the manual",
  rowWhatsNew: "What's new after an update",
  hintWhatsNew: "A short tour of each new version, the first time this device opens it.",
  cmdWhatsNew: "What's new in this version",
  cmdOpenMedia: "Open the Media page",
  // ── Note versions ──
  // The timeline's rows for what the vault's own write path kept, beside
  // git's commits. A version's subject is WHY it exists — the reason the text
  // it holds was replaced — because the moment is already the row's first
  // column and a commit-style message would say it twice.
  versionAutosave: "Earlier save",
  versionRestore: "Before a restore",
  versionRename: "Before a link rewrite",
  versionBulk: "Before a replace across the vault",
  noteVersionAria: "Open this version",
  versionKb: "{n} KB",
  versionsOff: "Versions are off — only backup keeps this note's past.",
  versionsOpenSettings: "Open Vault settings",
  versionsEmpty: "No versions yet — the next save keeps the text before it.",
  restoreVersionTitle: "Restore this version?",
  restoreVersionBody: "“{name}” becomes the text it held {when}. What it says now is kept as a version too.",
  restoreVersionConfirm: "Restore",
  restoreVersionUnsaved: "Save the note first — its unsaved edits could not be written",
  versionRestored: "Restored “{name}” to its version from {when}",
  historyNoRepoBeside: "Backup is off — versions stay on this machine; turn it on for history that travels.",
  rowNoteVersions: "Keep note versions",
  hintNoteVersions: "Keeps a history of what each note said before a save. Needs no git.",
  moreNoteVersions: "Forty per note, one per five minutes, in the data directory.",
  // ── PDF search ──
  searchOpIn: "only the shelf's books, or only notes (in:notes)",
  searchKindBook: "Book page",
  searchHitPage: "p. {n}",
  rowPdfSearch: "Search inside books",
  hintPdfSearch: "Reads every PDF on the shelf once, so search answers from its pages.",
  // ── Export ──
  cmdExport: "Export…",
  cmdExportHint: "Notes and files as a ZIP, or a note as HTML",
  exportScope: "What to export",
  exportScopeNote: "This note",
  exportScopeFolder: "A folder",
  exportScopeTag: "A tag",
  exportScopeVault: "The whole vault",
  exportFolder: "Folder",
  exportChooseFolder: "Choose…",
  exportTagPlaceholder: "e.g. reading",
  exportLinks: "Links in the copies",
  exportLinksWiki: "Keep [[wikilinks]]",
  exportLinksRelative: "Standard Markdown links",
  exportLinksHint: "Rewritten in the copies only. A link to a note outside the export stays as written.",
  exportAttachmentsOn: "Included",
  exportAttachmentsOff: "Notes only",
  exportPreview: "{notes}, {files} · {size}",
  exportDownload: "Download ZIP",
  exportHtml: "Export as HTML",
  exportHtmlHint: "One standalone page, with the theme and the pictures inside it.",
  exportNothingOpen: "Open a note first.",
  exportHtmlDone: "Saved {name}",
  exportHtmlFailed: "Could not build the HTML page.",
  exportTooLarge: "Over {gb} GB — export a folder or a tag at a time.",
  exportFailed: "The export could not start.",
  treeExportFolder: "Export folder…",
  // ── Tashkeel & attachments sweep ──
  // The harakat palette (client/editor/harakat.ts). Each mark by its own
  // name in both languages — the English ones are the transliterations every
  // grammar uses, not translations ("opening vowel" is not what anyone calls
  // a fatha).
  tkFatha: "Fatha",
  tkDamma: "Damma",
  tkKasra: "Kasra",
  tkFathatan: "Fathatan (tanwin fath)",
  tkDammatan: "Dammatan (tanwin damm)",
  tkKasratan: "Kasratan (tanwin kasr)",
  tkShadda: "Shadda",
  tkSukun: "Sukun",
  tkDaggerAlif: "Dagger alif (superscript)",
  tkTatweel: "Tatweel (stretch)",
  harakatPalette: "Harakat",
  insHarakat: "Haraka…",
  selGroupArabic: "Arabic",
  stripTashkeelSelection: "Strip diacritics from selection",
  copyWithoutTashkeel: "Copy without harakat",
  copiedWithoutTashkeel: "Copied without harakat",
  cmdStripTashkeel: "Strip diacritics from note",
  cmdStripTashkeelHint: "every haraka and tatweel, one undo step",
  tashkeelStrippedToast: "Diacritics removed — Ctrl/Cmd Z takes them back",
  tashkeelNoneToast: "No diacritics in this note",
  scHarakat: "Harakat palette — a diacritic for the caret, or every letter of the selection",
  // ── Furigana (client/editor/furigana.ts, components/FuriganaPopover.tsx) ──
  // "Furigana" is the word in every language that writes about Japanese; the
  // Arabic transliterates it and the hints say what it is, because a reader
  // of an Arabic instance may well be meeting the word for the first time.
  insFurigana: "Furigana…",
  furiganaTitle: "Furigana",
  furiganaNote: "Per-kanji readings, not a dictionary of words — check before you insert.",
  furiganaModeWord: "One reading for the word",
  furiganaModeChar: "A reading per character",
  furiganaReadingLabel: "Reading for {kanji}",
  furiganaInsert: "Insert",
  furiganaNoKanji: "Select text with a kanji in it first",
  furiganaNoneKnown: "No readings known for these kanji",
  furiganaWritten: "Furigana on {words} — Ctrl/Cmd Z takes it back",
  cmdFurigana: "Add furigana to selection",
  cmdFuriganaHint: "readings written above Japanese characters, from suggestions",
  cmdFuriganaAuto: "Furigana: automatic for selection",
  cmdFuriganaAutoHint: "the first suggested reading over every kanji, no popover",
  // The unused-attachments sweep (client/components/UnusedAttachmentsModal.tsx).
  cmdUnusedAttachments: "Unused attachments",
  cmdUnusedAttachmentsHint: "files no note references — review, then move to .trash",
  unusedTitle: "Unused attachments",
  closeUnused: "Close the unused attachments list",
  unusedHelp: "Nothing here is embedded or linked by a note, or used as a banner, a tracker cover, a folder icon or a site image. Moving is recoverable: everything lands in .trash with an Undo.",
  unusedLoading: "Reading the index…",
  unusedLoadFailed: "Could not list the vault's files.",
  unusedEmpty: "Every file in the vault is used by a note.",
  unusedSelectAll: "Select all",
  unusedTruncated: "Showing the first {shown} of {total} — sweep these and reopen for the rest",
  unusedSelected: "{files} selected · {size}",
  unusedTrash: "Move to trash",
  unusedTrashedToast: "Moved {files} to .trash",
  unusedTrashFailed: "{files} could not be moved",
  unusedRestoredToast: "Restored {files}",
  // ── Ayah & hadith ──
  // The slash rows and their previews; the ayah card's furniture; the hadith
  // card's; the settings row for the corpus folder.
  slashAyah: "Ayah",
  slashAyahDetail: "A verse of the Quran, by reference",
  slashHadith: "Hadith",
  slashHadithDetail: "A hadith from your corpus, by reference",
  ayahSurahDetail: "Surah {n} · {name}",
  ayahSource: "Text: Tanzil",
  ayahSourceTitle: "Uthmani text from the Tanzil Project (tanzil.net)",
  ayahPending: "Loading the verse…",
  hadithChain: "Chain of narration",
  hadithOpenSource: "Open the source note",
  hadithFolderLabel: "Hadith corpus folder",
  hadithFolderHint: "Notes here answer > [!hadith] callouts. Empty means the folder is detected.",
  moreHadithFolder: "Each note carries collection: and number: in its frontmatter. Detected names: \"hadith\", \"Corpus/hadith\", \"أحاديث\".",

  // ── Vault views: the properties shelf, graph groups by query, Nearby ──
  propsShelf: "Properties",
  showProps: "Show properties",
  hideProps: "Hide properties",
  propsOpenValues: "Show the values of {key}",
  propsCloseValues: "Hide the values of {key}",
  propsSearchKey: "Notes that have {key}",
  propsClearFilter: "Clear the {key} filter",
  // The graph's legend: colour the notes a search-box query names.
  graphColorQuery: "Query",
  graphGroupByQuery: "Group by query",
  graphQueryHint: "Notes a query names take its colour; the first query that names a note wins.",
  graphQueryAdd: "Add a query",
  graphQueryPlaceholder: "e.g. tag:physics before:2026",
  graphQueryField: "Query",
  graphQueryRemove: "Remove this query",
  graphQueryColor: "Colour for the query {query}",
  graphQueryNone: "No query matched a note.",
  // ── Ask the vault (docs/ask.md) ──────────────────────────────────────────
  // Meaning search, Related, Suggest links, the answer panel, Settings → Ask.
  cmdAskVault: "Ask the vault…",
  cmdAskVaultHint: "A question answered from your notes, with the passages it used",
  cmdSearchMeaning: "Search by meaning…",
  cmdSearchMeaningHint: "Find passages that say something like it, in either language",
  askTitle: "Ask the vault",
  askPlaceholder: "Ask a question about your notes… Enter to ask",
  askSend: "Ask",
  askAsking: "Asking…",
  askWhereLocal: "{model} answers, on this machine. Nothing leaves it.",
  askWhereRemote: "{model} answers: the question and the passages are sent to Anthropic.",
  askIndexing: "still reading: {done} of {total} notes",
  askReading: "Reading the notes…",
  askCiteOpen: "Source {n}: open {title}",
  askInvalidCites: "The model cited a passage it was not given; that citation was left out.",
  askAnsweredLocal: "Answered by {model}, on this machine",
  askAnsweredRemote: "Answered by {model}, sent to Anthropic",
  askTiming: "first word in {first} s, done in {all} s",
  askSources: "Passages it read",
  askAnother: "New question",
  askCopyAsNote: "Copy as note",
  askCopyTitle: "Save the answer as a note",
  askCopied: "Answer saved to {path}",
  askCopyExists: "A note with that name already exists",
  askCopyFailed: "Could not save the answer",
  askErrOllamaDown: "Ollama is not running on this machine, so meaning search is off. Exact search still works.",
  askErrNoEmbedModel: "The embedding model is not on this machine yet. Settings → Ask names it.",
  askErrPullModel: "{model} is not pulled yet: run ollama pull {model}",
  askErrNoChatModel: "The answering model is not on this machine. Settings → Ask names it.",
  askErrNoKey: "No Anthropic key is stored. Add one in Settings → Ask, or answer locally.",
  askErrAnthropic: "Anthropic did not answer. Check the key and the model in Settings → Ask.",
  askErrChat: "The model stopped before it finished. Try again.",
  askErrEmptyIndex: "The notes are still being read for meaning. Try again in a moment.",
  askErrUnavailable: "Asking the vault is unavailable here.",
  searchMeaningPlaceholder: "Search by meaning…",
  searchMeaningTitle: "Search by meaning",
  searchMeaningToggle: "Search by meaning",
  searchMeaningOn: "Search by meaning instead of by the words",
  searchMeaningOff: "Back to exact search",
  searchMeaningResultsAria: "Meaning search results",
  searchMeaningPending: "Still reading {n} passages; results may be missing some.",
  related: "Related",
  relatedHint: "Notes about the same things as this one, by meaning, from the model on this machine.",
  showRelated: "Show related notes",
  hideRelated: "Hide related notes",
  relatedNone: "Nothing related yet.",
  relatedAllNearby: "Everything related is already under Nearby.",
  suggestLinks: "Suggest links",
  suggestHint: "Passages elsewhere that read like this note and are not linked with it.",
  showSuggest: "Show suggested links",
  hideSuggest: "Hide suggested links",
  suggestNone: "No unlinked passages nearby.",
  suggestLinked: "Inserted {link}",
  suggestLinkFailed: "Could not insert the link",
  suggestLinkTitle: "Insert {link} at the cursor",
  tabAsk: "Ask",
  introAsk: "Which models read your notes for meaning, and which one answers questions about them.",
  rowAskProvider: "Answers come from",
  hintAskProvider: "Ollama keeps everything here; Anthropic sends each question and its passages away.",
  askProviderLocal: "This machine (Ollama)",
  askProviderAnthropic: "Anthropic (off this machine)",
  rowAskChatModel: "Local model",
  hintAskChatModel: "The Ollama chat model that answers questions.",
  rowAskAnthropicModel: "Anthropic model",
  hintAskAnthropicModel: "Used only when answers come from Anthropic.",
  rowAskKey: "Anthropic key",
  hintAskKey: "Kept on this server only; never sent to a browser or synced.",
  phAskKeyNew: "Paste a key (sk-ant-…)",
  askTopKUnit: "passages",
  askKeySetYes: "A key is stored.",
  askKeySetNo: "No key stored.",
  askKeyCleared: "Anthropic key removed",
  askClearKey: "Remove key",
  rowAskEmbedModel: "Embedding model",
  hintAskEmbedModel: "Always local. Changing it re-reads every note once.",
  rowAskTopK: "Passages per answer",
  hintAskTopK: "How many passages the answering model may read.",
  rowAskStatus: "Status",
  hintAskStatus: "What the meaning index has read, and who answers.",
  errAskModel: "A model name like qwen3.5:9b",
  errAskTopK: "A whole number from {min} to {max}",
  askStatOllamaUp: "Ollama is running.",
  askStatModelReady: "{model} is on this machine.",
  askStatRemote: "{model} answers through Anthropic.",
  askStatIndex: "{done} of {total} notes read, {chunks} passages.",
  askReindex: "Read again now",
  // Nearby: related notes by shared vocabulary, in the outline pane.
  nearby: "Nearby",
  showNearby: "Show nearby notes",
  hideNearby: "Hide nearby notes",
  nearbyHint: "Notes that use the same uncommon words and tags as this one, with the two that tie them. No model, nothing leaves the vault.",
  nearbyNone: "Nothing nearby yet.",
  nearbyTerms: "Tied by {terms}",
  // ── Capture (docs/capture.md) ────────────────────────────────────────────
  // The quick-capture sheet, its palette row, the two Settings rows, and the
  // words the bookmarklet says on somebody else's page.
  cmdQuickCapture: "Quick capture",
  cmdQuickCaptureHint: "A line into today's note, without leaving this one",
  captureTitle: "Quick capture",
  capturePlaceholder: "A thought, a task, a line… Enter to capture",
  captureWhere: "Into",
  captureTargetDaily: "Today's note ({name})",
  captureTargetInbox: "Inbox ({name})",
  captureTargetInboxBare: "Inbox",
  captureNoInboxHint: "Pin a second target in Settings → Vault → Capture inbox.",
  captureSend: "Capture",
  capturedTo: "Captured to {name}",
  captureOpenNote: "Open",
  captureFailed: "Could not capture that",
  // ── Voice notes (docs/capture.md "Voice", 3.24.0) ────────────────────────
  // Only the DOORS and the Settings rows: the recorder's own sentences ride
  // in its lazy chunk (client/voice/copy.ts says why). Arabic: تفريغ is what
  // a transcriber does to a recording (تفريغ التسجيل), and the rows say so
  // rather than borrowing "transcription".
  cmdVoiceNote: "Voice note",
  cmdVoiceNoteHint: "Speak; the words land in today's inbox",
  voiceTitle: "Voice note",
  captureVoiceInstead: "Speak instead",
  captureTypeInstead: "Type instead",
  rowVoiceModel: "Voice transcription",
  hintVoiceModel: "The model that turns voice notes into words, run on this machine.",
  moreVoiceModel: "whisper.cpp, on the GPU when there is one. The model downloads into the data directory on first use, never into the vault. Off keeps recordings without words.",
  voiceModelTurbo: "Large turbo, compact (best for Arabic)",
  voiceModelTurboFull: "Large turbo, full precision",
  voiceModelSmall: "Small, compact (for a machine with no GPU)",
  voiceModelOff: "Off — keep recordings only",
  voiceNoteOff: "Recordings are kept and linked from the day's inbox, without words.",
  voiceNoteFirstUse: "Downloads on first use: {size}, into the data directory.",
  voiceNoteFetching: "Downloading the model — {pct}%.",
  voiceNoteReady: "Downloaded, and ready.",
  voiceNoteReadyOn: "Downloaded; last run on {backend}.",
  voiceBackendCpu: "the processor",
  rowVoiceKeepAudio: "Keep voice recordings",
  hintVoiceKeepAudio: "Off deletes a recording once its words have landed.",
  rowVoiceLanguage: "Voice note language",
  hintVoiceLanguage: "Pin a language, or let each recording be heard for what it is.",
  voiceLangAuto: "Detect",
  captureSection: "Capture",
  captureInboxLabel: "Capture inbox",
  captureInboxHint: "A note the quick-capture sheet can drop lines into instead of today's note.",
  moreCaptureInbox: "Ctrl/Cmd Shift D opens the sheet. A vault-relative note path; empty means today's note only.",
  clipperLabel: "Clipper",
  clipperHint: "Drag the button to your bookmarks bar; it saves any page as a note.",
  moreClipper: "On any page, click it to save the page — or just what you have selected — as a note under Clips/. The token inside it lives in the data directory, never in the vault; Renew replaces it and retires every copy handed out.",
  clipperLink: "Clip to {site}",
  clipperDragTitle: "Drag me to the bookmarks bar",
  clipperRenew: "Renew token",
  clipperRenewed: "Token renewed — drag the new button to your bookmarks bar",
  clipperRenewFailed: "Could not renew the token",
  clipperUnavailable: "The clipper is not available on this instance",
  clipperClipped: "Clipped: {path}",
  clipperFailed: "Clip failed",

  // ── Linguistic twins (shared/twins.ts) ──────────────────────────────────
  // One note, two faces — usually two languages, sometimes a long version and
  // a short one. The Arabic here is written as Arabic, not as a gloss of the
  // English: «الوجه الآخر» is what an Arabic writer would call the other side
  // of the same piece, and it reads as a thing rather than as a translation
  // of "twin".
  cmdTwinSwitch: "Switch to twin",
  cmdTwinSwitchHint: "The note's other face, in this same tab",
  cmdTwinBeside: "Open twin beside",
  cmdTwinBesideHint: "Both faces side by side, for translating",
  cmdTwinCreate: "Create twin…",
  cmdTwinCreateHint: "A second file beside this one, the pair declared on both",
  twinCreateTitle: "Create twin",
  twinCreated: "Created {path}",
  twinCreateFailed: "Could not create the twin",
  twinAlready: "This note already has a twin",
  twinBesideFull: "No room for another pane — the twin opened here instead",
  twinSwitchTitle: "Switch to {title}",
  twinStaleTitle: "{title} has not been touched since {when}",
  twinOddTitle: "This pair disagrees: {title} names a different note as its twin",
  twinTabMark: "has another face",
  twinTreeTitle: "Another face: {title}",
  blogOtherFace: "Another face of this note:",
  // ── The phone shell (client/phone/, 3.26.0) ─────────────────────────────
  phTabToday: "Today",
  phTabNotes: "Notes",
  phTabSearch: "Search",
  phTabMore: "More",
  phTabsLabel: "Sections",
  phBack: "Back",
  phTodayNote: "Today’s note",
  phOpenIt: "Open",
  phCreateIt: "Start it",
  phCardsDue: "{n} due",
  phSigilSteps: "Today’s steps",
  phSigilRead: "Read: {book}",
  phPinned: "Pinned",
  phAllNotes: "All notes",
  phFolderEmpty: "Nothing in this folder yet.",
  phFolderGone: "This folder is no longer in the vault.",
  phSort: "Sort",
  phSortAZ: "By name, A to Z",
  phSortZA: "By name, Z to A",
  phSortManual: "My own order",
  phCurrent: "Current",
  phCreate: "Create",
  phUnpublish: "Unpublish",
  phPublishAsk: "Publish “{name}”?",
  phPublishBody: "It becomes readable by anyone with the site’s address.",
  phUnpublishAsk: "Unpublish “{name}”?",
  phUnpublishBody: "Visitors will no longer find it; the note stays in your vault.",
  phPrivate: "Private",
  phSearchCommands: "Find a command…",
  phSearchTags: "Find a tag…",
  phRun: "Go",
  phRooms: "Rooms",
  phVault: "Vault",
  phSite: "Site",
  phSession: "Session",
  phKeyboard: "Keyboard",
  phBackupSync: "Backup & sync",
  phPreviewVisitor: "Preview as a visitor",
  phZen: "Zen",
  phTour: "Take the tour",
  phModeReading: "Reading — tap to edit",
  phModeEditing: "Editing — tap to read",
  phNoteSheet: "Note",
  phActions: "Actions",
  phShare: "Share",
  phLinkCopied: "Link copied",
  phTwinSwap: "Switch to the other face ({there})",
  phTwinCreate: "Create a twin",
  phNoProps: "No properties yet.",
  phPropKey: "Name of the property",
  phPropClear: "Saving an empty value removes this property.",
  phSave: "Save",
  phNext: "Next",
  phKeyBar: "Writing keys",
  phKeyLink: "Link to a note",
  phKeyTag: "Tag",
  phKeyTask: "Task",
  phKeyBold: "Bold",
  phKeyHeading: "Heading",
  phKeyUndo: "Undo",
  phKeyRedo: "Redo",
  phKeyHide: "Hide the keyboard",
  // Round 2 of the phone shell (3.27.0): the decks, the sigils and the media
  // as lists and details, the tag picker, a folder's files, the reader's bar.
  phMore: "More actions",
  phOpenNote: "Open the note",
  phDeckCounts: "{n} · {fresh} new",
  phSigilToday: "{done} of {of} today",
  phSigilGone: "This sigil is no longer in the vault.",
  phTrackerGone: "This work is no longer in the vault.",
  phAllTags: "All tags",
  phTagsForNote: "This note’s tags",
  phTagsAdd: "Add tags",
  phTagAdd: "Add #{tag}",
  phTagFailed: "The tags could not be saved.",
  phFiles: "Files",
  phMoreFiles: "Files not shown here: {n}",
  bookScrub: "Move through the book",
  bookZoomGroup: "Zoom",
  bookFitWidth: "Fit the width",
  bookNightFigures: "Figures kept",
  bookNightAll: "Everything inverted",

  // Feeds and read-later (3.28, docs/feeds.md): the owner's list of other
  // people's feeds, read and kept. Never the blog's own outbound RSS.
  feeds: "Feeds",
  feedsTitle: "Open Feeds — the articles from the feeds you follow",
  cmdOpenFeedsHint: "Unread articles from the feeds in your list, and Keep",
  feedsUnread: "Unread articles",
  feedsKeep: "Keep",
  feedsKeeping: "Keeping…",
  feedsKeptButton: "Kept — keep again",
  feedsKeptMark: "kept",
  feedsKept: "Kept as {path}",
  feedsKeptAlready: "Already kept as {path}",
  feedsKeepFailed: "The article could not be kept.",
  feedsOpenKept: "Open the kept note",
  feedsMarkRead: "Mark read",
  feedsMarkUnread: "Mark unread",
  feedsReadFailed: "The read mark could not be saved.",
  feedsOpenOriginal: "Open the original",
  feedsRefresh: "Check now",
  feedsChecking: "Checking…",
  feedsRefreshFailed: "The feeds could not be checked.",
  feedsOffToast: "Fetching feeds is off — turn it on in Settings → Vault → Feeds.",
  feedsTurnOn: "Turn fetching on…",
  feedsEditList: "Edit the list",
  feedsStatusOff: "Fetching is off: nothing new arrives until you turn it on.",
  feedsEveryMinutes: "Every {n} min",
  feedsEveryHours: "Every {n} h",
  feedsCheckedNow: "checked just now",
  feedsCheckedAgo: "checked {n} min ago",
  feedsFailed: "Feeds could not be loaded.",
  feedsItemFailed: "This article could not be opened.",
  feedsPickHint: "Pick an article — j and k step through them, e marks one read.",
  feedsNoNote: "Your reading list lives in a note, {note}, which is not there yet.",
  feedsStartNote: "Start {note}",
  feedsStartFailed: "The list note could not be made.",
  feedsStarterLine: "One feed address per line inside the block below; add `→ Folder` to choose where a kept article goes, and a line of #tags to tag what you keep from the feed above it.",
  feedsNoFeeds: "{note} names no feeds yet: put their addresses in its ```feeds block.",
  feedsAllRead: "Nothing unread. Everything the feeds brought has been read.",
  feedsNothingYetOff: "Nothing fetched yet — fetching is off.",
  feedsSummaryOnly: "The feed carries a summary only; Keep fetches the whole page.",
  feedsSummaryOnlyOff: "The feed carries a summary only, and fetching is off: Keep keeps the summary.",
  feedsProblems: "Problems in the list",
  feedsProblemNotAnAddress: "Line {line}: not a web address — {text}",
  feedsProblemDuplicate: "Line {line}: already in the list — {text}",
  feedsProblemBadFolder: "Line {line}: that folder cannot be used; kept articles go to Reading — {text}",
  feedsProblemTooMany: "Line {line}: the list holds 200 feeds at most — {text}",
  feedsProblemTagBeforeNothing: "Line {line}: tags with no feed above them — {text}",
  feedsFeedFailed: "{feed} could not be fetched: {error}",
  rowFeeds: "Feeds",
  hintFeeds: "Fetch the feeds your list note names; off, nothing is fetched.",
  moreFeeds: "Network access is opt-in. On, this server asks every feed in the list on git sync's cadence (hourly when sync is off) and keeps what it fetched in its data directory, never in the vault. Keep writes an article into the vault as a private note. The list lives in the note named here, Feeds.md by default. This is not the blog's own RSS.",
  feedsFetchToggle: "Fetch feeds",
  feedsNoteField: "The list's note",
  feedsRowOn: "This server will ask the feeds in the list for new articles over the network.",
  feedsRowOff: "Off: this server asks no feed for anything; the Feeds page shows what was already fetched.",
  uniqueRowLabel: "Unique notes",
  // The import wizard (3.28, docs/import.md).
  cmdImportNotes: "Import notes…",
  cmdImportNotesHint: "From a Notion, Evernote or Obsidian export — previewed first, undoable after",
  treeImportHere: "Import notes here…",
  importDoorsNote: "Importing from Notion, Evernote or Obsidian: the palette’s Import notes…, or a folder’s ⋯ in the sidebar.",
  importTitle: "Import notes",
  importSource: "From",
  importNotion: "Notion",
  importEvernote: "Evernote",
  importObsidian: "Obsidian",
  importNotionHint: "Notion → Settings → Export, as Markdown & CSV or HTML, with subpages: the zip it gives you.",
  importEvernoteHint: "Evernote → a notebook’s ⋯ → Export notebook: the .enex file.",
  importObsidianHint: "The vault’s folder, zipped or picked as it is. The .obsidian settings stay behind.",
  importFile: "The export",
  importChooseZip: "Choose the .zip…",
  importChooseEnex: "Choose the .enex…",
  importChooseFolder: "Choose a folder…",
  importFolderPicked: "A folder: {n}",
  importCap: "{mb} MB at most.",
  importFolder: "Into the folder",
  importFolderHint: "Empty is the vault root. Nothing already there is overwritten.",
  importPickFirst: "Choose the export first.",
  importPreview: "Preview",
  importReading: "Reading the export…",
  importPreviewFailed: "The export could not be read.",
  importWillWrite: "{notes} and {files} into {folder}.",
  importLinks: "{n} rewritten to their new names and places",
  importAttachmentsTo: "Attachments go to {folder}, the vault’s attachments folder",
  importFrontmatter: "Frontmatter: {props} properties, tags on {tags} notes, created dates on {created}, aliases on {aliases}",
  importPublishCleared: "“publish” taken off {n}",
  importPrivate: "Nothing is published: every imported note is private until you publish it.",
  importCollisions: "Names already taken ({n}) — nothing is overwritten:",
  importCollisionExists: "already in the vault",
  importCollisionDuplicate: "twice in the export",
  importSample: "Where the notes land",
  importAndMore: "…and {n} more",
  importSkipped: "Left behind: {n}",
  importBack: "Back",
  importCommit: "Import {n}",
  importWriting: "Writing the notes",
  importProgress: "{done} of {total} written",
  importCommitFailed: "The import stopped; what it wrote can be undone.",
  importDone: "Imported {notes} and {files} into {folder}.",
  importDoneHint: "Undo moves every imported file you have not edited since to the trash.",
  importUndo: "Undo the import",
  importUndoFailed: "The import could not be undone.",
  importUndone: "Undone: {n} moved to the trash.",
  importUndoKept: "Edited since the import, so left where they are: {n}",
  importClose: "Done",
  // Today on the desktop, and the rows the phone's Today gained with it
  // (3.28, client/today/, docs/today.md).
  todayPage: "Today",
  todayDoorTitle: "Today — the day’s note and what the day asks",
  cmdOpenToday: "Open Today",
  cmdOpenTodayHint: "view · the day’s note, sigils, cards and tasks due, on this day",
  launchTodayPage: "The Today page",
  todayTasksDue: "Tasks due",
  todayOverdue: "overdue since {date}",
  todayTaskFailed: "The task could not be ticked.",
  todayNothingAsked: "Nothing is due today: no sigil, no card, no task.",
  todayNoDaily: "There is no note for today yet.",
  todayDailyEmpty: "Today’s note is empty.",
  todayReflectAsk: "How did the day go?",
  todayReflectPlaceholder: "A line or two for today’s note…",
  todayReflectSave: "Keep it",
  todayReflected: "The day, in your words",
  todayReflectFailed: "The reflection could not be written into today’s note.",
  // The Timeline and the year in review (3.28, client/timeline/,
  // shared/yearReview.ts, docs/timeline.md).
  timeline: "Timeline",
  cmdOpenTimeline: "Open the Timeline",
  cmdOpenTimelineHint: "view · the vault by date, newest first",
  timelineEmpty: "Nothing here: no day holds anything this filter keeps.",
  timelineLoading: "Reading the vault by date…",
  timelineKindNote: "Notes",
  timelineKindDaily: "Daily notes",
  timelineKindSigil: "Sigils",
  timelineKindSession: "Reading",
  timelineKindVoice: "Voice",
  timelineKindCapture: "Captured",
  timelineKindPublished: "Published",
  timelineFilters: "Filter the Timeline",
  timelineAllFolders: "Every folder",
  timelineAllTags: "Every tag",
  timelineClear: "Clear the filters",
  timelineMonths: "Months",
  timelineJump: "Jump to a month",
  timelineSigilDone: "{done} of {of}",
  timelineCaught: "{n} captured",
  timelineFromCalendar: "The Timeline",
  cmdYearReview: "Year in review…",
  cmdYearReviewHint: "write · the year added up into Reviews/<year>.md",
  yearReviewAsk: "Which year?",
  yearReviewBody: "Written to Reviews/<year>.md; a second run rewrites only the generated block. The vault holds: {years}.",
  yearReviewConfirm: "Write the review",
  yearReviewBadYear: "A year, in four digits.",
  yearReviewWritten: "The year in review is in {path}.",
  yearReviewFailed: "The year in review could not be written.",
  yearReviewLead: "{year} in review",
  yearReviewGlance: "At a glance",
  yearReviewNotes: "{notes} begun; {words} written in them and the daily notes",
  yearReviewDaily: "{days} with a daily note",
  yearReviewTicks: "{ticks} on the sigils",
  yearReviewCards: "{cards} reviewed on this device",
  yearReviewPages: "{pages} read in {sittings}",
  yearReviewBooks: "{books} finished",
  yearReviewMonths: "Months",
  yearReviewColMonth: "Month",
  yearReviewColNotes: "Notes",
  yearReviewColDaily: "Daily notes",
  yearReviewColTicks: "Sigil ticks",
  yearReviewColCards: "Cards",
  yearReviewColPages: "Pages",
  yearReviewSigils: "Sigils",
  yearReviewSigilLine: "{ticks} · best streak {streak}",
  yearReviewBooksHead: "Books finished",
  yearReviewFinishedOn: "finished {date}",
  yearReviewLinked: "Most linked",
  yearReviewNone: "Nothing this year.",
  // Webmentions and the fediverse (docs/webmentions.md).
  rowWebmentionsAccept: "Accept webmentions",
  hintWebmentionsAccept: "Other sites can tell yours they linked to a post; each awaits your approval.",
  moreWebmentionsAccept: "On, every public page advertises an endpoint at /webmention. A site that links to one of your posts can POST its address there; this server fetches that page (public addresses only, a megabyte, ten seconds), checks it really links to your post, and files it in moderation as a like, a repost, a reply or a mention. Nothing appears on the post until you approve it. A page that stops linking is withdrawn when it is verified again.",
  rowWebmentionsSend: "Send webmentions",
  hintWebmentionsSend: "When you publish, tell the sites a post links to.",
  moreWebmentionsSend: "On, publishing a post, or republishing one that changed, sends a webmention to every other site its text links to that advertises an endpoint. A page that did not change sends nothing again. Only public posts send: never a draft, a template, a library lesson or a post the language filter hides.",
  rowFediverse: "Fediverse",
  hintFediverse: "Let Mastodon and its neighbours follow the blog, like, boost and reply.",
  moreFediverse: "On, the blog is one ActivityPub account that people find by its address. Followers are accepted at once; each new post is delivered to them, an edited one is updated, and an unpublished one is deleted from their timelines. Likes and boosts appear under the post; replies wait in moderation. Set SITE_URL so the address never changes.",
  rowFediverseHandle: "Fediverse name",
  hintFediverseHandle: "The name before the @ that people search for.",
  errFediHandle: "Letters, digits and underscores only, at most 30.",
  sentQueued: "Waiting",
  sentSent: "Sent",
  sentNoEndpoint: "No endpoint",
  sentFailed: "Failed",
  sentSkipped: "Not public",
  sentNone: "Nothing sent yet: the next post you publish with links to other sites will.",
  sentOff: "Off: publishing tells no other site anything.",
  sentShow: "Sent: {count}",
  federationNoOrigin: "This server does not know its public address yet: set SITE_URL, or open these settings once at that address.",
  federationOriginGuessed: "The address was taken from your browser; set SITE_URL to keep it fixed.",
  fediverseOffNote: "Off: no server can find, follow or read the blog as an account.",
  fediverseOnNote: "People find the blog as {address}; {followers} so far.",
  mentionsTitle: "Mentions",
  mentionReplied: "Reply",
  mentionMentioned: "Mention",
  mentionKindWebmention: "Webmention",
  mentionKindFediverse: "Fediverse",
  mentionTypeLike: "Like",
  mentionTypeRepost: "Repost",
  mentionTypeReply: "Reply",
  mentionTypeMention: "Mention",
  mentionVerifyAgain: "Verify again",
  mentionVerifying: "Verifying…",
  mentionVerifiedToast: "The source still links here.",
  mentionWithdrawnToast: "The source no longer links here: the mention was withdrawn.",
  mentionUnreachableToast: "The source could not be reached; the mention stays as it was.",
  mentionVerifyFailed: "Could not verify the mention.",
  // ── Embeds you can pick up ───────────────────────────────────────────────
  // The one menu a picture, a file card, a drawn PDF page or a drawing
  // answers a right-click (or a long press) with — client/embedMenu.ts — and
  // the syntax the `/` menu, the `![[` popup and the palette teach.
  embedCopyImage: "Copy image",
  embedCopyLink: "Copy link",
  embedCopyMarkdown: "Copy as Markdown",
  embedCopyPath: "Copy path",
  embedOpen: "Open",
  embedGoToPageN: "Go to page {page}",
  embedReveal: "Reveal in Files",
  embedSaveAs: "Save as…",
  embedMove: "Move…",
  embedRename: "Rename…",
  embedRemove: "Remove embed",
  embedMenuLabel: "Actions for {name}",
  embedCopyFailed: "Could not copy: the browser refused the clipboard.",
  embedImageCopied: "Image copied.",
  embedLinkCopied: "Link copied.",
  embedMarkdownCopied: "Markdown copied.",
  embedPathCopied: "Path copied.",
  embedRenameTitle: "Rename “{name}”",
  embedMoveTitle: "Move the embed",
  embedMoveTop: "To the top of the note",
  embedMoveEnd: "To the end of the note",
  embedMoveUnder: "Under “{heading}”",
  slashEmbed: "Embed a file",
  slashEmbedSized: "Embed at a width",
  slashEmbedPath: "Image by path",
  embedHelpTitle: "Embed a file",
  embedHelpPlain: "as it is",
  embedHelpWidth: "300 pixels wide",
  embedHelpPath: "standard Markdown, by path",
  embedHelpWhat: "Pictures, PDFs (a card, or one page with #page=42), sounds, video, zip files, drawings, notes and blocks.",
  embedSectionFiles: "Files",
  embedSectionNotes: "Notes",
  cmdInsertEmbed: "Embed a file…",
  cmdInsertEmbedHint: "![[name.png]], ![[name.png|300]] or ![alt](path): pictures, PDFs, sounds, drawings",
} satisfies Record<string, string>;

/** Every dictionary key — the one list both languages must cover. */
export type I18nKey = keyof typeof en;

export default en;
