# The Calendar

*The month as a page of its own: every day's note, the sigils you kept, the cards you graded and the pages you read, laid out where you can see a month at a glance.*

← [Back to the README](../README.md) · [All docs](README.md)

---

There is a small month in the sidebar, under the tree — that one is a **date picker**, and it is
covered with the rest of the [periodic notes](templates-and-notes.md#the-calendar). This page is
the other thing a calendar is for: looking *back*. It draws the month full width, gives each day a
cell with room to write in, and fills those cells with what the day actually held.

**Open it** from the calendar leaf in the top bar, beside the seal (Sigils) and the ring (Orbits) —
on a phone it is a row in the `⋯` menu — or type **Open the Calendar** in the command palette
(`Ctrl/Cmd P`). It opens as a tab in the pane you are in, like the graph or the Sigils page, so you
can keep a note open beside it. Its address is `/calendar`, which a bookmark can hold.

## What a day's cell says

A cell carries the day's number and, under it, what that day held:

- **A dot beside the number** when the day has a [daily note](templates-and-notes.md#periodic-notes).
  (A dot rather than a line: your daily note is named after its own date, and a cell printing
  *2026-09-15* under a **15** has spent a line saying nothing.)
- **Each [sigil](sigils.md) that logged something that day**, by name.
- **The cards you graded** in [Orbits](orbits.md) that day — *3 cards* — read from this device's
  own log.
- **Each book or work you read**, from the sittings in its [tracker](trackers.md).

Four lines fit; a busier day says *+2 more* under them and the day pane has the rest. Today is
ringed. Days from the months either side fill out the first and last rows, in a quieter ink, and
are there to be clicked like any other.

## The day pane

Click a day — or walk to it with the arrow keys — and the pane beside the month (under it on a
narrow pane or a phone) opens on that day in full:

- **Open the day's note**, or **Create the day's note** when there is none. Creating goes through
  the same door as `Ctrl/Cmd Alt D`, so the note is made in your daily folder, with its template,
  exactly as it would be from the palette. Nothing is written until you press that button — a
  calendar that made a file every time you glanced at a day would fill your vault with empty days.
  (Double-clicking a cell is the same door, for when you would rather not travel.)
- **Sigils** — each one that logged that day, with how much of the day it asked for was done
  (*2 of 2*) coloured the way the card colours it, and the line of prose you wrote in the log.
- **Orbits** — the decks you studied, how many cards and how many you kept. From this device's own
  log; grades given on another device are not counted here.
- **Reading** — the pages and the time from each tracker's sittings.

Every name in the pane is a door to the note it came from.

## Moving around

`‹` and `›` turn the month, **Today** comes back to this one, and the month is drawn in the site's
calendar: a Gregorian month on a Gregorian instance, a Hijri (Umm al-Qura) month on a Hijri one,
and on an instance that prints both dates the leading calendar's month with the other calendar's
day number small beside each day. The week starts on the site language's first day — Monday in
English, Saturday in Arabic.

The month is **one tab stop**. Inside it:

| Key | Does |
| --- | --- |
| `←` `→` | the day before / after (mirrored in Arabic, where the cell to the left is tomorrow) |
| `↑` `↓` | the same weekday, a week back / on |
| `Home` `End` | the ends of the row |
| `PageUp` `PageDown` | the month before / after |
| `Enter` `Space` | select the day — the pane follows |

Walking off the edge of a month turns the page and keeps your place. `Tab` leaves the month for the
day pane, where every door is an ordinary button.

## Nothing is stored

The page keeps no ledger of its own. Every cell is read, each time you open it, from what your
vault and your device already hold: the notes in your daily folder, the log fences inside your
sigil notes, the `sessions:` lines inside your trackers, and the Orbits log in this browser. Delete
a line from a note and the day forgets it; write one by hand and the day remembers. The note is the
state, here as everywhere else.

> Until 3.17 a small month sat at the top of the [Sigils page](sigils.md#the-sigils-page). It is
> here now, where it has room: that page is a morning checklist, and a month squeezed into its
> corner could say which days had a note and nothing else about them.
