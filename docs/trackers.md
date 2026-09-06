# Trackers

*A fenced block that turns a note into a living progress card — and a board that shelves all of them.*

← [Back to the README](../README.md) · [All docs](README.md)

---

A tracker is a ` ```tracker ` fence. It renders as a card with cover art, a
progress bar, a status chip, a rating and your own notes — in the editor, in
reading view, on the published blog, and inside a transclusion, because all
four draw it with the same renderer.

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
| `kind` | `book` `game` `film` `show` `course` `project` `habit`, or your own word | Picks the glyph and the default unit. `movie`, `series`, `tv`, `novel`, `anime`, `class`, `routine` fold into the seven; anything else keeps your word and gets the ✦ glyph. |
| `cover` | an attachment name, or `![[name.jpg]]` | Resolved exactly like an embed. Missing or broken → the kind's glyph, never a broken picture. |
| `progress` | `62/130`, `45%`, `45`, `62 of 130`, `62/?` | A fraction derives the percentage; a bare number *is* the percentage. `62/?` is a count with no ceiling (hours in a game nobody has timed): the card prints the count and draws no bar. Eastern Arabic digits are read too. |
| `season` | any text | A show's season, printed on the card's cover. Kept verbatim; the Media page's form writes it for shows. |
| `step` | a number | How far one press of − / + moves the count. Left out: ten for pages and minutes, one for everything else. |
| `folder` | a vault folder | Where your own notes on this work live (`1 - Source Material/Books/The Linux Memory Manager`). The rendered card names it; the Media page counts the notes in it and opens it. A [library path](library.md) on the same folder wears this tracker's cover. |
| `unit` | any word | Yours, printed as you wrote it, except that a unit the chrome already knows, in either language (`chapters`, `صفحات`, `hours`, `episodes`…), is agreed and translated like a default one. Leave it out and the kind's own unit is used (pages, hours, minutes, episodes, lessons, tasks, days) — localized and correctly pluralised. |
| `status` | `planned` `active` `done` `paused` `dropped` | Plus the words people actually type: `reading`, `playing`, `watching`, `in-progress`, `started`, `finished`, `on hold`, `dnf`, `backlog`… Left out, it is derived from the progress. |
| `rating` | `8/10`, `4/5`, `★★★★`, `4` | A bare number is out of five up to five, out of ten above it. |
| `started`, `finished` | a date | An ISO date (`2026-07-01`) is formatted in the site's own calendar and numerals; anything else prints as written. |
| `notes` | a block scalar (the key, a colon, then a `\|`) | Markdown, rendered through the normal pipeline. |

Unknown keys are ignored, and a fence with **neither a title nor a progress**
stays a plain code block. That is deliberate: unparseable content must read as
its own source rather than vanish into an empty card, which is the rule
`$$ math $$` already follows.

A note may hold as many trackers as you like.

## Nudging the bar

In the editor, an admin session gets a quiet **−** and **+** at the card's
inline edge. One press is one unit — it rewrites the `progress:` line in your
file and nothing else, as a single undo step. There is no separate store: the
note *is* the state, so editing the number by hand does exactly what the button
does.

Cross into 100% and the fill takes on a soft glow and the wordmark's ✦ appears
beside the count.

Reading view and the public site are inert by design — there is no write path
for a visitor, and buttons that cannot work are furniture that lies.

## The board

A ` ```tracker-board ` fence draws every tracker in the vault as a grid of
mini-cards, grouped by status (active first, then planned, done, paused,
dropped). Each card links to the note its tracker lives in.

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

An empty body is a board of everything. A vault with no trackers gets an
inviting empty state rather than a blank.

## Publishing a shelf

The board is audience-aware. It reads `GET /api/trackers`, which is scoped
exactly like the blog's own post list:

- a **visitor** sees trackers from **published notes only**, with the language
  filter applied at their scope;
- an **admin** sees the whole vault;
- **templates are excluded from both** — a stencil carrying a tracker skeleton
  would otherwise shelve itself as a book nobody has started.

So a board left on a published note is safe: put your reading year on the
public site without opening the rest of the vault. Cover art on a published
tracker is served to visitors too — the indexer collects tracker covers into
the same allowlist that governs banners and embeds.

## The Media page

The board is a fence you put in a note. The **Media page** is the same shelf
as a place of its own: a button beside the settings gear (admins only; or
"Open the Media page" in the command palette) swaps the note column for every
tracker in the vault, shelved by kind.

The shelves stack vertically with a hairline between them, in this order:
shows, games, books, films, courses, then projects, habits and whatever kinds
of your own you have invented. Each shelf is a grid of at most five works
across, fewer as the window narrows, and the page scrolls down and never
sideways. A row of filters at the top narrows every shelf to one status.

Each card is the fence's card in miniature: cover, title, bar, count, status,
rating, dates and the first lines of your notes. Its **− / +** nudge the
progress exactly as the editor's stepper does, **Edit** reopens the form
filled in, and the cover or title opens the note.

**Add media** is a form: kind, title, cover (pick a picture the vault already
has, upload one, or paste an `https://` link), progress, unit, a season for a
show, status, rating, dates and notes. It writes one note:

```
Media/Shows/Severance.md
```

whose body is one ` ```tracker ` fence with those fields, so everything the
rest of this page says applies to it: it renders as a card in the note, it
appears on any board, and you can edit the fence by hand. The kind decides the
folder (`Books`, `Games`, `Shows`, `Films`, `Courses`, and a capitalised
folder for a kind of your own). A title that already has a note is refused
rather than overwritten.

For a game whose length nobody has timed, switch the total off: the fence
says `progress: 62/?`, the card counts hours and draws no bar. Turn it back on
later and the bar returns.

**A folder of your own notes.** *Notes in the vault* on the form (or `folder:` in the fence) points a work at a folder, the one you already keep your chapter notes or episode notes in. The card grows a chip that counts the notes there and opens them: the folder's own note when it has one (a note named like the folder, or `index.md`), otherwise the folder revealed in the sidebar; under the chip, the three notes you touched last, each a door. In the sidebar the folder wears the work's glyph beside its name, and that mark opens the tracker. Nothing is moved and nothing is written into those notes. When the same folder is a [library path](library.md), the path's shelf card and page wear this tracker's cover, over any cover the row or the folder note names, so the book you are tracking and the book your readers open are one picture.

Editing from the page rewrites **only the fence** in the note. The prose under
it, the frontmatter and any second tracker stay byte for byte as they were.

The page is admin-only because it writes; a visitor's shelf is the board, on
whatever note you chose to publish it.

## In Obsidian

`tracker` is an Astrolabe extension, not an Obsidian feature. Open the same vault
in Obsidian and the fence degrades to what it is — a labelled code block whose
lines are all readable. Nothing is converted, nothing is lost, and the note
still says everything it said here. See
[OBSIDIAN-COMPAT.md](../OBSIDIAN-COMPAT.md).
