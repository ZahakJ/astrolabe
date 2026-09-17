# Configuration

*Every `.env` key, the Settings panel inside the app, and which of the two wins when both say something.*

← [Back to the README](../README.md) · [All docs](README.md)

---

There are two places to configure Astrolabe, and they mostly cover the same ground.

1. **An `.env` file.** This is a plain text file next to the app, one `KEY=value` per line. The
   server reads it once, when it starts. To change something here you edit the file and restart.
2. **The Settings panel.** This is inside the app itself. When you change something there, the
   server writes it to a file called `settings.json` in its data directory, and the change takes
   effect immediately. No restart.

Most settings exist in both places. When they disagree, **the Settings panel wins**: a value saved
in the panel overrides the same key in `.env`. If you clear the field in the panel, the `.env`
value takes over again. A few keys are the exception: the security-sensitive ones (the password,
the session secret, the port, and so on) live in `.env` only, and the panel never shows or
changes them.

## Environment variables

An *environment variable* is a named value the server reads when it starts. You can set it in
`.env` or in the shell that starts the server; either way it reaches the same place.

The npm scripts load `.env` on their own (`node --env-file-if-exists=.env`), so you never need
`export` or `source`. The file `.env.example` in the repository root lists every key with a
comment explaining it. The table below is the short version.

| Key | What |
| --- | ---- |
| `PORT` | The port the server listens on (default 6801) |
| `HOST` | The address the server listens on (default `0.0.0.0`, which means every network interface). If you listen on anything other than the local machine *and* have no password, the server prints a loud warning at startup: anyone who can reach the port is an admin |
| `ASTROLABE_VAULT` | The vault folder — the folder that holds your notes (default `./vault`). A `--vault <path>` argument on the command line takes precedence over this |
| `ASTROLABE_DATA` | The server's data folder (default `./data`). It holds `settings.json`, the comments database (SQLite), your `custom.css`, `designs.json`, the git credentials file, the [clipper's token](capture.md#the-clipper) (`clip-token`), `fonts/` (your own font files, plus the cached catalog in `fonts/catalog/` and uploads in `fonts/custom/`), `versions/` (note history), `author-sites.json`, and the three ledgers that are yours rather than the machine's: `layouts.json`, `books.json` and `annotations.json`. Six of these files — `settings.json`, `designs.json`, `custom.css`, `layouts.json`, `books.json`, `annotations.json` — and the `fonts/` folder are mirrored into `<vault>/.astrolabe/`, a dot-folder Obsidian never lists, so a second server over the same vault starts from them (see [Settings travel with the vault](backup-and-sync.md#settings-travel-with-the-vault)) |
| `ADMIN_PASSWORD_HASH` | The admin password, stored as an argon2id *hash* — a fingerprint the server can check a password against but cannot turn back into the password. `npm run hash-password` makes one. When it is not set, the app runs in *open local mode*: no password, everyone is an admin |
| `SESSION_SECRET` | A long random string used to sign login cookies (the small token your browser keeps to prove you are signed in). When it is not set, the server invents a new one at every startup, so every restart signs you out |
| `PUBLIC` | `false` requires login even to read notes (default: reading is public, editing needs login). **The server refuses to start with `PUBLIC=false` and no `ADMIN_PASSWORD_HASH`** |
| `SECURE_COOKIES` | `true` or `false` to force the `Secure` flag on the login cookie. When it is not set, the server decides from the request: HTTPS gets the flag, plain HTTP does not (a trusted proxy can say HTTPS through `X-Forwarded-Proto`) |
| `TRUSTED_PROXIES` | Comma-separated IP addresses, or address ranges in CIDR notation, whose `X-Forwarded-For` and `X-Forwarded-Proto` headers are believed (for example `127.0.0.1,::1`). When it is not set, both headers are ignored and the rate limit counts by the connecting address |
| `HOME_NOTE` | The note a first-time visitor lands on, as a path inside the vault, for example `index.md` |
| `COMMENTS` | `on` (also `true`, `1`, `yes`) lets readers leave comments under published notes (default off) |
| `NOTE_VERSIONS` | `off` (also `false`, `0`, `no`) stops the app keeping a copy of every note before each save in `ASTROLABE_DATA/versions/` (default on) — see [Versions, before and beside git](backup-and-sync.md#versions-before-and-beside-git) |
| `PDF_SEARCH` | `off` (also `false`, `0`, `no`) stops the sidebar search from reading the text of the PDFs on your shelf (default on; see [Searching inside every book](books.md#searching-inside-every-book)) |
| `SITE_NAME` | The site's name, shown in the sidebar, in page titles and on the login dialog (default `Astrolabe`) |
| `SITE_TAGLINE` | A short line under the site name, in blog mode |
| `SITE_FOOTER` | The footer line in blog mode. `{year}` and `{siteName}` are filled in (default `© {year} {siteName}`) |
| `SITE_URL` | The site's public address, for RSS and canonical links, for example `https://notes.example.com`. When it is not set, it is worked out from each request. **`.env` only — the panel has no field for it** |
| `LEGACY_HOSTS` | Old hostnames the site used to answer on, comma-separated. A request that arrives on one of them is redirected permanently to the same path on `SITE_URL`, so old links keep working after a rename. Needs `SITE_URL`; `.env` only |
| `DEFAULT_THEME` | The theme a visitor sees before choosing one: any of the forty-six built-in themes, `custom:<name>` for one you built (see [Theming](theming.md)), or `follow`. Unset means `follow`: visitors get whichever theme *you* are editing in. Case does not matter; an unknown name is ignored with one line on stderr |
| `EXCLUDE_TAGS` | Comma-separated tags to hide from the public site's topic lists and tag pills — typically workflow tags like `draft,seedling`. Case does not matter and a leading `#` is fine. The admin's own views are not affected |
| `PUBLIC_LAYOUT` | What a visitor sees: `blog` for a classic blog layout (see [Blog mode](blog-mode.md)), `designed` for a home page you compose yourself (see [Designer](designer.md)), anything else for `app`, the read-only app (the default) |
| `SITE_LANG` | The site's language: `en` (default) or `ar`. With `ar` every interface string is Arabic and the whole interface is mirrored right-to-left (see [Arabic & RTL](arabic-and-rtl.md)). The language *you* edit in is a separate choice, per browser: Settings → This device → *Editor language* |
| `BLOG_LOCALE` | A language-and-region code (a BCP47 tag like `ar-EG` or `en-GB`) that decides the digits in post dates and the RSS feed's language (default: follows `SITE_LANG`). Month names follow the interface language when the visitor language switch is on |
| `LANGUAGE_FILTER` | Which published notes the public site shows, by the language they are written in: `off` (default, show all) · `follow` (each reader sees their own language) · `ar` · `en`. The old values `true` and `false` still work — see [Language filter](arabic-and-rtl.md#language-filter) |
| `ATTACHMENTS_DIR` | The vault folder that uploads from inside the app are saved into (default `Attachments`, or `مرفقات` on an Arabic site; an existing `attachments` folder is kept). It is created when first needed. The **Attachments** setting can send uploads elsewhere entirely — see [Attachments](#attachments) |
| `BANNER_FALLBACK` | The header image for blog posts that have no `banner:` of their own — `generated` (default: an abstract gradient made from the note's title, always the same for the same title) or `none` |
| `ASTROLABE_GIT_SSH_COMMAND` | The one `GIT_*` variable Astrolabe passes on to git, unchanged, as `GIT_SSH_COMMAND` — see [Backup & sync](backup-and-sync.md#things-worth-knowing) |

**If you installed this when it was called Vellum.** Every key above still answers to its old
spelling: `VELLUM_VAULT`, `VELLUM_DATA` and the rest are read when the `ASTROLABE_*` key is not
set, so a `.env`, a systemd unit or a shell alias written before the rename keeps working. When
both are set the new spelling wins, and the startup line names the old keys it leaned on, once.
`/vellum.sty` is still served beside [`/astrolabe.sty`](latex.md#astrolabesty), for papers written
against the old package name.

**Request size limits.** Every request to the server is capped in size before anything reads
it, and there is no key for this: 10 MB on any `/api` request, and a much smaller 64 KB on the
two things anonymous visitors can send (comments and login attempts). Anything bigger is refused
with HTTP 413 ("request too large") instead of being held in memory. Uploads have their own, separate allowance. If
you run the app behind a proxy, a matching limit there is a sensible extra layer — in nginx,
`client_max_body_size 10m;`.

## The Settings panel

Most of the site-identity keys above can also be changed **at runtime, from the app** — no
`.env` edit, no restart. As admin, open **Settings** (the gear in the top cluster, or the
command palette): a panel with eight tabs, each opening with its name and one sentence saying
what it decides. The first tab is yours; the rest are the site's and share one **Save** button.

- **This device** — preferences kept in this browser, each saving itself on click: your own
  theme and the two eye-comfort sliders, your **editor language** (*Follow site* / English /
  العربية — never what visitors get) and which edge the **notes sidebar** sits on; under
  *Reading & writing*, the writing column, vim keys, relative line numbers, the floating toolbar,
  numbered headings and **Auto-correct French** (see
  [the editor](editor.md#french-corrected-as-you-type)); under *This browser*, the what's-new
  deck, the offline copy and whether
  settings travel with the vault; and, in the desktop app only, *This app* — its name, its icon,
  a launcher entry and **Software updates** (see [the desktop app](desktop.md#updates)).
- **Site** — what the site is called and looks like: name, tagline, footer line, a **logo**
  image (replaces the text wordmark in the sidebar and the blog masthead), a **favicon** (served
  at `/favicon.ico` with its real content type and injected into every page's `<link
  rel="icon">`), the **default theme** visitors arrive on, and the four font slots (text /
  interface / code / Arabic script) over a curated, self-hosted catalog *or* faces you upload
  yourself, with a live specimen that stays on screen while you choose. See
  [Typography](typography.md).
- **Language & dates** — the **site language** (English / العربية — what visitors read it in),
  the date locale, the language filter and the optional **visitor switch**; the **browser
  dictionaries** (which languages this browser can spellcheck, so a French or Arabic line is
  checked as its own language rather than underlined against English); the **date calendar**
  (Gregorian / Hijri / both, with a live specimen of today); the **note layout** pair (text
  direction and alignment for note prose, which any note may override from its own
  frontmatter); the empty properties card; and the **tag labels** table — display names for
  canonical tags, for a front end that should read «برمجيات» over a vault that keeps
  `#software`. See [Hijri dates](arabic-and-rtl.md#hijri-dates),
  [Note direction & alignment](arabic-and-rtl.md#note-direction--alignment) and
  [Localised tag labels](arabic-and-rtl.md#localised-tag-labels).
- **Publishing & comments** — public layout (`app` / `blog` / `designed`), the designer,
  excluded tags, the comments and share-button toggles, the ambient masthead, author sites, and
  the home page visitors land on at `/`: classic `note` mode with a chosen home note, or the
  `dashboard` magazine layout, plus an optional hero banner. The home rows are read by the `blog`
  and `designed` layouts only, so with `Public layout: app` the panel greys them and says so — an
  app-layout instance opens the home note at `/`.
- **Collections** — how the public site groups notes: whether categories come from tags or from
  folders, your own hand-made **collections** and where they sit, and the **library** shelf. See
  [Blog mode](blog-mode.md#custom-public-folders) and [The library](library.md).
- **Vault** — where this instance writes things: the templates folder and the template for new
  notes, the hadith corpus folder (the notes that answer `> [!hadith]` callouts — see
  [Ayah and hadith callouts](arabic-and-rtl.md#ayah-and-hadith-callouts)), the [periodic notes](templates-and-notes.md#periodic-notes) (one row: the folder the
  four kinds share, and a name and a template each for the day, the week, the month and the
  year), the [unique note](templates-and-notes.md#unique-notes)'s folder and name, the drawings
  folder, **Open on launch** (where the app opens — where you left off, the Sigils page, the Orbits
  shelf, today's note, or a note of your choosing — on top of the restored session, and never over
  a pasted link), the [capture inbox and the clipper](capture.md), **where new attachments are
  written** (see [Attachments](#attachments)), the tags folder, note versions and PDF search.
- **Backup & sync** — commit the vault and push it to a private git remote you own, manually or
  on a timer. Off until you turn it on. See [Backup & sync](backup-and-sync.md).
- **About** — the version, the Node version, the vault's counts, and the absolute paths of the
  vault, the data directory, `settings.json` and the uploaded-fonts folder.

Image fields reuse the banner machinery: pick from the vault's attachments or upload right
there (drag & drop; bytes are sniffed; lands wherever the [Attachments](#attachments) setting
points).

### Attachments

An *attachment* is any file you put into the vault that is not a note — a picture, a PDF, an
audio clip. **Where new attachments go** is a setting, named the same way Obsidian names it
(*Default location for new attachments*), so a vault that moved from Obsidian behaves the way
its owner already expects. It lives in the **Vault** tab, beside the templates and drawings
folders.

| Mode | An upload lands in |
| --- | --- |
| Vault root | the top of the vault |
| Same folder as the note | beside the note being edited |
| Subfolder of the note's folder | `<note's folder>/<name>` — e.g. an `assets` next to each note |
| Specified folder *(default)* | one fixed vault-relative folder — `ATTACHMENTS_DIR`, else `Attachments` (`مرفقات` on an Arabic instance); a vault that already has an `attachments` folder keeps it |

The setting only decides for uploads that did not name a place themselves: a picture pasted
into a note, or a file dropped into the editor. A file dropped onto a folder in the sidebar
tree already names a place, and lands in that folder.

The folder you type is checked like every vault path: it must stay inside the vault, it cannot
be a dot-folder (a folder whose name starts with `.` — the tree, the indexer and the file
watcher all ignore those), and it is created when first needed. **Attachments you already have
are never moved.** The setting decides where the *next* upload goes; existing embeds keep
working because a note finds its images by file name, whatever folder they are in.

Every way of uploading obeys the setting: paste or drop in the editor, drop onto the sidebar
tree, and the upload button in any picker. A note's banner and a Media entry's cover count as
uploads *into that note*, so under *Same folder* and *Subfolder* the picture lands beside the
note (or the tracker note) it belongs to. The site-wide pickers — home banner, logo, favicon —
belong to no note and are measured from the vault root. Fonts (`ASTROLABE_DATA/fonts`) and
`custom.css` have their own homes and are not affected.

**Any file the vault can hold, not just images.** `POST /api/upload` accepts images (png, jpeg,
webp, gif, svg, avif, heic, bmp), **PDF**, audio (mp3, m4a, wav, ogg, opus, flac) and video (mp4,
mov, webm), up to 10 MB each. The *contents* of the file are inspected, so a program renamed to
`.png` is refused whatever its extension says. Anything not on that list is refused **in the
browser, before the upload starts**, with a message naming what was refused and what would have
been accepted.

**Drop files anywhere on the tree.** Drag files from your file manager onto a folder in the
sidebar (or onto a note — they land beside it) and they are added to the vault. The row lights
up and says how many files are coming. Afterwards a toast names the folder they actually landed
in and offers **Undo**, which moves them to `.trash/`. If a name is already taken, the new file
gets the first free `name-2.ext` and the toast says so.

**Deleting tells you what it is really taking.** The sidebar tree shows notes only. So a folder
that still held four images after its note moved away used to describe itself as "0 notes" —
and deleting it silently broke a published essay. Now every delete confirmation asks the server
what is actually inside:

> **Move "Media" to .trash?**
> 0 notes, 60 attachments — 53 of them referenced by 48 notes. All of it moves to the vault's
> .trash folder — recoverable from disk.

When only a few notes reference the files, they are named. Only notes that *survive* the delete
count as breakage; a note that goes in the same act is not a broken link. Both kinds of link
count — wikilink embeds (`![[fig.png]]`) and Markdown links (`![](assets/fig.png)`) — and so does
a note's `banner:`. The confirmation for a permanent delete repeats the same inventory, and
deleting a single attachment (the × on a row in the banner picker's list) asks the same question.

**Every control in the panel is drawn by Astrolabe**, not by your operating system. A dropdown
list is a themed popover attached to its button and kept inside the panel: it grows no taller
than the room available, flips upward when there is no room below, and takes arrow keys and
type-ahead, `Enter` to confirm and `Esc` to put the old value back. Switches are switches;
three-way rows (*inherit* / on / off) show all three states at once; numbers carry their unit
inside the field. The reason: a native `<select>` opens a window drawn by the operating system,
which no theme can style and no panel can keep inside its bounds — exactly what a font list of
twenty-seven faces must not do.

## Settings keys

These are the keys `ASTROLABE_DATA/settings.json` can hold. The panel writes them, and so does
`PATCH /api/settings`. Any key that is absent falls back to its `.env` default from the table
above.

| Key | Values | Default |
| --- | --- | --- |
| `siteName` | string, ≤ 80 chars | `SITE_NAME`, else `Astrolabe` |
| `tagline` | string, ≤ 160 | `SITE_TAGLINE`, else none |
| `footer` | string, ≤ 200 | `SITE_FOOTER`, else `© {year} {siteName}` |
| `defaultTheme` | one of the forty-six ids, `custom:<name>` for a theme that exists, or `follow` (visitors track your editor theme) | `DEFAULT_THEME`, else `follow` |
| `adminTheme` | one theme id — **written by the app, not by hand**: your own editor theme, mirrored from your browser so `follow` has something to serve | none until you pick a theme |
| `publicLayout` | `app` · `blog` · `designed` | `PUBLIC_LAYOUT`, else `app` |
| `blogLocale` | language-and-region code (BCP47), ≤ 35 chars, tidied into its standard form on save | `BLOG_LOCALE`, else `ar` when the language is Arabic, else `en` |
| `language` | `en` · `ar` | `SITE_LANG`, else `en` |
| `languageFilter` | `off` · `follow` · `ar` · `en` | `LANGUAGE_FILTER`, else `off` |
| `languageToggle` | boolean — the public `EN`/`ع` switch. **No env counterpart** | `false` |
| `topics` | `tags` · `folders` — where the public site's categories come from (the Collections tab) | `tags` |
| `excludeTags` | array of strings, ≤ 200 entries, ≤ 50 chars each | `EXCLUDE_TAGS`, else empty |
| `commentsEnabled` | boolean | `COMMENTS`, else `false` |
| `noteVersions` | boolean — keep a version of every note before each save (Vault tab) | `NOTE_VERSIONS`, else `true` |
| `shareButtons` | boolean — the share row under blog articles | `true` |
| `authorSites` | array of `{ url }` (https); each site's title and preview image are fetched once (from its OpenGraph tags) and cached in `ASTROLABE_DATA/author-sites.json`; rendered on the blog as *More from the author* cards. **No env counterpart** | empty |
| `ambient` | boolean — a slow decorative atmosphere behind the public masthead, drawn per theme (see [Theming](theming.md#the-ambient-masthead)) | `false` |
| `pdfSearch` | boolean — the sidebar search reads the pages of every PDF on the shelf (see [Searching inside every book](books.md#searching-inside-every-book)) | `PDF_SEARCH`, else `true` |
| `favicon` | vault-relative image (`.ico .png .svg .jpg .jpeg .gif .webp .avif`) | none |
| `logo` | https URL or vault-relative image | none |
| `home.mode` | `note` · `dashboard` | `note` |
| `home.note` | vault-relative note (`.md` / `.tex` / `.latex`) | `HOME_NOTE` |
| `home.banner` | https URL or vault image | none — a generated gradient seeded from the site name |
| `publicFolders` | `{ enabled, nav, home, folders[] }` — the hand-made [collections](blog-mode.md#custom-public-folders): whether they are on, a door in the navigation, a band on the home page, and up to 12 folders, each with a `slug` (≤ 60), a `title` (≤ 60), a `description` (≤ 200), a mark and an optional `hidden` flag | off; `home: true` |
| `library` | `{ enabled, nav, home, title, paths[] }` — [the library](library.md): on or off, a door in the navigation (on by default once the library is), a shelf on the home page, a name (≤ 40) and up to 24 paths, each a vault folder with a `title` (≤ 80), a `blurb` (≤ 300) and a kind | off |
| `attachments.mode` | `vault-root` · `same-folder` · `subfolder` · `specified` | `specified` |
| `attachments.folder` | vault-relative folder, ≤ 180 chars; read by `subfolder` and `specified` only. No traversal, no absolute path, no dot-folder | `ATTACHMENTS_DIR`, else an existing `attachments`/`Attachments`/`مرفقات`, else `Attachments` (`مرفقات` on an Arabic instance) |
| `templatesFolder` | vault-relative folder | auto-detected (`Templates`, `_templates`, `قوالب`), else none |
| `hadithFolder` | vault-relative folder whose notes (with `collection:` and `number:` in their frontmatter) answer `> [!hadith]` callouts | auto-detected (`hadith`, `Corpus/hadith`, `أحاديث`), else none |
| `drawingsFolder` | vault-relative folder the sidebar's pencil starts a drawing in | none — the vault root |
| `defaultTemplate` | vault-relative note applied to every new note | none |
| `dailyFolder` | vault-relative folder the periodic notes live in; `""` for the vault root | `daily` |
| `dailyFormat` | a period format naming the year, month and day (`YYYY`, `MM`, `DD`, `[literals]`, `/`) | `YYYY-MM-DD` |
| `weeklyFormat` | a period format naming the year and the ISO week (`ww`); `""` turns weekly notes off | `YYYY-[W]ww` |
| `monthlyFormat` | a period format naming the year and the month and nothing finer; `""` turns monthly notes off | `YYYY-MM` |
| `yearlyFormat` | a period format naming the year and nothing finer; `""` turns yearly notes off | `YYYY` |
| `dailyTemplate` / `weeklyTemplate` / `monthlyTemplate` / `yearlyTemplate` | vault-relative note applied when that period's note is created | none (the day falls back to `defaultTemplate`) |
| `launch` | `resume` · `sigils` · `orbits` · `today` · a vault-relative note — what the admin's shell opens on top of the restored session (see [Periodic notes](templates-and-notes.md#periodic-notes)). **No env counterpart** | `resume` |
| `uniqueFolder` | vault-relative folder the palette's *New unique note* files into (see [Unique notes](templates-and-notes.md#unique-notes)) | none — the vault root |
| `uniqueFormat` | the unique note's name: the daily tokens plus `HH`, `mm`, `ss`; must name the year and something finer than a day | `YYYYMMDDHHmm` |
| `captureInbox` | vault-relative note the [quick-capture sheet](capture.md) can drop lines into instead of today's note | none — today's note only |
| `dateCalendar` | `gregorian` · `hijri` · `both` | `gregorian` |
| `dateOrder` | `auto` · `hijri-first` · `gregorian-first` — which calendar leads in `both` | `auto` (by the site language) |
| `dateSeparator` | `bar` · `dot` · `parens` — what stands between the two in `both` | `bar` |
| `textDirection` | `auto` · `ltr` · `rtl` | `auto` |
| `emptyPropsCard` | `true` · `false` — the one-line properties card on notes that have no frontmatter | `true` |
| `textAlign` | `start` · `left` · `right` · `center` · `justify` | `start` |
| `tagsFolder` | vault-relative folder holding tag pages | auto-detected, else `tags` |
| `tagLabels` | `{ tag: { en, ar } }`, ≤ 200 tags — **replaced whole, not merged** | empty |
| `folderIcons` | `{ \"folder/path\": \"mark\" }`, ≤ 200 folders — the [folder marks](editor.md#folder-marks) the tree draws; a mark not in the catalog is dropped | empty |
| `fonts.prose` / `.ui` / `.mono` / `.arabic` | a catalog id, `custom:<file>` for an upload, or `system` | `system` |
| `fonts.arabicSizeAdjust` | integer percent, 50–300 | the catalog face's own measured value, or none |
| `gitSync.enabled` | boolean | `false` |
| `gitSync.remote` | `https://…`, `ssh://…` or `git@host:path`, no embedded credentials | none |
| `gitSync.branch` | string | `main` |
| `gitSync.intervalMinutes` | integer 0–1440; `0` is *manual only* | `0` |
| `gitSync.pullFirst` | boolean — pull the remote before each sync, and only if it merely adds on top of what you have (a *fast-forward*) | `true` |
| `gitSync.authMode` | `ssh` · `token` | `ssh` |

Two more keys are **write-only**: `gitToken` and `gitUser`. `PATCH /api/settings` accepts them
and stores them in `ASTROLABE_DATA/git-credentials.json`, readable only by the system user the
server runs as (mode `0600`). They never go into `settings.json` and can never be read back: a read answers
`gitSync.tokenSet: true` and the username, nothing more.

`settings.json` is written atomically, meaning the file is either fully old or fully new — a
crash in the middle cannot leave it half-written. Changes apply live: the site name, the layout,
the default theme, the excluded tags, the comment routes and the favicon all update without a
restart. If the file is ever corrupted, the server logs one warning and runs on the `.env`
defaults.

The security-sensitive keys are deliberately **`.env` only, forever**. The panel and
`/api/settings` can neither read nor write them: `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`,
`TRUSTED_PROXIES`, `PORT`, `HOST`, `ASTROLABE_VAULT`, `ASTROLABE_DATA`, `PUBLIC`. `SITE_URL` is
`.env` only too, for a duller reason: nothing has ever needed to change it while the server runs.

## The settings API

For scripts. Admin only; a visitor gets a 404.

- `GET /api/settings` returns the stored keys, plus `effective` (the merged values actually in
  use), the font catalog, and an `about` block (version, Node version, absolute paths, counts).
- `PATCH /api/settings` takes a partial object. Only the keys you name change; `null` clears a key
  so it falls back to `.env`. Validation is strict — an unknown key is a 400 — and the answer has
  the same shape as `GET`. The git credential keys additionally require that the instance has a
  real password.
