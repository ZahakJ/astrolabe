import { create } from "zustand";
import * as api from "./api.ts";
import { collectNotes, resolveLink } from "./editor/links.ts";
import { SEED_GUIDE } from "../shared/seed.ts";
import { t } from "./i18n.ts";
// Localization the shell pushes into plain modules rather than into the store:
// the calendar (client/dates.ts), the note-prose layout defaults
// (client/textLayout.ts) and the tag-label map (client/tagLabels.ts). Same
// shape as setLang above — imperative DOM (the properties card, the editor's
// decorations, the blog nav's measuring pass) has no store to subscribe to.
// TYPE ONLY, and it has to stay that way. shared/folderIcons.ts carries the
// twenty drawings, and this module is in the entry closure that EVERY session
// downloads — the anonymous blog reader included. Importing one validator from
// it put four kilobytes of path data into that download to render pages with
// no folder glyphs on them (check-bundle caught it at +6.5 kB on the entry).
// A type import is erased; nothing here needs a value from that module.
import type { Lang } from "./i18n.ts";
import { readEditorLang } from "./langPref.ts";
import { activeTabOf, allPaths, setPaneMode as setPaneModeIn, fromStoredTabs, isBookPath, isDrawingPath, isVirtualTab, phoneWorkspace, paneAt, parseWorkspace, pruneWorkspace, type Workspace } from "./workspace.ts";
import { IS_DESKTOP } from "./desktop/bridge.ts";
import { recentNotes } from "./recents.ts";
import { clearStoredPreview, persistTabs, persistWorkspace, readReading, readRelativeLines, readSidebarSidePref, readStoredTabs, readStoredWorkspace, readTheme, readVim } from "./state/persistence.ts";
import type { SidebarSide, State } from "./state/types.ts";
import { applyTheme } from "./state/dom.ts";
import type { StoreCtx } from "./state/sliceTypes.ts";
import { effectiveSide } from "./state/helpers.ts";
import { fieldsSlice } from "./state/fieldsSlice.ts";
import { notesSlice } from "./state/notesSlice.ts";
import { prefsSlice } from "./state/prefsSlice.ts";
import { sessionSlice } from "./state/sessionSlice.ts";
import { workspaceSlice } from "./state/workspaceSlice.ts";
export type { SurfaceView } from "./state/helpers.ts";
export type { SidebarSide, SidebarSidePref, View, TabDropDest, State } from "./state/types.ts";
export { hasPanelPreference } from "./state/persistence.ts";

/** Every built-in theme, and its identity, live in `client/themes.ts` — the
 *  list outgrew the store at fifteen and stands at twenty-one, and three
 *  surfaces outside the store read it (the theme picker, the palette's
 *  per-theme commands, the settings panel). Re-exported here so the store's published surface is
 *  unchanged for everything that already imports THEMES/Theme from state. */
export { THEMES, isTheme, counterpartTheme } from "./themes.ts";
export type { Theme } from "./themes.ts";
/** The store's theme is a CHOICE, not a built-in: one of the built-in ids, or
 *  a `custom:<slug>` naming an override layer in the design store
 *  (shared/customTheme.ts). Everything that only ever handled the built-ins
 *  keeps working — `Theme` is unchanged and still re-exported above — and the
 *  surfaces that must cope with both ask client/themes.ts's choiceGroup /
 *  counterpartChoice / choiceBase instead of the built-in-only functions. */
export type { ThemeChoice } from "./themes.ts";

/** The edge "auto" means in this language: the direction's leading one.
 *  Exported because the Settings → Appearance row has to name the edge *Auto*
 *  would land on, which is NOT the same as `sidebarSide`: with the pane pinned
 *  left on an Arabic instance the resolved side is "left" while choosing Auto
 *  would move it right, so a note reading off the resolved value describes the
 *  pin rather than the option it sits on. */
export function defaultSide(lang: Lang): SidebarSide {
  return lang === "ar" ? "right" : "left";
}

/** THE PHONE SHELL IS MOUNTED (client/phone/PhoneShell.tsx). Two things
 *  follow, both enforced here rather than in the shell so that no call site
 *  can forget them:
 *
 *    1. every workspace the store commits is collapsed to one pane holding one
 *       tab (`mirrorOf` → `phoneWorkspace`), because the phone has no strip to
 *       show a second tab in and no grips to show a second pane;
 *    2. the workspace is NEVER PERSISTED — not to `astrolabe.workspace`, not to
 *       `astrolabe.tabs`, not to the desktop's copy beside the vault. The
 *       desktop's arrangement (four panes, eleven tabs, a pinned book) is the
 *       reader's, and a phone that opened one note must not overwrite it with
 *       "one note". prefsSync.ts refuses the key as well (NEVER_TRAVELS), so
 *       it cannot leave through the preferences either.
 *
 *  Set before the first render by client/main.tsx and flipped when a resize or
 *  a rotation swaps shells. */
let phoneShell = false;

export function phoneShellMode(): boolean {
  return phoneShell;
}

/** Enter or leave the phone shell's rules. Leaving hands the desktop its own
 *  stored arrangement back — the phone never wrote over it — with whatever
 *  note the phone was on opened in the focused pane. */
export function setPhoneShellMode(on: boolean): void {
  if (phoneShell === on) return;
  phoneShell = on;
  const s = useStore.getState();
  if (on) {
    useStore.setState(mirrorOf(s.workspace));
    return;
  }
  const here = s.openPath;
  const stored = s.authReady ? readStoredWorkspace() : null;
  if (stored !== null) {
    const existing = new Set(collectNotes(s.tree).map((n) => n.path));
    useStore.setState(mirrorOf(pruneWorkspace(stored, existing)));
    if (here !== null) useStore.getState().openNote(here);
  }
}

/** The persistence rule the phone shell is held to, as a function a test can
 *  call: nothing about the workspace is written while the phone is mounted. */
export function workspacePersists(): boolean {
  return !phoneShell;
}

/** The derived mirror: what `openTabs` and `openPath` mean once there is more
 *  than one pane.
 *
 *  `openTabs` is the FOCUSED pane's list, because the tab bar draws that pane.
 *  `openPath` is its active tab — unless that tab is a BOOK, in which case it
 *  falls back to `noteFocus`. That fallback is the whole reason `noteFocus`
 *  exists: `StatusBar` fires `getNote(openPath)` on every change and would 400
 *  on every `.pdf`, and `router.ts` would push a PDF into the address bar as if
 *  it were a permalink. A book pane can hold the keyboard; it cannot be "the
 *  open note". */
export function mirrorOf(
  wsIn: Workspace,
): Pick<State, "workspace" | "openTabs" | "openPath" | "readingMode"> {
  // THE PHONE SHELL'S ONE RULE, applied where every open ends up: one pane,
  // one tab, replaced (client/workspace.ts phoneWorkspace).
  const ws = phoneShell ? phoneWorkspace(wsIn) : wsIn;
  const pane = paneAt(ws, ws.focus);
  const openTabs = pane === null ? [] : pane.tabs.map((t) => t.path);
  // The focused pane's mode, mirrored for the ~dozen readers that ask "is the
  // note being read or written" and have no business knowing about panes.
  const readingMode = pane !== null && pane.mode === "reading";
  const here = pane === null ? null : activeTabOf(pane);
  // A drawing is a picture in a tab, like a book: it is never "the open note"
  // (the outline, the word count and the publish pill have nothing to say
  // about a canvas), so the mirror looks past it to the nearest note.
  if (here !== null && !isBookPath(here.path) && !isDrawingPath(here.path) && !isVirtualTab(here.path)) {
    return { workspace: ws, openTabs, openPath: here.path, readingMode };
  }
  const noteHome = paneAt(ws, ws.noteFocus);
  const note = noteHome === null ? null : activeTabOf(noteHome);
  // `openPath` is a NOTE by contract. When the only thing open anywhere is a
  // book, `noteFocus` still points at that pane and its active tab is the
  // book — and mirroring the .pdf here sent the outline and the word count
  // asking /api/note for it, a 400 on every book-only window.
  return {
    workspace: ws,
    openTabs,
    openPath:
      note === null || isBookPath(note.path) || isDrawingPath(note.path) || isVirtualTab(note.path)
        ? null
        : note.path,
    readingMode,
  };
}

// ── Our own writes ──────────────────────────────────────────────────────────
//
// Every write this client makes comes back to it as an SSE "changed" event,
// and App's handler has to tell that echo apart from somebody editing the file
// in Obsidian. It used to do that from ONE side — a publish toggle and a
// banner set stamped a timestamp here, and an ordinary autosave was recognised
// only AFTERWARDS, by watching `dirty` fall from true to false.
//
// THAT WAS TOO LATE, AND NOT BY A LITTLE. The server writes the file and
// notifies its subscribers before it answers the PUT, so the echo overtakes
// the response: measured on this vault, the SSE frame landed at t=4237ms and
// the PUT resolved at t=4239ms. In those two milliseconds `dirty` is still
// true and no save has yet "finished", which is exactly the state the handler
// reads as an external edit — so every autosave, on every note, raised
// "changed on disk — your unsaved edits were kept" about the reader's own
// typing. The alarm that exists to report a conflict was reporting the
// reader to themselves.
//
// So a write is claimed BEFORE it is sent, by the code that sends it, and it
// is claimed PER PATH: a save to one note must not swallow a genuine external
// change to another. The publish and banner paths already had the instinct
// (their comment says "SSE echo arrives before the response"); this is that
// instinct made general and moved to the one place every writer can reach.
const selfWrites = new Map<string, number>();

/** "This client is writing `path` right now." Call it immediately BEFORE the
 *  request, never after it resolves. */
export function markSelfWrite(path: string): void {
  const now = Date.now();
  selfWrites.set(path, now);
  // Bounded opportunistically: a session that edits hundreds of notes must not
  // grow this forever, and anything older than a minute can answer no.
  if (selfWrites.size > 64) {
    for (const [p, at] of selfWrites) if (now - at > 60_000) selfWrites.delete(p);
  }
}

/** True when this client wrote `path` within `windowMs` — the test App's SSE
 *  handler asks before calling a "changed" event somebody else's edit. */
export function recentSelfWrite(path: string, windowMs: number): boolean {
  const at = selfWrites.get(path);
  return at !== undefined && Date.now() - at < windowMs;
}

export const useStore = create<State>()((set, get) => {
  const initialTheme = readTheme();
  applyTheme(initialTheme);
  // Every boot starts OUT of preview (see clearStoredPreview).
  clearStoredPreview();
  api.setPreviewVisitor(false);

  /** OPEN ON LAUNCH (shared/launch.ts), on top of whatever `enterVault`
   *  restored. Admin only — the doors are the admin's tools and a note
   *  path is a vault path — and never over a deep link, which the router
   *  applies right after bootstrap and which outranks everything else here.
   *  The session is restored FIRST, so the door opens as one more tab in
   *  front of the reader's own and nothing they had open is lost to it. */
  const openLaunchDoor = (): void => {
    const s = get();
    const launch = s.launch;
    if (!s.admin || launch === "resume") return;
    if (location.pathname !== "/" && location.pathname !== "/graph") return;
    if (launch === "sigils") s.setView("sigils");
    else if (launch === "today-page") s.setView("today");
    else if (launch === "orbits") s.openOrbits(null);
    else if (launch === "today") {
      // Dynamic, not static: client/daily.ts imports this store, and the
      // store must not grow a load-time dependency on a feature module.
      void import("./daily.ts").then((m) => m.openDailyNote());
    } else {
      const path = resolveLink(launch, s.tree);
      if (path) s.openNote(path);
      else console.warn(`astrolabe: launch note "${launch}" not found in the vault`);
    }
  };

  /** Load the tree, then restore last session's tabs — or open the home note
   *  for fresh visitors (no tabs remembered in localStorage) — and then the
   *  launch door, if the owner set one. */
  const enterVault = async (): Promise<void> => {
    await restoreSession();
    openLaunchDoor();
  };

  const restoreSession = async (): Promise<void> => {
    await get().loadTree();
    const tree = get().tree;
    const existing = new Set(collectNotes(tree).map((n) => n.path));
    // The workspace first, `astrolabe.tabs` as the fallback — which is what makes
    // the upgrade invisible: an instance that has never seen this build has no
    // workspace key, and its tab list becomes a one-pane workspace holding
    // exactly the notes it had open. Nobody's session is spent on the upgrade.
    let restored = readStoredWorkspace();
    const stored = readStoredTabs();
    if (restored === null && stored === null && IS_DESKTOP && get().admin) {
      // Nothing in this origin's storage: a desktop window on a new port.
      // The copy beside the vault is what this window was showing last.
      try {
        const backup = (await api.getWorkspaceState()).workspace;
        if (backup !== null) restored = parseWorkspace(backup);
      } catch {
        // no backup yet, or a build without the route: the fallbacks below
      }
    }
    const ws = restored ?? (stored === null ? null : fromStoredTabs(stored));
    if (ws !== null) {
      // A note in the stored workspace may have been deleted, renamed or hidden
      // while this browser was closed. Pruning here rather than at parse time
      // keeps the model pure and total: `client/workspace.ts` knows about tabs,
      // not about which of them still exist.
      const pruned = pruneWorkspace(ws, existing);
      if (allPaths(pruned).length > 0) {
        // The stored reading preference is a DEVICE preference and the pane is
        // where it now lives, so boot carries it across — otherwise a reader who
        // left in reading view comes back to the editor.
        get().commitWorkspace(
          readReading() ? setPaneModeIn(pruned, pruned.focus, "reading") : pruned,
        );
        void get().refreshBacklinks();
        return;
      }
    }
    const home = get().homeNote;
    // A deep link in the address bar outranks the home note — the router
    // applies it right after bootstrap (client/router.ts).
    const deepLinked = location.pathname !== "/" && location.pathname !== "/graph";
    if (deepLinked) return;
    if (home) {
      const path = resolveLink(home, tree);
      if (path) {
        get().openNote(path);
        return;
      }
      console.warn(`astrolabe: home note "${home}" not found in the vault`);
    }
    // FIRST RUN (v1.8 audit, F1). No session to restore and no home note set,
    // and the app opened onto "The vault is open." with the seed's guide
    // sitting in the tree behind it — the one moment a new reader has nothing
    // of their own to come back to is the one moment we showed them nothing.
    // The guide first, then whatever note the vault does have.
    //
    // ADMIN ONLY, deliberately. A visitor's landing is the site — the blog, or
    // the empty shell — and opening somebody's first published file at them
    // because the owner set no home note is a guess made in public. The owner's
    // own guess is `homeNote`, and it is honoured above for everyone.
    if (!get().admin) return;
    const notes = collectNotes(tree);
    if (notes.length === 0) return;
    // The note the reader was in most recently, before the seed guide, before
    // the first name in the tree — "the app keeps opening on 1T-SRAM" was a
    // vault whose first note sorts first and a window with nothing to restore.
    const recent = recentNotes(tree, { limit: 1 })[0];
    const guide = resolveLink(SEED_GUIDE, tree);
    get().openNote(recent ?? guide ?? notes[0].path);
  };

  const ctx: StoreCtx = { initialTheme, enterVault, restoreSession, openLaunchDoor };
  return {
    ...fieldsSlice(set, get, ctx),
    ...sessionSlice(set, get, ctx),
    ...workspaceSlice(set, get),
    ...prefsSlice(set, get),
    ...notesSlice(set, get),
  };
});

// Remember open tabs across reloads (their absence marks a fresh visitor,
// who gets the home note instead). Persist only after the session restored,
// so a slow boot never clobbers the stored tabs with the empty initial state.
useStore.subscribe((s, prev) => {
  if (!s.authReady) return;
  // The phone shell keeps its one-note workspace to itself (see phoneShell).
  if (!workspacePersists()) return;
  if (s.workspace !== prev.workspace) persistWorkspace(s.workspace);
  if (s.openTabs !== prev.openTabs || s.openPath !== prev.openPath) {
    // `astrolabe.tabs` is still written, and deliberately: it costs a few bytes
    // and buys a downgrade that does not strand anyone. A build without panes
    // still finds a session it understands.
    persistTabs(s.openTabs, s.openPath);
  }
});

/** THE FIRST PAINT SEES THE VAULT'S PREFERENCES.
 *
 *  Everything above read vim, relative lines, reading mode, the sidebar's
 *  side, the editor language and the theme from localStorage when this module
 *  was EVALUATED — and imports hoist, so that is before `pullPrefs()` in
 *  main.tsx has answered. A fresh device therefore painted its own defaults
 *  on the first load and the vault's on the second (measured: the sidebar on
 *  the wrong edge once, then right). main.tsx calls this after the pull and
 *  before `createRoot`, only when the pull changed a key: the same readers,
 *  run again, into the store nothing has rendered from yet. `sidebarSide`
 *  resolves against the boot default the way the initial state did; loadMe()
 *  settles it against the instance language the same way it always has. */
export function reloadPrefsFromStorage(): void {
  const theme = readTheme();
  if (theme !== useStore.getState().theme) applyTheme(theme);
  const pref = readSidebarSidePref();
  useStore.setState({
    theme,
    vimMode: readVim(),
    relativeLines: readRelativeLines(),
    readingMode: readReading(),
    sidebarSidePref: pref,
    sidebarSide: effectiveSide(pref, useStore.getState().language),
    editorLangPref: readEditorLang(),
  });
}
