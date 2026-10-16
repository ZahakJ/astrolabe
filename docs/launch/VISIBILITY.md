# Visibility plan

Drafts and a checklist. Nothing here is posted or applied automatically; each step is a decision.

## 1. Repository metadata

**Description** (GitHub, About box):

> A self-hosted, open-source alternative to Obsidian: notes, graph and a built-in blog. Web, desktop and Android.

**Website:** `https://zahakj.github.io/astrolabe/` (already set).

**Topics**, in this order (GitHub allows 20):

```
obsidian-alternative  note-taking  markdown  knowledge-base  pkm  self-hosted  blog
wikilinks  digital-garden  publishing  second-brain  zettelkasten  latex  rtl
spaced-repetition  codemirror6  pwa  electron  nodejs  typescript
```

Right-to-left support is one feature among many: `rtl` covers it, and `arabic` stays out of the
list.

**Social preview image:** upload `docs/gh-hero-v3.png` under Settings → General → Social preview, so
links shared on chat apps and forums show the mark instead of a generic card.

## 2. Labels

`bug`, `enhancement`, `documentation`, `good first issue`, `help wanted`, `question`,
`accessibility` exist. Add:

| Label | Colour | For |
| --- | --- | --- |
| `arabic` | `#0e8a16` | Arabic text, RTL layout, Hijri dates, Arabic search |
| `translation` | `#c5def5` | The interface dictionary and the Arabic manual |
| `area: editor` | `#5319e7` | CodeMirror, live preview, tables, embeds |
| `area: publishing` | `#5319e7` | Blog mode, designer, library, comments, feeds |
| `area: server` | `#5319e7` | API, indexer, auth, sync |
| `platform: desktop` | `#bfdadc` | The Electron app |
| `platform: android` | `#bfdadc` | The Android app and the GitHub vault |
| `deployment` | `#fbca04` | Docker, systemd, reverse proxies |
| `needs repro` | `#e4e669` | A bug report that cannot be reproduced yet |

## 3. Good first issues

Each of these is self-contained, has an existing pattern to follow, and can be checked with the
gates in [docs/development.md](../development.md). Open them before any launch post so a visitor who
wants to help has somewhere to start.

**1. Run the no-browser gates on every pull request.** There is no CI. Add
`.github/workflows/check.yml` that runs on `pull_request` with Node 24: `npm ci`,
`npm run typecheck`, `node scripts/check-i18n.mjs`, `npm test`, `npm run check-docs`,
`npm run check-names`, `npm run check-a11y`, `npm run check-whatsnew`, `npm run check-settings`.
None of these needs a browser. Labels: `good first issue`, `help wanted`.

**2. A Dockerfile and a compose example.** Self-hosters expect one. A `node:24-slim` image that
runs `npm ci && npm run build` at build time and `node server/index.ts` at run time, with the vault
and the data directory as volumes (`ASTROLABE_VAULT`, `ASTROLABE_DATA`) and `HOST=0.0.0.0`. Add a
short "With Docker" section to `docs/publishing.md` and its Arabic twin. Labels: `deployment`,
`good first issue`.

**3. Copy-paste reverse-proxy and systemd examples.** `docs/publishing.md` → *Putting it on the
internet* names Caddy and nginx but gives no configuration. Add a minimal Caddyfile, an nginx
server block (with `client_max_body_size` and the SSE path unbuffered), and a systemd unit, in both
languages. Labels: `documentation`, `deployment`, `good first issue`.

**4. The macOS spelling of the two fold shortcuts.** `docs/keymap.md` → *Sections & folding*
explains that CodeMirror's `foldKeymap` binds the section fold to `Cmd Alt [` on macOS, while the
shortcut sheet prints `Ctrl/Cmd Shift [`. Give those two rows their real Mac spelling in the sheet
(`client/components/ShortcutsHelp.tsx`), update the table, remove the correction paragraph, and
keep `npm run check-keymap` passing. Labels: `area: editor`, `good first issue`.

**5. Recapture the documentation screenshots with a realistic vault.** Several captures in
`docs/screenshots/` show placeholder text (lorem ipsum, "a scratch note written for a design
verification run"). Write a small sample vault with real-looking notes in English and Arabic under
`scratchpad/`, then rerun `scripts/shoot.mjs` and the other harnesses listed in
docs/development.md → *Screenshot harnesses*. Labels: `documentation`, `good first issue`.

**6. An Arabic capture for the README and the landing page.** Nothing on the front page shows the
mirrored interface, which is the main thing that sets the project apart. `node scripts/shoot-rtl.mjs`
with `LANGSET=ar` produces one; pick the editor and a published post, add them to
`docs/screenshots/`, and use them in `README.md` and `docs/index.html`. Labels: `arabic`,
`documentation`, `good first issue`.

**7. Import a Joplin export.** `server/import/` has one converter per source (Notion, Evernote,
Obsidian) behind the shared shape in `server/import/common.ts`. Add `joplin.ts` for Joplin's
"Markdown + Front Matter" export: one folder per notebook, frontmatter already present, resources in
`_resources/`. Follow `obsidian.ts`, add fixtures and a test, and add a paragraph to
`docs/import.md` and `docs/ar/import.md`. Labels: `enhancement`, `area: server`.

**8. Import a Logseq file graph.** Same pattern as 7. A Logseq graph is `pages/` and `journals/`;
page properties are `key:: value` lines at the top and should become frontmatter; journal files
(`2026_10_14.md`) should land where daily notes go. Outline bullets can stay as they are. Labels:
`enhancement`, `area: server`.

**9. An Arabic README.** Translate the README into `README.ar.md` and link it from the first line
of `README.md`. The Arabic manual under `docs/ar/` has the established terms (خزانة for vault,
etc.); reuse them. Labels: `arabic`, `translation`, `good first issue`.

**10. Proofread one Arabic manual page.** One issue per page under `docs/ar/`: read it against the
English twin, fix wording that reads as translated, keep the heading structure identical
(`npm run check-docs` enforces it). Good for Arabic speakers who do not write TypeScript. Labels:
`arabic`, `translation`, `good first issue`.

**11. Version and platform in the bug report.** The bug template asks for the version by hand. Add
a "Copy diagnostics" button to Settings → About that copies the version, the shell (browser,
desktop, Android), the interface language and the user agent, in both languages through
`client/i18n/`. Labels: `enhancement`, `good first issue`.

## 4. Release notes

- Every release already has a What's new deck in the app. Use the same points, in plain text, as
  the GitHub release body: what changed, one line each, with a link to the manual page.
- Lead with anything that needs action: a changed setting, a migration, a minimum Node version.
- List the assets with what each is for (AppImage: any Linux; deb: Debian/Ubuntu; pacman: Arch;
  exe: Windows; apk: Android) and keep the `SHA256SUMS` file.
- Patch releases get a one-paragraph body. Minor releases get a short list.
- Credit contributors by handle in the release that ships their change.
- Write for someone choosing a notes app. Lead with what a reader of the notes or the site gets;
  language support is a feature line like any other, not the headline.

## 5. The comparison page

[comparison.md](../comparison.md) states where Astrolabe sits against Obsidian, Logseq and
Joplin, with sources. Link it from launch posts instead of arguing the comparison in comments.
Recheck the other tools' prices and features before each launch and update the "as of" date; an
out-of-date claim about another project is the fastest way to lose a thread.

## 6. Where to launch, and when

Before any post:

- The no-browser gates running in CI (issue 1) and a Docker image (issue 2). On r/selfhosted the
  first question will be "is there a Docker image?"
- Screenshots with real content, including one in Arabic (issues 5 and 6).
- A public read-only demo: a published blog on a small VPS, so people can look without installing.
- The good-first issues above, opened and labelled.
- A free afternoon after each post to answer every comment.

Order and spacing (one venue at a time, a few days apart, so each thread gets full attention and
feedback from one can be fixed before the next):

| Venue | When | Notes |
| --- | --- | --- |
| Show HN | Tuesday to Thursday, 8–10 am US Eastern | The title starts with "Show HN:". The post must link something people can try. Stay in the thread for the first few hours. Do not ask anyone to upvote. |
| r/selfhosted | A few days later | Check the sidebar first: the subreddit has had rules limiting posts about new projects to a set day or thread, and rules about disclosure. Lead with deployment. |
| r/PKMS | The following week | Tool-agnostic and workflow-minded; lead with what the app is for, not the feature count. |
| r/ObsidianMD | Last, and only if the rules allow it | The subreddit is for Obsidian. Read the rules on posts about other tools, and consider asking the moderators first. Lead with vault compatibility. |
| Arabic-speaking communities | Alongside or after r/PKMS | See below. |

**Arabic-speaking communities.** The Arabic interface and manual are what no other tool in the
comparison offers, so this audience matters more than the size of any one forum suggests. Places to
consider: the programming and free-software communities on Hsoub I/O (حسوب I/O); Arabic developer
and open-source circles on X and Mastodon; Arabic note-taking and Obsidian groups on Telegram and
Discord. Post in Arabic, written for that audience rather than translated from the English post, and
link the Arabic manual (`/site/ar/`). Confirm each community's rules on announcements first.

What to have ready for any venue: the one-line install, the release link, two or three
screenshots (one in Arabic), the comparison page, and a short answer to "why not just use
Obsidian?" (see the draft posts).
