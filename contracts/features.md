# Features — twins, trackers, Sigils, the Calendar, Orbits, capture, Ask, voice

The vault's own features: twins, trackers, Sigils, the Calendar page, Orbits, capture, Ask the vault, voice notes, and the 3.12–3.17 groups (block references, queries, tasks, periodic notes, bookmarks, layouts, the margin, the week). Part of the module contracts (see [CONTRACTS.md](../CONTRACTS.md) for the map). **Edit the area, append nothing:** a change to how something works is written HERE, in the section it changes, and the old sentence goes; a release gets one line in [releases.md](releases.md), never an addendum.

## Linguistic twins — one note, two faces (`shared/twins.ts`, `server/indexer.ts` `twinOf`, `client/twins.ts`)

**The ask, in the owner's words:** *"I can have the usecase of writing the same blog/note in two
different languages… instead of just creating another note in the different language we can somehow
make the 'translated' or linguistic twin of the note be somehow the same note and we can swap
between them? I am aware that this is weird since in the file-system they must be different
files… 'we preserve everything globally as a md' vs 'I want it to look nice and clean on my editor
UI'."* Both halves of that sentence are binding. Two files on disk; one note everywhere else.

**THE NOTE IS THE STATE.** The whole relation is one frontmatter line — `twin: [[Other Note]]`, a
wikilink resolved like any other, a bare path accepted too. No manifest, no sidecar, no id, nothing
in `settings.json`, nothing in the data directory. A vault copied to a machine that has never run
Astrolabe carries its twins with it, and a reader with `cat` can see the whole feature.

**One declaration is enough; the index makes it symmetric.** Two passes in `twins()`: every
declaration resolved, then every note WITHOUT one takes the one pointed at it. The second pass is
what lets the author write the line on whichever file they are already in.

**A note's own line wins for that note, and the pair says it disagrees.** Both files declaring, and
disagreeing, is a real state and there is no third place that could arbitrate between two files. So
nothing arbitrates: each note keeps the twin its own line names, `TwinLink.inconsistent` is true on
both sides, and the status-bar pill says so. The alternative — silently preferring one file — makes
the vault's own state unreadable from the vault, which is the one thing this product does not do.

**At most one twin.** Several notes claiming one note resolve by `pickShortest()`'s rule (fewest
segments, then shortest, then alphabetical), the same tie-break every other name in the index uses,
and the pair is marked inconsistent. A list value takes its first item for the same reason.

**A twin is a FACE, not a translation.** Language is the common case, not the definition: a long
version and a short one, both in English, are the same relation and get the same machinery. A face
may name itself with `face: short`. What is gated on the languages actually differing
(`TwinFaceRef.differs`, measured on the server where the detection lives) is exactly the
reader-language machinery and nothing else — the ع/EN swap, `hreflang`, the sitemap alternates, the
link-time swap. Two same-language faces are two posts, both listed if both are published, because
they are two files and saying otherwise would be a lie; each article page names the other instead.

**The editor shows one note with two faces.** The pill in the status bar's note row draws
`EN ⇄ ع` (or the two `face:` labels, or the two titles — one rung chosen for the whole pair, never
`EN ⇄ short`). Clicking it, `Ctrl/Cmd Alt L`, and the palette's *Switch to twin* all do one thing:
`swapTabIn()` replaces the tab's PATH in place — same pane, same index, same pin. Not an open. A
second tab for the other face would make one note two entries in the strip, which is the shape the
feature exists to remove. The swap pushes a history entry like any other move, and `client/router.ts`
makes the step back a swap too, so Back turns the tab over rather than forking it.

**The reader's place travels as a FRACTION** (`client/scrollCarry.ts`). Two translations do not run
in step, so nothing here pretends to align sentences: a fraction lands the reader in the right
REGION, which is what a scroll position is for. A carried place beats the target note's own scroll
memory — they did not open that note, they turned this one over.

**The tree hides nothing.** Both files stay in the tree as the two files they are, each marked with
a ⇄ that names the other on hover. The tree is a picture of the folder on disk; the first time it
stops matching is the first time the reader stops trusting it.

**"Create twin…" writes both files.** The new face carries the source's frontmatter minus `id:`
(a creation stamp belongs to one file) with `twin:` written the other way, and the source gains its
own `twin:` line — in that order, so an interruption leaves the one-sided case the index already
resolves symmetrically rather than a source pointing at nothing. No body: the words are the
author's, and a seeded heading in the wrong language is worse than an empty file. One prompt, for
the name, because the name IS the choice — it names the file, the tree and every completion, and for
a same-language pair it is also what the face is called. `face:` is for when it is not.

**A staleness hint, cheap and honest.** `twinIsStale(mine, theirs)` is two mtimes and a minute's
grace; the pill takes a dot and the tooltip names when the other side was last written. No diffing,
no automatic anything. A minute, not a second, because saving both faces in one sitting writes them
seconds apart and a hint that lights every time you type is a hint nobody reads.

**The public site: ONE FACE PER READER, and a door to the other.** Under `languageFilter: "follow"`
the lists already show each reader their own language, so a bilingual pair is never two posts to one
reader — that falls out of the existing per-note detection and is pinned by `tests/twins.test.ts`
rather than implemented again. What was missing was the door: a reader on the English post who taps
ع used to be left on an address their new language no longer lists. `PostMeta.twin` is filled
WITHOUT the language filter, deliberately, because the whole value of the field is naming the face
the reader is not being shown; `LangSwitch` then navigates to it, and only towards the face that is
in the target language.

**`hreflang` on both faces of both pages**, plus an `x-default` at the site's own language, and
`<xhtml:link rel="alternate">` rows in the sitemap (whose `xmlns:xhtml` is declared only when
something uses it, so a vault with no twins gets byte-for-byte the document it always got). Without
them a crawler meets two pages of one piece and drops one as a duplicate.

**The link-time swap is a pure function, and never runs in the editor.** `readerFace()` in
`shared/twins.ts`: no reader language → no swap; the linked face already in the reader's language →
no swap; otherwise the twin, if it is in that language and the reader can reach it. The server
projects it into a table keyed by link key (`twinSwapTable`), the reading renderer consults that
table ONLY after ordinary resolution has failed, and the table is empty for an admin scope by
construction. The author linked what they linked; a wikilink that landed somewhere else while they
were writing would make the vault unwritable.

**The pair is ONE NODE on the visitor's graph, and both faces' backlinks are one panel.** A graph is
a picture of ideas, and one essay drawn twice — each copy carrying half the arrows, joined to
nothing — is a picture of the filesystem instead. The representative is the face in the reader's
language (deterministic when there is none: shorter path, then alphabetical; a graph whose node ids
moved between two requests re-lays itself out while you are looking at it). NOT in the admin graph:
there the graph is a map of FILES you can open, rename and delete, and a node that opened a file you
were not looking at would be the same lie the other way round. Backlinks union for the same reason
as the graph merge — somebody who linked the English side linked this piece — with both faces
excluded from their own panel, since a link from one face to the other is the pair, not a backlink.

**`twinRef` and `face` are in `graphSignature()`.** A twin merges two nodes and unions two backlink
panels, so a declaration appearing or moving is a graph-shaped change; missing it would let the
`/api/graph` memo survive a change it must not survive.

**What this does NOT do:** no machine translation, ever. No merging of files. Nothing touching git
sync semantics. Twins are per note, never per folder — a folder-level pairing would be a second,
invisible state with no line in any file to read it off.

## Trackers (`shared/tracker.ts`, `client/reading/tracker.ts`, `client/editor/tracker.ts`)

A ```` ```tracker ```` fence is a progress card; a ```` ```tracker-board ```` fence is the shelf
of every card in the vault. They are the FIRST fence languages with a rendering of their own, and
they follow the rules the earlier block citizens already set rather than inventing new ones.

**The model is pure, and that is load-bearing twice.** `shared/tracker.ts` has no CodeMirror, no
DOM, no CSS and no React — the split `tableModel.ts` and `calloutDefs.ts` already made. Two
consumers need it that way: `node --test` (tests/tracker.test.ts) and `server/indexer.ts`, which
must see the `cover:` a fence names. Syntax is tolerant and line-based, deliberately not YAML: one
`key: value` per line, unknown keys ignored, `notes: |` block scalars, and progress written any of
`62/130`, `62 of 130`, `45%`, `45`, `٦٢/١٣٠`. **A body with neither a title nor a progress parses
to null and the fence falls back to a plain code block** — the `$$`-math rule: unparseable content
reads as its own source rather than disappearing into an empty card. `status: done` with no
numbers is 100%; an absent status is derived from the progress.

**One renderer, five surfaces.** `client/reading/tracker.ts` draws the card for the reading view,
the blog article, a transclusion, a hover preview and the editor's block widget — the editor calls
`renderTrackerFence()` in `reading/render.ts` exactly as the table widget calls `renderMarkdown()`.
Classes are `s-rv-tracker*` / `s-rv-board*` in `client/reading/tracker.css` (imported by the module
that draws with it, as `tex.css` is), plus the wrapper rules `.cm-s-tracker` in `preview.css`.

**The decision is synchronous; the drawing is not.** The PARSER is a static import (whether a fence
is a card at all must be settled before anything paints, or an unparseable body would paint a card
and then turn back into a code block); the renderer and its stylesheet — 14 kB that only a note
carrying a tracker needs — arrive through a dynamic `import("./tracker.ts")` into a
`.s-rv-tracker-pending` host already in the tree, the shape KaTeX has here already
(`s-rv-math-pending` → `hydrateMath`). The placeholder is the card's own box at the card's own
height, and its rules are stated identically in `reading.css` AND `preview.css`, because
`reading.css` travels with the reading view and the blog article while the editor has neither.
`hooks.onResize` fires when the card lands, which is what tells CodeMirror's height map.

The card is grid-laid with logical properties throughout. **Its direction is its TITLE's**, set
explicitly rather than by `dir="auto"`: the first strong character in the subtree belongs to the
localized kind label ("Book"), so an Arabic book on an English instance came out left-to-right
with its bar filling away from its own title. `:dir(rtl)` flips the fill's gradient, for the same
reason an ancestor `[dir]` selector cannot be used.

**Live preview follows the reveal-on-caret rule.** Caret outside the fence → ONE
`Decoration.replace({block:true})` over the whole block, markers included, from the `blockHiding`
StateField; caret inside → the source, with its `cm-s-codeblock` line class back (the class is
suppressed only while the block is replaced, since it would be dressing lines nobody sees). The
`codeSpans` push is unconditional either way: whatever it looks like, a fence's contents are code
and the inline scans must not run inside it.

**The stepper is a DOCUMENT EDIT.** The admin-only − / + buttons dispatch one change over the
fence body through `setTrackerProgress()` — one dispatch, one undo step, the `toggleTask`
precedent. The note is the only store; editing the number by hand does what the button does.
`setTrackerProgress` is byte-disciplined: exactly one line changes and inside it only the number,
so spacing, the key's spelling, the unit suffix and CRLF endings all survive. Reading view and
every public surface are inert — a visitor has no write path, and buttons that cannot work are
furniture that lies.

**The cover is the fourth attachment route, and it was invisible to the other three.** A cover
name lives inside a code fence, so neither `parseLinks()` nor `parseAssets()` can see it. Tracker
covers are collected into BOTH `allowedAttachments()` and `collectAttachmentTargets()` in
`server/indexer.ts` (`trackerCovers()`), by the same path-then-basename ladder embeds take.
Without it a published shelf renders its art for the owner and 404s for every visitor — the
silent public-site breakage that walk already carries a comment about.

**The board's scope is `posts()`' scope.** `trackers(visitor, lang)` iterates `publishedSet` for a
visitor and every note for an admin, applies the language filter to the visitor only, and skips
`isTemplateNote()` for BOTH — a stencil on the shelf is a book nobody started, and that is the
same lie in the admin's list as on the public page. `NoteRecord.trackers` is filled at both record
literals (the oversized-note path carries none: it never read a body). `NoteRecord.mtimeMs` is the
board's sort key and is NOT `dateMs`: a shelf answers "what did I touch last", not "when was this
written".

**The Media page (`client/media/`, `shared/media.ts`) is a second drawing of the shelf, not a
second shelf.** `view === "media"` in the store, a lazy chunk with its own stylesheet
(`client/styles/media.css`) rendered in the graph's place by App.tsx, opened by the status bar's
admin-only door beside the gear or the palette's "Open the Media page"; Ctrl/Cmd+E leaves it for
the editor as it leaves the graph. It reads `GET /api/trackers` and groups by `foldKind()`
(`mediaModel.ts::shelve`, tested) in a fixed order — show, game, book, film, course, project,
habit, other — vertically, one hairline between shelves, and a grid capped at FIVE across by a
container query on the page; it never scrolls sideways. The page has two write paths and both go
through the note. **New:** `mediaNotePath(kind, title)` → `Media/<Folder>/<Title>.md` and
`mediaNoteContent(fields)` → frontmatter plus one tracker fence, PUT as any autosave is; the form
refuses a path the tree already holds (asked of the store's tree, not the server — a 404 for "not
yet" is a red console line for the usual answer). **Edit and nudge:** `POST /api/tracker`, which
rewrites the `index`-th fence through `editTrackerFence()` + `setTrackerFields()` (in-place
rewrite of existing keys keeping spelling, indent and CRLF; removal on `null` with the block
scalar's extent; missing keys added under the title in `FIELD_ORDER`) and `setTrackerProgress()`
for the delta. Nothing outside the fence is touched. Three model additions carry it:
`progress: 62/?` is an OPEN-ENDED count (`done`, no `total`, no `percent` — the card counts and
draws no bar; a bare number stays a percentage), `season:` is kept verbatim on `Tracker` and
`TrackerMeta`, and `TrackerMeta` gained `index`, `started`, `finished`, `season` and `notes` so the
form can open pre-filled. `trackers()` resolves covers by the same path-then-basename ladder
`trackerCovers()` climbs (`coverPath()`), so a full attachment path — what the picker and the
upload write — draws on the shelf as it does in the editor; an `https://` cover passes through.
The page re-reads the shelf on the window's `astrolabe:vault` event, which App.tsx raises for every
vault event, because a fence edited by hand in another window is still this page's business.

**A work's `folder:` answers with ONE note, not a list (3.9.0).** `folderFacts()` in the indexer
carries `folderNotes` (the count), `folderNote` (the folder's own note) and `folderRecent`, a
list of AT MOST ONE — the note touched last under the folder. It carried three, and the right
panel's "Notes of this work" walked the tree and listed every note under the folder; the owner's
book folders hold dozens of atomic notes and the section was the height of the panel ("a long
list of all the notes taken"). Both surfaces now show the last note only — the Media card's
"Last note" door and the panel's, with the count in the panel header and an "Open the folder"
door — and both doors go through one function, `openTrackerFolder()` (`client/trackerFolder.ts`):
the folder's own note when it has one, else the folder revealed in the tree with the sidebar
open. The wire shape stayed a list so an older client still reads it. The banner picker and the
Media form's cover upload send the note's folder as the upload CONTEXT (`uploadAttachment(file,
admin, dir)`), as an editor paste does: they sent none, so under the "same folder" and
"subfolder" attachment modes a banner landed at the vault root while a pasted image landed
beside the note — the one upload path that ignored the setting. The site-wide pickers (home
banner, logo, favicon) belong to no note and keep the root as their context.

## Sigils — the daily practice (`shared/routine.ts`, `client/reading/routine.ts`, `client/editor/routine.ts`, `client/routines/`) <!-- lineage: the module files keep the first name -->

A ```` ```sigil ```` fence is a PLAN by the day; the ```` ```sigil-log ```` fence after it is the
LOG the app writes. Lineage, once: the feature shipped as Routines (3.11–3.14, fences ```` ```routine ````
/ ```` ```routine-log ````), was renamed Orbits in 3.15 (```` ```orbit ```` / ```` ```orbit-log ````), and
in 3.16 gave that word to spaced repetition and became Sigils — Latin *sigillum*, Arabic سِجِلّ, the
same root, a seal set on a kept day and the register of those days. **Every spelling is read** <!-- lineage -->
(`fenceWord` in shared/routine.ts; `logFenceWordFor` answers a legacy plan with its own log word,
so one note keeps one vocabulary); the form and the seed WRITE `sigil`. The identifiers, file names,
routes and test names below keep "routine" (renaming a thousand symbols for a word the reader never
sees buys nothing), and every user-facing string, the URL (`/sigils`; `/routines` redirects), the tab
(`~sigils`; `~routines` is folded), the folder (`Sigils/`, `سجل/`; an existing `Routines/` or `روتين/`
kept; NEVER `Orbits/`, which is the decks' folder now — `routinesRootFor`), the door (a seal glyph,
`data-testid="sigils-door"`, beside the Orbits ring) and the docs (`docs/sigils.md`) say sigil.
`npm run check-names` (scripts/check-names.mjs) greps every user-facing surface for the old words and
fails on a hit. The owner asked for "a daily tracker … per-day details on specific activities …
templates like an exercise tracker … custom templates". A tracker is a card about one work; a
routine is a card about your days, and it follows every rule the tracker set rather than inventing
new ones.

**The model is pure and in the entry; the presets are not.** `shared/routine.ts` — no DOM, no
CodeMirror, no React — loads under `node --test` (tests/routine.test.ts) and in `server/indexer.ts`
(`NoteRecord.routines`, filled at both record literals, empty on the oversized path). render.ts and
the live preview parse a fence before anything paints, so the parser is a static import; the
templates the form offers live in `shared/routinePresets.ts` and reach only the form's lazy chunk.
Syntax is tolerant and line-based: `key: value`, a weekday's slots INDENTED under it, `items:` for
every-day tasks, `fields: name:type[:unit|max]`, `target: n/week`, `notes: |`. Weekday and kind
words fold in both languages. **A body with neither a title nor a plan parses to null** and the
fence reads as its own source (the $$-math rule).

**A COURSE IS THE SECOND MODE OF THE SAME FENCE (3.19.0), AND NOTHING IN IT IS DATED.** The owner:
"there has to be a way to dynamically ask a sigil to keep moving/bumping yesterday's task if not
done because future tasks depend on it … if it takes me two days instead of one the schedule
handles it by shifting the task to the second day". `mode: course` turns the plan from a week into
an ORDERED LIST: `days:` (the weekdays that get steps), `capacity:` (`15 min · sat 45 min · sun 0`
— a day's budget, `0` a rest day), `items:` (unchanged; the middle dot joins a list as a comma
does, which is what `[[a]] · [[b]]` wants, and `plan.itemsSep` remembers which the author used so
the form round-trips it), and `steps: |`, a block scalar of `- step (45 min)` lines under `# unit`
headings, kept VERBATIM in `course.source` — comments, blank lines and indentation included. The
CURSOR is the first step neither done nor skipped; every date is PROJECTED by `projectCourse`
walking forward from today over the allowed days, taking at least one step a day and then as many
more as the budget holds. A missed day writes nothing: the same call made tomorrow returns the same
steps one day later, and everything after the cursor shifts. `tasksFor` answers a course with its
items plus ONE sentinel task (`COURSE_TASK`, NUL-prefixed, never a key a log names) that
`dayStatus` resolves through `courseDayMet` — a day is complete when the minutes of its ticked
steps reach its capacity, or, with no capacity, on one step.

**A STEP'S KEY SURVIVES AN INSERT, A REORDER — AND AN EDIT, BECAUSE THE APP STAMPS IT.** A step is
named by an explicit `[k3]` tag at the end of its line when it has one (a wikilink is not one: the
character before the bracket must not be a bracket), else by a short FNV-1a of its unit and its
words, with `-2` for a repeat of the same words under the same heading. A hash does not depend on
position, so inserting and reordering are free; it DOES depend on the words, so `logEditFor`
stamps the key into the line the first time a step is ticked or skipped and the plan edit and the
log edit go out as ONE `{from, to, insert}` — the plan fence always precedes its log, so the span
from the plan's body to the log's covers both and the bytes between are carried over untouched.
One undo step, and a step nobody has answered has nothing to lose.

**THE WALK IS A SEPARATE MODULE, AND THAT IS A BUDGET.** `shared/routine.ts` is a STATIC import of
the entry (render.ts must draw a fence before anything paints), so the course PARSER lives there
and every reader pays for it. The cursor, the projection, `courseStepsOn` and `courseBands` live in
`shared/course.ts`, which only the card, the Sigils page, the Calendar page and the form import —
all four lazy. The Calendar page draws the two halves of one projection: a past day names the steps
it answered (solid), a day ahead names what the projection puts there (`.s-calpage__line--ahead`,
faint and italic, and never taking the solid first-line ink), and under the grid `agendaBands`
lists the unit bands of the months ahead. `client/routines/orbits.ts` drops the sentinel task and
queries `.s-rv-routine__task:not(.s-rv-routine__step)`, because the card draws a course's steps in
their own rows ABOVE the items and the nth task must stay the nth row.

**The log is one line per day, read by segments.** `date | done: a, b | skipped: c | <field>: v |
note`. `parseLogLine` takes the plan's fields so a segment whose key is not a field is prose, not a
value; the last line for a date wins; Eastern Arabic digits fold. `upsertLogLine` is byte-disciplined
(other lines and CRLF survive; the new line goes in date order; an empty entry removes its line) and
`logEditFor(md, index, patch)` answers the ONE `{from, to, insert}` that records a patch — a line
inside the existing log, or a whole log fence written under the plan when the note has none. A plan
is paired with the first log fence after it and before the next plan (`scanRoutines`,
`routineFenceSpans`), so `index` counts plans only and a log takes its plan's index.

**A tick is a document edit.** `client/editor/routine.ts` mirrors the tracker widget: caret outside →
one block replace carrying the reading renderer's card; the card's `onLog` computes `logEditFor`
over the whole document and dispatches exactly that change (`input.routine`), one undo step. The
widget over the PLAN draws the log's entries (streak, week, heat), so `eq` compares the paired log's
text as well as its own; `ignoreEvent` keeps change/input/keydown/toggle for the card's controls.
The Sigils page makes the same patch through `POST /api/routine`, which applies the same
`logEditFor` server-side (and `editRoutinePlan` for the form's `plan`), writes under the mtime
precondition and emits `changed`. `GET /api/routines` is ADMIN ONLY (401, the books shelf's rule) and
INCLUDES template notes, marked `template: true` — the one query that wants the stencils, because
the form offers them.

**One renderer, every surface.** `client/reading/routine.ts` draws the card (today's checklist with
every-day items first, fields as inputs, a note line, streak / this week / last-30 chips, the
seven-dot week strip, the twelve-week heatmap, the folded plan table) and the ledger; classes are
`s-rv-routine*` / `s-rv-routinelog*` in `client/reading/routine.css`, statuses painted from
`--callout-success` / `--callout-warning` / `--danger`. **The card is chrome and follows the page;
the author's words follow their script.** The card carried its title's direction whole, so an
Arabic-titled sigil on an English page mirrored everything the app draws — the weekday strip, the
heatmap legend, the action buttons — beside cards that did not; now only the title, a task's key
and text, a field's name and the note carry `dir` (each from its own first strong character) and
the controls keep the chrome's order. render.ts's fence branch looks AHEAD for the
plan's log (`logAfter`) so the card can draw it, and remembers the plan (`ctx.lastRoutine`) so the log
fence, when its turn comes, knows the fields. The host is the tracker's `.s-rv-tracker-pending` box
and the editor wrapper is `.cm-s-tracker`; both sheets already state them. Controls appear only when
`onLog` is passed; reading view and the blog are inert. The week starts on Monday (en) or Saturday
(ar) — `weekStart`/`weekOrder` — and `dayStatus` is complete / partial / missed / rest / none, with
rest days transparent to the streak and an unfinished today neutral.

**The Sigils page is the Media page's twin.** `SIGILS_TAB = "~sigils"` (`isSigilsTab`, which also
answers the legacy `~routines`), `surface === "sigils"`, `setView("sigils")` / `toggleSigils()` /
`sigilsOpen()`, `/sigils` in the router, a lazy chunk pinned by
`MUST_SPLIT`, its stylesheet importing `media.css` so the form (which wears `.s-mediaform*`) is
dressed even when the Media chunk was never fetched. Cards are the reading renderer's mounted into
React and rebuilt on every meta change; the page re-reads on `astrolabe:vault`. The form composes a
draft (`routineFenceBody`, round-trip tested) and writes `Sigils/<Title>.md` (`سجل/` on an Arabic
instance, an existing `Routines/` root kept) with frontmatter + plan + an EMPTY log fence; an edit
sends only the plan body. "Save as template" writes the same note into the templates folder. The
"N due" line on the page (`routinesOrbitsDue`) counts the cards due across the decks AND the tasks
due by today (the count the "Due by today" list below it draws, handed up rather than fetched twice);
its Orbits door shows while cards are due, and "nothing due" — the recents row taking the top —
means no sigil, no card and no task. A slot that
wikilinks a deck wears the chip `client/routines/orbits.ts` draws (see Orbits below). **The month is
not on this page.** It was a section at its top until 3.18 (the owner: "kinda weird and useless in
the sigils window") and is the Calendar page now; the trackers went with it, because they only ever
rode this page's load for the grid's second mark.

**Today ticks through the card's edit (3.28).** Both shells' Today (`client/today/model.ts`
`sigilRows` / `toggledSigil`) list `tasksFor(plan, today)` for every non-template sigil and send
the day's whole `done` list through `POST /api/routine`, exactly the card's dispatch; course and
book tasks open the card instead. The year in review counts ticks from `DaySigil.done` and reads the
best streak with `dayStatus`, rest days transparent — the card's streak rule over a year.

## Relative line numbers, the deck in motion, the Sigils row <!-- lineage: shipped in 3.14.0 as the Routines row -->

**Relative line numbers (`client/editor/relativeLines.ts`).** A custom `gutter()`, not
`lineNumbers()`: the built-in recomputes its markers on document and viewport changes only, and a
relative column that lags the caret by a keystroke is worse than none — `lineMarkerChange` answers
`selectionSet` too. On only while `vimMode && relativeLines` (store; device key
`astrolabe.relativeLines`, default on), through `relnumCompartment` beside `vimCompartment`;
`setRelativeLines()` is dispatched by Editor.tsx's effect on either flag. The extension adds the
editor class `s-relnum-on`, and app.css moves the gutter from the scroller's far edge to the text's
side (the gutter takes the leading auto margin, the content keeps the trailing one) and strips
CodeMirror's gutter chrome. No top padding on the gutter: CodeMirror places markers by block
position itself, and the padding put every number a line low.

**The deck (`client/whatsnew/`).** The stage is the hero: a flex column, the stage `flex: 1` with
the drawing scaled to fill, the title, blurb (three lines, clamped) and manual link beneath.
`stagger()` in WhatsNew.tsx assigns `.wa` and `--i` to every part of an SVG after its frame (a
`<g>` without a transform is timed child by child) and sets `--step` so the whole cascade fits the
first third of a nine-second loop whatever the part count; the named effects (`wa-draw`, `wa-grow`,
`wa-late`, `wa-press`, `wa-pulse`, `wa-drop`) are opt-in classes in the markup. Arabic-heavy
slides are DOM demos (`ayahDemo`, `harakatDemo`): an SVG the stage forces LTR cannot shape or
align an RTL run, and the first ayah drawing ran the verse off its frame. Dots are grouped by
release with the version under each group when the walk spans more than one. Reduced motion shows
everything at once. Fresh installs: `FRESH_AT_LOAD` in door.ts is read at module evaluation,
because boot writes `astrolabe.recents/tabs/prefs-sync` before the door's timer fires (3.13.1).

**The Routines grid** is `auto-fit`: one routine spans the row, two share it. (3.14 also set the
week strip beside the heatmap through a container query on the card's own width — a rule that
resolves against the card's ANCESTOR container, which is the squish 3.15 fixes; see below.)

## Sigils: the name, the icon and banner, the rebuilt form, the squish <!-- lineage: shipped in 3.15.0 under the name Orbits -->

**The name.** The owner: "routine is kinda a lame name… name it something cooler that sounds cool
and legit in arabic and english". Orbits / المدارات (singular مدار). What changed is every VALUE a
reader sees and every word a note is written with. The identifiers stood then; the page's own
ids took its final name in the sweep that followed 3.27.0 — `SIGILS_TAB`, `isSigilsTab`,
`toggleSigils`, `sigilsOpen`, the surface and view id `"sigils"` — while `POST /api/routine`,
`GET /api/routines`, `RoutineMeta`, `client/routines/`, `tests/routine.test.ts` and the i18n KEYS
(`routine*`, with the page's current VALUES) still stand. Concretely:

- **Fences.** `routineFenceKind` reads `orbit`, `orbit-log`, `routine`, `routine-log` and answers
  the ROLE (`"routine"` / `"routine-log"`). render.ts's fence branch takes both words; the editor
  widget, the indexer, the spans and the routes all go through the one reader. The form and the
  seed write ```` ```orbit ````. **A log fence the app ADDS is spelled the way its plan is**
  (`logFenceWordFor(plan.opener)`): a legacy ```` ```routine ```` plan gets a ```` ```routine-log ````
  under it, never an `orbit-log`, so a note keeps one vocabulary and the owner's
  `~/Documents/alchemy/Routines/*.md` are never touched. Tested both ways.
- **Folder.** `ROUTINES_ROOT` = `Orbits` / `مدارات`; `ROUTINES_ROOTS` lists the two legacy names
  after them, and `routinesRootFor` prefers the instance's own new name, then ANY root the vault
  already has (a vault with `Routines/` keeps filing there), then the new name.
- **Tab and route.** Today: `SIGILS_TAB = "~sigils"`, `LEGACY_SIGILS_TAB = "~routines"`;
  `isSigilsTab` answers both and `parseTab` folds the legacy sentinel to the current one on read, so
  a stored workspace reopens the page as one tab, not two. The router serves `/sigils` and still
  answers `/routines` (the bar then shows `/sigils`). (In 3.15 the tab was `~orbits`; that name
  went to spaced repetition in 3.16, and a 3.15 workspace opens Orbits.)
- **Chrome.** The status-bar door is a body on its ring (was a calendar leaf); the palette row,
  the phone ⋯ row, the tab title and the slash-menu row (`Orbit routine`, so `/routine` typed from
  habit still finds it; the snippet writes ```` ```orbit ````) all read the dictionary.
- **Docs.** `docs/orbits.md` + `docs/ar/orbits.md` (the routines pages are gone), SECTIONS slug
  `orbits`, README/docs index rows, the seed `vault-seed/Orbits.md`. Both pages carry the
  one-line note that the fence was called routine before 3.15 and still works.

**Icon and banner.** `icon:` (also `emoji:` / `رمز` / `أيقونة`) is one grapheme cluster or a word of
at most three (`cleanIcon`, `Intl.Segmenter`): 🚶, ☪, "AB" pass, a sentence does not — it parses to
null rather than a paragraph in a badge. It is `plan.emoji` (the FolderIcon `plan.icon` is still the
kind's glyph, drawn when `emoji` is null). `banner:` (also `image:` / `لافتة` / `صورة`) takes a bare
value, `[[…]]` or `![](…)`, and is `plan.banner`; the card resolves it through THE NOTE BANNER'S
LADDER (`resolveBanner(value, notePath)` in client/banner.ts — https, exact path, beside the note,
basename vault-wide) and draws `.s-rv-routine__banner`, a strip bled through the card's padding,
`display:none` until the image's `load` fires (a hidden `<img>` still fetches; a `loading="lazy"`
one does NOT — it was lazy for one build and never loaded). A miss or a broken file draws nothing and
costs no grid gap. The draft carries `icon` / `banner` and `routineFenceBody` writes them right
after `kind`, which is why the owner's sample round-trips byte for byte (tested).

**The form, rebuilt** (`client/routines/RoutineForm.tsx`, `.s-orbitform*` in
client/styles/routines.css, the Media form's frame kept). A sheet in four numbered sections —
name and look; days and parts; what to record each day; target and notes — with a plain sentence
under every control. **Fields are edited as PARTS, not specs**: the form's state is
`RoutineField[]` in the plan's order (`parseField` is exported for it), composed back through
`fieldSpec`, so an untouched edit writes the same `fields:` line. The KNOWN fields
(`client/routineFields.ts`: minutes, weight, focus, mood, energy, water, pages, hours, quality,
notes — each with an en and an ar key, a type, a default unit or ceiling, and a help sentence) are
toggles: on = a field with that key (either language) is in the list; toggling on appends
`fieldFromKnown` in the instance's language; a number's unit and a scale's ceiling are editable in
the row. Anything else is a **Your own fields** row (name, kind of value as a Select whose note
explains it, unit or ceiling). **Presets pre-tick, nothing is forced** — the exercise preset lists
minutes and weight and the owner unticks both; the fence then has no `fields:` line (tested in the
browser). "Custom" (was "Blank") starts from nothing and the hint says so. The kind row always
shows. The icon is a shelf of forty emoji (radio buttons) plus a free field (≤8 chars, `cleanIcon`
on parse); the banner is the Media form's cover row — `PathInput kind="image"` and an upload
button ("Choose…") whose context folder is the note's, or the folder the note will take.

**Fields, the model.** `RoutineFieldType` gains `count` (`water:count:glasses`): a number that
means whole things, drawn as `<input type=number step=1 inputmode=numeric>`; `fieldSpec` writes it
back as `count`. **A declared field wins over the note keyword** in `parseLogLine`: a plan with a
`notes:text` field (the form offers one) reads `notes: …` into `values.notes`, and a log with no
such field still reads it as the day's note. On the card `isNotesField` makes that field THE note
box (one input, writing `values[key]`), not a field input beside a note line that mean the same.

**"What is the focus thingy".** Every field name on the card carries `title = fieldHelp(field)` —
the known field's sentence, or the generic one for its type ("soreness, rated from 1 to 5") — and a
scale row's `title` adds "click a number; click it again to clear". The same sentences sit under
the form's toggles. The dictionary's `orbitField*` block is theirs.

**The squish** (the owner: "when clicking to create a new routine my first routine gets weirdly
squished to the right"). Reproduced in Chromium with TWO cards on the row: the first card's head
sat in a 27px column with everything else in the second. Cause: 3.14's `@container (inline-size
>= 640px) { .s-rv-routine { grid-template-columns: 1fr auto } .s-rv-routine > :not(week):not(heat)
{ grid-column: 1 / -1 } }` with `container-type: inline-size` ON the card. A container rule on an
element resolves against its nearest ANCESTOR container, so the card's own columns switched on the
PAGE's width (≥640 always) while its children's spans switched on the CARD's (<640 once two cards
shared the row) — two columns, nothing spanning them. Creating a second orbit is what put two on
the row, hence "when clicking to create a new routine". Fix: no container query at all — the week
strip and the heatmap live in `.s-rv-routine__lower`, a wrapping flex row (`week: flex 1 1 340px`,
`heat: flex none`), so a wide card sets them side by side and a narrow one stacks them by
geometry. The card's `container-type` is gone. Measured before/after with the form open and closed
(scratchpad harness); the head spans its card in every case.

**The form's own container.** `.s-orbitform__body` is a query container so the rules that stack
the own-field row on a narrow SHEET ask the sheet's width — the lesson above, applied.

**Verified** (scratchpad/orbits/verify.mjs against a scratch server): `/routines` → `/orbits`; the
owner's sample renders with its 🚶; a legacy ```` ```routine ```` plan renders on the page and in
the editor and a tick writes into its ```` ```routine-log ````; the exercise preset with minutes and
weight unticked saves a note with no `fields:` line and ```` ```orbit ```` fences; an edit saved
untouched leaves the note byte for byte; a custom rating and Focus land as
`fields: soreness:scale:5, focus:scale:5`; a `banner:` strip draws; the first card keeps its box
with the form open; the 412px form fits, scrolls only down, and its emoji targets are 42px; the
Arabic sheet reads المدارات. Unit tests: `orbits (3.15.0)` in tests/routine.test.ts.

**The review's findings, fixed** (a second harness, scratchpad/review/probe*.mjs, against a
vault holding legacy ```` ```routine ```` notes in `Routines/` beside new ones):
- The icon's free field wrote whatever was typed: `icon: hello` landed in the fence, the card drew
  nothing (`cleanIcon` drops more than three graphemes) and the next edit lost it. The form now
  composes `cleanIcon(draft.icon) ?? ""` and the preview shows that same reading — a paragraph
  previews as nothing and is not written.
- An own field's name accepted the spec's separators: "a:b, c" came back as `a:number:b` and a
  field `c`. The name and unit inputs strip `:` `,` `|` (the third splits a log line).
- The emoji shelf was forty-one tab stops. It is a radiogroup with ONE stop (the picked square, or
  None) and arrows within it: horizontal arrows follow the sheet's direction (ArrowLeft walks
  forward in Arabic), vertical ones move a row of the grid, and focus moves with the pick.
- The target's unit ("days a week", «أيام في الأسبوع») sat under the digits in the stock 96px
  number field; `.s-orbitform__target` gives the input 200px and 118px of end padding.
- A `notes:text` field hid a day's loose note logged before the field existed; the box falls back
  to `entry.note` when the field has no value.
- The palette row's hint reads "view · formerly Routines" so `routine` typed from habit still
  finds the door (the hint is a haystack, client/paletteRank.ts).
- build-docs writes a refresh stub at `docs/site/<lang>/routines/` (`MOVED` map): the 3.11–3.14
  deck slides link the manual by that slug and are history.

## The Calendar page (`shared/dayAgenda.ts`, `client/calendar/CalendarView.tsx`, `client/styles/calendarpage.css`)

**The month is a PLACE, not a widget on somebody else's page.** From 3.17 a 440px grid sat at the
top of the Sigils page; the owner took it off ("I might honestly remove the calendar view from the
sigil window… kinda weird and useless in the sigils window"), and it is a page of its own from
3.18. `CALENDAR_TAB = "~calendar"`, `surface === "calendar"`, `setView("calendar")` /
`toggleCalendar()`, `/calendar` in the router, a lazy chunk pinned by `MUST_SPLIT`, a door in the
status bar (a wall-calendar leaf, `data-testid="calendar-door"`, beside the seal and the ring;
admin-only like them, because creating a day's note writes) with a labelled row in the phone's `⋯`
menu, and `cmdOpenCalendar` in the palette. The SIDEBAR's small grid is untouched and keeps its own
job; the two share `shared/calendar.ts` and nothing else.

**TWO GRIDS, DELIBERATELY — and this replaces "the ONE month grid".** Until 3.18 the rule was that
`components/CalendarGrid.tsx` draws every month in the product, and the Sigils page's copy was the
proof it could. It cannot draw this one. `CalendarGrid` is a DATE PICKER: a `<table>` of day
numbers with up to two dots under each, whose cell is sized to a number and whose whole job is to
answer "which day", and it is the right thing in a 295px fold. The page's cell is a paragraph — the
number, a dot for the day's note, up to four named lines and `+N more` — and its selection is
`aria-selected` on a `gridcell` rather than a pressed button. Widening the picker to carry content
would have put every one of those decisions behind a prop and made the fold pay for them; so the
page draws its own, the two share the month arithmetic (`monthCells`, `firstOfMonth`, the calendar
and week-start resolution) and nothing else, and `client/loggedDays.ts` has exactly ONE caller, the
sidebar's fold. The duplication this release spent itself removing was *the same drawing in two
places*; this is two drawings answering two questions, and the shared half is shared.

**What a day held is pure and stored nowhere.** `shared/dayAgenda.ts` — no DOM, no fetch, loaded by
`node --test` (tests/dayAgenda.test.ts) — takes the days of the drawn month, the `dailyNotesByDay`
map, the vault's sigils, the trackers and the device's Orbits log, and answers
`Map<iso, DayAgenda>`: the daily note's path, the sigils that LOGGED that day with the status
`dayStatus` gives them (so the month and the card can never disagree), the decks graded with how
many were kept, the sittings summed per tracker, and a `count` of all of it. ONE PASS PER MONTH,
not one per cell: each source is bucketed by day once. `localDay` and `ReviewGrade` are
shared/weekReview.ts's, because the week and the month must reckon a day the same way. Nothing is
written — the weekly review's argument, and "the note is the state" allows no second ledger.

**One control per cell; the day pane is where you act.** A cell is ONE button (the number, a dot
for the day's note, up to four lines of what the day held, then `+N more`) and pressing it SELECTS
the day; the pane beside the grid — under it below 900px of PANE width, which is a container query,
so a calendar in half a split behaves like a phone — shows that day in full with every row a door
to its note, led by "Open the day's note" / "Create the day's note" through `openPeriodicNoteAt`.
A single click never writes a file; the labelled button does, and a double-click on a cell is the
shortcut. The grid is ONE tab stop with the sidebar grid's keys (arrows mirrored under RTL,
Home/End the row, PageUp/PageDown the month, crossing an edge turns the page) and the pane is the
next stop, so nothing in a cell is reachable only by mouse. The selection is `aria-selected` on the
one `gridcell` that holds it, never `aria-pressed` on the button inside: a day is not a toggle, and
saying so forty-two times is all a screen reader would hear.

**The Timeline reads the same aggregation (3.28).** `agendaByDay` gained the notes written,
published and caught on a day (`AgendaSources.written`, from `GET /api/timeline`), the daily note's
excerpt, `agendaDays` (every day with anything, newest first) and `{ project: false }` for a
reader of what happened. The Calendar passes none of them and draws what it drew. The page's head
carries a door to `~timeline` (`timelineDoor`, false on the phone, whose Calendar keeps it in its
top bar's `⋯`).

## Orbits — spaced repetition (`shared/decks.ts`, `shared/srsSession.ts`, `client/orbits/`, `server/deckImport.ts`)

The vault's own spaced-repetition system, replacing Anki for the owner ("screw Anki… let's make
our own version and integrate it"). A card comes back around on its schedule, which is what an
orbit is: the page is **Orbits** (المدارات), inside it a **deck** (مجموعة) is a note and a **card**
(بطاقة) a line, a study run a **session** (جلسة). Lineage, once: the system was built under the
working name Constellations (a deck a constellation, a card a star) and renamed before it shipped, <!-- lineage -->
and the page took the name the daily routine wore in 3.15 (that page is Sigils now) — so `/orbits`
and `~orbits` mean THIS page from 3.16, a 3.15 workspace with the routine page open opens Orbits
instead, and the 3.15.0 what's-new slide says so. `/review`, `~review`, `/constellations` and <!-- lineage -->
`~constellations` are aliases, not a second page. `npm run check-names` fails on the old words.

**The note is the state.** A deck is a Markdown note with a ```` ```deck ```` fence (first one wins:
`title`, `icon`, `kind`, `new per day`, `steps`, `tags`); its cards are the card lines
shared/cards.ts already reads (`Card` there is the scanned line; `DeckCard` in shared/decks.ts is
one face of it, named `${path}#${line}#${dir}`), in document order, with two extensions —
`front::back::extra` (the third segment shows on the answer side) and the plugin's `front:::back`
reversed pair (two cards, `dir: "fwd"|"rev"`, two schedules in ONE comment
`<!--SR:!d1,i1,e1!d2,i2,e2-->`). Headings are sections; a line's trailing `#tags` are its tags; a
fence's contents are never cards; a note without the fence keeps being the implicit "Everything
else" grouped by top folder. A card's schedule is the Spaced Repetition plugin's comment, unchanged,
so the vault stays ONE vault with the plugin; nothing else about a card lives outside the note except
two caches that can be rebuilt: the session's learning steps (memory only) and the per-device grade
log (`astrolabe.orbits.log`, ring of 5000) the statistics are drawn from.

**Kinds.** `basic` (default: fwd only), `reversed` (rev only), `both` (every `::` line behaves as
`:::`), `typed` (an input on the front, compared after trim / case-fold / NFKC / kana-width, diffs
coloured — the grade stays the reader's), `cloze-only` (`::` lines ignored).

**Scheduling.** Stored state is SM-2 (`shared/srs.ts`, `review()` untouched). A session adds Anki's
learning queue IN MEMORY (`shared/srsSession.ts`: `createSession` / `nextCard` / `gradeCard` /
`previews` / `skipCard` / `waitFor` / `remaining` / `retention`, pure and clock-free, every call
returns a NEW session — which is what makes undo one field): a new card, or an again'd review,
climbs `steps` (default 1m, 10m) within the session; graduating (good after the last step, easy at
any) writes the first SM-2 comment (1d / 4d); again on a review is a lapse — SM-2's `again` written
AND a 10m relearn step in memory. The daily NEW limit (`new per day`, default 10, 0 = reviews only)
is per deck per local day in localStorage (`astrolabe.orbits.new.<path>.<YYYY-MM-DD>`); reviews are
never limited; study ahead asks for no new cards. Order: learning due → reviews (soonest due, then
document order) → new (document order, to the limit), one new after every four reviews. Retention =
good+easy over all grades in the last 30 days from the log; the forecast, the streak and the
new/young/mature split are `client/orbits/stats.ts`, computed from the schedules, never stored.

**Server.** `deckOf` fills `NoteRecord.deck`; `GET /api/orbits?today` (meta + counts + sections, the
implicit one last; `today` is the CLIENT's day), `GET /api/orbits/cards?path&section`,
`POST /api/orbits/card/review {path, line, dir, grade, today, restore?}` (writes through
`writeCardSchedule`; `restore` present is the session's UNDO — the previous schedule written back
verbatim through `restoreCardSchedule`, or null to take out the comment a first grade wrote, a pair's
twin slot kept; `/api/card/review` stays as the legacy alias), `POST /api/orbits` (creates
`<folder>/<title>.md`, default `Orbits/`, via `serialiseDeck`), `POST /api/orbits/import` (multipart
`.apkg` / `.csv` / `.tsv`, server/deckImportRoutes.ts). ONE serialiser: `serialiseDeck` /
`cardLineOf` in shared/decks.ts write the modal's note and the importer's alike — a front that begins
with `#`, `>`, `|`, `- [` or three backticks is escaped with a backslash, a `::` inside a face is
spaced to `: :`, a pair's comment carries two schedules, a cloze's comment sits on the line after it —
and the importer's readability check reads its own line back through the scanner. The .apkg reader
is `node:zlib` + a small zip reader + `node:sqlite` behind a dynamic import with a plain error on a
Node older than 26 — no new dependency on either side, ever. Import mapping: Basic → `front::back`,
Basic (and reversed) → `front:::back`, Cloze → `==cloze==` highlights, extra fields → `::extra`,
media → the attachments folder beside the note as `![[file]]`, Anki's scheduling (factor/10 is the
ease ×1000 already; due days from the collection's `crt`) → the SR comment, one note per deck,
subdecks → sections; what cannot be kept is counted and reported by reason (`suspended`, `empty`,
`frontTooLong`, `extraTemplates`, `unreadable`, `mediaUnsupported`, `mediaMissing`).

**Client.** Shelf (`/orbits`): one card per deck (icon, title, tags, due/new/total, 30-day retention
sparkline, Study, Study section ▾), "Everything else" last, header with today's due and the streak,
"New deck…" and "Import…", an empty state that teaches the syntax. Session (`/orbits/<path>`, the
note path with its extension encoded a segment at a time, a section after `#`): one card at a time,
breadcrumb, progress, Show answer (Space/Enter), grades 1–4 with interval previews (step text for
learning cards), Edit (the note at the line, new tab), Skip (bury for the session), Undo (one level,
sends `restore`), end-of-session summary. Stats drawer: retention 30d, forecast 30d, states, the ten
hardest. The queue is `client/orbits/queue.ts` (`CardQueue`, keyed by text and order rather than
line, so a comment line written by a first grade does not lose the reader's place) over
`shared/srsSession.ts`; writes go one at a time, each followed by a re-read. Palette: Open Orbits,
Study due cards, New deck…, Import an Anki deck…. The status-bar Orbits door is the 3.15 ring glyph
(`data-testid="orbits-door"`). i18n keys are prefixed `orbits`; the surface's own copy is
`client/orbits/copy.ts`, gated by tests/srsSession.test.ts.

**The chips survive a tick (3.19.1).** The Sigils page patches a standing card by MORPHING the
fresh draw into it (client/morph.ts), and a morph carries only what the fresh draw holds — the
chips arrived a tick later on a card that was never placed, so every checkbox tick blanked the
counts until a reload (the owner: "all the orbits linked items stop showing how many orbits are
due"). `decorateDeckTasks` now dresses the card SYNCHRONOUSLY from the shelf's last answer
(`lastList`) so the morph carries the chips, then asks the shelf again and dresses whichever card
is live by then (`card` if placed, else the page's `live()` — the standing one). AND A SLOT WITH
NOTHING DUE TICKS ITSELF when the counts arrive (`tickClearSlots`, the session-end rule applied at
draw time; only slots whose every deck the shelf lists, one write per card, none when nothing
changes) — a "review [[Hiragana]]" with no card due sat open asking the owner "what am I supposed
to check?".

**The sigil link (`client/routines/orbits.ts` — the whole of the Sigils touch).** A slot text or
every-day item that wikilinks a deck note shows, on the sigil card, the link by its name and a chip
per linked deck, "N due · Study" (`decorateDeckTasks`, run by the Sigils page after each card draw;
counts from `GET /api/orbits?today=<the reader's day>`, cached a few seconds; the chip is an
`<a href="/orbits/<note path with .md, a segment at a time>">` — the router's `orbitsUrl` shape —
pushed through the router; the checkbox's aria-label loses the brackets too). `tickSlotForDeck(path)`
is the ONE export the session-end handler calls when a session ends with nothing due: it ticks, for
today, every slot of every live sigil that links that note, through `POST /api/routine` — the same
log line the checkbox writes — and a slot that links several decks is ticked only when none of them
has a card due. Task ↔ row alignment is positional: the renderer draws `tasksFor(plan, today)` in
order, one `<li>` each.

**Docs.** `docs/orbits.md` + `docs/ar/orbits.md`; the site keeps answering at `flashcards/` through
`MOVED` (the 3.13 deck slide links it), as `routines/` does for `sigils/`. Kanji data in the owner's
example decks is KANJIDIC2 (EDRDG, CC BY-SA 4.0), attributed in the notes' frontmatter and in the
docs.

**Today's decks (3.28)** are the shelf's own counts (`GET /api/orbits?today=`, `counts.due > 0`);
Study is `openOrbits(deck.path)` on the desktop and `orbitsTabFor(deck.path)` on the phone. The
year in review's "cards reviewed" is this device's Orbits log, and says so.

## Block references, live queries, tasks, mentions, periodic notes, versions, PDF search, export

Eight features, one rule under all of them: the note is the state, Obsidian reads the same syntax,
and every fence's PARSER is a static import while its renderer is a lazy chunk.

**Block references (`shared/blockId.ts`).** ` ^id` at the end of a paragraph or list item (or on a
line of its own under it) is the block's address. `markdownAnchors()` emits `kind: "block"` anchors
with the caret KEPT in the id, so `findAnchor`'s exact pass matches `[[Note#^id]]`; the indexer keeps
blocks out of the vault-wide `\ref` labels. `renderNoteSlice` — the single decider — slices one block
(`markdownBlock`) for a block anchor and a section for a heading. The reading renderer strips the
marker and puts the id on the `<p>`/`<li>` (with `assignIds`); the live preview hides it off the
caret like a `%%comment%%`; the hover card shows the block alone. "Copy link to this block" is a
palette→editor event (`COPY_BLOCK_LINK_EVENT`, the find-in-note shape): the editor mints an id on
the block's last line as one dispatch and copies the link.

**Query fence (`shared/queryFence.ts`, `client/reading/query.ts`).** Body = operators + `show:` /
`sort:` / `limit:` / `as:`. `GET /api/query` walks the index through `queryNotes()` — uncapped by the
sidebar's fifty, scoped like search — and `prop:key=value` joins the operators, reading
`NoteRecord.props` (scalar frontmatter, keys lowercased, lists joined). Rows are `.s-rv-wikilink`
anchors so the reading root's one delegated handler navigates. A note's own date prints in UTC (it
is a calendar day at UTC midnight).

**Tasks (`shared/tasks.ts`, `client/reading/tasks.ts`).** The Tasks plugin's grammar exactly.
`NoteRecord.tasks` (full-source lines); `GET /api/tasks`; `POST /api/task` flips ONE line through
`toggleTaskLine` (✅ stamped/removed) under the mtime precondition, 409 when the line is no longer a
task. The ```tasks fence filters with the plugin's phrases; live boxes only where `live` is passed
(the editor widget for an admin, the Routines page's "due by today" section).

**Unlinked mentions (`mentions()` in the indexer, `client/components/MentionsPanel.tsx`).** Title
and aliases as whole words, folded like search, never inside `[[…]]`, inline code, a fence, the note
itself or a template; one mention per line. `POST /api/mentions/link` re-checks the slice against
the phrase, then splices `[[Title]]` or `[[Title|phrase]]` (`linkSpellingFor`: the path when the
basename is not unique). The panel re-reads on `astrolabe:vault`.

**Periodic notes (`shared/periodic.ts`, `client/daily.ts`).** A format of moment-style tokens
(`YYYY MM DD ww [literal] /`) names a day or an ISO week and reads it back; Gregorian and Western
digits by construction. Five settings (`dailyFolder`, `dailyFormat`, `dailyTemplate`,
`weeklyFormat` — "" is off — `weeklyTemplate`), validated in server/settings.ts (`periodFormat`,
`templateNote`), primed once by `loadPeriodic()` from App.tsx. `openPeriodicNote(kind, offset)`
walks from the open daily note when it is one; the period's template wins over the default.
`GET /api/onthisday` reads the archive from `dateMs` and trackers' `finished:`; nothing stored.

**Note versions (`server/versions.ts`)**, **PDF search (`server/pdfText.ts`, `server/snippet.ts`)**
and **Export (`server/export.ts`, `shared/zip.ts`, `shared/exportLinks.ts`, `client/export/`)** were
built in isolated worktrees and merged; their headers carry their contracts. Two notes for the next
reader: `server/pdfText.ts` reaches pdf.js by a DYNAMIC `import("pdfjs-dist/legacy/build/pdf.mjs")`
— the second door into that vendor after the reader, and `pdfjs-dist` therefore had to join
`desktop/package.json` (the desktop spawns the server beside the packaged app; `check-desktop`
caught it); and `compileFilters`' `in:` case answers through `searchScope()` and `continue`s, so its
negation lives in the scope, not the predicate.

## Bookmarks, layouts, the tag tree, pace, scripture, harakat, the sweep, cards, offline <!-- lineage: 3.13.0 shipped cards as "flashcards" -->

**Bookmarks (`shared/bookmarks.ts`, `client/bookmarks.ts`).** `Bookmarks.md` at the vault root IS
the list — one `- [[Note]]` per line, parsed and rewritten whole by the pure model (`add`, `remove`,
`reorder`). The sidebar draws it as a starred section above the tree (`BookmarksRows.tsx`); the
chord `Ctrl/Cmd Shift B` sits BEFORE the plain `b` branch in App.tsx's keydown, because a later
branch already swallows `b`. Obsidian reads the same note as a list of links.

**Named layouts (`server/layouts.ts`).** `ASTROLABE_DATA/layouts.json`, the books.ts shape (version 1,
never-throwing read, tmp+rename 0o600, a cap). `PUT /api/layouts/:name` stores a whole `Workspace`;
`applyWorkspace(ws)` in the store swaps it in and prunes against the tree with a `Set` of existing
paths, exactly as boot does. The palette's "Save layout as…" is a prompt-mode command handled in
`submitPrompt`.

**Tag tree (`shared/tagTree.ts`).** `a/b/c` folds under `a` with ONE count per branch (a note tagged
`a/b` counts once for `a`); open branches and the sort (count | name) are device keys
(`astrolabe.tags-open`, `astrolabe.tags-sort`).

**Pace (`shared/tracker.ts`).** `pace:` (units per day) or `due:` (a date) on a tracker;
`paceProjection()` answers the other one from progress and today. A routine with `book:` gains
`{ key: "read", book: true }` as its first task, and ticking it moves the tracker by the pace.

**Ayah and hadith callouts (`shared/quranRefs.ts`, `shared/hadithRefs.ts`, `client/reading/ayah.ts`).**
`> [!ayah] 2:255` draws the verse from `client/data/quran-uthmani.json` — 1.3 MB, a LAZY chunk
(`ayah-*.js`) that check-bundle FORBIDS in every first paint; the parser is a static import, the
drawing is not. `> [!hadith] Bukhari 1` asks `GET /api/hadith?ref=` which reads the corpus folder
(`hadithFolder` setting) through `NoteRecord.hadithRef` — kept on every record, filtered at lookup,
so changing the folder needs no reindex. The caption's `dir="auto"`, because a reference is Latin
under Arabic text.

**Harakat (`shared/tashkeel.ts`, `client/editor/harakat.ts`).** `Ctrl/Cmd Alt ;` opens a palette at the
caret; the selection menu's Arabic page strips or copies-without. `shared/tashkeel.ts` removes
exactly the set the palette can write — the two doors agree about what a diacritic is. The palette
opens a tick AFTER the selection menu closes (`setTimeout 0`), or `run()`'s own focus takes it away.

**Unused attachments (`server/unusedAttachments.ts`).** `GET /api/attachments/unused` walks the index
for every file no note embeds or links; the modal moves what is ticked to the trash — never a
delete. Toasts sit at z-index 430, above the modal.

**Cards (`shared/cards.ts` — `shared/flashcards.ts` until the sweep, `makeCard` in the selection menu; `shared/srs.ts`, `client/review/`).** <!-- lineage --> No new syntax: a
`==highlight==` paragraph is a cloze, a `> [!quote]` callout (the PDF reader's citations) a quote
card, `Q::A` or `Q\n?\nA` a question. `scanCards` walks outside fences and frontmatter; the schedule
is the Spaced Repetition plugin's `<!--SR:!date,interval,ease-->` on the line after the block (the
end of an inline card's own line), written by `writeSchedule` with every other byte kept, so
Obsidian's plugin and the Review page share one vault. `review()` is SM-2 as the plugin applies it
(1, 6, then × ease; ease floor 1.3). `NoteRecord.cards`; `GET /api/cards`; `POST /api/card/review`
grades ONE card by its line and 409s when the line is no longer that card. The Review page keys
its queue by `path#kind#front`, NOT by line — the first grade inserts a line and moves every card
below it. The reading renderer drops SR comments outside fences (`withoutSrComments`); the editor
shows them as source. `~review` is registered exactly where `~routines` is: workspace, store,
router, Pane, Tabs, palette, MUST_SPLIT.

**Offline reading (`shared/offlinePolicy.ts`, `client/sw.ts`, `client/offline.ts`).** The worker is a
switch over the policy: shell and the note reads (`/api/me`, `/api/tree`, `/api/note`,
`/api/backlinks`, `/api/settings`, `/api/boot`) network-first with the copy as fallback; assets
cache-first; everything else bypassed — every write, every other API. Only clean `200 basic`
answers are kept. Keys are URL STRINGS and matches pass `ignoreVary` (the API carries `Vary:
Cookie`). One cache per build (`astrolabe-offline-<version>`); activate deletes the others. Built by
`scripts/build-sw.mjs` as the second step of `npm run build` (esbuild, iife, `__APP_VERSION__`
defined) to `dist/sw.js`; the server serves it with `Cache-Control: no-cache`; check-bundle fails a
dist whose sw.js is missing or built for another version — `vite build` alone is not a build.
Registration follows the session: an admin with the device key `astrolabe.offline` not "off";
anything else unregisters and deletes the copy (sign-out, a visitor, the desktop app). A fallback
answer carries `X-Astrolabe-Offline: 1`; `client/api.ts` turns the TRANSITIONS into
`astrolabe:served-offline` / `astrolabe:served-online`, and `useOffline()` — the strip and the
shell's `s-app--notice` row (renamed from `s-app--preview`, shared with the preview banner) —
reads that OR `navigator.onLine`, seeded from `servingOfflineNow()` for a listener that mounts
after `/api/me` came back. Edits offline are the editor's retry's business, not the worker's.

## The month, the margin, the week

**Periodic notes grow the month and the year (`shared/periodic.ts`, `client/daily.ts`).** The
format IS the declaration: a week token makes a week, a day token a day, a month token with no day
a month (`YYYY-MM`), the year alone a year (`YYYY`); `periodKindOf`, `periodStart`, `periodEnd`,
`shiftPeriod` are the arithmetic, and a name reads back to its period's FIRST day at local noon.
Settings: `monthlyFormat`/`monthlyTemplate`, `yearlyFormat`/`yearlyTemplate` beside the weekly
pair ("" is off; `periodFormat` checks a format against its KIND, so a monthly name may not carry
`DD`), `uniqueFolder`/`uniqueFormat` (the Zettelkasten stamp, `YYYYMMDDHHmm`; must be finer than a
day; `freePath` takes ` 2`, ` 3`… for two ideas in one minute — ONE Vault row since 3.28,
"Unique notes", its two fields in `settings/PairControls.tsx` so the index counts the row once), and `launch` (`shared/launch.ts`:
`resume` — stored as its absence — `sigils`, `orbits`, `today`, or a note path; `/api/me` carries it
to the admin only, and `openLaunchDoor` in the store opens it ON TOP of the restored session, never
over a deep link). THE ONE DOOR is `ensurePeriodicNoteAt(kind, date)` → `{ path, created } | null`
(creates through `createNote` + the period's template, toasts its own refusals) with
`openPeriodicNoteAt` on top of it; `openPeriodicNote(kind, offset)` walks from an open periodic note
of a kind at least as fine, `openDailyNote()` is always TODAY. `periodOf(path)` names a path's
period, `periodLabel` says it in the site's calendar (the status bar's crumb), and `dailyNoteLabel`
is the short calendar-aware date the capture sheet's select and toast want.

**The month grid (`shared/calendar.ts`, `client/components/CalendarGrid.tsx`).** `monthCells(date,
calendar, order)` — Gregorian from `Date`, Hijri from Intl's Umm al-Qura tables, never a hand-rolled
month — rows of seven from the site language's first day (`weekOrder`). Dots come from the tree
(`dailyNotesByDay`: a string compare per note, nothing stored) and from the sigil logs the caller
hands in; the grid is ONE tab stop (arrows walk, mirrored under RTL; Home/End the row; PageUp/Down
the month) and a click goes through `openPeriodicNoteAt`. The sidebar draws it for an admin, and
for a visitor only when a daily note is published. It is a DATE PICKER and nothing more; the
Sigils page drew it at its top in 3.17 and does not any more (see *The Calendar page* above).

**The editor conveniences.** `{{cursor}}` and `{{prompt:Label}}`/`{{VALUE:Label}}` in
`client/templates.ts` (`templatePrompts`, `fillPrompts`, `takeCursor`; the sheet is
`components/TemplateValuesSheet.tsx`, Esc cancels the whole insertion). `@` at a word start opens
`client/editor/dateMention.ts` over `shared/naturalDate.ts` — bilingual in ONE table, bare numerals
refused, a Hijri month NAME makes a Hijri date whatever the site prints — and inserts
`[[<daily path>|<weekday or long date>]]`. The palette's `Create "…"` row, `Load layout: <name>`
rows (`client/layouts.ts`) and `New unique note` (`client/uniqueNote.ts`). `countWords` takes a
selection (`shared/wordCount.ts`); `client/tagPreview.ts` is the hover card over `/api/search?q=tag:`.

**The reading surfaces.** `shared/footnotes.ts` (`footnotesOf`, `stackSidenotes`) feeds
`components/FootnotesPanel.tsx` (under the outline; `client/footnoteNav.ts` is the hop event) and
`reading/sidenotes.ts` (the reading view only; on at a pane of `SIDENOTE_MIN_COLUMN` 1180px with a
180px margin, off on paper — print.css restores the foot). `shared/mediaEmbeds.ts` decides
`![[Book.pdf#page=42]]` (`pdfpage`, drawn by `reading/pdfPage.ts` through the lazy `books/pageImage.ts`)
and `![[lecture.mp3]]` (`audio`, `reading/audio.ts`; `[[…#t=1:23]]` seeks the player on the page).
`as: timeline` in a ```` ```query ```` fence (`shared/timeline.ts`, `by:` a date key) and
```` ```mermaid ```` (`reading/mermaid.ts`, imported only when a fence is met; `securityLevel:
"strict"`, themed from the live tokens, redrawn on a theme flip; check-bundle forbids it from every
first paint).

**Four views of the vault.** `Bookmarks.md` rows: `- [[Note]]`, `- [[Note#Heading]]` (§) and
`` - `query` `` (⌕) — `shared/bookmarks.ts`; Ctrl/Cmd+Shift+B keeps or removes the whole-note line
only. The properties shelf (`components/PropsShelf.tsx` over `/api/props`; a click runs
`prop:key` or `prop:key=value`, quoted when needed). Graph groups by query (`client/graphPrefs.ts`
`ColorBy "query"`, `QueryGroup` rows up to `QUERY_GROUPS_MAX`, first match wins, painted from `/api/query/paths`). Nearby
(`shared/nearby.ts`: TF-IDF cosine over the index's folded terms, tags weighted up, no stop list;
`server/nearby.ts` caches per-note term counts by mtime and the weighed corpus per index revision
`nearbyRev`; `components/NearbyPanel.tsx` under the backlinks, admin only).

**Reading sessions.** `shared/readingSession.ts` is the quiet clock (starts on the first turn,
three minutes idle stops it, a page left under `DWELL_MS` was not read); `client/books/session.ts`
logs a sitting into the book's tracker — found by `file:` then by title among `kind: book` — as one
`sessions:` line (`shared/tracker.ts` `appendTrackerSession`/`parseSessions`, readable in
either language, hand-written lines count) and moves `progress:` when the tracker counts pages;
`routines/books.ts` ticks the sigil slot that links the tracker or the PDF (the `book:` task only
when the sitting covered the pace); the toast's Undo takes back exactly what was written, from the
note as it is THEN. The stash (`localStorage`, per book) resumes a sitting within half an hour and
logs an older one for its own day. `TrackerMeta` carries `file` (null to a visitor) and `sessions`.
`Highlights → note` (`client/books/highlightsNote.ts`, `shared/highlightsNote.ts`) writes between
`<!-- astrolabe:highlights -->` markers. The weekly review (`shared/weekReview.ts`,
`client/review/ReviewWeekView.tsx`, `/review-week`, a lazy chunk) computes everything on open and
stores nothing; `client/print.ts` `setPrintable` lets it own Ctrl+P while it is on screen.

## Capture: the quick-capture sheet, the clipper, the installable site

**The text arithmetic (`shared/capture.ts`).** `appendCaptured(content, text, time)` puts `- HH:MM
text` at the end of the `## Captured` section (a `##`/`#` heading ends it; a `###` under it does
not), or opens the section at the end of the note; a multi-line thought hangs under its bullet; the
note's own line endings are kept. `clipFileName` is `noteFileName`'s rule (the filesystem's set plus
`[`, `]`, `#`) with control characters and a 120-char cap; `clipNote` writes `source:` (always
double-quoted, `yamlQuote`) and `clipped:` frontmatter, the title as H1, the body. `splitSharedText`
finds the one address a phone put in `text`. The heading is `## Captured` in every language: it is
an address in the note, not chrome.

**The converter (`shared/htmlToMarkdown.ts`).** Own tokenizer, own tree, no dependency (the server
has no build and takes no packages). Renders the dozen tags an article is made of and DROPS
everything else (script, style, forms, media, svg, `<head>`); `contentRoot` picks `<article>`,
then `<main>`, then `<body>`; links and images are made absolute against the page (a `<base href>`
wins), and only `http(s)` survive. Prose is escaped conservatively: `* _ \ [ ] <` inline
(intra-word `_` left alone), and `# > - + 1.` only at a line's start. `<br>` is a two-space hard
break, which is why trailing whitespace is trimmed at the document's end only.

**The clipper (`server/clip.ts`).** `POST /api/clip` is mounted ABOVE the guard and decides for
itself: an admin session, or a token kept in `ASTROLABE_DATA/clip-token` (0600, 192 random bits,
made on first ask, replaced by rotate). The bookmarklet (`bookmarklet()` in shared/capture.ts —
one `javascript:` URL, every string JSON-encoded in) sends the selection as HTML or the whole page
as `text/plain` so no preflight happens, reads the answer through `Access-Control-Allow-Origin: *`
(safe: the request carries the token and never a cookie — SameSite=Lax), and falls back to a form
POST into a new tab when the page's CSP refuses the fetch — a form is answered with a 303 to the
note. A FORM body is what the share target sends too, from the browser the reader signed in with,
so that path rides the cookie. Names under `Clips/` never overwrite (` (2)`, ` (3)`…).
`performKeep` (3.28) is the same door for a kept FEED article: the same `serial` queue, the same
`htmlToMarkdown`, `freeClipPath` with the feed's folder instead of `Clips/`, and `keptNote`
(shared/feeds.ts) for frontmatter `source`/`feed`/`published`/`kept`/`tags` — no `publish:`.

**The sheet (`client/capture.ts`, `client/components/CaptureSheet.tsx`).** Ctrl/Cmd+Shift+D (Shift
beside the daily note's Alt; the plain key is the editor's), the palette row `quick-capture`, store
flag `captureOpen`, lazy and mount-gated like the shortcuts sheet, in `modalUp`. The order of
operations is the contract: today's note is made through `ensurePeriodicNoteAt("day", new Date())`
(client/daily.ts — `openPeriodicNoteAt` is that plus `openNote`; by DATE, not by the palette's walk
from an open daily note, so a line captured over last month's page lands on today) so the daily
template lands; the target's buffer is
FLUSHED (`flushBufferPath`) before the server appends, because the append's precondition is the
file's mtime; and the buffer then ADOPTS the result explicitly (`adoptExternalChange`), because
the SSE echo arrives inside `SELF_SAVE_WINDOW_MS` of the flush and the shell would read it as our
own save. The reading view gets `bumpReload`. The inbox is `settings.captureInbox` (validated like
a template note; `effective.captureInbox`; rides `templateSettings()`), Settings → Vault → Capture.
Phone: the sheet is a bottom sheet with 44px targets under 700px.

**The manifest (`shared/manifest.ts`, `server/manifest.ts`).** `/manifest.webmanifest` and
`/manifest-icon.svg` are open routes on `app` (beside the favicon), generated per request: the
site name (`shortName` cuts at a word), lang/dir, the default theme's swatch read out of
`client/styles/tokens.css` (`themeSwatch`; a custom theme's own `--bg`/`--accent` over its base;
`DEFAULT_SWATCH` when unreadable) as both colours, the raster favicon when there is one, the mark
on a plate as an SVG `any maskable` icon, and the `share_target`. The shell's `<head>` carries
`<link rel="manifest">` and `<meta name="theme-color">` through `injectHead`'s new `extra` tags.
The offline policy classifies both paths as `note` (network-first, kept), never `asset`: they wear
an asset's extension but change with settings.

## Ask the vault (`shared/semantic.ts`, `server/embeddings.ts`, `server/ask.ts`, `server/ollama.ts`, `server/anthropic.ts`, `server/askSettings.ts`)

Meaning search, Related, Suggest links, and questions answered from the notes with citations
(docs/ask.md). Four doors over one index.

**THE INDEX IS LOCAL, KEYED BY WHAT THE MODEL WAS SHOWN, AND IT IS A CACHE.** A note is cut by
`chunkNote()` at ATX headings (outside fences) and, inside a long section, at blank-line
paragraphs, packed to ~300 estimated tokens and never past 400 (a longer paragraph is cut at
sentence ends, then at a space); short paragraphs merge under one heading and **never across a
heading**, because the heading is what a citation opens. Each chunk carries its heading (null
above the first heading and under an H1 that only repeats the note's title), the heading's line
and its own lines in the whole file (frontmatter included — the editor's numbering), and its UTF-8
byte span. The model is shown `Title › Heading\n\ntext` (`embedInput`), and the vector is stored in
`ASTROLABE_DATA/embeddings.db` (node:sqlite, 0600, `WITHOUT ROWID` table keyed `(model, hash)`)
under the SHA-256 of exactly that string. So an unchanged passage is never embedded twice — not
across edits elsewhere in its note, not across a restart, not across a switch to another model and
back — and a renamed heading or note is, correctly, a new vector. Deleting the file costs one pass
and loses nothing; it never travels (configMirror's NEVER list).

**FED BY THE INDEXER, NEVER BLOCKING IT.** `initAsk()` runs after `initIndexer()` and is not
awaited. It reads what exists from `nearbySources()` (path, title, mtime), re-cuts only notes whose
mtime or title moved, and is woken by the vault watcher (`onEvent`) after a 1.5 s settle and a
`whenIndexed()` — the graphCache lesson: an event fires before the note index has applied it. A
pass is single-flight (a trigger during a pass books exactly one more), embeds in batches of 16 so a
query waits for one batch at most, and when Ollama is down or the model missing it records
`lastError`, leaves the passages pending and retries in a minute. Measured on the 2,367-note perf
fixture: the indexer's cold start 739 ms with Ollama unreachable, 741 ms with it embedding (the pass
starts after the boot line); the pass itself 4,565 passages in 55 s on an RTX 4070 SUPER; a warm
restart embeds nothing. `check-perf` passes unchanged with the pass running behind it.

**COSINE IN-PROCESS, NO VECTOR DATABASE.** Vectors are unit-normalized once, so similarity is a
dot product; `rankTop()` keeps the k best without sorting everything. Meaning search answers the
best chunk per note; retrieval for a question takes the top k chunks with at most two per note;
Related compares note centroids (the re-normalized mean of a note's chunks); Suggest takes the best
chunk-to-chunk match per other note and **leaves out every note linked in either direction**
(`notesLinkedFrom` + `notesLinkingTo`). A meaning search on the fixture: ~50 ms request to answer,
most of it Ollama embedding the question.

**THE EMBEDDING MODEL DEFAULT IS `embeddinggemma`, AND IT WAS MEASURED.** On the 61-note bilingual
verification vault with 24 paraphrase questions (12 English, 12 Arabic): `all-minilm` put the
right note first for 9/12 English and **0/12 Arabic**, and found a note's other-language counterpart
in the top three 0/23 times; `embeddinggemma` 9/12 and 9/12, counterpart 20/23; `bge-m3` 9/12 and
5/12, 15/23; `paraphrase-multilingual` 3/12 and 8/12, 15/23; `nomic-embed-text` 10/12 and 2/12,
0/23. The table is in docs/ask.md. `embedPrefixes()` carries the query/document instructions the
families trained with them need (nomic, embeddinggemma, mxbai, snowflake); every other model is
shown the text bare.

**AN ANSWER IS GROUNDED ONLY IN THE RETRIEVED PASSAGES, AND SAYS SO WHEN THEY DO NOT ANSWER.**
`ASK_SYSTEM` is five rules in English (models follow English instructions best; rule 5 makes the
answer follow the question's language): nothing but the excerpts, a `[n]` after every sentence that
uses one, a fixed one-sentence refusal in both languages ("The vault says nothing about …" /
«لا تقول الخزانة شيئًا عن …») when they do not answer, and a plain correction when the question
assumes something they do not support. Ollama chat runs with `think: false` and temperature 0.2 —
a reasoning model's minute before the first word is the wrong trade for a side panel. Verified
with the real `qwen3.5:9b`: a wrong-premise question ("What did Ibn Rushd write about sourdough
bread?", over a vault holding both subjects) answered with the refusal, in English and in Arabic.

**CITATIONS ARE PARSED, NEVER TRUSTED.** `splitCitations()` reads `[1]`, `[1, 3]`, `[1][2]` and
Arabic-Indic digits; a number with no passage behind it is dropped and the panel says one was.
"Copy as note" (`answerMarkdown`) writes `source: ask`, `asked`, `model`, `local` in the
frontmatter, the question as the H1, every citation as `[[Note#Heading|n]]` in the vault's link
spelling (`linkSpellingFor`), numbered by first citation, and a Sources list of what was cited —
through `promptExtractPath`, which prints the path before anything is created. Never silently.

**`/api/ask` STREAMS NDJSON** — `sources` first (with the model, provider and whether it is
remote), then `delta`s, then `done` with the time to the first token, or one `error` with a stable
`AskErrorCode`. `application/x-ndjson` is outside the compression middleware's types, so nothing
buffers it; a cancelled stream aborts the model's request.

**EVERY ROUTE IS ADMIN-ONLY.** The index reads every note's body, published or not; a meaning
search, a related list or an answer served to a visitor would be an oracle for unpublished notes.
401 to a visitor and to an admin wearing the preview header, and the client does not draw the
doors in preview. Nothing reaches the public shell.

**ANTHROPIC IS OPTIONAL, SERVER-SIDE AND SAID OUT LOUD.** `settings.ask.provider: "anthropic"`
sends the question and its retrieved passages — never the embeddings, which are always local — to
`POST https://api.anthropic.com/v1/messages` with `stream: true` (`x-api-key`,
`anthropic-version: 2023-06-01`; `content_block_delta`/`text_delta` read, an `error` event is an
error), default model `claude-sonnet-5`. Raw HTTP rather than the SDK because the product carries no
model SDK for its local path either and one optional door does not justify a dependency. The key is
**write-only** (`PATCH {anthropicKey}`, staged and applied after the whole patch validates, like
`gitToken`), stored in `ASTROLABE_DATA/ask-credentials.json` at 0600, never mirrored, never read
back (`effective.ask.keySet` only), scrubbed from any error text. The panel names the model and
"on this machine" / "sent to Anthropic" before the question is asked and after it is answered.

**OLLAMA DOWN IS A STATE, NOT A FAULT.** Each route answers 503 with `ollamaDown` or
`noEmbedModel`; each door prints one translated line (`askErrorLine`) and nothing else — the meaning
results, Related, and the panel say it, Suggest is not drawn — and the exact search is untouched.

**SETTINGS → ASK IS ITS OWN TAB** (7 rows), not rows on Vault (already 14): which models read and
answer is its own question. `settings.ask` travels with the vault like every instance setting; the
key does not. The tab is hidden on a pocket vault, whose server has no `/api/ask`.

**THE DOORS.** The sidebar search's third icon button (two overlapping circles, `aria-pressed`)
flips the box to meaning — the words stay — and is remembered per device
(`astrolabe.search-meaning`, not travelling); `SemanticResults.tsx` is its lazy chunk. The palette's
**Ask the vault…** takes the question in prompt mode and opens `AskPanel.tsx` (lazy, mount-gated on
`askOpen`, in `modalUp`); **Search by meaning…** flips the sidebar. The phone's ⋯ menu carries
Ask the vault. Related and Suggest links render inside NearbyPanel's lazy chunk
(`MeaningPanels.tsx`), Related deduped against Nearby's rows; Suggest's Link inserts at the caret
through `applyToBuffer` (one undoable change, spaced as a word), or appends through
`applyNoteContent` when no editor holds the note. The answer panel closes itself after Copy as note
so the toast's Open is not under the scrim.

## Voice notes: spoken on a phone or a desk, transcribed on the owner's machine

The recorder is a half of the quick-capture sheet; the words are made by the owner's own server;
the recording and the words land in the vault. `shared/voice.ts` (every rule, pure),
`server/voice.ts` (the door and the writes), `server/voiceQueue.ts` (one at a time),
`server/voiceEngine.ts` + `server/voiceWorker.ts` + `server/voiceAudio.ts` (the models, the child
and its two engines, the decode and the windows), `client/voice/*` +
`client/components/VoiceRecorder.tsx` (the recorder, lazy), `client/components/settings/VoiceEngineNote.tsx`
+ `voiceStatus.ts` (the row and its words),
`mobile/src/voice.ts` (the share sheet's), `electron/permissions.ts` (the microphone fence).

### ON A GPU THE ENGINE IS WHISPER.CPP, AND THE NUMBERS CHOSE IT (3.24.0)

The brief allowed two engines that install as npm dependencies of this repo with nothing global
and no Python: whisper.cpp through a prebuilt N-API binding (`@fugood/whisper.node` — CPU, Vulkan
and CUDA builds, no compiler at install), and ONNX whisper in Node (`@huggingface/transformers`,
onnxruntime-node, CPU). Both were measured on the same two clips — 60 seconds of Arabic and 60 of
English, the same passage in both, synthesized by Meta's MMS-TTS (VITS, through transformers.js;
`espeak-ng`'s Arabic turned out to be unintelligible to EVERY model, detected as English or Latin
and scored ~100% WER, so it could not rank anything) — decoded from WebM/Opus exactly as a browser
records, on the owner's machine (RTX 4070 SUPER 12 GB shared with a running Ollama holding 7.7 GB,
16 cores, load average ~20 from other work during the runs). Error rates are word / character,
after folding harakat, the alef family, tatweel and punctuation:

| engine | model (download) | runs on | Arabic WER / CER | English WER / CER | 60 s of Arabic / English |
| --- | --- | --- | --- | --- | --- |
| **whisper.cpp** | **large-v3-turbo-q5_0 (574 MB)** | **Vulkan** | **11.4% / 4.9%** | **4.6% / 2.8%** | **0.51 s / 0.52 s** |
| whisper.cpp | large-v3-turbo f16 (1.62 GB) | Vulkan | 17.1% / 6.7% | 5.2% / 3.6% | 0.77 s / 0.59 s |
| whisper.cpp | small f16 (488 MB) | Vulkan | 21.4% / 5.4% | 8.5% / 3.5% | 0.52 s / 0.51 s |
| whisper.cpp | small | the prebuilt CPU build | — | — | did not finish in 240 s |
| ONNX (transformers.js) | whisper-large-v3-turbo q8 (1.1 GB) | CPU | 30.0% / 15.3% | 2.6% / 1.3% | 30.5 s / 35.9 s |
| ONNX (transformers.js) | whisper-small q8 (241 MB) | CPU | 45.7% / 29.3% | 28.8% / 26.5% | 15.1 s / 13.0 s |

Arabic first, speed second, and whisper.cpp wins both by a distance. Two findings decided it as
much as the table did:

- **The ONNX pipeline cannot auto-detect.** Given no language, transformers.js logs "defaulting
  to English" and runs the English decoder over Arabic speech — which whisper answers with an
  English TRANSLATION (the Arabic clip came back as "The morning of the book was over before the
  door was opened…"). A setting that defaults to "detect" cannot sit on an engine that cannot.
  whisper.cpp detected `ar` and `en` correctly on both clips.
- **The quantised turbo beat its own full-precision file** on Arabic (11.4% against 17.1%, the
  f16 file drifting into a repetition loop near the end) at a third of the download. It was the
  default until the processor got an engine of its own (below); it is still the choice for a GPU.

**The GPU path is Vulkan here, and that is the portable one.** The CUDA prebuilt links the CUDA 12
runtime and this machine carries CUDA 13, so it refuses to load; the package's own loader answers
a refused build by silently falling back to the CPU build and caching THAT as the module, so the
worker (`server/voiceWorker.ts`) asks each GPU build whether it loads BEFORE handing it to the
loader, CUDA then Vulkan (on a Mac the default build is the Metal one). Vulkan runs on any vendor's
current driver, integrated GPUs included.

### VOICE NOTES WITHOUT A GPU: THE PROCESSOR IS FIRST-CLASS

The owner: "make sure that is not dependent on gpu", and "other people with no good gpu will use
app". **whisper.cpp's prebuilt CPU build cannot be that path**, and that is a measurement, not a
guess: `objdump` finds no AVX register in `@fugood/node-whisper-linux-x64` (nor in the Vulkan or
CUDA builds' own CPU code — the build targets baseline x86-64), and its bench runs one thread
whatever `maxThreads` says. Ten seconds of speech took the small model 187 s; the large models did
not finish ten seconds in five minutes. So the processor runs whisper through **sherpa-onnx**
(`sherpa-onnx-node`, onnxruntime inside: prebuilt for Linux, macOS and Windows, x64 and arm64, 33 MB,
no compiler, AVX2/AVX-512 chosen at run time, every core it is given) reading the SAME models'
int8 ONNX exports (`huggingface.co/csukuangfj/sherpa-onnx-whisper-<size>`). It detects the language
per window (`language: ""`), which the transformers.js pipeline measured in 3.24.0 could not.

**The measurements** (a harness in the session's scratchpad, `voicecpu/run.ts` and `matrix.sh`; three recordings synthesized locally by
Meta's MMS-TTS — a 10 s English line, a 31 s Arabic passage, a 2 min 8 s note that goes English →
Arabic → English — decoded exactly as the server decodes; this machine is a Ryzen 7 7800X3D, 8 cores
/ 16 threads, 30 GB, with seven threads of other work pinned busy through every run; "two cores" is
`taskset` to two cores with two threads — the sherpa cells on cores 1 and 2, the median of three
runs; seconds per minute of speech; WER · CER in %, after the 3.24.0 folding):

| engine | model | machine | 10 s English | 31 s Arabic | 2 min mixed | peak memory | WER · CER: English / Arabic / mixed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ONNX (sherpa-onnx), processor | base | whole machine | 5.1 s | 5.5 s | 7.1 s | 862 MB | 0 · 0 / 43 · 14 / 15 · 6 |
| ONNX (sherpa-onnx), processor | base | two cores | 5 s | 6.6 s | 5.3 s | 852 MB | 0 · 0 / 43 · 14 / 15 · 6 |
| ONNX (sherpa-onnx), processor | small | whole machine | 12.9 s | 17.5 s | 17 s | 1432 MB | 0 · 0 / 35 · 9 / 12 · 4 |
| ONNX (sherpa-onnx), processor | small | two cores | 13.8 s | 19.9 s | 15.5 s | 1454 MB | 0 · 0 / 35 · 9 / 12 · 4 |
| ONNX (sherpa-onnx), processor | medium | whole machine | 71.3 s | 96 s | 55 s | 3149 MB | 0 · 0 / 18 · 4 / 10 · 4 |
| ONNX (sherpa-onnx), processor | medium | two cores | 143 s | 578.6 s | 69.7 s | 3146 MB | 0 · 0 / 18 · 4 / 10 · 4 |
| ONNX (sherpa-onnx), processor | turbo | whole machine | 15 s | 16.3 s | 14.4 s | 2632 MB | 7 · 4 / 25 · 6 / 9 · 4 |
| ONNX (sherpa-onnx), processor | turbo | two cores | 22.8 s | 23.2 s | 20.5 s | 2667 MB | 7 · 4 / 25 · 6 / 9 · 4 |
| whisper.cpp prebuilt CPU build | base-q5_1 | whole machine | 376.5 s | 174 s | 104 s | 478 MB | 0 · 0 / 45 · 14 / 34 · 28 |
| whisper.cpp prebuilt CPU build | base-q5_1 | two cores | 335.2 s | 186 s | 95.6 s | 484 MB | 0 · 0 / 45 · 14 / 34 · 28 |
| whisper.cpp prebuilt CPU build | small-q5_1 | whole machine | 1121.8 s | 574.5 s | > 140 s (not done in 300 s) | 616 MB | 0 · 0 / 28 · 6 / — |
| whisper.cpp prebuilt CPU build | small-q5_1 | two cores | 1131.6 s | > 583 s (not done in 300 s) | > 140 s (not done in 300 s) | 580 MB | 0 · 0 / — / — |
| whisper.cpp prebuilt CPU build | medium-q5_0 | whole machine | > 1800 s (not done in 300 s) | — | — | — | — / — / — |
| whisper.cpp prebuilt CPU build | medium-q5_0 | two cores | > 1800 s (not done in 300 s) | — | — | — | — / — / — |
| whisper.cpp prebuilt CPU build | large-v3-turbo-q5_0 | whole machine | > 1800 s (not done in 300 s) | — | — | — | — / — / — |
| whisper.cpp prebuilt CPU build | large-v3-turbo-q5_0 | two cores | > 1800 s (not done in 300 s) | — | — | — | — / — / — |
| whisper.cpp prebuilt CPU build | large-v3-turbo | whole machine | > 1800 s (not done in 300 s) | — | — | — | — / — / — |
| whisper.cpp prebuilt CPU build | large-v3-turbo | two cores | > 1800 s (not done in 300 s) | — | — | — | — / — / — |
| whisper.cpp, Vulkan (RTX 4070 SUPER) | base-q5_1 | GPU | 59.9 s | 0.5 s | 1.2 s | 510 MB | 0 · 0 / 45 · 14 / 34 · 28 |
| whisper.cpp, Vulkan (RTX 4070 SUPER) | small-q5_1 | GPU | 0.9 s | 0.8 s | 1 s | 335 MB | 0 · 0 / 28 · 6 / 67 · 43 |
| whisper.cpp, Vulkan (RTX 4070 SUPER) | medium-q5_0 | GPU | 1.7 s | 1.3 s | 0.8 s | 281 MB | 21 · 17 / 13 · 3 / 36 · 30 |
| whisper.cpp, Vulkan (RTX 4070 SUPER) | large-v3-turbo-q5_0 | GPU | 1.4 s | 0.9 s | 1.2 s | 306 MB | 0 · 0 / 15 · 3 / 87 · 81 |
| whisper.cpp, Vulkan (RTX 4070 SUPER) | large-v3-turbo | GPU | 2.8 s | 1 s | 1.3 s | 332 MB | 0 · 0 / 23 · 5 / 159 · 139 |

The Vulkan rows are whisper.cpp hearing each recording whole, as it did before this change (base's 60 s
on the first clip is Vulkan compiling its pipelines on first use); heard in windows, the mixed note
is 7% WER with the turbo and 12% with small. The whisper.cpp CPU rows are the ten-second clip for
every model and the longer clips for the two small ones, five minutes each at most.

What the table says:

- **On two cores every model but medium transcribes faster than speech**: base in ~5 s a
  minute, small in ~15 s (Arabic ~20 s — its words cost the decoder more steps
  than English's), the large turbo in ~23 s (its decoder has four layers to small's twelve,
  so on Arabic it keeps up with small). Medium is slower than speech on two cores and no more accurate
  than the turbo, so it is measured and **not offered**.
- **The default is `small-q5_1`**: under a minute a minute on two busy cores in both languages, ~1.5 GB
  of memory while it works, 375 MB to fetch on the processor (190 MB on a GPU). Base is the
  faster choice for a weak machine and makes more Arabic mistakes (43% WER on the passage against
  small's 35%); the large turbo is the better Arabic (25%) at 1.0 GB to fetch and ~2.7 GB of
  memory — the cost a low-end laptop cannot always pay, which is why it is not the default. The
  settings row writes each model's two-core minute beside it (`cpuSecondsPerMinute` in
  `VOICE_MODELS`, the Arabic median rounded to five seconds).
- **One detection per recording was a bug on the GPU too.** whisper.cpp hears a long recording
  whole but detects its language once, from the first thirty seconds: the mixed note came back as
  English looping over the Arabic (87% WER with the large turbo on Vulkan). Both engines now hear a
  recording in windows (`speechWindows` in `server/voiceAudio.ts`: ≤ 28 s each, cut at the quietest
  tenth of a second in the last ten, windows of silence never sent), each detecting its own
  language: the same note on Vulkan, windowed, is 7% WER; on the processor 9–15%. A six-minute note
  on the processor peaked at 1.6 GB with small (1.45 GB for two minutes): memory does not
  grow with length to speak of.

**The thread count** (`voiceThreads`, `engineThreads`): the physical cores (`/proc/cpuinfo`'s
distinct (physical id, core id) pairs; half the logical count where the platform does not say),
never more than `os.availableParallelism()` (so `taskset` or a container quota is honoured), never
more than eight. The GPU path passes the same count; flash attention is on only on a GPU.

### THE MODEL IS DATA, NOT CODE

Fetched on first use into the data directory — never the vault (which is synced, published and
committed) and never the repository — in the form the engine that will run it reads: the GGML file
from huggingface.co/ggerganov/whisper.cpp into `ASTROLABE_DATA/models/whisper/` for a GPU, the three
ONNX files (`<size>-encoder.int8.onnx`, `<size>-decoder.int8.onnx`, `<size>-tokens.txt`) from
`huggingface.co/csukuangfj/sherpa-onnx-whisper-<size>` into `ASTROLABE_DATA/models/whisper-onnx/<size>/`
for the processor. Each file is a `.part` renamed only when its size matches the catalogue's exact
byte count (`VOICE_MODELS` in shared/voice.ts: GGML 59,707,625 / 190,085,487 / 574,041,195 /
1,624,555,275; ONNX 160,609,290 / 375,485,327 / 1,036,613,791, both turbo files sharing the one int8
export). A machine fetches only the form it runs — both only when a GPU fails after its file came.
One download per model and form however many recordings wait on it; `GET /api/voice/engine`
reports its progress in the form the next job needs and the sheet prints it ("Fetching the speech
model the first time — 40%").

### THE TRANSCRIBER IS A CHILD PROCESS

A native addon that faults takes its process with it; in the server's process that is every open
session and every save. So `server/voiceEngine.ts` forks `server/voiceWorker.ts` (the same Node,
the server's own flags — Electron's Node with `ELECTRON_RUN_AS_NODE` in the desktop app), sends it
the recording's bytes over advanced-serialization IPC, and ends it after five idle minutes, which
gives the model's half-gigabyte of VRAM back to a card the owner may be sharing. whisper.cpp's forty
lines of stderr per model load are kept (the last forty) and printed only if the child dies badly.
A job that does not come back in twenty minutes kills the child and fails with `timeout`.

**Which engine, and the fallback.** `voice.backend` `cpu` sends every job to sherpa-onnx and never
asks about a GPU (no GPU build is even loaded). `auto` asks the child once per server run which GPU
build LOADS (`{ kind: "probe" }` → `cuda` / `vulkan` / `metal` / `cpu`; `ASTROLABE_WHISPER_GPU=off`
still answers `cpu`); none → the processor from the first job. A GPU build that loads and then
fails answers `gpu-unavailable` and the parent marks the GPU failed until restart and sends the
SAME recording to the processor: it would not initialise, or it initialised with no device — the
Vulkan build over a Vulkan loader with no driver logs "no GPU found" and quietly runs the floor,
so the worker waits for whisper.cpp's `whisper_backend_init_gpu` verdict line (it arrives on the
event loop AFTER the init resolves) — or the child died mid-job. Verified on this machine with
`VK_ICD_FILENAMES` pointed at nothing: 4.2 s on the processor instead of 165 s on the floor, the
status line saying so. sherpa-onnx that will not load answers `cpu-unavailable` and the job falls
to the floor (whisper.cpp's own CPU build), logged. A child's exit rejects only ITS jobs — a child
ended on purpose used to reject the job its successor already held.
`scripts/check-desktop.mjs` learned to follow `new URL("./x.ts", import.meta.url)` — a forked
module is in the server graph, and its three packages must be desktop dependencies at the same
specs, which the gate could not see before.

**Decoding is WASM, not ffmpeg.** `@audio/decode-webm` (Chromium, Electron and the Android WebView
record WebM/Opus) and `@audio/decode-opus` (Firefox records Ogg/Opus) are libopus compiled to WASM;
WAV is read by hand. The container is sniffed from the bytes (`sniffRecording`), never the name.
The 48 kHz input is low-passed (a 33-tap Hann-windowed sinc) and read at 16 kHz, evaluated only at
the input positions the output reads. Safari's MP4/AAC is refused with `voiceFormat` (415).

### THE ORDER OF OPERATIONS NEVER LOSES THE RECORDING

1. `POST /api/voice` (admin; multipart `audio`, or JSON `{ audio: base64, date, time, language? }`
   — the web client and the Android shell both send JSON, because the pocket's router and the
   native bridge move strings) sniffs, then WRITES THE RECORDING INTO THE VAULT at once:
   `voiceAudioDir(attachmentLocation())` — the attachment setting asked as though the upload
   happened in `Inbox/`, plus `Voice/` (so the default "specified" mode gives
   `<attachments>/Voice/`) — named `YYYY-MM-DD HHMM.<ext>` by the DEVICE's clock, ` (2)` on a
   collision, written `wx` so two racing recordings cannot overwrite. From here a crash, a restart or
   a model that will not load leaves a recording the owner can find.
2. The job joins the FIFO queue (`createVoiceQueue`): one transcription at a time, because two
   models filling one GPU is the second one failing for memory the first was about to return. The
   route answers `202` with the job; the sheet POLLS `GET /api/voice/:id` once a second. Not
   `/api/events`: a vault event means "a file changed" to every subscriber in the app, and "the
   model is thinking" is not a file. The note itself does arrive over the stream, as every write
   does. Jobs live in memory (the last 64 finished are kept): a restart forgets the job and not the
   recording.
3. The words land by `planVoiceNote`: **≤ 80 words** (about thirty seconds of speech) → one bullet
   appended to `Inbox/YYYY-MM-DD.md` — the phone share sheet's own note and shape,
   `- HH:MM — words [[<recording>#t=0|🎙]]` — with the share sheet's precondition: read, add, write
   with the read's mtime, and on a `409` read and add again, ONCE (an append is the rare write where
   that is safe: the line was in neither version). **> 80 words** → its own note,
   `Inbox/Voice — <first six words>.md` (the clipper's filename rule, sentence punctuation dropped,
   ` (2)` on a collision), the recording embedded as `![[<recording>]]` above the transcript, no H1.
   whisper's furniture (`[BLANK_AUDIO]`, `[Music]`, `(applause)`) is not speech and is removed
   (`tidyTranscript`).
4. **"Keep the audio" off deletes the recording only after words have landed.** A failed
   transcription, or one that heard nothing, keeps the recording and links it whatever the setting
   says — then the recording is all there is. The job answers `failed` (with a code) or `done` with
   `error: "silence"`, and the sheet says where the recording is.

**The link is a MOMENT link, `#t=0`.** A bare `[[…webm]]` is a wikilink the note resolver cannot
answer, drawn broken; a moment link (shared/mediaEmbeds.ts) is drawn live, seeks a player on the page
or opens the recording at its start. `webm` joined `isAudioName` for the same feature: it is what
every recording made in this app is, and the long note's embed draws a player (a WebM that is a
video still plays its sound — more than the file card it got before; there is no video player to
lose).

**A path-form attachment target now resolves (`resolveEmbed`, server/indexer.ts).** The index was
keyed by basename only, so `![[Attachments/Voice/2026-09-23 1402.webm]]` drew the broken ⌀ and the
recording read as UNREFERENCED to the unused-attachments sweep — a voice note's recording offered for
deletion. This was a standing `KNOWN BUG:` test in `tests/links.test.ts`; the exact path
(case-insensitively) is now asked first and the basename ladder after, and the test is rewritten as
the fixed behaviour. The pocket's resolver already did this.

### THE SETTINGS: `voice { model, backend, language, keepAudio }`

One settings.json key, the `attachments` shape (null clears it, sub-keys merge, a value equal to
its default is deleted, an unknown sub-key or value is a 400 naming it). Defaults: `small-q5_1`,
`auto`, `auto`, `true`; `effective.voice` always carries all four. `backend` is `auto` or `cpu`.

**The migration is the storage rule, not a script.** The old default (the large turbo) was stored
as its absence, so an instance that never chose has no `voice.model` and now reads `small-q5_1`;
one that wrote `large-v3-turbo-q5_0` down keeps it; and choosing the large turbo in the row from
now on WRITES it (it is no longer the default), so the next default change cannot take it
(`tests/settings.test.ts`, a hand-written settings.json each way).

Rows: Settings → Vault → **Voice transcription** — ONE row with two controls, because Vault holds
eighteen: a Select of the four models and Off (each option's note is its download in the form this
machine will run and, on the processor, "a minute of speech in about N s on two cores"; the note is
hidden in the closed trigger, where it pushed the name out) and a segmented **Auto / Processor
only**. The line under it (`voiceStatusLine`) is the download line unchanged (not downloaded / N% /
the size), then which model ran where: "Downloaded; Small, compact (the default) last ran on the
processor." — or "runs on the processor" before the first job when that is already known.
**Keep voice recordings** (a Toggle); Settings → Language & dates → **Voice note language** (Detect /
Arabic / English). **The ≤18-rows rule decided the split:** Vault held 16, so two voice rows brought
it to exactly 18 and the language pin sits on the Language tab; the backend is the model row's
second control for the same reason.

### THE SHEET, THE DOORS, THE COPY

The quick-capture sheet's title row carries a switch (a microphone from the text field, a pencil
back); the palette's **Voice note** and the phone's ⋯ row open it on the recorder (`captureVoice`
in the store, cleared whenever the sheet closes). **One round button does both gestures**: a TAP
starts a recording that runs until tapped again or Send; a HOLD (≥450 ms, measured from a press that
started a LIVE recording — a release during the first-use permission prompt is a tap) talks while
held and sends on release. Pointer capture on the press, `touch-action: none`, no callout. A level
bar (AnalyserNode RMS, −50…−10 dBFS, eased) and the elapsed time in the instance's numerals, LTR.
Discard releases the microphone and keeps nothing. Then: sending → waiting its turn (N ahead) →
fetching the model (%) → transcribing → the words, in a quoted block, with **Open** and **Record
another**. Closing the sheet mid-job keeps following it; the landing is a toast with the note's name
and an Open. 72px button (80px on a finger), 44px targets on a phone or any coarse pointer, the text
field `max(16px, …)` on a phone. The ring breathes while recording and is still under
`prefers-reduced-motion`.

**The recorder is its own chunk** (`VoiceRecorder.tsx`, asserted split by check-bundle), and **its
twenty-nine sentences travel with it** (`client/voice/copy.ts`, the tour's precedent, gated for
both halves and matching placeholders in `tests/voice.test.ts`): they were 6.1 kB of entry chunk in
the dictionary, for a sheet most sessions never open. Only the doors and the Settings rows are in
the DICT. Entry cost of the feature: +3.2 kB.

### THE PHONE, THE DESKTOP, THE POCKET

- **The Android shell's share sheet** (`mobile/src/voice.ts`) has the same round button under the
  text, built with the shell's DOM helper around the web client's own `Recorder` (imported, not
  rewritten), sending base64 JSON through `CapacitorHttp` and polling the job. `RECORD_AUDIO` and
  `MODIFY_AUDIO_SETTINGS` are in the manifest; Capacitor's WebChromeClient turns the page's
  `getUserMedia` into the runtime prompt the first time. The served client's ⋯ row is the other
  door and needs nothing of the shell. An instance reached over plain `http://` on a LAN is not a
  secure context: the WebView offers no microphone there, and the sheet says so rather than
  showing a dead button.
- **The desktop** (`electron/permissions.ts`): Electron grants every permission to every page when
  a session has no handler, which was never a decision. Now the vault's own origin keeps every
  permission it had, a `media` request from it is granted for AUDIO only (no camera), and every
  other origin is refused everything; the origin is asked per request because a respawned server
  may move ports. macOS asks through `askForMediaAccess` with `NSMicrophoneUsageDescription` in the
  package. The desktop package leaves out the 189 MB CUDA build (it needs a runtime a package cannot
  ship) and the addon's C++ sources.
- **The pocket keeps the recording and refuses the words, by name.** `POST /api/voice` in
  `mobile/src/pocket/server.ts` writes the recording (the pocket's attachment setting, `Voice/`),
  appends the link-only bullet to the day's inbox and commits both as `Astrolabe pocket: voice
  note`, answering `{ status: "kept", error: "pocket" }`; `GET /api/voice/*` is a 501 with the
  sentence. A phone WebView is not the owner's machine, and half a gigabyte of model in IndexedDB is
  a phone's storage spent on a feature the laptop already has. **It is not transcribed later** when
  the repository is opened on an instance: a server rewriting bullets in a note last touched on a
  phone, unasked, is prose edited behind its owner's back — the thing the conflict rule refuses.
  The `voice` settings key is in `POCKET_CANNOT_KEEP`; `effective.voice` answers the pocket's facts
  (`off`, `auto`, `auto`, kept).

**Verified** (`scratchpad/voice-3.24/verify.mjs` in the worktree, headless Chromium with
`--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>` against a scratch server
running the real engine): English tapped for 7 s → one bullet in `Inbox/2026-09-23.md` 1.8 s after
Send, words exact; English for 64 s → `Inbox/Voice — This morning I walked to the.md`, the player
above 167 words; Arabic chrome, Arabic speech for 14 s → an Arabic bullet in 0.8 s with the
sheet mirrored; the phone at 412×915 in both languages by HOLD-to-talk, every target 44px (the mic
80px), no sideways overflow. The DESKTOP app, launched from `electron/main.ts` under Playwright
over a scratch vault and config home: `getUserMedia({ video })` refused, `{ audio }` granted, the
model downloaded on first use into that vault's data directory, and a tapped note landed. The
SHARE SHEET (the real `mobile/src/capture.ts` + `voice.ts`, mounted in Chromium at 412×915 with
CapacitorHttp's web fallback): held, released, the words in the inbox in both languages.
`check-phone` gained two surfaces, the capture sheet and its recorder, measured behind an open
modal only on the modal's own controls — and on its first run it caught the TEXT sheet under a
coarse pointer wider than 700px (the S Pen posture) at 36px buttons and a 15.5px field, because
its phone block asked for width alone; it now asks `(max-width: 700px), (pointer: coarse)`. Tests: `tests/voice.test.ts` (the rule, the names, the queue with a
fake engine, the landing over a throwaway vault, the resampler, the copy), `tests/pocketServer.test.ts`
(the kept note, the 501s, the settings), `tests/links.test.ts` (the path-form embed).


## Feeds and read-later, and the import wizard (3.28)

*Self-contained: `shared/feeds.ts`, `shared/feedHtml.ts`, `server/feedParse.ts`, `server/feedStore.ts`, `server/feeds.ts`, `server/feedRoutes.ts`, `client/feeds/`, `client/phone/screens/Feed*.tsx`; `shared/importPlan.ts`, `server/import/*`, `server/importRoutes.ts`, `client/import/`. Docs: `docs/feeds.md`, `docs/import.md` and their Arabic twins.*

### FEEDS: THE LIST IS A NOTE, THE CONSENT IS A SETTING

- **The list.** `feedsEffective().note` (settings `feeds.note`, default `Feeds.md`) holds one or more ` ```feeds ` fences; `parseFeedList` reads them: an http(s) address per line, `→ Folder`/`-> Folder` (default `Reading`, `folderError`-checked), `#tag` lines applying to the feed above (or, before the first address, to every feed of the block), `//` comments, first mention wins, at most `FEEDS_MAX` (200). Problems (`notAnAddress`, `duplicate`, `badFolder`, `tooMany`, `tagBeforeNothing`) carry the line and are shown, never thrown. The server re-reads the note when the watcher names it (after `whenIndexed`) and asks the newly added feeds at once when fetching is on.
- **The consent.** `feeds.fetch` (default false, stored only when true). While false NOTHING is fetched: no round, no Keep page fetch, `POST /api/feeds/refresh` is 409 `feedsOff`. The Vault tab's **Feeds** row (switch + list note, `PairControls.tsx`) says so under itself. The tab stays at eighteen rows because Unique notes' two rows became one.
- **The cadence.** `feedsCadenceMinutes(gitSyncEffective())`: sync's `intervalMinutes` when sync is enabled with a remote and a non-zero interval, else 60. A 60 s unref'd tick; single-flight `runRound`, three feeds at a time; `If-None-Match`/`If-Modified-Since` from the stored validators; 20 s timeout, 8 MB cap, charset from `Content-Type`. An HTML answer is not a feed: `discoverFeeds` (`<link rel=alternate type=rss/atom/feed+json>`) is followed once and remembered as `resolved`. Opening the surface with fetching on and no round yet starts the first round.
- **The store.** `ASTROLABE_DATA/feeds.db` (node:sqlite, 0600): `feeds(url, resolved, title, site, etag, modified, checked, error)` and `items(feed, guid, url, title, author, published, content, summary, seen, read, kept)` keyed by (feed, guid). An item's guid is the feed's id, else its link, else a hash of title+date+summary. Read items past `KEEP_PER_FEED` (300) are pruned; unread never. Never in the vault; never mirrored.
- **Formats.** RSS 2.0 (and RDF items), Atom (text/html/xhtml constructs, `xml:base`), JSON Feed 1.x. `content:encoded` over `description`; Atom `content` over `summary`; `content_html` over `content_text`.
- **Reading.** `openItem` sends `sanitizeFeedHtml` output — an allowlist over `parseHtml`: listed tags only, script/style/iframe/forms/media dropped WITH their contents, attributes per tag, `href`/`src` resolved http(s) only, SVG images refused, links `target=_blank rel="noopener noreferrer nofollow"`, images `loading=lazy decoding=async referrerpolicy=no-referrer`, all text escaped. The client injects it as it is. `summaryOnly` is prose under `FULL_ARTICLE_MIN` (900) letters.
- **Keep.** `keepItem` → `performKeep` (server/clip.ts; see the capture section). A teaser with fetching on fetches the item's page (`contentRoot` picks its article); otherwise the feed's own words. The item is marked read and `kept`; a second Keep of a still-present note answers `already`. No `publish:` key, ever.
- **The surfaces.** Desktop: the `~feeds` tab (`FEEDS_TAB`, `/feeds`, `setView("feeds")`, `toggleFeeds`), a door beside the calendar in the top cluster, the palette row `open-feeds`, the status ⋯ row. Two columns (a container query at 720px stacks them). `j`/`k`/`o`/`e` answered by the surface's own `onKeyDown` through `isKey` (physical position), outside the ledger like the book reader's grammar and rendered in docs/keymap.md "Feeds". A read item dims in place until the next load. Phone: More → Feeds (`FeedsScreen`, a LIST) → the `feed-item` screen with the ⋯ sheet. Pocket: `/api/feeds*` is a 501 with the sentence; `feeds` is in `POCKET_CANNOT_KEEP`; `effective.feeds` answers `{ fetch: false, note }`.
- **Wire.** `GET /api/feeds` → `FeedsState`; `GET /api/feeds/item?feed&guid` → `FeedItemFull`; `POST /api/feeds/read {feed, guid, read}`; `POST /api/feeds/read-all {feed?}`; `POST /api/feeds/keep {feed, guid}` → `{path, fetched, already}`; `POST /api/feeds/refresh`. Every route admin-only, GETs included.

### IMPORT: PREVIEW WRITES NOTHING, COMMIT STREAMS, UNDO TRASHES

- **Converters** (`server/import/{notion,evernote,obsidian}.ts`) answer in export terms (`SourceNote`: export path, export dir, wanted relative path, title, body, fields — or null to keep the note's own frontmatter; `SourceAttachment`; skips with reasons; frontmatter stats). Notion: ids stripped (`stripNotionId`), property lines (`notionProperties`) and HTML property tables to fields, Notion dates to ISO, a database CSV to a table note linking its rows, rows without property lines given the CSV's cells, `_all.csv` preferred. Evernote: `.enex` via `parseXml`; resources by MD5 to attachments, `en-media` embedded where it stood, `en-todo` to tasks; tags/created/updated/source-url to fields. Obsidian: notes verbatim except `publish:` removed (`setFrontmatterLine`); dotted paths, `.obsidian/`, `.trash/` and non-attachment files skipped.
- **Unpacking.** `unzipExport` (server/zip.ts; one nested level of zips; 20,000 entries; 1 GB unpacked) and `dropCommonRoot`; a folder upload sends `files` + `paths` (webkitRelativePath) side by side; `..` refused. Body cap `NOTES_IMPORT_MAX_BYTES` (256 MB) on `/api/import/preview` only.
- **The plan** (`server/import/plan.ts`). Notes: `resolveTargets` under the folder (case-insensitive; `exists` in the vault or `duplicate` in the export → `Name 2.md`…; never overwrites). Attachments: `uploadDirFor(folder)`, the same resolution. Links: `linksToWikilinks` turns Markdown links to other imported notes into `[[final name|label]]`; `renameEmbeds` renames embeds of renamed attachments and notes (path-form attachment embeds become the name alone); `rewriteWikilinkPaths` + `rewriteDestinations` (server/moveLinks.ts) re-resolve path-form wikilinks and Markdown destinations from the export folder to the note's vault folder with a MoveMap of export path → vault path. Plans live 30 min, at most four.
- **Commit.** `POST /api/import/commit {planId}` → `application/x-ndjson`: `{type:"progress", done, total, path}` per file (attachments first, `wx`), then `{type:"done", undoId, notes, attachments}`, or `{type:"error"}`. A path taken since the preview stops the commit (409 `importTaken`); what was written stays undoable.
- **Undo** (bulkRewrite's contract; deckImport.ts has no undo token to copy): `POST /api/import/undo {undoId}` moves each written file to `.trash/` via `deleteNote`/`deleteAttachment` unless its mtime moved (then `kept`), and `rmdir`s the folders the import created, deepest first, when empty. Bundles live 24 h in memory.
- **Nothing is published**: no converter writes `publish:`; `normaliseFields` drops one; the Obsidian converter removes Publish's. `tests/import.test.ts` asserts `isNotePublished` false for every note of all three.
- **Doors.** Palette `import-notes`, the sidebar folder/root menu row `treeImportHere` (fills the folder), phone More → Import notes; the store's `importFolder` (null = closed) raises `ImportDialog` in both shells (a phone LAYER, so Back closes it). Not a Settings row — the Vault tab names the doors in a note (`importDoorsNote`). Pocket: `/api/import/*` is a 501.

**Verified**: `tests/feeds.test.ts` (23: the list grammar, the kept note, the sanitiser, the three formats and discovery, a round against a local `node:http` server with ETag 304s, Keep from the feed and from the page, Keep with fetching off asking nobody, a highlight in a kept note in the implicit deck, nothing in the vault but kept notes), `tests/import.test.ts` (12: the pure half, each converter against the hand-written exports in `tests/fixtures/import/`, preview → commit → undo for each with collisions, attachments renamed and links rewritten, an edited file surviving undo, no note public), `tests/pocketServer.test.ts` (the 501s and the refused `feeds` key). `check-phone` opens Feeds, keeps an item from a local feed served by a fixture server, and runs a Notion-fixture import and its undo.
## 3.28 — Today on the desktop, the Timeline, the year in review

Self-contained: `client/today/`, `client/timeline/`, `shared/noteDays.ts`, `shared/reflection.ts`,
`shared/yearReview.ts`, `GET /api/timeline`, and `shared/dayAgenda.ts`'s note half.

**ONE DATA LAYER, TWO CHROMES.** `client/today/model.ts` (pure: `sigilRows`, `toggledSigil`,
`dueTasks` = the Sigils page's `not done / due before tomorrow` fence, `decksDue`,
`reflectionState`) and `client/today/hooks.ts` (`useToday`, `useCaptureLine`, `useVoiceReady`) are
the only place Today reads or writes. `client/today/TodayView.tsx` (the `~today` pane surface,
`/today`) and `client/phone/screens/TodayScreen.tsx` are chrome over them; `check-shell-seam` keeps
the chromes apart. `useVaultTick` moved to `client/vaultTick.ts` for this. Writes go only through
existing doors: `POST /api/routine` (the card's edit), `POST /api/task` (`toggleTaskLine`),
`client/capture.ts`, and for the reflection the daily door (`ensurePeriodicNoteAt`) then
`sectionActions.applyNoteContent` (the open editor's buffer as one undoable transaction, else the
API) — reached by `import()` so the phone's first paint does not carry the outline's section code.

**THE DAY'S NOTE IS RENDERED, NEVER EDITED, ON TODAY** (`renderNoteContent`, read-only, capped
height); "Open" / "Start it" is `openDailyNote()`. A second editor for one file is two autosaves.

**THE EVENING QUESTION** (`shared/reflection.ts`): from 18:00 local (`EVENING_HOUR`) until the day's
note has text under `## Reflection`; the answer is appended at the END of an existing section (a
template's empty one included) — NEVER a second heading — else a new section at the end. Headings in
fences are not headings; the note's line endings are kept. The heading is English in every
language (an address, like `## Captured`).

**A NOTE'S DAY** (`shared/noteDays.ts` `dayOfNote`, server and pocket alike): a daily note's own
date (the instance's `dailyFolder`/`dailyFormat`), else the first of `date` / `created` /
`published` that spells `YYYY-MM-DD`, else the LOCAL day of the indexer's instant (id stamp,
created ledger). On-this-day uses it and carries `excerpt` (the post list's cut, `postBasics`,
cached on the record; HTML comments stripped). `capturedLines` counts stamped items under
`## Captured` and every stamped item in `Inbox/YYYY-MM-DD.md`; `voiceMarks` counts `|🎙]]` links
and a long transcript's own note.

**THE TIMELINE** (`~timeline`, `/timeline`): `GET /api/timeline` → `TimelineNote[]` (admin; the
pocket answers it from its index). The client hands notes, sigils, trackers, the Orbits log and
the daily map to `agendaDays` + `agendaByDay(…, { project: false })` — NO second aggregation — and
`client/timeline/model.ts` reads the answer out as items (kinds: note, daily, sigil, session,
voice, capture, published), filters (kind set, top folder, tag), rows (month → day → item) and a
layout. VIRTUAL LIST: `ROW_HEIGHT` (52/32/60) is pinned in `timeline.css`; tops are a prefix sum,
`visibleRange` a binary search, only the viewport ± 400px is mounted (tests: 10,000 days → < 40
rows). The desktop keeps the months in a rail (hidden in a pane under 560px); the phone raises
them as a RoutedSheet from its top bar. On a phone the Timeline is a LIST screen (client/phone/kinds.ts):
it keeps the tab bar, and on a tablet it holds the list column while the note a row opened sits
beside it. Month headings are Gregorian (the grouping is by ISO
month), their names in the chrome's language (`dateNamesLocale`).

**YEAR IN REVIEW** (palette "Year in review…", the Timeline's header, the phone Calendar's `⋯`):
`promptModal` for the year (years with data listed; January suggests last year), then
`yearNumbers` over `agendaByDay` for every day of the year up to today, `yearReviewBlock` between
`<!-- astrolabe:year-review -->` and `<!-- /astrolabe:year-review -->`, `mergeYearReview` rewriting
ONLY that block, into `Reviews/<year>.md`, opened after. Words come from the dictionary at write
time with the FSI/PDI isolates stripped (they are noise in a file). Deterministic: the fixture test
pins the bytes.

**DOORS AND KEYS.** Today: the status bar's first door (`data-testid="today-door"`), the palette
(`open-today`), `Ctrl/Cmd Alt Shift D` (`cmdOpenToday`, checked before capture's Shift and the
daily note's Alt), and launch door `"today-page"` on Settings → Vault → Open on launch — a door on
the existing setting, not a new Device row: This device and Vault each already carry 18 rows, and
two settings deciding what a launch opens would need a rule for which wins. Timeline: the palette
(`open-timeline`), the Calendar page's door, the phone's More and Calendar `⋯`.

**BUDGETS.** Entry +7.3 kB (dictionary, surface table, router, chord), phone first paint +20.4 kB
(the entry, `today/hooks`, `shared/tasks.ts`, TodayScreen's sections); both pages are lazy chunks
asserted in MUST_SPLIT.
