# The PDF reader

*Every PDF in the vault, read in a viewer that answers to the keyboard, remembers your page, and turns a highlight into a note.*

---

Click a `.pdf` in the tree and it opens as a **book**: a reader with no permanent toolbar,
driven by keys the way zathura and vim are, that keeps your place across sessions and renames,
and hands what you mark straight into the note beside you. It is a workspace tab like any note,
so a book can sit in a pane next to the notes you are writing about it. The shelf of every book
in the vault is at `/library` in the app (and *A library in the vault* in the tour).

## The shelf

Every PDF in the vault as a card: cover, title, author where the file names one, page count,
folder, file size, and how far you have read (*38 % read*). Covers are page one rendered small,
requested as cards scroll into view and cancelled as they leave, so a shelf of two hundred books
opens at once and the resting card is a typographic plate rather than a spinner. The search field
filters titles, authors and paths, **and every marked passage in every book**, through the same
[Arabic fold](arabic-and-rtl.md#searching-in-arabic) as the rest of the product.

## Reading

The chrome stays out of the way: a title bar and a status line appear when the pointer moves or a
key is pressed and fade again after a couple of seconds. The status line carries the page counter
(a button; it opens *Go to*), the zoom, the search counter and a swatch of the ink `h` will use.

Layout-independent keys:

| Key | Does |
| --- | --- |
| `↓` / `↑` | scroll by four lines of body type |
| `PageDown` / `PageUp`, `Space` / `Shift Space`, `Enter` | a screen down or up |
| `Home` / `End` | first page / last page |
| `Ctrl/Cmd D` / `Ctrl/Cmd U` | half a screen down / up |
| `Esc` | close whatever overlay is open, else clear the search highlight |

Letter keys follow your keyboard's Latin caps, so they work on an Arabic or Russian layout too
(see [Non-Latin keyboards](keymap.md#non-latin-keyboards)); a number typed first is a count.

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

**Night mode is three states, not a switch.** *Night* draws the page through a dark filter and
then redraws **every picture unfiltered on top**, so type inverts and photographs, plates and
figures do not; an art book or an atlas is exactly what a plain inversion ruins. *Flip* inverts
everything, which is what a scanned book wants.

**Right-to-left books are detected from their own text** (sampled from the middle of the volume,
where the copyright page is not) and remembered; `:rtl` and `:ltr` override. In two-page mode an
Arabic book puts page 2 to the *left* of page 3. The spread mirrors with the book; the panel
around it mirrors with the interface language.

## The command line

`:` opens a vi-style command line. A word matches the first command it abbreviates, so `:z` is
zoom and `:h` is help, never highlight:

`:212` · `:+3` / `:-3` · `:40%` · `:page` · `:quit` (`:q`) · `:library` (`:lib`) · `:zoom 150`
(`:z`; bare `:zoom` is 100 %) · `:zen` · `:fit width|page|height` · `:rotate [90|180|270]` ·
`:dual on|off|toggle` · `:invert off|night|flip` · `:rtl` / `:ltr` · `:mark <c>` · `:jump <c>` ·
`:search <text>` · `:outline` · `:forget` · `:help` · `:highlight` · `:ink [1-6]` · `:cite` ·
`:note` · `:annotations`

Numbers read in Latin, Arabic-Indic and Persian digits alike: `:٢١٢` is page 212.

## Your place is kept

The reader remembers the page and the position *within* the page, the fit, the zoom, two-page
mode, rotation, night mode, the direction and your marks, per book, in `ASTROLABE_DATA/books.json`.
The key is a **hash of the file's bytes**, never its path, so renaming or re-filing a book in
Obsidian, Syncthing or a terminal loses nothing: page 612 is still page 612, and so are the
highlights and the citations that point at them. Scrolling is saved a moment after you stop; a
zoom or a rotation is saved at once and re-anchors the page so zooming in to read a footnote does
not throw your place away. `:forget` discards a reading position.

## Highlights, citations and margin notes

Select a passage and press `h`: the words are marked in the current ink (six of them; `H` steps),
as rectangles in page fractions plus the text under them, stored beside the vault. **The PDF file
is never written to.**

Press `c` and the passage is **cited into the note beside you**. The quote is rebuilt from the
page's geometry rather than the PDF's internal order: columns are found, lines are grouped, an
Arabic line runs right to left, and an end-of-line hyphen is rejoined (*sig-* / *nificant*)
while *Anglo-Saxon* and *1990-1995* survive. It appears in an editable field before a single
character reaches the note, because an assembler guesses and a sentence the author never wrote
must not land in your notes silently. It is appended as a `> [!quote]` callout followed by a link
to the exact spot, `[[Book.pdf#page=42&rect=…|Book, p. 42]]`, in the instance's own numerals.
The write goes through the open editor when one holds the note, so it is one undoable step and
the toast carries **Undo**. `C` asks which open note first.

Clicking such a link later reopens the book at that page and pulses the marked rectangle once.
If the file has since been renamed the link still resolves, by the highlight's id and the
file's content, and a toast **offers** to repair the link in the note; it never rewrites one on
its own.

`e` attaches a note to a highlight; `A` lists every marked passage in the book; the shelf's search
finds them across the vault.

## Search inside a book

`/` searches the book's text from the current page forward and wraps, so it finds *the next one
of these* rather than the first in the volume; `n` and `N` step, and the counter reads *3 of 41*.
The match is tinted without touching the text layer, and it becomes the keyboard's selection, so
`/phrase` then `h` marks exactly what was found. The matcher folds Arabic diacritics and letter
forms like every other search in the product.

## What it does not do

It never publishes. Both shelf and reader are admin surfaces over the owner's vault; a PDF
reaches a visitor only as an attachment of a published note, through the same door every embed
uses. It reads metadata as untrusted text (capped, control characters stripped) and it caps marks
at 64 per book. Visitors get no shelf.
