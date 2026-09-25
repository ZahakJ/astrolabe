# Gates — every check and what it asserts

Every `scripts/check-*` gate and what it asserts, then the test suite. Part of the module contracts (see [CONTRACTS.md](../CONTRACTS.md) for the map). **Edit the area, append nothing:** a change to how something works is written HERE, in the section it changes, and the old sentence goes; a release gets one line in [releases.md](releases.md), never an addendum.

## Every gate

All green before a release (the list the briefs name as common ground): `npm run typecheck` ·
`node scripts/check-i18n.mjs` · `npm test` · `npm run build` (never bare vite) then
`node scripts/check-bundle.mjs` · check-a11y · check-contrast · check-settings · check-keymap ·
check-names · check-docs · check-books · check-whatsnew · check-desktop · check-shell-seam ·
check-cascade · `npm run build-docs` · and the browser gates against a scratch server (check-phone,
check-fidelity, check-windows-layout, check-deck, check-french). check-perf runs on a quiet machine
after a build. Each script's own header says why it exists; the line below is what it asserts.

| Gate | What it asserts |
| --- | --- |
| `check-a11y.mjs` | Static accessibility rules over the client's source and CSS: no focus ring removed without a replacement, every icon-only control named, `aria-hidden` never on something focusable, and no literal `z-index` at or above 300 outside the `--z-*` ladder (a `z-ok:` comment is the one waiver). |
| `check-board.mjs` | The designer's section board in a browser: a row moves three ways (buttons, pointer, keyboard lift), the drop is shown before it happens, and Esc belongs to the innermost layer. |
| `check-books.mjs` | Ten source properties of the book reader, after a build: the pdf.js worker is a real same-origin asset (no `blob:` under the CSP), the engine has one door, and the rest listed in its header. |
| `check-bundle.mjs` | What each audience downloads, read from `dist/.vite/manifest.json`: a visitor's first request carries no admin surface, every lazy surface stays lazy (the two dictionaries among them), and per-audience byte budgets hold — each audience measured with ONE language, the larger, since a page fetches the one it speaks; `sw.js` names both dictionaries; a budget moves only by a measured overage (or saving) with its cause beside it. |
| `check-caret.mjs` | Pointer → document accuracy in the live-preview editor, in a browser: caret placement, hover, mod-click, selection and the double-click word land on the character under the pointer. |
| `check-cascade.mjs` | No phone or touch declaration (an `@media` asking `pointer: coarse`, `hover: none` or a `max-width` ≤ 1000px) is undone by a later unconditional rule for the same selector and property, across every stylesheet in load order. |
| `check-contrast.mjs` | WCAG ratios for every theme's tokens (text 4.5:1, muted and faint 3:1, accent, focus ring); every theme id has a block and every block an id; `:root` carries `THEMES[0]`'s values; every block declares every token. |
| `check-deck.mjs` | Every what's-new slide, in English and Arabic, measured in a browser: nothing runs off its frame. |
| `check-designer-nav.mjs` | The designer in both directions: every preview draws inside its own box (the RTL `transform-origin` trap), and navigation and alignment behave. |
| `check-desktop.mjs` | The desktop app's files, with no Electron installed: the questions whose answers go silently wrong when something else is edited (then `npm --prefix desktop run typecheck`). |
| `check-desktop-boot.sh` | The packed AppImage's main process boots under a virtual display and stays up. |
| `check-desktop-relaunch.sh` | The packed AppImage restarts itself the way an applied update does, and comes back. |
| `check-docs.mjs` | The manual: every link lands in both languages, every "Settings → …" path names a tab and a row that exist, every image is on disk, every Arabic page has its English twin's headings. |
| `check-excerpt.mjs` | No note hands a reader a de-hashed tag as prose: snippets strip a tag whole or render it. |
| `check-fidelity.mjs` | The editor's live preview and the reading view draw the same pixels for the same markdown; and an Arabic first paint whose dictionary chunk is held back never shows an English chrome string or a key name. |
| `check-french.mjs` | French auto-correction, typed into a real editor: each promised case, one undo step, the mixed-line rule. |
| `check-hovercache.mjs` | The hover-card cache's LRU bound holds over a real session of hovers. |
| `check-i18n.mjs` | The dictionary (`client/i18n/en.ts` and `ar.ts`, read as text by `scripts/dictionary.mjs`): every key used is defined in English and Arabic (Arabic in Arabic), placeholders match, no key is dead; no bare English in JSX or a DOM sink, read on the TypeScript syntax tree (`scripts/i18nScan.mjs`); and the Android shell's own dictionary, its builders and its service worker's error bodies. |
| `check-keymap.mjs` | No two rows of the keymap ledger claim one keystroke in one place, every advertised chord has a handler, and `docs/keymap.md` is a rendering of the ledger. |
| `check-layouts.mjs` | Dev harness: every documented shortcut still fires when the system keyboard is Arabic, Russian, Greek or Hebrew. |
| `check-names.mjs` | No routine, constellation or flashcard on a reader-facing surface (dictionary values, docs, README, seed vault, package blurbs, the what's-new deck, the headings of `contracts/*.md`), and the old page addresses only as marked redirects. |
| `check-pdfsearch.mjs` | PDF search end to end in a browser: the hit row, the page, the reader opening on it. |
| `check-perf.mjs` | On a generated 2,000-note vault at 4× CPU, best of several rounds: first paint, keypress → paint (median, p95), long-task time, reading render, and the Sigils and Calendar pages drawn — each under its budget. |
| `check-phone.mjs` | The phone shell driven like a phone on four shapes in both languages: a tree tap changes the URL, Back pops screens and closes sheets first, Publish asks, a long press is a menu; every screen and sheet (the Outline and Backlinks panes with their rows) has 44px targets, 16px fields, nothing sideways and nothing covered. |
| `check-presets.mjs` | The design catalog: unique ids, bilingual names and blurbs, real Arabic, known families, no section that names a note. |
| `check-preview.mjs` | The designer's live preview is a real frame of the composed site, at three device widths, settling as the author types. |
| `check-print.mjs` | The print stylesheet in a real Chromium (`emulateMedia("print")`): the whole note, no chrome, legible ink. |
| `check-sections.mjs` | Outline section surgery is an exact permutation over thousands of generated documents (frontmatter, fences with `###` in them, skipped levels, CRLF, no trailing newline). |
| `check-settings.mjs` | The settings index still describes the panel; a tab holds at most eighteen rows; every hint is one short sentence. |
| `check-shell-seam.mjs` | The phone shell and the desktop shell share logic and never chrome (the rules are in `scripts/shell-seam.mjs`). |
| `check-signatures.mjs` | The signature houses render through the real public renderer against an isolated fixture API. |
| `check-whatsnew.mjs` | Every minor version (x.Y.0) has a what's-new entry with at least one slide; a patch needs none. |
| `check-windows-layout.mjs` | The desktop shell at the widths and pointers real windows have (720 and up), and which shell each posture and width gets. |
| `gen-folder-icons.mjs --check` (`npm run check-icons`) | The folder-icon catalog on disk matches its generator. |

## Tests (`npm test`) — the release gate

`node --test` over `tests/*.test.ts`. No new dependencies, no test framework, no fixtures on disk
beyond the temp vaults the tests build themselves. The whole suite runs in well under a second, so
there is no reason to skip it.

**Nothing ships until all of these are green:**

```
npm run typecheck
npm run check-i18n
npm test
node scripts/check-contrast.mjs
npm run check-bundle
npm run check-keymap
npm run check-books
npm run check-whatsnew
```

(plus whatever visual gates the repo carries at the time — `check-caret`, `check-sections`,
`check-excerpt`, `check-fidelity`, `shoot-hover` — which cover what a screenshot has to prove and
the tests cannot. `check-fidelity` writes one rich note and asserts the editor's live preview and the
reading view compute the same styles on the same anchors, in both chrome languages, and that no
table cell breaks inside a word on a phone.)

What the suite covers, and why each file exists:

- `tests/frontmatter.test.ts` — the byte-level contract of `setFrontmatterLine()`. Mostly a
  property test: for generated notes (CRLF/LF, quoted values, malformed YAML, bodies containing
  their own `---` rules and `publish:` lines) the edit changes ONE line and every other byte
  survives, the edit is idempotent, and removing the key restores the rest. Also pins server/client
  agreement on what "published" means.
- `tests/links.test.ts` — wikilink parsing plus resolution on BOTH sides (`server/indexer.ts` and
  `client/editor/links.ts`), including duplicate basenames, folder-named files, path-form targets,
  Arabic and punctuated titles, and visitor scoping. The parity block is the point: the editor and
  the graph must land on the same note.
- `tests/aliases.test.ts` — every surface of `aliases:` from one vault (resolution, search,
  `/api/aliases`, backlinks) plus the write half over strings alone. Pins the three YAML
  spellings, alias-vs-filename precedence, the `pickShortest()` tie, a `.tex` note's aliases,
  visitor scoping in both directions, and that a deleted note's aliases leave the table — the
  incremental-upkeep case, which is the one a future refactor will break. It carries a parity
  block of its own, for the same reason `links.test.ts` does: the client resolver must name the
  note the server names, or an alias is a dashed link over a note that is right there.
- `tests/books.test.ts` — the reader's testable half: that a book's key follows
  its BYTES across a rename and differs between books, that the store merges a
  partial patch and never lands in the vault, the search fold (harakat, the
  alef family, tatweel, a line break inside a phrase, offsets into the original
  string), the `:` grammar including its abbreviations and Eastern Arabic
  digits, the page window's bound and the right-to-left spread order, and the
  operator-list geometry that keeps night mode off the photographs. The
  rendering half needs a browser and is not faked: a test asserting pdf.js was
  called proves nothing about whether a page appeared.
- `tests/keymap.test.ts` — the keyboard ledger: `GROUPS` parses, every row has an answer (a key or
  the surface that carries it), every `keys` array spells a chord the one canonical way, no two rows
  resolve to the same chord in an overlapping scope, every declared overlap in `RESOLVED` still
  happens and still says why, and `docs/keymap.md` claims exactly the chords `GROUPS` binds. It runs
  the same code `npm run check-keymap` does (`client/keymap.ts`), from the other door, so a green
  gate and a green suite can never disagree. Its companion is `tests/shortcuts.test.ts`: this file
  asks whether a binding is UNIQUE, that one asks whether a keyboard typing no Latin letters can
  reach it. A new binding needs both.
- `tests/capture.test.ts` — `appendCaptured` (a new section, an existing one, a `###` inside it, an
  empty one, CRLF, a multi-line thought), `clipFileName`, `clipNote`'s exact bytes, `yamlQuote`,
  `splitSharedText`, the manifest's fields and `share_target`, `themeSwatch` against a tokens.css
  fragment, and that the bookmarklet is one line whose every string is quoted and whose source
  parses.
- `tests/clip.test.ts` — the clipper's writes against a throwaway vault: a page under `Clips/` with its
  source, never overwriting (` (2)`, ` (3)`), the title from the page then the host, the
  `javascript:` refusal, a thought captured into today's note, `captureLine` into a named or a
  missing note, and the token (made on first ask, 0600 in the data directory, retired by rotation).
- `tests/htmlToMarkdown.test.ts` — the converter: each tag it keeps, each it drops, `<article>` over
  `<main>` over `<body>`, absolute links and the `javascript:` refusal, list nesting and `start`,
  fences that grow past inner backticks, the escape set, entities, and that rubbish never throws.
- `tests/anchors.test.ts` — `[[Note#Anchor]]` against both anchor resolvers (editor by heading
  TEXT, reading view by SLUG), plus `Slugger` collisions and unicode.
- `tests/sections.test.ts` — the partition invariant: cutting a note at its heading line numbers
  and concatenating the pieces returns the original bytes. Property-tested. Fences full of `###`,
  frontmatter, nesting and CRLF included. Any section extract/move/fold feature must keep this.
- `tests/excerpt.test.ts` — excerpts and search snippets through `posts()`/`search()`: no raw
  markdown, no de-hashed tag words in the prose, no template furniture as an opening paragraph,
  word-boundary truncation, HTML escaped before `<mark>`.
- `tests/tracker.test.ts` — the tracker parser (every progress and rating form, the status
  synonyms people actually type, Eastern Arabic digits, block-scalar notes, the null that makes an
  unparseable fence fall back to a code block), `setTrackerProgress`'s byte discipline (one line
  changes, CRLF and spacing survive, up-then-down is the original body), the fence scan against
  the nested-fence trap, and `trackers()`' scope through a fixture vault: published-only for a
  visitor, the whole vault for an admin, templates off both shelves.
- `tests/paths.test.ts` — traversal, dotfiles/`.trash`/`.obsidian`, encoded separators, NUL bytes,
  unicode normalisation and symlinks.
- `tests/settings.test.ts` — the PATCH allowlist as a security boundary: unknown keys, prototype
  keys, per-key validators, the enum keys, and "a patch that fails anywhere lands nothing". It also
  cross-checks that `server/settings.ts` THEMES still equals `client/state.ts` THEMES — the drift
  that makes the admin panel offer a theme the API answers 400 for.
- `tests/numerals.test.ts` — one numeral system per instance, checked on a DATE and a COUNT
  together (the `٩ يناير ٢٠٢٦ · 3 دقائق قراءة` regression), the separator/digit confusion rule, the
  calendar tripwire, and tag-label encoding/isolation/direction.

- `tests/pocketServer.test.ts` — the pocket vault's `/api/*`, over an in-memory filesystem
  (`tests/helpers/memoryFs.ts`): the wire shapes the unmodified web client reads, the tree's order
  and what it hides, path traversal refused at the boundary, the `baseMtimeMs` precondition and its
  `409 code:"stale"`, search through `shared/fold.ts` (a pointed Arabic note found by a plain Arabic
  query), an operator it cannot answer narrowing to NOTHING rather than being ignored, snippets with
  no raw markdown in them, link resolution and backlinks by the server's own rule, byte ranges on
  `/api/file`, git as the version history, and that every server-only route answers 501 with a
  sentence naming what is missing. Since 3.22.2 it also pins the friend's bug: settings written into
  `.astrolabe/settings.json` and read back by a SECOND server over the same filesystem with an empty
  device store, the git-sync keys refused with a reason and nothing written, a laptop's public-site
  settings answered as the facts a phone actually has, the three `/api/pocket/*` shapes, and
  `me.pocket`.
- `tests/voice.test.ts` — voice notes (3.24.0) with the engine faked: the note-writing rule (≤ 80
  words a bullet in `Inbox/<day>.md`, 81 a note of its own, the link-only and words-only bullets),
  the recording and long-note filename schemes against every attachment mode, whisper's furniture
  removed, the queue (FIFO, one at a time, a failed transcription still landing the link, "keep the
  audio" off deleting only AFTER words land, silence keeping the recording), the landing over a
  throwaway vault (after the phone's own lines, never overwriting a long note, a linked recording
  never swept as unused), the resampler's low-pass, the thirty-second windows (cut at pauses,
  contiguous, silence never sent), and the recorder's own copy.
- `tests/voiceEngine.test.ts` — voice notes without a GPU: the processor's thread count (physical
  cores, capped at eight, never past the process's affinity; `/proc/cpuinfo` read by core id), the
  catalogue's two forms of every model, and the backend over a stand-in transcriber
  (`tests/helpers/fakeVoiceWorker.ts`): "cpu" never probes a GPU, a GPU build that finds no device
  or takes the child down mid-job hands the same recording to the processor, a processor engine
  that will not load falls to whisper.cpp's CPU build, the REAL transcriber with every GPU build
  forced to refuse (`ASTROLABE_WHISPER_FAIL_GPU=1`) answers the probe with the processor, and the
  status line that leaves says "on the processor" in both languages. The default's migration is in
  `tests/settings.test.ts`.
- `tests/pocketSync.test.ts` — the two rules about other people's writing: where a `(phone)` file
  goes and that it never overwrites last time's, that agreement is not a conflict, that BOTH versions
  survive, that the standing pairs are recovered from the working tree (a conflict is a fact, not a
  memory), and the sync line's precedence — a pending push is always louder than a past success, and
  a conflict is louder still and never ages out.

- `tests/splits.test.ts` — the large modules cut in the 3.29 sweep ([core.md](core.md), "Where
  the code lives"), one block per family, over the import graph read off the syntax tree
  (`tests/helpers/importGraph.ts`): every name any importer asks the kept module for is still
  exported, no part exports a name its family does not take, and nothing outside the family
  imports a part.
- `tests/i18nSplit.test.ts` — the dictionary by language: the two files hold the same keys in
  the same order, every value in both, parity declared as a type, the gates' text reader agrees
  with the modules, only the loader and `both.ts` reach the files; and the runtime — nothing
  spoken before a language is installed (the key, never an invented string), a switch applied at
  once when its strings are here, one that waits for them, and one superseded while waiting that
  never lands.

**Tests named `KNOWN BUG:` assert current, wrong-ish behavior on purpose** — they are the written
record of a defect nobody has decided to fix yet, and they keep the suite honest instead of green
by omission. Fixing the bug means rewriting that test, which is the intended workflow.
The three `KNOWN BUG:` tests in `tests/anchors.test.ts` (emphasis, an indented heading, a
closed-ATX heading) were rewritten that way when `shared/headings.ts` fixed them.

**The parity tests hold ONE rule across the places that used to keep a copy each:**
`tests/pocketParity.test.ts` (the pocket's index against the server's on one fixture vault:
resolve, aliases, tags, banner, backlinks, search, the tree's order), `tests/headings.test.ts`
(the heading contract), `tests/byteRange.test.ts` (the same `Range:` requests against both
`/api/file` routes), `tests/fileTypes.test.ts` (one served-type table, one image test, one tree
order, one local day, and a scan for stray copies), `tests/breakpoints.test.ts` (one phone width),
`tests/i18nScan.test.ts` (the copy scan beside the line scan it replaced), `tests/rtlGlyphs.test.ts`
(a Bidi_Mirrored glyph flipped by hand is pinned left-to-right first) and `tests/sourceText.test.ts` (no literal control
character in a source file).
