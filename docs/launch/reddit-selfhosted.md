# r/selfhosted draft

Check the subreddit's rules on the day: new-project posts have been limited to a set day or thread,
and some rules ask for specific information in the post. Adjust to fit.

**Title:**

> Astrolabe: a self-hosted Markdown notes app with a built-in blog (MIT, Node, no database)

**Body:**

I've been working on a notes app that runs as a single Node process over a folder of Markdown
files, and I'd like feedback from people who run things like this.

**What it does**

- Edit and read your notes from any browser on your network: live-preview editor, wikilinks,
  backlinks, graph, full-text search, a PDF/EPUB reader.
- Publish the notes you mark with `publish: true` as a blog on the same instance: RSS, sitemap,
  reader comments with moderation, optional webmentions and fediverse following.
- The interface is in English and Arabic, with full right-to-left support.

**How it runs**

- Node 24, one port (6801 by default), no database for notes. The vault is a folder; the app keeps
  its own state in a separate data directory. Comments use a SQLite file.
- `git clone https://github.com/ZahakJ/astrolabe.git && cd astrolabe && npm install && npm start`
- Signed-out visitors get read-only access to published notes; the admin password is an argon2id
  hash in `.env`. Login attempts are rate-limited.
- Put it behind any HTTPS reverse proxy. [Publishing docs](https://zahakj.github.io/astrolabe/site/en/publishing/).
- Backup: the app can commit the vault to a git remote on a timer, fast-forward only.
- No telemetry, no CDN requests, fonts served locally.
- Desktop (AppImage, deb, pacman, Windows) and Android builds on the
  [releases page](https://github.com/ZahakJ/astrolabe/releases/latest); they connect to your instance.

**What's missing**

- <!-- Replace with the actual state on the day: Docker image or not, demo instance or not. -->
- No macOS or iOS apps. No plugin system. One maintainer.

Repo: https://github.com/ZahakJ/astrolabe · Manual: https://zahakj.github.io/astrolabe/site/en/
· Compared with Obsidian, Logseq, Joplin: https://zahakj.github.io/astrolabe/site/en/comparison/

Screenshots: <!-- graph, blog home, the Arabic interface -->

Questions and bug reports welcome, here or as GitHub issues.
