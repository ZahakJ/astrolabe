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
| `npm run check-sidepanel` | The right panel's stack of sections: nothing scrolls but the panel, long lists cut with "Show more", folds and order kept (below) |
| `npm run check-windows-layout` | The desktop shell at five window widths × three device pixel ratios × its pointer postures, and which shell each width gets (below) |

## Where the code lives

The client is `client/` (React; the desktop shell is `App.tsx`, the phone shell `client/phone/`),
the server `server/` (Node and Hono), the logic both use `shared/`, the Android shell `mobile/`,
the desktop wrapper `electron/` and `desktop/`, the gates `scripts/`, the suite `tests/`. The
modules that grew largest are cut into parts along their own seams, and each kept its name and
every export, so an import of it reads what it always did (`tests/splits.test.ts` holds each
family to that):

| Module | Its parts |
| --- | --- |
| `server/indexer.ts` — the index's store, building, the event queue | `server/indexer/`: `language`, `resolve`, `folders`, `publish`, `posts`, `queries` |
| `server/api.ts` — middleware, the auth guard, notes and folders, search, the mounts | `server/*Routes.ts`, one router per group (trash, tags, replace, files, comments, Orbits, settings, sync, versions, the event stream, rename), mounted where its routes stood; `server/requestBody.ts` |
| `client/state.ts` — the store | `client/state/`: the types, the document writes, local storage, the helpers, the theme's mirror, and five slices (fields, session, workspace, preferences, notes) |
| `client/components/Sidebar.tsx` | `client/components/tree/` (expansion, icons, the row, the keyboard cursor) and `TagShelf.tsx` |
| `client/components/CommandPalette.tsx` | `client/components/palette/commands.ts` — the command table both shells run |
| `client/components/GraphView.tsx` | `client/graph/sim.ts` — the simulation and the canvas |
| `client/books/BookReader.tsx` | `ReaderPanels.tsx` (the overlays) and `pdfHighlight.ts` (the search hit) |
| `client/styles/app.css` | `reset.css`, `tree.css`, `editor.css` and `publish.css` linked before it, `grips.css` after — in `client/index.html`, where the order is the cascade |
| `client/i18n.ts` — `t()` and the loader | `client/i18n/en.ts` (the key list) and `client/i18n/ar.ts`, one chunk per language |

## The gates

A *gate* is a script that checks one specific promise the product makes, and exits with an error
when the promise is broken. Each one below exits non-zero on failure. The gates that need no browser
need no setup at all. The browser gates need a running instance, plus `npm i -D playwright` and either
`npx playwright install chromium` or a system browser via `CHROMIUM=/usr/bin/chromium`. Those
that sign in take `ASTROLABE_PASSWORD` (open local mode needs no password).

### `npm run check-i18n` — the dictionary

Every string a user can see comes from one dictionary, in two files: `client/i18n/en.ts`, which
is the key list, and `client/i18n/ar.ts`, held to it by type, so a key in one and not the other
does not compile. A page fetches only the language it speaks. This gate fails if any `t()` key is missing, untranslated or dead (used nowhere), or if
the English and Arabic sides of an entry disagree about their `{placeholders}`. It also fails on
hardcoded English text in JSX *and* in code that builds DOM elements by hand. "Dead" is counted
from the call sites only: the dictionary file is excluded from the usage scan, because a key
whose English value happens to be its own name (`read: { en: "read" }`) would otherwise match
inside its own definition and report itself as used.

It reads the TypeScript syntax tree, not lines (`scripts/i18nScan.mjs`), so it sees what a line
scan cannot: a single word, an attribute expression (`title={open ? "Hide" : "Show"}`), a
template literal, JSX text split across lines, `aria-description` or `aria-valuetext`, and a string
child in braces; `tests/i18nScan.test.ts` covers each of those shapes. A literal that is not copy — a honeypot field only bots see, a
folder's literal default name — says "not copy" on or just above its line, and says why. The gate
also reads the Android shell, `mobile/src`, which keeps its own two-language table because its
screens speak before the client loads: every value present in both languages, the Arabic in
Arabic, the same parameters interpolated, every key used, and no English in its builders or in the
error bodies its service worker answers with.

### `npm run check-names` — the names gate

Two features were renamed: the daily routine is **Sigils**, and spaced repetition is **Orbits**. <!-- lineage -->
A rename that leaves one toast, one hint or one heading saying the old word is
worse than none, so this gate greps every surface a reader sees — every English and Arabic value in
`client/i18n/en.ts`, `client/i18n/ar.ts` and `client/orbits/copy.ts`, every page of this manual in both languages, the
README, the seed vault, the what's-new deck and the headings of `CONTRACTS.md` and every `contracts/*.md` — for the words
that may not appear there any more (the old word for a sigil, the study page's working name, and "flash card",
which is "card" now; and their Arabic), and `client/` and `server/` for the old page addresses,
which may exist only as redirect sources. A line that has to tell the history (which older fences
still work, what a release was called at the time) carries the word `lineage` in a comment on that
line — `<!-- lineage -->` in Markdown, `// lineage` in the deck — and is skipped; a dictionary value
never gets that exception. Each hit is printed as `file:line`, and the script exits non-zero.

### `npm run check-contrast` — the accessibility gate

Holds every one of the forty-eight themes in `client/styles/tokens.css` to the WCAG contrast
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
character**.

Click position, hover previews, mod-click navigation and text selection all rest on that mapping,
and what breaks it is a pixel the editor's height map cannot see: **nothing inside `.cm-content` may carry a vertical CSS
margin.** CodeMirror measures every line and block widget by its border box, so padding and
borders are counted and margins are not — put the air on a wrapper's padding, or in a
transparent border with `background-clip: padding-box`, never in a margin. The gate restores the
instance language and deletes its fixture however the run ends.

### `npm run check-ink` — Arabic marks, measured

An Arabic line's layout box is the font's content area, and its marks are painted outside it: a
shadda over the line, a kasra under it. So a gate that reads boxes cannot see a mark being cut, and
this one reads ink. For every Arabic line on the page it measures the glyphs themselves (canvas
`measureText` in the line's own font, `scripts/ink-measure.mjs`) and fails when the ink is cut by an
overflow edge that no scroll can reveal, comes within 2px of the rule its block draws (the h1
hairline), or overlaps the next line by more than a pixel.

It writes two notes carrying the shapes that clip marks — a vocalised h1 long enough to wrap, thirty
headings so the outline has to scroll, callouts, a table, a link each way so the backlinks panel
has a vocalised snippet — sets the instance to Arabic, and walks the editor, the reading view and
the phone shell, and the blog as a signed-out reader at two widths, scrolling each through, in five
rooms (`INK_THEMES=all` for every one). The rules it holds are in `contracts/i18n.md`, "Arabic
marks"; `tests/inkCss.test.ts` holds the stylesheets to them with no browser. Language, layout and
fixtures are restored however the run ends.

    CHROMIUM=/usr/bin/chromium ASTROLABE_PASSWORD=… npm run check-ink -- http://127.0.0.1:8177

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

`KeyboardEvent.key` is the character the *keyboard layout* produced. On an Arabic keyboard the
key marked `P` reports `ح`, so a shortcut matched against Latin letters never fires there, and a
test that types Latin letters cannot see it.

This gate drives the real app through the DevTools Protocol
(`Input.dispatchKeyEvent`, the only way to set `key`, `code` and `keyCode` independently —
Playwright's own keyboard always sends the US `key` for a `code`) with the keydowns that Arabic
101, ЙЦУКЕН, Greek, Hebrew, AZERTY, Dvorak and US QWERTY actually send, and asserts that the
palette, the graph, the shortcut sheet, zen, reading view, search, the pane toggles, bold and
strikethrough all still fire — including `Ctrl/Cmd K` in the signed-out blog shell, which is an
anonymous reader's only binding.

Its second half keeps the layout match from over-reaching: on Dvorak the key that types `b` is physical
`KeyN`, so `Ctrl Alt` on physical `KeyB` — which types `x` there — must do **nothing**. Layout
first, physical position only as the fallback. `tests/shortcuts.test.ts` runs the same matrix
over the resolver with no browser at all, and holds the cases a browser cannot deliver (Chromium
flattens Arabic's two-code-point lam-alef to an empty `key`). A binding added to the shortcut
sheet belongs in that file too, or it goes untested on every non-Latin keyboard.

`node scripts/shoot-layouts.mjs` is the companion picture: the `Ctrl/Cmd /` sheet with the
layout map stubbed to Arabic and to Russian, which is how the annotated keycaps are reviewed.

### `npm run check-sidepanel` — the side panel

`CHROMIUM=/usr/bin/chromium npm run check-sidepanel -- <url> <password>`, against a scratch server.
It opens the note with the most backlinks with every section of the right panel open, at 900 and
520px tall, and asserts what no screenshot shows: no section, and nothing inside one, scrolls on
its own; when the sections are taller than the window the panel scrolls as a whole and reaches
every header; the backlinks list draws at most 20 cards and its **Show more** adds rows; each header
is a button controlling a labelled region; and a fold and a reorder (by pointer and by Alt+↑) come
back after a reload, and fold-all folds every section. Run it whenever `client/sidePanel.ts`, `PanelStack.tsx` or a section of
the panel changes.

### `npm run check-windows-layout` — the window gate

Every other browser gate here looks at the app at one or two comfortable widths. Real windows are
narrower: a Windows laptop panel is 1366 physical pixels, which is 1093 CSS px at 125% scaling and
904 at 150%; half of it under `Win+←` is 683. A resize defect there depends on the viewport **and**
the pointer together, so no single screenshot shows it.

This gate is a ladder rather than a screenshot. It drives the built app at **1366, 1280, 1024,
900 and 720 CSS px** — the desktop shell's own widths — each at **device pixel ratio 1, 1.25 and
1.5**, in both directions,
with the pane widths both empty and seeded to a pair the reader could actually drag them to
(`{560, 560}`), under the three pointer postures Chromium really reports on Windows:

| posture | what it is | what it must give |
|---|---|---|
| `mouse` | a desktop tower or a plain laptop | docked panes and grips at every width above 700 |
| `slate` | a hardware slate — touch, a rotation sensor, the ACPI slate bit. **An attached mouse does not change Chromium's answer** | the phone shell, at every width |
| `touchlaptop` | a fine pointer and a finger | docked panes, grips, **and** 44px rows |

The postures are Blink settings on the browser process (`--blink-settings=availablePointerTypes=…`),
which is what `pointer_device_win.cc` itself hands the renderer — not DevTools media emulation,
which `setViewportSize` silently drops halfway down a ladder.

**Which shell.** A last rung, `whichShell`, walks each posture down the widths (700 and 600 too) and
asserts the phone shell below 700 and on a slate at every width, and the desktop — unmoved —
everywhere else. Every cell the desktop is mounted in is docked.

In each cell it asserts that the sidebar is a real grid column (not auto-placed, not an overlay)
wherever a pointer can hit a strip, that each docked pane has a grip whose 12px hit area is
**centred on the pane's own 1px divider** — `elementFromPoint` at the seam must return the grip —
that the note column never falls below its 320px floor whatever is stored, that neither pane and
neither pane's close button runs off the window, and that the document never scrolls sideways.

Three rungs after the ladder watch the frames the ladder cannot see, because it waits 300ms after
each resize and a 0.18s transition is over by then. They ask what the reader actually sees while a
window is being dragged and while a pane is being folded: the note column still has its 320px
**one frame** after a resize (at two ratios and in both directions), and the reader's own
`Ctrl/Cmd Alt B` fold is still mid-flight 60ms in, at two widths. All three hang on one flag, the
class that says "this width is not the hand's doing": up while a window is resized, down while the
reader folds a pane.

Needs a running instance, `CHROMIUM`, and the instance's password as the second argument.

    npm run check-windows-layout -- http://127.0.0.1:8177 <password>

Without a Windows machine, the real Windows renderer's scrollbars, pointer events and media
queries can still be checked: run the packaged Windows executable under Wine with
`--remote-debugging-port=9333` and run the same assertions over CDP. Do this before a release that
touches the shell.

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
longer a row.

### `npm run check-excerpt` — the tag-in-prose gate

`DESIGN.md`'s hard rule is that a snippet shown outside the editor either STRIPS Markdown or
RENDERS it. Removing a `#` and leaving the bare word standing in the sentence is neither: a post
ending "…a breath. #design #typography" must not reach the front page as "…a breath. design
typography". The three surfaces that flow through
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
escaping the boundary) against what the ADMIN gets (the designed page, the failing section
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
per family, and no preset naming a note in a particular vault. It runs the shared `assertCatalog`
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

From the source alone: no `outline: none` without a replacement
focus ring in the same rule, an accessible name on every icon-only control, and the rest of the
list at the top of the script. Like check-i18n, it exists for the class of regression that is
invisible in review and invisible in a screenshot.

### `npm run check-cascade` — no phone rule is undone by a later one

No browser, no server. The phone and the touch shell are `@media` blocks written over the
desktop's rules, and a block only wins when it comes **after** what it adjusts. A phone rule is
dead when a rule for the same selector and property sits later in the cascade with no condition at
all — for example a settings declaration restated for the desktop by `settings.css`, which loads
after `app.css`. Each file reads correctly on its own; the loser is simply never applied, so
neither a diff nor a screenshot review can see it.

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

Its companion is `tests/breakpoints.test.ts`, which holds every stylesheet under `client/` and
`mobile/src` to ONE phone width: a `max-width` between 601 and 799px is the shell's 700
(`PHONE_SHELL_QUERY`, client/shellQuery.ts), unless the three lines above it say why not with the
words "not the shell's 700" — the public blog's 640 does, for its own grids — and no source file
spells a phone query out instead of importing the constant.

### `npm run check-phone` — the phone shell, driven

A browser gate:
`CHROMIUM=/usr/bin/chromium ASTROLABE_PASSWORD=<pw> npm run check-phone -- <url> [outdir]`,
against a scratch server. It drives the phone shell (`client/phone/`) the way a reader's thumb
does, in English **and** Arabic, on six shapes, and photographs every screen and sheet it passes.

**What it does, as assertions.** A tap on a folder pushes the folder; a tap on a note changes the
URL and the title; the note screen has no tab bar; the note sheet takes a history entry and the browser's back closes it
before it pops the note; Publish asks, and a cancelled publish publishes nothing; the mode icon
flips the mode it names; back pops the note to its folder; a long press raises the row's action
sheet and back closes it; Search is focused on arrival; a calendar day opens as a sheet; a deep
link opens its note and back from it comes home to Today; no page errors. Each page is asked what
a thumb asks of it: Orbits lists its decks, a deck opens, and
**Study starts the session full screen** (on a tablet it takes both columns) and back lands on the
deck; Sigils lists its sigils, a sigil opens and **a tick answers at once and the server has it**;
Media lists its shelves and a tracker opens its card; **a book wears one bar of its own** (no
desktop bar, no phone top bar) and **its scrubber moves the page**; the reader's ⋯ is an action
sheet and **back closes it** and keeps the book; the theme picker (a layer on `<body>`) takes a
history entry and back closes it; Settings is a list, a section is a screen, an edit raises the
save bar, **back with an edit asks** and Cancel keeps the edit, and **Save writes it**; the tag
picker opens over the note sheet and **writes the tag into the note**; and **a folder comes back
scrolled where it was left**. Folders: **two folders down, a reload keeps the folder and its ‹ lands on the parent**, and so it does after
a trip to Today and back, with the OS back going up from there rather than home; the folder's top
bar is its path as crumbs that end in its own name and go up (through "…" where they fold); the
Notes tab starts on the Tree on two columns and on Folders on one; the Tree opens a folder in place,
**remembers it across a reload**, folds a folder's files into one row that opens in place, says an
empty folder is empty, and a long press on its row is the menu; and on two columns the list **keeps
its scroll and its lit row while the note changes**, the grip widens the list and the width is
remembered, and the note's sheet slides over the note's column, not the list.
`CHECK_PHONE_SHAPES=phone,fold-open` runs a few shapes while working; the gate is all six.

**What it measures, on every screen and sheet.** Nothing overflows sideways (a strip that
scrolls on purpose is exempt); every shell target is ≥44px (height always, width too when the
control carries no text; prose, a checkbox inside a ≥44px label and a data picture's cells are
not shell targets); every text field is ≥16px, below which iOS Safari zooms into the field; and
nothing covers a target (`elementFromPoint` at its centre answers the target). Under an open
sheet only the sheet is asked, because the page under it is inert on purpose. The note sheet's
Outline and Backlinks panes are measured WITH ROWS IN THEM: when the note has headings and
backlinks (asked of the server), the gate first asserts that the pane lists them, so a 44px check
never passes over an empty pane.

**The six shapes.** `phone` is a Pixel 7 at 412×915 with a finger. `fold-cover` and `fold-open`
are a Galaxy Z Fold's two screens as Chrome reports them at its DPR of 2.625 — the cover screen at
344×882 and the inner screen opened at 690×829, both one column (two columns start at 1000px), the
inner one with the note's tabs. `stylus` is 720×820 at DPR 1.5 with a pen — `availablePointerTypes=6,
primaryPointerType=2, availableHoverTypes=3, primaryHoverType=1`, a blink setting on its own
browser, because `hasTouch` makes Chromium report a coarse-only device whatever the pointer flags
say; it draws one column, the open Fold's width. `tablet` and `tablet-land` are a touch tablet at 820×1180 (one column, with tabs) and
1180×820, where the shell draws its rail, its list column and the note, and the note sheet slides
over from the side. After the matrix, **a note takes the page**: at 344, 690, 829×690, 768, 820, 1024
and 1180, in both languages, an open note is at least 90% of the viewport under 1000px; above it the
list is at most 360px and **Hide list** makes the note at least 90%, remembered across a reload; a
690 window widened to 1180 and back keeps its note open; and from 600px a second note opened from the
list is a second tab, the first one tap away, **×** showing its neighbour and a reload keeping both.

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
cause written beside it. The dictionary is two chunks, one per language, and neither is in the
entry: each audience is measured with one language in it, the larger, since a page downloads the
one it speaks.

### `npm run check-perf` — the performance gate

After `npm run build`. Every other gate here holds a promise about what the product *does*;
this one holds the promise about how it *feels*, and that promise is the one that decays
invisibly — no screenshot shows a keystroke arriving a frame later, and nothing at all shows
on the seed vault, because the vault where it shows is the one with two thousand notes in it.

So the gate brings its own. `scripts/perf-fixture.mjs` generates a vault from a fixed seed —
2,000 notes across 40 folders with frontmatter, wikilinks and tags, a 3,000-line note, a note
with fifty embeds, a year of daily notes and twelve sigils with most of a year of log under
each — and `check-perf` starts its own server over it, on
its own port, in open local mode. **It never takes a vault path**, and the fixture reads nobody's
disk, so neither can be pointed at yours. Set `ASTROLABE_SEED_VAULT=<vault>` to fold a real book
and real Sigils and Orbits notes in as well; leave it unset and the gate measures the generated
vault, which is the same vault on every machine.

Nine budgets over seven surfaces, each the **best of several rounds** with the CPU throttled to a quarter speed
(Lighthouse's mid-tier multiplier — an unthrottled loopback has no headroom left in which a
regression could show). Best-of, not average: other work on the machine can only ever make a
round slower, so the fastest round is the one closest to the cost of the work itself, and a gate
built on the average is a gate that fails because somebody started a build.

| Budget | What it catches |
| --- | --- |
| **first paint** of the admin app | a static import that drags a lazy surface back into the shell's first request |
| **keypress → paint** in the 3,000-line note, median and p95 | a per-keystroke pass that has quietly become O(document) |
| **long-task time** over a 40-keystroke burst | the same failure, measured as work rather than as which side of a frame boundary it landed on — the sharpest of them |
| **reading render** of that note | the same, for the one operation whose cost is the whole document at once |
| **the Sigils page**, door → twelve cards drawn (budget 1,650 ms) | a card whose streak, heatmap or week went back to walking the whole log per render |
| **the Calendar page**, door → the month drawn with its lines and daily-note dots (250 ms) | a day cell that reads the vault instead of the agenda the page computed once |
| **the phone's Tree**, a tap → a folder of fifty open (100 ms), and the longest main-thread task over sixteen taps (none) | a tree that walks the vault instead of the rows that show, or measures its window after the rows are in the document |

Typing latency is the browser's own Event Timing — hardware keydown to the paint that shows the
letter — not a frame counter, and the caret is put at line ~1,500 first, because typing at line
1 of a long note measures a short note. Budgets move like `check-bundle`'s: by the actual
overage, with the cause written beside them, or **down** when a round earns it. `PERF_ROUNDS=1`
is the quick form; `PERF_KEEP=1` leaves the generated vault behind to look at.

### `npm run check-media` — the folder chip

In a browser, against a running instance (`node scripts/check-media.mjs http://localhost:6801`,
`ASTROLABE_PASSWORD` when the instance has one). Writes two trackers through the API, one over a
plain folder of two notes and one over a folder that has its own note, opens the Media page and
presses each folder chip: the folder's row must be in the tree, unfolded, scrolled on screen and
painted — without the tree holding keyboard focus, which a click on the Media page never gives
it — and the folder with its own note must open that note as well. The fixtures are deleted,
permanently, however the run ends.

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

A browser gate for a failure only right-to-left shows: a preview scaled with a physical `transform-origin` inside a logical layout sits away from its
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
**boot** gate fails on an uncaught exception or a syntax error in the first 25 seconds. The
**relaunch** gate sets `ASTROLABE_SELFTEST=relaunch`, which makes the app restart itself four
seconds after boot exactly the way an applied update does, and passes only when the first process
is gone *and* a second one started from the same file is running — a bare `app.relaunch()` is not
enough from an AppImage, because Electron's relauncher runs from the mounted image after it is
unmounted. Every
AppImage release runs both before upload.

### The parity tests — one rule, every side

Some promises are not a script's but the suite's, because they hold between two pieces of code
that must agree. `contracts/gates.md` lists every gate; these are the tests that hold one rule
across every place that applies it:

| Test | What it holds |
| --- | --- |
| `tests/pocketParity.test.ts` | The phone's pocket index and the server's give the same answers on one fixture vault: link resolution, aliases, tags, banners, backlinks, search and the tree's order. |
| `tests/headings.test.ts` | One heading rule (`shared/headings.ts`): the editor's `[[Note#` offers, the outline, the anchor table and the reading view's ids are the same list, and a YAML `# comment` is never a heading. |
| `tests/byteRange.test.ts` | One `Range:` parser (`shared/byteRange.ts`) behind both `/api/file` routes, and the same five requests answered the same way by each. |
| `tests/fileTypes.test.ts` | One served-type table, one kind table and one image test (`shared/attachments.ts`), one tree order (`shared/tree.ts`), one local day (`shared/dates.ts`) — and no stray copy of either of the last two in the code. |
| `tests/breakpoints.test.ts` | One phone width in every stylesheet (above). |
| `tests/i18nScan.test.ts` | The copy scan sees every shape of copy listed above. |
| `tests/rtlGlyphs.test.ts` | A Bidi_Mirrored glyph (‹ › « ») is mirrored once: whether the browser mirrors it depends on the font, so a glyph flipped by hand under RTL must be pinned left-to-right first. |
| `tests/sourceText.test.ts` | No source file carries a literal control character, so grep never calls it binary. |

## Performance

*The vault performance is measured on, and what is still slow and why.*

### The fixture

The seed vault is a dozen notes, where everything is instant, and a real vault is private. So
`scripts/perf-fixture.mjs` generates a third one from a fixed seed, so that a number taken today is
comparable with one taken next month:

- **2,000 notes** across 40 folders, each with six frontmatter properties, five `[[wikilinks]]`
  and three `#tags` — 110 distinct tags in a tree, and 2,000 nodes for the graph;
- a **3,000-line note** (291,000 characters, 54,000 words) — the editor's worst realistic case;
- a note with **fifty `![[embeds]]`**;
- a **year of daily notes**, so the Calendar page has a month with something in every cell;
- and, only when `ASTROLABE_SEED_VAULT` names a vault to take them from, a real PDF and the real
  **Sigils** and **Orbits** notes, so the reader and both shelves have something of their own to
  draw. It is opt-in and says so in its own output: a fixture must never put somebody's private
  notes behind an unauthenticated scratch server, and a budget must be one any machine can meet.

Numbers are taken through the DevTools protocol against a scratch server over that vault, with the
CPU throttled to **a quarter speed** (see `check-perf` above). Throttled numbers move with the
machine's load, so measure on a quiet machine and compare only runs taken back to back.

### Where the time still goes

Known costs, left as they are on purpose:

- **The tree holds 2,151 rows in the DOM** with forty folders open, and opening all forty at once
  costs about a second of React reconciliation and DOM creation. Scrolling it stays within a
  frame, and one folder is a fortieth of that cost. The list is not virtualised: the rows carry
  drag-and-drop, a roving tab index, `aria-posinset` over the filtered set and a keyboard walk,
  and a virtualiser under all four would trade correctness for a number no reader produces. The
  per-folder cap ("Show N more", 300 rows) is the answer.
- **The graph's layout is about half of its own time**, in a hand-written Barnes-Hut force
  simulation over typed arrays, with most of the rest in `drawImage`. That is a simulation doing
  its work, not a bug; 2,000 nodes settle in about eight seconds and the canvas is up in two.
- **Search is mostly idle.** The time from the first keystroke to the first row is the 200 ms
  debounce plus the typing itself plus a short server round trip; each keystroke paints within a
  frame. The debounce is the feature.
- **The reading render is mostly layout** — six thousand nodes of prose being measured by the
  browser. The JavaScript above it is a small fraction.
- **Opening a surface for the first time costs its chunk.** On a cold visit, most of the time to
  open the Sigils, Orbits and Calendar pages is fetching and parsing the lazy chunk those pages
  live in. That is the split working, not failing.

### Testing offline

Stop the server to test offline reading. The browser's offline emulation intercepts a navigation
above the service worker and never lets the worker answer, so a harness that uses it reports
`net::ERR_FAILED` and has proved nothing. With the server stopped, a navigation to a note renders
the cached shell with the "Reading this device's copy" strip on it; see [Offline](offline.md).

## The done bar

The sequence a change runs before it is called finished, in this order: `npm run typecheck` ·
`node scripts/check-i18n.mjs` · `npm test` · `npm run build` and then `npm run check-bundle` · `npm run check-perf` (on a quiet machine) ·
`npm run check-a11y` · `npm run check-contrast` · `npm run check-settings` (with
`node scripts/gen-settings-index.mjs` first when a row changed) · `npm run check-keymap` when a
key changed · `npm run check-names` · `npm run check-shell-seam` · `npm run check-docs` · `npm run build-docs` ·
`npm run check-desktop` when `electron/` or `desktop/` changed ·
`npm run check-windows-layout` when the shell's layout, the panes or their breakpoints changed ·
`npm run check-sidepanel` when the right panel or one of its sections changed ·
`npm run check-cascade` and `npm run check-ink` whenever a stylesheet changed.
Then the browser gates the change touches — `npm run check-phone` whenever a stylesheet or a
piece of the shell moved — with `CHROMIUM` and `ASTROLABE_PASSWORD` set, against a scratch
server over a scratch vault — never a real one.

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

1. **Read `DESIGN.md` and the contract for your area first.** `DESIGN.md` carries the rules a
   change is judged against; the contracts carry the promises the code has already made —
   `CONTRACTS.md` is the map, and the words are in `contracts/`, one file per area (core, the
   vault and server, the shells, themes, the editor, reading, the public site, features, sync and
   the apps, i18n, the gates, the release history). A change is written into the section it
   changes — **edit the area, append nothing** — and a release adds one line to
   `contracts/releases.md`. Most review comments here are one of those documents quoted back.
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
