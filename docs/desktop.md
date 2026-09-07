# The desktop app

*Astrolabe as a native application: the menu bar, vaults, windows, the reference window, find in page, updates and deep links.*

---

The [releases page](https://github.com/ZahakJ/astrolabe/releases/latest) carries an AppImage, a
`.deb`, a `.pacman` and an unsigned Windows `.exe`. Each one is the same product as the server
you can host yourself, wrapped as an Electron app that starts a server of its own for every vault
you open, on a port it remembers per vault. Nothing about the vault changes: the folder on disk
is the folder on disk, and a browser on the network can still reach the same vault through a
[hosted instance](publishing.md) at the same time. If you run both over one folder, see
[two servers, one vault](backup-and-sync.md#two-servers-one-vault).

## Vaults and windows

**File → Open vault…** (`Ctrl/Cmd O`) picks a folder; **Recent vaults** lists the ones you have
opened, and *Clear the list* forgets them. **New window** (`Ctrl/Cmd Shift N`) opens another
window on the current vault, which is how a [second window over one vault](workspace.md#several-windows-one-vault)
starts; **Close window** is `Ctrl/Cmd W`. *Show the vault in the file manager* opens the folder
itself. The app keeps a tray icon with *Show Astrolabe* and *Quit*.

Every command the app has is in the menu bar with its chord, in both languages: new note, the
daily note, save, print, reading view, the graph, zen, the two side panes, the palette, search,
publish, the shortcut sheet. The desktop app also claims a few chords the browser cannot:

| Keys | Does |
| --- | --- |
| `Ctrl/Cmd Shift N` | New window on this vault |
| `Ctrl/Cmd O` | Open vault… |
| `Ctrl/Cmd W` | Close window |
| `Ctrl/Cmd Shift F` | **Find in page** (below) |
| `Ctrl/Cmd Alt R` | Open the note as a reference window |
| `Ctrl/Cmd =` / `-` / `0`, and the numpad | Zoom in / out / actual size |
| `Ctrl/Cmd Y` | Redo, beside `Ctrl/Cmd Shift Z` |

## The reference window

**Window → Open as reference window** (`Ctrl/Cmd Alt R`) opens the current note in a second,
smaller window that stays **always on top**: the source you are quoting, the outline you are
following, the checklist, kept over the window you are writing in. *Always on top* is a switch on
any window. It is the clearest thing a desktop app can do that a browser tab cannot.

## Find in page

`Ctrl/Cmd F` finds and replaces *in the note's text*. `Ctrl/Cmd Shift F` on the desktop app
opens **Find in page**, Chromium's own search over *what is on screen*: the reading view, the
outline, the backlinks, a transclusion, the tab strip, a settings panel; exactly the half the
editor's search structurally cannot reach. The bar is drawn in Astrolabe's own tokens, with *Find
next* and *Find previous* in the Edit menu. (In the browser that chord opens
[search and replace across the vault](editor.md#find-and-replace) instead.)

## Spelling

Underlines come from the system's spellchecker; right-click a misspelled word (with nothing
selected) for suggestions and **Add to dictionary**, drawn in the app's own menu rather than a
native popup, so it takes the theme and the direction. *Check spelling while typing* is in the
Edit menu.

## Updates

The app checks the releases page at launch and every six hours, and downloads a new release **in
the background**; when it is ready a toast offers **Restart now**, never a dialog. **Help → Check
for updates…** asks at once, and says so when you are on the latest.

The build you are on is printed at the end of the status bar; on the desktop app that chip *is*
the update check (click it and the updater answers with its toast), and in a browser it opens
the releases page.

What "restart" does depends on how the app was installed. The **AppImage** is swapped in place
and relaunched. The **Windows** install runs the new installer silently and the installer
relaunches the app. Both downloads are checked against the release's own checksum file before
anything runs. The **deb** and **pacman** packages belong to a package manager, so there the toast
opens the release page instead. The **Android app** (the APK on the same release page) checks
the same endpoint at launch: when a newer APK exists it offers **Update**, the browser downloads
it, and Android installs it over the current copy, notes, settings and sign-in untouched. *Later*
snoozes the offer for a day. Everything web-side reaches the phone the moment the server deploys;
the APK only changes when the shell itself does.

## Deep links and file association

`astrolabe://note?path=Folder/Note.md` opens a note from outside the app, and the app registers for
`.md` files so a note double-clicked in the file manager opens here. The path is checked, not
cleaned: `..`, a leading `/`, a drive letter or a control character is refused.

## Sessions

A vault the app opened itself is signed in by the app: the password is minted at launch and no
human ever sees it, so there is nothing to sign out of and the status bar shows no **Sign out**.
A session that lapses anyway (a long sleep, a server restarted underneath) is restored on the
next request rather than asked for. The one exception is an [env-linked vault](#where-things-live),
which runs under its deployment's own `.env`: there the window opens as a reader and **Sign in**
takes the same password the site takes.

## Where things live

The app's own configuration is in `~/.config/astrolabe` (`desktop.json`: the vaults, their ports
and, for each, the data directory it uses), and each vault's instance data in the
[`ASTROLABE_DATA`](configuration.md#environment-variables) that entry names. The Linux build is
packaged with `asar: false` deliberately, because the server child reads real files from the
package.
