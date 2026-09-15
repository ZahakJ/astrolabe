# Designed mode

*The third way to show your site to visitors: a home page you build out of sections, plus your own navigation, header, footer, typography and static pages.*

← [Back to the README](../README.md) · [All docs](README.md)

---

Visitors can see your site in one of three shapes. The **app** layout shows them the reading app itself. The [**blog**](blog-mode.md) layout shows them a ready-made blog with a fixed front page. **Designed** mode, the third, lets you compose the front page yourself. Turn it on with `PUBLIC_LAYOUT=designed` or in **Settings → Publishing & comments → Public layout → Designed**.

In designed mode your home page is built from **sections** you choose and order: a hero (a big opening block with a heading), blocks of markdown, a whole note pulled in, a grid or a list of posts, a cloud of topics, a call-to-action button, rules and empty space. Around the sections you make site-wide choices: a full masthead, a single bar, or no header at all; how wide the reading column is; how dense the page feels; and which parts of an article page are shown.

Open the designer from the command palette: **Design your site**.

## The built-in blog does not move

The blog and the designer are two separate programs. The designer never touches the blog's code; it is a *second* renderer (the part of the program that turns your content into a page) that draws its own page, not a restyling of the first. That is what makes switching between them safe:

**Switching between the blog and a design is instant, and nothing is lost in either direction.** Your designs live in `ASTROLABE_DATA/designs.json`. While the layout is anything other than `designed`, that file is simply not read. So going back to `blog` deletes nothing, and going forward again brings your site back exactly as it was. Going back to the stock blog is a rescue, not a decision.

## A broken design is your visitors' non-event

Suppose the design file is invalid, or a section points at a note you deleted, or something fails while the page is being drawn. **Visitors are shown the built-in blog instead, automatically.** They never see a blank page or an error dump. You are the one who is told: a notice in the app names the failing section, and one click takes the site back to the stock blog. `npm run check-design` is the check that keeps this promise honest: it breaks the site in all three ways on purpose and measures what a visitor and an owner each see. See [Development](development.md).

## Sections

A design's home page is an ordered list of sections. Any section can be hidden without being deleted, the same "kept while inactive" rule the whole design file follows, one level down.

| Kind | What it puts on the page |
| --- | --- |
| `hero` | A heading, a sub-heading and an optional image (an https URL or a vault attachment); aligned `start` or `center`, sized `short` or `tall`. Leave the heading empty and the hero shows the site name and tagline, so a hero is useful without typing anything |
| `richText` | A block of markdown, rendered by the same reading renderer as your notes: the same HTML cleaning, the same wikilink resolution, the same callouts |
| `note` | One published note, pulled in whole, or just its first paragraph with a link to the rest |
| `postGrid` | The newest published posts as cards: a heading, a limit, a column count, an optional tag filter, and switches for the excerpt, the banner and the date |
| `postList` | The same posts as a plain list: a heading, a limit, a tag filter, and switches for the excerpt and the date |
| `topics` | A cloud of topics drawn from your published tags, up to a limit |
| `cta` | A heading, a line of text, and a button. The button's target must be an address on this site (`/topic/x`) or an absolute https URL; a home page button is not a place to accept `javascript:` |
| `divider` | A rule, a row of dots, or plain vertical space, in pixels |

> **A post section cannot skip posts.** `postGrid` and `postList` both read the newest published posts and stop at their limit, so two post sections in one design show the same posts twice. A design should carry **one** post section, or a *feature* of one to four posts above a *long index* of twenty or more, where a reader expects the archive to begin with the piece above it. Two grids of similar size stacked on each other is the arrangement that looks like a bug.

The section board gives you three ways to move a row: the ↑/↓ buttons, dragging with the pointer, or lifting with the keyboard (`Space` to lift, the arrow keys to move, `Space` to drop, `Esc` to cancel). It shows where the row will land before you let go. `Ctrl/Cmd S` saves the draft. `npm run check-board` tests all three.

## Site chrome

Beyond the sections, a design describes the frame around them:

- **Header**: a `stacked`, `stackedStart` or `inline` layout; `compact`, `regular` or `tall` density; nothing sticky, a sticky nav, or a sticky header; and the logo, site name, tagline and divider, each with its own switch.
- **Navigation**: an ordered list of items. Each item is a link to the home page, a note, a [static page](#static-pages), a topic or an external URL, or a `group` that holds child items as a dropdown. Up to 20 items with 12 children each. An item can open in a new tab or be hidden. If there are no items at all, `nav.fallback: "topics"` fills the menu with your busiest published tags, so a fresh install gets a furnished site. The nav also carries switches for the search box, the theme toggle and the `EN`/`ع` [language switch](arabic-and-rtl.md#visitor-language-switch).
- **Typography**: base size, modular scale, reading measure in `ch` (the width of the text column, counted in characters), line height, vertical rhythm, heading weight, heading case (`normal`, `smallcaps` or `uppercase`), and serif or sans-serif for headings and body separately. Every one is a dial with a minimum and a maximum, not a free number.
- **Footer**: columns of entries, each a link, plain text, or a social icon (Mastodon, X, GitHub, LinkedIn, RSS, email).
- **Article page**: which parts an article keeps: the banner, the meta line, the tags, the related posts, the back link.
- **Theme**: a design is a look, and a look is a theme plus a layout, so a design names one of the [forty-six themes](theming.md) (or a custom one). It applies to visitors who have not chosen a theme of their own; `null` leaves `settings.defaultTheme` alone.
- **Site**: the width of the section column in pixels, and `compact`, `regular` or `roomy` density.

## Presets

A preset is a finished design you start from. The designer ships **81 of them** in nine families: `editorial`, `minimal`, `journal`, `portfolio`, `reference`, `landing`, `gallery`, `letter` and `signature`. A preset is a copy you start from and change freely, not a form to fill in. Three rules govern every one of them, and they are the whole contract for adding another:

1. **A preset is pure form.** Every text field it could set (a section heading, a hero's own heading, a call-to-action's words, a footer copyright, a nav label) is left **empty**, and the renderers already know what empty means: a hero with no heading shows the site's name and tagline, an empty copyright falls back to the instance's own footer line, an empty button label becomes the translated "Read more". A preset that typed "Latest writing" into a heading would put an English word into an Arabic site and a stranger's voice into everyone's. The shape is ours; every word on the page is yours.
2. **A preset names nothing in your vault.** No `note` section, no nav item pointing at a note or a page, no tag filter, no image path. A shipped design cannot know what is in someone else's vault, and a preset that guessed would show up as your very first error card. It leans on the fallbacks that already exist instead.
3. **A preset is a look, so it names a theme**: one of the built-in ones, chosen because the layout was drawn against it. A broadsheet is a broadsheet on `parchment`.

`npm run check-presets` holds the catalog to those rules: unique ids, a name and blurb in both languages with real Arabic, a known family, at least one preset per family, and no preset naming a note.

### Every signature house has a flourish, and it travels with the design

The 21 `signature` presets are "houses", in the sense of a fashion house: each has a whole character of its own. Each carries a **Signature styling** choice, in the **Header & footer** tab, that travels with the design. It is what makes a house a house rather than just a palette: the broadsheet's nameplate with its ears and dateline strip, the tractor-feed paper and punched tape, the console's radar, the eclipse above Deep Field, the museum wall with a piece hung on wires, the moon phases and star chart of the register. It survives renaming, duplication, and JSON export and import, so a fork of Mission Control that you recolour and reorder is still in the console. Choose **No extra styling** to remove it without touching your sections or typography. Designs saved before this existed carry no signature until you apply a preset that has one.

Every flourish is drawn with the theme's own colours (gradients, rules and shadows, never an image or a fixed colour), so it follows your palette and your light and dark themes. The drawing is a hero section with a blank heading, which is the section that already prints your site's name and tagline, so the masthead above it stays quiet on the front page and returns on every article.

`npm run check-signatures` runs an isolated browser test over the signature collection: desktop and phone layouts, Arabic direction and collection navigation, plus galleries and hover summaries across all 81 presets, keyboard previews, article rendering and designer parity. `SIGNATURES=late-edition,klaxon`, `--houses-only` and `SHOTS=full` narrow it to the houses you are drawing and write screenshots to `shots/signatures/`. It never touches a vault or a saved design.

### Blog features in every template

Two things from the blog also appear on designed home pages. **Author-site gallery cards**, when you have configured them, appear at the end of the page. **Published collections** appear near the top when their home-page placement is on; with the navigation placement on, the collections that have posts in them are added beside the menu you wrote, and a collection's pages keep the active design around their contents. These use the same settings and the same visitor-filtered data as the stock blog, and they show in the designer's live preview too.

Post links offer a **spotlight** when the pointer rests on them or the keyboard focuses them: the post's opening, centred over a dimmed page, under its banner (when it has one), its date, its reading time and its tags. It works on links in cards, lists, search results and related posts, in both public layouts. On a touch screen a tap simply follows the link. Long pages also get the shared back-to-top control. Article and static-page bodies use the shared note renderer and honour a note's alignment settings.

## Designs are named, versioned, and portable

You can keep several designs, duplicate one to try something, export any of them as JSON (custom themes it uses travel with it) and import it into another instance. Import is always *additive*: a design whose name collides gets a fresh id, and nothing you already have is ever silently overwritten. "Reset to stock" is always one click away. A design written by a **newer** version of Astrolabe than the one you are running is kept on disk and listed with the reason; it is never rendered half-understood.

## The live preview

The designer's preview pane is a real page running the real designed layout, not a mock-up. It uses the instance's stylesheets and theme (including a live theme switch), and it lays the page out at phone, tablet and desktop widths so you can check what a reader will actually see before scrolling. Keys pressed inside the preview do nothing: a preview that reacted to `Enter` would be a second, silent editor. `npm run check-preview` tests it.

## Static pages

An About page, a Contact page, a Colophon: these are notes that belong to the **site** rather than to the feed of posts. You mark one with a frontmatter flag:

```yaml
---
publish: true
page: true
---
```

`page: true` was chosen over a special folder on purpose. A page stays an **ordinary note**: it keeps its place in the vault next to the writing it belongs with, it keeps its wikilinks and backlinks, and you edit it in the same editor. A `/pages/` folder would have forced a filing decision that rewrites every `[[wikilink]]` pointing at the note and breaks its permanent address, all for a property that has nothing to do with where the file lives. The flag is also the shape the vault already uses for this kind of fact: `publish: true` decides whether a note is visible, and `page: true` decides what *kind* of thing it is.

A page is still just a note, so it lives at its own clean address (`About.md` becomes `/About`), and it must still carry `publish: true` to be visible to anyone; `page: true` alone publishes nothing.

The flag changes two things, and **only in designed mode**, so the stock blog behaves exactly as it did:

- the page leaves the post feed (`/api/posts`, the home list, the topic lists and RSS), because a Contact page is not an article and must not be the newest thing on the front page;
- it can be offered in the navigation builder, and it is rendered with the designed layout's *page* template (no date, no reading time, no previous/next, no related posts) instead of the article template.

With `publicLayout` at `app` or `blog` the flag does nothing, and a vault full of `page: true` notes behaves exactly as it did before the feature existed. Switching to designed mode is what gives the flag its meaning; switching back gives it up again, losing nothing.
