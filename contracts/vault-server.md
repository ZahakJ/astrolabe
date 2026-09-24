# The vault and the server

The server: its API, its modules, sessions, and everything that writes, moves, deletes, searches or rewrites the vault on disk. Part of the module contracts (see [CONTRACTS.md](../CONTRACTS.md) for the map). **Edit the area, append nothing:** a change to how something works is written HERE, in the section it changes, and the old sentence goes; a release gets one line in [releases.md](releases.md), never an addendum.

## API (all JSON; errors -> `{ error: string, code?: string }` with 4xx/5xx)

`error` is English prose written for a log and for `curl`. It is NOT a string any UI may print —
and it was being printed: `client/api.ts` wraps every failure body in an `ApiError` carrying that
text, and every `catch` in the app toasts `err.message`, so an Arabic-only operator rejecting a
mistyped font file read "Not a recognized font file (woff2, woff, ttf, otf)" inside a fully
Arabic panel while the `fontUploadFailed` translation written for the moment was dead code.
`VaultError(status, message, code?)` may name a STABLE code; `onError` echoes it, `ApiError`
carries it, and a caller that can translate the code must prefer it and keep the generic
localized line — never `err.message` — as the fallback. Falling back to the prose was considered
and rejected: it is English by construction, so showing it is the bug. The font routes are the
first users (`font_unrecognized`, `font_damaged`, `font_too_large`, `font_no_file`,
`font_bad_body`, `font_not_found`, `font_bad_name`, `font_no_free_name`, `font_in_use` →
`FONT_ERROR_KEYS` in `SettingsModal.tsx`), because the commonest failure of that feature is one
an Arabic-only owner hits constantly. The rest of the app's 12 call sites still print `message`;
that is the pre-existing pattern, and the door is now open.

- `GET  /api/tree` → `TreeNode` (root folder node, path ""). Admin: notes **and** attachments (see "Attachments in the tree"). Visitor: the flat published-note list, notes only.
- `GET  /api/note?path=a/b.md` → `NoteData`
- `GET  /api/note/state?path=&path=…` → `{ states: NoteState[] }` — the mtime of each named note
  and nothing else (`mtimeMs: null` = not there, which is also what a visitor-scoped session is
  told about a note it may not know exists). Max 64 paths, because the caller is a client's OPEN
  TABS and not its vault; more is a 400 and `/api/tree` is the route for "everything". This is
  the wake-up probe — see "Revalidate on wake" under "The open document".
- `PUT  /api/note?path=` body `{ content: string, baseMtimeMs?: number }` → `NoteWriteResult`
  (`NoteData` plus an optional `headingRepair` — see "Bulk rewrites") (writes
  file; creates parent dirs). `baseMtimeMs` is the OPTIONAL write precondition: given, and the
  file's current mtime differs, the write is refused **409 `{ error, code: "stale" }`** and
  nothing is touched. Omitted (older clients, `curl`, scripts) → last-writer-wins, unchanged. See
  "The write precondition".
- `POST /api/note` body `{ path: string }` → `NoteData` (create empty; 409 if exists)
- `GET  /api/seed` → `{ available: boolean, guide: string }` (admin-only, 404 to a visitor; `available` is true only when `vault-seed/` exists AND the vault holds no markdown)
- `POST /api/seed` → `{ guide: string }` — copy the starter notes in, 409 `code: "seedNotEmpty"` if the vault filled up in between. **Boot seeds only a vault directory that DID NOT EXIST**; an existing-but-empty directory is the reader's and is offered the seed from the empty state instead of being written into unasked (server/seed.ts).
- `POST /api/capture` body `{ text, path?, time? }` → `{ ok: true, path }` (admin-only) — append `- HH:MM text` under `## Captured` in `path` (today's daily note when absent, by the instance's folder and format), creating the note bare when it is not there. See "Capture" (3.17.0).
- `POST /api/clip` body JSON `{ url?, title?, html?, selection?, text?, token? }` or a FORM (the share target) → `{ kind: "clipped" | "captured", path }`, or a 303 to the note for a form (a form the caller may not send gets a 401 HTML page in the site's language, not JSON — it is a phone's share sheet looking at it). **Above the auth guard**: answers to an admin session OR the clip token (`token` field / `Authorization: Bearer`); CORS `*` on its answers; 40 wrong tokens per address per quarter hour → 429. With an address, a note under `Clips/`; without, a line under `## Captured` today. Every write the clipper and `/api/capture` make is serialised through one in-process queue: a burst of captures into one note lands every line, and a burst of clips of one title lands as many notes.
- `GET  /api/clip/token` → `{ token }` (admin-only; made on first ask) · `POST /api/clip/token/rotate` → `{ token }` (the old one stops working at once).
- `POST /webmention` (NOT under /api; open while **Accept webmentions** is on, else 404) form `source`, `target` → 202 queued · 400 with the reason · 429 (20/min/IP, 500 waiting). `GET /.well-known/webfinger`, `GET /.well-known/nodeinfo`, `GET /nodeinfo/2.1`, `GET /actor`, `/actor/outbox[?page=n]`, `/actor/followers`, `/actor/following` and `POST /actor/inbox` (signed; 256 KB, 120/min/IP) answer only while **Fediverse** is on, and any public page answers an ActivityPub `Accept` with its object. Mounted from `index.ts` (`webmentionPublic`, `activitypubPublic`). See public-site.md "Webmentions and the fediverse".
- `GET  /api/webmentions?path=` → `CommentData[]` — what other sites said about a published note (visitors: approved ones, federable notes only; `[]` when there is nothing, 404 only for an unpublished note). `GET /api/webmentions/status` (admin) → `FederationStatus` (the Sent list, the address, the follower count). `POST /api/webmentions/:id/verify` (admin) → `{ outcome }`. `/api/comments/all`, `PATCH` and `DELETE /api/comments/:id` gate on `moderationEnabled()` (comments on, or webmentions accepted, or the fediverse on), since moderation covers all three.
- `GET  /manifest.webmanifest` (NOT under /api; open) → the web app manifest, generated from settings: name, `theme_color`/`background_color` from the default theme's swatch, the configured favicon plus `/manifest-icon.svg`, and the `share_target` that POSTs `title`/`text`/`url` as a form to `/api/clip`.
- `POST /api/rename` body `{ path, toPath }` → `{ ok: true }` (also rewrites `[[wikilinks]]` in other notes that pointed at the old name)
- `POST /api/alias` body `{ path, alias }` → `{ ok: true, path, alias }` (admin-only; merges one name into the note's `aliases:`, preserving every other byte — the write behind "keep the old title" after a rename)
- `DELETE /api/note?path=&permanent=<bool>` → `{ ok: true, trashPath?: string }` (default MOVES to `.trash/`; see "Note deletion")
- `DELETE /api/attachment?path=&permanent=<bool>` → `{ ok: true, trashPath?: string }` (non-`.md` only; same two speeds — see "Attachment deletion")
- `GET  /api/delete-preview?path=` → `DeletePreview` (admin-only; what a delete would actually take — see "Delete previews")
- `GET  /api/tags/rename-preview?from=&to=` → `TagRenamePreview` (admin-only, 404 to a visitor) — the DRY RUN: how many notes actually change, how many substitutions, whether the destination already exists (`merge: true`), and where the tag's own page would land. See "Bulk rewrites".
- `POST /api/tags/rename` body `{ from, to }` → `TagRenameResult` (admin-only) — rename a tag and everything nested under it across every note that carries it, inline `#tags` and frontmatter `tags:` alike, byte-surgically. Renaming onto an existing tag MERGES. Re-keys `settings.tagLabels` exactly as a folder move re-keys `folderIcons`, and moves the tag's page (its path IS the tag).
- `POST /api/links/heading-repair` body `{ path, from, fromTitle, to }` → `BulkResult` (admin-only) — point every `[[Note#from]]` in the vault at the heading's new name. `to` must be a real anchor in the note NOW: a stale offer answers **409 `code: "headingGone"`**. Never runs without the offer `PUT /api/note` raised.
- `GET  /api/replace/preview?q=&find=&replace=&regex=` → `ReplacePreview` (admin-only, 404 to a visitor) — the DRY RUN for a vault-wide replace: every file it would touch with the mtime it was read at, and per-line `{line, before, after, count}` samples. `q` sets the SCOPE (its operators), `find` is the needle and is used verbatim.
- `POST /api/replace` body `{ find, replace, regex, snapshot, files: [{path, mtimeMs, lines}] }` → `ReplaceResult` (admin-only) — apply exactly what was previewed. `lines: null` = every match in that file. A file whose mtime has moved since the preview is refused and named in `conflicts[]`. `snapshot: true` commits first (when the vault is a repo) and answers with the short sha. **400** `emptyFind` · `patternTooLong` · `multilinePattern` · `badRegex` · `emptyMatch` · `nothingSelected`. See "Vault-wide search & replace".
- `POST /api/bulk/undo` body `{ undoId }` → `BulkResult` (admin-only) — put back every file one bulk edit changed. **410 `code: "undoExpired"`** once the bundle has aged out (30 min) or four more bulk edits have happened.
- `GET  /api/trash` → `TrashEntry[]` (admin-only; newest first)
- `POST /api/trash/restore` body `{ name }` → `{ ok: true, path, renamed }`
- `DELETE /api/trash?name=` → `{ ok: true }` (erase one entry for good)
- `POST /api/folder` body `{ path }` → `{ ok: true }`
- `POST /api/folder/move` body `{ path, toPath }` → `{ ok: true, notes, rewritten }` (moves the whole subtree and repairs the links it would have broken; see "Moving notes and folders")
- `GET  /api/search?q=` → `SearchHit[]` (max 50, minisearch, prefix+fuzzy, diacritic-folded on both sides of the index). `q` may carry OPERATORS — `tag:` `path:` `is:published` `is:page` `before:` `after:` `linkto:` `linkfrom:`, negated with `-`, values `"quoted"` — which are peeled off and answered from the index's own tables; a query made ONLY of operators lists what they narrow to, newest first. See "Search: operators and the fold".
- `GET  /api/search/matches?path=&q=` → `SearchMatch[]` (max 100) — every line of ONE note the
  query matches, `{ line, text }`: `line` 1-based in the note's FULL source (frontmatter
  included), `text` HTML-escaped with matched terms in literal `<mark>…</mark>`. Substring
  semantics per whitespace-separated term (leading `#` stripped, `expandTagQuery` applied),
  deliberately NOT minisearch: the index answers "which notes" with fuzzy scoring, this route
  answers "where does it SAY that" — so a hit earned by fuzzy spelling, its title or an alias
  may legitimately answer `[]`. Visitor-scoped like `/api/backlinks`: a hidden or missing note
  answers `[]`, never a 404 that confirms the path exists.
- `GET  /api/graph` → `GraphData` (nodes = all md files, edges = resolved wikilinks).
  `?around=<path>` narrows it to that note, its direct wikilink neighbors in either
  direction, and the edges among that set — same shape, a fraction of the bytes, and the
  same visitor filtering (a slice of the already-filtered graph, never of the raw index).
  An unknown or filtered-away centre answers `{nodes:[],edges:[]}`, so "no neighborhood"
  and "not yours to see" are indistinguishable. Both forms are memoized per audience
  (`server/graphCache.ts`); `/api/tree` is memoized the same way (`server/treeCache.ts`).
- `GET  /api/backlinks?path=` → `Backlink[]`
- `GET  /api/tags` → `TagCount[]` (from `#tag` inline + frontmatter `tags:`)
- `GET  /api/props` → `PropCount[]` — every frontmatter key with its count and its twenty commonest values (per list item, folded like `prop:`), scoped like `/api/tags`; `tags` itself is left out (it has the shelf above). See "3.17.0 — Four views of the vault".
- `GET  /api/nearby?path=` → `NearbyHit[]` (admin-only, 401 to a visitor: the scoring reads every note's body) — the ten notes that read most like `path`, with the two terms that tie each (server/nearby.ts over shared/nearby.ts; an unknown path answers `[]`).
- `GET  /api/ask/status` → `AskStatus` · `POST /api/ask/reindex` → `AskStatus` · `GET /api/semantic?q=` → `SemanticResponse` · `GET /api/semantic/related?path=` → `SemanticHit[]` · `GET /api/semantic/suggest?path=` → `LinkSuggestion[]` · `POST /api/ask` body `{ question }` → NDJSON stream of `AskEvent` — **all admin-only (401 to a visitor and to the preview header)**; Ollama down or the embedding model missing is a **503 `code: "ollamaDown" | "noEmbedModel"`** (on the stream, an `error` event with an `AskErrorCode`). See "3.24.0 — Ask the vault".
- `GET  /api/query/paths?q=` → `string[]` — the paths a query names, uncapped, scoped like `/api/search`; an empty query names nothing. What the graph paints its groups by.
- `GET  /api/trackers` → `TrackerMeta[]` — every ```` ```tracker ```` fence this session may see, newest-touched first (the shelf a ```` ```tracker-board ```` draws). Scoped EXACTLY like `/api/posts`: a visitor gets published notes only with the language filter applied, an admin gets the whole vault, and templates are out of both. Covers are resolved server-side, per session, so the board spends no `/api/resolve` per card and a visitor is never handed a path they may not fetch. See "Trackers".
- A tracker fence may carry `folder:` (a vault folder, no `..`); `TrackerMeta` carries it as `folder`
  with `folderNotes` (notes under it, live) and `folderNote` (the folder's own note or index.md), admin
  scope only — a visitor's shelf never names a vault folder. A library ref whose folder equals a
  tracker's `folder` takes that tracker's resolved cover over its own (`libraryRefs()`), and the cover
  joins the visitor allowlist through `libraryCoverPaths` like any ref cover.
- `/draw` in the slash menu (client/drawing/createBeside.ts): creates `<note> sketch<ext>` in the note's folder (numbered when taken; plugin format in an Obsidian vault), writes `![[name]]` at the caret only AFTER the file exists, and opens the canvas in a pane split beside the note (in the same pane when the window has no room). Excalidraw's dialogs are pinned to the canvas box (`--s-drawing-*` on :root, set by DrawingSurface) and its main menu is Vellum's own list (no socials, no theme toggle).
- **A post's fallback date is the ledger's, not the inode's** (`server/created.ts`, `ASTROLABE_DATA/created.json`): saves rename a temp file over the note and so mint a new birthtime on every edit; the indexer records the first birthtime it sees per path (seeded, once, from `git log --diff-filter=A` when the vault is a repository, taking the earlier) and answers with it until the path is forgotten. Frontmatter `date`/`created`/`published` still wins.
- `POST /api/tracker` (admin) `{ path, index?, set?, delta? }` → `{ ok, path, index }` — edit ONE ```` ```tracker ```` fence from outside the editor (the Media page). `set` is a `TrackerFields` (a string sets a key, `null` removes it, absent leaves it), `delta` nudges the progress by that many units; the `index`-th tracker fence of the note (counting tracker fences only, the `TrackerMeta.index` the shelf hands out) is rewritten in place by `setTrackerFields` + `setTrackerProgress` and the note is written under its mtime precondition. 400 when the note carries no tracker fence. One request, one write, one `changed` event. See "Trackers".
- `GET  /api/aliases` → `AliasesResponse` (`{ alias, path, title }[]`, sorted by alias) — the name table the client cannot derive, since a tree carries filenames and an alias is frontmatter. Visitor-scoped exactly as resolution is.
- `GET  /api/events` → SSE stream of `VaultEvent` (chokidar watcher; debounced 100ms per path; events named `message`, JSON data). **Above 25 events in 200ms the stream stops narrating and sends one `{ kind: "bulk", path: "" }`** once the burst settles (and at least every 2s while it does not) — a `git pull` is one frame, not a thousand, and a client answers it by re-reading the tree and revalidating its buffers. The INDEX still receives every named event; only the refetching subscribers are coalesced (server/vault.ts `onEventCoalesced`). A delivery failure ENDS the stream so EventSource reconnects, rather than leaving a live-looking socket that receives nothing.
- `POST /api/upload` (admin) multipart `file` + optional `dir` → `UploadResult` — see "Attachments"
- `GET  /api/impact?path=&kind=` (admin) → `DeleteImpact` — what a delete would really take
- `DELETE /api/attachment?path=&permanent=` (admin) → `{ trashPath? }`

Path safety: every path param normalized, must resolve inside vault, must not contain `..`; only
`.md` files served/written by note endpoints (400 otherwise).

**Containment is checked against the FILESYSTEM, not against the string — on reads as well as
writes.** `safeAbs()` resolves the path with `realpath` (falling back to the deepest existing
ancestor for a file about to be created, and refusing a DANGLING symlink outright, since a write
would follow it) and requires the result to sit inside the vault's own realpath; anything else is a
`404`, never a message that would confirm the link exists. The lexical `startsWith` check that used
to stand alone answered a different question — "does this STRING stay inside the vault" — while
every `fs` call under it followed links, so one `ln -s /etc evil` in the vault turned
`/api/file?path=evil/passwd` into an anonymous filesystem reader (the publish allowlist admits any
path a published note embeds), and `note-link.md → /etc/passwd` into a readable *and writable* note.
Pointing such a link at `ASTROLABE_DATA` exfiltrated `git-credentials.json`, whose `0600` mode is
irrelevant when the server reads it for you. Three layers now hold, and each is independently
sufficient: `safeAbs()` realpath containment; `statAttachment()` uses **`lstat` + `isFile()`** (the
same rule the two font routes already followed); and the tree walk, the index walk and the chokidar
watcher (`followSymlinks: false`) all skip links, so an escaping link never enters the index and
therefore never enters the publish allowlist. Consequence, by design: a symlink pointing OUT of the
vault is invisible to the whole app and cannot be read, written or deleted through any API — remove
it with the filesystem. A symlink pointing back INSIDE the vault still resolves and still works.

**Every response below `/api` is `Vary: Cookie, X-Astrolabe-Preview, X-Astrolabe-Lang` and, unless the route said
otherwise, `Cache-Control: private, no-store`** (one middleware in `api.ts`, above the auth routes
so `/api/me` is covered). Every one of these bodies differs by session cookie AND by the preview
header, and none of them said so; the README recommends nginx in front, where a shared cache may
hand an admin's whole vault tree to the next anonymous visitor. Routes that set their own
`Cache-Control` keep it, and anything marked `immutable` (the content-addressed font routes, which
hold no session-varying byte) is skipped entirely so a CDN can still cache it. The SPA shell,
`/feed.xml`, `/sitemap.xml`, `/robots.txt` and the static assets get the same treatment in
`index.ts`, plus the origin's security
headers: `Content-Security-Policy` (`script-src 'self'`, `frame-ancestors 'none'`, `object-src
'none'`, `base-uri 'none'`; `style-src` keeps `'unsafe-inline'` because React style props, KaTeX and
the generated banner gradients are inline by design; `img-src`/`media-src` allow remote https/http
because `banner:` URLs and raw `<img>` in notes are documented features), `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff` and `Referrer-Policy: same-origin`. Without those the admin UI —
permanent delete, publish, settings PATCH, sync — was framable and clickjackable, and the
hand-rolled HTML sanitizer in `client/reading/rawHtml.ts` had no backstop behind it. Wikilink resolution: `[[Name]]`
matches file basename (no `.md`, case-insensitive), then frontmatter `aliases:` — never the
other way round; shortest-path winner on duplicates in either table; `[[Name|alias]]` and
`[[Name#heading]]` variants parse (link target is `Name`). See "Aliases — a note answers to
more than one name".

## Server modules (server agent owns `server/`)

- `server/vault.ts` — vault root resolution, safe path helpers, tree/read/write/create/rename/delete/mkdir, chokidar watcher exposing `onEvent(cb)`.
- `server/indexer.ts` — in-memory index rebuilt incrementally from watcher: minisearch (fields title+content), link graph, backlinks, tags. Exports `search(q)`, `graph()`, `backlinks(path)`, `tags()`, `resolveLink(name): string | null`.
  **A note over `MAX_INDEXED_MD_BYTES` (2 MB) gets a MINIMAL record — path, title, publish flag,
  banner, date, frontmatter tags, read from the file's first 64 KB — never a dropped one.** It used
  to be removed from the index entirely, and `/api/note`'s visitor gate reads `publishedSet`: a note
  its owner had marked `publish: true` answered **404 to visitors** while the admin's own request
  succeeded, and it was absent from the tree, `/api/posts`, RSS and the injected `<head>` — with
  nothing logged and a comment claiming the opposite ("still readable via /api/note"). Now only
  full-text search and the link graph degrade (no body is read, so no minisearch entry, no links, no
  excerpt); the skip is `console.warn`ed once per file and counted in the boot line
  ("N by metadata only").
  **Every mutation of the index goes through ONE chain** (`enqueue()` → `settled` → `whenIndexed()`):
  watcher events, the routes' own eager `indexFile()` calls, and the minisearch vacuum. `autoVacuum`
  is OFF, and a vacuum is booked on an idle timer and run as a chain task — because minisearch
  vacuums with an async batched walk of the term index scheduled by `discard()`, so it was still
  walking the radix tree when the next save mutated it, and the resulting TypeError came out of a
  promise this process does not own and killed the server. Two clients alternating precondition
  saves reproduced it 5/5. `indexStats()` reports `{ notes, dirt, vacuuming }` for the harness.
  **A read that fails is not a delete**: only `ENOENT`/`ENOTDIR` removes a record; anything else
  (`EMFILE` under a `git pull`, `EACCES`, `EIO`) keeps the previous entry and warns, because the
  untyped catch that preceded it evicted notes from search, the graph, backlinks and the tag counts
  until the process restarted, silently.
  **`detectTemplatesFolder()` is memoized** against the same five index mutations the link caches
  invalidate on (NOT `onEvent`, which fires before the index has applied the change), and the three
  loops that asked `isTemplateNote()` per published post hoist the lookup out (`templateMatcher()`).
  So does `excludedTags()`, which `postMeta()` called once per post. Measured on a 3k-note vault:
  `GET /api/posts` p50 **30.2 ms → 5.4 ms**, eight concurrent anonymous GETs **187 ms → 23 ms**.
- `server/api.ts` — `export const api: Hono` implementing routes above.
- `server/safeFetch.ts` — the one door out for addresses a stranger chose (webmention sources and endpoints, remote actors, inboxes): http(s) only, no credentials, the address checked at the socket's `lookup` (loopback, RFC 1918, link-local, CGNAT, multicast, IPv6 ULA/link-local and their IPv4-mapped spellings refused), 3 redirects each re-checked, byte and time caps. `allowPrivateAddressesForTests()` is a function, never an env var.
- `server/jobQueue.ts` — a sqlite-backed queue, one job at a time, `RetryLater` → three retries with backoff; used by webmentions and ActivityPub deliveries.
- `server/api.ts` — `export const api: Hono` implementing routes above: the middleware, the auth
  guard, the note and folder routes and discovery itself, and the mounts of the route groups
  that live in files of their own (`server/*Routes.ts` — trash, tags, replace, files, comments,
  Orbits, settings, sync, versions, the SSE stream, rename; each mounted where its routes
  stood, so the route table is the one it was). `server/indexer.ts` keeps the index's store and
  re-exports the queries that live in `server/indexer/` ([core.md](core.md), "Where the code
  lives").
- `server/seed.ts` — the starter vault and the single rule about when it may be written: a directory
  that did not exist is seeded at boot; one that exists is the reader's, and is OFFERED the seed
  (`/api/seed`) rather than written into.
- `server/index.ts` — arg/env parsing, seed-on-missing (copy `vault-seed/` → vault, **only when the
  directory was absent**), mount `api` at `/api`, static `dist/` + SPA fallback, listen 6801 with
  startup banner. It also installs the process's last net: `uncaughtException` /
  `unhandledRejection` are logged and SURVIVED — the state that matters is on disk (atomic writes,
  mtime preconditions) and the in-memory index is a derived cache, while the alternative is every
  desktop window on that vault closing or a web instance 502ing — but five faults inside ten
  seconds exits 1, so a supervisor gets a clean process instead of a haunted one.

## Auth & sessions (server/auth.ts)

- **`PUBLIC=false` without `ADMIN_PASSWORD_HASH` is a `ConfigError` and the process exits** (see
  README). `authGuard` short-circuits on `if (!config.passwordHash) return next()` and `isAdmin()`
  answers true unconditionally in that mode, both *before* the `publicReads` check — so the one flag
  an operator sets meaning "lock this down" was the flag that was silently inert, on an instance
  that answered `/api/me` with `{"admin":true,"protected":false}` and accepted anonymous
  `PUT /api/note`, `GET /api/settings` and `PATCH gitSync` → `POST /api/sync/now`. A non-loopback
  `HOST` with no hash is a loud warning, not a refusal: open-on-the-LAN is a documented use.
- **Backup & sync needs a real credential in EVERY mode** (`isProtected()`): `POST /api/sync/init`,
  `POST /api/sync/now`, `GET /api/sync/status` and any `PATCH /api/settings` carrying
  `gitSync`/`gitToken`/`gitUser` answer `403 sync_needs_password` in open local mode. "Everyone is
  admin" is defensible for editing notes on a trusted LAN; it is not defensible for "send my vault
  to an address the caller chose".
- **The session token is `v2.<epoch>.<expiry>.<hmac>`**, still stateless, with two revocation
  inputs baked into the signature: a `sessionEpoch` integer in `ASTROLABE_DATA/session-epoch`, and a
  fingerprint of the password hash (derived through `SESSION_SECRET`). `POST /api/logout` bumps the
  epoch, so signing out ends every session on every device — it used to only `deleteCookie()`,
  leaving a captured cookie valid for 30 days after logout *and* after a password change, with the
  only real revocation being an `.env` edit plus a restart. Changing `ADMIN_PASSWORD_HASH` now
  invalidates every token by itself. TTL is **7 days with sliding refresh** (reissued by `authGuard`
  once past half-life, so an active admin never meets the login modal), and the cookie carries
  `Secure` derived from `X-Forwarded-Proto` — honored only from `TRUSTED_PROXIES`, exactly like
  `X-Forwarded-For` — or the request's own scheme, with a `SECURE_COOKIES` override for
  LAN-over-http.
- **The login rate-limit slot is consumed BEFORE the argon2 verify and refunded on success.** The
  old order (read window → `await argon2.verify` → record failure) meant every request in a
  concurrent volley read the window before any of them wrote it: measured, one 200-way parallel
  burst evaluated **200/200 guesses against a limit of 10 per minute**. It was also an
  unauthenticated amplifier — each in-flight verify is argon2id m=65536 p=4, 64 MiB and four
  threadpool jobs, on the same libuv pool every `fs` call shares. There is now a global window
  (`GLOBAL_MAX_ATTEMPTS`) behind the per-IP one and a semaphore of `VERIFY_MAX_CONCURRENT` = 2
  verifies with a bounded queue (a full queue is a `429`, never a park). `POST /api/comments` always
  had this shape; the login route now matches it.
- **`/api/me` carries `comments: true` when marginalia are live** (`COMMENTS=on` or
  `settings.commentsEnabled`), alongside `languageToggle` and for the same reason: it describes
  the public shell, so every session gets it. The client gates `Marginalia` on it and only then
  asks `GET /api/comments?path=…`. Before, the reading view learned the answer by ASKING per note
  and reading the 404 — one bad response, and one red console line, on every note open of every
  instance with the feature off (`404 …/api/comments?path=Zombies%2FCache%20Locality.md`), which
  was the only non-2xx in an otherwise clean network sweep. One instance-wide fact belongs with
  the instance-wide facts.
- **`/api/me` never names the home note to a caller who could not read it.** `homeNoteVisible()`
  gated on publication and the languageFilter but not on `publicReads`, so `me.homeNote` (and
  `home.note`) travelled to anonymous callers on a `PUBLIC=false` vault whose entire premise is that
  nothing is readable without a session — one clause short of the leak the function exists to close.

## Note writes are durable (server/vault.ts)

**Every note write is atomic: the file on disk is always either the whole old note or the whole
new one.** `writeNote()` writes into a temp file beside the target, `fsync`s it, and `rename`s it
over — and since every mutating path in the product funnels through that one function
(`createNote`, the editor's autosave, `PUT /api/note`, the publish toggle, both frontmatter
routes, the rename link-rewrite and `POST /api/folder/move`'s rewrites), fixing it once fixes all
of them.

It replaced a bare `await fs.writeFile(abs, content, "utf8")`, and the bug that call carried is
worth stating plainly because nothing about it looked wrong: **`fs.writeFile` opens with
`O_TRUNC`, so the note is zero bytes from that call until the last byte lands.** A crash, a full
disk, a `kill -9` or a laptop lid closed inside that window left an EMPTY note — not a partial
one, an empty one — and the window was opened by a 600ms autosave debounce
(`AUTOSAVE_MS`, `client/editor/buffers.ts`) every few seconds of typing, on files whose entire
promise to the reader is that they are ordinary and safe to keep for ten years. There was no
recovery path either: `.trash/` catches deletes, not overwrites.

Four details of the implementation are load-bearing, and each is a bug that the obvious
write-then-rename would have introduced instead:

- **The temp file is a SIBLING of its target.** `rename` is only atomic within one filesystem and
  a vault subfolder can be a mount point, so the temp file is never in `/tmp`.
- **It is DOT-PREFIXED** (`.Note.md.<pid>.tmp`). `isIgnoredName` skips every name beginning with
  "." for the tree walk, the indexer and the chokidar watcher alike, so a save never flickers a
  ghost note through the sidebar or leaves one in the search index. `tests/durability.test.ts`
  asserts the name this function builds is one `isIgnoredSegment` refuses, rather than trusting
  the two rules to stay in step.
- **The target is `realpath`'d first.** `safeAbs()` returns a LEXICAL path and `fs.writeFile`
  followed symlinks; renaming over the link itself would have replaced it with a regular file and
  silently broken a vault that keeps a note as a link to somewhere else inside the vault — which
  the containment rules above explicitly still support. Containment was already proven by
  `safeAbs` → `resolvesInsideVault`, so following the link here widens nothing.
- **The mode is carried across.** `writeFile` on an existing file leaves its permissions alone; a
  rename hands the target the TEMP file's. Without the `chmod` a note its owner had narrowed to
  `0600` would quietly widen to whatever the umask says, the next time they typed in it.

The directory is `fsync`ed after the rename so the rename itself survives the crash it exists to
survive — best-effort, because opening a directory for reading is a POSIX affordance that Windows
refuses, and a platform that cannot promise that must still be able to save a note.

**The one accepted regression, stated so it is a decision and not a surprise:** updating an
existing note now requires WRITE permission on its directory, because a new file has to be created
there. `fs.writeFile` needed no such thing — opening an existing file for writing never consults
the directory's mode. A vault folder set to `r-xr-xr-x` could therefore be edited before and
cannot be now. That is the correct trade: the app already needs to create notes, folders and
`.trash/` entries in that tree, and a write that fails loudly beats a write that succeeds by
destroying the previous version first.

The trash manifest (`writeManifest`) goes through the same helper, for a smaller but identical
reason: a torn manifest is how a restore forgets where an entry came from. Its reader already
degrades gracefully on a corrupt file, which is exactly the outcome the writer must stop causing.

`tests/durability.test.ts` pins what can be observed from inside the process — the previous note
survives a failed write, no temp file is left behind, the mode is preserved, a symlinked note is
followed rather than replaced, and the reported `mtimeMs` describes the file a reader would now
open. That last one matters beyond this section: it is the value a write precondition compares
against.

## Search: operators and the fold (`shared/searchQuery.ts`, `shared/fold.ts`)

**One box, three answers.** `GET /api/search` takes the reader's raw string; the operators are
peeled off inside `search()` and the words go to minisearch. There is no second endpoint and no
mode flag, because the reader types them into the box they already have.

`tag:` · `path:` · `is:published` / `is:page` · `before:` / `after:` · `linkto:` / `linkfrom:` ·
`prop:key` / `prop:key=value` (a frontmatter property; the key alone matches any note that has it) ·
`in:notes` / `in:books` (which store answers: `in:books` is the PDF page index's, asked beside the
note index by the route), each optionally negated with a leading `-`, values optionally `"quoted"`.

- **Everything is AND.** `tag:a tag:b` is notes carrying both, and the free words are ANDed with
  the filters. OR is not offered: a query language whose default is OR returns the whole vault the
  moment somebody adds a term.
- **An operator that does not parse is a WORD.** `before:soon`, `is:blue`, a bare `tag:` — all fall
  back to ordinary text. A search box that answers "no results" for a typo the reader cannot see is
  the worst failure this surface has.
- **A query of only operators is a real query.** `tag:recipes` alone lists every recipe, newest
  first, capped at fifty like any other search — the alternative is that the most obvious thing
  anybody types returns nothing.
- **The scope ladder still holds.** Filters are evaluated after the visitor/language filter, never
  instead of it: `is:page` on an unpublished note answers a visitor with nothing.
- **Localised tags reach through.** `SearchOptions.canonicalTag` resolves an operator's value and
  `SearchOptions.expandTerms` (`expandTagQuery`) widens the free words — each applied to its own
  half, never the other's. Run over the raw string, `expandTagQuery` reads `tag:برمجيات` as prose
  and appends `software` as a loose term, widening the query the operator was narrowing.

**The fold** (`shared/fold.ts`) is one table with three doors, and picking the wrong one is how a
highlight lands an invisible character early:

- `foldTerm` — ignorables DROPPED. minisearch's `processTerm`, on the index side and the query
  side, which is the only way "type it plain, find it pointed" can hold; also the `[[` completion's
  tier test.
- `foldKeep` — same length in, same length out. For a matcher that reports INDICES into its input
  (the palette's highlight marks). Ignorables stay put; a subsequence walks over them anyway.
- `findMatches` / `findAnyMatches` — offsets into the UNTOUCHED string, for a scanner that turns a
  hit back into a DOM Range or a byte edit (the PDF reader, `searchMatches`, the snippet marker).

Harakat, the Quranic marks, the alef family, ى/ي, ة/ه, the Persian ی/ک, tatweel, the zero-width
joiners and bidi marks, the soft hyphen, and the Latin combining block. The table was written for
the books reader and lives in `shared/` because a fold that disagrees with itself between the note
index and the reader that opens from it is worse than no fold at all.

## Aliases — a note answers to more than one name

**The README recruits Obsidian vaults, and in one of those a note is linked by a name that is
not its filename.** `aliases: [ML, machine-learning]` in the frontmatter, `[[ML]]` in twenty
other notes. There was no alias table: every one of those links rendered dashed and offered to
create a DUPLICATE note — in the first hour, to exactly the reader the pitch was aimed at. The
table is `byAlias` in `server/indexer.ts`, and it is registered and torn down by `addKeys()` /
`removeKeys()` beside labels and citekeys, so it rides every path that indexes a note —
including the watcher's incremental `indexFile()`. A stale alias that resolves to a deleted note
is worse than no aliases at all, and that is why it is not its own call.

**The ladder is exact path, then real basename, then alias.** A file actually named `DL.md`
must never lose its own name to a `aliases: [DL]` some other note declares, whatever the two
paths look like. Ties INSIDE a rung — two notes claiming `AI` — break with `pickShortest()`,
the same rule duplicate basenames have always used: fewest segments, then shortest string, then
alphabetical. One rule for names, whoever wrote them down; Obsidian picks a winner here
silently and arbitrarily, which is the behaviour this replaces, not the one it copies.

**A rung the visitor filter empties falls through to the next one** rather than answering null.
The visitor's collection is a smaller vault: inside it no note is NAMED `Ghost` at all, so the
published note whose alias is `Ghost` is the honest answer. It leaks nothing either way — both
branches are computed from notes the caller may already discover — and the alias half of
resolution is filtered by `isNoteVisibleToVisitor()` exactly as the basename half is, so an
alias can never make a private note reachable.

**Every surface lands together, because a note reachable by a name in one place and invisible
by it in three others is more confusing than no aliases at all.**

- **Links.** `resolveLink()`, which is also what backlinks, the graph, `notesLinkingTo()` and
  `/api/resolve` are built from — so a link made THROUGH an alias is a backlink like any other,
  with the same context extraction, and nothing else had to learn the word.
- **The client resolver too, or the feature is a lie in the one place the author works.**
  `client/editor/links.ts` decides whether a link is drawn dashed and where a click goes. A tree
  carries filenames, so the client cannot derive an alias: `state.loadTree()` fetches
  `GET /api/aliases` beside the tree and fills `setAliasTable()`, and the two are stale and
  fresh together. Without it the server drew the backlink while the editor drew a DASHED link
  offering to create a duplicate of the note it had just resolved — the disagreement
  `tests/links.test.ts` exists to catch. The client applies the SERVER's tie rule for aliases
  (fewest segments, then shortest, then alpha), so both name the same winner. The alias half of
  that fetch fails softly: it enriches the tree, it is not a condition of it.
- **Search.** `aliases` is a minisearch field, boosted 4 — under the title (the filename is what
  the note is called), over tags. It also gets the exact-match short-circuit `byName` has, and
  needs it more: an alias is routinely a word the note's own text never contains ("ML" on a note
  that only ever writes "machine learning"), so there is no body match left to rank.
- **`[[` autocomplete.** Reads the same table (`aliasCompletions()`), so the popup opens at the
  speed it always did — no fetch on the keystroke. An alias that merely repeats a filename is
  dropped from the list: it would complete to the same link twice, and the second row would say
  something different about where it goes.
- **The reverse: a rename OFFERS to keep the old title.** The link rewrite repairs every
  `[[wikilink]]` inside this vault. It cannot repair what is outside it — a published permalink,
  a link in someone else's notes, a bookmark — or the reader's own memory of what the note was
  called. So a rename that changes the NAME (not a move, which keeps it) raises an
  `actionToast`: one button, and the old title goes into `aliases:`. This is the half Obsidian
  leaves to the author.

**Which name matched is SAID, not guessed at.** A search hit carries `SearchHit.alias` when the
title is not what matched, and the sidebar row prints "matched alias «ML»"; a completion row
says "alias of {title}". A result whose words appear nowhere in the note, or a completion for a
name the reader has never seen on a file, reads as a bug rather than as a feature working — and
when two notes claim one alias, these rows are the only place the difference is visible.

**Reading and writing go through `server/noteFrontmatter.ts`, one operation per format.**
`parseAliases()` takes ALREADY-PARSED frontmatter, so a `.tex` note's `%--- … %---%` comment
block — the one that still compiles under `pdflatex` — carries aliases through the existing
reader with no second frontmatter path. Three spellings arrive from real vaults because YAML
gives three values for what an author reads as one list: a flow list, a block list, and the
STRING `ML, machine-learning`. A scalar is split on commas; a list ITEM never is —
`aliases: ["Smith, John"]` is already one item to YAML, and splitting it too would leave no way
to spell an alias containing a comma. Obsidian's older singular `alias:` is read as well.

**`addNoteAlias()` adds an ITEM to a block list instead of flattening it.** Flattening
`aliases:\n  - ML` into one `aliases: [...]` line would leave the `- ML` lines orphaned under a
key that now holds a value: that is not a note with an odd alias list, it is a note whose YAML
no longer PARSES — and the first thing lost when frontmatter stops parsing is `publish: true`,
i.e. the note silently leaves the public site. The new item copies the indentation, and in a
`.tex` note the `%` comment prefix, of the item already there. Absent or inline, it is one
`aliases: [...]` line written through the surgical line editor, new name first. Idempotent, so
the offer can be taken twice without growing the list.

## Moving notes and folders (drag in the tree, "Move to…", undo)

A vault reorganizes itself constantly, and until this landed the only way to move anything was to
retype its whole path into Rename. Three surfaces now perform one operation — a drag in the file
tree, "Move to…" in the tree's row menu, and "Move note to…" in the command palette — and they all
run `moveTo()` in `client/move.ts`, which owns the validity rule, the conflict dialog, the tab
remap, the toast and the undo. A second implementation behind the keyboard route is exactly how
the two would drift.

**A MOVE IS NOT A RENAME WITH A DIFFERENT STRING.** `POST /api/rename` was already the note-move
endpoint and was already rewriting `[[wikilinks]]` in the notes that pointed at a renamed note.
That is the whole story for a rename in place. It is not the whole story when the FOLDER changes,
and the two things it missed were both invisible until a reader noticed a picture had gone:

- **The moved note's own relative embeds.** `![alt](Media/x.png)` and `[see](../Ideas/Note.md)`
  resolve against the note's OWN directory (`resolveRelative()` in `client/editor/embeds.ts`, and
  its server twin `parseAssets()`). Drag a note one folder up and every one of them points
  somewhere else — the admin sees broken images, and a PUBLISHED note serves 404s to visitors,
  because `allowedAttachments()` is built from the same resolution. Nothing said so.
- **Other notes' markdown links TO it.** The old rewrite knew `[[wikilinks]]` only, so
  `[see](Ideas/Note.md)` in another note dangled.

Both are `server/moveLinks.ts`, which is pure string work over one note's content (no fs, no
index): `rewriteWikilinkPaths` remaps PATH-form targets, `rewriteDestinations` re-resolves
standard-markdown destinations, `rewriteForMove` composes them. Three rules it keeps:

- **Basename-form `[[Note]]` is never touched.** It resolves by name, so a move cannot break it,
  and rewriting it turns a portable link into a brittle one. The same guard fixed a live wart in
  the rename path: for a note at the vault ROOT the path spelling IS the basename, so moving one
  root note into a folder used to rewrite every plain `[[Solo]]` in the vault into
  `[[folder/Solo]]`.
- **The written FORM survives.** Rooted (`/Media/x.png`) stays rooted, `<…>` stays `<…>`, and
  percent-encoding is restored whenever it was there or the new text needs it. Angle brackets are
  never ADDED — `parseAssets()` does not read that form, so inventing it would allowlist nothing
  and 404 the image to every visitor. **A destination the move did not touch is reprinted
  BYTE-FOR-BYTE**, not re-encoded: `encodeURIComponent` is not the inverse of `decodeURIComponent`
  (it does not produce `%2E` for `.`), so `![p](Media/pic%2Epng)` came back as
  `![p](Media/pic.png)` after a folder move — a live link, and a byte the round-trip promise says
  should survive. `printDest` keeps the author's own spelling whenever the new one names the same
  path (`sameDest`).
- **A destination that climbs out of the vault is left alone**, exactly as `parseAssets()` drops
  rather than clamps it.

### `POST /api/folder/move` (server, shipped)

Body `{ path, toPath }` — the same shape as `/api/rename`, because dragging a note and dragging a
folder are one gesture to the reader. Answers `{ ok: true, notes, rewritten }`. **Admin only** (the
standard guard 401s every non-GET, preview sessions included). Every refusal happens before a byte
moves, and each carries a stable `code`:

- `move_into_self` — a folder into its own descendant (`Ideas` → `Ideas/2026/Ideas`). Checked on
  the string, as written AND lowercased, so a case-insensitive filesystem cannot slip past. This
  is the gesture that eats a vault: `fs.rename` answers EINVAL on some platforms and builds an
  unreachable loop on others.
- `move_conflict` (409) — the destination name is taken. Never a merge, never an overwrite:
  `fs.rename` over a non-empty directory fails, but over an EMPTY one it succeeds, silently
  swallowing the folder that was there.
- `move_not_folder` — including a SYMLINKED folder, which is a link and not a tree; moving it would
  make every count and rewrite below describe files outside the vault (the rule `deleteFolder`
  already follows when it refuses to count through one).
- `move_same`, `move_missing` (404), `move_invalid` / `move_invalid_target` (an ignored tree —
  `.trash`, `.obsidian`…), `move_bad_parent`.

One `fs.rename` does the work — atomic within a filesystem. The `EXDEV` fallback (a bind-mounted
sub-tree) copies FIRST and removes the source only once the copy is whole, cleaning up a partial
copy rather than leaving a second half-folder beside the original. A failure at any point leaves
the vault exactly as it was.

**Events: exactly ONE** `{kind:"renamed", path, toPath, dir:true}`, the shape folder DELETE
established — 715 per-file events describing one gesture is not a description. The watcher's
add/unlink storm is suppressed on both sides, **including the sub-directories** (without them a
folder holding one sub-folder still leaked an `unlinkDir` + `addDir` pair), and the suppression
window scales with the subtree: chokidar re-walks the arriving tree, so a 715-note folder trickles
events in for several seconds, all of them after a fixed 1s window would have closed
(`suppress(rel, ms)`).

**The index is correct before the response returns.** The dir event drives
`reindexFolderMove(from, to)` in the indexer (`removeFolder` + a walk of the new subtree via
`listFolderFiles`, never a re-walk of all 1,388 notes), awaited through the same `settled` chain as
every other event — so the `/api/tree` + `/api/graph` refetch the client fires on the 200 is
already true. The rewrite set is sampled BEFORE the move by `notesAffectedByFolderMove(rel)`: one
pass over the index collecting notes inside the folder, notes whose wikilinks resolve into it, and
notes whose markdown embeds point at any file inside it (the case that breaks when `Media/` is
dragged). Calling `backlinks()` once per moved note instead is O(notes²) — a million link
resolutions for one drag on a real vault. Measured: 1,214 notes moved, 246 notes rewritten, ~3.1s,
and a round trip restores every link byte-for-byte.

**The SSE visitor filter fans a folder move out per note**, like a folder delete: a visitor holding
the old path of a published note would get a 404 from a link the site drew itself. Visible-both-
ends becomes a per-note `renamed`; anything hidden at its new address leaves as a `deleted`.

### Client

- **Drop targets are FOLDER rows plus the vault root.** A note is not a container, so a file row
  refuses quietly (the browser's own cursor, no colour — every file row flashing red on the way
  past its folder is noise). The valid target takes `--accent-soft` plus a full inset `--accent`
  ring; the ring is what separates it from the ACTIVE note row, which wears the same wash with a
  leading bar. A refused folder — its own descendant, or the one it is already in — takes a
  `--danger` ring and wash, because a target that merely fails to light up is indistinguishable
  from one the pointer has not reached. `preventDefault` is what ALLOWS a drop; withholding it on
  a refused target is the refusal, so an invalid drop cannot fire at all.
- **The vault root has no row of its own**, so two surfaces stand in for it: the tree's empty space
  below the last row, and the SIDEBAR HEADER — which names the vault, never scrolls away, and is
  the only one of the two a 1,375-note vault offers, since its rows fill the pane end to end. A
  sticky "vault root" row inside the tree was the other candidate and was rejected: appearing at
  dragstart it pushes every row down 26px under a pointer that has already picked something up.
- **Spring-loaded folders**: hovering a collapsed folder mid-drag opens it after 600ms (the
  Finder/Obsidian figure — long enough that passing over on the way somewhere else never opens
  one). It arms for ANY folder, including one the item cannot land in: resting on the folder you
  are dragging OUT of is exactly how you reach the sub-folder you are dragging INTO. Dropping onto
  a collapsed folder works and does not expand it — the spring is an aid, never a precondition.
- **Auto-scroll** within 56px of either edge of the tree, speed ramping with depth into the band
  (`autoScroll` in `client/move.ts`). Driven from `onDragOverCapture` on the tree, because the rows
  stop `dragover` from bubbling and auto-scroll has to run while the pointer is over rows — which
  is all of the time.
- **No React state during a drag.** The drop classes are toggled on the DOM nodes and the dragged
  item lives in a module variable: a `dropTarget` prop would bust `memo()` on all 1.4k rows every
  time the pointer moved one row, twelve times a second, to repaint one background.
- **A drag ghost naming the item** (`.s-dragghost`, parked off-screen and snapshotted at
  dragstart). The default drag image is a translucent copy of a 26px row against a 1.4k-row tree —
  invisible, and the reader loses track of what they are dragging half a screen in.
- **ONE LABEL RULE ACROSS THE GESTURE.** `MoveItem.name` is the basename on disk (what the API is
  called with); `itemLabel()` is what a reader is shown, and it is the tree's own label
  (`noteLabelOf`). The ghost read "Welcome.md" while the row it had just left read "Welcome", and
  the same disk name went on to the Move-to conflict dialog, its prefilled field and the error
  toasts. The landed-name toast follows the same rule.
- **No source file in this repo contains a literal NUL byte.** `MovePicker.tsx` carried one, as
  the sentinel React key for the vault-root row (`row.path || "\u0000root"`), written as the byte
  rather than as the escape. A file with a NUL in it is not text: git reports "Binary files
  differ" and shows no diff for it, GitHub renders nothing, and a source file nobody can review is
  a source file nobody reviews — which is how it survived. The escape is the same string at
  runtime. If a sentinel is needed, spell it.
- **Keyboard and touch get the same operation, not a lesser one.** HTML5 drag does not exist on a
  touch screen and cannot be reached from the keyboard at all, so `MovePicker.tsx` — the row menu's
  "Move to…" and the palette's "Move note to…" — is a folder picker shaped like the command palette
  (filter field, 34px rows, arrow keys, Enter, Esc, capture-phase bindings, ≥44px rows on a coarse
  pointer). It lists exactly the destinations `canDrop()` allows, so the tree's highlighting and the
  list can never disagree, and it mounts its own React root on demand rather than adding a host to
  `App.tsx`.
- **The picker has a door, and it is pinned** (v1.8 UX audit, F11). Two dead ends had no way
  forward: a vault whose every folder `canDrop()` refuses, and a filter that matches none. A
  `.s-movepick__new` row sits BETWEEN the scrolling list and the footer — outside the
  `role="listbox"`, since a control that is not one of the options may not sit among them, and
  outside the scroll, since a door that scrolls away is not one. It is the last stop of the arrow
  keys, it is named with the filter text when there is any ("New folder “archive”…"), and it opens
  `promptNewFolder` — the SAME dialog the tree's own New folder opens, so the `..`/dotfile refusals
  and the "creates archive/2026" line under the field are rules the reader already knows. It
  creates at the vault root and obeys a typed path, then moves the item in through the ordinary
  `moveTo()`, undo toast included.
- **A NOTE is never offered the attachments folder** (F11). `MeData.attachmentFolder` carries the
  resolved policy (admin-only, like `folderIcons`: it is a vault path, and only an admin moves
  anything) — the fixed folder under `specified`, the repeating folder NAME under `subfolder`, and
  nothing at all under the two modes that name no folder. A FOLDER may still be filed there: a
  folder is the reader's own structure, and hiding the row would take away the only keyboard route
  to a move the drag still allows.
- **`POST /api/folder/move` refuses a path WRITTEN as absolute.** `normalizeRel` strips the leading
  slash, so `toPath:"/tmp/escaped"` answered 200 and invented a top-level `tmp/` folder inside the
  vault. Nothing escaped — but a request that reads as "put this at /tmp" and succeeds by meaning
  something else is a success nobody asked for, so it is `move_invalid_target` (and
  `move_invalid` on the source side). Two neighbours of the same call: the destination's existence
  check is `lstat`, not `access`, so a DANGLING symlink at the target name is a `move_conflict`
  rather than something `fs.rename` replaces in silence (the source side already refused symlinks
  by `lstat`); and the `mkdir -p` that precedes the rename is taken back out when the rename throws
  (`pruneEmptyParents`, stopping at the first non-empty directory and never leaving the vault),
  instead of leaving the half-built path behind as folders nobody asked for.
- **Safety.** A name collision opens the themed prompt (`promptModal`) offering another name or
  Cancel — never a silent overwrite, and Cancel means nothing at all happened; the check is
  case-INSENSITIVE, because macOS and Windows would let `Notes.md` land on `notes.md`. Every
  completed move raises `actionToast` (`client/undoToast.ts`) naming the item, the folder it left
  and the folder it reached, **with Undo** — a real `<button>`, Tab-reachable, 9s, and the undo is
  the inverse move through the same code path, confirming with a plain toast rather than offering a
  third round. Open tabs and the active note follow the file (`remapPath` BEFORE `loadTree`, so the
  note you were reading stays the note you are reading, at its new address; App.tsx's SSE handler
  does the same for every other connected client, and `remap()` already handled the folder-prefix
  case). A move waits out a pending autosave first (`whenSaved`, 2s bounded) — a 600ms-debounced
  save landing after the move would recreate the old path as a ghost. A failure toasts the
  server's CODE translated, never `err.message`.
- **Attachments are not individually draggable**: `/api/rename` and `/api/folder/move` are note and
  folder routes, so an image travels only inside a folder that moves. The row menu follows the same
  rule the Rename row already did.

### Files dragged in from the desktop

Dropping OS files onto a folder row uploads them there through the existing magic-byte-checked
`POST /api/upload`, which grew one optional multipart field, `dir`. Omitted — every pre-existing
caller: paste in the editor, the banner picker — it is the configured attachments dir, byte for
byte as before. Given, it must name an existing directory inside the vault (`safeAbs` plus an
`lstat`; `upload_bad_dir` otherwise), and the filename still goes through `sanitizeBaseName` and
the first-free-name loop. Without this branch the browser's default takes over on drop and
navigates the whole app away to the image — the reader loses their vault to a gesture the tree
invites.

Conflicts are handled the way an UPLOAD must and a MOVE must not: the server takes the first free
name (`shot.png`, `shot-2.png`…) rather than asking, because nothing is at risk of being
overwritten and the reader has not named anything yet — and the toast names what actually landed,
so the counter is visible rather than silent. There is deliberately **no undo** here: an upload only
adds a file, and taking it back would need a delete route for attachments that the API does not
have. The destructive gesture is the one that carries undo.

## Bulk rewrites (`server/bulkRewrite.ts` + `tagRewrite.ts` + `headingRepair.ts`)

**Bulk-edit tools are what note-takers most want and least trust**, and the reason is always the
same: a rewrite spread over four hundred files is not something a reader can inspect afterwards,
so a wrong one is unrecoverable. Every vault-wide edit in Astrolabe therefore runs through ONE
engine, and it makes three promises once instead of once per feature:

1. **Nothing is written that was not previewed.** `previewBulk` and `applyBulk` run the SAME
   transform over the SAME reads. A preview produced by different code from the apply is a
   preview of a different operation.
2. **Nothing is clobbered.** Every write carries `writeNote`'s mtime precondition, taken from
   the read this very call made — so the window in which a concurrent edit can be missed is the
   width of one file's transform, not the width of the reader's dialog. A file somebody else
   changed in that window is SKIPPED and named in `skipped[{path, reason: "conflict"}]`, and the
   client says so out loud. A bulk edit that reports "done" while quietly skipping four notes is
   the bulk edit nobody presses twice.
3. **There is a way back.** Apply keeps the pre-edit bytes of every file it changed in an undo
   bundle (`undoId`), including the half of the operation that is not a file at all — a
   `settings.tagLabels` re-key, a renamed tag page — which the caller hands over as a `revert`
   closure. Bundles are in memory, capped at 12 MB, four deep, 30 minutes; past the cap the
   answer is `undoId: null` and the client sends the reader to Backup & sync, which is the real
   floor under an edit that size. Undo carries the same precondition in the other direction: a
   file edited SINCE the bulk edit is skipped, because an undo that discards work done after the
   thing being undone is the same clobber wearing a friendly label.

### Tag rename and merge (`POST /api/tags/rename`)

Right-click a tag pill in the sidebar → *Rename tag…*. Two dialogs: the first checks the name as
it is typed (`isTagName`, `shared/tagLabels.ts` — the same rule the route enforces, so a reader
never meets it as a rejection) and says when the destination already exists; the second states
what the server actually found. Then:

- **Inline `#tags` and frontmatter `tags:` both move**, byte-surgically. All four YAML spellings
  are handled in place — bare scalar, comma scalar, `[flow, list]`, block list — in either note
  format (a `.tex` note's `%`-prefixed comment block stays commented). Quote style, `#` prefixes,
  spacing, trailing comments and every other key are reprinted untouched.
- **The rewrite never enters code.** `parseTags` scans the whole body, fences included, which is
  a known over-count (`tests/tags.test.ts` pins `#define` inside a ```` ```sh ```` block as a
  "tag"). Over-counting a tag list is cosmetic; rewriting a `#define` inside a shell fence is
  data loss. Fenced blocks and inline code spans are skipped — so the preview's number is
  sometimes SMALLER than the tag pill's count, and it is the honest one, because it is what the
  writer will actually change.
- **Nested tags come along.** `zettel` → `slip` takes `zettel/seed` to `slip/seed`: a tag
  hierarchy is one name with slashes in it. Renaming a tag into its own subtree is refused
  (400 `code: "nestedTag"`).
- **A merge does not print the target twice.** `tags: [alpha, beta]` with alpha→beta becomes
  `tags: [beta]`, not `[beta, beta]` — the duplicate item is removed with its separator, or its
  whole line in block form. PROSE is left alone: two `#beta`s in one sentence is the author's
  sentence, not a list.
- **A tag's label is part of the tag.** `settings.tagLabels` is re-keyed exactly as
  `folderIcons` is re-keyed by a folder move (`renameTagLabels`, and the destination's own label
  wins on a merge). Without it, renaming `software` to `code` left «برمجيات» attached to a tag no
  note carries and the Arabic chip silently reverted to the English word.
- **The tag's PAGE follows the tag**, because the path IS the tag: `tagPageLabels` derives one
  from the other, so leaving `tags/software.md` behind after the rename leaves a page defining
  labels for a tag nothing carries. It moves through the ordinary rename path, so wikilinks to
  the page follow. On a merge the destination page already exists and two pages cannot be merged
  by a file rename — the old page is then left where it is and `page: null` says so.

### Heading-link repair (`PUT /api/note` → `POST /api/links/heading-repair`)

Rename a heading and every `[[Note#Heading]]` pointing into it stops resolving — the link still
opens the note and silently lands at the top, which is the worst shape a broken link can take
because nothing says it broke. `moveLinks.ts` carries `#tails` through a MOVE verbatim, and that
is right for a move; this is the other half.

**Detection is on the WRITE PATH**, server-side, and the alternatives were both wrong. The
editor sees only edits made in Astrolabe's own CodeMirror (not the reading view's source, not a
template, not another window) and fires mid-word. The indexer sees everything including a `git
pull` — which would open forty offers to rewrite links the puller never touched, and an offer
nobody asked for over files nobody looked at is how a bulk tool loses trust. `PUT /api/note`
covers every write this instance makes, is scoped to writes the reader caused, and costs
nothing: the OLD anchor table is already in the index and the new one is computed by the reindex
that follows the write anyway.

A rename is **the same headings, in the same order, with exactly one wearing a different title**
— anything else is an edit, not a rename, and guessing would rewrite the vault on a heuristic. A
title that changes without changing its slug breaks no link and raises nothing.

**A save fires while the reader is still typing**, so a rename is remembered as a CHAIN: the
ORIGINAL anchor the vault's links actually name, plus wherever the heading has got to now.
`## Introduction` → `## Introductio` → `## Preface` is one offer naming `introduction` and
`Preface`, not three. Type the heading back and the chain dissolves. The offer rides on the
write's response (`NoteWriteResult.headingRepair`) and is raised only when the count is non-zero.

The repair answers **in the register it was addressed in**: `findAnchor` matches an anchor's id,
its slug OR its human title, so `[[N#introduction]]` becomes `[[N#preface]]` and
`[[N#Introduction]]` becomes `[[N#Preface]]`. Rewriting the second into the first would work and
would also reprint the reader's prose in lower case. The note ITSELF is never rewritten — its
buffer is open in the editor that just saved it.

### Vault-wide search & replace (`GET /api/replace/preview`, `POST /api/replace`)

The 650-like forum request, and the third rider on the engine above. Admin-only at both gates a
mutating owner surface uses: the auth guard 401s the POST, and the GET dry run answers a visitor
**404** rather than 403 — the preview names vault paths and quotes their lines.

- **THE SCOPE IS THE SEARCH BOX.** `q` is whatever the reader typed into the sidebar, operators
  included (`shared/searchQuery.ts`), and its filters decide which notes are considered. `find` is
  sent SEPARATELY and used verbatim, because a regular expression is not a search query — running
  `\d+:\d+` through the operator tokenizer would lose its middle to a `path:`-shaped rule. The
  client pre-fills `find` from the same parser and the reader may edit it.
- **The candidate walk is not `search()`.** That one ranks, fuzzes, folds and caps at fifty, every
  one of which is right for a list and wrong for a rewrite. `replaceCandidates` walks the whole
  index, applies the filters exactly, and tests the needle against the in-memory body — so the
  filesystem is touched only for notes that can actually change.
- **MATCHING IS EXACT: case-sensitive, diacritic-sensitive, literal unless `regex`.** This is the
  ONE matcher in the product that deliberately does not consult `shared/fold.ts`. Finding is a
  question and folding widens it kindly; replacing is a WRITE, and a "replace المقدمة" that
  stripped the harakat off «الْمُقَدِّمَة» would destroy text the reader never typed and never saw.
  Case is the same argument in Latin. The regex toggle is where `[Mm]` says so out loud.
- **FRONTMATTER IS OUT OF REACH**, in both the preview and the apply. A blind regex over YAML is
  the failure this release's story mocks Obsidian's properties editor for, and the vault has a
  byte-surgical frontmatter writer for that work. One tool per substrate.
- **Line-preserving by construction.** A newline in `find` or `replace` is refused (`400`,
  `multilinePattern`), because a replacement that split a line would make every line number below
  it in the preview the reader is looking at wrong. A regex that can match the empty string is
  refused too (`emptyMatch`): `a*` → `x` inserts an x between every character in the vault.
- **Selection is per file AND per line.** `files[{path, mtimeMs, lines}]`; `lines: null` is "every
  match in this file". Preview rows carry FULL-FILE line numbers (frontmatter counted), the number
  the editor's goto machinery uses. Every matching file is named and counted; the first 40 carry
  line samples (20 each) and the rest are offered whole and say so.
- **THE MTIME IS THE FOURTH PROMISE.** A reader looks at a preview for a while, and the engine's
  precondition only covers the width of its own read. Every previewed file carries the mtime it was
  read at; `screenTargets` refuses any file whose mtime has moved since and returns it in
  `conflicts[]`, which the panel names in a toast. `applyBulk`'s own precondition then closes the
  remaining millisecond.
- **The snapshot is why history shipped first.** When the vault is a git work tree the panel offers
  `snapshot: true`, ticked by default; the route runs `snapshotNow()` BEFORE the rewrite and answers
  with the short sha. A commit taken after the rewrite records the damage. A repository that is not
  there, or a clean tree, is not an error — the box was an offer, not a precondition.

## Note deletion (server, shipped)

`DELETE /api/note?path=<rel>&permanent=<bool>` → `{ ok: true, trashPath?: string }`

- **The safety gradient used to run backwards.** Deleting a FOLDER — rare, two dialogs deep, up to
  1,214 notes at once — moved to `.trash/` and was recoverable; deleting ONE note — the
  high-frequency, one-click operation on a tree row and in the command palette — was an
  unconditional `fs.rm` with no trash and no undo anywhere in the product. The irreversible
  operation was the cheap one. Obsidian trashes single files by default; so does this now.
- **Default:** the note is *moved* to `.trash/` at the vault root (created on demand), with the
  same counter the folder route uses — placed before the extension, so `draft.md` becomes
  `draft.md`, then `draft-2.md`, `draft-3.md`… and a trashed note is still an openable `.md` file.
  `EXDEV` (a bind-mounted sub-tree) falls back to copy-then-remove.
- **`permanent=true`** (also `1`/`yes`/`on`, parsed exactly as on `DELETE /api/folder`) → `fs.rm`;
  no `trashPath` in the response. This is the escalated path the client asks a second question for.
- Errors: `400` non-`.md` path or traversal, `404` when the note does not exist.
- **Events: the delete ANNOUNCES ITSELF**, exactly as `deleteFolder` does — one synthetic
  `{kind:"deleted", path}` after the fs work, with the watcher's echo of the same removal
  suppressed first. `.trash` is ignored everywhere, so the arrival at the far end is silent.
  **Leaving this to the watcher made the removal LOSABLE, and that was the bug.** `suppress()` is
  keyed on the PATH ALONE and holds for a second, so any write to the same note in the preceding
  second — the editor's own 600 ms-debounced autosave, a publish toggle, the PUT behind Ctrl+S —
  swallowed the `unlink` that was the only thing telling the indexer the note was gone. Measured:
  PUT then DELETE on one path, 0–200 ms apart, left a note in the index, the graph and the search
  results with **no file behind it**, still resolvable by `[[wikilink]]` and impossible to remove
  (a second DELETE 404s, because the file really is gone). Reachable by hand in one gesture: type
  a word into a note, then delete it. Both formats, both verbs.
- **The route awaits `whenIndexed()`** before answering, like `DELETE /api/folder`: the client
  refetches `/api/tree`, `/api/graph` and the published count on this 200, and a note still in the
  index when those answer is a note the reader sees a second time in their own search results.
- Vault API: `deleteNote(rel, opts?: { permanent?: boolean }): Promise<{ trashPath? }>`.

## Folder deletion (server, shipped)

`DELETE /api/folder?path=<rel>&permanent=<bool>` → `{ notes: number, trashPath?: string }`

- **Admin only.** Guarded by the standard `authGuard` rule (every non-GET 401s without an admin
  session) — visitors and admin sessions sending `X-Astrolabe-Preview: visitor` both get
  `401 {"error":"Admin session required"}`.
- **Default (Obsidian-safe):** the folder is *moved* to `.trash/` at the vault root (created on
  demand). Name collisions get a counter: `guides`, then `guides-2`, `guides-3`… `.trash` is a
  dot-dir, so it is already invisible to the tree, indexer and watcher — trashed notes vanish from
  search/graph/backlinks/tags but the files are recoverable from disk.
- **`permanent=true`** (also `1`/`yes`/`on`) → `fs.rm` recursive; no `trashPath` in the response.
- `notes` = count of `.md` files that were inside (recursive, ignore rules applied) — for the UI copy.
- Errors: `400` missing/empty `path`, traversal (`..`), ignored trees (`.trash`, `.obsidian`, …),
  or a path that is a file; `404` when the folder does not exist.
- **Events:** exactly one synthetic `VaultEvent` `{kind:"deleted", path:"<rel>", dir:true}` on
  `/api/events`; the watcher's per-file `unlink`/`unlinkDir` echoes for the same removal are
  suppressed. The index (minisearch, graph, backlinks, tags, publishedSet) is updated *before* the
  response returns (`await whenIndexed()`), so a `/api/tree` + `/api/graph` refetch straight after
  the 200 is already correct — no debounce race.
- Vault API: `deleteFolder(rel, opts?: { permanent?: boolean }): Promise<{ notes, trashPath? }>`
  in `server/vault.ts`; trash dir name exported as `TRASH_DIR`.

**Client wiring (shipped).** `api.deleteFolder(path, permanent)` → `state.deleteFolder(path,
{permanent})`, offered as "Delete folder" on folder rows of the sidebar context menu (admin
only, never on the root row — the server 400s an empty path). The store action closes every open
tab whose path starts with `<folder>/` **before** `loadTree()`, then toasts (`folderTrashedToast`
naming .trash recovery, or `folderDeletedToast`).

The two speeds are two dialogs rather than the checkbox sketched here originally: the default
confirm ("Move “name” to .trash?", danger button *Move to .trash*) carries a third, deliberately
quiet route — `ConfirmOptions.extraLabel`, which resolves `confirmModalEx()` as `"extra"` — and
that opens a SECOND confirm with the permanent copy. A checkbox would have let one click arm an
irreversible erase of a whole subtree; a quiet-affordance-then-confirm makes the reader say
"permanently" twice.

**The counts come from `/api/delete-preview`, and there are two of them.** The body now reads
"The folder and its contents — 0 notes and 4 files — move to the vault's .trash folder", because
counting only markdown is what cost a published essay its images: see "Delete previews" below,
which is the section that owns this number and the warning line under it. The client's own
`countNotes` is no longer consulted here — it could only ever see the half of the folder the
tree calls a note.

**A single note deletes at the same two speeds, from both surfaces.** `DELETE /api/note` grew
the folder route's `?permanent=` (same `1/true/yes/on` parsing, same `.trash/` destination),
and the client side is the folder pattern verbatim: `api.deleteNote(path, permanent)` →
`state.deleteNote(path, {permanent})`, driven by `confirmModalEx` with `extraLabel: Delete
permanently` and a second, `grave` dialog behind it. Both entry points — the tree's context menu
and the palette's *Delete note* — run the identical pair, and since "Delete previews" landed they
run the identical FUNCTION (`deleteFlow.ts`), because a command must not be the
harsher one merely because it was reached from the palette. Until this landed, one dialog said
"This cannot be undone" over an `fs.rm` while the folder one line above it in the same context
menu promised `.trash` — the same gesture, two different guarantees, and the harsher one applied
to the object an owner deletes most often. **The palette ROW says the same thing the dialog
says.** Its hint is `cmdTrashHint` — *moves to .trash* / «ينقلها إلى ‎.trash‎» — because it used
to read `cmdIrreversibleHint` (*irreversible* / «لا رجعة فيه»), left over from the `fs.rm` era:
the reader was told the gesture could not be undone one keystroke before a dialog promised
`.trash`, which is the two-guarantees-for-one-gesture defect this section exists to remove,
wearing a smaller hat. `cmdIrreversibleHint` is gone from the dictionary — no command is
unconditionally irreversible any more, and check-i18n fails a dead key. The store action closes the tab, reloads the tree,
refreshes backlinks, refreshes publish state (a published note leaving the vault changes the
public site) and toasts `noteTrashedToast` / `noteDeletedToast`.

**The second dialog must LOOK like the second dialog.** `ConfirmOptions.grave` (Confirm.tsx) is
what carries the escalation, and it is safety, not styling: the danger button is filled
`--danger` **at rest** instead of wearing the brand gold, the panel takes a red-tinted hairline,
and the button is **not pre-focused** — a `grave` dialog opens on Cancel and answers Enter only
from the danger button itself. Saying "permanently" twice does nothing if both dialogs are
pixel-identical gold-outlined buttons that Enter confirms; the one that erases 1,214 notes from
disk must never be one stray keypress away. `Rename` is offered on NOTE rows only — `/api/rename`
is a note route and 400s on a folder or an attachment — so every menu holds only actions that
work. The DELETE verb, by contrast, is now offered on all three kinds, each pointing at its own
route: *Delete* on a note, *Delete file* on an attachment (see "Attachment deletion"), *Delete
folder* on a folder, never on the root row.

Server side, `deleteFolder` lstats before it counts: a symlinked folder is a link, `fs.rename` /
`fs.rm` unlink it without touching the target, so it reports `notes: 0` rather than describing a
tree outside the vault that the call will not touch.

## Delete previews (server indexer + `/api/delete-preview` + client dialogs)

**The dialog counted markdown and the folder held images.** The owner moved a note out of its
folder, deleted the now note-less folder, read "0 notes" and shipped a published essay with four
broken embeds — the folder still held the four images that note used, and the confirm had no way
to know because it only ever counted `.md`. The indexer has always known which notes point at
which attachment (it is the same walk that decides what `/api/file` will serve an anonymous
visitor); nothing destructive was asking it.

- **`GET /api/delete-preview?path=<rel>` → `DeletePreview`** (`shared/types.ts`):
  `{ kind: "folder"|"note"|"attachment", notes, attachments, referenced, referrers[], referrerCount }`.
  Admin-eyes-only — the referrer list names vault paths, exactly what `/attachments` and
  `/published` withhold — so it takes their `404`-not-a-route gate, not a `403`.
- **`referenced` counts what a SURVIVOR still points at.** Notes *inside* the target go with it,
  so a link from one of them is not a link that will break: the folder branch subtracts its own
  notes before counting. A folder whose images only its own notes use reports `0` and gets no
  warning — a warning that is always on screen is furniture, and a reader stops reading furniture
  long before the one time it is true.
- **Counts come from the server's walk of the files the delete will actually move**
  (`listVaultFiles(relFolder)`, same ignore rules as `deleteFolder`), never from the client's
  tree. The client tree was the source of "0 notes".
- **Indexer:** `notesReferencing(attachmentRel)` (attachment → the notes that embed or link it,
  published or not) and `notesLinkingTo(noteRel)` (the `[[wikilink]]` half, one object over).
  The reverse map is lazy and cached beside `allowedAttachments()`; **both caches are dropped by
  the one `invalidateRefCaches()`**, because every mutation that changes either answer changes
  both. The per-note walk itself is `collectAttachmentTargets()`, shared by the publish allowlist
  and the reference map **so they cannot drift**: a file the allowlist serves but the delete
  dialog cannot see is the whole bug, wearing a different hat.
- **`ConfirmOptions.warn`** (Confirm.tsx) renders the collateral as its own danger-tinted line
  under the body — a different KIND of sentence from `body` (which describes the action), and it
  has to be able to look different from the calm line above it. The line's TEXT stays `--text`,
  not `--danger`: a whole paragraph in the danger hue is a colour the reader stops seeing, and
  several themes solve their danger against the ground for a button fill rather than for prose.
- **The English warnings are passive** — "Embedded by {notes}", not "{notes} still embed this
  file". `{notes}` is a count phrase as often as it is a name, so an active verb must agree with
  a number the string cannot see; the first draft shipped "“The Moved Essay” still embed this
  file" whenever exactly one note was named, which is a typo in the one sentence whose entire job
  is to be believed. Arabic keeps its verb-first form, where a non-human plural takes the
  feminine singular and both counts already agree.
- Referring notes are **named when few** (≤ 3, and only when the sample is the whole set) via
  `Intl.ListFormat` in the instance's language, each name separately bidi-isolated; past that
  they are counted. The server samples five, so a count is always available.
- **A preview failure is not fatal.** The dialog still opens, without the collateral line.
  Refusing to let someone delete a file because a preview endpoint hiccuped is a worse product
  than one that occasionally warns less.

**One implementation of every delete dialog: `client/components/deleteFlow.ts`.** Three objects
× two surfaces × two speeds is twelve dialogs, and when each surface built its own the guarantees
drifted — the palette's *Delete note* said "irreversible" over the act the identical tree menu
item promised was recoverable. `confirmDeleteNote` / `confirmDeleteAttachment` /
`confirmDeleteFolder` are the only entry points, both surfaces call them, and `twoSpeeds()` is
the single copy of the recoverable-then-`grave` shape. Titles are shared too
(`moveToTrashTitle` / `permDeleteTitle`): six near-identical strings free to drift one edit at a
time is how the stale hint happened. **The palette hint and the dialog say the same thing** —
`cmdTrashHint` is *moves to .trash*, checked against these dialogs whenever either changes.

**Store deletes toast a LOCALIZED failure.** `guarded(label, fn, failMessage?)` in `state.ts`
takes an optional localized line. It used to fall back to `err.message`, which CONTRACTS says above
is English log prose no UI may print — an Arabic operator whose delete failed read "Note not found:
x.md" inside a fully Arabic panel — and its second fallback built a sentence out of the English
`label` this function takes for the CONSOLE, so a non-Error rejection put "toggling publish failed"
on screen in a string no translation table has ever held (v1.8 F45). Both are gone: the fallback is
`actionFailed`, and the diagnosis stays in the `console.error` beside it. The three delete verbs
still pass `couldNotDeleteNote` / `couldNotDeleteFolder` / `couldNotDeleteFile`, and a caller that
can say something more useful still should.

**A delete that can be undone offers it (v1.8 F24).** `deletedToast(get, message, trashPath)` in
`state.ts` is the single seam: a non-permanent delete answers with `trashPath`, whose BASENAME is
the trash entry's id, so the Undo is `restoreTrash(entry)` — the machinery the trash browser has
always used — and the result toast is that browser's own `restoredToast` / `restoredRenamedToast`,
because a restore that quietly went somewhere else is the lie the delete previews exist to stop
telling. A PERMANENT delete keeps the plain sentence: there is nothing behind it, and an Undo that
cannot undo is worse than none. The three trashed-toast strings lost their "— restore it from the
trash browser" tails when the button arrived; the bin is still in the palette for the reader who
lets the nine seconds run out.

## Attachment deletion (server, shipped)

`DELETE /api/attachment?path=<rel>&permanent=<bool>` → `{ ok: true, trashPath?: string }`

- **The tree listed them and offered no verb on any of them.** A vault's images, PDFs and
  recordings have been in the tree since attachments landed; the only way to remove one stale
  upload was to delete the folder around it — which is precisely the gesture that took a
  published essay's figures with it.
- Same two speeds, same `.trash/` destination and same `1/true/yes/on` parsing as the note and
  folder routes. Admin-only via the auth guard.
- `400` on a `.md` path (`assertAttachment` — that is `/api/note`'s job) or an empty one; `404`
  when it is not there or **is not a regular file**: `lstat` + `isFile()`, so a symlink is not an
  attachment and the rename cannot move a link while the dialog described its target.
- **Events:** one synthetic `{kind:"deleted", path}` emitted by `deleteAttachment`, with the
  watcher's own unlink suppressed, and the route `await whenIndexed()`s — so the `/api/tree`
  refetch straight after the 200 is already correct. `visitorEvents()` drops non-`.md` events, as
  it always has.
- Client: `state.deleteAttachment` reloads the tree, refreshes **publish state** (a published
  note embedding the file now points at a 404 on the public site) and clears the broken-embed
  cache, then toasts `fileTrashedToast` / `fileDeletedToast` — Arabic's own pair, because a ملف
  is masculine where a ملاحظة is feminine and the note's line would print "نُقلت" over a file.

## Trash browser (server `.trash/` API + TrashModal)

**Every delete dialog promised a bin the product could not reach.** "Recoverable from disk" was
true and useless: `.trash/` is a dot-dir that the tree, the indexer and the watcher are all built
to ignore, so honouring the promise meant handing the owner a terminal. A safety net nobody can
reach is a safety net in the sense that a locked fire exit is a fire exit.

- **`GET /api/trash` → `TrashEntry[]`**, newest first:
  `{ name, origin, kind, deletedMs, notes, attachments, bytes, originTaken }`. Admin-only via the
  same `404`-not-a-route gate `/attachments` takes — the listing names deleted vault paths.
  A missing `.trash` is an **empty bin, not an error**.
- **`POST /api/trash/restore` `{ name }` → `{ ok, path, renamed }`**; **`DELETE /api/trash?name=`**.
  Both ride the auth guard (401 for visitors and preview sessions).
- **The entry NAME is an id, not a path.** `trashEntryAbs()` refuses separators, `..`, NULs, the
  empty string and anything **dot-prefixed**, then re-checks containment against the resolved
  string; the caller `lstat`s, so a symlink inside the trash is not an entry. A real vault entry
  can never begin with a dot (`isIgnoredSegment` keeps those out of the vault), so the dot rule
  costs nothing — and it is what stops the manifest itself being restorable or purgeable.
  `safeAbs()` cannot be used here: it 404s everything under `.trash` by design, which is the rule
  that makes the bin invisible everywhere else and must stay.
- **Origins are recorded, so Restore is a restore.** `.trash/.astrolabe-trash.json`
  (`{version, entries: {name: {origin, deletedMs, kind}}}`) is written by every trashing delete.
  Writes are serialized on one chain — two deletes in the same tick would read the same file and
  the second write would drop the first entry, losing the origin of the folder somebody is about
  to need back. A failed manifest write **never fails the delete**: it degrades that entry to
  "origin unknown" and is logged. A missing or corrupt manifest degrades the whole bin the same
  way, which is exactly the pre-manifest behaviour.
- **Restore lands at the origin, beside it, or at the vault root** — and says which. A taken
  origin gets the trash's own counter (`Linker.md` → `Linker-2.md`), an unrecorded or now-invalid
  origin falls back to the entry name at the root, and the answer's `renamed` flag drives
  `restoredRenamedToast` instead of `restoredToast`. The browser prints the destination **before**
  the click too (`trashFrom` / `trashOriginTaken` / `trashOriginUnknown`), because a "restored"
  that quietly went somewhere else is the same species of lie as a delete that quietly took four
  images with it.
- **A restored folder is indexed before the response returns.** `indexUnder(rel)` (indexer) walks
  the subtree — the mirror of `removeFolder()` — and the route emits `{kind:"created", dir:true}`.
  `visitorEvents()` **fans that out into one `created` per visible note**, sampled AFTER
  `whenIndexed()` (the mirror of the delete fan-out's sample-first discipline): without it a
  visitor's sidebar was missing published notes the site was already serving.
- **`.trash/` still never reaches the remote** — `gitSync`'s pathspec eviction covers the whole
  directory, manifest included. Nothing in this section changes that guarantee.
**Stacking: the confirm dialog is the top of the product, and it was not.** `.s-confirm-overlay`
sat at `z-index: 130` while the mobile sidebar drawer (deleted in 3.27.0) sat at `400` and its
backdrop at `390`, and the delete dialogs were opened FROM it — so on a phone "Move “Essay Assets”
to .trash?" rendered *underneath* the drawer that launched it, with Cancel and the danger button both unreachable and a dimmed sliver
showing past the drawer's edge. Every `promptModal` shares that host, so New note, New folder and
Rename were in the same hole; the only escape was `Esc`, on a device with no `Esc` key. The
overlay is now **500**, above everything, which is structural rather than cosmetic: every other
layer can spawn a confirm, so anything that can paint over one is a dialog the reader cannot
answer. **Anything new that covers the viewport goes below 500** — the trash browser takes `420`
(below the confirm, so its purge dialog stacks on it).
*That "known and deliberately not fixed" note is now closed, and the whole ladder has names.*

### The stacking ladder (`--z-*`, `client/styles/tokens.css`)

The phone shell's sheets sit at `--z-panel` and its questions at `--z-confirm` — [The phone shell](shell.md#the-phone-shell-clientphone-clientshellqueryts-3260-finished-in-3270).

Every rung lives in `:root` with the reason beside it, and **no z-index at or above 300 may be
written as a literal anywhere in `client/styles`** — `check-a11y` rule 7 fails one that is, unless
the line (or the line above it) says `z-ok:`. There is one waiver, `.s-preview-strip`, which is a
sticky ROW inside the flow and not a layer over the viewport. Below 300 is local stacking inside a
pane and the ladder does not govern it.

    --z-menu-scrim 299 · --z-menu 300 · --z-find 320
    --z-palette 410 · --z-panel 420 · --z-toast 430 · --z-popover 440 · --z-capture 450
    --z-confirm 500 · --z-hovercard 500 · --z-crash 900 · --z-skip 1000 · --z-eye (above all)

The three arguments the numbers settle, each of which had been decided twice:

- **The palette is above every menu and below every panel (410).** `.s-palette-overlay` is not the palette's alone:
  the theme picker, the shortcuts sheet, the template picker, the layout picker, what's-new, the
  tour, the theme builder and the new-deck sheet all reuse it, so its number is the number of every
  full-viewport sheet in the product. At 100 it sat under the phone drawer that opened it (the
  drawer and its 390/400 rungs went in 3.27.0) — measured, `elementFromPoint` at the palette's own
  centre returned a tree row — under the sync
  popover at 120 and under the menus at 300. It is still below the panels it can open (420), the
  toasts it can raise (430) and the confirm it can ask (500).
- **An anchored popover's action row outranks a transient (440 > 430).** The toast contract puts a
  transient over the panel that raised it; `.s-syncpop` is the exception it names, because its
  buttons are buttons — a long toast ("Bookmark removed") printed straight across *Backup settings*
  and *Sync now*, an action the reader could see and could not press.
- **A menu gets a ground on touch (299).** The scrim sits one rung below the menu it dims the page
  for, never over it.

**A full-viewport sheet also CLOSES what it covers.** Ctrl/Cmd+P is a keystroke, so none of the
outside-mousedown listeners see it: the sync popover stayed lit over the palette's own backdrop
(it is two rungs higher now, which makes this required rather than tidy), and a context menu sat
under the backdrop still pointing at a row, waiting to be uncovered. `ContextMenu` and `SyncBadge`
watch `paletteOpen` and stand down; the imperative heading menu dismisses on any keydown carrying
a modifier, since none of its own keys use one — **except a modifier pressed alone**, which reports
`ctrlKey` on its own keydown and is not a keystroke yet: closing there took the menu away from a
reader still spelling the shortcut, and from anyone whose layout puts AltGr (Ctrl+Alt) on the way
to a letter.

- Client: `TrashModal.tsx` + `styles/trash.css`, opened by the palette's *Open trash*
  (admin, not in preview) and cleared from the store on logout and on entering visitor preview.
  Rows carry Restore and a `grave`-confirmed erase; the header carries "Empty trash" behind the
  same `grave` dialog. In-flight names disable their own row's buttons, so a double click cannot
  fire two restores of one entry and toast a failure about something that succeeded. The list is
  **refetched from the server** after every mutation, never optimistically emptied: an entry that
  failed to go stays visible instead of vanishing from a list that lied about it.

## Attachments (location setting, any-file upload, delete impact)

`shared/attachments.ts` is the single policy both halves import: the four location modes, the
folder validator, and the accepted-type table. Neither side may keep its own copy.

**Where an upload lands is a setting, and it is Obsidian's setting.** `settings.attachments =
{ mode, folder }` mirrors "Default location for new attachments": `vault-root`, `same-folder`
(beside the note being edited), `subfolder` (a named subfolder OF the note's folder), and
`specified` (one fixed vault-relative folder). **`specified` + `ATTACHMENTS_DIR` is the default**,
so an upgrade changes nothing until an admin says otherwise — which is why `PATCH` *deletes*
`attachments.mode` when it is set to `"specified"` rather than storing it.

- `site.ts::attachmentLocation()` merges the stored value over the env default; `uploadDirFor(dir)`
  resolves it against the folder the upload happened in. `POST /api/upload` takes that folder as
  the optional multipart field **`dir`** — the editor sends the open note's folder, the tree drop
  sends the row it was dropped on, the pickers send the open note's folder. `dir` is untrusted:
  it is normalized, and `safeAbs` on the joined result is what actually refuses traversal and
  ignored trees (verified: `dir=../../etc` → 400, `dir=.obsidian` → 404).
- The folder value is refused for the same reasons a vault path always is (traversal, absolute,
  control characters) **plus dot-folders** — a dot-folder is invisible to the tree, the indexer
  and the watcher, so an attachment written into one would never resolve again. `folderError()`
  returns a REASON KEY, not a sentence: the server renders it into a 400, the settings panel
  into localized inline copy, and the two can never drift apart. **The RAW value is judged before
  it is cleaned.** `cleanValue()` REPAIRS control characters (every run becomes a space), so
  running it first made `FOLDER_PROBLEM.control` unreachable: `PATCH {attachments:{folder:"med\0ia"}}`
  answered 200 and stored the folder `med ia`, which is not what this line says happens. Nothing
  unsafe reached the disk either way — the bug was an API storing a folder the author never
  typed. A trailing newline is still tolerated (`folderError` trims first).
- **Existing attachments are never moved.** The setting decides where the NEXT upload goes;
  embeds resolve by basename, so nothing breaks either way. Fonts (`ASTROLABE_DATA/fonts`) and
  `custom.css` keep their dedicated locations.

**Every type the vault can hold, sniffed by bytes.** `sniffAttachmentType(buf, hint)` in
`server/fileRoutes.ts` decides the stored extension from magic numbers — images, PDF, audio, video —
and the `hint` (the uploader's own extension) only ever picks between aliases the bytes cannot
distinguish (`jpg`/`jpeg`, `ogg`/`oga`/`opus`, `mp4`/`m4v`). The raw-MPEG-frame test for a
tagless mp3 is `0xFF 0xEx`, two weak bytes, so it is checked LAST, after every format with a
real magic number. SVG still has no magic bytes and is still scrubbed at write time.
`isAcceptedAttachment()` is the client's mirror, and it exists so a file the server would
reject is **refused before it is uploaded**, naming both what was turned away and what is
welcome; a mixed batch asks (a half-finished drop nobody agreed to is its own surprise), an
all-refused batch just says so.

**Deleting is NOT specified here.** This section was written with a `GET /api/impact` route and
an `impactSentence()` beside it, for the same reason the section above exists: a folder holding
four images and no notes truthfully answered "0 notes" and took four figures out of a published
essay. That question now has one answer — `GET /api/delete-preview` and
`client/components/deleteFlow.ts`, documented under "Delete previews" above — which covers notes,
folders AND single attachments and feeds every dialog in the product. The impact route, its
`DeleteImpact` wire type and `attachmentReferrers()` in the indexer are gone with it. Two routes
answering one question is how two dialogs come to describe one delete differently.

`DELETE /api/attachment?path=&permanent=` (admin only, documented under "Attachment deletion")
is what backs the drop's **Undo** — which trashes rather than erases, since an undo that erased
would be worse than the drop it undoes — and the × on the banner picker's rows, which routes
through `confirmDeleteAttachment()` and therefore carries the same "still embedded by…" warning.

## Attachments in the tree (server tree + sidebar + viewer)

A vault is not only `.md`. The tree used to list markdown and nothing else, so `Media/` — 1,158
images in the fixture this was built against — appeared as a folder that expanded to **nothing**,
and the owner of a real instance read that as lost files. Fixing it is three pieces:

- **`TreeNode.attachment?: AttachmentInfo`** (`shared/types.ts`) — present on non-markdown FILE
  nodes only: `{ kind: "image"|"pdf"|"audio"|"video"|"other", ext, size }`. **Its absence is the
  definition of "note"**, and every consumer that wants notes only says so: `countNotes()` in the
  sidebar checks the marker, `collectNotes()` in `client/editor/links.ts` filters on the `.md`
  suffix of `path` (which is why the palette, router, daily notes, wikilink resolution and the
  published-filter list needed no change at all). Anything new that walks the tree must pick one
  of those two filters deliberately.
- **`buildTree()` sorts folders → notes → attachments**, alphabetical within each band, so a
  folder still opens onto its writing. Attachments cost one `fs.stat` each — for `size`, which the
  viewer prints — and the stats of one directory run concurrently; the full 1,388-note /
  1,176-attachment fixture serves `/api/tree` in ~60 ms.
- **The visitor tree carries none of it.** `publishedTree()` is built from `publishedNotes()`, so
  no filename outside the published set is ever named to a visitor or to an admin previewing as
  one — whatever the sidebar filter is doing at the time. Attachment BYTES stay gated where they
  always were, on `/api/file`'s `isAllowedAttachment()` check: a visitor asking for a real but
  un-allowlisted file gets the same `404 {"error":"File not found: <path>"}` a missing file gets.
  The viewer only ever fetches that route, so it cannot show what the server will not serve.
- **The publish allowlist covers BOTH embed syntaxes.** `allowedAttachments()` built the visitor
  allowlist from `record.links` + the banner, and `parseLinks()` fills `links` from
  `wikilinkRegex()` alone — so `![[x.png]]` was allowlisted and `![alt](Media/x.png)` never was,
  while the renderer turns the second straight into `/api/file?path=Media/x.png`
  (`resolveRelative()` in `client/editor/embeds.ts`, used by `client/reading/render.ts`). Every
  standard-markdown image in a published note 404'd to every visitor: the admin saw the picture,
  the visitor saw a placeholder, and nothing said why — a silent public-site breakage of exactly
  the invisible-state kind, against a promise `OBSIDIAN-COMPAT.md` and `README.md` both make.
  `NoteRecord.assets` now holds those destinations, resolved against the note's own folder by
  `parseAssets()` — the server-side twin of `resolveRelative()`, matching the SAME regex shape the
  two renderers use, so the allowlist covers exactly what the page will ask for and no more.
  External schemes are skipped and a path that climbs above the vault root is dropped rather than
  clamped. It still fails CLOSED: an attachment no published note points at stays a 404.

Client side (`Sidebar.tsx`, `AttachmentViewer.tsx`, `styles/attachments.css`):

- **Attachment rows are quieter than note rows STRUCTURALLY, not by contrast.** They carry a 14px
  type glyph in the chevron's slot, keep their extension in the label (it is half of what the
  name says), sit under the folder's notes, answer to the paperclip filter, and carry the full
  name as a `title` — the pane is 292px and these names are not. The NAME itself rests on
  `--text-muted` (`--text` on hover), like a note row: a filename is text, it is 14.4px, and on
  `--text-faint` it measured 3.3:1 at best and 2.50:1 on parchment. Only the type glyph is
  `--text-faint`, and at full opacity — the 0.85 fade it used to carry put it at 2.56:1, under
  the same 3:1 bar the fold chevron is held to. Same for the extension badge (10px uppercase,
  `--text-muted`) and the footer counts.
- **The filter is visible in both states.** "Show attachments" lives in the sidebar footer as a
  paperclip beside the counts (`localStorage["astrolabe.show-attachments"]`, default ON, admin only)
  and in the tree's context menu. ON: gold clip, "1,176 files". OFF: grey clip, "**1,176 files
  hidden**" — in words. A filter that removes a thousand rows and says nothing is the bug this
  round is about, so a folder the filter has emptied also grows one italic row, *"18 files
  hidden"*, which turns the filter back on when clicked. No folder ever opens onto nothing again.
- **One level of the tree renders at most `CHUNK` (300) rows**, then a "Show N more" row.
  `TreeChildren` owns the filter, the cap and the `siblings` array (memoized, so it does not bust
  `memo()` on rows that did not change); `TreeRow` renders one row. Expanding the 1,158-image
  folder measures ~70 ms end to end. This applies to notes too — the same fixture has a 715-note
  folder.
- **The nav handles sit on a fixed `rgba(0,0,0,.72)` scrim, so they cannot be painted as if they
  were on the page.** `--bg-raised` is a near-black on every dark theme, which made
  the only way to walk a 60-image folder the lowest-contrast control in the product: dark circles
  on a dark wash. They take an accent-tinted ground, a lit rim and a `--text` glyph, and fill with
  the accent on hover. The `N / M` position indicator had two `.s-att-view__pos` blocks, the
  second overriding the first down to `--text-faint`, so the one number answering "how much more
  is there" was fainter than the filename beside it; one block, `--text-muted`.
- **The viewer is a portal onto `<body>`**, not a child of the sidebar: the sidebar is a grid pane
  that animates its own width and clips its overflow. It shows the image at natural size capped to
  the viewport (never upscaled), one caption line — name · `PNG · 1,045 × 657 · 92 KB` · position
  · open-in-tab · download · close — and `←`/`→` walk the folder with wrapping. Pixel dimensions
  come from the loaded `<img>`; the byte size comes from the tree, so the viewer makes no second
  request. **Esc and the arrows are bound in the CAPTURE phase**, like the confirm dialog, so the
  viewer outranks zen's Esc and every editor binding while it is open.
- **PDFs never enter the carousel.** A click opens `/api/file` in a new tab (browsers render PDFs
  better than we can), so a PDF is also skipped by the arrows rather than appearing as a card the
  arrows can land on. Audio and video get an inline player; anything else shows an extension card
  with a download.
- **RTL:** the caption bar and nav buttons are logical (`inset-inline-*`), the `‹`/`›` glyphs are
  `Bidi_Mirrored` and therefore carry **no** transform, and the arrow KEYS answer the physical
  layout — in an RTL shell `ArrowLeft` is *next*. Sizes print through `localeNum()`, with the
  Arabic decimal separator (U+066B) on the one decimal `formatSize()` emits.

## Smaller rules

- **`tagLabels` is capped at 200 ENTRIES**, the number its sibling `excludeTags` has capped its
  length at since the day it was written. Per-key (50) and per-label (60) budgets existed; the map
  size did not, and a 5,000-entry PATCH was accepted with a 200 — `settings.json` grew to 378 KB
  and `GET /api/settings` to 489 KB, a response the settings panel fetches every time it opens.
  Visitor exposure was correctly nil throughout (`/api/tag-labels` stayed at 46 bytes), which makes
  it a self-inflicted wound rather than a hole. The 400 names the other half of the feature: a tag
  with a page in the tags folder is named there instead.
- **An absolute path in a vault path key is a 400, not a rewrite.** `normalizeRel()` strips the
  leading slash before `path.isAbsolute()` could ever see one, so `{"templatesFolder":"/etc"}`
  came back 200 stored as `etc` and `{"defaultTemplate":"/etc/passwd.md"}` as `etc/passwd.md`.
  `safeAbs()` kept both inside the vault so nothing escaped — but the admin who typed an absolute
  path silently got a DIFFERENT folder from the one they named, while `..`, a dotdir and a
  note-where-a-folder-belongs all answered with a clear 400. `vaultRel()` is the one helper
  `templatesFolder`, `defaultTemplate` and `home.note` share; Windows drive letters are refused
  the same way.
