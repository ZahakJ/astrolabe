# The Timeline

*The vault by date, newest first: every note on the day it was written, every daily note, sigil tick, reading sitting, voice note, captured line and publication — and, once a year, a note that adds the year up.*

← [Back to the README](../README.md) · [All docs](README.md)

---

The [Calendar](calendar.md) reads one month. The Timeline reads all of them at once, as one list
you scroll back through: a month heading, then each day that held anything, then one row per thing
the day held.

**Open it** by typing **Open the Timeline** in the command palette, from the **The Timeline** button
on the Calendar page, or at `/timeline`. On a phone it is a row under **More**, and in the Calendar
tab's `⋯`. It opens as a tab like the Calendar and [Today](today.md).

## What a row is

Every row has an icon for its kind, a title and one line under it:

| Kind | What it is | The line under it |
| --- | --- | --- |
| **Notes** | A note, on the day it belongs to | its opening sentence |
| **Daily notes** | The day's own [daily note](templates-and-notes.md#periodic-notes) | its opening sentence |
| **Sigils** | A [sigil](sigils.md) that logged that day | the day's note in the log, or *2 of 3* |
| **Reading** | Sittings with a book, from its [tracker](trackers.md)'s `sessions:` | pages and time |
| **Voice** | A long [voice note](capture.md#voice) (its own note), or recordings linked from the day's inbox | its opening, or how many recordings |
| **Captured** | Lines [captured](capture.md) into the day's note or inbox | how many lines |
| **Published** | A published note whose `published:` names a later day than the one it was written | its opening sentence |

**The day a note belongs to** is its daily-note date when it is a daily note (a note for the 24th
written on the 30th is still the 24th's); else its frontmatter `date:`, `created:` or `published:`
when one spells a day; else the day this instance first saw the file — which a vault that is a git
repository reads back from the commit that added it, so a note edited today does not move to today.

Press a row to open its note. Nothing here is stored: the list is read, each time, from the same
places the Calendar reads — the daily folder, the sigil logs, the trackers' sittings — plus each
note's own date. Delete the line and the day forgets it.

## Filters and the months

The chips above the list filter it: press **Notes**, **Sigils** or any other kind to keep only those
(press more than one to keep several), and pick a folder or a tag from the two menus beside them.
**Clear the filters** appears once any is on. Each chip carries its count.

On a desktop, the **Months** rail beside the list names every month with how many rows it holds;
press one to jump there, and the rail marks the month you are reading as you scroll. On a phone the
same list is a sheet, raised by the calendar button in the top bar.

The list stays quick however many years your vault holds: only the rows on screen (and a screen's
worth either side) are ever drawn.

## Year in review

**Year in review…** — in the palette, on the Timeline's header, and in the phone Calendar's `⋯` —
asks which year (the vault's years are listed; in January it suggests the year that just ended) and
writes `Reviews/<year>.md`:

- **At a glance**: notes begun that year, and the words written in them and in the daily notes;
  days with a daily note; sigil ticks; cards reviewed (from [Orbits](orbits.md)' log on this device);
  pages read and in how many sittings; books finished.
- **Months**: a table of the twelve months — notes, daily notes, sigil ticks, cards, pages.
- **Sigils**: each sigil's ticks and its best streak that year, counted the way its card counts a
  streak (days it asks nothing of do not break it).
- **Books finished**, with the date and your rating, each a link to its tracker's note.
- **Most linked**: the notes that year's writing linked to most.

Everything the command writes sits between two markers:

```markdown
<!-- astrolabe:year-review -->
…
<!-- /astrolabe:year-review -->
```

Write whatever you like around them. Running the command again for the same year rewrites **only**
what is between the markers, so your own lines about the year stay. The note is written in the
language the app is showing when you run it.

See also: [Today](today.md) for the day in front of you, and [the Calendar](calendar.md) for a
month at a glance.
