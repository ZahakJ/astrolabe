# Arabic & RTL

*Astrolabe in Arabic: a mirrored interface, a language switch for visitors, a language filter with four settings, Hijri dates, note direction and Arabic names for your tags.*

← [Back to the README](../README.md) · [All docs](README.md)

---

Astrolabe speaks Arabic. `SITE_LANG=ar` (or **Settings → Language & dates → Site language → العربية**, which applies at once, with no restart) does two things.

**It translates the interface.** Every label, button, placeholder, menu item, toast and confirmation dialog, in the app and on the public site alike (the sidebar, the tabs, the status bar, the command palette, the backlinks, outline and local-graph panels, the settings, and the whole blog: masthead, topic row, article furniture, share row, previous/next, Marginalia), comes from one dictionary in `client/i18n.ts`. Counts are formed the way Arabic forms them (`حاشية واحدة`, `حاشيتان`, `3 حواشٍ`, `40 حاشية`), not by sticking an "s" on the end.

**It mirrors the layout.** The document becomes `<html dir="rtl" lang="ar">` and everything follows: the notes sidebar moves to the right and the outline and backlinks panel to the left. And they keep following the language, because which side the sidebar sits on is a preference with **three states**. *Auto* is the default: it puts the sidebar on the leading edge of the reading direction and re-evaluates that every time the language changes. *Left* and *Right* name a physical edge of the screen, in both languages, and win over the direction for good. All three are in the command palette and as a three-way control in **Settings → This device → Notes sidebar**, where *Auto* also says which edge it has chosen, so the default is never a silent one. (The third state is how you get back to automatic.) Tree indentation and chevrons flip, the accent bar of the active note moves to the other edge, the status bar and the blog navigation reverse, and the "older/newer" arrows point the way you actually read. Because the panes swap ends, nothing in the interface calls either of them "the left one": the toggles, the palette and the shortcuts sheet say **Notes sidebar** and **Outline & backlinks**, in both languages, with the keystroke in the tooltip. Under the hood this is done with CSS logical properties (`margin-inline-*`, `inset-inline-*`, `text-align: start`), so the same stylesheet serves both directions; `[dir="rtl"]` overrides exist only where no logical property can express the idea, such as flipping an arrow glyph or the angle of a gradient.

On a phone, the sidebar drawer slides in from the right. Every dialog (settings, banner picker, moderation, login, confirm) is laid out right-to-left, and the blog is mirrored the same way.

**Your notes are left alone.** Note content is never translated and never re-flowed: each block picks its own direction from its own text (`dir="auto"`). That is why a vault that mixes Arabic and English reads correctly under either setting, and why your Arabic notes were already right-to-left before you touched this switch. The same rule applies to text from your notes that appears inside the interface (tree rows, tab titles, outline entries, search hits, backlink cards, breadcrumbs): each picks its own direction, so a vault mixing `مكاتيب` and `1 - Source Material` reads correctly in either language.

**Dates.** With `BLOG_LOCALE` unset, `SITE_LANG=ar` formats post dates and comment timestamps in Arabic with Eastern Arabic numerals (`١٤ يوليو ٢٠٢٦`, `قبل ٧ دقائق`): every date in the product, on the blog and in the admin panels, from one rule. Set `BLOG_LOCALE` yourself to override it; `BLOG_LOCALE=ar-u-nu-latn`, for example, keeps the Arabic month names but uses 1/2/3 digits. Counters elsewhere in the interface (word counts, reading minutes) stay in Western numerals.

**Fonts.** Arabic gets its own fonts and its own size. The font settings name naskh fonts (`Noto Naskh Arabic`, `Amiri`, `Scheherazade New`) after the Latin ones, so Latin text is still set in Georgia or the system font and only Arabic letters, which no Latin font covers, fall through to them; nothing is fetched from a CDN. Because a naskh font looks noticeably smaller than Georgia at the same pixel size, `lang="ar"` also multiplies the two size settings (`--font-scale`, `--prose-scale`), which enlarges the whole interface by about 6% and the reading column by about 10%. A `--font-base` you set in `custom.css` is multiplied, not overwritten. To give an Arabic word inside an English sentence its own font, set correctly, even on an English instance, see [Typography](typography.md#the-arabic-slot-is-per-character-not-per-language).

**Your keyboard is part of this too.** An Arabic keyboard layout puts `ح` on the key marked `P`, and for a while that meant `Ctrl P` opened nothing: an Arabic interface whose shortcuts only answered to an English keyboard. That is fixed. A shortcut follows the letter your layout types when that letter is Latin, and the key's *position* when it is not, so the Latin letters printed on your keycaps are your shortcuts. The `Ctrl/Cmd /` sheet shows what each key actually types beside the letter. See [Keymap → Non-Latin keyboards](keymap.md#non-latin-keyboards).

## Your editor's language is yours

`SITE_LANG` decides what language you **publish** in. It does not decide what language you have to **work** in. **Settings → This device → Editor language** is where the two part ways: *Follow site* (the default, which also names the language it lands on), *English*, or *العربية*. It changes the same two things the visitor switch changes, the interface strings and the direction, and it changes them for you alone. It is stored in this browser, like your theme and your sidebar edge; it is never sent to the server, never appears in anything you save, and cannot change a single byte of what a reader is served. Run an Arabic site from an English editor, or an English site from an Arabic one; the site does not notice either way.

There are three palette commands for it as well: `Editor language: English`, `Editor language: العربية` and `Editor language: follow the site`. Each names its language in that language's own script, on purpose. **That is the way back if you ever cannot read the interface**: press `Ctrl/Cmd K`, type `English`, press Enter. Nothing else has to be legible for that to work.

> **If you are reading this because you are stuck in Arabic and did not choose it**, this is almost certainly why: before editor language and site language were separated, a visitor's EN/ع choice was applied to *every* session in that browser, the owner's editor included. On an instance whose public site is the app layout, the EN/ع control is never drawn, so there was nothing to click to undo it. Upgrading fixes it on the next reload, with no action from you. On an older build, clear the stored visitor choice by hand: `localStorage.removeItem("astrolabe.lang")` in the browser console.

## Visitor language switch

`SITE_LANG` picks the language your site publishes in, for readers and, unless you said otherwise above, for you. **Settings → Language & dates → Visitor switch** (settings key `languageToggle`, **off by default**, with no `.env` counterpart) adds a small `EN` / `ع` control at the edge of the public navigation, so a reader can pick the other language for themselves. Their choice is stored in their own browser's `localStorage` and survives return visits; nobody else's site changes.

The switch changes the **interface strings**, the **text direction** and the **month names**, for *that reader*. An English interface prints "August"; an Arabic one prints "أغسطس". Digits stay on the instance's numeral setting, so a visitor's EN/ع tap cannot mix `١٤` with `14` on one line. The switch cannot reach your editor: an admin session reads its own **Editor language** and never a visitor's, which is why flipping the public switch to check what a reader sees no longer leaves you editing in a language you did not pick. (**Preview as visitor** is the honest way to check: previewing puts you on the visitor's side of that line deliberately, so you see their language, not yours.) Note content is untouched; it renders as you wrote it, block by block, the way it always does. Leave the switch off (the default) and the public site has no language control at all.

> **Digits are still per instance.** `BLOG_LOCALE` picks the numeral setting (and the RSS channel language). An Arabic instance whose visitor picks English reads `14 August 2026`, not `14 أغسطس 2026`. Flip the switch back and the Arabic names return. Eastern digits still require an explicit `-u-nu-arab` on that tag.

## Language filter

A bilingual vault often wants a monolingual public site, or better, a bilingual one that shows each reader only their own language. **Settings → Language & dates → Language filter** (`LANGUAGE_FILTER`) has four settings:

| Value | Who decides | What the public site shows |
| --- | --- | --- |
| `off` *(default)* | nobody | every published note |
| `follow` | **the reader** | only notes in the language that reader is reading in |
| `ar` | you | only notes whose letters are at least 40% Arabic script |
| `en` | you | only notes that are mostly non-Arabic |

**`follow` is the setting that gives the visitor switch its meaning.** With **Visitor switch** on, a reader who taps ع gets the Arabic interface *and* the Arabic writing; tapping EN brings back the English. Without it (interface in one language, posts in the other) the switch was half a feature. A reader who never touches the switch gets the site language. (With the visitor switch *off*, `follow` has no reader to follow and behaves exactly like pinning to `SITE_LANG`; the settings panel says so in those words, rather than letting the setting mean something other than its name.)

> **The old true/false values still work.** `LANGUAGE_FILTER=true` means "pinned to `SITE_LANG`", which is what it always meant, and `false` means `off`. A stored `true` in `settings.json` is converted at startup to the matching `"ar"` or `"en"`, never to `"follow"`, because upgrading must not change what a live site shows.

**It tells you what it will cost before you save it.** The row states the consequence in real counts from your own vault (*"Pinned to Arabic: 3 of your 22 published notes qualify; 19 would be hidden from every visitor"*), warns harder when that is most of the site, and does not go quiet afterwards: while a filter is materially reducing what visitors see, the status bar carries a standing `3/22 public` beside the published count. The two numbers disagreeing is the state worth noticing, and before this there was nowhere in the product that showed it. The same treatment covers every other setting that can shrink the public site: excluded tags, the blog front door, and `PUBLIC=false`. Under `follow` with the visitor switch on there is no single number to print, because nothing is hidden from *everyone*: the note an Arabic reader cannot find is exactly the one the English reader gets. So the summary prints both audiences instead (*"5 of your 107 published notes reach an Arabic reader, 102 reach an English one"*), and the status bar does not carry a warning for a site that every reader can reach in full.

**It will not hand anyone an empty site.** If the language in force matches no published note at all, the filter stands down for that request: the reader gets the whole collection with one quiet line explaining why they are seeing both languages, and you get the loud version.

Detection runs in the indexer, is cached per note, and refreshes as notes change; there is nothing to configure and no frontmatter to maintain. The filter applies to every public place where notes are listed: the post list, the dashboard grid and "Most discussed" row, topic pages *and the topic row itself*, the graph, search, previous/next links, and the RSS feed. A topic carried only by filtered-out notes disappears entirely rather than leading to an empty page. Admin sessions are never filtered: signed in, you always see the whole vault.

**What it counts.** Only the note's *prose*. Fenced and inline code, HTML tags and comments, and link destinations (markdown, reference and bare URLs) are stripped before the letters are counted, so an Arabic article does not count as English because every highlight carries a `readwise.io` URL or because it embeds one YouTube player. Link *text* still counts, since it is what a reader reads. A note whose prose has no letters at all (an image-only or numbers-only page) belongs to no language and is shown under either setting rather than guessed at.

> **The filter is curation, not access control.** A published note it hides from the lists is still served at its own address: `/api/note` is never filtered, and both public layouts resolve an article from its URL rather than from the (filtered) tree, so every permalink you have already shared keeps working after you flip the switch. The note simply stops appearing in the lists, topics, graph, search and feed. What the filter must never do is *leak* what it hides, so every place that lists notes, including the `/api/events` push stream, which would otherwise announce a hidden note's path the moment it changed, applies it. If a note should not be public at all, unpublish it (`publish: false`); that is the switch with teeth.

## Hijri dates

An Arabic site often dates its writing by the Hijri calendar, and until now Astrolabe could only print Gregorian dates. **Settings → Language & dates → Date calendar** (settings key `dateCalendar`) takes three values:

| | prints |
| --- | --- |
| `gregorian` *(default)* | `15 August 2026` / `١٥ أغسطس ٢٠٢٦` |
| `hijri` | `٢ صفر ١٤٤٨ هـ` |
| `both` | the two side by side: `السبت ١٦ ربيع الأول ١٤٤٨ هـ | ٢٩ أغسطس ٢٠٢٦ م` |

`both` is ordered by the **site language** by default: an Arabic instance leads with the Hijri date, an English one with the Gregorian. Two rows appear under the choice: **which calendar leads** (automatic, Hijri first, Gregorian first) and **what stands between the two** (a bar, a dot, or the second date in brackets). The panel prints today's date live under whichever options are selected, so you see the answer before you save it.

The Hijri calendar used is **Umm al-Qura** (`islamic-umalqura`). Browsers offer four Islamic calendars: `islamic` is based on moon sightings and its answer differs by a day from one platform to another, while the two tabular variants never differ but do not match anyone's wall calendar. Umm al-Qura is both stable and recognisable, so it is the one Astrolabe uses; this is a display convention, not a preference with many variants. Month names come from `Intl` in the interface language (English chrome says "August", Arabic chrome says "أغسطس") and digits from the same numeral rule everything else uses, so nothing is hand-spelled and one instance never mixes two numbering systems on a line.

It reaches **every date a person reads**: post meta and dashboard cards on the blog, comment timestamps (the relative "5 minutes ago" keeps its wording and gains the absolute date in its tooltip), the moderation rows, the backup badge and the settings panel. **Daily notes keep their ISO filenames**: `daily/2026-08-16.md` still sorts, still resolves as `[[2026-08-16]]`, still opens in Obsidian. But outside Gregorian mode, the status bar names the open daily note in the calendar you chose.

> **RSS is deliberately untouched.** `/feed.xml` keeps RFC-822 Gregorian `<pubDate>`s whatever this setting says. That is a format a feed reader parses, not a date a person reads.

## Note direction & alignment

Two settings under **Settings → Language & dates → Note layout** apply identically in the editor, the reading view and blog articles:

- **Text direction** (`textDirection`): `auto` *(default)*, `ltr`, `rtl`. `auto` is the behaviour that shipped from the start: every block takes its direction from its own first strong letter, which is what a bilingual vault wants. Pinning `ltr` or `rtl` makes the whole document read that way.
- **Text alignment** (`textAlign`): `start` *(default)*, `left`, `right`, `center`, `justify`.

**Any note can override both from its own frontmatter**, and the note wins:

```yaml
---
dir: rtl
align: justify
---
```

(`direction:` and `text-align:` are accepted as spellings of the same two keys, as are `centre`/`centered` and `justified`.)

**One block can disagree with its note.** End a paragraph, a heading or an image line with `{.center}`, `{.right}`, `{.left}` or `{.justify}` and that block alone sits that way. The marker hides in the editor like other syntax and never reaches the rendered page; `/center`, `/right` and `/left` in the slash menu write it for you, and a picture's own hover buttons write it for an image.

A note that disagrees with the site default **says so**: a chip in its properties card, beside the tag pills where the frontmatter is, and a quiet segment in the status bar. Both carry the same tooltip, which names each half and where it came from: *Direction: RTL — set by this note · Alignment: Justified — the site default*. A setting that silently changes how the text under your cursor behaves is a trap, and this closes it the same way the mode pills do.

**Code blocks, tables and display maths are never centred or justified**, and never take a pinned direction either. `const x = 1;` inside a right-to-left document would render as `;const x = 1`, and a `|---|---|` table rule would stop lining up with its own header. So they keep the reading direction's leading edge and decide their own direction line by line, in the editor and in the rendered view alike. Callouts, quotes and lists are prose and follow the note. A `.tex` note takes the direction (an Arabic paper is written right to left) but refuses the alignment, because its source is markup from end to end.

## Searching in Arabic

Arabic text that has been **pointed** (given its vowel marks, as in a Qur'anic quotation, a classical text, or anything a careful typist vowelled) is spelled differently from the way anyone types it into a search box. «المقدمة» and «الْمُقَدِّمَة» are the same word. So Astrolabe folds, on both sides of the index: what it files and what you ask for go through the same table, which means the plain spelling finds the pointed note *and* the pointed spelling finds the plain one.

What folds:

- **Harakat and the Quranic marks**: fatha, damma, kasra, shadda, sukun, the superscript alef, the pause marks
- **The alef family**: أ إ آ ٱ are treated as ا
- **ى → ي**, **ة → ه**, and the Persian **ی → ي**, **ک → ك**
- **Tatweel** (ـــ), which is a typographic stretch and not a letter
- **Zero-width joiners, the bidi marks and the soft hyphen**
- **Shaped glyphs** (the Arabic presentation forms a PDF's text layer sometimes carries instead of letters — Chromium's print-to-PDF writes them): each form is its letter, a lam-alef ligature is its two letters, a shaped vowel is nothing
- **Latin accents**, in the same pass and by the same table: `resume` finds *résumé*, `naive` finds *naïve*, `cafe` finds *café*

It is one table (`shared/fold.ts`), and every matcher in the product consults it: the sidebar search and the lines it quotes under a hit, the `[[` wikilink completion, the command palette's note rows, the PDF reader's own `/` search — which is where the table was first written — and the EPUB reader's, which runs the same fold on the server over the whole book.

**Replace does not fold**, on purpose. See [Search & replace](editor.md#navigating): finding is a question, and folding widens it kindly, but replacing is a write, and a replace that quietly rewrote «الْمُقَدِّمَة» would strip harakat you never typed and never saw.

## Writing harakat

Search has folded the diacritics for a long time; writing them was the part every keyboard makes hard. The marks sit behind Shift on keys nobody has memorised (fatha is `Shift Q` on the Arabic 101 layout, kasra `Shift A`, shadda `Shift ~`), the dagger alif is on no layout at all, and a Latin keyboard has none of them. So the editor has a small palette for them.

**`Ctrl/Cmd Alt ;`**, or *Haraka…* on the selection menu's **Insert** page and on its **Arabic** page, opens a short list at the cursor: fatha, damma, kasra, the three tanwin, shadda, sukun, the dagger alif and the tatweel, each with its glyph on a dotted circle and its name in the interface language. `↑` and `↓` move through it, `Enter` inserts, `Esc` closes. With a bare cursor the mark lands on the letter you just typed, which is where a keyboard would put it. With a **selection**, every Arabic letter in it takes the mark, after any marks the letter already carries, and never twice; so selecting a word and choosing *sukun* points the whole word, and a shadda added to «كَتب» keeps the fatha. The tatweel is the exception, because it is not a combining mark: on a selection it goes *between* letters only, which stretches the word the way a calligrapher would rather than drawing a stroke into a space. (The chord uses `;` because it is the same physical key on the Arabic layout as on a US one, where it types «ك», and every chord in this product resolves by position when the layout's character is not Latin; see [Keymap](keymap.md).)

Two ways back out of pointing, both on the selection menu's **Arabic** page. **Strip diacritics from selection** removes every haraka, dagger alif and tatweel from the selected words and nothing else; hamza, the alef family, `ة` and `ى` are letters and stay. **Copy without harakat** puts the unpointed text on the clipboard and leaves the note as it is, for a quotation that is going into a search box or a message where the marks would be noise. For a whole note, `Ctrl/Cmd P` → **Strip diacritics from note** rewrites the open note through the editor as **one undo step**, so a single `Ctrl/Cmd Z` puts every mark back; when there is nothing to strip it says so rather than saving the file into itself.

The three share one table (`shared/tashkeel.ts`): the strip removes exactly the characters the palette can write, U+064B–U+0652, U+0670 and U+0640, and no more. The Qur'anic pause marks and small high letters are not in it, on purpose: a strip that reached past what the palette writes would take marks a careful typist never asked it to touch.

## Ayah and hadith callouts

`> [!ayah] 2:255` renders the verse in Uthmani script with full tashkeel, set right-to-left in the Arabic font, with its reference as the caption: `﴿Al-Baqarah 2:255﴾` on an English instance, `﴿البقرة ٢٥٥﴾` on an Arabic one. A range is written `2:255-257`. The surah may be given by number or by name in either language, with the article and the pointing optional (`البقرة`, `Baqara`, `Al-Baqarah`). Any lines you write under the callout are your own commentary and render beneath the verse. In the editor, `/ayah` inserts the skeleton, and inside `> [!ayah] `, typing offers the surah names as you go. The text is the Tanzil Project's, credited under every callout. It is a 1.3 MB file that is downloaded only by a page that carries a verse, so a note without one downloads none of it, and a published note shows its verses to visitors from the same file.

`> [!hadith] Bukhari 1` renders a hadith from a **corpus you supply**: notes under `Corpus/hadith/` (or the folder named in Settings → Vault, *Hadith corpus folder*) whose frontmatter carries `collection:` and `number:`; the body's first paragraph is the chain of narrators, the rest the text. The common collections answer to their usual spellings in either language (`Bukhari`, `البخاري` and `Sahih al-Bukhari` are one key); an uncommon one answers to its own name. A reference with no corpus note behind it renders as an ordinary quote callout wearing the reference as its title, never as a broken block, and a visitor is answered only from published corpus notes.

## Localised tag labels

A vault's tags are usually English, because tags are addresses: `#software` is in your files, in your links, in `EXCLUDE_TAGS`, in every URL you have shared. But an Arabic site should say «برمجيات». Both can be true at once, because a label is **for display only**: nothing here ever rewrites a note.

There are two places to put a label, and the first one is better.

**1 — the tag's own page**, so the naming travels with the vault. Put a note at `tags/<tag>.md` (the folder is **Settings → Vault → Tags folder**, `tagsFolder`, default `tags`; nested tags nest, so `#lang/arabic` is `tags/lang/arabic.md`) and give it a `labels:` map:

```markdown
---
labels:
  ar: برمجيات
  en: Software
---

Notes about software: the craft, not the industry.
```

Clone the vault, sync it, open it in Obsidian: the label is still there, because it is a note. A bare `labels: برمجيات` is read as the Arabic label, which is what a hand-written Arabic tag page actually says.

**2 — `settings.tagLabels`**, for tags with no page of their own: a compact table in **Settings → Language & dates → Tag labels**, one row per tag with a column per language. A tag page outranks it, per language, so a page that names only an Arabic label does not erase an English one set here.

Every place a tag is shown uses the label: the blog's topic row and topic pages, post chips, the dashboard cards, the sidebar tag cloud and topic sections, the properties card in the editor and the reading view, and the hover previews. Everything else stays **canonical**:

- **URLs keep the canonical slug.** `/topic/software` is what the site draws and what your links point at. The localised spelling is accepted as a redirect (`/topic/برمجيات` lands on the same page and quietly rewrites the address), because a reader copies the word they can see.
- **Frontmatter is untouched**; `EXCLUDE_TAGS` and the language filter keep matching the real value, and the tooltip on a labelled chip names the canonical tag.
- **Search answers to both spellings.** Typing «برمجيات» finds the notes tagged `#software`, and typing `software` still does. The query is widened, not the index, so editing a label takes effect immediately, with no reindex.
