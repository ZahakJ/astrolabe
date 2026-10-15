# r/ObsidianMD draft

r/ObsidianMD is about Obsidian. Read the current rules on posts about other tools before posting,
and consider messaging the moderators first. If the rules do not allow it, do not post; answer
relevant questions in existing threads instead, when Astrolabe is a real answer to them.

**Title:**

> A self-hosted web app that opens an Obsidian vault in place, for reading and publishing from a browser

**Body:**

I keep my notes in an Obsidian vault and wanted two things Obsidian doesn't do for me: reach the
vault from any browser on my network, and publish some notes on my own server. So I built
Astrolabe, a small open-source (MIT) server that opens the same folder. It doesn't replace Obsidian
for me; both open the vault.

What carries over without conversion:

- `[[wikilinks]]` with aliases and heading links, `![[embeds]]`, callouts, tags, frontmatter
  properties, highlights, comments, footnotes
- `.excalidraw` and `.excalidraw.md` drawings, in the Excalidraw plugin's format
- Spaced-repetition schedules, written as the Spaced Repetition plugin's own comments
- `.obsidian/` is ignored and never written to

What it adds on top: a blog from notes marked `publish: true` (the same key Obsidian Publish uses),
a PDF/EPUB reader that cites highlights into notes, and a full Arabic interface with right-to-left
support.

What it doesn't do: it has no plugins, and none of Obsidian's community plugins run in it. It is not
a sync service.

Each feature's page in the manual has an "In Obsidian" section saying what the file looks like from
Obsidian's side, e.g. [drawings](https://zahakj.github.io/astrolabe/site/en/drawing/#in-obsidian).

Try it on a copy of your vault first:

    git clone https://github.com/ZahakJ/astrolabe.git && cd astrolabe && npm install
    ASTROLABE_VAULT=~/path/to/vault-copy npm start

Repo: https://github.com/ZahakJ/astrolabe

If something in your vault renders differently from Obsidian, I'd like to know; an issue with a
small example note is the most useful thing.
