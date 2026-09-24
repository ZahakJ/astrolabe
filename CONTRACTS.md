# Astrolabe — module contracts

The contracts are the decisions the code keeps: what each module promises, and why. They live in
[`contracts/`](contracts/), one file per area. This page is the map. Read the file for the area you
are about to change before writing code; `shared/types.ts` is the wire contract underneath all of
them.

**Edit the area, append nothing.** A change to how something works is written in the section it
changes, and the sentence it replaces goes — a contract that says one thing on line 16 and the
opposite on line 1,768 is two contracts. A release adds ONE line to
[contracts/releases.md](contracts/releases.md) and never an addendum at the end of a file; a new
feature gets a section in the area it belongs to (or its own file, added to the table below).

| File | What it holds |
| --- | --- |
| [core.md](contracts/core.md) | The code rules (TS strict, erasable-only, Node ≥ 24, explicit `.ts` imports), identity and design language, the name (Vellum → Astrolabe), the runtime layout on disk, conventions. |
| [vault-server.md](contracts/vault-server.md) | The API, the server's modules, auth and sessions, durable writes, search operators and the fold, aliases, moving, bulk rewrites, deletion (notes, folders, attachments), delete previews, the trash, attachments. |
| [shell.md](contracts/shell.md) | The phone shell and `PHONE_SHELL_QUERY` (the one phone question), the store, the workspace, windows, tabs, lazy surfaces, shell layout, pane grips, the status bar, mode visibility, the tree's order, the graph as a tab, finding, the settings panel, accessibility and the z-index ladder, what's new. |
| [themes-tokens.md](contracts/themes-tokens.md) | CSS tokens, the theme library (default `github-dark`, `THEMES[0]`), which theme a reader lands on, the preset rooms, theme integrity, typography, uploaded fonts. |
| [editor.md](contracts/editor.md) | The open document (buffers, `AUTOSAVE_MS`), pointer mapping, selections, formatting, the selection menu and composer commands, block alignment, the properties card, coloured text, sectioning, fences, line endings, templates, tables, drawings, LaTeX notes, annotations. |
| [reading.md](contracts/reading.md) | Banner resolution and generated banners, justification, the meta line, print, the library, the book reader (PDF) and EPUB. |
| [public-site.md](contracts/public-site.md) | The blog shell, topics vs publishing, collections, the site design engine, the composed pages, the designer. |
| [features.md](contracts/features.md) | Twins, trackers, Sigils, the Calendar page, Orbits, block references, queries, tasks, periodic notes, bookmarks, layouts, the month and margin, capture, Ask the vault, voice notes. |
| [sync-desktop-mobile.md](contracts/sync-desktop-mobile.md) | Settings that travel, git backup and sync, the desktop app, its updates and sessions, the pocket vault on the phone. |
| [i18n.md](contracts/i18n.md) | Localization and RTL, numerals and calendars, note layout, tag labels, Arabic in labels. |
| [gates.md](contracts/gates.md) | Every `scripts/check-*` gate and what it asserts, and the test suite. |
| [releases.md](contracts/releases.md) | The history: each version, one line, and where its contract lives. |

`scripts/check-names.mjs` reads the headings of every `contracts/*.md` file (a heading is a surface a
reader of the contracts sees). Agents and tools that open this file find the map here; the words
live in the files.
