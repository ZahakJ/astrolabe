# The desktop app

*Astrolabe as a native application: the menu bar, vaults, windows, the reference window, find in page, updates and deep links.*

← [Back to the README](../README.md) · [All docs](README.md)

---

The [releases page](https://github.com/ZahakJ/astrolabe/releases/latest) carries an AppImage, a
`.deb`, a `.pacman` and an unsigned Windows `.exe` (Windows warns the first time you run it). Each one is the same product as the server
you can host yourself, wrapped as a desktop (Electron) app. Behind the scenes the app starts a
server of its own for every vault you open, on a port it remembers per vault. Nothing about the
vault changes: the folder on disk is the folder on disk, and a browser on the network can still
reach the same vault through a [hosted instance](publishing.md) at the same time. If you run
both over one folder, see [two servers, one vault](backup-and-sync.md#two-servers-one-vault).

## Vaults and windows

**File → Open vault…** (`Ctrl/Cmd O`) picks a folder. **Recent vaults** lists the ones you have
opened before, and *Clear the list* forgets them. **New window** (`Ctrl/Cmd Shift N`) opens
another window on the current vault — that is how a
[second window over one vault](workspace.md#several-windows-one-vault) starts — and
**Close window** is `Ctrl/Cmd W`. *Show the vault in the file manager* opens the folder itself.
The app keeps a tray icon with *Show Astrolabe* and *Quit*. For a launcher or a script,
`ASTROLABE_VAULT=/path` in the environment opens that folder at launch without asking.

**Your tabs survive a port change.** The window's tabs and layout are kept in the browser
storage that belongs to the vault's port. If a launch finds that port busy, the app moves to
the next one — which, to the browser storage, is a brand-new place with nothing in it. So the
desktop also keeps the last workspace beside the vault's data and restores it when a window
opens on nothing. It waits a few seconds for the usual port before moving on; and a window with truly
nothing to restore opens the note you were in most recently, rather than the first name in the
tree.

**The panes, and the window they are in.** Each side pane — the notes sidebar and the outline
pane — is resized by the hairline between it and the note: a 12-pixel strip with the divider
itself down the middle, so the line you aim at is the line that moves, and the pane follows your
hand from wherever on the strip you took hold. Drag a pane off its edge to fold it; it leaves a
narrow door you can click or drag back open. Double-click the divider for the width it started
at. The strip is there whatever the window is pointed at — a mouse, a trackpad, a finger on a
convertible — because whether a pane can be dragged is a question about the pane, not about the
pointer, and a laptop folded flat still has panes.

The widths you set are remembered per window; what the window can *grant* is decided fresh every
time it is resized. Drag the window narrow and the panes give way so the note keeps a column to
be in; widen it again and they come back to the widths you chose. Below about 700 points wide the
window becomes the [phone layout](workspace.md#on-a-phone) — a bar of five doors, screens and
sheets — with the same note open, and widening it brings the panes back. Above that, on Windows at 125% or 150% scaling and in a
window snapped to half the screen, the panes stay docked and stay draggable.

**Zoom belongs to the app.** `Ctrl/Cmd =`, `-` and `0` scale the whole interface, and while it is
anything but 100% the status bar shows the percentage in the corner; clicking it is *actual
size*, the same as `Ctrl/Cmd 0`; `Ctrl` + the mouse wheel steps it too, and **View → Zoom: 120%**
says where it is. The factor is remembered per vault and **survives closing the app**: set 120%
once, and every launch opens at 120% from its first frame — and because it is written where you
can see it, a window that came back smaller than you remember is a window you can put right with
one click. Over an open book the same three
keys zoom **the page**, not the app: reaching for the zoom keys over a book means the book.

Windows remember where they were, per vault, and are fitted to the screen they reopen on. A
window saved on a large monitor and reopened on a laptop is pulled back onto the desk rather than
left with its title bar off the edge, and a first window on a screen too small for the default
opens maximised.

Every command the app has is in the menu bar with its keyboard shortcut, in both languages: new
note, the daily note, save, print, reading view, the graph, zen, the two side panes, the
palette, search, publish, the shortcut sheet. The desktop app also claims a few shortcuts the
browser cannot:

| Keys | Does |
| --- | --- |
| `Ctrl/Cmd Shift N` | New window on this vault |
| `Ctrl/Cmd O` | Open vault… |
| `Ctrl/Cmd W` | Close window |
| `Ctrl/Cmd Shift F` | **Find in page** (below) |
| `Ctrl/Cmd Alt R` | Open the note as a reference window |
| `Ctrl/Cmd =` / `-` / `0`, and the numpad | Zoom in / out / actual size |
| `Ctrl/Cmd Y` | Redo, beside `Ctrl/Cmd Shift Z` |

## Your own name and icon

"Astrolabe" is one person's name for it. **Settings → This device → This app** lets you call the
app whatever you like on this computer and give it your own icon. The tray, its tooltip, the
window icon, the About box and the launcher entry all follow. The site's own name and logo are a
separate thing, on the **Site** tab (Settings → Site), and they title the window and the sidebar. **An update never
touches either**: the AppImage is replaced at its own path, so a file you renamed keeps its
name; the Windows installer replaces the program directory and nothing else; and your name and
icon live beside the app's settings, which no update writes.

*Add to the applications menu* (Linux) writes a desktop entry in your name, with your icon,
pointing at the AppImage wherever you keep it. *Add to the Start Menu* (Windows) creates a
shortcut the same way; a shortcut's icon must be an `.ico`, so choose one of those there. Run it
again after changing the name or the icon.

The full rebrand — the executable's own file name and the icon baked into it — is a build:

```
node scripts/rebrand.mjs --name "Marginalia" --icon ~/marginalia.png
npm --prefix desktop run dist
```

Every file in `desktop/release` then carries your name and icon. The update check still looks at
the releases page the build was made from (`RELEASES_PAGE` in `electron/update.ts`); point it at
your own if you publish your own releases.

## The reference window

**Window → Open as reference window** (`Ctrl/Cmd Alt R`) opens the current note in a second,
smaller window that stays **always on top**: the source you are quoting, the outline you are
following, the checklist — kept over the window you are writing in. *Always on top* is a switch
on any window. It is the clearest thing a desktop app can do that a browser tab cannot.

## Find in page

`Ctrl/Cmd F` finds and replaces *in the note's text*. `Ctrl/Cmd Shift F` on the desktop app
opens **Find in page**, the browser engine's own search over *whatever is on screen*: the
reading view, the outline, the backlinks, an embedded note, the tab strip, a settings panel —
exactly the half the editor's search cannot reach. The bar is drawn in Astrolabe's own style,
with *Find next* and *Find previous* in the Edit menu. (In the browser, that shortcut opens
[search and replace across the vault](editor.md#find-and-replace) instead.)

## Spelling

The red underlines come from your operating system's spellchecker. Right-click a misspelled
word (with nothing selected) for suggestions and **Add to dictionary**, drawn in the app's own
menu rather than a native popup, so it takes the theme and the text direction. *Check spelling
while typing* is in the Edit menu.

## Updates

**The app never downloads or installs an update on its own.** It only checks — quietly, at
launch and every six hours — whether a newer release exists. When one does, the status bar says
so: **3.x available**, in place of the version number that is normally printed at the end of
the bar. Nothing else happens until you act. A release is announced once per version per launch:
the chip stays until you act, but the toast does not come back when the six-hour check finds the
same release again. A check you ask for by hand always answers.

1. Click **3.x available** to download the release. While it downloads, the chip turns into a
   bar with the percentage.
2. When the download is on disk and verified, the chip reads **Restart to update**. Click it, and the
   app restarts into the new version.

**Help → Check for updates…** always works by hand, and says so when you are already on the
latest. If you would rather not be told at all, **Settings → This device → Software updates**
has two positions: *tell me* (the default) and *off*, which stops the automatic check entirely.
The menu item still works when the check is off.

What "restart" does depends on how the app was installed. The **AppImage** is replaced at its
own path and relaunched: the app closes, and a moment later the new file starts on its own.
(Every AppImage build is relaunch-tested before it is published.) The **Windows** install runs
the new installer silently, and the installer relaunches the app. Both downloads are checked
against the fingerprint published with the release before anything runs, so a file that arrived
incomplete or altered never starts. The **deb** and **pacman**
packages belong to a package manager, so there the chip opens the releases page instead. The
[Android app](mobile.md#updates) watches the same releases page in its own way, described on its
page.

In a browser, the version chip simply opens the releases page, since a hosted instance updates
when its server does.

## Deep links and file association

`astrolabe://note?path=Folder/Note.md` opens a note from outside the app, and the app registers
itself for `.md` files, so a note double-clicked in the file manager opens here. The path is
checked, not cleaned: `..`, a leading `/`, a drive letter or a control character is refused.

## Sessions

A vault the app opened itself is signed in by the app: a random password is made at launch and
no human ever sees it, so there is nothing to sign out of, and the status bar shows no **Sign out**.
A session that lapses anyway (a long sleep, a server restarted underneath) is restored on the
next request rather than asked for. The one exception is an [env-linked vault](#where-things-live) — a vault with a `.env` file
beside it, which runs under that deployment's own settings: there the window opens as a reader, and **Sign in**
takes the same password the site takes.

## Where things live

The app's own configuration is in `~/.config/astrolabe` (the old `vellum` directory from before
the rename is carried in on first launch and then removed). `desktop.json` there lists the
vaults, their ports and, for each, the data directory it uses. Each vault's instance data is in
the [`ASTROLABE_DATA`](configuration.md#environment-variables) that entry names. What is yours
rather than the machine's — the site's settings, the named layouts, the book shelf, your notes to
self — is also mirrored into the vault's own `.astrolabe/` folder, so a second machine over the
same vault finds it ([settings travel with the vault](backup-and-sync.md#settings-travel-with-the-vault)). The Linux build
is packaged with `asar: false` deliberately, because the server the app starts reads real files
from the package.

The [Read aloud](read-aloud.md) voices install into that same data directory (`tts/venv/` and `models/tts/`), from the Install button in Settings, exactly as on a server: the bundled server makes the Python environment with `uv` or the machine's Python 3.10–3.13 — and on the usual laptop, which has neither, **fetches a standalone Python** into `tts/python/` first (21–34 MB, checked before use) — and runs the engine on the processor as a child process. Nothing about the app's permissions changes for it — the page only plays sound.

**On Linux the app reads once the voices are installed.** Electron has no speech engine of its own on Linux, so there are no "device voices" to fall back on: before the Install, the player says *No voice on this device speaks …* and offers the Install button; after it, the app reads in every language its voices speak. **On Windows**, until the app's voices are installed, it reads with Windows' own voices — the one you chose in Windows' own speech settings (Time & language → Speech) — and names it, with a ▾ to choose another ([This device's voices](read-aloud.md#this-devices-voices)).
