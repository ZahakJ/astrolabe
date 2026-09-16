# Templates, banners & notes

*Note banners, Obsidian-compatible templates, heading sections, attachments and the trash.*

← [Back to the README](../README.md) · [All docs](README.md)

---

## Note banners

A banner is a wide picture across the top of a note. Give any note one with a `banner:` line in its
frontmatter (the `key: value` block between `---` fences at the top of the file). It shows above the
note in the editor and the reading view, and in blog mode it becomes the article's hero image and a
right-aligned thumbnail in the post list. A published note's banner file can be fetched by visitors
automatically; the attachments of unpublished notes stay invisible, as always.

**Four forms are accepted, tried in this order.** Every picture Astrolabe is pointed at is looked
up the same way, the site logo and the dashboard hero included:

| What you write | What it finds |
| --- | --- |
| `banner: https://example.com/cover.jpg` | the URL itself (https only — a browser blocks an `http://` picture on a secure site, so it is refused rather than shown broken) |
| `banner: Media/cover.png` | that exact path from the vault root |
| `banner: cover.png` *(note in `Trips/`)* | `Trips/cover.png` — beside the note, where Obsidian keeps a note's own images. `img/cover.png` and `../shared/cover.png` work the same way |
| `banner: cover.png` *(no such neighbour)* | any `cover.png` in the vault, resolved exactly as `![[cover.png]]` resolves it: case-insensitive, shortest path wins |

A **bare filename is what most people write**, and for a while it was the one form that did not
work: it was looked for in the vault root alone and not found, even though wikilinks and embeds had
always found a file by name from anywhere. It works now, and so does the note's own folder.

If the value names nothing, **you are told**. As the signed-in admin you see, instead of the hero, a
dashed card naming the value that failed, with **Set banner…** beside it. Visitors see nothing at
all: a stranger cannot fix your typo, and blog posts fall back to the generated gradient. (Before
this, a broken banner deleted itself, which made a typo and "no banner" look identical.)

As admin you rarely write the `banner:` line by hand. **Set banner…** in the command palette (also
a quiet button on the properties card) opens a dialog to paste a URL, pick from the vault's image
attachments, or upload a file (drag and drop, or a file picker; png/jpeg/webp/gif/svg, 10 MB at
most, and the file's contents are checked, not just its extension). The upload lands wherever the
[Attachments](configuration.md#attachments) setting points, counted from the note's own folder;
under *Same folder* the banner sits beside the note. That changes one line of the frontmatter and
nothing else in the file. Posts without a banner get a subtle generated
gradient in the blog list and the article hero (`BANNER_FALLBACK=none` turns that off).

## Templates

A template is a note you use as a starting point for other notes, with placeholders such as
`{{date}}` that get filled in when it is used. Point Astrolabe at a folder of template notes and it
fills them in for you, using the same syntax as Obsidian's core Templates plugin, so **the templates
in a vault you brought over work unmodified**.

The folder is `Settings → Vault → Templates folder`. Leave it empty and Astrolabe finds one
itself, as long as the answer is unambiguous: a folder called `Templates`, `_templates` or `قوالب`,
with a leading ordering prefix allowed (`4 - Templates`, `04. Templates`). If there are two
plausible candidates and neither sits at the root to settle it, the setting stays empty rather than
guessing, because a wrong guess would hide real posts from your blog. **Notes in the templates
folder never appear in the post list** (or in RSS, or on the dashboard), even when they carry
`publish: true` so that the notes made from them inherit it.

There are two commands. Both are in the palette, both have a keystroke, and "New note from
template…" is also in the tree's right-click menu on any folder, where it creates the note *inside
that folder*:

| | |
| --- | --- |
| **Insert template…** (`Ctrl/Cmd Alt T`) | drops the template's body at the cursor of the open note |
| **New note from template…** (`Ctrl/Cmd Alt Shift T`) | asks for a name, creates the note with the template applied, and opens it |

Both open a picker that **previews the template with its placeholders already filled**, so you see
what is about to land, not what the file says. (`Ctrl/Cmd Alt` rather than the obvious `Ctrl/Cmd T`
because that one is the browser's new tab, and `Ctrl/Cmd Shift T` reopens a closed one. Neither can
be taken.)

**Placeholders**: Obsidian's, plus two of our own:

| Placeholder | Becomes |
| --- | --- |
| `{{date}}` | `2026-08-16` |
| `{{time}}` | `05:23` |
| `{{date:FORMAT}}` / `{{time:FORMAT}}` | moment-style tokens: `YYYY MM DD HH mm ss`, `MMMM`/`MMM` month names, `dddd`/`ddd` weekdays, `A`/`a`, and `[literal text]` in brackets. Named formats too: `{{date:long}}`, `full`, `medium`, `short` |
| `{{title}}` / `{{Title}}` | the new note's filename, as typed and in Title Case |
| `{{hdate}}` / `{{date:hijri}}` | the Umm al-Qura Hijri date |

Anything else is **left exactly as written**: `{{cursor}}`, a Templater expression, a stray `{{`.
Blanking a token Astrolabe does not implement would destroy text you typed and hide the fact that
the template expects something we do not do.

Dates follow the site's settings where a reader can see them, and stay in a form a program can read
where one has to. The named formats (`{{date:long}}`) and `{{hdate}}` use the site's calendar
(`settings.dateCalendar`) and the instance's numeral system. The token formats stay Gregorian with
Western digits: `{{date}}` is `YYYY-MM-DD` by Obsidian's definition, and it lands in `date:`
frontmatter lines and in filenames, where `١٤٤٨-٠٢-١٣` would parse as nothing. See
[Hijri dates](arabic-and-rtl.md#hijri-dates).

**Frontmatter is merged, never stacked, and a note's id is never copied.** Inserting a template
into a note that already has a `---` block folds the template's keys into that block: one block, no
key twice, and **the note's own values win** (its `publish:`, its `date:`, its `tags:` are facts
about that note; the template's are only defaults). The keys that tell one note from another
(`id`, `uuid`, `guid`, `permalink`, `slug`) are **generated fresh**, in the same shape as the
template's own value: a uuid stays a uuid, a
16-digit timestamp stays 16 digits. A template carrying `id:` used to hand the same id to every note
ever made from it.

**Template for new notes** (also in Settings) applies one template to every note created from inside
Astrolabe: `Ctrl/Cmd N`, the sidebar's `+`, the tree menu. It is off by default: new notes are born
empty, as they always were.

## Periodic notes

A periodic note is one note per period, named after it: a day, a week, a month or a year.
`Ctrl/Cmd Alt D` (or *Open today's daily note* in the palette) opens today's, creating it if it is
not there yet; **This week's note**, **This month's note** and **This year's note** do the same
for their periods. Where they live and what they are called are settings, in Settings → Vault
under *Periodic notes* — one folder the four kinds share, and a name and a template for each:

| Kind | Default name | Default template | Notes |
| --- | --- | --- | --- |
| Day | `YYYY-MM-DD` | *(the template for new notes)* | Cannot be turned off. |
| Week | `YYYY-[W]ww` | *(none)* | `ww` is the ISO week; the note is named by the ISO week-year. |
| Month | `YYYY-MM` | *(none)* | A month's name may not carry a day token. |
| Year | `YYYY` | *(none)* | A year's name may carry nothing finer than the year. |

Names take the tokens `YYYY`, `MM`, `DD`, `ww`, `[literals]`, and `/` for subfolders:
`YYYY/YYYY-MM-DD` files each year in its own folder. They are always Gregorian and in Western
digits — a file name is an address — and the period is printed beside the name in the status bar
in the site's own calendar (below). The *format is the declaration*: a name with a day token makes
a daily note, one with a month token and no day a monthly note, one with only the year a yearly
note. Type `off` in a name to turn that kind off; the daily notes folder may be empty for the vault
root. A template is applied when that period's note is first created. A vault that already keeps
`Journal/2026/2026-09-13.md` keeps working: set the folder to `Journal` and the daily name to
`YYYY/YYYY-MM-DD`.

The palette also has **Yesterday's note** and **Tomorrow's note**. When the open note is itself a
periodic note, the walk starts from *it* — yesterday and tomorrow from an open daily note, so a
journal can be read backwards one day at a time; this month's note from the month that day falls
in. Never the other way round: *This week's note* from an open yearly note is this week, not the
year's first.

**The period, in the status bar.** A periodic note keeps its ISO file name and, beside it in the
status bar, says what that name means in the site's calendar: `2026-09-15` reads *Tuesday, 15
September 2026*, and on a Hijri instance the Hijri date; `2026-W38` reads *Week 38 · 14–20
September 2026*; `2026-09` reads *September 2026*; `2026` reads *2026*. On a Hijri or dual-calendar
instance a Gregorian month or year is not a Hijri one, so it is named as the span of days it
covers rather than by a month name that would be wrong.

**On this day.** Under the backlinks, the right panel lists what you wrote, published or finished on
this day in earlier years: a strip that reads your archive back to you, drawn from the notes' own
dates and the trackers' `finished:` lines, with nothing stored. The Sigils page opens with the same.

### The calendar

Under the tree in the sidebar, a **Calendar** section draws the month you are in, seven days wide,
in the site's calendar: a Gregorian month on a Gregorian instance, a Hijri (Umm al-Qura) month on
a Hijri one, and on an instance that prints both dates the leading calendar's month with the other
calendar's day number small in each cell's corner. The week starts on the site language's first day
— Monday in English, Saturday in Arabic. A dot marks every day that has a daily note; a second,
fainter dot marks a day a [sigil](sigils.md) logged something; today is ringed. Clicking a day
opens its note, creating it through the same door as `Ctrl/Cmd Alt D` (template and all); `‹` and
`›` turn the month; the month's name brings you back to today's. The section folds like the tag
shelf and remembers it. The same grid sits at the top of the [Sigils page](sigils.md#the-sigils-page)
on a desktop; on a phone the sidebar's section is the calendar. A visitor to the public site sees
the section only when a daily note is published, dotted with the published days.

The grid is one tab stop. Inside it, `←` `→` walk the days (mirrored under Arabic), `↑` `↓` the
weeks, `Home` `End` the ends of the row, `PageUp` `PageDown` the months, and `Enter` opens the
day. Walking off the edge of a month turns the page.

## Sections: fold, extract, move

A section is a heading and everything under it, up to the next heading of the same level or higher.

- **Heading folding.** A chevron sits beside every heading (visible at rest, not on hover, because a
  control nobody can see is a control nobody finds, and there is no hover on a phone). Click it, or
  press `Ctrl/Cmd Shift [` / `]`, to fold a section down to a "N folded lines" chip.
  `Ctrl/Cmd Alt [` / `]` folds or opens everything.
- **Section actions on every heading.** A ⋯ beside the fold chevron (and a right-click on any
  heading line, or on any outline row) opens one menu: copy a `[[Note#Heading]]` link to the
  section, copy the section as Markdown, **extract it into a new note** with a `[[link]]` left
  standing where it was, fold or unfold everything below it, select it, focus it.
- **Drag a heading in the outline to move that whole section.** The heading, its body and every
  subheading travel as one block, and a drop rule shows the depth it will land at *before* you let
  go. Drag toward the reading direction to nest it one level deeper, or rest on a row for a moment
  to drop inside it. It is one step, so `Ctrl/Cmd Z` takes it back, and the toast carries an Undo
  button too. `npm run check-sections` tests the rewrite against thousands of generated notes with
  frontmatter, nested headings and code fences containing `###` lines; see
  [Development](development.md).
- **Focus one section.** `Ctrl/Cmd Alt F` collapses everything except the section your cursor is in;
  `Esc` puts the note back exactly as it was, folds and all. `Ctrl/Cmd Alt ↑` / `↓` jump to the
  previous or next heading (in the reading view they scroll). Fold state is remembered per note
  across reloads.
- **Auto-numbered headings.** Off by default. The outline's `1.` button turns numbering on for the
  reading view, and `numbered: true` in a note's frontmatter numbers it for everyone, including on
  the blog. Nothing is written into your markdown.

## Attachments

Your vault is not only `.md` files, and the sidebar says so: images, PDFs, audio, video and
everything else sit under their folder beneath the notes, each with a glyph for its type, and the
footer counts both ("1,388 notes · 1,176 files"). Clicking an image opens a lightbox: natural size
capped to the window, filename, pixel dimensions and file size, `←`/`→` through the rest of that
folder ("3 / 47"), `Esc` or a click outside to leave. PDFs open in a browser tab, audio and video get
an inline player, and anything else offers a download. The paperclip in the sidebar footer hides
them all again, and remembers.

Paste or drop an image into the editor (or drag one from a file manager) and it uploads and lands as
`![[name.png]]` at the cursor, with an "Uploading…" placeholder holding the spot while it is on its
way. PDFs, audio and video are accepted too. Where a paste or a drop into the document lands is a
[setting](configuration.md#attachments) with four modes; a drop onto the sidebar tree is a filing,
and lands in the folder it was dropped on.

**Unused attachments.** `Ctrl/Cmd P` → **Unused attachments** lists every file in the vault that no
note points at, with its size, so stale screenshots can be told apart from the figures an essay still
embeds. "Used" means what the indexer means by it, the same count that decides what a visitor may
fetch and what a delete would break: embedded (`![[x.png]]`, `![alt](x.png)`), linked (`[[x.pdf]]`),
a note's `banner:`, a tracker's `cover:`, a folder's icon (from settings or the folder note), a
library path's cover, a drawing's exported svg, and the site's logo, favicon and home banner. Tick
the rows (or *Select all*), read the total, and **Move to trash**: each file goes to `.trash/`
through the same door the tree's *Delete file* uses, with its origin recorded, and the toast's
**Undo** restores the whole sweep. Nothing here erases; the [trash browser](#deleting-and-the-trash)
is where that decision lives. The list stops at 2,000 rows and says so when the vault holds more:
sweep those and reopen for the rest. Admin-only, and `.trash/` itself is never listed.

## Deleting, and the trash

**Deletes say what they are taking.** Notes, attachments *and* folders all delete the same way: the
default *moves* the thing to the vault's `.trash/` folder, and a quieter "Delete permanently" beside
it erases instead, behind a second confirmation that is red at rest. Every dialog is built from what
the indexer actually knows, so the folder dialog reads "0 notes and 4 files" rather than counting
markdown and stopping. When something that *survives* the delete still points inside it, the dialog
says so and names it: "4 files in here — embedded by "The Moved Essay". Those embeds break."
(Deleting a note names the notes that link to it, the same way.) Attachments have their own "Delete
file" on their tree row, which they never had before: removing one stale image used to mean
deleting the folder around it.

**Trash browser.** `Ctrl/Cmd P` → **Open trash** lists everything in `.trash/`: what is inside each
entry, how big it is and when it went, with **Restore** and a permanent erase per row, plus "Empty
trash". Restore puts each entry back **where it came from** (Astrolabe records the origin at delete
time) and tells you up front when that spot is taken (it lands beside it) or unknown (it lands at the
vault root). Admin-only, and `.trash/` is
[never committed to your git remote](backup-and-sync.md#what-sync-never-stages).

## Reorganizing by dragging

Drag a note or a whole folder onto any folder row, onto an ancestor, or onto the vault's name to send
it back to the top level. A valid target lights up in the accent colour; one that cannot take the
drop (a folder onto its own descendant, or the folder it is already in) is refused in red rather
than staying quiet. Hovering over a collapsed folder mid-drag **springs it open** after a moment, so
you can drill into a nested destination without letting go; the tree auto-scrolls near either edge,
and dropping onto a folder that is still shut works fine.

**Every link follows**: `[[wikilinks]]` written as paths, `[markdown](links)`, and the relative
`![embeds](../Media/x.png)` inside the notes that moved. A folder move of 1,214 notes repairs 246
notes' links and the indexes are updated before the move reports back, so search, the graph and the
public site are correct the moment it lands. A name collision asks for another name instead of overwriting, and every
move raises a toast naming both ends **with Undo**. No mouse? "Move to…" in a row's right-click menu
and in the command palette opens a filterable folder picker that does exactly the same thing, and so
does dropping images straight from your desktop onto a folder row. The picker ends in a pinned
**New folder…** row, named after whatever you typed into the filter, so "there is nowhere to put
this" is a folder away rather than a dead end; it does not offer your attachments folder as a home
for a note.
