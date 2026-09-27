# The settings purge — the audit

Written before a single row moved. The subject is the settings index as it
stood at 3.37.0 (`client/components/settings/settingsIndex.ts`): **110 rows**
over eight tabs plus About — This device 18 · Site 11 · Language & dates 15 ·
Publishing & comments 16 · Collections 11 · Vault 18 · Backup & sync 14 · Ask 7.

This file is not only a record. `tests/settings-purge.test.ts` reads the table
below as the old index and holds the new one to it: every row here must still
exist in the new index — as a row, or as a part folded into another row — by
its label key, unless its verdict is **REMOVE** or **ENV-ONLY**. Edit a verdict
here and the test follows.

## How to read a row

- **Who** — how often a reader touches it: *first-day* (on the way in),
  *monthly* (comes back to it), *once* (set when the feature is met, then left),
  *never* (a default almost nobody moves).
- **ⓘ** — whether the row's long paragraph behind the ⓘ earns its place:
  *yes* (reference the one-line hint cannot carry — a token grammar, what the
  network does), *env* (it holds only the environment variable's line, which
  an operator needs), *—* (the row has no ⓘ).
- **Verdict**
  - **KEEP** — stays, in its section, as it is.
  - **MOVE** — stays as a row, in another section (named in *New home*).
  - **MERGE** — stops being a row of its own and becomes a *part* of the row
    named in *New home*: one label, one hint, two controls (PairControls'
    idiom). The part keeps its own label, is still searchable, and a search hit
    lands on it.
  - **DEMOTE** — stays a row, inside the **Advanced** disclosure at the foot
    of the section named in *New home*.
  - **ENV-ONLY** — leaves the app; stays in `.env` and configuration.md.
  - **REMOVE** — dead, or a duplicate of a palette command.

Locked rows stay locked in a pocket vault and refused rows stay refused; no
settings KEY changes (only the rows' homes move), so nothing stored migrates.

## The rows

| # | Old tab | Row | What it does | Who | ⓘ | Verdict | New home |
| - | ------- | --- | ------------ | --- | - | ------- | -------- |
| 1 | device | `rowAppName` | Renames the desktop app (tray, window, launcher) | once | — | MOVE | About › This app |
| 2 | device | `rowAppIcon` | Replaces the desktop app's icon | once | — | MOVE | About › This app |
| 3 | device | `rowUpdates` | Desktop: tell me about releases, or never check | once | — | MOVE | About › This app |
| 4 | device | `rowYourTheme` | Opens the theme picker for this browser | first-day | — | MOVE | Appearance (first row) |
| 5 | device | `rowScreenWarmth` | Amber night-light sheet over any theme | monthly | — | MOVE | Appearance |
| 6 | device | `rowScreenDim` | Darkens the page below the monitor's floor | monthly | — | MOVE | Appearance |
| 7 | device | `rowEditorLanguage` | The language the app speaks to *you*, per device | first-day | — | MOVE | Language & dates (first row, now called "Your language") |
| 8 | device | `rowSidebarSide` | Which edge the notes sidebar sits on | once | — | MOVE | Appearance |
| 9 | device | `rowEditorWidth` | The writing/reading column's width | monthly | — | MOVE | Appearance |
| 10 | device | `editorWidthCustom` | Not a row: the custom-width field inside row 9, counted as one because its control repeats a label | once | — | MERGE | `rowEditorWidth` |
| 11 | device | `rowVimKeys` | Modal Vim editing | once | — | DEMOTE | Writing › Advanced |
| 12 | device | `rowRelativeLines` | Relative line numbers, only meaningful with Vim | once | — | MERGE | `rowVimKeys` |
| 13 | device | `selToolbarLabel` | Formatting buttons over a selection | once | — | MOVE | Writing |
| 14 | device | `rowHeadingNumbers` | Numbers headings in the reading view | once | — | MOVE | Reading & speech |
| 15 | device | `rowFrenchAutocorrect` | Accents and French spacing as you type | once | yes (the list of corrections) | MOVE | Writing |
| 16 | device | `rowWhatsNew` | The what's-new deck after an update | once | — | MOVE | About › This app |
| 17 | device | `rowOffline` | Keeps opened notes readable offline | once | — | MOVE | Reading & speech |
| 18 | device | `rowPrefsSync` | Keeps this browser's preferences in the vault | once | — | MOVE | Backup & sync › What travels |
| 19 | site | `rowSiteName` | The site's name | first-day | env | KEEP | Your site |
| 20 | site | `rowTagline` | The line under the name | first-day | env | KEEP | Your site |
| 21 | site | `rowFooter` | The footer template on every public page | once | env | DEMOTE | Your site › Advanced |
| 22 | site | `rowLogo` | Image wordmark | once | — | KEEP | Your site |
| 23 | site | `rowFavicon` | Browser-tab icon | once | — | KEEP | Your site |
| 24 | site | `rowDefaultTheme` | The theme a visitor lands on | once | env | KEEP | Your site |
| 25 | site | `rowFontProse` | Reading/prose face (site-wide, saved) | monthly | — | MOVE | Appearance › Typography |
| 26 | site | `rowFontUi` | Interface face | monthly | — | MOVE | Appearance › Typography |
| 27 | site | `rowFontMono` | Code face | once | — | MOVE | Appearance › Typography |
| 28 | site | `rowFontArabic` | The Arabic face inside all three | monthly | — | MOVE | Appearance › Typography |
| 29 | site | `rowSizeAdjust` | Scales the Arabic face to the Latin one | once | — | MOVE | Appearance › Typography |
| 30 | language | `rowLanguage` | The site's language (what visitors read) | first-day | env | KEEP | Language & dates |
| 31 | language | `rowSpellDicts` | Which languages this browser spellchecks | once | yes (why a French line is not underlined) | KEEP | Language & dates |
| 32 | language | `rowDateLocale` | A BCP-47 tag deciding digits in dates and RSS | never | env | DEMOTE | Language & dates › Advanced |
| 33 | language | `rowLanguageFilter` | Which notes the public site shows, by language | once | env | KEEP | Language & dates › For visitors |
| 34 | language | `rowLanguageToggle` | Public English/Arabic switch | once | — | KEEP | Language & dates › For visitors |
| 35 | language | `rowDateCalendar` | Gregorian / Hijri / both | once | — | KEEP | Language & dates |
| 36 | language | `rowDateOrder` | With both calendars: which leads | once | — | KEEP | Language & dates (now "Two calendars", holding row 37) |
| 37 | language | `rowDateSeparator` | With both calendars: the mark between them | once | — | MERGE | `rowDateOrder` |
| 38 | language | `rowTextDirection` | Base direction of note prose | once | — | MOVE | Appearance › Text |
| 39 | language | `rowTextAlign` | Alignment of note prose | once | — | MOVE | Appearance › Text |
| 40 | language | `rowEmptyPropsCard` | The properties card on a bare note | once | — | MOVE | Writing |
| 41 | language | `rowVoiceLanguage` | Which language voice notes are transcribed in | once | yes (it does not steer Read aloud) | MOVE | Reading & speech › Voice notes |
| 42 | language | `rowReadAloud` | Engines, install, voices and speed for Read aloud | monthly | yes (which engine speaks what) | MOVE | Reading & speech › Read aloud |
| 43 | language | `rowOwnVoices` | A folder of Piper/Kokoro voices and an external speaker | never | yes (file layout, the operator switch) | DEMOTE | Reading & speech › Advanced |
| 44 | language | `tagLabelsRowLabel` | Display names for canonical tags | once | — | MOVE | Writing › Tags |
| 45 | publishing | `rowPublicLayout` | App / blog / designed | first-day | env | MOVE | Your site › Publishing |
| 46 | publishing | `rowOpenDesigner` | A button opening the designer (the palette's "Open the designer" too) | monthly | — | MERGE | `rowPublicLayout` (the button rides under the layout it serves) |
| 47 | publishing | `rowExcludeTags` | Tags hidden from visitors | once | env | DEMOTE | Your site › Advanced |
| 48 | publishing | `rowComments` | Comments under published notes | once | env | MOVE | Your site › Conversation |
| 49 | publishing | `rowWebmentionsAccept` | Accept webmentions | once | yes (what the server fetches) | MERGE | new row `rowWebmentions` (Your site › Conversation) |
| 50 | publishing | `rowWebmentionsSend` | Send webmentions | once | yes (what is sent, when) | MERGE | new row `rowWebmentions` |
| 51 | publishing | `rowFediverse` | The blog as an ActivityPub account | once | yes (followers, deletes, SITE_URL) | MOVE | Your site › Conversation (holding row 52) |
| 52 | publishing | `rowFediverseHandle` | The name before the @ | once | — | MERGE | `rowFediverse` |
| 53 | publishing | `rowShareButtons` | Share links under articles | once | — | MOVE | Your site › Publishing |
| 54 | publishing | `rowReadersListen` | Visitors may use Read aloud | once | — | MOVE | Reading & speech › Read aloud (instance only, as before) |
| 55 | publishing | `rowAmbient` | Faint atmosphere behind the masthead | once | — | MOVE | Your site (with the visitors' theme) |
| 56 | publishing | `rowExternalVideo` | YouTube/Vimeo/PeerTube links become players | once | yes (the privacy trade) | MOVE | Your site › Publishing |
| 57 | publishing | `rowAuthorSites` | Cards for your other sites | never | — | DEMOTE | Your site › Advanced |
| 58 | publishing | `rowMode` | Home page: intro note or dashboard | once | — | MOVE | Your site › Home page |
| 59 | publishing | `rowHomeNote` | The note at the site root | once | env | MOVE | Your site › Home page |
| 60 | publishing | `rowHomeBanner` | The front page's banner | once | — | MOVE | Your site › Home page |
| 61 | collections | `rowTopicsMode` | Categories from tags or folders | once | — | KEEP | Collections |
| 62 | collections | `rowPublicFolders` | Hand-made collections on/off | once | — | KEEP | Collections |
| 63 | collections | `rowPublicFoldersList` | The collections table | monthly | — | KEEP | Collections |
| 64 | collections | `rowPublicFoldersHome` | Collections on the home page | once | — | KEEP | Collections |
| 65 | collections | `rowPublicFoldersNav` | Collections in the navigation | once | — | KEEP | Collections |
| 66 | collections | `rowLibrary` | The library on/off | once | — | KEEP | Collections |
| 67 | collections | `rowLibraryTitle` | The library's name | once | — | KEEP | Collections |
| 68 | collections | `rowLibraryNav` | Library link in the navigation | once | — | KEEP | Collections |
| 69 | collections | `rowLibraryHome` | Shelf on the home page | once | — | KEEP | Collections |
| 70 | collections | `rowLibraryRoots` | Folders whose published notes are shelved | once | — | KEEP | Collections |
| 71 | collections | `rowLibraryPaths` | Per-folder exceptions | monthly | — | KEEP | Collections |
| 72 | vault | `templatesFolderLabel` | Where templates live | once | — | MOVE | Writing › New notes |
| 73 | vault | `hadithFolderLabel` | The corpus folder callouts read (detected when empty) | never | yes (the frontmatter it reads) | DEMOTE | Reading & speech › Advanced |
| 74 | vault | `defaultTemplateLabel` | Template for every new note | once | yes (the placeholder grammar) | MOVE | Writing › New notes |
| 75 | vault | `periodicRowLabel` | Daily/weekly/monthly/yearly notes | once | yes (the name grammar) | MOVE | Writing › New notes |
| 76 | vault | `uniqueRowLabel` | Minute-named notes' folder and name | once | yes (the tokens) | MOVE | Writing › New notes |
| 77 | vault | `captureInboxLabel` | Quick capture's second target | once | yes (shortcut, path form) | MOVE | Writing › Capture |
| 78 | vault | `clipperLabel` | The clipper bookmarklet and its token | once | yes (what the token is) | MOVE | Writing › Capture |
| 79 | vault | `rowFeeds` | Fetch the feeds a note lists | once | yes (network access, where items live) | MOVE | Reading & speech |
| 80 | vault | `rowVoiceModel` | Transcription model and where it runs | once | yes (GPU/CPU, downloads) | MOVE | Reading & speech › Voice notes |
| 81 | vault | `rowVoiceKeepAudio` | Keep recordings after transcription | once | — | MOVE | Reading & speech › Voice notes |
| 82 | vault | `drawingsFolderLabel` | Where new drawings start | never | — | DEMOTE | Writing › Advanced |
| 83 | vault | `rowLaunch` | What the app opens on | once | — | MOVE | Writing (first row) |
| 84 | vault | `rowLaunchNote` | The note "a note" opens | once | — | MERGE | `rowLaunch` |
| 85 | vault | `rowAttachmentLocation` | Where uploads are written | once | — | MOVE | Writing › Files & tags |
| 86 | vault | `rowAttachmentFolder` | The folder two of those modes need | once | — | MERGE | `rowAttachmentLocation` |
| 87 | vault | `rowTagsFolder` | Where a tag's own page lives | once | — | MOVE | Writing › Files & tags |
| 88 | vault | `rowNoteVersions` | Keep a history of each note | never | yes (the caps) + env | MOVE | Backup & sync › Versions |
| 89 | vault | `rowPdfSearch` | Search reads the shelf's PDFs | never | env | MOVE | Reading & speech |
| 90 | sync | `rowSyncEnabled` | Git backup on/off | first-day | — | KEEP | Backup & sync |
| 91 | sync | `rowSyncRemote` | The remote URL | first-day | — | KEEP | Backup & sync |
| 92 | sync | `rowSyncBranch` | The branch (`main` for nearly everyone) | never | — | DEMOTE | Backup & sync › Advanced |
| 93 | sync | `rowSyncAuth` | SSH or token | first-day | — | KEEP | Backup & sync |
| 94 | sync | `rowSyncUser` | The token's user | once | — | MERGE | `rowSyncToken` |
| 95 | sync | `rowSyncToken` | The access token (write-only) | once | — | KEEP | Backup & sync (holding row 94) |
| 96 | sync | `rowSyncPull` | Fast-forward before pushing | never | — | DEMOTE | Backup & sync › Advanced |
| 97 | sync | `rowSyncInterval` | How often it backs up | once | — | KEEP | Backup & sync |
| 98 | sync | `rowSyncStatus` | The repository's state and the verbs | monthly | — | KEEP | Backup & sync |
| 99 | sync | `rowTravel` | What the vault's .astrolabe folder carries | monthly | — | KEEP | Backup & sync › What travels (hint cut to one sentence ≤ 14 words; it ran to 19) |
| 100 | sync | `rowPocketRepo` | Pocket: the repository and branch | monthly | — | KEEP | Backup & sync (pocket) |
| 101 | sync | `rowPocketState` | Pocket: the sync line | monthly | — | KEEP | Backup & sync (pocket) |
| 102 | sync | `rowPocketConflicts` | Pocket: notes kept side by side | monthly | — | KEEP | Backup & sync (pocket) |
| 103 | sync | `rowPocketLeave` | Pocket: forget this vault | once | — | KEEP | Backup & sync (pocket) |
| 104 | ask | `rowAskProvider` | Ollama or Anthropic | once | — | KEEP | Ask |
| 105 | ask | `rowAskChatModel` | Local chat model | once | — | KEEP | Ask |
| 106 | ask | `rowAskAnthropicModel` | Anthropic model | once | — | KEEP | Ask |
| 107 | ask | `rowAskKey` | Anthropic key | once | — | KEEP | Ask |
| 108 | ask | `rowAskEmbedModel` | Embedding model (re-reads every note) | never | — | DEMOTE | Ask › Advanced |
| 109 | ask | `rowAskTopK` | Passages per answer | never | — | DEMOTE | Ask › Advanced |
| 110 | ask | `rowAskStatus` | What the index has read, who answers | monthly | — | KEEP | Ask |

## The verdicts, counted

| Verdict | Rows |
| ------- | ---- |
| KEEP | 38 |
| MOVE | 50 |
| MERGE | 10 |
| DEMOTE | 12 |
| ENV-ONLY | 0 |
| REMOVE | 0 |
| **Total** | **110** |

**MERGE (10):** `editorWidthCustom` → Writing column · `rowRelativeLines` → Vim
keys · `rowDateSeparator` → Two calendars · `rowOpenDesigner` → Public layout ·
`rowWebmentionsAccept` + `rowWebmentionsSend` → one new *Webmentions* row ·
`rowFediverseHandle` → Fediverse · `rowLaunchNote` → Open on launch ·
`rowAttachmentFolder` → New attachments · `rowSyncUser` → Access token. Each
is a control that only means something beside its host — a field shown only
under one segment, a sub-option of a switch, a button that serves the row above
it — and was costing a label, a hint and a row's height to say so.

**DEMOTE (12):** Vim keys, Drawings folder (Writing) · Date locale (Language) ·
Your own voices, Hadith corpus folder (Reading & speech) · Footer, Excluded
tags, Your other sites (Your site) · Branch, Pull first (Backup & sync) ·
Embedding model, Passages per answer (Ask). Each is *never* or a *once* whose
default nearly everyone keeps; they sit behind one **Advanced** line at the
foot of their section, which names them, so they are one click from sight and
one search from the keyboard.

**Why nothing is ENV-ONLY or REMOVED.** Every candidate was weighed and kept
in reach, because the brief also says *no stored key changes*: a row taken out
of the app leaves any value already saved in `settings.json` in force with no
way to see or clear it from the app, which is a trap rather than a purge.
- *Date locale* (`BLOG_LOCALE`) was the strongest ENV-ONLY case — a BCP-47 tag
  is an operator's value — but it decides whether an Arabic site prints
  Arabic-Indic or Latin digits, a real editorial choice made once; it is
  demoted instead.
- *Design the site* duplicates the palette's "Open the designer", the REMOVE
  definition exactly — but the owner-facing reason it exists (a reader who
  picks *Designed* is otherwise left with no door to the designer) still holds,
  so it survives as the button under Public layout rather than as a row.
- *Hadith corpus folder* is detected automatically when empty; demoted, not
  removed, because a vault whose corpus lives under another name has no other
  way to say so.
- *Passages per answer* and *Embedding model* have no environment variable to
  fall back to; demoted.

The purge is therefore structural rather than subtractive: **110 rows in eight
tabs** become **101 rows in nine sections, of which 89 are in sight** and 12
are one Advanced line away; ten controls stop pretending to be rows; and no
section's first screen carries a row a first-day reader has to skip.

## The new information architecture

By the reader's intent. Nine sections, About included (the brief's ceiling).
The four a first-day reader looks for — theme, language, publishing, sync —
are the first rows of sections 1, 2, 5 and 7, and each section's name says
what it is for, never how it is built. Counts are rows (parts not counted),
as one device sees them.

| # | Section (id) | Intent | Rows | In it |
| - | ------------ | ------ | ---- | ----- |
| 1 | Appearance (`appearance`) | How the app looks to you, and the type every reader sees | 12 | Your theme · Screen warmth · Dim the screen · Notes sidebar · Writing column — *Text:* direction, alignment — *Typography:* reading, interface, code, Arabic, Arabic size match (+ your own fonts) |
| 2 | Language & dates (`language`) | Which language you read the app in, which one the site speaks, how dates print | 7 + 1 advanced | Your language · Site language · Browser dictionaries · Date calendar · Two calendars — *For visitors:* language filter, visitor switch — *Advanced:* date locale |
| 3 | Writing (`writing`) | How the editor behaves and where new notes and files go | 13 + 2 advanced | Open on launch · Formatting toolbar · Auto-correct French · Properties card — *New notes:* templates folder, template for new notes, periodic notes, unique notes — *Capture:* inbox, clipper — *Files & tags:* new attachments, tags folder, tag labels — *Advanced:* Vim keys, drawings folder |
| 4 | Reading & speech (`reading`) | The reading view, books and feeds, read aloud, voice notes | 9 + 2 advanced | Numbered headings · Offline reading · Search inside books · Feeds — *Read aloud:* read aloud, readers may listen — *Voice notes:* transcription language, voice transcription, keep recordings — *Advanced:* your own voices, hadith corpus folder |
| 5 | Your site (`site`) | What visitors see, and who may answer | 15 + 3 advanced | Site name · Tagline · Logo · Favicon · Default theme · Ambient masthead — *Publishing:* public layout (+ Design the site), share buttons, external video — *Home page:* mode, home note, banner — *Conversation:* comments, webmentions, fediverse — *Advanced:* footer, excluded tags, your other sites |
| 6 | Collections (`collections`) | How the public site groups notes | 11 | unchanged |
| 7 | Backup & sync (`sync`) | Where copies of the vault are kept | 9 + 2 advanced (instance) · 6 (pocket) | Backup · Remote URL · Authentication · Access token · Automatic sync · Status — *Versions:* keep note versions — *What travels:* what travels, settings travel with the vault — *Advanced:* branch, pull first |
| 8 | Ask (`ask`) | Which models read the notes and answer | 5 + 2 advanced | Provider · local model · Anthropic model · key · status — *Advanced:* embedding model, passages per answer |
| 9 | About (`about`) | This app and this instance | 1 (browser) · 4 (desktop) | *This app:* what's new, and on the desktop its name, icon, launcher and updates — then the version, the paths, the counts and the manual |

**"This device" is gone as a section, and on purpose.** It was a section
named after a storage mechanism (localStorage), which is the brief's "tab named
after an implementation": a reader looking for the theme had to know it was
kept per browser to know where to look. Every row it held now sits where its
question is asked — the theme under Appearance, the reader's language under
Language — and wears a small **This device** mark beside its label instead, so
the one thing the old tab did say (this one saves itself, here only) is still
said, on the row where it is true. The Save bar speaks for every row without
that mark and appears only when one of them has changed.

A pocket vault (a repository cloned onto a phone) draws seven: Collections and
Ask stay instance-only, Your site keeps its identity rows (the favicon, footer
and visitors' theme locked, as before) and drops the publishing ones it never
drew, and Readers may listen stays instance-only under Reading & speech.
