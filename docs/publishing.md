# Publishing & access

*Who can read, who can edit, the `publish:` flag, previewing your site as a visitor, putting it on the internet, and reader comments.*

← [Back to the README](../README.md) · [All docs](README.md)

---

## Public reading, admin editing

Astrolabe has two kinds of people: **visitors**, who read, and **the admin**, who edits. You are
the admin. A visitor is anyone else who opens the site.

Fresh out of the box there is no password, so the app runs in **open local mode**: every visitor
is treated as the admin, and a warning says so at startup. That is fine on your own laptop. It is
not fine on a network you do not fully trust, so before you put a vault there, set an admin
password:

```sh
cp .env.example .env
npm run hash-password        # prompts for a password, prints an argon2id hash
```

The script does not print your password. It prints a *hash* of it — a scrambled form the server
can check a password against but cannot turn back into the password. Put that hash in `.env`
inside single quotes (it contains `$` characters, which a shell would otherwise try to
interpret), and add a long random string for signing login cookies:

```sh
ADMIN_PASSWORD_HASH='$argon2id$v=19$m=65536,...'
SESSION_SECRET=some-long-random-string   # e.g. openssl rand -hex 32
```

Once a hash is set, visitors get the **reading view**: notes fully rendered, search, the graph,
backlinks — but no editor, and no way to create, rename or delete anything. A quiet **Sign in**
link in the status bar opens the login dialog. The right password sets a signed cookie and
unlocks editing on the spot, without reloading the page. Two more keys shape this: `PUBLIC=false`
makes even *reading* require a login, and `HOME_NOTE` chooses the note a first-time visitor
lands on.

**`PUBLIC=false` requires a password, and the server refuses to start without one.** Without
`ADMIN_PASSWORD_HASH` there is no such thing as "logged in", so "private" would mean the exact
opposite: every anonymous request would be treated as the admin. Rather than start like that,
Astrolabe prints the `npm run hash-password` line and exits. (Running deliberately open on a
trusted network is still fine — just don't also claim to be private.) For the same reason,
**[backup & sync](backup-and-sync.md) needs a password in every mode**: without one, anyone who
can reach the port could point the git remote at their own server and push your whole vault to it.

**Sessions.** A *session* is the server's memory that you logged in; it lives in a cookie in your
browser. The cookie cannot be read by page scripts (`httpOnly`), is not sent on cross-site
requests (`SameSite=Lax`), and is marked `Secure` whenever the request came over HTTPS — either
directly, or through a proxy listed in `TRUSTED_PROXIES` that says so with `X-Forwarded-Proto`.
Set `SECURE_COOKIES=true` or `false` to decide this yourself, for example `false` on a home
network over plain http. A session lasts **7 days** and renews itself while you use the app.
**Signing out signs you out everywhere**, on every device, immediately: each session carries a
number stored in `ASTROLABE_DATA`, and signing out bumps that number, so every older cookie
stops working. **Changing `ADMIN_PASSWORD_HASH` does the same** — every cookie issued under the
old password dies the moment the new one is in place, which is exactly what you want after a
laptop goes missing. (Upgrading Astrolabe also invalidates existing sessions once; you sign in
again.)

**Login rate limit.** Ten failed attempts per minute per IP address, plus a global ceiling. The
slot is taken *before* the password is checked, so a thousand guesses fired at once are still
only ten guesses. And at most two passwords are being verified at any moment — each argon2id
check costs 64 MB of memory by design — so a flood of login attempts cannot starve the server
that is also serving your notes.

## What counts as published

Exactly one thing: `publish: true` in a note's frontmatter. (The *frontmatter* is the block
between two `---` lines at the top of a note, where its properties live.)

```yaml
---
title: On Marginalia
publish: true
tags: [writing]
date: 2026-08-16
---
```

`Ctrl/Cmd Shift P` flips the flag on the open note, and so do **Publish note** / **Unpublish
note** in the command palette. The change is a one-line edit of the frontmatter; the rest of the
file is untouched. A `.tex` note carries the same flag in [its own comment block](latex.md) and
publishes the same way.

Everything a visitor can see follows from that flag. The tree, search, the graph, backlinks, the
post list, the RSS feed and the live event stream are all recomputed for each request against
the set of published notes. So an unpublished note is not merely hidden: to a visitor it is
indistinguishable from a note that does not exist. Attachments follow their note — a published
note's banner and embedded images can be fetched, an unpublished note's cannot.

Two settings can *narrow* what visitors see further, without unpublishing anything:
[`EXCLUDE_TAGS`](configuration.md#environment-variables) hides chosen tags from the public
topic lists, and the [language filter](arabic-and-rtl.md#language-filter) hides notes not
written in a chosen language. Both are curation — a way to tidy the front. `publish: false` is
the switch that actually locks the door.

One frontmatter key *widens* rather than narrows: `folders:` names the
[public folders](blog-mode.md#custom-public-folders) a published note belongs to — collections
you define on the blog, beside the topics its tags create. It does not affect whether the note
is published, and it does nothing until you declare a folder with that address in Settings.

## Preview as visitor

While signed in, you can see the site exactly as a visitor would, at any time: click the eye
icon in the status bar, or run **Preview as visitor** from the command palette. This is not a
client-side imitation. Every request is re-scoped on the server through the same code a
stranger's request goes through (published-only tree, search, graph, event feed), so what you
see is byte-for-byte what the public site serves. A slim gold banner marks the mode, and **Exit
preview** returns you to the full app on the same note. A page reload always ends the preview.

The note you are on stays on screen. If the public site hides it behind the [language
filter](arabic-and-rtl.md#language-filter) — an Arabic note previewed on an English site, say —
it is shown the way a reader of that language would see it: the preview borrows that reader
language for as long as it lasts, says so in a toast, and gives it back when you exit. A note
that is simply not published shows the empty state, exactly as it would for a visitor.

On a **private** instance (`PUBLIC=false`, which is how the desktop app runs a vault) there is
nothing to preview: a visitor would meet the sign-in page and nothing else. The eye says so in a
toast and leaves you where you are. Preview your writing on the hosted instance that publishes it.

## Putting it on the internet

Run Astrolabe behind any HTTPS *reverse proxy* — a web server that sits in front of the app,
holds the TLS certificate, and forwards requests to `localhost:6801`. Caddy, nginx and a
Cloudflare tunnel all work. The app is a single origin (the API and the client on one port), so
no special proxy rules are needed. Just make sure it can only be reached over HTTPS, so the
password and the session cookie never travel in the clear.

When you do sit it behind a proxy, also set `TRUSTED_PROXIES` to the proxy's address (for
example `TRUSTED_PROXIES=127.0.0.1,::1`). Then the login rate limit counts by the real visitor's
address, taken from the `X-Forwarded-For` header, instead of lumping every visitor together as
the proxy's address. The header is trusted only when the connection comes from a listed address;
otherwise it is ignored, because anyone can forge it.

Request sizes are capped on the server before anything reads them: 10 MB on any `/api` request,
and a much smaller 64 KB on the two things anonymous visitors can send (comments and login
attempts). Anything bigger is refused with HTTP 413 rather than held in memory. A matching cap
at the proxy is a sensible extra layer — in nginx, `client_max_body_size 10m;`.

## Comments

Set `COMMENTS=on` (or flip the toggle in Settings → Publishing & comments) and every
**published** note grows a quiet **Marginalia** section under its reading view, where visitors
can leave a plain-text note. A name is optional; without one the comment says "Anonymous". While
comments are off (the default) the feature is completely dark: no interface, and the API routes
answer 404.

Moderation is built in for the admin. Each comment has a quiet delete `×` (it asks before doing
anything irreversible) and an eye toggle that **hides** the comment instead. A hidden comment
vanishes for visitors but stays in the database; the admin sees it greyed out with a "hidden"
chip and can unhide it at any time. **Moderate comments** in the command palette opens a panel
of the newest comments across every note — author, a snippet, and the note it belongs to (click
to jump there) — with the same hide and delete controls.

Comments are stored in an SQLite file at `ASTROLABE_DATA/comments.db` (created when first
needed, ignored by git) using Node's built-in `node:sqlite`, so there is nothing extra to
install. The abuse controls are built in too: a comment request over 64 KB is refused before
anything parses it; posting is limited to 5 comments per minute per IP address (using
`TRUSTED_PROXIES` for the real address, the same as login); a comment is at most 2000 characters
of plain text (always shown escaped, never as HTML or Markdown) and a name at most 40; and the
form carries a hidden field that silently swallows submissions from bots. Comments can only be
read or written on notes with `publish: true`; for any other path the API answers the same 404 a
missing note would, so unpublished paths stay unguessable. With `PUBLIC=false` (a fully private
vault), visitors can neither read nor post comments at all.

## The three public shells

A *shell* is the frame a visitor sees around your notes. There are three, chosen with
`PUBLIC_LAYOUT`:

| `PUBLIC_LAYOUT` | What a visitor gets |
| --- | --- |
| `app` *(default)* | The application itself, read-only: sidebar, tabs, graph, search — no editor |
| `blog` | A classic blog: masthead, topic nav, article pages, RSS, comments — see [Blog mode](blog-mode.md) |
| `designed` | A homepage you compose yourself out of sections — see [Designer](designer.md) |

None of them changes anything for you. Signed in, you always get the full app, sidebar and all.
The shell exists for visitors only.
