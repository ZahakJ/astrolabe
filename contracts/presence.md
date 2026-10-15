# Discord presence

What Astrolabe tells Discord while the owner works (3.42.0), how the pieces are cut, and what may never leave the process. Part of the module contracts (see [CONTRACTS.md](../CONTRACTS.md) for the map). The design was written before the code in [docs/plans/discord-presence.md](../docs/plans/discord-presence.md); the reader's page is [docs/presence.md](../docs/presence.md). **Edit the area, append nothing:** a change to how something works is written HERE, in the section it changes; a release gets one line in [releases.md](releases.md).

## One core, two hosts, one reporter

- **`shared/presence/` is the core and is PURE**: no `node:` import, importable by the client bundle, the server and the desktop main process alike. `types.ts` is the wire and the model, `config.ts` the application-id placeholder, the asset URLs and every timing, `frame.ts` the IPC framing, `reduce.ts` many reports → one `Activity`, `policy.ts` what may leave, `render.ts` + `copy.ts` the Discord `activity` object in English or Arabic with Western digits. A rule about what presence SAYS lives here and nowhere else, so the desktop and a self-hosted server can never disagree about it.
- **Three layers, three types, and the order is the privacy model.** A client posts a `PresenceReport` (a surface and a PATH); the host reduces every report into one `Activity` (still private: it carries the path); the POLICY turns that into a `PublicActivity`, the first value allowed out of the process; the RENDER turns that into a `DiscordActivity`. Nothing below `PublicActivity` holds a vault path, and the types are cut so that it cannot.
- **Two hosts, ONE sink.** `server/presence/host.ts` keeps the table of client reports, re-reduces every `PRESENCE_TICK_MS` and hands the rendered activity to exactly one sink: its parent process when there is one (the desktop app, which always runs where Discord runs), else its own IPC client when `settings.presence.server` is on, else nothing. A server child under the desktop never opens the socket, so an activity is never sent twice.
- **The desktop owns the socket.** `electron/presence.ts` keeps the latest activity per vault child, picks the most recent, drives ONE `DiscordIpcClient` for the whole app, and answers each child with `{type: "astrolabe:presence-status"}` so the Settings status row is honest inside the desktop too. The protocol client (`server/presence/discordIpc.ts`, written on `node:net` from the RPC topic and the reference client) is shared by both hosts; the desktop imports it from `server/`, which the package already carries.
- **No bridge channel.** Presence crosses no preload: the renderer talks to its own server over HTTP like every other feature, the server child talks to the main process over the existing `process.send` pipe. Nothing new is exposed to page script, which is the wall the desktop's bridge exists to keep.
- **The reporter is a lazy chunk** (`client/presence/report.ts`), mounted by `client/main.tsx` only while the store says `authReady && admin && presenceOn` (`presenceOn` mirrors `/api/me` `presence`, which the server sends to an admin only, and only when the mode is not off and an id is in force), and stopped when that turns false — a settings save that switches presence off refreshes `/api/me` and the reporter goes. A visitor's bundle carries the mount condition and nothing else.

## What a tab reports

- `deriveReport` (`client/presence/derive.ts`, pure) reads the FOCUSED pane through `surfaceOf`: `edit` → `writing` (or `reading` under reading mode), `reading` → `reading`, `book` → `book`, `drawing` → `drawing`, an Orbits SESSION → `orbits` with the deck's path and `cardsLeft`, `library`/`media` → `library`, everything else (the Orbits shelf included) → `browsing`. A follower pane reports the note it follows. The implicit deck (`*`) has no path. The table is docs/plans/discord-presence.md "Event sources per surface".
- **A report carries a path and never a title.** The server reads the title off the note and judges it; a title made on the client would be one the policy had not seen.
- `cardsLeft` comes from `client/presence/orbitsLeft.ts`, which `client/orbits/SessionView.tsx` sets when its queue moves and nulls on unmount — the queue stays in component state rather than the store, so a grade does not re-render every subscriber to tell Discord a number.
- **Idle is the server's decision, from the tab's evidence.** Each report carries `idleMs`, the time since the tab's last pointer, key, wheel, touch or focus; a hidden tab counts as idle from the moment it was hidden. The server keeps the most recently ACTIVE client (`receivedAt − idleMs`, so clocks need not agree) and drops one silent for `PRESENCE_STALE_MS`.
- **When a tab speaks.** A change of kind, path or count is sent once it has held for one second (a tab flick is one report); a heartbeat every `PRESENCE_HEARTBEAT_MS`; and at once when the tab is hidden or shown. The tab's id is minted once per tab in `sessionStorage` (`astrolabe:presence-client`, 16 of [A-Za-z0-9]). A 401/403/404 stops the reporter until it is mounted again; any other failure waits for the next heartbeat. Nothing is ever shown to the reader for a failed report.

## The policy is a contract

Applied on the server before anything leaves the process, whatever the client sent:

- `mode: "off"` → nothing is sent and no socket is opened. `activity` → the kind only. `title` → the kind and the subject's title.
- A title is frontmatter `title:` else the file's name without its extension; a title containing a path separator is cut to its last segment. **No vault path, folder name, note text, tag or link is ever in a `PublicActivity`.**
- A note with `presence: false`, or carrying any of `excludeTags`, keeps its title whatever the mode; its kind is still shown.
- Counts (`cardsLeft`) say nothing about the vault and are always allowed. The vault's NAME (a name, never a path) only with `vaultName`. The blog button only with `button`, a blog or designed layout and an https `SITE_URL`.
- Every string is cut to Discord's limits (128; a button label 32, its URL 512).
- `clientId` falls back to `DEFAULT_DISCORD_CLIENT_ID` in `shared/presence/config.ts`, the built-in application (a client id is public). The Settings field is an optional override under Advanced. While neither is a valid id, nothing connects and the status row says only that presence is off — no error.

## The rate, and leaving

- **One SET_ACTIVITY per `PRESENCE_RATE_MS` (15 s), and only on change**; when several changes land in one window the latest wins. An unchanged activity sends nothing, ever.
- No socket → silent. Reconnect backs off from `PRESENCE_BACKOFF_FIRST_MS` doubling to `PRESENCE_BACKOFF_CAP_MS`, reset after a handshake; at most one log line on the first failure. A CLOSE with code 4000 (invalid client id) stops the retries until the id changes, and the status says so.
- **Clear on exit.** Stopping (the desktop quitting, the server shutting down, presence switched off) sends a clearing SET_ACTIVITY and a CLOSE before ending the socket, so the owner's profile never keeps a stale "Writing" after the app is gone.

## The Settings page

`presence` is the nineteenth page, **Discord**, under App (`client/components/settings/PresenceTab.tsx`). Instance-only (`POCKET_HIDDEN_TABS`): a pocket vault has no server process beside a Discord. Every row is a vault setting and raises the Save bar. **This server runs beside Discord** is drawn on the desktop too — the index lists one page everywhere — but inert there, its hint saying the app owns the connection. The **Status** row reads `GET /api/presence` (the SAVED settings, never the form) every 5 s while the page is open, and names the first thing to fix in the order a reader fixes it: off · no id · no host · Discord not running · invalid id · connected, with the activity as shown.

## The images

`docs/brand/presence/` holds the mark and eight glyphs (pen, page, book, cards, brush, shelf, compass, moon) as SVG sources and 1024 × 1024 PNGs, rendered by `scripts/shoot-presence-assets.mjs` (one browser; the mark generated from `shared/brandMark.ts` on the app icon's plate; glyphs gold on a graphite DISC because Discord masks the small image to a circle; indexed PNGs over a graphite-to-gold palette, so each is ~10–20 kB). `assets: "site"` sends `${PRESENCE_ASSET_BASE}${name}.png` on the project's pages site; `assets: "uploaded"` sends the bare names, for PNGs uploaded to the portal under the same names. A renamed file is a broken image on every profile: the names are the contract in `PRESENCE_SMALL_ASSET`.

## What the tests hold

- `tests/presenceFrame.test.ts` — framing (little-endian header, partial chunks, several frames in one chunk, multibyte UTF-8), socket candidates per platform and environment, the handshake / set-activity / clear payloads.
- `tests/presenceCore.test.ts` — the reducer (most recently active wins, stale dropped, idle → clear or Idle, `subjectSince` kept while the subject stays), the policy (off → null, activity strips the title, opt-out and excluded tags strip it, a path never leaves, truncation) and the render (both languages, Western digits, assets per kind, timestamps per `elapsed`, the button only for an https blog, every string within Discord's limits).
- `tests/presenceIpc.test.ts` — the client against a fake Discord on a unix socket: handshake and READY, SET_ACTIVITY with pid and nonce, the 15-second coalescing on an injected clock, nothing for an unchanged activity, reconnect, clear + CLOSE on stop, CLOSE 4000 stops retrying, PING → PONG, silence when no socket exists.
- `tests/presenceRoutes.test.ts` — the two routes as admin and as a visitor (404), a bad body (400), titles withheld for `presence: false` and excluded tags, the sink receiving the rendered activity, `mode: off` sending nothing.
- `tests/presenceClient.test.ts` — the reporter's pure half: every surface of the table, the focused pane over `noteFocus`, a follower pane, the implicit deck, a count only in a session, no title in any report, idle for a hidden tab, what counts as a change, the tab id's alphabet, `orbitsLeft`'s change-only notifications, and the status row's sentences for every state in both languages (an Arabic line opens in Arabic so it reads right to left).
- `tests/settingsForm.test.ts` — the Discord page's patch: only what moved, a default sent back as null, the application id refused unless it is 17–20 digits, and the server taking the patch back as the form.
