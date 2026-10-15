<p align="center"><img src="docs/media/banner.png" width="820" alt="Astrolabe: the Arabic editor between the graph and a published article"></p>

<p align="center">A self-hosted Markdown notes app and blog, in Arabic and English.</p>

Astrolabe is a notes app for people who read closely and write from what they read. It runs as
one Node process over an ordinary folder of Markdown and LaTeX files, which you open from any
browser on your network, from the desktop app or from the Android app. The notes you mark as
public become a blog on the same server. Arabic and English are equal citizens: the interface is
translated and mirrored, and every line takes its own direction.

```sh
git clone https://github.com/ZahakJ/astrolabe.git && cd astrolabe && npm install && npm start
```

<p align="center"><img src="docs/media/editor.png" width="400" align="top" alt="The editor, in Arabic"><img src="docs/media/graph.png" width="400" align="top" alt="The graph"><br><img src="docs/media/blog.png" width="400" align="top" alt="A published article"><img src="docs/media/mobile.png" width="400" align="top" alt="The Android app and the blog on a phone"></p>

## Features

**Writing**

- **Live-preview editor.** Markdown renders as you type and the source comes back under the caret; wikilinks, backlinks, embeds, callouts, tables you edit in place, footnotes and vim keys.
- **Arabic and right-to-left text.** Each line takes its own direction, vocalised text (tashkeel) is set with room for its marks, search folds diacritics and letter forms, and dates can be shown in the Hijri calendar.
- **Math and LaTeX.** KaTeX in any note, and whole `.tex` files edited, linked and published like Markdown.
- **Word goals and focus.** A `goal:` in a note's properties counts toward a target, typewriter scrolling keeps your line at the middle of the screen, and zen mode hides everything else.
- **Graph and outline.** A graph of the vault coloured by folder or tag, a local graph per note, and an outline you can drag to reorder sections.
- **Templates and daily notes,** with `{{date}}` fields, plus drawings in the Excalidraw format.

**Reading and study**

- **Book reader** for PDF and EPUB. Highlights and citations go straight into the note beside the book.
- **Read aloud** in English, Arabic, French and Japanese, with voices that run on your own machine.
- **Trackers, sigils and orbits.** Trackers follow the books and courses you are working through, sigils mark daily habits, and orbits is spaced repetition over cards kept in your notes, with Anki import.
- **Ask the vault.** Search your notes by meaning and get cited answers, from a local model through Ollama or from Anthropic if you choose it.

**Publishing**

- **Selective publishing.** `publish: true` in a note's properties puts it on your site; a date in its place schedules it. Everything else stays private, and `<!-- comments -->` inside a published note never reach a reader.
- **Blog mode** with topics, series, RSS, reader comments and webmentions, or a homepage you compose from sections in the designer.
- **Your own server.** No hosting service is involved: the site is served by the same process that holds your notes.

**Everywhere**

- **Desktop app** for Linux (AppImage, deb, pacman) and Windows, and an **Android app** that can also work on a vault kept in a private GitHub repository.
- **Offline.** The web app installs as a PWA and keeps the notes you have opened readable without a connection.
- **Backup and sync** to a git remote you own, with the history of every note.
- **Import** from Obsidian, Notion and Evernote. An Obsidian vault opens in place, unchanged, and keeps working in Obsidian.
- **No telemetry.** No analytics, no CDN requests, no account.

## Running it

Astrolabe needs Node 24 or later. After `npm start`, open http://localhost:6801. The first run
creates `./vault` with starter notes that double as a short manual.

To use a folder of notes you already have:

```sh
ASTROLABE_VAULT=~/notes npm start
```

To publish, set an admin password with `npm run hash-password`, put the hash and a
`SESSION_SECRET` in `.env`, add `publish: true` to the notes you want public, and serve the app
behind an HTTPS reverse proxy. See [Publishing and access](docs/publishing.md).

The desktop and Android builds are on the [latest release](https://github.com/ZahakJ/astrolabe/releases/latest).

## Documentation

- The manual, in [English](https://zahakj.github.io/astrolabe/site/en/) and [Arabic](https://zahakj.github.io/astrolabe/site/ar/), with its source in [`docs/`](docs/README.md)
- [How it compares](docs/comparison.md) with Obsidian, Logseq and Joplin
- [Configuration](docs/configuration.md): every `.env` key and setting
- [Development](docs/development.md) and [CONTRIBUTING.md](CONTRIBUTING.md)

## License

[MIT](LICENSE)
