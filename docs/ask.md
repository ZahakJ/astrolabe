# Ask the vault

*Search by what a note means rather than the words it uses, see which notes are about the same thing, and ask a question your notes answer, with the passages they answered it from. On your own machine by default.*

← [Back to the README](../README.md) · [All docs](README.md)

---

The search box finds the words you type. That is the right tool when you remember the words, and the wrong one when you remember the idea: a note that says "a quarter of the dose is still in the blood at midnight" is not found by *why does coffee keep me awake*, and an English note is not found by an Arabic question at all. Ask the vault reads every note for its meaning, once, and keeps what it read. Then four doors use it:

- **Search by meaning**, the search box's second mode
- **Related**, a list in the Nearby part of the outline pane
- **Suggest links**, passages elsewhere that belong linked to the note you are writing
- **Ask the vault…**, a question answered from your notes, with every claim pointing at the passage it came from

All four are yours alone. A visitor to your site never sees any of them, and the server refuses every one of their requests from anyone who is not signed in as the owner.

## Before you start: Ollama

The reading is done by [Ollama](https://ollama.com), a program that runs language models on your own computer. Install it, then pull the two models Astrolabe uses by default:

```sh
ollama pull embeddinggemma   # reads notes for meaning (621 MB)
ollama pull qwen3.5:9b       # answers questions (6.6 GB)
```

That is all. Astrolabe finds Ollama at its usual address (`http://127.0.0.1:11434`); if you have moved it, the `OLLAMA_HOST` variable Ollama itself reads is the one Astrolabe reads too. The first time the server starts with Ollama running, it reads the whole vault in the background. A 60-note vault takes two to four seconds; a vault of 2,400 notes (4,565 passages) took 55 seconds on an RTX 4070 SUPER. Nothing waits for it: the app is usable at once, and the doors say "still reading" until it is done.

From then on, only what changes is read again. Save a note and, a moment later, the passages you edited are read; the ones you did not touch are not. Restart the server and nothing is read at all.

## Search by meaning

Under the search box, beside the operators card and replace, is a button of two overlapping circles. Press it and the box searches by meaning: type *why am I groggy after a long afternoon sleep* and the note about naps comes first, followed by the passage from your caffeine note about the afternoon slump. Each result is the best passage of one note: its title, the heading the passage sits under, the passage itself, and how close it is as a percentage. Clicking a result opens the note **at that heading**.

The question and the notes need not share a language. An Arabic question finds English notes and an English question finds Arabic ones, because the model reads both into the same space: «كيف أحول بقايا الطعام إلى سماد» finds both your Arabic note on compost and your English one.

Press the button again to go back to searching the words. The words stay in the box, so you can ask the same thing both ways. The palette has **Search by meaning…** too, which opens the sidebar in this mode with the box focused. The mode is remembered on this device.

## Related

The outline pane's **Nearby** list shows notes that share the open note's uncommon words (see [Nearby](editor.md#nearby)). Under it, **Related** shows the notes nearest the open one in *meaning*: what it is about, not which words it happens to use. A note in Arabic and its English counterpart find each other here with no word in common. Related leaves out every note Nearby already listed, so the two lists add up rather than repeat.

## Suggest links

Under Related, **Suggest links** lists passages in other notes that read like the note you have open and are **not linked with it in either direction**. Each row names the note and the heading of the passage, quotes it, and has a **Link** button. Press it and `[[Note#Heading]]` is written at your cursor in the note you are editing: one change, undone with `Ctrl/Cmd Z` like any other, saved by the ordinary autosave. When the note is open for reading rather than editing, the link is added at the end of the note instead.

This is a different question from [**Unlinked mentions**](editor.md#unlinked-mentions), further down the same pane, which finds your note's *name* written in other notes' prose. The two lists stay separate.

## Asking a question

Press `Ctrl/Cmd P`, choose **Ask the vault…**, type the question and press `Enter`. (On a phone it is in the **⋯** menu.) A panel opens and the answer appears as it is written.

The answer is **grounded only in your notes**. Before the model sees your question, Astrolabe finds the six passages nearest to it in meaning and hands the model those and nothing else, with the instruction to use nothing but them and to cite each one it uses. The citations appear as small numbered marks; each opens its note at the passage's heading. Under the answer, **Passages it read** lists every passage the model was given, with the ones it cited highlighted, so you can see what it left out as well.

When your notes do not answer the question, you are told so: ask *What did Ibn Rushd write about sourdough?* of a vault that has notes on Ibn Rushd and notes on sourdough, and the answer is "The vault says nothing about what Ibn Rushd wrote about sourdough bread", not an invention. When a question assumes something your notes do not support, the answer says that too. Ask in Arabic and the answer is in Arabic.

The panel always says **who answered and whether it left the machine**: before you ask, under the question box ("qwen3.5:9b answers, on this machine. Nothing leaves it."), and after, under the answer, with how long the first word took.

**Copy as note** keeps an answer. It asks where to put it (in a folder called `Ask` by default, named after the question) and shows the path it will create before it creates anything. The note carries `source: ask` in its properties, the model and the date, the question as its title, the answer with every citation turned into a `[[wikilink]]` to the passage it came from, and a **Sources** list at the end:

```markdown
---
source: ask
asked: 2026-09-23
model: qwen3.5:9b
local: true
---
# How do I fix a flat sourdough loaf?

Wait until the dough has risen by half before shaping [[Why my loaf was flat#What I changed|1]] …

## Sources

1. [[Why my loaf was flat#What I changed]]
```

## Answers from Anthropic (optional)

Answers come from the model on your machine unless you choose otherwise. In **Settings → Ask → Answers come from** you can pick **Anthropic** instead, and add an **Anthropic key**. The key is kept on the server only, in its data directory, readable only by the server's own user; it is never sent to a browser, never shown again once saved (the row says only whether one is stored), and never copied into the vault, so it does not travel with the vault to other machines or into a git backup.

With Anthropic chosen, each question **and the passages retrieved for it** are sent to Anthropic's API to be answered, and the panel says so before you ask ("… the question and the passages are sent to Anthropic"). Reading the notes for meaning is never sent anywhere: the embedding model is always the one on your machine.

## Settings → Ask

| Row | What it does |
| --- | --- |
| Answers come from | This machine (Ollama), or Anthropic |
| Local model | The Ollama model that answers (default `qwen3.5:9b`) |
| Anthropic model | The model used when Anthropic answers (default `claude-sonnet-5`) |
| Anthropic key | Stored on the server only; **Remove key** deletes it at once |
| Embedding model | The Ollama model that reads notes for meaning (default `embeddinggemma`). Changing it reads every note once more; switching back finds the old reading still stored |
| Passages per answer | How many passages the answering model is given, 2 to 12 (default 6) |
| Status | Whether Ollama is running, whether each model is pulled, and how many notes have been read; **Read again now** starts a pass at once |

These settings travel with the vault like the rest of Settings (see [Configuration](configuration.md)); the key does not.

## When Ollama is not running

Nothing breaks. Each door says so in one line, *Ollama is not running on this machine, so meaning search is off. Exact search still works.*, and does nothing else: the meaning mode lists that sentence instead of results, Related shows it instead of notes, Suggest links is not drawn at all, and the answer panel shows it above the question box. The ordinary search never depended on any of this. When a model is missing rather than Ollama, the line names the model and the command that pulls it. Start Ollama and the next pass (within a minute, or at once with **Read again now**) catches up.

## Choosing the embedding model

The embedding model decides what "near in meaning" means, and the one most tutorials start with, `all-minilm`, was trained almost entirely on English. It was measured against four other models Ollama offers on a bilingual sample: the 61-note vault the feature was built against (sleep, bread, al-Andalus, software, the garden; about a third of it in Arabic, several notes with a counterpart in the other language), and 24 questions written as paraphrases, 12 in each language, each with the note that answers it. "Hit@1" is how often that note came first; "cross-language hit@3" is how often its counterpart in the *other* language was in the top three.

| Model | English hit@1 | English hit@3 | Arabic hit@1 | Arabic hit@3 | Cross-language hit@3 | Reading the vault |
| --- | --- | --- | --- | --- | --- | --- |
| all-minilm | 9/12 | 12/12 | **0/12** | 4/12 | 0/23 | 0.3 s |
| nomic-embed-text | 10/12 | 11/12 | 2/12 | 6/12 | 0/23 | 5.7 s |
| paraphrase-multilingual | 3/12 | 12/12 | 8/12 | 12/12 | 15/23 | 0.9 s |
| bge-m3 | 9/12 | 11/12 | 5/12 | 10/12 | 15/23 | 1.1 s |
| **embeddinggemma** | **9/12** | **12/12** | **9/12** | **11/12** | **20/23** | 0.9 s |

`all-minilm` found the right Arabic note first for none of the twelve Arabic questions, and never once connected a note to its counterpart in the other language. `embeddinggemma` does both languages as well as the English-only models do English, and finds the other language's version of a note in the top three for 20 of 23 questions, which is why it is the default. `bge-m3` is a reasonable second choice. Any Ollama embedding model works: type its name in the row and pull it.

## How it works

A note is cut into passages at its headings, and at paragraphs within a long section, so that each passage is about 200 to 400 tokens and belongs to exactly one heading; that heading is what a citation or a result opens. Each passage is shown to the model with the note's title and its heading above it, and the vector the model returns is stored in the server's data directory (`embeddings.db`), keyed by a fingerprint of exactly that text and the model's name. A passage whose text, heading and note title have not changed is never read twice, however often the note around it is edited. The file is a cache: deleting it costs one reading pass and loses nothing, and it never travels with the vault.

Searching compares the question's vector with every passage's in the server's memory. For a vault of thousands of notes that takes a few milliseconds, which is why there is no separate database to install. On the 2,400-note test vault a meaning search took about 50 milliseconds from request to answer, most of it the model reading the question. The first word of an answer from `qwen3.5:9b` on an RTX 4070 SUPER arrived in about 0.3 seconds once the model was loaded, and in about 8 seconds when Ollama had to load it first.
