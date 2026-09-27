# Docs audit — 3.19.0 to 3.38.0

The owner asked whether every feature the what's-new deck and [releases.md](releases.md) promised since 3.19.0 is in the manual, correctly, in both languages. This is that audit, taken against the code at 3.38.0 (not against what each round's slide said at the time), and the fixes it led to. Part of the module contracts (see [CONTRACTS.md](../CONTRACTS.md) for the map).

**How it was checked.** For each promise on a slide (`client/whatsnew/releaseNotes.ts`) and each line in releases.md: the page and section in `docs/` and `docs/ar/`; the names, defaults, paths, keys and commands in the prose against the source (`client/i18n/en.ts` and `ar.ts` for labels, `server/settings.ts` and `shared/*.ts` for keys and defaults, `client/components/settings/*` through the settings index for paths, `desktop/electron-builder.yml` and `electron/*` for the desktop); and the Arabic twin against the English, section by section. Settings paths were read from the settings index as it stands (`scripts/settings-index.mjs`), not from the slides: the 3.30, 3.32, 3.33 and 3.35 slides name *Publishing* and *Language & dates* paths that 3.38.0 moved, and they are history, left as written.

> **Settings paths may move again.** The settings panel is being changed in the release after 3.38.0. Every `Settings → …` path in the manual is held to the panel by `npm run check-docs`, so a path that stops existing fails the build; a path that still exists but no longer describes where a thing lives (a row moved behind an Advanced line, say) does not, and wants this kind of reading again.

Status is **as found**, before the fix: *documented* (present, correct in both languages), *stale* (present, but the code has moved on), *missing* (absent from one or both languages), *mismatched-with-code* (present, and says something the code does not do).

## The table

| Feature | Release | en page#section | ar page#section | Status | Fix |
| --- | --- | --- | --- | --- | --- |
| A sigil can be a course: `mode: course`, units, `days`, `capacity`, projected dates, step keys, Skip, the calendar's projection | 3.19.0 | sigils.md#a-course | sigils.md#المسار | documented | — |
| Tables edited in the grid: Tab/Enter/arrows, `Shift F10` menu (rows, columns, alignment, sorting, Edit as Markdown), one undo each | 3.19.0 | editor.md#tables; keymap.md#tables | editor.md#الجداول; keymap.md#الجداول | documented | — (menu labels checked against `table*` keys in i18n) |
| 44-px targets, the notch, Android back closes what is open | 3.19.0 | workspace.md#on-a-phone ("Every target is a finger's width") | workspace.md#على-الهاتف | documented | — |
| Panes follow the hand; `Ctrl/Cmd =`, `−`, `0` zoom with the percentage shown | 3.19.0 | workspace.md#panes; desktop.md#vaults-and-windows | workspace.md#اللوحات; desktop.md#الخزائن-والنوافذ | documented | — |
| A shelf root, said once (Settings → Collections → The library → Shelf roots) | 3.19.0 | library.md | library.md | documented | — |
| EPUB: same shelf, place = chapter and how far, own Naskh at any size, `o` contents, `/` search, `c` citation carrying words, no highlights yet | 3.20.0 | books.md#epub | books.md#epub | documented | — (keys checked in `client/epub/EpubReader.tsx`) |
| Search folds Arabic as typed (one table, `shared/fold.ts`, EPUB search on the server) | 3.20.0 | arabic-and-rtl.md#searching-in-arabic | arabic-and-rtl.md#البحث-بالعربية | documented | — |
| "Search inside books" switch location | 3.20.0 / 3.38.0 | books.md#searching-inside-every-book | books.md#البحث-داخل-كل-كتاب | stale | said *Settings › Vault*, a section that no longer exists; now Settings → Reading & speech, in both languages |
| Linguistic twins: `twin:`, the `EN ⇄ ع` pill, `Ctrl/Cmd Alt L`, Create twin…, Open twin beside, `face:`, one graph node | 3.21.0 | templates-and-notes.md#linguistic-twins; keymap.md | templates-and-notes.md#التوأم-اللغوي; keymap.md | documented | — |
| Twins on the site: `hreflang`, sitemap alternates, ع leads to the other face | 3.21.0 | blog-mode.md#rss-sitemap-and-seo | blog-mode.md#rss-وخريطة-الموقع-وتحسين-محركات-البحث | documented | — |
| The pocket: GitHub sign-in, private repository, every save a commit, conflicts kept side by side, Leave this vault | 3.22.0 | mobile.md#a-vault-from-github | mobile.md#خزانة-من-github | documented | — |
| The pocket's Settings: what is drawn and what is not | 3.22.0 / 3.38.0 | mobile.md#settings-and-the-tab-that-belongs-to-the-phone | mobile.md#الإعدادات-واللسان-الذي-يخصّ-الهاتف | stale | said "**Publishing** and **Collections** are not there"; Publishing is now a group inside Your site, whose instance-only rows are not drawn, and Ask is absent too (`TabBody.tsx`); rewritten in both |
| The pocket and webmentions | 3.30.0 / 3.38.0 | webmentions.md#what-stays-on-the-machine | webmentions.md#ما-يبقى-على-الجهاز | stale | "it has no Publishing tab" → its Settings → Your site has no Webmentions or Fediverse row |
| The pocket and Ask | 3.24.0 | ask.md | ask.md | missing | a paragraph in both: no Ask section, every door says it needs a server (`mobile/src/pocket/server.ts`) |
| The drawer shell (3.23.0), superseded and deleted in 3.27.0 — no page may still describe it | 3.23.0 / 3.27.0 | arabic-and-rtl.md (intro) | arabic-and-rtl.md (intro) | stale | "the Classic layout's drawer, likewise, from the right" removed in both; no other mention found |
| Ask the vault: meaning search, Related, Suggest links, answers citing passages, says so when the notes are silent, Anthropic only by choice | 3.24.0 | ask.md | ask.md | documented | — |
| Settings → Ask rows: order, and Embedding model / Passages per answer behind Advanced | 3.24.0 / 3.38.0 | ask.md#settings--ask | ask.md#الإعدادات--اسأل | stale | table reordered as the panel draws it (Status before the two), both marked *Advanced*, one sentence on the Advanced line; defaults checked in `server/askSettings.ts` |
| `OLLAMA_HOST` in the environment table | 3.24.0 | configuration.md#environment-variables | configuration.md#متغيرات-البيئة | stale | the row was split over two lines and rendered outside the table in both languages; joined |
| Voice notes: hold or tap, today's inbox line or a note of its own, recordings as attachments, Keep voice recordings | 3.25.0 | capture.md#voice | capture.md#الصوت | documented | — |
| Voice notes without a GPU: ONNX on the processor (physical cores up to eight), Auto / Processor only, silent fallback named in the status line, Small the default, a chosen large turbo kept, thirty-second windows | 3.33.1 | capture.md#voice | capture.md#الصوت | documented | — (labels and `VOICE_MODEL_DEFAULT = "small-q5_1"` checked in `shared/voice.ts`) |
| The desktop ships no graphics-card whisper build (about 50 MB smaller) | 3.33.2 | capture.md#voice; desktop.md | capture.md#الصوت; desktop.md | missing (desktop page) | capture.md had it; desktop.md in both languages gains *Voice notes are heard on the processor* (`desktop/electron-builder.yml` excludes the CUDA and Vulkan builds) |
| The phone shell: five doors, screens and sheets, the note screen and its keyboard row, the ⋯ sheet, the back gesture, a tablet side by side | 3.26.0 | workspace.md#on-a-phone | workspace.md#على-الهاتف | documented | — (`PHONE_SHELL_QUERY` 700 px / coarse pointer checked) |
| Every surface a screen: Orbits and Sigils lists, Study full screen, a book's slim bar and slider, Settings as a list that asks before Back discards | 3.27.0 | workspace.md#on-a-phone | workspace.md#على-الهاتف | documented | — |
| Back means up: folder ‹ to its parent, the stack kept over a reload, crumbs, Tree / Folders, media folded into one row, New note here, pull to refresh, two columns by the screen's shape with a grip | 3.34.0 | workspace.md#on-a-phone; mobile.md (Galaxy Z Fold) | workspace.md#على-الهاتف; mobile.md | documented | — (`TABLET_QUERY` 640 px checked) |
| A #tag tapped on the phone opens the tag's screen | 3.35.1 | workspace.md#on-a-phone | workspace.md#على-الهاتف | documented | — |
| Feeds: a list in a note, fetching off until switched on (Settings → Reading & speech → Feeds, *Fetch feeds*), its own page, Keep | 3.28.0 | feeds.md | feeds.md | documented | — |
| The import wizard: Notion, Evernote, Obsidian into a folder, previewed, undone with one button | 3.28.0 | import.md | import.md | documented | — |
| Where Settings names the import doors | 3.28.0 / 3.38.0 | import.md (intro) | import.md (intro) | stale | "the Vault tab says where these doors are" → Settings → Writing → Capture names them, in one line above the capture inbox (`WritingTab.tsx`, `importDoorsNote`) |
| Today on the desktop: the day's note, sigils and cards due, tasks due, on this day, the evening question from six | 3.29.0 | today.md | today.md | documented | — (`EVENING_HOUR = 18` in `shared/reflection.ts`) |
| The Timeline: newest first, chips by kind, folder and tag, the Months rail | 3.29.0 | timeline.md#filters-and-the-months | timeline.md#المرشِّحات-والأشهر | documented | — |
| Year in review… | 3.29.0 | timeline.md#year-in-review | timeline.md#حصاد-السنة | documented | — |
| Webmentions received into moderation and sent on publish; the blog as one ActivityPub account; three switches, all off | 3.30.0 | webmentions.md | webmentions.md | documented | — (Settings → Your site → Conversation) |
| The update nag told apart: one reload per deploy, a stale build named once | 3.30.2 | configuration.md#updating-a-server-you-run-yourself | configuration.md#تحديث-خادم-تشغّله-بنفسك | documented | — (`newBuildOnServer`, `staleBuildOnServer`) |
| Embeds you can pick up: drag within, between and out; the one menu; Rename rewrites embedders; `/embed`, `![[`, Embed a file…; hold on a phone | 3.31.0 | editor.md#embeds | editor.md#التضمين | documented | — (menu labels checked, `embed*` keys) |
| The language key: status bar ع / EN, More / Settings / the note sheet on a phone, `Ctrl/Cmd Alt Shift L`, the palette in either language | 3.31.0 | arabic-and-rtl.md#switching-the-interface-language; keymap.md | arabic-and-rtl.md#تبديل-لغة-الواجهة; keymap.md | documented | — |
| Video in a note: six containers, `\|480`, `#t=12,30`, `\|poster=`, a card for an unplayable film, drag and menu, the blog player | 3.32.0 | editor.md#embeds; editor.md#rendering | editor.md#التضمين; editor.md#العرض | documented | — |
| What an upload may be: film types and the 256 MB film cap, streamed to disk | 3.32.0 | configuration.md#attachments | configuration.md#المرفقات | stale | said "video (mp4, mov, webm), up to 10 MB each"; now mp4, m4v, mov, webm, mkv, ogv (and oga audio) at 256 MB for a film, 10 MB for the rest (`shared/limits.ts`, `shared/attachments.ts`) |
| A proxy's body cap for films | 3.32.0 | configuration.md#environment-variables | configuration.md#متغيرات-البيئة | missing | editor.md said it; the request-size paragraph now says `256m` if films are dropped into notes |
| YouTube / Vimeo / PeerTube behind a default-off switch (Settings → Your site → Embed external video) | 3.32.0 | editor.md#rendering | editor.md#العرض | documented | — |
| Settings keys added since 3.19: `externalVideo`, `feeds`, `voice`, `speak` (and `speak-local.json`), `webmentions`, `fediverse` | 3.25.0 – 3.36.0 | configuration.md#settings-keys | configuration.md#مفاتيح-الإعدادات | missing | six rows in both languages, values and defaults from `server/settings.ts`, `shared/voice.ts`, `shared/speech.ts`, `shared/feeds.ts`, `shared/fediverse.ts` |
| Read aloud: the selection menu, the chip, `Ctrl/Cmd ⇧ .`, *Read this note aloud*; Light (Piper) and Natural (Kokoro); install into a venv under the data folder; a sentence at a time, lit, cached; device voices said so | 3.33.0 | read-aloud.md; keymap.md | read-aloud.md; keymap.md | documented | — (player speeds `PLAYER_RATES`, cache 500 MB, ten idle minutes, sixty visitor sentences per ten minutes, threads, all checked) |
| The device voice chosen honestly: ▾ per language in the player and in Settings, Windows' own choice, the locale; three states named with the remedy; Install fetches a standalone Python | 3.35.0 | read-aloud.md#this-devices-voices; read-aloud.md#installing; desktop.md | read-aloud.md#أصوات-هذا-الجهاز; read-aloud.md#التثبيت; desktop.md | documented | — (the picker is under Settings → Reading & speech → Read aloud, *This device's voices*, not Language & dates as the slide says) |
| The desktop's zoom survives a relaunch, drawn from the first frame, shown in the View menu | 3.35.0 | desktop.md#vaults-and-windows | desktop.md#الخزائن-والنوافذ | documented | — (`electron/menu.ts`, `windows.ts`) |
| Your own voices: a folder scanned recursively, one voice per speaker, *Your voices* in every picker, kept in `speak-local.json` | 3.36.0 | read-aloud.md#your-own-voices | read-aloud.md#أصواتك-الخاصة | stale | present and correct, but did not say the row now sits behind Reading & speech's Advanced line; added in both |
| The external speaker, only where `SPEAK_EXTERNAL=on`, never for visitors | 3.36.0 | read-aloud.md#an-external-speaker; configuration.md#environment-variables | read-aloud.md#متحدّث-خارجي; configuration.md#متغيرات-البيئة | documented | — |
| The desktop app turns `SPEAK_EXTERNAL` on | 3.36.0 | desktop.md | desktop.md | missing | desktop.md in both gains *The desktop app is its own operator* (`electron/server.ts`) |
| French read as French: each sentence judged with its paragraph and its passage | 3.37.0 | read-aloud.md#which-language | read-aloud.md#بأي-لغة | documented | — |
| espeak-ng's short data copy; the self-test after Install; a failing language handed to the other engine | 3.37.0 | read-aloud.md#which-engine-speaks-which-language-on-this-machine | read-aloud.md#أيّ-محرّك-يقرأ-أيّ-لغة-على-هذا-الجهاز | documented | — |
| Pierre (m) and Jessica (f) downloaded when first chosen; a picked voice spoken by its own engine; (m)/(f) on every voice | 3.37.0 | read-aloud.md#a-mans-voice-a-womans-voice | read-aloud.md#صوت-رجل-صوت-امرأة | documented | — (`speakVoiceMale` / `speakVoiceFemale`) |
| The row "Voice notes: transcription language" | 3.37.0 | capture.md#voice; read-aloud.md#which-language | capture.md#الصوت; read-aloud.md#بأي-لغة | documented | — |
| Pickers in Settings open above the panel | 3.37.0 | configuration.md#attachments ("Every control in the panel is drawn by Astrolabe") | configuration.md#المرفقات | documented | — |
| The settings purge: nine sections by intent, *This device*, the ⓘ under the row, the Save bar only on a change, the Advanced line, search reads the ⓘ, a pocket shows seven | 3.38.0 | configuration.md#the-settings-panel | configuration.md#لوحة-الإعدادات | documented | — (against `settings/tabs.ts`, `TabBody.tsx` and the index) |
| Settings on a phone: the sections as a list, each a screen, Discard / Save | 3.38.0 | workspace.md#on-a-phone; configuration.md#the-settings-panel | workspace.md#على-الهاتف; configuration.md#لوحة-الإعدادات | documented | — |
| Rows the purge moved behind an Advanced line, described where they used to be: the drawings folder ("beside the templates folder"), relative line numbers, the backup branch and Pull first | 3.38.0 | drawing.md#making-one; editor.md; backup-and-sync.md#3-turn-it-on | drawing.md; editor.md; backup-and-sync.md | stale | each now says where it is: behind the section's Advanced line, in both languages |
| The manual's index names the features since 3.19 | 3.19.0 – 3.38.0 | docs/README.md | — (the Arabic site's home is built from the pages' own summaries) | missing | Configuration, Capture, the desktop and Android apps, the editor, templates, Sigils, panes, Arabic & RTL and Read aloud rows now name voice notes, the pocket, zoom, tables, embeds and video, twins, courses, the phone layout, the language key, device and own voices, and the nine sections, with links |
| The README's feature list and documentation table | 3.19.0 – 3.38.0 | README.md#whats-in-it; README.md#documentation | — | missing | Today / Calendar / Timeline and the year in review, Ask the vault, Feeds and import, Webmentions and the fediverse gain bullets; the editor, templates, panes, Sigils, Capture, Arabic, Read aloud and Android bullets name tables and embeds, twins, the phone layout, courses, voice notes, the language key, own voices and the pocket; the documentation table gains Ask, Today, Calendar, Timeline, Feeds, Import, the library and Webmentions |

Not audited as reader features: the 3.29.1, 3.30.1 and 3.31.1 sweeps (contracts moved into `contracts/`, modules split, the dictionary split, chevrons pinned, parity tests). They change no behaviour a reader meets and live in [development.md](../docs/development.md) and the contracts.

## Counts

| Status | Rows |
| --- | --- |
| documented | 39 |
| stale | 10 |
| missing | 7 |
| mismatched-with-code | 0 |
| **total** | **56** |

Every stale and missing row is fixed in both languages; `npm run check-docs`, `npm run build-docs`, `npm run check-names` and `npm test` pass.

## What could not be verified against the code

- **Measurements.** The benchmark tables in read-aloud.md and capture.md (milliseconds per word, seconds per minute of speech, memory) and the download sizes are the rounds' own measurements; the model byte counts in `shared/voice.ts` agree with the sizes quoted, the timings were not re-run.
- **Browser and device behaviour.** Dragging an embed out of the app (the file in Chrome, Edge and the desktop, a link elsewhere), the Galaxy Z Fold's screen sizes, what Windows' speech settings hand the desktop app, and iOS Safari's zoom under 16 px fields are described as the rounds observed them; the code paths exist, the devices were not at hand.
- **`Ctrl/Cmd Alt Shift L`** is taken only in an admin session (`store.admin` in `client/globalKeys.ts`); the manual says it works "from anywhere", which is true for the owner, the only reader who has an interface language of their own to switch. Left as written.
- **The slides themselves** (`client/whatsnew/releaseNotes.ts`) name paths 3.38.0 moved (*Settings → Publishing*, *Settings → Language & dates → Read aloud*). The deck is history and outside the manual; not changed.
