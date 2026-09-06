# Theming

*The twenty-two built-in themes, the ambient masthead, the custom-theme builder, the CSS token API, and `custom.css`.*

← [Back to the README](../README.md) · [All docs](README.md)

---

If Astrolabe is replacing a blog, you probably want it to stop saying "Astrolabe" and start looking
like *your* site. Three env-driven hooks cover that, no fork required.

## Name it

`SITE_NAME=Night Garden` rebrands every visible surface — the `✦` wordmark in the
sidebar, the browser tab titles (`Note · Night Garden`), and the sign-in modal.

## Pick the default look

Astrolabe ships **twenty-two** themes — fifteen dark rooms and seven lit ones. Every one of them
defines the whole palette for itself (ground, type, accent, selection, focus ring, graph, all
thirteen callout hues, all eight syntax colors), so none of them is another theme wearing a
different background.

![The built-in themes](screenshots/themes.png)

| Dark | | Light | |
| --- | --- | --- | --- |
| `iron-gall` | warm near-black, gold leaf — **the default** | `parchment` | warm paper, gold leaf |
| `cinnabar` | neutral graphite, vermilion type | `sandstone` | dry desert paper, burnt orange |
| `sumi` | ink-stick grey, aizome indigo | `solar` | brightest white paper, burnt gold |
| `void` | true black, cold signal cyan | `linen` | cool daylight, ink blue |
| `basalt` | cool blue-grey stone, pale sky | `palimpsest` | scraped grey astrolabe, rubric red |
| `nocturne` | blue-black night, periwinkle | `porcelain` | glazed white, deep celadon |
| `lapis` | deep lapis blue-black, brightened gold | `mauveine` | pale lilac, aniline violet |
| `verdigris` | green-black, oxidized copper | | |
| `moss` | olive-black forest floor, lichen | | |
| `porphyry` | purple-black stone, dusty rose | | |
| `tallow` | warm brown paper, candle-flame amber | | |
| `phosphor` | CRT green-black, P1 phosphor green | | |
| `sidereal` | blue-violet deep space, starlight | | |
| `murex` | violet-black, Tyrian purple | | |
| `graphite` | solid neutral greys (GitHub dark), gold leaf; the brand's room | | |

Six of them arrived together, and each was drawn for a room the set did not have:

- **`phosphor`** is a terminal rather than a theme that gestures at one. Its syntax palette is
  its identity: a cathode tube has ONE gun, so keyword, function and property are three strengths
  of the same green, type is that green pushed to its cyan edge, and the only colours that are
  not green are the amber of a P3 tube (strings and numbers) and the alarm red.
- **`sidereal`** is deep space at a real distance — a blue-violet ground far darker than
  `nocturne`'s, under starlight. Its body text is a *neutral* silver on purpose: starlight and
  body text are both pale blue-whites, and an accent that is a shade of its own type is not an
  accent (the 18 ΔE rule below). The two sit 29.6 ΔE apart.
- **`murex`** is the sea snail Tyre boiled by the ton for the only colour an emperor was allowed
  to wear. `porphyry` is the *other* imperial purple; these two are kept apart by 39.6 ΔE of
  accent — a warm dusty rose there, the dye at full strength here.
- **`palimpsest`** is older than `parchment`, which is the point: a sheet scraped clean and
  written over, greyed where parchment is golden, under the rubricator's red. It is also the lit
  set's first red room.
- **`porcelain`** is Song celadon — a glaze-white ground with a breath of green in it, under the
  deep sea-green the Longquan kilns were built for. The refined room, and the lit set's first
  green-family accent.
- **`mauveine`** is the accident that started the dye industry: Perkin, eighteen, failed to
  synthesise quinine in 1856 and washed the flask out with alcohol. The lit set had no violet.

Every reader picks their own from the **theme picker** — the theme control in the status bar
opens it, and so does *Themes* in Settings → Appearance & language. Each row is a
miniature of the room — its ground carrying a heading rule, a line of type and an accent chip —
next to a human name and a one-line description, both localized; the raw id (what `DEFAULT_THEME`
and the palette take) is in the row's tooltip. It is a grouped, keyboard-driven
list: `↑↓←→` moves the highlight and applies that theme live to the whole app behind the panel,
`Enter` keeps it, `Esc` puts back the theme you started with. (The mouse never moves the keyboard
highlight — only a click picks.) The palette carries ONE route to all of them: *Themes*
opens the same panel, with a dot showing the theme you are in. (It used to carry a `Theme: <id>`
command per theme beside that row, 15 of 41 entries spent on one preference, every one of them a
blind jump into a room you had not seen. A parameter with this many values belongs behind the
surface that shows the values — and the argument only got stronger as the set grew.) A
reader's choice sticks in their own browser.

**By default, the public site wears the theme you write in.** You pick a room in the picker, and
first-time visitors land in the same room — a one-author blog looking like its author, with
nothing to configure. Your theme lives in your browser, so Astrolabe mirrors it to the server when
your choice settles (once, a second after you stop browsing themes — not once per row). Both
places that choose a theme say so out loud, in the theme's own name: the picker's footer and
Settings → Appearance & language → *Default theme* read *"Visitors see Cinnabar — following your
editor theme"*, each with a one-click **Pin this instead**. Pin one and the public site stops
moving with you (*"Visitors see Parchment — pinned"*, with **Follow my theme** to undo it);
`DEFAULT_THEME=cinnabar` pins the same way from the environment, and `DEFAULT_THEME=follow` (or
the setting) puts it back. Your pin and your editor theme are stored separately, so unpinning
puts visitors back on whatever you are actually using. A reader who has chosen a theme is never
moved by any of this, and an unknown `DEFAULT_THEME` is ignored with a line on stderr at startup
rather than silently.

## The ambient masthead

A theme is a set of *static* tokens by architecture — every gate in this repo measures those
hexes against one another, and a value that moves is a value nobody screenshotted at the frame
where it failed AA. So the rooms stay still, and the motion is a separate, optional layer of
**decoration behind the words**.

Turn it on in Settings → Publishing → **Ambient masthead** (or `"ambient": true` in
`settings.json`; it is **off** by default). The public site's masthead — the stock blog's and the
designed shell's alike — then carries a slow atmosphere drawn from the theme in force:

| Air | Rooms | What it is |
| --- | --- | --- |
| stars | `sidereal`, `nocturne`, `lapis`, `murex` | two star fields at different scales and speeds, the far one breathing |
| scanlines | `phosphor`, `void` | a 3px grating creeping exactly one pitch every twelve seconds, under the gun's own glow |
| dust | `iron-gall`, `tallow`, `parchment`, `palimpsest`, `solar` | gold motes rising, slowly enough that looking straight at them shows a still page |

Every other room is deliberately still — a theme gets an air only when it has something to say
with one. Every mark in every air is that room's **own `--accent`**, so `murex`'s stars are
Tyrian and `palimpsest`'s dust is rubric red without a rule of their own.

Four properties hold whatever else changes:

- **It is decoration and it is not content.** An empty `aria-hidden` div, `pointer-events: none`,
  at `z-index: -1` inside a masthead that carries `isolation: isolate` — unreachable by a pointer,
  a caret, a screen reader or the tab order.
- **It is pure CSS.** No canvas, no `requestAnimationFrame`, no JavaScript beyond the one `if`
  that decides whether the div is in the DOM. Both animated properties are compositor properties.
- **It is a whisper, and that is a measurement.** Not an opacity but the worst *composited* ground
  under the masthead title, read off real pixels with the animation running: `phosphor` 11.41:1,
  `murex` 10.74:1, `sidereal` 9.63:1, `iron-gall` 9.08:1, `parchment` 8.31:1. The floor is 4.5.
- **`prefers-reduced-motion` deletes it.** Not paused, not slowed: `display: none` on the
  container, so neither layer gets a box and nothing is composited — two screenshots 2.6s apart
  come back byte-identical.

It rides in the public shells' own chunks (`client/styles/ambient.css`), so an instance with it
switched off — and the entry bundle every audience downloads — pays nothing for it.

## Make your own

The built-ins are a starting point, not a ceiling. **Themes → New custom theme** opens a builder:
pick one of them as a base, then override any token you like — grounds, text, **headings**, accent,
borders, and every surface on its own (the sidebar, the tab strip, the status bar, the editor page, the
reading page, the fields and buttons, the dialogs, the site, the cards; find one by name in the filter), the thirteen callout hues, the eight syntax colors, the graph — and watch the whole app
change behind the panel while you do it, because the only honest preview of a theme is the theme.
Tokens you do not touch keep coming from the base, so a later retune of that base reaches your
theme for free, and every row's *reset* deletes the override rather than freezing today's value
into it.

The builder runs **the project's own contrast gate live**: the same code
`scripts/check-contrast.mjs` runs — body text ≥ 4.5:1 and secondary ≥ 3:1 against all three
grounds, the accent ≥ 4.5:1 on its own ground, and the accent at least 18 ΔE from your body text
(not a contrast ratio: a theme whose accent is a shade of its own type has no accent channel at
all). Warnings appear in words, above the control that caused them, with a mark on any group that
holds one.

Save it under a name and it is selectable **everywhere a built-in theme is**: the picker (its own
"Your themes" group), the ☾/☀ button, Settings → *Default theme*, and `DEFAULT_THEME=custom:<name>`
in your `.env`. Export it as JSON, mail it, import it on another instance.

## Restyle it

Drop a `custom.css` into your data directory (`ASTROLABE_DATA`, default `./data/`)
and Astrolabe serves it at `/api/custom.css` and loads it after its own stylesheets — for every
visitor and for you, in dev and prod, no rebuild, no restart. Because it loads last, your rules
win. The whole UI is driven by CSS custom properties on `:root` (and per-theme overrides via
`html[data-theme="…"]`), so most re-skins are a handful of token lines:

```css
/* data/custom.css — a green-accented reading room */
:root,
html[data-theme="lapis"] {
  --accent: #5da06b;
  --accent-soft: rgba(93, 160, 107, 0.14);
  --font-serif: "Iowan Old Style", Georgia, serif;
}
```

The token API (define them on `:root` for all themes, or under `html[data-theme="void"]` etc.
for one):

| Token | Drives |
| ----- | ------ |
| `--bg` / `--bg-raised` / `--bg-hover` | Page background / sidebar & panels / hover rows |
| `--text` / `--text-muted` / `--text-faint` | Body text / secondary text / hints & counts |
| `--heading` | Every heading — the editor's, the reading view's, the article title on the blog and the library's page titles. Each built-in sets it a shade toward its accent; a custom theme sets it outright |
| `--accent` / `--accent-soft` | Brand color (links, wikilinks, active marks) / its translucent wash |
| `--selection-bg` / `--focus-ring` | Text-selection wash / the 2px `:focus-visible` ring |
| `--graph-node` / `--graph-edge` / `--graph-vignette` | Graph disc color / idle edge stroke / the canvas's edge wash |
| `--border` | The 1px hairlines everywhere |
| `--danger` | Destructive actions, broken-link tint |
| `--font-ui` / `--font-serif` / `--font-mono` | UI chrome / prose & headings / code |
| `--font-base` | Root type size — the entire UI is sized in `rem`, so this one token scales all chrome (default 15.5px) |
| `--font-prose` | Editor / reading prose size (default ≈18px; the blog article body sits a step above it) |
| `--radius` | Corner rounding (default 6px) |
| `--sidebar-w` | Sidebar width (default 292px) |
| `--callout-note`, `--callout-tip`, … | Per-type callout hues (see `client/styles/tokens.css`) |
| `--syn-keyword`, `--syn-string`, … | Code-highlighting palette |

**The surface layer.** Everything above is a base token, and most of the interface used to read them
directly, so a room could not recolour its sidebar without recolouring every raised surface. Every
painted thing now has a token of its own, defined on `:root, [data-theme]` as a derivation of a base
token (`--sidebar-bg: var(--bg-raised)`), which means two things at once: a base token you change
still flows into every surface you have not touched, and a surface you set moves alone. The builder
lists all of them under human names, in both languages, with a filter over the rows and a reset per
group; `custom.css` can set any of them by name. Text on a ground is measured like the base pairs:
`--sidebar-text` on `--sidebar-bg` at 4.5:1, secondary text at 3:1, and the builder says so in words
when a pair fails. The six page inks are deliberately not here: a highlight that changed colour with
the theme would be data loss, not a theme.

| Surface | Tokens (each follows the base in brackets until you set it) |
| --- | --- |
| Sidebar | `--sidebar-bg` (var(--bg-raised)), `--sidebar-text` (var(--text)), `--sidebar-muted` (var(--text-muted)), `--sidebar-border` (var(--border)), `--sidebar-hover-bg` (var(--bg-hover)), `--sidebar-active-bg` (var(--accent-soft)), `--sidebar-active-bar` (var(--accent)), `--sidebar-search-bg` (var(--bg)), `--tagpill-bg` (var(--bg-hover)), `--tagpill-text` (var(--text-muted)) |
| Tabs & panels | `--tabs-bg` (var(--bg-raised)), `--tabs-border` (var(--border)), `--tab-text` (var(--text-muted)), `--tab-hover-bg` (var(--bg-hover)), `--tab-active-bg` (var(--bg)), `--tab-active-text` (var(--text)), `--tab-active-bar` (var(--accent)), `--panel-bg` (var(--bg-raised)), `--panel-text` (var(--text)), `--panel-heading` (var(--text-faint)), `--panel-border` (var(--border)) |
| Status bar | `--statusbar-bg` (var(--bg-raised)), `--statusbar-text` (var(--text-muted)), `--statusbar-border` (var(--border)) |
| Editor & code | `--editor-bg` (var(--bg)), `--editor-text` (var(--text)), `--editor-caret` (var(--accent)), `--editor-panel-bg` (var(--bg-raised)), `--codeblock-bg` (var(--bg-raised)), `--codeblock-text` (var(--text)), `--inline-code-bg` (var(--bg-raised)), `--inline-code-text` (var(--text)), `--code-border` (var(--border)) |
| Reading | `--reading-bg` (var(--bg)), `--reading-text` (var(--text)), `--quote-bar` (var(--accent)), `--quote-text` (var(--text-muted)), `--highlight-bg`, `--hr` (var(--accent)), `--list-bullet` (var(--accent)), `--table-border` (var(--border)), `--table-head-bg` (var(--bg-raised)), `--table-head-text` (var(--text-muted)), `--props-bg` (var(--bg-raised)), `--footnote-marker` (var(--accent)) |
| Links & tags | `--link` (var(--accent)), `--wikilink` (var(--accent)), `--wikilink-broken`, `--tag-bg` (var(--accent-soft)), `--tag-text` (var(--accent)) |
| Controls | `--button-text` (var(--text)), `--button-hover-bg` (var(--bg-hover)), `--button-accent-bg` (var(--accent-soft)), `--button-accent-text` (var(--accent)), `--input-bg` (var(--bg)), `--input-text` (var(--text)), `--input-border` (var(--border)), `--input-placeholder` (var(--text-faint)), `--input-focus` (var(--accent)), `--menu-bg` (var(--bg-raised)), `--menu-text` (var(--text)), `--menu-hover-bg` (var(--accent-soft)) |
| Dialogs & toasts | `--modal-bg` (var(--bg-raised)), `--modal-text` (var(--text)), `--modal-border` (var(--border)), `--backdrop`, `--toast-bg` (var(--bg-raised)), `--toast-text` (var(--text)), `--toast-bar` (var(--accent)), `--scrollbar-thumb` (var(--border)), `--scrollbar-thumb-hover` (var(--text-faint)) |
| Graph | `--graph-bg` (var(--bg)) |
| Site | `--blog-bg` (var(--bg)), `--blog-text` (var(--text)), `--blog-mast-text` (var(--text)), `--blog-mast-tagline` (var(--text-muted)), `--blog-mast-star` (var(--accent)), `--blog-nav-text` (var(--text-muted)), `--blog-nav-hover-bg` (var(--bg-hover)), `--blog-nav-active-bg` (var(--accent-soft)), `--blog-nav-active-text` (var(--accent)) |
| Cards & bars | `--card-bg` (var(--bg-raised)), `--card-text` (var(--text)), `--card-border` (var(--border)), `--card-hover-border` (var(--accent)), `--progress-track` (var(--bg-hover)), `--progress-fill` (var(--accent)) |

## Bring your own fonts (the CSS route)

Astrolabe ships zero webfonts by design, but your instance doesn't have to. Drop font files into
`ASTROLABE_DATA/fonts/` (default `./data/fonts/`) and they are served at
`/api/fonts/<file>` — `woff2`, `woff`, `ttf`, and `otf` only, strictly by basename, with ETags
and immutable year-long cache headers. Wire them up with an `@font-face` in `custom.css`:

```css
/* data/custom.css — serve data/fonts/MyFont.woff2 as the prose face */
@font-face {
  font-family: "MyFont";
  src: url("/api/fonts/MyFont.woff2") format("woff2");
  font-display: swap;
}
:root {
  --font-serif: "MyFont", Georgia, serif;
}
```

For the no-CSS route — a curated, self-hosted catalog and an uploader, both with real Arabic —
see [Typography](typography.md).

Anything beyond tokens is fair game too — every element carries a stable `s-` prefixed class
(`.s-sidebar`, `.s-rv-p`, `.s-statusbar`, …), so `custom.css` can restyle specific components.
If you keep body text ≥ 4.5:1 contrast against `--bg`, the whole app stays readable.

## Colored text in two tiers

The default writes `var(--vc-blue)`, a *meaning* that every one of the built-in themes resolves to
something clearing AA on its own ground, light or dark; a fixed-ink palette writes a literal hex
when you mean *that* color. Both render identically in the editor, the reading view and the blog,
and the sanitizer admits `style` on a `<span>` for `color`/`background-color` only — no `url()`,
no other properties.

The two tiers exist for an arithmetic reason: against `void`'s `#050508` a color needs relative
luminance ≥ 0.186 and against `solar`'s `#ffffff` it needs ≤ 0.183, so **no single color clears AA
on every theme**. The theme-aware tier (`var(--vc-*)`, the default) carries one value per
theme *group* and is held to 4.5:1 against every ground in its group — its worst measurement is
4.98:1, on `palimpsest`'s ground, which took that title from `solar`'s white the day it shipped.
The fixed-ink tier carries one hex for all of them and is held to 3:1, WCAG 1.4.11's non-text
floor, which is the most a fixed color can promise. `node scripts/check-contrast.mjs` gates both — see
[Development](development.md).
