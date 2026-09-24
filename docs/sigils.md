# Sigils

*The things you come back to every day — a plan for each day, a record of what you did, and a page that asks you every morning.*

← [Back to the README](../README.md) · [All docs](README.md)

---

Some things in life are not projects. They do not finish. You do not "complete" walking, or
praying, or sleeping well — you keep them, day after day, and each day you kept is a day you can
put your seal on. That is what a **sigil** is in Astrolabe: something you do by the day, with a
card that shows you what today asks, lets you tick it off, and keeps count of how the days are
going — your streak, this week, and the last twelve weeks as a little grid of colour. The word is
the Latin *sigillum*, a seal; Arabic has the same root in *سِجِلّ*, which is also the word for a
register — and a register of your days is exactly what the log below is.

A [tracker](trackers.md) is a card about one thing you are working *through* (a book, a game, a
course) and how far you have got. A sigil is a card about your *days*. An exercise week, the five
a morning sit, sleep, water, a mood journal, twenty pages a night — anything you mean to do again
tomorrow.

Everything a sigil knows lives in one ordinary note in your vault: the **plan** (what you mean to
do) and the **log** (what you did). There is no hidden database. Tick a box and one line changes in
your file; edit the line by hand and the card follows. Open the same vault in Obsidian and both
parts are plain, readable code blocks that say exactly what they say here.

> This feature has changed its name twice: it was *routines* until 3.14 (blocks ` ```routine ` and <!-- lineage -->
> ` ```routine-log `) and *orbits* in 3.15 (` ```orbit ` and ` ```orbit-log `), before 3.16 gave <!-- lineage -->
> the word Orbits to [spaced repetition](orbits.md), where a card comes back around. Older notes
> written with `routine` or `orbit` still work, in every note you already have — nothing needs <!-- lineage -->
> renaming. New sigils are written with the names below.

## What a sigil looks like in the note

Two blocks. The first is the plan; Astrolabe writes the second, the log, right under it the first
time you tick something.

```sigil
title: Daily exercise
kind: exercise
icon: 🚶
slots: morning, evening
target: 6/week
monday:
  morning: 60 min brisk walk
  evening: Full Body A: leg press 3×8–12, chest press 3×8–12, plank 3×45 sec
tuesday:
  morning: 60 min easy walk
```

```sigil-log
2026-09-14 | done: morning, evening | Felt strong
```

Read it top to bottom and it says: *this sigil is called Daily exercise, it is an exercise, it
wears a walking figure as its icon, each day has a morning and an evening, I am aiming for six days
a week, and here is what Monday and Tuesday ask.* The log says: *on the 14th of September I did the
morning and the evening, and I felt strong.*

You do not have to write any of this by hand. The **New sigil** form (below) writes it for you.
But it is worth knowing that this is all there is.

## The plan, line by line

Every line is a word, a colon, and a value. Only the title is required — and even that can just be
the first line on its own.

| Line | What you put after the colon | What it does |
| --- | --- | --- |
| `title` | a name | What the card is called. |
| `kind` | `exercise` `habit` `mind` `sleep` `water` `mood` `reading` `study` — or any word of your own | Picks the small glyph on the card and the suggestions the form offers. Synonyms in both languages are understood (`workout`, `salah`, `رياضة`…). Your own word is kept as written and gets the ✦ glyph. |
| `icon` | one emoji or a short symbol — `🚶`, `☪`, `✦` | Drawn in the card's corner instead of the kind's glyph. |
| `banner` | a picture — a file in the vault (`walk.jpg`, `Media/walk.jpg`) or an `https://` link | Drawn as a strip across the top of the card. It is found the same way a note's banner is: by its full path, then beside the note, then anywhere in the vault by name. |
| `slots` | words with commas between them — `morning, evening` | The **parts of a day** you plan by. They become the columns of your week. Leave this line out and each day is just one line. |
| `items` | things with commas between them — `Fajr, Dhuhr, Asr, Maghrib, Isha`, or `8 glasses` | Things asked of you **every** day. Each becomes a box to tick. |
| a weekday | `monday: 60 min walk` — or `monday:` on its own with the parts indented under it | What that day asks. Weekdays are understood in English and Arabic, long or short (`mon`, `الاثنين`). A day with nothing under it is a **rest day**: it never counts against you. |
| `fields` | things to record, with commas between them — see [What to record each day](#what-to-record-each-day) | The small inputs on the card: a number, a rating, a line of text. |
| `target` | a number of days — `6/week`, or just `6` | How many days a week you are aiming for. The card counts against it: *3 of 6 this week*. Without it, the card counts the days the plan actually asks something of. |
| `book` | the title of a book you are [tracking](trackers.md) — `[[…]]` is fine | Adds **Read N pages of it** to every day, N being the tracker's pace. Ticking it moves the tracker forward; unticking moves it back. A sitting in the [book reader](books.md#reading-sessions) that covers the pace ticks it for you; so does one in a book any slot's text links with `[[…]]`. |
| `notes` | `notes: \|` and then lines indented under it | Anything you want to remember about this sigil — why you started, the rules you set yourself. Shown under the card. |

A block with **no title and no plan at all** stays a plain code block, so a half-typed sigil reads as
what you typed rather than vanishing into an empty card. One note can hold several sigils; each one
takes the log block that follows it.

## What to record each day

Ticking boxes tells you *whether* you did something. Sometimes you also want to write down *how
much*, or *how it went*. That is what fields are: small inputs on the card, one per day, each with
its own column in the log.

The form offers the common ones as toggles, each with a sentence saying what it means:

- **Minutes** — how long it took, as a number.
- **Weight** — your weight that day, a number with a unit (`kg` by default; change it if you like).
- **Focus** — how focused you were, rated from 1 (scattered) to 5 (fully there).
- **Mood** — how you felt, 1 (low) to 5 (great).
- **Energy** — how much energy you had, 1 to 5.
- **Water** — how much you drank, as a count of glasses.
- **Pages** — how many pages you read.
- **Hours** — how many hours, of sleep or of work.
- **Quality** — how good it was, 1 to 5.
- **Notes** — a line of text about the day.

**None of them is required.** A template such as *Exercise* pre-ticks Minutes and Weight because
many people want them; untick either and it is gone. Anything not on the list is yours to add under
**Your own fields**: give it a name and say what kind of value it holds:

| Kind of value | Means | Written in the plan as |
| --- | --- | --- |
| Number | any number, decimals allowed — 62, 84.2 | `weight:number:kg` (the unit is optional) |
| Count | whole things you count — 3 glasses, 20 pages | `water:count:glasses` |
| Rating | a mark from 1 to a ceiling you choose | `focus:scale:5` |
| Text | a line of words | `soreness:text` |
| Yes / no | a single box: did it happen | `stretched:check` |

On the card, a rating is a row of numbered buttons: click one to set it, click it again to clear
it. Hover a field's name and it tells you what it means — the same sentence the form showed you.

## The log

One line per day. Astrolabe writes these lines when you tick and type on the card, but they are
made to be read — and edited — by a person:

```
2026-09-14 | done: morning, evening | skipped: stretch | minutes: 62 | weight: 84.2 | Felt strong
```

Reading left to right, separated by ` | `:

- the **date** opens the line (Eastern Arabic digits are fine too);
- `done:` names what you ticked — a part of the day (`morning`), an every-day item (`Fajr`), or
  the weekday itself when the day was a single line (`sunday`);
- `skipped:` names what you passed on **on purpose** — the day still counts as missed, but the log
  remembers why;
- `deferred:` names what you **pushed to tomorrow**: not done, not given up. The task keeps
  showing on the following days under *Owed from earlier days* until you tick it or skip it, and
  the tick is written onto the day it was owed to, so that day is the one that gets the credit
  (and its streak heals). A pushed task is remembered for a week;
- anything whose name is one of your fields sets that field;
- whatever is left is the day's **note**.

Lines that do not start with a date are ignored, the last line for a date wins, and Astrolabe keeps
the lines in date order when it writes. Whatever you typed by hand survives to the byte; the app
only ever replaces the one line it is recording.

## A course

Some things you mean to do are not the same every Monday. A language, an instrument, a textbook:
they are a *list*, in order, and what matters is not "did I do Tuesday" but "what comes next". Write
`mode: course` in the plan and a sigil becomes exactly that — an ordered list of **steps**, gathered
into **units**, that asks you for the next one and nothing else.

```sigil
title: Japanese
kind: study
icon: 🗻
mode: course
days: mon, tue, wed, thu, fri, sat
capacity: 15 min · sat 45 min · sun 0
items: [[Orbits/Japanese/Hiragana]] · [[Orbits/Japanese/Katakana]]
steps: |
  # Kana
  - Tofugu Learn Hiragana rows あ か さ た (45 min)
  - rows な は ま や ら わ ん (45 min)

  # Genki I — lesson 1
  - grammar point 1, then Tae Kim's telling of it (15 min)
  - grammar point 2 (15 min)
```

| Line | What you put after the colon | What it does |
| --- | --- | --- |
| `mode` | `course` | Makes this sigil a course instead of a week. Write the `steps:` block and it is a course anyway. |
| `days` | weekdays with commas between them — `mon, tue, wed, thu, fri, sat` | The days that get a step. Every other day is a rest day: nothing is owed and nothing counts against you. Leave the line out and every day gets one. |
| `capacity` | how long you have — `15 min`, or `15 min · sat 45 min · sun 0` | A day's budget. Name a day to give that day its own; `0` makes it a rest day. Leave it out and each day takes exactly one step. |
| `items` | the same every-day things a week's sigil takes | Asked every day, beside the steps. Deck chips work here exactly as they do on a week. |
| `steps` | `steps: \|` and then the lines below it | One step a line, opening with `-`. A line opening with `#` names the **unit** the steps under it belong to. `(45 min)` at the end of a step says how long that step wants. Blank lines and any other line are yours; nothing is thrown away. |

**Nothing in the note is dated.** That is the point. The **cursor** is the first step that is neither
ticked nor skipped, and every date you see is *projected*, fresh, each time the card is drawn:
Astrolabe walks forward from today over the days you allowed, filling each one with steps until its
budget runs out. A step longer than the budget still gets taken — it simply takes the day, and if
you do not finish it, tomorrow as well.

So a missed day changes nothing in your file. There is no schedule to fall behind. The projection
is recomputed and **everything after the cursor shifts by a day**, which is what you would have done
by hand and what you would have got wrong. The owner asked for it in exactly those words: *if it
takes me two days instead of one the schedule handles it by shifting the task to the second day.*

The card says where you are and where that is heading — **Step 12 of 96 · Genki I — lesson 1 · on
course to finish 14 March** — and then lists today's steps with a box each. Tick one and the cursor
moves on. **Skip** moves it on without you: the step is given up, not owed. There is no *tomorrow →*
on a course, because a course pushes itself. A past day still shows what it held, so a tick taken in
error can be taken back. Under it all, folded away, **the whole course**: every unit, how much of it
is answered, and the stretch of days the projection gives what is left.

The log is the same `sigil-log` block a week's sigil keeps, one line per day:

```
2026-09-19 | done: k3f2a1 | Slow start
```

**A step's name.** `k3f2a1` is the step's **key**, and the log names keys rather than words so you
can rewrite a step without losing its tick. A key is one of two things:

- whatever you put in square brackets at the end of the line — `- grammar point 2 (15 min) [g2]`;
- otherwise a short hash of the step's words and the unit above it.

A hash survives you **inserting** a step anywhere in the list and **reordering** the lines: it does
not depend on where the step sits, only on what it says. It does not survive you **rewriting the
words** — so the first time you tick or skip a step, Astrolabe writes its key into the line for you:

```
- Tofugu Learn Hiragana rows あ か さ た (45 min) [k3f2a1]
```

From that moment the step has a name of its own and you may rewrite it as freely as you like. The
tag is written in the same edit as the tick, so it is one undo step, and every other byte of the
plan — your comments, your blank lines, your indentation — is left where it was. For a step you
have never answered there is nothing to lose, which is why nothing is stamped until you answer one.

**On the calendar.** [The Calendar page](calendar.md) draws a course twice over. Days already gone
carry the steps you actually did, solid, on the days you did them. Days ahead carry what the
projection puts there, faint and in italic, because it has not happened and will move if you fall
behind. And under the month, **the months ahead** as unit bands — *Japanese · Genki I — lesson 3 ·
27 Oct – 9 Nov* — so you can see a curriculum laid out in weeks without reading forty cells. All
three come out of one projection, so they can never disagree.

The streak, the week and the twelve-week grid work as they always did. A day is complete when its
budget's worth of steps is done — or, with no budget, when its one step is.

## The card

The plan turns into a card wherever the note is shown — in the editor, in reading view, on your
published site, inside a transclusion — always the same card:

- **The head**: the icon (or the kind's glyph), the name, and the banner strip above them if you set
  one.
- **Today**: the date, the day's checklist (every-day items first, then the day's parts with what
  each asks), the fields, and a one-line note. In the editor, ticking a box rewrites the log as
  **one undo step**. **Any past day can be visited**: click a day on the week strip or a cell
  of the heatmap and the box redraws for that day — its checklist as it was ticked, its
  fields, its note — and you can change it there (a tick writes into that day's line); *← Today*
  brings the card back. Hover a task for *skip* and *tomorrow →*: skip is "not at all", tomorrow is
  "not today" — the task moves under *Owed from earlier days* on the next day's card and stays
  there until you answer it. A part whose text links a study deck with a wikilink
  — `review: [[Orbits/Hiragana]]` — shows the deck by name and wears a small chip, *12 due ·
  Study*, that opens the session; when a session leaves nothing due, the part is ticked for you
  — and so is a part whose decks have nothing due when the card is drawn, so a review with
  nothing to review never sits open asking what to check (see [Orbits](orbits.md)).
- **Three numbers**: the **streak** (complete days in a row — rest days do not break it, and a day
  that is not over yet neither adds nor breaks), **this week** (`3/6`, against your target), and
  the **last 30 days** as a percentage.
- **The week**: seven dots, today ringed — full for complete, half for partly done, red-rimmed for
  missed, hollow for a rest day. The week starts on Monday when you read the app in English and on Saturday when
  you read it in Arabic — the interface's language, so your own editor language if you pinned one.
- **Twelve weeks**: a small grid, one cell per day, coloured by how much of the day you did.
  Hatched cells are rest days; today is ringed.
- **The week's plan**, folded away under a heading: each day and its parts, today's row lit.

The log block renders as a table of the days, newest first: the date with its status dot, what was
done, each field, the note.

Reading view and the public site show the card without its controls. A visitor cannot write to
your note, and a box that cannot be ticked would be a box that lies.

## The Sigils page

The seal button in the status bar (a ring with a small mark inside, beside the settings gear;
admins only — or **Open Sigils** in the command palette, or **Sigils** in the phone's ⋯ menu)
opens every sigil in the vault as today's checklists, in a tab in the current pane. The address is
`/sigils` (`/routines` still gets you there). The line under the heading counts the day: *3 of 5 <!-- lineage -->
complete today*; when cards are due in [Orbits](orbits.md), a second line says how many and opens
the shelf.

A tick on this page goes to the note the sigil lives in, by the very same edit the editor would
make, so the page and the editor never disagree about what the log says. The page re-reads on
every change to the vault, so a box ticked in the editor shows here at once.

**The month is elsewhere.** A small month sat under this heading until 3.17. The month has a page
of its own now — [the Calendar](calendar.md), at `/calendar`, through the calendar leaf in the top
bar — where a cell has room to name the sigils you kept that day, the cards you graded and the
pages you read. This page is the morning's checklist, and it keeps its width for the checklists.

**Recently read.** When nothing is due — no sigil asks anything of today, or everything asked has
been ticked, and no cards wait in Orbits — the page opens instead with a row of the notes you were last in, the palette's own
memory, so a quiet day starts where the last one left off. Each is a door back to the note.

Each card has **Edit** (the form, filled in), **Delete** (the note goes to the trash through the
same dialog the tree uses), and its name opens the note. One sigil spans the whole row, with the
week strip beside the twelve-week grid; two share a row; more wrap in pairs.

## The weekly review

**Review the week** in the command palette — and, on the week's last day (Sunday when you read in English,
Friday in Arabic), a line on the Sigils page — opens the week added up, on one
page set in the serif, at `/review-week`:

- **Reading**: pages and hours by book this week, from the sittings the [PDF
  reader](books.md#reading-sessions) logged into each [tracker](trackers.md#reading-sessions), with
  the book's own speed.
- **Where each work stands**: every active tracker's count and bar, the day it is projected to
  finish at its pace (or the pace its due date asks for), and the hours left at its reading speed.
- **Sigils**: each sigil's complete days against its target, and its streak — the same numbers the
  card shows.
- **Orbits**: cards graded and the share kept, by deck, from this device's own log.
- **Notes**: the notes written this week, and the notes most edited — by the number of versions the
  store kept when [note history](backup-and-sync.md) is on, by the last write otherwise.

Every row is a door to its note. The arrows walk to earlier weeks. **Print** puts the sheet on paper
(so does the browser's own print while the review is in the focused pane), without the bar.

Nothing on the page is stored. It is computed, each time it opens, from your notes, your trackers'
`sessions:` lines, your sigil logs and the Orbits log this browser keeps — a review that kept a
ledger of its own would be a second truth about the sigils, and the note is the only one.

## New sigil — the form

**New sigil** opens a sheet in four parts.

**Start from.** A row of templates. **Custom** starts from nothing and lets you choose each part
yourself. The built-in ones fill the sheet in: *Exercise* (a whole week of morning walks and evening
full-body sessions), *Habits*, *Mindfulness* (a morning sit, a walk without the phone, an evening sit, with minutes and a calm rating
congregation), *Sleep* (hours, quality, bedtime), *Water*, *Mood* (mood, energy, gratitude),
*Reading*, *Study* — each in your site's language. Under them, **Your templates**: any note in the
[templates folder](templates-and-notes.md) that carries a ` ```sigil ` block. A template only
fills the sheet in; everything on it stays yours to change.

1. **Name and look.** The name; the kind (or your own word); the **icon** — a shelf of forty
   glyphs, or type any emoji or short symbol; the **banner** — a picture from the vault, chosen from
   a list as you type, or **Choose…** to upload one.
2. **Days and parts.** The parts of a day (`morning, evening`); the things asked of every day; and
   a table — one row per weekday, one column per part — where you write what each day asks. Leave a
   day blank and it is a rest day.
3. **What to record each day.** The toggles described above, each with its sentence, plus **Your
   own fields**. Tick only what you actually want to write down.
4. **Target and notes.** Days a week you are aiming for; a book you are tracking; notes.

**Save** writes one note:

```
Sigils/Daily exercise.md
```

holding the name as frontmatter, the plan block and an empty log block. On an Arabic site the
folder is `سجل`; a vault that already has a `Routines/` or `روتين/` folder from before 3.15 keeps <!-- lineage -->
filing there. A vault from 3.15 that filed under `Orbits/` does not: that folder is where the study
decks live now, so the next sigil starts a `Sigils/` folder, and the ones already in `Orbits/` go
on working where they are. A name that already has a note is refused rather than overwritten.
Editing from the page rewrites **only the plan block** — the log under it and any prose around it
stay exactly as they were, byte for byte. **Save as template** writes the same note into the
templates folder instead, so a sigil you drew up once can seed the next.

## On a phone

On a phone ([the phone layout](workspace.md#on-a-phone)) the Sigils page is a list: every sigil as a row that says how today stands — "2 of 3 today", a rest day, done, or the step a course is on — and **+** for a new one. A sigil opens as the card above in a phone's order: **today's checklist first**, then the week strip and the heat map, then the streak, the week and the month, and a course's units with the dates the projection gives them, unfolded. Ticks answer at once and are written the same way the card writes them anywhere else. **Edit**, **Open the note** and **Delete** are under the top bar's **⋯**. The day's ticks are also on **Today**, one row per task.

## In the editor

Type ` ```sigil ` by hand, or `/sigil` from the slash menu for a skeleton. With the caret outside
the block you see the card; put the caret inside and it is source again, so the plan can be edited
in place. The log block behaves the same way.

## In Obsidian

`sigil` is an Astrolabe extension. In Obsidian the two blocks are labelled code blocks whose lines
are all readable — nothing is converted and nothing is lost. A [tracker](trackers.md#in-obsidian) goes
the same way; a [drawing](drawing.md#in-obsidian) is the Excalidraw plugin's own file; and an
[orbit](orbits.md#where-the-schedule-lives) writes its schedule in the Spaced Repetition plugin's own
format.

## Also on Today and the Timeline

Every task a sigil asks of today is also a row on [Today](today.md), ticked in place through the
same edit the card makes; and every day a sigil logged is a row on [the Timeline](timeline.md). The
year in review counts each sigil's ticks and its best streak.
