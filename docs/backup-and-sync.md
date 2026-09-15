# Backup & sync

*Saving your vault to a private git repository you own — by hand or on a timer — and the note history that comes with it.*

← [Back to the README](../README.md) · [All docs](README.md)

---

Your vault is a folder of Markdown files. That makes the oldest and most portable backup tool
there is also the best one: **git**. Git keeps every version of every file, and it can copy the
whole folder to another computer (a *remote*) and back. Astrolabe can do the two git steps for
you — record a version (*commit*) and send it to the remote (*push*) — either when you ask, or
every few minutes. The feature is completely off until you switch it on.

> **Backup & sync needs an admin password in every mode.** Without one, anyone who can reach the
> port could point the remote at their own server and push your whole vault to it. See
> [Publishing](publishing.md#public-reading-admin-editing).

## 1. Have a remote to push to

Create an **empty, private** repository on whatever git host you use — a self-hosted Forgejo,
Gitea or GitLab, or one of the big ones. *Empty* matters: Astrolabe only ever adds commits on
top of what is there (a *fast-forward*), so a remote that already has commits of its own will
refuse to sync until you reconcile the two histories yourself. Copy the repository's clone URL.
Either form works:

```
https://git.example.com/you/vault.git      # HTTPS: needs a token (below)
git@git.example.com:you/vault.git          # SSH: needs a key on this machine
```

## 2. Choose how this server signs in

The server needs permission to push to your repository. There are two ways to give it.

- **SSH keys (recommended).** Astrolabe stores **no secret at all**. It runs `git` as the same
  system user your server runs as, and that user's own SSH key (or SSH agent) does the
  authenticating. Make a key for the server (`ssh-keygen -t ed25519`), add the **public** half
  to your repository as a *deploy key* with write access, and check that it works from a shell
  first: `ssh -T git@git.example.com`, then one manual `git push`. Do the shell test — a key
  that has a passphrase and no agent will fail just as silently under the server.
- **Access token.** For HTTPS remotes. A token is a password made for one purpose. Create a
  **fine-grained** one, limited to that one repository, with read and write access to its
  contents, and with the shortest expiry you can live with. Never use a classic token that can
  reach your whole account. Paste it into Settings → Backup & sync → Access token, together with
  the username it belongs to (many hosts ignore the username; anything non-empty will do).

**Where the token is kept.** In `ASTROLABE_DATA/git-credentials.json`, readable only by the
system user the server runs as (mode `0600`). It is **never** written into `settings.json`, never into the vault,
never into `.git/config`, and never into the remote URL — which is why the remote field refuses
a URL with a token baked in (`https://user:token@host/…`). When git needs it, it is handed over
through `GIT_ASKPASS` and an environment variable on that one git process. So it never appears
on a command line (anyone on the machine can read those with `ps`), and it never lands in your
machine's own credential store (each network call runs with `-c credential.helper=` to switch
those helpers off). The API never gives it back: `GET /api/settings` answers `tokenSet: true`
and nothing more, and every git error you see or that reaches the log is scrubbed of the token
and of any user info in a URL first. **Clear token** deletes the file.

## 3. Turn it on

Open Settings → **Backup & sync**. Switch Backup on (everything below that switch stays disabled
until you do), paste the remote URL, pick the branch (default `main`), and choose an
**Automatic sync** period, from *Manual only* to *Once a day*. (If a sync is still running when
the timer fires, that tick is skipped.) If the vault is not a git repository yet, press
**Initialize repository**. That runs `git init`, makes the first commit, writes or extends
`.gitignore` so your data directory can never be committed, and points `origin` at your remote.
The button disappears once the vault is a repository.

## 4. Sync

**Every launch syncs first.** With Backup & sync on, a server that starts up runs one sync
before it serves its first window. And every window that opens as an admin — a browser tab, the
phone, a desktop window — asks the server for one more, which it runs unless a sync ran in the
last five minutes or is running right now. So the first thing any device does is pull what the
others pushed. The manual **Sync now** stays available for whenever you want it.

While backup is on, the status bar shows a small branch symbol: plain when everything is
committed, with a count when something is not, gold while a sync is running, red when the last
one failed. Click it for a small panel with the branch, how many commits you are ahead of and
behind the remote, the last result, and — after a failure — git's own error line as selectable
text, a **Copy the error** button, and a one-click jump to the settings section. **Sync now**
lives in that panel and in the command palette. One sync does this:

1. optionally `fetch` + `merge --ff-only` — see below;
2. `git add -A`, then `.trash/` (and `ASTROLABE_DATA`, if you put it inside the vault) are taken
   back out of the index — see **What sync never stages** below;
3. commit `astrolabe sync: <ISO timestamp>`, **skipped entirely when nothing changed**;
4. `git push`.

## Why pulls are fast-forward-only

Because the alternative can corrupt your notes. When two copies of a repository have both
changed, git's usual answer is a *merge*, and when the same lines changed on both sides a merge
writes `<<<<<<<` conflict markers *straight into the files*. An unattended background job that
does that to a thousand notes is a worse outcome than any missed backup. So Astrolabe never
merges and never rewrites history (what git calls a *rebase*) — a `pull.rebase = true` in your
own git config cannot change that, because no `git pull` runs at all. If the remote has commits you do not have, the sync stops
**before touching a single file** and tells you the histories diverged. Nothing is committed,
nothing is pushed, no note is modified. You then reconcile the two in a terminal, which is where
a human belongs for that decision. Astrolabe never force-pushes (never overwrites what the
remote holds).

## What sync never stages

To *stage* a file is to mark it for the next commit (the list of staged files is called the
*index*). Two paths are taken out of the index on every single sync, before anything is
committed, **whatever your vault's own `.gitignore` says about them**:

| Path | Why |
| --- | --- |
| `.trash/` | Deleting a note, an attachment or a folder *moves* it here, and the whole promise of that is that it is a **local** bin — something you dig through, restore from, or empty without consequence (the trash browser is the door: `Ctrl/Cmd P` → Open trash). Committing it would make every deletion permanent remote history, which is the opposite guarantee. The small `.astrolabe-trash.json` inside it — which records where each entry came from, so Restore is a restore — is local bookkeeping and is covered by the same rule. |
| `ASTROLABE_DATA`, when it is inside the vault | It holds `settings.json`, the comments database and your git **access token**. |

This is done with `git rm --cached` against the index, not with an ignore rule, and the
difference matters. An ignore rule is your file and your opinion: git's *last matching rule*
wins, so a `.gitignore` that says `.trash/` and later `!.trash/` un-ignores it again, and an
older build that only checked "is there a `.trash/` line?" saw nothing to do and pushed the
trash. Removing it from the index asks no ignore file anything. It also **repairs** a vault an
older build already pushed: the first sync after upgrading stages the removal, so the trash
leaves the latest commit on your branch on its own. (It stays in the *history* — the older
commits — see the note about rewriting below.)

Astrolabe still *adds* `.trash/` and `.obsidian/workspace*.json` to your `.gitignore` if they are
missing, so that `git status` in a terminal is quiet too — but that is a courtesy, not the
mechanism.

## .gitignore advice

Beyond those two paths, the vault is committed as it stands. So decide what does *not* belong in
a backup before the first push. A `.gitignore` file at the top of the vault lists files git
should leave alone:

```gitignore
.obsidian/workspace*    # Obsidian's per-machine window state, if you also use Obsidian
.DS_Store
*.pdf                   # large attachments, if your remote has a size limit
```

Keep `.obsidian/` itself if you want your Obsidian settings backed up; drop the whole directory
if you do not. **Never commit your data directory.** `ASTROLABE_DATA` (default `./data`) holds
`settings.json`, comment data and the git token, so keep it *outside* the vault. That is the
default, and this repository's own `.gitignore` already excludes `data/`.

If you have pointed `ASTROLABE_DATA` inside the vault anyway, Astrolabe defends it four ways —
and all four work on an existing repository with an existing `.gitignore`, which is the normal
case, not a special one. **Initialize repository** creates `.gitignore`, or *appends* the
data-directory rule to the one you already have. Every sync re-checks the rule with
`git check-ignore` and **refuses to run** if the directory is still not ignored. Anything an
older build already committed is dropped from the index (`git rm --cached`). And that same
removal runs again after `git add -A` on every sync, so the directory is out of the index no
matter which ignore rule matched last. A sync never stages your credentials. One caveat: files
already pushed stay in the remote's *history*. If that happened, rotate the token and rewrite
the history in a terminal.

## Note history: reading what the backup kept

Every sync makes a commit, and every commit holds a version of every note in it. **History** is
how you read those versions back. Open a note, open the **History** section in the right-hand panel, and
you get the commits that touched this note — newest first, with the date, the message, and how
many lines each one added and removed.

- Tap a row to **read that revision**, rendered exactly as the note renders anywhere else.
- **Restore this revision** writes it back through the ordinary save path. So it can be undone
  with `Ctrl/Cmd+Z` in the editor, and the toast that follows carries an **Undo** of its own. A
  restore is itself an edit, so the version you restored *from* becomes history one snapshot
  later — nothing is lost either way.
- History **follows renames**. A note that used to have another name keeps everything it was
  before the rename.

The section starts closed and asks git nothing until you open it: reading a note's log is real
work for git, and most of the time you are writing rather than looking back. Open it once and it
stays open.

### Snapshot now

The command palette has **Snapshot now** — one commit of the whole vault, on this machine, with
nothing sent anywhere. It is the thing to press before an edit you are not sure about. It needs
no remote, no token and no network: any vault that is a git repository can take one. It shows up
in the history as *Snapshot*.

If the vault is not a git repository yet, the History section says so and offers the switch —
turning on Backup & sync (step 3 above) is what starts keeping history in the first place.

History is admin-only: a visitor cannot see that a published note went through eleven drafts,
and cannot read any of them.

## Versions, before and beside git

A note's history used to begin the day the vault became a git repository, and not a minute
before. Backup & sync is off by default, and on most instances it stays off for weeks. In that
time the editor's autosave — which writes about 600 ms after you stop typing — could turn a bad
paste, or a select-all-and-type, into the only copy of the note within a second. The trash
catches deletes; nothing caught overwrites.

Now every save keeps a **version**. Before the vault writes a note, it puts the text the note
held a moment ago in the data directory, at
`ASTROLABE_DATA/versions/<sha1 of the note's path>/<time>.md`, beside a small `index.json` that
names the path in clear and lists each version: when it was replaced, when that text was last
saved, its size, and *why* it was kept. This happens on the vault's one write path, so it covers
every write in the product — the autosave, a script's `PUT`, a tracker or orbit fence edited
from the Media page, the wikilink rewrites a rename fans out. It needs no git, no remote and no
setting, and it is on from the first launch.

Versions appear in the same **History** section of the right-hand panel, in one timeline with
the commits, ordered by time. A version row reads quieter than a commit row — a commit is
something you named, a version is something the app kept — and says why it exists: *Earlier
save*, *Before a restore*, or *Before a link rewrite*. Tap one to read it rendered. **Restore
this revision** asks first, then writes it back through the same write path — so the text it
replaces is kept as a version too, the open editor takes the result as an undoable change, and
the toast carries an **Undo**.

What keeps the store from growing without limit:

- **Close saves merge.** Two autosaves closer than five minutes keep only the *older* version. So
  an afternoon of typing leaves one version per five-minute window — and the one it leaves is the
  text from *before* the burst, which is the one that predates the mistake. A restore is exempt:
  the text it overwrites is always kept.
- **Caps in three directions.** At most forty versions per note (the oldest goes); a note over
  2 MB is not versioned; and the whole store is held under 500 MB by evicting the oldest version
  anywhere. Every file is written by temp-file-and-rename at mode `0600`, like everything else in
  the data directory.
- **A rename moves the folder.** A renamed note, or a note inside a moved folder, keeps its past
  under its new name. A note restored from the trash to a name beside its original (because the
  original was taken) takes its versions with it.
- **A deleted note keeps its versions until you empty the trash.** The trash is the promise that a
  delete is recoverable, and the versions are part of what that means. Erasing an entry for good
  from the trash browser erases its versions too — unless a live note has since taken the same
  path, in which case the history is that note's own.
- **Off is a setting.** Settings → **Vault** → *Keep note versions*, or `NOTE_VERSIONS=off` in
  `.env` as that instance's default. When it is off, the History section says so and offers the
  switch. Versions never travel: they live in `ASTROLABE_DATA`, which sync never stages, and a
  visitor cannot list, read or restore them.

Versions do not replace the backup. They are on this machine, in this instance's data directory,
and they thin out with time. Git is what makes a note's past leave the building. The two stand
together in the panel for that reason: one is always there, the other is the one worth turning
on.

The API, admin-only: `GET /api/versions?path=` lists them newest first (`{ enabled, versions }`),
`GET /api/versions/one?path=&at=` answers one version's text, and `POST /api/versions/restore`
`{ path, at }` writes it back through the ordinary write path and emits the vault's `changed`
event. A visitor gets `401` from all three.

## Two servers, one vault

It is perfectly ordinary to end up with **two Astrolabe servers over the same folder**. The
desktop app runs a server of its own, and plenty of people also keep one running as a system
service so they can reach the vault from a browser. A `git pull`, Obsidian, Syncthing or a text
editor writing into the same folder is the same situation with a different second writer.

**The guarantee: a note you did not save cannot be overwritten by a stale copy somebody else was
still holding.** Every save the editor makes carries the modification time of the file it was
loaded from, and the server refuses the write — `409`, nothing touched — if the file on disk is
no longer that one. Nothing is lost when this happens: your text stays in the editor, autosave
pauses so the next keystroke cannot overwrite the newer version, and a strip above the note
offers the two ways out — **Keep my version** (write yours over the newer file) or **Use the
disk version** (take theirs, undoably).

This needed saying out loud because of a real incident. A note was published from the browser;
the desktop app had been open for days with that note loaded from *before* the publish. Each
server watches the vault for its own connected clients, so the "this file changed" message never
reached the sleeping desktop app — and a browser's event stream replays nothing it missed while
the laptop was shut. The refusal above is what kept the note safe. What was missing was any way
to find out *before* trying to save.

So Astrolabe now **re-checks when it wakes up**: when its connection to the server comes back,
or when you return to a window that had been hidden, it asks the server for the current state of
the notes you have open. Ones you have not touched reload silently; one with unsaved edits gets
the same resolution strip immediately, while you are looking at it, instead of interrupting you
later.

Two things worth knowing about the arrangement:

- **No note is locked.** Neither server owns the vault, and either can be stopped at any time.
  The refusal above is a check made at the moment of writing, not a reservation made in advance.
  Backup & sync is the one deliberate exception, for the reason in the next section: a commit is
  a whole-vault operation with a single git index, so two cannot run at once.
- **Scripts and older clients still work.** A write with no modification time attached — `curl`,
  a script of your own, an older desktop build — behaves exactly as it always did: the last
  writer wins. The check is opt-in, and only clients that can handle a refusal ask for one.

If you run two servers, point both at the same vault directory and give them **different data
directories** (`ASTROLABE_DATA`) — unless you also want them to share sessions and settings.

### One sync at a time — across every server

Notes are written one at a time. A **commit, though, is written for the whole vault at once**,
through a single `.git/index` that git guards with a lock of its own. Two Astrolabes committing
the same folder in the same second do not produce two backups: one of them dies with *"Another
git process seems to be running in this repository"*, possibly having already staged half the
vault. That is not hypothetical. It is why sync used to be worth running only by hand on a
machine that also ran the desktop app.

So every pass that changes the repository — **Sync now**, **Snapshot now**, **Initialize
repository**, and every scheduled tick — first takes a lock file at `.git/astrolabe-sync.lock`,
and holds it until the pass is over. Only one such file can exist, so only one pass runs at a
time **across every process sharing that vault**: the desktop app, a system service, a second
terminal, a scheduled interval. This is what makes an automatic interval safe to leave on next
to a desktop app.

- **What contention looks like.** A **Sync now** that arrives while another Astrolabe is mid-pass
  is not an error and does not retry. The backup panel's last line says *"Another Astrolabe is
  syncing this vault (pid …) — this pass did nothing"*, naming the process that holds the lock,
  and the status symbol reads as busy for as long as the other one is working. **Snapshot now**
  and **Initialize repository** answer `409` with the same sentence. A scheduled tick that finds
  the vault locked simply skips and tries again next time; it records nothing.
- **How a crash recovers.** A lock file is just a file — nothing in the operating system removes
  it when its owner dies — so an Astrolabe killed mid-sync would otherwise jam backup forever.
  Any other process may break the lock when **the process that took it is gone** (the lock
  records its process id and hostname, checked against the machine's own process table) or when
  **nothing has touched it for fifteen minutes**. Either way the break is logged as a warning
  naming the dead holder. A pass that is merely slow is never mistaken for a dead one: a live
  holder refreshes the lock every minute while it works.
- **What it does not cover.** The lock is advisory — it only stops programs that look for it —
  so your own `git commit` in a terminal is unaffected; that has always been git's own
  `index.lock` to arbitrate. And two *machines* sharing one vault over a network filesystem is
  outside what this lock guarantees: whether one side or both can create the lock file at the
  same instant depends on the network filesystem, and the fifteen-minute age check is the only
  recovery there.

## Settings travel with the vault

**The instance's own configuration travels too.** `settings.json` (site name, tagline, logo,
language, home note, folders, typography, calendars, the sync settings themselves), the
designer's `designs.json`, `custom.css` and your custom fonts are mirrored from
`ASTROLABE_DATA` into `<vault>/.astrolabe/` and back — every few seconds and once at boot, newest
copy wins, on every server over the folder. The first time a server meets the vault's copy of a
file, the vault wins outright, so a fresh machine takes the site's settings rather than pushing
its own defaults over them. Set the site name on the hosted instance, and the desktop app on the
other machine has it after its next pull; upload a logo in the designer on the laptop, and the
site shows it after the next push. So do the ledgers that are yours rather than the machine's:
your named layouts, the book shelf with the page each book was left on, and your notes to self on
words. A value a hosted
instance takes from its `.env` (`SITE_NAME`, `SITE_TAGLINE`, `HOME_NOTE`…) is that server's alone
until it is saved in the settings panel, which writes it into `settings.json` and so into the
vault.

The settings on the **This device** tab — theme, interface and editor language, vim, the writing
column's width, heading numbers, the formatting toolbar, which side the sidebar hangs on — are
kept in **one file inside the vault**, `.astrolabe/prefs.json`, and every server over that folder
reads it: the desktop app on your Linux machine, the desktop app on your Windows machine, and
the hosted instance your phone opens. Change the theme on one, and the next launch of the others
has it. There is no account and nothing to configure: whatever carries your notes between
machines (Syncthing, git sync, a shared disk) carries the file with them, and a hosted instance
and a desktop app over the same folder need nothing at all.

Each device pushes what it changes a second after the change, and pulls the file before it draws
anything, so a setting never arrives mid-session and moves things under you. Per key, the newest
change wins, and a setting cleared on one device clears on the next rather than coming back from
it. What travels is what a person would call a setting. Tabs, the workspace, pane widths, the
tags shelf's height, fold state and every collapsed flag describe *this window on this screen*,
and stay where they are. **Settings → This device → Settings travel with the vault** switches it
off for a device that should keep its own. The file is admin-only and never reaches a visitor.
If you keep the vault in git, commit `.astrolabe/` — it is not in the
[ignore advice](#gitignore-advice) because you want it.

The test is simple: install Astrolabe on a new machine, point it at the vault, and everything you
set up is there. This is what that means, item by item.

| Travels with the vault | Stays on the device, and why |
| --- | --- |
| The site: name, tagline, logo, language, home note, folders, typography, calendars, sync settings | The git token: a credential is one machine's |
| The designer's documents and custom themes, `custom.css`, every font you chose or uploaded | Note history (versions): large, and git is its durable copy |
| Named layouts, the book shelf and where each book was left off, notes to self on words | Comments left on the public site: they belong to the site that received them |
| Your preferences: theme, interface and editor language, vim keys and relative line numbers, editor width, heading numbers, the formatting toolbar, the sidebar's side, the tag sort, the what's-new switch | Screen warmth and dimming: they answer one screen's light |
| | Offline reading and software updates: one machine's choice about its own disk and network |
| | Tabs, panes, pane widths, fold state, collapsed sections: this window on this screen |

## Things worth knowing

- Every git call is an `execFile` with a fixed list of arguments. No command line that could
  be tampered with is involved anywhere, and the remote URL and branch name are validated (the
  URL's scheme, no shell characters, no embedded credentials, a valid branch name) before they
  are ever handed over. A `user@` that *looks like a
  token* (`ghp_…`, `github_pat_…`, `glpat-…`) is refused on every scheme, including the scp-style
  `git@host:path` and `ssh://` forms where a plain username is fine.
- The git process Astrolabe starts gets a **scrubbed environment**: `GIT_DIR`, `GIT_WORK_TREE`,
  `GIT_INDEX_FILE`, the object-directory variables, `GIT_CONFIG*` (including
  `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_n`), `GIT_SSH`, `GIT_SSH_COMMAND`, `GIT_PROXY_COMMAND` and
  `GIT_EXTERNAL_DIFF` are all removed, so nothing in the server's own environment can point git
  at another repository, another config, or another transport. If you *need* a custom SSH
  command — a specific deploy key, say — set **`ASTROLABE_GIT_SSH_COMMAND`** (e.g.
  `ASTROLABE_GIT_SSH_COMMAND="ssh -i /path/to/vault_ed25519 -o IdentitiesOnly=yes"`) and
  Astrolabe passes exactly that to git as `GIT_SSH_COMMAND`.
- "Ahead / behind" has a third state. Until a fetch or a push has succeeded once there is no
  remote branch to compare against, so the panel says **"Nothing has reached the remote yet"**
  rather than "0 ahead · 0 behind" — which is what a fully backed-up vault reads.
- Sync is admin-only, including for an admin previewing the public site. Visitors cannot even
  read the status — the branch, the dirty count and the remote host say too much about you.
- Only one sync runs at a time, and that means *at a time on this vault*, not merely in this
  server: a second request inside the same process answers `409` immediately, and a pass started
  by another Astrolabe over the same folder is held off by the lock file described above.
- A failing scheduled sync is logged **once**, not once per tick.
- If the machine has no git identity configured, commits are made as `Astrolabe
  <astrolabe@localhost>`; set `user.name`/`user.email` in the vault (or globally) to use your own.
- The API, for anyone scripting it (admin-only): `GET /api/sync/status`, `POST /api/sync/init`,
  `POST /api/sync/now`, `POST /api/sync/snapshot` (a local commit, no network), plus the two
  read-only history routes — `GET /api/history?path=` and `GET /api/history/blob?path=&sha=`. The
  blob route wants the path **that revision** lives under, which the listing gives you per row: a
  note that has been renamed lives under its old name in its older commits.
