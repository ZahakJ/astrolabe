# Flashcards

*Things you already marked in your notes, asked back to you on a schedule that the note itself keeps.*

← [Back to the README](../README.md) · [All docs](README.md)

---

A flashcard is a question with a hidden answer: you read the front, try to recall the back, then check. Astrolabe does not ask you to write cards in a special place or a special format. Three things your notes already contain are treated as cards:

| In the note | The card |
| --- | --- |
| `The ==mitochondria== is the powerhouse of the cell.` | A **cloze** (a fill-in-the-blank). The front is the paragraph with the highlighted words blanked out; the back is the highlighted words. Several highlights in one paragraph make one card. |
| `> [!quote] Ibn Khaldun, p. 12` and the quoted lines under it | A **quote**. The front is the source and the first few words; the back is the whole passage. When you cite a highlight from a PDF in the reader, it lands in your note as a quote callout, so it is already a card. |
| `Capital of Egypt::Cairo`, or a line, then a `?` on its own line, then the answer under it | A **question**, front and back exactly as you wrote them. The `?` form can have several lines on either side of the `?`. |

Headings, tables, task lines and anything inside a code block are never cards.

## Reviewing

Open the Review page from the command palette (**Review flashcards**), or from the line the [Orbits](orbits.md) page shows when cards are due. It shows one card at a time: first the front, then **Show answer**, then four grades, *Again*, *Hard*, *Good* and *Easy*. Each grade shows how long the card would wait before coming back, so you never grade blind. Space or Enter turns the card over and grades it *Good*; the keys 1 to 4 pick a grade directly. A card you grade *Again* returns at the end of the day's run. When nothing is due, **Study ahead** lets you go on through the rest of the vault, soonest-due first.

The schedule is SM-2, a well-known spaced-repetition method and the same one the Obsidian Spaced Repetition plugin uses. Your first *Good* makes the card wait one day, the second six days, and after that each wait is multiplied by the card's *ease*, a number that says how easy the card has been for you. *Hard* and *Again* lower the ease, *Easy* raises it, and it never drops below 1.3.

## Where the schedule lives

When you grade a card, the app writes one line into the note, right after the card's block, in the plugin's own format:

```md
The ==mitochondria== is the powerhouse of the cell.
<!--SR:!2026-09-27,4,2500-->
```

A one-line `Question::Answer` card gets the comment at the end of its own line. That comment holds the whole state of the card: the day it is due, the current wait in days, and the ease multiplied by 1000. Because the state is in the note, a vault you review in Obsidian's plugin and in Astrolabe is one and the same vault, and deleting the comment makes the card new again. The reading view hides the comment; the editor shows it as plain text. Nothing about a card is stored anywhere else.

## Making a card from a selection

Select the passage you want to remember, open the selection menu, and choose **Make a flashcard**. The selection becomes the answer of a new `?` block placed after the paragraph, and the cursor is put on the empty question line above it, ready for you to type the question. The Review page finds the new card once the note is saved. Highlighting a phrase (Ctrl/Cmd ⇧ H) makes a cloze card in the same way, with no menu at all.

## Related

- [Orbits](orbits.md) — the day's page, where the number of due cards appears
- [The PDF reader](books.md) — citations that arrive as quote callouts
- [The editor & reading view](editor.md) — highlights, callouts and the selection menu
