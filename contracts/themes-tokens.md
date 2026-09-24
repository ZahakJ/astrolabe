# Themes and tokens

Tokens, the theme rooms, which room a reader lands in, typography and uploaded fonts. Part of the module contracts (see [CONTRACTS.md](../CONTRACTS.md) for the map). **Edit the area, append nothing:** a change to how something works is written HERE, in the section it changes, and the old sentence goes; a release gets one line in [releases.md](releases.md), never an addendum.

## CSS tokens (tokens.css defines the FULL set on `:root` and on every `[data-theme="…"]`)

`--bg`, `--bg-raised`, `--bg-hover`, `--text`, `--text-muted`, `--text-faint`, `--heading`
(every heading: the editor's heading lines, the reading view's h1 to h5, the blog's article title,
the library's page titles; each built-in freezes its old fifteen-percent accent mix to a hex so the
custom theme builder can show and override it; held to 4.5:1 on all three grounds), `--accent`,
`--accent-soft` (translucent accent for backgrounds), `--border`, `--danger`, `--font-ui`,
`--font-serif`, `--font-mono`, `--radius` (6px), `--sidebar-w` (292px), `--font-scale`/`--prose-scale` (per-language type-scale
multipliers, 1 by default; `:root[lang="ar"]` raises them because naskh reads smaller than
Georgia at the same px — consumers must multiply, never replace, so a `custom.css` override of
the sizes survives), `--font-base` (15.5px —
drives `html { font-size }`; ALL chrome is sized in rem so this one token scales the whole UI),
`--font-prose` (1.161rem ≈ 18px — editor/reading prose), `--selection-bg` + `--focus-ring`
(the selection wash and the `:focus-visible` ring — per theme, because an accent tuned for type
is not always visible as a ring), `--graph-node`/`--graph-edge`/`--graph-vignette` (the graph
canvas). Default (no attr) = `THEMES[0]` = github-dark: `:root` carries that room's values hex for
hex and check-contrast holds the two equal, so the first paint is the default room and an unknown
id is too. `data-theme` attr lives on `<html>`. app.css: layout grid, sidebar, tabs, panels,
palette, scrollbars (thin, themed — the standard `scrollbar-width`/`scrollbar-color` pair is served
ONLY under `@supports not selector(::-webkit-scrollbar)`, i.e. to Firefox, because Chromium 121+
ignores every `::-webkit-scrollbar` rule on an element where either standard property is set and
draws a classic ~10px rail instead; no other sheet may declare `scrollbar-width: thin` on a
scroller, and a scroller that hides its bar says `scrollbar-width: none` AND
`::-webkit-scrollbar { display: none }`), `::selection` gold. Class names are BEM-ish plain CSS,
prefix `s-` (e.g. `.s-sidebar`, `.s-tab`, `.s-palette`). Components must use these exact class
names where they exist in app.css; anything extra styled inline is a bug — put it in app.css.

**The surface layer** (tokens.css, `:root, [data-theme] { … }`, 2.20): one token per painted thing —
`--sidebar-*`, `--tabs-*`/`--tab-*`, `--panel-*`, `--statusbar-*`, `--editor-*`, `--codeblock-*`/`--inline-code-*`,
`--reading-*`, `--quote-*`, `--highlight-bg`, `--hr`, `--table-*`, `--props-bg`, `--footnote-marker`,
`--list-bullet`, `--link`, `--wikilink(-broken)`, `--tag-*`, `--button-*`, `--input-*`, `--menu-*`, `--modal-*`,
`--backdrop`, `--toast-*`, `--scrollbar-thumb(-hover)`, `--graph-bg`, `--blog-*`, `--card-*`, `--progress-*` —
each a `var(--base)` derivation (a few color-mix), declared on `:root, [data-theme]` and never inside a
theme block, so every built-in keeps its look and a base override still reaches every surface an author
has not painted. Consumers read the SURFACE token (app.css, reading.css, preview.css, blog.css,
media.css, tracker.css, editor/theme.ts), never the base one for those surfaces. The list is
`THEME_TOKENS` with `derivedFrom` in shared/customTheme.ts; every token carries an i18n `label`;
`tests/themeTokens.test.ts` holds the three (spec, layer, dictionary) to each other. `SURFACE_PAIRS`
(shared/contrast.ts) measures text-on-ground surfaces at the base floors; check-contrast resolves the
derivations per theme first. The page inks stay out (tokens.css says why). The builder lists tokens by
human name with the raw name in mono, filters across groups, and resets a group or all.

Two stylesheets are linked AFTER app.css (`client/index.html`), and the order is load-bearing:
`styles/themes.css` (the theme library — the per-theme retunes of `::selection`, `:focus-visible`
and the graph vignette, the `--sw-*` swatch machinery, the picker panel) and `styles/settings.css`
(the settings surface over app.css's base panel rules).

## The theme library (46 rooms: 22 hand-made, 24 generated presets)

- **`shared/themes.ts` is the one list.** `THEMES` (46 ids, `THEMES[0]` = `github-dark` = the
  product default since the preset rooms landed in 3.16 — the commit that made it so moved
  `:root` to its values and this paragraph said `iron-gall` for two releases; `iron-gall` is the
  BRAND room, the icon and the manuscript metaphor, and opens the hand-made half of the dark
  list), `DARK_THEMES`/`LIGHT_THEMES`, `isTheme()`, `themeGroup()`. Both sides
  validate against it: the client's picker/palette/store and the server's `settings.defaultTheme`
  validator plus `DEFAULT_THEME` at startup (`server/site.ts` warns on an unknown name instead of
  passing it through). `client/themes.ts` re-exports it and adds `THEME_GROUPS` (the picker's
  grouping) and `counterpartTheme()` (the ☾/☀ pairing — with twenty-one themes a light/dark button
  cannot mean "next in the list"). `client/state.ts` re-exports `THEMES`/`Theme`/`isTheme` so the
  store's published surface is unchanged.
- **Every theme defines the WHOLE token set**, solved against its own `--bg` (all callout and
  syntax colors clear 4.8:1 there). A theme that omits one inherits the previous block's value —
  iron-gall's amber warning on a green ground — which is why `scripts/check-contrast.mjs` walks
  every block in `tokens.css` and why no two themes share a hex outside the `--danger` family.
- **The gate also asserts an accent-vs-TEXT delta, and it is not a contrast ratio.** Two colors of
  equal luminance and opposite hue pass every contrast formula while being perfectly
  distinguishable, so the question "does this theme HAVE an accent channel" needs a perceptual
  distance: `check-contrast.mjs` requires **ΔE (CIE76) ≥ 18** between `--accent` and `--text`.
  `sumi` shipped `--text #e4e4e6` beside `--accent #f5efe3` — 8.5 ΔE, 1.11:1 — so tag pills, the
  `#` glyph, the active-row bar, wikilinks, the publish star and the graph nodes all rendered as
  body text, and the lit READING pill (an `--accent` fill carrying `--bg` letters) read as a text
  selection rather than an alarm. The whole mode-pill argument below rests on that pair being
  loud. It now carries an indigo; the next-closest theme sits at 23.9 ΔE, which is where the 18
  floor comes from.
- **"No two themes share a hex" is satisfiable and visually meaningless; the real test is whether
  two swatches are separable at a glance.** Three pairs failed it and were retuned: `void`
  (#101014 / pale steel) was basalt with less character — it is a true black under a cold signal
  cyan now; `tallow` was iron-gall with the lamp turned up (2.4 ΔE of ground) — its ground climbs
  to real brown paper and its amber warms into candle flame, which cost six mid-tone callouts
  ~0.35:1 and so they were re-solved rather than left to slide under the 4.8:1 bar; `solar` was
  `sandstone` with the hexes nudged (4.1 ΔE ground, 11.7 ΔE accent) — two of only FOUR light
  themes in one room — and now opens on the brightest paper in the set under a yellower burnt
  gold.
- **`--text-faint` against `--bg` and `--bg-raised` is a PASS in that gate too, at the 3:1
  non-text bar.** It printed "(info)" against a minimum of ZERO — a number the gate could never
  enforce, which reads like coverage and is worse than printing nothing: parchment shipped at
  2.50:1, and text kept being moved onto the one token nothing could fail (attachment filenames
  at 14.4px, the sidebar footer counts, the tag counts). The floor is what makes the token's
  remit real: **`--text-faint` is for UI glyphs and for deliberately de-emphasized machine
  bookkeeping — never for a name, a count or a label the reader must read**, which is
  `--text-muted` (4.5:1 or better everywhere) or `--text`. Parchment's faint was retuned
  `#a2947c` → `#8d7f66` (3.30:1 / 3.60:1). And **opacity is invisible to the gate**: a 0.85 fade
  over a token already at its floor is a way of failing the floor without failing the check, so
  glyph fades were replaced by token steps.
- **`--accent` against `--bg` is a PASS in that gate, not an "(info)" line.** That pair is read as
  type twice over: wikilinks and tag pills are `--accent` on `--bg` inside the prose, and the lit
  mode pill is an `--accent` fill carrying `--bg` letters — the same two colors, swapped. While it
  printed as information only, parchment (4.13:1), sandstone (4.17:1) and solar (4.24:1) all
  shipped below AA, which is how the loudest control in the product came to be the least legible
  one on the warm light themes. Their accents were darkened to 5.09 / 5.32 / 5.40; `--accent-soft`,
  `--selection-bg` and `--swatch-<id>-accent` moved with them, since those are the same color
  under other names.
- **`--swatch-<id>-bg/-text/-accent` are CONSTANT across themes.** A preview of a theme painted
  in the theme currently on screen is not a preview. `styles/themes.css` maps each id to
  `--sw-bg/--sw-text/--sw-accent` on `[data-theme-swatch]` (picker) and `[data-theme-dot]`
  (palette), so both surfaces are generic — a new theme needs one rule, not two.
- **`client/components/ThemePicker.tsx` owns browsing, and all three doors are wired.** The
  status-bar ☾/☀ button, the palette's *Themes* command and Settings → Appearance's
  *Themes* button all call `openThemePicker()`. **There is exactly ONE theme row in the
  palette.** It used to carry sixteen: that row plus a `Theme: <id>` command per theme, 15 of
  the table's 41 entries spent on one preference and every one of them a blind jump into a room
  the reader had not seen — the same objection that took `nextTheme()` off the status-bar
  button, printed fifteen times. The row keeps the swatch (`.s-palette-dot`, `themeDot` is a
  THUNK so it previews the theme in force rather than a value frozen at import), and the picker
  behind it is the surface that shows the values. A parameter with N values belongs behind the
  surface that shows the values; `THEMES` is no longer imported by the palette at all. The status-bar button is the one that
  mattered: it used to call `nextTheme()`, stepping blindly through fifteen looks with no way to
  see what was available or to get back — the same invisible state as a silent reading mode, and
  it contradicted this file, the picker's own header comment and the README, all three of which
  already said the button opens the panel. **A row is a miniature of the ROOM plus a human name**:
  three 10px dots previewed the tokens, and at that size sumi, void and basalt were the same
  swatch three times over (dark dot, white dot, pale dot), so each row now draws the theme's
  ground carrying a heading rule, a line of type and an accent chip — still from the CONSTANT
  `--swatch-*` values — beside a localized label and a one-line description (`THEME_LABELS` in
  `client/themes.ts`). Fifteen rooms identified by fifteen obscure Latin pigment nouns was not a
  naming scheme in English and was untranslated in Arabic; the raw id is still the value
  `DEFAULT_THEME`, `settings.defaultTheme` and the palette take, and it lives in the row's
  `title`. `nextTheme()` is GONE from `state.ts`: it was blessed here as a keyboard-only
  "next look" helper, but no keybinding called it either — `grep -rn nextTheme client/` found the
  definition and nothing else, so it was unreachable code wearing an affordance's name. Cycling
  twenty-one rooms blind is the gesture this section removed; there is no version of it to keep
  warm. The glyph reads `themeGroup(theme)`, not
  `theme === "parchment"` — the light group has never been one room, and the moon was drawn on
  every light theme but parchment.
  The overlay carries **no scrim and no blur** (`styles/themes.css`): every other overlay dims the
  app because the app is not what the reader is looking at, and this one exists so they can look
  at it — stacked under the settings panel's own `.s-palette-overlay` the two washes made the live
  preview a guess, so the settings overlay also steps back to 10% opacity while the picker is up
  (`body:has(.s-tpick-host)`), without unmounting: Esc must return to the panel as it was.
  **The arrow keys walk the GEOMETRY, not the flat list.** `rowStep()` (ThemePicker.tsx) resolves
  an index to (group, row, column) and moves a visual row at a time, entering the next group's
  first row in the same column and clamping to what that row actually holds; ←/→ still step by
  one across the whole list. Stepping ↑/↓ by ±COLS was wrong the moment a group held an ODD
  number of themes: with the eleven dark rooms of the time the column parity flipped at the
  boundary, so ArrowDown
  from Tallow (dark, LEFT column) landed on Sandstone (light, RIGHT column) and **Parchment, the
  flagship light theme, was unreachable by ArrowDown at all**. Enter-keeps and Esc-restores are
  unchanged.
  `openThemePicker()` mounts it on `<body>` (like `toast.ts`) so the status bar, the settings
  panel and the palette can all open the same panel from two component trees; `isThemePickerOpen()` exists because a capture-phase
  Esc listener registered EARLIER (the settings panel's) would otherwise close the panel
  underneath it. Arrow keys move the highlight and APPLY it live (`data-theme` only — not the
  store, not localStorage), Enter commits through `setTheme`, Esc and unmount both restore the
  theme in force when it opened. **Hover never moves the keyboard highlight** — that is the
  palette's Enter-follows-the-mouse bug, and it must not be reproduced here.

## Which theme a reader lands on (precedence)

**THE PUBLIC SITE FOLLOWS THE BLOGGER'S EDITOR THEME BY DEFAULT.** One author writing in cinnabar
all day used to publish a blog wearing iron-gall, because `settings.defaultTheme` was a separate
field nobody set. It is now a THREE-state preference, and the third state is the default:

| `settings.defaultTheme` / `DEFAULT_THEME` | meaning |
| --- | --- |
| `"follow"` (or unset) | visitors get the theme the ADMIN is editing in — `settings.adminTheme` |
| a theme id | pinned: visitors get that theme whatever the admin is looking at |

**Precedence, highest first** — every tier only ever sets what a reader lands on with NO stored
choice of their own:

1. **an active design's own theme** (a design that carries one; nothing else may override it);
2. **the pinned `settings.defaultTheme` / `DEFAULT_THEME`**;
3. **follow-the-admin** — `settings.adminTheme`, mirrored from the admin's browser;
4. **the built-in default** (`THEMES[0]`, github-dark).

And above all four: **a visitor who has explicitly chosen a theme keeps it.** `client/state.ts`
applies `me.defaultTheme` only when `localStorage["astrolabe.theme"]` is empty, and never persists
it — so a changed site default keeps reaching undecided readers, and a decided one is never
overruled.

- **Resolution lives on the server** (`server/site.ts`): `themePref()` settles the preference
  (unset → `follow`), `adminTheme()` is the mirror, and `visitorTheme()` is the answer that rides
  `/api/me` as `defaultTheme`. Tier 1 is layered over it in `/api/me` itself (`server/auth.ts`),
  for the sessions that are shown the design — visitors and a previewing owner — so the design's
  theme reaches the store by the same field and under the same stored-choice rule. No client
  re-implements the rule. **It used to**: `DesignedSite` painted `design.theme` onto `<html>`
  itself, past the store, and the two disagreed for the life of the page — the next `loadMe()`
  (a visitor's EN/ع switch under `"follow"`) re-applied the store's theme over the design's, and
  the ☾/☀ button read the store and flipped from the wrong room.
- **The editor's theme and a reader's choice are two keys.** `setTheme` stored the admin's editor
  pick in `astrolabe.theme`, the same key a visitor's public-site choice uses, and that key survives
  signing out — so in any browser the owner had ever signed in from, their editor theme outranked
  every design they made, for them and only for them ("none of my themes really show on Mission
  Control, it's just the default dark theme"). A reader's choice made on the public site now lives
  in `astrolabe.site-theme`; which key a session reads is decided by the surface it is on
  (`themeKey()` in `client/state.ts`: the site's for a visitor shell — the served page says so via
  `client/boot.ts`, which only a session shown the public site is told — and for the owner
  previewing as one; the editor's otherwise). `loadMe` runs into and out of preview, so one block
  serves both: entering, the site key is empty and the design's theme applies; leaving, the editor
  key holds the owner's own room and it comes back. A ☾/☀ press on the public site or in preview
  writes the site key and never the editor's. One migration cost, accepted: a visitor who chose a
  theme on the public site before this build chose it into `astrolabe.theme`, and lands on the site's
  default once until they choose again.
- **The ☾/☀ button on a designed site always lands in the design's pair.** `COUNTERPART` is not
  involutive (several dark rooms share one lit partner), so a toggle that only asked for the
  counterpart of the current room left the design in two presses (phosphor → porcelain →
  verdigris). `toggleChoice(current, design.theme)` (`client/themes.ts`) goes to the design's
  counterpart from anything dark and to the design's theme from anything lit — so from ANY room,
  including one a broken earlier walk stored, two presses reach the design exactly. (The first cut
  kept a reader's stored room out of the pair and stranded them on it: "it's no longer green, just
  shows black".) A stored choice still wins on load; the button's promise is "this site, lit
  differently". `tests/themeToggle.test.ts` states it for all twenty-one rooms, from all twenty-one.
- **The first paint is the right paint.** A visitor's page booted as an app — `publicLayout` at
  "app", the theme at the client's fallback — and became a designed site only after `/api/me`, then
  got its document a fetch later. Measured on the owner's site: the stock masthead and menu at
  ~204ms, replaced by the designed console at ~259ms, on every refresh. `server/boot.ts` inlines
  `window.__astrolabe` into the served shell for sessions shown the public site — the served layout,
  the theme (design's, else the instance's, same precedence as `/api/me`), and on a designed site
  the document scrubbed by the same `visitorSafe` the API uses — and paints `data-theme` on `<html>`.
  `client/boot.ts` reads it once; the store boots into that layout and `readTheme()` falls to that
  theme instead of iron-gall; `DesignedSite` renders its first frame with the design in hand and
  skips the redundant first fetch. A hint, re-verified: the shared validator still runs on it and
  `/api/me` still rules. And **loading is not failure**: `DesignedSite` rendered `<BlogShell/>` while
  its document was merely in flight, which was the visible half of the flash; until the first
  answer it is now the page-shaped blank App's own Surface shows.
- **MIGRATION IS A SEMANTIC, NOT A REWRITE.** An instance that already named a theme keeps it and
  its public site does not change appearance on upgrade; an instance that named none moves to
  following. Nothing is written to `settings.json` to make that true, so a downgrade is equally
  uneventful. `FOLLOW_THEME` is a STORABLE value (not merely an absent key) because an instance
  whose `.env` pins `DEFAULT_THEME` needs a way to override that pin — clearing the key would only
  fall back to it.
- **`settings.adminTheme` is stored apart from the pin** so switching modes loses neither: pin
  `solar`, keep editing in `void`, unpin, and visitors get `void` again — not the built-in default.
- **The mirror is `POST /api/theme`** (`{ theme }` → `PublicThemeInfo`), admin-gated like any
  mutation, one key, no-op when unchanged. It exists because the admin's theme has only ever lived
  in `localStorage["astrolabe.theme"]`, which no server can read. It is NOT `PATCH /api/settings`:
  that answers with published counts, every image attachment and the font catalog, and this fires
  on a theme click. **The client DEBOUNCES it** (`MIRROR_DELAY = 1000ms` in `client/state.ts`) and
  always sends the CURRENT theme, so walking the picker costs one request naming the
  last room, not one per room; a `pagehide` inside the window flushes it with `sendBeacon`. A visitor
  session, and an admin PREVIEWING as a visitor, never mirror (the client stands down; the guard
  401s anyway).
- **IT IS VISIBLE, NOT MAGIC.** An admin must never discover that their private browsing changed
  the public site. Both surfaces that choose a theme say what visitors get and why, in the theme's
  own name — the picker's footer strip (`.s-tpick__foot`, admin sessions only: `me.publicTheme` is
  not sent to visitors) and the Appearance row's second line (`.s-smodal__visitors`) — each with
  the one control that changes the rule ("Pin this instead" / "Follow my theme"). The picker's
  buttons act immediately (`setPublicTheme`); the panel's sets the row's own select, because the
  panel saves as a whole.
- **A CUSTOM theme is a theme here too.** `custom:<name>` is pinnable (`settings.defaultTheme`,
  `DEFAULT_THEME`) and mirrorable (`setAdminTheme` takes the same ids the picker offers), so an
  owner editing in a theme they built publishes a site wearing it — the "selectable everywhere a
  built-in is" promise reaching the follow rule. Shape is validated on the mirror path and
  EXISTENCE on `/api/me`: a `defaultTheme` naming a deleted custom theme is dropped from the
  payload, and the admin's "Visitors see …" line drops the name with it rather than reciting a
  theme this instance no longer has.

## The preset rooms (scripts/gen-themes.mjs)

- Twenty-four themes are GENERATED, not hand-written: `scripts/gen-themes.mjs` holds one compact
  spec per palette (grounds, four text tones, accent, danger, radius, the palette's eight colours)
  and writes the `[data-theme]` blocks and swatch trios into `client/styles/tokens.css` between
  the two marker comments. Edit the spec and rerun; never the generated CSS. Every tone is
  measured against the contrast gate's floors before it is written (`clear()`), so the generator
  and `check-contrast` agree by construction; an accent within 18 ΔE of the text is reported and
  fixed in the spec by hand.
- `DARK_THEMES[0]` is the product default and is `github-dark` (sky blue on neutral greys). The
  old rooms keep their ids; only their labels changed (Arabic names now say what the room looks
  like rather than naming a pigment).
- `check-contrast` takes the light list from `shared/themes.ts` — a copy once matched
  `solarized-dark` by the prefix `solar`. `client/styles/textcolor.css` must list every light
  room in its selector; the semantic inks (`--vc-*`) and the literal inks (`shared/textColors.ts`)
  are solved against EVERY room's grounds, so a new room with a lighter dark ground (Nord) or a
  warmer light one (gruvbox-light) may move them — rerun the solve, never loosen the gate.
- A mid-grey ground cannot hold the literal inks at 3:1 on both sides; that is why there is no
  Zenburn.

## Theme integrity: the first paint, the ring, the scrollbar, the grips

**Iron-gall has its block back.** The commit that made github-dark the default (3.16) moved
`:root` to github-dark's values and gave iron-gall — the brand room, the icon, the desktop
window's pre-paint — no `[data-theme="iron-gall"]` block at all, so choosing it computed
github-dark's blue while the picker marked a gold card CURRENT. The block is the pre-3.16 `:root`
verbatim plus the three tokens the base has since gained. The desktop pre-paint colour is now the
DEFAULT room's ground (`DEFAULT_GROUND` in electron/windows.ts, `#0d1117`), not iron-gall's.

**check-contrast holds the catalogue, not just the blocks it finds** (`scripts/check-contrast.mjs`):
every id in `shared/themes.ts` has a block and every block has an id; `:root` equals `THEMES[0]`
hex for hex; every block declares every token `:root`'s theme section declares (the base set minus
the globals — fonts, page inks, pane widths, type scale — which is 40 tokens: `--radius` and
`--banner-tint` joined the hand rooms, the generator's unread `--syn-tag` left the presets) and
nothing the base does not. A room missing a token does not inherit "the previous block's" value;
the cascade falls back to `:root`, which is the default room's. Two new ratios, both WCAG 1.4.11's
3:1 for a component boundary: `--focus-ring` against all three grounds (it is the keyboard's only
cue, and nothing measured it), and `--accent` against `--bg-raised` (it is a 2px line there — the
active-row bar, the tab rule, the grip). `--focus-ring` is a required token. a11y.css's class-level
rings read `var(--focus-ring, var(--accent))` so a theme's ring choice reaches the tree, the tabs and
the palette rows and not only the base `:focus-visible` rule. Every built-in currently sets its
ring to its accent; the check is for the next room and for the custom builder, which words it
through the same `checkTheme()`.

**`--text-faint` carries no reading text.** One hundred and eight `color: var(--text-faint)` rules
naming a thing the reader reads — hints, counts, dates, paths, labels, keycaps, "no results"
sentences, the props card's keys and its "Set banner…" action — moved to `--text-muted`. What stays
faint is the token's licence (DESIGN.md): glyphs and chevrons, closes and separators, placeholders
(`--input-placeholder` is faint by contract), eyebrow group headings (`--panel-heading` is faint by
contract: the tags title, palette sections, the picker's group heads), machine bookkeeping (the
props card's `dg-*` rows, line numbers), disabled controls and the designed sites' deliberate
set-pieces. Not touched, because they are the settings builder's: `settings.css`, the
`.s-smodal__*`/`.s-about__*` rules in app.css; nor `whatsnew.css`, the deck's.

**The scrollbar is one thin bar in both engines.** See the tokens section above: the standard
pair is served under `@supports not selector(::-webkit-scrollbar)`, the per-scroller
`scrollbar-width: thin` declarations that re-enabled Chromium's classic rail (library, routines,
orbits, graph, review, media, what's-new, the dashboard row, the icon picker, the editor's own
theme) are gone, and the two scrollers with their own Firefox colour (the hover card's thumb, the
tab strip's 5px rule) keep it under the same guard. `tests/scrollbars.test.ts` refuses an
unguarded declaration anywhere under client/styles and in editor/theme.ts. Measured in headless
Chromium with the harness under `scratchpad/themes-3.18/`: the tree's bar was 10px with the old
universal rule and is 8px now. Firefox gets the same thin bar it always had.

**The grips follow the layout, not the pointer.** See "The pane grips" above: the only width-free
hide is the phone's; a device that cannot hover gets a resting `--text-faint` line so the strip
can be found. `tests/scrollbars.test.ts` also refuses a pointer-only arm on a grip-hiding block.

## Typography (self-hosted webfont catalog)

`server/fonts.ts` is the whole machinery — catalog, cache, CSS generator — and it never reads
`settings.json`; `settings.ts` and the routes call *in*.

- **`settings.fonts = { prose, ui, mono, arabic }`**, each a catalog id or `"system"` (the
  default; all-system stores nothing at all). Validation is a **strict allowlist and it is
  slot-aware**: an unknown id is a 400, a proportional face in `mono` is a 400, a face with no
  Arabic coverage in `arabic` is a 400. Lookups go through `catalogEntry()` (own-property only) —
  a bare `FONT_CATALOG[id]` would resolve `constructor`/`toString` up the prototype chain and let
  them name a cache directory, the same trap `patchSettings` avoids on its handler table. Absent
  slots in a PATCH keep their stored value (it merges, like `home`).
- **The faces are on disk BEFORE settings names them.** `PATCH /api/settings` validates the ids,
  then `ensureFontsCached()` fetches whatever is missing, and only then writes the file. So a
  network failure is a clean **502 with a message** and `settings.json` is untouched — never a
  site linking a stylesheet with no faces behind it. Two hosts are reachable, ever
  (`fonts.googleapis.com`, `fonts.gstatic.com`), enforced on the PARSED url (https, exact
  hostname, no credentials) with `redirect: "error"`, per-request timeouts and per-file /
  per-family byte caps. `meta.json` is written last, atomically: an interrupted download leaves
  junk the next attempt overwrites, never a half-registered family. `cacheFamily()` is
  deduplicated by id (one in-flight download per family, process-wide), and the per-family byte
  budget is CLAIMED before each fetch rather than totted up after it — a limit checked after the
  count went up let five more of the six concurrent faces land past it, so the real ceiling was
  16 MB + 5 × FONT_MAX_BYTES. A worker that finds nothing left waits for the others to refund
  instead of failing: most woff2 subsets are tens of KB, and six worst-case reservations at once
  would otherwise starve every family.
- **`GET /api/site-fonts.css` is generated, open (OPEN_PATHS) and contains no external URL by
  construction** — every `src:` is `/api/fonts/catalog/<id>/<file>` on this server, served by a
  route that allowlists the id against the catalog and the filename against the shape this module
  generates. It is open for custom.css's reason: the login page of a `PUBLIC=false` vault should
  render in the instance's type.
- **That stylesheet is the UNION of `settings.fonts` and the ACTIVE DESIGN's faces**, because a
  visitor must receive the type a PUBLISHED design references and there is one generated
  stylesheet on a visitor's page. The `?v=` on the link is `siteFontsSignature()` over both
  halves, so an instance whose four slots are all `system` still links the sheet when its design
  names a face, and a design edited from serif to mono gives the browser a new URL. **Nothing on
  this route downloads:** it is open, so a stranger must never be able to make this server fetch
  from Google — an uncached family emits no `@font-face` at all and the design falls back. The
  caching happens where an ADMIN writes: `PATCH /api/settings` for a slot, and every design write
  that can carry a new id (save, import — which is the preset APPLY flow — create, activate) for
  a design, fire-and-forget so a slow font host can never fail or delay a save.
- **The catalog DATA lives in `shared/fontCatalog.ts`; the disk and the network stay in
  `server/fonts.ts`.** Three things that are not the server have to agree about which ids exist —
  `validateChrome()`, the designer's three face rows, and `check-presets` — and the alternative
  was a round trip to draw a menu of constants. `server/fonts.ts` re-exports it, so every
  existing caller still imports from one place. Measured after the move: the catalog lands in the
  lazy DESIGN chunk and is absent from the entry closure — a blog reader does not download a list
  of font names to read a post.
- **The Arabic faces carry a measured `size-adjust`, and only in the Arabic role.** Picking the
  right face is half of "a mixed paragraph sets correctly"; the other half is at what SIZE. Two
  faces at one `font-size` are not two faces at one apparent size — Amiri's base letters stand at
  ~0.35 em against Lora's 0.51 em x-height — so each Arabic catalog entry has an optional
  `sizeAdjust` percent (Amiri 138, Scheherazade New 136, Lateef 150, Noto Kufi Arabic 90; Cairo,
  Almarai, Reem Kufi and Noto Sans Arabic none), measured as the height of ه at a 100px em
  against that same 51, damped 15% toward 100. `faceBlock()` emits it and `composite()` passes it
  ONLY on the Arabic half: the number describes this family against a Latin text face, so it is
  meaningless on the Latin one. Because it rides on the FACE it applies per character, in every
  slot, on an English instance too — which the `--font-scale`/`--prose-scale` multipliers under
  `:root[lang="ar"]` can never do: they scale both scripts equally, so the ratio between them
  never moves, and on an English instance they never run at all. Those multipliers are untouched;
  this is the other axis.
- **Three COMPOSITE families, and the Arabic slot goes first.** `AstrolabeProse`/`AstrolabeUI`/
  `AstrolabeMono` each list the Arabic face's `@font-face` blocks narrowed to the Arabic unicode
  blocks, then the Latin face's with those same ranges carved out. The two sets are **disjoint**,
  which is the point: per-character font matching then needs no tie-break and no source-order
  luck, and a mixed Arabic/Latin paragraph sets correctly **on an English instance too**. Google's
  `arabic` subset also carries shared punctuation (`U+200C-200E`, `U+2010-2011`, `U+204F`,
  `U+2E41`) that its `latin` subset covers — those chunks are dropped, and Presentation Forms-B
  stops at `U+FEFE` so the BOM does not drag a whole extra face in.
- **`--font-*-system` in `tokens.css` is what the composites fall back to**, which is why
  `tokens.css` holds the stacks in those tokens and defines `--font-ui`/`--font-serif`/
  `--font-mono` as `var(--font-*-system)`. The generated sheet re-defines the three consumers at
  plain `:root` specificity: later in the cascade than `tokens.css`, and still *below* a
  `custom.css` `:root` rule (its link is appended after) — the escape hatch outranks the catalog.
  `:root[lang="ar"]` must therefore keep redefining the `*-system` holders and **never**
  `--font-serif` itself, or its higher specificity would beat both. The Arabic type-metric
  multipliers there are untouched.
- **`/api/me.fonts` is a signature, not a boolean** (`"lora.inter.system.amiri"`): its presence
  makes the client link the stylesheet, and its value is the `?v=` on that link, so a changed pick
  gives the browser a new URL instead of a cached sheet naming the old families.
- **`GET /api/font-preview.css`** is the settings panel's live specimen: the same generator under
  a `AstrolabePreview…` prefix and with no `:root` block, so a reader sees faces they have picked but
  not saved. Admin-eyes-only (it can trigger a download) — 404 to visitors like `/api/settings` —
  debounced client-side, and its failures are silent: a specimen falling back to the system stack
  is a fine specimen; a toast per keystroke is not. It takes `sizeAdjust` too: the dial changes
  what the specimen LOOKS like without changing a single id.
- **`GET /api/font-faces.css?ids=…` is the PICKER's own faces** — one `@font-face` per pickable
  id under a `AstrolabeOpt-…` family (`shared/fonts.ts::optionFamily`, imported by both sides so the
  generated sheet and the element naming it cannot drift). A list of family NAMES set in the
  interface font is a list of trademarks; every option row is drawn in the face it names, and the
  Arabic ones carry an Arabic sample. Regular upright only, no range narrowing (one row must set
  its Latin name and its Arabic sample from one declaration), asked for a GROUP at a time as that
  group first appears — twenty-seven families at once is a megabyte of downloads to draw a menu.
  Admin-eyes-only and forgiving, exactly like the preview sheet. `client/fontFaces.ts` owns the
  `<link>`s and drops them all when the panel unmounts.

**The specimen block leads the Typography tab and is STICKY.** It sat under the four pickers,
where the last picker's popover covered it — a preview a control hides previews nothing, which a
gate has already called. It is now one MIXED line per slot (Latin and Arabic in one run: that
single line IS the feature) rather than two, because a 305px block inside a 609px body cannot
also stay on screen. Rows in that tab carry `scroll-margin-top` for it.

## Uploaded fonts (server/customFonts.ts)

The catalog answers "one of ours"; this answers "the face I licensed", which for a serious Arabic
instance is the only possible answer. Ids are `custom:<file>` (`shared/fonts.ts`), valid in
**every** slot.

- **The format comes from the MAGIC BYTES** — `wOF2` / `wOFF` / `0x00010000` / `true` / `OTTO` —
  never from the extension and never from the multipart content type, both of which are
  caller-controlled text. A PNG renamed `.woff2` is a 400, which matters because the file is about
  to be served back with a font MIME. `ttcf` (a collection) is refused: `@font-face` cannot name
  one face inside one.
- **The header is also read for STRUCTURE** (`hasPlausibleTableDirectory`): a table count in
  1…512 and a table directory that fits inside the file carrying it. Magic bytes say "claims to be
  a font", not "a browser can use this" — a 4.9 MB file of the literal `wOF2` plus 4,900,000 zero
  bytes passed the sniff, was stored, was served with a font MIME and rendered nothing, which the
  operator has no way to diagnose. Anything that survives is still only *probably* a font (the
  browser stays the authority); anything that fails cannot possibly be one, so it is a `400`
  (`font_damaged`) at upload time rather than a mystery afterwards. No decompression happens here.
- **EVERY DECOMPRESSION IS A BOMB UNTIL IT IS BOUNDED.** `brotliDecompressSync` and `inflateSync`
  allocate whatever the stream expands to, synchronously, on the event loop, from uploaded bytes.
  Verified: an 800-byte file claiming one `name` table over a brotli stream of 900 MB of zeroes
  drove RSS from **189 MB to 2.96 GB** and answered `200` — a ~1.9-million-to-one amplification
  the 5 MB body cap does nothing about, and a handful in parallel is an OOM kill on any 1–2 GB
  VPS. The WOFF1 path was the same class (`origLength` is caller-controlled and was never used as
  a bound; a 917 KB `.woff` expanded to 900 MB). Both calls now take `maxOutputLength`, bounded by
  the file's OWN arithmetic first — a WOFF2 stream is exactly the concatenation of its tables, so
  the directory states its length; a WOFF1 entry states its `origLength` — and clamped by a
  32 MB `MAX_DECOMPRESSED_BYTES`. Node throws before the allocation, and both calls already sit
  inside `nameTableBytes()`'s try/catch, so a bomb degrades to the filename-derived family exactly
  as an unreadable font always has. Re-measured after: **RSS +120 KB, 10 ms**, still a 200.
- **The stored NAME is a slug this module builds** (lowercase, `[a-z0-9-]`, collision-suffixed,
  known extension) and every entry point re-checks that shape, so no caller string is ever joined
  into a path, a route param, or the unencoded `url()` in the generated stylesheet. That ASCII
  constraint stays; what changed is the FALLBACK. `slugify` answering the literal `"font"` was
  paid for by exactly the reader this feature exists for: `خط-عربي.otf` kept nothing and became
  `font.otf`, then `font-2.otf`, `font-3.otf`. `storedStem()` asks the font's own family name next,
  so that file is stored `amiri.otf`; `"font"` is the third answer, not the first.
- **Concurrent uploads are SERIALIZED, and the index tmp file is per WRITER.** `writeIndex()` used
  a fixed `index.json.tmp` for every writer, and `saveCustomFont()` did a non-atomic
  read/await/write around it. Verified with four parallel POSTs of four distinct faces all named
  `race.ttf`: three `500`s (`ENOENT: rename index.json.tmp -> index.json`) whose bytes were on
  disk anyway — the admin told the upload failed while the font appeared on refresh — and only
  **two files** left of four, one of them labelled with a different font's family, because
  `access`-then-`write` let several writers pick the same free name. The tmp name now carries
  pid + random, and the whole critical section (pick a free name, write the bytes with `wx`, merge
  the index row) runs behind one promise chain that never rejects. `deleteCustomFont` shares it.
  Re-measured: 4/4 `200`, four files, four correct family names, zero server errors.
- **The two font READ routes `lstat`, not `stat`.** `stat` follows symlinks: a link named
  `symlink.woff2` planted in `ASTROLABE_DATA/fonts/custom` served `/etc/passwd` to an anonymous
  request, `200`, `Content-Type: font/woff2`, on a route deliberately exempt from the auth guard.
  Nothing in the API can create such a link — names are generated — but both directories are also
  written by hand (the `custom.css` escape hatch is the whole point of one of them), and
  lstat-and-reject costs one letter. `listCustomFonts` and `customFontExists` follow suit, so a
  link is not advertised in a list that the route would 404.
- **`POST /api/fonts/upload` is admin-only**, capped at 5 MB on the wire (`bodyLimit`,
  `shared/limits.ts`) and again on the decoded bytes.
- **The FAMILY name is read from the font's own `name` table** where the file allows it: sfnt
  directly, WOFF1 through its per-table zlib, WOFF2 through one brotli pass over the compressed
  stream (only `glyf`/`loca` are ever transformed, so `name` sits at the sum of the preceding
  stored lengths). Anything unreadable falls back to the filename stem — a picker row saying
  "upload-3" is not a picker row. Failure is never an error: the upload succeeds either way.
- **`/api/fonts/*` is open for READS ONLY.** That prefix is exempt from the auth guard so a
  visitor's browser can fetch the face BYTES (the same reason `custom.css` is open) — once fonts
  could be uploaded and deleted under it, a path-only exemption would have handed an anonymous
  caller `POST /api/fonts/upload` and `DELETE /api/fonts/custom/<file>`. The guard now scopes the
  exemption to GET/HEAD, and `GET /api/fonts/custom` (the inventory, as opposed to the bytes)
  gates itself with `isPublishLimited` like `/api/settings`.
- **Deleting is guarded twice**: a face a slot still names shows which slot instead of a delete
  button, and `DELETE /api/fonts/custom/:file` 409s that case regardless of what the panel
  believes. The confirm dialog is the ordinary `confirmModal`.
- **A custom face gets the unicode-range its ROLE implies.** A catalog family arrives pre-sliced
  by Google with a range per subset; an upload is one file with no range at all, and "no range"
  means "answers for every codepoint" — which would make the two halves of a composite OVERLAP and
  hand the pick to declaration order. So the Arabic slot narrows a custom face to the Arabic
  blocks and a Latin slot standing beside an Arabic face carves those blocks out (the complement
  is computed from the same `ARABIC_BLOCKS` table). The disjointness invariant holds for uploads
  exactly as for the catalog.
- **`settings.fonts.arabicSizeAdjust`** (50–300, or null) overrides the measured `size-adjust` for
  whatever is in the Arabic slot. The catalog's numbers were measured against Lora; an uploaded
  face cannot be, so the operator gets the dial — set by eye against the specimen, which is the
  only way this number is ever really set. It rides in `fontsSignature()`, so a changed dial gives
  the browser a new stylesheet URL like a changed pick does.
- **Slot rules are relaxed for uploads, deliberately.** `slotAllows` knows a catalog face is
  monospace or covers Arabic because we chose it; it knows nothing about a file that arrived this
  morning, and refusing an operator his own naskh face on a guess ("does not cover Arabic") would
  be worse than letting the specimen answer. Existence on disk IS checked, next to the catalog
  download in `PATCH /api/settings`, under the same "the faces are on disk before settings.json
  names them" rule.
