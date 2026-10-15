# Typography

*A catalog of fonts served from your own server, the four font slots, your own uploaded fonts, and how Arabic and Latin letters share one paragraph.*

← [Back to the README](../README.md) · [All docs](README.md)

---

You can change the app's fonts by writing CSS (see [the `custom.css` route](theming.md#bring-your-own-fonts-the-css-route)). The font catalog is the way to do it without CSS, and the reason it exists is **Arabic**. Open **Settings → Layout & type** and you get four pickers, one per slot:

| Slot | Drives | Offers |
| --- | --- | --- |
| **Reading text** | `--font-serif` — reading column, editor prose, headings | Lora, EB Garamond, Crimson Pro, Literata, Source Serif 4, Merriweather, Inter, Source Sans 3, IBM Plex Sans, Work Sans |
| **Interface** | `--font-ui` — sidebar, tabs, panels, status bar | the same Latin list |
| **Code** | `--font-mono` — code blocks, raw markdown, inline code | JetBrains Mono, IBM Plex Mono, Fira Code, Source Code Pro |
| **Arabic face** | the Arabic letters in **all three** of the above | Amiri, Scheherazade New, Noto Naskh Arabic, Markazi Text, Lateef, Aref Ruqaa · Noto Kufi Arabic, Noto Sans Arabic, IBM Plex Sans Arabic, Cairo, Tajawal, Reem Kufi, Almarai |

Every slot also accepts **system**, the default: the fonts already on the reader's device, with nothing downloaded and nothing served. Every slot also offers **your own uploads** (see below). **Reset fonts** puts all four back to `system`.

**The picker draws every option in the font it names.** Each row is rendered in its own typeface, Arabic fonts show an Arabic sample, and the rows are grouped (serif / sans / monospace / naskh / modern & kufi / *your fonts*) with a filter box above them. The fonts are fetched **one group at a time**, when that group first comes into view, so opening the Code picker never downloads the Arabic fonts.

**The specimen stays on screen while you choose.** A live sample block sits pinned at the top of the tab: one mixed line per slot, Latin and Arabic in the same run, so you can see at a glance which letters get which font. It updates *before* you save, and so does the size dial below it.

## Self-hosting is the whole design

One face ships with the app itself: **Noto Naskh Arabic**, regular and bold, under the SIL Open Font License, for the Arabic characters only. On a machine that already has it, the installed copy is used and nothing is fetched. On a machine that does not — a fresh Linux install, a Windows box without the Arabic language pack — the bundled copy is used, so Arabic reads properly before you have chosen anything. Everything below is about the faces you *choose* on top of that.

When you save, the *server*, not the browser, fetches the chosen font families once from Google Fonts (as a `woff2` request, so it gets `woff2` files back). It reads the `@font-face` blocks in the answer, downloads each font file into `ASTROLABE_DATA/fonts/catalog/<id>/`, and records the `unicode-range` of each file (the set of characters it covers) in a `meta.json` beside them. From then on the browser only ever talks to your server: `GET /api/site-fonts.css` is generated from that cache, and every `src:` in it points at `/api/fonts/catalog/…` on this instance. **No visitor's browser contacts an external host, ever**, not for the fonts and not for the stylesheet. On the fetching side only two hosts are reachable at all (`fonts.googleapis.com` and `fonts.gstatic.com`), enforced as a strict allowlist on the parsed URL, with redirects refused, timeouts, and size caps per file and per family. A download that fails is a clean **502 with a message**, and `settings.json` is left exactly as it was. So a machine with no internet keeps serving whatever it has already cached, and a save that only re-picks cached families works with no network at all.

## The Arabic slot is per character, not per language

The generated stylesheet does not define three font families and hope for the best. It defines three *composites*, `AstrolabeProse`, `AstrolabeUI` and `AstrolabeMono`. In each composite the Arabic font's `@font-face` blocks come **first**, limited to the Arabic Unicode blocks, and the Latin font's blocks come after, with those same ranges carved out of them. The two sets do not overlap, so the browser's own per-character font matching does the rest. In

> A mixed line is where the trick shows: the word خط sits inside an English sentence.

the Latin words are set in Lora and the Arabic word in Amiri, in one paragraph, with no markup, no `lang` attribute and no direction involved. This works on an **English** instance too, so Arabic quotations inside English notes are set in your Arabic face.

## And at the right size

Picking the right font is only half of setting text correctly. The other half is *how big it comes out*. Two fonts at the same `font-size` are not two fonts at the same apparent size. Amiri's basic letters stand about 0.35 em tall where Lora's lowercase letters stand 0.51 em, so an unadjusted Arabic run next to Lora reads about a third smaller, like a footnote dropped into a paragraph. Each Arabic entry in the catalog therefore carries a measured **`size-adjust`** (Amiri 138%, Scheherazade New 136%, Lateef 150%, Noto Kufi Arabic 90%, Cairo and Almarai none), written onto that family's `@font-face` blocks in the composite. Because it rides on the *font*, it applies per character, in every slot, on an English instance as much as an Arabic one. The composites fall back to `var(--font-*-system)`, so any character neither font covers still lands on the stack the instance would have used, including the Arabic-first ordering and the Arabic size compensation that `:root[lang="ar"]` applies.

## Your own fonts

For a face the catalog does not carry — often a licensed Arabic font that is on no public CDN — **Settings → Layout & type → Your own fonts** accepts an upload.

| | |
| --- | --- |
| **Formats** | `.woff2`, `.woff`, `.ttf`, `.otf` |
| **Size** | 5 MB per file |
| **Stored in** | `ASTROLABE_DATA/fonts/custom/` — outside the vault, and `ASTROLABE_DATA` is gitignored, so an uploaded face never lands in your notes repo or in a backup push |
| **Served from** | `GET /api/fonts/custom/<file>` on this instance — same terms as the catalog cache: self-hosted, no external host, immutable caching |
| **Offered in** | all four slots, under **Your fonts** |

The **format is decided by the file's first bytes**, never by its extension, and the header is checked for a plausible table structure: a file that is not a usable font (a PNG renamed `.woff2`, say) is refused with a `400` at upload time.

The stored filename is a slug the server builds; when your filename has no Latin letters (`خط-عربي.otf`), the font's own family name is used instead. The **family name** in the picker comes from the font's `name` table where the file allows it, falling back to the filename, so the picker says *Kitab* rather than *upload-3*. Uploading several fonts at once is safe.

Uploaded fonts are written into `/api/site-fonts.css` as ordinary self-hosted `@font-face` blocks, and they follow the **same per-slot `unicode-range` rule** as the catalog: in the Arabic slot an uploaded font is limited to the Arabic blocks, and an uploaded font in a Latin slot standing beside an Arabic one has those blocks carved out of it. The two sets stay disjoint, so per-character matching works with your own fonts exactly as it does with the catalog.

Uploads are admin-only (`POST /api/fonts/upload`; an admin previewing the public site is refused like any other visitor), and **removing** a font is guarded twice: a font a slot still uses shows which slot instead of a delete button, and the server refuses the delete with a `409` regardless.

## Arabic size match

The catalog's Arabic entries carry a *measured* `size-adjust`; an uploaded font cannot. So when an Arabic font is chosen, the tab grows one more control, a percentage with its unit in the field, which overrides the size compensation for whatever is in the Arabic slot, catalog or upload. You set it by eye against the specimen two rows above it. It is stored as `settings.fonts.arabicSizeAdjust` (50 to 300; absent means the catalog's own value, or none).

## Escape hatch, unchanged

For anything neither the catalog nor the uploader covers (a variable font you want to drive with a custom axis, a stack for one particular script, a font you would rather wire up by hand), put the file in `ASTROLABE_DATA/fonts/` and name it from `custom.css` exactly as shown in [Theming](theming.md#bring-your-own-fonts-the-css-route). That stylesheet is loaded *after* the generated one, so a `custom.css` rule on `:root` wins over the catalog, the uploads and the defaults alike.
