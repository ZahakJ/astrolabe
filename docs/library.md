# The library

*Books, courses and lecture series on the public site, as paths a reader walks in order.*

← [Back to the README](../README.md) · [All docs](README.md)

---

A blog is for written pieces: an essay is read once, whole, and the next one is whichever came
next in time. Notes on a book or a lecture series are not like that. They are read in order,
over weeks, a piece at a time, and a reader wants to know where they are in the whole. The
library is the shell for them. It sits beside the blog and the designed home, behind one door in
the navigation, and nothing about it reaches the blog unless you ask for it.

## A path is a folder

A *path* is one item in the library: one book, one course, one series. You do not build it by
hand — the vault already has the shape. A book is a folder of chapter folders of concept notes;
a course is a folder of lecture folders of notes. So a path in the library is simply **a folder
you declare**, and the folder's own structure becomes the path's:

- every immediate subfolder is a **unit** (a chapter, a lecture, a week), named from the folder:
  `L3` prints as *Lecture 3*, `B2| Chapter 40` as *Chapter 40*, `Week 2` as *Week 2*; a folder
  with no number keeps its name and sorts after the numbered ones;
- every **published** note inside is a **lesson**, ordered by title in a way that understands
  numbers (lesson 2 before lesson 10), with a note named like its unit (the chapter hub the
  reading companion writes) first;
- notes sitting directly in the path's folder are its **introduction**.

No frontmatter is asked of any note beyond `publish: true`. A note that is not published is not
a lesson, and a path with no lesson a visitor may read is not sent to that visitor at all.

## Declaring a path

There are four ways, and they all end in the same place.

**From a shelf root.** Settings → Collections → The library → **Shelf roots**: choose `Books`
once, say *book*, and every folder inside it that holds a published note is a path — titled by its
name, addressed by its title, covered by its [Media tracker](trackers.md#the-media-page) when one
names it. The next book you publish joins by itself. A root is one sentence about the shape of
your vault, and it is the answer to twelve rows that all said what the folder's own name already
said. Only IMMEDIATE children count: a note sitting directly in `Books` is still a blog post. Up
to 8 roots, and no root may sit inside another root or inside a path.

**From the vault.** Put a note named like the folder (or `index.md`) inside it and write, in its
frontmatter, `library: book` (or `course`, `series`). The folder is now on the shelf even if no
root is above it. That note is also where a folder's own facts live, root or no root: `title:`,
`description:`, `cover:`, `source:`, `slug:` and `hidden:`. Nothing is typed in Settings; the
settings list shows these paths under its rows, and *Customise here* turns one into a row when you
want to override something. A row that names the same folder wins field by field and takes the rest
from the note.

**From the tree.** Right-click the folder in the sidebar and choose **Library…**. The popover
guesses the kind from what is inside (`L1..L14` is a course, `Chapter 39..41` a book, a folder
under *Talks* a series), takes the folder's name as the title, and **Put on the shelf** saves
it. The first path switches the library on. Right-click the same folder again and the popover
says it is on the shelf, opens it, or takes it off.

**Settings → Collections → The library.** The rows — each one the override of a single folder,
with the fields the tree does not ask for. **Add a path** opens the vault's folders to click (type
to filter), and each row's folder line reopens that chooser; nothing here is typed as a path. Each
row is folded to one line until you press it.

| Field | What it is |
| --- | --- |
| Kind | Book, course or series. It decides the cover's shape and the shelf's grouping. |
| Title | What the shelf and the door call it. |
| Address | The last part of the URL: `/library/<address>`. Lowercase letters, digits, hyphens. |
| Vault folder | The folder the path reads, chosen from the tree. |
| Blurb, cover, source | Folded under one line until a row has them. Blurb: one or two sentences under the title. |
| Cover | An image from the vault (start typing and the vault's images are offered, with thumbnails) or an https URL, written the way a note's banner is (`attachments/cover.jpg` or `https://…`). Without one the site draws a cover from the title. A [Media tracker](trackers.md#the-media-page) whose `folder:` is this path's folder lends its cover instead, over this field. |
| Source link | Where the material came from: the course page, the publisher. Shown on the path. |
| Hidden | A take-down that loses nothing: the row keeps every field and nobody sees it. A folder a root claimed is taken down with `hidden: true` in its own folder note, or by customising it here. |

Two placements and a name sit above the rows. **Door in the navigation** is on by default once
the library is on: a *Library* link beside the topics on both public shells. **Shelf on the
home page** is off by default: a band of covers on the blog home, above the writings. **Name**
renames the door and the page; empty means "Library".

Each card counts the notes inside and how many are published. **The library lists published
notes only**: a path whose notes are all drafts is a shelf with nothing on it, and the door in
the navigation stays hidden until some path has a note a reader may open.

Up to 24 rows and 8 roots. Rows come first, in their own order; folders from a root follow, by
title, within their kind. A folder whose title makes no address — an Arabic title, which makes none
— waits in *Needs an address* until it has a `slug:` in its folder note or a row of its own; it is
not published under a made-up address, and its notes stay on the blog. The same is true of a folder
whose address a row already holds: a row is a pin and is never displaced.

Renaming, moving or deleting a folder carries its row and its root along, so a path does not move
house when a folder does. A row keeps the address it was pinned to; a folder with no row takes the
address its new title suggests.

### The offer

When two or more of your rows sit under one folder and that folder is not a root yet, the panel
asks once: *"Books holds 10 of your paths — make it a shelf root?"* It lists the rows that say
nothing the folder does not, and the order the shelf would take if you folded them (the rows you
keep first, in their order; the folded folders after, by title). Three answers: fold them, keep
them, or not now. **Nothing folds unless you press it** — folding is a visible reorder, and a
reorder nobody asked for is not an upgrade.

## What a reader gets

- **The shelf** (`/library`): courses, books and series in groups, each as a cover, a title, a
  blurb, the count of lessons and the reading time, and this browser's progress.
- **A path** (`/library/<address>`): the cover, the blurb, the source, a *Start reading* or
  *Continue with lesson n* button, and the contents by unit with every lesson numbered.
- **A lesson** (`/library/<address>/<n>`): the note rendered by the reading renderer, with its
  place said at the top (*Lesson 7 of 24 · Lecture 3*), the path's outline down the side with
  this lesson lit, and the previous and next lesson at the foot. `←` and `→` walk the path.

**A lesson is not a post.** A published note inside a library path lives on the shelf and leaves
the blog: it is not in the home lists, the topics, the RSS feed or the sitemap's post entries.
Its own URL still works. Turning the library off, or hiding the path, gives those notes back to
the blog. The two placements are independent: a shelf on the home page with no door in the
navigation is a fine way to keep a library quiet.

**Links stay on the path.** A wikilink inside a lesson that points at another lesson of the
library opens that lesson, in the library, with its contents and its place. A link to a note
that is not on any shelf opens the note's own page, as it always did.

Progress is the reader's own, kept in their browser and never sent anywhere: opening a lesson
marks it read, the path page counts, the shelf card says *Continue with lesson n*, and *Forget my
place* clears it.

## Where it lives

`shared/library.ts` holds the rules (what a legal row is, how a unit's name is read, how things
sort), shared by the settings editor and the server so the editor (a green field) can never
accept what the server (a 400) refuses. `server/library.ts` builds a path from the vault index,
limited to what one session may see. `GET /api/library`
is the shelf; `/api/me.library` is the door. `client/library/` is the pages, the band, the covers
and the progress. `npm test` covers the rules (`tests/library.test.ts`).
