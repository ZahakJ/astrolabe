# Routines

*A plan you follow by the day, the log of what you did, and a page that asks you every morning.*

← [Back to the README](../README.md) · [All docs](README.md)

---

A [tracker](trackers.md) is a card about one work and how far through it you are. A **routine** is
a card about your days: what today asks of you, what you ticked, the streak, the week, and the last
twelve weeks as a heatmap. An exercise week, the five prayers, sleep, water, a mood journal — anything
you do by the day.

It is two fences in one note. The **plan** is a ` ```routine ` fence; the **log** is a
` ```routine-log ` fence that Astrolabe writes right under the plan the first time you tick
something. There is no separate store: the note *is* the state, exactly as it is for a tracker. Tick a
box and one line changes in your file; edit the line by hand and the card follows. Open the vault in
Obsidian and both fences are readable code blocks that say everything they say here.

```routine
title: Weekly exercise
kind: exercise
slots: morning, evening
fields: minutes:number, weight:number:kg
target: 6/week
monday:
  morning: 60 min brisk walk
  evening: Full Body A: leg press 3×8–12, chest press 3×8–12, plank 3×45 sec
tuesday:
  morning: 60 min easy walk
  evening: Bike 35–45 min + 10 min abs
sunday: 60 min walk
```

```routine-log
2026-09-13 | done: sunday | minutes: 62 | weight: 84.2 | Felt strong
2026-09-14 | done: morning, evening | minutes: 95
```

## The plan

| Key | What it takes | Notes |
| --- | --- | --- |
| `title` | any text | Or write it on the first line by itself. |
| `kind` | `exercise` `habit` `prayer` `sleep` `water` `mood` `reading` `study`, or your own word | Picks the glyph. Synonyms in both languages fold in (`workout`, `salah`, `رياضة`, `صلاة`…); anything else keeps your word and gets the ✦ glyph. |
| `slots` | words, comma-separated | The columns of your week — `morning, evening`, or `warm-up, main, cool-down`. Leave it out and each weekday takes one line. |
| `items` | things, comma-separated | Asked of **every** day: `Fajr, Dhuhr, Asr, Maghrib, Isha`, or `8 glasses`. |
| a weekday | `monday: 60 min walk`, or `monday:` with slots indented under it | The plan for that day. Weekdays are read in both languages (`الاثنين`) and short (`mon`). A day with nothing under it is a rest day. |
| `fields` | `name:type`, comma-separated | Numbers to keep per day. Types: `number` (with an optional unit, `weight:number:kg`), `scale` (with a ceiling, `mood:scale:5`), `check`, `text`. A bare unit or ceiling is enough: `weight:kg`, `mood:5`. |
| `target` | `6/week`, `5` | Days a week you aim to complete. Without it, the week's denominator is the number of days the plan asks something of. |
| `book` | a tracked work's title (`[[…]]` allowed) | The day gains **Read N pages of it** first, N from the [tracker's](trackers.md) `pace:` (or its step). Ticking it moves the tracker by that much; unticking moves it back. |
| `notes` | a block scalar (`notes: \|`) | Markdown, rendered under the card. |

A fence with **neither a title nor a plan** stays a plain code block — the same rule a tracker and
`$$ math $$` follow: unparseable content reads as its own source rather than vanishing into an empty
card. A note may hold several routines; each takes the log fence that follows it.

## The log

One line per day, and the parser reads it by segments separated by ` | `:

```
2026-09-13 | done: morning, evening | skipped: stretch | minutes: 62 | weight: 84.2 | Felt strong
```

- the **date** opens the line (Eastern Arabic digits are read too);
- `done:` names the tasks ticked — a slot (`morning`), an every-day item (`Fajr`), or the weekday
  itself for a one-line weekday plan (`sunday`);
- `skipped:` names tasks you passed on **on purpose** — the day still counts as missed, but the log
  says why;
- any segment whose key is one of the plan's `fields` sets that value;
- everything else is the day's **note**.

Lines that do not open with a date are ignored, the last line for a date wins, and the app keeps the
log in date order when it writes. Anything you type by hand survives byte for byte, CRLF included; the
app only ever replaces the one line it is recording.

## The card

The plan renders as a card — in the editor, in reading view, on the published blog and inside a
transclusion, one renderer for all of them:

- **Today**: the date, the day's checklist (every-day items first, then the weekday's slots with
  their plan text), the fields as inputs, and a one-line note. In the editor, an admin session gets
  live checkboxes; each tick rewrites the log as **one undo step**. A hover on a task shows *skip*.
- **Streak** (complete days in a row — rest days are transparent, and an unfinished today neither
  adds nor breaks it), **this week** (`3/6`, against your target or the plan's own days), and the
  **last 30 days** as a percentage.
- **The week strip**: seven dots, today ringed. Full for complete, half for partial, red-rimmed for
  missed, hollow for a rest day. The week starts on Monday for an English instance and Saturday for
  an Arabic one.
- **The heatmap**: twelve weeks, a cell per day, coloured by the share of the day's tasks ticked;
  hatched for rest days, ringed for today.
- **The week's plan**, folded under a summary: day × slots, today's row lit.

The ` ```routine-log ` fence renders as a ledger of the days, newest first: the date with its status
dot, what was done, each field, the note.

Reading view and the public site are inert by design — there is no write path for a visitor, and
boxes that cannot be ticked are furniture that lies.

## The Routines page

The calendar button beside the settings gear (admins only; or **Open the Routines page** in the
command palette) opens every routine in the vault as today's checklists, in a **tab** in the focused
pane. The lead line counts the day: *3 of 5 complete today*. A tick here goes to the note the routine
lives in through `POST /api/routine` — the same edit the editor makes, computed by the same function,
so the page and the editor never disagree about the log's shape. The page re-reads on every vault
event, so a box ticked in the editor shows here at once.

Each card carries **Edit** (the form, filled in), **Delete** (the note goes to the trash through the
same dialog the tree uses) and its title opens the note.

**New routine** is a form. It opens on a row of templates:

- **Built in**: *Exercise* (a full week with morning walks and evening full-body sessions), *Habits*,
  *Prayers* (the five, every day, with a count of those prayed in congregation), *Sleep* (hours,
  quality, bedtime), *Water*, *Mood* (mood, energy, gratitude), *Reading*, *Study* — each in the
  instance's language.
- **Your templates**: every note in the [templates folder](templates-and-notes.md) that carries a
  ` ```routine ` fence. **Save as template** on the form writes the plan there, so a routine you drew
  up once can seed the next.

Then the plan itself: title, kind (or your own word), the columns of the week, a target, the
every-day items, a grid of weekday × column, the fields (one per line), notes. **Save** writes one
note:

```
Routines/Weekly exercise.md
```

holding the title as frontmatter, the plan fence and an empty log fence. On an Arabic instance the
folder is `روتين`; a vault that already has either root keeps filing there. A title that already
has a note is refused rather than overwritten. Editing from the page rewrites **only the plan fence**;
the log under it and the prose around it stay byte for byte.

## In the editor

Type ` ```routine ` by hand, or `/routine` from the slash menu for a skeleton. With the caret
outside the fence you see the card; put the caret inside and it is source again, so the plan can be
edited in place. The log fence behaves the same way.

## In Obsidian

`routine` is an Astrolabe extension. In Obsidian the two fences are labelled code blocks whose lines
are all readable — nothing is converted and nothing is lost. See
[OBSIDIAN-COMPAT.md](../OBSIDIAN-COMPAT.md).
