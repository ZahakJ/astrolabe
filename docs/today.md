# Today

*One page for what the day asks of you: a line to capture, today's note, the sigils due, the cards due, the tasks whose date has come, what you wrote on this day in earlier years — and, in the evening, one question.*

← [Back to the README](../README.md) · [All docs](README.md)

---

Today gathers what four pages already keep — the [daily note](templates-and-notes.md#periodic-notes),
the [Sigils page](sigils.md)'s checklist, the [Orbits](orbits.md) shelf's due counts and your
[tasks](editor.md) — so a morning starts in one place. It stores nothing of its own: every row is
read from your notes, and every tick is written back into them through the same door the page it
came from uses.

**Open it** from the first door in the top bar (a sun half over the horizon), with
`Ctrl/Cmd Alt Shift D`, or by typing **Open Today** in the command palette. It opens as a tab in the
pane you are in, like the [Calendar](calendar.md), and its address is `/today`. On a phone it is the
first tab of the bottom bar and the screen the app opens on. To open it every time Astrolabe starts,
choose **The Today page** under Settings → Vault → Open on launch (the session you left is restored
underneath it).

The chord is the third verb of one idea: `Ctrl/Cmd Alt D` opens today's note, `Ctrl/Cmd Shift D`
drops a line into it without leaving where you are, and both modifiers together open the page that
holds it — see the [keymap](keymap.md).

## What is on the page, top to bottom

- **The capture line.** Type and press Enter: the line lands under `## Captured` in today's note,
  stamped with the time, exactly as the [capture sheet](capture.md) files it (the note is created
  from its template first if it is not there yet). When this device can record and your vault keeps
  recordings, a microphone beside it opens the [voice note](capture.md#voice) recorder.
- **Today's note, rendered.** The note is drawn read-only, as the reading view draws it, with an
  **Open** button that puts it in a pane where you can edit it — or **Start it** when today has no
  note yet. A dashboard with a second editor inside it would be two editors for one file racing each
  other's saves; this is one editor, one button away.
- **Sigils.** Every task a sigil asks of today, ticked in place. A tick is the Sigil card's own edit, so
  the log line it writes is the one the card would have written. A course's day and a book's pages are answered on the card, where the steps and the page count are: those
  rows open the Sigils page.
- **Orbits.** Each deck with cards due today, with its count and **Study**, which starts the
  session.
- **Tasks due.** Every open task whose `📅` date is today or has passed, overdue ones first and
  marked in red — the same list the Sigils page's *Due by today* shows. Ticking one writes the box in
  its note (`[x]` and a `✅` date), and the row stays struck through until the page next reads the
  vault.
- **On this day.** Notes written on this month-day in earlier years, with how long ago and their
  opening lines, and trackers finished on it. A note's day is its daily-note date when it is one, else
  its `date:` (or `created:`, `published:`), else the day Astrolabe first saw the file.
- **Recently read.** The notes you were last in.

When no sigil, card or task is due, the page says so in one line rather than showing three empty
headings.

## The evening question

From six in the evening, a line appears under today's note: **How did the day go?** Write a line or
two and press Enter (or **Keep it**). The answer goes into today's note under a `## Reflection`
heading:

```markdown
## Reflection

Slow start; the chapter on cities finally moved.
```

- If your daily template already has an empty `## Reflection` section, the answer goes into it —
  **there is never a second heading**. A second answer the same evening joins the first under the
  same heading.
- If today's note is open in an editor, the text is written through that editor, so `Ctrl/Cmd Z`
  takes it back.
- Once the section has something in it, Today shows it back to you as *The day, in your words* — the
  next morning too, until the day turns.

The heading is English in every language on purpose, like `## Captured`: it is an address inside
the note that a template, a query or a search can find, not a label for the eye.

## On a phone

The phone's Today is the same page in the phone's own shape: the capture field, a card for today's
note (it opens the note rather than rendering it — a phone screen is one thing at a time), then the
same sections in the same order, with the evening question after the note card. Both shells read
from one source, so a tick on the laptop is on the phone the next time the vault moves.

See also: [the Timeline](timeline.md), which reads every day the vault holds, and
[the Calendar](calendar.md), which reads one month.
