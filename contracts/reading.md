# Reading — the reading view, the library, the books

The reading view and what it draws around a note — banners, justification, the meta line, print — and the readers: the library, the PDF book reader and EPUB. Part of the module contracts (see [CONTRACTS.md](../CONTRACTS.md) for the map). **Edit the area, append nothing:** a change to how something works is written HERE, in the section it changes, and the old sentence goes; a release gets one line in [releases.md](releases.md), never an addendum.

## Banner resolution — one ladder, four rungs (client/banner.ts, GET /api/banner)

A `banner:` value is a reference to an image, and until now it was the ONLY reference form in
the product with its own rule. `bannerSrc()` sent anything that was not an `https://` URL
straight to `/api/file?path=<value>`, so a BARE FILENAME — the form every Obsidian user writes,
and the only one with no autocomplete behind it — 404'd unless the image happened to sit at the
vault root, while `[[wikilinks]]`, `![[embeds]]` and `![](Media/x.png)` had always found a file
by basename from anywhere. The ladder, in order:

1. an `https://` URL — used as-is. Any OTHER scheme (`http:`, `data:`, `javascript:`) resolves
   to null rather than being mangled into a vault path: a mixed-content hero is worse than no
   hero, and `normalizeRel("http://x/y.png")` produces a path that can only 404.
2. an exact vault-relative path, case-insensitively (`attachmentsByPathLower`) — a value typed
   from what a file manager showed must not be the one form that is case-SENSITIVE.
3. that path relative to the referring note's OWN folder — `cover.png` beside the note,
   `img/cover.png` under it, `../shared/cover.png` beside its parent.
4. the basename, through `resolveEmbed()` — the same case-insensitive, shortest-path-wins index
   the embed layer uses.

`server/indexer.ts resolveImageRef(value, fromDir?)` is the ONE implementation. `resolveBanner()`
(post list, blog hero, og:image, the published-attachment allowlist) is a wrapper that passes the
note's own folder; `settingsAssetPaths()` runs the logo/home-banner/favicon values through it too,
because allowlisting only the literal string is how a logo the admin can see in the settings panel
404s for every visitor. `GET /api/banner?value=&note=` serves the client, visitor-scoped to files
`/api/file` would actually hand over (allowlisted attachment or settings asset) — a miss is
`200 {path:null}`, like `/api/resolve`, because a typo'd banner is an ordinary state of a vault.
The client caches per `(value, note)` pair, misses included, and drops the cache wherever
`clearBrokenEmbeds()` runs: the same events invalidate both, the visitor-preview toggle included.

### A banner that names nothing is NEVER silent — and never loud at a visitor

`buildBannerEl()` used to attach `img.onerror → wrap.remove()`. A typo and "no banner at all"
therefore rendered identically, on the one surface whose entire job is to show you your own file:
the author writes `banner: cover.png`, nothing appears, and nothing distinguishes a broken value
from a feature that is not working. Split by AUDIENCE, exactly as the embed layer splits its
broken-embed chip from the blog's quiet missing-image card:

- **Admin** (`buildBannerEl(value, class, {admin: true})`) — the dashed `…__missing` card: the
  same dashed-danger language as `cm-s-embed-broken`, the failing value spelled out at `--text`
  (a filename is text a reader must READ, so never `--text-faint`), and a **Set banner…** button
  dispatching the same `astrolabe:set-banner` event the properties card's action does. The fix is one
  click from the symptom. The editor is admin-only by construction; the reading view passes
  `useStore.getState().admin`, which is already false inside visitor preview.
- **Visitor** — nothing at all. A stranger cannot act on it, and a dashed box on a published
  article is the author's mess on the reader's page. The blog's own hero/thumbnail keep falling
  through to the generated gradient.

`useBannerSrc()` (client/components/BannerImg.tsx) is the React half — the logo, the dashboard
hero, the settings image field and both banner modals read a typed value through it. Its `pending`
state is load-bearing: "we have not asked yet" must not paint as "this names nothing".

## Generated banners on a theme with no hue to spend (client/banner.ts)

Four light themes shipped `--banner-tint: 0%` (parchment, sandstone, linen, solar) — they hold 34%
now, with the accent floor at 16% (`client/banner.ts`) — and there `hue()` collapsed to pure
`--accent` for all three blobs — verified in the browser: the two extreme hash
hues resolve to the same colour on all four, and to different ones on iron-gall's 45%. What was
left to tell two posts apart was blob POSITION (invisible under a 55% accent floor: three blobs of
one colour on one ground is one wash wherever you put them), the base gradient's angle, and a rule
angle hashed over 20–69° — ONE QUADRANT — with a CONSTANT gap and a constant blob strength. Six
consecutive parchment thumbs at their shipped 132×88 came out the same beige hatched sticker.

- **Three more levers, and not one of them is a colour**, so all three survive a zero tint: the
  rule angle takes two bands (15–75° and 105–165°, never level, never steep) so two posts can be
  hatched in MIRRORED directions; the rule SPACING is hashed; and the blobs carry a per-post
  STRENGTH and reach. Measured over six titles: shipped gave gap 7 / strength 46 / spread 58 for
  every one of them and angles 26–65 with a duplicate pair; now gaps 4–8, strengths 40–58,
  spreads 58–66 and angles 18–156, with every post differing on at least two levers.
- **Card ↔ hero unity is preserved by construction.** Angle, spread and the strength scale are
  shared between the two sizes; only the gap (in the 0.64 ratio the shipped 7:11 already held) and
  the existing `boost` differ, because 130px of anything reads flatter than 780px of it.

## The missing-banner card at 390 (client/styles/app.css)

`--text` on the failing value, because "a filename is text a reader must READ", was already the
rule — but `min-width: 0` plus `overflow-wrap: anywhere` let that value take the whole shortfall of
a phone-width row, where the icon, the label and the **Set banner…** button all compete on one
flex line and the value is the only item allowed to shrink. It went to 24.6px wide and broke ONE
GLYPH PER LINE — "kyo / to- / cov / er. / png" — stretching the card from 53.8px to 129.6px. A
`min-width: 14ch` floor gives the row a reason to wrap: the button drops to the next line and the
name keeps a readable measure (measured: 121.4px and one line at 390, 180.1px at 360, card height
back to 85.2px; 768 and 1440 unchanged at 53.8px). `anywhere` stays, for the pathological
80-character filename that still has to fit somewhere.

## Justification needs a paragraph (client/textLayout.ts, styles/textlayout.css)

Most vaults that have been through a plain-text editor are wrapped at a fill column, and every one
of those source newlines is a forced break here (the editor draws a `.cm-line`, the reading view
and the blog draw a `<br>`). A forced break ends a LINE without ending the BLOCK, so a source line
wider than the measure is broken by the browser, its first half stretched to the far margin as if
it were mid-paragraph and its remainder left beside it as a two-word stub — all the way down the
note. Soft-wrapped prose, where one source line is one paragraph, justifies beautifully.

- **The note's SOURCE decides, once, and all three surfaces read the same answer off the same
  attribute** (`data-note-hardwrap`) — which is the entire point of this module. `isHardWrapped()`
  counts prose lines that sit in a RUN of two or more, skipping frontmatter, fenced code,
  headings, lists, quotes, table rows and link definitions; four such lines and a 60% share are
  the bar, so one wrapped block inside an otherwise soft-wrapped essay does not decide.
- **It is stamped only for the alignment it changes.** A hard-wrapped note that is centred, or
  flush, is a hard-wrapped note nothing is wrong with.
- **The chip says why.** A note whose frontmatter says `align: justify` still reads "Justified" —
  that is what its frontmatter says, and the chip names the frontmatter — but the tooltip now adds
  "set flush — this note's paragraphs are wrapped by hand", because a page that does not look
  justified with nothing on screen explaining it is the invisible-state trap this bar exists to
  close.

## A separator that cannot be read as a digit (client/metaSep.tsx)

The blog's meta line, the article header, the app's status bar, the graph HUD and the attachment
caption all print counts side by side and marked the boundary with U+00B7. At the 12–13px those
lines are set in, in the shipped Arabic face, that glyph is INDISTINGUISHABLE FROM `٠` — and it
sits flush against a run of Eastern Arabic digits. Measured on an Arabic instance with
`dateCalendar: both`: the status bar's DOM read `٥٦ كلمة · ٣١٠ حرفًا` and PAINTED as ٣١٠٠ —
310 characters read as 3,100, on the one surface the Hijri work exists to make legible.

- **The switch is on the NUMBERING SYSTEM, not the language.** An Arabic instance configured
  `ar-EG-u-nu-latn` prints Latin digits and a tick is safe there; the default `arab` numerals are
  the case that breaks.
- **What replaces it is not another character.** A character beside digits is how this happened.
  It is the HAIRLINE the status bar already marks its own groups with — 1px `--border`, the same
  rule at the same weight — which cannot be read as anything at all. English is untouched, byte
  for byte: "95 words · 518 chars", "1 August 2026 · 86 words · 1 min read".
- **`metaSepText()` is the string form**, for the two places an element cannot go (a joined
  attachment caption, a `title` attribute). There the Arabic case takes `،`, which is the
  punctuation the language already uses for this and is not a digit in any face.

## Embeds you can pick up in the reading view (client/embedPickup.ts, render.ts)

The editor half and the shared arithmetic are in [editor.md](editor.md), "Embeds you can pick up";
this is what the reading view adds.

- **Every file embed carries its source.** The renderer stamps `data-embed-src` — the embed EXACTLY
  as written, `![[x.png|300]]` or `![alt](path)` — on what draws it: the block figure, the inline
  `<img>`, the file card, the audio player, the drawn page. Async replacements carry it over (a
  drawing's live `<svg>`, the pdfPage card that replaces its stand-in: `Object.assign(dataset)`).
  Note transclusions carry none, and embeds INSIDE a transclusion card belong to that note and are
  skipped.
- **Top-level blocks carry their lines.** At depth 0, `renderBlocks` stamps each element one pass of
  its loop appended with `data-src-start` / `data-src-end` (0-based lines of the FILE: the
  frontmatter offset and the `<!--SR:…-->` lines `withoutSrComments` drops are mapped back through
  `Ctx.lineMap`). A drop lands at the boundary of the block under the pointer (top half: before its
  first line; bottom half: after its last), shown by a fixed `.s-embed-dropline` the width of that
  block in the editor's drop-cursor colour; the move is found in the file by the embed's text within
  its block's lines. The same map makes a line landing block-precise (editor.md, "Landing on the
  line").
- **Delegated, installed once** from ReadingView.tsx on `.s-reading[data-note-path]` (the blog's
  article has no `data-note-path` and keeps the browser's own behaviour): `pointerdown` makes the
  embed draggable for a pointer, `dragstart` lifts it, `dragover` / `drop` land it (admin only),
  `contextmenu` opens the menu — standing down when text is selected, since the browser's menu copies
  a selection better. Pictures get a tab stop (`focusableEmbeds`) so Shift+F10 has something to open
  the menu on; a link-shaped embed already has one.

## Print & PDF (`client/reading/print.css`, `client/print.ts`, gated by `npm run check-print`)

Obsidian's third most-demanded feature, and this product shipped with **zero** `@media print` rules
across twenty-seven stylesheets — so a note printed the ROOM: a viewport-locked grid clipped to one
sheet, an inch of sidebar, a status bar, and out of a dark theme a black rectangle with the type
dropped out of it by the printer's own background suppression.

- **TWO SURFACES, TWO ANSWERS, and the difference is not a compromise.** The **blog article prints
  itself, in place**: that page IS the document, hero and byline and tags, its DOM is complete, and
  the person printing a published piece is usually not its author and has no command palette on
  their page — their own `Ctrl/Cmd P` has to work with no JavaScript from us. The **app prints a
  rendered copy** into `.s-print`, built outside `#root` by `client/print.ts`, with `#root` hidden
  for the duration. The app shell cannot be printed in place at any price: it is a grid of up to N
  panes locked to the viewport, its centre column is its own scrollport, and CodeMirror renders
  only the lines near the caret — printing the editor's DOM prints the fragment that happened to be
  on screen, which is a silently truncated document rather than a layout bug.
- **THE HOST IS `display: none` ON SCREEN, always** — declared outside the media block, never a
  class toggled at print time. A print host that can be seen being built is the theme-swap flash
  this codebase refuses everywhere else.
- **THE COPY COMES FROM, IN ORDER:** the rendered document already on screen in the FOCUSED pane
  (cloned — hydrated maths, drawn tracker cards, decoded images, and a clone cannot disagree with
  what the reader is looking at); else the editor's live buffer through `renderNoteContent`, the
  one renderer; else the note on disk, which only the command can reach because `beforeprint`
  cannot await a fetch.
- **`beforeprint` IS THE ENTRY POINT, not the command.** It fires synchronously and Chrome
  paginates without waiting on a promise, so `client/print.ts` is imported for its side effect by
  `Editor.tsx` and `ReadingView.tsx` — the chunks that are already loaded whenever there is a
  document to print — and by `import()` from the palette, App.tsx and the desktop menu. It is in
  no first paint, and an anonymous blog reader never fetches a byte of it.
- **THE PAPER PALETTE IS DECLARED, NOT SWITCHED.** `parchment`'s inks — the light room the product
  has already solved for contrast, callouts and syntax — laid on white paper, redefined on `:root`
  inside `@media print`. No theme is forced, nothing changes on screen, and the reader's chosen
  room stays the screen's. `!important` on those tokens and on every structural rule that a screen
  rule also declares, for two reasons: `@import` is legal only at the top of a file, so reading.css
  wins on order at equal specificity; and the LAST stylesheet on any instance belongs to its owner
  (`ASTROLABE_DATA/custom.css` and a custom theme's injected block are both served at runtime). Rules
  that only ADD — the page box, every `break-*` — carry none.
- **THE PAGE BOX IS THE MEASURE.** `@page { margin: 20mm 25mm 22mm }` and nothing inside sets a
  width: a centred max-width column inside a page box is a second measure inside the first. The
  margins are symmetric because `@page` has no logical margins in any shipping engine, so an
  asymmetric binding edge would be silently wrong in one of the two directions forever.
- **THE PAGE MIRRORS.** The host's `dir` is the note's — a pinned `dir:` in frontmatter if it has
  one, else the first strong character of its PROSE. The properties card is REMOVED from the host
  rather than hidden, and that is what makes the second half true: it would otherwise be the first
  text in the document, and an Arabic note carrying `publish: true` printed as a left-to-right page
  because the first word in its DOM was the English word "Properties".
- **WHAT THE PDF GETS THAT EVERY PLUGIN GETS WRONG.** Chrome builds a PDF's bookmark outline from
  real `h1`–`h6` and its link annotations from fragment `href`s whose target exists — and from
  nothing else. So the reading renderer emits a real `href` on footnote references, on their return
  arrows, and (resolved in a post-pass, once the ids exist) on a same-note `[[#Heading]]`. The
  delegated click handler still `preventDefault`s, so the smooth scroll on screen is unchanged, and
  no rule here may replace a heading with a styled div.
- **A FOLDED CALLOUT PRINTS ITS BODY, and a clamped transclusion prints whole.** A fold is a
  reading posture, not an edit; printing a title with its text missing is silent data loss, which
  is the one failure a print feature must not have.
- **A WIKILINK IS PLAIN TEXT ON PAPER** (it points into a vault the person holding the sheet does
  not have, and a broken one's dashed danger tint is an invitation paper cannot accept); an
  external link prints its destination after it, except inside a heading, where a url would land in
  the bookmark outline.
- **INK ONLY WHERE THE COLOUR IS THE MEANING.** `print-color-adjust: exact` on exactly four things
  — a callout (its kind), a quotation's bar, a highlight, and the divider, which is content rather
  than furniture. Everything else lets the printer drop its backgrounds.
- **NOTHING TO PRINT SAYS SO.** From the graph or the empty state the host holds one line instead
  of a blank sheet.
- The chord is **`Ctrl/Cmd Alt P`**, in the ledger and in `docs/keymap.md`, because `Ctrl/Cmd P` is
  the palette and `Ctrl/Cmd Shift P` publishes. In the BLOG shell App.tsx swallows neither, so a
  visitor keeps their browser's print key.

## The library (shared/library.ts, server/library.ts, client/library/)

**A ROOT SAYS IT ONCE (3.19).** Twelve rows in `settings.library.paths` described twelve folders
sitting under two parents, and in seven of them every field was what the folder's own name already
said — with a thirteenth row waiting for the thirteenth book. `settings.library.roots[]` (≤ 8,
`{id, folder, kind}`) names the PARENT instead: every immediate subfolder of it holding a published
note is a path of that kind, titled by its name, addressed by its title, covered by its tracker.
The three layers each do one job and are read in this order — the ROOT ("everything published under
here is a book"), the FOLDER NOTE (`title`, `description`, `cover`, `source`, `hidden`, `library`,
`slug`: vault-portable facts about one folder, and the reason a root is not the last word), the ROW
(the owner's override of one folder, still winning field by field). The schema is a SUPERSET and
`libraryRefs()` still reads rows first, so an upgraded server with no roots produces a byte-identical
shelf: nothing is rewritten at boot, and the fold of now-redundant rows is OFFERED in the panel, not
performed — folding them is a visible reorder (rows keep their own order, a root's children follow
by title within their kind) and a reorder nobody pressed for is not a migration. A root may not sit
inside another root, nor inside a row's folder, nor be the vault itself; a root CONTAINING a row's
folder is the whole design.

**A DERIVED PATH HAS AN ADDRESS OR IT IS NOT PUBLISHED (3.19).** `derivedSlug(title, metaSlug,
taken)`: the folder note's `slug:` first, then `suggestSlug(title)`, and otherwise NOTHING. A row's
slug claims first and is never displaced. The old rule was `suggestSlug(title) || "path"` plus a
`-2`, `-3`… counter assigned in folder order, and on this vault three Arabic-titled books would all
have landed on `/library/path`, `/library/path-2`, `/library/path-3`, renumbered by whichever book
existed that morning — with every reader's saved progress keyed to the slug. A URL the owner would
never paste is not an address, and not publishing is the visitor-safe default: those folders are not
on the shelf today either, and their notes stay on the blog. The settings panel lists them under
*Needs an address* with the reason, and `slug:` in the folder note is the answer that needs no row.
One function, shared, so the panel shows exactly the address the indexer will emit.

**A LIBRARY PATH IS A FOLDER, SO A FOLDER'S RENAME IS THE PATH'S (3.19).** `moveLibraryFolders()`
in server/settings.ts, called beside `moveFolderIcons()` from `/api/folder/move` and `DELETE
/api/folder`: prefix-aware over `library.paths[].folder` and `library.roots[].folder`, dropping the
row or the root on a delete, a silent no-op when nothing matches. Until it ran, renaming a book in
the sidebar left the row naming a folder the vault no longer had — `resolveLibraryPath()` found zero
lessons, the path vanished from `/library`, and every published note inside it, claimed by no lesson
folder, came back as a blog post in the home lists, the topics, the feed and the sitemap.

**A PATH IS A FOLDER, NOT A HUB.** The first design had a hub note with an ordered list of
wikilinks as the table of contents. The vault said otherwise: a book is `Books/<Book>/<Chapter
dir>/<concept notes>` and a course is `Lectures/6.824/L1..L14/<notes>`, and a hub exists only where
the reading companion has been. So `settings.library.paths[]` names a FOLDER (plus a kind, a title,
an address, a blurb, a cover, a source, a hidden flag), and `resolveLibraryPath()` reads the folder's
own structure off the index: each immediate subfolder is a unit, `unitOfName()` reads the kind and
number off the folder's name (`L3`, `B2| Chapter 40`, `Week 2`; a sorting prefix `X| ` is stripped),
every published note inside is a lesson in natural title order with a note named like its unit
first, and notes at the path's own root are the introduction. No note is asked for any frontmatter
beyond `publish: true`.

**A LESSON'S LINKS STAY ON THE PATH.** The lesson page (client/library/LibraryPages.tsx)
listens for clicks in the CAPTURE phase before `onRootClick`: a `.s-rv-wikilink[data-target]`
that resolves (`resolveLink`) to a note that is a lesson of any path on the shelf goes to
`libraryUrl(slug, n)` through `go()`; anything else falls through to the renderer's own handling
(the note's page, or the "not published" toast).

**A LESSON IS NOT A POST.** `posts()` (server/indexer.ts) skips every published note under a
folder `libraryLessonFolders(settings.library)` names — the enabled library's visible paths,
boundary at the slash (`isLibraryLesson`) — in the admin list and the visitor list alike. Before
2.8.1 publishing a book's chapters put them all on the blog home, in the topics and in RSS, which
the owner met as "my chapter notes went to be actual blog posts" the moment they toggled the door
(the door had nothing to do with it; the feed had never excluded them). The note's own URL still
renders; hidden paths and a disabled library give the notes back to the blog.

**A COVER IS SERVED ON THE SHELF'S TERMS.** `/api/file` answers a visitor for a published note's
attachments (the allowlist walk in server/indexer.ts) AND for `libraryCoverPaths(settings.library)`
— the vault-relative covers of the enabled library's visible paths — checked LIVE in
`isAllowedAttachment()`, because the allowlist cache is dropped only by index mutations and a cover
set in the panel moves no file. Https covers are not files and are not listed. **And the path has to
have a lesson (3.19):** the refs are filtered to those with a published note under the folder, the
same question `resolveLibraryPath()` answers with null, because `library: book` plus `cover:` in a
folder note with nothing published handed an anonymous caller a picture out of a folder of drafts
that no page on the site linked to. `unreferencedAttachments()` stays UNFILTERED: the agreement
between the two walks is one-directional (nothing the allowlist serves may be called unused), and
filtering there would offer the owner's cover art for deletion. A folder note's `source:` is judged
by the row's own https regex for the same reason — it ends up in an `href`.

**THE FIRST /api/me DECLARES THE STORED VISITOR LANGUAGE.** `loadMe()` calls
`api.setReaderLang(readVisitorLang())` before the boot request when nothing has been declared yet
(`api.hasReaderLang()`); it used to set the header only from the RESOLVED language after the
answer, so the boot request carried none, the server scoped it to the site language, and on an
Arabic site a visitor switched to English lost the library door on every refresh (2.8.2). The
resolved language still overwrites it; the server ignores the header for an admin and while the
toggle is off.

**THE SHELF IS LANGUAGE-SCOPED LIKE THE FEED.** On a site whose language is Arabic with the
filter on `follow`, a visitor sees the English books only after the ع/EN toggle; the owner, logged
in, sees them always. That is the feed's own rule, not a bug, and the reason "how do I see the
library on public?" has two answers (publish the notes; and the visitor's language).

**THE DOOR NEEDS A LESSON.** `/api/me.library` is sent only when some path has a lesson this
session may read; a path whose notes are all drafts hides the door for visitors (and the owner,
logged out, asked where the library went). The settings card prints "N of M notes published" per
path, red when M > 0 and N = 0, computed from the tree and `publishedPaths` (`loadPublished()` is
called if the set is not loaded yet). The cover field is `PathInput` (`controls/PathInput.tsx`):
the vault's images offered as you type, thumbnails in the rows, a preview beside the field once the
value names an image the vault has (never for a half-typed name — that was a 404 per keystroke).

**A PATH IS ADDED WHERE THE FOLDER IS.** The tree's folder menu has **Library…**
(`client/components/LibraryFolderPopover.tsx`, lazy, anchored like the icon picker): it fetches
settings, and either says the folder is on the shelf (open it, take it off) or offers a kind, a
title and **Put on the shelf**. `libraryRowForFolder(folder, unitNames, taken)` builds the row:
`libraryTitleOf()` strips the sorting prefix, `guessLibraryKind()` reads the subfolders through
`unitOfName()` (lectures → course, chapters → book, weeks → course) and then the address (`Lectures`
→ course, `Talks`/`Series` → series, else book), `libraryFreshSlug()` is the title's slug with `-2`,
`-3`… past the ones taken. The first path switches the library ON — a shelf nobody can reach is a
mistake, not a setting — and the toast says so. The settings editor (`LibraryPathEditor`) never
asks for a typed path: **Add a path** opens `pickFolder()` (`FolderPicker.tsx`, the move picker's
dialog and styles with the moving taken out) and builds the row the same way; each card is kind +
tools on one line, the folder as a button that reopens the chooser, title and address, a folded
"Blurb, cover and source", and the URL beside the hide switch. The first cut put seven fields and
three buttons in one auto-flow grid and the arrows landed on the hide switch.

**SCOPED LIKE THE FEED.** `libraryLessons()` in the indexer walks `publishedSet` for a visitor and
the whole index for an admin, applies the language filter and the template matcher exactly as
`posts()` does, and a path with no lesson this session may read is not sent — the hidden-folder
rule. `/api/me.library` is only the door (nav, home, title, count); the shelf is `/api/library`,
fetched once per session and shared by every page (`libraryData.ts`, the graphCache idiom).

**THE ROWS ARE JUDGED ONCE.** `libraryRowError()` / `cleanLibraryPath()` are the rule, imported by
the PATCH handler, the settings editor's validation and the read-side cleaner, on the
publicFolders terms; the list is replaced whole on PATCH because the editor holds every row.

**THE DOOR IS NOT THE BAND.** `nav` defaults on once the feature is on, `home` defaults off: the
blog stays the blog, and the library is one link away. The stock nav row places the door as a fixed
item after the collections (and counts it in `lead`, the row's arithmetic); the designed shell's
`publicNavigation()` appends a `url` item to `/library` unless the author already linked it.

**A LESSON'S LINKS STAY ON THE PATH.** The lesson page (client/library/LibraryPages.tsx)
listens for clicks in the CAPTURE phase before `onRootClick`: a `.s-rv-wikilink[data-target]`
that resolves (`resolveLink`) to a note that is a lesson of any path on the shelf goes to
`libraryUrl(slug, n)` through `go()`; anything else falls through to the renderer's own handling
(the note's page, or the "not published" toast).

**A LESSON IS NOT A POST.** No date, no tags, no comments, no related: a place ("Lesson 7 of 24 ·
Lecture 3"), the outline beside it, the previous and the next at the foot, `←`/`→` to walk it
(mirrored in RTL), and the same reading renderer the article page uses. The rail stands beside the
column only where the container has 980px (a wrapper is the container: a container query never
styles the container itself), and a closed `<details>` renders nothing whatever the stylesheet
says, so the fold's open state is measured, not styled. Progress (`astrolabe.library`) is per browser
and never sent: read paths, not numbers, so a unit added in the middle shifts nothing. The pages
are one lazy chunk; only the door, the band and the covers ride with the blog first paint.

## The book reader (`client/books/`, `server/books.ts`)

A `.pdf` or an `.epub` in the vault is a **book**, and a click on one opens a
reader, not a browser tab. The tab rendered the file perfectly well; what it
could not do is remember the page, take a keystroke, or know that the vault has
forty other books in it. Scope is reading. pdf.js is the engine for a PDF, and
this section is about that reader; an EPUB opens in the same shell with its own
engine and its own anchors — see "EPUB in the reader" below.

### A book is its BYTES, not its path

Reading state is keyed by `sha256(size ‖ first 64 KiB ‖ last 64 KiB)` of the
file (`server/books.ts::bookKey`, format validated by
`shared/bookAnchor.ts::isBookKey`). **Never by the path.**

The vault is the one directory this application does not own. Obsidian writes
to it, Syncthing and Dropbox write to it, `git pull` writes to it, and the
owner writes to it with `mv` at two in the morning. A key that only our own
rename handler maintains goes stale the first time a book is filed by hand, and
what is lost is not a cache: it is page 612 of a book someone has been reading
since March. So the identity travels IN the file, and a book that moves, or is
renamed, or arrives from another machine under a different name, is the same
book with the same position.

The sample rather than the whole file, because a scanned atlas is 400 MB and
hashing it whole costs a full read per open and per shelf listing — at 400
books, a shelf that never paints. The header and first object at one end, the
cross-reference table and the trailer (including the `/ID` array the spec asks
writers to make unique) at the other, with the exact length between them: two
different books would need identical lengths AND identical xref tables. A file
smaller than both windows is hashed whole.

The honest cost, and it is written down rather than hidden: **re-saving a book
makes a new book.** An OCR pass, a re-compression, a bookmark added in another
program — different bytes, fresh position. That is the right trade against a
path key, which loses the position every time the file merely MOVES, and moving
is the commoner event by a wide margin.

`shared/bookAnchor.ts` also defines `book:<key>#p212` — the citable reference
form. The form a NOTE carries is the wikilink at the end of that module —
`[[Ibn Khaldun.pdf#page=212&rect=…&id=…]]`, the same idea wearing the vault's own syntax, where
the id resolves to the key and the key is the bytes; `bookRef()`/`parseBookRef()` remain the
internal spelling.

### The store is in ASTROLABE_DATA. The vault keeps nothing.

`ASTROLABE_DATA/books.json`, written with the same write-then-rename shape
`server/settings.ts::persist()` uses, mode `0600`, mtime-checked read cache.
Positions are OUR bookkeeping, not the reader's content: a sidecar
`.astrolabe-reading.json` beside every PDF would be litter in a folder people
sync, grep and back up. **The PDF itself is never written to** — nothing in
`server/books.ts` opens a vault file except with mode `"r"`, and
`npm run check-books` enumerates every write call in that file (the four in
`persist()` are the whole list; a fifth fails the build — and that census now covers highlights and margin notes too, which share the file and add no write of their own).

A patch is PARTIAL and is merged (`cleanBookState(patch, prev)`): the
once-a-second scroll write carries `{ page, offset }` and cannot undo a zoom the
reader set a moment earlier. `cleanBookState` is total and never throws — a
corrupt store costs positions, and losing positions must not also mean losing
the ability to open a book.

The last write of a session goes out with `navigator.sendBeacon` on `pagehide`,
which is why `/api/books/state` answers POST as well as PUT. The commonest way
a reading session ends is closing the tab, and by then a `fetch` is cancelled in
flight.

### The routes are admin-only, and they do not serve bytes

`GET /api/books` (the shelf), `GET /api/books/one?path=`, `GET|PUT|POST|DELETE
/api/books/state?key=`. Mounted under the auth guard, and both GETs say
`assertAdminRead(c)` themselves: a shelf is an enumeration of the owner's own
directory, and a visitor shown one published page must not be able to ask what
else is in there. The PDF's bytes still come from `/api/file`, publish-gated and
`Content-Security-Policy: sandbox`'d exactly as before — this surface widens
nothing.

### pdf.js: one door, one worker, and the worker is a FILE

`client/books/pdfjs.ts` is the only module that names `pdfjs-dist`, and it
reaches the library through `import()`. The engine is ~1.1 MB and the worker
another ~1.3 MB, for a surface most sessions never open;
`scripts/check-bundle.mjs` forbids `node_modules/pdfjs-dist/` and the reader's
own components in every first-paint closure, and requires
`books/BooksSurface.tsx` to remain a chunk of its own.

**The worker is imported with vite's `?url` suffix and served from our own
origin.** The recipe every pdf.js tutorial gives — fetch the worker source, wrap
it in a `Blob`, hand over the object URL — works perfectly in `npm run dev` and
is dead in production, because the vite dev server sends no CSP and this origin
sends `default-src 'self'` with no `blob:` anywhere in it. A feature that works
for its author and for nobody else is the worst failure available here, so
`SHELL_CSP` states `worker-src 'self'` out loud and `npm run check-books`
asserts all of: the `?url` import, `workerSrc` set from it, no `blob:` in the
policy, and no `createObjectURL` near the worker.

`script-src` carries `'wasm-unsafe-eval'` — the NARROW token, never full
`'unsafe-eval'`. pdf.js decodes JBIG2 and JPEG 2000 in WebAssembly, and those
two formats are every scanned book in the world; without the token a scanned
PDF renders as blank pages.

Four side-data directories (`cmaps`, `standard_fonts`, `wasm`, `iccs`) are
copied to `/pdfjs/` by the `pdfjsAssets()` plugin in `vite.config.ts`, which
also serves them from `node_modules` in dev so the two environments agree about
a URL. Without them: a Japanese book is boxes, a document that references
Helvetica without embedding it renders with the wrong metrics, and a scanned
book is blank. `dist/pdfjs/**/*.wasm` is served as `application/wasm` so
`WebAssembly.instantiateStreaming` takes the fast path instead of warning.

### Page virtualization: the window is ±2 spreads

A 900-page book gets 900 page SLOTS — cheap boxes that keep the scrollbar
honest and let the browser do layout — and at most **five spreads** hold a
canvas (`client/books/layout.ts::renderWindow`, radius 2). The number is
arithmetic, not taste: a fit-width A4 page at `devicePixelRatio` 2 rasterizes to
~2500 × 3500, which is 35 MB of canvas backing store. Five spreads is 175 MB in
single mode and 350 MB in dual; rendering all 900 is 31 GB, which is not a slow
reader but a tab the browser kills. Two spreads of lookahead is what stops a
fast `j` or a Page-Down from showing an empty box.

Page sizes are measured lazily and unmeasured pages borrow page one's shape, so
the scrollbar is approximately right from the first frame. `clampCanvasScale`
caps the device-pixel scale below the ~16-megapixel ceiling browsers put on a
`<canvas>` — over it a canvas does not throw, it silently paints **nothing**.

### The keyboard is the interface

`j`/`k` scroll, `Space`/`Shift+Space` and `Ctrl+D`/`Ctrl+U` page, `gg`/`G`,
`<n>G` go to a page, `/` searches with `n`/`N` stepping, `o` the contents, `+`/`-`
zoom, `a` fit width, `s` fit page, `d` dual page, `i` night mode, `r` rotate
(`R` back), `m<c>`/`'<c>` marks, `?` the key sheet, `l` the shelf, `q` closes,
and `:` is a command line with a name for every one of those states.

**Every character key resolves through `client/keys.ts::shortcutKey()`.** A
bare `e.key === "j"` is false on an Arabic keyboard, on a Russian one and on a
Greek one — that module exists because five of this product's seven global
shortcuts were measured dead under a non-Latin layout, and a reader whose
system keyboard is Arabic is exactly who asked for this feature.
`npm run check-books` fails the build on any `e.key === "<printable>"` under
`client/books/`. Named keys (Escape, the arrows, Page keys, Space) are compared
directly: they are layout-independent already.

Marks are named by what the reader TYPED, not by the physical key — a chapter
marked with `ب` is recalled with `ب`. Numbers in the `:` line are accepted in
Latin, Arabic-Indic and Persian digits, because an Arabic instance PRINTS
`٢١٢` in the status line and refusing it back is a small betrayal.

The reader's keys are deliberately NOT in `GROUPS`/`docs/keymap.md`: they are
live only while a book is open, and a global sheet that describes them
everywhere is a sheet that lies most of the time. `?` opens the reader's own.

### Chrome-free by default

No permanent toolbar. The title bar and the status line appear on pointer
movement or a keystroke and fade after ~2.2s (`[data-chrome="off"]`); under
`prefers-reduced-motion` the fade is a cut. Everything the pointer can reach is
reachable from the keyboard, and everything the keyboard does has a name in the
`:` line — that is what makes "no visible controls" a design rather than an
omission.

### Two directions on one screen

The CHROME mirrors with the interface language, like the rest of the app. The
PAGES mirror with the BOOK: `spreadsOf()` reverses the PAIR (not the sequence)
for a right-to-left binding, so an Arabic volume in dual-page mode shows
`[3, 2]` and the eye travels right to left across the spread. Direction is
detected once from a text sample taken from the MIDDLE of the book — front
matter is where a copyright page and a translator's note live, both in English
in books that are not — and then stored, so `:rtl`/`:ltr` outranks the guess
forever. A bilingual owner reading an English monograph in an Arabic interface
gets an Arabic panel around a left-to-right book, and that case is the reason
the two questions are answered separately.

### Night mode does not ruin the photographs

`i` cycles `off → night → flip`. `night` is not `filter: invert(1)`: an
inversion turns black type on white paper into white type on black paper
(good) and turns the plate on page 212 into a photographic negative — a face in
cyan, a night sky in white. The documents most worth reading at night are
exactly the ones a naive inversion ruins.

So the page is rendered once and composited: inverted with
`invert(1) hue-rotate(180deg)` (the second half keeps a red heading red), the
resulting black lifted to the theme's own `--bg` with a `screen` blend so a book
in `sandstone` is dark sandstone rather than a black rectangle in a warm room,
and then **every raster figure drawn back over the top, unfiltered**. The figure
rectangles come from the page's operator list before anything is rasterized
(`client/books/figures.ts`), cached per page in page space so a zoom re-multiplies
six numbers instead of re-running the pass.

`paintImageMaskXObject` is deliberately NOT exempted. A stencil mask is a 1-bit
shape painted in the current fill colour, which is how a scanned page of text
arrives; exempting it would leave a scanned book unreadable in the one mode that
exists to make it readable at night. That single line of judgement is the
difference between this working and not. `flip` is the plain negative for the
reader who actually wants one, and skips both the tint and the figure pass.

### The page canvas draws left to right whatever the binding (3.19.2)

An RTL-bound book's pages sit under `.s-book__doc[dir="rtl"]` so the spreads run right to left.
A `<canvas>`'s 2d context has `direction: "inherit"`, so the visible page canvas inherited that,
and Chromium ran the bidi algorithm over the strings pdf.js hands it — runs of private-use codes
already in paint order — and drew every Arabic page as isolated letters in the wrong places.
Stock pdf.js on an RTL document garbles identically; on an LTR one it is perfect. So render.ts
pins `direction = "ltr"` on BOTH contexts a page is drawn into (the visible canvas when nothing
is composited, a detached one when night/invert is on), pageImage.ts does the same for covers,
and `.s-book__canvas { direction: ltr }` says it in CSS; scripts/check-books.mjs keeps all three.
The text layer is untouched: pdf.js positions its spans absolutely and sets their own direction.

### Search folds the way an Arabic reader types

`client/books/search.ts` matches character by character through a fold and
reports offsets into the ORIGINAL string, so a hit found in extracted text can
be turned back into a DOM `Range` over the untouched text layer. Harakat, the
superscript alef, Quranic annotation marks, tatweel, combining diacritics,
zero-width joiners and soft hyphens are skipped; the alef family, the yeh
family, teh marbuta and the Persian letters fold together; one typed space
matches the line break extraction invents. `الْمُقَدِّمَة` is found by typing
`المقدمة`, which is the whole point — and "résumé" is found by typing
"resume" for free.

The k-th hit is located twice, once in the extracted page text and once in the
rendered text layer, by the SAME function on the SAME normalization. That is
the only reason the two agree. The hit is painted with the CSS Custom Highlight
API — no node is inserted into the text layer, so the positions pdf.js computed
stay exact and the text stays selectable. A browser without the API scrolls the
match into view untinted.

### The shelf paints instantly and fills in

The default state of a library card is a **typographic plate** — the title in
`--font-serif` on `--bg-raised`, which is what the spine of a book without a
jacket looks like — never a spinner and never an error. A 400-book shelf cannot
render 400 covers before it paints, and a grid of spinners tells the reader
their library is broken. **A shelf whose covers never rendered would still be a
usable shelf.** That is the bar.

Covers are page 1, rendered small, requested as cards scroll into view and
cancelled as they leave. At most **three** `getDocument` calls are in flight at
once and every `PDFDocumentProxy` is destroyed the instant its bitmap exists
(`client/books/covers.ts`): a document is not a handle, it is a worker-side heap
of decoded fonts and images, and 400 of them is how a tab reaches four
gigabytes. Title, author and page count are cached back into the book's state
by the same one-shot open, so the next visit prints them without parsing
anything. A book that will not open keeps its plate — reporting "failed" on
forty cards because a network hiccup ate forty range requests is noise about
nothing anyone can act on.

The shelf's own search folds identically to the in-book one, so an Arabic title
typed without its harakat finds the book that carries them.

### Where it is mounted, and where it is going

`/library` is the shelf and `/book/<vault path>` is one book; both are real
addresses, because a book someone is halfway through is a thing they bookmark
(the page is already remembered server-side, so the URL only names the volume).

**A book is a WORKSPACE TAB** (the owner: "prob should just treat it like a
normal tab?? so people can open the book while taking notes"). The portal era —
a React root on a body-appended element, full-screen over the app, a
`booksAreOpen()` flag the router consulted — is deleted, not kept as a second
door. `client/books/door.ts` is what remains in first-paint code: URL parsing,
the tree walk that resolves a citation, and a call into the store
(`openBook` / `openLibrary`). `Pane.tsx` mounts `BooksSurface` through
`React.lazy` when a pane's surface is `"book"` or `"library"`; the surface
still takes a route and callbacks and touches no global state, exactly the
move its portal-era header promised. Its `active` prop says whether the pane
holds the keyboard — every zathura key listens on `window`, and a `j` typed
toward the note beside the book must not turn a page. The address bar follows
the FOCUSED pane (`bookSurfaceOf` in client/router.ts): a book tab in focus
puts `/book/…` up, focusing the note beside it hands the bar back — the
computed-URL comparison in the router subscription is what lets that change
without `openPath` changing. A citation rides the open itself
(`OpenHow.book` → the pane's one-shot `bookTarget`, cleared by `onLanded`),
so a later citation into an already-open book still jumps.

### Annotating: the PDF is never written to

`h` marks the selection, `H` steps the ink, `e` writes a note in the margin,
`x` takes one back (with an Undo), `A` lists them. Every one of those has a
name in the `:` line — `:highlight`, `:ink 3`, `:note`, `:annotations` — and
`:h` still means `:help`, because the vi rule resolves the first name whose
abbreviation the typed word satisfies and a reader with `:h` in their fingers
must not have it start inking their selection.

A highlight is stored in `ASTROLABE_DATA/books.json` under the book's CONTENT KEY,
beside the reading position and validated by the same total, never-throwing
shape (`shared/bookAnchor.ts::cleanHighlight`). It is a page number, one
rectangle PER LINE, an ink 1–6, the passage, and a margin note. Rectangles are
FRACTIONS of the unrotated page, never pixels and never PDF points: a reader
annotates at 140% on a laptop and reopens at fit-width on a 4K display rotated
ninety degrees, and the page's own proportions are the only coordinate space
that survives all of it.

**Nothing is written into the PDF.** Not a `/Annots` entry, not a re-save, not
the mtime. The vault is the one directory this application does not own; a
reader who marks a sentence must not thereby rewrite a 400 MB scan that five
machines then have to pull down again, and a file whose bytes change is — by
this reader's own rule — a DIFFERENT BOOK with a fresh position. So the whole
census still holds: `npm run check-books` enumerates every write call in
`server/books.ts` and the four in `persist()` are the entire list, and
`tests/books.test.ts` compares the PDF's bytes and its mtime after a page has
been annotated. The honest cost is that a highlight does not travel to a
different reader of the same file. That is the right trade for a single-owner
vault and it is the same one the reading position already makes.

Annotations are a SIBLING of `books` in the store, not a field inside each
state, because a position is patched forty times an hour by a debounced scroll
and is merged partially — putting a list of passages inside the record a scroll
write merges into is how a passage someone marked gets clobbered by them
scrolling past it. For the same reason `:forget` does NOT delete them: it means
"stop resuming this book", which is a sentence about a scroll offset, and a
command that reads as tidying up must never be the command that throws work
away.

The six inks are `--book-ink-1..6`, on `:root` ONLY, outside `check-contrast`'s
`REQUIRED_TOKENS`, and `npm run check-books` fails the build if any theme
overrides one. They are PAGE inks, not chrome: they sit on a printed page
rather than on the app's ground — the attachment viewer's fixed scrim makes the
same argument pointed the other way — a highlighter is yellow in every theme
anyone has ever bought one in, and a per-theme ink would mean the same passage
is marked green on the laptop and pink on the desktop, which is not a theme but
data loss. They are exempt from the contrast gate because an ink NEVER CARRIES
TEXT: the words under it are the page's own glyphs at the page's own contrast,
the wash is `aria-hidden` and takes no pointer events, and the passages are
listed AS TEXT in the `A` panel, which is where a keyboard reader reaches them.
Alpha around 0.4 is the hinge — under it a mark is invisible on a scanned grey
page, over it the ink competes with the letters it is pointing at — and the
blend is `multiply`, because a highlighter is a translucent ink laid on paper.

### A quote is assembled by COLUMN GEOMETRY, not by stream order

This is the load-bearing paragraph of the whole stage.

**pdf.js returns text items in the order the content stream wrote them.** That
is not a defect: a PDF page has no paragraphs, no columns and no reading order
in it — only "put these glyphs at this matrix" — and a typesetter may emit them
in any order that paints the same page. TeX, on a two-column paper, commonly
INTERLEAVES the columns: line 1 left, line 1 right, line 2 left, line 2 right.

Joined in that order the quotation is alternating half-sentences. It is
grammatical. It is fluent. It is not what the book says, and nothing on screen
tells anyone: the reader selected the right passage, saw the right passage
highlighted, pressed `c`, and a sentence the author never wrote went silently
into their notes and from there into their own writing. **A wrong quotation
that looks right is the worst failure this reader can produce**, which is why
`client/books/columns.ts` is a module with its own fixture rather than three
lines inside a keystroke handler.

Nothing in it reads the order the pieces arrived in. Columns are found by
projecting every piece onto the x axis and looking for a corridor no piece
crosses — a real gutter is empty on EVERY line, whereas the space between two
words is covered by the line above it — with the corridor required to be wider
than both 3.5% of the selection and one line height. Lines are grouped on y.
The order inside a line follows the SCRIPT: an Arabic line's first word is its
rightmost, and sorting one by ascending x silently reverses every sentence in
the quote. In a right-to-left paper the right-hand column is read first.

And hyphens. A book breaks "significant" as "sig-" / "nificant", and a naive
line join gives `sig- nificant` — embarrassing every single time, in every
quote, forever. Undoing it is guarded on all four sides: a capital on the right
is a compound the author wrote (`Anglo-Saxon`), a digit is never a hyphenation
(`1990-1995`), a single letter before the break is `x-ray` rather than a word
broken after one character, and the character before the hyphen must belong to
a script that HYPHENATES — Arabic does not, so a dash at the end of an Arabic
line survives. Soft hyphens are dropped; the Persian zero-width non-joiner is
kept, because it is spelling and not noise.

`npm run check-books` asserts that the reader builds its passages through
`assembleSelection()` and that nothing under `client/books/` except
`selection.ts` reads `getSelection().toString()` — DOM order is the PDF's
stream order, and that shortcut is the one anyone would reach for.

### `c` puts it in the note beside you

`c` cites with no target dialog: the note beside you is the active tab, which
is the answer in nearly every session. `Shift+C` opens the same panel with the
note picker focused instead of the quote — one surface, two doors, nothing to
learn twice. The list is the OPEN TABS and not the whole vault: a citation goes
into something you are working on, and a list of nine hundred notes is a list
nobody reads.

**The assembled quote is shown in an EDITABLE field before one character
reaches the note**, and that is not ceremony. Assembling a passage off a page
that has no reading order in it is inference, and inference is occasionally
wrong: a running head caught in the selection, a footnote marker, a wide table
read as two columns. Every one of those produces a quotation that is fluent,
plausible and not what the book says. A quote you can see before it lands is a
quote you can fix. The field is set in `--font-serif` — the face it will be
READ in — because a quotation proofread in the UI sans and then rendered in a
book face is a quotation nobody actually proofread. The ink goes down only on
confirm: a cancelled citation leaves the page exactly as it was.

What lands is the vault's own callout syntax, which is the point — it already
renders in the live preview, in the reading view and on a published page, and
it already survives being opened in Obsidian:

```
> [!quote]
> …the passage…
>
> — [[Ihya.pdf#page=42&rect=0.118,0.313,0.742,0.081&id=k7f3q2a9|Ihya, p. 42]]
```

EVERY line of the quote is prefixed, blank lines included: a callout whose body
contains an unprefixed blank line ENDS at that line, which would put a
two-paragraph quotation's second paragraph outside the box and its attribution
somewhere else again. A selection that crosses a page break is one sentence and
is joined by the same rule that joins two lines, hyphen and all; it leaves one
highlight per PAGE, because a rectangle has to be on something.

The write goes through `client/sectionActions.ts::applyNoteContent`, which
**claims `markSelfWrite(path)` BEFORE the request** and prefers the open editor
when one holds the note — so the citation is one undoable transaction the
existing autosave carries to disk, and the SSE echo (which overtakes the
response by about two milliseconds) is not reported back to the reader as
"changed on disk". A bare `putNote` here fails `npm run check-books`. It is
APPENDED rather than inserted at a cursor, and deliberately: the reader is
full-screen over the app, so there is no caret anyone is looking at, and a
block that lands invisibly mid-note is a block they have to go and find. (The
"no caret" half of that sentence predates book tabs — a note CAN be on screen
beside the reader now — but appending is still right: the caret belongs to the
OTHER pane, and a citation that teleports it mid-note would steal the very
split the reader arranged.) The
toast carries Undo, which restores the note to exactly what it was.

### The anchor is a wikilink, not a new syntax

`[[Ihya.pdf#page=42&rect=…&id=k7f3q2a9|Ihya, p. 42]]` rides
`client/editor/links.ts::parseWikilink()` **unchanged** — target, `#anchor`,
`|alias`. That is why it was given this shape: the live preview, the reading
view, the backlink index, the hover card and the autocomplete all keep working
without being taught anything. A `book:` scheme or a `%%astrolabe-cite%%` fence
would have needed every one of them to learn a second language, and a note full
of a syntax only this program understands has stopped being ordinary markdown,
which is the promise the whole vault rests on.

`page=` carrying a NUMBER is the whole of what tells a citation apart from a
heading somebody wrote, and it is strict: `[[Notes#page=one]]` is a link to a
heading called "page=one" and stays one. Three things ride in the anchor and
each is load-bearing. `page` is where to open. `rect` is what to pulse — a
citation that only opened a page of nine hundred words has not answered the
click — and it is carried in the LINK and not only in the store, so a citation
into a book whose annotations were later deleted still points at the passage.
`id` is the handle the store knows, and it is what makes the link survive a
rename.

Both renderers draw it and both open it. In the reading view it is an
`.s-rv-cite` anchor carrying the note it was clicked FROM; in the editor it is
`cm-s-cite`, resolved through the reader's own PDF lookup rather than
`resolveLink` (which answers about NOTES, so a PDF would otherwise render
dashed and a click would offer to create `Ihya.pdf.md`). On a published page a
citation is not a link at all — it reads as the words the owner wrote, because
a visitor has no library to open and no business enumerating one.

Clicking it opens the reader at that page and pulses the rectangle three times
and then stops; under `prefers-reduced-motion` the ring is held still for the
same span. A ring left permanently around a sentence is a defacement of
somebody's book. `/book/<path>#page=42&rect=…&id=…` is the same address in the
URL bar, so a citation is bookmarkable.

### When the name in a citation stops being the book's name

Three months after the note was written the file is
`Sources/al-Ghazali - Ihya (ed. 1998).pdf`, because that is what people do to a
shelf and because Obsidian, Syncthing, `git pull` and `mv` all write to this
directory without telling us. Every reader that stored a PATH now has a dead
link and the passage the note was arguing from is gone.

It is not gone here. The `id` names a highlight, the highlight is filed under a
CONTENT KEY, and the key is a hash of the bytes. `GET /api/books/locate?id=`
answers where those bytes are now: the names this key has been seen under
first, newest first and two cheap reads each, and failing that a walk of the
vault's PDFs — the same pass the shelf already does. `BookState.names` is what
makes the first half possible and is maintained by `cleanBookState` from the
`path` every open already sends, capped and de-duplicated.

So the book opens anyway, on the right page, on the right sentence. **And then
it offers to repair the note**, because rescuing the reader once per click
forever leaves the link wrong in git and on the published site. The offer is a
toast with an action on it, not an automatic edit: repairing is a change to the
reader's own file and the reader decides whether their file changes. The
rewrite matches `[[<name>#` and nothing looser — a citation is the only
wikilink shape that can carry a `.pdf` target followed by a `#`, so it cannot
touch a `[[Note#Heading]]`, a differently-named book, or the words "Ihya.pdf"
in a sentence. A repair that edited one line too many would be a far worse bug
than the broken link it was fixing. It goes through the same
`applyNoteContent` door and carries its own Undo.

`path: null` is a real answer and means the bytes have left the vault. The
reader is told that rather than shown a spinner.

The recovery is DYNAMICALLY imported (`client/books/citations.ts`).
`client/books/door.ts` is first-paint code reached by a static import from the
sidebar and the router; the happy path there is a tree walk and nothing else —
no request, no await, the book opens on the same tick as the click — and only a
citation whose name has stopped resolving loads a byte of the rest.

### The shelf finds the passage, not just the book

Typing in the library's search box now searches the marked passages as well as
the titles, and shows them above the covers: someone who typed a word they
remember reading is not looking for a cover. It is the one thing a library of
PDFs can do that a folder of them cannot — find the sentence you underlined in
a book whose title you have forgotten.

`GET /api/books/highlights/all` ships the passages and the MATCHING happens in
the client, on `client/books/search.ts`'s fold — the same one `/` uses inside a
book, so `الْمُقَدِّمَة` is found by typing `المقدمة` and a margin note counts
as part of its passage, because "the thing I wrote about it" is exactly what a
person remembers. There is one implementation of that rule in this product and
shipping the passages rather than the query is what lets the shelf reuse it.
The request is made on the FIRST KEYSTROKE, never on open: a shelf that paints
instantly is a promise this surface already made, and a decade of marginalia
arriving before the first cover would break it for a search most visits never
run. The store caps what it will carry at once and says when the answer was cut
short.

### Two doors with names on them: go-to and zen

Zathura's grammar was all here (`12G`, `:12`, `:+3`, `gg`, `G`) and the owner, a month in, asked
how one goes to a page. A key sheet is not a door. `p`, `:page` and the page counter in the status
line (a button now, and the one thing on that line a reader wants to CHANGE) open the go-to panel:
one field that takes the whole page grammar (`212`, `+3`, `-3`, `40%`, Latin or Eastern Arabic
digits) or a chapter name, with the contents listed under it, filtered as a word is typed, the
arrow keys moving the light and Enter taking the number when the field is one and the lit chapter
otherwise. The panel says what Enter will do before it is pressed, because `40` and `40%` are
twenty pages apart. `:40%` works from the command line too (`parseFraction`), and `pageAtFraction`
puts 0% on the first page and 100% on the last, so half of 300 is 150 and not 151.

**Zen is the shell's, and the reader only asks for it.** `z`, `:zen` and the ⤢ in the title bar
call `onZen`, which the pane wires to `store.setZen` (`Pane.tsx` → `BooksSurface` → `BookReader`),
because zen hides the sidebar, the tabs and the status bar and none of those are the reader's to
hide; `BooksSurface` still owns no global state. The bare `:z` stays zoom, the older word. **Esc
has an order.** The shell's Esc runs in the capture phase and leaves zen; a reader panel closes on
Esc in the bubble; so with a panel open in zen the shell looks first (`.s-book[data-overlay]`) and
stands down, and the second Esc leaves zen. And the title and status bars sit at `z-index: 2`, above
the text layer's 1: a page scrolled under them used to swallow every click on ☰, ✕ and the counter.

### The routes

`GET|PUT|DELETE /api/books/highlights?key=` (PUT is an UPSERT by id — changing
the ink, writing a margin note and correcting a quote are the same request with
the same id, and appending would leave the old ribbon painted under the new
one), `GET /api/books/highlights/all`, `GET /api/books/locate?id=`. Same guard
and same reasoning as the rest of the chapter: the reads say
`assertAdminRead(c)` themselves and nothing here serves a vault file — the
routes trade in a content key, a page number and four numbers between 0 and 1.

---

## EPUB in the reader (`client/epub/`, `server/epub.ts`)

The owner's ask was **"the arabic prints suck super bad… can you maybe support
epub through reader maybe?"**, and the answer is a second reading surface
rather than a converter. A PDF of Arabic poetry is a PICTURE of type: the
shaping was decided once by whatever made the file, the measure is frozen with
it, and zooming gives a bigger picture rather than larger text. An EPUB is
markup, so the browser shapes it — with the Noto Naskh Arabic this product
already carries (tokens.css maps the Arabic ranges to it), at the reader's own
size, at the window's own measure. Converting an EPUB to a PDF to open it in
the reader we had would have thrown away exactly the thing that was wrong.

### A `.epub` is a book beside a `.pdf`, everywhere

`isBookPath` (`server/books.ts`, `client/workspace.ts`) is the shelf's
predicate and it names both; `isPdfPath` survives beside it for the callers
that are about the FORMAT (`server/pdfText.ts` extracts a text layer with
pdf.js, which has nothing to say about an EPUB). The shelf lists both, the tree
opens both in the reader (`AttachmentKind` is `"book"` now, not `"pdf"` — the
kind is the ROLE), `/book/<path>.epub` is an address, a tracker's `file:` names
either, and a sigil slot that links either ticks on the sitting that read it.

**The key is the same key**: `sha256(format ‖ size ‖ head ‖ tail)`. The format
goes in front because `pdf:` is what every key already in every reader's
`books.json` was hashed with, and changing that would change the identity of
every book anybody owns. The sample is as distinguishing for an EPUB as the
chapter above argues it is for a PDF, and structurally so: an EPUB's first
bytes are the `mimetype` entry the specification requires to come first, and
its last 64 KiB are the central directory — the name, size and CRC of every
file in the book.

### A place is a CHAPTER and a FRACTION. There are no pages.

`shared/epubAnchor.ts`. A page in a reflowing text is a fact about the WINDOW,
not about the book: the same volume is 300 screens on a phone and 90 on a
laptop, so a stored page number would move when the reader rotated the phone.
A place is `{ href, fraction }` — a spine item's path inside the archive, and
how far down it — and both survive a type-size change, a rotation and the book
being opened on another machine.

It is stored in the SAME `BookState` record under the same content key, as
`page` (the chapter's 1-based index), `offset` (the fraction) and one new
field, `chapter` (the href). Not a second state shape, and the reason is that
everything the shelf, the sitting clock and the tracker do with that pair —
"how far through", "how much was read today", "42 %" — is the same question for
both formats, and a second pair would have meant a second `progressOf`, a
second bar and a second way of counting a sitting, all of which eventually
disagree. The index is the arithmetic; **the href is the address**, because
inserting a chapter moves every index after it and moves no href.

The URL carries it (`#ch=OEBPS/ch07.xhtml&at=0.42`) the way `#page=` does for a
PDF, and `client/router.ts` LEAVES THAT FRAGMENT ALONE: it names the volume,
the reader owns the place, and without that rule the first store change after a
scroll replaced the address with a bare `/book/…` and ate it.

### The chapter is REBUILT, not filtered

An EPUB is an arbitrary XHTML document from the internet, rendered inside this
origin — where the session cookie is. So `server/epub.ts` walks the parse tree
and emits a NEW document from an allowlist of elements and attributes.
Anything not on the list is never written out, so there is nothing to reason
about: scripts, forms, iframes, event handlers, `style` attributes and external
URLs do not survive to be stripped. An `<a>` pointing inside the book becomes
`data-href`/`data-fragment` with `role="link"` and a `tabindex` (a real `href`
in a single-page app is a navigation away from it); an `<a>` pointing out of
the book keeps its words and loses its link entirely. `id`, `class`, `lang` and
`dir` are kept — the contents land on an `id`, and the publisher's stylesheet
selects on `class`.

**Nothing is unpacked, ever.** Not to a temp directory, not to ASTROLABE_DATA,
not beside the book. `server/zip.ts::readZipDirectory` reads the archive
through a file handle at offsets — the tail once, then one entry per request —
so a 40 MB illustrated volume costs ~100 kB of reads to open and a chapter
costs the chapter. A cache of extracted chapters would be a second copy of
somebody's library living outside the vault, with its own eviction bug and its
own permissions to get wrong. What IS cached is the PARSE (metadata, spine,
contents) keyed by path-size-mtime, because that is the one genuinely
repetitive read in a sitting.

**No new dependency.** `package.json` carried no zip library and no XML parser,
and adding either — to read a format that is a zip of XML — would have added a
supply chain to a self-hosted reading room. The zip half already existed
(`server/zip.ts`, written for the Anki importer) and gained a positional
reader; the XML half is `server/epubXml.ts`, a hundred lines, because the job
is elements, attributes, text, CDATA and a doctype to skip.

### The gate is `/api/file`'s gate

`GET /api/books/epub/{manifest,item,search}` live in **`server/epubRoutes.ts`
and not in `server/bookRoutes.ts`**, because that file's first paragraph
promises that no vault bytes travel through it and these routes exist to carry
them. Each one asks the question `/api/file` asks, in the same words —
`isAllowedAttachment(rel)` and `isPublishLimited(c)`, 404 and not 403 — and
each answer wears `Content-Security-Policy: sandbox` and `nosniff`, so an
`image/svg+xml` plate out of somebody's book cannot run in this origin even if
the sanitizer is one day wrong about something. **A book in an unpublished
folder is the normal case**: these routes are for the owner reading their own
library.

### The publisher's CSS is PREFIXED, not shadowed

`shared/epubCss.ts` sanitizes on the way out of the zip (`@import` and
`@font-face` dropped, `url()` rewritten onto the item route, and the
declarations that fight the reading room — `font-family`, `color`,
`background*`, `position` — dropped) and `scopeEpubCss` prefixes every selector
with `.s-epub__chapter` on the way into the document, `html`/`body`/`:root`
becoming the prefix itself so a page-level rule is not lost. A selector it
cannot confine is dropped rather than emitted bare.

**Why not a shadow root**, which would scope it for free: the theme tokens stop
inheriting (and `--font-serif` is the whole point), a Selection cannot be read
across the boundary in the ordinary way (and "Copy citation" is a selection),
`dir` stops inheriting from the reader's root (and an RTL book is the case this
was built for), and the browser's own find-in-page does not see in. The prefix
costs none of that and is a pure function of a string — which is why
`tests/epub.test.ts` asserts the property directly instead of a browser having
to.

Dropping `font-family` is the ASK, not tidiness: a publisher's embedded face is
what the owner was escaping. Dropping `color` and `background` is the theme: a
book that sets ink and paper is unreadable in half the rooms in tokens.css, and
"the text went invisible when I switched theme" is not a bug anyone can
diagnose.

### The slot discipline is BookReader's

Every chapter gets a box whose height is measured or estimated (the running
average of what has been measured), so the scrollbar is honest from the first
frame; the chapter in view and one either side hold real markup and the rest
are empty boxes. A 300-chapter book is three chapters of DOM. Search is
SERVER-side over the zip for the same reason the window exists: the alternative
is fetching the whole book on every search.

**Search folds the way an Arabic reader types** — `shared/fold.ts`, the same
table `/` uses inside a PDF and the same one the vault's index uses. A hit's
`offset` is into the chapter's TEXT (`chapterText`), and the fold DROPS
characters (harakat, tatweel), so both sides map folded offsets back to real
ones explicitly rather than assuming the identity; a naive offset lands a few
words early, which is worse than not flashing at all.

### Citations carry WORDS. Highlights are a later round.

`c` copies `[[Book.epub#ch=<href>&q=<first words>]]`, and the reader honours
`#ch&q` by finding the words and flashing them. A fraction is a scroll offset
and a quotation is a sentence: the sentence is what still finds the passage
after the publisher reissues the file and every offset in it moves.

**Rect-anchored highlights are deliberately NOT built for EPUB.** The PDF
reader's highlight is four numbers on a page, and an EPUB has neither. What a
later round would need, written down so it is not rediscovered: a range anchor
that survives a reissue — in practice the EPUB CFI the specification defines
(a path through the spine item's element tree plus a character offset), stored
beside the existing `BookHighlight` rather than inside it, with the same
"resolve, and say so honestly when it no longer resolves" behaviour the
citation recovery has; plus a way to PAINT a stored range without inserting
nodes into the chapter (the CSS Custom Highlight API, which the search already
uses here), because inserting `<mark>` would reflow the book under the reader
and change every offset below it. Until then `c` gives a citation to a passage
and marking one is not offered — a half-built highlight that silently stops
resolving is worse than none.

`openEpubCitation` also has **no recovery path**, and that is the same fact
seen from the other end: recovery works by looking up a highlight id, and there
are no highlight ids here. A `[[Book.epub#ch=…]]` whose filename stops
resolving does what a wikilink to a missing note does.

### Its own chunk

`client/epub/EpubReader.tsx` is a third lazy chunk under `BooksSurface`
(`scripts/check-bundle.mjs::MUST_SPLIT` asserts it): somebody reading a 300 kB
EPUB has no business downloading a page renderer, a canvas compositor and a
column detector, and somebody reading a PDF has no business downloading a
stylesheet scoper. What the two DO share is the chrome —
`client/books/chrome.tsx` holds the search line, the contents panel and the key
sheet, generically, so a reader who opens both formats meets one interface.
`npm run check-books` now scans `client/epub/` under every rule it scans
`client/books/` under: `shortcutKey()` for every character key, tokens and
logical properties in `client/styles/epub.css`, and no local `t()` shim.

---

## Smaller rules

- **Outline heading numbers print the period the toggle promises.** The button is labelled "1.",
  the module header names the three spellings "1.", "2.3", "4.1.2", and the CSS beside the rows
  talks about a column of "9." / "10." / "11." — while the rows printed a bare "1 2 3".
  `numberLabel()` adds the terminator to a top-level number only; a compound number's own dots
  already say it is one. One function, so the outline and the rendered heading cannot disagree.
