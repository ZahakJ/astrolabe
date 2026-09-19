// Bundle gate: what does each audience actually download?
//
//   node scripts/check-bundle.mjs        (after `npm run build`)
//
// The client ships one entry chunk plus a chunk per surface. That split is
// only worth anything if it HOLDS, and the way it stops holding is ordinary
// and silent: someone adds `import { X } from "./components/SettingsModal"`
// at the top of a file the entry already imports, and the whole app shell
// comes back into an anonymous reader's first request with no visible sign.
// The measured regression this guards against was 350 kB of JavaScript on a
// blog page that renders one article — CodeMirror, the vim keymap, the graph
// engine and every modal, none of which that page can reach.
//
// So this asserts three things about the BUILT output, read from
// dist/.vite/manifest.json (i.e. rollup's own view of the static import
// graph, not a guess):
//
//   1. Named heavy chunks (the editor, KaTeX, the vim keymap, the graph
//      engine) are absent from both first-paint closures.
//   2. Each audience's first-paint bytes stay under a budget.
//   3. The surfaces that are SUPPOSED to be split still exist as their own
//      chunks — a "fix" that inlines everything back into one chunk would
//      otherwise pass rules 1 and 2 by accident once it got small enough.
//
// Budgets are raw (uncompressed) bytes: they measure what the build produced,
// independently of how a given deployment negotiates encoding.

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = path.join(root, "dist");
const manifestPath = path.join(dist, ".vite", "manifest.json");

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch {
  console.error(`check-bundle: no manifest at ${manifestPath}\n  run: npm run build`);
  process.exit(1);
}

/** Transitive closure over STATIC imports — what the browser must fetch
 *  before the chunk can run. Dynamic imports are deliberately not followed:
 *  they are the split. */
function closure(key, seen = new Set()) {
  if (seen.has(key)) return seen;
  const entry = manifest[key];
  if (!entry) return seen;
  seen.add(key);
  for (const dep of entry.imports ?? []) closure(dep, seen);
  return seen;
}

function filesOf(keys) {
  const out = new Set();
  for (const key of keys) {
    const entry = manifest[key];
    if (!entry) continue;
    out.add(entry.file);
    for (const css of entry.css ?? []) out.add(css);
  }
  return out;
}

function bytes(files) {
  let total = 0;
  for (const f of files) {
    try {
      total += statSync(path.join(dist, f)).size;
    } catch {
      // a listed asset that is not on disk is a build problem, not ours
    }
  }
  return total;
}

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;

// ── the audiences ───────────────────────────────────────────────────────────
// Mirrors client/App.tsx: everyone loads the entry; a blog visitor then loads
// the blog shell; an admin loads the vault shell. Neither loads the other.
const APP_SHELL_ROOTS = [
  "components/Sidebar.tsx",
  "components/Tabs.tsx",
  "components/StatusBar.tsx",
  "components/BacklinksPanel.tsx",
];

/** The manifest key for a source file.
 *
 *  Usually the source path itself ("blog/BlogShell.tsx") — rollup names a
 *  chunk after the module when exactly one dynamic import reaches it. When
 *  TWO reach it the chunk becomes a shared one and the key turns into
 *  "_BlogShell-<hash>.js", with the source path recorded in `src` instead.
 *  That is what happened to the blog shell the moment `DesignedSite` began
 *  statically importing it as its fallback — a deliberate arrangement, and one
 *  that left this gate reporting "the lazy boundary is gone" about a boundary
 *  that was still there. So look the key up both ways, and let the assertions
 *  below judge the property that actually matters: not in the entry closure. */
function keyFor(src) {
  if (manifest[src]) return src;
  const byField = Object.keys(manifest).find((k) => manifest[k].src === src);
  if (byField) return byField;
  // A promoted shared chunk records no `src` at all — only a name rollup
  // derived from the module's basename ("_BlogShell-<hash>.js"). Match on that,
  // and on the .js chunk specifically: the CSS sibling carries the same stem.
  const base = src.split("/").pop().replace(/\.[jt]sx?$/, "");
  const re = new RegExp(`^_?${base}-[^/]+\\.js$`);
  return Object.keys(manifest).find((k) => re.test(k));
}

const entry = closure("index.html");
const blog = closure(keyFor("blog/BlogShell.tsx") ?? "blog/BlogShell.tsx", new Set(entry));
// THROUGH keyFor(), for the reason its comment gives one screen up — and this
// line did not, which made the admin budget quietly stop measuring the
// sidebar. The moment a second chunk statically imports anything OUT of the
// sidebar chunk (the folder-icon picker's own lazy chunk imports FolderGlyph
// from it), rollup promotes it to a shared "_Sidebar-<hash>.js" with no `src`
// field — `closure("components/Sidebar.tsx")` then finds no manifest entry,
// adds nothing, and returns quietly. The admin first paint dropped 57 kB and
// twelve files between two builds that differed by one lazy() call, and the
// gate reported OK. A budget that can be satisfied by making a surface
// unfindable is not a budget.
const app = APP_SHELL_ROOTS.reduce((acc, key) => closure(keyFor(key) ?? key, acc), new Set(entry));

// ── the budgets, and why they are the numbers they are ──────────────────────
//
// These were first set at 260 / 420 / 420 kB, measured against an app that had
// no site design engine, no theme library beyond two themes, no LaTeX notes,
// no Hijri calendar, no trash browser, no git sync, no font catalog and a
// third of the i18n dictionary. Every one of those shipped afterwards, and
// none of them is code a split can remove from a first paint: the dictionary
// is read by `t()` on every surface including the blog, the token and theme
// CSS paints the first frame, and the store is the store. Held at the old
// numbers the gate reported FAIL on every build, which is a gate that gets
// commented out rather than obeyed — the one outcome worth avoiding.
//
// So they are re-baselined to what this build actually produces, with ~5%
// headroom so they still RATCHET: a regression of any size still turns them
// red, which is the property the gate exists for. The budgets are not a claim
// that these numbers are good; they are a claim that they must not grow
// silently. What the numbers do NOT include is the structural half below —
// CodeMirror, KaTeX, the vim keymap, the vault graph and the CodeMirror
// grammars are asserted absent from every first paint regardless of budget,
// and those assertions are the ones that caught real regressions.
//
// Two real reductions were taken before re-baselining rather than after, so
// the baseline is of a build that had its avoidable weight removed:
//
//   - the keyboard-shortcut sheet (389 lines + the theme picker) was static in
//     BOTH shells, so an anonymous article reader downloaded it to describe
//     keys they had not pressed. It is lazy and mount-gated now: −28 kB from
//     every entry.
//   - the site designer (125 kB, plus the design engine, the live preview and
//     the markdown renderer it composes with) was reached by a plain
//     `import { openDesigner }` in the status bar, the command palette and the
//     settings panel — three surfaces the admin shell mounts immediately — so
//     rollup had to put the whole designer in the admin's first request. The
//     door is a dynamic-import launcher now (components/design/openDesigner.ts):
//     −178 kB from the admin first paint.
// RE-BASELINED ONCE MORE, for the workspace model — and written down here
// rather than nudged, because a budget that moves quietly is the same as no
// budget. `client/workspace.ts` is the pure state model behind panes, tab
// groups and multiple windows, and `client/state.ts` imports it at module
// scope: the store cannot restore last session's tabs without being able to
// parse a stored workspace, so it is on the boot path by construction and no
// split can take it off. It arrived with the tab context menu's dictionary
// keys, which `t()` reads on every surface including the blog. Together they
// put the entry at 471.4 kB against a 470 kB ceiling — a 1.4 kB overshoot the
// gate correctly refused to wave through.
//
// The ratchet is kept, not loosened: 480 is the new actual plus ~2%, which is
// TIGHTER than the ~5% the numbers below were set with. A regression of any
// size still turns this red, which is the only property that matters.
//
// RE-BASELINED for BOOK TABS and the TAB-DRAG gesture (499.7 kB actual →
// 510 kB, actual + ~2%). What grew, and why no split can take it off:
// `client/books/door.ts` now calls into the store (a book is a workspace tab,
// so the door's happy path IS a store call), the router computes book URLs
// from the workspace, Tabs.tsx carries the drag/reorder handlers, and the
// dictionary gained the composer/table/palette keys — `t()` reads it on every
// surface. The drag's drop zones themselves are NOT here: they lazy-load at
// the first lift, which is what kept this bump at ~4 kB instead of ~7. The
// by-language dictionary split (below) remains the scheduled recovery of
// ~32 kB from every one of these numbers.
// RE-BASELINED for the TRACKER's dictionary keys, and for no other byte of it.
// 510.2 kB actual against a 510 kB ceiling — a 0.2 kB overshoot, and worth
// naming precisely because of how small it is. The tracker's own code is not
// in this number at all: `client/reading/tracker.ts` and its stylesheet (14 kB
// together) are a DYNAMIC import from the fence branch of render.ts, because a
// progress card is drawn on the few notes that carry one and nothing is owed
// by the reader of a note that does not. What did land here is ~2 kB of
// `client/i18n.ts` — the status names, the seven kind labels, the seven
// countPhrase units and the board's empty state — and the dictionary is the
// one module in the product that ships whole to every surface. That is the
// debt named at length below, arriving one release later with three features'
// keys in it rather than one. 512 is the new actual plus ~0.35%, TIGHTER than
// any previous re-baseline in this file: the ratchet is kept, and the
// by-language split remains the ~32 kB recovery that makes this line stop
// moving.
//
// RE-BASELINED for THE SAFETY NET (511.2 kB actual → 516.0 kB; budget 518,
// actual + ~0.4%). All three numbers below move by the same ~4.8 kB, because
// what grew is in the entry closure and the entry closure is inside all three.
// Named precisely, since this is the one re-baseline in this file that bought
// no feature at all:
//
//   +~1.6 kB  client/ErrorBoundary.tsx + client/safety.ts — a React error
//             boundary around the whole app, a window `unhandledrejection`
//             handler and a window `error` handler. Before v1.8 this client
//             had NONE of the three: a throw during render unmounted the tree
//             and left `<div id="root">` empty, mid-sentence, with the unsaved
//             buffers unflushed and no reload button on screen.
//   +~1.0 kB  client/lazySurface.tsx — `lazy()` with the chunk-fetch failure
//             caught. Every surface in the app arrives through a hashed chunk
//             name; redeploy the server under an open session (`git pull &&
//             npm start`) and the next surface the reader opens requests a
//             file that no longer exists. The import rejected, React rethrew
//             it at the boundary, and the app went white.
//   +~1.2 kB  client/api.ts — the request deadline (`fetch` has none of its
//             own) and the guard on a 2xx that is not JSON, which is what an
//             auth proxy's 200 HTML login page had been arriving as: `null`,
//             typed as a tree, a note or a settings object.
//   +~1.0 kB  the dictionary's eight new keys — the crash card's three, the
//             missing-chunk card, the two `ApiError.code` sentences, the
//             stuck-save line and one honest fallback. `t()` reads one object
//             on every surface, so they reach the blog reader too.
//
// WHY NO SPLIT TAKES ANY OF IT OFF: a net that arrives in its own request is a
// net with a hole in it for exactly the window in which most first-paint
// failures happen, and a crash card that has to fetch a chunk after the crash
// is not a crash card. The by-language dictionary split remains the ~32 kB
// recovery, and it is now worth seven times this bump.
// RE-BASELINED for the EDITOR-UX round (519.2 kB actual → budget 521, actual
// + ~0.35%; the two closures below move by the same bytes, because the entry
// closure is inside both). What landed, and why none of it splits off:
//
//   +~1.2 kB  client/state.ts — the first-run open (F1: a fresh install landed
//             on the empty state with the seed's guide sitting in the tree),
//             the tab-strip actions `stepTab`/`closeActiveTab` (F12), and the
//             attachment-folder fact the Move-to picker filters on (F11).
//             `state.ts` IS the entry: it is the store every surface reads.
//   +~0.6 kB  client/App.tsx + client/workspace.ts — the tab chords and the
//             reducer they call. The window keydown listener is the shell's,
//             so it cannot be anywhere but here.
//   +~0.5 kB  the dictionary's six new keys — the two Move-to doors, the
//             outline's empty line, the two tab-key rows in the shortcut
//             sheet. `t()` reads one object on every surface (the debt named
//             at length below; the by-language split is still the ~32 kB
//             recovery that would make this line stop moving).
//   +~0.9 kB  client/components/Editor.tsx and client/editor/livePreview.ts —
//             the caret's home (F9), the caret memory a publish-remount
//             restores from, and `interactedField`, the StateField that ended
//             the raw-YAML bug for the block pass as well as the inline one.
//             Both files are in the editor chunk rather than the entry, so
//             they show up in the admin number and not in the blog reader's.
// RE-BASELINED for MOMENTS (524.7 kB actual → budget 527, actual + ~0.44%;
// the two closures below move by the same bytes, because the entry closure is
// inside both). This is the toast round — F22/F23/F24/F13/F26/F40/F41/F45 —
// and what landed in the ENTRY is:
//
//   +~1.1 kB  client/state.ts — `deletedToast` (F24: the three delete verbs
//             named the trash and offered nothing, so each now carries the
//             restore the `.trash` machinery has always been able to do) and
//             the publish toast's first-ever branch (F22). `state.ts` IS the
//             entry: it is the store every surface reads.
//   +~0.5 kB  client/toast.ts + client/undoToast.ts — the toast STACK (F23).
//             Every `toast()` used to erase every toast, action toasts
//             included, so a plain confirmation killed the Undo under it. The
//             column, the insert-above rule and the ✕ are these bytes.
//   +~0.4 kB  client/sync.ts — the backup toast's short sha and the window
//             event that opens the badge's panel from it (F40).
//   +~1.7 kB  the dictionary's eighteen new keys — the first-publish line and
//             its View door, the paste receipt, the empty vault's two doors,
//             the three moderation outcomes and the switch that opens the
//             margins, the designer's Switch back, the sha line, the owner
//             dashboard's publish explanation, and the store's one honest
//             localized failure line (F45: the fallback used to print the
//             server's English log prose, or an English phrase built from a
//             console label, at an Arabic reader).
//
// WHY NO SPLIT TAKES ANY OF IT OFF: a toast is what the app says when
// something has already happened, so the code that draws one cannot arrive in
// a later request than the event it is reporting. The by-language dictionary
// split remains the ~32 kB recovery for the dictionary's share, as it is for
// every line above.
// RE-BASELINED for THE SIX NEW ROOMS: +8.1 kB on the entry, and therefore the
// same +8.1 kB on both closures below, since the entry closure sits inside
// both. Stated as a DELTA rather than as an absolute, because this file's
// absolutes have always been measured at one instant and the thing worth
// holding anyone to is what a change cost. 543 → 554 / 754 → 770 /
// 1168 → 1178, which is the measured overshoot plus this file's usual ~0.4%.
// This is the only re-baseline here whose cause is a STYLESHEET rather than
// the dictionary, and it is worth naming precisely because a theme is the one
// kind of feature that cannot be split:
//
//   +5.79 kB  client/styles/tokens.css — six complete rooms (phosphor,
//             sidereal, murex, palimpsest, porcelain, mauveine), and
//             "complete" is the cost. DESIGN.md's rule is that a theme
//             defines its WHOLE set — ground, raised, hover, three text
//             tokens, accent, accent-soft, border, danger, selection, focus
//             ring, three graph tokens, two banner tokens, thirteen callout
//             hues and eight syntax colours — because a block that inherits
//             another theme's leftovers wears iron-gall's amber on a green
//             ground. That is ~46 declarations a room, and there is no
//             version of it that is smaller and still correct.
//   +1.02 kB  client/styles/themes.css — the six --swatch-* trios and their
//             two-hook rules. These are CONSTANT across themes on purpose:
//             the picker paints a preview of a room in THAT room's colours,
//             never in the one currently on screen, so they cannot be derived
//             from the live tokens.
//   +0.09 kB  client/styles/textcolor.css — three selectors, joining the
//             light group's one existing rule.
//   +~1.3 kB  client/i18n.ts — the six rooms' names and one-line descriptions
//             in both languages, plus the ambient row's label and hint. `t()`
//             reads one object on every surface, as every note below says.
//
// WHY NO SPLIT TAKES ANY OF IT OFF: tokens.css is linked from index.html and
// paints the FIRST FRAME. A theme that arrives in a second request is a page
// that flashes the default room and then repaints, which is the one failure a
// theme system is not allowed to have. The by-language dictionary split
// remains the ~32 kB recovery for the dictionary's share.
//
// WHAT DID NOT LAND HERE, deliberately: the ambient masthead. Its stylesheet
// (client/styles/ambient.css, 4.5 kB) is imported by client/ambient.tsx, which
// is reached only from the blog shell and the design engine — both lazy — so
// it is inside the blog reader's number below and outside the entry's
// entirely. An instance with the setting off still downloads it with the blog
// shell, which is the honest price of keeping the mapping in CSS where a theme
// switch can repaint it live; an admin who never opens the public site pays
// nothing.
const AUDIENCES = [
// RE-BASELINED for NOTE HISTORY (529.4 kB actual → budget 532, actual +
// ~0.5%). This round is the safety net the rest of the slate stands on — git
// log over the open note, a read-only render of any revision, and one button
// that puts it back — and almost all of it is in a chunk nobody downloads
// until they open the section. What DID land in the entry, measured:
//
//   +~2.8 kB  the dictionary's thirty-two new keys — the timeline's chrome and
//             its three empty states with their doors, the revision viewer,
//             the restore toast and its undo, and the five Snapshot lines.
//             `t()` reads one object on every surface, so a blog reader
//             downloads them too; the by-language split named at length below
//             is still the ~32 kB recovery that would make this line stop
//             moving, and it is now worth eleven times this round's bump.
//   +~0.5 kB  client/dates.ts — `relativeDate()`. A timeline is read in
//             distances ("three days ago"), and the rule at the top of that
//             file is that no surface holds its own Intl call: the history
//             panel would have been the fifth to try.
//   +~0.4 kB  client/api.ts — the two history fetchers and the snapshot POST.
//   +~0.5 kB  client/sync.ts — `runSnapshotNow()` and the window event the
//             timeline listens on, so a snapshot taken from the palette shows
//             up in an open list without polling git once a second.
//
// WHY NO SPLIT TAKES ANY OF IT OFF: the panel itself already IS the split —
// `client/components/HistoryPanel.tsx` and `client/styles/history.css` arrive
// only when a reader opens the section, which starts collapsed. The four items
// above are the entry's own modules (the dictionary, the date policy, the API
// client, the shared sync status), and each is read by surfaces that are
// already on screen when they are needed.
// RE-BASELINED for LINK REPAIR AND TAG RENAME (533.3 kB actual → budget 535,
// actual + ~0.3%). This round is two vault-wide rewrites — rename a tag (and
// merge it onto another), and repair the `[[Note#Heading]]` links a heading
// rename just broke — over one engine that previews, applies under a
// precondition and keeps a way back. Almost none of it is the entry's:
//
//   +~3.0 kB  the dictionary's twenty-eight new keys. Both rewrites are
//             CONVERSATIONS — an offer naming a count, a dry run naming a
//             count, a merge warning, a done-toast, an undo, and the two
//             sentences that name what was skipped and why — and a bulk tool
//             that says only "done" is the bulk tool nobody presses twice. So
//             the keys are the feature, and `t()` reads one object on every
//             surface, so a blog reader downloads them too. The by-language
//             split named at length below is still the ~32 kB recovery that
//             would make this line stop moving; it is now worth ten of this
//             round.
//   +~0.6 kB  client/api.ts — the four fetchers (preview, rename, repair,
//             undo).
//
// WHAT DID NOT LAND HERE, and deliberately: `client/tagRename.ts` (the two
// dialogs) is reached only from the sidebar chunk, `client/bulkEdit.ts` (the
// toasts and the undo) only from the sidebar and editor chunks, and the whole
// server half — the surgeon, the engine, the rename detector — is server code
// that no browser downloads at all.
// RE-BASELINED for THE SEARCH SUITE (537.7 kB actual → budget 540, actual +
// ~0.4%). This round is three answers in one box: diacritic folding, search
// operators, and vault-wide search & replace. Its entry share is almost
// entirely the dictionary again, and this time the reason is worth naming
// rather than apologising for.
//
//   +~4.0 kB  the dictionary's forty new keys. Two of the three features are
//             CONVERSATIONS a reader cannot have without words: a grammar
//             nobody can guess (seven operator rows, an example and a gloss
//             each, plus the sentence saying they narrow together), and a
//             rewrite of four hundred notes that has to state its rule, its
//             scope, its dry run, its snapshot offer, its confirm, its
//             done-toast and the two sentences naming what it refused to
//             touch. The third feature — the fold — added ZERO chrome and one
//             help line, which is how you know it was the right shape.
//             `t()` reads one object on every surface, so a blog reader
//             downloads them too; the by-language split named at length below
//             is still the ~32 kB recovery that would make this line stop
//             moving, and it is now worth eight of this round.
//   +~0.3 kB  client/api.ts — the two replace fetchers.
//
// WHAT DID NOT LAND HERE, deliberately: `client/components/ReplacePanel.tsx`
// and `client/components/SearchHelp.tsx` are their own lazySurface chunks (the
// panel carries the dry-run list, the selection model and its stylesheet, and
// a fraction of sessions ever open it); `shared/searchQuery.ts` rides with the
// panel that imports it; `shared/fold.ts` rides with the two matchers that
// consult it — the palette's ranker and the editor's `[[` completion — both of
// which are already split. The whole server half (the operator evaluator, the
// replace engine, the nomination walk) is server code no browser fetches.
// RE-BASELINED for THE EDITABLE PROPERTIES CARD (541.1 kB actual → budget 543,
// actual + ~0.35%). The smallest re-baseline in this file, and the whole of it
// is words:
//
//   +~0.8 kB  the dictionary's eight new keys — "Add property", the two field
//             names, the empty-value word, "Add value", the two removal
//             tooltips and the removed-toast. A properties card is chrome that
//             has to NAME what each control does to somebody's file, and it
//             does it in both languages. `t()` reads one object on every
//             surface, so a blog reader pays for them too; the by-language
//             split named at length below remains the ~32 kB recovery.
//   +~0.3 kB  client/App.tsx and client/state.ts — the window-event listener
//             the card writes through and the `setProperty` store action
//             beside `setBanner`, which are both on the boot path by
//             construction (the shell mounts the listener, the store IS the
//             store) and cannot be split off.
//
// WHAT DID NOT LAND HERE, deliberately: `client/editor/propsEdit.ts` — the
// whole editing layer, every input, chip and checkbox in it — is reached only
// from the EDITOR chunk, because `buildPropsCard()` takes its editing callbacks
// as parameters and the reading-view renderer passes none. A blog visitor's
// copy of the same card is the display-only card it always was, byte for byte.
// The surgical writer, the value grammar and the key policy are server code no
// browser fetches at all.
// RE-BASELINED for PER-DESIGN TYPE (554.9 kB actual → budget 556, actual +
// ~0.2%). This round lets a DESIGN name real typefaces — three optional
// catalog ids on `chrome.typography`, served to visitors through the same
// generated stylesheet the instance's own four slots go through. Its entry
// share is the dictionary and nothing else, and the measurements are worth
// keeping because the interesting number is the one that did NOT move:
//
//   +~1.0 kB  the dictionary's eight new keys — the section heading, the three
//             row labels, the word on the row that means "leave this to the
//             instance", the two hints and the note about Arabic. A picker
//             that offers a typeface has to say what clearing it does and what
//             happens to the script the row cannot choose for, or the control
//             is a guess in two languages. `t()` reads one object on every
//             surface, so a blog reader pays for them too; the by-language
//             split named at length below remains the ~32 kB recovery.
//   +0 kB     THE CATALOG ITSELF. `shared/fontCatalog.ts` — twenty-seven
//             families with their categories, scripts and measured
//             size-adjusts — moved out of `server/fonts.ts` this round so the
//             validator, the designer's rows and `check-presets` could agree
//             about which ids exist. Measured after the move: it lands in the
//             DESIGN chunk (`assets/design-*.js`), which is lazy on every
//             surface, and it is absent from the entry closure entirely. A
//             list of font names is not something a blog reader downloads to
//             read a post.
//
// WHAT ELSE DID NOT LAND HERE: the per-design composite builder, the draft
// stylesheet route and the cache warmer are all server code no browser
// fetches; the three `<Select>` rows are inside the designer panel's own
// chunk, which only an admin opening the designer pays for.
// …and once more, for THE STRUCTURES (556.1 kB actual → 557, actual + ~0.16%).
// A post list gained five layouts, a card five anatomies, a hero three
// treatments and the divider an ornament — and the entry's whole share of that
// is TWENTY-FOUR DICTIONARY ENTRIES, in two languages: the names of the
// choices, plus one hint per axis saying what the axis decides. The row labels
// have to be words rather than pictures for the same reason the font rows do —
// "Dateline" is a shape the operator cannot guess from a segment glyph — and
// `t()` reads one object on every surface, so a blog reader pays for them too.
// The by-language split named below remains the ~32 kB recovery.
//
// WHAT DID NOT LAND HERE, and it is most of the round: ~5 kB of new rules in
// `client/styles/design.css` (the layouts, the shapes, the treatments, the
// ornament) and ~2 kB in `client/styles/presets.css` (the miniature's version
// of the same) are both in the DESIGN chunk, `assets/design-*.css`, which is
// lazy on every surface — the entry closure is three files and none of them is
// a stylesheet this feature touches. The renderers are in the same chunk; the
// five `<Select>`/`<SegmentedControl>` rows are in the designer panel's own.
// …and once more, for THE CHROME (557.8 kB actual → 559, actual + ~0.21%).
// Two masthead shapes, five page grounds, three footer forms and four nav
// styles, and the entry's WHOLE share of them is the dictionary again: twenty
// entries in two languages — five ground names, two masthead names, three
// footer forms, four nav styles, and one hint per axis. The measurement is
// exact, because the entry closure is three files and only two of them could
// have moved: `assets/index-*.js` carries `client/i18n.ts` (+~1.7 kB) and
// `assets/index-*.css` carries `client/styles/controls.css` (+~16 bytes,
// below). The reason a blog reader pays for chrome copy is the reason named
// two rounds up — `t()` reads ONE object on every surface — and the by-language
// split remains the ~32 kB that would give it back.
//
// The sixteen bytes are a CORRECTION and are worth their own line: `.s-ctl-seg`
// gained `flex-wrap: wrap`. It was an `inline-flex` of `nowrap` buttons under
// `max-width: 100%`, so a segmented control wider than its column had its last
// segments CLIPPED rather than wrapped — measured in the designer at 1280, a
// three-way control overran by 55px and a five-way one by 158px, which is an
// option nobody can see or click. Pre-existing wherever a run was tight; found
// by measuring this round's four- and five-way controls and fixed at the root.
//
// WHAT DID NOT LAND HERE: ~4 kB of new rules in `client/styles/design.css`
// (the two mastheads, the five surfaces, the four nav styles, the two footer
// forms) and ~1 kB in `client/styles/presets.css` (the miniature's version) are
// both in `assets/design-*.css`, lazy on every surface; the four new
// `<SegmentedControl>` rows are in the designer panel's own chunk.
// …and once more, for THE SCENERY (559.9 kB actual → 561, actual + ~0.2%), and
// this one is the cheapest round the design engine has had: the entry's WHOLE
// share is thirteen dictionary entries in two languages — six world names, six
// mark names, two hints and a note about motion — and the measurement is exact
// rather than argued. HEAD was built into a scratch tree and the two closures
// compared file by file: `assets/index-*.js` 289.7 → 291.2 kB (+1.5), and
// `assets/index-*.css` IDENTICAL at 129.0 kB, byte for byte, which is the
// proof that none of the ~9 kB of new rules landed here. The reason a blog
// reader pays for designer copy is the reason named three rounds up — `t()`
// reads ONE object on every surface — and the by-language split remains the
// ~32 kB that would give it back.
//
// WHAT DID NOT LAND HERE: ~7 kB in `client/styles/design.css` (five worlds, the
// six ornament marks, the sticky layer and the measured table) and ~2 kB in
// `client/styles/presets.css` (the miniature's five worlds and the canvas's one
// override) are both in `assets/design-*.css`, lazy on every surface; the two
// new `<SegmentedControl>` rows are in the designer panel's own chunk; and the
// five new presets are ~9 kB of data in `presetCatalog-*.js`, which is fetched
// the first time an admin opens the gallery and never by anybody else.
// …and again for THE WAY BACK (561.5 kB actual → 563, actual + ~0.27%). Six
// dictionary entries in two languages, and they are the ones that answer "I am
// afraid to try a design because I like the one I have": what visitors are
// seeing, the move in each direction, and the sentence saying nothing is lost
// either way. The bar itself is markup in the designer panel's own chunk and
// ~70 lines in designer.css, which is loaded with it.
// …and again for THE ROOMS (563.1 kB actual → 565, actual + ~0.34%). Sixteen
// dictionary entries: five shell names, three frame names, two more worlds,
// two hints, a section heading and the note about what a phone does with a side
// rail. It is the largest copy round the design engine has had and it is copy
// for the largest decision on the panel — the one that moves walls rather than
// furniture. The ~11 kB that DRAWS the five rooms is in `design.css`, the ~4 kB
// that draws them at 200px is in `presets.css`, the two controls are in the
// designer's chunk and Studio E's four houses are in `presetCatalog-*.js`.
// …and again for THE GRAPH'S OWN SETTINGS and THE SPOTLIGHT (567.2 kB actual →
// 569, actual + ~0.32%). Thirty dictionary entries for a settings panel that
// lives in the graph's lazy chunk (its ~5 kB of CSS moved out of app.css into
// graph.css for exactly this reason, and graphPrefs.ts is imported only from
// GraphView), plus the hover card's spotlight, whose ~4 kB of CSS ride with
// hovercard.css in the blog chunk and whose engine grew by the crown and the
// veil. The strings are the whole of what the entry pays; the debt they belong
// to is the dictionary paragraph below, unchanged.
// …and again for THE LIBRARY (573.4 kB actual → 574, actual + ~0.1%). Sixty
// dictionary entries for the shelf, a path, a lesson and the settings rows
// that declare them, plus the store's one field for the door. The pages,
// their sheet and the progress module are in LibraryPages-*.js behind the
// door; the entry pays the words, which is the dictionary debt again.
// …and again for NOTE ANNOTATIONS (575.2 kB actual → 576). Twenty dictionary
// entries. The layer, its painter and its stylesheet are in
// AnnotationLayer-*.js, mounted lazily and only when there is a mark to paint
// or an owner who can write one.
  // …and again for THE FOLDER GLYPH CATALOG (588.0 kB actual → 592): the
  // closed enum grew from twenty names to three hundred (the drawings and the
  // search keys are a lazy chunk, but the names must validate synchronously),
  // the dictionary took the picker's shelves, the graph's gatherings and the
  // library popover, and shared/library.ts learned to guess a folder's kind.
    // …and again for IMAGE MARKS (592.4 kB actual → 600): the mark validator and
  // the picker's image row.
  // …and again for THE MEDIA PAGE (599.0 kB actual → 602, actual + ~0.5%):
  // fifty dictionary rows for the shelves and their form, one `View` word in
  // the store, the vault event the page listens on, and the palette's door.
  // The page, its form, its model and its stylesheet are MediaView-*.js
  // behind the button — asserted split below — so what the entry pays is,
  // once more, the words.
  // …and again for A WORK'S NOTES (603.6 kB actual → 608, actual + ~0.7%):
  // the right panel's tracker section — the parent above a child note, the
  // children under a tracker — with its dozen rows, the unit-word table that
  // agrees "chapters" and «فصول» (its own module, `client/trackerUnits.ts`,
  // so the panel did not drag the reading renderer into the entry), and the
  // folder chip's strings. The Media page itself stays behind its button.
  // …and again for DRAWINGS (605.9 kB actual → 608, actual + ~0.35%): fifteen
  // dictionary rows for the canvas and its prompt, the drawing spellings in
  // shared/noteFormat.ts, the embed kind, the tree's pencil, the pane's
  // surface, the palette row and the one-line asset-path global that has to
  // run before Excalidraw's chunk does (client/drawing/assetPath.ts). The
  // canvas itself, the exporter and the plugin's compressor are
  // DrawingSurface-*.js and a vendor chunk behind it — asserted split and
  // FORBIDDEN from every first paint below.
  // …and again for THE SURFACE LAYER (633.0 kB actual → 636, actual + ~0.5%):
  // eighty-four surface tokens and their derivations in tokens.css, a label
  // key and a `derivedFrom` on every one of the 124 entries in THEME_TOKENS
  // (the runtime reads that list to validate and to paint a custom theme, so
  // it is in the entry by design), and the 124 dictionary rows that name them
  // in both languages. The builder's own code is where it was.
  // …and again for THE NAME (636.9 kB actual → 640): the storage migration
  // that carries `vellum.*` preferences over to `astrolabe.*` runs before
  // anything else, so it is in the entry by design; and the mark's geometry
  // (shared/brandMark.ts), which the sign-in modal and the wordmark draw from.
  // …and for THE SPLIT GRIPS AND THE GRAPH TAB (640.0 kB actual → 644): the
  // graph's tab sentinel and the two resize reducers sit in the workspace
  // model, which the entry has always carried, and the grips' labels are
  // dictionary rows.
  // …and for 3.3.0 (646.7 kB actual → 648): the block-alignment reader and
  // the custom-width normaliser sit in code the entry already carries.
  // …and for 3.3.2 (648.3 kB actual → 650): the outline strips alignment
  // markers, which brings the marker reader into the entry's link module.
// …and for 3.5.0 (653.7 kB actual → 660): the preferences that travel with
  // the vault (client/prefsSync.ts) are pulled BEFORE the first paint, so
  // they are entry by definition, and the foreign-drag adoption in dragTab.ts.
  // …and for 3.7.0 (692.2 kB actual → 700): twenty-four preset rooms in
  // tokens.css, generated from their published palettes (scripts/gen-themes.mjs).
  // …and for 3.10.0 (702.8 kB actual → 706, actual + ~0.45%): the eye-comfort
  // sheet (client/eyeComfort.ts, its `.s-eye` rules in app.css, its nine
  // dictionary keys). It goes up from main.tsx BEFORE the first paint and
  // before the prefs pull — a reader who warmed the screen last night must not
  // get a flash of blue-white first — so it is entry by definition, like the
  // theme and the editor's measure before it.
  // …and for 3.11.0 (710.4 kB actual → 713, actual + ~0.35%; the blog and
  // admin closures below move by MORE than the entry, and that is the point
  // of naming it): ROUTINES, the daily tracker. What lands in the ENTRY is
  // the dictionary's ~90 keys (the card's vocabulary, the page's, the
  // form's — `t()` ships whole, the debt every note in this file names) and
  // the workspace's third virtual tab. What lands in the READING closure and
  // not the entry is shared/routine.ts, the pure model: render.ts and the
  // live preview must PARSE a fence before anything paints (the tracker's
  // "decision is synchronous, the drawing is not" rule), so the parser is
  // static while the card, its stylesheet, the page and the presets are all
  // lazy chunks of their own — the presets were moved out of the model into
  // shared/routinePresets.ts for exactly this line.
  // …and 713.0 kB actual → 716 for the WHAT'S NEW door (client/whatsnew/
  // door.ts + versions.ts: two localStorage keys, a version compare and a
  // dynamic import) and its eleven dictionary keys. The deck itself, its
  // demos and its prose are a lazy chunk pinned by MUST_SPLIT.
  // 3.12.0 (723.5 kB actual → 726): PERIODIC NOTES — client/daily.ts is
  // imported by the shell (Ctrl/Cmd Alt D) and now carries the format engine
  // (shared/periodic.ts) and the settings cache; and the dictionary's keys
  // for the whole release (block references, the query and tasks fences,
  // unlinked mentions, on this day, the periodic settings rows), which ship
  // whole to every surface, as every note in this file says.
  // …and 728.8 → 731 once the release's other three features merged (note
  // versions, PDF search, export): their dictionary blocks, and the export
  // door's and the versions fetchers' few hundred bytes.
  // 3.13.0: 750.0 kB actual → 754 — the i18n dictionary's blocks for
  // bookmarks, layouts, the tag tree, tashkeel, the attachments sweep,
  // scripture, flashcards and offline reading (every string of every
  // feature lives in the entry's dictionary), plus the tag-tree model, the
  // bookmarks model, the SR-comment strip in the reading renderer and the
  // offline door (client/offline.ts) — the worker itself is dist/sw.js,
  // outside every budget.
  // 3.15.0: 759.1 kB actual → 762 — ORBITS. Almost all of it is the
  // dictionary again: the rebuilt form explains every field in a sentence
  // (the `sigilField*` help block, the section titles, the hints under each
  // control) in two languages, and `t()` ships whole. The rest is the model's
  // `icon:` / `banner:` keys, the `count` field type and the second fence
  // spelling in shared/routine.ts, which the reading closure parses before
  // it paints. The known-field table (client/routineFields.ts) is reached
  // only from the card's and the form's lazy chunks.
  // 3.16.0: 762.6 kB actual → 763 — the French and furigana dictionaries
  // (labels, hints, the settings row) landing in one entry after the two
  // branches merged; the French detector was split out of the correction
  // table for this very gate (shared/frenchLine.ts).
  // 3.16.0 release: 763.9 kB actual → 764 — the Orbits/Sigils dictionary and
  // the French/furigana dictionary meeting in one entry at integration.
  // 3.16.1: 765.3 kB actual → 766 — the browser-dictionaries row (its
  // bilingual hint, the four labels, client/spellDicts.ts at startup).
  // 3.17.0: 794.0 kB actual → 795 — SIX BRANCHES MET IN ONE ENTRY, and the
  // sum is the sum of their parts (765.3 kB before any of them):
  //  · calendar and periodic notes, +8.1 kB: the dictionary (the calendar's
  //    labels, the four period kinds, the launch row, the periodic-notes
  //    note), the status bar's period crumb (client/daily.ts periodLabel +
  //    shared/dates.ts formatCalendarRange — first paint because the bar
  //    is), the month and year kinds in shared/periodic.ts, the launch door
  //    in the store, and the periodic cache as a subscribable (usePeriodic).
  //    The month grid (shared/calendar.ts, CalendarGrid.tsx, its sheet) is a
  //    lazy chunk behind the sidebar's fold (and, until 3.18, behind the
  //    Sigils page's own copy of the grid).
  //  · the editor conveniences, +3.2 kB: the template prompt scan and the
  //    `{{cursor}}` offset (client/templates.ts — state.ts imports
  //    templateActions for the default template, so the scan that decides
  //    whether a sheet is owed is on the boot path; the sheet is lazy), the
  //    periodic formatter's HH/mm/ss tokens and the unique note's free-name
  //    rule (shared/periodic.ts), the store's pendingCaret, and the
  //    dictionary's rows for the sheet, the unique note's two settings, the
  //    palette's create and layout rows and "12 of 840 words". The
  //    natural-date parser rides the editor chunk; the tag card, its
  //    stylesheet and the sheet are their own chunks.
  //  · the reading surfaces, +3.0 kB: fourteen dictionary rows (Footnotes,
  //    the page card, the timeline, the diagram), shared/mediaEmbeds.ts
  //    (parseEmbed in editor/embeds.ts — a module the store imports for its
  //    cache door — now asks about sounds and pages) and client/
  //    footnoteNav.ts. The player, the page card, the sidenote layout, the
  //    timeline renderer, the mermaid chunk and pdf.js's page painter are
  //    behind `import()` and asserted split or forbidden below.
  //  · the vault views, +3.0 kB: the dictionary for the properties shelf,
  //    the graph's groups by query and Nearby, the bookmark grammar's
  //    heading and search rows (shared/bookmarks.ts) and three api.ts doors.
  //    The shelf and the Nearby list ride their own chunks and stylesheets.
  //  · reading sessions, highlights → note and the weekly review, +6.6 kB:
  //    almost all dictionary (the session toasts, the "pages a minute here"
  //    line, the highlights action, the review page's headings and empty
  //    states), plus the review tab's sentinel and route and formatDuration
  //    in client/trackerUnits.ts. The clock, the session log, the fence's
  //    session parser, the highlights writer and the review page are lazy.
  //  · capture, +4.9 kB: the capture and clipper dictionary keys, the
  //    Ctrl/Cmd Shift D branch in App.tsx, the `captureOpen` flag and three
  //    fetchers. The sheet, its stylesheet and the flow are a lazy chunk
  //    mount-gated on the flag; the converter and the manifest are
  //    server-side.
  // Five of the six are mostly dictionary, which is the debt named below.
  // 3.18.0: 795.7 kB actual → 796 — iron-gall gets its token block back
  // (tokens.css; the room had none since the presets landed and computed
  // github-dark), --radius/--banner-tint on the hand rooms, minus the unread
  // --syn-tag the generator dealt to every preset.
  // 3.18 settings in place: 795.5 kB actual → 796 — dictionary again: the
  // reference text that moved from six long hints to `more` keys behind the
  // row's ⓘ (the hints shrank, the reference grew by its own sentences), the
  // "Clear the offline copy?" dialog and the ⓘ's second label. The panel
  // itself stays a lazy chunk.
  // 3.18.0: 796.0 kB actual → 797 — "everything travels", +1.3 kB, all of it
  // boot-path by construction: `reloadPrefsFromStorage` in the store (the
  // first paint has to see the pulled sidebar side, so it cannot be lazy),
  // prefsSync's `lastPull` readout and three more travelling keys, two api.ts
  // doors (`/api/sync/travel`), and the travel row's label and hint in the
  // dictionary — the row's own two dozen strings ride the settings chunk in
  // their own table (client/components/settings/travelCopy.ts), which is
  // why this is 1.3 kB and not 4.
  // 3.18 the Calendar page: 799.2 kB actual → 800 — the month's own door.
  // Every byte is shell by construction and none of it is the page: the
  // status bar's fourth button and its glyph, the phone menu's row, the
  // `~calendar` sentinel + `/calendar` route + the store's toggle, the
  // palette row, and the six dictionary rows in two languages (`t()` ships
  // whole, the debt named below). The PAGE — CalendarView.tsx, the month
  // grid, calendar.css — is a lazy chunk asserted split in MUST_SPLIT, and
  // the Sigils page GAVE BACK its `getTrackers` read when the grid left it.
  // 3.18 overlays and stacking: 799.020 kB actual → 800 (actual + ~0.12%).
  // TWENTY BYTES over, and the whole of it is tokens.css and app.css — the
  // first paint by definition, on every surface, nothing here to split. The
  // fourteen `--z-*` rungs and three `--motion-*` names are the cost of the
  // stacking ladder and the easing vocabulary having somewhere to live; the
  // `var(--z-menu)` call sites are longer to say than `300` was, which is the
  // point of them. It is nearly paid for by what the same round returned to
  // this number: the `.s-treesort__menu` block and its `position: relative`
  // wrapper, and the menu markup Sidebar deleted when its two hand-rolled
  // menus moved onto ContextMenu (Sidebar is a lazy chunk, but its i18n keys
  // and the `.s-menu` rules are not).
  // 3.18.0 INTEGRATION: 800.8 kB actual → 801. The peak round's six branches
  // each measured an overage against its own base; this is the number they add
  // up to. The +1.8 kB over the overlay round's 799.0 is the Calendar page's,
  // and every byte of it is shell by construction: the fourteen dictionary rows
  // in two languages (`t()` ships whole — the debt named below), the status
  // bar's fourth door and its glyph, the phone menu's row, `~calendar` +
  // `/calendar` + the store's toggle, and the palette row. The PAGE itself —
  // CalendarView.tsx, shared/dayAgenda.ts, calendarpage.css — is a lazy chunk
  // asserted split in MUST_SPLIT, and the Sigils page GAVE BACK its
  // `getTrackers` read when the grid left it.
    // 3.18.0: the phone round (the deck by finger, the panel drawer, touch zoom).
  // 3.18.0 THE PHONE'S SHOULD-HAVES: 801.9 kB → 806. The touch floor
  // stopped being a promise and became CSS: one coarse-pointer block per
  // stylesheet raising every shell target to 44px and every field to 16px,
  // the notch and home-indicator insets (`--safe-top` / `--safe-bottom`, app.css),
  // and the two drawers hiding the chrome they cover. It is SHELL css and so
  // it is first-paint css by definition — a 44px rule that arrives in a lazy
  // chunk is a target that resizes under a finger that is already on it.
  // Measured against a build of the same tree without the round: +3.1 kB,
  // which is what this budget moves by and no more. The round's two new
  // modules (backGesture.ts, softKeyboard.ts) cost this reader nothing: both
  // are `import()`ed behind `(pointer: coarse)` from main.tsx, beside swipe.ts.
  // 3.18.x: the shared tags/properties shelf and its tabs.
  // 3.18.1 WINDOWS AND DESKTOP RESIZING: 805.3 kB actual → 806. +2.3 kB, and
  // every byte of it is first paint by construction. `client/paneWidths.ts`
  // grew `layoutPanes`/`paneStyle` — the one owner of "how wide may these two
  // panes be, HERE" — and `PaneGrip.tsx` grew `usePaneLayout`, the rAF-throttled
  // resize listener that is the whole of "resizing *windows*"; both run at
  // boot, before anything is painted, which is exactly why the old code
  // re-applied a stored {560, 560} into a 904px window and left the note 0px
  // wide. The rest is the store's `paneStill` flag, three dictionary rows in
  // two languages for the zoom chip (`t()` ships whole — the debt named
  // above), and the two grips App now renders itself. Nothing here can be
  // lazy: a shell that splits its own layout arithmetic paints the wrong
  // layout first and corrects it, which is the flicker this round removes.
  // 3.18.x TABLES EDITED IN PLACE: 805.6 kB actual → 806 (actual + ~0.05%),
  // and it is the dictionary debt named below, once more. The round's own
  // entry bytes are thirty-eight rows in two languages (the cell menu's
  // eighteen commands, the palette's six, the picker's four, four toasts and
  // labels) plus `client/tableActions.ts` — ~40 lines whose whole job is to
  // carry a command id from the palette to whichever editor holds the caret,
  // and which exists precisely so CommandPalette.tsx does not import
  // `editor/tables.ts` and pull CodeMirror into this number. Everything that
  // actually does the work is outside it: the widget, its cell box and its
  // menu are in the editor chunk, and the rows × columns picker with its
  // stylesheet is a lazy chunk of its own (TablePicker-*.js), reached by
  // `import()` from the palette row.
  // 3.19.0 COURSE SIGILS: 806.1 kB actual → 807 (+3.1 kB, actual + ~0.1%).
  // Two causes, both unavoidable in a first paint, and one that was avoided.
  // NOT avoided: `client/i18n.ts` gained ~35 keys in two languages for the
  // course card, the calendar's bands and the form's second mode — the
  // dictionary lands whole in every first paint (the debt named below), so
  // strings a visitor never reads are still strings a visitor downloads.
  // NOT avoided: `shared/routine.ts` gained the course PARSER — `mode:`,
  // `days:`, `capacity:` and the `steps:` block, with a step's key, its
  // minutes and its unit. That module is static here on purpose (render.ts
  // must draw a fence before anything paints), so a note carrying a course
  // has to be readable at first paint or it renders as its own source.
  // AVOIDED: the WALK — the cursor, the projection over the allowed days, the
  // packing by capacity, the unit bands — is `shared/course.ts`, a module the
  // entry never imports. Only the card, the two pages and the form ask where
  // a step lands, and every one of them is behind a lazy chunk.
  // 3.19.0 MERGE: the two rounds above land together, so their overages add:
  // 809.5 kB actual → 810 — the sum of the course sigils' and the table round's bytes, no new cause.
  // 3.19.0 MERGE, phone round: 812.7 kB actual → 813 — the phone round's own lines above
  // (safe-area tokens, the drawers' ✕, the back-button wiring) summed onto the two rounds before it.
{ name: "entry (everyone)", keys: entry, budget: 813 * 1024 },
  // RE-BASELINED for the DICTIONARY, and this one deserves naming as a debt
  // rather than a measurement. `client/i18n.ts` is a single object read by
  // `t()` on every surface, so it lands whole in every first paint — and this
  // round added ~90 keys to it, of which the book reader's 47 and the tab
  // menu's 15 are unreachable from a blog page by construction. An anonymous
  // article reader now downloads the Arabic and English strings for a PDF
  // outline panel they cannot open.
  //
  // The honest fix is to split the dictionary per surface so a lazy chunk
  // carries its own copy, which is a real change to how `t()` is typed and is
  // not something to start while four agents are in the tree. Until then the
  // budget moves, in the open, with the cause written down.
  //
  // MOVED AGAIN, and this time with the debt MEASURED rather than described.
  // The dictionary's value bytes are 35 kB of English and 32 kB of Arabic, and
  // BOTH ship to every reader — so an English instance downloads 32 kB of
  // Arabic it will never render, and an Arabic one downloads 35 kB of English.
  // Splitting the dictionary BY LANGUAGE, not by surface, is therefore the
  // larger and simpler win, and it is the scheduled fix: `t()` keeps its typing
  // off the English keys, and `setLang("ar")` awaits a dynamic import which the
  // bootstrap blocks on, so an Arabic instance never flashes English rather
  // than paying nothing.
  //
  // What argues for this round's growth in the meantime: panes, the
  // cross-window lease and the buffer bridge are all structural additions to
  // the shell that no split can remove from a first paint, and they arrived
  // with the dictionary keys that name them.
  // Moves with the entry above (the blog closure contains it): same causes,
  // same recovery path, actual 673.4 kB at the book-tabs re-baseline.
  //
  // RE-BASELINED for CUSTOM PUBLIC FOLDERS (682.1 kB actual at the previous
  // commit → 698.2 kB, budget = actual + ~1.7%). Measured, per file, against a
  // build of the parent commit rather than described:
  //
  //   +3.9 kB  BlogShell chunk — the folder page, the home band, the folder
  //            chips in the nav and the article footer, and the slug rules
  //            (shared/publicFolders.ts).
  //   +3.5 kB  blog.css — the band, the folder-page header and the chips.
  //   +3.4 kB  FolderGlyph — the twenty path tables (shared/folderIcons.ts).
  //   +2.7 kB  the dictionary's share of this feature's ~35 new keys.
  //
  // WHY NO SPLIT TAKES ANY OF IT OFF. Every one of those bytes renders on the
  // FIRST paint of a blog home that has folders: the band is above the fold,
  // the nav chips are in the chrome, and a lazily-imported glyph table would
  // paint the row twice. The recovery here is the same scheduled one the entry
  // budget names — splitting the dictionary by language would return ~32 kB to
  // this number, which is more than this whole feature costs.
  //
  // The remaining ~2.4 kB of this round's growth is feature A's dictionary
  // keys (the twenty glyph names and the tree picker's strings), which reach a
  // blog reader only because `t()` reads one object on every surface.
  // …and moved once more with the entry, for the safety net named above
  // (708.4 kB actual → 713.3 kB; 716 is actual + ~0.4%). Same bytes, same
  // argument: the blog closure contains the entry closure.
  // …and moved once more with the entry, for the moments round above
  // (723.8 kB actual → 727, actual + ~0.44%). Same bytes, same argument: the
  // blog closure contains the entry closure. The blog's own share of the
  // round is the loading skeleton that replaced the literal "…" on both public
  // homes (F41), which is one small component and one block of CSS.
  // …and once more for BLOG MOBILE (731.0 kB actual → 735, actual + ~0.55%).
  // This round is the public site's, so unlike the three above it the growth
  // is the blog reader's OWN and none of it is the entry's:
  //
  //   +~3.6 kB  client/styles/blog.css — the 44px pass (F34: this stylesheet
  //             had one coarse-pointer block in 2,100 lines and what it did
  //             was hide a keyboard hint), the phone nav that keeps the
  //             collections out of the burger (F38), the compact phone
  //             collections band, the hairline between the two runs of chip
  //             (F28) and the empty collection page's doors (F29).
  //   +~1.3 kB  client/blog/* — BlogFolder's doors and its topic tally,
  //             NavTopics' separator and its arithmetic, the masthead's h1 on
  //             the home route.
  //   +~0.7 kB  client/banner.ts — the generated gradient's second hash word,
  //             its hue-offset model and the crossed ruling (F42).
  //
  // NONE OF IT SPLITS. A stylesheet is first paint by definition, the nav is
  // above the article, and a card's gradient is drawn before the reader has
  // scrolled anywhere. The by-language dictionary split named above remains
  // the ~32 kB recovery for this number, and it is still worth five of this
  // round.
  // …and once more with the entry, for LINK REPAIR AND TAG RENAME (738.1 kB
  // actual → 740, actual + ~0.26%). Same bytes, same argument the three lines
  // above make: the blog closure contains the entry closure, and the blog
  // reader's OWN share of this round is zero — a visitor cannot rename a tag,
  // and every surface that can is admin-only and in a chunk they never fetch.
  // …and once more with the entry, for THE SEARCH SUITE (742.5 kB actual →
  // budget 745, actual + ~0.3%). Same argument the two rounds above make: the
  // blog closure contains the entry closure, and the blog reader's OWN share is
  // zero — a visitor cannot run a replace, and the operator card and the panel
  // are both sidebar chunks no public page mounts.
  // …and once more with the entry, for THE EDITABLE PROPERTIES CARD (746.2 kB
  // actual → 748, actual + ~0.24%). Same bytes, same argument every line above
  // makes: the blog closure contains the entry closure, and the blog reader's
  // OWN share of this round is exactly zero — the card a visitor sees is the
  // read-only one, and the editing layer is in the editor chunk they never
  // fetch.
  // …and once more for PRINT AND PDF (751.3 kB actual → budget 754, actual
  // + ~0.36%). Unlike the four rounds above it, this growth IS the blog
  // reader's own and every byte of it is deliberate:
  //
  //   +~3.3 kB  client/reading/print.css, inlined into reading.css by the
  //             `@import` at the top of that file. It is the whole of the
  //             product's `@media print` answer — twenty-seven stylesheets
  //             carried none before this release — and it reaches the visitor
  //             because THE VISITOR IS WHO PRINTS AN ARTICLE. A published
  //             piece is printed by people who did not write it, from a page
  //             with no palette and no command on it, using their own Ctrl+P;
  //             a print stylesheet that arrives with an admin chunk would be
  //             absent from the one surface it matters most on.
  //
  // NO SPLIT TAKES IT OFF, and a media-query load is not one either: a
  // `<link media="print">` in the HTML entry is merged into the single entry
  // stylesheet by the build (losing the attribute, so the rules would apply on
  // screen), and a stylesheet fetched at `beforeprint` arrives after the pages
  // are cut. Riding with reading.css is what puts it in exactly the chunks
  // that can show a document and in nobody else's.
  // …and once more with the entry, for PER-DESIGN TYPE (770.0 kB actual → 772,
  // actual + ~0.26%). Almost all of it is the entry's dictionary share named
  // above; this closure's own is two CSS rules and they are worth naming
  // because both are corrections rather than features:
  //
  //   +~0.3 kB  `client/styles/design.css` — one rule pointing `.s-rv-code` /
  //             `.s-rv-pre` inside a designed page at `--dsg-mono-font`. Code
  //             in the author's own prose used to read the INSTANCE's mono
  //             token, which is right for a code block in the editor and a
  //             coincidence on a designed page.
  //   +~0.2 kB  `client/styles/controls.css` — the face-picker trigger's
  //             coarse-pointer floor, 42px → 44px. Pre-existing everywhere the
  //             trigger appears (the settings panel's four slot pickers); it
  //             was found by measuring the designer's three new face rows on a
  //             touch pointer and fixed at the root rather than beside them.
  //
  // The client half of the feature itself is outside this closure entirely:
  // `client/design/designFonts.ts` and the three `<Select>` rows are reached
  // only from the designer panel's own chunk, and the catalog data is in the
  // lazy design chunk.
  // …and once more, for THE CHROME (772.8 kB actual → 774, actual + ~0.16%).
  // This closure's own share of the round is ZERO: the designed shell, its
  // stylesheet and its renderers are not in it, and a visitor reading a post on
  // the stock blog never fetches a byte of a masthead they will not see. The
  // whole movement is the entry's twenty dictionary entries and sixteen bytes
  // of control CSS, both named above, arriving here because this closure
  // contains the entry.
  // …and once more, for THE SCENERY (774.9 kB actual → 776, actual + ~0.14%).
  // This closure's own share is ZERO again, and measurably so: built against
  // HEAD in a scratch tree, the twenty-three files here differ by exactly the
  // entry's +1.6 kB and nothing else. A visitor reading a post on the STOCK
  // blog fetches no part of the designed shell, so five worlds cost them
  // thirteen dictionary keys they will never see rendered.
  // …and again for THE WAY BACK (776.5 kB actual → 778): the entry's six
  // dictionary keys, carried. A visitor never opens the designer.
  // …and again for THE ROOMS (778.1 kB actual → 780): the entry's sixteen keys,
  // carried. The designed shell is not in this closure and never was.
  // …and again for THE SPOTLIGHT and THE GRAPH'S SETTINGS (787.4 kB actual →
  // 790): the entry's thirty keys carried, plus the spotlight itself, which a
  // visitor DOES see — the crown, the veil and the meta line are ~2 kB of
  // engine in hovercard-*.js and ~4 kB in hovercard.css, both in this closure
  // because a post's preview is a blog feature. The graph panel is not here.
  // …and again for THE LIBRARY (803.9 kB actual → 805): the entry's words
  // carried, and this closure's own: the door in the nav row, the home band
  // and the drawn covers (library-band.css, ~4 kB), the shared shelf fetch
  // and the route parser both shells read — the parts every blog page needs
  // to SHOW the library exists. The shelf, the path and the lesson pages
  // are lazy (LibraryPages-*.js) and cost a visitor reading a post nothing.
  // …and again for NOTE ANNOTATIONS (807.4 kB actual → 808): the words, and
  // the small mount that asks /api/annotations and opens the lazy layer only
  // when the answer is not empty.
  // …and again for THE FOLDER GLYPH CATALOG (820.9 kB actual → 824): the
  // enum and the dictionary, as above.
  // …and again for THE TREE'S ARRANGEMENT (825.9 kB actual → 832): the
  // dictionary rows for sorting, pinning, focus, the writing column and the
  // folder verbs.
  // …and again for THE MEDIA PAGE (835.8 kB actual → 840): the dictionary,
  // as above — nothing of the page itself reaches a blog reader.
  // …and again for A WORK'S NOTES (840.5 kB actual → 846): the dictionary and
  // the rendered card's one folder line.
  // …and once more with the entry, for DRAWINGS (844.0 kB actual → 846):
  // the blog reader's own share is the drawing embed kind and the svg's
  // class in the renderer, under a kilobyte; the rest is the entry's.
  // …and again for THE SURFACE LAYER (871.7 kB actual → 874): the entry's
  // share, as above; blog.css read six surface tokens where it read base ones.
  // …and again for THE NAME (875.8 kB actual → 880): the mark, an SVG string
  // drawn from geometry (shared/brandMark.ts) that the blog footer's "powered
  // by" wears beside the new name, and the storage migration that carries a
  // reader's `vellum.*` preferences over to `astrolabe.*`.
  // …and for THE MEDIA TAB AND THE FOLDER NAMES (880.4 kB actual → 884): the
  // workspace model's two virtual-tab sentinels and the Arabic media folder
  // table sit in shared code the reading view already carries.
  // …and for BLOCK ALIGNMENT (886.0 kB actual → 888): the marker reader
  // (shared/blockAlign.ts) that the reading view strips markers with.
  // …and for 3.5.0 (893.0 kB actual → 898): the same entry growth, seen from the
  // blog's closure.
  // …and for 3.6.0 (the site mark on every empty surface, the desktop icon in
  // the store, the app-identity rows: a few kB in each closure)
  // (899.1 kB actual → 912): the desktop's own icon reaches the
  // empty state through the store, and the app-identity rows in the Device tab.
  // 3.11.0: 963.9 kB actual → 968 — the routine model and render.ts's
  // routine branch, both in the reading closure (see the entry note above).
  // 3.12.0: 983.9 kB actual → 988 — three more fence languages in the
  // reading closure (```query, ```tasks, and the block-id pass), each a
  // static PARSER (the fence decision is synchronous) with its renderer and
  // stylesheet lazy, plus the reading renderer's block-id handling and the
  // dictionary's keys for all of it.
  // …and 991.2 → 995 with the same three merges (dictionary blocks).
  // 3.13.0: 1028.5 kB actual → 1032 — the entry growth above; the blog
  // shell itself did not move.
  // 3.15.0: 1038.6 kB actual → 1042 — the entry growth above (orbits); the
  // blog shell itself did not move.
  // 3.16.0: 1043.7 kB actual → 1046 (actual + ~0.2%) — FURIGANA. The entry
  // itself stayed under its own line (the dictionary's fourteen keys and the
  // one `[lang="ja"]` rule fit in what 3.15.1 had left), so what moved the
  // blog closure is the reading renderer's half: the `{漢字|かんじ}` parser
  // (shared/furigana.ts, ~1.1 kB — a span has to be RECOGNISED before the
  // paragraph paints, so it is static), the ruby pass in render.ts and the
  // `lang="ja"` mark, and the ruby rule in reading.css. The readings table
  // (~125 kB), the suggestion code and the popover are lazy and asserted
  // absent above.
  // 3.16.0: 1046.5 kB actual → 1047 after the French/furigana merge (above).
  // 3.16.0 release: 1047.8 kB actual → 1048 (the merge above).
  // 3.16.1: 1049.1 kB actual → 1050 (the row above).
  // 3.16.3: 1050.6 kB actual → 1051 — the sigil card's pushed-forward rows
  // and the reading renderer's share of them.
  // 3.17.0: 1086.0 kB actual → 1087 — the six branches' entry bytes above
  // (1049.1 kB before them), plus what a published page can show and so
  // must carry: the reading surfaces' player builder (reading/audio.ts)
  // and audio-link seek, the page-card host and the mermaid host in
  // render.ts (their bodies are lazy) and the audio, page and diagram rules
  // in reading.css (+5.3 kB over the entry's share); the tracker card's
  // speed line, which reads the fence's `sessions:` block (shared/
  // tracker.ts parses it before the card paints, ~1.5 kB); and the editor
  // branch's plain-text snippet reading (snippet.tsx, ~0.1 kB — the tag
  // card's rules were kept OUT of hovercard.css for this line's sake). The
  // calendar, the vault views and capture added nothing here beyond the
  // dictionary; the sidenote sheet rides reading/sidenotes.css with the
  // reading view's chunk alone.
  // 3.17.0 + 3.16.3: 1087.4 kB actual → 1088 — the sigil card's
  // pushed-forward rows (main's 3.16.3, above) landing on the six branches.
  // 3.18.0: 1088.8 kB actual → 1089 — the entry's "everything travels" bytes
  // (above) and nothing of the blog's own.
  // 3.18.0: 1088.6 kB actual → 1089 — the iron-gall block (entry, above).
  // 3.18 settings in place: 1088.3 kB actual → 1089 — the same dictionary
  // growth as the entry's (the reference text behind the settings ⓘ); the
  // blog reader carries the dictionary and nothing else of the panel.
  // 3.18 the Calendar page: 1092.2 kB actual → 1093 — the entry's bytes
  // (above) and nothing of the blog's own: the blog reader carries the
  // dictionary, never the door or the page.
  // 3.18 overlays and stacking: 1092.049 kB actual → 1093 (actual + ~0.09%).
  // The overage is 49 BYTES and every one of them is the stacking ladder: the
  // fourteen `--z-*` declarations in tokens.css plus eighteen `z-index: 300`
  // literals in app.css becoming `z-index: var(--z-menu)`, which is longer to
  // say and is the point — a number you can read is a number that stops being
  // guessed at. Nothing here is splittable: tokens.css and app.css are the
  // first paint, on every surface, by definition. It is paid for in the same
  // round by the two i18n keys the selection menu gave back, the
  // `.s-treesort__menu` block the sort menu no longer needs, and the menu
  // markup Sidebar deleted when its two hand-rolled menus moved onto
  // ContextMenu — which is why fourteen new tokens cost 49 bytes and not 400.
  // 3.18.0 INTEGRATION: 1093.9 kB actual → 1094 — the entry's Calendar bytes
  // (above) and nothing of the page's own. A visitor has no door to it; only
  // the strings and the tab model reach this reader, because `t()` ships whole.
    // 3.18.0: the phone round (the deck by finger, the panel drawer, touch zoom).
  // 3.18.0 THE PHONE'S SHOULD-HAVES: 1095.0 kB → 1100. The touch floor
  // stopped being a promise and became CSS: one coarse-pointer block per
  // stylesheet raising every shell target to 44px and every field to 16px,
  // the notch and home-indicator insets (`--safe-top` / `--safe-bottom`, app.css),
  // and the two drawers hiding the chrome they cover. It is SHELL css and so
  // it is first-paint css by definition — a 44px rule that arrives in a lazy
  // chunk is a target that resizes under a finger that is already on it.
  // Measured against a build of the same tree without the round: +3.9 kB,
  // which is what this budget moves by and no more. The round's two new
  // modules (backGesture.ts, softKeyboard.ts) cost this reader nothing: both
  // are `import()`ed behind `(pointer: coarse)` from main.tsx, beside swipe.ts.
  // This reader pays a little more than the entry does: the comment form is
  // the one thing a VISITOR types into, and it is on this page.
  // 3.18.x: the shared tags/properties shelf and its tabs.
  // 3.18.1 WINDOWS AND DESKTOP RESIZING: 1098.4 kB actual → 1099. The same
  // +2.3 kB as the entry, arriving here for the same reason — a blog page is
  // the entry plus its own shell — and no more: the zoom chip lives in the
  // lazy StatusBar and the desktop bridge is behind the Electron gate.
  // 3.18.x TABLES EDITED IN PLACE: 1098.8 kB actual → 1099. The entry's
  // thirty-eight dictionary rows (above), and one thing of this closure's
  // own: `renderTableCell` in reading/render.ts, the second door into the
  // table branch that lets the editor's widget redraw ONE cell instead of
  // the table. It is two lines and it ships here because render.ts does; a
  // visitor never calls it, because a visitor has no cell to edit.
  // 3.19.0 COURSE SIGILS: 1103.6 kB actual → 1104 (+7.6 kB). The entry's
  // bytes above, plus this reader's own share of the same round: the reading
  // view's sigil card (client/reading/routine.ts + routine.css) is in the blog
  // closure, because a published note may carry a ```sigil fence and a visitor
  // must see the card — inert, as every control on it already is. The walk
  // reaches this reader through that card, and `shared/course.ts` is why it
  // arrives as one small module the ENTRY still does not carry.
  // 3.19.0 MERGE: the two rounds above land together, so their overages add:
  // 1107.1 kB actual → 1108 — the sum of the course sigils' and the table round's bytes, no new cause.
  // 3.19.0 MERGE, phone round: 1111.2 kB actual → 1112 — the phone round's own lines above
  // (safe-area tokens, the drawers' ✕, the back-button wiring) summed onto the two rounds before it.
{ name: "anonymous blog reader", keys: blog, budget: 1112 * 1024 },
  // RE-BASELINED for PER-FOLDER TREE ICONS (1089.4 kB actual → 1099.4 kB,
  // budget = actual + ~1.1%), and the growth here is almost all feature A's:
  // +3.4 kB FolderGlyph (now a shared chunk, since the sidebar and the blog
  // both draw marks), +1.2 kB Sidebar (the glyph slot, the context-menu item
  // and the picker's mount), and the dictionary's share of both features'
  // keys. A folder mark is drawn on the first paint of the tree, so none of it
  // is splittable either; the dictionary split is the recovery for this number
  // as much as for the two above it.
  // …and once more with the entry, for the safety net (1111.4 kB actual →
  // 1116.3 kB; 1120 is actual + ~0.3%).
  // …and once more with the entry, for the moments round (1128.7 kB actual →
  // 1133, actual + ~0.38%). The admin's own share on top of the entry's is the
  // empty-vault invitation in the sidebar chunk and the settings panel's
  // arrive-at-a-row effect — both in chunks the admin already loads.
  // …and once more with the entry, for NOTE HISTORY (1136.0 kB actual → 1142,
  // actual + ~0.5%). Same bytes, same argument: the admin closure contains the
  // entry closure, and the admin's own share on top of it is zero — the
  // history panel and its stylesheet are a dynamic import, so they are in
  // neither closure until the reader opens the section.
  // …and once more with the entry, for LINK REPAIR AND TAG RENAME (1143.3 kB
  // actual → 1146, actual + ~0.24%). The admin's own share on top of the
  // entry's is the two client modules named there — the tag dialogs in the
  // sidebar chunk and the bulk toasts beside them — which together are under a
  // kilobyte and arrive with surfaces the admin has already loaded.
  // …and once more with the entry, for THE SEARCH SUITE (1149.5 kB actual →
  // 1152, actual + ~0.22%). Same bytes, same argument once more: the admin's
  // own share on top of the entry's is the sidebar chunk's two new mounts —
  // the operator button and the replace toggle, a few hundred bytes — while
  // the panel, the card, the query grammar and the stylesheet are all dynamic
  // imports that are in neither closure until something is opened.
  // …and once more, for THE EDITABLE PROPERTIES CARD (1158.0 kB actual → 1162,
  // actual + ~0.35%) — and this is the ONE of the three numbers with a real
  // feature in it. ~4.9 kB of `client/editor/propsEdit.ts` lands in the editor
  // chunk, which the admin's first paint contains because the admin's first
  // paint is an editor. It is not splittable any further and should not be: the
  // card is drawn by the first note that opens, so a dynamic import here would
  // buy a spinner where a property row belongs. The remaining ~1.1 kB is the
  // entry's, named above.
  // …and once more, for PRINT AND PDF (1163.1 kB actual → 1168, actual
  // + ~0.42%). The whole of this round's growth is the SAME ~3.3 kB print
  // stylesheet the blog line above names, and it lands here because
  // `components/BacklinksPanel.tsx` — an app-shell root — already carries
  // reading.css: the outline pane and the local graph are in `client/reading/`
  // and the panel is drawn on the first paint. `client/print.ts` itself is NOT
  // in this number: it is loaded by Editor.tsx and ReadingView.tsx, both behind
  // the pane's lazy boundary, and reached from the palette by `import()`.
  // …and once more with the entry, for THE STRUCTURES (1178.4 kB actual →
  // 1180, actual + ~0.14%). Measured, the admin's own share of this round is
  // rounding: the growth is the entry's twenty-four dictionary entries, named
  // above, and nothing else. The five section layouts, the five card shapes,
  // the three hero treatments, the ornament and the miniature that draws all
  // of them are in the design chunk and the designer panel's chunk — an admin
  // pays for them when they OPEN the designer, which is the one moment they
  // are looking at exactly those controls.
  // …and once more, for THE CHROME (1180.1 kB actual → 1182, actual + ~0.16%),
  // and the admin's own share is rounding for the same reason it was last
  // round: the four new controls are in `DesignerPanel-*.js`, the rules that
  // draw the mastheads and the grounds are in `design-*.css`, and both are
  // behind the door an admin opens when they are looking at exactly those
  // controls. What moved on the FIRST paint is the entry, named above.
  // …and once more, for THE SCENERY (1182.1 kB actual → 1184, actual + ~0.16%),
  // and the admin's own share is rounding for the third round running: the two
  // new controls are in `DesignerPanel-*.js`, the rules that draw the five
  // worlds are in `design-*.css`, the five new designs are in
  // `presetCatalog-*.js`, and all three are behind the door an admin opens when
  // they are looking at exactly those things. Measured against a HEAD build:
  // 1180.6 → 1182.1, which is the entry's +1.5 kB carried here and nothing of
  // this closure's own.
  // …and again for THE WAY BACK (1183.0 kB actual → 1185): the same six keys.
  // The bar is in DesignerPanel-*.js, behind the door it is a control on.
  // …and again for THE ROOMS (1184.6 kB actual → 1187): the same sixteen keys.
  // …and again for THE SPOTLIGHT and THE GRAPH'S SETTINGS (1189.6 kB actual →
  // 1192): the entry's thirty keys and the hover engine's growth, carried; the
  // panel, its stylesheet and graphPrefs.ts are in GraphView-*.js, behind the
  // graph's own door.
  // …and again for THE LIBRARY (1195.8 kB actual → 1197): the entry's words
  // and the door, carried; the settings editor's rows are in the modal's
  // chunk, and the pages in their own.
  // …and again for NOTE ANNOTATIONS (1197.7 kB actual → 1199): the words.
  // …and again for THE FOLDER GLYPH CATALOG (1211.3 kB actual → 1216): the
  // enum, the dictionary, the tree's Library row.
  // …and again for THE TREE'S ARRANGEMENT (1223.5 kB actual → 1232): the
  // sidebar's sort menu, pinned area, selection, group drags and focus, plus
  // the pane grips and the draggable graph panel.
  // …and again for THE MEDIA PAGE (1234.8 kB actual → 1240): the dictionary,
  // the status bar's one more door and the palette's row.
  // …and again for A WORK'S NOTES (1245.0 kB actual → 1252): the panel
  // section and its styles, as above.
  // …and once more with the entry, for DRAWINGS (1244.2 kB actual → 1247):
  // the sidebar's pencil glyph and its menu row, the prompt (which loads the
  // format module on use, not on paint), and the entry's share.
  // …and the two rounds together (A WORK'S NOTES and DRAWINGS landed as one
  // merge): entry 614, blog 852, admin 1260 — each the two additions above
  // stacked, with the same slack, measured after the merge.
  // …and again for THE SURFACE LAYER (1280.2 kB actual → 1284): the entry's
  // share plus the builder's filter, group reset and labelled rows.
  // …and again for THE NAME (1285.0 kB actual → 1290): the mark in the
  // wordmark and the sign-in modal, the storage migration, the two legacy
  // header spellings.
  // …and for 3.2.0 (1292.2 kB actual → 1296): the tags shelf grip, the media
  // tab's status-bar and router wiring, the drawings-folder setting row.
  // …and for 3.3.0 (1306.6 kB actual → 1310): the empty properties card, the
  // known-keys list in the add form, the custom width field and the picture
  // tools' strings.
  // …and for 3.5.0 (1314.7 kB actual → 1320): the entry growth above, plus the
  // desktop session-ownership flag in the status bar.
  // …and for 3.6.0 (1322.6 kB actual → 1330): the same.
  // 3.11.0: 1392.3 kB actual → 1398 — the same bytes as the blog closure
  // plus the status bar's door and the store's routines tab.
  // 3.12.0: 1418.9 kB actual → 1424 — the blog closure's bytes plus the
  // right panel's two new sections (unlinked mentions, on this day), the
  // periodic-note settings rows and the palette's new doors.
  // …and 1428.0 → 1432 with the same three merges, plus the History panel's
  // version rows and the sidebar's book-hit row.
  // 3.13.0: 1470.5 kB actual → 1474 — the entry growth above, plus the
  // sidebar's bookmarks rows and tag tree, the layout picker, the palette's
  // new doors (save/restore layout, bookmark, review, unused attachments),
  // the status bar's routines door and the shell's offline strip. The
  // Review page, the scripture chunk and the harakat palette are lazy.
  // 3.15.0: 1482.1 kB actual → 1486 — the entry growth above (orbits), plus
  // the status bar's new door glyph and the workspace's legacy-tab fold.
  // The Sigils page, its form and the known-field table stay lazy.
  // 3.16.0: 1488.6 kB actual → 1491 — the blog closure's bytes above, plus
  // the palette's two furigana rows. The editor's side (the ruby widget,
  // the menu row, the door in editor/furigana.ts) rides the editor chunk,
  // which is not a first paint.
  // 3.16.0: 1491.4 kB actual → 1492 after the French/furigana merge (above).
  // 3.16.0 release: 1493.4 kB actual → 1494 (the merge above).
  // 3.16.1: 1494.6 kB actual → 1495 (the row above).
  // 3.16.3: 1496.1 kB actual → 1497 (the rows above, plus client/morph.ts).
  // 3.17.0: 1543.6 kB actual → 1545 — the blog closure's bytes above
  // (1494.6 kB before the six branches), plus the admin's own share of
  // each: the sidebar's Calendar section (its fold, the one fetch that
  // marks the days a sigil logged, and the visitor rule) and the palette's
  // two period rows (calendar, ~1.8 kB); the tag shelf's hover installer,
  // which waits for the first pointer or focus on the list and takes the
  // tagPreview chunk and its stylesheet off every boot, and the status
  // bar's selection phrase (editor, ~1.2 kB); the outline pane's Footnotes
  // section (FootnotesPanel.tsx, shared/footnotes.ts, its rows in app.css),
  // the editor's footnote hop and the page card, which the live preview's
  // widget imports directly (reading surfaces, ~7.6 kB); the two Suspense
  // mounts for the properties shelf and Nearby (vault views, ~1 kB); the
  // palette's "Review the week" row and the Sigils page's last-weekday line
  // (sessions, ~0.3 kB); and nothing from capture — its palette and
  // shortcut rows ride their own lazy chunks. The grid, the periodic
  // sub-form, the tag card, the shelf, the Nearby list, the graph's query
  // rows, the review page, the session clock, the highlights writer and
  // the capture sheet are all lazy and asserted absent below.
  // 3.17.2: 1545.1 kB actual → 1546 — the Sigils masonry (two hooks) and the
  // wider emoji shelf.
  // 3.18.0: 1546.4 kB actual → 1547 — the entry's "everything travels" bytes
  // (above); the travel row itself rides the settings chunk.
  // 3.18.0: 1546.3 kB actual → 1547 — the iron-gall block (entry, above).
  // 3.18.0: 1547.5 kB actual → 1548 — the status bar's frame crumb (the
  // focused surface's name through Tabs.tsx titleOf), the calendar's
  // tracker marks in the sidebar (one more GET, loggedDaysOf), the resolved
  // list/table direction in render.ts and the editor's logical line inset.
  // 3.18 the Calendar page: 1552.7 kB actual → 1553 — the entry's bytes
  // (above) plus the status bar's own: one more `useStore` selector and the
  // button's markup. The grid stayed lazy; Sidebar.tsx got SMALLER, its
  // `useLoggedDays` having moved to the shared client/loggedDays.ts the
  // page asks through too.
  // 3.18.0 INTEGRATION: 1551.8 kB actual — BACK TO 1552, the number 3.17.3
  // left. The calendar branch measured 1552.7 against its own base and moved
  // this to 1553; merged, the round comes in UNDER 1552, so there is no
  // overage to pay for and the budget does not move. (A budget is raised by
  // the actual overage with the cause beside it, never by the largest number
  // any branch happened to need on the way here — a rung left loose is a rung
  // the next round spends without measuring.) This reader carries the status
  // bar's door, which the other two have no status bar for; Sidebar.tsx gave
  // back more than that when `useLoggedDays` moved out to
  // client/loggedDays.ts.
  // 3.18.1 WINDOWS AND DESKTOP RESIZING: 1555.1 kB actual → 1556. +1.1 kB,
  // less than the entry's because the admin paint already carried the pane
  // machinery; the difference is the grips' own markup and the zoom chip.
  // 3.18.0 THE PHONE'S SHOULD-HAVES: 1553.7 kB → 1558. The touch floor
  // stopped being a promise and became CSS: one coarse-pointer block per
  // stylesheet raising every shell target to 44px and every field to 16px,
  // the notch and home-indicator insets (`--safe-top` / `--safe-bottom`, app.css),
  // and the two drawers hiding the chrome they cover. It is SHELL css and so
  // it is first-paint css by definition — a 44px rule that arrives in a lazy
  // chunk is a target that resizes under a finger that is already on it.
  // Measured against a build of the same tree without the round: +3.6 kB,
  // which is what this budget moves by and no more. The round's two new
  // modules (backGesture.ts, softKeyboard.ts) cost this reader nothing: both
  // are `import()`ed behind `(pointer: coarse)` from main.tsx, beside swipe.ts.
  // The admin carries the most of it: the drawer's chrome, the outline
  // drawer's rows, the tab strip and the status bar are this reader's alone.
  // 3.18.x TABLES EDITED IN PLACE: 1555.2 kB actual → 1556. The entry's
  // thirty-eight dictionary rows and `tableActions.ts` (above), plus the
  // palette's six rows and their dispatch arms. The table editor itself is
  // in the editor chunk — which is asserted ABSENT from this closure at the
  // top of this file — and the picker is its own lazy chunk, so what an
  // admin downloads before their first note appears is the words and the
  // wire, not the feature.
  // 3.19.0 COURSE SIGILS: 1560.0 kB actual → 1561 (+6.0 kB; the actual is a
  // few bytes over 1560 · 1024, so the whole kB above it is the budget). The blog
  // reader's bytes above and nothing of the admin's own: the Sigils page, the
  // Calendar page and the sigil form all GREW for this round, and all three
  // are lazy chunks this first paint does not fetch.
  // 3.19.0 MERGE: the two rounds above land together, so their overages add:
  // 1563.5 kB actual → 1564 — the sum of the course sigils' and the table round's bytes, no new cause.
  // 3.19.0 MERGE, phone round: 1567.2 kB actual → 1568 — the phone round's own lines above
  // (safe-area tokens, the drawers' ✕, the back-button wiring) summed onto the two rounds before it.
  { name: "admin first paint", keys: app, budget: 1568 * 1024 },
];

// ── things that must never be in a first paint ──────────────────────────────
// Matched against the manifest KEY (a source path), so this survives content
// hashes changing on every build.
const FORBIDDEN = [
  { label: "the CodeMirror editor", test: (k) => /Editor[-.]/.test(k) || /components\/Editor\.tsx$/.test(k) },
  { label: "KaTeX", test: (k) => /node_modules\/katex\/dist\/katex\.mjs$/.test(k) },
  { label: "the vim keymap", test: (k) => /@replit\/codemirror-vim/.test(k) },
  // GraphView only — NOT LocalGraph, and the difference is the whole point of
  // `components/graphColors.ts`. The backlinks panel draws a note's own
  // neighborhood on every admin paint by design, so LocalGraph is first-paint
  // code and always was. What must stay out is the FULL vault graph: the
  // force-directed simulation, its shade tables and its HUD, which only the
  // graph view mounts. Naming both here made the rule unsatisfiable by any
  // build that shipped the panel, which is a rule that gets deleted rather
  // than obeyed. The colour helpers the two share live apart precisely so
  // LocalGraph can be reached without dragging the simulation behind it.
  { label: "the graph engine", test: (k) => /components\/GraphView\.tsx$/.test(k) },
  { label: "CodeMirror core", test: (k) => /@codemirror\/(view|state|language)\//.test(k) },
  { label: "a CodeMirror language grammar", test: (k) => /@lezer\/|@codemirror\/(lang-|legacy-modes)/.test(k) },
  // pdf.js is the heaviest dependency in the tree by a wide margin — ~1.1 MB
  // of library on top of a ~1.3 MB worker — and it exists for ONE surface,
  // which most sessions never open. Two rules, because there are two ways to
  // undo the split and they look nothing alike:
  //
  //   · the engine itself, which comes back the moment anyone writes
  //     `import { getDocument } from "pdfjs-dist"` outside
  //     client/books/pdfjs.ts (that file is reached only through `import()`);
  //   · the reader's own modules, which come back the moment anyone imports
  //     a component or a helper out of client/books/ from the app shell.
  //     `client/books/door.ts` is the deliberate exception and the reason
  //     the rule names the surface files rather than the directory: it is the
  //     door the sidebar, the router and the editors hold — URL parsing, a
  //     tree walk and a store call — and everything behind it is dynamic
  //     (Pane.tsx mounts BooksSurface through React.lazy).
  { label: "pdf.js", test: (k) => /node_modules\/pdfjs-dist\//.test(k) },
  {
    label: "the book reader",
    test: (k) => /books\/(BooksSurface|BookReader|BookLibrary|render|covers|pdfjs)\.tsx?$/.test(k),
  },
  // Excalidraw is the other whole editor in the tree, and it exists for one
  // surface too. It is reached only through two `import()`s — the pane's lazy
  // DrawingSurface and the reading view's owner-only fallback in
  // client/drawing/renderEmbed.ts — and the shared parser the indexer and the
  // embeds use (shared/drawing.ts) deliberately imports none of it.
  { label: "Excalidraw", test: (k) => /node_modules\/@excalidraw\//.test(k) },
  { label: "the drawing surface", test: (k) => /drawing\/(DrawingSurface|renderEmbed)\.tsx?$/.test(k) },
  // The Quran text: 1.3 MB of Uthmani script (client/data/quran-uthmani.json)
  // that exactly one callout kind needs, reached only through the dynamic
  // `import("./ayah.ts")` in client/reading/render.ts's callout branch. Two
  // ways to undo the split, so two patterns: the data module itself, and the
  // one module that imports it statically — which comes back into a first
  // paint the moment someone imports `renderAyahText` from ayah.ts rather
  // than through render.ts. The reference grammar (shared/quranRefs.ts, a few
  // kB) is first-paint on purpose: the callout must be RECOGNISED before it
  // is drawn, or an unparseable reference would paint a verse box and turn
  // back into a quote.
  { label: "the Quran text", test: (k) => /data\/quran-uthmani\.json$/.test(k) || /reading\/ayah\.ts$/.test(k) },
  // The kanji readings table: ~100 kB of KANJIDIC2 (shared/data/
  // kanjiReadings.json) that only the furigana popover and the automatic
  // command read, through the one dynamic import in client/editor/furigana.ts.
  // The popover (components/FuriganaPopover.tsx) is behind the same door.
  { label: "the kanji readings table", test: (k) => /data\/kanjiReadings\.json$/.test(k) },
  { label: "the furigana popover", test: (k) => /components\/FuriganaPopover\.tsx$/.test(k) },
  // Mermaid: a megabyte of diagram grammars for the ```mermaid fence, reached
  // only through render.ts's `import("./mermaid.ts")`. Two patterns for the
  // two ways back in — the library, and the one module that imports it.
  // (Excalidraw's own mermaid door lives inside its forbidden chunk.)
  { label: "mermaid", test: (k) => /node_modules\/mermaid\//.test(k) || /reading\/mermaid\.ts$/.test(k) },
  // The page painter behind `![[Book.pdf#page=42]]`: it imports pdf.js, and
  // is reached only through reading/pdfPage.ts's `import()`.
  { label: "the book page painter", test: (k) => /books\/pageImage\.ts$/.test(k) },
];

// ── surfaces that must remain separately loadable ───────────────────────────
const MUST_SPLIT = [
  "blog/BlogShell.tsx",
  "components/GraphView.tsx",
  "components/Sidebar.tsx",
  "components/SettingsModal.tsx",
  "reading/ReadingView.tsx",
  // The books surface. Its own chunk, and the parent of two more (the shelf
  // and the reader split from each other inside it) — see BooksSurface.tsx.
  "books/BooksSurface.tsx",
  // The tour. Fifteen folios, fifteen drawings and two languages of prose —
  // ~30 kB of chunk to describe a product to somebody who has not asked yet.
  // Its four doors (the palette, the empty state, the shortcut sheet, and the
  // deck's own re-entry) all live in first-paint surfaces, so the ONLY thing
  // standing between the deck and everybody's entry chunk is the dynamic
  // import in client/tour.ts. That is exactly the kind of boundary a later
  // refactor removes by accident, so it is asserted here rather than trusted.
  "components/Tour.tsx",
  // The Media page: the shelves, the form and their stylesheet, behind the
  // status bar's button. A workspace view like the graph, and split like it.
  "media/MediaView.tsx",
  // The Sigils page, on the same terms as the Media page.
  "routines/RoutinesView.tsx",
  // Orbits (the shelf and the session, one chunk), on the same terms.
  "orbits/OrbitsSurface.tsx",
  // The weekly review, on the same terms: a tab behind the palette and
  // the Sigils page's last-weekday line, with its own stylesheet.
  "review/ReviewWeekView.tsx",
  // The Calendar page, on the same terms: the month grid, the day pane, the
  // agenda model and calendarpage.css behind the status bar's door. The
  // SIDEBAR's small grid keeps its own boundary behind the section's fold.
  "calendar/CalendarView.tsx",
  // The "What's new" deck: slides, live demos and prose for every release,
  // behind a door (whatsnew/door.ts) that is a version compare and nothing else.
  "whatsnew/WhatsNew.tsx",
  // The drawing surface: Excalidraw whole, the largest chunk in the product,
  // behind a tab that opens only when a drawing does. The renderer's owner
  // fallback (renderEmbed.ts) is a second door into the same vendor chunk,
  // and both are asserted absent from every first paint by the FORBIDDEN
  // rule below.
  "drawing/DrawingSurface.tsx",
  // The verse chunk: the Quran text and the one module that draws from it,
  // behind render.ts's `import("./ayah.ts")`. Asserted split AND forbidden
  // from every first paint above — a boundary this large is asserted twice.
  "reading/ayah.ts",
  // The diagram chunk (mermaid, behind render.ts's fence branch) and the
  // page painter (pdf.js, behind the page card): asserted split AND
  // forbidden above, on the verse chunk's argument.
  "reading/mermaid.ts",
  "books/pageImage.ts",
];

let failed = false;
const fail = (msg) => {
  console.error(`  FAIL  ${msg}`);
  failed = true;
};

console.log("check-bundle: first-paint budgets\n");
for (const audience of AUDIENCES) {
  const files = filesOf(audience.keys);
  const size = bytes(files);
  const ok = size <= audience.budget;
  console.log(
    `  ${ok ? "ok  " : "FAIL"}  ${audience.name.padEnd(24)} ${kb(size).padStart(10)}  (budget ${kb(audience.budget)}, ${files.size} files)`,
  );
  if (!ok) failed = true;
  for (const rule of FORBIDDEN) {
    const hit = [...audience.keys].find(rule.test);
    if (hit) fail(`${rule.label} is in "${audience.name}" via ${hit}`);
  }
}

console.log("\ncheck-bundle: surfaces still split");
for (const src of MUST_SPLIT) {
  const key = keyFor(src);
  const entryFor = key ? manifest[key] : undefined;
  if (!entryFor) {
    fail(`${src} has no chunk of its own — the lazy boundary is gone`);
    continue;
  }
  if (entry.has(key)) {
    fail(`${src} is a STATIC import of the entry — it will load for everyone`);
    continue;
  }
  console.log(`  ok    ${src.padEnd(34)} ${entryFor.file}`);
}

// The editor is the one chunk whose absence from BOTH shells is the whole
// point of the exercise, so it gets said out loud.
const editorKey = Object.keys(manifest).find(
  (k) => /Editor[-.]/.test(k) && manifest[k].file.endsWith(".js"),
);
if (!editorKey) fail("no editor chunk in the manifest at all");
else console.log(`  ok    editor chunk                       ${manifest[editorKey].file} (${kb(bytes([manifest[editorKey].file]))})`);

// ── the version the entry carries ───────────────────────────────────────────
// vite.config.ts bakes package.json's version into the entry as
// `__APP_VERSION__`, and client/state.ts compares it with /api/me's `version`
// to toast "Astrolabe X is now on the server; reload". That toast is only as
// honest as the bake: 3.9.0's bundle was built at 09:22 with the version still
// reading 3.8.2, the bump landed at 09:27, and nobody rebuilt — so every tab
// on the new build was told, forever and after every reload, that it was the
// old one. A dist whose entry does not carry the CURRENT package version is a
// dist that was built before the last bump, and must not ship.
{
  const pkgVersion = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
  const entryFile = manifest["index.html"]?.file;
  const entrySrc = entryFile ? readFileSync(path.join(dist, entryFile), "utf8") : "";
  if (!entrySrc.includes(JSON.stringify(pkgVersion))) {
    fail(`the entry chunk does not carry package.json's version ${pkgVersion} — rebuild after bumping (npm run build)`);
  } else {
    console.log(`  ok    entry carries version ${pkgVersion}`);
  }
}

// The service worker (scripts/build-sw.mjs) is a second build step after
// vite's, and a dist made with a bare `vite build` has none — or last
// release's. Either ships a site that cannot be read offline, or one that
// caches under the wrong version's name.
{
  const pkgVersion = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
  const swPath = path.join(dist, "sw.js");
  const swSrc = existsSync(swPath) ? readFileSync(swPath, "utf8") : "";
  if (!swSrc.includes(JSON.stringify(pkgVersion))) {
    fail(`dist/sw.js is missing or built for another version — run npm run build, not vite build alone`);
  } else {
    console.log(`  ok    sw.js carries version ${pkgVersion}`);
  }
}

console.log(failed ? "\nBUNDLE BUDGET FAILED" : "\nBUNDLE OK");
process.exit(failed ? 1 : 0);
