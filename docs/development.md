# Development

*Running Astrolabe from source, the gate scripts, the screenshot harnesses, and how to contribute a change.*

← [Back to the README](../README.md) · [All docs](README.md)

---

## Dev mode

```sh
npm run dev
```

This runs two things side by side: the API server, and Vite, the tool that serves the client
and reloads it in the browser the moment you save a file.

| Port | What | When |
| ---- | ---- | ---- |
| 6801 | Hono server (API + built client) | `npm start` / always |
| 5801 | Vite dev server (proxies `/api` → 6801) | `npm run dev` only |

In dev mode you open port 5801; requests to `/api` are passed through to the server on 6801.
`PORT` overrides the server port.

## The scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | API server (Node's own `--watch`) and Vite side by side |
| `npm run build` | Build the client into `dist/`. The server needs no build — Node runs the TypeScript directly |
| `npm start` | Build, then serve |
| `npm run serve` | Serve without rebuilding |
| `node scripts/rebrand.mjs --name … --icon …` | Stamp your own product name and icon on the desktop build before `npm --prefix desktop run dist` ([the desktop app](desktop.md#your-own-name-and-icon)) |
| `npm run hash-password` | Prompt (no echo, or piped stdin) and print an argon2id hash for `ADMIN_PASSWORD_HASH` |
| `npm run typecheck` | `tsc --noEmit` — the strict TypeScript gate |
| `npm test` | The unit suite, `node --test tests/*.test.ts`: the pure logic under `shared/`, `server/` and `client/`, no browser. It is the release gate, and it runs the same code as several of the gates below (`check-keymap`, `check-docs`) from a second door |
| `npm run build-docs` | Build this manual, both languages, into `docs/site/` |
| `npm run check-docs` | Every link, anchor, image and settings path in this manual resolves, in both languages (below) |
| `npm run gen-icons` | Redraw the folder-mark glyph set from its catalog; `npm run check-icons` fails when the drawing is stale |
| `npm run check-desktop` | The desktop wrapper's own checks, then its `tsc` |
| `npm run check-windows-layout` | The shell at six window widths × three device pixel ratios × three pointer postures (below) |

## The gates

A *gate* is a script that checks one specific promise the product makes, and exits with an error
when the promise is broken. Each one below exits non-zero on failure. The gates that need no browser
need no setup at all. The browser gates need a running instance, plus `npm i -D playwright` and either
`npx playwright install chromium` or a system browser via `CHROMIUM=/usr/bin/chromium`. Those
that sign in take `ASTROLABE_PASSWORD` (open local mode needs no password).

### `npm run check-i18n` — the dictionary

Every string a user can see comes from one dictionary, `client/i18n.ts`, with an English and an
Arabic entry per key. This gate fails if any `t()` key is missing, untranslated or dead (used nowhere), or if
the English and Arabic sides of an entry disagree about their `{placeholders}`. It also fails on
hardcoded English text in JSX *and* in code that builds DOM elements by hand. "Dead" is counted
from the call sites only: the dictionary file is excluded from the usage scan, because a key
whose English value happens to be its own name (`read: { en: "read" }`) would otherwise match
inside its own definition and report itself as used.

### `npm run check-names` — the names gate

Two features were renamed in 3.15 and again in 3.16: the daily routine is **Sigils**, and **Orbits** <!-- lineage -->
is spaced repetition. A rename that leaves one toast, one hint or one heading saying the old word is
worse than none, so this gate greps every surface a reader sees — every English and Arabic value in
`client/i18n.ts` and in `client/orbits/copy.ts`, every page of this manual in both languages, the
README, the seed vault, the what's-new deck and the section headings of `CONTRACTS.md` — for the words
that may not appear there any more (the old word for a sigil, the study page's working name, and "flash card",
which is "card" now; and their Arabic), and `client/` and `server/` for the old page addresses,
which may exist only as redirect sources. A line that has to tell the history (which older fences
still work, what a release was called at the time) carries the word `lineage` in a comment on that
line — `<!-- lineage -->` in Markdown, `// lineage` in the deck — and is skipped; a dictionary value
never gets that exception. Each hit is printed as `file:line`, and the script exits non-zero.

### `npm run check-contrast` — the accessibility gate

Holds every one of the forty-six themes in `client/styles/tokens.css` to the WCAG contrast
rules on the five text tokens: body text, headings and secondary text against all three
backgrounds (`--bg`, the raised surfaces, and the hover background the tag pills sit on), the
accent colour against the page, and `--text-faint` at the 3:1 non-text floor on the two
backgrounds it is allowed on. The accent pair is read as text twice over (wikilinks and tag
pills in the prose, and the lit mode pill, which is the same two colours swapped). Run it after
touching theme tokens.

The formulas and floors live in `shared/contrast.ts`, which the
[custom theme builder](theming.md#make-your-own) imports as well — one implementation, so the
builder can never bless a theme the gate rejects.

It also checks the **text-colour palettes** (`shared/textColors.ts`,
`client/styles/textcolor.css`). These exist in two tiers for an arithmetic reason: against
`void`'s `#050508` a colour needs relative luminance ≥ 0.186, and against `solar`'s `#ffffff` it
needs ≤ 0.183, so **no single colour clears AA on every theme**. The theme-aware tier
(`var(--vc-*)`, the default) therefore carries one value per theme *group* and is held to 4.5:1
against every background in its group. The fixed-ink tier carries one hex for all themes and is
held to 3:1, WCAG 1.4.11's non-text floor, which is the most a fixed colour can promise. The gate
prints both, and checks the stylesheet's values against the module's.

### `npm run check-sections` — the section-surgery gate

No browser, no server. Dragging a heading in the outline rewrites the note: a block of lines
leaves one place and arrives in another, with the moved subtree's headings re-levelled. That is
the most destructive operation in the product that is not called "delete". It runs on a gesture
with no key, it is one 4px slip away by accident, and the reader is looking at a forty-row
outline rather than at the 1,200 lines being rearranged — so a single dropped paragraph would be
invisible until the day it was needed.

The gate generates thousands of documents out of the shapes that break naive implementations —
YAML frontmatter, code fences whose bodies contain `### ` lines, headings that skip levels, empty
sections, a section at end of file, CRLF, no trailing newline — and asserts the reorder is a
**permutation**: it may change the order of a note's lines and the depth of the moved subtree's
own headings, and it may add a blank line at a seam; it may never lose a line and never
duplicate one. It also asserts that a section cannot be dropped inside itself, that a
zero-distance move changes nothing, and that extraction's two halves cover the original exactly.
`SEED=…` replays a failure, `ROUNDS=…` sets the sample size.

### `npm run check-caret` — the click-to-caret gate

Live preview replaces Markdown source with rendered boxes of a different width *and* a different
length — eighteen characters of `$7.7\ \text{km/s}$` standing under seven glyphs of KaTeX — so
any pointer-to-document mapping that reasons about geometry instead of about the DOM drifts by
exactly that difference.

The gate writes its own note (inline math, inline code, wikilinks, tags, highlights and an
image, in English and Arabic, on lines long enough to wrap several times), drives a real mouse
over it — single, double and triple click, drag, shift-click, select-all — runs the whole matrix
once in each shell direction, and reads back what the reader would actually copy
(`window.getSelection()`), requiring every clicked glyph to take the caret **within one
character**. Before the fix it reported misses of up to **82 characters**; after it, zero.

It exists because that one question has broken four separate ways here (click position, hover
previews, mod-click navigation, text selection), and the common cause is always a pixel the
editor's height map cannot see: **nothing inside `.cm-content` may carry a vertical CSS
margin.** CodeMirror measures every line and block widget by its border box, so padding and
borders are counted and margins are not — put the air on a wrapper's padding, or in a
transparent border with `background-clip: padding-box`, never in a margin. The gate restores the
instance language and deletes its fixture however the run ends.

### `npm run check-french` — the auto-correction gate

`tests/french.test.ts` proves the table (no source is a real French word, no duplicates, every
target differs from its source by marks alone) and the line detector. What only a browser can
prove is the editor's half: the correction is a *second* transaction, dispatched off a microtask
after the one that typed the space, and it has to land as its own undo step with the space left
standing. So the gate writes a note, types into it with a real keyboard, and checks each
promise the docs make: `tres ` → `très `, `coeur ` → `cœur `, Enter and a stepped-over `)` as
boundaries, a line corrected whole when it becomes French, an English line with one French word
left alone (and an all-caps `UN`, and a Spanish line), a code fence never touched, one `Ctrl Z` giving `tres `
back and the same word not corrected again, the device switch off and on, `lang="fr"` on the
French line and nothing on the English one, the narrow no-break space before `?`, `...` → `…`
on a French line only, and a correction in vim's insert mode. Needs `CHROMIUM` and, against a
password-protected instance, `ASTROLABE_PASSWORD`; deletes its fixture however the run ends.

### `npm run check-layouts` — the keyboard-layout gate

`KeyboardEvent.key` is the character the *keyboard layout* produced. The shell used to compare
it to Latin letters, so on an Arabic keyboard — where the key marked `P` reports `ح` — every
global shortcut in the product was dead, in an app that ships a complete Arabic translation and
mirrors its whole interface for it. No test caught it, because every test typed Latin letters.

So this one does not. It drives the real app through the DevTools Protocol
(`Input.dispatchKeyEvent`, the only way to set `key`, `code` and `keyCode` independently —
Playwright's own keyboard always sends the US `key` for a `code`) with the keydowns that Arabic
101, ЙЦУКЕН, Greek, Hebrew, AZERTY, Dvorak and US QWERTY actually send, and asserts that the
palette, the graph, the shortcut sheet, zen, reading view, search, the pane toggles, bold and
strikethrough all still fire — including `Ctrl/Cmd K` in the signed-out blog shell, which is an
anonymous reader's only binding. **72 checks; 46 of them passed before the fix.**

Its second half keeps the fix from over-correcting: on Dvorak the key that types `b` is physical
`KeyN`, so `Ctrl Alt` on physical `KeyB` — which types `x` there — must do **nothing**. Layout
first, physical position only as the fallback. `tests/shortcuts.test.ts` runs the same matrix
over the resolver with no browser at all, and holds the cases a browser cannot deliver (Chromium
flattens Arabic's two-code-point lam-alef to an empty `key`). A binding added to the shortcut
sheet and not to that file is a binding untested on every non-Latin keyboard on earth.

`node scripts/shoot-layouts.mjs` is the companion picture: the `Ctrl/Cmd /` sheet with the
layout map stubbed to Arabic and to Russian, which is how the annotated keycaps are reviewed.

### `npm run check-windows-layout` — the window gate

Every other browser gate here looks at the app at one or two comfortable widths. The app is not
used at comfortable widths. A Windows laptop panel is 1366 physical pixels, which is 1093 CSS px
at 125% scaling and 904 at 150%; half of it under `Win+←` is 683. Four release rounds of "resizing
of panels and windows is clunky and weird on Windows" were four separate defects that no gate
could see, because each of them is a function of the viewport **and** the pointer together — and
because the one machine none of us has is the one they all happened on.

So this gate is a ladder rather than a screenshot. It drives the built app at **1366, 1280, 1024,
900, 700 and 600 CSS px**, each at **device pixel ratio 1, 1.25 and 1.5**, in both directions,
with the pane widths both empty and seeded to a pair the reader could actually drag them to
(`{560, 560}`), under the three pointer postures Chromium really reports on Windows:

| posture | what it is | what it must give |
|---|---|---|
| `mouse` | a desktop tower or a plain laptop | docked panes and grips at every width above 700 |
| `slate` | a hardware slate — touch, a rotation sensor, the ACPI slate bit. **An attached mouse does not change Chromium's answer** | the drawer below 1000, docked panes **with grips** above it, 44px rows |
| `touchlaptop` | a fine pointer and a finger | docked panes, grips, **and** 44px rows |

The postures are Blink settings on the browser process (`--blink-settings=availablePointerTypes=…`),
which is what `pointer_device_win.cc` itself hands the renderer — not DevTools media emulation,
which `setViewportSize` silently drops halfway down a ladder.

**Since 3.26.0 the ladder runs in the Classic phone layout**, because its drawer cells measure the
drawer shell; a last rung, `whichShell`, walks each posture down the widths under the default layout
and asserts the phone shell below 700 and on a slate at every width, and the desktop — unmoved —
everywhere else.

In each cell it asserts that the sidebar is a real grid column (not auto-placed, not an overlay)
wherever a pointer can hit a strip, that each docked pane has a grip whose 12px hit area is
**centred on the pane's own 1px divider** — `elementFromPoint` at the seam must return the grip —
that the note column never falls below its 320px floor whatever is stored, that neither pane and
neither pane's close button runs off the window, and that the document never scrolls sideways.

Three rungs after the ladder watch the frames the ladder cannot see, because it waits 300ms after
each resize and a 0.18s transition is over by then. They ask what the reader actually sees while a
window is being dragged and while a pane is being folded: the note column still has its 320px
**one frame** after a resize, the phone's notes drawer still slides rather than appearing, and the
reader's own `Ctrl/Cmd Alt B` fold is still mid-flight 60ms in. All three failed at some point on
the same flag — the class that says "this width is not the hand's doing" — being up when it should
have been down, or down when it should have been up.

Needs a running instance, `CHROMIUM`, and the instance's password as the second argument.

    npm run check-windows-layout -- http://127.0.0.1:8177 <password>

`scratchpad/win/run.sh` is the other half of this and is not a gate: it launches the packaged
Windows executable under Wine with `--remote-debugging-port=9333`, which is the only way to see
the real Windows renderer's scrollbars, pointer events and media queries without a Windows
machine. Run the same assertions over CDP there before a release that touches the shell.

### `npm run check-keymap` — the binding ledger

A colliding shortcut is the quietest bug this product can have. One handler answers the key, the
other never sees the event, and neither knows the other exists — so it surfaces weeks later as
"Ctrl+B does nothing", on one platform, from one reader, with nothing to grep for, because
nothing is wrong with either binding. What is wrong is that there are two.

So a binding exists in ONE place: the `GROUPS` table in `client/components/ShortcutsHelp.tsx`,
the same table `Ctrl/Cmd /` prints. This gate parses it out of the source text (never imports
it — the rows carry React and store closures, and a gate that needs a browser is a gate nobody
runs), turns every row's `keys` into one standard spelling, and fails when two rows resolve to the
same key, modifiers and scope. Scope is the shell (`app` / `blog`) and the runtime (browser /
desktop), and deliberately **not** `admin`: an admin session sees the visitor's rows plus its
own, so `admin` never keeps two bindings apart — it names the reader a collision reaches first.

One overlap is real, argued and declared: `Ctrl/Cmd Shift Z` is zen AND CodeMirror's only macOS
redo binding, and `client/App.tsx` breaks the tie by where the caret is. Declaring one costs a
paragraph in `RESOLVED` (`client/keymap.ts`) saying where the tie is broken, and a declaration
that stops colliding fails the build too — a dead exception is a claim the next reader believes.

The second half is `docs/keymap.md`, which is a RENDERING of the ledger rather than a second
copy of it: the gate diffs the chords in the tables between `<!-- keymap:begin -->` and
`<!-- keymap:end -->` against `GROUPS`, in both directions. Surfaces that carry no keystroke — a
click, the slash menu, an outline drag — live below the end marker, where the gate leaves them
alone. `tests/keymap.test.ts` runs the same code with no files to write.

The third half is the one a consistent ledger cannot prove: **that the key does something**.
Every row with `keys` must be vouched for by a comment `// keymap: <label>` on the code that
answers it — the branch in `client/globalKeys.ts` (the window listener both shells mount), the CodeMirror keymap entry, or a
component's own listener; a library keymap (history, search, fold) is marked where the editor
installs it. A row with no mark fails (`NO HANDLER`), and so does a mark naming a label that is no
longer a row. `Ctrl/Cmd Alt L` (turn a note over to its twin) sat on the sheet, the palette row and
this manual with no handler at all until 3.26.1, because nothing tied a row to its code.

### `npm run check-excerpt` — the tag-in-prose gate

`DESIGN.md`'s hard rule is that a snippet shown outside the editor either STRIPS Markdown or
RENDERS it. Removing a `#` and leaving the bare word standing in the sentence is neither, and it
shipped: a post ending "…it buys the reader a breath. #design #typography" printed on the front
page as "…it buys the reader a breath. design typography". The three surfaces that flow through
one stripper (`stripInlineMd`) are all walked from one fixture whose body **ends** in a tag line:
the post excerpt (`/api/posts` — blog cards, RSS, `og:description`), the search snippet
(`/api/search`), and the backlink context line (`/api/backlinks`). It also checks the other
direction — that the stripped sentence survives, and that the tags still appear where tags
belong (`post.tags`, and the search index still matches them) — so a stripper that passes by
deleting everything fails too. No browser needed; it deletes its fixtures however the run ends.

### `npm run check-design` — the error boundary

The gate for the [design engine](designer.md)'s one promise that cannot be reviewed by reading
the code: that a section which breaks does not take the whole page down with it. It breaks a designed site three ways on purpose (a corrupt `designs.json`, a section
pointing at a note that is not there, and a section renderer patched to throw and rebuilt) and,
for each, measures what a VISITOR gets (the built-in blog, a page with real text on it, nothing
escaping the boundary) against what the OWNER gets (the designed page, the failing section
named, the revert control present). It also round-trips stock ⇄ designed and asserts the design
comes back byte-identical. Everything it touched is restored on the way out, including on
failure: `PORT=6801 ASTROLABE_PASSWORD=… npm run check-design`.

### `npm run check-board` — the designer's section board

Three ways to move a row (the ↑/↓ buttons, a pointer drag, and a `Space`/arrows/`Space` keyboard
lift), the drop preview before commit, `Esc` belonging to the innermost layer, the save-bar
count, and a `Ctrl/Cmd S` round trip through the store.

### `npm run check-preview` — the designer's live preview

That it is a real iframe under `frame-src 'none'`, that styles and theme reach it (including a
live theme switch), and that it lays out at 390 / tablet / 1440 device widths.

### `npm run check-print` — the printed page

`PORT=6801 npm run check-print`. The only surface nobody looks at while they work: `@media print`
rules are invisible to every screenshot harness above, because a browser applies them only when
a human opens the print dialog. So this drives the app under `emulateMedia("print")` and asserts
that the print host is the only thing on the paper (and is `display: none` on screen, so it can
never flash), that the paper palette wins over a dark theme, that a folded callout prints its
body, that headings stay real `h1`–`h6` with ids and internal links keep their `#fragment` `href`s —
the two things Chrome builds a PDF's bookmark outline and its link annotations from — and that
an Arabic note prints as a right-to-left page from an English instance. It writes two fixture
notes through the API and deletes them on the way out. See [Printing & PDF](printing.md).

### `npm run check-deck` — every what's-new slide, measured

`CHROMIUM=/usr/bin/chromium npm run check-deck -- http://127.0.0.1:6801 <admin password>`. The
what's-new deck is drawings and live demos, and a drawing can look right in the language it was
drawn in and run off its frame in the other. This opens every release's deck in English and then
Arabic, freezes the loop at the point where every part has arrived, and fails if any text leaves
the frame, sits outside the chip it belongs to, overlaps another, is Arabic set right-to-left
inside a drawing, or is an Arabic sentence inside a drawing (prose belongs in a DOM demo). Run it
before every release that adds a slide.

### `npm run check-presets` — the preset catalog

Unique slug ids, a bilingual name and blurb with real Arabic, a known family, at least one preset
per family, and no preset naming a note in somebody's vault. It runs the shared `assertCatalog`
rather than reimplementing it.

### `npm run check-docs` — the manual

This page and every other one, in both languages. The gate walks every link in `README.md`,
`docs/*.md` and `docs/ar/*.md` with a Markdown lexer (so link syntax quoted inside backticks is
left alone) and resolves each against the tree: a relative link must land on a file, an
`#anchor` must name a heading of the page it points at, and an image must be on disk. Anchors
resolve through the one slug rule in `scripts/build-docs.mjs`, which is GitHub's — punctuation
dropped rather than hyphenated, Arabic letters kept — so a link that passes here lands on the
site and on GitHub both. Every `Settings → Tab → Row` path in the prose is read against the
panel's own source (the tab table, the group headings and the row index, with labels resolved
through `client/i18n.ts` in the page's language), and every page in the site's table must exist
in Arabic with the same heading structure as its English twin. `tests/docs.test.ts` runs the same
function under `npm test`.

### `npm run check-settings` — the settings index

`client/components/settings/settingsIndex.ts`, which the panel's search reads, is generated from
the panel's source by `node scripts/gen-settings-index.mjs`; this gate fails when the checked-in
file and the source disagree, which is the only way they drift. A search that silently stops
finding a row is worse than no search.

### `npm run check-whatsnew` — the deck

A minor version (`x.Y.0`) must be listed in `client/whatsnew/versions.ts` and have a deck with at
least one slide in `releaseNotes.ts`, and every slide's title and body must carry both languages.
A patch inherits its minor's deck. A version bump without a deck fails here, which is the
reminder.

### `npm run check-a11y` — static accessibility

Holds the line an audit drew, from the source alone: no `outline: none` without a replacement
focus ring in the same rule, an accessible name on every icon-only control, and the rest of the
list at the top of the script. Like check-i18n, it exists for the class of regression that is
invisible in review and invisible in a screenshot.

### `npm run check-cascade` — no phone rule is undone by a later one

No browser, no server. The phone and the touch shell are `@media` blocks written over the
desktop's rules, and a block only wins when it comes **after** what it adjusts. Five times a phone
rule shipped dead because a rule for the same selector and property sat later in the cascade with no
condition at all: What's-new's position count (shown for a phone, then hidden for everyone eighteen
lines further down), the library-roots editor's wrapping, three settings declarations (stated in
app.css, restated for the desktop by settings.css, which loads later), the tag shelf's sort button
and the unlinked mentions' link buttons. Each file reads correctly on its own; the loser is simply never
applied, so neither a diff nor a screenshot review can see it.

The gate reads every `client/styles/*.css` in the browser's order — the sheets
`client/index.html` links, in link order, then every sheet a module imports (those always follow
the linked ones, in an order the script cannot know, so two imported sheets are never compared).
It fails on a declaration inside a phone or touch block (an `@media` asking `(pointer: coarse)`,
`(hover: none)` or a `max-width` of 1000px or less) whose property is set again, for the **same
selector**, by a later rule with no `@media` around it. `!important` counts the way the cascade
counts it; a shorthand undoes its longhands and a logical property its physical twins
(`padding` undoes `padding-inline`, `min-height` undoes `min-block-size`). A later rule under a
reader's preference — `prefers-reduced-motion`, `forced-colors` — is narrower than the phone block
and overrides it on purpose, so it is not a failure. Different selectors that reach the same element
are check-phone's to measure. `--list` prints every finding without failing.

### `npm run check-phone` — the phone shell, driven

A browser gate:
`CHROMIUM=/usr/bin/chromium ASTROLABE_PASSWORD=<pw> npm run check-phone -- <url> [outdir]`,
against a scratch server. It drives the phone shell (`client/phone/`) the way a reader's thumb
does, in English **and** Arabic, on four shapes, and photographs every screen and sheet it passes.

**What it does, as assertions.** A tap on a folder pushes the folder; a tap on a note changes the
URL and the title (the old gate was green the day a tree tap on a phone opened nothing); the
note screen has no tab bar; the note sheet takes a history entry and the browser's back closes it
before it pops the note; Publish asks, and a cancelled publish publishes nothing; the mode icon
flips the mode it names; back pops the note to its folder; a long press raises the row's action
sheet and back closes it; Search is focused on arrival; a calendar day opens as a sheet; Orbits,
Sigils, the library and the graph open as screens; Settings takes an entry and back closes it; a
deep link opens its note and back from it comes home to Today; no page errors; and, once,
`Phone layout: Classic` mounts the desktop's drawer shell — and, in it, a note tapped in the drawer opens (address, title and active tab; the back-gesture guard still lives there) and the bottom bar's Publish asks before it publishes.

**What it measures, on every screen and sheet.** Nothing overflows sideways (a strip that
scrolls on purpose is exempt); every shell target is ≥44px (height always, width too when the
control carries no text; prose, a checkbox inside a ≥44px label and a data picture's cells are
not shell targets); every text field is ≥16px, below which iOS Safari zooms into the field; and
nothing covers a target (`elementFromPoint` at its centre answers the target). Under an open
sheet only the sheet is asked, because the page under it is inert on purpose.

**The four shapes.** `phone` is a Pixel 7 at 412×915 with a finger. `stylus` is 720×820 at DPR
1.5 with a pen — `availablePointerTypes=6, primaryPointerType=2, availableHoverTypes=3,
primaryHoverType=1`, a blink setting on its own browser, because `hasTouch` makes Chromium report
a coarse-only device whatever the pointer flags say; it is the posture that was once served the
desktop shell. `tablet` and `tablet-land` are a touch tablet at 820×1180 and 1180×820, where the
shell draws its rail, its list column and the note, and the note sheet slides over from the side.

### `npm run check-shell-seam` — two shells, no shared chrome

Static. The phone shell and the desktop shell share the store, the API layer, the dictionary and
every content surface, and nothing of each other's chrome: `client/phone/` may not import
`app.css` or the desktop's tab strip, pane grid, grips, status bar or sidebar; `client/components/`
may not import from `client/phone/`; and `client/phone/phone.css` asks no width question, because
being mounted is the condition. `tests/phoneShell.test.ts` runs the same rules.

### `npm run check-bundle` — what each audience downloads

After `npm run build`. The client ships one entry chunk plus a chunk per surface, and the split
only means something if it holds: one careless import at the top of a file the entry already
loads brings the whole app shell back into an anonymous reader's first request. The gate measures
every audience's download against a budget; a budget moves only by the actual overage, with the
cause written beside it.

### `npm run check-perf` — the performance gate

After `npm run build`. Every other gate here holds a promise about what the product *does*;
this one holds the promise about how it *feels*, and that promise is the one that decays
invisibly — no screenshot shows a keystroke arriving a frame later, and nothing at all shows
on the seed vault, because the vault where it shows is the one with two thousand notes in it.

So the gate brings its own. `scripts/perf-fixture.mjs` generates a vault from a fixed seed —
2,000 notes across 40 folders with frontmatter, wikilinks and tags, a 3,000-line note, a note
with fifty embeds and a year of daily notes — and `check-perf` starts its own server over it, on
its own port, in open local mode. **It never takes a vault path**, and the fixture reads nobody's
disk, so neither can be pointed at yours. Set `ASTROLABE_SEED_VAULT=<vault>` to fold a real book
and real Sigils and Orbits notes in as well; leave it unset and the gate measures the generated
vault, which is the same vault on every machine.

Five budgets over four surfaces, each the **best of several rounds** with the CPU throttled to a quarter speed
(Lighthouse's mid-tier multiplier — an unthrottled loopback has no headroom left in which a
regression could show). Best-of, not average: other work on the machine can only ever make a
round slower, so the fastest round is the one closest to the cost of the work itself, and a gate
built on the average is a gate that fails because somebody started a build.

| Budget | What it catches |
| --- | --- |
| **first paint** of the admin app | a static import that drags a lazy surface back into the shell's first request |
| **keypress → paint** in the 3,000-line note, median and p95 | a per-keystroke pass that has quietly become O(document) |
| **long-task time** over a 40-keystroke burst | the same failure, measured as work rather than as which side of a frame boundary it landed on — the sharpest of the five, and the one the purge moved most |
| **reading render** of that note | the same, for the one operation whose cost is the whole document at once |

Typing latency is the browser's own Event Timing — hardware keydown to the paint that shows the
letter — not a frame counter, and the caret is put at line ~1,500 first, because typing at line
1 of a long note measures a short note. Budgets move like `check-bundle`'s: by the actual
overage, with the cause written beside them, or **down** when a round earns it. `PERF_ROUNDS=1`
is the quick form; `PERF_KEEP=1` leaves the generated vault behind to look at.

### `npm run check-books` — the reader

After `npm run build`. Ten properties of the book reader — both surfaces, the PDF one and the EPUB one — that are invisible in review and
expensive to discover in production, the first being that the pdf.js worker is a real same-origin
asset rather than a `blob:` URL — which works under the dev server's absent CSP and dies under
the real one.

### `npm run check-icons` — the folder marks

`shared/folderIconNames.ts` and `shared/folderIconPaths.ts` are drawn from the catalog by
`npm run gen-icons`; this is the `--check` form, failing when the drawing is stale.

### `npm run check-signatures` — every signature house

A browser gate that renders every signature house through the real public renderer against an
isolated fixture API, touching no live vault, settings, saved design or account. `SIGNATURES=a,b`
narrows it, `THEME=<id>` renders every house in one theme, `SHOTS=1` writes screenshots.

### `npm run check-hovercache` — the hover-card cache

A browser gate proving the LRU bound on hover previews holds in a real session: the cache is
keyed by note path, so without `CACHE_MAX` an evening of skimming links would retain every note
skimmed. A bound that is only asserted by a constant is a bound that silently stops being true.

### `npm run check-designer-nav` — the designer's navigation and alignment

A browser gate born of a bug that shipped past every other check, in the owner's own language:
a preview scaled with a physical `transform-origin` inside a logical layout sits away from its
box in `[dir="rtl"]`. It measures every designer surface in both directions, and walks the
designer's navigation.

### `scripts/check-pdfsearch.mjs` — search inside a book

A bare script with no `package.json` entry:
`CHROMIUM=/usr/bin/chromium node scripts/check-pdfsearch.mjs <url> <password>`. Against a server
whose vault holds a PDF with a word that appears in no note, it proves the whole loop — the API
answers with a `kind: "book"` row naming the page, the sidebar draws it, and clicking it opens
the reader on that page with the word found.

### `scripts/check-desktop-boot.sh` and `check-desktop-relaunch.sh` — the desktop gates

Both take an AppImage and boot it under Xvfb (a virtual screen) with an isolated config
directory, from an empty temp directory (never from the checkout: an app started beside a `.env`
links itself to that deployment), over an empty temp vault named by `ASTROLABE_VAULT`. The
**boot** gate fails on an uncaught exception or a syntax error in the first 25 seconds — the
3.1.0–3.3.4 builds crashed at load and nothing said so. The **relaunch** gate sets
`ASTROLABE_SELFTEST=relaunch`, which makes the app restart itself four seconds after boot
exactly the way an applied update does, and passes only when the first process is gone *and* a
second one started from the same file is running — `app.relaunch()` looked like it worked and
did not, because Electron's relauncher runs from the mounted image after it is unmounted. Every
AppImage release runs both before upload.

## Performance

*What was measured, on what, what it cost before and after — and what is still slow and why.*

### The fixture

Performance here is measured on a vault nobody has, because the two vaults that exist are both
useless for it: the seed vault is a dozen notes, where everything is instant, and the owner's is
private and is never served. `scripts/perf-fixture.mjs` generates the third one from a fixed
seed, so that a number taken today is comparable with one taken next month:

- **2,000 notes** across 40 folders, each with six frontmatter properties, five `[[wikilinks]]`
  and three `#tags` — 110 distinct tags in a tree, and 2,000 nodes for the graph;
- a **3,000-line note** (291,000 characters, 54,000 words) — the editor's worst honest case;
- a note with **fifty `![[embeds]]`**;
- a **year of daily notes**, so the Calendar page has a month with something in every cell;
- and, only when `ASTROLABE_SEED_VAULT` names a vault to take them from, a real **665-page PDF**
  and the real **Sigils** and **Orbits** notes — a reader and two shelves with something of their
  own to draw. It is opt-in and it says so in its own output, because a fixture that reached into
  a vault nobody named would be two bad things at once: an unauthenticated scratch server over
  somebody's private notes, and a budget only one machine could meet. It measurably would have
  been the second — the generated vault carries 110 tags everywhere and 121 on the laptop the
  purge was measured on.

The sweep below was run with that variable set, so its vault was 2,376 notes rather than the
2,367 the generator alone writes. The nine notes are noted, not hidden; nothing in the table
turns on them.

Every number below was taken through the DevTools protocol against a scratch server over that
vault, with the CPU throttled to **a quarter speed** — Lighthouse's mid-tier multiplier. The
throttle is not pessimism: unthrottled on a loopback socket, every surface here lands inside one
animation frame and there is no headroom left in which a regression could ever show. Typing is
the browser's own Event Timing (hardware keydown → the paint that shows the letter); "before" is
3.18.0 and "after" is the same tree with the purge applied, measured back to back on one machine.

One caveat about every millisecond on this page: the machine this was measured on routinely
carries a load average of 13–17, and throttled numbers move with it. Everything below was taken
**back to back on the same machine in the same state**, which is what makes a before and an
after comparable — but the absolute values are a busy laptop's, not a benchmark rig's. Where
load matters to a budget, `scripts/check-perf.mjs` says so beside that budget.

### The numbers

| | Before | After |
| --- | ---: | ---: |
| **Typing, 3,000-line note** — keypress → paint, median | 32 ms | **24 ms** |
| … p95 | 48 ms | **32 ms** |
| … main-thread long-task time over a 40-key burst | 571 ms | **184 ms** |
| **Typing, 50-embed note** — input handler, median | 18.0 ms | **6.5 ms** |
| **Reading view**, 3,000-line note, render | 1,673 ms | **1,081 ms** |
| **Admin app** — first paint | 1,008 ms | **936 ms** |
| … JavaScript in the first request (`check-bundle`) | 1,551.7 kB | **1,048.7 kB** |
| … time to interactive (end of the last long task) | 1,638 ms | 1,516 ms |
| **Public site** — first paint | 608 ms | 548 ms |
| **`GET /api/props`** (the properties shelf) | 28.3 ms | **0.9 ms** |
| **`GET /api/tags`** | 1.1 ms | 0.9 ms |
| Sigils page, open | 2,861 ms | 2,628 ms |
| Calendar page, open | 2,265 ms | 2,182 ms |

Unchanged, and measured so: the tree opening forty folders at once (974 → 963 ms), the tag
shelf's tab flip (39 → 43 ms), search's per-keystroke paint (16 → 16 ms), a single note's save
and re-index on the server (7.0 → 7.7 ms), a 300-file watcher burst reaching the index (353 →
347 ms), and the indexer's cold start over 2,376 notes (1,276 → 1,264 ms). Heap after four
hundred navigations over ten minutes stayed flat both times (−6.2 MB and +1.2 MB after a forced
collection — a walk of the whole product retains nothing).

**What the purge actually moved**, in the order it was worth moving:

1. **The whole vault was walked once per wikilink.** `resolveLink` called `collectNotes`, which
   flattens the tree and sorts it with `localeCompare` — so rendering the 3,000-line note walked
   2,376 notes and re-sorted 2,000 of them 176 times, once per link. It is memoized on the tree
   object now (the store replaces it and never mutates it, so identity is an exact stamp), with
   a name table and a path table built once beside it, and the two loops in `resolveLink` became
   two map lookups. 6.8% of the reading render and 2.8% of every keystroke, gone.
2. **Every note's annotations were placed 120 ms after every keystroke — including the notes
   with no annotations.** The painter reduced the whole document to prose with a per-character
   offset map, folded it, and placed nothing: an empty list is truthy, so the guard above it
   never fired. The single largest cost of a keystroke, spent on nothing.
3. **The status bar re-counted the note on every autosave.** The bar draws the *live* count the
   buffer publishes; the fetched copy behind it was re-fetched and re-counted every 600 ms of
   typing to fill a field it never draws. It now counts only when there is no live count to
   draw, and the buffer's own count is memoized on the document.
4. **The outline pane was in the admin's first request.** It reaches the section surgery → the
   editor's sectioning extension → the live-preview decoration engine → the reading renderer →
   KaTeX. One `lazySurface` boundary took 503 kB and fifteen files out of the first paint.
5. **`Intl.DateTimeFormat` was constructed per date.** Building a formatter loads ICU data;
   formatting with one is a lookup. The Sigils page draws one date per card plus one per heatmap
   cell, twice over where both calendars are shown — 5.9% of opening the page. Formatters are
   cached by their own arguments now, which is what `shared/calendar.ts` already did for Hijri.
6. **The tag and property shelves were recomputed on every request.** `props()` walks every note
   and splits, trims and case-folds every frontmatter value; nothing memoized it. It is now
   validated against a `shelfRevision()` the index moves — exactly the bargain
   `server/graphCache.ts` already strikes — which is the 28.3 ms → 0.9 ms above.

### Where the time still goes

Measured, and left alone, because the honest answer is that the cost is real:

- **The tree holds 2,151 rows in the DOM** with forty folders open, and opening all forty at once
  costs ~960 ms of React reconciliation and DOM creation. Scrolling it is a clean 16.7 ms frame,
  and nobody opens forty folders in one gesture — one folder is a fortieth of that number. The
  list is not virtualised: the rows carry drag-and-drop, a roving tab index, `aria-posinset` over
  the filtered set and a keyboard walk, and a virtualiser under all four would trade correctness
  for a number no reader produces. The per-folder cap ("Show N more", 300 rows) is the existing
  answer and it still holds.
- **The graph's layout is 53% of its own time**, in a hand-written Barnes-Hut force simulation
  over typed arrays, with another 17% in `drawImage`. That is a simulation doing its work, not a
  bug; 2,000 nodes settle in about eight seconds and the canvas is up in two.
- **Search is 91% idle.** The ~950 ms from the first keystroke to the first row is the 200 ms
  debounce plus the typing itself plus a 6 ms server round trip; each keystroke paints in 16 ms.
  The debounce is the feature.
- **The reading render's remaining 1,081 ms is mostly layout** — six thousand nodes of prose
  being measured by the browser. The JavaScript above it is now a small fraction.
- **Opening a surface for the first time costs its chunk.** The Sigils, Orbits and Calendar pages
  are ~2.2–2.6 s on a cold visit, of which two thirds is fetching and parsing the lazy chunk
  those pages exist inside. That is the split working, not failing.

### Offline, measured properly

The service worker installs and takes control in about **250 ms**, and a short read leaves ~88
entries in its cache. With the **server stopped** — not with the browser's offline emulation,
which intercepts a navigation above the worker and never lets it answer — a navigation to a note
renders the cached shell in about **5 s** with the "Reading this device's copy" strip on it. A
harness that uses the emulation instead reports `net::ERR_FAILED` and has proved nothing; see
[Offline](offline.md).

## The done bar

The sequence a change runs before it is called finished, in this order: `npm run typecheck` ·
`node scripts/check-i18n.mjs` · `npm test` · `npm run build` and then `npm run check-bundle` · `npm run check-perf` (on a quiet machine) ·
`npm run check-a11y` · `npm run check-contrast` · `npm run check-settings` (with
`node scripts/gen-settings-index.mjs` first when a row changed) · `npm run check-keymap` when a
key changed · `npm run check-names` · `npm run check-shell-seam` · `npm run check-docs` · `npm run build-docs` ·
`npm run check-desktop` when `electron/` or `desktop/` changed ·
`npm run check-windows-layout` when the shell's layout, the panes or their breakpoints changed ·
`npm run check-cascade` whenever a stylesheet changed.
Then the browser gates the change touches — `npm run check-phone` whenever a stylesheet or a
piece of the shell moved — with `CHROMIUM` and `ASTROLABE_PASSWORD` set, against a scratch
server over a scratch vault — never the owner's.

## Screenshot harnesses

These are not wired into `package.json`; run them by hand, for visual review. All take
`CHROMIUM`, and most take `THEME=parchment` and `LANGSET=ar` to check a theme or the
right-to-left mirror.

| Harness | Captures |
| --- | --- |
| `node scripts/shoot.mjs <url> <outdir>` | The editor, graph and palette in both themes |
| `node scripts/shoot-settings.mjs <url> <password> <outdir>` | Every settings section through the rail, printing the panel's scroll geometry and the specimen font sizes |
| `node scripts/shoot-sync.mjs <url> <password> <outdir>` | The Backup & sync section plus the status badge's detail panel |
| `node scripts/shoot-themes.mjs` | Every theme (`ONLY=` narrows it) |
| `node scripts/shoot-rtl.mjs` | The Arabic mirror — and asserts glyph order in tag chips |
| `node scripts/shoot-tex.mjs` | `.tex` notes, with six assertions |
| `node scripts/shoot-templates.mjs` | The template picker, with assertions |
| `node scripts/shoot-hover.mjs` | Hover previews, with assertions |
| `node scripts/shoot-controls.mjs` | The hand-drawn control set (`W`/`H` set the viewport) |
| `node scripts/shoot-fontupload.mjs` | The font uploader |

## Contributing a change

1. **Read `DESIGN.md` and `CONTRACTS.md` first.** `DESIGN.md` carries the rules a change is judged
   against; `CONTRACTS.md` carries the promises the code has already made. Most review comments
   here are one of those two documents quoted back.
2. **Run `npm run typecheck`.** The build is strict, and the server has no compile step to catch
   things later.
3. **Run the gates your change touches.** Theme tokens mean `check-contrast`; any user-visible
   string means `check-i18n`; the outline or note-rewriting code means `check-sections`; the
   editor means `check-caret` (and `check-french` for anything that touches typing); the designer means `check-board` / `check-preview` /
   `check-design`; and **anything that reads a keystroke means `check-keymap` and
   `check-layouts`, plus `tests/shortcuts.test.ts`** — is the binding unique, and can a non-Latin
   keyboard reach it?
4. **Both languages, both directions.** Every string comes from `client/i18n.ts`, and every
   layout is built on CSS logical properties. A change that only reads correctly left-to-right is
   not finished — `LANGSET=ar` on any shoot harness is the cheapest way to see it.
5. **Say why in the code.** This codebase's comments explain the decision, not the mechanism. A
   patch that changes a rule should move the paragraph that stated it.
