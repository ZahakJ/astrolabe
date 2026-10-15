# Compared with Obsidian, Logseq and Joplin

*How Astrolabe differs from three tools people already use for notes: where the files live, who runs the server, publishing, Arabic, sync, phones, licences and price.*

← [Back to the README](../README.md) · [All docs](README.md)

---

The facts about the other three are as of October 2026, from their own sites and repositories (listed at the end). Prices change; check them before you rely on them. If something here is wrong or out of date, open an issue.

## At a glance

| | Astrolabe | Obsidian | Logseq | Joplin |
| --- | --- | --- | --- | --- |
| Storage | Plain `.md` and `.tex` files in a folder | Plain `.md` files in a folder | Markdown or Org files (file graphs); SQLite in the new DB version, in beta | An SQLite database on each device; notes are Markdown inside it, exportable as files |
| Runs as | A Node server you host, opened from any browser; desktop and Android wrappers | A desktop and mobile app; no server | A desktop and mobile app; no server | A desktop and mobile app; an optional sync server |
| Self-hosting | The whole app is self-hosted | Not applicable; Sync is a hosted service | Not applicable | Joplin Server, free for personal non-commercial use |
| Publishing | Built in: `publish: true` per note, a blog, designed homepages, RSS, comments, on your own server | Obsidian Publish (hosted, paid), or community static-site generators | Static export of public pages (file graphs) | Share a note as a web page through Joplin Cloud or Joplin Server |
| Arabic and RTL | Whole interface translated and mirrored; each block takes its own direction; Hijri dates; Arabic-aware search | Interface mirrored when an RTL language is chosen; per-line direction detected in the editor (since 1.6) | Through community plugins | The Markdown editor has no built-in RTL; HTML `dir` wrappers in notes as a workaround |
| Sync | One server, many browsers; the vault backed up to a git remote you own | Obsidian Sync (paid, end-to-end encrypted), or any file-sync tool | Logseq Sync (beta, limited availability); RTC sync in alpha for the DB version; or any file-sync tool | Joplin Cloud, Joplin Server, Dropbox, OneDrive, Nextcloud/WebDAV, S3, a folder; end-to-end encryption available |
| Mobile | Android APK (not on a store); the site installs on any phone from the browser | iOS and Android | iOS and Android (file graphs); a new iOS app for the DB version in alpha | iOS and Android |
| Desktop builds | Linux (AppImage, deb, pacman) and Windows | Windows, macOS, Linux | Windows, macOS, Linux | Windows, macOS, Linux |
| Licence | MIT | Proprietary | AGPL-3.0 | AGPL-3.0 (apps); Joplin Server under its own personal-use licence |
| Extensibility | Themes, a theme builder and `custom.css`; no plugin API | Community plugins and themes, a public plugin API | Plugins and themes | Plugins and themes |
| Price | Free | Free; Sync from $4/month, Publish from $8/month (billed yearly); an optional commercial licence | Free; Logseq Sync in a limited beta | Free; Joplin Cloud from €2.40/month (billed yearly) |

## Obsidian

Obsidian and Astrolabe read the same kind of vault: a folder of Markdown with `[[wikilinks]]`, callouts, embeds and frontmatter. Astrolabe opens an Obsidian vault in place, leaves Obsidian's own settings folder alone, and writes drawings and spaced-repetition schedules in the formats the Excalidraw and Spaced Repetition plugins use, so the same folder keeps working in both.

Obsidian has native apps on every platform including macOS and iOS, works with no server at all, and has a large plugin ecosystem; none of that has an Astrolabe equivalent. Astrolabe is a server first: every device is a browser on one instance, publishing and comments run on that instance, and the interface is translated into Arabic as well as mirrored. Obsidian Publish is a hosted service; Astrolabe's site runs where the notes are.

## Logseq

Logseq is an outliner: every line is a block, with block references and queries built around that. Astrolabe is a document editor with block references as one feature among others. Logseq is moving its development to a database version that stores notes in SQLite; the Markdown-file version is maintained without new features. Astrolabe reads and writes plain files only.

Logseq has iOS apps and a plugin marketplace, and its outliner model suits people who think in nested bullets. Its right-to-left support comes from plugins.

## Joplin

Joplin keeps notes in a database on each device and syncs them through a service of your choice, with end-to-end encryption. It has apps for every major platform, a web clipper, and plugins. Its sync choices are wider than Astrolabe's, and it needs no server of your own if you use Dropbox, OneDrive or a folder.

Joplin has no wikilinks or graph by default, and its Markdown editor has no built-in right-to-left handling. Astrolabe's notes are files you can open in any editor without an export step.

## Choosing

Astrolabe fits if you want your notes as plain files on a machine you control, read and edited from any browser, with publishing on the same server and an interface that treats Arabic as a first language. The other three fit better if you want native apps on Apple devices, an extension ecosystem, offline-first apps with no server to run, or a project with a larger community and a longer track record.

## Sources

- Obsidian: [pricing](https://obsidian.md/pricing), [right-to-left in the developer docs](https://docs.obsidian.md/Plugins/User+interface/Right-to-left)
- Logseq: [repository and README](https://github.com/logseq/logseq), [Logseq DB updates](https://discuss.logseq.com/t/whats-new-with-logseq-db-may-16th-2026/35020), [RTL plugin thread](https://discuss.logseq.com/t/done-by-plugin-right-to-left-language-support/318)
- Joplin: [help](https://joplinapp.org/help/), [plans](https://joplinapp.org/plans/), [licence](https://github.com/laurent22/joplin/blob/dev/LICENSE), [Joplin Server licence](https://github.com/laurent22/joplin/blob/dev/packages/server/LICENSE.md), [RTL support issue](https://github.com/laurent22/joplin/issues/3991)
- Astrolabe: [the Android app](mobile.md), [backup & sync](backup-and-sync.md), [publishing](publishing.md), [Arabic & RTL](arabic-and-rtl.md), [theming](theming.md), [import](import.md)
