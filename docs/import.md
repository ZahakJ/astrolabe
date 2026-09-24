# Import

*Bringing a Notion workspace, an Evernote notebook or an Obsidian vault in: previewed before anything is written, and undoable after.*

← [Back to the README](../README.md) · [All docs](README.md)

---

The import wizard turns another app's export into notes in this vault. It shows you what it is about to do — how many notes, which names were already taken and what they become, which links it rewrites — and writes nothing until you say so. After it writes, one button takes it back.

## Opening it

- The palette: **Import notes…**
- A folder's **⋯** (or right-click) in the sidebar: **Import notes here…**, which fills in that folder as the target.
- On a phone: **More → Import notes**.

It is not a row in Settings: the Vault tab says where these doors are instead.

## The three sources

**Notion.** In Notion's own settings, under *Export*, choose **Markdown & CSV** (or **HTML**) with sub-pages included, and give the wizard the `.zip` Notion hands you. (A very large export that Notion splits into `Part-1.zip`, `Part-2.zip`… inside one zip is read as one.)

- The 32-character id Notion puts on every page and folder name is taken off: `Reading list 0f8e2b…` is `Reading list`.
- A page's properties — the lines under a database row's title in the Markdown export, the property table in the HTML one — become frontmatter. `Tags` becomes `tags:`, `Created` becomes `created:`, a Notion date (`September 20, 2026`) becomes `2026-09-20`, and every other property keeps its own name.
- A database becomes a note of its own name holding its table, with the first column linked to the row notes. A row page that has no property lines of its own takes its row's cells from the database.
- Links between pages become `[[wikilinks]]` by the pages' final names; links to the web stay as they are.

**Evernote.** Export a notebook as an `.enex` file (*a notebook's ⋯ → Export notebook*) and give the wizard that file.

- Each note is named by its title. Its words go through the same converter the [web clipper](capture.md#the-clipper) uses.
- Its tags become `tags:`, its creation day `created:`, a later edit day `updated:`, and a web clip's address `source:`.
- Every image or file it embeds becomes an attachment, embedded where it stood (`![[map.png]]`). A to-do becomes a Markdown task.

**Obsidian.** Give the wizard the vault's folder, either zipped or picked as a folder (**Choose a folder…**).

- Notes come over as they are, in their folders: frontmatter, aliases, tags and every property kept byte for byte, `[[wikilinks]]` and all.
- One exception: Obsidian Publish marks a note public with `publish: true`, and the same key publishes a note here. The wizard takes that line out, and the preview says how many it took out.
- `.obsidian/` (the app's own settings), `.trash/` and files that are neither notes nor attachments stay behind, listed.

## The preview

Choose the source, the export and the folder to import into (`Imported` unless you change it; empty is the vault root), then **Preview**. Nothing is written yet. The preview tells you:

- how many notes and attachments, and the folder they go into;
- how many links it rewrote;
- where the attachments go: the folder your attachment setting names (Settings → Vault → New attachments), as a pasted image would;
- the frontmatter it wrote or kept: properties, tags, created dates, aliases, and any `publish:` taken off;
- **every name already taken**, and what the note becomes instead. Nothing is ever overwritten: a note whose name the vault already has, or that the export holds twice, becomes `Name 2`, and the links that pointed at it follow it;
- where the first notes land, and what was left behind.

Attachments move into the attachments folder; `![[embeds]]` are renamed where a file had to take a new name, and Markdown image and link paths are re-resolved from the note's new folder to the file's new home, the same way a folder drag in the sidebar rewrites them.

## Import, and undo

**Import** writes the plan and shows its progress as it goes. When it is done, **Undo the import** moves every file it wrote to the trash and removes the folders it made, **unless you have edited a file since**: an edited file is left where it is and listed, because an undo that threw away your later work would be worse than no undo. The trash keeps what the undo moved (see [Backup & sync](backup-and-sync.md) for the trash and note history).

The undo is kept by the server for a day, and a restart forgets it; after that, the trash and your git history are the way back.

**Nothing imported is published.** No note arrives with `publish: true`; every imported note is private until you publish it yourself (see [Publishing & access](publishing.md)).

## Limits

An export may be up to 256 MB, hold up to 20,000 files, and unpack to at most a gigabyte. A [pocket vault](mobile.md) does not import: unpacking and converting an export is work for a server's own disk. Import on the instance, and the pocket has the notes on its next sync.

## Related

- [Capture](capture.md) — the clipper, whose converter the Evernote and Notion HTML imports use
- [Feeds](feeds.md) — the other way articles arrive in the vault
- [Orbits](orbits.md#importing) — importing Anki decks, a different wizard for a different thing
