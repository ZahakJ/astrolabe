# Astrolabe documentation

*The full manual. The [project README](../README.md) is the one-minute version.*

You can read this manual as a website, with search, a page outline and both languages: [zahakj.github.io/astrolabe/site/en](https://zahakj.github.io/astrolabe/site/en/) · [العربية](https://zahakj.github.io/astrolabe/site/ar/). The Arabic pages live under [`ar/`](ar/), and `npm run build-docs` builds both languages into `site/`.

**Before you read any of it**, let the app show you around. Press `Ctrl/Cmd P` and choose **Take the tour**. The tour is fifteen short cards, one feature each, and every card has a *Show me* button that opens the real thing instead of a picture of it. The tour is also offered on an empty vault and at the bottom of the `Ctrl/Cmd /` shortcuts sheet. It never opens on its own.

---

## Getting it running

| | |
| --- | --- |
| [Configuration](configuration.md) | Every setting you can change, where each one lives (the `.env` file or the Settings panel), [where attachments are stored](configuration.md#attachments), and which setting wins when two disagree |
| [Publishing & access](publishing.md) | How visitors read your site while only you can edit it: the `publish:` flag, previewing the site as a visitor, HTTPS, and comments |
| [Backup & sync](backup-and-sync.md) | Saving your vault to a private git repository, by hand or on a timer; [reading an old version of a note](backup-and-sync.md#note-history-reading-what-the-backup-kept) from that backup; and the [versions the app keeps on every save](backup-and-sync.md#versions-before-and-beside-git), with or without git |
| [Offline reading](offline.md) | The notes you have already opened stay readable when the network is gone: what is kept, what is not, and the strip that tells you |
| [Export](export.md) | Download a note, a folder, a tag or the whole vault as a ZIP with the files it uses, with `[[wikilinks]]` kept or turned into ordinary links; or save any note as a standalone HTML page |
| [The desktop app](desktop.md) | The app as a native program: the menu bar, several vaults, the reference window, find in page, updates, and links that open straight into a note |
| [Development](development.md) | Running the app in dev mode, the check scripts that guard it, the screenshot tools, and how to contribute a change |

## Writing

| | |
| --- | --- |
| [The editor & reading view](editor.md) | Writing with live preview, linking notes with wikilinks, selecting text, how notes are rendered, and moving around |
| [Templates, banners & notes](templates-and-notes.md) | A banner image at the top of a note (`banner:`), templates with `{{date}}` and friends, sections, attachments, and the trash |
| [LaTeX notes](latex.md) | A `.tex` file is a note like any other: the `astrolabe.sty` package and exactly what the app can render |
| [Trackers](trackers.md) | A `tracker` block that keeps a list of things you follow (games, films, books), the board it draws, the Media page that shelves them all, and what a visitor sees |
| [Orbits](orbits.md) | Your daily habits, one per orbit: a plan for each day, a log the app writes for you, streaks, a heatmap, templates, and the Orbits page |
| [Flashcards](flashcards.md) | Turn highlights, quotes and `?` questions into flashcards, review them on a schedule, and keep that schedule inside the note itself |
| [Drawings](drawing.md) | A drawing canvas (Excalidraw) inside your vault: `.excalidraw` files and the Obsidian plugin's `.excalidraw.md`, an SVG exported beside each one, and `![[sketch.excalidraw]]` to embed it anywhere |
| [The PDF reader](books.md) | Every PDF in the vault opens as a book: vim keys, a `:` command line, the page you left off on, and highlights that become notes with a citation |
| [Panes, tabs & windows](workspace.md) | Splitting the screen, preview tabs and pinned tabs, several windows on one vault, the local graph, the trash, the tour, and aliases |
| [Printing & PDF](printing.md) | Putting a note on paper: the print palette, page breaks, PDF bookmarks, and internal links that still work in the PDF |
| [Keymap](keymap.md) | Every keyboard shortcut, and why the awkward ones are where they are |

## Publishing

| | |
| --- | --- |
| [Blog mode](blog-mode.md) | The ready-made blog for visitors: the site title at the top, a row of topics, a magazine-style home page, an RSS feed, a sitemap, and search-engine tags |
| [Designed mode](designer.md) | Build your own home page out of sections; ready-made designs, your own navigation menu, and static pages such as About |
| [The library](library.md) | Books, courses and lecture series presented as a path a reader walks through in order |

## Look & language

| | |
| --- | --- |
| [Theming](theming.md) | The forty-six built-in colour themes, the eye-comfort sliders, the tool for building your own theme, the CSS variables the app is painted with, and `custom.css` |
| [Typography](typography.md) | Choosing fonts from a built-in catalog served by your own server, uploading your own fonts, and giving Arabic letters their own font even inside English text |
| [Arabic & RTL](arabic-and-rtl.md) | The whole interface in Arabic and mirrored right-to-left, a language switch for visitors, showing each reader only notes in their language, Hijri dates, and Arabic names for your tags |
| [Japanese & furigana](japanese.md) | Readings over kanji with `{漢字|かんじ}`, a right-click that suggests them from the jōyō table, an automatic mode, and a Japanese typeface that only Japanese lines get |

## Also in the repo

- [`DESIGN.md`](../DESIGN.md) — the rules a change is judged against
- [`CONTRACTS.md`](../CONTRACTS.md) — the promises the code has committed to keeping
- [`OBSIDIAN-COMPAT.md`](../OBSIDIAN-COMPAT.md) — what carries over from an Obsidian vault, in detail
- [`.env.example`](../.env.example) — the environment file, with every key explained
