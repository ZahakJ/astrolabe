# Discord Rich Presence — the plan (3.42.0)

*Written before the code. What Astrolabe tells Discord while you work, how the pieces are cut, what
leaves the machine and what never does, the protocol as verified, the tests, and the release steps.*

## What it is

Discord shows, under your name, what you are doing in Astrolabe: **Writing · Chapter 3**, **Reading a
book**, **Reviewing cards · 12 left**, **Drawing**, **In the library**. Off until you switch it on, and
you choose how much it says. Nothing about the vault leaves the machine except the words you chose to
show, and they go to Discord's own local socket, never to a server of ours.

## Architecture — one core, two hosts, one reporter

```
 client (every open tab, admin only)          server (the vault's process)                 sink
 ─────────────────────────────────            ────────────────────────────────            ───────────────────────
 client/presence/report.ts                    server/presenceRoutes.ts   POST /api/presence
   store → PresenceReport ──POST (≤1/min,──▶  server/presence/host.ts                      a) desktop child:
   on change)                                   reduce (shared) → policy (shared)             process.send → electron/presence.ts
                                                → render (shared) → DiscordActivity            → DiscordIpcClient (main process)
                                                                                           b) self-hosted beside Discord
                                                                                              (settings.presence.server):
                                                                                              server/presence/discordIpc.ts
```

- **`shared/presence/`** is the core and is PURE (no `node:` imports, importable by the client bundle
  if ever needed): `types.ts` (the wire and model shapes), `config.ts` (the application id placeholder,
  the asset URLs, the three timing constants), `frame.ts` (framing, opcodes, payloads, socket path
  candidates), `reduce.ts` (many client reports → one `Activity`, idle, "most recently active wins"),
  `policy.ts` (the privacy policy — what may leave), `render.ts` + `copy.ts` (an allowed activity →
  Discord's `activity` object, in English or Arabic, Western digits).
- **`server/presence/discordIpc.ts`** is the protocol client, written from scratch on `node:net`:
  discovery, handshake, SET_ACTIVITY with coalescing (one send per 15 s, only on change), PING/PONG,
  CLOSE, reconnect with backoff, clear-on-exit, silent when Discord is absent. Shared by the two
  hosts (the desktop imports it from `server/`, which electron-builder already packages).
- **`server/presence/host.ts`** owns the table of client reports, runs the reducer every few seconds
  and hands the rendered activity to ONE sink: the parent process when there is one (the desktop
  app, which always runs where Discord runs), else the local client when `settings.presence.server`
  is on. The activity is never sent twice: a server child under the desktop never opens the socket.
- **`electron/presence.ts`** receives `{type:"astrolabe:presence"}` from each vault's child, keeps
  the latest per vault, picks the most recent, drives one `DiscordIpcClient` for the whole app, and
  clears on quit. It answers the children with `{type:"astrolabe:presence-status"}` so the Settings
  status row is honest inside the desktop too. No new preload bridge channel: nothing crosses the
  renderer wall.
- **`client/presence/report.ts`** is a LAZY chunk loaded for admin sessions only (the entry budget is
  not spent on it). It derives a report from the store — the focused pane's surface, the active tab,
  reading mode, the Orbits session's remaining count — and POSTs it when it changes, plus a heartbeat
  every 60 s carrying `idleMs` (ms since the last pointer/key/visibility input in that tab). A per-tab
  id in `sessionStorage` is the client key.

## Event sources per surface

| Surface (client/workspace.ts `surfaceOf`) | Kind | Subject |
| --- | --- | --- |
| `edit` with reading mode off | `writing` | the note (path) |
| `edit` with reading mode on, `reading` | `reading` | the note |
| `book` (PDF / EPUB) | `book` | the book (path) |
| `orbits` session | `orbits` | the deck note (path) + `cardsLeft` from `CardQueue` |
| `drawing` | `drawing` | the drawing (path) |
| `library`, `media` | `library` | — |
| `graph`, `sigils`, `calendar`, `today`, `timeline`, `feeds`, `review-week`, `empty`, the designer | `browsing` | — |
| no input for `idleMinutes` on every client | `idle` | — |

The phone shell reads the same store, so a phone tab reports too; the server keeps the most recently
ACTIVE client (by `receivedAt − idleMs`) and drops any client silent for 150 s.

## Privacy policy — applied on the server, before anything leaves the process

| Setting (`settings.presence`) | Values | Default | Effect |
| --- | --- | --- | --- |
| `mode` | `off` · `activity` · `title` | `off` | off: nothing is sent and no socket is opened; activity: the kind only ("Writing"); title: the kind and the subject's title |
| per-note `presence: false` (frontmatter) | — | — | the note's title is never shown; the kind still is |
| notes carrying any `excludeTags` tag | — | — | same as above |
| vault paths | — | — | NEVER shown: the subject is a title (frontmatter `title:` else the file's name without extension), and a title containing a path separator is cut to its last segment |
| `clientId` | 17–20 digits | the placeholder in `shared/presence/config.ts` | the Discord application id; with the placeholder nothing connects and the status row says so |
| `idleMinutes` | 1–120 | 10 | after this long with no input anywhere, the presence is cleared or shows Idle |
| `idle` | `clear` · `show` | `clear` | what idle does |
| `vaultName` | boolean | false | the vault folder's name (a name, not a path) as the large image's tooltip / the second line when no title |
| `elapsed` | `off` · `subject` · `session` | `subject` | the timer: none, since the subject changed, since the host started |
| `button` | boolean | false | a Discord button "Read the blog" to `SITE_URL`, only when the layout is blog/designed and the URL is https |
| `server` | boolean | false | this server process connects to Discord itself (self-hosters with Discord on the same machine); ignored under the desktop app, which owns presence |
| `assets` | `site` · `uploaded` | `site` | image URLs on the project's GitHub Pages site, or asset keys uploaded in the portal |

Counts (cards left) carry nothing about the vault and are always allowed. Strings are cut at 128
characters. Discord's own name for the activity is the application's name, which is set in the Discord
developer portal.

## The Discord card

```
 ┌──────┐  Astrolabe                        ← the application's name (portal)
 │ mark │  details: Writing                 ← the kind, localized (shared/presence/copy.ts)
 │   ◉  │  state:   Chapter 3               ← title (mode=title) · else "12 cards left" · else vault name
 └──────┘  00:12:34 elapsed                 ← timestamps.start per `elapsed`
           [ Read the blog ]                ← buttons[0] per `button`
```
`assets.large_image` = the Astrolabe mark; `assets.small_image` = a glyph per kind (pen, page, book,
cards, brush, shelf, compass, moon); `small_text` = the kind; `large_text` = the vault name when on.
`type` = 0 (Playing). Hosted under `https://zahakj.github.io/astrolabe/brand/presence/<name>.png`
(docs/ is the pages site); the same 1024×1024 PNGs sit in `docs/brand/presence/` for a portal upload.

## Protocol notes (verified 2026-10-11)

Sources: the RPC topic (docs.discord.com/developers/topics/rpc — transport, opcodes, handshake,
READY, SET_ACTIVITY `{pid, activity}`, `activity.type` ∈ {0,2,3,5}, ERROR `evt` with `data.code`),
the gateway Activity object (docs.discord.com/developers/events/gateway-events — `details`, `state`,
`timestamps.start/end` ms, `assets.large_image/large_text/small_image/small_text`, external image URLs
accepted as asset values, `buttons` max 2 with `label` 1–32 and `url` 1–512), the reverse-engineered
IPC notes (github.com/foxt/easy-presence ipc.md) and the official `discord-rpc` reference client
(rate limit: one SET_ACTIVITY per 15 s; clearing = SET_ACTIVITY with no `activity`).

- **Socket**: `discord-ipc-{0..9}` under, in order, `$XDG_RUNTIME_DIR`, `$TMPDIR`, `$TMP`, `$TEMP`,
  `/tmp`; for each prefix also `app/com.discordapp.Discord/`, `app/com.discordapp.DiscordCanary/`
  (Flatpak) and `snap.discord/` (Snap). Windows: `\\?\pipe\discord-ipc-{n}`. Try 0..9, keep the
  first that completes a handshake.
- **Frame**: `u32 LE opcode`, `u32 LE length`, then `length` bytes of UTF-8 JSON. Header and body in
  ONE write. Opcodes: 0 HANDSHAKE, 1 FRAME, 2 CLOSE, 3 PING, 4 PONG.
- **Handshake**: op 0, `{"v":1,"client_id":"<digits>"}`. Reply: op 1, `{"cmd":"DISPATCH","evt":"READY",…}`.
  A bad id: op 2 CLOSE with `{"code":4000,"message":"Invalid Client ID"}` — stop retrying until the
  id changes.
- **SET_ACTIVITY**: op 1, `{"cmd":"SET_ACTIVITY","args":{"pid":<int>,"activity":{…}},"nonce":"<uuid>"}`;
  Discord echoes `{"cmd":"SET_ACTIVITY","data":{…},"evt":null,"nonce":"…"}` or `evt:"ERROR"`.
  Clear: the same command with `args:{pid}` and no `activity`.
- **PING** (op 3) → answer op 4 with the same body. **CLOSE** (op 2) from Discord ends the session;
  we send op 2 `{}` before ending the socket on our own stop.
- **Rate**: at most one SET_ACTIVITY per 15 s, and only when the rendered activity changed; the
  latest wins when several changes land inside a window.
- **Reconnect**: backoff 5 s → 10 → 20 → 40 → 80 → 160 → 300 s cap while no socket answers;
  reset to 5 s after a successful handshake. Silent: one line on first failure at most.

## Settings page

A nineteenth page, **Discord** (`presence`), under **App**: Mode (segmented) · Application id (text)
· Idle after (select) · When idle (segmented) · Vault name (toggle) · Elapsed time (segmented) · Blog
button (toggle) · This server runs beside Discord (toggle) · Status (status); Advanced: Image source
(segmented). Instance-only (a pocket vault has no server to speak to Discord). All rows are vault
settings and raise the Save bar; the status row polls `GET /api/presence` while the page is open.

## Tests

- `tests/presenceFrame.test.ts` — framing (LE header, partial chunks, several frames in one chunk, a
  payload with multibyte UTF-8), socket candidates per platform and env, handshake / set-activity /
  clear payload shapes.
- `tests/presenceCore.test.ts` — reducer (most recently active wins, stale dropped, idle after N
  minutes → clear or Idle, `subjectSince` kept while the subject stays, `sessionSince` fixed), policy
  (off → null, activity strips the title, opt-out and excluded strip it, a path never leaves,
  truncation), render (EN and AR copy, Western digits, assets per kind, timestamps per `elapsed`,
  the button only with https blog URL, every string within Discord's limits).
- `tests/presenceIpc.test.ts` — the client against a FAKE Discord IPC server on a unix socket in a
  temp dir: handshake received and READY answered, SET_ACTIVITY with pid and nonce echoed, the
  15 s coalescing (an injectable clock), an unchanged activity sends nothing, reconnect after the
  server goes away and comes back, clear + CLOSE on stop, CLOSE 4000 stops the retries, PING → PONG,
  and total silence (no throw, state `searching`) when no socket exists.
- `tests/presenceRoutes.test.ts` — `POST /api/presence` as admin, 404 as a visitor, 400 on a bad body,
  `GET /api/presence`, a note with `presence: false` and a note with an excluded tag lose their
  titles, the sink receives the rendered activity, `mode: off` sends nothing.
- `tests/settings.test.ts` — the `presence` key: every field validated, null deletes, defaults absent.
- `tests/desktop.test.ts` — `electron/presence.ts`'s pure half: the message guard, most recent wins
  across vaults, the status message.
- The existing gates: typecheck · check-i18n · test · build + check-bundle · check-a11y ·
  check-contrast · gen-settings-index + check-settings · check-names · check-shell-seam · check-docs ·
  build-docs · check-desktop · check-whatsnew · check-cascade; browser: check-deck (the new slide),
  check-fidelity and check-phone (the settings walk over the new page) as the machine allows.

## Release steps (the 3.40.0 flow, followed exactly)

1. Gates green. 2. Version 3.42.0 in `package.json`, `mobile/package.json`,
`mobile/android/app/build.gradle` (versionCode 34200), `client/whatsnew/versions.ts`, a deck in
`releaseNotes.ts`. 3. One line in `contracts/releases.md`; `contracts/presence.md` added to the map.
4. `npm run build-docs`, commit, push `main`. 5. `scratchpad/build-release-3.42.0.sh` (clean export,
vite, AppImage/deb/pacman, Windows exe, APK, SHA256SUMS), `check-desktop-boot.sh` and
`check-desktop-relaunch.sh` on the AppImage, `gh release create v3.42.0 --target main`, uploads,
sizes compared. 6. Production (`~/Documents/side/astrolabe-prod`, `vellum.service` on `::1:8080`):
fetch, ff-merge, `npm i`, `npm run build`, restart, `curl` the local port and the public host; roll
back on a failure.
