# Templates, banners & notes

*Note banners, Obsidian-compatible templates, heading sections, attachments and the trash.*

← [Back to the README](../README.md) · [All docs](README.md)

---

## Note banners

Give any note a hero image with a `banner:` frontmatter line. It renders as a wide hero above
the note in the editor and reading view, and in blog mode as the article hero and a
right-aligned thumbnail in the post list. A published note's banner attachment is automatically
visitor-fetchable; unpublished notes' attachments stay invisible as always.

**Four forms are accepted, tried in this order** — the same ladder every image reference in
Astrolabe climbs, including the site logo and the dashboard hero:

| What you write | What it finds |
| --- | --- |
| `banner: https://example.com/cover.jpg` | the URL itself (https only — an `http://` banner would be mixed content, so it is refused rather than rendered) |
| `banner: Media/cover.png` | that exact path from the vault root |
| `banner: cover.png` *(note in `Trips/`)* | `Trips/cover.png` — beside the note, where Obsidian keeps a note's own images. `img/cover.png` and `../shared/cover.png` work the same way |
| `banner: cover.png` *(no such neighbour)* | any `cover.png` in the vault, resolved exactly as `![[cover.png]]` resolves it: case-insensitive, shortest path wins |

A **bare filename is the form most people write**, and it used to be the one form that did not
work — it was sent to the vault root and 404'd — while wikilinks and embeds had always found a
file by name from anywhere. It works now, and so does the note's own folder.

If the value names nothing, **you are told**. As the signed-in admin the hero is replaced by a
dashed card naming the value that failed, with **Set banner…** beside it. Visitors see nothing
at all: a stranger cannot fix your typo, and blog posts fall back to the generated gradient.
(Before this, a broken banner deleted itself, which made a typo and "no banner" identical.)

As admin you rarely touch the YAML: the command palette's **Set banner…** (also a quiet button
on the properties card) opens a modal to paste a URL, pick from the vault's image attachments,
or upload a file (drag & drop or picker; png/jpeg/webp/gif/svg, 10 MB max, bytes are sniffed —
the upload lands wherever the [Attachments](configuration.md#attachments) setting points,
measured from the note's own folder — under *Same folder* the banner sits beside the note). The
write is a surgical one-line frontmatter edit —
the rest of the file is untouched. Posts without a banner get a subtle generated gradient in
the blog list and article hero (`BANNER_FALLBACK=none` turns that off).

## Templates

Point Astrolabe at a folder of template notes and it fills them in for you — the same syntax
Obsidian's core Templates plugin uses, so **the templates in a vault you brought over work
unmodified**.

The folder is `Settings → Publishing → Templates folder`. Leave it empty and Astrolabe finds one
itself, as long as the answer is unambiguous: a folder called `Templates`, `_templates` or
`قوالب`, with a leading ordering prefix allowed (`4 - Templates`, `04. Templates`). Two
plausible candidates and no root-level tie-break means it stays unset rather than guessing —
a wrong guess would hide real posts from your blog. **Notes in the templates folder never
appear in the post list** (or RSS, or the dashboard), even when they carry `publish: true`
so the notes made from them inherit it.

Two commands, both in the palette, both on a keystroke, and "New note from template…" is also
in the tree's right-click menu on any folder (where it creates *into that folder*):

| | |
| --- | --- |
| **Insert template…** (`Ctrl/Cmd Alt T`) | drops the template's body at the cursor of the open note |
| **New note from template…** (`Ctrl/Cmd Alt Shift T`) | asks for a name, creates the note with the template applied, and opens it |

Both open a picker that **previews the template with its placeholders already filled** — what
is about to land, not what the file says. (`Ctrl/Cmd Alt` rather than the obvious `Ctrl/Cmd T`:
that one is the browser's new tab, and `Ctrl/Cmd Shift T` reopens a closed one. Neither is
takeable.)

**Placeholders** — Obsidian's, plus two:

| Placeholder | Becomes |
| --- | --- |
| `{{date}}` | `2026-08-16` |
| `{{time}}` | `05:23` |
| `{{date:FORMAT}}` / `{{time:FORMAT}}` | moment-style tokens: `YYYY MM DD HH mm ss`, `MMMM`/`MMM` month names, `dddd`/`ddd` weekdays, `A`/`a`, and `[literal text]` in brackets. Named formats too: `{{date:long}}`, `full`, `medium`, `short` |
| `{{title}}` / `{{Title}}` | the new note's filename, as typed and in Title Case |
| `{{hdate}}` / `{{date:hijri}}` | the Umm al-Qura Hijri date |

Anything else is **left exactly as written** — `{{cursor}}`, a Templater expression, a stray
`{{`. Blanking a token Astrolabe does not implement would destroy text you typed and hide the
fact that the template expects something we do not do.

Dates follow the site's settings where a reader can see them and stay machine-shaped where
something has to parse them: the named formats (`{{date:long}}`) and `{{hdate}}` use
`settings.dateCalendar` and the instance's numeral system, while the token formats stay
Gregorian and Western-digit — `{{date}}` is `YYYY-MM-DD` by Obsidian's definition, and it
lands in `date:` frontmatter lines and filenames where `١٤٤٨-٠٢-١٣` parses as nothing. See
[Hijri dates](arabic-and-rtl.md#hijri-dates).

**Frontmatter is merged, never stacked, and identity is never copied.** Inserting into a note
that already has a `---` block folds the template's keys into it — one block, no key twice,
and **the note's own values win** (its `publish:`, its `date:`, its `tags:` are facts about
that note; the template's are defaults). Identity keys (`id`, `uuid`, `guid`, `permalink`,
`slug`) are **minted fresh**, in the same shape as the template's own value: a uuid stays a
uuid, a 16-digit timestamp stays 16 digits. A template carrying `id:` used to hand the same id
to every note ever made from it.

**Template for new notes** (also in Settings) applies one template to every note created from
inside Astrolabe — `Ctrl/Cmd N`, the sidebar's `+`, the tree menu. Off by default: new notes are
born empty, as they always were.

## Daily and weekly notes

`Ctrl/Cmd Alt D` (or *Open today's daily note* in the palette) opens today's note, creating it if
it is not there yet. Where it lives and what it is called are settings, in Settings → Vault under
*Daily & weekly notes*:

| Setting | Default | Notes |
| --- | --- | --- |
| Daily notes folder | `daily` | Empty for the vault root. |
| Daily note name | `YYYY-MM-DD` | Tokens `YYYY`, `MM`, `DD`, `[literals]`, and `/` for subfolders: `YYYY/YYYY-MM-DD` files each year in its own folder. Always Gregorian and Western digits — a file name is an address, and the Hijri date is printed beside it in the sidebar on a Hijri instance. |
| Daily note template | *(the template for new notes)* | Applied when the day's note is created. |
| Weekly note name | `YYYY-[W]ww` | `ww` is the ISO week; the note lives in the daily folder. Type `off` to turn weekly notes off. |
| Weekly note template | *(none)* | Applied when the week's note is created. |

The palette also has **Yesterday's note**, **Tomorrow's note** and **This week's note**. When the
open note is itself a daily note, yesterday and tomorrow walk from *that* day, so a journal can be
read backwards a day at a time. A vault that already keeps `Journal/2026/2026-09-13.md` keeps
working: set the folder to `Journal` and the name to `YYYY/YYYY-MM-DD`.

**On this day.** Under the backlinks, the right panel lists what you wrote, published or finished on
this day in earlier years — a strip that reads the archive back to you, drawn from the notes' own
dates and the trackers' `finished:` lines, nothing stored. The Routines page opens with the same.


- **Heading folding** — a chevron sits beside every heading (visible at rest, not on hover — a
  control nobody can see is a control nobody finds, and there is no hover on a phone); click it,
  or `Ctrl/Cmd Shift [` / `]`, to fold a section down to a "N folded lines" chip.
  `Ctrl/Cmd Alt [` / `]` folds or opens everything.
- **Section actions on every heading** — a ⋯ beside the fold chevron (and a right-click on any
  heading line, or on any outline row) opens one menu: copy a `[[Note#Heading]]` link to the
  section, copy the section as Markdown, **extract it into a new note** with a `[[link]]` left
  standing where it was, fold or unfold everything below it, select it, focus it.
- **Drag a heading in the outline to move that whole section** — heading, body and every
  subheading travel as one block, with a drop rule showing the depth it will land at *before* you
  let go; drag toward the reading direction to nest deeper, or rest on a row for a moment to drop
  inside it. One transaction, so `Ctrl/Cmd Z` takes it back — and the toast carries an Undo button
  too. `npm run check-sections` property-tests the rewrite against frontmatter, nested headings
  and code fences containing `###` lines — see [Development](development.md).
- **Focus one section** — `Ctrl/Cmd Alt F` collapses everything except the section your cursor is
  in; `Esc` puts the note back exactly as it was, folds and all. `Ctrl/Cmd Alt ↑` / `↓` jump to the
  previous or next heading (they scroll, in reading view). Fold state is remembered per note across
  reloads.
- **Auto-numbered headings** — off by default; the outline's `1.` button turns them on for reading
  view, and `numbered: true` in a note's frontmatter numbers it for everyone, including on the
  blog. Nothing is written into your markdown.

## Attachments

Your vault is not only `.md`, and the sidebar says so: images, PDFs, audio, video and everything
else sit under their folder beneath the notes, each with a type glyph, and the footer counts both
("1,388 notes · 1,176 files"). Clicking an image opens a lightbox — natural size capped to the
viewport, filename, pixel dimensions and file size, `←`/`→` through the rest of that folder
("3 / 47"), `Esc` or a click outside to leave. PDFs open in a browser tab, audio and video get an
inline player, anything else offers a download. The paperclip in the sidebar footer hides them all
again, and remembers.

Paste or drop an image into the editor (or drag one from a file manager) and it uploads and lands
as `![[name.png]]` at the cursor, with an "Uploading…" placeholder holding the spot while it is
in flight. PDFs, audio and video are accepted too. Where a paste or a drop into the document lands
is a [setting](configuration.md#attachments) with four modes; a drop onto the sidebar tree is a
filing, and lands in the folder it was dropped on.

**Unused attachments** — `Ctrl/Cmd P` → **Unused attachments** lists every file in the vault that no
note points at, with its size, so the stale screenshots can be told from the figures an essay still
embeds. "Used" means what the indexer means by it — the same walk that decides what a visitor may
fetch and what a delete would break: embedded (`![[x.png]]`, `![alt](x.png)`), linked (`[[x.pdf]]`),
a note's `banner:`, a tracker's `cover:`, a folder's icon (from settings or the folder note), a
library path's cover, a drawing's exported svg, and the site's logo, favicon and home banner. Tick
the rows (or *Select all*), read the total, and **Move to trash**: each file goes to `.trash/`
through the same door the tree's *Delete file* uses, with its origin recorded, and the toast's
**Undo** restores the whole sweep. Nothing here erases; the [trash browser](#deleting-and-the-trash)
is where that decision lives. The list is capped at 2,000 rows and says so when the vault holds more
— sweep those and reopen for the rest. Admin-only, and `.trash/` itself is never listed.

## Deleting, and the trash

**Deletes say what they are taking.** Notes, attachments *and* folders all delete the same way:
the default *moves* the thing to the vault's `.trash/`, and a quieter "Delete permanently" beside
it erases instead, behind a second red-at-rest confirmation. Every dialog is built from what the
indexer actually knows, so the folder one reads "0 notes and 4 files" rather than counting
markdown and stopping — and when something that *survives* the delete still points inside it, the
dialog says so and names it: "4 files in here — embedded by "The Moved Essay". Those embeds
break." (Deleting a note names the notes that link to it, the same way.) Attachments have their
own "Delete file" on their tree row, which they never had: removing one stale image used to mean
deleting the folder around it.

**Trash browser** — `Ctrl/Cmd P` → **Open trash**: everything in `.trash/`, what is inside it,
how big it is and when it went, with **Restore** and a permanent erase per row plus "Empty trash".
Restore puts each entry back **where it came from** — Astrolabe records the origin at delete time —
and tells you up front when that spot is taken (it lands beside it) or unknown (it lands at the
vault root). Admin-only, and `.trash/` is
[never committed to your git remote](backup-and-sync.md#what-sync-never-stages).

## Reorganizing by dragging

Drag a note or a whole folder onto any folder row, onto an ancestor, or onto the vault's name to
send it back to the top level. The valid target lights up in the accent; one it cannot take — a
folder onto its own descendant, or the folder it is already in — is refused in red rather than
staying quiet. Hovering a collapsed folder mid-drag **springs it open** after a beat so you can
drill into a nested destination without letting go, the tree auto-scrolls near either edge, and
dropping onto a folder that is still shut works fine.

**Every link follows**: `[[wikilinks]]` written as paths, `[markdown](links)`, and the relative
`![embeds](../Media/x.png)` inside the notes that moved — a folder move of 1,214 notes repairs 246
notes' links and is indexed before the request answers, so search, the graph and the public site
are correct the moment it lands. A name collision asks for another name instead of overwriting,
and every move raises a toast naming both ends **with Undo**. No mouse? "Move to…" in a row's
right-click menu and in the command palette opens a filterable folder picker that does exactly the
same thing — as does dropping images straight from your desktop onto a folder row. The picker ends
in a pinned **New folder…** row, named after whatever you typed into the filter, so "there is
nowhere to put this" is a folder away rather than a dead end; it does not offer your attachments
folder as a home for a note.
