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

### `npm run check-bundle` — what each audience downloads

After `npm run build`. The client ships one entry chunk plus a chunk per surface, and the split
only means something if it holds: one careless import at the top of a file the entry already
loads brings the whole app shell back into an anonymous reader's first request. The gate measures
every audience's download against a budget; a budget moves only by the actual overage, with the
cause written beside it.

### `npm run check-books` — the reader

After `npm run build`. Ten properties of the PDF reader that are invisible in review and
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

## The done bar

The sequence a change runs before it is called finished, in this order: `npm run typecheck` ·
`node scripts/check-i18n.mjs` · `npm test` · `npm run build` and then `npm run check-bundle` ·
`npm run check-a11y` · `npm run check-contrast` · `npm run check-settings` (with
`node scripts/gen-settings-index.mjs` first when a row changed) · `npm run check-keymap` when a
key changed · `npm run check-names` · `npm run check-docs` · `npm run build-docs` ·
`npm run check-desktop` when `electron/` or `desktop/` changed. Then the browser gates the change
touches, with `CHROMIUM` and `ASTROLABE_PASSWORD` set, against a scratch server over a scratch
vault — never the owner's.

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
