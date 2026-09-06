# Panes, tabs and windows

*Splitting the note column, what a tab is, several windows over one vault, and the smaller doors: the local graph, the trash, the tour, aliases.*

---

## Panes

The note column can be split. `Ctrl/Cmd \` opens a second pane beside the current one on the
same note; `Ctrl/Cmd Shift \` opens one *below* instead. Panes stand in columns along the reading
direction, at most two stacked in a column, three columns, six panes in all; the seventh is
refused with a sentence rather than a shuffle. `Ctrl/Cmd Alt \` closes the focused pane and its
tabs are **adopted by a neighbour, never dropped**. `Ctrl/Cmd Alt Shift` with an arrow moves the
focus between panes, physically, in both languages, and *Focus next pane* in the palette walks
them in order.

**Drag the seam between two panes to resize them.** The hairline between two columns, and the
one between the two panes of a column, is a grip: drag it and the weights follow the hand, from
one tenth to nine tenths; double-click it and the pair is evened out. The arrangement is
remembered with the layout.

**The graph is a tab.** `Ctrl/Cmd G`, the *graph* button in the status bar or *Graph view* in
the palette opens the vault graph as a tab in the focused pane, beside the notes, and the same
gesture closes it again. Click a node and the note opens as the tab next to it, so the map and
the note flip back and forth the way two notes do; the graph tab can be dragged into a split
like any other, and a pane can hold the graph while the one beside it holds the note.

**Drag a tab to split.** While a tab is being dragged every pane raises five targets: its four
edges, which split it and land the tab on that side, and its centre, which joins its strip. A
target the layout would refuse is not drawn at all. The drag works between windows too.

The two side panes, the notes sidebar and the outline, are documented with the
[editor](editor.md#the-two-side-panes).

## Tabs

Each pane has its own strip. A single click in the tree opens a note in a **preview tab**, which
the next preview open replaces, so following forty links does not leave forty tabs; editing the
note, or double-clicking, keeps it. `Ctrl/Cmd Alt PageDown` / `PageUp` walk the strip and
`Ctrl/Cmd Alt W` closes a tab; middle-click closes one too, and a dirty tab wears a dot. The strip
is one tab stop for the keyboard: arrows walk it, `Home` and `End` jump, `Delete` closes the
focused tab. Right-click a tab for **pin** (a ◆ in the row, protected from *close others*), close
others, close to the right, reveal in the sidebar, and copy the path. When more tabs are open
than the strip is wide it scrolls inside its own box and the active tab is kept in view; the
tool cluster at the top right never goes under it.

## Several windows, one vault

Open a second window on the vault (*Open this note in a new window* in the palette; on the
desktop app also `Ctrl/Cmd Shift N`). Two windows on the same note are not two editors: one
holds the **edit lease** and saves, the other becomes a live reader with a strip that says
*Another window is editing this note* and an **Edit here** button that takes the lease over. No
coordinator and no lock file: the oldest window wins a tie, claims age out with a heartbeat, and
a window that closes releases its lease. Theme and editor language follow between windows, and
signing out in one signs out all. The desktop app adds a [reference window](desktop.md#the-reference-window)
that stays on top.

## When the file changed under you

A save that would overwrite a version of the note you never saw is **refused**, not merged: the
server compares the file's modification time with the one your editor loaded. Your text stays in
the editor, autosave pauses, and a strip above the note offers **Keep mine** or **Take theirs**
(undoably). The full story, including the two-server case, is in
[Backup & sync](backup-and-sync.md#two-servers-one-vault).

## The local graph

The right panel carries a **local graph**: the open note in the centre with its direct wikilink
neighbours, drawn with springy physics you can grab, drag with momentum, click to open and
double-click to open in place. It stays live as you write and link, collapses with the panel's
other sections, and remembers whether it was open. The whole-vault graph is
[the graph view](editor.md#navigating).

## The command palette, beyond notes

`Ctrl/Cmd P` searches notes and commands together, and with an empty query it lists the notes you
open most, ranked by a decaying visit count kept in this browser (paths only, pruned against the
tree, never shown to a visitor). The same ledger breaks ties in wikilink autocomplete. Rows worth
knowing: *Reveal note in sidebar*, *Copy link to note*, *Duplicate note* (a copy beside it),
*Open this note in a new window*, *Focus next pane*, *Switch to* the light or dark twin of your
theme, *Snapshot now*, *Open trash*, *Take the tour*.

## Aliases

`aliases:` in a note's frontmatter makes it answer to more than one name: each alias appears in
wikilink autocomplete as *alias of Title* and in search as *matched alias*. When you **rename**
a note, the toast offers **Keep as alias**, so every `[[old name]]` in the vault and every URL
you have shared keeps working without a rewrite. (`[[Name|label]]` is a display label on one
link and is a different thing.)

## The trash

Deleting a note, an attachment or a folder moves it to `.trash/` in the vault. **Open trash** in
the palette lists what is there, what is inside each entry, how big it is and when it went, with
**Restore** per row, a permanent erase per row, and *Empty trash*. Restore puts an entry back
**where it came from**, which the trash remembers, and says beforehand when that spot is taken
(it lands beside it) or gone (it lands at the root). Before a delete, every dialog says what is
really inside: a folder of "0 notes" that holds forty images says so, and names the notes that
embed them. `.trash/` is never pushed by [Backup & sync](backup-and-sync.md#what-sync-never-stages).

## The tour

*Take the tour* in the palette deals a deck of illustrated cards, one feature each, and every
card has a **Show me** that opens the real thing rather than a picture of it: the designer, the
themes, publishing, collections, trackers, history, search, templates, LaTeX, the PDF reader,
panes, the graph, backup, the phone layout and the keys. It also waits on an empty vault, at
the foot of the `Ctrl/Cmd /` sheet, and in `Welcome.md`. It never opens by itself.

## On a phone

The sidebar is a drawer that follows your finger: a horizontal swipe anywhere drags it in,
interruptible and reversible, committed by distance or a flick; the outline pane answers the
mirrored swipe. Edges are logical, so in Arabic the drawer comes from the right with no second
rule.
