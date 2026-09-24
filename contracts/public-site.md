# The public site — the blog and the designed site

What a visitor sees: the blog shell, publishing and topics, collections, and the site design engine with its designer. Part of the module contracts (see [CONTRACTS.md](../CONTRACTS.md) for the map). **Edit the area, append nothing:** a change to how something works is written HERE, in the section it changes, and the old sentence goes; a release gets one line in [releases.md](releases.md), never an addendum.

## Blog surface (the public shell's own furniture)

- **One column per page.** `.s-blog-page` sets the measure (720px, 24px gutters; 18px on a
  phone) and everything inside it lives in that column. `.s-blog-article .s-marginalia`
  therefore clears comments.css's own `max-width: 760px` + 56px gutters, which in the app are
  the whole column and here were a SECOND column inside the first: measured at 1440 the
  marginalia block sat 435–994 against an article at 379–1050, so the MARGINALIA rule and
  heading were inset ~57px per side from the SHARE and RELATED headings directly above them,
  and at 390 the comment form threw away 28% of its width. Measured after: marginalia
  379–1051 and 18–372, identical to `.s-reading__content`, en and ar.
- **Mentions follow the comments, in the same column.** `.s-blog-article .s-mentions` clears
  `mentions.css`'s app measure exactly as `.s-marginalia` does, and the section borrows the
  comments' header and cards so the two read as one conversation (see "Webmentions and the
  fediverse").
- **No separator before the tag chips** in `PostMetaLine`. The meta line wraps, and at 390 the
  chips went to their own line while the `·` stayed behind — every tagged card on the phone
  ending its meta line with a bare tick, the "separator with nothing on its far side" DESIGN.md
  forbids, reproduced on the marketing surface. A pill is its own boundary; `BlogDashboard`'s
  card had already made the same call. Verified at 1440/1024/768/640/480/390 × en/ar: every
  remaining `·` has something on its far side on the same line.
- **The byline follows the TITLE's script, not the chrome's.** The `h1` aligns itself with
  `dir="auto"`, so on an Arabic instance an English-titled post left the title hard left and its
  own date/word-count hard right — one heading split across 670px of empty ground. Four rules
  (chrome dir × title script) put the meta under the end of the title it belongs to;
  `flex-start` is the CONTAINER's start, which is why the RTL chrome needs the opposite keyword
  to reach the same physical edge. **The INDEX CARD gets the same four rules**
  (`.s-blog-entry__text--rtl`, set from `isRtlText(post.title)` exactly as the article head is):
  the fix landed on the article page alone, so the split it describes went on reproducing on every
  card of the home page — measured at 1440 on an Arabic instance, an English-titled card put its
  title at x=545 and its byline group at 849–1061, and now starts both at 545.
- **No keyboard legend on a touch device**, in the footer as well as in the app's empty state:
  `.s-blog-footer__hint` (the `Ctrl K` chip) is `display: none` under `(max-width: 700px),
  (pointer: coarse)`. Nothing is lost — the nav's search field is on screen at every width, and
  it is what the chip pointed at.
- **`bannerFallback: "generated"` produces a made thing, not a blur.** `generatedBannerCss()`
  now lays a deterministic hairline rule pattern (angle and spacing from the title hash, painted
  from `--text` at 7–9%, so it is the theme's own ink on any ground the product has) over the
  three hash-hued radial blobs. Three soft blobs alone read as an image that failed to load: a
  783×166 field with no edge anywhere in it, and index thumbnails that looked broken rather than
  abstract.
- **The generated banner is ONE SYSTEM, in the room's own palette.** Two things made it read as
  clip-art dropped into a manuscript. (1) Every hash hue sits under a floor of
  `var(--accent)` (`color-mix(… var(--accent) 16%, <tinted hue>)` — 55% when this was written;
  `client/banner.ts` says why it came down once the hue was anchored), and `--banner-tint` says
  how far the hash may pull a blob off the accent: 66% in the dark rooms, 62% in the ported ones,
  34% on paper (18% on the two lightest). An unanchored hash is how iron-gall's gold-and-brown page
  carried a saturated green→yellow card. The hash still tells two posts apart — by where the warmth sits and
  how the field is ruled — and never by importing a colour the theme does not own. (2) `variant`
  is a SIZE, not a look: the thumb ran at 85% saturation and 2.1× strength against the hero's 62%
  and 1×, and the base layer was tinted for one and not the other, so the same post rendered as a
  saturated multi-hue diagonal on the home page and a near-flat brown wash at the top of its own
  article. One saturation, one accent floor, one base layer, one grain; the small size keeps a
  1.35× nudge because 130px of anything reads flatter than 780px of it.
- **A snippet STRIPS a tag, whole.** `stripInlineMd` removed the `#` and left the word standing,
  so a post ending "…it buys the reader a breath. #design #typography" shipped on the front page as
  "…it buys the reader a breath. design typography" — a nonsense noun phrase glued to real prose.
  DESIGN.md's hard rule is strip OR render; plain text cannot render a tag, so the whole token goes
  (the shape `isFurnitureLine` already uses). Search matching is unaffected: MiniSearch indexes the
  raw `body` and a separate `tags` field, not the stripped prose.
- **A TABLE ROW IS FIELDS, NOT A SENTENCE.** Backlink context and per-line search matches quote ONE
  CELL — the one holding the link or the term, else the first non-empty one — and the alignment row
  (`|---|:--:|`) is never quotable at all (`cleanContextLine(line, needles)`). A cell is never
  widened into its neighbours the way a bare `- [[Link]]` line is, because a table's neighbours are
  the header and the next row. Sidebar search snippets reduce a row to its cells joined by ", ".
  All of it replaces one rule that joined every cell with `" · "`, which was both unreadable
  ("Dune · Herbert · 1965 · ★★★★ · [[Read]]") and a `·` between two runs of text, banned everywhere
  else in this product for the reason the status bar gives.
- **A post whose body is only a fence gets a sentence, not an empty slot.** A shelf note (one
  ```` ```tracker ```` per thing, or one ```` ```tracker-board ````) has no paragraph to cut, so
  `postMeta` falls back to `fenceSummary()`: "A shelf of 3 trackers." / "رفّ فيه 3 من المتتبِّعات.".
  Written on the SERVER, in both languages, off `blogLocale()` — an excerpt is not chrome, it goes
  into RSS and `og:description` where there is no client to translate it (`footerLine()` is the
  precedent) — and computed per call rather than cached in `record.post`, so a language change in
  settings takes effect without every shelf note being resaved. Counts go through
  `shared/numerals.ts` like every other number on the card.
- **`--banner-tint` names how far the hash may pull the ACCENT, not how much accent to add
  back.** The generated banner's inner mix is
  `color-mix(in oklab, hsl(<hash hue>) var(--banner-tint, 0%), var(--accent))` — accent first,
  hue second. Written the other way round the token's floor value (0%, which parchment,
  sandstone, linen and solar all set at the time, and which any theme that never declares it
  inherits by omission) meant the MAXIMUM foreign hue the outer floor allows — 45% — while the dark themes
  that "clamped hardest" at 45% imported the least. That inversion is why parchment, the theme
  the accent floor was written for, shipped a pink card beside a green one on a gold-and-cream
  page. Now 0% is pure accent, a theme that forgets the token is safe rather than maximally
  foreign, and every generated field on the light themes is the room's own gold. Verified
  card-and-hero on iron-gall, parchment, cinnabar and lapis.
- **The tag-in-prose rule has a gate: `scripts/check-excerpt.mjs`**, documented in README beside
  the other gates. It writes a fixture whose body ENDS in a tag line (and whose first paragraph
  ends in two), then walks all three surfaces that share `stripInlineMd` — `/api/posts` excerpt,
  `/api/search` snippet, `/api/backlinks` context — for a de-hashed tag word, for a surviving raw
  `#tag`, AND for the sentence the tags were glued to, so a stripper cannot pass by deleting the
  paragraph. It needs no browser and deletes its fixtures however the run ends.
- **One label rule for every gesture that starts on a tree row.** `itemLabel()` (client/move.ts)
  is what the reader is shown; `MoveItem.name` stays the byte the API is called with. The drag
  ghost already used it — the Move-to picker's heading, the delete confirm's title (Sidebar and
  the palette's `delete-current` alike) and the delete toast did not, so one file wore two names
  inside two seconds: a row reading "Welcome" opening a dialog about "Welcome.md". The dialog
  BODY still prints the full path, because that sentence is about what happens on disk.
- **An empty public list says WHY it is empty, and never how much it is hiding.** With the
  languageFilter on, the blog's empty state adds one line naming the rule
  (`blogFilteredByLanguage`); `/api/me` carries `languageFilter` as a BOOLEAN policy flag and
  never a count, because a count of filtered-out notes is exactly the existence the filter exists
  to withhold. "Nothing published here yet." on an instance with twenty-one published posts is a
  true sentence about the list and a false one about the site.

## Topics and publishing are separate verbs (client/components/Sidebar.tsx)

- **Making a topic publishes nothing.** A collection's members are the notes in its folder that are
  ALREADY in `publishedSet`, plus notes carrying the tag; `collectionRows` derives categories from
  the published set, so a topic over private notes is an empty page and the library drops such a
  path entirely (`resolveLibraryPath` returns null on zero lessons). The menu row therefore reads
  "Create a topic from this folder…", never "Publish folder as a topic…" — the old label promised
  the one thing the action cannot do, and the owner lost an afternoon to it.
- **Publishing a folder is its own row**, `folderPublishAll`. It walks the tree node for `.md`
  files, skips paths already in `publishedPaths`, confirms with the count and the consequence
  named, then calls `publishNote(path, true)` once per note — the SAME route the status bar's star
  uses, never a bulk endpoint, so the two can never disagree about what `publish: true` means or
  who may write it. Offered on folders only, never on the vault root.

## Collections and categories (shared/publicFolders.ts, server/indexer.ts collectionRows, client/components/CollectionsPopover.tsx)

**FOLDER NOTES ARE WHERE A FOLDER'S FACTS LIVE (2.10).** `shared/folderNote.ts`: `folderOfNote(path)`
(a note named like its folder, or `index`/`_index`/`README` inside it; never the root),
`folderMetaOf(fm)` (title ≤80, description|blurb|summary ≤300, icon from the glyph set,
cover|banner, source, `library: book|course|series` or `true` → book, hidden). The indexer keeps
`record.folderMeta` for those notes and answers `folderMeta(folder)` by probing the candidates.
Derived categories take title/description/icon/hidden from it before the tree's mark and the
folder's name; declared collections naming a folder take its description when they have none
(`withFolderNotes`). `libraryRefs()` is THE shelf: settings rows, plus the children a SHELF ROOT
claims, plus every folder whose note says `library:` — a row naming the same folder winning field by
field and filling its blanks from the note; `lessonFoldersNow()` and the cover allowlist read the
merged list, and `LibraryPath.folder` is on the wire so the settings editor can list the derived
paths under its rows with "Customise here" (copies slug/title/kind/folder into a row). The folder
note also carries `slug:`, which the library alone reads (3.19). Settings stays the place to
override and to order; the vault is the place to declare.

**CATEGORIES COME FROM TAGS OR FROM FOLDERS (2.9).** `settings.topics` is `"tags"` (default) or
`"folders"`; `me.topics` is sent only as `"folders"`; the store's `topicsMode` empties the tag
topics in both shells (BlogShell, DesignedSite) under folders. `collectionRows()` in
server/indexer.ts is THE list of collections: the declared rows, plus — under folders — one derived
row per parent folder of a published post (templates and library lessons make none; a root note has
no parent), title `libraryTitleOf(folder)`, mark `settings.folderIcons[folder] ?? "archive"`, slug
from the title made unique in path order (stable across requests), id `a` + sha1(folder)[:12].
UNDER FOLDERS THE DECLARED ROWS ARE SET ASIDE WHOLE (kept for switching back): the folders are the
categories, a folder note renames, describes, re-marks or hides one, the settings panel shows no
collections block and the tree offers no collection verbs (2.10.1 — the owner met the two side by
side as "kinda confusing"). Under tags, collections are hand-made topics beside the tag topics.
`auth.ts` builds `me.publicFolders` from `collectionRows()` and treats the feature as ON under
folders whatever the master switch says.

**A COLLECTION IS A TAG PAGE (2.11).** Under tags, `collectionRows()` = settings rows (legacy,
still honoured) merged with `tagPageCollections()`: every note under `tagsFolder()` whose
frontmatter says `collection: true`, read through `folderMetaOf()` (title, description, icon,
hidden, `folder:`), the tag being the page's own name (`tagKey`), slug `folderSlug(tag)` else
`suggestSlug`, id `t` + sha1(tag)[:12], mark `icon ?? "tag"`. `PublicFolderRef.tag` /
`PublicFolderCard.tag` carry the tag; `effectiveFolders(declared, path, rows, tags)` counts a note
carrying the tag as a member; both shells drop a claimed tag's own topic chip so it is not listed
twice. `GET /api/collections` (admin) answers the merged list — the tree's popover ticks against it,
writing `tags:` for a tag collection and `folders:` for a legacy row; "Publish folder as a topic…"
writes the tag page itself through `createNote` + `/api/frontmatter` (collection, folder, icon,
title, description), so nothing lands in settings. The settings panel keeps its rows for
overrides and lists the vault-declared ones read-only beneath them.

**A COLLECTION CAN NAME A FOLDER.** `PublicFolderRef.folder` (vault-relative, `vaultFolderPath()`,
boundary at the slash): `effectiveFolders(declared, path, rows)` (shared/publicFolders.ts) is what
`postMeta()` and `publicFolderCounts()` read, so a note under the folder belongs without
frontmatter and frontmatter still adds strays. The tree's folder menu has **Publish as a
collection…** and the note menu **Collections…** (client/components/CollectionsPopover.tsx, lazy):
the note popover reads the note's `folders:` with the client parser (client/collections/foldersOf.ts,
same spellings as the server's) and writes through `/api/frontmatter` as a `list` value (or removes
the key when empty); folder-backed memberships show ticked and disabled ("Whole folder"). Making
a collection from a folder takes the folder's tree mark, a fresh slug, and switches the feature on
when it is the first. The settings row has a folder chooser (`pickFolder`) and an unlink button.

## The site design engine (`publicLayout: "designed"`)

`settings.publicLayout` has a THIRD value. `"blog"` (the default) is the stock blog;
`"designed"` composes the visitor shell from a design document in `ASTROLABE_DATA/designs.json`.
Which one a session is SERVED is `servedLayout()` in `server/auth.ts`, not the setting: it
downgrades `"designed"` to `"blog"` whenever there is no renderable design, so the fallback
happens before the first byte and the browser never has to recover from a missing one.

**THE STOCK BLOG IS A PRISTINE, SEPARATE, ALWAYS-WORKING BASE, and that is checkable from the
diff.** `client/styles/blog.css` is untouched. `client/blog/*` is untouched except five lines in
`BlogShell`'s `ThemeButton`, which belong to the CUSTOM THEME feature rather than to this one
(`themeGroup`/`counterpartTheme` → `choiceGroup`/`counterpartChoice`, so the ☾/☀ button answers
for a custom theme as well as for the built-ins). The designed shell is a SECOND renderer beside
the first — `client/design/`, with its own routing, its own section components and its own
stylesheet, every class `s-dsn-*` — and the two meet at exactly one `if` in `App.tsx`. Nothing
in `client/design/` mutates, forks, subclasses, monkey-patches or re-styles a stock component;
what it DOES reuse is the product's shared, pure machinery (the reading renderer, the banner
helpers, the nav singleton, `formatDate`), because a second markdown renderer is the place an
XSS fix would fail to land.

**Switching is LOSSLESS in both directions.** The design lives in its own file and is never
consulted while `publicLayout` is anything else, so flipping to `"blog"` is a RESCUE — nothing
deleted, nothing migrated — and flipping back returns the site exactly as it was. That is what
lets the error boundary offer "back to the stock blog" as a one-click escape rather than a
decision. `scripts/shoot-design.mjs` asserts the round trip byte-for-byte.

### Why `designs.json` and not more keys in `settings.json`

Asked and answered, and the answer is not tidiness (the argument is written out at the head of
`server/designs.ts`):

1. `getSettings()` is on the hot path — `siteName()`, `siteLanguage()`, `publicLayout()` consult
   it per request through one mtime-cached parsed object. A design document is one to two orders
   of magnitude larger, and a dozen custom themes larger again.
2. `patchSettings()` rewrites the ENTIRE raw object on every save (by design — it preserves
   unknown keys). Nesting designs there means a one-character tagline edit rewrites every design,
   and one interrupted rename risks both.
3. Corruption has to be survivable INDEPENDENTLY. A corrupt `settings.json` already degrades to
   "env defaults in effect"; a corrupt design file must degrade to the stock blog — and if they
   are one file, a stray byte in a section's markdown takes the site name, the language and the
   publish configuration with it.
4. Versioning, migration and quarantine are file-level concerns `settings.json` has never needed
   and would grow only for this.
5. Export/import is a whole-file operation on a design and a nonsense one on settings.

What stays in `settings.json` is the one thing that IS a setting: `publicLayout`. WHICH design is
active lives beside the designs, so a renamed or deleted design cannot leave `settings.json`
naming something that is not there.

`designs.json` is `0600`, written write-then-rename with a per-writer tmp name, and read through
an mtime-checked cache — the three properties `settings.ts` documents next door, for the same
reasons.

### The schema, migration and quarantine

`DESIGN_SCHEMA` (`shared/design.ts`) is the version this build authors and renders, and a
document declares its own — PER DOCUMENT, not per file, because an imported design carries its
own and one stale import must not quarantine the designs beside it. There are exactly three
outcomes and never a fourth:

- equal → validated and rendered;
- older with a registered step in `MIGRATIONS` → migrated, then validated. The step that exists
  today is `0 → 1`: a document with no `schema` key at all, which is what a hand-written or
  third-party design looks like. Nothing in it can be MISunderstood — the fields we do not find,
  validation supplies — so it migrates rather than quarantining;
- anything else (older with no step, or NEWER than this build) → **QUARANTINED**: kept on disk
  byte-for-byte, never rendered, listed in the panel with the reason. A design authored by a
  newer Astrolabe must not be rendered "as best we can": this build would silently drop the keys it
  does not know, and a public homepage losing a section without anybody being told is precisely
  the invisible failure the whole feature is written against. `persist()` writes a quarantined
  row back exactly as it was read.

**Validation is a strict allowlist twice over**: an unknown section `kind` is a 400 naming it,
and an unknown KEY inside a section is a 400 naming it (`KIND_KEYS`). Every value is
range-checked, every string is stripped of control characters and bidi overrides
(`shared/bidi.ts` — this text renders into the public page beside note titles), an image
reference must be an `https://` URL or a safe vault image path, and a CTA link must be
site-relative or `https://` — a homepage button is not a place that accepts `javascript:`.
Prototype keys (`__proto__`, `constructor`) hit the allowlist like any other unknown key.

**A REJECTION IS A NAMED 400, AND THERE ARE TWO CLASSES THAT MAKE ONE.** `shared/design.ts` throws
`DesignError(path, …)` for the document tree; `shared/designChrome.ts` throws its OWN
`DesignError(path, code, …)` for the chrome, and `validateDesign()` calls `validateChrome()`, so
both escape from a single write. `server/designs.ts::bad()` knew only the first, so every chrome
rejection failed the `instanceof` test, was rethrown, and reached the generic handler as a **500
with no message** — one file rejecting two different ways depending on which half was malformed,
which is the opposite of what this section promises. Measured then: a bad nav `kind`, a nav nested
three deep, `{"kind":"url","target":"javascript:alert(1)"}` and `{"typography":{"baseSize":"big"}}`
all answered 500 `{"error":"Internal server error"}` while a bad section answered a correct 400
naming the path. `isRejection()` now lists every class a validator is ALLOWED to throw, by name,
in one predicate — `DesignError`, the chrome's (imported as `ChromeError`), `ThemeError`,
`QuarantineError` — and the same import fixes the quarantine reason a step below, where a
hand-written `designs.json` with a bad nav item listed as "unreadable design (…)" instead of its
own sentence. Measured after: `nav.items[0].kind must be one of: home, note, page, topic, url,
group`, `nav.items[0].target must be an http(s) or site-relative URL`, `typography.baseSize must
be a number`, each a 400.

**"Every string" MEANS BOTH VALIDATORS, and for a while it meant one.** `shared/design.ts` stripped
bidi in `text()` and `block()`; `shared/designChrome.ts::strictText` — the validator behind every
nav label, group label, footer column title, footer entry label and `footer.copyright` — stripped
only `[\u0000-\u001f\u007f]` and let `U+202A–202E` / `U+2066–2069` through, as did `cleanText`
beside it and the custom theme's `name` (whose own doc comment claimed otherwise). Measured: a
design imported with the nav label `"safe\u202Eevil"` and the copyright `"\u2066hidden\u2069 c
2026"` stored both intact, `GET /api/design/public` handed both to a cookieless visitor, and the
public header drew that menu item as `safelive`. A design document — including one imported from a
stranger's `.json`, which is the same file as a shipped preset — could put a label on the public
header whose displayed text differs from its stored text and which reorders the glyphs after it.
The codebase already knew the rule; one validator was missed. `designChrome.ts` now imports
`shared/bidi.ts` (which is purer than it is: a regexp and a replace), and so does `customTheme.ts`.

**The client validates AGAIN before it renders a byte**, with the same shared validator. A
`designs.json` edited by hand past the API is a supported way to configure this product (it is
the same escape hatch `settings.json` has), and a server one build ahead of a cached bundle is a
real state; neither may put a malformed section in front of a visitor.

### Routes

Mounted at `/api/design` from `server/api.ts`, BELOW `authGuard`, so every mutation is already
401 to a visitor and to an admin wearing the preview header. Reads add their own gate —
`assertAdminRead()` answers **401** under preview mode, which is the honest answer to "may I read
the design panel while asking to be treated as a visitor".

- `GET /api/design` — the admin overview: designs (with quarantine reasons), themes, the section
  kinds and the token table the panel builds its menus from, and `posts` — the VISITOR's feed, so
  the previews draw the site the design will actually print rather than the list this session can
  read (see "Preview content" above).
- `GET|PUT|DELETE /api/design/docs/:id`, `POST /api/design/docs`,
  `POST /api/design/docs/:id/{duplicate,reset}`, `GET /api/design/docs/:id/export`,
  `POST /api/design/docs/import`, `PUT /api/design/active`.
- `POST /api/design/themes`, `PUT|DELETE /api/design/themes/:id`.
- **`GET /api/design/public`** — visitor-safe, and the one route with a per-session shape.
- **`GET /api/design/themes.css`** — the generated custom-theme stylesheet. In `OPEN_PATHS` for
  `custom.css`'s reason: pure styling, no vault content, and the login page of a `PUBLIC=false`
  instance should be painted in the colours that instance chose. `immutable`, because its link
  carries a content signature as `?v=`.

**`/public` blanks a `note` section's PATH for a session that may not read it** rather than
dropping the section. Both halves matter: the path never travels, so a design cannot become a
"does this note exist" oracle for the publish set or the language filter; and the section still
ARRIVES, so the renderer meets something it cannot render and the boundary does what it does for
every other broken design. Dropping it instead would have shown visitors a silently shorter
homepage — the invisible state this product keeps refusing.

### THE ERROR BOUNDARY

A correctness feature, not a nicety, and it is gated: `scripts/shoot-design.mjs` breaks the site
three ways on purpose and measures what each session gets.

An invalid config, a deleted note a section points at, or a render-time throw all end in one
answer:

- **a visitor** gets `<BlogShell />` — the stock component, unmodified, no props — automatically.
  Never a blank page and never a stack trace. The gate measures rendered TEXT, not markup length,
  because "blank" and "slow" look identical otherwise.
- **the owner** (an admin previewing their own site, `store.previewVisitor`) keeps the designed
  page with the failing section replaced by a card that NAMES it, under a strip carrying
  "Back to the stock blog" — which is `PATCH /api/settings {publicLayout:"blog"}` and nothing
  else, so it is lossless.

The boundary is **per section**, not per page: a boundary that catches everything can only say
"something broke", and React only knows which child threw if the boundary is that child's own
parent. Boundaries are keyed on `design.updatedMs`, so a fixed design clears every failure card
without a reload.

**Three doors reach it, and the server closes two of them earlier.** A corrupt or quarantined
store never reaches the browser at all (`servedLayout()`), and `/api/me` carries a
`designNotice` to a REAL admin session — never to a visitor, never to an admin in preview — so
the owner is told in the app, where they actually are, rather than only on a page they are not
looking at. That notice also covers the case the server can see and the boundary cannot reach in
time: a valid design whose `note` section points at a note that has since been deleted,
unpublished or language-hidden.

### Custom themes (`custom:<slug>`)

A custom theme is **not one more block in `tokens.css`** and never becomes one. It is
`{ base, tokens }` — one of the built-ins plus a SPARSE map of overrides — applied by putting the
BASE's id on `<html data-theme>` and the theme's slug on `<html data-custom-theme>`, which
`/api/design/themes.css` keys at `:root[data-custom-theme="…"]`. That selector is (0,2,0) against
`[data-theme="…"]`'s (0,1,0), so an override wins and nothing else moves. Three consequences, and
each is why this shape beat "generate a whole theme block":

- `tokens.css` is never rewritten, never parsed, and never shipped to the server;
- a theme that overrides four tokens stays four tokens on disk, so "reset this token" is a
  DELETE rather than a re-derivation, and an upstream retune of the base reaches every custom
  theme built on it;
- a base theme removed from the product is a loud validation failure at read time, not a room
  with half its tokens missing.

`client/design/customThemes.ts::applyThemeChoice` is the ONLY writer of both attributes — the
picker's live preview, the store's `setTheme` and the builder's preview all go through it.

**The id is `custom:<slug>` everywhere a theme id is spoken**: `settings.defaultTheme`,
`DEFAULT_THEME`, `localStorage["astrolabe.theme"]`, the picker, the palette dot. The prefix is what
lets every existing `isTheme()` guard keep meaning exactly what it meant (a BUILT-IN theme) while
new callers ask `isThemeChoice()`. `client/themes.ts` grew `choiceGroup` / `counterpartChoice` /
`choiceBase` / `choiceLabel` for the surfaces that must cope with both; `Theme` is unchanged.
`readEnvTheme()` accepts the SHAPE at startup (it runs before `dataDir()` has a value, so
`designs.json` cannot be consulted without a cycle) and `/api/me` withholds a `defaultTheme` the
instance no longer has. `PATCH defaultTheme` checks existence, because a default theme naming a
deleted one is a public site quietly painted in the fallback.

**A stylesheet refresh needs a fresh SIGNATURE, not just a fresh registry.** The route is
`immutable`; refreshing the theme list after a save while leaving the link's `?v=` alone means
the browser answers from cache and the theme just saved renders as its bare base — measured
exactly that way (`data-custom-theme="foxfire"` on the document, `--accent` still nocturne's).
`reloadCustomThemes()` computes the signature with the SAME shared function the server uses, so
no round trip is needed to learn a string both sides can derive.

**Deleting is guarded**: a theme a design still names is a 409 naming the design — the same
in-use rule the font routes follow, because a dangling reference is a site rendered in a theme
nobody chose.

### The contrast rules are ONE implementation

`shared/contrast.ts` holds the sRGB luminance, the WCAG ratio, the CIELAB conversion, the CIE76
ΔE and every floor. `scripts/check-contrast.mjs` imports it (Node runs `.ts` directly) and so
does the theme builder, which prints the same warnings live while an author drags a colour. A
builder carrying its own copy of the formula is a builder that will one day bless a theme the
gate rejects — and that is the theme that ships.

The gate also gained a ground it never had: **`--text` and `--text-muted` are now checked against
`--bg-hover` as well**, because `--bg-hover` is a real ground (DESIGN.md paints the sidebar's tag
pills and the backlink cards on it at rest) and both tokens clear it in every theme.
**`--text-faint` is deliberately held to two grounds**
(`FAINT_GROUNDS`): faint-on-hover measures 2.7–3.0:1 in most rooms, and those are not
bugs — DESIGN.md already names `--bg-hover` as the tag pill's ground and says in the same
breath that faint measures 2.7:1 there, which is exactly why the pill's COUNT is `--text-muted`.
Adding the third ground would have failed most of the shipping themes to enforce a rule the product
does not have; the rule it does have — faint never carries reading text — is already enforced on
the two grounds faint is painted on.

### The builder

`client/components/ThemeBuilder.tsx`, mounted on `<body>` like the theme picker and the toast,
opened from the picker's header ("New custom theme") and from a pencil on each custom row.

- **The preview is the app.** Edits are written to a `<style>` element under a reserved
  `__preview` id and applied to the live document — the picker's rule, for the picker's reason.
  The CSS comes from the SAME generator the server serves, so what is on screen is byte-identical
  to what will be served after Save. Closing restores the theme that was in force.
- **The base is chosen by looking at it.** Twenty-one swatch cards painted from the CONSTANT
  `--swatch-<id>-*` tokens, not a `<select>` — the rule the settings panel states about native
  chrome, and the same argument the theme picker makes about naming pigment nouns with
  nothing saying what any of them looks like.
- **Unset is a real state.** Every row shows the value it INHERITS and offers a reset that
  deletes rather than re-derives. The inherited values are read off the live document through a
  probe element carrying `data-theme`, never from a table in the client: a second definition of
  the built-in themes would go stale the first time one is retuned, and the probe also picks up a
  `custom.css` that legitimately changed a base.
- **The warnings are the gate**, in words, above the controls that cause them, with a dot on any
  token group holding a failure. A rule the author cannot see is a rule they will break.
- Export writes a `astrolabe.theme` JSON file; import reads one into the DRAFT (never straight into
  the store), so the author sees what arrived, live, before anything is saved.

### The arrangement fields: a section decides its SHAPE, never its colour

Four enums on three section kinds, and each one exists because the engine had exactly ONE answer
where a designer needs several. Every value below decides position, rhythm and weight; not one of
them decides a hue, so the twenty-one themes are still twenty-one themes.

| field | values | what it decides |
| --- | --- | --- |
| `postList.layout` | `river` · `ledger` · `index` · `numbered` · `dateline` | how a run of writing is set |
| `postGrid.card` | `boxed` · `bare` · `overlay` · `ledger` · `masonry` | what one post looks like |
| `hero.treatment` | `panel` · `band` · `split` | the shape of the opening |
| `divider.style` | `rule` · `dots` · `ornament` · `blank` | the mark between two runs |

**The first value of each is what shipped before it, byte for byte.** They are enums with a
default rather than a schema bump, so a `designs.json` written by an older build validates and
comes back drawing what it drew yesterday — `oneOf()` supplies the value it does not find, and
`KIND_KEYS` carries the new key so the strict allowlist lets it through. `tests/designStructures.
test.ts` pins both halves, including the named 400 an unknown value earns.

**A renderer restates the default anyway**, in `client/design/Sections.tsx` and
`DesignThumb.tsx`. A section reaches a renderer down two roads: through `validateSection()`, which
fills every key it did not find, and — for the gallery — through `presetDesignDoc()`, which
CLONES a preset's literal sections and hands them to a canvas unvalidated. A field added after the
shelf was written arrives `undefined` on the second road, and `s-dsn-list--undefined` is a card
that draws nothing.

Three of the four are worth naming for what they refuse:

- **A band never invents artwork, and it is as tall as its own type.** `panel` paints
  `generatedBannerCss()` when the author named no image; a band is ground and type by definition —
  the opening for a site with no photograph — so it paints `--bg-raised` and stops. An image the
  author DID supply is still honoured: a treatment that discards authored content to make a point
  is not a treatment. It also drops the 200/360px `--short`/`--tall` floors, which exist so a
  PHOTOGRAPH has room to be one: with no photograph they drew a field of ground with two lines
  adrift in the middle of it, and a design whose scale is deliberately flat opened on what read as
  an unstyled placeholder. Height is padding plus type; the title is the design's own h1 × 1.5;
  and the band carries a `--border` hairline above and below, because `--bg-raised` against `--bg`
  is a whole tone apart on `porcelain` and nearly nothing on `sumi`, and a shape that has to
  survive twenty-one palettes is drawn with a rule. (The `banner` masthead closes itself with the
  same hairline, for the same measurement.)
- **A split hero borrows the newest post's picture**, and only a split. A preset may not name an
  image, so the one cell the treatment exists for opened on a generated gradient on every fresh
  install — a placeholder in the centrepiece. The renderer takes the first banner in the feed
  instead: it is the author's, it changes when they publish, and it is the picture the first card
  underneath is already carrying. An authored `image` still wins and a vault with no banners at
  all still gets the generated field. `panel` and `band` are excluded because their picture sits
  BEHIND the words, and a real photograph under a headline is a contrast argument this engine
  cannot win against a vault it has never seen; a split's plate carries no type at all.
- **An overlay's text colours are LITERALS — while there is a photograph under them.** The words
  rest on a fixed dark scrim rather than on the theme, exactly as the stock blog's author-site
  cards do (`.s-blog-sites__body`) and for the same reason: `--text` on `parchment` is near-black,
  and near-black on a scrim tuned for light type is an unreadable card in half the palettes. Same
  three values as the blog's, so the two surfaces are one decision. It drops the excerpt besides,
  because four lines of body copy over a photograph is the arrangement that makes the title
  unfindable. The card is a PROPORTION and not a height (`aspect-ratio: 5 / 4`): a 190px floor
  cropped every photograph in the vault to a 770×255 letterbox at two across a wide page, which is
  a row of banners rather than a hang.
- **The two picture-shaped cards refuse invented artwork.** `overlay` and `masonry` used to insist
  on a picture and generate one where a post had none — right for a 128px strip above a title,
  fatal at plate size. Both now render `s-dsn-card--plateless` instead: a masonry card becomes a
  LEAF (hairline, air, the title at the design's h2, centred, its own natural height so the ragged
  column bottoms survive a vault with gaps in it) and an overlay becomes a wall LABEL (same 5:4
  field, scrim dropped — a fixed dark gradient over the theme's own ground is a stripe, and the
  literal-colour licence above is spent on an unpredictable photograph that is no longer there —
  with the words centred on `--text`/`--text-muted`). A `bare` grid with `showBanner` off keeps the
  h2 rule for the same reason: there is nothing else on the card to be bigger than. The other card
  shapes still obey the operator's `bannerFallback` exactly, and ALL of them still generate inside
  the preset gallery's canvas, where `forceGeneratedBanners` is set — 200px of an unknown vault is
  not the place to judge an image-forward design by its type.
- **A bare card's date is pushed to the FOOT of its track, but only when it is the last thing on
  the card.** A bare card has no edge, so nothing lines a row up but the words in it, and three
  titles running to one, two and three lines put three dates at three heights — a grid that has
  come apart. Where an excerpt follows the date, the rule is off: bottom-aligning then opens 50px
  of nothing between a headline and its own byline to line up three bylines, which is a worse
  trade. The card also resolves `dir` ONCE, on `.s-dsn-card__body` rather than per child, so a
  mixed-script wall stops setting an Arabic title at one edge and its date at the other; the meta
  line's two items are `<bdi>`, so the LINE takes the card's direction while "1 min read" keeps
  its own and is not reordered into "min read 1".
- **A numbered run's ordinal is `--text-faint`, against the rule that sends a count to
  `--text-muted`.** That rule's case is the topic chip: 0.72rem on `--bg-hover`, where 1.4.3 gives
  no relief. This is the other case the contrast gate spells out — bold and never below 1.3rem
  (20.8px, past the 18.66px bold threshold), so the large-text clause applies and the token's
  enforced 3:1 floor on `--bg` IS the applicable minimum. It is `aria-hidden` besides: the `<ol>`
  already tells a screen reader this is the nth of n, and the numeral is the typography of that
  fact rather than a second statement of it. The figure itself goes through `localeNum()`.

**The ornament is the reading view's divider, drawn by the same idiom** — a 2px accent rule fading
at both ends with the wordmark's ✦ over a gap in the middle (`reading.css`, `.s-rv-hr--orn`). The
argument written there is the reason it is here: a divider is CONTENT and may never be
`1px solid var(--border)`, which is the h1 rule, the byline rule and `.s-dsn-div--rule`. One
detail differs deliberately: the mark is centred with auto inline margins between two zeroed
inline insets rather than with `inset-inline-start: 50%` + a physical `translate(-50%, -50%)`,
because that pair centres in LTR and lands a glyph-width off centre the moment the page mirrors.

**Two layouts are whole-row links** (`ledger`, `index`) because they are single lines of type: a
six-word hit area inside a 44px row is the phone failure the coarse-pointer rule exists to
prevent. Both keep `min-height: 44px` under `(max-width: 700px), (pointer: coarse)`, the ledger's
date column collapses at 390 rather than leaving four words beside a date, and the index's leader
is `display: none` once the title is allowed to wrap — a row of dots under a two-line title reads
as a mistake.

**A dateline groups by the day it PRINTS**, not by the day it parses: the key is the formatted
string, so the run breaks where the reader sees it break, in this instance's own calendar, Hijri
included, and never on a UTC boundary the page does not show. Its kicker is uppercase and tracked
— and `letter-spacing` is reset under `:dir(rtl)`, because Arabic is cursive and tracking pulls
the letters of a joined word apart into something that reads as a fault. `text-transform:
uppercase` is merely a no-op there; this is not.

**A dateline's rows print a headline and NOTHING else**, and the run sets itself in COLUMNS. The
kicker carries the date for everything under it — that repetition is what a dateline exists to
delete — and the first cut then printed the reading time on every row instead, which is the same
repetition in web furniture: twenty-eight headlines each followed by "1 min read" under a kicker
that had already said the only thing there was to say. `PostMeta_` lost its third mode with it.
The run is `columns: 24rem 2` with a `column-rule` in `--border` and `break-inside: avoid` on each
day: a WIDTH first and a count second, so the split is the page's decision rather than a
breakpoint's — a 1240px broadsheet takes two tracks, a 640px column takes one, a phone takes one,
and no media query says so. Two is the ceiling on purpose; three tracks of headlines on a 1400px
page is a stock ticker. It mirrors for free, because CSS columns flow in the writing direction.

### The chrome fields: a masthead, a menu, an ending, and the paper under all three

Four more enums, on the CHROME rather than on a section, and they follow the arrangement fields'
rule exactly: each decides position, rhythm and weight, none decides a hue.

| field | values | what it decides |
| --- | --- | --- |
| `header.layout` | `stacked` · `stackedStart` · `inline` · `rule` · `banner` | where the identity sits, and what it sits in |
| `chrome.surface` | `flat` · `ruled` · `grid` · `tinted` · `paper` | the paper the whole site is printed on |
| `footer.form` | `columns` · `colophon` · `grand` | the shape of the end of the page |
| `nav.style` | `plain` · `pills` · `underline` · `brackets` | how one menu item is drawn |

**The first value of each is what shipped before it, byte for byte** — enums with a default on a
LENIENTLY-NORMALIZED key, so a `designs.json` written by an older build validates and comes back
drawing what it drew yesterday, and no schema bump is spent. `surface` is the one that had to argue
for its address: it lives on `chrome` and not on `site` because `site` is a closed allowlist whose
keys ARE a bump (`shared/design.ts`). `tests/designChromeShapes.test.ts` pins both halves — absent
is the old page, an unknown value is a 400 that names the field, and the two validators agree on
what is legal and differ only in what they do about an illegal value.

**`rule` and `banner` add no markup.** They are the stacked tree wearing two more classes, which is
the test a new masthead has to pass to be a LAYOUT rather than a component: needing its own elements
means it is not arranging what is there. Only `inline` earns a second tree. Two details are load
bearing: `rule` takes the `divider` switch out of play by declaration order (its own bottom hairline
is already the second of three rules in 120px, and the author who turned the switch off must not
lose the shape they picked the layout for), and `banner`'s ground is a `::before` at `z-index: -2`
rather than a `background` — `.s-dsg-head` carries `isolation: isolate` and hosts the ambient layer
at `-1`, so a background on the element itself would have quietly turned the stars off on `sidereal`.
`banner` also closes itself with a `--border` hairline: "the field's own edge is the rule" holds on
`porcelain` and fails on `sumi`, `murex` and `iron-gall`, where `--bg-raised` sits a couple of values
off `--bg` and the one masthead that is a GROUND is, in the dark, no masthead at all.

**A bar with no links is not rendered at all.** `nav.fallback: "none"` with no items makes
`DesignNav` return `null` — a real design, and one this collection ships — and the `<nav>` around it
used to survive: a hairline, a 1100px row and the search box thrown to the far end of it by
`.s-dsg-nav__tools`'s `margin-inline-start: auto`, which reads as a menu that failed to load rather
than as the refusal it is. `DesignHeader` computes the same predicate the nav does (`items.some(i =>
!i.hidden) || topics.length > 0`), because a component that renders `null` cannot be asked whether
it did, and when it is false the bar is skipped and the tools ride inside the masthead under the
identity on the identity's own alignment. They keep `.s-dsg-nav__tools` for their look and take a
two-class `.s-dsg-head .s-dsg-head__tools` to cancel that auto margin; `inline` gets the reverse
(`.s-dsg-head--nomenu` restores it), because on the one masthead that is already a row the far end
is exactly where they belong.

**A grand footer's row is the FOOTER's own entries, never the header's menu.** A footer reaching
into `nav.items` would print the masthead twice on any design whose menu is the topics fallback — a
list that changes as the author writes — and would make the footer's own columns dead weight the
moment the form was chosen. `colophon` and `grand` share one tree (`.s-dsg-foot__run`) and differ in
how it is SET; the separator between two columns in both is a `border-inline-start`, never a middle
dot, for the reason the status bar gives: the Eastern Arabic zero is itself a raised dot. `colophon`
is the one place a form overrules another control — it ignores `footer.align`, because centring is
the entire typographic argument and `columns` is one segment away.

**The nav styles dress the BAR and not the submenu.** A dropped card of pills is a control panel and
brackets inside a floating menu read as syntax, so `.s-dsg-nav__sublink` is untouched by all three.
`brackets` is the only one that changes the FACE, to the design's own `--dsg-mono-font`, because a
bracket in a proportional face is punctuation and a bracket in the mono stack is a prompt.
**The brackets mirror themselves**: both characters are `Bidi_Mirrored` and the link carries
`dir="auto"`, so an Arabic label resolves the link to `rtl` and two things flip at once — the
`::before` box moves to the reading start and the glyph in it mirrors. Measured on the Arabic
instance with a deliberately mixed bar: every item reads as a bracketed item and none draws a
backwards bracket. `underline` carries its rail on every item as `transparent` rather than adding it
to the active one, because a border appearing on hover moves the whole row by 2px.

**A surface is a WHISPER, and that is a measurement rather than an alpha.** The pattern is a
`background-image` on the scrollport (`background-attachment: local`, so it scrolls with the content
like a printed rule rather than sitting still behind it), which means no computed style can report
the colour a word is on. So the numbers were read off pixels the way the ambient layer's were: the
page's own gutter screenshotted, the PNG decoded, every distinct painted colour enumerated, and the
one giving `--text` its lowest ratio taken as the worst ground — the crossing of two rules on a
grid, of three hatchings on a laid sheet. Across five surfaces × five rooms: worst `--text` 11.25:1,
worst `--text-muted` **4.70:1** against its 4.5 floor, worst `--text-faint` 3.02:1 against the 3:1
that token is held to. **The first draft failed this**: one ink at 7% everywhere composited to 13.5%
at a grid's intersections and put parchment's muted at 3.88 — a token that carries an excerpt pushed
under its floor by a decoration. The inks are now set per surface so the worst OVERLAP lands near
3.4% (3.5% once, 1.7% twice, 1.2%+1%+1% three times), and the whole table is in `design.css` beside
the rules that draw it.

**Chrome that pins gets a ground; chrome that does not is transparent.** `.s-dsg-top` and
`.s-dsg-nav` painted `--bg` unconditionally, which is invisible on a flat site and a rectangle
punched out of the paper on every other surface. Both are transparent now — byte-identical on
`flat` — and `--dsg-ground` (which follows the surface) comes back on the one state that cannot do
without it: a bar pinned over scrolling content.

**ONE SECTION LEAVES THE COLUMN, AND IT SAYS SO IN ITS NAME.** `hero.treatment:
"cover"` runs a photograph the full width of the CONTENT AREA with the site's name over it — the
opening the stock blog's dashboard has had since before this engine existed, and until it landed the
one front page an Astrolabe author is most likely to already have was the one a design could not
reproduce. It arrived from a question rather than a feature request ("is the original design a
template, or is there a way to move back to it?"): the way back always existed, but there was no way
to start from what you had.

Full bleed is `calc(50% - 50cqw)` against a container declared on `.s-dsn-main`, not `100vw`. The
usual spelling fails twice — it counts the scrollbar, so a page that scrolls vertically gains a
horizontal scrollbar, and it ignores the shells, where the page is inset by a rail and the window's
edge is not the content's edge. Measured across five shells × three widths: the cover lands on the
content edge with a 0px gap on both sides and 0px of horizontal overflow, fifteen times out of
fifteen. (`container-type: inline-size` makes `.s-dsn-main` a containing block for absolutely
positioned descendants — which is safe only because the sky layers and the chrome are its SIBLINGS,
and were before the line existed.)

**A COVER ALSO SUSPENDS "NEVER AN EMPTY IDENTITY".** `DesignHeader` forces the wordmark back on
whenever there is no logo, which is right and shipped for a reason — but a cover prints the site's
name across a photograph forty pixels below it, so the rule printed the name twice. `namedElsewhere`
is the page telling the header the identity is handled; it only ever RELAXES the rule, never blanks
a masthead the author asked to see, and it is false on an article route, because a site that forgets
its own name two clicks in is worse than one that says it twice.

**AND A THIRD AXIS, WHICH IS THE ONE THAT MOVES WALLS.** `surface`, `scenery`, the faces, the runs
and the card shapes are all decisions about what is ON the page — and every one of them was made
inside the same room: a masthead over one centred column over a footer, which was the shape of every
design in this catalogue. Eighty finished houses and one floor plan is why they read, to the person
who commissioned them, as "changing colours and rearranging things". `chrome.shell` is the room:

- `stack` — the masthead over the column over the footer. Every design that existed before the
  field, and still the right answer for anything that wants to read like a page.
- `rail` — a standing side column, and the menu becomes a LIST rather than a row. That is the
  feature and not a styling of it: a row wraps at eight items and a column does not, so this is the
  only shell a site with twenty topics can use, and it never leaves the window.
- `dock` — the chrome comes OFF the page: one floating translucent pill over content that runs
  full-bleed underneath it. The only arrangement in the engine where the page passes UNDER chrome.
- `split` — a panel that does not scroll at all, against a column that does. Two speeds on one
  screen, and the still one is the one with the name on it.
- `console` — a gutter rather than a rail: narrower, ruled, monospaced, uppercase. The one shell
  that reads as a machine rather than a publication.

**IT IS ONE FIELD BECAUSE IT MOVES FOUR THINGS AT ONCE** — where the identity sits, whether the menu
is a row or a list, what scrolls and what does not, and where the reading column is on the screen. A
design that could set those independently would be a design with fifteen broken combinations in it.
`chrome.frame` is the separate, composable question of what a BLOCK is sitting in (`plain`, a
`window` with a title bar and three dots, or `float` with no border and a shadow).

**WHAT A SHELL MAY NOT DO IS TOUCH THE SECTION VOCABULARY.** `DesignedSite` composes exactly one
tree in every shell and each shell is an arrangement of it, so a section, a card, a run and an
article are correct in `console` without knowing the word exists. That is the test a new shell has
to pass: if it needs its own renderer it is not a shell, it is a second site.

**THE THREE SIDE SHELLS TAKE THE CHROME OUT OF FLOW, and the grid was the first cut and the wrong
one.** `.s-dsn` became `grid-template-columns: rail 1fr` with the chrome spanning every row, which
places correctly and sizes wrong: a spanning item with `block-size: 100dvh` contributes that height
to the tracks it spans, so the split panel inflated the first content row and pushed the entire page
below the fold — an empty column beside a full one, measured on a screenshot. `position: fixed` plus
a `padding-inline-start` the width of the rail has no tracks to inflate, lays the page out exactly
as `stack` does, and leaves the scenery layer its own box — which matters, because the sky's mask is
`(100% − --dsn-width) / 2` against ITSELF, so a sky spanning the window in a railed shell would
clear a band down the middle of the WINDOW rather than down the middle of the writing. Both
properties are logical, so the whole arrangement mirrors in an Arabic instance with no second rule.

**ON A PHONE THERE IS ONE SHELL.** A rail, a fixed panel and a gutter all want a second axis of
screen and a phone has none, so under 900px all four collapse to `stack` — one media query rather
than four, because "there is no room for a rail" is one fact. The design still arrives as its type,
its arrangement, its ground and its world, and the panel's own hint says so rather than leaving an
author to discover it on their phone.

**`DesignThumb` DRAWS THE ROOM**, and `silhouette()`'s collision key folds `shell` in beside
`surface` and `scenery`. A rail, a floating bar and a fixed panel are three different CARDS before a
reader has read a word of one — it is the loudest term the miniature carries. `frame` is in neither,
for the reason `nav.style` is not: at 200px a title bar on a card is a card.

**A HOUSE HAS A SIGNATURE, AND IT TRAVELS WITH THE DESIGN.** Every axis above is a dial an author
can turn, and a dial cannot say "this is the newspaper" — it can only say `stack`, `ruled`,
`bare`, `asterism`, which is what any of eighty designs might also say. `chrome.signature` is the
one key that names the house: a portable art direction (`CHROME_SIGNATURES`, `none` by default and
the id of each signature preset otherwise) that a fork, a rename, an export and an import all carry
unchanged, and that `normalizeChrome` folds back to `none` when it does not recognise. Both
renderers and the thumb print it as `data-signature` on their root, and `client/styles/signatures.css`
(shared details) with `signature-studio-{a,b,c,d}.css` (each studio's openings) key on THAT and never
on a document id or a theme — so an author who applies Mission Control and then recolours it, reorders
it and renames it "mine" still lives in the console, and one who chooses "No extra styling" in the
panel keeps every section and face and loses only the house. A signature may draw (a radar, an
eclipse, an orbit) but only in the theme's tokens, only in gradients, borders and pseudo-elements,
and never under copy; and the opening it draws is a `hero` with a blank heading, which is the section
that already prints the site's name and tagline. **That is why `printsSiteName()` exists**
(`shared/design.ts`): a blank-heading hero and a `cover` hero both print the name, so the masthead
above them must not — both renderers ask that one function, on the home route only, and a preset
that opens this way sets `header.showName: false` so the header is not forced to print it a second
time. `scripts/check-signatures.mjs` is the browser gate for all of it: an isolated fixture (no
vault, no saved design) rendering every house at 1440, 390 and 390 RTL, asserting no horizontal
overflow, the galleries, the hover summary and the collection route, with `SIGNATURES=a,b`,
`--houses-only` and `SHOTS=full` for the designer's loop. `tests/designChromeShapes.test.ts` states
the portability.

**A FILE DROPPED ON A FOLDER IS FILED THERE.** The attachment-location setting answers for an
upload that named no place — a paste into a note, a drop into the editor. A drop on the TREE names
one. It used to be honoured for PDFs only (the owner dragged a book onto `Library/` and found it in
`attachments/`); then a friend dropped a folder of icons on a folder and every one was carried off
to `attachments/` (3.1.2). The owner's rule: "only auto attachments when the user pastes or drops
directly on the note; if I drag and drop an image to a folder then my choice shall be honoured."
`uploadDestination(loc, context, ext, filed)` (`shared/attachments.ts`): a tree drop sends
`place=here`, and the drop folder is the destination for every type; the setting decides the rest.
`tests/uploadDestination.test.ts` states it.

**A SECOND GROUND, AND IT IS MADE OF LIGHT RATHER THAN INK.** `chrome.surface` answers "what is
this printed ON" and answers it hue-free by construction — five textures, every one a `color-mix`
of `--text` into transparent, so one rule is right in twenty-one rooms. That was correct for a sheet
of paper and it is the reason seventy-one finished designs could differ in measure, in face, in
arrangement and in ground and still read, side by side in the gallery, as seventy-one settings of
the same page: every one of them was ink on paper, and a reader who asked for a space design could
be offered a narrower column. `chrome.scenery` answers the other question — WHAT IS THE PAGE
STANDING IN — with five worlds (`starfield`, `aurora`, `horizon`, `topography`, `halftone`, plus
`none`, plus `nebula` and `fog`), and `chrome.ornament` gives a design the mark it breaks itself
with instead of the product's own `✦`. Both are top-level `chrome` scalars for the reason `surface` is: `site` is a
closed allowlist whose keys are a schema bump, `chrome` is leniently normalized, so a design written
before these fields renders with no sky and the wordmark, and one written after them renders on an
older build as the page it always was.

**A SCENERY IS FIXED TO THE WINDOW; A SURFACE IS FIXED TO THE SHEET.** That is the whole difference
and it is mechanical: a surface is a `background-image` with `background-attachment: local`, so its
rules travel with the words because they are printed on the paper; a scenery is a screen-tall
`position: sticky` layer pinned to the top of the scrollport — with a negative block margin of the
same length, so it costs nothing in flow — and the reader moves while the world stays. The two
COMPOSE (laid paper under a starfield is a letter written somewhere), and `check-presets`' shape key
folds `scenery` in beside `surface`, because a design standing in a starfield and one standing in
nothing are not twins at any size.

**THE MEASUREMENT REWROTE THE FEATURE, and this is the part worth reading.** The obvious build — one
translucent layer of accent, bounded like a surface — was measured the way the surfaces were, over a
matrix the surfaces never faced: six worlds × twenty-one rooms, real pixels, animations running, the
extreme pixel of the frame ratioed against the three text tokens. **Every world failed, including
the quietest.** `--text-muted` starts at 5.01:1 on parchment against a 4.5 floor and `--text-faint`
at 3.16:1 on linen against a 3:1 floor — 0.51 and 0.16 of room — and the five surfaces had already
spent most of the second one. A decoration bounded to 0.16 of a ratio is the seventy-one designs
this feature exists because of.

**SO THE WORLD STOPS WHERE THE WORDS START.** A ratio is only ever measured under TEXT; text only
ever happens inside the reading column, `--dsn-width` wide and centred; outside it there is nothing
to be legible against. Both layers therefore wear one mask — full strength in the margins,
TRANSPARENT across the column, with 140px of falloff landing exactly on the column's edge — so the
ground under every word is byte-for-byte the ground the same design has with no scenery at all. That
is a guarantee **by construction** rather than a margin somebody measured, and it is what lets the
worlds be loud: the contour ink runs at 9%, three times the loudest surface, because none of it is
ever under a word. It is also why every design on the new shelf keeps a narrow page — the world
lives in the margins, so a design that wants one has to leave it somewhere to be. On a window narrower
than the column every mask stop resolves out of order and a gradient clamps its stops to be
non-decreasing, so the transparent pair swallows the box and **a phone gets no world at all** — the
safe direction and the true one, since a window with no margins is a window that is all reading
column. The design still arrives as its type, its arrangement, its ground and its room.

**THE MASK IS ON THE BOX AND THE FIELDS MOVE INSIDE IT**, which is why the layer is a real screen
tall rather than a zero-height box with its fields hung off it. A mask is painted in the element's
own coordinates and TRAVELS WITH ITS TRANSFORM: with the mask on the pseudo-element, the starfield's
340px drift and the aurora's 6% sway carried the clear band along with them, and a sweep showed a
"12%" mask costing exactly what a 100% one did — the worst pixel was the margin, arrived under the
column.

**TWO LAYERS, AND NOT FOR SAFETY.** The mask does safety. The split is that a coloured light and a
translucent wash are different things and a world needs both. `.s-dsn-sky--ink` is ordinary
compositing: the marks (stars, rings, dots) and the VALUE of the light, which is the only layer that
can brighten a room. `.s-dsn-sky--hue` is `mix-blend-mode: color`: it writes hue and chroma and
keeps the backdrop's luminosity, so a curtain over parchment is parchment gone violet rather than
parchment gone pale — which a translucent wash cannot do, and which on `murex` and `nocturne` could
not brighten anything until it got its twin on the layer above. **They are siblings and they had to
be**: the light was first written as a CHILD of the marks layer and measured a cost of exactly 0.00
in every room, which was true and was not a result — `.s-dsn-sky` carries `z-index: -1`, every
stacking context is an isolated group for compositing, and a `mix-blend-mode` inside one sees a
transparent backdrop and paints its own raw colour. It was a nebula that had not been drawn.

**AND THE MATRIX SAYS SO.** Eight worlds × five grounds × twenty-one rooms, 840 rows, screenshotted
inside the reading column with the animations running: of the 735 rows that carry a sky, **735 are
identical to the same room on the same ground with no sky at all** — max cost 0.00 to `--text`, 0.00
to `--text-muted`, 0.00 to `--text-faint`. `nebula`, which is by a distance the loudest thing in the
file, measured 0.00 on its first run: a guarantee that comes from the geometry is not re-earned by
each world that arrives after it. The floors across the whole matrix are the floors the
GROUNDS already had (worst `--text` 10.29, worst `--text-muted` 4.66 against 4.5).

**A PRE-EXISTING READING, RECORDED BECAUSE THE MATRIX FOUND IT.** On `linen`, the shipped
`ruled` (2.95), `grid` (2.95) and `paper` (2.97) surfaces measure `--text-faint` under 3.0 with no
scenery at all. The
surfaces' own table was taken over five rooms and `linen` was not one of them. Nothing here caused
it and nothing here changes it — the scenery's cost on those rows is zero like everywhere else — but
a matrix that finds a number and does not say so is worse than no matrix.

**`prefers-reduced-motion` FREEZES A SCENERY RATHER THAN DELETING IT**, and this is the one place
the feature parts company with the ambient layer, which deletes its own. An atmosphere the OWNER
switched on behind a masthead costs nothing when it is gone; a scenery is what the AUTHOR chose
their site to stand in, and deleting it hands a reader who asked for less motion a different design.
The fields stay, the drift stops, and two screenshots 2.5s apart are byte-identical.

**THE MINIATURE DRAWS THE WORLD AND DOES NOT SPLIT THE LAYER.** `DesignThumb` gained `scenery`
beside the masthead's shape, the ground and the shape of the end of the page, because the world is
the one thing a 200px card always resolves — two designs that differ in measure and in face are one
grey card twice. It draws all five in one field, static and unmasked: a card has no text in it at
all, so there is no floor to hold and no column to keep clear, and the gallery paints seventy-six of
them at once, which is not the place for seventy-six animating compositor layers.

**`DesignThumb` and `silhouette()` learn three of the four.** The masthead's shape, the page's
ground and the shape of the end of the page are three different pictures at 200px, so the miniature
draws them and the collision key folds them in. `nav.style` is deliberately in neither, for the
reason `divider.style` is not: pills, a rail and a pair of brackets on a 7px bar are the same 7px
bar, and a key that gains a term the reader cannot see is quieter rather than finer.
`check-presets` also grew the loop it was missing — its no-clamp check walked `header`/`footer`/`nav`
and nothing else, so a top-level `chrome` scalar like `surface` could be silently normalized away.
There are three such scalars now (`surface`, `scenery`, `ornament`), so the same omission would be
three times as quiet; the shape key carries `scenery` beside `surface` and leaves `ornament` out, for
the reason it leaves `nav.style` out.

### Presets (`shared/presets.ts`, `shared/presetCatalog.ts`)

**A preset is a design document that happens to live in the repo.** Not a template language,
not a partial, not "starter options" the designer interprets — the same `sections`, the same
`chrome`, the same `article`, the same validator. A preset that renders wrong is a design that
renders wrong, debuggable with the tools that already exist, and a section kind added to
`shared/design.ts` reaches every preset without a second vocabulary to teach it.

**APPLYING A PRESET IS AN IMPORT, and there is no preset route.** `presetExport(preset, lang)`
produces exactly the `astrolabe.design` envelope `POST /api/design/docs/import` already takes, so
the whole apply flow is two lines in the panel:

```ts
const doc = await importDesignDoc(presetExport(preset, language));
openDraft(doc);
```

Every property the word FORK is meant to buy falls out of a route that shipped before presets
existed: a free id, fresh `createdMs`/`updatedMs`, strict validation, custom themes remapped
under fresh slugs, and nothing the instance already has overwritten. **No new server code, no
new endpoint, no server knowledge of presets at all** — that is the design, not an economy. Two
consequences worth naming: a preset file and an exported design are THE SAME FILE (a `.json` a
stranger wrote behaves identically to a shipped one, and a design an author built can be handed
back as a preset), and **the forked document remembers nothing**. There is deliberately no
`presetId` on `DesignDoc` and there must not be one: it is a `DOC_KEYS` change — a schema bump —
bought for a breadcrumb nobody can act on, and the person who adds it is the person who will then
write "reapply the preset", which is the live link the whole shape exists to refuse.

**Three rules bind every shipped preset, and `assertCatalog()` enforces the ones it can at import
time** (duplicate id, empty or un-Arabic copy, a section or nav item naming a note):

1. **A PRESET IS PURE FORM.** Every text field it could set — section headings, the hero's own
   heading and sub, a CTA's words, `footer.copyright`, nav labels, rich-text bodies — is LEFT
   EMPTY, and the renderers already know what empty means (hero → the site name and tagline,
   empty heading → no heading, empty copyright → the instance's own footer line, empty CTA label
   → the localized "Read more"). It has to be this way: `Section.heading` is a plain string with
   nowhere to put a second language, so a preset that typed "Latest writing" would ship an
   English word into an Arabic instance and a stranger's voice into everybody's. The shape is
   ours; every word on the page is the owner's. It is also why fifty-nine presets are cheap to write
   and impossible to mistranslate.
2. **A PRESET NAMES NOTHING IN THE VAULT.** No `note` section, no `note`/`page` nav item, no tag
   filter, no image path — a shipped design cannot know what is in somebody else's vault, and a
   preset that guessed would render as the owner's very first error card. It leans on the
   fallbacks that already exist: `nav.fallback: "topics"` fills the menu from the busiest
   published tags, and list/grid sections read every published post. A fresh install gets a
   furnished site.
3. **A PRESET NAMES A THEME** — one of the built-ins, because the layout was drawn against it. It
   applies on FORK, and then only to readers with no stored preference, which is `DesignedSite`'s
   existing rule.

**Names and blurbs are DATA, not dictionary keys.** `{ en, ar }` pairs travel inside the preset.
Fifty presets as dictionary rows would be a hundred entries `check-i18n` can only see as dead
keys, and adding one preset would mean editing three files. The chrome AROUND the gallery — the
nine family labels, the buttons, the empty state — goes through `t()` like everything else, from
a LITERAL `Record<PresetFamily, I18nKey>` table for `TYPE_LABEL`'s reason.

**The catalog is a dynamic `import()`** (`loadPresets()`), so seventy-one layouts are a chunk the admin
fetches when the designer opens rather than bytes on a visitor's first paint.

**`presetCatalog.ts` is an ORDERING, not a list.** The designs live in one module per shelf —
`presetsEditorial`, `presetsMinimal`, `presetsBrutalist`, `presetsJournal`, `presetsPortfolio`,
`presetsDocs`, `presetsAcademic`, `presetsGarden`, `presetsLanding`, `presetsGallery`,
`presetsLetter`, `presetsSignatureA`, `presetsSignatureB`, `presetsSignatureC` — and the
catalog spreads them in `PRESET_FAMILIES` order with the four originals leading their families.
Two families are served by more than one module and both splits are editorial: `minimal` holds
the narrow essay shelf (560–780px, quiet weights) and then the wide, heavy, uppercase half
(1040–1400px) that reads as the same argument made the opposite way, and `reference` holds
documentation, then research, then the digital garden. A module is five designs because five is
what one person can hold in mind while checking that no two of them are the same design in
different clothes — the review that actually keeps a catalog this size honest, and the reason
the file boundary is a SHELF rather than an alphabet.

`MAX_DESIGNS` still applies: applying a preset is creating a design, and the 24-design cap
answers with the sentence it already has.

### `signature` — the ninth family, and the one that names a BAR rather than a JOB

The other eight families answer "what is this site FOR". `signature` answers "is this design
actually SOMETHING", and it is filed as a family because that is how a person browses it. Its
members are composed AFTER the engine grew five mastheads, five grounds, five list shapes, five
card shapes, three openings and real typefaces, and each one is held to a standard the eight
job-shelves are not: **applying it must feel like moving into a different house.** Concretely, a
design earns the family only if it uses at least three of those primitives in anger, names its own
faces, carries a name and a blurb that sell a life rather than list features, and collides with
nothing in `check-presets`' silhouette report.

It **leads `PRESET_FAMILIES`**, and therefore the gallery. That is the one place the family order
is an editorial decision rather than a taxonomy: an instance with no design opens on the presets
tab, and the first row a stranger sees should be the four designs that answer the question they
came with.

It arrives as **studio modules** — `presetsSignatureA.ts` (the press: a broadsheet, a console, a
scholarly journal, a poster), `presetsSignatureB.ts` (the gallery: a private view, a plate book, a
zine, a feature desk) and `presetsSignatureC.ts` (the letters: a letterpress salon, an observing
station, a deluxe manuscript, an essayist) — rather than as one file, for the reason every other
shelf is a module: four designs is what one person can hold in mind while checking that no two of
them are the same design in different clothes. A studio is FOUR rather than five because the four
have to argue with EACH OTHER as well as with the shelf, and the sixth pairwise comparison is where
that stops being possible.

**A studio argues about ONE THING, and the thing is a row of the config.** The press argues about
type, the gallery about where the image goes, the letters about what the page is printed on — so
each studio's four take four different answers to its own question and the shelf reads as three
arguments of four rather than as twelve loose cards. The corollary is arithmetic and worth writing
down before somebody "fixes" it: a studio has four designs and the chrome enums have three to five
values each, so exactly one row of a studio's table repeats. The press and the gallery both repeat
`footer.form: "columns"`; the letters repeat `"colophon"`. A repeat that lands on the row a studio
is NOT arguing about is the correct place for it.

**`Preset.themes` is not a list of alternates.** It is the export envelope's custom-theme payload
(`{ base, tokens }` records an import merges under fresh slugs), so a built-in id put there ships a
malformed custom theme to every install. A design names ONE theme, in `design.theme`; the rooms it
would also live in belong in `tags`, where the gallery's search box can find them.

### A POST SECTION HAS NO OFFSET, and that is a catalog rule (`check-presets.mjs`)

`pick()` is `filtered.slice(0, limit)` — from the top of the same feed, every time. So any two post
sections in one design OVERLAP, and the only question is whether the overlap reads as an archive or
as a stutter. The rule: **at most two post sections, and the index at least twice the feature.**

The threshold is `index ≥ 2 × feature` rather than a round number because that is the line a READER
can see — the second section has to add at least as many posts as it repeats, or it is the same run
again with a few rows on the end. Three post sections cannot satisfy it at all (the third always
repeats one of the first two) and are refused outright.

Measured against a real vault before the rule existed, and every one of these shipped:
`commissions` printed nine projects and then an "archive" of ten — one new post; `herbarium`
stacked two grids of nine and eight; `showreel` carried a lead frame, a strip AND an index, so the
newest post appeared **three times on one page** (21 headings from 13 posts). A design whose front
page prints the same essay three times is the first thing an author sees and the last thing they
forgive, and no amount of reading the JSON catches it — only rendering it against posts does.

### The catalog gate (`scripts/check-presets.mjs`, `npm run check-presets`)

`assertCatalog(PRESETS)` runs at the bottom of `presetCatalog.ts`, which means it runs when the
MODULE LOADS — and the module is a dynamic `import()` fetched the first time an admin opens the
designer. A duplicate id or an un-Arabic blurb therefore failed no build; it threw inside the
gallery's chunk, in front of the one person about to browse fifty-nine designs. A catalog is data
in the repo: no author is present when it breaks and no user can report it usefully. It needs a
gate that runs with the other gates, and this is it — no server, no browser, milliseconds.

It checks three tiers, and the middle one is the reason it exists:

1. **What `assertCatalog` already knows**, imported and never re-implemented — a second copy of a
   rule is how a gate and its product come to disagree.
2. **What only a gate can see.** Every family is served (above). Every typography number survives
   `normalizeChrome()` — the normalizer SNAPS out-of-range values instead of throwing, so
   `scale: 1.5` (the cap is 1.414) renders as a design nobody chose and nothing says a word. The
   bar is HALF A STEP, not equality: rounding onto the slider's own grid is what an author means,
   being overruled by the bounds is not. Every theme named is one of the built-ins; every width is
   inside `MIN_WIDTH…MAX_WIDTH`; and **every preset survives `validateDesign()`**, which is the
   apply flow exactly — a preset the import route would reject is a preset whose first click is an
   error toast.
3. **Rule 1, mechanically** — a preset is PURE FORM, so every copy field it could set is empty.
   This is the rule most likely to be broken by somebody being helpful.

The shape+width collisions it prints are a NOTE, never a failure: two designs may legitimately
share a skeleton and differ in palette, columns and type (`casebook`/`lyceum` do), and that is a
judgement for a person rather than a threshold.

**The collision key is what a 200px card can RESOLVE, and it used to be finer than that.** It was
`kinds.join(">") + "|" + exact px width`, so `casebook` (1160) and `vitrine` (1120) — visually the
same card — slipped through on forty pixels nobody can see, and the gate printed ONE collision
where a reader measured six. The width is bucketed into the three bands a silhouette actually has
(narrow ≤780 / mid ≤1080 / wide), a `postGrid`'s column count and its banner flag are folded in (a
2-across and a 4-across grid are two pictures; a grid with photographs and one without are two
shelves), and a hero's height with them. It now reports seven — the six a reader measured
(`quiet-page`/`measure`, `daybook`/`preprint`, `casebook`/`vitrine`, `commissions`/`lyceum`,
`compendium`/`thicket`, `overture`/`envelope`) and `billboard`/`broadside`, which the hero fold
caught and the eye had let pass. Seven twins out of fifty-nine is a better hit rate than most
shipping theme galleries, which is why it is a note.

**The arrangement fields joined the key, and one of them was deliberately left out of it.** A
`postList`'s layout, a `postGrid`'s card shape and a `hero`'s treatment are folded in with their
defaults written out, so a preset authored before the field existed keys identically to one that
names the default — the report must not move because a shelf file grew a line that changes
nothing. A `divider`'s style is NOT: folding it in was tried and measured, and the count fell
from seven to three, because four of the pairs a reader had already called twins differ in
nothing but a hairline versus a gap. A key that hides four of the six twins a person measured is
not a finer key, it is a quieter one — and this note exists to be read by that person.

### Thumbnails: a REAL RENDER in the grid, a CSS miniature while it arrives

The choice was between three, and only one of the losers stayed lost.

- **Shipped screenshots** are accurate and dead. Fifty PNGs at two densities is megabytes in a
  public repo that must be REGENERATED whenever a token moves, and every one is painted in
  whatever theme the machine that shot it was wearing — so a reader on `nocturne` browses fifty
  pictures of `parchment`. Still refused.
- **`DesignThumb`** (`client/components/design/DesignThumb.tsx`) draws the design as CSS: its
  header layout, density and hairline, its column width as a percentage of the canvas, its actual
  section list in its actual order, with the artwork coming from `generatedBannerCss()` — the
  function the product already uses for a banner-less post, already deterministic per seed,
  already painted out of the theme's own tokens. **Zero bytes in the repo, no fetch, ~40 nodes a
  card, and it repaints on a theme switch because it never named a colour.** Every dimension is
  in `cqw` against `container-type: inline-size`, so one coordinate system is correct at 160px and
  at 400px with no media query and no JS measure.
- **Fifty-nine live canvases** was refused as "several thousand nodes mounting while somebody
  scrolls" — and that was the wrong number to be afraid of, because a reader can only see six.

**THE PICTURE IS REAL, AND IT IS REAL AT REST.** Every card in or near the viewport draws a
`<DesignCanvas>` — the actual header, the actual sections, the operator's own posts and their own
banner PHOTOGRAPHS, at 1120px, scaled into the card, in the PRESET's own theme. The wireframe is
now the PLACEHOLDER: what a card shows before it arrives and while it is being flung past.

The old arrangement — fifty-nine wireframes in the operator's one hue, with a real render bought
only for the single card under the pointer — is what made this read as a settings form with
pictures rather than as a template gallery. The `gallery` family, five presets whose entire
premise is photographs, rendered as five identical pale rectangles on a vault holding eight real
banner images; the honest render was already written and was being refused to fifty-eight cards
out of fifty-nine. WordPress, Ghost and Squarespace all lead with a real rendering in the theme's
own colours.

**What keeps it affordable is that "visible" is a small number.** An `IntersectionObserver` with
a `400px` root margin mounts a canvas a screen BEFORE it is needed and unmounts it 600 ms after it
leaves, so the document holds the two or three screens around the reader rather than fifty-nine
trees; a card must dwell 90 ms in that band before it pays, so a fling through the catalog mounts
nothing it flies past. Measured on a ten-post vault at 1440×900: 59 cards, 14 live canvases, 10
distinct preset themes on screen at once and 19 real `/api/file` banner backgrounds — with no
pointer anywhere near the grid. A browser with no `IntersectionObserver` draws everything: a
gallery of blank cards is the one outcome worse than a slow one.

**Why the wireframe is still worth having.** A scaled screenshot of a real page at 200px is a grey
smear with an unreadable word on top, and the miniature answers the one question that size can
answer — what shape is this, how much air does it have — for the fraction of a second before the
canvas lands. It is the same argument as before, applied to the moment it is actually true of.

**The MINIATURE is painted in the ACTIVE theme; the CANVAS is painted in the PRESET's.** A
wireframe in somebody else's palette would be a colour riot with no information in it; a real
render in the operator's palette would be a lie about the design, which is the disagreement the
preview blockers were all about. Each card also names its theme in WORDS beside the swatch
(`s-dsgp-card__themename`): the dot is `aria-hidden` decoration, and a `title` is a tooltip, which
is not a label on a touch screen and not a label to a screen reader.

### `DesignCanvas` — any design, any width (`client/design/DesignCanvas.tsx`)

The component that closed the gap named in the design engine's own notes: the panel's LIVE
PREVIEW drew the chrome around a typography SPECIMEN, so every control that shapes the composed
page changed nothing on screen.

**`route: "article"` IS THE ARTICLE PAGE, NOT THE SPECIMEN** — the other half of the same gap,
and it stayed open one round longer. Drawing a bare heading ladder there left all five
`DesignArticle` switches (Banner, Date and reading time, Tags, Related posts, Back link) with no
visible effect anywhere in the product: five toggles and no preview. The route now renders
`DesignedArticle` — the renderer the live site uses — against `PreviewContent`, so the furniture
is the design's own and every switch moves something on screen. Two things differ from the live
path and both go through `usePreviewContent()`, the seam a `note` section and a `postGrid`'s
banners already use: the body is the SPECIMEN prose (assembled from the same `designSpecimen*`
keys the old block used, so a type control still shows the sizes, the measure and the rhythm and
there is not one new string to translate) instead of a fetched note, and the page does not write
`openPath` — a picture of an article is not a page anybody navigated to. The specimen survives as
the fallback for a preview with no posts at all.

```ts
<DesignCanvas
  design={DesignDoc}          // the draft, a stored design, or presetDesignDoc(preset, lang)
  content={PreviewContent}    // what the sections read instead of the live vault
  width={1120}                // px to LAY OUT at, before scaling (CANVAS_WIDTH)
  fit="scale" | "native"      // transform to the box, or let the box be the viewport
  route="home" | "article"
  clipHeight={860}            // px of laid-out height to keep, with a fade at the cut
  ownTheme                    // paint the design's theme on the canvas box
                              // (built-ins only — a custom theme is keyed at
                              //  :root; the FRAME is where one can be honoured)
  live                        // it is in a REAL viewport (the preview frame):
                              // hoverable, and sticky is honoured
  label="…"                   // it is role="img"; everything inside is aria-hidden
/>
```

Three properties, each load-bearing:

1. **It is the real renderer.** `DesignHeader`, `RenderSection`, `DesignFooter`,
   `typographyVars`, the `.s-dsn` scope, `--dsn-width`. Not one line of section markup is written
   twice — a preview assembled from a simplified copy is a preview of the copy, and every
   divergence is a bug the author finds after publishing.
2. **It lays out at a width and scales the PIXELS.** `width: <width>px` then
   `transform: scale(box / width)`, remeasured by `ResizeObserver`. A 200px card and a 900px pane
   show the SAME page at two sizes — not two responsive breakpoints, which is what a narrow box
   would show and would be a lie about what a reader sees. `fit: "native"` drops the transform and
   lets the pane's own width be the viewport; that is the designer's pane, where an author is
   reading their own type rather than judging a shape from across the room.
3. **It is inert and it cannot take the panel down.** No nav handler (the site owns the address
   bar; a preview inside the app must not), `pointer-events: none` inside, and every part wrapped
   in the same `DesignBoundary` the live site uses — a broken preset renders a caption in the
   card instead of unmounting the designer.

Two details that were bugs before they were rules:

- **The click swallow is SCOPED to the canvas.** A canvas is routinely mounted inside a button (a
  gallery card is one), so an unscoped `closest("a,button")` finds the CARD, swallows its click,
  and the preset can be hovered but never chosen. Only a link that is a DESCENDANT of the canvas
  is swallowed.
- **`.s-dsn` is the live site's SCROLLER** (`height: 100%; overflow-y: auto`). Inside a canvas it
  is a block in somebody else's layout, and inheriting those two rules clipped every design to its
  own header. `presets.css` overrides them under `.s-dsgv` only — the live shell keeps its
  scroller.
- **`sticky` is dropped inside a SCALED canvas.** `position: sticky` resolves against the nearest
  scroll container, which inside a `transform: scale()` wrapper is the transformed element itself:
  the header would pin where the reader is not looking. A preview that draws a header in the wrong
  place to honour a switch is worse than one that draws it right. `live` is the one case where the
  canvas has a scrollport of its own — the preview frame's document — and there the switch is
  previewed rather than deferred.

### Preview content — real posts first, generated artwork second

`client/design/previewContent.tsx`. Two of the real section renderers reach OUTSIDE the design
for their content: `note` fetches a note, and `postGrid` asks the store whether missing banners
should be generated. A preview must answer for both without a second copy of either component,
so the seam is **a React context, not a fork**: `usePreviewContent()` is `null` on the live site —
which is every path those files had before — and a reviewer finds every place a preview differs
from production by grepping for that one hook.

```ts
interface PreviewContent {
  posts: PostMeta[];            // the VISITOR'S feed, in its own order, padded to 8
  pages: PageMeta[];
  notes: Map<string, string>;   // note bodies supplied instead of fetched
  noteMode: "fetch" | "sample"; // designer previews the real note; the gallery never fetches
  forceGeneratedBanners: true;  // in every preview, see below
  synthetic: boolean;           // any row was invented — the gallery says so, once, quietly
}
```

Where the content comes from, and this is the half that makes a fresh install compelling:

- **The owner's own posts first — as a VISITOR will get them.** Real titles, real dates, real
  banners, real reading times, in real order. A preset previewed against six of your own essays is
  a decision you can make; the same preset against "Lorem ipsum" is a screenshot.

  **The list comes from `GET /api/design` (`overview.posts`), never from `/api/posts`,** and that
  is a correctness rule rather than a tidy-up. `/api/posts` answers for the SESSION and for the
  layout that is live: to an admin it is unscoped, and `staticPagesActive()` is false while
  `publicLayout` is still `"blog"` — which is exactly the state an operator is in while building
  their FIRST design, before they switch, and exactly what the panel's own banner says ("The
  public site is not on your design yet"). So every preview and all fifty-nine gallery cards
  opened with the author's Contact, Colophon and About PAGES as the newest articles, plus any note
  the language filter hides from every visitor. The overview's list is
  `posts(true, languageScope(c, true).lang, true)` — visitor scope, the visitor's language scope,
  and pages excluded unconditionally, because a designed site never lists a page as an article
  whatever `publicLayout` says today. Measured on a vault of 12 published notes with `layout=blog`:
  `/api/posts` 12 rows led by Colophon and About, `/api/design.posts` 10 rows led by the newest
  essay.
- **Generated artwork wherever a banner is missing**, from `generatedBannerCss()` — deterministic
  per title, painted out of the ACTIVE theme's tokens, repainting on a theme switch with nobody
  re-rendering anything. `forceGeneratedBanners` is on in every preview even when the instance
  turned generated banners OFF, because an author still has to see what a banner grid does before
  they choose one, and a fresh install would otherwise judge every image-forward preset by a
  column of empty rectangles.
- **Sample rows only to make up the numbers**, to `PREVIEW_MIN_POSTS` (8) — enough for a
  three-across grid with a river under it. Their copy is dictionary copy (`pv*`, en + ar like all
  chrome) and their paths carry `SAMPLE_PREFIX` (`__astrolabe-sample__/`), a path no vault surfaces.
  **The padding rule is "top up", never "replace"**: real posts keep their real order and their
  real position and samples are APPENDED. A preview that put invented rows first would show an
  author a front page whose lead story is a fiction, which is the one thing a design preview may
  not do.

### The live preview: a frame, a device and a clock

`client/design/PreviewFrame.tsx` + `client/components/design/PreviewStage.tsx`. The designer's
right-hand pane is not a canvas in a box — it is the composed site **in a nested document of its
own**, at a width the author picks, settling on the trailing edge of their edits.

**The pane is an `<iframe>`, and a div is a lie in three places.**

1. **Media queries answer the WINDOW, never the box.** `design.css` carries
   `@media (max-width: 700px)` — the rule that drops the designed grid to one column and lifts
   every target to 44px. A 390px div inside a 1440px window matches none of it, so a "phone"
   preview built from a narrow div is the DESKTOP design squeezed into a phone's width: the one
   picture of a phone guaranteed to be wrong. Measured in the frame at 390: grid
   `354px` (one column), topic chip 44px, document overflow 0.
2. **The app's cascade reaches into the pane.** In one document the visitor surface and the admin
   chrome share `:root`, the scrollbar rules and every selector anybody writes for the designer
   later. The frame inherits the app's stylesheets DELIBERATELY, by cloning them, and inherits the
   panel's accidents not at all.
3. **`position: sticky` needs a scrollport.** A scaled canvas has none it can honour, which is why
   `DesignCanvas` drops stickiness; a frame has one, so `live` canvases emit `s-dsn--sticky` /
   `s-dsg-top--sticky` and the switch that turns it on finally has a preview.

**`about:blank`, not `srcdoc` and not a route.** The shell's CSP is `frame-src 'none'` and stays
that way. That directive is checked on frame NAVIGATIONS: `srcdoc` and any URL are refused, while
a frame with no `src` is the initial `about:blank` — not a navigation, and it inherits the
parent's origin (so the portal can reach in) and the parent's policy (so nothing inside is more
privileged than the app). Verified in Chromium: the frame renders with the shipped header intact.
**And no `<base>` element**: `about:blank` inherits its creator's base URL by spec — banners
resolve to `/api/file?path=…` on the app's origin with no base present — while `base-uri 'none'`
refuses the element and logs a violation on every open.

**The stylesheets are CLONED from `document.head`**, `<link>` by href and `<style>` by text, under
a `MutationObserver`. **The sync is a keyed DIFF, not a rebuild**, and that is not an
optimisation: a cloned `<link>` applies asynchronously even from cache, so re-cloning the whole
head hands the frame a moment with the old sheet removed and the new one unapplied — a flash of
raw HTML in the middle of the panel, which is exactly what a screenshot caught the first time the
head changed with the designer open. Nodes still present are left alone (never re-appended
either — re-inserting a link re-runs its fetch); only arrivals are cloned and only departures
removed. For the same reason **the page inside starts hidden** and is revealed when the first
sheets answer, or after one second so a sheet that 404s never leaves an empty pane
(`data-astrolabe-ready`, asserted by the gate — invisible is worse than unstyled).
One place knows what CSS this build has and it is the head: cloning it brings
`tokens.css`, the generated custom-theme sheet, an operator's `custom.css`, uploaded `@font-face`
blocks and Vite's dev-injected styles, forever, with no manifest to keep in sync. `data-theme`,
`data-custom-theme`, `dir` and `lang` are mirrored off `<html>` by a second observer, so a theme
switch behind the panel repaints the preview (measured: `parchment` → body `rgb(242,235,218)`)
and an Arabic instance previews an RTL site.

**THE DESIGN'S OWN THEME OVERRIDES THE OPERATOR'S, over those two attributes and no others.**
`design.theme` is FORCED on every reader who has not chosen one — it is literally what a
first-time visitor sees — so a pane painted in the operator's theme is a preview of a site nobody
will be served. Measured before this: an operator on `iron-gall` applied Front Page (`linen`) and
the editor drew it DARK while the live page was light, and the gallery card that sold it was a
third colour again — a three-way disagreement inside one session, in the one pane the whole
editing session happens in. `PreviewFrame` takes `ownTheme`, `themeChoiceAttrs()` (the value form
of `applyThemeChoice`, one decision written by two callers in two documents) says which two
attributes a choice means, and the frame is the one preview surface that can honour a `custom:`
choice as well as one of the built-ins, because the generated sheet keys `:root[data-custom-theme]`
and the frame has a root. `dir` and `lang` stay the INSTANCE's — a design does not choose the
language its site is written in — and a design that names no theme mirrors the app, which is the
honest drawing of "the reader's own". A theme change is a REPAINT of two attributes, never a
document rebuild: the clones, the observers and the author's scroll position all survive it.
Measured end to end: operator `iron-gall`, design `porphyry` → frame `porphyry`, and a cookieless
visitor's `<html data-theme>` is `porphyry` with the same body ground, `rgb(27,20,26)`.

**The scroller is put back where the live site keeps it.** `app.css` clips `html`/`body`/`#root`
— the app grid owns all scrolling — and the visitor's designed page scrolls inside `.s-dsn`.
Both sheets are cloned in, so a frame that let the DOCUMENT scroll would be a frame nothing can
scroll. The reset restores `.s-dsn` as the scrollport under `.s-dsgv--live`, which makes the
frame the visitor's arrangement exactly: same scroller, same sticky, same overscroll.

**Nothing inside a preview acts, and the swallow lives in the FRAME.** React's synthetic events do
not cross a document boundary — a portal's listeners are on the root container in the outer
document, and an event inside the frame bubbles to `about:blank`'s window and stops — so
`DesignCanvas`'s own `onClickCapture` is correct and inert in there. The frame's document carries
capture-phase `click`, `auxclick`, `submit`, `dragstart` and Enter/Space handlers instead.
Sequential focus never enters (`tabindex="-1"` on the frame, `aria-hidden` on the page inside):
everything in there is a copy of a control the panel already offers.

**Three device widths, and nothing between them** — `desktop` 1280, `tablet` 834, `phone` 390 (the
width DESIGN.md measures the shell at). The frame LAYS OUT at that width and the stage scales the
pixels into the pane, so the phone stays phone-shaped in a pane twice its width; the wrapper
carries the scaled size so the centring, the scrollbars and the device shadow agree with what the
eye sees. **Never scaled up** — a phone blown up to 700px would show an author type twice the size
their reader gets. `Actual size` drops the scale to 1:1 and lets the stage scroll, because "what
shape is this page" and "can I read this type" are two questions and a designer needs both.

**The preview settles on a 120 ms trailing edge**, with one dot lit while it is behind. Under the
~150 ms an eye reads as instant, over the 16 ms a drag would blow; identity-based, because every
control writes a new document object. Measured: 24 slider keystrokes in 168 ms, 50 device switches
with the same iframe element and the same in-frame node count (211 → 211) — the frame is built
once and reconciled after that, which is also why the author's scroll position survives every
edit. A route change is a NAVIGATION and resets it.

**Gated by `scripts/check-preview.mjs`** (`npm run check-preview`, `PORT` + `ASTROLABE_PASSWORD`),
which drives the real panel in a real browser and measures the frame from the inside: the frame
exists at all under the shipped CSP, the sheets and the theme arrive, the phone gets the phone
rules, the pictures resolve, a chip highlights under a pointer mapped through the scale, an edit
lands, and fifty switches leave the same element with the same node count. It creates one design,
uses it and deletes it, putting the previously active one back — on failure too.

**A fresh install still gets a page worth looking at**: with zero published posts the pane draws
six sample cards with generated artwork, the topics menu filled from the sample tags, and one
quiet line saying some rows are samples (`presetSampleNote`). With real posts the pictures are the
author's own — measured resolving to `/api/file?path=Media%2Fkyoto.jpg`.

### The gallery contract (`client/components/design/PresetGallery.tsx`)

```ts
interface PresetGalleryProps {
  presets: readonly Preset[];   // from loadPresets(); the host awaits, the gallery has no spinner
  content: PreviewContent;
  onApply: (preset: Preset) => Promise<void>;   // fork + open; see the two lines above
  onBlank: () => Promise<void>;                 // createDesignDoc(name)
  busy?: boolean;
}
```

**The gallery owns filtering, hover and selection; it owns NO network and NO store writes.**
`onApply` and `onBlank` are the only two ways out, deliberately: the panel already knows how to
open a document, refresh its overview and toast a failure, and a gallery that learned any of it a
second way is a gallery that drifts. It does not know what a design store's error sentences look
like and must not learn.

- **Filtering is one implementation** — `filterPresets`/`presetMatches`/`familyCounts` in
  `shared/presets.ts`, so the count beside the search box and the grid under it cannot disagree.
  Text is applied FIRST and the family chips count the text-filtered set, so a chip reading "0"
  beside a grid full of matches is not a reachable state. Search matches id, family, tags and the
  name and blurb **in both languages**, folded (diacritics, tatweel, alef and ta-marbuta) — an
  Arabic instance still finds a preset by an English name it read about somewhere.
- **Eight families**, closed, describing the JOB and never the decoration: `editorial`,
  `minimal`, `journal`, `portfolio`, `reference`, `landing`, `gallery`, `letter`. **Every one of
  them has a module**, and that is a rule rather than a description of where the writing stopped.
  The chips are drawn from `PRESET_FAMILIES` unconditionally and count what is in the catalog, so a
  family with nothing behind it renders as a chip that is `disabled` on every instance, in every
  language, whatever anybody types in the search box — `landing` shipped exactly that, reading
  "Landing 0" beside seven live shelves. A filter that can never be switched on is not a filter; it
  is a promise of a shelf next to an empty one. The fix is a module, never a chip that learns to
  hide, because the alternative is a closed vocabulary carrying a dead word. `check-presets.mjs`
  is what keeps it true.
- **VISIBILITY, not hover, decides what is drawn for real.** The pointer no longer selects the
  one honest card: everything on screen is one (see Thumbnails above), and there is nothing left
  for a hover dwell to buy. The dwell that remains is a SCROLL dwell inside the
  `IntersectionObserver`, which no input device can starve — the old `onFocus` path armed the
  180 ms timer despite the comment above it promising keyboard readers an immediate render, and
  that disagreement is gone with the timer.
- **Selecting is a NAVIGATION, and the detail is a room with a door on it.** Opening a preset
  takes the shelf over (`.s-dsgp--detail`; the search bar, the chips and the grid go `hidden`)
  and the view opens with the three things a drilled-in screen owes its reader, in the order they
  are looked for: **back** at the inline-start as a real button with the word on it
  (`presetBack` / `presetBackToGallery`), **where** as a crumb `Presets › Kiosk` plus a position
  in the shelf being browsed (`presetPosition`, the FILTERED index — "3 of 11" inside a family,
  never "17 of 59"), and **what happens next** at the inline-end: the one accent button, with the
  state it changes from printed beside it (`presetPreviewOnly`, "Preview — not applied yet").
  Before this it was a sheet that unfolded above the grid whose only exit was a button called
  "Close" at the bottom of a column of copy, below the fold, beside the button that applies the
  preset to the site — and "Close" in a modal panel reads as "close the panel".
  - **The shelf is hidden, never unmounted**, so back is lossless: the query, the family chip and
    the cards' own DOM survive. The scrollport's offset and the card that had focus are recorded
    on the way in and restored on the way out — a keyboard reader who opened card 31 lands back
    on card 31, not on the search box. The scrollport is FOUND (nearest ancestor whose computed
    `overflow-y` scrolls), not named: it belongs to `.s-dsgr__controls`, which is another file.
  - **Esc unwinds one step.** `isPresetDetailOpen()` / `closePresetDetail()` are the same
    module-level precedence handle `SectionPicker` established and exist for the same measured
    reason: both layers listen in the capture phase, capture order is registration order, and the
    panel (mounted first) wins — so one Esc used to close the whole designer over an unsaved
    design when the reader only meant to leave a preset. The panel ASKS. Backspace also goes back
    (bubble-phase, and it stands down inside any field), and **← / → step along the shelf in the
    READING direction** — in an RTL shelf the next card is to the LEFT, and arrows that ignored
    that would walk an Arabic reader backwards through their own catalog.
  The detail also carries the real canvas at `clipHeight: 1400`, the
  blurb, the family, the theme swatch and its name, and two sentences that have
  to be said before somebody clicks — that a preset ships the shape and the words stay theirs, and
  that applying makes an editable copy the preset can never reach again. The right half also
  carries **what this page is made of** (the section manifest, glyph and name, in order) and the
  preset's **tags as FACETS**: every preset already ships a rich `tags` array ("wide", "grid",
  "uppercase", "masthead", "news", "dense", "headlines") and the only way to reach any of it was
  to guess the word into the free-text box. `presetMatches` already searches tags, so a chip is
  one `setText` away from being a filter.
- **"Start from blank" is the first tile**, always, dashed, and it is `createDesignDoc` — the
  stock defaults and nothing else.
- **THE GALLERY TAKES THE PREVIEW'S COLUMN** (`.s-dsgr__body--wide`, `tab === "presets"`). It is
  the one tab that is already a preview, and the only exception to the three-column rule below.
  Everywhere else the right-hand pane is the thing the author is looking at; on this tab it was
  drawing the DRAFT — the one document somebody comparing fifty-nine alternatives is not thinking
  about — or the words "no design yet" across 1.4fr, while the shelf it belongs to was folded into
  a 380px form column at **two cards across**. The gallery already answers everything that pane
  exists to answer, at three magnifications of its own: a miniature per card, a real
  `DesignCanvas` under the pointer after the dwell, and a full one in the detail sheet. Two columns
  here is not a smaller panel, it is the shelf at the size a shelf wants — measured five across at
  1440 and four at 1320. **`.s-dsgr__preview` is UNMOUNTED, not hidden**: it owns an iframe, a
  `MutationObserver` and a settle timer, and none of those should be running behind a surface that
  is not showing them (measured: 0 frames in the document while the gallery is open).
- **Browsing the whole catalog leaks nothing.** The live canvases are BOUNDED rather than singular
  now — the two or three screens around the reader — and every one of them is unmounted when it
  leaves that band, so scrolling to the end of the catalog and back leaves the document the size
  it started. The unmount, the 600 ms leave grace and the unmounted preview stage are what buy
  that, and a regression in any of them shows up here first.

### A SCALED PREVIEW IS ANCHORED PHYSICALLY, BECAUSE ITS ORIGIN IS PHYSICAL

`transform-origin` has no logical form. Every surface that draws a design smaller than life lays
the page out at a fixed width (`CANVAS_WIDTH` 1120, or a device width) and scales the pixels — and
the box being scaled is placed by FLOW, which IS logical. In `[dir="rtl"]` those two disagree by
exactly `layoutWidth − boxWidth`: the 1120px block aligns its RIGHT edge to the container's right
edge, so its left edge sits at negative x, and a `top left` origin scales it about a corner off
the side of the card.

That is not a cosmetic drift. Measured on an Arabic instance before the fix: every gallery card
drew its page at x −145…76 of a card at 754…975 — **entirely outside its own `overflow: hidden`,
so all fifty-nine cards were blank rectangles** — and the preset detail sheet drew a page clipped
to its right-hand third, which is the "preview shifted to the right" the owner reported. In
English the identical code is pixel-perfect, which is why this is a rule with a gate behind it
rather than a screenshot somebody remembers to take.

The rule: **in `scale` mode the page leaves flow** — `.s-dsgv--scale .s-dsgv__page { position:
absolute; top: 0; left: 0; transform-origin: top left }` in `presets.css`, with a physical `left`
so the anchor and the origin are the same corner in both directions, and **no `[dir]` rule at
all**. `DesignCanvas` writes only `width` and `transform` inline and must not write the origin
back. `native` mode keeps flow — it is not transformed and it has to scroll. `.s-dsgs__frame` (the
stage's iframe, `designer.css`) has always been arranged this way and carries the same note; it is
the pattern, not the exception.

**Gated by `scripts/check-designer-nav.mjs`** (`npm run check-designer-nav`, `PORT` +
`ASTROLABE_PASSWORD`; `LANGS` and `WIDTHS` override the `en,ar × 1440,1280` default). It measures the
drawn page's rect against its container's on the card and on the detail sheet, in both directions
at both widths (2px of sub-pixel slop and not one more), and drives the whole navigation model:
the crumb, the one-tab-stop rail with arrow/Home/End, the drill-in, focus landing in the room,
offset and focus restored on the way out, reading-direction arrows, and Esc unwinding one step
before it closes the panel. It finds the designer's door STRUCTURALLY (the status-bar icon
buttons, tried in turn) rather than by typing a word into the palette, because the palette
searches localised labels and would open nothing on the one instance this gate exists for. It
switches the instance language — it must, that is the point — and puts it back, on failure too.
Verified to FAIL on the pre-fix stylesheet with `dx −899` on the card and `dx −430` on the detail,
and to pass in English either way.

### Where you are, in the panel: `.s-dsgr__crumbs`

One line under the head, always: **`Design your site › <design> › <room>`**, with the middle
segment present only on the tabs that edit one document (the library tabs — Designs, Presets —
are a shelf OF designs, not a room inside one). The rail said which room and the footer said
whether anything was unsaved; nothing said which DESIGN, so a panel holding two of them looked
identical whichever was loaded and every control on every tab was editing a thing the screen never
named. The design's name is note-shaped text and is wrapped in `<bdi>` with the separators OUTSIDE
the isolate, the same rule every other note-derived chrome label follows; `›` is `Bidi_Mirrored`
and therefore gets no transform.

**The rail is a real tablist**: `aria-orientation="vertical"`, `aria-controls` the panel,
`tabIndex` roving with the selection so Tab always re-enters at the room the reader is in — eight
buttons that were each their own tab stop cost eight presses to cross a menu. Up/Down walk it,
Home/End reach its ends, and Left/Right are accepted too and follow the READING direction, because
the rail sits on the inline-start edge and a reader who just crossed between two side-by-side
columns with the horizontal arrows should not have to switch hands to walk the column they landed
in. Selection follows focus (an "automatic" tablist), which is right here because every panel is
instant and none of them loses anything on the way past.

**The panel's trail is drawn ONCE.** The preset detail names the open preset and nothing else
(`.s-dsgp-detail__crumbleaf`); it used to draw a root of its own — "Presets › Broadsheet" about
100px under the panel's "Design your site › Presets" — and two breadcrumbs on one screen saying
different things answer "where you are" twice, with the shorter one winning the eye.

### Getting into and out of the designer

The panel is a modal surface and goes through the same primitive as every other one:
**`useDialog(panelRef)`** (`client/a11y.ts`). It carried `role="dialog" aria-modal="true"` without
it, and all three halves were missing — measured at 1280×800 on an Arabic instance: focus never
entered the panel (after Enter on the status-bar glyph `activeElement` was still the glyph), ONE
Tab from the opener landed on the Settings gear BEHIND the modal (the whole app was tabbable
underneath it), and closing left the reader on `<body>`, which is precisely the "sent back to the
top of the document" failure `useDialog`'s restore half exists to prevent. Escape is NOT delegated
to the hook: the panel owns three inner layers (a `Select` popover, the section sheet, the preset
detail) and its own capture-phase listener is what knows their order — it now asks
`isConfirmOpen()` too, so an Esc meant for a question the panel just asked cannot close the panel
out from under it.

**Leaving with unsaved work asks first.** Esc, the `×` and a click on the backdrop all run the
same `requestClose()`: clean, it closes; dirty, it raises the standard confirm ("Close without
saving?" / Discard) and only closes on an explicit Discard. Esc used to discard silently — the bar
read "1 change not saved yet", one keystroke later the panel was gone and reopening it said
"Everything saved". The panel's own Esc comment argues at length against making Esc "a trapdoor …
with the design under edit still unsaved behind it" for the preset detail; this is the same
trapdoor one level further out.

## Site design engine — the composed pages

`settings.publicLayout` gains a third value, **`"designed"`**, beside `app` and `blog` (stock, the
default). This section covers the VISIBLE half of it: the home page a design composes, the article
page it wraps, and the composer that edits both.

> **How the engine is laid out.** The design engine was built in three parts, and they were
> reconciled into one before landing. There is exactly ONE design document
> (`shared/design.ts`, `DesignDoc`), ONE store (`server/designs.ts` →
> `ASTROLABE_DATA/designs.json`), ONE HTTP surface (`server/designRoutes.ts`, mounted at
> `/api/design`), ONE public renderer (`client/design/`) and ONE composer
> (`client/components/design/`). The chrome half of the document — nav, typography, header,
> footer — has its own module, `shared/designChrome.ts`, and hangs off the document as
> `DesignDoc.chrome`; it is a separate FILE, not a separate document, because two modules
> describing one file is how a store ends up with two ideas of what a design is. Stylesheets:
> `styles/design.css` (the rendered site) and `styles/designer.css` + `styles/composer.css`
> (the panel).

**THE STOCK BLOG IS A CODE PATH THIS NAMESPACE ONLY READS FROM.** `client/blog/` and
`styles/blog.css` are not mutated, forked, monkey-patched or conditionally branched — the diff is
the proof, and it is meant to be. Designed mode composes its OWN tree (`DesignedSite`,
`DesignedArticle`) out of the stock furniture it imports: `TagChips` and `PostMetaLine` from
`PostList.tsx`, `formatDate`/`NavLink`/`isRtlText` from `util.tsx`, `topicUrl` from `nav.ts`,
`Marginalia`, `renderMarkdown`, `bannerSrc`/`generatedBannerCss`, and the `.s-blog-heading`,
`.s-blog-meta`, `.s-blog-pn`, `.s-blog-share` and `.s-blog-related__*` classes by name. Reuse is
what makes a designed page and a stock page the same product; a fork is what would make them two.
Consequence, deliberately: an improvement to a stock component reaches designed mode for free, and
a designed page cannot drift from the design language without someone editing this namespace.

- **`schema.ts` is the wire contract, and `normalizeDesign(unknown)` is TOTAL.** It takes a parsed
  blob, a half-written file, `null`, `42` — and always returns a renderable `DesignConfig`. Wrong
  types are coerced or defaulted, numbers clamped, unknown section types dropped, duplicate ids
  regenerated, duplicate article parts collapsed, missing parts appended switched OFF, and a `body`
  part always present. **A corrupt design is therefore survivable exactly as a corrupt
  settings.json is**, and — the point of concentrating it here — no renderer below needs a single
  optional-chain on an option it declared. Verified: a config with `count: "many"`,
  `columns: 99`, `card: "banana"`, `enabled: "yes"`, a `"wormhole"` section, a duplicate id, a
  `null`, a bare `42` and `article: "not an array"` renders a correct page and prints no
  "undefined" anywhere.
- **The config is plain JSON with no derived state**, which is what makes flipping to stock and
  back LOSSLESS: nothing is computed at save time, so a retained design re-activates identically.
  `serializeDesign()`/`parseDesign()` are the export/import pair, and `stockDesign()` is both the
  starting design and what "reset to stock defaults" returns to — shaped as closely as sections
  allow to what the stock blog already renders, so turning the engine on is a starting point
  rather than a blank screen.
- **EVERY SECTION DEGRADES BY REMOVING ITSELF.** A section with nothing to say returns `null`, so
  a designed page can never show a heading over an empty box, a card grid with no cards, or a
  "Most discussed" rule above white space — the failure DESIGN.md forbids, on the marketing
  surface. Where a fallback beats a disappearance it is spelled out in the section's own comment
  rather than left to a `?.` in the JSX: the hero walks `note → latest → site` (an empty top of
  page reads as a broken site), and Featured falls back to the newest post. The page itself prints
  one honest `blogNothingPublished` line when the vault has nothing published — every section has
  correctly vanished by then, and a blank page is not an answer.
- **Every read goes through an endpoint the stock blog already uses, with the session's own cookie
  and `withPreview()`**: `/api/posts`, `/api/note`, `/api/graph`, `/api/comments?path=`. No section
  invents a data path, so no section can become a second, laxer door onto the vault. "Recent
  comments" is the one that had to be built rather than found — there is no site-wide visitor
  endpoint for it and there must not be one, since `/api/comments/all` is admin-only precisely
  because it enumerates — so it asks the per-note route (visitor-scoped, gated on publication) for
  the ≤8 posts `/api/posts` already said carry comments, and drops any thread that fails.
- **A note named by a design is resolved against the tree this session can see** (`resolveNotePath`
  — a title through the editor's own `resolveLink`, a path checked against `collectNotes`). Not for
  safety, which `/api/note` already provides: a section pointed at a deleted note would otherwise
  refetch it on every render and paint a red 404 in the console about a page behaving exactly as
  designed.
- **A custom markdown/HTML block goes through `renderMarkdown()`** — the reading renderer, hence
  `rawHtml.ts`'s sanitizer. `dangerouslySetInnerHTML` appears nowhere in the namespace, so a
  designed site is exactly as XSS-resistant as a published note. Guarded by `scripts/shoot-designer.mjs`,
  which feeds a block `<script>`, `<img onerror>`, `<iframe>`, `<svg onload>` and a `javascript:`
  href and asserts all five die while the prose survives.
- **Each section renders inside its own `SectionBoundary`.** A throw removes THAT section and
  reports `{ id, type, message }` upward; the page above decides what to do with it. The admin
  surfaces (`DesignedPreview`, the composer's footer) NAME the failing section and offer one-click
  revert to stock — "something went wrong" would leave the operator to find the block by switching
  sections off one at a time.
- **`store.ts` is a seam, deliberately thin.** `loadDesign()`/`saveDesign()` over a pluggable
  `DesignBackend`; the built-in one is this browser's localStorage and says so in the composer
  (`designBackendIsLocal()` → `dsnLocalOnly`). Whatever owns instance settings installs the real
  backend with `setDesignBackend()` at boot. A load that fails, is absent or is corrupt returns
  `stockDesign()` rather than throwing out of a boot path.
- **`entry.ts` is the namespace's ONLY point of contact with the app**: it mounts its own React
  root on `<body>` (the `toast.ts` / `openThemePicker()` pattern), so the whole integration is one
  `import "./designer/entry.ts"` in `App.tsx` — no store field, no prop chain, no line in App's
  render. Three admin-only doors: `openDesigner()` / `openDesignedPreview(path)` for a palette row
  or a Settings button to call, a `astrolabe:designer` window event, and `?designer=1` /
  `?designer=preview[&path=…]` in the URL. The panels are DYNAMIC imports — a visitor never
  downloads the composer.

**The composer.** Two tabs (home / article), a reorderable list, and a live preview of the real
components beside it.

- **Drag is not the only way to reorder.** `SectionList` rows are draggable *and* carry ↑/↓
  buttons, with Alt+↑/↓ from the focused row; the buttons are always there, not a small-screen
  fallback, because native HTML5 drag is unreachable with a keyboard and unreliable under a finger.
  A button move keeps focus ON the moved row — reordering is a repeated gesture, and a list that
  drops focus after each press turns three presses into three hunts for the button.
- **A locked row still moves.** The article `body` may be repositioned (everything above it is the
  header region, everything below the footer) but cannot be switched off or removed, and its switch
  and ✕ are ABSENT rather than disabled: an inert control is a question the reader answers twice.
- **The preview's width switcher is honest because designer.css states its breakpoints as
  CONTAINER queries** (`container-name: dsn` on `.s-dsn-home` / `.s-dsn-art`), so a 390px frame
  inside a 1440px window lays out exactly as a phone does. Media queries would have made the one
  surface that could catch a broken phone layout the surface that hides it. On the real site the
  container is the page, so the two agree. The frame is scaled with `zoom`, not a transform: a
  transform leaves the untransformed height behind and the stage scrolls a phantom.
- **Every control is one of OURS** (`components/controls/*`), for the reason the settings panel
  gives. The one addition is a `textarea` — the set had none because nothing in settings needed
  one, and a single-line input for a paragraph of prose is not a smaller version of the right
  control but the wrong one. A note is picked from a LIST of published posts, not typed as a path.
- **Reading-renderer furniture is hidden against the designed roots, not against `.s-blog`.** The
  renderer emits a frontmatter properties card and an inline banner for the app's reading view;
  the stock blog hides both with `.s-blog .s-rv-props` / `.s-rv-banner`, which is a rule about
  where the markup happens to be mounted. `designer.css` restates the same two facts (plus the
  marginalia measure, and the reading column's page padding) against `.s-dsn-home` / `.s-dsn-art`,
  so a designed page is correct wherever a shell mounts it — including a composer preview that is
  not inside `.s-blog` at all. Without it an article drew its banner twice.

**Gate:** `scripts/shoot-designer.mjs` (dev harness, needs playwright or `CHROMIUM=`). It shoots
the composer and the designed pages at 1440/768/390 in both languages across five themes, and it
asserts the behaviour that screenshots cannot: reorder + toggle + save round-trip through the
store, the starved design renders no orphan headings, the corrupt design renders at all, and the
sanitizer holds.

## The site designer — navigation, static pages, typography, header & footer

`settings.publicLayout` takes a THIRD value, `"designed"` (`app` | `blog` (stock, default) |
`designed`). What it selects is a composed site; what it must never do is disturb the one
underneath it.

- **THE STOCK BLOG IS A SEPARATE, PRISTINE, ALWAYS-WORKING BASE.** `client/blog/` and
  `styles/blog.css` are not forked, not patched and not conditionally branched: the designed
  shell (`client/design/`) composes its OWN tree — its own header, menu and footer — and mounts
  the stock article / topic / home components underneath as read-only leaves. Its stylesheet
  (`styles/design.css`) carries `.s-dsg` on EVERY rule without exception, so removing that one
  class leaves the stock rules and nothing else. A reviewer can confirm the whole guarantee by
  grepping the diff for `client/blog/`: the only edits there are none.
- **SWITCHING IS INSTANT AND LOSSLESS BOTH WAYS.** The design lives in
  `ASTROLABE_DATA/design.json`; the switch lives in `settings.json`. Nothing in `designStore.ts`
  reads `publicLayout`, so going back to stock is a setting change and NOTHING else — the design
  file is not touched, not cleared, not migrated — and going forward again returns it byte for
  byte. A rescue you cannot undo is not a rescue. `POST /api/design/reset` is the separate,
  deliberate act that removes the file (leaving the instance as a fresh clone is, rather than as
  a file full of explicit defaults that would shadow every future change to "stock").
- **A BROKEN DESIGN DROPS VISITORS TO STOCK, AND NAMES ITSELF TO THE ADMIN.** Three failure
  modes, one outcome: an unreadable `design.json` (`corrupt: true` on `/api/design/site`), a
  failed load, or a render-time throw caught by `DesignBoundary` — one boundary per section
  (`header`/`nav`/`page`/`footer`), because "the site is broken" and "the footer's third column
  is broken" are different facts and only the second is actionable. A visitor gets
  `<BlogShell/>` whole; the admin (a real admin session, or an admin previewing as a visitor)
  gets the designed site with the failing section held out, a notice naming it, and one click
  that PATCHes `publicLayout` back to `blog`. The boundary resets on a `resetKey` (config +
  route), never on `children` — an identity comparison there is a new element every render and
  turns one broken section into an infinite render/throw loop.
- **A CORRUPT DESIGN FILE IS SURVIVABLE EXACTLY AS A CORRUPT `settings.json` IS.** `readRaw()`
  never throws: one `console.warn`, an empty document, and `normalizeChrome()` fills the stock
  values. Unknown top-level keys are preserved verbatim on every write (the settings.ts rule) —
  the document is shared, `chrome` is one slice of it, and a client that has never heard of
  another key must not delete it.
- **TWO VALIDATORS, ONE SET OF RULES** (`shared/designChrome.ts`, pure — no fs, fetch, React or
  DOM). `normalizeChrome(raw)` is LENIENT and never throws: every READ goes through it, on both
  sides. `validateChrome(raw)` is STRICT and throws `DesignError(path, code)`: every WRITE goes
  through it. They agree on what is legal and differ only in what they do about an illegal
  value, which is the difference between "an operator typed this just now" and "this is what is
  on disk". `server/designApi.ts` maps the code onto `VaultError(400, …, code)` so the client
  translates a stable name rather than printing English prose.
- **BOUNDS ARE THE FEATURE.** `TYPO_BOUNDS` is the single table behind the designer's sliders,
  the strict validator and the lenient clamp — a control physically cannot offer a value the
  PATCH refuses. Body 15–21px, measure 58–86ch, line height 1.2–1.9, weight 400–800, scale
  1.10–1.414, heading tracking −0.02–0.12em, rhythm 0.75–1.6. Heading SIZES are derived
  (`base × ratio^n`, `typographyVars()`), not six independent fields: six fields is six ways to
  put an h3 above its h2. Colours are never a design input — a design decides size, weight,
  rhythm and arrangement; the twenty-one themes stay twenty-one themes.
- **THE LINE-HEIGHT FLOOR IS 1.2 BECAUSE DENSITY IS A LOOK.** It was 1.4, which is the right
  floor for prose in a proportional face at a comfortable measure and was written as if that
  were the only page a design could be. A console, a ledger or an index — anything set in the
  mono stack at a narrow measure — reads wrong at 1.4: a monospaced line is shorter and its
  glyphs are already spaced, so the leading a serif needs makes a terminal look like a form.
  1.2 is where ascenders and descenders on adjacent lines still clear each other in every stack
  shipped, which is what a floor is for.
- **A DESIGN NAMES A STACK, AND MAY NAME THE FACE INSIDE IT.** `headingFamily` / `bodyFamily`
  are `serif` | `sans` | `mono` — the three stacks `tokens.css` defines and Settings → Typography
  fills. `mono` exists because a console site is a real thing an author wants and every designed
  page used to resolve to one of two stacks, so the terminal look died at the first paragraph.
  Beside them, `typography.headingFont` / `bodyFont` / `monoFont` are OPTIONAL catalog ids
  (`shared/fontCatalog.ts`), and they are the difference between fifty-nine designs arguing about
  margins in one typeface and fifty-nine designs. Absent is the default and a real answer: the
  role resolves to the instance's stack exactly as before the fields existed. `headingFont` and
  `bodyFont` name a face for a ROLE; `monoFont` names the design's MONO STACK, so it dresses code
  inside the author's prose (`--dsg-mono-font`) *and* is what a role set to the mono family
  resolves to when it names no face of its own — which is what makes a console design one
  decision instead of three. **Catalog ids only, never an uploaded `custom:` face:** a design is
  exported, imported and shipped as a preset, and a file on one machine names nothing on another.
  An unknown id is a named 400 from `validateChrome` and a silent drop from `normalizeChrome`,
  the same split every other design field has; `check-presets` asserts the catalog membership of
  every id in the shelf, because a dropped face is a preset that sells a typeface it never sets.
- **THE FACE IS ALWAYS IN FRONT OF ITS STACK, NEVER INSTEAD OF IT.** `typographyVars()` emits
  `--dsg-head-font: "AstrolabeDsg-prose-eb-garamond", var(--font-serif)`. A face that is still
  downloading, whose cache was hand-deleted, or that this instance has never fetched simply has
  no family behind the name, the token answers, and the page is the page it would have been. A
  broken face is a visitor's non-event, like a broken design. Measured: with the cache removed,
  the masthead rendered at exactly the width the system stack gives it, with no notice and no 404.
- **THE FAMILY NAME IS THE CONTRACT BETWEEN THE TWO HALVES.** `designFontFamily(id, slot)` =
  `AstrolabeDsg-<slot>-<id>`, computed from the DESIGN ALONE — `typographyVars()` runs on a
  visitor's page and knows nothing of `settings.json`, so the name it writes must be derivable
  without it, while the server, which does know the slots, emits a family under exactly that
  name. The slot is part of the name because it changes what the family CONTAINS (see the
  Arabic rule under Typography), so `amiri` under `prose` and under `mono` are two families.
- **A DESIGN DECIDES ONE SCRIPT AND INHERITS THE OTHER.** The face a design names becomes the
  half of the composite its own coverage says it is — a Latin family is the Latin half, a family
  covering Arabic is the Arabic half — and the OTHER half comes from `settings.fonts`, from the
  slot the design's family choice points at (serif → `prose`, sans → `ui`, mono → `mono`). It is
  the instance-wide composite mirrored per design, so a mixed line still picks per character. A
  design cannot name both halves ON PURPOSE: an Arabic vault has already declared its naskh face
  in Settings → Typography, that declaration is about the language the site is WRITTEN in rather
  than the arrangement of a page, and a portable preset applied by a stranger must not be able to
  replace it. The operator's `arabicSizeAdjust` override travels only with the pairing it was
  measured for — a design that names its own Arabic face gets the catalog's measured number for
  that family instead.
- **THE DESIGNER'S THREE SURFACES ARE SERVED BY TWO STYLESHEETS AND NO MORE.** A published
  design's faces ride on `/api/site-fonts.css` (below). The DRAFT's faces, and the preset
  gallery's, ride on `GET /api/design/fonts.css?ids=<slot>:<id>,…` — admin-only, because it can
  trigger a download — linked once into `document.head` (`client/design/designFonts.ts`) as the
  UNION of what the panel is drawing. One link is enough for all of it: the gallery's cards are
  real canvases in the app's own document, and the preview frame CLONES `document.head`, so the
  same href dresses the pane, the cards and the article specimen — under the LIVE SITE's family
  names, not a "preview" prefix, because the whole point is that the pane shows what will ship.
  The node is REPLACED rather than re-pointed when the union changes: `PreviewFrame` watches the
  head for child-list changes and would never see an `href` attribute move. The union is capped
  (24 refs); presets share faces by construction, and past the cap a card paints in the
  instance's stacks, which is the same graceful nothing an undownloaded face produces.
- **TRACKING IS THE CASE'S NEED PLUS THE AUTHOR'S INTENTION.** Uppercase and small caps carry
  0.045em whether or not anybody asks (without air they are a wall); `typography.tracking` is
  what the author adds on top. `typographyVars()` emits the author's value raw as
  `--dsg-tracking` and the sum as `--dsg-head-tracking`, which is the one the stylesheet reads —
  so a design that says nothing gets exactly the spacing it had before the control existed.
- **A DROP CAP IS LATIN-ONLY, AND THE PARAGRAPH'S OWN DIRECTION DECIDES.** `article.dropCap`
  sets an initial cap on the article's first paragraph and nowhere else; the rule is guarded by
  `:dir(ltr)` on the `<p>` (which the reading renderer writes as `dir="auto"`), so an Arabic post
  on an English site and an English post on an Arabic one each get the right answer — the same
  rule the byline follows. Arabic is cursive: floating the first letter out of the line makes the
  browser draw it in isolated form with the joint to its own word broken, and the opening word
  of the article is then misspelled in the largest character on the page.
- **THE MEASURE IS EMITTED TWICE.** `--dsg-measure` (ch) caps the PROSE, because a character
  count is what the control means; `--dsg-measure-px` caps every wrapper around it, because a
  `ch` resolves against each element's own font-size and the page column, the article header and
  the footer grid would otherwise each land on a different width.
- **THE COMPOSED PAGE WEARS THE TYPOGRAPHY TOO.** The vars reached the article page, the reading
  renderer and the header wordmark, and stopped at the four titles the HOME page is made of — a
  hero, a section heading, a card title, a list row — which were `var(--font-serif)` at a fixed
  rem. The consequence was not subtle: a design at weight 800 in uppercase sans and one at
  weight 400 in serif drew the same front page, so nine controls and fifty-nine presets differed only
  in palette and arrangement. All four now take `--dsg-head-font/-weight/-transform/-variant/
  -tracking`, and their sizes come off the same modular scale as everything else (`--dsg-h1` for
  a hero, `--dsg-h3` for a section heading and a list row, `--dsg-h4` for a card), so no legal
  combination can invert the hierarchy. Excerpts and a hero's sub take `--dsg-body-font`. Every
  var carries its old value as the fallback, so a page rendered without them is unchanged.
  Three more held out and were found by rendering a design in the mono stack rather than by
  reading: the `richText` box (`var(--font-serif)` at `var(--font-prose)`/1.7), the call-to-
  action's heading (a fixed 1.2rem serif) and the designed article's own `h1` (a clamp with no
  design in it). A stack a reader can name in one glance is the test this rule needs — a mono
  design whose prose, its section heads, its call and its headline are not all mono has a
  traitor left in it.
- **A MASTHEAD SHARES THE PAGE'S COLUMN.** `stacked` and `stackedStart` headers are capped at
  `--dsn-width` and centred: the header block has no ground of its own, so a full-viewport one
  put the wordmark at the window edge while the sections sat in a 760px column. `inline` is
  exempt on purpose — it is a bar, it has its own row cap, and it is the one layout allowed to
  be wider than the writing.
- **NAVIGATION IS HAND-BUILT, AND VISITOR-SCOPED SERVER-SIDE.** Items are `home` / `note` /
  `page` / `topic` / `url` / `group`, ≤ 20 top level, ≤ 12 per submenu, ONE level of nesting
  (a second level is a 400, not a silent flatten). `visitorNav()` drops every hidden item, every
  item whose note is not `isNoteVisibleToVisitor()`, every topic in `excludedTags()`, and every
  group left with no children — so a menu can neither ship a dead link nor name an unpublished
  note's path to an anonymous reader. The item stays in the STORED design: unpublishing a note
  for a week must not delete the menu entry pointing at it, and the builder flags it instead.
  URL targets are `http(s)://…` or site-relative `/…` only (no `javascript:`, no `data:`, no
  protocol-relative `//host`), and note targets are re-checked with `normalizeRel` + `safeAbs`
  server-side: only the server can answer "does this path stay inside the vault".
- **STATIC PAGES ARE A FRONTMATTER FLAG, `page: true`** (`server/pages.ts` documents the choice
  against a designated folder: a page keeps its place in the vault, its wikilinks and its
  permalink, and the flag is reversible in one keystroke). A page must still be `publish: true`.
  It is read on every index (`NoteRecord.page`) and ACTED ON only when `staticPagesActive()` —
  i.e. in designed mode — which is what keeps the stock feed bit-for-bit what it was:
  `posts(visitor, excludePages)` is called with `false` everywhere the stock blog calls it. In
  designed mode the page leaves `/api/posts` and `/feed.xml` and renders through `PageView` (no
  date, no reading time, no tags, no prev/next, no related). `GET /api/design/pages` lists them,
  visitor-scoped like everything else.
- **API** (all under `/api/design`, mounted below the auth guard): `GET /site` (anyone —
  visitor-scoped chrome + pages + `corrupt`), `GET /pages` (anyone), `GET /` (admin; 404 to
  visitors like `/api/settings` — it names hidden items, unpublished notes and an absolute path),
  `PATCH /` (merge a partial chrome per SECTION — a list is replaced wholesale, since "moved to
  the top" and "deleted" are the same diff to a field-wise merge), `PUT /` (import a whole
  document, ≤ 256 KB, unknown keys kept), `POST /reset`.
- **A REFUSAL IS PRINTED, NOT REPLACED.** `client/design/api.ts` builds a `DesignApiError`
  carrying the server's exact sentence, and every catch in the panel used to throw it away for a
  static `designSaveFailed` / `designImportFailed` — so a precise 400 (`sections[0].markdown: is
  too long (20000 characters max)`) reached the author as "Could not save the design", naming
  neither the field nor the reason, and the 500-instead-of-400 defect above was invisible in
  practice for exactly that reason. `designErrorText(err, fallback)` prints a 4xx's own message
  (the server is saying something about THIS document) and falls back to the panel's sentence on a
  5xx or a dropped connection (which say only that something broke). The import file is also
  size-checked against `API_BODY_MAX` BEFORE it is read: the server 413s an 11 MB body and always
  did, but by then the admin's tab has read and `JSON.parse`d the whole thing, and a `File` knows
  its own size for free.
- **The designer** (`client/components/design/`) is a DRAFT surface: every control writes to a
  draft, the preview redraws from the draft, Save is one request. The preview renders the REAL
  components with the REAL derived tokens — a preview built from a second rendition is a preview
  of the rendition — but never routes: no nav handler, no `pushState`, clicks swallowed at the
  container, and a specimen body instead of a fetch. Its door is one palette row (the theme
  picker's precedent: what it opens is a browsing-and-building surface, so it is one row, not
  five), and it mounts a root on `<body>` like `openThemePicker()`.

## The designer is a DESIGN TOOL, not a settings form

The panel that composes a design (`client/components/design/`, `styles/designer.css` +
`styles/composer.css`) is the surface this whole feature is judged on: a home page is an ORDER
before it is anything else, and an order you cannot rearrange with your hand is a list of settings
wearing a designer's name. What follows is normative for that panel.

### THE DESIGN'S COLOUR IS CHOSEN BY LOOKING AT IT

`DesignThemeCards` (`client/components/design/DesignThemeCards.tsx`) — "Site default" plus the
built-ins plus every custom theme, as swatch cards painted from the CONSTANT `--swatch-<id>-*`
tokens through the same `[data-theme-swatch]` hook the theme picker and the builder already use.
It is the rule the ThemeBuilder states, applied to the other control that decides a palette; a
retuned theme moves here with no second table to update.

This was a `<Select>` whose options were `["", ...customThemes]` — the instance's HAND-BUILT
themes and nothing else. On a fresh instance that is exactly ONE row ("Site default"), the
control's own value rendered as the raw slug `iron-gall` with no label and no colour, and not one
of the built-in themes was reachable: after applying a preset an author could keep the
colour it shipped or destroy it, and nothing else. The field's own hint says the value is "forced
on readers who have not chosen a theme themselves", so the single control that decides what every
first-time visitor sees was inoperable — against WordPress's Customizer colour panel and
Squarespace's palette picker, disqualifying on its own.

Two details are load-bearing. **"Site default" is a real choice, not an empty row**: it carries no
swatch attribute, so its card inherits the live document's `--bg/--text/--accent` and draws the
room the app is standing in — "the reader's own", which is a decision an author makes on purpose.
And **a custom theme's card is painted from its own overrides where it has them and from its
base's swatch where it has not**, which is exactly what a sparse layer over a built-in is.

(It is also a popover that cannot be misplaced. The old `<Select>` opened UPWARD and covered the
design rows above it, including the "ACTIVE" badge on the design being edited.)

### TWO MORE DOORS, BECAUSE ONE WAS THE COMMAND PALETTE

`openDesigner()` had exactly one call site in the whole client (`CommandPalette.tsx`). The Settings
modal carried the `publicLayout: "designed"` segment with no link to the designer, and there was
no sidebar, status-bar or gear entry — so an operator who flipped the switch landed on a designed
site with no design and no signpost to the tool, and the entire feature was behind Ctrl+P and a
guess at the word. It now also opens from:

- **the status bar**, beside the gear — where an admin already goes to change what a visitor sees;
- **Settings → Publishing & comments**, in the row directly under the layout segment. The row that
  just taught somebody the word "designed" is the row that has to hand them the tool.

Both are the same `openDesigner()`; the settings door closes the settings modal first, because two
stacked dialogs is not a place. (Arabic discoverability came with it: the palette matched only the
exact label «صمّم», so the noun everybody types, «تصميم», answered "no results". It is in the row's
HINT now, which the palette already searches — "typing what you can read must never answer no
matches".)

### The three columns, and the laptop that decides them

`.s-dsgr__body` is `186px · minmax(380px, 1.05fr) · minmax(0, 1.4fr)` — rail, controls, preview —
and the panel is `min(1520px, 100%)` by `min(940px, 100vh - 32px)`. The numbers are one argument:
a form column that grows past ~460px is a form with nothing in the middle of it, so every pixel
past that belongs to the preview, which is the thing the author is actually looking at.

**1280×800 keeps all three columns.** It is the smallest screen this surface is designed for, and
a designer that hides the design at the size most people own is a designer for demos. What gives
first is the ROW, not the pane: below 1320 the section card wraps to two lines (what it is on top,
what you can do to it underneath) so a section name is never two words wide. The preview is
dropped only below 1040, where it would be a thumbnail of a thumbnail.

**The one exception is the presets tab**, which is two columns at every width (`--wide`): the
gallery IS a preview surface, so the pane beside it had nothing left to say and was spending the
larger share of the panel saying it. See the gallery contract above — that is the only tab allowed
to claim the third column, and it claims it by UNMOUNTING the stage rather than hiding it.

### The rail is grouped and drawn

Eight words in a column is a menu. The rail carries four named runs — *Your designs*, *The page*,
*The look*, *Keeping* — and every row carries the SHAPE of what it opens (`PanelGlyphs.tsx`), so
the column is scanned by picture and confirmed by word. The active row is `--accent-soft` with a
2px `--accent` bar on its LEADING edge, which is the rule every active row in this product already
follows; the bar is transparent at rest so nothing shifts when it lights. Each tab carries
`data-tab`, which is how a gate reaches one. Labels WRAP rather than ellipsing — an ellipsis in a
rail of eight rows eats the one word that distinguishes "Header & footer" from "Pages".

### The board (`SectionList.tsx`)

**THREE WAYS TO MOVE A ROW, and all three are first-class.** Drag it by the grip; press the ↑/↓
buttons; or lift it with the KEYBOARD — Space on the grip, arrows to move, Space or Esc to set it
down. The buttons are not a small-screen fallback (a control that exists only on one input device
is a control half the readers do not have) and the keyboard lift is not a consolation prize: it
moves the row the same way the drag does and says so through an `aria-live` region ("Hero is now 3
of 7"). `Alt+↑/↓` still moves the focused row from the row itself.

**POINTER EVENTS, NOT HTML5 DRAG.** `draggable` gives a browser-drawn ghost nobody can style, no
touch support worth the name, and a `dragenter` stream that fires against the row under the GHOST
rather than under the finger. One pointer path serves mouse, pen and touch, the grip is
`touch-action: none`, and the "ghost" is the row itself, lifted.

**A drag shows where it will land, and it takes both halves.** The rows the lifted card has passed
slide out of its way (160ms) so there is a real slot, and a dashed accent SOCKET the size of the
card is drawn in that slot — a caret alone lands under the card the reader is holding, and a gap
alone says "somewhere around here". The list is NOT reordered until the reader lets go:
rearranging under a pointer that has not committed is the board deciding for them. (The row that
draws the socket is the one BELOW the slot, except at the end of the list and except when that row
is the lifted one, whose pseudo-element travels with the pointer.) The scrolling column follows
the pointer at its edges, or a twenty-section design can only be reordered one screen at a time.

**Moving a row keeps focus on THAT row** — by button, by keyboard and after a drop. Reordering is
a repeated gesture, and a list that drops focus after each press turns three presses into three
hunts for the button. Reordering a keyed node blurs it, so the lift survives on a `refocus` guard
rather than on `onBlur` alone.

**A row shows what it IS**: its position, a wireframe glyph of its kind (`SectionGlyph.tsx`), its
name, its hint, then the moves, the switch and the ✕. A locked row keeps its position controls and
its switch and ✕ are ABSENT rather than disabled. One row's options are open at a time and they
open IN PLACE, under the row, over 160ms of height and opacity.

**Glyphs are `currentColor` and `aria-hidden`, always.** They inherit the row's own token
(`--text-muted` at rest, `--accent` when hovered or open), so they are correct in every
theme and on all three grounds without a rule of their own; their interior shading is opacity over
a picture, never over `--text-faint`, which is at its floor already; and no shade of one carries a
fact the words beside it do not.

### Adding a section is a picker of pictures (`SectionPicker.tsx`)

The eight kinds are eight SHAPES and their names are the least informative thing about them, so
every option is illustrated with the same wireframe language the rows and the gallery miniatures
use. The sheet opens IN FLOW under the button rather than as a popover — a popover inside a
scrolling pane is a popover that pane will clip — focus lands on the first option, and Esc closes
it and hands focus BACK to the button.

**`isSectionPickerOpen()` is why Esc works at all.** The sheet and the panel both listen for Esc in
the CAPTURE phase on `window`, capture order is registration order, and the panel is mounted first
— so one Esc closed the whole designer out from under an open picker, measured. `stopPropagation`
inside the sheet cannot fix that; it runs second. The OUTER surface asks whether an inner one owns
the key, which is exactly the precedence `isSelectOpen()` already keeps for the Select popover.

### Empty states invite

An instance with no design opens on the PRESETS tab, so that IS the first screen: fifty-nine
finished sites, two columns wide, each already drawn in its own colours against the operator's own
posts. It opened on the Designs tab before, which spent ~55% of a 1440×900 dialog on dark
emptiness with a one-line "No design yet" in the preview column — and that screen is the moment
the WordPress comparison is won or lost. The invitation is still on the Designs tab for anybody
who goes back: three section glyphs, "Nothing designed yet", the sentence that says posts fill a
design in immediately, and the two doors (*Browse the presets*, *New design*). A design with no sections says "An empty page,
waiting" and names what a page is made of. Neither reports the absence of a list, and the tab's own
instruction line is withheld while there is nothing to instruct — "drag a row, or move it with the
arrows" over a panel with no rows in it is directions to a thing that is not there.

### The save bar is a STATE

Nothing in the panel reaches the public site until Save, so the bar's whole job is to make "there
are decisions in the air" impossible to miss: clean it is a hairline and a muted line; dirty it
takes an accent rule along its top edge, a raised ground, a pulsing dot and a COUNT.

`countChanges()` counts the way an AUTHOR counts, and that is the reason it is not a leaf-wise diff
of two blobs: moving one section in a list of seven rewrites six array slots, and a bar reading "31
changes" after one drag is worse than no number. So sections are compared BY ID (one change for an
edited section, one for each added or removed), the ORDER counts once and only over the sections
both documents share (an add already counted itself; a move made in the same sitting is a second
decision and must show), and the rest of the document is compared leaf by leaf, where a leaf is one
control. The count goes through `countPhrase(n, "changes")`, so Arabic gets its real plural forms
like every other count in the product. A dirty draft with no countable change still says "Unsaved
changes" — true, and there is no honest number to print.

`Ctrl/Cmd+S` saves, and it is SWALLOWED either way: the browser's own Save dialog over a design
panel is a jump-scare, not a feature.

### A DIFFERENT SITE ARRIVES; IT DOES NOT CUT

Applying a preset or opening another design replaces the entire page in the preview pane, and a
hard cut between two complete sites reads as a glitch rather than as the choice somebody just
made. `PreviewStage` cross-fades on a change of `design.id` — 280 ms, once, and never on first
render, because a pane that animates its own arrival every time the designer opens is an animation
about nothing. An edit to the SAME document still updates in place; that is the 120 ms settle and
it must not be dressed up. The keyframe writes OPACITY ONLY: the frame carries an inline
`transform: scale(k)` the stage computed, and a keyframe that also wrote `transform` would snap
the device to the wrong size for the length of the fade.

### Motion is 150–200ms and it is a preference

Rows settle when they land (200ms), options and the picker arrive rather than appear (160–170ms),
the controls column cross-fades when the rail moves (`key={tab}`, 160ms), the add button's `+`
turns into a `×`, and the preview settles on the trailing edge of a burst of edits (`PreviewStage`).
Every one of those is 150–200ms of MEANING and none of them is the only carrier of that meaning, so
`prefers-reduced-motion: reduce` drops the animation and keeps the fact. Verified with the panel
under `reducedMotion: "reduce"`, in RTL, at 1280×800, and on light and dark themes.

## Webmentions and the fediverse (`server/federation.ts`, `server/webmentions.ts`, `server/activitypub.ts`)

*Self-contained: `shared/mentions.ts`, `shared/fediverse.ts`, `server/safeFetch.ts`, `server/jobQueue.ts`, `server/federation.ts`, `server/webmentions.ts`, `server/webmentionRoutes.ts`, `server/activitypub.ts`, `server/activitypubRoutes.ts`, `client/mentions/`. Docs: `docs/webmentions.md` and its Arabic twin. Tests: `webmentionParse`, `webmentions`, `activitypub`, `federation`.*

- **Three switches, all off.** `webmentions.accept`, `webmentions.send`, `fediverse.enabled` (each stored only when true) and `fediverse.handle` (`shared/fediverse.ts`: `[a-z0-9_]{1,30}`; unset = the site name folded, else `blog`). Off, each door is absent: `POST /webmention` 404s, WebFinger/NodeInfo/the inbox 404, `/actor` and the outbox fall through to the SPA, the head carries no `rel="webmention"`, the reconcile skips the feature. The pocket refuses the keys and answers `/api/webmentions*` 501.
- **ONE RULE FOR WHAT MAY LEAVE: `federablePosts()`.** `publicReads()` and `posts(true, siteScope().lang, staticPagesActive())` — published, listed (no template, no library lesson, no designed static page), not curated away by the language filter as the site speaks with no reader. It decides a webmention's target (`pathForUrl`, which also resolves `LEGACY_HOSTS`), a send's source (checked when queued AND when sent), the outbox, content negotiation, what a Like/Announce/reply may be about, and what is delivered. `tests/federation.test.ts` holds every door to it for a draft, a published template, a published lesson and a filtered note, and PUBLIC=false.
- **Publish is a RECONCILE, not a hook.** `reconcile()` (after the vault settles — a 1.5 s debounce on `onEvent` — on a one-minute tick, and when the Publishing status is read) compares the federable set and each page's content hash (mtime-gated) against each feature's own ledger (`webmentions.db` `pages`, `activitypub.db` `posts`) and hands it `published` / `changed` / `unpublished`. An empty ledger is a BASELINE: recorded, acted on not at all — turning a switch on never sends the archive. No origin (no `SITE_URL`, no request yet) = no action, ledger kept.
- **Receiving.** `POST /webmention` (8 KB body cap, 20/min/IP, 500 waiting) refuses without the network what it can; the rest is a `receive` job: `safeFetch` (public addresses only, checked at the socket's `lookup`; 1 MB, 10 s, 3 redirects), `linksTo` (an href/src/data/cite attribute, never words), `parseMention` (first h-entry: repost-of, like-of, in-reply-to OF THIS TARGET, else mention; h-card author, photo; e-content as plain text ≤ 2000), filed in `comments.db` as `kind: "webmention"` **hidden**. `seen (source, target) → commentId`; 410/4xx or no link on a later fetch withdraws. "Verify again" is `POST /api/webmentions/:id/verify` → `filed|updated|withdrawn|dropped|unreachable`.
- **Sending.** `outboundLinks()` reads the note the way `render.ts` renders external links (`[t](http…)`, `<http…>`, bare, raw `<a href>`; never wikilinks, images or code); same-host targets are dropped. `sent (source, target) → hash, status` — a republish sends only where the hash moved, removed links included. Endpoint discovery: `Link:` header, then the first `<link>`/`<a rel=webmention>`. Statuses: `queued`, `sent`, `noEndpoint`, `failed`, `skipped`. The Sent panel shows the newest 50.
- **ActivityPub.** Actor at `/actor` (`Person`, handle, site name, tagline, logo/favicon icon, home banner image, `publicKey`; RSA-2048 generated once into `ASTROLABE_DATA/activitypub-key.pem`, 0600). Object id = page URL; `Note` when the stripped text is ≤ 500 characters, else `Article` with `name`; `contentMap` keyed by `postLanguage()` (the filter's 40 % Arabic rule); tags as `Hashtag`; banner as an attachment. Outbox paged by 20. Followers collection = a count only. HTTP Signatures rsa-sha256 over `(request-target) host date digest` both ways (`hs2019` accepted in), Date within 12 h, Digest required on POST; the key is fetched from `keyId` (signed GET), cached a day, refetched once on a failed verify. Inbox: Follow (auto-Accept), Undo Follow/Like/Announce, Like/Announce → `kind: "activitypub"`, `type: like|repost`, visible; Create/Note `inReplyTo` a federable page → `reply`, hidden; Delete removes by `ref` AND source actor. Deliveries (`deliveries` table): Create on publish, Update on change, Delete (Tombstone) on unpublish, shared inbox preferred; 410 drops that inbox's followers.
- **Queues.** `server/jobQueue.ts`: rows in the feature's own db, one job at a time, `RetryLater` retried after 1 min, 5 min, 30 min, anything else finished. The db files and the key never travel with the vault (`configMirror.ts`).
- **Surfaces.** Publishing tab rows: Accept webmentions, Send webmentions (the Sent panel in its `after` line), Fediverse (address + follower count in its `after` line), Fediverse name — the tab at 14 rows. The moderation panel (both shells) shows `InteractionMeta` (channel, gesture, source) and `VerifyAgain`. `Mentions` sits under `Marginalia` in `BlogArticle` and `ReadingView`: likes/reposts as 32 px faces (44 px coarse), replies/mentions as comment cards; it renders nothing when the list is empty. `GET /api/webmentions?path=` answers `[]` (not 404) for a published note with nothing to show, so the section's one request is never a console error.

## Smaller rules

- **The blog's sticky masthead is OPAQUE.** It was `--bg` at 86% over a 12px backdrop blur, and a
  blurred-but-legible sentence is still a sentence: at 390, where the column is narrow and there is
  always prose under a 52px bar, "something the author put there." read clean through the word
  TOPICS. Blur softens contrast; it does not stop a reader parsing letterforms. The two hairlines
  are what separate the bar from the page, as they always were.
