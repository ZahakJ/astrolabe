# The PDF reader

*Every PDF in the vault, read in a viewer that answers to the keyboard, remembers your page, and turns a highlight into a note.*

← [Back to the README](../README.md) · [All docs](README.md)

---

Click a `.pdf` in the tree and it opens as a **book**: a reader with no permanent toolbar, driven by
keys the way zathura and vim are, that keeps your place even after you close the app or rename the file, and hands what you mark
straight into the note beside you. It is a workspace tab like any note, so a book can sit
in a pane next to the notes you are writing about it. The shelf of every book in the vault is at
`/library` in the app (and under *A library in the vault* in the tour).

## The shelf

Every PDF in the vault as a card: cover, title, author where the file names one, page count, folder,
file size, and how far you have read (*38 % read*). A cover is page one rendered small. A cover is
only requested when its card scrolls into view, and the request is cancelled as it leaves, so a
shelf of two hundred books opens at once, and a card whose cover has not arrived shows its title
set in type rather than a spinner.
The search field filters titles, authors and paths, **and every marked passage in every book**,
through the same [Arabic fold](arabic-and-rtl.md#searching-in-arabic) as the rest of the product.

## Reading

The controls stay out of the way: a title bar and a status line appear when the pointer moves or a
key is pressed, and fade again after a couple of seconds. The status line carries the page counter
(a button; it opens *Go to*), the zoom, the search counter, and a swatch of the ink `h` will use.

Keys that work the same on every keyboard layout:

| Key | Does |
| --- | --- |
| `↓` / `↑` | scroll by four lines of body type |
| `PageDown` / `PageUp`, `Space` / `Shift Space`, `Enter` | a screen down or up |
| `Home` / `End` | first page / last page |
| `Ctrl/Cmd D` / `Ctrl/Cmd U` | half a screen down / up |
| `Esc` | close whatever overlay is open, else clear the search highlight |

Letter keys follow the Latin letters printed on your keycaps, so they work on an Arabic or Russian
layout too (see [Non-Latin keyboards](keymap.md#non-latin-keyboards)). A number typed first is a
count: `5j` scrolls five steps.

| Key | Does |
| --- | --- |
| `j` / `k` | scroll down / up (`5j` five steps) |
| `J` / `K` | next / previous page (`5J` five pages) |
| `gg` / `G` | first / last page; `12G` goes to page 12 |
| `p` | **Go to**: a page number, `+3`, `40%`, or a chapter name, with the contents listed under the field |
| `o` | the contents (the PDF's own outline) |
| `/` then `n` / `N` | search from this page forward, wrapping; next / previous match |
| `+` / `=` / `-` | zoom in / out |
| `a` / `s` | fit width / fit the whole page |
| `d` | two pages side by side |
| `i` | night mode: off → **night** → **flip** |
| `r` / `R` | rotate a quarter turn |
| `m<c>` / `'<c>` | set a mark at this page / jump to it; named by the character typed, so `mج` is recalled with `'ج` |
| `h` / `H` | highlight the selection in the current ink / step to the next of six inks |
| `c` / `C` | cite the selection into the note beside you / pick which open note first |
| `e` | write a note in the margin of the selection or the highlight under it |
| `x` | unmark the passage under the selection (Undo on the toast) |
| `A` | *Marked passages*: every highlight with its ink, page, text and note |
| `:` | the command line |
| `z` | zen: the book alone on the screen |
| `l` / `q` | back to the shelf / close the book |
| `?` | the reader's own key sheet |

**Night mode has three states, not two.** *Night* draws the page through a dark filter and then
redraws **every picture unfiltered on top**, so the type inverts but photographs, plates and figures
do not; an art book or an atlas is exactly what a plain inversion ruins. *Flip* inverts everything,
which is what a scanned book wants.

**Right-to-left books are detected from their own text** (sampled from the middle of the volume,
away from the copyright page) and remembered; `:rtl` and `:ltr` override the guess. In two-page
mode an Arabic book puts page 2 to the *left* of page 3. The spread mirrors with the book; the panel
around it mirrors with the interface language.

## The command line

`:` opens a vi-style command line. A word matches the first command it abbreviates, so `:z` is zoom
and `:h` is help, never highlight:

`:212` · `:+3` / `:-3` · `:40%` · `:page` · `:quit` (`:q`) · `:library` (`:lib`) · `:zoom 150`
(`:z`; bare `:zoom` is 100 %) · `:zen` · `:fit width|page|height` · `:rotate [90|180|270]` ·
`:dual on|off|toggle` · `:invert off|night|flip` · `:rtl` / `:ltr` · `:mark <c>` · `:jump <c>` ·
`:search <text>` · `:outline` · `:forget` · `:end` · `:help` · `:highlight` · `:ink [1-6]` · `:cite` ·
`:note` · `:annotations`

Numbers are read in Latin, Arabic-Indic and Persian digits alike: `:٢١٢` is page 212.

## Your place is kept

The reader remembers the page and the position *within* the page, the fit, the zoom, two-page mode,
rotation, night mode, the direction and your marks, per book, in `books.json` — kept in the data directory and mirrored into the vault's `.astrolabe/`
folder, so every server over the vault opens a book where you left it ([settings travel with the vault](backup-and-sync.md#settings-travel-with-the-vault)). The
key it is all filed under is a **fingerprint of the file's contents**, never its name or place, so renaming or re-filing a book in Obsidian,
Syncthing or a terminal loses nothing: page 612 is still page 612, and so are the highlights and the
citations that point at them. Scrolling is saved a moment after you stop; a zoom or a rotation is
saved at once and the page stays where it was, so zooming in to read a footnote does not throw
your place away. `:forget` discards a reading position.

## Highlights, citations and margin notes

Select a passage and press `h`: the words are marked in the current ink (there are six; `H` steps
through them), stored beside the vault as rectangles measured as fractions of the page, plus the text under them.
**The PDF file is never written to.**

Press `c` and the passage is **cited into the note beside you**. The quote is rebuilt from where
the words sit on the page rather than the PDF's internal order: columns are found, lines are grouped, an
Arabic line runs right to left, and an end-of-line hyphen is rejoined (*sig-* / *nificant*) while
*Anglo-Saxon* and *1990-1995* survive. The quote appears in an editable field before a single
character reaches the note, because the assembler is guessing, and a sentence the author never
wrote must not land in your notes silently. It is appended as a `> [!quote]` callout followed by a
link to the exact spot, `[[Book.pdf#page=42&rect=…|Book, p. 42]]`, in the instance's own numerals.
The write goes through the open editor when one holds the note, so it is one undoable step and the
toast carries **Undo**. `C` asks which open note first.

Clicking such a link later reopens the book at that page and pulses the marked rectangle once. If
the file has since been renamed the link still resolves, by the highlight's id and the file's
content, and a toast **offers** to repair the link in the note; it never rewrites one on its own.

`e` attaches a note to a highlight; `A` lists every marked passage in the book; the shelf's search
finds them across the vault.

## Reading sessions

The reader keeps a quiet clock over your page turns. It starts on the first turn, counts the time
between turns, and stops counting once three minutes pass without one — a page nobody has turned in
three minutes is a page nobody is reading. The status line shows the minutes while the clock runs
and *Paused* once it stops; nothing is shown before the first turn. Pages are counted when you turn
**away** from them, and a page flipped past in under a few seconds is not counted, so a scroll
through a chapter to find your place does not log the chapter.

Close the book (`q`, the ✕, the tab's own close), press **End session** in the title bar, or type
`:end`, and the sitting is logged:

> Read 27 pages in 41 min — logged to *Muqaddimah* · **Undo**

It goes into the book's [tracker](trackers.md) note, and nowhere else: one line in the fence's
`sessions:` block, and the progress moved by the pages read when the tracker counts pages (a bar
kept in chapters, or a bare percentage, is yours to move; at the end of a book the bar stops at the
total and Undo takes back only what it moved). The
tracker is found by its `file:` line when one names this PDF, and by its title otherwise (the
PDF's own title, else its file name, against `kind: book` trackers). A book with no tracker gets a
toast that says so and offers **Track it**, which writes a `Media/Books/<title>.md` note the way
the Media page would, with `file:` pointing at this PDF and the session already in it. **Undo**
takes the line and the nudge back out of the note as it is then.

If a [sigil](sigils.md) slot today links the tracker note or the PDF (`evening: 20 pages of
[[Muqaddimah]]`), or the plan's `book:` line names the tracker, the slot is ticked for you — the
`book:` task only when the sitting covered the day's pace. Undo unticks it.

From the sessions, the tracker card reads the book's own speed over its last five sittings and says
*about 1.6 pages a minute here — 4 h 20 left*. "Here" because it is this book's pace: a dense
commentary and a novel are not read at one speed.

Flipping to the note beside the book and back is the middle of a sitting, not its end: the clock
is stashed in the browser between turns and resumes when the same book comes back within half an
hour. A tab closed mid-sitting is logged the next time that book opens, for the day it happened,
with the same toast and Undo — and a sigil slot it ticks is that day's, not the day you reopened
the book.

## Highlights → note

On the shelf, every card has **Highlights → note**. It writes one note beside the PDF —
`Books/Muqaddimah.pdf` gets `Books/Muqaddimah — Highlights.md` — with a heading per chapter from the
PDF's own outline when it has one (the shallowest level with at least two entries), else one list,
and every marked passage as the same `> [!quote]` block a citation writes, its link opening the book
at the page and pulsing the passage. A margin note follows its passage as ordinary prose.

The block sits between two markers:

```
<!-- astrolabe:highlights -->
…
<!-- /astrolabe:highlights -->
```

Run the action again and only what sits between the markers is rewritten; anything you wrote above,
below, or between them stays. A note with no markers (one you made by hand) gets the block appended,
never overwritten. The toast offers **Open**.

## Search inside a book

`/` searches the book's text from the current page forward and wraps around, so it finds *the next
one of these* rather than the first in the volume. `n` and `N` step, and the counter reads *3 of
41*. The match is tinted without touching the page's text, and it becomes the selection,
so `/phrase` then `h` marks exactly what was found. The matcher folds Arabic diacritics and letter
forms like every other search in the product.

## Searching inside every book

The sidebar's search box answers from **the pages of every PDF on the shelf** as well as from notes.
A book row shows the book's title (its own `/Title`, or the file name), the page (*p. 42*, in the
instance's numerals) and the page's text around the match; clicking it opens the reader on that
page. Every word must appear on the page, as with the operators; `path:Books` narrows by folder; the
note operators (`tag:`, `is:`, dates, links) are questions about notes and leave books out. Two
operators pick a side:

| Type | Finds |
| --- | --- |
| `in:books` | pages of the shelf's books only; on its own, one row per book |
| `in:notes` | notes only, the way the box always searched |

A mixed answer holds up to twenty book pages, at most five from one volume, beside the notes;
`in:books` lists up to fifty. Visitors never get book rows: the shelf is the owner's.

The text is read **once**, in the background after the server starts, two books at a time, and kept
in `ASTROLABE_DATA/pdftext.json` under the same fingerprint as your reading position, so a renamed
or re-filed book keeps its text, and a book saved again (after an OCR pass, say) is read again. A
book that cannot be read (damaged, password-protected, over 256 MB) is remembered as such and not
retried until its bytes change. Per book the store keeps at most 2,000 pages, 8,000 characters a
page and 1.5 million characters in all; the store as a whole stops at 40 million characters, and the
server's start-up line says how many books it holds. A scanned book with no text layer has nothing to find,
exactly as in the reader's own `/`. The [**Search inside books**](configuration.md#settings-keys)
row in *Settings › Vault* (or `PDF_SEARCH=off`) turns the whole thing off, and stops a pass in
progress.

## What it does not do

It never publishes. Both the shelf and the reader are admin surfaces over the owner's vault; a PDF
reaches a visitor only as an attachment of a published note, through the same door every embed
uses. It treats what a PDF says about itself (its title, its author) as text not to be trusted: cut
short if long, hidden characters stripped; and it caps marks at 64 per book. Visitors get no shelf.
