# Trackers

*A fenced block that turns a note into a living progress card — and a board that shelves all of them.*

← [Back to the README](../README.md) · [All docs](README.md)

---

A tracker keeps count of how far you are through something: a book, a game, a course, a project. You
write it as a ` ```tracker ` fence (a code block whose language is `tracker`) inside any note, and it
renders as a card with cover art, a progress bar, a status chip, a rating and your own notes. The
card looks the same in the editor, in the reading view, on the published blog, and inside a
transclusion, because all four draw it with the same renderer.

```tracker
title: Elden Ring
kind: game
cover: elden-ring.jpg
progress: 62/130
unit: hours
status: playing
rating: 9/10
started: 2026-07-01
notes: |
  Margit took 14 tries.
```

## The fields

| Key | What it takes | Notes |
| --- | --- | --- |
| `title` | any text | Or just write the title on a line of its own. |
| `kind` | `book` `game` `film` `show` `course` `project` `habit`, or your own word | Picks the glyph and the default unit. `movie`, `series`, `tv`, `novel`, `anime`, `class` fold into the seven; anything else keeps your word and gets the ✦ glyph. |
| `cover` | an attachment name, or `![[name.jpg]]` | Resolved exactly like an embed. Missing or broken → the kind's glyph, never a broken picture. |
| `progress` | `62/130`, `45%`, `45`, `62 of 130`, `62/?` | A fraction derives the percentage; a bare number *is* the percentage. `62/?` is a count with no ceiling (hours in a game nobody has timed): the card prints the count and draws no bar. Eastern Arabic digits are read too. |
| `season` | any text | A show's season, printed on the card's cover. Kept verbatim; the Media page's form writes it for shows. |
| `step` | a number | How far one press of − / + moves the count. Left out: ten for pages and minutes, one for everything else. |
| `pace` | a number | Units a day you mean to move — `pace: 20`. With a total, the card says the day you will be done. A [sigil](sigils.md) that names this work reads the day's pages from it. |
| `due` | a date | The day you mean to be done by. With a total and no pace, the card says the pace that gets there. |
| `folder` | a vault folder | Where your own notes on this work live (`1 - Source Material/Books/The Linux Memory Manager`). The rendered card names it; the Media page counts the notes in it and opens it. A [library path](library.md) on the same folder wears this tracker's cover. |
| `file` | the PDF this work is — `Books/Muqaddimah.pdf`, or just `Muqaddimah.pdf`; `[[…]]` is fine | How the [reader](books.md#reading-sessions) finds this tracker when a sitting ends. Without it the reader matches on the title, so this line is for when two editions share one, or the fence's title and the file's differ. |
| `sessions` | a value over several lines, one sitting per line — see [Reading sessions](#reading-sessions) | Written by the reader; readable and editable by you. |
| `unit` | any word | Yours, printed as you wrote it, except that a unit the chrome already knows, in either language (`chapters`, `صفحات`, `hours`, `episodes`…), is agreed and translated like a default one. Leave it out and the kind's own unit is used (pages, hours, minutes, episodes, lessons, tasks, days) — localized and correctly pluralised. |
| `status` | `planned` `active` `done` `paused` `dropped` | Plus the words people actually type: `reading`, `playing`, `watching`, `in-progress`, `started`, `finished`, `on hold`, `dnf`, `backlog`… Left out, it is derived from the progress. |
| `rating` | `8/10`, `4/5`, `★★★★`, `4` | A bare number is out of five up to five, out of ten above it. |
| `started`, `finished` | a date | An ISO date (`2026-07-01`) is formatted in the site's own calendar and numerals; anything else prints as written. |
| `notes` | a value over several lines (the key, a colon, then a `\|`) | Markdown, rendered the way any note is. |

Unknown keys are ignored. A fence with **neither a title nor a progress** stays a plain code block.
That is deliberate: content that cannot be parsed should read as its own source rather than vanish
into an empty card, which is the rule `$$ math $$` already follows.

A note may hold as many trackers as you like.

## Reading sessions

When you close a book in the [PDF reader](books.md#reading-sessions), the sitting is written into the
book's tracker as one line of a `sessions:` block:

```tracker
title: Muqaddimah
kind: book
progress: 139/500
file: Books/Muqaddimah.pdf
sessions: |
  2026-09-14 | 100–112 | 12 pages | 20 min
  2026-09-15 | 112–139 | 27 pages | 41 min
```

Reading left to right, separated by ` | `: the date, the first and last page of the sitting, the
pages finished, and the minutes the clock counted. The line is yours as much as the app's: write one
by hand and it counts; delete one and it never happened. The pieces may come in any order and in
either language (`٢٧ صفحة | ٤١ د`), the range may be missing, and a line that does not open with a
date is not a session. When the tracker counts pages, the `progress:` line moves by the pages read
at the same time.

From the last five timed sittings the card reads the book's own speed and says *about 1.6 pages a
minute here — 4 h 20 left*, under the pace projection when there is one. The [weekly
review](sigils.md#the-weekly-review) adds the lines up by book.

## Nudging the bar

In the editor, an admin session gets a quiet **−** and **+** at the card's inline edge. One press is
one unit: it rewrites the `progress:` line in your file and nothing else, as a single undo step.
There is no separate store. The note *is* the state, so editing the number by hand does exactly what
the button does.

Cross 100% and the bar takes on a soft glow, and Astrolabe's own ✦ appears beside the count.

The reading view and the public site are inert by design: there is no write path for a visitor, and
buttons that cannot work are furniture that lies.

## The board

A ` ```tracker-board ` fence draws every tracker in the vault as a grid of mini-cards, grouped by
status (active first, then planned, done, paused, dropped). Each card links to the note its tracker
lives in.

```tracker-board
kind: game
status: active
limit: 12
```

| Filter | Effect |
| --- | --- |
| `kind` | Only that kind. Folded like the card's own `kind:`, so `kind: movie` finds your films. |
| `status` | Only that status, synonyms included. |
| `limit` | At most that many cards. |

An empty body is a board of everything. A vault with no trackers gets an inviting empty state rather
than a blank.

## Publishing a shelf

The board knows who is looking. It reads `GET /api/trackers`, which answers each viewer with what
they are allowed to see, by the same rule as the blog's own post list:

- a **visitor** sees trackers from **published notes only**, with the same language filter the
  blog applies;
- an **admin** sees the whole vault;
- **templates are excluded from both**: a template carrying a tracker skeleton would otherwise
  shelve itself as a book nobody has started.

So a board left on a published note is safe: you can put your reading year on the public site
without opening the rest of the vault. Cover art on a published tracker is served to visitors too;
the indexer adds tracker covers to the same list of files a visitor may fetch, beside banners and
embeds.

## The Media page

The board is a fence you put in a note. The **Media page** is the same shelf as a place of its own.
A button beside the settings gear (admins only; or "Open the Media page" in the command palette)
opens it as a **tab** in the focused pane, beside the notes, holding every tracker in the vault
shelved by kind. The same button closes it again, and it drags into a split like any tab.

The shelves stack vertically with a hairline between them, in this order: shows, games, books,
films, courses, then projects, habits and whatever kinds of your own you have invented. Each shelf
is a grid of at most five works across, fewer as the window narrows, and the page scrolls down and
never sideways. A row of filters at the top narrows every shelf to one status.

Each card is the fence's card in miniature: cover, title, bar, count, status, rating, dates and the
first lines of your notes. Its **− / +** nudge the progress exactly as the editor's stepper does,
**Edit** reopens the form filled in, **Delete** sends the work's note to the trash through the same
dialog the tree uses (Undo on the toast, and the trash browser can bring it back), and the cover or
title opens the note.

**Add media** is a form: kind, title, cover (pick a picture the vault already has, upload one, or
paste an `https://` link), progress, unit, a season for a show, status, rating, dates and notes. It
writes one note:

```
Media/Shows/Severance.md
```

whose body is one ` ```tracker ` fence with those fields, so everything the rest of this page says
applies to it: it renders as a card in the note, it appears on any board, and you can edit the fence
by hand. The kind decides the folder (`Books`, `Games`, `Shows`, `Films`, `Courses`, and a
capitalised folder for a kind of your own). On an Arabic instance the folders are Arabic too:
`وسائط/كتب`, `ألعاب`, `مسلسلات`, `أفلام`, `دورات`. A vault that already has a `Media` root keeps
filing there, and the reverse holds. A title that already has a note is refused rather than
overwritten.

For a game whose length nobody has timed, switch the total off: the fence says `progress: 62/?`,
and the card counts hours and draws no bar. Turn it back on later and the bar returns.

**A folder of your own notes.** *Notes in the vault* on the form (or `folder:` in the fence) points
a work at a folder, the one you already keep your chapter notes or episode notes in. The card grows
a chip that counts the notes there and opens them: the folder's own note when it has one (a note
named like the folder, or `index.md`), otherwise the folder revealed in the sidebar; under the chip,
the one note you touched last, a door back to where you left off. The right panel keeps the same
link from either end: on a note inside the folder, **Tracked in** names the work, draws its bar and
nudges it; on the tracker note itself, **Notes of this work** counts the notes, shows the last one
you touched and opens the folder. In the sidebar the folder wears the work's glyph beside its name,
and that mark opens the tracker. Nothing is moved and nothing is written into those notes. When the
same folder is a [library path](library.md), the path's shelf card and page wear this tracker's
cover, over any cover the row or the folder note names, so the book you are tracking and the book
your readers open are one picture.

Editing from the page rewrites **only the fence** in the note. The prose under it, the frontmatter
and any second tracker stay byte for byte as they were.

The page is admin-only because it writes. A visitor's shelf is the board, on whatever note you chose
to publish it.

## In Obsidian

`tracker` is an Astrolabe extension, not an Obsidian feature. Open the same vault in Obsidian and the
fence goes back to what it is underneath: a labelled code block whose lines are all readable. Nothing is
converted, nothing is lost, and the note still says everything it said here. The same is true of a
[sigil](sigils.md#in-obsidian); a [drawing](drawing.md#in-obsidian) is the Excalidraw plugin's own file;
and an [orbit](orbits.md#where-the-schedule-lives) writes its schedule in the Spaced Repetition plugin's
own format.
