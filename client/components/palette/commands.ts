// THE COMMAND TABLE, and the two functions that run a row of it. One list for
// both shells: the desktop's palette (CommandPalette.tsx) and the phone's
// Search tab (client/phone/screens/SearchScreen.tsx) both read COMMANDS and
// run a pick through runPaletteCommand / runPalettePrompt. Moved out of
// client/components/CommandPalette.tsx unchanged; that module re-exports all
// of it, so every importer reads the same names from the same place.

import { COPY_BLOCK_LINK_EVENT, FIND_IN_NOTE_EVENT, FURIGANA_EVENT, STRIP_TASHKEEL_EVENT, type FuriganaMode } from "../../editor/bufferBridge.ts";
import { TREE_REVEAL_EVENT } from "../Sidebar.tsx";
import { useStore, type Theme } from "../../state.ts";
import { askOrbits } from "../../orbits/ask.ts";
import { choiceBase, choiceLabel, counterpartChoice } from "../../themes.ts";
import { collectNotes } from "../../editor/links.ts";
import { confirmDeleteNote } from "../deleteFlow.ts";
import { copyNoteLink } from "../../sectionActions.ts";
import { createTwinFlow, openTwinBeside, switchToTwin } from "../../twins.ts";
import { createUniqueNote, uniqueNotePath } from "../../uniqueNote.ts";
import { dailyNotePath, openDailyNote, openPeriodicNote } from "../../daily.ts";
import { duplicateNote } from "../../duplicate.ts";
import { ensureMd, ensureTex } from "../../../shared/noteFormat.ts";
import { insertTableCommand, tableCommand } from "../../tableActions.ts";
import { insertTemplateCommand, newNoteFromTemplateCommand } from "../../templateActions.ts";
import { isNoteBookmarked, toggleBookmark } from "../../bookmarks.ts";
import { moveViaPicker } from "../MovePicker.tsx";
import { openDesigner } from "../design/openDesigner.ts";
import { openExportDialog } from "../../export/door.ts";
import { openThemePicker } from "../ThemePicker.tsx";
import { openTour } from "../../tour.ts";
import { openWhatsNew } from "../../whatsnew/door.ts";
import { panesInOrder, serializeWorkspace } from "../../workspace.ts";
import { popOutNote } from "../../windows/coherence.ts";
import { promptNewDrawing, promptNewFolder } from "../../prompts.ts";
import { putLayout } from "../../api.ts";
import { readWarmth, toggleWarmth } from "../../eyeComfort.ts";
import { runSnapshotNow, runSyncNow, syncSnapshot } from "../../sync.ts";
import { selectionToolbarEnabled, setSelectionToolbarEnabled } from "../SelectionMenu.tsx";
import { t, tf } from "../../i18n.ts";
import { toast } from "../../toast.ts";

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** What a command needs to know to decide whether it applies right now. */
export interface CommandCtx {
  openPath: string | null;
  admin: boolean;
  authProtected: boolean;
  /** Best known publish state of the open note. */
  openPublished: boolean;
  /** Admin currently previewing the public site. */
  preview: boolean;
  /** The focused pane is showing the note rather than editing it — the find
   *  panel is CodeMirror's, and a reading pane has no CodeMirror. */
  reading: boolean;
  /** How many panes the workspace holds. Closing and walking between panes
   *  are offered only once there is a second one to close or walk to. */
  panes: number;
  /** The open note already HAS another face (shared/twins.ts). Two rows turn
   *  on it, in opposite directions: switching and opening beside need a twin,
   *  and "Create twin…" is offered only while there is none — a note may have
   *  at most one. */
  hasTwin: boolean;
}

export interface Command {
  id: string;
  // Label and hint are thunks, not strings: COMMANDS is a module-level table
  // built once at import, while the chrome language can change at runtime.
  // Evaluating them per render keeps both the visible text and the fuzzy-match
  // haystack in the active language.
  label: () => string;
  hint?: () => string;
  /** Commands that need a text argument switch the palette into prompt mode. */
  prompt?: { placeholder: string; initial: () => string };
  /** Shows a color-dot glyph instead of the ⌘ icon. A thunk, not a value:
   *  the one row that carries it previews the theme that is ON right now,
   *  and the table is built once at import. */
  themeDot?: () => Theme;
  available: (ctx: CommandCtx) => boolean;
}

export const COMMANDS: Command[] = [
  {
    id: "new-note",
    label: () => t("newNote"),
    hint: () => t("cmdCreateHint"),
    prompt: { placeholder: "path/to/note.md", initial: () => "" },
    available: ({ admin }) => admin,
  },
  {
    // LaTeX is a first-class note format, not an import path, so creating one
    // belongs beside "New note" rather than behind a rename.
    id: "new-tex-note",
    label: () => t("newTexNote"),
    hint: () => t("cmdCreateHint"),
    prompt: { placeholder: "path/to/paper.tex", initial: () => "" },
    available: ({ admin }) => admin,
  },
  {
    // A drawing is a note that opens in a canvas. The name prompt is the
    // tree's own (it knows the vault's spelling), so this row opens it in
    // the open note's folder rather than asking for a path of its own.
    id: "new-drawing",
    label: () => t("newDrawing"),
    hint: () => t("cmdNewDrawingHint"),
    available: ({ admin }) => admin,
  },
  {
    // The macro package a `.tex` note needs to compile OUTSIDE Astrolabe. It is
    // the promise the whole `\note{…}` syntax rests on, and a promise nobody
    // can find is not one — so it sits in the palette, one search away.
    id: "astrolabe-sty",
    label: () => t("cmdCopyAstrolabeSty"),
    hint: () => t("cmdCopyAstrolabeStyHint"),
    available: () => true,
  },
  {
    id: "daily-note",
    label: () => t("cmdDailyNote"),
    hint: () => dailyNotePath(),
    available: ({ admin }) => admin,
  },
  {
    // A note named by the minute and asked nothing (client/uniqueNote.ts):
    // the door for an idea that has no title yet. The hint is the name it
    // would take right now, the way the daily row's hint is its path.
    id: "new-unique-note",
    label: () => t("cmdNewUniqueNote"),
    hint: () => uniqueNotePath(),
    available: ({ admin }) => admin,
  },
  {
    id: "quick-capture",
    label: () => t("cmdQuickCapture"),
    hint: () => t("cmdQuickCaptureHint"),
    available: ({ admin }) => admin,
  },
  {
    // Ask the vault (docs/ask.md): the question is typed right here and the
    // answer panel opens asking it. Admin-only, like every ask route.
    id: "ask-vault",
    label: () => t("cmdAskVault"),
    hint: () => t("cmdAskVaultHint"),
    prompt: { placeholder: "", initial: () => "" },
    available: ({ admin, preview }) => admin && !preview,
  },
  {
    // The sidebar search in its "meaning" mode, focused.
    id: "search-meaning",
    label: () => t("cmdSearchMeaning"),
    hint: () => t("cmdSearchMeaningHint"),
    available: ({ admin, preview }) => admin && !preview,
  },
  {
    // The same sheet, opened on its recorder (docs/capture.md "Voice").
    id: "voice-note",
    label: () => t("cmdVoiceNote"),
    hint: () => t("cmdVoiceNoteHint"),
    available: ({ admin }) => admin,
  },
  {
    id: "yesterday-note",
    label: () => t("cmdYesterdayNote"),
    hint: () => t("cmdPeriodicHint"),
    available: ({ admin }) => admin,
  },
  {
    id: "tomorrow-note",
    label: () => t("cmdTomorrowNote"),
    hint: () => t("cmdPeriodicHint"),
    available: ({ admin }) => admin,
  },
  {
    id: "weekly-note",
    label: () => t("cmdWeeklyNote"),
    hint: () => t("cmdPeriodicHint"),
    available: ({ admin }) => admin,
  },
  {
    id: "monthly-note",
    label: () => t("cmdMonthlyNote"),
    hint: () => t("cmdPeriodicHint"),
    available: ({ admin }) => admin,
  },
  {
    id: "yearly-note",
    label: () => t("cmdYearlyNote"),
    hint: () => t("cmdPeriodicHint"),
    available: ({ admin }) => admin,
  },
  {
    // THE OTHER FACE (shared/twins.ts). Three rows, one relation: turn this
    // tab over, put the two faces side by side, or write the second one.
    id: "twin-switch",
    label: () => t("cmdTwinSwitch"),
    hint: () => t("cmdTwinSwitchHint"),
    available: ({ hasTwin }) => hasTwin,
  },
  {
    id: "twin-beside",
    label: () => t("cmdTwinBeside"),
    hint: () => t("cmdTwinBesideHint"),
    available: ({ hasTwin }) => hasTwin,
  },
  {
    id: "twin-create",
    label: () => t("cmdTwinCreate"),
    hint: () => t("cmdTwinCreateHint"),
    available: ({ admin, openPath, hasTwin }) => admin && openPath !== null && !hasTwin,
  },
  {
    // A door to a note you did not choose: the vault re-read at random,
    // which is how a well-cited note from two years ago gets read again.
    id: "random-note",
    label: () => t("cmdRandomNote"),
    hint: () => t("cmdRandomNoteHint"),
    available: () => true,
  },
  // Pop the note out into a real second window — same origin, so it shares the
  // session cookie, the theme, the stored workspace and the bus that keeps the
  // two coherent, without being handed any of it. Admin-only and note-gated:
  // there is nothing to pop out of a blog page, and a visitor has no second
  // window to keep in step.
  {
    // A NEW FOLDER HAD EXACTLY ONE DOOR: the (+) in the sidebar header, which
    // is a mouse target on a pane that may be collapsed. The palette is the
    // keyboard's sidebar (v1.8 audit, F19). No `prompt` field — promptNewFolder
    // owns the naming rule, the "creates ideas/…" line and the refusals, and a
    // second field in here would be a second rule.
    id: "new-folder",
    label: () => t("newFolder"),
    hint: () => t("cmdCreateHint"),
    available: ({ admin }) => admin,
  },
  {
    id: "collapse-folders",
    label: () => t("collapseAll"),
    available: ({ admin }) => admin,
  },
  {
    // "Where IS this note?" — the tab's context menu has answered it since the
    // tab bar grew one, and nothing else did: no chord, no palette row, so a
    // reader without a mouse could not ask (v1.8 audit, F19). The bus is the
    // tree's own (Sidebar::TREE_REVEAL_EVENT), which is why this is three
    // lines and not a second walk of the expansion map.
    id: "reveal-in-tree",
    label: () => t("cmdRevealInTree"),
    hint: () => t("cmdRevealInTreeHint"),
    // Not while previewing as a visitor: that sidebar has no folders in it.
    available: ({ admin, openPath, preview }) => admin && !preview && openPath !== null,
  },
  {
    id: "expand-folders",
    label: () => t("expandAll"),
    available: ({ admin }) => admin,
  },
  {
    id: "pop-out",
    label: () => t("cmdPopOut"),
    available: ({ admin, openPath }) => admin && openPath !== null,
  },
  // Templates. Two rows, because they are two different actions on two
  // different objects — one edits the note you are in, the other makes a new
  // one — and collapsing them into "Templates…" would put a mode question in
  // front of both. The hints print the keystrokes, which is the only place
  // outside the Ctrl/Cmd+/ sheet that they appear.
  {
    id: "insert-template",
    label: () => t("cmdInsertTemplate"),
    hint: () => "Ctrl/Cmd Alt T",
    available: ({ admin, openPath }) => admin && openPath !== null,
  },
  {
    id: "new-from-template",
    label: () => t("cmdNewFromTemplate"),
    hint: () => "Ctrl/Cmd Alt Shift T",
    available: ({ admin }) => admin,
  },
  {
    // Ctrl/Cmd+F has opened CodeMirror's search panel since the editor was
    // wired up (editor/setup.ts, searchKeymap) and nothing in the product ever
    // said the word "find" (v1.8 audit, F19). Editor panes only: the panel is
    // CodeMirror's, so in a reading pane this row would be a control that does
    // nothing — the failure this codebase keeps hunting.
    id: "find-in-note",
    label: () => t("cmdFindInNote"),
    hint: () => "Ctrl/Cmd F",
    available: ({ admin, openPath, reading }) => admin && openPath !== null && !reading,
  },
  // PANES GET WORDS. Ctrl/Cmd+\ has split, stacked and closed since v1.6 and
  // every one of those keystrokes was documented only in the shortcuts sheet:
  // a reader who has never pressed the chord has never seen that this app
  // splits at all (v1.8 audit, F19). Four rows rather than one, for the reason
  // the three sidebar-side rows are three rows: each is a finished end state
  // that runs in one keystroke, and a "Panes…" row would put a mode question
  // in front of all four.
  {
    id: "split-pane",
    label: () => t("cmdSplitPane"),
    hint: () => "Ctrl/Cmd \\",
    available: ({ admin }) => admin,
  },
  {
    id: "split-pane-down",
    label: () => t("cmdSplitPaneDown"),
    hint: () => "Ctrl/Cmd Shift \\",
    available: ({ admin }) => admin,
  },
  {
    id: "close-pane",
    label: () => t("cmdClosePane"),
    hint: () => "Ctrl/Cmd Alt \\",
    available: ({ admin, panes }) => admin && panes > 1,
  },
  {
    // The keyboard's pane walk is DIRECTIONAL (Workspace.tsx arrows through
    // live rects), and a palette row has no direction to offer — so this one
    // cycles in layout order instead, which is the gesture a list can honestly
    // make. The hint names the chord that does the richer thing.
    id: "focus-next-pane",
    label: () => t("cmdFocusNextPane"),
    hint: () => t("cmdPaneHint"),
    available: ({ panes }) => panes > 1,
  },
  {
    id: "toggle-graph",
    label: () => t("cmdToggleGraph"),
    hint: () => t("cmdViewHint"),
    available: () => true,
  },
  {
    id: "open-media",
    label: () => t("cmdOpenMedia"),
    hint: () => t("cmdViewHint"),
    available: ({ admin }) => admin,
  },
  // The shelf (client/books/): every PDF and every EPUB in the vault, with
  // where each one was left off. It had no palette row at all until EPUBs
  // arrived, and the omission mattered more then — a `.pdf` is at least a
  // recognisable row in the tree, while somebody who has just put an EPUB in
  // their vault has to be able to ask for "Library" and be taken there.
  {
    id: "open-library",
    label: () => t("bookLibrary"),
    hint: () => t("cmdOpenLibraryHint"),
    available: ({ admin }) => admin,
  },
  {
    id: "open-routines",
    label: () => t("cmdOpenRoutines"),
    hint: () => t("cmdOpenRoutinesHint"),
    available: ({ admin }) => admin,
  },
  // The month, big (client/calendar/): the daily notes, the sigils that
  // logged, the cards graded and the sittings read, day by day.
  {
    id: "open-calendar",
    label: () => t("cmdOpenCalendar"),
    hint: () => t("cmdOpenCalendarHint"),
    available: ({ admin }) => admin,
  },
  // Feeds (client/feeds/, docs/feeds.md): the reading list's unread items
  // and a reader. Not the blog's outbound RSS — the other direction.
  {
    id: "open-feeds",
    label: () => t("feeds"),
    hint: () => t("cmdOpenFeedsHint"),
    available: ({ admin }) => admin,
  },
  // Today (client/today/): the day's note, the sigils and cards and tasks
  // due, on this day, the notes last read — one page (3.28).
  {
    id: "open-today",
    label: () => t("cmdOpenToday"),
    hint: () => t("cmdOpenTodayHint"),
    available: ({ admin }) => admin,
  },
  // The Timeline (client/timeline/): the vault by date, newest first.
  {
    id: "open-timeline",
    label: () => t("cmdOpenTimeline"),
    hint: () => t("cmdOpenTimelineHint"),
    available: ({ admin }) => admin,
  },
  // The year added up into `Reviews/<year>.md` (shared/yearReview.ts). The
  // ellipsis is the question it asks first: which year.
  {
    id: "year-review",
    label: () => t("cmdYearReview"),
    hint: () => t("cmdYearReviewHint"),
    available: ({ admin }) => admin,
  },
  // The week added up (client/review/): pages and hours by book, the
  // trackers' outlook, the sigils, the cards graded, the notes written.
  {
    id: "review-week",
    label: () => t("cmdReviewWeek"),
    hint: () => t("cmdReviewWeekHint"),
    available: ({ admin }) => admin,
  },
  // ORBITS' FOUR DOORS: the shelf, the day's due cards (the
  // shelf's first Study button, from anywhere), and the two makers, which
  // open the shelf with its modal already up. The last two are reached by
  // an event the shelf listens for (client/orbits/ShelfView.tsx) rather than
  // store state, because a modal is the shelf's own affair.
  {
    id: "open-orbits",
    label: () => t("cmdOpenOrbits"),
    hint: () => t("cmdOpenOrbitsHint"),
    available: ({ admin }) => admin,
  },
  {
    id: "study-due",
    label: () => t("cmdStudyDue"),
    hint: () => t("cmdStudyDueHint"),
    available: ({ admin }) => admin,
  },
  {
    id: "new-deck",
    label: () => t("orbitsNewDeck"),
    hint: () => t("cmdNewDeckHint"),
    available: ({ admin }) => admin,
  },
  {
    id: "import-deck",
    label: () => t("cmdImportDeck"),
    hint: () => t("cmdImportDeckHint"),
    available: ({ admin }) => admin,
  },
  {
    // THE OTHER DOOR OUT OF THE VAULT. Not while previewing as a visitor:
    // the archive is the admin's whole vault, and the preview is the one
    // session that has promised to behave like a stranger.
    id: "export",
    label: () => t("cmdExport"),
    hint: () => t("cmdExportHint"),
    available: ({ admin, preview }) => admin && !preview,
  },
  {
    // THE DECK'S RE-ENTRY: the popup shows itself once per update; this is
    // how a reader who closed it, or turned it off, sees it again on purpose.
    id: "whats-new",
    label: () => t("cmdWhatsNew"),
    hint: () => t("tourHint"),
    available: ({ admin }) => admin,
  },

  {
    id: "toggle-reading",
    label: () => t("cmdToggleReading"),
    hint: () => "Ctrl/Cmd E",
    available: ({ openPath, admin }) => admin && openPath !== null,
  },
  {
    // ONE row for twenty-one rooms. There used to be sixteen: this one plus a
    // `Theme: <id>` command per theme, which is 15 of the palette's 41
    // entries — 37% of the command list spent on one preference, and every
    // one of them a blind jump. The picker it opens is strictly the better
    // surface: grouped dark/light, arrow keys preview live against the real
    // app, Enter keeps, Esc puts back what you started with. A family that is
    // one parameter with N values belongs behind the surface that shows the
    // values, not spread across N rows of a list you are trying to search.
    // The dot previews the theme in force, so the row still answers "which
    // one am I in" at a glance.
    id: "theme-picker",
    label: () => t("browseThemes"),
    hint: () => t("cmdAppearanceHint"),
    // choiceBase, not the raw choice: the dot is painted from the CONSTANT
    // --swatch-<id>-* tokens, which are keyed on the built-in ids, so
    // a custom theme previews as the room it was built on.
    themeDot: () => choiceBase(useStore.getState().theme),
    available: () => true,
  },
  {
    // THE DIRECT FLIP, beside the browsing surface rather than instead of it
    // (v1.8 audit, F19). The picker above answers "which of the rooms"; this
    // answers "it is dark in here" — one keystroke to the curated counterpart,
    // which is exactly the promise the status bar's ☾/☀ glyph has always
    // looked like it was making and never made. The label NAMES the room it
    // lands in, so it is not a blind cycle: the argument that deleted fifteen
    // `Theme:` rows is that a jump into an unseen room is not a command, and a
    // jump whose destination is written on the row is.
    id: "theme-flip",
    label: () => tf("cmdThemeFlip", { theme: choiceLabel(counterpartChoice(useStore.getState().theme)) }),
    hint: () => t("cmdAppearanceHint"),
    themeDot: () => choiceBase(counterpartChoice(useStore.getState().theme)),
    available: () => true,
  },
  // Shell layout. Available to visitors too: where the panes sit and how much
  // chrome is on screen is the reader's business, not the admin's.
  {
    id: "zen-mode",
    label: () => t("cmdZen"),
    hint: () => t("cmdZenHint"),
    available: () => true,
  },
  // Panes are named by WHAT THEY ARE, never by the edge they happen to be on:
  // in Arabic the notes sidebar sits right and the outline panel left, so
  // "toggle left panel" would name the wrong pane half the time.
  {
    id: "toggle-sidebar",
    label: () => t("cmdTogglePaneNotes"),
    hint: () => "Ctrl/Cmd Alt B",
    available: () => true,
  },
  {
    id: "toggle-panel",
    label: () => t("cmdTogglePaneOutline"),
    hint: () => "Ctrl/Cmd Alt Shift B",
    available: () => true,
  },
  // The floating formatting toolbar's switch, and one of the two places it
  // lives — the other is Settings › This device. It used to have a third home,
  // a row at the bottom of the selection menu, which is a preference sitting
  // in a menu of verbs about the selected words and cost that menu a rule and
  // a row it could not spare. Admin only: it acts on the editor, which a
  // read-only session never mounts.
  {
    id: "toggle-selection-toolbar",
    label: () => t("cmdSelectionToolbar"),
    hint: () => t("cmdSelectionToolbarHint"),
    available: () => useStore.getState().admin,
  },
  // Three commands, not one toggle. The old single command named the edge you
  // were NOT on, which made the third state — "follow the language" — both
  // unreachable and invisible: the first use of it pinned the side forever.
  // The hint says which one is in force, because a list of three options with
  // no marked answer is a list of three questions.
  //
  // AUDITED against the theme family and KEPT. The fifteen `Theme:` rows went
  // because a theme is a ROOM — it has to be looked at, the picker previews it
  // live, and one row per value was 37% of the list. These three are the
  // complete enumeration of a three-state preference, each row a finished end
  // state that runs in one keystroke, with the one in force marked — the same
  // shape as publish/unpublish, which are two rows for two genuine states.
  // Collapsing them would trade three direct actions for a modal, a tab and a
  // scroll (Settings → Appearance & language carries the identical segmented
  // control), which is the opposite of what the theme change bought.
  ...(["auto", "left", "right"] as const).map<Command>((pref) => ({
    id: `sidebar-side-${pref}`,
    label: () =>
      t(pref === "auto" ? "cmdPaneSideAuto" : pref === "left" ? "cmdPaneSideLeft" : "cmdPaneSideRight"),
    hint: () =>
      useStore.getState().sidebarSidePref === pref ? t("cmdLayoutCurrentHint") : t("cmdLayoutHint"),
    available: () => true,
  })),
  // The editor's own chrome language, in the palette for a reason the
  // settings row cannot cover: this is the affordance you need precisely when
  // you cannot read the interface. Admin only — a visitor's language lives on
  // the public EN/ع switch and must never be settable from in here, which is
  // the whole point of the split (langPref.ts).
  ...([null, "en", "ar"] as const).map<Command>((pref) => ({
    id: `editor-lang-${pref ?? "follow"}`,
    label: () =>
      t(pref === null ? "cmdEditorLangFollow" : pref === "en" ? "cmdEditorLangEn" : "cmdEditorLangAr"),
    hint: () =>
      useStore.getState().editorLangPref === pref ? t("cmdEditorLangCurrentHint") : t("cmdEditorLangHint"),
    available: ({ admin }) => admin,
  })),
  {
    id: "shortcuts",
    label: () => t("shortcutsTitle"),
    hint: () => "Ctrl/Cmd /",
    available: () => true,
  },
  {
    // THE TOUR, beside the sheet that lists the keys — the same shelf, because
    // they answer the two halves of one question. The sheet says how to do a
    // thing you already know the product does; the tour is for the reader who
    // does not know it does it, which is the failure this row exists for: a
    // real reader used this vault for months without discovering the designer.
    // Everybody gets it, including a visitor — the deck drops the folios a
    // read-only session cannot act on rather than the row.
    id: "take-the-tour",
    label: () => t("tourTake"),
    hint: () => t("tourHint"),
    available: () => true,
  },
  {
    id: "toggle-vim",
    label: () => t("cmdToggleVim"),
    hint: () => t("cmdEditorHint"),
    available: ({ admin }) => admin,
  },
  {
    // THE NIGHT LIGHT'S ONE-KEY SWITCH. The sliders live on the settings
    // panel's device tab; this is the row for the reader whose eyes are
    // already tired and who does not want to find a slider. Everybody gets
    // it, a visitor included — the sheet is of the screen, not the vault.
    // The label is the STATE: it names the direction the press will take.
    id: "warm-screen",
    label: () => t(readWarmth() > 0 ? "cmdCoolScreen" : "cmdWarmScreen"),
    hint: () => t("cmdWarmScreenHint"),
    available: () => true,
  },
  {
    id: "publish-note",
    label: () => t("cmdPublishNote"),
    hint: () => t("cmdPublishHint"),
    available: ({ openPath, admin, openPublished }) =>
      admin && openPath !== null && !openPublished,
  },
  {
    id: "unpublish-note",
    label: () => t("cmdUnpublishNote"),
    hint: () => t("cmdUnpublishHint"),
    available: ({ openPath, admin, openPublished }) =>
      admin && openPath !== null && openPublished,
  },
  {
    id: "set-banner",
    label: () => t("cmdSetBanner"),
    hint: () => t("cmdSetBannerHint"),
    available: ({ openPath, admin }) => admin && openPath !== null,
  },
  {
    id: "remove-banner",
    label: () => t("cmdRemoveBanner"),
    hint: () => t("cmdRemoveBannerHint"),
    available: ({ openPath, admin }) => admin && openPath !== null,
  },
  {
    id: "rename-current",
    label: () => t("cmdRenameCurrent"),
    hint: () => t("cmdMoveHint"),
    prompt: {
      placeholder: "new/path.md",
      initial: () => useStore.getState().openPath ?? "",
    },
    available: ({ openPath, admin }) => admin && openPath !== null,
  },
  {
    // The palette's half of drag-and-drop. `rename-current` above can also
    // move a note — it takes a whole path — but typing "Zombies/Cache
    // Locality.md" from memory is not the same affordance as picking a folder
    // from a filtered list, and a reader who cannot drag (touch, keyboard) needs
    // the second one. It opens exactly the picker the tree's row menu opens.
    id: "move-current",
    label: () => t("cmdMoveCurrent"),
    hint: () => t("cmdMoveFolderHint"),
    available: ({ openPath, admin }) => admin && openPath !== null,
  },
  {
    // BUILT for F19, not exposed: nothing in the product copied a note before
    // (the tree's row menu moves, renames and deletes). It is the gesture a
    // writer reaches for before rewriting something they are not sure about —
    // the poor man's version of the history this release also ships.
    id: "duplicate-current",
    label: () => t("cmdDuplicateNote"),
    hint: () => t("cmdDuplicateHint"),
    available: ({ openPath, admin }) => admin && openPath !== null,
  },
  {
    id: "bookmark-note",
    label: () => t(useStore.getState().openPath !== null && isNoteBookmarked(useStore.getState().openPath ?? "") ? "cmdUnbookmarkNote" : "cmdBookmarkNote"),
    hint: () => t("cmdBookmarkHint"),
    available: ({ admin, openPath }) => admin && openPath !== null,
  },
  {
    id: "save-layout",
    label: () => t("cmdSaveLayout"),
    hint: () => t("cmdSaveLayoutHint"),
    prompt: { placeholder: "Research", initial: () => "" },
    available: ({ admin }) => admin,
  },
  {
    id: "restore-layout",
    label: () => t("cmdRestoreLayout"),
    hint: () => t("cmdRestoreLayoutHint"),
    available: ({ admin }) => admin,
  },
  {
    id: "copy-block-link",
    label: () => t("cmdCopyBlockLink"),
    hint: () => t("cmdCopyBlockLinkHint"),
    available: ({ admin, openPath }) => admin && openPath !== null,
  },
  // TABLES. Five rows, and only five: the ones a reader reaches for without
  // a pointer already on a cell. Everything else a table can be asked —
  // delete, move, align, sort, duplicate, clear, copy — is on the menu the
  // widget itself opens, where "this row" and "this column" are the ones
  // under the finger and need no second way to name them. Editor panes only,
  // like find-in-note: a reading pane has no caret to be in a table.
  {
    id: "insert-table",
    label: () => t("cmdInsertTable"),
    hint: () => t("cmdInsertTableHint"),
    available: ({ admin, openPath, reading }) => admin && openPath !== null && !reading,
  },
  {
    id: "table-row-above",
    label: () => t("cmdTableRowAbove"),
    hint: () => t("cmdTableHint"),
    available: ({ admin, openPath, reading }) => admin && openPath !== null && !reading,
  },
  {
    id: "table-row-below",
    label: () => t("cmdTableRowBelow"),
    hint: () => t("cmdTableHint"),
    available: ({ admin, openPath, reading }) => admin && openPath !== null && !reading,
  },
  {
    id: "table-col-before",
    label: () => t("cmdTableColBefore"),
    hint: () => t("cmdTableHint"),
    available: ({ admin, openPath, reading }) => admin && openPath !== null && !reading,
  },
  {
    id: "table-col-after",
    label: () => t("cmdTableColAfter"),
    hint: () => t("cmdTableHint"),
    available: ({ admin, openPath, reading }) => admin && openPath !== null && !reading,
  },
  {
    id: "table-edit-source",
    label: () => t("cmdTableEditSource"),
    hint: () => t("cmdTableHint"),
    available: ({ admin, openPath, reading }) => admin && openPath !== null && !reading,
  },
  {
    // Every haraka and tatweel out of the open note, as one undo step — the
    // editor answers (Editor.tsx), because only it holds the history that
    // makes "one step" true. Editor panes only, like find-in-note: a reading
    // pane has no CodeMirror to rewrite through.
    id: "strip-tashkeel",
    label: () => t("cmdStripTashkeel"),
    hint: () => t("cmdStripTashkeelHint"),
    available: ({ admin, openPath, reading }) => admin && openPath !== null && !reading,
  },
  {
    // Furigana over the selected kanji (editor/furigana.ts): the popover
    // with the readings table's suggestions, or the automatic mode that
    // writes the first suggestion over every kanji run without asking.
    // Editor panes only, like the row above: both act on a selection.
    id: "furigana",
    label: () => t("cmdFurigana"),
    hint: () => t("cmdFuriganaHint"),
    available: ({ admin, openPath, reading }) => admin && openPath !== null && !reading,
  },
  {
    id: "furigana-auto",
    label: () => t("cmdFuriganaAuto"),
    hint: () => t("cmdFuriganaAutoHint"),
    available: ({ admin, openPath, reading }) => admin && openPath !== null && !reading,
  },
  {
    // The outline has copied a link to a SECTION since sections were
    // draggable; the note itself had no such row, so the address of a heading
    // was copyable and the address of the page was not (v1.8 audit, F19).
    id: "copy-note-link",
    label: () => t("cmdCopyNoteLink"),
    hint: () => t("cmdCopyNoteLinkHint"),
    // Admin: a wikilink is a thing you paste into another note, and a visitor
    // has nowhere to paste it.
    available: ({ openPath, admin }) => admin && openPath !== null,
  },
  {
    // PARITY #3, and the one row in this table a VISITOR gets too: printing is
    // reading, not editing, and on an app-layout instance the person reading
    // the note may not be the person who wrote it. The chord is spelled out
    // because Ctrl/Cmd+P is the palette (the surface this row is IN) and
    // Ctrl/Cmd+Shift+P publishes — see client/App.tsx.
    id: "print-note",
    label: () => t("cmdPrintNote"),
    hint: () => "Ctrl/Cmd Alt P",
    available: ({ openPath }) => openPath !== null,
  },
  {
    id: "delete-current",
    label: () => t("cmdDeleteCurrent"),
    hint: () => t("cmdTrashHint"),
    available: ({ openPath, admin }) => admin && openPath !== null,
  },
  {
    // The door to the bin every delete dialog promises. It sits next to the
    // delete command on purpose: the reader who has just read "recoverable
    // from disk" and wants the file back looks here, not in a terminal.
    id: "open-trash",
    label: () => t("cmdOpenTrash"),
    hint: () => t("cmdOpenTrashHint"),
    available: ({ admin, preview }) => admin && !preview,
  },
  // The import wizard (client/import/, docs/import.md): Notion, Evernote and
  // Obsidian exports into a folder, previewed first and undoable after.
  {
    id: "import-notes",
    label: () => t("cmdImportNotes"),
    hint: () => t("cmdImportNotesHint"),
    available: ({ admin, preview }) => admin && !preview,
  },
  {
    // The files no note points at (UnusedAttachmentsModal.tsx): the other
    // half of the delete previews. Those say what a delete would BREAK; this
    // says what a delete would not touch at all. Beside the trash row on
    // purpose — everything it moves lands there, and Undo puts it back.
    id: "unused-attachments",
    label: () => t("cmdUnusedAttachments"),
    hint: () => t("cmdUnusedAttachmentsHint"),
    available: ({ admin, preview }) => admin && !preview,
  },
  {
    id: "moderate-comments",
    label: () => t("cmdModerateComments"),
    hint: () => t("cmdMarginaliaHint"),
    available: ({ admin }) => admin,
  },
  {
    id: "site-settings",
    label: () => t("siteSettings"),
    hint: () => t("cmdSiteSettingsHint"),
    available: ({ admin, preview }) => admin && !preview,
  },
  {
    // The design engine's one door. Like the theme picker, what it opens is a
    // browsing-and-building surface rather than a list, so it is one row.
    id: "design-site",
    label: () => t("designTitle"),
    hint: () => t("designPaletteHint"),
    available: ({ admin, preview }) => admin && !preview,
  },
  {
    // Offered only once backup & sync is switched on with a remote — the
    // status the badge reads is the same one this consults.
    id: "sync-now",
    label: () => t("syncNow"),
    hint: () => t("cmdSyncHint"),
    available: ({ admin, preview }) => {
      const s = syncSnapshot();
      return admin && !preview && s !== null && s.enabled && s.configured;
    },
  },
  {
    // SNAPSHOT NOW: one local commit, no network. The row the bulk editors
    // stand on — a reader about to run something vault-wide is owed a point to
    // come back to, and it must not depend on a remote being reachable. So,
    // unlike "Sync now" above, this is offered on ANY vault that is already a
    // git repository, whether or not backup is switched on or a remote is set.
    id: "snapshot-now",
    label: () => t("snapshotNow"),
    hint: () => t("cmdSnapshotHint"),
    available: ({ admin, preview }) => {
      const s = syncSnapshot();
      return admin && !preview && s !== null && s.repo;
    },
  },
  {
    id: "preview-visitor",
    label: () => t("previewAsVisitor"),
    hint: () => t("cmdPreviewHint"),
    available: ({ admin, preview }) => admin && !preview,
  },
  {
    id: "exit-preview",
    label: () => t("cmdExitPreview"),
    hint: () => t("cmdExitPreviewHint"),
    available: ({ preview }) => preview,
  },
  {
    id: "sign-in",
    label: () => t("signIn"),
    hint: () => t("cmdSignInHint"),
    available: ({ admin, preview }) => !admin && !preview,
  },
  {
    id: "sign-out",
    label: () => t("signOut"),
    hint: () => t("cmdSignOutHint"),
    available: ({ admin, authProtected }) => admin && authProtected,
  },
];

// ---------------------------------------------------------------------------
// Running a row
// ---------------------------------------------------------------------------

/** RUN A COMMAND OF THE TABLE, from wherever the reader picked it.
 *
 *  The body of the palette's own `runCommand`, lifted out of the component so
 *  a second surface can offer the same table: the phone shell's Search tab
 *  lists COMMANDS as rows (client/phone/screens/SearchScreen.tsx) and runs
 *  them through here, which is what keeps "the palette's commands" one list
 *  on both shells. Prompt commands and saved layouts are the caller's — the
 *  palette switches into its prompt mode, the phone asks with a sheet. */
export function runPaletteCommand(command: Command): void {
  const store = useStore.getState();
  switch (command.id) {
    case "new-unique-note":
      void createUniqueNote();
      break;
    case "yesterday-note":
      void openPeriodicNote("day", -1);
      break;
    case "search-meaning":
      // The sidebar owns the box; it flips its mode and takes focus.
      window.dispatchEvent(new CustomEvent("astrolabe:search-meaning"));
      break;
    case "tomorrow-note":
      void openPeriodicNote("day", 1);
      break;
    case "weekly-note":
      void openPeriodicNote("week", 0);
      break;
    case "monthly-note":
      void openPeriodicNote("month", 0);
      break;
    case "yearly-note":
      void openPeriodicNote("year", 0);
      break;
    case "random-note": {
      const all = collectNotes(store.tree).map((n) => n.path).filter((p) => p !== store.openPath);
      if (all.length > 0) store.openNote(all[Math.floor(Math.random() * all.length)]);
      break;
    }
    case "daily-note":
      void openDailyNote();
      break;
    case "quick-capture":
      store.setCaptureOpen(true);
      break;
    case "voice-note":
      store.openVoiceNote();
      break;
    case "twin-switch":
      switchToTwin();
      break;
    case "twin-beside":
      openTwinBeside();
      break;
    case "twin-create":
      void createTwinFlow();
      break;
    case "new-folder":
      // Root, not the open note's folder: "New folder" from a global
      // surface means a folder in the vault, and promptNewFolder's own
      // field takes a path, so `ideas/2026` is still one keystroke away.
      void promptNewFolder("");
      break;
    case "new-drawing": {
      // Beside the open note; with none open, the drawings folder (or root).
      const open = store.openPath;
      void promptNewDrawing(open === null ? store.drawingsFolder : !open.includes("/") ? "" : open.slice(0, open.lastIndexOf("/")));
      break;
    }
    case "reveal-in-tree": {
      const open = store.openPath;
      if (open === null) break;
      // SHOW THE PANE FIRST. The tree scrolls the row into the middle of a
      // pane that may be zero-width or off-screen, and "reveal" into a
      // collapsed sidebar is the same nothing as no command at all. The
      // dispatch waits a frame so the tree has re-laid-out before it
      // measures where to scroll.
      store.setSidebarCollapsed(false);
      requestAnimationFrame(() =>
        window.dispatchEvent(new CustomEvent(TREE_REVEAL_EVENT, { detail: { path: open } })),
      );
      break;
    }
    case "find-in-note":
      // A frame later: the palette unmounts on `close()` below and hands
      // focus back to whatever opened it (useDialog), which would land
      // squarely on top of the find field we are about to open.
      requestAnimationFrame(() => window.dispatchEvent(new CustomEvent(FIND_IN_NOTE_EVENT)));
      break;
    case "split-pane":
      if (!store.splitFocusedPane("inline")) toast(t("paneCapReached"));
      break;
    case "split-pane-down":
      if (!store.splitFocusedPane("block")) toast(t("paneCapReached"));
      break;
    case "close-pane":
      store.closeFocusedPane();
      break;
    case "focus-next-pane": {
      const order = panesInOrder(store.workspace);
      const at = order.findIndex((p) => p.id === store.workspace.focus);
      const next = order[(at + 1) % order.length];
      if (next) {
        store.focusPane(next.id);
        // Put the caret where the eye just went — the same courtesy the
        // directional pane walk pays (Workspace.tsx), and without it the
        // reader has focused a pane they then have to click into.
        requestAnimationFrame(() => {
          document
            .querySelector<HTMLElement>(`[data-pane="${next.id}"] .cm-content`)
            ?.focus();
        });
      }
      break;
    }
    case "duplicate-current":
      if (store.openPath) void duplicateNote(store.openPath);
      break;
    case "copy-note-link":
      if (store.openPath) copyNoteLink(store.openPath);
      break;
    case "bookmark-note":
      if (store.openPath) {
        const path = store.openPath;
        toggleBookmark(path)
          .then((on) => toast(t(on ? "bookmarkAdded" : "bookmarkRemoved")))
          .catch(() => toast(t("bookmarkFailed"), "error"));
      }
      break;
    case "restore-layout":
      void import("../LayoutPicker.tsx").then((m) => m.openLayoutPicker());
      break;
    case "copy-block-link":
      // The editor answers (Editor.tsx), after the palette has closed and
      // focus is back where the caret is — the find-in-note shape.
      requestAnimationFrame(() => window.dispatchEvent(new CustomEvent(COPY_BLOCK_LINK_EVENT)));
      break;
    case "print-note":
      // Dynamic, and it has to be: client/print.ts renders a note through
      // the markdown renderer, and a static import here would drag the
      // whole renderer into the palette's chunk — which is in the admin's
      // first paint. The module is already loaded whenever a document
      // surface is mounted (it registers the `beforeprint` handler from
      // there), so this import is normally a resolved promise.
      void import("../../print.ts").then((mod) => mod.printNote());
      break;
    case "theme-flip":
      store.toggleTheme();
      break;
    case "collapse-folders":
      window.dispatchEvent(new CustomEvent("astrolabe:tree-all", { detail: { open: false } }));
      break;
    case "expand-folders":
      window.dispatchEvent(new CustomEvent("astrolabe:tree-all", { detail: { open: true } }));
      break;
    case "pop-out": {
      const open = useStore.getState().openPath;
      if (open !== null) popOutNote(open);
      break;
    }
    case "insert-table":
      void insertTableCommand();
      break;
    case "table-row-above":
      tableCommand("rowAbove");
      break;
    case "table-row-below":
      tableCommand("rowBelow");
      break;
    case "table-col-before":
      tableCommand("colBefore");
      break;
    case "table-col-after":
      tableCommand("colAfter");
      break;
    case "table-edit-source":
      tableCommand("editSource");
      break;
    case "insert-template":
      void insertTemplateCommand();
      break;
    case "new-from-template":
      void newNoteFromTemplateCommand();
      break;
    case "toggle-graph":
      store.toggleGraph();
      break;
    case "open-media":
      store.toggleMedia();
      break;
    case "open-library":
      store.openLibrary();
      break;
    case "open-routines":
      store.toggleSigils();
      break;
    case "open-calendar":
      store.toggleCalendar();
      break;
    case "open-today":
      store.setView("today");
      break;
    case "open-timeline":
      store.setView("timeline");
      break;
    case "year-review":
      // Lazy: the generator and its reads are the Timeline chunk's, and a
      // palette that never writes a review never downloads them.
      void import("../../timeline/yearReviewCommand.ts").then((m) => m.yearReviewCommand());
      break;
    case "review-week":
      store.setView("review-week");
      break;
    case "open-feeds":
      store.toggleFeeds();
      break;
    case "open-orbits":
      store.toggleOrbits();
      break;
    case "study-due":
    case "new-deck":
    case "import-deck":
      // The shelf answers: it opens the first due session, or the modal
      // on the tab asked for. Dispatched after the open so a shelf that
      // is only now mounting still hears it (it replays the last ask).
      store.openOrbits(null);
      askOrbits(command.id === "study-due" ? "study" : command.id === "new-deck" ? "new" : "import");
      break;
    case "whats-new":
      openWhatsNew();
      break;

    case "export":
      openExportDialog();
      break;
    case "toggle-reading":
      store.toggleReading();
      if (store.view !== "editor") store.setView("editor");
      break;
    case "toggle-vim":
      store.toggleVim();
      break;
    case "warm-screen":
      toggleWarmth();
      break;
    case "zen-mode":
      store.setZen(!store.zen);
      break;
    case "shortcuts":
      store.setShortcutsOpen(true);
      break;
    case "take-the-tour":
      openTour();
      break;
    case "theme-picker":
      openThemePicker();
      break;
    case "toggle-sidebar":
      store.toggleSidebar();
      break;
    case "toggle-panel":
      store.setPanelCollapsed(!store.panelCollapsed);
      break;
    case "toggle-selection-toolbar":
      setSelectionToolbarEnabled(!selectionToolbarEnabled());
      break;
    case "sidebar-side-auto":
      store.setSidebarSidePref("auto");
      break;
    case "sidebar-side-left":
      store.setSidebarSidePref("left");
      break;
    case "sidebar-side-right":
      store.setSidebarSidePref("right");
      break;
    case "editor-lang-follow":
      store.setEditorLang(null);
      break;
    case "editor-lang-en":
      store.setEditorLang("en");
      break;
    case "editor-lang-ar":
      store.setEditorLang("ar");
      break;
    case "move-current":
      if (store.openPath) {
        const path = store.openPath;
        void moveViaPicker({
          path,
          name: path.slice(path.lastIndexOf("/") + 1),
          isFolder: false,
        });
      }
      break;
    case "delete-current":
      // Literally the same call the tree row makes (components/
      // deleteFlow.ts). A command must not be the harsher gesture merely
      // because it was reached from the palette, and the only way to
      // guarantee that forever is for there to be one implementation of
      // it — two copies of the same dialog is what let the palette hint
      // say "irreversible" over a move to .trash.
      if (store.openPath) void confirmDeleteNote(store.openPath);
      break;
    case "publish-note":
      if (store.openPath) void store.togglePublish(store.openPath, true);
      break;
    case "unpublish-note":
      if (store.openPath) void store.togglePublish(store.openPath, false);
      break;
    case "set-banner":
      if (store.openPath) store.setBannerModalOpen(true);
      break;
    case "remove-banner":
      if (store.openPath) void store.setBanner(store.openPath, null);
      break;
    case "open-trash":
      store.setTrashOpen(true);
      break;
    case "import-notes":
      store.openImport();
      break;
    case "unused-attachments":
      store.setUnusedOpen(true);
      break;
    case "strip-tashkeel":
      // The editor answers, a frame after the palette has closed and
      // handed focus back to the caret — the find-in-note shape.
      requestAnimationFrame(() => window.dispatchEvent(new CustomEvent(STRIP_TASHKEEL_EVENT)));
      break;
    case "furigana":
    case "furigana-auto": {
      const mode: FuriganaMode = command.id === "furigana" ? "popover" : "auto";
      requestAnimationFrame(() => window.dispatchEvent(new CustomEvent(FURIGANA_EVENT, { detail: mode })));
      break;
    }
    case "moderate-comments":
      store.setModerationOpen(true);
      break;
    case "site-settings":
      store.setSettingsOpen(true);
      break;
    case "design-site":
      openDesigner();
      break;
    case "sync-now":
      void runSyncNow();
      break;
    case "snapshot-now":
      void runSnapshotNow();
      break;
    case "preview-visitor":
      void store.setPreviewVisitor(true);
      break;
    case "exit-preview":
      void store.setPreviewVisitor(false);
      break;
    case "sign-in":
      store.setLoginOpen(true);
      break;
    case "astrolabe-sty":
      window.open("/api/astrolabe.sty", "_blank", "noopener");
      break;
    case "sign-out":
      void store.logout();
      break;
  }
}

/** The prompt half: what a prompt command does with the text it asked for. */
export function runPalettePrompt(command: Command, value: string): void {
  const store = useStore.getState();
  if (command.id === "new-note" || command.id === "new-tex-note") {
    const path = command.id === "new-tex-note" ? ensureTex(value) : ensureMd(value);
    store
      .createNote(path)
      .then(() => store.openNote(path))
      .catch((err: unknown) => {
        console.error("CommandPalette: create failed", err);
        toast(t("couldNotCreateNote"));
      });
  } else if (command.id === "rename-current" && store.openPath) {
    store.renameNote(store.openPath, ensureMd(value)).catch((err: unknown) => {
      console.error("CommandPalette: rename failed", err);
      toast(t("couldNotRenameNote"));
    });
  } else if (command.id === "save-layout") {
    // The arrangement as the store serialises it — paths and geometry,
    // never content — under the name just typed (server/layouts.ts).
    putLayout(value, serializeWorkspace(store.workspace))
      .then(() => toast(tf("layoutSaved", { name: value })))
      .catch(() => toast(t("layoutFailed"), "error"));
  } else if (command.id === "ask-vault") {
    store.setAskOpen(true, value);
  }
}
