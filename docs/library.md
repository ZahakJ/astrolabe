# The library

*Books, courses and lecture series on the public site, as paths a reader walks in order.*

← [Back to the README](../README.md) · [All docs](README.md)

---

A blog is for written things: an essay is read once, whole, and the next one is whichever came
next in time. Notes on a book or a lecture series are not that. They are read in order, over
weeks, a piece at a time, and a reader wants to know where they are in the whole. The library is
the shell for them. It sits beside the blog and the designed home, behind one door in the
navigation, and nothing about it reaches the blog unless you ask for it.

## A path is a folder

The vault already has the shape. A book is a folder of chapter folders of concept notes; a course
is a folder of lecture folders of notes. So a path in the library is a **folder you declare**, and
the folder's own structure is the path's:

- every immediate subfolder is a **unit** (a chapter, a lecture, a week), named from the folder:
  `L3` prints as *Lecture 3*, `B2| Chapter 40` as *Chapter 40*, `Week 2` as *Week 2*; a folder with
  no number keeps its name and sorts after the numbered ones;
- every **published** note inside is a **lesson**, in natural order by title, with a note named like
  its unit (the chapter hub the reading companion writes) first;
- notes sitting directly in the path's folder are its **introduction**.

No frontmatter is asked of any note beyond `publish: true`. A note that is not published is not a
lesson; a path with no lesson a visitor may read is not sent to that visitor at all.

## Declaring a path

**From the vault.** Put a note named like the folder (or `index.md`) inside it and write, in its
frontmatter, `library: book` (or `course`, `series`). The folder is on the shelf, with `title:`,
`description:`, `cover:` and `source:` from the same note when they are there. Nothing is typed in
Settings; the settings list shows these paths under its rows, and *Customise here* turns one into a
row when you want to override something. A row that names the same folder wins field by field and
takes the rest from the note.

**From the tree.** Right-click the folder in the sidebar and choose **Library…**. The popover guesses
the kind from what is inside (`L1..L14` is a course, `Chapter 39..41` a book, a folder under
*Talks* a series), takes the folder's name as the title, and **Put on the shelf** saves it. The first
path switches the library on. Right-click the same folder again and the popover says it is on the
shelf, opens it, or takes it off.

**Settings → Publishing → The library.** The same rows, with the fields the tree does not ask for.
**Add a path** opens the vault's folders to click (type to filter), and each row's folder line
reopens that chooser; nothing here is typed as a path.

| Field | What it is |
| --- | --- |
| Kind | Book, course or series. It decides the cover's shape and the shelf's grouping. |
| Title | What the shelf and the door call it. |
| Address | The URL segment: `/library/<address>`. Lowercase letters, digits, hyphens. |
| Folder | The vault folder the path reads, chosen from the tree. |
| Blurb, cover, source | Folded under one line until a row has them. Blurb: one or two sentences under the title. |
| Cover | Start typing and the vault's images are offered, with thumbnails; pick one, or paste an https URL. |
| Cover | An image, as a banner value (`attachments/cover.jpg` or an https URL). Without one the site draws a cover from the title. A [Media tracker](trackers.md#the-media-page) whose `folder:` is this path's folder lends its cover instead, over this field. |
| Source link | Where the material came from: the course page, the publisher. Shown on the path. |
| Hidden | A lossless take-down: the row keeps every field and reaches nobody. |

Two placements and a name sit above the rows: **Door in the navigation** (on by default once the
library is on; a *Library* link beside the topics on both public shells) and **Shelf on the home
page** (off by default; a band of covers on the blog home, above the writings). **Name** renames the
door and the page; empty means "Library".

Each card counts the notes inside and how many are published. **The library lists published notes
only**: a path whose notes are all drafts is a shelf with nothing on it, and the door in the
navigation stays hidden until some path has a note a reader may open.

Up to 24 paths. The rows' order is the shelf's order.

## What a reader gets

- **The shelf** (`/library`): courses, books and series in groups, each as a cover, a title, a blurb,
  the count of lessons and the reading time, and this browser's progress.
- **A path** (`/library/<address>`): the cover, the blurb, the source, a *Start reading* or
  *Continue with lesson n* button, and the contents by unit with every lesson numbered.
- **A lesson** (`/library/<address>/<n>`): the note rendered by the reading renderer, with its place
  said at the top (*Lesson 7 of 24 · Lecture 3*), the path's outline down the side with this lesson
  lit, and the previous and next lesson at the foot. `←` and `→` walk the path.

**A lesson is not a post.** A published note inside a library path lives on the shelf and leaves the
blog: it is not in the home lists, the topics, the RSS feed or the sitemap's post entries. Its own
URL still works. Turning the library off, or hiding the path, gives those notes back to the blog.
The two placements are independent: a shelf on the home page with no door in the navigation is a
fine way to keep a library quiet.

**Links stay on the path.** A wikilink inside a lesson that points at another lesson of the
library opens that lesson, in the library, with its contents and its place; a link to a note that is
not on any shelf opens the note's own page as it always did.

Progress is the reader's own, per browser, never sent anywhere: opening a lesson marks it read,
the path page counts, the shelf card says *Continue with lesson n*, and *Forget my place* clears it.

## Where it lives

`shared/library.ts` holds the rules (what a legal row is, how a unit's name is read, how things
sort), shared by the settings editor and the server so a green field and a 400 cannot disagree.
`server/library.ts` resolves a path against the index for one session's scope. `GET /api/library`
is the shelf; `/api/me.library` is the door. `client/library/` is the pages, the band, the covers
and the progress. `npm test` covers the rules (`tests/library.test.ts`).
