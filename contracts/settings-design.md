# Settings — the design

Written before the second pass moved a pixel, and kept true after it: every row the panel draws is
one of the controls catalogued here, on one of the pages listed here, and the tests and the browser
walk read this file's rules back out of the code. [`settings-audit.md`](settings-audit.md) is the
row-by-row ledger (every row of 3.37.0, its verdict in the purge and the page it now lives on);
[`shell.md`](shell.md), "Settings panel", is the machinery (the form, the two hosts, the index).
This file is the *shape*: what a row looks like, which control a value gets, and where it lives.

## Why a second pass

The purge (3.38.0) sorted the rows by intent and still read badly. The owner: "astrolabe settings
are still bad if not worse? You should feel free to break stuff out in more categories. Also wth is
this browser dictionaries with like so many on off toggles. Please make sure things are legit." In
its screenshots:

1. **Browser dictionaries** was four On/Off pills ("French: off · Arabic: off · …") for one
   question — which languages does this browser spellcheck.
2. **A "This device" chip on nearly every row** of Appearance, and many elsewhere: a mark that is
   on everything marks nothing.
3. **Five control widths in one column**: segments that hugged their words, a full-width select, a
   slider with its value flung to the far edge, a path field with a detached *Pick…*. No edge
   lined up with any other.
4. **Two-storey segments**: "Default / English", "Auto / Left", "Everything / no filtering" — every
   such row twice as tall as its neighbours, and a five-way filter wider than the column.
5. **Long mixed pages under ALL-CAPS subheads**: *Your site* was identity + publishing + comments +
   mentions + the fediverse; *Writing* was launch + toolbar + autocorrect + templates + a table of
   periodic notes; *Reading & speech* was four subjects; *Language & dates* was four more.
6. **Hints of two lines** that restated the label.

## The pages — a two-level rail

Four groups, eighteen short pages. A page answers one question and holds **at most ten rows in
sight** (rows set once and left fold behind its **Advanced** line; `check-settings` enforces the
ten, counted as one kind of vault sees the page). The rail shows every group's heading with its
pages under it and lights the page that is open; ↑/↓ walk the pages across groups, Home/End jump to
the ends. The search above the rail still reaches every row on every page. The phone draws the
same four groups as headed lists, each page a pushed screen.

| Group | Page (id) | What it decides | Rows in sight + Advanced |
| --- | --- | --- | --- |
| **You** | Appearance (`appearance`) | the theme on this screen, the light over it, the sidebar's edge, the column | 5 — *all on this device* |
| | Layout & type (`type`) | how note prose is set: direction, alignment, the four faces | 7 |
| | Language (`language`) | your language, the site's, spellcheck, which notes visitors see by language | 5 |
| | Dates & calendar (`dates`) | which calendar every date prints in, and in what order | 2 + 1 |
| | Writing (`writing`) | how the editor opens and behaves; where files and tags go | 7 + 1 |
| | New notes & templates (`notes`) | templates, the calendar's notes, minute notes, the two capture doors | 6 |
| | Reading (`reading`) | numbered headings, book search, feeds | 3 + 1 |
| | Read aloud & voice notes (`speech`) | the voices that read to you; the words you speak into notes | 5 + 1 |
| **Your site** | Site identity (`site`) | name, tagline, logo, favicon, the visitors' theme | 6 + 1 |
| | Publishing (`publishing`) | the shell a visitor lands in, the home page, what an article carries | 6 + 2 |
| | Comments & mentions (`conversation`) | who may answer: comments, webmentions, the fediverse | 3 |
| | Collections (`collections`) | tag or folder categories, your own collections | 5 |
| | Library (`library`) | the public shelf: on, its name, where it shows, which folders fill it | 6 |
| **Data** | Backup & sync (`sync`) | git backup (an instance) or the repository (a pocket vault) | 6 + 2 · pocket 4 |
| | Versions & travel (`versions`) | note history, what the vault carries to the next machine | 3 |
| | Ask (`ask`) | which models read the notes and answer | 5 + 2 |
| **App** | This device (`device`) | the app itself here: offline copy, Vim keys, what's new; on the desktop its name, icon, launcher, updates | 3 · desktop 7 — *all on this device* |
| | About (`about`) | version, paths, counts, the manual | facts, no rows |

**Decisions the list encodes.** *Open on launch* stays the first row of Writing: it is saved in the
vault (it follows the vault to the next machine), so it cannot sit on a page that says everything
on it is kept on this device. *Vim keys* moved from Writing › Advanced to This device (the brief's
"keyboard"): it is a per-device editing key map, and with it there the Writing page is the vault's
editor rules only. *Offline reading* moved from Reading to This device ("offline copy"). The
visitors' language filter and switch stay on Language: a reader who wants "Arabic only" looks
under Language, not under Publishing. There is no zoom row — the desktop's zoom is the View menu's
and survives a relaunch on its own (3.35.0). A pocket vault draws fourteen pages: Publishing,
Comments & mentions, Collections, Library and Ask hold only rows a pocket cannot keep.

**Every old id maps forward** (`sectionId` in `settings/tabs.ts`): the purge's nine ids are still
pages (`appearance`, `language`, `writing`, `reading`, `site`, `collections`, `sync`, `ask`,
`about`), and the pre-purge ids land on the page that holds most of what they held — `vault` →
`notes`; `device` and `publishing` are pages again. A remembered page, a restored phone entry, an
`openSettingsAt(row)` and an old `{kind: "settings", section}` all arrive.

The settings index (`settingsIndex.ts`, generated) carries each row's `tab` (its page), `group`
(its rail group), and `kind` (its control, below). `check-docs` validates "Settings → Page → Row"
in both languages against it.

## The row

One anatomy, desktop measurements in the dialog at a 1280 × 800 window (1rem = 15.5px, English):

```
 ┌── label column: minmax(0, 1fr) ──────────────┐ 1.5rem ┌── control column: 16rem ──┐
 │ Label · 30%  ⓘ               (0.857rem/20px) │        │ ▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭ │ 34px control line
 │ One-line hint, ≤ 90 characters (0.75rem/17px)│        │                           │
 └──────────────────────────────────────────────┘        └───────────────────────────┘
   12px padding above and below · a hairline between rows · the ⓘ's paragraph opens under the
   whole row at ≤ 70ch
```

- **Dialog** `min(70rem, 100vw − 32px)` wide (1,085px); rail `13rem`; page body ≈ 820px, so
  the label column is ≈ 550px and a 90-character hint sits on one line (the walk measures it).
- **Label** `0.857rem`, line-height 20px, `--text`; padded 7px from the row's top so its first line
  centres on the 34px control line. A slider's value rides in the label: *Screen warmth · 30%*.
- **Hint** one line: ≤ 90 characters and ≤ 14 words in English (`check-settings`), and it says
  what the label does not — the effect, or when to change it — never the label again. `0.75rem`,
  17px, `--text-muted` (a hint is read).
- **ⓘ** only where a paragraph is truly needed — a grammar, a privacy trade, the environment
  variable an operator scripts. It opens inline under the whole row and answers *why would I change
  this*, not *what is this*.
- **Control column** `16rem` (248px), one edge for every row: every control touches the column's
  inline-end edge; the fill kinds span the whole column. The control line is 34px
  (`2.2rem`); a shorter control (a switch) is centred on it.
- **Rhythm** 12px above and below each row, a 1px hairline (`--border` at 60%) between rows, no
  row taller than label + hint unless its control is (a part, a wrapping chip row, a table).
- **Parts** — a control that only means something beside its host (the custom width under
  *Custom*, the note under *A note*) sits in the host's control column under its control, with a
  `0.75rem` caption; it has no rule of its own and no row of its own.
- **Tables and blocks** take the row's full width under the label and hint (`grid-column: 1 / -1`),
  up to 44rem.
- **Page head**: the page's name (serif, 1.1rem), one sentence (≤ 62ch), and — on a page whose
  rows are ALL kept on this device — one more line: *Everything here is kept on this device and
  saves as you change it.* No subheads in ALL CAPS: a page short enough to need none has none; the
  one kept (*Your own fonts*, under the type specimen) is sentence case.

### "This device", said once

A row kept in this browser saves as it changes and never raises the Save bar. The rule for saying
so: **a page whose rows are all per-device says it once** (the line above: Appearance, This
device); **on a mixed page only the exceptions wear the mark** — the small *This device* pill
beside the label — and there are six of them in the whole panel: *Your language* and *Spellcheck
in* (Language), *Formatting toolbar* and *Auto-correct French* (Writing), *Numbered headings*
(Reading), *Settings travel with the vault* (Versions & travel). The index records `device: true`
for every per-device row, marked or not, so the walk can hold each to the rule.

## The control catalogue

One component per kind, one width each. Every row in the app is exactly one of these (its `kind`
in the index; `tests/settings-design.test.ts` checks every row names a kind from this list and the
source draws that kind's component).

| Kind | Component | Width | For | Never |
| --- | --- | --- | --- | --- |
| **Toggle** | `Toggle` — a switch, no words beside it | the switch, at the column's end edge | a two-state value whose ON meaning is the label ("Formatting toolbar", "Accept webmentions") | "Off" as a label, a third state |
| **Segmented** | `SegmentedControl` | fills the column, equal segments | 2–4 short options, all worth seeing ("Auto · Left · Right") | a sub-label under an option (the meaning goes in the hint; the resolved default is the segment's tooltip and its accessible description); a 5th option — that is a Select |
| **Select** | `Select` (and the two pickers built on its trigger: fonts, and the theme — swatch + name + *Themes* ▾, one line tall) | fills the column | 5+ options, or options with notes | a native `<select>` |
| **Chips** | `Chips` — a multi-select of `aria-pressed` buttons, chosen ones filled | fills the column, wraps | several of a small set ("Spellcheck in: French · Arabic · Hebrew · Persian") | a column of toggles |
| **Slider** | a range input | fills the column; the value is in the label ("Screen warmth · 30%", "… · Off") | a level | a value at the far edge |
| **Path** | `PathInput` (a note, a folder) or `ImageField` (an image or URL) — *Pick…* inside the field's trailing edge | fills the column | a vault path the vault can suggest | a button detached from its field |
| **Text** | `TextInput`, `NumberInput` (unit inside the field), the one `textarea` | fills the column | a name, a URL, a model id, a number | a hint that decodes the value |
| **Table** | the editor tables and composite blocks: periodic notes, tag labels, collections, library roots and paths, the read-aloud voices, your own voices | the row's full width, under its label | many values of one shape | a stack of rows asking the same two questions |
| **Action** | `s-btn` (secondary) | its words, at the column's end edge | a verb the row serves: Install, Clear, Check again, Design the site, the clipper | an accent button inside a row |
| **Status** | a muted line (`s-smodal__status`) | the column | what is true now: the repository's state, "N notes discoverable", the index's size, what travels | a control |

**Dark and light**: every colour is a token (`--text`, `--text-muted`, `--border`, `--accent`,
`--accent-soft`, `--bg`, `--bg-raised`); a chosen chip and a lit switch are `--accent` on
`--accent-soft`, the same pair a chosen segment uses. **RTL**: logical properties only — the end
edge is the left in Arabic, the switch's knob travels the reading way, a slider fills from the
right, *Pick…* sits at the field's left end, the Advanced triangle points the reading way.
**Phone** (the phone shell's sections, and the dialog under 560px): one column — label and ⓘ
(and a switch, at the line's end), the hint, then the control full-width under them; every switch,
segment, chip, select, field, *Pick…*, ⓘ and the Advanced line is at least 44px tall; 16px side
gutters.

## Legitimacy

Every control does exactly what its label says, and the browser proves it
(`scripts/settings-walk.mjs`, run by check-fidelity on the dialog and check-phone on the phone
shell, in English and Arabic): on every page it **sets every settable row once** — toggles
flipped, a different segment, a different select option, a chip, a slider moved, a field typed —
and checks that the per-device rows never raised the Save bar and a saved row did, saves, **reloads
the app, reopens the page, and reads every control back**: the visible state must be the state it
was set to, and the stored settings (the server's, or this browser's) must have moved. Then it puts
every row back, saves, reloads, and reads the originals back. Discard is walked once (a change,
Discard, the control back and no bar). Every control in every row has an accessible name; a row
with no control that can be set (a table, a status, an action) is named in the walk's log with its
kind, and a row it cannot set in a scratch instance (a write-only secret) is named with its reason.
