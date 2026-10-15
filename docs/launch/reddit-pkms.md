# r/PKMS draft

**Title:**

> I built a self-hosted notes app around reading and writing in two languages — looking for feedback on the workflow

**Body:**

Most of what I write comes from what I read, and I read and write in both Arabic and English. I
couldn't find a tool that handled both well, so I've been building one. It's called Astrolabe;
it's free and MIT-licensed. I'm posting here for feedback on the workflow rather than the feature
list.

How I use it:

- **Reading.** PDFs and EPUBs open in the app. A highlight goes into the note next to the book with
  a citation back to the page. A reading session is logged against the book.
- **Notes.** Plain Markdown files with `[[wikilinks]]`, backlinks and a graph. A note can have a
  "twin" in the other language, linked by one line of frontmatter.
- **Review.** Highlights and question/answer lines can become spaced-repetition cards; the schedule
  is stored in the note itself.
- **Days.** A Today page brings together the daily note, habits, cards due and tasks.
- **Publishing.** When something is ready, `publish: true` puts it on a blog served by the same
  instance.

It runs as a small server you host (on your laptop is fine) and you use it from a browser, so the
phone and the laptop are looking at the same vault. If you already keep notes in Obsidian, it can
open that folder without converting anything.

Things I'd like to know:

- If you read a lot of PDFs or EPUBs, how do highlights get into your notes today, and what's
  annoying about it?
- For people who write in more than one language: do you keep separate notes per language, or mix
  them?

Repo and install: https://github.com/ZahakJ/astrolabe
Manual: https://zahakj.github.io/astrolabe/site/en/
How it differs from Obsidian, Logseq and Joplin: https://zahakj.github.io/astrolabe/site/en/comparison/
