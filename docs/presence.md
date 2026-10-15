# Discord presence

*What Discord shows under your name while you work in Astrolabe, how to switch it on, and exactly what leaves the machine.*

← [Back to the README](../README.md) · [All docs](README.md)

---

Discord has a line under your name for what you are doing: a game, a song, a program. Astrolabe can fill it. While you write, your friends see **Writing · Chapter 3**; while you read a PDF, **Reading a book**; in an Orbits session, **Reviewing cards · 12 left**. It is **off** until you switch it on, you choose how much it says, and the words go to the Discord app running on your own computer — Astrolabe sends them to no server of its own.

## What Discord shows

The card has four parts, and each one comes from a setting you can see:

```
 ┌──────┐  Astrolabe              the application's name
 │ mark │  Writing                what you are doing
 │    ✎ │  Chapter 3              the title (only if you allow it)
 └──────┘  00:12:34 elapsed       the timer (if you want one)
```

The large picture is the Astrolabe mark. The small round one in its corner says what you are doing at a glance: a pen for writing, a page for reading a note, an open book for a PDF or an EPUB, two cards for an Orbits session, a brush for a drawing, a shelf for the library, a compass for everything else (the graph, the calendar, Today), and a moon when you have stepped away.

| You are… | Discord says |
| --- | --- |
| in a note, editing | Writing |
| in a note, in the reading view | Reading |
| in a PDF or an EPUB | Reading a book |
| in an Orbits session | Reviewing cards, and how many are left |
| on a drawing | Drawing |
| on the library or the Media page | In the library |
| anywhere else | Browsing |
| away for longer than **Idle after** | nothing, or Idle |

When several tabs are open — a laptop and a phone, two windows — the one you touched most recently wins.

## Setting it up

Set **Settings → Discord → Mode** to *Activity* or *With title*, and press **Save**. Astrolabe ships with its own Discord application, so there is nothing to create or paste.

The **Status** row at the foot of the page says what happened: *Connected through the desktop app*, and under it what Discord is showing right now. If it says something else, see [When it does not show](#when-it-does-not-show).

To show your activity under an application of your own — your own name on the first line of the card — create one in the [Discord Developer Portal](https://discord.com/developers/applications) (**New Application**, then copy the **Application ID** from **General Information**) and paste it into **Settings → Discord → Advanced → Application id**. In a build of your own, `DEFAULT_DISCORD_CLIENT_ID` in `shared/presence/config.ts` is the built-in id. While neither is set, presence stays off.

The other rows on the page:

- **Idle after** — how long with no key, click or scroll in any open tab before you count as away (5 to 60 minutes; 10 by default).
- **When idle** — *Clear* takes the line off your profile; *Show "Idle"* keeps it and says so, with the moon.
- **Vault name** — the vault folder's name on the card, as the large picture's tooltip and as the second line when there is no title. A name, never a path.
- **Elapsed time** — the timer: off, since you opened the current note, or since Astrolabe started.
- **Blog button** — a *Read the blog* button under the card, linking your public site. It needs the blog or designed layout and an `https://` address in `SITE_URL`; otherwise the row is greyed out and says why.
- **This server runs beside Discord** — see the next section.

## Who speaks to Discord

Discord listens on a local socket, a file on the computer it runs on. Only a program on that same computer can reach it, so which program speaks depends on how you run Astrolabe:

- **The desktop app** speaks to Discord itself, always, for every vault it has open. Nothing else to switch on: in the desktop app the **This server runs beside Discord** row is greyed out, because the app owns the connection.
- **A server you run yourself**, opened in a browser, speaks to Discord only when you switch on **Settings → Discord → This server runs beside Discord** — which is right when the server runs on the same computer as Discord (your desktop, with Astrolabe started by `npm start`). A server on another machine, a VPS or a home server, has no Discord beside it; switching the row on there does nothing but look for one, quietly.

Either way the tab you work in tells its own server what you are doing — the surface and the note's path, never a title — and the server decides what to say. The path never leaves the server.

## What leaves the machine

Nothing below the line ever reaches Discord. Everything above it reaches Discord only when the setting beside it says so.

| What | When Discord is told |
| --- | --- |
| What you are doing (Writing, Reading, a book…) | **Mode** is *Activity* or *With title* |
| The title of the note, book or deck | **Mode** is *With title*, and the note does not keep it to itself ([below](#keeping-a-note-to-itself)) |
| How many cards are left in a session | in a session (a count says nothing about the vault) |
| The vault folder's name | **Vault name** is on |
| The time since you started | **Elapsed time** is not off |
| A link to your public site | **Blog button** is on, the site is public and `https://` |
| Paths, folder names, note text, tags, links, other notes | **never** |

A title is the note's `title:` from its frontmatter, else its file name without the extension. A title that contains a `/` is cut to its last part, so a name can never smuggle a folder out. Every string is cut to 128 characters, Discord's limit.

The words go to the Discord app on this computer. What Discord does with them next is Discord's: it shows them to whoever can see your profile, as it does for any game. With **Mode** off, Astrolabe opens no connection to Discord at all.

## Keeping a note to itself

Some notes should not have their titles on your profile even when the others do. Two ways:

```yaml
---
presence: false
---
```

A note with `presence: false` in its frontmatter is shown as **Writing** or **Reading** — the activity, never its title — whatever **Mode** says. And a note carrying any of the tags you keep off the public site (**Settings → Publishing → Advanced → Excluded tags**, or `EXCLUDE_TAGS`) is treated the same way, so a `#private` note is private here too.

## The images

The mark and the eight small pictures are PNG files of 1024 × 1024 pixels in [`docs/brand/presence/`](brand/presence/), and Discord fetches them from the project's own pages site. Nothing to upload.

If you would rather Discord kept its own copies — or your network keeps Discord from fetching outside images — upload them instead: in the Developer Portal open the application, **Rich Presence → Art Assets**, and add each PNG under its key, the file name without `.png`. Then set **Settings → Discord → Advanced → Image source** to *Uploaded to Discord*.

| Key | Shown as | When |
| --- | --- | --- |
| `mark` | large image | always |
| `pen` | small image | writing a note |
| `page` | small image | reading a note |
| `book` | small image | reading a book |
| `cards` | small image | reviewing cards |
| `brush` | small image | drawing |
| `shelf` | small image | in the library or on the Media page |
| `compass` | small image | anywhere else |
| `moon` | small image | idle |



## How often it changes

Discord accepts one change every 15 seconds. Astrolabe sends one only when what it would say has changed, and when several changes land inside those 15 seconds, the latest one goes. So flicking through ten notes in a minute updates your profile a handful of times, not ten.

Each open tab tells its server what it is showing a second after it settles, and every minute after that, so the server knows which tab is in use and when you stepped away. A tab that is closed or asleep is forgotten after two and a half minutes. When Astrolabe quits, it clears the line from your profile.

## When it does not show

Read the **Status** row first; it names the problem.

- **"Paste the application id above, and save."** No id is in force yet: see [Setting it up](#setting-it-up).
- **"Nothing speaks to Discord yet."** You are on a server in a browser, and its **This server runs beside Discord** row is off. Switch it on if Discord runs on the same computer, or use the desktop app.
- **"Discord is not running on this computer."** Start Discord. Astrolabe keeps looking — quickly at first, then about every five minutes — and connects by itself; it never shows an error for Discord being closed.
- **"Discord does not know this application id."** The id is mistyped, or the application was deleted in the portal. Copy it again. Astrolabe stops asking Discord until the id changes.
- **Connected, but nothing on your profile.** In Discord, open **User Settings**, then **Activity Privacy**, and let it share your activity.
- **Discord from Flatpak or Snap.** Both keep the socket in a folder of their own; Astrolabe looks there too (`$XDG_RUNTIME_DIR/app/com.discordapp.Discord/` and `snap.discord/`). A Flatpak Discord without access to that folder cannot be reached by any program, Astrolabe included.
