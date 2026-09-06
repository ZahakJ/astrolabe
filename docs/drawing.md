# Drawings

*An Excalidraw canvas in the vault: a drawing is a note that opens as a whiteboard, embeds as a picture, and keeps working in Obsidian.*

← [Back to the README](../README.md) · [All docs](README.md)

---

A drawing is a file in the vault, in a format Excalidraw already speaks: the editor's own
`.excalidraw` JSON, or the shape the Obsidian Excalidraw plugin writes into a markdown note,
`.excalidraw.md`. Vellum did not invent a third one. Both open here as a full Excalidraw canvas in
a pane, both save back into the same file, and both keep opening in Obsidian afterwards.

A drawing is a **note** by every other measure: it sits in the tree with a pencil beside its name,
it is a tab beside the notes you are writing, the words on its canvas are in search, and a
`[[wikilink]]` typed into a text element counts in the graph and the backlinks. It is a
**picture** by one: it never opens in CodeMirror.

## Making one

Right-click a folder → **New drawing here**, or **New drawing** in the command palette (it lands in
the open note's folder). The name prompt offers `Drawing.excalidraw`, and the extension is the
format:

| The vault | A new drawing is | Why |
| --- | --- | --- |
| has an `.obsidian/` folder | `Drawing.excalidraw.md` | the Obsidian Excalidraw plugin opens it there, as a note with the scene inside |
| does not | `Drawing.excalidraw` | Excalidraw's own file, readable by excalidraw.com and every tool that speaks it |

Type either extension yourself to choose. A drawing made in Obsidian, compressed or not, opens
without conversion; when Vellum saves a plugin file it keeps the frontmatter, keeps the compression
if the file had it, and lists the text elements under `## Text Elements` where the plugin does, so
Obsidian's own search and links keep working on what Vellum drew.

## Drawing

The canvas is Excalidraw, whole: shapes, arrows, freehand, text, images, the library, every one of
its keys (`r` rectangle, `t` text, `v` select, `?` for the rest). It wears Vellum's room — dark or
light follows [the theme](theming.md) you are in — and speaks the
[editor's language](arabic-and-rtl.md#your-editors-language-is-yours): an Arabic interface gets
Excalidraw in Arabic, mirrored. Its fonts are served from this instance; no request leaves the
origin.

**It saves like a note.** A stroke lands in the file about a second after the pen lifts, under the
same rule every note save keeps: if the file changed on disk in the meantime (Obsidian, a
`git pull`, another window), the save is refused and a strip offers **Keep mine** or **Use the disk
version**. Nothing drawn is dropped either way; the canvas holds your strokes until you decide.
Closing the tab or the window flushes what is pending. The corner says *Saving…*, *Saved* or
*Unsaved strokes*, and nothing else.

**Every save leaves a picture beside the file**, `Drawing.excalidraw.svg`, exported by Excalidraw
itself with its fonts inlined. That svg is what every other surface shows.

## Embedding a drawing

`![[Drawing.excalidraw]]` (or `![[Drawing.excalidraw.md]]`; `![[Drawing]]` finds it too) puts the
picture in a note, sized like an image and taking `|300` the way an image embed does. The editor's
live preview, the reading view, a blog article, a designed page and a library lesson all draw the
exported svg; none of them loads the canvas.

A visitor sees the svg of a **published** note's embed exactly as they see any other attachment of
it: the drawing itself is a note and an unpublished one is a 404, but the picture beside it walks
through the note's own door. Unpublish the note and the door closes.

If the svg is not on disk yet (a drawing made in Obsidian with auto-export off, or a file older
than this feature), you, the owner, see it anyway: the reading view draws it with the canvas
chunk, once, for that page. Open the drawing and save once and the svg exists for everyone.

## What is indexed

The text elements, one per line, and a `[[link]]` set on any shape. Not the JSON: an element id is
not a word anyone searches for. A drawing therefore appears in search by what is written on it,
in the graph by what it links to, and in a note's backlinks when the drawing names that note.

## In Obsidian

Everything here is the plugin's own format, so the plugin sees a drawing Vellum made as its own.
Obsidian's core app (without the plugin) shows a `.excalidraw.md` as a markdown note whose scene
is folded in a `%%` comment, which is what the plugin's files have always looked like there. A
plain `.excalidraw` is an attachment to Obsidian, as it always was. See
[OBSIDIAN-COMPAT.md](../OBSIDIAN-COMPAT.md).

---

*Under the hood: `shared/drawing.ts` reads and writes both spellings (`tests/drawing.test.ts`);
`client/drawing/DrawingSurface.tsx` is the pane; `PUT /api/drawing-svg?path=` is the picture's
door; `scripts/check-bundle.mjs` asserts the canvas never joins a first paint.*
