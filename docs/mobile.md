# The Android app

*Two doors from a phone — your own server, or a private repository on GitHub — the share sheet that captures into the vault, updates, and what it deliberately does not do.*

← [Back to the README](../README.md) · [All docs](README.md)

---

Astrolabe for Android is an APK on the [releases page](https://github.com/ZahakJ/astrolabe/releases/latest). It is a door onto the vault you already keep — the one your own server serves, or the one that lives in a private GitHub repository. The app has two screens of its own, a connection screen and a capture sheet, and after the first of those it hands the whole display to the reading room, full screen. Everything you know about Astrolabe on a laptop is the same here, because it *is* the same: the web client already handles a thumb-sized target, a sidebar that is a [drawer](workspace.md#on-a-phone), and Arabic from the right, and the app ships none of that twice.

## What it is

The app opens one of two doors, and you choose which on its first screen.

**Your own server.** The phone holds no vault, no repository and no working copy. It reads and writes through the same HTTP API the web client uses, over the same session cookie, so every question about what happens when two places edit one note has the answer the server always gives — a save that would overwrite a version you never saw is refused, not merged, exactly as it is in a browser ([when the file changed under you](workspace.md#when-the-file-changed-under-you)). [Backup & sync](backup-and-sync.md) is the server's job and stays there. This is the door the app was built for and still the one to use if you run an instance; a shell's one job is to open only the address you gave it, and every other link in your notes goes to the phone's browser.

**A private repository on GitHub**, for a person who runs no server at all. The vault is copied into the app's own storage, read and written there, and pushed back — the section below is about that. It carries a real copy of your notes with git under it, which the first version of this app deliberately refused to do; what changed is the company that copy keeps. The refusal was about a phone clone living beside a **live server** writing the same vault, where a week-old copy waking up in a pocket is a merge conflict inside somebody's prose, resolved by a phone. A GitHub vault has no live server: the only other writer is your own laptop, through git, which is the arrangement everybody who keeps notes in a repository already lives with. Running the server itself on a phone is still refused, and on a fact rather than a preference — Astrolabe needs a current Node and phones do not have one.

## Connecting

1. Open the app and type your server's address — `notes.example.com`, or `192.168.1.24:6801`. A bare name is taken to be `https`; an address on your own network (`10.x`, `192.168.x`, `172.16–31.x`, `*.local`, `*.lan`, `localhost`) is taken to be `http`. Typing the scheme yourself always wins.
2. The app checks the address before it goes anywhere, so a typo is a sentence on this screen rather than a blank page.
3. It remembers what worked. The next launch reconnects without a tap; the back gesture from your instance's first page brings you here to choose another server, and back from here leaves the app.
4. Sign in on your instance's own login screen, once. The session persists — your server gives it a sliding life of seven days, so a writer who opens the app most days never meets the login screen again.

Your notes, your theme, your language and everything else are the instance's; the app changes nothing about them. The system bars (the status bar at the top, the gesture bar at the bottom) are kept off the page by the app itself, and the keyboard resizes the page rather than covering it.

## A vault from GitHub

Choose **or open a vault from GitHub** on the first screen. The app shows a short code; you type it into `github.com/login/device` in any browser — the phone's own, or the laptop you are already signed in on — and approve it there. Nothing asks you for your GitHub password, and the app keeps no secret of its own: this is GitHub's *device flow*, the one designed for a device that cannot safely hold one. It asks for a single permission, **read and write your repositories**, which is the narrowest scope that can reach a private one. You can withdraw it at any time from your GitHub account's applications page.

Then pick the repository your notes are in, and a branch. The app copies it into its own private storage — the newest commit only, not the whole history, because a vault with five years behind it is a minute of network you did not ask for — and opens the reading room on it. It is the same web client you use on a laptop: the editor, wikilinks, the graph, search, tags, properties, [Orbits](orbits.md), [Sigils](sigils.md#the-sigils-page), trackers, the calendar. Everything is on the device, so it opens and searches with no network at all.

### What travels, and when

Opening the app pulls; coming back to it pulls again. Every save is one commit, named after the note. Pushing is held for half a minute, so a paragraph typed in nine saves leaves as one push — and it goes at once when you put the phone down. A small line at the bottom of the screen says which of those is true right now: *3 changes to send*, *Offline. Your changes are safe on this phone.*, *Synced 2 minutes ago.* It never says you are synced while anything is waiting. Tap it to send immediately.

### When both sides changed one note

**The phone never merges your prose.** If a note changed here and on your laptop, the version from the repository keeps its name and the phone's version is set down beside it as `<Note> (phone).md`. Both are committed and both are pushed, so the pair is on every machine. The line at the bottom says how many pairs are standing, and it keeps saying it after the app is closed and opened again — until you have read the two and deleted the one you do not want. Nothing is ever merged, and nothing is ever thrown away.

### What a GitHub vault does not do

It has no public half, so it cannot publish, and it has no blog, no visitors, no [marginalia](publishing.md), no site designer and no [clipper](capture.md#the-clipper) token. It has no data directory on a disk, so uploaded fonts and PDF annotations are not there. It has no second instance to sync with, because it *is* the sync. Each of those says so when you reach it, in a sentence naming what is missing, rather than failing quietly. A note's past comes from the repository — the commits made since the copy was taken, which is where this copy's history begins.

Your notes go nowhere but your own repository. The app has no server of its own and no account with anybody.

### Registering the app, if you build it yourself

A build from the repository needs a GitHub OAuth App of your own, because the one in a release is not yours to borrow. Make one on github.com, under your account's **Developer settings → OAuth Apps → New OAuth App**, turn **Enable Device Flow** on, and put its Client ID in `mobile/.env` as `ASTROLABE_GITHUB_CLIENT_ID` before building. There is no client secret; the device flow does not use one. A build without an id still runs — the GitHub door says what is missing instead of failing at the first request.

## The share sheet

Share a link, a paragraph or a sentence from any app and choose **Capture to Astrolabe**. The sheet appends it as a timestamped bullet to today's inbox note, `Inbox/YYYY-MM-DD.md`, creating the note and the folder if this is the day's first capture. The write carries the note's modification time as a precondition, the same way the editor's saves do; if the note moved underneath (you were editing it on the laptop), the sheet re-reads and appends again, once. An append is the rare write where that is safe: what is being added was not in the file either time.

The sheet runs in its own task, so a capture never costs you your place in the app: share, see the confirmation, and you are back where you were.

This is the app's own sheet. The **installed website** — the site added to the home screen from the phone's browser, described under [Capture](capture.md#from-a-phone) — has a share target of its own that files a shared page under `Clips/` and a shared sentence under `## Captured` in today's daily note. Both roads lead into the vault; the app's is the one that works before the site is signed in anywhere, and the site's is the one that clips a page.

## The installed site, and the app

You do not need the APK to have Astrolabe on a phone. The site is installable from the browser (**Add to Home Screen**), and the installed site opens full screen, carries the site's name and the colours of its default theme, keeps the notes you have read for [offline reading](offline.md), and appears in the phone's share sheet. The app adds three things over that: a connection screen that remembers your server and checks it before opening, a capture that needs no browser and no open page, and a back gesture that behaves like an app's rather than a browser's.

Inside either, the [quick-capture sheet](capture.md#quick-capture) is the first row under the **⋯** in the top bar, and the [Sigils](sigils.md#the-sigils-page) page, [Orbits](orbits.md), the graph and the rest of the tools are rows under the same menu.

## Updates

The phone learns about a new APK the way the desktop learns about a new AppImage: one request to the releases page, once per launch, on a background thread. A sideloaded app cannot update itself — the phone's package installer is the only thing allowed to replace it — so the most the app can honestly do is say that a release exists and hand the APK to the browser, which downloads it and offers **Install**. The new copy is signed with the same key, so Android treats it as the update it is: notes, settings and sign-in are untouched.

Quiet by design: nothing is shown when the app is current, and a release you dismissed with *Later* is not mentioned again for a day. Everything on the web side reaches the phone the moment the server updates; the APK only changes when the wrapper itself does, which is rare.

## What it does not do

No camera, no location, no contacts, no storage, no analytics, no push notifications. Its manifest asks for network access and nothing else. Pointed at your own server it has no offline mode of its own: the page it shows keeps the web app's [offline copy](offline.md) the way a browser does, and when there is no copy and no server it says so and stops. A vault from GitHub is the other case entirely — it *is* the copy, and it opens with no network at all.

## Installing it

The APK is not on any store; install it yourself. Copy the `.apk` to the phone (a file-sync app, a cable) and open it in the phone's file manager. Android asks permission to install unknown apps *for that file manager*; grant it, install, and revoke it afterwards if you like. Installing a newer APK over an older one keeps its data, as long as both were signed with the same key — which every release is. A build you made yourself from the repository is signed with a key of its own and cannot replace a release, or be replaced by one; uninstall first.

The app permits plain `http` and trusts the phone's own certificate store, because a self-hosted vault at `http://192.168.1.24:6801` or behind a private certificate authority is the case it exists for — and it only ever talks to the one host you named.

## Related

- [Capture](capture.md) — the quick-capture sheet, the clipper, and the installed site's share target
- [The desktop app](desktop.md) — the same product on a computer, with its own update policy
- [Offline reading](offline.md) — what the page keeps on the device
- [Panes, tabs & windows](workspace.md#on-a-phone) — what the interface does on a phone
