# Releases — the history, one line each

The one place a release is recorded: its version, one line, and where its contract lives. Part of the module contracts (see [CONTRACTS.md](../CONTRACTS.md) for the map). **Edit the area, append nothing:** a change to how something works is written HERE, in the section it changes, and the old sentence goes; this list is the only thing a release adds.

## The history

Where each release's contract now lives is named beside it. Before 3.10 the history is in git.

- **2.18** — the brand gets its own room, `sidereal`, for the icon, the README and the manual ([core.md](core.md)).
- **2.21** — Vellum becomes Astrolabe; old env keys, cookies and `.sty` still answer ([core.md](core.md), "The name").
- **3.1.0** — the graph is a tab ([shell.md](shell.md)).
- **3.3.0 – 3.3.5** — block alignment and the picture's tools ([editor.md](editor.md)); Arabic descenders in labels ([i18n.md](i18n.md)); a gate that the desktop main process boots ([sync-desktop-mobile.md](sync-desktop-mobile.md)).
- **3.10.0** — Easy on the eyes: warm the screen, dim the page ([themes-tokens.md](themes-tokens.md)).
- **3.11.0** — a plan you follow by the day, kept in the note (the feature now called Sigils; [features.md](features.md)).
- **3.12.0** — the vault, woven: block references, live queries, tasks, mentions, periodic notes, versions, PDF search, export ([features.md](features.md)).
- **3.13.0** — cards, callouts and reading anywhere: bookmarks, layouts, the tag tree, pace, scripture, harakat, offline ([features.md](features.md)).
- **3.14.0** — counting from the caret: relative line numbers; a sigil takes the room it has ([features.md](features.md)).
- **3.15.0** — Sigils by that name, a manual you can read, and nothing updates itself ([features.md](features.md), [sync-desktop-mobile.md](sync-desktop-mobile.md)).
- **3.16.0** — Orbits (spaced repetition), Sigils, French and furigana ([features.md](features.md), [editor.md](editor.md)).
- **3.17.0** — the month, the margin, the week, and capture from anywhere ([features.md](features.md)).
- **3.18.0** — the Calendar gets a page, every layer a rung on one ladder, every theme its integrity ([features.md](features.md), [vault-server.md](vault-server.md), [themes-tokens.md](themes-tokens.md)).
- **3.19.0** — a sigil can be a course; tables you can edit ([features.md](features.md), [editor.md](editor.md)).
- **3.20.0** — books that reflow: EPUB ([reading.md](reading.md)).
- **3.21.0** — one note, two faces: linguistic twins ([features.md](features.md)).
- **3.22.0 – 3.22.2** — your vault in your pocket: a GitHub repository opened on the phone, with its own settings and sync ([sync-desktop-mobile.md](sync-desktop-mobile.md)).
- **3.23.0** — the phone, native: the drawer shell for touch (superseded by the phone shell and deleted in 3.27.0).
- **3.24.0** — Ask the vault ([features.md](features.md)).
- **3.25.0** — say it instead: voice notes, transcribed on the owner's machine ([features.md](features.md)).
- **3.26.0** — a phone that feels like a phone: the phone shell ([shell.md](shell.md)).
- **3.27.0** — the phone, finished: every surface a screen; Classic and the drawer deleted ([shell.md](shell.md)).
- **3.28.0** — feeds, and a way in: a feeds list in a note, fetched only by consent, kept through the clipper's door; the import wizard for Notion, Evernote and Obsidian ([features.md](features.md)).
- **3.29.0** — today, and the days: Today as a desktop page on one shared data layer, the evening reflection, the Timeline, the year in review ([features.md](features.md), [shell.md](shell.md)).
- **3.29.1** — the sweep, part 1: the contracts split into `contracts/`; one phone width in every stylesheet; the rules the phone and the server shared by copy moved into `shared/` with a parity test; Sigils by their own name in the code; the copy scan on the syntax tree, the Android shell's words held to parity, the RTL chevrons mirrored once whatever the font; budgets for the Sigils and Calendar pages ([gates.md](gates.md)).
- **3.30.0** — webmentions and the fediverse: mentions received into moderation and sent on publish, the blog as one ActivityPub account, all behind three switches that start off and one rule for what may leave ([public-site.md](public-site.md), [vault-server.md](vault-server.md)).
- **3.30.1** — the sweep, part 2: the large modules split along their seams with every export kept, and the dictionary split by language out of the entry chunk ([core.md](core.md), "Where the code lives"; [i18n.md](i18n.md)).
- **Unreleased** — a way back: the interface language switched from an always-visible key (the status bar; More, Settings and the note sheet on a phone), `Ctrl/Cmd Alt Shift L` and a palette row found in either language ([i18n.md](i18n.md), "The way back is always on screen"; [shell.md](shell.md)).
