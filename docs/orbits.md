# Orbits

*Decks of cards that are notes in your vault, studied on a schedule the note itself keeps.*

← [Back to the README](../README.md) · [All docs](README.md)

---

A card you are learning comes back around: tomorrow, then in a week, then in a month, each time a little later than the last. That is an orbit, and it is the picture behind this page. **Orbits** is Astrolabe's own spaced-repetition system. A **deck** is a set of things you want to know by heart, a **card** is one of them, and a **session** is a sitting in which you are asked them and say how well you knew. It does what Anki does, and it needs no second program, no separate database and no export: a deck is a Markdown note, its cards are lines in that note, and the day each card comes back is written into the note beside it.

A vault that never writes a deck still has one. Every highlight, quote and question you already marked in your notes (the forms are listed [below](#what-already-counts-as-a-card)) is gathered into an implicit deck called **Everything else**, grouped by top folder, so nothing you did before this page existed is lost.

> Until 3.15 this page's name belonged to the daily routine, which is now [Sigils](sigils.md). The word moved to where it fits: a routine is something you keep, and a card is something that comes back around. <!-- lineage -->

## The note

A note becomes a deck when it carries a `deck` code block. Everything else in the note is ordinary Markdown; the block only names the deck and says how it should be studied. Here is a whole one:

````md
---
title: Hiragana
---

```deck
title: Hiragana
icon: あ
kind: typed
new per day: 10
steps: 1m, 10m
tags: japanese, kana
```

Type the romaji and press Enter.

## Basic

あ::a
い::i
か::ka
し::shi

## Dakuten

が::ga
じ::ji

## Combinations

きゃ::kya
しゃ::sha
````

Every line of the form `front::back` is a card: the front is what you are shown, the back is what you try to recall. A third part, `front::back::extra`, is shown on the answer side only, for a reading, an example sentence or a mnemonic:

```md
食べる::to eat::たべる · 朝ご飯を食べます
```

Headings are **sections**. The session shows the section's name above the card as a breadcrumb, and the shelf can study one section on its own, *Lesson 3 only*, which is how a textbook's chapters fit in one note. A line may end with `#tags` of its own. Anything inside another code block is never a card, and neither are headings, tables and task lines.

The block's keys, all optional:

| Key | Values | What it does |
| --- | --- | --- |
| `title` | a name | The name on the shelf. Without it, the note's title. |
| `icon` | one emoji or a short glyph | Drawn on the shelf's card and above each card in a session. |
| `kind` | `basic` `reversed` `both` `typed` `cloze-only` | How the `::` lines are asked; see the table below. `basic` when absent. |
| `new per day` | a number | How many cards you have never seen this deck may show you in one day. Ten when absent; `0` means reviews only. |
| `steps` | durations: `1m, 10m` | The learning steps a new card climbs before it gets a real schedule; see [Learning steps](#learning-steps-and-the-daily-limit). `1m, 10m` when absent. |
| `tags` | words, separated by commas | The shelf filters by them. |

### Kinds

| `kind` | A `front::back` line becomes |
| --- | --- |
| `basic` | One card, front → back. |
| `reversed` | One card the other way round, back → front. |
| `both` | Two cards, front → back and back → front, each with its own schedule. Vocabulary wants this: you must produce the word as well as recognise it. |
| `typed` | One card that shows an input box on the front. You type the answer and press Enter; the app compares it with the back (ignoring case, spaces at the ends, and the difference between full-width and half-width kana) and colours the letters that differ. The grade is still yours to give. |
| `cloze-only` | The `::` lines are ignored; only `==highlights==` in the note are cards. |

Whatever the kind, a line written with three colons, `front:::back`, is always a pair asked both ways, exactly as the Obsidian Spaced Repetition plugin reads it.

### What already counts as a card

These have been cards since before this page existed and still are, inside a deck note or anywhere else in the vault:

| In the note | The card |
| --- | --- |
| `The ==mitochondria== is the powerhouse of the cell.` | A **cloze**: the front is the paragraph with the highlighted words blanked out; the back is the words. Several highlights in one paragraph make one card. |
| `> [!quote] Ibn Khaldun, p. 12` and the quoted lines under it | A **quote**: the front is the source and the first few words; the back is the whole passage. A highlight you cite from a PDF in the reader lands in your note in this form, so it is already a card. |
| A line, then `?` on its own line, then the answer under it | A **question**, front and back as written, either side allowed several lines. |

## Studying

Open Orbits from the command palette (**Open Orbits**, or **Study due cards** to go straight into whatever is due), from the ring door in the status bar — a small body on its orbit — or from the line the [Sigils](sigils.md) page shows when cards are due. The address is `/orbits`; the old `/review` still opens it.

The **shelf** lists every deck as a card: its icon, its title and tags, how many cards are due, new and in all, and a thin line drawn from the last thirty days of your grades. The header counts what is due today across all of them and how many days in a row you have studied. **Study** starts a session with the due cards and today's new ones; **Study section ▾** limits it to one heading. *Everything else* sits last.

A **session** shows one card at a time. The deck's icon and the section's name stand above it; a bar shows how many are done and how many remain. You read the front, try to recall, then turn it over with **Show answer** (Space or Enter). On a `typed` card you type first and Enter checks; the answer then shows with your attempt beside it. Four grades follow, *Again*, *Hard*, *Good* and *Easy*, each with the wait it would give the card, so you never grade blind. The keys **1** to **4** pick a grade. **Edit** opens the note at the card's line in a new tab. **Skip** puts the card aside for the rest of this session. **Undo** takes back the last grade and restores the schedule it replaced (one step). When the pile is empty a summary says how many you did, how long it took, how many you knew, and lists the ones you graded *Again*, with **Study more** and **Back to the shelf**. On a phone the grade row stays at the bottom, under your thumb.

When nothing is due, **Study ahead** goes on through the rest of the deck, soonest due first.

### Learning steps and the daily limit

The schedule itself is SM-2, the method the Obsidian Spaced Repetition plugin uses: the first *Good* makes a card wait a day, the next six days, and after that each wait is multiplied by the card's *ease*, a number that says how easy it has been for you. *Hard* and *Again* lower the ease, *Easy* raises it, and it never drops below 1.3.

What SM-2 lacks is a first day, and that is what **learning steps** give. A card you have never seen, or one you have just failed, is not sent off for a day; it comes back within the same session, first after one minute, then after ten (the `steps:` line changes these). *Good* on the last step, or *Easy* at any step, **graduates** it: it gets its first real schedule, one day for *Good* and four for *Easy*, written into the note. *Again* on a card you have known before is a **lapse**: the note gets SM-2's own answer (back tomorrow, ease lowered) and the card also returns in ten minutes, so you leave the session having seen it right at least once. The steps live only in the open page: close it and they are forgotten, and the note is the truth.

Every deck also has a **daily limit on new cards**, `new per day`, ten unless you say otherwise. Reviews are never limited, and the limit is counted on this device for the local day, so a fresh deck of two hundred kana meets you ten at a time. Within a session the order is: learning cards whose step has come, then due reviews (the most overdue first), then new cards in the order they appear in the note; after every four reviews, one new one, so the new ones do not all arrive at the end.

## Where the schedule lives

When you grade a card, the app writes one comment into the note, after the card's line or block, in the plugin's own format:

```md
食べる::to eat::たべる <!--SR:!2026-09-27,4,2500-->
```

That comment is the whole state of the card: the day it is due, its current wait in days, and its ease times a thousand. A `:::` pair, or any line in a `both` deck, keeps two schedules in one comment, `<!--SR:!d1,i1,e1!d2,i2,e2-->`, which is the plugin's format for a pair too. The reading view hides the comment; the editor shows it as plain text; deleting it makes the card new again.

This is the promise the page keeps: **a vault you study in Astrolabe and in Obsidian's Spaced Repetition plugin is one vault.** The plugin reads every deck note as a deck it wrote itself, and Astrolabe reads the plugin's decks as its own. Nothing about a card is stored anywhere but the note, with two exceptions that are caches rather than state: the learning steps of the open session, and the per-device log the statistics are drawn from.

## Statistics

Each shelf card opens a **stats** drawer for its deck: retention over the last thirty days (the share of grades that were *Good* or *Easy*); a forecast of how many cards come due on each of the next thirty days, computed from the schedules; the cards by state, new, learning, young (waiting less than three weeks) and mature; and the ten you have failed most often. The grades come from a log this device keeps of your last five thousand answers; the note has no history, and neither does the plugin, so a second device shows the statistics of its own sessions.

## Creating a deck

**New deck…** on the shelf (also in the command palette) asks for a title, an icon, a kind and a folder (`Orbits/` unless you choose another), then gives you a box to write the cards into, one `front::back::extra` line each, with a count that updates as you type. Save writes the note and returns you to the shelf. You can just as well write the code block by hand in any note.

A card from a passage you are reading: select it, open the selection menu and choose **Make a card**. The selection becomes the answer of a `?` block placed after the paragraph, with the cursor on the empty question line above it. Highlighting a phrase (Ctrl/Cmd ⇧ H) makes a cloze card with no menu at all.

### Importing

**Import…** on the shelf takes an Anki package (`.apkg`) or a spreadsheet (`.csv` or `.tsv`).

An **Anki deck** becomes one deck note per Anki deck, with its subdecks as sections. The note types are mapped to what you would have written by hand: *Basic* to `front::back`, *Basic (and reversed card)* to `front:::back`, *Cloze* to `==highlights==` in the text, and any further field to the `::extra` part. Pictures and sounds the cards use are copied into the vault's attachments folder beside the note and embedded as `![[file]]`. Anki's own scheduling, the due day, interval and ease of every card you have already studied, becomes the schedule comment, so the deck carries on where it was, not from the start. A card the note cannot hold as a line (a front the scanner would read as a heading, a quote or a table row is escaped and kept; one that still would not read back is left out) is counted and reported. Reading a `.apkg` needs Node 26 or later on the server (it uses Node's built-in SQLite); an older server says so plainly and skips the file.

A **CSV or TSV** file shows a column mapper: choose which column is the front, which the back and, if you like, which the extra. The first row is treated as a header when it looks like one.

Whatever the source, the result is a note you can open and edit like any other.

## The sigil link

A [sigil](sigils.md) is where the day's plan lives, and a slot in it can name a deck with a wikilink:

```sigil
title: Japanese
slots: review, study
monday:
  review: [[Orbits/Japanese/Hiragana]] — every card due, then ten new (10 min)
```

On the sigil's card that slot shows the deck by name and wears a small chip after its text, *12 due · Study*, that opens the session. When a session for that deck ends with nothing left due today, the app ticks the slot for you, through the same log line the checkbox writes. A slot that names several decks is ticked when none of them has a card due. The Sigils page's own line, *N due in Orbits*, opens the shelf.

## Related

- [Sigils](sigils.md) — the day's page, where due cards appear and where a slot can point at a deck
- [The PDF reader](books.md) — citations that arrive as quote cards
- [The editor & reading view](editor.md) — highlights, callouts and the selection menu

A kanji deck built from [KANJIDIC2](https://www.edrdg.org/kanjidic/kanjd2index.html), as the author's own were, carries the dictionary's meanings and readings, © the Electronic Dictionary Research and Development Group, used under the CC BY-SA 4.0 licence; say so in the note's frontmatter, as they do.
