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

The sidebar is a drawer that follows your finger: a horizontal swipe anywhere drags it in, and the
gesture can be interrupted or reversed; it opens fully once you have dragged far enough, or with a flick. The outline pane
answers the mirrored swipe. In Arabic the drawer comes from the right by itself, with no second rule. The outline pane is a drawer on a phone too: the outline switch in the status bar
slides it over the page from the end edge, with backlinks, unlinked mentions and on-this-day inside.

The top bar keeps three controls on a phone: the outline switch, the settings gear and a **⋯**. The
⋯ opens every other tool as a labelled row: the library, Orbits, Sigils, the calendar, the designer, visitor
preview, the graph, themes and sign out. Nothing scrolls off the edge. Zen and the shortcut sheet
are not offered, since neither means anything on a phone.

**What counts as a phone.** The drawer layout is used below 700px, and below 1000px on a device
with no fine pointer — no mouse and no trackpad. So a tablet held in the hands gets the drawer,
while a desktop window narrowed beside a browser keeps its docked, resizable panes down to phone
width.
