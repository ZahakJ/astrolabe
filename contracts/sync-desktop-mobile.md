# Sync, the desktop app, and the phone's pocket vault

Everything that carries the vault somewhere else: settings that travel, git backup and sync, the desktop app and its updates, and the Android shell's pocket vault. Part of the module contracts (see [CONTRACTS.md](../CONTRACTS.md) for the map). **Edit the area, append nothing:** a change to how something works is written HERE, in the section it changes, and the old sentence goes; a release gets one line in [releases.md](releases.md), never an addendum.

## Settings travel with the vault (server/prefs.ts, client/prefsSync.ts)

- The Device-tab preferences (an allowlist in `client/prefsSync.ts`, pinned by
  `tests/prefs.test.ts`: theme, site-theme, lang, editorLang, vim, editorWidth, editorWidthCustom,
  headingNumbers, selToolbar, sidebarSide, show-attachments, graph, comment.author, whatsnew,
  relativeLines, tags-sort, frenchAutocorrect — and, since 3.18.0, the three the owner said yes
  to: `library` (where each course was left), `properties` (the properties panel's choice) and
  `reading` (reading mode), by the same argument as a book's page: a position is the reader's,
  not the machine's) are mirrored to `<vault>/.astrolabe/prefs.json` as a map of localStorage
  key → `{ v, t }`. Window state (tabs, workspace, pane widths, tags height,
  recents, folds, every `*-collapsed`, window identity) NEVER travels. Adding a key to the
  allowlist is a decision about every device the owner has, not a convenience.
- Merge is per key, newest `t` wins, ties keep the file's copy, `v: null` is a tombstone. Both
  halves implement the same rule; `tests/prefs.test.ts` pins the server's.
- The client pulls ONCE, before React mounts (`client/main.tsx`), and writes newer keys into
  localStorage through the unpatched `Storage.prototype` methods so the pull never pushes. THE
  FIRST PAINT SEES THE PULL: the store reads vim, relative lines, reading mode, the sidebar's
  side, the editor language and the theme from localStorage at import, which is BEFORE the pull
  resolves (imports hoist), so when the pull changed any key `main.tsx` calls
  `reloadPrefsFromStorage()` (client/state.ts) before `createRoot` and the store re-reads them.
  Before 3.18.0 a fresh device painted the old side on its first load and the vault's on its
  second (measured, maturity brief §4.1). `lastPull()` says when the pull ran and how many keys
  it applied, for the travel row. Pushes
  come from a patch on `Storage.prototype.setItem/removeItem`, only for `localStorage` and only
  for travelling keys, debounced 1.2 s, flushed with `keepalive` on `pagehide`. A 401/403 marks
  the session denied and stops every further request until the next pull succeeds.
- `GET/PUT /api/prefs` are admin-only both ways (`isPublishLimited` → 401): a visitor and an
  admin wearing the preview header get nothing. Keys must carry the `astrolabe.` prefix, match
  `^[\w.:-]+$`, and stay under 120 chars / 64 KB each, 200 keys, 512 KB file; anything else is
  dropped silently, never fatal — a hand-edited file must not lock every device out.
- The file lives INSIDE the vault (a dot-directory: never listed, indexed, watched or served) and
  not in `ASTROLABE_DATA`, because the point is every server over the folder — each machine's
  desktop app, the hosted instance the phone opens — reading the same one, carried by whatever
  carries the notes. `Settings → Device → Settings travel with the vault` is the per-device
  switch (`astrolabe.prefs-sync-off`, itself never synced).

## Instance settings travel with the vault (server/configMirror.ts)

- `settings.json`, `designs.json`, `custom.css`, `layouts.json`, `books.json`, `annotations.json`
  (`FILES`) and every file under `fonts/custom/` (`DIRS`: the uploaded faces with their
  `index.json`) are mirrored between `ASTROLABE_DATA` and `<vault>/.astrolabe/` at boot (awaited,
  before the first read) and every 5 s, both ways, newest mtime wins (`pickSource`, pinned by
  `tests/configMirror.test.ts`), mtime carried on copy so the sides settle. No merge. **FIRST
  CONTACT: THE VAULT WINS.** The first time this server compares a file against a copy the vault
  actually holds (`ASTROLABE_DATA/mirror-state.json` lists the files already met, keyed by the
  vault's realpath — a data directory pointed at another vault is first contact again), the
  vault's copy is taken whatever the mtimes say — a data directory that has never met the vault
  holds a machine's private defaults, and on 2026-09-07 a desktop's 31-byte settings.json, a day
  younger than the site's, overwrote the hosted instance's configuration within five seconds.
  Recovered from the vault's git history; never again by construction. A file the vault does NOT
  hold yet does not consume first contact (3.18.0: it used to, and the file's eventual arrival
  was then decided by clocks — the race the rule exists to prevent). A ledger the modules write
  at 0600 is set back to 0600 when it arrives from the vault (a git clone lands at 0644).
- **Fonts, with caps.** `DIRS` was `["fonts"]` from the day the mirror was written, and `fonts/`
  has held only two directories since 357202c, so no uploaded face ever travelled while three
  documents said it did (maturity brief §4.1). It is `["fonts/custom"]` since 3.18.0;
  `fonts/catalog/` NEVER travels — it is re-fetchable, and the receiving side warms it instead
  (below). A file over `FONT_UPLOAD_MAX_BYTES` (5 MB) is skipped, and once a directory's eligible
  bytes pass `DIR_TOTAL_MAX_BYTES` (40 MB, `index.json` counted first) the rest are skipped, so a
  hand-dropped 80 MB face never lands in git history. Every skip and every copy failure is a
  named `problem` on the pass, never a silent absence.
- **The receiving side warms its type.** After any pass that imported `settings.json` or
  `designs.json` from the vault, and once at boot, the catalog faces the slots and the active
  design name are fetched — `warmFonts()` in server/fonts.ts, the same
  `catalogSlotIds(fontSlots())` + `designCatalogIds(activeDesignFontRefs(), fontSlots())` the
  settings PATCH warms, fire-and-forget, logged on failure. Before 3.18.0 a fresh clone reported
  `ui: "lora"` with zero `@font-face` until someone opened Settings → Site.
- **Visible.** `GET /api/sync/travel` (admin-only, `isPublishLimited` → 401) reports each
  travelling item's presence on either side, the last pass (`at`, what moved, `problems`) and
  how many files have been reconciled; `POST /api/sync/travel` runs one pass plus the warm and
  answers the same. `Settings → Backup & sync → What travels`
  (`client/components/settings/TravelRow.tsx`) is the reader: a checklist per item, the last pass
  time, a **Re-sync now** button, a red line per problem, and one sentence naming what is still
  redone by hand on a new machine (the git token or SSH key, the admin password, screen warmth).
- NEVER mirrored: `git-credentials.json`, `comments.db`, `created.json`, `pdftext.json`,
  `session-epoch`, `author-sites.json`, `workspace.json`, `versions/`, `fonts/catalog/`,
  `ask-credentials.json` and `embeddings.db` (3.24.0: a key is a device's; the meaning index is a
  cache every machine rebuilds from its own Ollama), and `feeds.db` (3.28: what this server fetched
  and what its reader marked read; kept articles are notes and travel as notes). Adding a
  file to the list is a decision about every machine and about what a git remote will hold.

## Backup & sync (server/gitSync.ts)

`settings.gitSync { enabled (default FALSE), remote, branch (default "main"), intervalMinutes
(0–1440, 0 = manual), pullFirst (default true), authMode "ssh"|"token" }`, plus two WRITE-ONLY
PATCH keys — `gitToken`, `gitUser` — that never reach `settings.json`. Routes, all admin-only
(`GET /api/sync/status` gates on `isPublishLimited` like `/api/settings`, so an admin previewing
as a visitor is refused too; the POSTs are mutations the auth guard already 401s):
`POST /api/sync/init`, `POST /api/sync/now` (409 while one is running), `GET /api/sync/status`.

- **A pass that commits NAMES the commit.** `GitSyncResult.sha?` carries `git rev-parse --short
  HEAD`, read after the commit and through `gitTry` — a backup that worked must never be reported
  as a failure because `rev-parse` did. Absent when the pass committed nothing, when it failed, and
  on results recorded before the field existed. It exists because "Vault committed and pushed" is
  true of every successful pass this product has ever run and therefore reads the same after a
  chapter and after a stray space (v1.8 F40); the client's toast prints it via `syncPushedSha` and
  carries a **Backup** button that dispatches `astrolabe:sync-panel`, which `SyncBadge` answers by
  opening its panel and taking focus. The sha stays in its own isolate and its own numerals —
  never `localeNum()`, which would spell an Eastern Arabic digit into a string an operator is
  about to paste into `git show`.

- **Never a shell.** Every git call is `execFile("git", [fixed, argument, array], { cwd: vaultRoot })`.
  The remote is validated to `^https://` / `^ssh://` / `git@host:path` with no whitespace, no shell
  metacharacters, no leading `-`, and **no credentials in the URL** — a password is a 400 on either
  scheme, and a bare `user@` is a 400 on `https://`, which is exactly the shape a pasted token
  takes. `ssh://git@host/you/vault.git` is *accepted*: it is git's own spelling of the scp-style
  `git@host:you/vault.git` the same validator allows, that `user@` is not a secret, and refusing it
  while accepting its twin — with a message naming a token field SSH never consults — was a dead
  end for the commonest paste. But a `user@` that IS a secret is refused on every scheme: the same
  known token prefixes `scrub()` redacts on the way out (`gh[pousr]_`, `github_pat_`, `glpat-`)
  are tested against `url.username` and against the scp-style user part on the way in, raw and
  percent-decoded. The rationale for allowing `user@` was that it carries no secret; where that
  stops being true, so does the permission. The branch is a conservative `check-ref-format`
  subset. Neither can be an option, a command, or a second argument.
- **The git child's environment is scrubbed, not just its cwd.** `gitEnv()` deletes `GIT_DIR`,
  `GIT_WORK_TREE`, `GIT_INDEX_FILE` and the object-directory variables so the server's own
  environment cannot point git at another repository — and, for the same reason one level up,
  `GIT_CONFIG*` (including the indexed `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_n`/`GIT_CONFIG_VALUE_n`
  family), `GIT_SSH`, `GIT_SSH_COMMAND`, `GIT_PROXY_COMMAND` and `GIT_EXTERNAL_DIFF`: redirecting
  config redirects `core.hooksPath` and `url.*.insteadOf`, and redirecting the transport replaces
  the program git executes. The one legitimate use of the last group gets an explicit door instead
  of ambient inheritance: `ASTROLABE_GIT_SSH_COMMAND` is copied to `GIT_SSH_COMMAND` for the child,
  and nothing else is.
- **The token is a file, not a setting.** `ASTROLABE_DATA/git-credentials.json`, `0600`, asserted with
  `chmodSync` after the atomic rename (the create mode is masked by umask). `settings.ts::persist()`
  gets the same treatment for `settings.json` next door — mode on open plus an explicit `chmodSync`
  after the rename — because it holds operator-private configuration (the backup remote, the
  branch) and no reader but this process. It reaches git through
  `GIT_ASKPASS` + an env var on that one child — never argv (`ps` is world-readable), never the
  remote URL, never `.git/config` — and every network call carries `-c credential.helper=` so the
  machine's own credential store cannot cache it. Reads answer `effective.gitSync.tokenSet` only.
  `scrub()` redacts the stored token, any URL userinfo and known token shapes from every string
  that leaves the module: client errors, toasts and log lines alike.
- **A settings PATCH stays all-or-nothing across two files.** `gitToken`/`gitUser` validate during
  the patch and are *staged*; `patchSettings()` discards leftovers at the start and writes them
  only after `persist()` succeeds. A patch that 400s on a later key must not have changed the
  credential.
- **`.trash/` NEVER REACHES THE REMOTE.** The `.gitignore` seed used to write `.trash/` only when
  it created the file, and the append path for an EXISTING `.gitignore` bailed at
  `if (rel === null) return;` — `rel` being the data directory's path inside the vault, which is
  null in the default arrangement (`./data`, next to the app). So on the two commonest real vaults,
  "already a git repository" and "already has a .gitignore", `.trash/` was never ignored and
  `git add -A` committed and pushed it: deleting a 1,214-note folder became permanent history on
  the operator's remote, and the entire justification for the trash model ("recoverable from disk",
  "invisible to tree/indexer/watcher", *local*) quietly stopped holding. The base rules
  (`.trash/`, `.obsidian/workspace*.json`) are now appended unconditionally to an existing file,
  `seedGitignore()` runs on every pass rather than only when ASTROLABE_DATA is inside the vault, and
  a trash that an older build already committed is un-tracked (`git rm -r --cached
  --ignore-unmatch -- .trash`) before anything is staged — a rule alone changes nothing about what
  git already tracks. The eviction stages a deletion, so the next commit removes the trash from the
  tracked tree; anything an older build already PUSHED stays in the remote's history until the
  operator rewrites it, which is theirs to do and not something a backup tool may do for them.
- **…and the guarantee does not rest on an ignore rule, because an ignore rule is the vault's
  opinion.** The rule-level fix above is still wrong for one class of vault, and it was measured
  wrong: `hasRule()` reads a `.gitignore` that already carries a `.trash/` line as "already
  covered" and appends nothing, so a file reading `.trash/` then `!.trash/` un-ignores the trash —
  git's LAST matching rule wins — and `git add -A` committed `.trash/guides/…` again. The same
  hole exists for every other way an ignore decision can be overridden (`.git/info/exclude`, the
  operator's global `core.excludesFile`, a negation in a nested `.gitignore`). So staging is now
  a single function, `stageAll()` in `server/gitSync.ts`, and **nothing else in the module may run
  `git add`**: it runs `git add -A` and then `git rm -r --cached --ignore-unmatch -- .trash
  [<ASTROLABE_DATA rel>]`, evicting both paths from the INDEX. That command consults no ignore file
  at all, so no rule anywhere can put either path into the tree that gets committed, and the same
  call is what un-tracks a trash an older build already committed. `seedGitignore()` still appends
  `.trash/` to the vault's own file so a terminal `git status` is quiet — a courtesy, not the
  mechanism.
- **ASTROLABE_DATA never reaches the repo, and that is enforced against git's answer.** The token
  file lives in the instance data directory, which is outside the vault by default — but when it
  is INSIDE one, `seedGitignore()` runs unconditionally in `initRepo()` (not only when the vault
  was not already a repository) and APPENDS the data-directory rule to an existing `.gitignore`
  rather than returning early. The two commonest real vaults, "already a git repository" and
  "already has a .gitignore", used to get no rule at all and `git add -A` then committed and
  pushed `git-credentials.json` in plaintext. Belt and braces: `protectDataDir()` runs before
  every `git add -A` in both `initRepo()` and `syncNow()` — it re-seeds, evicts anything already
  tracked (`git rm -r --cached --ignore-unmatch`) and then asks `git check-ignore -q --no-index`,
  refusing the whole pass with a 400 if the answer is still "not ignored". `--no-index` is
  load-bearing: without it check-ignore answers "not ignored" for anything in the index, which is
  exactly the case being repaired.
- **Divergence fails; it never merges.** The pull half is `fetch` + `merge --ff-only`, not
  `git pull` — so no `pull.rebase` in the operator's gitconfig can turn it into a rebase, and a
  history that cannot fast-forward stops **before the working tree is touched**. Conflict markers
  written into a thousand notes by an unattended job are a worse outcome than a missed backup.
  Nothing here ever force-pushes.
- **`busy` is claimed in the same synchronous step as the check.** Every `await` is a yield point:
  a guard that sat before the first one let four concurrent clicks past it and into a fight over
  `.git/index.lock`. The final `gitStatus()` is sampled *after* the flag clears, so a successful
  answer never reports itself busy.
- **The timer is inert by default.** One 60s tick (unref'd), doing nothing unless enabled with a
  remote and a non-zero interval, skipping while busy, and logging a repeated failure **once**
  (`loggedFailure`) rather than once per tick, forever.
- **`ahead`/`behind` are `number | null`, and null is not zero.** `gitStatus()` can only count
  against `refs/remotes/origin/<branch>`, which does not exist until a fetch or a push has
  succeeded once — precisely the never-backed-up case. Leaving the `0` initializers there made
  that case read "0 ahead · 0 behind", character-for-character what a fully synced vault reads,
  in the one panel whose whole job is answering "is my writing somewhere else yet". The clients
  render null as "nothing has reached the remote yet".
- Client: `client/sync.ts` holds one shared status + subscribers (the status-bar badge, the
  settings block and the palette command all read it) plus `syncWhen()` and `syncCause()`, so the
  badge and the panel never drift on either the timestamp format or the diagnosis; the badge
  renders only for an admin session on an instance where sync is on and a remote is set. Our own
  success sentence is localized from `last.committed`; a FAILURE line is git's own words, shown
  verbatim — that text is the diagnosis, so it is rendered in its OWN `dir="ltr"` block with the
  localized timestamp and cause in their own `<bdi>` isolates beside it (one `dir="auto"` span
  over "date — message" takes its direction from the date and reorders git's English around it),
  and it is selectable text with a copy button, never a `title` tooltip. Counts and dates in these
  lines are separated by a hairline rule, never by a "·": the Eastern Arabic zero is itself a
  raised dot.

### Note history — the read half of the same repository

Backup & sync had been committing the whole vault since v1.6 and **nothing in the product could
look at what it kept**. That is the locked-fire-exit shape the trash browser was built to fix one
floor down, and it is why the undo of last resort ships FIRST in v1.8: the bulk editors that follow
it (vault-wide search & replace, tag rename) are what a note-taker most wants and least trusts,
because a bad vault-wide edit is unrecoverable.

- **Two read-only routes, both admin-only.** `GET /api/history?path=` answers
  `{ repo, revisions, truncated }`; `GET /api/history/blob?path=&sha=` answers one revision's
  bytes. Both 404 to a publish-limited session exactly as `/api/settings` does — a stranger
  learning that a published essay had eleven drafts, when each landed and what its commit message
  said, is a leak of the author's process even where the note itself is public. Neither is behind
  `assertCredentialed()`: that gate exists because a *sync* can send the whole vault to an address
  the caller chose, and reading is not that.
- **A vault that is not a git repository answers `repo: false`, not an error.** It is the state
  every first-run instance is in, and the honest reply is an invitation: the panel prints "Backup
  is off — turn it on to start keeping history" over a button that opens Settings **on the Backup
  row** (`openSettingsAt("rowSyncEnabled")`, the same index the moderation panel's door uses).
- **`--follow`, and therefore a path PER REVISION.** A rename must not throw a note's past away, so
  the log crosses renames — which means an older revision of a moved note is a blob under its OLD
  name, and `git show <sha>:<current path>` would simply miss. Every row carries the path its own
  blob lives under, and the blob route is asked for that one. It gets the identical treatment the
  note routes give any path: `assertNotePath()` then `safeAbs()` — `..` is a 400, a dotfile or
  anything outside the vault a 404 — before git is spoken to.
- **A revision id is a bare object name.** `isFullSha()` accepts 40 or 64 lowercase hex and nothing
  else, because the value is spliced into `<sha>:<path>`, which git parses as a revision spec:
  `HEAD`, `sha^`, `@{-1}` and a second `:` all mean something there. Size is checked with
  `cat-file -s` BEFORE the content is read, so a note somebody pasted a database into cannot become
  a 40 MB JSON body (2 MB ceiling, 413 past it).
- **The numstat is parsed in `-z` form.** The human spelling prints `dir/{old => new}/note.md`,
  which no parser should be asked to take apart; `-z` gives the rename as two NUL-separated fields.
  What the rows show is `+12 −3` — the spec's optional "sizes", decided as line counts, because a
  byte count of a markdown revision answers nothing a reader is asking and both numbers come out of
  the same single `git log` call. **There is no diff view**: a real one is a renderer, a stylesheet
  and a second modal state, and the whole revision is one tap away.
- **The section is COLLAPSED at rest and asks git nothing until it is opened.** `git log --follow`
  is a process, and an always-expanded panel would spawn one on every note opened, for ever, to
  fill a list most sessions never look at. The header is always visible (a door, never a hover
  reveal) and the choice persists in `localStorage`, so the reader who wants history pays for it
  and nobody else does. The whole panel is a dynamic import for the same reason — it carries a
  markdown renderer and a modal that a visitor can never reach.
- **Restoring is an ORDINARY EDIT.** It goes through `sectionActions::applyNoteContent`: one
  transaction into the open editor when one holds the note (undoable, and the existing autosave
  carries it to disk under its precondition), `putNote` when nothing does. Nothing here writes a
  special path. A restore is itself a revision, which is exactly why the toast's Undo is a SECOND
  restore — of the text that was on screen a moment ago, read buffer-first *before* the write —
  rather than a rollback verb this feature would have had to invent.
- **"Snapshot now" is one LOCAL commit** (`gitSync::snapshotNow()`, `POST /api/sync/snapshot`,
  palette row, offered on any vault that is already a repository whether or not backup is switched
  on). It is `syncNow()` with the two network halves removed and the identical
  `protectDataDir()` → `stageAll()` gate, because the one thing that must never differ between the
  two paths is what gets committed. It claims the same `busy` lock — two writers in `.git/index` is
  the fight that lock exists to prevent — and it does NOT record `lastResult`: the badge's sentence
  answers "is my writing somewhere else yet", and a local commit is not an answer to that. Its
  subject is `astrolabe snapshot:` rather than `astrolabe sync:`, so one row of the timeline is findable
  a week later.
- **Our own commit subjects are told in the reader's language.** `astrolabe snapshot: <iso>` is the
  right subject for a terminal `git log` and the wrong one in a timeline whose first column is
  already the moment — the row would print when twice. Anyone else's subject is shown exactly as
  they wrote it, `dir="auto"`, scrubbed and capped server-side.
- **Dates go through `client/dates.ts`, both halves.** `relativeDate()` is new and lives there
  rather than in the panel for the reason that module's header gives: four surfaces used to hold
  their own `Intl` call. Inside 30 days a revision is a DISTANCE ("three days ago" — how a reader
  hunting "the version before I broke it" thinks); beyond it, `siteDate()`, so a Hijri instance
  dates its own history in Hijri.

## Sync at launch (server/gitSync.ts::syncAtLaunch)

- A third trigger, `"launch"`: the server boots → one pass; `POST /api/sync/launch` (credentialed
  like `/sync/now`; the client calls it once per load when `/api/me` says admin) → one pass. Both
  refuse while a pass runs here or elsewhere and within 5 min of the last attempt; a failure is
  recorded by `syncNow`, never thrown to the caller.

## The desktop app (`electron/`, `desktop/`, `client/desktop/`)

Astrolabe runs in a browser, and for a writer that is the wrong window: no
application menu, no window that stays where it was left, no system dictionary,
no file the reader can drag out, nothing over other applications, and a tab that
closes with twenty others. The desktop app is Electron — chosen over Tauri (whose
webview is whichever one the reader's OS shipped, and this product's whole
premise is one rendering of one editor) and over a PWA (which has none of the
seven capabilities listed below). It is **additive**: `git clone && npm install
&& npm start` is untouched, `npm run typecheck` still passes on a clone that has
never seen Electron, and a contributor who never opens `desktop/` never downloads
a Chromium.

### The server is SPAWNED, not imported — and that is the load-bearing decision

`electron/server.ts` runs `server/index.ts` as a **child process** of the
Electron binary in pure-Node mode (`ELECTRON_RUN_AS_NODE=1`, so a reader who has
no Node installed still has one). The obvious alternative — factor
`server/index.ts` into `createApp()` + `boot()` and call it in-process — was
considered and **refused**.

`server/index.ts` is a script, and the script is the contract: it parses argv,
seeds a fresh vault from `vault-seed/` before anything reads it, `process.exit(1)`s
on a `ConfigError` with the sentence that fixes it and no stack trace,
top-level-`await`s `initIndexer()`, and runs seven inits in an order
`migrateSettings()` silently depends on. A second caller of that sequence is a
second thing to keep true, and the web deployment — the actual product — would
be the one paying, in drift, for a boot path only the desktop exercises. The
process boundary costs two additive lines in `server/index.ts` and buys the
guarantee that both deployments boot identically.

Those two lines, and nothing else:

- `if (process.send) process.on("disconnect", () => process.exit(0))` — quitting
  the app must not leave a server holding a vault's port and watching its
  directory for a window that no longer exists.
- `process.send?.({ type: "astrolabe:listening", port: info.port })` in `serve()`'s
  callback — the **bound** port, not the requested one.

Both are inert without a parent: `process.send` exists only when the process was
given an `"ipc"` stdio.

### THE PORT IS PERSISTED PER VAULT. This is not an optimisation.

Every device preference in this product is `localStorage` — `astrolabe.theme`,
`astrolabe.workspace`, `astrolabe.tabs`, `astrolabe.vim`, `astrolabe.reading`,
`astrolabe.sidebarSide`, the folds, the pane sizes — and **`localStorage` is keyed
by origin**. The desktop's origin is `http://127.0.0.1:<port>`, so the port *is*
the identity of the reader's settings.

A desktop app that asks the OS for a free port each launch therefore hands the
reader a brand-new browser profile every morning: theme back to default, tabs
gone, folds gone, sidebar back on the other side — and **there is nowhere in the
product that could explain it**, because from the inside nothing went wrong. A
different origin genuinely has no settings. It is the worst bug available to this
feature, it is silent, and it is one line of convenience away at all times.

- One port per vault, in **6820–6899**. Not 6801: the reader running `npm start`
  in a terminal beside the app is the normal case, not a conflict to arbitrate.
- The first port a vault is offered is **seeded from its path** (`seedFor`, FNV-1a),
  not counted upward — so a reinstall, or the same vault on a second machine,
  lands on the same origin and keeps its stored layout even when the preferences
  file did not survive.
- The remembered port is tried first; then a linear probe from the seed, skipping
  ports other vaults own. Binding is the test — `portCandidates()` is pure and
  proved in `tests/desktop.test.ts`; `isPortFree()` actually binds, and the
  caller walks the list because the answer is racy by nature.
- **When the port has to move, the reader is told, in a dialog, in their own
  language** (`dlgPortMovedBody`). It is the one message this app owes: their
  layout for that vault has just reverted, and nothing inside the window can say
  why.
- **A server that dies gets ONE respawn, after a 1.5 s backoff, before the app
  gives up** (`main.ts::onServerExit` → `respawnServer`). Closing every window on
  the vault and printing an exit code is the right ending for a server that
  cannot run, and the wrong one for a server that fell over once — which is what
  a crash usually is. The port is free by then, so `startVaultServer` almost
  always gets the same one back and the windows simply resume with their stored
  layout intact; a port that moved carries each window's route across instead.
  The sign-in is redone against the new child (same `SESSION_SECRET`, so the
  cookie in the partition still stands) and the keep-alive re-armed. A SECOND
  death gets no second attempt: a server that cannot stay up is a bug to show,
  not a flicker to hide.
- `ASTROLABE_DATA` goes to `<userData>/vaults/<name>-<hash>/data`, **not** into the
  vault. `isIgnoredSegment` hides exactly three names — `.obsidian`, `.git`,
  `.trash` — and `.astrolabe` is not one of them, so a data directory beside the
  notes would appear in the reader's own tree and travel into their Dropbox.

### The owner never meets a login screen, and the binary is not a bypass

Two requirements that pull against each other: the person who chose the folder
and double-clicked the icon should not type a password to prove they are holding
their own computer — and the same binary must not become a way for every other
account on a shared machine to reach that vault.

**No new auth mode.** `server/auth.ts` already has the shape; the desktop uses it
as written:

- `HOST=127.0.0.1` — nothing off the machine can reach the port.
- `PUBLIC=false` — reads require a session too, so an unauthenticated local
  caller gets 401 on *everything*, not a published subset.
- `ADMIN_PASSWORD_HASH` — argon2id of **32 random bytes minted at launch**, never
  written to disk, never shown. Cheap parameters (m=8192, t=2, p=1) deliberately:
  scripts/hash-password.ts stretches a *human* password because it is short and
  guessable; there is no dictionary attack on 256 bits, and stretching it would
  cost ~1.2s of launch time to buy nothing.
- `SESSION_SECRET` — 32 fresh bytes per launch, so a cookie from a previous run
  is not a credential for this one.

The app then signs itself in through **`POST /api/login`, the same route the
browser uses**, and puts the cookie in that vault's Electron session partition.
There is no desktop special case anywhere in `server/`.

Two consequences worth stating:

- **`isProtected()` is true**, so Backup & sync works on the desktop. In open
  local mode the server correctly refuses to push a vault anywhere on the word of
  whoever connected.
- **The session lifetime is read off the wire, never copied.** `SESSION_TTL_MS`
  is private to `server/auth.ts`; the login response's `Set-Cookie` carries
  `Max-Age` written from it, so `electron/cookie.ts` parses that and
  `keepSignedIn` schedules from what the server said. The cookie's *name* is read
  the same way for the same reason: a desktop that typed `"astrolabe_session"` into
  its own source would work until someone renamed it and then fail by silently
  never being admin.

**A session partition per vault, and it is not fastidiousness: cookies ignore
ports.** Two vaults are two origins to `localStorage` and *one* origin to the
cookie jar — so a shared jar means opening the second vault overwrites the first
vault's session cookie with a token its server rejects, and the first window
silently stops being admin.

### `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`

Stated on every window rather than left to default, because a default is a
decision nobody wrote down and two of these have been the other way inside living
memory of the framework. A note can contain arbitrary HTML — the reading view
sanitizes it and the server sends a CSP behind that; these four are the third
wall. `npm run check-desktop` fails on any of the four written the other way.

`sandbox: true` is why `electron/preload.ts` is the one file under `electron/`
that is **compiled** (to CommonJS, into `desktop/build/preload.js`) rather than
run as TypeScript: a sandboxed preload is loaded by Chromium, not by Node — no
ESM, no type stripping, and `require` limited to `electron` itself. It is also
why the preload **inlines** its channel names instead of importing
`electron/ipc.ts`, and why the gate counts them.

**The bridge is 1:1 in both directions.** Every channel is declared once in
`electron/ipc.ts`; each `TO_MAIN` channel has exactly one `ipcMain.handle` and
exactly one `ipcRenderer.invoke`, each `TO_RENDERER` channel exactly one `.send`
and one `ipcRenderer.on`. Two callers is a finding and **zero is a finding** — a
dead channel is a hole that no longer has a reason, which is the worst kind to
leave open. Every handler resolves its caller through `instanceOf(event.sender)`
first: a renderer cannot name a vault, a path or a window, only act on the one it
is already inside.

### What the desktop does that the browser cannot

This list is the justification for the whole surface; a desktop app that only
re-hosts the web app is a bigger download of the same thing.

1. **A native application menu, translated.** Menu strings are user-visible copy
   and are in `electron/menuStrings.ts` in the shape `check-i18n` parses, with
   `check-desktop` running that gate's four parity assertions over them until the
   dictionaries merge.
2. **Real OS windows** — position and size restored per vault, validated against
   the displays that still exist (`onSomeDisplay`), because a window restored to
   an unplugged second monitor is an app that "does not start" while running
   perfectly, off the side of the desk.
   **AND FITTED TO THE DESK IT REOPENS ON (`fitToWorkArea`, 3.18.1).**
   `onSomeDisplay` is a floor ("can the reader grab it at all"), not an answer: a
   rectangle saved on 1920×1080 and reopened on a 1366×768 laptop at 150% (a
   911×512 DIP work area) passed it with the caption buttons, the trailing edge
   and the bottom corner all off the desk. Size first, then origin, so a window
   bigger than the desk lands at the desk's own corner rather than hanging off
   the far one. The DEFAULT goes through it too: 1280×860 on a 934×600 DIP
   screen used to open a window that filled the screen exactly and was NOT
   maximised, so the maximise button did nothing visible — a default that does
   not fit now opens MAXIMISED, which is a state the reader can leave. The
   geometry is reported once on `ready-to-show`, because a rectangle the display
   constrained at creation is the rectangle the reader actually has.
   **ONE FLOOR, ONE EXPORT.** `MIN_WINDOW = {width: 480, height: 400}` lives in
   prefs.ts and is used by `saneBounds` AND by `createVaultWindow`. They
   disagreed — 400 tall at the window, 480 on both axes in the file — so every
   rectangle in the gap (every Snap quadrant and vertical half on a 150% 1080p
   laptop, and the app's own minimum) was handed out and then refused. And
   because `saneBounds` rejects the WHOLE record, `maximized` went with the
   rectangle: `rememberBounds` now keeps the flag even when the rectangle is
   refused, since a flag is not a rectangle and a rectangle we distrust says
   nothing about it.
2b. **The zoom is the app's, not Chromium's (3.18.1).** `Ctrl/Cmd =`, `-` and `0`
   used to be Electron's `zoomIn`/`zoomOut`/`resetZoom` roles, which write into
   the per-host zoom memory of the `persist:vault-<hash>` partition under host
   `127.0.0.1`. Nothing in `electron/` or `client/` read it, showed it or could
   reset it, and it came back on every launch: five presses on a 1366 laptop at
   125% left the reader permanently at a 689 CSS px viewport — the phone shell,
   mouse attached — looking at an app that appeared to be broken. The factor now
   lives in `desktop.json` beside the window bounds (`VaultPref.zoom`, per vault,
   because that is what the old behaviour already implied), every window applies
   it explicitly on `did-finish-load`, and `TO_RENDERER.zoom` tells the renderer
   so `StatusBar`'s `ZoomChip` can show the percentage — nothing at 100%, since
   this is a state and not a control — with a click that is *actual size*.
   The menu rows carry `registerAccelerator: false`: the chord is DRAWN but not
   claimed, so the keystroke reaches the page, and `client/desktop/` asks for the
   app zoom from a capture-phase handler that STANDS ASIDE over an open book. The
   book reader has claimed those three keys for the page it is showing since
   3.11, and a reader who reaches for the zoom keys over a book means the book.
   The numeric keypad keeps real accelerators: no page listens for it.
3. **Native find-in-page** (`Ctrl/Cmd+Shift+F`) — the *rendered document*:
   reading view, outline, backlinks, transclusions. `Ctrl/Cmd+F` remains
   CodeMirror's find over the open note's text. Two verbs, two keys.
4. **Native spellcheck with the system dictionary**, drawn in Astrolabe's own
   `.s-menu`. `client/editor/bidi.ts` already stamps a `lang` on every line whose
   script disagrees with the document, and `setSpellCheckerLanguages` is a
   whitelist — so every language `shared/script.ts::spellcheckLang` can return
   (`he`, `fa`, `ar`) plus the instance language is enabled, or that per-line work
   is inert. The reader's choice is committed with
   `webContents.replaceMisspelling`, which lands as a native
   `insertReplacementText` — so CodeMirror's own DOM observer applies it, undo
   history included, and **nothing in `client/editor/` knows this feature
   exists**.
5. **OS dark mode, followed.** The web app deliberately does not read
   `prefers-color-scheme` — a self-hosted vault's theme is a decision its owner
   stored. On the desktop the machine is the reader's, and the flip moves to
   `counterpartChoice()` — the same function the ☾/☀ button uses, so a custom
   theme lands on its base's curated opposite.
6. **File associations and `astrolabe://` deep links.** Both are hostile input: a
   `astrolabe://` URL can be opened by any page in any browser with no prompt. Two
   refusals in `electron/deeplink.ts` are the whole trust model — a note
   reference must survive normalization and stay inside the vault, and **a vault
   reference is honored only if the reader has already opened that vault**.
   Without the second, `astrolabe://open?vault=/` is a link that makes the app index
   and serve the reader's entire disk.
7. **Drag a note out as a real `.md`**, a tray/menubar presence, and an
   **always-on-top reference window** — the source you quote from while you write
   in the window behind it, which is the one arrangement `client/workspace.ts`
   structurally cannot express.

### A menu item must not invent a keystroke

`GROUPS` in `client/components/ShortcutsHelp.tsx` is the one place a binding
exists and `npm run check-keymap` fails the build when two rows claim one chord.
A native menu is a **third** keyboard handler and the most dangerous of the
three, because an accelerator is consumed by the OS *before* the page sees the
key: an accelerator that disagrees with the ledger does not collide loudly, it
makes the ledger's binding silently stop working, on one platform, for one build.

So every accelerator in `electron/menu.ts` is a chord the ledger already claims,
and the item forwards the same verb — the menu is a **visible index of the
keymap**, not a second one. The forward calls the same store action the keyboard
calls (`client/desktop/index.ts`), which is the pattern the shortcut sheet's
`run:` handlers already use.

**One exception, and it is the interesting one.** Electron's convention for a new
window is `Cmd/Ctrl+N`, and this app has claimed `Ctrl/Cmd+N` for **New note**
since before the desktop existed. Taking it would make the desktop build the one
place the product's own documented binding does nothing — discovered by a reader
who pressed it expecting a note and got an empty window. New note keeps
`Ctrl/Cmd+N` and appears in the menu wearing it; **New window takes
`Ctrl/Cmd+Shift+N`**. Find next / Find previous carry no accelerator at all for
the same family of reason: `F3` and `Ctrl/Cmd+G` are both spoken for, and the
find bar's own `Enter` / `Shift+Enter` already answer.

### The gates

- **`npm run check-desktop`** (`scripts/check-desktop.mjs`) is **pure**: no
  Electron, no `node_modules`, no browser, no server. It runs in CI on every
  commit, next to `typecheck`, because `desktop/` is the one part of the repo
  most contributors never install and unbuilt code rots quietly. It asserts:
  the server's bare-import closure ⊆ `desktop/package.json` dependencies **at
  identical version specs**; nothing under `client/` or `server/` imports
  `electron`; every IPC channel paired 1:1 in the right direction; none of the
  four `webPreferences` written the unsafe way; and the menu dictionary's
  translation parity, including that a key shared with `client/i18n.ts` is
  byte-identical to it.
- **`electron/probe.ts`**, run under `ELECTRON_RUN_AS_NODE` at every launch,
  asks the four questions whose answers are only ever discovered as a blank
  window: is the bundled Node ≥ 24 (`server/index.ts` is run directly and
  top-level-awaits), does `node:sqlite` exist (marginalia — opt-in, so the
  failure would otherwise wait months), does the **native** `argon2` load
  (compiled against an ABI, and Electron's is not stock Node's), and does a real
  `server/*.ts` type-strip and resolve its bare import. All four fail the same
  way, so all four are asked before the window opens.

## The desktop main process boots, and a gate says so (3.3.5)

Releases 3.1.0–3.3.4 shipped an Electron main that died on its first line: `electron/main.ts`
imported `existsSync` from `node:fs` twice, Node refuses the duplicate at load, and the root
`tsc -p .` never covered `electron/`. Two gates now: `npm run check-desktop` also runs the
desktop package's own typecheck (which reports the duplicate as TS2300), and
`scripts/check-desktop-boot.sh <AppImage>` launches the packed app under `xvfb-run` for 25 s
with a throwaway vault and fails on any "Uncaught Exception" / "SyntaxError" in its log. Run the
second on every AppImage before it is uploaded or swapped into `~/Applications`.

## The desktop restarts itself (electron/update.ts)

- An applied AppImage update never calls `app.relaunch()`: the relauncher runs from the mounted
  image, unmounted by then, and the new instance died on FUSE. `relaunchAppImage` spawns a
  detached `/bin/sh` that waits for this pid to vanish and execs the file with an environment
  scrubbed of the old mount and of `APPIMAGE`/`APPDIR`/`ARGV0`/`OWD`. `ASTROLABE_SELFTEST=relaunch`
  fires the same path 4 s after boot; `scripts/check-desktop-relaunch.sh` runs every AppImage
  through it before upload, beside `check-desktop-boot.sh`.

## Desktop updates, without a framework — and without a will of their own (electron/update.ts, electron/updatePolicy.ts)

**NOTHING IS DOWNLOADED OR INSTALLED WITHOUT BEING ASKED (3.15).** A friend's Windows build
pulled a release in the background ("def shouldn't be the case"), which the header of update.ts
had described as a feature. The policy is now a pure function, `decideUpdate({pref, manual,
current, latest, reminded}) → {check, remind, download}` in `electron/updatePolicy.ts`, and
`tests/updatePolicy.test.ts` asserts `download: false` for every combination it can enumerate.
The flow is two clicks, both the reader's: a check (launch, every six hours, or the menu) only
LOOKS and, when a newer release exists, sends `available` (with `installable`) — the status bar's
chip becomes **3.x available** and a toast offers **Download 3.x**, ONCE per version per launch
(`reminded` in update.ts; a manual check repeats it, since a person who asked deserves an answer);
the click calls `updateDownload` (`TO_MAIN.updateDownload`), the only path that fetches bytes,
verified by size and by the release's `SHA256SUMS` line as before; `ready` makes the chip
**Restart to update**, and `updateApply` swaps/spawns as it always did. A failed download is
`failed` after `downloading`, which the renderer turns into its own sentence while keeping the
chip on **3.x available** — the way back is the same click as the way in, not the build number
under a "could not check" title — and `found` is kept so that click retries at once; the
updater remembers the offer, not the stumble, as what `hello` hands a later window. **The preference** `updates: "notify" | "off"` lives in
`desktop.json` beside the window bounds (`electron/prefs.ts`, parsed by `parseUpdatesPref`;
anything but the literal "off" is notify), is read fresh on every tick so a change needs no
restart, and is exposed as `updatesPrefGet`/`updatesPrefSet` — Settings → This device → This app
→ **Software updates** (*Tell me* / *Off*), desktop only. *Off* stops the timer asking at all; the
menu item still works by hand. Turning it back on runs one quiet check straight away. `hello`
carries `update` (the updater's last word) so a window opened after the check draws the pill
without a second toast.

**The mechanism underneath** is unchanged. The app asks GitHub's releases API, the new repo
first and the old one when that fails. `installKind()` decides what a newer release can become:
**appimage** (`$APPIMAGE` set) downloads the `.AppImage` beside the running file, checks the byte
count and the release's `SHA256SUMS-*.txt` line for it, `chmod`s it to the running file's mode and
on "Restart to update" renames it over the running file and relaunches; **windows** (`win32` and
`app.isPackaged`, 3.4.0) downloads the NSIS `.exe` under `<userData>/updates/`, checks size and
checksum the same way, and on "Restart to update" spawns it detached with `/S --force-run
--updated` (the flags electron-builder's installer honours: silent, relaunch when done) and quits;
**null** (deb, pacman, a dev checkout) only says a release exists (`installable: false`, the chip
reads `3.x ↗`) and opens the release page. The renderer hears `phase` changes (`current` |
`available` | `downloading` | `ready` | `failed`) through the IPC bridge and shows the toast; the
menu's "Check for updates…" runs the same path with `manual = true`, which is the only difference
between silence and "you are current". **The Android
shell** (mobile/, `UpdateCheck.java`, 3.4.0) asks the same endpoint once per launch on a thread,
compares `tag_name` with `BuildConfig.VERSION_NAME`, and offers the first `.apk` asset in an
AlertDialog (Update → `ACTION_VIEW` on the asset URL, the browser downloads and the package
installer upgrades in place; Later → snoozed a day in SharedPreferences). The install id stays
`dev.vellum.mobile` and the key stays `mobile/vellum-release.keystore`, because Android upgrades
only what carries the same id and signature; the Java package and the label say Astrolabe. Every
release must carry the APK (`Astrolabe-<v>.apk`) for the phone to see it.

## The last workspace beside the vault (server/workspaceState.ts)

- `ASTROLABE_DATA/workspace.json` holds the client's own serialisation, written by the desktop
  client (admin, debounced 1 s) on every workspace change and read only when a desktop window
  finds NOTHING in its own localStorage — a port moved, so a new origin. Browsers and the phone
  never restore from it: a phone must not inherit four columns. `startVaultServer` also waits
  up to 3 s for the remembered port before moving, because the port is the origin.
- With nothing to restore, `enterVault` opens the most recent note (client/recents.ts), then the
  seed guide, then the first name in the tree — never the first name while a recent one exists.

## The app's name and icon are the reader's (electron/brand.ts)

- `<userData>/brand.json` `{ name, icon }` is read at ready; `app.name`, the tray image and
  tooltip, the window icon (`WindowContext.icon`) and the About box draw from `brandName()` /
  `brandIcon(default)`. Anything new the shell draws with the product's identity MUST go through
  those two, never the literal "Astrolabe" or the bundled icon path.
- The icon is COPIED under `<userData>/brand/` and only a path inside that directory is trusted
  from the file. Name: ≤ 60 chars, control characters stripped, "Astrolabe" itself stored as null.
- Updates never touch it: the AppImage swap targets `APPIMAGE` (the reader's own file name), the
  Windows installer the program directory, and `userData` neither. `installLauncher` writes
  `~/.local/share/applications/<slug>.desktop` (Exec = the AppImage path, `StartupWMClass=astrolabe`)
  or a Start Menu `.lnk` (icon only from an `.ico`; a PNG reports `png-icon-skipped`).
- The build-time rebrand is `scripts/rebrand.mjs` (productName/copyright in electron-builder.yml,
  desktop/icons/icon.png); it does not touch `appId` or `RELEASES_PAGE`, so a rebranded build of
  this repository still takes this repository's updates unless the constant is changed.

## Desktop sessions (electron/auth.ts, electron/main.ts, client/desktop)

- A vault whose password THIS LAUNCH minted is owned by the app: `hello.ownsSession` is true,
  the status bar hides **Sign out**, and `loadMe` seeing `admin: false` asks main
  (`astrolabe:session-restore`) to sign in again once before accepting the visitor view. The
  modal for a password no human has ever seen must never be the surface a desktop reader meets.
- An env-linked vault (`restart.deployEnv !== null`) is NOT owned: restore answers false, "Sign
  in" takes the deployment's own password, and the app never pretends to know it.
- From 3.5.0 the first launch that finds `~/.config/vellum` carries it into `astrolabe` (files
  the new directory lacks only) and then REMOVES it, only after a carry that threw nothing. The
  carry cannot merge Chromium's LevelDB stores; the client preferences that were lost that way
  now travel with the vault instead (above).

## Pocket: a vault from GitHub on the phone (`mobile/src/pocket/`)

The owner asked: *"can you add ability to open app via github sync? I.e., can login into github and
select some private project and said project will somehow sync locally on phone?"* — a person with
no server, wanting their notes. This is phase one of the answer.

### IT IS NOT THE SHAPE THE SHELL REJECTED, AND THE REASON IS THE COMPANY THE CLONE KEEPS

`mobile/README.md` rejected on-device git in so many words. Read the rejection again: every clause
of it is about a clone **next to a live server** — "the same vault would then have two writers with
independent histories, one of which spends most of its life asleep in a pocket". The pocket vault
has no server beside it at all. The repository IS the vault; the phone is one working copy; the
only other writer is the owner's own laptop through git, which is what git is for and what every
Obsidian-plus-git user already lives with.

The second rejection stands untouched. Nothing runs a server on the phone: `nodejs-mobile` is still
years behind `engines.node >= 24`, and nothing here needs it. What runs is a ROUTER in the page.

### THE POCKET SERVER COMPUTES NOTHING OF ITS OWN

`mobile/src/pocket/server.ts` answers the `/api/*` the web client speaks, and every line of parsing,
folding, scanning, stripping and writing under it comes from `shared/`. Four modules moved out of
`server/` for it, and the move — not a copy — is the whole point: a vault that disagrees with itself
about its own contents depending on which machine opened it is the failure this is avoiding.

| Moved | From | Why it is shared now |
| --- | --- | --- |
| `shared/noteParse.ts` | `server/indexer.ts` | `splitFrontmatter`, `parseLinks`, `parseAssets`, `parseTags`, `parseFmDate`, `scalarProps`, `linkKeys`, `pickShortest`, `wikilinkRegex`. A reverse index keyed even slightly differently from the resolver is a backlinks panel that loses rows silently — one spelling, or two answers to one question. |
| `shared/prose.ts` | `server/indexer.ts` | The markdown→prose strip behind snippets, backlink context and `/api/search/matches`. DESIGN.md's rule is that raw markdown never reaches a reader; two strippers is two verdicts on that. |
| `shared/snippet.ts` | `server/snippet.ts` | Already shared between the note index and the page store; the pocket is the third index answering the same search box, and the client draws all three kinds of row with one renderer. |
| `shared/frontmatterEdit.ts` | `server/frontmatterEdit.ts` | The byte-surgical YAML writer, whose whole existence is "there is exactly one of these". `yamlQuote` went with it, to `shared/yaml.ts`. |
| `shared/noteParse.ts` (`FRONTMATTER_RE`, `parseAliases`, `bannerOf`) | the pocket's own copies, `server/noteFrontmatter.ts` | ONE frontmatter fence (`---` … `---` or `...`, an empty block included), the alias rule (split a scalar on commas, never a list item; dedupe case-insensitively; a date is not a name), and `banner:` alone as the banner — the pocket once read `cover:` and `image:` too. |
| `shared/headings.ts` | ~20 regexes | What a heading is (CommonMark's ATX, outside the frontmatter and fences), its title and its id — see editor.md, "Fenced code". |
| `shared/attachments.ts` (`MIME_TYPES`, `contentTypeFor`, `attachmentKindOf`, `isImagePath`), `shared/byteRange.ts`, `shared/tree.ts`, `shared/dates.ts` `localIsoDay` | `server/api.ts`, `server/vault.ts`, the pocket | The served type, the tree's kind and order, the one image test, a `Range:` header's answer (416 on both sides for what cannot be served), and the local day. |
| `shared/tex.ts` `texFrontmatterText` | `server/texNote.ts` | A `.tex` note's frontmatter as the server reads it, so the pocket files a LaTeX note's aliases and tags and indexes its prose rather than its source. |

`tests/pocketParity.test.ts` holds the two indexes to one fixture vault — resolve, aliases, tags,
banner, backlinks, search and the tree's order — so a rule that drifts back into two copies fails
the suite. (What the pocket still cannot do is a 501 by name, below; `\input` edges in a `.tex`
note resolve against the server's filesystem and are the server's alone.)

The server keeps `gray-matter` — for the YAML INSIDE the block; which block is the frontmatter is
`FRONTMATTER_RE` on both sides — and the phone reads frontmatter with `mobile/src/pocket/frontmatter.ts`,
a deliberately small reader of the subset a vault actually holds (scalars, flow lists, block lists,
one level of nesting). It is not a YAML parser and never claims to be: what it cannot read it drops,
which is what `readFrontmatter`'s try/catch amounts to on the server, only finer-grained. A key it
GUESSED at would be a note filed under a tag nobody typed, and that is the worse failure.

### THE CONFLICT CONTRACT: THE PHONE NEVER MERGES PROSE

On a pull that diverges (`mobile/src/pocket/git.ts`, `conflict.ts`): the remote's version of a note
keeps its NAME, this phone's version is set down beside it as `<Note> (phone).md`, both are
committed and both are pushed. No three-way merge, no "theirs wins", no silent loss. The pair is
named in the shell's sync line, and — because a conflict is a FACT ABOUT THE VAULT rather than a
memory of a session — the count is recovered from the working tree at every open
(`standingConflicts`), so a phone closed with two pairs standing and reopened cannot say "synced".

Two things that are deliberately NOT conflicts: a note both sides changed to the same bytes (that is
agreement, and naming it a conflict teaches the owner to ignore the line), and a note only the phone
touched (it is simply kept). A note the phone DELETED and the remote CHANGED comes back — a delete
is a weaker statement than an edit, and the edit is the thing that would be lost.

Saves carry the server's own precondition: `baseMtimeMs` in, `409 code:"stale"` out — the same
refusal, one level down.

### A RECORDED BASE COMMIT, BECAUSE THE CLONE IS SHALLOW

`depth: 1`, `singleBranch: true`. A vault with five years of history is a minute of network nobody
asked for, and none of it is read until a note's past is opened. A shallow repository has no common
ancestor to compute, so the pocket RECORDS the remote commit it was last level with (`pocket.base`
in Preferences) and diffs against that: remote unchanged, remote moved and we did not (fast-forward),
or both moved (the conflict path). Exact, one string, and it survives an app restart. The cost is
written down rather than hidden: `/api/history` and `/api/versions` show the commits since the clone,
which is where this copy's history begins.

### THE FILESYSTEM IS INDEXEDDB, AND THE ARCHITECTURE DECIDED IT BEFORE THE NUMBERS DID

`@isomorphic-git/lightning-fs` over IndexedDB, not `@capacitor/filesystem`. The decisive fact is not
speed: the pocket server has to be reachable from a SERVICE WORKER, because `<img
src="/api/file?path=…">` is a browser load that no shim in the page can see — and a service worker
has no Capacitor bridge, so `@capacitor/filesystem` is unreachable from one by construction.

The numbers agree. Measured in Chromium (desktop; a phone is several times slower) against a
2,000-note vault, through the shipped code:

| | |
| --- | --- |
| clone (git → IndexedDB), 2,000 notes | 770 ms |
| open: bootstrap → client mounted | 1,308 ms |
| reopen: read and index every note | 958 ms |
| `/api/tree` · `/api/graph` · `/api/tags` | 2 ms · 7 ms · 1 ms |
| `/api/search?q=…` | 19 ms |
| the same 2,000 reads with the Capacitor bridge's tax (base64 both ways + one hop) | 8,194 ms — a MODEL, not the plugin |

### THE SEAM IS TWO SEAMS, AND `client/` KNOWS ONLY WHAT IT MUST

The client's DATA path is unmodified: it asks `/api/*` exactly as it asks a server, and the two
seams below answer. What the client DOES know is the `pocket` flag on `/api/me` (`useStore`'s
`pocket`), and it uses it for chrome alone: Settings draws a pocket vault's own Backup & sync tab
(`components/settings/PocketSync.tsx`) and hides the instance-only tabs and rows
(`settingsIndex.ts` `mode: "pocket" | "instance"`, `TabBody.tsx`), the voice recorder names the
pocket when it keeps a recording untranscribed, and the rows a pocket cannot answer say so rather
than failing. None of that changes a wire shape.

`fetch` is patched in the page (`pocket/boot.ts`) for the seventy typed fetchers in `client/api.ts`:
no round trip, no dependency on a worker being alive. Everything that is NOT a `fetch` goes through
`pocket/sw.ts` — `<img src>`, pdf.js's byte ranges, `<audio>`, and `EventSource`, none of which a
page shim can see. The worker holds no vault (the clone and the native bridge are in the page); it
asks the page over a MessageChannel, and in the one moment there is no page yet it answers 503,
which the client retries, rather than an empty body it would render as an empty vault.

It is served at `/sw.js` ON PURPOSE: `client/offline.ts` registers exactly that path for offline
reading, so on a pocket vault the client's own call installs this worker and there is never a second
registration to fight with. A pocket vault needs no offline cache — it IS the copy.

**And `/` is the client, not the shell.** The client routes on the PATHNAME (`client/router.ts`), so
served anywhere else it rewrites its own address on the first paint and a reload lands somewhere
else. So the client's `index.html` is the page at `/` with its entry module swapped for the
bootstrap, the shell's two screens moved to `/shell.html`, and the bootstrap decides in its first
tick which of the three things the APK can show is showing. A launch that is not a pocket vault is
at `/shell.html` before a byte of the client is imported, behind the splash, so nothing flashes.

### GIT TRANSPORT IS NATIVE, AND IT IS BINARY BOTH WAYS

github.com's smart-HTTP endpoints answer no preflight and send no `Access-Control-Allow-Origin` —
correctly. The shell has met that wall before (the capture sheet's `CapacitorHttp`), and the answer
is the same: perform the request natively. `CapacitorHttp` alone is NOT enough, because it moves a
request body as a STRING and a push's body is a packfile; a packfile through a UTF-8 round trip is
not a packfile. So `android/…/GitTransport.java` carries base64 in both directions, follows
redirects by hand (GitHub answers 301 for a renamed repository, and `HttpURLConnection` drops the
method and the body on one), and never reads the `Authorization` header it writes through. No proxy
stands between the owner's phone and the owner's repository.

### SIGNING IN IS THE DEVICE FLOW, AND THE TOKEN IS NOT ENCRYPTED AT REST

The web flow needs a client SECRET, and a secret in an APK is a secret published. PKCE needs a
custom scheme somebody else's app can claim. The device flow needs neither: a code the owner reads
here and approves on github.com, where they can see what they are authorising. The client id is
public by design and is a build-time constant from `mobile/.env` (`ASTROLABE_GITHUB_CLIENT_ID`); a
build without one still runs and the door says what is missing. The scope is `repo` and nothing
else — the narrowest one that reaches a private repository.

**The token lives in Capacitor Preferences**, i.e. SharedPreferences: a file in the app's private
data directory, readable by this app's uid and no other on an unrooted device, and NOT encrypted at
rest. The alternative is `EncryptedSharedPreferences` over the Android keystore, which defends
against an attacker holding the unlocked device or a root shell, and costs a Java plugin plus a
failure mode — a keystore entry invalidated when the owner's fingerprint enrolment changes — whose
symptom is a vault that will not open and cannot say why. What is being protected is a `repo`-scoped
token the owner revokes in one click from their account page, and revocation is the mitigation that
matches that risk. Written down so a later round can change it with the argument in hand rather than
rediscovering it.

### `.trash/` IS THIS DEVICE'S, AND THE REPOSITORY IS TOLD SO

A delete on the phone must reach the laptop as a delete; the copy that can undo it must not. So the
deleted note's bytes go to `.trash/<percent-encoded path>` and `.trash/` is written into
`.git/info/exclude` at clone time — the repository's own ignore list, never committed, so the vault's
`.gitignore` stays the owner's file.

### WHAT IT REFUSES, AND HOW

Publishing, the blog, marginalia, the site designer, the clipper token, uploaded fonts, PDF
annotations, export, the bulk rewriter, `/api/sync/*`, the book shelf, scripture lookup, the starter
vault: `501` with a one-line reason NAMING the thing that is missing. `/api/mentions` is the one
refusal on cost rather than capability and says so — an unlinked-mention scan is the whole vault per
note open. An empty list would have been a vault that looks broken; a sentence is one a reader can
act on. `tests/pocketServer.test.ts` asserts each refusal is a 501 with prose in it, not a stub.

Device state — preferences and the workspace — stays on the DEVICE and never enters the repository:
`state/workspace` is which notes this phone has open, and pushing it would mean opening the laptop to
find the phone's tabs. What travels between a person's machines is their notes. `/api/settings` still
answers a COMPLETE `EffectiveSettings`, because the client reads the periodic-note formats out of it
synchronously at boot and a missing field is not a missing feature — it is `format.replace of
undefined` inside the command palette, which is what the browser harness found.

## A pocket vault's settings travel with it, and its Backup & sync tab is its own

A friend of the owner installed the APK, opened a vault from GitHub, and reported (translated from
Arabic): *"the sync settings don't save — whatever I type and press Save, it doesn't save; the sync
switch keeps turning itself back off."* Two things were wrong at once, and this release is both.

### THE INSTANCE SETTINGS ARE A FACT ABOUT THE VAULT, SO THEY LIVE IN IT

3.22.0 filed them under device state, with the workspace and the preferences, and the sentence above
used to say so. It was wrong: which notes this phone has open is the phone's; the site's name, its
calendar, its daily-note folder, its templates and its tag labels are the VAULT's, and a reader who
chooses one on the phone means it everywhere. `PATCH /api/settings` writes
`.astrolabe/settings.json` INSIDE the repository — the same path, the same shape,
`server/configMirror.ts` mirrors out of every instance's data directory — and commits it
(`Astrolabe pocket: settings`) like a note save. GET reads it. `.astrolabe/` is hidden from the index
and the tree (`mobile/src/pocket/vaultIo.ts`), exactly as `server/vault.ts` never lists it, so the
settings file is not an attachment in somebody's sidebar.

### WHAT A POCKET CANNOT KEEP, IT REFUSES — IT DOES NOT SAVE AND FORGET

`POCKET_CANNOT_KEEP` (`mobile/src/pocket/server.ts`) is one sentence per key: the git-sync block and
its credentials, everything that describes visitors (layout, comments, share buttons, ambient,
excluded tags, author sites, public folders, the library, the language filter and toggle, the default
theme, the footer, the favicon), the typography slots (catalog faces are downloaded and served by an
instance), `noteVersions` (every save here is already a commit), `pdfSearch`, `hadithFolder`, `voice`
and `feeds` (3.28: a pocket fetches nothing; `/api/feeds*` and `/api/import/*` are 501s). A
PATCH carrying one is a `501` naming the reason and **nothing is written** — a save that lands
halfway is the reported bug restated. The same keys are stripped out of the GET's stored half, so a
repository that has also been open on an instance does not prefill the phone's panel with a site it
is not.

### THE CLIENT STOPS OFFERING THEM: `me.pocket`

`/api/me` from the pocket carries `pocket: true`; a server never sends it, so absent = false and no
instance pays a byte. With it, `SettingsModal` drops **Publishing** and **Collections** (both answer
"what may a visitor see", and there are none), locks the rows above with a `<fieldset disabled>` and
one sentence per tab saying why, and draws the pocket's own **Backup & sync**: the repository and
branch, the state line, **Sync now**, the `(phone)` conflict pairs as two links each, and **Leave
this vault**. `GET|POST /api/pocket/sync` and `POST /api/pocket/leave` are the routes behind it;
`/api/sync/*` stays a 501, because it means a different thing — a server driving git over a vault it
can see.

### ONE SYNC LINE, TWO RENDERINGS

The precedence that decides what the vault says about itself (a pending push is always louder than a
past success; a conflict is louder still and never ages out) moved to `shared/pocketSync.ts`, because
the shell's strip and the settings panel now both draw it and the web client cannot import out of
`mobile/`. `mobile/src/pocket/sync.ts` delegates. Two implementations of "is my writing somewhere
else yet" would eventually disagree, and the quieter one would be believed.

### THE SETTINGS INDEX LEARNED ONE WORD: `mode`

Every row on every tab is still indexed, including the ones only one kind of vault draws. The
generator reads the mode off the panel's own render condition — `{tab === "publishing" && !pocket &&`
→ `mode: "instance"`, `{tab === "sync" && pocket &&` → `mode: "pocket"` — so there is no second list
to keep in step, which is the bargain the whole index strikes with the panel. Rows in a component of
its own (`TravelRow.tsx`, `PocketSync.tsx`) are appended to the sync tab with their mode named at the
call site, as the travel row already was. The SEARCH honours it: a hit that scrolls to a row this
vault does not draw is the exact failure the index exists to prevent. This was chosen over keeping
the pocket panel outside the row system, because a tab body that is not rows would have left
"Repository", "State" and "Leave this vault" unfindable by search — a whole tab invisible to the one
surface that answers "where is the thing that does X".

### `mobile/tsconfig.json` DROPPED TWO FLAGS

`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` came off. The shell now imports
`shared/`, and TypeScript checks an imported file under the IMPORTING project's options: those two
put 285 errors on 18 files that the repo's own `npm run typecheck` passes, none of them about this
package's code. A package that renders a second verdict on somebody else's file is not stricter, it
is noisier. The rules are the repo's rules exactly, and the difference is written down in the file.
