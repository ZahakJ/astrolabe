# Japanese & furigana

*Small readings over kanji: the `{漢字|かんじ}` syntax, a right-click that suggests the reading, an automatic mode, and a Japanese typeface that only Japanese lines get.*

← [Back to the README](../README.md) · [All docs](README.md)

---

**Furigana** are the small kana printed above a kanji to say how it is read: the かんじ over 漢字 in a children's book, a textbook or a newspaper's rarer names. In a browser they are drawn by the `<ruby>` element, and Astrolabe draws them in the editor, in the reading view, on the public site and on paper.

## Writing it by hand

Astrolabe reads the syntax of the Obsidian *Markdown Furigana* plugin, so a note stays a plain text file that both programs render the same way:

| You write | You see |
| --- | --- |
| `{漢字\|かんじ}` | 漢字 with かんじ over the whole word |
| `{漢字\|かん\|じ}` | かん over 漢 and じ over 字 — one reading per kanji, in order |
| `{食べ物\|た\|もの}` | た over 食, nothing over べ, もの over 物 — kana inside the word are skipped |

The rules, briefly: the braces must be on one line; the part before the first `|` must contain at least one Japanese character (so `{x|y}` in an English sentence about sets stays exactly as written); a `\{` is an ordinary brace; a `{…}` with no `|` inside is not furigana; and if you give more or fewer readings than there are kanji, the readings are joined and drawn over the whole word rather than misplaced. A `<ruby>` you write in HTML yourself keeps working beside it.

In the editor, a span shows as its ruby until the caret is on its line, when the source comes back with the braces and bars dimmed and the readings in muted ink, so a reading can be corrected by typing over it. The outline, search and a copied title use the word without its braces.

## From the right-click menu

Select a word with a kanji in it, right-click (or press `Shift F10`), open **Insert** and choose **Furigana…**. A small box opens under the selection:

- the word you selected at the top;
- a switch between **one reading for the word** (`{漢字|かんじ}`, the default) and **a reading per character** (`{漢字|かん|じ}`);
- one field for the reading, or one per kanji, each already filled with the most likely reading;
- under each kanji, a row of chips with the other readings it has. Clicking a chip fills that kanji's slot — in word mode it rebuilds the whole reading from the chosen pieces.

`Enter` inserts, `Esc` cancels, `Tab` walks the fields, chips and buttons without leaving the box. The command palette (`Ctrl/Cmd P`) has the same box as **Add furigana to selection**. The row is offered only when the selection actually contains a kanji.

To change a reading that is already there, select any part of the span — its word, its reading or a brace — and choose **Furigana…** again: the box opens on the whole span with its own readings in the fields, in the shape it was written in, and `Enter` replaces it rather than nesting a second span inside the first.

Which reading comes first: in a compound of two or more kanji (学校, 日本) the *on'yomi* leads, because that is how compounds are usually read; for a single kanji the *kun'yomi* leads, and when kana follow it the reading whose okurigana those kana continue goes to the very front — 食 before べる is offered た, before う it is offered く.

## The automatic mode

**Furigana: automatic for selection**, in the command palette, writes the first suggestion over every run of kanji in the selection, one reading per word, without asking. Kanji the table does not know are left as they are, spans that are already there are left alone, and a toast says how many words were written; `Ctrl/Cmd Z` takes all of them back in one step. It is the fast way through a paragraph you will proofread anyway.

## Where the readings come from

The suggestions are the readings of the 2,136 jōyō kanji, taken from **KANJIDIC2**, the kanji dictionary file of the Electronic Dictionary Research and Development Group. The table is downloaded only when the box or the automatic command first opens (about 125 kB), so a vault that never writes a kanji never fetches it.

> **Notice.** KANJIDIC2 is the property of the [Electronic Dictionary Research and Development Group](https://www.edrdg.org/) and is used in conformance with the Group's [licence](https://www.edrdg.org/edrdg/licence.html) (Creative Commons Attribution-ShareAlike 4.0). The generated table (`shared/data/kanjiReadings.json`) carries the same notice, and `scripts/gen-kanji-readings.mjs` rebuilds it from a fresh `kanjidic2.xml`.

## What it does and does not do

- It suggests how each **kanji** can be read, not how a **word** is read. There is no dictionary of words behind it, so 今日 is offered こんにち rather than きょう, and 学校 is offered がくこう rather than がっこう: the box exists so you can check and fix the reading before it is inserted, and the chips are there for the cases the first guess gets wrong.
- It does not convert kana, romanise anything, or touch text you did not select.
- Only the jōyō kanji are in the table. A name kanji or a rare one gets an empty field; type the reading yourself.
- Furigana inside a table cell does not work, because the `|` that separates the readings is also what separates the cells — the same limit the Obsidian plugin has.

## Fonts and spacing

A line written in Japanese takes `lang="ja"`, in the editor and in the reading view, and with it a Japanese typeface (`Noto Sans CJK JP`, `Noto Sans JP`, `Hiragino Sans`, `Yu Gothic UI`, `Meiryo`, then the system's sans-serif) — the serif stack the rest of the note uses has no kana in it. A line is Japanese when its Japanese characters outnumber its Latin letters, so an English sentence quoting one kanji keeps its own type. The browser is also told not to spellcheck those lines, since it has no Japanese dictionary to check them against.

A line with a ruby grows a little taller to make room for the reading; that is correct. A line without one does not change at all: nothing about this feature touches the English or Arabic font stacks or the spacing of a line that carries no Japanese, and the release was measured to that rule — every English and Arabic line's height and typeface identical with the feature on and off.
