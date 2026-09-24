# Core — identity, the name, the layout on disk, the code rules

The product's identity, its name, where things live on disk, and the rules every line of code follows. Part of the module contracts (see [CONTRACTS.md](../CONTRACTS.md) for the map). **Edit the area, append nothing:** a change to how something works is written HERE, in the section it changes, and the old sentence goes; a release gets one line in [releases.md](releases.md), never an addendum.

## Code rules

`shared/types.ts` is the wire contract; import from it with
`import type { ... } from "../shared/types.ts"` (server) / `"../../shared/types.ts"` (client). All
imports use explicit `.ts`/`.tsx` extensions (tsconfig has `allowImportingTsExtensions` + `verbatimModuleSyntax`;
type-only imports must use `import type`). TS strict. **Node ≥ 24** (`engines` in package.json, and the README says the same number):
Node runs `.ts` directly there with no flag, so server code must use only erasable TS (no
enums/namespaces/parameter-properties). The floor is 24 rather than 22.6 because three things on
the boot path need more than type stripping: `node:sqlite` is imported unconditionally by
`server/comments.ts` (flagged before 22.13), every npm script passes `--env-file-if-exists` (22.9+),
and type stripping itself is only on by default from 22.18 — a clean clone on the number the docs
used to print died at `npm start` on an unknown flag.

## Identity & design language

Astrolabe, in the app: a candlelit manuscript room. It was designed in two rooms, dark "iron-gall"
(near-black warm ink background, warm off-white text) and light "parchment" (warm paper background),
with a gold-leaf accent `#c9a227` (dark) / `#7a5f14` (light — darkened from `#8a6d1a`, which sat at
4.13:1 and therefore failed AA as link text and as the lit mode pill; see the contrast gate). The
room a new instance OPENS in is `github-dark`, `THEMES[0]` in `shared/themes.ts` — see
[themes-tokens.md](themes-tokens.md), "Which theme a reader lands on". Serif display font for headings in rendered markdown
(Georgia/serif stack), system sans for UI, monospace (ui-monospace stack) for raw markdown/code. No
external font/CDN fetch ever reaches a VISITOR's browser: the defaults are system stacks, and the
opt-in webfont catalog is SELF-hosted — the server fetches once at save time, the instance serves
forever after (see "Typography" in [themes-tokens.md](themes-tokens.md)); the Arabic naskh faces sit at the END of the UI
and serif stacks, where they catch only the codepoints no Latin face covers. Density: calm, generous line-height (1.6 editor),
subtle 1px borders using `var(--border)`, minimal chrome. Everything themeable via the CSS custom
properties listed in the styles contract; components must use tokens, never hard-coded colors.

**The brand is a different room (2.18).** The icon, the README banner (`docs/brand/hero.html` →
`docs/gh-hero.png` via `scripts/shoot-brand.mjs`), the pages site (`docs/index.html`) and the manual
(`docs/site/docs.css`) are painted in the `sidereal` theme, starlight `#9aa3ff` on `#070a17`: the owner
and his readers found the gold heavy and asked for something darker and easier on the eye. The in-app
default stays `github-dark` (`THEMES[0]`); a reader picks a room in the picker, and the product does
not move under them. Screenshots in `docs/screenshots/` are shot in sidereal (`scratchpad/sky/shoot-docs-sidereal.mjs`,
`check-signatures.mjs` with `THEME=sidereal`) so the pages stay in one room.

## The name (Astrolabe was Vellum, from 2.21)

The product was renamed without breaking a single thing an install, a vault, a document or a
bookmark relied on. Nothing user-facing says the old name any more (3.1.0: the README, the docs
and the manual's home strap dropped their "was Vellum" notes); what follows is code-internal.
What the old name still answers to, and how:

| Was | Is | How the old one keeps working |
| --- | --- | --- |
| `VELLUM_*` environment keys | `ASTROLABE_*` | every key is read through `envRead()` in `shared/envName.ts`: new spelling wins, old answers, one stderr line at startup names any old key leaned on (`reportEnvFallbacks()`) |
| `vellum_session` cookie | `astrolabe_session` | `server/auth.ts` reads both (`sessionCookie()`), writes only the new, deletes both on logout; a request carrying only the old cookie is reissued under the new name at once and the old cookie expired (`refreshSessionIfStale()`) |
| `X-Vellum-Lang`, `X-Vellum-Preview` | `X-Astrolabe-Lang`, `X-Astrolabe-Preview` | both spellings read (`server/language.ts`, `previewRequested()`); `Vary` lists all four; the client sends the new |
| `vellum.*` localStorage keys | `astrolabe.*` | `client/storageMigration.ts` MOVES each old key to its twin once at boot (value carried when the twin is absent; the old key removed either way), so no `vellum.*` key survives a launch of 3.1.0 |
| `vellum://` deep links | `astrolabe://` | both schemes registered and parsed (`electron/deeplink.ts` `LEGACY_PROTOCOL`) |
| `~/.config/vellum` (`%APPDATA%\Vellum`) | `~/.config/astrolabe` | COPIED in on every launch while the old directory exists, never over a file the new one holds (3.3.6; `electron/main.ts`). Electron makes the new folder before main.ts runs and the 3.1.0–3.3.4 builds crashed at load, so "new directory exists → skip" (3.0.0–3.3.5) skipped every machine that had tried one and a friend lost his settings. The old directory is left for now; a later release removes it (TODO(3.5) in main.ts) |
| `vellum.sty`, `\vellum{…}` | `astrolabe.sty`, `\astrolabe{…}` | `/api/vellum.sty` still served as its own package; both files provide both macros; the parser reads both spellings (`shared/tex.ts`) |
| `ZahakJ/vellum` releases | `ZahakJ/astrolabe` | the updater asks the new repository first and the old when that fails (`electron/update.ts`) |
| `.vellum-trash.json` | `.astrolabe-trash.json` | renamed the first time the trash manifest is read (`carryTrashManifest()` in server/vault.ts), so an old trash still restores to where it came from and nothing under the old name stays in the vault |
| `VELLUM_DATA/*.json` | unchanged | file names and contents are not part of the rename |

The mark is an astrolabe (`shared/brandMark.ts`, one geometry for the wordmark, the sign-in modal,
the favicon, the landing page, the README banner, the manual's top bar and — ported to a
rasteriser in `desktop/icons/make-icon.mjs` — the app icon). The ✦ stays where it is an ornament:
the published star in the tree and status bar, the tracker's flourish at 100%, the blog's
back-to-top, the empty states. The tagline is "Your notes, charted." («ملاحظاتك، على الخريطة.»).

## Runtime layout

- Server: Hono on port **6801** (`PORT` env overrides). Vault directory resolved in this order:
  `--vault <dir>` CLI arg, `ASTROLABE_VAULT` env, `./vault`. Created + seeded from `vault-seed/`
  if missing.
- Dev: vite on **5801** proxies `/api` → 6801. Prod: server statically serves `dist/`.
- SPA fallback: non-`/api` GETs serve `dist/index.html` when dist exists.

## Where the code lives (the large modules, split in the 3.29 sweep)

A module that grew past a few thousand lines was cut along its own seams into files of
its own, and kept its name and every export, so no importer changed (`tests/splits.test.ts`
holds each family to that over the import graph: every name an importer asks for is still
exported, no part exports what its family does not take, nothing outside reaches a part).

| Module (kept) | Its parts |
| --- | --- |
| `server/indexer.ts` — the store, building, the event queue | `server/indexer/{language,resolve,folders,publish,posts,queries}.ts` |
| `server/api.ts` — middleware, the auth guard, notes and folders, discovery, the mounts | `server/{trash,tag,replace,file,comment,deck,settings,sync,version,event,rename}Routes.ts`, each a Hono router mounted where its routes stood; `server/requestBody.ts`, the readers they share |
| `client/components/Sidebar.tsx` — the component | `client/components/tree/{expansion.ts,icons.tsx,TreeRow.tsx,useTreeCursor.ts}`, `client/components/TagShelf.tsx` |
| `client/components/GraphView.tsx` — the React half | `client/graph/sim.ts`, the engine |
| `client/components/CommandPalette.tsx` — the component | `client/components/palette/commands.ts`: `COMMANDS` and the two runners, the one list both shells run |
| `client/books/BookReader.tsx` — the reader | `client/books/ReaderPanels.tsx`, `client/books/pdfHighlight.ts` |
| `client/state.ts` — `useStore`, the phone-shell rule, our own writes | `client/state/{types,dom,persistence,helpers,themeMirror,sliceTypes}.ts` and five slices spread in order (`fieldsSlice`, `sessionSlice`, `workspaceSlice`, `prefsSlice`, `notesSlice`) |
| `client/styles/app.css` | `reset.css`, `tree.css`, `editor.css`, `publish.css` linked before it and `grips.css` after (client/index.html; the order is the cascade) |
| `client/i18n.ts` — `t()`, the loader | `client/i18n/en.ts`, `client/i18n/ar.ts` (see [i18n.md](i18n.md)) |

## Conventions

- No default exports except React components. No `any` unless unavoidable. Small files > clever files.
- Errors surface to the user via `console.error` + a transient `.s-toast` div helper in
  `client/toast.ts` (`export function toast(msg: string)`) — shell agent owns it. The MESSAGE is
  `t()`/`tf()`, keyed off `ApiError.code` where the server names one; see the API section.

### Toasts are a STACK, and an offer outlives a statement (v1.8 moments, F23)

`toast()` used to begin with `dismissToasts()`, which removed **every** toast on screen — action
toasts included. So the one message in the product a reader has to ACT on was killed by whatever
ambient confirmation happened to land inside its nine seconds, and the delete path proved it end to
end: "Moved to the trash — Undo" was erased by the next save toast and the way back went with it.

- `.s-toasts` (app.css) is the fixed, centred COLUMN both kinds live in, and it carries the measure:
  a fixed box with `left: 50%` and no width takes its available space as half the viewport, so a
  toast that sized itself could never be wider than 195px on a 390px phone.
- A **plain** toast states a fact and may replace another plain toast — two facts stacked
  unreadably is the reason the old blanket dismissal existed, and that reason still holds.
- An **action** toast (`client/undoToast.ts`, `.s-toast--action`) is an offer with a deadline. Only
  three things close it: its 9s timeout, its own button, and its own ✕ (`.s-toast__dismiss`, 44px on
  a coarse pointer, like the action). A SECOND offer replaces the first — two standing "Undo"
  buttons is a question about which one takes back what.
- Plain toasts are inserted ABOVE a standing action toast, so its button never moves under a thumb
  already reaching for it.
- `dismissToasts()` now means "clear the transient ones". `App.tsx` calls it when `openPath`
  changes, and **deleting the open note is exactly the gesture that changes `openPath`** — an undo
  that dismisses itself in the frame it appears is not an undo.

### The net under the client (v1.8 client-solidity, B2)

Four failures shared one shape: the client noticed something had gone wrong and then said nothing,
for ever. All four are answered, and all four answers are in the ENTRY chunk on purpose — a net that
arrives in its own request has a hole in it for exactly the window in which most first-paint
failures happen, and a crash card that must fetch a chunk after the crash is not a crash card.

- **A render that throws is a card, not a white page.** `client/ErrorBoundary.tsx` wraps `<App/>` in
  `main.tsx`. It FLUSHES FIRST — `flushAllBuffers()`, the `sendBeacon` path, which needs neither
  React nor the render that just died — then draws `.s-crash`: the wordmark's ✦, what happened, and
  Reload. Before this, any one of a hundred components could end a writing session by leaving
  `<div id="root">` empty, with the unsaved buffers unflushed and no reason for the reader to think
  closing the tab was safe.
- **A rejected promise reaches somebody.** `client/safety.ts` installs `unhandledrejection` and
  `error` handlers before the first mount. Both log AND toast, except for the rejections that are
  not faults — a request the client itself cancelled (`AbortError`), and a 401/404, which is the
  server ANSWERING. `errorSentence()` keys the wording off `ApiError.code`, so a deadline and an
  expired session are sentences in the reader's language rather than the server's English prose.
- **`fetch` has no deadline, so `request()` gives it one.** `REQUEST_TIMEOUT_MS` 30s,
  `UPLOAD_TIMEOUT_MS` 300s for the two uploads and both sync calls. `requestSignal()` COMPOSES the
  deadline with the caller's own signal rather than replacing it — search and the visibility probe
  abort per keystroke, and clobbering `init.signal` would have made those a request per character
  that nothing could cancel. A deadline that fires becomes `ApiError(code: "timeout")`; the caller's
  own abort stays exactly what it was.
- **A 2xx that is not JSON throws.** An auth proxy in front of Astrolabe answers the expired XHR with
  its own 200 HTML login page; `return body as T` handed every caller a `null` typed as a tree, a
  note or a settings object, which the reader saw as an empty vault or as a crash three frames
  later. It is `ApiError(code: "notJson")` now — the one place in the client that can tell.
- **A lazy chunk that cannot be fetched is a card, not a blank app.** Every surface arrives through
  `lazySurface()` (`client/lazySurface.tsx`), which is `lazy()` with the import failure caught: one
  retry, then it RESOLVES into `.s-chunkgone` rather than rejecting — React caches a rejected lazy
  promise for the life of the session, so a surface that failed once would keep failing after the
  network came back. Redeploying the server under an open session rotates every content hash, so
  this is not a hypothetical: it is what `git pull && npm start` does to a reader mid-sentence.
- **The root URL is a PLACE.** `applyUrl()` on a popstate to `/` closes the tabs through
  `closeAllTabs()` — which saves anything dirty on the way out and re-mirrors `openPath` — so Back
  past the first note shows the empty state. Touching only the view mode (the pre-v1.8 answer)
  traded a desync for a lie: the address bar said `/` and the note was still on screen, so Back did
  nothing a reader could see. The `initial` call still returns false for `/`, which is what keeps a
  restored session and the home note.
- **A FIRST RUN OPENS THE GUIDE, not the empty state** (v1.8 UX audit, F1). `enterVault()` restores
  the stored workspace, and when there is none it opens `settings.homeNote` — and, failing that,
  the seed's guide (`SEED_GUIDE`, declared in `shared/seed.ts` so the boot seeder in `server/seed.ts`
  and this open cannot name different files) and then the vault's first note. A fresh install landed
  on "The vault is open." with `Welcome.md` sitting in the tree behind it: the one moment a new
  reader has nothing of their own to come back to was the one moment they were shown nothing.
  ADMIN ONLY past the home note, deliberately — a visitor's landing is the site, and opening
  somebody's first published file at them because the owner set no home note is a guess made in
  public. A deep link in the address bar still outranks all of it (the router applies it right after
  bootstrap), and an EMPTY vault still gets the empty state, which is where the seed offer lives.
- **A SCROLL BOUNDARY FADES; IT DOES NOT GUILLOTINE.** `client/scrollFade.ts`
  (`attachScrollFade(el)`) maintains `data-more-above`/`data-more-below`, and `.s-scrollfade`
  (app.css) masks an 18px alpha ramp at whichever end actually has content beyond it — so a list
  short enough to fit keeps full contrast at both ends, and with neither attribute set the mask is
  a fully opaque gradient. It replaced two absolutely-positioned gradient `<span>`s over the
  settings body: a gradient laid OVER content only hides what it exactly matches, and it did not —
  a segmented pill still came through the top edge cut across its middle with its accent border
  flat-cut, which reads as a rendering fault rather than as "there is more above", and the same
  slice happened at the foot against the footer rule. A mask removes the alpha, so the row
  genuinely dissolves and nothing has to be colour-matched. The popover list wears it too (rows
  were sliced mid-glyph under the sticky filter field). It is OFF at the top of a body that holds
  a sticky block (`.s-smodal__body:has(.s-smodal__specwrap)`): the specimen owns that edge, paints
  the panel's own ground and carries its own gradient tail, and fading it would fade the live
  preview the whole tab is built around. A STICKY BLOCK'S GROUND MUST COVER EVERY PIXEL IT
  OCCUPIES — `.s-smodal__specwrap` spent 6px of its gap on `margin-bottom`, which is outside the
  painted box, so the tops of the rows scrolling underneath showed through as a band of
  disconnected glyph and diacritic fragments (conspicuous in Arabic, where the tashkeel ride high
  enough to be exactly what survives a 6px window). It is padding now.

- **NOTHING INSIDE `.cm-content` MAY CARRY A VERTICAL MARGIN.** CodeMirror sizes every `.cm-line`
  and every block widget by its BORDER box (`getBoundingClientRect`), which counts padding and
  borders and does not count margins. A margin there is height the editor's height map denies
  exists, and `posAtCoords` — which resolves the pointer for CodeMirror's own mouse selection —
  then answers with a line that is not the one under the finger. This is the single cause behind
  four separate reports in this editor: click position, dead hover previews, mod-click opening the
  wrong note, and "double-clicking a paragraph selects the whole block". Measured: `margin: 0 0
  20px` on `.cm-s-props` put every line below the frontmatter card 20px out of step and six of
  nine double-clicks selected nothing at all. Put the air on a wrapper's PADDING (`.cm-s-fmblock`
  wraps the properties card and the banner hero; `.cm-s-htmlblock` pads itself) or in a
  TRANSPARENT BORDER with `background-clip: padding-box` when the element is painted and the air
  must stay outside the paint (`.cm-s-callout--first/--last`, whose radii are grown by the border
  width so the tint keeps its exact curve). Async height counts too: an embed or banner image that
  arrives after the measure must `view.requestMeasure()`. Spacing must also not acquire behavior
  on its way to becoming measurable — the 20px under the properties card belongs to no line, so
  `handleMousedown` sends a click landing in it to the line below the card, as the margin did.
- **SELECTION IS RESOLVED FROM THE DOM, AND A CLICK SEQUENCE HAS ONE ANCHOR.** `client/editor/selection.ts`
  supplies `EditorView.mouseSelectionStyle`: the pointer maps through `posFromEvent`
  (`caretPositionFromPoint` → `posAtDOM`), never the height map, and clicks 2 and 3 of a
  double/triple-click REUSE the position click 1 resolved. The second is not a nicety: live
  preview reflows between the clicks — the cursor's line reveals its markdown, and inside a fence
  its ``` markers come back — so re-resolving the second mousedown against the moved document
  selected a word two lines away. Double-click takes the rendered UNIT where there is one (a
  wikilink, `#tag`, `$math$` or inline-code chip is one object on screen and one object to
  select), identifier boundaries inside a fence, and otherwise a grapheme-cluster word, which is
  what keeps Arabic harakat and Persian ZWNJ inside the word. Triple-click takes the paragraph,
  drag extends by character, shift-click extends from the existing anchor. Navigating branches of
  `handleMousedown` (wikilink, footnote, external link, `#tag` search) fire on the FIRST click of
  a gesture only, so clicks 2 and 3 reach selection instead of searching twice or opening two
  tabs; the INERT branches (properties header, banner hero) are ungated, because they must swallow
  every click or the second one drops the cursor into raw YAML. `scripts/check-caret.mjs` gates
  all of it, in both shells.

- **A KEYBOARD BINDING EXISTS IN EXACTLY ONE PLACE, AND THAT PLACE IS `GROUPS`.** The table in
  `client/components/ShortcutsHelp.tsx` — the one `Ctrl/Cmd /` prints, in both languages — is the
  ledger; `docs/keymap.md` is a RENDERING of it, and `npm run check-keymap` fails the build when
  they stop agreeing in either direction — and (3.26.1) when a row with `keys` has no
  `// keymap: <label>` mark on the code that answers it, because `Ctrl/Cmd Alt L` was on the
  sheet, the palette and the manual with no branch in the key listener at all (now `client/globalKeys.ts`). A colliding binding is the quietest bug this product can
  have: one handler answers the key, the other never sees the event, and neither of them knows the
  other exists, so it surfaces weeks later as "Ctrl+B does nothing", on one platform, from one
  reader, with nothing to grep for — because nothing is wrong with either binding. What is wrong is
  that there are two. Two handlers carry bindings today (the capture-phase listener in
  `client/App.tsx` and CodeMirror's keymap stack) and the desktop runtime makes three, which is why
  the `Binding` type carries `desktop?: boolean` beside `admin` and `shell`: the ledger has to be
  able to spell "desktop only" BEFORE the desktop exists, or the first collision between the two
  runtimes is discovered after it ships. The gate parses `GROUPS` out of the source TEXT and never
  imports it (the rows carry React and store closures; a gate that needs a browser is a gate nobody
  runs), the same way `check-i18n.mjs` reads the dictionary files. A row resolves to a **chord** —
  modifiers in one canonical order (`Ctrl/Cmd`, `Alt`, `Shift`), one key token, `↑ / ↓` for a pair —
  and a **scope**, which is the shell (`app` / `blog`) and the runtime (browser / desktop) and
  deliberately NOT `admin`: an admin session sees the visitor's rows plus its own, so `admin` never
  keeps two bindings apart, it only names the reader a collision reaches first. Same chord,
  overlapping scope, two rows: the build fails. The one escape hatch is `RESOLVED` in
  `client/keymap.ts`, and it costs a paragraph naming where the tie is broken and by what rule —
  there is exactly one entry, `Ctrl/Cmd Shift Z`, which is zen AND CodeMirror's only macOS redo
  binding, broken by caret in `App.tsx` (`if (e.metaKey && inEditor(e.target)) return`). A declared
  overlap that stops overlapping fails the build too, for the reason a dead dictionary key does: an
  argued-out paragraph about two rows that no longer meet is a claim the next reader believes. The
  page and the sheet may still both be wrong about the world — the gate compares them to each other
  and cannot see past either into CodeMirror's own `foldKeymap`, which is why the macOS fold
  spelling is a paragraph in `docs/keymap.md` rather than a table row.
