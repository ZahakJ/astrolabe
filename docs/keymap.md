# Keymap

*Every keyboard binding, and why the awkward ones are where they are.*

← [Back to the README](../README.md) · [All docs](README.md)

---

A binding is a key (or a chord of keys, like `Ctrl/Cmd P`) that does one thing in the app.
`Ctrl/Cmd /` opens the in-app shortcut sheet: every binding, grouped and searchable, in whichever
language the instance is in. Inside the sheet, `↑` and `↓` walk the rows that can be run (`Home` /
`End` jump to the ends), `Enter` runs the lit row and `Esc` closes. Typing keeps filtering, and the
cursor starts on the best match, so "graph" then `Enter` is the whole gesture. This page is the same
list on paper.

<!-- keymap:begin -->

## Shell

| Keys | Action |
| ---- | ------ |
| `Ctrl/Cmd /` | Keyboard shortcuts — every binding, grouped and searchable |
| `Ctrl/Cmd P` | Command palette (open note, run command) |
| `Ctrl/Cmd K` | Search — focuses the sidebar search in the app; opens a centered search overlay on the public blog |
| `Ctrl/Cmd E` | Toggle reading view ⇄ editor |
| `Ctrl/Cmd G` | Open the graph tab, or close it |
| `Ctrl/Cmd N` | New note |
| `Ctrl/Cmd Alt D` | Open today's daily note (folder and name format in Settings → Writing; `daily/YYYY-MM-DD.md` by default) |
| `Ctrl/Cmd Alt Shift D` | Open [Today](today.md) — the day's note, the sigils, cards and tasks due, and on this day, on one page; the third verb of the same idea |
| `Ctrl/Cmd Shift D` | [Quick capture](capture.md) — a line into today's note (or the inbox) without leaving the one you are in; Shift beside the daily note's Alt, because they are one idea with two verbs |
| `Ctrl/Cmd Alt L` | Switch to the note's [linguistic twin](templates-and-notes.md#linguistic-twins) — its other face, in the same tab; L for language |
| `Ctrl/Cmd Alt Shift L` | Switch the interface to the other language (English ⇄ العربية) — the chrome, not the note; works with a dialog open. The same as the status bar's language key ([Arabic & RTL](arabic-and-rtl.md#switching-the-interface-language)) |
| `Ctrl/Cmd Shift P` | Publish / unpublish the open note |
| `Ctrl/Cmd Alt P` | [Print the open note, or export it to PDF](printing.md) — Alt because `Ctrl/Cmd P` is the palette |
| `Ctrl/Cmd Shift B` | Bookmark the open note, or take the bookmark off (`Bookmarks.md`) |
| `Ctrl/Cmd Alt B` | Collapse / reopen the **Notes sidebar** |
| `Ctrl/Cmd Alt Shift B` | Collapse / reopen **Outline & backlinks** |
| `Ctrl/Cmd Shift .` | [Read the selection aloud](read-aloud.md) — in the editor, the reading view, a book or a feed item; the period because a sentence ends there |
| `Ctrl/Cmd Shift Z` | Zen mode — all chrome steps aside (`Esc` returns) |
| `Ctrl/Cmd \` | Split the pane — the new one opens on the same note |
| `Ctrl/Cmd Shift \` | Split downwards instead of beside |
| `Ctrl/Cmd Alt \` | Close the pane — its tabs are adopted by a neighbour, never dropped |
| `Ctrl/Cmd Alt PageDown` / `PageUp` | Next / previous tab in the focused pane |
| `Ctrl/Cmd Alt W` | Close this tab |
| `Ctrl/Cmd Alt Shift ↑` / `↓` | Move to the pane above / below |
| `Ctrl/Cmd Alt Shift ←` / `→` | Move to the pane on your left / right — physically, in both languages |
| `←` / `→` | Previous / next file in the attachment viewer |
| `Esc` | Out of the shortcut sheet, out of visitor preview, out of zen, out of the attachment viewer, and back to the note from `Ctrl/Cmd K` |

On the public blog shell only `Ctrl/Cmd K` and `Ctrl/Cmd /` are claimed; every other combination
is handed straight back to the browser.

## Writing

| Keys | Action |
| ---- | ------ |
| `Ctrl/Cmd B` | **Bold** |
| `Ctrl/Cmd I` | *Italic* |
| `Ctrl/Cmd U` | Underline (`<u>`) |
| `Ctrl/Cmd Shift X` | Strikethrough |
| `Ctrl/Cmd Shift H` | Highlight |
| `Ctrl/Cmd Alt /` | Comment out the selection — `%%…%%` in a note, `%` in a `.tex` file |
| `Ctrl/Cmd Alt ;` | [Harakat palette](arabic-and-rtl.md#writing-harakat) — pick an Arabic diacritic for the caret, or point every letter of the selection |
| `Ctrl/Cmd D` | Select the next occurrence of the word under the cursor |
| `Ctrl/Cmd S` | Save now (autosave runs regardless, 600 ms after you stop) |
| `Ctrl/Cmd ↑` / `↓` | Move the current line up / down |
| `Ctrl/Cmd Z` / `Ctrl/Cmd Shift Z` | Undo / redo (inside the editor; see the note on zen below) |
| `Ctrl/Cmd F` | Find and replace within the note |
| `Ctrl/Cmd Shift F` | Search and replace across the vault |

## Tables

All five live ONLY while the caret sits inside a table block — outside one, `Tab` still indents,
`Enter` still breaks the line, and `Alt` with an arrow still belongs to the browser.

| Keys | Action |
| ---- | ------ |
| `Tab` | Next table cell (in the last cell: adds a row) |
| `Shift Tab` | Previous table cell |
| `Enter` | Down a row in the table (out of the table from the last row) |
| `Alt ↑` / `↓` | Move table row |
| `Alt ←` / `→` | Move table column, alignment row included (visual arrows — flipped in an RTL table) |

**The same three keys, inside a drawn table.** Click a cell of a rendered table and a box opens in
it; `Tab`, `Shift Tab` and `Enter` mean there exactly what the rows above say they mean, so there
is one set of table keys and not two. The box adds four of its own that claim no chord outside it:
`Shift Enter` puts a `<br>` in the cell, `←` and `→` step to the neighbouring cell when the caret
is already at the box's edge (mirrored in a right-to-left table), `↑` and `↓` move a row, and
`Esc` puts the caret back in the note just after the table, leaving the cell as it was.
`Shift F10` in a cell opens the table menu — rows, columns, alignment, sorting, *Edit as Markdown*
— which a right-click opens too, and which a `⋯` under the table opens on a touch screen. See
[the editor's Tables section](editor.md#tables).

## Templates

| Keys | Action |
| ---- | ------ |
| `Ctrl/Cmd Alt T` | Insert template… at the cursor |
| `Ctrl/Cmd Alt Shift T` | New note from template… |

`Ctrl/Cmd Alt` rather than the obvious `Ctrl/Cmd T`: that one is the browser's new tab, and
`Ctrl/Cmd Shift T` reopens a closed one. Neither is takeable.

## Sections & folding

| Keys | Action |
| ---- | ------ |
| `Ctrl/Cmd Shift [` / `]` | Fold / unfold the section at the cursor — or the chevron beside the heading |
| `Ctrl/Cmd Alt [` / `]` | Fold / unfold everything |
| `Ctrl/Cmd Alt F` | Focus one section — everything else collapses; `Esc` restores it exactly |
| `Ctrl/Cmd Alt ↑` / `↓` | Jump to the previous / next heading (scrolls, in reading view) |

**On macOS the two fold rows are spelled differently.** The section fold is `Cmd Alt [` / `]`
(`Cmd Shift [` binds nothing), and fold-all stays on `Ctrl Alt [` / `]`. The shortcut sheet prints
`Ctrl/Cmd` for both.

**`Ctrl/Cmd G` opens the graph everywhere, including inside the editor.** To find the next match
again, press `F3`, or `Enter` in the find field.

<!-- keymap:end -->

## Menus, gestures and the pointer

These are surfaces rather than bindings: Astrolabe claims no keystroke of its own for them, so the
shortcut sheet names the surface where its other rows name a key.

| How | Action |
| --- | ------ |
| Click | Follow a rendered wikilink (create it if unresolved) |
| `Ctrl/Cmd`-click | Follow a wikilink on the line you're editing |
| Click | Open an image or PDF from the tree, in the attachment viewer |
| Right-click, `Shift F10`, or the menu key | Formatting menu for the selection — text style, structure, insert, colour |
| Right-click a misspelled word (nothing selected) | Spelling suggestions and "Add to dictionary" — with a selection, right-click means formatting instead |
| Right-click a heading, or the ⋯ beside it | Section menu — the whole subtree, not the line |
| Drag a row in **Outline** | Reorder a section, and everything under it |
| `/` at line start | Slash menu (callout, code fence, table, …) |
| `Tab` | Indent (CodeMirror's `indentWithTab`) |
| `↑` `↓` `Enter` `Esc` | Navigate / confirm / dismiss the palette (`Enter` always runs the keyboard's row, never whatever the mouse happens to rest on) |
| Selection menu | Extract the selection into a new linked note — `[[link]]` left standing, and the toast's Undo restores **both** files |
| Selection menu → Insert | Footnote — `[^n]` numbered so existing footnotes stay ordered, definition stub at the note's end; `\footnote{…}` in a `.tex` note |
| Selection menu → Structure | Title Case / UPPERCASE / lowercase over the selection, per cursor — wikilink targets and code spans untouched |
| Selection menu → Callout | Wrap the selection in a `> [!type]` callout — every line prefixed, blank lines kept inside the callout |

Every modal, popover and picker in the product answers the same four keys: `Esc` to leave, arrows to
move, `Enter` to commit, and type-ahead wherever there is a list. `Esc` always belongs to the
innermost layer that is open.

## The book reader

The reader has its own sheet (`?` inside a book) and its own keys: `j`/`k` scroll, `J`/`K` page, `gg`/`G`, `p` go to, `o` contents, `/` `n` `N` search,
`+`/`-` zoom, `a`/`s`/`d` fit width, fit page, two pages, `i` night, `r` rotate, `m<c>`/`'<c>`
marks, `h` highlight, `c` cite, `e` margin note, `x` unmark, `A` marked passages, `:` command
line, `z` zen, `q` close, and a count typed before any of them. The whole table, with what each key
does, is in [The book reader](books.md#reading).

An **EPUB** keeps the keys that still mean something in a text with no pages — `j`/`k`, `Space`,
`gg`/`G`, `/` `n` `N`, `o`, `z`, `l`, `q`, `?` — and reads the rest differently: `J`/`K` step a
chapter rather than a page, `+`/`-`/`0` (and `Ctrl`/`Cmd` with them) set the TYPE size rather than
a zoom, and `c` copies a citation to the selected passage. There is no `a`/`s`/`d`, no `i`, no `r`
and no `:` line. See [EPUB](books.md#epub).

## Feeds

The [Feeds](feeds.md) page answers four keys of its own while focus is inside it; anywhere else
the same letters type as usual. They are matched by the key's position, so they work on an
Arabic layout too.

| Keys | Action |
| ---- | ------ |
| `j` / `k` | The next / previous article |
| `o` | Open the original page in a new tab |
| `e` | Mark read, and go on to the next |

## The tour

A deck of illustrated cards, one feature each, with a **Show me** that really opens the thing it
describes. It has no keystroke of its own and never opens unasked; open it from the palette
(*Take the tour*), the quiet line on an empty vault, the foot of the `Ctrl/Cmd /` sheet, or a line
in `Welcome.md`.

| Keys | Action |
| ---- | ------ |
| `←` / `→`, or `h` / `l` | Flip a card. **Logical**: in Arabic, `←` goes forward |
| Swipe | The same flip, on a touch screen — mirrored the same way |
| `Esc` | Leave. The card you were on is where you come back |

## The designer

| Keys | Action |
| ---- | ------ |
| `Ctrl/Cmd S` | Save the design draft |
| `Space` | Lift / drop a section row |
| `↑` / `↓` | Move a lifted row (`Alt ↑` / `↓` moves any row) |
| `Esc` | Cancel a lift, close the section picker, close the designer |

## Why these keys

The five formatting keys are Obsidian's, except underline, which Obsidian has no command for
(Markdown has no underline; Astrolabe's writes `<u>`). All five
**toggle**: press twice and the markers come off. With nothing selected they insert the pair and
park the caret between them, so bold-then-type works. Across a multi-line selection they apply
**per line**, because markdown emphasis cannot cross a blank line, and one `**` at the top of three
paragraphs is two stray asterisks, not bold text. In a [`.tex` note](latex.md) the same five keys
write LaTeX instead, and the two that markdown has no spelling for are absent from the menu rather
than approximated.

**`Ctrl/Cmd B` is bold, so the pane toggles wear `Alt`:** `Ctrl/Cmd Alt B` folds the Notes sidebar
and `Shift` picks the other pane. Outside the editor `Ctrl/Cmd B` and `Ctrl/Cmd Shift B` are
swallowed, so the browser's bookmarks sidebar and bookmark bar never open over the app. macOS Option+B (`∫`) and Option+T (`†`)
work, and every binding declines when `AltGr` is held, so a European layout's Right-Alt never folds
a pane by accident; see [Non-Latin keyboards](#non-latin-keyboards) for how that is decided.

**The tab keys wear `Alt` for the same reason the templates do.** The world has three chords for
tabs, `Ctrl Tab`, `Ctrl PageUp`/`PageDown` and `Ctrl W`, and the browser owns all three. Two of them
can take one more modifier; the third cannot, because `Alt Tab` belongs to the window manager. So
`Ctrl/Cmd Alt PageDown`/`PageUp` walks the strip and `Ctrl/Cmd Alt W` closes the tab. Not arrows: `Ctrl Alt ←`/`→` is GNOME's workspace switcher and macOS Chrome's own tab switcher, and
neither hands it back. "Next" means **next along the strip** in both languages: the bar mirrors with
the reading direction, and a tab bar is a list, not a map.

Nothing in the interface calls either pane "the left one": the toggles, the palette and the
shortcut sheet say **Notes sidebar** and **Outline & backlinks**, in both languages, because
[in Arabic they swap ends](arabic-and-rtl.md).

In vim mode, `Ctrl D` and `Ctrl B` inside the editor keep their half-page scroll and page-up, and
`Esc` stays vim's mode key; use `Cmd`, the palette, or zen's ✕ instead. On macOS, `Cmd Shift Z`
inside the editor stays redo; `Ctrl Shift Z` enters zen there.

## Non-Latin keyboards

**Every binding on this page works with an Arabic, Persian, Russian, Greek or Hebrew system
keyboard.** Your shortcuts are the keys marked with the Latin letters on your keycaps, including
every chord with `Shift` in it: `Ctrl/Cmd Shift F` (find and replace across the vault) is the `ب`
key on an Arabic layout.

The rule, in one line: **a shortcut follows the letter your layout types when that letter is Latin,
and the key's position when it is not.**

- On a US, UK or German keyboard nothing changes.
- On **AZERTY** and **Dvorak** the letters have moved, and the shortcut moved with them:
  `Ctrl Shift Z` for zen is the key that types `z` (physical `W` on AZERTY), not the key sitting
  where a US keyboard has Z. That key types `w`, and `Ctrl Shift W` closes your window.
- On **Arabic, Persian, Russian, Greek or Hebrew** there is no Latin letter to follow, so the
  position answers: the key marked `P` opens the palette whatever it types.
- **`AltGr` is always typing, never a command.** On layouts where Right-Alt reports as Ctrl+Alt,
  `AltGr E` stays `ę` and does not toggle the reading view.
- The `Ctrl/Cmd /` sheet knows this. On a keyboard that types none of these letters it prints the
  character each key produces beside the letter (`P` `ح`), with a line saying why. This works on
  Chromium; elsewhere it prints the letters alone rather than guessing.

Vim mode is the exception: in normal mode `hjkl` are keys an Arabic or Russian layout does not
have, so vim is a Latin-layout feature.
