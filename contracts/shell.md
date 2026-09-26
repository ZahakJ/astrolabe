# The shells — desktop and phone

The two shells — the desktop's (tabs, panes, grips, a status bar) and the phone's (client/phone/) — the store, the workspace, windows, settings, accessibility, and the one phone question, `PHONE_SHELL_QUERY`. Part of the module contracts (see [CONTRACTS.md](../CONTRACTS.md) for the map). **Edit the area, append nothing:** a change to how something works is written HERE, in the section it changes, and the old sentence goes; a release gets one line in [releases.md](releases.md), never an addendum.

## The phone shell (`client/phone/`, `client/shellQuery.ts`, 3.26.0; finished in 3.27.0)

The one contract for Astrolabe on a phone or a mouse-less tablet. There is no other: the Classic
drawer layout it replaced — the notes DRAWER, the ☰, the drawer's pan (`swipe.ts`) and the
back-gesture guard (`backGesture.ts`, `backGuard.ts`) — was kept for one release behind
`This device → Phone layout` and deleted in 3.27.0, with its CSS, its tests and its gates. The
contract no longer describes the drawer (3.15.0's docked-grips rule and 3.23.0's native drawer
went with it); [releases.md](releases.md) keeps their one line.

The owner, over the audit that measured the old phone: *"I almost wish to rewrite that whole side
of the app to be natively designed for the phone and tablet form factor instead of trying to
retrofit what we have here."* The retrofit had cost 97 phone `@media` blocks, 2,245 lines of
override CSS, five copies of the drawer query and 125 of 443 commits — and still shipped a P0 (a
tap on a note in the drawer opened nothing, §"the navigation" below). The phone shell is a new
FRAME around the existing content parts, not a rewrite of them.

**THE SEAM.** `client/main.tsx` renders `<PhoneShell/>` (a lazy chunk with its own stylesheet)
instead of `<App/>` wherever `PHONE_SHELL_QUERY` matches (`shellFor(matches)`), re-evaluated on the
query's `change`, so a rotation, a foldable or a window dragged across 700px swaps shells with the
same note open. The query — `(max-width: 700px), ((pointer: coarse) and (hover: none))` — is the
ONE copy of the phone question in the client (`tests/drawerQuery.test.ts` refuses any other
spelling, any 999px band and any `any-pointer`), and 700 is the ONE phone width in every
stylesheet (`tests/breakpoints.test.ts`: a `max-width` between 601 and 799px is 700 unless the
lines above it say "not the shell's 700" and why — the public blog's 640 does, for its grids). A device whose primary pointer hovers (a tablet
with a trackpad, a touch laptop) keeps the desktop above 700px, and the desktop shell is therefore
never mounted where the query matches: the drawer that used to fold its panes below 1000px on a
finger had no device left to open on, and went. A desktop window between 700 and 999px on a mouse
keeps its docked, resizable panes, as it always did. A blog visitor
gets the blog shell in either case. Both shells mount the same two hooks — `useShellRuntime()`
(`client/shellRuntime.ts`: the boot, run once per page; the SSE stream; the unsaved-text guard;
the wake-up revalidation; the offline worker; the what's-new door; the properties card's two
window events) and `useGlobalKeys()` (`client/globalKeys.ts`: the whole chord table, moved out of
App.tsx) — and share `useStore`, `client/api.ts`, `i18n.ts` and the router's URL helpers. The
phone shell never mounts Tabs, the pane grid, PaneGrip, StatusBar or the Sidebar;
`npm run check-shell-seam` (and the same rules in `tests/phoneShell.test.ts`) fails the build if
`client/phone/` imports app.css or any of those, if `client/components/` imports from
`client/phone/`, or if `phone.css` asks a width question — being mounted is the condition.

**THE STORE, ON A PHONE.** `setPhoneShellMode(true)` (set before the first render and on every
swap) makes the store collapse every committed workspace through `phoneWorkspace()`
(`client/workspace.ts`): one pane, the focused pane's active tab, unpinned — REPLACED, never
appended, whichever of the forty desktop call sites opened it. And the workspace is NEVER
PERSISTED while the phone shell is mounted: `persistWorkspace` and `persistTabs` return first,
the desktop's copy beside the vault is not written, and `prefsSync.ts` refuses `workspace` and `tabs`
outright (`NEVER_TRAVELS`, whatever the allowlist says). Leaving the phone shell
hands the desktop its own stored arrangement back with the phone's note opened in it. The store
records the last move (`lastRemap`) so the navigation stack can follow a rename.

**THE NAVIGATION** (`client/phone/nav.ts`, pure, injected history). A stack per bottom tab — Today,
Notes, Search, Calendar, More — and ONE owner of history. Every screen push is a `pushState`;
every sheet is one too; each entry carries its whole state
(`{ phone: { depth, entry: { tab, stack, sheets } } }`), so a pop, a Forward or a reload
restores what it lands on without inference. Every way back is the browser's own pop (the
Android back button, the edge swipe). The one asynchronous operation, `history.go()`, is
SERIALISED: anything asked while a pop is in flight waits for its `popstate`. That is the P0's
cure by construction — the old shell had two modules each owning half of history (the router's
pushes, backGesture's guard entry and synthesised Escape) and their order was not theirs to
choose. Navigating from inside a sheet REPLACES the sheet's entry. Tapping the active tab walks
back to its root. Back at the base of the run steps down in place rather than leaving the app;
a deep link starts at Today's base with the linked screen pushed above it.
**BACK MEANS UP (3.34, a reader on a Galaxy Z Fold whose folder ‹ opened Today).** A switch to a
tab whose stack is deep pushes ONE ENTRY PER LEVEL (`pushRun`; also `pushOn`), so the back gesture
walks up the tab before it leaves it — before, the whole stack sat in one entry straight on the
other tab's. A FOLDER's ‹ (and its crumbs, and the tablet list column's ‹ over a folder) is not the
browser's back: it is `nav.upTo(target)` with the target stack computed by path
(`client/phone/up.ts` `upChain`/`chainTo`: what the reader came by, cut at the deepest root or
folder on the way, plus the folders between). `upTo` pops to the entry that already shows the
target when only its descendants stand between; otherwise it REPLACES this entry with the first
level history is missing and pushes the rest, so the OS back from the target goes up too. **THE
STACK SURVIVES A RELOAD**: every change calls `persist(snapshot)` — `{ v: 1, tab, depth, stacks,
entries }` — which the shell writes to `sessionStorage["astrolabe.phone-nav:<siteName>"]` (the
pocket's siteName is the repository's name); at start `nav.resume(history.state, saved, pathname)`
takes the run back from the current entry's own mark (the browser keeps it across a reload) and
the snapshot when its entry at that depth is the same one, and refuses (the start proceeds as
before) when there is no mark or the mark's screen's address is not the loaded one. A sheet does
not survive: the run comes back on the screen under it, by a pop to its bare entry when the record
has one. `readSnapshot` is total like `readMark`. A pocket sync never reloads the page (a pull ends
in one `bulk` vault event; the tree and the buffers are re-read, the stack is not touched). Foreign entries (a
hash jump, the Orbits chip's `pushState(null)` + popstate) are read through the router's own
`applyUrl()` and stamped. The router itself is not installed on the phone shell.
**Store ↔ stack**: a tap pushes a screen and opens its content (`applyScreen`); anything that
opens content in the store (a wikilink, the palette, the daily note, a calendar day) pushes the
screen for it; an `applying` flag keeps each from echoing the other. A store surface closing
under the top screen (a delete) pops it.

**THE BOTTOM BAR** is 56px plus the safe area, five labelled doors. **Today**: a capture field
(`client/capture.ts`; the mic only when `micSupport()` and the vault keeps recordings), today's
note, the evening question from 18:00, every Sigil task due today as a tick-in-place row computed
by `tasksFor` and written through `POST /api/routine` (optimistic, reverted with a toast on
failure), course and book tasks as rows to the Sigils page, a row per deck with cards due (starting
its session), the tasks due and overdue ticked through `POST /api/task`, on this day with excerpts,
and the last eight notes. Since 3.28 the screen owns none of that: it draws `client/today/`'s
model and hooks, the same data layer the desktop's `~today` page draws (see the 3.28 addendum).
`~today` in the store is the Today TAB here (`screenOfWorkspace` answers `"today"`), as `~calendar`
is the Calendar tab; `~timeline` is a pushed screen (More, and the Calendar's `⋯`). **Notes** has two views, switched by a
Tree | Folders control in the root's top bar (`client/phone/notesView.ts`, localStorage
`astrolabe.phone-notes-view`; unchosen, Tree on two columns and Folders on one). FOLDERS: one folder
per screen, 52px rows with count and chevron; the folder's top bar is its path as CRUMBS
(`Crumbs.tsx` draws, `crumbs.ts` `collapseCrumbs` plans from canvas-measured widths: everything, else
the root + "…" + the nearest folders, else "…" + the current folder — the current folder never
folds, "…" is an action sheet of the hidden folders, each crumb `upTo` its folder). TREE: one flat
list (`treeRows.ts` `visibleRows`: only what SHOWS is walked, notes and folders first in the
reader's order, then the folder's files), folders open in place under a disclosure chevron, the open
set remembered per device (`phoneTree.ts`, localStorage `astrolabe.phone-tree`, followed through a
move), every row exactly 52px so a tree past 160 rows is WINDOWED by a sum (the window's geometry
read only while layout is clean: after a scroll's frame and inside the tap before the toggle). In
both, a folder's viewable attachments are ONE folded "Files · N" row after its notes that opens in
place (its state keyed `<folder>\0files` in the same memory), a folder with nothing that opens says
so with New note here, and pulling the list down from its top dispatches `astrolabe:refresh` and
reloads the tree (`usePullRefresh.ts`; the pocket answers the event with a pull). Pinned rows first,
tags as ONE chip row; `+` is a new note in this folder and a long press on it offers a folder; sort
is an action sheet; a long press on a row is its action sheet (rename, move, pin,
publish-with-confirmation, delete) through the desktop's own flows. The tree shares the desktop's
LOGIC (`treeOrder.ts`) and none of its chrome.
**Search**: focused on arrival; Notes | Commands | Tags; Commands is the palette's `COMMANDS`
table, ranked by `paletteRank.ts` and run through `runPaletteCommand` (lifted out of
CommandPalette.tsx for this), minus the desktop-only rows and, without a keyboard, the
keyboard-only ones. **Calendar**: `CalendarView` unchanged, its day pane handed to a sheet
through `dayHost`. **More**: grouped rows; the Keyboard group only once a hardware keyboard has
been seen. Rooms gained **Feeds** (`~feeds`) and Vault gained **Import notes** (the import
dialog as a store layer, `importFolder`) in 3.28. **More's and Settings' top bars carry the
chrome-language key** (`client/phone/LangPill.tsx`, admin only, a 44px target around a bordered
`ع` / `EN`) before any list, and the note sheet's Actions carry the same switch as a row written in
both languages (`data-action="chrome-lang"`): the way back from a language the reader cannot read
(contracts/i18n.md, "The way back is always on screen").

**THE NOTE SCREEN.** A 48px top bar (‹, the title — tap for the top —, an icon for the CURRENT
mode, ⋯) that slides away on scroll-down by `transform` over a note that keeps its own room;
nothing at the bottom except, while the editor holds the caret and no hardware keyboard is
attached, the accessory bar (`[[`, `#`, task, bold, heading, undo, redo, hide), pinned to the
visual viewport by `transform` and refusing focus on pointerdown. The surface is
`components/PaneSurface.tsx` — the desktop pane's own switch, split out so both shells draw the
same editor, reading view, book reader, graph, Orbits and Sigils. The fold chevron and the
heading ⋯ are hidden and the prose gutter drops to 18px; a long press on a heading raises an
action sheet of the heading's verbs (`client/phone/editorBridge.ts`, which alone imports
CodeMirror and is reached by `import()`). The properties card collapses to "N properties ›"
(the card's hidden `__count`) and opens the sheet's Properties; an empty card is not drawn.
A tap anywhere in the note's text takes the caret (and raises the accessory bar); a tap on a
`#tag` pill — in the editor or the reading view — opens that tag's screen: the pills' own
`astrolabe:search` "#tag", which the desktop's sidebar answers with a search, the phone shell
answers with `{ kind: "tag" }` (`client/phone/tagTap.ts`; through 3.35.0 nothing listened, and the
tap was swallowed with no caret either). check-phone walks a generated long note in both chromes,
after Read aloud stops: a prose, heading, fenced, quote, list and far-down line each raise the
bar; a pill opens its tag.
**The note sheet**: Outline (TocPanel; a jump closes the sheet) | Backlinks | Properties
(editable a row at a time, an emptied value removes the key) | Actions (publish WITH a
confirmation, the twin, share, move, history, delete).

**SHEETS** (`client/phone/Sheet.tsx`): from the bottom edge; detents half (the 92dvh panel
translated 42dvh) and full, auto for action sheets; follow-finger drag on the handle and header
writing `transform` straight to the element, flick or a quarter of the travel to dismiss; a scrim
by `opacity`; the product's focus trap (`useDialog`); a history entry; `inert` on everything
underneath. Every `confirmModal`/`promptModal` in the product is answered by
`ConfirmSheet.tsx` through `registerConfirmHost` — Back is Cancel; `accent: true` marks a
confirmation that is not a loss (publishing). The store's modal surfaces (Settings, Trash, the
palette, capture, shortcuts, login, banner, moderation, unused attachments) are LAYERS: raising
one pushes an entry, its own close retracts it, and Back dispatches Escape to it so it closes
itself (Settings keeps its unsaved-changes guard; a layer that stays takes its entry back).
Ladder: sheets at `--z-panel`, questions at `--z-confirm`.

**TWO COLUMNS** (the phone shell at `TABLET_QUERY` — by SHAPE since 3.34:
`(min-width: 768px), ((min-width: 640px) and (min-aspect-ratio: 3/4))`, so the open Galaxy Z Fold,
690×829 at DPR 2.625, gets two columns and its 344×882 cover screen one): a 72px rail, a list column
(the deepest list of the tab's stack) of `clamp(240px, var(--ph-list-w, min(40%, 340px)), 100% −
320px)`, a GRIP between them (`ColumnGrip.tsx`, role separator, drag or arrows, double tap resets,
the width in localStorage `astrolabe.phone-list-width`), the note beside it; a note picked in the list
REPLACES the one beside it and the list is the same element throughout (its scroll, open folders and
the lit `aria-current` row stay); the note sheet is a slide-over from the trailing edge no wider than
the note's column (`--ph-detail-w`, set from the column's ResizeObserver) with its scrim over that
column only; the Calendar root takes both columns.

**HARDWARE KEYBOARD** (`client/phone/hardwareKeyboard.ts`): proven by a chord, a navigation key,
or a printable key with the visual viewport at its resting height; remembered per device. It
enables the global keys (Ctrl/Cmd+K opens Search), hides the accessory bar and adds More's
Keyboard group.

**EVERY SURFACE HAS A SCREEN (3.27.0).** `kinds.ts` sorts screens: a LIST keeps the tab bar and is
what a tablet's list column shows (the roots, a folder, a tag, Settings, the decks, the sigils, the
media shelves, the bookshelf); a DETAIL hides the tab bar and takes the column beside the list; a
FULL detail (a study session, a book) takes the whole glass on a tablet too. `SurfaceScreen` — the
pane's switch under a top bar — is left for the graph and a drawing only.
- **Feeds** (3.28): `FeedsScreen` (a LIST: unread articles as rows under their feed) →
  `FeedItemScreen`, the screen kind `{ kind: "feed-item", feed, guid }` (a DETAIL whose
  `contentOf` is `~feeds`), the sanitised article with Keep / Mark read / Open the original in its
  ⋯ action sheet. Both read `client/feeds/useFeeds.ts`, the desktop's model.
- **Orbits**: `OrbitsScreen` (decks as 52px rows with due counts) → `DeckScreen` (due / new /
  total, Study, the sections, the month's retention) → `SessionScreen`, the desktop's
  `SessionView` unchanged and full screen. A surface that closes itself back to a page the stack
  already holds (the session's "back to the shelf") is met by `nav.popTo` to the highest screen
  whose `contentOf` is that page — the deck — never by a second copy pushed on top.
- **Sigils**: `SigilsScreen` (a row per sigil with today's standing) → `SigilScreen`, the reading
  renderer's card with `layout: "phone"` (today's checklist, the week strip and heat map, then the
  figures; a course's units and projected dates open; the card's own doors move to ⋯). A tick is
  merged locally with `mergeEntry` and written through `POST /api/routine`; a failure restores.
- **Media**: `MediaScreen` (shelves of rows, a status chip row) → `TrackerScreen`, the page's own
  `MediaCard`. **Library**: `LibraryScreen`, a list. **Weekly review**: `ReviewScreen`.
- **The readers** (`ReaderScreen`) draw no phone chrome: `BookReader`/`EpubReader` take a
  `phone` host (`books/chrome.tsx PhoneReaderHost`) and draw ONE 44px bar of their own
  (`PhoneBar`: back, title, a page/chapter scrubber that jumps on the range's `change`, ⋯) and
  the −/+ pair (`PhoneZoom`); ⋯'s verbs go to the phone's action sheet, the contents to
  `ListSheet`. A PDF opens at `fit: "width"` locally, not saved. The readers import nothing from
  `client/phone/`.
- **Settings** is `SettingsScreen` (the sections, the search) → `SettingsSectionScreen`, which
  draws `components/settings/TabBody.tsx` from `useSettingsForm` — the dialog's own bodies and
  form. `settingsOpen` rising is answered by pushing the list (and lowering the flag);
  `settingsFocus` is carried to its section, which reveals the row. THE GUARD: a section with
  edits registers `setGuard(screenKey, { dirty, discard })`; `nav.ts` asks `canLeave(from, to)`
  before every move and on every pop — a pop the browser already made is undone by pushing the
  entry straight back, so the form is never unmounted — and `onBlocked(proceed)` asks "Close
  without saving?" through the confirm sheet; Discard releases the guard, resets the form and
  proceeds. A section's save bar rises by `transform`. This device has no bar and no guard.
- **Scroll memory**: a push stamps the leaving list's `scrollTop` into the entry it leaves
  (`scrollOf`), and a pop hands it back as `NavState.scroll`; `useScrollMemory` re-applies it
  as a late-arriving list grows (≤1.2s, never after the reader touches it).
- **Layers on `<body>`** (`client/overlays.ts`): the theme picker, the designer, the what's-new
  deck, the tour, the attachment viewer and the readers' panels `announceOverlay(id, close)`;
  the shell gives each a history entry (`overlay:<id>`), Back calls `close` (the designer's is its
  own Escape, so it asks about an unsaved design and, staying, takes its entry back), and a close
  by the layer's own hand gives the entry back. The desktop does not subscribe.
- **Layers a screen raises** (`RoutedLayer`, `RoutedSheet`) draw into the shell's sheet host,
  because the shell makes everything under a sheet `inert` — the calendar's day sheet, drawn
  inside its screen, was inert with it in 3.26.0.
- **Sheets**: the tag picker (`TagPickerSheet`: a note's tags written through
  `POST /api/frontmatter` a tap at a time, or every tag to browse from Notes' "All tags" chip);
  a heading held in the READING view raises the editor's action sheet minus its editor-only rows
  (`readingHeading.ts`); a folder's viewable files are its folded Files row, opened in the
  attachment viewer; the tablet's list column keeps its ‹ while a detail is open (`upTo` by path over
  a folder, `popTo` the list's parent otherwise).
- **The pocket answers `POST /api/capture`** (`mobile/src/pocket/server.ts`): `appendCaptured` in
  the note named, else the day's inbox `Inbox/YYYY-MM-DD.md` (where the share sheet and a kept
  voice note already go), refused 409 when the file moved under the index, committed like a save.
  Today's capture field shows in a pocket vault.

**WHAT PROVES IT.** `tests/phoneShell.test.ts` (the stack against an asynchronous history double,
including the P0 reordered, the leave guard on a push and on a pop, scroll memory, `popTo`; BACK
MEANS UP — the Fold report as a test, a tab switch's entry per level, a reload resumed with and
without its record, a pinned deep folder going up level by level, the address winning, a sheet not
surviving, `readSnapshot`, `up.ts`; the reducer; the persistence refusals; the keyboard inference;
the query; the seam), `tests/phoneTree.test.ts` (the crumbs' plan; the tree's rows, the folded
Files row, the empty folder, only-what-shows walked; the expansion memory, a move, refusing storage),
`tests/settingsForm.test.ts` (the split form's round trip), `tests/pocketServer.test.ts` (capture),
`tests/drawerQuery.test.ts` (one phone question, no drawer left). `npm run check-phone` drives the
shell in both languages on a phone, a Galaxy Z Fold's cover (344×882) and inner screen opened
(690×829), a 720×820 window with a pen and a tablet both ways up — tree tap changes the URL and the
title, back pops a screen, back closes a sheet, publish asks, a long press is a menu; two folders
down a reload keeps the folder and the ‹ lands on the parent, and so it does after a trip to Today,
with the OS back going up from there; the crumbs end in the folder's own name and go up (through
"…" where they fold); the Tree opens a folder in place, remembers it across a reload, folds a
folder's files into one row that opens in place, says an empty folder is empty, and a long press is
the row's menu; on two columns the list keeps its scroll and lit row while the note changes, the
grip widens the list and is remembered, the note's sheet stays over the note's column; Study starts the session full screen, a sigil tick persists, a book wears one bar and
its scrubber moves the page, the theme picker takes an entry Back closes, a Settings section asks
before Back discards and saves, the tag picker writes the tag, a list comes back scrolled; every
target 44px and every field 16px. `check-windows-layout` runs its ladder on the desktop's own
widths (720 and up) and asserts which shell each posture and width gets.

## Client state (shell agent owns; file `client/state.ts`)

zustand store `useStore`:

```ts
interface State {
  tree: TreeNode | null;
  openPath: string | null;      // current note
  openTabs: string[];           // ordered open note paths
  dirty: Record<string, boolean>;
  view: "editor" | "graph";
  theme: Theme;                 // one of shared/themes.ts THEMES (15); persisted localStorage "astrolabe.theme"; sets data-theme attr on <html>
  vimMode: boolean;                    // persisted "astrolabe.vim"
  paletteOpen: boolean;
  // Shell layout, all persisted (see "Shell layout" below):
  sidebarSidePref: "auto" | "left" | "right"; // "astrolabe.sidebarSide" (default "auto")
  sidebarSide: "left" | "right";       // DERIVED: the pref with "auto" resolved
  sidebarCollapsed: boolean;           // "astrolabe.sidebarCollapsed"
  panelCollapsed: boolean;             // "astrolabe.panelCollapsed"
  zen: boolean;                        // "astrolabe.zen"
  backlinks: Backlink[];        // for openPath
  // actions:
  loadTree(): Promise<void>;
  openNote(path: string): void;        // adds tab, sets openPath, view="editor"
  closeTab(path: string): void;
  setView(v: State["view"]): void;
  setTheme(t: State["theme"]): void; toggleVim(): void;
  setPaletteOpen(b: boolean): void;
  refreshBacklinks(): Promise<void>;
  createNote(path: string): Promise<void>;
  renameNote(path: string, toPath: string): Promise<void>;
  deleteNote(path: string): Promise<void>;
}
```

`client/api.ts` — typed fetchers for every endpoint (`getTree`, `getNote`, `putNote`, `createNote`,
`renameNote`, `deleteNote`, `createFolder`, `search`, `getGraph`, `getBacklinks`, `getTags`,
`subscribeEvents(cb): () => void`). Shell agent owns it.

## The workspace (client/workspace.ts, client/state.ts)

**`state.workspace` is the truth about what is open; `openPath` and `openTabs` are a DERIVED
MIRROR of it, written by `commitWorkspace()` and by nothing else.**

That direction is what makes panes affordable. Roughly forty places in the client read `openPath` or
`openTabs` — the status bar, the router, the palette, the outline, the backlinks panel, every
publish and banner action — and not one of them has to learn what a pane is: they keep reading a
path and a list of paths and go on being right, because the mirror answers for the FOCUSED pane.
Only the dozen places that WRITE the open set changed, and they now say what they mean
(`closeOthersIn`, `pruneWorkspace`, `remapWorkspace`) instead of each filtering an array its own way.

`client/workspace.ts` is **pure** — no DOM, no store, no fetch, and no import of `state.ts`. Every
function takes a `Workspace` and returns a new one. That is not tidiness: it is what lets
`tests/workspace.test.ts` push tens of thousands of random edit sequences through the model and
assert every invariant after every step, the same shape `check-sections.mjs` uses on the section
model, before any of it is wired to a component. The property test earned itself on its first run —
at seed 0 it found that `settle()` repaired columns, weights and focus but never `active`, so a
rename that collapses two tabs onto one path left a pane pointing past the end of its own tab list.

**Two levels, never a tree.** Columns along the inline axis, at most three panes stacked in each
(`MAX_COLUMNS` 4, `MAX_ROWS` 3, `MAX_PANES` 8; raised from 3 × 2 × 6 in 3.2.0 when a full grid
looked like a broken drag — a zone the layout would refuse is not drawn). A recursive split tree buys infinite layouts and no
way back to one: its drop targets cannot be enumerated by a gate, its serialization needs a version
and a migration table the first time the shape moves, and a layout space too large to name kills
presets — which are the reason to have splits at all.

**`columns[0]` is the inline-START column** — the left in English, the right in Arabic — because the
shell grid already follows the direction that way (`"sidebar main panel"` and its `--flip`
counterpart). A layout serialized on an English instance therefore opens correctly mirrored on an
Arabic one with nothing about sides stored. The single deliberate exception is `paneInDirection()`,
which resolves pane focus GEOMETRICALLY from live rects, so `←` moves to the reader's left in both
languages: a tab bar is a one-dimensional list where "next" is a fact about reading order, and a
pane grid is two-dimensional where "left" is a fact about the screen.

**`noteFocus` is not `focus`, and the difference is load-bearing.** `focus` is where the keyboard is;
`noteFocus` is the last focused pane whose active tab is a NOTE, and `openPath` derives from it. That
is what will let a book pane hold the keyboard without `StatusBar` firing `getNote()` at a `.pdf`
(which 400s on every open) and without `router.ts` pushing a PDF into the address bar as a permalink.

**`settle()` owns every invariant, and every reducer ends there.** Columns emptied by a close are
dropped, weights renormalized, `active` clamped, and `focus`/`noteFocus` re-pointed at panes that
still exist and are allowed to hold them. The bugs in a layout model are almost never in the edit —
they are in the fifth thing the edit invalidated, and one function that fixes all five is the only
version of this that stays correct.

**`parseWorkspace()` is TOTAL, and a damaged layout must never cost the reader their open notes.**
It reads rather than validates: it takes what it understands and discards the rest. A pane the
layout forgot to place has its tabs adopted by the first pane instead of vanishing with it; a
structurally broken layout collapses to a solo workspace holding every path that was still readable.
Storage is `astrolabe.workspace`, and **`astrolabe.tabs` is still written beside it** — a few bytes that
buy a downgrade nobody loses a session to, since a build without panes still finds a shape it
understands. On the way up, an instance with no workspace key has its `astrolabe.tabs` migrated by
`fromStoredTabs()`, so the upgrade is invisible.

### Panes (client/components/Workspace.tsx, Pane.tsx)

`Ctrl/Cmd+\` splits, `+Shift` stacks instead of sitting beside, `+Alt` closes, and
`Ctrl/Cmd+Alt+Shift+←→↑↓` moves between them. **The new pane opens on the SAME note**, because that
is what a split is for — a second view of the thing you are already reading. An empty pane beside a
note is a pane the reader then has to fill.

**A SOLO WORKSPACE RENDERS NONE OF THE GRID.** `Workspace.tsx` returns the bare `.s-view` the shell
has always returned, with no wrapper, no `data-pane` and no `.s-panes` around it. That is not an
optimization, it is what keeps the stylesheet true: every `:has()` rule, every zen selector and every
`.s-view > .s-editor` in `app.css` goes on matching exactly as it did, and a reader who never splits
pays nothing for the feature — in bytes or in behaviour. The grid appears only once there is
something to arrange.

**Each pane carries its own tab bar; the shell's bar belongs to the shell only while there is one
pane.** A tab bar names what is open HERE, and one strip above two panes cannot say which.

**Every tab action focuses its pane first.** The store's tab actions act on the FOCUSED pane, so
acting on a particular one means focusing it — which is what a click on it already means. Without
that rule a second pane's ✕ closes a tab in the first, which is the kind of bug that reads as
possession by a ghost.

**Focus is GEOMETRIC and the arrows are physical, in both languages.** `paneInDirection()` resolves
from live rects read at the moment the key is pressed — a resize, a fold and a split all move them,
so a cache would answer for a layout that is no longer on screen. This is a deliberate exception to
the logical arrow swap in `Tabs.tsx`, and the two do not conflict: a tab bar is a one-dimensional
list where "next" is a fact about reading order, and a pane grid is two-dimensional where "left" is
a fact about the screen. A reader pressing ← at a grid is pointing, not reading.

**Column order is reading order and nothing in the CSS says "left".** `columns[0]` is the
inline-START column, laid out by the grid in source order, so a layout saved on an English instance
opens correctly mirrored on an Arabic one with nothing about sides stored — the same way the shell's
own `"sidebar main panel"` areas already work. The focus mark is an accent rule on the pane's
**leading** edge (`inset-inline-start`), the same vocabulary reading mode already uses to say "this
column is in a mode", rather than a ring drawn around the whole pane, which would be on screen at
all times.

**The gap IS the divider** — one hairline of `--border` showing through `gap: 1px` on a grid whose
background is the border colour — rather than a border on each pane, which would double between two.

**Where the desktop shell is not mounted, the layout is not rewritten either.** Below 700px, or on a
finger that cannot hover, `PHONE_SHELL_QUERY` (client/shellQuery.ts) mounts the phone shell instead,
which shows one screen at a time and never touches the workspace's panes; a window dragged back
wide finds the layout exactly as the reader arranged it. A resize must never rewrite what somebody
chose.

**A split that would breach the cap says so by name.** `splitPane` returns null and the shell toasts
`paneCapReached`; a keystroke that silently does nothing is indistinguishable from a broken key, and
this cap has a real reason behind it (three columns of two is the largest layout that still has a
name — see the model above).

**The graph is about the WINDOW, not about a pane.** It replaces the whole working area exactly as it
did before panes existed. The empty states are the same: a locked vault and an empty one are facts
about the session, and a pane with no tab hands them straight through rather than drawing its own.

### Tabs: two opposite promises

**A PINNED tab is a promise that nothing will take it.** A link click will not replace it, and **no
bulk close takes one** — that is the same promise in "close others", "close tabs after this one" and
"close every note in this window", so a reader never has to remember which rows respect a pin. The
one closer that ignores pins is the internal `dropTabsUnconditional`, used when the file is *gone* or
is no longer this session's to see (a delete, a sign-out, a language filter): a pin is a promise
about the reader's intent, not about the vault's contents.

**An EPHEMERAL tab is the opposite promise.** It is a preview — opened by a single click from search,
the palette or a wikilink — and the next ephemeral open in that pane REPLACES it. There is one
preview slot per pane, so forty tabs never accumulate in the first place; that is prevention, where
"close all tabs" is the cure. It commits — becomes ordinary — when the reader types in it, opens it
a second time (a revisit is intent), pins it, or opens it explicitly in a new tab. Pinned and
ephemeral are mutually exclusive by construction, and both are visible in the row rather than only
in the menu that set them: an italic title for a preview, a gold ◆ for a pin, each with real
screen-reader text beside it, because a promise the reader cannot see is one they will not rely on.

**The strip has keys of its own** (v1.8 UX audit, F12). Every other pane operation had a chord and
the tabs inside them had none, so a reader with forty notes open could split, close and walk between
panes without a mouse and then had to reach for one to change tab. `Ctrl/Cmd Alt PageDown`/`PageUp`
walk the focused pane's strip and WRAP at both ends (`stepTab` in client/workspace.ts, proven in
tests/workspace.test.ts); `Ctrl/Cmd Alt W` closes the pane's active tab (a pane showing the graph or
the shelf has no tab to close, and closing "whatever the last note was" from under it would be a
guess). Stepping past a preview tab does NOT commit it — a glance is not the second visit that says
"keep this". The chords wear `Alt` for the reason the templates do: the world's three tab chords
(`Ctrl Tab`, `Ctrl PageUp`/`PageDown`, `Ctrl W`) all belong to the browser, two of them can be worn
one modifier over, and the third cannot because `Alt Tab` belongs to the window manager. NOT arrows
— `Ctrl Alt ←`/`→` is GNOME's workspace switcher and macOS Chrome's own tab switcher. "Next" is
next ALONG THE STRIP in both languages: the bar mirrors with the reading direction, and a tab bar is
a list, not a map.

### Drag a tab: reorder, move, or SPLIT (Tabs.tsx, PaneDropZones.tsx, dragTab.ts)

Lift a tab and every pane raises five drop targets: a centre that means "join
this pane's strip", and four edges that mean "split this pane and land me on
THAT side" (the owner: "should be able to just drag and drop one of the
windows to the right or lift to trigger a split"). The solo pane raises them
too — dragging one of two tabs to an edge is exactly how the FIRST split is
made. Within a strip, hovering a tab shows an insertion caret and dropping
reorders; the caret's before/after half is resolved logically, so the leading
half of a tab is the RIGHT half in an Arabic bar — the same physical→logical
swap the tab arrow keys already make.

**The gesture is ONE reducer** (`dropTabSplit` in client/workspace.ts): take
the tab out of its pane, split the target on that edge, land the tab in the
new pane — and at a cap (MAX_COLUMNS/ROWS/PANES) it refuses WHOLE. The halves
are not independently meaningful: a close whose split then fails would eat the
tab. Living in the model puts the gesture under the same property fuzz as
every other reducer. A pane the drag emptied closes behind it — its one job
left with the tab — and `splitPane` grew `before` for the leading edges,
because an insert that only knew "after" would answer both edges with the
same geometry and one of them would feel mirrored. Edges the model would
refuse are NOT rendered: a zone that lights up and then does nothing on drop
is a broken promise, and the caps are knowable right where the zones are
drawn.

The drag itself is module state (client/dragTab.ts), not store state: it
exists between dragstart and dragend, must never persist or mirror to other
windows, and `dataTransfer.getData()` is empty during dragover by spec — so
the zones could not know what hovers them from the event alone. The payload
still rides the DataTransfer under `application/x-astrolabe-tab`; a drag arriving
from ANOTHER window has the MIME and no module state, and the zones simply do
not raise — the honest no-op until cross-window adoption exists. The zones'
chunk loads at the first LIFT (`React.lazy` in Pane.tsx): code that exists
only during a gesture has no business in first paint, and a drag is hundreds
of milliseconds long where the fetch is a handful. `:hover` is suppressed
during native drags, so the lit zone is a class driven by dragenter/dragleave.

### The tab context menu (client/components/ContextMenu.tsx, Tabs.tsx)

Right-click a tab, or press Shift+F10 / the Menu key on the focused one — the keyboard's right-click,
the same door the tree already has, anchored to the tab rather than to a pointer that is not
involved.

**Every row that closes more than one tab NAMES what it is about to take** — "Close others
(2 unsaved)" — in the instance's own numerals and Arabic's own plural forms, through a `countPhrase`
unit written for it. This is the honesty `GET /api/delete-preview` already brings to a delete,
applied to the one other place in the product where a single click can discard unsaved work. **The
count is computed by RUNNING the reducer and diffing `allPaths`**, never by re-deriving which tabs a
pin protects: a number that came from a second reading of the rule would eventually promise something
the reducer does not do, and the entire reason the rows carry a number is that the number is true. A
row that would take nothing is DISABLED rather than absent — a menu whose rows move between openings
is a menu you cannot aim at.

**Rows say "Close tabs after this one", never "Close to the right."** Physical right names a
different set of tabs in Arabic, exactly as "the left bar" named a different pane before the panes
were given names.

`ContextMenu.tsx` **is** the menu, and the tree's two are on it now. It owns the placement argued
out in `Sidebar.tsx` (open toward the reading direction, fold back, fold back again if the fold
overflows, clamp both axes, measure after mount because a menu's size is its content's), focus
restoration on **every** close path including activating a row, and dismissal on Escape (capture,
and stopped, so a menu over a dialog does not close the dialog underneath it), an outside mousedown,
a `contextmenu` elsewhere, a resize that invalidates the geometry it just measured, and the command
palette opening over it. The sidebar's were the second implementation and they disagreed with this
one exactly where a second implementation always does: the tree's menu never dismissed on a
`contextmenu` elsewhere or on a resize, and **the sort menu closed on `onMouseLeave` and on nothing
else** — not Escape, not an outside click, and on a phone, which has no mouseleave, not ever.
Porting them deleted `placeMenu`, two layout effects, two dismissal effects and nine handlers that
each called `setMenu(null)` on their own and dropped a keyboard reader on `<body>`.

Three things the port added, and each is a rule rather than a style:

- **`checked?: boolean` makes a row a CHOICE.** It becomes `role="menuitemradio"` with
  `aria-checked` and a ✓ column, and one row declaring it makes the whole menu one — every row then
  reserves the column, "Forget my order" included, because a tick that pushes only its own label
  right turns a scannable column into a ragged one and the chosen row becomes the row that looks
  out of place. The tick is `aria-hidden`: `aria-checked` is what is read, and a glyph read out as
  well says the state twice. It exists so the tree's sort menu ports with no second primitive.
- **Groups are separated, and separators are `{ label: null }` rows.** A folder's menu is sixteen
  rows; flat, it was a list to read rather than a menu to aim at, and the audit measured exactly
  zero separators in it. The five groups are: make something here · name and mark this row · publish
  and export it · arrange it · remove it. No separator is written before the destructive tail —
  `app.css` draws its own hairline above the first `--danger` row, and two rules for one line is how
  they come to disagree.
- **Touch gets a ceiling and a ground.** `min-width: 200px` (at 168 the sort menu wrapped "By name,
  reversed" onto a second line among rows that were one line each); and on a coarse pointer
  `max-height: calc(100dvh - 16px)` with `overflow-y: auto`, plus `.s-menu-scrim` one rung below the
  menu. Sixteen rows at the 44px touch floor is 756px, which floated edge to edge in an 844px phone
  with no scroll, no visible edge of its own and nothing that read as "outside" — a finger looking
  for outside landed on a tree row. The scrim carries no click handler: the window mousedown already
  closes the menu, and two closers is how one of them stops matching the other. No bottom sheet and
  no drag handle — the phone shell's sheets are where a thumb drags, and this menu is the desktop's.

**A pointer-opened menu does not light a row.** `ContextMenu` focuses its first item only when the
menu was opened from the keyboard, and the imperative heading menu (`sectionMenu.ts`) takes the
same `fromKeyboard` flag now: it focused its first row unconditionally, so a right-click painted
the global focus ring on a row nobody chose — and that row is the one Enter would run. A
`contextmenu` event reports `button: 2` from a mouse and `0` from Shift+F10 or the Menu key; a
`click` reports `detail: 0` only when no pointer made it. Those two tests are how every opener in
the product answers the question. The editor's ⋯ affordance answers Enter and Space for the same
reason: it was bound to `mousedown` alone, and a menu only a mouse can open is the thing the
keyboard rule forbids.

## Several windows, one vault (client/windows/)

**Two windows on one vault is the two-writer case**, and until this round `PUT /api/note` was
unconditional last-write-wins — so the honest description of "open it in another window" was "lose a
paragraph and be told nothing". The write precondition is the net; the LEASE is what stops anyone
landing in it every few minutes.

**Two channels, one division, and it is the reason there is not a second coherence implementation.**
SSE carries FACTS ABOUT THE VAULT — a file changed, a note was deleted — from the one process that
knows. The bus carries INTENT between windows: which window is typing, that a preference changed,
that a window is closing. None of that ever touches the disk, so a server round trip is the wrong
shape and the watcher would never see it. Anything derivable from a file belongs to SSE, and nothing
on the bus is allowed to become a second way of learning it.

**The lease has no coordinator and writes nothing to disk.** Every window announces when it opened
and which notes it holds; both sides then compute the same answer from the same rule — `winsAgainst`:
the OLDEST window wins, and a same-millisecond tie (which a scripted pop-out produces every time)
goes to the smaller id, arbitrarily and, crucially, *agreed*. There is no server to ask, no lock file
to strand, and a window that is killed simply stops answering. `tests/windows.test.ts` proves the two
properties the design rests on: the relation is ANTISYMMETRIC, so two windows can never both believe
they hold the pen and manufacture the conflict the precondition exists to catch; and TRANSITIVE, so
three windows cannot form a cycle in which the note never settles.

- **`windowBornAt` and `windowId` live in `sessionStorage`**, which is per-TAB and survives a reload.
  `localStorage` would give every window the same id (it is per origin) and a module constant would
  mint a new one on every refresh — so a reloaded window would look like a stranger to its peers, and
  its lease would be held by a ghost until the heartbeat aged out. Persisting the birth time also
  means a refreshed window cannot look *older* than it is and take a note back from whoever
  legitimately holds it.
- **The loser is not locked out.** It keeps the note, keeps its text, and stops autosaving — the
  buffer's `writable` flag, which discards nothing. The pane says so and offers **Edit here**, one
  button, which takes the lease back and immediately saves whatever was typed meanwhile. Obsidian's
  answer to the same situation is `note (conflicted copy).md` and silence.
- **A takeover moves our own clock rather than adding a `force` flag.** The rule stays "oldest wins",
  one comparison, computed identically on both sides — a flag would have needed its own tie-break the
  first time two readers pressed the button at once.
- **Saving announces the new mtime** so a peer holding the same note re-bases its precondition without
  a round trip. That keeps a 409 meaning "somebody we have NOT heard from" — Obsidian, a `git pull` —
  which is the only kind worth interrupting a writer for.
- **The strip reserves its height.** It can arrive while the reader is mid-sentence, and prose that
  reflows under a live caret is how someone loses their place. It is also not painted in `--danger`:
  nothing is wrong and nothing is at risk.

**The envelope is versioned, and a mismatch is DROPPED.** Two windows can be running different builds
— one tab open since this morning, one opened after a deploy — and a message shape that changed
underneath them would otherwise be parsed as something it is not. A window that cannot understand the
room degrades to "there are other windows and I cannot talk to them", which is a state it already has
to handle: `BroadcastChannel` is absent in some browsers, and there the app behaves exactly as it did
before any of this existed.

**Preferences follow the reader, not the window.** Theme and language are DEVICE preferences and a
device with two windows open is still one device; a reader who switches to parchment in one window and
finds iron-gall in the other has two apps rather than one. Broadcast from a store SUBSCRIPTION rather
than from each setter, so a change made from the palette, the settings panel or the theme picker
travels without any of them knowing other windows exist — and guarded against the echo, or two windows
ping-pong one preference forever.

**Signing out is a barrier, not an event.** A window that kept its admin shell after another signed
out would hold a tree it may no longer read and offer writes the server will refuse.

**Preview is not a sign-out, and the bus must never mistake one for the other.** `admin` also
flips false while a window previews as a visitor — `loadMe()` reports the server's word, which is
"visitor" under `X-Astrolabe-Preview` — and broadcasting that flip as an auth event made every peer
window call `logout()`, which POSTs `/api/logout`, which bumps the session epoch, which revokes
EVERY session on EVERY device. One "Preview as visitor" with a second tab open signed the owner out
of the web admin, the desktop app and the phone at once, and each fell back to the site language as
a visitor. The broadcast is guarded on `previewVisitor`, which `setPreviewVisitor` sets BEFORE the
`loadMe()` that flips `admin`, so it is a reliable witness at the moment the subscription fires.

**The language travels as the PREFERENCE, never as the language a window is showing.** A `prefs`
message carries `editorLang` — a pin, or `null` for "follow the site" — and a peer applies it with
`setEditorLang`, comparing against its own `editorLangPref`. Broadcasting the resolved `language`
pinned every peer to whatever the sender happened to be showing, including a previewing window's
site language; and comparing against `localStorage` on receipt found the key already written by
the sender and returned without repainting, so a second window kept its old chrome until a reload.

**What is deliberately NOT mirrored is the document as it is typed.** A full-text broadcast on every
keystroke is a real cost with no bound. Inside one window a second pane reads the same buffer and is
character-live for free; across windows the peer updates when the writer SAVES — one autosave behind,
which is exactly the quality of Obsidian's own linked preview at none of the cost.

## Tabs between windows (client/dragTab.ts, Tabs.tsx, PaneDropZones.tsx)

- A tab drag from ANOTHER window (desktop second window, another browser tab) is adopted: a
  `dragenter` carrying `TAB_MIME` raises a foreign drag (`pane: null, path: "", foreign: true`),
  every pane's zones rise for it, and the drop reads the payload off the DataTransfer
  (`dropPayload`) — the only moment the browser lets it be read. A foreign drag is lowered when
  the `dragover` heartbeat stops for 250 ms or a drop lands.
- The source window learns of the move from its own `dragend`: a drop no target HERE marked
  handled (`markTabDropHandled`) that still reports `dropEffect: "move"` was taken elsewhere, and
  the tab is closed in this window. Every local drop target marks itself handled, or the tab
  would vanish from the window that just re-homed it.

## Component contracts

- Shell agent owns `client/index.html` (already written), `client/main.tsx`, `client/App.tsx`,
  `client/state.ts`, `client/api.ts`, `client/components/Sidebar.tsx`, `Tabs.tsx`, `StatusBar.tsx`,
  `BacklinksPanel.tsx`. Layout: left sidebar (tree + search box + tags), center column (Tabs on top,
  then Editor or GraphView per `view`), right collapsible backlinks panel, bottom StatusBar
  (word count of open note, vim toggle, theme toggle). App wires keyboard: `Ctrl/Cmd+P` palette,
  `Ctrl/Cmd+G` graph toggle, `Ctrl/Cmd+N` new note. App subscribes to SSE → `loadTree()` +
  refresh open note if changed externally.

**EVERY WRITER CLAIMS ITS OWN WRITE BEFORE SENDING IT** (`state.ts::markSelfWrite` /
`recentSelfWrite`, read by App's SSE handler). The server writes the file and notifies its
subscribers while it is still handling the PUT, so the echo of a save OVERTAKES the response —
measured on the 1,388-note fixture, the SSE frame landed at t=4237ms and the PUT resolved at
t=4239ms. In those two milliseconds `dirty` is still true and no save has yet "finished", which is
exactly the state the handler reads as somebody else's edit: every autosave, on every note, raised
"changed on disk — your unsaved edits were kept" about the reader's own typing. The claim is made
BEFORE the request by the code that sends it (the editor's autosave and its unmount flush, the
outline's section write, the publish toggle, the banner setter) and it is PER PATH, so a save to
one note cannot swallow a genuine external change to another. The old dirty→clean stamp survives
as a second belt, for a writer some future path forgets to claim. The alarm itself is unchanged:
an external write to a DIRTY note still toasts, and to a clean one still reloads silently.

- Editor agent owns `client/editor/` and `client/components/Editor.tsx`.
  Props: `{ path: string }`. It loads the note via
  `client/api.ts` fetchers, autosaves (600ms debounce after change; also on Ctrl/Cmd+S),
  reports dirty state to store. Exports default React component.
  - `client/editor/setup.ts` — builds the CM6 `EditorState` extensions: markdown lang, history,
    search, vim (conditional), theme extension, live-preview extension, wikilink autocomplete.
  - `client/editor/livePreview.ts` — THE flagship. Obsidian-style live preview via ViewPlugin +
    Decoration: hide markdown syntax tokens (`#`, `**`, `_`, `` ` ``, link brackets) on lines the
    cursor is NOT on; style headings (sized, serif), bold/italic/strikethrough, inline code,
    blockquote bar, list bullets → `•`, checkboxes → clickable ✓ widgets that toggle `- [ ]`/`- [x]`,
    `[[wikilinks]]` → gold accent, click-with-Cmd/Ctrl (or plain click when syntax hidden) opens via
    `useStore.getState().openNote(resolveTarget(...))` — resolve by fetching graph or a
    `resolveLink` helper in `client/editor/links.ts` that matches against store tree basenames.
    `#tags` → pill styling. External urls clickable.
  - `client/editor/autocomplete.ts` — typing `[[` completes note titles from store tree.
  - `client/editor/theme.ts` — CM6 theme reading the CSS custom properties (use var() in the theme spec).
- Graph/palette agent owns `client/components/GraphView.tsx` (canvas force-directed sim,
  hand-rolled: repulsion + spring + centering, ~60fps rAF, drag nodes, click node → openNote,
  hover highlights neighbors, resize-aware, colors from CSS tokens via getComputedStyle) and
  `client/components/CommandPalette.tsx` (modal, fuzzy over: open note by title [uses
  `search` api when query nonempty, else recent/all from tree], commands: New note, Toggle graph,
  Toggle theme, Toggle vim, Delete current, Rename current [inline second input]; ↑↓ + Enter, Esc).
- Styles/vault agent owns `client/styles/tokens.css` + `client/styles/app.css`, `vault-seed/`
  (6–8 interlinked starter notes teaching the app: Welcome, Wikilinks, Graph, Editor, Tags, Daily
  Notes…, each with real `[[links]]` + `#tags`), and `README.md` (hero pitch, quickstart
  `git clone / npm install / npm start`, point-at-your-vault instructions, features, keymap table,
  screenshots placeholder, port table, license MIT). Also `LICENSE` (MIT, holder "avicenna").

## Lazy surfaces: ONE BOUNDARY EACH (`client/App.tsx`)

Every `React.lazy()` surface in the shell gets its **own** `<Suspense>`. This is a correctness
rule, not a taste one, and it is written down because the tidy-looking alternative is wrong in a
way nothing on screen explains.

A Suspense boundary is not a loading indicator. When anything under it suspends, React unmounts
**the whole subtree** and renders the fallback in its place. One boundary wrapped around the app
shell therefore meant that opening Settings — a modal — tore down the sidebar, the tabs, the
editor and the status bar along with it. With the chunk throttled the open note went to zero
characters while the reader watched, and CodeMirror was rebuilt from scratch when the chunk
landed. The fallback was `null`, so what the reader saw was the application vanishing.

It broke focus too, and this is the second bug rather than a symptom of a different one: the
dialogs capture `document.activeElement` on mount as the opener to restore on Escape
(`useDialog` in `client/a11y.ts`), and the element they were opened FROM had just been unmounted
by the very boundary that was loading them. So the first Escape of every session put focus on
`<body>`, and a keyboard reader was returned to the top of the document. **Fixing the boundaries
fixes the focus** — nothing that is already on screen is inside the boundary that suspends, so
the opener is still there to go back to.

The rules that follow from it:

- One `<Suspense>` per lazily-mounted surface. `Surface` in `App.tsx` is that boundary.
- Panes pass a REAL fallback shaped like the pane (`.s-sidebar`, `.s-tabs`, `.s-statusbar`,
  `.s-editor`, `.s-reading`, `.s-graph`) so the grid keeps its shape while the chunk lands.
  Modals pass none: a dialog arriving a frame late is invisible, a skeleton flashing where a
  dialog is about to be is not.
- Boundaries go INSIDE a ternary that chooses between two surfaces, never around it — a boundary
  around the editor/reading choice makes switching between them suspend the arm already mounted.
- A surface that is **always mounted** (`ConfirmHost`, `LoginModal`, `PreviewBanner`,
  `TemplatePicker`, `DesignStatus`) stays STATIC. `lazy()` defers nothing when the component
  mounts unconditionally — the import fires immediately — while costing a boundary and a round
  trip. Only a CONDITIONALLY mounted surface is worth splitting, which is why `ShortcutsHelp` is
  lazy AND gated on `shortcutsOpen`: gating is what makes its laziness real.
- A named import out of a lazy module is a STATIC import of that module, and silently undoes the
  split. `vimSubCopy` lives in `client/vimCopy.ts` and `openDesigner` in
  `client/components/design/openDesigner.ts` for exactly this reason — one reached into
  `StatusBar`, the other into `DesignerPanel`, and each dragged its whole surface back into the
  first paint. `npm run check-bundle` is what catches the next one.

- The reader is split TWICE, and the outer boundary is not `App.tsx`'s. The app
  shell holds only `client/books/door.ts` — a URL parser and a store call —
  and `Pane.tsx` reaches `BooksSurface` through `React.lazy`; the surface then splits the
  shelf from the reader, and `client/books/pdfjs.ts` splits the 1.1 MB engine
  from both. A reader who only browses their shelf never downloads the page
  renderer. `npm run check-bundle` names `pdfjs-dist` and the reader's
  components in FORBIDDEN and `books/BooksSurface.tsx` in MUST_SPLIT.

## Shell layout (sidebar side, collapse, zen)

Four persisted preferences live on the app root as classes: `s-app--flip`, `s-app--nosidebar`,
`s-app--zen` (plus `s-app--visitor`; `s-app--drawer` went with the drawer in 3.27.0). The panel's own collapse
stays on `.s-panel--collapsed`, as it always did.

- **Side is PHYSICAL, direction is LOGICAL — and the preference behind it is THREE-state.**
  `sidebarSidePref` is `"auto"` (the default), `"left"` or `"right"`; `sidebarSide` is the
  resolved edge and is derived, never persisted. `"auto"` means "the reading direction's leading
  edge" and is re-evaluated on **every** language change — `loadMe()`, `setVisitorLang()` and
  `setEditorLang()` all end with `set({ sidebarSide: effectiveSide(pref, language) })`. A pin names a screen edge in
  both languages and outranks the direction forever.
  Two-state was a trap: the side followed the language only while NOTHING was stored, so the
  first use of the palette command pinned it for good, a later switch to Arabic no longer moved
  it, and there was no way back short of clearing localStorage. A value written by an older
  build is a bare `"left"`/`"right"` — it was an explicit act then and it stays an explicit pin
  now, which is the whole migration: nothing is rewritten.
  The store action is `setSidebarSidePref(pref)` — one action for the palette's three commands
  and for a Settings → Appearance segmented control. **The three commands were audited against
  the theme family and KEPT.** The fifteen `Theme: <id>` rows went because a theme is a ROOM —
  it has to be looked at, the picker previews it live against the real app, and one row per
  value was 37% of the command list. These three are the complete enumeration of a THREE-STATE
  preference: each row is a finished end state that runs in one keystroke, and the hint marks
  the one in force, which is the same shape as publish/unpublish (two rows for two genuine
  states). Collapsing them would trade three direct actions for a modal, a tab and a scroll, the
  opposite of what the theme change bought — and it would put "follow the language" back out of
  reach, which is the bug the third row exists to fix. **The three `editor-lang-*` commands are
  the same shape and are there for a sharper reason**: they are the affordance you need exactly
  when you cannot read the interface, so they must not live only behind four words of Settings
  chrome in a script you are locked out of. Each names its language in that language's OWN
  script, which is what makes them findable from either side; they are admin-only, because a
  visitor's language belongs to the public EN/ع switch and nowhere else. The site's own language
  stays a Settings row: it is an editorial decision with an env var behind it, not a
  one-keystroke toggle. The grid areas (`"sidebar main panel"`)
  already follow the inline direction, so the stylesheet only needs the *disagreement*:
  `flipped = (lang === "ar") === (side === "left")` — an XOR — swaps the two grid areas and hands
  each pane the other's separator.
- **Panes are named by WHAT THEY ARE, never by the edge they are on.** "Notes sidebar"
  (`paneNotes`) and "Outline & backlinks" (`paneOutline`), in the status-bar toggles, the palette
  commands, the shortcut sheet, both reopen handles and each pane's own `aria-label` — with the
  keystroke in the tooltip. In Arabic the notes sidebar sits right and the outline panel left, so
  "the left bar" names a different pane in each language, and `Ctrl/Cmd Alt B` looked like it folded
  the wrong one. A reader of a live Arabic instance asked why "the left bar cannot be folded".
- **That XOR is also the icon rule.** The pane chevrons (panel header toggle, both reopen
  handles) point at a physical edge, so they answer to *both* switches: `[dir="rtl"]` flips them,
  `.s-app--flip` flips them, and both together cancel. That is why they cannot be a plain
  `[dir="rtl"]` rule like the other mirrored SVGs, and why the `[dir="rtl"] .s-app--flip` rule
  that resets them to `none` has to exist.
- **Collapse animates a width, never `display`.** `.s-sidebar` carries the width
  (`--sidebar-w` + 1px for its border) and `overflow: hidden`; its children are pinned to
  `--sidebar-w` so the rows do not reflow to a narrower measure while the pane closes. Same
  pattern the backlinks panel already used. 180ms, both directions, zen included.
- **THE NOTE'S TWO MARGINS ARE EQUAL IN EVERY FOLD STATE.** The owner's request was "make sure
  that the margin between open note and left/right bar is correct and nice looking even when bar
  is closed/folded" — a statement about the two margins AGREEING, and the thing to measure is the
  gap from the prose to the furniture beside it, not to the window edge.
  An earlier build pinned the column to the WINDOW's centre line instead, padding `.s-main` to
  compensate for whichever pane was heavier (`--balance`/`--slack`, both gone now). It read well
  in the two SYMMETRIC states and failed in the two that matter. Measured at 1440 with the notes
  sidebar folded: the prose sat **47px** from the panel it was pressed against and **327px** from
  the far side of the window — a third of the screen empty on one side, the text jammed against a
  wall of chrome on the other; the same 280px skew with the panel folded instead. Both-folded
  looked balanced only because the two voids happened to be equal. Single-fold is the common
  case: a reader folds ONE bar.
  So the column centres inside the box the grid actually gave it — the shell is
  `auto minmax(0,1fr) auto`, so that box already ends exactly at each pane's inner edge — and the
  ONLY padding `.s-main` keeps is `--fold-gutter` (**14px**, the width of a collapsed pane's
  reopen handle) on whichever side is folded, since the handle stands where the pane was and is
  the furniture on that side. Door and pane are then measured the same way. Two tokens on
  `.s-app` carry it, `--fold-sidebar`/`--fold-panel`, aliased into `--fold-lead`/`--fold-trail`,
  which `.s-app--flip` swaps. The padding transitions on the panes' own 180ms curve: the column
  does move when a pane folds — it must, the room it is centred in just changed size — but it
  moves as one movement and it lands centred rather than landing shoved.
  `.s-app--nopanel` exists for this and only this: the panel's collapse lives on
  `.s-panel--collapsed`, and a sibling's class is not something CSS can ask about. `.s-app--zen`
  and the ≤700px phone breakpoint zero `--fold-gutter` (no panes in the grid, no handles), and
  `.s-main:has(.s-graph)` drops the padding outright — the graph is a canvas that wants every
  pixel, not a column. Measured at 1440, all 16 combinations of side × sidebar × panel × dir:
  the two gaps agree to **1px** (that 1px being the collapsed pane's own border), against a worst
  skew of **287px** before.
- **A collapsed pane leaves a door.** `.s-reopen--sidebar` / `.s-reopen--panel` are 14px
  full-height strips on the respective edges — always visible while collapsed (not hover-
  revealed), and hidden in zen. (3.23.0 also hid it on a finger that cannot hover, where the drawer
  had a pan and a ☰; since 3.27.0 such a device gets the phone shell, and a touch laptop — a
  coarse primary pointer beside a mouse that hovers — keeps its strip.)
- **THE READING COLUMN IS MONOTONE IN VIEWPORT WIDTH, AND THE CHROME IS WHAT PAYS FOR IT.**
  Measured before this rule, `.cm-line` with a note open: 1440=648, **1024=319**, 900=480,
  768=348, 640=604, 480=444, 390=354 — the prose was a 45-character ribbon at iPad-landscape
  width, and the reader got MORE measure at 900, at 640 and even on a 390px phone than at 1024.
  That is the same non-monotonicity the status-bar ladder above spends four paragraphs
  eliminating, left in place for the thing the product is actually for. Two thresholds caused
  it, and both had been placed where the chrome wanted them rather than where the column could
  afford them: the sidebar held 292px down to 700, and the outline pane held 300px down to 1000.
  The rule is now arithmetic. **A pane may occupy the grid only at widths where the prose has
  already reached its 760px cap**, so the pane's arrival costs the reader nothing and there is no
  step to be on the wrong side of:
    - outline pane: 292 + 1 + 301 + 760 = 1354, so `BacklinksPanel`'s `NARROW_QUERY` is
      `(max-width: 1360px)` — it auto-collapses to its 14px door below that (as a viewport fact,
      never a stored preference; a deliberate open still wins and still persists).
      **AND AN AUTOMATIC COLLAPSE DOES NOT ANIMATE (3.18.1).** That threshold is crossed by a
      maximise, by a Snap, by a tiling manager, by a monitor unplugged — `DEFAULT_SIZE`'s own
      client width is below 1360, so on any display ≥1360 CSS px *every* maximise and restore
      played the 0.18s width transition with the reading column sliding ~300px under it. That is
      a window doing things by itself. `collapsePanelForViewport(b)` (client/state.ts) raises
      `paneStill` in the SAME `set` as the flag, App puts `s-app--pane-still` on the shell in the
      same commit, and `.s-app--pane-still` turns the transitions off on both panes and on
      `.s-main`'s padding. No timer, no resize listener, no `s-app--pane-drag` (which would force
      `cursor: col-resize !important` app-wide), and identical in RTL and on every OS, because it
      is a question of what is true in that commit rather than of timing. The reader's own toggle
      — the header button, the door, `Ctrl/Cmd Alt Shift B`, the palette — never raises it and
      keeps the 180ms it belongs to.
      **AND IT COMES BACK DOWN (3.18.1).** `paneStill` only ever went UP, and a window under
      1360 auto-collapses the panel at BOOT — so on a 1366 laptop the shell wore
      `s-app--pane-still` for the life of the page. Measured at 1300: `.s-sidebar`, `.s-panel`
      and `.s-main` all at `transition-duration: 0s` at boot and still 0s after the reader's own
      `Ctrl/Cmd Alt B` (and, while the drawer lived, the phone's notes drawer stopped sliding
      at all). So every reader-driven pane gesture LOWERS it in the same `set` that starts its
      own animation: `setPanelCollapsed`, `setSidebarCollapsed`, `setZen`.
      Still no timer and still no effect — the flag is what is true in the commit, and the
      commit that hands the reader their animation back is the one that starts it;
    - sidebar: `--sidebar-w: clamp(224px, calc(100vw - 776px), 292px)` — 776 = the 760px box +
      that door + both panes' 1px separators — so between 1000 and 1068 the pane takes exactly
      the surplus and the column sits at its cap, and below it the pane holds its 224px floor
      (the overlay drawer that took it out of the grid on a finger below 1000 went with the
      Classic phone layout in 3.27.0: that device gets the phone shell);
    - gutters: `--prose-gutter: min(56px, 7.37%)` (7.368% × 760 = 56) on the editor, the reading
      view and the visitor column, `min(64px, 8%)` on zen's 800px box. Exactly the shipped 56px
      wherever the measure is full, proportional below it, and CONTINUOUS — a stepped gutter
      re-introduces the non-monotonicity at its own breakpoints, which is what the old flat 56px
      (unchanged from 1440 all the way down to 768, where it was 24% of the pane) did.
  Measured after, `.cm-line` at 1600/1440/1366/1360/1359/1280/1200/1100/1024/1000/999/900/820/768/700/699/640/480/390,
  en and ar, defaults only: 648 at every width from 768 up, then 597/546/409/333 — **monotone
  non-decreasing in both languages**, document horizontal overflow 0 at every one.
- **One gesture per pane.** `toggleSidebar()` (state.ts) folds the sidebar; `Ctrl/Cmd+Alt+B`, the
  palette row and the status-bar switch all go through it. (It routed to a drawer's
  `setSidebarOpen` below the drawer breakpoint until 3.27.0, when the drawer went.)
- **THE TOUCH SHELL IS 44px EVERYWHERE, NOT ONLY IN THE EMPTY STATE.** `@media (max-width: 700px),
  (pointer: coarse)` — the same trigger as the empty state's keymap swap, because a tablet is
  1024px wide and still has no mouse — gives `.s-tree__item`, `.s-tag`, `.s-iconbtn`, the
  status-bar buttons and the mode pills a 44px minimum, and the bar itself `min-height: 44px`;
  the tab bar is 44px too. Measured at 390 and at
  1024 with a coarse pointer, en and ar: tree rows 44, tag pills 44, sidebar icon buttons 44,
  status-bar buttons 44 (bar 45), document overflow 0. Before: 28 / 26 / 24 / 17–24 — the round
  that gave the empty state its tap targets had fixed the pane it named and not the surface that
  pane points at.
- *(3.26.0: check-phone now drives the phone shell; see [The phone shell](#the-phone-shell-clientphone-clientshellqueryts-3260-finished-in-3270).)*
- **…AND 44px IS MEASURED, NOT DECLARED** (`scripts/check-phone.mjs`, 3.18.0). The rule above
  named five selectors and the shell has hundreds. A phone audit found thirty-three places it had
  never reached — the top cluster at 40×36, the drawer's three section headers at 18, the graph's
  four canvas controls at 26 (a `.s-graph__controls .s-iconbtn` at specificity (0,2,0) beating the
  floor's (0,1,0)), the sidebar calendar's days capped at 36 by their own two-class rule, the
  outline drawer's rows at 25–28, the Sigils card's five actions, the media stepper 10.6px wide
  because `flex-shrink` was left at 1 inside a row too narrow for it — plus five text fields
  under 16px and, in Arabic only, a library header that began at x=−69. Every one is a NUMBER, so
  the answer is a gate rather than another sentence: the ten main surfaces at 390×844 with a
  coarse pointer, English and Arabic, asserting no horizontal overflow, no shell target under
  44px, no field under 16px and no target whose centre another layer answers.
  **Six questions and two postures since 3.23.0**: a long site name must ellipsise inside the
  sidebar header rather than run past it (the gate swaps the name for a 45-character one and puts
  it straight back — the rule is CSS's, not this vault's), and no `.s-reopen` strip may be drawn
  on a finger. The second posture is a phone with a PEN — 720×820 at DPR 1.5 with
  `availablePointerTypes=6, primaryPointerType=2, availableHoverTypes=3, primaryHoverType=1`, a
  blink setting on its own browser because `hasTouch` overrides the pointer media — since that is
  the device the shell was wrong on and a gate pinned to 390px could not see it.
  Three things the gate deliberately does NOT hold to 44: **prose** (a link in a sentence would
  set the line height of the paragraph around it — DESIGN.md already said so), a native
  **checkbox or radio** whose `<label>` is itself ≥44 (the label is what a finger lands on; the
  Sigils card's boxes stay 24px because a 44px native box is a dinner plate), and a **data
  picture's cells** (the Sigils heat map is a year of a habit in 12px squares, and a 44px cell is
  not a bigger chart — it is no chart).
- **A MEDIA QUERY IS NOT A HIGHER RUNG OF THE CASCADE** (`client/styles/controls.css`, 3.18.0).
  The shared control set's coarse block sat beside the rule whose thought it continued, four
  hundred lines above `.s-ctl-seg__btn { min-height: 26px }` — and `min-block-size` and
  `min-height` are the same used value but two declarations, so the later one won and every
  segment button in the product (the media form's, the sigil form's eight, the settings panel's)
  measured 30px on a phone. `.s-ctl`'s own `min-height: 32px` did the same to every field. The
  block moved to the END of the file, which is the only place a floor stated in one property can
  outrank a size stated in the other. Where a coarse block is WRITTEN is part of what it says.
  Nor is it only media queries, and the round that wrote this paragraph proved it in the file
  next door: the safe-area rules gave `.s-topactions` a height of `calc(2.5rem + var(--safe-top))`
  a thousand lines above the cluster's own rule, which says `height: 2.5rem` at the same weight —
  so the height never grew, only the padding took, and on a notched phone the gear, the outline
  switch and the ⋯ ended up 22px UNDER the status bar the inset exists to clear. A declaration
  about a thing belongs in that thing's rule; a new block beside a new comment is where two
  copies of one fact start disagreeing.
  **And it is a gate since 3.26.1** (`scripts/check-cascade.mjs`), because the paragraph did not
  stop it: What's-new's count, the library-roots wrapping, three settings declarations (app.css's
  phone blocks, beaten by settings.css loading later — the panel's base moved into settings.css,
  its phone rules after it), the tag shelf's sort button and the unlinked-mentions buttons were all
  dead the same way. It reads every stylesheet in the browser's order and fails when a declaration
  in a phone/touch block is set again for the same selector by a later rule with no `@media`
  (shorthands, longhands and logical/physical twins counted as one property; a later
  `prefers-reduced-motion` or `forced-colors` rule is narrower, and allowed).
- **THE NOTCH AND THE HOME INDICATOR** (`client/index.html`, app.css "THE NOTCH AND THE HOME
  INDICATOR"). The client served a `display: standalone` manifest and a `theme-color` and then
  drew edge to edge: installed on an iPhone, the 44px top cluster sat under a 47px status bar and
  the mode pills under the 34px home indicator. `viewport-fit=cover` is what makes `env()`
  non-zero at all, and two custom properties — `--safe-top`, `--safe-bottom`, both
  `env(…, 0px)` — carry it to the bars that TOUCH an edge: the tab strip and the tool cluster
  grow by the top inset (so their own ground fills the band rather than leaving a stripe of page
  above it), the status bar and the toasts clear the bottom one. (The phone shell pads its own bars
  and sheets the same way — see "The phone shell".) A rectangular screen computes
  exactly what it computed before, which is why none of it has a breakpoint.
  The same meta carries `interactive-widget=resizes-content`, so Chrome Android shrinks the
  layout viewport for the keyboard the way the Android shell's WebView already does — the two
  clients had disagreed about where the caret was.
- **`100dvh`, NEVER `100vh`, ON ANYTHING FULL-HEIGHT.** In Chrome Android with the URL bar showing
  `100vh` is ~56px taller than the visible area, so a sheet's footer (Settings' Close/Save, the
  selection menu's last rows) hung below the bottom edge until the reader scrolled. Every
  height, max-height and block-size in `client/` now reads `dvh`; the only `100vh` left in the
  tree is one in a comment.
- **ON A PHONE, OPENING A NOTE DOES NOT OPEN THE KEYBOARD** (`Editor.tsx`, `autofocusOnOpen`).
  "Open a note" means "write in it" on a mouse and costs nothing; on a finger it costs the bottom
  half of the screen, and every open — a tree row, a wikilink, the daily note, a tab restored at
  launch — raised the IME before the reader had said they wanted to write. On a coarse pointer
  the note opens rendered and the first tap in the text focuses the editor. Nothing else moves:
  the caret restore, the heading jump and every shortcut are where they were.
- **THE HARDWARE BACK BUTTON CLOSES THE TOPMOST LAYER FIRST** (`mobile/…/MainActivity.java` +
  the phone shell's navigation, `client/phone/nav.ts`). A back is the browser's own pop, and every
  sheet, layer and overlay holds an entry of its own, so a back closes the topmost first and
  navigates nothing under it. (The Classic layout's guard entry and synthesised Escape —
  `backGesture.ts`, `backGuard.ts` — went with it in 3.27.0; see The phone shell.) The shell keeps
  the other two rungs: back one page, then — on the connection screen — "press back again to
  leave", because the front door is a thumb's width from the gesture area.
- **THE SHELL'S STRIPS FOLLOW THE ROOM** (`mobile/…/ThemeBars.java`). The status bar and the
  gesture bar were painted `iron_gall` unconditionally, so a parchment reader got a cream page
  with a black band at each end. The shell reads the page's own `<meta name="theme-color">` (kept
  on the live theme by `applyThemeChoice` → `syncThemeColour`, falling back to the computed
  `--bg`) and paints both strips, choosing light or dark glyphs by relative luminance. It POLLS
  rather than hooking a page load, because the colour changes when the reader changes ROOMS — a
  click inside a single-page app that no navigation callback fires for.
- **Zen hides chrome; it does not disable behavior.** Editor shortcuts, `Ctrl/Cmd S`, publish
  and the palette all keep working. `Esc` leaves — unless something else owns Esc (a modal, the
  palette, a text field, or vim inside the editor), which is the same precedence Ctrl+D
  established. The ✕ fades after ~2s and returns on mouse movement; while faded it is also
  `pointer-events: none`, so there is no invisible hit target.
- **Anything that reveals results must reveal its pane — and focus AFTER the reveal lands.**
  `Ctrl/Cmd+K` and the editor's tag-pill click both push into the sidebar's search box; both
  first leave zen and un-collapse the sidebar, because focusing a field the reader cannot see
  swallows every keystroke after it. But a collapsed pane is `visibility: hidden` until React
  commits the class removal, and **a hidden element cannot take focus** — `focus()` in the same
  tick as the un-collapse silently does nothing, which is the *same* failure the rule exists to
  prevent, only quieter (the field is now visible and empty, and the typing went to the page).
  So `Sidebar.revealSidebar()` reports whether it had to open anything and the focus waits for
  the commit (an effect on `zen`/`sidebarCollapsed`); only an already-visible pane is focused
  synchronously.
- **The tree's context menu is clamped into the viewport, and opens toward the reading
  direction.** It is `position: fixed` at the pointer, and the pointer is now regularly at the
  *trailing* screen edge — the sidebar sits there by default in Arabic and whenever a reader
  moves it there in English. A menu that only ever grew toward the trailing edge lost its last
  item (which is "Delete folder") off-screen. A layout effect measures the rendered menu, opens
  it from the pointer toward the inline direction, folds it back when that edge has no room, and
  clamps both axes to an 8px margin.
- **Keyboard.** The pane toggles are **`Ctrl/Cmd+Alt+B`** (sidebar) and **`Ctrl/Cmd+Alt+Shift+B`**
  (panel); they moved one modifier out when `Ctrl/Cmd+B` became bold inside the editor — see
  "Text formatting" for why formatting won it, and note that the pair KEPT ITS SHAPE (one key,
  Shift picks the second pane), so the only thing to re-learn is "add Alt". They resolve through
  `shortcutKey(e)` like every other binding — which covers both Alt rewriting `key` on macOS
  (Option+B is "∫") and the LAYOUT rewriting it (Arabic's B key types the ligature "لا") — and are
  refused while `AltGraph` is down (Right-Alt reports ctrl+alt on European layouts), a refusal the
  resolver now applies to everything rather than to these two. See "A shortcut is resolved by the
  layout first and by the physical key second".
  PLAIN `Ctrl/Cmd+B` and `Ctrl/Cmd+Shift+B` are still `preventDefault`-ed in the capture-phase
  handler next to `Ctrl+P`/`Ctrl+K` — Chrome's bookmark bar (`Ctrl+Shift+B`) and Firefox's
  bookmarks sidebar (`Ctrl+B`) must never fire — but **only OUTSIDE the editor**: CodeMirror's
  keydown pipeline opens with `if (event.defaultPrevented) break`, so swallowing them there stops
  the EDITOR as well as the browser, and the formatting binding was silently dead while that line
  stood. Inside the editor the formatting keymap's own `preventDefault: true` does the same job one
  layer down, where it can also let vim's Ctrl+B through as page-up.
  `Ctrl/Cmd+Shift+Z` (zen) `stopPropagation`s so CodeMirror cannot redo on the same keystroke —
  except on macOS inside the editor, where `Mod-Shift-z` is the *only* redo binding and keeps it.

**EVERY FOLDER STARTS FOLDED.** The tree opened its top level on a first visit and left the rest
shut; the owner asked for all of them shut. `defaultOpen()` in `Sidebar.tsx` answers false for
every depth, and the per-browser map (`astrolabe.tree-expanded`) still remembers each folder the
reader opens, so the price is one click per folder, once, and a reveal (`TREE_REVEAL_EVENT`) still
opens every ancestor of the note it is showing. Nothing else moved: the fold-all and unfold-all
commands write the same map.

## The pane grips (client/components/PaneGrip.tsx, client/paneWidths.ts)

**THE GRIP STRADDLES THE SEAM, AND IT IS A CHILD OF THE SHELL (3.18.1).** Each side pane is
resized by a 12px `role="separator"` strip with the pane's own 1px divider DOWN ITS MIDDLE —
`.s-pane-grip--sidebar` at `inset-inline-start: calc(var(--sidebar-w) - 5.5px)`,
`.s-pane-grip--panel` at `inset-inline-end: calc(var(--panel-w) - 5.5px)`, both mirrored under
`.s-app--flip`, both children of `.s-app` and rendered from App.tsx.
It was an 8px strip pinned INSIDE the pane, and that was two faults in one: it lay exactly on the
tree's scrollbar, and the hairline the eye actually aims at — the divider — plus every pixel past
it hit the `<aside>` with cursor `auto`. Measured at 1440: the pane ended at 293, the grip was
[284, 292), and `elementFromPoint(292)` was the sidebar. That is the "you have to hunt for the
exact spot" half of the Windows report. It CANNOT live inside the pane: both panes are
`overflow: hidden` (that is what makes the collapse a width animation), so a strip reaching past
the divider is clipped to nothing on the outside. Hence the hoist, and hence `.s-panel`'s width
becoming `calc(var(--panel-w) + 1px)` to match `.s-sidebar`'s stated convention — the TOKEN is
the content width — so one arithmetic serves both grips and the panel's content stops hanging 1px
past the window edge.
A press that lands on a REAL scrollbar (`offsetWidth > clientWidth`, which is Windows' classic
bars; overlay bars take no room and are not in the way) scrolls that element for the length of
the drag instead of resizing: the file list must not resize when the reader meant to scroll it.
A drag with pointer capture writes the pane's custom property on `<html>` — `--sidebar-w` (the
token in tokens.css) or `--panel-w` (`.s-panel`, `.s-panel-header`, `.s-panel-body` all read it) —
and remembers it in `localStorage["astrolabe.paneWidths"]`. **THE DRAG IS RELATIVE**: `dragWidth`
takes the pointer's DELTA from where it took hold and the pane's width at that moment, not
`pointerX - rect.left`; the absolute form snapped the pane by up to −6px on the first pixel of
movement, and seeding from the border box (293) rather than `clientWidth` (292) crept it a pixel
wider on every grab. A grab with no move leaves the stored width byte-identical.
Dragged under `PANE_COLLAPSE_AT` (112px) the pane
wears `.s-pane--leaving` and on release COLLAPSES through the store's own setter, its property
restored to the pre-drag width so it reopens whole. Double-click clears the property and the
stored width.

**WHAT IS STORED IS THE HABIT; WHAT IS APPLIED IS WHAT FITS (`layoutPanes`, 3.18.1).**
`clampPane` alone knows 168..560, which is a statement about a pane and not about a screen. One
+450px drag at 904 CSS px gave the grid `561 43 300`; adding a −300px panel drag gave
`561 0 560` with `.s-main` 0 wide, the panel's header and close toggle off-screen, the toolbar
drawn over the sidebar header — and it SURVIVED A RELOAD, because boot re-applied the stored pair
verbatim. `layoutPanes(want, room, dragging?)` is now the single owner: it clamps each pane, then
takes any shortfall out of the pane that is NOT under the hand first (down to `PANE_MIN`) so the
note keeps `MAIN_MIN` = 320px. It is called from exactly three places — boot, every drag frame,
and a rAF-throttled `resize`/`matchMedia` listener (`usePaneLayout()`, called once from App) —
so the three cannot drift. The listener is the missing piece for "resizing *windows*": a window
dragged narrow re-clamps with no reload, and widened again gives the pane back.
**AND THE WINDOW'S OWN RE-CLAMP DOES NOT ANIMATE (3.18.1).** The panes carry `transition:
width 0.18s`, so writing the clamped widths from the resize listener played that transition on
every frame of a frame drag: measured at 1440 → 904 with `{560, 560}` stored, `.s-main` was 0px
wide 30ms in and 274px at 110ms before reaching its 320px floor — the note losing its column on
every resize, which is the one thing `MAIN_MIN` is for, and the panes visibly chasing the
window edge. `applyPaneWidthsNow` wraps the write in `s-app--pane-still` on the ROOT (where the
drag's own class already lives) with a style flush either side, so the new widths are committed
under `transition: none` and the class comes off having animated nothing. ONLY the resize path
uses it: boot and every fold re-run the same effect, and a fold is the reader's gesture — the
flush there committed the collapse before the browser had a width to animate from, which is the
same fault in the other direction. The double-click reset is the hand too, and keeps its 0.18s.
`paneStyle` decides whether to write the property at all: nothing stored and room to spare means
say NOTHING, because `--sidebar-w`'s own `clamp(224px, calc(100vw - 776px), 292px)` is the rule
that hands the 1000–1068 band its surplus to the reading column and an inline `292px` would
overwrite it at exactly the widths it was written for. The root wears `.s-app--pane-drag` mid-drag (transitions off, column cursor, no
selection). The reopen handles take `reopenDragProps(pane)`: a drag inward of `PANE_REOPEN_AT`
(40px) reopens; a click still does. No grip on a collapsed pane or in zen; where
`PHONE_SHELL_QUERY` matches there is no desktop shell and so no grip to hide. The collapse
tests are `.s-app--nosidebar` / `.s-app--nopanel` now, not `.s-sidebar--collapsed` /
`.s-panel--collapsed`: a grip that is the shell's child cannot ask about a sibling's class. THE POINTER DOES NOT
DECIDE (3.18.0). The rule used to add `not all and (any-pointer: fine)` — "no grip on a device
with NO fine pointer at all", at every width — chosen over `(pointer: coarse)` because that is the
PRIMARY pointer and Chromium reports it coarse on a touchscreen laptop with a mouse attached
(3.8.2). But the any-pointer form was wrong too: Chromium on Windows answers {coarse, hover: none}
for a hardware SLATE (touch + rotation sensor + slate mode, `pointer_device_win.cc`) and an
attached mouse does not change the answer, so a convertible above 999px had a docked sidebar it
could resize by nothing (windows-plan defect F). Since 3.27.0 the panes are docked wherever the
desktop shell is mounted at all — below 700px, or on a finger that cannot hover, the phone shell
is (client/shellQuery.ts) — so the grips have no drawer width to hide at.
On a device that cannot hover the strip wears a resting 2px `--text-faint` line (3:1 on
`--bg-raised` in every room, the non-text bar), since an accent that lights under a pointer the
device does not have is a grip nobody can find; mid-drag the line is `--accent`, at full opacity,
and check-contrast holds `--accent` to 3:1 on `--bg-raised` for it.

**The split grips (Workspace.tsx `ColGrip`/`RowGrip`, 3.1.0).** Every `.s-panecol` is `position:
relative` and carries an 8px `role="separator"` on its inline-end edge when a column follows it
(`.s-split-grip--col`, over the grid's 1px gap) and one across the seam of its two panes when it
holds two (`.s-split-grip--row`, `top: calc(share·100% − 4px)`). A drag with pointer capture reads
the two live rects once, turns the pointer into the first pane's share of the pair (`shareAt()`,
flipped when the first pane starts later on screen, so an Arabic grid needs nothing stored about
sides), clamps to 10–90 %, writes the grid template straight onto the element while the pointer
moves and commits ONCE on release through `resizeCols(gap, share)` / `resizeRows(col, share)` —
store actions over the pure reducers of the same name in workspace.ts. Double-click commits 0.5.
The root wears `.s-app--split-drag` (+ `-x`/`-y`) mid-drag: no selection, one cursor, and the panes
under it lose pointer events so a canvas or an iframe cannot steal the drag.

## The status bar keeps the note; the shell's tools moved up

`StatusBar.tsx` renders two things: the bar (crumbs, counts, the published count and reach, the
Publish button, the layout chip, the mode pills) and `topTools` — the designer door, the gear, the
preview eye, the pane toggles, zen, the shortcut sheet, the theme picker, the graph toggle and the
session control — which it PORTALS into `#s-topactions`, the host App.tsx places at the top of
`.s-main` (`.s-topactions`, absolute, trailing end, 2.5rem, `pointer-events: none` with its child
`auto`). The portal's wrapper is `.s-statusbar.s-statusbar--top` so every bar rule applies, with
the chrome (height, background, border, grid-area) overridden. A ResizeObserver publishes the
cluster's width as `--topactions-w` on `.s-main`, which the shell's own strip (`.s-main > .s-tabs`,
solo only) pads by. **Split, the cluster takes a row of its own** (`.s-main:has(> .s-panes)
.s-topactions` is static, a `2.5rem` bar above the grid): the earlier rule padded EVERY split
pane's strip by the cluster's width (`.s-view:last-of-type` matched the only pane of each column),
and a 390px cluster over a 400px pane left ten pixels for the tabs — the owner's friend lost every
tab name in split view. **The strip is
a box and the tabs scroll in a box inside it** (`.s-tabs__scroll`, Tabs.tsx `scrollRef`): a scroll
container's end padding exists only at the END of its scroll, so while the strip itself scrolled,
twenty-five tabs ran under the cluster on the row's first screen. The reservation lives on the
strip, the overflow in the scroller whose width is the strip's less that room, tabs keep their
width (`flex: none`) and the active tab is scrolled into view on open and on resize. At phone
width the cluster is wider than the phone and the scroller has no room; the tabs are then out of
sight rather than under the buttons, which is the lesser lie until the cluster folds. Zen hides the
cluster. Without a host (a bare test) the tools stay in the bar. The owner's screenshot drew the
line: "the status stuff def belongs to bottom".

**The frame names what is on screen.** `openPath` is a note by contract and the mirror looks past a
book, a drawing or a virtual tab to the nearest note — right for the outline and the backlinks,
wrong for the bar, which said "No note open" over the Orbits shelf and kept a word count and crumbs
for a note nobody could see over Sigils. The crumb, the counts, the period, the layout chip and the
publish toggle answer the FOCUSED pane's surface (`surfaceOf`): over a note they are the note's;
over anything else the crumb is the surface's name — what the strip calls it (`titleOf` in
Tabs.tsx: Orbits, the deck's note in a session, Sigils, the book's title, the drawing's name, the
week in review, the library) — and the rest is absent. The mode pills stay (they are switches).

**The chrome-language key sits after the mode pills** (`.s-statusbar__lang`,
`data-testid="chrome-lang"`, admin only): its own group at the far end of the bar, a bordered key
with a globe and the OTHER language's name in its own script (`ع` / `EN`). It is in the bottom bar
rather than the portalled top cluster because it must survive every width the bar does, and it is
shaped unlike the twin pill (`EN ⇄ ع`, bare text, about the NOTE) so the two are never confused.
Its mousedown is held — switching the chrome never takes focus or the caret from the editor. The
rule and its other four faces are in contracts/i18n.md ("The way back is always on screen").

## Mode visibility (status bar, workspace, preview)

A mode that removes the ability to TYPE must be impossible to sit in unknowingly. Three surfaces
carry that, and none of them may be quiet:

- **A mode with STATES must show the state, not the mode.** VIM told the reader the extension was
  loaded; it never told them the keys under their fingers were currently COMMANDS, which is the
  actual trap — and reading mode had three surfaces to vim's one. Two pieces carry it now.
  `vim({ status: true })` (`client/editor/setup.ts`) mounts vim's own panel at the foot of the
  editor: that panel draws `-- INSERT --` / `-- NORMAL --` **and** hosts the `:` and `/` command
  line, so a modal editor finally has a command line. `client/editor/vimStatus.ts` forwards vim's
  `vim-mode-change` into `state.vimSubMode` (`"normal" | "insert" | "visual" | "replace" | null`,
  never persisted, written only by that module) and the pill renders it as a second word behind a
  hairline — **VIM │ INSERT**. It attaches on `setVim(view, true)` and on mount (the module may
  already be cached, in which case setVim's async path never runs), and detaches on unmount and
  on switching vim off. Nothing imports `@replit/codemirror-vim` statically for this: `getCM(view)`
  is `view.cm`, and the load must stay on demand.
- **The status-bar cluster is switches, not labels.** `.s-modes` holds a `ModePill` per mode —
  READING, VIM (admin) and PREVIEW (while previewing). ON is `--accent`-filled with `--bg` text, a
  dot and a glow (that pairing clears 4.5:1 in every built-in theme: the dark themes carry a light
  accent, parchment a dark one); OFF is a calm outline. Each pill LEAVES its own mode on click and
  its `title` names the keystroke. Every rule is scoped `.s-statusbar .s-mode…` — `.s-statusbar
  button` is `(0,1,1)` and would otherwise repaint the pills with the muted button color, the same
  trap the sync badge documents.
- **In zen the strip is the ONLY place a mode can live**, because zen takes the status bar — and
  with it the whole pill cluster — to zero height. Reading already survived into zen; vim did not,
  so ZEN + VIM was a modal editor with nothing on screen at all. `.s-modebar--vim` renders on the
  same terms as the reading strip but **only in zen** (outside it the pill carries the sub-mode,
  and a permanent second row would push every note down for every vim user). The two are mutually
  exclusive by construction — reading unmounts the editor, so there is no vim to report — which is
  why the zen ✕ offset keys off `.s-app--modebar` (either strip, one row's worth) rather than
  `.s-app--reading`.
- **The workspace says it too.** `.s-app--reading` (admin, editor view, note open, not previewing)
  draws `.s-modebar` — one line, IN the flex column above `.s-view`, so it pushes the note down
  instead of floating over it — plus an accent rule on `.s-view::before` at `inset-inline-start`
  (a pseudo-element, not a border: a border would shift the prose 2px every time the mode flips,
  and a physical `left` would land on the wrong edge in Arabic).
- **A 404 inside visitor preview is the CORRECT answer, and must not be dressed as a fault.**
  `setPreviewVisitor(true)` cannot scope the open tabs until `loadTree()` answers, and in the
  meantime the reading view refetched the open note with the visitor header on — so the eye
  button, whose entire job is letting the owner inspect his own site, opened by announcing
  "Failed to open <path>" about a site that was fine. Two halves: `openPath` goes to **null** for
  the length of the transition (drop the tab before the view refetches, restore it if it
  survives), and when the note does NOT survive the scoping the store says why in its own words
  — `previewNotPublishedNamed`, naming the note. Independently, `client/api.ts` throws
  `ApiError` carrying the STATUS and exports `isNotPublishedError()`, so `ReadingView`/`Editor`
  answer a preview 404 with the calm `previewNotPublished` instead of the generic
  `openFailed`. `toast(msg, "error")` finally applies `.s-toast--error`, which existed in
  app.css and was never once set.
- **Inside preview the tail control is "Exit preview", not "Sign in".** The session IS still an
  admin one — the shell is only wearing a visitor's clothes — so `signInTitle` ("Sign in to edit
  this vault") was a promise the product could not keep: the modal opened, the password was
  accepted, and the shell stayed a visitor shell.
- **Visitor preview is a TOP strip that offsets the page, and it is never persisted.** In the app
  shell `.s-app--preview` adds a `notice` grid row above every pane (the flipped variant carries
  both classes so it outranks `.s-app--flip`), and the reopen handles start below it. In the blog
  shell the strip is the first child of `#root`, which becomes a flex column (`:has()`) so
  `.s-blog`'s own scroller takes what is left — the blog's sticky nav then sticks to the top of
  THAT scroller and the two can never share a band. Nothing may overlay the site at either edge:
  preview exists so the owner can judge his own layout. `Esc` exits, the store no longer writes
  `astrolabe.preview`, and boot clears any value an older build left behind — a reload always returns
  the admin to the app.
- **Discoverability is chrome, not folklore.** The status bar carries icon toggles for the
  sidebar, the right panel, zen and `Ctrl/Cmd+/`; a collapsed pane's reopen handle sits at a
  visible rest contrast (accent-tinted ground + a lit edge facing the content), never a
  hover-reveal. **The heading fold chevron answers to the same rule** (`preview.css`
  `.cm-s-foldbtn`): it rested at `opacity: 0` and rose to 0.6 only on `.cm-line:hover`, so only
  the hovered heading ever showed one, nothing on screen said a document folds at all, and on a
  touch device folding was unreachable. Naming it in the `Ctrl/Cmd+/` sheet was documenting an
  invisible control, not fixing one. It rests at full strength in `--text-faint` (a UI glyph,
  held to the 3:1 non-text bar — a bar `check-contrast.mjs` now ENFORCES, on both grounds, which
  is what made parchment's 2.50:1 faint a failure instead of a footnote), steps to `--text-muted`
  on the line and to `--accent` on itself.
  The sheet now names the KEYSTROKE too (`Ctrl/Cmd Shift [` / `]`, `Ctrl/Cmd Alt [` / `]`).
- **`ShortcutsHelp` rows that light up must DO something.** Every row carried a hover highlight
  while being a plain `div` — an affordance lie that read as a selection. Rows with a `run`
  (palette, quick search, graph, daily note, reading, zen, vim, preview, themes, settings, both
  pane toggles) are `<button>`s that close the sheet and then run the command; rows that only
  document an editor keystroke are inert and carry no highlight at all. Search is RANKED, not
  substring-filtered: "fold" used to put *Next / previous file in the folder* above *Fold a
  section* under a NAVIGATION heading, so a word that opens a row's own label outweighs one
  buried inside another word, and the GROUPS sort by their best row (otherwise the winning row
  is still under whichever heading the authored order happens to put first). `\b` is ASCII-only
  in JS, so the word-boundary test is a `\p{L}\p{N}` lookbehind done by hand — this sheet is
  searched in Arabic.
  **Rows are filtered by SHELL as well as by session.** The blog visitor was being served the
  app's sheet: `admin` dropped the write rows, but Command palette (Ctrl/Cmd+P — nothing
  mounted), Graph view, Zen mode, Browse themes "via Status bar" (a surface the blog has not
  got) and both pane toggles survived — six rows naming controls that are not on the page, three
  of them `<button>`s firing commands into a shell that holds none of that state. So `Binding`
  carries `shell?: "app" | "blog"`, filtered exactly like `admin`, and `App.tsx` mounts
  `<ShortcutsHelp shell="blog" />` in the blog branch. What survives there is what is true
  there: Ctrl/Cmd+K (the blog's own search overlay answers it), a click on a wikilink, Esc and
  Ctrl/Cmd+/ itself — which is why `scHelp` moved to the end of NAVIGATION, the one group both
  shells have. **And the keyboard follows the same line**: `App.tsx` swallowed `p`/`k`/`b`
  unconditionally, ahead of every shell check, so an anonymous reader lost the browser's print
  dialog and Firefox's bookmarks sidebar to two commands that do not exist for them. Only `k` is
  taken in the blog shell; everything else returns before it acts.
- **The bar's order of sacrifice is written down, it is MONOTONIC, and it ends in a scroll.**
  `.s-statusbar` is `overflow: hidden`, so anything past its width vanishes with no scrollbar and
  no hint. At ≤1280px the two counts go (as ONE group — `.s-statusbar__ambient`); **in the phone
  shell** (`PHONE_SHELL_QUERY`'s own condition, not a second width of its own) the pane cluster and the crumb trail go, every
  group's hairline drops
  **and the bar becomes `overflow-x: auto`** (scrollbar hidden), because a phone can always be
  narrower than the controls that must stay — sign-out was falling off that hidden overflow, and
  there is no other way out of a session on a phone. The MODE PILLS never go. Each of those rules
  is scoped `.s-statusbar .s-…`: the base `.s-statusbar .s-statusbar__panes` is (0,2,0), so a bare
  `.s-statusbar__panes { display: none }` in a media query loses to it however late it sits — the
  same specificity trap the pills and the sync badge document. The bar's own padding is logical
  (`padding-inline: 14px 10px`); the `0 10px 0 14px` shorthand it replaced put the wider pad on
  the screen's left in both directions.

  **Identity outranks trivia at every width**, and the order above is only half of what enforces
  it. `.s-statusbar__crumbs` carried `min-width: 0`, so at 1024px the trail was crushed to
  `1 - … › Re…` while "140 words · 2,012 chars" AND "18 published notes" both rendered at full
  width — the bar was strictly WORSE at 1024 than at 900, where the counts finally dropped and
  the trail came back whole. So the crumb takes a floor of `min(20ch, 32%)`, released again at
  ≤900px once there is nothing ambient left to spend. The counts' threshold had to clear 1100
  rather than sit on it for the same reason: with the crumb no longer absorbing every overflow,
  an admin bar carrying the counts at ~1120px pushed sign-out onto the hidden overflow instead,
  which is trading one silent loss for a worse one. Measured on the 1,389-note fixture with
  publish, the published-note filter and both mode pills up.

  **A floor alone is not enough, because the trail's natural width is a VAULT PATH.** The crumb
  was the only unbounded item in the bar, so flexbox took every shortfall out of it. A
  two-segment crumb (223px) first gives ground at 1160px — safely under the 1200px step, which
  is why the ladder read as correct. A THREE-segment one (`1 - Source Material › Wiki › Nobel
  Prize in Physiology or Medicine`, 408px) first gives ground at **1340**: between 1200 and 1340
  the trail was crushed to make room for "140 words · 2,012 chars" and then sprang back to full
  at 1200 when the counts left. The bar was better at 1200 than at 1280 — the same
  non-monotonicity the floor was added to fix, moved to another width by a deeper path. So the
  trail takes a CEILING as well, `max-width: min(44ch, 36%)`: it can no longer be the fat item,
  the counts' departure hands it nothing back, and the ladder is path-INDEPENDENT.
  A ceiling worth having (~340px, most of that three-segment path) puts the first crush at ~1277
  in English and ~1224 in Arabic, so **the ambient pair now drops at ≤1280 rather than ≤1200** —
  a character count at 1280 traded for a hundred more pixels of the note's own name at every
  width, which is the trade this bar exists to make. Re-measured 1440→640 in both languages with
  the sync badge, publish, the published filter and both mode pills up: the crumb's width is
  monotonically non-increasing at every step (en 334·334·334·334·334·334·311·271·231·191·131·0,
  ar 354·…·254·214·154·0) and nothing ever lands on the hidden overflow.

  **When the trail must give, the FOLDERS give — never the note.** Segments shrank equally, so
  `1 - Source Material › Wiki › Nobel Prize in Physiology or Medicine` truncated to
  `1 - Source Material › Wiki › Nobel Pri…`: two folder names intact and the one string that
  answers "which note am I in" cut off. `StatusBar` renders the ancestors and their separators
  as ONE ellipsizing run (`.s-statusbar__crumbpath`, shrink factor 12) beside the leaf (shrink
  1), so the path thins to `1 - Sourc…`, then to `…`, then to nothing before the note's name
  loses a character. Grouping is what keeps that honest: per-segment shrinking left the elided
  ancestors behind as bare `› ›` chevrons, because a separator between two collapsed spans is
  still a separator. Each segment keeps its own `dir="auto"` inside the run.

  **The right cluster is GROUPS, marked once each by a hairline** — `.s-statusbar__group` for
  admin tools (gear, eye), for the view controls (theme, graph) and for the session control
  (sign-out / exit-preview), plus the existing `.s-statusbar__panes`. Separator dots between some
  neighbours and not others made eleven controls read as one undifferentiated icon strip; the
  hairline is the same separator the sync lines already use, and it drops on phones where the
  groups are neighbours anyway.

  **And that was only four of them, so the bar shipped BOTH separator systems at once.** The
  counts, the publish toggle, the published-note count and the mode pills were still separated
  by `·` — `.s-statusbar__dot` rendered three times in `StatusBar` and a fourth inside
  `SyncBadge`, which printed its own trailing dot — so a 1440px admin bar drew three middots and
  four hairlines, which is exactly what DESIGN.md forbids. **Every right-cluster segment is a
  group now**: `.s-statusbar__panes`, `.s-statusbar__group`, `.s-modes` and `.s-syncwrap` share
  one rule, `.s-statusbar__dot` is gone from the codebase, and the mark belongs to the BAR's
  grammar rather than to whatever a segment happens to contain (which is why `.s-modes` and the
  sync badge are marked from `app.css` and not from their own components — and why it is
  `.s-syncwrap`, the root `SyncBadge` returns `null` instead of, rather than `.s-sync` inside
  it: a hairline in front of a badge that drew nothing is a rule separating nothing).
  Two gaps survive the shared rule on purpose (`.s-modes` 5px, `.s-statusbar__ambient` 10px):
  pills are not icon buttons and two runs of text at 2px are one run of text.

  **THE TWO COUNTS ARE ONE GROUP, and that is what makes the ladder safe.** `words · chars` and
  `N published notes` sit in `.s-statusbar__ambient` (the publish TOGGLE, which is an act rather
  than trivia, moved out from between them into its own group and survives to the phone). They
  are one unit of sacrifice as well as one group: the ≤1280 rule drops the GROUP, because
  hiding two members of a group individually leaves the group's own hairline and padding behind
  with nothing inside them.

  **The segment that OPENS the cluster carries no rule.** A hairline is a separator; on the
  leading edge of the first segment it has nothing on its far side but the flexible gap, and it
  reads as a stray tick floating mid-bar. Which segment is first depends on the session (a
  visitor has no publish, no modes and no admin tools; no note open means no counts), so it is
  matched positionally — `.s-statusbar .s-statusbar__spacer + *` — and never named. The `+`
  combinator still matches a `display: none` sibling, so the ≤1280 block repeats the
  suppression as `.s-statusbar__ambient + *`: without it a stray tick appears at 1280 exactly
  where one disappeared. Both selectors are (0,2,0) and sit after the group rule, which is what
  makes them win — the same specificity trap as everything else scoped to this bar.
  Measured 1440→390 in both languages with publish, the published filter, both mode pills and
  the sync badge up: `.s-statusbar__dot` count 0 at every width, exactly one segment at 0px
  border and the rest at 1px above 640, all segments at 0px below it, and nothing on the hidden
  overflow.

**A SHORTCUT IS RESOLVED BY THE LAYOUT FIRST AND BY THE PHYSICAL KEY SECOND** — `client/keys.ts`,
and the whole of it goes through `shortcutKey(e)`. `KeyboardEvent.key` is what the LAYOUT
produced, and `App.tsx` compared `e.key.toLowerCase()` to Latin letters, so on the owner's Arabic
keyboard — where the physical P key reports `"ح"`, K reports `"ن"`, G `"ل"` — **every global
shortcut in the product was dead**, in an app that ships a complete Arabic translation and mirrors
its entire layout for it. Measured by `scripts/check-layouts.mjs` before the fix: 5 of 7 bindings
dead under Arabic, Russian and Hebrew, 4 of 7 under Greek. Only two bindings carried an `e.code`
fallback, and only while Alt was held.
- **The rule.** If the layout produced a printable ASCII character, THAT is the key. Only when it
  did not — a non-Latin script, a dead key, `"Unidentified"`, an empty `key`, macOS's Alt-mangled
  `"∫"` — does the physical position (`e.code`, then legacy `e.keyCode`) answer.
- **Physical does not simply win, and that is the load-bearing half.** On Dvorak `b` is under the
  physical N key and the physical B key types `x`; on AZERTY `z` is under the physical W key, and
  Ctrl+Shift on the physical Z key there is `Ctrl+Shift+W` — *close the window*. A reader who
  learned "Ctrl+B is bold" learned it about the key that TYPES b. Resolving by `code` alone would
  bold from the wrong finger and do nothing from the right one: the same bug aimed at a different
  reader. Layout-first is the convention VS Code, Chrome and Firefox settled on, and — arrived at
  independently — the one CodeMirror's own keymap already follows.
- **AltGr returns `null`, for every binding.** On several European layouts Right-Alt reports as
  ctrl+alt, and AltGr+E on Polish is how you type `ę`. Resolving that to the physical E would
  break TYPING in order to fix commands. The two hand-written `!e.getModifierState("AltGraph")`
  guards on the pane and template toggles are gone — the resolver does it once, for everything.
- **Named keys are not resolved at all** — `Escape`, `Enter`, `Tab`, the arrows are the same key
  on every keyboard on earth, so the palette, the pickers, the blog search overlay and the
  confirm dialog match `e.key` directly and were never affected. Plain typing is likewise never
  rewritten: `Select.tsx`'s typeahead follows the layout, which is the only thing it could mean.
- **The editor agrees with the app, and reuses its own keymap to do it.** CodeMirror resolves keys
  itself (`runHandlers` → `keyName(event)`, with a `base[event.keyCode]` fallback), which is why
  Ctrl+B still bolded on Russian and Greek while nothing else worked. It has three holes: its
  fallback requires the layout's output to be ONE code point — and Arabic 101 puts the lam-alef
  ligature `"لا"`, two code points, on the physical B key — it depends on the deprecated `keyCode`,
  and on Windows it declines every ctrl+alt event as AltGr whether or not AltGr was pressed.
  `client/editor/layoutKeys.ts` closes all three WITHOUT binding anything of its own: when the
  layout produced no Latin character it synthesizes the keydown that same physical key would have
  sent on a US keyboard and pushes it back through CodeMirror's own `runScopeHandlers`, so bold,
  save, search, undo and every default answer with no second table to drift. It carries a US
  `keyCode` because that is how CodeMirror reaches a SHIFTED binding (`Mod-Shift-x` is found
  through `shift[keyCode]`, not through the key name), and it sits at `Prec.highest` — which puts
  it ahead of every keymap and still BEHIND vim, because vim arrives as a ViewPlugin and
  `InputState.runHandlers` runs plugin handlers before facet handlers whatever their precedence.
- **The gate is a layout matrix, and it is two-sided.** `tests/shortcuts.test.ts` resolves all 22
  documented character bindings under Arabic, Persian, Russian, Greek, Hebrew, US, AZERTY and
  Dvorak, and asserts the fallback does NOT fire where the layout answered.
  `scripts/check-layouts.mjs` does the same against the real app through the DevTools Protocol
  (`Input.dispatchKeyEvent`, which is the only way to set `key`, `code` and `keyCode`
  independently — Playwright's keyboard always sends the US `key` for a `code`). 65 checks.
  Cases the browser cannot deliver — Chromium flattens a two-code-point `key` to `""` — live in
  the node test. **A binding added to `ShortcutsHelp` and not to `BINDINGS` in
  `tests/shortcuts.test.ts` is a binding untested on every non-Latin keyboard on earth.**
- **Known limit, stated rather than hidden:** vim mode's own keys (`Ctrl+D`, `Ctrl+U`, and every
  normal-mode letter) still resolve through `e.key` inside @replit/codemirror-vim. Vim on a
  non-Latin layout is unusable for a larger reason — `hjkl` are Arabic letters there — so this
  is not papered over with a fallback that would only half-work.

**`Ctrl/Cmd+/` opens `ShortcutsHelp` (`shortcutsOpen` in the store).** Searchable, grouped
Navigation / Editing / Modes / Publishing / Panels, `Esc` closes, also reachable from the palette
and the status-bar `?`. Rows with no keystroke still appear, naming the surface that carries them
("Command palette", "Status bar", "Click") — the reader is asking "how do I do X".

- **The sheet does not print a letter the reader cannot type.** Every row said `Ctrl/Cmd + P`;
  on an Arabic keyboard that key types `ح` and nothing on the sheet said so. Where the browser
  will tell us — Chromium's `navigator.keyboard.getLayoutMap()` — `client/layoutMap.ts` reads the
  layout once (on open, not at module load) and the sheet prints BOTH: the position `P` and the
  character `ح` beside it, under a one-line explanation (`scLayoutNote`). Shown **only** when the
  layout types none of these letters, so a US, AZERTY or Dvorak reader sees the sheet exactly as
  before — their `b` key is labelled B, they press it, bold happens. Where the API does not exist
  (Firefox, Safari, an insecure context) the map is empty and nothing is claimed that is not
  known, which is the whole bar for a legend.
- **Letters only.** The layout map reports each key's UNSHIFTED character, and a punctuation
  binding may live behind Shift: ЙЦУКЕН has no slash on the slash key at all — it types `.`, and
  the Russian reader's `/` is Shift+Backslash, which arrives as `"/"` and is answered by the
  LAYOUT. Annotating `/` from the unshifted map would print `.` beside it and be precisely the
  lie this removes.

**A KEYMAP IS NOT AN ANSWER ON A DEVICE WITH NO KEYBOARD.** `.s-empty` (App.tsx, no note open)
showed one thing: a grid of `Ctrl`-combination chips. At 390×844 that was the first screen after
signing in — seven hints for controls the device does not have, the grid exactly as wide as the
viewport so the first chip sat flush at x=0 with no gutter, and one label wrapping inside its
cell, which makes that grid ROW taller than its neighbours and throws the legend out of true.
The empty-state rules carried no media query and no pointer query at all.
- **Both halves ship in the DOM and CSS picks**, at `@media (max-width: 700px), (pointer: coarse)`
  — the pointer half matters on its own, because a tablet in landscape is 1024px wide and still
  has no `Ctrl` key. No resize listener, no first-paint flash, nothing for JS to get wrong.
- `.s-empty__touch` offers what the legend was only NAMING: the recent notes, then New note
  (admin), Search notes and Graph view. Every target is ≥44px tall. *Search notes* goes through
  `openQuickSearch()`, which dispatches `astrolabe:quicksearch` a frame later;
  `Sidebar.revealSidebar()` un-collapses and un-zens. (It opened a phone drawer first until
  3.27.0; a phone gets the phone shell's Search now.)
- **Recent notes live in App, not in the store** — `localStorage["astrolabe.recent"]`, ≤12 paths,
  written by a `useStore.subscribe` on real `openPath` changes (not by a render value, which
  would reorder the list on any unrelated re-render), five shown. Nothing else remembers this:
  the store persists open TABS, and by definition there are none when this pane is on screen.
  Paths are re-checked against the LIVE tree (`collectNotes`) before anything is drawn, so a
  deleted note, a sign-out and an admin previewing as a visitor each narrow the list by
  themselves rather than leaking a title to somebody who may not see it.
- The desktop legend keeps DESIGN.md's two-column grid but on `repeat(2, max-content)` with
  `white-space: nowrap` chips, dropping to one column at ≤1100px. Measured, not guessed: the
  centre column is the window minus a 280px sidebar, a 300px panel and this pane's own 24px
  gutters, which is 396px at 1024 against a legend measuring 400 in English and 423 in Arabic —
  the Arabic one sets the threshold. `.s-empty` takes `padding-inline: 24px`, because a centred
  child wider than its box overflows at BOTH ends silently, and a gutter is what turns "it does
  not fit" into something visible. `.s-empty__key` is `--text-muted`: these are labels naming a
  thing, and DESIGN.md holds those to 4.5:1. `.s-empty__glyph` lost its `opacity: 0.7` for the
  reason DESIGN.md gives — a fade over a token already at its floor fails the floor without
  failing the gate (0.7 of parchment's faint is 1.75:1).

**Pointer hover must never decide what `Enter` runs.** The palette (and the blog search overlay)
open under wherever the cursor is resting, and `mouseenter` on the row that materializes there used
to move the selection silently. So hover is IGNORED until the pointer actually moves: a list-level
`mousemove` arms the rows only when its coordinates differ from the previous one (browsers emit a
synthetic move after layout/scroll changes, and one of those must not count), every keystroke and
every query change disarms it and resets the selection to row 0, and rows select on `mousemove`
rather than `mouseenter`. Clicking always activates regardless.

**A command row has to EARN its place, and the rank is a number both kinds carry.** The palette's
match was a plain subsequence test that rejected only a MISSING character, and the whole matched
command block was concatenated on top of the whole note list — so `sort` put *Design your site*
(`de**s**ign y**o**u**r** si**t**e`) above every note in the vault. Three rules, all in
`CommandPalette.tsx`:

- **A floor.** `normalize()` divides the raw fuzzy score by the query length, which turns it into a
  per-character QUALITY comparable across queries: a contiguous run at a word start pays 7–8, an
  acronym over word starts 3.5–5.5, a subsequence scattered through unrelated words 2.5 or less.
  `COMMAND_FLOOR = 3` sits in that gap — measured against the whole table and written into
  `tests/paletteRank.test.ts`, which is the test that says which way the floor has to move if a
  bonus is ever retuned: the F18 trap scores −0.75, the weakest match anyone MEANT (`tg` →
  *Toggle graph*) scores 3.5. The floor is not asked to separate perfectly, only to delete the
  class of match nobody meant; above it, the cap and the sort do the rest. It is applied to the
  label and to the hint SEPARATELY, before the hint's demotion, or every searchable hint would fail
  it — hints are visible row text (`marginalia` / «الحواشي») and must stay findable.
- **A cap.** `MAX_COMMAND_ROWS = 5`. Past the fifth the list has stopped answering the query and
  started reciting the table.
- **One yardstick for both kinds.** A note hit is scored by the same fuzzy pass over its TITLE;
  a body-only hit takes `BODY_ONLY_SCORE`, just under the floor. Notes keep the server's relevance
  order exactly — re-sorting them by title fuzz would throw away everything MiniSearch knows about
  the body — so the interleave is a PLACEMENT: the command block is inserted after the leading
  notes that outrank its best member, and each kind stays one run under one section caption. A
  row-by-row weave prints *Commands / Notes / Commands / Notes* down the panel, which is four
  captions saying what the row icons already said. An exact tie goes to the command.

`fuzzyMatch` tries EVERY position of the query's first character as an anchor and keeps the best
pass. One greedy pass is enough for a yes/no answer and wrong for a ranking: `note` against
*Design Notes* latches onto the `n` of *desig**n*** and never sees the whole word two characters
later, which is how a note lost to four chrome rows in its own vault.

**Two prefixes, one mode.** `@` and `#` both enter heading-jump over the OPEN note's anchor table
(headings + LaTeX `\label`s), because readers arrive from editors that disagree about which
character means "heading". Both are gated on a note being open, and that gate is also the fallback
that makes the choice safe: with nothing on screen to walk, `#tag` is an ordinary note search and
runs as one. `#` is deliberately NOT a second mode (tag filtering): the search box filters a vault,
this list walks the open note, and the palette does not need two answers to one keystroke. The
placeholder and the no-matches block name both characters — the mode was reachable only by a
character you had to already know, which is a mode nobody has.

**`Ctrl/Cmd+K` remembers where it came from.** App records the focused element before dispatching
`astrolabe:quicksearch`; `Esc` inside `.s-search` returns focus to it (falling back to `.cm-content`,
and to a plain blur when the reading view has nothing focusable), because a search box on the far
side of the screen that only closes leaves the next keystroke nowhere. The blog overlay does the
same with its own ref.

## The tree's arrangement (client/treeOrder.ts, Sidebar.tsx)

Per browser (`localStorage["astrolabe.treeOrder"]`: `sort` name|name-desc|manual, `order` parent →
child names, `pinned` paths ≤ 40): `orderChildren()` runs in `TreeChildren` after the attachment
and focus filters, keyed by the `parent` prop each row passes down (`""` at the root, `PINNED_PARENT`
— a NUL-prefixed sentinel — for the scratch area). A sibling dragged over the top or bottom edge of a
row (a quarter of a folder row, half of a note row) wears `.s-tree__item--insert-before/after` and on
drop calls `reorder()`, which switches the sort to manual; the moved names are the drag GROUP
(`dragGroup`: the selection's top-level items when the dragged row is selected, else the row) that
share the target's parent. Group drops into a folder move every item that `canDrop`. The selection
(`selected`, Ctrl/Cmd-click) is session state; the menu's Move/Pin verbs apply to the whole
selection when the clicked row is in it. Pinned rows render as a second `TreeChildren` above the
vault with `focus={null}`; focus (`inFocus`) is session state with a banner. "Collapse/Expand
everything inside" writes the expanded map under one folder (`setFoldersUnder`) and remounts.

## The graph is a tab (client/workspace.ts `GRAPH_TAB`, 3.1.0)

The vault graph used to replace the whole working area under `view === "graph"`. It is now a TAB
whose path is the sentinel `"~graph"` (no extension, so never a note; the tilde keeps it out of
every folder): `isTabbablePath()` admits it, `surfaceOf()` answers `"graph"` when it is the active
tab, and `Pane.tsx` mounts `GraphView` (lazy) in that pane. `View` lost its `"graph"` member;
`setView("graph")` opens the tab in the focused pane (`openInPane`), `toggleGraph()` opens it or
closes it when it is already active (`Ctrl/Cmd G`, the status-bar button, the palette, the desktop
menu), `graphOpen()` says whether the focused pane shows it. The mirror looks past it like a
drawing (`openPath` is never `"~graph"`); the router answers `/graph` for it and opens it from
`/graph`; `Tabs.tsx` titles it `docTitleGraph`. Clicking a node opens the note as the tab beside
it, which is the flip-flop the owner asked for; the tab drags, splits, pins and closes like any
other, and a restored session brings it back. `PaneMode` still lists `"graph"` for old stored
workspaces, unused by anything that opens the graph now. **The Media page is a tab on the same
terms** (`MEDIA_TAB = "~media"`, `isMediaTab`, `isVirtualTab` for the pair; `setView("media")`,
`toggleMedia()`, `mediaOpen()`; the router answers `/media`).

**THE CALENDAR IS A TAB TOO, from 3.18** (`CALENDAR_TAB = "~calendar"`, `isCalendarTab`,
`surfaceOf` → `"calendar"`; `setView("calendar")`, `toggleCalendar()`, `calendarOpen()`; the router
answers `/calendar`; `Tabs.tsx` titles it `calendar`; the page is `client/calendar/CalendarView.tsx`,
a lazy chunk check-bundle pins). It was a card at the top of the Sigils page in 3.17 and the owner
wanted it out — "kinda weird and useless in the sigils window… maybe just give it its own window
and icon on the top". So it became a page, with the fourth door in the status bar's admin group
(a leaf of the month), a palette row and a row in the phone's ⋯ menu. *What the page draws, and why
it draws its own grid rather than the sidebar's, is settled once under **The Calendar page** below;
this paragraph is the tab model only. Do not restate the drawing here — an earlier draft of this
line claimed the page reuses `CalendarGrid.tsx` and that `client/loggedDays.ts` has two callers, and
both were false by the time it shipped.*

## The graph view's own settings (client/graphPrefs.ts, GraphView.tsx)

**THE GRAPH OPENED GREY, AND THAT WAS A BUG, NOT A LOOK.** The keyboard route lights the node its
cursor rests on and dims the rest to 15%, and the cursor rested on the open note from the moment
the view opened, so a reader who had not pressed a key saw a thousand grey discs and one gold one.
The owner met it as "the colour of nodes is lame if you are not highlighting them". The canvas now
takes the cursor only while the node list HOLDS focus (`listFocused`); a highlight is an answer to a
question, and nobody had asked one.

**A NOTE IS COLOURED BY WHERE IT LIVES.** `colorBy` is `folder` (the default; one or two path
segments deep), `tag` (a note with several tags belongs to its most common one across the vault,
ties to the tag the author wrote first) or `none` (the old degree ramp on the theme's node ink).
`groupNodes()` is the pure half and is tested; the view turns its answer into a `fills` map and
hands it to the simulation, whose buckets are keyed by fill colour rather than by degree shade, so
a dozen folders cost the canvas a dozen paths, as thirty-three shades did. The palette is twelve
hues tuned for a dark ground and twelve deepened for a light one (`graphPalette(dark)`, read from
the theme's own `color-scheme`), assigned largest group first so the biggest groups are the most
distinguishable; a thirteenth group takes a hue hashed from its name so it keeps it across
reloads; the vault root and the untagged bucket take the theme's node ink, because they are
"everything else" and should read as such. The legend's swatch is the `<input type="color">`
itself, and an override is kept per colouring so switching folder ↔ tag loses neither set.

**TAGS CAN BE GATHERED, AND THE FIRST TAG CAN WIN.** `prefs.tagPick` is `common` (the default
above) or `first` (the tag the author wrote first names the group — "this note is mostly about").
`prefs.tagGroups` is a list of `{ name, tags }` gatherings; `tags` is the reader's own text, split
on commas and spaces by `tagGatherings()` only when the graph is coloured, so typing never fights a
parser. `groupNodes()` takes `{ pick, gatherings }` as its fourth argument: every gathered tag is
replaced by its gathering's name before counting, so "raft, paxos" under "systems" is one tag. A
tag in two gatherings belongs to the first; a gathering with no name gathers nothing. The panel
has its own close (`.s-graph__panel-close`) and closes on Escape — capture phase, one press per
layer, and a field with text keeps Escape for itself.

**FILTERS REMOVE A NODE FROM THE FORCES, NOT ONLY FROM THE PAINT.** A hidden node (a legend group
switched off, an orphan under `hideOrphans`, a degree under `minLinks`) leaves `nodes` and `edges`
but keeps its place in `all`, so unhiding it puts it back where it was rather than at its seed;
`setData` likewise carries positions over for ids it already holds. A change in what is on the
canvas or in the forces reheats; a recolour does not. The search field is the one thing here that
is session state: it lights the matching titles the way a hover lights a neighbourhood
(`matchSet` stands in for the hover set), and the pointer still wins while it is on a node.

**THE MOTION IS CALM ON PURPOSE.** "Too quick" was the owner's word: the speed cap went from 40
to 16 world px a step, damping from 0.82 to 0.86, the reheat from 0.45 to 0.3, and a button zoom
eases over 220 ms about the viewport centre (the wheel stays immediate: a wheel is the reader's
own hand). The three force sliders scale the shipped constants (`repulsion`, `linkDistance`,
`gravity`); display has node size, idle-edge opacity, the label zoom threshold and a glow (a
translucent disc of the node's own colour, skipped above 700 discs on screen where it would be a
wash). Labels wear a halo of the ground. Everything is one object under `astrolabe.graph`,
normalised field by field on load (`normalizeGraphPrefs`), per browser, never sent anywhere.

## The graph panel is a box you can drag

`.s-graph__panel` sits at the PHYSICAL right in both directions (`top/right/bottom`), as does
`.s-graph__controls`: the owner reads the graph's chrome as one instrument cluster. Its head is a
drag handle (pointer capture, clamped to the graph's box); once moved it wears `--moved` (left/top
inline, bottom unpinned, max-height in the box) and the position is remembered in
`localStorage["astrolabe.graphPanelPos"]`, re-clamped on mount. Reset and ✕ are buttons, not handle.

## Finding: recents, ranked completion, tag completion, heading jump

- `client/recents.ts` — the FRECENCY LEDGER: which notes this browser's reader
  keeps returning to. Records every change of the store's `openPath` onto a
  note (installed by `installRecents(useStore)`, which CommandPalette.tsx calls
  at module load — state.ts keeps no dependency on the feature). One entry per
  path: `{ path, weight, at }`, where `weight` is the visit count decayed with
  a 7-day half-life (decay-then-increment on each visit, so the stored number
  IS the decayed count). Persisted in `localStorage["astrolabe.recents"]`, capped
  at 50 by score (not age). PATHS ONLY, PRUNED AT READ TIME: every read
  filters against the live tree, so a deleted note leaves the list when the
  tree does, and a visitor session — whose tree is the published subset —
  never surfaces a private path's title, even one an admin session left in the
  same browser. Storage is re-read on every public call because pop-out
  windows share the origin's localStorage. The pure core (recordVisit /
  rankRecents / parseRecents / decayedWeight) is proven in
  tests/recents.test.ts under bare node; the module therefore must not import
  state.ts (the store touches window/localStorage at import time) — the store
  is handed in.

- Palette on EMPTY query: recent notes first (a snapshot taken at palette
  open — the list must not reshuffle between two Ctrl+Ps in one minute, and
  opening the palette is itself a visit), minus the note currently open,
  capped at 10; then the commands; then open tabs not already named by the
  recents section (duplicate rows would make arrow-key distances drift with
  usage).

- Palette "@" prefix = HEADING JUMP within the open note: fuzzy over the
  note's ANCHOR table (shared/anchors.ts — headings and LaTeX \labels alike;
  ids are a match haystack too, since "eq:fourier" is how a \label is
  remembered). Enter dispatches the same `astrolabe:goto-heading` event with the
  same `{slug, line, text}` payload TocPanel's rows send, so the editor and
  the reading view each consume the half they already handle. Content comes
  from GET /api/note rather than the live buffer: the palette chunk must not
  import CodeMirror (the bufferBridge wall), and autosave keeps the server
  copy ~600ms fresh.

- Wikilink completion ("[[") is RANKED, lexicographically: match quality on
  the title/alias (exact > prefix > substring > subsequence), then frecency
  (the same ledger), then already-linked-from-the-open-note, then
  alphabetical. `filter: false` — the source hands CodeMirror a finished
  order, because CM's own scorer would re-sort by string distance. An alias
  row ranks by its NOTE's frecency/linkedness. Once a `|` is typed the popup
  closes (the author is writing display text). The alias dedupe rules
  (one row per alias, winner-first) are unchanged — tests/aliases.test.ts.
  **THE NOTE YOU ARE IN IS NOT A DESTINATION** (v1.8 UX audit, F4): it carries
  the highest frecency there is — you are typing in it — so it sorted to the
  top of every "[[" popup in the vault and offered a link from a note to
  itself as the first and most obvious answer. The host path (the
  `notePathFacet`) is excluded from the rows, its aliases with it; it is NOT
  excluded from `exactExists`, because a note whose own name is typed still
  exists and offering to CREATE it would be worse than offering to link it.

- The CREATE ROW: last row of the "[[" popup, admin only, only when nothing
  answers the typed name exactly. It creates `<open note's folder>/<typed>.md`
  (a typed name containing "/" is obeyed as a root-relative path; a typed
  note extension is kept) and SAYS SO on the row via `promptCreates` — a
  create row that scatters files silently is worse than none. Apply inserts
  the link as typed, creates the file via api.createNote + default template,
  reloads the tree so the link renders resolved, and does NOT open the new
  note: the writer is mid-sentence. (The click-a-dashed-link path still
  creates at the vault root; that asymmetry is livePreview's to close.)

- TAG completion: "#" mid-prose offers the vault's existing tags
  (GET /api/tags, cached 60s — the SSE tree reload does not reach the editor
  module, so a TTL stands in). It does NOT fire when the `#` opens the line
  (a heading being typed), when the preceding char is not in TAG_RE's opener
  class (URLs: `https://a/#frag`), inside code/links/math (syntax-tree
  check), or inside "[[" (the anchor half owns that). Rows carry the
  LOCALISED tag label (client/tagLabels.ts) as detail beside the canonical
  tag; the canonical tag is what gets inserted — chips say, files store.
  Boost is log-scaled usage count, so well-used tags surface first among
  equal matches.

## Chords resolve by key position (scripts/check-keymap.mjs)

- No handler under `client/` may compare `e.key` (or `.toLowerCase()`) to a Latin letter; the
  gate refuses it. Every chord goes through `isKey`/`shortcutKey` (client/keys.ts), which reads
  the typed character when it is Latin and the physical key when it is not — so `Ctrl Shift F`
  is `ب` on an Arabic layout and the same chord.

## Settings panel (SettingsModal)

**ONE FORM, TWO HOSTS (3.27.0).** `SettingsModal.tsx` is the DIALOG only — the rail, the search above
it, the footer, the image picker, the exits that ask — and nothing it draws is a row. The form and
its rules are `components/settings/form.ts` (`Form`, `formFrom`, `validate`, `buildPatch`); the
form's life (load, custom fonts, the font preview, Save, the two credential Clears, the visibility
preview) is `settings/useSettingsForm.ts`; each tab's rows are `settings/<Tab>Tab.tsx`, reading the
loaded form through `settings/context.ts` (mounted only once the settings have arrived, so `form`,
`eff` and `inh` are never null in a tab); and ONE switch, `settings/TabBody.tsx`, turns a tab id into
its body for both the dialog and the phone shell's Settings section screens. The switch's
`{tab === "…" && [!]pocket && <XTab />}` lines ARE the index's source: `scripts/settings-index.mjs`
reads each line's mode and the rows out of the file of the component it names (plus the travel row
the sync tab mounts), and regenerated the index byte-identical across the split. `TABS` lives in
`settings/tabs.ts` (check-docs reads it there). Split with no change to a row, a hint, a request or
a toast; `tests/settingsForm.test.ts` holds the round trip.

**SETTINGS IN PLACE (3.18) — the panel keeps its shape and loses its faults.**
Save STAYS on the seven server tabs, deliberately: a PATCH is atomic
(`server/settings.ts` rejects a whole patch or applies it), a typography save
fetches faces before it writes, and the git scheduler reads effective settings
every minute — a half-typed remote committed after 400ms could be pushed to.
What changes is that **no exit path discards silently**: Escape, the scrim, the
× and Close all go through `requestClose()`, which closes a clean form at once
and asks `confirmModal("Close without saving?" / "Your unsaved changes will be
discarded." / Discard)` over a dirty one — the designer's own twelve lines
(`DesignerPanel.tsx`), and the two keys are now `closeUnsavedTitle` /
`closeUnsavedBody` / `discardChanges`, generic because two panels ask the
same question. The Esc listener stands down while the question is on screen,
so Esc there means Cancel. The footer renders only when `tab !== "device"`:
This device commits on click, and a footer reading "Unsaved changes" over it
was the two-kinds-of-row confusion drawn once more on the tab built to end it.
**Row anatomy:** the label column is `minmax(0, 19rem)` and the hint wraps at
`46ch` (they were 14.45rem and 30ch, and every fourteen-word hint ran to three
or four lines beside an empty control column); the hint, the footer status,
About's count labels and the font rows' metadata are `--text-muted`, never
`--text-faint`, because they are READ (DESIGN.md's rule) — `check-settings`
holds those four selectors to the muted token, holds every `hint=` key to
fourteen English words, and opens each file About's documentation list names
(`docs/*.md`, headings slugged as build-docs slugs them). **Reference text
lives behind the row's ⓘ** (`Row`'s `more` prop, rendered in the same
disclosure region as the `.env` line): the hadith frontmatter shape, the
periodic token grammar, the `{{placeholder}}` list, the clipper's token
story, the French corrections, the spellcheck instructions. **"Inherit" is
"Default"** on every three-state segment and select row, still carrying the
value it resolves to as its note — "Inherit" named a mechanism, "Default"
names what the reader gets. The three rows with NO environment variable
behind them (Visitor switch, Share buttons, Ambient masthead;
`server/settings.ts` inherits constants there) are plain `Toggle`s bound to
`form.x === "on" || (form.x === "" && inherited.x)`: a "Default" that names
nothing an operator can set elsewhere is a third state with no meaning. The
library-path and public-folder switches read ON for VISIBLE (they were bound
to `hidden`, so a lit switch meant a hidden path). **Search** matches at a
word start after folding, never as a substring (`searchSettings.ts`), with
one English plural folded — "graph" no longer answers with Text direction and
"date" with What's new — and the words readers search for are IN the copy:
font/typeface, width, dark mode, history, RTL, designer. **The phone gets the
whole viewport** (`≤720px`: `100vw × 100dvh`, no radius, safe-area padding,
mirroring `history.css`'s revision view), drops the tab heading repeated under
the strip, un-sticks the specimen and lets its lines wrap; the strip's long
fade sits at the trailing edge in both directions (`:dir(rtl)`). **Touch:**
`controls.css`'s coarse block gives every `.s-ctl-input` 16px of type and
every toggle, segment button and select 44px. **Focus** lands on the search
field (the panel itself on a coarse pointer, where a focused field raises the
keyboard), the last tab is remembered per device (`astrolabe:settings-tab`),
and `Row` names its control by `aria-labelledby` as well as `htmlFor`, since a
`SegmentedControl` is a radiogroup `<div>` that `for` cannot reach. Clearing
the offline copy asks first, like removing a font: it deletes bytes.

**THE TAB MAP (3.15):** This device · Site · Language & dates · Publishing &
comments · Collections · Vault · Backup & sync · About. Eight, as before, but
re-cut: the previous eight ran Identity five rows, Typography five, Publishing
twenty-one, and a rail is a promise about where things are that a tab nobody
scrolls to the end of breaks. *Site* is Identity + the default theme (from
Publishing) + Typography, because all three answer "what does my site look
like"; the typography specimen keeps its sticky perch inside a
`[data-section="typography"]` wrapper that is its containing block, so the
identity rows scroll past it (and `Select` now honours `[data-popclear]` only
when the block is ABOVE the trigger — the default-theme list opens with the
specimen still below it). *Collections* is the back half of Publishing —
categories-from, hand-made collections, the library shelf — because "how the
public site groups notes" is a different question from "what may a visitor
see". *This device* is the same rows in four groups (the look, Reading &
writing, This browser, This app) instead of one list with the desktop's
rename wedged between vim keys and the what's-new switch; *This app* renders
only where the bridge exists and holds **Software updates** (below). Row
counts now: 17 (+1 desktop) · 11 · 11 · 10 · 10 · 14 · 9. No key, default or
behaviour moved with a row; `settingsIndex.ts` carries the new map, so search
and `openSettingsAt` land wherever a row went, and `searchSettings` drops the
three desktop-only rows (`DESKTOP_ONLY_ROWS`) from a browser's results rather
than scrolling to nothing. Nine hints over the fourteen-word rule were cut to
size in the same pass (prefs sync, ambient, app name/icon/launcher, author
sites, relative lines, drawings folder, offline).

**The eight before that, and why the first one is not about the site at all:**
This device / Identity / Language & dates / Publishing / Vault / Typography /
Backup / About. It was six, and the six were the wrong cut — not because a tab was
thin (that was the last round's complaint, and merging Appearance away fixed
it) but because ONE FORM held two kinds of row. Your theme, your editor
language and the sidebar's edge are `localStorage` preferences that commit on
click; they sat two rows from thirty-seven server settings under a footer
reading "Unsaved changes" and a Save button that does not apply to them.
Nothing on screen distinguished the two kinds, and nothing could: the
difference is not visible at row scale, which is why the panel's two commonest
questions were "did that save?" about a row that already had, and "why did
nothing happen?" about a row that had not. **The boundary is now the tab**,
because a tab is the one piece of chrome a reader reads before they read a
row. *This device* opens first and holds six preferences of the PERSON —
theme, editor language, sidebar edge, vim keys, the floating toolbar and
reading-view numbering; the last three were previously reachable only from a
status-bar pill, a palette row and an outline button, so a reader who did not
already know they existed could not find them. Everything else splits by the
QUESTION it answers rather than by the machinery behind it: what the site is
called, what it speaks and how it writes dates, what a visitor may see, which
folders it writes into, what it is set in, how it is backed up, what it IS.
"Appearance & language" is gone as a NAME: half of it was this browser's and
half of it was the site's, which is the confusion the split exists to end.
The rail stays `role="tablist"` (↑↓/Home/End walk it), each tab opens with its
name and ONE sentence (`intro` on the `TABS` table), and switching tabs resets
the body scroll — carrying a long tab's offset into a short one lands the
reader past its end.
**The panel is ONE height for all eight** (`height: min(740px, 100vh - 40px)`
in `settings.css`), not a height per tab. Sizing to the content stood it at
467px on one tab and 855px on another, and because it is centred, every click
moved the RAIL as well as the body: the row under the pointer became a
different tab, and the next click opened a section nobody chose. The tall tabs
scroll, which they always did; short tabs carry empty space, and a tab strip
that stays put is worth it.

**A LABEL THAT NEEDS A PARAGRAPH IS THE WRONG LABEL.** Every row is a label of
five words or fewer that carries its own meaning — "Numbered headings" over a
toggle, never "Heading numbering: on / off", because the control already draws
the state and a label that repeats it in words is asking the reader to
reconcile two sources. Help is exactly ONE SENTENCE of at most fourteen
English words, and it is a persistent sub-label rather than a tooltip: a
reader deciding between two options has both of them and both explanations on
screen at once. This was measured against what was there: the calendar row's
help ran to 40 words and spent 19 of them on Umm al-Qura; the tag-label note
ran to 51; the visitor-switch note to 48; the uploaded-fonts note to 40; the
reading-direction row to 35. Not one of them was wrong — all of them were the
row's own documentation printed where the row's name belonged, and a settings
panel that has to be READ is one nobody finishes. What genuinely does not fit
in a sentence belongs in the README (About names the sections) or under the ⓘ.
**Every control in the panel is OURS** (`client/components/controls/*`, `styles/controls.css`).
The panel was built out of native `<select>`/`<input type=checkbox>`, which draw the operating
system's widget inside a candlelit manuscript room — and, with twenty-seven fonts, opened an
OS-drawn *window* that no theme can reach and no panel can contain. The set is `Select`
(styled trigger + themed popover), `Toggle`, `SegmentedControl`, `TextInput` and `NumberInput`;
zero native select/checkbox chrome is left anywhere in settings.

**And zero `window.*` dialogs are left anywhere in the app.** `Confirm.tsx` now hosts a
`promptModal()` beside `confirmModal()` — same panel, same focus trap, one field — because the
four creation flows (`Ctrl/Cmd+N`, the sidebar's New note, the tree's "New note here", New
folder) were still drawing `window.prompt()`. An OS box takes neither the theme, the type scale
nor RTL mirroring, and its OK/Cancel were the only untranslated chrome on an Arabic instance;
it is also a functional risk, because once a browser's "prevent additional dialogs" box is
ticked `prompt()` returns `null` forever and there is no working new-note path left, silently.
The prompt's own rule: `check(raw)` is the caller's entire naming rule (`client/prompts.ts`),
run on every keystroke, and the dialog PRINTS what it makes of the text — "Creates
ideas/Deep Work.md" — then resolves with exactly that string. The `.md` and the folder used to
be appended in silence, so "I typed Ideas" was answered in the tree rather than in the dialog.
The field is `dir="auto"`; traversal (`..`) and dot-names are refused in the dialog, in the
instance's language, instead of arriving as an English 400 in a toast.

- **The popover is a PORTAL on `<body>`, positioned per open from the trigger's rect.** The panel
  is `overflow: hidden` and its body is a scroller, so an in-flow popover would be clipped by one
  and dragged by the other. Portals bubble React events through the COMPONENT tree, so the
  popover stops its own mouse events; outside-clicks are a DOM capture listener.
- **The BOUNDS are the scrolling region, not the dialog** (`[data-popbounds]`, which
  `SettingsModal` puts on `.s-smodal__body`), intersected with the viewport — the owner's words
  were "fits correctly within the settings screen bounds". Clamping to `[role="dialog"]` met that
  only in the middle: measured at 1440, five popovers reached **58–192px past the footer's top
  edge**, over the divider and the Close / Save row, which are chrome the reader has to be able to
  reach WHILE choosing. `[role="dialog"]` remains the fallback for a Select outside the panel.
- **A STICKY BLOCK IS NOT ROOM** (`[data-popclear]`, on `.s-smodal__specwrap`). At 1280×800 in
  Arabic the Arabic-face picker flipped above its trigger and covered the live specimen's last
  line — defeating the preview that is the entire justification for applying the value on
  highlight. The room above a trigger now starts below any keep-clear block inside the bounds.
- **Three placements, tried in order: below, flipped above, and OVER THE TRIGGER.** The third is
  what a native select has always done and it is what makes the first two affordable: clamping to
  the panel body leaves a picker near the foot of a tab barely 150px on its best side while 340px
  of clear region sits unused. When neither side can hold a usable list, the list takes the whole
  clear region. The trigger is the one thing safe to cover — its value is the ticked row inside
  the list, and the specimen is `[data-popclear]` and therefore outside the region.
- **TAB COMMITS AND THEN ADVANCES.** It used to `close(true)` and stop, and `close` returns focus
  to the trigger, so Tab was Enter wearing another key's name: it committed and left the reader on
  the control they had just finished with. (Shift+Tab was not handled at all, and since the
  popover is a portal on `<body>`, the browser's own Tab from inside it would have walked off the
  end of the document rather than through the panel.) It now commits, then steps to the next
  tabbable inside the same bounds once the trigger has taken focus back.
- **`grid` is the font picker and nothing else.** Its rows are two lines tall — the specimen IS
  the option — so a 27-family catalog was judged **three and a half faces at a time** against a
  340px popover, and the filter only helped a reader who already knew the name they wanted, which
  is not what a picker is for. `.s-ctl-pop--grid` lays each GROUP's options out in columns (never
  across a group heading, or "Arabic — naskh" ends up beside a serif face) as **specimen-led
  cards**: the family name is a small overline and the sample takes the type size, because the
  question being answered is "what does this look like". Measured: 5–7 whole cards visible at once
  where the column showed 3. `MIN_GRID_WIDTH` is 540 — at 460 the wider Latin faces ellipsized the
  specimen, which is a specimen of the ellipsis.
- **`isSelectOpen()` exists for the same reason `isThemePickerOpen()` does.** The panel's Esc
  listener is a capture-phase `window` handler registered earlier, so it must stand down while a
  list is open — Esc there means "put the value back", not "close the settings".
- **The popover renders only once it has been PLACED**, and everything that reaches into its DOM
  waits for that pass, not merely for `open`. Focusing on `open` alone silently did nothing (the
  element did not exist yet), left focus on the trigger, and took the keyboard contract with it:
  Esc landed outside the popover and never closed it. Same failure as the shell's "focus AFTER the
  reveal lands" rule, one component down. The trigger also routes its keydown into the popover's
  handler while open, so Esc cannot be lost to a stray focus.
- **↑↓ apply the value LIVE** (the theme picker's rule — the specimen is the reason the list is
  open), **Enter commits the highlighted row**, Esc and an outside click restore the value the
  popover opened with. **A row CLICK passes the value it won with**, because `activeRef` is
  assigned during RENDER: a handler that calls `setActive(v)` and closes in the same tick still
  reads the PREVIOUS highlight, so `close(true)` set the value and then immediately put it back
  and **every pointer pick in the panel silently did nothing** — only the keyboard worked, since
  ↑↓ commit on a later keystroke by which time the render has landed. `close(commit, chosen?)`
  takes the winning row from the caller that already knows it. A control that answers the
  keyboard and ignores the mouse is worse than the native select it replaced. Filtering moves the highlight to the first match **without** applying it:
  four keystrokes of "amir" must not be four value changes. Hover never moves the highlight
  without the pointer actually moving (`mousemove`, not `mouseenter`) — the palette's bug.
- **Three-way rows are SegmentedControls, not selects**: *Default* (carrying the value in force as
  its note; it was *Inherit* until 3.18 — see "Settings in place" above) / On / Off, all three
  visible — where an environment variable stands behind the row. A checkbox cannot express "not set", and a list you must
  open to learn it holds three items is the wrong shape for three words. **Its HORIZONTAL arrows
  answer the inline direction** — the segments are laid out by it, so in an Arabic panel
  `ArrowRight` walks backward and the reader's finger and the highlight move the same way; ↑↓ are
  direction-free and always mean next/previous. The test is `closest("[dir]")`, not `<html>`, so a
  control inside an explicitly LTR island (`NumberInput`'s field) is read by the direction it is
  actually drawn in.
- **The notes sidebar's edge is a row in *This device*, directly under Editor language.** Three segments
  (*Auto* / *Left* / *Right*) on `setSidebarSidePref` — the same action the palette's three
  commands call, which is the whole point of there being one action. It is a DEVICE preference
  like *Your theme*: it commits on click and is never part of the Save diff. The *Auto* segment
  carries the edge it RESOLVED to as its note (the panel's inherit-names-its-source convention),
  because the default state of a three-state preference must not be the invisible one — and
  because the row above it is what moves it: switching the instance to Arabic carries the pane to
  the right while the reader is looking at both rows. Segment labels name a PHYSICAL edge in both
  languages, exactly as the palette commands do. Two-state rows (Backup,
  Pull first) are `Toggle`s, and a DISABLED toggle keeps its position (a reader must still be able
  to read what is configured) but loses its colour — lit, an inert "Pull first · on" was the
  brightest thing in a column of greyed rows.
- **`NumberInput` carries its unit INSIDE the field** ("142 %"), with steppers of our own rather
  than `<input type="number">`'s browser spinners. The field is `dir="ltr"` as a whole: with only
  the input LTR inside an RTL panel, the logical padding and the logical unit inset resolved to
  opposite edges and the "%" landed on the digits. *Automatic sync* deliberately stays a closed set
  of SENTENCES (see below) — the unit control is for the Arabic size match, where a number really
  is the value.
- **The panel's fixed measures are in REM, not px.** `:root[lang="ar"]` multiplies `--font-scale`
  and 1rem is `--font-base × that scale`, so a px rail and a px label column hold ~6% less Arabic
  than English: tab names wrapped, labels collided with their controls, and the panel lost its
  rhythm in Arabic — the "weird margin/padding in Arabic mode" report. In rem they grow with their
  own type.

**A FIELD'S `dir` FIXES ITS ORDER; IT MUST NOT ALSO FIX ITS ALIGNMENT.** This is the `<bdi>` rule
Select.tsx already applied to the popover rows — "two things being compared have to start at the
same place" — and the plain inputs in the same panel never got it. Machine text (a URL, a branch,
a vault path, a BCP-47 tag) is `dir="ltr"` and stays so: `git@host:path` reordered by an RTL
paragraph is a different string. But `text-align: start` then resolved against the FIELD's
direction rather than the PANEL's, so in an Arabic panel the logo and favicon paths sat flush LEFT
while the site name and tagline directly above them sat flush RIGHT — a ~400px jump between
adjacent rows of one form. Measured across all six tabs in Arabic: **seven fields aligned to the
opposite edge of the column from their neighbours**, now zero. Two rules in `controls.css` flush
any disagreeing field to the panel's start edge; `.s-ctl-num__input` is the one deliberate
exception (its field is an LTR island with the unit pinned at its inline end, so aligning the
digits to the panel's start would park "142" on the "%").

**The site FOOTER field is `dir="auto"`, because its content is a TEMPLATE.** `© {year}
{siteName}` is machine syntax, and an RTL field laid it out as `{siteName} {year} ©` — measured,
the three tokens at x 538 / 628 / 679 — so the operator was shown one token order and had to type
another, which is the one place a wrong order silently teaches wrong syntax. It cannot be pinned
`ltr` either: this is also the site's footer PROSE, and an Arabic instance writes it in Arabic.
`auto` lets the first strong character decide, so the default template renders exactly as it must
be typed and an Arabic footer stays Arabic. Its ALIGNMENT still follows the panel, per the rule
above. (The sync tab's `https:// or git@host:path` hint was checked the same way and is already
correct: its LRM marks put the runs in authored order under an RTL base — measured x 905 / 894 /
809, reading right-to-left.)

**A NOTE THAT ONLY REPEATS ITS LABEL IS NOISE.** The default-theme rows carry the raw id as a
muted note because that is what `DEFAULT_THEME` and `settings.defaultTheme` take. In Arabic it
earns its place twice over (Arabic name, Latin id); in English it printed Iron gall / iron-gall,
Cinnabar / cinnabar, Sumi / sumi and five more — the same word twice, ~230px apart at the far edge
of the row. The note is dropped exactly when it is DERIVABLE from its label (lowercase, non-alnum
→ `-`), which is a property of the pair and not of the language: 0 notes in English, 15 in Arabic.

**"Your theme" and "Default theme" answer the same question and wear the same face.** *Your theme*
was a 58px swatch and a "Browse themes…" text link flung to opposite ends of the control column
with ~280px of nothing between, one row under a full-width Select — the least finished-looking row
in the panel, in both languages. It is one `.s-ctl-select`-shaped trigger now: same measure, same
border, same chevron, carrying the miniature the picker itself draws. What it opens is a browsing
panel rather than a list, which is the honest difference — twenty-one rooms are chosen by looking at
them.

**"INHERIT" NAMES WHAT CLEARING THE FIELD WOULD DO, WHICH IS NOT THE VALUE THE FIELD HOLDS.**
`/api/settings` answers two merges: `effective` (stored value when set, else the env or built-in
default — what the site is doing right now) and `inherited` (each key ABSENT, everything else as it
is — what "Inherit" would land on). Every Inherit segment, every `inherit (…)` option and every
"if this is left empty…" consequence in the panel reads `inherited`; only placeholders and
"right now" lines read `effective`. The two agree exactly while nothing is stored and diverge the
moment something is, which is when the note matters: an instance with `language: "ar"` saved and no
`SITE_LANG` read "Inherit (ar)" — and would have got an English site by picking it. The legacy
`LANGUAGE_FILTER=true` still resolves against the site language IN FORCE there, because clearing the
filter key leaves the language key where it is. `tests/settings.test.ts` pins both halves.

**THE ENVIRONMENT IS AN OPERATOR'S BUSINESS, AND IT SITS BEHIND A ⓘ.** Every
row with an env variable used to carry two pieces of standing chrome: an
`inherited` badge beside its label and an `inherited from SITE_LANG` line
under its control — one mechanism, said twice, in the first place the eye
lands, to every owner of this product including the many who will never open a
shell. Both are deleted. The label now carries a ⓘ where a footnote mark would
sit, and what it discloses says MORE than the badge did: one sentence naming
which of the two sources is winning (`envDecidedBy` while the field is empty,
`envOverridden` once it holds a value), the variable's own line —
`SITE_LANG=en`, quoted when the value carries whitespace or dotenv syntax,
because a line that silently truncates at the first space is worse than no
line — and a **Copy as .env line** button that puts exactly that on the
clipboard and swaps its own label to "Copied" (SyncBadge's idiom; a toast for
a two-word action is louder than the action). The variable stays discoverable
for someone scripting a deployment, in the row that owns it, without being
the first thing an owner reads.
**It is a DISCLOSURE, not a popover and not a hover card**, and that is a
requirement rather than a preference. A hover card is unreachable by touch and
by keyboard. A positioned popover would be a FOURTH transient surface in an
Esc chain already three deep — ThemePicker → an open `Select` → `ImagePicker`
→ the panel — which is precisely how this panel starts closing itself out from
under a reader who meant to dismiss one list. The ⓘ is a named `<button>`
carrying `aria-expanded` and `aria-controls`; the region is
`role="region" aria-labelledby` pointed at that button, is always RENDERED and
hidden with the `hidden` attribute (so `aria-controls` never points at nothing
and the copy button is never a tab stop while collapsed), and lives in the
flow under the control it annotates — costing the Esc chain nothing and
scrolling with its own row.

**One disabled state wears one face.** With Backup=off the three `<select>`s took the browser's own greying ON TOP
of `.s-smodal__row--off`'s 0.5 while the Remote URL and Branch `<input>`s took only the row's, so
`:disabled` inside `.s-smodal__control` now neutralises the UA opacity and sets one
`--text-muted` on `--bg-raised` treatment for both shapes.

**A row that does nothing HERE says so, in the same voice.** `settings.home.mode` and
`settings.home.banner` are read by the blog shell alone — `/api/me` sends `me.home` inside
`if (publicLayout() === "blog")` and `BlogDashboard` mounts only from `BlogShell` — but the Mode
segmented control and the home-banner `ImageField` were offered live, ungated and unannotated,
under copy promising the opposite. `PUBLIC_LAYOUT` defaults to `app`, so the ordinary case was:
pick Dashboard, upload a hero, get a success toast, and the site does not change. Both rows now
take `off` + `disabled` (`ImageField` grew a `disabled` that reaches its field AND its Pick/×
buttons — a live "Pick…" beside a dimmed field is the same bug wearing a badge) whenever the
effective public layout is not `blog`, with one `.s-smodal__offnote` above them naming the
switch: the Backup=off idiom, applied to the row that needed it just as much. The gate reads the
FORM, like `syncOff` does, so flipping Public layout to blog lights the rows up in the same
breath, before the save. The Home NOTE row between them stays live on purpose — the app shell
opens it at boot.

**The panel is called "Settings", full stop.** It used to read "Site settings —
settings.json": an implementation file in the title bar of a settings screen, naming a path
without saying where that path is. Where the file lives is a FACT about the instance, so About
prints `settingsPath` and `customFontsPath` (both on `AboutInfo`) beside the vault and data
directories, with one sentence saying that deleting the file returns the instance to its env
defaults. And then "Site" went too: the panel also holds this BROWSER's own theme, the editor's
behavior and the backup credentials, the product has exactly one settings screen, and a
qualifier that distinguishes nothing is a longer word for the same thing. One key, `siteSettings`
(the id is kept so nothing has to be renamed twice), reaches the modal heading, the palette
command, the gear's `aria-label`, the `Ctrl/Cmd+/` row and the README section — rename the VALUE
and every surface follows. `siteSettingsTitle` is the gear's tooltip and carries the same word.
The Arabic is the dictionary's own noun (`settingsSaved`, `settingsSections`), not a new
coinage; likewise `browseThemes`, which is now *Themes* / «السمات» — `docTheming`'s word — on the
palette row, the `Ctrl/Cmd+/` row and the Settings → This device trigger. The README heading
moved with them, so `DOC_LINKS`' anchor is `#settings`.

`settings.defaultTheme` is parsed leniently like `settings.language`: trimmed **and lowercased**.
`DEFAULT_THEME` is lowercased by `readEnvTheme()` before validation, so trimming without
lowercasing meant `DEFAULT_THEME=SOLAR` started the instance on solar while
`PATCH {"defaultTheme":"SOLAR"}` was a 400 — the same value accepted through one door and refused
at the other. Both doors also take `follow` (see "Which theme a reader lands on"), on the same
terms: `DEFAULT_THEME=FOLLOW` and `PATCH {"defaultTheme":"FOLLOW"}` are one value, not two.

`GET /api/settings` carries `about` (`AboutInfo`: version, node, vault path, data path, note /
published / attachment / tag counts) — admin-only by construction, since the route 404s to
visitors, which is what lets it name absolute paths.

## Accessibility (client — normative, gated by `npm run check-a11y`)

`client/a11y.ts` holds the three shared primitives. Use them; do not re-implement them.

- **Dialogs.** Every modal surface calls `useDialog(panelRef, …)`: it traps Tab inside the panel
  and — the half that keeps getting dropped — returns focus to the control that opened it. Panels
  carry `role="dialog" aria-modal="true"` and `aria-labelledby` pointing at their own title node.
  `Confirm.tsx` keeps its own bespoke trap (it has a three-button ring and Enter semantics).
  **This is GATED, because saying it was not enough.** An audit of 3.17.3 found 21 of 37
  `role="dialog"` sites with no trap and no restore, and six of them claiming `aria-modal="true"`
  over nothing at all — a promise made to assistive technology and broken for everyone. Measured
  Tab walks: the shortcuts sheet leaked at press 12, the theme picker at 22 going backwards, the
  trash browser 30 times out of 30, the sync popover 21 — and it stayed open, unblurred, behind
  the walk. `check-a11y` rule 6 now fails any file containing `role="dialog"` or
  `aria-modal="true"` that does not call `useDialog(`, unless the file carries an `// a11y-ok:`
  line saying why. There are exactly **two** such lines and they are the whole list of exceptions:
  `Confirm.tsx`, for the reason above; and `SearchHelp.tsx`, which is the product's one
  deliberately NON-modal dialog — the operator card answers a question about the search field
  beside it while the reader keeps typing into that field, so it takes no focus, claims no
  modality, and a trap would pull the caret out of the box on their next Tab.
  **A trap that steals the initial focus is worse than none**, so a surface that already focuses
  itself passes `manualFocus: true` and keeps its own choice. A surface that does not says where
  focus goes: `MediaForm` opens on its TITLE field, not on the × that was merely first in the
  DOM — a sheet that announces itself by its own dismissal is a sheet that reads as a mistake.
  Escape stays with whatever already owned it (the theme picker's Escape RESTORES the previewed
  room; the history panel's steps aside for a confirm stacked on it), and `onEscape` is passed
  only where nothing did.
- **Motion.** `prefersReducedMotion()` / `scrollBehavior()` are the only way to ask. CSS gets the
  blanket rule in `styles/a11y.css`; anything animated in JS (the two graphs, smooth scrolls) opts
  out itself. Canvas simulations settle without painting the drift rather than freezing mid-layout.
  **Two durations and one curve**, named in `tokens.css` as `--motion-quick: 120ms` (something
  ARRIVES or leaves — a menu, a popover, a scrim, the palette's backdrop), `--motion-pane: 180ms`
  (something RESIZES — the pane collapse DESIGN.md pins at that number) and `--motion-ease: ease`.
  The shell had already converged on those two numbers; it said so as literals in nine stylesheets,
  which is how a third number appears, and the overlay family reads the tokens now. **Layout
  properties are not animated** except by the pane-collapse rule DESIGN.md writes down — width,
  which is what "a collapsed pane is 0 width" means — and by progress bars, which are one isolated
  box; everything else moves with `transform` and `opacity`. An audit of 3.17.3 measured zero
  transitions over 50ms with `prefers-reduced-motion: reduce` on, the palette at 0.01ms: the
  blanket rule is holding, and it covers anything added under these tokens too.
- **Keyboard.** No control is pointer-only. Imperative DOM that is "a link" without an `href`
  (`.s-rv-wikilink`, `[data-fn]`) carries `role="link" tabindex="0"` and is activated through
  `activateOnKey`. The sidebar tree is ONE tab stop: `role="tree"` on `.s-tree__root`, rows are
  `role="treeitem"` with `aria-level/posinset/setsize`, and the current row is named by
  `aria-activedescendant` + a `.s-tree__item--cursor` class (arrows/Home/End/Enter/F2/Delete/
  Shift+F10; Left and Right are LOGICAL, so they swap in RTL). The tab bar is a roving-tabindex
  `role="tablist"`; the palette and the blog search are `combobox` + `listbox`/`option`.
  **The sidebar's tag shelf is ONE tab stop too**, for the reason the tree beside it is: on the
  1,388-note fixture it is 113 pills, and 113 plain buttons put 120 sidebar stops between the
  reader and every control after the pane (measured: the first control past the sidebar arrived at
  stop #121; it now arrives at #10). `.s-tags__list` is a single-select `role="listbox"` — which is
  what it already behaved like, one tag filtering at a time — its pills are `role="option"` with
  `aria-selected`, and the tab stop ROVES with the focus rather than living on the container:
  these are real buttons and there are a hundred of them, not a thousand, so moving the stop is one
  attribute on two nodes. Left/Right step one pill in READING order (they swap in RTL), Up/Down
  step a visual ROW of the wrapped shelf, Home/End reach its ends. Tab enters at the reader's own
  cursor, else at the tag currently filtering, else at the first pill — over the SHOWN pills, since
  a stop on a pill that is not on the shelf leaves the shelf with no `tabindex="0"` in it at all.
  **The shelf shows twelve and offers the rest** (v1.8 UX audit, F17). `max-height: 24vh` with its
  own scroll was the cap, and a quarter of the window is still a quarter of the window: the pills
  arrive sorted by count, so what a reader loses to the tail of a list they have mostly never
  clicked is the BOTTOM of their own tree. `.s-tags__more` is the tree's own "Show N more" row
  (`.s-tree__more`, attachments.css) — the count is on the button, so nothing is silently
  truncated — and the tag currently FILTERING is on the shelf wherever it sorts, because a filter
  whose own pill is hidden is a filter with no way to clear it. One pill is never worth a row that
  says "one more", so the cap applies only once there are at least two to hide.
  **The graph view has a node list behind its canvas** (`.s-graph__nav`), for the reason the two
  above have their shapes: a bitmap is a picture to a keyboard, and every node in the graph used to
  be pointer-only. `.s-graph__nav-list` is a roving-tabindex `role="listbox"` holding ONE note and
  its neighbours — not the vault, because three thousand buttons is three thousand DOM nodes and a
  shelf nobody can walk, while a neighbourhood is what the graph is FOR. Up/Down move along the
  shelf, the LOGICAL forward arrow steps into the neighbour under the cursor and makes it the
  centre, the logical back arrow returns along the trail, Home/End reach the ends and Enter opens
  the note. The canvas lights whichever node the cursor is on and pans it into frame only if it has
  left the frame — the same highlight hover draws, so the two halves are visibly one thing — and a
  `role="status"` line names each recentre. The list is clipped (`clip-path: inset(50%)`, the
  `.s-sr-only` technique) until it HOLDS focus and then draws as a raised card: a reader who
  arrived by Tab has to see what their arrows are doing, and a reader who never did should be
  looking at the constellation. The walk starts at the open note, else at the busiest node in the
  vault. Rows are 44px on a coarse pointer like every other target in the shell.
- **Names.** Every icon-only control has an `aria-label`. A placeholder is never a label. Settings
  rows render a real `<label for>` and wire `aria-describedby` / `aria-invalid` onto their one
  control child (`Row` does this — call sites pass a single element).
- **Landmarks.** Both shells open with an `.s-skip` link to `#s-main` / `#s-blog-main`. Every
  repeated landmark (`aside`, `nav`, the status bar `footer`) is named. Page outlines start at `h1`.
- **State is never colour alone.** Toggles carry `aria-pressed` and a shape (the status bar's gold
  underline); the dirty tab dot has `.s-sr-only` text beside it; validation errors are `role="alert"`
  text with a `⚠` marker.
- `.s-sr-only` is the screen-reader-only utility. Waive a checker rule with a trailing
  `// a11y-ok: <reason>` on the offending line, never by loosening the rule.

## What's new after an update (`client/whatsnew/`)

The owner: "whenever you update to a new version and open that version for the first time you get
some super nice looking modern popup with a preview of all the features added in said update" —
on by default, a switch in Settings → This device, "not just a bunch of words but images", and
"we shouldn't change it for bug fixes".

**Three files, one boundary.** `versions.ts` is the list of minor versions that have a deck and a
version compare — the entry carries that and nothing else. `door.ts` (first paint) holds the two
keys — `astrolabe.whatsnewSeen`, the newest deck this DEVICE has seen, and `astrolabe.whatsnew`
= "off", the switch, which TRAVELS (prefsSync) — and `maybeOpenWhatsNew()`, which App.tsx calls
once the admin shell has settled (never for a visitor). `releaseNotes.ts` + `WhatsNew.tsx` +
`styles/whatsnew.css` are the lazy chunk (`MUST_SPLIT`): the registry of releases and slides, and
the deck that walks them.

**Decks belong to MINOR versions.** `RELEASE_VERSIONS` holds `x.Y.0` only; a patch inherits its
minor's deck. `pendingReleases()` is every listed version above the seen-mark and not above the
build, newest first — so a reader who skipped 3.11.0 and lands on 3.11.2 gets 3.11's deck, and a
reader who saw 3.11.0 gets nothing from 3.11.2. A fresh install (no `astrolabe.*` key at all) marks
itself seen in silence: the tour is that reader's welcome. A device with other keys and no mark is
an update and gets the CURRENT minor's deck only, never the back catalogue. Closing the deck marks
the newest shown version seen; the palette's *What's new in this version* reopens every deck up to
the build.

**A slide is a VISUAL and a few words, both languages.** `Visual` is `demo` (a function that
mounts a live piece of the product — the routine card drawn by the reading renderer over sample
entries, with a working `onLog`; a warmth slider over a paper mock), `svg` (a mechanism a drawing
explains better) or `image` (a PNG imported as a URL; the last resort). Prose lives in the registry
as `{en, ar}` — NOT in the dictionary, which ships whole to every surface — and the only strings
that go through `t()` are the ones the check-i18n DOM scan would otherwise flag.

**The rule is a gate.** `npm run check-whatsnew` (scripts/check-whatsnew.mjs) fails the build when
package.json is at a new `x.Y.0` that `versions.ts` does not list or `releaseNotes.ts` has no entry
for, when a listed version is a patch, or when a slide's title or body is empty or not Arabic in
its Arabic half. Bumping the minor without writing the deck is therefore impossible to ship — which
is the reminder the owner asked for ("remind future sessions to create a new preview with every
major change").
