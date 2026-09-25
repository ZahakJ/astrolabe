# Capture

*Getting things into the vault without opening a note: a line from anywhere, a thought said aloud, a page from the browser, a share from the phone.*

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

## Voice

Some thoughts arrive while your hands are busy. Say them instead: the quick-capture sheet has a microphone, and the words are written into your vault by **your own server**, on the machine it runs on. Nothing is sent to anybody's cloud — the recording goes from your device to your server, and the transcription happens there.

**Recording.** Choose **Voice note** from the palette, or from the **⋯** on a phone, or press the microphone at the top of the quick-capture sheet. There is one round button, and it does both things people do with a phone:

- **Tap** it to start, and tap it again (or press **Send**) when you have finished.
- **Hold** it while you talk, and let go to send.

A level bar moves while it hears you, and the time counts up. **Discard** throws the recording away; nothing is kept. The first time, your browser asks for the microphone. Recording needs the site on `https` (or on `localhost`): browsers do not offer a microphone to a plain `http` address on your network.

**Where the words go.** A short note — up to about eighty words, half a minute of speech — becomes one line in today's inbox note, `Inbox/2026-09-23.md`, the same note the phone's share sheet files into:

```markdown
- 14:02 — Call the dentist about Thursday 🎙
```

The 🎙 is a link to the recording itself. Anything longer becomes a note of its own, `Inbox/Voice — <first words>.md`, with a player for the recording at the top and the transcript underneath. Nothing is ever overwritten: a second note with the same first words is `(2)`.

The recordings are ordinary attachments, filed by your attachments setting (Settings → Vault → New attachments) in a `Voice` folder and named by when you spoke: `Attachments/Voice/2026-09-23 1402.webm`.

**While it transcribes.** The sheet says what is happening: sending, waiting its turn (one recording is transcribed at a time), transcribing, and then the words. You do not have to wait — close the sheet and a message tells you when the note has landed, with a button to open it. The very first note downloads the speech model into the server's data directory, which takes a minute or two once; the sheet shows how far along it is.

**Settings.** Three rows:

- Settings → Vault → **Voice transcription** chooses the model and where it runs. The default is whisper's **small** model, which any processor runs faster than you speak. **Base** is quicker still and makes more mistakes in Arabic; the **large turbo** (compact, or in full precision) is the most accurate, and the heaviest. Open the list to see what each one downloads on this machine and, when the processor will run it, how long a minute of speech takes on two cores. Beside the list, **Auto** uses the graphics card when there is one that works and the processor otherwise; **Processor only** never touches the graphics card. **Off** keeps recordings and links them from the inbox without transcribing them. The line under the row says whether the model has been downloaded and which model ran where — "Small last ran on the processor". An instance that never chose a model has Small; one that chose the large turbo keeps it.
- Settings → Vault → **Keep voice recordings**. On by default. Off deletes a recording once its words are safely in the vault. A recording whose transcription failed — or heard nothing — is always kept, whatever this says.
- Settings → Language & dates → **Voice note language**. **Detect** lets each recording be heard for what it is, which suits a vault that speaks both languages. Pin **Arabic** or **English** if the detector keeps mishearing you.

**What runs where.** Transcription runs on the machine the server runs on, and it does not need a graphics card. On the processor, whisper runs as an ONNX model through onnxruntime on the machine's physical cores (up to eight); on a graphics card it runs as whisper.cpp through Vulkan or CUDA, or Metal on a Mac. With **Auto**, a card whose driver will not load or finds no device is passed over without a word, and the same recording is heard on the processor. The desktop app ships only the processor path — no graphics-card build at all — which keeps its download about 50 MB smaller; a server installed from npm has the card builds too.

How long a minute of speech takes on **two cores** of a desktop processor (measured with the other cores busy, so a machine of your own should do at least this well):

| Model | Download on the processor | A minute of speech | Memory while it works |
| --- | --- | --- | --- |
| Base | 161 MB | about 5 s | about 0.9 GB |
| **Small** (the default) | 375 MB | about 15 s | about 1.5 GB |
| Large turbo | 1.0 GB | about 23 s | about 2.7 GB |

Arabic takes longer than English with Small (its words cost the decoder more steps): about 14 s for a minute of English, 20 s for Arabic. A recording is heard half a minute at a time, and each half-minute's language is detected on its own, so a note that starts in English and goes on in Arabic comes back in both.

The model lives in the data directory, never in the vault, so it is not synced, published or committed. The desktop app is its own server, so on a desktop the words are made on that desktop.

**From the phone app.** The share sheet ("Share to Astrolabe") has the same round button under the text: say it instead of typing it, and the words land in the same inbox note on your server. A vault opened from GitHub on the phone has no server to transcribe with, so a voice note there is **kept**: the recording is saved into the vault and linked from the day's inbox, committed and pushed like any other change, and the sheet says the words need an Astrolabe server. It is not transcribed later on its own — play it wherever you open the vault.

The desktop app asks the system for the microphone the first time; nothing else in the app can use it, and no other site can.

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
- [Feeds](feeds.md) — articles from the feeds you follow, kept through the clipper's own converter
- [Import](import.md) — a whole Notion, Evernote or Obsidian export at once
