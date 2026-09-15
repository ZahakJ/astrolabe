# Flashcards

*What you already marked, asked back on a schedule the note keeps.*

← [Back to the README](../README.md) · [All docs](README.md)

---

Astrolabe asks nothing new of your notes to make a flashcard. Three things a note already holds are cards:

| In the note | The card |
| --- | --- |
| `The ==mitochondria== is the powerhouse of the cell.` | A **cloze**: the paragraph with the highlight blanked is the front, the highlighted words the back. Several highlights in one paragraph are one card. |
| `> [!quote] Ibn Khaldun, p. 12` and the quoted lines under it | A **quote**: the source and the opening words are the front, the whole passage the back. The PDF reader's citations are quote callouts, so a highlight you cited from a book is already a card. |
| `Capital of Egypt::Cairo`, or a line, a `?` on its own, and the answer under it | A **question**, front and back as written. The block form takes several lines on either side of the `?`. |

Headings, tables, task lines and anything inside a code fence are never cards.

## Reviewing

Open the Review page from the command palette (**Review flashcards**), or from the line the [Orbits](orbits.md) page shows when cards are due. It shows one card at a time: the front, then **Show answer**, then four grades — *Again*, *Hard*, *Good*, *Easy* — each labelled with the interval it would give, so you never grade blind. Space or Enter turns the card and takes *Good*; the keys 1 to 4 grade it. A card graded *Again* comes back at the end of the day's walk. When nothing is due, **Study ahead** walks the rest of the vault in due order.

The page runs on the SM-2 schedule the Obsidian Spaced Repetition plugin uses: the first *Good* is a day, the second six, and after that the interval grows by the card's ease; *Hard* and *Again* lower the ease, *Easy* raises it, and it never drops under 1.3.

## Where the schedule lives

A grade writes one line into the note, right after the card's block, in the plugin's own form:

```md
The ==mitochondria== is the powerhouse of the cell.
<!--SR:!2026-09-27,4,2500-->
```

An inline `Question::Answer` takes the comment at the end of its own line. That comment is the whole state — the due day, the interval in days, the ease ×1000 — so a vault reviewed in Obsidian's plugin and in Astrolabe is one vault, and deleting the comment makes the card new again. The reading view hides the comment; the editor shows it as source. Nothing about a card is stored anywhere else.

## Making a card from a selection

Select the passage worth remembering, open the selection menu, and choose **Make a flashcard**. The selection becomes the answer of a new `?` block placed after the paragraph, with the caret on the empty question line above it. The Review page finds the card once the note is saved. Highlighting a phrase (Ctrl/Cmd ⇧ H) makes a cloze card the same way, with no menu at all.

## Related

- [Orbits](orbits.md) — the day's page, where the count of due cards appears
- [The PDF reader](books.md) — citations that arrive as quote callouts
- [The editor & reading view](editor.md) — highlights, callouts and the selection menu
