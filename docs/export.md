# Export

*A ZIP of your notes and the files they use — one note, a folder, a tag, or the whole vault — and any note as a standalone HTML page.*

← [Back to the README](../README.md) · [All docs](README.md)

---

Your vault is a folder of Markdown files, and nothing Astrolabe does ever changes that; you can
copy the folder and you have a copy. **Export** is for the moments when a plain copy is the wrong
shape: you want *this folder* and only the pictures *it* uses, or every note carrying a tag, or a
copy whose `[[wikilinks]]` work in a tool that does not know them, or one note as a single page
you can mail to someone with no vault at all.

Press `Ctrl/Cmd P` and run **Export…**, or right-click a folder in the tree and pick **Export
folder…**. Both open the same small sheet. Export is for the admin only: a visitor to your site
has the site, and the archive never leaves your own server except into your own downloads folder.

## The archive

| | |
| --- | --- |
| **What to export** | **This note**, **A folder** (the tree's right-click starts here, on that folder; **Choose…** picks another, or the vault root), **A tag** (every note carrying it — inline `#tag` or frontmatter `tags:`, nested tags included), or **The whole vault**. |
| **Attachments** | **Included** takes every file the exported notes point at, by every route the reader honours: `![[embeds]]`, `![alt](Media/x.png)`, a note's `banner:`, a tracker's `cover:`, the svg beside an embedded drawing. Nothing else — an image no exported note uses stays behind. **Notes only** leaves them all out. |
| **The paths inside** | The vault's own: `Folder/Note.md`, `Media/cover.png`, whatever the scope. Unzip two exports into one folder and you have the vault's layout, not two competing ones. Arabic names survive — the archive marks every name as UTF-8. |
| **The bytes** | As on disk, unless you asked for standard links (below). Modification times are kept to the second. The archive is stored, not compressed: a vault's bulk is its pictures, which are already compressed, and the point of an export is fidelity. |
| **The line under the controls** | Before you download, the sheet asks the server what the same download would hold and prints it — *12 notes, 4 files · 3.2 MB* — so a refusal is a sentence here rather than a failed download in your browser's list. |
| **The cap** | Two gigabytes. Above it the sheet says so and asks you to export a folder or a tag at a time. |

The download is your browser's own — its progress bar, its downloads folder — named after what you
exported and the day: `Ideas 2026-09-14.zip`, `Reading 2026-09-14.zip`, `vault 2026-09-14.zip`.

## Links in the copies

Astrolabe's notes link with `[[wikilinks]]`, and so do Obsidian's; most other Markdown tools —
a static site generator, GitHub, a plain viewer — do not. **Links in the copies** decides what the
exported files carry:

- **Keep `[[wikilinks]]`** — the default. The files are byte-for-byte what is on disk, which is the
  right export for another Astrolabe or Obsidian vault.
- **Standard Markdown links** — every `[[Note]]`, `[[Note#Heading|label]]` and `![[picture.png]]`
  in the *exported copies* is rewritten to a relative link that works after unzipping:
  `[Note](../Note.md)`, `[label](../Note.md#heading)`, `![picture.png](Media/picture.png)`. Headings
  are slugged the way the reading view ids them, so `#My Heading` becomes `#my-heading`. An
  embedded *note* (`![[Other]]`) has no standard equivalent and becomes a link to it.

Two honest limits. **Your vault is never touched** — the rewrite happens in the archive and nowhere
else. And **a link to a note that is not in the export stays exactly as written**: a
`[Note](Note.md)` pointing at a file that is not there would be worse than the `[[Note]]` you
wrote, which at least says what it was. Code fences and inline code are left alone for the same
reason: a wikilink inside them is text *about* wikilinks.

## One note as an HTML page

With **This note** selected the sheet offers a second button, **Export as HTML**. It builds one
`.html` file in your browser — nothing is asked of the server that reading the note does not ask —
and hands it to your downloads:

- **Rendered exactly as you read it.** The same renderer as the reading view, with the properties
  card and the app's own controls left off, the way [printing](printing.md) leaves them off.
- **Your theme, inlined.** The colours, faces and measures of the room you are reading in are
  written into the page as CSS custom properties, along with the reading stylesheets themselves.
  Open it anywhere and it looks like your Astrolabe.
- **Pictures inside the file.** Every image the note shows is fetched and embedded as a data URI,
  so the page is complete on its own. One that cannot be fetched — or one above 25 MB — keeps its
  address instead, absolute, so it still shows beside a running instance and is an honest broken
  image away from one; it is never silently dropped.
- **Right-to-left when the note is.** The page's direction is the note's prose, or the `dir:` its
  frontmatter pins.

Math is rendered, tracker and orbit cards are drawn (without their buttons), and a `.tex` note
comes out as the page its reading view shows.

## From the command line

The sheet is a front for one route, which `curl` can call with an admin session cookie:

```
GET /api/export?scope=note|folder|tag|vault&target=<path or tag>&links=wiki|relative&attachments=1|0
```

`scope=vault` needs no `target`. Add `&dry=1` for the JSON the sheet's line is made of — `{ notes,
attachments, bytes, filename }` — with the same refusals: `404 exportEmpty` when nothing matches,
`413 exportTooLarge` above the cap, `401` without an admin session. See
[Backup & sync](backup-and-sync.md) for the *other* way out of the vault — the one that keeps
history.
