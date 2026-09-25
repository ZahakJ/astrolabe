# Panes, tabs and windows

*Splitting the note column, what a tab is, several windows over one vault, and the smaller doors: the local graph, the trash, the tour, aliases.*

← [Back to the README](../README.md) · [All docs](README.md)

---

## Panes

A pane is one column (or box) of the workspace that holds notes. The note column can be split into
several. `Ctrl/Cmd \` opens a second pane beside the current one, on the same note; `Ctrl/Cmd Shift \`
opens one *below* instead. Panes stand in columns along the reading direction: at most three stacked
in a column, four columns, eight panes in all. The ninth is refused with a sentence rather than a
shuffle. `Ctrl/Cmd Alt \` closes the focused pane, and its tabs are **adopted by a neighbour, never
dropped**. `Ctrl/Cmd Alt Shift` with an arrow moves the focus between panes, physically, in both
languages, and *Focus next pane* in the palette walks them in order. A window with nothing to
restore opens the note you were in most recently.

**Drag the seam between two panes to resize them.** The hairline between two columns, and the one
between the two panes of a column, is a grip: drag it and the widths follow your hand, from one
tenth to nine tenths; double-click it and the pair is evened out. The arrangement is remembered with
the layout.

**The graph is a tab.** `Ctrl/Cmd G`, the *graph* button in the status bar, or *Graph view* in the
palette opens the vault graph as a tab in the focused pane, beside the notes, and the same gesture
closes it again. Click a node and the note opens as the tab next to it, so the map and the note flip
back and forth the way two notes do. The graph tab can be dragged into a split like any other, and
one pane can hold the graph while the one beside it holds the note.

**Drag a tab to split.** While a tab is being dragged, every pane raises five targets: its four
edges, which split it and land the tab on that side, and its centre, which joins its strip. A target
the layout would refuse is not drawn at all. The drag works between windows too.

The two side panes, the notes sidebar and the outline, are documented with the
[editor](editor.md#the-two-side-panes).

## Tabs

Each pane has its own tab strip. A single click in the tree opens a note in a **preview tab**, which
the next preview open replaces, so following forty links does not leave forty tabs behind. Editing
the note, or double-clicking, keeps the tab. `Ctrl/Cmd Alt PageDown` / `PageUp` walk the strip and
`Ctrl/Cmd Alt W` closes a tab; middle-click closes one too, and a tab with unsaved changes wears a
dot. The strip is one tab stop for the keyboard: arrows walk it, `Home` and `End` jump, `Delete`
closes the focused tab. Right-click a tab for **pin** (a ◆ in the row, protected from *close
others*), close others, close the tabs after this one, reveal in the sidebar, and copy the path. When more tabs
are open than the strip is wide, it scrolls inside its own box and the active tab is kept in view;
the tool cluster at the top never goes under it.

## Several windows, one vault

Open a second window on the vault (*Open this note in a new window* in the palette; on the desktop
app also `Ctrl/Cmd Shift N`). Two windows on the same note are not two editors: one holds the **right
to edit** and saves, and the other becomes a live reader with a strip that says *Another window is
editing this note* and an **Edit here** button that takes that right over. No referee between the
windows and no lock file: the oldest window wins a tie, a window that stops checking in loses its
claim, and a window that closes gives its right up. Theme and editor language follow between windows, and signing out in one signs
out all. The desktop app adds a [reference window](desktop.md#the-reference-window) that stays on
top.

## When the file changed under you

A save that would overwrite a version of the note you never saw is **refused**, not merged: the
server compares the file's modification time with the one your editor loaded. Your text stays in the
editor, autosave pauses, and a strip above the note offers **Keep my version** or **Use the disk
version** (undoably). The full story, including the two-server case, is in
[Backup & sync](backup-and-sync.md#two-servers-one-vault).

## The local graph

The right panel carries a **local graph**: the open note in the centre with the notes it links to
and the notes that link to it, moving as if hung on springs you can grab. Drag and let go and it keeps moving a little, click to
open, double-click to open in place. It stays live as you write and link, collapses with the panel's
other sections, and remembers whether it was open. The whole-vault graph is
[the graph view](editor.md#navigating).

## The command palette, beyond notes

`Ctrl/Cmd P` searches notes and commands together. With an empty query it lists the notes you open
most, ranked by how often you visit each, a count that fades with time and is kept in this browser (paths
only, dropped when the note leaves the tree, never shown to a visitor). The same ledger breaks ties in wikilink autocomplete. Rows worth knowing:
*Reveal note in sidebar*, *Copy link to note*, *Duplicate note* (a copy beside it), *Open this note
in a new window*, *Focus next pane*, *Switch to* the light or dark twin of your theme, *Snapshot
now*, *Open trash*, *Random note* (somewhere you have not looked in a while), *Take the tour*.

## Aliases

An alias is a second name a note answers to. `aliases:` in a note's frontmatter gives it as many as
you like: each alias appears in wikilink autocomplete as *alias of Title* and in search as *matched
alias*. When you **rename** a note, the toast offers **Keep as alias**, so every `[[old name]]` in
the vault and every URL you have shared keeps working without a rewrite. (`[[Name|label]]` is a
display label on one link and is a different thing.)

## The trash

Deleting a note, an attachment or a folder moves it to `.trash/` in the vault. **Open trash** in the
palette lists what is there, what is inside each entry, how big it is and when it went, with
**Restore** per row, a permanent erase per row, and *Empty trash*. Restore puts an entry back
**where it came from**, which the trash remembers, and says beforehand when that spot is taken (it
lands beside it) or gone (it lands at the root). Before a delete, every dialog says what is really
inside: a folder of "0 notes" that holds forty images says so, and names the notes that embed them.
`.trash/` is never pushed by [Backup & sync](backup-and-sync.md#what-sync-never-stages).

## The tour

*Take the tour* in the palette deals a deck of illustrated cards, one feature each, and every card
has a **Show me** that opens the real thing rather than a picture of it: the designer, the themes,
publishing, collections, trackers, history, search, templates, LaTeX, the PDF reader, panes, the
graph, backup, the phone layout and the keys. It also waits on an empty vault, at the foot of the
`Ctrl/Cmd /` sheet, and in `Welcome.md`. It never opens by itself.

## Bookmarks

`Ctrl/Cmd Shift B` bookmarks the open note (or takes the bookmark off), and so does **Bookmark this
note** in the palette. The bookmarks are a note, `Bookmarks.md` at the vault root: a Markdown list of
wikilinks, readable in Obsidian, synced with everything else, and editable by hand whenever you like.
The sidebar draws it as a starred section above the tree. Drag a row onto another to reorder; the
list lines move in the note and nothing else on the page does. It is a different thing from
[pin to top](editor.md#arranging-the-tree), a scratch area above the tree that belongs to one
browser; a bookmark is in the note and travels with it.

The note's grammar is three kinds of list line, and you can write any of them by hand:

```markdown
## Reading

- [[Ledger]]
- [[Ledger#April|April's ledger]]
- `tag:physics before:2026` Older physics

## Kitchen

- [[Bread]]
```

- `- [[Note]]` is a note (★). An alias after `|` is the label the row shows.
- `- [[Note#Heading]]` is a **heading** inside a note (§): the row opens the note and lands on
  that heading, exactly as the link would if you clicked it in a note.
- `` - `query` `` is a **saved search** (⌕): an inline code span holding anything the search box
  takes, [operators](editor.md#navigating) included. The row runs it in the search box above the
  tree. Any text after the span is the row's label; without one, the row shows the query itself.

Headings and prose between the lines are yours and are left where they are; the sidebar lists the
rows flat, in the note's order. `Ctrl/Cmd Shift B` keeps or removes the whole-note line only — a
heading bookmark into a note is not the note, so it is never taken off by the shortcut.

## Named layouts

**Save layout as…** in the palette keeps the current arrangement (panes, tabs, splits, never
content) under a name (*Research*, *Writing*), stored in the vault's own `.astrolabe/layouts.json` so the
desktop app and a browser share them ([settings travel with the vault](backup-and-sync.md#settings-travel-with-the-vault)). **Restore a layout…** lists them with Restore and Delete; restoring swaps the
whole arrangement and prunes tabs whose notes have gone since.

## Tags as a tree

The tag shelf under the tree is a tree of its own: `book/fiction` and `book/history` show as `book`
once, with the count of everything under it, and a chevron opens the branch. The small control in
the shelf's corner sorts by count or by name; both choices and the open branches are remembered per
device. A click still filters the tree, a second click clears the filter, and a right-click renames.

## Properties as a shelf

Under the tags sits **Properties**: every frontmatter key the vault uses, with the count of notes
that carry it, most-used first. Click a key and the search box runs `prop:key` — the notes that
have it at all. The chevron beside a key opens its distinct values, up to the twenty most common,
each with its own count; click one and the search runs `prop:key=value` (quoted for you when the
value has a space in it). A second click on either clears the search. A list value counts once per
item, so `authors: [Ibn Khaldun, Al-Jahiz]` shows both names under `authors`, and "Reading" and
"reading" are one value, the way the [`prop:` operator](editor.md#live-queries) matches them. The
`tags` key is not listed here; it has the shelf above. The shelf is the owner's: a visitor's sidebar
does not draw it, and its counts are scoped like the tags' — a key seen only on unpublished notes
never reaches a visitor session. The collapse is remembered per browser.

## On a phone

On a phone, and on a tablet with no mouse, Astrolabe is laid out for the hand rather than for a
desk. There are no tabs, no panes and no status bar; there are screens, a bar of five doors at the
bottom, and sheets that rise from the bottom edge. Every part of the product has a screen of its own
here: nothing on a phone is the desktop's page squeezed.

**The five doors.** The bar at the bottom holds **Today**, **Notes**, **Search**, **Calendar** and
**More**, each with its name under its icon. Each keeps its own place: open a folder in Notes, look
something up in Search, and going back to Notes finds the folder where you left it, scrolled where you
left it. Tapping the door you are already in takes it back to its start.

- **Today** is the home screen: a field at the top that captures a line into today's note (the same
  capture as [quick capture](capture.md); while it is empty its button is a microphone for a voice
  note), today's note itself, every Sigil task due today as a row you tick in place, every Orbits
  deck with cards due as a row that starts the session, and the last notes you were in. On a phone
  that opens a vault directly (the pocket), the capture field is there too, and the line is committed
  like any other edit.
- **Notes** is the vault, two ways, and a switch at the top of the tab — **Tree** | **Folders** —
  chooses between them; the choice is remembered on the device.
  - **Folders** shows one folder per screen: rows a thumb can hit, each folder with its count and a
    chevron. The bar at the top is the folder's path — *Notes › Mathematics › History* — and every
    part of it but the last is a way up: tap *Mathematics* and you are there. When the path is too
    long for the bar its middle folds into **…**, which opens the folders it hides as a sheet; the
    folder you are in always keeps its name. The **‹** beside the path goes **up** — to the folder
    this one is in, and from a top-level folder to the vault — never to another tab, whatever you
    did before you got here.
  - **Tree** shows the whole vault as one list: tap a folder to open it in place, under its
    chevron, and tap it again to fold it. The folders you open stay open on this device, until you
    fold them. Hold a row for its menu, as in Folders.
  In both, a folder's pictures, recordings and films are **one row** after its notes — *Files · 13*
  — that opens in place, and a file opens in the viewer. A folder with no notes in it says so, with a
  **New note here** button. The busiest tags sit in one row of chips at the top of the vault; the
  last chip, **All tags**, opens every tag as a sheet. Your pinned rows sit above the rest. The **+**
  in the corner is a new note in the folder you are in (hold it for a new folder), and the arrows
  beside it change the order. Pull the list down from its top to refresh it: the vault is read again,
  and in [the Android app's GitHub vault](mobile.md) that is also *sync now*.
- **Search** opens with the keyboard already up. Its three segments are **Notes** (the vault search,
  and your recent notes while the field is empty), **Commands** (every command the palette has) and
  **Tags**.
- **Calendar** is the month. Tapping a day raises that day — its note, its sigils, its cards and its
  reading — as a sheet.
- **More** is everything else, in groups: Orbits, Sigils, the library, Media, the weekly review and
  the graph; Trash, Settings, Backup & sync and the theme; the designer and the visitor preview; the
  tour, About and sign out.

**A note fills the screen.** Its bar at the top is the way back, the note's name (tap it to return
to the top), an icon for the mode the note is **in** — a pencil while you are editing, a book while
you are reading; tap it to switch — and **⋯**. The bar slides away as you read down and returns the
moment you scroll up. Nothing sits at the bottom, except while you are typing: then a row of keys
rides on top of the keyboard with `[[`, `#`, a task box, bold, a heading, undo, redo and a key that
puts the keyboard away.

**The note's sheet.** ⋯ opens a sheet with four parts: **Outline** (tap a heading to jump there; the
sheet gets out of the way), **Backlinks**, **Properties** (tap one to change it, or add one) and
**Actions** — publish, the other face of a bilingual pair, share, move, history and delete. Publishing
asks first: it is the one action that reaches other people. The properties of a note show above it
as a single line, *3 properties ›*, which opens the same sheet. **Tags** in Properties opens the tag
picker: every tag in the vault, the note's own ticked, a field that finds one or adds a new one — a
tap writes the note at once.

**Holding means "more".** Hold a row in Notes to rename it, move it, pin it, publish it or delete
it. Hold a heading while editing to fold it, fold what is under it, copy a link to it, select it,
focus on it or move it into a note of its own; hold a heading while reading for the rows that make
sense without the editor — copy a link, copy its Markdown, move it into a note of its own. (On a
phone the fold arrow and the heading's **⋯** are gone from the margins, so the text has the whole
width.)

**Orbits, Sigils and Media are lists.** **Orbits** lists your decks with what each has due; a deck
opens its own screen — due, new and total, one **Study** button, and its sections if you want to
study just one — and Study starts the session on the whole screen. Leave the session by its own
**‹ Orbits** or by going back, and you are on the deck again. **Sigils** lists every sigil with
how today stands ("2 of 3 today", a rest day, done, the step a course is on); a sigil opens with
**today's checklist first**, then the week and the twelve-week heat map, then the streak and the
month, and a course's units with their projected dates under them. Tick a box and it answers at
once. Edit, open the note and delete are under **⋯**. **Media** lists your trackers shelf by
shelf, with a status filter above them; a tracker opens as its card, with its − and + and its edit
button.

**A book has its own bar.** A PDF or an EPUB opens on the whole screen with one bar of its own: the
way back, the title, a slider that moves through the pages (or the chapters) and jumps when you let
go, and **⋯** — the contents (as a sheet), search, go to a page, night mode, quote into a note, your
marked passages and the reading session. A PDF opens at the width of the screen; pinch to zoom, or
use the − and + at the corner. The library is a list of every book, the ones you have been reading
first.

**Settings is a list of sections.** More → **Settings** lists the sections, each with the sentence
saying what it decides, and a search above them that finds any setting by name. A section is a
screen of its own. As soon as you change something a bar rises from the bottom with **Discard** and
**Save**; if you go back, switch door or open something else with changes unsaved, Astrolabe asks
before throwing them away. **This device** saves each choice as you make it, as it does on the
desktop.

**Sheets and the back gesture.** Every sheet rises from the bottom, can be dragged down to close,
dragged up to see more, or dismissed by tapping the page behind it. The phone's back gesture — the
Android back button, the edge swipe — closes the sheet first, then goes back one screen, and back
from the first screen of a link you followed comes home to Today rather than leaving the app. The
theme picker, the designer, What's new, the tour, a picture in the viewer and a book's search or
contents answer the back gesture the same way.

**Back means up, and your place is kept.** Each door keeps its own way back: come to Notes from
Today and the back gesture walks up the folders you had open before it ever goes to Today. The **‹**
on a folder always goes to the folder above it. And your place survives the page being reloaded, the
app being brought back from the background, or a sync: the same screen, the same folders behind it,
the list scrolled where it was. (A sheet that was open is not brought back — you land on the screen
under it.)

**On a tablet, and on a foldable opened.** A screen that is wide for its height gets two columns:
every tablet either way up, and anything at least 640 pixels wide and nearly square or wider — a
Galaxy Z Fold opened, a small tablet, a phone on its side. The same doors stand in a rail down the
side, the list you are browsing stays in a column beside it and the note fills the rest; here
**Notes starts on the Tree**, which reads like a book's contents beside its page. Picking another
note replaces the one beside the list, and the list keeps its place — its scroll, its open folders,
the note you are reading lit. Drag the grip between the two columns to give the list or the note
more room (double-tap it to put it back); the width is remembered. The list's own **‹** goes up a
folder while a note is open. The note's sheet slides in from the side over the note's column, never
over the list. A study session and a book take the whole screen. A tablet with a keyboard and a
trackpad gets the desktop layout instead.

**With a keyboard.** A bluetooth keyboard is noticed the first time you type on it, and from then on
the usual shortcuts work — Ctrl/Cmd+K opens Search, Ctrl/Cmd+P the palette — and More gains a
**Keyboard** group with vim's keybindings, zen and the shortcut sheet.

**Every target is a finger's width.** Nothing you can tap is smaller than 44 by 44 pixels, and every
field you type into is set at 16px, below which iOS Safari zooms into the field and leaves it there.
The notch and the home indicator are kept clear. `npm run check-phone` drives all of this — taps,
back gestures, sheets, a study session, a tick, a book's slider, a setting saved and a tag written, in
both languages, on a phone held in the hand, a Galaxy Z Fold's cover screen and its inner screen
opened, a window with a pen and a tablet both ways up
([Development](development.md#npm-run-check-phone--the-phone-shell-driven)).

**What counts as a phone.** A window narrower than 700px, or any device whose own pointer is a
finger that cannot hover — which includes a tablet held in the hands, at any width. A laptop with a
touchscreen *and* a mouse keeps the desktop's panes, and so does a desktop window wider than 700px.
Turn a tablet, open a foldable or narrow a window past the line and the layout follows at once,
with the same note open. A Galaxy Z Fold is both: its cover screen (about 344 by 882) is a phone
with one column, and its inner screen opened (about 690 by 829) is two. The phone never changes the tabs and panes your desktop keeps: it does not
save its one open note over them.

## Pages that are tabs

Besides notes, books and drawings, a pane can hold pages that name no file: the graph, the
[Sigils page](sigils.md), [Orbits](orbits.md), the Media page, [the Calendar](calendar.md),
[Today](today.md) and [the Timeline](timeline.md). Each opens as a tab in the pane you are in, has an
address of its own (`/today`, `/timeline`, …) and sits beside whatever else is open.
