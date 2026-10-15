# Show HN draft

**Title** (80 characters max):

> Show HN: Astrolabe – Self-hosted Markdown notes and blog, in Arabic and English

**URL:** https://github.com/ZahakJ/astrolabe

**Text:**

Astrolabe is a notes app that runs as one Node process over a folder of Markdown files. You open
it in a browser on any device on your network (there are also Linux, Windows and Android wrappers),
and it can publish the notes you mark with `publish: true` as a blog on the same server.

I started it because I write in Arabic and English, and the tools I tried handled Arabic as an
afterthought: right-to-left text that breaks the cursor, search that misses a word because of a
diacritic, an interface that is only in English. Here the whole interface is translated and
mirrored, each paragraph takes its own direction, search folds Arabic diacritics and letter
forms, and dates can be Hijri.

Some details that may interest people here:

- The notes are the database. Everything is read from the files; there is an in-memory search
  index and link graph, and a small SQLite file for blog comments. Deleting the app leaves the
  folder as it was.
- It opens an Obsidian vault in place: wikilinks, embeds, callouts, frontmatter, and the file
  formats of the Excalidraw and Spaced Repetition plugins.
- The server is TypeScript run directly by Node 24's type stripping, with no build step; the client
  is React and CodeMirror 6.
- No CDN requests or telemetry. Fonts are served by your own instance.
- Sync is git: the vault is committed to a private remote you own. The Android app can also work
  on a private GitHub repository directly, with no server.

Try it:

    git clone https://github.com/ZahakJ/astrolabe.git && cd astrolabe && npm install && npm start

then open http://localhost:6801. The first run creates a sample vault that is also the manual.

What it is not: there are no native macOS or iOS apps, no plugin API, and it is a young project with
one maintainer, so expect rough edges. A comparison with Obsidian, Logseq and Joplin, with sources,
is at https://zahakj.github.io/astrolabe/site/en/comparison/.

I would like to hear from anyone who writes in a right-to-left language, and from anyone who tries
it on their own vault and hits something broken.

---

Notes for the thread:

- Answer "why not Obsidian?" with the comparison page and the two concrete differences (server and
  browser instead of an app per device; Arabic as a first language). Do not criticise Obsidian.
- If asked about the size of the codebase or the release cadence, answer with numbers from the repo.
- If someone reports a bug, thank them, open an issue, and link it in the reply.
