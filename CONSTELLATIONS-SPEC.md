# CONSTELLATIONS — the spec every builder works from

Astrolabe's own spaced-repetition study system, replacing Anki for the owner. The name is the
astrolabe's: the rete on the instrument is a map of the stars you learn to recognise. A DECK is a
**constellation**; a CARD is a **star**; a study run is a **session**. Arabic: الكوكبات (deck: كوكبة,
card: نجم, session: جلسة). The page is "Constellations" (replaces the Review page; `/review` and the
`~review` tab keep working as aliases of `/constellations` / `~constellations`).

## Principles (do not argue with these in your worktree)
1. THE NOTE IS THE STATE. A constellation is a Markdown note. Its cards are lines in that note in the
   syntax the vault already reads (shared/flashcards.ts). A card's schedule is the Obsidian Spaced
   Repetition plugin's comment `<!--SR:!due,interval,ease-->` — unchanged, so the vault stays one vault
   with the plugin. Nothing about a card lives outside the note except session-local learning steps
   (below) and per-device statistics caches that can be rebuilt.
2. NO NEW DEPENDENCIES on the server or the client. The .apkg importer uses node:zlib + a ~100-line
   zip reader + `node:sqlite` (Node 26 has it; guard with a dynamic import and a clear error on older
   Node). The prod server's node_modules cannot be refreshed.
3. EVERYTHING BILINGUAL (t()/tf() en+ar), s- classes, tokens, logical properties, keyboard-complete,
   RTL-correct, phone-usable at 412px. Docs en+ar. Gates green.
4. Pure logic in shared/ with node tests; the indexer scans with it; the server writes with it.

## The constellation note
A note is a constellation when it carries a ```constellation fence (anywhere; the first one wins):

    ```constellation
    title: Hiragana                # optional; the note title otherwise
    icon: あ                        # one emoji/glyph, drawn on the shelf card
    kind: typed                    # basic (default) | reversed | both | typed | cloze-only
    new per day: 10                # default 10; 0 = no new cards, only reviews
    steps: 1m, 10m                 # learning steps (defaults); relearn: 10m
    tags: japanese, kana           # for the shelf's filters
    ```

Cards are the lines that follow anywhere in the note, in document order:
- `front::back` — one star. Third optional segment `front::back::extra` — extra is shown on the
  answer side (a reading, an example, a mnemonic). Existing notes keep working (2 segments).
- `front:::back` — the plugin's reversed pair: TWO stars, front→back and back→front, with two
  schedules in one comment `<!--SR:!d1,i1,e1!d2,i2,e2-->` (the plugin's own format for `:::`).
  `kind: both` makes every `::` line behave as `:::`; `kind: reversed` makes every line back→front
  only; `kind: typed` shows an input on the front and compares the typed answer (normalised: trim,
  case-fold, Unicode NFKC, kana width) with `back`, colouring diffs — grading stays the reader's.
- `?` blocks and `==cloze==` highlights and `> [!quote]` as today (shared/flashcards.ts).
- A line may end with `#tags`; the shelf can filter by them. A card inside a code fence is never a card.
Headings inside the note are SECTIONS: the session UI shows the section name as a breadcrumb and
the shelf can study one section ("Lesson 3 only").

The implicit constellation "Everything else": every card in the vault outside a constellation note,
grouped by top folder, as the Review page did. It stays; the shelf lists it last.

## Scheduling (shared/srs.ts stays SM-2; shared/srsSession.ts is NEW)
- Stored state is SM-2 as today; `review()` unchanged.
- A SESSION adds Anki's learning queue in memory: a NEW card, or an AGAIN'd review, enters learning
  steps (`steps:` from the fence, default 1m then 10m): it is re-shown after the step elapses within
  the same session; graduating (GOOD after the last step, or EASY at any step) writes the SM-2 comment
  (good → 1 day; easy → 4 days). AGAIN on a review card (a LAPSE) writes SM-2's `again` result
  (1 day, ease −200) AND puts the card in the relearning step (10m) for this session. Steps are
  session-local: closing the page forgets them; the note holds the truth.
- Daily NEW limit per constellation (`new per day`), counted per local day in localStorage
  (`astrolabe.stars.new.<constellationPath>.<YYYY-MM-DD>`), so a device can't be tricked into a
  hundred new kana on day one. Reviews are never limited.
- Order within a session: learning cards whose step is due → due reviews (soonest due first, then
  document order) → new cards (document order, up to the limit) → interleave: after every 4 reviews,
  1 new. "Study ahead" (existing) remains available when nothing is due.
- Interval preview on the four buttons: computed by review() for review cards; for learning cards
  the step text ("10m", "1d", "4d").
- Retention statistic = grades good/easy over all grades of the last 30 days, from a per-device
  LOG in localStorage `astrolabe.stars.log` (ring buffer of last 5000 entries {path,line,grade,ts});
  the note holds no history (the plugin has none either). Forecast = count of cards due per day for
  the next 30 days from the schedules — computed, not stored.

## Server / indexer (shared/constellations.ts is the pure core)
- shared/constellations.ts: `parseConstellationFence(md)`, `constellationOf(md, path, title)` →
  {path, title, icon, kind, newPerDay, steps, tags, sections[], cards: Star[]}, `scanStars(md, kind)`
  (wraps scanCards with the 3-segment and ::: extensions and reversed pairs, each Star has
  {id: `${path}#${line}#${dir}`, dir: "fwd"|"rev", front, back, extra, section, line, end,
  schedule}), `writeStarSchedule(md, star, schedule)` (handles the two-schedule comment),
  `serialiseConstellation({title, icon, kind, cards: [{front, back, extra}]})` → note text (used by
  the New constellation modal and the importer).
- Indexer: each note record gains `constellation: Constellation | null` (from the fence); `cards()`
  keeps working for the implicit deck.
- API (server/api.ts): GET /api/constellations → [{path, title, icon, kind, tags, counts: {total,
  new, due, learning: 0}, sections: [{name, total, due}]}] plus the implicit one; GET
  /api/constellations/stars?path=…&section=… → Star[] for a session (the client orders them);
  POST /api/star/review {path, line, dir, grade, today} → {schedule} (writes the note; replaces
  /api/card/review, which stays as an alias); POST /api/constellations {title, icon, kind, folder,
  cards:[{front,back,extra}]} → creates the note (`<folder>/<title>.md`, default folder
  `Constellations/`); POST /api/constellations/import (multipart .apkg or .csv/.tsv) → {created:
  [paths]} — the importer maps Anki note types: Basic → `front::back`, Basic (and reversed) →
  `front:::back`, Cloze → a `?`-block per cloze deletion is WRONG — use `==cloze==` highlights on the
  text; extra fields → `::extra`; media files → the vault's attachments folder beside the note, with
  `![[file]]` embeds in the card text; Anki's scheduling (revlog/cards.due/ivl/factor) → the SR
  comment (factor/10 = ease ×1000 already; due days from the collection's crt); one constellation
  note per Anki deck (subdecks → sections as headings).
- Routes: /constellations (shelf), /constellations/<note path> (session), /review → /constellations.
  Tab `~constellations` (`~review` read as the same). Palette: "Open Constellations", "Study due
  cards", "New constellation…", "Import an Anki deck…". Status bar door: the Review door becomes the
  Constellations door (glyph: three stars joined by two lines). Orbits page line "N flashcards due"
  becomes "N stars due" linking to the shelf.

## Client (client/stars/*)
- Shelf (`/constellations`): a grid of constellation cards — icon, title, tags, due/new/total,
  a 30-day retention sparkline (from the log), "Study" (due + new) and "Study section ▾"; the
  implicit "Everything else" last; header: total due today, streak of days with a session; buttons
  "New constellation…" and "Import…". Empty state that teaches the syntax in two lines.
- Session (`/constellations/<path>`): one star at a time, the constellation's icon and section as a
  breadcrumb, a progress bar (done / remaining), the card: front; for `typed` an input with Enter to
  check (diff colouring; then the grade row); Show answer (Space/Enter); grade row with interval
  previews, keys 1–4; Edit (opens the note at the line in a new tab); Skip (bury for this session);
  Undo last grade (re-writes the previous schedule; one level); end-of-session summary (cards,
  retention this session, time, "again" list) with "Study more" / "Back to the shelf". Phone: the
  grade row is thumb-sized, sticky at the bottom.
- Stats drawer per constellation: retention 30d, forecast bars 30d, cards by state (new/learning/
  young < 21d / mature), the ten hardest stars (most "again" in the log).
- New constellation modal: title, icon (emoji field), kind, folder (default Constellations/), a
  textarea of lines `front::back::extra` (one per line; a preview count updates), or "From a folder's
  highlights" (creates a constellation whose cards reference… — NO: keep v1 simple: text lines only)
  and an Import tab (file picker: .apkg / .csv / .tsv, with a column mapper for CSV: front, back,
  extra). Save creates the note via the API and opens the shelf.
- Session-local learning queue in client/stars/queue.ts using shared/srsSession.ts.
- CSS in client/styles/stars.css: modern, calm, matches the app; the card is the hero; nothing
  overlays; dark/light via tokens; reduced-motion respected. Card flip = a short cross-fade, no 3D.

## Orbits integration (client/routines/* — MINIMAL touch; another session owns those files)
- An orbit slot text or every-day item that contains a wikilink to a constellation note shows,
  on the orbit card, a small "N due" chip after the text and a "Study" link that opens the session.
  When a session for that constellation ends with 0 due left today, the app ticks that slot for today
  (through the existing tick route) — one line in the session-end handler calling a helper exported
  from client/routines (add `tickSlotForConstellation(path)` there; keep the diff to that one export).

## Docs
- docs/constellations.md + docs/ar/constellations.md replace docs/flashcards.md (+ar): slug change
  in scripts/build-docs.mjs SECTIONS, docs/README.md row, README.md bullet, a redirect stub for the
  old slug the way orbits did, CONTRACTS.md section "Constellations". Plain language; the Arabic as
  native prose. Cover: what a constellation is, the note syntax with a full example, kinds, learning
  steps and the daily limit, the session keys, statistics, creating and importing (Anki .apkg, CSV),
  the orbit link, the plugin compatibility promise.
- Deck slide copy (en+ar, title + body, drawing description) returned to the orchestrator; NO edits to
  client/whatsnew/*.

## Names of things (i18n key prefix `stars`)
Constellations / الكوكبات · constellation / كوكبة · star / نجم · session / جلسة · Study / ادرس ·
Show answer / أظهر الإجابة · Again / مرة أخرى · Hard / صعب · Good / جيد · Easy / سهل ·
New constellation… / كوكبة جديدة… · Import… / استيراد… · Everything else / كل ما سواها ·
due / مستحق · new / جديد · learning / قيد التعلم · retention / الاستبقاء.
