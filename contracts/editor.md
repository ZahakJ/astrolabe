# The editor

The editor: the open document and its buffers, the pointer, selections, formatting, the selection menu, sections, templates, tables, drawings, LaTeX notes and annotations. Part of the module contracts (see [CONTRACTS.md](../CONTRACTS.md) for the map). **Edit the area, append nothing:** a change to how something works is written HERE, in the section it changes, and the old sentence goes; a release gets one line in [releases.md](releases.md), never an addendum.

## The open document (client/editor/buffers.ts)

**A note's document lives in a refcounted registry keyed by path, not in the component that draws
it.** `Editor.tsx` owns a VIEW — the DOM, the scroll position, the vim toggle. The BUFFER owns the
`EditorState`: the text, the undo history, the selection, the folds, the dirty flag, the autosave
timer, and the `baseMtimeMs` its next write is checked against.

**The bug this fixes was in plain sight.** `App.tsx` remounts the editor on every `openPath` change,
and the editor fetched on mount and destroyed on unmount — so switching tabs threw the document away
and everything CodeMirror keeps beside it. The visible casualty was undo: leave a note, come back,
and `Ctrl+Z` had nothing to undo, in a product whose autosave writes to disk every 600ms and whose
`.trash/` catches deletes and not overwrites. The structural casualty was larger and had not happened
yet: two panes on one note would have been two documents typed into independently, and whichever
unmounted last would have won.

Four things fall out of the one change: undo survives a tab switch, two panes are one document typed
into twice, the save path finally has somewhere to keep the mtime a precondition needs, and a
document can outlive the pane that showed it.

- **Views are mirrored by CHANGES, never by selection.** `dispatchFrom()` applies a transaction to
  the originating view, stores the result as canonical, and forwards only `tr.changes` to the other
  views of that buffer, annotated so the echo is not forwarded back. Copying the selection across
  would drag the reader's caret in the pane they are *not* typing in — two panes on one note are one
  document with two carets, which is the entire point of having two.
- **An unmount does not flush, and that is the change.** Releasing a reference saves only when
  nothing holds the note any more, and keeps the buffer until that write lands: an unsaved document
  is not a cache entry. Flushing on unmount as well would race the registry's own timer and send the
  same text twice.
- **The caret is placed once per NOTE, not once per mount.** A buffer restored from the registry
  brings its own selection back, so re-running the frontmatter jump would drag the caret out of the
  reader's sentence and into the properties card every time they switched tabs and came back.
- **A rename carries the buffer** (`remapBuffer`), or the undo history of the note being renamed is
  dropped at the one moment a reader is most likely to want it back.
- **An external change is ADOPTED, not remounted.** The shell used to answer the watcher's "changed"
  event with `bumpReload()`, and with the registry in place that became the wrong mechanism: an
  unmount releases the buffer and the remount re-fetches it, so the note would come back correct and
  the reader's undo history would be gone — on an event they did not cause. `adoptExternal()` writes
  the new text through the document as an ordinary transaction, so the external change is itself
  undoable. A DIRTY buffer is never adopted: that is a real conflict and belongs to the precondition
  below. The remount survives as the fallback for the surface that has no buffer — the reading view.

### The write precondition (server/vault.ts, `PUT /api/note`, `POST /api/note/flush`)

`writeNote(rel, content, baseMtimeMs?)` refuses with **409 `code: "stale"`** when the file's current
mtime is not the one the caller was last handed. Enforced in `writeNote` rather than in the route, so
the gap between reading the mtime and replacing the file is as small as this process can make it —
and so it is testable without standing a server up (`tests/durability.test.ts`).

- **Strict equality.** The value compared against is one this server produced from its own `stat`, so
  a tolerance would only ever serve to accept a genuine conflict on a coarse-mtime filesystem, which
  is the wrong direction to fail. It stays a net rather than a lock: two writes inside one tick of a
  coarse clock are genuinely indistinguishable, and this sentence is the contract admitting it.
- **A refusal is TOTAL.** Nothing is written. A precondition that half-writes is worse than none,
  because the file it leaves is neither version.
- **A file that is GONE is written, not refused.** Recreating is kinder than refusing to save work
  into a note somebody else deleted, and the caller learns of the deletion from the watcher anyway.
  **"Gone" means `ENOENT` and nothing else.** Any other errno on that `stat` — `EACCES`, `EIO`,
  `EMFILE` — means the precondition could not be CHECKED, which is not the same as there being
  nothing to check, and the write is refused. A bare `catch` here used to swallow all of them, so
  one unreadable directory turned a guarded save into an unguarded one and the precondition was
  skipped in silence.
- **The write path's errnos are named, not swallowed** (`server/vault.ts::writeFailure`). `ENOSPC`/
  `EDQUOT` → **507 `code: "diskFull"`**, `EROFS` → `"readOnly"`, `EACCES`/`EPERM` →
  `"writeDenied"`, `EIO` → `"writeIO"`, `EMFILE`/`ENFILE` → **503 `"vaultBusy"`**; anything
  unrecognised is re-thrown untouched, because dressing an unknown error as a disk problem is how a
  real bug gets filed as "disk full". The editor translates the first two (`saveDiskFull` /
  `saveReadOnly`) and falls back to the general sentence for the rest.
- **Opt-in, deliberately** — by the PRESENCE OF THE FIELD, so there is no flag to forget to set and
  no default to argue about. A write with no `baseMtimeMs` (an older client, a script, `curl`) keeps
  last-writer-wins exactly as it always did; that is the compatibility promise, and
  `tests/durability.test.ts` pins it.
- **The server's own read-modify-write routes send one too.** `POST /api/publish`,
  `POST /api/frontmatter` and `POST /api/alias` each `readNote` → edit one line → `writeNote`, and
  they now pass the `mtimeMs` that read handed them. It costs nothing — the stat has already
  happened — and it closes the last door THIS incident could come back through: the loser of that
  race is a frontmatter line silently reverting, which is precisely what happened. "The window is
  only milliseconds" was an argument about how LIKELY the race is, never about what it costs when
  it lands, and a vault with two servers over it runs that race for real.
- **The rename and folder-move link rewrites stay unconditional, and they are the one exception.**
  By the time those loops run the file has ALREADY moved, so a 409 cannot be reported as "try
  again": it would abort a gesture half-applied and leave links pointing at a name that no longer
  exists. They also touch notes the reader never named, where a refusal is a message about a file
  they are not looking at. What that accepts in exchange is bounded and self-repairing — one
  `[[wikilink]]` spelling lost to a concurrent edit of the same line of the same third-party note,
  which the next rename of that target rewrites correctly anyway. The seams say so in prose, so the
  next reader knows it was decided rather than missed.
- **The section writer (`client/sectionActions.ts::applyNoteContent`) keeps last-write-wins**,
  because when an editor holds the note it does not write at all: it dispatches ONE transaction
  into the buffer (undoable, and the autosave carries it to disk under the precondition), and the
  `putNote` arm is reached only when nothing holds the path — where the content came from a
  `getNote` a moment earlier.
- **A refused save loses nothing.** The buffer keeps the reader's text, stops autosaving so the next
  keystroke's timer cannot clobber the newer version, holds the disk version in `diverged`, and says
  so. `keepMine()` re-bases onto the disk version and saves; `takeDisk()` replaces the document
  through the history, so the resolution is itself undoable. The side-by-side comparison arrives with
  the pane work, which is where there is room to show both.
- **A failed save that is NOT a conflict is still said out loud.** The buffer stays dirty on purpose:
  the text is here, the tab still shows its dot, and the next edit reschedules the write.
- **A refused save whose file cannot be RE-READ is the one state that must never be silent.** The
  409 arm re-reads the note to hand the pane a disk version; when that read fails there is no
  conflict to show and nothing to resolve, and the branch used to simply `return`. Nothing fired,
  `baseMtimeMs` stayed stale, every later autosave took the same path and said the same nothing, and
  the `beforeunload` beacon carried the same precondition the server had been refusing all along —
  so the writing went nowhere and the only notice was the note being an hour behind the next time it
  was opened (v1.8 client-solidity audit, B1). It now RETRIES on a backoff and SPEAKS:
  `client/editor/saveRetry.ts` is the policy — 1s, 2s, 4s, 8s, then 15s for ever — and it announces
  the first failure, again once the backoff reaches its ceiling, and then about every two minutes.
  It never gives up, because the buffer holds the reader's only copy and a client that stops trying
  has decided on their behalf that the server is not coming back. `SaveStuckError` carries
  `code: "saveStuck"` so the sentence is the reader's language, not a bare "Failed to save". A
  buffer with `staleRetries > 0` keeps ITS timer: a keystroke does not reset the backoff to 600ms.
- **A transaction may be BUFFER-WIDE.** Mirroring carries `changes` and nothing else, which is right
  for typing and wrong for the one thing that is neither text nor per-caret: an in-flight upload's
  placeholder decoration. Annotating a transaction with `bufferWide` forwards its EFFECTS to the
  other views too, and mirrors it even when it changes no text. Without it the pill showed in the
  pasting pane alone, and — worse — the sibling merely focusing the note replaced the canonical
  `buf.state` with one that had never heard of the upload, so the answer had nowhere to land.
- **`applyToBuffer(path, spec)` edits a note with no view of it held.** A live view is still the
  right target when there is one (it goes through `dispatchFrom`, so mirroring, dirtying and the
  autosave happen exactly as for typing); with none, the same three are done against the stored
  state. A spec with no `changes` is not an edit and does not dirty the note. The upload path is why
  it exists: an upload is a round trip that outlives the pane that started it, and `uploads.ts` used
  to answer that by checking `view.dom.isConnected` and giving up — leaving an "Uploading…" pill in
  a preserved `EditorState` that nothing could ever remove, and the picture nowhere in the text
  (v1.8 audit, B3).

### Revalidate on wake (`GET /api/note/state`, `client/editor/revalidate.ts`)

**The precondition is a net; this is what stops anyone hanging in it for days.** A client learns
that a file moved from ONE channel — the SSE stream — and that channel has two holes in it that no
amount of care at the write seam can close:

- **A stream that dropped and came back replays nothing.** `EventSource` reconnects on its own and
  the server has no `Last-Event-ID` history, so every frame sent while a laptop lid was shut is
  simply gone.
- **Two servers over one vault is two watchers, each announcing to its own subscribers.** A client
  of the desktop app's child server is told nothing about a write made through the systemd
  instance's web admin, and it does not have to have been asleep for that to be true.

**THE INCIDENT, named because the code names it.** A note was published from the web (prod wrote
`publish: true`); the desktop app had been running for days with that note's buffer loaded from
before the publish. Nothing was overwritten — the precondition refused the stale save — but the
only way the client could have DISCOVERED it was stale was by trying to write, which is the worst
moment to find out: mid-sentence, with a choice to make about a note the reader stopped thinking
about a week ago.

So a client that WAKES re-asks. Two triggers, both meaning "I have been out of the room": the SSE
stream reconnecting after a drop (`subscribeEvents(cb, onReconnect)` — first connect is not a
reconnect), and `visibilitychange`/`focus` bringing the window back, throttled together at 2s
because one alt-tab raises both.

- **Scoped to the OPEN BUFFERS, never the vault.** The question is "is what I am holding still the
  file?", and a reader with three tabs must not walk 1,400 notes to answer it. One request, mtimes
  only — the bodies are fetched afterwards and only for the notes that actually moved.
- **The decision is a pure function** (`revalidationFor`, its own file, no imports at all) so it can
  be read in one screen and tested without a browser: `skip` | `adopt` | `diverge`. Clean and stale
  → adopt silently through `adoptExternal`, which goes through the document's history like any
  other external change. Dirty and stale → `diverged` and the conflict strip, NOW rather than at
  the next autosave. Already diverged → skip: the reader is being asked a question and the version
  they are choosing against must not change underneath the answer.
- **Gone is not stale.** `mtimeMs: null` is skipped. Deletion is the watcher's story (the shell
  closes the tab on `deleted`), adopting an absent file would blank the reader's document, and a
  visitor-scoped session is told `null` for a note it may not know exists — so the route reveals
  nothing `/api/note` would not.
- **Strict inequality, not "is the disk newer".** A restored backup, a `git checkout` of an older
  revision and a clock that stepped back all leave a file that is not the one we loaded, which is
  the whole question — and it is the same comparison `writeNote` makes, deliberately.
- **It must not report this client to itself.** Our own write moves the mtime and the probe can
  observe the new one before the response that re-bases us lands. Both halves are checked: the
  buffer's `saving` flag for a request in flight, and `recentSelfWrite` (`client/state.ts`) for the
  publish toggle, the banner setter and the section writer, which move the file through routes the
  registry never hears about. Erring long costs one delayed revalidation; erring short offers the
  writer a conflict with themselves, which is the failure `markSelfWrite` was written to end.
- **Every failure is a NON-EVENT.** A network error, an expired session, a note that vanished
  between the two requests — the buffer is left exactly as it was. This is a courtesy that spares
  the reader a surprise; the precondition is still the thing that stops the clobber.

### `POST /api/note/flush`, and closing a tab

There was no `beforeunload` anywhere in the client and `putNote` is a plain fetch, so closing a tab
mid-sentence warned about nothing and saved nothing. The loss is one sentence at a time, which is
exactly why it erodes trust rather than getting reported.

`/api/note/flush` is `PUT /api/note` reachable by `navigator.sendBeacon` — POST-only because that is
what the API requires, and it exists because a `fetch` started in `beforeunload` is cancelled with
the document while `sendBeacon` is the one transport the platform promises to deliver afterwards. It
carries the same precondition: a last-gasp save that clobbers a newer version is still a clobber, and
the reader who caused it is by definition not there to be asked.

The handler **beacons first and prompts second**, and only prompts when something was still unsaved
after the attempt. A confirmation dialog in front of a reader whose work is already on its way is a
dialog that teaches them to click through dialogs.

### `client/editor/bufferBridge.ts` — and why it exists

`buffers.ts` imports CodeMirror. `App.tsx` and `state.ts` need four things from it (flush on close,
ask what is unsaved, adopt an external change, follow a rename) and both are in the FIRST-PAINT
closure. A direct import would pull CodeMirror into the entry chunk and `npm run check-bundle` would
fail with a message about CodeMirror in first paint — a message whose stated cause has nothing to do
with the line that caused it, in a file nobody would think to open. So the registry registers itself
with a CM-free bridge and the shell calls through that. Written before the registry, on purpose: the
failure it prevents is one that misreports itself.

### A note OPENS RENDERED, and the caret has a home

**THE REVEAL RULE IS STATE, not a flag on a view** (v1.8 UX audit, finding #1 — the raw-YAML bug).
Both decoration passes hide markdown source on every line except the one the selection sits on, and
a freshly built `EditorState` puts that selection at offset 0 — which is inside the frontmatter
fence. The inline pass knew this and kept an `interacted` flag on its `ViewPlugin`; the BLOCK pass
(the properties card, the banner, the hidden fence markers) did not, because it is a `StateField`
and a `StateField` has no view to hang a flag on. So the two everyday triggers opened five lines of
raw YAML with no card and no banner until the reader clicked somewhere: **splitting a pane** (a
second `EditorState` is built for the new pane) and **publishing** (`togglePublish` → `bumpReload`
remounts the editor). A tab switch and back did the same, for the same reason.

`interactedField` (livePreview.ts) is therefore a `StateField<boolean>` that BOTH passes read
through `activeLines()`: false until the first transaction carrying a `Transaction.userEvent` or
changing the document. Programmatic dispatches — parking the caret on open, a language effect, a
mirrored sibling selection — carry neither and deliberately do not flip it: the reader has still
not touched the note. It is registered BEFORE `blockHiding` in the extension array, because a
`StateField` may only read fields that come earlier in the configuration.

**A REMOUNT PUTS THE CARET BACK.** Publishing and setting a banner rewrite the file's frontmatter
and rebuild the state; once the raw YAML was fixed, what was left was a reader mid-sentence whose
caret jumped to the top of the note for pressing publish. `Editor.tsx` remembers the caret per path
(bounded `Lru`, beside `scrollPositions`, written on unmount) and restores it when the state it
mounts onto has its selection at 0. The measure is DISTANCE FROM THE END: the only thing that
remounts an editor mid-session is a write ABOVE the caret — one `published: true` line lands in the
fence and every body offset moves by its length — and when the document did not change length the
two measures agree anyway.

**THE CARET'S HOME** (`client/editor/caretHome.ts`, proven in tests/caret.test.ts) is past the
frontmatter and past the blank line under it (F9). It used to land on that phantom line between the
properties card and the H1: a gap with nothing to read and nothing to continue, drawn as a stray
empty paragraph at the top of every note in the vault. It goes to the END of the first heading line
instead, so the first keystroke extends the title. A headingless note gets the START of its first
prose line — not the document end, because a note opened onto its own last line is worse than the
gap this fixes — and a note that is only frontmatter gets the document end, because it is waiting to
be written. In a `.tex` note the frontmatter is the `%---%` comment block and the same rule applies
over it. What the rule must NEVER do is land inside the fence: that is the raw-YAML bug arriving
through the other door, and it is the property the test file asserts over every shape of note.

## Pointer → document mapping (the ONE implementation)

**`client/editor/pointer.ts` owns every question of the form "which document position is under
this point", and CodeMirror's `posAtCoords` is not that implementation.** Live preview replaces
source with rendered boxes of a different WIDTH and a different LENGTH — `$7.7\ \text{km/s}$` is
eighteen characters of markdown standing under seven glyphs of KaTeX, `[[Note|alias]]` hides
eleven characters that still occupy positions, `![dot](…)` is one offset wearing an image — and
`posAtCoords` reasons about geometry: it walks the height map to a block and binary-searches that
block's client rects. On a row carrying a replaced inline widget that search gives up and returns
**the end of the line**. Measured on the live vault's "Eppur si muove", on the wrapped row that
carries one inline formula, x = 500 / 527 / 620 / 700 / 804 all resolved to doc position **606**,
the line's end, against a truth of 552 / 556 / 570 / 581 / 598. That is the owner's report — "click
near the start of a line and the caret lands about 25 words in" — and the error IS the distance
from the click to the end of the line, which is why it scales with how much rendered math precedes
it.

- **The mapping asks the DOM, which cannot be wrong about which glyph is under a point**:
  `caretPositionFromPoint` (WebKit: `caretRangeFromPoint`) → `posAtDOM`. Inside a widget's own DOM
  that resolves to the widget's START, which is exactly what "click the rendered math to edit its
  source" means. `posAtCoords` survives only as the last resort, for points the DOM refuses to
  answer for.
- **THE FIX HAD TO REACH THE CARET, NOT ONLY THE READERS OF A POSITION.** The block-widget case of
  this bug was fixed once already — the frontmatter card, named in livePreview.ts — and the fix
  stopped at links and hover cards, because CodeMirror places the caret from its OWN mouse
  handler and nothing had told it otherwise. `pointerSelection` is that instruction: an
  `EditorView.mouseSelectionStyle` that replaces `basicMouseSelection` wholesale (Shift extends,
  Alt adds a range, double/triple click take a word / a line), resolving every position through
  this file. Four consumers, one implementation: caret placement, wikilink / footnote / url clicks
  and checkbox toggling (livePreview.ts), the hover previews (hoverPreview.ts), and the selection
  menu.
- **Assoc is decided by the click's own y.** One document position sits at the end of one visual
  row AND the start of the next; the two rows are ~30px apart, so `assocAt` compares
  `coordsAtPos(pos, 1)` and `coordsAtPos(pos, -1)` against the pointer.
- **AND THE ANSWER IS CONSTRAINED TO THE ELEMENT UNDER THE POINTER, which is a BIDI correction.**
  `caretPositionFromPoint` does not answer "which glyph is here"; it answers "which INSERTION POINT
  is nearest", and at a bidi seam those are different questions whose answers can be a hundred
  characters apart. A line whose base direction is LTR and whose body is one long Arabic run ends
  in a neutral — a full stop — and the bidi algorithm gives that neutral the PARAGRAPH's direction,
  so it is painted at the visual RIGHT edge of the last row: on top of the leading edge of that
  row's first logical Arabic glyph. Two positions, 73 characters apart, sharing one x; Chromium
  returns the later one, so clicking the first glyph of the row put the caret at the end of the
  sentence. So `posFromPoint` keeps the browser's position only when it lies inside the document
  range of the element `elementFromPoint` names, and otherwise takes the nearest boundary that
  does. A REPLACING widget's own DOM collapses to a point (`from === to`) and is left alone —
  "click the rendered math to edit its source" is a widget-start answer by design. On every
  ordinary click the position is already inside the element it was read from, so this costs one
  comparison. `check-caret` covers it: the case is the gate's own `LINK-AR` line, in the RTL half.
- **A drag leaves the content**, so `posFromPointOrNearest` falls through to
  `posAtCoords(…, false)` — the height-map estimate is the right tool once the DOM has no glyph to
  offer, and a selection that stops updating past the last line is a selection that snaps back.
- **THE GATE IS `scripts/check-caret.mjs`**, documented in README beside the other gates. It writes
  its own note — inline math, inline code, wikilinks, tags, highlights and an image, in English and
  Arabic, on lines long enough to wrap several times — parks the selection on a neutral line before
  each sample (the reveal-on-cursor rule rewrites the layout of whatever line the caret is on, so
  measuring and clicking must both happen with the target RENDERED), takes the glyph's own box from
  `coordsAtPos(pos, 1)`…`coordsAtPos(pos + 1, -1)`, clicks 35% into it, and requires the caret
  within ONE character. Zero-width positions (hidden syntax, replaced source) and positions
  straddling a soft wrap are skipped — they are not clickable glyphs. Rendered wikilinks, tag pills
  and images are skipped too: off the cursor line those are BUTTONS, and clicking one navigates
  rather than placing a caret. The matrix runs once in each shell direction. Measured against the
  unfixed build: 15 failures, worst |Δ| **82**.

## Multiple selections (client/editor/setup.ts, pointer.ts)

**Multiple selections are the default, and every formatting rule survives them.** `Ctrl/Cmd+D`
takes the next occurrence of the current word, `Ctrl/Cmd+Click` drops an extra cursor (and, on a
cursor that already exists, removes it), `Alt+drag` makes a rectangular selection, and
`Ctrl/Cmd+B` over five ranges bolds five things — writing `\textbf{…}` five times in a `.tex`
note, because the vocabulary is resolved from the NOTE and not from the keystroke (see "A FOURTH
RULE" below).

**The feature was one line, and that is the whole story of it.** `EditorState.allowMultipleSelections`
appeared nowhere in the client, so `@codemirror/state` funnelled every multi-range selection
through `asSingle()` — while the machinery to produce and honour those ranges had been written,
reviewed and shipped:

- `client/editor/pointer.ts`'s `get(event, extend, multiple)` already implemented BOTH halves of
  Mod+click — `startSel.addRange(range)` to add one, `removeRangeAround()` to take one away.
- `client/editor/livePreview.ts`'s `activeLines()` already loops `state.selection.ranges` and
  reveals the raw markdown around EVERY range, so a secondary caret was never going to land inside
  a hidden marker and type where the reader cannot see. That was the loudest risk raised against
  this change, and the code had already answered it.
- The colour commands in `commands.ts` already map over `state.selection.ranges` and carry
  `mainIndex` through the dispatch.

So the honest description is not "multi-cursor was added" but "multi-cursor was switched on". Two
of the three keys it needs were also being eaten elsewhere, which is why nobody noticed: `Mod-d`
(`selectNextOccurrence`) has been in the extension list inside `searchKeymap` since it shipped and
never once fired, because `client/App.tsx` claimed `Ctrl/Cmd+D` for the daily note in the CAPTURE
phase. The daily note now wears `Ctrl/Cmd+Alt+D`, on the same reasoning that moved the pane
toggles to Alt: the unmodified key belongs to the editor, and a once-a-day verb does not outrank a
per-minute one.

**`preventDefault` in that listener is how a binding dies silently, and it has now happened twice.**
CodeMirror's keydown pipeline begins `if (event.defaultPrevented) break`, so a capture-phase
`preventDefault` on `window` does not merely stop the browser — it stops the EDITOR. `Ctrl/Cmd+B`
learned this when it became bold; `Ctrl/Cmd+D` is the second case and takes the same shape: the
key is defaulted ONLY when the event's target is outside the editor, where it would otherwise be
Chrome's and Firefox's "bookmark this page". Inside the editor the event is left entirely alone,
which is also what lets vim keep `Ctrl-D` as its half-page scroll — the vim compartment sits ahead
of `searchKeymap`, so it wins simply by nobody taking the key first.

**`rectangularSelection()` sits ABOVE `pointerSelection` in the extension list, and the order is
the feature.** `EditorView.mouseSelectionStyle` takes the first style that answers, and
`pointerSelection` answers every primary-button press including one with Alt held; rectangular
selection's own filter is `altKey`, so putting it first means Alt-drag becomes a column selection
and every other drag still resolves its caret through pointer.ts's DOM mapping rather than
`posAtCoords`. `crosshairCursor()` is the affordance: hold Alt and the pointer says what the next
drag will do.

## Text formatting (client/editor/commands.ts)

**One implementation, three surfaces** — the keystroke, the selection menu and the floating
toolbar all call the same command; a menu that inserted its own asterisks would drift from Ctrl+B
the first time either changed, silently.

- **Bindings are Obsidian's, checked rather than guessed**: `Mod-b` bold, `Mod-i` italic,
  `Mod-Shift-x` strikethrough, `Mod-Shift-h` highlight. `Mod-u` underline is the word processor's —
  Obsidian has no underline command, because markdown has no underline — and emits `<u>`, which
  `rawHtml.ts`'s `INLINE_TAGS` already admitted and the reading view already rendered. `__text__`
  was rejected: it is a second spelling of bold. Inline code has no Obsidian default and gets none;
  it lives in the menu.
- **`Prec.high` so they beat `defaultKeymap`, but BELOW the vim compartment**, which is first in
  the extension list: vim's Ctrl+B stays page-up, exactly as the shell handler used to promise.
- **THE PANE TOGGLES MOVED, AND `preventDefault` IS WHY THEY HAD TO.** `Mod-b` was the notes
  sidebar and `Mod-Shift-b` the outline pane. Formatting wins in the editor — it is the binding
  every reader arrives with — so the pair kept its shape (one key, Shift picks the second pane) and
  took one more modifier: **`Ctrl/Cmd Alt B`** and **`Ctrl/Cmd Alt Shift B`**, resolved through
  `shortcutKey(e)` because both Alt and the LAYOUT rewrite `key`, and refused
  while `AltGraph` is down (Right-Alt reports ctrl+alt on European layouts). The status-bar
  tooltips, both palette rows and the Ctrl/Cmd+/ sheet print the new numbers, and the sheet gained
  a *Formatting* group so it can answer "what happened to Ctrl+B" in one glance.
  App.tsx's capture handler no longer `preventDefault`s `Mod-b` INSIDE the editor: CodeMirror's
  keydown pipeline opens with `if (event.defaultPrevented) break`, so a capture-phase
  `preventDefault` does not merely stop the browser, it stops the EDITOR — measured, the new
  binding was silently dead while that line stood. Outside the editor it still dies there, because
  Firefox's bookmarks sidebar (Ctrl+B) and Chrome's bookmark bar (Ctrl+Shift+B) must never open
  over the app.
- **Three rules every command obeys.** (1) *Applying twice removes* — each kind carries a regex for
  its own rendered span, and a range already inside one is unwrapped. The containment test is
  against the span's OUTER range, markers included: the narrower "inside the inner text" broke the
  second press on a multi-line selection, whose middle lines are clipped with one end inside the
  markers and the other outside, and Ctrl+B answered by bolding the bold (`****alpha line one****`).
  (2) *No selection is a real case* — markers inserted, caret parked between them, and a caret
  already inside a span of that kind removes it. (3) *A multi-line selection is applied PER LINE* —
  markdown emphasis does not cross a blank line, so one `**` at the top of three paragraphs is two
  stray asterisks and a lost paragraph break; blank lines drop out and trailing whitespace is
  excluded.
- Line-level structure (`toggleLinePrefix`) treats `#`/`##`/`###`, `- `, `1. `, `- [ ] ` and `> ` as
  ONE family: applying `## ` to a `# ` line replaces rather than stacks, and a numbered list
  numbers itself down the block instead of emitting five `1.` lines.

### A FOURTH RULE: the commands answer the note's FORMAT

A note is no longer necessarily markdown, and `**bold**` typed into a `.tex` file is not bold text
— it is two pairs of asterisks that `pdflatex` prints verbatim, that `shared/tex.ts` does not read,
and that the live preview beside the caret does not render. Measured before this landed: Ctrl+B in
a `.tex` note wrote `**Typed**`, the menu's "Heading 2" wrote `## ` (invisible to the `\section`
outline, so the note lost a heading it appeared to gain), and a colour swatch wrote a
`<span style="color:…">` into a LaTeX document. Three agents each shipped something correct and the
seam between them was the defect; this is the rule that closes it.

- **`syntaxOf(state)` is the one question**, answered from `notePathFacet`, which BOTH editors
  provide (livePreview.ts for markdown, tex/preview.ts for LaTeX). The keystroke, the selection
  menu and the floating toolbar all ask it, so none of the three can drift from another — the same
  argument that made them share `format()` in the first place.
- **The LaTeX column is exactly what the reader can read back.** `\textbf` / `\emph` /
  `\underline` / `\texttt` are four of the six `STYLE_COMMANDS` in `shared/tex.ts` (and of
  `TEXT_STYLE` in tex/preview.ts). Anything else would render as raw source in the very next paint.
- **A format with no honest spelling is ABSENT, never approximated.** There is no `\sout` without
  `ulem` and no `\hl` without `soul`, so strikethrough and highlight do not exist in a `.tex` note:
  their rows are gone from the menu, their glyphs are gone from the toolbar (a button that does
  nothing when pressed is worse than one that is not there), and their keystrokes DECLINE — return
  `false`, so the key falls through instead of being silently eaten, while `preventDefault: true`
  still keeps Ctrl/Cmd+Shift+H off the browser's history sidebar. The task list goes the same way.
  **The colour group is gone entirely** in a `.tex` note: a coloured run is HTML.
- **Structure translates rather than transferring.** A markdown heading is a PREFIX and a LaTeX one
  is a CALL, so `toggleTexSection` wraps the line instead of prefixing it — and keeps both of the
  family rules: applying `\subsection` to a `\section` line REPLACES it, and the second press takes
  it off, with **whatever trailed the heading (almost always its `\label`) carried through
  unharmed**. Lists and quotes become `itemize` / `enumerate` / `quote` environments
  (`toggleTexEnv`), whose "second press removes" test reads the lines JUST OUTSIDE the selection,
  because that is where `\begin`/`\end` ended up after the first press.
- **A wikilink becomes `\note{…}`** — Astrolabe's own macro, the one `astrolabe.sty` makes compile
  elsewhere — and a link becomes `\href{url}{…}`. **Inline math is the one row that is
  byte-identical in both languages**, which is the whole reason `$…$` was chosen for it.

## Selection menu & floating toolbar (client/components/SelectionMenu.tsx, styles/selection.css)

- **Right-click over a SELECTION** opens it; with nothing selected the browser's own menu
  (spelling, paste, the dictionary) is the better answer and taking it would be theft.
  `Shift+F10` and the Menu key open the same menu at the selection — a menu reachable only by
  right-click is a menu half the readers of this app cannot open.
- **A MENU IS NOT A PANEL.** The top level is *text style* (six rows), *colour* (ONE swatch row
  plus a "fixed ink" checkbox) and two doors — *Structure ›* and *Insert ›* — which open as
  FLYOUTS beside their row (3.3.1; they were pages that replaced the box, with a Back row): the
  root stays put, the flyout sits toward the trailing edge and flips when that edge is out of
  room, opens under the pointer after 180 ms or on a click, and folds on ← / Esc, on a click of
  its own row, or when the pointer rests on another root row. Two highlights, one keyboard:
  `where` says which box ↑↓ and Enter address. Flat, the vocabulary measured 341×884 in
  a 1440×900 viewport and 341×828 with 1,217px of scroll at 390×844: twenty-one rows, seventeen
  swatches and four lines of body copy, i.e. ~390px of scrolling INSIDE a context menu to reach
  "Remove colour". Nothing was dropped — the palette owns the same commands, and a page a reader
  opens on purpose costs no height to a reader who does not.
  **Re-measured, because the box grew back.** The 3.3.1 number (273×458) stopped being true as rows
  were added, and an audit of 3.17.3 found it at 233×650 in a 900px viewport — clamped to y = 8,
  which is to say nowhere near the words it acts on. Three cuts, in the repo's own moves: the
  "Hide the floating toolbar" row is **gone** (Settings › This device and the palette own that
  preference, and a menu of verbs about the selected words is not where a menu configures itself);
  Extract, Annotate and Make a card are **one untitled group**, because they are one idea — what
  the selection becomes somewhere else — and each rule between them cost 11px; and desktop rows are
  **28px** (`padding: 4px 10px`), with the coarse block's 44px floor untouched, since that is the
  one place a menu row is a touch target. Measured after, on a markdown note at 1440×900:
  **233×540, fifteen rows in four groups, no internal scroll** (`scrollHeight === clientHeight`).
  It is still tall enough to be clamped against a selection low in the viewport; that is a
  consequence of the vocabulary being complete, and the next cut has to come from the vocabulary.
- **The colour group is one row.** The two tiers stay (see *Coloured text*) but the reader does not
  adjudicate a WCAG argument at the moment they want a word red: the row is theme-aware by default,
  a *Fixed ink* checkbox switches the same row to the literal inks, the arithmetic lives in each
  row's `title` instead of four lines of prose in the box, and **Remove colour is the ⊘ chip at the
  end of the row**, not a row of its own.
- Keyboard-complete: ↑↓ walk the flat
  row list, ←→ walk a swatch row *answering the inline direction* (the settings SegmentedControl's
  rule) and open/leave a page by the same rule, Enter runs the highlighted row, Esc leaves a page
  and then closes, handing the caret back. Hover never moves the
  keyboard highlight without the pointer actually moving — the palette's bug, which the theme
  picker also refused to reproduce.
- **ONE ROW IS LIT, AND IT IS LIT IN THE PRODUCT'S OWN LANGUAGE.** `--accent-soft` plus a gold
  leading bar — what the command palette uses. The generic `button:hover` in app.css paints
  `--bg-hover`, which was ALSO the active row's ground, so the row under the finger and the row
  Enter would run looked equally chosen and regularly were not the same row (measured at 390: Bold
  keyboard-active and Heading 1 pointer-hovered, both `rgb(41,35,26)`). `.s-selmenu__row:hover` now
  paints nothing; the pointer's only job is to move `--active`.
- **Keycaps and group titles are `--text-muted`**, not `--text-faint`: they sit on the highlighted
  row's `--bg-hover`, where faint measures 2.74–2.98:1 across the themes. `check-contrast.mjs`
  walks `--bg-hover` as a third ground now (DESIGN.md, *Contrast*). Below 700px or on a coarse
  pointer the keycaps are **not rendered at all** — a keyboard legend on a device with no keyboard
  is the taunt DESIGN.md already forbids in the empty state.
- **Clamped into the viewport and opened toward the reading direction**, measured from the rendered
  box after layout — the tree's context menu had to learn this for the same reason: in Arabic, and
  whenever a reader pins the sidebar right, the pointer is regularly at the trailing edge. Verified
  at 1440×900 and 1024×620 in Arabic: inside the viewport on both axes, document horizontal
  overflow 0.
- **Focus lands AFTER the placement**, never on mount — the shell's "focus after the reveal lands"
  rule one component down. Without it Esc goes to the page and the menu cannot be closed from the
  keyboard.
- **The floating toolbar carries six actions** — bold, italic, strikethrough, highlight, inline
  code, and the door to the full menu. Underline is deliberately absent: least used of the six
  wrapping formats in a markdown vault, and it keeps its keystroke. It is a plain DOM strip
  parented to `<body>` (it must escape the scroller's overflow) placed from the selection's own
  client rect, owned by a `ViewPlugin` so it dies with the editor, and its buttons act on
  **mousedown** — a click would already have destroyed the selection it exists to act on.
- **It centres on the SELECTION'S RECTS, not on two carets.** The union of
  `getSelection().getRangeAt(0).getClientRects()` (falling back to `coordsAtPos` when the DOM
  selection cannot answer). `coordsAtPos(from)`/`coordsAtPos(head)` describe carets: triple-click a
  line and both land at column 0, so their midpoint is the column's LEFT EDGE — measured, a strip
  at x=302.5–494 over a selection spanning 398–948, floating in the prose gutter clear of the text
  it acts on. It is then clamped to the **prose column** first and the window second; clamping to
  the window alone put it at x=4 at 768.
- **It flips when the band above is OCCUPIED, not only when it is off-screen.** `top < 8` was the
  whole test, so double-clicking a word on a paragraph's first line landed the strip on the
  preceding heading's baseline. The band is probed as a nine-point grid of `elementFromPoint`
  (the strip taken out of hit-testing for the duration) and any `.cm-line` other than the
  selection's own means "occupied" → go below, which is the reader's own paragraph and the lesser
  collision. The floor is the SCROLLER's top, not the window's: above it is the tab bar.
- **The highlight glyph is a filled swatch behind the H**, never a rule under it — a 3px gold
  underline sitting one row from a genuine *Underline* command reads as underline. Drawn as a
  `background-image`, because an absolutely positioned `::before` paints ABOVE the button's own
  text node.

## The composer commands (selection menu only — no keystrokes, by decision)

Four verbs behind the right-click menu: extract the selection into a linked
note, insert a footnote, change the selection's case, wrap it in a callout.
None of them claims a key — the selection menu is the door, Obsidian binds
none of them by default either, and the keymap ledger gains four `via` rows
and zero chords. The text arithmetic lives in `client/editor/composeText.ts`,
pure and CodeMirror-free, so `tests/composer.test.ts` drives exactly what the
commands dispatch — the same split `client/keymap.ts` makes for the gate.

- **EXTRACT SELECTION (`client/composerActions.ts`) is the selection-shaped
  sibling of `sectionActions.extractSection` and is built out of its parts** —
  the same dialog (`promptExtractPath`, one naming rule for both, hoisted into
  sectionActions.ts), the same create-the-new-note-FIRST ordering, the same
  undo-toast shape. What differs is argued: the source is rewritten through
  the LIVE VIEW as one transaction (the menu only exists over an open editor,
  and one transaction means Ctrl+Z alone takes the source side back); the stub
  is the bare `[[link]]`, not a heading plus a link, because a selection is
  prose mid-paragraph and owns no outline entry that could vanish; and the
  toast's Undo restores BOTH files — snapshot back into the source first,
  the new note deleted only after that lands — because a cross-file undo that
  restores one side is worse than no undo at all. Before the source is
  rewritten the command re-reads the selection and, if the document moved
  under the dialog (a second pane, a second window), takes the new note back
  and changes nothing: replacing text nobody selected is worse than asking
  again.
- **A FOOTNOTE'S NUMBER IS EARNED, NOT ASSUMED** (`planFootnote`). A command
  that always inserts `[^1]` is actively harmful from the second footnote on.
  n = 1 + the highest numeric id before the caret; numeric footnotes that
  first appear after the caret are renumbered upward — references and their
  definitions in the same plan — only when they must move to make room, never
  "tidied" (a note that jumps 1 → 5 keeps its 5: rewriting it is an edit
  nobody asked for). Word-labelled footnotes (`[^note]`) are prose, not
  arithmetic: never renamed, never counted. `[^…]` inside fenced blocks and
  code spans is code, not a reference. The command REFUSES cleanly — changes
  nothing — when the caret is in code or an id is defined twice (renumbering
  an ambiguous note silently picks a winner, which is corruption wearing a
  feature's name). The caret lands in the definition stub, because the next
  thing the writer types is the footnote. In a `.tex` note the same row
  writes `\footnote{…}` at the caret instead: numbering is the compiler's
  job there, which is the whole reason the macro exists.
- **CASE TRANSFORMS RUN PER RANGE** (`transformSelectionCase`) — the
  `changeByRange` shape the other commands use, so every caret of a
  multi-cursor selection transforms its own range. Wikilink TARGETS are
  case-sensitive addresses on disk (`[[iPhone|the phone]]` uppercased into
  `[[IPHONE|…]]` points at a file that does not exist), so only the alias
  half is prose; a link with no alias is all address and passes through
  whole, as do code spans, backticks included. Title Case is templates.ts's
  rule (first and last words always capitalize, interior small words fall,
  an author's inner capitals — "iOS" — stay), with the word positions
  counted ACROSS skipped spans so "the" straight after a code span is still
  an interior word. The implementation is a copy of templates.ts's private
  `titleCase`, marked for reunification — that file was another engineer's
  this round.
- **A CALLOUT WRAP SURVIVES ITS OWN BLANK LINES** (`calloutWrap`). Every
  selected line gets `> `; a blank line becomes a bare `>` — a genuinely
  blank line ENDS a blockquote, so the naive wrap breaks the callout at the
  first paragraph break and the second paragraph falls out as plain prose.
  The type picker is `calloutDefs.ts`'s `CALLOUT_TYPES`, in the same order
  the `> [!` autocomplete offers, so the two doors can never offer different
  callouts. Markdown only: a callout is Obsidian syntax and a `.tex` note has
  no honest spelling for one — absent, never approximated.
- **`client/noteName.ts` is a module of one function on purpose**:
  sectionActions.ts is first-paint code and composeText.ts is editor-chunk
  code, and importing the shared naming rule from composeText dragged the
  whole composer module into the admin first paint (measured: +3.2 kB in the
  sectionActions chunk) for four lines of regex. The seam sits where the
  chunk boundary is.

Suggested placement: a new section after "Text formatting
(client/editor/commands.ts)".

---

## The editor's prose gutter (why it is on `.cm-scroller`)

`--prose-gutter` is `padding-inline` on **`.cm-scroller`**, and `.cm-content` is `max-width: 648px`
with zero horizontal padding (zen: 672px inside `min(64px, 8%)`). The measure is unchanged — 648px
at every width the column is at its cap, and the percentage resolves against the same box — but the
CONTENT BOX now ends where the text ends, and that is the whole point: CodeMirror's `drawSelection`
computes a multi-line selection's rects as `contentDOM.getBoundingClientRect()` ± the first
`.cm-line`'s own padding, so a padded content box painted every wrapped and continuation row ~56px
into the prose margin — a ragged gold L hanging in the gutter under the most-used gesture in the
editor, overshooting BOTH edges in Arabic. Measured after: content 399.5–1047.5, selection rects
405.5–1045.5. Padding on `.cm-line` would fix the arithmetic too and is refused: callouts and
quotes own that padding to place their own bars.
- **Its switch is a DEVICE preference** (`astrolabe.selToolbar`, default ON), beside `astrolabe.vim` and
  `astrolabe.theme` — it says how THIS person edits, must not travel to a co-author through the
  settings panel, and must not need a server round-trip to answer a selection. The menu's last row
  turns it off; the palette's *Floating formatting toolbar* row turns it back on, so the switch is
  never one-way.

## The writing column (client/editorWidth.ts)

`localStorage["astrolabe.editorWidth"]` measure|wide|full|custom (3.3.2 dropped `wider`; a device that
kept it reads as `custom` at 1200px) → `data-editor-width` on `<html>` at boot
(main.tsx) and on change; app.css reads it into `--editor-measure`, which the editor's
`.cm-content`, the reading view's `.s-reading__content` (3.3.0; it used to keep 760px whatever the
choice), zen's editor and zen's reading column take (648 / 760 / 672 / 800px defaults; wide 960). Full width gives the scroller a gutter instead. **Custom** (3.3.0) stores a CSS length
in `astrolabe.editorWidthCustom` (`normalizeCustomWidth`: 320–2400px or 30–100%) and sets
`--editor-measure` inline on `<html>`, applied on every keystroke of the field. Settings → This
device row.

## Find in the note, replace across the vault

`Ctrl/Cmd+F` opens CodeMirror's search with OUR panel (`client/editor/searchPanel.ts`, wired through
`search({ createPanel, top: true })` in setup.ts): find and replace rows, Aa / .* / ab pills, a live
"3 / 12" count (capped at 999), Enter next, Shift+Enter previous, Enter in the replace field
replaces one and with a modifier replaces all, Escape closes and returns focus. The commands are
@codemirror/search's own; the words are the stock panel's phrases (searchPhrases.ts), spelled
through a `P` table so the i18n gate sees no bare copy in a DOM sink. `Ctrl/Cmd+Shift+F` (App.tsx,
admin, before Escape) dispatches `astrolabe:replace-open`; the sidebar shows itself, opens the vault
Search & replace panel (ReplacePanel.tsx) and focuses its Find field. Both rows are in the ledger.

## Landing on the line

**The wire.** `Backlink` grew `line` (appended, never reordered): 1-based in the note's FULL
source, frontmatter included — the coordinate the editor counts in. The indexer parses `body`
(frontmatter stripped), so every record carries `bodyStartLine` and `fileLine()` is the ONE
place body-relative indexes become file lines; `.tex` bodies are the full file (offset 0).
`SearchMatch` is the same coordinate.

**The machinery (client/landing.ts).** The line-based variant of `pendingHeading`, NOT a second
system: for a surface already on screen it dispatches the existing `astrolabe:goto-heading` event —
the editor's handler has read `detail.line` since the outline panel — and for a cross-note
landing it holds a one-shot pending slot and retries per frame until an editor view for the note
is attached (`bufferOf`, via DYNAMIC import so CodeMirror stays out of first paint;
check-bundle), the reading view consumes the slot (`takePendingLine`) after its own render, the
reader moves on, or ~4s pass. `detail.path` now rides on the event so a handler CAN scope a goto
to its own pane's note; the reading view does, pre-existing handlers ignore it and behave as
before. Every landing marks the landed element with `.s-landed` for 1.5s (`flashElement`) — a
translucent accent wash, no new text/background pair, fade dropped under prefers-reduced-motion.

**Reading-view precision is SECTION-level, and says so.** The reading renderer keeps no
per-block source map, so a line landing resolves to the nearest heading at-or-above the line via
the note's own anchor table (`shared/anchors.ts` — the same table `[[Note#anchor]]` resolves
against, so the two landings cannot disagree about where a section starts), walking backward
past anchors the renderer assigns no element to; with no preceding anchor it falls back to the
note TOP. The flash makes the imprecision legible. The editor lands on the exact line. Honest
fallback beats fake precision; anyone adding a source map to the renderer should delete this
paragraph's fallback, not layer on it.

**Surfaces.** A backlink card is a div now (a button may not contain buttons): the title row
lands on the first mention, each context line on its own mention — mentions are distinct by LINE
(two identical context lines are two places a click can land). A search hit grew a sibling
chevron: expanded, it lists `/api/search/matches` rows (line number + marked line through the
same snippet renderer as the hit itself); empty and failed fetches both render the quiet
"no matches" row because the whole-note click above still works. Expansions and fetched lines
are query-scoped state and a late response for an abandoned query is dropped.

**The public shells show a SPOTLIGHT, the app a leaf.** `installHoverCards` has two
presentations of one card (`presentation: "beside" | "spotlight"`, `client/hovercard.ts`). The
leaf hangs off the link and scrolls, which is right for a working surface. The spotlight, which
both public shells ask for through `usePostPreviews`, stands centred in the window over a dimmed,
blurred veil (`.s-hovercard-veil`, its own element because the card is `overflow: hidden` and a
backdrop filter has to cover the page), wears the post's banner when it has one, and prints the
date, the reading time and up to four tag labels under the title, every one formatted by the same
helpers the list beside it uses (`formatDate`, `countPhrase`, `tagLabel`, `bannerSrc`) and handed
in as strings through `meta()`, so the engine still knows nothing about notes. A spotlight can be
REACHED: the leave grace is 750ms rather than 180 because the pointer travels to the centre of the
window and crosses other links on the way (a crossed link's pending open is cancelled by its own
leave), the card takes the pointer, its body scrolls under the wheel with the scrollbar hidden and
the fade still saying "more", and a click on the card (not a drag that selected its words) opens
the post the link would have. It waits 480ms rather than 350 before opening, because a veil over
the page must not be raised by a pointer crossing a list. The owner's first cut had the card
`pointer-events: none`, which is why "the moment I move to it it disappears". The card carries the shell's
`--dsg-head-font` across so a designed site titles it in its own face. Same LRU, same timers, same
dismissals (leave, scroll, click, Esc, resize), same keyboard route; `check-hovercache` and the
hover assertions in `check-signatures` stand over both.

**Hover previews in the admin app.** `installNotePreviews` (client/landing.ts) is the blog
shell's `installHoverCards` engine — same LRU, same card, check-hovercache still stands over the
bound — with admin wiring: `resolve` reads `data-preview-path` off backlink cards and search hit
rows, `render` is the blog card's excerpt recipe behind dynamic imports (the reading renderer
must not enter the first-paint chunk for a hover). Installed by BacklinksPanel over its panel
body and by the Sidebar over the search results region; re-installed on language change, exactly
as the blog install's contract states. Recent-notes rows: none exist in the sidebar today
(recents live in the CommandPalette, another owner) — nothing was installed there.

**Multi-pane caveat (pre-existing, now load-bearing).** `astrolabe:goto-heading` is a broadcast and
the EDITOR's handler ignores `detail.path`; with two editor panes on different notes a line-goto
scrolls both. The reading view scopes itself; scoping the editor's handler is Editor.tsx-owner
territory and the `path` in the detail is already there waiting for it.

Insert under "Text formatting (client/editor/commands.ts)", after the LaTeX rule.

---

## Block alignment and the picture's tools (shared/blockAlign.ts, widgets.ts imageTools, 3.3.0)

A block says where it sits with a trailing `{.left}` / `{.center}` / `{.right}` / `{.justify}`
(pandoc's attribute braces; `centre`, `centered`, `justified` accepted) on its first or last line.
`parseAlignMarker` / `stripAlignMarker` / `withAlignMarker` / `blockAlignOf` are pure and tested
(`tests/blockAlign.test.ts`). The live preview (syntax-tree pass, `Paragraph` and `ATXHeading*`)
classes every line of the block `cm-s-align-<a>` and hides the marker off the active line; the
reading view classes the `<p>`/`<h*>` `s-rv-align-<a>` and strips it. Both rules outrank the
note-level `[data-note-align]`. `/center`, `/right`, `/left` in the slash menu write the marker
for the caret's line (`alignLine`); the selection menu's Align door (its own flyout, 3.3.3; it was
a group inside Structure and went unfound) carries the five rows
(`alignSelection`: every block the selection touches, marker on the last line, one transaction).
The outline and the `[[Note#Heading]]` completions strip the marker from heading text
(`client/reading/toc.ts`, `client/editor/links.ts`).

**The picture stays while its line is edited.** An image embed on the ACTIVE line used to be
replaced by its source, which shrank the line by the picture's height and jumped the view; now
the picture is an inline widget BEFORE the source (`Decoration.widget`, side −1) and the source
stays editable beside it. **The picture's tools** (`imageTools`): a handle on the trailing corner
drags the width and writes it into the embed's `|N` on release (double-click clears it), three
buttons write the alignment marker at the end of the line. Both find the embed at interaction
time (`embedSpanOf`: `posAtDOM` + the line's `![[…]]` naming this picture), never from stored
positions. `ignoreEvent` yields the tools to the widget and everything else to the editor.

**The properties card on a note with no frontmatter** (`EmptyPropsWidget`, block, side −1 at
0): the head and the add line, "Set banner…" beside it; both write through `POST /api/frontmatter`,
which creates the block. Off by `settings.emptyPropsCard` (default on; `MeData.emptyPropsCard`
travels only as `false`). **The add form lists the keys the app understands** (`KNOWN_KEYS` in
propsEdit.ts, with a hint each): all of them when the name box is empty, filtered as typed, ↑/↓
and Enter; `tags`, `aliases`, `cssclasses` are written as lists (`valueFor`), `publish` and
`numbered` as booleans when the value reads as one. The card's head prints the word alone, no
count.

## The properties card, editable in place (`POST /api/frontmatter`)

Obsidian's all-time #1 request, and the one this release's story is told against: their editor
round-trips YAML through a serializer, so it reformats quote styles, drops comments and reorders
keys nobody touched. Astrolabe's writer is textual. `shared/frontmatterEdit.ts` owns the surgery,
`client/editor/propsEdit.ts` owns the controls, `tests/frontmatter.test.ts` owns the promise.

- **THE CARD IS EDITABLE IN THE EDITOR AND NOWHERE ELSE.** `buildPropsCard()` (noteMeta.ts) takes
  its editing layer as two callbacks — `editRow`, `footer` — and the reading-view renderer passes
  neither. That is not a flag: rollup never reaches `propsEdit.ts` from the reading side, so a blog
  visitor's first paint does not contain an `<input>` element for a note they cannot write to. A
  reviewer confirms it by grepping the built chunks for `cm-s-props__chipx`.
- **EVERY WRITE RIDES THE ROUTE, never the buffer.** A frontmatter edit through the CodeMirror
  document would inherit the autosave debounce, the 409 dance and the undo history (Ctrl Z after
  ticking a checkbox would eat your last paragraph), and it would put a SECOND frontmatter writer
  in the product — which is how the claim above stops being true. The card dispatches
  `astrolabe:property {path, key, value}`; App.tsx re-checks `admin` and calls `setProperty`, which is
  `setBanner`'s choreography to the letter: let a pending autosave land, `markSelfWrite`, POST,
  `bumpReload`. Silent on success (the row IS the feedback), one toast on removal.
- **THE VALUE IS TYPED ON THE WIRE.** `PropertyValue` is `{kind:"text"|"bool"|"date"|"list"}`,
  because a card with a checkbox and a date picker in it cannot say what it means with a string:
  `true` and `"true"` are different YAML, and guessing from the characters is how a note titled
  "no" becomes `title: false`. A bare string is still read as `text` — `banner:` has been written
  that way since v1.2.
- **The key policy is a SHAPE, not a list.** Arbitrary keys are allowed (`\p{L}\p{N}_.-`, ≤64
  chars, single line, no control characters, values ≤500 chars, lists ≤64 items) — the whole point
  is the keys Astrolabe does not know about. Refused: `publish` (its own route broadcasts, re-filters
  the SSE visitor stream and re-counts the site; reaching it here would set the flag and tell
  nobody) and `id`/`uuid`/`guid`/`dg-*` (another tool's primary key). The card renders exactly that
  set faint and control-less via `isMachineKey()`; the route refuses it again, because a rule
  enforced only in the DOM is not a rule. A `.tex` note's keys must additionally be ASCII: its
  fence is recognised by `looksLikeYaml()` (shared/tex.ts) only when every line is an ASCII `key:`
  or `- item`, so an Arabic key in a comment block would make the whole block stop being
  frontmatter — and the first thing lost when frontmatter stops parsing is `publish: true`.
- **The five rails of `setNoteProperty()`**, each with cases in `tests/frontmatter.test.ts`:
  1. only the edited key's lines are rewritten — comments, blank lines, indentation, key order,
     CRLF, unknown keys and malformed YAML three lines down are spliced through untouched;
  2. quote style is preserved (plain stays plain, `'…'` stays `'…'`, `"…"` stays `"…"`), falling
     back to double quotes only when the new text cannot be spelled that way — and falling back
     when a plain spelling would change the YAML TYPE, unless the value it replaces was itself a
     plain literal (`weight: 3` → `weight: 4`, never `weight: "4"`);
  3. a trailing `# comment` on the key line survives the value under it changing, alignment and all;
  4. list items the edit did not touch keep their own bytes — the card sends the whole array and
     the writer DIFFS it, so adding one chip to a five-item block list appends one line. A block
     list stays a block list: collapsing one onto its key line orphans its `- item` lines under a
     key that now holds a value, which is not a note with an odd list but a note whose YAML no
     longer parses;
  5. removing the last property removes the FENCE PAIR, so the note never keeps the `---\n---`
     stub that renders as a divider — unless comments remain in the block, which are the reader's
     own words. An emptied LIST stays a list (`key: []`): removing the key is a different verb, and
     a card whose row vanished with its last chip would leave no way to put one back.
- **A key that already carries a value owns ONE line.** Continuation scanning starts only from an
  empty key line or a block-scalar indicator (`|`, `>`), which is what stops a write to `title`
  from swallowing the comment and the stray indented line beneath it.
- **Controls.** Scalar → a button shaped like the text, click opens an input (blur commits: typed
  text survives the gesture that interrupted it, Esc cancels). `true`/`false` → a real checkbox
  with the FILE's token beside it, untranslated, so the card and `git diff` show the same
  characters. `YYYY-MM-DD` → the platform date picker, written unquoted. Lists (or `tags`,
  `aliases`, `folders`, `cssclasses`, `categories`, `keywords` however they are currently spelled)
  → chips with their own ×, plus a `+`. A `tags` chip is the card's own search pill, WRAPPED not
  rebuilt, so it still searches when clicked. Every control stops its own pointer and key events:
  the card is a widget inside `.cm-content`, and an un-stopped Esc reached the shell and left zen.
- **44px on any coarse pointer**, for the row ×, the chip ×, the `+`, the value button, the add
  form and the checkbox — and the row × drops its hover fade there, because an invisible control on
  a touch device is not a quiet control.

## Coloured text (shared/textColors.ts, client/styles/textcolor.css)

**TWO TIERS, AND THE SECOND ONE EXISTS BECAUSE THE FIRST CANNOT BE A FIXED COLOUR.** A colour a
reader puts inside a note outlives the theme it was chosen under, so it has to survive twenty-one
themes × two grounds. Ask for AA on all of them at once and the answer is provably empty: against
`void`'s `#050508` a colour needs relative luminance ≥ 0.186, against `solar`'s `#ffffff` it needs
≤ 0.183. There is no such colour.

- **Tier 1, the default — SEMANTIC.** The note stores `var(--vc-red)`; `client/styles/textcolor.css`
  resolves it per theme GROUP (`themeGroup()` already partitions them into fourteen dark rooms
  and seven light ones), so "red" is a light coral on a dark ground and a deep brick on a light one.
  Every value clears **4.75:1 against every ground in its group** — the shipped set's worst is
  4.98:1, on palimpsest's ground. The note carries a MEANING, not an ink, so it reads correctly in
  a theme that ships later too.
- **Tier 2 — LITERAL.** Nine hexes, one value for every theme, solved against all of their
  grounds at once and held to **3:1** — WCAG 1.4.11's non-text floor, the most a fixed ink can
  promise given the paragraph above. For when the author means THIS red: a diagram key, a quoted
  brand, a colour being discussed as itself.
- `scripts/check-contrast.mjs` asserts both floors from the same module the client imports, and
  asserts that the stylesheet's `--vc-*` values ARE the module's (they are written twice by
  necessity — CSS cannot import — and a drift would mean the gate measures one palette while the
  product paints another).
- **`textcolor.css` is linked from `client/index.html`, after `themes.css`** — not imported from the
  editor bundle. Coloured text has to resolve in the editor, the reading view AND the blog, and
  only one of those three ever loads CodeMirror.
- **The editor renders a coloured run as a MARK, not a widget** (livePreview.ts): the tags hide off
  the cursor line and the inner text takes a `style` attribute, so the letters stay real text — the
  caret walks them, search finds them, and the pointer mapping has glyphs to land on. Only the TAGS
  are claimed, so `**bold**` inside a coloured run still renders. The value goes through the same
  sanitizer the other two surfaces use; anything it rejects is left as source, which is the honest
  rendering of a declaration that will not survive being read back. Verified: editor and reading
  view paint byte-identical computed colours for the semantic, literal and bold-inside-colour cases.

### The sanitizer's `style` allowance (client/reading/rawHtml.ts)

`style` used to pass through **untouched on every element** — the attribute filter only looked at
`on*`, `srcdoc` and URL attributes. That was a hole with the colour feature and without it:
`background:url(https://…)` in a note is a beacon that fires for every reader and reports their IP
and User-Agent to whoever wrote it, and `position:fixed` over the viewport is a clickjack. Neither
needs script, so the CSP never saw them. Two rules now, because notes are not all ours:

- **On a `<span>` the attribute is REBUILT** and may carry only `color` and `background-color`,
  whose values must be a hex / `rgb()` / `hsl()` literal, a bare colour identifier, or a `var()`
  naming a token in `COLOR_TOKENS` (the eight `--vc-*` plus `--text`, `--text-muted`, `--accent`).
  A `var()` is a read of the page's own cascade, so an unbounded allowlist would let a note paint
  itself in any value the app holds — and, with `background-color` in play, read one out by
  contrast. The bare identifier is a deliberate widening of "hex/rgb/hsl only": `color:red` is what
  a hand-written note actually says (two of them in the 1,388-note fixture), an identifier has no
  grammar for a URL, and an unknown keyword is simply ignored by the browser.
- **On every other element the attribute is FILTERED, not rebuilt.** Real vaults keep layout in
  inline style — measured on the fixture, seventeen notes carry `stroke-width` on Excalidraw SVG
  paths, `width:100%` on a figure, `text-align:center` on a div — and rebuilding those to a colour
  allowlist would silently un-draw the diagrams the raw-HTML feature exists to render. What is
  dropped is what was never legitimate: any value reaching OUT of the document (`url()`,
  `image-set()`, `element()`, `expression()`, backslash escapes, `@import`), any `position` that is
  not `static`/`relative`, any `var()` naming a token outside `COLOR_TOKENS`, `color` /
  `background-color` values that fail the same colour rule the span path applies, and
  custom-property declarations (a value smuggler).
- **`position` IS AN ALLOWLIST, and so is every `var()` read.** The test was `fixed|sticky` — a
  denylist, in which `absolute` was simply not thought of. Verified live against the 1,388-note
  fixture at 1440×900, on BOTH code paths: a published note carrying
  `<div style="position:absolute;top:0;left:0;width:100vw;height:100vh;z-index:99999;…">` rendered
  a 1440×900 box at (293,0) and `document.elementFromPoint(720,450)` answered `DIV#OVERLAY`; the
  inline `<font id=INLINEOVER style="position:absolute;…">` did the same and answered for the page
  centre AND for the status bar at (700,886). It covered the reading column, the outline pane, the
  backlinks pane and the status bar and swallowed every click there for an anonymous visitor. A
  property whose whole job is to take an element out of flow cannot be filtered by listing the ways
  one has gone wrong so far. Re-verified after: computed `position` is `static` for all three
  values, `relative` survives, and `elementFromPoint` over the status bar answers
  `FOOTER.s-statusbar`. The `var()` bound closes the other half of the same hole: `COLOR_TOKENS`
  was stated as the reason a note cannot "paint itself in any value the app holds", and
  `<font style="color:var(--danger)">` sidestepped it entirely by not being a `<span>`.
- Both code paths are covered — the DOM pass (`sanitizeElement`, used by the reading view's block
  HTML and the editor's HTML-block widget) and the regex pass (`sanitizeInlineTag`, used by the
  inline renderer). **No CSP change is involved**: `style-src 'unsafe-inline'` was already required
  by React style props, KaTeX and the generated banner gradients.

## Sectioning — a heading is a handle, not a line

**`client/sections.ts` is the one answer to "what does this heading own".** A markdown heading owns
itself plus everything under it until the next heading at the same or a shallower level, nested
headings included; every affordance below reads or rewrites that one span, so none of them can
disagree about where a section ends. The heading scan is `reading/toc.ts`'s `extractHeadings`,
deliberately and not a second copy of the rule — the outline panel is the surface a reader DRAGS,
so a boundary the outline cannot see would move content nobody selected. Frontmatter and fenced
code are skipped there, once, for both (`### ` inside a ``` block is code, not structure).

- **`scripts/check-sections.mjs` is the gate**, beside the other four in the README. It generates
  thousands of documents out of the shapes that break naive implementations — YAML frontmatter,
  fences whose bodies contain `### ` lines, skipped levels, empty sections, a section at EOF, CRLF,
  no trailing newline — and asserts the reorder is a PERMUTATION: it may change the order of a
  note's lines and the depth of the moved subtree's own headings, and it may add a blank line at a
  seam; it may never lose a line and never duplicate one. It also asserts a section can never be
  dropped inside itself, that a zero-distance move is a no-op, and that extraction's two halves
  cover the original exactly. This is the most destructive thing in the product not called
  "delete": it runs on a keyless gesture, one 4px slip away, while the reader is looking at forty
  outline rows rather than at the 1,200 lines being rearranged.
- **A reorder is one splice of a LINE ARRAY**, and re-levelling rewrites only the `#` prefixes of
  the moved block's own headings, by one shared delta, clamped so the shallowest never rises above
  `#` and the deepest never falls past `######`. Blank lines are only ever ADDED at the seams
  (a heading must not land welded to the paragraph above it); removing one would be an edit nobody
  asked for.

### The two bridges, and why the editor is the source of truth

Autosave is 600ms behind the keyboard and the outline stops recounting while a note is dirty, so
`getNote()` can be a version of the note one paragraph old — extracting a section from THAT
silently reverts whatever was typed in the last half second. `sectionActions.ts` therefore offers
every read and every write to the live editor first, through two synchronous CustomEvents its
extension answers (`astrolabe:section-read` / `astrolabe:section-apply`), and falls through to the API
only when no editor holds the path, which is exactly the reading-view case. **A write through the
editor is ONE transaction over the whole document**, so Ctrl+Z takes a drag back in a single press
and the existing autosave carries it to disk — the outline never writes a file itself. The toast's
Undo is the second door, for the reader whose hand is on the mouse and whose focus is in the panel.

### Section actions (`sectionMenu.ts`, `editor/sectioning.ts`, `reading/headingMenu.ts`)

One menu, three doors: the ⋯ beside a heading's fold chevron, a right-click on any heading line, a
right-click on any outline row. It reuses the tree's `.s-menu` chrome verbatim — two context menus
that look different in one app is a bug — and clamps the same way (opens toward the reading
direction, folds back at the trailing edge, 8px margin), because the pointer is regularly at the
trailing screen edge: the outline pane lives there in English and the notes sidebar in Arabic.

- **Rows a surface cannot perform are ABSENT, not disabled** — the rule the LaTeX formatting menu
  already follows. *Fold all below*, *Select section* and *Focus section* act on a CodeMirror view,
  so an outline right-click asks `openEditorSectionMenu()` first and only falls back to the
  three-row reading menu when no editor is mounted on that path.
- **The reading view's heading menu stands down for a session that cannot write**, which on a
  blog-mode instance is every visitor: `[[Note#Heading]]` is vault syntax meaning nothing outside
  the vault, "extract" is an edit, and taking a reader's own context menu away to offer two
  commands they cannot use would be theft. Same reason it declines when text is selected — copying
  the selection is what a right-click over a selection means, everywhere in this app.
- **EXTRACTION LEAVES THE HEADING BEHIND**, at its own depth, with a `[[link]]` under it. A reader
  scrolling the note has to see that a section used to be here, and the outline has to keep the
  entry: extraction is a reorganization, and one that makes a heading vanish from the table of
  contents reads as data loss. The new note carries the subtree VERBATIM — its root heading keeps
  the `##` it had — because "never rewrite what was not asked for" outranks tidiness. The new file
  is created BEFORE the source is rewritten; the reverse order can leave a note whose section was
  cut and whose replacement was never written.
- **The ⋯ IS a hover affordance, and that does not contradict the fold chevron's rule.** The
  chevron is visible at rest because folding had NO other door and the owner could not find it.
  This menu has four (heading right-click, outline right-click, Shift+F10, and the keystrokes for
  the commands it holds), so a ⋯ printed at full strength on every heading of a forty-heading note
  is noise in the one column the product exists to keep quiet. On a COARSE pointer there is no
  hover, so there it is always on at 30px — the touch shell's own exception.
- **It is absolutely positioned out of a zero-width host.** The fold chevron pulls itself into the
  prose gutter with a negative margin, a trick only ONE element on a line can play: a second one
  shifts the first, and the heading's own text goes with it.

### The outline is a tool (`reading/TocPanel.tsx`)

Dragging a row reorders that whole section inside the note. Four rules hold the gesture honest:
**click still scrolls** (the row is a `<button>` that also carries `draggable`, so HTML5 drag is
the browser's own click/drag disambiguation and nothing here guesses a threshold); **the drop is
shown before it happens, at the DEPTH it will land at** (a gold rule between two rows, indented to
that level — a reorder that also silently re-parents is every outliner's failure mode, and the
indicator is what makes the re-parenting a decision); **drag toward the reading direction to nest
deeper**, measured on the INLINE axis so hand and indent agree in Arabic; and **spring-loaded
nesting** — 600ms of dwell on a row means "into this section", the drag-over-a-folder gesture the
tree already teaches, which is what makes a deep nest reachable without pixel-hunting a 10px
indent step. The drop indicator is `position: absolute` inside the list rather than spliced between
rows: an indicator that takes up space pushes every row below it down by its own height, so the row
the reader is aiming at moves away at the moment they aim.

**A note with no headings keeps its outline section** (v1.8 UX audit, F5): the whole section used
to vanish, so the right panel changed shape from note to note and a reader who had just used the
outline found the panel apparently missing a part of itself. It renders its header and one quiet
`.s-panel-empty` line instead, without the count badge and without the numbering button — a `0`
over an empty list reads as broken, and there is nothing to number. The sentence the LOCAL GRAPH
shows when a note has no links at all was shortened in the same pass (F6): two near-identical
sentences one above the other taught nothing twice, so the instruction ("link to this note with
`[[…]]`") is said once, in the backlinks empty, and the graph's line is only about the picture it
stands in for. Both empties are `--text-muted`: DESIGN.md's rule is that `--text-faint` is a
NON-TEXT token, and a sentence explaining why a section is quiet is exactly what a reader must read.

The panel keeps the FULL section list (furniture headings included, which the rows do not show):
a section the outline hides is still a section the note holds, and a drop point computed from the
visible rows alone would carry someone else's lines. `.tex` notes do not drag — their structure is
`\section{…}` and this model does not describe it. The active-heading highlight is untouched by all
of it.

### Comfort

- **Fold state survives a reload, per note, keyed by heading SLUG.** Line numbers are the one
  property of a fold that a keystroke three paragraphs above it changes, and a fold that silently
  walks to another section on the next reload is worse than no persistence at all. Slugs are the
  reading view's ids, generated by the rule the outline and the anchor table already share.
  `localStorage` under `astrolabe.folds`, LRU-capped at 80 notes, debounced 250ms (one "fold all
  below" is one gesture and a dozen effects).
- **Focus section (`Ctrl/Cmd+Alt+F`) collapses everything but the section at the caret**, ancestors
  and descendants excepted, and Esc restores the fold set EXACTLY as it was — a reader who had
  three sections folded before pressing it must not find them open afterwards. Entering toasts
  "Focused one section — Esc restores", because a mode that removes what is on screen has to say so
  and name the way back in the same breath. **The Esc binding is NOT `Prec.high`**: under vim Esc
  is sacred, so it sits below the vim compartment (Ctrl/Cmd+Alt+F is the way back out there) and
  declines — returns `false` — whenever no section is focused, so nothing else loses the key.
- **Jump to previous / next heading is `Ctrl/Cmd+Alt+↑` / `↓`**, checked against the whole map:
  Ctrl/Cmd+B, +I and +U are formatting's, Ctrl/Cmd+Arrow is move-line, Alt+Arrow is CodeMirror's
  own, Ctrl/Cmd+Shift+[ / ] fold and Ctrl/Cmd+Alt+[ / ] fold all, Ctrl/Cmd+Alt+T is templates.
  The editor answers it from its keymap; in reading mode, where there is no caret, the shell
  answers it as a SCROLL, off the same active-heading signal the outline highlights with — so the
  key, the highlight and the panel always agree about which section the reader is in.
- **Auto-numbered headings are a READING affordance and never touch the source.** Nothing is
  written into the markdown, so a note can be numbered today and plain tomorrow and reach git
  unchanged. Two switches, and the note's own one wins in BOTH directions: a device preference
  (`astrolabe.headingNumbers`, off by default, toggled by the outline header's `1.` — it lives over
  the list it numbers), and frontmatter `numbered: true` / `false`. **The blog reads frontmatter
  ONLY**: a visitor has no preference of ours, so a published post is numbered because its author
  said so in the file, and an admin whose device preference is on must not see a preview no visitor
  will get. Depth is relative to the shallowest heading present, a skipped level advances one
  counter rather than three, and a note whose FIRST heading is its only `#` has that h1 treated as
  the title — numbering it "1." and its real sections "1.1, 1.2" puts the table of contents one
  level deeper than the document it describes. Numerals follow `getNumerals()`, the same system
  every count in the chrome uses: an outline row printing "1.1" in a panel whose tag counts read
  "١١٤" is exactly the mismatch that rule exists to prevent.

### The divider is punctuation, and colour alone was not enough

`.s-rv-hr` was `border-top: 1px solid var(--border)` — byte-identical to the h1 rule and to the
blog byline rule, so one page carried three chrome hairlines and one CONTENT hairline at the same
weight, colour and measure. It is gold now, and **the first pass at that was still not the
distinction it looked like**: measured on iron-gall, 1px of `--accent` at 65% alpha over a
near-black ground is FAINTER than the 1px `--border` hairline 200px above it, so the hierarchy was
not merely undistinguished but inverted. It is **2px, gold at 88%, solid from 15% to 85% of the
measure and fading to nothing at both ends** — against a 1px `--border` chrome rule that is a
difference of weight AND colour AND length, three ways at once. Stated entirely in `--accent`, so
every theme follows its own gold and none needs a rule of its own; the chrome rules are
untouched, because this is about the divider earning a treatment, not about making furniture
quieter. Markdown's three spellings become two things a typesetter has always had to say: `---` /
`___` is the plain rule (a BREATH, not a border — it does not touch the measure's edges), `***`
adds the ✦ the wordmark carries. **All three surfaces draw the same divider**: `.s-rv-hr` in
reading view, `.cm-s-hr-rule` in live preview (`RuleWidget`), and `.s-blog .s-rv-hr` for the
published page — that last one stated in `reading.css` beside the others rather than in `blog.css`,
because the visitor refinements are scoped `.s-app--visitor`, a class the blog shell never sees,
and a fourth copy of these numbers is how the surfaces drifted in the first place.

## The section ⋯ on a coarse pointer (client/styles/preview.css)

The menu behind this button has four doors on a desktop — right-click a heading, right-click an
outline row, `Shift+F10`, and the keystrokes for the commands it holds. On a phone it has ONE, and
that one used to hang off the leading edge of the screen: `inset-inline-start: -52px` on a 30px
button hung off a zero-width host, with nothing clamping it against a `--prose-gutter` of
`min(56px, 7.37%)`. Measured on Chromium at 390: every heading's button at left=-17.3 / right=12.7,
58% off-screen; at 360, left=-19.5 / right=10.5. DESIGN.md: "Never let any panel's content overflow
the viewport horizontally."

- **The gutter cannot hold it at ANY width, so it leaves the gutter.** The fold chevron already
  owns that space (-26px, 18px wide) and the touch shell's rule is a 44px target: 44 + 18 is 62px
  of controls for 56px of gutter even on a tablet, which is why a 30px compromise shipped under a
  comment claiming 44. On a coarse pointer the ⋯ moves to the heading's INLINE END, inside the
  column, and the gutter is left to the chevron alone. Measured after: 317.3–361.3 at 390,
  289.5–333.5 at 360, `scrollWidth` still equal to the viewport, and the menu opens on tap fully
  inside the viewport (101.3–331.8 of 390).
- **The heading LINE is the containing block and reserves the room** (`position: relative` +
  `padding-inline-end: 44px`, scoped by `:has(.cm-s-sectbtn)` so it reaches heading lines only),
  which is what keeps the button off the title's letters. Everything is logical: RTL puts the ⋯
  at 28.7–72.7 and the chevron at 367.3–385.3.
- **A context menu is a touch surface too.** `.s-menu__item` takes a 44px floor on a coarse
  pointer — it is the whole door this affordance opens, and 33.6px rows were the same half-promise
  the button used to make.
- **On a FINE pointer the pair is one cluster, so it lines up.** At `bottom: -0.28em` the ⋯ centre
  sat a measured 2px under the chevron's at every heading level (the widget host does not inherit
  the heading's size, so the offset is a constant); `calc(-0.28em + 2px)` puts the delta at 0.0px
  on every heading level measured (h1, h2, h3).

## Fenced code is a CHARACTER and a LENGTH (shared/fences.ts)

Four separate line-walkers each carried the same four characters of regex and the same wrong
idea: `const FENCE_RE = /^\s*(```|~~~)/` driving `inFence = !inFence`. A toggle is blind to which
marker opened a block and how long its run was. CommonMark closes a fence only on a run of the
SAME character, AT LEAST AS LONG as the opener, with nothing but whitespace after it — so a
```` ```markdown ```` block whose body shows a `~~~` block "closed" on the inner marker and every
line after it was read as document structure.

- **The outline REWRITES THE FILE, which is what made this data loss and not a display bug.**
  `client/reading/toc.ts::extractHeadings` feeds `client/sections.ts`, and therefore
  `sectionsOf()`, `moveSection()`, `extractSection()` and every outline row. A `### ` living
  inside such a fence became a section the document does not have: reproduced end to end, the
  outline showed 3 rows over a 2-heading note and ONE drag of the phantom row swallowed
  `# Next section` and its body INTO the code fence, deleted the note's second section and
  dropped a paragraph out of the document. Extraction was worse — it carried the fence CLOSERS
  out into the new note and left the source with an unbalanced fence.
- **The anchor table had to agree with it.** `shared/anchors.ts` generates the ids
  `[[Note#anchor]]`, transclusion and the hover previews resolve against, and the reading view
  assigns its heading ids from `toc.ts`. Two scanners with two answers is an anchor that silently
  misses, so both now read `shared/fences.ts`. The `[[Note#` completion list (the anchor
  table's ids, `client/editor/autocomplete.ts`) and the editor's heading jump (`findHeadingLine`,
  in `shared/headings.ts` — kept out of `client/editor/links.ts` because that module is in the
  entry chunk) and `server/indexer.ts`'s `FenceSkipper` (excerpts, snippets,
  backlink context) read it too — a note is one document and cannot have two opinions about
  where its code is.
- **And about what a heading is.** `shared/headings.ts` is the one answer: CommonMark's ATX
  heading (up to three spaces, one to six `#`, a space or a tab), nothing inside the frontmatter
  (`FRONTMATTER_RE`) or a fence; its TITLE is its text without the alignment marker, furigana
  readings, inline markdown or closing `#`s, and its ID that title slugged with `-1`, `-2` for
  repeats. The reading view, the outline (`toc.ts` re-exports its `Slugger` and `stripInline`),
  the anchor table, the editor's completion and `findHeadingLine` (which also accepts the id and
  the raw source), folding, sectioning, the card scanner and the prose strip all ask it. Before,
  the reading side took `#` at column 0 only and the editor three spaces of indent, so an indented
  heading was offered as a link that landed nowhere; the completion listed YAML `# comments`; and
  `# Title {.center}` was the anchor "title-center" and the element "title".
  `tests/headings.test.ts` is the contract.
- **A backtick fence's info string may not contain a backtick**, which is what keeps a line of
  inline code from opening a block.
- **A line's carriage return comes off before it is matched.** `md.replace(/\r\n/g,"\n")` was not
  the same thing: a CRLF note whose final newline has been trimmed ends in a DANGLING `\r`, and
  `.` and `$` do not cross one — so that line matched neither the fence regex nor the heading
  regex and the file's last fence never closed. `sourceLines()` is the split every caller uses.
- **THE GATE WAS SOUND, ITS CORPUS WAS ONE SHAPE SHORT.** `scripts/check-sections.mjs` only ever
  emitted fences that open and close with the same marker, so a toggle passed all four thousand
  documents. `makeDoc()` now also emits a ```` ```markdown ```` block holding a `~~~` block and a
  four-backtick block holding a three-backtick one; the UNCHANGED assertions then reported 3,535
  failures out of 4,000 against the old scanner, and 0 against this one.

## Line endings are the note's, not ours (client/sections.ts, client/templates.ts)

Two of the section/template write paths silently rewrote every line ending in a file. No content
was lost either way — but this file's own rule for these writers is that blank lines are only ever
ADDED at the seams, and converting twelve hundred terminators is a far larger edit nobody asked
for. On a `gitSync` instance it lands as the whole file in the next diff.

- **`splitLines()` keeps each line's OWN terminator.** It used to return one `nl` for the whole
  document, chosen as `md.includes("\r\n") ? "\r\n" : "\n"` — which is not "the document's
  flavour", it is "any CRLF anywhere wins": a note with ONE stray CRLF had all six of its endings
  converted by a single outline drag (measured: 1 CRLF in, 6 CRLF out, 0 bare LF left; now 1 in,
  1 out). The majority ending is still computed, and is used for exactly one thing — the blank
  line the reorder may ADD at a seam, which has to end somehow.
- **`sectionOffsets()` was the same root cause with a different symptom.** It accumulated
  character offsets with that single `nl`, so on a mixed-ending note it drifted one byte per LF
  line walked past: the offsets for section B of `# A\nbody a\n\r\n# B\nbody b\n` sliced
  `B\nbody b\n` — one character into the heading. Its only consumer is `selectSection()`, so the
  blast radius was a wrong selection rather than a wrong write. Now it walks the same per-line
  terminators and slices `# B\nbody b\n`.
- **`applyTemplate()` no longer normalizes the TARGET.** It did `splitFrontmatter(targetSrc
  .replace(/\r\n/g,"\n"))` and returned that as `content`, which `templateActions.ts` writes
  straight back — so inserting a template into an ordinary Windows or git-synced note rewrote
  every ending to LF (measured: 7 CRLF in the target, 0 in the merged content; now 9 in, 11 out,
  and the two added are the template's own merged rows). The template's body and the merged
  frontmatter block are re-ended in the TARGET's majority ending on the way in.
- **The gate asserts it.** `makeDoc()` now emits mixed-ending documents (a third of the CRLF
  runs), and a reorder must never DECREASE either ending count — it may only add lines. An
  extraction may not introduce an ending the source document did not have at all.

## Templates (client/templates.ts, client/templateActions.ts)

Obsidian's core Templates plugin, so a vault dragged over works UNMODIFIED: `{{date}}`,
`{{time}}`, `{{title}}`, `{{date:FORMAT}}` / `{{time:FORMAT}}` with moment-style tokens and
`[literal]` escapes. Two additions, both because this product has a calendar setting Obsidian
does not: `{{Title}}` (Title Case) and `{{hdate}}` / `{{date:hijri}}` (Umm al-Qura, through
`shared/dates.ts` — nothing here hand-rolls a lunar calendar or a month name).

**Title Case exempts the FIRST and the LAST word** from the small-word list, which is the rule
every style that has one states (Chicago, AP). Exempting only the first was a bug with teeth: a
note the reader named "From Template A" came back as "From Template a" — the trailing "A" is not
an article there, it is the name of the thing, and `{{Title}}` had quietly downcased a capital the
author typed. Interior small words still fall, which is the whole point of the list ("The Lord Of
The Rings" → "The Lord of the Rings"), and a word carrying an INNER capital is always left alone
("iOS notes" → "iOS Notes", never "Ios Notes").

**An unknown placeholder is left VERBATIM.** `{{cursor}}`, a Templater expression, a stray `{{`:
blanking a token we do not implement destroys text the author typed AND hides the fact that the
template expects something we do not do.

**Where the site's date settings apply, and where they deliberately do not.** A template's date
lands in two kinds of place that want opposite things. The NAMED formats (`{{date:long}}`,
`full`, `medium`, `short`) and `{{hdate}}` are prose: they go through `formatCalendarDate()`, the
same formatter the blog cards use, and follow `settings.dateCalendar` and the numeral policy. The
TOKEN formats stay Gregorian and Western-digit — `{{date}}` is `YYYY-MM-DD` by Obsidian's
definition, it lands in `date:` frontmatter lines and filenames, and `١٤٤٨-٠٢-١٣` there is a date
field nothing can parse and a year off by six centuries. A token format that asks for a month or
weekday NAME is prose by construction, so its digits follow the numeral policy too.

### Frontmatter hygiene — a fix, not a feature

- **Identity keys are MINTED, never copied.** `id`, `uuid`, `guid`, `permalink`, `slug`. The
  owner's own template carries `id: 1733593454224005` and every note ever created from it
  inherited that exact value — a duplicate-key bug that spreads silently and only surfaces when
  something downstream keys on it. The fresh value keeps the SHAPE of the one it replaces: a uuid
  stays a uuid, a 16-digit timestamp stays 16 digits (`mintIdentity`). The key is in the template
  because something parses it; a shape change is the same bug wearing different clothes.
- **Merge, never stack.** Inserting into a note that already has frontmatter folds the template's
  keys into the EXISTING block. A second `---` block halfway down a file is not frontmatter — it
  is a horizontal rule followed by text that looks like YAML.
- **The target wins on a shared key, and no key appears twice.** The note's `publish:`, `date:`,
  `tags:` are facts about that note; the template's are defaults. Entries are kept as RAW LINES
  and never round-tripped through a YAML serializer, so lists, nested maps, quoted strings with
  colons and block scalars all survive byte for byte.

### The folder, and what it means for the blog

`settings.templatesFolder`, vault-relative. Unset, the server auto-detects — `Templates`,
`_templates`, `قوالب`, with a leading ordering prefix stripped (`4 - Templates`, `04. Templates`;
real vaults number their top level) — and matches WHOLE, so "Templates for clients" is a folder of
notes, not of templates. Ambiguity means **null**, never a guess: a wrong guess hides real posts
from the blog and offers the wrong list of templates, which is strictly worse than asking. The
merge rule lives in `server/settings.ts templatesFolder()` and the indexer calls it lazily —
the two modules are a cycle (settings → site → indexer), so only a runtime call is safe either way.

`posts()` skips notes under it, in the ADMIN list as well as the visitor one: a template carrying
the `publish: true` it exists to hand DOWN would otherwise appear on the site as an article of
literal `{{date}}` placeholders, and the admin's post list is the one that answers "what is on my
blog". `settings.defaultTemplate` applies one template to every note created from inside Astrolabe;
off by default, because a product that silently writes into every new note is a product that has
to be fought. A failure there is logged and toasted and the note stays empty — creation never
depends on it.

### Keys and surfaces

`Ctrl/Cmd Alt T` inserts, `Ctrl/Cmd Alt Shift T` creates — one key, `Shift` picks the second
command, exactly the shape the pane toggles kept. **Alt is not decoration**: `Ctrl/Cmd T` is the
browser's new tab and `Ctrl/Cmd Shift T` reopens a closed one, neither is takeable, and a
keystroke that fights the browser is a keystroke that loses. Resolved through `shortcutKey(e)`
like every other binding, which is what makes it work when Alt rewrites `key` on macOS (Option+T
is "†") AND when the layout does (Arabic's T key types "ف") — and which excludes `AltGraph`
without this binding spelling the guard itself. Both commands are in the palette; "New note from template…" is
also in the tree's folder menu, where it carries a DESTINATION the other two doors do not.

The picker previews the template's body with placeholders ALREADY FILLED — what is about to land,
not what the file says: a template's name says almost nothing about what it will put in the note,
and the difference between two of them is often three lines of frontmatter. "New note from
template…" asks for the NAME first, so `{{title}}` in that preview is the real one.

## The template picker previews BOTH halves (client/components/TemplatePicker.tsx)

The module's own header says the preview exists because "the difference between two of them is
often three lines of frontmatter" — and it previewed `splitFrontmatter(note.content).body`. Two
templates whose bodies are both `# {{title}}` and whose blocks are `publish: true / tags:
[essay, longform] / banner: …` and `publish: false / tags: [private] / dir: rtl` previewed
IDENTICALLY, as the single line `# On the Ruled Page`. Picking the wrong row silently set
`publish: true` on a note bound for a public website, and the panel had shown nothing that could
warn anyone.

- **Rows, never the raw `---` block.** `templateProperties()` (client/templates.ts) reads the
  frontmatter into key/value pairs with the values in plain reading form: an inline list loses its
  brackets, a block list reads "a, b", a quoted scalar loses its quotes. The picker is outside the
  editor, where DESIGN.md forbids showing markup to a reader.
- **`publish: true` is marked, and named.** The row takes the accent and the panel carries one
  sentence — "Publishes the note to the public site" — because that is the only property in the
  set whose consequence is a stranger reading the note. The accent, not `--danger`: publishing is
  a thing the reader may well want, it just may not be a thing they meant to pick blind.
- **The body preview resolves ONE direction for the whole block.** `dir="auto"` on a `<pre>`
  resolves per bidi PARAGRAPH, and every newline in a `pre` ends one — so an Arabic template's
  Latin line flew to the opposite edge of the mono box while its neighbours stayed put. It is
  resolved once, over the whole body (`autoDir`).
- **The selected row carries the command palette's gold bar.** DESIGN.md specifies
  `--accent-soft` PLUS a 2px accent bar on the leading edge; this list shipped the ground without
  the bar, which is two answers to "which row am I on" in one product.

## Tables (client/editor/tables.ts, tableModel.ts; reading renderer's table branch)

One renderer, four surfaces. The reading view, the blog article, the editor's
transclusion widget and the editor's table widget all draw a table through
`client/reading/render.ts` (`.s-rv-tablewrap` scrolls; the wrap and the
`.s-rv-table` carry the direction RESOLVED from the header's first strong
character — `firstStrongDirection`, the callout box's rule — so column order
follows the table's own text, and a table with no strong character inherits
the note's; it was `dir="auto"`, which skips the `dir="auto"` cells and so
resolved from the chrome, leaving an Arabic table in an English shell flush
left with its first column leftmost; a list box takes its first item's
direction the same way; alignment colons map to `.s-rv-al-c` / `.s-rv-al-r`;
`\|` escapes survive; colors are tokens check-contrast already holds). The
editor never grows a second table renderer, **and its widget wraps the
reading view's way**: `.cm-s-table` (client/styles/tables.css) resets the
three properties `.cm-lineWrapping` sets (`white-space`, `word-break`,
`overflow-wrap`) to the reading column's values, or a squeezed column breaks
"Count" into "Coun/t" in one surface and not the other. `npm run
check-fidelity` (scripts/check-fidelity.mjs) holds the two surfaces to the
same computed styles on a rich note — tables, callouts, code, math, embeds,
footnotes, ruby, images with widths — in both chrome languages.

**A HEADING IS `--heading`, IN BOTH SURFACES.** `.cm-s-h1` (client/editor/theme.ts)
carried a colour of its own — `color-mix(in srgb, var(--accent) 15%, var(--text))`,
a near-miss of the token — so the same `# Title` was #d1e2f5 in the editor and
#e6edf3 in the reading view, and `check-fidelity` failed on `en: h1` and `ar: h1`
from the theme-token restore until 3.18. The h1–h6 rule above it already says
`var(--heading)`, which is what `.s-rv-h1` says; the size, the padding and the
hairline under it were the reading view's numbers all along. No heading level in
either surface names a colour the other does not.

**Live preview follows the reveal-on-caret rule.** Caret outside a top-level
`Table` node → the block is one `Decoration.replace` block widget
(`.cm-s-table`, a StateField — block decorations cannot come from a
ViewPlugin). Caret inside → the pipe source, its lines marked
`.cm-s-table-srcline` and set in `--font-mono`, because the padded pipes
format-on-exit writes only align in a monospace face. Tables nested in
blockquotes/callouts or lists stay source in the editor (they still render in
the reading view and blog): replacing a range that includes `> ` markers
would fight the callout field for the same lines.

### THE WIDGET IS EDITABLE, AND THE CARET NEVER ENTERS THE BLOCK (3.18)

Until this round a click on a rendered cell dropped the whole block back to
pipes. That is fine for a 3×3 table and impossible for a 60×12 one: the grid
the reader was reading disappears on the gesture that asked to change it, and
what replaces it is a wall of padded punctuation where the column they wanted
is 400 characters along a wrapped line. The owner: *"it's nice to be able to
insert tables in md format but we should be able to edit them with the nice
table UI."*

- **A click opens a native text box INSIDE that cell**, and the table stays
  drawn. A native box rather than a contenteditable cell for the reason
  propsEdit.ts reached the same conclusion: the caret, the selection and the
  IME behaviour of a native text box are the platform's, which is what an
  Arabic keyboard and a Japanese IME both need, and a contenteditable cell
  nested in `.cm-content` is a second editable region for CodeMirror's own
  selection reader to walk into. The cell pins its measured width
  (`min-inline-size`, `box-sizing: border-box`) for the moment the box stands
  in for its content, or the column collapses under the reader's pointer.
- **THE BOX IS THE CELL, NOT A CONTROL OVER IT (3.19.1).** The first cut was
  a single-line `<input>` wearing a 2px accent ring; a three-line cell was
  squeezed onto one scrolling line inside a lit rectangle, and the owner
  read it as editing something placed over the table ("it squishes it in
  some rectangle"). It is a `<textarea>` now with nothing of its own —
  `pre-wrap` so it breaks where the rendered text broke, `field-sizing:
  content` plus a measured `blockSize` for engines without it so it grows
  with the text, the cell's font, colour, alignment and line height, no
  ring — and the one sign that a cell is open is a 2px hairline under its
  text (`box-shadow`, the focus-ring replacement scripts/check-a11y.mjs
  requires in the same rule). Enter still moves a row and Shift+Enter still
  writes `<br>`: a row is a line, so the textarea never holds a newline.
- **THE CM SELECTION STAYS OUTSIDE THE BLOCK.** The widget's `mousedown`
  calls `preventDefault()` and dispatches NOTHING; only DOM focus moves. A
  caret placed in the block would trip the reveal rule and take the widget
  away on the click that asked to edit it — so the box, not the selection, is
  where the reader is. Positions are asked of the view when they are needed
  (`posAtDOM(wrap)` → `tableNodeAt`), never cached on the widget: a table that
  merely slid down a line is `eq` to itself, its DOM is reused with no update
  call, and anything stored on it is a release behind.
- **Nothing is written per keystroke.** A cell commits on blur, on Tab, on
  Enter and before any command: ONE dispatch, `isolateHistory.of("full")`,
  over that cell's raw segment alone (`cellEdit` in tableModel.ts returns the
  minimal range). Every other cell comes out byte for byte. A dispatch per
  character would put a doc change, a decoration rebuild and a widget diff
  between the key and the glyph.
- **`updateDOM` redraws the CELL, not the table.** Same note, same shape,
  same alignment row, only cell text differing → the changed `<td>`s get
  `renderTableCell()` (render.ts, the second door into the table branch, the
  twin of `renderTrackerFence`) and the DOM node survives. Anything else
  falls back to a full draw INTO THE SAME NODE, so the walk, the menu and the
  touch affordance can all hold a reference to the wrap. Measured on a
  200-row table: 603 cell nodes, 603 kept, 27 ms for the whole commit.
- **Keys inside the box stay inside it** (propsEdit.ts's rule, for its
  reasons): without `stopPropagation` Tab indents the table's line, Enter
  splits it and Escape reaches the shell and leaves zen mode. Tab/Shift+Tab,
  Enter and the arrows mean in the box exactly what the scoped keymap's rows
  say they mean in the source — one set of table keys, not two. `Shift+Enter`
  writes `<br>`, the only break a GFM cell holds. Escape CANCELS the cell and
  returns the caret to the note after the block. Arrows at the box's edge are
  VISUAL and take the TABLE's direction (`wrapRtl`), never the cell's: every
  cell carries `dir="auto"`, so one Arabic cell in an English table would
  otherwise reverse the walk for that cell alone.
- **Format on exit has a second half.** The caret never enters the block, so
  the ViewPlugin that watches the caret never fires for a table edited in
  place. `leaveTable` calls `scheduleFormat` explicitly — not through the
  wrap's `focusout`, because the box was REMOVED while it held focus and a
  removed element's focusout is the engine's business — and the click-away
  path goes through `focusout`, where the blur is a real one. Both are no-ops
  when the other has run.
- **A menu command is ONE Ctrl+Z, prettified in the same transaction.**
  `applyBlock` writes `formatTable(src)`. A command that left the block ragged
  would be followed by a format transaction the moment the reader clicked
  away, and their first undo would spend itself on the padding instead of the
  row. The keyboard's own cell commit is deliberately NOT formatted: it is one
  range by design, and squaring the block off around it would turn the
  smallest edit in the feature into the largest.

### The menu on a cell (ContextMenu.tsx, through `components/menuPortal.tsx`)

Right-click, `Shift+F10`/`ContextMenu`, or — on a coarse pointer only — a
44px `⋯` under the table. Eighteen rows in four groups: insert row/column,
delete/duplicate/clear, move row/column, align (three `checked` rows, which is
what makes the whole menu reserve the tick column, and the point: the column
a reader right-clicked says how it is aligned before they choose anything;
choosing the alignment a column already has takes it off), sort (A→Z, Z→A,
smallest number first — the header never moves, blanks sort last, `١٢` is
twelve), then **Edit as Markdown** (the caret into that cell's source, which
reveals the block; the way back is the way it always was) and **Copy table as
Markdown**. Left/right on a column move are VISUAL, like Alt+arrow; before/
after on a column insert are logical.

`menuPortal.tsx` is a DOOR, not a second menu: one throwaway React root on
`<body>` around the real `ContextMenu`, so placement, the Escape capture, the
focus restore, the dismissal rules and `{label:null}` separators stay the
component's. It exists because the widget's DOM is built imperatively inside
CodeMirror and outlives any render — the third surface to want the box, after
the tree and the tab bar, and the one that could not simply render it.

### The palette carries five rows, and the widget carries the rest

`client/tableActions.ts` is ~40 lines whose whole job is to carry a command id
from the palette to whichever editor holds the caret (`handled` comes back, so
a row with no table under the caret toasts instead of doing nothing visible).
It exists so CommandPalette.tsx does not `import` editor/tables.ts and pull
CodeMirror into the admin's first paint — the shape "Find in note" and "Insert
template…" already take. The rows: **Insert table…**, **Table: insert row
above / below**, **Table: insert column before / after**, **Table: edit as
Markdown**. Everything else is on the widget's menu, where "this row" and
"this column" are the ones under the finger and need no second way to be
named. `lastTouched` (module-level, cleared when the wrap leaves the DOM) is
why a palette row still finds the table a reader was editing in place, where
the caret is deliberately elsewhere; it is attention, not state.

**Insert table… asks.** `components/TablePicker.tsx` is a lazy chunk with a
10×10 grid, 3×3 by default, ROWS INCLUDING THE HEADER because the reader
counts the squares they swept. Pointer sweeps, arrows walk (mirrored by the
reading direction), Enter takes, Escape leaves with nothing inserted. The
grid is ONE control with one tab stop — a roving tabindex over a hundred
squares would be a hundred tab stops between this sheet's two real ones. The
slash menu's `/table` keeps its 2×2 skeleton: it is a key pressed
mid-sentence, and the cost of a wrong guess there is one Tab.

**Big tables (styles/tables.css, `.cm-s-table` only).** The wrap takes
`max-block-size: 70vh` and the `thead th` goes `position: sticky` — a table
taller than the window puts its column names off screen, and the cell you are
typing into then belongs to a column you can no longer name. The reading view
is untouched: a reader scrolls the page, not the table. NOT VIRTUALISED, and
measured rather than assumed: a 200-row table is 603 cells, renders once, and
opens a box on row 190 in 21 ms; typing in a 60×12 table is p95 17.6 ms
(one frame), and a commit 27 ms. Virtualising inside a replaced block widget
would also put a second table renderer in the product, which is the one thing
this feature may not do.

**The table keymap is scoped, never global.** A `Prec.high` keymap whose
every command resolves the syntax tree first and returns false unless the
caret is a single selection inside a top-level table — outside a table Tab
still indents, Enter still breaks the line, Alt+arrows still move lines, and
an open autocomplete tooltip keeps Tab/Enter (completionStatus is checked
before the table answers). Inside one:

- **Tab / Shift+Tab** walk cells, selecting the cell's trimmed content;
  Tab in the last cell appends an empty row. **Enter** moves down a row,
  same column, caret at the content's end (walking must not arm an
  overwrite); from the last row it leaves the table downward instead of
  splitting a row.
- **Alt+↑/↓** swap body rows. The header and delimiter never move — at them
  the keystroke is consumed as a no-op, because falling through to
  moveLineUp/Down would drag the header line out of the block.
- **Alt+←/→** move a column: header, delimiter and every body row in the
  same transaction — a column move that skips the delimiter walks each
  column's alignment into its neighbour's. Arrows are VISUAL: in an RTL
  table the header's own direction flips them, same as the rendered
  `dir="auto"` does. Edges consume the key; nothing wraps, nothing shears.
- **Format on exit.** When the caret leaves a table block (and only then —
  not on undo/redo, not while any selection range still touches the block),
  the block is prettified off the update cycle: every cell padded to its
  column's display width (grapheme-clustered via Intl.Segmenter; CJK and
  emoji count two columns, Arabic one), the delimiter stretched with its
  colons kept where the author put them, leading/trailing pipes normalized,
  short rows squared off. Cell CONTENT is copied verbatim — splitting on
  unescaped pipes (`\|` holds, `\\|` splits: parity, not presence) is the
  only operation that ever looks inside a cell, which is what keeps escapes
  and code-span pipes uncorrupted. A block that stopped parsing as a table
  mid-edit round-trips untouched.

**The model is pure and tested.** All string/offset logic lives in
`tableModel.ts` with zero imports — split from tables.ts for the reason
calloutDefs.ts is split from callouts.ts: tables.ts's import chain carries
.css and CodeMirror, and `node --test` (tests/tables.test.ts) must load the
logic without them.

**Creation.** The slash menu's Table entry inserts a 2×2 skeleton with
exactly one snippet field selecting the first header cell; from there every
Tab is the table's (three fields would feed Tab to the snippet walker
instead of the cell walker). The palette's "Insert table…" asks first — see
the picker above.

**The model carries every command, and the tests are the contract.** Insert /
delete / duplicate / move row and column, align, sort, `cellEdit`,
`escapeCellText` and `tableSkeleton` all live in tableModel.ts beside the
older four, in NAVIGABLE row space (0 is the header, 1 the first body row) —
`moveTableRow`'s body space is the one exception, because the header is not a
destination for a move, and `rowLine()` is the single place the two meet. Two
invariants run through tests/tables.test.ts: the alignment row travels with
its column on every column command, and bytes nobody touched do not move. One
bug the tests found and the round fixed: a RAGGED table (an unescaped pipe
inside a code span widens a row past the alignment row, which GFM allows)
padded its delimiter with `" "`, writing `| |` into it — not a delimiter
cell, so the block stopped parsing as a table and the next command refused on
a table the reader could plainly see. `rawSegments` takes a `fill` now and
the delimiter's is `" --- "`.

## Drawings (`shared/drawing.ts`, `client/drawing/`, `PUT /api/drawing-svg`)

A drawing is a NOTE (`.excalidraw` is a note extension in `shared/noteFormat.ts`, after `.md`,
`.tex` and `.latex` so it never wins a `[[name]]` tie) whose one surface is the canvas:
`surfaceOf()` answers `"drawing"` for `isDrawingPath()` tabs before the reading/edit decision,
`mirrorOf()` keeps it out of `openPath` like a book, and the editor never opens one.

- **Two spellings, one scene, nothing invented.** `parseDrawing()` reads Excalidraw's own JSON
  (`.excalidraw`) and the Obsidian plugin's markdown (`.excalidraw.md`: frontmatter, a ```` ```json ````
  or ```` ```compressed-json ```` fence, LZ-base64 for the latter). `serializeDrawing()` writes the
  file's OWN spelling back: a plugin file keeps its frontmatter verbatim, keeps compression if it
  had it, and lists the live text elements under `## Text Elements` with `^id` marks, so
  Obsidian's search and links keep working on what Astrolabe saved. A scene that cannot be read is
  `null` and the surface says so rather than saving an empty canvas over it.
- **A drawing is indexed by its words.** The indexer replaces a drawing's content with
  `drawingIndexText()` — the frontmatter (plugin files) plus every live text element and every
  `[[link]]` set on a shape, one per line — before `markdownParts()`, so search files the words on
  the canvas, `record.links` carries the wikilinks typed into it, and the JSON never enters the
  index. `noteTitleOf("Sketch.excalidraw.md")` is `Sketch`: both suffixes come off together.
- **Saving is a note save.** The surface autosaves ~900 ms after the last change through
  `PUT /api/note` with `baseMtimeMs`; a `409 stale` becomes the conflict strip (Keep mine / Use the
  disk version) and the pending scene is never dropped; `pagehide` and unmount flush through the
  beacon with the precondition. `markSelfWrite()` precedes every write. The scene written is
  Excalidraw's own `serializeAsJSON(…, "local")` output, so the session state (selection,
  collaborators, the open menu) never reaches disk.
- **The picture beside the file.** Every successful save exports the scene with `exportToSvg`
  (light, fonts inlined) and `PUT /api/drawing-svg?path=<drawing>` writes `<drawing>.svg`
  (`drawingSvgPath`: `a.excalidraw` and `a.excalidraw.md` both → `a.excalidraw.svg`, the plugin's
  auto-export name). Admin only; the client names the drawing, the server names the file; the body
  must be an `<svg` document under `UPLOAD_MAX_BYTES`; the svg is registered as an attachment and
  emits `created`/`changed`.
- **The embed is the picture.** `parseEmbed()` classifies `![[x.excalidraw]]` /
  `![[x.excalidraw.md]]` as `kind: "drawing"` BEFORE the image test; the live preview and the
  reading view render `drawingSvgName(target)` as an image (width honoured like an image). The
  reading view's owner-only fallback (`attachDrawingSrc` → `import("../drawing/renderEmbed.ts")`)
  draws the scene when no svg exists; a visitor gets the ordinary placeholder.
- **The publish door.** A published note's `![[drawing]]` puts `drawingSvgPath(resolved)` into
  `allowedAttachments()` — the svg walks through the note's door exactly like a banner or an
  embedded image — and nothing else about the drawing reaches a visitor: the drawing is a note and
  an unpublished note is a 404.
- **Chunks.** `@excalidraw/excalidraw`, `DrawingSurface.tsx` and `renderEmbed.ts` are FORBIDDEN
  from every first paint and `DrawingSurface.tsx` MUST_SPLIT (`scripts/check-bundle.mjs`);
  `shared/drawing.ts` (the plugin's compressor) is reached from the entry only through `import()`
  in `promptNewDrawing`. Fonts are copied to `dist/excalidraw/fonts` by `vite.config.ts` and named
  by `window.EXCALIDRAW_ASSET_PATH`, set from the ENTRY (`client/drawing/assetPath.ts`, imported by
  `main.tsx`) because rollup hoists a chunk's vendor imports above its body; the same module shims
  `FontFace` to drop the package's CDN fallback sources, which the CSP (`font-src 'self' data:`)
  refuses anyway and Chromium would otherwise log a violation per face. The package's font
  subsetter tries a `blob:` worker once per session and the `worker-src 'self'` wall refuses it;
  the export still inlines the used font unsubsetted. That one refusal is the only console noise
  the feature makes, and it is the package's.
- **New drawing.** `promptNewDrawing(dir)` (tree menu, palette): `Drawing.excalidraw.md` when
  `/api/me.obsidianVault` (the vault has `.obsidian/`), else `Drawing.excalidraw`; a typed
  extension in either spelling is kept. `tests/drawing.test.ts` holds the format contract.

## LaTeX notes — `.tex` and `.latex`

**A note is no longer necessarily markdown.** `shared/noteFormat.ts` is the single answer to both
"is this a note" (`isNotePath`) and "which language is it written in" (`noteFormat`, `isTexPath`),
and it replaces the `.endsWith(".md")` that was spelled out about forty times across the server
and the client. `NOTE_EXTENSIONS` is ordered `[".md", ".tex", ".latex"]` and **the order is
load-bearing**: `[[Fourier]]` with both `Fourier.md` and `Fourier.tex` in the vault resolves to the
markdown one, because that is what every vault written before this feature meant by the name.
`noteCandidates()` is the shared resolution order — server (`indexer.resolveLink`), client
(`editor/links.resolveLink`), the router and `blog.matchPublished` all walk it, so no two of them
can disagree about which note a link means.

### The reader: `shared/tex.ts`

Source text → a small document model. Node-free and DOM-free, because the indexer, the reading
renderer and the editor all import it. Three properties the rest of the feature leans on:

- **It never executes anything.** `\newcommand` is expanded by substitution under a hard depth
  (8) and count (4,000) budget; there is no other macro programming. Maths is never expanded here
  at all — the collected definitions are handed to KaTeX as its `macros` option, where its own
  sandboxed expander runs them.
- **It never reaches outside the vault.** `\input` and `\includegraphics` yield NAMES; resolving
  them is the caller's job, through the same resolver wikilinks use. `server/texNote.ts` folds a
  relative name against the note's own directory and **drops** anything that climbs out (it does
  not clamp), exactly as `parseAssets()` does for a markdown image destination.
- **EVERY `\includegraphics` yields its name, not only the one inside a `figure`.** The command
  sat in `SWALLOWED_COMMANDS`, so anything outside `parseFigure` — a bare `\includegraphics{…}` in
  a paragraph, or one inside `center` / `minipage` / `wrapfigure` / a table cell — was consumed
  with its argument: it rendered as NOTHING and never reached `doc.graphics`, which is what
  `allowedAttachments()` builds the publish allowlist from. Measured on the fixture with three
  identical PNGs in one published `.tex` note: `figure` → anon `GET /api/file` 200, `center` →
  404, bare → 404, while a byte-identical markdown `![p](Fig/plot.png)` allowlisted 200. The author
  saw a paper (admin gets 200); every reader saw blank space and three 404s. It is now an inline
  `{ t: "graphic", name, width }` node — the same `<img>` the float draws, with no caption and no
  number — and the name is pushed to `doc.graphics` at the point it is read. Re-verified: all three
  forms 200 for an anonymous visitor, `parseTex(...).graphics` = all three names.
- **It never produces HTML.** Every string in the model is plain text and both renderers build DOM
  with `createElement`/`textContent`, so there is no injection path through TeX. `\href` and `\url`
  reach an `href` only when the value is `http(s)`; a `javascript:` target renders as its own text.

Unparseable input is never an error: a malformed document yields whatever was readable, and every
unimplemented control sequence becomes a quiet inline marker — never raw source, never a crash.

### Numbering belongs to Astrolabe, not to KaTeX

KaTeX restarts its equation counter on every `renderToString` call, so a paper with four numbered
equations rendered block-by-block would print "(1)" four times and every `\eqref` would point at
the wrong one. So the counters live in `shared/tex.ts`, and the number is handed to KaTeX as an
explicit `\tag{n}`, which it places where amsmath does — per row inside `align*`/`gather*`
included. Unstarred `align`/`gather` therefore render through their **starred** form with one
injected tag per row: same layout, our numbers, and no doubled "(1) (1)". Numbering is
article-style whatever the document class; this is stated in the README rather than left to be
discovered.

### One anchor space (`shared/anchors.ts`)

A markdown heading and a LaTeX `\label` are **the same kind of thing** — a named place inside a
note — so `[[Note#anchor]]` and `\ref{Note#anchor}` are one lookup, and neither the backlinks
panel, the graph, the hover preview, the outline nor the transclusion code has to know which
format it is pointing at. `noteAnchors(path, content)` dispatches on format; `findAnchor()` matches
an id first (a `\label` value, a heading slug) and then an anchor's human TITLE, which is what
makes `\note{Notes on Diffusion\#Derivation}` and `[[Paper#eq:fourier]]` the same operation from
opposite sides. Markdown slugs are generated by the same rule `client/reading/toc.ts` uses, because
an anchor whose id disagrees with the element id the reading view assigns is an anchor that
silently misses.

Transclusion falls out of it: `![[Paper#eq:fourier]]` resolves the note, then the anchor, then
renders only the blocks that anchor OWNS (one equation/figure/table, or a section down to the next
heading at the same or a shallower level). A miss transcludes the whole note, which is what
`![[Note#missing]]` did before anchors existed.

**`renderNoteSlice()` in `client/reading/renderNote.ts` is the ONE place that decides this**, beside
`renderNoteContent()` and for the same reason. The first version of the anchor rule lived inside
the reading view's own `transclusion()` and the EDITOR's transclusion widget never learned it: the
same `![[Note#Section]]`, twelve pixels apart, pulled in one section in the reading pane and the
entire note in the live-preview card — which also dropped the anchor from the card's title, so
nothing on screen said which of the two you were looking at. Both surfaces now call
`renderNoteSlice`, the reading view's `anchorSlice` delegates to it, and both card headers print
the same `note › anchor` trail (`.s-rv-transclude__anchor` / `.cm-s-transclude__anchor`). **The
anchor is part of the editor widget's identity** (`TransclusionWidget.eq`): two embeds of one note
at different anchors are different widgets, and leaving it out lets CodeMirror reuse one for the
other.

### Local-first, everywhere, without exception

A `\ref` whose label is defined in the SAME document never looks at the vault (`server/texNote.ts`
drops it before it ever becomes an xref; `client/reading/texRender.ts` checks the local anchor
table first). `\input` resolves against the note's own folder before the vault-wide basename
fallback. This is the rule that makes dropping an existing LaTeX project into a vault safe:
importing it can only ADD edges the compiler would have followed anyway, never change what its own
cross-references mean. For the same reason, **renaming a note rewrites `\note{…}` and
`%% [[…]] %%` — Astrolabe's own syntax — and leaves `\input`, `\cite` and `\ref` alone**: those belong
to the document's own semantics, and silently editing them could change what `pdflatex` produces.

### What the indexer stores

`NoteRecord` gains four fields, and the branch that fills them is the ONE place in the indexer
where a note's text is interpreted; every field below it is format-blind again.

- `prose` — the reader's prose, control sequences, math markup, labels and citation keys already
  gone. NULL for markdown (which derives the same thing lazily from `body`). This one field is what
  makes a `.tex` note searchable by its WORDS instead of by `\textbf`, and it is also what the
  language detector reads — without it a LaTeX file of Arabic prose scores as English, because
  `\begin{document}` is Latin letters.
- `anchors` — the format-agnostic table above.
- `xrefs` — LaTeX's own linking vocabulary (`\cite`, and the `\ref` that found no local label),
  kept apart from `links` because it resolves against different tables (`byCitekey` / `byLabel`).
  Putting a bibliography key through basename resolution would draw a broken edge for every
  reference in a paper. Both become graph edges and backlinks when they resolve, which is what
  "an existing project lights up unmodified" MEANS.
- `excerptSource` — the abstract, or the first real paragraph, found by walking the document TREE
  (a LaTeX file has no markdown paragraph structure to scan).

`body` stays the RAW source, because backlink context and the editor both count in source LINES and
a prose string has none.

### Frontmatter

`%---` … `%---%` — **both fences are LaTeX comments**, so the block is invisible to `pdflatex`,
which is the same bargain `%% [[Note]] %%` strikes for links. Inner lines may or may not carry
their own leading `%`. `\astrolabe{key=value, …}` is the macro spelling and loses to the block on any
shared key. `findTexFrontmatter()` refuses a block whose lines do not look like YAML, so a
decorative `%------` rule is not mistaken for a fence (which would blank the top of the document).
`server/noteFrontmatter.ts` dispatches every publish toggle and `banner:` write, with the same
surgical single-line contract `server/publish.ts` states for markdown.

### Routes

- `GET /api/anchors?path=` → `AnchorsResponse`. Visitor-scoped exactly like `/api/note`: a
  published note's anchors are readable, nothing else is.
- `GET /api/xref?label=` | `?cite=` → `XrefResponse`. The vault-wide half of a cross-reference,
  asked only after the document's own definitions have been checked. A miss is `200` with nulls,
  like `/api/resolve` — unresolved keys are the normal state of a bibliography, not an error.
  Visitor-scoped, because an anonymous caller must not learn that a private note defines
  `sec:acquisition`.
- `GET /api/astrolabe.sty` → the macro package, `text/x-tex`. A constant; it carries nothing about the
  vault, and a reader who cannot download it cannot compile the paper they were just shown.

### Editor

One branch in `buildEditorState()`'s extension list. Everything around it is format-blind — the
theme, vim, the save keymap, caret handling, uploads, hover previews. **The formatting layer is the
exception, and it is not a second branch here**: the extension is the same in both notes and only
its VOCABULARY changes, one layer down, on `notePathFacet` — see "A FOURTH RULE" under *Text
formatting*. What differs in the list is the language
(`stex` via `@codemirror/legacy-modes`, a direct dependency so LaTeX highlighting is up on the
FIRST paint), the folding (environments as well as sections), the autocomplete (`\note{`, `\ref{`,
`\cite{`, `\begin{`) and what live preview MEANS. `\label` is the one command hidden outright on an
inactive line — it prints nothing in the PDF either, and left visible it set a `\label` key in
heading type beside every section title.

## Note annotations (shared/textQuote.ts, server/annotations.ts, client/annotations/)

**MARKED IN THE EDITOR TOO, AND NAMED ON HOVER.** `client/editor/annotationMarks.ts` is a
StateField of mark decorations plus a ViewPlugin that recomputes them 120ms after the document or
the list changes (`subscribeAnnotations`/`peekAnnotations` in useAnnotations.ts); between runs the
ranges ride the change set. `placeInSource()` (client/annotations/placeInSource.ts, pure, tested)
reduces the source to prose WITH A MAP BACK (`proseMapOfSource`, a scanner that replaced the regex
chain and is what `proseOfSource` now calls) and finds the quote there exactly as the reading view
finds it in rendered words, so an anchor made in either view lands in both. The decoration is a
real span (`.s-ann-mark--ink-N`, `--public`, `data-ann-id`; styles in annotation-marks.css, the
editor chunk's), so hover and click are DOM events, announced on the window as
`astrolabe:annotate-hover` and `astrolabe:annotate-open`; `EditorAnnotator` (lazy, admin-only, mounted by
App.tsx) owns the tooltip and the popover for the editor. The reading layer finds the mark under
the pointer with `rangeAtPoint` once per animation frame and shows the same `AnnotationTip` (the
note, or the words when there is no note, and "Click to edit or remove" / "Click to read"); the tip
takes no pointer events. The reading marks now also draw a 2px underline in the ink's hue via
`::highlight` (`color-mix` of the ink with the text colour).

**A MARK IS ANCHORED BY ITS WORDS.** An annotation stores the passage as rendered (whitespace
folded, bidi controls dropped) with up to 48 characters of context either side, never an offset:
`findQuote()` finds every occurrence in the rendered text and, when there is more than one, scores
each by how much of its surroundings agree with the stored context, folded on both sides because
the stored context was trimmed when it was taken. `foldMap()` turns a folded hit back into a raw
offset, and the DOM half (`anchor.ts`) turns that into a Range over the text nodes of the prose,
skipping the renderer's furniture (properties card, transclusion cards, the empty hint). A passage
that is gone stays in the list, said to be gone; nothing is silently dropped.

**PAINTED, NEVER INSERTED.** Marks are drawn with the CSS Custom Highlight API under names of the
form `astrolabe-note-<scope>-<ink>` (and `-public`), so no node enters the rendered note and a
paragraph's own markup is never split; a click on a mark is found by asking where the caret
would land (`rangeAtPoint`). Each surface paints under its own scope letter (`r` reading view,
`p` blog article, `d` designed article, `l` lesson) so two hosts on one page never clear each
other. The six inks are the book reader's tokens.

**KEPT BESIDE THE VAULT, NOT IN IT.** `ASTROLABE_DATA/annotations.json`, a map from note path to
its annotations, on the books.json idiom (cleaned on read, written by rename, 0600). The rename
and folder-move routes carry entries to the new path. The owner reads and writes every annotation
of any note; a visitor reads the PUBLIC ones of a PUBLISHED note and never learns the private ones
exist — the comments gate, line for line. `public` is off by default: a note to self is to self.

## Smaller rules

- **A heading a wikilink cannot spell falls back to its SLUG.** `copySectionLink` emitted
  `[[Note#<heading text>]]` verbatim, so `## Weird ]] | [[Other#x` produced a link the parser
  stops reading at the first `]]` — not a broken link so much as a link that quietly points
  somewhere else. The display text is still what goes in (it survives an edit to the heading's
  inline markup, which is why it was chosen); a heading carrying `[`, `]`, `#` or `|` takes
  `section.slug` instead, which `shared/anchors.ts` resolves by first and which is spellable by
  construction. The extraction stub is the same problem from the other end: `suggestedName()` and
  the prompt's own `check()` now refuse those four characters in a filename, because the stub left
  behind is `[[<that name>]]`.
- **An extraction refused for a name that is already taken says so.** `createNote` 409s before a
  byte of the source note is rewritten (verified: the source is untouched), so the reader's next
  move is to type another name — which "extracting failed" does not tell them.
  `templateActions.ts` makes exactly this distinction on exactly this 409.
- **The extraction Undo's permanent delete is documented where it happens.** It is the only delete
  in the product that bypasses `.trash/`, and `client/api.ts`'s own comment on that function is
  "a note is not a cheaper thing to lose than a folder". What it erases is a note this same toast
  created seconds ago whose entire content has just been written BACK into the source note on the
  line above, so `.trash` would hold a second copy of text the vault already has, under a name the
  reader chose once and then took back. The ordering is the safety: the restore lands first.
