# Offline reading

*The notes you opened are still there when the network is not.*

← [Back to the README](../README.md) · [All docs](README.md)

---

Astrolabe is one process on one machine and the browser is a window onto it. Offline reading is the window remembering what it last showed: a service worker keeps a copy of the app and of every note you read, and when the network is gone — a train, a flight, the server rebooting — the same address opens the same note from the copy on the device.

## What is kept

- **The app itself** — the shell and its built chunks, so the page opens at all without a server.
- **What you read** — each note you opened, the tree, its backlinks and the session, refreshed on every successful read. What is on the device is what you last read online, not a mirror of the vault: a note you never opened is not there.
- **Nothing else.** Search, PDFs, attachments, the graph, every write: these go to the server or nowhere. Offline, search answers empty and a PDF does not open.

The copy is per device and per browser, and it belongs to the session. It is kept only for an admin session with the switch on; signing out deletes it, and a visitor of a published site never gets one.

## Editing offline

The editor stays open. An edit made offline is kept in the tab and the save is retried until the network is back, exactly as it is when the server is briefly down — the status bar says *still trying* and your text is where you left it. Do not close the tab before the save lands; the copy on the device is what was **read**, not what was **written**.

## The strip

While the browser reports no network, a grey strip above the panes says **Offline** and reminds you that edits will be saved when it returns. It goes when the network does.

## Settings

**Settings → This device → Offline reading** turns the copy on or off for this device (on by default). **Clear offline copy** deletes it now — a shared machine, or a vault you would rather not leave behind. The row is absent in the desktop app: its server runs on the same machine, and there is nothing to be offline from.

## How it works

The worker is `sw.js` at the site root, served with `Cache-Control: no-cache` so a new build is noticed on the next visit. Its policy is `shared/offlinePolicy.ts`: the shell and the note reads are *network first, cache fallback*; built assets, whose names are content hashes, are *cache first*; everything else bypasses the worker. Each build keeps its own cache and deletes the previous one when it takes over. Service workers need HTTPS, or `localhost`; on a plain `http://` LAN address the switch has no effect and the site behaves as it always did.

## Related

- [Backup & sync](backup-and-sync.md) — a real second copy of the vault, which this is not
- [The desktop app](desktop.md) — the vault on your own machine, no network needed
