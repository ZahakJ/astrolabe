# Offline reading

*The notes you have already opened stay readable when the network is gone.*

← [Back to the README](../README.md) · [All docs](README.md)

---

Astrolabe is one program running on one machine, and your browser is a window onto it. Normally every note you open is fetched from that machine. Offline reading means the window remembers what it last showed you. A small helper inside the browser, called a **service worker**, keeps a copy of the app and of every note you read. When the network disappears (on a train, on a flight, while the server reboots), the same address still opens the same note, from the copy on your device.

## What is kept

- **The app itself.** The page and the code it runs on, so the app can open at all when there is no server to talk to.
- **What you read.** Every note you opened, plus the note tree, the note's backlinks and your session. The copy is refreshed each time a note loads successfully. It is a copy of what you last read while online, not a mirror of the whole vault: a note you never opened is not on the device.
- **Nothing else.** Search, PDFs, attachments, the graph, and anything you save all need the server. Offline, a search returns nothing and a PDF does not open.

The copy belongs to one device, one browser and one signed-in session. It is kept only while you are signed in as the admin with the switch on. Signing out deletes it, and a visitor to a published site never gets a copy at all.

## Editing offline

The editor does not lock. If you edit a note while offline, the change stays in the tab and the app keeps trying to save it until the network comes back, exactly as it does when the server is down for a moment. The status bar says *still trying* and your text stays where you left it. Do not close the tab before the save goes through: the copy on the device is what you **read**, not what you **wrote**.

## The strip

While the browser reports that it has no network, a grey strip appears above the panes. It says **Offline** and reminds you that your edits will be saved when the network returns. It disappears as soon as the network does.

## Settings

**Settings → This device → Offline reading** turns the copy on or off for this device. It is on by default. **Clear offline copy** deletes the copy right now, which is useful on a shared machine, or for a vault you would rather not leave behind. The desktop app has no such row: its server runs on the same machine as the app, so there is nothing to be offline from.

## How it works

The service worker is the file `sw.js` at the root of the site. It is served with `Cache-Control: no-cache`, so the browser notices a new build on the next visit. The rules it follows live in `shared/offlinePolicy.ts`. The page and the note reads are *network first, cache second*: the worker tries the server, and falls back to the copy. The built code files, whose names contain a fingerprint of their contents, are *cache first*: once fetched they never change. Everything else goes straight to the server. Each build keeps its own cache and deletes the previous build's cache when it takes over. Browsers only allow service workers over HTTPS or on `localhost`; on a plain `http://` address on a local network the switch does nothing, and the site behaves as it always did.

## Related

- [Backup & sync](backup-and-sync.md) — a real second copy of the vault, which this is not
- [The desktop app](desktop.md) — the vault on your own machine, no network needed
