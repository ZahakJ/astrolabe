// THE PHONE SHELL — Astrolabe designed for the device in the hand.
//
// client/main.tsx mounts this INSTEAD of App.tsx wherever PHONE_SHELL_QUERY
// matches (client/shellQuery.ts): a phone, a tablet with no mouse, a window
// dragged narrower than 700px. It shares everything below the chrome with the
// desktop — the store, the API layer, the dictionary, the editor, the reading
// view and every other surface — and none of the chrome: no tab strip, no
// panes or grips, no status bar, no sidebar drawer. The owner, 3.24: "I almost
// wish to rewrite that whole side of the app to be natively designed for the
// phone and tablet form factor instead of trying to retrofit what we have
// here." This is that side, and it is a frame, not a rewrite: the parts the
// audit measured as good on a phone are mounted as they are.
//
// THE PARTS:
//   · a navigation stack per bottom tab, synced to history (./nav.ts), so the
//     OS back gesture pops a screen and closes a sheet before it pops one;
//   · the bottom tab bar — Today, Notes, Search, Calendar, More — or, on a
//     tablet, the same five as a rail beside a list column and the note;
//   · sheets for everything that was a dialog (./Sheet.tsx), each with a
//     history entry and the page under it inert;
//   · the store collapsed to one pane holding one tab while this is mounted,
//     and never persisted (state.ts `setPhoneShellMode`), so a desktop's
//     eleven tabs survive a morning on the phone.
//
// ROUND 2 (3.27.0): EVERY SURFACE HAS A PHONE SHAPE. Orbits, Sigils and the
// Media page are lists that push a detail (./screens/OrbitsScreen.tsx and its
// siblings), a study session and a book take the whole glass with chrome of
// their own, Settings is a list of sections each pushed as a screen with its
// own Save, and only the graph and a drawing are still drawn by the pane's
// switch under a top bar (./screens/SurfaceScreen.tsx). Every layer that
// mounts itself on <body> — the theme picker, the designer, the what's-new
// deck, the tour, the attachment viewer — announces itself
// (client/overlays.ts) and takes a history entry, so Back closes it.
//
// THE STORE AND THE STACK ARE KEPT IN STEP IN BOTH DIRECTIONS, and neither
// direction is allowed to echo. A tap on a row pushes a screen and opens its
// content in the store; a wikilink, a palette command, a calendar day or the
// daily note opens content in the store and pushes the screen for it. The
// `applying` flag is what stops the second from answering the first.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { isDrawingPath } from "../../shared/noteFormat.ts";
import SiteMark from "../components/SiteMark.tsx";
import { useGlobalKeys } from "../globalKeys.ts";
import { t } from "../i18n.ts";
import { lazySurface } from "../lazySurface.tsx";
import { useOffline } from "../offline.ts";
import OfflineStrip from "../components/OfflineStrip.tsx";
import PreviewBanner from "../components/PreviewBanner.tsx";
import TemplatePicker from "../components/TemplatePicker.tsx";
import { confirmModal } from "../components/Confirm.tsx";
import { overlaysUp, subscribeOverlays, type Overlay } from "../overlays.ts";
import { applyUrl, notePathToUrl, orbitsUrl } from "../router.ts";
import { urlForBooksRoute } from "../books/door.ts";
import { useShellRuntime } from "../shellRuntime.ts";
import { TABLET_QUERY } from "../shellQuery.ts";
import { useStore, type State } from "../state.ts";
import {
  activeTabOf,
  isBookPath,
  isGraphTab,
  isMediaTab,
  isOrbitsTab,
  isReviewWeekTab,
  isFeedsTab,
  FEEDS_TAB,
  isSigilsTab,
  isTimelineTab,
  MEDIA_TAB,
  orbitsSessionOf,
  ORBITS_TAB,
  paneAt,
  SIGILS_TAB,
  surfaceOf,
  type Workspace,
} from "../workspace.ts";
import ActionSheet from "./ActionSheet.tsx";
import { ACTION_SHEET, LIST_SHEET, MOVE_SHEET, NOTE_SHEET, TAG_SHEET } from "./sheetIds.ts";
import ConfirmSheetHost from "./ConfirmSheet.tsx";
import { PhoneContext, type LeaveGuard, type OpenHow, type PhoneApi, type SheetData } from "./context.ts";
import { contentOf, isDetail, isFull, isList } from "./kinds.ts";
import { hardwareKeyboardSeen, installHardwareKeyboardWatch, subscribeHardwareKeyboard } from "./hardwareKeyboard.ts";
import { createNav, sameScreen, screenKey, topOf, type Nav, type NavCause, type NavState, type Screen, type TabId } from "./nav.ts";
import { chainTo, upChain } from "./up.ts";
import ColumnGrip from "./ColumnGrip.tsx";
import TabBar from "./TabBar.tsx";
import { screenTitle } from "./titles.ts";
import "./phone.css";

const TodayScreen = lazySurface(() => import("./screens/TodayScreen.tsx"));
const NotesScreen = lazySurface(() => import("./screens/NotesScreen.tsx"));
const SearchScreen = lazySurface(() => import("./screens/SearchScreen.tsx"));
const CalendarScreen = lazySurface(() => import("./screens/CalendarScreen.tsx"));
const MoreScreen = lazySurface(() => import("./screens/MoreScreen.tsx"));
const TagScreen = lazySurface(() => import("./screens/TagScreen.tsx"));
const NoteScreen = lazySurface(() => import("./screens/NoteScreen.tsx"));
const SurfaceScreen = lazySurface(() => import("./screens/SurfaceScreen.tsx"));
// Round 2's own screens. Each its own chunk: a reader who never opens the
// decks never downloads them, and none of them is in the first paint.
const SettingsScreen = lazySurface(() => import("./screens/SettingsScreen.tsx"));
const SettingsSectionScreen = lazySurface(() => import("./screens/SettingsSectionScreen.tsx"));
const OrbitsScreen = lazySurface(() => import("./screens/OrbitsScreen.tsx"));
const DeckScreen = lazySurface(() => import("./screens/DeckScreen.tsx"));
const SessionScreen = lazySurface(() => import("./screens/SessionScreen.tsx"));
const SigilsScreen = lazySurface(() => import("./screens/SigilsScreen.tsx"));
const SigilScreen = lazySurface(() => import("./screens/SigilScreen.tsx"));
const MediaScreen = lazySurface(() => import("./screens/MediaScreen.tsx"));
const TrackerScreen = lazySurface(() => import("./screens/TrackerScreen.tsx"));
const LibraryScreen = lazySurface(() => import("./screens/LibraryScreen.tsx"));
const ReaderScreen = lazySurface(() => import("./screens/ReaderScreen.tsx"));
const ReviewScreen = lazySurface(() => import("./screens/ReviewScreen.tsx"));
const FeedsScreen = lazySurface(() => import("./screens/FeedsScreen.tsx"));
const FeedItemScreen = lazySurface(() => import("./screens/FeedItemScreen.tsx"));
const TimelineScreen = lazySurface(() => import("./screens/TimelineScreen.tsx"));
const TagPickerSheet = lazySurface(() => import("./TagPickerSheet.tsx"));
const ListSheet = lazySurface(() => import("./ListSheet.tsx"));
// The note sheet and the move sheet reach the outline, the section surgery,
// the twins and the move rules: a first paint that has opened no note has no
// business carrying them (check-bundle's phone audience).
const NoteSheet = lazySurface(() => import("./NoteSheet.tsx"));
const MoveSheet = lazySurface(() => import("./MoveSheet.tsx"));
// Read aloud (docs/read-aloud.md): the chip under a selection (the editor's too, here) and the
// floating player — the same layer the desktop mounts, styled for the phone
// in phone.css.
const SpeechLayer = lazySurface(() => import("../speech/SpeechLayer.tsx"));

// The store's own modal surfaces, as the desktop mounts them (App.tsx), each
// behind its flag. On a phone they are LAYERS: each takes a history entry, so
// Back closes it the way its own ✕ does. Settings is not among them any more:
// on a phone it is a list of pushed screens (./screens/SettingsScreen.tsx),
// and `settingsOpen` rising is answered by pushing it.
const CommandPalette = lazySurface(() => import("../components/CommandPalette.tsx"));
const TrashModal = lazySurface(() => import("../components/TrashModal.tsx"));
const ImportDialog = lazySurface(() => import("../import/ImportDialog.tsx"));
const CaptureSheet = lazySurface(() => import("../components/CaptureSheet.tsx"));
const AskPanel = lazySurface(() => import("../components/AskPanel.tsx"));
const ShortcutsHelp = lazySurface(() => import("../components/ShortcutsHelp.tsx"));
const BannerModal = lazySurface(() => import("../components/BannerModal.tsx"));
const ModerationPanel = lazySurface(() => import("../components/ModerationPanel.tsx"));
const UnusedAttachmentsModal = lazySurface(() => import("../components/UnusedAttachmentsModal.tsx"));
const LoginModal = lazySurface(() => import("../components/LoginModal.tsx"));
const EditorAnnotator = lazySurface(() => import("../annotations/EditorAnnotator.tsx"));

/** A store flag that raises a layer, and how to lower it. */
interface Layer {
  id: string;
  up: (s: State) => boolean;
  down: (s: State) => void;
}

const LAYERS: Layer[] = [
  { id: "trash", up: (s) => s.trashOpen, down: (s) => s.setTrashOpen(false) },
  { id: "import", up: (s) => s.importFolder !== null, down: (s) => s.closeImport() },
  { id: "palette", up: (s) => s.paletteOpen, down: (s) => s.setPaletteOpen(false) },
  { id: "capture", up: (s) => s.captureOpen, down: (s) => s.setCaptureOpen(false) },
  { id: "ask", up: (s) => s.askOpen, down: (s) => s.setAskOpen(false) },
  { id: "shortcuts", up: (s) => s.shortcutsOpen, down: (s) => s.setShortcutsOpen(false) },
  { id: "login", up: (s) => s.loginOpen, down: (s) => s.setLoginOpen(false) },
  { id: "banner", up: (s) => s.bannerModalOpen, down: (s) => s.setBannerModalOpen(false) },
  { id: "moderation", up: (s) => s.moderationOpen, down: (s) => s.setModerationOpen(false) },
  { id: "unused", up: (s) => s.unusedOpen, down: (s) => s.setUnusedOpen(false) },
];
const layerSheet = (id: string): string => `layer:${id}`;
const overlaySheet = (id: string): string => `overlay:${id}`;

/** Sheets this shell draws itself, which need their data to draw. */
const DATA_SHEETS = new Set([ACTION_SHEET, MOVE_SHEET, TAG_SHEET, LIST_SHEET]);
/** How long a leaving sheet stays mounted for its exit. */
const LEAVE_MS = 240;

/** The desktop pages that are a bottom tab here rather than a screen. */
type RootTab = "calendar" | "today";

/** The content the store is showing, as a screen: what a wikilink, the
 *  palette or the daily note just opened. "calendar" is the Calendar TAB and
 *  "today" the Today tab: the desktop's `~calendar` and `~today` pages are
 *  roots of the bottom bar here, never pushed screens. */
export function screenOfWorkspace(ws: Workspace): Screen | RootTab | null {
  const pane = paneAt(ws, ws.focus);
  if (pane === null) return null;
  const surface = surfaceOf(pane);
  const tab = activeTabOf(pane);
  switch (surface) {
    case "empty":
      return null;
    case "library":
      return { kind: "surface", tab: "~library" };
    case "calendar":
      return "calendar";
    case "today":
      return "today";
    case "edit":
    case "reading":
      return tab ? { kind: "note", path: tab.path } : null;
    default:
      return tab ? { kind: "surface", tab: tab.path } : null;
  }
}

/** A key for "what is showing" that a mode flip (edit ↔ read) does not change. */
function contentKey(ws: Workspace): string {
  const pane = paneAt(ws, ws.focus);
  if (pane === null) return "";
  if (pane.mode === "library") return "~library";
  return activeTabOf(pane)?.path ?? "";
}

/** The address a screen shows. Lists have none of their own; a note, a book
 *  and every surface keep the permalink the desktop gives them. */
export function urlForScreen(screen: Screen, tab: TabId): string | null {
  switch (screen.kind) {
    case "note":
      return notePathToUrl(screen.path);
    case "surface": {
      const s = screen.tab;
      if (s === "~library") return urlForBooksRoute({ kind: "library" });
      if (isBookPath(s)) return urlForBooksRoute({ kind: "book", path: s });
      if (isGraphTab(s)) return "/graph";
      if (isMediaTab(s)) return "/media";
      if (isSigilsTab(s)) return "/sigils";
      if (isReviewWeekTab(s)) return "/review-week";
      if (isFeedsTab(s)) return "/feeds";
      if (isTimelineTab(s)) return "/timeline";
      if (isOrbitsTab(s)) {
        const session = orbitsSessionOf(s);
        return orbitsUrl(session?.path ?? null, session?.section ?? null);
      }
      return notePathToUrl(s);
    }
    case "root":
      return tab === "calendar" ? "/calendar" : "/";
    case "deck":
      return orbitsUrl(null, null);
    case "sigil":
      return "/sigils";
    case "tracker":
      return "/media";
    case "feed-item":
      return "/feeds";
    case "settings":
      // Settings has no address of its own on either shell; the bar keeps
      // whatever it showed, as a list does.
      return null;
    default:
      return "/";
  }
}

/** Bring the store to the screen the stack is showing. */
function applyScreen(screen: Screen): void {
  const s = useStore.getState();
  const pane = paneAt(s.workspace, s.workspace.focus);
  const here = pane === null ? null : activeTabOf(pane)?.path ?? null;
  const library = pane?.mode === "library";
  if (screen.kind === "note") {
    if (library) s.closeLibrary();
    if (here !== screen.path || library) s.openNote(screen.path);
    return;
  }
  if (screen.kind === "deck" || screen.kind === "sigil" || screen.kind === "tracker") {
    // A detail over one of the three pages keeps the store on that page, so
    // what the store says is showing and what is on the glass agree.
    const page = screen.kind === "deck" ? ORBITS_TAB : screen.kind === "sigil" ? SIGILS_TAB : MEDIA_TAB;
    if (here === page && !library) return;
    if (library) s.closeLibrary();
    if (screen.kind === "deck") s.openOrbits(null);
    else s.setView(screen.kind === "sigil" ? "sigils" : "media");
    return;
  }
  if (screen.kind === "feed-item") {
    // The reader over Feeds keeps the store on the Feeds tab, as a tracker
    // keeps it on Media.
    if (here === FEEDS_TAB && !library) return;
    if (library) s.closeLibrary();
    s.setView("feeds");
    return;
  }
  if (screen.kind !== "surface") return;
  const tab = screen.tab;
  if (tab === "~library") {
    if (!library) s.openLibrary();
    return;
  }
  if (here === tab && !library) return;
  if (isBookPath(tab)) s.openBook(tab);
  else if (isGraphTab(tab)) s.setView("graph");
  else if (isMediaTab(tab)) s.setView("media");
  else if (isSigilsTab(tab)) s.setView("sigils");
  else if (isReviewWeekTab(tab)) s.setView("review-week");
  else if (isFeedsTab(tab)) s.setView("feeds");
  else if (isTimelineTab(tab)) s.setView("timeline");
  else if (isOrbitsTab(tab)) {
    const session = orbitsSessionOf(tab);
    s.openOrbits(session?.path ?? null, session?.section ?? null);
  } else if (isDrawingPath(tab)) {
    if (library) s.closeLibrary();
    s.openNote(tab);
  }
}

/** Where the stack is kept across a reload: sessionStorage (this tab of the
 *  browser, this origin), under the vault's own name — two vaults opened in
 *  one tab (the pocket, then another repository) never inherit each other's
 *  folders. */
function navKey(): string {
  return `astrolabe.phone-nav:${useStore.getState().siteName}`;
}

function readSavedNav(): string | null {
  try {
    return sessionStorage.getItem(navKey());
  } catch {
    return null;
  }
}

function useMatch(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

/** Warm the editor's chunks while the reader is still choosing a note, so the
 *  first open is not also the first download. The audit measured 351–995ms
 *  of long tasks on the first note switch and 560–1,317ms on the first scroll
 *  or keystroke after it — all of it the first touch of a chunk. */
function preloadWhenIdle(): () => void {
  const idle = (cb: () => void): number =>
    typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(cb, { timeout: 4000 }) : window.setTimeout(cb, 1500);
  const cancel = (id: number): void => (typeof window.cancelIdleCallback === "function" ? window.cancelIdleCallback(id) : window.clearTimeout(id));
  const steps: (() => Promise<unknown>)[] = [
    () => import("./screens/NoteScreen.tsx"),
    () => import("../components/Editor.tsx"),
    () => import("../reading/ReadingView.tsx"),
    () => import("../editor/livePreview.ts"),
    () => import("../editor/sectioning.ts"),
    () => import("../reading/renderNote.ts"),
    () => import("../reading/toc.ts"),
    () => import("./screens/NotesScreen.tsx"),
    () => import("./screens/SearchScreen.tsx"),
    () => import("./NoteSheet.tsx"),
  ];
  let id = 0;
  let dead = false;
  const next = (): void => {
    const step = steps.shift();
    if (!step || dead) return;
    id = idle(() => {
      void step()
        .catch(() => {})
        .finally(next);
    });
  };
  id = idle(next);
  return () => {
    dead = true;
    cancel(id);
  };
}

function Loading() {
  return <div className="s-ph-screen s-ph-screen--loading" aria-hidden="true" />;
}

export default function PhoneShell() {
  useShellRuntime();
  const authReady = useStore((s) => s.authReady);
  const admin = useStore((s) => s.admin);
  const tree = useStore((s) => s.tree);
  const locked = useStore((s) => !s.admin && !s.publicReads);
  const lang = useStore((s) => s.language);
  const zen = useStore((s) => s.zen);
  const previewVisitor = useStore((s) => s.previewVisitor);
  const offline = useOffline();
  const flags = {
    trash: useStore((s) => s.trashOpen),
    import: useStore((s) => s.importFolder !== null),
    palette: useStore((s) => s.paletteOpen),
    capture: useStore((s) => s.captureOpen),
    ask: useStore((s) => s.askOpen),
    shortcuts: useStore((s) => s.shortcutsOpen),
    login: useStore((s) => s.loginOpen),
    banner: useStore((s) => s.bannerModalOpen),
    moderation: useStore((s) => s.moderationOpen),
    unused: useStore((s) => s.unusedOpen),
  };
  const tablet = useMatch(TABLET_QUERY);
  const keyboard = useSyncExternalStore(subscribeHardwareKeyboard, hardwareKeyboardSeen, () => false);

  const [navState, setNavState] = useState<NavState | null>(null);
  const [cause, setCause] = useState<NavCause>("start");
  const [leaving, setLeaving] = useState<string[]>([]);
  const sheetData = useRef(new Map<string, SheetData>());
  const applying = useRef(false);
  const shownLayers = useRef(new Set<string>());
  const navRef = useRef<Nav | null>(null);
  /** The one screen that may refuse to be left (a Settings section with
   *  unsaved edits), and whether a question about it is already on screen. */
  const guardRef = useRef<(LeaveGuard & { key: string; released: boolean }) | null>(null);
  const asking = useRef(false);
  /** Layers on <body> that took an entry (client/overlays.ts). */
  const shownOverlays = useRef(new Map<string, Overlay>());
  const prevSheets = useRef<string[]>([]);
  const appRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const colsRef = useRef<HTMLDivElement | null>(null);
  const listColRef = useRef<HTMLDivElement | null>(null);
  const detailColRef = useRef<HTMLDivElement | null>(null);

  // ── the navigation, once ─────────────────────────────────────────────────
  if (navRef.current === null) {
    navRef.current = createNav({
      history: window.history,
      urlFor: urlForScreen,
      onChange: (st, why) => onNavChangeRef.current(st, why),
      // THE STACK SURVIVES A RELOAD (nav.ts `resume`): written on every
      // change, read once at start. A private window that refuses storage
      // loses only this.
      persist: (snap) => {
        try {
          sessionStorage.setItem(navKey(), JSON.stringify(snap));
        } catch {
          /* storage refused or full: a reload starts at Today, as before */
        }
      },
      // The list a push leaves: the stage's scroller on a phone, the list
      // column's on a tablet (where the list stays mounted anyway).
      scrollOf: () => document.querySelector<HTMLElement>(".s-ph-stage .s-ph-scroll")?.scrollTop ?? null,
      canLeave: (from, to) => {
        const g = guardRef.current;
        if (g === null || g.released || !g.dirty()) return true;
        if (screenKey(topOf(from)) !== g.key) return true;
        return screenKey(topOf(to)) === g.key && from.tab === to.tab;
      },
      onBlocked: (proceed) => {
        const g = guardRef.current;
        if (g === null || asking.current) return;
        asking.current = true;
        void confirmModal({ title: t("closeUnsavedTitle"), body: t("closeUnsavedBody"), confirmLabel: t("discardChanges") }).then((ok) => {
          asking.current = false;
          if (!ok) return;
          g.released = true;
          g.discard();
          proceed();
        });
      },
    });
  }
  const nav = navRef.current;

  const onNavChangeRef = useRef<(st: NavState, why: NavCause) => void>(() => {});
  onNavChangeRef.current = (st, why) => {
    setNavState({ ...st, stacks: { ...st.stacks }, sheets: [...st.sheets] });
    setCause(why);
    const top = topOf(st);
    // The store follows the stack.
    applying.current = true;
    try {
      applyScreen(top);
    } finally {
      applying.current = false;
    }
    const site = useStore.getState().siteName;
    document.title = `${screenTitle(top)} · ${site}`;
    // Sheets that left: animate them out, then forget their data.
    const gone = prevSheets.current.filter((id) => !st.sheets.includes(id));
    prevSheets.current = [...st.sheets];
    if (gone.length > 0) {
      setLeaving((l) => [...l, ...gone.filter((id) => !id.startsWith("layer:"))]);
      window.setTimeout(() => {
        setLeaving((l) => l.filter((id) => !gone.includes(id)));
        for (const id of gone) if (!nav.state().sheets.includes(id)) sheetData.current.delete(id);
      }, LEAVE_MS);
    }
    // A data sheet restored by Forward, with nothing to draw: step over it.
    const inner = st.sheets[st.sheets.length - 1];
    if (inner !== undefined && DATA_SHEETS.has(inner) && !sheetData.current.has(inner)) nav.closeSheet(inner);
    // An overlay whose entry went (Back): close it the way its own ✕ does.
    // One that stays up (the designer asking about an unsaved design) takes
    // its entry back.
    for (const [id, overlay] of [...shownOverlays.current]) {
      if (st.sheets.includes(overlaySheet(id))) continue;
      shownOverlays.current.delete(id);
      overlay.close();
      window.setTimeout(() => {
        if (overlaysUp().some((o) => o === overlay) && !nav.state().sheets.includes(overlaySheet(id))) {
          shownOverlays.current.set(id, overlay);
          nav.openSheet(overlaySheet(id));
        }
      }, 60);
    }
    // A layer whose entry went (Back): let it close ITSELF, the way its own
    // Escape does, and close it outright if it is still up after that.
    const s = useStore.getState();
    for (const layer of LAYERS) {
      const id = layerSheet(layer.id);
      if (st.sheets.includes(id)) {
        shownLayers.current.add(layer.id);
        continue;
      }
      if (!shownLayers.current.has(layer.id) || !layer.up(s)) continue;
      shownLayers.current.delete(layer.id);
      const target = document.activeElement ?? document.body;
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      window.setTimeout(() => {
        const now = useStore.getState();
        if (!layer.up(now)) return;
        // Still up after its own Escape: the layer ignores Escape. Close it.
        layer.down(now);
      }, 60);
    }
  };

  // ── the api every screen reaches ─────────────────────────────────────────
  const api = useMemo<PhoneApi>(() => {
    const open = (screen: Screen, how: OpenHow = "auto"): void => {
      const st = nav.state();
      if (st.sheets.length > 0) {
        nav.navigateFromSheet(screen);
        return;
      }
      const top = topOf(st);
      // On a tablet a detail picked from the list REPLACES the detail beside
      // it — unless it is a step deeper into it (a deck's session, a
      // section's row), which is asked for with `push`.
      if (how === "auto" && tablet && isDetail(screen) && isDetail(top) && !isFull(screen)) nav.replaceTop(screen);
      else nav.push(screen);
    };
    return {
      nav,
      state: navState ?? nav.state(),
      tablet,
      keyboard,
      open,
      openOn: (tab, screen) => nav.pushOn(tab, screen),
      openSheet: (id, data) => {
        if (data) sheetData.current.set(id, data);
        nav.openSheet(id);
      },
      closeSheet: (id) => nav.closeSheet(id),
      sheetData: (id) => sheetData.current.get(id),
      setGuard: (key, guard) => {
        if (guard === null) {
          if (guardRef.current?.key === key) guardRef.current = null;
          return;
        }
        guardRef.current = { ...guard, key, released: false };
      },
    };
  }, [nav, navState, tablet, keyboard]);
  const apiRef = useRef(api);
  apiRef.current = api;

  // ── start: the address bar decides the first screen ──────────────────────
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !authReady) return;
    if (tree === null && !locked) return;
    started.current = true;
    const pathname = location.pathname;
    // A RELOAD (the browser kept this entry's mark), or the app brought back
    // by the OS: the run resumes where it was, when the address agrees.
    if (!locked && nav.resume(window.history.state, readSavedNav(), pathname)) return;
    if (pathname === "/calendar") {
      nav.start("calendar");
      return;
    }
    if (pathname === "/" || pathname === "/today" || locked) {
      nav.start("today");
      return;
    }
    // A deep link: the router's own reading of the address (the same one the
    // desktop runs) opens the content in the store — BEFORE the stack takes
    // the entry over, since `start` rewrites the address to Today's. The stack
    // then pushes the screen for it one entry above the base, so Back comes
    // home to Today instead of leaving the app.
    applying.current = true;
    let known = false;
    const before = contentKey(useStore.getState().workspace);
    try {
      known = applyUrl(true);
    } finally {
      applying.current = false;
    }
    const target = screenOfWorkspace(useStore.getState().workspace);
    nav.start("today");
    if (target === "calendar") nav.switchTab("calendar");
    else if (target === "today") return;
    // Only what the address NAMED: a link the tree could not resolve is
    // being asked of the server (router.ts `probeNote`), and the store still
    // shows whatever the boot restored — which is not what was linked.
    else if (known && target !== null && (contentKey(useStore.getState().workspace) !== before || decodeURI(urlForScreen(target, "today") ?? "") === decodeURI(pathname))) nav.push(target);
  }, [authReady, tree, locked, nav]);

  // ── the store → the stack ────────────────────────────────────────────────
  useEffect(() => {
    if (navState === null) return;
    return useStore.subscribe((s, prev) => {
      if (s.lastRemap !== prev.lastRemap && s.lastRemap !== null) {
        nav.remap(s.lastRemap.from, s.lastRemap.to);
        return;
      }
      // SETTINGS IS A SCREEN HERE. Forty call sites raise the desktop's
      // dialog (`setSettingsOpen`, `openSettingsAt`); on a phone that flag is
      // answered by pushing the Settings list — which carries the row asked
      // for (`settingsFocus`) on to its section — and lowered at once.
      if (s.settingsOpen && !prev.settingsOpen) {
        useStore.setState({ settingsOpen: false });
        const top = topOf(nav.state());
        if (!(top.kind === "settings" && top.section === "" && s.settingsFocus === null)) apiRef.current.open({ kind: "settings", section: "" }, "push");
        return;
      }
      // Layers first: a flag that rose takes an entry; one that fell by its
      // own ✕ gives its entry back.
      for (const layer of LAYERS) {
        const was = layer.up(prev);
        const is = layer.up(s);
        if (is && !was) apiRef.current.openSheet(layerSheet(layer.id));
        else if (!is && was) {
          shownLayers.current.delete(layer.id);
          if (nav.state().sheets.includes(layerSheet(layer.id))) nav.closeSheet(layerSheet(layer.id));
        }
      }
      if (applying.current) return;
      if (contentKey(s.workspace) === contentKey(prev.workspace)) return;
      const target = screenOfWorkspace(s.workspace);
      const top = topOf(nav.state());
      if (target === null) {
        // What was on screen closed under us (deleted, unpublished): leave it.
        if (isDetail(top)) nav.popScreen();
        return;
      }
      if (target === "calendar" || target === "today") {
        nav.switchTab(target);
        return;
      }
      if (sameScreen(top, target)) return;
      // A surface that closed ITSELF back to a page the stack already holds
      // (a session's "back to the shelf" reopens the decks): go back down to
      // the screen showing that page — the deck it was started from — rather
      // than pushing a second copy of the page on top.
      const want = target.kind === "surface" ? target.tab : target.kind === "note" ? target.path : null;
      if (want !== null) {
        const stack = nav.state().stacks[nav.state().tab];
        for (let i = stack.length - 2; i >= 0; i -= 1) {
          if (contentOf(stack[i]) === want) {
            if (nav.popTo(stack[i])) return;
            break;
          }
        }
      }
      apiRef.current.open(target);
    });
    // Installed once the stack has started; `navState` flips from null once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navState === null, nav]);

  // ── history → the stack ──────────────────────────────────────────────────
  useEffect(() => {
    const onPop = (e: PopStateEvent): void => {
      if (nav.onPop(e.state) === "restored") return;
      // Not one of ours: a hash jump, or a chip that pushed a route and fired
      // popstate (the Orbits chip does). Read the address the way the desktop
      // router would, and stamp the entry with the screen it names.
      applying.current = true;
      try {
        applyUrl();
      } finally {
        applying.current = false;
      }
      const target = screenOfWorkspace(useStore.getState().workspace);
      nav.adoptForeign(target === "calendar" || target === "today" || target === null ? null : target);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [nav]);

  // ── layers on <body> → the stack (client/overlays.ts) ────────────────────
  useEffect(() => {
    if (navState === null) return;
    return subscribeOverlays((up) => {
      const ids = new Set(up.map((o) => o.id));
      for (const o of up) {
        if (shownOverlays.current.get(o.id) === o) continue;
        shownOverlays.current.set(o.id, o);
        nav.openSheet(overlaySheet(o.id));
      }
      for (const id of [...shownOverlays.current.keys()]) {
        if (ids.has(id)) continue;
        // Closed by its own hand: give its entry back.
        shownOverlays.current.delete(id);
        if (nav.state().sheets.includes(overlaySheet(id))) nav.closeSheet(overlaySheet(id));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navState === null, nav]);

  // ── the keyboard ─────────────────────────────────────────────────────────
  useEffect(() => installHardwareKeyboardWatch(), []);
  useGlobalKeys({ phone: true, enabled: hardwareKeyboardSeen, quickSearch: () => nav.switchTab("search") });

  // ── idle warm-up and the document's own marks ────────────────────────────
  useEffect(() => (admin ? preloadWhenIdle() : undefined), [admin]);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("s-ph-doc");
    return () => root.classList.remove("s-ph-doc");
  }, []);

  // Everything under a sheet is INERT: no stray tap reaches the note, no
  // screen reader wanders behind the sheet. Set on the element rather than as
  // a prop, which this React's typings do not carry yet.
  // THE NOTE'S SHEET ANCHORS TO ITS COLUMN. On two columns a side sheet (the
  // note's ⋯, a book's contents) slides over the NOTE, not over the list: the
  // column's width is one custom property the sheet's panel and scrim read.
  useEffect(() => {
    const col = detailColRef.current;
    const shell = shellRef.current;
    if (!tablet || !col || !shell) {
      shell?.style.removeProperty("--ph-detail-w");
      return;
    }
    const ro = new ResizeObserver(() => shell.style.setProperty("--ph-detail-w", `${Math.round(col.getBoundingClientRect().width)}px`));
    ro.observe(col);
    return () => ro.disconnect();
  });

  const sheetsUp = (navState?.sheets.length ?? 0) > 0;
  useEffect(() => {
    if (appRef.current) appRef.current.inert = sheetsUp;
  }, [sheetsUp]);

  if (!authReady) return <div className="s-ph" />;

  const st = navState;
  const stack = st ? st.stacks[st.tab] : [];
  const top = stack[stack.length - 1];
  const back = (): void => nav.back();

  /** Up from the folder at `at` in the stack to folder `path` ("" = the root). */
  const upFrom = (at: number, path: string): void => {
    if (!st) return;
    nav.upTo(chainTo(stack.slice(0, at + 1), st.tab, path));
  };
  const render = (screen: Screen, withBack: boolean, backOverride?: () => void, at = stack.length - 1): ReactNode => {
    const onBack = backOverride ?? (withBack ? back : undefined);
    switch (screen.kind) {
      case "root":
        switch (screen.tab) {
          case "today":
            return <TodayScreen />;
          case "notes":
            return <NotesScreen path="" />;
          case "search":
            return <SearchScreen />;
          case "calendar":
            return <CalendarScreen />;
          case "more":
            return <MoreScreen />;
        }
        return null;
      case "folder":
        // BACK MEANS UP: a folder's ‹ is its parent by path (./up.ts), never
        // merely the browser's back, which may be another tab's entry.
        return (
          <NotesScreen
            key={screen.path}
            path={screen.path}
            onBack={() => {
              const chain = st ? upChain(stack.slice(0, at + 1), st.tab) : null;
              if (chain) nav.upTo(chain);
              else back();
            }}
            onUp={(p) => upFrom(at, p)}
          />
        );
      case "tag":
        return <TagScreen key={screen.tag} tag={screen.tag} onBack={back} />;
      case "note":
        return <NoteScreen key={screen.path} path={screen.path} onBack={back} />;
      case "surface": {
        const tab = screen.tab;
        if (isOrbitsTab(tab)) return orbitsSessionOf(tab) === null ? <OrbitsScreen onBack={onBack} /> : <SessionScreen key={tab} tab={tab} onBack={back} />;
        if (isSigilsTab(tab)) return <SigilsScreen onBack={onBack} />;
        if (isMediaTab(tab)) return <MediaScreen onBack={onBack} />;
        if (tab === "~library") return <LibraryScreen onBack={onBack} />;
        if (isBookPath(tab)) return <ReaderScreen key={tab} tab={tab} onBack={back} />;
        if (isReviewWeekTab(tab)) return <ReviewScreen onBack={back} />;
        if (isFeedsTab(tab)) return <FeedsScreen onBack={onBack} />;
        if (isTimelineTab(tab)) return <TimelineScreen onBack={back} />;
        return <SurfaceScreen key={tab} tab={tab} onBack={back} />;
      }
      case "settings":
        return screen.section === "" ? <SettingsScreen onBack={onBack} /> : <SettingsSectionScreen key={screen.section} section={screen.section} onBack={back} />;
      case "deck":
        return <DeckScreen key={screen.path} path={screen.path} onBack={back} />;
      case "sigil":
        return <SigilScreen key={`${screen.path}#${screen.index}`} path={screen.path} index={screen.index} onBack={back} />;
      case "tracker":
        return <TrackerScreen key={`${screen.path}#${screen.index}`} path={screen.path} index={screen.index} onBack={back} />;
      case "feed-item":
        return <FeedItemScreen key={`${screen.feed}\u0000${screen.guid}`} feed={screen.feed} guid={screen.guid} onBack={back} />;
    }
  };

  let body: ReactNode;
  if (locked) {
    body = (
      <div className="s-ph-screen s-ph-locked">
        <SiteMark size={44} className="s-ph-locked__mark" />
        <p className="s-ph-locked__title">{t("vaultPrivate")}</p>
        <button type="button" className="s-ph-btn s-ph-btn--accent" onClick={() => useStore.getState().setLoginOpen(true)}>
          {t("signIn")}
        </button>
      </div>
    );
  } else if (!st || !top) {
    body = <Loading />;
  } else if (tablet) {
    // Two columns: the deepest list of this tab's stack, and what it opened.
    // A full screen (a session, a book) takes both.
    let listAt = stack.length - 1;
    while (listAt > 0 && isDetail(stack[listAt])) listAt -= 1;
    const list = stack[listAt];
    const detail = isDetail(top) ? top : null;
    const full = detail !== null && isFull(detail);
    const wide = full || (list.kind === "root" && list.tab === "calendar" && detail === null);
    // The list keeps its ‹ while a note is open beside it: the way back up
    // the tree is the list's, not the note's (the note's own ‹ closes the
    // note). Its Back pops to the list's parent, whatever is open beside it.
    const listBack = listAt > 0 ? () => nav.popTo(stack[listAt - 1]) || nav.back() : undefined;
    // (A folder in the list column draws its own ‹, which goes up by path.)
    // The list column KEEPS ITS PLACE while the note beside it changes: it is
    // the same element whatever is open (its scroll, its open folders and its
    // lit row stay), and a grip between the two trades their widths.
    body = (
      <div ref={colsRef} className={`s-ph-cols${wide ? " s-ph-cols--wide" : ""}${full ? " s-ph-cols--full" : ""}`}>
        {full ? (
          <div className="s-ph-cols__detail" ref={detailColRef}>
            <Suspense fallback={<Loading />}>{render(detail, true)}</Suspense>
          </div>
        ) : (
          <div className="s-ph-cols__list" ref={listColRef}>
            <Suspense fallback={<Loading />}>{render(list, false, listBack, listAt)}</Suspense>
          </div>
        )}
        {!wide && <ColumnGrip cols={colsRef} list={listColRef} />}
        {!wide && (
          <div className="s-ph-cols__detail" ref={detailColRef}>
            {detail ? (
              <Suspense fallback={<Loading />}>{render(detail, true)}</Suspense>
            ) : (
              <div className="s-ph-cols__empty">
                <SiteMark size={40} />
              </div>
            )}
          </div>
        )}
      </div>
    );
  } else {
    body = (
      <Suspense fallback={<Loading />}>
        <div className={`s-ph-stage s-ph-stage--${cause}`} key={`${st.tab}:${stack.length}:${top.kind}`}>
          {render(top, stack.length > 1)}
        </div>
      </Suspense>
    );
  }

  const barShown = !tablet && !!top && isList(top) && !zen && !locked;
  const sheetIds = [...(st?.sheets ?? []), ...leaving.filter((id) => !(st?.sheets ?? []).includes(id))];
  const layerUp = (id: keyof typeof flags): boolean => flags[id];

  return (
    <PhoneContext.Provider value={api}>
      <div
        ref={shellRef}
        className={["s-ph", tablet ? "s-ph--tablet" : "s-ph--phone", zen ? "s-ph--zen" : "", barShown ? "s-ph--tabs" : "", previewVisitor || offline ? "s-ph--notice" : ""].filter(Boolean).join(" ")}
        dir={lang === "ar" ? "rtl" : "ltr"}
        data-tab={st?.tab}
      >
        <PreviewBanner />
        <OfflineStrip />
        <div className="s-ph__app" ref={appRef}>
          {tablet && !locked && !zen && <TabBar rail />}
          <main className="s-ph__main" id="s-main" aria-label={t("mainContent")}>
            {body}
          </main>
          {barShown && <TabBar />}
        </div>
        <div className="s-ph__sheets">
          {sheetIds.map((id) => {
            const out = !(st?.sheets ?? []).includes(id);
            if (id === ACTION_SHEET) return <ActionSheet key={id} leaving={out} />;
            if (id === MOVE_SHEET)
              return (
                <Suspense key={id} fallback={null}>
                  <MoveSheet leaving={out} />
                </Suspense>
              );
            if (id === NOTE_SHEET)
              return (
                <Suspense key={id} fallback={null}>
                  <NoteSheet leaving={out} />
                </Suspense>
              );
            if (id === TAG_SHEET)
              return (
                <Suspense key={id} fallback={null}>
                  <TagPickerSheet leaving={out} />
                </Suspense>
              );
            if (id === LIST_SHEET)
              return (
                <Suspense key={id} fallback={null}>
                  <ListSheet leaving={out} />
                </Suspense>
              );
            return null;
          })}
          <ConfirmSheetHost />
        </div>
        <Suspense fallback={null}>
          <SpeechLayer owner={admin && !previewVisitor} phone />
        </Suspense>
        {/* The store's own layers, as the desktop mounts them. */}
        {layerUp("palette") && (
          <Suspense fallback={null}>
            <CommandPalette />
          </Suspense>
        )}
        {layerUp("trash") && admin && (
          <Suspense fallback={null}>
            <TrashModal />
          </Suspense>
        )}
        {layerUp("import") && admin && (
          <Suspense fallback={null}>
            <ImportDialog />
          </Suspense>
        )}
        {layerUp("ask") && admin && (
          <Suspense fallback={null}>
            <AskPanel />
          </Suspense>
        )}
        {layerUp("capture") && admin && (
          <Suspense fallback={null}>
            <CaptureSheet />
          </Suspense>
        )}
        {layerUp("shortcuts") && (
          <Suspense fallback={null}>
            <ShortcutsHelp />
          </Suspense>
        )}
        {layerUp("banner") && admin && (
          <Suspense fallback={null}>
            <BannerModal />
          </Suspense>
        )}
        {layerUp("moderation") && admin && (
          <Suspense fallback={null}>
            <ModerationPanel />
          </Suspense>
        )}
        {layerUp("unused") && admin && (
          <Suspense fallback={null}>
            <UnusedAttachmentsModal />
          </Suspense>
        )}
        {layerUp("login") && (
          <Suspense fallback={null}>
            <LoginModal />
          </Suspense>
        )}
        {admin && <TemplatePicker />}
        {admin && (
          <Suspense fallback={null}>
            <EditorAnnotator />
          </Suspense>
        )}
      </div>
    </PhoneContext.Provider>
  );
}
