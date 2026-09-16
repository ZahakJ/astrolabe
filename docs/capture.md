# Capture

*Getting things into the vault without opening a note: a line from anywhere, a page from the browser, a share from the phone.*

← [Back to the README](../README.md) · [All docs](README.md)

---

Most of what ends up in a vault does not start as a note. It starts as a sentence you want to keep before it goes, a page you are reading somewhere else, or something on your phone you would rather have here. Capture is the set of three doors that take those in and file them, so that opening the app is something you do to *read* what you caught, not something you have to do first.

All three write ordinary Markdown into ordinary files. Nothing is kept anywhere else: a captured line is a line in a note, a clipped page is a note under `Clips/`, and the one credential involved (the clipper's token) lives in the server's data directory, never in the vault.

## Quick capture

Press `Ctrl/Cmd Shift D` anywhere in the app, or choose **Quick capture** from the palette. A small sheet opens over whatever you were doing. Type a line and press `Enter`. The line is appended under a `## Captured` heading in **today's daily note**, stamped with the time:

```markdown
## Captured

- 09:15 Ask about the reading room's opening hours
- 14:02 "A map with no star is a wheel" — for the essay
```

The note you were in stays where it was, with your caret in it; a toast names the note the line went to and offers to open it. If today's note does not exist yet it is created first, through the same door `Ctrl/Cmd Alt D` uses, so it carries the daily template (Settings → Vault → Templates) exactly as it would have if you had opened it yourself. If the note already has a `## Captured` section the line joins the end of it; if not, the section is added at the end of the note. `Shift Enter` makes a second line for a thought that needs two; it is hung under the same bullet.

**The inbox.** Sometimes the day's note is the wrong home: a line that belongs to a project, a reading list, a running list of questions. Pin a note as the **capture inbox** in Settings → Vault → Capture inbox, and the sheet grows a second choice: *Today's note* or *Inbox*. The line lands under `## Captured` in whichever you pick, in the same shape.

On a phone the sheet sits at the bottom of the screen, where a thumb already is, and the field and both buttons are tall enough to hit. The shortcut is not the only way in: on a phone, **Quick capture** is the first row under the **⋯** in the top bar.

The time stamp uses your device's clock and Western digits, like the daily note's own filename: it is an address inside the note, not prose, and it should sort the same way in every language.

## The clipper

The clipper saves a web page — or just the part of it you selected — as a note in your vault, converted to Markdown, with where it came from written in the frontmatter.

### Setting it up

Open Settings → Vault → **Clipper** and drag the **Clip to …** button to your browser's bookmarks bar. That is the whole installation: the button is a *bookmarklet*, a bookmark whose address is a line of JavaScript, and the token that lets it write to your vault is already inside it. Clicking the button on the settings page itself does nothing on purpose.

**Renew token** makes a new token and retires the old one. Every copy of the bookmarklet you ever dragged out stops working the moment you press it, and the button on the page now carries the new one. Do this if a browser you used is lost, or simply once in a while. The token is kept in the server's data directory as `clip-token` (readable only by the user the server runs as) and never enters the vault, so it is never synced, published or committed with your notes.

### Using it

On any page, click the bookmarklet. With nothing selected it clips the page; with a selection it clips only that, keeping the selection's headings, links and formatting rather than its plain text. A small message says where the note went.

The note is written to `Clips/<page title>.md`. A second page with the same title becomes `<title> (2).md`; nothing is ever overwritten. Inside:

```markdown
---
source: "https://example.org/the-page"
clipped: 2026-09-15
---

# The page's title

The page, as Markdown.
```

The converter is deliberately conservative. It keeps headings, paragraphs, lists (nested and numbered), links (made absolute, so they still work from your vault), images **by URL** (nothing is downloaded), block quotes, code (inline and fenced, with the language when the page names one), bold, italic, rules and the simplest tables. Scripts, styles, forms, players, navigation and the page's own furniture are dropped, and a page that marks up its `<article>` or `<main>` gives you that and nothing around it. Prose that happens to contain Markdown's own marks (`*`, `[`, a line starting with `#`) is escaped so it reads as it did on the page. What comes out is a note you can edit, not a copy of the page's layout.

The bookmarklet sends the page to your site directly from the page you are on. Some sites forbid that in their security policy; when that happens the bookmarklet falls back to submitting the clip through a new tab, which opens on the note it made. Either way the clip lands.

### From a script

`POST /api/clip` takes JSON `{ url, title?, html?, selection?, text? }` with the token in a `token` field or an `Authorization: Bearer` header, and answers `{ kind: "clipped", path }`. Your own signed-in session works too (no token needed). A body with no address at all is treated as a thought and appended to today's note under `## Captured` — the same thing the phone's share sheet does for a shared sentence — answering `{ kind: "captured", path }`.

## From a phone

The site is installable. On a phone, open it in the browser and choose **Add to Home Screen** (Chrome offers it on its own; Safari has it under Share). The installed app opens full-screen, carries the site's name and the colours of its default theme, and, on Android, appears in the phone's **share sheet**.

Share a page from any app to it and the page is clipped into `Clips/`, exactly as the bookmarklet would have done it; the app then opens on the new note. Share a sentence — a thought, a line from a message — and it is appended under `## Captured` in today's note. A share that carries both words and an address is a page with the words as its body.

If the browser you share from is not signed in to the site, the share lands on a page that says so, with the way in; sign in there once and share again.

Two honest limits. A share arrives with the page's address and title but not its contents, so a shared page is filed as its title and address, ready for you to add to; the bookmarklet, which runs *on* the page, gets the whole article. And a daily note the share sheet has to create (because you had not opened today's yet) starts bare — the template is applied by the app when it makes the note, and the share sheet reaches the vault without the app. Open today's note once in the morning and neither limit applies.

The manifest itself is at `/manifest.webmanifest`; it is generated from your settings, so a renamed site or a changed default theme reaches the phone on its next visit, and the [offline copy](offline.md) keeps it network-first for the same reason.

## Related

- [Templates, banners & notes](templates-and-notes.md) — the daily note and its template
- [Keymap](keymap.md) — `Ctrl/Cmd Shift D` beside `Ctrl/Cmd Alt D`
- [Configuration](configuration.md) — `captureInbox`, and where the data directory is
- [Offline reading](offline.md) — what the installed app keeps on the device
